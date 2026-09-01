use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{PgPool, Row};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;
use super::generator::generate_proc_for_product;
use super::models::{
    CreateProcPayload, ProcGenerateRequest, ProcItem, ProcSummaryMetrics, UpdateProcPayload,
};

#[derive(Debug, Deserialize)]
pub struct ListProcsQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub categoria: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListProcsResponse {
    pub items: Vec<ProcItem>,
    pub total: i64,
    pub metrics: ProcSummaryMetrics,
}

pub async fn list_procs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListProcsQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let limit = query.limit.unwrap_or(100).min(500);
    let offset = query.offset.unwrap_or(0);
    let search_term = query.search.as_deref().unwrap_or("").trim();
    let status_filter = query.status.as_deref().unwrap_or("").trim();
    let cat_filter = query.categoria.as_deref().unwrap_or("").trim();

    let search_like = if search_term.is_empty() {
        "%".to_string()
    } else {
        format!("%{}%", search_term)
    };

    let (items, total_filtered) = match (status_filter.is_empty(), cat_filter.is_empty()) {
        (true, true) => {
            let total_res = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT count(*) FROM procs_produtos
                WHERE (descricao ILIKE $1 OR COALESCE(codigo_produto, '') ILIKE $1 OR COALESCE(proc, '') ILIKE $1)
                "#,
            )
            .bind(&search_like)
            .fetch_one(pool)
            .await;
            let total = total_res.unwrap_or(0);

            let rows = sqlx::query(
                r#"
                SELECT id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes,
                       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                       to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
                FROM procs_produtos
                WHERE (descricao ILIKE $1 OR COALESCE(codigo_produto, '') ILIKE $1 OR COALESCE(proc, '') ILIKE $1)
                ORDER BY
                    CASE WHEN status = 'EM_BRANCO' THEN 0 ELSE 1 END,
                    descricao ASC
                LIMIT $2 OFFSET $3
                "#,
            )
            .bind(&search_like)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            let items = rows.into_iter().map(|r| ProcItem {
                id: r.get("id"),
                codigo_produto: r.get("codigo_produto"),
                descricao: r.get("descricao"),
                proc: r.get("proc"),
                status: r.get("status"),
                observacoes: r.get("observacoes"),
                categoria_familia: r.get("categoria_familia"),
                processo_instrucoes: r.get("processo_instrucoes"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            }).collect();

            (items, total)
        }
        (false, true) => {
            let total_res = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT count(*) FROM procs_produtos
                WHERE (descricao ILIKE $1 OR COALESCE(codigo_produto, '') ILIKE $1 OR COALESCE(proc, '') ILIKE $1)
                  AND status = $2
                "#,
            )
            .bind(&search_like)
            .bind(status_filter)
            .fetch_one(pool)
            .await;
            let total = total_res.unwrap_or(0);

            let rows = sqlx::query(
                r#"
                SELECT id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes,
                       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                       to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
                FROM procs_produtos
                WHERE (descricao ILIKE $1 OR COALESCE(codigo_produto, '') ILIKE $1 OR COALESCE(proc, '') ILIKE $1)
                  AND status = $2
                ORDER BY descricao ASC
                LIMIT $3 OFFSET $4
                "#,
            )
            .bind(&search_like)
            .bind(status_filter)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            let items = rows.into_iter().map(|r| ProcItem {
                id: r.get("id"),
                codigo_produto: r.get("codigo_produto"),
                descricao: r.get("descricao"),
                proc: r.get("proc"),
                status: r.get("status"),
                observacoes: r.get("observacoes"),
                categoria_familia: r.get("categoria_familia"),
                processo_instrucoes: r.get("processo_instrucoes"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            }).collect();

            (items, total)
        }
        (true, false) => {
            let total_res = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT count(*) FROM procs_produtos
                WHERE (descricao ILIKE $1 OR COALESCE(codigo_produto, '') ILIKE $1 OR COALESCE(proc, '') ILIKE $1)
                  AND categoria_familia = $2
                "#,
            )
            .bind(&search_like)
            .bind(cat_filter)
            .fetch_one(pool)
            .await;
            let total = total_res.unwrap_or(0);

            let rows = sqlx::query(
                r#"
                SELECT id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes,
                       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                       to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
                FROM procs_produtos
                WHERE (descricao ILIKE $1 OR COALESCE(codigo_produto, '') ILIKE $1 OR COALESCE(proc, '') ILIKE $1)
                  AND categoria_familia = $2
                ORDER BY
                    CASE WHEN status = 'EM_BRANCO' THEN 0 ELSE 1 END,
                    descricao ASC
                LIMIT $3 OFFSET $4
                "#,
            )
            .bind(&search_like)
            .bind(cat_filter)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            let items = rows.into_iter().map(|r| ProcItem {
                id: r.get("id"),
                codigo_produto: r.get("codigo_produto"),
                descricao: r.get("descricao"),
                proc: r.get("proc"),
                status: r.get("status"),
                observacoes: r.get("observacoes"),
                categoria_familia: r.get("categoria_familia"),
                processo_instrucoes: r.get("processo_instrucoes"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            }).collect();

            (items, total)
        }
        (false, false) => {
            let total_res = sqlx::query_scalar::<_, i64>(
                r#"
                SELECT count(*) FROM procs_produtos
                WHERE (descricao ILIKE $1 OR COALESCE(codigo_produto, '') ILIKE $1 OR COALESCE(proc, '') ILIKE $1)
                  AND status = $2 AND categoria_familia = $3
                "#,
            )
            .bind(&search_like)
            .bind(status_filter)
            .bind(cat_filter)
            .fetch_one(pool)
            .await;
            let total = total_res.unwrap_or(0);

            let rows = sqlx::query(
                r#"
                SELECT id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes,
                       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                       to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
                FROM procs_produtos
                WHERE (descricao ILIKE $1 OR COALESCE(codigo_produto, '') ILIKE $1 OR COALESCE(proc, '') ILIKE $1)
                  AND status = $2 AND categoria_familia = $3
                ORDER BY descricao ASC
                LIMIT $4 OFFSET $5
                "#,
            )
            .bind(&search_like)
            .bind(status_filter)
            .bind(cat_filter)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            let items = rows.into_iter().map(|r| ProcItem {
                id: r.get("id"),
                codigo_produto: r.get("codigo_produto"),
                descricao: r.get("descricao"),
                proc: r.get("proc"),
                status: r.get("status"),
                observacoes: r.get("observacoes"),
                categoria_familia: r.get("categoria_familia"),
                processo_instrucoes: r.get("processo_instrucoes"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            }).collect();

            (items, total)
        }
    };

    let metrics = get_metrics_internal(pool).await;

    Json(ListProcsResponse {
        items,
        total: total_filtered,
        metrics,
    })
    .into_response()
}

async fn get_metrics_internal(pool: &PgPool) -> ProcSummaryMetrics {
    let total = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM procs_produtos")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let ativos = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM procs_produtos WHERE status = 'ATIVO' AND proc IS NOT NULL AND proc != ''"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let em_branco = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM procs_produtos WHERE status = 'EM_BRANCO' OR proc IS NULL OR proc = ''"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let familias = sqlx::query_scalar::<_, i64>(
        "SELECT count(DISTINCT categoria_familia) FROM procs_produtos WHERE categoria_familia IS NOT NULL AND categoria_familia != ''"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    ProcSummaryMetrics {
        total,
        ativos,
        em_branco,
        familias,
    }
}

pub async fn get_proc_summary(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let metrics = get_metrics_internal(pool).await;
    Json(metrics).into_response()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcMapResponse {
    pub by_code: HashMap<String, ProcItem>,
    pub by_description: HashMap<String, ProcItem>,
    pub list: Vec<ProcItem>,
}

pub async fn get_proc_map(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let rows = sqlx::query(
        r#"
        SELECT id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
               to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        FROM procs_produtos
        ORDER BY descricao ASC
        "#,
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut by_code = HashMap::new();
    let mut by_description = HashMap::new();
    let mut list = Vec::new();

    for r in rows {
        let item = ProcItem {
            id: r.get("id"),
            codigo_produto: r.get("codigo_produto"),
            descricao: r.get("descricao"),
            proc: r.get("proc"),
            status: r.get("status"),
            observacoes: r.get("observacoes"),
            categoria_familia: r.get("categoria_familia"),
            processo_instrucoes: r.get("processo_instrucoes"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        };

        if let Some(code) = &item.codigo_produto {
            let norm_code = code.replace('.', "").trim().to_lowercase();
            if !norm_code.is_empty() {
                by_code.insert(norm_code, item.clone());
            }
        }

        let norm_desc = item.descricao.trim().to_lowercase();
        if !norm_desc.is_empty() {
            by_description.insert(norm_desc, item.clone());
        }

        list.push(item);
    }

    Json(ProcMapResponse {
        by_code,
        by_description,
        list,
    })
    .into_response()
}

pub async fn get_proc_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let row = sqlx::query(
        r#"
        SELECT id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
               to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        FROM procs_produtos
        WHERE id = $1
        "#
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    match row {
        Some(r) => Json(json!(ProcItem {
            id: r.get("id"),
            codigo_produto: r.get("codigo_produto"),
            descricao: r.get("descricao"),
            proc: r.get("proc"),
            status: r.get("status"),
            observacoes: r.get("observacoes"),
            categoria_familia: r.get("categoria_familia"),
            processo_instrucoes: r.get("processo_instrucoes"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        }))
        .into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "PROC não encontrado"})),
        )
            .into_response(),
    }
}

pub async fn create_proc(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateProcPayload>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let desc = payload.descricao.trim();
    if desc.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "A descrição do produto é obrigatória"})),
        )
            .into_response();
    }

    let id = format!("proc_{}", Uuid::new_v4().simple());
    let proc_val = payload.proc.as_deref().map(|p| p.trim()).filter(|p| !p.is_empty());
    let status_val = payload.status.unwrap_or_else(|| {
        if proc_val.is_some() {
            "ATIVO".to_string()
        } else {
            "EM_BRANCO".to_string()
        }
    });

    let (det_cat, _) = super::generator::detect_family(desc);
    let cat_val = payload.categoria_familia.unwrap_or_else(|| det_cat.to_string());

    let res = sqlx::query(
        r#"
        INSERT INTO procs_produtos (id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes,
                  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                  to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        "#
    )
    .bind(&id)
    .bind(payload.codigo_produto.as_deref().map(|c| c.trim()))
    .bind(desc)
    .bind(proc_val)
    .bind(&status_val)
    .bind(payload.observacoes.as_deref())
    .bind(&cat_val)
    .bind(payload.processo_instrucoes.as_deref())
    .fetch_one(pool)
    .await;

    match res {
        Ok(r) => (
            StatusCode::CREATED,
            Json(json!(ProcItem {
                id: r.get("id"),
                codigo_produto: r.get("codigo_produto"),
                descricao: r.get("descricao"),
                proc: r.get("proc"),
                status: r.get("status"),
                observacoes: r.get("observacoes"),
                categoria_familia: r.get("categoria_familia"),
                processo_instrucoes: r.get("processo_instrucoes"),
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Erro ao criar PROC: {}", e)})),
        )
            .into_response(),
    }
}

pub async fn update_proc(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateProcPayload>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let current = match sqlx::query(
        "SELECT id, descricao, status, proc, categoria_familia FROM procs_produtos WHERE id = $1"
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "PROC não localizado"})),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Erro ao consultar PROC: {}", e)})),
            )
                .into_response()
        }
    };

    let cur_desc: String = current.get("descricao");
    let cur_proc: Option<String> = current.get("proc");
    let cur_cat: Option<String> = current.get("categoria_familia");

    let desc = payload.descricao.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).unwrap_or(&cur_desc);
    let proc_val = match payload.proc {
        Some(p) => {
            let clean = p.trim().to_string();
            if clean.is_empty() {
                None
            } else {
                Some(clean)
            }
        }
        None => cur_proc,
    };

    let status_val = match payload.status {
        Some(s) => s,
        None => {
            if proc_val.is_some() {
                "ATIVO".to_string()
            } else {
                "EM_BRANCO".to_string()
            }
        }
    };

    let cat_val = payload.categoria_familia.or(cur_cat);

    let res = sqlx::query(
        r#"
        UPDATE procs_produtos
        SET codigo_produto = COALESCE($2, codigo_produto),
            descricao = $3,
            proc = $4,
            status = $5,
            observacoes = COALESCE($6, observacoes),
            categoria_familia = COALESCE($7, categoria_familia),
            processo_instrucoes = COALESCE($8, processo_instrucoes),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes,
                  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
                  to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        "#
    )
    .bind(&id)
    .bind(payload.codigo_produto.as_deref())
    .bind(desc)
    .bind(proc_val)
    .bind(&status_val)
    .bind(payload.observacoes.as_deref())
    .bind(cat_val.as_deref())
    .bind(payload.processo_instrucoes.as_deref())
    .fetch_one(pool)
    .await;

    match res {
        Ok(r) => Json(json!(ProcItem {
            id: r.get("id"),
            codigo_produto: r.get("codigo_produto"),
            descricao: r.get("descricao"),
            proc: r.get("proc"),
            status: r.get("status"),
            observacoes: r.get("observacoes"),
            categoria_familia: r.get("categoria_familia"),
            processo_instrucoes: r.get("processo_instrucoes"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Erro ao atualizar PROC: {}", e)})),
        )
            .into_response(),
    }
}

pub async fn delete_proc(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let res = sqlx::query("DELETE FROM procs_produtos WHERE id = $1")
        .bind(&id)
        .execute(pool)
        .await;

    match res {
        Ok(r) => {
            if r.rows_affected() > 0 {
                Json(json!({"success": true, "message": "PROC excluído com sucesso"}))
                    .into_response()
            } else {
                (
                    StatusCode::NOT_FOUND,
                    Json(json!({"error": "PROC não encontrado"})),
                )
                    .into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Erro ao excluir PROC: {}", e)})),
        )
            .into_response(),
    }
}

pub async fn generate_proc_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ProcGenerateRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if payload.descricao.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Informe a descrição ou nome do novo produto"})),
        )
            .into_response();
    }

    match generate_proc_for_product(pool, &payload).await {
        Ok(resp) => Json(resp).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e})),
        )
            .into_response(),
    }
}
