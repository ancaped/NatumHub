use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;

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

    let recorded_qty: f64 = match sqlx::query_scalar::<_, f64>(
        "SELECT COALESCE(estoque, 0.0) FROM estoque_atual WHERE codigo = $1",
    )
    .bind(&code)
    .fetch_one(pool)
    .await
    {
        Ok(val) => val,
        Err(_) => 0.0,
    };

    let delta = payload.counted_qty - recorded_qty;

    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Falha ao iniciar transação: {}", e) })),
            )
                .into_response();
        }
    };

    if let Err(e) = sqlx::query(
        "INSERT INTO produto_stock_contagens
            (id, product_code, recorded_qty, counted_qty, delta, counted_by, counted_at, observations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
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
    .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Falha ao salvar contagem: {}", e) })),
        )
            .into_response();
    }

    if let Err(e) = sqlx::query(
        "INSERT INTO estoque_atual (codigo, estoque, producao, pedidos_aberto)
         VALUES ($1, $2, 0.0, 0.0)
         ON CONFLICT (codigo) DO UPDATE SET estoque = $2",
    )
    .bind(&code)
    .bind(payload.counted_qty)
    .execute(&mut *tx)
    .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Falha ao atualizar estoque atual: {}", e) })),
        )
            .into_response();
    }

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Falha ao commitar transação: {}", e) })),
        )
            .into_response();
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
         ORDER BY counted_at DESC",
    )
    .bind(&code)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let history: Vec<ProductCountHistoryRow> = rows
        .iter()
        .map(|r| ProductCountHistoryRow {
            id: r.get(0),
            product_code: r.get(1),
            recorded_qty: r.get(2),
            counted_qty: r.get(3),
            delta: r.get(4),
            counted_by: r.get::<Option<String>, _>(5),
            counted_at: r.get(6),
            observations: r.get::<Option<String>, _>(7),
        })
        .collect();

    (StatusCode::OK, Json(history)).into_response()
}
