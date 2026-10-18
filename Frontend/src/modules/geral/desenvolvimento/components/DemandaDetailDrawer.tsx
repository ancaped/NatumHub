import React, { useState } from 'react';
import {
  X, Bug, MessageSquare, Terminal, Image as ImageIcon, CheckCircle2,
  AlertTriangle, RotateCcw, Send, Copy, Check, ChevronUp, ChevronDown,
  Maximize2, Sparkles, UserRound, ArrowLeft, Loader2, Compass
} from 'lucide-react';
import type { Feedback, FeedbackDetail, FeedbackNote } from '../types';
import { cn } from '../../lib/utils';
import Drawer from '../../components/ui/Drawer';

interface DemandaDetailDrawerProps {
  feedback: FeedbackDetail | null;
  loading: boolean;
  onClose: () => void;
  onUpdateStatus: (id: string, status: string) => Promise<void>;
  onUpdatePriority: (id: string, priority: number) => Promise<void>;
  onAddNote: (id: string, body: string, author: string) => Promise<void>;
  currentUser?: { displayName?: string; role?: string } | null;
}

function formatDateTime(raw?: string): string {
  if (!raw) return '—';
  const d = raw.includes('T') ? new Date(raw) : new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function screenshotSrc(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('blob:')) {
    return raw;
  }
  return `data:image/png;base64,${raw}`;
}

function isAiAuthor(author: string): boolean {
  const a = (author || '').trim().toLowerCase();
  return a === 'ia' || a === 'ai' || a.includes('agente') || a.startsWith('cursor') || a.includes('composer');
}

export default function DemandaDetailDrawer({
  feedback,
  loading,
  onClose,
  onUpdateStatus,
  onUpdatePriority,
  onAddNote,
  currentUser,
}: DemandaDetailDrawerProps) {
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteAuthor, setNoteAuthor] = useState(() => currentUser?.displayName || 'Supervisor');
  const [sendingNote, setSendingNote] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);

  if (!feedback) return null;

  const hasShot = Boolean(feedback.screenshot);
  const hasLogs = Boolean(feedback.logs?.trim());
  const shotUrl = hasShot ? screenshotSrc(feedback.screenshot!) : '';

  const handleCopyLogs = async () => {
    if (!feedback.logs) return;
    try {
      await navigator.clipboard.writeText(feedback.logs);
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    } catch (_) {}
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(feedback.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (_) {}
  };

  const handleSendNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = newNote.trim();
    if (!body) return;
    setSendingNote(true);
    try {
      await onAddNote(feedback.id, body, noteAuthor.trim() || 'Supervisor');
      setNewNote('');
    } finally {
      setSendingNote(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    setActionLoading(true);
    try {
      await onUpdateStatus(feedback.id, status);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Drawer
        isOpen={Boolean(feedback)}
        onClose={onClose}
        size="2xl"
        title={feedback.description}
        subtitle={
          <div className="flex items-center gap-3 text-xs text-zinc-500 pt-0.5">
            <span>Por <strong>{feedback.requestedBy || 'Operador'}</strong></span>
            <span>·</span>
            <span>{formatDateTime(feedback.createdAt)}</span>
            {feedback.page && (
              <>
                <span>·</span>
                <code className="text-[11px] font-mono text-zinc-700 bg-zinc-100 px-1 rounded">{feedback.page}</code>
              </>
            )}
          </div>
        }
        badge={
          <div className="flex items-center gap-2 flex-wrap">
            {feedback.feedbackType === 'bug' ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                <Bug className="h-3 w-3" /> Bug
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                <MessageSquare className="h-3 w-3" /> Sugestão
              </span>
            )}

            <button
              type="button"
              onClick={handleCopyId}
              className="flex items-center gap-1 text-[10px] font-mono text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
              title="Copiar ID completo"
            >
              <span>{feedback.id.slice(0, 8)}</span>
              {copiedId ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Copy className="h-2.5 w-2.5 text-zinc-400" />}
            </button>

            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-zinc-200">
              {feedback.status}
            </span>
          </div>
        }
        footer={
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-all ml-auto"
          >
            Fechar Painel
          </button>
        }
      >
        <div className="space-y-5">
          {/* Alerta de Homologação se awaiting_review */}
          {feedback.status === 'awaiting_review' && (
            <div className="p-4 rounded-xl border border-violet-200 bg-violet-50/70 text-violet-950 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <span>Pronto para Homologação do Supervisor</span>
              </div>
              <p className="text-[11px] text-violet-800 leading-relaxed">
                A IA concluiu a implementação deste chamado. Confira a nota técnica abaixo, o print original e valide na tela antes de aprovar.
              </p>
            </div>
          )}

          {/* Screenshot do Operador */}
          {hasShot && (
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /> Evidência Visual (Chão de Fábrica)
                </span>
                <button
                  type="button"
                  onClick={() => setShowFullImage(true)}
                  className="text-xs font-bold text-zinc-700 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Ver em Tela Cheia</span>
                </button>
              </div>

              <div
                onClick={() => setShowFullImage(true)}
                className="relative rounded-lg overflow-hidden border border-zinc-200 bg-zinc-900/5 cursor-zoom-in group max-h-56"
              >
                <img
                  src={shotUrl}
                  alt="Screenshot do chamado"
                  className="w-full h-auto object-contain max-h-56 mx-auto group-hover:opacity-95 transition-opacity"
                />
              </div>
            </div>
          )}

          {/* Console Logs do Navegador */}
          {hasLogs && (
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setLogsExpanded(!logsExpanded)}
                  className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 hover:text-zinc-900 flex items-center gap-1.5 cursor-pointer"
                >
                  <Terminal className="h-3.5 w-3.5 text-zinc-500" />
                  <span>Logs de Erro do Navegador</span>
                  {logsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="text-xs font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
                >
                  {copiedLogs ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedLogs ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              {logsExpanded && (
                <pre className="p-3 rounded-lg bg-zinc-950 text-zinc-200 font-mono text-[11px] leading-relaxed max-h-60 overflow-auto whitespace-pre-wrap select-all">
                  {feedback.logs}
                </pre>
              )}
            </div>
          )}

          {/* Thread de Notas (Supervisor vs IA) */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
              Histórico Técnico & Resoluções ({feedback.notes?.length || 0})
            </span>

            <div className="space-y-3">
              {(feedback.notes || []).map((n) => {
                const isAi = isAiAuthor(n.author || '');
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'p-4 rounded-xl border text-xs space-y-1.5 shadow-2xs',
                      isAi
                        ? 'bg-zinc-900 text-zinc-100 border-zinc-800'
                        : 'bg-zinc-50 text-zinc-800 border-zinc-200'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 border-b pb-2 border-current/15">
                      <div className="flex items-center gap-1.5 font-bold">
                        {isAi ? <Sparkles className="h-3.5 w-3.5 text-amber-400" /> : <UserRound className="h-3.5 w-3.5 text-zinc-500" />}
                        <span>{n.author}</span>
                      </div>
                      <span className="text-[10px] opacity-60 font-mono">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed font-sans pt-1">
                      {n.body}
                    </p>
                  </div>
                );
              })}

              {!feedback.notes?.length && (
                <p className="text-xs text-zinc-400 italic py-2">Nenhuma nota técnica registrada.</p>
              )}
            </div>

            {/* Inserir Nova Nota */}
            <form onSubmit={handleSendNote} className="space-y-2 pt-2 border-t border-zinc-100">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Adicionar Nota
                </label>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-zinc-400">Como:</span>
                  <input
                    type="text"
                    value={noteAuthor}
                    onChange={(e) => setNoteAuthor(e.target.value)}
                    className="border border-zinc-200 rounded-md px-1.5 py-0.5 text-xs font-semibold w-28 bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Escreva uma observação ou instrução para os agentes de IA..."
                  rows={2}
                  className="flex-1 border border-zinc-200 rounded-xl p-2.5 text-xs bg-white text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <button
                  type="submit"
                  disabled={sendingNote || !newNote.trim()}
                  className="px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40"
                >
                  {sendingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer com Ações de Transição de Estado */}
        <div className="p-4 border-t border-zinc-200 bg-zinc-50/80 flex items-center justify-between gap-2 shrink-0 flex-wrap">
          {/* Se estiver aguardando revisão da IA */}
          {feedback.status === 'awaiting_review' && (
            <div className="w-full flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange('queued')}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-700" />
                <span>Devolver para a Fila</span>
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange('resolved')}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Aprovar & Finalizar</span>
              </button>
            </div>
          )}

          {/* Se estiver na triagem */}
          {feedback.status === 'pending' && (
            <div className="w-full flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange('wont_fix')}
                disabled={actionLoading}
                className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Reprovar
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange('queued')}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Aprovar para Fila de Desenvolvimento</span>
              </button>
            </div>
          )}

          {/* Se estiver na fila de execução */}
          {(feedback.status === 'queued' || feedback.status === 'in_progress') && (
            <div className="w-full flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange('awaiting_review')}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Marcar como Entregue (Enviar para Homologação)</span>
              </button>
            </div>
          )}
        </div>
      </Drawer>

      {/* Modal de Zoom do Screenshot em Tela Cheia */}
      {showFullImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative max-w-5xl max-h-[90vh] bg-zinc-950 p-2 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col items-center">
            <button
              onClick={() => setShowFullImage(false)}
              className="absolute top-4 right-4 p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={shotUrl}
              alt="Screenshot ampliado"
              className="max-h-[85vh] max-w-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}
