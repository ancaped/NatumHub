import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Product, Report, MicrobioAppConfig as AppConfig } from '../../types';
import { Plus, X, Save, Loader2 } from 'lucide-react';
import { cn } from '../../lib/microbioUtils';

const formatDateBR = (dateStr: string) => {
  try {
    const [year, month, day] = dateStr.split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
    return dateStr;
  } catch {
    return dateStr;
  }
};

interface ReportCreationFlowProps {
  products: Product[];
  config: AppConfig | null;
  technicianName: string;
  setTechnicianName: (v: string) => void;
  dailyDate: string;
  setDailyDate: (v: string) => void;
  onReportGenerated: (reports: Report[]) => void;
}

export function ReportCreationFlow({
  products,
  config,
  technicianName,
  setTechnicianName,
  dailyDate,
  setDailyDate,
  onReportGenerated,
}: ReportCreationFlowProps) {
  const [entries, setEntries] = useState<{ id: number; code: string; batch: string }[]>([
    { id: Date.now(), code: '', batch: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

  const addEntry = () => setEntries([...entries, { id: Date.now(), code: '', batch: '' }]);

  const updateEntry = (id: number, field: 'code' | 'batch', value: string) => {
    if (field === 'code') {
      const normalizedInput = normalizeCode(value);
      if (normalizedInput.length >= 4) {
        const foundProduct = products.find((p) => normalizeCode(p.code) === normalizedInput);
        if (foundProduct) {
          setEntries(entries.map((e) => (e.id === id ? { ...e, code: foundProduct.code } : e)));
          return;
        }
      }
    }
    setEntries(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const removeEntry = (id: number) => entries.length > 1 && setEntries(entries.filter((e) => e.id !== id));

  const handleSaveBatch = async () => {
    if (!config) return;
    setSaving(true);
    try {
      let currentNum = config.nextReportNumber;
      const validEntries = entries.filter((e) => e.code && e.batch && products.some((p) => p.code === e.code));
      const generatedReports: Report[] = [];

      for (const entry of validEntries) {
        const product = products.find((p) => p.code === entry.code)!;
        const reportId = `${currentNum}/${config.currentYear % 100}`;
        const reportData: Report = {
          id: reportId.replace('/', '-'),
          reportId,
          reportRawNum: currentNum,
          productCode: product.code,
          productName: product.name,
          batch: entry.batch,
          collectionDate: formatDateBR(dailyDate),
          technician: technicianName,
          createdAt: new Date().toISOString(),
        };
        generatedReports.push(reportData);
        currentNum++;
      }

      await api.saveReports(generatedReports);
      const updatedConfig = { ...config, nextReportNumber: currentNum };
      await api.saveConfig(updatedConfig);

      setEntries([{ id: Date.now(), code: '', batch: '' }]);

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20 px-4 lg:px-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-md border border-zinc-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-tight">Configurações do Lote</h2>
          <p className="text-xs text-zinc-500">Defina os parâmetros para as amostras processadas.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Data de Coleta</label>
            <input
              type="date"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              className="bg-white border border-zinc-300 rounded-md px-3 py-1.5 text-sm font-medium focus:border-zinc-800 focus:ring-1 focus:ring-zinc-800 outline-none text-zinc-900"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Técnico Responsável</label>
            <input
              type="text"
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              className="bg-white border border-zinc-300 rounded-md px-3 py-1.5 text-sm font-medium focus:border-zinc-800 focus:ring-1 focus:ring-zinc-800 outline-none text-zinc-900"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="px-4 flex items-center text-[10px] font-bold uppercase text-zinc-400 tracking-widest">
          <span className="w-48">Código do Item</span>
          <span className="flex-1 px-4 text-center">Descrição do Produto</span>
          <span className="w-48 text-right pr-12">Número do Lote</span>
        </div>

        {entries.map((entry) => {
          const product = products.find((p) => p.code === entry.code);
          return (
            <div
              key={entry.id}
              className="group relative flex flex-col md:flex-row items-center gap-2 rounded-md bg-white p-2 border border-zinc-200 hover:border-zinc-300 transition-colors"
            >
              <div className="w-full md:w-48">
                <input
                  list="codes"
                  value={entry.code}
                  onChange={(e) => updateEntry(entry.id, 'code', e.target.value)}
                  placeholder="Código"
                  className={cn(
                    "w-full bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:border-zinc-800 focus:ring-1 focus:ring-zinc-800 transition-colors",
                    entry.code && !product ? "border-red-300 text-red-600" : "text-zinc-900"
                  )}
                />
                <datalist id="codes">
                  {products.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div className="flex-1 w-full px-3 py-2 flex items-center text-sm text-zinc-700 bg-zinc-50 border border-zinc-200 rounded-md truncate">
                {product ? product.name : entry.code ? 'Produto não localizado' : 'Aguardando Código...'}
              </div>
              <div className="w-full md:w-48">
                <input
                  value={entry.batch}
                  onChange={(e) => updateEntry(entry.id, 'batch', e.target.value)}
                  placeholder="Nº do Lote"
                  className="w-full bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-bold text-zinc-900 focus:outline-none focus:border-zinc-800 focus:ring-1 focus:ring-zinc-800 transition-colors text-right"
                />
              </div>
              <button
                onClick={() => removeEntry(entry.id)}
                className="p-2 text-zinc-400 hover:text-red-600 transition-colors shrink-0 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          onClick={addEntry}
          className="flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Item Adicional
        </button>
        <button
          onClick={handleSaveBatch}
          disabled={saving || entries.every((e) => !e.code || !e.batch)}
          className="flex-1 rounded-md bg-zinc-900 px-4 py-2.5 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-zinc-800 disabled:bg-zinc-400 transition-colors cursor-pointer"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Processar e Salvar Lote ({entries.filter((e) => e.code && e.batch).length})
        </button>
      </div>
    </div>
  );
}
