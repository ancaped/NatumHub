use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};

#[derive(Serialize, Deserialize, Debug, FromRow, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EcommerceLookup {
    pub id: uuid::Uuid,
    pub nome: String,
    pub ativo: bool,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLookupInput {
    pub nome: String,
    pub ativo: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLookupInput {
    pub nome: Option<String>,
    pub ativo: Option<bool>,
}
