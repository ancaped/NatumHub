use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

pub fn deserialize_flexible_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<Value>::deserialize(deserializer)?;
    match opt {
        Some(Value::String(s)) => Ok(s),
        Some(Value::Number(n)) => Ok(n.to_string()),
        _ => Ok(String::new()),
    }
}

pub fn deserialize_flexible_f64<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<Value>::deserialize(deserializer)?;
    match opt {
        Some(Value::Number(n)) => Ok(n.as_f64().unwrap_or(0.0)),
        Some(Value::String(s)) => Ok(s.parse::<f64>().unwrap_or(0.0)),
        _ => Ok(0.0),
    }
}

pub fn deserialize_flexible_user<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<Value>::deserialize(deserializer)?;
    match opt {
        Some(Value::String(s)) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed.to_string()))
            }
        }
        Some(Value::Object(map)) => {
            if let Some(Value::String(name)) = map.get("displayName") {
                Ok(Some(name.clone()))
            } else if let Some(Value::String(name)) = map.get("display_name") {
                Ok(Some(name.clone()))
            } else if let Some(Value::String(username)) = map.get("username") {
                Ok(Some(username.clone()))
            } else {
                Ok(None)
            }
        }
        _ => Ok(None),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatusHistoryEntry {
    pub id: i64,
    pub lote_number: String,
    pub status: String,
    pub category: Option<String>,
    pub changed_by: Option<String>,
    pub changed_at: String,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcompanhamentoLoteItem {
    pub lote_number: String,
    pub product_code: String,
    pub product_description: String,
    pub quantity: f64,       // Quantidade em unidades (frascos)
    pub quantity_kg: f64,    // Peso em kg do lote completo
    pub date: String,
    pub erp_status: String,
    pub erp_status_label: String,
    pub custom_status: Option<String>,
    pub category: Option<String>,
    pub updated_by: Option<String>,
    pub updated_at: Option<String>,
    pub notes: Option<String>,
    pub data_pesagem: Option<String>,
    pub data_producao: Option<String>,
    pub data_liberado_envase: Option<String>,
    pub data_envase: Option<String>,
    pub data_rotulagem: Option<String>,
    pub data_finalizada: Option<String>,
    pub data_em_espera: Option<String>,
    pub data_previsao: Option<String>,
    pub motivo_espera: Option<String>,
    pub is_terceirizado: bool,
    pub ficha_ordem: Option<serde_json::Value>,
    pub quantidade_envasada_parcial: Option<f64>,
    pub insumo_faltante_codigo: Option<String>,
    pub insumo_faltante_descricao: Option<String>,
    pub fornecedor_terceirizado: Option<String>,
    pub historico_reagendamentos: Option<serde_json::Value>,
    pub quadros_ocultos: Option<serde_json::Value>,
    pub etapas_status: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadroAcaoPayload {
    pub quadro: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLoteEtapaStatusPayload {
    pub etapa: String,
    pub status: String,
    pub motivo_espera: Option<String>,
    pub insumo_faltante_codigo: Option<String>,
    pub insumo_faltante_descricao: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLoteCustomStatusPayload {
    pub lote_number: String,
    pub custom_status: String,
    pub category: Option<String>,
    pub updated_by: Option<String>,
    pub notes: Option<String>,
    pub motivo_espera: Option<String>,
    pub is_terceirizado: Option<bool>,
    pub ficha_ordem: Option<serde_json::Value>,
    pub quantidade_envasada_parcial: Option<f64>,
    pub insumo_faltante_codigo: Option<String>,
    pub insumo_faltante_descricao: Option<String>,
    pub fornecedor_terceirizado: Option<String>,
    pub etapas_status: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFichaOrdemPayload {
    pub lote_number: String,
    pub ficha_ordem: serde_json::Value,
    pub quantidade_envasada_parcial: Option<f64>,
    pub custom_status: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchLoteCustomStatusPayload {
    pub lote_numbers: Vec<String>,
    pub custom_status: Option<String>,
    pub category: Option<String>,
    pub updated_by: Option<String>,
    pub notes: Option<String>,
    pub motivo_espera: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveLotePrevisaoPayload {
    pub data_previsao: Option<String>,
    pub updated_by: Option<String>,
    pub fornecedor_terceirizado: Option<String>,
}

impl<'de> Deserialize<'de> for SaveLotePrevisaoPayload {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let v = serde_json::Value::deserialize(deserializer)?;
        let data_previsao = v
            .get("dataPrevisao")
            .or_else(|| v.get("data_previsao"))
            .and_then(|val| val.as_str())
            .map(|s| s.to_string());
        let updated_by = v
            .get("updatedBy")
            .or_else(|| v.get("updated_by"))
            .and_then(|val| val.as_str())
            .map(|s| s.to_string());
        let fornecedor_terceirizado = v
            .get("fornecedorTerceirizado")
            .or_else(|| v.get("fornecedor_terceirizado"))
            .and_then(|val| val.as_str())
            .map(|s| s.to_string());

        Ok(SaveLotePrevisaoPayload {
            data_previsao,
            updated_by,
            fornecedor_terceirizado,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLoteTimestampsPayload {
    #[serde(alias = "lote_number")]
    pub lote_number: String,
    #[serde(alias = "data_pesagem")]
    pub data_pesagem: Option<String>,
    #[serde(alias = "data_producao")]
    pub data_producao: Option<String>,
    #[serde(alias = "data_liberado_envase")]
    pub data_liberado_envase: Option<String>,
    #[serde(alias = "data_envase")]
    pub data_envase: Option<String>,
    #[serde(alias = "data_rotulagem")]
    pub data_rotulagem: Option<String>,
    #[serde(alias = "data_finalizada")]
    pub data_finalizada: Option<String>,
    #[serde(alias = "data_previsao")]
    pub data_previsao: Option<String>,
    #[serde(alias = "updated_by")]
    pub updated_by: Option<String>,
}


#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerceirizadoSolicitacaoItem {
    pub id: i64,
    pub product_code: String,
    pub product_description: String,
    pub quantity: f64,
    pub unit: String,
    pub quantity_kg: Option<f64>,
    pub quantity_un: Option<f64>,
    pub status: String, // 'SOLICITADO', 'APROVADO', 'VINCULADO', 'CANCELADO'
    pub lote_number: Option<String>,
    pub fornecedor: Option<String>,
    pub previsao_entrega: Option<String>,
    pub observacoes: Option<String>,
    pub solicitado_por: Option<String>,
    pub aprovacao_embalagem: bool,
    pub aprovacao_embalagem_por: Option<String>,
    pub aprovacao_embalagem_em: Option<String>,
    pub aprovacao_materia_prima: bool,
    pub aprovacao_materia_prima_por: Option<String>,
    pub aprovacao_materia_prima_em: Option<String>,
    pub created_at: String,
    pub vinculado_em: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerceirizadoSolicitacaoPayload {
    pub product_code: String,
    pub product_description: Option<String>,
    pub quantity: f64,
    pub unit: Option<String>,
    pub quantity_kg: Option<f64>,
    pub quantity_un: Option<f64>,
    pub fornecedor: Option<String>,
    pub previsao_entrega: Option<String>,
    pub observacoes: Option<String>,
    pub solicitado_por: Option<String>,
    pub lote_number: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AprovarTerceirizadoPayload {
    pub tipo: String, // "embalagem" ou "materia_prima"
    pub aprovado: bool,
    pub aprovado_por: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTerceirizadoPrevisaoPayload {
    pub previsao_entrega: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProdutoTerceirizadoLookup {
    pub codigo: String,
    pub descricao: String,
    pub peso_unitario_kg: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VincularTerceirizadoPayload {
    pub lote_number: String,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcompanhamentoQueryParams {
    pub search: Option<String>,
    pub status_erp: Option<String>,
    pub status_nosso: Option<String>,
    pub categoria: Option<String>,
    pub date_start: Option<String>,
    pub date_end: Option<String>,
    pub limit: Option<i64>,
    pub apenas_terceirizados: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SheetsSyncConfig {
    pub webhook_url: Option<String>,
    pub spreadsheet_url: Option<String>,
    pub auto_sync: bool,
    pub last_sync_at: Option<String>,
    pub last_sync_status: Option<String>,
    pub last_sync_count: Option<usize>,
    pub last_sync_error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSheetsConfigPayload {
    pub webhook_url: Option<String>,
    pub spreadsheet_url: Option<String>,
    pub auto_sync: Option<bool>,
    pub clear_error: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgramacaoEnvaseItem {
    pub id: i64,
    pub data_programada: String,
    pub linha: String,
    pub ordem: i32,
    pub lote_number: String,
    pub product_code: String,
    pub product_description: String,
    pub quantity: f64,
    pub quantity_kg: f64,
    pub categoria_envase: String,
    pub is_colorido: bool,
    pub cor: Option<String>,
    pub status_envase: String,
    pub observacoes: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProgramacaoEnvasePayload {
    pub id: Option<i64>,
    pub data_programada: String,
    pub linha: String,
    pub ordem: Option<i32>,
    pub lote_number: String,
    #[serde(default, deserialize_with = "deserialize_flexible_string")]
    pub product_code: String,
    #[serde(default, deserialize_with = "deserialize_flexible_string")]
    pub product_description: String,
    #[serde(default, deserialize_with = "deserialize_flexible_f64")]
    pub quantity: f64,
    #[serde(default, deserialize_with = "deserialize_flexible_f64")]
    pub quantity_kg: f64,
    pub categoria_envase: String,
    pub is_colorido: Option<bool>,
    pub cor: Option<String>,
    pub status_envase: Option<String>,
    pub observacoes: Option<String>,
    #[serde(default, deserialize_with = "deserialize_flexible_user")]
    pub created_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderProgramacaoEnvaseItem {
    pub id: i64,
    pub linha: String,
    pub ordem: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderProgramacaoEnvasePayload {
    pub items: Vec<ReorderProgramacaoEnvaseItem>,
}

#[derive(Debug, Deserialize)]
pub struct ProgramacaoRotulagemQuery {
    pub data: Option<String>,
    pub tipo: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgramacaoRotulagemItem {
    pub id: i64,
    pub data_programada: String,
    pub tipo: String, // 'MAQUINA' | 'MANUAL'
    pub ordem: i32,
    pub lote_number: String,
    pub product_code: String,
    pub product_description: String,
    pub quantity: f64,
    pub quantity_kg: f64,
    pub status_rotulagem: String,
    pub observacoes: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProgramacaoRotulagemPayload {
    pub id: Option<i64>,
    pub data_programada: String,
    pub tipo: String,
    pub ordem: Option<i32>,
    pub lote_number: String,
    #[serde(default, deserialize_with = "deserialize_flexible_string")]
    pub product_code: String,
    #[serde(default, deserialize_with = "deserialize_flexible_string")]
    pub product_description: String,
    #[serde(default, deserialize_with = "deserialize_flexible_f64")]
    pub quantity: f64,
    #[serde(default, deserialize_with = "deserialize_flexible_f64")]
    pub quantity_kg: f64,
    pub status_rotulagem: Option<String>,
    pub observacoes: Option<String>,
    #[serde(default, deserialize_with = "deserialize_flexible_user")]
    pub created_by: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderProgramacaoRotulagemItem {
    pub id: i64,
    pub tipo: String,
    pub ordem: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderProgramacaoRotulagemPayload {
    pub items: Vec<ReorderProgramacaoRotulagemItem>,
}


