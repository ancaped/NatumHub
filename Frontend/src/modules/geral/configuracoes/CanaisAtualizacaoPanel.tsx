import React, { useState } from 'react';
import { Download, Loader2, Shield, Radio } from 'lucide-react';
import type { AuthUser } from '../lib/auth';
import {
  UPDATE_CHANNEL_LABELS,
  runUpdateCheckFlow,
  checkUpdateForUser,
} from '../lib/updateChannel';

interface CanaisAtualizacaoPanelProps {
  currentUser: AuthUser | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

export default function CanaisAtualizacaoPanel({
  currentUser,
  setMessage,
}: CanaisAtualizacaoPanelProps) {
  const [checking, setChecking] = useState(false);

  if (!currentUser) return null;

  const channel = currentUser.updateChannel || 'stable';
  const channelLabel = UPDATE_CHANNEL_LABELS[channel] || channel;

  const handleCheck = async () => {
    setChecking(true);
    try {
      const result = await runUpdateCheckFlow(currentUser);
      if (result === 'none') {
        const info = await checkUpdateForUser(currentUser);
        setMessage({
          text: `Você está na versão mais recente do canal ${channelLabel}${info ? ` (${info.currentVersion})` : ''}.`,
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
            Definido pelo supervisor por operador
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
          <span className="text-[9px] font-bold text-zinc-400 uppercase">Seu canal</span>
          <p className="text-sm font-extrabold text-zinc-900 mt-1">{channelLabel}</p>
          <p className="text-[10px] text-zinc-500 mt-1">Operador: {currentUser.displayName}</p>
        </div>
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
          <span className="text-[9px] font-bold text-zinc-400 uppercase">Segurança</span>
          <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
            Só recebe updates do seu canal. Versões de outro canal são bloqueadas automaticamente.
          </p>
        </div>
      </div>

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

      <div className="text-[10px] text-zinc-500 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
        <Shield className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <div className="space-y-1">
          <p>
            <strong>Alpha</strong> — só administradores (desenvolvimento).{' '}
            <strong>Beta</strong> — testadores selecionados.{' '}
            <strong>Estável</strong> — uso diário em todos os PCs.
          </p>
          <p>
            O supervisor altera o canal em <strong>Gestão de Operadores</strong> acima.
            Instalação exige confirmação dupla com canal e versão visíveis.
          </p>
        </div>
      </div>
    </div>
  );
}
