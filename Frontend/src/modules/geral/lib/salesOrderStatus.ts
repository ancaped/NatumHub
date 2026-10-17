/** Rótulos de status de pedido de venda (ERP Natum / Pedidos1.CSTATUS). */
export const SALES_ORDER_STATUS_LABELS: Record<string, string> = {
  FT: 'Faturado',
  CA: 'Cancelado',
  FP: 'Faturado parcial',
  EX: 'Expedição',
  PP: 'Pré-pedido',
  CF: 'Conferido',
  LB: 'Liberado',
  AL: 'Aguardando liberação',
};

export function salesOrderStatusLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const trimmed = code.trim();
  return SALES_ORDER_STATUS_LABELS[trimmed] || trimmed || '—';
}
