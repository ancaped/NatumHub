import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, RefreshCw, Loader2, Check, X, Database, Clock, Plus, Trash2, Search,
  Users, HardDrive, Shield, Activity, Settings, Network, ChevronRight, Globe, FileText,
  Boxes, PackageCheck, AlertCircle
} from 'lucide-react';

import ConexaoServidorPanel from './ConexaoServidorPanel';
import OperadoresPanel from './OperadoresPanel';
import PostgresUsagePanel from './PostgresUsagePanel';
import PostgresBackupPanel from './PostgresBackupPanel';
import AuditoriaPanel from './AuditoriaPanel';
import { apiFetch, apiJson, getSetting, setSetting } from '../lib/http';
import { isSupervisor, type AuthUser } from '../lib/auth';

type SupervisorTab = 'usuarios' | 'auditoria_produtos' | 'banco' | 'erp' | 'rede' | 'auditoria';

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
  const supervisorMode = variant === 'supervisor';
  const canEditInfra = supervisorMode && isSupervisor(currentUser);
  const [supervisorTab, setSupervisorTab] = useState<SupervisorTab>('usuarios');

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
      });
      setStockVerifyProgress(null);
      const bs = donePayload.bySource;
      const bySrc =
        bs != null ? ` (I ${bs.insumos} · M ${bs.materiais} · P ${bs.produtos})` : '';
      setMessage({
        text:
          (donePayload.repaired ?? 0) > 0
            ? `Estoque: ${donePayload.checked} conferidos, ${donePayload.repaired} divergências corrigidas${bySrc}. Recarregue Compras.`
            : `0 divergências de estoque: ${donePayload.checked} itens batem com a tela do ERP (nQtdeEstoqueA líquido em insumos / nQtdeEstoque em produtos).`,
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
          ? `${code}: Hub bate com a tela do ERP (nQtdeEstoque + R/P/Ped).`
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

  if (supervisorMode) {
    const sidebarItems: Array<{
      id: SupervisorTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      description: string;
    }> = [
      {
        id: 'usuarios',
        label: 'Usuários & Permissões',
        icon: Users,
        description: 'Acessos, leitura e escrita',
      },
      {
        id: 'auditoria_produtos',
        label: 'Auditoria de Produtos',
        icon: Boxes,
        description: 'Conferência Hub × ERP ao vivo',
      },
      {
        id: 'banco',
        label: 'Banco de Dados',
        icon: HardDrive,
        description: 'PostgreSQL, disco e backups',
      },
      {
        id: 'erp',
        label: 'Sincronização ERP',
        icon: Database,
        description: 'SQL Server, agenda e travas',
      },
      {
        id: 'rede',
        label: 'Rede & Servidor',
        icon: Globe,
        description: 'IPs, portas e conexão',
      },
      {
        id: 'auditoria',
        label: 'Auditoria & Logs',
        icon: FileText,
        description: 'Histórico de eventos',
      },
    ];

    return (
      <div className="flex-1 flex overflow-hidden bg-zinc-50 font-sans text-zinc-900">
        {/* Sidebar Lateral de Navegação */}
        <aside className="w-64 border-r border-zinc-200 bg-white p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider px-3 py-1.5">
              Painel do Supervisor
            </p>
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = supervisorTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setSupervisorTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-violet-600 text-white font-bold shadow-xs shadow-violet-600/20'
                      : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 font-medium'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate leading-tight">{item.label}</p>
                    <p className={`text-[10px] truncate ${isActive ? 'text-violet-200' : 'text-zinc-400'}`}>
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3 bg-zinc-50 border border-zinc-200/70 rounded-xl mt-4">
            <div className="flex items-center gap-2 text-zinc-600 text-xs font-bold mb-1">
              <Activity className="h-3.5 w-3.5 text-violet-600" />
              <span>Status Servidor</span>
            </div>
            <p className="text-[10px] text-zinc-400 leading-tight">
              Instância Local na porta 3001
            </p>
          </div>
        </aside>

        {/* Área Principal de Conteúdo */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-zinc-50 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Mensagem Toast */}
            {message && (
              <div className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between shadow-xs ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
                <span className="flex items-center gap-2">
                  {message.type === 'success' ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />}
                  {message.text}
                </span>
              </div>
            )}

            {!canEditInfra && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                Faça login como supervisor master para alterar configurações de infraestrutura e sincronização ERP.
              </div>
            )}

            {/* Aba Usuários */}
            {supervisorTab === 'usuarios' && (
              <OperadoresPanel currentUser={currentUser} setMessage={setMessage} />
            )}

            {/* Aba Auditoria de Produtos & Estoque */}
            {supervisorTab === 'auditoria_produtos' && canEditInfra && (
              <div className="space-y-6">
                <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm tracking-tight">Auditoria de Estoque & Produtos (Hub vs ERP)</h3>
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
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
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
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-xs text-indigo-950 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Auditoria em andamento {stockVerifyProgress.phase ? `(${stockVerifyProgress.phase})` : ''}</span>
                        </span>
                        <span className="font-mono tabular-nums">
                          {stockVerifyProgress.processed} / {stockVerifyProgress.total || '—'} · {stockVerifyProgress.repaired} corrigidos
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-indigo-200 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
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
                        <p className="text-[10px] font-mono text-indigo-700/80 truncate">
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
                      {stockVerifyResult.samples.length > 0 && (
                        <div className="space-y-1 pt-2 border-t border-zinc-200">
                          <p className="text-[10px] font-black uppercase text-zinc-400">Amostras de itens corrigidos:</p>
                          <ul className="max-h-48 overflow-y-auto text-[11px] text-zinc-600 space-y-1 font-mono bg-white p-2 rounded-lg border border-zinc-200">
                            {stockVerifyResult.samples.map((s) => (
                              <li key={`${s.source || 'x'}-${s.code}`} className="flex justify-between py-0.5 border-b border-zinc-100 last:border-none">
                                <span>{s.source ? `[${s.source}] ` : ''}{s.code}</span>
                                <span className="text-zinc-500">
                                  Hub: {s.hub.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} → ERP: <strong className="text-indigo-600">{s.erp.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</strong>
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
                      <Search className="h-4 w-4 text-indigo-600" />
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
                        className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-zinc-300 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAuditStockCode()}
                        disabled={auditingCode || refreshingCode || syncingSql}
                        className="bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                      >
                        {auditingCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        <span>Auditar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRefreshStockCode()}
                        disabled={auditingCode || refreshingCode || syncingSql || !auditCode.trim()}
                        className="bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
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
                                <div>Reserva: {stockAuditResult.erp.reservedQty?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) ?? '—'}</div>
                                <div>Produção: {stockAuditResult.erp.inProduction?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) ?? '—'}</div>
                                <div>Pedidos: {stockAuditResult.erp.inOrders?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) ?? '—'}</div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Aba Banco de Dados */}
            {supervisorTab === 'banco' && canEditInfra && (
              <>
                <PostgresUsagePanel setMessage={setMessage} />
                <PostgresBackupPanel setMessage={setMessage} />
              </>
            )}

            {/* Aba Rede & Servidor */}
            {supervisorTab === 'rede' && (
              <ConexaoServidorPanel
                isAdmin={!currentUser || isSupervisor(currentUser)}
                message={message}
                setMessage={setMessage}
              />
            )}

            {/* Aba Auditoria do Sistema */}
            {supervisorTab === 'auditoria' && canEditInfra && (
              <AuditoriaPanel setMessage={setMessage} />
            )}

            {/* Aba ERP */}
            {supervisorTab === 'erp' && canEditInfra && (
              <>
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

                <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 border-b border-zinc-150 pb-4">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-sm tracking-tight">Sincronização ERP (SQL Server)</h3>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                        Importação ERP → PostgreSQL · manual ou agenda automática
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
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Usuário SQL Server</label>
                        <input
                          type="text"
                          value={sqlUser}
                          onChange={(e) => setSqlUser(e.target.value)}
                          className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                          placeholder="sa"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Senha</label>
                        <input
                          type="password"
                          value={sqlPassword}
                          onChange={(e) => setSqlPassword(e.target.value)}
                          className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Nome do Banco</label>
                      <input
                        type="text"
                        value={sqlDatabase}
                        onChange={(e) => setSqlDatabase(e.target.value)}
                        className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800"
                        placeholder="NATUM"
                      />
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={handleSaveSqlConfig}
                        disabled={savingSql}
                        className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {savingSql ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                        Salvar Credenciais
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSyncSqlDatabase('incremental')}
                        disabled={syncingSql || (syncLock?.running ?? false)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                        title="Importa só o delta desde o último sync"
                      >
                        {syncingSql ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Sincronizar Agora (Delta)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSyncSqlDatabase('full')}
                        disabled={syncingSql || (syncLock?.running ?? false)}
                        className="bg-zinc-800 hover:bg-zinc-900 text-zinc-200 hover:text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                        title="Reprocessa todo o histórico desde a data configurada acima"
                      >
                        {syncingSql ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Sync Completo
                      </button>
                    </div>
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

                    <div className="border-t border-zinc-150 pt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-emerald-600" />
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          Auto-Auditor de Estoque em Segundo Plano
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Verificação periódica ultrarrápida (~1s) que re-lê o estoque de tela (<code className="font-mono text-zinc-700">nQtdeEstoque</code>) de Insumos, Materiais e Produtos no ERP e corrige o Hub automaticamente.
                      </p>
                      <div>
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                          Intervalo de auto-auditoria de estoque
                        </label>
                        <select
                          value={erpSchedule.auto_audit_interval_minutes ?? 15}
                          onChange={(e) =>
                            setErpSchedule((prev) => ({
                              ...prev,
                              auto_audit_interval_minutes: Number(e.target.value),
                            }))
                          }
                          className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-white text-zinc-800 font-semibold"
                        >
                          <option value={5}>A cada 5 minutos (alta frequência)</option>
                          <option value={15}>A cada 15 minutos (recomendado)</option>
                          <option value={30}>A cada 30 minutos</option>
                          <option value={60}>A cada 1 hora</option>
                          <option value={0}>Desativado (somente manual)</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveErpSchedule}
                      disabled={savingSchedule || loadingSchedule}
                      className="w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {savingSchedule ? 'Salvando...' : 'Salvar configurações automáticas'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-between overflow-y-auto bg-zinc-50 font-sans text-zinc-900">
      <main className="flex-1 p-8 max-w-4xl w-full mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
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

        {isSupervisor(currentUser) && (
          <OperadoresPanel currentUser={currentUser} setMessage={setMessage} />
        )}
      </main>

      <footer className="w-full text-center py-6 text-xs text-zinc-400 border-t border-zinc-200/50 bg-white/50">
        &copy; {new Date().getFullYear()} Nátum Bio Cosméticos. Todos os direitos reservados.
      </footer>
    </div>
  );
}
