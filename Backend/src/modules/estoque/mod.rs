pub mod almoxarifado;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new().merge(almoxarifado::router())
}
