//! Diagnóstico da reserva de insumos: compara a reserva que o ERP informa (`stock_snapshots.reserved_qty`)
//! com a que os lotes abertos do ERP gerariam pela fórmula. Somente leitura; reaproveita os carregamentos da cobertura.

use chrono::NaiveDate;
use serde::Serialize;
use sqlx::{PgPool, Row};
use std::collections::{HashMap, HashSet};

use super::calc::{EstoqueItem, LoteErp};
use super::store;

/// Quantos lotes (os que mais reservam) aparecem por insumo.
const TOP_LOTES: usize = 5;
const LIMITE_PADRAO: usize = 50;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoteReserva {
    pub numero: String,
    pub data: NaiveDate,
    pub reserva: f64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InsumoReserva {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    pub estoque: f64,
    pub reserva_erp: f64,
    pub reserva_lotes_abertos: f64,
    /// reservaErp − reservaLotesAbertos
    pub diferenca: f64,
    pub lotes: Vec<LoteReserva>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticoReserva {
    pub lotes_abertos: usize,
    /// Lotes abertos cujos produtos não têm fórmula (não geram reserva calculada).
    pub lotes_sem_formula: usize,
    pub insumos: Vec<InsumoReserva>,
}

/// Agregação pura: reserva calculada por insumo (soma dos lotes), comparada com a do ERP.
/// Entram os insumos com reserva do ERP > 0 ou calculada > 0. Ordena por `diferenca` decrescente.
pub fn agregar(
    lotes: &[LoteErp],
    estoque: &HashMap<String, EstoqueItem>,
    codigo: Option<&str>,
    limite: usize,
) -> DiagnosticoReserva {
    let lotes_sem_formula = lotes.iter().filter(|l| l.reserva.is_empty()).count();
    let mut calculada: HashMap<&str, f64> = HashMap::new();
    for l in lotes {
        for (c, q) in &l.reserva {
            *calculada.entry(c.as_str()).or_insert(0.0) += q;
        }
    }
    let mut codigos: HashSet<&str> = calculada.keys().copied().collect();
    codigos.extend(estoque.iter().filter(|(_, e)| e.reserva > 0.0).map(|(c, _)| c.as_str()));

    let mut insumos: Vec<InsumoReserva> = codigos
        .into_iter()
        .filter(|c| codigo.map(|x| x == *c).unwrap_or(true))
        .filter_map(|c| {
            let e = estoque.get(c);
            let reserva_erp = e.map(|e| e.reserva).unwrap_or(0.0);
            let calc = calculada.get(c).copied().unwrap_or(0.0);
            if reserva_erp <= 0.0 && calc <= 0.0 {
                return None;
            }
            let mut por_lote: Vec<LoteReserva> = lotes
                .iter()
                .filter_map(|l| {
                    let r = l.reserva.get(c).copied().unwrap_or(0.0);
                    (r > 0.0).then(|| LoteReserva { numero: l.numero.clone(), data: l.data, reserva: r })
                })
                .collect();
            por_lote.sort_by(|a, b| b.reserva.partial_cmp(&a.reserva).unwrap_or(std::cmp::Ordering::Equal));
            por_lote.truncate(TOP_LOTES);
            Some(InsumoReserva {
                codigo: c.to_string(),
                descricao: e.map(|e| e.descricao.clone()).unwrap_or_default(),
                unidade: e.and_then(|e| e.unidade.clone()),
                estoque: e.map(|e| e.estoque).unwrap_or(0.0),
                reserva_erp,
                reserva_lotes_abertos: calc,
                diferenca: reserva_erp - calc,
                lotes: por_lote,
            })
        })
        .collect();
    insumos.sort_by(|a, b| {
        b.diferenca
            .partial_cmp(&a.diferenca)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.codigo.cmp(&b.codigo))
    });
    insumos.truncate(limite);
    DiagnosticoReserva { lotes_abertos: lotes.len(), lotes_sem_formula, insumos }
}

/// Carrega lotes abertos (todos, vinculados ou não), fórmulas e estoque/reserva e monta o diagnóstico.
pub async fn gerar(pool: &PgPool, codigo: Option<&str>, limite: Option<usize>) -> Result<DiagnosticoReserva, String> {
    let codigo = codigo.map(store::canon).filter(|c| !c.is_empty());
    let limite = limite.unwrap_or(LIMITE_PADRAO).clamp(1, 1000);

    let ini = NaiveDate::from_ymd_opt(2000, 1, 1).expect("data válida");
    let fim = store::hoje_brasil() + chrono::Duration::days(3650);
    let brutos = store::carregar_lotes_abertos_sem_vinculo(pool, ini, fim, true).await?;
    let mut produtos: Vec<String> = brutos.iter().flat_map(|l| l.produtos.iter().map(|p| p.0.clone())).collect();
    produtos.sort();
    produtos.dedup();
    let mut formulas = store::carregar_formulas(pool, &produtos).await?;
    let lotes = store::lotes_com_reserva(brutos, &formulas);

    // Insumos com reserva calculada + os que o ERP diz ter reservado (último snapshot).
    let mut codigos: HashSet<String> = lotes.iter().flat_map(|l| l.reserva.keys().cloned()).collect();
    let com_reserva = sqlx::query(
        r#"
        SELECT code FROM (
            SELECT DISTINCT ON (TRIM(REPLACE(item_code, '"', '')))
                   TRIM(REPLACE(item_code, '"', '')) AS code, COALESCE(reserved_qty, 0) AS reserva
            FROM stock_snapshots
            ORDER BY TRIM(REPLACE(item_code, '"', '')), snapshot_date DESC, id DESC
        ) u WHERE reserva > 0
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler as reservas do ERP: {e}"))?;
    codigos.extend(com_reserva.into_iter().filter_map(|r| r.get::<Option<String>, _>("code")));
    if let Some(c) = &codigo {
        codigos.retain(|x| x == c);
    }
    let mut codigos: Vec<String> = codigos.into_iter().collect();
    codigos.sort();
    formulas.completar_itens(pool, &codigos).await?;
    let estoque = store::carregar_estoque(pool, &codigos, &formulas).await?;
    Ok(agregar(&lotes, &estoque, codigo.as_deref(), limite))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dia(d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, d).unwrap()
    }

    fn item(desc: &str, estoque: f64, reserva: f64) -> EstoqueItem {
        EstoqueItem { descricao: desc.into(), unidade: Some("KG".into()), estoque, reserva, calibrado: false }
    }

    #[test]
    fn agrega_reserva_dos_lotes_e_compara_com_a_do_erp() {
        let lotes = vec![
            LoteErp {
                numero: "100".into(),
                data: dia(1),
                produtos: vec![("P1".into(), 100.0)],
                reserva: HashMap::from([("A".to_string(), 30.0), ("B".to_string(), 5.0)]),
            },
            LoteErp {
                numero: "101".into(),
                data: dia(2),
                produtos: vec![("P1".into(), 100.0)],
                reserva: HashMap::from([("A".to_string(), 20.0)]),
            },
            // produto sem fórmula: nada reservado
            LoteErp { numero: "102".into(), data: dia(3), produtos: vec![("SEM".into(), 50.0)], reserva: HashMap::new() },
        ];
        let estoque = HashMap::from([
            ("A".to_string(), item("Insumo A", 10.0, 500.0)),
            ("B".to_string(), item("Insumo B", 8.0, 5.0)),
            ("C".to_string(), item("Insumo C", 1.0, 7.0)), // ERP reserva, nenhum lote explica
            ("D".to_string(), item("Insumo D", 1.0, 0.0)), // sem reserva alguma: fora
        ]);
        let r = agregar(&lotes, &estoque, None, 50);
        assert_eq!(r.lotes_abertos, 3);
        assert_eq!(r.lotes_sem_formula, 1);
        let codigos: Vec<&str> = r.insumos.iter().map(|i| i.codigo.as_str()).collect();
        assert_eq!(codigos, vec!["A", "C", "B"]); // diferenças 450, 7, 0
        let a = &r.insumos[0];
        assert_eq!((a.reserva_erp, a.reserva_lotes_abertos, a.diferenca), (500.0, 50.0, 450.0));
        assert_eq!(a.lotes.iter().map(|l| l.numero.as_str()).collect::<Vec<_>>(), vec!["100", "101"]);
        assert!(r.insumos[1].lotes.is_empty());

        let so_b = agregar(&lotes, &estoque, Some("B"), 50);
        assert_eq!(so_b.insumos.len(), 1);
        assert_eq!(agregar(&lotes, &estoque, None, 1).insumos.len(), 1);
    }
}
