pub mod models;
pub mod client;
pub mod handlers;

use std::sync::Arc;
use axum::{routing::{get, post}, Router};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/financeiro/status", get(handlers::get_financial_status))
        .route("/api/financeiro/sync", post(handlers::sync_financial_data))
        .route("/api/financeiro/contas", get(handlers::get_financial_accounts))
        .route("/api/financeiro/fluxo", get(handlers::get_financial_flow))
        .route("/api/financeiro/token", post(handlers::save_tiny_token))
}

/// Ações de leitura do Financeiro (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "obter_status_financeiro",
            "financeiro",
            "Situação da integração financeira: última sincronização e quantidade de contas.",
            "/api/financeiro/status",
            vec![],
        ),
        Acao::leitura(
            "listar_contas_financeiras",
            "financeiro",
            "Lista contas a receber ou a pagar, paginadas.",
            "/api/financeiro/contas",
            vec![
                param("tipo", "query", "texto", true, "receber ou pagar."),
                param("situacao", "query", "texto", false, "Situação da conta."),
                param("search", "query", "texto", false, "Cliente, histórico ou documento."),
                param("startDate", "query", "data", false, "Vencimento inicial (AAAA-MM-DD)."),
                param("endDate", "query", "data", false, "Vencimento final (AAAA-MM-DD)."),
                param("page", "query", "inteiro", false, "Página, a partir de 1."),
                param("limit", "query", "inteiro", false, "Linhas por página (100 por padrão, máximo 500)."),
                param("overdue", "query", "texto", false, "true: só em aberto vencidas."),
                param("dueWithinDays", "query", "inteiro", false, "Em aberto que vencem nos próximos N dias."),
                param("onlyOpen", "query", "texto", false, "true: só em aberto ou parciais."),
            ],
        ),
        Acao::leitura(
            "obter_fluxo_financeiro",
            "financeiro",
            "Totais e fluxo de caixa a receber e a pagar no período.",
            "/api/financeiro/fluxo",
            vec![
                param("startDate", "query", "data", false, "Início (90 dias atrás por padrão)."),
                param("endDate", "query", "data", false, "Fim (180 dias à frente por padrão)."),
            ],
        ),
    ]
}
