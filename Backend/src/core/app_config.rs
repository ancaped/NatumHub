use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const CLIENT_CONFIG_PATH: &str = "../Saves/client_config.json";
pub const DEFAULT_API_PORT: u16 = 3001;
pub const DEFAULT_BIND_HOST: &str = "0.0.0.0";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppMode {
    Master,
    Client,
}

impl Default for AppMode {
    fn default() -> Self {
        AppMode::Master
    }
}

impl AppMode {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "client" => AppMode::Client,
            _ => AppMode::Master,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            AppMode::Master => "master",
            AppMode::Client => "client",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientConfig {
    #[serde(default)]
    pub app_mode: AppMode,
    #[serde(default = "default_api_origin")]
    pub api_origin: String,
    /// Legado — derivado automaticamente: true somente quando `app_mode` é Master.
    #[serde(default = "default_true")]
    pub is_sync_master: bool,
    #[serde(default = "default_bind_host")]
    pub api_bind_host: String,
    #[serde(default = "default_api_port")]
    pub api_port: u16,
    /// Após definir como Cliente, o modo fica bloqueado neste PC.
    #[serde(default)]
    pub setup_locked: bool,
    #[serde(default)]
    pub device_id: String,
}

fn default_api_origin() -> String {
    format!("http://127.0.0.1:{}", DEFAULT_API_PORT)
}

fn default_true() -> bool {
    true
}

fn default_bind_host() -> String {
    DEFAULT_BIND_HOST.to_string()
}

fn default_api_port() -> u16 {
    DEFAULT_API_PORT
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            app_mode: AppMode::Master,
            api_origin: default_api_origin(),
            is_sync_master: true,
            api_bind_host: default_bind_host(),
            api_port: DEFAULT_API_PORT,
            setup_locked: false,
            device_id: String::new(),
        }
    }
}

/// Garante flags coerentes com o modo escolhido.
pub fn normalize_client_config(config: &mut ClientConfig) {
    config.is_sync_master = config.app_mode == AppMode::Master;
    if config.app_mode == AppMode::Client {
        config.setup_locked = true;
    }
}

pub fn config_path() -> PathBuf {
    PathBuf::from(CLIENT_CONFIG_PATH)
}

pub fn load_client_config() -> ClientConfig {
    let path = config_path();
    if !path.exists() {
        return ClientConfig::default();
    }
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => ClientConfig::default(),
    }
}

pub fn save_client_config(config: &ClientConfig) -> Result<(), String> {
    let mut cfg = config.clone();
    normalize_client_config(&mut cfg);
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn bind_address(config: &ClientConfig) -> String {
    format!("{}:{}", config.api_bind_host, config.api_port)
}

pub fn is_client_mode() -> bool {
    load_client_config().app_mode == AppMode::Client
}

pub fn is_sync_master() -> bool {
    load_client_config().app_mode == AppMode::Master
}

pub fn is_principal_pc() -> bool {
    is_sync_master()
}
