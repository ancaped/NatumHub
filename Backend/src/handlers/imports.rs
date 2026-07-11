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

use crate::handlers::producao::fetch_calculation_data;
use crate::handlers::producao::check_lote_errors;


// 4. POST /api/import/faturamento
pub async fn import_faturamento(
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
        None => return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo 'file' não encontrado no formulário" }))
        ).into_response(),
    };

    // Create temp file
    let temp_path = std::env::temp_dir().join("temp_faturamento.xlsx");
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) }))
        ).into_response(),
    };

    if let Err(e) = file.write_all(&bytes) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo temporário: {}", e) }))
        ).into_response();
    }

    // Connect and parse
    let mut conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro de conexão com o banco: {}", e) }))
        ).into_response(),
    };

    match crate::modules::compras::planejamento::parser::parse_faturamento_excel(&temp_path, &mut conn) {
        Ok(count) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "faturamento.xlsx".to_string());
            let _ = state.db.record_import("faturamento", &file_name_str, count as i64, "success",
                Some(&format!("{} produtos atualizados", count)));
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "imported": count, "message": format!("Faturamento importado: {} produtos atualizados", count) }))
            ).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "faturamento.xlsx".to_string());
            let _ = state.db.record_import("faturamento", &file_name_str, 0, "error", Some(&e.to_string()));
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Erro ao processar planilha Excel: {}", e) }))
            ).into_response()
        }
    }
}

// 5. POST /api/import/levantamento
pub async fn import_levantamento(
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
        None => return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo 'file' não encontrado no formulário" }))
        ).into_response(),
    };

    // Create temp file
    let temp_path = std::env::temp_dir().join("temp_levantamento.xlsx");
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) }))
        ).into_response(),
    };

    if let Err(e) = file.write_all(&bytes) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo temporário: {}", e) }))
        ).into_response();
    }

    // Connect and parse
    let mut conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro de conexão com o banco: {}", e) }))
        ).into_response(),
    };

    match crate::modules::compras::planejamento::parser::parse_levantamento_excel(&temp_path, &mut conn) {
        Ok(count) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "levantamento.xlsx".to_string());
            let _ = state.db.record_import("levantamento", &file_name_str, count as i64, "success",
                Some(&format!("{} produtos atualizados", count)));
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "imported": count, "message": format!("Levantamento importado: {} produtos atualizados", count) }))
            ).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "levantamento.xlsx".to_string());
            let _ = state.db.record_import("levantamento", &file_name_str, 0, "error", Some(&e.to_string()));
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Erro ao processar planilha Excel: {}", e) }))
            ).into_response()
        }
    }
}

// 7. POST /api/import/kits
pub async fn import_kits(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut file_data: Option<axum::body::Bytes> = None;
    
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            if let Ok(bytes) = field.bytes().await {
                file_data = Some(bytes);
                break;
            }
        }
    }

    let bytes = match file_data {
        Some(b) => b,
        None => return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Arquivo 'file' não encontrado no formulário" }))
        ).into_response(),
    };

    let temp_path = std::env::temp_dir().join("temp_kits.xlsx");
    let mut file = match File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao criar arquivo temporário: {}", e) }))
        ).into_response(),
    };

    if let Err(e) = file.write_all(&bytes) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao escrever arquivo temporário: {}", e) }))
        ).into_response();
    }

    let mut conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro de conexão com o banco: {}", e) }))
        ).into_response(),
    };

    match crate::modules::compras::planejamento::parser::parse_kits_excel(&temp_path, &mut conn) {
        Ok(count) => {
            let _ = std::fs::remove_file(temp_path);
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "imported": count, "message": format!("Composição de kits importada: {} relações salvas", count) }))
            ).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(temp_path);
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Erro ao processar planilha de kits: {}", e) }))
            ).into_response()
        }
    }
}

// 7b. POST /api/import/sync
pub async fn execute_erp_sync(
    state: Arc<AppState>,
    source_label: &str,
) -> Result<crate::core::legacy_db::SyncResult, String> {
    if !crate::core::app_config::is_sync_master() {
        return Err("Sync ERP permitido apenas no PC principal (servidor).".to_string());
    }

    let db_path = state.db.db_path().to_string();

    match crate::core::db_backup::backup_database(&db_path) {
        Ok(path) => println!("Backup pré-sync criado: {}", path.display()),
        Err(e) => eprintln!("Aviso: falha no backup pré-sync: {}", e),
    }

    match crate::core::legacy_db::sync_from_sql_server(&db_path).await {
        Ok(res) => {
            let total_records = (res.products
                + res.items
                + res.suppliers
                + res.invoices
                + res.formulations
                + res.movements
                + res.purchase_orders
                + res.sales_orders) as i64;
            let detail_msg = format!(
                "Sincronizados: {} produtos, {} insumos/materiais, {} fornecedores, {} compras, {} consumos, {} receitas, {} movimentações, {} pedidos de compra, {} pedidos de venda",
                res.products,
                res.items,
                res.suppliers,
                res.invoices,
                res.consumption,
                res.formulations,
                res.movements,
                res.purchase_orders,
                res.sales_orders
            );
            let _ = state.db.record_import(
                "sync",
                source_label,
                total_records,
                "success",
                Some(&detail_msg),
            );
            let msg = format!(
                "{} produtos, {} insumos, {} receitas e {} pedidos de compra atualizados.",
                res.products, res.items, res.formulations, res.purchase_orders
            );
            crate::modules::geral::notifications::notify_config(
                &state,
                "success",
                "Sync ERP concluído",
                &msg,
                None,
            );
            Ok(res)
        }
        Err(e) => {
            let error_msg = e.to_string();
            let _ = crate::core::db_backup::restore_latest_backup(&db_path);
            let _ = state.db.record_import(
                "sync",
                "Banco SQL Server NATUM",
                0,
                "error",
                Some(&error_msg),
            );
            crate::modules::geral::notifications::notify_config(
                &state,
                "error",
                "Falha no sync ERP",
                &error_msg,
                None,
            );
            Err(format!(
                "Falha ao sincronizar com o banco de dados NATUM: {}. Certifique-se de que está conectado à rede local do servidor.",
                error_msg
            ))
        }
    }
}

pub async fn trigger_db_sync(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match execute_erp_sync(state, "Banco SQL Server NATUM").await {
        Ok(res) => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "imported": res.products,
                "details": {
                    "products": res.products,
                    "suppliers": res.suppliers,
                    "items": res.items,
                    "snapshots": res.snapshots,
                    "invoices": res.invoices,
                    "consumption": res.consumption,
                    "formulations": res.formulations,
                    "movements": res.movements,
                    "purchase_orders": res.purchase_orders
                },
                "message": format!("Sincronização concluída com sucesso! {} produtos, {} insumos/materiais, {} receitas e {} pedidos de compra atualizados.", res.products, res.items, res.formulations, res.purchase_orders)
            })),
        )
            .into_response(),
        Err(error_msg) => {
            let status = if error_msg.contains("apenas no PC master") {
                StatusCode::FORBIDDEN
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status, Json(json!({ "error": error_msg }))).into_response()
        }
    }
}

pub fn clean_product_code(code: &str) -> String {
    let mut s = code.trim().to_string();
    if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
        s.remove(0);
        s.pop();
    }
    if s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2 {
        s.remove(0);
        s.pop();
    }
    s.trim().to_string()
}

// GET /api/import/history
pub async fn get_import_history(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_import_history() {
        Ok(records) => (StatusCode::OK, Json(records)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar histórico: {}", e) }))).into_response(),
    }
}

// GET /api/import/status
pub async fn get_import_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_import_status() {
        Ok(status) => (StatusCode::OK, Json(status)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar status: {}", e) }))).into_response(),
    }
}

// POST /api/import/dump
pub async fn trigger_db_dump(
    State(_state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let dump_path = "../Saves/legacy_dump.db";
    match crate::core::legacy_db::create_database_dump(dump_path).await {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Falha ao gerar cópia do banco: {}", e) }))).into_response(),
    }
}
