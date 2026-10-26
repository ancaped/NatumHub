//! Estado dos quadros (ordem manual, concluídos, liberados para envase, filas manuais, caldeira, adiados).
//! Antes ficava no localStorage de cada navegador; aqui é do servidor, único para todos os operadores.
//! Cada chave guarda um JSON inteiro; toda mudança grava o valor anterior no histórico, com o autor.

use axum::{extract::State, response::Response, Extension, Json};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::core::acao::ErroApi;
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::handlers::{autor, exigir_edicao, ok};

/// Chaves aceitas (o resto é recusado, para a tabela não virar depósito livre).
pub const CHAVES: [&str; 10] = [
    "producao_order_overrides",
    "pesagem_order_overrides",
    "pesagem_concluidos_lotes",
    "producao_concluidos_lotes",
    "manual_liberados_envase",
    "filas_manuais_adicionados",
    "lotes_adiados_historico",
    "caldeira_ativa",
    "caldeira_historico",
    "lotes_com_caldeira",
];

const LIMITE_BYTES: usize = 1_000_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalvarEstadoPayload {
    pub chave: String,
    pub valor: Value,
    /// `true` quando o valor vem do localStorage do navegador (migração única): só grava se a chave ainda não existe.
    #[serde(default)]
    pub migrado_do_navegador: bool,
}

pub async fn ler_todos(pool: &PgPool) -> Result<Map<String, Value>, ErroApi> {
    let rows = sqlx::query("SELECT chave, valor FROM acompanhamento_quadros_estado").fetch_all(pool).await?;
    let mut m = Map::new();
    for r in rows {
        m.insert(r.get::<String, _>("chave"), r.get::<Value, _>("valor"));
    }
    Ok(m)
}

/// Grava a chave e registra o histórico na mesma transação. Devolve `false` quando a migração do navegador
/// encontrou a chave já preenchida no servidor (o servidor vence).
pub async fn salvar(pool: &PgPool, p: &SalvarEstadoPayload, usuario: &str) -> Result<bool, ErroApi> {
    if !CHAVES.contains(&p.chave.as_str()) {
        return Err(ErroApi::invalido(format!("Chave de estado desconhecida: {}", p.chave)));
    }
    if serde_json::to_vec(&p.valor).map(|v| v.len()).unwrap_or(usize::MAX) > LIMITE_BYTES {
        return Err(ErroApi::invalido("Valor grande demais para o estado do quadro."));
    }
    let mut tx = pool.begin().await?;
    let anterior: Option<Value> = sqlx::query_scalar("SELECT valor FROM acompanhamento_quadros_estado WHERE chave = $1 FOR UPDATE")
        .bind(&p.chave)
        .fetch_optional(&mut *tx)
        .await?;
    if p.migrado_do_navegador && anterior.is_some() {
        return Ok(false);
    }
    sqlx::query(
        "INSERT INTO acompanhamento_quadros_estado (chave, valor, atualizado_por, atualizado_em) VALUES ($1, $2, $3, NOW()) \
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = NOW()",
    )
    .bind(&p.chave)
    .bind(&p.valor)
    .bind(usuario)
    .execute(&mut *tx)
    .await?;
    let origem = if p.migrado_do_navegador { "migrado do navegador" } else { "tela" };
    sqlx::query(
        "INSERT INTO acompanhamento_quadros_estado_historico (chave, valor_anterior, valor_novo, origem, autor) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&p.chave)
    .bind(&anterior)
    .bind(&p.valor)
    .bind(origem)
    .bind(usuario)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(true)
}

pub async fn get_quadros_estado(State(state): State<Arc<AppState>>) -> Result<Response, ErroApi> {
    let estado = ler_todos(state.db.pool()).await?;
    Ok(ok(json!({ "estado": estado })))
}

pub async fn salvar_quadros_estado(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<SalvarEstadoPayload>,
) -> Result<Response, ErroApi> {
    exigir_edicao(&ctx)?;
    let gravado = salvar(state.db.pool(), &payload, &autor(&ctx)).await?;
    Ok(ok(json!({ "success": true, "gravado": gravado })))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn pool() -> PgPool {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        sqlx::raw_sql(include_str!("../../../../supabase/066_acompanhamento_quadros_estado.sql")).execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn salva_le_e_migracao_do_navegador_so_grava_se_ausente() {
        let pool = pool().await;
        sqlx::query("DELETE FROM acompanhamento_quadros_estado WHERE chave = 'caldeira_historico'").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM acompanhamento_quadros_estado_historico WHERE chave = 'caldeira_historico'").execute(&pool).await.unwrap();

        let navegador = SalvarEstadoPayload { chave: "caldeira_historico".into(), valor: json!([{"id": "a"}]), migrado_do_navegador: true };
        assert!(salvar(&pool, &navegador, "t").await.unwrap(), "chave ausente: migra");
        let outro = SalvarEstadoPayload { chave: "caldeira_historico".into(), valor: json!([{"id": "b"}]), migrado_do_navegador: true };
        assert!(!salvar(&pool, &outro, "t").await.unwrap(), "chave presente: o servidor vence");
        let tela = SalvarEstadoPayload { chave: "caldeira_historico".into(), valor: json!([]), migrado_do_navegador: false };
        assert!(salvar(&pool, &tela, "t").await.unwrap());

        let estado = ler_todos(&pool).await.unwrap();
        assert_eq!(estado["caldeira_historico"], json!([]));
        let origens: Vec<String> = sqlx::query_scalar("SELECT origem FROM acompanhamento_quadros_estado_historico WHERE chave = 'caldeira_historico' ORDER BY id")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(origens, vec!["migrado do navegador", "tela"]);

        let invalida = SalvarEstadoPayload { chave: "qualquer".into(), valor: json!(1), migrado_do_navegador: false };
        assert!(salvar(&pool, &invalida, "t").await.is_err());
    }
}
