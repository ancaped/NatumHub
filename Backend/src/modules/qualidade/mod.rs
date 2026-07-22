pub mod documentacao;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new().merge(documentacao::router())
}
