import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Search,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  ClipboardList,
  Package,
  User,
  Eye,
  RefreshCw,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  getHoliday,
  isWeekend,
  HolidayInfo
} from '../../../geral/lib/brazilHolidays';
import { cn } from '../../../geral/lib/utils';

export interface LoteItem {
  id: string;
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  date: string;
  status: string;
  fabricatedBy: string;
  authorizedBy: string;
  yieldError?: boolean;
  pesagemError?: boolean;
  envaseError?: boolean;
  conferenciaError?: boolean;
  isResolved?: boolean;
  resolution_obs?: string;
  snapEstoque?: number;
  snapProducao?: number;
  snapPedidos?: number;
  snapEfp?: number;
  snapMediaVendas?: number;
  snapDuracaoMeses?: number;
  snapStatus?: string;
  snapStatusLabel?: string;
  snapProducaoRecomendada?: number;
  snapEstoqueIdealQtd?: number;
  snapDemandaAjustada?: number;
  observacoes?: string;
  [key: string]: any;
}

interface LotesCalendarTabProps {
  lotes: LoteItem[];
  onOpenDetails?: (loteNumber: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function parseLoteDateToIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim().split(' ')[0].split('T')[0];
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

export function getLoteStage(l: { status?: string; customStatus?: string | null }): string {
  if (l.customStatus) {
    const cs = l.customStatus.toLowerCase();
    if (cs.includes('pesagem')) return 'PG';
    if (cs.includes('produç') || cs.includes('produc')) return 'PR';
    if (cs.includes('envase')) return 'EN';
    if (cs.includes('rotulagem') || cs.includes('confer')) return 'CF';
    if (cs.includes('finaliz')) return 'EA';
    if (cs.includes('espera')) return 'ES';
  }
  return (l.status || '').toUpperCase();
}

const getStatusBadgeClass = (status: string, customStatus?: string | null) => {
  const st = getLoteStage({ status, customStatus });
  switch (st) {
    case 'EA': return 'saudavel';
    case 'CF': return 'abundante';
    case 'PG':
    case 'PP':
    case 'PR':
    case 'EN': return 'ordem';
    case 'ES':
    case 'CA': return 'critico';
    case 'FP': return 'saudavel';
    default: return 'abundante';
  }
};

const getStatusLabel = (status: string, customStatus?: string | null) => {
  if (customStatus) return customStatus;
  switch ((status || '').toUpperCase()) {
    case 'EA': return 'Estoque Atualizado';
    case 'PG': return 'Em Pesagem';
    case 'PP': return 'Pré-Produção';
    case 'PR': return 'Em Produção';
    case 'EN': return 'Em Envase';
    case 'CF': return 'Conferido';
    case 'CA': return 'Cancelado';
    case 'FP': return 'Finalizado';
    case 'ES': return 'Em Espera';
    default: return status || 'N/A';
  }
};

export function LotesCalendarTab({
  lotes,
  onOpenDetails,
  onRefresh,
  loading = false,
}: LotesCalendarTabProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [selectedDateIso, setSelectedDateIso] = useState<string>(
    `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`
  );
  const [loteSearch, setLoteSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PG' | 'PP_PR' | 'EN' | 'CF' | 'ERRORS'>('ALL');

  // Métricas de ordens ativas por etapa (Pesagem, Produção, Envase, Conferência)
  const statusMetrics = useMemo(() => {
    let pesagem = 0;
    let preProducao = 0;
    let producao = 0;
    let envase = 0;
    let conferencia = 0;
    let erros = 0;

    for (const l of lotes) {
      const st = getLoteStage(l);
      if (st === 'PG') pesagem++;
      else if (st === 'PP') preProducao++;
      else if (st === 'PR') producao++;
      else if (st === 'EN') envase++;
      else if (st === 'CF') conferencia++;

      const iso = parseLoteDateToIso(l.date);
      const is2026Onwards = iso ? parseInt(iso.substring(0, 4), 10) >= 2026 : false;

      if (!l.isResolved && (l.yieldError || l.pesagemError || l.envaseError || l.conferenciaError)) {
        if (is2026Onwards) {
          erros++;
        }
      }
    }

    const totalAbertas = pesagem + preProducao + producao + envase + conferencia;

    return {
      pesagem,
      preProducao,
      producao,
      prodTotal: preProducao + producao,
      envase,
      conferencia,
      erros,
      totalAbertas,
    };
  }, [lotes]);

  // Agrupamento de lotes por data ISO ("YYYY-MM-DD")
  const lotesByDate = useMemo(() => {
    const map = new Map<string, LoteItem[]>();
    for (const l of lotes) {
      const iso = parseLoteDateToIso(l.date);
      if (iso) {
        const list = map.get(iso) || [];
        list.push(l);
        map.set(iso, list);
      }
    }
    return map;
  }, [lotes]);

  // Busca rápida por lote / produto / operador
  const searchResults = useMemo(() => {
    const trimmed = loteSearch.trim().toLowerCase();
    if (!trimmed) return [];
    return lotes.filter(
      (l) =>
        (l.loteNumber || '').toLowerCase().includes(trimmed) ||
        (l.productCode || '').toLowerCase().includes(trimmed) ||
        (l.productDescription || '').toLowerCase().includes(trimmed) ||
        (l.fabricatedBy || '').toLowerCase().includes(trimmed)
    );
  }, [lotes, loteSearch]);

  const searchMatchingDates = useMemo(() => {
    const set = new Set<string>();
    for (const l of lotes) {
      let matchSearch = true;
      if (loteSearch.trim()) {
        const trimmed = loteSearch.trim().toLowerCase();
        matchSearch =
          (l.loteNumber || '').toLowerCase().includes(trimmed) ||
          (l.productCode || '').toLowerCase().includes(trimmed) ||
          (l.productDescription || '').toLowerCase().includes(trimmed) ||
          (l.fabricatedBy || '').toLowerCase().includes(trimmed);
      }

      let matchStatus = true;
      const st = (l.status || '').toUpperCase();
      if (statusFilter === 'PG') matchStatus = st === 'PG';
      else if (statusFilter === 'PP_PR') matchStatus = st === 'PP' || st === 'PR';
      else if (statusFilter === 'EN') matchStatus = st === 'EN';
      else if (statusFilter === 'CF') matchStatus = st === 'CF';
      else if (statusFilter === 'ERRORS') {
        const iso = parseLoteDateToIso(l.date);
        const is2026Onwards = iso ? parseInt(iso.substring(0, 4), 10) >= 2026 : false;
        matchStatus = !l.isResolved && !!(l.yieldError || l.pesagemError || l.envaseError || l.conferenciaError) && is2026Onwards;
      }

      if (matchSearch && matchStatus && (loteSearch.trim() || statusFilter !== 'ALL')) {
        const iso = parseLoteDateToIso(l.date);
        if (iso) set.add(iso);
      }
    }
    return set;
  }, [lotes, loteSearch, statusFilter]);

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

  const handleSelectLoteResult = (lote: LoteItem) => {
    const iso = parseLoteDateToIso(lote.date);
    if (iso) {
      const [y, m] = iso.split('-').map(Number);
      setCurrentYear(y);
      setCurrentMonth(m - 1);
      setSelectedDateIso(iso);
    }
  };

  // Matriz de dias do calendário (35 ou 42 células)
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
      lotes: LoteItem[];
      count: number;
      totalKg: number;
      hasError: boolean;
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
      const items = lotesByDate.get(dateIso) || [];
      const totalKg = items.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
      const hasError = items.some(
        (x) =>
          !x.isResolved &&
          (x.yieldError || x.pesagemError || x.envaseError || x.conferenciaError)
      );

      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: weekend,
        holiday,
        lotes: items,
        count: items.length,
        totalKg,
        hasError,
      });
    }

    // Dias do mês atual
    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const dateIso = `${currentYear}-${pad(currentMonth + 1)}-${pad(dayNum)}`;
      const holiday = getHoliday(dateIso);
      const weekend = isWeekend(dateIso);
      const items = lotesByDate.get(dateIso) || [];
      const totalKg = items.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
      const hasError = items.some(
        (x) =>
          !x.isResolved &&
          (x.yieldError || x.pesagemError || x.envaseError || x.conferenciaError)
      );

      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: true,
        isToday: dateIso === todayIso,
        isWeekend: weekend,
        holiday,
        lotes: items,
        count: items.length,
        totalKg,
        hasError,
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
      const items = lotesByDate.get(dateIso) || [];
      const totalKg = items.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
      const hasError = items.some(
        (x) =>
          !x.isResolved &&
          (x.yieldError || x.pesagemError || x.envaseError || x.conferenciaError)
      );

      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: weekend,
        holiday,
        lotes: items,
        count: items.length,
        totalKg,
        hasError,
      });
    }

    return days;
  }, [currentYear, currentMonth, lotesByDate, today]);

  // Informações do dia selecionado
  const selectedDayInfo = useMemo(() => {
    if (!selectedDateIso) return null;
    const items = lotesByDate.get(selectedDateIso) || [];
    const [y, m, d] = selectedDateIso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeekName = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ][dateObj.getDay()];

    const holiday = getHoliday(selectedDateIso);
    const weekend = isWeekend(selectedDateIso);
    const totalKg = items.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
    const inProgressCount = items.filter((x) =>
      ['PG', 'PP', 'PR', 'EN', 'CF'].includes((x.status || '').toUpperCase())
    ).length;
    const completedCount = items.filter((x) =>
      ['EA', 'FP'].includes((x.status || '').toUpperCase())
    ).length;
    const errorCount = items.filter(
      (x) =>
        !x.isResolved &&
        (x.yieldError || x.pesagemError || x.envaseError || x.conferenciaError)
    ).length;

    return {
      dateIso: selectedDateIso,
      dayFormatted: `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`,
      dayOfWeekName,
      holiday,
      isWeekend: weekend,
      lotes: items,
      count: items.length,
      totalKg,
      inProgressCount,
      completedCount,
      errorCount,
    };
  }, [selectedDateIso, lotesByDate]);

  const displayedDayLotes = useMemo(() => {
    if (!selectedDayInfo) return [];
    if (statusFilter === 'ALL') return selectedDayInfo.lotes;
    return selectedDayInfo.lotes.filter((l) => {
      const st = getLoteStage(l);
      if (statusFilter === 'PG') return st === 'PG';
      if (statusFilter === 'PP_PR') return st === 'PP' || st === 'PR';
      if (statusFilter === 'EN') return st === 'EN';
      if (statusFilter === 'CF') return st === 'CF';
      if (statusFilter === 'ERRORS') {
        const iso = parseLoteDateToIso(l.date);
        const is2026Onwards = iso ? parseInt(iso.substring(0, 4), 10) >= 2026 : false;
        return !l.isResolved && !!(l.yieldError || l.pesagemError || l.envaseError || l.conferenciaError) && is2026Onwards;
      }
      return true;
    });
  }, [selectedDayInfo, statusFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Barra Superior: Navegação Mês & Busca Rápida */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Seletor de Mês */}
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

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-600 rounded-xl transition-colors cursor-pointer"
              title="Atualizar lotes"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>

        {/* Busca por lote */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Localizar lote, REF ou operador no calendário..."
            value={loteSearch}
            onChange={(e) => setLoteSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-zinc-300 rounded-xl text-xs bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />

          {/* Dropdown de resultados de busca rápida */}
          {searchResults.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-lg z-20 max-h-56 overflow-y-auto divide-y divide-zinc-100 p-1">
              {searchResults.slice(0, 6).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    handleSelectLoteResult(l);
                    setLoteSearch('');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-50 rounded-lg text-xs transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-zinc-900">#{l.loteNumber}</span>
                      <span className={`status-badge ${getStatusBadgeClass(l.status, l.customStatus)}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                        {getStatusLabel(l.status, l.customStatus)}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500 truncate block">
                      {l.productCode} - {l.productDescription || 'Item'}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-zinc-700 block">{Number(l.quantity || 0).toLocaleString()} kg</span>
                    <span className="text-[9px] font-mono text-zinc-400">{parseLoteDateToIso(l.date)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PAINEL DE PARÂMETROS / INDICADORES DE ORDENS DE PRODUÇÃO ATIVAS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'PG' ? 'ALL' : 'PG')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            statusFilter === 'PG'
              ? "bg-amber-50 border-amber-400 ring-2 ring-amber-400 shadow-sm"
              : "bg-white border-zinc-200 hover:border-zinc-300 shadow-xs"
          )}
          title="Filtrar ordens em Pesagem"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
            Em Pesagem
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-black text-zinc-900">{statusMetrics.pesagem}</span>
            <span className="text-[10px] font-mono text-zinc-400">PG</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'PP_PR' ? 'ALL' : 'PP_PR')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            statusFilter === 'PP_PR'
              ? "bg-blue-50 border-blue-400 ring-2 ring-blue-400 shadow-sm"
              : "bg-white border-zinc-200 hover:border-zinc-300 shadow-xs"
          )}
          title="Filtrar ordens em Pré-Produção / Produção"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
            Em Produção
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-black text-zinc-900">{statusMetrics.prodTotal}</span>
            <span className="text-[10px] font-mono text-zinc-400">PP/PR</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'EN' ? 'ALL' : 'EN')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            statusFilter === 'EN'
              ? "bg-orange-50 border-orange-400 ring-2 ring-orange-400 shadow-sm"
              : "bg-white border-zinc-200 hover:border-zinc-300 shadow-xs"
          )}
          title="Filtrar ordens em Envase"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 block">
            Em Envase
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-black text-zinc-900">{statusMetrics.envase}</span>
            <span className="text-[10px] font-mono text-zinc-400">EN</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'CF' ? 'ALL' : 'CF')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            statusFilter === 'CF'
              ? "bg-purple-50 border-purple-400 ring-2 ring-purple-400 shadow-sm"
              : "bg-white border-zinc-200 hover:border-zinc-300 shadow-xs"
          )}
          title="Filtrar ordens em Conferência"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">
            Conferência
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-black text-zinc-900">{statusMetrics.conferencia}</span>
            <span className="text-[10px] font-mono text-zinc-400">CF</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'ERRORS' ? 'ALL' : 'ERRORS')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            statusFilter === 'ERRORS'
              ? "bg-rose-50 border-rose-400 ring-2 ring-rose-400 shadow-sm"
              : "bg-white border-zinc-200 hover:border-zinc-300 shadow-xs"
          )}
          title="Filtrar lotes com desvios / alertas pendentes (lotes de 2026 em diante)"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block flex items-center gap-1">
            <AlertTriangle size={11} /> Desvios
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-black text-rose-700">{statusMetrics.erros}</span>
            <span className="text-[10px] font-mono text-zinc-400">2026+</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={cn(
            "p-3 rounded-xl border text-left transition-all cursor-pointer",
            statusFilter === 'ALL'
              ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
              : "bg-white border-zinc-200 hover:border-zinc-300 shadow-xs text-zinc-900"
          )}
          title="Mostrar todas as ordens abertas"
        >
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider block",
            statusFilter === 'ALL' ? "text-zinc-300" : "text-zinc-500"
          )}>
            Total Abertas
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={cn("text-xl font-black", statusFilter === 'ALL' ? "text-white" : "text-zinc-900")}>
              {statusMetrics.totalAbertas}
            </span>
            <span className={cn("text-[10px] font-mono", statusFilter === 'ALL' ? "text-zinc-400" : "text-zinc-400")}>
              OPs
            </span>
          </div>
        </button>
      </div>

      {/* Grade do Calendário (2 colunas) e Painel do Dia (1 coluna) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendário Mensal */}
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
                    "min-h-[88px] p-2 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer group",
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
                      day.isToday && !isSelected && "text-zinc-950 underline font-black"
                    )}>
                      {day.dayNum}
                    </span>

                    <div className="flex items-center gap-1">
                      {day.hasError && (
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full animate-pulse",
                            isSelected ? "bg-rose-400" : "bg-rose-500"
                          )}
                          title="Lote com desvio/alerta nesta data"
                        />
                      )}
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
                  </div>

                  {/* Badge com contagem de lotes */}
                  {day.count > 0 && (
                    <div className="mt-auto pt-1 flex flex-col gap-0.5">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-md text-[9px] font-black flex items-center gap-1 tracking-tight truncate",
                        isSelected
                          ? "bg-white text-zinc-950"
                          : "bg-zinc-100 text-zinc-900 border border-zinc-200 group-hover:bg-zinc-200"
                      )}>
                        <ClipboardList className="w-2.5 h-2.5 shrink-0" />
                        {day.count} {day.count === 1 ? 'lote' : 'lotes'}
                      </span>
                      {day.totalKg > 0 && (
                        <span className={cn(
                          "text-[8px] font-mono px-0.5 truncate",
                          isSelected ? "text-zinc-300" : "text-zinc-500"
                        )}>
                          {day.totalKg >= 1000 ? `${(day.totalKg / 1000).toFixed(1)}t` : `${day.totalKg}kg`}
                        </span>
                      )}
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
                <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="font-bold">{selectedDayInfo.holiday.name}</span>
                </div>
              )}
            </div>

            {/* Resumo do dia */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Lotes</span>
                <span className="text-lg font-black text-zinc-900">{selectedDayInfo?.count || 0}</span>
              </div>
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Volume Total</span>
                <span className="text-lg font-black text-zinc-900">
                  {selectedDayInfo?.totalKg ? `${selectedDayInfo.totalKg.toLocaleString('pt-BR')} kg` : '0 kg'}
                </span>
              </div>
            </div>

            {/* Alerta de Desvios no dia */}
            {selectedDayInfo && selectedDayInfo.errorCount > 0 && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{selectedDayInfo.errorCount} {selectedDayInfo.errorCount === 1 ? 'lote com alerta pendente' : 'lotes com alertas pendentes'}</span>
              </div>
            )}

            {/* Lista de lotes do dia */}
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {!selectedDayInfo || selectedDayInfo.lotes.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-xs flex flex-col items-center gap-2">
                  <ClipboardList className="w-8 h-8 text-zinc-300" />
                  <span>Nenhum lote industrial registrado nesta data.</span>
                </div>
              ) : displayedDayLotes.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center gap-2 bg-zinc-50 rounded-xl p-4 border border-zinc-200">
                  <Info className="w-5 h-5 text-zinc-400" />
                  <span>Nenhum lote nesta data corresponde ao filtro de status selecionado.</span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className="text-xs font-bold text-zinc-900 underline hover:text-zinc-700 cursor-pointer"
                  >
                    Mostrar todos os {selectedDayInfo.lotes.length} lotes do dia
                  </button>
                </div>
              ) : (
                displayedDayLotes.map((l) => {
                  return (
                    <div
                      key={l.id}
                      onClick={() => onOpenDetails && onOpenDetails(l.loteNumber)}
                      className={cn(
                        "p-3.5 rounded-xl border transition-all bg-white space-y-2 cursor-pointer hover:border-zinc-400 hover:shadow-xs",
                        l.hasError ? "border-rose-200 bg-rose-50/20" : "border-zinc-200"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-black text-sm text-zinc-900">
                          #{l.loteNumber}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <span className={`status-badge ${getStatusBadgeClass(l.status, l.customStatus)}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                            {getStatusLabel(l.status, l.customStatus)}
                          </span>
                          {l.isResolved && (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[8px] font-extrabold">
                              ✔️ Resolvido
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Alertas de Erro se houver */}
                      {(l.yieldError || l.pesagemError || l.envaseError || l.conferenciaError) && !l.isResolved && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {l.yieldError && (
                            <span className="bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1">
                              <AlertTriangle size={9} /> RENDIMENTO
                            </span>
                          )}
                          {l.pesagemError && (
                            <span className="bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1">
                              <AlertTriangle size={9} /> PESAGEM
                            </span>
                          )}
                          {l.envaseError && (
                            <span className="bg-orange-100 text-orange-800 border border-orange-200 px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1">
                              <AlertTriangle size={9} /> ENVASE
                            </span>
                          )}
                          {l.conferenciaError && (
                            <span className="bg-purple-100 text-purple-800 border border-purple-200 px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-1">
                              <AlertTriangle size={9} /> CONFERÊNCIA
                            </span>
                          )}
                        </div>
                      )}

                      <div className="text-xs font-bold text-zinc-900 truncate" title={l.productDescription}>
                        <span className="font-mono text-zinc-500 mr-1.5 text-[11px]">{l.productCode}</span>
                        {l.productDescription || 'Item Não Sincronizado'}
                      </div>

                      {/* SNAPSHOT HISTÓRICO NO MOMENTO DA ABERTURA DO LOTE */}
                      {(l.snapEstoque !== undefined || l.snapMediaVendas !== undefined || l.snapProducaoRecomendada !== undefined || l.snapEfp !== undefined) && (
                        <div className="bg-zinc-50 border border-zinc-200/80 rounded-lg p-2 text-[10px] space-y-1">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                            <span>Snapshot na Abertura</span>
                            {l.snapStatusLabel && (
                              <span className="font-semibold text-zinc-700">{l.snapStatusLabel}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-zinc-700 font-medium">
                            {l.snapEstoque !== undefined && (
                              <div>Estoque: <strong className="text-zinc-900">{Number(l.snapEstoque).toLocaleString()} un</strong></div>
                            )}
                            {l.snapProducaoRecomendada !== undefined && (
                              <div>Sugerido: <strong className="text-zinc-900">{Number(l.snapProducaoRecomendada).toLocaleString()} un</strong></div>
                            )}
                            {l.snapMediaVendas !== undefined && (
                              <div>Média Venda: <strong className="text-zinc-900">{Number(l.snapMediaVendas).toFixed(1)}/mês</strong></div>
                            )}
                            {l.snapEfp !== undefined && (
                              <div>EFP: <strong className="text-zinc-900">{Number(l.snapEfp).toLocaleString()} un</strong></div>
                            )}
                          </div>
                          {l.observacoes && (
                            <div className="text-[9px] text-zinc-500 italic pt-0.5 border-t border-zinc-200/60 truncate">
                              Obs: {l.observacoes}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-zinc-600 pt-1 border-t border-zinc-100">
                        <span className="font-bold text-zinc-900">
                          {Number(l.quantity || 0).toLocaleString('pt-BR')} kg
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                          <User size={10} />
                          <span className="truncate max-w-[120px]">{l.fabricatedBy || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Dica no rodapé do painel */}
          {selectedDayInfo && selectedDayInfo.count > 0 && (
            <div className="text-[10px] text-zinc-400 text-center flex items-center justify-center gap-1 pt-2 border-t border-zinc-100">
              <Eye size={12} /> Clique em qualquer lote para abrir os detalhes completos
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
