use axum::{
    extract::{State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use serde_json::json;
use crate::handlers::AppState;
use super::models::{WatchConfig, SaveSettingInput, ErpSyncScheduleConfig, ErpSyncScheduleResponse};
use super::erp_sync_scheduler::{compute_next_run, normalize_schedule_times};

// GET /api/settings/:key
pub async fn get_setting_handler(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
) -> impl IntoResponse {
    match state.db.get_setting(&key) {
        Ok(Some(val)) => (StatusCode::OK, Json(json!({ "key": key, "value": val }))).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Setting not found" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// POST /api/settings/:key
pub async fn save_setting_handler(
    State(state): State<Arc<AppState>>,
    Path(key): Path<String>,
    Json(body): Json<SaveSettingInput>,
) -> impl IntoResponse {
    match state.db.save_setting(&key, &body.value) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// GET /api/import/watch-config
pub async fn get_watch_config_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_watch_config() {
        Ok(cfg) => (StatusCode::OK, Json(cfg)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar configuração de pasta: {}", e) }))).into_response(),
    }
}

// POST /api/import/watch-config
pub async fn save_watch_config_handler(
    State(state): State<Arc<AppState>>,
    Json(cfg): Json<WatchConfig>,
) -> impl IntoResponse {
    // WatchConfig here has to match super::models::WatchConfig. But State Db expects crate::models::WatchConfig.
    // Wait, let's map our local WatchConfig to crate::models::WatchConfig or use it directly once re-exported.
    // Let's cast it:
    let db_cfg = crate::models::WatchConfig {
        pasta: cfg.pasta,
        threshold_levantamento_dias: cfg.threshold_levantamento_dias,
        threshold_faturamento_dias: cfg.threshold_faturamento_dias,
        ativo: cfg.ativo,
    };
    match state.db.save_watch_config(&db_cfg) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar configuração: {}", e) }))).into_response(),
    }
}

// GET /api/import/erp-sync-schedule
pub async fn get_erp_sync_schedule_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_erp_sync_schedule() {
        Ok(cfg) => {
            let horarios = normalize_schedule_times(&cfg.horarios);
            let ultima = state.db.get_erp_sync_last_auto_run().ok().flatten();
            let proxima = if cfg.ativo {
                compute_next_run(&horarios)
            } else {
                None
            };
            let body = ErpSyncScheduleResponse {
                ativo: cfg.ativo,
                horarios,
                ultima_execucao: ultima,
                proxima_execucao: proxima,
            };
            (StatusCode::OK, Json(body)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar agenda de sync ERP: {}", e) })),
        )
            .into_response(),
    }
}

// POST /api/import/erp-sync-schedule
pub async fn save_erp_sync_schedule_handler(
    State(state): State<Arc<AppState>>,
    Json(cfg): Json<ErpSyncScheduleConfig>,
) -> impl IntoResponse {
    let horarios = normalize_schedule_times(&cfg.horarios);
    if cfg.ativo && horarios.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Informe ao menos um horário válido (HH:MM) para o sync automático." })),
        )
            .into_response();
    }

    let normalized = ErpSyncScheduleConfig {
        ativo: cfg.ativo,
        horarios: horarios.clone(),
    };

    match state.db.save_erp_sync_schedule(&normalized) {
        Ok(_) => {
            let proxima = if normalized.ativo {
                compute_next_run(&horarios)
            } else {
                None
            };
            (
                StatusCode::OK,
                Json(json!({
                    "status": "success",
                    "ativo": normalized.ativo,
                    "horarios": horarios,
                    "proxima_execucao": proxima,
                })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar agenda de sync ERP: {}", e) })),
        )
            .into_response(),
    }
}
