import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Shield } from 'lucide-react';
import { apiJson } from '../lib/http';

interface AuditEvent {
  id: string;
  createdAt: string;
  actorId?: string | null;
  actorName?: string | null;
  deviceId?: string | null;
  moduleKey?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  requestMethod?: string | null;
  requestPath?: string | null;
  provenance: string;
}

interface Props {
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

export default function AuditoriaPanel({ setMessage }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleKey, setModuleKey] = useState('');
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '150');
      if (search.trim()) params.set('search', search.trim());
      if (moduleKey.trim()) params.set('module_key', moduleKey.trim());
      const rows = await apiJson<AuditEvent[]>(`/admin/audit/events?${params.toString()}`);
      setEvents(Array.isArray(rows) ? rows : []);
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Falha ao carregar auditoria',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [search, moduleKey, setMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
        <div className="p-2 bg-zinc-900 text-white rounded-xl">
          <Shield className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-black text-sm tracking-tight">Auditoria</h3>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            Trilha app-wide · hub_audit_events
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar resumo / path / entidade"
          className="flex-1 min-w-[180px] rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
        <input
          value={moduleKey}
          onChange={(e) => setModuleKey(e.target.value)}
          placeholder="module_key"
          className="w-48 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500 py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando eventos…
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4">Nenhum evento ainda.</p>
      ) : (
        <div className="max-h-96 overflow-auto rounded-xl border border-zinc-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Quem</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr
                  key={ev.id}
                  onClick={() => setSelected(ev)}
                  className="border-t border-zinc-50 hover:bg-zinc-50 cursor-pointer"
                >
                  <td className="px-3 py-2 text-xs text-zinc-500 whitespace-nowrap">
                    {new Date(ev.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-2 text-xs">{ev.actorName || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] font-bold uppercase text-zinc-600">
                      {ev.action}
                    </span>
                    {ev.moduleKey && (
                      <div className="text-[10px] text-zinc-400">{ev.moduleKey}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-700 truncate max-w-[280px]">
                    {ev.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase text-zinc-500">Detalhe</p>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-900"
              onClick={() => setSelected(null)}
            >
              Fechar
            </button>
          </div>
          <pre className="text-[11px] overflow-auto max-h-48 whitespace-pre-wrap">
            {JSON.stringify(selected, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
