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

use super::{prefixo::renomear_prefixo_linha, resumo::resumo_da_linha};

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
