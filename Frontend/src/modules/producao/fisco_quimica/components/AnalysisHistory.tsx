import React, { useState, useMemo, useEffect } from 'react';
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
  Search,
  Printer,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Calendar,
  FileText,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Image as ImageIcon,
  Video,
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { checkAnalysisCompliance, printFiscoReports, printFiscoSummaryReport, printCorrectiveOrder, formatViscosity, calculateFillingTargets } from '../lib/fiscoUtils';
import Modal from '../../../geral/components/ui/Modal';

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function parseAnalysisMonthYear(dateStr: string): { year: number; month: number } {
  if (!dateStr) return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
  const clean = dateStr.trim().split(' ')[0].split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) };
    }
    if (parts[2].length === 4) {
      return { year: parseInt(parts[2], 10), month: parseInt(parts[1], 10) };
    }
  }
  return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
}

function isSyncedToErp(a: FiscoQuimicaAnalysis): boolean {
  return Boolean(a.syncedToErp === true || (a as any).synced_to_erp === true);
}

interface AnalysisHistoryProps {
  analyses: FiscoQuimicaAnalysis[];
  patterns: FiscoQuimicaPattern[];
  products: Product[];
  agents: FiscoQuimicaAgent[];
  config?: FiscoTemplateConfig;
  selectedIds: Set<string>;
  onToggleSelection: (id: string, isShift?: boolean, isCtrl?: boolean) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onDeleteAnalysis: (id: string, batch: string) => void;
  onRefresh: () => void;
  onEditAnalysis?: (analysis: FiscoQuimicaAnalysis) => void;
}

export function AnalysisHistory({
  analyses,
  patterns,
  products,
  agents,
  config,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onDeleteAnalysis,
  onRefresh,
  onEditAnalysis,
}: AnalysisHistoryProps) {
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'conforme' | 'em_correcao' | 'ajustado' | 'fora' | 'pendente_erp'>('all');
  const [pushingErp, setPushingErp] = useState(false);
  const [zoomMedia, setZoomMedia] = useState<{ url: string; title: string; isVideo?: boolean } | null>(null);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // PROCs & Modal Etiqueta Zebra 100x50mm
  const [procMapByCode, setProcMapByCode] = useState<Record<string, ProcItem>>({});
  const [procMapByDesc, setProcMapByDesc] = useState<Record<string, ProcItem>>({});
  const [selectedLoteForLabel, setSelectedLoteForLabel] = useState<FiscoQuimicaAnalysis | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);

  useEffect(() => {
    api.getProcMap().then((res) => {
      if (res?.byCode) setProcMapByCode(res.byCode);
      if (res?.byDescription) setProcMapByDesc(res.byDescription);
    }).catch((err) => console.error('Erro ao carregar PROCs no histórico:', err));
  }, []);

  const normalizeCode = (code?: string | null) => (code ? String(code).replace(/\./g, '').trim().toLowerCase() : '');

  const getProcForAnalysis = (a?: FiscoQuimicaAnalysis | null): ProcItem | null => {
    if (!a) return null;
    const code = normalizeCode(a.productCode);
    if (code && procMapByCode[code]) return procMapByCode[code];
    const name = (a.productName || '').trim().toLowerCase();
    if (name && procMapByDesc[name]) return procMapByDesc[name];
    return null;
  };

  // Maps para lookup O(1) instantâneo
  const patternMap = useMemo(() => {
    const map = new Map<string, FiscoQuimicaPattern>();
    for (const p of patterns) {
      map.set(normalizeCode(p.productCode), p);
    }
    return map;
  }, [patterns]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(normalizeCode(p.code), p);
    }
    return map;
  }, [products]);

  const agentMap = useMemo(() => {
    const map = new Map<string, FiscoQuimicaAgent>();
    for (const a of agents) {
      map.set(a.id, a);
    }
    return map;
  }, [agents]);

  const handlePushToErp = async (ids?: string[]) => {
    setPushingErp(true);
    try {
      const res = await api.pushFiscoLaudosToErp(ids, ids ? undefined : true);
      if (res.success) {
        alert(`Sucesso! ${res.updated_count} laudo(s) sincronizado(s) e lançado(s) no ERP com sucesso.`);
        onRefresh();
      } else {
        alert('Não foi possível sincronizar com o ERP.');
      }
    } catch (err: any) {
      console.error('Erro ao enviar laudos para o ERP:', err);
      alert(`Erro ao lançar no ERP: ${err.message || err}`);
    } finally {
      setPushingErp(false);
    }
  };

  // Agrupamento por Mês/Ano com lookup O(1)
  const monthGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; year: number; month: number; total: number; conformes: number; ajustados: number; fora: number }
    >();

    for (const a of analyses) {
      const my = parseAnalysisMonthYear(a.analysisDate);
      const key = `${my.year}-${my.month.toString().padStart(2, '0')}`;
      const monthName = MONTH_NAMES_PT[my.month - 1] || `Mês ${my.month}`;
      const label = `${monthName} / ${my.year}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          year: my.year,
          month: my.month,
          total: 0,
          conformes: 0,
          ajustados: 0,
          fora: 0,
        });
      }

      const grp = map.get(key)!;
      grp.total += 1;

      const pat = patternMap.get(normalizeCode(a.productCode)) || null;
      const comp = checkAnalysisCompliance(a, pat);
      if (comp.overallStatus === 'CONFORME') grp.conformes += 1;
      else if (a.hasAdjustment) grp.ajustados += 1;
      else if (comp.overallStatus === 'FORA_PADRAO') grp.fora += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [analyses, patternMap]);

  // Mantém 'ALL' ou o mês selecionado
  useEffect(() => {
    if (!selectedMonthYear) {
      setSelectedMonthYear('ALL');
    }
  }, [selectedMonthYear]);

  // Reset de página ao alterar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonthYear, searchQuery, statusFilter, pageSize]);

  // Filtragem e busca com Map O(1)
  const filteredAnalyses = useMemo(() => {
    let list = analyses;

    // 1. Filtro por Mês/Ano
    if (selectedMonthYear && selectedMonthYear !== 'ALL') {
      list = list.filter((a) => {
        const my = parseAnalysisMonthYear(a.analysisDate);
        const key = `${my.year}-${my.month.toString().padStart(2, '0')}`;
        return key === selectedMonthYear;
      });
    }

    // 2. Filtro por Texto / Busca
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const qNorm = q.replace(/\./g, '');
      list = list.filter((a) => {
        const codeNorm = (a.productCode || '').toLowerCase().replace(/\./g, '');
        return (
          codeNorm.includes(qNorm) ||
          (a.productName || '').toLowerCase().includes(q) ||
          (a.batch || '').toLowerCase().includes(q) ||
          (a.technician || '').toLowerCase().includes(q) ||
          (a.fabricatedBy || '').toLowerCase().includes(q) ||
          (a.authorizedBy || '').toLowerCase().includes(q) ||
          (a.notes || '').toLowerCase().includes(q)
        );
      });
    }

    // 3. Filtro por Status
    if (statusFilter !== 'all') {
      list = list.filter((a) => {
        const pat = patternMap.get(normalizeCode(a.productCode)) || null;
        const comp = checkAnalysisCompliance(a, pat);
        if (statusFilter === 'conforme') return comp.overallStatus === 'CONFORME';
        if (statusFilter === 'em_correcao') return comp.overallStatus === 'EM_CORRECAO';
        if (statusFilter === 'ajustado') return a.hasAdjustment && comp.overallStatus !== 'EM_CORRECAO';
        if (statusFilter === 'fora') return comp.overallStatus === 'FORA_PADRAO';
        if (statusFilter === 'pendente_erp') return !isSyncedToErp(a);
        return true;
      });
    }

    return list;
  }, [analyses, patternMap, selectedMonthYear, searchQuery, statusFilter]);

  // Contagens para os botões de status dentro do mês selecionado
  const statusCounts = useMemo(() => {
    let baseList = analyses;
    if (selectedMonthYear && selectedMonthYear !== 'ALL') {
      baseList = baseList.filter((a) => {
        const my = parseAnalysisMonthYear(a.analysisDate);
        const key = `${my.year}-${my.month.toString().padStart(2, '0')}`;
        return key === selectedMonthYear;
      });
    }

    let conformes = 0;
    let emCorrecao = 0;
    let ajustados = 0;
    let fora = 0;
    let pendentesErp = 0;

    for (const a of baseList) {
      const pat = patternMap.get(normalizeCode(a.productCode)) || null;
      const comp = checkAnalysisCompliance(a, pat);
      if (comp.overallStatus === 'EM_CORRECAO') emCorrecao += 1;
      else if (comp.overallStatus === 'CONFORME') conformes += 1;
      else if (a.hasAdjustment) ajustados += 1;
      else if (comp.overallStatus === 'FORA_PADRAO') fora += 1;

      if (!isSyncedToErp(a)) pendentesErp += 1;
    }

    return {
      total: baseList.length,
      conformes,
      emCorrecao,
      ajustados,
      fora,
      pendentesErp,
    };
  }, [analyses, patternMap, selectedMonthYear]);

  // Lista paginada para renderização ultrarrápida do DOM
  const totalPages = Math.max(1, Math.ceil(filteredAnalyses.length / pageSize));
  const paginatedAnalyses = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAnalyses.slice(start, start + pageSize);
  }, [filteredAnalyses, currentPage, pageSize]);

  // Impressão individual de uma linha
  const handlePrintSingle = (analysis: FiscoQuimicaAnalysis) => {
    printFiscoReports(analysis, patterns, products, agents, config);
  };

  // Impressão em lote dos laudos completos individuais
  const handlePrintBatch = () => {
    const selectedList = analyses.filter((a) => selectedIds.has(a.id));
    if (selectedList.length === 0) return;
    printFiscoReports(selectedList, patterns, products, agents, config);
  };

  // Impressão do Relatório Resumido A4 (Folha única / resumida de lote a lote)
  const handlePrintSummaryReport = () => {
    const itemsToPrint = selectedIds.size > 0
      ? analyses.filter((a) => selectedIds.has(a.id))
      : filteredAnalyses;
    if (itemsToPrint.length === 0) return;
    printFiscoSummaryReport(itemsToPrint, patterns, config);
  };

  // Toggle selecionar todos os visíveis na página atual
  const allVisibleSelected =
    paginatedAnalyses.length > 0 && paginatedAnalyses.every((a) => selectedIds.has(a.id));
  const handleToggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      onClearSelection();
    } else {
      onSelectAll(paginatedAnalyses.map((a) => a.id));
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      
      {/* 1. Barra de Seleção de Mês/Ano (Pills horizontais) */}
      {monthGroups.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
          <button
            type="button"
            onClick={() => setSelectedMonthYear('ALL')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 border",
              selectedMonthYear === 'ALL'
                ? "bg-zinc-950 text-white border-zinc-950 shadow-sm"
                : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
            )}
          >
            <Calendar size={13} />
            Todos os Anos ({analyses.length})
          </button>

          {monthGroups.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setSelectedMonthYear(g.key)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 border",
                selectedMonthYear === g.key
                  ? "bg-zinc-950 text-white border-zinc-950 shadow-sm"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
              )}
            >
              <span>{g.label}</span>
              <span className={cn(
                "px-1.5 py-0.2 rounded-md text-[10px] font-mono",
                selectedMonthYear === g.key ? "bg-zinc-800 text-zinc-200" : "bg-zinc-100 text-zinc-500"
              )}>
                {g.total}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 2. Barra de Filtros e Ações em Lote */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Campo de Busca Rápida */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por lote, nome do produto, código, operador ou notas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-zinc-300 rounded-xl text-sm bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>

        {/* Filtros de Status */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              statusFilter === 'all'
                ? "bg-zinc-950 text-white shadow-xs"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            Todos ({statusCounts.total})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('conforme')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              statusFilter === 'conforme'
                ? "bg-emerald-700 text-white shadow-xs"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            )}
          >
            Conformes ({statusCounts.conformes})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('em_correcao')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1",
              statusFilter === 'em_correcao'
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200/80"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Em Correção ({statusCounts.emCorrecao})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ajustado')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              statusFilter === 'ajustado'
                ? "bg-blue-700 text-white shadow-xs"
                : "bg-blue-50 text-blue-800 hover:bg-blue-100"
            )}
          >
            Ajustados ({statusCounts.ajustados})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('fora')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              statusFilter === 'fora'
                ? "bg-rose-700 text-white shadow-xs"
                : "bg-rose-50 text-rose-800 hover:bg-rose-100"
            )}
          >
            Fora do Padrão ({statusCounts.fora})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pendente_erp')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              statusFilter === 'pendente_erp'
                ? "bg-purple-700 text-white shadow-xs"
                : "bg-purple-50 text-purple-800 hover:bg-purple-100"
            )}
          >
            Pendente ERP ({statusCounts.pendentesErp})
          </button>
        </div>

        {/* Botões de Ação em Lote */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Botão de Gravação Direta no ERP */}
          {(statusCounts.pendentesErp > 0 || selectedIds.size > 0) && (
            <button
              type="button"
              onClick={() => handlePushToErp(selectedIds.size > 0 ? Array.from(selectedIds) : undefined)}
              disabled={pushingErp}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Clock className={cn("w-3.5 h-3.5", pushingErp && "animate-spin")} />
              <span>
                {pushingErp
                  ? 'Lançando no ERP...'
                  : selectedIds.size > 0
                  ? `Lançar (${selectedIds.size}) no ERP`
                  : `Lançar Pendentes no ERP (${statusCounts.pendentesErp})`}
              </span>
            </button>
          )}

          {/* Botão de Relatório Resumido A4 */}
          <button
            type="button"
            onClick={handlePrintSummaryReport}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-zinc-300 hover:border-zinc-400 bg-white hover:bg-zinc-50 text-zinc-900 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-zinc-600" />
            Relatório Resumido A4
          </button>

          {/* Botão de Impressão de Laudos Completos Selecionados */}
          {selectedIds.size > 0 && (
            <>
              <button
                type="button"
                onClick={handlePrintBatch}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Laudos Oficiais ({selectedIds.size})
              </button>
              <button
                type="button"
                onClick={onClearSelection}
                className="px-2.5 py-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-500 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Limpar
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3. Tabela de Histórico de Laudos */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[350px]">
          {filteredAnalyses.length === 0 ? (
            <div className="py-20 text-center text-zinc-400 text-xs flex flex-col items-center gap-2">
              <Activity className="w-8 h-8 text-zinc-300" />
              <span>Nenhum laudo físico-químico localizado para o filtro selecionado.</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50/80 border-b border-zinc-200 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={handleToggleSelectAllVisible}
                      className="w-4 h-4 text-zinc-950 focus:ring-zinc-900 accent-zinc-950 rounded cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3">Lote / Data</th>
                  <th className="px-4 py-3">Produto Acabado</th>
                  <th className="px-4 py-3">Fabricação</th>
                  <th className="px-4 py-3 text-center">pH (25°C)</th>
                  <th className="px-4 py-3 text-center">Viscosidade</th>
                  <th className="px-4 py-3 text-center">Densidade</th>
                  <th className="px-4 py-3 text-center">Envase Alvo</th>
                  <th className="px-4 py-3 text-center">Status ERP</th>
                  <th className="px-4 py-3 text-center">Conformidade</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {paginatedAnalyses.map((a) => {
                  const isSelected = selectedIds.has(a.id);
                  const pat = patternMap.get(normalizeCode(a.productCode)) || null;
                  const compliance = checkAnalysisCompliance(a, pat);
                  const agent = a.correctiveAgentId ? agentMap.get(a.correctiveAgentId) : null;
                  const synced = isSyncedToErp(a);

                  const cleanDate = (a.analysisDate || '').trim().split(' ')[0].split('T')[0];
                  const dateStr = cleanDate.includes('-')
                    ? cleanDate.split('-').reverse().join('/')
                    : cleanDate;

                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        "transition-colors hover:bg-zinc-50/70",
                        isSelected && "bg-zinc-100/60"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onToggleSelection(a.id, (e.nativeEvent as any).shiftKey, (e.nativeEvent as any).ctrlKey)}
                          className="w-4 h-4 text-zinc-950 focus:ring-zinc-900 accent-zinc-950 rounded cursor-pointer"
                        />
                      </td>

                      {/* Lote e Data */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="font-bold text-zinc-900 font-mono text-sm">{a.batch}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{dateStr}</div>
                      </td>

                      {/* Produto + Mídia */}
                      <td className="px-4 py-3.5 max-w-[280px]">
                        <div className="flex items-center gap-2">
                          {a.mediaUrl && (
                            <button
                              type="button"
                              onClick={() => setZoomMedia({ url: a.mediaUrl!, title: `Amostra Lote ${a.batch} - ${a.productName}`, isVideo: a.mediaUrl!.startsWith('data:video') })}
                              className="p-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer shrink-0"
                              title="Ver foto/vídeo da amostra do lote"
                            >
                              {a.mediaUrl.startsWith('data:video') ? (
                                <Video className="w-3.5 h-3.5 text-indigo-600" />
                              ) : (
                                <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                              )}
                            </button>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-zinc-900 truncate" title={a.productName}>
                              {a.productName}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">Cód: {a.productCode}</div>
                          </div>
                        </div>
                      </td>

                      {/* Fabricação */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="text-[11px] font-semibold text-zinc-800 truncate max-w-[140px]" title={a.fabricatedBy || a.technician}>
                          FAB: {a.fabricatedBy || '—'}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate max-w-[140px]" title={a.authorizedBy}>
                          AUT: {a.authorizedBy || '—'}
                        </div>
                      </td>

                      {/* pH */}
                      <td className="px-4 py-3.5 text-center font-mono font-bold">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded",
                          compliance.phOk ? "text-zinc-900" : "bg-rose-100 text-rose-800"
                        )}>
                          {a.phMeasured > 0 ? a.phMeasured.toFixed(2) : '—'}
                        </span>
                      </td>

                      {/* Viscosidade */}
                      <td className="px-4 py-3.5 text-center font-mono font-bold">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded",
                          compliance.viscOk ? "text-zinc-900" : "bg-rose-100 text-rose-800"
                        )}>
                          {formatViscosity(a.viscosityMeasured, pat)}{' '}
                          <span className="text-[9px] font-normal text-zinc-400">cps</span>
                        </span>
                      </td>

                      {/* Densidade */}
                      <td className="px-4 py-3.5 text-center font-mono font-bold">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded",
                          compliance.densityOk ? "text-zinc-900" : "bg-rose-100 text-rose-800"
                        )}>
                          {a.densityMeasured > 0 ? a.densityMeasured.toFixed(3) : '—'}{' '}
                          <span className="text-[9px] font-normal text-zinc-400">g/mL</span>
                        </span>
                      </td>

                      {/* Envase Alvo */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {(() => {
                          const filling = calculateFillingTargets(pat, a.densityMeasured, a.productName);
                          const envaseDisplay = a.envaseTargetWeight > 0
                            ? `${a.envaseTargetWeight} ${a.envaseTargetUnit || 'g'}`
                            : (filling.weight.value > 0 ? `${filling.weight.value} ${filling.weight.unit}` : null);

                          return envaseDisplay ? (
                            <span className="px-2 py-0.5 bg-zinc-900 text-white rounded font-mono font-bold text-[10px]">
                              {envaseDisplay}
                            </span>
                          ) : (
                            <span className="text-zinc-400 text-[10px]">—</span>
                          );
                        })()}
                      </td>

                      {/* Status ERP */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {synced ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200"
                            title={`Lançado no ERP em: ${a.erpSyncedAt || 'OK'}`}
                          >
                            <CheckCircle2 size={11} className="text-blue-600" />
                            Lançado
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200"
                            title="Não gravado no ERP ainda"
                          >
                            <Clock size={11} className="text-zinc-400" />
                            Pendente
                          </span>
                        )}
                      </td>

                      {/* Conformidade */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {a.status === 'EM_CORRECAO' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                            Em Correção
                          </span>
                        ) : compliance.isCompliant ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 size={11} className="text-emerald-600" />
                            {a.hasAdjustment ? 'Conforme (Ajustado)' : 'Conforme'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                            <AlertTriangle size={11} className="text-rose-600" />
                            Fora do Padrão
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão de Edição */}
                          {onEditAnalysis && (
                            <button
                              type="button"
                              onClick={() => onEditAnalysis(a)}
                              className={cn(
                                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs",
                                a.status === 'EM_CORRECAO'
                                  ? "bg-amber-400 hover:bg-amber-500 text-amber-950 font-black"
                                  : "bg-zinc-100 hover:bg-zinc-200 text-zinc-800 hover:text-zinc-950"
                              )}
                              title="Editar medições e dados do laudo"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>{a.status === 'EM_CORRECAO' ? 'Concluir / Editar' : 'Editar'}</span>
                            </button>
                          )}

                          {a.status === 'EM_CORRECAO' && (
                            <button
                              type="button"
                              onClick={() => printCorrectiveOrder(a, pat, agent, config ? { template: config } as any : null)}
                              className="p-1.5 text-amber-700 hover:text-amber-950 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
                              title="Reimprimir Ordem de Ajuste Corretivo"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Botão de Impressão do Laudo Oficial Individual */}
                          <button
                            type="button"
                            onClick={() => handlePrintSingle(a)}
                            className="p-1.5 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                            title="Imprimir Laudo Oficial Individual"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 4. Paginação do Histórico */}
        {filteredAnalyses.length > 0 && (
          <div className="bg-zinc-50 px-4 py-3 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
            <div className="flex items-center gap-2">
              <span>
                Mostrando <strong>{(currentPage - 1) * pageSize + 1}</strong> a{' '}
                <strong>{Math.min(currentPage * pageSize, filteredAnalyses.length)}</strong> de{' '}
                <strong>{filteredAnalyses.length}</strong> laudos
              </span>
              <span className="text-zinc-300">|</span>
              <div className="flex items-center gap-1.5">
                <span>Por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-white border border-zinc-200 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                </select>
              </div>
            </div>

            {/* Controles de Navegação */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                title="Primeira Página"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                title="Página Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 font-bold text-zinc-800">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                title="Próxima Página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                title="Última Página"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Zoom da Mídia */}
      <Modal
        isOpen={!!zoomMedia}
        onClose={() => setZoomMedia(null)}
        title={zoomMedia?.title || 'Mídia da Amostra'}
        subtitle="Registro de bancada"
        size="lg"
      >
        {zoomMedia && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden border border-zinc-200 bg-black flex items-center justify-center max-h-[70vh]">
              {zoomMedia.isVideo ? (
                <video src={zoomMedia.url} controls autoPlay className="max-w-full max-h-[70vh]" />
              ) : (
                <img src={zoomMedia.url} alt={zoomMedia.title} className="max-w-full max-h-[70vh] object-contain" />
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setZoomMedia(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
