import React, { useState, useRef, useEffect, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { Report, MicrobioAppConfig as AppConfig } from '../../../geral/lib/types';
import { loteLookupErrorMessage } from '../../lib/loteLookup';
import {
  Plus,
  X,
  Save,
  Loader2,
  Search,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Calendar,
  Sparkles,
  Clock,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { validateProductionDate } from '../../../geral/lib/brazilHolidays';
import {
  getNextReportNumberForDate,
  parseMonthYear,
  MONTH_NAMES_PT,
} from '../../../geral/lib/reportNumberUtils';

const DAILY_LIMIT = 15;

const formatDateBR = (dateStr: string) => {
  try {
    const [year, month, day] = dateStr.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return dateStr;
  } catch {
    return dateStr;
  }
};

const formatLoteDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return trimmed;
};

const toIsoDate = (dateBr?: string): string => {
  if (!dateBr) return '';
  const trimmed = dateBr.trim();
  const parts = trimmed.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      // DD/MM/YYYY -> YYYY-MM-DD
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  return '';
};

const toBrDate = (isoDate?: string): string => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
};

export type LoteEntry = {
  id: number;
  batch: string;
  code: string;
  productName: string;
  manufacturingDate?: string; // Data de Envase / Fabricação (DD/MM/AAAA)
  collectionDate?: string;    // Data de Coleta (DD/MM/AAAA)
  loading?: boolean;
  loteStatus?: string;
};

interface ReportCreationFlowProps {
  existingReports: Report[];
  config: AppConfig | null;
  technicianName: string;
  setTechnicianName: (v: string) => void;
  dailyDate: string;
  setDailyDate: (v: string) => void;
  onReportGenerated: (reports: Report[]) => void;
  onSaved?: () => void;
}

export function ReportCreationFlow({
  existingReports,
  config,
  technicianName,
  setTechnicianName,
  dailyDate,
  setDailyDate,
  onReportGenerated,
  onSaved,
}: ReportCreationFlowProps) {
  const [entries, setEntries] = useState<LoteEntry[]>(() => {
    try {
      const saved = localStorage.getItem('natum_hub_microbio_draft_entries');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}
    return [{ id: Date.now(), batch: '', code: '', productName: '' }];
  });

  const [saving, setSaving] = useState(false);
  const [loteHint, setLoteHint] = useState<string | null>(null);
  const debounceTimers = useRef<Record<number, any>>({});

  // Auto-save entries to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('natum_hub_microbio_draft_entries', JSON.stringify(entries));
    } catch (_) {}
  }, [entries]);

  const resetFormEntries = () => {
    const initial = [{ id: Date.now(), batch: '', code: '', productName: '' }];
    setEntries(initial);
    setLoteHint(null);
    try {
      localStorage.removeItem('natum_hub_microbio_draft_entries');
    } catch (_) {}
  };

  const hasDraftData = entries.some((e) => e.batch.trim() !== '' || e.code.trim() !== '' || e.productName.trim() !== '');

  const handleClearDraft = () => {
    if (hasDraftData) {
      if (!confirm('Deseja realmente limpar todos os lotes inseridos nesta tabela?')) {
        return;
      }
    }
    resetFormEntries();
  };

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  const defaultDateBR = formatDateBR(dailyDate);

  // Group and evaluate each entry in the form
  const evaluatedEntries = useMemo(() => {
    // Count how many valid items per date in the current form
    const dateCountsInForm: Record<string, number> = {};
    for (const entry of entries) {
      const targetDate = entry.collectionDate || defaultDateBR;
      if (entry.batch && entry.code) {
        dateCountsInForm[targetDate] = (dateCountsInForm[targetDate] || 0) + 1;
      }
    }

    const monthBatchOffsets: Record<string, number> = {};

    // Map each entry to its validation result and allocated monthly report number
    return entries.map((entry) => {
      const targetDate = entry.collectionDate || defaultDateBR;
      const my = parseMonthYear(targetDate);
      const myKey = `${my.year}-${my.month}`;
      const currentOffset = monthBatchOffsets[myKey] || 0;
      const allocated = getNextReportNumberForDate(targetDate, existingReports, currentOffset);

      if (!entry.batch || !entry.code) {
        return {
          ...entry,
          allocatedReportId: allocated.reportId,
          allocatedRawNum: allocated.rawNum,
          isBlocked: false,
          validationStatus: 'waiting' as const,
          statusMessage: 'Aguardando lote...',
        };
      }

      // 1. Validação de Lote Repetido (Regra: não permitir repetir o mesmo lote para o mesmo produto)
      const batchTrimmed = entry.batch.trim().toLowerCase();
      const codeTrimmed = entry.code.trim().toLowerCase();
      const existingReportWithBatch = (existingReports || []).find(
        (r) =>
          r.batch &&
          r.batch.trim().toLowerCase() === batchTrimmed &&
          (!codeTrimmed || !r.productCode || r.productCode.trim().toLowerCase() === codeTrimmed)
      );
      if (existingReportWithBatch) {
        return {
          ...entry,
          allocatedReportId: allocated.reportId,
          allocatedRawNum: allocated.rawNum,
          isBlocked: true,
          validationStatus: 'duplicate_batch' as const,
          statusMessage: `Lote já registrado no Laudo ${existingReportWithBatch.reportId || existingReportWithBatch.id} (${existingReportWithBatch.collectionDate || 'Histórico'})`,
        };
      }

      // Validação de duplicidade dentro do próprio formulário (linhas idênticas: mesmo lote e mesmo produto)
      const formDuplicateCount = entries.filter(
        (e) =>
          e.id !== entry.id &&
          e.batch &&
          e.batch.trim().toLowerCase() === batchTrimmed &&
          (!codeTrimmed || !e.code || e.code.trim().toLowerCase() === codeTrimmed)
      ).length;
      if (formDuplicateCount > 0) {
        return {
          ...entry,
          allocatedReportId: allocated.reportId,
          allocatedRawNum: allocated.rawNum,
          isBlocked: true,
          validationStatus: 'duplicate_batch' as const,
          statusMessage: 'Lote duplicado na lista atual',
        };
      }

      monthBatchOffsets[myKey] = currentOffset + 1;
      const dateVal = validateProductionDate(targetDate);

      if (dateVal.isBlocked) {
        return {
          ...entry,
          allocatedReportId: allocated.reportId,
          allocatedRawNum: allocated.rawNum,
          isBlocked: true,
          validationStatus: 'blocked_date' as const,
          statusMessage: dateVal.reason || 'Data bloqueada',
        };
      }

      // Check existing reports on that date
      const existingOnDate = (existingReports || []).filter(
        (r) => r.collectionDate === targetDate,
      ).length;
      const formCountForDate = dateCountsInForm[targetDate] || 0;
      const totalOnDate = existingOnDate + formCountForDate;

      if (existingOnDate >= DAILY_LIMIT) {
        return {
          ...entry,
          allocatedReportId: allocated.reportId,
          allocatedRawNum: allocated.rawNum,
          isBlocked: true,
          validationStatus: 'limit_reached' as const,
          statusMessage: `Limite atingido (${existingOnDate}/15)`,
        };
      }

      if (totalOnDate > DAILY_LIMIT) {
        return {
          ...entry,
          allocatedReportId: allocated.reportId,
          allocatedRawNum: allocated.rawNum,
          isBlocked: true,
          validationStatus: 'limit_exceeded' as const,
          statusMessage: `Excede 15 no dia (${totalOnDate}/15)`,
        };
      }

      return {
        ...entry,
        allocatedReportId: allocated.reportId,
        allocatedRawNum: allocated.rawNum,
        isBlocked: false,
        validationStatus: 'valid' as const,
        statusMessage: `Válido (${totalOnDate}/15 no dia)`,
      };
    });
  }, [entries, existingReports, defaultDateBR]);

  // Distinct dates and monthly summaries in current form
  const formDatesSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of evaluatedEntries) {
      if (item.batch && item.code) {
        const d = item.collectionDate || defaultDateBR;
        map.set(d, (map.get(d) || 0) + 1);
      }
    }

    return Array.from(map.entries()).map(([date, formCount]) => {
      const existingCount = (existingReports || []).filter((r) => r.collectionDate === date).length;
      const total = existingCount + formCount;
      const dateVal = validateProductionDate(date);
      const my = parseMonthYear(date);
      const monthName = MONTH_NAMES_PT[my.month - 1] || `Mês ${my.month}`;
      return {
        date,
        monthName,
        formCount,
        existingCount,
        total,
        isBlocked: dateVal.isBlocked || total > DAILY_LIMIT,
        reason: dateVal.reason,
      };
    });
  }, [evaluatedEntries, existingReports, defaultDateBR]);

  const addEntry = () => {
    setEntries((prev) => [...prev, { id: Date.now(), batch: '', code: '', productName: '' }]);
  };

  const searchLote = async (id: number, batchValue: string) => {
    const trimmed = (batchValue || '').trim();
    if (!trimmed) return;

    if (debounceTimers.current[id]) {
      clearTimeout(debounceTimers.current[id]);
      delete debounceTimers.current[id];
    }

    // Alerta se o lote já foi registrado em algum laudo
    let initialHint: string | null = null;
    const alreadySaved = (existingReports || []).find(
      (r) => r.batch && r.batch.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (alreadySaved) {
      initialHint = `Atenção: O lote ${trimmed} já possui laudo registrado: ${alreadySaved.reportId || alreadySaved.id} (${alreadySaved.productName || alreadySaved.productCode || alreadySaved.collectionDate || ''}).`;
    }

    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, loading: true } : e)));
    setLoteHint(initialHint);

    try {
      const lote = await api.getLoteByNumber(trimmed);
      if (lote?.products?.length) {
        if (lote.status && lote.status !== 'EA') {
          setLoteHint(
            `Lote ${trimmed}: status "${lote.statusLabel || lote.status}" — recomendado testar apenas lotes EA.`,
          );
        }

        // Puxa a data de envase (Coleta) e a data de pesagem (Fabricação) do lote no ERP
        const envaseDate = formatLoteDate(lote.dEnvase) || formatLoteDate(lote.date) || defaultDateBR;
        const fabricacaoDate = formatLoteDate(lote.dPesado) || formatLoteDate(lote.dLote) || envaseDate;

        setEntries((prev) => {
          const idx = prev.findIndex((e) => e.id === id);
          if (idx === -1) return prev;

          const firstProduct = lote.products[0];
          const updatedCurrent: LoteEntry = {
            id,
            batch: trimmed,
            code: firstProduct.productCode,
            productName: firstProduct.productDescription,
            manufacturingDate: fabricacaoDate,
            collectionDate: envaseDate,
            loteStatus: lote.status,
            loading: false,
          };

          const extraRows: LoteEntry[] = lote.products.slice(1).map((p, i) => ({
            id: Date.now() + i + 1,
            batch: trimmed,
            code: p.productCode,
            productName: p.productDescription,
            manufacturingDate: fabricacaoDate,
            collectionDate: envaseDate,
            loteStatus: lote.status,
            loading: false,
          }));

          if (lote.products.length > 1) {
            setLoteHint(
              `Lote ${trimmed} contém ${lote.products.length} produtos (gramaturas diferentes). Linhas criadas automaticamente.`,
            );
          }
          return [...prev.slice(0, idx), updatedCurrent, ...extraRows, ...prev.slice(idx + 1)];
        });
        return;
      }

      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                code: '',
                productName: '',
                manufacturingDate: '',
                collectionDate: '',
                loading: false,
              }
            : e,
        ),
      );
      setLoteHint(`Lote "${trimmed}" não encontrado. Confira o número ou rode o Sync ERP.`);
    } catch (err) {
      console.error('Error fetching lote:', err);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, loading: false } : e)));
      setLoteHint(loteLookupErrorMessage(err, trimmed));
    }
  };

  const handleBatchChange = (id: number, value: string) => {
    setLoteHint(null);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              batch: value,
              ...(value.trim().length === 0
                ? { code: '', productName: '', manufacturingDate: '', collectionDate: '' }
                : {}),
            }
          : e,
      ),
    );

    if (debounceTimers.current[id]) {
      clearTimeout(debounceTimers.current[id]);
      delete debounceTimers.current[id];
    }

    const trimmed = value.trim();
    if (trimmed.length >= 3) {
      debounceTimers.current[id] = setTimeout(() => {
        searchLote(id, trimmed);
      }, 800);
    }
  };

  const handleDateChange = (id: number, isoValue: string) => {
    const brValue = toBrDate(isoValue);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              collectionDate: brValue,
            }
          : e,
      ),
    );
  };

  const handleMfgDateChange = (id: number, isoValue: string) => {
    const brValue = toBrDate(isoValue);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              manufacturingDate: brValue,
            }
          : e,
      ),
    );
  };

  const removeEntry = (id: number) => {
    if (debounceTimers.current[id]) {
      clearTimeout(debounceTimers.current[id]);
      delete debounceTimers.current[id];
    }
    entries.length > 1 && setEntries(entries.filter((e) => e.id !== id));
  };

  const validEntries = evaluatedEntries.filter((e) => e.batch && e.code && e.productName);
  const blockedEntries = validEntries.filter((e) => e.isBlocked);
  const canSave = validEntries.length > 0 && blockedEntries.length === 0;

  const handleSaveBatch = async () => {
    if (!config) return;

    if (validEntries.length === 0) {
      alert('Nenhum lote válido para processar.');
      return;
    }

    if (blockedEntries.length > 0) {
      alert(
        `Não é possível processar: existem ${blockedEntries.length} lote(s) bloqueados por regras de calendário ou limite de 15 laudos por dia.`,
      );
      return;
    }

    setSaving(true);
    try {
      const generatedReports: Report[] = [];
      const monthBatchOffsets: Record<string, number> = {};

      for (const entry of validEntries) {
        const targetDate = entry.collectionDate || defaultDateBR;
        const finalMfgDate = entry.manufacturingDate || targetDate;
        const my = parseMonthYear(targetDate);
        const myKey = `${my.year}-${my.month}`;
        const currentOffset = monthBatchOffsets[myKey] || 0;
        const allocated = getNextReportNumberForDate(targetDate, existingReports, currentOffset);
        monthBatchOffsets[myKey] = currentOffset + 1;

        generatedReports.push({
          id: `${allocated.rawNum}-${allocated.year % 100}`,
          reportId: allocated.reportId,
          reportRawNum: allocated.rawNum,
          productCode: entry.code,
          productName: entry.productName,
          batch: entry.batch,
          collectionDate: targetDate,
          manufacturingDate: finalMfgDate,
          technician: technicianName,
          createdAt: new Date().toISOString(),
          printed: false,
        });
      }

      await api.saveReports(generatedReports);

      resetFormEntries();
      if (onSaved) onSaved();

      if (confirm(`${validEntries.length} relatórios gerados com sucesso! Deseja imprimir todos agora?`)) {
        onReportGenerated(generatedReports);
      }
    } catch (error: any) {
      console.error('Erro ao salvar lote:', error);
      alert(`Erro ao salvar lote: ${error?.message || error || 'Falha na requisição'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="view-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="view-title flex items-center gap-2">
            <span>Gerar Laudos</span>
            <span className="text-[11px] font-bold bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-full border border-zinc-200">
              Reserva Mensal Sequencial
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Ao digitar o lote, o laudo é atribuído automaticamente na faixa sequencial do seu respectivo mês de envase.
          </p>
        </div>
      </div>

      {/* Monthly Tags & Dates Summary */}
      {formDatesSummary.length > 0 && (
        <div className="toolbar-section flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
            Capacidade Diária por Mês ({DAILY_LIMIT} laudos/dia):
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {formDatesSummary.map((s) => (
              <div
                key={s.date}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                  s.isBlocked
                    ? 'bg-red-50 text-red-800 border-red-200'
                    : s.total >= 11
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
                title={s.reason || `${s.existingCount} laudos gravados + ${s.formCount} na tabela atual`}
              >
                <Calendar className="h-3 w-3" />
                <span>{s.date} ({s.monthName}):</span>
                <span>
                  {s.total}/{DAILY_LIMIT} no dia
                </span>
                {s.isBlocked && <AlertTriangle className="h-3 w-3 text-red-600 ml-0.5" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {loteHint && <div className="info-note-card text-sm mb-3">{loteHint}</div>}

      {/* Main Form Table / Card List */}
      <div className="table-card overflow-hidden">
        {/* Desktop Table Header */}
        <div className="hidden md:flex px-4 py-3 border-b border-zinc-200 bg-zinc-50 items-center text-[10px] font-bold uppercase text-zinc-500 tracking-wider gap-3">
          <span className="w-24 text-center">Nº Laudo</span>
          <span className="w-32">Lote ERP</span>
          <span className="w-24">Código</span>
          <span className="flex-1">Produto</span>
          <span className="w-32 text-center" title="Data de Fabricação / Pesagem (ERP)">Data Fab.</span>
          <span className="w-32 text-center" title="Data de Envase / Coleta (ERP)">Data Envase</span>
          <span className="w-44 text-center">Status Validação</span>
          <span className="w-8" />
        </div>

        {/* Desktop Rows (hidden on mobile) */}
        <div className="hidden md:block divide-y divide-zinc-100">
          {evaluatedEntries.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-center gap-2 p-3 transition-colors ${
                entry.isBlocked ? 'bg-red-50/40' : 'bg-white'
              }`}
            >
              {/* Allocated Monthly Report ID */}
              <div className="w-24 text-center">
                <span
                  className="font-mono text-xs font-black px-2 py-1 rounded bg-zinc-900 text-white shadow-xs inline-block min-w-[64px]"
                  title="Número sequencial de laudo alocado automaticamente"
                >
                  {entry.allocatedReportId}
                </span>
              </div>

              {/* Lote Input */}
              <div className="w-32 relative">
                <input
                  value={entry.batch}
                  onChange={(e) => handleBatchChange(entry.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchLote(entry.id, entry.batch);
                    }
                  }}
                  onBlur={() => {
                    if (entry.batch.trim().length >= 2 && !entry.code) {
                      searchLote(entry.id, entry.batch);
                    }
                  }}
                  placeholder="Nº do lote..."
                  className="search-input font-bold pr-8"
                  style={{ paddingLeft: '0.75rem' }}
                />
                {entry.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400 absolute right-2 top-2.5" />
                ) : (
                  <button
                    type="button"
                    onClick={() => searchLote(entry.id, entry.batch)}
                    className="absolute right-2 top-2.5 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                    title="Buscar lote no ERP (ou pressione Enter)"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Product Code */}
              <div className="w-24 px-2 py-2 text-xs font-mono font-bold text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-md text-center truncate">
                {entry.code || '—'}
              </div>

              {/* Product Name */}
              <div
                className="flex-1 px-3 py-2 text-xs text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-md truncate font-medium min-w-0"
                title={entry.productName}
              >
                {entry.productName ||
                  (entry.batch.trim().length >= 3 ? 'Lote não encontrado' : 'Aguardando lote...')}
              </div>

              {/* Editable Manufacturing Date (Pesagem) */}
              <div className="w-32 relative">
                <input
                  type="date"
                  value={toIsoDate(entry.manufacturingDate)}
                  onChange={(e) => handleMfgDateChange(entry.id, e.target.value)}
                  className={`w-full px-2 py-1.5 text-xs font-mono font-bold rounded-md border text-center outline-none transition-colors cursor-pointer ${
                    entry.manufacturingDate
                      ? 'bg-white text-zinc-900 border-zinc-300 focus:border-zinc-800'
                      : 'bg-zinc-50 text-zinc-400 border-zinc-200 focus:border-zinc-400'
                  }`}
                  title="Data de Fabricação / Pesagem (puxada do ERP, editável manualmente)"
                />
              </div>

              {/* Editable Envase Date (Coleta) */}
              <div className="w-32 relative">
                <input
                  type="date"
                  value={toIsoDate(entry.collectionDate)}
                  onChange={(e) => handleDateChange(entry.id, e.target.value)}
                  className={`w-full px-2 py-1.5 text-xs font-mono font-bold rounded-md border text-center outline-none transition-colors cursor-pointer ${
                    entry.collectionDate
                      ? 'bg-white text-zinc-900 border-zinc-300 focus:border-zinc-800'
                      : 'bg-zinc-50 text-zinc-400 border-zinc-200 focus:border-zinc-400'
                  }`}
                  title="Data de Envase / Coleta (puxada do ERP, editável manualmente)"
                />
              </div>

              {/* Validation Status Badge */}
              <div className="w-44">
                <div
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-md border flex items-center justify-center gap-1.5 truncate ${
                    entry.validationStatus === 'valid'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : entry.validationStatus === 'blocked_date' ||
                        entry.validationStatus === 'limit_reached' ||
                        entry.validationStatus === 'limit_exceeded' ||
                        entry.validationStatus === 'duplicate_batch'
                      ? 'bg-red-50 text-red-800 border-red-200'
                      : 'bg-zinc-50 text-zinc-400 border-zinc-200'
                  }`}
                  title={entry.statusMessage}
                >
                  {entry.validationStatus === 'valid' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  ) : entry.isBlocked ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  )}
                  <span className="truncate">{entry.statusMessage}</span>
                </div>
              </div>

              {/* Delete row button */}
              <button
                onClick={() => removeEntry(entry.id)}
                className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors shrink-0 cursor-pointer"
                title="Remover linha"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Mobile Cards (md:hidden) */}
        <div className="md:hidden divide-y divide-zinc-200">
          {evaluatedEntries.map((entry) => (
            <div
              key={entry.id}
              className={`p-3.5 space-y-3 transition-colors ${
                entry.isBlocked ? 'bg-red-50/50' : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Laudo:</span>
                  <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-zinc-900 text-white shadow-xs">
                    {entry.allocatedReportId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeEntry(entry.id)}
                  className="p-1 text-zinc-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                  title="Remover este lote"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Nº Lote ERP
                  </label>
                  <div className="relative">
                    <input
                      value={entry.batch}
                      onChange={(e) => handleBatchChange(entry.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          searchLote(entry.id, entry.batch);
                        }
                      }}
                      onBlur={() => {
                        if (entry.batch.trim().length >= 2 && !entry.code) {
                          searchLote(entry.id, entry.batch);
                        }
                      }}
                      placeholder="Digite o nº do lote..."
                      className="search-input font-bold pr-9 w-full"
                      style={{ paddingLeft: '0.75rem' }}
                    />
                    {entry.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-zinc-400 absolute right-2.5 top-2.5" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => searchLote(entry.id, entry.batch)}
                        className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                        title="Buscar no ERP"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Produto Código e Nome */}
                <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-2.5 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Código:</span>
                    <span className="font-mono text-xs font-bold text-zinc-800">{entry.code || '—'}</span>
                  </div>
                  <p className="text-xs font-semibold text-zinc-800 truncate">
                    {entry.productName || (entry.batch.trim().length >= 3 ? 'Lote não encontrado' : 'Aguardando lote...')}
                  </p>
                </div>

                {/* Datas (Fabricação e Envase) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                      Data Fab.
                    </label>
                    <input
                      type="date"
                      value={toIsoDate(entry.manufacturingDate)}
                      onChange={(e) => handleMfgDateChange(entry.id, e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono font-bold rounded-xl border border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                      Data Envase
                    </label>
                    <input
                      type="date"
                      value={toIsoDate(entry.collectionDate)}
                      onChange={(e) => handleDateChange(entry.id, e.target.value)}
                      className="w-full px-2 py-1.5 text-xs font-mono font-bold rounded-xl border border-zinc-300 bg-white text-zinc-900"
                    />
                  </div>
                </div>

                {/* Status de Validação */}
                <div
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-xl border flex items-center gap-1.5 ${
                    entry.validationStatus === 'valid'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : entry.isBlocked
                      ? 'bg-red-50 text-red-800 border-red-200'
                      : 'bg-zinc-50 text-zinc-400 border-zinc-200'
                  }`}
                >
                  {entry.validationStatus === 'valid' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  ) : entry.isBlocked ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  )}
                  <span className="truncate">{entry.statusMessage}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={addEntry}
            className="btn-secondary flex items-center justify-center gap-2 cursor-pointer flex-1 sm:flex-none"
          >
            <Plus className="h-4 w-4" /> Outro Lote
          </button>

          {hasDraftData && (
            <button
              onClick={handleClearDraft}
              className="px-3 py-2 text-xs font-bold text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Limpar todos os campos preenchidos"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Limpar Lista
            </button>
          )}
        </div>

        <button
          onClick={handleSaveBatch}
          disabled={saving || !canSave}
          className="btn-primary flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 w-full sm:flex-1"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Processar e Salvar ({validEntries.length})
        </button>
      </div>
    </div>
  );
}
