/** Funções puras de exibição do lote (sem React), testáveis com `npm run test:unit`. */

/** Ordem do planejamento sem lote do ERP: o "número" é o id provisório (`PLAN_…` / `PL-…`). */
export function ehLotePlanejado(loteNumber?: string | null): boolean {
  const n = (loteNumber || '').trim().toUpperCase();
  return n.startsWith('PLAN_') || n.startsWith('PL-');
}

/** Texto do número do lote para tela: `#123` ou "Planejado". Nunca devolve o id provisório. */
export function rotuloLote(loteNumber?: string | null): string {
  if (ehLotePlanejado(loteNumber)) return 'Planejado';
  const n = (loteNumber || '').trim();
  return n ? `#${n}` : '—';
}

/**
 * Texto das unidades de um lote: `≈ 34 un` (o servidor calcula kg ÷ peso unitário);
 * sem peso unitário (`pesoDesconhecido`) ou sem quantidade, "—" (a tela mostra só os kg).
 */
export function textoUnidadesLote(
  lote: { quantity?: number | string | null; pesoDesconhecido?: boolean } | null | undefined
): { n: string; aprox: boolean } | null {
  if (!lote || lote.pesoDesconhecido) return null;
  const q = Number(lote.quantity || 0);
  if (!(q > 0)) return { n: '0', aprox: false };
  return { n: q.toLocaleString('pt-BR'), aprox: true };
}

/** Quantidade de ordens reais: números de lote do ERP distintos (OP com vários produtos conta 1; ordem só planejada não conta). */
export function contarLotesUnicos(lista: { loteNumber?: string | null }[]): number {
  const vistos = new Set<string>();
  for (const l of lista) {
    const n = (l.loteNumber || '').trim().toUpperCase();
    if (n && !ehLotePlanejado(n)) vistos.add(n);
  }
  return vistos.size;
}
