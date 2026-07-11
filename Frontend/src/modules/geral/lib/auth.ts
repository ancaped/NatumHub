/**
 * Autenticação local de operadores (sem Google/Firebase).
 * Firebase permanece exclusivo para backup na nuvem no PC master.
 */

import { apiJson } from './http';
import type { ModuleGroup } from './modules/registry';

const TOKEN_KEY = 'natum_auth_token';
const USER_KEY = 'natum_auth_user';

export type UpdateChannel = 'alpha' | 'beta' | 'stable';

export interface AuthUser {
  id: string;
  displayName: string;
  role: string;
  photoURL: string;
  modules: string[];
  updateChannel: UpdateChannel;
}

export interface OperatorOption {
  displayName: string;
  role: string;
}

export interface OperatorDetail {
  id: string;
  displayName: string;
  role: string;
  active: boolean;
  modules: string[];
  updateChannel: UpdateChannel;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

function mapUser(raw: Record<string, unknown>): AuthUser {
  const modulesRaw = raw.modules ?? raw.module_keys;
  const modules = Array.isArray(modulesRaw)
    ? modulesRaw.map(String)
    : [];
  const ch = String(raw.updateChannel ?? raw.update_channel ?? 'stable').toLowerCase();
  const updateChannel: UpdateChannel =
    ch === 'alpha' || ch === 'beta' ? ch : 'stable';
  return {
    id: String(raw.id ?? ''),
    displayName: String(raw.displayName ?? raw.display_name ?? ''),
    role: String(raw.role ?? 'operador'),
    photoURL: String(raw.photoURL ?? raw.photo_url ?? ''),
    modules,
    updateChannel,
  };
}

function mapOperator(raw: Record<string, unknown>): OperatorDetail {
  const modulesRaw = raw.modules ?? [];
  const ch = String(raw.updateChannel ?? raw.update_channel ?? 'stable').toLowerCase();
  const updateChannel: UpdateChannel =
    ch === 'alpha' || ch === 'beta' ? ch : 'stable';
  return {
    id: String(raw.id ?? ''),
    displayName: String(raw.displayName ?? raw.display_name ?? ''),
    role: String(raw.role ?? 'operador'),
    active: raw.active !== false,
    modules: Array.isArray(modulesRaw) ? modulesRaw.map(String) : [],
    updateChannel,
  };
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    return { ...parsed, modules: parsed.modules ?? [] };
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('localUser');
}

export function saveAuthSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function fetchOperators(): Promise<OperatorOption[]> {
  const list = await apiJson<Array<{ displayName?: string; display_name?: string; role: string }>>(
    '/auth/operators',
    { skipAuth: true } as RequestInit & { skipAuth?: boolean }
  );
  return list.map((o) => ({
    displayName: o.displayName ?? o.display_name ?? '',
    role: o.role,
  }));
}

export async function fetchModuleRegistry(): Promise<ModuleGroup[]> {
  return apiJson<ModuleGroup[]>('/auth/modules/registry');
}

export async function fetchOperatorsManage(): Promise<OperatorDetail[]> {
  const list = await apiJson<Array<Record<string, unknown>>>('/auth/operators/manage');
  return list.map(mapOperator);
}

export async function createOperator(data: {
  displayName: string;
  role: string;
  modules: string[];
  updateChannel?: UpdateChannel;
}): Promise<OperatorDetail> {
  const raw = await apiJson<Record<string, unknown>>('/auth/operators/manage', {
    method: 'POST',
    body: JSON.stringify({
      displayName: data.displayName.trim(),
      role: data.role,
      modules: data.modules,
      updateChannel: data.updateChannel,
    }),
  });
  return mapOperator(raw);
}

export async function updateOperator(
  id: string,
  data: {
    displayName: string;
    role: string;
    active: boolean;
    modules: string[];
    updateChannel: UpdateChannel;
  }
): Promise<OperatorDetail> {
  const raw = await apiJson<Record<string, unknown>>(`/auth/operators/manage/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      displayName: data.displayName.trim(),
      role: data.role,
      active: data.active,
      modules: data.modules,
      updateChannel: data.updateChannel,
    }),
  });
  return mapOperator(raw);
}

export async function loginOperator(displayName: string): Promise<LoginResult> {
  const res = await apiJson<{
    token: string;
    user: Record<string, unknown>;
    expiresAt?: string;
    expires_at?: string;
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ displayName: displayName.trim() }),
    skipAuth: true,
  } as RequestInit & { skipAuth?: boolean });

  const user = mapUser(res.user);
  saveAuthSession(res.token, user);
  return {
    token: res.token,
    user,
    expiresAt: res.expiresAt ?? res.expires_at ?? '',
  };
}

export async function logoutOperator(): Promise<void> {
  const token = getAuthToken();
  try {
    if (token) {
      await apiJson('/auth/logout', { method: 'POST' });
    }
  } catch {
    // offline — limpa local mesmo assim
  }
  clearAuthSession();
}

export async function validateSession(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const raw = await apiJson<Record<string, unknown>>('/auth/me');
    const user = mapUser(raw);
    saveAuthSession(token, user);
    return user;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role?.toLowerCase() === 'admin';
}
