/** Funções puras da sugestão automática de sequência (Planejamento Semanal). */

/**
 * Ordena reatores pelo menor em que a massa caiba (capacidade >= kg, do menor para o maior);
 * depois os que não comportam, do maior para o menor.
 */
export function ordenarReatoresPorCaber<T extends { capacidade_kg: number }>(reatores: T[], reqKg: number): T[] {
  const cabem = reatores.filter(r => r.capacidade_kg >= reqKg).sort((a, b) => a.capacidade_kg - b.capacidade_kg);
  const naoCabem = reatores.filter(r => r.capacidade_kg < reqKg).sort((a, b) => b.capacidade_kg - a.capacidade_kg);
  return [...cabem, ...naoCabem];
}

/**
 * Dias em que o produto pode entrar: nunca em dia já tomado por um exclusivo;
 * se o produto é exclusivo, só em dia sem nenhuma ordem (existente ou proposta).
 */
export function diasPermitidos<D extends { dateStr: string }>(
  dias: D[],
  exclusivo: boolean,
  diasOcupados: Set<string>,
  diasExclusivos: Set<string>,
): D[] {
  return dias.filter(d => !diasExclusivos.has(d.dateStr) && (!exclusivo || !diasOcupados.has(d.dateStr)));
}
