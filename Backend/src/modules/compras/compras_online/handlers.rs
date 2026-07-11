use axum::{
    extract::{State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use serde_json::json;
use rusqlite::params;
use crate::handlers::AppState;
use super::models::OnlineStore;

// GET /api/compras/lojas
pub async fn list_online_stores(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, url, notes, created_at FROM online_stores ORDER BY name ASC"
    ) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let rows = match stmt.query_map([], |row| {
        Ok(OnlineStore {
            id: row.get(0)?,
            name: row.get(1)?,
            url: row.get(2)?,
            notes: row.get(3)?,
            created_at: row.get(4)?,
        })
    }) {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let mut stores = Vec::new();
    for row in rows {
        match row {
            Ok(s) => stores.push(s),
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
        }
    }

    (StatusCode::OK, Json(stores)).into_response()
}

// POST /api/compras/lojas
pub async fn save_online_store_handler(
    State(state): State<Arc<AppState>>,
    Json(store): Json<OnlineStore>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    match conn.execute(
        "INSERT OR REPLACE INTO online_stores (id, name, url, notes) VALUES (?1, ?2, ?3, ?4)",
        params![
            store.id,
            store.name,
            store.url,
            store.notes,
        ],
    ) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// DELETE /api/compras/lojas/:id
pub async fn delete_online_store_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    match conn.execute("DELETE FROM online_stores WHERE id = ?1", params![id]) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}
