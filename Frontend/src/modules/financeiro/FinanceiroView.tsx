import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, DollarSign,
  AlertCircle, Settings, Search, Calendar,
  CheckCircle2, Clock, Loader2, Key, Check, X, ChevronLeft, ChevronRight,
  Scale, BarChart3, Users, Wallet
} from 'lucide-react';
import { apiJson } from '../geral/lib/http';
import type {
  AccountsPage, FinancialStatus, FinancialSyncResult, FlowSummary, AgingBucket, PartyBalance
} from '../geral/lib/types';

interface Props {
  onBackToHub: () => void;
}

type Tab = 'dashboard' | 'receber' | 'pagar' | 'config';

const SITUACAO_LABEL: Record<string, { label: string; color: string }> = {
  aberto:    { label: 'Em Aberto', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  pago:      { label: 'Pago',       color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  parcial:   { label: 'Parcial',   color: 'text-blue-600 bg-blue-50 border-blue-200' },
  cancelado: { label: 'Cancelado', color: 'text-zinc-500 bg-zinc-100 border-zinc-200' },
};

function fmt(v: number) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function isOverdue(dataVencimento: string, situacao: string): boolean {
  if (situacao === 'pago' || situacao === 'cancelado') return false;
  if (!dataVencimento) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dataVencimento + 'T00:00:00');
  return due < today;
}

function SummaryCard({ title, value, sub, icon, color }: {
  title: string; value: number; sub?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 flex items-start gap-4 bg-white shadow-sm ${color}`}>
      <div className="rounded-xl p-2.5 bg-current/10 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-60">{title}</p>
        <p className="text-xl sm:text-2xl font-bold mt-0.5 truncate" title={fmt(value)}>{fmt(value)}</p>
        {sub && <p className="text-xs mt-0.5 opacity-60">{sub}</p>}
      </div>
    </div>
  );
}

function FlowBar({ entrada, saida }: { entrada: number; saida: number }) {
  const max = Math.max(entrada, saida, 1);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500 w-14 text-right">Entrada</span>
        <div className="flex-1 bg-emerald-100 rounded-full h-2 overflow-hidden">
          <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(entrada / max) * 100}%` }} />
        </div>
        <span className="text-[10px] font-medium text-emerald-700 w-24 text-right">{fmt(entrada)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500 w-14 text-right">Saída</span>
        <div className="flex-1 bg-rose-100 rounded-full h-2 overflow-hidden">
          <div className="bg-rose-500 h-2 rounded-full transition-all" style={{ width: `${(saida / max) * 100}%` }} />
        </div>
        <span className="text-[10px] font-medium text-rose-700 w-24 text-right">{fmt(saida)}</span>
      </div>
    </div>
  );
}

function AgingList({ title, buckets }: { title: string; buckets: AgingBucket[] }) {
  const max = Math.max(...buckets.map(b => b.saldo), 1);
  const hasData = buckets.some(b => b.count > 0);
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-bold text-zinc-700 mb-3">{title}</h3>
      {!hasData ? (
        <p className="text-xs text-zinc-400 py-4 text-center">Sem dados de aging</p>
      ) : (
        <div className="space-y-2.5">
          {buckets.filter(b => b.count > 0).map(b => (
            <div key={b.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-600 font-medium">{b.label}</span>
                <span className="text-zinc-500">{b.count} · <strong className="text-zinc-800">{fmt(b.saldo)}</strong></span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${b.label.startsWith('Atrasado') ? 'bg-red-400' : 'bg-sky-400'}`}
                  style={{ width: `${Math.min(100, (b.saldo / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopParties({ title, parties, accent }: { title: string; parties: PartyBalance[]; accent: string }) {
  const max = Math.max(...parties.map(p => p.saldo), 1);
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
      <h3 className="text-sm font-bold text-zinc-700 mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-zinc-500" />{title}
      </h3>
      {parties.length === 0 ? (
        <p className="text-xs text-zinc-400 py-4 text-center">Nenhum título em aberto</p>
      ) : (
        <div className="space-y-3">
          {parties.map((p, i) => (
            <div key={p.nome + i}>
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="font-medium text-zinc-700 truncate" title={p.nome}>{i + 1}. {p.nome}</span>
                <span className="shrink-0 text-zinc-500">{p.count}x · <strong className="text-zinc-900">{fmt(p.saldo)}</strong></span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${accent}`} style={{ width: `${(p.saldo / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FinanceiroView({ onBackToHub }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [status, setStatus] = useState<FinancialStatus | null>(null);
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [pageData, setPageData] = useState<AccountsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDash, setLoadingDash] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<FinancialSyncResult | null>(null);

  const [sitFilter, setSitFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenMsg, setTokenMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [syncStart, setSyncStart] = useState('');
  const [syncEnd, setSyncEnd] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const s = await apiJson<FinancialStatus>('/api/financeiro/status');
      setStatus(s);
    } catch { /* ignore */ }
  }, []);

  const fetchFlow = useCallback(async () => {
    setLoadingDash(true);
    try {
      const f = await apiJson<FlowSummary>('/api/financeiro/fluxo');
      setFlow(f);
    } catch {
      setFlow(null);
    } finally {
      setLoadingDash(false);
    }
  }, []);

  const fetchAccounts = useCallback(async (
    tipo: 'receber' | 'pagar',
    sit: string,
    q: string,
    pg: number,
    start: string,
    end: string,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tipo, page: String(pg), limit: String(limit) });
      if (sit && sit !== 'todos') params.set('situacao', sit);
      if (q) params.set('search', q);
      if (start) params.set('startDate', start);
      if (end) params.set('endDate', end);
      const data = await apiJson<AccountsPage>(`/api/financeiro/contas?${params}`);
      setPageData(data);
    } catch {
      setPageData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchFlow();
  }, [fetchStatus, fetchFlow]);

  useEffect(() => {
    if (tab === 'receber' || tab === 'pagar') {
      fetchAccounts(tab, sitFilter, search, page, dateStart, dateEnd);
    }
  }, [tab, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const body: Record<string, string> = {};
      if (syncStart) body.startDate = syncStart;
      if (syncEnd) body.endDate = syncEnd;
      const result = await apiJson<FinancialSyncResult>('/api/financeiro/sync', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setLastSyncResult(result);
      const secs = (result.elapsedMs / 1000).toFixed(1);
      setSyncMsg({
        text: `Sync OK em ${secs}s — Receber: ${result.receivablesUpserted} upserts / ${result.receivablesRemoved} removidos · Pagar: ${result.payablesUpserted} upserts / ${result.payablesRemoved} removidos`,
        ok: true,
      });
      await fetchStatus();
      await fetchFlow();
      if (tab === 'receber' || tab === 'pagar') {
        fetchAccounts(tab, sitFilter, search, page, dateStart, dateEnd);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro na sincronização.';
      setSyncMsg({ text: msg, ok: false });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    setTokenMsg(null);
    try {
      await apiJson('/api/financeiro/token', {
        method: 'POST',
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      setTokenMsg({ text: 'Token salvo com segurança (ofuscado no banco local).', ok: true });
      setTokenInput('');
      await fetchStatus();
    } catch {
      setTokenMsg({ text: 'Erro ao salvar token.', ok: false });
    } finally {
      setSavingToken(false);
    }
  };

  const applyAccountFilter = () => {
    setPage(1);
    if (tab === 'receber' || tab === 'pagar') {
      fetchAccounts(tab, sitFilter, search, 1, dateStart, dateEnd);
    }
  };

  const accounts = pageData?.items ?? [];
  const tabClass = (t: Tab) =>
    `px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
      tab === t ? 'bg-zinc-900 text-white shadow' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
    }`;

  const netColor = (v: number) => (v >= 0 ? 'text-emerald-600' : 'text-red-600');

  const monthNames = useMemo(
    () => ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    [],
  );

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-zinc-50 font-sans text-zinc-900">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center gap-4 shrink-0">
        <button
          onClick={onBackToHub}
          className="p-2 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition-all"
          title="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-bold text-lg tracking-tight flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            Módulo Financeiro
          </h1>
          <p className="text-[11px] text-zinc-400 font-medium">
            Tiny ERP — Contas a Pagar/Receber, fluxo e projeção
            {status && (
              <span className="ml-1">
                · {status.receivablesCount ?? 0} a receber · {status.payablesCount ?? 0} a pagar
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          {status && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {status.isConfigured ? (
                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> API OK
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600 font-semibold">
                  <AlertCircle className="h-3.5 w-3.5" /> Token pendente
                </span>
              )}
              {status.lastSync && <span>· Sync: {status.lastSync}</span>}
            </div>
          )}
          <button
            onClick={handleSync}
            disabled={syncing || !status?.isConfigured}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`mx-6 mt-4 p-3 rounded-xl flex items-start gap-2 text-sm font-medium border ${
          syncMsg.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {syncMsg.ok ? <Check className="h-4 w-4 mt-0.5 shrink-0" /> : <X className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{syncMsg.text}</span>
        </div>
      )}

      <div className="flex items-center gap-2 px-6 pt-5 pb-0 shrink-0 flex-wrap">
        <button className={tabClass('dashboard')} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={tabClass('receber')} onClick={() => { setPage(1); setTab('receber'); }}>Contas a Receber</button>
        <button className={tabClass('pagar')} onClick={() => { setPage(1); setTab('pagar'); }}>Contas a Pagar</button>
        <button className={tabClass('config')} onClick={() => setTab('config')}>
          <Settings className="h-3.5 w-3.5 inline mr-1" />Configurações
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {/* ====== DASHBOARD ====== */}
        {tab === 'dashboard' && (
          <div className="space-y-8">
            {loadingDash && !flow && (
              <div className="flex items-center justify-center py-16 text-zinc-400">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando dashboard…
              </div>
            )}

            {flow && (
              <>
                {/* Posição líquida */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                      <Scale className="h-4 w-4" /> Posição líquida
                    </div>
                    <p className={`text-3xl font-bold ${netColor(flow.posicaoLiquida)}`}>
                      {fmt(flow.posicaoLiquida)}
                    </p>
                    <p className="text-xs text-zinc-400 mt-2">
                      A receber em aberto − a pagar em aberto
                    </p>
                    <div className="mt-4 pt-4 border-t border-zinc-100 flex justify-between text-xs">
                      <span className="text-zinc-500">Risco líquido (atrasados)</span>
                      <span className={`font-bold ${netColor(flow.riscoLiquido)}`}>{fmt(flow.riscoLiquido)}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                      <Wallet className="h-4 w-4" /> Movimento no mês
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-600">Recebido (venc. mês)</span>
                        <span className="font-bold text-emerald-600">{fmt(flow.recebidoMesAtual)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-zinc-600">Pago (venc. mês)</span>
                        <span className="font-bold text-rose-600">{fmt(flow.pagoMesAtual)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-zinc-100">
                        <span className="text-sm font-semibold text-zinc-700">Líquido do mês</span>
                        <span className={`font-bold ${netColor(flow.recebidoMesAtual - flow.pagoMesAtual)}`}>
                          {fmt(flow.recebidoMesAtual - flow.pagoMesAtual)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                      <Calendar className="h-4 w-4" /> Vencendo em breve
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                        <p className="text-emerald-700 font-semibold mb-1">Receber 7d</p>
                        <p className="text-sm font-bold text-emerald-800">{fmt(flow.receberVencendo7d)}</p>
                      </div>
                      <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100">
                        <p className="text-emerald-700 font-semibold mb-1">Receber 30d</p>
                        <p className="text-sm font-bold text-emerald-800">{fmt(flow.receberVencendo30d)}</p>
                      </div>
                      <div className="bg-rose-50 rounded-xl p-3 border border-rose-100">
                        <p className="text-rose-700 font-semibold mb-1">Pagar 7d</p>
                        <p className="text-sm font-bold text-rose-800">{fmt(flow.pagarVencendo7d)}</p>
                      </div>
                      <div className="bg-rose-50/60 rounded-xl p-3 border border-rose-100">
                        <p className="text-rose-700 font-semibold mb-1">Pagar 30d</p>
                        <p className="text-sm font-bold text-rose-800">{fmt(flow.pagarVencendo30d)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contas a Receber */}
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3">
                    Contas a Receber
                    <span className="ml-2 font-normal normal-case text-zinc-400">
                      ({flow.qtdReceberAberto} abertos · {flow.qtdReceberAtrasado} atrasados)
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SummaryCard
                      title="Em Aberto"
                      value={flow.totalReceberAberto}
                      sub={`${flow.qtdReceberAberto} títulos`}
                      icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
                      color="border-emerald-100 text-emerald-700"
                    />
                    <SummaryCard
                      title="Atrasado"
                      value={flow.totalReceberAtrasado}
                      sub={`${flow.qtdReceberAtrasado} títulos · do total em aberto`}
                      icon={<AlertCircle className="h-5 w-5 text-red-500" />}
                      color="border-red-100 text-red-700"
                    />
                    <SummaryCard
                      title="Recebido (histórico)"
                      value={flow.totalReceberPago}
                      icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                      color="border-zinc-100 text-emerald-600"
                    />
                  </div>
                </div>

                {/* Contas a Pagar */}
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3">
                    Contas a Pagar
                    <span className="ml-2 font-normal normal-case text-zinc-400">
                      ({flow.qtdPagarAberto} abertos · {flow.qtdPagarAtrasado} atrasados)
                    </span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SummaryCard
                      title="Em Aberto"
                      value={flow.totalPagarAberto}
                      sub={`${flow.qtdPagarAberto} títulos`}
                      icon={<TrendingDown className="h-5 w-5 text-rose-600" />}
                      color="border-rose-100 text-rose-700"
                    />
                    <SummaryCard
                      title="Atrasado"
                      value={flow.totalPagarAtrasado}
                      sub={`${flow.qtdPagarAtrasado} títulos · do total em aberto`}
                      icon={<AlertCircle className="h-5 w-5 text-red-500" />}
                      color="border-red-100 text-red-700"
                    />
                    <SummaryCard
                      title="Pago (histórico)"
                      value={flow.totalPagarPago}
                      icon={<CheckCircle2 className="h-5 w-5 text-zinc-500" />}
                      color="border-zinc-100 text-zinc-600"
                    />
                  </div>
                </div>

                {/* Projeção semanal */}
                {flow.weeklyProjection?.length > 0 && (
                  <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
                    <h2 className="text-sm font-bold text-zinc-700 mb-1 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> Projeção de caixa (8 semanas)
                    </h2>
                    <p className="text-xs text-zinc-400 mb-5">
                      Saldos em aberto com vencimento em cada semana · acumulado = projeção progressiva
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-zinc-500 border-b border-zinc-100">
                            <th className="pb-2 font-semibold">Semana</th>
                            <th className="pb-2 font-semibold text-right">Entradas</th>
                            <th className="pb-2 font-semibold text-right">Saídas</th>
                            <th className="pb-2 font-semibold text-right">Saldo</th>
                            <th className="pb-2 font-semibold text-right">Acumulado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                          {flow.weeklyProjection.map(w => (
                            <tr key={w.weekStart} className="hover:bg-zinc-50">
                              <td className="py-2.5 font-medium text-zinc-700">{w.label}</td>
                              <td className="py-2.5 text-right text-emerald-600">{fmt(w.entradas)}</td>
                              <td className="py-2.5 text-right text-rose-600">{fmt(w.saidas)}</td>
                              <td className={`py-2.5 text-right font-semibold ${netColor(w.saldo)}`}>{fmt(w.saldo)}</td>
                              <td className={`py-2.5 text-right font-bold ${netColor(w.acumulado)}`}>{fmt(w.acumulado)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Aging + tops */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <AgingList title="Aging — Contas a Receber" buckets={flow.agingReceber ?? []} />
                  <AgingList title="Aging — Contas a Pagar" buckets={flow.agingPagar ?? []} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <TopParties title="Top clientes (saldo em aberto)" parties={flow.topClientes ?? []} accent="bg-emerald-400" />
                  <TopParties title="Top fornecedores (saldo em aberto)" parties={flow.topFornecedores ?? []} accent="bg-rose-400" />
                </div>

                {/* Fluxo mensal */}
                {flow.flow.length > 0 && (
                  <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
                    <h2 className="text-sm font-bold text-zinc-700 mb-1">Fluxo de caixa mensal</h2>
                    <p className="text-xs text-zinc-400 mb-6">Comparativo de entradas e saídas por período de vencimento</p>
                    <div className="space-y-4">
                      {flow.flow.map(f => {
                        const [yr, mo] = f.period.split('-');
                        const label = `${monthNames[parseInt(mo, 10) - 1]}/${yr}`;
                        const saldo = f.saldoPeriodo ?? (f.entradaTotal - f.saidaTotal);
                        return (
                          <div key={f.period} className="flex items-center gap-4">
                            <span className="text-xs font-semibold text-zinc-500 w-16 shrink-0">{label}</span>
                            <div className="flex-1">
                              <FlowBar entrada={f.entradaTotal} saida={f.saidaTotal} />
                              <div className="flex gap-4 mt-1 pl-[3.75rem] text-[10px] text-zinc-400">
                                <span>Pago in: {fmt(f.entradaPaga)}</span>
                                <span>Pago out: {fmt(f.saidaPaga)}</span>
                              </div>
                            </div>
                            <span className={`text-xs font-bold w-24 text-right ${netColor(saldo)}`}>
                              {saldo >= 0 ? '+' : ''}{fmt(saldo)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {lastSyncResult && (
                  <div className="text-xs text-zinc-400 text-center">
                    Última sync nesta sessão: {lastSyncResult.startDate} → {lastSyncResult.endDate}
                    {' · '}{lastSyncResult.receivablesUpserted + lastSyncResult.payablesUpserted} upserts
                    {' · '}{lastSyncResult.receivablesRemoved + lastSyncResult.payablesRemoved} reconciliados/removidos
                  </div>
                )}
              </>
            )}

            {!flow && !loadingDash && !status?.isConfigured && (
              <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-400 space-y-3">
                <Key className="h-10 w-10 opacity-30" />
                <p className="font-semibold text-zinc-500">API do Tiny ERP não configurada</p>
                <p className="text-sm max-w-sm">
                  Acesse <strong>Configurações</strong> para inserir o token e sincronize os dados.
                </p>
                <button
                  onClick={() => setTab('config')}
                  className="mt-2 px-4 py-2 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-700 transition-all"
                >
                  Ir para Configurações
                </button>
              </div>
            )}

            {!flow && !loadingDash && status?.isConfigured && (
              <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400 space-y-3">
                <RefreshCw className="h-8 w-8 opacity-30" />
                <p className="font-semibold text-zinc-500">Nenhum dado financeiro local</p>
                <p className="text-sm">Clique em <strong>Sincronizar</strong> para baixar contas do Tiny.</p>
              </div>
            )}
          </div>
        )}

        {/* ====== LISTAS ====== */}
        {(tab === 'receber' || tab === 'pagar') && (
          <div className="space-y-4">
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  className="pl-9 pr-4 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/20 w-56"
                  placeholder="Buscar cliente, histórico, doc…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && applyAccountFilter()}
                />
              </div>
              <select
                className="px-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                value={sitFilter}
                onChange={e => setSitFilter(e.target.value)}
              >
                <option value="todos">Todas as situações</option>
                <option value="aberto">Em Aberto</option>
                <option value="pago">Pago</option>
                <option value="parcial">Parcial</option>
                <option value="cancelado">Cancelado</option>
              </select>
              <input
                type="date"
                className="px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                value={dateStart}
                onChange={e => setDateStart(e.target.value)}
                title="Vencimento de"
              />
              <span className="text-zinc-400 text-xs">até</span>
              <input
                type="date"
                className="px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                value={dateEnd}
                onChange={e => setDateEnd(e.target.value)}
                title="Vencimento até"
              />
              <button
                onClick={applyAccountFilter}
                className="px-4 py-2 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-700 transition-all"
              >
                Filtrar
              </button>
              <div className="text-xs text-zinc-400 ml-auto text-right">
                {pageData ? (
                  <>
                    <div>{pageData.total} registros · página {pageData.page}/{pageData.totalPages}</div>
                    <div className="font-medium text-zinc-600">
                      Σ valor {fmt(pageData.totalValor)} · Σ saldo {fmt(pageData.totalSaldo)}
                    </div>
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-20 text-zinc-400">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando…
                </div>
              ) : accounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-400 space-y-2">
                  <Clock className="h-8 w-8 opacity-30" />
                  <p className="text-sm">Nenhum registro encontrado para este filtro.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wide">Cliente / Fornecedor</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wide">Histórico</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wide">Doc.</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wide">Emissão</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wide">Vencimento</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wide">Valor</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wide">Saldo</th>
                        <th className="text-center px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wide">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {accounts.map(acc => {
                        const overdue = isOverdue(acc.dataVencimento, acc.situacao);
                        const sit = SITUACAO_LABEL[acc.situacao] ?? {
                          label: acc.situacao,
                          color: 'text-zinc-500 bg-zinc-100 border-zinc-200',
                        };
                        return (
                          <tr key={acc.id} className={`hover:bg-zinc-50 transition-colors ${overdue ? 'bg-red-50/40' : ''}`}>
                            <td className="px-4 py-3 font-medium text-zinc-800 max-w-[200px] truncate">{acc.nomeCliente}</td>
                            <td className="px-4 py-3 text-zinc-500 max-w-[200px] truncate">{acc.historico ?? '–'}</td>
                            <td className="px-4 py-3 text-zinc-500">{acc.numeroDoc ?? '–'}</td>
                            <td className="px-4 py-3 text-zinc-500">{fmtDate(acc.dataEmissao)}</td>
                            <td className="px-4 py-3">
                              <span className={overdue ? 'text-red-600 font-semibold' : 'text-zinc-700'}>
                                {fmtDate(acc.dataVencimento)}
                                {overdue && <AlertCircle className="h-3.5 w-3.5 inline ml-1 text-red-500" />}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-zinc-700">{fmt(acc.valor)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-zinc-900">{fmt(acc.saldo)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${sit.color}`}>
                                {sit.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {pageData && pageData.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 bg-zinc-50/50">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 bg-white disabled:opacity-40 hover:bg-zinc-50"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                  <span className="text-xs text-zinc-500">
                    Página {pageData.page} de {pageData.totalPages}
                  </span>
                  <button
                    disabled={page >= pageData.totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 bg-white disabled:opacity-40 hover:bg-zinc-50"
                  >
                    Próxima <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====== CONFIG ====== */}
        {tab === 'config' && (
          <div className="max-w-xl space-y-6">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h2 className="font-bold text-zinc-800 flex items-center gap-2">
                  <Key className="h-4 w-4 text-zinc-600" />Token da API Tiny ERP
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  O token é ofuscado no SQLite local e nunca é re-exibido após salvar.
                  As chamadas à API do Tiny rodam apenas no backend Rust.
                </p>
              </div>

              {status?.isConfigured && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Token configurado. Cole um novo valor abaixo para substituir.
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/20 font-mono"
                  placeholder="Cole o token da API do Tiny ERP…"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveToken()}
                />
                <button
                  onClick={handleSaveToken}
                  disabled={savingToken || !tokenInput.trim()}
                  className="px-4 py-2 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {savingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Salvar
                </button>
              </div>
              {tokenMsg && (
                <p className={`text-sm font-medium ${tokenMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {tokenMsg.text}
                </p>
              )}
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h2 className="font-bold text-zinc-800 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-zinc-600" />Período de sincronização
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Intervalo de vencimento buscado no Tiny. Padrão: 90 dias atrás → 180 dias à frente.
                  Contas no intervalo que não voltarem na API são removidas do cache local (reconciliação).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-500 mb-1 block">Data inicial</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                    value={syncStart}
                    onChange={e => setSyncStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 mb-1 block">Data final</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                    value={syncEnd}
                    onChange={e => setSyncEnd(e.target.value)}
                  />
                </div>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing || !status?.isConfigured}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {syncing ? 'Sincronizando (pode levar alguns minutos)…' : 'Sincronizar agora'}
              </button>
              {syncMsg && (
                <p className={`text-sm font-medium text-center ${syncMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {syncMsg.text}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
