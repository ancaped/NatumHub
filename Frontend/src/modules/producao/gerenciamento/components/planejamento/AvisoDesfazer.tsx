import React, { useEffect, useState } from 'react';
import { Undo2, X } from 'lucide-react';

export interface DesfazerAcao {
  id: number;
  mensagem: string;
  desfazer: () => Promise<void>;
}

const SEGUNDOS = 8;

/** Aviso com "Desfazer" no canto inferior; some sozinho em alguns segundos. */
export function AvisoDesfazer({ acao, onFechar }: { acao: DesfazerAcao | null; onFechar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!acao) return;
    const t = setTimeout(onFechar, SEGUNDOS * 1000);
    return () => clearTimeout(t);
  }, [acao?.id]);
  if (!acao) return null;
  return (
    <div role="status" className="fixed bottom-4 left-4 right-4 sm:right-auto z-[60] sm:max-w-sm flex items-center gap-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-white px-4 py-2 shadow-lg text-xs font-semibold no-print">
      <span className="flex-1 leading-snug">{acao.mensagem}</span>
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => { setOcupado(true); try { await acao.desfazer(); } finally { setOcupado(false); onFechar(); } }}
        className="min-h-11 px-3 flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 font-bold cursor-pointer disabled:opacity-50"
      >
        <Undo2 size={14} /> {ocupado ? 'Desfazendo…' : 'Desfazer'}
      </button>
      <button type="button" onClick={onFechar} className="min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-white/10 cursor-pointer" aria-label="Fechar aviso">
        <X size={14} />
      </button>
    </div>
  );
}
