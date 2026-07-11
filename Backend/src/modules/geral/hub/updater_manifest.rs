//! Manifests de atualização servidos pelo PC master (funciona com repo privado na LAN).

use std::fs;
use std::path::PathBuf;

pub const MANIFESTS_DIR: &str = "../Saves/updater-manifests";

pub fn manifests_dir() -> PathBuf {
    PathBuf::from(MANIFESTS_DIR)
}

pub fn ensure_manifests_dir() -> Result<(), String> {
    fs::create_dir_all(manifests_dir()).map_err(|e| e.to_string())
}

pub fn manifest_path(channel: &str) -> Result<PathBuf, String> {
    validate_channel(channel)?;
    Ok(manifests_dir().join(format!("updater-{channel}.json")))
}

pub fn validate_channel(channel: &str) -> Result<(), String> {
    match channel {
        "stable" => Ok(()),
        _ => Err(format!("Canal inválido: {channel}. Apenas stable é suportado.")),
    }
}

/// Copia manifests da raiz do repo para Saves na primeira execução.
pub fn seed_manifests_from_repo_root() {
    let _ = ensure_manifests_dir();
    let channel = "stable";
    if let Ok(dest) = manifest_path(channel) {
        if !dest.exists() {
            let root_file = PathBuf::from(format!("../updater-{channel}.json"));
            if root_file.exists() {
                let _ = fs::copy(&root_file, &dest);
            }
        }
    }
}

pub fn read_manifest(channel: &str) -> Result<String, String> {
    validate_channel(channel)?;
    let path = manifest_path(channel)?;
    if path.exists() {
        return fs::read_to_string(&path).map_err(|e| e.to_string());
    }
    let root = PathBuf::from(format!("../updater-{channel}.json"));
    if root.exists() {
        return fs::read_to_string(&root).map_err(|e| e.to_string());
    }
    Err(format!("Manifest updater-{channel}.json não encontrado no servidor."))
}

pub fn write_manifest(channel: &str, body: &str) -> Result<(), String> {
    validate_channel(channel)?;
    ensure_manifests_dir()?;
    let path = manifest_path(channel)?;
    fs::write(&path, body).map_err(|e| e.to_string())
}

pub fn manifest_available_on_server(channel: &str) -> bool {
    manifest_path(channel)
        .map(|p| p.exists())
        .unwrap_or(false)
}

pub async fn sync_all_manifests_from_github(
    token: Option<String>,
    repo: String,
    tag: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut synced = Vec::new();
    let channel = "stable";

    match fetch_manifest_from_github_release(token.as_deref(), &repo, channel, tag).await {
        Ok(body) => {
            write_manifest(channel, &body)?;
            synced.push(channel.to_string());
        }
        Err(e) => return Err(e),
    }

    Ok(synced)
}

pub async fn fetch_manifest_from_github_release(
    token: Option<&str>,
    repo: &str,
    channel: &str,
    tag: Option<&str>,
) -> Result<String, String> {
    validate_channel(channel)?;
    let parts: Vec<&str> = repo.split('/').collect();
    if parts.len() != 2 {
        return Err("Repositório inválido.".to_string());
    }
    let (owner, repo_name) = (parts[0], parts[1]);
    let asset_name = format!("updater-{channel}.json");

    let client = reqwest::Client::new();

    let release = if let Some(t) = tag.filter(|s| !s.is_empty()) {
        fetch_release_by_tag(&client, token, owner, repo_name, t).await?
    } else {
        find_latest_release_with_asset(&client, token, owner, repo_name, &asset_name).await?
    };

    download_release_asset(&client, token, &release, &asset_name).await
}

async fn auth_header(token: Option<&str>) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        "application/vnd.github+json".parse().unwrap(),
    );
    headers.insert("X-GitHub-Api-Version", "2022-11-28".parse().unwrap());
    if let Some(t) = token.filter(|s| !s.is_empty()) {
        if let Ok(v) = format!("Bearer {t}").parse() {
            headers.insert(reqwest::header::AUTHORIZATION, v);
        }
    }
    headers
}

async fn fetch_release_by_tag(
    client: &reqwest::Client,
    token: Option<&str>,
    owner: &str,
    repo_name: &str,
    tag: &str,
) -> Result<serde_json::Value, String> {
    let url = format!("https://api.github.com/repos/{owner}/{repo_name}/releases/tags/{tag}");
    client
        .get(&url)
        .headers(auth_header(token).await)
        .send()
        .await
        .map_err(|e| format!("GitHub: {e}"))?
        .error_for_status()
        .map_err(|e| format!("GitHub release {tag}: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())
}

async fn find_latest_release_with_asset(
    client: &reqwest::Client,
    token: Option<&str>,
    owner: &str,
    repo_name: &str,
    asset_name: &str,
) -> Result<serde_json::Value, String> {
    let url = format!("https://api.github.com/repos/{owner}/{repo_name}/releases?per_page=30");
    let releases: Vec<serde_json::Value> = client
        .get(&url)
        .headers(auth_header(token).await)
        .send()
        .await
        .map_err(|e| format!("GitHub: {e}"))?
        .error_for_status()
        .map_err(|e| format!("GitHub releases list: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    for release in releases {
        let has_asset = release
            .get("assets")
            .and_then(|a| a.as_array())
            .map(|assets| {
                assets
                    .iter()
                    .any(|a| a.get("name").and_then(|n| n.as_str()) == Some(asset_name))
            })
            .unwrap_or(false);
        if has_asset {
            return Ok(release);
        }
    }

    Err(format!("Nenhuma release com asset {asset_name} encontrada."))
}

async fn download_release_asset(
    client: &reqwest::Client,
    token: Option<&str>,
    release: &serde_json::Value,
    asset_name: &str,
) -> Result<String, String> {
    let assets = release
        .get("assets")
        .and_then(|a| a.as_array())
        .ok_or_else(|| "Release sem assets.".to_string())?;

    let download_url = assets
        .iter()
        .find(|a| a.get("name").and_then(|n| n.as_str()) == Some(asset_name))
        .and_then(|a| a.get("browser_download_url"))
        .and_then(|u| u.as_str())
        .ok_or_else(|| format!("Asset {asset_name} não encontrado na release."))?;

    client
        .get(download_url)
        .headers(auth_header(token).await)
        .send()
        .await
        .map_err(|e| format!("Download manifest: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Download manifest HTTP: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())
}
