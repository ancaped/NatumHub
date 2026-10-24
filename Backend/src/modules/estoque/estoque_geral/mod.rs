pub mod handlers;
pub mod listas;

use std::sync::Arc;
use axum::{
    routing::{get, post},
    Router,
};
use crate::core::catalogo::{param, Acao};
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

/// Ações de contagem e pendências do Estoque descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    const M: &str = "estoque_materia_prima";
    vec![
        Acao::leitura(
            "listar_contagens_estoque",
            M,
            "Lista as listas de contagem de estoque de um escopo.",
            "/api/estoque/contagens",
            vec![param("escopo", "query", "texto", true, "materia_prima, embalagens, coloracao, apoio, produtos ou insumos.")],
        ),
        Acao::leitura(
            "historico_contagem_produto",
            "estoque_produtos",
            "Histórico de contagens físicas de um produto.",
            "/api/estoque/produtos/:code/contagem/historico",
            vec![param("code", "caminho", "texto", true, "Código do produto.")],
        ),
        Acao::leitura(
            "listar_compras_pendentes",
            M,
            "Quantidade pendente de chegada por item, somando os pedidos de compra ainda não entregues.",
            "/api/estoque/compras-pendentes",
            vec![],
        ),
    ]
}
