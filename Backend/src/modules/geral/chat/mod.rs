pub mod handlers;
pub mod store;

use std::sync::Arc;
use axum::{routing::{get, post}, Router};
use crate::handlers::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/chat/conversations", get(handlers::get_conversations_handler))
        .route("/api/chat/groups", post(handlers::create_group_handler))
        .route("/api/chat/verify-password", post(handlers::verify_password_handler))
        .route("/api/chat/messages", get(handlers::get_messages_handler).post(handlers::post_message_handler))
        .route("/api/chat/ai", post(handlers::ask_ai_handler))
}
