use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LabelTemplate {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub orientation: String,
    pub elements_json: serde_json::Value,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateLabelTemplatePayload {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    #[serde(alias = "widthMm")]
    pub width_mm: Option<f64>,
    #[serde(alias = "heightMm")]
    pub height_mm: Option<f64>,
    pub orientation: Option<String>,
    #[serde(alias = "elementsJson")]
    pub elements_json: serde_json::Value,
    #[serde(alias = "isDefault")]
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateLabelTemplatePayload {
    pub name: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
    #[serde(alias = "widthMm")]
    pub width_mm: Option<f64>,
    #[serde(alias = "heightMm")]
    pub height_mm: Option<f64>,
    pub orientation: Option<String>,
    #[serde(alias = "elementsJson")]
    pub elements_json: Option<serde_json::Value>,
    #[serde(alias = "isDefault")]
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LabelPrintHistoryRecord {
    pub id: Uuid,
    pub template_id: Option<Uuid>,
    pub template_name: String,
    pub product_code: Option<String>,
    pub product_name: Option<String>,
    pub lot_number: Option<String>,
    pub operator_id: Option<String>,
    pub operator_name: Option<String>,
    pub copies: i32,
    pub printer_name: Option<String>,
    pub printed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePrintHistoryPayload {
    pub template_id: Option<Uuid>,
    pub template_name: String,
    pub product_code: Option<String>,
    pub product_name: Option<String>,
    pub lot_number: Option<String>,
    pub copies: Option<i32>,
    pub printer_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogProductInfo {
    pub codigo: String,
    pub descricao: String,
    pub codigo_barras: Option<String>,
    pub codigo_barras_caixa: Option<String>,
    pub quantidade_caixa: Option<i32>,
    pub linha: Option<String>,
    pub categoria: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductionLotItem {
    pub id: i32,
    pub codigo: String,
    pub descricao: String,
    pub lote: String,
    pub quantidade: i32,
    pub data_producao: Option<String>,
    pub codigo_barras: Option<String>,
    pub codigo_barras_caixa: Option<String>,
}
