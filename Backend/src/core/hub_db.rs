//! Helpers compartilhados para queries PostgreSQL (sqlx).

use sqlx::postgres::PgPool;

pub type HubPool = PgPool;

pub fn pg_err(e: impl ToString) -> String {
    e.to_string()
}

/// Escapa identificador reservado (ex.: coluna `type`, camelCase do microbio).
pub fn pg_col(name: &str) -> String {
    match name {
        "type" => "\"type\"".to_string(),
        "createdAt" | "resolvedAt" | "reportId" | "reportRawNum" | "productCode"
        | "productName" | "collectionDate" => format!("\"{name}\""),
        _ => name.to_string(),
    }
}
