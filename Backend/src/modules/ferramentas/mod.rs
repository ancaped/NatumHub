pub mod etiquetas;

use std::sync::Arc;
use axum::Router;
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .merge(etiquetas::router())
}
