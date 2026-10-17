import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { DocFamily, DocRecord } from '../types';

interface Props {
  documents: DocRecord[];
  families: DocFamily[];
  loading: boolean;
  onNew: () => void;
  onOpen: (doc: DocRecord) => void;
}

export default function DocumentsTab({ documents, families, loading, onNew, onOpen }: Props) {
  const [q, setQ] = useState('');
  const [familyId, setFamilyId] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return documents.filter((d) => {
      if (familyId && d.familyId !== familyId) return false;
      if (!term) return true;
      const hay = [
        d.title,
        d.familyName,
        d.typeName,
        d.physicalLocation,
        d.physicalTag,
        d.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [documents, q, familyId]);

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar título, local, etiqueta…"
            className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>
        <select
          value={familyId}
          onChange={(e) => setFamilyId(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
        >
          <option value="">Todas as famílias</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white px-4 py-2.5 text-sm font-semibold hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
          Novo
        </button>
      </div>

      <div className="flex-1 overflow-auto rounded-2xl border border-zinc-200 bg-white">
        {loading ? (
          <div className="p-8 text-sm text-zinc-500">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">Nenhum documento encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Documento</th>
                <th className="px-4 py-3 font-semibold">Família</th>
                <th className="px-4 py-3 font-semibold">Validade</th>
                <th className="px-4 py-3 font-semibold">Local</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => {
                const fam = families.find((f) => f.id === doc.familyId);
                return (
                  <tr
                    key={doc.id}
                    onClick={() => onOpen(doc)}
                    className="border-b border-zinc-50 hover:bg-zinc-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-900">{doc.title}</div>
                      {doc.typeName && (
                        <div className="text-xs text-zinc-500">{doc.typeName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{doc.familyName ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-700">{doc.validUntil ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      <div className="truncate max-w-[180px]">{doc.physicalLocation || '—'}</div>
                      {doc.physicalTag && (
                        <div className="text-[11px] text-zinc-400">{doc.physicalTag}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge doc={doc} family={fam} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
