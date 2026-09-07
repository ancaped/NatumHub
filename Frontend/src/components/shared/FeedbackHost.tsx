import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  setConfirmHandler,
  setToastListener,
  type ConfirmRequest,
  type ToastPayload,
  type ToastType,
} from './feedback';

const TOAST_MS = 3500;

function toastClasses(type: ToastType) {
  switch (type) {
    case 'success':
      return 'bg-emerald-950 text-emerald-100 border-emerald-800';
    case 'error':
      return 'bg-red-950 text-red-100 border-red-800';
    default:
      return 'bg-zinc-900 text-zinc-100 border-zinc-700';
  }
}

function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (type === 'error') return <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />;
  return <Info className="h-4 w-4 text-zinc-300 shrink-0" />;
}

export function FeedbackHost({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    setToastListener((toast) => {
      setToasts((prev) => [...prev, toast]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, TOAST_MS);
    });
    return () => setToastListener(null);
  }, []);

  const closeConfirm = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setConfirmState(null);
  }, []);

  useEffect(() => {
    setConfirmHandler((req) => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setConfirmState(req);
      });
    });
    return () => setConfirmHandler(null);
  }, []);

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmState, closeConfirm]);

  return (
    <>
      {children}

      <div className="fixed top-16 right-6 z-[80] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto px-4 py-2.5 rounded-xl border text-xs font-bold shadow-lg flex items-center gap-2 max-w-sm animate-in fade-in slide-in-from-top-3 duration-200',
              toastClasses(toast.type)
            )}
          >
            <ToastIcon type={toast.type} />
            <span className="leading-snug">{toast.text}</span>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/40"
            aria-label="Cancelar"
            onClick={() => closeConfirm(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative bg-white rounded-2xl border border-zinc-200 shadow-xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                  {confirmState.title || 'Confirmar ação'}
                </h2>
                <p className="text-sm text-zinc-500 mt-1 leading-relaxed whitespace-pre-wrap">
                  {confirmState.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                {confirmState.cancelLabel || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => closeConfirm(true)}
                autoFocus
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer',
                  confirmState.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-zinc-950 hover:bg-zinc-800'
                )}
              >
                {confirmState.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
