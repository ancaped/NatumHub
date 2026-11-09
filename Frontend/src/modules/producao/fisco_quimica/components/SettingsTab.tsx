import React, { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../../geral/lib/api';
import { FiscoAppConfig, FiscoTemplateConfig } from '../../../geral/lib/types';
import { DEFAULT_FISCO_TEMPLATE } from '../lib/fiscoUtils';

interface SettingsTabProps {
  config: FiscoAppConfig | null;
  onRefresh: () => void;
}

const inputCls = 'w-full min-h-11 border border-zinc-300 rounded-xl px-3 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900';

/** Dados que saem no cabeçalho e na assinatura do laudo, e os nomes sugeridos no Registrar análise. */
export function SettingsTab({ config, onRefresh }: SettingsTabProps) {
  const [template, setTemplate] = useState<FiscoTemplateConfig>(() => ({ ...DEFAULT_FISCO_TEMPLATE, ...(config?.template || {}) }));
  const [saving, setSaving] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (config?.template) setTemplate({ ...DEFAULT_FISCO_TEMPLATE, ...config.template });
  }, [config]);

  const campo = (
    chave: keyof FiscoTemplateConfig,
    rotulo: string,
    opts: { obrigatorio?: boolean; tipo?: string; dica?: string; largo?: boolean } = {},
  ) => (
    <div className={opts.largo ? 'md:col-span-2' : ''}>
      <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block mb-1">{rotulo}</label>
      <input
        type={opts.tipo || 'text'}
        required={opts.obrigatorio}
        value={(template[chave] as string) || ''}
        placeholder={opts.dica}
        onChange={(e) => {
          setTemplate((prev) => ({ ...prev, [chave]: e.target.value }));
          setSalvo(false);
        }}
        className={inputCls}
      />
    </div>
  );

  const bloco = (titulo: string, ajuda: string, filhos: React.ReactNode) => (
    <section className="panel-card" style={{ padding: 16 }}>
      <h3 className="text-sm font-bold text-zinc-900">{titulo}</h3>
      <p className="text-[11px] text-zinc-500 mb-3">{ajuda}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{filhos}</div>
    </section>
  );

  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErro(null);
    try {
      await api.saveFiscoConfig({ template });
      setSalvo(true);
      onRefresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={gravar} className="space-y-3 animate-in fade-in duration-200 max-w-4xl">
      {bloco(
        'Empresa e laboratório',
        'Saem no cabeçalho do laudo impresso.',
        <>
          {campo('labName', 'Nome do laboratório', { obrigatorio: true })}
          {campo('deptName', 'Departamento', { obrigatorio: true })}
          {campo('companyName', 'Razão social', { obrigatorio: true, largo: true })}
          {campo('companyAddress', 'Endereço', { obrigatorio: true, largo: true })}
          {campo('companyEmail', 'E-mail', { obrigatorio: true, tipo: 'email' })}
          {campo('companyContact', 'Telefone', { obrigatorio: true })}
        </>,
      )}

      {bloco(
        'Assinatura do laudo',
        'Responsável técnico que assina o laudo.',
        <>
          {campo('technicianSignName', 'Nome do responsável', { obrigatorio: true })}
          {campo('technicianSignTitle', 'Cargo', { obrigatorio: true })}
        </>,
      )}

      {bloco(
        'Sugestões no Registrar análise',
        'Nomes que já vêm preenchidos ao registrar um laudo; dá para trocar em cada laudo.',
        <>
          {campo('defaultTechnician', 'Analista', { dica: 'Ex.: EDSON FERRARI' })}
          {campo('defaultFabricatedBy', 'Fabricado por', { dica: 'Ex.: RODRIGO DE SOUSA PADILHA' })}
          {campo('defaultAuthorizedBy', 'Autorizado por', { dica: 'Ex.: RAFAEL MARINHO DE MELO', largo: true })}
        </>,
      )}

      {bloco(
        'Aspecto, cor e odor no laudo',
        'Valem só para produto sem aspecto, cor e odor definidos no padrão.',
        <>
          {campo('defaultAspect', 'Aspecto', { dica: 'Ex.: CONFORME PADRÃO' })}
          {campo('defaultColorOdor', 'Cor e odor', { dica: 'Ex.: CARACTERÍSTICO' })}
        </>,
      )}

      {erro && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{erro}</p>}

      <div className="flex items-center justify-end gap-3">
        {salvo && (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
            <CheckCircle2 size={14} /> Salvo
          </span>
        )}
        <button
          type="submit"
          disabled={saving}
          className="tab-btn min-h-11 md:min-h-0 px-6 disabled:opacity-60"
          style={{ backgroundColor: 'hsl(var(--primary-hsl))', color: '#ffffff', fontWeight: 700, fontSize: '0.75rem' }}
        >
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </form>
  );
}
