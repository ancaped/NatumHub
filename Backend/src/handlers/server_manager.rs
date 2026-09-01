use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::server_manager::{
    detect_network_links, get_connected_devices_from_db, global_log_store,
    global_server_manager, is_autostart_enabled, open_browser_url, open_saves_folder,
    set_autostart_enabled, ServerStatus,
};

#[derive(Deserialize)]
pub struct LogsQuery {
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct AutostartPayload {
    pub enable: bool,
}

#[derive(Deserialize)]
pub struct OpenBrowserPayload {
    pub url: Option<String>,
}

// GET /api/server-manager/status
pub async fn get_server_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    let port = crate::core::app_config::load_client_config().api_port;

    let total_devices_registered: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hub_devices")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    let online_devices_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM hub_devices WHERE last_seen > NOW() - INTERVAL '5 minutes'"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    let base_status = global_server_manager().get_status().await;

    let status = ServerStatus {
        state: base_status.state,
        port,
        uptime_seconds: base_status.uptime_seconds,
        uptime_formatted: base_status.uptime_formatted,
        postgres_connected: true,
        postgres_error: None,
        total_devices_registered: total_devices_registered as usize,
        online_devices_count: online_devices_count as usize,
        autostart_enabled: is_autostart_enabled(),
        is_restarting: base_status.is_restarting,
        version: env!("CARGO_PKG_VERSION").to_string(),
        saves_dir: crate::core::app_config::saves_dir().to_string_lossy().to_string(),
    };

    Json(status)
}

// POST /api/server-manager/restart
pub async fn restart_server_handler() -> impl IntoResponse {
    let mgr = global_server_manager();
    tokio::spawn(async move {
        let _ = mgr.restart_server().await;
    });
    Json(json!({ "ok": true, "message": "Reinicialização do servidor iniciada." }))
}

// POST /api/server-manager/stop
pub async fn stop_server_handler() -> impl IntoResponse {
    let mgr = global_server_manager();
    tokio::spawn(async move {
        let _ = mgr.stop_server().await;
    });
    Json(json!({ "ok": true, "message": "Parada do servidor iniciada." }))
}

// POST /api/server-manager/start
pub async fn start_server_handler() -> impl IntoResponse {
    let mgr = global_server_manager();
    tokio::spawn(async move {
        let _ = mgr.start_server().await;
    });
    Json(json!({ "ok": true, "message": "Inicialização do servidor iniciada." }))
}

// GET /api/server-manager/links
pub async fn get_server_links() -> impl IntoResponse {
    let port = crate::core::app_config::load_client_config().api_port;
    let links = detect_network_links(port);
    Json(links)
}

// GET /api/server-manager/devices
pub async fn get_server_devices(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let pool = state.db.pool();
    match get_connected_devices_from_db(pool).await {
        Ok(devs) => (StatusCode::OK, Json(json!({ "devices": devs }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

// GET /api/server-manager/logs
pub async fn get_server_logs(Query(params): Query<LogsQuery>) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(300);
    let logs = global_log_store().get_recent(limit).await;
    Json(logs)
}

// POST /api/server-manager/clear-logs
pub async fn clear_server_logs() -> impl IntoResponse {
    global_log_store().clear().await;
    Json(json!({ "ok": true }))
}

// POST /api/server-manager/autostart
pub async fn toggle_autostart(Json(payload): Json<AutostartPayload>) -> impl IntoResponse {
    match set_autostart_enabled(payload.enable) {
        Ok(_) => Json(json!({ "ok": true, "enabled": payload.enable })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

// POST /api/server-manager/open-browser
pub async fn open_browser_handler(Json(payload): Json<OpenBrowserPayload>) -> impl IntoResponse {
    let port = crate::core::app_config::load_client_config().api_port;
    let url = payload.url.unwrap_or_else(|| format!("http://localhost:{}", port));
    open_browser_url(&url);
    Json(json!({ "ok": true, "opened": url }))
}

// POST /api/server-manager/open-saves
pub async fn open_saves_handler() -> impl IntoResponse {
    open_saves_folder();
    Json(json!({ "ok": true }))
}

// GET /server-control - HTML Completo do Painel de Controle do Servidor
pub async fn server_control_html() -> impl IntoResponse {
    Html(SERVER_CONTROL_HTML)
}

pub const SERVER_CONTROL_HTML: &str = r##"<!DOCTYPE html>
<html lang="pt-BR" class="h-full bg-zinc-950 text-zinc-100">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus — Painel do Servidor</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath d='M 140 120 C 140 106 150 96 164 96 L 196 96 C 207 96 216 102 222 112 L 326 294 L 326 120 C 326 106 336 96 350 96 L 372 96 C 386 96 396 106 396 120 L 396 392 C 396 406 386 416 372 416 L 340 416 C 329 416 320 410 314 400 L 210 218 L 210 392 C 210 406 200 416 186 416 L 164 416 C 150 416 140 406 140 392 Z' fill='%23ffffff'/%3E%3C/svg%3E">
  <style>
    *, ::before, ::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: #27272a; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; min-height: 100vh; overflow-x: hidden; user-select: none; }
    .container { max-width: 1080px; margin: 0 auto; padding: 1.5rem; }
    .card { background-color: #18181b; border: 1px solid #27272a; border-radius: 1rem; padding: 1.25rem; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.5rem 1rem; font-size: 0.8125rem; font-weight: 700; border-radius: 0.75rem; cursor: pointer; transition: all 0.15s ease; border: 1px solid transparent; }
    .btn:active { transform: scale(0.98); }
    .btn-primary { background-color: #fafafa; color: #09090b; }
    .btn-primary:hover { background-color: #e4e4e7; }
    .btn-secondary { background-color: #27272a; color: #f4f4f5; border-color: #3f3f46; }
    .btn-secondary:hover { background-color: #3f3f46; }
    .btn-restart { background-color: #3b82f6; color: #ffffff; border-color: #2563eb; }
    .btn-restart:hover { background-color: #2563eb; }
    .btn-danger { background-color: #7f1d1d; color: #fecaca; border-color: #991b1b; }
    .btn-danger:hover { background-color: #991b1b; }
    .tab-btn { padding: 0.625rem 1.125rem; font-size: 0.8125rem; font-weight: 700; border-radius: 0.75rem; cursor: pointer; transition: all 0.15s ease; color: #a1a1aa; background: transparent; display: inline-flex; align-items: center; gap: 0.5rem; }
    .tab-btn.active { background-color: #27272a; color: #fafafa; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
    .tab-btn:hover:not(.active) { color: #f4f4f5; background-color: #1f1f23; }
    .badge-online { background-color: #064e3b; color: #6ee7b7; border: 1px solid #059669; padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.375rem; }
    .badge-restarting { background-color: #78350f; color: #fde68a; border: 1px solid #d97706; padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.375rem; }
    .badge-stopped { background-color: #7f1d1d; color: #fca5a5; border: 1px solid #dc2626; padding: 0.25rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 800; display: inline-flex; align-items: center; gap: 0.375rem; }
    .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #10b981; box-shadow: 0 0 8px #10b981; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    .pulse-dot-amber { width: 8px; height: 8px; border-radius: 50%; background-color: #f59e0b; box-shadow: 0 0 8px #f59e0b; animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }
    .log-box { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.75rem; line-height: 1.5; background-color: #0c0c0e; border: 1px solid #27272a; border-radius: 0.75rem; padding: 1rem; max-height: 380px; overflow-y: auto; color: #d4d4d8; user-select: text; }
    .log-info { color: #60a5fa; }
    .log-warn { color: #fbbf24; }
    .log-error { color: #f87171; font-weight: bold; }
    .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #3f3f46; transition: .2s; border-radius: 24px; }
    .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%; }
    input:checked + .slider { background-color: #10b981; }
    input:checked + .slider:before { transform: translateX(20px); }
  </style>
</head>
<body class="p-4 md:p-6">
  <div class="container">
    
    <!-- Top Header & Server Status Card -->
    <header class="card mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <div style="width: 48px; height: 48px; background-color: #09090b; border: 1px solid #3f3f46; border-radius: 1rem; display: flex; align-items: center; justify-content: center; padding: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
            <path d="M 140 120 C 140 106 150 96 164 96 L 196 96 C 207 96 216 102 222 112 L 326 294 L 326 120 C 326 106 336 96 350 96 L 372 96 C 386 96 396 106 396 120 L 396 392 C 396 406 386 416 372 416 L 340 416 C 329 416 320 410 314 400 L 210 218 L 210 392 C 210 406 200 416 186 416 L 164 416 C 150 416 140 406 140 392 Z" fill="#ffffff" />
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-2.5">
            <h1 style="font-size: 1.25rem; font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase;">Nexus Server Control</h1>
            <span style="font-size: 0.6875rem; font-weight: 800; background: #27272a; color: #a1a1aa; padding: 2px 8px; border-radius: 6px; font-family: monospace;">0.1b</span>
            <span id="status-badge" class="badge-online">
              <span class="pulse-dot"></span> ONLINE
            </span>
          </div>
          <p style="font-size: 0.8125rem; color: #a1a1aa; margin-top: 0.125rem;">
            Porta <strong id="server-port" class="text-zinc-200">3001</strong> · Uptime: <span id="uptime-display" class="font-mono font-bold text-zinc-300">00:00:00</span> · PostgreSQL Ativo
          </p>
        </div>
      </div>

      <!-- Server Control Buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <button onclick="restartServer()" id="btn-restart" class="btn btn-restart" title="Reiniciar processo HTTP Axum e recarregar configurações">
          🔄 Reiniciar Servidor
        </button>
        <button onclick="openInBrowser()" class="btn btn-primary" title="Abrir interface Nexus no navegador">
          🌐 Abrir Nexus
        </button>
        <button onclick="triggerErpSync()" class="btn btn-secondary" title="Disparar sincronização com SQL Server do ERP">
          ⚡ Sync ERP
        </button>
        <button onclick="openSavesFolder()" class="btn btn-secondary" title="Abrir pasta Saves no Explorador">
          📁 Saves
        </button>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem; overflow-x: auto; padding-bottom: 0.25rem;">
      <button onclick="switchTab('links')" id="tab-btn-links" class="tab-btn active">
        📡 Links de Conexão (IPs)
      </button>
      <button onclick="switchTab('devices')" id="tab-btn-devices" class="tab-btn">
        💻 PCs Conectados (<span id="devices-count">0</span>)
      </button>
      <button onclick="switchTab('logs')" id="tab-btn-logs" class="tab-btn">
        📜 Console de Logs
      </button>
      <button onclick="switchTab('settings')" id="tab-btn-settings" class="tab-btn">
        ⚙️ Configurações & Bandeja
      </button>
    </nav>

    <!-- TAB 1: Links de Conexão (IPs) -->
    <section id="tab-links" class="space-y-4">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <h2 style="font-size: 1rem; font-weight: 800;">Endereços de Conexão na Rede</h2>
            <p style="font-size: 0.75rem; color: #a1a1aa;">Utilize estes links para conectar outros computadores, tablets ou celulares ao servidor.</p>
          </div>
          <button onclick="fetchLinks()" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.375rem 0.75rem;">
            🔄 Atualizar IPs
          </button>
        </div>

        <div id="links-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem;">
          <div style="padding: 2rem; text-align: center; color: #71717a;">Carregando interfaces de rede...</div>
        </div>

        <div style="margin-top: 1.25rem; padding: 1rem; background-color: #121215; border: 1px solid #27272a; border-radius: 0.75rem; font-size: 0.8125rem; color: #a1a1aa; line-height: 1.5;">
          💡 <strong class="text-zinc-200">Como conectar outro computador:</strong> Abra o navegador (Chrome, Edge) no outro computador e digite o endereço <strong class="text-emerald-400">http://&lt;IP-DESTE-PC&gt;:3001</strong> ou <strong class="text-emerald-400">http://natumhub.local:3001</strong>. Ao fechar esta janela, o servidor continua rodando silenciosamente na <strong class="text-zinc-200">bandeja do Windows (System Tray)</strong>.
        </div>
      </div>
    </section>

    <!-- TAB 2: PCs e Dispositivos Conectados -->
    <section id="tab-devices" class="space-y-4" style="display: none;">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <h2 style="font-size: 1rem; font-weight: 800;">Dispositivos e Terminais Registrados</h2>
            <p style="font-size: 0.75rem; color: #a1a1aa;">Computadores que acessaram o sistema e sessões de operadores ativas.</p>
          </div>
          <button onclick="fetchDevices()" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.375rem 0.75rem;">
            🔄 Atualizar Lista
          </button>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; text-align: left; font-size: 0.8125rem; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid #27272a; color: #71717a; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.05em;">
                <th style="padding: 0.75rem 1rem;">Status</th>
                <th style="padding: 0.75rem 1rem;">Dispositivo / PC</th>
                <th style="padding: 0.75rem 1rem;">Endereço IP</th>
                <th style="padding: 0.75rem 1rem;">Operador Ativo</th>
                <th style="padding: 0.75rem 1rem;">Último Acesso</th>
              </tr>
            </thead>
            <tbody id="devices-table-body">
              <tr>
                <td colspan="5" style="padding: 3rem; text-align: center; color: #71717a;">Carregando dispositivos...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- TAB 3: Console de Logs do Servidor -->
    <section id="tab-logs" class="space-y-4" style="display: none;">
      <div class="card">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
          <div>
            <h2 style="font-size: 1rem; font-weight: 800;">Console de Eventos em Tempo Real</h2>
            <p style="font-size: 0.75rem; color: #a1a1aa;">Requisições HTTP, rotinas do scheduler e mensagens do sistema.</p>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <input type="text" id="log-search" oninput="filterLogs()" placeholder="Filtrar logs..." style="background-color: #0c0c0e; border: 1px solid #27272a; border-radius: 0.625rem; padding: 0.375rem 0.75rem; font-size: 0.75rem; color: #f4f4f5; width: 160px;">
            <button onclick="copyLogs()" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.375rem 0.75rem;">📋 Copiar</button>
            <button onclick="clearLogs()" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.375rem 0.75rem;">🗑️ Limpar</button>
          </div>
        </div>

        <div id="logs-container" class="log-box">
          <div style="color: #71717a; text-align: center; padding: 2rem;">Aguardando eventos do servidor...</div>
        </div>
      </div>
    </section>

    <!-- TAB 4: Configurações e Inicialização -->
    <section id="tab-settings" class="space-y-4" style="display: none;">
      <div class="card space-y-5">
        <div>
          <h2 style="font-size: 1rem; font-weight: 800; margin-bottom: 0.25rem;">Configurações do Servidor</h2>
          <p style="font-size: 0.75rem; color: #a1a1aa;">Gerencie a inicialização automática e caminhos de dados do sistema no Windows e Linux.</p>
        </div>

        <!-- Iniciar com o Windows -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem; background-color: #121215; border: 1px solid #27272a; border-radius: 0.75rem;">
          <div>
            <strong style="font-size: 0.875rem; color: #fafafa; display: block;">Iniciar automaticamente com o Windows (Segundo Plano)</strong>
            <span style="font-size: 0.75rem; color: #a1a1aa;">Inicia o servidor silenciosamente em background ao ligar o computador.</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="autostart-toggle" onchange="toggleAutostart(this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <!-- Informações do Ambiente -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
          <div style="padding: 1rem; background-color: #121215; border: 1px solid #27272a; border-radius: 0.75rem;">
            <span style="font-size: 0.6875rem; color: #71717a; text-transform: uppercase; font-weight: 700; display: block;">Banco de Dados</span>
            <strong style="font-size: 0.875rem; color: #10b981; display: block; margin-top: 0.25rem;">PostgreSQL Conectado</strong>
            <span style="font-size: 0.75rem; color: #a1a1aa;">Saves/postgres.env</span>
          </div>

          <div style="padding: 1rem; background-color: #121215; border: 1px solid #27272a; border-radius: 0.75rem;">
            <span style="font-size: 0.6875rem; color: #71717a; text-transform: uppercase; font-weight: 700; display: block;">Pasta de Dados (Saves)</span>
            <strong id="saves-dir-display" style="font-size: 0.75rem; font-family: monospace; color: #fafafa; display: block; margin-top: 0.25rem; word-break: break-all;">C:\api\Saves</strong>
          </div>
        </div>

      </div>
    </section>

  </div>

  <script>
    let allLogs = [];
    let serverStartTime = Date.now();
    let isRestarting = false;

    function switchTab(tabId) {
      ['links', 'devices', 'logs', 'settings'].forEach(t => {
        document.getElementById(`tab-${t}`).style.display = t === tabId ? 'block' : 'none';
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) {
          if (t === tabId) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });
      if (tabId === 'devices') fetchDevices();
      if (tabId === 'links') fetchLinks();
      if (tabId === 'logs') fetchLogs();
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/server-manager/status');
        if (res.ok) {
          const data = await res.json();
          document.getElementById('server-port').textContent = data.port;
          document.getElementById('devices-count').textContent = data.online_devices_count;
          document.getElementById('autostart-toggle').checked = data.autostart_enabled;
          if (data.saves_dir) document.getElementById('saves-dir-display').textContent = data.saves_dir;

          const badge = document.getElementById('status-badge');
          const btnRestart = document.getElementById('btn-restart');

          if (data.state === 'online' && !data.is_restarting) {
            isRestarting = false;
            badge.className = 'badge-online';
            badge.innerHTML = '<span class="pulse-dot"></span> ONLINE';
            if (btnRestart) {
              btnRestart.disabled = false;
              btnRestart.innerHTML = '🔄 Reiniciar Servidor';
            }
          } else if (data.state === 'restarting' || isRestarting || data.is_restarting) {
            badge.className = 'badge-restarting';
            badge.innerHTML = '<span class="pulse-dot-amber"></span> REINICIANDO...';
            if (btnRestart) {
              btnRestart.disabled = true;
              btnRestart.innerHTML = '⏳ Reiniciando...';
            }
          } else {
            isRestarting = false;
            badge.className = 'badge-stopped';
            badge.innerHTML = 'PARADO';
            if (btnRestart) {
              btnRestart.disabled = false;
              btnRestart.innerHTML = '▶️ Iniciar Servidor';
            }
          }
        }
      } catch (e) {
        if (isRestarting) {
          const badge = document.getElementById('status-badge');
          badge.className = 'badge-restarting';
          badge.innerHTML = '<span class="pulse-dot-amber"></span> REINICIANDO...';
        }
      }
    }

    async function fetchLinks() {
      try {
        const res = await fetch('/api/server-manager/links');
        if (res.ok) {
          const links = await res.json();
          const container = document.getElementById('links-container');
          container.innerHTML = links.map(l => `
            <div style="background-color: #121215; border: 1px solid ${l.is_primary ? '#059669' : '#27272a'}; border-radius: 0.875rem; padding: 1.125rem; display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem; ${l.is_primary ? 'box-shadow: 0 0 12px rgba(16,185,129,0.1);' : ''}">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.375rem;">
                  <span style="font-size: 0.8125rem; font-weight: 800; color: ${l.is_primary ? '#6ee7b7' : '#fafafa'};">${l.label}</span>
                  ${l.is_primary ? '<span style="font-size: 0.625rem; font-weight: 800; background: #064e3b; color: #a7f3d0; padding: 2px 6px; border-radius: 6px;">PRINCIPAL</span>' : ''}
                </div>
                <div style="font-family: monospace; font-size: 0.9375rem; font-weight: 700; color: #fafafa; background: #09090b; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid #27272a; margin: 0.5rem 0; word-break: break-all; user-select: text;">
                  ${l.url}
                </div>
                <p style="font-size: 0.6875rem; color: #a1a1aa;">${l.description}</p>
              </div>

              <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <button onclick="copyToClipboard('${l.url}', this)" class="btn btn-secondary" style="flex: 1; font-size: 0.75rem; padding: 0.375rem;">
                  📋 Copiar Link
                </button>
                <button onclick="openCustomUrl('${l.url}')" class="btn btn-primary" style="font-size: 0.75rem; padding: 0.375rem 0.75rem;">
                  Abrir
                </button>
              </div>
            </div>
          `).join('');
        }
      } catch (e) {
        console.error('Erro ao buscar links:', e);
      }
    }

    async function fetchDevices() {
      try {
        const res = await fetch('/api/server-manager/devices');
        if (res.ok) {
          const data = await res.json();
          const tbody = document.getElementById('devices-table-body');
          const devices = data.devices || [];

          if (devices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 2.5rem; text-align: center; color: #71717a;">Nenhum dispositivo registrado ainda. Ao acessar pelo navegador, os PCs aparecerão aqui.</td></tr>';
            return;
          }

          tbody.innerHTML = devices.map(d => `
            <tr style="border-bottom: 1px solid #1f1f23; transition: background-color .15s;" onmouseover="this.style.backgroundColor='#18181b'" onmouseout="this.style.backgroundColor='transparent'">
              <td style="padding: 0.75rem 1rem;">
                ${d.is_online ? '<span class="badge-online"><span class="pulse-dot"></span> Online</span>' : '<span style="font-size: 0.75rem; color: #71717a;">Offline</span>'}
              </td>
              <td style="padding: 0.75rem 1rem; font-weight: 700; color: #fafafa;">
                ${d.label || 'Terminal Sem Nome'}
                <span style="font-size: 0.6875rem; font-family: monospace; color: #71717a; display: block;">${d.device_id.substring(0, 8)}</span>
              </td>
              <td style="padding: 0.75rem 1rem; font-family: monospace; color: #a1a1aa; user-select: text;">
                ${d.last_ip || '—'}
              </td>
              <td style="padding: 0.75rem 1rem; color: #e4e4e7; font-weight: 600;">
                ${d.active_operator ? '👤 ' + d.active_operator : '<span style="color: #71717a;">—</span>'}
              </td>
              <td style="padding: 0.75rem 1rem; color: #a1a1aa; font-size: 0.75rem;">
                ${d.last_seen_relative}
              </td>
            </tr>
          `).join('');
        }
      } catch (e) {
        console.error('Erro ao buscar dispositivos:', e);
      }
    }

    async function fetchLogs() {
      try {
        const res = await fetch('/api/server-manager/logs?limit=400');
        if (res.ok) {
          allLogs = await res.json();
          renderLogs();
        }
      } catch (e) {
        console.error('Erro ao buscar logs:', e);
      }
    }

    function renderLogs() {
      const filter = (document.getElementById('log-search')?.value || '').toLowerCase();
      const container = document.getElementById('logs-container');
      const filtered = allLogs.filter(l => !filter || l.message.toLowerCase().includes(filter) || l.level.toLowerCase().includes(filter));

      if (filtered.length === 0) {
        container.innerHTML = '<div style="color: #71717a; text-align: center; padding: 2rem;">Nenhum registro de log localizado.</div>';
        return;
      }

      container.innerHTML = filtered.map(l => {
        let levelClass = 'log-info';
        if (l.level === 'WARN') levelClass = 'log-warn';
        if (l.level === 'ERROR') levelClass = 'log-error';
        return `<div style="margin-bottom: 2px;"><span style="color:#71717a;">[${l.timestamp}]</span> <span class="${levelClass}">[${l.level}]</span> ${escapeHtml(l.message)}</div>`;
      }).join('');

      container.scrollTop = container.scrollHeight;
    }

    function filterLogs() {
      renderLogs();
    }

    async function clearLogs() {
      await fetch('/api/server-manager/clear-logs', { method: 'POST' });
      allLogs = [];
      renderLogs();
    }

    function copyLogs() {
      const text = allLogs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
      navigator.clipboard.writeText(text);
      alert('Logs copiados para a área de transferência!');
    }

    async function restartServer() {
      if (!confirm('Deseja realmente reiniciar o servidor HTTP Axum agora?')) return;
      isRestarting = true;
      const btn = document.getElementById('btn-restart');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Reiniciando...';
      }
      const badge = document.getElementById('status-badge');
      badge.className = 'badge-restarting';
      badge.innerHTML = '<span class="pulse-dot-amber"></span> REINICIANDO...';
      
      try {
        await fetch('/api/server-manager/restart', { method: 'POST' });
      } catch (e) {
        // Normal durante reboot do servidor
      }

      let attempts = 0;
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch('/api/server-manager/status?t=' + Date.now());
          if (res.ok) {
            const data = await res.json();
            if (data.state === 'online' && !data.is_restarting) {
              clearInterval(checkInterval);
              isRestarting = false;
              serverStartTime = Date.now();
              fetchStatus();
              fetchLogs();
              return;
            }
          }
        } catch (err) {}

        if (attempts > 30) {
          clearInterval(checkInterval);
          isRestarting = false;
          fetchStatus();
        }
      }, 600);
    }

    async function toggleAutostart(enable) {
      try {
        await fetch('/api/server-manager/autostart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enable })
        });
      } catch (e) {
        console.error('Erro ao alterar inicialização:', e);
      }
    }

    function copyToClipboard(text, btn) {
      navigator.clipboard.writeText(text);
      const originalText = btn.innerHTML;
      btn.innerHTML = '✔️ Copiado!';
      btn.style.backgroundColor = '#064e3b';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.backgroundColor = '';
      }, 1500);
    }

    function openInBrowser() {
      fetch('/api/server-manager/open-browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    }

    function openCustomUrl(url) {
      fetch('/api/server-manager/open-browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    }

    function openSavesFolder() {
      fetch('/api/server-manager/open-saves', { method: 'POST' });
    }

    function triggerErpSync() {
      fetch('/api/import/sync', { method: 'POST' })
        .then(() => alert('Sincronização com o ERP disparada com sucesso!'))
        .catch(err => alert('Erro ao disparar sync: ' + err));
    }

    function updateUptime() {
      const diff = Math.floor((Date.now() - serverStartTime) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      document.getElementById('uptime-display').textContent = `${h}:${m}:${s}`;
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Inicialização
    fetchStatus();
    fetchLinks();
    fetchLogs();
    setInterval(updateUptime, 1000);
    setInterval(() => {
      fetchStatus();
      if (document.getElementById('tab-logs').style.display !== 'none') fetchLogs();
      if (document.getElementById('tab-devices').style.display !== 'none') fetchDevices();
    }, 3000);
  </script>
</body>
</html>
"##;
