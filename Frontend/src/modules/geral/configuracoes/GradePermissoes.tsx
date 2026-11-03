import React, { useState } from 'react';
import { Eye, Edit3, Lock, Search } from 'lucide-react';
import { moduleRegistry, type ModuleGroup } from '../lib/modules/registry';

export type NivelModulo = 'none' | 'view' | 'edit';

export interface ValorGrade {
  modules: string[];
  permissions: Record<string, 'view' | 'edit'>;
}

/** Define o nível de um módulo (puro: devolve o novo valor). */
export function aplicarModulo(prev: ValorGrade, moduleKey: string, level: NivelModulo): ValorGrade {
  if (level === 'none') {
    const permissions = { ...prev.permissions };
    delete permissions[moduleKey];
    return { modules: prev.modules.filter((m) => m !== moduleKey), permissions };
  }
  return {
    modules: prev.modules.includes(moduleKey) ? prev.modules : [...prev.modules, moduleKey],
    permissions: { ...prev.permissions, [moduleKey]: level },
  };
}

/** Define o nível de todos os módulos de um grupo. */
export function aplicarGrupo(prev: ValorGrade, group: ModuleGroup, level: NivelModulo): ValorGrade {
  const keys = group.children.map((c) => c.key);
  if (level === 'none') {
    const permissions = { ...prev.permissions };
    for (const k of keys) delete permissions[k];
    return { modules: prev.modules.filter((m) => !keys.includes(m)), permissions };
  }
  const moduleSet = new Set(prev.modules);
  const permissions = { ...prev.permissions };
  for (const k of keys) {
    moduleSet.add(k);
    permissions[k] = level;
  }
  return { modules: Array.from(moduleSet), permissions };
}

interface GradeProps {
  value: ValorGrade;
  onChange: (next: ValorGrade) => void;
  /** Texto de apoio sob o título. */
  descricao?: string;
}

/** Grade de permissões por módulo (Off / Ver / Alterar), compartilhada por usuários e agentes de IA. */
export default function GradePermissoes({ value, onChange, descricao }: GradeProps) {
  const [registry] = useState<ModuleGroup[]>(() => moduleRegistry());
  const [moduleFilter, setModuleFilter] = useState('');
  const filterLower = moduleFilter.toLowerCase().trim();

  return (
    <div className="pt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
        <div>
          <p className="text-[11px] font-black text-zinc-800 uppercase tracking-wider">
            Permissões de Acesso por Módulo
          </p>
          <p className="text-[10px] text-zinc-500">
            {descricao ?? 'Defina se o usuário não acessa, apenas visualiza (leitura) ou pode alterar dados.'}
          </p>
        </div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            placeholder="Filtrar módulos..."
            className="pl-8 pr-3 py-1 text-xs border border-zinc-200 rounded-lg bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 w-full sm:w-44"
          />
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto border border-zinc-200/80 rounded-2xl p-4 bg-zinc-50/50 shadow-inner">
        {registry.map((group) => {
          const visibleChildren = group.children.filter((leaf) =>
            !filterLower ||
            leaf.label.toLowerCase().includes(filterLower) ||
            group.label.toLowerCase().includes(filterLower)
          );

          if (visibleChildren.length === 0) return null;

          return (
            <div key={group.key} className="bg-white border border-zinc-200/70 rounded-xl p-3 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <span className="text-xs font-black text-zinc-800 uppercase tracking-wider">
                  {group.label}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChange(aplicarGrupo(value, group, 'none'))}
                    className="text-[10px] font-bold text-zinc-400 hover:text-zinc-700 px-1.5 py-0.5 rounded hover:bg-zinc-100 transition-colors cursor-pointer"
                  >
                    Nenhum
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(aplicarGrupo(value, group, 'view'))}
                    className="text-[10px] font-bold text-sky-600 hover:text-sky-800 px-1.5 py-0.5 rounded hover:bg-sky-50 transition-colors cursor-pointer flex items-center gap-0.5"
                  >
                    <Eye className="h-3 w-3" /> Ver Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(aplicarGrupo(value, group, 'edit'))}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 px-1.5 py-0.5 rounded hover:bg-emerald-50 transition-colors cursor-pointer flex items-center gap-0.5"
                  >
                    <Edit3 className="h-3 w-3" /> Alterar Todos
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {visibleChildren.map((leaf) => {
                  const hasModule = value.modules.includes(leaf.key);
                  const currentLevel: NivelModulo = !hasModule
                    ? 'none'
                    : value.permissions[leaf.key] === 'view'
                    ? 'view'
                    : 'edit';

                  return (
                    <div
                      key={leaf.key}
                      className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                        currentLevel === 'edit'
                          ? 'bg-emerald-50/40 border-emerald-200/80 text-emerald-950'
                          : currentLevel === 'view'
                          ? 'bg-sky-50/40 border-sky-200/80 text-sky-950'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-500 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <span className="text-xs font-semibold truncate pr-2" title={leaf.label}>
                        {leaf.label}
                      </span>

                      <div className="flex items-center bg-white border border-zinc-200 rounded-lg p-0.5 shadow-2xs shrink-0">
                        <button
                          type="button"
                          onClick={() => onChange(aplicarModulo(value, leaf.key, 'none'))}
                          title="Sem acesso (bloqueado)"
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-colors cursor-pointer ${
                            currentLevel === 'none'
                              ? 'bg-zinc-200 text-zinc-800 shadow-2xs'
                              : 'text-zinc-400 hover:text-zinc-700'
                          }`}
                        >
                          <Lock className="h-2.5 w-2.5" />
                          <span>Off</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onChange(aplicarModulo(value, leaf.key, 'view'))}
                          title="Apenas Visualizar (leitura)"
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-colors cursor-pointer ${
                            currentLevel === 'view'
                              ? 'bg-sky-500 text-white shadow-2xs'
                              : 'text-zinc-500 hover:text-sky-700'
                          }`}
                        >
                          <Eye className="h-2.5 w-2.5" />
                          <span>Ver</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onChange(aplicarModulo(value, leaf.key, 'edit'))}
                          title="Visualizar e Alterar (completo)"
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 transition-colors cursor-pointer ${
                            currentLevel === 'edit'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'text-zinc-500 hover:text-emerald-700'
                          }`}
                        >
                          <Edit3 className="h-2.5 w-2.5" />
                          <span>Alterar</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
