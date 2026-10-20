use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
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
    match state.db.get_setting(&key).await {
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
    match state.db.save_setting(&key, &body.value).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// GET /api/import/watch-config
pub async fn get_watch_config_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_watch_config().await {
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
    match state.db.save_watch_config(&db_cfg).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar configuração: {}", e) }))).into_response(),
    }
}

// GET /api/import/erp-sync-schedule
pub async fn get_erp_sync_schedule_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_erp_sync_schedule().await {
        Ok(cfg) => {
            let horarios = normalize_schedule_times(&cfg.horarios);
            let ultima = state.db.get_erp_sync_last_auto_run().await.ok().flatten();
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
                auto_audit_interval_minutes: cfg.auto_audit_interval_minutes,
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
        auto_audit_interval_minutes: cfg.auto_audit_interval_minutes.max(0),
    };

    match state.db.save_erp_sync_schedule(&normalized).await {
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
                    "proxima_execucao": proxima,
                    "auto_audit_interval_minutes": normalized.auto_audit_interval_minutes
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

const REPORT_LOGO_KEY: &str = "report_logo_rel_path";
const POPS_LOGO_KEY: &str = "pops_logo_rel_path";
const REPORT_LOGO_BASE64_KEY: &str = "report_logo_base64";
const REPORT_LOGO_MIME_KEY: &str = "report_logo_mime";

fn logo_mime(rel: &str) -> &'static str {
    if rel.ends_with(".svg") {
        "image/svg+xml"
    } else if rel.ends_with(".png") {
        "image/png"
    } else if rel.ends_with(".webp") {
        "image/webp"
    } else if rel.ends_with(".gif") {
        "image/gif"
    } else {
        "image/jpeg"
    }
}

async fn logo_rel(state: &AppState) -> Result<Option<String>, String> {
    if let Some(rel) = state.db.get_setting(REPORT_LOGO_KEY).await.map_err(|e| e.to_string())? {
        if !rel.trim().is_empty() {
            return Ok(Some(rel));
        }
    }
    if let Some(rel) = state.db.get_setting(POPS_LOGO_KEY).await.map_err(|e| e.to_string())? {
        if !rel.trim().is_empty() {
            return Ok(Some(rel));
        }
    }
    Ok(None)
}

pub async fn get_report_logo(State(state): State<Arc<AppState>>) -> Response {
    // 1. Tenta servir direto do PostgreSQL (persistência no banco/backup)
    if let Ok(Some(b64)) = state.db.get_setting(REPORT_LOGO_BASE64_KEY).await {
        let trimmed = b64.trim();
        if !trimmed.is_empty() {
            if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, trimmed) {
                let mime = state
                    .db
                    .get_setting(REPORT_LOGO_MIME_KEY)
                    .await
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "image/png".to_string());
                return Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, mime)
                    .header(header::CACHE_CONTROL, "no-store")
                    .body(Body::from(bytes))
                    .unwrap_or_else(|_| {
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({ "error": "Falha ao ler a logo" })),
                        )
                            .into_response()
                    });
            }
        }
    }

    // 2. Fallback: tenta ler do disco (Saves/)
    let rel = match logo_rel(&state).await {
        Ok(Some(rel)) => rel,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Logo não configurada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };
    let abs = crate::core::app_config::saves_dir().join(&rel);
    match std::fs::read(&abs) {
        Ok(bytes) => {
            // Backfill no PostgreSQL para backups futuros
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
            let mime = logo_mime(&rel);
            let _ = state.db.save_setting(REPORT_LOGO_BASE64_KEY, &b64).await;
            let _ = state.db.save_setting(REPORT_LOGO_MIME_KEY, mime).await;

            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CACHE_CONTROL, "no-store")
                .body(Body::from(bytes))
                .unwrap_or_else(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": "Falha ao ler a logo" })),
                    )
                        .into_response()
                })
        }
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Arquivo da logo não encontrado" })),
        )
            .into_response(),
    }
}

pub async fn upload_report_logo(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Response {
    let mut filename = String::from("logo.png");
    let mut bytes: Option<Vec<u8>> = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name().unwrap_or("") == "file" {
            if let Some(fname) = field.file_name() {
                filename = fname.to_string();
            }
            match field.bytes().await {
                Ok(data) => bytes = Some(data.to_vec()),
                Err(e) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": e.to_string() })),
                    )
                        .into_response();
                }
            }
        }
    }
    let Some(data) = bytes.filter(|b| !b.is_empty()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo não enviado" })),
        )
            .into_response();
    };
    if data.len() > 2 * 1024 * 1024 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "A logo deve ter no máximo 2 MB" })),
        )
            .into_response();
    }
    let ext = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let allowed = ["png", "jpg", "jpeg", "webp", "gif", "svg"];
    if !allowed.contains(&ext.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Envie uma imagem png, jpg, webp, gif ou svg" })),
        )
            .into_response();
    }
    let rel = format!("branding/logo.{ext}");
    let dir = crate::core::app_config::saves_dir().join("branding");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    if let Err(e) = std::fs::write(crate::core::app_config::saves_dir().join(&rel), &data) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    if let Err(e) = state.db.save_setting(REPORT_LOGO_KEY, &rel).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    // Salva também no banco em base64 para persistência total em pg_dump
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    let mime = logo_mime(&rel);
    let _ = state.db.save_setting(REPORT_LOGO_BASE64_KEY, &b64).await;
    let _ = state.db.save_setting(REPORT_LOGO_MIME_KEY, mime).await;

    (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
}
