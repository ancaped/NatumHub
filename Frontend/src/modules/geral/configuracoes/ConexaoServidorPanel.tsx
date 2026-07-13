import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, Loader2, Database } from 'lucide-react';
import {
  loadConnectionConfig,
  checkServerHealth,
  DEFAULT_API_PORT,
  type HealthCheckResult,
} from '../lib/connectionConfig';

interface ConexaoServidorPanelProps {
  isAdmin: boolean;
  message: { text: string; type: 'success' | 'error' } | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

type Quality = 'excelente' | 'boa' | 'regular' | 'ruim' | 'offline';

function qualityFromLatency(ok: boolean, latencyMs?: number): Quality {
  if (!ok || latencyMs == null) return 'offline';
  if (latencyMs < 80) return 'excelente';
  if (latencyMs < 200) return 'boa';
  if (latencyMs < 450) return 'regular';
  return 'ruim';
}

function qualityLabel(q: Quality): string {
  switch (q) {
    case 'excelente':
      return 'Excelente';
    case 'boa':
      return 'Boa';
    case 'regular':
      return 'Regular';
    case 'ruim':
      return 'Ruim';
    default:
      return 'Offline';
  }
}

function qualityBarClass(q: Quality): string {
  switch (q) {
    case 'excelente':
      return 'bg-emerald-500 w-full';
    case 'boa':
      return 'bg-emerald-400 w-3/4';
    case 'regular':
      return 'bg-amber-400 w-1/2';
    case 'ruim':
      return 'bg-orange-500 w-1/4';
    default:
      return 'bg-zinc-300 w-0';
  }
}

function qualityTextClass(q: Quality): string {
  switch (q) {
    case 'excelente':
    case 'boa':
      return 'text-emerald-700';
    case 'regular':
      return 'text-amber-700';
    case 'ruim':
      return 'text-orange-700';
    default:
      return 'text-red-600';
  }
}

function providerShort(provider?: string): string {
  switch (provider) {
    case 'supabase':
      return 'Supabase';
    case 'local':
      return 'Local';
    case 'other':
      return 'Remoto';
    default:
      return 'PostgreSQL';
  }
}

/** Status da conexão com PostgreSQL (via API local). */
export default function ConexaoServidorPanel({ setMessage }: ConexaoServidorPanelProps) {
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [dbLatencyMs, setDbLatencyMs] = useState<number | undefined>();
  const [dbProvider, setDbProvider] = useState<string | undefined>();
  const [dbHostMasked, setDbHostMasked] = useState<string | undefined>();
  const [testing, setTesting] = useState(false);

  const handleTest = useCallback(async (showToast = true) => {
    setTesting(true);
    try {
      const config = loadConnectionConfig();
      const origin = config.apiOrigin || `http://127.0.0.1:${DEFAULT_API_PORT}`;
      const start = performance.now();
      const result = await checkServerHealth(origin);
      const roundTrip = Math.round(performance.now() - start);

      let dbMs = result.latencyMs ?? roundTrip;
      let provider = result.dbProvider;
      let hostMasked = result.dbHostMasked;
      try {
        const res = await fetch(`${origin.replace(/\/$/, '')}/api/health`);
        const body = await res.json().catch(() => ({}));
        if (typeof body.dbLatencyMs === 'number') {
          dbMs = body.dbLatencyMs;
        }
        if (typeof body.dbProvider === 'string') provider = body.dbProvider;
        if (typeof body.dbHostMasked === 'string') hostMasked = body.dbHostMasked;
        if (!res.ok || body.dbConnected === false) {
          setHealth({ ...result, ok: false, error: body.error || 'PostgreSQL indisponível' });
          setDbLatencyMs(dbMs);
          setDbProvider(provider);
          setDbHostMasked(hostMasked);
          if (showToast) {
            setMessage({ text: body.error || 'PostgreSQL offline', type: 'error' });
            setTimeout(() => setMessage(null), 4000);
          }
          return;
        }
      } catch {
        /* usa latency do health check */
      }

      setHealth({ ...result, latencyMs: roundTrip, dbProvider: provider, dbHostMasked: hostMasked });
      setDbLatencyMs(dbMs);
      setDbProvider(provider);
      setDbHostMasked(hostMasked);
      if (showToast) {
        const q = qualityFromLatency(result.ok, dbMs);
        const where = providerShort(provider);
        setMessage(
          result.ok
            ? { text: `${where} ${qualityLabel(q).toLowerCase()} (${dbMs}ms)`, type: 'success' }
            : { text: result.error || 'Conexão falhou', type: 'error' }
        );
        setTimeout(() => setMessage(null), 4000);
      }
    } finally {
      setTesting(false);
    }
  }, [setMessage]);

  useEffect(() => {
    void handleTest(false);
    const id = window.setInterval(() => void handleTest(false), 30_000);
    return () => window.clearInterval(id);
  }, [handleTest]);

  const quality = qualityFromLatency(!!health?.ok, dbLatencyMs ?? health?.latencyMs);

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
        <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-black text-sm tracking-tight">Conexão PostgreSQL</h3>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            Qualidade da conexão com o banco
            {dbHostMasked ? ` · ${dbHostMasked}` : ''}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</span>
          <span className={`text-sm font-bold ${qualityTextClass(quality)}`}>
            {qualityLabel(quality)}
            {dbProvider ? ` · ${providerShort(dbProvider)}` : ''}
            {(dbLatencyMs ?? health?.latencyMs) != null && health?.ok
              ? ` · ${dbLatencyMs ?? health?.latencyMs}ms`
              : ''}
          </span>
        </div>

        <div className="h-2.5 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${qualityBarClass(quality)}`}
          />
        </div>

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Medição do ping <code className="text-[10px]">SELECT 1</code> no banco (via API local).
          Atualiza a cada 30s. Cutover de host: edite <code className="text-[10px]">Saves/postgres.env</code> e reinicie o master.
        </p>
      </div>

      <button
        type="button"
        onClick={() => handleTest(true)}
        disabled={testing}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
      >
        {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
        Testar agora
      </button>
    </div>
  );
}
