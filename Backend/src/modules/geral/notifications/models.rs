use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubNotification {
    pub id: String,
    pub module_key: String,
    pub kind: String,
    pub title: String,
    pub message: String,
    pub read: bool,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotificationInput {
    pub module_key: String,
    pub kind: String,
    pub title: String,
    pub message: String,
    #[serde(default)]
    pub metadata: Option<String>,
}
