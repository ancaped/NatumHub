pub mod handlers;
pub mod models;
pub mod store;

use std::sync::Arc;

use axum::{
    routing::{get, patch, post, put},
    Router,
};

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/mapa", get(handlers::serve_mapa_html))
        .route("/api/mapa/snapshot", get(handlers::get_snapshot))
        .route("/api/mapa/layout", put(handlers::put_layout))
        .route("/api/mapa/modules", post(handlers::post_module))
        .route("/api/mapa/modules/:key", put(handlers::put_module))
        .route("/api/mapa/edges", post(handlers::post_edge))
        .route("/api/mapa/tasks", get(handlers::list_tasks).post(handlers::post_task))
        .route("/api/mapa/tasks/export.md", get(handlers::export_tasks_md))
        .route("/api/mapa/tasks/:id", patch(handlers::patch_task))
        .route(
            "/api/mapa/activity",
            get(handlers::list_activity).post(handlers::post_activity),
        )
        .route("/api/mapa/resync-scan", post(handlers::resync_scan))
}
