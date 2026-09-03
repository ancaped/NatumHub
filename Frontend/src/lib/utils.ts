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

// URL base da API REST (Axum)
// Prioridade: VITE_API_URL (env) -> localStorage('api_base') -> window.location.hostname:3001 -> 127.0.0.1:3001
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

