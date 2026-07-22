//! Info mínima da instalação Tauri (sem updater).

use serde::Serialize;
use tauri::AppHandle;

use crate::core::app_config;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub channel: String,
    pub identifier: String,
    pub product_name: String,
    pub version: String,
    pub can_be_principal_server: bool,
    pub is_developer_install: bool,
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
    let channel = app_config::install_channel_from_identifier(&identifier).to_string();
    let can_be_principal_server = app_config::can_be_principal_server(&identifier);
    let is_developer_install = app_config::is_developer_identifier(&identifier);

    Ok(BuildInfo {
        channel,
        identifier,
        product_name,
        version,
        can_be_principal_server,
        is_developer_install,
    })
}
