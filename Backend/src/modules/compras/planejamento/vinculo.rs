//! Vínculo NF x pedido de compra (só leitura): para cada item de nota fiscal de entrada, acha o(s) item(ns) de
//! pedido do mesmo fornecedor e mesmo insumo que ela atende. Regra: pedido com `d_pedido <= data da NF`, pedido
//! aberto primeiro (`n_qtde > n_chegou`), mais antigo primeiro (FIFO), alocando a quantidade da NF até o que falta
//! chegar. O que sobrar vai para pedidos já fechados (mais antigos primeiro, até a quantidade pedida). Sem
//! candidato = "sem pedido". Não grava nada; a alocação agregada da cobertura de insumos
//! (`producao::cobertura::calc::alocar_nfs`) tem outro objetivo (abater chegadas futuras) e não diz qual NF atendeu qual pedido.

use std::collections::HashMap;

use chrono::NaiveDate;
use sqlx::{PgPool, Row};

use crate::modules::producao::cobertura::store::{parse_data, sem_pontos};

#[derive(Debug, Clone)]
pub struct ItemNf {
    pub chave: usize,
    pub fornecedor: String,
    pub referencia: String,
    pub data: Option<NaiveDate>,
    pub quantidade: f64,
}

#[derive(Debug, Clone)]
pub struct ItemPedido {
    pub id: i32,
    pub n_registro: i32,
    pub fornecedor: String,
    pub referencia: String,
    pub data: Option<NaiveDate>,
    pub qtde: f64,
    pub chegou: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Vinculo {
    pub chave: usize,
    pub item_pedido_id: i32,
    pub n_registro: i32,
    pub quantidade: f64,
}

const EPS: f64 = 1e-9;

pub fn vincular(nfs: &[ItemNf], pedidos: &[ItemPedido]) -> Vec<Vinculo> {
    let mut por_par: HashMap<(&str, &str), Vec<&ItemPedido>> = HashMap::new();
    for p in pedidos {
        por_par.entry((p.fornecedor.as_str(), p.referencia.as_str())).or_default().push(p);
    }
    for v in por_par.values_mut() {
        v.sort_by(|a, b| a.data.cmp(&b.data).then(a.n_registro.cmp(&b.n_registro)).then(a.id.cmp(&b.id)));
    }
    let mut ordem: Vec<&ItemNf> = nfs.iter().collect();
    ordem.sort_by(|a, b| a.data.cmp(&b.data).then(a.chave.cmp(&b.chave)));

    let mut alocado: HashMap<i32, f64> = HashMap::new();
    let mut out = Vec::new();
    for nf in ordem {
        let Some(cands) = por_par.get(&(nf.fornecedor.as_str(), nf.referencia.as_str())) else { continue };
        let elegivel = |p: &&&ItemPedido| match (p.data, nf.data) {
            (Some(dp), Some(dn)) => dp <= dn,
            (None, Some(_)) => false,
            _ => true,
        };
        let mut resta = nf.quantidade;
        // Passo 1 = abertos (capacidade = o que falta chegar); passo 2 = fechados (capacidade = quantidade pedida).
        for aberto in [true, false] {
            for p in cands.iter().filter(elegivel) {
                if resta <= EPS {
                    break;
                }
                if (p.qtde > p.chegou) != aberto {
                    continue;
                }
                let base = if aberto { p.qtde - p.chegou } else { p.qtde };
                let usado = alocado.entry(p.id).or_insert(0.0);
                let cap = (base - *usado).max(0.0);
                let q = cap.min(resta);
                if q <= EPS {
                    continue;
                }
                *usado += q;
                resta -= q;
                out.push(Vinculo { chave: nf.chave, item_pedido_id: p.id, n_registro: p.n_registro, quantidade: q });
            }
        }
    }
    out
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

/// Lê pedidos (não cancelados) e itens de NF e calcula o vínculo de tudo de uma vez (alocação consistente entre telas).
pub async fn carregar(pool: &PgPool) -> Result<Carga, String> {
    let ped_rows = sqlx::query(
        r#"
        SELECT poi.id, po.n_registro, po.n_cod_fornec, poi.c_referencia, po.d_pedido,
               COALESCE(poi.n_qtde, 0)::float8 AS qtde, COALESCE(poi.n_chegou, 0)::float8 AS chegou
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.n_pedido_registro = po.n_registro
        WHERE po.n_cod_fornec IS NOT NULL
          AND UPPER(COALESCE(po.c_status, '')) NOT IN ('C', 'CANCELADO')
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler itens de pedidos: {e}"))?;
    let mut pedidos_v: Vec<ItemPedido> = Vec::with_capacity(ped_rows.len());
    for r in &ped_rows {
        pedidos_v.push(ItemPedido {
            id: r.get("id"),
            n_registro: r.get("n_registro"),
            fornecedor: r.get::<i32, _>("n_cod_fornec").to_string(),
            referencia: sem_pontos(&r.get::<Option<String>, _>("c_referencia").unwrap_or_default()),
            data: r.get::<Option<String>, _>("d_pedido").and_then(|s| parse_data(&s)),
            qtde: r.get("qtde"),
            chegou: r.get("chegou"),
        });
    }
    let pares: std::collections::HashSet<(String, String)> =
        pedidos_v.iter().map(|p| (p.fornecedor.clone(), p.referencia.clone())).collect();

    let nf_rows = sqlx::query(
        r#"
        SELECT id, invoice_number, COALESCE(supplier_id, '') AS supplier_id, item_code, invoice_date,
               COALESCE(quantity, 0)::float8 AS qtde
        FROM invoices
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler notas fiscais: {e}"))?;
    let mut linhas: Vec<LinhaNf> = Vec::new();
    let mut itens: Vec<ItemNf> = Vec::new();
    for r in &nf_rows {
        let fornecedor: String = r.get::<String, _>("supplier_id").trim().to_string();
        let item_code: String = r.get("item_code");
        let referencia = sem_pontos(&item_code);
        if !pares.contains(&(fornecedor.clone(), referencia.clone())) {
            continue;
        }
        let data = r.get::<Option<String>, _>("invoice_date").and_then(|s| parse_data(&s));
        itens.push(ItemNf { chave: linhas.len(), fornecedor: fornecedor.clone(), referencia, data, quantidade: r.get("qtde") });
        linhas.push(LinhaNf {
            invoice_id: r.get("id"),
            invoice_number: r.get("invoice_number"),
            supplier_id: fornecedor,
            item_code,
            data,
        });
    }
    let vinculos = vincular(&itens, &pedidos_v);
    Ok(Carga { nfs: linhas, pedidos: pedidos_v.into_iter().map(|p| (p.id, p)).collect(), vinculos })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> Option<NaiveDate> {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
    }
    fn nf(chave: usize, forn: &str, rf: &str, data: &str, q: f64) -> ItemNf {
        ItemNf { chave, fornecedor: forn.into(), referencia: rf.into(), data: d(data), quantidade: q }
    }
    fn ped(id: i32, reg: i32, forn: &str, rf: &str, data: &str, qtde: f64, chegou: f64) -> ItemPedido {
        ItemPedido { id, n_registro: reg, fornecedor: forn.into(), referencia: rf.into(), data: d(data), qtde, chegou }
    }

    #[test]
    fn fifo_entre_pedidos_abertos() {
        let pedidos = [ped(1, 10, "7", "A", "2026-08-01", 100.0, 0.0), ped(2, 11, "7", "A", "2026-08-10", 100.0, 0.0)];
        let v = vincular(&[nf(0, "7", "A", "2026-09-01", 150.0)], &pedidos);
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].n_registro, v[0].quantidade), (10, 100.0));
        assert_eq!((v[1].n_registro, v[1].quantidade), (11, 50.0));
    }

    #[test]
    fn nao_vincula_pedido_posterior_nem_outro_fornecedor_ou_insumo() {
        let pedidos = [
            ped(1, 10, "7", "A", "2026-09-05", 100.0, 0.0),
            ped(2, 11, "8", "A", "2026-08-01", 100.0, 0.0),
            ped(3, 12, "7", "B", "2026-08-01", 100.0, 0.0),
        ];
        assert!(vincular(&[nf(0, "7", "A", "2026-09-01", 50.0)], &pedidos).is_empty());
    }

    #[test]
    fn aberto_antes_de_fechado_e_respeita_o_que_falta_chegar() {
        let pedidos = [ped(1, 10, "7", "A", "2026-07-01", 100.0, 100.0), ped(2, 11, "7", "A", "2026-08-01", 100.0, 70.0)];
        let v = vincular(&[nf(0, "7", "A", "2026-09-01", 50.0)], &pedidos);
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].n_registro, v[0].quantidade), (11, 30.0));
        assert_eq!((v[1].n_registro, v[1].quantidade), (10, 20.0));
    }

    #[test]
    fn nfs_em_ordem_de_data_consomem_a_capacidade_uma_vez() {
        let pedidos = [ped(1, 10, "7", "A", "2026-08-01", 100.0, 0.0)];
        let nfs = [nf(0, "7", "A", "2026-09-10", 80.0), nf(1, "7", "A", "2026-09-01", 80.0)];
        let v = vincular(&nfs, &pedidos);
        let p = |c: usize| v.iter().filter(|x| x.chave == c).map(|x| x.quantidade).sum::<f64>();
        assert_eq!(p(1), 80.0);
        assert_eq!(p(0), 20.0);
    }
}
