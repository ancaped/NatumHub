import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bug, MessageSquare, ChevronUp, ChevronDown, Loader2,
  RefreshCw, RotateCcw, Send, ClipboardList, ListChecks, Inbox, Ban, CheckCircle2, ArrowLeft, Search,
  Image as ImageIcon, Terminal, Sparkles, UserRound, X, Compass, Copy, Check, FileText,
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

type FilterTab = 'pending' | 'queue' | 'planned' | 'review' | 'wont_fix' | 'resolved' | 'all';
type TypeFilter = 'all' | 'bug' | 'feedback';
type NoteFilterType = 'all' | 'supervisor' | 'plan' | 'resolution';

const FILTER_HINTS: Partial<Record<FilterTab, string>> = {
  pending: '1. Triagem: Novos reports do usuário. Supervisor aprova para a fila, planeja ou reprova.',
  queue: '2. Fila: Demandas prontas ou em andamento para desenvolvimento / IA.',
  planned: '3. Planejados: Especificação técnica estruturada (design, funções, rotas). Prontos para execução.',
  review: '4. Em aberto: Correção feita pelo agente — confira a nota da IA, imagem e logs antes de finalizar.',
  wont_fix: '5. Reprovados: Feedbacks cancelados ou não aplicáveis.',
  resolved: '6. Finalizados: Feedbacks aprovados e homologados.',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Triagem',
  queued: 'Na fila',
  in_progress: 'Em andamento',
  planned: 'Planejado',
  awaiting_review: 'Em aberto',
  wont_fix: 'Reprovado',
  resolved: 'Finalizado',
};

const STATUS_OPTIONS = ['pending', 'queued', 'in_progress', 'planned', 'awaiting_review', 'wont_fix', 'resolved'] as const;

function formatDateTime(raw?: string): string {
  if (!raw) return '-';
  const d = raw.includes('T') ? new Date(raw) : new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusColor(status: string): string {
  if (status === 'resolved') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (status === 'wont_fix') return 'bg-zinc-100 text-zinc-600 border border-zinc-200';
  if (status === 'awaiting_review') return 'bg-violet-50 text-violet-700 border border-violet-200';
  if (status === 'in_progress') return 'bg-blue-50 text-blue-700 border border-blue-200';
  if (status === 'planned') return 'bg-sky-50 text-sky-700 border border-sky-200 font-bold';
  if (status === 'queued') return 'bg-amber-50 text-amber-700 border border-amber-200';
  return 'bg-orange-50 text-orange-700 border border-orange-200';
}

function isAiAuthor(author: string): boolean {
  const a = (author || '').trim().toLowerCase();
  return a === 'ia' || a === 'ai' || a.includes('agente') || a.startsWith('cursor') || a.includes('composer');
}

function getNoteType(n: FeedbackNote): 'plan' | 'resolution' | 'supervisor' {
  const body = (n.body || '').toLowerCase();
  const isAi = isAiAuthor(n.author || '');
  if (
    n.body?.includes('📐') ||
    body.includes('planejamento de implementação') ||
    body.includes('feedback_plan.md') ||
    body.startsWith('plano de') ||
    body.startsWith('plano arquitetural')
  ) {
    return 'plan';
  }
  if (
    isAi &&
    (body.startsWith('resolução') ||
      body.includes('implementações realizadas') ||
      body.includes('causa:') ||
      body.includes('correção:'))
  ) {
    return 'resolution';
  }
  return 'supervisor';
}

function screenshotSrc(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('blob:')) {
    return raw;
  }
  return `data:image/png;base64,${raw}`;
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
        'w-full text-left px-4 py-3 border-b border-zinc-100 hover:bg-zinc-50/80 transition-all cursor-pointer',
        selected && 'bg-zinc-100/90 border-l-[3px] border-l-zinc-900 shadow-2xs'
      )}
    >
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        {f.feedbackType === 'bug' ? (
          <Bug className="h-3.5 w-3.5 text-red-500 shrink-0" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 text-blue-500 shrink-0" />
        )}
        <span className="text-[10px] font-mono font-bold text-zinc-500">{f.id.substring(0, 8)}</span>
        <span className="flex items-center gap-1 text-zinc-400">
          {hasShot && <ImageIcon className="h-3 w-3" />}
          {hasLogs && <Terminal className="h-3 w-3" />}
          {notesCount > 0 && (
            <span className="text-[9px] font-bold tabular-nums bg-zinc-100 px-1.5 py-0.2 rounded-md text-zinc-600">
              {notesCount}
            </span>
          )}
        </span>
        <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full ml-auto', statusColor(f.status))}>
          {STATUS_LABELS[f.status] || f.status}
        </span>
      </div>
      <p className="text-xs font-semibold text-zinc-800 line-clamp-2 leading-snug">{f.description}</p>
      <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1.5">
        <span className="truncate max-w-[150px]">{f.requestedBy || '-'}</span>
        <span>{formatDateTime(f.createdAt)}</span>
      </div>
    </button>
  );
}

function EnhancedNoteCard({ n }: { n: FeedbackNote }) {
  if (!n) return null;
  const type = getNoteType(n);

  if (type === 'plan') {
    return (
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/90 via-sky-50/40 to-white p-4 space-y-2 shadow-2xs transition-all hover:border-sky-300">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="p-1 rounded-lg bg-sky-100 text-sky-700">
            <Compass className="h-3.5 w-3.5" />
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-sky-200/70 text-sky-900">
            Plano de Implementação
          </span>
          <span className="text-[10px] font-bold text-zinc-600">{n.author || 'IA'}</span>
          <span className="text-[9px] font-mono font-bold text-sky-700 bg-white border border-sky-200 px-2 py-0.5 rounded-md">
            feedback_plan.md
          </span>
          <span className="text-[10px] text-zinc-400 ml-auto">{formatDateTime(n.createdAt)}</span>
        </div>
        <p className="text-xs md:text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed font-sans pt-1">
          {n.body ?? ''}
        </p>
      </div>
    );
  }

  if (type === 'resolution') {
    return (
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/90 via-violet-50/40 to-white p-4 space-y-2 shadow-2xs transition-all hover:border-violet-300">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="p-1 rounded-lg bg-violet-100 text-violet-700">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-200/70 text-violet-900">
            Resolução da IA
          </span>
          <span className="text-[10px] font-bold text-zinc-600">{n.author || 'IA'}</span>
          <span className="text-[10px] text-zinc-400 ml-auto">{formatDateTime(n.createdAt)}</span>
        </div>
        <p className="text-xs md:text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed font-sans pt-1">
          {n.body ?? ''}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2 shadow-2xs transition-all hover:border-zinc-300">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="p-1 rounded-lg bg-zinc-100 text-zinc-600">
          <UserRound className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
          Nota do Supervisor
        </span>
        <span className="text-[10px] font-bold text-zinc-600">{n.author || 'Supervisor'}</span>
        <span className="text-[10px] text-zinc-400 ml-auto">{formatDateTime(n.createdAt)}</span>
      </div>
      <p className="text-xs md:text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed font-sans pt-1">
        {n.body ?? ''}
      </p>
    </div>
  );
}
function latestPlanNote(notes: FeedbackNote[]): FeedbackNote | null {
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const n = notes[i];
    if (n && getNoteType(n) === 'plan') return n;
  }
  return null;
}

function latestAiResolution(notes: FeedbackNote[]): FeedbackNote | null {
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const n = notes[i];
    if (n && getNoteType(n) === 'resolution') return n;
  }
  return null;
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
  onAddNote: (category?: 'supervisor' | 'plan' | 'resolution') => void;
  onMoveInQueue: (direction: 'up' | 'down') => void;
  onApproveToQueue: () => void;
  onSendToReview: () => void;
  onFinalize: () => void;
  onReturnToQueue: () => void;
}) {
  const [shotOpen, setShotOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [activeNotesTab, setActiveNotesTab] = useState<NoteFilterType>('all');
  const [noteCategory, setNoteCategory] = useState<'supervisor' | 'plan' | 'resolution'>('supervisor');

  useEffect(() => {
    setShotOpen(false);
    setLogsOpen(false);
    setActiveNotesTab('all');
    setCopiedId(false);
    setCopiedLogs(false);
  }, [detail?.id]);

  if (detailLoading && !detail) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-400">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        <span className="text-xs font-semibold">Carregando detalhes do feedback...</span>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-3 py-24">
        <div className="p-4 rounded-2xl bg-zinc-100 text-zinc-400">
          <ClipboardList className="h-10 w-10 opacity-40" />
        </div>
        <p className="text-sm font-bold text-zinc-600">Selecione um feedback na lista</p>
        <p className="text-xs text-center max-w-sm text-zinc-400">
          Visualize o contexto completo: descrição, histórico de notas do supervisor, plano técnico de implementação, resoluções da IA, logs e screenshot.
        </p>
      </div>
    );
  }

  const notes = detail.notes || [];
  const planNotes = notes.filter((n) => getNoteType(n) === 'plan');
  const resolutionNotes = notes.filter((n) => getNoteType(n) === 'resolution');
  const supervisorNotes = notes.filter((n) => getNoteType(n) === 'supervisor');

  const latestPlan = latestPlanNote(notes);
  const latestResolution = latestAiResolution(notes);

  const shot = screenshotSrc(detail.screenshot || '');
  const hasLogs = Boolean(detail.logs?.trim());
  const hasShot = Boolean(shot);

  const displayedNotes = notes.filter((n) => {
    if (activeNotesTab === 'plan') return getNoteType(n) === 'plan';
    if (activeNotesTab === 'resolution') return getNoteType(n) === 'resolution';
    if (activeNotesTab === 'supervisor') return getNoteType(n) === 'supervisor';
    return true;
  });

  const handleCopyId = () => {
    navigator.clipboard.writeText(detail.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyLogs = () => {
    if (!detail.logs) return;
    navigator.clipboard.writeText(detail.logs);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleSubmitNote = () => {
    if (!noteDraft.trim()) return;
    onAddNote(noteCategory);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Fast Actions */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {detail.feedbackType === 'bug' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-700 border border-red-200">
                <Bug className="h-3.5 w-3.5" /> Bug
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-700 border border-blue-200">
                <MessageSquare className="h-3.5 w-3.5" /> Sugestão
              </span>
            )}

            <button
              type="button"
              onClick={handleCopyId}
              title="Copiar ID completo"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition-colors cursor-pointer"
            >
              {copiedId ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-zinc-500" />
                  <span>{detail.id.substring(0, 8)}</span>
                </>
              )}
            </button>

            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full', statusColor(detail.status))}>
              {STATUS_LABELS[detail.status] || detail.status}
            </span>

            {hasShot && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full">
                <ImageIcon className="h-3 w-3" /> Screenshot
              </span>
            )}
            {hasLogs && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full">
                <Terminal className="h-3 w-3" /> Logs
              </span>
            )}

            {planNotes.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                <Compass className="h-3 w-3" /> {planNotes.length} plano{planNotes.length === 1 ? '' : 's'}
              </span>
            )}
            {resolutionNotes.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                <Sparkles className="h-3 w-3" /> {resolutionNotes.length} resolu{resolutionNotes.length === 1 ? 'ção' : 'ções'}
              </span>
            )}
          </div>

          {/* Contextual Status Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {detail.status === 'pending' && (
              <>
                <button
                  type="button"
                  onClick={onApproveToQueue}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <ListChecks className="h-3.5 w-3.5" /> Aprovar para Fila
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ status: 'planned' })}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-sky-50 text-sky-800 border border-sky-300 rounded-xl hover:bg-sky-100 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <Compass className="h-3.5 w-3.5" /> Planejar
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ status: 'wont_fix' })}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-zinc-200 text-zinc-600 rounded-xl hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
                >
                  <Ban className="h-3.5 w-3.5" /> Reprovar
                </button>
              </>
            )}

            {detail.status === 'planned' && (
              <>
                <button
                  type="button"
                  onClick={() => onUpdate({ status: 'queued' })}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <ListChecks className="h-3.5 w-3.5" /> Iniciar Execução (Mover para Fila)
                </button>
                <button
                  type="button"
                  onClick={onSendToReview}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-violet-700 text-white rounded-xl hover:bg-violet-800 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <Send className="h-3.5 w-3.5" /> Enviar para Conferência
                </button>
              </>
            )}

            {(detail.status === 'queued' || detail.status === 'in_progress') && (
              <>
                <button
                  type="button"
                  onClick={() => onUpdate({ status: 'planned' })}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-sky-50 text-sky-800 border border-sky-300 rounded-xl hover:bg-sky-100 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <Compass className="h-3.5 w-3.5" /> Planejar
                </button>
                <button
                  type="button"
                  onClick={onSendToReview}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-violet-700 text-white rounded-xl hover:bg-violet-800 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <Send className="h-3.5 w-3.5" /> Enviar para Conferência
                </button>
              </>
            )}

            {detail.status === 'awaiting_review' && (
              <>
                <button
                  type="button"
                  onClick={onFinalize}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar (Homologar)
                </button>
                <button
                  type="button"
                  onClick={onReturnToQueue}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold border border-zinc-200 text-zinc-700 rounded-xl hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Devolver à Fila
                </button>
              </>
            )}

            {(detail.status === 'resolved' || detail.status === 'wont_fix') && (
              <button
                type="button"
                onClick={onReopen}
                disabled={saving}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold border border-zinc-300 rounded-xl hover:bg-zinc-50 cursor-pointer disabled:opacity-50 text-zinc-700 shadow-2xs"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reabrir na Fila
              </button>
            )}
          </div>
        </div>

        {/* Title / Description */}
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-2xs">
          <h2 className="text-base md:text-lg font-bold text-zinc-900 leading-snug whitespace-pre-wrap">
            {detail.description}
          </h2>
        </div>
      </div>

      {/* Metadata Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Solicitante', detail.requestedBy || '-'],
          ['Data/Hora', formatDateTime(detail.createdAt)],
          ['Página / Módulo', detail.page || '-'],
          ['Prioridade', String(detail.priority ?? 100)],
        ].map(([label, val]) => (
          <div key={label} className="bg-white border border-zinc-200/80 rounded-2xl p-3 shadow-2xs">
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wide">{label}</span>
            <p className="text-xs font-bold text-zinc-800 mt-1 truncate" title={val}>{val}</p>
          </div>
        ))}
      </div>

      {/* Destaque: Plano de Implementação Ativo */}
      {latestPlan && (
        <div className="rounded-2xl border border-sky-300 bg-gradient-to-br from-sky-50 via-sky-50/50 to-white p-4 space-y-2 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="p-1 rounded-lg bg-sky-200/80 text-sky-800">
              <Compass className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-extrabold text-sky-950 uppercase tracking-wider">
              Plano de Implementação Ativo
            </h3>
            <span className="text-[9px] font-mono font-bold text-sky-800 bg-white border border-sky-200 px-2 py-0.5 rounded-md">
              feedback_plan.md
            </span>
            <span className="text-[10px] text-zinc-500">{latestPlan.author || 'IA'}</span>
            <span className="text-[10px] text-zinc-400 ml-auto">{formatDateTime(latestPlan.createdAt)}</span>
          </div>
          <p className="text-xs md:text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed font-sans pt-1">
            {latestPlan.body ?? ''}
          </p>
        </div>
      )}

      {/* Destaque: Última Resolução da IA */}
      {latestResolution && (
        <div className="rounded-2xl border border-violet-300 bg-gradient-to-br from-violet-50 via-violet-50/50 to-white p-4 space-y-2 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="p-1 rounded-lg bg-violet-200/80 text-violet-800">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-extrabold text-violet-950 uppercase tracking-wider">
              Última Resolução da IA
            </h3>
            <span className="text-[10px] text-zinc-500">{latestResolution.author || 'IA'}</span>
            <span className="text-[10px] text-zinc-400 ml-auto">{formatDateTime(latestResolution.createdAt)}</span>
          </div>
          <p className="text-xs md:text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed font-sans pt-1">
            {latestResolution.body ?? ''}
          </p>
        </div>
      )}

      {/* Histórico Estruturado: Supervisor, Planejamento e Resoluções */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
          <div>
            <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">
              Ciclo de Vida & Anotações
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Histórico segregado: notas do supervisor, especificações de planejamento e resoluções da IA.
            </p>
          </div>

          {/* Segmented Tabs Filter */}
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl self-start sm:self-auto overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActiveNotesTab('all')}
              className={cn(
                'px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap',
                activeNotesTab === 'all'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              )}
            >
              Todas ({notes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveNotesTab('supervisor')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap',
                activeNotesTab === 'supervisor'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              )}
            >
              <UserRound className="h-3 w-3 text-zinc-500" />
              Supervisor ({supervisorNotes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveNotesTab('plan')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap',
                activeNotesTab === 'plan'
                  ? 'bg-white text-sky-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-sky-800'
              )}
            >
              <Compass className="h-3 w-3 text-sky-600" />
              Planejamento ({planNotes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveNotesTab('resolution')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap',
                activeNotesTab === 'resolution'
                  ? 'bg-white text-violet-900 shadow-2xs'
                  : 'text-zinc-500 hover:text-violet-800'
              )}
            >
              <Sparkles className="h-3 w-3 text-violet-600" />
              Resoluções IA ({resolutionNotes.length})
            </button>
          </div>
        </div>

        {/* Notes Stream */}
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {displayedNotes.length === 0 ? (
            <div className="text-center py-8 bg-zinc-50/50 rounded-2xl border border-dashed border-zinc-200">
              <p className="text-xs text-zinc-400 font-medium italic">
                {activeNotesTab === 'plan'
                  ? 'Nenhum plano de implementação registrado neste feedback.'
                  : activeNotesTab === 'resolution'
                  ? 'Nenhuma resolução da IA registrada neste feedback.'
                  : activeNotesTab === 'supervisor'
                  ? 'Nenhuma nota de supervisor registrada.'
                  : 'Nenhuma anotação registrada ainda.'}
              </p>
            </div>
          ) : (
            [...displayedNotes].reverse().map((n) => <EnhancedNoteCard key={n.id} n={n} />)
          )}
        </div>

        {detail.adminNotes?.trim() && notes.length === 0 && (
          <div className="border border-dashed border-zinc-300 rounded-xl p-3 bg-zinc-50">
            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Notas legadas (admin_notes)</p>
            <p className="text-sm text-zinc-700 whitespace-pre-wrap">{detail.adminNotes}</p>
          </div>
        )}

        {/* New Note Composer */}
        <div className="pt-2 border-t border-zinc-100 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-zinc-500">Adicionar anotação ao histórico:</span>
            <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setNoteCategory('supervisor')}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-bold rounded-md transition-colors cursor-pointer',
                  noteCategory === 'supervisor' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'
                )}
              >
                Supervisor
              </button>
              <button
                type="button"
                onClick={() => setNoteCategory('plan')}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-bold rounded-md transition-colors cursor-pointer',
                  noteCategory === 'plan' ? 'bg-sky-100 text-sky-900' : 'text-zinc-500'
                )}
              >
                📐 Planejamento
              </button>
              <button
                type="button"
                onClick={() => setNoteCategory('resolution')}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-bold rounded-md transition-colors cursor-pointer',
                  noteCategory === 'resolution' ? 'bg-violet-100 text-violet-900' : 'text-zinc-500'
                )}
              >
                ✨ Resolução IA
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={
                noteCategory === 'plan'
                  ? 'Descreva o plano arquitetural, funções, design e requisitos técnicos...'
                  : noteCategory === 'resolution'
                  ? 'Descreva a correção técnica efetuada, arquivos alterados e testes realizados...'
                  : 'Nova nota do supervisor (devolução, orientações, validação)...'
              }
              rows={3}
              className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-zinc-900 bg-white"
            />
            <button
              type="button"
              onClick={handleSubmitNote}
              disabled={saving || !noteDraft.trim()}
              className="self-end px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </button>
          </div>
        </div>
      </div>

      {/* Screenshot Section */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-zinc-600" />
          <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">Screenshot Anexo</h3>
        </div>
        {hasShot ? (
          <button
            type="button"
            onClick={() => setShotOpen(true)}
            className="block w-full cursor-zoom-in group"
            title="Clique para ampliar o screenshot"
          >
            <div className="relative rounded-xl border border-zinc-200 bg-zinc-50 p-2 overflow-hidden transition-all group-hover:border-zinc-300">
              <img
                src={shot}
                alt="Screenshot do feedback"
                className="max-w-full max-h-[28rem] rounded-lg bg-white object-contain mx-auto transition-transform group-hover:scale-[1.01]"
              />
              <div className="absolute bottom-4 right-4 bg-zinc-900/80 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg backdrop-blur-xs">
                Clique para ampliar
              </div>
            </div>
          </button>
        ) : (
          <p className="text-xs text-zinc-400 italic">Nenhum screenshot anexado neste feedback.</p>
        )}
      </div>

      {/* Console Logs Section */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setLogsOpen((v) => !v)}
            className="flex items-center gap-2 text-left cursor-pointer group"
          >
            <Terminal className="h-4 w-4 text-zinc-600 group-hover:text-zinc-900" />
            <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">
              Logs do Console {hasLogs ? '' : '(Vazio)'}
            </h3>
            <span className="text-[11px] font-bold text-zinc-400 group-hover:text-zinc-700 ml-1">
              {logsOpen ? 'Ocultar' : 'Mostrar'}
            </span>
          </button>

          {hasLogs && logsOpen && (
            <button
              type="button"
              onClick={handleCopyLogs}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition-colors cursor-pointer"
            >
              {copiedLogs ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span className="text-emerald-700">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 text-zinc-500" />
                  <span>Copiar Logs</span>
                </>
              )}
            </button>
          )}
        </div>

        {logsOpen && (
          hasLogs ? (
            <pre className="text-[11px] overflow-x-auto max-h-72 whitespace-pre-wrap font-mono bg-zinc-900 text-zinc-100 p-3.5 rounded-xl border border-zinc-800 leading-relaxed">
              {detail.logs}
            </pre>
          ) : (
            <p className="text-xs text-zinc-400 italic">Nenhum log capturado neste feedback.</p>
          )
        )}
      </div>

      {/* Triagem Rápida */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
        <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">Ajuste de Status & Prioridade</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-extrabold text-zinc-400 uppercase">Status no Sistema</label>
            <select
              value={detail.status}
              disabled={saving}
              onChange={(e) => onUpdate({ status: e.target.value })}
              className="w-full mt-1 px-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white font-medium"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-extrabold text-zinc-400 uppercase">Prioridade na Fila</label>
            <div className="flex items-center gap-2 mt-1">
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
                className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white font-medium"
              />
              {queueIdx >= 0 && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    title="Subir na fila"
                    disabled={queueIdx <= 0}
                    onClick={() => onMoveInQueue('up')}
                    className="p-2 border border-zinc-200 rounded-xl hover:bg-zinc-50 disabled:opacity-30 cursor-pointer bg-white"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Descer na fila"
                    disabled={queueIdx >= queueItemsLength - 1}
                    onClick={() => onMoveInQueue('down')}
                    className="p-2 border border-zinc-200 rounded-xl hover:bg-zinc-50 disabled:opacity-30 cursor-pointer bg-white"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full ID Info */}
      <div className="rounded-2xl border border-zinc-200/60 bg-zinc-50/70 p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider">ID UUID no Banco de Dados</p>
          <p className="text-[11px] font-mono text-zinc-600 truncate">{detail.id}</p>
        </div>
        <button
          type="button"
          onClick={handleCopyId}
          className="shrink-0 text-xs font-bold text-zinc-600 hover:text-zinc-900 p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer"
        >
          {copiedId ? 'Copiado!' : 'Copiar'}
        </button>
      </div>

      {/* Modal Screenshot Zoom */}
      {shotOpen && hasShot && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShotOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/90 text-zinc-800 hover:bg-white cursor-pointer shadow-lg"
            onClick={() => setShotOpen(false)}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={shot}
            alt="Screenshot ampliado"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
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
    planned: feedbacks.filter((f) => f.status === 'planned').length,
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
    { id: 'planned', label: 'Planejados', icon: Compass, badge: counts.planned },
    { id: 'review', label: 'Em aberto', icon: Inbox, badge: counts.review },
    { id: 'wont_fix', label: 'Reprovados', icon: Ban, badge: counts.wont_fix },
    { id: 'resolved', label: 'Finalizados', icon: CheckCircle2, badge: counts.resolved },
    { id: 'all', label: 'Todos', icon: ClipboardList, badge: counts.all },
  ], [counts]);

  const filtered = useMemo(() => {
    let list = feedbacks;
    if (filter === 'queue') list = list.filter((f) => f.status === 'queued' || f.status === 'in_progress');
    else if (filter === 'planned') list = list.filter((f) => f.status === 'planned');
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

  const handleAddNote = async (category?: 'supervisor' | 'plan' | 'resolution') => {
    if (!selectedId || !noteDraft.trim()) return;
    let body = noteDraft.trim();
    if (category === 'plan' && !body.includes('📐') && !body.toLowerCase().includes('plano')) {
      body = `📐 [Plano de Implementação]\n${body}`;
    } else if (category === 'resolution' && !body.includes('✨') && !body.toLowerCase().includes('resolução')) {
      body = `✨ [Resolução da IA]\n${body}`;
    }
    setSaving(true);
    try {
      await api.addFeedbackNote(selectedId, body);
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
