import { salesOrderStatusLabel } from '../../../geral/lib/salesOrderStatus';
import type { VarianteBadge } from '../../../geral/components/ui/ReportKit';
import type { AtendimentoPedido } from './types';

/** Variante do `StatusBadge` (ReportKit) para o CSTATUS do ERP Natum. */
const VARIANTE_STATUS: Record<string, VarianteBadge> = {
  FT: 'saudavel',
  CA: 'critico',
  FP: 'ordem',
  AL: 'ordem',
  EX: 'aguardando',
  LB: 'abundante',
  PP: 'apoio',
  CF: 'descontinuado',
};

export function salesOrderStatusVariante(code: string | null | undefined): VarianteBadge {
  return VARIANTE_STATUS[(code || '').trim()] ?? 'descontinuado';
}

export { salesOrderStatusLabel };

const ATENDIMENTO: Record<AtendimentoPedido, { rotulo: string; variante: VarianteBadge }> = {
  completo: { rotulo: 'Completo', variante: 'saudavel' },
  parcial: { rotulo: 'Parcial', variante: 'ordem' },
  sem_estoque: { rotulo: 'Sem estoque', variante: 'descontinuado' },
};

/** Rótulo e cor do selo de atendimento; `null` para pedido fora da conta. */
export function atendimentoUi(a: AtendimentoPedido | null | undefined) {
  return a ? ATENDIMENTO[a] ?? null : null;
}

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

/** Janelas (dias) oferecidas nas telas; `0` = sem limite. */
export const JANELAS_DIAS: { valor: string; rotulo: string }[] = [
  { valor: '30', rotulo: '30 dias' },
  { valor: '90', rotulo: '90 dias' },
  { valor: '180', rotulo: '180 dias' },
  { valor: '365', rotulo: '1 ano' },
  { valor: '0', rotulo: 'Sem limite' },
];
