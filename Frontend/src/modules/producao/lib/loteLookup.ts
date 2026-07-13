import type { LoteProductLine } from '../../geral/lib/types';
import { ApiError } from '../../geral/lib/http';

/** Rótulo legível incluindo gramatura estimada da descrição. */
export function loteProductLabel(p: LoteProductLine): string {
  const grams =
    p.unitWeightKg > 0 && p.unitWeightKg < 10
      ? ` · ${Math.round(p.unitWeightKg * 1000)}g`
      : p.unitWeightKg >= 10
        ? ` · ${p.unitWeightKg.toFixed(2)}kg`
        : '';
  return `${p.productDescription} (${p.productCode})${grams}`;
}

export function loteLookupErrorMessage(err: unknown, loteNumber: string): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return `Lote "${loteNumber}" não encontrado. Confira o número ou rode o Sync ERP.`;
    }
    if (err.status === 401) {
      return 'Sessão expirada. Faça login novamente.';
    }
    if (err.status === 403) {
      return 'Sem permissão para consultar lotes de produção.';
    }
    if (err.status === 0) {
      return err.message || 'Servidor inacessível. Verifique se o NatumHub está aberto.';
    }
    return err.message || `Erro ao consultar lote (HTTP ${err.status}).`;
  }
  return 'Erro ao consultar lote.';
}
