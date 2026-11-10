import React from 'react';
import { Flame, Snowflake } from 'lucide-react';
import { SeloCobertura, piorResultado, type ResultadoOrdem } from '../cobertura';
import { situacaoOrdem, type CellBatchGroup, type PlanejamentoItem } from './lib/planejamentoSemanal';

/** Estado e setters do arraste (cartões do quadro e da fila); o dono é o componente da tela. */
export interface ArrasteCartao {
  draggedItem: PlanejamentoItem | null;
  draggedBatch: PlanejamentoItem[] | null;
  setDraggedItem: (v: PlanejamentoItem | null) => void;
  setDraggedBatch: (v: PlanejamentoItem[] | null) => void;
  setDragOverCell: (v: { reatorId: string; dateStr: string } | null) => void;
}

/** Arraste completo da tela: o do cartão mais o produto vindo da fila e a célula sob o ponteiro. */
export interface ArrasteTela extends ArrasteCartao {
  draggedDrawerProduct: any | null;
  dragOverCell: { reatorId: string; dateStr: string } | null;
  setDraggedDrawerProduct: (v: any | null) => void;
}

/** Ações do cartão: tocar abre o painel da ordem (com as ações escritas); o selo de insumos abre os Insumos da semana. */
export interface AcoesCartao {
  abrirOrdem: (batch: CellBatchGroup) => void;
  setCoberturaAberta: (v: boolean) => void;
}

/** O que a grade e a lista por dia repassam igual a todos os cartões. */
export interface PropsCompartilhadasCartao {
  arraste: ArrasteCartao;
  acoes: AcoesCartao;
  coberturaPorOrdem: Record<string, ResultadoOrdem>;
}

export interface CartaoOrdemProps extends PropsCompartilhadasCartao {
  batch: CellBatchGroup;
}

/** Cartão enxuto de uma ordem/batelada: produto, kg, quente/frio e selos. As ações ficam no painel que abre ao tocar. */
export function CartaoOrdem({ batch, arraste, acoes, coberturaPorOrdem }: CartaoOrdemProps) {
  const { draggedItem, draggedBatch, setDraggedItem, setDraggedBatch, setDragOverCell } = arraste;
  const sit = situacaoOrdem(batch);
  const nome = batch.isMulti ? `Batelada (${batch.items.length} itens)` : (batch.primaryItem.descricao || batch.primaryItem.codigo_produto);
  const firme = batch.isAprovado || batch.isLoteCriado;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={true}
      onClick={() => acoes.abrirOrdem(batch)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); acoes.abrirOrdem(batch); } }}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', batch.primaryItem.id);
        e.dataTransfer.effectAllowed = 'move';
        setDraggedBatch(batch.items);
        setDraggedItem(batch.primaryItem);
      }}
      onDragEnd={() => {
        setDraggedBatch(null);
        setDraggedItem(null);
        setDragOverCell(null);
      }}
      className={`px-2 py-1.5 max-md:min-h-11 rounded-lg border border-zinc-200 border-l-4 bg-white hover:border-zinc-300 transition-all text-xs flex flex-col gap-1 shadow-xs cursor-pointer md:cursor-grab select-none ${
        firme ? 'border-l-emerald-500' : 'border-l-zinc-400'
      } ${
        (draggedBatch?.some(b => b.id === batch.primaryItem.id) || draggedItem?.id === batch.primaryItem.id) ? 'opacity-30 border-dashed scale-95' : ''
      }`}
      title="Toque para ver as ações; arraste para mover para outro dia ou reator"
    >
      <div className="flex items-start gap-1.5 min-w-0">
        {batch.isQuente ? (
          <Flame size={12} className="text-amber-500 shrink-0 mt-0.5"><title>Processo quente</title></Flame>
        ) : (
          <Snowflake size={12} className="text-zinc-400 shrink-0 mt-0.5"><title>Processo frio</title></Snowflake>
        )}
        <span className="font-bold text-zinc-900 text-xs leading-tight line-clamp-2 min-w-0 flex-1">{nome}</span>
        <span className="font-mono font-extrabold text-zinc-900 text-xs shrink-0 whitespace-nowrap">{batch.totalKg.toLocaleString('pt-BR')} kg</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className={`px-1.5 rounded border text-[11px] md:text-[10px] font-semibold ${sit.classe}`}>{sit.rotulo}</span>
        <span onClick={(e) => e.stopPropagation()}>
          <SeloCobertura
            resultado={piorResultado(batch.items.map(it => coberturaPorOrdem[it.id]))}
            onClick={() => acoes.setCoberturaAberta(true)}
            compacto
          />
        </span>
      </div>
    </div>
  );
}
