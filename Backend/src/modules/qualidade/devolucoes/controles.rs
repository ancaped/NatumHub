use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::geral::auth::models::AuthContext;

use super::handlers::ensure_tables;
use super::models::{
    ControleDevolucaoOut, ControleItemOut, ControleOut, CreateControleRequest, SetVolumesRequest,
};

fn rfc(value: Option<chrono::DateTime<chrono::Utc>>) -> Option<String> {
    value.map(|t| t.to_rfc3339())
}

async fn load_devolucoes(
    pool: &sqlx::PgPool,
    controle_id: Option<i64>,
    only_pending: bool,
) -> Result<Vec<ControleDevolucaoOut>, String> {
    let sql = if let Some(_) = controle_id {
        r#"
        SELECT d.id, d.register_number, d.client_code, d.client_name, d.return_date,
               d.nf_number, d.carrier_name, d.receiver_name, d.notes, d.volume_count, d.status
        FROM qualidade_devolucao_controle_itens ci
        JOIN qualidade_devolucoes d ON d.id = ci.devolucao_id
        WHERE ci.controle_id = $1
        ORDER BY d.return_date, d.id
        "#
    } else if only_pending {
        r#"
        SELECT d.id, d.register_number, d.client_code, d.client_name, d.return_date,
               d.nf_number, d.carrier_name, d.receiver_name, d.notes, d.volume_count, d.status
        FROM qualidade_devolucoes d
        WHERE NOT EXISTS (
            SELECT 1
            FROM qualidade_devolucao_controle_itens ci
            JOIN qualidade_devolucao_controles c ON c.id = ci.controle_id
            WHERE ci.devolucao_id = d.id AND c.status <> 'cancelada'
        )
        ORDER BY d.return_date DESC, d.id DESC
        "#
    } else {
        return Ok(Vec::new());
    };

    let rows = if let Some(id) = controle_id {
        sqlx::query(sql)
            .bind(id)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        sqlx::query(sql)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    };

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let id: i64 = crate::core::pg_row::pg_i64(&row, 0);
        let return_date: chrono::NaiveDate = row.get(4);
        let items = sqlx::query(
            r#"
            SELECT id, item_code, description, qty, lotes, disposicao, disposicao_obs, erp_status
            FROM qualidade_devolucao_itens
            WHERE devolucao_id = $1
            ORDER BY CASE WHEN disposicao = 'retornar_estoque' THEN 0 ELSE 1 END, sort_order, id
            "#,
        )
        .bind(id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        let mapped: Vec<ControleItemOut> = items
            .iter()
            .map(|item| ControleItemOut {
                id: crate::core::pg_row::pg_i64(item, 0),
                item_code: item.get(1),
                description: item.get(2),
                qty: item.get(3),
                lotes: item.get(4),
                disposicao: item.get(5),
                disposicao_obs: item.get(6),
                erp_status: item.get(7),
            })
            .collect();
        out.push(ControleDevolucaoOut {
            id,
            register_number: row.get(1),
            client_code: row.get(2),
            client_name: row.get(3),
            return_date: return_date.format("%Y-%m-%d").to_string(),
            nf_number: row.get(5),
            carrier_name: row.get(6),
            receiver_name: row.get(7),
            notes: row.get(8),
            volume_count: row.get(9),
            status: row.get(10),
            item_count: mapped.len() as i32,
            items: mapped,
        });
    }
    Ok(out)
}

async fn load_controle(pool: &sqlx::PgPool, id: i64) -> Result<Option<ControleOut>, String> {
    let row = sqlx::query(
        r#"
        SELECT id, sheet_number, status, volume_count, created_by, returned_by, returned_at, created_at
        FROM qualidade_devolucao_controles
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Ok(None);
    };
    let returned_at: Option<chrono::DateTime<chrono::Utc>> = row.get(6);
    let created_at: chrono::DateTime<chrono::Utc> = row.get(7);
    let devolucoes = load_devolucoes(pool, Some(id), false).await?;
    Ok(Some(ControleOut {
        id: crate::core::pg_row::pg_i64(&row, 0),
        sheet_number: row.get(1),
        status: row.get(2),
        volume_count: row.get(3),
        created_by: row.get(4),
        returned_by: row.get(5),
        returned_at: rfc(returned_at),
        created_at: created_at.to_rfc3339(),
        devolucao_count: devolucoes.len() as i32,
        devolucoes,
    }))
}

async fn next_sheet_number(pool: &sqlx::PgPool) -> Result<String, String> {
    let year = chrono::Local::now().format("%Y").to_string();
    let prefix = format!("CD-{year}-");
    let row = sqlx::query(
        r#"
        SELECT sheet_number FROM qualidade_devolucao_controles
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

pub async fn list_controles(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
    }
    let rows = match sqlx::query(
        r#"
        SELECT c.id, c.sheet_number, c.status, c.volume_count, c.created_by,
               c.returned_by, c.returned_at, c.created_at,
               COUNT(ci.devolucao_id)::int AS devolucao_count
        FROM qualidade_devolucao_controles c
        LEFT JOIN qualidade_devolucao_controle_itens ci ON ci.controle_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT 300
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
    let out: Vec<ControleOut> = rows
        .iter()
        .map(|row| {
            let returned_at: Option<chrono::DateTime<chrono::Utc>> = row.get(6);
            let created_at: chrono::DateTime<chrono::Utc> = row.get(7);
            ControleOut {
                id: crate::core::pg_row::pg_i64(row, 0),
                sheet_number: row.get(1),
                status: row.get(2),
                volume_count: row.get(3),
                created_by: row.get(4),
                returned_by: row.get(5),
                returned_at: rfc(returned_at),
                created_at: created_at.to_rfc3339(),
                devolucao_count: row.get(8),
                devolucoes: Vec::new(),
            }
        })
        .collect();
    (StatusCode::OK, Json(out)).into_response()
}

pub async fn pending_controles(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
    }
    match load_devolucoes(pool, None, true).await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn get_controle(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
    }
    match load_controle(pool, id).await {
        Ok(Some(row)) => (StatusCode::OK, Json(row)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Controle não encontrado" })),
        )
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn create_controle(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<CreateControleRequest>,
) -> impl IntoResponse {
    let mut ids = body.devolucao_ids;
    ids.sort_unstable();
    ids.dedup();
    if ids.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Selecione ao menos uma devolução." })),
        )
            .into_response();
    }
    if ids.len() > 40 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Um controle aceita até 40 devoluções." })),
        )
            .into_response();
    }

    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
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
        SELECT d.id, d.register_number, d.volume_count,
               (
                   SELECT c.sheet_number
                   FROM qualidade_devolucao_controle_itens ci
                   JOIN qualidade_devolucao_controles c ON c.id = ci.controle_id
                   WHERE ci.devolucao_id = d.id AND c.status <> 'cancelada'
                   LIMIT 1
               ) AS sheet_number
        FROM qualidade_devolucoes d
        WHERE d.id = ANY($1)
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
            Json(json!({ "error": "Alguma devolução selecionada não existe mais." })),
        )
            .into_response();
    }
    let mut summed = 0i32;
    for row in &rows {
        let number: String = row.get(1);
        let volume: i32 = row.get(2);
        let sheet: Option<String> = row.get(3);
        summed += volume.max(1);
        if let Some(sheet) = sheet {
            return (
                StatusCode::CONFLICT,
                Json(json!({ "error": format!("{number} já está no controle {sheet}.") })),
            )
                .into_response();
        }
    }

    let volume_count = body.volume_count.unwrap_or(summed.max(1)).clamp(1, 99);
    let sheet_number = match next_sheet_number(pool).await {
        Ok(n) => n,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
        }
    };
    let inserted = match sqlx::query(
        r#"
        INSERT INTO qualidade_devolucao_controles (sheet_number, created_by, volume_count)
        VALUES ($1, $2, $3)
        RETURNING id
        "#,
    )
    .bind(&sheet_number)
    .bind(&ctx.display_name)
    .bind(volume_count)
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
    let controle_id = crate::core::pg_row::pg_i64(&inserted, 0);
    for devolucao_id in &ids {
        if let Err(e) = sqlx::query(
            "INSERT INTO qualidade_devolucao_controle_itens (controle_id, devolucao_id) VALUES ($1, $2)",
        )
        .bind(controle_id)
        .bind(devolucao_id)
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
    match load_controle(pool, controle_id).await {
        Ok(Some(row)) => (StatusCode::CREATED, Json(row)).into_response(),
        Ok(None) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Controle criado, mas não foi possível abri-lo." })),
        )
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
    }
}

pub async fn set_volumes(
    State(state): State<Arc<AppState>>,
    Extension(_ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
    Json(body): Json<SetVolumesRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
    }
    let volume = body.volume_count.clamp(1, 99);
    let updated = sqlx::query(
        r#"
        UPDATE qualidade_devolucao_controles
        SET volume_count = $2
        WHERE id = $1 AND status <> 'cancelada'
        "#,
    )
    .bind(id)
    .bind(volume)
    .execute(pool)
    .await;
    match updated {
        Ok(result) if result.rows_affected() == 1 => match load_controle(pool, id).await {
            Ok(Some(row)) => (StatusCode::OK, Json(row)).into_response(),
            Ok(None) => (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Controle não encontrado" })),
            )
                .into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response(),
        },
        Ok(_) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Não é possível alterar os volumes deste controle." })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn set_status(
    state: &AppState,
    ctx: &AuthContext,
    id: i64,
    next: &str,
) -> axum::response::Response {
    let pool = state.db.pool();
    if let Err(e) = ensure_tables(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))).into_response();
    }
    let result = if next == "devolvida" {
        sqlx::query(
            r#"
            UPDATE qualidade_devolucao_controles
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
            UPDATE qualidade_devolucao_controles
            SET status = 'cancelada'
            WHERE id = $1 AND status = 'aberta'
            "#,
        )
        .bind(id)
        .execute(pool)
        .await
    };
    match result {
        Ok(done) if done.rows_affected() == 1 => match load_controle(pool, id).await {
            Ok(Some(row)) => (StatusCode::OK, Json(row)).into_response(),
            _ => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        },
        Ok(_) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Este controle não está aguardando conferência." })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn devolver_controle(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    set_status(&state, &ctx, id, "devolvida").await
}

pub async fn cancelar_controle(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    set_status(&state, &ctx, id, "cancelada").await
}
