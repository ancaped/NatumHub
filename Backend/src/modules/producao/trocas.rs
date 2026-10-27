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
use crate::modules::producao::auditoria;
use crate::modules::producao::cobertura::calc::Troca;
use crate::modules::producao::cobertura::store::canon;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/trocas", get(listar_rota).post(criar_rota))
        .route("/api/producao/trocas/:id", delete(remover_rota))
        .route("/api/producao/trocas/:id/produtos", get(produtos_da_troca_rota))
}

/// Ações de consulta das trocas de insumo descritas para agentes (ver `core::catalogo`).
pub fn acoes() -> Vec<crate::core::catalogo::Acao> {
    vec![
        crate::core::catalogo::Acao::leitura(
            "listar_trocas_insumo",
            "producao",
            "Lista as trocas de insumo cadastradas (um insumo cobrindo outro) usadas na cobertura de insumos.",
            "/api/producao/trocas",
            vec![],
        ),
        crate::core::catalogo::Acao::leitura(
            "listar_produtos_da_troca",
            "producao",
            "Lista os produtos onde uma troca de insumo vale (os que ainda têm o insumo original na fórmula; só o produto da troca quando o escopo é um produto).",
            "/api/producao/trocas/:id/produtos",
            vec![crate::core::catalogo::param("id", "caminho", "número", true, "Id da troca (de listar_trocas_insumo).")],
        ),
    ]
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
    /// Sem `true` a rota só devolve a prévia (nada é gravado).
    #[serde(default)]
    pub confirmar: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviaTroca {
    pub previa: bool,
    pub acao: &'static str,
    pub insumo_de: String,
    pub insumo_para: String,
    pub produto: Option<String>,
    /// Já existe troca deste insumo neste escopo (a nova substitui o destino).
    pub ja_existe: bool,
    /// Composições (produtos e bases) que hoje usam o insumo.
    pub composicoes_afetadas: i64,
    /// Ordens do planejamento (sem lote no ERP, dos últimos 14 dias em diante) cujo produto usa o insumo.
    pub ordens_planejadas_afetadas: i64,
    pub confirmar: &'static str,
}

/// Prévia da troca: o que ela alcançaria, sem gravar nada.
pub async fn previa(pool: &PgPool, t: &NovaTroca) -> Result<PreviaTroca, (StatusCode, String)> {
    let (de, para, produto) = validar(pool, t).await?;
    let interno = |e: sqlx::Error| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao calcular a prévia: {e}"));
    let ja_existe: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM producao_trocas_insumo WHERE insumo_de = $1 AND COALESCE(produto_codigo, '') = COALESCE($2, ''))",
    )
    .bind(&de)
    .bind(&produto)
    .fetch_one(pool)
    .await
    .map_err(interno)?;
    let composicoes: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT f.product_code)::bigint FROM formulations f \
         WHERE TRIM(REPLACE(f.ingredient_code, '\"', '')) = $1 AND ($2::text IS NULL OR TRIM(f.product_code) = $2)",
    )
    .bind(&de)
    .bind(&produto)
    .fetch_one(pool)
    .await
    .map_err(interno)?;
    let ordens: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM producao_planejamento_semanal pp \
         WHERE (pp.ordem_status IS NULL OR pp.ordem_status <> 'cancelado') \
           AND COALESCE(TRIM(pp.lote_erp), '') = '' AND pp.data_planejada >= CURRENT_DATE - 14 \
           AND ($2::text IS NULL OR TRIM(pp.codigo_produto) = $2) \
           AND EXISTS (SELECT 1 FROM formulations f WHERE TRIM(f.product_code) = TRIM(pp.codigo_produto) \
                         AND TRIM(REPLACE(f.ingredient_code, '\"', '')) = $1)",
    )
    .bind(&de)
    .bind(&produto)
    .fetch_one(pool)
    .await
    .map_err(interno)?;
    Ok(PreviaTroca {
        previa: true,
        acao: "criar_troca",
        insumo_de: de,
        insumo_para: para,
        produto,
        ja_existe,
        composicoes_afetadas: composicoes,
        ordens_planejadas_afetadas: ordens,
        confirmar: "repita com confirmar=true para gravar",
    })
}

/// Valida a troca e devolve (de, para, produto) canônicos.
async fn validar(pool: &PgPool, t: &NovaTroca) -> Result<(String, String, Option<String>), (StatusCode, String)> {
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
    Ok((de, para, produto))
}

/// Cria a troca (ou troca o destino de uma já existente no mesmo escopo).
pub async fn criar(pool: &PgPool, t: &NovaTroca, usuario: &str) -> Result<(), (StatusCode, String)> {
    let (de, para, produto) = validar(pool, t).await?;
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
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao gravar a troca: {e}")))?;
    auditoria::registrar(
        pool,
        usuario,
        "criar_troca",
        &format!("{de}->{para}"),
        json!({ "de": de, "para": para, "produto": produto }),
    )
    .await;
    Ok(())
}

/// Quantas trocas o insumo tem como origem (todos os escopos).
pub async fn contar_do_insumo(pool: &PgPool, insumo_de: &str) -> Result<i64, String> {
    sqlx::query_scalar("SELECT COUNT(*)::bigint FROM producao_trocas_insumo WHERE insumo_de = $1")
        .bind(insumo_de)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Erro ao contar as trocas: {e}"))
}

/// Remove todas as trocas que saem deste insumo (usado ao voltar para OK ou ao classificar de outro jeito).
pub async fn remover_do_insumo(pool: &PgPool, insumo_de: &str) -> Result<u64, String> {
    sqlx::query("DELETE FROM producao_trocas_insumo WHERE insumo_de = $1")
        .bind(insumo_de)
        .execute(pool)
        .await
        .map(|r| r.rows_affected())
        .map_err(|e| format!("Erro ao remover as trocas: {e}"))
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
    if !t.confirmar {
        return match previa(state.db.pool(), &t).await {
            Ok(p) => (StatusCode::OK, Json(p)).into_response(),
            Err((status, msg)) => erro(status, msg),
        };
    }
    match criar(state.db.pool(), &t, &ctx.display_name).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err((status, msg)) => erro(status, msg),
    }
}

#[derive(Debug, Serialize)]
pub struct ProdutoDaTroca {
    pub codigo: String,
    pub descricao: String,
}

/// Produtos cuja fórmula ainda usa o insumo original da troca (só o produto da troca, se o escopo for um produto).
/// `None` = troca inexistente.
pub async fn produtos_da_troca(pool: &PgPool, id: i64) -> Result<Option<Vec<ProdutoDaTroca>>, String> {
    let Some(t) = sqlx::query("SELECT insumo_de, produto_codigo FROM producao_trocas_insumo WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Erro ao ler a troca: {e}"))?
    else {
        return Ok(None);
    };
    let de: String = t.get("insumo_de");
    let produto: Option<String> = t.get("produto_codigo");
    let rows = sqlx::query(
        r#"
        SELECT u.codigo,
               COALESCE((SELECT p.descricao FROM produtos p WHERE TRIM(p.codigo) = u.codigo LIMIT 1), '') AS descricao
        FROM (
            SELECT DISTINCT TRIM(f.product_code) AS codigo
            FROM formulations f
            WHERE TRIM(REPLACE(f.ingredient_code, '"', '')) = $1
              AND ($2::text IS NULL OR TRIM(f.product_code) = $2)
        ) u
        ORDER BY 2, 1
        "#,
    )
    .bind(&de)
    .bind(&produto)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao listar os produtos da troca: {e}"))?;
    Ok(Some(
        rows.into_iter()
            .map(|r| ProdutoDaTroca { codigo: r.get("codigo"), descricao: r.get("descricao") })
            .collect(),
    ))
}

async fn produtos_da_troca_rota(State(state): State<Arc<AppState>>, Path(id): Path<i64>) -> impl IntoResponse {
    match produtos_da_troca(state.db.pool(), id).await {
        Ok(Some(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(None) => erro(StatusCode::NOT_FOUND, "Troca não encontrada."),
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[derive(Debug, Deserialize)]
pub struct ConfirmarQuery {
    pub confirmar: Option<bool>,
}

async fn remover_rota(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    axum::extract::Query(q): axum::extract::Query<ConfirmarQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if q.confirmar != Some(true) {
        let alvo = listar(pool).await.map(|l| l.into_iter().find(|t| t.id == id));
        return match alvo {
            Ok(Some(t)) => (
                StatusCode::OK,
                Json(json!({
                    "previa": true, "acao": "remover_troca", "id": id, "insumoDe": t.insumo_de, "insumoPara": t.insumo_para,
                    "produto": t.produto, "composicoesAfetadas": t.composicoes_afetadas,
                    "confirmar": "repita com confirmar=true para remover"
                })),
            )
                .into_response(),
            Ok(None) => erro(StatusCode::NOT_FOUND, "Troca não encontrada."),
            Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
        };
    }
    match remover(pool, id).await {
        Ok(true) => {
            auditoria::registrar(pool, &ctx.display_name, "remover_troca", &id.to_string(), json!({})).await;
            (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
        }
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
        let nova = NovaTroca { insumo_de: "TT-245".into(), insumo_para: "TT-242".into(), produto: None, confirmar: true };
        // prévia não grava
        let p = previa(&pool, &nova).await.unwrap();
        assert!(p.previa && !p.ja_existe);
        assert!(listar(&pool).await.unwrap().iter().all(|t| t.insumo_de != "TT-245"), "a prévia não gravou nada");
        criar(&pool, &nova, "teste").await.unwrap();
        assert!(previa(&pool, &nova).await.unwrap().ja_existe);
        // repetir no mesmo escopo troca o destino, não duplica
        criar(&pool, &nova, "teste").await.unwrap();
        let l = listar(&pool).await.unwrap().into_iter().filter(|t| t.insumo_de == "TT-245").collect::<Vec<_>>();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].descricao_de, "DC 245");
        assert_eq!(l[0].descricao_para, "DC 242");
        assert!(l[0].formula_corrigida, "nenhuma fórmula usa TT-245");
        assert!(produtos_da_troca(&pool, l[0].id).await.unwrap().unwrap().is_empty(), "nenhum produto usa TT-245");
        assert!(produtos_da_troca(&pool, -1).await.unwrap().is_none(), "troca inexistente");

        // escopo de um produto convive com o geral
        let so_um = NovaTroca { produto: Some("P-1".into()), insumo_de: "TT-245".into(), insumo_para: "TT-242".into(), confirmar: true };
        criar(&pool, &so_um, "teste").await.unwrap();
        let l = listar(&pool).await.unwrap().into_iter().filter(|t| t.insumo_de == "TT-245").collect::<Vec<_>>();
        assert_eq!(l.len(), 2);
        let ativas = carregar(&pool).await.unwrap();
        assert!(ativas.iter().any(|t| t.de == "TT-245" && t.produto.is_none()));
        assert!(ativas.iter().any(|t| t.de == "TT-245" && t.produto.as_deref() == Some("P-1")));

        // insumo inexistente e troca por si mesmo são recusados
        let ruim = NovaTroca { insumo_de: "TT-245".into(), insumo_para: "NAO-EXISTE".into(), produto: None, confirmar: true };
        assert!(criar(&pool, &ruim, "teste").await.is_err());
        let igual = NovaTroca { insumo_de: "TT-245".into(), insumo_para: "TT-245".into(), produto: None, confirmar: true };
        assert!(criar(&pool, &igual, "teste").await.is_err());

        for t in l {
            assert!(remover(&pool, t.id).await.unwrap());
        }
        limpar().await;
    }
}
