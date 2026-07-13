use axum::{
    extract::{State, Path},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use serde_json::json;

use crate::handlers::AppState;
use crate::models::{BulkOverrideRequest, LineConfig, ProductOverride};


// 1. GET /api/configs
pub async fn get_configs(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_line_configs().await {
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
    match state.db.update_line_config(&config).await {
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
    match state.db.delete_line_config(&prefix).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Erro ao excluir linha: {}", e) })),
        ).into_response(),
    }
}

// 2c. GET /api/overrides
pub async fn get_overrides(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_all_overrides().await {
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
    match state.db.save_override(&ovr).await {
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
    match state.db.save_override_bulk(&req).await {
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
    let pool = state.db.pool();

    let global_limit: i64 = match state.db.get_setting("lancamento_meta_meses_global").await {
        Ok(Some(val)) => val.parse().unwrap_or(6),
        _ => 6,
    };

    let rows = match sqlx::query(
        "SELECT op.codigo, p.descricao, cl.nome_linha, op.lancamento_meta_meses, op.lancamento_data_inicio
         FROM overrides_produtos op
         JOIN produtos p ON op.codigo = p.codigo
         LEFT JOIN config_linhas cl ON p.linha_prefix = cl.linha_prefix
         WHERE op.status_produto = 'lancamento'",
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Erro ao buscar candidatos: {}", e) })),
            )
                .into_response();
        }
    };

    let mut candidates = Vec::new();

    for row in rows {
        use sqlx::Row;
        let code: String = row.get(0);
        let desc: String = row.get(1);
        let line_name: Option<String> = row.get(2);
        let meta: Option<i64> = crate::core::pg_row::pg_opt_i64(&row, 3);
        let date_start: Option<String> = row.get(4);

        let limit = meta.unwrap_or(global_limit);
        let months_with_sales: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM historico_faturamento WHERE codigo = $1 AND quantidade > 0",
        )
        .bind(&code)
        .fetch_one(pool)
        .await
        .unwrap_or(0);

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

    (StatusCode::OK, Json(candidates)).into_response()
}
