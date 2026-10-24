use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::sync::Arc;

use crate::core::acao::ErroApi;

use crate::handlers::AppState;
use super::handlers::extract_bearer;
use super::models::AuthContext;
use super::store;

pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let rota = req.uri().path().to_string();
    let pool = state.db.pool().clone();
    let resp = auth_middleware_inner(State(state), req, next).await;
    if resp.status() == StatusCode::INTERNAL_SERVER_ERROR {
        crate::modules::geral::alertas::registrar_500(&pool, &rota).await;
    }
    resp
}

async fn auth_middleware_inner(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();

    if store::is_public_path(&path) {
        if let Some(token) = extract_bearer(req.headers()) {
            let pool = state.db.pool();
            if let Ok(Some(ctx)) = store::resolve_session(pool, &token).await {
                req.extensions_mut().insert(ctx);
            }
        }
        return next.run(req).await;
    }

    let Some(token) = extract_bearer(req.headers()) else {
        return ErroApi::nao_autenticado("Autenticação necessária. Faça login como operador ou use o token do agente.")
            .into_response();
    };

    let pool = state.db.pool();

    let _ = store::init_auth_tables(pool).await;

    match store::resolve_session(pool, &token).await {
        Ok(Some(ctx)) => {
            if store::requires_supervisor(&path, &method) && !ctx.role.is_supervisor() {
                return ErroApi::novo(StatusCode::FORBIDDEN, "apenas_supervisor", "Apenas o supervisor pode executar esta ação.")
                    .into_response();
            }

            if !store::has_write_access(&ctx, &path, &method) {
                return ErroApi::sem_permissao("Sem permissão para alterar dados neste módulo.")
                    .com_detalhes(json!({ "metodo": method, "caminho": path }))
                    .into_response();
            }

            if !store::has_read_access(&ctx, &path, &method) {
                return ErroApi::sem_permissao("Sem acesso ao módulo desta rota.")
                    .com_detalhes(json!({ "metodo": method, "caminho": path }))
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
        Ok(None) => ErroApi::novo(StatusCode::UNAUTHORIZED, "sessao_expirada", "Sessão inválida ou expirada. Faça login novamente.")
            .into_response(),
        Err(e) => ErroApi::interno(e).into_response(),
    }
}

pub fn current_operator(req: &Request<Body>) -> Option<AuthContext> {
    req.extensions().get::<AuthContext>().cloned()
}
