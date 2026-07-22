use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::core::app_config::{load_client_config, save_client_config as persist_client_config, ClientConfig};
use crate::handlers::AppState;

/// GET /api/health — API local + ping PostgreSQL.
pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let cfg = load_client_config();
    let (db_provider, db_host_masked) = crate::core::pg_db::database_connection_meta()
        .unwrap_or_else(|_| ("unknown".to_string(), "(desconhecido)".to_string()));
    let started = std::time::Instant::now();
    let db_ok = sqlx::query("SELECT 1")
        .execute(state.db.pool())
        .await
        .is_ok();
    let db_latency_ms = started.elapsed().as_millis() as u64;

    if !db_ok {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "degraded",
                "error": "Database unavailable",
                "database": "postgresql",
                "dbConnected": false,
                "dbLatencyMs": db_latency_ms,
                "dbProvider": db_provider,
                "dbHostMasked": db_host_masked,
            })),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "appMode": cfg.app_mode.as_str(),
            "isSyncMaster": cfg.app_mode == crate::core::app_config::AppMode::Master,
            "version": env!("CARGO_PKG_VERSION"),
            "database": "postgresql",
            "dbConnected": true,
            "dbLatencyMs": db_latency_ms,
            "dbProvider": db_provider,
            "dbHostMasked": db_host_masked,
        })),
    )
        .into_response()
}

/// GET /api/hub/status — informações estendidas do servidor.
pub async fn hub_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let cfg = load_client_config();
    let pool = state.db.pool();
    let db_ok = sqlx::query("SELECT 1")
        .execute(pool)
        .await
        .is_ok();

    (
        StatusCode::OK,
        Json(json!({
            "status": if db_ok { "ok" } else { "degraded" },
            "appMode": cfg.app_mode.as_str(),
            "isSyncMaster": cfg.app_mode == crate::core::app_config::AppMode::Master,
            "apiBindHost": cfg.api_bind_host,
            "apiPort": cfg.api_port,
            "database": "postgresql",
            "dbConnected": db_ok,
            "version": env!("CARGO_PKG_VERSION"),
        })),
    )
        .into_response()
}

/// GET /api/hub/client-config
pub async fn get_client_config() -> impl IntoResponse {
    (StatusCode::OK, Json(load_client_config()))
}

/// POST /api/hub/client-config
pub async fn save_client_config(Json(body): Json<ClientConfig>) -> impl IntoResponse {
    match persist_client_config(&body) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

/// Config pública mínima para clientes do navegador — sem auth.
pub async fn public_config() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "hubUrlHint": "http://natumhub.local:3001",
            "accessMode": "browser",
        })),
    )
        .into_response()
}
