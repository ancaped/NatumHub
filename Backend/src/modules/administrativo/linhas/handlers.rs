use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde_json::Value;

use crate::core::acao::{Confirmar, ErroApi};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::{classificacao_linha::{classificar_linha as servico_classificar, listar_atendimentos}, prefixo::renomear_prefixo_linha, resumo::resumo_da_linha};

/// POST /api/admin/produtos-ativos/linhas/prefixo (sem `?confirmar=true` só devolve a prévia).
pub async fn trocar_prefixo(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(corpo): Json<Value>,
) -> Response {
    let campo = |k: &str| corpo.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    match renomear_prefixo_linha(state.db.pool(), &ctx, &campo("prefixoAtual"), &campo("prefixoNovo"), c.confirmar).await {
        Ok(r) => Json(r).into_response(),
        Err(e) => e.into_response(),
    }
}

/// GET /api/admin/produtos-ativos/linhas/:prefixo/resumo
pub async fn resumo(State(state): State<Arc<AppState>>, Path(prefixo): Path<String>) -> Response {
    match resumo_da_linha(&state.db, &prefixo).await {
        Ok(v) => Json(v).into_response(),
        Err(e @ ErroApi { .. }) => e.into_response(),
    }
}

/// POST /api/admin/produtos-ativos/linhas/classificacao (sem `?confirmar=true` só devolve a prévia).
pub async fn classificar_linha(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(corpo): Json<Value>,
) -> Response {
    let prefixo = corpo.get("prefixo").and_then(Value::as_str).unwrap_or("");
    let atendimento = corpo.get("atendimento").and_then(Value::as_str).map(str::to_string);
    let ativa = corpo.get("ativa").and_then(Value::as_bool);
    match servico_classificar(state.db.pool(), &ctx, prefixo, atendimento, ativa, c.confirmar).await {
        Ok(r) => Json(r).into_response(),
        Err(e) => e.into_response(),
    }
}

/// GET /api/admin/produtos-ativos/linhas/atendimentos
pub async fn atendimentos(State(state): State<Arc<AppState>>) -> Response {
    match listar_atendimentos(state.db.pool()).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}
