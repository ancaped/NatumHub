use axum::{
    extract::{Path, State},
    response::IntoResponse,
    routing::{delete, get},
    Json, Router,
};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::{FiscoQuimicaPattern, FiscoQuimicaAgent, FiscoQuimicaAnalysis};
use crate::tauri_commands::*;
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

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/hub/fisco/config", get(get_config_handler).post(save_config_handler))
        .route("/api/hub/fisco/patterns", get(get_patterns_handler).post(save_pattern_handler))
        .route("/api/hub/fisco/patterns/:code", delete(delete_pattern_handler))
        .route("/api/hub/fisco/agents", get(get_agents_handler).post(save_agent_handler))
        .route("/api/hub/fisco/agents/:id", delete(delete_agent_handler))
        .route("/api/hub/fisco/analyses", get(get_analyses_handler).post(save_analysis_handler))
        .route("/api/hub/fisco/analyses/:id", delete(delete_analysis_handler))
}
