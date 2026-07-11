use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
};
use serde_json::{json, Value};
use std::sync::Mutex;

// Global thread-safe in-memory session storage
static SESSION: Mutex<Option<String>> = Mutex::new(None);

/// GET /login
/// Serves the login page for browser OAuth flow
pub async fn login_page() -> impl IntoResponse {
    axum::response::Html(include_str!("login.html"))
}

/// POST /api/auth/session
/// Saves the user session JSON in memory
pub async fn save_session(Json(payload): Json<Value>) -> impl IntoResponse {
    let mut session = SESSION.lock().unwrap();
    if payload.is_null() {
        *session = None;
    } else {
        *session = Some(payload.to_string());
    }
    (StatusCode::OK, Json(json!({ "status": "success" })))
}

/// GET /api/auth/session
/// Retrieves the active user session
pub async fn get_session() -> impl IntoResponse {
    let session = SESSION.lock().unwrap();
    if let Some(ref val) = *session {
        match serde_json::from_str::<Value>(val) {
            Ok(json_val) => (StatusCode::OK, Json(json_val)).into_response(),
            Err(_) => (StatusCode::OK, Json(json!(null))).into_response(),
        }
    } else {
        (StatusCode::OK, Json(json!(null))).into_response()
    }
}

/// DELETE /api/auth/session
/// Clears the active session
pub async fn clear_session() -> impl IntoResponse {
    let mut session = SESSION.lock().unwrap();
    *session = None;
    (StatusCode::OK, Json(json!({ "status": "success" })))
}

