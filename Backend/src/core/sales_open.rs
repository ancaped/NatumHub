//! Regras de pedidos de venda "em aberto" (alinhadas ao filtro do ERP Natum).
//!
//! Incluir: Pré-pedido (PP), Liberado (LB), Expedição (EX), Conferido (CF),
//! Aguardando Liberação (AL).
//! Excluir: Faturado (FT), Cancelado (CA), Faturado parcial (FP), status vazio/nulo.

use std::collections::HashMap;

use sqlx::{PgPool, Row};

use crate::core::db::Db;

/// Default da setting `sales_faltas_days_limit` (3 meses).
pub const DEFAULT_SALES_FALTAS_DAYS: i32 = 90;

/// Predicado SQL (alias `so` = sales_orders) para status abertos.
pub const OPEN_STATUS_SQL: &str =
    "TRIM(COALESCE(so.c_status, '')) IN ('PP', 'LB', 'EX', 'CF', 'AL')";

/// Predicado sem alias de tabela (coluna `c_status` no FROM sales_orders).
pub const OPEN_STATUS_SQL_BARE: &str =
    "TRIM(COALESCE(c_status, '')) IN ('PP', 'LB', 'EX', 'CF', 'AL')";

/// Lê a janela em dias; `0` = sem limite. Ausente/ inválido → 90.
pub fn parse_faltas_days(raw: Option<&str>) -> i32 {
    match raw {
        Some(val) => val.parse().unwrap_or(DEFAULT_SALES_FALTAS_DAYS),
        None => DEFAULT_SALES_FALTAS_DAYS,
    }
}

/// Filtro de data para alias `so`. `days <= 0` = sem limite.
pub fn days_filter_sql(days: i32) -> String {
    if days > 0 {
        format!("AND so.d_pedido::date >= (CURRENT_DATE - INTERVAL '{days} days')")
    } else {
        String::new()
    }
}

/// SUM residual `n_qtde - n_qtde_fat` por produto (passos M/N).
pub fn residual_sum_query(days: i32) -> String {
    let date_filter = days_filter_sql(days);
    format!(
        "SELECT soi.c_cod_prod, SUM(GREATEST(soi.n_qtde - soi.n_qtde_fat, 0))::bigint
         FROM sales_order_items soi
         JOIN sales_orders so ON soi.n_pedido = so.n_pedido AND soi.d_pedido = so.d_pedido
         WHERE {OPEN_STATUS_SQL} AND (soi.n_qtde > soi.n_qtde_fat)
         {date_filter}
         GROUP BY soi.c_cod_prod"
    )
}

/// Mapa produto → unidades em pedidos abertos (fonte única para Produção/Vendas).
pub async fn fetch_residual_map(
    pool: &PgPool,
    days: i32,
) -> Result<HashMap<String, i64>, sqlx::Error> {
    let mut map = HashMap::new();
    let query = residual_sum_query(days);
    for row in sqlx::query(&query).fetch_all(pool).await? {
        map.insert(
            row.get::<String, _>(0),
            crate::core::pg_row::pg_i64(&row, 1),
        );
    }
    Ok(map)
}

/// Lê `sales_faltas_days_limit` do banco (default 90).
pub async fn resolve_faltas_days(db: &Db) -> i32 {
    match db.get_setting("sales_faltas_days_limit").await {
        Ok(Some(val)) => parse_faltas_days(Some(val.as_str())),
        _ => DEFAULT_SALES_FALTAS_DAYS,
    }
}

/// Grava `sales_faltas_days_limit=90` se a setting ainda não existir.
pub async fn ensure_faltas_days_setting(db: &Db) -> Result<(), String> {
    if db.get_setting("sales_faltas_days_limit")
        .await?
        .is_none()
    {
        db.save_setting("sales_faltas_days_limit", "90").await?;
    }
    Ok(())
}

/// Pedido "em aberto": status PP, LB, EX, CF ou AL (mesma regra de `OPEN_STATUS_SQL`).
pub fn pedido_aberto(c_status: Option<&str>) -> bool {
    matches!(c_status.map(str::trim), Some("PP" | "LB" | "EX" | "CF" | "AL"))
}

/// Pedido atrasado: em aberto, com residual a entregar e previsão (`AAAA-MM-DD...`) anterior a `hoje`.
pub fn pedido_atrasado(
    aberto: bool,
    residual_un: i64,
    d_previsao: Option<&str>,
    hoje: chrono::NaiveDate,
) -> bool {
    if !aberto || residual_un <= 0 {
        return false;
    }
    let Some(texto) = d_previsao.map(str::trim).filter(|t| t.len() >= 10) else {
        return false;
    };
    match chrono::NaiveDate::parse_from_str(&texto[..10], "%Y-%m-%d") {
        Ok(prev) => prev < hoje,
        Err(_) => false,
    }
}

/// Contagens da lista de pedidos de venda (fonte única; a tela só exibe).
#[derive(Debug, Default, PartialEq, Eq, serde::Serialize)]
pub struct ResumoPedidos {
    pub abertos: i64,
    pub atrasados: i64,
    pub total: i64,
    /// Soma do residual (un) dos pedidos em aberto.
    pub residual_abertos_un: i64,
}

/// Resume linhas `(c_status, d_previsao, residual_un)` de pedidos.
pub fn resumir_pedidos(
    linhas: &[(Option<String>, Option<String>, i64)],
    hoje: chrono::NaiveDate,
) -> ResumoPedidos {
    let mut r = ResumoPedidos { total: linhas.len() as i64, ..Default::default() };
    for (status, previsao, residual) in linhas {
        let aberto = pedido_aberto(status.as_deref());
        if aberto {
            r.abertos += 1;
            r.residual_abertos_un += (*residual).max(0);
        }
        if pedido_atrasado(aberto, *residual, previsao.as_deref(), hoje) {
            r.atrasados += 1;
        }
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn aberto_so_nos_cinco_status() {
        for s in ["PP", "LB", "EX", "CF", "AL", " PP "] {
            assert!(pedido_aberto(Some(s)), "{s}");
        }
        for s in ["FT", "CA", "FP", ""] {
            assert!(!pedido_aberto(Some(s)), "{s}");
        }
        assert!(!pedido_aberto(None));
    }

    #[test]
    fn atrasado_exige_aberto_residual_e_previsao_passada() {
        let hoje = d("2026-10-30");
        assert!(pedido_atrasado(true, 5, Some("2026-10-29 00:00:00"), hoje));
        assert!(pedido_atrasado(true, 5, Some("2026-10-29"), hoje));
        assert!(!pedido_atrasado(true, 5, Some("2026-10-30"), hoje));
        assert!(!pedido_atrasado(true, 0, Some("2026-10-01"), hoje));
        assert!(!pedido_atrasado(false, 5, Some("2026-10-01"), hoje));
        assert!(!pedido_atrasado(true, 5, None, hoje));
        assert!(!pedido_atrasado(true, 5, Some("lixo"), hoje));
    }

    #[test]
    fn resumo_conta_abertos_atrasados_e_residual() {
        let hoje = d("2026-10-30");
        let linhas = vec![
            (Some("PP".to_string()), Some("2026-10-01".to_string()), 10),
            (Some("LB".to_string()), Some("2026-12-01".to_string()), 4),
            (Some("FT".to_string()), Some("2026-01-01".to_string()), 3),
            (None, None, 0),
        ];
        let r = resumir_pedidos(&linhas, hoje);
        assert_eq!(r, ResumoPedidos { abertos: 2, atrasados: 1, total: 4, residual_abertos_un: 14 });
    }
}
