pub mod handlers;
pub mod models;

use std::sync::Arc;
use axum::{
    routing::{delete, get, post},
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
            "/api/estoque/ordens-manuais/tipos",
            get(handlers::list_record_types).post(handlers::create_record_type),
        )
        .route(
            "/api/estoque/ordens-manuais/tipos/:id",
            delete(handlers::delete_record_type),
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
