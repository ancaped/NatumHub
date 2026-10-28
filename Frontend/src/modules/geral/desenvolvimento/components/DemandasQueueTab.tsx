import React, { useState, useMemo } from 'react';
import {
  Inbox, ListChecks, Sparkles, CheckCircle2, Search,
  Image as ImageIcon, Terminal
} from 'lucide-react';
import type { Feedback, FilaSubTab } from '../types';
import { cn } from '../../lib/utils';

interface DemandasQueueTabProps {
  feedbacks: Feedback[];
  loading: boolean;
  selectedId: string | null;
  onSelectFeedback: (f: Feedback) => void;
  onRefresh: () => void;
  onBatchStatus?: (ids: string[], status: string) => Promise<void>;
}

const SUB_TAB_CONFIG: { id: FilaSubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'triagem', label: 'Triagem', icon: Inbox },
  { id: 'execucao', label: 'Fila', icon: ListChecks },
  { id: 'homologacao', label: 'Homologação', icon: Sparkles },
  { id: 'finalizados', label: 'Finalizados', icon: CheckCircle2 },
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Triagem',
  queued: 'Fila',
  in_progress: 'Em andamento',
  planned: 'Planejado',
  awaiting_review: 'Homologação',
  resolved: 'Finalizado',
  wont_fix: 'Recusado',
};

function idade(raw?: string): string {
  if (!raw) return '';
  const d = raw.includes('T') ? new Date(raw) : new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  const minutos = Math.max(0, Date.now() - d.getTime()) / 60000;
  if (minutos < 60) return `${Math.max(1, Math.floor(minutos))} min`;
  const horas = minutos / 60;
  if (horas < 48) return `${Math.floor(horas)} h`;
  return `${Math.floor(horas / 24)} d`;
}

export default function DemandasQueueTab({
  feedbacks,
  loading,
  selectedId,
  onSelectFeedback,
  onBatchStatus,
}: DemandasQueueTabProps) {
  const [subTab, setSubTab] = useState<FilaSubTab>('homologacao');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'bug' | 'feedback'>('all');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [loteOcupado, setLoteOcupado] = useState(false);

  const counts = useMemo(() => {
    return {
      triagem: feedbacks.filter((f) => f.status === 'pending').length,
      execucao: feedbacks.filter((f) => f.status === 'queued' || f.status === 'in_progress' || f.status === 'planned').length,
      homologacao: feedbacks.filter((f) => f.status === 'awaiting_review').length,
      finalizados: feedbacks.filter((f) => f.status === 'resolved' || f.status === 'wont_fix').length,
    };
  }, [feedbacks]);

  const filteredItems = useMemo(() => {
    return feedbacks.filter((f) => {
      if (subTab === 'triagem' && f.status !== 'pending') return false;
      if (subTab === 'execucao' && !['queued', 'in_progress', 'planned'].includes(f.status)) return false;
      if (subTab === 'homologacao' && f.status !== 'awaiting_review') return false;
      if (subTab === 'finalizados' && !['resolved', 'wont_fix'].includes(f.status)) return false;
      if (typeFilter !== 'all' && f.feedbackType !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const desc = (f.description || '').toLowerCase();
        const req = (f.requestedBy || '').toLowerCase();
        const page = (f.page || '').toLowerCase();
        const id = f.id.toLowerCase();
        const modulo = (f.moduleKey || '').toLowerCase();
        if (!desc.includes(q) && !req.includes(q) && !page.includes(q) && !id.includes(q) && !modulo.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [feedbacks, subTab, typeFilter, search]);

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-3">
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
                  'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border',
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
                        ? 'bg-amber-100 text-amber-900 border-amber-200'
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

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar chamado, módulo..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'bug' | 'feedback')}
            className="border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs bg-white text-zinc-700 font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="all">Todos os Tipos</option>
            <option value="bug">Somente Bugs</option>
            <option value="feedback">Somente Sugestões</option>
          </select>
        </div>
      </div>

      {subTab === 'homologacao' && selecionados.length > 0 && onBatchStatus && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-zinc-700">{selecionados.length} selecionado(s)</span>
          <button
            type="button"
            disabled={loteOcupado}
            onClick={() => {
              setLoteOcupado(true);
              void onBatchStatus(selecionados, 'resolved')
                .then(() => setSelecionados([]))
                .finally(() => setLoteOcupado(false));
            }}
            className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white font-bold disabled:opacity-50 cursor-pointer"
          >
            Aprovar
          </button>
          <button
            type="button"
            disabled={loteOcupado}
            onClick={() => {
              setLoteOcupado(true);
              void onBatchStatus(selecionados, 'queued')
                .then(() => setSelecionados([]))
                .finally(() => setLoteOcupado(false));
            }}
            className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-800 font-bold disabled:opacity-50 cursor-pointer"
          >
            Devolver para a fila
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
        {filteredItems.map((f) => {
          const isSelected = selectedId === f.id;
          const hasShot = Boolean(f.hasScreenshot || f.screenshot);
          const hasLogs = Boolean(f.hasLogs || f.logs?.trim());
          const marcado = selecionados.includes(f.id);
          const frase = (f.description || '').replace(/\s+/g, ' ').trim();

          return (
            <div
              key={f.id}
              onClick={() => onSelectFeedback(f)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 cursor-pointer',
                isSelected ? 'bg-zinc-50' : 'hover:bg-zinc-50'
              )}
            >
              {subTab === 'homologacao' && (
                <input
                  type="checkbox"
                  checked={marcado}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => {
                    setSelecionados((prev) => (
                      prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                    ));
                  }}
                  className="shrink-0"
                  aria-label={`Selecionar ${f.id}`}
                />
              )}
              <span className={cn(
                'shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border',
                f.feedbackType === 'bug' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-sky-50 text-sky-700 border-sky-200'
              )}>
                {f.feedbackType === 'bug' ? 'Bug' : 'Sugestão'}
              </span>
              <span className="shrink-0 text-[10px] font-mono text-zinc-500 max-w-[8rem] truncate">
                {f.moduleKey || f.page || '—'}
              </span>
              <span className="min-w-0 flex-1 text-xs text-zinc-900 truncate">{frase}</span>
              <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">{idade(f.createdAt)}</span>
              {hasShot && <ImageIcon className="h-3 w-3 text-zinc-400 shrink-0" />}
              {hasLogs && <Terminal className="h-3 w-3 text-zinc-400 shrink-0" />}
              <span className="shrink-0 text-[10px] font-bold text-zinc-600">
                {STATUS_LABEL[f.status] || f.status}
              </span>
            </div>
          );
        })}

        {!filteredItems.length && !loading && (
          <div className="py-16 text-center text-zinc-400 text-xs space-y-1">
            <p className="font-bold text-zinc-600">Nenhum chamado encontrado nesta etapa.</p>
          </div>
        )}
      </div>
    </div>
  );
}
