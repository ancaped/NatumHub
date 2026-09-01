import React, { useState, useEffect } from 'react';
import { api } from '../../../geral/lib/api';
import { FiscoAppConfig, FiscoTemplateConfig } from '../../../geral/lib/types';
import { DEFAULT_FISCO_TEMPLATE } from '../lib/fiscoUtils';
import { Settings, Save, CheckCircle2, Building, User, FileText, FlaskConical } from 'lucide-react';

interface SettingsTabProps {
  config: FiscoAppConfig | null;
  onRefresh: () => void;
}

export function SettingsTab({ config, onRefresh }: SettingsTabProps) {
  const [template, setTemplate] = useState<FiscoTemplateConfig>(() => {
    return { ...DEFAULT_FISCO_TEMPLATE, ...(config?.template || {}) };
  });

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (config?.template) {
      setTemplate({ ...DEFAULT_FISCO_TEMPLATE, ...config.template });
    }
  }, [config]);

  const handleChange = (key: keyof FiscoTemplateConfig, value: string) => {
    setTemplate((prev) => ({ ...prev, [key]: value }));
    setSavedSuccess(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: FiscoAppConfig = {
        template,
      };
      await api.saveFiscoConfig(payload);
      setSavedSuccess(true);
      onRefresh();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      
      <div className="border-b border-zinc-200 pb-4">
        <h2 className="text-xl font-black text-zinc-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-zinc-800" />
          Configurações do Laudo Físico-Químico
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Personalize as informações oficiais da empresa, responsável técnico e modelo de impressão A4.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Bloco 1: Laboratório e Empresa */}
        <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <Building className="w-4 h-4" /> 1. Identificação do Laboratório e Empresa
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Nome do Laboratório / Cabeçalho *
              </label>
              <input
                type="text"
                required
                value={template.labName}
                onChange={(e) => handleChange('labName', e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm font-bold text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Departamento *
              </label>
              <input
                type="text"
                required
                value={template.deptName}
                onChange={(e) => handleChange('deptName', e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Razão Social da Empresa *
              </label>
              <input
                type="text"
                required
                value={template.companyName}
                onChange={(e) => handleChange('companyName', e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Endereço Oficial *
              </label>
              <input
                type="text"
                required
                value={template.companyAddress}
                onChange={(e) => handleChange('companyAddress', e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                E-mail de Contato *
              </label>
              <input
                type="email"
                required
                value={template.companyEmail}
                onChange={(e) => handleChange('companyEmail', e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Telefone / Contato *
              </label>
              <input
                type="text"
                required
                value={template.companyContact}
                onChange={(e) => handleChange('companyContact', e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>
        </div>

        {/* Bloco 2: Responsável Técnico e Assinatura */}
        <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4" /> 2. Responsabilidade Técnica e Assinatura
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Nome do Responsável Técnico (Signatário) *
              </label>
              <input
                type="text"
                required
                value={template.technicianSignName}
                onChange={(e) => handleChange('technicianSignName', e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm font-bold text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Título / Cargo do Signatário *
              </label>
              <input
                type="text"
                required
                value={template.technicianSignTitle}
                onChange={(e) => handleChange('technicianSignTitle', e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Analista Padrão Sugerido no Formulário
              </label>
              <input
                type="text"
                value={template.defaultTechnician || ''}
                onChange={(e) => handleChange('defaultTechnician', e.target.value)}
                placeholder="Ex: EDSON FERRARI"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Fabricado Por Padrão (Produção)
              </label>
              <input
                type="text"
                value={template.defaultFabricatedBy || ''}
                onChange={(e) => handleChange('defaultFabricatedBy', e.target.value)}
                placeholder="Ex: RODRIGO DE SOUSA PADILHA"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Autorizado / Responsável Produção Padrão
              </label>
              <input
                type="text"
                value={template.defaultAuthorizedBy || ''}
                onChange={(e) => handleChange('defaultAuthorizedBy', e.target.value)}
                placeholder="Ex: RAFAEL MARINHO DE MELO"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>
        </div>

        {/* Bloco 3: Padrões do Laudo Oficial */}
        <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <FlaskConical className="w-4 h-4" /> 3. Padrões Organolépticos do Laudo
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Aspecto Padrão do Produto
              </label>
              <input
                type="text"
                value={template.defaultAspect || ''}
                onChange={(e) => handleChange('defaultAspect', e.target.value)}
                placeholder="Ex: CONFORME PADRÃO"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                Cor e Odor Padrão
              </label>
              <input
                type="text"
                value={template.defaultColorOdor || ''}
                onChange={(e) => handleChange('defaultColorOdor', e.target.value)}
                placeholder="Ex: CARACTERÍSTICO"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>
        </div>

        {/* Botão Salvar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Configurações salvas com sucesso!
            </span>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Gravar Configurações'}
          </button>
        </div>

      </form>

    </div>
  );
}
