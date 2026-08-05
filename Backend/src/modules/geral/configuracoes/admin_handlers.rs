use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::configuracoes::pg_backup::{
    self, BackupTier, PgBackupConfig,
};

/// GET /api/admin/db-usage — tamanho do banco e top tabelas (supervisor).
pub async fn get_db_usage(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match crate::core::pg_db::db_usage_stats(state.db.pool()).await {
        Ok(payload) => (StatusCode::OK, Json(payload)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

/// GET /api/admin/pg-backup — status + config de backup Postgres local.
pub async fn get_pg_backup_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match pg_backup::build_status(&state).await {
        Ok(body) => (StatusCode::OK, Json(body)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

/// POST /api/admin/pg-backup/config — salva retenção e pasta local.
pub async fn save_pg_backup_config(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PgBackupConfig>,
) -> impl IntoResponse {
    match pg_backup::save_config(&state, body).await {
        Ok(cfg) => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "config": cfg,
                "pastaEfetiva": pg_backup::resolve_backup_root(&cfg).display().to_string(),
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
pub struct PgBackupRunQuery {
    /// hourly | daily | weekly | monthly (padrão: daily)
    pub tier: Option<String>,
}

/// POST /api/admin/pg-backup/run — dispara backup manual agora.
pub async fn run_pg_backup_now(
    State(state): State<Arc<AppState>>,
    Query(q): Query<PgBackupRunQuery>,
) -> impl IntoResponse {
    let tier = match q.tier.as_deref().unwrap_or("daily").to_ascii_lowercase().as_str() {
        "hourly" => BackupTier::Hourly,
        "weekly" => BackupTier::Weekly,
        "monthly" => BackupTier::Monthly,
        _ => BackupTier::Daily,
    };
    match pg_backup::run_manual(&state, tier).await {
        Ok(path) => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "tier": tier.as_str(),
                "path": path.display().to_string(),
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

/// POST /api/admin/db-reset — limpa dados operacionais (mantém operadores e seeds).
pub async fn reset_operational_data(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();

    let tables = [
        "quotation_prices",
        "quotation_items",
        "quotations",
        "invoices",
        "consumption",
        "stock_snapshots",
        "stock_imports",
        "similar_items",
        "online_orders",
        "feedbacks",
        "feedback_notes",
        "reports",
        "fisco_quimica_analyses",
        "fisco_quimica_product_agents",
        "fisco_quimica_patterns",
        "fisco_quimica_corrective_agents",
        "historico_producao",
        "historico_importacoes",
        "kit_assembly_orders",
        "vira_ordens",
        "vira_composicao",
        "purchase_order_items",
        "sales_order_items",
        "sales_orders",
        "purchase_orders",
        "stock_movements",
        "formulations",
        "overrides_produtos",
        "estoque_atual",
        "historico_faturamento",
        "kit_composicao",
        "produtos",
        "items",
        "suppliers",
        "tiny_contas_pagar",
        "tiny_contas_receber",
    ];

    for table in tables {
        let sql = format!("TRUNCATE TABLE {table} RESTART IDENTITY CASCADE");
        if let Err(e) = sqlx::query(&sql).execute(pool).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Falha ao truncar {table}: {e}") })),
            )
                .into_response();
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "success",
            "message": "Dados operacionais resetados. Operadores e config_linhas preservados."
        })),
    )
        .into_response()
}

async fn hub_stock_for_code(pool: &sqlx::PgPool, code: &str) -> serde_json::Value {
    let code = code.trim();
    if let Ok(Some(row)) = sqlx::query(
        r#"
        SELECT stock_qty, reserved_qty, in_production, in_orders, snapshot_date::text
        FROM stock_snapshots
        WHERE TRIM(item_code) = $1
        ORDER BY snapshot_date DESC, id DESC
        LIMIT 1
        "#,
    )
    .bind(code)
    .fetch_optional(pool)
    .await
    {
        let stock: f64 = row.get(0);
        let reserved: f64 = row.get(1);
        return json!({
            "source": "stock_snapshots",
            "stockQty": stock,
            "reservedQty": reserved,
            "inProduction": row.get::<f64, _>(2),
            "inOrders": row.get::<f64, _>(3),
            "snapshotDate": row.get::<Option<String>, _>(4),
            "availableQty": stock - reserved,
        });
    }

    if let Ok(Some(row)) = sqlx::query(
        "SELECT estoque, producao, pedidos_aberto FROM estoque_atual WHERE TRIM(codigo) = $1",
    )
    .bind(code)
    .fetch_optional(pool)
    .await
    {
        let stock: f64 = row.get(0);
        return json!({
            "source": "estoque_atual",
            "stockQty": stock,
            "reservedQty": 0.0,
            "inProduction": row.get::<f64, _>(1),
            "inOrders": row.get::<f64, _>(2),
            "snapshotDate": serde_json::Value::Null,
            "availableQty": stock,
        });
    }

    json!({ "source": null, "error": "Código não encontrado no Hub" })
}

/// GET /api/admin/audit/stock/:code — compara Hub × ERP ao vivo (supervisor).
pub async fn audit_stock(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let hub = hub_stock_for_code(pool, &code).await;

    let erp = match crate::core::legacy_db::fetch_erp_stock_live(pool, &code).await {
        Ok(Some(live)) => {
            let mut obj = json!({
                "source": live.source,
                "stockQty": live.stock_qty,
                "reservedQty": live.reserved_qty,
                "inProduction": live.in_production,
                "inOrders": live.in_orders,
                "hubField": "nQtdeEstoque (tela Estoque atual)",
            });
            if let Some(raw) = live.stock_qty_raw {
                obj["stockQtyRaw"] = json!(raw);
                obj["stockQtyRawField"] = json!("nQtdeEstoque");
            }
            if let Some(a) = live.stock_qty_a {
                obj["stockQtyA"] = json!(a);
                obj["stockQtyAField"] = json!("nQtdeEstoqueA");
            }
            obj
        }
        Ok(None) => json!({ "source": null, "error": "Código não encontrado no ERP" }),
        Err(e) => json!({ "source": null, "error": e.to_string() }),
    };

    let hub_stock = hub.get("stockQty").and_then(|v| v.as_f64());
    let erp_stock = erp.get("stockQty").and_then(|v| v.as_f64());
    let delta = match (hub_stock, erp_stock) {
        (Some(h), Some(e)) => Some(e - h),
        _ => None,
    };
    let match_stock = match (hub_stock, erp_stock) {
        (Some(h), Some(e)) => (h - e).abs() < 1e-6,
        _ => false,
    };

    (
        StatusCode::OK,
        Json(json!({
            "code": code,
            "hub": hub,
            "erp": erp,
            "deltaStock": delta,
            "match": match_stock,
            "notes": {
                "estoqueExibidoProdutos": "nQtdeEstoque (cadastro Produtos)",
                "estoqueExibidoInsumos": "nQtdeEstoque (tela Estoque atual)",
                "prevFutura": "cálculo interno Hub — não comparar com estoque ERP",
                "efpProducao": "estoque + produção − pedidos (não é o estoque ERP)"
            }
        })),
    )
        .into_response()
}

/// POST /api/admin/audit/stock/:code/refresh — re-lê D1/D2/A pontual do ERP e grava no Hub.
pub async fn refresh_stock_from_erp(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match crate::core::legacy_db::refresh_stock_snapshot_from_erp(pool, &code).await {
        Ok(live) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "code": code,
                "source": live.source,
                "stockQty": live.stock_qty,
                "reservedQty": live.reserved_qty,
                "inProduction": live.in_production,
                "inOrders": live.in_orders,
                "availableQty": live.stock_qty - live.reserved_qty,
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /api/admin/audit/stock/verify-insumos — compara Hub × ERP e corrige divergências (nQtdeEstoque).
pub async fn verify_insumo_stocks(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match crate::core::legacy_db::verify_and_repair_insumo_stocks(state.db.pool()).await {
        Ok(r) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "checked": r.checked,
                "repaired": r.repaired,
                "samples": r.samples,
                "source": "nQtdeEstoque",
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /api/admin/audit/stock/resync-insumos — regrava todos os snapshots D1 com nQtdeEstoque.
pub async fn resync_insumo_stocks(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match crate::core::legacy_db::resync_all_insumo_snapshots_from_erp(state.db.pool()).await {
        Ok(n) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "updated": n,
                "source": "nQtdeEstoque",
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /api/admin/audit/stock/resync-produtos — regrava estoque_atual com Produtos.nQtdeEstoque.
pub async fn resync_produto_stocks(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match crate::core::legacy_db::resync_all_produto_stocks_from_erp(state.db.pool()).await {
        Ok(r) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "updated": r.updated,
                "stillNegativeFromErp": r.still_negative_from_erp,
                "divergencesBefore": r.sample_before_after,
                "source": "nQtdeEstoque",
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
