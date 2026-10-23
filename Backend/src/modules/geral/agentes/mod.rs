//! Agentes de IA como operadores do Nexus.
//!
//! Um agente é um operador com `kind = 'agente'`: entra só com token próprio (`nxa_...`, guardado como SHA-256),
//! nunca por senha, nunca é supervisor e só vê/edita os módulos marcados para ele (sem módulos padrão do papel).
//! As permissões são as mesmas dos operadores (`hub_operator_modules`), então a tela Operadores também as edita.
//! Toda ação do agente sai na auditoria geral com `origem = 'agente'`.

use std::{collections::BTreeMap, sync::Arc};

use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    routing::{get, post},
    Extension, Json, Router,
};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::core::acao::{executar_em_2_passos, Confirmar, ErroApi, RespostaAcao};
use crate::handlers::AppState;
use crate::modules::geral::audit;
use crate::modules::geral::auth::models::{AuthContext, OperatorRole, Origem};
use crate::modules::geral::auth::modules_registry::all_module_keys_vec;
use crate::modules::geral::auth::store::get_operator_modules_and_permissions;

pub const PREFIXO_TOKEN: &str = "nxa_";
const MODULO_AUDITORIA: &str = "hub_settings";

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/agentes/eu", get(eu_rota))
        .route("/api/admin/agentes", get(listar_rota).post(criar_rota))
        .route("/api/admin/agentes/:id/token", post(novo_token_rota))
        .route("/api/admin/agentes/:id/revogar", post(revogar_rota))
}

pub fn gerar_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    format!("{PREFIXO_TOKEN}{}", hex::encode(bytes))
}

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

/// Começo do token, para reconhecer qual é sem guardá-lo.
fn prefixo_visivel(token: &str) -> String {
    token.chars().take(PREFIXO_TOKEN.len() + 6).collect()
}

/// Nível gravado (`view`/`edit`) para o usado na API (`ver`/`editar`).
fn nivel_api(nivel_db: &str) -> &'static str {
    if nivel_db == "view" { "ver" } else { "editar" }
}

fn nivel_db(nivel_api: &str) -> Option<&'static str> {
    match nivel_api {
        "ver" => Some("view"),
        "editar" => Some("edit"),
        _ => None,
    }
}

/// Sessão de um token de agente. `None` se o token não existe, foi revogado ou o agente está inativo.
pub async fn resolver_token(pool: &PgPool, token: &str) -> Result<Option<AuthContext>, String> {
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT t.id, o.id, o.display_name FROM hub_agent_tokens t \
         JOIN hub_operators o ON o.id = t.operator_id \
         WHERE t.token_hash = $1 AND t.revogado_em IS NULL AND o.active = 1 AND o.kind = 'agente'",
    )
    .bind(hash_token(token))
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some((token_id, operator_id, display_name)) = row else {
        return Ok(None);
    };
    let _ = sqlx::query("UPDATE hub_agent_tokens SET ultimo_uso = NOW() WHERE id = $1")
        .bind(&token_id)
        .execute(pool)
        .await;
    let (modules, permissions) = get_operator_modules_and_permissions(pool, &operator_id).await?;
    Ok(Some(AuthContext {
        operator_id,
        display_name,
        role: OperatorRole::Operador,
        modules,
        permissions,
        origem: Origem::Agente,
    }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Eu {
    pub id: String,
    pub nome: String,
    pub origem: &'static str,
    pub supervisor: bool,
    /// módulo → `ver` ou `editar`
    pub modulos: BTreeMap<String, &'static str>,
}

/// Quem está chamando e o que pode fazer. Serve para o agente se orientar antes de agir.
pub fn eu(ctx: &AuthContext) -> Eu {
    Eu {
        id: ctx.operator_id.clone(),
        nome: ctx.display_name.clone(),
        origem: ctx.origem.as_str(),
        supervisor: ctx.role.is_supervisor(),
        modulos: ctx
            .modules
            .iter()
            .map(|m| (m.clone(), if ctx.can_edit_module(m) { "editar" } else { "ver" }))
            .collect(),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenResumo {
    pub id: String,
    pub prefixo: String,
    pub criado_em: String,
    pub criado_por: Option<String>,
    pub ultimo_uso: Option<String>,
    pub revogado_em: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Agente {
    pub id: String,
    pub nome: String,
    pub ativo: bool,
    pub modulos: BTreeMap<String, &'static str>,
    pub tokens: Vec<TokenResumo>,
}

const FMT_DATA: &str = "'YYYY-MM-DD HH24:MI:SS'";

pub async fn listar(pool: &PgPool) -> Result<Vec<Agente>, ErroApi> {
    let agentes: Vec<(String, String, i32)> = sqlx::query_as(
        "SELECT id, display_name, active FROM hub_operators WHERE kind = 'agente' ORDER BY LOWER(display_name)",
    )
    .fetch_all(pool)
    .await?;
    let mut out = Vec::with_capacity(agentes.len());
    for (id, nome, ativo) in agentes {
        let (modulos, niveis) = get_operator_modules_and_permissions(pool, &id).await.map_err(ErroApi::interno)?;
        let tokens: Vec<(String, String, String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(&format!(
            "SELECT id, prefixo, to_char(criado_em AT TIME ZONE 'America/Sao_Paulo', {FMT_DATA}), criado_por, \
                    to_char(ultimo_uso AT TIME ZONE 'America/Sao_Paulo', {FMT_DATA}), \
                    to_char(revogado_em AT TIME ZONE 'America/Sao_Paulo', {FMT_DATA}) \
             FROM hub_agent_tokens WHERE operator_id = $1 ORDER BY criado_em DESC"
        ))
        .bind(&id)
        .fetch_all(pool)
        .await?;
        out.push(Agente {
            id,
            nome,
            ativo: ativo == 1,
            modulos: modulos
                .into_iter()
                .map(|m| {
                    let n = nivel_api(niveis.get(&m).map(String::as_str).unwrap_or("edit"));
                    (m, n)
                })
                .collect(),
            tokens: tokens
                .into_iter()
                .map(|(id, prefixo, criado_em, criado_por, ultimo_uso, revogado_em)| TokenResumo {
                    id,
                    prefixo,
                    criado_em,
                    criado_por,
                    ultimo_uso,
                    revogado_em,
                })
                .collect(),
        });
    }
    Ok(out)
}

#[derive(Debug, Deserialize)]
pub struct NovoAgente {
    pub nome: String,
    /// módulo → `ver` ou `editar`
    #[serde(default)]
    pub modulos: BTreeMap<String, String>,
    #[serde(default)]
    pub confirmar: bool,
}

/// Valida módulos e níveis; devolve (módulo, nível gravado).
fn validar_modulos(modulos: &BTreeMap<String, String>) -> Result<Vec<(String, &'static str)>, ErroApi> {
    let validos = all_module_keys_vec();
    modulos
        .iter()
        .map(|(m, n)| {
            if !validos.iter().any(|v| v == m) {
                return Err(ErroApi::invalido(format!("Módulo desconhecido: {m}.")).com_detalhes(json!({ "modulo": m })));
            }
            let nivel = nivel_db(n.trim())
                .ok_or_else(|| ErroApi::invalido(format!("Nível inválido para {m}: use 'ver' ou 'editar'.")))?;
            Ok((m.clone(), nivel))
        })
        .collect()
}

/// Cria o agente com seus módulos e o primeiro token. O token só aparece na resposta com `confirmar`.
pub async fn criar(pool: &PgPool, autor: &AuthContext, entrada: NovoAgente) -> Result<RespostaAcao<Value>, ErroApi> {
    let nome = entrada.nome.trim().to_string();
    if nome.is_empty() {
        return Err(ErroApi::invalido("Informe o nome do agente."));
    }
    let modulos = validar_modulos(&entrada.modulos)?;
    let confirmar = entrada.confirmar;
    let criado_por = autor.display_name.clone();
    let resposta = executar_em_2_passos(pool, "criar_agente", confirmar, move |tx| {
        Box::pin(async move {
            let existe: Option<String> =
                sqlx::query_scalar("SELECT id FROM hub_operators WHERE LOWER(display_name) = LOWER($1)")
                    .bind(&nome)
                    .fetch_optional(&mut **tx)
                    .await?;
            if existe.is_some() {
                return Err(ErroApi::conflito("Já existe um operador ou agente com esse nome."));
            }
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO hub_operators (id, display_name, role, active, update_channel, kind) \
                 VALUES ($1, $2, 'operador', 1, 'stable', 'agente')",
            )
            .bind(&id)
            .bind(&nome)
            .execute(&mut **tx)
            .await?;
            for (modulo, nivel) in &modulos {
                sqlx::query("INSERT INTO hub_operator_modules (operator_id, module_key, access_level) VALUES ($1, $2, $3)")
                    .bind(&id)
                    .bind(modulo)
                    .bind(nivel)
                    .execute(&mut **tx)
                    .await?;
            }
            let token = gerar_token();
            gravar_token(tx, &id, &token, &criado_por).await?;
            Ok(json!({
                "id": id,
                "nome": nome,
                "modulos": modulos.iter().map(|(m, n)| (m.clone(), nivel_api(n))).collect::<BTreeMap<_, _>>(),
                "token": confirmar.then_some(token),
                "aviso": confirmar.then_some("Guarde o token agora: ele não aparece de novo."),
            }))
        })
    })
    .await?;
    if confirmar {
        let r = &resposta.resultado;
        let id = r["id"].as_str().unwrap_or_default();
        let depois = json!({ "nome": r["nome"], "modulos": r["modulos"] });
        audit::record_domain(pool, Some(autor), MODULO_AUDITORIA, "criar_agente", "agente", id, "Agente de IA criado", None, Some(depois)).await;
    }
    Ok(resposta)
}

async fn gravar_token(
    tx: &mut sqlx::Transaction<'static, sqlx::Postgres>,
    operator_id: &str,
    token: &str,
    criado_por: &str,
) -> Result<(), ErroApi> {
    sqlx::query(
        "INSERT INTO hub_agent_tokens (id, operator_id, token_hash, prefixo, criado_por) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(operator_id)
    .bind(hash_token(token))
    .bind(prefixo_visivel(token))
    .bind(criado_por)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn nome_do_agente(tx: &mut sqlx::Transaction<'static, sqlx::Postgres>, id: &str) -> Result<String, ErroApi> {
    sqlx::query_scalar("SELECT display_name FROM hub_operators WHERE id = $1 AND kind = 'agente'")
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| ErroApi::nao_encontrado("Agente não encontrado."))
}

async fn revogar_tokens(tx: &mut sqlx::Transaction<'static, sqlx::Postgres>, id: &str) -> Result<u64, ErroApi> {
    Ok(sqlx::query("UPDATE hub_agent_tokens SET revogado_em = NOW() WHERE operator_id = $1 AND revogado_em IS NULL")
        .bind(id)
        .execute(&mut **tx)
        .await?
        .rows_affected())
}

/// Troca o token: revoga os ativos e gera um novo (que só aparece com `confirmar`).
pub async fn novo_token(pool: &PgPool, autor: &AuthContext, id: &str, confirmar: bool) -> Result<RespostaAcao<Value>, ErroApi> {
    let (id_tx, criado_por) = (id.to_string(), autor.display_name.clone());
    let resposta = executar_em_2_passos(pool, "trocar_token_agente", confirmar, move |tx| {
        Box::pin(async move {
            let nome = nome_do_agente(tx, &id_tx).await?;
            let revogados = revogar_tokens(tx, &id_tx).await?;
            let token = gerar_token();
            gravar_token(tx, &id_tx, &token, &criado_por).await?;
            Ok(json!({
                "agente": nome,
                "tokensRevogados": revogados,
                "token": confirmar.then_some(token),
                "aviso": confirmar.then_some("Guarde o token agora: ele não aparece de novo."),
            }))
        })
    })
    .await?;
    if confirmar {
        let depois = json!({ "tokensRevogados": resposta.resultado["tokensRevogados"] });
        audit::record_domain(pool, Some(autor), MODULO_AUDITORIA, "trocar_token_agente", "agente", id, "Token de agente trocado", None, Some(depois)).await;
    }
    Ok(resposta)
}

/// Revoga todos os tokens ativos: o agente para de entrar até ganhar um token novo.
pub async fn revogar(pool: &PgPool, autor: &AuthContext, id: &str, confirmar: bool) -> Result<RespostaAcao<Value>, ErroApi> {
    let id_tx = id.to_string();
    let resposta = executar_em_2_passos(pool, "revogar_agente", confirmar, move |tx| {
        Box::pin(async move {
            let nome = nome_do_agente(tx, &id_tx).await?;
            let revogados = revogar_tokens(tx, &id_tx).await?;
            Ok(json!({ "agente": nome, "tokensRevogados": revogados }))
        })
    })
    .await?;
    if confirmar {
        let depois = json!({ "tokensRevogados": resposta.resultado["tokensRevogados"] });
        audit::record_domain(pool, Some(autor), MODULO_AUDITORIA, "revogar_agente", "agente", id, "Tokens de agente revogados", None, Some(depois)).await;
    }
    Ok(resposta)
}

fn responder<T: Serialize>(r: Result<T, ErroApi>) -> Response {
    match r {
        Ok(v) => Json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

/// O middleware já barra quem não é supervisor; repetido aqui para a regra não depender só da lista de caminhos.
fn exigir_supervisor(ctx: &AuthContext) -> Result<(), ErroApi> {
    if ctx.role.is_supervisor() && !ctx.is_agente() {
        Ok(())
    } else {
        Err(ErroApi::novo(axum::http::StatusCode::FORBIDDEN, "apenas_supervisor", "Apenas o supervisor gerencia agentes."))
    }
}

async fn eu_rota(Extension(ctx): Extension<AuthContext>) -> Response {
    Json(eu(&ctx)).into_response()
}

async fn listar_rota(State(state): State<Arc<AppState>>, Extension(ctx): Extension<AuthContext>) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    responder(listar(state.db.pool()).await)
}

async fn criar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(entrada): Json<NovoAgente>,
) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    responder(criar(state.db.pool(), &ctx, entrada).await)
}

async fn novo_token_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<Confirmar>,
) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    responder(novo_token(state.db.pool(), &ctx, &id, q.confirmar).await)
}

async fn revogar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Query(q): Query<Confirmar>,
) -> Response {
    if let Err(e) = exigir_supervisor(&ctx) {
        return e.into_response();
    }
    responder(revogar(state.db.pool(), &ctx, &id, q.confirmar).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn token_tem_prefixo_e_hash_estavel() {
        let t = gerar_token();
        assert!(t.starts_with(PREFIXO_TOKEN));
        assert_eq!(t.len(), PREFIXO_TOKEN.len() + 64);
        assert_ne!(t, gerar_token());
        assert_eq!(hash_token(&t), hash_token(&t));
        assert_ne!(hash_token(&t), t);
        assert_eq!(prefixo_visivel(&t).len(), PREFIXO_TOKEN.len() + 6);
    }

    #[test]
    fn modulos_aceitam_so_chave_conhecida_e_ver_ou_editar() {
        let chave = all_module_keys_vec().into_iter().next().unwrap();
        let ok = BTreeMap::from([(chave.clone(), "ver".to_string())]);
        assert_eq!(validar_modulos(&ok).unwrap(), vec![(chave.clone(), "view")]);
        let nivel_ruim = BTreeMap::from([(chave, "admin".to_string())]);
        assert_eq!(validar_modulos(&nivel_ruim).unwrap_err().codigo, "invalido");
        let modulo_ruim = BTreeMap::from([("nao_existe".to_string(), "ver".to_string())]);
        assert_eq!(validar_modulos(&modulo_ruim).unwrap_err().codigo, "invalido");
    }

    #[test]
    fn eu_mostra_nivel_por_modulo_e_origem() {
        let ctx = AuthContext {
            operator_id: "a1".into(),
            display_name: "Agente PCP".into(),
            role: OperatorRole::Operador,
            modules: vec!["producao".into(), "compras".into()],
            permissions: HashMap::from([("producao".into(), "view".into()), ("compras".into(), "edit".into())]),
            origem: Origem::Agente,
        };
        let e = eu(&ctx);
        assert_eq!(e.origem, "agente");
        assert!(!e.supervisor);
        assert_eq!(e.modulos["producao"], "ver");
        assert_eq!(e.modulos["compras"], "editar");
        assert!(exigir_supervisor(&ctx).is_err());
    }
}
