pub mod handlers;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    use axum::routing::get;
    axum::Router::new()
        .route("/api/health", get(handlers::health))
        .route("/api/hub/status", get(handlers::hub_status))
        .route("/api/hub/public-config", get(handlers::public_config))
        .route("/api/hub/client-config", get(handlers::get_client_config).post(handlers::save_client_config))
}
