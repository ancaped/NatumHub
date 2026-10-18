import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  FiscoQuimicaAnalysis,
  FiscoQuimicaPattern,
  FiscoQuimicaAgent,
  Product,
  FiscoTemplateConfig,
  ProcItem,
} from '../../../geral/lib/types';
import { api } from '../../../geral/lib/api';
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
  Clock,
  FileText,
  Tag,
} from 'lucide-react';
import {
  getHoliday,
  isWeekend,
  validateProductionDate,
  HolidayInfo
} from '../../../geral/lib/brazilHolidays';
import { cn } from '../../../geral/lib/utils';
import { checkAnalysisCompliance, printFiscoReports } from '../lib/fiscoUtils';
import { buildFiscoLoteLabel, describeFiscoLoteLabel, type FiscoLoteBulk } from '../lib/fiscoLoteLabel';
import { isProcForaDoRotulo } from '../../proc/ProcView';
import PrintModal from '../../../ferramentas/etiquetas/components/PrintModal';
import type { LabelTemplate } from '../../../ferramentas/etiquetas/lib/types';

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

function parseReportDateToIso(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = String(dateStr).trim().split(' ')[0].split('T')[0];
  const parts = clean.split(/[-/]/);
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
  analyses = [],
  patterns = [],
  products = [],
  agents = [],
  config
}: CalendarTabProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [selectedDateIso, setSelectedDateIso] = useState<string>(
    `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`
  );
  const [loteSearch, setLoteSearch] = useState<string>('');
  const [procMapByCode, setProcMapByCode] = useState<Record<string, ProcItem>>({});
  const [procMapByDesc, setProcMapByDesc] = useState<Record<string, ProcItem>>({});
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelTemplates, setLabelTemplates] = useState<LabelTemplate[]>([]);
  const [labelHistory, setLabelHistory] = useState<{ product_code?: string; product_name?: string; lot_number?: string }>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkById, setBulkById] = useState<Record<string, FiscoLoteBulk | null>>({});
  const loteCache = useRef(new Map<string, FiscoLoteBulk | null>());

  useEffect(() => {
    api.getProcMap().then((res) => {
      if (res?.byCode) setProcMapByCode(res.byCode);
      if (res?.byDescription) setProcMapByDesc(res.byDescription);
    }).catch((err) => console.error('Erro ao carregar PROCs no calendário:', err));
  }, []);

  const normalizeCode = (code?: string | null) => (code ? String(code).replace(/\./g, '').trim().toLowerCase() : '');

  const getProcForAnalysis = useCallback((a?: FiscoQuimicaAnalysis | null): ProcItem | null => {
    if (!a) return null;
    const code = normalizeCode(a.productCode);
    if (code && procMapByCode[code]) return procMapByCode[code];
    const name = (a.productName || '').trim().toLowerCase();
    if (name && procMapByDesc[name]) return procMapByDesc[name];
    return null;
  }, [procMapByCode, procMapByDesc]);

  // Map de padrões O(1)
  const patternMap = useMemo(() => {
    const map = new Map<string, FiscoQuimicaPattern>();
    for (const p of patterns || []) {
      if (p && p.productCode) {
        map.set(normalizeCode(p.productCode), p);
      }
    }
    return map;
  }, [patterns]);

  // Agrupamento de análises por data ISO
  const analysesByDate = useMemo(() => {
    const map = new Map<string, FiscoQuimicaAnalysis[]>();
    for (const a of analyses || []) {
      if (!a) continue;
      const iso = parseReportDateToIso(a.analysisDate);
      if (iso) {
        const list = map.get(iso) || [];
        list.push(a);
        map.set(iso, list);
      }
    }
    return map;
  }, [analyses]);

  // Anos disponíveis para salto rápido
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    set.add(today.getFullYear());
    for (const a of analyses || []) {
      if (!a) continue;
      const iso = parseReportDateToIso(a.analysisDate);
      if (iso) {
        const y = parseInt(iso.substring(0, 4), 10);
        if (!isNaN(y) && y > 2000 && y < 2100) set.add(y);
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [analyses, today]);

  // Busca por lote
  const searchResults = useMemo(() => {
    const trimmed = (loteSearch || '').trim().toLowerCase();
    if (!trimmed) return [];
    return (analyses || []).filter((a) => a && (a.batch || '').toLowerCase().includes(trimmed));
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

    // Completar última semana com dias do próximo mês
    const remainingDays = 42 - days.length;
    for (let dayNum = 1; dayNum <= remainingDays; dayNum++) {
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
    if (!y || !m || !d) return null;
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeekName = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ][dateObj.getDay()] || 'Data';

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

  // Total de laudos no mês exibido
  const totalInCurrentMonth = useMemo(() => {
    return calendarDays
      .filter((d) => d.isCurrentMonth)
      .reduce((sum, d) => sum + d.count, 0);
  }, [calendarDays]);

  const dayKey = selectedDayInfo
    ? `${selectedDayInfo.dateIso}|${selectedDayInfo.analyses.map((item) => item.id).join(',')}`
    : '';

  useEffect(() => {
    const ids = selectedDayInfo?.analyses.map((item) => item.id) ?? [];
    setSelectedIds(new Set(ids));
  }, [dayKey]);

  const selectedAnalyses = selectedDayInfo?.analyses.filter((item) => selectedIds.has(item.id)) ?? [];
  const allDaySelected = !!selectedDayInfo && selectedDayInfo.count > 0 && selectedAnalyses.length === selectedDayInfo.count;

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrintDay = () => {
    if (selectedAnalyses.length === 0) return;
    printFiscoReports(selectedAnalyses, patterns, products, agents, config);
  };

  const loadLoteBulk = useCallback(async (analysis: FiscoQuimicaAnalysis): Promise<FiscoLoteBulk | null> => {
    const batch = String(analysis.batch || '').trim();
    const code = normalizeCode(analysis.productCode);
    const key = `${batch}|${code}`;
    if (!batch) return null;
    if (loteCache.current.has(key)) return loteCache.current.get(key) ?? null;
    try {
      const res = await api.getFiscoErpLotes({ search: batch, limit: 20 });
      const hit = (res.items || []).find((item) =>
        String(item.lote).trim() === batch && (!code || normalizeCode(item.product_code) === code)
      ) || (res.items || []).find((item) => String(item.lote).trim() === batch);
      const info = hit
        ? {
          qtyKg: Number(hit.qty_kg) || 0,
          unidades: Number(hit.unidades) || 0,
          qtdeCx: Number(hit.qtde_cx) || 0,
          date: hit.date_erp || '',
        }
        : null;
      loteCache.current.set(key, info);
      return info;
    } catch (err) {
      console.error('Erro ao buscar volume do lote para a etiqueta:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    const list = selectedDayInfo?.analyses ?? [];
    if (list.length === 0) {
      setBulkById({});
      return;
    }
    let cancel = false;
    (async () => {
      const bulks = await Promise.all(list.map((item) => loadLoteBulk(item)));
      if (cancel) return;
      const next: Record<string, FiscoLoteBulk | null> = {};
      list.forEach((item, index) => {
        next[item.id] = bulks[index];
      });
      setBulkById(next);
    })().catch((err) => console.error('Erro ao buscar o volume do lote:', err));
    return () => {
      cancel = true;
    };
  }, [dayKey, loadLoteBulk, selectedDayInfo]);

  const openLoteLabels = async (list: FiscoQuimicaAnalysis[]) => {
    if (list.length === 0 || labelBusy) return;
    setLabelBusy(true);
    try {
      const bulks = await Promise.all(list.map((item) => loadLoteBulk(item)));
      const templates = list.map((item, index) => {
        const pat = patternMap.get(normalizeCode(item.productCode)) || null;
        return buildFiscoLoteLabel({
          analysis: item,
          pattern: pat,
          procItem: getProcForAnalysis(item),
          approved: checkAnalysisCompliance(item, pat).isCompliant,
          bulk: bulks[index],
        });
      });
      setLabelTemplates(templates);
      const first = list[0];
      setLabelHistory(list.length === 1
        ? { product_code: first.productCode, product_name: first.productName, lot_number: first.batch }
        : { product_name: `Laudos ${selectedDateIso}`, lot_number: selectedDateIso });
      setLabelOpen(true);
    } catch (err) {
      console.error(err);
      alert('Não foi possível montar a etiqueta.');
    } finally {
      setLabelBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Barra de Controle de Navegação do Mês */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Mês, Ano e Botões Anterior / Próximo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-white hover:text-zinc-950 text-zinc-600 rounded-lg transition-colors cursor-pointer"
              title="Mês Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-black text-sm text-zinc-900 px-3 min-w-[130px] text-center">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-white hover:text-zinc-950 text-zinc-600 rounded-lg transition-colors cursor-pointer"
              title="Próximo Mês"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Seletor de Ano Rápido */}
          <select
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-bold text-xs px-3 py-2 rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-900 cursor-pointer"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleGoToToday}
            className="px-3 py-1.5 border border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Hoje
          </button>

          <span className="text-xs text-zinc-400 font-medium ml-1">
            <strong>{totalInCurrentMonth}</strong> laudo(s) no mês
          </span>
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
                  <span className="text-[10px] font-mono text-zinc-400">
                    {(r.analysisDate || '').trim().split(' ')[0].split('T')[0]}
                  </span>
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

          {/* Células de Dias */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const isSelected = day.dateIso === selectedDateIso;
              const hasSearchMatch = searchMatchingDates.has(day.dateIso);

              return (
                <button
                  key={day.dateIso}
                  type="button"
                  onClick={() => setSelectedDateIso(day.dateIso)}
                  className={cn(
                    "min-h-[84px] p-2 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer relative",
                    day.isCurrentMonth ? "bg-white" : "bg-zinc-50/50 opacity-60",
                    day.isWeekend && day.isCurrentMonth && "bg-zinc-50/70",
                    day.holiday && "bg-rose-50/30 border-rose-200",
                    isSelected
                      ? "border-zinc-950 ring-2 ring-zinc-950 shadow-md bg-zinc-50/90 z-10"
                      : "border-zinc-200 hover:border-zinc-400 hover:shadow-xs",
                    day.isToday && !isSelected && "border-amber-400 ring-1 ring-amber-400 bg-amber-50/20",
                    hasSearchMatch && !isSelected && "border-indigo-400 ring-2 ring-indigo-300"
                  )}
                >
                  {/* Topo do dia (Número e Badges) */}
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={cn(
                        "text-xs font-black rounded-md w-5 h-5 flex items-center justify-center",
                        day.isToday
                          ? "bg-amber-400 text-zinc-950 font-black"
                          : isSelected
                          ? "bg-zinc-950 text-white"
                          : day.isCurrentMonth
                          ? "text-zinc-900"
                          : "text-zinc-400"
                      )}
                    >
                      {day.dayNum}
                    </span>

                    {day.holiday && (
                      <span
                        className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1 py-0.2 rounded truncate max-w-[55px]"
                        title={day.holiday.name}
                      >
                        {day.holiday.name}
                      </span>
                    )}
                  </div>

                  {/* Badges de contagem de laudos e PROCs a anotar */}
                  <div className="space-y-1 mt-1">
                    {day.count > 0 && (
                      <div className="flex items-center gap-1 bg-zinc-900 text-white px-1.5 py-0.5 rounded-md text-[10px] font-bold shadow-xs">
                        <Activity className="w-2.5 h-2.5 text-emerald-400" />
                        <span>{day.count} {day.count === 1 ? 'laudo' : 'laudos'}</span>
                      </div>
                    )}
                    {(() => {
                      const foraDoRotuloCount = day.analyses.filter(an => {
                        const p = getProcForAnalysis(an);
                        return p && isProcForaDoRotulo(p);
                      }).length;
                      if (foraDoRotuloCount > 0) {
                        return (
                          <div
                            className="flex items-center gap-1 bg-amber-100 text-amber-950 border border-amber-300 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                            title={`${foraDoRotuloCount} lote(s) requer anotação manual de PROC (não consta no rótulo gráfico)`}
                          >
                            <FileText className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                            <span>{foraDoRotuloCount} Anotar PROC</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legenda do Calendário */}
          <div className="flex items-center gap-4 text-[11px] text-zinc-500 pt-2 border-t border-zinc-100 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-zinc-950" />
              <span>Hoje / Selecionado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-200 border border-rose-300" />
              <span>Feriado Nacional</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-zinc-100 border border-zinc-300" />
              <span>Final de Semana</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-400" />
              <span>Fora do Rótulo (Anotar no Lote)</span>
            </div>
          </div>

        </div>

        {/* Painel Lateral: Laudos e Lotes do Dia Selecionado */}
        <div className="space-y-4">
          
          <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  {selectedDayInfo?.dayOfWeekName || 'Dia'}
                </span>
                <h3 className="text-base font-black text-zinc-900">
                  {selectedDayInfo?.dayFormatted || 'Selecione uma data'}
                </h3>
              </div>
              <span className="px-2.5 py-1 bg-zinc-100 text-zinc-900 rounded-lg text-xs font-black">
                {selectedDayInfo?.count || 0} lote(s)
              </span>
            </div>

            {/* Aviso de feriado ou fim de semana */}
            {selectedDayInfo?.holiday && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{selectedDayInfo.holiday.name}</span>
              </div>
            )}

            {selectedDayInfo && selectedDayInfo.count > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (allDaySelected) setSelectedIds(new Set());
                  else setSelectedIds(new Set(selectedDayInfo.analyses.map((item) => item.id)));
                }}
                className="text-[11px] font-bold text-zinc-600 hover:text-zinc-950 cursor-pointer"
              >
                {allDaySelected ? 'Limpar seleção' : `Selecionar todos (${selectedDayInfo.count})`}
              </button>
            )}

            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {!selectedDayInfo || selectedDayInfo.count === 0 ? (
                <div className="py-12 text-center text-zinc-400 space-y-1">
                  <CalendarIcon className="w-8 h-8 mx-auto text-zinc-300 stroke-1" />
                  <p className="text-xs font-medium">Nenhum laudo registrado nesta data.</p>
                </div>
              ) : (
                selectedDayInfo.analyses.map((a) => {
                  const pat = patternMap.get(normalizeCode(a.productCode)) || null;
                  const procItem = getProcForAnalysis(a);
                  const precisaAnotarProc = procItem && isProcForaDoRotulo(procItem);
                  const fields = describeFiscoLoteLabel({
                    analysis: a,
                    pattern: pat,
                    procItem,
                    approved: checkAnalysisCompliance(a, pat).isCompliant,
                    bulk: bulkById[a.id],
                  });
                  const marked = selectedIds.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleSelected(a.id)}
                      className={cn(
                        'w-full text-left p-3.5 bg-white border rounded-xl shadow-xs space-y-2 transition-all cursor-pointer',
                        marked ? 'border-zinc-900 ring-2 ring-zinc-900' : 'border-zinc-200 hover:border-zinc-300'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                              marked ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-300'
                            )}
                          >
                            {marked ? <CheckCircle2 className="h-3 w-3" /> : null}
                          </span>
                          <span className="font-mono font-black text-sm text-zinc-950 truncate">
                            Lote {fields.batch}
                          </span>
                        </div>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full font-bold text-[9px] border shrink-0',
                          fields.approved
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-900 border-rose-200'
                        )}>
                          {fields.status}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-800 font-bold text-center leading-snug" title={fields.name}>
                        {fields.name}
                      </div>
                      {fields.volume && (
                        <div className="text-[11px] text-zinc-600 text-center">{fields.volume}</div>
                      )}

                      <div className="text-center text-[11px] text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-2 space-y-0.5">
                        <div>Data: <strong>{fields.date || '—'}</strong></div>
                        <div className="font-mono">Cód. {fields.code || '—'}</div>
                        {fields.proc && <div className="font-mono font-bold">{fields.proc}</div>}
                        {fields.envase && <div>{fields.envase}</div>}
                      </div>

                      {precisaAnotarProc && (
                        <div className="text-[10px] font-bold text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 flex items-center justify-center gap-1">
                          <FileText className="w-3 h-3 shrink-0" />
                          PROC: {procItem.proc} (anotar no lote)
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {selectedDayInfo && selectedDayInfo.count > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                disabled={selectedAnalyses.length === 0}
                onClick={handlePrintDay}
                className="w-full flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white py-3 rounded-xl text-xs font-bold transition-all shadow cursor-pointer disabled:opacity-40"
              >
                <Printer className="w-4 h-4" />
                Imprimir laudos ({selectedAnalyses.length})
              </button>
              <button
                type="button"
                disabled={labelBusy || selectedAnalyses.length === 0}
                onClick={() => void openLoteLabels(selectedAnalyses)}
                className="w-full flex items-center justify-center gap-2 bg-white border border-zinc-200 text-zinc-800 hover:bg-zinc-100 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
              >
                <Tag className="w-4 h-4" />
                Imprimir etiquetas ({selectedAnalyses.length})
              </button>
            </div>
          )}

        </div>

      </div>

      {labelOpen && labelTemplates[0] && (
        <PrintModal
          template={labelTemplates[0]}
          batchTemplates={labelTemplates.length > 1 ? labelTemplates : undefined}
          printDpi={300}
          initialFillPercent={96}
          isOpen
          initialCopies={1}
          onClose={() => setLabelOpen(false)}
          history={labelHistory}
        />
      )}

    </div>
  );
}
