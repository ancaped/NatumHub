pub mod funcionarios;
pub mod produtos_ativos_relatorios;
pub mod acompanhamento_producao;

use std::sync::Arc;
use axum::Router;
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .merge(funcionarios::router())
        .merge(produtos_ativos_relatorios::router())
        .merge(acompanhamento_producao::router())
}
