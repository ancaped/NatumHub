export type PaymentStatus = 'nao_aplica' | 'pendente' | 'pago';
export type DocStatus = 'ok' | 'due_soon' | 'expired' | 'payment_pending';
export type FileKind = 'documento' | 'comprovante';

export interface DocFamily {
  id: string;
  name: string;
  code?: string | null;
  warnDays: number[];
  requiresPayment: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocType {
  id: string;
  familyId: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface DocumentFile {
  id: string;
  documentId: string;
  kind: FileKind | string;
  originalName: string;
  relPath: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface DocRecord {
  id: string;
  familyId: string;
  typeId?: string | null;
  title: string;
  physicalLocation?: string | null;
  physicalTag?: string | null;
  issuedAt?: string | null;
  validUntil?: string | null;
  paymentStatus: PaymentStatus | string;
  paymentAmount?: number | null;
  paymentDueAt?: string | null;
  paymentMethod?: string | null;
  paymentPaidAt?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  familyName?: string | null;
  typeName?: string | null;
  files: DocumentFile[];
}

export interface DocumentInput {
  familyId: string;
  typeId?: string | null;
  title: string;
  physicalLocation?: string | null;
  physicalTag?: string | null;
  issuedAt?: string | null;
  validUntil?: string | null;
  paymentStatus?: PaymentStatus | string;
  paymentAmount?: number | null;
  paymentDueAt?: string | null;
  paymentMethod?: string | null;
  paymentPaidAt?: string | null;
  notes?: string | null;
}

export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function deriveDocStatus(doc: DocRecord, family?: DocFamily | null): DocStatus[] {
  const statuses: DocStatus[] = [];
  if (doc.paymentStatus === 'pendente') statuses.push('payment_pending');

  const left = daysUntil(doc.validUntil);
  if (left != null) {
    if (left < 0) {
      statuses.push('expired');
    } else {
      const warn = family?.warnDays?.length ? Math.max(...family.warnDays) : 30;
      if (left <= warn) statuses.push('due_soon');
    }
  }

  if (statuses.length === 0) statuses.push('ok');
  return statuses;
}

export function primaryDocStatus(doc: DocRecord, family?: DocFamily | null): DocStatus {
  const s = deriveDocStatus(doc, family);
  if (s.includes('expired')) return 'expired';
  if (s.includes('payment_pending')) return 'payment_pending';
  if (s.includes('due_soon')) return 'due_soon';
  return 'ok';
}

export function isPendingDoc(doc: DocRecord, family?: DocFamily | null): boolean {
  const s = deriveDocStatus(doc, family);
  return s.includes('expired') || s.includes('due_soon') || s.includes('payment_pending');
}
