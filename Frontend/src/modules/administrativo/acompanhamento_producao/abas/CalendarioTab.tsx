import React from 'react';
import { ChevronLeft, ChevronRight, Search, X, History } from 'lucide-react';
import { MONTH_NAMES, WEEKDAY_NAMES } from '../lib/constantes';
import { cn } from '../../../geral/lib/utils';
import { loteRowKey, rotuloLote, formatarUnidadesLote } from '../lib/lotes';
import { formatDateShort } from '../lib/datas';
import { isWeekend, HolidayInfo } from '../../../geral/lib/brazilHolidays';
import type { AcompanhamentoLote } from '../lib/tipos';

export interface CalendarioTabProps {
  calendarDays: { dateIso: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean; isWeekend: boolean; holiday: HolidayInfo | null; items: AcompanhamentoLote[]; count: number; totalKg: number; openCount: number; completedCount: number; }[];
  calendarSearch: string;
  calendarStatusFilter: string;
  currentMonth: number;
  currentYear: number;
  getBadgeClass: (status: string | null | undefined) => 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold' | 'bg-amber-50 text-amber-700 border-amber-200 font-semibold' | 'bg-zinc-100 text-zinc-800 border-zinc-300 font-semibold' | 'bg-zinc-100 text-zinc-700 border-zinc-200';
  getErpBadgeClass: (erpCode: string) => 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold' | 'bg-zinc-100 text-zinc-800 border-zinc-300 font-semibold' | 'bg-zinc-50 text-zinc-600 border-zinc-200';
  handleGoToToday: () => void;
  handleNextMonth: () => void;
  handleOpenHistory: (lote: AcompanhamentoLote) => Promise<void>;
  handlePrevMonth: () => void;
  handleSelectStatusChange: (loteNumber: string, newStatus: string) => Promise<void>;
  savingLote: string;
  selectedDateIso: string;
  selectedDayInfo: { dateIso: string; dayFormatted: string; dayOfWeekName: string; holiday: HolidayInfo; isWeekend: boolean; items: AcompanhamentoLote[]; count: number; totalKg: number; totalUnidades: number; openCount: number; completedCount: number; };
  setCalendarSearch: React.Dispatch<React.SetStateAction<string>>;
  setCalendarStatusFilter: React.Dispatch<React.SetStateAction<string>>;
  setSelectedDateIso: React.Dispatch<React.SetStateAction<string>>;
}

export default function CalendarioTab({ calendarDays, calendarSearch, calendarStatusFilter, currentMonth, currentYear, getBadgeClass, getErpBadgeClass, handleGoToToday, handleNextMonth, handleOpenHistory, handlePrevMonth, handleSelectStatusChange, savingLote, selectedDateIso, selectedDayInfo, setCalendarSearch, setCalendarStatusFilter, setSelectedDateIso }: CalendarioTabProps) {
  return (
<div className="space-y-4">
          <div className="space-y-3">
              {/* BARRA SUPERIOR DO MÊS */}
              <div className="bg-white rounded-lg p-3.5 border border-zinc-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Navegação Mês */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 hover:bg-white text-zinc-700 hover:text-zinc-950 rounded-lg transition-all cursor-pointer"
                  title="Mês Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-3 text-xs font-bold text-zinc-900 min-w-[130px] text-center">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 hover:bg-white text-zinc-700 hover:text-zinc-950 rounded-lg transition-all cursor-pointer"
                  title="Próximo Mês"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleGoToToday}
                className="px-3 py-1.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Hoje
              </button>
            </div>

            {/* Filtros de Status no Calendário */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('ABERTO')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'ABERTO'
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                    : "bg-zinc-50 text-zinc-650 border-zinc-200 hover:bg-zinc-100"
                )}
              >
                Em Aberto
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('PESAGEM')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'PESAGEM'
                    ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                    : "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                )}
              >
                Pesagem
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('PRODUCAO')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'PRODUCAO'
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                    : "bg-zinc-50 text-zinc-900 border-zinc-200 hover:bg-zinc-100"
                )}
              >
                Produção
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('ENVASE')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'ENVASE'
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                    : "bg-zinc-50 text-zinc-900 border-zinc-200 hover:bg-zinc-100"
                )}
              >
                Envase
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('ROTULAGEM')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'ROTULAGEM'
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                    : "bg-zinc-50 text-zinc-900 border-zinc-200 hover:bg-zinc-100"
                )}
              >
                Rotulagem
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('EM_ESPERA')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'EM_ESPERA'
                    ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                    : "bg-amber-50 text-amber-950 border-amber-200 hover:bg-amber-100"
                )}
              >
                Em Espera
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('FINALIZADA')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'FINALIZADA'
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                    : "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                )}
              >
                Finalizada
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('TODOS')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'TODOS'
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                    : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                )}
              >
                Todos
              </button>
            </div>

            {/* Busca rápida no calendário */}
            <div className="relative min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Localizar no calendário..."
                value={calendarSearch}
                onChange={(e) => setCalendarSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50 text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              {calendarSearch && (
                <button
                  type="button"
                  onClick={() => setCalendarSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* GRADE DO MÊS */}
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden">
            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-bold text-zinc-500 uppercase tracking-wider text-center py-2">
              {WEEKDAY_NAMES.map((name, i) => (
                <div key={name} className={cn(i === 0 || i === 6 ? "text-zinc-400" : "")}>
                  {name}
                </div>
              ))}
            </div>

            {/* Células do Calendário */}
            <div className="grid grid-cols-7 divide-x divide-y divide-zinc-100">
              {calendarDays.map((cell) => {
                const isSelected = selectedDateIso === cell.dateIso;
                const hasItems = cell.items.length > 0;

                return (
                  <div
                    key={cell.dateIso}
                    onClick={() => {
                      if (hasItems) {
                        setSelectedDateIso(cell.dateIso);
                      }
                    }}
                    className={cn(
                      "min-h-[105px] p-2 flex flex-col justify-between transition-colors select-none",
                      cell.isCurrentMonth ? "bg-white" : "bg-zinc-50/40 text-zinc-400",
                      cell.isWeekend && cell.isCurrentMonth && "bg-zinc-50/30",
                      hasItems && "cursor-pointer hover:bg-zinc-50/80",
                      isSelected && "ring-2 ring-zinc-900 ring-inset bg-zinc-50/90",
                      cell.isToday && !isSelected && "border-2 border-zinc-900/30"
                    )}
                  >
                    {/* Linha do topo */}
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-xs font-bold inline-flex items-center justify-center h-6 w-6 rounded-full",
                        cell.isToday ? "bg-zinc-900 text-white" : cell.isCurrentMonth ? "text-zinc-800" : "text-zinc-400"
                      )}>
                        {cell.dayNum}
                      </span>

                      {hasItems && (
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                            cell.openCount > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                          )}>
                            {cell.items.length} {cell.items.length === 1 ? 'lote' : 'lotes'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Feriado */}
                    {cell.holiday && (
                      <span className="text-[11px] md:text-[9px] font-semibold text-red-600 truncate block mt-0.5" title={cell.holiday.name}>
                        {cell.holiday.name}
                      </span>
                    )}

                    {/* Chips de Lotes no dia */}
                    <div className="space-y-1 mt-1.5 flex-1 overflow-hidden">
                      {cell.items.slice(0, 3).map((item) => {
                        const isEa = item.erpStatus === 'EA';
                        const isFinal = item.customStatus === 'Finalizada';
                        return (
                          <div
                            key={loteRowKey(item)}
                            className={cn(
                              "text-[11px] md:text-[10px] px-1.5 py-0.5 rounded-md truncate font-medium border flex items-center justify-between gap-1",
                              isEa || isFinal
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : getBadgeClass(item.customStatus)
                            )}
                            title={`${item.loteNumber} - ${item.productDescription} • ${item.quantity} un • ${item.quantityKg} kg`}
                          >
                            <span className="truncate">
                              <strong className="font-mono mr-1">{rotuloLote(item.loteNumber)}:</strong>
                              {item.productDescription}
                            </span>
                            <span className="font-mono text-[11px] md:text-[9px] opacity-75 shrink-0">
                              {item.quantityKg}kg
                            </span>
                          </div>
                        );
                      })}
                      {cell.items.length > 3 && (
                        <div className="text-[11px] md:text-[9px] font-bold text-zinc-400 text-center">
                          +{cell.items.length - 3} mais...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PAINEL INFERIOR DE DETALHES DO DIA SELECIONADO */}
          {selectedDayInfo && (
            <div className="bg-white border border-zinc-200 rounded-lg shadow-xs p-5 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div>
                  <h3 className="font-bold text-sm text-zinc-900">
                    Lotes em {selectedDayInfo.dayOfWeekName}, {selectedDayInfo.dayFormatted}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {selectedDayInfo.count} lotes registrados • {Number(selectedDayInfo.totalUnidades).toLocaleString('pt-BR')} un • {Number(selectedDayInfo.totalKg).toLocaleString('pt-BR')} kg total
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDateIso(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl cursor-pointer"
                  title="Fechar detalhes do dia"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tabela dos Lotes do Dia */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 text-[11px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-200">
                      <th className="py-2.5 px-3 w-28">Lote</th>
                      <th className="py-2.5 px-3 min-w-[220px]">Produto / SKU</th>
                      <th className="py-2.5 px-3 text-right w-36">Quantidade / Peso</th>
                      <th className="py-2.5 px-3 w-36 text-center">Status ERP</th>
                      <th className="py-2.5 px-3 w-44">Status Nosso</th>
                      <th className="py-2.5 px-3 w-52">Datas Registradas</th>
                      <th className="py-2.5 px-3 w-16 text-center">Hist.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {selectedDayInfo.items.map((item) => {
                      const isEa = item.erpStatus === 'EA';
                      const isBusy = savingLote === item.loteNumber;

                      return (
                        <tr key={loteRowKey(item)} className="hover:bg-zinc-50/80">
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 select-all">
                            {rotuloLote(item.loteNumber)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-zinc-900">{item.productDescription}</div>
                            <div className="text-[11px] md:text-[10px] font-mono text-zinc-400">SKU: {item.productCode}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                            <div className="font-bold text-zinc-900">{formatarUnidadesLote(item)}</div>
                            <div className="text-[11px] md:text-[10px] text-zinc-500 font-semibold">{Number(item.quantityKg || 0).toLocaleString('pt-BR')} kg</div>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] md:text-[10px] font-semibold border",
                              getErpBadgeClass(item.erpStatus)
                            )}>
                              {isEa ? 'Concluído (EA)' : item.erpStatusLabel}
                            </span>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <select
                              value={item.customStatus || ''}
                              onChange={(e) => handleSelectStatusChange(item.loteNumber, e.target.value)}
                              disabled={isBusy}
                              className={cn(
                                "w-full text-xs font-bold rounded-xl border px-2.5 py-1.5 focus:outline-none transition-all cursor-pointer",
                                getBadgeClass(item.customStatus),
                                isBusy && "opacity-50 cursor-wait"
                              )}
                            >
                              <option value="">Aguardando Definição</option>
                              <optgroup label="Pesagem e Produção">
                                <option value="Pesagem">Pesagem</option>
                                <option value="Produzido">Produzido</option>
                                <option value="Liberado para Envase">Liberado para Envase</option>
                              </optgroup>
                              <optgroup label="Embalagem">
                                <option value="Rotulagem">Rotulagem</option>
                                <option value="Envase">Envase</option>
                                <option value="Finalizada">Finalizada</option>
                              </optgroup>
                              <optgroup label="Paralisado">
                                <option value="Em Espera">⏸️ Em Espera...</option>
                              </optgroup>
                            </select>
                          </td>
                          <td className="py-2 px-3 text-[11px] md:text-[10px] font-medium text-zinc-600 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              {item.dataPesagem && <div>🟡 <strong>Pesagem:</strong> {formatDateShort(item.dataPesagem)}</div>}
                              {item.dataProducao && <div>🔵 <strong>Produzido:</strong> {formatDateShort(item.dataProducao)}</div>}
                              {item.dataLiberadoEnvase && <div>🟢 <strong>Liberado Envase:</strong> {formatDateShort(item.dataLiberadoEnvase)}</div>}
                              {item.dataEnvase && <div>🟣 <strong>Envase:</strong> {formatDateShort(item.dataEnvase)}</div>}
                              {item.dataRotulagem && <div>🔷 <strong>Rotulagem:</strong> {formatDateShort(item.dataRotulagem)}</div>}
                              {item.dataEmEspera && <div>🟠 <strong>Espera:</strong> {formatDateShort(item.dataEmEspera)} ({item.motivoEspera || '—'})</div>}
                              {item.dataFinalizada && <div>🟢 <strong>Finalizada:</strong> {formatDateShort(item.dataFinalizada)}</div>}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(item)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                              title="Ver histórico de alterações"
                            >
                              <History className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        </div>
  );
}
