use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::models::{
    CreateManualOrderRequest, CreateRecordTypeRequest, ItemSearchHit, ManualOrderItemOut,
    ManualOrderOut, PendingByItem, RecordTypeOut, UpdateManualOrderRequest,
};

pub async fn ensure_tables(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS manual_stock_orders (
            id BIGSERIAL PRIMARY KEY,
            order_number TEXT UNIQUE NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('entrada', 'saida')),
            partner_name TEXT NOT NULL DEFAULT '',
            order_date DATE NOT NULL DEFAULT CURRENT_DATE,
            status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'POSTED')),
            notes TEXT,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            posted_by TEXT,
            posted_at TIMESTAMPTZ
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS manual_stock_order_items (
            id BIGSERIAL PRIMARY KEY,
            order_id BIGINT NOT NULL REFERENCES manual_stock_orders(id) ON DELETE CASCADE,
            item_code TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            unit TEXT NOT NULL DEFAULT 'UN',
            qty DOUBLE PRECISION NOT NULL CHECK (qty > 0),
            notes TEXT
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_manual_stock_orders_status_kind ON manual_stock_orders (status, kind)",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_manual_stock_order_items_code ON manual_stock_order_items (item_code)",
    )
    .execute(pool)
    .await;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS manual_stock_record_types (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT manual_stock_record_types_name_uq UNIQUE (name)
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query(
        "ALTER TABLE manual_stock_orders ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT ''",
    )
    .execute(pool)
    .await;

    Ok(())
}

/// Agregado OPEN por item: (entrada, saida). Usado em Compras Prev. Futura.
pub async fn pending_net_by_item(pool: &PgPool) -> std::collections::HashMap<String, (f64, f64)> {
    let mut map = std::collections::HashMap::new();
    let Ok(_) = ensure_tables(pool).await else {
        return map;
    };
    let Ok(rows) = sqlx::query(
        r#"
        SELECT i.item_code,
               COALESCE(SUM(CASE WHEN o.kind = 'entrada' THEN i.qty ELSE 0 END), 0)::float8 AS entrada,
               COALESCE(SUM(CASE WHEN o.kind = 'saida' THEN i.qty ELSE 0 END), 0)::float8 AS saida
        FROM manual_stock_order_items i
        JOIN manual_stock_orders o ON o.id = i.order_id
        WHERE o.status = 'OPEN'
        GROUP BY i.item_code
        "#,
    )
    .fetch_all(pool)
    .await
    else {
        return map;
    };
    for row in rows {
        let code: String = row.get(0);
        let entrada: f64 = row.get(1);
        let saida: f64 = row.get(2);
        map.insert(code, (entrada, saida));
    }
    map
}

fn normalize_kind(raw: &str) -> Result<&'static str, String> {
    match raw.trim().to_lowercase().as_str() {
        "entrada" => Ok("entrada"),
        "saida" | "saída" => Ok("saida"),
        _ => Err("kind deve ser 'entrada' ou 'saida'".into()),
    }
}

async fn next_order_number(pool: &PgPool) -> Result<String, String> {
    let year = chrono::Local::now().format("%Y").to_string();
    let prefix = format!("OM-{year}-");
    let row = sqlx::query(
        r#"
        SELECT order_number FROM manual_stock_orders
        WHERE order_number LIKE $1
        ORDER BY order_number DESC
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
            let seq: u32 = last
                .rsplit('-')
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0)
                + 1;
            seq
        }
        None => 1,
    };
    Ok(format!("{prefix}{next:04}"))
}

async fn load_items(pool: &PgPool, order_id: i64) -> Result<Vec<ManualOrderItemOut>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, item_code, description, unit, qty, notes
        FROM manual_stock_order_items
        WHERE order_id = $1
        ORDER BY id
        "#,
    )
    .bind(order_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| ManualOrderItemOut {
            id: crate::core::pg_row::pg_i64(&r, 0),
            item_code: r.get(1),
            description: r.get(2),
            unit: r.get(3),
            qty: r.get(4),
            notes: r.get(5),
        })
        .collect())
}

fn row_to_order(r: &sqlx::postgres::PgRow, items: Vec<ManualOrderItemOut>) -> ManualOrderOut {
    let order_date: chrono::NaiveDate = r.get(5);
    let created_at: chrono::DateTime<chrono::Utc> = r.get(9);
    let posted_at: Option<chrono::DateTime<chrono::Utc>> = r.get(11);
    ManualOrderOut {
        id: crate::core::pg_row::pg_i64(r, 0),
        order_number: r.get(1),
        kind: r.get(2),
        record_type: r.get(3),
        partner_name: r.get(4),
        order_date: order_date.format("%Y-%m-%d").to_string(),
        status: r.get(6),
        notes: r.get(7),
        created_by: r.get(8),
        created_at: created_at.to_rfc3339(),
        posted_by: r.get(10),
        posted_at: posted_at.map(|t| t.to_rfc3339()),
        items,
    }
}

const ORDER_SELECT: &str = r#"
    SELECT id, order_number, kind, COALESCE(record_type, '') AS record_type,
           partner_name, order_date, status, notes,
           created_by, created_at, posted_by, posted_at
    FROM manual_stock_orders
"#;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
    pub kind: Option<String>,
    pub q: Option<String>,
    pub record_type: Option<String>,
}

pub async fn list_orders(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let mut sql = String::from(ORDER_SELECT);
    sql.push_str(" WHERE 1=1");
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref st) = query.status {
        let st = st.trim().to_uppercase();
        if st == "OPEN" || st == "POSTED" {
            binds.push(st);
            sql.push_str(&format!(" AND status = ${}", binds.len()));
        }
    }
    if let Some(ref kind) = query.kind {
        if let Ok(k) = normalize_kind(kind) {
            binds.push(k.to_string());
            sql.push_str(&format!(" AND kind = ${}", binds.len()));
        }
    }
    if let Some(ref rt) = query.record_type {
        let rt = rt.trim();
        if !rt.is_empty() {
            binds.push(rt.to_string());
            sql.push_str(&format!(" AND record_type ILIKE ${}", binds.len()));
        }
    }
    if let Some(ref q) = query.q {
        let q = q.trim();
        if !q.is_empty() {
            binds.push(format!("%{q}%"));
            let i = binds.len();
            sql.push_str(&format!(
                " AND (order_number ILIKE ${i} OR partner_name ILIKE ${i} OR COALESCE(notes,'') ILIKE ${i} OR COALESCE(record_type,'') ILIKE ${i})"
            ));
        }
    }
    sql.push_str(" ORDER BY order_date DESC, id DESC LIMIT 500");

    let mut qb = sqlx::query(&sql);
    for b in &binds {
        qb = qb.bind(b);
    }

    let rows = match qb.fetch_all(pool).await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let id = crate::core::pg_row::pg_i64(&r, 0);
        let items = match load_items(pool, id).await {
            Ok(i) => i,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
                    .into_response();
            }
        };
        out.push(row_to_order(&r, items));
    }

    (StatusCode::OK, Json(out)).into_response()
}

pub async fn get_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let row = match sqlx::query(&format!("{ORDER_SELECT} WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Ordem não encontrada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    match load_items(pool, id).await {
        Ok(items) => (StatusCode::OK, Json(row_to_order(&row, items))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<CreateManualOrderRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let kind = match normalize_kind(&payload.kind) {
        Ok(k) => k,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
        }
    };
    if payload.items.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Informe ao menos um item" })),
        )
            .into_response();
    }
    for it in &payload.items {
        if it.item_code.trim().is_empty() || !(it.qty > 0.0) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Cada item precisa de código e qty > 0" })),
            )
                .into_response();
        }
    }

    if payload.partner_name.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Informe a pessoa/empresa" })),
        )
            .into_response();
    }
    let record_type = payload.record_type.trim().to_string();
    if record_type.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Informe o tipo de registro (ex.: Venda, Uso/Interno)" })),
        )
            .into_response();
    }

    let order_number = match next_order_number(pool).await {
        Ok(n) => n,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };

    let order_date = payload
        .order_date
        .as_deref()
        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| chrono::Local::now().date_naive());

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let row = match sqlx::query(
        r#"
        INSERT INTO manual_stock_orders
            (order_number, kind, record_type, partner_name, order_date, status, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7)
        RETURNING id
        "#,
    )
    .bind(&order_number)
    .bind(kind)
    .bind(&record_type)
    .bind(payload.partner_name.trim())
    .bind(order_date)
    .bind(&payload.notes)
    .bind(&ctx.display_name)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    let id = crate::core::pg_row::pg_i64(&row, 0);

    // Garante o tipo no cadastro (idempotente).
    let _ = sqlx::query(
        "INSERT INTO manual_stock_record_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
    )
    .bind(&record_type)
    .execute(&mut *tx)
    .await;

    for it in &payload.items {
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO manual_stock_order_items (order_id, item_code, description, unit, qty, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(id)
        .bind(it.item_code.trim())
        .bind(it.description.as_deref().unwrap_or("").trim())
        .bind(it.unit.as_deref().unwrap_or("UN"))
        .bind(it.qty)
        .bind(&it.notes)
        .execute(&mut *tx)
        .await
        {
            return (
                StatusCode::BAD_REQUEST,
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

    match load_full(pool, id).await {
        Ok(o) => (StatusCode::CREATED, Json(o)).into_response(),
        Err(e) => (
            StatusCode::CREATED,
            Json(json!({ "id": id, "orderNumber": order_number, "warning": e })),
        )
            .into_response(),
    }
}

async fn load_full(pool: &PgPool, id: i64) -> Result<ManualOrderOut, String> {
    let row = sqlx::query(&format!("{ORDER_SELECT} WHERE id = $1"))
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let items = load_items(pool, id).await?;
    Ok(row_to_order(&row, items))
}

pub async fn update_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateManualOrderRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let status: String = match sqlx::query_scalar("SELECT status FROM manual_stock_orders WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Ordem não encontrada" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if status != "OPEN" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Só é possível editar ordens abertas (OPEN)" })),
        )
            .into_response();
    }

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    if let Some(ref kind_raw) = payload.kind {
        match normalize_kind(kind_raw) {
            Ok(k) => {
                if let Err(e) = sqlx::query("UPDATE manual_stock_orders SET kind = $1 WHERE id = $2")
                    .bind(k)
                    .bind(id)
                    .execute(&mut *tx)
                    .await
                {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": e.to_string() })),
                    )
                        .into_response();
                }
            }
            Err(e) => {
                return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
            }
        }
    }
    if let Some(ref name) = payload.partner_name {
        let _ = sqlx::query("UPDATE manual_stock_orders SET partner_name = $1 WHERE id = $2")
            .bind(name.trim())
            .bind(id)
            .execute(&mut *tx)
            .await;
    }
    if let Some(ref rt) = payload.record_type {
        let rt = rt.trim();
        if !rt.is_empty() {
            let _ = sqlx::query("UPDATE manual_stock_orders SET record_type = $1 WHERE id = $2")
                .bind(rt)
                .bind(id)
                .execute(&mut *tx)
                .await;
            let _ = sqlx::query(
                "INSERT INTO manual_stock_record_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
            )
            .bind(rt)
            .execute(&mut *tx)
            .await;
        }
    }
    if let Some(ref d) = payload.order_date {
        if let Ok(nd) = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d") {
            let _ = sqlx::query("UPDATE manual_stock_orders SET order_date = $1 WHERE id = $2")
                .bind(nd)
                .bind(id)
                .execute(&mut *tx)
                .await;
        }
    }
    if payload.notes.is_some() {
        let _ = sqlx::query("UPDATE manual_stock_orders SET notes = $1 WHERE id = $2")
            .bind(&payload.notes)
            .bind(id)
            .execute(&mut *tx)
            .await;
    }

    if let Some(ref items) = payload.items {
        if items.is_empty() {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Informe ao menos um item" })),
            )
                .into_response();
        }
        if let Err(e) = sqlx::query("DELETE FROM manual_stock_order_items WHERE order_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await
        {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
        for it in items {
            if it.item_code.trim().is_empty() || !(it.qty > 0.0) {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "Cada item precisa de código e qty > 0" })),
                )
                    .into_response();
            }
            if let Err(e) = sqlx::query(
                r#"
                INSERT INTO manual_stock_order_items (order_id, item_code, description, unit, qty, notes)
                VALUES ($1, $2, $3, $4, $5, $6)
                "#,
            )
            .bind(id)
            .bind(it.item_code.trim())
            .bind(it.description.as_deref().unwrap_or("").trim())
            .bind(it.unit.as_deref().unwrap_or("UN"))
            .bind(it.qty)
            .bind(&it.notes)
            .execute(&mut *tx)
            .await
            {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        }
    }

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    match load_full(pool, id).await {
        Ok(o) => (StatusCode::OK, Json(o)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn post_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let res = sqlx::query(
        r#"
        UPDATE manual_stock_orders
        SET status = 'POSTED', posted_by = $2, posted_at = NOW()
        WHERE id = $1 AND status = 'OPEN'
        "#,
    )
    .bind(id)
    .bind(&ctx.display_name)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Ordem não encontrada ou já lançada" })),
        )
            .into_response(),
        Ok(_) => match load_full(pool, id).await {
            Ok(o) => (StatusCode::OK, Json(o)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn reopen_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let res = sqlx::query(
        r#"
        UPDATE manual_stock_orders
        SET status = 'OPEN', posted_by = NULL, posted_at = NULL
        WHERE id = $1 AND status = 'POSTED'
        "#,
    )
    .bind(id)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Ordem não encontrada ou não está POSTED" })),
        )
            .into_response(),
        Ok(_) => match load_full(pool, id).await {
            Ok(o) => (StatusCode::OK, Json(o)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let res = sqlx::query("DELETE FROM manual_stock_orders WHERE id = $1 AND status = 'OPEN'")
        .bind(id)
        .execute(pool)
        .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Só é possível excluir ordens abertas" })),
        )
            .into_response(),
        Ok(_) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

pub async fn search_items(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let q = query.q.unwrap_or_default();
    let q = q.trim();
    if q.len() < 1 {
        return (StatusCode::OK, Json(Vec::<ItemSearchHit>::new())).into_response();
    }
    let pattern = format!("%{q}%");
    let rows = sqlx::query(
        r#"
        SELECT i.code, i.description, COALESCE(i.unit, 'UN'), i.category_id
        FROM items i
        WHERE i.is_ignored = 0
          AND (i.code ILIKE $1 OR i.description ILIKE $1)
          AND (
            i.category_id IN ('cat_mp', 'cat_emb')
            OR i.category_id IN (SELECT id FROM categories WHERE parent_id IN ('cat_mp', 'cat_emb'))
            OR i.code LIKE '9.%'
            OR i.code LIKE '08.%'
          )
        ORDER BY i.code
        LIMIT 40
        "#,
    )
    .bind(&pattern)
    .fetch_all(pool)
    .await;

    match rows {
        Ok(rows) => {
            let hits: Vec<ItemSearchHit> = rows
                .into_iter()
                .map(|r| ItemSearchHit {
                    code: r.get(0),
                    description: r.get(1),
                    unit: r.get(2),
                    category_id: r.get(3),
                })
                .collect();
            (StatusCode::OK, Json(hits)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn pending_by_item(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let map = pending_net_by_item(pool).await;
    let mut out: Vec<PendingByItem> = map
        .into_iter()
        .map(|(item_code, (entrada, saida))| PendingByItem {
            item_code,
            entrada,
            saida,
            net: entrada - saida,
        })
        .collect();
    out.sort_by(|a, b| a.item_code.cmp(&b.item_code));
    (StatusCode::OK, Json(out)).into_response()
}

pub async fn list_record_types(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let rows = sqlx::query(
        "SELECT id, name, created_at FROM manual_stock_record_types ORDER BY name ASC",
    )
    .fetch_all(pool)
    .await;
    match rows {
        Ok(rows) => {
            let out: Vec<RecordTypeOut> = rows
                .into_iter()
                .map(|r| {
                    let created_at: chrono::DateTime<chrono::Utc> = r.get(2);
                    RecordTypeOut {
                        id: crate::core::pg_row::pg_i64(&r, 0),
                        name: r.get(1),
                        created_at: created_at.to_rfc3339(),
                    }
                })
                .collect();
            (StatusCode::OK, Json(out)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn create_record_type(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateRecordTypeRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Nome do tipo obrigatório" })),
        )
            .into_response();
    }
    let row = sqlx::query(
        r#"
        INSERT INTO manual_stock_record_types (name) VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name, created_at
        "#,
    )
    .bind(&name)
    .fetch_one(pool)
    .await;
    match row {
        Ok(r) => {
            let created_at: chrono::DateTime<chrono::Utc> = r.get(2);
            (
                StatusCode::CREATED,
                Json(RecordTypeOut {
                    id: crate::core::pg_row::pg_i64(&r, 0),
                    name: r.get(1),
                    created_at: created_at.to_rfc3339(),
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_record_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    match sqlx::query("DELETE FROM manual_stock_record_types WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
    {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Tipo não encontrado" })),
        )
            .into_response(),
        Ok(_) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
