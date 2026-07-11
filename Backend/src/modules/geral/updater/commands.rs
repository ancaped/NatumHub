use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::core::app_config::load_client_config;
use crate::modules::geral::releases::models::BuildInfo;
use crate::modules::geral::releases::store;

pub fn validate_channel(channel: &str) -> Result<(), String> {
    match channel {
        "alpha" | "beta" | "stable" => Ok(()),
        _ => Err(format!("Canal de atualização inválido: {channel}")),
    }
}

fn channel_rank(channel: &str) -> u8 {
    match channel {
        "alpha" => 2,
        "beta" => 1,
        _ => 0,
    }
}

fn min_channel(a: &str, b: &str) -> String {
    if channel_rank(a) <= channel_rank(b) {
        a.to_string()
    } else {
        b.to_string()
    }
}

fn build_channel(app: &AppHandle) -> String {
    store::channel_from_identifier(&app.config().identifier).to_string()
}

fn resolve_update_channel(app: &AppHandle, requested: &str) -> Result<String, String> {
    if crate::core::app_config::NETWORK_CHANNELS_FROZEN {
        validate_channel(crate::core::app_config::PRODUCTION_UPDATE_CHANNEL)?;
        let build = build_channel(app);
        return Ok(min_channel(
            crate::core::app_config::PRODUCTION_UPDATE_CHANNEL,
            &build,
        ));
    }
    validate_channel(requested)?;
    let build = build_channel(app);
    if channel_rank(requested) > channel_rank(&build) {
        return Err(format!(
            "Canal \"{requested}\" não permitido nesta instalação (build {build})."
        ));
    }
    Ok(min_channel(requested, &build))
}

pub fn version_matches_channel(version: &str, channel: &str) -> Result<(), String> {
    let v = version.to_lowercase();
    match channel {
        "alpha" if v.contains("-alpha") => Ok(()),
        "beta" if v.contains("-beta") && !v.contains("-alpha") => Ok(()),
        "stable" if !v.contains("-alpha") && !v.contains("-beta") => Ok(()),
        _ => Err(format!(
            "Versão \"{version}\" não corresponde ao canal \"{channel}\". Atualização bloqueada por segurança."
        )),
    }
}

fn parse_endpoint(raw: &str) -> Result<url::Url, String> {
    raw.parse()
        .map_err(|e| format!("URL de update inválida ({raw}): {e}"))
}

fn read_tauri_conf_endpoints() -> Vec<String> {
    const PATHS: &[&str] = &["tauri.conf.json", "Backend/tauri.conf.json", "../Backend/tauri.conf.json"];
    for path in PATHS {
        if let Ok(raw) = std::fs::read_to_string(path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let Some(endpoints) = json
                    .get("plugins")
                    .and_then(|p| p.get("updater"))
                    .and_then(|u| u.get("endpoints"))
                    .and_then(|e| e.as_array())
                {
                    return endpoints
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                }
            }
        }
    }
    vec![]
}

fn manifest_channel_for_updates(build_channel: &str) -> &str {
    if crate::core::app_config::NETWORK_CHANNELS_FROZEN {
        crate::core::app_config::PRODUCTION_UPDATE_CHANNEL
    } else {
        build_channel
    }
}

/// Prioriza manifest no PC master (LAN); fallback nos endpoints do tauri.conf (GitHub Releases).
fn resolve_update_endpoints(_app: &AppHandle, build_channel: &str) -> Result<Vec<url::Url>, String> {
    let channel = manifest_channel_for_updates(build_channel);
    validate_channel(channel)?;
    let cfg = load_client_config();
    let api_origin = cfg.api_origin.trim_end_matches('/');

    let mut urls = vec![parse_endpoint(&format!(
        "{api_origin}/api/hub/updater-manifest/{channel}"
    ))?];

    for ep in read_tauri_conf_endpoints() {
        if ep.contains("/api/hub/updater-manifest/") {
            continue;
        }
        if let Ok(url) = parse_endpoint(&ep) {
            if !urls.iter().any(|u| u.as_str() == url.as_str()) {
                urls.push(url);
            }
        }
    }

    Ok(urls)
}

#[tauri::command]
pub fn get_build_info(app: AppHandle) -> Result<BuildInfo, String> {
    let identifier = app.config().identifier.clone();
    let product_name = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| "NatumHub".to_string());
    let version = app.package_info().version.to_string();
    let channel = store::channel_from_identifier(&identifier).to_string();
    let can_be_principal_server = store::can_be_principal_server(&identifier);
    let is_developer_install = store::is_developer_identifier(&identifier);

    Ok(BuildInfo {
        channel,
        identifier,
        product_name,
        version,
        can_be_principal_server,
        is_developer_install,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelUpdateInfo {
    pub available: bool,
    pub channel: String,
    pub build_channel: String,
    pub current_version: String,
    pub version: Option<String>,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[tauri::command]
pub async fn check_channel_update(
    app: AppHandle,
    channel: String,
) -> Result<ChannelUpdateInfo, String> {
    let build = build_channel(&app);
    let use_channel = resolve_update_channel(&app, &channel)?;
    let current_version = app.package_info().version.to_string();

    let endpoints = resolve_update_endpoints(&app, &build)?;

    let updater = app
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    let checked = updater.check().await.map_err(|e| e.to_string())?;

    if let Some(update) = checked {
        version_matches_channel(&update.version, &use_channel)?;
        return Ok(ChannelUpdateInfo {
            available: true,
            channel: use_channel,
            build_channel: build,
            current_version,
            version: Some(update.version),
            body: update.body,
            date: update.date.map(|d| format!("{d:?}")),
        });
    }

    Ok(ChannelUpdateInfo {
        available: false,
        channel: use_channel,
        build_channel: build,
        current_version,
        version: None,
        body: None,
        date: None,
    })
}

#[tauri::command]
pub async fn install_channel_update(app: AppHandle, channel: String) -> Result<(), String> {
    let build = build_channel(&app);
    let use_channel = resolve_update_channel(&app, &channel)?;
    let endpoints = resolve_update_endpoints(&app, &build)?;

    let updater = app
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Nenhuma atualização disponível.".to_string())?;

    version_matches_channel(&update.version, &use_channel)?;
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
