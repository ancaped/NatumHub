pub mod handlers;
pub mod models;

use axum::{
    routing::{get, put},
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // ERP Receipts
        .route(
            "/api/qualidade/recebimento-mp/erp",
            get(handlers::list_erp_recebimentos),
        )
        .route(
            "/api/qualidade/recebimento-mp/sync",
            axum::routing::post(handlers::sync_erp_recebimentos),
        )
        // Laudos
        .route(
            "/api/qualidade/recebimento-mp/laudos",
            get(handlers::list_laudos).post(handlers::create_laudo),
        )
        .route(
            "/api/qualidade/recebimento-mp/laudos/:id",
            get(handlers::get_laudo)
                .put(handlers::update_laudo)
                .delete(handlers::delete_laudo),
        )
        // Amostras de Contraprova
        .route(
            "/api/qualidade/recebimento-mp/amostras",
            get(handlers::list_amostras).post(handlers::create_amostra),
        )
        .route(
            "/api/qualidade/recebimento-mp/amostras/:id",
            put(handlers::update_amostra).delete(handlers::delete_amostra),
        )
}

/// Ações de leitura do Recebimento de MP (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_recebimentos_mp_erp",
            "qualidade_recebimento_mp",
            "Lista recebimentos de matéria-prima vindos do ERP.",
            "/api/qualidade/recebimento-mp/erp",
            vec![
                param("search", "query", "texto", false, "Texto de busca."),
                param("classificacao", "query", "texto", false, "Classificação (MATERIA_PRIMA por padrão)."),
                param("limit", "query", "inteiro", false, "Máximo de linhas (200 por padrão)."),
                param("offset", "query", "inteiro", false, "Linhas a pular."),
            ],
        ),
        Acao::leitura(
            "listar_laudos_mp",
            "qualidade_recebimento_mp",
            "Lista laudos de recebimento de MP.",
            "/api/qualidade/recebimento-mp/laudos",
            vec![
                param("search", "query", "texto", false, "Texto de busca."),
                param("limit", "query", "inteiro", false, "Máximo de linhas (100 por padrão)."),
                param("offset", "query", "inteiro", false, "Linhas a pular."),
            ],
        ),
        Acao::leitura(
            "detalhar_laudo_mp",
            "qualidade_recebimento_mp",
            "Detalhe de um laudo de MP.",
            "/api/qualidade/recebimento-mp/laudos/:id",
            vec![
                param("id", "caminho", "inteiro", true, "Id do laudo."),
            ],
        ),
        Acao::leitura(
            "listar_amostras_mp",
            "qualidade_recebimento_mp",
            "Lista amostras de contraprova de MP.",
            "/api/qualidade/recebimento-mp/amostras",
            vec![
                param("search", "query", "texto", false, "Texto de busca."),
                param("limit", "query", "inteiro", false, "Máximo de linhas (100 por padrão)."),
                param("offset", "query", "inteiro", false, "Linhas a pular."),
            ],
        ),
    ]
}
