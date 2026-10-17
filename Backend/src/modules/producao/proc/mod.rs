pub mod generator;
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
            "/api/producao/proc",
            get(handlers::list_procs).post(handlers::create_proc),
        )
        .route("/api/producao/proc/map", get(handlers::get_proc_map))
        .route(
            "/api/producao/proc/summary",
            get(handlers::get_proc_summary),
        )
        .route(
            "/api/producao/proc/generate",
            post(handlers::generate_proc_handler),
        )
        .route(
            "/api/producao/proc/:id",
            get(handlers::get_proc_by_id)
                .put(handlers::update_proc)
                .delete(handlers::delete_proc),
        )
}
