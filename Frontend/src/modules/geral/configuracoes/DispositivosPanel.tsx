import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, Loader2, Save, Lock, RefreshCw } from 'lucide-react';
import {
  fetchDevicesManage,
  updateDeviceManage,
  type HubDevice,
  type UpdateChannel,
  type AuthUser,
} from '../lib/auth';
import { UPDATE_CHANNEL_LABELS } from '../lib/updateChannel';
import { loadConnectionConfig } from '../lib/connectionConfig';

interface DispositivosPanelProps {
  currentUser: AuthUser | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

export default function DispositivosPanel({ currentUser, setMessage }: DispositivosPanelProps) {
  const [devices, setDevices] = useState<HubDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [supervisorPasswordConfirm, setSupervisorPasswordConfirm] = useState('');
  const [edits, setEdits] = useState<Record<string, { label: string; updateChannel: UpdateChannel }>>({});

  const localDeviceId = loadConnectionConfig().deviceId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchDevicesManage();
      setDevices(list);
      const map: Record<string, { label: string; updateChannel: UpdateChannel }> = {};
      for (const d of list) {
        map[d.deviceId] = { label: d.label, updateChannel: d.updateChannel };
      }
      setEdits(map);
    } catch (e: any) {
      setMessage({ text: e?.message || 'Erro ao carregar dispositivos', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setMessage]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (deviceId: string) => {
    if (!supervisorPassword.trim()) {
      setMessage({ text: 'Informe sua senha de supervisor para alterar dispositivos.', type: 'error' });
      return;
    }
    if (supervisorPassword !== supervisorPasswordConfirm) {
      setMessage({ text: 'Confirmação da senha do supervisor não confere.', type: 'error' });
      return;
    }
    const edit = edits[deviceId];
    if (!edit) return;

    setSavingId(deviceId);
    try {
      await updateDeviceManage(deviceId, {
        label: edit.label,
        updateChannel: edit.updateChannel,
        supervisorPassword,
      });
      setMessage({ text: 'Dispositivo atualizado.', type: 'success' });
      setSupervisorPassword('');
      setSupervisorPasswordConfirm('');
      await load();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Erro ao salvar dispositivo', type: 'error' });
    } finally {
      setSavingId(null);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-150 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-sm tracking-tight">Dispositivos / Instalações</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Canal por PC — trava alpha em produção
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="text-xs font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-3 py-2 rounded-xl flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-900 leading-relaxed">
        Cada instalação registra um <strong>deviceId</strong> único no primeiro login.
        O canal efetivo de update é o mais restritivo entre operador e instalação —
        um dev alpha num PC de produção (stable) <strong>não</strong> baixa alpha.
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
        <div className="flex items-center justify-center py-8 text-zinc-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando dispositivos...</span>
        </div>
      ) : devices.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-6">
          Nenhum dispositivo registrado ainda. Aparecerão após o primeiro login em cada PC.
        </p>
      ) : (
        <div className="space-y-3">
          {devices.map((d) => {
            const edit = edits[d.deviceId];
            const isLocal = d.deviceId === localDeviceId;
            return (
              <div
                key={d.deviceId}
                className={`border rounded-xl p-4 space-y-3 ${isLocal ? 'border-violet-200 bg-violet-50/30' : 'border-zinc-200'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">
                      {edit?.label || d.label || 'Sem rótulo'}
                      {isLocal && <span className="text-violet-600 font-normal ml-2">(este PC)</span>}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-mono break-all">{d.deviceId}</p>
                    {d.lastIp && (
                      <p className="text-[10px] text-zinc-400 mt-1">IP visto: {d.lastIp}</p>
                    )}
                    {d.lastSeen && (
                      <p className="text-[10px] text-zinc-400">Último acesso: {d.lastSeen}</p>
                    )}
                  </div>
                </div>

                {edit && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Rótulo</label>
                      <input
                        type="text"
                        value={edit.label}
                        onChange={(e) =>
                          setEdits((p) => ({
                            ...p,
                            [d.deviceId]: { ...p[d.deviceId], label: e.target.value },
                          }))
                        }
                        className="mt-1 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Canal da instalação</label>
                      <select
                        value={edit.updateChannel}
                        onChange={(e) =>
                          setEdits((p) => ({
                            ...p,
                            [d.deviceId]: {
                              ...p[d.deviceId],
                              updateChannel: e.target.value as UpdateChannel,
                            },
                          }))
                        }
                        className="mt-1 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="stable">{UPDATE_CHANNEL_LABELS.stable}</option>
                        <option value="beta">{UPDATE_CHANNEL_LABELS.beta}</option>
                        <option value="alpha">{UPDATE_CHANNEL_LABELS.alpha} (lab/dev)</option>
                      </select>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => handleSave(d.deviceId)}
                  disabled={savingId === d.deviceId}
                  className="flex items-center gap-1.5 bg-zinc-900 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingId === d.deviceId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Salvar dispositivo
                </button>
              </div>
            );
          })}
        </div>
      )}

      {currentUser && (
        <p className="text-[10px] text-zinc-400">
          Seu canal efetivo: {UPDATE_CHANNEL_LABELS[currentUser.effectiveUpdateChannel]} —
          operador {UPDATE_CHANNEL_LABELS[currentUser.userUpdateChannel]} × instalação{' '}
          {UPDATE_CHANNEL_LABELS[currentUser.deviceUpdateChannel]}
        </p>
      )}
    </div>
  );
}
