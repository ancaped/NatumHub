import React, { useState, useEffect } from 'react';
import { Boxes, Settings, User, AlertCircle, Loader2 } from 'lucide-react';
import { loginOperator, fetchOperators, type OperatorOption } from '../lib/auth';

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchOperators()
      .then((list) => {
        setOperators(list);
        if (list.length > 0) {
          setSelectedOperator(list[0].displayName);
        }
      })
      .catch(() => {
        setOperators([]);
      })
      .finally(() => setLoadingOps(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOperator.trim()) {
      setErrorMsg('Selecione um operador cadastrado.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await loginOperator(selectedOperator);
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
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col justify-between">
      {!loginOnly && (
        <header className="bg-white border-b border-zinc-200 px-8 py-4 shrink-0 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-zinc-900 text-white p-2 rounded-lg shadow-sm">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">{appName}</h1>
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Painel Integrado de Gestão</p>
            </div>
          </div>
          <button
            onClick={() => { fetchSqlConfig(); setView('hub_settings'); }}
            className="bg-zinc-100 hover:bg-zinc-200 p-2 rounded-lg text-zinc-650 hover:text-zinc-900 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-zinc-200 shadow-sm"
            title="Configurações Gerais"
          >
            <Settings className="h-4 w-4 text-zinc-500" />
            Configurações
          </button>
        </header>
      )}

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-zinc-200 rounded-2xl shadow-sm p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto bg-zinc-100 text-zinc-900 p-3 rounded-xl w-fit">
              <User className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Identificação do Operador</h2>
            <p className="text-sm text-zinc-500">
              Selecione seu nome na lista. Operadores precisam ser cadastrados pelo administrador.
            </p>
          </div>

          {message && (
            <div className={`p-3 rounded-xl text-sm font-semibold ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Operador</label>
              {loadingOps ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando operadores...
                </div>
              ) : operators.length === 0 ? (
                <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Nenhum operador disponível. Configure a conexão com o servidor ou peça ao administrador.
                </p>
              ) : (
                <select
                  value={selectedOperator}
                  onChange={(e) => setSelectedOperator(e.target.value)}
                  className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
                  disabled={submitting}
                >
                  {operators.map((op) => (
                    <option key={op.displayName} value={op.displayName}>{op.displayName}</option>
                  ))}
                </select>
              )}
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || loadingOps || operators.length === 0}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Entrar
            </button>
          </form>
        </div>
      </main>

      <footer className="w-full text-center py-6 text-xs text-zinc-400">
        &copy; {new Date().getFullYear()} Nátum Bio Cosméticos
      </footer>
    </div>
  );
}
