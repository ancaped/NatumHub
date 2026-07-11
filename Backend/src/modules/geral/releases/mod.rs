pub mod handlers;
pub mod models;
pub mod store;

use axum::routing::{get, post};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> axum::Router<Arc<AppState>> {
    axum::Router::new()
        .route("/api/auth/releases/status", get(handlers::get_status))
        .route("/api/auth/releases/github-config", get(handlers::get_github_config).post(handlers::save_github_config))
        .route("/api/auth/releases/promote", post(handlers::promote_release))
        .route("/api/auth/releases/sync-manifests", post(handlers::sync_manifests))
}
