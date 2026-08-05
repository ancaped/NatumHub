import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, RefreshCw, Loader2, Check, X, Database, Clock, Plus, Trash2, Search
} from 'lucide-react';

import ConexaoServidorPanel from './ConexaoServidorPanel';
import OperadoresPanel from './OperadoresPanel';
import PostgresUsagePanel from './PostgresUsagePanel';
import PostgresBackupPanel from './PostgresBackupPanel';
import AuditoriaPanel from './AuditoriaPanel';
import { apiJson, getSetting, setSetting } from '../lib/http';
import { isSupervisor, type AuthUser } from '../lib/auth';

interface ConfiguracoesViewProps {
  currentUser: AuthUser | null;
  setView: (view: any) => void;
  message: { text: string; type: 'success' | 'error' } | null;
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
  /** general = operadores; supervisor = painel master completo */
  variant?: 'general' | 'supervisor';

  // SQL Server State & Actions
  sqlHost: string;
  setSqlHost: (val: string) => void;
  sqlPort: string;
  setSqlPort: (val: string) => void;
  sqlUser: string;
  setSqlUser: (val: string) => void;
  sqlPassword: string;
  setSqlPassword: (val: string) => void;
  sqlDatabase: string;
  setSqlDatabase: (val: string) => void;
  handleSaveSqlConfig: () => void;
  savingSql: boolean;
  handleSyncSqlDatabase: (mode?: 'incremental' | 'full') => void;
  syncingSql: boolean;
}

interface ErpSyncSchedule {
  ativo: boolean;
  horarios: string[];
  ultima_execucao?: string | null;
  proxima_execucao?: string | null;
}

export default function ConfiguracoesView({
  currentUser,
  setView,
  message,
  setMessage,
  sqlHost,
  setSqlHost,
  sqlPort,
  setSqlPort,
  sqlUser,
  setSqlUser,
  sqlPassword,
  setSqlPassword,
  sqlDatabase,
  setSqlDatabase,
  handleSaveSqlConfig,
  savingSql,
  handleSyncSqlDatabase,
  syncingSql,
  variant = 'general',
}: ConfiguracoesViewProps) {
  const supervisorMode = variant === 'supervisor';
  const canEditInfra = supervisorMode && isSupervisor(currentUser);

  const [erpSchedule, setErpSchedule] = useState<ErpSyncSchedule>({
    ativo: true,
    horarios: ['06:00', '12:00', '18:00', '22:00'],
  });
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [salesPedidosDays, setSalesPedidosDays] = useState<number>(90);
  const [loadingSalesPedidos, setLoadingSalesPedidos] = useState(false);
  const [savingSalesPedidos, setSavingSalesPedidos] = useState(false);
  /** `2024-01-01` (padrão) ou `all` (histórico completo) */
  const [historyFloor, setHistoryFloor] = useState<string>('2024-01-01');
  const [loadingHistoryFloor, setLoadingHistoryFloor] = useState(false);
  const [savingHistoryFloor, setSavingHistoryFloor] = useState(false);
  const [syncLock, setSyncLock] = useState<{
    running: boolean;
    ageSeconds?: number;
    status?: string | null;
  } | null>(null);
  const [releasingLock, setReleasingLock] = useState(false);
  const [verifyingStock, setVerifyingStock] = useState(false);
  const [stockVerifyResult, setStockVerifyResult] = useState<{
    checked: number;
    repaired: number;
    samples: { code: string; hub: number; erp: number }[];
  } | null>(null);
  const [auditCode, setAuditCode] = useState('9.15.104');
  const [auditingCode, setAuditingCode] = useState(false);
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [stockAuditResult, setStockAuditResult] = useState<{
    code: string;
    match: boolean;
    deltaStock: number | null;
    hub: {
      source?: string | null;
      stockQty?: number;
      reservedQty?: number;
      error?: string;
    };
    erp: {
      source?: string | null;
      stockQty?: number;
      stockQtyA?: number;
      reservedQty?: number;
      hubField?: string;
      error?: string;
    };
  } | null>(null);

  const fetchErpSchedule = async () => {
    if (!canEditInfra) return;
    setLoadingSchedule(true);
    try {
      const data = await apiJson<ErpSyncSchedule>('/import/erp-sync-schedule');
      setErpSchedule({
        ativo: data.ativo ?? true,
        horarios: data.horarios?.length ? data.horarios : ['06:00', '12:00', '18:00', '22:00'],
        ultima_execucao: data.ultima_execucao,
        proxima_execucao: data.proxima_execucao,
      });
    } catch (e) {
      console.error('Erro ao carregar agenda de sync ERP:', e);
    } finally {
      setLoadingSchedule(false);
    }
  };

  useEffect(() => {
    fetchErpSchedule();
  }, [canEditInfra]);

  useEffect(() => {
    if (!canEditInfra) return;
    let cancelled = false;
    (async () => {
      setLoadingSalesPedidos(true);
      setLoadingHistoryFloor(true);
      try {
        const [v, floor] = await Promise.all([
          getSetting('sales_faltas_days_limit'),
          getSetting('erp_sync_history_floor'),
        ]);
        if (!cancelled && v != null && v !== '') {
          const n = Number(v);
          if (!Number.isNaN(n)) setSalesPedidosDays(n);
        }
        if (!cancelled) {
          const f = (floor || '').trim();
          if (
            f === 'all' ||
            f === 'completo' ||
            f === 'full' ||
            f === 'historico' ||
            f.startsWith('1900')
          ) {
            setHistoryFloor('all');
          } else if (/^\d{4}-\d{2}-\d{2}/.test(f)) {
            setHistoryFloor(f.slice(0, 10));
          } else {
            setHistoryFloor('2024-01-01');
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingSalesPedidos(false);
          setLoadingHistoryFloor(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canEditInfra]);

  useEffect(() => {
    if (!canEditInfra) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const lock = await apiJson<{
          running?: boolean;
          ageSeconds?: number;
          status?: string | null;
        }>('/import/sync-lock');
        if (!cancelled) {
          setSyncLock({
            running: Boolean(lock.running),
            ageSeconds: lock.ageSeconds,
            status: lock.status,
          });
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canEditInfra]);

  const handleReleaseSyncLock = async () => {
    if (
      !confirm(
        'Liberar o lock só se o sync travou de verdade. Se ainda estiver rodando, pode corromper o progresso. Continuar?'
      )
    ) {
      return;
    }
    setReleasingLock(true);
    try {
      await apiJson('/import/sync-lock/release', { method: 'POST' });
      setMessage({ text: 'Lock de sync liberado. Pode tentar sincronizar de novo.', type: 'success' });
      setSyncLock({ running: false, ageSeconds: 0, status: null });
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Erro ao liberar lock',
        type: 'error',
      });
    } finally {
      setReleasingLock(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleVerifyStock = async () => {
    setVerifyingStock(true);
    setStockVerifyResult(null);
    try {
      const data = await apiJson<{
        checked: number;
        repaired: number;
        samples?: { code: string; hub: number; erp: number }[];
      }>('/admin/audit/stock/verify-insumos', { method: 'POST' });
      setStockVerifyResult({
        checked: data.checked ?? 0,
        repaired: data.repaired ?? 0,
        samples: Array.isArray(data.samples) ? data.samples : [],
      });
      setMessage({
        text:
          (data.repaired ?? 0) > 0
            ? `Estoque: ${data.checked} conferidos, ${data.repaired} corrigidos para o ERP. Recarregue Compras para ver os saldos.`
            : `Estoque OK: ${data.checked} insumos batem com a tela do ERP.`,
        type: 'success',
      });
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Falha na verificação de estoque',
        type: 'error',
      });
    } finally {
      setVerifyingStock(false);
      setTimeout(() => setMessage(null), 8000);
    }
  };

  const handleAuditStockCode = async (codeOverride?: string) => {
    const code = (codeOverride ?? auditCode).trim();
    if (!code) {
      setMessage({ text: 'Informe o código do item para auditar.', type: 'error' });
      return;
    }
    setAuditingCode(true);
    try {
      const data = await apiJson<{
        code: string;
        match: boolean;
        deltaStock: number | null;
        hub: {
          source?: string | null;
          stockQty?: number;
          reservedQty?: number;
          error?: string;
        };
        erp: {
          source?: string | null;
          stockQty?: number;
          stockQtyA?: number;
          reservedQty?: number;
          hubField?: string;
          error?: string;
        };
      }>(`/admin/audit/stock/${encodeURIComponent(code)}`);
      setStockAuditResult({
        code: data.code,
        match: !!data.match,
        deltaStock: data.deltaStock ?? null,
        hub: data.hub ?? {},
        erp: data.erp ?? {},
      });
      setMessage({
        text: data.match
          ? `${code}: Hub bate com a tela do ERP (nQtdeEstoque).`
          : `${code}: divergência Hub × ERP — use Corrigir do ERP se a tela estiver certa.`,
        type: data.match ? 'success' : 'error',
      });
    } catch (e: unknown) {
      setStockAuditResult(null);
      setMessage({
        text: e instanceof Error ? e.message : 'Falha ao auditar estoque do código',
        type: 'error',
      });
    } finally {
      setAuditingCode(false);
      setTimeout(() => setMessage(null), 8000);
    }
  };

  const handleRefreshStockCode = async () => {
    const code = auditCode.trim();
    if (!code) {
      setMessage({ text: 'Informe o código do item para corrigir.', type: 'error' });
      return;
    }
    setRefreshingCode(true);
    try {
      await apiJson(`/admin/audit/stock/${encodeURIComponent(code)}/refresh`, { method: 'POST' });
      setMessage({
        text: `${code}: snapshot atualizado do ERP. Recarregue Compras.`,
        type: 'success',
      });
      await handleAuditStockCode(code);
    } catch (e: unknown) {
      setMessage({
        text: e instanceof Error ? e.message : 'Falha ao corrigir estoque do ERP',
        type: 'error',
      });
    } finally {
      setRefreshingCode(false);
      setTimeout(() => setMessage(null), 8000);
    }
  };

  const handleSaveHistoryFloor = async () => {
    setSavingHistoryFloor(true);
    try {
      await setSetting('erp_sync_history_floor', historyFloor);
      setMessage({
        text:
          historyFloor === 'all'
            ? 'Janela de sync: histórico completo. Use Sync completo para reimportar.'
            : `Janela de sync: desde ${historyFloor}. Use Sync completo para reimportar.`,
        type: 'success',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar janela histórica';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setSavingHistoryFloor(false);
      setTimeout(() => setMessage(null), 4500);
    }
  };
  const handleSaveSalesPedidosDays = async () => {
    setSavingSalesPedidos(true);
    try {
      await setSetting('sales_faltas_days_limit', String(salesPedidosDays));
      setMessage({
        text:
          salesPedidosDays > 0
            ? `Janela de pedidos salva: últimos ${salesPedidosDays} dias (Produção, Vendas e Compras).`
            : 'Janela de pedidos salva: sem limite de data.',
        type: 'success',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar janela de pedidos';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setSavingSalesPedidos(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleSaveErpSchedule = async () => {
    setSavingSchedule(true);
    try {
      const payload = {
        ativo: erpSchedule.ativo,
        horarios: erpSchedule.horarios.filter(Boolean),
      };
      const data = await apiJson<{ proxima_execucao?: string }>('/import/erp-sync-schedule', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setErpSchedule((prev) => ({
        ...prev,
        proxima_execucao: data.proxima_execucao ?? prev.proxima_execucao,
      }));
      setMessage({ text: 'Horários de sync automático salvos!', type: 'success' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar horários';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setSavingSchedule(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const updateHorario = (index: number, value: string) => {
    setErpSchedule((prev) => {
      const horarios = [...prev.horarios];
      horarios[index] = value;
      return { ...prev, horarios };
    });
  };

  const addHorario = () => {
    setErpSchedule((prev) => ({
      ...prev,
      horarios: [...prev.horarios, '08:00'],
    }));
  };

  const removeHorario = (index: number) => {
    setErpSchedule((prev) => ({
      ...prev,
      horarios: prev.horarios.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-zinc-50 font-sans text-zinc-900">
      <main className="flex-1 p-8 max-w-4xl w-full mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3 no-print">
          <button
            onClick={() => setView('hub')}
            className="bg-white border border-zinc-200 hover:bg-zinc-100 px-4 py-2 rounded-xl text-xs font-bold text-zinc-650 hover:text-zinc-900 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-98"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao Início
          </button>
        </div>
        {supervisorMode && (
          <div className="bg-violet-50 border border-violet-100 rounded-2xl px-5 py-4">
            <h2 className="font-black text-sm text-violet-900">Painel Supervisor</h2>
            <p className="text-xs text-violet-800/90 mt-1">
              PostgreSQL, backups locais, atualizações, operadores e sincronização ERP.
            </p>
          </div>
        )}
        {message && (
          <div className={`p-4 rounded-xl border text-sm font-bold flex items-center justify-between shadow-sm ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <span className="flex items-center gap-2">
              {message.type === 'success' ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />}
              {message.text}
            </span>
          </div>
        )}

        <ConexaoServidorPanel
          isAdmin={!currentUser || isSupervisor(currentUser)}
          message={message}
          setMessage={setMessage}
        />

        {!supervisorMode && isSupervisor(currentUser) && (
          <OperadoresPanel currentUser={currentUser} setMessage={setMessage} />
        )}

        {supervisorMode && canEditInfra && (
          <>
            <PostgresUsagePanel setMessage={setMessage} />
            <PostgresBackupPanel setMessage={setMessage} />
            <OperadoresPanel currentUser={currentUser} setMessage={setMessage} />
            <AuditoriaPanel setMessage={setMessage} />
          </>
        )}

        {supervisorMode && !canEditInfra && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            Faça login como supervisor para editar infraestrutura e sync ERP.
          </p>
        )}

        {canEditInfra && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
              <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-tight">Janela de pedidos de venda</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                  Trava de período · Produção (Ped) · Vendas · faltas / Compras
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              Pedidos antigos ainda abertos no ERP (ex.: 2024) incham o campo <strong>Ped</strong> na Produção.
              Use esta trava para considerar só o residual de pedidos dos últimos N dias. <strong>Sem limite</strong> inclui todo o histórico aberto.
            </p>

            {loadingSalesPedidos ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando...
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Considerar pedidos dos últimos
                  </label>
                  <select
                    value={salesPedidosDays}
                    onChange={(e) => setSalesPedidosDays(Number(e.target.value))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800 font-semibold"
                  >
                    <option value={30}>30 dias</option>
                    <option value={60}>60 dias</option>
                    <option value={90}>90 dias (3 meses)</option>
                    <option value={180}>180 dias (6 meses)</option>
                    <option value={365}>365 dias (1 ano)</option>
                    <option value={0}>Sem limite (todo o histórico aberto)</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleSaveSalesPedidosDays}
                  disabled={savingSalesPedidos}
                  className="bg-zinc-950 text-white hover:bg-zinc-800 px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {savingSalesPedidos ? 'Salvando...' : 'Salvar janela'}
                </button>
              </div>
            )}
          </div>
        )}

        {canEditInfra && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-tight">Sincronização ERP (SQL Server)</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                  Importação ERP → PostgreSQL · somente supervisor (manual) ou agenda automática
                </p>
              </div>
            </div>

            <div className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2.5 space-y-1">
              <p className="font-bold text-zinc-800">O que a sincronização importa:</p>
              <p>Produtos, insumos, fornecedores, notas fiscais de compra, movimentações, fórmulas, pedidos de compra e pedidos de venda do ERP NATUM.</p>
              <p className="text-zinc-500">
                Depois do primeiro sync, o botão normal é <strong>incremental</strong> (só o delta desde o watermark). Use <strong>Sync completo</strong> só quando precisar reprocessar o histórico na janela configurada abaixo.
              </p>
            </div>

            {(syncingSql || syncLock?.running) && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 space-y-2">
                <div className="flex items-center gap-2 text-indigo-900 text-xs font-bold">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Sync ERP em andamento
                  {typeof syncLock?.ageSeconds === 'number' && syncLock.ageSeconds > 0
                    ? ` · ${Math.floor(syncLock.ageSeconds / 60)} min`
                    : ''}
                </div>
                <p className="text-[11px] text-indigo-800/90 leading-relaxed">
                  Com histórico completo isso pode demorar bastante. O botão fica em “Sincronizando…” até a API responder.
                  Se clicou de novo e “nada aconteceu”, o sync anterior ainda está rodando.
                </p>
                {syncLock?.running && !syncingSql && (
                  <button
                    type="button"
                    onClick={handleReleaseSyncLock}
                    disabled={releasingLock}
                    className="text-[11px] font-bold text-rose-700 underline cursor-pointer disabled:opacity-50"
                  >
                    {releasingLock ? 'Liberando…' : 'Liberar lock (somente se travou)'}
                  </button>
                )}
              </div>
            )}

            <div className="rounded-xl border border-zinc-150 bg-white px-3 py-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold text-zinc-800">Janela histórica do sync completo</p>
                  <p className="text-[10px] text-zinc-500">
                    Afeta passos datados (lotes, vendas, pedidos, NFs…). Incremental continua pelo watermark.
                  </p>
                </div>
              </div>
              {loadingHistoryFloor ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500 py-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando...
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                      Importar dados desde
                    </label>
                    <select
                      value={historyFloor}
                      onChange={(e) => setHistoryFloor(e.target.value)}
                      className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800 font-semibold"
                    >
                      <option value="2024-01-01">01/01/2024 (padrão, mais rápido)</option>
                      <option value="2020-01-01">01/01/2020</option>
                      <option value="2015-01-01">01/01/2015</option>
                      <option value="all">Histórico completo (todo o ERP)</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveHistoryFloor}
                    disabled={savingHistoryFloor}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
                  >
                    {savingHistoryFloor ? 'Salvando...' : 'Salvar janela'}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3.5 text-left">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">IP / Host do SQL Server</label>
                  <input
                    type="text"
                    value={sqlHost}
                    onChange={(e) => setSqlHost(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                    placeholder="127.0.0.1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Porta</label>
                  <input
                    type="text"
                    value={sqlPort}
                    onChange={(e) => setSqlPort(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                    placeholder="1433"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Usuário SQL</label>
                  <input
                    type="text"
                    value={sqlUser}
                    onChange={(e) => setSqlUser(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Senha SQL</label>
                  <input
                    type="password"
                    value={sqlPassword}
                    onChange={(e) => setSqlPassword(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Nome do Banco de Dados</label>
                <input
                  type="text"
                  value={sqlDatabase}
                  onChange={(e) => setSqlDatabase(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                  placeholder="ERP_NATUM"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={handleSaveSqlConfig}
                  disabled={savingSql}
                  className="flex-1 min-w-[140px] bg-zinc-950 text-white hover:bg-zinc-800 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {savingSql ? 'Salvando...' : 'Salvar Configuração SQL'}
                </button>

                <button
                  onClick={() => handleSyncSqlDatabase('incremental')}
                  disabled={syncingSql}
                  className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  {syncingSql ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sincronizando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Sincronizar ERP
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const windowLabel =
                      historyFloor === 'all'
                        ? 'o histórico completo do ERP'
                        : `a janela desde ${historyFloor}`;
                    if (
                      !confirm(
                        `Sync completo reprocessa ${windowLabel}. Pode demorar vários minutos. Continuar?`
                      )
                    ) {
                      return;
                    }
                    handleSyncSqlDatabase('full');
                  }}
                  disabled={syncingSql}
                  className="bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Sync completo
                </button>

                <button
                  type="button"
                  onClick={() => void handleVerifyStock()}
                  disabled={verifyingStock || syncingSql}
                  className="bg-white text-zinc-800 border border-zinc-300 hover:bg-zinc-50 px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                  title="Compara todos os insumos Hub × tela do ERP e corrige divergências"
                >
                  {verifyingStock ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Verificando…
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Verificar estoque Hub × ERP
                    </>
                  )}
                </button>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed">
                A verificação de estoque (insumos / Compras) também roda <strong>sozinha após cada sync</strong>:
                se algum saldo divergir da tela do ERP, o Hub corrige e avisa no sino.
              </p>

              {stockVerifyResult && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-700 space-y-1">
                  <p className="font-bold text-zinc-900">
                    Última verificação: {stockVerifyResult.checked} conferidos ·{' '}
                    {stockVerifyResult.repaired} corrigidos
                  </p>
                  {stockVerifyResult.repaired > 0 && (
                    <p className="text-[11px] text-amber-700">
                      Recarregue a grade de Compras para ver os saldos corrigidos.
                    </p>
                  )}
                  {stockVerifyResult.samples.length > 0 && (
                    <ul className="text-[11px] text-zinc-600 space-y-0.5 font-mono">
                      {stockVerifyResult.samples.slice(0, 8).map((s) => (
                        <li key={s.code}>
                          {s.code}: hub {s.hub.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} → erp{' '}
                          {s.erp.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-zinc-200 bg-white px-3 py-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    Auditar item (ERP ao vivo)
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Compara o Hub com <strong>nQtdeEstoque</strong> da tela do ERP (não use nQtdeEstoqueA).
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={auditCode}
                    onChange={(e) => setAuditCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleAuditStockCode();
                    }}
                    placeholder="Ex: 9.15.104"
                    className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-zinc-200 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAuditStockCode()}
                    disabled={auditingCode || refreshingCode || syncingSql}
                    className="bg-zinc-900 text-white hover:bg-zinc-800 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                  >
                    {auditingCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Auditar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRefreshStockCode()}
                    disabled={auditingCode || refreshingCode || syncingSql || !auditCode.trim()}
                    className="bg-white text-zinc-800 border border-zinc-300 hover:bg-zinc-50 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                    title="Regrava o snapshot do Hub com o valor vivo do ERP"
                  >
                    {refreshingCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Corrigir do ERP
                  </button>
                </div>
                {stockAuditResult && (
                  <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-1.5 ${
                    stockAuditResult.match
                      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                      : 'border-amber-200 bg-amber-50/60 text-amber-950'
                  }`}>
                    <p className="font-bold">
                      {stockAuditResult.code}: {stockAuditResult.match ? 'Match' : 'Divergente'}
                      {stockAuditResult.deltaStock != null && (
                        <span className="font-mono font-semibold ml-2">
                          Δ {(stockAuditResult.deltaStock).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                      <div>
                        <span className="font-sans font-bold uppercase tracking-wider text-[9px] opacity-70 block">Hub</span>
                        {stockAuditResult.hub.error ? (
                          <span>{stockAuditResult.hub.error}</span>
                        ) : (
                          <>
                            {stockAuditResult.hub.stockQty?.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) ?? '—'}
                            <span className="opacity-60"> ({stockAuditResult.hub.source || '—'})</span>
                          </>
                        )}
                      </div>
                      <div>
                        <span className="font-sans font-bold uppercase tracking-wider text-[9px] opacity-70 block">ERP tela</span>
                        {stockAuditResult.erp.error ? (
                          <span>{stockAuditResult.erp.error}</span>
                        ) : (
                          <>
                            {stockAuditResult.erp.stockQty?.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) ?? '—'}
                            <span className="opacity-60"> ({stockAuditResult.erp.source || '—'})</span>
                          </>
                        )}
                      </div>
                    </div>
                    {typeof stockAuditResult.erp.stockQtyA === 'number' && (
                      <p className="text-[10px] opacity-70">
                        nQtdeEstoqueA (diagnóstico):{' '}
                        <span className="font-mono">
                          {stockAuditResult.erp.stockQtyA.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                        </span>
                        {' '}— não é o estoque da tela.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-200/60 pt-4 mt-2 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-600" />
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    Sync automático (horários diários)
                  </span>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={erpSchedule.ativo}
                    onChange={(e) => setErpSchedule((prev) => ({ ...prev, ativo: e.target.checked }))}
                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Ativar importação automática do ERP nestes horários
                </label>

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  O agendador verifica a cada minuto. Nos horários abaixo, dispara a mesma sincronização do botão manual.
                </p>

                {loadingSchedule ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Carregando horários...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {erpSchedule.horarios.map((horario, index) => (
                      <div key={`${index}-${horario}`} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={horario}
                          onChange={(e) => updateHorario(index, e.target.value)}
                          disabled={!erpSchedule.ativo}
                          className="flex-1 border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-white text-zinc-800 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => removeHorario(index)}
                          disabled={erpSchedule.horarios.length <= 1}
                          className="p-2 rounded-lg border border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remover horário"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={addHorario}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 py-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar horário
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
                  <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-2">
                    <span className="font-bold text-zinc-600 block mb-0.5">Última sync automática</span>
                    <span className="font-mono text-zinc-800">{erpSchedule.ultima_execucao || '—'}</span>
                  </div>
                  <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-2">
                    <span className="font-bold text-zinc-600 block mb-0.5">Próxima execução</span>
                    <span className="font-mono text-zinc-800">
                      {erpSchedule.ativo ? (erpSchedule.proxima_execucao || '—') : 'Desativado'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveErpSchedule}
                  disabled={savingSchedule || loadingSchedule}
                  className="w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {savingSchedule ? 'Salvando horários...' : 'Salvar horários automáticos'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
        &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
      </footer>
    </div>
  );
}
