import React, { useState, useEffect } from 'react';
import { api } from '../../../geral/lib/api';
import { MicrobioAppConfig as AppConfig, TemplateConfig } from '../../../geral/lib/types';
import { Loader2, Save, Database, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'motion/react';
import { LAB_NAME, DEPT_NAME, COMPANY_INFO, DEFAULT_TESTS, cn } from '../../../geral/lib/microbioUtils';

interface SettingsTabProps {
  config: AppConfig | null;
  onRefresh?: () => void;
}

export function SettingsTab({ config, onRefresh }: SettingsTabProps) {
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
    <div className="space-y-8 max-w-7xl mx-auto pb-20 mt-4 px-4 lg:px-6 animate-in fade-in duration-200">
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
                message.type === 'success' ? 'bg-white text-green-600 border-green-200' : 'bg-white text-red-600 border-red-200'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn('h-2 w-2 rounded-full', message.type === 'success' ? 'bg-green-500' : 'bg-red-500')} />
                {message.text}
              </div>
              <button onClick={() => setMessage(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-md border border-zinc-200 shadow-sm p-8 relative overflow-hidden text-left">
        <div className="flex items-start justify-between mb-10 flex-col md:flex-row gap-4">
          <div>
            <h2 className="text-2xl font-black text-zinc-800 tracking-tight">Sequenciamento Automático</h2>
            <p className="text-sm text-zinc-500">Controle o número do próximo laudo a ser gerado.</p>
          </div>
          <div className="bg-zinc-50 border border-zinc-200 rounded-md p-4 flex gap-6 px-6 self-start md:self-auto">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Próximo Nº</span>
              <input
                type="number"
                value={nextNum}
                onChange={(e) => setNextNum(parseInt(e.target.value) || 0)}
                className="bg-white border border-zinc-300 rounded-md px-3 py-1.5 text-lg font-bold text-zinc-900 outline-none focus:border-zinc-800 w-24"
              />
            </div>
            <div className="flex flex-col border-l border-zinc-300 pl-6">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Ano Corrente</span>
              <input
                type="number"
                value={currYear}
                onChange={(e) => setCurrYear(parseInt(e.target.value) || 2026)}
                className="bg-white border border-zinc-300 rounded-md px-3 py-1.5 text-lg font-bold text-zinc-900 outline-none focus:border-zinc-800 w-24"
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-zinc-100 w-full mb-10" />

        <div className="flex items-center justify-between mb-10 flex-col sm:flex-row gap-4">
          <div>
            <h2 className="text-2xl font-black text-zinc-800 tracking-tight">Modelo do Relatório</h2>
            <p className="text-sm text-zinc-500">Personalize o cabeçalho e rodapé dos laudos impressos.</p>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Nome Comercial do Laboratório</label>
            <input
              value={template.labName || ''}
              onChange={(e) => setTemplate({ ...template, labName: e.target.value })}
              className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Departamento / Setor</label>
            <input
              value={template.deptName || ''}
              onChange={(e) => setTemplate({ ...template, deptName: e.target.value })}
              className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
            />
          </div>
          <div className="col-span-1 md:col-span-2 flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Razão Social da Empresa</label>
            <input
              value={template.companyName || ''}
              onChange={(e) => setTemplate({ ...template, companyName: e.target.value })}
              className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
            />
          </div>
          <div className="col-span-1 md:col-span-2 flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Endereço Completo</label>
            <input
              value={template.companyAddress || ''}
              onChange={(e) => setTemplate({ ...template, companyAddress: e.target.value })}
              className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-500">E-mail de Contato</label>
            <input
              value={template.companyEmail || ''}
              onChange={(e) => setTemplate({ ...template, companyEmail: e.target.value })}
              className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Telefone / WhatsApp</label>
            <input
              value={template.companyContact || ''}
              onChange={(e) => setTemplate({ ...template, companyContact: e.target.value })}
              className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
            />
          </div>
          <div className="col-span-1 md:col-span-2 flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Tipo Padrão de Amostra</label>
            <input
              value={template.sampleType || ''}
              onChange={(e) => setTemplate({ ...template, sampleType: e.target.value })}
              className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Assinatura: Nome do Responsável</label>
            <input
              value={template.technicianSignName || ''}
              onChange={(e) => setTemplate({ ...template, technicianSignName: e.target.value })}
              className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-500">Assinatura: Título / Cargo</label>
            <input
              value={template.technicianSignTitle || ''}
              onChange={(e) => setTemplate({ ...template, technicianSignTitle: e.target.value })}
              className="bg-white border border-zinc-300 rounded-md px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800 outline-none text-zinc-900"
            />
          </div>
        </div>

        <div className="mt-12 text-left">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-zinc-800 flex items-center gap-3">
              Ensaios Técnicos Padrão
              <span className="text-[9px] bg-zinc-100 px-3 py-1 rounded-full text-zinc-800 uppercase font-bold tracking-widest border border-zinc-200">
                Escopo do Sistema
              </span>
            </h3>
          </div>

          <div className="space-y-3">
            {template.defaultTests.map((test: any, idx: number) => (
              <div
                key={idx}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 bg-zinc-50 rounded-md border border-zinc-200 hover:border-zinc-300 transition-colors"
              >
                <div className="md:col-span-4 space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Ensaio</span>
                  <input
                    className="w-full bg-white px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-md outline-none focus:border-zinc-800 text-zinc-900"
                    value={test.name}
                    onChange={(e) => {
                      const newTests = [...template.defaultTests];
                      newTests[idx].name = e.target.value;
                      setTemplate({ ...template, defaultTests: newTests });
                    }}
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Resultado</span>
                  <input
                    className="w-full bg-white px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-md outline-none focus:border-zinc-800 text-zinc-900"
                    value={test.result}
                    onChange={(e) => {
                      const newTests = [...template.defaultTests];
                      newTests[idx].result = e.target.value;
                      setTemplate({ ...template, defaultTests: newTests });
                    }}
                  />
                </div>
                <div className="md:col-span-1 space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Unid.</span>
                  <input
                    className="w-full bg-white px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-md outline-none focus:border-zinc-800 text-zinc-900"
                    value={test.unit}
                    onChange={(e) => {
                      const newTests = [...template.defaultTests];
                      newTests[idx].unit = e.target.value;
                      setTemplate({ ...template, defaultTests: newTests });
                    }}
                  />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Limite</span>
                  <input
                    className="w-full bg-white px-3 py-1.5 text-[10px] font-medium border border-zinc-300 rounded-md outline-none focus:border-zinc-800 text-zinc-900"
                    value={test.limit}
                    onChange={(e) => {
                      const newTests = [...template.defaultTests];
                      newTests[idx].limit = e.target.value;
                      setTemplate({ ...template, defaultTests: newTests });
                    }}
                  />
                </div>
                <div className="md:col-span-1 space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">LQ</span>
                  <input
                    className="w-full bg-white px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-md outline-none focus:border-zinc-800 text-zinc-900"
                    value={test.lq}
                    onChange={(e) => {
                      const newTests = [...template.defaultTests];
                      newTests[idx].lq = e.target.value;
                      setTemplate({ ...template, defaultTests: newTests });
                    }}
                  />
                </div>
                <div className="md:col-span-1 space-y-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Método</span>
                  <input
                    className="w-full bg-white px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-md outline-none focus:border-zinc-800 text-zinc-900"
                    value={test.method}
                    onChange={(e) => {
                      const newTests = [...template.defaultTests];
                      newTests[idx].method = e.target.value;
                      setTemplate({ ...template, defaultTests: newTests });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleUpdate}
          disabled={saving}
          className="w-full mt-8 bg-zinc-900 text-white py-3 rounded-md font-bold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 disabled:bg-zinc-400 cursor-pointer"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          {saving ? 'Gravando Alterações...' : 'Confirmar e Salvar Modelo'}
        </button>
      </div>
    </div>
  );
}
