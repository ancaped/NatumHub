pub mod folhas;
pub mod handlers;
pub mod models;

use axum::{
    extract::DefaultBodyLimit,
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/avarias",
            get(handlers::list_avarias).post(handlers::create_avaria),
        )
        .route(
            "/api/qualidade/avarias/lookup-item",
            get(handlers::lookup_item),
        )
        .route(
            "/api/qualidade/avarias/folhas",
            get(folhas::list_folhas).post(folhas::create_folha),
        )
        .route(
            "/api/qualidade/avarias/folhas/pendentes",
            get(folhas::pending_folhas),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id",
            get(folhas::get_folha),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id/caixas",
            axum::routing::post(folhas::set_caixas),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id/devolver",
            axum::routing::post(folhas::devolver_folha),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id/cancelar",
            axum::routing::post(folhas::cancelar_folha),
        )
        .route(
            "/api/qualidade/avarias/juntar",
            axum::routing::post(handlers::juntar_avarias),
        )
        .route(
            "/api/qualidade/avarias/:id",
            get(handlers::get_avaria)
                .put(handlers::update_avaria)
                .delete(handlers::delete_avaria),
        )
        .route(
            "/api/qualidade/avarias/:id/foto",
            get(handlers::get_foto).post(handlers::upload_foto).layer(DefaultBodyLimit::max(
                12 * 1024 * 1024,
            )),
        )
}
