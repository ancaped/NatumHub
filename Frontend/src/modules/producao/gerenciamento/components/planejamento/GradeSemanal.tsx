import React from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { ehBombona } from '../../../lib/processoProduto';
import type { TipoAviso } from '../../../../geral/components/ui/Aviso';
import { groupCellItems, infoDoReator, formatDateStr, validarAlocacao, type PlanejamentoItem, type ReatorConfig } from './lib/planejamentoSemanal';
import { CartaoOrdem, type PropsCompartilhadasCartao, type ArrasteTela } from './CartaoOrdem';
import type { DiaSemana } from './tiposDrawers';

interface GradeSemanalProps {
  weekDays: DiaSemana[];
  reatores: ReatorConfig[];
  matrixItemsMap: Record<string, PlanejamentoItem[]>;
  plannedItems: PlanejamentoItem[];
  podeEditar: boolean;
  arraste: ArrasteTela;
  cartao: PropsCompartilhadasCartao;
  avisar: (mensagem: string, tipo?: TipoAviso) => void;
  handleSaveItem: (newItem: PlanejamentoItem) => Promise<boolean>;
  fetchPlanejamento: () => Promise<void>;
  handleOpenScheduleModal: (product: any | null, targetDate?: string, targetReator?: string) => void;
}

/** Grade (desktop): reatores nas linhas, segunda a sexta nas colunas; recebe o arraste de ordens e de itens da fila. */
export function GradeSemanal({ weekDays, reatores, matrixItemsMap, plannedItems, podeEditar, arraste, cartao, avisar, handleSaveItem, fetchPlanejamento, handleOpenScheduleModal }: GradeSemanalProps) {
  const {
    dragOverCell, setDragOverCell, draggedBatch, setDraggedBatch, draggedItem, setDraggedItem, draggedDrawerProduct, setDraggedDrawerProduct,
  } = arraste;

  return (
    <div className={`hidden md:block flex-1 min-w-0 bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden ${podeEditar ? '' : 'pointer-events-none'}`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-zinc-900 text-white border-b border-zinc-800">
              <th className="p-3 w-56 font-bold text-zinc-200 border-r border-zinc-800">
                REATOR / CAPACIDADE
              </th>
              {weekDays.map(day => {
                const isToday = day.dateStr === formatDateStr(new Date());
                return (
                <th key={day.dateStr} className={`p-3 font-bold border-r border-zinc-800 min-w-[200px] ${
                  day.holiday ? 'bg-amber-950/60 text-amber-200' : isToday ? 'bg-zinc-800 border-b-2 border-b-emerald-400 text-white' : 'text-zinc-100'
                }`}>
                  <div className="flex items-center justify-between">
                    <span>{day.label} ({day.dayNumber})</span>
                    {day.holiday && (
                      <span className="text-[10px] bg-amber-200/80 text-amber-950 px-1.5 py-0.5 rounded font-normal" title={day.holiday.name}>
                        Feriado
                      </span>
                    )}
                  </div>
                  {day.holiday && (
                    <div className="text-[10px] text-amber-300 font-normal truncate mt-0.5" title={day.holiday.name}>
                      {day.holiday.name}
                    </div>
                  )}
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {reatores.filter(r => r.ativo).map(reator => (
              <tr key={reator.id} className="hover:bg-zinc-50/40 transition-colors">
                {/* Linha do Reator / Bombonas */}
                <td className="p-3 font-semibold text-zinc-800 border-r border-zinc-200 bg-zinc-50/50 align-top w-56">
                  {(() => {
                    const info = infoDoReator(reator);
                    const Icone = info.Icone;
                    return (
                      <>
                        <div className="flex items-start gap-1.5">
                          <Icone size={16} className="text-zinc-500 mt-0.5"><title>{info.titulo}</title></Icone>
                          <div className="flex flex-col">
                            <span className="font-bold text-zinc-900 text-xs leading-tight">{reator.nome}</span>
                            {info.tipo !== 'bombona' && (
                              <span className="text-[10px] text-zinc-500 mt-0.5">Capacidade: {reator.capacidade_kg} kg</span>
                            )}
                          </div>
                        </div>
                        <div className="text-[10px] mt-1.5 flex flex-wrap gap-1">
                          <span className={`px-1.5 py-0.2 rounded font-semibold border ${info.badge}`}>
                            {info.rotulo}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </td>

                {/* Colunas Segunda a Sexta */}
                {weekDays.map(day => {
                  const cellKey = `${reator.id}_${day.dateStr}`;
                  const cellItems = matrixItemsMap[cellKey] || [];
                  const isHoliday = !!day.holiday;

                  return (
                    <td 
                      key={day.dateStr} 
                      onDragOver={(e) => {
                        if (isHoliday) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverCell?.reatorId !== reator.id || dragOverCell?.dateStr !== day.dateStr) {
                          setDragOverCell({ reatorId: reator.id, dateStr: day.dateStr });
                        }
                      }}
                      onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        if (dragOverCell?.reatorId === reator.id && dragOverCell?.dateStr === day.dateStr) {
                          setDragOverCell(null);
                        }
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setDragOverCell(null);
                        if (isHoliday) return;

                        // 1. Arrastando card de batelada existente (conjunta ou individual)
                        if (draggedBatch && draggedBatch.length > 0) {
                          const isSameLocation = draggedBatch.every(i => i.reator_id === reator.id && i.data_planejada === day.dateStr);
                          if (isSameLocation) {
                            setDraggedBatch(null);
                            setDraggedItem(null);
                            return;
                          }

                          const totalKg = draggedBatch.reduce((acc, it) => acc + (Number(it.quantidade_planejada) || 0), 0);
                          const bloqueio = validarAlocacao({
                            reatorId: reator.id,
                            dateStr: day.dateStr,
                            kg: totalKg,
                            reatores,
                            plannedItems,
                            ignoreIds: new Set(draggedBatch.map(i => i.id)),
                          });
                          if (bloqueio) {
                            avisar(bloqueio, 'info');
                            setDraggedBatch(null);
                            setDraggedItem(null);
                            return;
                          }

                          const updatedList: PlanejamentoItem[] = [];

                          for (let idx = 0; idx < draggedBatch.length; idx++) {
                            const it = draggedBatch[idx];
                            let newQty = it.quantidade_planejada;
                            let newRecipiente = it.recipiente_detalhe;

                            newRecipiente = ehBombona(reator) ? reator.nome : 'Reator';

                            const updated: PlanejamentoItem = {
                              ...it,
                              reator_id: reator.id,
                              data_planejada: day.dateStr,
                              quantidade_planejada: newQty,
                              recipiente_detalhe: newRecipiente,
                              ordem_sequencia: cellItems.length + 1 + idx
                            };
                            const ok = await handleSaveItem(updated);
                            if (ok) updatedList.push(updated);
                          }
                          if (updatedList.length !== draggedBatch.length) {
                            await fetchPlanejamento();
                          }

                          setDraggedBatch(null);
                          setDraggedItem(null);
                          return;
                        }

                        if (draggedItem) {
                          if (draggedItem.reator_id === reator.id && draggedItem.data_planejada === day.dateStr) {
                            setDraggedItem(null);
                            return;
                          }
                          const bloqueioItem = validarAlocacao({
                            reatorId: reator.id,
                            dateStr: day.dateStr,
                            kg: Number(draggedItem.quantidade_planejada) || 0,
                            reatores,
                            plannedItems,
                            ignoreIds: new Set([draggedItem.id]),
                          });
                          if (bloqueioItem) {
                            avisar(bloqueioItem, 'info');
                            setDraggedItem(null);
                            return;
                          }

                          let newQty = draggedItem.quantidade_planejada;
                          let newRecipiente = draggedItem.recipiente_detalhe;

                          newRecipiente = ehBombona(reator) ? reator.nome : 'Reator';

                          const updated: PlanejamentoItem = {
                            ...draggedItem,
                            reator_id: reator.id,
                            data_planejada: day.dateStr,
                            quantidade_planejada: newQty,
                            recipiente_detalhe: newRecipiente,
                            ordem_sequencia: cellItems.length + 1
                          };

                          setDraggedItem(null);
                          const ok = await handleSaveItem(updated);
                          if (!ok) await fetchPlanejamento();
                          return;
                        }

                        // 2. Arrastando produto novo do Banco de Demandas
                        if (draggedDrawerProduct) {
                          handleOpenScheduleModal(draggedDrawerProduct, day.dateStr, reator.id);
                          setDraggedDrawerProduct(null);
                          return;
                        }
                      }}
                      className={`p-2 border-r border-zinc-200 align-top transition-all relative ${
                        isHoliday ? 'bg-amber-50/30' : ''
                      } ${
                        dragOverCell?.reatorId === reator.id && dragOverCell?.dateStr === day.dateStr
                          ? 'bg-zinc-100 ring-2 ring-zinc-400 ring-inset rounded-sm shadow-inner'
                          : ''
                      }`}
                    >
                      {isHoliday ? (
                        <div className="p-3 bg-amber-50/60 border border-amber-200 border-dashed rounded-lg text-center text-amber-800 text-[11px]">
                          <AlertCircle size={14} className="mx-auto mb-1 text-amber-500" />
                          <span>Feriado Nacional</span>
                          <div className="text-[9px] text-amber-700 mt-0.5 truncate">{day.holiday?.name}</div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 min-h-[110px]">
                          {groupCellItems(cellItems).map(batch => <CartaoOrdem key={batch.key} batch={batch} cellItems={cellItems} {...cartao} />)}

                          {/* Botão de Agendamento Rápido na Célula Vaga */}
                          {cellItems.length === 0 && podeEditar && (
                            <button
                              onClick={() => {
                                handleOpenScheduleModal(null, day.dateStr, reator.id);
                              }}
                              className="w-full py-6 flex flex-col items-center justify-center gap-1 border border-dashed border-zinc-200 hover:border-zinc-400 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-all cursor-pointer"
                            >
                              <Plus size={14} />
                              <span className="text-[10px] font-medium">Agendar</span>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
