pub mod documentacao;
pub mod pops;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .merge(documentacao::router())
        .merge(pops::router())
}
