use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::core::acao::{Confirmar, ErroApi};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::{
    MODULE_ADMIN_ACOMPANHAMENTO_PRODUCAO, MODULE_PLANEJAMENTO_PRODUCAO, MODULE_PRODUCAO,
};

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

/// Quem pode gravar no Acompanhamento: "editar" em qualquer um dos módulos que dão acesso à rota
/// (mesmo conjunto de `modulos_da_rota` para `/api/administrativo`). Supervisor sempre pode.
pub(super) fn exigir_edicao(ctx: &AuthContext) -> Result<(), ErroApi> {
    let pode = [MODULE_ADMIN_ACOMPANHAMENTO_PRODUCAO, MODULE_PRODUCAO, MODULE_PLANEJAMENTO_PRODUCAO]
        .iter()
        .any(|m| ctx.can_edit_module(m));
    if pode {
        Ok(())
    } else {
        Err(ErroApi::sem_permissao("Sem permissão para alterar o Acompanhamento de Produção."))
    }
}

fn exigir_supervisor(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() {
        Ok(())
    } else {
        Err(ErroApi::novo(StatusCode::FORBIDDEN, "apenas_supervisor", "Apenas o supervisor pode executar esta ação."))
    }
}

/// O autor de toda gravação é o usuário logado, nunca um nome vindo do corpo.
fn autor(ctx: &AuthContext) -> String {
    let n = ctx.display_name.trim();
    if n.is_empty() { "Operador".to_string() } else { n.to_string() }
}

/// Erro de gravação vindo do store como texto: registra no log e devolve 500 padronizado.
fn interno(contexto: &str, e: String) -> ErroApi {
    eprintln!("[AcompanhamentoProducao] {contexto}: {e}");
    ErroApi::interno(e)
}

fn ok(v: serde_json::Value) -> Response {
    (StatusCode::OK, Json(v)).into_response()
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

/// Auditoria somente leitura: possíveis lotes duplicados e vínculos suspeitos.
pub async fn get_auditoria_lotes(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match store::auditoria_lotes(state.db.pool()).await {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => {
            eprintln!("[AcompanhamentoProducao] Erro na auditoria de lotes: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, e)
        }
    }
}

pub async fn save_lote_custom_status(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut payload): Json<SaveLoteCustomStatusPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    payload.updated_by = Some(autor(&ctx));
    store::upsert_status(state.db.pool(), &payload).await?;
    Ok(ok(json!({ "success": true, "message": "Status atualizado com sucesso!" })))
}

pub async fn save_ficha_ordem(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(mut payload): Json<SaveFichaOrdemPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    payload.updated_by = Some(autor(&ctx));
    store::save_ficha_ordem(state.db.pool(), &payload).await?;
    Ok(ok(json!({ "success": true, "message": "Ficha da ordem salva com sucesso!" })))
}

/// Status em lote. Com status preenchido grava (tudo ou nada). Com status vazio/ausente é o reset (apaga a linha de
/// cada lote): 2 passos, `?confirmar=true`; sem ele só devolve a prévia do que seria apagado.
pub async fn save_batch_lote_custom_status(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(mut payload): Json<BatchLoteCustomStatusPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let quem = autor(&ctx);
    payload.updated_by = Some(quem.clone());
    if payload.lote_numbers.is_empty() {
        return Ok(ok(json!({ "success": true, "updatedCount": 0 })));
    }
    let tem_status = payload.custom_status.as_deref().is_some_and(|s| !s.trim().is_empty());
    if tem_status {
        let n = store::save_batch_lote_custom_status(state.db.pool(), &payload).await?;
        return Ok(ok(json!({ "success": true, "updatedCount": n })));
    }
    let r = store::apagar_status_lotes(state.db.pool(), &payload.lote_numbers, &quem, c.confirmar).await?;
    let n = r.resultado.len();
    let mut corpo = serde_json::to_value(&r).unwrap_or_else(|_| json!({}));
    corpo["success"] = json!(true);
    corpo["updatedCount"] = json!(if c.confirmar { n } else { 0 });
    Ok(ok(corpo))
}

pub async fn save_lote_previsao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(payload): Json<SaveLotePrevisaoPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let quem = autor(&ctx);
    store::save_lote_previsao(
        state.db.pool(),
        &lote_number,
        payload.data_previsao.as_deref(),
        Some(&quem),
        payload.fornecedor_terceirizado.as_deref(),
    )
    .await?;
    Ok(ok(json!({ "success": true, "message": "Previsão de produção salva com sucesso!" })))
}

pub async fn save_lote_timestamps(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(mut payload): Json<SaveLoteTimestampsPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    payload.lote_number = lote_number;
    payload.updated_by = Some(autor(&ctx));
    store::save_lote_timestamps(state.db.pool(), &payload).await?;
    Ok(ok(json!({ "success": true, "message": "Datas e horários atualizados com sucesso!" })))
}

/// Redefine o status do lote (apaga a linha inteira). 2 passos: `?confirmar=true` grava; sem ele só a prévia.
pub async fn delete_lote_custom_status(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let r = store::apagar_status_lotes(state.db.pool(), &[lote_number], &autor(&ctx), c.confirmar).await?;
    let mut corpo = serde_json::to_value(&r).unwrap_or_else(|_| json!({}));
    corpo["success"] = json!(true);
    if c.confirmar {
        corpo["message"] = json!("Status resetado com sucesso!");
    }
    Ok(ok(corpo))
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
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(payload): Json<ToggleTerceirizadoPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::set_lote_terceirizado(state.db.pool(), &lote_number, payload.is_terceirizado)
        .await
        .map_err(|e| interno("Erro ao alterar terceirizado", e))?;
    Ok(ok(json!({ "success": true, "message": "Classificação terceirizado atualizada com sucesso!" })))
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
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    payload.solicitado_por = Some(autor(&ctx));
    let id = store::create_terceirizados_solicitacao(state.db.pool(), &payload)
        .await
        .map_err(|e| interno("Erro ao criar solicitação", e))?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "success": true, "id": id, "message": "Solicitação criada com sucesso!" })),
    )
        .into_response())
}

pub async fn vincular_terceirizado_solicitacao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(payload): Json<VincularTerceirizadoPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::vincular_terceirizado_lote(state.db.pool(), id, &payload.lote_number)
        .await
        .map_err(|e| interno("Erro ao vincular lote", e))?;
    Ok(ok(json!({ "success": true, "message": "Lote vinculado com sucesso!" })))
}

pub async fn desvincular_terceirizado_solicitacao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::desvincular_terceirizado_lote(state.db.pool(), id)
        .await
        .map_err(|e| interno("Erro ao desvincular lote", e))?;
    Ok(ok(json!({ "success": true, "message": "Lote desvinculado com sucesso!" })))
}

pub async fn delete_terceirizados_solicitacao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::delete_terceirizados_solicitacao(state.db.pool(), id)
        .await
        .map_err(|e| interno("Erro ao remover solicitação", e))?;
    Ok(ok(json!({ "success": true, "message": "Solicitação removida com sucesso!" })))
}

pub async fn aprovar_terceirizado_solicitacao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(payload): Json<super::models::AprovarTerceirizadoPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let aprovador = autor(&ctx);
    let item = store::aprovar_terceirizado_solicitacao(
        state.db.pool(),
        id,
        &payload.tipo,
        payload.aprovado,
        &aprovador,
    )
    .await
    .map_err(|e| interno("Erro ao aprovar etapa", e))?;
    Ok((StatusCode::OK, Json(item)).into_response())
}

pub async fn update_terceirizado_previsao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(payload): Json<super::models::UpdateTerceirizadoPrevisaoPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let updated_by = autor(&ctx);
    let item = store::update_terceirizado_previsao(
        state.db.pool(),
        id,
        payload.previsao_entrega.as_deref(),
        Some(&updated_by),
    )
    .await
    .map_err(|e| interno("Erro ao atualizar previsão da solicitação", e))?;
    Ok((StatusCode::OK, Json(item)).into_response())
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
// Google Sheets Sync (envia todos os lotes para uma URL externa: só supervisor grava/dispara)
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
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<super::models::SaveSheetsConfigPayload>,
) -> Result<Response, ErroApi> {
    exigir_supervisor(&ctx)?;
    let config = store::save_sheets_config(state.db.pool(), &payload)
        .await
        .map_err(|e| interno("Erro ao salvar config Sheets", e))?;
    Ok((StatusCode::OK, Json(config)).into_response())
}

pub async fn sync_sheets_now(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> Result<Response, ErroApi> {
    exigir_supervisor(&ctx)?;
    let res = store::trigger_sheets_sync(state.db.pool())
        .await
        .map_err(|e| interno("Erro ao sincronizar Sheets", e))?;
    Ok((StatusCode::OK, Json(res)).into_response())
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
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    payload.created_by = Some(autor(&ctx));
    let item = store::save_programacao_envase(state.db.pool(), &payload)
        .await
        .map_err(|e| interno("Erro ao salvar programacao envase", e))?;
    Ok((StatusCode::OK, Json(item)).into_response())
}

pub async fn delete_programacao_envase(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::delete_programacao_envase(state.db.pool(), id)
        .await
        .map_err(|e| interno("Erro ao excluir programacao envase", e))?;
    Ok(ok(json!({ "success": true })))
}

pub async fn delete_programacao_envase_by_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::delete_programacao_envase_by_lote(state.db.pool(), &lote_number)
        .await
        .map_err(|e| interno("Erro ao excluir programacao envase por lote", e))?;
    Ok(ok(json!({ "success": true })))
}

pub async fn reorder_programacao_envase(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<ReorderProgramacaoEnvasePayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::reorder_programacao_envase(state.db.pool(), &payload)
        .await
        .map_err(|e| interno("Erro ao reordenar programacao envase", e))?;
    Ok(ok(json!({ "success": true })))
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
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    payload.created_by = Some(autor(&ctx));
    let item = store::save_programacao_rotulagem(state.db.pool(), &payload)
        .await
        .map_err(|e| interno("Erro ao salvar programacao rotulagem", e))?;
    Ok((StatusCode::OK, Json(item)).into_response())
}

pub async fn delete_programacao_rotulagem(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::delete_programacao_rotulagem(state.db.pool(), id)
        .await
        .map_err(|e| interno("Erro ao excluir programacao rotulagem", e))?;
    Ok(ok(json!({ "success": true })))
}

pub async fn delete_programacao_rotulagem_by_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::delete_programacao_rotulagem_by_lote(state.db.pool(), &lote_number)
        .await
        .map_err(|e| interno("Erro ao excluir programacao rotulagem por lote", e))?;
    Ok(ok(json!({ "success": true })))
}

pub async fn reorder_programacao_rotulagem(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<ReorderProgramacaoRotulagemPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    store::reorder_programacao_rotulagem(state.db.pool(), &payload)
        .await
        .map_err(|e| interno("Erro ao reordenar programacao rotulagem", e))?;
    Ok(ok(json!({ "success": true })))
}

pub async fn ocultar_quadro_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(payload): Json<QuadroAcaoPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let updated_by = autor(&ctx);
    store::ocultar_quadro_lote(state.db.pool(), &lote_number, &payload.quadro, Some(&updated_by))
        .await
        .map_err(|e| interno("Erro ao ocultar lote do quadro", e))?;
    Ok(ok(json!({ "success": true, "message": "Lote removido do quadro com sucesso!" })))
}

pub async fn restaurar_quadro_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(payload): Json<QuadroAcaoPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let updated_by = autor(&ctx);
    store::restaurar_quadro_lote(state.db.pool(), &lote_number, &payload.quadro, Some(&updated_by))
        .await
        .map_err(|e| interno("Erro ao restaurar quadro do lote", e))?;
    Ok(ok(json!({ "success": true, "message": "Quadro restaurado para o lote com sucesso!" })))
}

pub async fn save_lote_etapa_status(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(lote_number): Path<String>,
    Json(mut payload): Json<SaveLoteEtapaStatusPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    payload.updated_by = Some(autor(&ctx));
    store::save_lote_etapa_status(state.db.pool(), &payload, &lote_number).await?;
    Ok(ok(json!({ "success": true, "message": "Status da etapa atualizado com sucesso!" })))
}
