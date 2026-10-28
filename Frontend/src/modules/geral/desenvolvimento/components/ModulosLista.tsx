import React, { useMemo, useState } from 'react';
import type { MapaGroup, MapaModule } from '../types';
import { cn } from '../../lib/utils';

interface ModulosListaProps {
  groups: MapaGroup[];
  modules: MapaModule[];
  selectedKey: string | null;
  abertosPorModulo: Record<string, number>;
  onSelectModule: (moduleKey: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  live: 'No ar',
  stub: 'Rascunho',
  planned: 'Planejado',
};

export default function ModulosLista({
  groups,
  modules,
  selectedKey,
  abertosPorModulo,
  onSelectModule,
}: ModulosListaProps) {
  const [busca, setBusca] = useState('');
  const q = busca.trim().toLowerCase();

  const grupos = useMemo(() => {
    return [...groups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((grupo) => ({
        grupo,
        modulos: modules
          .filter((m) => m.groupKey === grupo.key)
          .filter((m) => !q || m.label.toLowerCase().includes(q) || m.moduleKey.toLowerCase().includes(q))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR')),
      }))
      .filter((g) => g.modulos.length > 0);
  }, [groups, modules, q]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar módulo"
        className="w-full max-w-sm px-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {grupos.map(({ grupo, modulos }) => (
          <section key={grupo.key}>
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">{grupo.label}</h2>
            <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
              {modulos.map((m) => {
                const abertos = abertosPorModulo[m.moduleKey] || 0;
                return (
                  <button
                    key={m.moduleKey}
                    type="button"
                    onClick={() => onSelectModule(m.moduleKey)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer',
                      selectedKey === m.moduleKey ? 'bg-zinc-50' : 'hover:bg-zinc-50'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-zinc-900 truncate">{m.label}</span>
                      <span className="block text-[10px] font-mono text-zinc-400 truncate">{m.moduleKey}</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-600 shrink-0">
                      {STATUS_LABEL[m.status] || m.status}
                    </span>
                    {abertos > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-zinc-950 shrink-0">
                        {abertos}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {!grupos.length && (
          <p className="text-xs text-zinc-500">Nenhum módulo com esse nome.</p>
        )}
      </div>
    </div>
  );
}
