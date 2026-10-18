import React, { useState } from 'react';
import {
  Plus, Check, AlertCircle, Loader2, Sparkles, FolderTree, Code2,
  FileCheck, Shield, BookOpen, Layers
} from 'lucide-react';
import type { MapaGroup } from '../types';
import { cn } from '../../lib/utils';

interface ModuleCreationWizardProps {
  groups: MapaGroup[];
  onCreateModule: (data: {
    moduleKey: string;
    label: string;
    groupKey: string;
    purpose: string;
    routerPrefix: string;
    frontendPath: string;
  }) => Promise<void>;
  saving: boolean;
}

export default function ModuleCreationWizard({
  groups,
  onCreateModule,
  saving,
}: ModuleCreationWizardProps) {
  const [moduleKey, setModuleKey] = useState('');
  const [label, setLabel] = useState('');
  const [groupKey, setGroupKey] = useState(groups[0]?.key || 'administrativo');
  const [purpose, setPurpose] = useState('');
  const [routerPrefix, setRouterPrefix] = useState('');
  const [frontendPath, setFrontendPath] = useState('');
  const [customPaths, setCustomPaths] = useState(false);

  // Validação snake_case: apenas letras minúsculas, números e underline
  const isKeyValid = Boolean(moduleKey.trim() && /^[a-z0-9_]+$/.test(moduleKey.trim()));

  const handleKeyChange = (val: string) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setModuleKey(sanitized);

    if (!customPaths) {
      setRouterPrefix(`/api/${sanitized.replace('_', '/')}`);
      const parts = sanitized.split('_');
      const compName = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('') + 'View.tsx';
      setFrontendPath(`Frontend/src/modules/${groupKey}/${sanitized}/${compName}`);
    }
  };

  const handleGroupChange = (grp: string) => {
    setGroupKey(grp);
    if (!customPaths && moduleKey) {
      const parts = moduleKey.split('_');
      const compName = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('') + 'View.tsx';
      setFrontendPath(`Frontend/src/modules/${grp}/${moduleKey}/${compName}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isKeyValid || !label.trim()) return;

    await onCreateModule({
      moduleKey: moduleKey.trim(),
      label: label.trim(),
      groupKey,
      purpose: purpose.trim(),
      routerPrefix: routerPrefix.trim(),
      frontendPath: frontendPath.trim(),
    });

    // Reset após criação
    setModuleKey('');
    setLabel('');
    setPurpose('');
    setCustomPaths(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Card do Formulário */}
        <form onSubmit={handleSubmit} className="p-6 rounded-3xl border border-zinc-200 bg-white shadow-sm space-y-5">
          <div className="border-b border-zinc-100 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black tracking-tight text-zinc-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-zinc-700" />
                Assistente de Criação de Novo Módulo
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Alinhado à skill canônica <code className="font-mono bg-zinc-100 text-zinc-800 px-1 py-0.5 rounded">natumhub-modulos</code>
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
              Status: Planned
            </span>
          </div>

          <div className="space-y-4">
            {/* Chave Única */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Chave do Módulo (module_key) *
                </label>
                <span className="text-[10px] text-zinc-400">Padrão snake_case único</span>
              </div>
              <input
                type="text"
                value={moduleKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="ex: qualidade_auditoria"
                className={cn(
                  'w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1',
                  moduleKey && !isKeyValid
                    ? 'border-rose-300 focus:ring-rose-500 text-rose-900'
                    : 'border-zinc-200 focus:ring-zinc-900 text-zinc-900'
                )}
              />
              {moduleKey && !isKeyValid && (
                <p className="text-[11px] text-rose-600 mt-1">Use apenas letras minúsculas, números e sublinhados.</p>
              )}
            </div>

            {/* Nome de Exibição & Grupo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Nome Comercial (Label) *
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="ex: Auditoria de Processos"
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 text-zinc-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Setor / Grupo Funcional *
                </label>
                <select
                  value={groupKey}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 text-zinc-900"
                >
                  {groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label} ({g.key})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Propósito Funcional */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                Propósito Funcional / Problema Operacional
              </label>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Qual rotina da fábrica este módulo atende? Ex: Controle de registros diários de conferência..."
                rows={3}
                className="w-full p-3 text-xs rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 text-zinc-800 leading-relaxed"
              />
            </div>

            {/* Caminhos de Arquivo Sugeridos */}
            <div className="p-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 flex items-center gap-1.5">
                  <Code2 className="h-3.5 w-3.5 text-zinc-400" /> Espelhamento Técnico Frontend/Backend
                </span>
                <button
                  type="button"
                  onClick={() => setCustomPaths(!customPaths)}
                  className="text-[11px] font-bold text-zinc-500 hover:text-zinc-800 cursor-pointer"
                >
                  {customPaths ? 'Auto-sugerir caminhos' : 'Editar caminhos manualmente'}
                </button>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div>
                  <span className="text-[10px] font-sans font-bold uppercase text-zinc-400 block mb-0.5">Prefixo de Rota REST Axum:</span>
                  <input
                    type="text"
                    value={routerPrefix}
                    disabled={!customPaths}
                    onChange={(e) => setRouterPrefix(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-800 disabled:opacity-70"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-sans font-bold uppercase text-zinc-400 block mb-0.5">Caminho da View React:</span>
                  <input
                    type="text"
                    value={frontendPath}
                    disabled={!customPaths}
                    onChange={(e) => setFrontendPath(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-800 disabled:opacity-70"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">
              * Ao salvar, a tarefa correspondente é inserida na fila do PostgreSQL automaticamente.
            </span>

            <button
              type="submit"
              disabled={saving || !isKeyValid || !label.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-xs active:scale-98"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>Cadastrar Módulo e Gerar Task</span>
            </button>
          </div>
        </form>

        {/* Guia Rápido com as Etapas de Implementação */}
        <div className="p-5 rounded-3xl border border-zinc-200 bg-white shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-800">
            <BookOpen className="h-4 w-4 text-zinc-500" />
            <span>Checklist Automático de Implementação</span>
          </div>
          <ol className="text-xs text-zinc-600 space-y-2 list-decimal list-inside leading-relaxed">
            <li>O módulo é inserido na tabela <code className="font-mono bg-zinc-100 text-zinc-800 px-1 py-0.5 rounded">mapa_modules</code> com status <strong>planned</strong>.</li>
            <li>Um nó é posicionado no organograma visual próximo ao setor selecionado.</li>
            <li>Uma tarefa do tipo <code className="font-mono bg-zinc-100 text-zinc-800 px-1 py-0.5 rounded">module_spec</code> é gerada na fila com status <strong>open</strong> para o agente de IA codificar a view e as rotas.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
