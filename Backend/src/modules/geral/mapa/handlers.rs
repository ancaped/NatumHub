use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    Extension, Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::models::*;
use super::store;

fn actor(ctx: &AuthContext) -> &str {
    ctx.display_name.as_str()
}

fn err_resp(status: StatusCode, msg: impl Into<String>) -> Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

/// UI do mapa (HTML) — pública; mutações da API continuam exigindo supervisor.
pub async fn serve_mapa_html() -> impl IntoResponse {
    let path = crate::core::app_config::resolve_repo_root()
        .map(|r| r.join("ContextoIA/arquitetura/mapa-app.html"));
    match path.and_then(|p| std::fs::read_to_string(p).ok()) {
        Some(html) => Html(html).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            "mapa-app.html não encontrado. Rode npm run map:arch no Frontend.",
        )
            .into_response(),
    }
}

pub async fn get_snapshot(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    match store::snapshot(state.db.pool()).await {
        Ok(s) => (StatusCode::OK, Json(s)).into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn put_layout(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<LayoutUpdate>,
) -> impl IntoResponse {
    match store::update_layout(state.db.pool(), Some(actor(&ctx)), &body.items).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => err_resp(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn put_module(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(key): Path<String>,
    Json(body): Json<ModuleUpdate>,
) -> impl IntoResponse {
    match store::update_module(state.db.pool(), Some(actor(&ctx)), &key, body).await {
        Ok(m) => (StatusCode::OK, Json(m)).into_response(),
        Err(e) => err_resp(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn post_module(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<ModuleCreate>,
) -> impl IntoResponse {
    match store::create_module(state.db.pool(), Some(actor(&ctx)), body).await {
        Ok(m) => (StatusCode::CREATED, Json(m)).into_response(),
        Err(e) => err_resp(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn post_edge(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<EdgeCreate>,
) -> impl IntoResponse {
    match store::create_edge(state.db.pool(), Some(actor(&ctx)), body).await {
        Ok(e) => (StatusCode::CREATED, Json(e)).into_response(),
        Err(e) => err_resp(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn list_tasks(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Query(q): Query<TasksQuery>,
) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(100);
    match store::list_tasks(state.db.pool(), q.status.as_deref(), limit).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn post_task(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<TaskCreate>,
) -> impl IntoResponse {
    match store::create_task(state.db.pool(), Some(actor(&ctx)), body).await {
        Ok(t) => (StatusCode::CREATED, Json(t)).into_response(),
        Err(e) => err_resp(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn patch_task(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(body): Json<TaskPatch>,
) -> impl IntoResponse {
    match store::patch_task(state.db.pool(), Some(actor(&ctx)), &id, body).await {
        Ok(t) => (StatusCode::OK, Json(t)).into_response(),
        Err(e) => err_resp(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn export_tasks_md(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    match store::export_task_md(state.db.pool()).await {
        Ok(md) => (
            StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "text/markdown; charset=utf-8")],
            md,
        )
            .into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn list_activity(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Query(q): Query<ActivityQuery>,
) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(100);
    match store::list_activity(state.db.pool(), limit).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCreate {
    pub action: String,
    pub meta: Option<Value>,
}

pub async fn post_activity(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<ActivityCreate>,
) -> impl IntoResponse {
    let action = body.action.trim();
    if action.is_empty() {
        return err_resp(StatusCode::BAD_REQUEST, "action obrigatório");
    }
    match store::log_activity(
        state.db.pool(),
        Some(actor(&ctx)),
        action,
        body.meta.unwrap_or_else(|| json!({})),
    )
    .await
    {
        Ok(()) => (StatusCode::CREATED, Json(json!({ "ok": true }))).into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(Debug, Deserialize)]
pub struct ResyncBody {
    pub routes: Option<Vec<Value>>,
}

pub async fn resync_scan(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    body: Option<Json<ResyncBody>>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let routes = if let Some(Json(b)) = body {
        if let Some(r) = b.routes {
            r
        } else {
            match store::load_routes_from_mapa_json() {
                Ok(r) => r,
                Err(e) => return err_resp(StatusCode::BAD_REQUEST, e),
            }
        }
    } else {
        match store::load_routes_from_mapa_json() {
            Ok(r) => r,
            Err(e) => return err_resp(StatusCode::BAD_REQUEST, e),
        }
    };
    match store::resync_routes(pool, Some(actor(&ctx)), &routes).await {
        Ok(n) => (StatusCode::OK, Json(json!({ "ok": true, "routes": n }))).into_response(),
        Err(e) => err_resp(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}
