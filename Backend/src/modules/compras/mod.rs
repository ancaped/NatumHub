pub mod compras_online;
pub mod planejamento;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .merge(compras_online::router())
        .merge(planejamento::router())
}
