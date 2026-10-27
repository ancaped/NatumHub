use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Extension, Json,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgConnection, PgPool, Row};
use std::sync::Arc;

use crate::core::acao::{corpo_acao, Confirmar, ErroApi, RespostaAcao};
use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::servicos;
use super::models::{
    CreateManualOrderRequest, CreateRecordTypeRequest, CreateSheetBlockRequest, ItemSearchHit,
    ManualOrderItemOut, ManualOrderOut, PendingByItem, RecordTypeOut, SheetRegisterOut,
    UpdateManualOrderRequest,
};

/// O autor de toda gravação é o usuário logado, nunca um nome vindo do corpo.
fn autor(ctx: &AuthContext) -> String {
    let n = ctx.display_name.trim();
    if n.is_empty() { "Operador".to_string() } else { n.to_string() }
}

/// Resposta das escritas em 2 passos (campos do resultado também na raiz, para a tela antiga).
fn resposta(r: &RespostaAcao<serde_json::Value>, status: Option<StatusCode>) -> Response {
    (status.unwrap_or(StatusCode::OK), Json(corpo_acao(r))).into_response()
}

/// Linhas vazias na folha A4 de preenchimento manual.
pub const BLANK_LINES_PER_SHEET: i32 = 18;

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

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS manual_stock_sheet_registers (
            id BIGSERIAL PRIMARY KEY,
            register_number TEXT UNIQUE NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('entrada', 'saida')),
            status TEXT NOT NULL DEFAULT 'retirada' CHECK (status IN ('retirada', 'conferida')),
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            conferred_by TEXT,
            conferred_at TIMESTAMPTZ
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_manual_stock_sheet_registers_status ON manual_stock_sheet_registers (status)",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_manual_stock_sheet_registers_kind ON manual_stock_sheet_registers (kind)",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_manual_stock_sheet_registers_created ON manual_stock_sheet_registers (created_at DESC)",
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

pub(super) fn normalize_kind(raw: &str) -> Result<&'static str, String> {
    match raw.trim().to_lowercase().as_str() {
        "entrada" => Ok("entrada"),
        "saida" | "saída" => Ok("saida"),
        _ => Err("kind deve ser 'entrada' ou 'saida'".into()),
    }
}

pub(super) async fn next_order_number(conn: &mut PgConnection) -> Result<String, String> {
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
    .fetch_optional(&mut *conn)
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

async fn load_items(conn: &mut PgConnection, order_id: i64) -> Result<Vec<ManualOrderItemOut>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, item_code, description, unit, qty, notes
        FROM manual_stock_order_items
        WHERE order_id = $1
        ORDER BY id
        "#,
    )
    .bind(order_id)
    .fetch_all(&mut *conn)
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

    let mut conn = match pool.acquire().await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

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
        let items = match load_items(&mut conn, id).await {
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

    let mut conn = match pool.acquire().await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    match load_full(&mut conn, id).await {
        Ok(o) => (StatusCode::OK, Json(o)).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Ordem não encontrada" })),
        )
            .into_response(),
    }
}

pub async fn create_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(payload): Json<CreateManualOrderRequest>,
) -> Result<Response, ErroApi> {
    let r = servicos::criar_ordem(state.db.pool(), payload, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, c.confirmar.then_some(StatusCode::CREATED)))
}

pub(super) async fn load_full(conn: &mut PgConnection, id: i64) -> Result<ManualOrderOut, String> {
    let row = sqlx::query(&format!("{ORDER_SELECT} WHERE id = $1"))
        .bind(id)
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    let items = load_items(&mut *conn, id).await?;
    Ok(row_to_order(&row, items))
}

pub async fn update_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(c): Query<Confirmar>,
    Json(payload): Json<UpdateManualOrderRequest>,
) -> Result<Response, ErroApi> {
    let r = servicos::atualizar_ordem(state.db.pool(), id, payload, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn post_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    let r = servicos::postar_ordem(state.db.pool(), id, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn reopen_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    let r = servicos::reabrir_ordem(state.db.pool(), id, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn delete_order(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    let r = servicos::excluir_ordem(state.db.pool(), id, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
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
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(payload): Json<CreateRecordTypeRequest>,
) -> Result<Response, ErroApi> {
    let r = servicos::criar_tipo_registro(state.db.pool(), payload, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, c.confirmar.then_some(StatusCode::CREATED)))
}

pub async fn delete_record_type(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    let r = servicos::excluir_tipo_registro(state.db.pool(), id, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

// ─── Folhas de registro (Controle Entrada/Saída de Insumo) ───

pub(super) fn sheet_prefix(kind: &str) -> &'static str {
    if kind == "entrada" {
        "CEI"
    } else {
        "CSI"
    }
}

const SHEET_SELECT: &str = r#"
    SELECT id, register_number, kind, status, created_at, created_by, conferred_at, conferred_by
    FROM manual_stock_sheet_registers
"#;

fn row_to_sheet_register(r: &sqlx::postgres::PgRow) -> SheetRegisterOut {
    let created_at: chrono::DateTime<chrono::Utc> = r.get(4);
    let conferred_at: Option<chrono::DateTime<chrono::Utc>> = r.get(6);
    SheetRegisterOut {
        id: crate::core::pg_row::pg_i64(r, 0),
        register_number: r.get(1),
        kind: r.get(2),
        status: r.get(3),
        created_at: created_at.to_rfc3339(),
        created_by: r.get(5),
        conferred_at: conferred_at.map(|t| t.to_rfc3339()),
        conferred_by: r.get(7),
    }
}

pub async fn create_sheet_block(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Query(c): Query<Confirmar>,
    Json(payload): Json<CreateSheetBlockRequest>,
) -> Result<Response, ErroApi> {
    let r = servicos::criar_bloco_folhas(state.db.pool(), payload, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, c.confirmar.then_some(StatusCode::CREATED)))
}

pub(super) async fn load_sheet(conn: &mut PgConnection, id: i64) -> Result<SheetRegisterOut, String> {
    let row = sqlx::query(&format!("{SHEET_SELECT} WHERE id = $1"))
        .bind(id)
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row_to_sheet_register(&row))
}

#[derive(Debug, Deserialize)]
pub struct ListSheetsQuery {
    pub status: Option<String>,
    pub kind: Option<String>,
    pub q: Option<String>,
}

pub async fn list_sheet_registers(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListSheetsQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let mut sql = String::from(SHEET_SELECT);
    sql.push_str(" WHERE 1=1");
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref st) = query.status {
        let st = st.trim().to_lowercase();
        if st == "retirada" || st == "conferida" {
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
    if let Some(ref q) = query.q {
        let q = q.trim();
        if !q.is_empty() {
            binds.push(format!("%{q}%"));
            let i = binds.len();
            sql.push_str(&format!(" AND register_number ILIKE ${i}"));
        }
    }
    sql.push_str(" ORDER BY created_at DESC, id DESC LIMIT 500");

    let mut qb = sqlx::query(&sql);
    for b in &binds {
        qb = qb.bind(b);
    }

    match qb.fetch_all(pool).await {
        Ok(rows) => {
            let out: Vec<SheetRegisterOut> = rows.iter().map(row_to_sheet_register).collect();
            (StatusCode::OK, Json(out)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_sheet_register(
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

    let mut conn = match pool.acquire().await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    match load_sheet(&mut conn, id).await {
        Ok(s) => (StatusCode::OK, Json(s)).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Registro não encontrado" })),
        )
            .into_response(),
    }
}

pub async fn conferir_sheet_register(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    let r = servicos::conferir_folha(state.db.pool(), id, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

pub async fn reabrir_sheet_register(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Query(c): Query<Confirmar>,
) -> Result<Response, ErroApi> {
    let r = servicos::reabrir_folha(state.db.pool(), id, &autor(&ctx), c.confirmar).await?;
    Ok(resposta(&r, None))
}

