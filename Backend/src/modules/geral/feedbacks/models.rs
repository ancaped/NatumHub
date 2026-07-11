use serde::{Deserialize, Serialize};

/// Status do feedback na triagem admin.
/// pending → queued/in_progress → awaiting_review → resolved | wont_fix
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Feedback {
    pub id: String,
    pub feedback_type: String,
    pub description: String,
    pub page: String,
    pub logs: String,
    pub screenshot: String,
    pub status: String,
    pub created_at: Option<String>,
    pub resolved_at: Option<String>,
    #[serde(default)]
    pub requested_by: Option<String>,
    #[serde(default = "default_priority")]
    pub priority: i32,
    #[serde(default)]
    pub admin_notes: Option<String>,
}

fn default_priority() -> i32 {
    100
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackSubmitInput {
    pub id: String,
    pub feedback_type: String,
    pub description: String,
    pub page: String,
    pub logs: String,
    #[serde(default)]
    pub screenshot: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackAdminUpdate {
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub admin_notes: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackReorderItem {
    pub id: String,
    pub priority: i32,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackReorderInput {
    pub items: Vec<FeedbackReorderItem>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackNote {
    pub id: String,
    pub feedback_id: String,
    pub author: String,
    pub body: String,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackNoteInput {
    pub body: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackDetail {
    #[serde(flatten)]
    pub feedback: Feedback,
    pub notes: Vec<FeedbackNote>,
}
