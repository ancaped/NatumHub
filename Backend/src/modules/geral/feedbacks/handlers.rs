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

use crate::modules::hub_api::util::{ok_json, ok_status, with_pool};



use super::commands::{

    add_feedback_note_query, get_feedbacks_admin_query, get_feedback_detail_query,

    reorder_feedbacks_query, save_feedback_from_user_query, update_feedback_admin_query,

};

use super::models::{

    FeedbackAdminUpdate, FeedbackNoteInput, FeedbackReorderInput, FeedbackSubmitInput,

};



async fn save_feedback_handler(

    State(state): State<Arc<AppState>>,

    Extension(ctx): Extension<AuthContext>,

    Json(body): Json<FeedbackSubmitInput>,

) -> impl IntoResponse {

    let requested_by = ctx.display_name;

    match with_pool(&state, |pool| save_feedback_from_user_query(pool, &body, &requested_by)).await {

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

    match with_pool(&state, |pool| get_feedbacks_admin_query(pool)).await {

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

    match with_pool(&state, |pool| update_feedback_admin_query(pool, &id, &body)).await {

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

    match with_pool(&state, |pool| get_feedback_detail_query(pool, &id)).await {

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

    match with_pool(&state, |pool| add_feedback_note_query(pool, &id, &ctx.display_name, &body.body)).await {

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

    match with_pool(&state, |pool| reorder_feedbacks_query(pool, &body.items)).await {

        Ok(()) => ok_status().into_response(),

        Err(e) => e.into_response(),

    }

}



pub fn router() -> axum::Router<Arc<AppState>> {

    use axum::routing::{get, post};

    axum::Router::new()

        .route("/api/hub/feedbacks", post(save_feedback_handler))

        .route("/api/hub/feedbacks/manage", get(list_admin_handler))

        .route("/api/hub/feedbacks/reorder", post(reorder_handler))

        .route("/api/hub/feedbacks/:id/notes", post(add_note_handler))

        .route("/api/hub/feedbacks/:id", get(get_detail_handler).put(update_admin_handler))

}


