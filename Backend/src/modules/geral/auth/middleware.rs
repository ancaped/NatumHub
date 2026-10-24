use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::sync::{Arc, OnceLock};

use crate::core::acao::ErroApi;

use crate::handlers::AppState;
use super::handlers::extract_bearer;
use super::models::AuthContext;
use super::store;

/// Casa o caminho de uma requisição com o padrão do catálogo, segmento a segmento (`:x` casa qualquer segmento).
fn caminho_casa(padrao: &str, path: &str) -> bool {
    let mut a = padrao.trim_matches('/').split('/');
    let mut b = path.trim_matches('/').split('/');
    loop {
        match (a.next(), b.next()) {
            (None, None) => return true,
            (Some(x), Some(y)) => {
                if !x.starts_with(':') && x != y {
                    return false;
                }
            }
            _ => return false,
        }
    }
}

/// Ações de 2 passos cujo `confirmar` vai na query: (método, caminho).
fn acoes_com_previa_na_query() -> &'static Vec<(&'static str, &'static str)> {
    static LISTA: OnceLock<Vec<(&'static str, &'static str)>> = OnceLock::new();
    LISTA.get_or_init(|| {
        crate::core::catalogo::todas()
            .into_iter()
            .filter(|a| a.dois_passos && a.parametros.iter().any(|p| p.nome == "confirmar" && p.onde == "query"))
            .map(|a| (a.metodo, a.caminho))
            .collect()
    })
}

/// Prévia de ação de 2 passos (sem `confirmar=true` na query): não grava a auditoria HTTP genérica.
fn e_previa(method: &str, path: &str, query: Option<&str>) -> bool {
    let confirmou = query
        .map(|q| q.split('&').any(|kv| kv == "confirmar=true"))
        .unwrap_or(false);
    !confirmou
        && acoes_com_previa_na_query()
            .iter()
            .any(|(m, c)| m.eq_ignore_ascii_case(method) && caminho_casa(c, path))
}

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

            if matches!(method.as_str(), "POST" | "PUT" | "DELETE" | "PATCH")
                && !e_previa(&method, &path, req.uri().query())
            {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caminho_casa_com_parametros() {
        assert!(caminho_casa("/api/x/:id/fechar", "/api/x/42/fechar"));
        assert!(!caminho_casa("/api/x/:id/fechar", "/api/x/42/outra"));
        assert!(!caminho_casa("/api/x/:id", "/api/x/42/fechar"));
        assert!(caminho_casa("/api/x", "/api/x/"));
        assert!(!caminho_casa("/api/x/fixo", "/api/x/outro"));
    }

    #[test]
    fn previa_so_sem_confirmar_true() {
        let Some((m, c)) = acoes_com_previa_na_query().first().copied() else { return };
        let path = c.split('/').map(|s| if s.starts_with(':') { "1" } else { s }).collect::<Vec<_>>().join("/");
        assert!(e_previa(m, &path, None));
        assert!(e_previa(m, &path, Some("confirmar=false")));
        assert!(!e_previa(m, &path, Some("a=1&confirmar=true")));
        assert!(!e_previa("GET_X", "/api/nada", None));
    }
}
