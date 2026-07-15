use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

#[derive(Debug, Deserialize)]
pub struct ListDivergenciasQuery {
    /// `all` | `mp` | `emb`
    #[serde(default = "default_scope")]
    pub scope: String,
    /// hide resolved flags (default true)
    #[serde(default = "default_true")]
    pub hide_resolved: bool,
    pub search: Option<String>,
    /// filter by error type flag
    pub error_type: Option<String>,
    /// include live ERP comparison (slower)
    #[serde(default)]
    pub check_erp: bool,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_scope() -> String {
    "all".into()
}
fn default_true() -> bool {
    true
}
fn default_limit() -> i64 {
    200
}

#[derive(Debug, Deserialize)]
pub struct ResolveInsumoPayload {
    pub error_type: String,
    pub observations: String,
    pub resolved_by: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InsumoDivergenciaRow {
    pub code: String,
    pub description: String,
    pub unit: String,
    pub category_id: Option<String>,
    pub category_name: String,
    pub root_category: String,
    pub hub_stock: f64,
    pub reserved_qty: f64,
    pub in_orders: f64,
    pub erp_stock: Option<f64>,
    pub delta_hub_erp: Option<f64>,
    pub sum_entradas: f64,
    pub sum_saidas: f64,
    pub flags: Vec<String>,
    pub resolved_types: Vec<String>,
    pub unresolved_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementExtratoRow {
    pub id: String,
    pub date: String,
    pub movement_type: String,
    pub label: String,
    pub quantity: f64,
    pub document_number: Option<String>,
    pub details: Option<String>,
    pub source_kind: String,
}

async fn ensure_resolutions_table(pool: &sqlx::PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS insumo_stock_error_resolutions (
            id TEXT PRIMARY KEY,
            item_code TEXT NOT NULL,
            error_type TEXT NOT NULL,
            is_resolved INTEGER DEFAULT 1,
            resolved_by TEXT,
            resolved_at TEXT,
            observations TEXT,
            UNIQUE (item_code, error_type)
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn text_looks_extra(s: &str) -> bool {
    let l = s.to_lowercase();
    l.contains("acerto")
        || l.contains("ajuste")
        || l.contains("invent")
        || l.contains("manual")
}

pub fn classify_movement_label(movement_type: &str, details: &str) -> (String, String) {
    let mt = movement_type.to_lowercase();
    let d = details.to_lowercase();
    if mt.contains("acerto_entrada") || (mt == "entrada" && text_looks_extra(details) && !d.contains("op:")) {
        return ("acerto_entrada".into(), "Acerto (entrada)".into());
    }
    if mt.contains("acerto_saida")
        || (mt == "saida" && text_looks_extra(details))
        || (d.contains("justificativa") && text_looks_extra(details))
    {
        // OP baixas with acerto in justificativa
        if d.contains("op:") && text_looks_extra(details) {
            return ("acerto_saida".into(), "Acerto / ajuste (saída OP)".into());
        }
        if mt.contains("acerto") || text_looks_extra(details) {
            return ("acerto_saida".into(), "Acerto (saída)".into());
        }
    }
    if mt.contains("inventario") {
        if mt.contains("entrada") {
            return ("inventario_entrada".into(), "Inventário (entrada)".into());
        }
        return ("inventario_saida".into(), "Inventário (saída)".into());
    }
    if mt == "entrada" {
        return ("entrada".into(), "Entrada NF".into());
    }
    if mt == "saida" {
        if d.contains("op:") {
            return ("saida".into(), "Saída OP".into());
        }
        return ("saida".into(), "Saída".into());
    }
    (mt, "Outros".into())
}

fn resolve_root(cat_id: &str, parent_map: &HashMap<String, Option<String>>) -> String {
    let mut current = cat_id.to_string();
    let mut visited = HashSet::new();
    visited.insert(current.clone());
    loop {
        match parent_map.get(&current) {
            Some(Some(parent)) if !visited.contains(parent) => {
                visited.insert(parent.clone());
                current = parent.clone();
            }
            _ => break,
        }
    }
    current
}

fn root_allowed(root: &str, scope: &str) -> bool {
    match scope {
        "mp" => root == "cat_mp",
        "emb" => root == "cat_emb",
        _ => root == "cat_mp" || root == "cat_emb",
    }
}

/// GET /api/estoque/insumos/divergencias
pub async fn list_insumo_divergencias(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListDivergenciasQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_resolutions_table(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let parent_rows = sqlx::query("SELECT id, parent_id, name FROM categories")
        .fetch_all(pool)
        .await;
    let (parent_map, name_map) = match parent_rows {
        Ok(rows) => {
            let mut pm = HashMap::new();
            let mut nm = HashMap::new();
            for r in rows {
                let id: String = r.get(0);
                let parent: Option<String> = r.get(1);
                let name: String = r.get(2);
                pm.insert(id.clone(), parent);
                nm.insert(id, name);
            }
            (pm, nm)
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let items = sqlx::query(
        "SELECT i.code, i.description, i.unit, i.category_id,
                COALESCE(s.stock_qty, 0), COALESCE(s.reserved_qty, 0), COALESCE(s.in_orders, 0)
         FROM items i
         LEFT JOIN (
             SELECT DISTINCT ON (item_code)
                item_code, stock_qty, reserved_qty, in_orders
             FROM stock_snapshots
             ORDER BY item_code, snapshot_date DESC, id DESC
         ) s ON i.code = s.item_code
         WHERE COALESCE(i.is_ignored, 0) = 0
           AND (i.code LIKE '9.%' OR i.code LIKE '08.%')",
    )
    .fetch_all(pool)
    .await;

    let items = match items {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    // Aggregated movements per code
    let mov_rows = sqlx::query(
        "SELECT item_code, movement_type, COALESCE(SUM(quantity), 0),
                BOOL_OR(
                  LOWER(COALESCE(details,'')) LIKE '%acerto%'
                  OR LOWER(COALESCE(details,'')) LIKE '%ajuste%'
                  OR LOWER(COALESCE(details,'')) LIKE '%invent%'
                  OR movement_type LIKE 'acerto%'
                  OR movement_type LIKE 'inventario%'
                )
         FROM stock_movements
         WHERE item_type IN ('insumo', 'material')
         GROUP BY item_code, movement_type",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut sum_in: HashMap<String, f64> = HashMap::new();
    let mut sum_out: HashMap<String, f64> = HashMap::new();
    let mut mov_extra: HashSet<String> = HashSet::new();
    for r in mov_rows {
        let code: String = r.get(0);
        let mt: String = r.get(1);
        let qty: f64 = r.get(2);
        let extra: bool = r.get(3);
        if extra || mt.starts_with("acerto") || mt.starts_with("inventario") {
            mov_extra.insert(code.clone());
        }
        let is_in = mt.contains("entrada") || mt == "entrada";
        let is_out = mt.contains("saida") || mt == "saida";
        if is_in {
            *sum_in.entry(code).or_default() += qty;
        } else if is_out {
            *sum_out.entry(code).or_default() += qty;
        }
    }

    // Baixas anômalas
    let baixa_rows = sqlx::query(
        "SELECT creferencia,
                BOOL_OR(
                  (ABS(COALESCE(nqtde,0) - COALESCE(nqtderef,0)) > GREATEST(ABS(COALESCE(nqtderef,0)) * 0.10, 0.01))
                  OR LOWER(COALESCE(cjustificativa,'')) LIKE '%acerto%'
                  OR LOWER(COALESCE(cjustificativa,'')) LIKE '%ajuste%'
                  OR LOWER(COALESCE(cjustificativa,'')) LIKE '%invent%'
                )
         FROM lotes_baixas
         WHERE creferencia IS NOT NULL AND creferencia <> ''
         GROUP BY creferencia",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let mut baixa_anom: HashSet<String> = HashSet::new();
    for r in baixa_rows {
        let code: String = r.get(0);
        let flag: bool = r.get(1);
        if flag {
            baixa_anom.insert(code);
        }
    }

    // Resolutions
    let res_rows = sqlx::query(
        "SELECT item_code, error_type FROM insumo_stock_error_resolutions WHERE is_resolved = 1",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let mut resolved: HashMap<String, Vec<String>> = HashMap::new();
    for r in res_rows {
        let code: String = r.get(0);
        let et: String = r.get(1);
        resolved.entry(code).or_default().push(et);
    }

    let search = q
        .search
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_lowercase();

    let mut out: Vec<InsumoDivergenciaRow> = Vec::new();

    for r in items {
        let code: String = r.get(0);
        let description: String = r.get(1);
        let unit: String = r.get(2);
        let category_id: Option<String> = r.get(3);
        let hub_stock: f64 = r.get(4);
        let reserved_qty: f64 = r.get(5);
        let in_orders: f64 = r.get(6);

        let root = category_id
            .as_deref()
            .map(|c| resolve_root(c, &parent_map))
            .unwrap_or_else(|| {
                if code.starts_with("9.15.") {
                    "cat_mp".into()
                } else if code.starts_with("08.") || code.starts_with("9.") {
                    "cat_emb".into()
                } else {
                    "other".into()
                }
            });

        if !root_allowed(&root, &q.scope) {
            continue;
        }

        if !search.is_empty() {
            let blob = format!("{} {}", code, description).to_lowercase();
            if !blob.contains(&search) {
                continue;
            }
        }

        let cat_name = category_id
            .as_ref()
            .and_then(|id| name_map.get(id).cloned())
            .unwrap_or_else(|| {
                if root == "cat_mp" {
                    "Matéria-Prima".into()
                } else if root == "cat_emb" {
                    "Embalagem".into()
                } else {
                    "Outros".into()
                }
            });

        let entradas = *sum_in.get(&code).unwrap_or(&0.0);
        let saidas = *sum_out.get(&code).unwrap_or(&0.0);

        let mut flags: Vec<String> = Vec::new();
        if baixa_anom.contains(&code) {
            flags.push("BAIXA_ANOMALA".into());
        }
        if mov_extra.contains(&code) {
            flags.push("MOV_EXTRA".into());
        }
        // Soft kardex: many exits without entradas (signal only)
        if saidas > 0.0 && entradas <= 0.0 && saidas > hub_stock.max(1.0) {
            flags.push("KARDEX_GAP".into());
        } else if entradas > 0.0 || saidas > 0.0 {
            let reconstructed = entradas - saidas;
            // Without opening balance, only flag extreme mismatch vs snapshot
            if hub_stock > 0.0 && reconstructed < 0.0 && reconstructed.abs() > hub_stock * 0.25 {
                flags.push("KARDEX_GAP".into());
            }
        }

        // Live ERP optional (page can request; we do for all when check_erp — may be slow)
        let mut erp_stock = None;
        let mut delta = None;
        if q.check_erp {
            if let Ok(Some(live)) =
                crate::core::legacy_db::fetch_erp_stock_live(pool, &code).await
            {
                erp_stock = Some(live.stock_qty);
                let d = live.stock_qty - hub_stock;
                delta = Some(d);
                if d.abs() > 0.01 {
                    flags.push("HUB_ERP".into());
                }
            }
        }

        if flags.is_empty() {
            continue;
        }

        let res_types = resolved.get(&code).cloned().unwrap_or_default();
        let unresolved: Vec<String> = flags
            .iter()
            .filter(|f| !res_types.iter().any(|r| r == *f))
            .cloned()
            .collect();

        if q.hide_resolved && unresolved.is_empty() {
            continue;
        }

        if let Some(ref et) = q.error_type {
            if !flags.iter().any(|f| f == et) {
                continue;
            }
        }

        out.push(InsumoDivergenciaRow {
            code,
            description,
            unit,
            category_id,
            category_name: cat_name,
            root_category: root,
            hub_stock,
            reserved_qty,
            in_orders,
            erp_stock,
            delta_hub_erp: delta,
            sum_entradas: entradas,
            sum_saidas: saidas,
            flags,
            resolved_types: res_types,
            unresolved_count: unresolved.len(),
        });
    }

    out.sort_by(|a, b| {
        b.unresolved_count
            .cmp(&a.unresolved_count)
            .then_with(|| a.code.cmp(&b.code))
    });

    let total = out.len() as i64;
    let start = q.offset.max(0) as usize;
    let end = (start + q.limit.max(1) as usize).min(out.len());
    let page = if start < out.len() {
        out[start..end].to_vec()
    } else {
        vec![]
    };

    let critical = page.iter().filter(|r| r.unresolved_count >= 2).count();
    let hub_erp = page
        .iter()
        .filter(|r| r.flags.iter().any(|f| f == "HUB_ERP"))
        .count();

    (
        StatusCode::OK,
        Json(json!({
            "items": page,
            "total": total,
            "limit": q.limit,
            "offset": q.offset,
            "kpis": {
                "flagged": total,
                "critical": critical,
                "hubErp": hub_erp,
            }
        })),
    )
        .into_response()
}

/// GET /api/estoque/insumos/:code/divergencias
pub async fn get_insumo_divergencia_detail(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_resolutions_table(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let item = sqlx::query(
        "SELECT i.code, i.description, i.unit, i.category_id, c.name,
                COALESCE(s.stock_qty, 0), COALESCE(s.reserved_qty, 0),
                COALESCE(s.in_production, 0), COALESCE(s.in_orders, 0), s.snapshot_date
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         LEFT JOIN (
             SELECT DISTINCT ON (item_code)
                item_code, stock_qty, reserved_qty, in_production, in_orders, snapshot_date
             FROM stock_snapshots
             ORDER BY item_code, snapshot_date DESC, id DESC
         ) s ON i.code = s.item_code
         WHERE i.code = $1",
    )
    .bind(&code)
    .fetch_optional(pool)
    .await;

    let item = match item {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Insumo não encontrado" })),
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

    let hub_stock: f64 = item.get(5);

    let erp = match crate::core::legacy_db::fetch_erp_stock_live(pool, &code).await {
        Ok(Some(live)) => json!({
            "source": live.source,
            "stockQty": live.stock_qty,
            "reservedQty": live.reserved_qty,
            "inProduction": live.in_production,
            "inOrders": live.in_orders,
            "availableQty": live.stock_qty - live.reserved_qty,
        }),
        Ok(None) => json!({ "source": null, "error": "Não encontrado no ERP" }),
        Err(e) => json!({ "source": null, "error": e.to_string() }),
    };
    let erp_stock = erp.get("stockQty").and_then(|v| v.as_f64());
    let delta = erp_stock.map(|e| e - hub_stock);

    let movs = sqlx::query(
        "SELECT id, movement_type, quantity, date, document_number, details
         FROM stock_movements
         WHERE item_code = $1
         ORDER BY date DESC
         LIMIT 500",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut extrato: Vec<MovementExtratoRow> = Vec::new();
    let mut sum_in = 0.0;
    let mut sum_out = 0.0;
    for m in &movs {
        let id: String = m.get(0);
        let mt: String = m.get(1);
        let qty: f64 = m.get(2);
        let date: String = m.get(3);
        let doc: Option<String> = m.get(4);
        let details: Option<String> = m.get(5);
        let det = details.clone().unwrap_or_default();
        let (kind, label) = classify_movement_label(&mt, &det);
        if kind.contains("entrada") {
            sum_in += qty;
        } else {
            sum_out += qty;
        }
        extrato.push(MovementExtratoRow {
            id,
            date,
            movement_type: mt,
            label,
            quantity: qty,
            document_number: doc,
            details,
            source_kind: kind,
        });
    }

    let invoices = sqlx::query(
        "SELECT id, invoice_number, quantity, unit_price, total_value, supplier_name, invoice_date
         FROM invoices
         WHERE item_code = $1
         ORDER BY invoice_date DESC NULLS LAST
         LIMIT 100",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .iter()
    .map(|r| {
        json!({
            "id": r.get::<String, _>(0),
            "invoiceNumber": r.get::<Option<String>, _>(1),
            "quantity": r.get::<f64, _>(2),
            "unitPrice": r.get::<f64, _>(3),
            "totalValue": r.get::<f64, _>(4),
            "supplierName": r.get::<Option<String>, _>(5),
            "invoiceDate": r.get::<Option<String>, _>(6),
        })
    })
    .collect::<Vec<_>>();

    let baixas = sqlx::query(
        "SELECT registro, nlote, nqtde, nqtderef, dlog, cusuario, cjustificativa, ccodprod
         FROM lotes_baixas
         WHERE creferencia = $1
         ORDER BY dlog DESC NULLS LAST
         LIMIT 100",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .iter()
    .map(|r| {
        let nqtde: f64 = r.get(2);
        let nqtderef: f64 = r.get(3);
        let just: Option<String> = r.get(6);
        let diff_pct = if nqtderef.abs() > 1e-9 {
            ((nqtde - nqtderef).abs() / nqtderef.abs()) * 100.0
        } else if nqtde.abs() > 1e-9 {
            100.0
        } else {
            0.0
        };
        json!({
            "registro": r.get::<i32, _>(0),
            "lote": r.get::<Option<i32>, _>(1),
            "qty": nqtde,
            "qtyRef": nqtderef,
            "date": r.get::<Option<String>, _>(4),
            "user": r.get::<Option<String>, _>(5),
            "justificativa": just,
            "productCode": r.get::<Option<String>, _>(7),
            "diffPct": diff_pct,
            "anomalous": diff_pct > 10.0 || just.as_deref().map(text_looks_extra).unwrap_or(false),
        })
    })
    .collect::<Vec<_>>();

    let mut flags: Vec<String> = Vec::new();
    if delta.map(|d| d.abs() > 0.01).unwrap_or(false) {
        flags.push("HUB_ERP".into());
    }
    if baixas.iter().any(|b| b.get("anomalous").and_then(|v| v.as_bool()).unwrap_or(false)) {
        flags.push("BAIXA_ANOMALA".into());
        flags.push("LOTE_PESAGEM".into());
    }
    if extrato.iter().any(|e| {
        e.source_kind.starts_with("acerto") || e.source_kind.starts_with("inventario")
    }) {
        flags.push("MOV_EXTRA".into());
    }
    if sum_out > 0.0 && sum_in <= 0.0 && sum_out > hub_stock.max(1.0) {
        flags.push("KARDEX_GAP".into());
    }

    let resolutions = sqlx::query(
        "SELECT error_type, observations, resolved_by, resolved_at
         FROM insumo_stock_error_resolutions
         WHERE item_code = $1 AND is_resolved = 1",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
    .iter()
    .map(|r| {
        json!({
            "errorType": r.get::<String, _>(0),
            "observations": r.get::<Option<String>, _>(1),
            "resolvedBy": r.get::<Option<String>, _>(2),
            "resolvedAt": r.get::<Option<String>, _>(3),
        })
    })
    .collect::<Vec<_>>();

    (
        StatusCode::OK,
        Json(json!({
            "code": item.get::<String, _>(0),
            "description": item.get::<String, _>(1),
            "unit": item.get::<String, _>(2),
            "categoryId": item.get::<Option<String>, _>(3),
            "categoryName": item.get::<Option<String>, _>(4),
            "hub": {
                "stockQty": hub_stock,
                "reservedQty": item.get::<f64, _>(6),
                "inProduction": item.get::<f64, _>(7),
                "inOrders": item.get::<f64, _>(8),
                "snapshotDate": item.get::<Option<String>, _>(9),
            },
            "erp": erp,
            "deltaHubErp": delta,
            "flags": flags,
            "sums": { "entradas": sum_in, "saidas": sum_out },
            "movements": extrato,
            "invoices": invoices,
            "baixas": baixas,
            "resolutions": resolutions,
        })),
    )
        .into_response()
}

/// POST /api/estoque/insumos/:code/divergencias/resolver
pub async fn save_insumo_divergencia_resolution(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    Json(payload): Json<ResolveInsumoPayload>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_resolutions_table(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let id = Uuid::new_v4().to_string();
    let resolved_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let resolved_by = payload
        .resolved_by
        .unwrap_or_else(|| "Operador".to_string());

    match sqlx::query(
        "INSERT INTO insumo_stock_error_resolutions
            (id, item_code, error_type, is_resolved, resolved_by, resolved_at, observations)
         VALUES ($1, $2, $3, 1, $4, $5, $6)
         ON CONFLICT (item_code, error_type) DO UPDATE SET
            is_resolved = 1,
            resolved_by = EXCLUDED.resolved_by,
            resolved_at = EXCLUDED.resolved_at,
            observations = EXCLUDED.observations",
    )
    .bind(&id)
    .bind(&code)
    .bind(&payload.error_type)
    .bind(&resolved_by)
    .bind(&resolved_at)
    .bind(&payload.observations)
    .execute(pool)
    .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// DELETE /api/estoque/insumos/:code/divergencias/resolver?errorType=
pub async fn delete_insumo_divergencia_resolution(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let error_type = q.get("errorType").cloned().unwrap_or_default();
    if error_type.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "errorType obrigatório" })),
        )
            .into_response();
    }
    match sqlx::query(
        "DELETE FROM insumo_stock_error_resolutions WHERE item_code = $1 AND error_type = $2",
    )
    .bind(&code)
    .bind(&error_type)
    .execute(pool)
    .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn ensure_product_contagens_table(pool: &sqlx::PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS produto_stock_contagens (
            id TEXT PRIMARY KEY,
            product_code TEXT NOT NULL,
            recorded_qty DOUBLE PRECISION NOT NULL,
            counted_qty DOUBLE PRECISION NOT NULL,
            delta DOUBLE PRECISION NOT NULL,
            counted_by TEXT,
            counted_at TEXT NOT NULL,
            observations TEXT
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_prod_stock_cont_code
         ON produto_stock_contagens (product_code)",
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ProductCountPayload {
    pub counted_qty: f64,
    pub counted_by: Option<String>,
    pub observations: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductCountHistoryRow {
    pub id: String,
    pub product_code: String,
    pub recorded_qty: f64,
    pub counted_qty: f64,
    pub delta: f64,
    pub counted_by: Option<String>,
    pub counted_at: String,
    pub observations: Option<String>,
}

/// POST /api/estoque/produtos/:code/contagem
pub async fn save_product_count(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    Json(payload): Json<ProductCountPayload>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_product_contagens_table(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }
    let id = Uuid::new_v4().to_string();
    let counted_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let counted_by = payload.counted_by.unwrap_or_else(|| "Operador".to_string());

    // 1. Get current recorded quantity from estoque_atual
    let recorded_qty: f64 = match sqlx::query_scalar::<_, f64>(
        "SELECT COALESCE(estoque, 0.0) FROM estoque_atual WHERE codigo = $1"
    )
    .bind(&code)
    .fetch_one(pool)
    .await {
        Ok(val) => val,
        Err(_) => 0.0,
    };

    let delta = payload.counted_qty - recorded_qty;

    // Start a transaction
    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Falha ao iniciar transação: {}", e) })),
        ).into_response(),
    };

    // 2. Insert into produto_stock_contagens
    if let Err(e) = sqlx::query(
        "INSERT INTO produto_stock_contagens
            (id, product_code, recorded_qty, counted_qty, delta, counted_by, counted_at, observations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
    )
    .bind(&id)
    .bind(&code)
    .bind(recorded_qty)
    .bind(payload.counted_qty)
    .bind(delta)
    .bind(&counted_by)
    .bind(&counted_at)
    .bind(&payload.observations)
    .execute(&mut *tx)
    .await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Falha ao salvar contagem: {}", e) })),
        ).into_response();
    }

    // 3. Update estoque_atual
    if let Err(e) = sqlx::query(
        "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto)
         VALUES ($1, $2, 0.0, 0.0)
         ON CONFLICT (codigo) DO UPDATE SET estoque = $2"
    )
    .bind(&code)
    .bind(payload.counted_qty)
    .execute(&mut *tx)
    .await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Falha ao atualizar estoque atual: {}", e) })),
        ).into_response();
    }

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Falha ao commitar transação: {}", e) })),
        ).into_response();
    }

    (StatusCode::OK, Json(json!({ "success": true, "delta": delta }))).into_response()
}

/// GET /api/estoque/produtos/:code/contagem/historico
pub async fn get_product_count_history(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_product_contagens_table(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let rows = match sqlx::query(
        "SELECT id, product_code, recorded_qty, counted_qty, delta, counted_by, counted_at, observations
         FROM produto_stock_contagens
         WHERE product_code = $1
         ORDER BY counted_at DESC"
    )
    .bind(&code)
    .fetch_all(pool)
    .await {
        Ok(r) => r,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        ).into_response(),
    };

    let history: Vec<ProductCountHistoryRow> = rows.iter().map(|r| {
        ProductCountHistoryRow {
            id: r.get(0),
            product_code: r.get(1),
            recorded_qty: r.get(2),
            counted_qty: r.get(3),
            delta: r.get(4),
            counted_by: r.get::<Option<String>, _>(5),
            counted_at: r.get(6),
            observations: r.get::<Option<String>, _>(7),
        }
    }).collect();

    (StatusCode::OK, Json(history)).into_response()
}
