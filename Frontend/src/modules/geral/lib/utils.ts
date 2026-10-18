import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

declare const __APP_VERSION__: string | undefined;

export const APP_NAME = "NEXUS";

/** Retorna a versão da aplicação injetada pelo Vite ou fallback */
export function getAppVersion(): string {
  if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) {
    return __APP_VERSION__;
  }
  return "0.1.0";
}

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : "0.1.0";

/** Detecta se o aplicativo está rodando em ambiente de Desenvolvimento (:3002 ou localhost) ou Produção (:3001) */
export function getAppEnvironment(): 'dev' | 'prod' {
  if (typeof window === 'undefined') return 'prod';
  const port = window.location.port;
  const host = window.location.hostname.toLowerCase();
  if (port === '3002' || port === '5175' || host.includes('dev') || (host === 'localhost' && port !== '3001')) {
    return 'dev';
  }
  return 'prod';
}

export const COMPANY_INFO = {
  name: "NÁTUM BIO COSMÉTICOS LTDA",
  address: "RUA LUIS BELLETI, 78, SANTA MARIA, CARANGOLA-MG",
  email: "rafael@natumcosmeticos.com.br",
  contact: "(32) 3741-1773",
};

/** UUID-ish id — funciona em HTTP (natumhub.local) onde crypto.randomUUID pode não existir. */
export function randomId(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
