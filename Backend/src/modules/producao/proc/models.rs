use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcItem {
    pub id: String,
    pub codigo_produto: Option<String>,
    pub descricao: String,
    pub proc: Option<String>,
    pub status: String, // 'ATIVO', 'EM_BRANCO', 'CANCELADO', 'VENCIDO'
    pub observacoes: Option<String>,
    pub categoria_familia: Option<String>,
    pub processo_instrucoes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProcPayload {
    pub codigo_produto: Option<String>,
    pub descricao: String,
    pub proc: Option<String>,
    pub status: Option<String>,
    pub observacoes: Option<String>,
    pub categoria_familia: Option<String>,
    pub processo_instrucoes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProcPayload {
    pub codigo_produto: Option<String>,
    pub descricao: Option<String>,
    pub proc: Option<String>,
    pub status: Option<String>,
    pub observacoes: Option<String>,
    pub categoria_familia: Option<String>,
    pub processo_instrucoes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcSummaryMetrics {
    pub total: i64,
    pub ativos: i64,
    pub em_branco: i64,
    pub familias: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcGenerateRequest {
    pub descricao: String,
    pub codigo_produto: Option<String>,
    pub categoria_familia: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcStep {
    pub ordem: i32,
    pub titulo: String,
    pub descricao: String,
    pub temperatura: Option<String>,
    pub agitacao: Option<String>,
    pub tempo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcGenerateResponse {
    pub descricao: String,
    pub codigo_produto: Option<String>,
    pub categoria_familia: String,
    pub categoria_label: String,
    pub sugerido_proc_base: Option<String>,
    pub similares_referencia: Vec<ProcItem>,
    pub ph_faixa_sugerida: String,
    pub viscosidade_faixa_sugerida: String,
    pub densidade_faixa_sugerida: String,
    pub aspecto_sugerido: String,
    pub cor_sugerida: String,
    pub odor_sugerido: String,
    pub equipamentos_recomendados: Vec<String>,
    pub epis_recomendados: Vec<String>,
    pub etapas: Vec<ProcStep>,
    pub processo_texto_formatado: String,
}
