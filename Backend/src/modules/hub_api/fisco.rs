use axum::{
    extract::{Path, State},
    response::IntoResponse,
    routing::{delete, get},
    Json, Router,
};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::{FiscoQuimicaPattern, FiscoQuimicaAgent, FiscoQuimicaAnalysis};
use crate::lab_queries::*;
use crate::modules::hub_api::util::{ok_json, ok_status, with_pool};

async fn get_patterns_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_fisco_quimica_patterns_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_pattern_handler(State(state): State<Arc<AppState>>, Json(pattern): Json<FiscoQuimicaPattern>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_fisco_quimica_pattern_query(pool, &pattern)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_pattern_handler(State(state): State<Arc<AppState>>, Path(code): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_fisco_quimica_pattern_query(pool, &code)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_agents_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_fisco_quimica_agents_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_agent_handler(State(state): State<Arc<AppState>>, Json(agent): Json<FiscoQuimicaAgent>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_fisco_quimica_agent_query(pool, &agent)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_agent_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_fisco_quimica_agent_query(pool, &id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_all_fisco_products_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let rows = sqlx::query(
        "SELECT codigo, COALESCE(descricao, '') FROM produtos ORDER BY codigo ASC"
    )
    .fetch_all(pool)
    .await;

    match rows {
        Ok(r) => {
            use sqlx::Row;
            let items: Vec<serde_json::Value> = r
                .into_iter()
                .map(|row| {
                    let codigo: String = row.get(0);
                    let descricao: String = row.get(1);
                    serde_json::json!({
                        "codigo": codigo,
                        "descricao": descricao
                    })
                })
                .collect();
            ok_json(items).into_response()
        }
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn get_analyses_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_fisco_quimica_analyses_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_analysis_handler(State(state): State<Arc<AppState>>, Json(analysis): Json<FiscoQuimicaAnalysis>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_fisco_quimica_analysis_query(pool, &analysis)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_analysis_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_fisco_quimica_analysis_query(pool, &id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_config_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_fisco_config_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_config_handler(State(state): State<Arc<AppState>>, Json(config): Json<serde_json::Value>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_config_fisco_query(pool, &config)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct ErpLotesQuery {
    pub search: Option<String>,
    pub status_laudo: Option<String>,
    pub status_erp: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, serde::Serialize)]
pub struct FiscoErpLoteItem {
    pub lote: String,
    pub product_code: String,
    pub product_name: String,
    pub qty_kg: f64,
    pub date_erp: String,
    pub status_erp: String,
    pub fabricated_by: String,
    pub authorized_by: String,
    pub unidades: f64,
    pub d_pesado: Option<String>,
    pub d_envase: Option<String>,
    pub ph_erp: Option<f64>,
    pub viscosidade_erp: Option<f64>,
    pub densidade_erp: Option<f64>,
    pub viscosidade_24h_erp: Option<f64>,
    pub responsavel_cq_erp: Option<String>,
    pub resultado_cq_erp: Option<String>,
    pub data_inspecao_erp: Option<String>,
    pub observacoes_erp: Option<String>,
    pub has_laudo_erp: bool,
    pub has_laudo_hub: bool,
    pub has_laudo: bool,
    pub laudo_id: Option<String>,
    pub laudo_date: Option<String>,
    pub technician: Option<String>,
    pub ph_measured: Option<f64>,
    pub viscosity_measured: Option<f64>,
    pub density_measured: Option<f64>,
    pub fraction_weight: Option<f64>,
    pub has_adjustment: Option<bool>,
}

#[derive(Debug, serde::Serialize)]
pub struct FiscoErpLoteInsumo {
    pub item_code: String,
    pub item_description: String,
    pub unit: Option<String>,
    pub quantity: f64,
    pub date: String,
    pub user: Option<String>,
    pub justificativa: Option<String>,
}

async fn get_erp_lotes_handler(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<ErpLotesQuery>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(50).clamp(1, 500);
    let offset = (page - 1) * limit;

    let search_term = params.search.as_deref().unwrap_or("").trim().to_lowercase();
    let status_laudo = params.status_laudo.as_deref().unwrap_or("ALL").to_lowercase();
    let date_from = params.date_from.as_deref().unwrap_or("").trim();
    let date_to = params.date_to.as_deref().unwrap_or("").trim();

    // 1. Stats query across all lotes
    let stats = {
        let mut sqb = sqlx::QueryBuilder::new(
            r#"
            SELECT 
                COUNT(*) AS total_lotes,
                COUNT(CASE WHEN (el.ph IS NOT NULL OR el.viscosidade IS NOT NULL OR el.densidade IS NOT NULL OR el.resultado IS NOT NULL) THEN 1 END) AS com_laudo_erp,
                COUNT(CASE WHEN (el.ph IS NULL AND el.viscosidade IS NULL AND el.densidade IS NULL AND el.resultado IS NULL) THEN 1 END) AS sem_laudo_erp,
                COUNT(fqa.id) AS com_laudo_hub,
                COALESCE(SUM(el.quantidade_kg), 0)::float8 AS total_kg
            FROM erp_lotes_laudos el
            LEFT JOIN LATERAL (
                SELECT id FROM fisco_quimica_analyses
                WHERE batch = el.lote OR batch = TRIM(el.lote)
                LIMIT 1
            ) fqa ON true
            WHERE 1=1
            "#
        );
        if !date_from.is_empty() {
            sqb.push(" AND el.data_lote >= ");
            sqb.push_bind(date_from);
        }
        if !date_to.is_empty() {
            sqb.push(" AND el.data_lote <= ");
            sqb.push_bind(date_to);
        }
        let row = sqb.build().fetch_optional(pool).await.ok().flatten();
        if let Some(r) = row {
            use sqlx::Row;
            let total_lotes: i64 = r.get(0);
            let com_laudo_erp: i64 = r.get(1);
            let sem_laudo_erp: i64 = r.get(2);
            let com_laudo_hub: i64 = r.get(3);
            let total_kg: f64 = r.get(4);
            serde_json::json!({
                "total_lotes": total_lotes,
                "com_laudo_erp": com_laudo_erp,
                "sem_laudo_erp": sem_laudo_erp,
                "com_laudo_hub": com_laudo_hub,
                "com_laudo": com_laudo_erp,
                "sem_laudo": sem_laudo_erp,
                "total_kg": total_kg
            })
        } else {
            serde_json::json!({
                "total_lotes": 0,
                "com_laudo_erp": 0,
                "sem_laudo_erp": 0,
                "com_laudo_hub": 0,
                "com_laudo": 0,
                "sem_laudo": 0,
                "total_kg": 0.0
            })
        }
    };

    // 2. Count query for current filters
    let mut cqb = sqlx::QueryBuilder::new(
        r#"
        SELECT COUNT(*)
        FROM erp_lotes_laudos el
        LEFT JOIN produtos p ON el.product_code = p.codigo
        LEFT JOIN fisco_quimica_analyses fqa ON fqa.batch = el.lote
        WHERE 1=1
        "#
    );

    if !search_term.is_empty() {
        let like = format!("%{}%", search_term);
        cqb.push(" AND (LOWER(el.lote) LIKE ");
        cqb.push_bind(like.clone());
        cqb.push(" OR LOWER(el.product_code) LIKE ");
        cqb.push_bind(like.clone());
        cqb.push(" OR LOWER(COALESCE(p.descricao, '')) LIKE ");
        cqb.push_bind(like.clone());
        cqb.push(" OR LOWER(COALESCE(el.fabricado_por, '')) LIKE ");
        cqb.push_bind(like.clone());
        cqb.push(" OR LOWER(COALESCE(el.autorizado_por, '')) LIKE ");
        cqb.push_bind(like.clone());
        cqb.push(" OR LOWER(COALESCE(el.responsavel, '')) LIKE ");
        cqb.push_bind(like.clone());
        cqb.push(" OR LOWER(COALESCE(el.resultado, '')) LIKE ");
        cqb.push_bind(like.clone());
        cqb.push(" OR LOWER(COALESCE(el.observacoes, '')) LIKE ");
        cqb.push_bind(like);
        cqb.push(")");
    }

    if status_laudo == "com_laudo_erp" || status_laudo == "com_laudo" {
        cqb.push(" AND (el.ph IS NOT NULL OR el.viscosidade IS NOT NULL OR el.densidade IS NOT NULL OR el.resultado IS NOT NULL)");
    } else if status_laudo == "sem_laudo_erp" || status_laudo == "sem_laudo" {
        cqb.push(" AND (el.ph IS NULL AND el.viscosidade IS NULL AND el.densidade IS NULL AND el.resultado IS NULL)");
    } else if status_laudo == "com_laudo_hub" {
        cqb.push(" AND fqa.id IS NOT NULL");
    } else if status_laudo == "sem_laudo_hub" {
        cqb.push(" AND fqa.id IS NULL");
    }

    if !date_from.is_empty() {
        cqb.push(" AND el.data_lote >= ");
        cqb.push_bind(date_from);
    }

    if !date_to.is_empty() {
        cqb.push(" AND el.data_lote <= ");
        cqb.push_bind(date_to);
    }

    let total: i64 = match cqb.build_query_scalar::<i64>().fetch_one(pool).await {
        Ok(t) => t,
        Err(_) => 0,
    };

    // 3. Data query
    let mut dqb = sqlx::QueryBuilder::new(
        r#"
        SELECT 
            el.lote,
            el.product_code,
            COALESCE(p.descricao, '') AS product_name,
            el.quantidade_kg::float8 AS qty_kg,
            COALESCE(el.data_lote, '') AS date_erp,
            COALESCE(el.fabricado_por, '') AS fabricated_by,
            COALESCE(el.autorizado_por, '') AS authorized_by,
            el.unidades::float8 AS unidades,
            el.data_pesado,
            el.data_envase,
            el.ph::float8 AS ph_erp,
            el.viscosidade::float8 AS viscosidade_erp,
            el.densidade::float8 AS densidade_erp,
            el.viscosidade_24h::float8 AS viscosidade_24h_erp,
            el.responsavel AS responsavel_cq_erp,
            el.resultado AS resultado_cq_erp,
            el.data_inspecao AS data_inspecao_erp,
            el.observacoes AS observacoes_erp,
            (el.ph IS NOT NULL OR el.viscosidade IS NOT NULL OR el.densidade IS NOT NULL OR el.resultado IS NOT NULL) AS has_laudo_erp,
            (fqa.id IS NOT NULL) AS has_laudo_hub,
            fqa.id AS laudo_id,
            fqa.analysis_date,
            fqa.technician,
            fqa.ph_measured::float8,
            fqa.viscosity_measured::float8,
            fqa.density_measured::float8,
            fqa.fraction_weight::float8,
            fqa.has_adjustment
        FROM erp_lotes_laudos el
        LEFT JOIN produtos p ON el.product_code = p.codigo
        LEFT JOIN fisco_quimica_analyses fqa ON fqa.batch = el.lote
        WHERE 1=1
        "#
    );

    if !search_term.is_empty() {
        let like = format!("%{}%", search_term);
        dqb.push(" AND (LOWER(el.lote) LIKE ");
        dqb.push_bind(like.clone());
        dqb.push(" OR LOWER(el.product_code) LIKE ");
        dqb.push_bind(like.clone());
        dqb.push(" OR LOWER(COALESCE(p.descricao, '')) LIKE ");
        dqb.push_bind(like.clone());
        dqb.push(" OR LOWER(COALESCE(el.fabricado_por, '')) LIKE ");
        dqb.push_bind(like.clone());
        dqb.push(" OR LOWER(COALESCE(el.autorizado_por, '')) LIKE ");
        dqb.push_bind(like.clone());
        dqb.push(" OR LOWER(COALESCE(el.responsavel, '')) LIKE ");
        dqb.push_bind(like.clone());
        dqb.push(" OR LOWER(COALESCE(el.resultado, '')) LIKE ");
        dqb.push_bind(like.clone());
        dqb.push(" OR LOWER(COALESCE(el.observacoes, '')) LIKE ");
        dqb.push_bind(like);
        dqb.push(")");
    }

    if status_laudo == "com_laudo_erp" || status_laudo == "com_laudo" {
        dqb.push(" AND (el.ph IS NOT NULL OR el.viscosidade IS NOT NULL OR el.densidade IS NOT NULL OR el.resultado IS NOT NULL)");
    } else if status_laudo == "sem_laudo_erp" || status_laudo == "sem_laudo" {
        dqb.push(" AND (el.ph IS NULL AND el.viscosidade IS NULL AND el.densidade IS NULL AND el.resultado IS NULL)");
    } else if status_laudo == "com_laudo_hub" {
        dqb.push(" AND fqa.id IS NOT NULL");
    } else if status_laudo == "sem_laudo_hub" {
        dqb.push(" AND fqa.id IS NULL");
    }

    if !date_from.is_empty() {
        dqb.push(" AND el.data_lote >= ");
        dqb.push_bind(date_from);
    }

    if !date_to.is_empty() {
        dqb.push(" AND el.data_lote <= ");
        dqb.push_bind(date_to);
    }

    dqb.push(" ORDER BY el.data_lote DESC, el.lote DESC");
    dqb.push(format!(" LIMIT {} OFFSET {}", limit, offset));

    let rows = match dqb.build().fetch_all(pool).await {
        Ok(r) => r,
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    use sqlx::Row;
    let mut items = Vec::new();
    for row in rows {
        let has_laudo_erp: bool = row.get(18);
        let has_laudo_hub: bool = row.get(19);
        let laudo_id: Option<String> = row.get(20);
        let has_adj_int: Option<i32> = row.get(27);

        items.push(FiscoErpLoteItem {
            lote: row.get(0),
            product_code: row.get(1),
            product_name: row.get(2),
            qty_kg: row.get(3),
            date_erp: row.get(4),
            status_erp: row.get::<Option<String>, _>(15).unwrap_or_else(|| "AP".to_string()),
            fabricated_by: row.get(5),
            authorized_by: row.get(6),
            unidades: row.get(7),
            d_pesado: row.get(8),
            d_envase: row.get(9),
            ph_erp: row.get(10),
            viscosidade_erp: row.get(11),
            densidade_erp: row.get(12),
            viscosidade_24h_erp: row.get(13),
            responsavel_cq_erp: row.get(14),
            resultado_cq_erp: row.get(15),
            data_inspecao_erp: row.get(16),
            observacoes_erp: row.get(17),
            has_laudo_erp,
            has_laudo_hub,
            has_laudo: has_laudo_erp || has_laudo_hub,
            laudo_id,
            laudo_date: row.get(21),
            technician: row.get(22),
            ph_measured: row.get(23),
            viscosity_measured: row.get(24),
            density_measured: row.get(25),
            fraction_weight: row.get(26),
            has_adjustment: has_adj_int.map(|v| v == 1),
        });
    }

    let total_pages = (total + limit - 1) / limit;

    (
        axum::http::StatusCode::OK,
        Json(serde_json::json!({
            "items": items,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
            "stats": stats
        })),
    )
        .into_response()
}

async fn get_erp_lote_insumos_handler(
    State(state): State<Arc<AppState>>,
    Path(lote): Path<String>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let rows = match sqlx::query(
        r#"
        SELECT 
            sm.item_code,
            COALESCE(i.description, p.descricao, '') AS item_description,
            i.unit,
            sm.quantity::float8 AS quantity,
            sm.date,
            COALESCE(sm.details, '') AS details
        FROM stock_movements sm
        LEFT JOIN items i ON sm.item_code = i.code
        LEFT JOIN produtos p ON sm.item_code = p.codigo
        WHERE sm.document_number = $1 AND sm.item_type = 'insumo'
        ORDER BY sm.quantity DESC
        "#
    )
    .bind(&lote)
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    use sqlx::Row;
    let mut insumos = Vec::new();
    for row in rows {
        let details: String = row.get(5);
        let mut user: Option<String> = None;
        let mut justificativa: Option<String> = None;

        for part in details.split('|') {
            let part = part.trim();
            if part.starts_with("Usuário:") || part.starts_with("Usuario:") {
                let u = part
                    .trim_start_matches("Usuário:")
                    .trim_start_matches("Usuario:")
                    .trim();
                if !u.is_empty() {
                    user = Some(u.to_string());
                }
            } else if part.starts_with("Justificativa:") {
                let j = part.trim_start_matches("Justificativa:").trim();
                if !j.is_empty() {
                    justificativa = Some(j.to_string());
                }
            }
        }

        insumos.push(FiscoErpLoteInsumo {
            item_code: row.get(0),
            item_description: row.get(1),
            unit: row.get(2),
            quantity: row.get(3),
            date: row.get(4),
            user,
            justificativa,
        });
    }

    (
        axum::http::StatusCode::OK,
        Json(insumos),
    )
        .into_response()
}

#[derive(serde::Deserialize)]
struct PushToErpRequest {
    analysis_ids: Option<Vec<String>>,
    #[allow(dead_code)]
    all_pending: Option<bool>,
}

#[derive(serde::Deserialize)]
struct ToggleCorrectiveBaixaRequest {
    week_key: String,
    is_baixa: bool,
    usuario: Option<String>,
    observacoes: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct CorrectiveBatchItem {
    analysis_id: String,
    batch: String,
    product_code: String,
    product_name: String,
    analysis_date: String,
    agent_name: String,
    agent_category: String,
    trial_qty_g_per_l: Option<f64>,
    batch_size_kg: Option<f64>,
    total_agent_kg: f64,
    notes: Option<String>,
}

#[derive(serde::Serialize)]
struct CorrectiveWeekSummary {
    week_key: String,
    label: String,
    year: i32,
    week_num: u32,
    is_baixa_realizada: bool,
    baixa_data: Option<String>,
    baixa_usuario: Option<String>,
    observacoes: Option<String>,
    total_agents_kg: f64,
    agent_totals: std::collections::HashMap<String, f64>,
    items: Vec<CorrectiveBatchItem>,
}

async fn push_to_erp_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<PushToErpRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let rows = if let Some(ids) = payload.analysis_ids.filter(|ids| !ids.is_empty()) {
        sqlx::query(
            "SELECT id, product_code, batch, ph_measured, viscosity_measured, density_measured, fabricated_by, authorized_by, technician
             FROM fisco_quimica_analyses
             WHERE id = ANY($1)"
        )
        .bind(&ids)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query(
            "SELECT id, product_code, batch, ph_measured, viscosity_measured, density_measured, fabricated_by, authorized_by, technician
             FROM fisco_quimica_analyses
             WHERE (synced_to_erp IS FALSE OR synced_to_erp IS NULL)
               AND batch IS NOT NULL AND batch <> ''"
        )
        .fetch_all(pool)
        .await
    };

    let rows = match rows {
        Ok(r) => r,
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Erro ao buscar laudos: {}", e) })),
            )
                .into_response();
        }
    };

    if rows.is_empty() {
        return (
            axum::http::StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "Nenhum laudo pendente para envio ao ERP.",
                "updated_count": 0
            })),
        )
            .into_response();
    }

    let mut client = match crate::core::legacy_db::connect_sql_server(pool).await {
        Ok(c) => c,
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Falha ao conectar no SQL Server do ERP: {}", e) })),
            )
                .into_response();
        }
    };

    use sqlx::Row;
    let mut updated_count = 0;
    let mut error_messages = Vec::new();

    for row in rows {
        let analysis_id: String = row.get(0);
        let _prod_code: String = row.get(1);
        let batch: String = row.get(2);
        let ph: f64 = row.get(3);
        let visc: f64 = row.get(4);
        let dens: f64 = row.get(5);
        let fab: Option<String> = row.get(6);
        let aut: Option<String> = row.get(7);
        let tech: Option<String> = row.get(8);

        let fab_val = fab.unwrap_or_default();
        let aut_val = aut.unwrap_or_default();
        let tech_val = tech.unwrap_or_default();

        let sql_update = format!(
            "UPDATE Lotes SET \
             nPH = {ph:.2}, \
             nviscosidade = {visc:.2}, \
             ndensidade = {dens:.4}, \
             cFabricadopor = CASE WHEN '{fab_esc}' <> '' THEN '{fab_esc}' ELSE cFabricadopor END, \
             cAutorizadopor = CASE WHEN '{aut_esc}' <> '' THEN '{aut_esc}' ELSE cAutorizadopor END, \
             cResponsavel1 = CASE WHEN '{tech_esc}' <> '' THEN '{tech_esc}' ELSE cResponsavel1 END, \
             cResultado1 = 'AP', \
             dinspecao1 = GETDATE(), \
             cStatus = CASE WHEN cStatus = 'EA' THEN 'EA' ELSE 'EN' END \
             WHERE nLote = TRY_CAST('{batch_esc}' AS INT) OR CAST(nLote AS VARCHAR(50)) = '{batch_esc}'",
            ph = ph,
            visc = visc,
            dens = dens,
            fab_esc = fab_val.replace('\'', "''"),
            aut_esc = aut_val.replace('\'', "''"),
            tech_esc = tech_val.replace('\'', "''"),
            batch_esc = batch.replace('\'', "''")
        );

        match client.simple_query(&sql_update).await {
            Ok(_) => {
                let _ = sqlx::query(
                    "UPDATE fisco_quimica_analyses SET synced_to_erp = TRUE, erp_synced_at = NOW() WHERE id = $1"
                )
                .bind(&analysis_id)
                .execute(pool)
                .await;

                let _ = sqlx::query(
                    "UPDATE erp_lotes_laudos SET ph = $1, viscosidade = $2, densidade = $3, fabricado_por = COALESCE(NULLIF($4, ''), fabricado_por), autorizado_por = COALESCE(NULLIF($5, ''), autorizado_por), responsavel = COALESCE(NULLIF($6, ''), responsavel), resultado = 'AP', updated_at = NOW() WHERE lote = $7"
                )
                .bind(ph)
                .bind(visc)
                .bind(dens)
                .bind(&fab_val)
                .bind(&aut_val)
                .bind(&tech_val)
                .bind(&batch)
                .execute(pool)
                .await;

                updated_count += 1;
            }
            Err(e) => {
                error_messages.push(format!("Lote {}: {}", batch, e));
            }
        }
    }

    (
        axum::http::StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "updated_count": updated_count,
            "errors": error_messages
        })),
    )
        .into_response()
}

async fn get_corrective_batches_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let week_rows = sqlx::query(
        "SELECT week_key, year, week_num, month_name, is_baixa_realizada, to_char(baixa_data, 'YYYY-MM-DD HH24:MI:SS'), baixa_usuario, observacoes FROM fisco_quimica_corrective_weeks"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    use sqlx::Row;
    let mut weeks_map = std::collections::HashMap::new();
    for r in week_rows {
        let key: String = r.get(0);
        let is_baixa: bool = r.get(4);
        let b_data: Option<String> = r.get(5);
        let b_user: Option<String> = r.get(6);
        let obs: Option<String> = r.get(7);
        weeks_map.insert(key, (is_baixa, b_data, b_user, obs));
    }

    let analyses_rows = sqlx::query(
        r#"
        SELECT 
            fa.id,
            fa.batch,
            fa.product_code,
            fa.product_name,
            fa.analysis_date,
            COALESCE(ag.name, fa.corrective_agent_id, 'Agente Corretivo') AS agent_name,
            COALESCE(ag.category, 'VISCOSIDADE') AS agent_category,
            fa.agent_qty_per_liter,
            fa.batch_size,
            COALESCE(fa.total_agent_required, 0) AS total_agent_required,
            fa.notes,
            fa.has_adjustment
        FROM fisco_quimica_analyses fa
        LEFT JOIN fisco_quimica_corrective_agents ag ON fa.corrective_agent_id = ag.id
        WHERE fa.has_adjustment = 1 
           OR fa.corrective_agent_id IS NOT NULL 
           OR fa.total_agent_required > 0 
           OR fa.notes LIKE '%[Ajuste de pH:%'
        ORDER BY fa.analysis_date DESC
        "#
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    use chrono::Datelike;
    let mut groups: std::collections::BTreeMap<String, CorrectiveWeekSummary> = std::collections::BTreeMap::new();

    for row in analyses_rows {
        let id: String = row.get(0);
        let batch: String = row.get(1);
        let prod_code: String = row.get(2);
        let prod_name: String = row.get(3);
        let date_str: String = row.get(4);
        let mut agent_name: String = row.get(5);
        let agent_cat: String = row.get(6);
        let dose_per_l: Option<f64> = row.get(7);
        let batch_size: Option<f64> = row.get(8);
        let mut total_kg: f64 = row.get(9);
        let notes: Option<String> = row.get(10);

        if total_kg <= 0.0 {
            if let (Some(d), Some(bs)) = (dose_per_l, batch_size) {
                if bs > 0.0 && d > 0.0 {
                    total_kg = (d * bs) / 1000.0;
                }
            }
        }

        if let Some(ref n) = notes {
            if n.contains("[Ajuste de pH:") {
                if let Some(start) = n.find("[Ajuste de pH: ") {
                    let rest = &n[start + 15..];
                    if let Some(end) = rest.find('|') {
                        let extracted_name = rest[..end].trim();
                        if !extracted_name.is_empty() {
                            agent_name = extracted_name.to_string();
                        }
                    }
                }
            }
        }

        let clean_date = date_str.split(' ').next().unwrap_or(&date_str).split('T').next().unwrap_or(&date_str);
        let parsed_date = chrono::NaiveDate::parse_from_str(clean_date, "%Y-%m-%d")
            .unwrap_or_else(|_| chrono::Utc::now().date_naive());

        let iso_year = parsed_date.iso_week().year();
        let iso_week = parsed_date.iso_week().week();
        let week_key = format!("{}-W{:02}", iso_year, iso_week);

        let month_num = parsed_date.month();
        let month_names = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        let month_label = month_names.get((month_num as usize).saturating_sub(1)).unwrap_or(&"Mês");
        let label = format!("{} / {} — Semana {}", month_label, iso_year, iso_week);

        let item = CorrectiveBatchItem {
            analysis_id: id,
            batch,
            product_code: prod_code,
            product_name: prod_name,
            analysis_date: date_str,
            agent_name: agent_name.clone(),
            agent_category: agent_cat,
            trial_qty_g_per_l: dose_per_l,
            batch_size_kg: batch_size,
            total_agent_kg: total_kg,
            notes,
        };

        let summary = groups.entry(week_key.clone()).or_insert_with(|| {
            let (is_b, b_d, b_u, obs) = weeks_map.get(&week_key).cloned().unwrap_or((false, None, None, None));
            CorrectiveWeekSummary {
                week_key: week_key.clone(),
                label,
                year: iso_year,
                week_num: iso_week,
                is_baixa_realizada: is_b,
                baixa_data: b_d,
                baixa_usuario: b_u,
                observacoes: obs,
                total_agents_kg: 0.0,
                agent_totals: std::collections::HashMap::new(),
                items: Vec::new(),
            }
        });

        summary.total_agents_kg += total_kg;
        *summary.agent_totals.entry(agent_name).or_insert(0.0) += total_kg;
        summary.items.push(item);
    }

    let result: Vec<CorrectiveWeekSummary> = groups.into_values().rev().collect();
    (axum::http::StatusCode::OK, Json(result)).into_response()
}

async fn toggle_corrective_baixa_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ToggleCorrectiveBaixaRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let parts: Vec<&str> = payload.week_key.split("-W").collect();
    let year: i32 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(2026);
    let week_num: i32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);

    let res = sqlx::query(
        r#"
        INSERT INTO fisco_quimica_corrective_weeks (week_key, year, week_num, is_baixa_realizada, baixa_data, baixa_usuario, observacoes, updated_at)
        VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, $5, $6, NOW())
        ON CONFLICT (week_key) DO UPDATE SET
            is_baixa_realizada = EXCLUDED.is_baixa_realizada,
            baixa_data = EXCLUDED.baixa_data,
            baixa_usuario = EXCLUDED.baixa_usuario,
            observacoes = EXCLUDED.observacoes,
            updated_at = NOW()
        "#
    )
    .bind(&payload.week_key)
    .bind(year)
    .bind(week_num)
    .bind(payload.is_baixa)
    .bind(payload.usuario)
    .bind(payload.observacoes)
    .execute(pool)
    .await;

    match res {
        Ok(_) => ok_status().into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn migrate_erp_history_handler(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    let rows = match sqlx::query(
        r#"
        SELECT 
            el.lote,
            el.product_code,
            COALESCE(p.descricao, el.product_code) AS product_name,
            el.ph,
            el.viscosidade,
            el.densidade,
            COALESCE(NULLIF(el.fabricado_por, ''), '') AS fabricado_por,
            COALESCE(NULLIF(el.autorizado_por, ''), '') AS autorizado_por,
            COALESCE(NULLIF(el.responsavel, ''), 'ERP Migrado') AS responsavel,
            COALESCE(NULLIF(el.data_inspecao, ''), NULLIF(el.data_lote, ''), NOW()::text) AS data_laudo,
            COALESCE(el.quantidade_kg, 0) AS quantidade_kg,
            'Migrado do histórico ERP' AS observacoes
        FROM erp_lotes_laudos el
        LEFT JOIN produtos p ON el.product_code = p.codigo
        WHERE (el.ph IS NOT NULL AND el.ph > 0)
           OR (el.viscosidade IS NOT NULL AND el.viscosidade > 0)
           OR (el.densidade IS NOT NULL AND el.densidade > 0)
        "#
    )
    .fetch_all(pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    use sqlx::Row;
    let mut migrated_count = 0;

    for row in rows {
        let lote: String = row.get(0);
        let prod_code: String = row.get(1);
        let prod_name: String = row.get(2);
        let ph: Option<f64> = row.get(3);
        let visc: Option<f64> = row.get(4);
        let dens: Option<f64> = row.get(5);
        let fab: String = row.get(6);
        let aut: String = row.get(7);
        let resp: String = row.get(8);
        let data_laudo: String = row.get(9);
        let qtd_kg: f64 = row.get(10);
        let obs: String = row.get(11);

        let id = format!("erp_{}_{}", lote, prod_code);
        let ph_val = ph.unwrap_or(0.0);
        let visc_val = visc.unwrap_or(0.0);
        let dens_val = dens.unwrap_or(0.0);
        let frac_wt = if dens_val > 0.0 { dens_val * 51.645 } else { 0.0 };

        let _ = sqlx::query(
            r#"
            INSERT INTO fisco_quimica_analyses (
                id, product_code, product_name, batch, analysis_date, technician,
                ph_measured, viscosity_measured, density_measured, fraction_weight,
                envase_target_weight, envase_target_unit, has_adjustment, batch_size,
                notes, fabricated_by, authorized_by, synced_to_erp, erp_synced_at, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'g', 0, $11, $12, $13, $14, TRUE, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                ph_measured = EXCLUDED.ph_measured,
                viscosity_measured = EXCLUDED.viscosity_measured,
                density_measured = EXCLUDED.density_measured,
                fabricated_by = EXCLUDED.fabricated_by,
                authorized_by = EXCLUDED.authorized_by,
                technician = EXCLUDED.technician,
                synced_to_erp = TRUE
            "#
        )
        .bind(&id)
        .bind(&prod_code)
        .bind(&prod_name)
        .bind(&lote)
        .bind(&data_laudo)
        .bind(&resp)
        .bind(ph_val)
        .bind(visc_val)
        .bind(dens_val)
        .bind(frac_wt)
        .bind(qtd_kg)
        .bind(&obs)
        .bind(&fab)
        .bind(&aut)
        .execute(pool)
        .await;

        migrated_count += 1;
    }

    (
        axum::http::StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "migrated_count": migrated_count
        })),
    )
        .into_response()
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/hub/fisco/config", get(get_config_handler).post(save_config_handler))
        .route("/api/hub/fisco/patterns", get(get_patterns_handler).post(save_pattern_handler))
        .route("/api/hub/fisco/patterns/:code", delete(delete_pattern_handler))
        .route("/api/hub/fisco/agents", get(get_agents_handler).post(save_agent_handler))
        .route("/api/hub/fisco/agents/:id", delete(delete_agent_handler))
        .route("/api/hub/fisco/analyses", get(get_analyses_handler).post(save_analysis_handler))
        .route("/api/hub/fisco/analyses/:id", delete(delete_analysis_handler))
        .route("/api/hub/fisco/push-to-erp", axum::routing::post(push_to_erp_handler))
        .route("/api/hub/fisco/corrective-batches", get(get_corrective_batches_handler))
        .route("/api/hub/fisco/corrective-batches/toggle-baixa", axum::routing::post(toggle_corrective_baixa_handler))
        .route("/api/hub/fisco/migrate-erp-history", axum::routing::post(migrate_erp_history_handler))
        .route("/api/hub/fisco/erp-lotes", get(get_erp_lotes_handler))
        .route("/api/hub/fisco/erp-lotes/:lote/insumos", get(get_erp_lote_insumos_handler))
        .route("/api/hub/fisco/products", get(get_all_fisco_products_handler))
}
