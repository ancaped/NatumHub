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

use crate::core::regras_produto::{produto_ativo, status_ignorados_padrao, LINHA_EFETIVA_SQL};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::modules_registry::{
    MODULE_ADMIN_LINHA_PRODUTOS, MODULE_ADMIN_PRODUTOS_ATIVOS_RELATORIOS,
};

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
    if !ctx.role.is_supervisor()
        && !ctx.has_module(MODULE_ADMIN_PRODUTOS_ATIVOS_RELATORIOS)
        && !ctx.has_module(MODULE_ADMIN_LINHA_PRODUTOS)
    {
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

    // Status ignorados (setting) valem para o relatório; "incluir terceirizados" os tira da lista.
    let mut ignorados = crate::modules::compras::planejamento::commands::get_ignored_product_statuses_query(pool.clone())
        .await
        .unwrap_or_else(|_| status_ignorados_padrao());
    if include_terc {
        ignorados.retain(|s| s != "terceirizado");
    }

    // Status efetivo: COALESCE(NULLIF(override,''), 'ativo'); linha efetiva: LINHA_EFETIVA_SQL.
    // Só linhas com config_linhas.visivel = 1. A regra de "ativo" é `produto_ativo`.
    let sql = format!(
        r#"
        SELECT
            p.codigo,
            p.descricao,
            {linha} AS linha_prefix,
            COALESCE(cl.nome_linha, '') AS linha_nome,
            NULLIF(TRIM(o.categoria_produto), '') AS categoria,
            COALESCE(NULLIF(TRIM(o.status_produto), ''), 'ativo') AS status,
            NULLIF(TRIM(p.codigo_barras), '') AS codigo_barras,
            o.visivel
        FROM produtos p
        LEFT JOIN overrides_produtos o ON o.codigo = p.codigo
        INNER JOIN config_linhas cl
            ON {linha} = cl.linha_prefix
        WHERE COALESCE(cl.visivel, 1) = 1
          AND ($1::text IS NULL OR {linha} = $1)
          AND (
            $2::text IS NULL
            OR (
              $2 = 'sem_categoria'
              AND (o.categoria_produto IS NULL OR TRIM(o.categoria_produto) = '')
            )
            OR (
              $2 <> 'sem_categoria'
              AND (
                o.categoria_produto = $2
                OR o.categoria_produto IN (SELECT id FROM categories WHERE parent_id = $2)
              )
            )
          )
          AND (
            $3::text IS NULL
            OR LOWER(p.codigo) LIKE $3
            OR LOWER(p.descricao) LIKE $3
          )
        ORDER BY linha_prefix, p.codigo
        "#,
        linha = LINHA_EFETIVA_SQL
    );
    let rows = match sqlx::query(&sql)
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
        .filter(|row| {
            let status: String = row.get(5);
            produto_ativo(&status, row.get::<Option<i32>, _>(7), &ignorados)
        })
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
