//! Trocas de insumo decididas pelo Edson (ex.: DC 245 -> DC 242).
//!
//! NÃO alteram o ERP nem a fórmula: só mudam a previsão de consumo (Cobertura de Insumos e Compras/MRP).
//! Enquanto alguma composição ainda usa o insumo trocado, a lista mostra o aviso persistente para corrigir
//! a fórmula (trocar o insumo, ou excluir e adicionar o correto). A correção em si é manual.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::cobertura::calc::Troca;
use crate::modules::producao::cobertura::store::canon;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/trocas", get(listar_rota).post(criar_rota))
        .route("/api/producao/trocas/:id", delete(remover_rota))
}

fn erro(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

/// Trocas ativas, no formato que o cálculo usa.
pub async fn carregar(pool: &PgPool) -> Result<Vec<Troca>, String> {
    let rows = sqlx::query("SELECT insumo_de, insumo_para, produto_codigo FROM producao_trocas_insumo")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao ler as trocas de insumo: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|r| Troca {
            de: canon(&r.get::<String, _>("insumo_de")),
            para: canon(&r.get::<String, _>("insumo_para")),
            produto: r.get::<Option<String>, _>("produto_codigo").map(|p| canon(&p)).filter(|p| !p.is_empty()),
        })
        .collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrocaInfo {
    pub id: i64,
    pub insumo_de: String,
    pub descricao_de: String,
    pub insumo_para: String,
    pub descricao_para: String,
    pub produto: Option<String>,
    pub descricao_produto: Option<String>,
    /// Quantas composições (produtos e bases) ainda usam o insumo trocado.
    pub composicoes_afetadas: i64,
    /// Nenhuma composição usa mais o insumo de origem: o aviso persistente acabou.
    pub formula_corrigida: bool,
    pub criado_por: Option<String>,
    pub criado_em: String,
}

pub async fn listar(pool: &PgPool) -> Result<Vec<TrocaInfo>, String> {
    let rows = sqlx::query(
        r#"
        SELECT t.id, t.insumo_de, t.insumo_para, t.produto_codigo, t.criado_por,
               to_char(t.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS em,
               (SELECT COUNT(DISTINCT f.product_code) FROM formulations f
                 WHERE TRIM(REPLACE(f.ingredient_code, '"', '')) = t.insumo_de
                   AND (t.produto_codigo IS NULL OR TRIM(f.product_code) = t.produto_codigo))::bigint AS afetadas,
               (SELECT i.description FROM items i WHERE TRIM(REPLACE(i.code, '"', '')) = t.insumo_de LIMIT 1) AS desc_de,
               (SELECT i.description FROM items i WHERE TRIM(REPLACE(i.code, '"', '')) = t.insumo_para LIMIT 1) AS desc_para,
               (SELECT p.descricao FROM produtos p WHERE TRIM(p.codigo) = t.produto_codigo LIMIT 1) AS desc_produto
        FROM producao_trocas_insumo t
        ORDER BY t.criado_em DESC, t.id DESC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler as trocas de insumo: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let afetadas = r.get::<Option<i64>, _>("afetadas").unwrap_or(0);
            TrocaInfo {
                id: r.get::<i64, _>("id"),
                insumo_de: r.get::<String, _>("insumo_de"),
                descricao_de: r.get::<Option<String>, _>("desc_de").unwrap_or_default(),
                insumo_para: r.get::<String, _>("insumo_para"),
                descricao_para: r.get::<Option<String>, _>("desc_para").unwrap_or_default(),
                produto: r.get::<Option<String>, _>("produto_codigo"),
                descricao_produto: r.get::<Option<String>, _>("desc_produto"),
                composicoes_afetadas: afetadas,
                formula_corrigida: afetadas == 0,
                criado_por: r.get::<Option<String>, _>("criado_por"),
                criado_em: r.get::<Option<String>, _>("em").unwrap_or_default(),
            }
        })
        .collect())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovaTroca {
    pub insumo_de: String,
    pub insumo_para: String,
    /// Ausente = vale para todos os produtos.
    pub produto: Option<String>,
}

/// Cria a troca (ou troca o destino de uma já existente no mesmo escopo).
pub async fn criar(pool: &PgPool, t: &NovaTroca, usuario: &str) -> Result<(), (StatusCode, String)> {
    let de = canon(&t.insumo_de);
    let para = canon(&t.insumo_para);
    let produto = t.produto.as_deref().map(canon).filter(|p| !p.is_empty());
    if de.is_empty() || para.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Informe o insumo de origem e o substituto.".into()));
    }
    if de == para {
        return Err((StatusCode::BAD_REQUEST, "O substituto precisa ser diferente do insumo trocado.".into()));
    }
    let existentes: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT TRIM(REPLACE(code, '\"', ''))) FROM items WHERE TRIM(REPLACE(code, '\"', '')) = ANY($1)",
    )
    .bind(vec![de.clone(), para.clone()])
    .fetch_one(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao conferir os insumos: {e}")))?;
    if existentes < 2 {
        return Err((StatusCode::BAD_REQUEST, "Um dos insumos não existe no cadastro de itens.".into()));
    }
    sqlx::query(
        r#"
        INSERT INTO producao_trocas_insumo (insumo_de, insumo_para, produto_codigo, criado_por)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (insumo_de, COALESCE(produto_codigo, '')) DO UPDATE SET
            insumo_para = EXCLUDED.insumo_para,
            criado_por = EXCLUDED.criado_por,
            criado_em = NOW()
        "#,
    )
    .bind(&de)
    .bind(&para)
    .bind(&produto)
    .bind(usuario)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao gravar a troca: {e}")))
}

pub async fn remover(pool: &PgPool, id: i64) -> Result<bool, String> {
    sqlx::query("DELETE FROM producao_trocas_insumo WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map(|r| r.rows_affected() > 0)
        .map_err(|e| format!("Erro ao remover a troca: {e}"))
}

async fn listar_rota(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match listar(state.db.pool()).await {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn criar_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(t): Json<NovaTroca>,
) -> impl IntoResponse {
    match criar(state.db.pool(), &t, &ctx.display_name).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err((status, msg)) => erro(status, msg),
    }
}

async fn remover_rota(State(state): State<Arc<AppState>>, Path(id): Path<i64>) -> impl IntoResponse {
    match remover(state.db.pool(), id).await {
        Ok(true) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Ok(false) => erro(StatusCode::NOT_FOUND, "Troca não encontrada."),
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn criar_listar_e_remover_troca_no_banco() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let limpar = || async {
            sqlx::query("DELETE FROM producao_trocas_insumo WHERE insumo_de LIKE 'TT-%'").execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM items WHERE code LIKE 'TT-%'").execute(&pool).await.unwrap();
        };
        limpar().await;
        for (c, d) in [("TT-245", "DC 245"), ("TT-242", "DC 242")] {
            sqlx::query("INSERT INTO items (code, description, unit) VALUES ($1, $2, 'kg')")
                .bind(c)
                .bind(d)
                .execute(&pool)
                .await
                .unwrap();
        }
        let nova = NovaTroca { insumo_de: "TT-245".into(), insumo_para: "TT-242".into(), produto: None };
        criar(&pool, &nova, "teste").await.unwrap();
        // repetir no mesmo escopo troca o destino, não duplica
        criar(&pool, &nova, "teste").await.unwrap();
        let l = listar(&pool).await.unwrap().into_iter().filter(|t| t.insumo_de == "TT-245").collect::<Vec<_>>();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].descricao_de, "DC 245");
        assert_eq!(l[0].descricao_para, "DC 242");
        assert!(l[0].formula_corrigida, "nenhuma fórmula usa TT-245");

        // escopo de um produto convive com o geral
        let so_um = NovaTroca { produto: Some("P-1".into()), ..nova };
        criar(&pool, &so_um, "teste").await.unwrap();
        let l = listar(&pool).await.unwrap().into_iter().filter(|t| t.insumo_de == "TT-245").collect::<Vec<_>>();
        assert_eq!(l.len(), 2);
        let ativas = carregar(&pool).await.unwrap();
        assert!(ativas.iter().any(|t| t.de == "TT-245" && t.produto.is_none()));
        assert!(ativas.iter().any(|t| t.de == "TT-245" && t.produto.as_deref() == Some("P-1")));

        // insumo inexistente e troca por si mesmo são recusados
        let ruim = NovaTroca { insumo_de: "TT-245".into(), insumo_para: "NAO-EXISTE".into(), produto: None };
        assert!(criar(&pool, &ruim, "teste").await.is_err());
        let igual = NovaTroca { insumo_de: "TT-245".into(), insumo_para: "TT-245".into(), produto: None };
        assert!(criar(&pool, &igual, "teste").await.is_err());

        for t in l {
            assert!(remover(&pool, t.id).await.unwrap());
        }
        limpar().await;
    }
}
