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

/// Como `exigir_edicao`, para rotas ligadas a outros módulos de Produção (histórico, ajuste de recálculo, lotes):
/// supervisor passa; senão o operador precisa de "editar" em algum dos `modulos` (os mesmos que o middleware
/// usa em `modulos_da_rota`).
pub fn exigir_edicao_em(ctx: &AuthContext, modulos: &[&str]) -> Result<(), axum::response::Response> {
    if ctx.role.is_supervisor() || modulos.iter().any(|m| ctx.can_edit_module(m)) {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Sem permissão para alterar a Produção." })),
        )
            .into_response())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::geral::auth::models::{OperatorRole, Origem};
    use std::collections::HashMap;

    fn ctx(role: OperatorRole, modulos: &[(&str, &str)]) -> AuthContext {
        AuthContext {
            operator_id: "o1".into(),
            display_name: "Teste".into(),
            role,
            modules: modulos.iter().map(|(m, _)| m.to_string()).collect(),
            permissions: modulos.iter().map(|(m, n)| (m.to_string(), n.to_string())).collect::<HashMap<_, _>>(),
            origem: Origem::Tela,
        }
    }

    #[test]
    fn edicao_em_modulos_da_rota() {
        let lotes = ["producao_lotes", "producao"];
        assert!(exigir_edicao_em(&ctx(OperatorRole::Supervisor, &[]), &lotes).is_ok());
        assert!(exigir_edicao_em(&ctx(OperatorRole::Producao, &[("producao", "edit")]), &lotes).is_ok());
        assert!(exigir_edicao_em(&ctx(OperatorRole::Producao, &[("producao_lotes", "edit")]), &lotes).is_ok());
        assert!(exigir_edicao_em(&ctx(OperatorRole::Producao, &[("producao", "view")]), &lotes).is_err());
        assert!(exigir_edicao_em(&ctx(OperatorRole::Producao, &[("planejamento_producao", "edit")]), &lotes).is_err());
        // exigir_edicao continua só com o Planejamento
        assert!(exigir_edicao(&ctx(OperatorRole::Producao, &[("producao", "edit")])).is_err());
        assert!(exigir_edicao(&ctx(OperatorRole::Producao, &[("planejamento_producao", "edit")])).is_ok());
    }
}
