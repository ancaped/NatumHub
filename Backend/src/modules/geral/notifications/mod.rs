use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::modules_registry::MODULE_CONFIGURACOES;

pub mod handlers;
pub mod models;
pub mod store;

pub fn router() -> axum::Router<Arc<AppState>> {
    use axum::routing::{get, post};
    axum::Router::new()
        .route("/api/notifications", get(handlers::list_notifications))
        .route("/api/notifications/unread-count", get(handlers::unread_count_handler))
        .route(
            "/api/notifications/:id/read",
            post(handlers::mark_notification_read),
        )
        .route("/api/notifications/read-all", post(handlers::mark_all_read))
}

/// Cria notificação persistida (ex.: sync ERP, alteração de PC principal).
pub fn notify(
    state: &Arc<AppState>,
    module_key: &str,
    kind: &str,
    title: &str,
    message: &str,
    metadata: Option<&str>,
) {
    let pool = state.db.pool().clone();
    let module_key = module_key.to_string();
    let kind = kind.to_string();
    let title = title.to_string();
    let message = message.to_string();
    let metadata = metadata.map(|s| s.to_string());
    tauri::async_runtime::spawn(async move {
        let _ = store::create_notification(
            &pool,
            &module_key,
            &kind,
            &title,
            &message,
            metadata.as_deref(),
        )
        .await;
    });
}

pub fn notify_config(
    state: &Arc<AppState>,
    kind: &str,
    title: &str,
    message: &str,
    metadata: Option<&str>,
) {
    notify(
        state,
        MODULE_CONFIGURACOES,
        kind,
        title,
        message,
        metadata,
    );
}
