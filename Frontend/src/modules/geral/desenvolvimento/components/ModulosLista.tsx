import React, { useMemo, useState } from 'react';
import type { MapaGroup, MapaModule } from '../types';
import { FilterBar, FiltroSelect, StatusBadge, TabelaPainel, type VarianteBadge } from '../../components/ui/ReportKit';

interface ModulosListaProps {
  groups: MapaGroup[];
  modules: MapaModule[];
  selectedKey: string | null;
  abertosPorModulo: Record<string, number>;
  onSelectModule: (moduleKey: string) => void;
}

const STATUS: Record<string, { rotulo: string; variante: VarianteBadge }> = {
  live: { rotulo: 'No ar', variante: 'saudavel' },
  stub: { rotulo: 'Rascunho', variante: 'aguardando' },
  planned: { rotulo: 'Planejado', variante: 'ordem' },
  descontinuado: { rotulo: 'Descontinuado', variante: 'descontinuado' },
};

export default function ModulosLista({
  groups,
  modules,
  selectedKey,
  abertosPorModulo,
  onSelectModule,
}: ModulosListaProps) {
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('todos');
  const q = busca.trim().toLowerCase();

  const grupos = useMemo(
    () => [...groups].sort((a, b) => a.sortOrder - b.sortOrder),
    [groups],
  );
  const nomeGrupo = useMemo(() => {
    const m = new Map(grupos.map((g) => [g.key, g.label]));
    return (key: string) => m.get(key) || key;
  }, [grupos]);

  const linhas = useMemo(() => {
    return modules
      .filter((m) => grupo === 'todos' || m.groupKey === grupo)
      .filter((m) => !q || m.label.toLowerCase().includes(q) || m.moduleKey.toLowerCase().includes(q) || nomeGrupo(m.groupKey).toLowerCase().includes(q))
      .sort((a, b) => {
        const ga = grupos.find((g) => g.key === a.groupKey)?.sortOrder ?? 99;
        const gb = grupos.find((g) => g.key === b.groupKey)?.sortOrder ?? 99;
        return ga - gb || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR');
      });
  }, [modules, grupo, q, grupos, nomeGrupo]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar módulo">
        <FiltroSelect
          value={grupo}
          onChange={setGrupo}
          opcoes={[
            { valor: 'todos', rotulo: 'Todos os grupos' },
            ...grupos.map((g) => ({ valor: g.key, rotulo: g.label })),
          ]}
        />
      </FilterBar>
      {linhas.length === 0 ? (
        <div className="panel-card py-16 text-center text-sm text-zinc-500">Nenhum módulo com esse nome.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <TabelaPainel>
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Módulo</th>
                <th style={{ textAlign: 'center' }}>Situação</th>
                <th style={{ textAlign: 'right' }}>Abertos</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((m) => {
                const st = STATUS[m.status] || { rotulo: m.status, variante: 'descontinuado' as VarianteBadge };
                const abertos = abertosPorModulo[m.moduleKey] || 0;
                return (
                  <tr
                    key={m.moduleKey}
                    onClick={() => onSelectModule(m.moduleKey)}
                    style={{ cursor: 'pointer', background: selectedKey === m.moduleKey ? 'hsl(var(--background-hsl))' : undefined }}
                  >
                    <td>{nomeGrupo(m.groupKey)}</td>
                    <td className="font-semibold">{m.label}</td>
                    <td style={{ textAlign: 'center' }}>
                      <StatusBadge variante={st.variante}>{st.rotulo}</StatusBadge>
                    </td>
                    <td className="font-mono" style={{ textAlign: 'right' }}>
                      {abertos > 0 ? <StatusBadge variante="ordem">{abertos}</StatusBadge> : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TabelaPainel>
        </div>
      )}
    </div>
  );
}
