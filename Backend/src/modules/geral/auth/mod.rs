pub mod handlers;
pub mod middleware;
pub mod models;
pub mod modules_registry;
pub mod store;

use axum::routing::{get, post, put};
use std::sync::Arc;

use crate::handlers::AppState;

pub fn router() -> axum::Router<Arc<AppState>> {
    axum::Router::new()
        .route("/api/auth/setup-status", get(handlers::setup_status))
        .route("/api/auth/setup-supervisor", post(handlers::setup_supervisor))
        .route("/api/auth/operators", get(handlers::list_operators))
        .route("/api/auth/login", post(handlers::login))
        .route("/api/auth/logout", post(handlers::logout))
        .route("/api/auth/me", get(handlers::me))
        .route("/api/auth/modules/registry", get(handlers::module_registry))
        .route(
            "/api/auth/operators/manage",
            get(handlers::list_operators_manage).post(handlers::create_operator),
        )
        .route(
            "/api/auth/operators/manage/:id",
            put(handlers::update_operator),
        )
        .route(
            "/api/auth/devices/manage",
            get(handlers::list_devices_manage),
        )
        .route(
            "/api/auth/devices/manage/:device_id",
            put(handlers::update_device_manage),
        )
}

pub use models::AuthContext;
pub use middleware::auth_middleware;
