/** Necessidade física de componente para N kits (sempre inteiro quando fracionado). */
export function kitComponentNeedQty(
  qtyPerKit: number,
  kitCount: number,
  fatQtd?: number | null,
  fatKits?: number | null,
): number {
  const kits = Number(kitCount) || 0;
  if (kits <= 0) return 0;

  const fq = fatQtd != null ? Number(fatQtd) : NaN;
  const fk = fatKits != null ? Number(fatKits) : NaN;
  if (Number.isFinite(fq) && Number.isFinite(fk) && fq > 0 && fk > 0) {
    return Math.ceil(kits / fk) * fq;
  }

  const per = Number(qtyPerKit) || 0;
  if (per <= 0) return 0;
  const raw = per * kits;
  if (Math.abs(raw - Math.round(raw)) < 1e-6) return Math.round(raw);
  return Math.ceil(raw - 1e-9);
}

/** Rótulo amigável da proporção por kit. */
export function formatQtyPerKitLabel(
  qtyPerKit: number,
  fatQtd?: number | null,
  fatKits?: number | null,
): string {
  const fq = fatQtd != null ? Number(fatQtd) : NaN;
  const fk = fatKits != null ? Number(fatKits) : NaN;
  if (Number.isFinite(fq) && Number.isFinite(fk) && fq > 0 && fk > 1) {
    return `${fq} un / ${fk} kits`;
  }
  const per = Number(qtyPerKit) || 0;
  if (Number.isInteger(per) || Math.abs(per - Math.round(per)) < 1e-6) {
    return `${Math.round(per)} un/kit`;
  }
  return `${per.toFixed(4).replace(/\.?0+$/, '')} un/kit`;
}

/** Necessidade a partir do JSON salvo na ordem. */
export function kitOrderComponentNeed(
  item: {
    expected_qty?: number;
    fator_proporcao_qtd?: number | null;
    fator_proporcao_kits?: number | null;
  },
  kitCount: number,
): number {
  return kitComponentNeedQty(
    Number(item.expected_qty) || 1,
    kitCount,
    item.fator_proporcao_qtd,
    item.fator_proporcao_kits,
  );
}
