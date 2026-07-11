pub mod commands;
pub mod handlers;
pub mod models;

pub fn router() -> axum::Router<std::sync::Arc<crate::handlers::AppState>> {
    axum::Router::new()
        .route("/api/compras/lojas", axum::routing::get(handlers::list_online_stores).post(handlers::save_online_store_handler))
        .route("/api/compras/lojas/:id", axum::routing::delete(handlers::delete_online_store_handler))
}
