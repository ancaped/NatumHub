use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;

use super::models::AuditListQuery;
use super::store;

pub async fn list_audit_events(
    State(state): State<Arc<AppState>>,
    Query(q): Query<AuditListQuery>,
) -> impl IntoResponse {
    match store::list_events(state.db.pool(), q).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}
