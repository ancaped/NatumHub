pub mod formularios;
pub mod handlers;
pub mod models;
pub mod store;

use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/pops/sectors",
            get(handlers::list_sectors).post(handlers::create_sector),
        )
        .route(
            "/api/qualidade/pops/documents",
            get(handlers::list_documents).post(handlers::create_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id",
            get(handlers::get_document).put(handlers::update_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id/publish",
            post(handlers::publish_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id/revalidate",
            post(handlers::revalidate_document),
        )
        .route(
            "/api/qualidade/pops/documents/:id/versions",
            get(handlers::list_versions),
        )
        .route(
            "/api/qualidade/pops/documents/:id/versions/:vid",
            get(handlers::get_version),
        )
        .route(
            "/api/qualidade/pops/settings",
            get(handlers::get_settings).put(handlers::upload_logo),
        )
        .route(
            "/api/qualidade/pops/settings/logo",
            get(handlers::download_logo),
        )
        .route(
            "/api/qualidade/pops/seed-inventory",
            post(handlers::seed_inventory),
        )
        .route(
            "/api/qualidade/pops/formularios",
            get(handlers::list_formularios),
        )
        .route(
            "/api/qualidade/pops/check-alerts",
            post(handlers::check_alerts),
        )
}

/// Ações de leitura dos POPs (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_setores_pop",
            "qualidade_pops",
            "Lista os setores dos POPs.",
            "/api/qualidade/pops/sectors",
            vec![],
        ),
        Acao::leitura(
            "listar_formularios_pop",
            "qualidade_pops",
            "Lista os formulários vinculados aos POPs (fase 1, CQL e PRD).",
            "/api/qualidade/pops/formularios",
            vec![],
        ),
        Acao::leitura(
            "listar_documentos_pop",
            "qualidade_pops",
            "Lista os POPs.",
            "/api/qualidade/pops/documents",
            vec![
                param("sectorId", "query", "texto", false, "Só POPs deste setor."),
                param("status", "query", "texto", false, "Filtra por status."),
                param("q", "query", "texto", false, "Texto de busca."),
            ],
        ),
        Acao::leitura(
            "detalhar_documento_pop",
            "qualidade_pops",
            "Detalhe de um POP.",
            "/api/qualidade/pops/documents/:id",
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
            ],
        ),
        Acao::leitura(
            "listar_versoes_documento_pop",
            "qualidade_pops",
            "Versões de um POP.",
            "/api/qualidade/pops/documents/:id/versions",
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
            ],
        ),
        Acao::leitura(
            "detalhar_versao_documento_pop",
            "qualidade_pops",
            "Conteúdo de uma versão de POP.",
            "/api/qualidade/pops/documents/:id/versions/:vid",
            vec![
                param("id", "caminho", "texto", true, "Id do POP."),
                param("vid", "caminho", "texto", true, "Id da versão."),
            ],
        ),
    ]
}
