use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::models::{
    AcompanhamentoQueryParams, SaveLoteCustomStatusPayload, BatchLoteCustomStatusPayload,
    SaveLotePrevisaoPayload, CreateTerceirizadoSolicitacaoPayload, VincularTerceirizadoPayload,
    SaveProgramacaoEnvasePayload, ReorderProgramacaoEnvasePayload, SaveFichaOrdemPayload,
    SaveProgramacaoRotulagemPayload, ReorderProgramacaoRotulagemPayload, ProgramacaoRotulagemQuery,
    SaveLoteTimestampsPayload, QuadroAcaoPayload, SaveLoteEtapaStatusPayload
};
use super::store;

#[derive(Debug, serde::Deserialize)]
pub struct ProgramacaoEnvaseQuery {
    pub data: Option<String>,
}

fn err(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

pub async fn get_acompanhamento_producao(
    State(state): State<Arc<AppState>>,
    Query(params): Query<AcompanhamentoQueryParams>,
) -> impl IntoResponse {
    match store::list_acompanhamento(state.db.pool(), &params).await {
        Ok(items) => (StatusCode::OK, Json(items)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao listar: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_lote_custom_status(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut payload): Json<SaveLoteCustomStatusPayload>,
) -> impl IntoResponse {
    if payload.updated_by.as_deref().unwrap_or("").trim().is_empty() {
        payload.updated_by = Some(ctx.display_name.clone());
    }

    match store::upsert_status(state.db.pool(), &payload).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Status atualizado com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao salvar status: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_ficha_ordem(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut payload): Json<SaveFichaOrdemPayload>,
) -> impl IntoResponse {
    if payload.updated_by.as_deref().unwrap_or("").trim().is_empty() {
        payload.updated_by = Some(ctx.display_name.clone());
    }

    match store::save_ficha_ordem(state.db.pool(), &payload).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Ficha da ordem salva com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao salvar ficha da ordem: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_batch_lote_custom_status(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut payload): Json<BatchLoteCustomStatusPayload>,
) -> impl IntoResponse {
    if payload.updated_by.as_deref().unwrap_or("").trim().is_empty() {
        payload.updated_by = Some(ctx.display_name.clone());
    }

    match store::save_batch_lote_custom_status(state.db.pool(), &payload).await {
        Ok(count) => (
            StatusCode::OK,
            Json(json!({ "success": true, "updatedCount": count })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao salvar status em lote: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_lote_previsao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(mut payload): Json<SaveLotePrevisaoPayload>,
) -> impl IntoResponse {
    if payload.updated_by.as_deref().unwrap_or("").trim().is_empty() {
        payload.updated_by = Some(ctx.display_name.clone());
    }

    match store::save_lote_previsao(
        state.db.pool(),
        &lote_number,
        payload.data_previsao.as_deref(),
        payload.updated_by.as_deref(),
        payload.fornecedor_terceirizado.as_deref(),
    )
    .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Previsão de produção salva com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao salvar previsão: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_lote_timestamps(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(mut payload): Json<SaveLoteTimestampsPayload>,
) -> impl IntoResponse {
    payload.lote_number = lote_number;
    if payload.updated_by.as_deref().unwrap_or("").trim().is_empty() {
        payload.updated_by = Some(ctx.display_name.clone());
    }

    match store::save_lote_timestamps(state.db.pool(), &payload).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Datas e horários atualizados com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao salvar timestamps: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn delete_lote_custom_status(
    State(state): State<Arc<AppState>>,
    _ctx: Extension<AuthContext>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    match store::delete_status(state.db.pool(), &lote_number).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Status resetado com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao deletar status: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn get_lote_history(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    match store::get_lote_history(state.db.pool(), &lote_number).await {
        Ok(items) => (StatusCode::OK, Json(items)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao buscar histórico: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct ToggleTerceirizadoPayload {
    pub is_terceirizado: bool,
}

pub async fn toggle_terceirizado(
    State(state): State<Arc<AppState>>,
    _ctx: Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(payload): Json<ToggleTerceirizadoPayload>,
) -> impl IntoResponse {
    match store::set_lote_terceirizado(state.db.pool(), &lote_number, payload.is_terceirizado).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Classificação terceirizado atualizada com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao alterar terceirizado: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

// -------------------------------------------------------------
// Terceirizados: Solicitações
// -------------------------------------------------------------

pub async fn get_terceirizados_solicitacoes(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match store::list_terceirizados_solicitacoes(state.db.pool()).await {
        Ok(items) => (StatusCode::OK, Json(items)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao listar solicitações: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn create_terceirizados_solicitacao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut payload): Json<CreateTerceirizadoSolicitacaoPayload>,
) -> impl IntoResponse {
    if payload.solicitado_por.as_deref().unwrap_or("").trim().is_empty() {
        payload.solicitado_por = Some(ctx.display_name.clone());
    }

    match store::create_terceirizados_solicitacao(state.db.pool(), &payload).await {
        Ok(id) => (
            StatusCode::CREATED,
            Json(json!({ "success": true, "id": id, "message": "Solicitação criada com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao criar solicitação: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn vincular_terceirizado_solicitacao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<VincularTerceirizadoPayload>,
) -> impl IntoResponse {
    match store::vincular_terceirizado_lote(state.db.pool(), id, &payload.lote_number).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Lote vinculado com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao vincular lote: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn desvincular_terceirizado_solicitacao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    match store::desvincular_terceirizado_lote(state.db.pool(), id).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Lote desvinculado com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao desvincular lote: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn delete_terceirizados_solicitacao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    match store::delete_terceirizados_solicitacao(state.db.pool(), id).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Solicitação removida com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao remover solicitação: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn aprovar_terceirizado_solicitacao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(payload): Json<super::models::AprovarTerceirizadoPayload>,
) -> impl IntoResponse {
    let aprovador = payload.aprovado_por.unwrap_or(ctx.display_name);
    match store::aprovar_terceirizado_solicitacao(
        state.db.pool(),
        id,
        &payload.tipo,
        payload.aprovado,
        &aprovador,
    )
    .await
    {
        Ok(item) => (StatusCode::OK, Json(item)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao aprovar etapa: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn update_terceirizado_previsao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(payload): Json<super::models::UpdateTerceirizadoPrevisaoPayload>,
) -> impl IntoResponse {
    let updated_by = payload.updated_by.unwrap_or(ctx.display_name);
    match store::update_terceirizado_previsao(
        state.db.pool(),
        id,
        payload.previsao_entrega.as_deref(),
        Some(&updated_by),
    )
    .await
    {
        Ok(item) => (StatusCode::OK, Json(item)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao atualizar previsão da solicitação: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}


pub async fn lookup_produto_terceirizado(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    match store::lookup_produto_terceirizado(state.db.pool(), &code).await {
        Ok(Some(item)) => (StatusCode::OK, Json(item)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Produto não encontrado"),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao consultar produto: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

// -------------------------------------------------------------
// Google Sheets Sync
// -------------------------------------------------------------

pub async fn get_sheets_config(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match store::get_sheets_config(state.db.pool()).await {
        Ok(config) => (StatusCode::OK, Json(config)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao carregar config Sheets: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_sheets_config(
    State(state): State<Arc<AppState>>,
    _ctx: Extension<AuthContext>,
    Json(payload): Json<super::models::SaveSheetsConfigPayload>,
) -> impl IntoResponse {
    match store::save_sheets_config(state.db.pool(), &payload).await {
        Ok(config) => (StatusCode::OK, Json(config)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao salvar config Sheets: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn sync_sheets_now(
    State(state): State<Arc<AppState>>,
    _ctx: Extension<AuthContext>,
) -> impl IntoResponse {
    match store::trigger_sheets_sync(state.db.pool()).await {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao sincronizar Sheets: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

// -------------------------------------------------------------
// Programação de Envase
// -------------------------------------------------------------

pub async fn get_programacao_envase(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ProgramacaoEnvaseQuery>,
) -> impl IntoResponse {
    let data = query.data.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    match store::list_programacao_envase(state.db.pool(), &data).await {
        Ok(items) => (StatusCode::OK, Json(items)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao listar programacao envase: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_programacao_envase(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut payload): Json<SaveProgramacaoEnvasePayload>,
) -> impl IntoResponse {
    if payload.created_by.as_deref().unwrap_or("").trim().is_empty() {
        payload.created_by = Some(ctx.display_name.clone());
    }

    match store::save_programacao_envase(state.db.pool(), &payload).await {
        Ok(item) => (StatusCode::OK, Json(item)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao salvar programacao envase: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn delete_programacao_envase(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    match store::delete_programacao_envase(state.db.pool(), id).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao excluir programacao envase: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn delete_programacao_envase_by_lote(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    match store::delete_programacao_envase_by_lote(state.db.pool(), &lote_number).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao excluir programacao envase por lote: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn reorder_programacao_envase(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ReorderProgramacaoEnvasePayload>,
) -> impl IntoResponse {
    match store::reorder_programacao_envase(state.db.pool(), &payload).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao reordenar programacao envase: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

// -------------------------------------------------------------
// Programação de Rotulagem
// -------------------------------------------------------------

pub async fn get_programacao_rotulagem(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ProgramacaoRotulagemQuery>,
) -> impl IntoResponse {
    let data = query.data.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    match store::list_programacao_rotulagem(state.db.pool(), &data).await {
        Ok(items) => (StatusCode::OK, Json(items)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao listar programacao rotulagem: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_programacao_rotulagem(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut payload): Json<SaveProgramacaoRotulagemPayload>,
) -> impl IntoResponse {
    if payload.created_by.as_deref().unwrap_or("").trim().is_empty() {
        payload.created_by = Some(ctx.display_name.clone());
    }

    match store::save_programacao_rotulagem(state.db.pool(), &payload).await {
        Ok(item) => (StatusCode::OK, Json(item)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao salvar programacao rotulagem: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn delete_programacao_rotulagem(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    match store::delete_programacao_rotulagem(state.db.pool(), id).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao excluir programacao rotulagem: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn delete_programacao_rotulagem_by_lote(
    State(state): State<Arc<AppState>>,
    Path(lote_number): Path<String>,
) -> impl IntoResponse {
    match store::delete_programacao_rotulagem_by_lote(state.db.pool(), &lote_number).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao excluir programacao rotulagem por lote: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn reorder_programacao_rotulagem(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ReorderProgramacaoRotulagemPayload>,
) -> impl IntoResponse {
    match store::reorder_programacao_rotulagem(state.db.pool(), &payload).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao reordenar programacao rotulagem: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn ocultar_quadro_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(payload): Json<QuadroAcaoPayload>,
) -> impl IntoResponse {
    let updated_by = if ctx.display_name.trim().is_empty() {
        "Operador".to_string()
    } else {
        ctx.display_name
    };

    match store::ocultar_quadro_lote(state.db.pool(), &lote_number, &payload.quadro, Some(&updated_by)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Lote removido do quadro com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao ocultar lote do quadro: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn restaurar_quadro_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(payload): Json<QuadroAcaoPayload>,
) -> impl IntoResponse {
    let updated_by = if ctx.display_name.trim().is_empty() {
        "Operador".to_string()
    } else {
        ctx.display_name
    };

    match store::restaurar_quadro_lote(state.db.pool(), &lote_number, &payload.quadro, Some(&updated_by)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Quadro restaurado para o lote com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao restaurar quadro do lote: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_lote_etapa_status(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(mut payload): Json<SaveLoteEtapaStatusPayload>,
) -> impl IntoResponse {
    if payload.updated_by.as_deref().unwrap_or("").trim().is_empty() {
        payload.updated_by = Some(ctx.display_name.clone());
    }

    match store::save_lote_etapa_status(state.db.pool(), &payload, &lote_number).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "success": true, "message": "Status da etapa atualizado com sucesso!" })),
        )
            .into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro ao salvar status da etapa: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

