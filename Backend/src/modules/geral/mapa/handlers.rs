use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::models::*;
use crate::core::acao::{corpo_acao, executar_em_2_passos, Confirmar, ErroApi, RespostaAcao};
use super::store;

fn actor(ctx: &AuthContext) -> &str {
    ctx.display_name.as_str()
}

fn err_resp(status: StatusCode, msg: impl Into<String>) -> Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
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

fn resposta(r: Result<RespostaAcao<Value>, ErroApi>) -> Response {
    match r {
        Ok(r) => (StatusCode::OK, Json(corpo_acao(&r))).into_response(),
        Err(e) => e.into_response(),
    }
}

/// Posição dos módulos no organograma. Sem `confirmar=true` só a prévia.
pub async fn put_layout(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<LayoutUpdate>,
) -> Response {
    let quem = actor(&ctx).to_string();
    resposta(
        executar_em_2_passos(state.db.pool(), "mover_modulos_organograma", c.confirmar, move |tx| {
            Box::pin(async move {
                store::update_layout(&mut **tx, Some(&quem), &body.items).await.map_err(ErroApi::invalido)?;
                Ok(json!({ "movidos": body.items.len() }))
            })
        })
        .await,
    )
}

/// Módulo novo no mapa. Sem `confirmar=true` só a prévia; ao confirmar também abre o chamado na triagem.
pub async fn post_module(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<ModuleCreate>,
) -> Response {
    let quem = actor(&ctx).to_string();
    let pool = state.db.pool();
    let q = quem.clone();
    let r = executar_em_2_passos(pool, "criar_modulo_mapa", c.confirmar, move |tx| {
        Box::pin(async move {
            let m = store::create_module(&mut **tx, Some(&q), &body).await.map_err(ErroApi::invalido)?;
            Ok(json!({ "modulo": m }))
        })
    })
    .await;
    let mut r = match r {
        Ok(r) => r,
        Err(e) => return e.into_response(),
    };
    if c.confirmar {
        let m: MapaModule = match serde_json::from_value(r.resultado["modulo"].clone()) {
            Ok(m) => m,
            Err(e) => return ErroApi::interno(e.to_string()).into_response(),
        };
        match store::abrir_chamado_modulo_novo(pool, &quem, &m).await {
            Ok(id) => r.resultado["chamado"] = json!(id),
            Err(e) => r.resultado["avisoChamado"] = json!(format!("Módulo criado, mas o chamado não foi aberto: {e}")),
        }
    }
    resposta(Ok(r))
}

/// Conexão escrita à mão entre dois módulos. Sem `confirmar=true` só a prévia.
pub async fn post_edge(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(body): Json<EdgeCreate>,
) -> Response {
    let quem = actor(&ctx).to_string();
    resposta(
        executar_em_2_passos(state.db.pool(), "ligar_modulos", c.confirmar, move |tx| {
            Box::pin(async move {
                let e = store::create_edge(&mut **tx, Some(&quem), body).await.map_err(ErroApi::invalido)?;
                Ok(json!({ "conexao": e }))
            })
        })
        .await,
    )
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
