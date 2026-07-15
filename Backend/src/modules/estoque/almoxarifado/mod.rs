pub mod handlers;
pub mod models;
pub mod store;

use std::sync::Arc;
use axum::{
    routing::{get, post, put},
    Router,
};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/almox/dashboard/stats", get(handlers::get_dashboard_stats))
        .route("/api/almox/items", get(handlers::list_items))
        .route("/api/almox/items/search", get(handlers::search_catalog))
        .route("/api/almox/items/link", post(handlers::link_erp_item))
        .route("/api/almox/items/local", post(handlers::create_local_item))
        .route("/api/almox/items/:code", get(handlers::get_item))
        .route(
            "/api/almox/items/:code/config",
            put(handlers::upsert_item_config),
        )
        .route(
            "/api/almox/items/:code/stats",
            get(handlers::get_item_stats),
        )
        .route(
            "/api/almox/items/:code/seed-from-erp",
            post(handlers::seed_from_erp),
        )
        .route(
            "/api/almox/movements",
            get(handlers::list_movements).post(handlers::create_movement),
        )
        .route("/api/almox/replenishment", get(handlers::list_replenishment))
        .route(
            "/api/almox/demands",
            get(handlers::list_demands).post(handlers::create_demand),
        )
        .route(
            "/api/almox/demands/from-min",
            post(handlers::create_demand_from_min),
        )
        .route(
            "/api/almox/demands/:id/status",
            put(handlers::update_demand_status),
        )
        .route(
            "/api/almox/demands/:id/receive",
            post(handlers::receive_demand),
        )
        .route(
            "/api/almox/equipments",
            get(handlers::list_equipments).post(handlers::create_equipment),
        )
        .route(
            "/api/almox/equipments/:id",
            put(handlers::update_equipment),
        )
        .route(
            "/api/almox/maintenances",
            get(handlers::list_maintenances).post(handlers::create_maintenance),
        )
        .route(
            "/api/almox/maintenances/:id",
            put(handlers::update_maintenance),
        )
}
