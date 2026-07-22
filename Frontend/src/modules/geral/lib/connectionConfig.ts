/**
 * Configuração local do dispositivo + URL da API.
 * Persistido em localStorage e Saves/client_config.json (Tauri).
 * PC Principal = master (API+Postgres). Terminal = client (API remota).
 */

export type AppMode = 'master' | 'client';

export interface ClientConfig {
  appMode: AppMode;
  apiOrigin: string;
  /** Derivado automaticamente — true quando appMode === 'master' */
  isSyncMaster: boolean;
  apiBindHost: string;
  apiPort: number;
  /** Bloqueia troca de modo após definir este PC como Cliente (exceto admin) */
  setupLocked?: boolean;
  /** Identificador único desta instalação */
  deviceId?: string;
  deviceLabel?: string;
  /** Wizard de primeira instalação concluído */
  connectionSetupCompleted?: boolean;
  /** server | terminal | development — definido no wizard */
  installRole?: 'server' | 'terminal' | 'development';
}

const STORAGE_KEY = 'natum_client_config';

export const DEFAULT_API_PORT = 3001;

export function defaultConfig(): ClientConfig {
  return {
    appMode: 'master',
    apiOrigin: `http://127.0.0.1:${DEFAULT_API_PORT}`,
    isSyncMaster: true,
    apiBindHost: '0.0.0.0',
    apiPort: DEFAULT_API_PORT,
    setupLocked: false,
    deviceId: generateDeviceId(),
    deviceLabel: getDefaultDeviceLabel(),
  };
}

function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getDefaultDeviceLabel(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }
  return 'NatumHub';
}

export function ensureDeviceId(config: ClientConfig): ClientConfig {
  if (config.deviceId) return config;
  return { ...config, deviceId: generateDeviceId(), deviceLabel: config.deviceLabel || getDefaultDeviceLabel() };
}

export function normalizeClientConfig(config: ClientConfig): ClientConfig {
  const withDevice = ensureDeviceId(config);
  const isMaster = withDevice.appMode === 'master';
  return {
    ...withDevice,
    isSyncMaster: isMaster,
    setupLocked: isMaster ? withDevice.setupLocked : true,
  };
}

export function loadConnectionConfig(): ClientConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw) as Partial<ClientConfig>;
    return normalizeClientConfig({ ...defaultConfig(), ...parsed });
  } catch {
    return defaultConfig();
  }
}

export function saveConnectionConfig(config: ClientConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeClientConfig(config)));
}

export function getApiOrigin(): string {
  return loadConnectionConfig().apiOrigin.replace(/\/$/, '');
}

export function isClientMode(): boolean {
  return loadConnectionConfig().appMode === 'client';
}

export function isMasterMode(): boolean {
  return loadConnectionConfig().appMode === 'master';
}

/** PC principal = servidor com banco local, sync ERP e backups */
export function isPrincipalPc(): boolean {
  return isMasterMode();
}

/** @deprecated Use isPrincipalPc() */
export function isSyncMaster(): boolean {
  return isPrincipalPc();
}

export function isConnectionSetupCompleted(): boolean {
  const cfg = loadConnectionConfig();
  if (cfg.connectionSetupCompleted) return true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<ClientConfig>;
    if (parsed.connectionSetupCompleted) return true;
    // Migração: instalações anteriores ao wizard
    if (parsed.appMode === 'client' || parsed.setupLocked) {
      const migrated = normalizeClientConfig({
        ...loadConnectionConfig(),
        connectionSetupCompleted: true,
        installRole: parsed.appMode === 'client' ? 'terminal' : cfg.installRole,
      });
      saveConnectionConfig(migrated);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function markConnectionSetupCompleted(
  config: ClientConfig,
  role: ClientConfig['installRole']
): ClientConfig {
  return normalizeClientConfig({
    ...config,
    connectionSetupCompleted: true,
    installRole: role,
  });
}

export function resetConnectionSetupForWizard(): void {
  const cfg = loadConnectionConfig();
  saveConnectionConfig({
    ...cfg,
    connectionSetupCompleted: false,
  });
}

/** Aguarda API local/remota ficar online (bootstrap). */
export async function waitForServerHealth(
  maxMs = 20000,
  intervalMs = 600,
  apiOrigin?: string
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const h = await checkServerHealth(apiOrigin);
      if (h.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export function isSetupLocked(): boolean {
  const cfg = loadConnectionConfig();
  return cfg.appMode === 'client' && !!cfg.setupLocked;
}

/** Dev (`tauri dev` / Vite :5175) nunca pode ser servidor de produção. */
export function isDevRuntime(): boolean {
  return import.meta.env.DEV;
}

/** UI servida pelo Axum (navegador na LAN) — não Vite e não WebView Tauri. */
export function isAxumServedUi(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.port === '5175') return false;
  const w = window as Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
  if (w.__TAURI_INTERNALS__ || w.__TAURI__) return false;
  return /^https?:$/.test(window.location.protocol);
}

export interface BuildInfo {
  channel: string;
  identifier: string;
  productName: string;
  version: string;
  canBePrincipalServer: boolean;
  isDeveloperInstall: boolean;
}

export async function getBuildInfo(): Promise<BuildInfo | null> {
  if (isAxumServedUi()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const info = await invoke<BuildInfo & Record<string, unknown>>('get_build_info');
    return {
      channel: String(info.channel ?? ''),
      identifier: String(info.identifier ?? ''),
      productName: String(info.productName ?? info.product_name ?? 'NatumHub'),
      version: String(info.version ?? ''),
      canBePrincipalServer: Boolean(
        info.canBePrincipalServer ?? info.can_be_principal_server
      ),
      isDeveloperInstall: Boolean(
        info.isDeveloperInstall ?? info.is_developer_install
      ),
    };
  } catch {
    return null;
  }
}

/** Pode ser PC Principal: build Estável/Dev instalado e fora do `tauri dev`/browser. */
export async function canBePrincipalServer(): Promise<boolean> {
  if (isDevRuntime() || isAxumServedUi()) return false;
  const build = await getBuildInfo();
  return build?.canBePrincipalServer ?? false;
}

export async function isDeveloperInstall(): Promise<boolean> {
  if (isAxumServedUi()) return false;
  if (isDevRuntime()) return true;
  const build = await getBuildInfo();
  return build?.isDeveloperInstall ?? false;
}

/**
 * No navegador (SPA no Axum), força cliente same-origin e marca setup concluído.
 * Em Vite/Tauri, não altera.
 */
export function ensureBrowserClientConfig(): ClientConfig {
  let cfg = loadConnectionConfig();
  if (!isAxumServedUi()) return cfg;
  const origin = window.location.origin.replace(/\/$/, '');
  cfg = normalizeClientConfig({
    ...cfg,
    appMode: 'client',
    isSyncMaster: false,
    apiOrigin: origin,
    apiBindHost: '127.0.0.1',
    apiPort: DEFAULT_API_PORT,
    setupLocked: true,
    connectionSetupCompleted: true,
    installRole: 'terminal',
  });
  saveConnectionConfig(cfg);
  return cfg;
}

/** Legacy no-op: terminais (`client`) são válidos e não devem ser forçados a master. */
export async function repairDevConnectionIfNeeded(): Promise<boolean> {
  return false;
}

export async function syncConfigFromTauri(): Promise<ClientConfig> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const cfg = await invoke<ClientConfig>('hub_get_client_config');
    const normalized = normalizeClientConfig(cfg);
    saveConnectionConfig(normalized);
    return normalized;
  } catch {
    return loadConnectionConfig();
  }
}

export async function saveConfigToTauri(config: ClientConfig): Promise<void> {
  const normalized = normalizeClientConfig(config);
  saveConnectionConfig(normalized);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('hub_save_client_config', { config: normalized });
  } catch {
    // Cliente remoto sem escrita no arquivo do master — localStorage basta neste PC
  }
}

export interface HealthCheckResult {
  ok: boolean;
  apiOrigin: string;
  status?: string;
  error?: string;
  latencyMs?: number;
  dbProvider?: string;
  dbHostMasked?: string;
}

export async function checkServerHealth(apiOrigin?: string): Promise<HealthCheckResult> {
  const origin = (apiOrigin || getApiOrigin()).replace(/\/$/, '');
  const start = performance.now();

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const res = await invoke<HealthCheckResult>('hub_check_server_health', { apiOrigin: origin });
    return { ...res, latencyMs: Math.round(performance.now() - start) };
  } catch {
    try {
      const res = await fetch(`${origin}/api/health`);
      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) {
        return { ok: false, apiOrigin: origin, error: `HTTP ${res.status}`, latencyMs };
      }
      const body = await res.json();
      return {
        ok: true,
        apiOrigin: origin,
        status: body.status,
        latencyMs,
        dbProvider: typeof body.dbProvider === 'string' ? body.dbProvider : undefined,
        dbHostMasked: typeof body.dbHostMasked === 'string' ? body.dbHostMasked : undefined,
      };
    } catch (e: any) {
      return {
        ok: false,
        apiOrigin: origin,
        error: e?.message || String(e),
        latencyMs: Math.round(performance.now() - start),
      };
    }
  }
}
