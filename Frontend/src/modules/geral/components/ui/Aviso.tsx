import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export type TipoAviso = 'sucesso' | 'erro' | 'info';

const ESTILOS: Record<TipoAviso, string> = {
  sucesso: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  erro: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-zinc-50 border-zinc-200 text-zinc-800',
};

const ICONES = { sucesso: CheckCircle2, erro: AlertTriangle, info: Info };

/**
 * Aviso temporário no canto inferior direito (substitui alert()).
 * Mostra só o último aviso, some sozinho em 5 s.
 */
export function useAviso(): { avisar: (mensagem: string, tipo?: TipoAviso) => void; aviso: React.ReactNode } {
  const [atual, setAtual] = useState<{ id: number; mensagem: string; tipo: TipoAviso } | null>(null);
  const contador = useRef(0);

  const avisar = useCallback((mensagem: string, tipo: TipoAviso = 'info') => {
    contador.current += 1;
    setAtual({ id: contador.current, mensagem, tipo });
  }, []);

  useEffect(() => {
    if (!atual) return;
    const t = setTimeout(() => setAtual(null), 5000);
    return () => clearTimeout(t);
  }, [atual]);

  const Icone = atual ? ICONES[atual.tipo] : null;
  const aviso = atual && Icone ? (
    <div
      role="status"
      className={cn(
        'fixed bottom-4 right-4 z-[60] max-w-sm flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg text-xs font-semibold no-print',
        ESTILOS[atual.tipo]
      )}
    >
      <Icone className="h-4 w-4 shrink-0 mt-0.5" />
      <span className="flex-1 leading-snug">{atual.mensagem}</span>
      <button
        type="button"
        onClick={() => setAtual(null)}
        className="shrink-0 p-0.5 rounded hover:bg-black/5 cursor-pointer"
        aria-label="Fechar aviso"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null;

  return { avisar, aviso };
}
