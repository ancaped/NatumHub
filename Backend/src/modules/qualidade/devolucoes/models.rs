use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevolucaoItemIn {
    pub item_code: String,
    pub description: Option<String>,
    pub qty: f64,
    pub lotes: Option<String>,
    #[serde(default)]
    pub caixa_fechada: Option<bool>,
    pub unidades_por_caixa: Option<i32>,
    pub disposicao: Option<String>,
    pub disposicao_obs: Option<String>,
    pub qty_conferida: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDevolucaoRequest {
    pub client_code: Option<String>,
    #[serde(default)]
    pub client_name: String,
    pub return_date: Option<String>,
    pub nf_number: Option<String>,
    pub receiver_name: Option<String>,
    pub carrier_name: Option<String>,
    pub notes: Option<String>,
    pub volume_count: Option<i32>,
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
    pub volume_count: Option<i32>,
    pub items: Option<Vec<DevolucaoItemIn>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConferirItemRequest {
    pub qty_conferida: Option<f64>,
    pub analise_obs: Option<String>,
    pub disposicao: Option<String>,
    pub disposicao_obs: Option<String>,
    pub lotes: Option<String>,
    pub caixa_fechada: Option<bool>,
    pub unidades_por_caixa: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DividirItemRequest {
    pub qty: f64,
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
    pub caixa_fechada: bool,
    pub unidades_por_caixa: Option<i32>,
    pub qty_conferida: Option<f64>,
    pub analise_obs: Option<String>,
    pub disposicao: Option<String>,
    pub disposicao_obs: Option<String>,
    pub erp_status: String,
    pub erp_by: Option<String>,
    pub erp_at: Option<String>,
    pub sort_order: i32,
    pub fq_ph_original: Option<f64>,
    pub fq_viscosidade_original: Option<f64>,
    pub fq_densidade_original: Option<f64>,
    pub fq_ph_medido: Option<f64>,
    pub fq_viscosidade_medido: Option<f64>,
    pub fq_densidade_medido: Option<f64>,
    pub fq_resultado: Option<String>,
    pub fq_responsavel: Option<String>,
    pub fq_observacao: Option<String>,
    pub fq_at: Option<String>,
    pub foto_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemLookupOut {
    pub lote: String,
    pub product_code: String,
    pub description: String,
    pub ph: Option<f64>,
    pub viscosidade: Option<f64>,
    pub densidade: Option<f64>,
    pub unidades_por_caixa: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoteSpecsOut {
    pub ph: Option<f64>,
    pub viscosidade: Option<f64>,
    pub densidade: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnaliseFqRequest {
    pub ph_medido: Option<f64>,
    pub viscosidade_medido: Option<f64>,
    pub densidade_medido: Option<f64>,
    pub resultado: String,
    pub observacao: Option<String>,
    /// Quando AP: retornar_estoque ou trocar_embalagem.
    pub disposicao_ap: Option<String>,
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
    pub volume_count: i32,
    pub items: Vec<DevolucaoItemOut>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateControleRequest {
    pub devolucao_ids: Vec<i64>,
    pub volume_count: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetVolumesRequest {
    pub volume_count: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControleItemOut {
    pub id: i64,
    pub item_code: String,
    pub description: String,
    pub qty: f64,
    pub lotes: String,
    pub disposicao: Option<String>,
    pub disposicao_obs: Option<String>,
    pub erp_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControleDevolucaoOut {
    pub id: i64,
    pub register_number: String,
    pub client_code: String,
    pub client_name: String,
    pub return_date: String,
    pub nf_number: String,
    pub carrier_name: String,
    pub receiver_name: String,
    pub notes: Option<String>,
    pub volume_count: i32,
    pub status: String,
    pub item_count: i32,
    pub items: Vec<ControleItemOut>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControleOut {
    pub id: i64,
    pub sheet_number: String,
    pub status: String,
    pub volume_count: i32,
    pub created_by: Option<String>,
    pub returned_by: Option<String>,
    pub returned_at: Option<String>,
    pub created_at: String,
    pub devolucao_count: i32,
    pub devolucoes: Vec<ControleDevolucaoOut>,
}
