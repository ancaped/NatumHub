pub mod almoxarifado;
pub mod estoque_geral;
pub mod ordens_manuais;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .merge(almoxarifado::router())
        .merge(estoque_geral::router())
        .merge(ordens_manuais::router())
}
