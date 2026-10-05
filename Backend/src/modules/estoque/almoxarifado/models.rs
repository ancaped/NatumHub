use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlmoxItemRow {
    pub code: String,
    pub description: String,
    pub unit: String,
    pub category_id: Option<String>,
    pub active: bool,
    pub min_qty: f64,
    pub ideal_qty: f64,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub qty_on_hand: f64,
    pub avg_unit_cost: f64,
    pub erp_qty: Option<f64>,
    pub below_min: bool,
    /// almoxarifado | supermercado | pecas
    pub section: String,
    /// erp | local
    pub source: String,
    pub erp_description: Option<String>,
    pub lifespan_days: Option<i32>,
    pub installed_at: Option<String>,
    pub expires_at: Option<String>,
    pub next_exchange_at: Option<String>,
    /// ok | due_soon | overdue | none
    pub exchange_status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertItemConfigRequest {
    pub active: Option<bool>,
    pub min_qty: Option<f64>,
    pub ideal_qty: Option<f64>,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub section: Option<String>,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub lifespan_days: Option<i32>,
    pub installed_at: Option<String>,
    pub expires_at: Option<String>,
    pub next_exchange_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkErpItemRequest {
    pub item_code: String,
    pub section: String,
    pub active: Option<bool>,
    pub min_qty: Option<f64>,
    pub ideal_qty: Option<f64>,
    pub location: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocalItemRequest {
    pub description: String,
    pub unit: String,
    pub section: String,
    pub min_qty: Option<f64>,
    pub ideal_qty: Option<f64>,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub lifespan_days: Option<i32>,
    pub next_exchange_at: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMovementRequest {
    pub item_code: String,
    pub movement_type: String,
    pub quantity: f64,
    pub unit_cost: Option<f64>,
    pub reason: Option<String>,
    pub document_ref: Option<String>,
    pub occurred_at: Option<String>,
    pub allow_negative: Option<bool>,
    /// Setor destino (saídas de almoxarifado/peças)
    pub sector: Option<String>,
    /// Supermercado — compra detalhada
    pub variant_label: Option<String>,
    pub pack_label: Option<String>,
    pub pack_count: Option<f64>,
    pub content_per_pack: Option<f64>,
    pub total_paid: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlmoxMovementRow {
    pub id: String,
    pub item_code: String,
    pub item_description: Option<String>,
    pub movement_type: String,
    pub quantity: f64,
    pub unit_cost: Option<f64>,
    pub reason: Option<String>,
    pub document_ref: Option<String>,
    pub operator_id: Option<String>,
    pub occurred_at: String,
    pub created_at: String,
    pub demand_id: Option<String>,
    pub variant_label: Option<String>,
    pub pack_label: Option<String>,
    pub pack_count: Option<f64>,
    pub content_per_pack: Option<f64>,
    pub total_paid: Option<f64>,
    pub sector: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemStats {
    pub item_code: String,
    pub qty_on_hand: f64,
    pub min_qty: f64,
    pub ideal_qty: f64,
    pub avg_daily_out_30: f64,
    pub avg_daily_out_90: f64,
    pub suggested_buy_qty: f64,
    pub below_min: bool,
    pub erp_qty: Option<f64>,
    /// Custo médio ponderado das entradas (R$ / unidade padrão) nos últimos 30 dias.
    pub avg_unit_cost_30: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseDemandRow {
    pub id: String,
    pub status: String,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub received_at: Option<String>,
    pub items: Vec<PurchaseDemandItemRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseDemandItemRow {
    pub id: String,
    pub demand_id: String,
    pub item_code: String,
    pub item_description: Option<String>,
    pub qty_requested: f64,
    pub qty_received: f64,
    pub unit_cost: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDemandRequest {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub items: Vec<CreateDemandItemRequest>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDemandItemRequest {
    pub item_code: String,
    pub qty_requested: f64,
    pub unit_cost: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDemandStatusRequest {
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveDemandRequest {
    pub items: Vec<ReceiveDemandItemRequest>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveDemandItemRequest {
    pub item_code: String,
    pub qty_received: f64,
    pub unit_cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSearchHit {
    pub code: String,
    pub description: String,
    pub unit: String,
    pub category_id: Option<String>,
    pub already_linked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentPecaStat {
    pub item_code: String,
    pub description: Option<String>,
    pub qty_on_hand: f64,
    pub lifespan_days: Option<i32>,
    pub expected_lifespan_days: Option<i32>,
    pub installed_at: Option<String>,
    pub last_replaced_at: Option<String>,
    pub times_replaced: i64,
    pub avg_usage_days: Option<f64>,
    pub next_exchange_at: Option<String>,
    pub exchange_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentRow {
    pub id: String,
    pub code: String,
    pub name: String,
    pub sector: Option<String>,
    pub status: String,
    pub brand: Option<String>,
    pub model: Option<String>,
    pub manufacture_year: Option<i32>,
    pub serial_number: Option<String>,
    pub maintenance_interval_days: Option<i32>,
    pub last_maintenance_at: Option<String>,
    pub next_maintenance_at: Option<String>,
    pub notes: Option<String>,
    pub peca_codes: Vec<String>,
    pub cover_photo: Option<String>,
    pub total_spent: f64,
    pub open_maintenances: i64,
    #[serde(default)]
    pub pecas: Vec<EquipmentPecaStat>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquipmentPecaInput {
    pub item_code: String,
    pub installed_at: Option<String>,
    pub expected_lifespan_days: Option<i32>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertEquipmentRequest {
    pub code: String,
    pub name: String,
    pub sector: Option<String>,
    pub status: Option<String>,
    pub brand: Option<String>,
    pub model: Option<String>,
    pub manufacture_year: Option<i32>,
    pub serial_number: Option<String>,
    pub maintenance_interval_days: Option<i32>,
    pub next_maintenance_at: Option<String>,
    pub notes: Option<String>,
    pub peca_codes: Option<Vec<String>>,
    pub pecas: Option<Vec<EquipmentPecaInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenancePartRow {
    pub item_code: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub replaced: bool,
    pub unit_cost: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenancePartInput {
    pub item_code: String,
    pub quantity: Option<f64>,
    pub replaced: Option<bool>,
    pub unit_cost: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceRow {
    pub id: String,
    pub equipment_id: String,
    pub equipment_code: Option<String>,
    pub equipment_name: Option<String>,
    pub kind: String,
    pub status: String,
    pub routine: Option<String>,
    pub item_code: Option<String>,
    pub item_description: Option<String>,
    pub quantity: f64,
    pub technician: Option<String>,
    pub cost: Option<f64>,
    pub notes: Option<String>,
    pub occurred_at: String,
    pub scheduled_at: Option<String>,
    pub completed_at: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub parts: Vec<MaintenancePartRow>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMaintenanceRequest {
    pub equipment_id: String,
    pub kind: String,
    pub status: Option<String>,
    pub routine: Option<String>,
    pub item_code: Option<String>,
    pub quantity: Option<f64>,
    pub technician: Option<String>,
    pub cost: Option<f64>,
    pub notes: Option<String>,
    pub occurred_at: Option<String>,
    pub scheduled_at: Option<String>,
    pub consume_stock: Option<bool>,
    pub parts: Option<Vec<MaintenancePartInput>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMaintenanceRequest {
    pub status: Option<String>,
    pub routine: Option<String>,
    pub technician: Option<String>,
    pub cost: Option<f64>,
    pub notes: Option<String>,
    pub completed_at: Option<String>,
    pub scheduled_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlmoxDashboardStats {
    pub total_items: i64,
    pub total_almox_items: i64,
    pub total_supermercado_items: i64,
    pub total_pecas_items: i64,
    pub almox_below_min: i64,
    pub supermercado_below_min: i64,
    pub pecas_below_min: i64,
    pub pecas_overdue: i64,
    pub pecas_due_soon: i64,
    pub total_equipments: i64,
    pub equipments_in_operation: i64,
    pub equipments_in_maintenance: i64,
    pub equipments_stopped: i64,
    pub open_maintenances: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstoqueFotoRow {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub photo_data: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddFotoRequest {
    pub photo_data: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlmoxConsumptionData {
    pub consumption_yoy: Vec<ConsumptionYoYItem>,
    pub monthly_consumption: Vec<MonthlyConsumptionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumptionYoYItem {
    pub year: i32,
    pub quantity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyConsumptionItem {
    pub month: String,
    pub quantity: f64,
}
