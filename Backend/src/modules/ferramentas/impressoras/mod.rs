pub mod direct_print;
pub mod handlers;
pub mod models;
pub mod store;

use std::sync::Arc;
use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/ferramentas/impressoras",
            get(handlers::list_printers_handler).post(handlers::create_printer_handler),
        )
        .route(
            "/api/ferramentas/impressoras/system-scan",
            get(handlers::scan_system_printers_handler),
        )
        .route(
            "/api/ferramentas/impressoras/jobs",
            get(handlers::list_print_jobs_handler).post(handlers::create_print_job_handler),
        )
        .route(
            "/api/ferramentas/impressoras/jobs/:id/cancel",
            post(handlers::cancel_print_job_handler),
        )
        .route(
            "/api/ferramentas/impressoras/direct",
            post(handlers::direct_print_handler),
        )
        .route(
            "/api/ferramentas/impressoras/:id",
            get(handlers::get_printer_handler)
                .put(handlers::update_printer_handler)
                .delete(handlers::delete_printer_handler),
        )
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
}
