//! Auditoria das ações do Gerenciamento de Produção: quem fez o quê, quando.
//!
//! Regra fixa do Edson: toda função do Nexus também serve a agentes de IA. Por isso a lógica fica em serviços
//! (`decisoes`, `trocas`, `cobertura`), as escritas têm 2 passos (prévia + `confirmar=true`) e cada gravação
//! passa por aqui, com o usuário que a fez (operador da tela ou agente autenticado).

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::catalogo::{param, Acao};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/auditoria", get(listar_rota))
}

/// Ações de consulta da auditoria descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<Acao> {
    vec![Acao::leitura(
        "listar_auditoria_producao",
        "producao",
        "Lista quem fez o quê no Gerenciamento de Produção (mais recentes primeiro).",
        "/api/producao/auditoria",
        vec![param("limite", "query", "inteiro", false, "Quantos registros (1 a 500; padrão 50).")],
    )]
}

/// Grava a ação. Falha de auditoria não desfaz a ação já feita, mas fica no log do servidor.
pub async fn registrar(pool: &PgPool, usuario: &str, acao: &str, alvo: &str, detalhe: Value) {
    if let Err(e) = sqlx::query("INSERT INTO producao_auditoria (usuario, acao, alvo, detalhe) VALUES ($1, $2, $3, $4)")
        .bind(usuario)
        .bind(acao)
        .bind(alvo)
        .bind(detalhe)
        .execute(pool)
        .await
    {
        eprintln!("[auditoria] falha ao registrar {acao} {alvo}: {e}");
        crate::modules::geral::alertas::alertar(pool, "auditoria", "Auditoria não gravou", &format!("Falha ao registrar {acao}: {e}")).await;
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Registro {
    pub quando: String,
    pub usuario: String,
    pub acao: String,
    pub alvo: String,
    pub detalhe: Value,
}

pub async fn listar(pool: &PgPool, limite: i64) -> Result<Vec<Registro>, String> {
    let rows = sqlx::query(
        "SELECT to_char(quando AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') AS q, usuario, acao, alvo, detalhe \
         FROM producao_auditoria ORDER BY id DESC LIMIT $1",
    )
    .bind(limite.clamp(1, 500))
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler a auditoria: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|r| Registro {
            quando: r.get::<Option<String>, _>("q").unwrap_or_default(),
            usuario: r.get::<String, _>("usuario"),
            acao: r.get::<String, _>("acao"),
            alvo: r.get::<String, _>("alvo"),
            detalhe: r.get::<Value, _>("detalhe"),
        })
        .collect())
}

#[derive(Debug, Deserialize)]
pub struct LimiteQuery {
    pub limite: Option<i64>,
}

async fn listar_rota(State(state): State<Arc<AppState>>, Query(q): Query<LimiteQuery>) -> impl IntoResponse {
    match listar(state.db.pool(), q.limite.unwrap_or(50)).await {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn grava_e_lista_a_auditoria_no_banco() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        registrar(&pool, "agente-teste", "acao_teste", "alvo-1", json!({ "k": 1 })).await;
        let l = listar(&pool, 5).await.unwrap();
        let r = l.iter().find(|r| r.acao == "acao_teste").expect("registro gravado");
        assert_eq!((r.usuario.as_str(), r.alvo.as_str()), ("agente-teste", "alvo-1"));
        assert_eq!(r.detalhe["k"], 1);
        sqlx::query("DELETE FROM producao_auditoria WHERE acao = 'acao_teste'").execute(&pool).await.unwrap();
    }
}
