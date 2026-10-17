pub mod etiquetas;
pub mod impressoras;

use std::sync::Arc;
use axum::Router;
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .merge(etiquetas::router())
        .merge(impressoras::router())
}
