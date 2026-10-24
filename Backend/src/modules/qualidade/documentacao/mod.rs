pub mod models;
pub mod store;
pub mod handlers;

use std::sync::Arc;
use axum::{
    routing::{get, post, put},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/documentacao/families",
            get(handlers::list_families).post(handlers::create_family),
        )
        .route(
            "/api/qualidade/documentacao/families/:id",
            put(handlers::update_family).delete(handlers::delete_family),
        )
        .route(
            "/api/qualidade/documentacao/types",
            get(handlers::list_types).post(handlers::create_type),
        )
        .route(
            "/api/qualidade/documentacao/types/:id",
            put(handlers::update_type).delete(handlers::delete_type),
        )
        .route(
            "/api/qualidade/documentacao/documents",
            get(handlers::list_documents).post(handlers::create_document),
        )
        .route(
            "/api/qualidade/documentacao/documents/:id",
            get(handlers::get_document)
                .put(handlers::update_document)
                .delete(handlers::delete_document),
        )
        .route(
            "/api/qualidade/documentacao/documents/:id/files",
            post(handlers::upload_file),
        )
        .route(
            "/api/qualidade/documentacao/files/:id",
            get(handlers::download_file).delete(handlers::delete_file),
        )
        .route(
            "/api/qualidade/documentacao/check-alerts",
            post(handlers::check_alerts),
        )
}

/// Ações de leitura da Documentação da Qualidade (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_familias_documentacao",
            "qualidade_documentacao",
            "Lista as famílias de documentos da qualidade.",
            "/api/qualidade/documentacao/families",
            vec![],
        ),
        Acao::leitura(
            "listar_tipos_documentacao",
            "qualidade_documentacao",
            "Lista os tipos de documento.",
            "/api/qualidade/documentacao/types",
            vec![
                param("family_id", "query", "texto", false, "Só tipos desta família."),
            ],
        ),
        Acao::leitura(
            "listar_documentos_documentacao",
            "qualidade_documentacao",
            "Lista os documentos da qualidade (licenças, certificados etc.).",
            "/api/qualidade/documentacao/documents",
            vec![
                param("search", "query", "texto", false, "Texto de busca."),
                param("family_id", "query", "texto", false, "Só desta família."),
                param("payment_status", "query", "texto", false, "Situação de pagamento."),
                param("pending_only", "query", "booleano", false, "Só pendentes."),
            ],
        ),
        Acao::leitura(
            "detalhar_documento_documentacao",
            "qualidade_documentacao",
            "Detalhe de um documento.",
            "/api/qualidade/documentacao/documents/:id",
            vec![
                param("id", "caminho", "texto", true, "Id do documento."),
            ],
        ),
    ]
}
