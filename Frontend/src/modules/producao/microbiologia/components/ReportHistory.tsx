import React, { useState, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { Report } from '../../../geral/lib/types';
import {
  Search,
  Trash2,
  Printer,
  Loader2,
  ListChecks,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  CheckCircle2,
  Clock,
  CheckCheck,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../../geral/lib/microbioUtils';
import { parseMonthYear, MONTH_NAMES_PT } from '../../../geral/lib/reportNumberUtils';
import { motion } from 'motion/react';

interface ReportHistoryProps {
  reports: Report[];
  onPrint: (r: Report | Report[]) => void;
  selectedIds: Set<string>;
  onToggle: (id: string, shift: boolean, ctrl: boolean) => void;
  onRefresh?: () => void;
}

export function ReportHistory({
  reports,
  onPrint,
  selectedIds,
  onToggle,
  onRefresh,
}: ReportHistoryProps) {
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>('ALL');
  const [printFilter, setPrintFilter] = useState<'ALL' | 'PENDING' | 'PRINTED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sortKey, setSortKey] = useState<
    'reportRawNum' | 'productName' | 'batch' | 'collectionDate' | 'printed'
  >('reportRawNum');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (
    key: 'reportRawNum' | 'productName' | 'batch' | 'collectionDate' | 'printed',
  ) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({
    col,
  }: {
    col: 'reportRawNum' | 'productName' | 'batch' | 'collectionDate' | 'printed';
  }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-zinc-300" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-zinc-700" />
    ) : (
      <ArrowDown className="h-3 w-3 text-zinc-700" />
    );
  };

  // Extract distinct Month/Years available in reports
  const monthGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; year: number; month: number; total: number; pending: number; printed: number }
    >();

    for (const r of reports) {
      const my = parseMonthYear(r.collectionDate);
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
          pending: 0,
          printed: 0,
        });
      }

      const grp = map.get(key)!;
      grp.total += 1;
      if (r.printed) grp.printed += 1;
      else grp.pending += 1;
    }

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [reports]);

  // Overall totals
  const totalCount = reports.length;
  const totalPending = reports.filter((r) => !r.printed).length;
  const totalPrinted = reports.filter((r) => r.printed).length;

  // Reports filtered by Month, Search, Print Status & Date Range
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      // 1. Filter by Search term
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const matchesId = (r.reportId || '').toLowerCase().includes(s);
        const matchesName = (r.productName || '').toLowerCase().includes(s);
        const matchesBatch = (r.batch || '').toLowerCase().includes(s);
        if (!matchesId && !matchesName && !matchesBatch) return false;
      }

      // 2. Filter by Month/Year tab
      if (selectedMonthYear !== 'ALL') {
        const my = parseMonthYear(r.collectionDate);
        const key = `${my.year}-${my.month.toString().padStart(2, '0')}`;
        if (key !== selectedMonthYear) return false;
      }

      // 3. Filter by Print Status
      if (printFilter === 'PENDING' && r.printed) return false;
      if (printFilter === 'PRINTED' && !r.printed) return false;

      // 4. Filter by Date range picker (if provided)
      if (startDate || endDate) {
        const my = parseMonthYear(r.collectionDate);
        const parts = (r.collectionDate || '').split(/[-/]/);
        if (parts.length === 3) {
          const reportDate =
            parts[2].length === 4
              ? `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
              : `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;

          if (startDate && reportDate < startDate) return false;
          if (endDate && reportDate > endDate) return false;
        }
      }

      return true;
    });
  }, [reports, searchTerm, selectedMonthYear, printFilter, startDate, endDate]);

  // Sorted list
  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a, b) => {
      if (sortKey === 'collectionDate') {
        const partsA = (a.collectionDate || '').split(/[-/]/);
        const partsB = (b.collectionDate || '').split(/[-/]/);
        const dateA =
          partsA.length === 3 && partsA[2].length === 4
            ? `${partsA[2]}-${partsA[1]}-${partsA[0]}`
            : a.collectionDate || '';
        const dateB =
          partsB.length === 3 && partsB[2].length === 4
            ? `${partsB[2]}-${partsB[1]}-${partsB[0]}`
            : b.collectionDate || '';
        return sortDir === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      }
      if (sortKey === 'printed') {
        const aPrint = a.printed ? 1 : 0;
        const bPrint = b.printed ? 1 : 0;
        return sortDir === 'asc' ? aPrint - bPrint : bPrint - aPrint;
      }
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = (aVal as number) || 0;
      const bNum = (bVal as number) || 0;
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }, [filteredReports, sortKey, sortDir]);

  const selectedList = sortedReports.filter((r) => selectedIds.has(r.id || ''));
  const filteredPendingList = sortedReports.filter((r) => !r.printed);

  // Active month group summary
  const currentMonthGroup = monthGroups.find((g) => g.key === selectedMonthYear);

  // Print all pending reports in the current active filter
  const handlePrintAllPending = async () => {
    if (filteredPendingList.length === 0) return;
    setSaving(true);
    try {
      await onPrint(filteredPendingList);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePrinted = async (id: string, printed: boolean) => {
    try {
      await api.markReportsPrinted([id], printed);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Erro ao alterar status de impressão:', e);
      alert('Erro ao alterar status de impressão.');
    }
  };

  const handleBulkMarkPrinted = async (printed: boolean) => {
    const ids = selectedList.map((r) => r.id).filter(Boolean) as string[];
    if (ids.length === 0) return;
    setSaving(true);
    try {
      await api.markReportsPrinted(ids, printed);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Erro em lote de impressão:', e);
      alert('Erro ao atualizar status de impressão.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectAllVisible = () => {
    const allSelected = sortedReports.length > 0 && sortedReports.every((r) => selectedIds.has(r.id || ''));
    for (const r of sortedReports) {
      if (r.id) {
        if (allSelected) {
          if (selectedIds.has(r.id)) onToggle(r.id, false, true);
        } else {
          if (!selectedIds.has(r.id)) onToggle(r.id, false, true);
        }
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteReport(id);
      setConfirmDeleteId(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
      alert('Erro ao excluir laudo.');
    }
  };

  const handleBulkDelete = async () => {
    setSaving(true);
    try {
      for (const id of selectedIds) {
        await api.deleteReport(id);
      }
      setConfirmBulkDelete(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir laudos selecionados.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      {/* Header */}
      <div className="view-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="view-title">Histórico de Laudos</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Selecione o mês desejado, acompanhe a fila de pendentes e imprima com marcação automática.
          </p>
        </div>

        {/* Global Print Status Summary */}
        <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl border border-zinc-200 text-xs font-bold">
          <button
            onClick={() => setPrintFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              printFilter === 'ALL'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Todos ({totalCount})
          </button>
          <button
            onClick={() => setPrintFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              printFilter === 'PENDING'
                ? 'bg-amber-100 text-amber-900 border border-amber-200 shadow-xs'
                : 'text-amber-800 hover:bg-amber-50/50'
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            Pendentes ({totalPending})
          </button>
          <button
            onClick={() => setPrintFilter('PRINTED')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              printFilter === 'PRINTED'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200 shadow-xs'
                : 'text-emerald-800 hover:bg-emerald-50/50'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Impressos ({totalPrinted})
          </button>
        </div>
      </div>

      {/* Month Selection Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-zinc-200">
        <button
          onClick={() => setSelectedMonthYear('ALL')}
          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
            selectedMonthYear === 'ALL'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Todos os Meses ({totalCount})</span>
        </button>

        {monthGroups.map((grp) => {
          const isSelected = selectedMonthYear === grp.key;
          return (
            <button
              key={grp.key}
              onClick={() => setSelectedMonthYear(grp.key)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 border ${
                isSelected
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <Calendar className={`h-3.5 w-3.5 ${isSelected ? 'text-white' : 'text-zinc-400'}`} />
              <span>{grp.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isSelected
                    ? 'bg-zinc-700 text-zinc-100'
                    : grp.pending > 0
                    ? 'bg-amber-100 text-amber-800 font-bold'
                    : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {grp.total} {grp.pending > 0 && `(${grp.pending} pend.)`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Month Fast-Action Banner (When Pending Reports Exist) */}
      {filteredPendingList.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 border border-amber-300">
              <Clock className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-950 flex items-center gap-2">
                <span>
                  {selectedMonthYear === 'ALL'
                    ? `Existem ${filteredPendingList.length} laudos pendentes de impressão no total`
                    : `Existem ${filteredPendingList.length} laudos pendentes em ${currentMonthGroup?.label || ''}`}
                </span>
                <span className="bg-amber-200/80 text-amber-900 text-[10px] px-2 py-0.5 rounded-full font-black">
                  {filteredPendingList.length} PENDENTES
                </span>
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Ao imprimir, os laudos são enviados para a impressora e <strong>marcados automaticamente como impressos</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={handlePrintAllPending}
            disabled={saving}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm shrink-0"
            title="Imprimir todos os laudos pendentes deste filtro"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            <span>Imprimir {filteredPendingList.length} Pendentes</span>
          </button>
        </div>
      )}

      {/* Toolbar & Filters */}
      <div className="toolbar-section flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search bar */}
          <div className="search-input-wrapper min-w-[220px] flex-1">
            <Search size={16} />
            <input
              type="text"
              placeholder="Pesquisar nº laudo, produto ou lote..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input text-xs"
            />
          </div>

          {/* Date range picker */}
          <div className="flex items-center gap-1.5 text-xs">
            <label className="text-[10px] font-bold text-zinc-400 uppercase">De</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="search-input text-xs w-auto"
              style={{ paddingLeft: '0.5rem', minWidth: '120px' }}
            />
            <label className="text-[10px] font-bold text-zinc-400 uppercase">Até</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="search-input text-xs w-auto"
              style={{ paddingLeft: '0.5rem', minWidth: '120px' }}
            />
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="btn-secondary p-2 cursor-pointer"
              title="Atualizar lista"
            >
              <RefreshCw size={15} />
            </button>
          )}
        </div>

        {/* Selected Items Bulk Actions */}
        {selectedList.length > 0 && (
          <div className="flex items-center gap-2">
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2"
            >
              {confirmBulkDelete ? (
                <div className="flex items-center gap-1.5 bg-red-50 p-1 rounded-md border border-red-200">
                  <span className="text-[10px] font-black text-red-700 uppercase px-1.5">
                    Excluir {selectedIds.size}?
                  </span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={saving}
                    className="text-[10px] bg-red-600 text-white px-2.5 py-1 rounded font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'SIM'}
                  </button>
                  <button
                    onClick={() => setConfirmBulkDelete(false)}
                    className="text-[10px] bg-white border border-zinc-300 text-zinc-700 px-2 py-1 rounded font-bold hover:bg-zinc-50 cursor-pointer"
                  >
                    NÃO
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  className="bg-white text-red-600 border border-red-200 px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir ({selectedList.length})
                </button>
              )}

              {/* Mark as Printed / Not Printed in bulk */}
              <button
                onClick={() => handleBulkMarkPrinted(true)}
                className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 hover:bg-emerald-100 transition-colors cursor-pointer"
                title="Marcar selecionados como Impressos"
              >
                <CheckCheck className="h-3.5 w-3.5 text-emerald-600" /> Marcar Impresso
              </button>

              <button
                onClick={() => handleBulkMarkPrinted(false)}
                className="bg-zinc-100 text-zinc-700 border border-zinc-200 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 hover:bg-zinc-200 transition-colors cursor-pointer"
                title="Marcar selecionados como Pendentes"
              >
                <Clock className="h-3.5 w-3.5 text-zinc-500" /> Marcar Pendente
              </button>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <button
                onClick={() => onPrint(selectedList)}
                className="bg-zinc-900 text-white px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-zinc-800 transition-colors cursor-pointer shadow-xs"
              >
                <Printer className="h-4 w-4" /> Imprimir ({selectedList.length})
              </button>
            </motion.div>
          </div>
        )}
      </div>

      {/* Main Reports Table */}
      <div className="table-card overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
            <tr>
              <th
                className="px-4 py-3 w-10 text-center cursor-pointer hover:bg-zinc-100 transition-colors"
                onClick={handleSelectAllVisible}
                title="Selecionar / Deselecionar todos os itens visíveis"
              >
                <div
                  className={cn(
                    'h-3.5 w-3.5 border rounded-sm mx-auto flex items-center justify-center transition-colors',
                    sortedReports.length > 0 &&
                      sortedReports.every((r) => selectedIds.has(r.id || ''))
                      ? 'bg-zinc-900 border-zinc-900'
                      : 'border-zinc-400 bg-white',
                  )}
                >
                  {sortedReports.length > 0 &&
                    sortedReports.every((r) => selectedIds.has(r.id || '')) && (
                      <ListChecks className="h-2.5 w-2.5 text-white" />
                    )}
                </div>
              </th>
              <th
                className="px-4 py-3 text-center cursor-pointer hover:text-zinc-900 font-semibold"
                onClick={() => toggleSort('reportRawNum')}
              >
                <span className="flex items-center justify-center gap-1">
                  Nº Laudo <SortIcon col="reportRawNum" />
                </span>
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-zinc-900 font-semibold"
                onClick={() => toggleSort('productName')}
              >
                <span className="flex items-center gap-1">
                  Descrição do Produto <SortIcon col="productName" />
                </span>
              </th>
              <th
                className="px-4 py-3 text-center cursor-pointer hover:text-zinc-900 font-semibold"
                onClick={() => toggleSort('batch')}
              >
                <span className="flex items-center justify-center gap-1">
                  Lote <SortIcon col="batch" />
                </span>
              </th>
              <th
                className="px-4 py-3 text-center cursor-pointer hover:text-zinc-900 font-semibold"
                onClick={() => toggleSort('collectionDate')}
              >
                <span className="flex items-center justify-center gap-1">
                  Data Envase <SortIcon col="collectionDate" />
                </span>
              </th>
              <th
                className="px-4 py-3 text-center cursor-pointer hover:text-zinc-900 font-semibold"
                onClick={() => toggleSort('printed')}
              >
                <span className="flex items-center justify-center gap-1">
                  Status Impressão <SortIcon col="printed" />
                </span>
              </th>
              <th className="px-4 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 font-sans">
            {sortedReports.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-400 text-xs italic">
                  Nenhum laudo encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              sortedReports.map((r) => (
                <tr
                  key={r.reportId}
                  className={cn(
                    'hover:bg-zinc-50 transition-colors bg-white font-sans cursor-pointer group',
                    selectedIds.has(r.id || '') && 'bg-zinc-50',
                  )}
                  onClick={(e) => onToggle(r.id || '', e.shiftKey, e.ctrlKey || e.metaKey)}
                >
                  <td className="px-4 py-2 text-center">
                    <div
                      className={cn(
                        'h-3.5 w-3.5 border rounded-sm transition-colors flex items-center justify-center mx-auto',
                        selectedIds.has(r.id || '')
                          ? 'bg-zinc-900 border-zinc-900'
                          : 'border-zinc-400',
                      )}
                    >
                      {selectedIds.has(r.id || '') && (
                        <ListChecks className="h-2.5 w-2.5 text-white" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-bold text-zinc-900 text-center text-xs font-mono">
                    {r.reportId}
                  </td>
                  <td className="px-4 py-2 text-zinc-900 font-medium truncate max-w-xs">
                    {r.productName}
                  </td>
                  <td className="px-4 py-2 text-center text-zinc-600 font-mono text-xs font-bold">
                    {r.batch}
                  </td>
                  <td className="px-4 py-2 text-center text-zinc-500 text-xs">
                    {r.collectionDate}
                  </td>

                  {/* Printed Status Badge */}
                  <td className="px-4 py-2 text-center">
                    {r.printed ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePrinted(r.id || '', false);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                        title="Laudo já impresso. Clique para marcar como Pendente."
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Impresso
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePrinted(r.id || '', true);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                        title="Laudo pendente de impressão. Clique para marcar como Impresso."
                      >
                        <Clock className="h-3 w-3 text-amber-600" /> Pendente
                      </button>
                    )}
                  </td>

                  <td className="px-4 py-2 text-right flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {confirmDeleteId === r.id ? (
                      <div
                        className="flex items-center gap-1 bg-red-50 p-1 rounded-md border border-red-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleDelete(r.id || '')}
                          disabled={saving}
                          className="text-[9px] bg-red-600 text-white px-2 py-1 rounded font-bold shadow-sm cursor-pointer"
                        >
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'SIM'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[9px] bg-white border border-zinc-300 text-zinc-600 px-2 py-1 rounded font-bold hover:bg-zinc-50 cursor-pointer"
                        >
                          NÃO
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(r.id || null);
                        }}
                        className="text-zinc-400 p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrint(r);
                      }}
                      className="text-zinc-400 p-1.5 rounded-md hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
                      title="Imprimir laudo"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
