pub mod models;
pub mod store;
pub mod handlers;

use std::sync::Arc;
use axum::{
    routing::get,
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/administrativo/funcionarios/me",
            get(handlers::get_me).put(handlers::put_me),
        )
        .route(
            "/api/administrativo/funcionarios",
            get(handlers::list_funcionarios),
        )
        .route(
            "/api/administrativo/funcionarios/:id",
            get(handlers::get_funcionario).put(handlers::put_funcionario),
        )
        .route(
            "/api/administrativo/funcionarios/:id/activity",
            get(handlers::list_activity),
        )
}
