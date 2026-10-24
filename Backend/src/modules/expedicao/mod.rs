pub mod models;
pub mod handlers;
pub mod lookup_models;
pub mod lookup_handlers;

use std::sync::Arc;
use axum::{
    routing::{get, post, put},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/expedicao/ecommerce", get(handlers::list_ecommerce_orders).post(handlers::create_ecommerce_order))
        .route("/api/expedicao/ecommerce/:id", put(handlers::update_ecommerce_order).delete(handlers::delete_ecommerce_order))
        .route("/api/expedicao/ecommerce/import", post(handlers::import_ecommerce_orders))
        .route("/api/expedicao/lookups/platforms", get(lookup_handlers::list_platforms).post(lookup_handlers::create_platform))
        .route("/api/expedicao/lookups/platforms/:id", put(lookup_handlers::update_platform).delete(lookup_handlers::delete_platform))
        .route("/api/expedicao/lookups/shipping", get(lookup_handlers::list_shipping).post(lookup_handlers::create_shipping))
        .route("/api/expedicao/lookups/shipping/:id", put(lookup_handlers::update_shipping).delete(lookup_handlers::delete_shipping))
        .route("/api/expedicao/lookups/clients", get(lookup_handlers::list_clients).post(lookup_handlers::create_client))
        .route("/api/expedicao/lookups/clients/:id", put(lookup_handlers::update_client).delete(lookup_handlers::delete_client))
}

/// Ações de leitura da Expedição (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_pedidos_ecommerce",
            "expedicao_ecommerce",
            "Lista pedidos do e-commerce na expedição.",
            "/api/expedicao/ecommerce",
            vec![
                param("search", "query", "texto", false, "NF, cliente ou observação."),
                param("status", "query", "texto", false, "Filtra por status."),
                param("plataforma", "query", "texto", false, "Filtra por plataforma."),
            ],
        ),
        Acao::leitura(
            "listar_plataformas_expedicao",
            "expedicao",
            "Lista as plataformas de venda cadastradas.",
            "/api/expedicao/lookups/platforms",
            vec![],
        ),
        Acao::leitura(
            "listar_transportes_expedicao",
            "expedicao",
            "Lista as formas de envio cadastradas.",
            "/api/expedicao/lookups/shipping",
            vec![],
        ),
        Acao::leitura(
            "listar_clientes_expedicao",
            "expedicao",
            "Lista os clientes cadastrados na expedição.",
            "/api/expedicao/lookups/clients",
            vec![],
        ),
    ]
}
