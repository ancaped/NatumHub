//! Histórico de produção (lançamentos manuais em /api/historico).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, put},
    Json, Router,
};
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::models::{HistoryQueryParams, NewProducaoEntry};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/historico", get(list_producao).post(add_producao))
        .route("/api/historico/:id", delete(delete_producao))
        .route("/api/historico/:id/lote", put(update_producao_lote))
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateLotePayload {
    pub lote_erp: Option<String>,
}



// 10. POST /api/historico
pub async fn add_producao(
    State(state): State<Arc<AppState>>,
    Json(entry): Json<NewProducaoEntry>,
) -> impl IntoResponse {
    if entry.codigo.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Código do produto não pode ser vazio" }))
        ).into_response();
    }
    if entry.quantidade <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Quantidade deve ser maior que zero" }))
        ).into_response();
    }
    if entry.data_producao.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Data da produção não pode ser vazia" }))
        ).into_response();
    }

    match state.db.add_producao_entry(&entry).await {
        Ok(id) => (
            StatusCode::CREATED,
            Json(json!({ "status": "success", "id": id, "message": "Produção lançada com sucesso!" }))
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar lançamento de produção: {}", e) }))
        ).into_response(),
    }
}

// 11. GET /api/historico
pub async fn list_producao(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HistoryQueryParams>,
) -> impl IntoResponse {
    match state.db.list_producao_history(&params).await {
        Ok(records) => (StatusCode::OK, Json(records)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao listar histórico de produção: {}", e) }))
        ).into_response(),
    }
}

// 12. DELETE /api/historico/:id
pub async fn delete_producao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    match state.db.delete_producao_entry(id).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "status": "success", "message": "Produção estornada/excluída com sucesso!" }))
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao estornar produção: {}", e) }))
        ).into_response(),
    }
}

// 12b. PUT /api/historico/:id/lote
pub async fn update_producao_lote(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateLotePayload>,
) -> impl IntoResponse {
    match state.db.update_producao_lote(id, payload.lote_erp.as_deref()).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "status": "success", "message": "Lote ERP atualizado com sucesso!" }))
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao atualizar Lote ERP: {}", e) }))
        ).into_response(),
    }
}
