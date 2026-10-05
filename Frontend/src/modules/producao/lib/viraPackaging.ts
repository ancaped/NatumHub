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
