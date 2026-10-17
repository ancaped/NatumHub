pub mod handlers;
pub mod models;
pub mod store;

use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/pops/sectors",
            get(handlers::list_sectors).post(handlers::create_sector),
        )
        .route(
            "/api/qualidade/pops/documents",
            get(handlers::list_documents).post(handlers::create_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id",
            get(handlers::get_document).put(handlers::update_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id/publish",
            post(handlers::publish_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id/revalidate",
            post(handlers::revalidate_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id/versions",
            get(handlers::list_versions),
        )
        .route(
            "/api/qualidade/pops/documents/:id/versions/:vid",
            get(handlers::get_version),
        )
        .route(
            "/api/qualidade/pops/settings",
            get(handlers::get_settings).put(handlers::upload_logo),
        )
        .route(
            "/api/qualidade/pops/settings/logo",
            get(handlers::download_logo),
        )
        .route(
            "/api/qualidade/pops/seed-inventory",
            post(handlers::seed_inventory),
        )
        .route(
            "/api/qualidade/pops/check-alerts",
            post(handlers::check_alerts),
        )
}
