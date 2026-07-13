use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::handlers::AppState;

#[derive(Debug, Deserialize, Serialize)]
pub struct GoogleConfig {
    pub client_id: String,
    pub client_secret: String,
}

// GET /api/google/status
pub async fn get_google_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let client_id = state.db.get_setting("google_client_id").await.unwrap_or(None);
    let client_configured = client_id.is_some() && !client_id.as_ref().unwrap().is_empty();
    let is_authenticated = state.db.get_setting("google_access_token").await.unwrap_or(None).is_some();
    
    (
        StatusCode::OK,
        Json(json!({
            "configured": client_configured,
            "client_id": client_id.unwrap_or_default(),
            "authenticated": is_authenticated,
            "last_sync": state.db.get_setting("google_last_sync").await.unwrap_or(None).unwrap_or_else(|| "Nunca sincronizado".to_string())
        }))
    ).into_response()
}

// POST /api/google/config
pub async fn save_google_config(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<GoogleConfig>,
) -> impl IntoResponse {
    if let Err(e) = state.db.save_setting("google_client_id", &payload.client_id).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }
    if let Err(e) = state.db.save_setting("google_client_secret", &payload.client_secret).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }
    
    (
        StatusCode::OK,
        Json(json!({ "status": "success", "message": "Configurações do Google Drive salvas com sucesso!" }))
    ).into_response()
}

// GET /api/google/auth-url
pub async fn google_auth_url(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let client_id = match state.db.get_setting("google_client_id").await {
        Ok(Some(id)) if !id.is_empty() => id,
        _ => return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Google Client ID não configurado no servidor" }))
        ).into_response(),
    };

    // Google OAuth 2.0 Auth URL generator placeholder
    let redirect_uri = "http://127.0.0.1:3001/api/google/callback";
    let scope = "https://www.googleapis.com/auth/drive.file";
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        client_id, redirect_uri, scope
    );

    (
        StatusCode::OK,
        Json(json!({ "url": auth_url }))
    ).into_response()
}

// GET /api/google/callback (OAuth redirect endpoint)
#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: String,
}

pub async fn google_callback(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<CallbackQuery>,
) -> impl IntoResponse {
    println!("Recebido Auth Code do Google: {}", query.code);
    
    // In a real implementation, we exchange the code for access/refresh tokens here.
    // We will simulate authentication by saving a mock access token.
    if let Err(e) = state.db.save_setting("google_access_token", "mock_access_token").await {
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao salvar token: {}", e)).into_response();
    }
    if let Err(e) = state.db.save_setting("google_refresh_token", "mock_refresh_token").await {
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro ao salvar refresh token: {}", e)).into_response();
    }

    // Redirect user back to the frontend homepage
    axum::response::Redirect::temporary("http://localhost:5173/").into_response()
}

// POST /api/google/sync — placeholder (backup via resumo ERP / Firebase)
pub async fn trigger_sync(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let access_token = state.db.get_setting("google_access_token").await.unwrap_or(None);
    if access_token.is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Login do Google não autenticado. Favor fazer login primeiro." }))
        ).into_response();
    }

    // In a real implementation, we call the Google Drive API to upload the db file:
    // File: c:\Users\Edson\antigravity\Natum\Producao\backend\natum_producao.db
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    println!("Sincronizando arquivo de banco natum_producao.db com Google Drive em: {}", now);

    if let Err(e) = state.db.save_setting("google_last_sync", &now).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "success",
            "message": format!("Sync Google Drive registrado em: {}", now),
            "last_sync": now
        }))
    ).into_response()
}
