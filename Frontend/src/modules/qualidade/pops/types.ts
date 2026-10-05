export type PopStatus = 'draft' | 'published' | 'obsolete';
export type ChangeKind = 'initial' | 'revalidate' | 'content';

export interface PopContent {
  body: string;
  elaboratedAt?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
}

export interface PopSector {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface PopVersion {
  id: string;
  documentId: string;
  revision: number;
  effectiveDate: string;
  nextReviewDate: string;
  changeKind: ChangeKind | string;
  changeSummary?: string | null;
  content: PopContent;
  elaboratedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface PopDocument {
  id: string;
  code: string;
  title: string;
  sectorId: string;
  sectorName?: string | null;
  currentRevision: number;
  effectiveDate?: string | null;
  nextReviewDate?: string | null;
  status: PopStatus | string;
  elaboratedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  currentVersionId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion?: PopVersion | null;
  daysToReview?: number | null;
}

export interface PopSettings {
  logoUrl?: string | null;
  logoRelPath?: string | null;
}

export function emptyContent(): PopContent {
  return {
    body: '',
    elaboratedAt: null,
    reviewedAt: null,
    approvedAt: null,
  };
}

/** Aceita formato novo (body) ou legado (8 seções) ou string JSON. */
export function normalizeContent(raw: unknown): PopContent {
  if (!raw) return emptyContent();
  let o = raw;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return { body: o as string, elaboratedAt: null, reviewedAt: null, approvedAt: null };
    }
  }
  if (!o || typeof o !== 'object') return emptyContent();
  const rec = o as Record<string, unknown>;
  if (typeof rec.body === 'string') {
    return {
      body: rec.body,
      elaboratedAt: (rec.elaboratedAt as string) ?? null,
      reviewedAt: (rec.reviewedAt as string) ?? null,
      approvedAt: (rec.approvedAt as string) ?? null,
    };
  }
  const sections: [string, string][] = [
    ['objetivo', 'Objetivo'],
    ['condicoes', 'Condições necessárias'],
    ['responsabilidades', 'Responsabilidades'],
    ['procedimento', 'Procedimento / Atividades'],
    ['formasControle', 'Formas de controle'],
    ['observacoes', 'Observações / Anormalidades'],
    ['registros', 'Registros'],
    ['referencia', 'Referência'],
  ];
  const parts: string[] = [];
  for (const [key, label] of sections) {
    const text = String(o[key] ?? '').trim();
    if (text) parts.push(`${label}\n${text}`);
  }
  return { body: parts.join('\n\n'), elaboratedAt: null, reviewedAt: null, approvedAt: null };
}

export function reviewBadge(days: number | null | undefined): {
  label: string;
  className: string;
} | null {
  if (days == null) return null;
  if (days < 0) return { label: 'Vencido', className: 'bg-red-100 text-red-800' };
  if (days <= 7) return { label: `${days}d`, className: 'bg-amber-100 text-amber-900' };
  if (days <= 15) return { label: `${days}d`, className: 'bg-amber-50 text-amber-800' };
  if (days <= 30) return { label: `${days}d`, className: 'bg-yellow-50 text-yellow-800' };
  return null;
}
