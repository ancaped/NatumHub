pub mod models;
pub mod store;
pub mod handlers;

use std::sync::Arc;
use axum::{
    routing::{get, post, put},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/documentacao/families",
            get(handlers::list_families).post(handlers::create_family),
        )
        .route(
            "/api/qualidade/documentacao/families/:id",
            put(handlers::update_family).delete(handlers::delete_family),
        )
        .route(
            "/api/qualidade/documentacao/types",
            get(handlers::list_types).post(handlers::create_type),
        )
        .route(
            "/api/qualidade/documentacao/types/:id",
            put(handlers::update_type).delete(handlers::delete_type),
        )
        .route(
            "/api/qualidade/documentacao/documents",
            get(handlers::list_documents).post(handlers::create_document),
        )
        .route(
            "/api/qualidade/documentacao/documents/:id",
            get(handlers::get_document)
                .put(handlers::update_document)
                .delete(handlers::delete_document),
        )
        .route(
            "/api/qualidade/documentacao/documents/:id/files",
            post(handlers::upload_file),
        )
        .route(
            "/api/qualidade/documentacao/files/:id",
            get(handlers::download_file).delete(handlers::delete_file),
        )
        .route(
            "/api/qualidade/documentacao/check-alerts",
            post(handlers::check_alerts),
        )
}
