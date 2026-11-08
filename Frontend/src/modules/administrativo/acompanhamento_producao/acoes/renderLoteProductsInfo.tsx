import React from 'react';
import type { AcompanhamentoLote, TabType } from '../lib/tipos';
import { getLoteReator } from '../lib/lotes';

export interface renderLoteProductsInfoAcaoCtx {
  currentTab: TabType;
  renderLoteNumberBadge: (loteNum: string) => React.JSX.Element;
}

export function renderLoteProductsInfoAcao({ currentTab, renderLoteNumberBadge }: renderLoteProductsInfoAcaoCtx, lote: AcompanhamentoLote | { loteNumber: string; productCode?: string; productDescription?: string; quantity?: number; quantityKg?: number }, options?: { isConsolidatedBatch?: boolean }) {
    if (!lote || !lote.loteNumber) return null;
    const reatorVal = getLoteReator(lote as AcompanhamentoLote);

    // Multi-produto consolidado apenas em Pesagem e Produção quando o lote foi consolidado com múltiplos itens
    const isMultiBatch = Boolean(
      (options?.isConsolidatedBatch ?? (currentTab === 'quadro_pesagem' || currentTab === 'quadro_producao')) &&
      ((lote as any).lotes && (lote as any).lotes.length > 1)
    );

    if (!isMultiBatch) {
      // No Envase e na Rotulagem, exibe o lote com o produto específico deste card
      return (
        <div>
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-zinc-900 flex-wrap">
            {renderLoteNumberBadge(lote.loteNumber)}
            {reatorVal && (
              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
                {reatorVal}
              </span>
            )}
            {lote.productCode && <span className="text-zinc-400 font-normal font-mono text-[11px]">({lote.productCode})</span>}
          </div>
          <p className="text-xs font-bold text-zinc-800 mt-0.5 line-clamp-2 leading-tight">
            {lote.productDescription}
          </p>
        </div>
      );
    }

    const prods: AcompanhamentoLote[] = (lote as any).lotes || [];
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-zinc-900 flex-wrap">
          {renderLoteNumberBadge(lote.loteNumber)}
          {reatorVal && (
            <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
              {reatorVal}
            </span>
          )}
          <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
            {prods.length} Produtos
          </span>
        </div>
        <div className="space-y-1 pl-1.5 border-l-2 border-zinc-300">
          {prods.map((p, pIdx) => (
            <div key={`${p.productCode || pIdx}_${pIdx}`} className="text-[11px] leading-tight">
              <span className="font-bold text-zinc-800 line-clamp-1">{p.productDescription}</span>
              <div className="flex items-center justify-between text-[11px] md:text-[10px] text-zinc-500 font-mono">
                <span>{p.productCode}</span>
                <span><strong className="text-zinc-700">{Number(p.quantityKg || 0).toLocaleString('pt-BR')} kg</strong> (~{Number(p.quantity || 0).toLocaleString('pt-BR')} un)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
