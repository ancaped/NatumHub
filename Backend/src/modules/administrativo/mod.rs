pub mod funcionarios;
pub mod linhas_kits;
pub mod classificacao;
pub mod produtos_ativos_relatorios;
pub mod acompanhamento_producao;

use std::sync::Arc;
use axum::Router;
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .merge(funcionarios::router())
        .merge(produtos_ativos_relatorios::router())
        .merge(linhas_kits::router())
        .merge(classificacao::router())
        .merge(acompanhamento_producao::router())
}
