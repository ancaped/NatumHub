use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const CLIENT_CONFIG_PATH: &str = "../Saves/client_config.json";
pub const LEGACY_SAVES_REL: &str = "../Saves";

/// Raiz do repositório (Backend + Frontend), subindo a partir do executável ou do manifest.
pub fn resolve_repo_root() -> Option<PathBuf> {
    if let Ok(mut path) = std::env::current_exe() {
        while path.pop() {
            if path.join("Backend").is_dir() && path.join("Frontend").is_dir() {
                return Some(path);
            }
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if manifest.join("tauri.conf.json").exists() {
        return manifest.parent().map(|p| p.to_path_buf());
    }
    None
}

/// Pasta Saves — caminho absoluto.
/// - Dev/repo: `<repo>/Saves`
/// - Instalado: `%LOCALAPPDATA%/NatumHub/Saves` (gravável; não usa Program Files)
pub fn saves_dir() -> PathBuf {
    if let Some(root) = resolve_repo_root() {
        return root.join("Saves");
    }

    let app_folder = {
        let id = read_tauri_identifier();
        if id.contains(".dev") || is_developer_identifier(&id) {
            "NatumHub Dev"
        } else {
            "NatumHub"
        }
    };

    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let dir = PathBuf::from(local).join(app_folder).join("Saves");
        let _ = fs::create_dir_all(&dir);
        // Mesmo PC de desenvolvimento: se ainda não há env, tenta copiar do repo conhecido.
        bootstrap_postgres_env_from_dev_repo(&dir);
        return dir;
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let dir = parent.join("Saves");
            let _ = fs::create_dir_all(&dir);
            return dir;
        }
    }

    PathBuf::from(LEGACY_SAVES_REL)
}

fn bootstrap_postgres_env_from_dev_repo(saves: &PathBuf) {
    let dest = saves.join("postgres.env");
    if dest.exists() {
        return;
    }
    for candidate in [
        PathBuf::from(r"C:\api\Saves\postgres.env"),
        PathBuf::from(r"C:\api\Saves\supabase.env"),
    ] {
        if candidate.exists() {
            let _ = fs::copy(&candidate, &dest);
            eprintln!(
                "Copiado {} → {} (bootstrap 1ª execução)",
                candidate.display(),
                dest.display()
            );
            break;
        }
    }
}

pub fn client_config_file() -> PathBuf {
    saves_dir().join("client_config.json")
}
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
    let resolved = client_config_file();
    if resolved.exists() || resolve_repo_root().is_some() {
        return resolved;
    }
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

/// Lê `identifier` embutido no binário (tauri.conf.json no momento do build).
pub fn read_tauri_identifier() -> String {
    const RAW: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json"));
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(RAW) {
        if let Some(id) = json.get("identifier").and_then(|v| v.as_str()) {
            return id.to_string();
        }
    }
    "com.natum.hub".to_string()
}

/// Dev local (`com.natum.hub`) — nunca servidor de produção.
pub fn is_developer_identifier(identifier: &str) -> bool {
    identifier == "com.natum.hub"
}

/// Instalações Estável (e Dev para testes) podem ser PC Principal.
pub fn can_be_principal_server(identifier: &str) -> bool {
    identifier.contains(".stable") || identifier.contains(".dev") || is_developer_identifier(identifier)
}

/// Canal de instalação: apenas `"stable"` ou `"dev"`.
pub fn install_channel_from_identifier(identifier: &str) -> &'static str {
    if identifier.contains(".stable") {
        "stable"
    } else if is_developer_identifier(identifier) || cfg!(debug_assertions) {
        "dev"
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
    Err(
        "Somente a instalação Estável pode ser PC Principal (servidor). \
         Configure esta máquina como Cliente apontando para o endereço do servidor."
            .to_string(),
    )
}

/// Cliente remoto sem Axum/Postgres local. Em `tauri dev` + master, mantém servidor local.
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
