import React, { useCallback, useEffect, useState } from 'react';
import { Radio, Loader2, Save, Lock } from 'lucide-react';
import {
  fetchOperatorsManage,
  updateOperator,
  isSupervisor,
  type AuthUser,
  type OperatorDetail,
  type UpdateChannel,
} from '../lib/auth';
import { UPDATE_CHANNEL_LABELS } from '../lib/updateChannel';

interface OperadoresCanaisPanelProps {
  currentUser: AuthUser | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

export default function OperadoresCanaisPanel({ currentUser, setMessage }: OperadoresCanaisPanelProps) {
  const [operators, setOperators] = useState<OperatorDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Record<string, UpdateChannel>>({});
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [supervisorPasswordConfirm, setSupervisorPasswordConfirm] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ops = await fetchOperatorsManage();
      setOperators(ops.filter((o) => o.role !== 'supervisor' && o.role !== 'admin'));
      const map: Record<string, UpdateChannel> = {};
      for (const op of ops) {
        map[op.id] = op.updateChannel;
      }
      setChannels(map);
    } catch (e: any) {
      setMessage({ text: e?.message || 'Erro ao carregar canais', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setMessage]);

  useEffect(() => {
    if (isSupervisor(currentUser)) load();
  }, [load, currentUser]);

  if (!isSupervisor(currentUser)) return null;

  const validateSupervisorAuth = () => {
    if (!supervisorPassword.trim()) {
      setMessage({ text: 'Informe sua senha de supervisor.', type: 'error' });
      return false;
    }
    if (supervisorPassword !== supervisorPasswordConfirm) {
      setMessage({ text: 'Confirmação da senha do supervisor não confere.', type: 'error' });
      return false;
    }
    return true;
  };

  const handleSaveChannel = async (op: OperatorDetail) => {
    if (!validateSupervisorAuth()) return;
    setSavingId(op.id);
    try {
      await updateOperator(op.id, {
        displayName: op.displayName,
        role: op.role,
        active: op.active,
        modules: op.modules,
        updateChannel: channels[op.id] ?? op.updateChannel,
        supervisorPassword: supervisorPassword,
      });
      setMessage({ text: `Canal de ${op.displayName} atualizado.`, type: 'success' });
      setSupervisorPassword('');
      setSupervisorPasswordConfirm('');
      await load();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Erro ao salvar canal', type: 'error' });
    } finally {
      setSavingId(null);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
        <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
          <Radio className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-black text-sm tracking-tight">Canais por operador</h3>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            Definição de canal — painel administrador
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1">
            <Lock className="h-3 w-3" /> Senha supervisor
          </label>
          <input
            type="password"
            value={supervisorPassword}
            onChange={(e) => setSupervisorPassword(e.target.value)}
            className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Sua senha"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-zinc-500 uppercase">Confirmar senha</label>
          <input
            type="password"
            value={supervisorPasswordConfirm}
            onChange={(e) => setSupervisorPasswordConfirm(e.target.value)}
            className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Repita a senha"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-400 py-6 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="space-y-2">
          {operators.map((op) => (
            <div key={op.id} className="flex flex-wrap items-center gap-3 border border-zinc-100 rounded-xl px-4 py-3">
              <span className="text-sm font-bold text-zinc-800 min-w-[120px]">{op.displayName}</span>
              <select
                value={channels[op.id] ?? op.updateChannel}
                onChange={(e) =>
                  setChannels((p) => ({ ...p, [op.id]: e.target.value as UpdateChannel }))
                }
                className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px]"
              >
                <option value="stable">{UPDATE_CHANNEL_LABELS.stable}</option>
                <option value="beta">{UPDATE_CHANNEL_LABELS.beta}</option>
              </select>
              <button
                onClick={() => handleSaveChannel(op)}
                disabled={savingId === op.id}
                className="flex items-center gap-1 bg-zinc-900 text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {savingId === op.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </button>
            </div>
          ))}
          {operators.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-4">Nenhum operador além do supervisor.</p>
          )}
        </div>
      )}
    </div>
  );
}
