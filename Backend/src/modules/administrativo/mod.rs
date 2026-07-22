pub mod funcionarios;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new().merge(funcionarios::router())
}
