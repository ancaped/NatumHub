/**
 * Cliente HTTP centralizado para o servidor Axum (master).
 * URL dinâmica: master local ou remoto via Tailscale.
 */

import { getApiOrigin, loadConnectionConfig } from './connectionConfig';
import { getAuthToken, clearAuthSession } from './auth';

export function resolveApiOrigin(): string {
  return getApiOrigin();
}

export function getApiBase(): string {
  return `${resolveApiOrigin()}/api`;
}

/** @deprecated Use resolveApiOrigin() — mantido para compatibilidade */
export const API_ORIGIN = 'http://127.0.0.1:3001';

/** @deprecated Use getApiBase() */
export const API_BASE = `${API_ORIGIN}/api`;

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function buildUrl(path: string): string {
  const origin = resolveApiOrigin();
  const base = `${origin}/api`;

  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/api/')) return `${origin}${path}`;
  if (path.startsWith('/')) return `${base}${path}`;
  return `${base}/${path}`;
}

function buildHeaders(init?: RequestInit & { skipAuth?: boolean }): HeadersInit {
  const isJsonBody =
    init?.body != null &&
    typeof init.body === 'string' &&
    !(init.body instanceof FormData);
  const headers: Record<string, string> = {
    ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
  };

  if (init?.headers) {
    const h = init.headers as Record<string, string>;
    Object.assign(headers, h);
  }

  if (!init?.skipAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const deviceId = loadConnectionConfig().deviceId;
    if (deviceId) {
      headers['X-Natum-Device-Id'] = deviceId;
    }
  }

  return headers;
}

export async function apiFetch(path: string, init?: RequestInit & { skipAuth?: boolean }): Promise<Response> {
  const url = buildUrl(path);
  const method = (init?.method || 'GET').toUpperCase();
  const retries = method === 'GET' || method === 'HEAD' ? 2 : 0;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        ...init,
        headers: buildHeaders(init),
      });
    } catch (err: unknown) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        continue;
      }
    }
  }

  const origin = resolveApiOrigin();
  const hint =
    origin.includes('127.0.0.1') || origin.includes('localhost')
      ? 'Verifique se o Nexus está aberto e a API local (:3001) responde.'
      : `Verifique a API em ${origin}.`;
  const msg =
    lastErr instanceof Error && lastErr.message === 'Failed to fetch'
      ? `API inacessível. ${hint}`
      : lastErr instanceof Error
        ? lastErr.message
        : String(lastErr);
  throw new ApiError(msg, 0);
}

export async function apiJson<T = unknown>(path: string, init?: RequestInit & { skipAuth?: boolean }): Promise<T> {
  const res = await apiFetch(path, init);

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (res.status === 401) {
    clearAuthSession();
    if (typeof window !== 'undefined' && !window.location.hash.includes('login')) {
      window.dispatchEvent(new CustomEvent('natum:auth-expired'));
    }
  }

  if (!res.ok) {
    const msg =
      (body && typeof body === 'object' && 'error' in body && String((body as { error: unknown }).error)) ||
      `HTTP ${res.status} em ${path}`;
    throw new ApiError(msg, res.status, body);
  }

  return body as T;
}

export async function hubJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const hubPath = path.startsWith('/hub/') ? path : `/hub/${path.replace(/^\//, '')}`;
  return apiJson<T>(hubPath, init);
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    const data = await apiJson<{ value?: string | null }>(`/settings/${encodeURIComponent(key)}`);
    return data?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await apiJson(`/settings/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  });
}

export async function getSettings(keys: string[]): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getSetting(key)] as const)
  );
  return Object.fromEntries(entries);
}

export async function setSettings(entries: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(entries).map(([key, value]) => setSetting(key, value))
  );
}
