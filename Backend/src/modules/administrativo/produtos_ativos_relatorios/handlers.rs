use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::MODULE_ADMIN_PRODUTOS_ATIVOS_RELATORIOS;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatorioQuery {
    pub linha: Option<String>,
    pub categoria: Option<String>,
    pub include_terceirizados: Option<bool>,
    pub search: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatorioItem {
    pub codigo: String,
    pub descricao: String,
    pub linha_prefix: String,
    pub linha_nome: String,
    pub categoria: Option<String>,
    pub status: String,
    pub codigo_barras: Option<String>,
}

fn deny() -> axum::response::Response {
    (
        StatusCode::FORBIDDEN,
        Json(json!({ "error": "Sem permissão para Relatórios · Produtos Ativos." })),
    )
        .into_response()
}

pub async fn relatorio_produtos_ativos(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<RelatorioQuery>,
) -> impl IntoResponse {
    if !ctx.role.is_supervisor() && !ctx.has_module(MODULE_ADMIN_PRODUTOS_ATIVOS_RELATORIOS) {
        return deny();
    }

    let include_terc = q.include_terceirizados.unwrap_or(false);
    let linha = q
        .linha
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "ALL");
    let categoria = q
        .categoria
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "ALL");
    let search = q
        .search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{}%", s.to_lowercase()));

    let pool = state.db.pool();

    // Status efetivo: COALESCE(NULLIF(override,''), 'ativo')
    // Linha efetiva: COALESCE(override manual, produtos.linha_prefix)
    // Só linhas com config_linhas.visivel = 1
    let rows = match sqlx::query(
        r#"
        SELECT
            p.codigo,
            p.descricao,
            COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix) AS linha_prefix,
            COALESCE(cl.nome_linha, '') AS linha_nome,
            NULLIF(TRIM(o.categoria_produto), '') AS categoria,
            COALESCE(NULLIF(TRIM(o.status_produto), ''), 'ativo') AS status,
            NULLIF(TRIM(p.codigo_barras), '') AS codigo_barras
        FROM produtos p
        LEFT JOIN overrides_produtos o ON o.codigo = p.codigo
        INNER JOIN config_linhas cl
            ON COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix) = cl.linha_prefix
        WHERE COALESCE(cl.visivel, 1) = 1
          AND (
            COALESCE(NULLIF(TRIM(o.status_produto), ''), 'ativo') = 'ativo'
            OR ($1::bool AND COALESCE(NULLIF(TRIM(o.status_produto), ''), 'ativo') = 'terceirizado')
          )
          AND ($2::text IS NULL OR COALESCE(NULLIF(o.linha_prefix_manual, ''), p.linha_prefix) = $2)
          AND (
            $3::text IS NULL
            OR (
              $3 = 'sem_categoria'
              AND (o.categoria_produto IS NULL OR TRIM(o.categoria_produto) = '')
            )
            OR (
              $3 <> 'sem_categoria'
              AND (
                o.categoria_produto = $3
                OR o.categoria_produto IN (SELECT id FROM categories WHERE parent_id = $3)
              )
            )
          )
          AND (
            $4::text IS NULL
            OR LOWER(p.codigo) LIKE $4
            OR LOWER(p.descricao) LIKE $4
          )
        ORDER BY linha_prefix, p.codigo
        "#,
    )
    .bind(include_terc)
    .bind(linha)
    .bind(categoria)
    .bind(search)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Erro ao montar relatório: {e}") })),
            )
                .into_response();
        }
    };

    let items: Vec<RelatorioItem> = rows
        .into_iter()
        .map(|row| RelatorioItem {
            codigo: row.get(0),
            descricao: row.get(1),
            linha_prefix: row.get(2),
            linha_nome: row.get(3),
            categoria: row.get(4),
            status: row.get(5),
            codigo_barras: row.get(6),
        })
        .collect();

    Json(json!({ "items": items })).into_response()
}
