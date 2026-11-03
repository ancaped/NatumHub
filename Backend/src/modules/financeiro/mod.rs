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
            "Situação da integração financeira: se o token do Tiny está configurado (`isConfigured`), data da última sincronização (`lastSync`) e quantidade de contas a receber e a pagar já importadas. Use para saber se os números do financeiro estão atualizados antes de ler `obter_fluxo_financeiro`.",
            "/api/financeiro/status",
            vec![],
        ),
        Acao::leitura(
            "listar_contas_financeiras",
            "financeiro",
            "Lista contas a receber ou a pagar (`tipo` obrigatório), paginadas: cliente/fornecedor, histórico, documento, emissão, vencimento, valor, saldo e situação. Devolve também `total`, `totalPages`, `totalValor` e `totalSaldo` do filtro. Filtre por situação, busca, vencimento, `overdue`, `dueWithinDays` ou `onlyOpen`; para totais do período use `obter_fluxo_financeiro`.",
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
            "Resumo financeiro do período (padrão: 90 dias atrás até 180 à frente): totais a receber e a pagar em aberto, atrasados e pagos, posição líquida, vencimentos em 7 e 30 dias, % de atraso, envelhecimento, maiores clientes e fornecedores, itens que pedem atenção e o fluxo mês a mês (`flow`). Os valores podem ser aproximados (`valoresSaoAproximados`).",
            "/api/financeiro/fluxo",
            vec![
                param("startDate", "query", "data", false, "Início (90 dias atrás por padrão)."),
                param("endDate", "query", "data", false, "Fim (180 dias à frente por padrão)."),
            ],
        ),
    ]
}
