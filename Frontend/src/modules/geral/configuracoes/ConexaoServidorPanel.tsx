import React, { useState, useEffect } from 'react';
import { Server, Wifi, Loader2, Save, Crown, Monitor, Lock, AlertTriangle, Code2 } from 'lucide-react';
import {
  loadConnectionConfig,
  saveConfigToTauri,
  checkServerHealth,
  normalizeClientConfig,
  isSetupLocked,
  isPrincipalPc,
  canBePrincipalServer,
  isDeveloperInstall,
  isDevRuntime,
  type ClientConfig,
  type AppMode,
  type HealthCheckResult,
  DEFAULT_API_PORT,
} from '../lib/connectionConfig';
import { claimPrincipalDevice, fetchPrincipalDevice, type PrincipalDeviceInfo } from '../lib/notifications';

interface ConexaoServidorPanelProps {
  isAdmin: boolean;
  message: { text: string; type: 'success' | 'error' } | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

export default function ConexaoServidorPanel({ isAdmin, setMessage }: ConexaoServidorPanelProps) {
  const [config, setConfig] = useState<ClientConfig>(() => loadConnectionConfig());
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [principalInfo, setPrincipalInfo] = useState<PrincipalDeviceInfo | null>(null);
  const [allowsServer, setAllowsServer] = useState<boolean | null>(null);
  const [developerInstall, setDeveloperInstall] = useState<boolean | null>(null);
  const lockedClient = isSetupLocked() && !isAdmin;

  useEffect(() => {
    let cancelled = false;
    Promise.all([canBePrincipalServer(), isDeveloperInstall()]).then(([serverOk, isDev]) => {
      if (cancelled) return;
      setAllowsServer(serverOk);
      setDeveloperInstall(isDev);
      if (!serverOk && loadConnectionConfig().appMode === 'master') {
        setConfig((prev) => ({
          ...prev,
          appMode: 'client',
          isSyncMaster: false,
        }));
        setMessage({
          text: isDev
            ? 'Versão desenvolvedor/Alpha não pode ser servidor. Modo ajustado para Cliente — aponte para o PC Estável da rede.'
            : 'Somente NatumHub Estável pode ser servidor. Modo ajustado para Cliente.',
          type: 'error',
        });
        setTimeout(() => setMessage(null), 8000);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [setMessage]);

  useEffect(() => {
    handleTest(false);
    if (isAdmin && config.deviceId) {
      fetchPrincipalDevice(config.deviceId)
        .then(setPrincipalInfo)
        .catch(() => setPrincipalInfo(null));
    }
  }, [isAdmin, config.deviceId]);

  const handleTest = async (showToast = true) => {
    setTesting(true);
    try {
      const result = await checkServerHealth(config.apiOrigin);
      setHealth(result);
      if (showToast) {
        setMessage(
          result.ok
            ? { text: `Conectado (${result.latencyMs}ms)`, type: 'success' }
            : { text: result.error || 'Servidor offline', type: 'error' }
        );
        setTimeout(() => setMessage(null), 4000);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!isAdmin) return;

    if (config.appMode === 'master' && allowsServer === false) {
      setMessage({
        text: 'Esta instalação não pode ser PC Principal. Use NatumHub Estável no servidor de produção.',
        type: 'error',
      });
      setTimeout(() => setMessage(null), 6000);
      return;
    }

    if (
      config.appMode === 'client' &&
      !window.confirm(
        'Este PC será configurado como SECUNDÁRIO.\n\n' +
          'Operadores comuns não poderão alterar esta configuração.\n\nConfirma?'
      )
    ) {
      return;
    }

    if (
      config.appMode === 'master' &&
      principalInfo?.hasPrincipal &&
      !principalInfo.isThisDevice &&
      !window.confirm(
        'Outro PC já está registrado como principal no servidor.\n\n' +
          'Ao salvar, ESTE PC passará a ser o único principal e o anterior deverá ser reconfigurado como secundário.\n\nConfirma?'
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const previousMode = loadConnectionConfig().appMode;
      const normalized = normalizeClientConfig({
        ...config,
        apiOrigin: config.apiOrigin.replace(/\/$/, ''),
      });
      await saveConfigToTauri(normalized);
      setConfig(normalized);

      if (normalized.appMode === 'master' && normalized.deviceId) {
        try {
          await claimPrincipalDevice(
            normalized.deviceId,
            normalized.deviceLabel || 'PC Principal'
          );
          const info = await fetchPrincipalDevice(normalized.deviceId);
          setPrincipalInfo(info);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Erro ao registrar PC principal';
          setMessage({
            text: `Config salva, mas falha ao registrar principal: ${msg}. Reinicie o app se acabou de mudar para modo Principal.`,
            type: 'error',
          });
          setSaving(false);
          setTimeout(() => setMessage(null), 8000);
          return;
        }
      }

      const restartHint = normalized.appMode !== previousMode ? ' Reinicie o aplicativo.' : '';
      setMessage({
        text: `Configuração salva!${restartHint}`,
        type: 'success',
      });
      await handleTest(false);
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : 'Erro ao salvar', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  const setAppMode = (mode: AppMode) => {
    if (lockedClient) return;
    if (mode === 'master' && allowsServer === false) return;
    setConfig((prev) => ({
      ...prev,
      appMode: mode,
      isSyncMaster: mode === 'master',
    }));
  };

  const demoteToClient = async () => {
    if (!isAdmin) return;
    const normalized = normalizeClientConfig({
      ...loadConnectionConfig(),
      appMode: 'client',
    });
    await saveConfigToTauri(normalized);
    setConfig(normalized);
    setMessage({ text: 'Este PC foi definido como secundário. Reinicie o aplicativo.', type: 'success' });
    setTimeout(() => setMessage(null), 6000);
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-3">
        <div className="bg-zinc-900 text-white p-2.5 rounded-xl">
          <Server className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold text-zinc-900">Tipo deste computador</h3>
          <p className="text-xs text-zinc-500">
            {isAdmin
              ? 'Somente build Estável pode ser servidor. Terminais Beta/Estável conectam ao PC Principal.'
              : 'Configuração definida pelo administrador neste terminal'}
          </p>
        </div>
      </div>

      {developerInstall && isAdmin && (
        <div className="flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
          <Code2 className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
          <div className="text-xs text-violet-900 space-y-1">
            <p className="font-bold">Instalação desenvolvedor {isDevRuntime() ? '(tauri dev)' : '(Alpha)'}</p>
            <p>
              Não use como servidor — conflita com o PC Estável de produção (porta, banco, sync ERP).
              Configure como <strong>Cliente</strong> e informe o endereço do servidor (ex. Tailscale).
            </p>
          </div>
        </div>
      )}

      {!isAdmin && (
        <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
          {isPrincipalPc() ? (
            <Crown className="h-5 w-5 text-amber-600 shrink-0" />
          ) : (
            <Monitor className="h-5 w-5 text-indigo-600 shrink-0" />
          )}
          <div className="text-xs text-zinc-600">
            <p className="font-bold text-zinc-800">
              {isPrincipalPc() ? 'PC Principal (Servidor)' : 'PC Secundário (Cliente)'}
            </p>
            {!isPrincipalPc() && (
              <p className="mt-1">Conectado a: <code className="text-[10px]">{config.apiOrigin}</code></p>
            )}
          </div>
        </div>
      )}

      {isAdmin && lockedClient && (
        <div className="flex items-start gap-3 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
          <Lock className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
          <p className="text-xs text-zinc-600">
            Terminal secundário bloqueado para operadores. Como admin, você pode alterar o tipo abaixo.
          </p>
        </div>
      )}

      {isAdmin && config.appMode === 'master' && principalInfo?.hasPrincipal && !principalInfo.isThisDevice && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-900 space-y-2">
            <p>
              O PC principal registrado no servidor é <strong>{principalInfo.deviceLabel || 'outro dispositivo'}</strong>.
              Este PC não é o principal ativo.
            </p>
            <button
              type="button"
              onClick={demoteToClient}
              className="text-[11px] font-bold underline hover:no-underline"
            >
              Tornar este PC secundário
            </button>
          </div>
        </div>
      )}

      {isAdmin && !lockedClient && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setAppMode('master')}
            disabled={allowsServer === false}
            className={`text-left rounded-xl border-2 p-4 transition-all ${
              config.appMode === 'master'
                ? 'border-amber-400 bg-amber-50/80 ring-1 ring-amber-200'
                : allowsServer === false
                  ? 'border-zinc-100 bg-zinc-50 opacity-60 cursor-not-allowed'
                  : 'border-zinc-200 bg-white hover:border-zinc-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Crown className={`h-4 w-4 ${config.appMode === 'master' ? 'text-amber-600' : 'text-zinc-400'}`} />
              <span className="text-sm font-black text-zinc-900">PC Principal (Servidor)</span>
            </div>
            <ul className="text-[11px] text-zinc-600 space-y-1 list-disc list-inside">
              <li>Exclusivo do build <strong>NatumHub Estável</strong></li>
              <li>Sync ERP, banco local e gestão dos 3 canais (Alpha/Beta/Estável)</li>
              <li>Único servidor na rede — substitui o principal anterior ao salvar</li>
            </ul>
            {allowsServer === false && (
              <p className="text-[10px] text-amber-800 mt-2 font-semibold">
                Indisponível nesta instalação (Alpha/Beta/dev).
              </p>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAppMode('client')}
            className={`text-left rounded-xl border-2 p-4 transition-all ${
              config.appMode === 'client'
                ? 'border-indigo-400 bg-indigo-50/80 ring-1 ring-indigo-200'
                : 'border-zinc-200 bg-white hover:border-zinc-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Monitor className={`h-4 w-4 ${config.appMode === 'client' ? 'text-indigo-600' : 'text-zinc-400'}`} />
              <span className="text-sm font-black text-zinc-900">PC Secundário / Desenvolvedor</span>
            </div>
            <ul className="text-[11px] text-zinc-600 space-y-1 list-disc list-inside">
              <li>Terminal ou máquina de dev — conecta ao servidor Estável</li>
              <li>Canal de atualização definido pelo supervisor por dispositivo</li>
              <li>Bloqueado para operadores comuns após salvar</li>
            </ul>
          </button>
        </div>
      )}

      {(isAdmin || !isPrincipalPc()) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={config.appMode === 'master' && isAdmin ? 'md:col-span-2' : ''}>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              {config.appMode === 'master' && isAdmin
                ? 'URL da API neste PC (local)'
                : 'Endereço do PC Principal'}
            </label>
            <input
              type="text"
              value={config.apiOrigin}
              onChange={(e) => isAdmin && setConfig({ ...config, apiOrigin: e.target.value })}
              readOnly={!isAdmin}
              placeholder={
                config.appMode === 'master'
                  ? `http://127.0.0.1:${DEFAULT_API_PORT}`
                  : `http://nome-do-pc-principal:${DEFAULT_API_PORT}`
              }
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm font-mono bg-zinc-50 disabled:opacity-70"
            />
          </div>

          {isAdmin && config.appMode === 'master' && (
            <>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Bind host</label>
                <input
                  type="text"
                  value={config.apiBindHost}
                  onChange={(e) => setConfig({ ...config, apiBindHost: e.target.value })}
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm font-mono bg-zinc-50"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Porta API</label>
                <input
                  type="number"
                  value={config.apiPort}
                  onChange={(e) => setConfig({ ...config, apiPort: Number(e.target.value) || DEFAULT_API_PORT })}
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
                />
              </div>
            </>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => handleTest(true)}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-bold hover:bg-zinc-50 disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
            Testar conexão
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      )}

      {health && !health.ok && health.error && isAdmin && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{health.error}</p>
      )}

      {isAdmin && principalInfo?.isThisDevice && config.appMode === 'master' && (
        <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          Este PC está registrado como o <strong>único principal</strong> do NatumHub
          {principalInfo.claimedAt ? ` (desde ${principalInfo.claimedAt})` : ''}.
          Pelo Painel Supervisor você define canal Alpha, Beta ou Estável para cada terminal da rede.
        </p>
      )}
    </div>
  );
}
