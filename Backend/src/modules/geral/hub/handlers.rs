use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::core::app_config::{load_client_config, save_client_config as persist_client_config, ClientConfig};
use crate::handlers::AppState;

/// Ambiente e nome do servidor (`NEXUS_AMBIENTE` = "producao" | "teste"; `NEXUS_NOME` = texto curto).
/// Ausente ou inválido cai em "producao" e nome vazio.
fn ambiente_do_servidor(ambiente: Option<&str>, nome: Option<&str>) -> (&'static str, String) {
    let ambiente = match ambiente.map(|a| a.trim().to_lowercase()).as_deref() {
        Some("teste") => "teste",
        _ => "producao",
    };
    let nome: String = nome
        .unwrap_or("")
        .trim()
        .chars()
        .filter(|c| !c.is_control())
        .take(24)
        .collect();
    (ambiente, nome)
}

/// GET /api/health — API local + ping PostgreSQL.
pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let (ambiente, nome_servidor) = ambiente_do_servidor(
        std::env::var("NEXUS_AMBIENTE").ok().as_deref(),
        std::env::var("NEXUS_NOME").ok().as_deref(),
    );
    let cfg = load_client_config();
    let (db_provider, db_host_masked) = crate::core::pg_db::database_connection_meta()
        .unwrap_or_else(|_| ("unknown".to_string(), "(desconhecido)".to_string()));
    let started = std::time::Instant::now();
    let db_ok = sqlx::query("SELECT 1")
        .execute(state.db.pool())
        .await
        .is_ok();
    let db_latency_ms = started.elapsed().as_millis() as u64;

    if !db_ok {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "degraded",
                "error": "Database unavailable",
                "database": "postgresql",
                "dbConnected": false,
                "ambiente": ambiente,
                "nomeServidor": nome_servidor,
                "dbLatencyMs": db_latency_ms,
                "dbProvider": db_provider,
                "dbHostMasked": db_host_masked,
            })),
        )
            .into_response();
    }

    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "appMode": cfg.app_mode.as_str(),
            "isSyncMaster": cfg.app_mode == crate::core::app_config::AppMode::Master,
            "version": crate::core::app_config::APP_VERSION,
            "ambiente": ambiente,
            "nomeServidor": nome_servidor,
            "database": "postgresql",
            "dbConnected": true,
            "dbLatencyMs": db_latency_ms,
            "dbProvider": db_provider,
            "dbHostMasked": db_host_masked,
        })),
    )
        .into_response()
}

/// GET /api/hub/status — informações estendidas do servidor.
pub async fn hub_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let cfg = load_client_config();
    let pool = state.db.pool();
    let db_ok = sqlx::query("SELECT 1")
        .execute(pool)
        .await
        .is_ok();

    (
        StatusCode::OK,
        Json(json!({
            "status": if db_ok { "ok" } else { "degraded" },
            "appMode": cfg.app_mode.as_str(),
            "isSyncMaster": cfg.app_mode == crate::core::app_config::AppMode::Master,
            "apiBindHost": cfg.api_bind_host,
            "apiPort": cfg.api_port,
            "database": "postgresql",
            "dbConnected": db_ok,
            "version": crate::core::app_config::APP_VERSION,
        })),
    )
        .into_response()
}

/// GET /api/hub/client-config
pub async fn get_client_config() -> impl IntoResponse {
    (StatusCode::OK, Json(load_client_config()))
}

/// POST /api/hub/client-config
pub async fn save_client_config(Json(body): Json<ClientConfig>) -> impl IntoResponse {
    match persist_client_config(&body) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "success" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

/// Config pública mínima para clientes do navegador — sem auth.
pub async fn public_config() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "hubUrlHint": "http://natumhub.local:3001",
            "accessMode": "browser",
        })),
    )
        .into_response()
}

#[cfg(test)]
mod testes_ambiente {
    use super::ambiente_do_servidor;

    #[test]
    fn ausente_cai_em_producao() {
        assert_eq!(ambiente_do_servidor(None, None), ("producao", String::new()));
    }

    #[test]
    fn valor_invalido_cai_em_producao() {
        assert_eq!(ambiente_do_servidor(Some("homologacao"), Some("  Fábrica ")), ("producao", "Fábrica".into()));
    }

    #[test]
    fn teste_valido_e_nome_limpo() {
        assert_eq!(ambiente_do_servidor(Some(" TESTE "), Some("Casa\n")), ("teste", "Casa".into()));
        assert_eq!(ambiente_do_servidor(Some("teste"), Some(&"x".repeat(60))).1.len(), 24);
    }
}
