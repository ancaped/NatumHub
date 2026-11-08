import React from 'react';
import type { AcompanhamentoLote } from '../lib/tipos';
import { EyeOff, Undo2 } from 'lucide-react';

export interface renderQuadrosOcultosBadgesAcaoCtx {
  handleRestaurarLoteNoQuadro: (loteNumber: string, quadro: string) => Promise<void>;
}

export function renderQuadrosOcultosBadgesAcao({ handleRestaurarLoteNoQuadro }: renderQuadrosOcultosBadgesAcaoCtx, lote: AcompanhamentoLote) {
    const raw = lote.quadrosOcultos || (lote as any).quadros_ocultos;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
    const quadroNomeMap: Record<string, string> = {
      pesagem: 'Pesagem',
      producao: 'Produção',
      rotulagem: 'Rotulagem',
      envase: 'Envase'
    };
    return (
      <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-zinc-100 text-[11px] md:text-[10px]">
        <span className="text-zinc-500 font-semibold flex items-center gap-1">
          <EyeOff className="h-3 w-3 text-red-500 shrink-0" />
          <span>Fora de:</span>
        </span>
        {raw.map((q: string) => (
          <span key={q} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 capitalize font-medium">
            <span>{quadroNomeMap[q.toLowerCase()] || q}</span>
            <button
              type="button"
              onClick={() => handleRestaurarLoteNoQuadro(lote.loteNumber, q)}
              className="hover:text-red-900 cursor-pointer ml-0.5 p-0.5 hover:bg-red-100 rounded"
              title={`Restaurar lote no quadro de ${quadroNomeMap[q.toLowerCase()] || q}`}
            >
              <Undo2 className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {raw.length > 1 && (
          <button
            type="button"
            onClick={() => handleRestaurarLoteNoQuadro(lote.loteNumber, 'todos')}
            className="text-zinc-600 hover:text-zinc-800 underline font-semibold ml-0.5 cursor-pointer text-[11px] md:text-[10px]"
            title="Restaurar visualização em todos os quadros operacionais"
          >
            Restaurar todos
          </button>
        )}
      </div>
    );
  }
