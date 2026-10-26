import { eBase } from '../../geral/lib/regrasProduto';

/**
 * Peso líquido (kg) de uma unidade (frasco, pote, bisnaga), lido da medida na descrição do produto.
 * Sem medida válida na descrição o peso é DESCONHECIDO (`null`): quem usa decide (não converter, mostrar "—").
 */
export function parseProductUnitWeightKg(descricao?: string, ehBase = false): number | null {
  if (ehBase) return 1.0; // base é medida em kg: 1 un = 1 kg
  if (!descricao) return null;
  const desc = descricao.toUpperCase();
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*(ML|L|GR|G|KG)\b/i);
  if (!m) return null;

  const val = parseFloat(m[1].replace(',', '.'));
  if (isNaN(val) || val <= 0) return null;

  const unit = m[2].toUpperCase();
  if (unit === 'KG' || unit === 'L') return val;
  return val / 1000.0; // G, GR, ML
}

/** Kg em unidades (arredondado); `null` quando o peso unitário é desconhecido. */
export function unidadesDeKg(kg: number, descricao?: string, ehBase = false): number | null {
  const weight = parseProductUnitWeightKg(descricao, ehBase);
  return weight == null ? null : Math.round(kg / weight);
}

/** Unidades em kg; `null` quando o peso unitário é desconhecido. */
export function unidadesParaKg(units: number, descricao?: string, ehBase = false): number | null {
  const weight = parseProductUnitWeightKg(descricao, ehBase);
  return weight == null ? null : units * weight;
}

export function formatUnitsToKg(units: number, descricao?: string, ehBase = false): string {
  if (!units || units <= 0) return '0 kg';
  const totalKg = unidadesParaKg(units, descricao, ehBase);
  if (totalKg == null) return '— kg';
  return totalKg >= 10 ? `${Math.round(totalKg)} kg` : `${totalKg.toFixed(1)} kg`;
}

/** Base de produção (categoria `cat_base`, status `bases`, código ".36." ou descrição "BASE ..."): peso unitário 1 kg. */
export function ehBaseProduto(p: { codigo?: string | null; descricao?: string | null; categoria_produto?: string | null; status_produto?: string | null }): boolean {
  return eBase(p.codigo, p.categoria_produto, p.status_produto) || (p.descricao || '').toUpperCase().startsWith('BASE ');
}
