pub mod util;
pub mod compras;
pub mod microbio;
pub mod fisco;

use axum::Router;
use std::sync::Arc;
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .merge(compras::router())
        .merge(microbio::router())
        .merge(fisco::router())
        .merge(crate::modules::geral::feedbacks::handlers::router())
}
