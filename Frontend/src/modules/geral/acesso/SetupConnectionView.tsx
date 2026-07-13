import React, { useState } from 'react';
import { Monitor, Loader2, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { APP_NAME } from '../lib/utils';
import {
  loadConnectionConfig,
  saveConfigToTauri,
  normalizeClientConfig,
  markConnectionSetupCompleted,
  DEFAULT_API_PORT,
  type ClientConfig,
} from '../lib/connectionConfig';

interface SetupConnectionViewProps {
  onComplete: () => void;
  reason?: string | null;
}

/** Primeira execução: nome do dispositivo. API local + Supabase — sem escolher "PC servidor". */
export default function SetupConnectionView({ onComplete, reason }: SetupConnectionViewProps) {
  const [deviceLabel, setDeviceLabel] = useState(() => loadConnectionConfig().deviceLabel || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildConfig = (): ClientConfig => {
    const base = normalizeClientConfig({
      ...loadConnectionConfig(),
      deviceLabel: deviceLabel.trim() || loadConnectionConfig().deviceLabel,
      appMode: 'master',
      isSyncMaster: true,
      apiOrigin: `http://127.0.0.1:${DEFAULT_API_PORT}`,
      apiBindHost: '0.0.0.0',
      apiPort: DEFAULT_API_PORT,
      setupLocked: false,
    });
    return markConnectionSetupCompleted(base, 'server');
  };

  const handleFinish = async () => {
    setError(null);
    setSaving(true);
    try {
      await saveConfigToTauri(buildConfig());
      onComplete();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full w-full min-h-0 flex flex-col items-center justify-center bg-zinc-50 font-sans text-zinc-900 p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-[440px] my-auto bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto bg-emerald-100 text-emerald-700 p-3 rounded-xl w-fit">
            <Monitor className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Bem-vindo ao {APP_NAME}</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Dados no PostgreSQL (Supabase). Este PC usa a API local — não é necessário escolher um
            &quot;servidor da rede&quot;.
          </p>
        </div>

        {reason && (
          <div className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{reason}</p>
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Nome deste PC (opcional)
          </label>
          <input
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder="Ex.: Escritório, Produção"
            className="mt-1.5 w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50"
            disabled={saving}
          />
        </div>

        <ul className="text-xs text-zinc-600 space-y-1.5 bg-zinc-50 border border-zinc-100 rounded-xl p-3">
          <li className="flex gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
            Banco centralizado (Supabase)
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
            Na próxima etapa: conta <strong>supervisor</strong> (única que cadastra usuários)
          </li>
        </ul>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
        )}

        <button
          type="button"
          onClick={handleFinish}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm py-3 rounded-xl disabled:opacity-60 cursor-pointer"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Continuar
        </button>
      </div>
    </div>
  );
}
