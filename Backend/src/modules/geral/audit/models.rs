use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub created_at: String,
    pub actor_id: Option<String>,
    pub actor_name: Option<String>,
    pub device_id: Option<String>,
    pub module_key: Option<String>,
    pub action: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub summary: String,
    pub before_json: Option<Value>,
    pub after_json: Option<Value>,
    pub request_method: Option<String>,
    pub request_path: Option<String>,
    pub provenance: String,
}

#[derive(Debug, Deserialize)]
pub struct AuditListQuery {
    pub limit: Option<i64>,
    pub module_key: Option<String>,
    pub actor_id: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuditRecord<'a> {
    pub module_key: Option<&'a str>,
    pub action: &'a str,
    pub entity_type: Option<&'a str>,
    pub entity_id: Option<&'a str>,
    pub summary: &'a str,
    pub before: Option<Value>,
    pub after: Option<Value>,
    pub request_method: Option<&'a str>,
    pub request_path: Option<&'a str>,
    pub provenance: &'a str,
}
