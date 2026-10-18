/**
 * Converte unidades de envase (frascos, potes, bisnagas) para peso líquido em Kg
 * através de regex na descrição do produto.
 */
export function parseProductUnitWeightKg(descricao?: string): number {
  if (!descricao) return 1.0;
  const desc = descricao.toUpperCase();
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*(ML|L|GR|G|KG)\b/i);
  if (!m) return 1.0;

  const val = parseFloat(m[1].replace(',', '.'));
  if (isNaN(val) || val <= 0) return 1.0;

  const unit = m[2].toUpperCase();
  if (unit === 'KG' || unit === 'L') {
    return val;
  }
  if (unit === 'G' || unit === 'GR' || unit === 'ML') {
    return val / 1000.0;
  }
  return 1.0;
}

export function formatUnitsToKg(units: number, descricao?: string): string {
  if (!units || units <= 0) return '0 kg';
  const weight = parseProductUnitWeightKg(descricao);
  const totalKg = units * weight;
  return totalKg >= 10 ? `${Math.round(totalKg)} kg` : `${totalKg.toFixed(1)} kg`;
}
