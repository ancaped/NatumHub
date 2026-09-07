//! Hub API authentication, bind mode, CORS allowlist, and token bootstrap.
//!
//! Token resolution (first match wins):
//! 1. `NATUM_HUB_TOKEN` environment variable
//! 2. File from `NATUM_HUB_TOKEN_FILE`, or `../.natum_hub_token` next to `data.db`
//!
//! Bind / auth modes:
//! - Mode A: `NATUM_BIND=127.0.0.1` (loopback) → Bearer auth is optional
//! - Mode B: `NATUM_BIND=0.0.0.0` (default, Tailscale-compatible) → Bearer required on all `/api/*`

use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const DEFAULT_BIND: &str = "0.0.0.0:3001";
pub const DEFAULT_TOKEN_FILE: &str = "../.natum_hub_token";
pub const SECRET_PLACEHOLDER: &str = "********";

const STATIC_CORS_ORIGINS: &[&str] = &[
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "tauri://localhost",
    "https://tauri.localhost",
];

const SENSITIVE_SETTING_KEYS: &[&str] = &[
    "sql_password",
    "firebase_config",
    "google_client_secret",
    "google_access_token",
    "google_refresh_token",
    "hub_token",
];

#[derive(Clone, Debug)]
pub struct AuthConfig {
    pub token: String,
    pub auth_required: bool,
}

pub fn resolve_bind_addr() -> String {
    let raw = std::env::var("NATUM_BIND").unwrap_or_else(|_| "0.0.0.0".to_string());
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        DEFAULT_BIND.to_string()
    } else if trimmed.contains(':') {
        trimmed.to_string()
    } else {
        format!("{trimmed}:3001")
    }
}

pub fn is_loopback_bind(addr: &str) -> bool {
    let host = addr.split(':').next().unwrap_or(addr).trim();
    host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "[::1]"
}

pub fn auth_required_for_bind(addr: &str) -> bool {
    match std::env::var("NATUM_AUTH") {
        Ok(v) if v.eq_ignore_ascii_case("required") => true,
        Ok(v) if v.eq_ignore_ascii_case("optional") || v.eq_ignore_ascii_case("off") => false,
        _ => !is_loopback_bind(addr),
    }
}

pub fn token_file_path() -> PathBuf {
    std::env::var("NATUM_HUB_TOKEN_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_TOKEN_FILE))
}

pub fn read_hub_token() -> Option<String> {
    if let Ok(env_token) = std::env::var("NATUM_HUB_TOKEN") {
        let t = env_token.trim().to_string();
        if !t.is_empty() {
            return Some(t);
        }
    }
    read_token_file(&token_file_path())
}

fn read_token_file(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok().and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() { None } else { Some(t) }
    })
}

fn write_token_file(path: &Path, token: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(path, format!("{token}\n"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path)?.permissions();
        perms.set_mode(0o600);
        std::fs::set_permissions(path, perms)?;
    }
    Ok(())
}

/// Resolve or create the hub token **before** Axum starts requiring the header.
/// Does not read/write the settings table (avoids chicken-egg with protected routes).
pub fn ensure_hub_token() -> String {
    if let Some(existing) = read_hub_token() {
        return existing;
    }
    let generated = Uuid::new_v4().to_string();
    let path = token_file_path();
    match write_token_file(&path, &generated) {
        Ok(()) => {
            eprintln!(
                "NatumHub: generated hub_token and wrote {} (gitignored). Set NATUM_HUB_TOKEN to override. Frontend: Hub Settings or localStorage natum_hub_token.",
                path.display()
            );
        }
        Err(e) => {
            eprintln!(
                "NatumHub: could not write hub token file {}: {}. Using in-memory token for this process only.",
                path.display(),
                e
            );
        }
    }
    generated
}

pub fn is_public_api_path(path: &str) -> bool {
    path == "/api/google/callback"
}

pub fn is_sensitive_setting_key(key: &str) -> bool {
    SENSITIVE_SETTING_KEYS.iter().any(|k| *k == key)
}

pub fn is_secret_placeholder(value: &str) -> bool {
    let t = value.trim();
    t.is_empty() || t == SECRET_PLACEHOLDER || t.chars().all(|c| c == '•' || c == '*')
}

pub fn is_allowed_cors_origin(origin: &str) -> bool {
    if STATIC_CORS_ORIGINS.iter().any(|o| *o == origin) {
        return true;
    }
    extra_cors_origins().iter().any(|o| o == origin)
}

fn extra_cors_origins() -> Vec<String> {
    std::env::var("NATUM_CORS_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn cors_allow_origin_predicate(origin: &HeaderValue, _: &axum::http::request::Parts) -> bool {
    origin.to_str().map(is_allowed_cors_origin).unwrap_or(false)
}

fn token_matches(provided: &str, expected: &str) -> bool {
    if expected.is_empty() {
        return false;
    }
    let a = provided.as_bytes();
    let b = expected.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub async fn require_hub_token(
    State(cfg): State<AuthConfig>,
    req: Request,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();

    if req.method() == Method::OPTIONS {
        return next.run(req).await;
    }

    if !path.starts_with("/api/") || is_public_api_path(&path) {
        return next.run(req).await;
    }

    if !cfg.auth_required {
        return next.run(req).await;
    }

    if cfg.token.is_empty() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "Hub token is not configured. Set NATUM_HUB_TOKEN or create the gitignored .natum_hub_token file, then restart."
            })),
        )
            .into_response();
    }

    let provided = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");

    if !token_matches(provided, &cfg.token) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "Missing or invalid Authorization Bearer token"
            })),
        )
            .into_response();
    }

    next.run(req).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{routing::get, Router};
    use axum::{body::Body, extract::Request};
    use tower::ServiceExt;

    fn test_app(auth_required: bool, token: &str) -> Router {
        let cfg = AuthConfig {
            token: token.to_string(),
            auth_required,
        };
        Router::new()
            .route("/api/products", get(|| async { "ok" }))
            .route("/api/settings/sql_password", get(|| async { "secret" }))
            .route("/api/google/callback", get(|| async { "oauth" }))
            .route("/health", get(|| async { "up" }))
            .layer(axum::middleware::from_fn_with_state(cfg, require_hub_token))
    }

    #[test]
    fn loopback_bind_is_mode_a() {
        assert!(is_loopback_bind("127.0.0.1:3001"));
        assert!(is_loopback_bind("localhost:3001"));
        assert!(!is_loopback_bind("0.0.0.0:3001"));
        assert!(!is_loopback_bind("100.120.161.52:3001"));
    }

    #[test]
    fn cors_allowlist_rejects_any() {
        assert!(is_allowed_cors_origin("http://localhost:5175"));
        assert!(is_allowed_cors_origin("http://127.0.0.1:5175"));
        assert!(is_allowed_cors_origin("tauri://localhost"));
        assert!(is_allowed_cors_origin("https://tauri.localhost"));
        assert!(!is_allowed_cors_origin("http://evil.example"));
        assert!(!is_allowed_cors_origin("*"));
    }

    #[test]
    fn sensitive_keys_cover_p0_4() {
        assert!(is_sensitive_setting_key("sql_password"));
        assert!(is_sensitive_setting_key("firebase_config"));
        assert!(is_sensitive_setting_key("google_client_secret"));
        assert!(is_sensitive_setting_key("hub_token"));
        assert!(!is_sensitive_setting_key("sql_host"));
        assert!(is_secret_placeholder(""));
        assert!(is_secret_placeholder("********"));
        assert!(!is_secret_placeholder("real-secret"));
    }

    #[tokio::test]
    async fn mode_b_rejects_missing_bearer() {
        let app = test_app(true, "test-token");
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/products")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn mode_b_rejects_wrong_bearer() {
        let app = test_app(true, "test-token");
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/settings/sql_password")
                    .header(header::AUTHORIZATION, "Bearer wrong")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn mode_b_accepts_valid_bearer() {
        let app = test_app(true, "test-token");
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/products")
                    .header(header::AUTHORIZATION, "Bearer test-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn google_oauth_callback_is_exempt() {
        let app = test_app(true, "test-token");
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/google/callback")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn mode_a_allows_unauthenticated() {
        let app = test_app(false, "test-token");
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/api/products")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
}
