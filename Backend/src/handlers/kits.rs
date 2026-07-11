use axum::{
    extract::{Multipart, Query, State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::sync::Arc;
use serde_json::json;
use rusqlite::params;

use crate::core::db::Db;
use crate::models::{
    BulkOverrideRequest, KitComponentDetail, KitCalculationResult, LineConfig, Product, ProductCalculationResult, ProductOverride, QueryParams, Stock,
    NewProducaoEntry, HistoryQueryParams,
    WatchConfig, NewKitComposicao,
};
use crate::modules::producao::gerenciamento::calculations::calculate_products;
use crate::handlers::AppState;

// Helper cross-imports
use crate::handlers::imports::clean_product_code;
use crate::handlers::producao::fetch_calculation_data;
use crate::handlers::producao::check_lote_errors;


// GET /api/kits/composicao
pub async fn list_kit_composicao(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_kit_composition_full() {
        Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao listar composição de kits: {}", e) }))).into_response(),
    }
}

// POST /api/kits/composicao
pub async fn add_kit_composicao_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<NewKitComposicao>,
) -> impl IntoResponse {
    if body.kit_codigo.trim().is_empty() || body.componente_codigo.trim().is_empty() {
        return (StatusCode::BAD_REQUEST,
            Json(json!({ "error": "kit_codigo e componente_codigo são obrigatórios" }))).into_response();
    }
    let qty = if body.quantidade < 1 { 1 } else { body.quantidade };
    match state.db.add_kit_composicao(&body.kit_codigo, &body.componente_codigo, qty) {
        Ok(_) => (StatusCode::CREATED, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao adicionar relação de kit: {}", e) }))).into_response(),
    }
}

// DELETE /api/kits/composicao/:kit/:comp
pub async fn delete_kit_composicao_handler(
    State(state): State<Arc<AppState>>,
    Path((kit, comp)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.db.delete_kit_composicao(&kit, &comp) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao excluir relação de kit: {}", e) }))).into_response(),
    }
}

// POST /api/kits/composicao/upload (re-import xlsx, replaces all)
pub async fn upload_kit_composicao(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
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
        None => return (StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo não encontrado no formulário" }))).into_response(),
    };
    let temp_path = std::env::temp_dir().join("temp_kits_upload.xlsx");
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) }))).into_response(),
    };
    if let Err(e) = file.write_all(&bytes) {
        return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo: {}", e) }))).into_response();
    }
    // Clear existing and re-import
    if let Err(e) = state.db.delete_all_kit_composicao() {
        return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao limpar composições existentes: {}", e) }))).into_response();
    }
    let mut conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro de conexão: {}", e) }))).into_response(),
    };
    match crate::modules::compras::planejamento::parser::parse_kits_excel(&temp_path, &mut conn) {
        Ok(count) => {
            let _ = std::fs::remove_file(&temp_path);
            let fname = file_name.unwrap_or_else(|| "kits.xlsx".to_string());
            let _ = state.db.record_import("kits", &fname, count as i64, "success",
                Some(&format!("{} relações importadas", count)));
            (StatusCode::OK, Json(json!({ "status": "success", "imported": count,
                "message": format!("Composição de kits importada: {} relações", count) }))).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Erro ao processar planilha: {}", e) }))).into_response()
        }
    }
}

pub async fn list_kit_orders(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, order_number, kit_product_code, kit_product_description, quantity, 
                status, created_at, completed_at, assembled_by, checked_by, observations, 
                erp_launched, components_lotes, quantity_assembled 
         FROM kit_assembly_orders 
         ORDER BY id DESC"
    ) {
        Ok(s) => s,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() }))
        ).into_response(),
    };

    let rows = stmt.query_map([], |row| {
        Ok(crate::models::KitAssemblyOrder {
            id: row.get(0)?,
            order_number: row.get(1)?,
            kit_product_code: row.get(2)?,
            kit_product_description: row.get(3)?,
            quantity: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            completed_at: row.get(7)?,
            assembled_by: row.get(8)?,
            checked_by: row.get(9)?,
            observations: row.get(10)?,
            erp_launched: row.get(11)?,
            components_lotes: row.get(12)?,
            quantity_assembled: row.get(13)?,
        })
    });

    let mut orders = Vec::new();
    if let Ok(iter) = rows {
        for r in iter {
            if let Ok(order) = r {
                orders.push(order);
            }
        }
    }

    (StatusCode::OK, Json(orders)).into_response()
}

pub async fn create_kit_order(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::CreateKitOrderRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let status = payload.status.unwrap_or_else(|| "PENDING".to_string());

    let res = conn.execute(
        "INSERT INTO kit_assembly_orders (
            order_number, kit_product_code, kit_product_description, quantity, status, 
            created_at, assembled_by, checked_by, observations, erp_launched, components_lotes,
            quantity_assembled
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11)",
        params![
            payload.order_number,
            payload.kit_product_code,
            payload.kit_product_description,
            payload.quantity,
            status,
            created_at,
            payload.assembled_by,
            payload.checked_by,
            payload.observations,
            payload.components_lotes,
            payload.quantity_assembled.unwrap_or(payload.quantity)
        ],
    );

    match res {
        Ok(_) => {
            let last_id = conn.last_insert_rowid();
            (StatusCode::CREATED, Json(serde_json::json!({ "id": last_id, "message": "Ordem de montagem criada" }))).into_response()
        }
        Err(e) => {
            (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao criar ordem de montagem: {}", e) }))).into_response()
        }
    }
}

pub async fn update_kit_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<crate::models::UpdateKitOrderRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    let mut completed_at: Option<String> = None;
    if let Some(ref status) = payload.status {
        if status == "COMPLETED" {
            completed_at = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
        }
    }

    let mut query = "UPDATE kit_assembly_orders SET ".to_string();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut sets = Vec::new();
    let mut param_idx = 1;

    if let Some(ref status) = payload.status {
        sets.push(format!("status = ?{}", param_idx));
        params_vec.push(Box::new(status.clone()));
        param_idx += 1;

        if status == "COMPLETED" {
            sets.push(format!("completed_at = ?{}", param_idx));
            params_vec.push(Box::new(completed_at.clone()));
            param_idx += 1;
        } else if status == "PENDING" {
            sets.push("completed_at = NULL".to_string());
        }
    }

    if let Some(ref assembled_by) = payload.assembled_by {
        sets.push(format!("assembled_by = ?{}", param_idx));
        params_vec.push(Box::new(assembled_by.clone()));
        param_idx += 1;
    }

    if let Some(ref checked_by) = payload.checked_by {
        sets.push(format!("checked_by = ?{}", param_idx));
        params_vec.push(Box::new(checked_by.clone()));
        param_idx += 1;
    }

    if let Some(ref observations) = payload.observations {
        sets.push(format!("observations = ?{}", param_idx));
        params_vec.push(Box::new(observations.clone()));
        param_idx += 1;
    }

    if let Some(erp_launched) = payload.erp_launched {
        sets.push(format!("erp_launched = ?{}", param_idx));
        params_vec.push(Box::new(erp_launched));
        param_idx += 1;
    }

    if let Some(ref components_lotes) = payload.components_lotes {
        sets.push(format!("components_lotes = ?{}", param_idx));
        params_vec.push(Box::new(components_lotes.clone()));
        param_idx += 1;
    }

    if let Some(quantity_assembled) = payload.quantity_assembled {
        sets.push(format!("quantity_assembled = ?{}", param_idx));
        params_vec.push(Box::new(quantity_assembled));
        param_idx += 1;
    }

    if sets.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Nenhum campo para atualizar" }))).into_response();
    }

    query.push_str(&sets.join(", "));
    query.push_str(&format!(" WHERE id = ?{}", param_idx));
    params_vec.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    match conn.execute(&query, rusqlite::params_from_iter(params_refs)) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Ordem de montagem atualizada" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao atualizar: {}", e) }))).into_response(),
    }
}

pub async fn delete_kit_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    match conn.execute("DELETE FROM kit_assembly_orders WHERE id = ?1", params![id]) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Ordem de montagem excluída" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao excluir: {}", e) }))).into_response(),
    }
}

pub async fn get_next_kit_order_number(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao conectar ao banco de dados: {}", e) }))
        ).into_response(),
    };

    let last_order: Option<String> = conn.query_row(
        "SELECT order_number FROM kit_assembly_orders ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0)
    ).ok();

    let next_order = match last_order {
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
        None => "1001".to_string(),
    };

    (StatusCode::OK, Json(serde_json::json!({ "nextOrderNumber": next_order }))).into_response()
}

pub async fn list_vira_composicao(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let mut stmt = match conn.prepare(
        "SELECT vc.de_produto_codigo, pd.descricao as de_desc,
                vc.para_produto_codigo, pp.descricao as para_desc,
                vc.quantidade
         FROM vira_composicao vc
         JOIN produtos pd ON TRIM(REPLACE(vc.de_produto_codigo, '\"', '')) = TRIM(REPLACE(pd.codigo, '\"', ''))
         JOIN produtos pp ON TRIM(REPLACE(vc.para_produto_codigo, '\"', '')) = TRIM(REPLACE(pp.codigo, '\"', ''))
         ORDER BY pd.descricao"
    ) {
        Ok(s) => s,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() }))
        ).into_response(),
    };

    let rows = stmt.query_map([], |row| {
        Ok(crate::models::ViraComposicaoRow {
            de_produto_codigo: row.get(0)?,
            de_produto_descricao: row.get(1)?,
            para_produto_codigo: row.get(2)?,
            para_produto_descricao: row.get(3)?,
            quantidade: row.get(4)?,
        })
    });

    let mut list = Vec::new();
    if let Ok(iter) = rows {
        for r in iter {
            if let Ok(row) = r {
                list.push(row);
            }
        }
    }

    (StatusCode::OK, Json(list)).into_response()
}

pub async fn add_vira_composicao(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::NewViraComposicao>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let res = conn.execute(
        "INSERT INTO vira_composicao (de_produto_codigo, para_produto_codigo, quantidade) 
         VALUES (?1, ?2, ?3)
         ON CONFLICT(de_produto_codigo, para_produto_codigo) DO UPDATE SET quantidade = excluded.quantidade",
        params![payload.de_produto_codigo, payload.para_produto_codigo, payload.quantidade],
    );

    match res {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::json!({ "message": "Composição de vira adicionada" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn delete_vira_composicao(
    State(state): State<Arc<AppState>>,
    Path((de, para)): Path<(String, String)>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    match conn.execute(
        "DELETE FROM vira_composicao WHERE de_produto_codigo = ?1 AND para_produto_codigo = ?2",
        params![de, para],
    ) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Composição de vira excluída" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn list_vira_orders(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, order_number, de_produto_codigo, de_produto_descricao,
                para_produto_codigo, para_produto_descricao, quantity, status,
                created_at, completed_at, assembled_by, checked_by, observations,
                erp_launched, quantity_assembled
         FROM vira_ordens
         ORDER BY id DESC"
    ) {
        Ok(s) => s,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() }))
        ).into_response(),
    };

    let rows = stmt.query_map([], |row| {
        Ok(crate::models::ViraOrder {
            id: row.get(0)?,
            order_number: row.get(1)?,
            de_produto_codigo: row.get(2)?,
            de_produto_descricao: row.get(3)?,
            para_produto_codigo: row.get(4)?,
            para_produto_descricao: row.get(5)?,
            quantity: row.get(6)?,
            status: row.get(7)?,
            created_at: row.get(8)?,
            completed_at: row.get(9)?,
            assembled_by: row.get(10)?,
            checked_by: row.get(11)?,
            observations: row.get(12)?,
            erp_launched: row.get(13)?,
            quantity_assembled: row.get(14)?,
        })
    });

    let mut list = Vec::new();
    if let Ok(iter) = rows {
        for r in iter {
            if let Ok(row) = r {
                list.push(row);
            }
        }
    }

    (StatusCode::OK, Json(list)).into_response()
}

pub async fn create_vira_order(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<crate::models::CreateViraOrderRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let status = payload.status.unwrap_or_else(|| "PENDING".to_string());

    let res = conn.execute(
        "INSERT INTO vira_ordens (
            order_number, de_produto_codigo, de_produto_descricao,
            para_produto_codigo, para_produto_descricao, quantity, status,
            created_at, assembled_by, checked_by, observations, erp_launched, quantity_assembled
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12)",
        params![
            payload.order_number,
            payload.de_produto_codigo,
            payload.de_produto_codigo, // default desc to code
            payload.para_produto_codigo,
            payload.para_produto_codigo, // default desc to code
            payload.quantity,
            status,
            created_at,
            payload.assembled_by,
            payload.checked_by,
            payload.observations,
            payload.quantity_assembled.unwrap_or(payload.quantity)
        ],
    );

    match res {
        Ok(_) => {
            let last_id = conn.last_insert_rowid();
            
            // Post-process: update real product descriptions
            let _ = conn.execute(
                "UPDATE vira_ordens 
                 SET de_produto_descricao = COALESCE((SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = TRIM(REPLACE(de_produto_codigo, '\"', '')) LIMIT 1), de_produto_codigo),
                     para_produto_descricao = COALESCE((SELECT descricao FROM produtos WHERE TRIM(REPLACE(codigo, '\"', '')) = TRIM(REPLACE(para_produto_codigo, '\"', '')) LIMIT 1), para_produto_codigo)
                 WHERE id = ?1",
                params![last_id]
            );

            (StatusCode::CREATED, Json(serde_json::json!({ "id": last_id, "message": "Ordem de vira criada" }))).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao criar ordem de vira: {}", e) }))).into_response(),
    }
}

pub async fn update_vira_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<crate::models::UpdateViraOrderRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let mut completed_at: Option<String> = None;
    if let Some(ref status) = payload.status {
        if status == "COMPLETED" {
            completed_at = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
        }
    }

    let mut query = "UPDATE vira_ordens SET ".to_string();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut sets = Vec::new();
    let mut param_idx = 1;

    if let Some(ref status) = payload.status {
        sets.push(format!("status = ?{}", param_idx));
        params_vec.push(Box::new(status.clone()));
        param_idx += 1;

        if status == "COMPLETED" {
            sets.push(format!("completed_at = ?{}", param_idx));
            params_vec.push(Box::new(completed_at.clone()));
            param_idx += 1;
        } else if status == "PENDING" {
            sets.push("completed_at = NULL".to_string());
        }
    }

    if let Some(ref assembled_by) = payload.assembled_by {
        sets.push(format!("assembled_by = ?{}", param_idx));
        params_vec.push(Box::new(assembled_by.clone()));
        param_idx += 1;
    }

    if let Some(ref checked_by) = payload.checked_by {
        sets.push(format!("checked_by = ?{}", param_idx));
        params_vec.push(Box::new(checked_by.clone()));
        param_idx += 1;
    }

    if let Some(ref observations) = payload.observations {
        sets.push(format!("observations = ?{}", param_idx));
        params_vec.push(Box::new(observations.clone()));
        param_idx += 1;
    }

    if let Some(erp_launched) = payload.erp_launched {
        sets.push(format!("erp_launched = ?{}", param_idx));
        params_vec.push(Box::new(erp_launched));
        param_idx += 1;
    }

    if let Some(quantity_assembled) = payload.quantity_assembled {
        sets.push(format!("quantity_assembled = ?{}", param_idx));
        params_vec.push(Box::new(quantity_assembled));
        param_idx += 1;
    }

    if sets.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Nenhum campo para atualizar" }))).into_response();
    }

    query.push_str(&sets.join(", "));
    query.push_str(&format!(" WHERE id = ?{}", param_idx));
    params_vec.push(Box::new(id));

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    match conn.execute(&query, rusqlite::params_from_iter(params_refs)) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Ordem de vira atualizada" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Erro ao atualizar: {}", e) }))).into_response(),
    }
}

pub async fn delete_vira_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    match conn.execute("DELETE FROM vira_ordens WHERE id = ?1", params![id]) {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "message": "Ordem de vira excluída" }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

pub async fn get_next_vira_order_number(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de banco: {}", e) }))
        ).into_response(),
    };

    let last_order: Option<String> = conn.query_row(
        "SELECT order_number FROM vira_ordens ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0)
    ).ok();

    let next_order = match last_order {
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
        None => "V-1001".to_string(),
    };

    (StatusCode::OK, Json(serde_json::json!({ "nextOrderNumber": next_order }))).into_response()
}
