use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const CLIENT_CONFIG_PATH: &str = "../Saves/client_config.json";
pub const DEFAULT_API_PORT: u16 = 3001;
pub const DEFAULT_BIND_HOST: &str = "0.0.0.0";

/// Produção na rede: só canal Estável até o fluxo de release amadurecer.
pub const NETWORK_CHANNELS_FROZEN: bool = true;
pub const PRODUCTION_UPDATE_CHANNEL: &str = "stable";

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
    #[serde(default)]
    pub device_label: String,
    #[serde(default)]
    pub connection_setup_completed: bool,
    #[serde(default)]
    pub install_role: String,
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
            device_label: String::new(),
            connection_setup_completed: false,
            install_role: String::new(),
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
    validate_master_mode(&cfg)?;
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

/// Lê `identifier` do `tauri.conf.json` (build atual).
pub fn read_tauri_identifier() -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(id) = json.get("identifier").and_then(|v| v.as_str()) {
                return id.to_string();
            }
        }
    }
    "com.natum.hub".to_string()
}

/// Dev local (`tauri dev`) ou build Alpha — nunca servidor de produção.
pub fn is_developer_identifier(identifier: &str) -> bool {
    identifier == "com.natum.hub" || identifier.contains(".alpha")
}

/// Somente build Estável pode hospedar SQLite, Axum e sync ERP.
pub fn can_be_principal_server(identifier: &str) -> bool {
    identifier.contains(".stable")
}

pub fn install_channel_from_identifier(identifier: &str) -> &'static str {
    if identifier.contains(".stable") {
        "stable"
    } else if identifier.contains(".beta") {
        "beta"
    } else if is_developer_identifier(identifier) {
        "alpha"
    } else {
        "stable"
    }
}

pub fn validate_master_mode(config: &ClientConfig) -> Result<(), String> {
    if config.app_mode != AppMode::Master {
        return Ok(());
    }
    let id = read_tauri_identifier();
    if can_be_principal_server(&id) {
        return Ok(());
    }
    // `tauri dev` — servidor local só para desenvolvimento (não produção).
    if cfg!(debug_assertions) {
        return Ok(());
    }
    if !can_be_principal_server(&id) {
        let kind = if is_developer_identifier(&id) {
            "desenvolvedor/Alpha"
        } else if id.contains(".beta") {
            "Beta"
        } else {
            "esta instalação"
        };
        return Err(format!(
            "Build {kind} não pode ser PC Principal (servidor). \
             Use NatumHub Estável no PC servidor e configure esta máquina como Cliente \
             apontando para o endereço do servidor. O servidor Estável gerencia os canais \
             Alpha, Beta e Estável para toda a rede."
        ));
    }
    Ok(())
}

/// Cliente remoto sem SQLite/Axum local. Em `tauri dev` + master, mantém servidor local.
pub fn effective_is_client_mode(cfg: &ClientConfig) -> bool {
    if cfg.app_mode == AppMode::Client {
        return true;
    }
    if can_be_principal_server(&read_tauri_identifier()) {
        return false;
    }
    if cfg!(debug_assertions) {
        return false;
    }
    true
}
