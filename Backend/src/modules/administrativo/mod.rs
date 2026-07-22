pub mod produtos_ativos_relatorios;

use std::sync::Arc;
use axum::Router;
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().merge(produtos_ativos_relatorios::router())
}
