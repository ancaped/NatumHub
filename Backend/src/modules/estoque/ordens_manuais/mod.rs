pub mod handlers;
pub mod models;

use std::sync::Arc;
use axum::{
    routing::{get, post},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/estoque/ordens-manuais",
            get(handlers::list_orders).post(handlers::create_order),
        )
        .route(
            "/api/estoque/ordens-manuais/itens/busca",
            get(handlers::search_items),
        )
        .route(
            "/api/estoque/ordens-manuais/pendencias/por-item",
            get(handlers::pending_by_item),
        )
        .route(
            "/api/estoque/ordens-manuais/:id",
            get(handlers::get_order)
                .put(handlers::update_order)
                .delete(handlers::delete_order),
        )
        .route(
            "/api/estoque/ordens-manuais/:id/postar",
            post(handlers::post_order),
        )
        .route(
            "/api/estoque/ordens-manuais/:id/reabrir",
            post(handlers::reopen_order),
        )
}
