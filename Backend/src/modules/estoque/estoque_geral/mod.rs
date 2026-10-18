pub mod handlers;
pub mod listas;

use std::sync::Arc;
use axum::{
    routing::{get, post},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/estoque/produtos/:code/contagem",
            post(handlers::save_product_count),
        )
        .route(
            "/api/estoque/produtos/:code/contagem/historico",
            get(handlers::get_product_count_history),
        )
        .route("/api/estoque/contagens", get(listas::listar).post(listas::criar))
        .route(
            "/api/estoque/contagens/:id/itens",
            post(listas::incluir_itens),
        )
        .route(
            "/api/estoque/contagens/:id/itens/:item_id",
            axum::routing::put(listas::atualizar_item).delete(listas::remover_item),
        )
        .route(
            "/api/estoque/contagens/:id/atualizar-saldos",
            post(listas::atualizar_saldos),
        )
        .route("/api/estoque/contagens/:id/encerrar", post(listas::encerrar))
        .route("/api/estoque/contagens/:id/reabrir", post(listas::reabrir))
        .route(
            "/api/estoque/compras-pendentes",
            get(handlers::compras_pendentes),
        )
}
