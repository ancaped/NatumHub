use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevolucaoItemIn {
    pub item_code: String,
    pub description: Option<String>,
    pub qty: f64,
    pub lotes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDevolucaoRequest {
    pub client_code: Option<String>,
    pub client_name: String,
    pub return_date: Option<String>,
    pub nf_number: Option<String>,
    pub receiver_name: Option<String>,
    pub carrier_name: Option<String>,
    pub notes: Option<String>,
    pub items: Vec<DevolucaoItemIn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDevolucaoRequest {
    pub client_code: Option<String>,
    pub client_name: Option<String>,
    pub return_date: Option<String>,
    pub nf_number: Option<String>,
    pub receiver_name: Option<String>,
    pub carrier_name: Option<String>,
    pub notes: Option<String>,
    pub items: Option<Vec<DevolucaoItemIn>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConferirItemRequest {
    pub qty_conferida: Option<f64>,
    pub analise_obs: Option<String>,
    pub disposicao: Option<String>,
    pub disposicao_obs: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErpItemRequest {
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevolucaoItemOut {
    pub id: i64,
    pub item_code: String,
    pub description: String,
    pub qty: f64,
    pub lotes: String,
    pub qty_conferida: Option<f64>,
    pub analise_obs: Option<String>,
    pub disposicao: Option<String>,
    pub disposicao_obs: Option<String>,
    pub erp_status: String,
    pub erp_by: Option<String>,
    pub erp_at: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevolucaoOut {
    pub id: i64,
    pub register_number: String,
    pub status: String,
    pub client_code: String,
    pub client_name: String,
    pub return_date: String,
    pub nf_number: String,
    pub receiver_name: String,
    pub carrier_name: String,
    pub notes: Option<String>,
    pub received_by: Option<String>,
    pub received_at: Option<String>,
    pub cq_by: Option<String>,
    pub cq_at: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub items: Vec<DevolucaoItemOut>,
}
