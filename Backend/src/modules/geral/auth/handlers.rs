use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Extension, Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use super::models::{
    AuthContext, AuthUser, LoginRequest, LoginResponse, SaveOperatorRequest,
};
use super::modules_registry;
use super::store;

pub async fn list_operators(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let _ = store::init_auth_tables(&conn);
    match store::list_active_operators(&conn) {
        Ok(list) => (StatusCode::OK, Json(list)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn module_registry() -> impl IntoResponse {
    (StatusCode::OK, Json(modules_registry::module_registry())).into_response()
}

pub async fn list_operators_manage(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    if let Err(e) = store::init_auth_tables(&conn) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    match store::list_all_operators(&conn) {
        Ok(list) => (StatusCode::OK, Json(list)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_operator(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SaveOperatorRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    if let Err(e) = store::init_auth_tables(&conn) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    match store::create_operator(&conn, &body.display_name, &body.role, &body.modules, body.update_channel.as_deref()) {
        Ok(op) => (StatusCode::CREATED, Json(op)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn update_operator(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<SaveOperatorRequest>,
) -> impl IntoResponse {
    if id == ctx.operator_id && body.active == Some(false) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Você não pode desativar sua própria conta." })),
        )
            .into_response();
    }

    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    if let Err(e) = store::init_auth_tables(&conn) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    let active = body.active.unwrap_or(true);
    match store::update_operator(
        &conn,
        &id,
        &body.display_name,
        &body.role,
        active,
        &body.modules,
        body.update_channel.as_deref(),
    ) {
        Ok(op) => (StatusCode::OK, Json(op)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let _ = store::init_auth_tables(&conn);
    let _ = store::purge_expired_sessions(&conn);

    match store::create_session(&conn, &body.display_name) {
        Ok((token, operator, modules, expires_at)) => {
            let update_channel = store::get_operator_update_channel(&conn, &operator.id, &operator.role)
                .unwrap_or_else(|_| store::default_update_channel_for_role(&operator.role).to_string());
            let ctx = AuthContext {
                operator_id: operator.id.clone(),
                display_name: operator.display_name.clone(),
                role: super::models::OperatorRole::from_str(&operator.role),
                modules: modules.clone(),
            };
            let user = AuthUser {
                id: operator.id,
                display_name: operator.display_name,
                role: operator.role,
                photo_url: ctx.avatar_url(),
                modules,
                update_channel,
            };
            (
                StatusCode::OK,
                Json(LoginResponse {
                    token,
                    user,
                    expires_at,
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let Some(token) = extract_bearer(&headers) else {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Token ausente" }))).into_response();
    };

    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    match store::revoke_session(&conn, &token) {
        Ok(()) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn me(State(state): State<Arc<AppState>>, headers: HeaderMap) -> impl IntoResponse {
    let Some(token) = extract_bearer(&headers) else {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Token ausente" }))).into_response();
    };

    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    match store::resolve_session(&conn, &token) {
        Ok(Some(ctx)) => {
            let update_channel = store::get_operator_update_channel(&conn, &ctx.operator_id, ctx.role.as_str())
                .unwrap_or_else(|_| store::default_update_channel_for_role(ctx.role.as_str()).to_string());
            let user = AuthUser {
                id: ctx.operator_id.clone(),
                display_name: ctx.display_name.clone(),
                role: ctx.role.as_str().to_string(),
                photo_url: ctx.avatar_url(),
                modules: ctx.modules.clone(),
                update_channel,
            };
            (StatusCode::OK, Json(user)).into_response()
        }
        Ok(None) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Sessão inválida ou expirada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}
