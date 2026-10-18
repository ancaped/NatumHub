pub mod handlers;
pub mod models;

use axum::{
    routing::{get, put},
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // ERP Receipts
        .route(
            "/api/qualidade/recebimento-mp/erp",
            get(handlers::list_erp_recebimentos),
        )
        .route(
            "/api/qualidade/recebimento-mp/sync",
            axum::routing::post(handlers::sync_erp_recebimentos),
        )
        // Laudos
        .route(
            "/api/qualidade/recebimento-mp/laudos",
            get(handlers::list_laudos).post(handlers::create_laudo),
        )
        .route(
            "/api/qualidade/recebimento-mp/laudos/:id",
            get(handlers::get_laudo)
                .put(handlers::update_laudo)
                .delete(handlers::delete_laudo),
        )
        // Amostras de Contraprova
        .route(
            "/api/qualidade/recebimento-mp/amostras",
            get(handlers::list_amostras).post(handlers::create_amostra),
        )
        .route(
            "/api/qualidade/recebimento-mp/amostras/:id",
            put(handlers::update_amostra).delete(handlers::delete_amostra),
        )
}
