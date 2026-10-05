pub mod handlers;
pub mod models;

use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/devolucoes",
            get(handlers::list_devolucoes).post(handlers::create_devolucao),
        )
        .route(
            "/api/qualidade/devolucoes/:id",
            get(handlers::get_devolucao)
                .put(handlers::update_devolucao)
                .delete(handlers::delete_devolucao),
        )
        .route(
            "/api/qualidade/devolucoes/:id/receber",
            post(handlers::receber_devolucao),
        )
        .route(
            "/api/qualidade/devolucoes/:id/iniciar-conferencia",
            post(handlers::iniciar_conferencia),
        )
        .route(
            "/api/qualidade/devolucoes/:id/fechar-cq",
            post(handlers::fechar_cq),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/conferir",
            post(handlers::conferir_item),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/erp",
            post(handlers::marcar_erp_item),
        )
}
