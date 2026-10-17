import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { apiJson } from '../../../geral/lib/http';
import type { DocFamily, DocType } from '../types';

interface Props {
  families: DocFamily[];
  types: DocType[];
  onChanged: () => void;
}

export default function FamiliesTab({ families, types, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [warnDays, setWarnDays] = useState('30,15,7');
  const [requiresPayment, setRequiresPayment] = useState(false);
  const [active, setActive] = useState(true);
  const [typeDrafts, setTypeDrafts] = useState<Record<string, string>>({});

  const sorted = useMemo(
    () => [...families].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [families]
  );

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setWarnDays('30,15,7');
    setRequiresPayment(false);
    setActive(true);
  };

  const parseWarn = (): number[] =>
    warnDays
      .split(/[,;\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a);

  const startEdit = (f: DocFamily) => {
    setEditingId(f.id);
    setName(f.name);
    setCode(f.code ?? '');
    setWarnDays((f.warnDays?.length ? f.warnDays : [30, 15, 7]).join(','));
    setRequiresPayment(f.requiresPayment);
    setActive(f.active);
  };

  const saveFamily = async () => {
    if (!name.trim()) {
      setError('Nome obrigatório');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        code: code.trim() || null,
        warnDays: parseWarn().length ? parseWarn() : [30, 15, 7],
        requiresPayment,
        active,
      };
      if (editingId) {
        await apiJson(`/qualidade/documentacao/families/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await apiJson('/qualidade/documentacao/families', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      resetForm();
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar família');
    } finally {
      setBusy(false);
    }
  };

  const deleteFamily = async (id: string) => {
    if (!confirm('Excluir esta família?')) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/qualidade/documentacao/families/${id}`, { method: 'DELETE' });
      if (editingId === id) resetForm();
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir');
    } finally {
      setBusy(false);
    }
  };

  const addType = async (familyId: string) => {
    const draft = (typeDrafts[familyId] ?? '').trim();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson('/qualidade/documentacao/types', {
        method: 'POST',
        body: JSON.stringify({ familyId, name: draft }),
      });
      setTypeDrafts((prev) => ({ ...prev, [familyId]: '' }));
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao criar tipo');
    } finally {
      setBusy(false);
    }
  };

  const deleteType = async (id: string) => {
    if (!confirm('Excluir este tipo?')) return;
    setBusy(true);
    try {
      await apiJson(`/qualidade/documentacao/types/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir tipo');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10';

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0">
      <div className="lg:w-80 shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
        <p className="text-sm font-bold text-zinc-900">
          {editingId ? 'Editar família' : 'Nova família'}
        </p>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-zinc-500 mb-1">Nome *</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-500 mb-1">Código</label>
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-500 mb-1">
            Antecedência (dias, vírgula)
          </label>
          <input
            className={inputClass}
            value={warnDays}
            onChange={(e) => setWarnDays(e.target.value)}
            placeholder="30,15,7"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={requiresPayment}
            onChange={(e) => setRequiresPayment(e.target.checked)}
          />
          Exige pagamento
        </label>
        {editingId && (
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ativa
          </label>
        )}
        <div className="flex gap-2 pt-1">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveFamily()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-2xl border border-zinc-200 bg-white">
        {sorted.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">Nenhuma família cadastrada.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {sorted.map((f) => {
              const familyTypes = types.filter((t) => t.familyId === f.id);
              return (
                <li key={f.id} className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(f)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="font-semibold text-zinc-900">
                        {f.name}
                        {!f.active && (
                          <span className="ml-2 text-[10px] uppercase text-zinc-400">inativa</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {[
                          f.code ? `cód. ${f.code}` : null,
                          `avisos ${f.warnDays?.join('/') || '30/15/7'}`,
                          f.requiresPayment ? 'pagamento' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteFamily(f.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="pl-1 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                      Tipos
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {familyTypes.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
                        >
                          {t.name}
                          <button
                            type="button"
                            className="text-zinc-400 hover:text-red-500"
                            onClick={() => void deleteType(t.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2 max-w-md">
                      <input
                        className={inputClass}
                        placeholder="Novo tipo"
                        value={typeDrafts[f.id] ?? ''}
                        onChange={(e) =>
                          setTypeDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void addType(f.id);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void addType(f.id)}
                        className="rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
