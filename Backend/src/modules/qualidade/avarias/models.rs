use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvariaOut {
    pub id: i64,
    pub register_number: String,
    pub item_code: String,
    pub description: String,
    pub lote: String,
    pub qty: f64,
    pub location: String,
    pub status: String,
    pub notes: Option<String>,
    pub foto_path: Option<String>,
    pub created_by: Option<String>,
    pub decided_by: Option<String>,
    pub decided_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub sheet_number: Option<String>,
    pub sheet_status: Option<String>,
    pub repair_type: Option<String>,
    pub problema: Option<String>,
    pub encaminhamento: Option<String>,
    pub fq_necessaria: bool,
    pub fq_resultado: Option<String>,
    pub fq_observacao: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertAvariaRequest {
    pub item_code: String,
    pub description: String,
    pub lote: Option<String>,
    pub qty: f64,
    pub location: Option<String>,
    pub status: Option<String>,
    pub notes: Option<String>,
    pub repair_type: Option<String>,
    pub problema: Option<String>,
    pub encaminhamento: Option<String>,
    pub fq_necessaria: Option<bool>,
    pub fq_resultado: Option<String>,
    pub fq_observacao: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
    pub q: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LookupQuery {
    pub q: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemLookupOut {
    pub lote: String,
    pub product_code: String,
    pub description: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolhaRequest {
    pub destination: String,
    pub avaria_ids: Vec<i64>,
    pub box_count: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolhaItemOut {
    pub avaria_id: i64,
    pub register_number: String,
    pub item_code: String,
    pub description: String,
    pub lote: String,
    pub qty: f64,
    pub location: String,
    pub status: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolhaOut {
    pub id: i64,
    pub sheet_number: String,
    pub destination: String,
    pub status: String,
    pub created_by: Option<String>,
    pub returned_by: Option<String>,
    pub returned_at: Option<String>,
    pub created_at: String,
    pub item_count: i64,
    pub box_count: i32,
    pub items: Vec<FolhaItemOut>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FolhaPendingQuery {
    pub destination: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCaixasRequest {
    pub box_count: i32,
}
