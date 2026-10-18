import React, { useState, useMemo } from 'react';
import {
  History, Sparkles, UserRound, Server, Search, Filter, Clock, CheckCircle2,
  GitCommit, RefreshCw, Loader2, ArrowRight
} from 'lucide-react';
import type { MapaActivity } from '../types';
import { cn } from '../../lib/utils';

interface TimelineAuditTabProps {
  activities: MapaActivity[];
  loading: boolean;
  onRefresh: () => void;
}

function formatDateTime(raw?: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function isAi(actor?: string | null): boolean {
  if (!actor) return false;
  const a = actor.toLowerCase();
  return a === 'ia' || a === 'ai' || a.includes('agente') || a.startsWith('cursor') || a.includes('composer');
}

export default function TimelineAuditTab({
  activities,
  loading,
  onRefresh,
}: TimelineAuditTabProps) {
  const [filterActor, setFilterActor] = useState<'all' | 'ia' | 'supervisor'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return activities.filter((act) => {
      const actAi = isAi(act.actor);
      if (filterActor === 'ia' && !actAi) return false;
      if (filterActor === 'supervisor' && actAi) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const action = (act.action || '').toLowerCase();
        const actor = (act.actor || '').toLowerCase();
        const meta = JSON.stringify(act.meta || {}).toLowerCase();
        if (!action.includes(q) && !actor.includes(q) && !meta.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [activities, filterActor, search]);

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4">
      {/* Topo com Filtros e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 pb-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterActor('all')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer',
              filterActor === 'all'
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                : 'bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-50'
            )}
          >
            Todos os Eventos ({activities.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterActor('ia')}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer',
              filterActor === 'ia'
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                : 'bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-50'
            )}
          >
            <Sparkles className="h-3 w-3 text-amber-500" />
            <span>Ações de Agentes IA</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterActor('supervisor')}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer',
              filterActor === 'supervisor'
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                : 'bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-50'
            )}
          >
            <UserRound className="h-3 w-3 text-zinc-500" />
            <span>Supervisores & Gestão</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por ação ou autor..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer disabled:opacity-50"
            title="Atualizar Linha do Tempo"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Lista da Linha do Tempo */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filtered.map((act) => {
          const actAi = isAi(act.actor);
          return (
            <div
              key={act.id}
              className="p-4 rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 transition-all space-y-2 shadow-2xs"
            >
              <div className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'p-1.5 rounded-lg border',
                    actAi ? 'bg-zinc-900 text-amber-400 border-zinc-800' : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                  )}>
                    {actAi ? <Sparkles className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                  </div>

                  <div>
                    <span className="font-bold text-zinc-900">
                      {act.actor || 'Sistema'}
                    </span>
                    <span className="text-[10px] text-zinc-400 ml-2 font-mono">
                      {act.action}
                    </span>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-zinc-400">
                  {formatDateTime(act.at)}
                </span>
              </div>

              {act.meta && Object.keys(act.meta).length > 0 && (
                <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100 text-[11px] font-mono text-zinc-650 overflow-x-auto">
                  {JSON.stringify(act.meta, null, 2)}
                </div>
              )}
            </div>
          );
        })}

        {!filtered.length && !loading && (
          <div className="py-16 text-center text-zinc-400 text-xs bg-white rounded-2xl border border-zinc-200">
            Nenhum evento registrado nesta trilha.
          </div>
        )}
      </div>
    </div>
  );
}
