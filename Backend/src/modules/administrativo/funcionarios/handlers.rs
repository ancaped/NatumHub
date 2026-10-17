use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_ADMIN_FUNCIONARIOS;

use super::models::ProfileInput;
use super::store;

fn err(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

fn can_manage(ctx: &AuthContext) -> bool {
    ctx.role.is_supervisor() || ctx.has_module(MODULE_ADMIN_FUNCIONARIOS)
}

#[derive(Deserialize)]
pub struct ActivityQuery {
    pub limit: Option<i64>,
}

pub async fn get_me(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    match store::get_by_id(state.db.pool(), &ctx.operator_id).await {
        Ok(Some(row)) => (StatusCode::OK, Json(row)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Operador não encontrado."),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn put_me(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(input): Json<ProfileInput>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match store::upsert_profile(pool, &ctx.operator_id, input).await {
        Ok(row) => {
            crate::modules::geral::audit::record_domain(
                pool,
                Some(&ctx),
                "admin_funcionarios",
                "update_profile_self",
                "operator_profile",
                &ctx.operator_id,
                &format!("Perfil atualizado por {}", ctx.display_name),
                None,
                Some(json!({ "operatorId": row.operator_id, "fullName": row.full_name })),
            )
            .await;
            (StatusCode::OK, Json(row)).into_response()
        }
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn list_funcionarios(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if !can_manage(&ctx) {
        return err(
            StatusCode::FORBIDDEN,
            "Sem permissão para listar funcionários.",
        );
    }
    match store::list_all(state.db.pool()).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn get_funcionario(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !can_manage(&ctx) && ctx.operator_id != id {
        return err(StatusCode::FORBIDDEN, "Sem permissão.");
    }
    match store::get_by_id(state.db.pool(), &id).await {
        Ok(Some(row)) => (StatusCode::OK, Json(row)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Funcionário não encontrado."),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn put_funcionario(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(input): Json<ProfileInput>,
) -> impl IntoResponse {
    if !can_manage(&ctx) {
        return err(
            StatusCode::FORBIDDEN,
            "Sem permissão para editar funcionários.",
        );
    }
    let pool = state.db.pool();
    match store::upsert_profile(pool, &id, input).await {
        Ok(row) => {
            crate::modules::geral::audit::record_domain(
                pool,
                Some(&ctx),
                "admin_funcionarios",
                "update_profile",
                "operator_profile",
                &id,
                &format!("Perfil de {} atualizado", row.display_name),
                None,
                Some(json!({ "operatorId": row.operator_id, "fullName": row.full_name })),
            )
            .await;
            (StatusCode::OK, Json(row)).into_response()
        }
        Err(e) => err(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn list_activity(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<ActivityQuery>,
) -> impl IntoResponse {
    if !can_manage(&ctx) && ctx.operator_id != id {
        return err(StatusCode::FORBIDDEN, "Sem permissão.");
    }
    match store::list_activity(state.db.pool(), &id, q.limit.unwrap_or(40)).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}
