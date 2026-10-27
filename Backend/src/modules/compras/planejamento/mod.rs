pub mod commands;
pub mod handlers;
pub mod models;
pub mod parser;
pub mod vinculo;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .route("/api/estoque/item-info/:code", axum::routing::get(handlers::get_item_extra_info))
        .route("/api/compras/insumos/:code/detalhes", axum::routing::get(handlers::get_insumo_detalhes))
        .route("/api/compras/pedidos", axum::routing::get(handlers::list_purchase_orders))
        .route("/api/compras/pedidos/:id", axum::routing::get(handlers::get_purchase_order_detail))
        .route("/api/compras/notas", axum::routing::get(handlers::list_invoices))
        .route("/api/compras/notas/:number", axum::routing::get(handlers::get_invoice_detail))
}

/// Ações de Compras (pedidos, notas, detalhe de insumo) descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    use crate::core::catalogo::{param, Acao};
    vec![
        Acao::leitura(
            "listar_pedidos_compra",
            "compras_pedidos",
            "Lista pedidos de compra do ERP.",
            "/api/compras/pedidos",
            vec![
                param("search", "query", "texto", false, "Parte do fornecedor, do número do pedido ou do código/descrição de um item."),
                param("status", "query", "texto", false, "Status do pedido no ERP."),
            ],
        ),
        Acao::leitura(
            "detalhar_pedido_compra",
            "compras_pedidos",
            "Cabeçalho, itens e notas recebidas (NFs vinculadas por fornecedor + insumo) de um pedido de compra.",
            "/api/compras/pedidos/:id",
            vec![param("id", "caminho", "inteiro", true, "Número de registro do pedido (n_registro).")],
        ),
        Acao::leitura(
            "listar_notas_compra",
            "compras_notas",
            "Lista notas fiscais de entrada agrupadas por nota.",
            "/api/compras/notas",
            vec![
                param("search", "query", "texto", false, "Parte do fornecedor, do número da nota ou do código/descrição de um item."),
                param("supplier_id", "query", "texto", false, "Código do fornecedor."),
            ],
        ),
        Acao::leitura(
            "detalhar_nota_compra",
            "compras_notas",
            "Itens de uma nota fiscal de entrada e o pedido vinculado a cada item.",
            "/api/compras/notas/:number",
            vec![
                param("number", "caminho", "texto", true, "Número da nota."),
                param("supplier_id", "query", "texto", false, "Código do fornecedor (desambigua notas repetidas)."),
            ],
        ),
        Acao::leitura(
            "detalhar_insumo_compra",
            "compras_materia_prima",
            "Ficha de compras de um insumo: cadastro, estoque, consumo, pedidos e notas recentes e simulação.",
            "/api/compras/insumos/:code/detalhes",
            vec![param("code", "caminho", "texto", true, "Código do insumo.")],
        ),
        Acao::leitura(
            "consultar_info_item_estoque",
            "estoque_materia_prima",
            "Notas recentes e pedidos pendentes de um insumo.",
            "/api/estoque/item-info/:code",
            vec![param("code", "caminho", "texto", true, "Código do insumo.")],
        ),
    ]
}
