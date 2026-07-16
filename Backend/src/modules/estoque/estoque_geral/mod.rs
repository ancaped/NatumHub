pub mod handlers;

use std::sync::Arc;
use axum::{
    routing::{get, post},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/estoque/produtos/:code/contagem",
            post(handlers::save_product_count),
        )
        .route(
            "/api/estoque/produtos/:code/contagem/historico",
            get(handlers::get_product_count_history),
        )
}
