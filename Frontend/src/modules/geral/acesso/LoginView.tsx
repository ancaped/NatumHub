import React, { useState, useEffect } from 'react';
import { User, AlertCircle, Loader2, Lock } from 'lucide-react';
import { loginOperator } from '../lib/auth';
import { getApiOrigin, checkServerHealth } from '../lib/connectionConfig';
import NexusLogo from '../components/NexusLogo';

interface LoginViewProps {
  message: { text: string; type: 'success' | 'error' } | null;
  setView: (view: any) => void;
  fetchSqlConfig: () => void;
  appName: string;
  loginOnly?: boolean;
  onLoginSuccess?: () => void;
  onReconfigureConnection?: () => void;
}

export default function LoginView({
  message,
  setView,
  fetchSqlConfig,
  appName,
  loginOnly = false,
  onLoginSuccess,
  onReconfigureConnection,
}: LoginViewProps) {
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkingApi, setCheckingApi] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCheckingApi(true);
      setLoadError(null);
      try {
        const health = await checkServerHealth();
        if (cancelled) return;
        if (!health.ok) {
          setLoadError(
            health.error ||
              `API inacessível em ${getApiOrigin()}. No mesmo Wi‑Fi use http://IP-DO-MASTER:3001 (PC Principal ligado). Verifique firewall na porta 3001.`
          );
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Erro ao verificar a API');
        }
      } finally {
        if (!cancelled) setCheckingApi(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg('Informe seu nome de operador.');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Informe sua senha.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await loginOperator(displayName.trim(), password);
      fetchSqlConfig();
      if (onLoginSuccess) {
        onLoginSuccess();
      } else {
        window.location.reload();
      }
    } catch {
      setErrorMsg('Nome ou senha inválidos.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full min-h-0 flex flex-col items-center justify-center bg-zinc-50 font-sans text-zinc-900 p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-[400px] my-auto bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-3 flex flex-col items-center">
          <NexusLogo variant="badge" size="lg" />
          <div>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 uppercase">Nexus</h1>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-zinc-900 text-white">0.1b</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">Entre com sua conta de operador</p>
          </div>
        </div>

        {(message || errorMsg || loadError) && (
          <div
            className={`text-sm rounded-xl px-3 py-2 border flex gap-2 items-start ${
              (errorMsg || loadError || message?.type === 'error')
                ? 'bg-red-50 border-red-100 text-red-700'
                : 'bg-emerald-50 border-emerald-100 text-emerald-800'
            }`}
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg || loadError || message?.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <User className="h-3 w-3" /> Nome
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="username"
              placeholder="Seu nome de operador"
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
              disabled={submitting || checkingApi}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Lock className="h-3 w-3" /> Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
              disabled={submitting || checkingApi}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || checkingApi || Boolean(loadError)}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm py-3 rounded-xl disabled:opacity-60 cursor-pointer"
          >
            {submitting || checkingApi ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        {!loginOnly && onReconfigureConnection && (
          <button
            type="button"
            onClick={onReconfigureConnection}
            className="w-full text-xs text-zinc-500 hover:text-zinc-800 underline cursor-pointer"
          >
            Reconfigurar dispositivo
          </button>
        )}

        {!loginOnly && (
          <button
            type="button"
            onClick={() => setView('hub')}
            className="hidden"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
