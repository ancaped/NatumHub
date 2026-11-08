import React, { useState } from 'react';
import { Terminal, Image as ImageIcon, Send, Copy, Check, ChevronUp, ChevronDown, Maximize2, Loader2 } from 'lucide-react';
import type { Feedback, FeedbackDetail, FeedbackNote } from '../types';
import Drawer from '../../components/ui/Drawer';
import { StatusBadge } from '../../components/ui/ReportKit';
import { statusChamado, tipoChamado } from '../rotulos';
import Modal from '../../components/ui/Modal';

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
      await onAddNote(feedback.id, body, currentUser?.displayName || '');
      setNewNote('');
    } finally {
      setSendingNote(false);
    }
  };

  const decisoes: { status: string; rotulo: string; primaria?: boolean }[] =
    feedback.status === 'awaiting_review'
      ? [{ status: 'queued', rotulo: 'Devolver para a fila' }, { status: 'resolved', rotulo: 'Aprovar', primaria: true }]
      : feedback.status === 'pending'
        ? [{ status: 'wont_fix', rotulo: 'Recusar' }, { status: 'queued', rotulo: 'Mandar para a fila', primaria: true }]
        : feedback.status === 'queued' || feedback.status === 'in_progress'
          ? [{ status: 'awaiting_review', rotulo: 'Marcar como entregue', primaria: true }]
          : [];

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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-sans text-xs text-zinc-500 pt-0.5">
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
            <StatusBadge variante={tipoChamado(feedback.feedbackType).variante}>{tipoChamado(feedback.feedbackType).rotulo}</StatusBadge>

            <button
              type="button"
              onClick={handleCopyId}
              className="flex items-center gap-1 text-[10px] font-mono text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
              title="Copiar ID completo"
            >
              <span>{feedback.id.slice(0, 8)}</span>
              {copiedId ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Copy className="h-2.5 w-2.5 text-zinc-400" />}
            </button>

            <StatusBadge variante="descontinuado">{statusChamado(feedback.status)}</StatusBadge>
          </div>
        }
        footer={
          decisoes.length > 0 ? (
            <div className="w-full flex flex-wrap items-center justify-end gap-2">
              {decisoes.map((d) => (
                <button
                  key={d.status}
                  type="button"
                  onClick={() => void handleStatusChange(d.status)}
                  disabled={actionLoading}
                  className={d.primaria ? 'min-h-[44px] sm:min-h-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex-1 sm:flex-none bg-zinc-900 hover:bg-zinc-800 text-white' : 'min-h-[44px] sm:min-h-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800'}
                >
                  {d.rotulo}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        <div className="space-y-5">
          {/* Alerta de Homologação se awaiting_review */}
          {feedback.status === 'awaiting_review' && (
            <p className="p-3 rounded-xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-700">
              Entregue. Confira a nota, a captura e a tela antes de aprovar.
            </p>
          )}

          {/* Screenshot do Operador */}
          {hasShot && (
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /> Captura de tela
                </span>
                <button
                  type="button"
                  onClick={() => setShowFullImage(true)}
                  className="text-xs font-bold text-zinc-700 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Ampliar</span>
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
                  className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5 cursor-pointer"
                >
                  <Terminal className="h-3.5 w-3.5 text-zinc-500" />
                  <span>Erros do navegador</span>
                  {logsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="text-xs font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
                >
                  {copiedLogs ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
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
            <span className="text-xs font-semibold text-zinc-600 block">
              Notas ({feedback.notes?.length || 0})
            </span>

            <div className="space-y-3">
              {(feedback.notes || []).map((n) => {
                const isAi = isAiAuthor(n.author || '');
                return (
                  <div key={n.id} className="p-3 rounded-xl border border-zinc-200 bg-white text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-semibold text-zinc-900">
                        {n.author}
                        {isAi && <StatusBadge variante="apoio">IA</StatusBadge>}
                      </span>
                      <span className="text-[11px] text-zinc-400">{formatDateTime(n.createdAt)}</span>
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed text-zinc-800">
                      {n.body}
                    </p>
                  </div>
                );
              })}

              {!feedback.notes?.length && (
                <p className="text-xs text-zinc-400 py-1">Nenhuma nota.</p>
              )}
            </div>

            {/* Inserir Nova Nota */}
            <form onSubmit={handleSendNote} className="space-y-2 pt-2 border-t border-zinc-100">
              <label className="text-xs font-semibold text-zinc-600 block">
                Nova nota{currentUser?.displayName ? ` (como ${currentUser.displayName})` : ''}
              </label>

              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Observação ou instrução para quem for resolver"
                  rows={2}
                  className="flex-1 border border-zinc-200 rounded-xl p-2.5 text-xs bg-white text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <button
                  type="submit"
                  disabled={sendingNote || !newNote.trim()}
                  className="min-w-[44px] px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40"
                >
                  {sendingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
          </div>
        </div>

      </Drawer>

      {/* Modal de Zoom do Screenshot em Tela Cheia */}
      {showFullImage && (
        <Modal onClose={() => setShowFullImage(false)} title="Captura de tela" size="max">
          <img
            src={shotUrl}
            alt="Captura de tela ampliada"
            className="max-h-[75dvh] w-full object-contain rounded-lg"
          />
        </Modal>
      )}
    </>
  );
}
