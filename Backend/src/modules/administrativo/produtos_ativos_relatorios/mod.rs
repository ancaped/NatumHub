mod handlers;

use std::sync::Arc;
use axum::{routing::get, Router};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route(
        "/api/admin/produtos-ativos/relatorio",
        get(handlers::relatorio_produtos_ativos),
    )
}
