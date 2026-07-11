import React from 'react';
import { Radio, Info } from 'lucide-react';
import { isSupervisor, type AuthUser } from '../lib/auth';
import { NETWORK_CHANNELS_FROZEN } from '../lib/updateChannel';

interface OperadoresCanaisPanelProps {
  currentUser: AuthUser | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

/** Congelado: todos os operadores usam Estável na rede. */
export default function OperadoresCanaisPanel({ currentUser }: OperadoresCanaisPanelProps) {
  if (!isSupervisor(currentUser) || !NETWORK_CHANNELS_FROZEN) return null;

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
        <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
          <Radio className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-black text-sm tracking-tight">Canais por operador</h3>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Congelado</p>
        </div>
      </div>
      <div className="flex items-start gap-2 text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-xl p-4">
        <Info className="h-4 w-4 shrink-0 text-zinc-500 mt-0.5" />
        <p>
          Na rede, <strong>todos os operadores</strong> usam o canal <strong>Estável</strong>.
          Alpha e Beta ficam reservados ao CI local até o fluxo de release amadurecer.
        </p>
      </div>
    </div>
  );
}
