use axum::{
    extract::{State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use serde_json::json;
use crate::handlers::AppState;
use super::models::OnlineStore;
use super::commands::{delete_online_store_query, get_online_stores_query, save_online_store_query};

// GET /api/compras/lojas
pub async fn list_online_stores(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match get_online_stores_query(state.db.pool().clone()).await {
        Ok(stores) => (StatusCode::OK, Json(stores)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

// POST /api/compras/lojas
pub async fn save_online_store_handler(
    State(state): State<Arc<AppState>>,
    Json(store): Json<OnlineStore>,
) -> impl IntoResponse {
    match save_online_store_query(state.db.pool().clone(), &store).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

// DELETE /api/compras/lojas/:id
pub async fn delete_online_store_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match delete_online_store_query(state.db.pool().clone(), &id).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}
