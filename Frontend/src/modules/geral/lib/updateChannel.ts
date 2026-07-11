import { invoke } from '@tauri-apps/api/core';
import type { AuthUser, UpdateChannel } from './auth';

export type { UpdateChannel };

export const UPDATE_CHANNEL_LABELS: Record<UpdateChannel, string> = {
  alpha: 'Alpha (desenvolvimento)',
  beta: 'Beta (testes)',
  stable: 'Estável (produção)',
};

export interface BuildInfo {
  channel: UpdateChannel;
  identifier: string;
  productName: string;
  version: string;
  canBePrincipalServer: boolean;
  isDeveloperInstall: boolean;
}

export interface ChannelUpdateInfo {
  available: boolean;
  channel: string;
  buildChannel?: string;
  currentVersion: string;
  version?: string;
  body?: string;
  date?: string;
}

let cachedBuildInfo: BuildInfo | null = null;

/** Em dev (`tauri dev`) não verifica updater — código vem do git. */
export function isUpdaterEnabled(): boolean {
  return !import.meta.env.DEV;
}

function channelRank(ch: UpdateChannel): number {
  if (ch === 'alpha') return 2;
  if (ch === 'beta') return 1;
  return 0;
}

function minChannel(a: UpdateChannel, b: UpdateChannel): UpdateChannel {
  return channelRank(a) <= channelRank(b) ? a : b;
}

export async function getBuildInfo(): Promise<BuildInfo | null> {
  if (cachedBuildInfo) return cachedBuildInfo;
  try {
    const info = await invoke<BuildInfo>('get_build_info');
    cachedBuildInfo = {
      ...info,
      channel: parseChannel(info.channel),
      canBePrincipalServer: Boolean(info.canBePrincipalServer ?? info.can_be_principal_server),
      isDeveloperInstall: Boolean(info.isDeveloperInstall ?? info.is_developer_install),
    };
    return cachedBuildInfo;
  } catch (e) {
    console.warn('get_build_info indisponível:', e);
    return null;
  }
}

function parseChannel(raw: unknown): UpdateChannel {
  const ch = String(raw ?? 'stable').toLowerCase();
  if (ch === 'alpha' || ch === 'beta') return ch;
  return 'stable';
}

async function channelForUser(user: AuthUser | null): Promise<UpdateChannel> {
  const effective = parseChannel(user?.effectiveUpdateChannel ?? user?.updateChannel ?? 'stable');
  const build = await getBuildInfo();
  if (!build) return effective;
  return minChannel(effective, build.channel);
}

/** Verifica atualização no canal efetivo (operador × instalação × build). */
export async function checkUpdateForUser(user: AuthUser | null): Promise<ChannelUpdateInfo | null> {
  if (!user || !isUpdaterEnabled()) return null;
  const channel = await channelForUser(user);
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
  if (!user || !info.available || !info.version || !isUpdaterEnabled()) return false;

  const channel = await channelForUser(user);
  const build = await getBuildInfo();
  const channelLabel = UPDATE_CHANNEL_LABELS[channel];
  const buildLabel = build ? UPDATE_CHANNEL_LABELS[build.channel] : '—';

  const msg1 =
    `Canal efetivo: ${channelLabel}\n` +
    `Build instalado: ${build?.productName ?? 'NatumHub'} (${buildLabel})\n` +
    `Operador: ${UPDATE_CHANNEL_LABELS[user.userUpdateChannel ?? user.updateChannel]}\n` +
    `Instalação: ${UPDATE_CHANNEL_LABELS[user.deviceUpdateChannel ?? 'stable']}\n` +
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

  await invoke('install_channel_update', { channel });
  return true;
}

export async function runUpdateCheckFlow(user: AuthUser | null): Promise<'installed' | 'skipped' | 'none' | 'error'> {
  if (!isUpdaterEnabled()) return 'none';
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
