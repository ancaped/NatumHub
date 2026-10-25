//! Histórico de produção (lançamentos manuais em /api/historico).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, put},
    Extension, Json, Router,
};
use serde_json::json;
use std::sync::Arc;

use crate::core::acao::{executar_em_2_passos, Confirmar, ErroApi};
use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;
use crate::models::{HistoryQueryParams, NewProducaoEntry};
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::{auditoria, permissao};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/historico", get(list_producao).post(add_producao))
        .route("/api/historico/:id", delete(delete_producao))
        .route("/api/historico/:id/lote", put(update_producao_lote))
}

/// Ações de consulta do histórico de produção descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    vec![Acao::leitura(
        "listar_historico_producao",
        "producao",
        "Lista os lançamentos de produção (data, produto, quantidade, lote ERP, snapshot do estoque na hora do lançamento).",
        "/api/historico",
        vec![
            param("search", "query", "texto", false, "Código ou descrição do produto."),
            param("linha", "query", "texto", false, "Linha de produto (ou KITS)."),
            param("data", "query", "data", false, "Data da produção (AAAA-MM-DD)."),
            param("sort", "query", "texto", false, "Campo de ordenação."),
            param("order", "query", "texto", false, "asc ou desc."),
        ],
    )]
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateLotePayload {
    pub lote_erp: Option<String>,
}



// 10. POST /api/historico
pub async fn add_producao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(entry): Json<NewProducaoEntry>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao_em(&ctx, crate::modules::geral::auth::store::modulos_da_rota("/api/historico").unwrap_or(&[])) {
        return r;
    }
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
        Ok(r) => {
            auditoria::registrar(
                state.db.pool(),
                &ctx.display_name,
                "lancar_producao",
                &entry.codigo,
                json!({
                    "id": r.id, "dataProducao": entry.data_producao, "quantidade": entry.quantidade,
                    "loteErp": entry.lote_erp, "consumeBase": entry.consume_base.unwrap_or(false),
                    "baseCode": entry.base_code, "baseDescontadaKg": r.base_descontada_kg, "aviso": r.aviso,
                }),
            )
            .await;
            (
                StatusCode::CREATED,
                Json(json!({
                    "status": "success", "id": r.id, "message": "Produção lançada com sucesso!",
                    "baseDescontadaKg": r.base_descontada_kg, "aviso": r.aviso,
                })),
            ).into_response()
        }
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
// Escrita em 2 passos: sem `confirmar=true` só devolve a prévia do que seria estornado.
pub async fn delete_producao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(q): Query<Confirmar>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao_em(&ctx, crate::modules::geral::auth::store::modulos_da_rota("/api/historico").unwrap_or(&[])) {
        return r;
    }
    let pool = state.db.pool();
    let r = executar_em_2_passos(pool, "estornar_producao", q.confirmar, |tx| {
        Box::pin(async move {
            crate::core::db::estornar_producao(&mut **tx, id)
                .await?
                .ok_or_else(|| ErroApi::nao_encontrado("Lançamento de produção não encontrado."))
        })
    })
    .await;
    match r {
        Ok(r) if r.previa => (
            StatusCode::OK,
            Json(json!({ "previa": true, "acao": "estornar_producao", "item": r.resultado, "confirmar": "repita com confirmar=true para estornar" })),
        )
            .into_response(),
        Ok(r) => {
            let codigo = r.resultado["codigo"].as_str().unwrap_or_default().to_string();
            auditoria::registrar(pool, &ctx.display_name, "estornar_producao", &codigo, r.resultado.clone()).await;
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "message": "Produção estornada/excluída com sucesso!", "item": r.resultado })),
            )
                .into_response()
        }
        Err(e) => e.into_response(),
    }
}

// 12b. PUT /api/historico/:id/lote
pub async fn update_producao_lote(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateLotePayload>,
) -> impl IntoResponse {
    if let Err(r) = permissao::exigir_edicao_em(&ctx, crate::modules::geral::auth::store::modulos_da_rota("/api/historico").unwrap_or(&[])) {
        return r;
    }
    let antes: Option<String> = sqlx::query_scalar("SELECT lote_erp FROM historico_producao WHERE id = $1")
        .bind(id)
        .fetch_optional(state.db.pool())
        .await
        .ok()
        .flatten();
    match state.db.update_producao_lote(id, payload.lote_erp.as_deref()).await {
        Ok(_) => {
            auditoria::registrar(
                state.db.pool(),
                &ctx.display_name,
                "vincular_lote_producao",
                &id.to_string(),
                json!({ "antes": antes, "depois": payload.lote_erp }),
            )
            .await;
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "message": "Lote ERP atualizado com sucesso!" })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao atualizar Lote ERP: {}", e) }))
        ).into_response(),
    }
}
