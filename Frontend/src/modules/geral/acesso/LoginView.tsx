import React, { useState, useEffect } from 'react';
import { Boxes, Settings, User, AlertCircle, Loader2, Lock } from 'lucide-react';
import { loginOperator, fetchOperators, type OperatorOption } from '../lib/auth';
import {
  getApiOrigin,
  isClientMode,
  isDevRuntime,
  isPrincipalPc,
  checkServerHealth,
} from '../lib/connectionConfig';

interface LoginViewProps {
  message: { text: string; type: 'success' | 'error' } | null;
  setView: (view: any) => void;
  fetchSqlConfig: () => void;
  appName: string;
  loginOnly?: boolean;
  onLoginSuccess?: () => void;
}

export default function LoginView({
  message,
  setView,
  fetchSqlConfig,
  appName,
  loginOnly = false,
  onLoginSuccess,
}: LoginViewProps) {
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [selectedOperator, setSelectedOperator] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOperators = async () => {
    setLoadingOps(true);
    setLoadError(null);
    try {
      if (isClientMode()) {
        const health = await checkServerHealth();
        if (!health.ok) {
          setLoadError(
            health.error ||
              `Não foi possível contactar o servidor em ${getApiOrigin()}. Abra Configurações e verifique o endereço (Tailscale/LAN).`
          );
          setOperators([]);
          return;
        }
      }
      const list = await fetchOperators();
      setOperators(list);
      if (list.length > 0) {
        setSelectedOperator(list[0].displayName);
      } else if (isPrincipalPc()) {
        setLoadError(
          'Nenhum operador cadastrado ainda. Se for a primeira execução, conclua o setup do supervisor ou cadastre operadores em Configurações.'
        );
      } else {
        setLoadError('Servidor respondeu, mas não há operadores ativos. Peça ao supervisor para cadastrar contas.');
      }
    } catch (e: unknown) {
      setOperators([]);
      const msg = e instanceof Error ? e.message : 'Erro ao carregar operadores';
      setLoadError(msg);
    } finally {
      setLoadingOps(false);
    }
  };

  useEffect(() => {
    loadOperators();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOperator.trim()) {
      setErrorMsg('Selecione um operador cadastrado.');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Informe sua senha.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await loginOperator(selectedOperator, password);
      if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível conectar ao servidor. Verifique a rede e o master.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full min-h-0 flex flex-col bg-zinc-50 font-sans text-zinc-900">
      {!loginOnly && (
        <header className="shrink-0 bg-white/80 backdrop-blur-sm border-b border-zinc-200 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-zinc-900 text-white p-1.5 rounded-lg shadow-sm shrink-0">
              <Boxes className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base sm:text-lg tracking-tight truncate">{appName}</h1>
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider hidden sm:block">
                Painel Integrado de Gestão
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              fetchSqlConfig();
              setView('hub_settings');
            }}
            className="shrink-0 bg-zinc-100 hover:bg-zinc-200 px-3 py-2 rounded-lg text-zinc-650 hover:text-zinc-900 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-zinc-200"
            title="Configurações Gerais"
          >
            <Settings className="h-4 w-4 text-zinc-500" />
            <span className="hidden sm:inline">Configurações</span>
          </button>
        </header>
      )}

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 min-h-0 overflow-y-auto">
        <div className="w-full max-w-[400px] my-auto">
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-5">
            <div className="text-center space-y-2">
              <div className="mx-auto bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit">
                <User className="h-6 w-6" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">Identificação do Operador</h2>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Selecione seu nome e informe a senha definida pelo supervisor.
              </p>
            </div>

            {message && (
              <div
                className={`p-3 rounded-xl text-sm font-semibold ${
                  message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Operador</label>
                {loadingOps ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-zinc-400 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando operadores...
                  </div>
              ) : operators.length === 0 ? (
                <div className="mt-2 space-y-2">
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                    {loadError ||
                      'Nenhum operador disponível. Configure a conexão com o servidor ou peça ao supervisor.'}
                  </p>
                  {isClientMode() && (
                    <p className="text-[11px] text-zinc-500">
                      Servidor configurado: <code className="font-mono">{getApiOrigin()}</code>
                    </p>
                  )}
                  {isDevRuntime() && isClientMode() && (
                    <p className="text-[11px] text-violet-700">
                      Em tauri dev, use <strong>Desenvolvimento</strong> no wizard (servidor local) ou aponte para o
                      PC Estável remoto.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={loadOperators}
                      className="text-xs font-bold text-zinc-700 underline hover:no-underline"
                    >
                      Tentar novamente
                    </button>
                    {!loginOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          fetchSqlConfig();
                          setView('hub_settings');
                        }}
                        className="text-xs font-bold text-indigo-700 underline hover:no-underline"
                      >
                        Abrir Configurações
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                  <select
                    value={selectedOperator}
                    onChange={(e) => setSelectedOperator(e.target.value)}
                    className="mt-1.5 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    disabled={submitting}
                  >
                    {operators.map((op) => (
                      <option key={op.displayName} value={op.displayName}>
                        {op.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  disabled={submitting || operators.length === 0}
                  autoComplete="current-password"
                  placeholder="Senha do operador"
                />
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || loadingOps || operators.length === 0}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Entrar
              </button>
            </form>
          </div>

          <p className="text-center text-[11px] text-zinc-400 mt-5">
            &copy; {new Date().getFullYear()} Nátum Bio Cosméticos
          </p>
        </div>
      </main>
    </div>
  );
}
