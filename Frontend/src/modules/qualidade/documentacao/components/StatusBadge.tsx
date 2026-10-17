import React from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Wallet } from 'lucide-react';
import { primaryDocStatus, type DocFamily, type DocRecord, type DocStatus } from '../types';

const STYLES: Record<DocStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  due_soon: 'bg-amber-50 text-amber-700 border-amber-200',
  expired: 'bg-red-50 text-red-600 border-red-200',
  payment_pending: 'bg-amber-50 text-amber-800 border-amber-200',
};

const LABELS: Record<DocStatus, string> = {
  ok: 'Em dia',
  due_soon: 'A vencer',
  expired: 'Vencido',
  payment_pending: 'Pagamento',
};

export function StatusBadge({
  doc,
  family,
}: {
  doc: DocRecord;
  family?: DocFamily | null;
}) {
  const status = primaryDocStatus(doc, family);
  const Icon =
    status === 'expired'
      ? AlertTriangle
      : status === 'due_soon'
        ? Clock3
        : status === 'payment_pending'
          ? Wallet
          : CheckCircle2;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${STYLES[status]}`}
    >
      <Icon className="h-3 w-3" />
      {LABELS[status]}
    </span>
  );
}
