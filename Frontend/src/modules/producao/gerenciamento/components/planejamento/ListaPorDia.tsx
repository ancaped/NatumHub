import React from 'react';
import { Plus } from 'lucide-react';
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

/** Lista por dia (celular): segunda a sexta, com os reatores e as mesmas ordens da grade. */
export function ListaPorDia({ weekDays, reatores, matrixItemsMap, podeEditar, handleOpenScheduleModal, cartao }: ListaPorDiaProps) {
  return (
    <div className={`md:hidden w-full flex flex-col gap-3 ${podeEditar ? '' : 'pointer-events-none'}`}>
      {weekDays.map(day => {
        const isToday = day.dateStr === formatDateStr(new Date());
        return (
          <section key={day.dateStr} className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden">
            <header className={`px-3 py-2.5 flex items-center justify-between gap-2 text-xs font-bold ${
              day.holiday ? 'bg-amber-50 text-amber-700 border-b border-amber-200' : isToday ? 'bg-zinc-100 text-zinc-900 border-b-2 border-zinc-900' : 'bg-zinc-50 text-zinc-900 border-b border-zinc-200'
            }`}>
              <span>{day.label} ({day.dayNumber}){isToday ? ' · hoje' : ''}</span>
              {day.holiday && (
                <span className="text-[11px] font-normal truncate" title={day.holiday.name}>Feriado: {day.holiday.name}</span>
              )}
            </header>
            {!day.holiday && (
              <div className="divide-y divide-zinc-200">
                {reatores.filter(r => r.ativo).map(reator => {
                  const cellItems = matrixItemsMap[`${reator.id}_${day.dateStr}`] || [];
                  const info = infoDoReator(reator);
                  const Icone = info.Icone;
                  return (
                    <div key={reator.id} className="p-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                          <Icone size={16} className="text-zinc-500 shrink-0" />
                          <span className="font-bold text-zinc-900 text-xs break-words min-w-0" title={reator.nome}>{reator.nome}</span>
                          {info.tipo !== 'bombona' && (
                            <span className="text-[11px] text-zinc-500 shrink-0">{reator.capacidade_kg} kg</span>
                          )}
                          <span className={`px-1.5 rounded font-semibold border text-[11px] shrink-0 ${info.badge}`}>{info.rotulo}</span>
                        </div>
                        {podeEditar && (
                          <button
                            type="button"
                            onClick={() => handleOpenScheduleModal(null, day.dateStr, reator.id)}
                            className="shrink-0 min-h-11 px-3 flex items-center gap-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 text-xs font-medium cursor-pointer"
                          >
                            <Plus size={14} />
                            Agendar
                          </button>
                        )}
                      </div>
                      {groupCellItems(cellItems).map(batch => <CartaoOrdem key={batch.key} batch={batch} cellItems={cellItems} {...cartao} />)}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
