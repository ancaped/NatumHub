import React, { useCallback, useEffect, useState } from 'react';
import { Archive, FolderOpen, Loader2, Play, Save } from 'lucide-react';
import { apiJson } from '../lib/http';

interface PgBackupConfig {
  ativo: boolean;
  pasta: string;
  keepHourly: number;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  dailyTime: string;
}

interface PgBackupStatus {
  config: PgBackupConfig;
  pastaEfetiva: string;
  ultimaExecucao?: string | null;
  ultimoErro?: string | null;
  contagens: {
    hourly: number;
    daily: number;
    weekly: number;
    monthly: number;
  };
  pgDumpEncontrado: boolean;
  pgDumpPath?: string | null;
}

interface PostgresBackupPanelProps {
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

const DEFAULT_CFG: PgBackupConfig = {
  ativo: false,
  pasta: '',
  keepHourly: 24,
  keepDaily: 7,
  keepWeekly: 4,
  keepMonthly: 6,
  dailyTime: '02:00',
};

export default function PostgresBackupPanel({ setMessage }: PostgresBackupPanelProps) {
  const [status, setStatus] = useState<PgBackupStatus | null>(null);
  const [cfg, setCfg] = useState<PgBackupConfig>(DEFAULT_CFG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<PgBackupStatus>('/admin/pg-backup');
      setStatus(data);
      setCfg({
        ativo: data.config?.ativo ?? false,
        pasta: data.config?.pasta ?? '',
        keepHourly: data.config?.keepHourly ?? 24,
        keepDaily: data.config?.keepDaily ?? 7,
        keepWeekly: data.config?.keepWeekly ?? 4,
        keepMonthly: data.config?.keepMonthly ?? 6,
        dailyTime: data.config?.dailyTime || '02:00',
      });
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao carregar backup Postgres',
        type: 'error',
      });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setLoading(false);
    }
  }, [setMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiJson('/admin/pg-backup/config', {
        method: 'POST',
        body: JSON.stringify(cfg),
      });
      setMessage({ text: 'Configuração de backup Postgres salva.', type: 'success' });
      await load();
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao salvar backup',
        type: 'error',
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleRun = async (tier: string) => {
    setRunning(true);
    try {
      const res = await apiJson<{ path?: string }>(`/admin/pg-backup/run?tier=${tier}`, {
        method: 'POST',
      });
      setMessage({
        text: `Backup ${tier} concluído${res.path ? `: ${res.path}` : ''}`,
        type: 'success',
      });
      await load();
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Falha no backup manual',
        type: 'error',
      });
    } finally {
      setRunning(false);
      setTimeout(() => setMessage(null), 6000);
    }
  };

  const numField = (
    label: string,
    hint: string,
    value: number,
    onChange: (n: number) => void,
    max: number
  ) => (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
        {label}
      </label>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800 font-semibold"
      />
      <p className="text-[10px] text-zinc-400">{hint}</p>
    </div>
  );

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-50 text-sky-700 rounded-xl">
            <Archive className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-sm tracking-tight">Backup PostgreSQL</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Pasta local · retenção por faixa
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Atualizar
        </button>
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed">
        Agenda <code className="text-[10px] bg-zinc-100 px-1 rounded">pg_dump</code> no PC Principal
        (formato custom). Defina quantos arquivos manter em cada faixa — <strong>0</strong> desliga a
        faixa. Destino somente em disco local por enquanto.
      </p>

      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-zinc-700">
              <FolderOpen className="h-3.5 w-3.5" /> Pasta efetiva
            </div>
            <p className="font-mono text-[10px] text-zinc-600 break-all">{status.pastaEfetiva}</p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 space-y-1">
            <p className="font-bold text-zinc-700">
              pg_dump:{' '}
              <span className={status.pgDumpEncontrado ? 'text-emerald-700' : 'text-rose-700'}>
                {status.pgDumpEncontrado ? 'encontrado' : 'não encontrado'}
              </span>
            </p>
            {status.pgDumpPath && (
              <p className="font-mono text-[10px] text-zinc-500 break-all">{status.pgDumpPath}</p>
            )}
            <p className="text-zinc-500">
              Último: {status.ultimaExecucao || 'nunca'} · arquivos:{' '}
              {status.contagens.hourly}h / {status.contagens.daily}d / {status.contagens.weekly}s /{' '}
              {status.contagens.monthly}m
            </p>
          </div>
        </div>
      )}

      {status?.ultimoErro && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 font-medium">
          Último erro: {status.ultimoErro}
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={cfg.ativo}
          onChange={(e) => setCfg((p) => ({ ...p, ativo: e.target.checked }))}
          className="rounded border-zinc-300"
        />
        <span className="text-xs font-bold text-zinc-800">Ativar agenda automática</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {numField(
          'Manter (hora a hora)',
          '0 = off · roda a cada hora cheia',
          cfg.keepHourly,
          (n) => setCfg((p) => ({ ...p, keepHourly: n })),
          168
        )}
        {numField(
          'Manter (diários)',
          '0 = off · no horário abaixo',
          cfg.keepDaily,
          (n) => setCfg((p) => ({ ...p, keepDaily: n })),
          90
        )}
        {numField(
          'Manter (semanais)',
          '0 = off · domingo no horário diário',
          cfg.keepWeekly,
          (n) => setCfg((p) => ({ ...p, keepWeekly: n })),
          52
        )}
        {numField(
          'Manter (mensais)',
          '0 = off · dia 1 no horário diário',
          cfg.keepMonthly,
          (n) => setCfg((p) => ({ ...p, keepMonthly: n })),
          36
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Horário diário / semanal / mensal
          </label>
          <input
            type="time"
            value={cfg.dailyTime}
            onChange={(e) => setCfg((p) => ({ ...p, dailyTime: e.target.value }))}
            className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800 font-semibold"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Pasta local (opcional)
          </label>
          <input
            type="text"
            value={cfg.pasta}
            onChange={(e) => setCfg((p) => ({ ...p, pasta: e.target.value }))}
            placeholder="vazio = Saves/pg-backups"
            className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800 font-semibold"
          />
          <p className="text-[10px] text-zinc-400">Absoluta ou relativa a Saves/</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </button>
        <button
          type="button"
          onClick={() => handleRun('daily')}
          disabled={running || !status?.pgDumpEncontrado}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Backup agora (diário)
        </button>
        <button
          type="button"
          onClick={() => handleRun('hourly')}
          disabled={running || !status?.pgDumpEncontrado}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
        >
          Horário
        </button>
      </div>
    </div>
  );
}
