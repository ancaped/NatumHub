import React, { useEffect, useState } from 'react';
import {
  Server,
  Monitor,
  Code2,
  Crown,
  Loader2,
  Wifi,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { APP_NAME } from '../lib/utils';
import {
  loadConnectionConfig,
  saveConfigToTauri,
  checkServerHealth,
  normalizeClientConfig,
  markConnectionSetupCompleted,
  canBePrincipalServer,
  isDeveloperInstall,
  isDevRuntime,
  DEFAULT_API_PORT,
  type ClientConfig,
  type HealthCheckResult,
} from '../lib/connectionConfig';

export type InstallRole = 'server' | 'terminal' | 'development';

interface SetupConnectionViewProps {
  onComplete: () => void;
}

export default function SetupConnectionView({ onComplete }: SetupConnectionViewProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<InstallRole | null>(null);
  const [allowsServer, setAllowsServer] = useState(false);
  const [isDevInstall, setIsDevInstall] = useState(false);
  const [loadingCaps, setLoadingCaps] = useState(true);

  const [apiOrigin, setApiOrigin] = useState('');
  const [deviceLabel, setDeviceLabel] = useState(() => loadConnectionConfig().deviceLabel || '');
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([canBePrincipalServer(), isDeveloperInstall()]).then(([serverOk, dev]) => {
      setAllowsServer(serverOk);
      setIsDevInstall(dev);
      if (dev && !serverOk) {
        setRole('development');
      }
      setLoadingCaps(false);
    });
  }, []);

  const handleTest = async () => {
    const origin = apiOrigin.trim().replace(/\/$/, '');
    if (!origin) {
      setError('Informe o endereço do servidor.');
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const result = await checkServerHealth(origin);
      setHealth(result);
      if (!result.ok) {
        setError(result.error || 'Servidor offline ou inacessível.');
      }
    } finally {
      setTesting(false);
    }
  };

  const buildConfig = (): ClientConfig => {
    const base = normalizeClientConfig({
      ...loadConnectionConfig(),
      deviceLabel: deviceLabel.trim() || loadConnectionConfig().deviceLabel,
    });

    if (role === 'server') {
      return markConnectionSetupCompleted(
        {
          ...base,
          appMode: 'master',
          isSyncMaster: true,
          apiOrigin: `http://127.0.0.1:${DEFAULT_API_PORT}`,
          apiBindHost: base.apiBindHost || '0.0.0.0',
          apiPort: base.apiPort || DEFAULT_API_PORT,
          setupLocked: false,
        },
        'server'
      );
    }

    const origin = apiOrigin.trim().replace(/\/$/, '') || base.apiOrigin;
    return markConnectionSetupCompleted(
      {
        ...base,
        appMode: 'client',
        isSyncMaster: false,
        apiOrigin: origin,
        setupLocked: true,
      },
      role === 'development' ? 'development' : 'terminal'
    );
  };

  const handleFinish = async () => {
    setError(null);

    if (role === 'terminal') {
      if (!apiOrigin.trim()) {
        setError('Informe o endereço do PC servidor.');
        return;
      }
      if (!health?.ok) {
        setError('Teste a conexão com o servidor antes de continuar.');
        return;
      }
    }

    if (role === 'server') {
      const ok = window.confirm(
        'Este PC será o SERVIDOR único da rede:\n\n' +
          '• Banco SQLite local (todos os dados)\n' +
          '• Sync ERP e backup automático\n' +
          '• Outros PCs devem ser Terminais apontando para este\n\n' +
          'Reinicie o aplicativo após concluir a configuração inicial.\n\nContinuar?'
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const config = buildConfig();
      await saveConfigToTauri(config);

      if (role === 'server') {
        alert(
          'Servidor configurado.\n\n' +
            'Na próxima etapa, crie a conta supervisor.\n' +
            'Reinicie o NatumHub se o login ou sync não funcionar imediatamente.'
        );
      }

      onComplete();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  };

  const selectRole = (next: InstallRole) => {
    if (next === 'server' && !allowsServer) return;
    setRole(next);
    setError(null);
    setHealth(null);
    setStep(2);
    if (next === 'terminal' && !apiOrigin) {
      setApiOrigin(`http://127.0.0.1:${DEFAULT_API_PORT}`);
    }
  };

  if (loadingCaps) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 flex flex-col bg-zinc-50 font-sans text-zinc-900 overflow-y-auto">
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg my-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto bg-zinc-900 text-white p-3 rounded-xl w-fit">
              <Server className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Configurar {APP_NAME}</h1>
            <p className="text-sm text-zinc-500 leading-relaxed">
              {step === 1
                ? 'Primeira instalação — como este computador será usado?'
                : 'Detalhes da conexão'}
            </p>
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <button
                type="button"
                disabled={!allowsServer}
                onClick={() => selectRole('server')}
                className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                  allowsServer
                    ? 'border-amber-300 bg-amber-50/80 hover:border-amber-400 cursor-pointer'
                    : 'border-zinc-100 bg-zinc-50 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-5 w-5 text-amber-600" />
                  <span className="font-black text-zinc-900">Servidor (PC Principal)</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Um único PC na rede com banco SQLite, sync ERP e backup. Exige build{' '}
                  <strong>NatumHub Estável</strong>.
                </p>
                {!allowsServer && (
                  <p className="text-[11px] text-amber-800 mt-2 font-semibold">
                    Indisponível nesta instalação
                    {isDevRuntime() ? ' (tauri dev)' : isDevInstall ? ' (Alpha/Beta)' : ''}. Use Terminal ou
                    Desenvolvimento.
                  </p>
                )}
              </button>

              <button
                type="button"
                onClick={() => selectRole('terminal')}
                className="w-full text-left rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 hover:border-indigo-300 p-4 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Monitor className="h-5 w-5 text-indigo-600" />
                  <span className="font-black text-zinc-900">Terminal (Beta ou Estável)</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Operação diária — dados salvos no servidor. Informe o endereço do PC Principal (LAN ou Tailscale).
                </p>
              </button>

              <button
                type="button"
                onClick={() => selectRole('development')}
                className="w-full text-left rounded-2xl border-2 border-violet-200 bg-violet-50/60 hover:border-violet-300 p-4 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Code2 className="h-5 w-5 text-violet-600" />
                  <span className="font-black text-zinc-900">Desenvolvimento</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Testes locais — não use como servidor de produção. Pode apontar para homologação depois.
                </p>
              </button>
            </div>
          )}

          {step === 2 && role && (
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4 shadow-sm">
              {role === 'server' && (
                <>
                  <div className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                      Este PC guardará o <strong>data.db</strong> e gerenciará canais Alpha, Beta e Estável para
                      todos os terminais da rede.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      Nome deste PC (opcional)
                    </label>
                    <input
                      type="text"
                      value={deviceLabel}
                      onChange={(e) => setDeviceLabel(e.target.value)}
                      placeholder="Ex.: PC Escritório"
                      className="mt-1.5 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
                    />
                  </div>
                </>
              )}

              {(role === 'terminal' || role === 'development') && (
                <>
                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      Endereço do PC servidor
                    </label>
                    <input
                      type="text"
                      value={apiOrigin}
                      onChange={(e) => {
                        setApiOrigin(e.target.value);
                        setHealth(null);
                      }}
                      placeholder={`http://100.x.x.x:${DEFAULT_API_PORT} ou http://nome-pc:${DEFAULT_API_PORT}`}
                      className="mt-1.5 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm font-mono bg-zinc-50"
                    />
                  </div>

                  {role === 'terminal' && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        onClick={handleTest}
                        disabled={testing}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 text-sm font-bold hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {testing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wifi className="h-4 w-4" />
                        )}
                        Testar conexão
                      </button>
                      {health?.ok && (
                        <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          Conectado ({health.latencyMs}ms)
                        </span>
                      )}
                    </div>
                  )}

                  {role === 'development' && (
                    <p className="text-[11px] text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                      URL opcional agora — ajuste depois em Configurações. Não aponte para produção durante testes
                      arriscados.
                    </p>
                  )}

                  <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      Nome deste PC (opcional)
                    </label>
                    <input
                      type="text"
                      value={deviceLabel}
                      onChange={(e) => setDeviceLabel(e.target.value)}
                      className="mt-1.5 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
                    />
                  </div>
                </>
              )}

              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setError(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-bold hover:bg-zinc-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={saving || (role === 'terminal' && !health?.ok)}
                  className="flex-1 flex items-center justify-center gap-2 bg-zinc-900 text-white font-bold py-2.5 rounded-xl hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Continuar
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
