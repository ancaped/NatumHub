use serde::{Deserialize, Serialize};

/// Status do feedback na triagem admin.
/// pending → queued/in_progress → awaiting_review (Em aberto) → resolved | wont_fix
/// Fonte de verdade: Postgres. Agente grava nota em feedback_notes e move para awaiting_review.
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
    /// Presente na listagem admin (sem payload pesado).
    #[serde(default)]
    pub has_logs: bool,
    #[serde(default)]
    pub has_screenshot: bool,
    /// Quantidade de notas em `feedback_notes` (listagem).
    #[serde(default)]
    pub notes_count: i32,
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
