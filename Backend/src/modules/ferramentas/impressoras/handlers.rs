use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::{
    models::{
        CreatePrintJobRequest, CreatePrinterRequest, SystemPrinterInfo,
        UpdatePrinterRequest,
    },
    store,
};

#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

#[derive(Deserialize)]
pub struct JobsQuery {
    pub limit: Option<i64>,
}

pub async fn list_printers_handler(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    if let Err(e) = store::ensure_tables(pool).await {
        eprintln!("[impressoras] ensure_tables erro: {:?}", e);
    }

    match store::list_printers(pool).await {
        Ok(list) => (StatusCode::OK, Json(ApiResponse::ok(list))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Erro ao listar impressoras: {}", e))),
        ),
    }
}

pub async fn get_printer_handler(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    match store::get_printer(pool, &id).await {
        Ok(Some(printer)) => (StatusCode::OK, Json(ApiResponse::ok(printer))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("Impressora não encontrada.")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Erro ao buscar impressora: {}", e))),
        ),
    }
}

pub async fn create_printer_handler(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Json(req): Json<CreatePrinterRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let _ = store::ensure_tables(pool).await;

    match store::create_printer(pool, req).await {
        Ok(printer) => (StatusCode::CREATED, Json(ApiResponse::ok(printer))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Erro ao cadastrar impressora: {}", e))),
        ),
    }
}

pub async fn update_printer_handler(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(req): Json<UpdatePrinterRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    match store::update_printer(pool, &id, req).await {
        Ok(printer) => (StatusCode::OK, Json(ApiResponse::ok(printer))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Erro ao atualizar impressora: {}", e))),
        ),
    }
}

pub async fn delete_printer_handler(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    match store::delete_printer(pool, &id).await {
        Ok(true) => (
            StatusCode::OK,
            Json(ApiResponse::ok(serde_json::json!({ "deleted": true }))),
        ),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("Impressora não encontrada.")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Erro ao remover impressora: {}", e))),
        ),
    }
}

pub async fn scan_system_printers_handler(
    Extension(_ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    let list: Vec<SystemPrinterInfo> = store::scan_system_printers();
    (StatusCode::OK, Json(ApiResponse::ok(list)))
}

pub async fn list_print_jobs_handler(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Query(q): Query<JobsQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let limit = q.limit.unwrap_or(50).clamp(1, 200);

    match store::list_print_jobs(pool, limit).await {
        Ok(jobs) => (StatusCode::OK, Json(ApiResponse::ok(jobs))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Erro ao listar trabalhos de impressão: {}", e))),
        ),
    }
}

pub async fn create_print_job_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(req): Json<CreatePrintJobRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let operator_id = Some(ctx.operator_id.clone());
    let operator_name = Some(format!("Operador #{}", ctx.operator_id));

    match store::create_print_job(pool, operator_id, operator_name, req).await {
        Ok(job) => (StatusCode::CREATED, Json(ApiResponse::ok(job))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Erro ao enfileirar trabalho de impressão: {}", e))),
        ),
    }
}

pub async fn direct_print_handler(
    Extension(_ctx): Extension<AuthContext>,
    Json(req): Json<super::direct_print::DirectPrintRequest>,
) -> impl IntoResponse {
    let joined = tokio::task::spawn_blocking(move || super::direct_print::print_labels(req)).await;
    match joined {
        Ok(Ok(())) => (
            StatusCode::OK,
            Json(ApiResponse::ok(serde_json::json!({ "printed": true }))),
        ),
        Ok(Err(message)) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err(message)),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Falha ao imprimir: {e}"))),
        ),
    }
}

pub async fn cancel_print_job_handler(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    match store::cancel_print_job(pool, &id).await {
        Ok(true) => (
            StatusCode::OK,
            Json(ApiResponse::ok(serde_json::json!({ "cancelled": true }))),
        ),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("Trabalho não encontrado ou já concluído.")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err(format!("Erro ao cancelar trabalho: {}", e))),
        ),
    }
}
