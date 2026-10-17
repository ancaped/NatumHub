use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocFamily {
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub warn_days: Vec<i32>,
    pub requires_payment: bool,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FamilyInput {
    pub name: String,
    pub code: Option<String>,
    pub warn_days: Option<Vec<i32>>,
    pub requires_payment: Option<bool>,
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocType {
    pub id: String,
    pub family_id: String,
    pub name: String,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeInput {
    pub family_id: String,
    pub name: String,
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentFile {
    pub id: String,
    pub document_id: String,
    pub kind: String,
    pub original_name: String,
    pub rel_path: String,
    pub size_bytes: i64,
    pub uploaded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub family_id: String,
    pub type_id: Option<String>,
    pub title: String,
    pub physical_location: Option<String>,
    pub physical_tag: Option<String>,
    pub issued_at: Option<String>,
    pub valid_until: Option<String>,
    pub payment_status: String,
    pub payment_amount: Option<f64>,
    pub payment_due_at: Option<String>,
    pub payment_method: Option<String>,
    pub payment_paid_at: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub family_name: Option<String>,
    pub type_name: Option<String>,
    pub files: Vec<DocumentFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInput {
    pub family_id: String,
    pub type_id: Option<String>,
    pub title: String,
    pub physical_location: Option<String>,
    pub physical_tag: Option<String>,
    pub issued_at: Option<String>,
    pub valid_until: Option<String>,
    pub payment_status: Option<String>,
    pub payment_amount: Option<f64>,
    pub payment_due_at: Option<String>,
    pub payment_method: Option<String>,
    pub payment_paid_at: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DocumentsQuery {
    pub search: Option<String>,
    pub family_id: Option<String>,
    pub payment_status: Option<String>,
    pub pending_only: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckAlertsResult {
    pub created: i32,
}
