//! Vínculo NF x pedido de compra (só leitura). A chave vem do ERP: cada linha de recebimento
//! (`erp_recebimentos_insumos`, Recebe_Insumos) traz nota, fornecedor, insumo e `num_registro` = nRegistro do
//! pedido que ela atendeu. Casa por nota + fornecedor + insumo (o número da nota repete entre fornecedores).
//! Sem recebimento correspondente a NF fica "sem pedido": nada é adivinhado. Não grava nada.
//! (A alocação agregada da cobertura de insumos, `producao::cobertura::calc::alocar_nfs`, tem outro objetivo.)

use std::collections::HashMap;

use chrono::NaiveDate;
use sqlx::{PgPool, Row};

use crate::modules::producao::cobertura::store::{parse_data, sem_pontos};

#[derive(Debug, Clone)]
pub struct ItemNf {
    pub chave: usize,
    pub numero: String,
    pub fornecedor: String,
    pub referencia: String,
}

#[derive(Debug, Clone)]
pub struct ItemPedido {
    pub id: i32,
    pub n_registro: i32,
    pub referencia: String,
    pub data: Option<NaiveDate>,
    pub qtde: f64,
    pub chegou: f64,
}

/// Linha de recebimento do ERP que aponta para um pedido.
#[derive(Debug, Clone)]
pub struct Recebimento {
    pub nota: String,
    pub fornecedor: String,
    pub referencia: String,
    pub num_registro: i32,
    pub quantidade: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Vinculo {
    pub chave: usize,
    pub item_pedido_id: i32,
    pub n_registro: i32,
    pub quantidade: f64,
}

/// Cada recebimento vai para a primeira linha da nota com o mesmo fornecedor e insumo (linha repetida na nota não duplica).
pub fn vincular(nfs: &[ItemNf], recebimentos: &[Recebimento], pedidos: &[ItemPedido]) -> Vec<Vinculo> {
    let mut item_do_pedido: HashMap<(i32, &str), &ItemPedido> = HashMap::new();
    for p in pedidos {
        let e = item_do_pedido.entry((p.n_registro, p.referencia.as_str())).or_insert(p);
        if p.id < e.id {
            *e = p;
        }
    }
    let mut primeira_linha: HashMap<(&str, &str, &str), usize> = HashMap::new();
    for nf in nfs {
        primeira_linha.entry((nf.numero.as_str(), nf.fornecedor.as_str(), nf.referencia.as_str())).or_insert(nf.chave);
    }
    let mut somado: HashMap<(usize, i32), f64> = HashMap::new();
    let mut ordem: Vec<(usize, i32)> = Vec::new();
    for r in recebimentos {
        let Some(&chave) = primeira_linha.get(&(r.nota.as_str(), r.fornecedor.as_str(), r.referencia.as_str())) else { continue };
        if !item_do_pedido.contains_key(&(r.num_registro, r.referencia.as_str())) {
            continue;
        }
        let e = somado.entry((chave, r.num_registro)).or_insert_with(|| {
            ordem.push((chave, r.num_registro));
            0.0
        });
        *e += r.quantidade;
    }
    ordem.sort();
    ordem
        .into_iter()
        .filter_map(|(chave, reg)| {
            let nf = nfs.iter().find(|n| n.chave == chave)?;
            let p = item_do_pedido.get(&(reg, nf.referencia.as_str()))?;
            Some(Vinculo { chave, item_pedido_id: p.id, n_registro: reg, quantidade: somado[&(chave, reg)] })
        })
        .collect()
}

#[derive(Debug, Clone)]
pub struct LinhaNf {
    pub invoice_id: String,
    pub invoice_number: String,
    pub supplier_id: String,
    pub item_code: String,
    pub data: Option<NaiveDate>,
}

pub struct Carga {
    pub nfs: Vec<LinhaNf>,
    pub pedidos: HashMap<i32, ItemPedido>,
    pub vinculos: Vec<Vinculo>,
}

/// Lê itens de NF, recebimentos do ERP e itens de pedido (não cancelados) e calcula o vínculo de tudo de uma vez.
pub async fn carregar(pool: &PgPool) -> Result<Carga, String> {
    let rec_rows = sqlx::query(
        r#"
        SELECT nota_fiscal::text AS nota, cod_fornecedor::text AS fornecedor, codigo_insumo, num_registro,
               COALESCE(quantidade, 0)::float8 AS qtde
        FROM erp_recebimentos_insumos
        WHERE COALESCE(status_erp, '') <> 'CA' AND COALESCE(num_registro, 0) > 0
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler recebimentos do ERP: {e}"))?;
    let recebimentos: Vec<Recebimento> = rec_rows
        .iter()
        .map(|r| Recebimento {
            nota: r.get::<String, _>("nota").trim().to_string(),
            fornecedor: r.get::<Option<String>, _>("fornecedor").unwrap_or_default().trim().to_string(),
            referencia: sem_pontos(&r.get::<Option<String>, _>("codigo_insumo").unwrap_or_default()),
            num_registro: r.get("num_registro"),
            quantidade: r.get("qtde"),
        })
        .collect();

    let ped_rows = sqlx::query(
        r#"
        SELECT poi.id, po.n_registro, poi.c_referencia, po.d_pedido,
               COALESCE(poi.n_qtde, 0)::float8 AS qtde, COALESCE(poi.n_chegou, 0)::float8 AS chegou
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
        WHERE po.n_registro IN (SELECT DISTINCT num_registro FROM erp_recebimentos_insumos WHERE COALESCE(num_registro, 0) > 0)
          AND UPPER(COALESCE(po.c_status, '')) NOT IN ('C', 'CANCELADO')
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler itens de pedidos: {e}"))?;
    let pedidos_v: Vec<ItemPedido> = ped_rows
        .iter()
        .map(|r| ItemPedido {
            id: r.get("id"),
            n_registro: r.get("n_registro"),
            referencia: sem_pontos(&r.get::<Option<String>, _>("c_referencia").unwrap_or_default()),
            data: r.get::<Option<String>, _>("d_pedido").and_then(|s| parse_data(&s)),
            qtde: r.get("qtde"),
            chegou: r.get("chegou"),
        })
        .collect();

    let nf_rows = sqlx::query(
        r#"
        SELECT id, invoice_number, COALESCE(supplier_id, '') AS supplier_id, item_code, invoice_date
        FROM invoices
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler notas fiscais: {e}"))?;
    let mut linhas: Vec<LinhaNf> = Vec::with_capacity(nf_rows.len());
    let mut itens: Vec<ItemNf> = Vec::with_capacity(nf_rows.len());
    for r in &nf_rows {
        let fornecedor: String = r.get::<String, _>("supplier_id").trim().to_string();
        let numero: String = r.get::<String, _>("invoice_number").trim().to_string();
        let item_code: String = r.get("item_code");
        itens.push(ItemNf { chave: linhas.len(), numero: numero.clone(), fornecedor: fornecedor.clone(), referencia: sem_pontos(&item_code) });
        linhas.push(LinhaNf {
            invoice_id: r.get("id"),
            invoice_number: numero,
            supplier_id: fornecedor,
            item_code,
            data: r.get::<Option<String>, _>("invoice_date").and_then(|s| parse_data(&s)),
        });
    }
    let vinculos = vincular(&itens, &recebimentos, &pedidos_v);
    Ok(Carga { nfs: linhas, pedidos: pedidos_v.into_iter().map(|p| (p.id, p)).collect(), vinculos })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nf(chave: usize, numero: &str, forn: &str, rf: &str) -> ItemNf {
        ItemNf { chave, numero: numero.into(), fornecedor: forn.into(), referencia: rf.into() }
    }
    fn ped(id: i32, reg: i32, rf: &str, qtde: f64, chegou: f64) -> ItemPedido {
        ItemPedido { id, n_registro: reg, referencia: rf.into(), data: None, qtde, chegou }
    }
    fn rec(nota: &str, forn: &str, rf: &str, reg: i32, q: f64) -> Recebimento {
        Recebimento { nota: nota.into(), fornecedor: forn.into(), referencia: rf.into(), num_registro: reg, quantidade: q }
    }

    #[test]
    fn so_o_pedido_que_o_erp_informou() {
        let pedidos = [ped(1, 26866, "A", 2000.0, 2000.0), ped(2, 2534, "A", 500.0, 500.0)];
        let v = vincular(&[nf(0, "232499", "99", "A")], &[rec("232499", "99", "A", 26866, 2000.0)], &pedidos);
        assert_eq!(v, vec![Vinculo { chave: 0, item_pedido_id: 1, n_registro: 26866, quantidade: 2000.0 }]);
    }

    #[test]
    fn nota_repetida_entre_fornecedores_nao_mistura() {
        let pedidos = [ped(1, 26394, "A", 10.0, 10.0), ped(2, 500, "A", 10.0, 10.0)];
        let nfs = [nf(0, "23438", "1134", "A"), nf(1, "23438", "885", "A")];
        let recs = [rec("23438", "885", "A", 500, 10.0), rec("23438", "1134", "A", 26394, 10.0)];
        let v = vincular(&nfs, &recs, &pedidos);
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].chave, v[0].n_registro), (0, 26394));
        assert_eq!((v[1].chave, v[1].n_registro), (1, 500));
    }

    #[test]
    fn sem_recebimento_ou_sem_item_no_pedido_fica_sem_pedido() {
        let pedidos = [ped(1, 10, "A", 5.0, 5.0)];
        assert!(vincular(&[nf(0, "1", "7", "A")], &[], &pedidos).is_empty());
        assert!(vincular(&[nf(0, "1", "7", "B")], &[rec("1", "7", "B", 10, 5.0)], &pedidos).is_empty());
    }

    #[test]
    fn varias_linhas_do_erp_somam_e_linha_repetida_na_nota_nao_duplica() {
        let pedidos = [ped(1, 10, "A", 100.0, 100.0), ped(2, 11, "A", 100.0, 100.0)];
        let nfs = [nf(0, "9", "7", "A"), nf(1, "9", "7", "A")];
        let recs = [rec("9", "7", "A", 10, 30.0), rec("9", "7", "A", 10, 20.0), rec("9", "7", "A", 11, 5.0)];
        let v = vincular(&nfs, &recs, &pedidos);
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].chave, v[0].n_registro, v[0].quantidade), (0, 10, 50.0));
        assert_eq!((v[1].chave, v[1].n_registro, v[1].quantidade), (0, 11, 5.0));
    }
}
