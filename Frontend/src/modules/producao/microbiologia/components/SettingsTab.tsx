import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { MicrobioAppConfig as AppConfig, TemplateConfig, Report } from '../../../geral/lib/types';
import { Loader2, Save, Database, X, Calendar, Layers, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LAB_NAME, DEPT_NAME, COMPANY_INFO, DEFAULT_TESTS, cn } from '../../../geral/lib/microbioUtils';
import { getAllMonthRangesSummary } from '../../../geral/lib/reportNumberUtils';

interface SettingsTabProps {
  config: AppConfig | null;
  reports?: Report[];
  onRefresh?: () => void;
}

export function SettingsTab({ config, reports = [], onRefresh }: SettingsTabProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [nextNum, setNextNum] = useState<number>(config?.nextReportNumber || 0);
  const [currYear, setCurrYear] = useState<number>(config?.currentYear || 2026);

  const getDefaultTemplate = (): TemplateConfig => ({
    labName: LAB_NAME,
    deptName: DEPT_NAME,
    companyName: COMPANY_INFO.name,
    companyAddress: COMPANY_INFO.address,
    companyEmail: COMPANY_INFO.email,
    companyContact: COMPANY_INFO.contact,
    sampleType: COMPANY_INFO.sampleType,
    technicianSignName: 'Rafael Marinho de Melo',
    technicianSignTitle: 'Responsável Técnico',
    defaultTests: JSON.parse(JSON.stringify(DEFAULT_TESTS)), // Deep copy
  });

  const [template, setTemplate] = useState<TemplateConfig>(getDefaultTemplate());
  const [prevConfigTemplate, setPrevConfigTemplate] = useState<string>('');

  useEffect(() => {
    if (config) {
      if (config.template) {
        const templateStr = JSON.stringify(config.template);
        if (templateStr !== prevConfigTemplate) {
          setTemplate(config.template);
          setPrevConfigTemplate(templateStr);
        }
      }
      setNextNum(config.nextReportNumber);
      setCurrYear(config.currentYear);
    }
  }, [config, prevConfigTemplate]);

  const monthSummaries = useMemo(() => {
    return getAllMonthRangesSummary(reports, currYear);
  }, [reports, currYear]);

  const handleUpdate = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.saveMicrobioConfig({
        ...config,
        template,
        nextReportNumber: nextNum,
        currentYear: currYear,
      });
      setMessage({ text: 'Configurações e Sequência gravadas com sucesso!', type: 'success' });
      setTimeout(() => setMessage(null), 4000);
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error('Erro detalhado ao atualizar config:', error);
      setMessage({ text: `Erro ao salvar: ${error.message || 'Verifique sua conexão'}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const handleReset = () => {
    setTemplate(getDefaultTemplate());
    setShowConfirmReset(false);
    setMessage({ text: 'Valores padrão carregados nos campos. Clique em SALVAR para confirmar.', type: 'success' });
    setTimeout(() => setMessage(null), 6000);
  };

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-zinc-800" />
        <p className="text-zinc-500 font-medium animate-pulse">Carregando configurações do sistema...</p>
      </div>
    );
  }

  return (
    <div className="view-container animate-in fade-in duration-200">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4"
          >
            <div
              className={cn(
                'px-6 py-4 rounded-2xl shadow-2xl border text-sm font-bold flex items-center justify-between',
                message.type === 'success'
                  ? 'bg-zinc-900 border-zinc-700 text-white'
                  : 'bg-red-600 border-red-500 text-white',
              )}
            >
              <span>{message.text}</span>
              <button onClick={() => setMessage(null)} className="text-white/60 hover:text-white cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="view-header">
        <h2 className="view-title">Configurações do Módulo</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Gerencie o modelo do laudo e acompanhe a reserva de numeração mensal sequencial.
        </p>
      </div>

      {/* Faixas Mensais Reservadas */}
      <div className="panel-card text-left mb-6">
        <div className="flex items-start justify-between mb-4 flex-col sm:flex-row gap-2">
          <div>
            <h3 className="text-base font-bold text-zinc-800 flex items-center gap-2">
              <Layers className="h-4 w-4 text-zinc-600" />
              <span>Reserva de Numeração por Mês ({currYear})</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Cada mês possui um bloco exclusivo de numeração reservada. Ao lançar qualquer lote de meses anteriores ou futuros, a sequência do respectivo mês é mantida intacta.
            </p>
          </div>
        </div>

        <div className="table-card overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Mês</th>
                <th className="px-4 py-2.5 text-center">Faixa Reservada</th>
                <th className="px-4 py-2.5 text-center">Reserva Total</th>
                <th className="px-4 py-2.5 text-center">Laudos Emitidos</th>
                <th className="px-4 py-2.5 text-center">Próximo Laudo</th>
                <th className="px-4 py-2.5 text-center">Restantes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-sans">
              {monthSummaries.map((m) => {
                const isCurrentOrFuture = m.month >= 6;
                return (
                  <tr
                    key={m.month}
                    className={`hover:bg-zinc-50 transition-colors ${
                      m.count > 0 ? 'bg-white font-medium' : 'bg-zinc-50/50 text-zinc-400'
                    }`}
                  >
                    <td className="px-4 py-2 font-bold text-zinc-800 flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                      <span>{m.monthName} / {m.year}</span>
                      {m.count > 0 && (
                        <span className="text-[9px] bg-zinc-100 text-zinc-600 px-1.5 py-0.2 rounded font-mono font-bold">
                          Ativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center font-mono font-bold text-zinc-700">
                      {m.startNumber} – {m.endNumber}
                    </td>
                    <td className="px-4 py-2 text-center text-zinc-500">
                      {m.reservedCount} lotes
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        m.count > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-zinc-400'
                      }`}>
                        {m.count}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center font-mono font-black text-zinc-900">
                      {m.nextReportId}
                    </td>
                    <td className="px-4 py-2 text-center text-zinc-500 font-mono">
                      {m.remaining}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-card text-left">
        <div className="flex items-center justify-between mb-8 flex-col sm:flex-row gap-4">
          <div>
            <h3 className="text-base font-bold text-zinc-800">Modelo do Relatório</h3>
          </div>
          <div className="flex gap-4 items-center">
            {showConfirmReset ? (
              <div className="flex items-center gap-2 bg-amber-50 p-2 rounded-xl border border-amber-200 animate-in zoom-in-95 duration-200">
                <span className="text-[10px] font-black text-amber-700 uppercase px-2">Certeza?</span>
                <button
                  onClick={handleReset}
                  className="text-[10px] bg-amber-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm cursor-pointer"
                >
                  SIM
                </button>
                <button
                  onClick={() => setShowConfirmReset(false)}
                  className="text-[10px] bg-zinc-200 text-zinc-600 px-3 py-1.5 rounded-lg font-bold cursor-pointer"
                >
                  NÃO
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowConfirmReset(true)}
                className="text-[10px] font-bold text-zinc-400 hover:text-zinc-800 uppercase tracking-widest transition-colors flex items-center gap-2 cursor-pointer border-none bg-transparent"
              >
                Restaurar Padrões <Database className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                Laboratório
              </label>
              <input
                type="text"
                value={template.labName}
                onChange={(e) => setTemplate({ ...template, labName: e.target.value })}
                className="search-input font-bold"
                style={{ paddingLeft: '0.75rem' }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                Departamento
              </label>
              <input
                type="text"
                value={template.deptName}
                onChange={(e) => setTemplate({ ...template, deptName: e.target.value })}
                className="search-input font-bold"
                style={{ paddingLeft: '0.75rem' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                Empresa
              </label>
              <input
                type="text"
                value={template.companyName}
                onChange={(e) => setTemplate({ ...template, companyName: e.target.value })}
                className="search-input font-bold"
                style={{ paddingLeft: '0.75rem' }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                Tipo da Amostra
              </label>
              <input
                type="text"
                value={template.sampleType}
                onChange={(e) => setTemplate({ ...template, sampleType: e.target.value })}
                className="search-input font-bold"
                style={{ paddingLeft: '0.75rem' }}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
              Endereço da Empresa
            </label>
            <input
              type="text"
              value={template.companyAddress}
              onChange={(e) => setTemplate({ ...template, companyAddress: e.target.value })}
              className="search-input font-medium"
              style={{ paddingLeft: '0.75rem' }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                Email
              </label>
              <input
                type="text"
                value={template.companyEmail}
                onChange={(e) => setTemplate({ ...template, companyEmail: e.target.value })}
                className="search-input font-medium"
                style={{ paddingLeft: '0.75rem' }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                Contato
              </label>
              <input
                type="text"
                value={template.companyContact}
                onChange={(e) => setTemplate({ ...template, companyContact: e.target.value })}
                className="search-input font-medium"
                style={{ paddingLeft: '0.75rem' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                Técnico de Coleta / Preparo Padrão
              </label>
              <input
                type="text"
                value={template.defaultTechnician || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setTemplate({ ...template, defaultTechnician: val });
                  try {
                    localStorage.setItem('natum_hub_microbio_technician', val);
                  } catch (_) {}
                }}
                placeholder="Ex: EDSON FERRARI"
                className="search-input font-bold"
                style={{ paddingLeft: '0.75rem' }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                Nome do Signatário (Responsável)
              </label>
              <input
                type="text"
                value={template.technicianSignName}
                onChange={(e) => setTemplate({ ...template, technicianSignName: e.target.value })}
                className="search-input font-bold"
                style={{ paddingLeft: '0.75rem' }}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                Cargo do Signatário
              </label>
              <input
                type="text"
                value={template.technicianSignTitle}
                onChange={(e) => setTemplate({ ...template, technicianSignTitle: e.target.value })}
                className="search-input font-bold"
                style={{ paddingLeft: '0.75rem' }}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleUpdate}
            disabled={saving}
            className="btn-primary flex items-center gap-2 cursor-pointer"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Configurações
          </button>
        </div>
      </div>
    </div>
  );
}
