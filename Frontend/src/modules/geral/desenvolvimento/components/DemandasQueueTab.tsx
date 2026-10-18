import React, { useState, useMemo } from 'react';
import {
  Inbox, ListChecks, Sparkles, CheckCircle2, Search, Bug, MessageSquare,
  Image as ImageIcon, Terminal, ChevronRight, Filter, ArrowUpDown, Clock
} from 'lucide-react';
import type { Feedback, FilaSubTab } from '../types';
import { cn } from '../../lib/utils';

interface DemandasQueueTabProps {
  feedbacks: Feedback[];
  loading: boolean;
  selectedId: string | null;
  onSelectFeedback: (f: Feedback) => void;
  onRefresh: () => void;
}

const SUB_TAB_CONFIG: { id: FilaSubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'triagem', label: '1. Triagem', icon: Inbox },
  { id: 'execucao', label: '2. Fila de Execução', icon: ListChecks },
  { id: 'homologacao', label: '3. Homologação (IA)', icon: Sparkles },
  { id: 'finalizados', label: '4. Finalizados', icon: CheckCircle2 },
];

function formatDateTime(raw?: string): string {
  if (!raw) return '—';
  const d = raw.includes('T') ? new Date(raw) : new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DemandasQueueTab({
  feedbacks,
  loading,
  selectedId,
  onSelectFeedback,
  onRefresh,
}: DemandasQueueTabProps) {
  const [subTab, setSubTab] = useState<FilaSubTab>('homologacao');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'bug' | 'feedback'>('all');

  // Contagens por sub-aba
  const counts = useMemo(() => {
    return {
      triagem: feedbacks.filter((f) => f.status === 'pending').length,
      execucao: feedbacks.filter((f) => f.status === 'queued' || f.status === 'in_progress' || f.status === 'planned').length,
      homologacao: feedbacks.filter((f) => f.status === 'awaiting_review').length,
      finalizados: feedbacks.filter((f) => f.status === 'resolved' || f.status === 'wont_fix').length,
    };
  }, [feedbacks]);

  // Filtragem ativa
  const filteredItems = useMemo(() => {
    return feedbacks.filter((f) => {
      // Filtro de aba
      if (subTab === 'triagem' && f.status !== 'pending') return false;
      if (subTab === 'execucao' && !['queued', 'in_progress', 'planned'].includes(f.status)) return false;
      if (subTab === 'homologacao' && f.status !== 'awaiting_review') return false;
      if (subTab === 'finalizados' && !['resolved', 'wont_fix'].includes(f.status)) return false;

      // Filtro de tipo
      if (typeFilter !== 'all' && f.feedbackType !== typeFilter) return false;

      // Busca textual
      if (search.trim()) {
        const q = search.toLowerCase();
        const desc = (f.description || '').toLowerCase();
        const req = (f.requestedBy || '').toLowerCase();
        const page = (f.page || '').toLowerCase();
        const id = f.id.toLowerCase();
        if (!desc.includes(q) && !req.includes(q) && !page.includes(q) && !id.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [feedbacks, subTab, typeFilter, search]);

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4">
      {/* Barra de Sub-abas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {SUB_TAB_CONFIG.map((t) => {
            const Icon = t.icon;
            const count = counts[t.id];
            const isActive = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border',
                  isActive
                    ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                    : 'bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-white' : 'text-zinc-400')} />
                <span>{t.label}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      'text-[10px] font-mono px-1.5 py-0.2 rounded-full border font-bold',
                      isActive
                        ? t.id === 'homologacao'
                          ? 'bg-amber-400 text-zinc-950 border-amber-300'
                          : 'bg-zinc-800 text-zinc-200 border-zinc-700'
                        : t.id === 'homologacao'
                        ? 'bg-violet-100 text-violet-800 border-violet-200'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filtros e Busca */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar chamado, rota..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs bg-white text-zinc-700 font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="all">Todos os Tipos</option>
            <option value="bug">Somente Bugs</option>
            <option value="feedback">Somente Sugestões</option>
          </select>
        </div>
      </div>

      {/* Lista de Chamados */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {filteredItems.map((f) => {
          const isSelected = selectedId === f.id;
          const hasShot = Boolean(f.hasScreenshot || f.screenshot);
          const hasLogs = Boolean(f.hasLogs || f.logs?.trim());
          const notesCount = f.notesCount ?? 0;

          return (
            <div
              key={f.id}
              onClick={() => onSelectFeedback(f)}
              className={cn(
                'p-4 rounded-2xl border bg-white transition-all cursor-pointer space-y-2 group',
                isSelected
                  ? 'border-zinc-950 ring-2 ring-zinc-950/10 shadow-md bg-zinc-50/50'
                  : 'border-zinc-200 hover:border-zinc-300 shadow-2xs hover:shadow-xs'
              )}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {f.feedbackType === 'bug' ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                      <Bug className="h-3 w-3" /> Bug
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                      <MessageSquare className="h-3 w-3" /> Sugestão
                    </span>
                  )}

                  <span className="font-mono text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">
                    {f.id.slice(0, 8)}
                  </span>

                  <span className="text-[10px] font-bold text-zinc-500 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-md tabular-nums">
                    Prioridade #{f.priority ?? 100}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {hasShot && (
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded" title="Possui print de evidência">
                      <ImageIcon className="h-3 w-3 text-zinc-400" /> Print
                    </span>
                  )}

                  {hasLogs && (
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded" title="Possui logs de console">
                      <Terminal className="h-3 w-3 text-zinc-400" /> Logs
                    </span>
                  )}

                  {notesCount > 0 && (
                    <span className="text-[10px] font-mono font-bold bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded" title={`${notesCount} nota(s) técnicas`}>
                      {notesCount} notas
                    </span>
                  )}

                  <span className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                    f.status === 'awaiting_review'
                      ? 'bg-violet-50 text-violet-700 border-violet-200 font-black'
                      : f.status === 'resolved'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : f.status === 'queued'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                  )}>
                    {f.status}
                  </span>
                </div>
              </div>

              <h3 className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2">
                {f.description}
              </h3>

              <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-zinc-100">
                <div className="flex items-center gap-2 truncate">
                  <span>Por <strong>{f.requestedBy || 'Operador'}</strong></span>
                  {f.page && (
                    <>
                      <span>·</span>
                      <code className="text-[11px] font-mono text-zinc-600 truncate max-w-[200px]">{f.page}</code>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono">{formatDateTime(f.createdAt)}</span>
                  <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-600 transition-colors" />
                </div>
              </div>
            </div>
          );
        })}

        {!filteredItems.length && !loading && (
          <div className="py-16 text-center text-zinc-400 text-xs space-y-1 bg-white rounded-2xl border border-zinc-200">
            <p className="font-bold text-zinc-600">Nenhum chamado encontrado nesta etapa.</p>
            <p>Utilize os filtros acima ou aguarde novos chamados do chão de fábrica.</p>
          </div>
        )}
      </div>
    </div>
  );
}
