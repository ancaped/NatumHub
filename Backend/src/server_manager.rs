//! Módulo de Gerenciamento do Servidor NatumHub (Server Control Panel)
//!
//! Fornece controle de ciclo de vida do servidor (start/stop/restart),
//! detecção de IPs de rede, monitor de dispositivos conectados,
//! captura de logs em tempo real e configuração de inicialização com o Windows/Linux.

use std::collections::VecDeque;
use std::net::{IpAddr, ToSocketAddrs, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Instant;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tokio::sync::{broadcast, watch, Mutex, RwLock};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub target: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkLink {
    pub label: String,
    pub ip: String,
    pub url: String,
    pub is_primary: bool,
    pub is_tailscale: bool,
    pub is_localhost: bool,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedDevice {
    pub device_id: String,
    pub label: String,
    pub last_ip: Option<String>,
    pub last_seen: Option<String>,
    pub last_seen_relative: String,
    pub registered_by: Option<String>,
    pub is_online: bool,
    pub active_operator: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub state: String, // "online" | "stopped" | "restarting" | "error"
    pub port: u16,
    pub uptime_seconds: u64,
    pub uptime_formatted: String,
    pub postgres_connected: bool,
    pub postgres_error: Option<String>,
    pub total_devices_registered: usize,
    pub online_devices_count: usize,
    pub autostart_enabled: bool,
    pub is_restarting: bool,
    pub version: String,
    pub saves_dir: String,
}

/// Buffer circular de logs em memória para o console em tempo real
pub struct LogStore {
    entries: RwLock<VecDeque<LogEntry>>,
    tx: broadcast::Sender<LogEntry>,
    max_entries: usize,
}

impl LogStore {
    pub fn new(max_entries: usize) -> Self {
        let (tx, _) = broadcast::channel(200);
        Self {
            entries: RwLock::new(VecDeque::with_capacity(max_entries)),
            tx,
            max_entries,
        }
    }

    pub async fn push(&self, level: &str, message: &str, target: Option<&str>) {
        let now = chrono::Local::now();
        let entry = LogEntry {
            timestamp: now.format("%H:%M:%S").to_string(),
            level: level.to_uppercase(),
            message: message.to_string(),
            target: target.map(|s| s.to_string()),
        };

        {
            let mut entries = self.entries.write().await;
            if entries.len() >= self.max_entries {
                entries.pop_front();
            }
            entries.push_back(entry.clone());
        }

        let _ = self.tx.send(entry);
    }

    pub async fn get_recent(&self, limit: usize) -> Vec<LogEntry> {
        let entries = self.entries.read().await;
        let start = if entries.len() > limit {
            entries.len() - limit
        } else {
            0
        };
        entries.iter().skip(start).cloned().collect()
    }

    pub async fn clear(&self) {
        let mut entries = self.entries.write().await;
        entries.clear();
    }

    pub fn subscribe(&self) -> broadcast::Receiver<LogEntry> {
        self.tx.subscribe()
    }
}

static LOG_STORE: OnceLock<Arc<LogStore>> = OnceLock::new();
static SERVER_MANAGER: OnceLock<Arc<ServerManager>> = OnceLock::new();

pub fn global_log_store() -> Arc<LogStore> {
    LOG_STORE
        .get_or_init(|| Arc::new(LogStore::new(1000)))
        .clone()
}

pub fn global_server_manager() -> Arc<ServerManager> {
    SERVER_MANAGER
        .get_or_init(|| {
            let port = crate::core::app_config::load_client_config().api_port;
            Arc::new(ServerManager::new(port))
        })
        .clone()
}

pub async fn log_server(level: &str, message: &str) {
    global_log_store().push(level, message, None).await;
}

/// Detecta todos os endereços de IP e links de conexão da máquina
pub fn detect_network_links(port: u16) -> Vec<NetworkLink> {
    let mut links = Vec::new();

    // 1. Link Dinâmico Recomendado (mDNS nexus.local)
    links.push(NetworkLink {
        label: "Link Dinâmico (Recomendado)".to_string(),
        ip: "nexus.local".to_string(),
        url: format!("http://nexus.local:{}", port),
        is_primary: true,
        is_tailscale: false,
        is_localhost: false,
        description: "Acesso direto por nome. Funciona mesmo se o IP do servidor mudar.".to_string(),
    });

    // 2. Nome do Computador na Rede (Hostname)
    if let Ok(hostname) = std::env::var("COMPUTERNAME") {
        let host_lower = hostname.to_lowercase();
        links.push(NetworkLink {
            label: "Nome do Computador (Rede Windows)".to_string(),
            ip: host_lower.clone(),
            url: format!("http://{}:{}", host_lower, port),
            is_primary: false,
            is_tailscale: false,
            is_localhost: false,
            description: "Nome do computador na rede local Windows".to_string(),
        });
    }

    // 3. Localhost
    links.push(NetworkLink {
        label: "Localhost (Este Computador)".to_string(),
        ip: "127.0.0.1".to_string(),
        url: format!("http://localhost:{}", port),
        is_primary: false,
        is_tailscale: false,
        is_localhost: true,
        description: "Acesso direto no próprio computador servidor".to_string(),
    });

    // 4. Nome Alternativo mDNS (natumhub.local)
    links.push(NetworkLink {
        label: "Nome Alternativo (mDNS)".to_string(),
        ip: "natumhub.local".to_string(),
        url: format!("http://natumhub.local:{}", port),
        is_primary: false,
        is_tailscale: false,
        is_localhost: false,
        description: "Endereço alternativo compatível na rede local".to_string(),
    });

    // 5. Detectar IP primário da rede local via UDP probe
    let primary_ip = get_primary_local_ip();

    // 6. Coletar todos os IPs do sistema
    let all_ips = get_all_local_ips();

    for ip in all_ips {
        if ip.is_loopback() {
            continue;
        }

        let ip_str = ip.to_string();
        let is_tailscale = ip_str.starts_with("100.");
        let is_primary = false; // nexus.local é o primary

        let label = if is_tailscale {
            "Acesso Remoto Seguro (Tailscale)".to_string()
        } else if Some(ip) == primary_ip {
            "IP Direto da Rede Local".to_string()
        } else {
            format!("Rede Local ({})", ip_str)
        };

        let description = if is_tailscale {
            "Permite acessar o sistema de qualquer lugar fora da empresa via Tailscale".to_string()
        } else if Some(ip) == primary_ip {
            "Endereço IP numérico direto deste computador".to_string()
        } else {
            "Interface de rede adicional".to_string()
        };

        links.push(NetworkLink {
            label,
            ip: ip_str.clone(),
            url: format!("http://{}:{}", ip_str, port),
            is_primary,
            is_tailscale,
            is_localhost: false,
            description,
        });
    }

    if links.len() == 2 && primary_ip.is_some() {
        let ip_str = primary_ip.unwrap().to_string();
        links.push(NetworkLink {
            label: "Rede Local (Wi-Fi/Cabo)".to_string(),
            ip: ip_str.clone(),
            url: format!("http://{}:{}", ip_str, port),
            is_primary: true,
            is_tailscale: false,
            is_localhost: false,
            description: "Cole este endereço no navegador dos outros computadores".to_string(),
        });
    }

    links
}

/// Obtém o IP principal da máquina conectando um socket UDP fictício (sem tráfego de rede)
fn get_primary_local_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let local_addr = socket.local_addr().ok()?;
    Some(local_addr.ip())
}

/// Obtém todos os IPs IPv4 locais disponíveis (sem abrir janelas de console no Windows)
fn get_all_local_ips() -> Vec<IpAddr> {
    let mut ips = Vec::new();

    // 1. Tentar via UDP probe
    if let Some(primary) = get_primary_local_ip() {
        if !primary.is_loopback() {
            ips.push(primary);
        }
    }

    // 2. Tentar via hostname lookup
    if let Ok(hostname) = std::env::var("COMPUTERNAME") {
        if let Ok(addrs) = format!("{}:0", hostname).to_socket_addrs() {
            for addr in addrs {
                if let IpAddr::V4(v4) = addr.ip() {
                    if !v4.is_loopback() && !ips.contains(&IpAddr::V4(v4)) {
                        ips.push(IpAddr::V4(v4));
                    }
                }
            }
        }
    }

    // 3. Fallback no Windows com CREATE_NO_WINDOW para nunca piscar terminal
    #[cfg(target_os = "windows")]
    if ips.is_empty() {
        let mut cmd = std::process::Command::new("ipconfig");
        cmd.creation_flags(CREATE_NO_WINDOW);
        if let Ok(output) = cmd.output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if trimmed.contains("IPv4") || trimmed.contains("Endereço IPv4") || trimmed.contains("IP Address") {
                    if let Some(pos) = trimmed.rfind(':') {
                        let ip_candidate = trimmed[pos + 1..].trim();
                        if let Ok(parsed) = ip_candidate.parse::<std::net::Ipv4Addr>() {
                            if !parsed.is_loopback() && !ips.contains(&IpAddr::V4(parsed)) {
                                ips.push(IpAddr::V4(parsed));
                            }
                        }
                    }
                }
            }
        }
    }

    ips
}

/// Consulta dispositivos conectados no banco de dados
pub async fn get_connected_devices_from_db(pool: &sqlx::PgPool) -> Result<Vec<ConnectedDevice>, String> {
    let now = Utc::now();

    let rows = sqlx::query(
        r#"
        SELECT 
            d.device_id,
            d.label,
            d.last_ip,
            d.last_seen,
            d.registered_by,
            o.display_name AS operator_name
        FROM hub_devices d
        LEFT JOIN LATERAL (
            SELECT operator_id, last_used_at 
            FROM hub_sessions 
            WHERE device_id = d.device_id AND expires_at > NOW()
            ORDER BY last_used_at DESC 
            LIMIT 1
        ) s ON true
        LEFT JOIN hub_operators o ON o.id = s.operator_id
        ORDER BY d.last_seen DESC NULLS LAST, LOWER(d.label)
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao consultar dispositivos: {}", e))?;

    let mut devices = Vec::new();
    for r in rows {
        let device_id: String = r.try_get("device_id").unwrap_or_default();
        let label: String = r.try_get("label").unwrap_or_default();
        let last_ip: Option<String> = r.try_get("last_ip").ok();
        let last_seen_dt: Option<DateTime<Utc>> = r.try_get("last_seen").ok();
        let registered_by: Option<String> = r.try_get("registered_by").ok();
        let operator_name: Option<String> = r.try_get("operator_name").ok();

        let (is_online, relative_time) = if let Some(ls) = last_seen_dt {
            let diff_sec = (now - ls).num_seconds();
            let is_on = diff_sec < 300; // Últimos 5 minutos
            let rel = if diff_sec < 60 {
                "Online agora".to_string()
            } else if diff_sec < 3600 {
                format!("Há {} min", diff_sec / 60)
            } else if diff_sec < 86400 {
                format!("Há {} h", diff_sec / 3600)
            } else {
                format!("Há {} dias", diff_sec / 86400)
            };
            (is_on, rel)
        } else {
            (false, "Nunca visto".to_string())
        };

        devices.push(ConnectedDevice {
            device_id,
            label,
            last_ip,
            last_seen: last_seen_dt.map(|d| d.format("%d/%m/%Y %H:%M").to_string()),
            last_seen_relative: relative_time,
            registered_by,
            is_online,
            active_operator: operator_name,
        });
    }

    Ok(devices)
}

/// Verifica se o auto-start no Windows está ativado (sem abrir janelas de console)
pub fn is_autostart_enabled() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("reg");
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "NatumHubServer"]);

        if let Ok(out) = cmd.output() {
            return out.status.success();
        }
    }
    false
}

/// Ativa ou desativa a inicialização automática com o Windows (sem abrir janelas de console)
pub fn set_autostart_enabled(enable: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if enable {
            let current_exe = std::env::current_exe()
                .map_err(|e| format!("Não foi possível obter o caminho do executável: {}", e))?;
            let exe_str = current_exe.to_string_lossy();
            let reg_value = format!("\"{}\" --background", exe_str);

            let mut cmd = std::process::Command::new("reg");
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.args([
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "NatumHubServer",
                "/t",
                "REG_SZ",
                "/d",
                &reg_value,
                "/f",
            ]);

            let status = cmd.status().map_err(|e| format!("Erro ao executar reg: {}", e))?;

            if status.success() {
                Ok(())
            } else {
                Err("Falha ao registrar inicialização no registro do Windows".to_string())
            }
        } else {
            let mut cmd = std::process::Command::new("reg");
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.args([
                "delete",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "NatumHubServer",
                "/f",
            ]);

            let status = cmd.status().map_err(|e| format!("Erro ao remover chave: {}", e))?;

            if status.success() || status.code() == Some(1) {
                Ok(())
            } else {
                Err("Falha ao remover inicialização do registro do Windows".to_string())
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

/// Abre uma URL no navegador padrão do sistema (sem flicker)
pub fn open_browser_url(url: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = std::ffi::OsStr::new(url)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let op: Vec<u16> = std::ffi::OsStr::new("open")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                op.as_ptr(),
                wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1, // SW_SHOWNORMAL
            );
        }
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
}

/// Abre a pasta Saves no Windows Explorer
pub fn open_saves_folder() {
    let saves_dir = crate::core::app_config::saves_dir();
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let path_str = saves_dir.to_string_lossy();
        let wide: Vec<u16> = std::ffi::OsStr::new(path_str.as_ref())
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let op: Vec<u16> = std::ffi::OsStr::new("open")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                op.as_ptr(),
                wide.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1, // SW_SHOWNORMAL
            );
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(saves_dir.to_string_lossy().as_ref())
            .spawn();
    }
}

/// Estrutura de controle de ciclo de vida do servidor Axum em segundo plano
pub struct ServerManager {
    start_time: RwLock<Option<Instant>>,
    shutdown_tx: Mutex<Option<watch::Sender<bool>>>,
    is_running: AtomicBool,
    is_restarting: AtomicBool,
    port: u16,
    pg_pool: RwLock<Option<sqlx::PgPool>>,
    pg_error: RwLock<Option<String>>,
}

impl ServerManager {
    pub fn new(port: u16) -> Self {
        Self {
            start_time: RwLock::new(None),
            shutdown_tx: Mutex::new(None),
            is_running: AtomicBool::new(false),
            is_restarting: AtomicBool::new(false),
            port,
            pg_pool: RwLock::new(None),
            pg_error: RwLock::new(None),
        }
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub async fn get_status(&self) -> ServerStatus {
        let running = self.is_running();
        let restarting = self.is_restarting.load(Ordering::SeqCst);

        let uptime_seconds = if running {
            let start = self.start_time.read().await;
            start.map(|s| s.elapsed().as_secs()).unwrap_or(0)
        } else {
            0
        };

        let hours = uptime_seconds / 3600;
        let mins = (uptime_seconds % 3600) / 60;
        let secs = uptime_seconds % 60;
        let uptime_formatted = if hours > 0 {
            format!("{:02}h {:02}m {:02}s", hours, mins, secs)
        } else {
            format!("{:02}m {:02}s", mins, secs)
        };

        let pg_connected = self.pg_pool.read().await.is_some();
        let pg_err = self.pg_error.read().await.clone();

        let (total_devices, online_devices) = if let Some(ref pool) = *self.pg_pool.read().await {
            if let Ok(devs) = get_connected_devices_from_db(pool).await {
                let online = devs.iter().filter(|d| d.is_online).count();
                (devs.len(), online)
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        };

        let state = if restarting {
            "restarting".to_string()
        } else if running {
            "online".to_string()
        } else {
            "stopped".to_string()
        };

        ServerStatus {
            state,
            port: self.port,
            uptime_seconds,
            uptime_formatted,
            postgres_connected: pg_connected,
            postgres_error: pg_err,
            total_devices_registered: total_devices,
            online_devices_count: online_devices,
            autostart_enabled: is_autostart_enabled(),
            is_restarting: restarting,
            version: env!("CARGO_PKG_VERSION").to_string(),
            saves_dir: crate::core::app_config::saves_dir().to_string_lossy().to_string(),
        }
    }

    pub async fn start_server(self: &Arc<Self>) -> Result<(), String> {
        if self.is_running() {
            return Ok(());
        }

        log_server("INFO", "Iniciando servidor HTTP Axum...").await;

        // 1. Conectar ao PostgreSQL
        match crate::core::pg_db::create_pool().await {
            Ok(pool) => {
                *self.pg_pool.write().await = Some(pool);
                *self.pg_error.write().await = None;
                log_server("INFO", "Conexão com PostgreSQL estabelecida.").await;
            }
            Err(e) => {
                let err_msg = format!("{}", e);
                *self.pg_pool.write().await = None;
                *self.pg_error.write().await = Some(err_msg.clone());
                log_server("WARN", &format!("PostgreSQL indisponível: {}.", err_msg)).await;
            }
        }

        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        {
            let mut tx_guard = self.shutdown_tx.lock().await;
            *tx_guard = Some(shutdown_tx);
        }

        let manager_clone = self.clone();
        tokio::spawn(async move {
            manager_clone.is_running.store(true, Ordering::SeqCst);
            *manager_clone.start_time.write().await = Some(Instant::now());

            let opts = crate::server::HubServerOptions {
                require_postgres: false,
                try_embedded_postgres: true,
            };

            let mut rx = shutdown_rx;
            let shutdown_future = async move {
                while rx.changed().await.is_ok() {
                    if *rx.borrow() {
                        break;
                    }
                }
            };

            let res = crate::server::run_hub_server_with_shutdown(opts, shutdown_future).await;
            manager_clone.is_running.store(false, Ordering::SeqCst);
            *manager_clone.start_time.write().await = None;

            if let Err(e) = res {
                log_server("ERROR", &format!("Servidor encerrado com erro: {}", e)).await;
            } else {
                log_server("INFO", "Servidor HTTP Axum pausado/encerrado.").await;
            }
        });

        // Aguardar brevemente para confirmação de bind
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

        log_server("INFO", &format!("Servidor ativo na porta {}.", self.port)).await;

        // Iniciar responder mDNS para nexus.local e natumhub.local
        if let Some(std::net::IpAddr::V4(v4)) = get_primary_local_ip() {
            crate::core::mdns::start_mdns_responder(v4, self.port);
        }

        Ok(())
    }

    pub async fn stop_server(&self) -> Result<(), String> {
        if !self.is_running() {
            return Ok(());
        }

        log_server("INFO", "Parando servidor HTTP...").await;

        {
            let tx_guard = self.shutdown_tx.lock().await;
            if let Some(ref tx) = *tx_guard {
                let _ = tx.send(true);
            }
        }

        let start = Instant::now();
        while self.is_running() && start.elapsed().as_secs() < 2 {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }

        self.is_running.store(false, Ordering::SeqCst);
        log_server("INFO", "Servidor parado.").await;
        Ok(())
    }

    pub async fn restart_server(self: &Arc<Self>) -> Result<(), String> {
        self.is_restarting.store(true, Ordering::SeqCst);
        log_server("INFO", "Reiniciando servidor HTTP Axum...").await;

        // Aguarda 200ms para liberar a resposta HTTP anterior
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        let _ = self.stop_server().await;
        tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;

        let res = self.start_server().await;
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

        self.is_restarting.store(false, Ordering::SeqCst);
        log_server("INFO", "Servidor reiniciado e pronto para conexões!").await;
        res
    }
}
