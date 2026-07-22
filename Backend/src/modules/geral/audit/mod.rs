pub mod handlers;
pub mod models;
pub mod store;

use std::sync::Arc;

use axum::{routing::get, Router};

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

pub use models::AuditRecord;
pub use store::{infer_module_key, record, record_http_write};

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route(
        "/api/admin/audit/events",
        get(handlers::list_audit_events),
    )
}

/// Helper síncrono-friendly: grava evento de domínio (ignora erro de log).
pub async fn record_domain(
    pool: &sqlx::PgPool,
    ctx: Option<&AuthContext>,
    module_key: &str,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    summary: &str,
    before: Option<serde_json::Value>,
    after: Option<serde_json::Value>,
) {
    let _ = record(
        pool,
        ctx,
        None,
        AuditRecord {
            module_key: Some(module_key),
            action,
            entity_type: Some(entity_type),
            entity_id: Some(entity_id),
            summary,
            before,
            after,
            request_method: None,
            request_path: None,
            provenance: "human",
        },
    )
    .await;
}
