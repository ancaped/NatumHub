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
use crate::modules::hub_api::util::{ok_json, ok_status, with_pool};

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
    override_period: Option<i32>,
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
    match with_pool(&state, |pool| get_categories_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_category_handler(State(state): State<Arc<AppState>>, Json(category): Json<Category>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_category_query(pool, &category)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_category_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_category_query(pool, &id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Items ---

async fn get_items_handler(State(state): State<Arc<AppState>>, Query(q): Query<CategoryIdQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_items_query(pool, q.category_id)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_item_details_handler(State(state): State<Arc<AppState>>, Json(body): Json<UpdateItemDetailsBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| update_item_details_query(pool, &body.code, body.notes, body.is_ignored)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_similar_items_handler(State(state): State<Arc<AppState>>, Query(q): Query<CodeQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_similar_items_query(pool, &q.code)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn add_similar_item_handler(State(state): State<Arc<AppState>>, Json(body): Json<SimilarItemsBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| add_similar_item_query(pool, &body.code_a, &body.code_b)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn remove_similar_item_handler(State(state): State<Arc<AppState>>, Query(q): Query<SimilarItemsBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| remove_similar_item_query(pool, &q.code_a, &q.code_b)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_items_category_handler(State(state): State<Arc<AppState>>, Json(body): Json<UpdateItemsCategoryBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| update_items_category_query(pool, &body.codes, body.category_id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn import_item_observations_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportObservationsBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| import_item_observations_query(pool, &body.observations)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Demands & Custom Configs ---

async fn get_demands_handler(State(state): State<Arc<AppState>>, Query(q): Query<DemandsQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_demands_query(pool, q.category_id, q.target_days, q.override_period)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_custom_configs_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_custom_purchase_configs_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_custom_config_handler(State(state): State<Arc<AppState>>, Json(body): Json<SaveCustomConfigBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_custom_purchase_config_query(pool, &body.row)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_custom_config_handler(State(state): State<Arc<AppState>>, Query(q): Query<DeleteCustomConfigQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_custom_purchase_config_query(pool, &q.level, &q.target_id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Quotations ---

async fn create_quotation_handler(State(state): State<Arc<AppState>>, Json(body): Json<CreateQuotationBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| create_quotation_query(pool, &body.title, &body.item_codes, &body.recommended_qtys)).await {
        Ok(id) => ok_json(serde_json::json!({ "id": id })).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_quotations_handler(State(state): State<Arc<AppState>>, Query(q): Query<StatusQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_quotations_query(pool, q.status)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_quotation_detail_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_quotation_detail_query(pool, &id)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_quotation_status_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<UpdateQuotationStatusBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| update_quotation_status_query(pool, &id, &body.status, body.notes)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn add_quotation_price_handler(State(state): State<Arc<AppState>>, Json(price): Json<QuotationPriceInput>) -> impl IntoResponse {
    match with_pool(&state, |pool| add_quotation_price_query(pool, &price)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn select_supplier_handler(State(state): State<Arc<AppState>>, Json(body): Json<SelectSupplierBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| select_supplier_query(pool, &body.quotation_item_id, &body.price_id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_quotation_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_quotation_query(pool, &id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn update_quotation_item_qty_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(body): Json<UpdateQuotationItemQtyBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| update_quotation_item_qty_query(pool, &id, &body.field, body.qty)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Suppliers & Reports ---

async fn get_suppliers_handler(State(state): State<Arc<AppState>>, Query(q): Query<ModeQuery>) -> impl IntoResponse {
    let parent = mode_to_parent_category(q.mode.as_deref());
    match with_pool(&state, |pool| get_suppliers_query(pool, parent)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_supplier_handler(State(state): State<Arc<AppState>>, Json(supplier): Json<Supplier>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_supplier_query(pool, &supplier)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_supplier_history_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_supplier_history_query(pool, &id)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_price_evolution_handler(State(state): State<Arc<AppState>>, Query(q): Query<ItemCodeQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_price_evolution_query(pool, &q.item_code)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_spending_by_supplier_handler(State(state): State<Arc<AppState>>, Query(q): Query<SpendingQuery>) -> impl IntoResponse {
    let parent = mode_to_parent_category(q.mode.as_deref());
    match with_pool(&state, |pool| get_spending_by_supplier_query(pool, &q.start, &q.end, parent)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_spending_by_category_handler(State(state): State<Arc<AppState>>, Query(q): Query<SpendingQuery>) -> impl IntoResponse {
    let parent = mode_to_parent_category(q.mode.as_deref());
    match with_pool(&state, |pool| get_spending_by_category_query(pool, &q.start, &q.end, parent)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Config ---

async fn get_compras_config_handler(State(state): State<Arc<AppState>>, Query(q): Query<ConfigKeyQuery>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_compras_config_query(pool, q.key)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_compras_config_handler(State(state): State<Arc<AppState>>, Json(body): Json<SaveComprasConfigBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_compras_config_query(pool, &body.config, body.key)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_pinned_subcategories_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, get_pinned_subcategories_query).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct PinnedSubcategoriesBody {
    ids: Vec<String>,
}

async fn save_pinned_subcategories_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PinnedSubcategoriesBody>,
) -> impl IntoResponse {
    match with_pool(&state, |pool| save_pinned_subcategories_query(pool, &body.ids)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Imports ---

async fn import_stock_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportStockBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| import_stock_query(pool, &body.rows, &body.filename)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn import_consumption_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportConsumptionBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| import_consumption_query(pool, &body.rows, &body.filename)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn import_invoices_handler(State(state): State<Arc<AppState>>, Json(body): Json<ImportInvoicesBody>) -> impl IntoResponse {
    match with_pool(&state, |pool| import_invoices_query(pool, &body.rows, &body.filename)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_import_history_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_import_history_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_nf_import_control_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_nf_import_control_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

// --- Online Orders & Stores ---

async fn get_online_orders_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_online_orders_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_online_order_handler(State(state): State<Arc<AppState>>, Json(order): Json<OnlineOrder>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_online_order_query(pool, &order)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_online_order_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_online_order_query(pool, &id)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn get_online_stores_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match with_pool(&state, |pool| get_online_stores_query(pool)).await {
        Ok(v) => ok_json(v).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn save_online_store_handler(State(state): State<Arc<AppState>>, Json(store): Json<OnlineStore>) -> impl IntoResponse {
    match with_pool(&state, |pool| save_online_store_query(pool, &store)).await {
        Ok(()) => ok_status().into_response(),
        Err(e) => e.into_response(),
    }
}

async fn delete_online_store_handler(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    match with_pool(&state, |pool| delete_online_store_query(pool, &id)).await {
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
        .route(
            "/api/hub/compras/pinned-subcategories",
            get(get_pinned_subcategories_handler).post(save_pinned_subcategories_handler),
        )
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
