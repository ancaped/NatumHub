//! Classificação de insumos: só o Edson classifica (nunca automático, nunca por heurística).
//!
//! Classes: **OK** (padrão, sem registro), **Sem controle** (o ERP não controla o estoque), **Não usado mais** e
//! **Trocado** (a troca vive em `producao_trocas_insumo`: exige o substituto e o escopo, todos os produtos ou um).
//! Sem controle e Não usado mais: a cobertura não acusa falta e Compras não recomenda compra (o insumo continua
//! visível, com etiqueta). Toda alteração é em 2 passos (prévia + `confirmar=true`) e auditada.

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
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::producao::auditoria;
use crate::modules::producao::cobertura::store::canon;
use crate::modules::producao::trocas::{self, NovaTroca};

pub const SEM_CONTROLE: &str = "sem_controle";
pub const NAO_USADO: &str = "nao_usado";
pub const TROCADO: &str = "trocado";
pub const OK: &str = "ok";

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/producao/insumos-classificacao", get(listar_rota).put(alterar_rota))
        .route("/api/producao/insumos-classificacao/buscar", get(buscar_rota))
}

fn erro(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

fn tipo_valido(t: &str) -> bool {
    matches!(t, OK | SEM_CONTROLE | NAO_USADO | TROCADO)
}

/// Insumos que não acusam falta nem entram na recomendação de compra (sem controle e não usado mais).
pub async fn carregar_codigos(pool: &PgPool) -> Result<HashSet<String>, String> {
    Ok(carregar_por_tipo(pool).await?.into_keys().collect())
}

/// Código canônico -> classe (`sem_controle` ou `nao_usado`).
pub async fn carregar_por_tipo(pool: &PgPool) -> Result<HashMap<String, String>, String> {
    let rows = sqlx::query("SELECT codigo, tipo FROM producao_insumos_sem_controle")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Erro ao ler a classificação dos insumos: {e}"))?;
    Ok(rows.into_iter().map(|r| (canon(&r.get::<String, _>("codigo")), r.get::<String, _>("tipo"))).collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemClassificado {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
    /// `sem_controle`, `nao_usado` ou `trocado`.
    pub tipo: String,
    pub marcado_por: Option<String>,
    pub marcado_em: String,
    // só para `trocado`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub troca_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub para: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub descricao_para: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub produto: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub descricao_produto: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composicoes_afetadas: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula_corrigida: Option<bool>,
}

/// Tudo o que o Edson classificou: sem controle, não usado mais e trocados (uma linha por troca).
pub async fn listar(pool: &PgPool) -> Result<Vec<ItemClassificado>, String> {
    let rows = sqlx::query(
        r#"
        SELECT m.codigo, COALESCE(i.description, '') AS descricao, i.unit, m.tipo, m.marcado_por,
               to_char(m.marcado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS em
        FROM producao_insumos_sem_controle m
        LEFT JOIN items i ON TRIM(REPLACE(i.code, '"', '')) = m.codigo
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao ler a classificação dos insumos: {e}"))?;
    let mut out: Vec<ItemClassificado> = rows
        .into_iter()
        .map(|r| ItemClassificado {
            codigo: r.get::<String, _>("codigo"),
            descricao: r.get::<String, _>("descricao"),
            unidade: r.get::<Option<String>, _>("unit"),
            tipo: r.get::<String, _>("tipo"),
            marcado_por: r.get::<Option<String>, _>("marcado_por"),
            marcado_em: r.get::<Option<String>, _>("em").unwrap_or_default(),
            troca_id: None,
            para: None,
            descricao_para: None,
            produto: None,
            descricao_produto: None,
            composicoes_afetadas: None,
            formula_corrigida: None,
        })
        .collect();
    for t in trocas::listar(pool).await? {
        let unidade: Option<String> = sqlx::query_scalar("SELECT unit FROM items WHERE TRIM(REPLACE(code, '\"', '')) = $1 LIMIT 1")
            .bind(&t.insumo_de)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();
        out.push(ItemClassificado {
            codigo: t.insumo_de,
            descricao: t.descricao_de,
            unidade,
            tipo: TROCADO.into(),
            marcado_por: t.criado_por,
            marcado_em: t.criado_em,
            troca_id: Some(t.id),
            para: Some(t.insumo_para),
            descricao_para: Some(t.descricao_para),
            produto: t.produto,
            descricao_produto: t.descricao_produto,
            composicoes_afetadas: Some(t.composicoes_afetadas),
            formula_corrigida: Some(t.formula_corrigida),
        });
    }
    out.sort_by(|a, b| a.descricao.cmp(&b.descricao).then(a.codigo.cmp(&b.codigo)));
    Ok(out)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alteracao {
    pub codigo: String,
    /// `ok`, `sem_controle`, `nao_usado` ou `trocado`.
    pub tipo: String,
    /// Obrigatório quando `tipo = trocado`: o insumo que substitui.
    pub para: Option<String>,
    /// Só para `trocado`: ausente = todos os produtos; preenchido = só este produto.
    pub produto: Option<String>,
    /// Sem `true` só devolve a prévia (nada é gravado).
    #[serde(default)]
    pub confirmar: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Previa {
    pub previa: bool,
    pub acao: &'static str,
    pub codigo: String,
    pub descricao: String,
    pub tipo_atual: String,
    pub tipo_novo: String,
    /// Ordens planejadas (sem lote no ERP, dos últimos 14 dias em diante) cujo produto usa o insumo na fórmula.
    pub ordens_planejadas_que_usam: i64,
    /// Trocas que saem deste insumo e que serão removidas (ao virar OK, sem controle ou não usado).
    pub trocas_removidas: i64,
    /// Só para `trocado`: composições que ainda usam o insumo e o que a troca alcança.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composicoes_afetadas: Option<i64>,
    pub confirmar: &'static str,
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
    desc.map(|d| (c.clone(), d)).ok_or((StatusCode::BAD_REQUEST, format!("O insumo {c} não existe no cadastro de itens.")))
}

fn conferir_tipo(a: &Alteracao) -> Result<(), (StatusCode, String)> {
    if !tipo_valido(&a.tipo) {
        return Err((StatusCode::BAD_REQUEST, format!("Classe inválida: {}. Use ok, sem_controle, nao_usado ou trocado.", a.tipo)));
    }
    if a.tipo == TROCADO && a.para.as_deref().map(canon).filter(|p| !p.is_empty()).is_none() {
        return Err((StatusCode::BAD_REQUEST, "Para marcar como Trocado, escolha qual insumo substitui.".into()));
    }
    Ok(())
}

async fn tipo_atual(pool: &PgPool, codigo: &str) -> Result<String, (StatusCode, String)> {
    let interno = |e: String| (StatusCode::INTERNAL_SERVER_ERROR, e);
    if let Some(t) = carregar_por_tipo(pool).await.map_err(interno)?.remove(codigo) {
        return Ok(t);
    }
    let n = trocas::contar_do_insumo(pool, codigo).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(if n > 0 { TROCADO.into() } else { OK.into() })
}

pub async fn previa(pool: &PgPool, a: &Alteracao) -> Result<Previa, (StatusCode, String)> {
    conferir_tipo(a)?;
    let (codigo, descricao) = validar(pool, &a.codigo).await?;
    let interno = |e: String| (StatusCode::INTERNAL_SERVER_ERROR, e);
    let atual = tipo_atual(pool, &codigo).await?;
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
    .map_err(|e| interno(format!("Erro ao calcular a prévia: {e}")))?;
    let com_troca = trocas::contar_do_insumo(pool, &codigo).await.map_err(interno)?;
    let (trocas_removidas, composicoes) = if a.tipo == TROCADO {
        let p = trocas::previa(
            pool,
            &NovaTroca { insumo_de: codigo.clone(), insumo_para: a.para.clone().unwrap_or_default(), produto: a.produto.clone(), confirmar: false },
        )
        .await?;
        (0, Some(p.composicoes_afetadas))
    } else {
        (com_troca, None)
    };
    Ok(Previa {
        previa: true,
        acao: "classificar_insumo",
        codigo,
        descricao,
        tipo_atual: atual,
        tipo_novo: a.tipo.clone(),
        ordens_planejadas_que_usam: ordens,
        trocas_removidas,
        composicoes_afetadas: composicoes,
        confirmar: "repita com confirmar=true para gravar",
    })
}

/// Grava a classificação (idempotente) e audita quem fez.
pub async fn alterar(pool: &PgPool, a: &Alteracao, usuario: &str) -> Result<(), (StatusCode, String)> {
    conferir_tipo(a)?;
    let (codigo, descricao) = validar(pool, &a.codigo).await?;
    let interno = |e: String| (StatusCode::INTERNAL_SERVER_ERROR, e);
    let sql_err = |e: sqlx::Error| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao gravar: {e}"));
    match a.tipo.as_str() {
        OK => {
            sqlx::query("DELETE FROM producao_insumos_sem_controle WHERE codigo = $1").bind(&codigo).execute(pool).await.map_err(sql_err)?;
            trocas::remover_do_insumo(pool, &codigo).await.map_err(interno)?;
        }
        SEM_CONTROLE | NAO_USADO => {
            // uma classe só por insumo: sair de "trocado" remove as trocas
            trocas::remover_do_insumo(pool, &codigo).await.map_err(interno)?;
            sqlx::query(
                "INSERT INTO producao_insumos_sem_controle (codigo, tipo, marcado_por) VALUES ($1, $2, $3) \
                 ON CONFLICT (codigo) DO UPDATE SET tipo = EXCLUDED.tipo, marcado_por = EXCLUDED.marcado_por, marcado_em = NOW()",
            )
            .bind(&codigo)
            .bind(&a.tipo)
            .bind(usuario)
            .execute(pool)
            .await
            .map_err(sql_err)?;
        }
        _ => {
            sqlx::query("DELETE FROM producao_insumos_sem_controle WHERE codigo = $1").bind(&codigo).execute(pool).await.map_err(sql_err)?;
            trocas::criar(
                pool,
                &NovaTroca { insumo_de: codigo.clone(), insumo_para: a.para.clone().unwrap_or_default(), produto: a.produto.clone(), confirmar: true },
                usuario,
            )
            .await?;
        }
    }
    auditoria::registrar(
        pool,
        usuario,
        "classificar_insumo",
        &codigo,
        json!({ "descricao": descricao, "tipo": a.tipo, "para": a.para, "produto": a.produto }),
    )
    .await;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct Candidato {
    pub codigo: String,
    pub descricao: String,
    pub unidade: Option<String>,
}

/// Busca insumos (matéria-prima e embalagem) pelo nome ou código, para escolher o substituto.
pub async fn buscar(pool: &PgPool, q: &str) -> Result<Vec<Candidato>, String> {
    let termo = format!("%{}%", q.trim().to_lowercase());
    let rows = sqlx::query(
        "SELECT TRIM(REPLACE(code, '\"', '')) AS code, COALESCE(description, '') AS description, unit FROM items \
         WHERE code LIKE '9.%' AND (LOWER(description) LIKE $1 OR LOWER(code) LIKE $1) ORDER BY description LIMIT 20",
    )
    .bind(&termo)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro na busca de insumos: {e}"))?;
    Ok(rows
        .into_iter()
        .map(|r| Candidato { codigo: r.get::<String, _>("code"), descricao: r.get::<String, _>("description"), unidade: r.get::<Option<String>, _>("unit") })
        .collect())
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

#[derive(Debug, Deserialize)]
pub struct BuscaQuery {
    pub q: Option<String>,
}

async fn buscar_rota(State(state): State<Arc<AppState>>, Query(q): Query<BuscaQuery>) -> impl IntoResponse {
    let termo = q.q.unwrap_or_default();
    if termo.trim().chars().count() < 2 {
        return (StatusCode::OK, Json(Vec::<Candidato>::new())).into_response();
    }
    match buscar(state.db.pool(), &termo).await {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => erro(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Roda contra um Postgres de teste: `NEXUS_TEST_DATABASE_URL=... cargo test -- --ignored`.
    #[tokio::test]
    #[ignore = "precisa de NEXUS_TEST_DATABASE_URL"]
    async fn classificar_insumo_no_banco() {
        let url = std::env::var("NEXUS_TEST_DATABASE_URL").expect("NEXUS_TEST_DATABASE_URL");
        let pool = PgPool::connect(&url).await.unwrap();
        let limpar = || async {
            sqlx::query("DELETE FROM producao_trocas_insumo WHERE insumo_de LIKE '9.99.SC-%'").execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM producao_insumos_sem_controle WHERE codigo LIKE '9.99.SC-%'").execute(&pool).await.unwrap();
            sqlx::query("DELETE FROM items WHERE code LIKE '9.99.SC-%'").execute(&pool).await.unwrap();
        };
        limpar().await;
        for (c, d) in [("9.99.SC-AGUA", "AGUA TESTE"), ("9.99.SC-DC245", "DC 245"), ("9.99.SC-DC242", "DC 242")] {
            sqlx::query("INSERT INTO items (code, description, unit) VALUES ($1, $2, 'L')").bind(c).bind(d).execute(&pool).await.unwrap();
        }
        let alt = |codigo: &str, tipo: &str, para: Option<&str>, produto: Option<&str>| Alteracao {
            codigo: codigo.into(),
            tipo: tipo.into(),
            para: para.map(String::from),
            produto: produto.map(String::from),
            confirmar: true,
        };

        // prévia não grava
        let p = previa(&pool, &alt("9.99.SC-AGUA", SEM_CONTROLE, None, None)).await.unwrap();
        assert!(p.previa && p.tipo_atual == OK && p.tipo_novo == SEM_CONTROLE);
        assert!(!carregar_codigos(&pool).await.unwrap().contains("9.99.SC-AGUA"));

        // sem controle e não usado mais (a mesma tabela; trocar de classe atualiza)
        alterar(&pool, &alt("9.99.SC-AGUA", SEM_CONTROLE, None, None), "teste").await.unwrap();
        assert_eq!(carregar_por_tipo(&pool).await.unwrap().get("9.99.SC-AGUA").map(String::as_str), Some(SEM_CONTROLE));
        alterar(&pool, &alt("9.99.SC-AGUA", NAO_USADO, None, None), "teste").await.unwrap();
        assert_eq!(carregar_por_tipo(&pool).await.unwrap().get("9.99.SC-AGUA").map(String::as_str), Some(NAO_USADO));

        // trocado exige o substituto
        assert!(alterar(&pool, &alt("9.99.SC-DC245", TROCADO, None, None), "teste").await.is_err(), "sem substituto não grava");
        assert!(previa(&pool, &alt("9.99.SC-DC245", TROCADO, Some(" "), None)).await.is_err());
        // trocado: todos os produtos e só um produto (as duas opções sempre valem)
        alterar(&pool, &alt("9.99.SC-DC245", TROCADO, Some("9.99.SC-DC242"), None), "teste").await.unwrap();
        alterar(&pool, &alt("9.99.SC-DC245", TROCADO, Some("9.99.SC-DC242"), Some("P-1")), "teste").await.unwrap();
        let l = listar(&pool).await.unwrap();
        let trocados: Vec<_> = l.iter().filter(|i| i.codigo == "9.99.SC-DC245" && i.tipo == TROCADO).collect();
        assert_eq!(trocados.len(), 2);
        assert!(trocados.iter().any(|t| t.produto.is_none()) && trocados.iter().any(|t| t.produto.as_deref() == Some("P-1")));
        assert_eq!(trocados[0].descricao_para.as_deref(), Some("DC 242"));
        assert_eq!(previa(&pool, &alt("9.99.SC-DC245", OK, None, None)).await.unwrap().trocas_removidas, 2);

        // sair de trocado para sem controle remove as trocas; voltar a OK limpa tudo
        alterar(&pool, &alt("9.99.SC-DC245", SEM_CONTROLE, None, None), "teste").await.unwrap();
        assert_eq!(trocas::contar_do_insumo(&pool, "9.99.SC-DC245").await.unwrap(), 0);
        alterar(&pool, &alt("9.99.SC-DC245", OK, None, None), "teste").await.unwrap();
        alterar(&pool, &alt("9.99.SC-AGUA", OK, None, None), "teste").await.unwrap();
        assert!(carregar_codigos(&pool).await.unwrap().iter().all(|c| !c.starts_with("9.99.SC-")));
        assert!(alterar(&pool, &alt("NAO-EXISTE", SEM_CONTROLE, None, None), "t").await.is_err());
        assert!(alterar(&pool, &alt("9.99.SC-AGUA", "qualquer", None, None), "t").await.is_err());

        // busca do substituto
        let b = buscar(&pool, "dc 24").await.unwrap();
        assert!(b.iter().any(|c| c.codigo == "9.99.SC-DC245"), "a busca acha pelo nome");
        assert!(buscar(&pool, "9.99.sc-dc242").await.unwrap().iter().any(|c| c.codigo == "9.99.SC-DC242"), "e pelo código");
        limpar().await;
    }
}
