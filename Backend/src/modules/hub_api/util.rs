use axum::{
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::sync::Arc;

use crate::handlers::AppState;

pub type ApiResult<T> = Result<T, (StatusCode, Json<Value>)>;

pub fn db_err(e: impl ToString) -> (StatusCode, Json<Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": e.to_string() })),
    )
}

pub fn bad_request(msg: impl ToString) -> (StatusCode, Json<Value>) {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "error": msg.to_string() })),
    )
}

pub fn not_found(msg: impl ToString) -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": msg.to_string() })),
    )
}

pub async fn with_pool<F, Fut, T>(state: &Arc<AppState>, f: F) -> ApiResult<T>
where
    F: FnOnce(PgPool) -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    f(state.db.pool().clone()).await.map_err(db_err)
}

pub fn ok_json<T: serde::Serialize>(value: T) -> impl IntoResponse {
    (StatusCode::OK, Json(value))
}

pub fn ok_status() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "success" })))
}
