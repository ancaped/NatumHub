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
    ConferirItemRequest, CreateDevolucaoRequest, DevolucaoItemIn, DevolucaoItemOut, DevolucaoOut,
    ErpItemRequest, UpdateDevolucaoRequest,
};

const DISPOSICOES: &[&str] = &[
    "retornar_estoque",
    "trocar_embalagem",
    "trocar_rotulo",
    "descartar",
    "quarentena",
    "outro",
];

pub async fn ensure_tables(pool: &PgPool) -> Result<(), String> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_devolucoes (
            id BIGSERIAL PRIMARY KEY,
            register_number TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'rascunho'
                CHECK (status IN (
                    'rascunho', 'recebido', 'em_conferencia', 'disposto',
                    'parcialmente_lancado', 'finalizado'
                )),
            client_code TEXT NOT NULL DEFAULT '',
            client_name TEXT NOT NULL DEFAULT '',
            return_date DATE NOT NULL DEFAULT CURRENT_DATE,
            nf_number TEXT NOT NULL DEFAULT '',
            receiver_name TEXT NOT NULL DEFAULT '',
            carrier_name TEXT NOT NULL DEFAULT '',
            notes TEXT,
            received_by TEXT,
            received_at TIMESTAMPTZ,
            cq_by TEXT,
            cq_at TIMESTAMPTZ,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS qualidade_devolucao_itens (
            id BIGSERIAL PRIMARY KEY,
            devolucao_id BIGINT NOT NULL REFERENCES qualidade_devolucoes(id) ON DELETE CASCADE,
            item_code TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            qty DOUBLE PRECISION NOT NULL CHECK (qty > 0),
            lotes TEXT NOT NULL DEFAULT '',
            qty_conferida DOUBLE PRECISION,
            analise_obs TEXT,
            disposicao TEXT
                CHECK (disposicao IS NULL OR disposicao IN (
                    'retornar_estoque', 'trocar_embalagem', 'trocar_rotulo',
                    'descartar', 'quarentena', 'outro'
                )),
            disposicao_obs TEXT,
            erp_status TEXT NOT NULL DEFAULT 'em_processo'
                CHECK (erp_status IN ('em_processo', 'lancado')),
            erp_by TEXT,
            erp_at TIMESTAMPTZ,
            sort_order INT NOT NULL DEFAULT 0
        )
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_qualidade_devolucoes_status ON qualidade_devolucoes (status)",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_qualidade_devolucao_itens_dev ON qualidade_devolucao_itens (devolucao_id)",
    )
    .execute(pool)
    .await;

    Ok(())
}

fn normalize_disposicao(raw: &str) -> Result<Option<&'static str>, String> {
    let t = raw.trim();
    if t.is_empty() {
        return Ok(None);
    }
    DISPOSICOES
        .iter()
        .find(|d| **d == t)
        .copied()
        .map(Some)
        .ok_or_else(|| format!("disposicao inválida: {t}"))
}

async fn next_register_number(pool: &PgPool) -> Result<String, String> {
    let year = chrono::Local::now().format("%Y").to_string();
    let prefix = format!("DV-{year}-");
    let row = sqlx::query(
        r#"
        SELECT register_number FROM qualidade_devolucoes
        WHERE register_number LIKE $1
        ORDER BY register_number DESC
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

async fn load_items(pool: &PgPool, devolucao_id: i64) -> Result<Vec<DevolucaoItemOut>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, item_code, description, qty, lotes, qty_conferida, analise_obs,
               disposicao, disposicao_obs, erp_status, erp_by, erp_at, sort_order
        FROM qualidade_devolucao_itens
        WHERE devolucao_id = $1
        ORDER BY sort_order ASC, id ASC
        "#,
    )
    .bind(devolucao_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let erp_at: Option<chrono::DateTime<chrono::Utc>> = r.get(11);
            DevolucaoItemOut {
                id: crate::core::pg_row::pg_i64(&r, 0),
                item_code: r.get(1),
                description: r.get(2),
                qty: r.get(3),
                lotes: r.get(4),
                qty_conferida: r.get(5),
                analise_obs: r.get(6),
                disposicao: r.get(7),
                disposicao_obs: r.get(8),
                erp_status: r.get(9),
                erp_by: r.get(10),
                erp_at: erp_at.map(|t| t.to_rfc3339()),
                sort_order: r.get(12),
            }
        })
        .collect())
}

const DEV_SELECT: &str = r#"
    SELECT id, register_number, status, client_code, client_name, return_date,
           nf_number, receiver_name, carrier_name, notes,
           received_by, received_at, cq_by, cq_at,
           created_by, created_at, updated_at
    FROM qualidade_devolucoes
"#;

fn row_to_dev(r: &sqlx::postgres::PgRow, items: Vec<DevolucaoItemOut>) -> DevolucaoOut {
    let return_date: chrono::NaiveDate = r.get(5);
    let received_at: Option<chrono::DateTime<chrono::Utc>> = r.get(11);
    let cq_at: Option<chrono::DateTime<chrono::Utc>> = r.get(13);
    let created_at: chrono::DateTime<chrono::Utc> = r.get(15);
    let updated_at: chrono::DateTime<chrono::Utc> = r.get(16);
    DevolucaoOut {
        id: crate::core::pg_row::pg_i64(r, 0),
        register_number: r.get(1),
        status: r.get(2),
        client_code: r.get(3),
        client_name: r.get(4),
        return_date: return_date.format("%Y-%m-%d").to_string(),
        nf_number: r.get(6),
        receiver_name: r.get(7),
        carrier_name: r.get(8),
        notes: r.get(9),
        received_by: r.get(10),
        received_at: received_at.map(|t| t.to_rfc3339()),
        cq_by: r.get(12),
        cq_at: cq_at.map(|t| t.to_rfc3339()),
        created_by: r.get(14),
        created_at: created_at.to_rfc3339(),
        updated_at: updated_at.to_rfc3339(),
        items,
    }
}

async fn load_full(pool: &PgPool, id: i64) -> Result<DevolucaoOut, String> {
    let row = sqlx::query(&format!("{DEV_SELECT} WHERE id = $1"))
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let items = load_items(pool, id).await?;
    Ok(row_to_dev(&row, items))
}

async fn refresh_status_from_items(pool: &PgPool, id: i64) -> Result<(), String> {
    let status: String =
        sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
            .bind(id)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

    if !matches!(
        status.as_str(),
        "disposto" | "parcialmente_lancado" | "finalizado"
    ) {
        return Ok(());
    }

    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE erp_status = 'lancado')::int AS lancados
        FROM qualidade_devolucao_itens
        WHERE devolucao_id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let total: i32 = row.get(0);
    let lancados: i32 = row.get(1);
    let new_status = if total > 0 && lancados >= total {
        "finalizado"
    } else if lancados > 0 {
        "parcialmente_lancado"
    } else {
        "disposto"
    };

    sqlx::query(
        "UPDATE qualidade_devolucoes SET status = $1, updated_at = NOW() WHERE id = $2",
    )
    .bind(new_status)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn validate_items(items: &[DevolucaoItemIn]) -> Result<(), String> {
    if items.is_empty() {
        return Err("Informe ao menos um item".into());
    }
    for it in items {
        if it.item_code.trim().is_empty() || !(it.qty > 0.0) {
            return Err("Cada item precisa de código e qty > 0".into());
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
    pub q: Option<String>,
    /// abertas | finalizadas | all
    pub filtro: Option<String>,
}

pub async fn list_devolucoes(
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

    let mut sql = String::from(DEV_SELECT);
    sql.push_str(" WHERE 1=1");
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref f) = query.filtro {
        match f.trim().to_lowercase().as_str() {
            "abertas" => {
                sql.push_str(" AND status <> 'finalizado'");
            }
            "finalizadas" => {
                sql.push_str(" AND status = 'finalizado'");
            }
            _ => {}
        }
    }
    if let Some(ref st) = query.status {
        let st = st.trim();
        if !st.is_empty() {
            binds.push(st.to_string());
            sql.push_str(&format!(" AND status = ${}", binds.len()));
        }
    }
    if let Some(ref q) = query.q {
        let q = q.trim();
        if !q.is_empty() {
            binds.push(format!("%{q}%"));
            let i = binds.len();
            sql.push_str(&format!(
                " AND (register_number ILIKE ${i} OR client_name ILIKE ${i} OR client_code ILIKE ${i} OR nf_number ILIKE ${i} OR receiver_name ILIKE ${i})"
            ));
        }
    }
    sql.push_str(" ORDER BY return_date DESC, id DESC LIMIT 500");

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
        out.push(row_to_dev(&r, items));
    }

    (StatusCode::OK, Json(out)).into_response()
}

pub async fn get_devolucao(
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
    match load_full(pool, id).await {
        Ok(o) => (StatusCode::OK, Json(o)).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Devolução não encontrada" })),
        )
            .into_response(),
    }
}

pub async fn create_devolucao(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<CreateDevolucaoRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    if payload.client_name.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Informe o nome do cliente" })),
        )
            .into_response();
    }
    if let Err(e) = validate_items(&payload.items) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
    }

    let register_number = match next_register_number(pool).await {
        Ok(n) => n,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    };

    let return_date = payload
        .return_date
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
        INSERT INTO qualidade_devolucoes
            (register_number, status, client_code, client_name, return_date,
             nf_number, receiver_name, carrier_name, notes, created_by)
        VALUES ($1, 'rascunho', $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
        "#,
    )
    .bind(&register_number)
    .bind(payload.client_code.as_deref().unwrap_or("").trim())
    .bind(payload.client_name.trim())
    .bind(return_date)
    .bind(payload.nf_number.as_deref().unwrap_or("").trim())
    .bind(payload.receiver_name.as_deref().unwrap_or("").trim())
    .bind(payload.carrier_name.as_deref().unwrap_or("").trim())
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

    for (idx, it) in payload.items.iter().enumerate() {
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO qualidade_devolucao_itens
                (devolucao_id, item_code, description, qty, lotes, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(id)
        .bind(it.item_code.trim())
        .bind(it.description.as_deref().unwrap_or("").trim())
        .bind(it.qty)
        .bind(it.lotes.as_deref().unwrap_or("").trim())
        .bind(idx as i32)
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
            Json(json!({ "id": id, "registerNumber": register_number, "warning": e })),
        )
            .into_response(),
    }
}

pub async fn update_devolucao(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateDevolucaoRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let status: String = match sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Devolução não encontrada" })),
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

    if status != "rascunho" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Só é possível editar devoluções em rascunho" })),
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

    if let Some(ref name) = payload.client_name {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET client_name = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(name.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Some(ref code) = payload.client_code {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET client_code = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(code.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Some(ref d) = payload.return_date {
        if let Ok(nd) = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d") {
            let _ = sqlx::query(
                "UPDATE qualidade_devolucoes SET return_date = $1, updated_at = NOW() WHERE id = $2",
            )
            .bind(nd)
            .bind(id)
            .execute(&mut *tx)
            .await;
        }
    }
    if let Some(ref nf) = payload.nf_number {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET nf_number = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(nf.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Some(ref r) = payload.receiver_name {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET receiver_name = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(r.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if let Some(ref c) = payload.carrier_name {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET carrier_name = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(c.trim())
        .bind(id)
        .execute(&mut *tx)
        .await;
    }
    if payload.notes.is_some() {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET notes = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(&payload.notes)
        .bind(id)
        .execute(&mut *tx)
        .await;
    }

    if let Some(ref items) = payload.items {
        if let Err(e) = validate_items(items) {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
        }
        if let Err(e) = sqlx::query("DELETE FROM qualidade_devolucao_itens WHERE devolucao_id = $1")
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
        for (idx, it) in items.iter().enumerate() {
            if let Err(e) = sqlx::query(
                r#"
                INSERT INTO qualidade_devolucao_itens
                    (devolucao_id, item_code, description, qty, lotes, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6)
                "#,
            )
            .bind(id)
            .bind(it.item_code.trim())
            .bind(it.description.as_deref().unwrap_or("").trim())
            .bind(it.qty)
            .bind(it.lotes.as_deref().unwrap_or("").trim())
            .bind(idx as i32)
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

pub async fn receber_devolucao(
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

    let count: i64 =
        match sqlx::query_scalar("SELECT COUNT(*) FROM qualidade_devolucao_itens WHERE devolucao_id = $1")
            .bind(id)
            .fetch_one(pool)
            .await
        {
            Ok(c) => c,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        };
    if count == 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Inclua itens antes de receber" })),
        )
            .into_response();
    }

    let res = sqlx::query(
        r#"
        UPDATE qualidade_devolucoes
        SET status = 'recebido',
            received_by = $2,
            received_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND status = 'rascunho'
        "#,
    )
    .bind(id)
    .bind(&ctx.display_name)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Devolução não encontrada ou não está em rascunho" })),
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

pub async fn iniciar_conferencia(
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
        UPDATE qualidade_devolucoes
        SET status = 'em_conferencia', updated_at = NOW()
        WHERE id = $1 AND status IN ('recebido', 'em_conferencia')
        "#,
    )
    .bind(id)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Devolução precisa estar recebida" })),
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

pub async fn conferir_item(
    State(state): State<Arc<AppState>>,
    Path((id, item_id)): Path<(i64, i64)>,
    Json(payload): Json<ConferirItemRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let status: String = match sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Devolução não encontrada" })),
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

    if !matches!(status.as_str(), "recebido" | "em_conferencia") {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Conferência só em status recebido/em_conferencia" })),
        )
            .into_response();
    }

    if status == "recebido" {
        let _ = sqlx::query(
            "UPDATE qualidade_devolucoes SET status = 'em_conferencia', updated_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(pool)
        .await;
    }

    let disposicao = match payload.disposicao.as_deref() {
        Some(d) => match normalize_disposicao(d) {
            Ok(v) => v,
            Err(e) => {
                return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response();
            }
        },
        None => None,
    };

    let res = sqlx::query(
        r#"
        UPDATE qualidade_devolucao_itens
        SET qty_conferida = COALESCE($3, qty_conferida),
            analise_obs = COALESCE($4, analise_obs),
            disposicao = COALESCE($5, disposicao),
            disposicao_obs = COALESCE($6, disposicao_obs)
        WHERE id = $1 AND devolucao_id = $2
        "#,
    )
    .bind(item_id)
    .bind(id)
    .bind(payload.qty_conferida)
    .bind(&payload.analise_obs)
    .bind(disposicao)
    .bind(&payload.disposicao_obs)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Item não encontrado" })),
        )
            .into_response(),
        Ok(_) => {
            let _ = sqlx::query(
                "UPDATE qualidade_devolucoes SET updated_at = NOW() WHERE id = $1",
            )
            .bind(id)
            .execute(pool)
            .await;
            match load_full(pool, id).await {
                Ok(o) => (StatusCode::OK, Json(o)).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn fechar_cq(
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

    let pending: i64 = match sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM qualidade_devolucao_itens
        WHERE devolucao_id = $1 AND (disposicao IS NULL OR disposicao = '')
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };
    if pending > 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Todos os itens precisam de disposição CQ" })),
        )
            .into_response();
    }

    let res = sqlx::query(
        r#"
        UPDATE qualidade_devolucoes
        SET status = 'disposto', cq_by = $2, cq_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status IN ('em_conferencia', 'recebido')
        "#,
    )
    .bind(id)
    .bind(&ctx.display_name)
    .execute(pool)
    .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Devolução não está em conferência" })),
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

pub async fn marcar_erp_item(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path((id, item_id)): Path<(i64, i64)>,
    Json(payload): Json<ErpItemRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    let status: String = match sqlx::query_scalar("SELECT status FROM qualidade_devolucoes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Devolução não encontrada" })),
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

    if !matches!(
        status.as_str(),
        "disposto" | "parcialmente_lancado" | "finalizado"
    ) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Relançamento ERP só após disposição CQ" })),
        )
            .into_response();
    }

    let erp = payload.status.trim().to_lowercase();
    if erp != "em_processo" && erp != "lancado" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "status deve ser em_processo ou lancado" })),
        )
            .into_response();
    }

    let res = if erp == "lancado" {
        sqlx::query(
            r#"
            UPDATE qualidade_devolucao_itens
            SET erp_status = 'lancado', erp_by = $3, erp_at = NOW()
            WHERE id = $1 AND devolucao_id = $2
            "#,
        )
        .bind(item_id)
        .bind(id)
        .bind(&ctx.display_name)
        .execute(pool)
        .await
    } else {
        sqlx::query(
            r#"
            UPDATE qualidade_devolucao_itens
            SET erp_status = 'em_processo', erp_by = NULL, erp_at = NULL
            WHERE id = $1 AND devolucao_id = $2
            "#,
        )
        .bind(item_id)
        .bind(id)
        .execute(pool)
        .await
    };

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Item não encontrado" })),
        )
            .into_response(),
        Ok(_) => {
            if let Err(e) = refresh_status_from_items(pool, id).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
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
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_devolucao(
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

    let res =
        sqlx::query("DELETE FROM qualidade_devolucoes WHERE id = $1 AND status = 'rascunho'")
            .bind(id)
            .execute(pool)
            .await;

    match res {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Só é possível excluir rascunhos" })),
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
