pub mod folhas;
pub mod handlers;
pub mod models;

use axum::{
    extract::DefaultBodyLimit,
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/avarias",
            get(handlers::list_avarias).post(handlers::create_avaria),
        )
        .route(
            "/api/qualidade/avarias/lookup-item",
            get(handlers::lookup_item),
        )
        .route(
            "/api/qualidade/avarias/folhas",
            get(folhas::list_folhas).post(folhas::create_folha),
        )
        .route(
            "/api/qualidade/avarias/folhas/pendentes",
            get(folhas::pending_folhas),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id",
            get(folhas::get_folha),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id/caixas",
            axum::routing::post(folhas::set_caixas),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id/devolver",
            axum::routing::post(folhas::devolver_folha),
        )
        .route(
            "/api/qualidade/avarias/folhas/:id/cancelar",
            axum::routing::post(folhas::cancelar_folha),
        )
        .route(
            "/api/qualidade/avarias/juntar",
            axum::routing::post(handlers::juntar_avarias),
        )
        .route(
            "/api/qualidade/avarias/:id",
            get(handlers::get_avaria)
                .put(handlers::update_avaria)
                .delete(handlers::delete_avaria),
        )
        .route(
            "/api/qualidade/avarias/:id/foto",
            get(handlers::get_foto).post(handlers::upload_foto).layer(DefaultBodyLimit::max(
                12 * 1024 * 1024,
            )),
        )
}

/// Ações de leitura das Avarias (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_avarias",
            "qualidade_avarias",
            "Lista avarias registradas.",
            "/api/qualidade/avarias",
            vec![
                param("status", "query", "texto", false, "Filtra por status."),
                param("q", "query", "texto", false, "Texto de busca."),
            ],
        ),
        Acao::leitura(
            "consultar_item_avaria",
            "qualidade_avarias",
            "Busca produtos para registrar avaria (mínimo 2 letras).",
            "/api/qualidade/avarias/lookup-item",
            vec![
                param("q", "query", "texto", true, "Código ou descrição."),
            ],
        ),
        Acao::leitura(
            "listar_folhas_avaria",
            "qualidade_avarias",
            "Lista as folhas de avaria.",
            "/api/qualidade/avarias/folhas",
            vec![],
        ),
        Acao::leitura(
            "listar_folhas_avaria_pendentes",
            "qualidade_avarias",
            "Folhas de avaria pendentes de devolução.",
            "/api/qualidade/avarias/folhas/pendentes",
            vec![
                param("destination", "query", "texto", false, "Destino (expedicao por padrão)."),
            ],
        ),
        Acao::leitura(
            "detalhar_folha_avaria",
            "qualidade_avarias",
            "Detalhe de uma folha de avaria.",
            "/api/qualidade/avarias/folhas/:id",
            vec![
                param("id", "caminho", "inteiro", true, "Id da folha."),
            ],
        ),
        Acao::leitura(
            "detalhar_avaria",
            "qualidade_avarias",
            "Detalhe de uma avaria.",
            "/api/qualidade/avarias/:id",
            vec![
                param("id", "caminho", "inteiro", true, "Id da avaria."),
            ],
        ),
    ]
}
