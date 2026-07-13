use serde_json::Value;
use sqlx::PgPool;

pub const SETTING_GITHUB_TOKEN: &str = "github_release_token";
pub const SETTING_GITHUB_REPO: &str = "github_release_repo";
pub const SETTING_GITHUB_BRANCH: &str = "github_release_branch";
pub const DEFAULT_GITHUB_REPO: &str = "ancaped/NatumHub";
pub const DEFAULT_GITHUB_BRANCH: &str = "main";
pub const GITHUB_RAW_BASE: &str = "https://raw.githubusercontent.com/ancaped/NatumHub/main";

pub async fn get_setting(pool: &PgPool, key: &str) -> Result<Option<String>, String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())
}

pub async fn set_setting(pool: &PgPool, key: &str, value: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn github_repo(pool: &PgPool) -> String {
    get_setting(pool, SETTING_GITHUB_REPO)
        .await
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_GITHUB_REPO.to_string())
}

pub async fn github_branch(pool: &PgPool) -> String {
    get_setting(pool, SETTING_GITHUB_BRANCH)
        .await
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_GITHUB_BRANCH.to_string())
}

pub async fn github_token(pool: &PgPool) -> Option<String> {
    get_setting(pool, SETTING_GITHUB_TOKEN)
        .await
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
}

pub fn channel_from_identifier(identifier: &str) -> &'static str {
    crate::core::app_config::install_channel_from_identifier(identifier)
}

pub fn is_developer_identifier(identifier: &str) -> bool {
    crate::core::app_config::is_developer_identifier(identifier)
}

pub fn can_be_principal_server(identifier: &str) -> bool {
    crate::core::app_config::can_be_principal_server(identifier)
}

pub fn parse_manifest_channel(channel: &str, body: &str) -> super::models::ChannelManifestInfo {
    let mut version = None;
    let mut notes = None;
    let mut pub_date = None;
    let mut url = None;

    if let Ok(json) = serde_json::from_str::<Value>(body) {
        version = json.get("version").and_then(|v| v.as_str()).map(String::from);
        notes = json.get("notes").and_then(|v| v.as_str()).map(String::from);
        pub_date = json.get("pub_date").and_then(|v| v.as_str()).map(String::from);
        url = json
            .get("platforms")
            .and_then(|p| p.get("windows-x86_64"))
            .and_then(|w| w.get("url"))
            .and_then(|u| u.as_str())
            .map(String::from);
    }

    super::models::ChannelManifestInfo {
        channel: channel.to_string(),
        version,
        notes,
        pub_date,
        url,
        available_on_server: false,
        source: "unknown".to_string(),
    }
}
