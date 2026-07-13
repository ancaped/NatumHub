use axum::{extract::State, http::StatusCode, response::IntoResponse, Extension, Json};
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use super::models::{
    GithubReleaseConfig, PromoteReleaseResponse, ReleasesStatusResponse, SaveGithubReleaseConfigRequest,
    SyncManifestsRequest, SyncManifestsResponse,
};
use super::store;
use crate::modules::geral::auth::models::AuthContext;
use crate::modules::geral::auth::store as auth_store;

const WORKFLOW_FILE: &str = "release.yml";

const RELEASE_CHANNELS: [&str; 2] = ["stable", "dev"];

async fn manifest_status_for_channel(
    pool: &sqlx::PgPool,
    client: &reqwest::Client,
    token: Option<&str>,
    channel: &str,
) -> super::models::ChannelManifestInfo {
    if let Ok(body) = crate::modules::geral::hub::updater_manifest::read_manifest(channel) {
        let mut info = store::parse_manifest_channel(channel, &body);
        info.available_on_server =
            crate::modules::geral::hub::updater_manifest::manifest_available_on_server(channel);
        info.source = "server".to_string();
        return info;
    }

    if let Some(t) = token {
        let repo = store::github_repo(pool).await;
        let url = format!("https://api.github.com/repos/{repo}/releases/latest");
        let req = client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("Authorization", format!("Bearer {t}"));
        if let Ok(resp) = req.send().await {
            if resp.status().is_success() {
                if let Ok(release) = resp.json::<serde_json::Value>().await {
                    let asset_name = format!("updater-{channel}.json");
                    if let Some(assets) = release.get("assets").and_then(|a| a.as_array()) {
                        if let Some(asset) = assets.iter().find(|a| {
                            a.get("name").and_then(|n| n.as_str()) == Some(asset_name.as_str())
                        }) {
                            if let Some(dl) = asset.get("browser_download_url").and_then(|u| u.as_str())
                            {
                                let dl_req = client
                                    .get(dl)
                                    .header("Authorization", format!("Bearer {t}"));
                                if let Ok(mresp) = dl_req.send().await {
                                    if mresp.status().is_success() {
                                        if let Ok(body) = mresp.text().await {
                                            let mut info =
                                                store::parse_manifest_channel(channel, &body);
                                            info.available_on_server = false;
                                            info.source = "github".to_string();
                                            return info;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    empty_manifest(channel)
}

pub async fn get_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let client = reqwest::Client::new();
    let token = store::github_token(pool).await;

    let mut manifests = Vec::new();
    for channel in RELEASE_CHANNELS {
        manifests.push(
            manifest_status_for_channel(pool, &client, token.as_deref(), channel).await,
        );
    }

    let github_repo = store::github_repo(pool).await;
    let github_branch = store::github_branch(pool).await;
    let github_configured = store::github_token(pool).await.is_some();

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
        available_on_server: false,
        source: "none".to_string(),
    }
}

pub async fn get_github_config(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();

    (
        StatusCode::OK,
        Json(GithubReleaseConfig {
            github_configured: store::github_token(pool).await.is_some(),
            github_repo: store::github_repo(pool).await,
            github_branch: store::github_branch(pool).await,
        }),
    )
        .into_response()
}

pub async fn save_github_config(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<SaveGithubReleaseConfigRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    match auth_store::verify_supervisor_password(pool, &ctx.operator_id, &body.supervisor_password)
        .await
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
        if store::github_token(pool).await.is_none() {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Token GitHub é obrigatório na primeira configuração." })),
            )
                .into_response();
        }
    } else if let Err(e) = store::set_setting(pool, store::SETTING_GITHUB_TOKEN, body.github_token.trim()).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response();
    }

    if let Some(repo) = body.github_repo.as_deref().filter(|s| !s.trim().is_empty()) {
        if let Err(e) = store::set_setting(pool, store::SETTING_GITHUB_REPO, repo.trim()).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    }

    if let Some(branch) = body.github_branch.as_deref().filter(|s| !s.trim().is_empty()) {
        if let Err(e) = store::set_setting(pool, store::SETTING_GITHUB_BRANCH, branch.trim()).await {
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
            github_repo: store::github_repo(pool).await,
            github_branch: store::github_branch(pool).await,
        }),
    )
        .into_response()
}

pub async fn promote_release(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<super::models::PromoteReleaseRequest>,
) -> impl IntoResponse {
    let tag = body.version_tag.trim();
    if !tag.starts_with('v') {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Tag deve começar com v (ex. v0.0.12)." })),
        )
            .into_response();
    }
    if tag.to_lowercase().contains("alpha") || tag.to_lowercase().contains("beta") {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Use tag Estável (ex. v0.0.12), sem alpha/beta." })),
        )
            .into_response();
    }

    let channel = "stable".to_string();
    let pool = state.db.pool();

    match auth_store::verify_supervisor_password(pool, &ctx.operator_id, &body.supervisor_password)
        .await
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

    let token = match store::github_token(pool).await {
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

    let repo = store::github_repo(pool).await;
    let branch = store::github_branch(pool).await;
    let notes = body
        .release_notes
        .clone()
        .unwrap_or_else(|| format!("NatumHub {tag}"));

    match dispatch_release_workflow(&token, &repo, &branch, tag, &notes).await {
        Ok(()) => (
            StatusCode::OK,
            Json(PromoteReleaseResponse {
                ok: true,
                message: format!(
                    "Build Estável disparado no GitHub Actions para {tag}. Acompanhe em Actions → Release NatumHub."
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

pub async fn sync_manifests(
    State(state): State<Arc<AppState>>,
    Extension(ctx): Extension<AuthContext>,
    Json(body): Json<SyncManifestsRequest>,
) -> impl IntoResponse {
    let pool = state.db.pool();

    match auth_store::verify_supervisor_password(pool, &ctx.operator_id, &body.supervisor_password)
        .await
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

    if store::github_token(pool).await.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Configure o token GitHub antes de sincronizar manifests."
            })),
        )
            .into_response();
    }

    let tag = body.version_tag.as_deref().filter(|s| !s.trim().is_empty());
    let token = store::github_token(pool).await;
    let repo = store::github_repo(pool).await;

    match crate::modules::geral::hub::updater_manifest::sync_all_manifests_from_github(
        token, repo, tag,
    )
    .await
    {
        Ok(synced) => {
            let msg = if let Some(t) = tag {
                format!(
                    "Manifests sincronizados da release {t} para o servidor ({})",
                    synced.join(", ")
                )
            } else {
                format!(
                    "Manifests sincronizados da última release GitHub ({})",
                    synced.join(", ")
                )
            };
            (
                StatusCode::OK,
                Json(SyncManifestsResponse {
                    ok: true,
                    message: msg,
                    synced,
                }),
            )
                .into_response()
        }
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
