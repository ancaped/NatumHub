/**
 * Configuração local do dispositivo (localStorage): URL da API e identificação do aparelho.
 * O Nexus roda no navegador, servido pelo próprio servidor: a API é sempre a mesma origem.
 */

export interface ClientConfig {
  apiOrigin: string;
  apiPort: number;
  /** Identificador único deste aparelho (navegador) */
  deviceId?: string;
  deviceLabel?: string;
}

const STORAGE_KEY = 'natum_client_config';

export const DEFAULT_API_PORT = 3001;

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
  return 'Nexus';
}

function defaultConfig(): ClientConfig {
  return {
    apiOrigin: `http://127.0.0.1:${DEFAULT_API_PORT}`,
    apiPort: DEFAULT_API_PORT,
    deviceId: generateDeviceId(),
    deviceLabel: getDefaultDeviceLabel(),
  };
}

export function loadConnectionConfig(): ClientConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw) as Partial<ClientConfig>;
    const cfg = { ...defaultConfig(), ...parsed };
    if (!cfg.deviceId) cfg.deviceId = generateDeviceId();
    return cfg;
  } catch {
    return defaultConfig();
  }
}

function saveConnectionConfig(config: ClientConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getApiOrigin(): string {
  return loadConnectionConfig().apiOrigin.replace(/\/$/, '');
}

/** UI servida pelo Axum (navegador na LAN / Tailscale) — não Vite dev server. */
function isAxumServedUi(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.port === '5175') return false;
  return /^https?:$/.test(window.location.protocol);
}

/** No navegador (SPA no Axum), usa a mesma origem como API e guarda a identificação do aparelho. */
export function ensureBrowserClientConfig(): ClientConfig {
  let cfg = loadConnectionConfig();
  if (!isAxumServedUi()) return cfg;
  cfg = {
    ...cfg,
    apiOrigin: window.location.origin.replace(/\/$/, ''),
    apiPort: DEFAULT_API_PORT,
  };
  saveConnectionConfig(cfg);
  return cfg;
}

/** Aguarda a API ficar online (bootstrap). */
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

