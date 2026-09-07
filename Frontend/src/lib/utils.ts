import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const APP_NAME = "NATUM · HUB";
export const COMPANY_INFO = {
  name: "NÁTUM BIO COSMÉTICOS LTDA",
  address: "RUA LUIS BELLETI, 78, SANTA MARIA, CARANGOLA-MG",
  email: "rafael@natumcosmeticos.com.br",
  contact: "(32) 3741-1773",
};

export const HUB_TOKEN_STORAGE_KEY = 'natum_hub_token';
export const FIREBASE_CONFIG_STORAGE_KEY = 'natum_firebase_config';

// URL base da API REST (Axum)
// Prioridade: VITE_API_URL (env) -> localStorage('natum_api_base') -> window.location.hostname:3001 -> 127.0.0.1:3001
export const API_BASE = (() => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('natum_api_base');
    if (custom) return custom;
    if (window.location?.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `http://${window.location.hostname}:3001/api`;
    }
  }
  return 'http://127.0.0.1:3001/api';
})();

export function getHubToken(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_HUB_TOKEN) {
    const envToken = String(import.meta.env.VITE_HUB_TOKEN).trim();
    if (envToken) return envToken;
  }
  if (typeof window !== 'undefined') {
    return (localStorage.getItem(HUB_TOKEN_STORAGE_KEY) || '').trim();
  }
  return '';
}

export function setHubToken(token: string) {
  if (typeof window === 'undefined') return;
  const trimmed = token.trim();
  if (trimmed) localStorage.setItem(HUB_TOKEN_STORAGE_KEY, trimmed);
  else localStorage.removeItem(HUB_TOKEN_STORAGE_KEY);
}

export function hubAuthHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = getHubToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function isAxumApiUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith(API_BASE)) return true;
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1:3001');
    if (parsed.hostname.includes('googleapis') || parsed.hostname.includes('google.com')) {
      return false;
    }
    if (parsed.port === '3001' && (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/'))) {
      return true;
    }
  } catch {
    /* ignore invalid URLs */
  }
  return /:3001\/api(\/|$|\?)/.test(url);
}

/** Authenticated fetch for the Axum REST API (`Authorization: Bearer <hub_token>`). */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, headers: hubAuthHeaders(init?.headers) });
}

let fetchPatched = false;

/** Safety net so existing `fetch(API_BASE/...)` callers send the hub Bearer token. */
export function installAxumAuthFetch() {
  if (typeof window === 'undefined' || fetchPatched) return;
  fetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveFetchUrl(input);
    if (isAxumApiUrl(url)) {
      const baseHeaders = init?.headers || (input instanceof Request ? input.headers : undefined);
      return original(input, { ...init, headers: hubAuthHeaders(baseHeaders) });
    }
    return original(input, init);
  };
}

/**
 * Local desktop (Tauri on the Axum host): read token generated before the server
 * required auth. Remote Tailscale clients must paste the server token in Hub Settings.
 */
export async function bootstrapHubToken(): Promise<string> {
  const existing = getHubToken();
  if (existing) return existing;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const token = await invoke<string>('get_hub_token');
    if (token && token.trim()) {
      setHubToken(token.trim());
      return token.trim();
    }
  } catch {
    // Not running inside Tauri, or command unavailable.
  }
  return '';
}
