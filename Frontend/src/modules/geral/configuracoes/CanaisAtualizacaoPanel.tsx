import React, { useEffect, useState } from 'react';
import { Download, Loader2, Shield, Radio } from 'lucide-react';
import type { AuthUser } from '../lib/auth';
import {
  UPDATE_CHANNEL_LABELS,
  runUpdateCheckFlow,
  checkUpdateForUser,
  isUpdaterEnabled,
  getBuildInfo,
  type BuildInfo,
} from '../lib/updateChannel';

interface CanaisAtualizacaoPanelProps {
  currentUser: AuthUser | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
  readOnly?: boolean;
}

export default function CanaisAtualizacaoPanel({
  currentUser,
  setMessage,
  readOnly = false,
}: CanaisAtualizacaoPanelProps) {
  const [checking, setChecking] = useState(false);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  useEffect(() => {
    if (isUpdaterEnabled()) {
      getBuildInfo().then(setBuildInfo);
    }
  }, []);

  if (!currentUser) return null;

  const effective = currentUser.effectiveUpdateChannel ?? currentUser.updateChannel ?? 'stable';
  const userCh = currentUser.userUpdateChannel ?? currentUser.updateChannel ?? 'stable';
  const deviceCh = currentUser.deviceUpdateChannel ?? 'stable';

  const handleCheck = async () => {
    setChecking(true);
    try {
      const result = await runUpdateCheckFlow(currentUser);
      if (result === 'none') {
        const info = await checkUpdateForUser(currentUser);
        setMessage({
          text: `Você está na versão mais recente do canal ${UPDATE_CHANNEL_LABELS[effective]}${info ? ` (${info.currentVersion})` : ''}.`,
          type: 'success',
        });
      } else if (result === 'skipped') {
        setMessage({ text: 'Atualização disponível, mas instalação cancelada.', type: 'success' });
      } else if (result === 'installed') {
        setMessage({ text: 'Atualização instalada. Reiniciando...', type: 'success' });
      } else {
        setMessage({
          text: 'Não foi possível verificar atualizações. Confira conexão ou manifestos no GitHub.',
          type: 'error',
        });
      }
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao verificar atualizações',
        type: 'error',
      });
    } finally {
      setChecking(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
        <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
          <Radio className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-black text-sm tracking-tight">Canal de atualização</h3>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            {readOnly ? 'Somente leitura — alteração pelo supervisor' : 'Operador + instalação'}
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
          <span className="text-[9px] font-bold text-zinc-400 uppercase">Canal efetivo</span>
          <p className="text-sm font-extrabold text-zinc-900 mt-1">{UPDATE_CHANNEL_LABELS[effective]}</p>
          <p className="text-[10px] text-zinc-500 mt-1">Usado pelo updater</p>
        </div>
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
          <span className="text-[9px] font-bold text-zinc-400 uppercase">Operador</span>
          <p className="text-sm font-bold text-zinc-800 mt-1">{UPDATE_CHANNEL_LABELS[userCh]}</p>
        </div>
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
          <span className="text-[9px] font-bold text-zinc-400 uppercase">Instalação (PC)</span>
          <p className="text-sm font-bold text-zinc-800 mt-1">{UPDATE_CHANNEL_LABELS[deviceCh]}</p>
        </div>
      </div>

      {buildInfo && (
        <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 text-xs text-violet-900">
          <span className="font-bold">Build instalado:</span>{' '}
          {buildInfo.productName} · canal {UPDATE_CHANNEL_LABELS[buildInfo.channel]} · v
          {buildInfo.version}
          <span className="block text-[10px] text-violet-700/80 mt-1 font-mono">{buildInfo.identifier}</span>
        </div>
      )}

      {!isUpdaterEnabled() && (
        <p className="text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
          Modo desenvolvimento — updater desativado. Use <code className="text-[10px]">git pull</code> para atualizar o código.
        </p>
      )}

      {isUpdaterEnabled() && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center gap-2 bg-zinc-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Verificar atualização
          </button>
        </div>
      )}

      <div className="text-[10px] text-zinc-500 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
        <Shield className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <div className="space-y-1">
          <p>
            O canal efetivo é o <strong>mais restritivo</strong> entre operador e instalação.
            Dev alpha num PC de produção continua em <strong>estável</strong>.
          </p>
          {!readOnly && (
            <p>
              Altere canais em <strong>Gestão de Operadores</strong> e <strong>Dispositivos</strong>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
