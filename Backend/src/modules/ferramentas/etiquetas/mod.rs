pub mod handlers;
pub mod models;
pub mod store;

use std::sync::Arc;
use axum::{
    routing::get,
    Router,
};

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/ferramentas/etiquetas/templates",
            get(handlers::list_templates_handler).post(handlers::create_template_handler),
        )
        .route(
            "/api/ferramentas/etiquetas/templates/:id",
            get(handlers::get_template_handler)
                .put(handlers::update_template_handler)
                .delete(handlers::delete_template_handler),
        )
}
