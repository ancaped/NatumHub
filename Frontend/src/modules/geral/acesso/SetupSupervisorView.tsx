import React, { useState } from 'react';
import { Shield, Lock, User, Loader2, AlertCircle } from 'lucide-react';
import { setupSupervisor } from '../lib/auth';
import { APP_NAME } from '../lib/utils';

interface SetupSupervisorViewProps {
  onComplete: () => void;
}

export default function SetupSupervisorView({ onComplete }: SetupSupervisorViewProps) {
  const [displayName, setDisplayName] = useState('Edson');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Informe o nome do supervisor.');
      return;
    }
    if (password.length < 8) {
      setError('Senha do supervisor deve ter no mínimo 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      await setupSupervisor({ displayName: displayName.trim(), password });
      onComplete();
    } catch (err: any) {
      setError(err?.message || 'Erro ao configurar supervisor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full min-h-0 flex flex-col items-center justify-center bg-zinc-50 font-sans text-zinc-900 p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-[400px] my-auto bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto bg-violet-100 text-violet-700 p-3 rounded-xl w-fit">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Configurar Supervisor — {APP_NAME}</h1>
          <p className="text-sm text-zinc-500">
            Primeira execução: crie a conta <strong>supervisor</strong> com senha forte.
            Somente ela cadastra outros usuários e gerencia infraestrutura (sync ERP, dispositivos).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <User className="h-3 w-3" /> Nome do supervisor
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Lock className="h-3 w-3" /> Senha (mín. 8 caracteres)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
              disabled={submitting}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Confirmar senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
              disabled={submitting}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-violet-700 hover:bg-violet-800 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Criar conta supervisor
          </button>
        </form>
      </div>
    </div>
  );
}
