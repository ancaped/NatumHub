use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Extension, Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

use crate::core::acao::{corpo_acao, Confirmar, ErroApi};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_CONFIGURACOES;
use crate::modules::hub_api::util::{ok_json, ok_status, with_pool};

use super::acoes::{auditar, interpretar_status, listar_fila, transicionar, Transicao};
use super::commands::{
    add_feedback_note_query, get_feedback_detail_query, get_feedbacks_admin_query,
    reorder_feedbacks_query, save_feedback_from_user_query, update_feedback_admin_query,
};
use super::models::{
    FeedbackAdminUpdate, FeedbackNoteInput, FeedbackReorderInput, FeedbackSubmitInput,
};

/// Quem pode o quê. A rota é pública no middleware (o widget envia de qualquer tela), então a checagem é aqui:
/// sem sessão válida nada passa. Operador de tela vê a fila e comenta (a "Fila de Feedbacks" do widget); decidir é do
/// supervisor. Agente só entra se tiver o módulo Configurações.
#[derive(Clone, Copy)]
enum Nivel {
    /// Qualquer sessão válida (enviar feedback).
    Logado,
    /// Ver a fila e os detalhes: operador de tela, ou agente com Configurações.
    Leitura,
    /// Gravar notas: operador de tela, ou agente com Configurações em editar.
    Nota,
    /// Entregar para conferência (`resolver`): supervisor, ou agente com Configurações em editar.
    Entrega,
    /// Decidir: status, prioridade, ordem e devolver à fila.
    Supervisor,
}

fn exigir(ctx: &Option<Extension<AuthContext>>, nivel: Nivel) -> Result<&AuthContext, ErroApi> {
    let c = &ctx
        .as_ref()
        .ok_or_else(|| ErroApi::nao_autenticado("Entre no Nexus (ou use o token do agente) para usar o Feedback."))?
        .0;
    let ok = match nivel {
        Nivel::Logado => true,
        Nivel::Leitura => !c.is_agente() || c.has_module(MODULE_CONFIGURACOES),
        Nivel::Nota => !c.is_agente() || c.can_edit_module(MODULE_CONFIGURACOES),
        Nivel::Entrega => c.role.is_supervisor() || (c.is_agente() && c.can_edit_module(MODULE_CONFIGURACOES)),
        Nivel::Supervisor => c.role.is_supervisor(),
    };
    if ok {
        Ok(c)
    } else {
        Err(ErroApi::sem_permissao(match nivel {
            Nivel::Supervisor => "Apenas supervisores podem fazer isso.",
            Nivel::Entrega => "Só supervisor ou agente com Configurações em editar entrega para conferência.",
            Nivel::Nota => "Sem permissão para comentar feedbacks.",
            _ => "Sem permissão para ver a fila de feedbacks.",
        }))
    }
}

async fn save_feedback_handler(
    State(state): State<Arc<AppState>>,
    ctx: Option<Extension<AuthContext>>,
    Json(body): Json<FeedbackSubmitInput>,
) -> impl IntoResponse {
    let c = match exigir(&ctx, Nivel::Logado) {
        Ok(c) => c,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| save_feedback_from_user_query(pool, &body, &c.display_name)).await {
        Ok(()) => {
            auditar(state.db.pool(), &c.display_name, "feedback_enviar", &body.id, json!({ "tipo": body.feedback_type, "tela": body.page })).await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn list_feedbacks_handler(
    State(state): State<Arc<AppState>>,
    ctx: Option<Extension<AuthContext>>,
) -> impl IntoResponse {
    if let Err(e) = exigir(&ctx, Nivel::Leitura) {
        return e.into_response();
    }
    match with_pool(&state, |pool| get_feedbacks_admin_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct FilaQuery {
    status: Option<String>,
    modulo: Option<String>,
    limite: Option<i64>,
}

async fn fila_handler(
    State(state): State<Arc<AppState>>,
    ctx: Option<Extension<AuthContext>>,
    Query(q): Query<FilaQuery>,
) -> impl IntoResponse {
    if let Err(e) = exigir(&ctx, Nivel::Leitura) {
        return e.into_response();
    }
    let status = match interpretar_status(q.status.as_deref()) {
        Ok(s) => s,
        Err(e) => return e.into_response(),
    };
    match listar_fila(state.db.pool(), &status, q.modulo.as_deref(), q.limite.unwrap_or(50)).await {
        Ok(v) => Json(json!({ "total": v.len(), "feedbacks": v })).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_feedback_handler(
    State(state): State<Arc<AppState>>,
    ctx: Option<Extension<AuthContext>>,
    Path(id): Path<String>,
    Json(body): Json<FeedbackAdminUpdate>,
) -> impl IntoResponse {
    let c = match exigir(&ctx, Nivel::Supervisor) {
        Ok(c) => c,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| update_feedback_admin_query(pool, &id, &body)).await {
        Ok(()) => {
            auditar(state.db.pool(), &c.display_name, "feedback_atualizar", &id, json!({ "status": body.status, "prioridade": body.priority })).await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct DetalheQuery {
    /// `print=false` omite o print (imagem em base64) da resposta.
    print: Option<bool>,
}

async fn get_detail_handler(
    State(state): State<Arc<AppState>>,
    ctx: Option<Extension<AuthContext>>,
    Path(id): Path<String>,
    Query(q): Query<DetalheQuery>,
) -> impl IntoResponse {
    if let Err(e) = exigir(&ctx, Nivel::Leitura) {
        return e.into_response();
    }
    match with_pool(&state, |pool| get_feedback_detail_query(pool, &id)).await {
        Ok(mut v) => {
            if q.print == Some(false) {
                v.feedback.screenshot = String::new();
            }
            ok_json(v).into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn add_note_handler(
    State(state): State<Arc<AppState>>,
    ctx: Option<Extension<AuthContext>>,
    Path(id): Path<String>,
    Json(body): Json<FeedbackNoteInput>,
) -> impl IntoResponse {
    let c = match exigir(&ctx, Nivel::Nota) {
        Ok(c) => c,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| add_feedback_note_query(pool, &id, &c.display_name, &body.body)).await {
        Ok(v) => {
            auditar(state.db.pool(), &c.display_name, "feedback_nota", &id, json!({ "nota": body.body.trim() })).await;
            ok_json(v).into_response()
        }
        Err(e) => e.into_response(),
    }
}

async fn reorder_handler(
    State(state): State<Arc<AppState>>,
    ctx: Option<Extension<AuthContext>>,
    Json(body): Json<FeedbackReorderInput>,
) -> impl IntoResponse {
    let c = match exigir(&ctx, Nivel::Supervisor) {
        Ok(c) => c,
        Err(e) => return e.into_response(),
    };
    match with_pool(&state, |pool| reorder_feedbacks_query(pool, &body.items)).await {
        Ok(()) => {
            let ids: Vec<&str> = body.items.iter().map(|i| i.id.as_str()).collect();
            auditar(state.db.pool(), &c.display_name, "feedback_reordenar", "fila", json!({ "ids": ids })).await;
            ok_status().into_response()
        }
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct TransicaoCorpo {
    #[serde(default)]
    nota: String,
    #[serde(default)]
    confirmar: bool,
}

async fn transicao_handler(
    t: Transicao,
    state: Arc<AppState>,
    ctx: Option<Extension<AuthContext>>,
    id: String,
    confirmar_query: bool,
    corpo: TransicaoCorpo,
) -> axum::response::Response {
    let nivel = if t == Transicao::Devolver { Nivel::Supervisor } else { Nivel::Entrega };
    let c = match exigir(&ctx, nivel) {
        Ok(c) => c,
        Err(e) => return e.into_response(),
    };
    match transicionar(state.db.pool(), t, &id, &c.display_name, &corpo.nota, confirmar_query || corpo.confirmar).await {
        Ok(r) => Json(corpo_acao(&r)).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn resolver_handler(
    State(state): State<Arc<AppState>>,
    ctx: Option<Extension<AuthContext>>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(corpo): Json<TransicaoCorpo>,
) -> impl IntoResponse {
    transicao_handler(Transicao::Resolver, state, ctx, id, c.confirmar, corpo).await
}

async fn devolver_handler(
    State(state): State<Arc<AppState>>,
    ctx: Option<Extension<AuthContext>>,
    Path(id): Path<String>,
    Query(c): Query<Confirmar>,
    Json(corpo): Json<TransicaoCorpo>,
) -> impl IntoResponse {
    transicao_handler(Transicao::Devolver, state, ctx, id, c.confirmar, corpo).await
}

pub fn router() -> axum::Router<Arc<AppState>> {
    use axum::routing::{get, post};

    axum::Router::new()
        .route("/api/hub/feedbacks", get(list_feedbacks_handler).post(save_feedback_handler))
        .route("/api/hub/feedbacks/manage", get(list_feedbacks_handler))
        .route("/api/hub/feedbacks/fila", get(fila_handler))
        .route("/api/hub/feedbacks/reorder", post(reorder_handler))
        .route("/api/hub/feedbacks/:id/notes", post(add_note_handler))
        .route("/api/hub/feedbacks/:id/resolver", post(resolver_handler))
        .route("/api/hub/feedbacks/:id/devolver", post(devolver_handler))
        .route("/api/hub/feedbacks/:id", get(get_detail_handler).put(update_feedback_handler))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::geral::auth::models::{Origem, OperatorRole};
    use std::collections::HashMap;

    fn ctx(role: OperatorRole, origem: Origem, nivel: Option<&str>) -> Option<Extension<AuthContext>> {
        let (modules, permissions) = match nivel {
            Some(n) => (vec![MODULE_CONFIGURACOES.to_string()], HashMap::from([(MODULE_CONFIGURACOES.to_string(), n.to_string())])),
            None => (vec![], HashMap::new()),
        };
        Some(Extension(AuthContext { operator_id: "1".into(), display_name: "Teste".into(), role, modules, permissions, origem }))
    }

    const TODOS: [Nivel; 5] = [Nivel::Logado, Nivel::Leitura, Nivel::Nota, Nivel::Entrega, Nivel::Supervisor];

    #[test]
    fn sem_sessao_nada_passa_nem_o_envio() {
        for n in TODOS {
            assert_eq!(exigir(&None, n).unwrap_err().codigo, "nao_autenticado");
        }
    }

    #[test]
    fn operador_de_tela_envia_ve_e_comenta_mas_nao_decide() {
        let c = ctx(OperatorRole::Operador, Origem::Tela, None);
        for n in [Nivel::Logado, Nivel::Leitura, Nivel::Nota] {
            assert!(exigir(&c, n).is_ok());
        }
        for n in [Nivel::Entrega, Nivel::Supervisor] {
            assert_eq!(exigir(&c, n).unwrap_err().codigo, "sem_permissao");
        }
    }

    #[test]
    fn agente_sem_configuracoes_nao_ve_nada_da_fila() {
        let c = ctx(OperatorRole::Operador, Origem::Agente, None);
        assert!(exigir(&c, Nivel::Logado).is_ok());
        for n in [Nivel::Leitura, Nivel::Nota, Nivel::Entrega, Nivel::Supervisor] {
            assert!(exigir(&c, n).is_err());
        }
    }

    #[test]
    fn agente_le_ou_entrega_conforme_o_nivel_e_nunca_decide() {
        let ver = ctx(OperatorRole::Operador, Origem::Agente, Some("view"));
        assert!(exigir(&ver, Nivel::Leitura).is_ok());
        assert!(exigir(&ver, Nivel::Entrega).is_err());
        let editar = ctx(OperatorRole::Operador, Origem::Agente, Some("edit"));
        assert!(exigir(&editar, Nivel::Entrega).is_ok());
        assert!(exigir(&editar, Nivel::Nota).is_ok());
        assert!(exigir(&editar, Nivel::Supervisor).is_err());
    }

    #[test]
    fn supervisor_faz_tudo() {
        let c = ctx(OperatorRole::Supervisor, Origem::Tela, None);
        for n in TODOS {
            assert!(exigir(&c, n).is_ok());
        }
    }
}
