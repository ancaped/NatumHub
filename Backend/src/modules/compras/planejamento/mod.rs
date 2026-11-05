pub mod commands;
pub mod handlers;
pub mod models;
pub mod parser;
pub mod vinculo;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .route("/api/estoque/item-info/:code", axum::routing::get(handlers::get_item_extra_info))
        .route("/api/compras/insumos/:code/detalhes", axum::routing::get(handlers::get_insumo_detalhes))
        .route("/api/compras/produtos/:code/historico-pedidos", axum::routing::get(handlers::get_produto_historico_pedidos))
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
            "Lista os pedidos de compra do ERP, do mais novo ao mais antigo: número (registro), data, fornecedor, status, prazo de pagamento, valor, previsão de entrega e observação. A busca olha fornecedor, número e código/descrição de itens (traz o item encontrado). `status`: ABERTO, PARCIAL, FECHADO, CANCELADO, ATRASADO, ALL ou o código do ERP. Para o que falta chegar de um insumo use `consultar_info_item_estoque`.",
            "/api/compras/pedidos",
            vec![
                param("search", "query", "texto", false, "Parte do fornecedor, do número do pedido ou do código/descrição de um item."),
                param("status", "query", "texto", false, "Status do pedido no ERP."),
            ],
        ),
        Acao::leitura(
            "detalhar_pedido_compra",
            "compras_pedidos",
            "Cabeçalho, itens e notas recebidas de um pedido de compra (o pedido de cada nota é o que o ERP registrou no recebimento).",
            "/api/compras/pedidos/:id",
            vec![param("id", "caminho", "inteiro", true, "Número de registro do pedido (n_registro).")],
        ),
        Acao::leitura(
            "listar_notas_compra",
            "compras_notas",
            "Lista as notas fiscais de entrada agrupadas por nota, da mais recente à mais antiga: número, data, fornecedor, valor total e quantidade de itens. A busca olha fornecedor, número e código/descrição de itens (traz o item encontrado); `supplier_id` filtra por fornecedor. Para os itens de uma nota use `detalhar_nota_compra`.",
            "/api/compras/notas",
            vec![
                param("search", "query", "texto", false, "Parte do fornecedor, do número da nota ou do código/descrição de um item."),
                param("supplier_id", "query", "texto", false, "Código do fornecedor."),
            ],
        ),
        Acao::leitura(
            "detalhar_nota_compra",
            "compras_notas",
            "Itens de uma nota fiscal de entrada (código, descrição, quantidade, preço, valor) e o pedido de compra vinculado a cada item. Informe `supplier_id` quando o número da nota se repete entre fornecedores.",
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
            "historico_pedidos_produto_compra",
            "compras_coloracao",
            "Últimos 100 pedidos de compra de um produto de Coloração ou Material de Apoio: pedido, data, fornecedor, quantidade pedida e recebida, preço. Código sem pedidos devolve lista vazia.",
            "/api/compras/produtos/:code/historico-pedidos",
            vec![param("code", "caminho", "texto", true, "Código do produto.")],
        ),
        Acao::leitura(
            "consultar_info_item_estoque",
            "estoque_materia_prima",
            "Ficha de compras de um insumo: `invoices` (últimas notas de entrada), `pendingOrders` (pedidos de compra com quantidade ainda por chegar), `formulation` (a própria formulação, se for produto), `usedIn` (produtos que usam o insumo) e `lotes` (últimas entradas de estoque). Use para decidir se precisa comprar.",
            "/api/estoque/item-info/:code",
            vec![param("code", "caminho", "texto", true, "Código do insumo.")],
        ),
    ]
}
