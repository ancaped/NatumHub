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
