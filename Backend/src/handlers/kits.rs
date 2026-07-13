use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use sqlx::{PgPool, Row};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::models::NewKitComposicao;

// GET /api/kits/composicao
pub async fn list_kit_composicao(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_kit_composition_full().await {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao listar composição de kits: {}", e) })),
        )
            .into_response(),
    }
}

// POST /api/kits/composicao
pub async fn add_kit_composicao_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<NewKitComposicao>,
) -> impl IntoResponse {
    if body.kit_codigo.trim().is_empty() || body.componente_codigo.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "kit_codigo e componente_codigo são obrigatórios" })),
        )
            .into_response();
    }
    let qty = if body.quantidade < 1 { 1 } else { body.quantidade };
    match state
        .db
        .add_kit_composicao(&body.kit_codigo, &body.componente_codigo, qty)
        .await
    {
        Ok(_) => (StatusCode::CREATED, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao adicionar relação de kit: {}", e) })),
        )
            .into_response(),
    }
}

// DELETE /api/kits/composicao/:kit/:comp
pub async fn delete_kit_composicao_handler(
    State(state): State<Arc<AppState>>,
    Path((kit, comp)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.db.delete_kit_composicao(&kit, &comp).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao excluir relação de kit: {}", e) })),
        )
            .into_response(),
    }
}

// POST /api/kits/composicao/upload (re-import xlsx, replaces all)
pub async fn upload_kit_composicao(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    use std::fs::File;
    use std::io::Write;

    let mut file_data: Option<axum::body::Bytes> = None;
    let mut file_name: Option<String> = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            file_name = field.file_name().map(|s| s.to_string());
            if let Ok(bytes) = field.bytes().await {
                file_data = Some(bytes);
                break;
            }
        }
    }
    let bytes = match file_data {
        Some(b) => b,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Arquivo não encontrado no formulário" })),
            )
                .into_response();
        }
    };
    let temp_path = std::env::temp_dir().join("temp_kits_upload.xlsx");
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) })),
            )
                .into_response();
        }
    };
    if let Err(e) = file.write_all(&bytes) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo: {}", e) })),
        )
            .into_response();
    }
    if let Err(e) = state.db.delete_all_kit_composicao().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao limpar composições existentes: {}", e) })),
        )
            .into_response();
    }
    let pool = state.db.pool();
    match crate::modules::compras::planejamento::parser::parse_kits_excel(&temp_path, pool).await
    {
        Ok(count) => {
            let _ = std::fs::remove_file(&temp_path);
            let fname = file_name.unwrap_or_else(|| "kits.xlsx".to_string());
            let _ = state
                .db
                .record_import(
                    "kits",
                    &fname,
                    count as i64,
                    "success",
                    Some(&format!("{} relações importadas", count)),
                )
                .await;
            (
                StatusCode::OK,
                Json(json!({
                    "status": "success",
                    "imported": count,
                    "message": format!("Composição de kits importada: {} relações", count)
                })),
            )
                .into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Erro ao processar planilha: {}", e) })),
            )
                .into_response()
        }
    }
}

async fn fetch_kit_orders(pool: &PgPool) -> Result<Vec<crate::models::KitAssemblyOrder>, String> {
    let rows = sqlx::query(
        "SELECT id, order_number, kit_product_code, kit_product_description, quantity,
                status, created_at, completed_at, assembled_by, checked_by, observations,
                erp_launched, components_lotes, quantity_assembled
         FROM kit_assembly_orders
         ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| crate::models::KitAssemblyOrder {
            id: crate::core::pg_row::pg_i64(row, 0),
            order_number: row.get(1),
            kit_product_code: row.get(2),
            kit_product_description: row.get(3),
            quantity: crate::core::pg_row::pg_f64(row, 4),
            status: row.get(5),
            created_at: row.get(6),
            completed_at: row.get(7),
            assembled_by: row.get(8),
            checked_by: row.get(9),
            observations: row.get(10),
            erp_launched: row.try_get::<i32, _>(11).unwrap_or(0),
            components_lotes: row.get(12),
            quantity_assembled: row
                .try_get::<Option<f64>, _>(13)
                .ok()
                .flatten()
                .or_else(|| {
                    row.try_get::<Option<i32>, _>(13)
                        .ok()
                        .flatten()
                        .map(|v| v as f64)
                }),
        })
        .collect())
}

pub async fn list_kit_orders(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    match fetch_kit_orders(pool).await {
        Ok(orders) => (StatusCode::OK, Json(orders)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_kit_order(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::CreateKitOrderRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let status = payload.status.unwrap_or_else(|| "PENDING".to_string());
    let qty_assembled = payload.quantity_assembled.unwrap_or(payload.quantity);

    match sqlx::query_scalar::<_, i64>(
        "INSERT INTO kit_assembly_orders (
            order_number, kit_product_code, kit_product_description, quantity, status,
            created_at, assembled_by, checked_by, observations, erp_launched, components_lotes,
            quantity_assembled
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11)
         RETURNING id",
    )
    .bind(&payload.order_number)
    .bind(&payload.kit_product_code)
    .bind(&payload.kit_product_description)
    .bind(payload.quantity)
    .bind(&status)
    .bind(&created_at)
    .bind(&payload.assembled_by)
    .bind(&payload.checked_by)
    .bind(&payload.observations)
    .bind(&payload.components_lotes)
    .bind(qty_assembled)
    .fetch_one(pool)
    .await
    {
        Ok(last_id) => (
            StatusCode::CREATED,
            Json(json!({ "id": last_id, "message": "Ordem de montagem criada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Erro ao criar ordem de montagem: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn update_kit_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<crate::models::UpdateKitOrderRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let mut qb = sqlx::QueryBuilder::new("UPDATE kit_assembly_orders SET ");
    let mut has_set = false;

    let mut separated = qb.separated(", ");

    if let Some(ref status) = payload.status {
        separated.push("status = ");
        separated.push_bind_unseparated(status);
        has_set = true;
        if status == "COMPLETED" {
            let completed_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            separated.push("completed_at = ");
            separated.push_bind_unseparated(completed_at);
        } else if status == "PENDING" {
            separated.push("completed_at = NULL");
        }
    }
    if let Some(ref assembled_by) = payload.assembled_by {
        separated.push("assembled_by = ");
        separated.push_bind_unseparated(assembled_by);
        has_set = true;
    }
    if let Some(ref checked_by) = payload.checked_by {
        separated.push("checked_by = ");
        separated.push_bind_unseparated(checked_by);
        has_set = true;
    }
    if let Some(ref observations) = payload.observations {
        separated.push("observations = ");
        separated.push_bind_unseparated(observations);
        has_set = true;
    }
    if let Some(erp_launched) = payload.erp_launched {
        separated.push("erp_launched = ");
        separated.push_bind_unseparated(erp_launched);
        has_set = true;
    }
    if let Some(ref components_lotes) = payload.components_lotes {
        separated.push("components_lotes = ");
        separated.push_bind_unseparated(components_lotes);
        has_set = true;
    }
    if let Some(quantity_assembled) = payload.quantity_assembled {
        separated.push("quantity_assembled = ");
        separated.push_bind_unseparated(quantity_assembled);
        has_set = true;
    }

    if !has_set {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Nenhum campo para atualizar" })),
        )
            .into_response();
    }

    qb.push(" WHERE id = ");
    qb.push_bind(id);

    match qb.build().execute(pool).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "message": "Ordem de montagem atualizada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Erro ao atualizar: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn delete_kit_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match sqlx::query("DELETE FROM kit_assembly_orders WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "message": "Ordem de montagem excluída" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Erro ao excluir: {}", e) })),
        )
            .into_response(),
    }
}

fn compute_next_order_number(last_order: Option<String>, default: &str) -> String {
    match last_order {
        Some(last) => {
            let mut prefix = String::new();
            let mut num_str = String::new();
            for c in last.chars() {
                if c.is_ascii_digit() {
                    num_str.push(c);
                } else {
                    if !num_str.is_empty() {
                        prefix.push_str(&num_str);
                        num_str.clear();
                    }
                    prefix.push(c);
                }
            }
            if let Ok(num) = num_str.parse::<i64>() {
                let formatted_num = format!("{:0width$}", num + 1, width = num_str.len());
                format!("{}{}", prefix, formatted_num)
            } else {
                format!("{}-1", last)
            }
        }
        None => default.to_string(),
    }
}

pub async fn get_next_kit_order_number(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let last_order: Option<String> = sqlx::query_scalar(
        "SELECT order_number FROM kit_assembly_orders ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let next_order = compute_next_order_number(last_order, "1001");
    (StatusCode::OK, Json(json!({ "nextOrderNumber": next_order }))).into_response()
}

pub async fn list_vira_composicao(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    match sqlx::query(
        "SELECT vc.de_produto_codigo, pd.descricao as de_desc,
                vc.para_produto_codigo, pp.descricao as para_desc,
                vc.quantidade
         FROM vira_composicao vc
         JOIN produtos pd ON TRIM(REPLACE(vc.de_produto_codigo, '\"', '')) = TRIM(REPLACE(pd.codigo, '\"', ''))
         JOIN produtos pp ON TRIM(REPLACE(vc.para_produto_codigo, '\"', '')) = TRIM(REPLACE(pp.codigo, '\"', ''))
         ORDER BY pd.descricao",
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => {
            let list: Vec<crate::models::ViraComposicaoRow> = rows
                .iter()
                .map(|row| crate::models::ViraComposicaoRow {
                    de_produto_codigo: row.get(0),
                    de_produto_descricao: row.get(1),
                    para_produto_codigo: row.get(2),
                    para_produto_descricao: row.get(3),
                    quantidade: crate::core::pg_row::pg_f64(row, 4),
                })
                .collect();
            (StatusCode::OK, Json(list)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn add_vira_composicao(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::NewViraComposicao>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match sqlx::query(
        "INSERT INTO vira_composicao (de_produto_codigo, para_produto_codigo, quantidade)
         VALUES ($1, $2, $3)
         ON CONFLICT(de_produto_codigo, para_produto_codigo) DO UPDATE SET quantidade = EXCLUDED.quantidade",
    )
    .bind(&payload.de_produto_codigo)
    .bind(&payload.para_produto_codigo)
    .bind(payload.quantidade)
    .execute(pool)
    .await
    {
        Ok(_) => (
            StatusCode::CREATED,
            Json(json!({ "message": "Composição de vira adicionada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_vira_composicao(
    State(state): State<Arc<AppState>>,
    Path((de, para)): Path<(String, String)>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match sqlx::query(
        "DELETE FROM vira_composicao WHERE de_produto_codigo = $1 AND para_produto_codigo = $2",
    )
    .bind(&de)
    .bind(&para)
    .execute(pool)
    .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "message": "Composição de vira excluída" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn fetch_vira_orders(pool: &PgPool) -> Result<Vec<crate::models::ViraOrder>, String> {
    let rows = sqlx::query(
        "SELECT id, order_number, de_produto_codigo, de_produto_descricao,
                para_produto_codigo, para_produto_descricao, quantity, status,
                created_at, completed_at, assembled_by, checked_by, observations,
                erp_launched, quantity_assembled
         FROM vira_ordens
         ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| crate::models::ViraOrder {
            id: crate::core::pg_row::pg_i64(row, 0),
            order_number: row.get(1),
            de_produto_codigo: row.get(2),
            de_produto_descricao: row.get(3),
            para_produto_codigo: row.get(4),
            para_produto_descricao: row.get(5),
            quantity: crate::core::pg_row::pg_f64(row, 6),
            status: row.get(7),
            created_at: row.get(8),
            completed_at: row.get(9),
            assembled_by: row.get(10),
            checked_by: row.get(11),
            observations: row.get(12),
            erp_launched: row.try_get::<i32, _>(13).unwrap_or(0),
            quantity_assembled: row
                .try_get::<Option<f64>, _>(14)
                .ok()
                .flatten()
                .or_else(|| {
                    row.try_get::<Option<i32>, _>(14)
                        .ok()
                        .flatten()
                        .map(|v| v as f64)
                }),
        })
        .collect())
}

pub async fn list_vira_orders(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    match fetch_vira_orders(pool).await {
        Ok(list) => (StatusCode::OK, Json(list)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

pub async fn create_vira_order(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::CreateViraOrderRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let status = payload.status.unwrap_or_else(|| "PENDING".to_string());
    let qty_assembled = payload.quantity_assembled.unwrap_or(payload.quantity);

    let last_id: i64 = match sqlx::query_scalar(
        "INSERT INTO vira_ordens (
            order_number, de_produto_codigo, de_produto_descricao,
            para_produto_codigo, para_produto_descricao, quantity, status,
            created_at, assembled_by, checked_by, observations, erp_launched, quantity_assembled
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12)
         RETURNING id",
    )
    .bind(&payload.order_number)
    .bind(&payload.de_produto_codigo)
    .bind(&payload.de_produto_codigo)
    .bind(&payload.para_produto_codigo)
    .bind(&payload.para_produto_codigo)
    .bind(payload.quantity)
    .bind(&status)
    .bind(&created_at)
    .bind(&payload.assembled_by)
    .bind(&payload.checked_by)
    .bind(&payload.observations)
    .bind(qty_assembled)
    .fetch_one(pool)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Erro ao criar ordem de vira: {}", e) })),
            )
                .into_response();
        }
    };

    let _ = sqlx::query(
        "UPDATE vira_ordens
         SET de_produto_descricao = COALESCE(
                 (SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = TRIM(REPLACE(de_produto_codigo, '\"', '')) LIMIT 1),
                 de_produto_codigo),
             para_produto_descricao = COALESCE(
                 (SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = TRIM(REPLACE(para_produto_codigo, '\"', '')) LIMIT 1),
                 para_produto_codigo)
         WHERE id = $1",
    )
    .bind(last_id)
    .execute(pool)
    .await;

    (
        StatusCode::CREATED,
        Json(json!({ "id": last_id, "message": "Ordem de vira criada" })),
    )
        .into_response()
}

pub async fn update_vira_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<crate::models::UpdateViraOrderRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    let mut qb = sqlx::QueryBuilder::new("UPDATE vira_ordens SET ");
    let mut has_set = false;
    let mut separated = qb.separated(", ");

    if let Some(ref status) = payload.status {
        separated.push("status = ");
        separated.push_bind_unseparated(status);
        has_set = true;
        if status == "COMPLETED" {
            let completed_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            separated.push("completed_at = ");
            separated.push_bind_unseparated(completed_at);
        } else if status == "PENDING" {
            separated.push("completed_at = NULL");
        }
    }
    if let Some(ref assembled_by) = payload.assembled_by {
        separated.push("assembled_by = ");
        separated.push_bind_unseparated(assembled_by);
        has_set = true;
    }
    if let Some(ref checked_by) = payload.checked_by {
        separated.push("checked_by = ");
        separated.push_bind_unseparated(checked_by);
        has_set = true;
    }
    if let Some(ref observations) = payload.observations {
        separated.push("observations = ");
        separated.push_bind_unseparated(observations);
        has_set = true;
    }
    if let Some(erp_launched) = payload.erp_launched {
        separated.push("erp_launched = ");
        separated.push_bind_unseparated(erp_launched);
        has_set = true;
    }
    if let Some(quantity_assembled) = payload.quantity_assembled {
        separated.push("quantity_assembled = ");
        separated.push_bind_unseparated(quantity_assembled);
        has_set = true;
    }

    if !has_set {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Nenhum campo para atualizar" })),
        )
            .into_response();
    }

    qb.push(" WHERE id = ");
    qb.push_bind(id);

    match qb.build().execute(pool).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "message": "Ordem de vira atualizada" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Erro ao atualizar: {}", e) })),
        )
            .into_response(),
    }
}

pub async fn delete_vira_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match sqlx::query("DELETE FROM vira_ordens WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
    {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({ "message": "Ordem de vira excluída" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_next_vira_order_number(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let last_order: Option<String> = sqlx::query_scalar(
        "SELECT order_number FROM vira_ordens ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let next_order = compute_next_order_number(last_order, "V-1001");
    (StatusCode::OK, Json(json!({ "nextOrderNumber": next_order }))).into_response()
}
