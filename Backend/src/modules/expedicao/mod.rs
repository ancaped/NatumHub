pub mod models;
pub mod handlers;

use std::sync::Arc;
use axum::{
    routing::{get, post, put},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/expedicao/ecommerce", get(handlers::list_ecommerce_orders).post(handlers::create_ecommerce_order))
        .route("/api/expedicao/ecommerce/:id", put(handlers::update_ecommerce_order).delete(handlers::delete_ecommerce_order))
        .route("/api/expedicao/ecommerce/import", post(handlers::import_ecommerce_orders))
}
