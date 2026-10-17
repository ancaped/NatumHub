import React, { useState, useMemo } from 'react';
import { Report, Product, TemplateConfig } from '../../../geral/lib/types';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Search,
  Printer,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Ban,
  Sparkles,
  Info,
  Clock,
  Layers,
} from 'lucide-react';
import {
  getBrazilHolidaysForYear,
  getHoliday,
  isWeekend,
  validateProductionDate,
  HolidayInfo,
} from '../../../geral/lib/brazilHolidays';
import { printMicrobioReports } from './ReportTemplate';

interface CalendarTabProps {
  reports: Report[];
  products: Product[];
  templateConfig?: TemplateConfig;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const DAILY_LIMIT = 15;

function parseReportDateToIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      // DD/MM/YYYY
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return null;
}

export function CalendarTab({ reports, products, templateConfig }: CalendarTabProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [selectedDateIso, setSelectedDateIso] = useState<string>(
    `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`,
  );
  const [loteSearch, setLoteSearch] = useState<string>('');

  // Map of reports grouped by ISO date: "YYYY-MM-DD" -> Report[]
  const reportsByDate = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const rep of reports) {
      const iso = parseReportDateToIso(rep.collectionDate);
      if (iso) {
        const list = map.get(iso) || [];
        list.push(rep);
        map.set(iso, list);
      }
    }
    return map;
  }, [reports]);

  // Search by batch/lote
  const searchResults = useMemo(() => {
    const trimmed = loteSearch.trim().toLowerCase();
    if (!trimmed) return [];
    return reports.filter((r) => (r.batch || '').toLowerCase().includes(trimmed));
  }, [reports, loteSearch]);

  const searchMatchingDates = useMemo(() => {
    const set = new Set<string>();
    for (const r of searchResults) {
      const iso = parseReportDateToIso(r.collectionDate);
      if (iso) set.add(iso);
    }
    return set;
  }, [searchResults]);

  // Navigate months
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

  const handleSelectLoteResult = (report: Report) => {
    const iso = parseReportDateToIso(report.collectionDate);
    if (iso) {
      const [y, m, d] = iso.split('-').map(Number);
      setCurrentYear(y);
      setCurrentMonth(m - 1);
      setSelectedDateIso(iso);
    }
  };

  // Calendar matrix calculation
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Dom
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const days: {
      dateIso: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isWeekend: boolean;
      holiday: HolidayInfo | null;
      reports: Report[];
      count: number;
      isAtLimit: boolean;
    }[] = [];

    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // Days from previous month
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateIso = `${prevYear}-${pad(prevMonth + 1)}-${pad(dayNum)}`;
      const holiday = getHoliday(dateIso);
      const weekend = isWeekend(dateIso);
      const reps = reportsByDate.get(dateIso) || [];
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: weekend,
        holiday,
        reports: reps,
        count: reps.length,
        isAtLimit: reps.length >= DAILY_LIMIT,
      });
    }

    // Days of current month
    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const dateIso = `${currentYear}-${pad(currentMonth + 1)}-${pad(dayNum)}`;
      const holiday = getHoliday(dateIso);
      const weekend = isWeekend(dateIso);
      const reps = reportsByDate.get(dateIso) || [];
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: true,
        isToday: dateIso === todayIso,
        isWeekend: weekend,
        holiday,
        reports: reps,
        count: reps.length,
        isAtLimit: reps.length >= DAILY_LIMIT,
      });
    }

    // Days from next month to complete 35 or 42 grid slots
    const totalSlots = days.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - days.length;
    for (let dayNum = 1; dayNum <= remainingSlots; dayNum++) {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateIso = `${nextYear}-${pad(nextMonth + 1)}-${pad(dayNum)}`;
      const holiday = getHoliday(dateIso);
      const weekend = isWeekend(dateIso);
      const reps = reportsByDate.get(dateIso) || [];
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: weekend,
        holiday,
        reports: reps,
        count: reps.length,
        isAtLimit: reps.length >= DAILY_LIMIT,
      });
    }

    return days;
  }, [currentYear, currentMonth, reportsByDate, today]);

  // Selected date information
  const selectedDayInfo = useMemo(() => {
    if (!selectedDateIso) return null;
    const reps = reportsByDate.get(selectedDateIso) || [];
    const validation = validateProductionDate(selectedDateIso);
    const [y, m, d] = selectedDateIso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeekName = [
      'Domingo',
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
    ][dateObj.getDay()];

    const formattedDateBR = `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;

    return {
      dateIso: selectedDateIso,
      formattedDateBR,
      dayOfWeekName,
      reports: reps,
      count: reps.length,
      remaining: Math.max(0, DAILY_LIMIT - reps.length),
      isAtLimit: reps.length >= DAILY_LIMIT,
      validation,
    };
  }, [selectedDateIso, reportsByDate]);

  // Month Statistics
  const monthStats = useMemo(() => {
    let totalReports = 0;
    let daysWithReports = 0;
    let daysAtLimit = 0;

    const pad = (n: number) => n.toString().padStart(2, '0');
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let d = 1; d <= lastDayOfMonth; d++) {
      const iso = `${currentYear}-${pad(currentMonth + 1)}-${pad(d)}`;
      const reps = reportsByDate.get(iso) || [];
      if (reps.length > 0) {
        totalReports += reps.length;
        daysWithReports++;
        if (reps.length >= DAILY_LIMIT) {
          daysAtLimit++;
        }
      }
    }

    const holidaysInMonth = getBrazilHolidaysForYear(currentYear).filter((h) => {
      const [hy, hm] = h.date.split('-').map(Number);
      return hy === currentYear && hm === currentMonth + 1;
    });

    return {
      totalReports,
      daysWithReports,
      daysAtLimit,
      holidaysInMonth,
    };
  }, [currentYear, currentMonth, reportsByDate]);

  const handlePrintDayReports = () => {
    if (selectedDayInfo && selectedDayInfo.reports.length > 0) {
      printMicrobioReports(selectedDayInfo.reports, products, templateConfig);
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      {/* Header & Controls */}
      <div className="view-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="view-title flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-zinc-900" />
            Calendário de Produção & Laudos
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Limite diário de 15 lotes/laudos por dia. Fins de semana e feriados nacionais bloqueados.
          </p>
        </div>

        {/* Lote Search Input */}
        <div className="w-full md:w-80 relative">
          <div className="search-input-wrapper w-full">
            <Search size={16} />
            <input
              type="text"
              placeholder="Pesquisar nº do lote..."
              value={loteSearch}
              onChange={(e) => setLoteSearch(e.target.value)}
              className="search-input text-xs"
            />
            {loteSearch && (
              <button
                onClick={() => setLoteSearch('')}
                className="text-xs text-zinc-400 hover:text-zinc-700 px-2 cursor-pointer font-bold"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Search Results Drawer if user is searching */}
      {loteSearch.trim() && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-zinc-900" />
              Resultados da busca por lote: "{loteSearch}" ({searchResults.length})
            </div>
            <span className="text-[10px] text-zinc-500">Clique no item para focar no calendário</span>
          </div>

          {searchResults.length === 0 ? (
            <div className="text-xs text-zinc-500 py-2 italic">
              Nenhum laudo encontrado com o lote "{loteSearch}".
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-52 overflow-y-auto">
              {searchResults.slice(0, 12).map((rep) => (
                <button
                  key={rep.id || rep.reportId}
                  onClick={() => handleSelectLoteResult(rep)}
                  className="p-2.5 bg-white border border-zinc-200 hover:border-zinc-800 rounded-lg text-left transition-all hover:shadow-xs cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-xs text-zinc-900 group-hover:text-zinc-950">
                      Lote {rep.batch}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded">
                      {rep.collectionDate}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-600 truncate font-medium" title={rep.productName}>
                    {rep.productName}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-1">
                    Laudo Nº {rep.reportId} · {rep.productCode}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Month Navigation Toolbar & Summary Cards */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white p-3.5 border border-zinc-200 rounded-xl shadow-xs">
        {/* Month Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-white text-zinc-700 hover:text-zinc-900 rounded-md transition-colors cursor-pointer"
              title="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-white text-zinc-700 hover:text-zinc-900 rounded-md transition-colors cursor-pointer"
              title="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="text-base font-black text-zinc-900 min-w-[180px]">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </div>

          <button
            onClick={handleGoToToday}
            className="text-xs font-bold text-zinc-700 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-zinc-200"
          >
            Hoje
          </button>
        </div>

        {/* Quick Month Metrics */}
        <div className="flex items-center gap-3 overflow-x-auto text-xs">
          <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg shrink-0">
            <Layers className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-zinc-500 font-medium">Laudos no mês:</span>
            <span className="font-bold text-zinc-900">{monthStats.totalReports}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg shrink-0 text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-medium">Dias com lotes:</span>
            <span className="font-bold">{monthStats.daysWithReports}</span>
          </div>

          {monthStats.daysAtLimit > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg shrink-0 text-red-800">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              <span className="font-medium">Limite atingido (15/15):</span>
              <span className="font-bold">{monthStats.daysAtLimit} dia(s)</span>
            </div>
          )}

          {monthStats.holidaysInMonth.length > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg shrink-0 text-amber-800">
              <span className="text-xs">🇧🇷</span>
              <span className="font-medium">Feriados:</span>
              <span className="font-bold">{monthStats.holidaysInMonth.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid + Day Detail Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Calendar Grid (8 cols on lg) */}
        <div className="lg:col-span-8 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs flex flex-col">
          {/* Weekday Header */}
          <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-[11px] font-bold uppercase tracking-wider text-zinc-500 py-2.5">
            {WEEKDAY_NAMES.map((w, idx) => (
              <div key={w} className={idx === 0 || idx === 6 ? 'text-zinc-400' : 'text-zinc-700'}>
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-zinc-200/80 bg-zinc-200/30 flex-1">
            {calendarDays.map((day) => {
              const isSelected = day.dateIso === selectedDateIso;
              const hasSearchedLote = searchMatchingDates.has(day.dateIso);

              return (
                <div
                  key={day.dateIso}
                  onClick={() => setSelectedDateIso(day.dateIso)}
                  className={`min-h-[85px] p-2 flex flex-col justify-between transition-all cursor-pointer select-none relative ${
                    !day.isCurrentMonth
                      ? 'bg-zinc-50/50 text-zinc-400'
                      : day.isWeekend
                      ? 'bg-zinc-50/70 text-zinc-600'
                      : 'bg-white text-zinc-900'
                  } ${
                    isSelected
                      ? 'ring-2 ring-zinc-900 ring-inset bg-zinc-100/60 z-10'
                      : 'hover:bg-zinc-100/50'
                  } ${hasSearchedLote ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/40' : ''}`}
                >
                  {/* Top Bar inside cell: Day number + Badges */}
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={`text-xs font-black inline-flex items-center justify-center h-6 w-6 rounded-full ${
                        day.isToday
                          ? 'bg-zinc-900 text-white shadow-xs'
                          : isSelected
                          ? 'bg-zinc-800 text-white'
                          : ''
                      }`}
                    >
                      {day.dayNum}
                    </span>

                    {/* Holiday tag */}
                    {day.holiday && (
                      <span
                        className="text-[9px] font-bold bg-amber-100 text-amber-900 px-1 py-0.5 rounded border border-amber-200 truncate max-w-[80px]"
                        title={`Feriado: ${day.holiday.name}`}
                      >
                        🇧🇷 {day.holiday.name.split(' ')[0]}
                      </span>
                    )}

                    {/* Weekend tag if no holiday */}
                    {!day.holiday && day.isWeekend && day.isCurrentMonth && (
                      <span className="text-[9px] font-medium text-zinc-400">FDS</span>
                    )}
                  </div>

                  {/* Center/Bottom Content inside cell: Lots badge and counts */}
                  <div className="mt-1 flex flex-col gap-1">
                    {day.count > 0 ? (
                      <div>
                        <div
                          className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border ${
                            day.isAtLimit
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : day.count >= 11
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          <span>{day.count}/15</span>
                          <span className="text-[8px] font-medium opacity-80">
                            {day.count === 1 ? 'laudo' : 'laudos'}
                          </span>
                        </div>

                        {/* Preview of first product */}
                        <div
                          className="text-[9px] text-zinc-500 truncate mt-0.5 hidden sm:block"
                          title={day.reports[0]?.productName}
                        >
                          {day.reports[0]?.batch} · {day.reports[0]?.productName}
                        </div>
                      </div>
                    ) : (
                      day.isCurrentMonth &&
                      !day.isWeekend &&
                      !day.holiday && (
                        <span className="text-[9px] text-zinc-300 italic font-medium">Livre</span>
                      )
                    )}

                    {/* Highlight indicator if matched by lote search */}
                    {hasSearchedLote && (
                      <div className="text-[9px] font-bold text-blue-700 flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" /> Lote encontrado
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Calendar Legend */}
          <div className="p-3 border-t border-zinc-200 bg-zinc-50/50 flex flex-wrap items-center gap-4 text-[11px] text-zinc-600">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>Dia com lotes (&lt; 15)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span>Limite diário atingido (15/15)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span>Feriado Nacional (Bloqueado)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
              <span>Fim de Semana (Bloqueado)</span>
            </div>
          </div>
        </div>

        {/* Selected Day Details Panel (4 cols on lg) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col min-h-[420px]">
            {selectedDayInfo ? (
              <>
                {/* Header of selected day */}
                <div className="border-b border-zinc-100 pb-3 mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      {selectedDayInfo.dayOfWeekName}
                    </span>
                    <span className="font-mono text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md">
                      {selectedDayInfo.formattedDateBR}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-zinc-900">
                    Detalhes da Produção
                  </h3>
                </div>

                {/* Day Validation / Status Banner */}
                {selectedDayInfo.validation.isWeekend && (
                  <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-lg flex items-start gap-2 mb-3">
                    <Ban className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-zinc-800">Fim de Semana</div>
                      <div className="text-[11px] text-zinc-500">
                        {selectedDayInfo.validation.reason}
                      </div>
                    </div>
                  </div>
                )}

                {selectedDayInfo.validation.holiday && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2 mb-3">
                    <span className="text-sm shrink-0">🇧🇷</span>
                    <div>
                      <div className="text-xs font-bold text-amber-900">
                        Feriado Nacional: {selectedDayInfo.validation.holiday.name}
                      </div>
                      <div className="text-[11px] text-amber-700">
                        A geração de novos laudos é bloqueada em feriados.
                      </div>
                    </div>
                  </div>
                )}

                {/* Capacity Counter Card */}
                {!selectedDayInfo.validation.isBlocked && (
                  <div
                    className={`p-3.5 rounded-xl border mb-3 flex items-center justify-between ${
                      selectedDayInfo.isAtLimit
                        ? 'bg-red-50 border-red-200 text-red-900'
                        : selectedDayInfo.count >= 11
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                        {selectedDayInfo.isAtLimit ? (
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        )}
                        Capacidade Diária
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        {selectedDayInfo.isAtLimit
                          ? 'Limite máximo de 15 lotes atingido.'
                          : `Restam ${selectedDayInfo.remaining} vaga(s) para novos laudos.`}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-lg font-black">{selectedDayInfo.count}</span>
                      <span className="text-xs font-bold opacity-75"> / 15</span>
                    </div>
                  </div>
                )}

                {/* Reports List for Selected Day */}
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                      Laudos do Dia ({selectedDayInfo.reports.length})
                    </span>

                    {selectedDayInfo.reports.length > 0 && (
                      <button
                        onClick={handlePrintDayReports}
                        className="text-xs bg-zinc-900 text-white px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Imprimir todos os laudos desta data"
                      >
                        <Printer className="h-3.5 w-3.5" /> Imprimir Todos
                      </button>
                    )}
                  </div>

                  {selectedDayInfo.reports.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-400 bg-zinc-50 rounded-lg border border-dashed border-zinc-200">
                      <Clock className="h-8 w-8 mb-2 opacity-40" />
                      <p className="text-xs font-medium">Nenhum laudo gerado nesta data.</p>
                      {!selectedDayInfo.validation.isBlocked && (
                        <p className="text-[10px] text-zinc-400 mt-1">
                          Você pode gerar até 15 lotes na aba "Gerar Lote".
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto max-h-[320px] space-y-2 pr-1">
                      {selectedDayInfo.reports.map((rep, idx) => (
                        <div
                          key={rep.id || idx}
                          className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between gap-2 hover:border-zinc-400 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono text-xs font-bold text-zinc-900">
                                Lote {rep.batch}
                              </span>
                              <span className="text-[10px] font-bold text-zinc-500">
                                Nº {rep.reportId}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-700 truncate font-medium" title={rep.productName}>
                              {rep.productName}
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-2">
                              <span>Cód: {rep.productCode}</span>
                              <span>•</span>
                              <span>Resp: {rep.technician || '---'}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => printMicrobioReports([rep], products, templateConfig)}
                            className="p-2 text-zinc-500 hover:text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-md transition-colors cursor-pointer shrink-0"
                            title="Imprimir laudo"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-zinc-400">
                Selecione um dia no calendário
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
