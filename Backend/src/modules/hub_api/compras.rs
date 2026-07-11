use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::modules::compras::planejamento::models::*;
use crate::modules::compras::planejamento::commands::*;
use crate::modules::compras::compras_online::commands::*;
use crate::modules::compras::compras_online::models::{OnlineOrder, OnlineStore};
use crate::modules::hub_api::util::{ok_json, ok_status, with_conn, with_conn_mut};

fn mode_to_parent_category(mode: Option<&str>) -> Option<String> {
    match mode {
        Some("embalagens") => Some("cat_emb".to_string()),
        Some("materia_prima") => Some("cat_mp".to_string()),
        Some("coloracao") => Some("coloracao".to_string()),
        Some("apoio") => Some("apoio".to_string()),
        _ => None,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CategoryIdQuery {
    category_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DemandsQuery {
    category_id: Option<String>,
    #[serde(default = "default_target_days")]
    target_days: i32,
}

fn default_target_days() -> i32 {
    90
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeQuery {
    code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusQuery {
    status: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigKeyQuery {
    key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModeQuery {
    mode: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpendingQuery {
    start: String,
    end: String,
    mode: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemCodeQuery {
    item_code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateItemDetailsBody {
    code: String,
    notes: Option<String>,
    is_ignored: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimilarItemsBody {
    code_a: String,
    code_b: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateItemsCategoryBody {
    codes: Vec<String>,
    category_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportObservationsBody {
    observations: Vec<ObsInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteCustomConfigQuery {
    level: String,
    target_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateQuotationBody {
    title: String,
    item_codes: Vec<String>,
    recommended_qtys: Vec<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateQuotationStatusBody {
    status: String,
    notes: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectSupplierBody {
    quotation_item_id: String,
    price_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateQuotationItemQtyBody {
    field: String,
    qty: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportStockBody {
    rows: Vec<serde_json::Value>,
    filename: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportConsumptionBody {
    rows: Vec<serde_json::Value>,
    filename: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportInvoicesBody {
    rows: Vec<serde_json::Value>,
    filename: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveComprasConfigBody {
    config: serde_json::Value,
    key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveCustomConfigBody {
    row: CustomPurchaseConfigRow,
}

// --- Categories ---

async fn get_categories_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, get_categories_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_category_handler(State(state): State<Arc<AppState>>, Json(category): Json<Category>) -> impl IntoResponse {
    match with_conn(&state, |conn| save_category_conn(conn, &category)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_category_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_conn(&state, |conn| delete_category_conn(conn, &id)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Items ---

async fn get_items_handler(State(state): State<Arc<AppState>>, Query(q): Query<CategoryIdQuery>) -> impl IntoResponse {
    match with_conn(&state, |conn| get_items_conn(conn, q.category_id)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_item_details_handler(State(state): State<Arc<AppState>>, Json(body): Json<UpdateItemDetailsBody>) -> impl IntoResponse {
    match with_conn(&state, |conn| update_item_details_conn(conn, &body.code, body.notes, body.is_ignored)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_similar_items_handler(State(state): State<Arc<AppState>>, Query(q): Query<CodeQuery>) -> impl IntoResponse {
    match with_conn(&state, |conn| get_similar_items_conn(conn, &q.code)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn add_similar_item_handler(State(state): State<Arc<AppState>>, Json(body): Json<SimilarItemsBody>) -> impl IntoResponse {
    match with_conn(&state, |conn| add_similar_item_conn(conn, &body.code_a, &body.code_b)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn remove_similar_item_handler(State(state): State<Arc<AppState>>, Query(q): Query<SimilarItemsBody>) -> impl IntoResponse {
    match with_conn(&state, |conn| remove_similar_item_conn(conn, &q.code_a, &q.code_b)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_items_category_handler(State(state): State<Arc<AppState>>, Json(body): Json<UpdateItemsCategoryBody>) -> impl IntoResponse {
    match with_conn_mut(&state, |conn| update_items_category_conn(conn, &body.codes, body.category_id)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn import_item_observations_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportObservationsBody>) -> impl IntoResponse {
    match with_conn_mut(&state, |conn| import_item_observations_conn(conn, &body.observations)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Demands & Custom Configs ---

async fn get_demands_handler(State(state): State<Arc<AppState>>, Query(q): Query<DemandsQuery>) -> impl IntoResponse {
    match with_conn(&state, |conn| get_demands_conn(conn, q.category_id, q.target_days)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_custom_configs_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, get_custom_purchase_configs_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_custom_config_handler(State(state): State<Arc<AppState>>, Json(body): Json<SaveCustomConfigBody>) -> impl IntoResponse {
    match with_conn(&state, |conn| save_custom_purchase_config_conn(conn, &body.row)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_custom_config_handler(State(state): State<Arc<AppState>>, Query(q): Query<DeleteCustomConfigQuery>) -> impl IntoResponse {
    match with_conn(&state, |conn| delete_custom_purchase_config_conn(conn, &q.level, &q.target_id)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Quotations ---

async fn create_quotation_handler(State(state): State<Arc<AppState>>, Json(body): Json<CreateQuotationBody>) -> impl IntoResponse {
    match with_conn_mut(&state, |conn| create_quotation_conn(conn, &body.title, &body.item_codes, &body.recommended_qtys)) {
        Ok(id) => ok_json(serde_json::json!({ "id": id })).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_quotations_handler(State(state): State<Arc<AppState>>, Query(q): Query<StatusQuery>) -> impl IntoResponse {
    match with_conn(&state, |conn| get_quotations_conn(conn, q.status)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_quotation_detail_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_conn(&state, |conn| get_quotation_detail_conn(conn, &id)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_quotation_status_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<UpdateQuotationStatusBody>) -> impl IntoResponse {
    match with_conn(&state, |conn| update_quotation_status_conn(conn, &id, &body.status, body.notes)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn add_quotation_price_handler(State(state): State<Arc<AppState>>, Json(price): Json<QuotationPriceInput>) -> impl IntoResponse {
    match with_conn(&state, |conn| add_quotation_price_conn(conn, &price)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn select_supplier_handler(State(state): State<Arc<AppState>>, Json(body): Json<SelectSupplierBody>) -> impl IntoResponse {
    match with_conn_mut(&state, |conn| select_supplier_conn(conn, &body.quotation_item_id, &body.price_id)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_quotation_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_conn(&state, |conn| delete_quotation_conn(conn, &id)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_quotation_item_qty_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<UpdateQuotationItemQtyBody>) -> impl IntoResponse {
    match with_conn(&state, |conn| update_quotation_item_qty_conn(conn, &id, &body.field, body.qty)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Suppliers & Reports ---

async fn get_suppliers_handler(State(state): State<Arc<AppState>>, Query(q): Query<ModeQuery>) -> impl IntoResponse {
    let parent = mode_to_parent_category(q.mode.as_deref());
    match with_conn(&state, |conn| get_suppliers_conn(conn, parent)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_supplier_handler(State(state): State<Arc<AppState>>, Json(supplier): Json<Supplier>) -> impl IntoResponse {
    match with_conn(&state, |conn| save_supplier_conn(conn, &supplier)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_supplier_history_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_conn(&state, |conn| get_supplier_history_conn(conn, &id)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_price_evolution_handler(State(state): State<Arc<AppState>>, Query(q): Query<ItemCodeQuery>) -> impl IntoResponse {
    match with_conn(&state, |conn| get_price_evolution_conn(conn, &q.item_code)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_spending_by_supplier_handler(State(state): State<Arc<AppState>>, Query(q): Query<SpendingQuery>) -> impl IntoResponse {
    let parent = mode_to_parent_category(q.mode.as_deref());
    match with_conn(&state, |conn| get_spending_by_supplier_conn(conn, &q.start, &q.end, parent)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_spending_by_category_handler(State(state): State<Arc<AppState>>, Query(q): Query<SpendingQuery>) -> impl IntoResponse {
    let parent = mode_to_parent_category(q.mode.as_deref());
    match with_conn(&state, |conn| get_spending_by_category_conn(conn, &q.start, &q.end, parent)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Config ---

async fn get_compras_config_handler(State(state): State<Arc<AppState>>, Query(q): Query<ConfigKeyQuery>) -> impl IntoResponse {
    match with_conn(&state, |conn| get_compras_config_conn(conn, q.key)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_compras_config_handler(State(state): State<Arc<AppState>>, Json(body): Json<SaveComprasConfigBody>) -> impl IntoResponse {
    match with_conn(&state, |conn| save_compras_config_conn(conn, &body.config, body.key)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Imports ---

async fn import_stock_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportStockBody>) -> impl IntoResponse {
    match with_conn_mut(&state, |conn| import_stock_conn(conn, &body.rows, &body.filename)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn import_consumption_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportConsumptionBody>) -> impl IntoResponse {
    match with_conn_mut(&state, |conn| import_consumption_conn(conn, &body.rows, &body.filename)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn import_invoices_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportInvoicesBody>) -> impl IntoResponse {
    match with_conn_mut(&state, |conn| import_invoices_conn(conn, &body.rows, &body.filename)) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_import_history_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, get_import_history_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_nf_import_control_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, get_nf_import_control_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Online Orders & Stores ---

async fn get_online_orders_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, get_online_orders_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_online_order_handler(State(state): State<Arc<AppState>>, Json(order): Json<OnlineOrder>) -> impl IntoResponse {
    match with_conn(&state, |conn| save_online_order_conn(conn, &order)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_online_order_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_conn(&state, |conn| delete_online_order_conn(conn, &id)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_online_stores_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_conn(&state, get_online_stores_conn) {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_online_store_handler(State(state): State<Arc<AppState>>, Json(store): Json<OnlineStore>) -> impl IntoResponse {
    match with_conn(&state, |conn| save_online_store_conn(conn, &store)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_online_store_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_conn(&state, |conn| delete_online_store_conn(conn, &id)) {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // Categories
        .route("/api/hub/compras/categories", get(get_categories_handler).post(save_category_handler))
        .route("/api/hub/compras/categories/:id", delete(delete_category_handler))
        // Items
        .route("/api/hub/compras/items", get(get_items_handler))
        .route("/api/hub/compras/items/details", post(update_item_details_handler))
        .route("/api/hub/compras/items/similar", get(get_similar_items_handler).post(add_similar_item_handler).delete(remove_similar_item_handler))
        .route("/api/hub/compras/items/category", post(update_items_category_handler))
        .route("/api/hub/compras/items/observations", post(import_item_observations_handler))
        // Demands
        .route("/api/hub/compras/demands", get(get_demands_handler))
        .route("/api/hub/compras/custom-configs", get(get_custom_configs_handler).post(save_custom_config_handler).delete(delete_custom_config_handler))
        // Quotations
        .route("/api/hub/compras/quotations", get(get_quotations_handler).post(create_quotation_handler))
        .route("/api/hub/compras/quotations/:id", get(get_quotation_detail_handler).delete(delete_quotation_handler))
        .route("/api/hub/compras/quotations/:id/status", post(update_quotation_status_handler))
        .route("/api/hub/compras/quotations/:id/qty", post(update_quotation_item_qty_handler))
        .route("/api/hub/compras/quotations/prices", post(add_quotation_price_handler))
        .route("/api/hub/compras/quotations/select-supplier", post(select_supplier_handler))
        // Suppliers
        .route("/api/hub/compras/suppliers", get(get_suppliers_handler).post(save_supplier_handler))
        .route("/api/hub/compras/suppliers/:id/history", get(get_supplier_history_handler))
        // Reports
        .route("/api/hub/compras/price-evolution", get(get_price_evolution_handler))
        .route("/api/hub/compras/spending/supplier", get(get_spending_by_supplier_handler))
        .route("/api/hub/compras/spending/category", get(get_spending_by_category_handler))
        // Config
        .route("/api/hub/compras/config", get(get_compras_config_handler).post(save_compras_config_handler))
        // Imports
        .route("/api/hub/compras/imports/stock", post(import_stock_handler))
        .route("/api/hub/compras/imports/consumption", post(import_consumption_handler))
        .route("/api/hub/compras/imports/invoices", post(import_invoices_handler))
        .route("/api/hub/compras/imports/history", get(get_import_history_handler))
        .route("/api/hub/compras/imports/nf-control", get(get_nf_import_control_handler))
        // Online orders & stores
        .route("/api/hub/compras/online-orders", get(get_online_orders_handler).post(save_online_order_handler))
        .route("/api/hub/compras/online-orders/:id", delete(delete_online_order_handler))
        .route("/api/hub/compras/online-stores", get(get_online_stores_handler).post(save_online_store_handler))
        .route("/api/hub/compras/online-stores/:id", delete(delete_online_store_handler))
}
