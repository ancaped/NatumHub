import React from 'react';
import { Flame, Snowflake, ChevronUp, ChevronDown, Settings, Trash2, Edit3, Tag, CheckCircle2 } from 'lucide-react';
import { unidadesDeKg, ehBaseProduto } from '../../../lib/unitConversion';
import { previsaoEnvase } from '../../../lib/processoProduto';
import { SeloCobertura, piorResultado, type ResultadoOrdem } from '../cobertura';
import { groupCellItems, type CellBatchGroup, type PlanejamentoItem } from './lib/planejamentoSemanal';
import type { EditQtyModalItem } from './tiposDrawers';

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

/** Ações do cartão: os mesmos handlers do componente da tela (nomes mantidos). */
export interface AcoesCartao {
  handleOpenTechnicalModal: (item: PlanejamentoItem, batchItems?: PlanejamentoItem[]) => void;
  handleMoveOrder: (item: PlanejamentoItem, direction: 'up' | 'down') => void;
  handleDeleteBatch: (batchItems: PlanejamentoItem[]) => void;
  handleOpenBatchMassEditModal: (batchItems: PlanejamentoItem[]) => void;
  handleOpenLinkLoteModal: (item: PlanejamentoItem, batchItems?: PlanejamentoItem[]) => void;
  handleToggleBatchAprovacao: (batchItems: PlanejamentoItem[]) => void;
  handleToggleAprovacao: (item: PlanejamentoItem) => void;
  setEditQtyModalItem: (v: EditQtyModalItem | null) => void;
  setCoberturaAberta: (v: boolean) => void;
}

/** O que a grade e a lista por dia repassam igual a todos os cartões. */
export interface PropsCompartilhadasCartao {
  arraste: ArrasteCartao;
  acoes: AcoesCartao;
  diasAteEnvasePorCodigo: Map<string, number>;
  coberturaPorOrdem: Record<string, ResultadoOrdem>;
}

export interface CartaoOrdemProps extends PropsCompartilhadasCartao {
  batch: CellBatchGroup;
  cellItems: PlanejamentoItem[];
}

/** Cartão de uma ordem/batelada: o mesmo JSX serve à grade (desktop) e à lista por dia (celular). */
export function CartaoOrdem({ batch, cellItems, arraste, acoes, diasAteEnvasePorCodigo, coberturaPorOrdem }: CartaoOrdemProps) {
  const { draggedItem, draggedBatch, setDraggedItem, setDraggedBatch, setDragOverCell } = arraste;
  const {
    handleOpenTechnicalModal, handleMoveOrder, handleDeleteBatch, handleOpenBatchMassEditModal, handleOpenLinkLoteModal,
    handleToggleBatchAprovacao, handleToggleAprovacao, setEditQtyModalItem, setCoberturaAberta,
  } = acoes;

  return (

    <div
      draggable={true}
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
      className={`p-2 rounded-lg border transition-all text-xs flex flex-col gap-1.5 shadow-xs cursor-grab active:cursor-grabbing select-none ${
        (draggedBatch?.some(b => b.id === batch.primaryItem.id) || draggedItem?.id === batch.primaryItem.id) ? 'opacity-30 border-dashed border-zinc-400 scale-95' : ''
      } ${
        batch.isAprovado || batch.loteErp
          ? 'bg-white border-zinc-200 border-l-4 border-l-emerald-500 hover:border-zinc-300'
          : 'bg-white border-zinc-200 border-l-4 border-l-zinc-400 hover:border-zinc-300'
      }`}
      title="Arraste para mover para outro dia ou reator"
    >
      {/* 1. Header: Ícone Térmico Discreto, Nome do Produto / Badge Batelada, Botões de Parâmetros e Lixeira */}
      <div className="flex items-start justify-between gap-1 max-md:flex-col">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Ícone Minimalista de Quente ou Frio */}
          {batch.isQuente ? (
            <Flame size={12} className="text-amber-500 shrink-0"><title>Processo Quente</title></Flame>
          ) : (
            <Snowflake size={12} className="text-zinc-400 shrink-0"><title>Processo Frio</title></Snowflake>
          )}
          {batch.isMulti ? (
            <div 
              onClick={() => handleOpenTechnicalModal(batch.primaryItem, batch.items)}
              className="cursor-pointer flex items-center gap-1"
              title="Batelada Conjunta - Clique para configurar parâmetros"
            >
              <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 text-[11px] md:text-[10px] font-bold uppercase tracking-wide border border-zinc-300 font-mono">
                Batelada ({batch.items.length} itens)
              </span>
            </div>
          ) : (
            <span 
              onClick={() => handleOpenTechnicalModal(batch.primaryItem)}
              className="font-bold text-zinc-900 text-xs leading-tight line-clamp-2 cursor-pointer hover:text-zinc-600 transition-colors"
              title="Clique para configurar parâmetros (Processo, Reator, Lote)"
            >
              {batch.primaryItem.descricao || batch.primaryItem.codigo_produto}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 ml-1 max-md:self-end max-md:ml-0">
          {groupCellItems(cellItems).length > 1 && (
            <>
              <button
                type="button"
                onClick={() => handleMoveOrder(batch.primaryItem, 'up')}
                className="p-1 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded cursor-pointer"
                title="Subir na sequência do dia"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => handleMoveOrder(batch.primaryItem, 'down')}
                className="p-1 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded cursor-pointer"
                title="Descer na sequência do dia"
              >
                <ChevronDown size={12} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => handleOpenTechnicalModal(batch.primaryItem, batch.items)}
            className="p-1 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded cursor-pointer transition-colors"
            title="Configurar Parâmetros"
          >
            <Settings size={12} />
          </button>
          <button
            onClick={() => handleDeleteBatch(batch.items)}
            className="p-1 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded cursor-pointer ml-0.5"
            title="Remover do Planejamento"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* 2. Se for multi-produto, lista os itens com código, descrição e kg individual */}
      {batch.isMulti && (
        <div className="space-y-1 pl-1.5 border-l-2 border-zinc-300 my-0.5">
          {batch.items.map((it) => {
            const estUn = unidadesDeKg(it.quantidade_planejada, it.descricao, ehBaseProduto({ codigo: it.codigo_produto, descricao: it.descricao }));
            return (
              <div key={it.id} className="text-[11px] leading-tight">
                <div className="font-bold text-zinc-800 line-clamp-1" title={it.descricao}>
                  {it.descricao || it.codigo_produto}
                </div>
                <div className="flex items-center justify-between text-[11px] md:text-[10px] text-zinc-500 font-mono">
                  <span>{it.codigo_produto}</span>
                  <span><strong className="text-zinc-700">{it.quantidade_planejada} kg</strong> ({estUn == null ? "— un" : `~${estUn.toLocaleString("pt-BR")} un`})</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ordens antigas no reator BOMBONAS (histórico): o tamanho aparece como selo; os reatores de bombona de hoje já são o tamanho */}
      {batch.primaryItem.reator_id === 'BOMBONAS' && batch.primaryItem.recipiente_detalhe && (
        <span className="self-start px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 text-[11px] md:text-[10px] font-semibold border border-zinc-200">
          {batch.primaryItem.recipiente_detalhe.replace(/(\d)kg/i, '$1 kg')}
        </span>
      )}

      {/* Envase previsto (dias até o envase definidos no produto) */}
      {(() => {
        const comEnvase = batch.items
          .map(it => ({ it, dias: diasAteEnvasePorCodigo.get(it.codigo_produto) }))
          .filter((x): x is { it: PlanejamentoItem; dias: number } => x.dias !== undefined);
        if (comEnvase.length === 0) return null;
        return (
          <div className="flex flex-col gap-0.5">
            {comEnvase.map(({ it, dias }) => (
              <span
                key={it.id}
                className="text-[11px] md:text-[10px] text-zinc-500"
                title={`Previsão: data planejada + ${dias} dia(s) até o envase (definido no produto). A liberação real continua sendo o laudo físico-químico.`}
              >
                Envase ≥ {previsaoEnvase(it.data_planejada, dias)}{batch.isMulti ? ` · ${it.codigo_produto}` : ''}
              </span>
            ))}
          </div>
        );
      })()}

      {/* 3. Métricas: Massa Total (kg) e Rendimento Previsto */}
      {(() => {
        const isBase = (batch.primaryItem.codigo_produto || '').includes('.36.') || 
          (batch.primaryItem.descricao || '').toUpperCase().startsWith('BASE ') || 
          (batch.primaryItem.descricao || '').toUpperCase().startsWith('PRE BASE ') ||
          batch.primaryItem.codigo_produto === '8.11.002' ||
          batch.primaryItem.codigo_produto === '8.12.002' ||
          batch.primaryItem.codigo_produto === '8.13.001';

        return (
          <>
            <div className="flex items-center justify-between text-[12px] md:text-[11px] bg-zinc-50 px-2 py-1 rounded border border-zinc-150">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (batch.isMulti) {
                    handleOpenBatchMassEditModal(batch.items);
                  } else {
                    setEditQtyModalItem({ item: batch.primaryItem, newQty: batch.primaryItem.quantidade_planejada });
                  }
                }}
                className="flex items-center gap-1 font-bold text-zinc-800 hover:text-zinc-900 hover:bg-zinc-100 px-1 py-0.5 max-md:min-h-11 rounded cursor-pointer transition-colors"
                title="Clique para editar a massa (kg)"
              >
                <span className="font-mono font-extrabold text-zinc-900">{batch.totalKg} kg</span>
                <Edit3 size={10} className="text-zinc-400 hover:text-zinc-700" />
              </button>
              <span className="text-zinc-500 font-medium text-[11px]">
                {batch.isMulti 
                  ? `${batch.items.length} produtos` 
                  : (isBase 
                      ? 'Base Granel' 
                      : (() => {
                          const yieldUnits = unidadesDeKg(batch.primaryItem.quantidade_planejada, batch.primaryItem.descricao, ehBaseProduto({ codigo: batch.primaryItem.codigo_produto, descricao: batch.primaryItem.descricao }));
                          return yieldUnits == null ? '— un' : `~${yieldUnits.toLocaleString('pt-BR')} un`;
                        })()
                    )}
              </span>
            </div>

            {/* 4. Rodapé: Lote ERP e Botão de Aprovação (Apenas Ícone) */}
            <div className="flex items-center justify-between text-[11px] md:text-[10px] pt-0.5 max-md:gap-2">
              <div className="flex items-center gap-1.5 overflow-hidden max-md:flex-wrap">
                {batch.loteErp ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenLinkLoteModal(batch.primaryItem, batch.items);
                    }}
                    className="font-mono text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 font-bold text-[11px] md:text-[9px] px-1.5 py-0.5 max-md:min-h-11 rounded flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                    title="Lote ERP compartilhado vinculado. Clique para editar."
                  >
                    <Tag size={9} className="text-emerald-600" />
                    <span>#{batch.loteErp}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenLinkLoteModal(batch.primaryItem, batch.items);
                    }}
                    className="bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-dashed border-zinc-300 font-medium text-[11px] md:text-[10px] px-2 py-0.5 max-md:min-h-11 rounded flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                    title="Vincular Lote ERP compartilhado"
                  >
                    <Tag size={9} className="text-zinc-500" />
                    <span>+ Vincular Lote</span>
                  </button>
                )}
                <SeloCobertura
                  resultado={piorResultado(batch.items.map(it => coberturaPorOrdem[it.id]))}
                  onClick={() => setCoberturaAberta(true)}
                  compacto
                />
              </div>

              {/* Botão de Aprovação: APENAS O ÍCONE (Sem texto) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (batch.isMulti) {
                    handleToggleBatchAprovacao(batch.items);
                  } else {
                    handleToggleAprovacao(batch.primaryItem);
                  }
                }}
                className={`p-1 max-md:min-h-11 max-md:min-w-11 max-md:flex max-md:items-center max-md:justify-center rounded cursor-pointer transition-all shadow-xs ${
                  batch.isAprovado
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                    : 'bg-zinc-100 hover:bg-emerald-50 text-zinc-400 hover:text-emerald-600 border border-zinc-200'
                }`}
                title={batch.isAprovado 
                  ? "Batelada Aprovada (Clique para desaprovar)" 
                  : "Aprovar Batelada"
                }
              >
                <CheckCircle2 size={13} className={batch.isAprovado ? "text-white" : "text-zinc-400 hover:text-emerald-600"} />
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}
