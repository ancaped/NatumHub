import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Printer,
  Package,
  User,
  Barcode,
  Search,
  RotateCcw,
  Tag,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import type { LabelPrintHistoryItem } from '../lib/labelsApi';
import type { LabelTemplate } from '../lib/types';

interface LabelsCalendarTabProps {
  history: LabelPrintHistoryItem[];
  templates: LabelTemplate[];
  onReprint: (item: LabelPrintHistoryItem) => void;
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

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function LabelsCalendarTab({
  history,
  templates,
  onReprint,
}: LabelsCalendarTabProps) {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-11
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  });
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedOperator, setSelectedOperator] = useState('ALL');

  // Format date to ISO YYYY-MM-DD
  const formatToIso = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    } catch {
      return '';
    }
  };

  // Group history items by ISO date
  const historyByDate = useMemo(() => {
    const map = new Map<string, LabelPrintHistoryItem[]>();
    for (const item of history) {
      const iso = formatToIso(item.printed_at);
      if (iso) {
        const list = map.get(iso) || [];
        list.push(item);
        map.set(iso, list);
      }
    }
    return map;
  }, [history]);

  // Unique operators
  const operators = useMemo(() => {
    const set = new Set<string>();
    for (const item of history) {
      if (item.operator_name) set.add(item.operator_name);
    }
    return Array.from(set);
  }, [history]);

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
    const pad = (n: number) => n.toString().padStart(2, '0');
    setSelectedDateIso(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  };

  // Calendar matrix calculation
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun
    const totalDays = lastDay.getDate();

    const days: {
      dateIso: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      items: LabelPrintHistoryItem[];
      totalPrints: number;
      totalCopies: number;
    }[] = [];

    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // Previous month filler
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateIso = `${prevY}-${pad(prevM + 1)}-${pad(dayNum)}`;
      const items = historyByDate.get(dateIso) || [];
      const totalCopies = items.reduce((acc, it) => acc + (it.copies || 1), 0);
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        items,
        totalPrints: items.length,
        totalCopies,
      });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const dateIso = `${currentYear}-${pad(currentMonth + 1)}-${pad(d)}`;
      const items = historyByDate.get(dateIso) || [];
      const totalCopies = items.reduce((acc, it) => acc + (it.copies || 1), 0);
      days.push({
        dateIso,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dateIso === todayIso,
        items,
        totalPrints: items.length,
        totalCopies,
      });
    }

    // Next month filler to complete 35 or 42 grid cells
    const remainingCells = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remainingCells; i++) {
      const nextM = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateIso = `${nextY}-${pad(nextM + 1)}-${pad(i)}`;
      const items = historyByDate.get(dateIso) || [];
      const totalCopies = items.reduce((acc, it) => acc + (it.copies || 1), 0);
      days.push({
        dateIso,
        dayNum: i,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        items,
        totalPrints: items.length,
        totalCopies,
      });
    }

    return days;
  }, [currentYear, currentMonth, historyByDate, today]);

  // Items for the selected date
  const selectedDateItems = useMemo(() => {
    const raw = historyByDate.get(selectedDateIso) || [];
    return raw.filter((item) => {
      const matchSearch =
        !searchFilter.trim() ||
        (item.product_name && item.product_name.toLowerCase().includes(searchFilter.toLowerCase())) ||
        (item.product_code && item.product_code.toLowerCase().includes(searchFilter.toLowerCase())) ||
        (item.lot_number && item.lot_number.toLowerCase().includes(searchFilter.toLowerCase())) ||
        (item.template_name && item.template_name.toLowerCase().includes(searchFilter.toLowerCase()));

      const matchOp =
        selectedOperator === 'ALL' || item.operator_name === selectedOperator;

      return matchSearch && matchOp;
    });
  }, [historyByDate, selectedDateIso, searchFilter, selectedOperator]);

  // Selected date formatted title
  const formattedSelectedDate = useMemo(() => {
    if (!selectedDateIso) return '';
    const [y, m, d] = selectedDateIso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [selectedDateIso]);

  return (
    <div className="space-y-6">
      {/* Calendar Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Month Navigator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-white text-zinc-700 rounded-lg transition-colors cursor-pointer"
              title="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 text-xs font-bold text-zinc-900 min-w-[140px] text-center capitalize">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-white text-zinc-700 rounded-lg transition-colors cursor-pointer"
              title="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoToToday}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
          >
            Hoje
          </button>
        </div>

        {/* Filter & Search */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-60">
            <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar lote ou produto..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-900"
            />
          </div>

          {operators.length > 0 && (
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="px-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-medium text-zinc-800 focus:outline-none focus:border-zinc-900"
            >
              <option value="ALL">Todos os Operadores</option>
              {operators.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Grid Layout: Calendar (Left) & Day Details (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Calendar Grid (8 cols on lg) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-4 flex flex-col justify-between">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2 text-center">
            {WEEKDAYS.map((wd, i) => (
              <span
                key={wd}
                className={`text-[11px] font-bold uppercase tracking-wider py-1 ${
                  i === 0 || i === 6 ? 'text-zinc-400' : 'text-zinc-700'
                }`}
              >
                {wd}
              </span>
            ))}
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((day) => {
              const isSelected = day.dateIso === selectedDateIso;
              const hasPrints = day.totalPrints > 0;

              return (
                <button
                  key={day.dateIso}
                  type="button"
                  onClick={() => setSelectedDateIso(day.dateIso)}
                  className={`min-h-[85px] p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20'
                      : day.isCurrentMonth
                      ? 'bg-white border-zinc-200/80 hover:border-zinc-300 hover:bg-zinc-50/60'
                      : 'bg-zinc-50/50 border-zinc-100 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-bold ${
                        day.isToday
                          ? 'bg-zinc-900 text-white h-5 w-5 rounded-full flex items-center justify-center'
                          : isSelected
                          ? 'text-blue-900 font-black'
                          : day.isCurrentMonth
                          ? 'text-zinc-800'
                          : 'text-zinc-400'
                      }`}
                    >
                      {day.dayNum}
                    </span>

                    {hasPrints && (
                      <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                    )}
                  </div>

                  {/* Day Content Badges */}
                  <div className="space-y-1 mt-1 w-full">
                    {hasPrints ? (
                      <div className="space-y-0.5">
                        <span className="block text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded truncate">
                          🏷️ {day.totalPrints} {day.totalPrints === 1 ? 'lote' : 'lotes'}
                        </span>
                        <span className="block text-[9px] text-zinc-500 font-mono truncate">
                          {day.totalCopies} {day.totalCopies === 1 ? 'etiqueta' : 'etiquetas'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-transparent select-none">-</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Details Panel (4 cols on lg) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-zinc-200/80 shadow-xs p-5 flex flex-col max-h-[620px]">
          <div className="border-b border-zinc-100 pb-3 mb-3 shrink-0">
            <div className="flex items-center gap-2 text-zinc-900">
              <CalendarIcon className="h-4 w-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Lotes do Dia
              </h3>
            </div>
            <p className="text-sm font-black text-zinc-900 capitalize mt-0.5">
              {formattedSelectedDate}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {selectedDateItems.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 space-y-2">
                <Printer className="h-7 w-7 mx-auto text-zinc-300 stroke-[1.5]" />
                <p className="text-xs">Nenhuma impressão registrada nesta data.</p>
              </div>
            ) : (
              selectedDateItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {item.product_code || 'Etiqueta'}
                      </span>
                      <h4 className="text-xs font-bold text-zinc-900 mt-1 line-clamp-1">
                        {item.product_name || item.template_name}
                      </h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => onReprint(item)}
                      className="px-2 py-1 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0 shadow-2xs"
                      title="Reimprimir com os mesmos parâmetros"
                    >
                      <RotateCcw className="h-3 w-3 text-blue-600" />
                      <span>Reimprimir</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-500 pt-1 font-mono">
                    <div>
                      <span>Lote:</span>{' '}
                      <strong className="text-zinc-800">{item.lot_number || 'S/N'}</strong>
                    </div>
                    <div>
                      <span>Qtd:</span>{' '}
                      <strong className="text-zinc-800">{item.copies} un.</strong>
                    </div>
                    <div>
                      <span>Operador:</span>{' '}
                      <strong className="text-zinc-800">{item.operator_name || 'Operador'}</strong>
                    </div>
                    <div>
                      <span>Hora:</span>{' '}
                      <strong className="text-zinc-800">
                        {new Date(item.printed_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
