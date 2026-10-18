pub mod controles;
pub mod handlers;
pub mod models;

use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/qualidade/devolucoes",
            get(handlers::list_devolucoes).post(handlers::create_devolucao),
        )
        .route(
            "/api/qualidade/devolucoes/lookup-item",
            get(handlers::lookup_item),
        )
        .route(
            "/api/qualidade/devolucoes/lote-specs",
            get(handlers::lote_specs),
        )
        .route(
            "/api/qualidade/devolucoes/controles",
            get(controles::list_controles).post(controles::create_controle),
        )
        .route(
            "/api/qualidade/devolucoes/controles/pendentes",
            get(controles::pending_controles),
        )
        .route(
            "/api/qualidade/devolucoes/controles/:id",
            get(controles::get_controle),
        )
        .route(
            "/api/qualidade/devolucoes/controles/:id/volumes",
            post(controles::set_volumes),
        )
        .route(
            "/api/qualidade/devolucoes/controles/:id/devolver",
            post(controles::devolver_controle),
        )
        .route(
            "/api/qualidade/devolucoes/controles/:id/cancelar",
            post(controles::cancelar_controle),
        )
        .route(
            "/api/qualidade/devolucoes/:id",
            get(handlers::get_devolucao)
                .put(handlers::update_devolucao)
                .delete(handlers::delete_devolucao),
        )
        .route(
            "/api/qualidade/devolucoes/:id/receber",
            post(handlers::receber_devolucao),
        )
        .route(
            "/api/qualidade/devolucoes/:id/iniciar-conferencia",
            post(handlers::iniciar_conferencia),
        )
        .route(
            "/api/qualidade/devolucoes/:id/fechar-cq",
            post(handlers::fechar_cq),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/conferir",
            post(handlers::conferir_item),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/dividir",
            post(handlers::dividir_item),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/analise-fq",
            post(handlers::salvar_analise_fq),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/foto",
            get(handlers::get_item_foto).post(handlers::upload_item_foto),
        )
        .route(
            "/api/qualidade/devolucoes/:id/itens/:item_id/erp",
            post(handlers::marcar_erp_item),
        )
}
