import React, { useState } from 'react';
import { api } from '../../../geral/lib/api';
import { Report, MicrobioAppConfig as AppConfig } from '../../../geral/lib/types';
import { loteLookupErrorMessage } from '../../lib/loteLookup';
import { Plus, X, Save, Loader2 } from 'lucide-react';

const formatDateBR = (dateStr: string) => {
  try {
    const [year, month, day] = dateStr.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return dateStr;
  } catch {
    return dateStr;
  }
};

type LoteEntry = {
  id: number;
  batch: string;
  code: string;
  productName: string;
  loading?: boolean;
  loteStatus?: string;
};

interface ReportCreationFlowProps {
  config: AppConfig | null;
  technicianName: string;
  setTechnicianName: (v: string) => void;
  dailyDate: string;
  setDailyDate: (v: string) => void;
  onReportGenerated: (reports: Report[]) => void;
}

export function ReportCreationFlow({
  config,
  technicianName,
  setTechnicianName,
  dailyDate,
  setDailyDate,
  onReportGenerated,
}: ReportCreationFlowProps) {
  const [entries, setEntries] = useState<LoteEntry[]>([
    { id: Date.now(), batch: '', code: '', productName: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [loteHint, setLoteHint] = useState<string | null>(null);

  const addEntry = () =>
    setEntries([...entries, { id: Date.now(), batch: '', code: '', productName: '' }]);

  const updateEntryBatch = async (id: number, value: string) => {
    setLoteHint(null);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, batch: value, ...(value.trim().length < 3 ? { code: '', productName: '' } : {}) }
          : e,
      ),
    );

    const trimmed = value.trim();
    if (trimmed.length < 3) return;

    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, loading: true } : e)));
    try {
      const lote = await api.getLoteByNumber(trimmed);
      if (lote?.products?.length) {
        if (lote.status && lote.status !== 'EA') {
          setLoteHint(
            `Lote ${trimmed}: status "${lote.statusLabel || lote.status}" — recomendado testar apenas lotes EA.`,
          );
        }
        setEntries((prev) => {
          const idx = prev.findIndex((e) => e.id === id);
          if (idx === -1) return prev;
          const newRows: LoteEntry[] = lote.products.map((p, i) => ({
            id: Date.now() + i,
            batch: trimmed,
            code: p.productCode,
            productName: p.productDescription,
            loteStatus: lote.status,
            loading: false,
          }));
          if (lote.products.length > 1) {
            setLoteHint(
              `Lote ${trimmed} contém ${lote.products.length} produtos (gramaturas diferentes). Uma linha por produto.`,
            );
          }
          return [...prev.slice(0, idx), ...newRows, ...prev.slice(idx + 1)];
        });
        return;
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, code: '', productName: '', loading: false } : e,
        ),
      );
      setLoteHint(`Lote "${trimmed}" não encontrado. Confira o número ou rode o Sync ERP.`);
    } catch (err) {
      console.error('Error fetching lote:', err);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, loading: false } : e)));
      setLoteHint(loteLookupErrorMessage(err, trimmed));
    }
  };

  const removeEntry = (id: number) =>
    entries.length > 1 && setEntries(entries.filter((e) => e.id !== id));

  const handleSaveBatch = async () => {
    if (!config) return;
    setSaving(true);
    try {
      let currentNum = config.nextReportNumber;
      const validEntries = entries.filter((e) => e.batch && e.code && e.productName);
      const generatedReports: Report[] = [];

      for (const entry of validEntries) {
        const reportId = `${currentNum}/${config.currentYear % 100}`;
        generatedReports.push({
          id: reportId.replace('/', '-'),
          reportId,
          reportRawNum: currentNum,
          productCode: entry.code,
          productName: entry.productName,
          batch: entry.batch,
          collectionDate: formatDateBR(dailyDate),
          technician: technicianName,
          createdAt: new Date().toISOString(),
        });
        currentNum++;
      }

      await api.saveReports(generatedReports);
      await api.saveMicrobioConfig({ ...config, nextReportNumber: currentNum });

      setEntries([{ id: Date.now(), batch: '', code: '', productName: '' }]);
      setLoteHint(null);

      if (confirm(`${validEntries.length} relatórios gerados! Deseja imprimir todos agora?`)) {
        onReportGenerated(generatedReports);
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar lote.');
    } finally {
      setSaving(false);
    }
  };

  const validCount = entries.filter((e) => e.code && e.batch).length;

  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="view-header">
        <h2 className="view-title">Gerar Laudos</h2>
      </div>

      {loteHint && (
        <div className="info-note-card text-sm">{loteHint}</div>
      )}

      <div className="toolbar-section">
        <div className="flex flex-wrap gap-4 flex-1">
          <div className="flex flex-col min-w-[160px]">
            <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Data de Coleta</label>
            <input
              type="date"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              className="search-input"
              style={{ paddingLeft: '0.75rem' }}
            />
          </div>
          <div className="flex flex-col flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Técnico Responsável</label>
            <input
              type="text"
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              className="search-input"
              style={{ paddingLeft: '0.75rem' }}
            />
          </div>
        </div>
        {config && (
          <div className="text-right shrink-0">
            <span className="text-[10px] font-bold text-zinc-400 uppercase">Próximo laudo</span>
            <div className="text-sm font-black text-zinc-900">
              {config.nextReportNumber}/{config.currentYear % 100}
            </div>
          </div>
        )}
      </div>

      <div className="table-card overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center text-[10px] font-bold uppercase text-zinc-500 tracking-wider gap-4">
          <span className="w-40">Lote ERP</span>
          <span className="w-32">Código</span>
          <span className="flex-1">Produto</span>
          <span className="w-10" />
        </div>

        <div className="divide-y divide-zinc-100">
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-col md:flex-row items-stretch md:items-center gap-2 p-3">
              <div className="w-full md:w-40 relative">
                <input
                  value={entry.batch}
                  onChange={(e) => updateEntryBatch(entry.id, e.target.value)}
                  placeholder="Nº do lote"
                  className="search-input font-bold"
                  style={{ paddingLeft: '0.75rem' }}
                />
                {entry.loading && (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400 absolute right-2 top-2.5" />
                )}
              </div>
              <div className="w-full md:w-32 px-3 py-2 text-sm font-mono font-bold text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-md text-center">
                {entry.code || '—'}
              </div>
              <div className="flex-1 px-3 py-2 text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-md truncate" title={entry.productName}>
                {entry.productName || (entry.batch.trim().length >= 3 ? 'Lote não encontrado' : 'Aguardando lote...')}
              </div>
              <button
                onClick={() => removeEntry(entry.id)}
                className="p-2 text-zinc-400 hover:text-red-600 transition-colors shrink-0 cursor-pointer self-end md:self-center"
                title="Remover linha"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={addEntry}
          className="btn-secondary flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Outro Lote
        </button>
        <button
          onClick={handleSaveBatch}
          disabled={saving || validCount === 0}
          className="btn-primary flex-1 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Processar e Salvar ({validCount})
        </button>
      </div>
    </div>
  );
}
