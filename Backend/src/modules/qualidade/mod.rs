pub mod avarias;
pub mod devolucoes;
pub mod documentacao;
pub mod pops;
pub mod recebimento_mp;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .merge(documentacao::router())
        .merge(pops::router())
        .merge(devolucoes::router())
        .merge(avarias::router())
        .merge(recebimento_mp::router())
}
