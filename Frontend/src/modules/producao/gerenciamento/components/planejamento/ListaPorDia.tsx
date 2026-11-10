import React from 'react';
import { Plus } from 'lucide-react';
import { getShortReatorName } from '../../../lib/processoProduto';
import { groupCellItems, infoDoReator, formatDateStr, type PlanejamentoItem, type ReatorConfig } from './lib/planejamentoSemanal';
import { CartaoOrdem, type PropsCompartilhadasCartao } from './CartaoOrdem';
import type { DiaSemana } from './tiposDrawers';

interface ListaPorDiaProps {
  weekDays: DiaSemana[];
  reatores: ReatorConfig[];
  matrixItemsMap: Record<string, PlanejamentoItem[]>;
  podeEditar: boolean;
  handleOpenScheduleModal: (product: any | null, targetDate?: string, targetReator?: string) => void;
  cartao: PropsCompartilhadasCartao;
}

/** Lista por dia (celular): segunda a sexta; só os reatores com ordem no dia, mais um "+" por reator livre. */
export function ListaPorDia({ weekDays, reatores, matrixItemsMap, podeEditar, handleOpenScheduleModal, cartao }: ListaPorDiaProps) {
  const ativos = reatores.filter(r => r.ativo);
  return (
    <div className={`md:hidden w-full flex flex-col gap-3 ${podeEditar ? "" : "pointer-events-none"}`}>
      {weekDays.map(day => {
        const isToday = day.dateStr === formatDateStr(new Date());
        const kgDia = ativos.reduce((s, r) => s + (matrixItemsMap[`${r.id}_${day.dateStr}`] || []).reduce((a, i) => a + (Number(i.quantidade_planejada) || 0), 0), 0);
        const livres = ativos.filter(r => (matrixItemsMap[`${r.id}_${day.dateStr}`] || []).length === 0);
        return (
          <section key={day.dateStr} className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden">
            <header className={`px-3 py-2.5 flex items-center justify-between gap-2 text-xs font-bold ${
              day.holiday ? 'bg-amber-50 text-amber-700 border-b border-amber-200' : isToday ? 'bg-zinc-100 text-zinc-900 border-b-2 border-zinc-900' : 'bg-zinc-50 text-zinc-900 border-b border-zinc-200'
            }`}>
              <span>{day.label} ({day.dayNumber}){isToday ? ' · hoje' : ''}</span>
              {day.holiday ? (
                <span className="text-[11px] font-normal truncate" title={day.holiday.name}>Feriado: {day.holiday.name}</span>
              ) : (
                <span className="font-mono font-semibold text-zinc-600">{kgDia > 0 ? `${kgDia.toLocaleString('pt-BR')} kg` : 'sem ordens'}</span>
              )}
            </header>
            {!day.holiday && (
              <div className="divide-y divide-zinc-200">
                {ativos.map(reator => {
                  const cellItems = matrixItemsMap[`${reator.id}_${day.dateStr}`] || [];
                  if (cellItems.length === 0) return null;
                  const info = infoDoReator(reator);
                  const Icone = info.Icone;
                  return (
                    <div key={reator.id} className="p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Icone size={14} className="text-zinc-500 shrink-0" />
                        <span className="font-bold text-zinc-900 text-xs break-words min-w-0" title={reator.nome}>{reator.nome}</span>
                        {info.tipo !== 'bombona' && <span className="text-[11px] text-zinc-500 shrink-0">{reator.capacidade_kg} kg</span>}
                      </div>
                      {groupCellItems(cellItems).map(batch => <CartaoOrdem key={batch.key} batch={batch} {...cartao} />)}
                    </div>
                  );
                })}
                {podeEditar && livres.length > 0 && (
                  <div className="p-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-zinc-500">Agendar em:</span>
                    {livres.map(reator => (
                      <button
                        key={reator.id}
                        type="button"
                        onClick={() => handleOpenScheduleModal(null, day.dateStr, reator.id)}
                        className="min-h-11 px-3 flex items-center gap-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 text-xs font-medium cursor-pointer"
                      >
                        <Plus size={14} />
                        {getShortReatorName(reator.id, undefined, reatores)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
