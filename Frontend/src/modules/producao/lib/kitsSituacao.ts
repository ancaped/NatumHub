/** Situação de um kit na Central de Kits. Lê os números que o servidor já calculou; não recalcula estoque. */
export type SituacaoKit = 'montar_agora' | 'falta_componente' | 'ok';

/**
 * `falta`: quanto ainda precisa montar (producao_recomendada do kit).
 * `montavelHoje`: quantos kits o estoque livre dos componentes monta agora (max_montavel_estoque, já sem a reserva das ordens abertas).
 */
export function situacaoKit(falta: number, montavelHoje: number): SituacaoKit {
  const f = Number(falta) || 0;
  const m = Number(montavelHoje) || 0;
  if (f <= 0) return 'ok';
  return m > 0 ? 'montar_agora' : 'falta_componente';
}

export type SituacaoComponente = 'cobre' | 'parcial' | 'zerado';

/** `cobre`: quantos kits o componente monta (kits_cobertos); `falta`: quantos kits faltam montar. */
export function situacaoComponente(cobre: number, falta: number): SituacaoComponente {
  const c = Number(cobre) || 0;
  const f = Number(falta) || 0;
  if (c <= 0) return 'zerado';
  if (f > 0 && c < f) return 'parcial';
  return 'cobre';
}

/** Componente que limita a montagem: o de menor `kits_cobertos` (empate: o primeiro da lista). */
export function componenteLimitante<T extends { kits_cobertos?: number | null }>(componentes: T[]): T | null {
  let pior: T | null = null;
  let piorN = Infinity;
  for (const c of componentes || []) {
    const n = Number(c?.kits_cobertos);
    const v = Number.isFinite(n) ? n : 0;
    if (v < piorN) {
      piorN = v;
      pior = c;
    }
  }
  return pior;
}
