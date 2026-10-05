import React, { useCallback, useEffect, useState } from 'react';
import { Database, HardDrive, Loader2, RefreshCw } from 'lucide-react';
import { apiJson } from '../lib/http';

interface TableUsage {
  table: string;
  rows: number;
  bytes: number;
  sizePretty: string;
}

interface DbUsagePayload {
  databaseBytes: number;
  databaseSizePretty: string;
  freeTierReferenceBytes?: number;
  freeTierReferencePretty?: string;
  percentOfFreeTier?: number;
  tables: TableUsage[];
  note?: string;
  provider?: string;
  hostMasked?: string;
}

interface PostgresUsagePanelProps {
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

function providerLabel(provider?: string): string {
  switch (provider) {
    case 'supabase':
      return 'Supabase';
    case 'local':
      return 'Local / LAN';
    default:
      return 'PostgreSQL';
  }
}

export default function PostgresUsagePanel({ setMessage }: PostgresUsagePanelProps) {
  const [data, setData] = useState<DbUsagePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const load = useCallback(async (toast = false) => {
    setLoading(true);
    try {
      const payload = await apiJson<DbUsagePayload>('/admin/db-usage');
      setData(payload);
      if (toast) {
        const freeHint =
          payload.provider === 'supabase' && payload.percentOfFreeTier != null
            ? ` (~${payload.percentOfFreeTier}% da ref. free)`
            : '';
        setMessage({
          text: `Uso PostgreSQL: ${payload.databaseSizePretty}${freeHint}`,
          type: 'success',
        });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao carregar uso do banco',
        type: 'error',
      });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [setMessage]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const showFreeTier = data?.provider === 'supabase' && data.percentOfFreeTier != null;
  const pct = Math.min(100, Math.max(0, data?.percentOfFreeTier ?? 0));
  const barColor =
    pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-500';

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-sm tracking-tight">Dados no PostgreSQL</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Uso estimado · {providerLabel(data?.provider)}
              {data?.hostMasked ? ` · ${data.hostMasked}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading || bootstrapping}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </button>
        </div>
      </div>

      {data ? (
        <>
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-2xl font-black text-zinc-900 tracking-tight">
                  {data.databaseSizePretty}
                </p>
                {showFreeTier ? (
                  <p className="text-[11px] text-zinc-500">
                    Referência free ~{data.freeTierReferencePretty} · {data.percentOfFreeTier}%
                  </p>
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    Tamanho do banco atual (sem cota de cloud)
                  </p>
                )}
              </div>
            </div>
            {showFreeTier ? (
              <div className="h-2.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-bold">Tabela</th>
                  <th className="px-3 py-2 font-bold text-right">Linhas*</th>
                  <th className="px-3 py-2 font-bold text-right">Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {(data.tables || []).slice(0, 15).map((t) => (
                  <tr key={t.table} className="border-t border-zinc-100">
                    <td className="px-3 py-1.5 font-mono text-[11px] text-zinc-800">{t.table}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                      {t.rows.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-800">{t.sizePretty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-zinc-400 leading-relaxed">
            {data.note || '*Estimativa (pg_stat).'}
          </p>
        </>
      ) : (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-6 justify-center">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Carregando uso…' : 'Sem dados'}
        </div>
      )}
    </div>
  );
}
