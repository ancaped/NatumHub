import { apiJson } from './http';
import { MODULE_KEYS } from './modules/registry';

export interface HubNotification {
  id: string;
  moduleKey: string;
  kind: 'info' | 'success' | 'warning' | 'error' | string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: string | null;
}

function mapNotification(raw: Record<string, unknown>): HubNotification {
  return {
    id: String(raw.id ?? ''),
    moduleKey: String(raw.moduleKey ?? raw.module_key ?? ''),
    kind: String(raw.kind ?? 'info'),
    title: String(raw.title ?? ''),
    message: String(raw.message ?? ''),
    read: Boolean(raw.read),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
    metadata: raw.metadata != null ? String(raw.metadata) : null,
  };
}

const MODULE_LABELS: Record<string, string> = {
  [MODULE_KEYS.CONFIGURACOES]: 'Configurações',
  [MODULE_KEYS.OPERADORES]: 'Operadores',
  [MODULE_KEYS.PRODUCAO]: 'Produção',
  [MODULE_KEYS.VENDAS]: 'Vendas',
  [MODULE_KEYS.FINANCEIRO]: 'Financeiro',
  [MODULE_KEYS.COMPRAS]: 'Compras',
};

export function moduleLabelForNotification(moduleKey: string): string {
  return MODULE_LABELS[moduleKey] ?? moduleKey.replace(/_/g, ' ');
}

export async function fetchNotifications(): Promise<HubNotification[]> {
  const data = await apiJson<{ items?: Record<string, unknown>[] }>('/notifications');
  return (data.items ?? []).map((item) => mapNotification(item));
}

export async function fetchUnreadCount(): Promise<number> {
  const data = await apiJson<{ count?: number }>('/notifications/unread-count');
  return data.count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiJson(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiJson('/notifications/read-all', { method: 'POST' });
}

export interface PrincipalDeviceInfo {
  deviceId: string;
  deviceLabel: string;
  claimedAt?: string | null;
  hasPrincipal: boolean;
  isThisDevice: boolean;
}

export async function fetchPrincipalDevice(localDeviceId: string): Promise<PrincipalDeviceInfo> {
  const q = encodeURIComponent(localDeviceId);
  return apiJson<PrincipalDeviceInfo>(`/hub/principal-device?deviceId=${q}`);
}

export async function claimPrincipalDevice(deviceId: string, deviceLabel?: string): Promise<void> {
  await apiJson('/hub/claim-principal', {
    method: 'POST',
    body: JSON.stringify({ deviceId, deviceLabel }),
  });
}

export function kindStyles(kind: string): { dot: string; bg: string; text: string } {
  switch (kind) {
    case 'success':
      return { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-800' };
    case 'warning':
      return { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-800' };
    case 'error':
      return { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-800' };
    default:
      return { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-800' };
  }
}

export function formatNotificationTime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
