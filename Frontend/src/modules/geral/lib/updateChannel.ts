import { invoke } from '@tauri-apps/api/core';
import type { AuthUser } from './auth';

export type BuildChannel = 'stable' | 'dev';

export interface BuildInfo {
  channel: BuildChannel;
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

function parseBuildChannel(raw: unknown): BuildChannel {
  const ch = String(raw ?? 'stable').toLowerCase();
  if (ch === 'dev' || ch === 'development' || ch === 'alpha' || ch === 'beta') return 'dev';
  return 'stable';
}

export async function getBuildInfo(): Promise<BuildInfo | null> {
  if (cachedBuildInfo) return cachedBuildInfo;
  try {
    const info = await invoke<BuildInfo>('get_build_info');
    cachedBuildInfo = {
      ...info,
      channel: parseBuildChannel(info.channel),
      canBePrincipalServer: Boolean(info.canBePrincipalServer ?? (info as { can_be_principal_server?: boolean }).can_be_principal_server),
      isDeveloperInstall: Boolean(info.isDeveloperInstall ?? (info as { is_developer_install?: boolean }).is_developer_install),
    };
    return cachedBuildInfo;
  } catch (e) {
    console.warn('get_build_info indisponível:', e);
    return null;
  }
}

/** Verifica atualização no canal Estável. */
export async function checkUpdateForUser(user: AuthUser | null): Promise<ChannelUpdateInfo | null> {
  if (!user || !isUpdaterEnabled()) return null;
  try {
    return await invoke<ChannelUpdateInfo>('check_channel_update', { channel: 'stable' });
  } catch (e) {
    console.error('Erro ao verificar atualização:', e);
    return null;
  }
}

/** Confirmação dupla antes de instalar. */
export async function confirmAndInstallUpdate(
  user: AuthUser | null,
  info: ChannelUpdateInfo
): Promise<boolean> {
  if (!user || !info.available || !info.version || !isUpdaterEnabled()) return false;

  const build = await getBuildInfo();

  const msg1 =
    `Atualização Estável disponível\n` +
    `Build: ${build?.productName ?? 'NatumHub'} v${info.currentVersion}\n` +
    `Nova versão: ${info.version}\n\n` +
    (info.body ? `Notas:\n${info.body}\n\n` : '') +
    `Confirma que deseja BAIXAR e INSTALAR esta atualização?`;

  if (!confirm(msg1)) return false;

  const msg2 =
    `Última confirmação — operador: ${user.displayName}\n` +
    `Estável → v${info.version}\n\n` +
    `O aplicativo será reiniciado após a instalação. Continuar?`;

  if (!confirm(msg2)) return false;

  await invoke('install_channel_update', { channel: 'stable' });
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
