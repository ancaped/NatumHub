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
