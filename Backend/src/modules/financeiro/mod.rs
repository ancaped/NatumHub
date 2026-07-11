pub mod models;
pub mod client;
pub mod handlers;

use std::sync::Arc;
use axum::{routing::{get, post}, Router};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/financeiro/status", get(handlers::get_financial_status))
        .route("/api/financeiro/sync", post(handlers::sync_financial_data))
        .route("/api/financeiro/contas", get(handlers::get_financial_accounts))
        .route("/api/financeiro/fluxo", get(handlers::get_financial_flow))
        .route("/api/financeiro/token", post(handlers::save_tiny_token))
}
