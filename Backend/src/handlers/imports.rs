use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::fs::File;
use std::io::Write;
use std::sync::Arc;
use serde_json::json;
use crate::handlers::AppState;


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

    let pool = state.db.pool();
    match crate::modules::compras::planejamento::parser::parse_faturamento_excel(&temp_path, pool).await {
        Ok(count) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "faturamento.xlsx".to_string());
            let _ = state.db.record_import("faturamento", &file_name_str, count as i64, "success",
                Some(&format!("{} produtos atualizados", count))).await;
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "imported": count, "message": format!("Faturamento importado: {} produtos atualizados", count) }))
            ).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "faturamento.xlsx".to_string());
            let _ = state.db.record_import("faturamento", &file_name_str, 0, "error", Some(&e.to_string())).await;
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

    let pool = state.db.pool();
    match crate::modules::compras::planejamento::parser::parse_levantamento_excel(&temp_path, pool).await {
        Ok(count) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "levantamento.xlsx".to_string());
            let _ = state.db.record_import("levantamento", &file_name_str, count as i64, "success",
                Some(&format!("{} produtos atualizados", count))).await;
            (
                StatusCode::OK,
                Json(json!({ "status": "success", "imported": count, "message": format!("Levantamento importado: {} produtos atualizados", count) }))
            ).into_response()
        }
        Err(e) => {
            let _ = std::fs::remove_file(&temp_path);
            let file_name_str = file_name.clone().unwrap_or_else(|| "levantamento.xlsx".to_string());
            let _ = state.db.record_import("levantamento", &file_name_str, 0, "error", Some(&e.to_string())).await;
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

    let pool = state.db.pool();
    match crate::modules::compras::planejamento::parser::parse_kits_excel(&temp_path, pool).await {
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

// 7b. POST /api/import/sync?mode=incremental|full
pub async fn execute_erp_sync(
    state: Arc<AppState>,
    source_label: &str,
    mode: crate::core::legacy_db::SyncMode,
) -> Result<crate::core::legacy_db::SyncResult, String> {
    let pool = state.db.pool();
    let sync_lock_acquired = match crate::core::pg_db::try_acquire_daily_sync(pool).await {
        Ok(true) => true,
        Ok(false) => return Err(crate::core::pg_db::SYNC_ALREADY_RUNNING.to_string()),
        Err(e) => return Err(e),
    };

    let pool = state.db.pool();

    eprintln!(
        "[ERP Sync] Iniciando sync mode={} (PostgreSQL).",
        mode.as_str()
    );

    let sync_result = crate::core::legacy_db::sync_from_sql_server(pool, mode).await;

    if sync_lock_acquired {
        match &sync_result {
            Ok(_) => {
                if let Err(e) = crate::core::pg_db::mark_daily_sync_complete(pool).await {
                    eprintln!("[ERP Sync] Falha ao marcar sync concluído: {}", e);
                }
            }
            Err(_) => {
                let _ = crate::core::pg_db::release_daily_sync(pool).await;
            }
        }
    }

    match sync_result {
        Ok(res) => {
            // Verificação já roda dentro de sync_from_sql_server (também no run_sync CLI).
            let verify_note = format!(
                " | estoque verify: checked={} repaired={}",
                res.stock_verified, res.stock_repaired
            );
            if res.stock_repaired > 0 {
                let body = format!(
                    "{} item(ns) corrigidos para bater com a tela do ERP (nQtdeEstoque).",
                    res.stock_repaired
                );
                crate::modules::geral::notifications::notify_config(
                    &state,
                    "warning",
                    "Estoque corrigido após sync",
                    &body,
                    None,
                );
                crate::modules::geral::notifications::notify(
                    &state,
                    crate::modules::geral::auth::modules_registry::MODULE_COMPRAS_MP,
                    "warning",
                    "Estoque corrigido após sync",
                    &body,
                    None,
                );
            }
            if res.stock_verified == 0 && res.snapshots > 0 {
                crate::modules::geral::notifications::notify_config(
                    &state,
                    "error",
                    "Falha na verificação de estoque",
                    "Sync gravou snapshots mas a conferência com nQtdeEstoque não rodou. Use o botão Verificar estoque em Configurações.",
                    None,
                );
            }

            let total_records = (res.products
                + res.items
                + res.suppliers
                + res.invoices
                + res.formulations
                + res.kit_composicao
                + res.movements
                + res.purchase_orders
                + res.sales_orders) as i64;
            let detail_msg = format!(
                "[{}] since={} — {} produtos, {} insumos/materiais, {} fornecedores, {} compras, {} consumos, {} receitas, {} kits, {} movimentações, {} pedidos de compra, {} pedidos de venda{}",
                res.mode,
                res.since,
                res.products,
                res.items,
                res.suppliers,
                res.invoices,
                res.consumption,
                res.formulations,
                res.kit_composicao,
                res.movements,
                res.purchase_orders,
                res.sales_orders,
                verify_note
            );
            let _ = state.db.record_import(
                "sync",
                source_label,
                total_records,
                "success",
                Some(&detail_msg),
            ).await;
            let msg = format!(
                "Sync {} (desde {}): {} produtos, {} insumos, {} movimentações.{}",
                res.mode, res.since, res.products, res.items, res.movements, verify_note
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
            eprintln!("[ERP Sync] Falha: {error_msg}");
            let _ = state.db.record_import(
                "sync",
                "Banco SQL Server NATUM",
                0,
                "error",
                Some(&error_msg),
            ).await;
            crate::modules::geral::notifications::notify_config(
                &state,
                "error",
                "Falha no sync ERP",
                &error_msg,
                None,
            );
            Err(format!(
                "Falha ao sincronizar com o ERP NATUM (SQL Server): {}. Verifique host/porta SQL e a conexão com o Supabase (Session pooler :5432).",
                error_msg
            ))
        }
    }
}

#[derive(serde::Deserialize, Default)]
pub struct SyncQuery {
    pub mode: Option<String>,
}

pub async fn trigger_db_sync(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(q): axum::extract::Query<SyncQuery>,
) -> impl IntoResponse {
    let mode = crate::core::legacy_db::SyncMode::parse(q.mode.as_deref());
    match execute_erp_sync(state, "Banco SQL Server NATUM", mode).await {
        Ok(res) => (
            StatusCode::OK,
            Json(json!({
                "status": "success",
                "mode": res.mode,
                "since": res.since,
                "imported": res.products,
                "details": {
                    "products": res.products,
                    "suppliers": res.suppliers,
                    "items": res.items,
                    "snapshots": res.snapshots,
                    "invoices": res.invoices,
                    "consumption": res.consumption,
                    "formulations": res.formulations,
                    "kit_composicao": res.kit_composicao,
                    "movements": res.movements,
                    "purchase_orders": res.purchase_orders,
                    "sales_orders": res.sales_orders
                },
                "message": format!(
                    "Sincronização {} concluída (desde {})! {} produtos, {} insumos, {} movimentações.",
                    res.mode, res.since, res.products, res.items, res.movements
                )
            })),
        )
            .into_response(),
        Err(error_msg) => {
            let status = if error_msg == crate::core::pg_db::SYNC_ALREADY_RUNNING {
                StatusCode::CONFLICT
            } else if error_msg.contains("apenas no PC master") {
                StatusCode::FORBIDDEN
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            let message = if error_msg == crate::core::pg_db::SYNC_ALREADY_RUNNING {
                "Sync já em andamento em outra instância.".to_string()
            } else {
                error_msg
            };
            (status, Json(json!({ "error": message }))).into_response()
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
    match state.db.get_import_history().await {
        Ok(records) => (StatusCode::OK, Json(records)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar histórico: {}", e) }))).into_response(),
    }
}

// GET /api/import/status
pub async fn get_import_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_import_status().await {
        Ok(status) => (StatusCode::OK, Json(status)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar status: {}", e) }))).into_response(),
    }
}

/// GET /api/import/sync-lock — se há sync ERP em andamento hoje.
pub async fn get_sync_lock_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match crate::core::pg_db::daily_sync_lock_status(state.db.pool()).await {
        Ok(body) => (StatusCode::OK, Json(body)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

/// POST /api/import/sync-lock/release — libera lock órfão (supervisor).
pub async fn release_sync_lock(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match crate::core::pg_db::force_release_daily_sync(state.db.pool()).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

// POST /api/import/dump
pub async fn trigger_db_dump(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let pool = state.db.pool();
    match crate::core::legacy_db::create_database_dump(pool).await {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Falha ao gerar cópia do banco: {}", e) }))).into_response(),
    }
}
