use axum::{
    extract::{Path, State},
    response::IntoResponse,
    routing::{delete, get},
    Json, Router,
};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::{Product, Report};
use crate::tauri_commands::*;
use crate::modules::hub_api::util::{ok_json, ok_status, with_pool};

async fn get_microbio_config_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_microbio_config_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_microbio_config_handler(State(state): State<Arc<AppState>>, Json(config): Json<serde_json::Value>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_config_microbio_query(pool, &config)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_products_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_products_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_product_handler(State(state): State<Arc<AppState>>, Json(product): Json<Product>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_product_query(pool, &product)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_product_handler(State(state): State<Arc<AppState>>, Path(code): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_product_query(pool, &code)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_all_products_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_all_products_query(pool)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_reports_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_reports_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_reports_handler(State(state): State<Arc<AppState>>, Json(reports): Json<Vec<Report>>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_reports_query(pool, &reports)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_report_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_report_query(pool, &id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/hub/microbio/config", get(get_microbio_config_handler).post(save_microbio_config_handler))
        .route("/api/hub/microbio/products", get(get_products_handler).post(save_product_handler).delete(delete_all_products_handler))
        .route("/api/hub/microbio/products/:code", delete(delete_product_handler))
        .route("/api/hub/microbio/reports", get(get_reports_handler).post(save_reports_handler))
        .route("/api/hub/microbio/reports/:id", delete(delete_report_handler))
}
