import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bug, MessageSquare, ChevronUp, ChevronDown, Loader2,
  RefreshCw, RotateCcw, Send, ClipboardList, ListChecks, Inbox, Ban, CheckCircle2, ArrowLeft, Search,
  Image as ImageIcon, Terminal, Sparkles, UserRound, X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Feedback, FeedbackDetail, FeedbackNote } from '../lib/types';
import { cn } from '../lib/utils';
import type { AuthUser } from '../lib/auth';
import { isSupervisor } from '../lib/auth';
import AppLayout from '../components/layout/AppLayout';

interface FeedbacksAdminViewProps {
  currentUser: AuthUser | null;
  setView: (view: string) => void;
}

type FilterTab = 'pending' | 'queue' | 'review' | 'wont_fix' | 'resolved' | 'all';
type TypeFilter = 'all' | 'bug' | 'feedback';

const FILTER_HINTS: Partial<Record<FilterTab, string>> = {
  pending: 'Novos reports do usuário. Supervisor aprova para a fila ou reprova.',
  queue: 'Aprovados ou devolvidos de Em aberto (com nota). Agentes IA corrigem aqui.',
  review: 'Correção feita pelo agente — confira a nota da IA, imagem e logs antes de finalizar.',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Triagem',
  queued: 'Na fila',
  in_progress: 'Em andamento',
  awaiting_review: 'Em aberto',
  wont_fix: 'Reprovado',
  resolved: 'Finalizado',
};

const STATUS_OPTIONS = ['pending', 'queued', 'in_progress', 'awaiting_review', 'wont_fix', 'resolved'] as const;

function formatDateTime(raw?: string): string {
  if (!raw) return '-';
  const d = raw.includes('T') ? new Date(raw) : new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusColor(status: string): string {
  if (status === 'resolved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'wont_fix') return 'bg-zinc-200 text-zinc-600';
  if (status === 'awaiting_review') return 'bg-violet-100 text-violet-800';
  if (status === 'in_progress') return 'bg-blue-100 text-blue-800';
  if (status === 'queued') return 'bg-amber-100 text-amber-800';
  return 'bg-orange-100 text-orange-800';
}

function isAiAuthor(author: string): boolean {
  const a = (author || '').trim().toLowerCase();
  return a === 'ia' || a === 'ai' || a.includes('agente') || a.startsWith('cursor') || a.includes('composer');
}

function noteRole(author: string): 'ia' | 'supervisor' {
  return isAiAuthor(author) ? 'ia' : 'supervisor';
}

function screenshotSrc(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('blob:')) {
    return raw;
  }
  return `data:image/png;base64,${raw}`;
}

function latestAiNote(notes: FeedbackNote[]): FeedbackNote | null {
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    if (isAiAuthor(notes[i].author)) return notes[i];
  }
  return null;
}

function FeedbackListItem({
  f,
  selected,
  onSelect,
}: {
  f: Feedback;
  selected: boolean;
  onSelect: () => void;
}) {
  const hasShot = Boolean(f.hasScreenshot || f.screenshot);
  const hasLogs = Boolean(f.hasLogs || f.logs?.trim());
  const notesCount = f.notesCount ?? 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-pointer',
        selected && 'bg-zinc-100 border-l-2 border-l-zinc-900'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {f.feedbackType === 'bug' ? (
          <Bug className="h-3.5 w-3.5 text-red-500 shrink-0" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 text-blue-500 shrink-0" />
        )}
        <span className="text-[10px] font-mono text-zinc-500">{f.id.substring(0, 8)}</span>
        <span className="flex items-center gap-1 ml-1 text-zinc-400">
          {hasShot && <ImageIcon className="h-3 w-3" />}
          {hasLogs && <Terminal className="h-3 w-3" />}
          {notesCount > 0 && (
            <span className="text-[9px] font-bold tabular-nums">
              {notesCount} nota{notesCount === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto', statusColor(f.status))}>
          {STATUS_LABELS[f.status] || f.status}
        </span>
      </div>
      <p className="text-xs font-semibold text-zinc-800 line-clamp-2">{f.description}</p>
      <p className="text-[10px] text-zinc-400 mt-1">{f.requestedBy || '-'} · {formatDateTime(f.createdAt)}</p>
    </button>
  );
}

function NoteCard({ n }: { n: FeedbackNote }) {
  const role = noteRole(n.author);
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5',
        role === 'ia' ? 'border-violet-200 bg-violet-50/80' : 'border-zinc-200 bg-white'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {role === 'ia' ? (
          <Sparkles className="h-3.5 w-3.5 text-violet-600 shrink-0" />
        ) : (
          <UserRound className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        )}
        <span
          className={cn(
            'text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full',
            role === 'ia' ? 'bg-violet-200 text-violet-900' : 'bg-zinc-200 text-zinc-700'
          )}
        >
          {role === 'ia' ? 'IA' : 'Supervisor'}
        </span>
        <span className="text-[10px] font-bold text-zinc-500 truncate">{n.author}</span>
        <span className="text-[10px] text-zinc-400 ml-auto shrink-0">{formatDateTime(n.createdAt)}</span>
      </div>
      <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">{n.body}</p>
    </div>
  );
}

function FeedbackDetailPanel({
  detail,
  detailLoading,
  saving,
  noteDraft,
  setNoteDraft,
  queueIdx,
  queueItemsLength,
  onReopen,
  onUpdate,
  onAddNote,
  onMoveInQueue,
  onApproveToQueue,
  onSendToReview,
  onFinalize,
  onReturnToQueue,
}: {
  detail: FeedbackDetail | null;
  detailLoading: boolean;
  saving: boolean;
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  queueIdx: number;
  queueItemsLength: number;
  onReopen: () => void;
  onUpdate: (patch: { status?: string; priority?: number }) => void;
  onAddNote: () => void;
  onMoveInQueue: (direction: 'up' | 'down') => void;
  onApproveToQueue: () => void;
  onSendToReview: () => void;
  onFinalize: () => void;
  onReturnToQueue: () => void;
}) {
  const [shotOpen, setShotOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);

  useEffect(() => {
    setShotOpen(false);
    setLogsOpen(true);
  }, [detail?.id]);

  if (detailLoading && !detail) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-2 py-16">
        <ClipboardList className="h-12 w-12 opacity-30" />
        <p className="text-sm font-semibold">Selecione um feedback na lista</p>
        <p className="text-xs text-center max-w-xs">Contexto completo: descrição, screenshot, logs e notas da IA.</p>
      </div>
    );
  }

  const notes = detail.notes || [];
  const aiResolution = latestAiNote(notes);
  const shot = screenshotSrc(detail.screenshot || '');
  const hasLogs = Boolean(detail.logs?.trim());
  const hasShot = Boolean(shot);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {detail.feedbackType === 'bug' ? (
              <Bug className="h-5 w-5 text-red-500" />
            ) : (
              <MessageSquare className="h-5 w-5 text-blue-500" />
            )}
            <span className="font-mono text-sm font-bold text-zinc-600">{detail.id.substring(0, 8)}</span>
            <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', statusColor(detail.status))}>
              {STATUS_LABELS[detail.status] || detail.status}
            </span>
            {hasShot && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                <ImageIcon className="h-3 w-3" /> Screenshot
              </span>
            )}
            {hasLogs && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                <Terminal className="h-3 w-3" /> Logs
              </span>
            )}
            {notes.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                {notes.length} nota{notes.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <h2 className="text-lg font-extrabold text-zinc-900 whitespace-pre-wrap">{detail.description}</h2>
        </div>
        {(detail.status === 'resolved' || detail.status === 'wont_fix') && (
          <button
            type="button"
            onClick={onReopen}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold border border-zinc-300 rounded-xl hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /> Reabrir na fila
          </button>
        )}
        {detail.status === 'pending' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApproveToQueue}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              <ListChecks className="h-4 w-4" /> Aprovar para fila
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ status: 'wont_fix' })}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold border border-zinc-300 rounded-xl hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            >
              <Ban className="h-4 w-4" /> Reprovar
            </button>
          </div>
        )}
        {(detail.status === 'queued' || detail.status === 'in_progress') && (
          <button
            type="button"
            onClick={onSendToReview}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-violet-700 text-white rounded-xl hover:bg-violet-800 disabled:opacity-50 cursor-pointer"
          >
            <Send className="h-4 w-4" /> Enviar para conferência
          </button>
        )}
        {detail.status === 'awaiting_review' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onFinalize}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" /> Finalizar
            </button>
            <button
              type="button"
              onClick={onReturnToQueue}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold border border-zinc-300 rounded-xl hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" /> Devolver à fila
            </button>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Solicitante', detail.requestedBy || '-'],
          ['Data/Hora', formatDateTime(detail.createdAt)],
          ['Página', detail.page || '-'],
          ['Prioridade', String(detail.priority ?? 100)],
        ].map(([label, val]) => (
          <div key={label} className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5">
            <span className="text-[9px] font-bold text-zinc-400 uppercase">{label}</span>
            <p className="text-xs font-semibold text-zinc-800 mt-0.5 break-words">{val}</p>
          </div>
        ))}
      </div>

      {aiResolution && (
        <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-700" />
            <h3 className="text-xs font-extrabold text-violet-900 uppercase tracking-wider">
              Resolução da IA
            </h3>
            <span className="text-[10px] text-violet-600 ml-auto">{formatDateTime(aiResolution.createdAt)}</span>
          </div>
          <p className="text-sm text-zinc-900 whitespace-pre-wrap leading-relaxed">{aiResolution.body}</p>
        </div>
      )}

      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-zinc-600" />
          <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">Screenshot</h3>
        </div>
        {hasShot ? (
          <button
            type="button"
            onClick={() => setShotOpen(true)}
            className="block w-full cursor-zoom-in"
            title="Ampliar"
          >
            <img
              src={shot}
              alt="Screenshot do report"
              className="max-w-full max-h-[28rem] rounded-lg border border-zinc-200 bg-white object-contain mx-auto"
            />
          </button>
        ) : (
          <p className="text-xs text-zinc-400 italic">Nenhum screenshot anexado neste feedback.</p>
        )}
      </div>

      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
        <button
          type="button"
          onClick={() => setLogsOpen((v) => !v)}
          className="flex items-center gap-2 w-full text-left cursor-pointer"
        >
          <Terminal className="h-4 w-4 text-zinc-600" />
          <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">Logs do console</h3>
          <span className="text-[10px] text-zinc-400 ml-auto">{logsOpen ? 'Ocultar' : 'Mostrar'}</span>
        </button>
        {logsOpen && (
          hasLogs ? (
            <pre className="text-[10px] overflow-x-auto max-h-72 whitespace-pre-wrap font-mono bg-zinc-900 text-zinc-100 p-3 rounded-lg">
              {detail.logs}
            </pre>
          ) : (
            <p className="text-xs text-zinc-400 italic">Nenhum log capturado neste feedback.</p>
          )
        )}
      </div>

      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-4">
        <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">Triagem</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold text-zinc-400 uppercase">Status</label>
            <select
              value={detail.status}
              disabled={saving}
              onChange={(e) => onUpdate({ status: e.target.value })}
              className="w-full mt-0.5 px-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-zinc-400 uppercase">Prioridade</label>
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="number"
                min={1}
                defaultValue={detail.priority ?? 100}
                key={`p-${detail.id}-${detail.priority}`}
                disabled={saving}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v !== detail.priority) onUpdate({ priority: v });
                }}
                className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white"
              />
              {queueIdx >= 0 && (
                <div className="flex gap-1">
                  <button type="button" disabled={queueIdx <= 0} onClick={() => onMoveInQueue('up')} className="p-2 border rounded-lg hover:bg-white disabled:opacity-30 cursor-pointer bg-white">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={queueIdx >= queueItemsLength - 1} onClick={() => onMoveInQueue('down')} className="p-2 border rounded-lg hover:bg-white disabled:opacity-30 cursor-pointer bg-white">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-4">
        <div>
          <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">Histórico de notas</h3>
          <p className="text-[10px] text-zinc-500 mt-1">Notas da IA (resolução) e do supervisor — tudo no banco.</p>
        </div>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {notes.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">Nenhuma nota ainda.</p>
          ) : (
            [...notes].reverse().map((n) => <NoteCard key={n.id} n={n} />)
          )}
        </div>
        {detail.adminNotes?.trim() && notes.length === 0 && (
          <div className="border border-dashed border-zinc-300 rounded-xl p-3 bg-white">
            <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Notas legadas (admin_notes)</p>
            <p className="text-sm text-zinc-700 whitespace-pre-wrap">{detail.adminNotes}</p>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Nova nota do supervisor (devolução, conferência, etc.)..."
            rows={3}
            className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-zinc-900 bg-white"
          />
          <button
            type="button"
            onClick={onAddNote}
            disabled={saving || !noteDraft.trim()}
            className="self-end px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <Send className="h-4 w-4" /> Enviar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 px-3 py-2">
        <p className="text-[9px] font-bold text-zinc-400 uppercase">ID completo</p>
        <p className="text-[11px] font-mono text-zinc-600 break-all">{detail.id}</p>
      </div>

      {shotOpen && hasShot && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShotOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/90 text-zinc-800 cursor-pointer"
            onClick={() => setShotOpen(false)}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={shot}
            alt="Screenshot ampliado"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default function FeedbacksAdminView({ currentUser, setView }: FeedbacksAdminViewProps) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getFeedbacksManage();
      setFeedbacks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setFeedbacks([]);
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar feedbacks.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await api.getFeedbackDetail(id);
      setDetail(data);
    } catch (e) {
      console.error(e);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupervisor(currentUser)) loadList();
  }, [currentUser, loadList]);

  useEffect(() => {
    const refresh = () => {
      if (isSupervisor(currentUser)) loadList();
    };
    window.addEventListener('focus', refresh);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentUser, loadList]);

  useEffect(() => {
    if (selectedId) {
      setNoteDraft('');
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  const counts = useMemo(() => ({
    all: feedbacks.length,
    pending: feedbacks.filter((f) => f.status === 'pending').length,
    queue: feedbacks.filter((f) => f.status === 'queued' || f.status === 'in_progress').length,
    review: feedbacks.filter((f) => f.status === 'awaiting_review').length,
    wont_fix: feedbacks.filter((f) => f.status === 'wont_fix').length,
    resolved: feedbacks.filter((f) => f.status === 'resolved').length,
    bugs: feedbacks.filter((f) => f.feedbackType === 'bug').length,
    suggestions: feedbacks.filter((f) => f.feedbackType === 'feedback').length,
  }), [feedbacks]);

  const sidebarItems = useMemo(() => [
    { id: 'pending', label: 'Triagem', icon: MessageSquare, badge: counts.pending },
    { id: 'queue', label: 'Fila', icon: ListChecks, badge: counts.queue },
    { id: 'review', label: 'Em aberto', icon: Inbox, badge: counts.review },
    { id: 'wont_fix', label: 'Reprovados', icon: Ban, badge: counts.wont_fix },
    { id: 'resolved', label: 'Finalizados', icon: CheckCircle2, badge: counts.resolved },
    { id: 'all', label: 'Todos', icon: ClipboardList, badge: counts.all },
  ], [counts]);

  const filtered = useMemo(() => {
    let list = feedbacks;
    if (filter === 'queue') list = list.filter((f) => f.status === 'queued' || f.status === 'in_progress');
    else if (filter === 'pending') list = list.filter((f) => f.status === 'pending');
    else if (filter === 'review') list = list.filter((f) => f.status === 'awaiting_review');
    else if (filter === 'wont_fix') list = list.filter((f) => f.status === 'wont_fix');
    else if (filter === 'resolved') list = list.filter((f) => f.status === 'resolved');
    if (typeFilter === 'bug') list = list.filter((f) => f.feedbackType === 'bug');
    else if (typeFilter === 'feedback') list = list.filter((f) => f.feedbackType === 'feedback');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.id.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          (f.requestedBy || '').toLowerCase().includes(q) ||
          f.page.toLowerCase().includes(q)
      );
    }
    return list;
  }, [feedbacks, filter, typeFilter, search]);

  useEffect(() => {
    if (selectedId && !filtered.some((f) => f.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filter, filtered, selectedId]);

  const queueItems = feedbacks
    .filter((f) => f.status === 'queued' || f.status === 'in_progress')
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  const updateItem = async (patch: { status?: string; priority?: number }) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.updateFeedback(selectedId, patch);
      await loadList();
      await loadDetail(selectedId);
    } catch (e: unknown) {
      alert('Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    await updateItem({ status: 'queued' });
  };

  const handleApproveToQueue = async () => {
    await updateItem({ status: 'queued' });
  };

  const handleSendToReview = async () => {
    if (!detail?.notes?.length && !noteDraft.trim()) {
      alert(
        'Enviar para Em aberto exige uma nota de resolução. Escreva o comentário abaixo e envie antes (ou com o envio).',
      );
      return;
    }
    if (noteDraft.trim()) {
      setSaving(true);
      try {
        await api.addFeedbackNote(selectedId!, noteDraft.trim());
        setNoteDraft('');
      } catch (e: unknown) {
        alert('Erro ao adicionar nota: ' + (e instanceof Error ? e.message : String(e)));
        setSaving(false);
        return;
      }
    }
    await updateItem({ status: 'awaiting_review' });
  };

  const handleFinalize = async () => {
    await updateItem({ status: 'resolved' });
  };

  const handleReturnToQueue = async () => {
    if (!detail?.notes?.length && !noteDraft.trim()) {
      alert('Devolver à fila exige pelo menos uma nota do supervisor. Escreva a nota abaixo e envie antes de devolver.');
      return;
    }
    if (noteDraft.trim()) {
      setSaving(true);
      try {
        await api.addFeedbackNote(selectedId!, noteDraft.trim());
        setNoteDraft('');
      } catch (e: unknown) {
        alert('Erro ao adicionar nota: ' + (e instanceof Error ? e.message : String(e)));
        setSaving(false);
        return;
      }
    }
    await updateItem({ status: 'queued' });
  };

  const handleAddNote = async () => {
    if (!selectedId || !noteDraft.trim()) return;
    setSaving(true);
    try {
      await api.addFeedbackNote(selectedId, noteDraft.trim());
      setNoteDraft('');
      await loadList();
      await loadDetail(selectedId);
    } catch (e: unknown) {
      alert('Erro ao adicionar nota: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const moveInQueue = async (direction: 'up' | 'down') => {
    if (!selectedId) return;
    const idx = queueItems.findIndex((f) => f.id === selectedId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= queueItems.length) return;
    const current = queueItems[idx];
    const other = queueItems[swapIdx];
    try {
      await api.reorderFeedbacks([
        { id: current.id, priority: other.priority ?? swapIdx + 1 },
        { id: other.id, priority: current.priority ?? idx + 1 },
      ]);
      await loadList();
      if (selectedId) await loadDetail(selectedId);
    } catch (e: unknown) {
      alert('Erro ao reordenar: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  if (!isSupervisor(currentUser)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 text-sm">
        Acesso restrito a administradores.
      </div>
    );
  }

  const queueIdx = selectedId ? queueItems.findIndex((f) => f.id === selectedId) : -1;
  const showMobileDetail = Boolean(selectedId);

  return (
    <AppLayout
      moduleTitle="Gestão de Feedbacks"
      moduleSubtitle="Triagem, fila e conferência — contexto, logs, imagens e notas da IA"
      onBackToHub={() => setView('hub')}
      sidebarItems={sidebarItems}
      activeTab={filter}
      onTabChange={(id) => setFilter(id as FilterTab)}
      headerActions={
        <button
          type="button"
          onClick={() => {
            loadList();
            if (selectedId) loadDetail(selectedId);
          }}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-zinc-200 rounded-lg hover:bg-zinc-50 cursor-pointer disabled:opacity-50 bg-white"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      }
    >
      <div className="flex flex-col flex-1 min-h-0">
        {loadError && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700">
            {loadError}
            <button type="button" onClick={loadList} className="ml-2 underline cursor-pointer">Tentar novamente</button>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-3 shrink-0">
          <div className="relative flex-1 max-w-md min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="search"
              placeholder="Buscar por ID, descrição, solicitante ou página..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-zinc-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <div className="flex rounded-xl border border-zinc-200 bg-white p-0.5">
            {([
              ['all', 'Todos', counts.all],
              ['bug', 'Bugs', counts.bugs],
              ['feedback', 'Sugestões', counts.suggestions],
            ] as const).map(([id, label, badge]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTypeFilter(id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors',
                  typeFilter === id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'
                )}
              >
                {label}
                {badge > 0 && (
                  <span className={cn('ml-1.5 tabular-nums', typeFilter === id ? 'text-zinc-300' : 'text-zinc-400')}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-zinc-500 hidden sm:inline">
            {filtered.length} feedback{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
          <section
            className={cn(
              'flex flex-col min-h-0 bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden',
              'lg:w-[min(42%,420px)] lg:shrink-0',
              showMobileDetail ? 'hidden lg:flex' : 'flex flex-1'
            )}
          >
            <div className="px-4 py-3 border-b border-zinc-100 shrink-0">
              <h2 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">Feedbacks</h2>
              {FILTER_HINTS[filter] && (
                <p className="text-[10px] text-zinc-500 mt-1 leading-snug">{FILTER_HINTS[filter]}</p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-[200px]">
              {loading && feedbacks.length === 0 ? (
                <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-300" /></div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-xs text-zinc-400 text-center space-y-2">
                  <p>Nenhum feedback neste filtro.</p>
                  {filter === 'queue' && counts.pending > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter('pending')}
                      className="text-zinc-700 font-bold underline cursor-pointer"
                    >
                      Ver {counts.pending} aguardando triagem
                    </button>
                  )}
                  {filter !== 'all' && counts.all > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter('all')}
                      className="block mx-auto text-zinc-600 font-semibold underline cursor-pointer"
                    >
                      Ver todos ({counts.all})
                    </button>
                  )}
                </div>
              ) : (
                filtered.map((f) => (
                  <FeedbackListItem
                    key={f.id}
                    f={f}
                    selected={selectedId === f.id}
                    onSelect={() => setSelectedId(f.id)}
                  />
                ))
              )}
            </div>
          </section>

          <section
            className={cn(
              'flex flex-col min-h-0 bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex-1',
              showMobileDetail ? 'flex' : 'hidden lg:flex'
            )}
          >
            <div className="px-4 py-3 border-b border-zinc-100 shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="lg:hidden flex items-center gap-1 text-xs font-bold text-zinc-500 hover:text-zinc-900 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" /> Lista
              </button>
              <h2 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">Detalhe / contexto</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 lg:p-6">
              <FeedbackDetailPanel
                detail={detail}
                detailLoading={detailLoading}
                saving={saving}
                noteDraft={noteDraft}
                setNoteDraft={setNoteDraft}
                queueIdx={queueIdx}
                queueItemsLength={queueItems.length}
                onReopen={handleReopen}
                onUpdate={updateItem}
                onAddNote={handleAddNote}
                onMoveInQueue={moveInQueue}
                onApproveToQueue={handleApproveToQueue}
                onSendToReview={handleSendToReview}
                onFinalize={handleFinalize}
                onReturnToQueue={handleReturnToQueue}
              />
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
