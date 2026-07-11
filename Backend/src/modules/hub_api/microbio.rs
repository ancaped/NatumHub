use axum::{
    extract::{Path, State},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::{Product, Report};
use crate::tauri_commands::*;
use crate::modules::hub_api::util::{ok_json, ok_status, with_conn, with_conn_mut};

async fn get_microbio_config_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, get_microbio_config_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_microbio_config_handler(State(state): State<Arc<AppState>>, Json(config): Json<serde_json::Value>) -> impl IntoResponse {
    match with_conn(&state, |conn| save_config_microbio_conn(conn, &config)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_products_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, get_products_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_product_handler(State(state): State<Arc<AppState>>, Json(product): Json<Product>) -> impl IntoResponse {
    match with_conn(&state, |conn| save_product_conn(conn, &product)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_product_handler(State(state): State<Arc<AppState>>, Path(code): Path<String>) -> impl IntoResponse {
    match with_conn(&state, |conn| delete_product_conn(conn, &code)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_all_products_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, delete_all_products_conn) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_reports_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, get_reports_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_reports_handler(State(state): State<Arc<AppState>>, Json(reports): Json<Vec<Report>>) -> impl IntoResponse {
    match with_conn_mut(&state, |conn| save_reports_conn(conn, &reports)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_report_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_conn(&state, |conn| delete_report_conn(conn, &id)) {
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
