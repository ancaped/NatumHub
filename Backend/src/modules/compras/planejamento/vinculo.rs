//! Vínculo NF x pedido de compra (só leitura). A chave vem do ERP: cada linha de recebimento
//! (`erp_recebimentos_insumos`, Recebe_Insumos) traz nota, fornecedor, insumo e `num_registro` = nRegistro do
//! pedido que ela atendeu. Casa por nota + insumo: o código do fornecedor difere entre COMPRAS e Recebe_Insumos em
//! ~5% dos casos (ex.: D.P.V 877 x 1070), e na produção nenhuma nota+insumo se repete entre fornecedores.
//! Sem recebimento correspondente a NF fica "sem pedido": nada é adivinhado. Não grava nada.
//! (A alocação agregada da cobertura de insumos, `producao::cobertura::calc::alocar_nfs`, tem outro objetivo.)

use std::collections::HashMap;

use chrono::NaiveDate;
use sqlx::{PgPool, Row};

use crate::modules::producao::cobertura::store::{parse_data, sem_pontos};

/// Notas de entrada: as do sync de compras (`invoices`, COMPRAS1/2) mais as que só existem nos recebimentos do ERP
/// (Recebe_Insumos: nota, fornecedor, insumo, quantidade, valor e data de entrada). Cada linha tem `origem`
/// ('nf' ou 'recebimento'); a nota de recebimento não traz impostos, frete, CNPJ nem parcelas.
pub const NOTAS_CTE: &str = r#"
WITH notas AS (
    SELECT id, invoice_number, item_code, description, unit, quantity, unit_price, total_value, supplier_name, supplier_id,
           invoice_date, cfop, icms_value, ipi_value, freight_value, entry_date, carrier_name, supplier_cnpj, payment_installments,
           fte_number, fte_value, fte_carrier_name, fte_carrier_cnpj, fte_issue_date, fte_entry_date, fte_cif_fob,
           fte_serie, fte_cfop, fte_natureza, fte_icms_value, 'nf'::text AS origem
    FROM invoices
    UNION ALL
    SELECT 'rec-' || r.registro::text, r.nota_fiscal::text, r.codigo_insumo, r.descricao_insumo, r.unidade,
           r.quantidade::float8, r.valor_unitario::float8, COALESCE(r.valor_total, 0)::float8, r.fornecedor, r.cod_fornecedor::text,
           to_char(COALESCE(r.data_emissao::date, r.data_entrada), 'YYYY-MM-DD HH24:MI:SS'), NULL, NULL::float8, NULL::float8, NULL::float8,
           to_char(r.data_entrada, 'YYYY-MM-DD HH24:MI:SS'), NULL, NULL, NULL,
           NULL, NULL::float8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL::float8, 'recebimento'::text
    FROM erp_recebimentos_insumos r
    WHERE COALESCE(r.status_erp, '') <> 'CA' AND r.nota_fiscal IS NOT NULL AND r.nota_fiscal <> 0
      AND r.data_entrada >= (CURRENT_DATE - INTERVAL '48 months')::date -- mesma janela do sync de compras
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.invoice_number = r.nota_fiscal::text
                    AND (REPLACE(i.item_code, '.', '') = REPLACE(r.codigo_insumo, '.', '') OR COALESCE(i.supplier_id, '') = COALESCE(r.cod_fornecedor::text, '')))
)
"#;

#[derive(Debug, Clone)]
pub struct ItemNf {
    pub chave: usize,
    pub numero: String,
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

/// Cada recebimento vai para a primeira linha da nota com o mesmo insumo (linha repetida na nota não duplica).
pub fn vincular(nfs: &[ItemNf], recebimentos: &[Recebimento], pedidos: &[ItemPedido]) -> Vec<Vinculo> {
    let mut item_do_pedido: HashMap<(i32, &str), &ItemPedido> = HashMap::new();
    for p in pedidos {
        let e = item_do_pedido.entry((p.n_registro, p.referencia.as_str())).or_insert(p);
        if p.id < e.id {
            *e = p;
        }
    }
    let mut primeira_linha: HashMap<(&str, &str), usize> = HashMap::new();
    for nf in nfs {
        primeira_linha.entry((nf.numero.as_str(), nf.referencia.as_str())).or_insert(nf.chave);
    }
    let mut somado: HashMap<(usize, i32), f64> = HashMap::new();
    let mut ordem: Vec<(usize, i32)> = Vec::new();
    for r in recebimentos {
        let Some(&chave) = primeira_linha.get(&(r.nota.as_str(), r.referencia.as_str())) else { continue };
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
        SELECT nota_fiscal::text AS nota, codigo_insumo, num_registro,
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

    let nf_rows = sqlx::query(&format!(
        "{NOTAS_CTE} SELECT id, invoice_number, COALESCE(supplier_id, '') AS supplier_id, item_code, invoice_date FROM notas"
    ))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler notas fiscais: {e}"))?;
    let mut linhas: Vec<LinhaNf> = Vec::with_capacity(nf_rows.len());
    let mut itens: Vec<ItemNf> = Vec::with_capacity(nf_rows.len());
    for r in &nf_rows {
        let fornecedor: String = r.get::<String, _>("supplier_id").trim().to_string();
        let numero: String = r.get::<String, _>("invoice_number").trim().to_string();
        let item_code: String = r.get("item_code");
        itens.push(ItemNf { chave: linhas.len(), numero: numero.clone(), referencia: sem_pontos(&item_code) });
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

    fn nf(chave: usize, numero: &str, rf: &str) -> ItemNf {
        ItemNf { chave, numero: numero.into(), referencia: rf.into() }
    }
    fn ped(id: i32, reg: i32, rf: &str, qtde: f64, chegou: f64) -> ItemPedido {
        ItemPedido { id, n_registro: reg, referencia: rf.into(), data: None, qtde, chegou }
    }
    fn rec(nota: &str, rf: &str, reg: i32, q: f64) -> Recebimento {
        Recebimento { nota: nota.into(), referencia: rf.into(), num_registro: reg, quantidade: q }
    }

    #[test]
    fn so_o_pedido_que_o_erp_informou() {
        let pedidos = [ped(1, 26866, "A", 2000.0, 2000.0), ped(2, 2534, "A", 500.0, 500.0)];
        let v = vincular(&[nf(0, "232499", "A")], &[rec("232499", "A", 26866, 2000.0)], &pedidos);
        assert_eq!(v, vec![Vinculo { chave: 0, item_pedido_id: 1, n_registro: 26866, quantidade: 2000.0 }]);
    }

    #[test]
    fn codigo_de_fornecedor_diferente_nao_atrapalha() {
        // o ERP usa 877 em COMPRAS e 1070 em Recebe_Insumos: a chave é nota + insumo
        let pedidos = [ped(1, 26970, "A", 10.0, 10.0)];
        let v = vincular(&[nf(0, "152317", "A")], &[rec("152317", "A", 26970, 10.0)], &pedidos);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].n_registro, 26970);
    }

    #[test]
    fn sem_recebimento_ou_sem_item_no_pedido_fica_sem_pedido() {
        let pedidos = [ped(1, 10, "A", 5.0, 5.0)];
        assert!(vincular(&[nf(0, "1", "A")], &[], &pedidos).is_empty());
        assert!(vincular(&[nf(0, "1", "B")], &[rec("1", "B", 10, 5.0)], &pedidos).is_empty());
    }

    #[test]
    fn varias_linhas_do_erp_somam_e_linha_repetida_na_nota_nao_duplica() {
        let pedidos = [ped(1, 10, "A", 100.0, 100.0), ped(2, 11, "A", 100.0, 100.0)];
        let nfs = [nf(0, "9", "A"), nf(1, "9", "A")];
        let recs = [rec("9", "A", 10, 30.0), rec("9", "A", 10, 20.0), rec("9", "A", 11, 5.0)];
        let v = vincular(&nfs, &recs, &pedidos);
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].chave, v[0].n_registro, v[0].quantidade), (0, 10, 50.0));
        assert_eq!((v[1].chave, v[1].n_registro, v[1].quantidade), (0, 11, 5.0));
    }
}
