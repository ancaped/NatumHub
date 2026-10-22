//! Memória das decisões do Edson no Gerenciamento de Produção.
//!
//! Uma tabela só (`producao_decisoes`, chave = tipo + chave). A memória apenas SUGERE: quem decide é o Edson,
//! e nada aqui escreve no ERP ou na fórmula. Sem expiração: a decisão vale até ser desfeita.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::auditoria;

/// Tipos aceitos; qualquer outro é recusado para a tabela não virar depósito de lixo.
pub const TIPO_BASE_FONTE: &str = "base_fonte";
pub const TIPO_FILA_DESCARTADA: &str = "fila_descartada";
const TIPOS: [&str; 2] = [TIPO_BASE_FONTE, TIPO_FILA_DESCARTADA];

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/decisoes", get(listar_rota).put(registrar_rota).delete(remover_rota))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Decisao {
    pub tipo: String,
    pub chave: String,
    pub valor: String,
    pub vezes: i32,
    pub atualizado_em: String,
}

fn erro(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

fn tipo_valido(tipo: &str) -> bool {
    TIPOS.contains(&tipo)
}

/// Grava (ou atualiza) a decisão. Repetir a mesma escolha só soma `vezes`.
pub async fn registrar(pool: &PgPool, tipo: &str, chave: &str, valor: &str, usuario: &str) -> Result<(), String> {
    sqlx::query(
        r#"
        INSERT INTO producao_decisoes (tipo, chave, valor, vezes, atualizado_por, atualizado_em)
        VALUES ($1, $2, $3, 1, $4, NOW())
        ON CONFLICT (tipo, chave) DO UPDATE SET
            valor = EXCLUDED.valor,
            vezes = CASE WHEN producao_decisoes.valor = EXCLUDED.valor THEN producao_decisoes.vezes + 1 ELSE 1 END,
            atualizado_por = EXCLUDED.atualizado_por,
            atualizado_em = NOW()
        "#,
    )
    .bind(tipo)
    .bind(chave)
    .bind(valor)
    .bind(usuario)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| format!("Erro ao gravar a decisão: {e}"))
}

/// Decisão atual de (tipo, chave): (valor, vezes).
pub async fn atual(pool: &PgPool, tipo: &str, chave: &str) -> Result<Option<(String, i32)>, String> {
    let r = sqlx::query("SELECT valor, vezes FROM producao_decisoes WHERE tipo = $1 AND chave = $2")
        .bind(tipo)
        .bind(chave)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Erro ao ler a decisão: {e}"))?;
    Ok(r.map(|r| (r.get::<String, _>("valor"), r.get::<i32, _>("vezes"))))
}

pub async fn remover(pool: &PgPool, tipo: &str, chave: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM producao_decisoes WHERE tipo = $1 AND chave = $2")
        .bind(tipo)
        .bind(chave)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| format!("Erro ao remover a decisão: {e}"))
}

pub async fn listar(pool: &PgPool, tipo: &str) -> Result<Vec<Decisao>, String> {
    let rows = sqlx::query(
        "SELECT tipo, chave, valor, vezes, to_char(atualizado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS em \
         FROM producao_decisoes WHERE tipo = $1 ORDER BY chave",
    )
    .bind(tipo)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler as decisões: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|r| Decisao {
            tipo: r.get::<String, _>("tipo"),
            chave: r.get::<String, _>("chave"),
            valor: r.get::<String, _>("valor"),
            vezes: r.get::<i32, _>("vezes"),
            atualizado_em: r.get::<Option<String>, _>("em").unwrap_or_default(),
        })
        .collect())
}

#[derive(Debug, Deserialize)]
pub struct TipoQuery {
    pub tipo: String,
    pub chave: Option<String>,
    pub confirmar: Option<bool>,
}

async fn listar_rota(State(state): State<Arc<AppState>>, Query(q): Query<TipoQuery>) -> impl IntoResponse {
    if !tipo_valido(&q.tipo) {
        return erro(StatusCode::BAD_REQUEST, format!("Tipo de decisão inválido: {}", q.tipo));
    }
    match listar(state.db.pool(), &q.tipo).await {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(Debug, Deserialize)]
pub struct RegistrarBody {
    pub tipo: String,
    pub chave: String,
    #[serde(default)]
    pub valor: String,
    /// Sem `true` a rota só devolve a prévia (nada é gravado).
    #[serde(default)]
    pub confirmar: bool,
}

async fn registrar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(b): Json<RegistrarBody>,
) -> impl IntoResponse {
    if !tipo_valido(&b.tipo) {
        return erro(StatusCode::BAD_REQUEST, format!("Tipo de decisão inválido: {}", b.tipo));
    }
    let chave = b.chave.trim();
    if chave.is_empty() {
        return erro(StatusCode::BAD_REQUEST, "Informe a chave da decisão.");
    }
    let pool = state.db.pool();
    let valor = b.valor.trim();
    if !b.confirmar {
        return match atual(pool, &b.tipo, chave).await {
            Ok(a) => (
                StatusCode::OK,
                Json(json!({
                    "previa": true, "acao": "registrar_decisao", "tipo": b.tipo, "chave": chave,
                    "valorAtual": a.as_ref().map(|x| x.0.clone()), "vezes": a.as_ref().map(|x| x.1),
                    "valorNovo": valor, "confirmar": "repita com confirmar=true para gravar"
                })),
            )
                .into_response(),
            Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
        };
    }
    match registrar(pool, &b.tipo, chave, valor, &ctx.display_name).await {
        Ok(()) => {
            auditoria::registrar(pool, &ctx.display_name, "registrar_decisao", &format!("{}:{chave}", b.tipo), json!({ "valor": valor })).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn remover_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<TipoQuery>,
) -> impl IntoResponse {
    if !tipo_valido(&q.tipo) {
        return erro(StatusCode::BAD_REQUEST, format!("Tipo de decisão inválido: {}", q.tipo));
    }
    let Some(chave) = q.chave.as_deref().map(str::trim).filter(|c| !c.is_empty()) else {
        return erro(StatusCode::BAD_REQUEST, "Informe a chave da decisão.");
    };
    let pool = state.db.pool();
    if q.confirmar != Some(true) {
        return match atual(pool, &q.tipo, chave).await {
            Ok(a) => (
                StatusCode::OK,
                Json(json!({
                    "previa": true, "acao": "remover_decisao", "tipo": q.tipo, "chave": chave,
                    "valorAtual": a.as_ref().map(|x| x.0.clone()), "existe": a.is_some(),
                    "confirmar": "repita com confirmar=true para remover"
                })),
            )
                .into_response(),
            Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
        };
    }
    match remover(pool, &q.tipo, chave).await {
        Ok(()) => {
            auditoria::registrar(pool, &ctx.display_name, "remover_decisao", &format!("{}:{chave}", q.tipo), json!({})).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so_aceita_os_tipos_conhecidos() {
        assert!(tipo_valido("base_fonte"));
        assert!(tipo_valido("fila_descartada"));
        assert!(!tipo_valido("qualquer_coisa"));
    }

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn registrar_listar_e_remover_no_banco() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let chave = "TESTE.DECISAO.1";
        remover(&pool, TIPO_BASE_FONTE, chave).await.unwrap();

        registrar(&pool, TIPO_BASE_FONTE, chave, "estoque", "teste").await.unwrap();
        registrar(&pool, TIPO_BASE_FONTE, chave, "estoque", "teste").await.unwrap();
        let d = listar(&pool, TIPO_BASE_FONTE).await.unwrap().into_iter().find(|d| d.chave == chave).unwrap();
        assert_eq!((d.valor.as_str(), d.vezes), ("estoque", 2), "repetir a escolha soma");

        registrar(&pool, TIPO_BASE_FONTE, chave, "ordem_base", "teste").await.unwrap();
        let d = listar(&pool, TIPO_BASE_FONTE).await.unwrap().into_iter().find(|d| d.chave == chave).unwrap();
        assert_eq!((d.valor.as_str(), d.vezes), ("ordem_base", 1), "mudar a escolha recomeça a contagem");

        remover(&pool, TIPO_BASE_FONTE, chave).await.unwrap();
        assert!(listar(&pool, TIPO_BASE_FONTE).await.unwrap().iter().all(|d| d.chave != chave));
    }
}
