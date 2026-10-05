use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualOrderItemIn {
    pub item_code: String,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub qty: f64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateManualOrderRequest {
    pub kind: String,
    /// Ex.: "Venda", "Uso/Interno" — texto livre vinculado à ordem.
    pub record_type: String,
    pub partner_name: String,
    pub order_date: Option<String>,
    pub notes: Option<String>,
    pub items: Vec<ManualOrderItemIn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateManualOrderRequest {
    pub kind: Option<String>,
    pub record_type: Option<String>,
    pub partner_name: Option<String>,
    pub order_date: Option<String>,
    pub notes: Option<String>,
    pub items: Option<Vec<ManualOrderItemIn>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualOrderItemOut {
    pub id: i64,
    pub item_code: String,
    pub description: String,
    pub unit: String,
    pub qty: f64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualOrderOut {
    pub id: i64,
    pub order_number: String,
    pub kind: String,
    pub record_type: String,
    pub partner_name: String,
    pub order_date: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub posted_by: Option<String>,
    pub posted_at: Option<String>,
    pub items: Vec<ManualOrderItemOut>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSearchHit {
    pub code: String,
    pub description: String,
    pub unit: String,
    pub category_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingByItem {
    pub item_code: String,
    pub entrada: f64,
    pub saida: f64,
    pub net: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordTypeOut {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRecordTypeRequest {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSheetBlockRequest {
    pub kind: String,
    pub quantity: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetRegisterOut {
    pub id: i64,
    pub register_number: String,
    pub kind: String,
    pub status: String,
    pub created_by: Option<String>,
    pub created_at: String,
    pub conferred_by: Option<String>,
    pub conferred_at: Option<String>,
}
