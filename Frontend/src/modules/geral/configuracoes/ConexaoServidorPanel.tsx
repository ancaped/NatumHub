import React, { useState, useEffect, useCallback } from 'react';
import {
  Wifi, Loader2, Database, Globe, Copy, Check, Download,
  ExternalLink, Laptop, ShieldCheck, Sparkles, RotateCcw, Server, AlertTriangle
} from 'lucide-react';
import {
  loadConnectionConfig,
  checkServerHealth,
  DEFAULT_API_PORT,
  type HealthCheckResult,
} from '../lib/connectionConfig';
import { apiJson } from '../lib/http';

interface ConexaoServidorPanelProps {
  isAdmin: boolean;
  message: { text: string; type: 'success' | 'error' } | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

interface NetworkLink {
  label: string;
  ip: string;
  url: string;
  is_primary: boolean;
  is_tailscale: boolean;
  is_localhost: boolean;
  description: string;
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

/** Status da conexão com PostgreSQL e Links de Acesso na Rede Local (mDNS / nexus.local). */
export default function ConexaoServidorPanel({ setMessage }: ConexaoServidorPanelProps) {
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [dbLatencyMs, setDbLatencyMs] = useState<number | undefined>();
  const [dbProvider, setDbProvider] = useState<string | undefined>();
  const [dbHostMasked, setDbHostMasked] = useState<string | undefined>();
  const [testing, setTesting] = useState(false);

  // Links de Rede
  const [links, setLinks] = useState<NetworkLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Reinício do Servidor
  const [restarting, setRestarting] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [restartSuccess, setRestartSuccess] = useState(false);

  const handleRestart = async () => {
    setRestarting(true);
    setRestartSuccess(false);
    setRestartCountdown(12);
    try {
      await apiJson('/server-manager/restart', { method: 'POST' });
    } catch {
      // Ignora erro de socket fechado
    }
  };

  useEffect(() => {
    if (restartCountdown === null) return;
    let timer: number;
    let pollInterval: number;

    if (restartCountdown > 0) {
      timer = window.setTimeout(() => {
        setRestartCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
    }

    if (restartCountdown <= 10) {
      pollInterval = window.setInterval(async () => {
        try {
          const res = await fetch('/api/server-manager/status');
          if (res.ok) {
            setRestartSuccess(true);
            setRestartCountdown(null);
            clearInterval(pollInterval);
            window.setTimeout(() => window.location.reload(), 1000);
          }
        } catch {
          // Continua aguardando
        }
      }, 1200);
    }

    return () => {
      clearTimeout(timer);
      clearInterval(pollInterval);
    };
  }, [restartCountdown]);

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const res = await apiJson<NetworkLink[]>('/api/server-manager/links');
      if (Array.isArray(res)) {
        setLinks(res);
      }
    } catch {
      // Fallback padrão se rota ainda não respondeu
      setLinks([
        {
          label: 'Link Dinâmico (Recomendado)',
          ip: 'nexus.local',
          url: 'http://nexus.local:3001',
          is_primary: true,
          is_tailscale: false,
          is_localhost: false,
          description: 'Acesso direto por nome mDNS. Atualiza automaticamente se o IP mudar.',
        },
        {
          label: 'Localhost (Este Computador)',
          ip: '127.0.0.1',
          url: 'http://localhost:3001',
          is_primary: false,
          is_tailscale: false,
          is_localhost: true,
          description: 'Acesso direto no próprio computador servidor',
        },
      ]);
    } finally {
      setLoadingLinks(false);
    }
  }, []);

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
    void loadLinks();
    const id = window.setInterval(() => void handleTest(false), 30_000);
    return () => window.clearInterval(id);
  }, [handleTest, loadLinks]);

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  const downloadShortcutFile = (url: string, filename = 'Nexus_Hub.url') => {
    const fileContent = `[InternetShortcut]\nURL=${url}\nIconIndex=0\n`;
    const blob = new Blob([fileContent], { type: 'application/x-mswinurl' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const quality = qualityFromLatency(!!health?.ok, dbLatencyMs ?? health?.latencyMs);
  const primaryLink = links.find((l) => l.is_primary) || links[0];

  return (
    <div className="space-y-6">
      {/* Card 1: Links de Acesso na Rede Local (nexus.local & mDNS) */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-150 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-sm tracking-tight">Acesso na Rede Local (Outros PCs)</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                Link dinâmico mDNS · Não depende de IP fixo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadLinks}
            disabled={loadingLinks}
            className="text-zinc-500 hover:text-zinc-900 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            {loadingLinks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span>Atualizar</span>
          </button>
        </div>

        {/* Link Dinâmico Principal em Destaque */}
        {primaryLink && (
          <div className="p-4 rounded-xl bg-zinc-900 text-white border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-zinc-200">Link Dinâmico Oficial:</span>
              </div>
              <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full">
                nexus.local
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 bg-zinc-950 p-2.5 px-3.5 rounded-xl border border-zinc-800 font-mono text-sm text-indigo-300">
              <span className="truncate">{primaryLink.url}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(primaryLink.url)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-2.5 py-1 rounded-lg text-xs font-sans font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedUrl === primaryLink.url ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl === primaryLink.url ? 'Copiado!' : 'Copiar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadShortcutFile(primaryLink.url)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg text-xs font-sans font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Baixar atalho para colocar na Área de Trabalho dos outros computadores"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Atalho .url</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Basta digitar <code className="text-zinc-200 font-bold">{primaryLink.url}</code> em qualquer navegador de outro computador da fábrica. Mesmo se o IP do servidor mudar, o endereço <strong>nexus.local</strong> continua funcionando perfeitamente.
            </p>
          </div>
        )}

        {/* Lista de Outros Endereços de Conexão */}
        <div className="space-y-2 pt-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Outros Endereços Disponíveis
          </span>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {links.filter((l) => l.url !== primaryLink?.url).map((link, idx) => (
              <div
                key={idx}
                className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-zinc-800 block truncate">
                    {link.label}
                  </span>
                  <span className="text-xs font-mono text-zinc-600 block truncate">
                    {link.url}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(link.url)}
                  className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer shrink-0"
                  title="Copiar endereço"
                >
                  {copiedUrl === link.url ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card 2: Conexão PostgreSQL */}
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

      {/* Card 3: Controle do Servidor Local (Exclusivo Supervisor) */}
      {isAdmin && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-tight">Servidor HTTP Axum</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                  Controle do processo backend local (Porta {DEFAULT_API_PORT})
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Online
            </span>
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed">
            Reinicie o backend do servidor sem precisar fechar o terminal do <code className="font-mono bg-zinc-100 px-1 py-0.5 rounded text-zinc-800 font-bold">server.bat</code> e clicar nele novamente. O aplicativo orquestra a reinicialização e restabelece a conexão automaticamente em instantes.
          </p>

          {restartSuccess ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>Servidor reiniciado com sucesso! Atualizando aplicação...</span>
            </div>
          ) : restarting ? (
            <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-700">
                <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                <span>Reiniciando servidor Nexus...</span>
                <span className="font-mono text-rose-600 ml-auto">
                  {restartCountdown !== null && restartCountdown > 0 ? `${restartCountdown}s` : 'Verificando porta...'}
                </span>
              </div>
            </div>
          ) : showRestartConfirm ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-900">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Confirmar reinício do servidor?</span>
              </div>
              <p className="text-xs text-rose-800">
                Todas as conexões ativas serão momentaneamente desconectadas durante o reinício (2 a 5 segundos).
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRestartConfirm(false)}
                  className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRestart}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Sim, Reiniciar Servidor
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowRestartConfirm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 cursor-pointer transition-colors shadow-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reiniciar Servidor Nexus
            </button>
          )}
        </div>
      )}
    </div>
  );
}
