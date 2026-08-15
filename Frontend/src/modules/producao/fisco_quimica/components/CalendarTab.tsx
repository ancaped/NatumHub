import React, { useState, useMemo } from 'react';
import {
  FiscoQuimicaAnalysis,
  FiscoQuimicaPattern,
  FiscoQuimicaAgent,
  Product,
  FiscoTemplateConfig
} from '../../../geral/lib/types';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Search,
  Printer,
  CheckCircle2,
  AlertTriangle,
  FlaskConical,
  Activity,
  Layers,
  Sparkles,
  Info,
  Clock
} from 'lucide-react';
import {
  getHoliday,
  isWeekend,
  validateProductionDate,
  HolidayInfo
} from '../../../geral/lib/brazilHolidays';
import { cn } from '../../../geral/lib/utils';
import { checkAnalysisCompliance, printFiscoReports } from '../lib/fiscoUtils';

interface CalendarTabProps {
  analyses: FiscoQuimicaAnalysis[];
  patterns: FiscoQuimicaPattern[];
  products: Product[];
  agents: FiscoQuimicaAgent[];
  config?: FiscoTemplateConfig;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function parseReportDateToIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return null;
}

export function CalendarTab({
  analyses,
  patterns,
  products,
  agents,
  config
}: CalendarTabProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [selectedDateIso, setSelectedDateIso] = useState<string>(
    `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`
  );
  const [loteSearch, setLoteSearch] = useState<string>('');

  const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

  // Agrupamento de análises por data ISO
  const analysesByDate = useMemo(() => {
    const map = new Map<string, FiscoQuimicaAnalysis[]>();
    for (const a of analyses) {
      const iso = parseReportDateToIso(a.analysisDate);
      if (iso) {
        const list = map.get(iso) || [];
        list.push(a);
        map.set(iso, list);
      }
    }
    return map;
  }, [analyses]);

  // Busca por lote
  const searchResults = useMemo(() => {
    const trimmed = loteSearch.trim().toLowerCase();
    if (!trimmed) return [];
    return analyses.filter((a) => (a.batch || '').toLowerCase().includes(trimmed));
  }, [analyses, loteSearch]);

  const searchMatchingDates = useMemo(() => {
    const set = new Set<string>();
    for (const a of searchResults) {
      const iso = parseReportDateToIso(a.analysisDate);
      if (iso) set.add(iso);
    }
    return set;
  }, [searchResults]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleGoToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    const iso = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    setSelectedDateIso(iso);
  };

  const handleSelectLoteResult = (analysis: FiscoQuimicaAnalysis) => {
    const iso = parseReportDateToIso(analysis.analysisDate);
    if (iso) {
      const [y, m] = iso.split('-').map(Number);
      setCurrentYear(y);
      setCurrentMonth(m - 1);
      setSelectedDateIso(iso);
    }
  };

  // Matriz de dias do calendário
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay();
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const days: {
      dateIso: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isWeekend: boolean;
      holiday: HolidayInfo | null;
      analyses: FiscoQuimicaAnalysis[];
      count: number;
    }[] = [];

    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // Dias do mês anterior
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateIso = `${prevYear}-${pad(prevMonth + 1)}-${pad(dayNum)}`;
      const holiday = getHoliday(dateIso);
      const weekend = isWeekend(dateIso);
      const items = analysesByDate.get(dateIso) || [];
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: weekend,
        holiday,
        analyses: items,
        count: items.length,
      });
    }

    // Dias do mês atual
    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const dateIso = `${currentYear}-${pad(currentMonth + 1)}-${pad(dayNum)}`;
      const holiday = getHoliday(dateIso);
      const weekend = isWeekend(dateIso);
      const items = analysesByDate.get(dateIso) || [];
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: true,
        isToday: dateIso === todayIso,
        isWeekend: weekend,
        holiday,
        analyses: items,
        count: items.length,
      });
    }

    // Dias do próximo mês
    const totalSlots = days.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - days.length;
    for (let dayNum = 1; dayNum <= remainingSlots; dayNum++) {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateIso = `${nextYear}-${pad(nextMonth + 1)}-${pad(dayNum)}`;
      const holiday = getHoliday(dateIso);
      const weekend = isWeekend(dateIso);
      const items = analysesByDate.get(dateIso) || [];
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: weekend,
        holiday,
        analyses: items,
        count: items.length,
      });
    }

    return days;
  }, [currentYear, currentMonth, analysesByDate, today]);

  // Informações do dia selecionado
  const selectedDayInfo = useMemo(() => {
    if (!selectedDateIso) return null;
    const items = analysesByDate.get(selectedDateIso) || [];
    const [y, m, d] = selectedDateIso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeekName = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ][dateObj.getDay()];

    const holiday = getHoliday(selectedDateIso);
    const weekend = isWeekend(selectedDateIso);

    return {
      dateIso: selectedDateIso,
      dayFormatted: `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`,
      dayOfWeekName,
      holiday,
      isWeekend: weekend,
      analyses: items,
      count: items.length,
    };
  }, [selectedDateIso, analysesByDate]);

  // Impressão dos laudos do dia
  const handlePrintDay = () => {
    if (!selectedDayInfo || selectedDayInfo.analyses.length === 0) return;
    printFiscoReports(selectedDayInfo.analyses, patterns, products, agents, config);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      
      {/* Barra de Navegação do Mês & Busca */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Seletor do Mês */}
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
            <span className="font-bold text-sm text-zinc-900 px-3 min-w-[150px] text-center select-none">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </span>
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
            className="px-3 py-1.5 border border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Hoje
          </button>
        </div>

        {/* Busca por lote */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Localizar lote no calendário..."
            value={loteSearch}
            onChange={(e) => setLoteSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-zinc-300 rounded-xl text-xs bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />

          {/* Dropdown de resultados de busca */}
          {searchResults.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto divide-y divide-zinc-100 p-1">
              {searchResults.slice(0, 5).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    handleSelectLoteResult(r);
                    setLoteSearch('');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-50 rounded-lg text-xs transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-zinc-900 block">Lote: {r.batch}</span>
                    <span className="text-[10px] text-zinc-500 truncate block max-w-[200px]">{r.productName}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">{r.analysisDate}</span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Grade do Calendário e Painel Lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Calendário Mensal (2 colunas no desktop) */}
        <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-sm lg:col-span-2 space-y-4">
          
          {/* Cabeçalho dos Dias da Semana */}
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            {WEEKDAY_NAMES.map((name, i) => (
              <div key={name} className={cn(i === 0 || i === 6 ? "text-zinc-400" : "text-zinc-600")}>
                {name}
              </div>
            ))}
          </div>

          {/* Grid dos Dias */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const isSelected = day.dateIso === selectedDateIso;
              const hasMatchingSearch = searchMatchingDates.has(day.dateIso);

              return (
                <button
                  key={day.dateIso}
                  type="button"
                  onClick={() => setSelectedDateIso(day.dateIso)}
                  className={cn(
                    "min-h-[85px] p-2 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer group",
                    !day.isCurrentMonth && "opacity-35 bg-zinc-50/50 border-zinc-150",
                    day.isCurrentMonth && "bg-white border-zinc-200 hover:border-zinc-400 hover:shadow-xs",
                    day.isToday && "ring-2 ring-zinc-950 ring-offset-1",
                    isSelected && "border-zinc-950 bg-zinc-900 text-white shadow-sm hover:border-zinc-950",
                    hasMatchingSearch && !isSelected && "ring-2 ring-amber-500 bg-amber-50/50"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={cn(
                      "text-xs font-black",
                      isSelected ? "text-white" : (day.isCurrentMonth ? "text-zinc-900" : "text-zinc-400"),
                      day.isToday && !isSelected && "text-zinc-950 underline"
                    )}>
                      {day.dayNum}
                    </span>

                    {day.holiday && (
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          isSelected ? "bg-amber-400" : "bg-amber-500"
                        )}
                        title={day.holiday.name}
                      />
                    )}
                  </div>

                  {/* Badge com contagem de laudos físico-químicos */}
                  {day.count > 0 && (
                    <div className="mt-auto pt-1 flex items-center gap-1">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 tracking-tight",
                        isSelected
                          ? "bg-white text-zinc-950"
                          : "bg-zinc-100 text-zinc-900 border border-zinc-200 group-hover:bg-zinc-200"
                      )}>
                        <FlaskConical className="w-3 h-3" />
                        {day.count} {day.count === 1 ? 'laudo' : 'laudos'}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

        </div>

        {/* Painel Lateral do Dia Selecionado */}
        <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm space-y-5 flex flex-col justify-between">
          
          <div className="space-y-4">
            <div className="border-b border-zinc-200 pb-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                {selectedDayInfo?.dayOfWeekName}
              </span>
              <h3 className="text-xl font-black text-zinc-900">
                {selectedDayInfo?.dayFormatted}
              </h3>

              {selectedDayInfo?.holiday && (
                <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="font-bold">{selectedDayInfo.holiday.name}</span>
                </div>
              )}
            </div>

            {/* Resumo do dia */}
            <div className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
              <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Laudos Registrados</span>
              <span className="text-lg font-black text-zinc-900">{selectedDayInfo?.count || 0}</span>
            </div>

            {/* Lista de laudos do dia */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {!selectedDayInfo || selectedDayInfo.analyses.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-xs">
                  Nenhuma análise registrada nesta data.
                </div>
              ) : (
                selectedDayInfo.analyses.map((a) => {
                  const pat = patterns.find((p) => normalizeCode(p.productCode) === normalizeCode(a.productCode)) || null;
                  const compliance = checkAnalysisCompliance(a, pat);

                  return (
                    <div
                      key={a.id}
                      className="p-3.5 rounded-xl border border-zinc-200 hover:border-zinc-300 transition-all bg-white space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-zinc-900">Lote {a.batch}</span>
                        {compliance.overallStatus === 'CONFORME' ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-bold text-[9px]">
                            Conforme
                          </span>
                        ) : a.hasAdjustment ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-full font-bold text-[9px]">
                            Ajustado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-900 border border-rose-200 rounded-full font-bold text-[9px]">
                            Fora Padrão
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-zinc-700 font-medium truncate" title={a.productName}>
                        {a.productName}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono bg-zinc-50 p-2 rounded-lg text-zinc-700">
                        <div>pH: <strong>{a.phMeasured.toFixed(2)}</strong></div>
                        <div>Visc: <strong>{a.viscosityMeasured.toLocaleString('pt-BR')}</strong></div>
                        <div>Dens: <strong>{a.densityMeasured.toFixed(3)}</strong></div>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-500">
                        <span>Envase: <strong>{a.envaseTargetWeight} {a.envaseTargetUnit}</strong></span>
                        <button
                          type="button"
                          onClick={() => printFiscoReports(a, patterns, products, agents, config)}
                          className="flex items-center gap-1 text-zinc-700 hover:text-zinc-950 font-bold cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" /> Imprimir
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Botão de imprimir todos os laudos do dia */}
          {selectedDayInfo && selectedDayInfo.count > 0 && (
            <button
              type="button"
              onClick={handlePrintDay}
              className="w-full flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white py-3 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir Laudos do Dia ({selectedDayInfo.count})
            </button>
          )}

        </div>

      </div>

    </div>
  );
}
