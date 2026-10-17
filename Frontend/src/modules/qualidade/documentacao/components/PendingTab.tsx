import React, { useMemo } from 'react';
import { StatusBadge } from './StatusBadge';
import { isPendingDoc, primaryDocStatus, type DocFamily, type DocRecord } from '../types';

interface Props {
  documents: DocRecord[];
  families: DocFamily[];
  onOpen: (doc: DocRecord) => void;
}

export default function PendingTab({ documents, families, onOpen }: Props) {
  const pending = useMemo(() => {
    return documents
      .filter((d) => isPendingDoc(d, families.find((f) => f.id === d.familyId)))
      .sort((a, b) => {
        const order = { expired: 0, payment_pending: 1, due_soon: 2, ok: 3 } as const;
        const fa = families.find((f) => f.id === a.familyId);
        const fb = families.find((f) => f.id === b.familyId);
        return order[primaryDocStatus(a, fa)] - order[primaryDocStatus(b, fb)];
      });
  }, [documents, families]);

  const counts = useMemo(() => {
    let expired = 0;
    let dueSoon = 0;
    let payment = 0;
    for (const d of pending) {
      const fam = families.find((f) => f.id === d.familyId);
      const s = primaryDocStatus(d, fam);
      if (s === 'expired') expired += 1;
      else if (s === 'due_soon') dueSoon += 1;
      else if (s === 'payment_pending') payment += 1;
    }
    return { expired, dueSoon, payment };
  }, [pending, families]);

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
          Vencidos {counts.expired}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
          A vencer {counts.dueSoon}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
          Pagamento {counts.payment}
        </span>
      </div>

      <div className="flex-1 overflow-auto rounded-2xl border border-zinc-200 bg-white">
        {pending.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">Nenhuma pendência no momento.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {pending.map((doc) => {
              const fam = families.find((f) => f.id === doc.familyId);
              return (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(doc)}
                    className="w-full text-left px-4 py-3 hover:bg-zinc-50 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-zinc-900 truncate">{doc.title}</div>
                      <div className="text-xs text-zinc-500 truncate">
                        {[doc.familyName, doc.validUntil ? `val. ${doc.validUntil}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <StatusBadge doc={doc} family={fam} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
