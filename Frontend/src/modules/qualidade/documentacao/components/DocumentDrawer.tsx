import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { apiFetch, apiJson } from '../../../geral/lib/http';
import type { DocFamily, DocRecord, DocType, DocumentInput, PaymentStatus } from '../types';

interface Props {
  open: boolean;
  families: DocFamily[];
  types: DocType[];
  document: DocRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

const emptyForm = (): DocumentInput & { paymentStatus: PaymentStatus } => ({
  familyId: '',
  typeId: '',
  title: '',
  physicalLocation: '',
  physicalTag: '',
  issuedAt: '',
  validUntil: '',
  paymentStatus: 'nao_aplica',
  paymentAmount: null,
  paymentDueAt: '',
  paymentMethod: '',
  paymentPaidAt: '',
  notes: '',
});

export default function DocumentDrawer({
  open,
  families,
  types,
  document,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<{ kind: 'documento' | 'comprovante'; file: File }[]>(
    []
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPendingFiles([]);
    if (document) {
      setForm({
        familyId: document.familyId,
        typeId: document.typeId ?? '',
        title: document.title,
        physicalLocation: document.physicalLocation ?? '',
        physicalTag: document.physicalTag ?? '',
        issuedAt: document.issuedAt ?? '',
        validUntil: document.validUntil ?? '',
        paymentStatus: (document.paymentStatus as PaymentStatus) || 'nao_aplica',
        paymentAmount: document.paymentAmount ?? null,
        paymentDueAt: document.paymentDueAt ?? '',
        paymentMethod: document.paymentMethod ?? '',
        paymentPaidAt: document.paymentPaidAt ?? '',
        notes: document.notes ?? '',
      });
    } else {
      const first = families.find((f) => f.active) ?? families[0];
      const base = emptyForm();
      if (first) {
        base.familyId = first.id;
        base.paymentStatus = first.requiresPayment ? 'pendente' : 'nao_aplica';
      }
      setForm(base);
    }
  }, [open, document, families]);

  const familyTypes = useMemo(
    () => types.filter((t) => t.familyId === form.familyId && t.active),
    [types, form.familyId]
  );

  const selectedFamily = families.find((f) => f.id === form.familyId);

  if (!open) return null;

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onFamilyChange = (familyId: string) => {
    const fam = families.find((f) => f.id === familyId);
    setForm((prev) => ({
      ...prev,
      familyId,
      typeId: '',
      paymentStatus:
        fam?.requiresPayment && prev.paymentStatus === 'nao_aplica'
          ? 'pendente'
          : !fam?.requiresPayment && prev.paymentStatus !== 'pago'
            ? 'nao_aplica'
            : prev.paymentStatus,
    }));
  };

  const uploadFile = async (docId: string, kind: 'documento' | 'comprovante', file: File) => {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    await apiJson(`/qualidade/documentacao/documents/${docId}/files`, {
      method: 'POST',
      body: fd,
    });
  };

  const save = async () => {
    if (!form.title.trim() || !form.familyId) {
      setError('Título e família são obrigatórios');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: DocumentInput = {
        familyId: form.familyId,
        typeId: form.typeId || null,
        title: form.title.trim(),
        physicalLocation: form.physicalLocation || null,
        physicalTag: form.physicalTag || null,
        issuedAt: form.issuedAt || null,
        validUntil: form.validUntil || null,
        paymentStatus: form.paymentStatus,
        paymentAmount: form.paymentAmount,
        paymentDueAt: form.paymentDueAt || null,
        paymentMethod: form.paymentMethod || null,
        paymentPaidAt: form.paymentPaidAt || null,
        notes: form.notes || null,
      };

      let docId = document?.id;
      if (document) {
        await apiJson(`/qualidade/documentacao/documents/${document.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        const created = await apiJson<DocRecord>('/qualidade/documentacao/documents', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        docId = created.id;
      }

      if (docId && pendingFiles.length) {
        for (const pf of pendingFiles) {
          await uploadFile(docId, pf.kind, pf.file);
        }
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const removeExistingFile = async (fileId: string) => {
    if (!confirm('Remover este arquivo?')) return;
    setBusy(true);
    try {
      await apiJson(`/qualidade/documentacao/files/${fileId}`, { method: 'DELETE' });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao remover arquivo');
    } finally {
      setBusy(false);
    }
  };

  const downloadFile = async (fileId: string, name: string) => {
    const res = await apiFetch(`/qualidade/documentacao/files/${fileId}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputClass =
    'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400';
  const labelClass = 'block text-xs font-semibold text-zinc-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-900/40">
      <button type="button" className="flex-1 cursor-default" aria-label="Fechar" onClick={onClose} />
      <aside className="w-full max-w-lg h-full bg-white border-l border-zinc-200 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div>
            <p className="text-sm font-bold text-zinc-900">
              {document ? 'Editar documento' : 'Novo documento'}
            </p>
            <p className="text-xs text-zinc-500">Metadados, localização e PDFs</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass}>Título *</label>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Família *</label>
              <select
                className={inputClass}
                value={form.familyId}
                onChange={(e) => onFamilyChange(e.target.value)}
              >
                <option value="">Selecione</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tipo</label>
              <select
                className={inputClass}
                value={form.typeId ?? ''}
                onChange={(e) => setField('typeId', e.target.value)}
              >
                <option value="">—</option>
                {familyTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Localização física</label>
              <input
                className={inputClass}
                value={form.physicalLocation ?? ''}
                onChange={(e) => setField('physicalLocation', e.target.value)}
                placeholder="Armário / pasta / sala"
              />
            </div>
            <div>
              <label className={labelClass}>Etiqueta / código</label>
              <input
                className={inputClass}
                value={form.physicalTag ?? ''}
                onChange={(e) => setField('physicalTag', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Emitido em</label>
              <input
                type="date"
                className={inputClass}
                value={form.issuedAt ?? ''}
                onChange={(e) => setField('issuedAt', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Válido até</label>
              <input
                type="date"
                className={inputClass}
                value={form.validUntil ?? ''}
                onChange={(e) => setField('validUntil', e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Pagamento</p>
            {selectedFamily?.requiresPayment && (
              <p className="text-[11px] text-amber-700">Esta família exige controle de pagamento.</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Status</label>
                <select
                  className={inputClass}
                  value={form.paymentStatus}
                  onChange={(e) => setField('paymentStatus', e.target.value as PaymentStatus)}
                >
                  <option value="nao_aplica">Não se aplica</option>
                  <option value="pendente">Pendente</option>
                  <option value="pago">Pago</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Valor</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClass}
                  value={form.paymentAmount ?? ''}
                  onChange={(e) =>
                    setField('paymentAmount', e.target.value ? Number(e.target.value) : null)
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Vencimento</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.paymentDueAt ?? ''}
                  onChange={(e) => setField('paymentDueAt', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Pago em</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.paymentPaidAt ?? ''}
                  onChange={(e) => setField('paymentPaidAt', e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Forma de pagamento</label>
              <input
                className={inputClass}
                value={form.paymentMethod ?? ''}
                onChange={(e) => setField('paymentMethod', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Observações</label>
            <textarea
              className={`${inputClass} min-h-[72px]`}
              value={form.notes ?? ''}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Arquivos PDF</p>
            {document?.files?.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  className="flex-1 text-left truncate text-zinc-800 hover:underline"
                  onClick={() => void downloadFile(f.id, f.originalName)}
                >
                  <span className="text-[10px] font-bold uppercase text-zinc-400 mr-2">
                    {f.kind}
                  </span>
                  {f.originalName}
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                  onClick={() => void removeExistingFile(f.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {pendingFiles.map((pf, i) => (
              <div
                key={`${pf.kind}-${i}`}
                className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600"
              >
                <span className="text-[10px] font-bold uppercase text-zinc-400">{pf.kind}</span>
                <span className="flex-1 truncate">{pf.file.name}</span>
                <button
                  type="button"
                  className="p-1.5 rounded-lg hover:bg-zinc-100"
                  onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                <Upload className="h-3.5 w-3.5" />
                Documento
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setPendingFiles((prev) => [...prev, { kind: 'documento', file }]);
                    e.target.value = '';
                  }}
                />
              </label>
              <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                <Upload className="h-3.5 w-3.5" />
                Comprovante
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setPendingFiles((prev) => [...prev, { kind: 'comprovante', file }]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-zinc-100 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </aside>
    </div>
  );
}
