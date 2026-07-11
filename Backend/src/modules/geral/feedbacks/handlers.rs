use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::hub_api::util::{ok_json, ok_status, with_conn};

use super::commands::{
    add_feedback_note_conn, get_feedbacks_admin_conn, get_feedback_detail_conn,
    reorder_feedbacks_conn, save_feedback_from_user_conn, update_feedback_admin_conn,
};
use super::models::{
    FeedbackAdminUpdate, FeedbackNoteInput, FeedbackReorderInput, FeedbackSubmitInput,
};

async fn save_feedback_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<FeedbackSubmitInput>,
) -> impl IntoResponse {
    match with_conn(&state, |conn| save_feedback_from_user_conn(conn, &body, &ctx.display_name)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn list_admin_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !ctx.role.is_admin() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Apenas administradores podem gerenciar feedbacks." })),
        )
            .into_response();
    }
    match with_conn(&state, get_feedbacks_admin_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_admin_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<FeedbackAdminUpdate>,
) -> impl IntoResponse {
    if !ctx.role.is_admin() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Apenas administradores podem gerenciar feedbacks." })),
        )
            .into_response();
    }
    match with_conn(&state, |conn| update_feedback_admin_conn(conn, &id, &body)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_detail_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !ctx.role.is_admin() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Apenas administradores podem gerenciar feedbacks." })),
        )
            .into_response();
    }
    match with_conn(&state, |conn| get_feedback_detail_conn(conn, &id)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn add_note_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<FeedbackNoteInput>,
) -> impl IntoResponse {
    if !ctx.role.is_admin() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Apenas administradores podem gerenciar feedbacks." })),
        )
            .into_response();
    }
    match with_conn(&state, |conn| add_feedback_note_conn(conn, &id, &ctx.display_name, &body.body)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn reorder_handler(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<FeedbackReorderInput>,
) -> impl IntoResponse {
    if !ctx.role.is_admin() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Apenas administradores podem gerenciar feedbacks." })),
        )
            .into_response();
    }
    match with_conn(&state, |conn| reorder_feedbacks_conn(conn, &body.items)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

pub fn router() -> axum::Router<Arc<AppState>> {
    use axum::routing::{get, post, put};
    axum::Router::new()
        .route("/api/hub/feedbacks", post(save_feedback_handler))
        .route("/api/hub/feedbacks/manage", get(list_admin_handler))
        .route("/api/hub/feedbacks/reorder", post(reorder_handler))
        .route("/api/hub/feedbacks/:id/notes", post(add_note_handler))
        .route("/api/hub/feedbacks/:id", get(get_detail_handler).put(update_admin_handler))
}
