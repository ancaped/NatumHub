import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Monitor, Loader2, ArrowRight, AlertTriangle, CheckCircle2, Server, Laptop, Database,
} from 'lucide-react';
import { APP_NAME } from '../lib/utils';
import {
  loadConnectionConfig,
  saveConfigToTauri,
  normalizeClientConfig,
  markConnectionSetupCompleted,
  checkServerHealth,
  DEFAULT_API_PORT,
  type ClientConfig,
} from '../lib/connectionConfig';

interface SetupConnectionViewProps {
  onComplete: () => void;
  reason?: string | null;
}

type RoleChoice = 'server' | 'terminal';

type BootstrapPostgresResult = {
  ok: boolean;
  message: string;
  postgresEnvPath: string;
  port: number;
  steps: string[];
};

/** Wizard: PC Principal (API+Postgres) ou Terminal (só UI → API do master). */
export default function SetupConnectionView({ onComplete, reason }: SetupConnectionViewProps) {
  const existing = loadConnectionConfig();
  const [role, setRole] = useState<RoleChoice>(
    existing.appMode === 'client' ? 'terminal' : 'server'
  );
  const [deviceLabel, setDeviceLabel] = useState(() => existing.deviceLabel || '');
  const [masterOrigin, setMasterOrigin] = useState(() => {
    if (existing.appMode === 'client' && existing.apiOrigin) return existing.apiOrigin;
    return `http://natumhub.local:${DEFAULT_API_PORT}`;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [pgInstalling, setPgInstalling] = useState(false);
  const [pgOk, setPgOk] = useState<string | null>(null);

  const handleInstallPostgres = async () => {
    setError(null);
    setPgOk(null);
    setPgInstalling(true);
    try {
      const result = await invoke<BootstrapPostgresResult>('hub_bootstrap_local_postgres');
      setPgOk(
        result.message ||
          `PostgreSQL pronto na porta ${result.port}. Env: ${result.postgresEnvPath}`
      );
    } catch (e: unknown) {
      const msg =
        typeof e === 'string'
          ? e
          : e instanceof Error
            ? e.message
            : 'Falha ao instalar PostgreSQL local.';
      setError(msg);
    } finally {
      setPgInstalling(false);
    }
  };

  const buildConfig = (): ClientConfig => {
    if (role === 'terminal') {
      const origin = masterOrigin.trim().replace(/\/$/, '');
      const base = normalizeClientConfig({
        ...loadConnectionConfig(),
        deviceLabel: deviceLabel.trim() || loadConnectionConfig().deviceLabel,
        appMode: 'client',
        isSyncMaster: false,
        apiOrigin: origin,
        apiBindHost: '127.0.0.1',
        apiPort: DEFAULT_API_PORT,
        setupLocked: true,
      });
      return markConnectionSetupCompleted(base, 'terminal');
    }
    const base = normalizeClientConfig({
      ...loadConnectionConfig(),
      deviceLabel: deviceLabel.trim() || loadConnectionConfig().deviceLabel,
      appMode: 'master',
      isSyncMaster: true,
      apiOrigin: `http://127.0.0.1:${DEFAULT_API_PORT}`,
      apiBindHost: '0.0.0.0',
      apiPort: DEFAULT_API_PORT,
      setupLocked: false,
    });
    return markConnectionSetupCompleted(base, 'server');
  };

  const handleFinish = async () => {
    setError(null);
    if (role === 'terminal') {
      const origin = masterOrigin.trim().replace(/\/$/, '');
      if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
        setError('Informe a URL do PC Principal (ex.: http://natumhub.local:3001).');
        return;
      }
      setTesting(true);
      try {
        const health = await checkServerHealth(origin);
        if (!health.ok) {
          setError(
            health.error ||
              `API inacessível em ${origin}. Confirme Tailscale/LAN e se o NatumHub está aberto no master.`
          );
          return;
        }
      } finally {
        setTesting(false);
      }
    }
    setSaving(true);
    try {
      await saveConfigToTauri(buildConfig());
      onComplete();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full w-full min-h-0 flex flex-col items-center justify-center bg-zinc-50 font-sans text-zinc-900 p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-[480px] my-auto bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto bg-emerald-100 text-emerald-700 p-3 rounded-xl w-fit">
            <Monitor className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Bem-vindo ao {APP_NAME}</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Escolha o papel deste computador. O banco PostgreSQL fica no PC Principal.
          </p>
        </div>

        {reason && (
          <div className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{reason}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRole('server')}
            disabled={saving}
            className={`flex flex-col items-start gap-2 p-3 rounded-xl border text-left cursor-pointer transition-colors ${
              role === 'server'
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100'
            }`}
          >
            <Server className="h-5 w-5" />
            <span className="text-xs font-extrabold uppercase tracking-wide">PC Principal</span>
            <span className={`text-[11px] leading-snug ${role === 'server' ? 'text-zinc-300' : 'text-zinc-500'}`}>
              Postgres + API :3001 + sync ERP
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRole('terminal')}
            disabled={saving}
            className={`flex flex-col items-start gap-2 p-3 rounded-xl border text-left cursor-pointer transition-colors ${
              role === 'terminal'
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100'
            }`}
          >
            <Laptop className="h-5 w-5" />
            <span className="text-xs font-extrabold uppercase tracking-wide">Terminal</span>
            <span className={`text-[11px] leading-snug ${role === 'terminal' ? 'text-zinc-300' : 'text-zinc-500'}`}>
              Navegador em http://natumhub.local:3001 (sem instalador)
            </span>
          </button>
        </div>

        <div>
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Nome deste PC (opcional)
          </label>
          <input
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder="Ex.: Escritório, Produção"
            className="mt-1.5 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
            disabled={saving}
          />
        </div>

        {role === 'terminal' && (
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              URL da API do PC Principal
            </label>
            <input
              type="url"
              value={masterOrigin}
              onChange={(e) => setMasterOrigin(e.target.value)}
              placeholder={`http://natumhub.local:${DEFAULT_API_PORT}`}
              className="mt-1.5 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50 font-mono"
              disabled={saving || testing}
            />
            <p className="text-[10px] text-zinc-400 mt-1">
              Preferência: http://natumhub.local:3001 (hosts/DNS). Alternativa: IP LAN ou Tailscale.
            </p>
          </div>
        )}

        {role === 'server' && (
          <div className="space-y-3">
            <ul className="text-xs text-zinc-600 space-y-1.5 bg-zinc-50 border border-zinc-100 rounded-xl p-3">
              <li className="flex gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                No NatumHub Dev: um clique instala Postgres 17, cria o banco e o <code className="text-[10px]">postgres.env</code>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                Próximo passo: conta supervisor
              </li>
            </ul>

            <button
              type="button"
              onClick={handleInstallPostgres}
              disabled={saving || testing || pgInstalling}
              className="w-full flex items-center justify-center gap-2 border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-900 font-bold text-sm py-2.5 rounded-xl disabled:opacity-60 cursor-pointer"
            >
              {pgInstalling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              {pgInstalling
                ? 'Instalando PostgreSQL (~316 MB, vários minutos)…'
                : 'Instalar PostgreSQL local (Dev)'}
            </button>

            {pgOk && (
              <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                {pgOk}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
        )}

        <button
          type="button"
          onClick={handleFinish}
          disabled={saving || testing || pgInstalling}
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm py-3 rounded-xl disabled:opacity-60 cursor-pointer"
        >
          {saving || testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {testing ? 'Testando API…' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
