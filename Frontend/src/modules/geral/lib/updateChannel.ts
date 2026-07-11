import { invoke } from '@tauri-apps/api/core';
import type { AuthUser, UpdateChannel } from './auth';

export type { UpdateChannel };

export const UPDATE_CHANNEL_LABELS: Record<UpdateChannel, string> = {
  alpha: 'Alpha (desenvolvimento)',
  beta: 'Beta (testes)',
  stable: 'Estável (produção)',
};

export interface ChannelUpdateInfo {
  available: boolean;
  channel: string;
  currentVersion: string;
  version?: string;
  body?: string;
  date?: string;
}

function channelForUser(user: AuthUser | null): UpdateChannel {
  const ch = (user?.updateChannel || 'stable').toLowerCase();
  if (ch === 'alpha' || ch === 'beta') return ch;
  return 'stable';
}

/** Verifica atualização apenas no canal autorizado do operador logado. */
export async function checkUpdateForUser(user: AuthUser | null): Promise<ChannelUpdateInfo | null> {
  if (!user) return null;
  const channel = channelForUser(user);
  try {
    return await invoke<ChannelUpdateInfo>('check_channel_update', { channel });
  } catch (e) {
    console.error('Erro ao verificar atualização:', e);
    return null;
  }
}

/** Confirmação dupla antes de instalar — evita engano de canal/versão. */
export async function confirmAndInstallUpdate(
  user: AuthUser | null,
  info: ChannelUpdateInfo
): Promise<boolean> {
  if (!user || !info.available || !info.version) return false;

  const channelLabel = UPDATE_CHANNEL_LABELS[channelForUser(user)];
  const msg1 =
    `Canal: ${channelLabel}\n` +
    `Versão atual: ${info.currentVersion}\n` +
    `Nova versão: ${info.version}\n\n` +
    (info.body ? `Notas:\n${info.body}\n\n` : '') +
    `Confirma que deseja BAIXAR e INSTALAR esta atualização?`;

  if (!confirm(msg1)) return false;

  const msg2 =
    `Última confirmação — operador: ${user.displayName}\n` +
    `Canal ${channelLabel} → v${info.version}\n\n` +
    `O aplicativo será reiniciado após a instalação. Continuar?`;

  if (!confirm(msg2)) return false;

  const channel = channelForUser(user);
  await invoke('install_channel_update', { channel });
  return true;
}

export async function runUpdateCheckFlow(user: AuthUser | null): Promise<'installed' | 'skipped' | 'none' | 'error'> {
  try {
    const info = await checkUpdateForUser(user);
    if (!info) return 'error';
    if (!info.available) return 'none';

    const installed = await confirmAndInstallUpdate(user, info);
    if (installed) {
      try {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } catch (e) {
        console.error('Erro ao reiniciar:', e);
      }
      return 'installed';
    }
    return 'skipped';
  } catch (e) {
    console.error(e);
    return 'error';
  }
}
