import { salesOrderStatusLabel } from '../../../geral/lib/salesOrderStatus';

/** Cores de pill para CSTATUS do ERP Natum. */
export const SALES_ORDER_STATUS_COLORS: Record<string, string> = {
  FT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CA: 'bg-rose-50 text-rose-700 border-rose-200',
  FP: 'bg-amber-50 text-amber-700 border-amber-200',
  EX: 'bg-sky-50 text-sky-700 border-sky-200',
  PP: 'bg-violet-50 text-violet-700 border-violet-200',
  CF: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  LB: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  AL: 'bg-orange-50 text-orange-700 border-orange-200',
};

export function salesOrderStatusColor(code: string | null | undefined): string {
  if (!code) return 'bg-zinc-50 text-zinc-500 border-zinc-200';
  const trimmed = code.trim();
  return SALES_ORDER_STATUS_COLORS[trimmed] || 'bg-zinc-50 text-zinc-600 border-zinc-200';
}

export { salesOrderStatusLabel };

/** Chave composta ERP: n_pedido + d_pedido (YYYY-MM-DD). */
export function salesOrderKey(nPedido: number, dPedido: string): string {
  const d = (dPedido || '').trim();
  const ymd = d.length >= 10 ? d.slice(0, 10) : d;
  return `${nPedido}|${ymd}`;
}

export function formatSalesDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return dateStr.slice(0, 10);
    return d.toLocaleDateString('pt-BR');
  } catch {
    return String(dateStr).slice(0, 10);
  }
}

export function formatSalesCurrency(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

export const OPEN_STATUS_CODES = ['PP', 'AL', 'LB', 'EX', 'CF'] as const;

export const STATUS_FILTER_CHIPS: { id: string; label: string }[] = [
  { id: 'ativos', label: 'Abertos' },
  { id: 'PP', label: 'Pré-pedido' },
  { id: 'AL', label: 'Aguard. lib.' },
  { id: 'LB', label: 'Liberado' },
  { id: 'EX', label: 'Expedição' },
  { id: 'CF', label: 'Conferido' },
  { id: 'concluidos', label: 'Concluídos' },
  { id: 'ALL', label: 'Todos' },
];
