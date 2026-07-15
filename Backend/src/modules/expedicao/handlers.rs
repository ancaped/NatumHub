use axum::{
    extract::{Multipart, Path, State, Query},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use calamine::{open_workbook_from_rs, Data, Reader, Xlsx};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use crate::handlers::AppState;
use super::models::{EcommerceOrder, CreateEcommerceOrderInput, UpdateEcommerceOrderInput};

// Helper to convert cell to string safely
fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => f.to_string(),
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        _ => "".to_string(),
    }
}

// Helper to parse Excel datetime values
fn excel_double_to_datetime(val: f64) -> Option<DateTime<Utc>> {
    let base_date = chrono::NaiveDate::from_ymd_opt(1899, 12, 30)?;
    let days = val.floor() as i64;
    let seconds_in_day = ((val - val.floor()) * 86400.0).round() as i64;
    
    let target_date = base_date.checked_add_signed(chrono::Duration::days(days))?;
    let target_time = chrono::NaiveTime::from_num_seconds_from_midnight_opt(seconds_in_day as u32, 0)?;
    
    let ndt = chrono::NaiveDateTime::new(target_date, target_time);
    Some(DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc))
}

fn cell_to_datetime(cell: &Data) -> Option<DateTime<Utc>> {
    match cell {
        Data::DateTime(dt) => {
            excel_double_to_datetime(dt.as_f64())
        }
        Data::Float(f) => {
            excel_double_to_datetime(*f)
        }
        Data::Int(i) => {
            excel_double_to_datetime(*i as f64)
        }
        Data::String(s) => {
            if let Ok(ndt) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                ndt.and_hms_opt(0, 0, 0)
                    .map(|ndt_hms| DateTime::<Utc>::from_naive_utc_and_offset(ndt_hms, Utc))
            } else if let Ok(ndt) = chrono::NaiveDate::parse_from_str(s, "%d/%m/%Y") {
                ndt.and_hms_opt(0, 0, 0)
                    .map(|ndt_hms| DateTime::<Utc>::from_naive_utc_and_offset(ndt_hms, Utc))
            } else {
                None
            }
        }
        _ => None,
    }
}

async fn ensure_ecommerce_orders_table(pool: &sqlx::PgPool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ecommerce_orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            data_emissao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            numero_nf VARCHAR(50) NOT NULL UNIQUE,
            nome_cliente VARCHAR(255) NOT NULL,
            observacoes TEXT,
            plataforma VARCHAR(100) NOT NULL,
            plataforma_envio VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'Pendente',
            quem_separou VARCHAR(100),
            pagamento_ok BOOLEAN NOT NULL DEFAULT FALSE,
            frete_ok BOOLEAN NOT NULL DEFAULT FALSE,
            data_envio TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )"
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_status ON ecommerce_orders(status)")
        .execute(pool)
        .await;
    let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_numero_nf ON ecommerce_orders(numero_nf)")
        .execute(pool)
        .await;

    Ok(())
}

#[derive(Deserialize)]
pub struct OrdersQuery {
    pub search: Option<String>,
    pub status: Option<String>,
    pub plataforma: Option<String>,
}

// GET /api/expedicao/ecommerce
pub async fn list_ecommerce_orders(
    State(state): State<Arc<AppState>>,
    Query(q): Query<OrdersQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_ecommerce_orders_table(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
    }
    
    let mut sql = "SELECT * FROM ecommerce_orders WHERE 1=1".to_string();
    let mut params = Vec::new();
    let mut param_idx = 1;

    if let Some(ref search) = q.search {
        let clean = search.trim();
        if !clean.is_empty() {
            sql.push_str(&format!(
                " AND (numero_nf ILIKE ${} OR nome_cliente ILIKE ${} OR observacoes ILIKE ${})",
                param_idx, param_idx + 1, param_idx + 2
            ));
            let search_pat = format!("%{}%", clean);
            params.push(search_pat.clone());
            params.push(search_pat.clone());
            params.push(search_pat);
            param_idx += 3;
        }
    }

    if let Some(ref status) = q.status {
        let clean = status.trim();
        if !clean.is_empty() {
            sql.push_str(&format!(" AND status = ${}", param_idx));
            params.push(clean.to_string());
            param_idx += 1;
        }
    }

    if let Some(ref plataforma) = q.plataforma {
        let clean = plataforma.trim();
        if !clean.is_empty() {
            sql.push_str(&format!(" AND plataforma = ${}", param_idx));
            params.push(clean.to_string());
            param_idx += 1;
        }
    }

    sql.push_str(" ORDER BY data_emissao DESC, numero_nf DESC");

    let mut query = sqlx::query_as::<_, EcommerceOrder>(&sql);
    for param in params {
        query = query.bind(param);
    }

    match query.fetch_all(pool).await {
        Ok(orders) => (StatusCode::OK, Json(orders)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// POST /api/expedicao/ecommerce
pub async fn create_ecommerce_order(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreateEcommerceOrderInput>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_ecommerce_orders_table(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
    }

    let data_envio = if input.status == "Enviado" {
        input.data_envio.or(Some(Utc::now()))
    } else {
        None
    };

    let res = sqlx::query_as::<_, EcommerceOrder>(
        "INSERT INTO ecommerce_orders (
            data_emissao, numero_nf, nome_cliente, observacoes, plataforma, 
            plataforma_envio, status, quem_separou, pagamento_ok, frete_ok, data_envio
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *"
    )
    .bind(input.data_emissao)
    .bind(input.numero_nf)
    .bind(input.nome_cliente)
    .bind(input.observacoes)
    .bind(input.plataforma)
    .bind(input.plataforma_envio)
    .bind(input.status)
    .bind(input.quem_separou)
    .bind(input.pagamento_ok)
    .bind(input.frete_ok)
    .bind(data_envio)
    .fetch_one(pool)
    .await;

    match res {
        Ok(order) => (StatusCode::CREATED, Json(order)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// PUT /api/expedicao/ecommerce/:id
pub async fn update_ecommerce_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<uuid::Uuid>,
    Json(input): Json<UpdateEcommerceOrderInput>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_ecommerce_orders_table(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
    }

    // Get current order status
    let current_order: Option<EcommerceOrder> = sqlx::query_as(
        "SELECT * FROM ecommerce_orders WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    if current_order.is_none() {
        return (StatusCode::NOT_FOUND, "Pedido não encontrado").into_response();
    }
    let current = current_order.unwrap();

    let new_status = input.status.unwrap_or_else(|| current.status.clone());
    
    // Automatically set data_envio if transitioning to "Enviado"
    let new_data_envio = if new_status == "Enviado" {
        if current.status != "Enviado" {
            Some(Utc::now())
        } else {
            input.data_envio.or(current.data_envio)
        }
    } else {
        None
    };

    let res = sqlx::query_as::<_, EcommerceOrder>(
        "UPDATE ecommerce_orders SET
            data_emissao = COALESCE($1, data_emissao),
            numero_nf = COALESCE($2, numero_nf),
            nome_cliente = COALESCE($3, nome_cliente),
            observacoes = COALESCE($4, observacoes),
            plataforma = COALESCE($5, plataforma),
            plataforma_envio = COALESCE($6, plataforma_envio),
            status = $7,
            quem_separou = COALESCE($8, quem_separou),
            pagamento_ok = COALESCE($9, pagamento_ok),
            frete_ok = COALESCE($10, frete_ok),
            data_envio = $11,
            updated_at = NOW()
        WHERE id = $12
        RETURNING *"
    )
    .bind(input.data_emissao)
    .bind(input.numero_nf)
    .bind(input.nome_cliente)
    .bind(input.observacoes)
    .bind(input.plataforma)
    .bind(input.plataforma_envio)
    .bind(new_status)
    .bind(input.quem_separou)
    .bind(input.pagamento_ok)
    .bind(input.frete_ok)
    .bind(new_data_envio)
    .bind(id)
    .fetch_one(pool)
    .await;

    match res {
        Ok(order) => (StatusCode::OK, Json(order)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// DELETE /api/expedicao/ecommerce/:id
pub async fn delete_ecommerce_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<uuid::Uuid>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_ecommerce_orders_table(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
    }

    let res = sqlx::query("DELETE FROM ecommerce_orders WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await;

    match res {
        Ok(r) if r.rows_affected() > 0 => (StatusCode::OK, "Pedido removido").into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, "Pedido não encontrado").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// POST /api/expedicao/ecommerce/import
pub async fn import_ecommerce_orders(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let pool = state.db.pool();
    if let Err(e) = ensure_ecommerce_orders_table(pool).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
    }

    let mut file_bytes = Vec::new();
    while let Ok(Some(field)) = multipart.next_field().await {
        if let Some(name) = field.name() {
            if name == "file" {
                if let Ok(bytes) = field.bytes().await {
                    file_bytes = bytes.to_vec();
                }
                break;
            }
        }
    }

    if file_bytes.is_empty() {
        return (StatusCode::BAD_REQUEST, "Arquivo não enviado ou vazio").into_response();
    }

    let cursor = std::io::Cursor::new(file_bytes);
    let mut workbook = match open_workbook_from_rs::<Xlsx<_>, _>(cursor) {
        Ok(wb) => wb,
        Err(e) => return (StatusCode::BAD_REQUEST, format!("Erro ao abrir Excel: {}", e)).into_response(),
    };

    let mut imported = 0;
    let mut updated = 0;

    for sheet_name in workbook.sheet_names() {
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            let mut col_data_emissao = None;
            let mut col_numero_nf = None;
            let mut col_nome_cliente = None;
            let mut col_obs = None;
            let mut col_plataforma = None;
            let mut col_plataforma_envio = None;
            let mut col_status = None;
            let mut col_quem_separou = None;
            let mut col_pagamento = None;
            let mut col_frete = None;

            let mut rows_iter = range.rows();
            if let Some(headers) = rows_iter.next() {
                for (c_idx, cell) in headers.iter().enumerate() {
                    let h_str = cell_to_string(cell).to_lowercase().replace(' ', "");
                    if h_str.contains("data") && h_str.contains("emiss") {
                        col_data_emissao = Some(c_idx);
                    } else if h_str.contains("nota") || h_str.contains("nf") || h_str.contains("nº") {
                        col_numero_nf = Some(c_idx);
                    } else if h_str.contains("cliente") || h_str.contains("nome") {
                        col_nome_cliente = Some(c_idx);
                    } else if h_str.contains("obs") {
                        col_obs = Some(c_idx);
                    } else if h_str == "plataforma" {
                        col_plataforma = Some(c_idx);
                    } else if h_str.contains("envio") {
                        col_plataforma_envio = Some(c_idx);
                    } else if h_str.contains("status") {
                        col_status = Some(c_idx);
                    } else if h_str.contains("separou") {
                        col_quem_separou = Some(c_idx);
                    } else if h_str.contains("pagamento") {
                        col_pagamento = Some(c_idx);
                    } else if h_str.contains("frete") {
                        col_frete = Some(c_idx);
                    }
                }
            }

            let col_data_emissao = col_data_emissao.unwrap_or(0);
            let col_numero_nf = col_numero_nf.unwrap_or(1);
            let col_nome_cliente = col_nome_cliente.unwrap_or(2);
            let col_obs = col_obs.unwrap_or(3);
            let col_plataforma = col_plataforma.unwrap_or(4);
            let col_plataforma_envio = col_plataforma_envio.unwrap_or(5);
            let col_status = col_status.unwrap_or(6);
            let col_quem_separou = col_quem_separou.unwrap_or(7);
            let col_pagamento = col_pagamento.unwrap_or(8);
            let col_frete = col_frete.unwrap_or(9);

            for row in rows_iter {
                if row.len() <= col_numero_nf || row.len() <= col_nome_cliente {
                    continue;
                }

                let nf_raw = cell_to_string(&row[col_numero_nf]);
                let nf_clean = nf_raw.trim().split('.').next().unwrap_or("").trim().to_string();
                if nf_clean.is_empty() || nf_clean == "0" {
                    continue; // Skip blank rows
                }

                let client = cell_to_string(&row[col_nome_cliente]).trim().to_string();
                if client.is_empty() {
                    continue;
                }

                let data_emissao = cell_to_datetime(&row[col_data_emissao]).unwrap_or_else(Utc::now);
                let obs = if row.len() > col_obs { Some(cell_to_string(&row[col_obs])) } else { None };
                let plataforma = if row.len() > col_plataforma { cell_to_string(&row[col_plataforma]) } else { "Ecommerce".to_string() };
                let plataforma_envio = if row.len() > col_plataforma_envio { cell_to_string(&row[col_plataforma_envio]) } else { "Total express".to_string() };
                let status_raw = if row.len() > col_status { cell_to_string(&row[col_status]) } else { "Pendente".to_string() };
                
                let status = if status_raw.to_lowercase().contains("enviado") {
                    "Enviado".to_string()
                } else if status_raw.to_lowercase().contains("canc") {
                    "Cancelado".to_string()
                } else {
                    "Pendente".to_string()
                };

                let quem_separou = if row.len() > col_quem_separou { Some(cell_to_string(&row[col_quem_separou])) } else { None };
                
                let pagamento_raw = if row.len() > col_pagamento { cell_to_string(&row[col_pagamento]).to_lowercase() } else { "".to_string() };
                let pagamento_ok = pagamento_raw.contains("sim") || pagamento_raw.contains("ok");

                let frete_raw = if row.len() > col_frete { cell_to_string(&row[col_frete]).to_lowercase() } else { "".to_string() };
                let frete_ok = frete_raw.contains("sim") || frete_raw.contains("ok");

                let data_envio = if status == "Enviado" { Some(Utc::now()) } else { None };

                // Upsert into DB
                let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ecommerce_orders WHERE numero_nf = $1)")
                    .bind(&nf_clean)
                    .fetch_one(pool)
                    .await
                    .unwrap_or(false);

                let query_res = if exists {
                    updated += 1;
                    sqlx::query(
                        "UPDATE ecommerce_orders SET
                            data_emissao = $1,
                            nome_cliente = $2,
                            observacoes = $3,
                            plataforma = $4,
                            plataforma_envio = $5,
                            status = $6,
                            quem_separou = $7,
                            pagamento_ok = $8,
                            frete_ok = $9,
                            data_envio = CASE WHEN $6 = 'Enviado' AND status <> 'Enviado' THEN NOW() ELSE data_envio END,
                            updated_at = NOW()
                        WHERE numero_nf = $10"
                    )
                    .bind(data_emissao)
                    .bind(client)
                    .bind(obs)
                    .bind(plataforma)
                    .bind(plataforma_envio)
                    .bind(status)
                    .bind(quem_separou)
                    .bind(pagamento_ok)
                    .bind(frete_ok)
                    .bind(&nf_clean)
                    .execute(pool)
                    .await
                } else {
                    imported += 1;
                    sqlx::query(
                        "INSERT INTO ecommerce_orders (
                            data_emissao, numero_nf, nome_cliente, observacoes, plataforma,
                            plataforma_envio, status, quem_separou, pagamento_ok, frete_ok, data_envio
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"
                    )
                    .bind(data_emissao)
                    .bind(&nf_clean)
                    .bind(client)
                    .bind(obs)
                    .bind(plataforma)
                    .bind(plataforma_envio)
                    .bind(status)
                    .bind(quem_separou)
                    .bind(pagamento_ok)
                    .bind(frete_ok)
                    .bind(data_envio)
                    .execute(pool)
                    .await
                };

                if let Err(e) = query_res {
                    eprintln!("Erro ao importar pedido NF {}: {}", nf_clean, e);
                }
            }
        }
    }

    (StatusCode::OK, Json(serde_json::json!({
        "status": "success",
        "imported": imported,
        "updated": updated
    }))).into_response()
}
