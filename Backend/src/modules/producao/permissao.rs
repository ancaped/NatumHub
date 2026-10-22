//! Quem pode gravar no Planejamento de Produção (quadro semanal, fila de demandas, reatores).
//!
//! Usa o módulo de Permissões que já existe (Configurações → Operadores): o operador precisa do módulo
//! `planejamento_producao` com nível "edit" (supervisor sempre pode). Sem isso, a leitura continua liberada.

use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

use crate::modules::geral::auth::models::AuthContext;

pub const MODULO_PLANEJAMENTO: &str = "planejamento_producao";

pub fn exigir_edicao(ctx: &AuthContext) -> Result<(), axum::response::Response> {
    if ctx.can_edit_module(MODULO_PLANEJAMENTO) {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Sem permissão para alterar o Planejamento de Produção." })),
        )
            .into_response())
    }
}
