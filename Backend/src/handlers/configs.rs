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


// 1. GET /api/configs
pub async fn get_configs(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_line_configs() {
        Ok(configs) => (StatusCode::OK, Json(configs)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar configurações: {}", e) })),
        ).into_response(),
    }
}

// 2. PUT /api/configs
pub async fn update_config(
    State(state): State<Arc<AppState>>,
    Json(config): Json<LineConfig>,
) -> impl IntoResponse {
    match state.db.update_line_config(&config) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar configuração: {}", e) })),
        ).into_response(),
    }
}

// 2b. DELETE /api/configs/:prefix
pub async fn delete_config(
    State(state): State<Arc<AppState>>,
    Path(prefix): Path<String>,
) -> impl IntoResponse {
    if prefix == "DEFAULT" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "A linha DEFAULT não pode ser excluída" })),
        ).into_response();
    }
    match state.db.delete_line_config(&prefix) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao excluir linha: {}", e) })),
        ).into_response(),
    }
}

// 2c. GET /api/overrides
pub async fn get_overrides(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_all_overrides() {
        Ok(overrides) => (StatusCode::OK, Json(overrides)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao buscar overrides: {}", e) })),
        ).into_response(),
    }
}

// 3. POST /api/overrides
pub async fn save_override(
    State(state): State<Arc<AppState>>,
    Json(ovr): Json<ProductOverride>,
) -> impl IntoResponse {
    match state.db.save_override(&ovr) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar override: {}", e) })),
        ).into_response(),
    }
}

// 3b. POST /api/overrides/bulk
pub async fn save_override_bulk(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BulkOverrideRequest>,
) -> impl IntoResponse {
    match state.db.save_override_bulk(&req) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao salvar overrides em lote: {}", e) })),
        ).into_response(),
    }
}

// GET /api/lancamento/graduation-check
pub async fn get_graduation_candidates_handler(
    axum::extract::State(state): axum::extract::State<std::sync::Arc<AppState>>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro de conexão: {}", e) }))
        ).into_response(),
    };

    let global_limit: i64 = match state.db.get_setting("lancamento_meta_meses_global") {
        Ok(Some(val)) => val.parse().unwrap_or(6),
        _ => 6,
    };

    let query = "
        SELECT op.codigo, p.descricao, cl.nome_linha, op.lancamento_meta_meses, op.lancamento_data_inicio
        FROM overrides_produtos op
        JOIN produtos p ON op.codigo = p.codigo
        LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
        WHERE op.status_produto = 'lancamento'
    ";

    let mut stmt = match conn.prepare(query) {
        Ok(s) => s,
        Err(e) => return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("Erro ao preparar query: {}", e) }))
        ).into_response(),
    };

    let candidates_rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    });

    let mut candidates = Vec::new();

    if let Ok(rows) = candidates_rows {
        for r in rows {
            if let Ok((code, desc, line_name, meta, date_start)) = r {
                let limit = meta.unwrap_or(global_limit);
                let mut months_with_sales = 0;
                let count_query = "SELECT COUNT(*) FROM historico_faturamento WHERE codigo = ?1 AND quantidade > 0";
                if let Ok(count) = conn.query_row(count_query, params![code], |row| row.get::<_, i64>(0)) {
                    months_with_sales = count;
                }

                if months_with_sales >= limit {
                    candidates.push(serde_json::json!({
                        "codigo": code,
                        "descricao": desc,
                        "nome_linha": line_name.unwrap_or_else(|| "Geral".to_string()),
                        "meses_com_historico": months_with_sales,
                        "meta_meses": limit,
                        "lancamento_data_inicio": date_start,
                    }));
                }
            }
        }
    }

    (StatusCode::OK, Json(candidates)).into_response()
}
