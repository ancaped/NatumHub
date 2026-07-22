use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use super::handlers::extract_bearer;
use super::models::AuthContext;
use super::store;

pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();

    if store::is_public_path(&path) {
        return next.run(req).await;
    }

    let Some(token) = extract_bearer(req.headers()) else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Autenticação necessária. Faça login como operador." })),
        )
            .into_response();
    };

    let pool = state.db.pool();

    let _ = store::init_auth_tables(pool).await;

    match store::resolve_session(pool, &token).await {
        Ok(Some(ctx)) => {
            if store::requires_supervisor(&path, &method) && !ctx.role.is_supervisor() {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({ "error": "Apenas o supervisor pode executar esta ação." })),
                )
                    .into_response();
            }

            if !store::has_write_access(&ctx, &path, &method) {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({ "error": "Sem permissão para alterar dados neste módulo." })),
                )
                    .into_response();
            }

            if matches!(method.as_str(), "POST" | "PUT" | "DELETE" | "PATCH") {
                let _ = store::log_audit(pool, &ctx, &method, &path).await;
                let device_id = req
                    .headers()
                    .get("X-Natum-Device-Id")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                let _ = crate::modules::geral::audit::record_http_write(
                    pool,
                    &ctx,
                    &method,
                    &path,
                    device_id.as_deref(),
                )
                .await;
            }

            req.extensions_mut().insert(ctx);
            next.run(req).await
        }
        Ok(None) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Sessão inválida ou expirada. Faça login novamente." })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub fn current_operator(req: &Request<Body>) -> Option<AuthContext> {
    req.extensions().get::<AuthContext>().cloned()
}
