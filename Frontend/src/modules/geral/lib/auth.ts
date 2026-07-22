/**
 * Autenticação local de operadores (sem Google/Firebase).
 */

import { apiJson } from './http';
import { loadConnectionConfig } from './connectionConfig';
import type { ModuleGroup } from './modules/registry';

const TOKEN_KEY = 'natum_auth_token';
const USER_KEY = 'natum_auth_user';

/** Sempre Estável — campos mantidos por compatibilidade com a API. */
export type UpdateChannel = 'stable';

export interface AuthUser {
  id: string;
  displayName: string;
  role: string;
  photoURL: string;
  modules: string[];
  /** Sempre 'stable' (compat API). */
  updateChannel: UpdateChannel;
  userUpdateChannel: UpdateChannel;
  deviceUpdateChannel: UpdateChannel;
  effectiveUpdateChannel: UpdateChannel;
  isSupervisor: boolean;
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
  hasPassword: boolean;
}

export interface HubDevice {
  deviceId: string;
  label: string;
  updateChannel: UpdateChannel;
  lastIp?: string | null;
  lastSeen?: string | null;
  registeredBy?: string | null;
  registeredAt?: string | null;
}

export interface SetupStatus {
  needsSupervisorSetup: boolean;
  hasSupervisor: boolean;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

function parseChannel(_raw?: unknown): UpdateChannel {
  return 'stable';
}

function mapUser(raw: Record<string, unknown>): AuthUser {
  const modulesRaw = raw.modules ?? raw.module_keys;
  const modules = Array.isArray(modulesRaw) ? modulesRaw.map(String) : [];
  const role = String(raw.role ?? 'operador');
  return {
    id: String(raw.id ?? ''),
    displayName: String(raw.displayName ?? raw.display_name ?? ''),
    role,
    photoURL: String(raw.photoURL ?? raw.photo_url ?? ''),
    modules,
    updateChannel: 'stable',
    userUpdateChannel: 'stable',
    deviceUpdateChannel: 'stable',
    effectiveUpdateChannel: 'stable',
    isSupervisor: Boolean(raw.isSupervisor ?? raw.is_supervisor) || role === 'supervisor' || role === 'admin',
  };
}

function mapOperator(raw: Record<string, unknown>): OperatorDetail {
  const modulesRaw = raw.modules ?? [];
  return {
    id: String(raw.id ?? ''),
    displayName: String(raw.displayName ?? raw.display_name ?? ''),
    role: String(raw.role ?? 'operador'),
    active: raw.active !== false,
    modules: Array.isArray(modulesRaw) ? modulesRaw.map(String) : [],
    updateChannel: parseChannel(raw.updateChannel ?? raw.update_channel),
    hasPassword: Boolean(raw.hasPassword ?? raw.has_password),
  };
}

function mapDevice(raw: Record<string, unknown>): HubDevice {
  return {
    deviceId: String(raw.deviceId ?? raw.device_id ?? ''),
    label: String(raw.label ?? ''),
    updateChannel: parseChannel(raw.updateChannel ?? raw.update_channel),
    lastIp: (raw.lastIp ?? raw.last_ip) as string | null | undefined,
    lastSeen: (raw.lastSeen ?? raw.last_seen) as string | null | undefined,
    registeredBy: (raw.registeredBy ?? raw.registered_by) as string | null | undefined,
    registeredAt: (raw.registeredAt ?? raw.registered_at) as string | null | undefined,
  };
}

function deviceContext() {
  const cfg = loadConnectionConfig();
  return {
    deviceId: cfg.deviceId,
    deviceLabel: cfg.deviceLabel,
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

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const raw = await apiJson<Record<string, unknown>>('/auth/setup-status', {
    skipAuth: true,
  } as RequestInit & { skipAuth?: boolean });
  return {
    needsSupervisorSetup: Boolean(raw.needsSupervisorSetup ?? raw.needs_supervisor_setup),
    hasSupervisor: Boolean(raw.hasSupervisor ?? raw.has_supervisor),
  };
}

export async function setupSupervisor(data: {
  displayName: string;
  password: string;
}): Promise<LoginResult> {
  const { deviceId, deviceLabel } = deviceContext();
  const res = await apiJson<{
    token: string;
    user: Record<string, unknown>;
    expiresAt?: string;
    expires_at?: string;
  }>('/auth/setup-supervisor', {
    method: 'POST',
    body: JSON.stringify({
      displayName: data.displayName.trim(),
      password: data.password,
      deviceId,
      deviceLabel,
    }),
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

export async function fetchDevicesManage(): Promise<HubDevice[]> {
  const list = await apiJson<Array<Record<string, unknown>>>('/auth/devices/manage');
  return list.map(mapDevice);
}

export async function updateDeviceManage(
  deviceId: string,
  data: {
    label?: string;
    updateChannel?: UpdateChannel;
    supervisorPassword: string;
  }
): Promise<HubDevice> {
  const raw = await apiJson<Record<string, unknown>>(`/auth/devices/manage/${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      label: data.label,
      updateChannel: data.updateChannel,
      supervisorPassword: data.supervisorPassword,
    }),
  });
  return mapDevice(raw);
}

export async function createOperator(data: {
  displayName: string;
  role: string;
  modules: string[];
  updateChannel?: UpdateChannel;
  password: string;
}): Promise<OperatorDetail> {
  const raw = await apiJson<Record<string, unknown>>('/auth/operators/manage', {
    method: 'POST',
    body: JSON.stringify({
      displayName: data.displayName.trim(),
      role: data.role,
      modules: data.modules,
      updateChannel: data.updateChannel,
      password: data.password,
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
    password?: string;
    supervisorPassword?: string;
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
      password: data.password,
      supervisorPassword: data.supervisorPassword,
    }),
  });
  return mapOperator(raw);
}

export async function deleteOperator(id: string): Promise<void> {
  await apiJson(`/auth/operators/manage/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function loginOperator(displayName: string, password: string): Promise<LoginResult> {
  const { deviceId, deviceLabel } = deviceContext();
  const res = await apiJson<{
    token: string;
    user: Record<string, unknown>;
    expiresAt?: string;
    expires_at?: string;
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      displayName: displayName.trim(),
      password,
      deviceId,
      deviceLabel,
    }),
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

export function isSupervisor(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.isSupervisor) return true;
  const r = user.role?.toLowerCase();
  return r === 'supervisor' || r === 'admin';
}

/** @deprecated Use isSupervisor */
export function isAdmin(user: AuthUser | null): boolean {
  return isSupervisor(user);
}

export function canSeeFeedbacks(user: AuthUser | null): boolean {
  return isSupervisor(user);
}
