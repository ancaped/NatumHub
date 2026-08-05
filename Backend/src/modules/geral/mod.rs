pub mod configuracoes;
pub mod feedbacks;
pub mod acesso;
pub mod hub;
pub mod auth;
pub mod audit;
pub mod mapa;
pub mod notifications;
pub mod postgres_bootstrap;
#[cfg(feature = "desktop")]
pub mod build_info;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .route("/login", axum::routing::get(acesso::login_page))
        .route("/api/settings/:key", axum::routing::get(configuracoes::handlers::get_setting_handler).post(configuracoes::handlers::save_setting_handler))
        .route("/api/import/watch-config", axum::routing::get(configuracoes::handlers::get_watch_config_handler).post(configuracoes::handlers::save_watch_config_handler))
        .route("/api/import/erp-sync-schedule", axum::routing::get(configuracoes::handlers::get_erp_sync_schedule_handler).post(configuracoes::handlers::save_erp_sync_schedule_handler))
        .route("/api/admin/db-usage", axum::routing::get(configuracoes::admin_handlers::get_db_usage))
        .route("/api/admin/pg-backup", axum::routing::get(configuracoes::admin_handlers::get_pg_backup_status))
        .route("/api/admin/pg-backup/config", axum::routing::post(configuracoes::admin_handlers::save_pg_backup_config))
        .route("/api/admin/pg-backup/run", axum::routing::post(configuracoes::admin_handlers::run_pg_backup_now))
        .route("/api/admin/db-reset", axum::routing::post(configuracoes::admin_handlers::reset_operational_data))
        .route("/api/admin/audit/stock/resync-insumos", axum::routing::post(configuracoes::admin_handlers::resync_insumo_stocks))
        .route("/api/admin/audit/stock/resync-produtos", axum::routing::post(configuracoes::admin_handlers::resync_produto_stocks))
        .route("/api/admin/audit/stock/verify-insumos", axum::routing::post(configuracoes::admin_handlers::verify_insumo_stocks))
        .route("/api/admin/audit/stock/:code", axum::routing::get(configuracoes::admin_handlers::audit_stock))
        .route("/api/admin/audit/stock/:code/refresh", axum::routing::post(configuracoes::admin_handlers::refresh_stock_from_erp))
        .route("/api/auth/session", axum::routing::get(acesso::get_session).post(acesso::save_session).delete(acesso::clear_session))
        .merge(hub::router())
        .merge(auth::router())
        .merge(audit::router())
        .merge(mapa::router())
        .merge(notifications::router())
}
