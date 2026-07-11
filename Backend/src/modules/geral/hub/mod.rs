pub mod handlers;
pub mod updater_manifest;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    use axum::routing::{get, post};
    axum::Router::new()
        .route("/api/health", get(handlers::health))
        .route("/api/hub/status", get(handlers::hub_status))
        .route("/api/hub/public-config", get(handlers::public_config))
        .route(
            "/api/hub/updater-manifest/:channel",
            get(handlers::get_updater_manifest),
        )
        .route("/api/hub/client-config", get(handlers::get_client_config).post(handlers::save_client_config))
        .route("/api/hub/principal-device", get(handlers::get_principal_device))
        .route("/api/hub/claim-principal", post(handlers::claim_principal))
}
