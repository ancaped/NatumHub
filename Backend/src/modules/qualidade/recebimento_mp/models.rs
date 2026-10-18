use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecebimentoErpItem {
    pub registro: i32,
    pub fornecedor: String,
    pub nota: i32,
    pub codigo_ref: String,
    pub insumo_desc: String,
    pub unidade: String,
    pub quantidade: f64,
    pub data_entrada: String,
    pub lote_fornec: String,
    pub data_validade: String,
    pub codigo_receb: String,
    pub status_erp: String,
    pub usuario_erp: String,
    pub n_registro: Option<i32>,
    pub laudo_id: Option<i32>,
    pub codigo_laudo: Option<String>,
    pub laudo_parecer: Option<String>,
    pub classificacao: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaudoEnsaio {
    pub ensaio: String,
    pub especificacao: String,
    pub resultado: String,
    pub conforme: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaudoItem {
    pub id: i32,
    pub codigo_laudo: String,
    pub registro_erp: i32,
    pub codigo_receb: String,
    pub codigo_ref: String,
    pub insumo_nome: String,
    pub fornecedor_nome: String,
    pub nota_fiscal: String,
    pub lote_fornecedor: String,
    pub quantidade_total: f64,
    pub unidade: String,
    pub data_entrada: Option<NaiveDate>,
    pub data_validade: Option<NaiveDate>,
    pub data_analise: NaiveDate,
    pub responsavel_cq: String,
    pub parecer: String,
    pub ensaios: Vec<LaudoEnsaio>,
    pub observacoes: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateLaudoRequest {
    pub registro_erp: i32,
    pub codigo_receb: String,
    pub codigo_ref: String,
    pub insumo_nome: String,
    pub fornecedor_nome: String,
    pub nota_fiscal: String,
    pub lote_fornecedor: String,
    pub quantidade_total: f64,
    pub unidade: String,
    pub data_entrada: Option<String>,
    pub data_validade: Option<String>,
    pub data_analise: Option<String>,
    pub responsavel_cq: String,
    pub parecer: String,
    pub ensaios: Vec<LaudoEnsaio>,
    pub observacoes: Option<String>,
    pub criar_amostra_retencao: Option<bool>,
    pub localizacao_amostra: Option<String>,
    pub quantidade_amostra: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateLaudoRequest {
    pub data_analise: Option<String>,
    pub responsavel_cq: String,
    pub parecer: String,
    pub ensaios: Vec<LaudoEnsaio>,
    pub observacoes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AmostraItem {
    pub id: i32,
    pub codigo_amostra: String,
    pub laudo_id: Option<i32>,
    pub codigo_receb: String,
    pub insumo_nome: String,
    pub lote: String,
    pub fornecedor: String,
    pub data_coleta: NaiveDate,
    pub data_validade_retencao: Option<NaiveDate>,
    pub localizacao: String,
    pub quantidade_amostra: String,
    pub status: String,
    pub responsavel: String,
    pub observacoes: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateAmostraRequest {
    pub laudo_id: Option<i32>,
    pub codigo_receb: String,
    pub insumo_nome: String,
    pub lote: String,
    pub fornecedor: String,
    pub data_coleta: Option<String>,
    pub data_validade_retencao: Option<String>,
    pub localizacao: Option<String>,
    pub quantidade_amostra: Option<String>,
    pub status: Option<String>,
    pub responsavel: Option<String>,
    pub observacoes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAmostraRequest {
    pub data_validade_retencao: Option<String>,
    pub localizacao: String,
    pub quantidade_amostra: String,
    pub status: String,
    pub responsavel: String,
    pub observacoes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ErpFilterQuery {
    pub search: Option<String>,
    pub classificacao: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
