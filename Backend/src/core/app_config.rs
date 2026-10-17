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
    if manifest.join("Cargo.toml").exists() {
        return manifest.parent().map(|p| p.to_path_buf());
    }
    None
}

/// Pasta do SPA buildado (`Frontend/dist`) para o Axum servir no navegador.
/// Override prioritário: `NEXUS_FRONTEND_DIST` (ou legado `NATUMHUB_FRONTEND_DIST`).
pub fn frontend_dist_dir() -> Option<PathBuf> {
    for env_var in ["NEXUS_FRONTEND_DIST", "NATUMHUB_FRONTEND_DIST"] {
        if let Ok(override_path) = std::env::var(env_var) {
            let dist = PathBuf::from(override_path);
            if dist.join("index.html").is_file() {
                return Some(dist);
            }
            eprintln!(
                "{}={} sem index.html — ignorado.",
                env_var,
                dist.display()
            );
        }
    }
    if let Some(root) = resolve_repo_root() {
        let dist = root.join("Frontend").join("dist");
        if dist.join("index.html").is_file() {
            return Some(dist);
        }
    }
    if let Some(data) = data_dir_from_env() {
        let dist = data.join("frontend-dist");
        if dist.join("index.html").is_file() {
            return Some(dist);
        }
    }
    for candidate in [
        PathBuf::from(r"C:\api\Frontend\dist"),
        PathBuf::from("../Frontend/dist"),
        PathBuf::from("Frontend/dist"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../Frontend/dist"),
    ] {
        if candidate.join("index.html").is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Raiz de dados do servidor via ambiente (`NEXUS_DATA_DIR` ou legado `NATUMHUB_DATA_DIR`).
fn data_dir_from_env() -> Option<PathBuf> {
    std::env::var_os("NEXUS_DATA_DIR")
        .or_else(|| std::env::var_os("NATUMHUB_DATA_DIR"))
        .map(PathBuf::from)
}

/// Pasta Saves — caminho absoluto.
/// - Override: `NEXUS_DATA_DIR` / `NATUMHUB_DATA_DIR` (usa direto ou `…/Saves` se existir)
/// - Dev/repo: `<repo>/Saves`
/// - Instalado Win: `%LOCALAPPDATA%/Nexus/Saves` (fallback `%LOCALAPPDATA%/NatumHub/Saves`)
/// - Linux/serviço: `~/.local/share/nexus/Saves` ou `$XDG_DATA_HOME/nexus/Saves`
pub fn saves_dir() -> PathBuf {
    if let Some(data) = data_dir_from_env() {
        let dir = if data.join("Saves").is_dir() || data.file_name().and_then(|n| n.to_str()) == Some("Saves")
        {
            if data.file_name().and_then(|n| n.to_str()) == Some("Saves") {
                data
            } else {
                data.join("Saves")
            }
        } else if data.join("postgres.env").is_file() || data.join("client_config.json").is_file() {
            data
        } else {
            let saves = data.join("Saves");
            let _ = fs::create_dir_all(&saves);
            saves
        };
        let _ = fs::create_dir_all(&dir);
        return dir;
    }

    if let Some(root) = resolve_repo_root() {
        return root.join("Saves");
    }

    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let nexus_dir = PathBuf::from(&local).join("Nexus").join("Saves");
        let natum_dir = PathBuf::from(&local).join("NatumHub").join("Saves");
        let dir = if nexus_dir.exists() || !natum_dir.exists() {
            nexus_dir
        } else {
            natum_dir
        };
        let _ = fs::create_dir_all(&dir);
        bootstrap_postgres_env_from_dev_repo(&dir);
        return dir;
    }

    // Linux / headless sem LOCALAPPDATA
    if let Some(xdg) = std::env::var_os("XDG_DATA_HOME") {
        let dir = PathBuf::from(xdg).join("nexus").join("Saves");
        let _ = fs::create_dir_all(&dir);
        return dir;
    }
    if let Some(home) = std::env::var_os("HOME") {
        let dir = PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("nexus")
            .join("Saves");
        let _ = fs::create_dir_all(&dir);
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

/// Identificador da aplicação.
pub fn app_identifier() -> String {
    "com.nexus.hub".to_string()
}

pub fn read_tauri_identifier() -> String {
    app_identifier()
}

/// Dev local (`com.natum.hub`) — nunca servidor de produção.
pub fn is_developer_identifier(_identifier: &str) -> bool {
    false
}

/// Instalações Estável (e Dev para testes) podem ser PC Principal.
pub fn can_be_principal_server(_identifier: &str) -> bool {
    true
}

/// Canal de instalação: apenas `"stable"` ou `"dev"`.
pub fn install_channel_from_identifier(_identifier: &str) -> &'static str {
    "stable"
}

pub fn validate_master_mode(_config: &ClientConfig) -> Result<(), String> {
    Ok(())
}

/// Cliente remoto sem Axum/Postgres local.
pub fn effective_is_client_mode(cfg: &ClientConfig) -> bool {
    cfg.app_mode == AppMode::Client
}
