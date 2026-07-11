pub mod backup;
pub mod configuracoes;
pub mod feedbacks;
pub mod acesso;
pub mod hub;
pub mod auth;
pub mod notifications;
pub mod releases;
pub mod updater;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .route("/login", axum::routing::get(acesso::login_page))
        .route("/api/settings/:key", axum::routing::get(configuracoes::handlers::get_setting_handler).post(configuracoes::handlers::save_setting_handler))
        .route("/api/import/watch-config", axum::routing::get(configuracoes::handlers::get_watch_config_handler).post(configuracoes::handlers::save_watch_config_handler))
        .route("/api/import/erp-sync-schedule", axum::routing::get(configuracoes::handlers::get_erp_sync_schedule_handler).post(configuracoes::handlers::save_erp_sync_schedule_handler))
        .route("/api/google/status", axum::routing::get(backup::google_drive::get_google_status))
        .route("/api/google/config", axum::routing::post(backup::google_drive::save_google_config))
        .route("/api/google/auth-url", axum::routing::get(backup::google_drive::google_auth_url))
        .route("/api/google/callback", axum::routing::get(backup::google_drive::google_callback))
        .route("/api/google/sync", axum::routing::post(backup::google_drive::trigger_sync))
        .route("/api/auth/session", axum::routing::get(acesso::get_session).post(acesso::save_session).delete(acesso::clear_session))
        .merge(hub::router())
        .merge(auth::router())
        .merge(releases::router())
        .merge(notifications::router())
}
