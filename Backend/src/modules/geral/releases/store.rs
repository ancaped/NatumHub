use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

pub const SETTING_GITHUB_TOKEN: &str = "github_release_token";
pub const SETTING_GITHUB_REPO: &str = "github_release_repo";
pub const SETTING_GITHUB_BRANCH: &str = "github_release_branch";
pub const DEFAULT_GITHUB_REPO: &str = "ancaped/NatumHub";
pub const DEFAULT_GITHUB_BRANCH: &str = "main";
pub const GITHUB_RAW_BASE: &str = "https://raw.githubusercontent.com/ancaped/NatumHub/main";

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn github_repo(conn: &Connection) -> String {
    get_setting(conn, SETTING_GITHUB_REPO)
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_GITHUB_REPO.to_string())
}

pub fn github_branch(conn: &Connection) -> String {
    get_setting(conn, SETTING_GITHUB_BRANCH)
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_GITHUB_BRANCH.to_string())
}

pub fn github_token(conn: &Connection) -> Option<String> {
    get_setting(conn, SETTING_GITHUB_TOKEN)
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
}

pub fn channel_from_identifier(identifier: &str) -> &'static str {
    if identifier.contains(".stable") {
        "stable"
    } else if identifier.contains(".beta") {
        "beta"
    } else if identifier.contains(".alpha") {
        "alpha"
    } else {
        "stable"
    }
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
    }
}
