/** Helpers de embalagens na conversão (vira) — só registro próprio, sem estoque. */

export type ViraPackagingRole = 'return' | 'consume';

export interface ViraPackagingMeta {
  qtyDe: number;
  fator: number;
  qtyPara: number;
}

export interface ViraPackagingLine {
  code: string;
  description: string;
  qty: number;
  role: ViraPackagingRole;
  productCode: string;
  returned?: boolean;
  unitQty?: number;
}

export interface ViraPackagingDeductions {
  meta?: ViraPackagingMeta;
  items: ViraPackagingLine[];
}

export interface PackagingPreviewResponse {
  fator: number;
  qtyDe: number;
  qtyPara: number;
  returns: ViraPackagingLine[];
  consumes: ViraPackagingLine[];
  /** Fórmula de matéria-prima do par: igual (só muda embalagem/tamanho), diferente (troca fixa) ou indisponivel. */
  formula?: 'igual' | 'diferente' | 'indisponivel';
  /** Embalagens confirmadas na última ordem do mesmo par (JSON de `packaging_deductions`). */
  ultimaOrdem?: { orderNumber: string; packagingDeductions: string } | null;
}

export function parsePackagingDeductions(raw: string | null | undefined): ViraPackagingDeductions | null {
  if (!raw || !String(raw).trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { items: parsed as ViraPackagingLine[] };
    }
    if (parsed && Array.isArray(parsed.items)) {
      return parsed as ViraPackagingDeductions;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function serializePackagingDeductions(data: ViraPackagingDeductions): string {
  return JSON.stringify({
    meta: data.meta,
    items: data.items.map((line) => {
      const base: ViraPackagingLine = {
        code: line.code,
        description: line.description,
        qty: Number(line.qty) || 0,
        role: line.role,
        productCode: line.productCode,
      };
      if (line.role === 'return') {
        base.returned = line.returned !== false;
      }
      return base;
    }),
  });
}

export function linesFromPreview(preview: PackagingPreviewResponse): ViraPackagingLine[] {
  const returns = (preview.returns || []).map((r) => ({
    ...r,
    role: 'return' as const,
    returned: r.returned !== false,
  }));
  const consumes = (preview.consumes || []).map((c) => ({
    ...c,
    role: 'consume' as const,
  }));
  return [...returns, ...consumes];
}

export function splitPackagingLines(items: ViraPackagingLine[]) {
  return {
    returns: items.filter((i) => i.role === 'return'),
    consumes: items.filter((i) => i.role === 'consume'),
  };
}

/**
 * Embalagens sugeridas para a conversão: as da última ordem do mesmo par (escaladas pela quantidade
 * de agora, mantendo o que voltou ou não); sem ordem anterior, as da formulação dos produtos.
 */
export function embalagensSugeridas(
  preview: PackagingPreviewResponse,
  qtyDe: number,
  qtyPara: number,
): { linhas: ViraPackagingLine[]; fonte: string } {
  const anterior = parsePackagingDeductions(preview.ultimaOrdem?.packagingDeductions);
  if (anterior && anterior.items.length > 0) {
    const baseDe = Number(anterior.meta?.qtyDe) || 0;
    const basePara = Number(anterior.meta?.qtyPara) || 0;
    if (baseDe > 0 && basePara > 0) {
      const linhas = anterior.items.map((l) => {
        const unit = l.role === 'return' ? l.qty / baseDe : l.qty / basePara;
        const qty = Math.round(unit * (l.role === 'return' ? qtyDe : qtyPara) * 10000) / 10000;
        return { ...l, qty, unitQty: unit, returned: l.role === 'return' ? l.returned !== false : undefined };
      });
      return { linhas, fonte: `última ordem deste par (${preview.ultimaOrdem?.orderNumber})` };
    }
  }
  return { linhas: linesFromPreview(preview), fonte: 'formulação dos produtos' };
}

/** Peso por unidade (kg) como texto curto: 0,1 → "100 g"; 5 → "5 kg". */
export function rotuloConteudo(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return '—';
  if (kg < 1) return `${Math.round(kg * 1000)} g`;
  return `${String(Math.round(kg * 1000) / 1000).replace('.', ',')} kg`;
}
