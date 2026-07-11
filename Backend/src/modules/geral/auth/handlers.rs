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
    SetupStatusResponse, SetupSupervisorRequest, UpdateDeviceRequest,
};
use super::modules_registry;
use super::store;

pub async fn setup_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
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
    match store::setup_status(&conn) {
        Ok((has_supervisor, has_password)) => (
            StatusCode::OK,
            Json(SetupStatusResponse {
                needs_supervisor_setup: !has_password,
                has_supervisor,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn setup_supervisor(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SetupSupervisorRequest>,
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

    match store::setup_supervisor(
        &conn,
        &body.display_name,
        &body.password,
        body.device_id.as_deref(),
        body.device_label.as_deref(),
        None,
    ) {
        Ok((token, operator, modules, expires_at)) => {
            let user = store::build_auth_user(
                &conn,
                &operator,
                modules,
                body.device_id.as_deref(),
            )
            .unwrap_or_else(|_| AuthUser {
                id: operator.id.clone(),
                display_name: operator.display_name.clone(),
                role: operator.role.clone(),
                photo_url: String::new(),
                modules: vec![],
                update_channel: "stable".to_string(),
                user_update_channel: "stable".to_string(),
                device_update_channel: "stable".to_string(),
                effective_update_channel: "stable".to_string(),
                is_supervisor: true,
            });
            (
                StatusCode::CREATED,
                Json(LoginResponse {
                    token,
                    user,
                    expires_at,
                }),
            )
                .into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

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

pub async fn list_operators_manage(State(state): State<Arc<AppState>>) -> impl IntoResponse {
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

    match store::create_operator(
        &conn,
        &body.display_name,
        &body.role,
        &body.modules,
        body.update_channel.as_deref(),
        body.password.as_deref(),
    ) {
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
        body.password.as_deref(),
        Some(&ctx.operator_id),
        body.supervisor_password.as_deref(),
    ) {
        Ok(op) => (StatusCode::OK, Json(op)).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn list_devices_manage(State(state): State<Arc<AppState>>) -> impl IntoResponse {
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
    match store::list_devices(&conn) {
        Ok(list) => (StatusCode::OK, Json(list)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn update_device_manage(
    State(state): State<Arc<AppState>>,
    Path(device_id): Path<String>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<UpdateDeviceRequest>,
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

    if let Some(pwd) = body.supervisor_password.as_deref() {
        match store::verify_supervisor_password(&conn, &ctx.operator_id, pwd) {
            Ok(true) => {}
            Ok(false) => {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({ "error": "Senha do supervisor incorreta." })),
                )
                    .into_response();
            }
            Err(e) => {
                return (StatusCode::FORBIDDEN, Json(json!({ "error": e }))).into_response();
            }
        }
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Confirme com a senha do supervisor." })),
        )
            .into_response();
    }

    match store::update_device(
        &conn,
        &device_id,
        body.label.as_deref(),
        body.update_channel.as_deref(),
    ) {
        Ok(device) => (StatusCode::OK, Json(device)).into_response(),
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

    match store::create_session(
        &conn,
        &body.display_name,
        &body.password,
        body.device_id.as_deref(),
        body.device_label.as_deref(),
        body.client_ip.as_deref(),
    ) {
        Ok((token, operator, modules, expires_at)) => {
            let user = store::build_auth_user(
                &conn,
                &operator,
                modules,
                body.device_id.as_deref(),
            )
            .unwrap_or_else(|_| AuthUser {
                id: operator.id.clone(),
                display_name: operator.display_name.clone(),
                role: operator.role.clone(),
                photo_url: String::new(),
                modules: vec![],
                update_channel: "stable".to_string(),
                user_update_channel: "stable".to_string(),
                device_update_channel: "stable".to_string(),
                effective_update_channel: "stable".to_string(),
                is_supervisor: operator.role == "supervisor" || operator.role == "admin",
            });
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

pub async fn me(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let Some(token) = extract_bearer(&headers) else {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Token ausente" }))).into_response();
    };

    let device_id = headers
        .get("x-natum-device-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

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
            let operator = super::models::Operator {
                id: ctx.operator_id.clone(),
                display_name: ctx.display_name.clone(),
                role: ctx.role.as_str().to_string(),
            };
            match store::build_auth_user(
                &conn,
                &operator,
                ctx.modules.clone(),
                device_id.as_deref(),
            ) {
                Ok(user) => (StatusCode::OK, Json(user)).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
                    .into_response(),
            }
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
