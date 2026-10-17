use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ObsInput {
    pub code: String,
    pub notes: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SupplierSummary {
    pub id: String,
    pub name: String,
    pub cnpj: Option<String>,
    pub contact: Option<String>,
    pub email: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: String,
    pub name: String,
    pub contact: Option<String>,
    pub email: Option<String>,
    pub notes: Option<String>,
    pub cnpj: Option<String>,
    pub parent_id: Option<String>,
    pub parent_name: Option<String>,
    pub linked_suppliers: Option<Vec<SupplierSummary>>,
    pub linked_count: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnifySuppliersRequest {
    pub parent_id: String,
    pub child_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UnlinkSupplierRequest {
    pub supplier_id: String,
}


#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub code: String,
    pub description: String,
    pub unit: String,
    pub category_id: Option<String>,
    pub line: Option<String>,
    pub type_code: Option<String>,
    pub notes: Option<String>,
    pub is_ignored: bool,
    pub is_auto_ignored: Option<bool>,
    pub ignored_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StockSnapshot {
    pub item_code: String,
    pub stock_qty: f64,
    pub reserved_qty: f64,
    pub in_production: f64,
    pub in_orders: f64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Consumption {
    pub item_code: String,
    pub year: i32,
    pub total_qty: f64,
    pub monthly_avg: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub id: String,
    pub invoice_number: String,
    pub item_code: String,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub total_value: f64,
    pub supplier_name: Option<String>,
    pub supplier_id: Option<String>,
    pub invoice_date: Option<String>,
    pub cfop: Option<String>,
    pub icms_value: f64,
    pub ipi_value: f64,
    pub freight_value: f64,
    pub entry_date: Option<String>,
    pub carrier_name: Option<String>,
    pub supplier_cnpj: Option<String>,
    pub payment_installments: Option<String>,
    #[serde(default)]
    pub fte_number: Option<String>,
    #[serde(default)]
    pub fte_value: f64,
    #[serde(default)]
    pub fte_carrier_name: Option<String>,
    #[serde(default)]
    pub fte_carrier_cnpj: Option<String>,
    #[serde(default)]
    pub fte_issue_date: Option<String>,
    #[serde(default)]
    pub fte_entry_date: Option<String>,
    #[serde(default)]
    pub fte_cif_fob: Option<String>,
    #[serde(default)]
    pub fte_serie: Option<String>,
    #[serde(default)]
    pub fte_cfop: Option<String>,
    #[serde(default)]
    pub fte_natureza: Option<String>,
    #[serde(default)]
    pub fte_icms_value: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CustomPurchaseConfigRow {
    pub level: String,
    pub target_id: String,
    pub dias_start: Option<i32>,
    pub dias_target: Option<i32>,
    pub use_lead_time: i32,
    pub safety_days: i32,
    pub objetivo_tipo: String,
    pub objetivo_valor: f64,
    pub target_name: Option<String>,
    pub periodo_media: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DemandResult {
    pub item_code: String,
    pub description: String,
    pub unit: String,
    pub category_id: Option<String>,
    pub category_name: String,
    pub current_stock: f64,
    pub reserved_qty: f64,
    /// Reserva espelhada do ERP (stock_snapshots) — tooltip na lista Compras.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reserved_qty_erp: Option<f64>,
    pub in_production: f64,
    pub in_orders: f64,
    /// Consumo de insumos se produzir produtos em Produzir Urgente / Abrir Ordem.
    #[serde(default)]
    pub sim_producao: f64,
    pub avg2024: f64,
    pub avg2025: f64,
    pub avg2026: f64,
    pub overall_avg: f64,
    pub future_stock_forecast: f64,
    pub estimated_duration_days: f64,
    pub recommended_qty: f64,
    pub urgency: String,
    pub notes: Option<String>,
    pub last_supplier_invoice: Option<String>,
    pub last_supplier_order: Option<String>,
    #[serde(default)]
    pub trigger_point: f64,
    #[serde(default)]
    pub target_stock: f64,
    #[serde(default)]
    pub trigger_days: i32,
    #[serde(default)]
    pub target_days: i32,
    #[serde(default)]
    pub config_level: String,
}


#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Quotation {
    pub id: String,
    pub title: String,
    pub status: String,
    pub target_days: i32,
    pub notes: Option<String>,
    pub director_demand_notes: Option<String>,
    pub director_final_notes: Option<String>,
    pub created_at: Option<String>,
    pub demand_approved_at: Option<String>,
    pub final_approved_at: Option<String>,
    pub ordered_at: Option<String>,
    pub item_count: Option<i32>,
    pub total_value: Option<f64>,
    pub quotation_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuotationItem {
    pub id: String,
    pub quotation_id: String,
    pub item_code: String,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub recommended_qty: f64,
    pub approved_qty: Option<f64>,
    pub final_qty: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuotationPrice {
    pub id: String,
    pub quotation_item_id: String,
    pub supplier_id: String,
    pub supplier_name: Option<String>,
    pub unit_price: f64,
    pub delivery_days: Option<i32>,
    pub min_qty: Option<f64>,
    pub payment_terms: Option<String>,
    pub notes: Option<String>,
    pub is_selected: bool,
}

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuotationPriceInput {
    pub quotation_item_id: String,
    pub supplier_id: String,
    pub unit_price: f64,
    #[serde(default)]
    pub delivery_days: Option<i32>,
    #[serde(default)]
    pub min_qty: Option<f64>,
    #[serde(default)]
    pub payment_terms: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuotationItemDetail {
    pub id: String,
    pub quotation_id: String,
    pub item_code: String,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub recommended_qty: f64,
    pub approved_qty: Option<f64>,
    pub final_qty: Option<f64>,
    pub notes: Option<String>,
    pub prices: Vec<QuotationPrice>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub total_rows: i32,
    pub new_items: i32,
    pub updated_items: i32,
    pub skipped_duplicates: i32,
    pub errors: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StockImport {
    pub id: String,
    pub filename: String,
    pub source: String,
    pub imported_at: String,
    pub item_count: i32,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PricePoint {
    pub date: String,
    pub unit_price: f64,
    pub supplier_name: String,
    pub invoice_number: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SupplierSpend {
    pub supplier_id: String,
    pub supplier_name: String,
    pub total_value: f64,
    pub invoice_count: i32,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CategorySpend {
    pub category_id: String,
    pub category_name: String,
    pub total_value: f64,
    pub item_count: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseRequestBatchItem {
    pub id: String,
    pub batch_id: String,
    pub item_code: String,
    pub item_description: String,
    pub unit: String,
    pub quantity_requested: f64,
    pub current_stock_at_time: f64,
    pub overall_avg_at_time: f64,
    pub sim_producao_at_time: f64,
    pub future_stock_at_time: f64,
    pub target_days_at_time: i32,
    pub trigger_days_at_time: i32,
    pub supplier_name: Option<String>,
    pub observacao: Option<String>,
    pub status: String,
    pub erp_pedido_numero: Option<i32>,
    pub erp_pedido_data: Option<String>,
    pub erp_fornecedor: Option<String>,
    pub erp_pedido_qtd: Option<f64>,
    pub erp_pedido_chegou: Option<f64>,
    pub erp_previsao_entrega: Option<String>,
    pub erp_synced_at: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseRequestBatch {
    pub id: String,
    pub lote_numero: String,
    pub modulo: String,
    pub titulo: Option<String>,
    pub observacoes: Option<String>,
    pub created_by: Option<String>,
    pub status: String,
    pub total_items: i64,
    pub items_with_order: i64,
    pub items_completed: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseRequestBatchDetail {
    pub batch: PurchaseRequestBatch,
    pub items: Vec<PurchaseRequestBatchItem>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchaseRequestItemInput {
    pub item_code: String,
    pub item_description: String,
    pub unit: Option<String>,
    pub quantity_requested: f64,
    pub current_stock_at_time: Option<f64>,
    pub overall_avg_at_time: Option<f64>,
    pub sim_producao_at_time: Option<f64>,
    pub future_stock_at_time: Option<f64>,
    pub target_days_at_time: Option<i32>,
    pub trigger_days_at_time: Option<i32>,
    pub supplier_name: Option<String>,
    pub observacao: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchaseRequestBatchInput {
    pub modulo: String,
    pub titulo: Option<String>,
    pub observacoes: Option<String>,
    pub created_by: Option<String>,
    pub items: Vec<CreatePurchaseRequestItemInput>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveRequestedItemSummary {
    pub item_code: String,
    pub item_description: String,
    pub batch_id: String,
    pub lote_numero: String,
    pub modulo: String,
    pub created_at: String,
    pub days_ago: i64,
    pub quantity_requested: f64,
    pub status: String,
    pub erp_pedido_numero: Option<i32>,
    pub erp_pedido_data: Option<String>,
    pub erp_fornecedor: Option<String>,
    pub erp_pedido_qtd: Option<f64>,
    pub erp_pedido_chegou: Option<f64>,
    pub erp_previsao_entrega: Option<String>,
}

