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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: &'static str,
    pub app_mode: String,
    pub is_sync_master: bool,
    pub version: &'static str,
}

/// GET /api/health — usado por clientes para testar conexão com o master.
pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let cfg = load_client_config();
    let db_ok = state.db.connect().is_ok();

    if !db_ok {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "degraded",
                "error": "Database unavailable"
            })),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        Json(HealthResponse {
            status: "ok",
            app_mode: cfg.app_mode.as_str().to_string(),
            is_sync_master: cfg.app_mode == crate::core::app_config::AppMode::Master,
            version: env!("CARGO_PKG_VERSION"),
        }),
    )
        .into_response()
}

/// GET /api/hub/status — informações estendidas do servidor.
pub async fn hub_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let cfg = load_client_config();
    let db_path = state.db.db_path().to_string();
    let db_size = std::fs::metadata(&db_path)
        .map(|m| m.len())
        .unwrap_or(0);

    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "appMode": cfg.app_mode.as_str(),
            "isSyncMaster": cfg.app_mode == crate::core::app_config::AppMode::Master,
            "apiBindHost": cfg.api_bind_host,
            "apiPort": cfg.api_port,
            "dbPath": db_path,
            "dbSizeBytes": db_size,
            "version": env!("CARGO_PKG_VERSION"),
        })),
    )
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

const SETTING_PRINCIPAL_DEVICE_ID: &str = "hub_principal_device_id";
const SETTING_PRINCIPAL_DEVICE_LABEL: &str = "hub_principal_device_label";
const SETTING_PRINCIPAL_CLAIMED_AT: &str = "hub_principal_claimed_at";

/// GET /api/hub/principal-device?deviceId=...
pub async fn get_principal_device(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let device_id = params.get("deviceId").cloned().unwrap_or_default();
    let principal_id = state
        .db
        .get_setting(SETTING_PRINCIPAL_DEVICE_ID)
        .ok()
        .flatten()
        .unwrap_or_default();
    let label = state
        .db
        .get_setting(SETTING_PRINCIPAL_DEVICE_LABEL)
        .ok()
        .flatten()
        .unwrap_or_default();
    let claimed_at = state
        .db
        .get_setting(SETTING_PRINCIPAL_CLAIMED_AT)
        .ok()
        .flatten();

    let is_this_device = !device_id.is_empty() && device_id == principal_id;
    let has_principal = !principal_id.is_empty();

    (
        StatusCode::OK,
        Json(json!({
            "deviceId": principal_id,
            "deviceLabel": label,
            "claimedAt": claimed_at,
            "hasPrincipal": has_principal,
            "isThisDevice": is_this_device,
        })),
    )
        .into_response()
}

/// POST /api/hub/claim-principal — admin; registra este PC como único principal.
pub async fn claim_principal(
    State(state): State<Arc<AppState>>,
    axum::Extension(ctx): axum::Extension<crate::modules::geral::auth::models::AuthContext>,
    Json(body): Json<crate::modules::geral::notifications::models::ClaimPrincipalInput>,
) -> impl IntoResponse {
    if !ctx.role.is_admin() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Apenas administradores podem definir o PC principal." })),
        )
            .into_response();
    }

    if !crate::core::app_config::is_sync_master() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Somente um PC em modo Principal (servidor) pode reivindicar o cargo." })),
        )
            .into_response();
    }

    let install_id = crate::core::app_config::read_tauri_identifier();
    if !crate::core::app_config::can_be_principal_server(&install_id) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": "Somente instalações NatumHub Estável podem ser PC Principal. Builds Alpha/Beta/desenvolvedor devem ser Clientes."
            })),
        )
            .into_response();
    }

    if body.device_id.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "deviceId é obrigatório." })),
        )
            .into_response();
    }

    let previous_id = state
        .db
        .get_setting(SETTING_PRINCIPAL_DEVICE_ID)
        .ok()
        .flatten()
        .unwrap_or_default();
    let label = body
        .device_label
        .clone()
        .unwrap_or_else(|| "PC Principal".to_string());
    let now = chrono::Utc::now().format("%d/%m/%Y %H:%M:%S").to_string();

    if let Err(e) = state.db.save_setting(SETTING_PRINCIPAL_DEVICE_ID, &body.device_id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    let _ = state
        .db
        .save_setting(SETTING_PRINCIPAL_DEVICE_LABEL, &label);
    let _ = state.db.save_setting(SETTING_PRINCIPAL_CLAIMED_AT, &now);

    if !previous_id.is_empty() && previous_id != body.device_id {
        crate::modules::geral::notifications::notify_config(
            &state,
            "warning",
            "PC principal alterado",
            &format!(
                "O servidor principal passou a ser \"{}\". O PC anterior deixou de ser o principal.",
                label
            ),
            None,
        );
    } else {
        crate::modules::geral::notifications::notify_config(
            &state,
            "info",
            "PC principal definido",
            &format!("\"{}\" registrado como único PC principal do NatumHub.", label),
            None,
        );
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "success",
            "deviceId": body.device_id,
            "deviceLabel": label,
            "claimedAt": now,
        })),
    )
        .into_response()
}
