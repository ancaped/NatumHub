import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, RefreshCw, Loader2, Check, X, Database, Clock, Plus, Trash2, Search,
  Users, HardDrive, Shield, Activity, Settings, Network, ChevronRight, Globe, FileText,
  Boxes, PackageCheck, AlertCircle
} from 'lucide-react';

import ConexaoServidorPanel from './ConexaoServidorPanel';
import ImportacoesServidorPanel from './ImportacoesServidorPanel';
import OperadoresPanel from './OperadoresPanel';
import PostgresUsagePanel from './PostgresUsagePanel';
import PostgresBackupPanel from './PostgresBackupPanel';
import AuditoriaPanel from './AuditoriaPanel';
import ReportLogoPanel from './ReportLogoPanel';
import { apiFetch, apiJson, getSetting, setSetting } from '../lib/http';
import { isSupervisor, type AuthUser } from '../lib/auth';
import AppLayout, { type SidebarItem } from '../components/layout/AppLayout';

type SettingsTab = 'usuarios' | 'erp' | 'banco' | 'auditoria_produtos' | 'rede' | 'auditoria' | 'logo';

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
  auto_audit_interval_minutes?: number;
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
  const supervisorMode = variant === 'supervisor' || isSupervisor(currentUser);
  const canEditInfra = isSupervisor(currentUser);
  const [currentTab, setCurrentTab] = useState<SettingsTab>(supervisorMode ? 'usuarios' : 'rede');

  const [erpSchedule, setErpSchedule] = useState<ErpSyncSchedule>({
    ativo: true,
    horarios: ['06:00', '08:30', '10:30', '12:30', '14:30', '16:30', '18:30', '22:00'],
    auto_audit_interval_minutes: 15,
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
  const [stockVerifyProgress, setStockVerifyProgress] = useState<{
    processed: number;
    total: number;
    repaired: number;
    phase?: string;
    currentCode?: string;
  } | null>(null);
  const [stockVerifyResult, setStockVerifyResult] = useState<{
    checked: number;
    repaired: number;
    samples: { code: string; hub: number; erp: number; source?: string }[];
    bySource?: { insumos: number; materiais: number; produtos: number };
    erpCacheDrift?: number;
  } | null>(null);
  const [auditCode, setAuditCode] = useState('9.15.104');
  const [auditingCode, setAuditingCode] = useState(false);
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [stockAuditResult, setStockAuditResult] = useState<{
    code: string;
    match: boolean;
    matchStock?: boolean;
    matchReserved?: boolean;
    matchProduction?: boolean;
    matchOrders?: boolean;
    deltaStock: number | null;
    warnings?: string[];
    hub: {
      source?: string | null;
      stockQty?: number;
      reservedQty?: number;
      inProduction?: number;
      inOrders?: number;
      error?: string;
    };
    erp: {
      source?: string | null;
      stockQty?: number;
      stockQtyRaw?: number;
      stockQtyA?: number;
      reservedQty?: number;
      inProduction?: number;
      inOrders?: number;
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
        horarios: data.horarios?.length ? data.horarios : ['06:00', '08:30', '10:30', '12:30', '14:30', '16:30', '18:30', '22:00'],
        ultima_execucao: data.ultima_execucao,
        proxima_execucao: data.proxima_execucao,
        auto_audit_interval_minutes: data.auto_audit_interval_minutes ?? 15,
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
    setStockVerifyProgress({ processed: 0, total: 0, repaired: 0, phase: 'iniciando' });
    setStockVerifyResult(null);
    try {
      const res = await apiFetch('/admin/audit/stock/verify-all', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Resposta sem stream de progresso');
      const decoder = new TextDecoder();
      let buffer = '';
      let donePayload: {
        checked?: number;
        repaired?: number;
        samples?: { code: string; hub: number; erp: number; source?: string }[];
        bySource?: { insumos: number; materiais: number; produtos: number };
        erpCacheDrift?: number;
      } | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (ev.type === 'progress') {
            setStockVerifyProgress({
              processed: Number(ev.processed ?? 0),
              total: Number(ev.total ?? 0),
              repaired: Number(ev.repaired ?? 0),
              phase: typeof ev.phase === 'string' ? ev.phase : undefined,
              currentCode: typeof ev.currentCode === 'string' ? ev.currentCode : undefined,
            });
          } else if (ev.type === 'done') {
            donePayload = ev as typeof donePayload;
          } else if (ev.type === 'error') {
            throw new Error(String(ev.error || 'Falha na verificação de estoque'));
          }
        }
      }
      if (buffer.trim()) {
        try {
          const ev = JSON.parse(buffer.trim());
          if (ev.type === 'done') donePayload = ev;
          else if (ev.type === 'error') throw new Error(String(ev.error || 'Falha na verificação'));
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('Falha')) throw e;
        }
      }
      if (!donePayload) throw new Error('Auditoria terminou sem resultado final');

      setStockVerifyResult({
        checked: donePayload.checked ?? 0,
        repaired: donePayload.repaired ?? 0,
        samples: Array.isArray(donePayload.samples) ? donePayload.samples : [],
        bySource: donePayload.bySource,
        erpCacheDrift: donePayload.erpCacheDrift,
      });
      setStockVerifyProgress(null);
      const bs = donePayload.bySource;
      const bySrc =
        bs != null ? ` (I ${bs.insumos} · M ${bs.materiais} · P ${bs.produtos})` : '';
      setMessage({
        text:
          (donePayload.repaired ?? 0) > 0
            ? `Estoque: ${donePayload.checked} conferidos, ${donePayload.repaired} divergências corrigidas${bySrc}. Recarregue Compras.`
            : `0 divergências de estoque: ${donePayload.checked} itens batem com o estoque recalculado do ERP.`,
        type: 'success',
      });
    } catch (e: unknown) {
      setStockVerifyProgress(null);
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
        matchStock?: boolean;
        matchReserved?: boolean;
        matchProduction?: boolean;
        matchOrders?: boolean;
        deltaStock: number | null;
        warnings?: string[];
        hub: {
          source?: string | null;
          stockQty?: number;
          reservedQty?: number;
          inProduction?: number;
          inOrders?: number;
          error?: string;
        };
        erp: {
          source?: string | null;
          stockQty?: number;
          stockQtyRaw?: number;
          stockQtyA?: number;
          reservedQty?: number;
          inProduction?: number;
          inOrders?: number;
          hubField?: string;
          error?: string;
        };
      }>(`/admin/audit/stock/${encodeURIComponent(code)}`);
      setStockAuditResult({
        code: data.code,
        match: !!data.match,
        matchStock: data.matchStock,
        matchReserved: data.matchReserved,
        matchProduction: data.matchProduction,
        matchOrders: data.matchOrders,
        deltaStock: data.deltaStock ?? null,
        warnings: data.warnings ?? [],
        hub: data.hub ?? {},
        erp: data.erp ?? {},
      });
      setMessage({
        text: data.match
          ? `${code}: Hub bate com o estoque recalculado do ERP.`
          : `${code}: divergência Hub × ERP — use Corrigir do ERP se o recálculo estiver certo.`,
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
        auto_audit_interval_minutes: Number(erpSchedule.auto_audit_interval_minutes ?? 15),
      };
      const data = await apiJson<{ proxima_execucao?: string; auto_audit_interval_minutes?: number }>('/import/erp-sync-schedule', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setErpSchedule((prev) => ({
        ...prev,
        proxima_execucao: data.proxima_execucao ?? prev.proxima_execucao,
        auto_audit_interval_minutes: data.auto_audit_interval_minutes ?? prev.auto_audit_interval_minutes,
      }));
      setMessage({ text: 'Configurações de sincronização salvas com sucesso!', type: 'success' });
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

  const sidebarItems: SidebarItem[] = supervisorMode
    ? [
        { id: 'usuarios', label: 'Usuários & Permissões', icon: Users },
        { id: 'erp', label: 'Importações ERP', icon: Database },
        { id: 'banco', label: 'Banco de Dados', icon: HardDrive },
        { id: 'auditoria_produtos', label: 'Auditoria de Estoque', icon: Boxes },
        { id: 'rede', label: 'Rede & Servidor', icon: Globe },
        { id: 'auditoria', label: 'Auditoria & Logs', icon: FileText },
        { id: 'logo', label: 'Identidade & Logo', icon: Settings },
      ]
    : [
        { id: 'rede', label: 'Rede & Servidor', icon: Globe },
        { id: 'logo', label: 'Identidade & Logo', icon: Settings },
      ];

  return (
    <AppLayout
      moduleTitle="Configurações Gerais"
      moduleSubtitle="Gestão de operadores, importações ERP, banco de dados e parâmetros do sistema"
      onBackToHub={() => setView('hub')}
      sidebarItems={sidebarItems}
      activeTab={currentTab}
      onTabChange={(id) => setCurrentTab(id as SettingsTab)}
    >
      <div className="w-full space-y-6">
        {/* Mensagem Toast */}
        {message && (
          <div className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between shadow-2xs ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <span className="flex items-center gap-2">
              {message.type === 'success' ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />}
              {message.text}
            </span>
          </div>
        )}

        {!canEditInfra && supervisorMode && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
            Faça login como supervisor master para alterar configurações de infraestrutura e sincronização ERP.
          </div>
        )}

        {/* Aba Usuários */}
        {currentTab === 'usuarios' && (
          <OperadoresPanel currentUser={currentUser} setMessage={setMessage} />
        )}

        {/* Aba Importações & ERP (Servidor Original) */}
        {currentTab === 'erp' && (
          <ImportacoesServidorPanel
            sqlHost={sqlHost}
            setSqlHost={setSqlHost}
            sqlPort={sqlPort}
            setSqlPort={setSqlPort}
            sqlUser={sqlUser}
            setSqlUser={setSqlUser}
            sqlPassword={sqlPassword}
            setSqlPassword={setSqlPassword}
            sqlDatabase={sqlDatabase}
            setSqlDatabase={setSqlDatabase}
            handleSaveSqlConfig={handleSaveSqlConfig}
            savingSql={savingSql}
            handleSyncSqlDatabase={handleSyncSqlDatabase}
            syncingSql={syncingSql}
            message={message}
            setMessage={setMessage}
          />
        )}

        {/* Aba Banco de Dados */}
        {currentTab === 'banco' && canEditInfra && (
          <>
            <PostgresUsagePanel setMessage={setMessage} />
            <PostgresBackupPanel setMessage={setMessage} />
          </>
        )}

        {/* Aba Auditoria de Produtos & Estoque */}
        {currentTab === 'auditoria_produtos' && canEditInfra && (
          <div className="space-y-6">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
                <div className="p-2.5 bg-zinc-100 text-zinc-900 rounded-xl border border-zinc-200">
                  <Boxes className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm tracking-tight text-zinc-900">Auditoria de Estoque & Produtos (Hub vs ERP)</h3>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                    Conferência de saldos físicos, reservas, produção e pedidos
                  </p>
                </div>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed">
                Confere e alinha <strong>insumos + materiais + produtos</strong> (estoque, reserva, produção e pedidos do snapshot) contra a base viva do ERP. Divergências encontradas são corrigidas automaticamente.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => void handleVerifyStock()}
                  disabled={verifyingStock || syncingSql}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                >
                  {verifyingStock ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Verificando estoque completo...</span>
                    </>
                  ) : (
                    <>
                      <PackageCheck className="h-4 w-4" />
                      <span>Verificar Estoque Completo (Hub × ERP)</span>
                    </>
                  )}
                </button>
              </div>

              {stockVerifyProgress && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-900 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 font-bold">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                      <span>Auditoria em andamento {stockVerifyProgress.phase ? `(${stockVerifyProgress.phase})` : ''}</span>
                    </span>
                    <span className="font-mono tabular-nums">
                      {stockVerifyProgress.processed} / {stockVerifyProgress.total || '—'} · {stockVerifyProgress.repaired} corrigidos
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-200 overflow-hidden">
                    <div
                      className="h-full bg-zinc-900 transition-all duration-300 rounded-full"
                      style={{
                        width: `${
                          stockVerifyProgress.total > 0
                            ? Math.min(100, (100 * stockVerifyProgress.processed) / stockVerifyProgress.total)
                            : 5
                        }%`,
                      }}
                    />
                  </div>
                  {stockVerifyProgress.currentCode && (
                    <p className="text-[10px] font-mono text-zinc-500 truncate">
                      Processando item: {stockVerifyProgress.currentCode}
                    </p>
                  )}
                </div>
              )}

              {stockVerifyResult && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700 space-y-2">
                  <p className="font-bold text-zinc-900 text-sm">
                    {stockVerifyResult.repaired === 0
                      ? `✅ 0 divergências encontradas · ${stockVerifyResult.checked} itens 100% alinhados`
                      : `✨ Auditoria concluída: ${stockVerifyResult.checked} conferidos · ${stockVerifyResult.repaired} corrigidos`}
                    {stockVerifyResult.bySource && stockVerifyResult.repaired > 0 && (
                      <span className="font-normal text-zinc-500 text-xs ml-1">
                        (Insumos: {stockVerifyResult.bySource.insumos} · Materiais: {stockVerifyResult.bySource.materiais} · Produtos: {stockVerifyResult.bySource.produtos})
                      </span>
                    )}
                  </p>
                  {(stockVerifyResult.erpCacheDrift ?? 0) > 0 && (
                    <p className="text-amber-700">
                      {stockVerifyResult.erpCacheDrift} itens com a coluna nQtdeEstoque desatualizada no ERP (só informativo).
                    </p>
                  )}
                  {stockVerifyResult.samples.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-zinc-200">
                      <p className="text-[10px] font-black uppercase text-zinc-400">Amostras de itens corrigidos:</p>
                      <ul className="max-h-48 overflow-y-auto text-[11px] text-zinc-600 space-y-1 font-mono bg-white p-2 rounded-lg border border-zinc-200">
                        {stockVerifyResult.samples.map((s) => (
                          <li key={`${s.source || 'x'}-${s.code}`} className="flex justify-between py-0.5 border-b border-zinc-100 last:border-none">
                            <span>{s.source ? `[${s.source}] ` : ''}{s.code}</span>
                            <span className="text-zinc-500">
                              Hub: {s.hub.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} → ERP: <strong className="text-zinc-900">{s.erp.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</strong>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Auditoria individual ao vivo */}
              <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs font-bold text-zinc-800">
                    Auditar item individual (ERP ao vivo)
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Consulte qualquer código de insumo, material ou produto para comparar instantaneamente com o banco do ERP.
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={auditCode}
                    onChange={(e) => setAuditCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleAuditStockCode();
                    }}
                    placeholder="Ex: 9.15.104 ou Cód. do produto"
                    className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAuditStockCode()}
                    disabled={auditingCode || refreshingCode || syncingSql}
                    className="bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    {auditingCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    <span>Auditar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRefreshStockCode()}
                    disabled={auditingCode || refreshingCode || syncingSql || !auditCode.trim()}
                    className="bg-zinc-100 text-zinc-800 border border-zinc-200 hover:bg-zinc-200 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    title="Regrava o snapshot do Hub com o valor vivo do ERP"
                  >
                    {refreshingCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    <span>Corrigir do ERP</span>
                  </button>
                </div>

                {stockAuditResult && (
                  <div className={`rounded-xl border p-4 text-xs space-y-2 ${
                    stockAuditResult.match
                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                      : 'border-amber-200 bg-amber-50/70 text-amber-950'
                  }`}>
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm">
                        {stockAuditResult.code}: {stockAuditResult.match ? '✅ Valores Alinhados' : '⚠️ Divergência Encontrada'}
                      </p>
                      {stockAuditResult.deltaStock != null && stockAuditResult.deltaStock !== 0 && (
                        <span className="font-mono font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                          Δ estoque: {(stockAuditResult.deltaStock).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="bg-white/80 p-3 rounded-lg border border-zinc-200/60 font-mono text-[11px] space-y-1">
                        <span className="font-sans font-bold uppercase tracking-wider text-[10px] text-zinc-500 block">Hub Local</span>
                        {stockAuditResult.hub.error ? (
                          <span className="text-rose-600">{stockAuditResult.hub.error}</span>
                        ) : (
                          <>
                            <div>Estoque: <strong>{stockAuditResult.hub.stockQty?.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) ?? '—'}</strong></div>
                            <div>Reserva: {stockAuditResult.hub.reservedQty?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) ?? '—'}</div>
                            <div>Produção: {stockAuditResult.hub.inProduction?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) ?? '—'}</div>
                            <div>Pedidos: {stockAuditResult.hub.inOrders?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) ?? '—'}</div>
                          </>
                        )}
                      </div>

                      <div className="bg-white/80 p-3 rounded-lg border border-zinc-200/60 font-mono text-[11px] space-y-1">
                        <span className="font-sans font-bold uppercase tracking-wider text-[10px] text-zinc-500 block">ERP SQL Server</span>
                        {stockAuditResult.erp.error ? (
                          <span className="text-rose-600">{stockAuditResult.erp.error}</span>
                        ) : (
                          <>
                            <div>Estoque: <strong>{stockAuditResult.erp.stockQty?.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) ?? '—'}</strong></div>
                            {stockAuditResult.erp.stockQtyRaw != null &&
                              stockAuditResult.erp.stockQty != null &&
                              Math.abs(stockAuditResult.erp.stockQtyRaw - stockAuditResult.erp.stockQty) > 0.01 && (
                                <div className="text-amber-700">
                                  Coluna ERP (cache): {stockAuditResult.erp.stockQtyRaw.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                                </div>
                              )}
                            <div>Reserva: {stockAuditResult.erp.reservedQty?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) ?? '—'}</div>
                            <div>Produção: {stockAuditResult.erp.inProduction?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) ?? '—'}</div>
                            <div>Pedidos: {stockAuditResult.erp.inOrders?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) ?? '—'}</div>
                          </>
                        )}
                      </div>
                    </div>
                    {stockAuditResult.warnings && stockAuditResult.warnings.length > 0 && (
                      <ul className="text-[11px] text-amber-800 space-y-1 pt-1">
                        {stockAuditResult.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Aba Rede & Servidor */}
        {currentTab === 'rede' && (
          <ConexaoServidorPanel
            isAdmin={canEditInfra}
            message={message}
            setMessage={setMessage}
          />
        )}

        {/* Aba Auditoria do Sistema */}
        {currentTab === 'auditoria' && canEditInfra && (
          <AuditoriaPanel setMessage={setMessage} />
        )}

        {/* Aba Identidade Visual & Logo */}
        {currentTab === 'logo' && (
          <ReportLogoPanel canUpload={canEditInfra} setMessage={setMessage} />
        )}
      </div>
    </AppLayout>
  );
}
