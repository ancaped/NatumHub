pub mod commands;
pub mod handlers;
pub mod models;
pub mod parser;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .route("/api/estoque/item-info/:code", axum::routing::get(handlers::get_item_extra_info))
        .route("/api/compras/insumos/:code/detalhes", axum::routing::get(handlers::get_insumo_detalhes))
        .route("/api/compras/pedidos", axum::routing::get(handlers::list_purchase_orders))
        .route("/api/compras/pedidos/:id", axum::routing::get(handlers::get_purchase_order_detail))
        .route("/api/compras/notas", axum::routing::get(handlers::list_invoices))
        .route("/api/compras/notas/:number", axum::routing::get(handlers::get_invoice_detail))
}
