pub mod handlers;

use std::sync::Arc;
use axum::{
    routing::{get, post, delete},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/estoque/insumos/divergencias",
            get(handlers::list_insumo_divergencias),
        )
        .route(
            "/api/estoque/insumos/:code/divergencias",
            get(handlers::get_insumo_divergencia_detail),
        )
        .route(
            "/api/estoque/insumos/:code/divergencias/resolver",
            post(handlers::save_insumo_divergencia_resolution)
                .delete(handlers::delete_insumo_divergencia_resolution),
        )
}
