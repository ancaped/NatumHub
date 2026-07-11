use axum::{extract::State, http::StatusCode, response::IntoResponse, Extension, Json};
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use super::models::{
    GithubReleaseConfig, PromoteReleaseResponse, ReleasesStatusResponse, SaveGithubReleaseConfigRequest,
};
use super::store;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::store as auth_store;

const WORKFLOW_FILE: &str = "release.yml";

pub async fn get_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let client = reqwest::Client::new();
    let mut manifests = Vec::new();

    for channel in ["alpha", "beta", "stable"] {
        let url = format!("{}/updater-{}.json", store::GITHUB_RAW_BASE, channel);
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(body) = resp.text().await {
                    manifests.push(store::parse_manifest_channel(channel, &body));
                } else {
                    manifests.push(empty_manifest(channel));
                }
            }
            _ => manifests.push(empty_manifest(channel)),
        }
    }

    let github_repo = store::github_repo(&conn);
    let github_branch = store::github_branch(&conn);
    let github_configured = store::github_token(&conn).is_some();

    (
        StatusCode::OK,
        Json(ReleasesStatusResponse {
            manifests,
            github_configured,
            github_repo,
            github_branch,
        }),
    )
        .into_response()
}

fn empty_manifest(channel: &str) -> super::models::ChannelManifestInfo {
    super::models::ChannelManifestInfo {
        channel: channel.to_string(),
        version: None,
        notes: None,
        pub_date: None,
        url: None,
    }
}

pub async fn get_github_config(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    (
        StatusCode::OK,
        Json(GithubReleaseConfig {
            github_configured: store::github_token(&conn).is_some(),
            github_repo: store::github_repo(&conn),
            github_branch: store::github_branch(&conn),
        }),
    )
        .into_response()
}

pub async fn save_github_config(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<SaveGithubReleaseConfigRequest>,
) -> impl IntoResponse {
    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    match auth_store::verify_supervisor_password(&conn, &ctx.operator_id, &body.supervisor_password)
    {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Senha do supervisor incorreta." })),
            )
                .into_response();
        }
        Err(e) => {
            return (StatusCode::FORBIDDEN, Json(json!({ "error": e }))).into_response();
        }
    }

    if body.github_token.trim().is_empty() {
        if store::github_token(&conn).is_none() {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Token GitHub é obrigatório na primeira configuração." })),
            )
                .into_response();
        }
    } else if let Err(e) = store::set_setting(&conn, store::SETTING_GITHUB_TOKEN, body.github_token.trim()) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    if let Some(repo) = body.github_repo.as_deref().filter(|s| !s.trim().is_empty()) {
        if let Err(e) = store::set_setting(&conn, store::SETTING_GITHUB_REPO, repo.trim()) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    }

    if let Some(branch) = body.github_branch.as_deref().filter(|s| !s.trim().is_empty()) {
        if let Err(e) = store::set_setting(&conn, store::SETTING_GITHUB_BRANCH, branch.trim()) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    }

    (
        StatusCode::OK,
        Json(GithubReleaseConfig {
            github_configured: true,
            github_repo: store::github_repo(&conn),
            github_branch: store::github_branch(&conn),
        }),
    )
        .into_response()
}

pub async fn promote_release(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<super::models::PromoteReleaseRequest>,
) -> impl IntoResponse {
    let channel = body.channel.trim().to_lowercase();
    if !matches!(channel.as_str(), "alpha" | "beta" | "stable") {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Canal deve ser alpha, beta ou stable." })),
        )
            .into_response();
    }

    let tag = body.version_tag.trim();
    if !tag.starts_with('v') {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Tag deve começar com v (ex. v0.0.12-beta.1)." })),
        )
            .into_response();
    }

    let conn = match state.db.connect() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    match auth_store::verify_supervisor_password(&conn, &ctx.operator_id, &body.supervisor_password)
    {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Senha do supervisor incorreta." })),
            )
                .into_response();
        }
        Err(e) => {
            return (StatusCode::FORBIDDEN, Json(json!({ "error": e }))).into_response();
        }
    }

    let token = match store::github_token(&conn) {
        Some(t) => t,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Configure o token GitHub no Painel Supervisor → Releases antes de publicar."
                })),
            )
                .into_response();
        }
    };

    let repo = store::github_repo(&conn);
    let branch = store::github_branch(&conn);
    let notes = body
        .release_notes
        .clone()
        .unwrap_or_else(|| format!("NatumHub {tag} — canal {channel}"));

    match dispatch_release_workflow(&token, &repo, &branch, &channel, tag, &notes).await {
        Ok(()) => (
            StatusCode::OK,
            Json(PromoteReleaseResponse {
                ok: true,
                message: format!(
                    "Build disparado no GitHub Actions para {tag} ({channel}). Acompanhe em Actions → Release NatumHub."
                ),
                channel,
                version_tag: tag.to_string(),
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn dispatch_release_workflow(
    token: &str,
    repo: &str,
    branch: &str,
    channel: &str,
    version_tag: &str,
    release_notes: &str,
) -> Result<(), String> {
    let parts: Vec<&str> = repo.split('/').collect();
    if parts.len() != 2 {
        return Err("Repositório inválido. Use formato owner/repo.".to_string());
    }
    let (owner, repo_name) = (parts[0], parts[1]);

    let url = format!(
        "https://api.github.com/repos/{owner}/{repo_name}/actions/workflows/{WORKFLOW_FILE}/dispatches"
    );

    let body = json!({
        "ref": branch,
        "inputs": {
            "channel": channel,
            "version_tag": version_tag,
            "release_notes": release_notes,
        }
    });

    let resp = reqwest::Client::new()
        .post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Falha ao contactar GitHub: {e}"))?;

    if resp.status().is_success() {
        Ok(())
    } else {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        Err(format!("GitHub Actions recusou o dispatch ({status}): {text}"))
    }
}
