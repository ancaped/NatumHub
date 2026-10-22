//! Insumos "sem controle de estoque": só o Edson marca ou desmarca (nunca automático, nunca por heurística).
//! Marcado = a cobertura e o relatório de faltas não acusam falta desse insumo. Compras/MRP não mudam.

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::get, Extension, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{PgPool, Row};
use std::collections::HashSet;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::auditoria;
use crate::modules::producao::cobertura::store::canon;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/producao/insumos-sem-controle", get(listar_rota).put(alterar_rota))
}

fn erro(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

/// Códigos marcados (para a cobertura).
pub async fn carregar_codigos(pool: &PgPool) -> Result<HashSet<String>, String> {
    let rows = sqlx::query("SELECT codigo FROM producao_insumos_sem_controle")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao ler os insumos sem controle: {e}"))?;
    Ok(rows.into_iter().map(|r| canon(&r.get::<String, _>("codigo"))).collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InsumoMarcado {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    pub marcado_por: Option<String>,
    pub marcado_em: String,
}

pub async fn listar(pool: &PgPool) -> Result<Vec<InsumoMarcado>, String> {
    let rows = sqlx::query(
        r#"
        SELECT m.codigo, COALESCE(i.description, '') AS descricao, i.unit, m.marcado_por,
               to_char(m.marcado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS em
        FROM producao_insumos_sem_controle m
        LEFT JOIN items i ON TRIM(REPLACE(i.code, '"', '')) = m.codigo
        ORDER BY descricao, m.codigo
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler os insumos sem controle: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|r| InsumoMarcado {
            codigo: r.get::<String, _>("codigo"),
            descricao: r.get::<String, _>("descricao"),
            unidade: r.get::<Option<String>, _>("unit"),
            marcado_por: r.get::<Option<String>, _>("marcado_por"),
            marcado_em: r.get::<Option<String>, _>("em").unwrap_or_default(),
        })
        .collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Previa {
    pub previa: bool,
    pub acao: &'static str,
    pub codigo: String,
    pub descricao: String,
    pub marcado_agora: bool,
    pub marcar: bool,
    /// Ordens planejadas (sem lote no ERP, dos últimos 14 dias em diante) cujo produto usa o insumo na fórmula.
    pub ordens_planejadas_que_usam: i64,
    pub confirmar: &'static str,
}

#[derive(Debug, Deserialize)]
pub struct Alteracao {
    pub codigo: String,
    /// true = marcar como sem controle; false = voltar a controlar.
    pub marcado: bool,
    /// Sem `true` só devolve a prévia (nada é gravado).
    #[serde(default)]
    pub confirmar: bool,
}

async fn validar(pool: &PgPool, codigo: &str) -> Result<(String, String), (StatusCode, String)> {
    let c = canon(codigo);
    if c.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Informe o código do insumo.".into()));
    }
    let desc: Option<String> =
        sqlx::query_scalar("SELECT COALESCE(description, '') FROM items WHERE TRIM(REPLACE(code, '\"', '')) = $1 LIMIT 1")
            .bind(&c)
            .fetch_optional(pool)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao conferir o insumo: {e}")))?;
    match desc {
        Some(d) => Ok((c, d)),
        None => Err((StatusCode::BAD_REQUEST, format!("O insumo {c} não existe no cadastro de itens."))),
    }
}

pub async fn previa(pool: &PgPool, a: &Alteracao) -> Result<Previa, (StatusCode, String)> {
    let (codigo, descricao) = validar(pool, &a.codigo).await?;
    let interno = |e: sqlx::Error| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao calcular a prévia: {e}"));
    let marcado_agora: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM producao_insumos_sem_controle WHERE codigo = $1)")
        .bind(&codigo)
        .fetch_one(pool)
        .await
        .map_err(interno)?;
    let ordens: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM producao_planejamento_semanal pp \
         WHERE (pp.ordem_status IS NULL OR pp.ordem_status <> 'cancelado') \
           AND COALESCE(TRIM(pp.lote_erp), '') = '' AND pp.data_planejada >= CURRENT_DATE - 14 \
           AND EXISTS (SELECT 1 FROM formulations f WHERE TRIM(f.product_code) = TRIM(pp.codigo_produto) \
                         AND TRIM(REPLACE(f.ingredient_code, '\"', '')) = $1)",
    )
    .bind(&codigo)
    .fetch_one(pool)
    .await
    .map_err(interno)?;
    Ok(Previa {
        previa: true,
        acao: if a.marcado { "marcar_sem_controle" } else { "desmarcar_sem_controle" },
        codigo,
        descricao,
        marcado_agora,
        marcar: a.marcado,
        ordens_planejadas_que_usam: ordens,
        confirmar: "repita com confirmar=true para gravar",
    })
}

/// Marca ou desmarca (idempotente) e audita quem fez.
pub async fn alterar(pool: &PgPool, a: &Alteracao, usuario: &str) -> Result<(), (StatusCode, String)> {
    let (codigo, descricao) = validar(pool, &a.codigo).await?;
    let sql = if a.marcado {
        sqlx::query(
            "INSERT INTO producao_insumos_sem_controle (codigo, marcado_por) VALUES ($1, $2) \
             ON CONFLICT (codigo) DO UPDATE SET marcado_por = EXCLUDED.marcado_por, marcado_em = NOW()",
        )
        .bind(&codigo)
        .bind(usuario)
    } else {
        sqlx::query("DELETE FROM producao_insumos_sem_controle WHERE codigo = $1").bind(&codigo)
    };
    sql.execute(pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao gravar: {e}")))?;
    auditoria::registrar(
        pool,
        usuario,
        if a.marcado { "marcar_sem_controle" } else { "desmarcar_sem_controle" },
        &codigo,
        json!({ "descricao": descricao }),
    )
    .await;
    Ok(())
}

async fn listar_rota(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match listar(state.db.pool()).await {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn alterar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(a): Json<Alteracao>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if !a.confirmar {
        return match previa(pool, &a).await {
            Ok(p) => (StatusCode::OK, Json(p)).into_response(),
            Err((s, m)) => erro(s, m),
        };
    }
    match alterar(pool, &a, &ctx.display_name).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err((s, m)) => erro(s, m),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn marcar_desmarcar_e_previa_no_banco() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let limpar = || async {
            sqlx::query("DELETE FROM producao_insumos_sem_controle WHERE codigo = 'SC-AGUA'").execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM items WHERE code = 'SC-AGUA'").execute(&pool).await.unwrap();
        };
        limpar().await;
        sqlx::query("INSERT INTO items (code, description, unit) VALUES ('SC-AGUA', 'AGUA TESTE', 'L')").execute(&pool).await.unwrap();

        let marcar = Alteracao { codigo: "SC-AGUA".into(), marcado: true, confirmar: true };
        let p = previa(&pool, &marcar).await.unwrap();
        assert!(p.previa && !p.marcado_agora && p.marcar);
        assert!(!carregar_codigos(&pool).await.unwrap().contains("SC-AGUA"), "a prévia não grava");

        alterar(&pool, &marcar, "teste").await.unwrap();
        alterar(&pool, &marcar, "teste").await.unwrap(); // idempotente
        assert!(carregar_codigos(&pool).await.unwrap().contains("SC-AGUA"));
        let l = listar(&pool).await.unwrap();
        let m = l.iter().find(|m| m.codigo == "SC-AGUA").unwrap();
        assert_eq!((m.descricao.as_str(), m.marcado_por.as_deref()), ("AGUA TESTE", Some("teste")));
        assert!(previa(&pool, &marcar).await.unwrap().marcado_agora);

        alterar(&pool, &Alteracao { codigo: "SC-AGUA".into(), marcado: false, confirmar: true }, "teste").await.unwrap();
        assert!(!carregar_codigos(&pool).await.unwrap().contains("SC-AGUA"));
        assert!(alterar(&pool, &Alteracao { codigo: "NAO-EXISTE".into(), marcado: true, confirmar: true }, "t").await.is_err());
        limpar().await;
    }
}
