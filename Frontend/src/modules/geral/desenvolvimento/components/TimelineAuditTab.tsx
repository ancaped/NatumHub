import React, { useMemo, useState } from 'react';
import type { MapaActivity } from '../types';
import { FilterBar, ReportTabs, StatusBadge, TabelaPainel } from '../../components/ui/ReportKit';
import { ehAgente, fraseAtividade } from '../rotulos';

interface TimelineAuditTabProps {
  activities: MapaActivity[];
  nomeModulo: (key?: string | null) => string;
}

function quando(raw?: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Trilha do mapa: quem fez o quê e quando, em frases. */
export default function TimelineAuditTab({ activities, nomeModulo }: TimelineAuditTabProps) {
  const [quem, setQuem] = useState<'todos' | 'agentes' | 'pessoas'>('todos');
  const [busca, setBusca] = useState('');

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return activities
      .map((a) => ({ a, frase: fraseAtividade(a, nomeModulo), agente: ehAgente(a.actor) }))
      .filter(({ agente }) => quem === 'todos' || (quem === 'agentes' ? agente : !agente))
      .filter(({ a, frase }) => !q || frase.toLowerCase().includes(q) || (a.actor || '').toLowerCase().includes(q));
  }, [activities, nomeModulo, quem, busca]);

  const nAgentes = activities.filter((a) => ehAgente(a.actor)).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ReportTabs
        abas={[
          { id: 'todos', label: 'Todos', contagem: activities.length },
          { id: 'pessoas', label: 'Pessoas', contagem: activities.length - nAgentes },
          { id: 'agentes', label: 'Agentes de IA', contagem: nAgentes },
        ]}
        ativa={quem}
        onChange={(id) => setQuem(id as typeof quem)}
      />
      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar por módulo ou pessoa" />
      {linhas.length === 0 ? (
        <div className="panel-card py-16 text-center text-sm text-zinc-500">Nenhuma atividade.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <ul className="md:hidden flex flex-col gap-2">
            {linhas.map(({ a, frase, agente }) => (
              <li key={a.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 flex flex-col gap-1">
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-900">{a.actor || 'sistema'}</span>
                  {agente && <StatusBadge variante="apoio">IA</StatusBadge>}
                  <span className="ml-auto shrink-0">{quando(a.at)}</span>
                </span>
                <span className="text-sm text-zinc-800">{frase}</span>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <TabelaPainel>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>O que fez</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ a, frase, agente }) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">{quando(a.at)}</td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-semibold">{a.actor || 'sistema'}</span>
                        {agente && <StatusBadge variante="apoio">IA</StatusBadge>}
                      </span>
                    </td>
                    <td>{frase}</td>
                  </tr>
                ))}
              </tbody>
            </TabelaPainel>
          </div>
        </div>
      )}
    </div>
  );
}
