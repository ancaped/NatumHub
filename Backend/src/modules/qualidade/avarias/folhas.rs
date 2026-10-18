use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::handlers::{ensure_tables, map_avaria, require_edit, require_module, AVARIA_FROM, SELECT_COLS};
use super::models::{AvariaOut, CreateFolhaRequest, FolhaItemOut, FolhaOut, FolhaPendingQuery, SetCaixasRequest};

const DESTINATIONS: &[(&str, &str)] = &[
    ("expedicao", "retorno_estoque"),
    ("embalagem", "embalagem"),
    ("reparo", "reparo"),
];

fn destination_status(destination: &str) -> Result<&'static str, String> {
    DESTINATIONS
        .iter()
        .find(|(id, _)| *id == destination.trim())
        .map(|(_, status)| *status)
        .ok_or_else(|| "Destino inválido. Use expedição, embalagem ou reparo.".into())
}

fn rfc(t: Option<chrono::DateTime<chrono::Utc>>) -> Option<String> {
    t.map(|v| v.to_rfc3339())
}

async fn load_folha(pool: &sqlx::PgPool, id: i64) -> Result<Option<FolhaOut>, String> {
    let head = sqlx::query(
        r#"
        SELECT id, sheet_number, destination, status, created_by, returned_by,
               returned_at, created_at, box_count
        FROM qualidade_avaria_folhas
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some(head) = head else {
        return Ok(None);
    };
    let returned_at: Option<chrono::DateTime<chrono::Utc>> = head.get(6);
    let created_at: chrono::DateTime<chrono::Utc> = head.get(7);
    let box_count: i32 = head.get(8);
    let items = sqlx::query(
        r#"
        SELECT a.id, a.register_number, a.item_code, a.description, a.lote, a.qty,
               a.location, a.status, a.notes
        FROM qualidade_avaria_folha_itens i
        JOIN qualidade_avarias a ON a.id = i.avaria_id
        WHERE i.folha_id = $1
        ORDER BY a.register_number
        "#,
    )
    .bind(id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let items: Vec<FolhaItemOut> = items
        .iter()
        .map(|r| FolhaItemOut {
            avaria_id: crate::core::pg_row::pg_i64(r, 0),
            register_number: r.get(1),
            item_code: r.get(2),
            description: r.get(3),
            lote: r.get(4),
            qty: r.get(5),
            location: r.get(6),
            status: r.get(7),
            notes: r.get(8),
        })
        .collect();
    let item_count = items.len() as i64;
    Ok(Some(FolhaOut {
        id: crate::core::pg_row::pg_i64(&head, 0),
        sheet_number: head.get(1),
        destination: head.get(2),
        status: head.get(3),
        created_by: head.get(4),
        returned_by: head.get(5),
        returned_at: rfc(returned_at),
        created_at: created_at.to_rfc3339(),
        item_count,
        box_count,
        items,
    }))
}

async fn next_sheet_number(pool: &sqlx::PgPool) -> Result<String, String> {
    let year = chrono::Local::now().format("%Y").to_string();
    let prefix = format!("FC-{year}-");
    let row = sqlx::query(
        r#"
        SELECT sheet_number FROM qualidade_avaria_folhas
        WHERE sheet_number LIKE $1
        ORDER BY sheet_number DESC
        LIMIT 1
        "#,
    )
    .bind(format!("{prefix}%"))
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let next = match row {
        Some(r) => {
            let last: String = r.get(0);
            last.rsplit('-')
                .next()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0)
                + 1
        }
        None => 1,
    };
    Ok(format!("{prefix}{next:04}"))
}

pub async fn list_folhas(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    if let Err(resp) = require_module(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let rows = match sqlx::query(
        r#"
        SELECT f.id, f.sheet_number, f.destination, f.status, f.created_by, f.returned_by,
               f.returned_at, f.created_at, COUNT(i.id)::bigint, f.box_count
        FROM qualidade_avaria_folhas f
        LEFT JOIN qualidade_avaria_folha_itens i ON i.folha_id = f.id
        GROUP BY f.id
        ORDER BY f.created_at DESC
        LIMIT 80
        "#,
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    let folhas: Vec<FolhaOut> = rows
        .iter()
        .map(|r| {
            let returned_at: Option<chrono::DateTime<chrono::Utc>> = r.get(6);
            let created_at: chrono::DateTime<chrono::Utc> = r.get(7);
            FolhaOut {
                id: crate::core::pg_row::pg_i64(r, 0),
                sheet_number: r.get(1),
                destination: r.get(2),
                status: r.get(3),
                created_by: r.get(4),
                returned_by: r.get(5),
                returned_at: rfc(returned_at),
                created_at: created_at.to_rfc3339(),
                item_count: r.get(8),
                box_count: r.get(9),
                items: Vec::new(),
            }
        })
        .collect();
    Json(folhas).into_response()
}

pub async fn pending_folhas(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(query): Query<FolhaPendingQuery>,
) -> impl IntoResponse {
    if let Err(resp) = require_module(&ctx) {
        return resp;
    }
    let destination = query.destination.unwrap_or_else(|| "expedicao".into());
    let status = match destination_status(&destination) {
        Ok(status) => status,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
        }
    };
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let sql = if destination == "embalagem" {
        format!(
            r#"
            SELECT {SELECT_COLS}
            {AVARIA_FROM}
            WHERE a.status IN ('embalagem', 'reparo') AND folha.sheet_number IS NULL
            ORDER BY a.created_at ASC
            LIMIT 200
            "#
        )
    } else {
        format!(
            r#"
            SELECT {SELECT_COLS}
            {AVARIA_FROM}
            WHERE a.status = $1 AND folha.sheet_number IS NULL
            ORDER BY a.created_at ASC
            LIMIT 200
            "#
        )
    };
    let query = sqlx::query(&sql);
    let query = if destination == "embalagem" {
        query
    } else {
        query.bind(status)
    };
    match query.fetch_all(pool).await {
        Ok(rows) => {
            let items: Vec<AvariaOut> = rows.iter().map(map_avaria).collect();
            Json(items).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_folha(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    if let Err(resp) = require_module(&ctx) {
        return resp;
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    match load_folha(pool, id).await {
        Ok(Some(folha)) => Json(folha).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Folha não encontrada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_folha(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreateFolhaRequest>,
) -> impl IntoResponse {
    if let Err(resp) = require_edit(&ctx) {
        return resp;
    }
    let destination = body.destination.trim().to_string();
    let item_status = match destination_status(&destination) {
        Ok(status) => status,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
        }
    };
    let mut ids: Vec<i64> = body.avaria_ids;
    ids.sort_unstable();
    ids.dedup();
    if ids.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Selecione ao menos um item." })),
        )
            .into_response();
    }
    if ids.len() > 40 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Uma folha aceita até 40 itens." })),
        )
            .into_response();
    }

    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let rows = match sqlx::query(
        r#"
        SELECT a.id, a.register_number, a.status,
               folha.sheet_number
        FROM qualidade_avarias a
        LEFT JOIN LATERAL (
            SELECT fl.sheet_number
            FROM qualidade_avaria_folha_itens it
            JOIN qualidade_avaria_folhas fl ON fl.id = it.folha_id
            WHERE it.avaria_id = a.id AND fl.status <> 'cancelada'
            LIMIT 1
        ) folha ON TRUE
        WHERE a.id = ANY($1)
        "#,
    )
    .bind(&ids)
    .fetch_all(&mut *tx)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if rows.len() != ids.len() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Algum item selecionado não existe mais." })),
        )
            .into_response();
    }
    for row in &rows {
        let number: String = row.get(1);
        let status: String = row.get(2);
        let sheet: Option<String> = row.get(3);
        let fits = if destination == "embalagem" {
            status == "embalagem" || status == "reparo"
        } else {
            status == item_status
        };
        if !fits {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("{number} não está no destino desta folha.") })),
            )
                .into_response();
        }
        if let Some(sheet) = sheet {
            return (
                StatusCode::CONFLICT,
                Json(json!({ "error": format!("{number} já está na folha {sheet}.") })),
            )
                .into_response();
        }
    }

    let box_count = body.box_count.unwrap_or(1).clamp(1, 99);
    let sheet_number = match next_sheet_number(pool).await {
        Ok(n) => n,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };
    let inserted = match sqlx::query(
        r#"
        INSERT INTO qualidade_avaria_folhas (sheet_number, destination, created_by, box_count)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
    )
    .bind(&sheet_number)
    .bind(&destination)
    .bind(&ctx.display_name)
    .bind(box_count)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(row) => row,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    let folha_id: i64 = crate::core::pg_row::pg_i64(&inserted, 0);
    for avaria_id in &ids {
        if let Err(e) = sqlx::query(
            "INSERT INTO qualidade_avaria_folha_itens (folha_id, avaria_id) VALUES ($1, $2)",
        )
        .bind(folha_id)
        .bind(avaria_id)
        .execute(&mut *tx)
        .await
        {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    }
    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    match load_folha(pool, folha_id).await {
        Ok(Some(folha)) => (StatusCode::CREATED, Json(folha)).into_response(),
        Ok(None) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Folha criada, mas não foi possível abri-la." })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn set_folha_status(
    state: &AppState,
    ctx: &AuthContext,
    id: i64,
    next: &str,
) -> axum::response::Response {
    if let Err(resp) = require_edit(ctx) {
        return resp;
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let result = if next == "devolvida" {
        sqlx::query(
            r#"
            UPDATE qualidade_avaria_folhas
            SET status = 'devolvida', returned_by = $2, returned_at = NOW()
            WHERE id = $1 AND status = 'aberta'
            "#,
        )
        .bind(id)
        .bind(&ctx.display_name)
        .execute(pool)
        .await
    } else {
        sqlx::query(
            r#"
            UPDATE qualidade_avaria_folhas
            SET status = 'cancelada'
            WHERE id = $1 AND status = 'aberta'
            "#,
        )
        .bind(id)
        .execute(pool)
        .await
    };
    match result {
        Ok(done) if done.rows_affected() == 1 => match load_folha(pool, id).await {
            Ok(Some(folha)) => Json(folha).into_response(),
            Ok(None) => (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Folha não encontrada" })),
            )
                .into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response(),
        },
        Ok(_) => (
            StatusCode::CONFLICT,
            Json(json!({ "error": "Só uma folha aberta pode ser devolvida ou cancelada." })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn set_caixas(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(body): Json<SetCaixasRequest>,
) -> impl IntoResponse {
    if let Err(resp) = require_edit(&ctx) {
        return resp;
    }
    if !(1..=99).contains(&body.box_count) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Informe entre 1 e 99 caixas." })),
        )
            .into_response();
    }
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let updated = sqlx::query(
        r#"
        UPDATE qualidade_avaria_folhas
        SET box_count = $2
        WHERE id = $1 AND status <> 'cancelada'
        "#,
    )
    .bind(id)
    .bind(body.box_count)
    .execute(pool)
    .await;
    match updated {
        Ok(done) if done.rows_affected() == 1 => match load_folha(pool, id).await {
            Ok(Some(folha)) => Json(folha).into_response(),
            Ok(None) => (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Folha não encontrada" })),
            )
                .into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response(),
        },
        Ok(_) => (
            StatusCode::CONFLICT,
            Json(json!({ "error": "Não foi possível atualizar as caixas desta folha." })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn devolver_folha(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    set_folha_status(&state, &ctx, id, "devolvida").await
}

pub async fn cancelar_folha(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    set_folha_status(&state, &ctx, id, "cancelada").await
}
