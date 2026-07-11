import React, { useState, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { Report } from '../../../geral/lib/types';
import { Search, Trash2, Printer, Loader2, ListChecks, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../geral/lib/microbioUtils';
import { motion } from 'motion/react';

interface ReportHistoryProps {
  reports: Report[];
  onPrint: (r: Report | Report[]) => void;
  selectedIds: Set<string>;
  onToggle: (id: string, shift: boolean, ctrl: boolean) => void;
  onRefresh?: () => void;
}

export function ReportHistory({ reports, onPrint, selectedIds, onToggle, onRefresh }: ReportHistoryProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sortKey, setSortKey] = useState<'reportRawNum' | 'productName' | 'batch' | 'collectionDate'>('reportRawNum');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: 'reportRawNum' | 'productName' | 'batch' | 'collectionDate') => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: 'reportRawNum' | 'productName' | 'batch' | 'collectionDate' }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-zinc-300" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-zinc-700" />
    ) : (
      <ArrowDown className="h-3 w-3 text-zinc-700" />
    );
  };

  const filteredReports = reports.filter((r) => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesId = (r.reportId || '').toLowerCase().includes(search);
      const matchesName = (r.productName || '').toLowerCase().includes(search);
      const matchesBatch = (r.batch || '').toLowerCase().includes(search);
      if (!matchesId && !matchesName && !matchesBatch) return false;
    }

    if (!startDate && !endDate) return true;

    // Convert DD/MM/YYYY to YYYY-MM-DD for comparison
    const parts = (r.collectionDate || '').split('/');
    if (parts.length !== 3) return true;
    const reportDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

    if (startDate && reportDate < startDate) return false;
    if (endDate && reportDate > endDate) return false;

    return true;
  });

  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a, b) => {
      if (sortKey === 'collectionDate') {
        const partsA = a.collectionDate.split('/');
        const partsB = b.collectionDate.split('/');
        const dateA = partsA.length === 3 ? `${partsA[2]}-${partsA[1]}-${partsA[0]}` : '';
        const dateB = partsB.length === 3 ? `${partsB[2]}-${partsB[1]}-${partsB[0]}` : '';
        return sortDir === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      }
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = (aVal as number) || 0;
      const bNum = (bVal as number) || 0;
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }, [filteredReports, sortKey, sortDir]);

  const selectedList = sortedReports.filter((r) => selectedIds.has(r.id || ''));

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

  const handleBulkImport = async () => {
    try {
      const lines = importText.split('\n').filter((l) => l.trim());
      const reportsToSave: Report[] = [];
      lines.forEach((line) => {
        const [repId, pCode, pName, batchNum, date, tech] = line.split('\t').map((s) => s.trim());
        if (repId && pName && batchNum) {
          const rawNum = parseInt(repId.split('/')[0]);
          reportsToSave.push({
            id: repId.replace('/', '-'),
            reportId: repId,
            reportRawNum: rawNum || 0,
            productCode: pCode || '0',
            productName: pName,
            batch: batchNum,
            collectionDate: date || format(new Date(), 'dd/MM/yyyy'),
            technician: tech || 'SISTEMA',
            createdAt: new Date().toISOString(),
          });
        }
      });
      await api.saveReports(reportsToSave);
      setShowImport(false);
      setImportText('');
      if (onRefresh) onRefresh();
      alert('Relatórios importados!');
    } catch (e) {
      console.error(e);
      alert('Erro na importação. Use colunas tabuladas.');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-20 px-4 lg:px-6 animate-in fade-in duration-200">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-800">Logs de Qualidade</h1>
          <p className="text-xs text-zinc-500 font-medium">{reports.length} laudos no sistema.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-zinc-300 px-3 py-1.5 rounded-md">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Pesquisar laudo, produto ou lote..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs font-semibold outline-none w-64 bg-transparent text-zinc-900"
            />
          </div>
          <div className="flex items-center gap-2 bg-white border border-zinc-300 px-3 py-1.5 rounded-md">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">De:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs font-semibold outline-none text-zinc-900 bg-white"
            />
            <label className="text-[10px] font-bold text-zinc-500 uppercase ml-2">Até:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs font-semibold outline-none text-zinc-900 bg-white"
            />
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="bg-white border border-zinc-300 px-4 py-1.5 rounded-md text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Importar
          </button>
          {selectedList.length > 0 && (
            <div className="flex gap-2">
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                {confirmBulkDelete ? (
                  <div className="flex items-center gap-2 bg-red-50 p-1.5 rounded-md border border-red-200">
                    <span className="text-[10px] font-black text-red-700 uppercase px-2">Excluir {selectedIds.size}?</span>
                    <button
                      onClick={handleBulkDelete}
                      disabled={saving}
                      className="text-[10px] bg-red-600 text-white px-3 py-1.5 rounded-md font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'SIM'}
                    </button>
                    <button
                      onClick={() => setConfirmBulkDelete(false)}
                      className="text-[10px] bg-white border border-zinc-300 text-zinc-700 px-3 py-1.5 rounded-md font-bold hover:bg-zinc-50 cursor-pointer"
                    >
                      NÃO
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmBulkDelete(true)}
                    className="bg-white text-red-600 border border-red-200 px-4 py-1.5 rounded-md font-semibold text-sm flex items-center gap-2 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir ({selectedList.length})
                  </button>
                )}
              </motion.div>
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                <button
                  onClick={() => onPrint(selectedList)}
                  className="bg-zinc-900 text-white px-4 py-1.5 rounded-md font-semibold text-sm flex items-center gap-2 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <Printer className="h-4 w-4" /> Imprimir ({selectedList.length})
                </button>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 no-print">
          <div className="w-full max-w-2xl bg-white rounded-md p-6 shadow-sm border border-zinc-200">
            <h3 className="text-lg font-bold text-zinc-900 mb-1">Importar Laudos Antigos</h3>
            <p className="text-xs text-zinc-500 mb-4">Cole da planilha (Nº Laudo, Código, Nome, Lote, Data, Técnico):</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="6300/25	5.11.011	Shampoo...	202401	10/01/2025	Rafael"
              className="w-full h-48 bg-white border border-zinc-300 rounded-md p-3 font-mono text-xs focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none mb-4 text-zinc-900"
            />
            <div className="flex gap-2">
              <button
                onClick={handleBulkImport}
                className="flex-1 bg-zinc-900 text-white py-2 rounded-md text-sm font-medium hover:bg-zinc-800 cursor-pointer"
              >
                Importar
              </button>
              <button
                onClick={() => setShowImport(false)}
                className="px-4 border border-zinc-300 rounded-md text-sm font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-md border border-zinc-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
            <tr>
              <th className="px-4 py-3 w-10 text-center">
                <div className="h-3 w-3 border border-zinc-400 rounded-sm mx-auto" />
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
                  Data <SortIcon col="collectionDate" />
                </span>
              </th>
              <th className="px-4 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 font-sans">
            {sortedReports.map((r) => (
              <tr
                key={r.reportId}
                className={cn(
                  'hover:bg-zinc-50 transition-colors bg-white font-sans cursor-pointer group',
                  selectedIds.has(r.id || '') && 'bg-zinc-50'
                )}
                onClick={(e) => onToggle(r.id || '', e.shiftKey, e.ctrlKey || e.metaKey)}
              >
                <td className="px-4 py-2 text-center">
                  <div
                    className={cn(
                      'h-3 w-3 border rounded-sm transition-colors flex items-center justify-center mx-auto',
                      selectedIds.has(r.id || '') ? 'bg-zinc-900 border-zinc-900' : 'border-zinc-400'
                    )}
                  >
                    {selectedIds.has(r.id || '') && <ListChecks className="h-2 w-2 text-white" />}
                  </div>
                </td>
                <td className="px-4 py-2 font-bold text-zinc-900 text-center text-xs">{r.reportId}</td>
                <td className="px-4 py-2 text-zinc-900 font-medium truncate max-w-xs">{r.productName}</td>
                <td className="px-4 py-2 text-center text-zinc-500 font-mono text-xs font-bold">{r.batch}</td>
                <td className="px-4 py-2 text-center text-zinc-500 text-xs">{r.collectionDate}</td>
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
                    title="Imprimir"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
