pub mod extracao;
pub mod gerado;
pub mod handlers;
pub mod models;
pub mod store;

use std::sync::Arc;

use axum::{
    routing::{get, post, put},
    Router,
};

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/mapa/snapshot", get(handlers::get_snapshot))
        .route("/api/mapa/layout", put(handlers::put_layout))
        .route("/api/mapa/modules", post(handlers::post_module))
        .route("/api/mapa/edges", post(handlers::post_edge))
        .route(
            "/api/mapa/activity",
            get(handlers::list_activity).post(handlers::post_activity),
        )
}
