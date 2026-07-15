use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};

#[derive(Serialize, Deserialize, Debug, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EcommerceOrder {
    pub id: uuid::Uuid,
    pub data_emissao: DateTime<Utc>,
    pub numero_nf: String,
    pub nome_cliente: String,
    pub observacoes: Option<String>,
    pub plataforma: String,
    pub plataforma_envio: String,
    pub status: String,
    pub quem_separou: Option<String>,
    pub pagamento_ok: bool,
    pub frete_ok: bool,
    pub data_envio: Option<DateTime<Utc>>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEcommerceOrderInput {
    pub data_emissao: DateTime<Utc>,
    pub numero_nf: String,
    pub nome_cliente: String,
    pub observacoes: Option<String>,
    pub plataforma: String,
    pub plataforma_envio: String,
    pub status: String,
    pub quem_separou: Option<String>,
    pub pagamento_ok: bool,
    pub frete_ok: bool,
    pub data_envio: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEcommerceOrderInput {
    pub data_emissao: Option<DateTime<Utc>>,
    pub numero_nf: Option<String>,
    pub nome_cliente: Option<String>,
    pub observacoes: Option<String>,
    pub plataforma: Option<String>,
    pub plataforma_envio: Option<String>,
    pub status: Option<String>,
    pub quem_separou: Option<String>,
    pub pagamento_ok: Option<bool>,
    pub frete_ok: Option<bool>,
    pub data_envio: Option<DateTime<Utc>>,
}
