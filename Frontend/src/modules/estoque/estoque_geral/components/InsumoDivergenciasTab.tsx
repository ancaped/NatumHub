import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, RefreshCw, X, ShieldAlert,
  CheckCircle2, Info, Receipt, ClipboardList, Layers
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { apiFetch } from '../../../geral/lib/http';

type Scope = 'all' | 'mp' | 'emb';
type DrawerTab = 'visao_geral' | 'movimentacoes' | 'lotes' | 'notas';

interface DivergenciaItem {
  code: string;
  description: string;
  unit: string;
  categoryId: string | null;
  categoryName: string;
  rootCategory: string;
  hubStock: number;
  reservedQty: number;
  inOrders: number;
  erpStock: number | null;
  deltaHubErp: number | null;
  sumEntradas: number;
  sumSaidas: number;
  flags: string[];
  resolvedTypes: string[];
  unresolvedCount: number;
}

interface MovementRow {
  id: string;
  date: string;
  movementType: string;
  label: string;
  quantity: number;
  documentNumber: string | null;
  details: string | null;
  sourceKind: string;
}

interface DetailPayload {
  code: string;
  description: string;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  hub: {
    stockQty: number;
    reservedQty: number;
    inProduction: number;
    inOrders: number;
    snapshotDate: string | null;
  };
  erp: {
    source?: string | null;
    stockQty?: number;
    reservedQty?: number;
    error?: string;
  };
  deltaHubErp: number | null;
  flags: string[];
  sums: { entradas: number; saidas: number };
  movements: MovementRow[];
  invoices: Array<{
    id: string;
    invoiceNumber: string | null;
    quantity: number;
    unitPrice: number;
    totalValue: number;
    supplierName: string | null;
    invoiceDate: string | null;
  }>;
  baixas: Array<{
    registro: number;
    lote: number | null;
    qty: number;
    qtyRef: number;
    date: string | null;
    user: string | null;
    justificativa: string | null;
    productCode: string | null;
    diffPct: number;
    anomalous: boolean;
  }>;
  resolutions: Array<{
    errorType: string;
    observations: string | null;
    resolvedBy: string | null;
    resolvedAt: string | null;
  }>;
}

const FLAG_LABELS: Record<string, string> = {
  HUB_ERP: 'Hub ≠ ERP',
  KARDEX_GAP: 'Kardex',
  LOTE_PESAGEM: 'Lote / pesagem',
  BAIXA_ANOMALA: 'Baixa anômala',
  MOV_EXTRA: 'Acerto / extra',
};

function flagBadgeClass(flag: string) {
  if (flag === 'HUB_ERP') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (flag === 'BAIXA_ANOMALA' || flag === 'LOTE_PESAGEM') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (flag === 'MOV_EXTRA') return 'bg-violet-50 text-violet-800 border-violet-200';
  return 'bg-zinc-100 text-zinc-700 border-zinc-200';
}

export function InsumoDivergenciasTab({
  active = false,
  lockedScope = null,
}: {
  active?: boolean;
  lockedScope?: 'mp' | 'emb' | null;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DivergenciaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState({ flagged: 0, critical: 0, hubErp: 0 });
  const [scope, setScope] = useState<Scope>(lockedScope ?? 'all');
  const [search, setSearch] = useState('');
  const [errorType, setErrorType] = useState('');
  const [hideResolved, setHideResolved] = useState(true);
  const [checkErp, setCheckErp] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('visao_geral');
  const [resolveObs, setResolveObs] = useState('');
  const [resolveType, setResolveType] = useState('BAIXA_ANOMALA');
  const [saving, setSaving] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');

  useEffect(() => {
    if (lockedScope) setScope(lockedScope);
  }, [lockedScope]);

  const loadList = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        scope,
        hide_resolved: String(hideResolved),
        check_erp: String(checkErp),
        limit: '300',
        offset: '0',
      });
      if (search.trim()) params.set('search', search.trim());
      if (errorType) params.set('error_type', errorType);
      const res = await apiFetch(`/estoque/insumos/divergencias?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || { flagged: 0, critical: 0, hubErp: 0 });
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [active, scope, hideResolved, checkErp, search, errorType]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (code: string) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/estoque/insumos/${encodeURIComponent(code)}/divergencias`);
      if (!res.ok) throw new Error(await res.text());
      setDetail(await res.json());
    } catch (e) {
      console.error(e);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCode) {
      loadDetail(selectedCode);
      setDrawerTab('visao_geral');
      setDrawerSearch('');
    } else {
      setDetail(null);
    }
  }, [selectedCode, loadDetail]);

  const openFlags = useMemo(() => {
    if (!detail) return [] as string[];
    const resolved = new Set((detail.resolutions || []).map(r => r.errorType));
    return (detail.flags || []).filter(f => !resolved.has(f));
  }, [detail]);

  useEffect(() => {
    if (openFlags.length > 0) setResolveType(openFlags[0]);
  }, [openFlags]);

  const handleResolve = async () => {
    if (!selectedCode || !resolveType) return;
    setSaving(true);
    try {
      const res = await apiFetch(
        `/estoque/insumos/${encodeURIComponent(selectedCode)}/divergencias/resolver`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error_type: resolveType,
            observations: resolveObs || 'Justificado',
          }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      setResolveObs('');
      await loadDetail(selectedCode);
      await loadList();
    } catch (e) {
      console.error(e);
      alert('Falha ao salvar justificação.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnresolve = async (errorTypeVal: string) => {
    if (!selectedCode) return;
    setSaving(true);
    try {
      const res = await apiFetch(
        `/estoque/insumos/${encodeURIComponent(selectedCode)}/divergencias/resolver?errorType=${encodeURIComponent(errorTypeVal)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(await res.text());
      await loadDetail(selectedCode);
      await loadList();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshErp = async () => {
    if (!selectedCode) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/audit/stock/${encodeURIComponent(selectedCode)}/refresh`, {
        method: 'POST',
      });
      await loadDetail(selectedCode);
      await loadList();
    } catch (e) {
      console.error(e);
      alert('Falha ao atualizar do ERP (precisa master + SQL Server).');
    } finally {
      setSaving(false);
    }
  };

  if (!active) return null;

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-8rem)]">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Com alerta</span>
          <p className="text-2xl font-extrabold text-zinc-900 mt-1">{kpis.flagged}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Críticos (≥2 flags)</span>
          <p className="text-2xl font-extrabold text-rose-700 mt-1">{kpis.critical}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Hub ≠ ERP (página)</span>
          <p className="text-2xl font-extrabold text-amber-700 mt-1">{kpis.hubErp}</p>
        </div>
      </div>

      <div className="px-1 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-white border border-zinc-300 rounded-md px-3 py-1.5">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar código ou descrição..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-sm bg-transparent border-none focus:outline-none w-48"
            />
          </div>
          {!lockedScope && (
            <select
              value={scope}
              onChange={e => setScope(e.target.value as Scope)}
              className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="all">MP + Embalagens</option>
              <option value="mp">Só Matéria-Prima</option>
              <option value="emb">Só Embalagens</option>
            </select>
          )}
          <select
            value={errorType}
            onChange={e => setErrorType(e.target.value)}
            className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(FLAG_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 font-medium">
            <input type="checkbox" checked={hideResolved} onChange={e => setHideResolved(e.target.checked)} />
            Ocultar resolvidos
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 font-medium" title="Mais lento — compara com ERP ao vivo">
            <input type="checkbox" checked={checkErp} onChange={e => setCheckErp(e.target.checked)} />
            Checar ERP live
          </label>
        </div>
        <button
          onClick={loadList}
          className="text-sm bg-zinc-900 text-white px-3 py-1.5 rounded-md font-medium hover:bg-zinc-800 flex items-center gap-2"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="flex-1 bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col relative">
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="p-12 text-center text-sm text-zinc-500">Carregando divergências...</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500 flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              Nenhum alerta encontrado com os filtros atuais.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 sticky top-0">
                <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Estoque Hub</th>
                  <th className="px-4 py-3 text-right">Δ / ERP</th>
                  <th className="px-4 py-3">Alertas</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <tr
                    key={row.code}
                    onClick={() => setSelectedCode(row.code)}
                    className={cn(
                      'border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer',
                      selectedCode === row.code && 'bg-zinc-100'
                    )}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-zinc-800">{row.code}</td>
                    <td className="px-4 py-2.5 text-zinc-700 max-w-xs truncate">{row.description}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{row.categoryName}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                      {row.hubStock.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                      {row.deltaHubErp != null ? (
                        <span className={row.deltaHubErp === 0 ? 'text-emerald-600' : 'text-rose-600 font-bold'}>
                          {row.deltaHubErp > 0 ? '+' : ''}
                          {row.deltaHubErp.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {row.flags.map(f => (
                          <span key={f} className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border', flagBadgeClass(f))}>
                            {FLAG_LABELS[f] || f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedCode(row.code); }}
                        className="text-xs font-bold text-zinc-900 underline underline-offset-2"
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2 border-t border-zinc-100 text-[10px] text-zinc-400 font-medium">
          {total} itens · Extrato inclui NFs, saídas de OP e movimentos classificados como acerto/ajuste
        </div>

        {selectedCode && (
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-white border-l border-zinc-200 shadow-2xl flex flex-col z-20 animate-in slide-in-from-right duration-200">
            <div className="px-5 py-4 border-b border-zinc-200 flex items-start justify-between gap-3 shrink-0">
              <div>
                <h3 className="text-sm font-extrabold text-zinc-900">{detail?.description || selectedCode}</h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">Código: {selectedCode}</p>
              </div>
              <button onClick={() => setSelectedCode(null)} className="p-1.5 rounded-lg hover:bg-zinc-100">
                <X className="h-4 w-4 text-zinc-500" />
              </button>
            </div>

            <div className="px-4 border-b border-zinc-200 flex gap-1 overflow-x-auto shrink-0">
              {([
                { id: 'visao_geral', label: 'Visão geral', icon: Info },
                { id: 'movimentacoes', label: 'Movimentações', icon: Layers },
                { id: 'lotes', label: 'Lotes / pesagem', icon: ClipboardList },
                { id: 'notas', label: 'Notas fiscais', icon: Receipt },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDrawerTab(tab.id)}
                  className={cn(
                    'px-3 py-2.5 text-xs font-bold border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap',
                    drawerTab === tab.id
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {detailLoading || !detail ? (
                <div className="text-sm text-zinc-500">Carregando detalhes...</div>
              ) : (
                <>
                  {drawerTab === 'visao_geral' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase">Estoque Hub</div>
                          <div className="text-lg font-extrabold tabular-nums">{detail.hub.stockQty.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</div>
                        </div>
                        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase">Estoque ERP</div>
                          <div className="text-lg font-extrabold tabular-nums">
                            {detail.erp.stockQty != null
                              ? detail.erp.stockQty.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                              : (detail.erp.error || '—')}
                          </div>
                        </div>
                        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase">Δ (ERP − Hub)</div>
                          <div className={cn('text-lg font-extrabold tabular-nums', (detail.deltaHubErp || 0) !== 0 && 'text-rose-700')}>
                            {detail.deltaHubErp != null
                              ? detail.deltaHubErp.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                              : '—'}
                          </div>
                        </div>
                        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase">Σ Entradas / Saídas</div>
                          <div className="text-sm font-bold tabular-nums">
                            {detail.sums.entradas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                            {' / '}
                            {detail.sums.saidas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {detail.flags.map(f => (
                          <span key={f} className={cn('text-[10px] font-bold uppercase px-2 py-1 rounded border', flagBadgeClass(f))}>
                            {FLAG_LABELS[f] || f}
                          </span>
                        ))}
                      </div>

                      <button
                        onClick={handleRefreshErp}
                        disabled={saving}
                        className="w-full text-xs font-bold border border-zinc-300 rounded-lg py-2 hover:bg-zinc-50 flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Atualizar saldo do ERP para este código
                      </button>

                      <div className="border border-zinc-200 rounded-xl p-3 space-y-2">
                        <div className="text-xs font-extrabold text-zinc-800 flex items-center gap-1.5">
                          <ShieldAlert className="h-3.5 w-3.5" /> Justificar / resolver
                        </div>
                        <select
                          value={resolveType}
                          onChange={e => setResolveType(e.target.value)}
                          className="w-full text-sm border border-zinc-300 rounded-md px-2 py-1.5"
                        >
                          {(openFlags.length ? openFlags : detail.flags).map(f => (
                            <option key={f} value={f}>{FLAG_LABELS[f] || f}</option>
                          ))}
                        </select>
                        <textarea
                          value={resolveObs}
                          onChange={e => setResolveObs(e.target.value)}
                          placeholder="Observação da justificação..."
                          className="w-full text-sm border border-zinc-300 rounded-md px-2 py-1.5 min-h-[72px]"
                        />
                        <button
                          onClick={handleResolve}
                          disabled={saving || !(openFlags.length || detail.flags.length)}
                          className="w-full text-sm bg-zinc-900 text-white rounded-md py-2 font-bold hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Salvar justificação
                        </button>
                        {(detail.resolutions || []).length > 0 && (
                          <div className="pt-2 space-y-1.5">
                            <div className="text-[10px] font-bold text-zinc-400 uppercase">Já resolvidos</div>
                            {detail.resolutions.map(r => (
                              <div key={r.errorType} className="text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 flex justify-between gap-2">
                                <div>
                                  <span className="font-bold">{FLAG_LABELS[r.errorType] || r.errorType}</span>
                                  <div className="text-zinc-500">{r.observations}</div>
                                </div>
                                <button onClick={() => handleUnresolve(r.errorType)} className="text-[10px] font-bold text-zinc-600 underline shrink-0">
                                  Desfazer
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {drawerTab === 'movimentacoes' && (
                    <div className="space-y-4">
                      {/* Local Search Input inside the Drawer */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                        <input
                          value={drawerSearch}
                          onChange={e => setDrawerSearch(e.target.value)}
                          placeholder="Filtrar movimentos (acerto, manual, doc, OP, etc)..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none transition-all"
                        />
                      </div>

                      {(detail.movements || []).length === 0 ? (
                        <p className="text-xs text-zinc-400 italic">Sem movimentações importadas para este código.</p>
                      ) : (
                        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                          {detail.movements
                            .filter(m => {
                              const term = drawerSearch.trim().toLowerCase();
                              if (!term) return true;
                              return (
                                m.label.toLowerCase().includes(term) ||
                                (m.documentNumber || '').toLowerCase().includes(term) ||
                                (m.details || '').toLowerCase().includes(term) ||
                                m.movementType.toLowerCase().includes(term)
                              );
                            })
                            .map(m => {
                              // Define badge style
                              let badgeColor = 'bg-zinc-50 text-zinc-650 border-zinc-150';
                              const kind = m.sourceKind || '';
                              if (kind === 'acerto_entrada' || kind === 'acerto_saida') {
                                badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
                              } else if (kind.startsWith('inventario')) {
                                badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                              } else if (kind === 'entrada') {
                                badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                              } else if (kind === 'saida') {
                                if (m.label.toLowerCase().includes('op')) {
                                  badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
                                } else {
                                  badgeColor = 'bg-zinc-100 text-zinc-700 border-zinc-250';
                                }
                              }

                              return (
                                <div key={m.id} className="border border-zinc-200 rounded-xl px-3 py-2.5 bg-white hover:bg-zinc-50/50 transition-colors">
                                  <div className="flex justify-between items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase border ${badgeColor}`}>
                                      {m.label}
                                    </span>
                                    <span className="text-[10px] text-zinc-450 font-medium">{new Date(m.date).toLocaleString('pt-BR')}</span>
                                  </div>
                                  <div className="flex justify-between items-baseline mt-2">
                                    <span className="text-xs font-mono text-zinc-400">Doc: {m.documentNumber || '—'}</span>
                                    <span className="text-sm font-extrabold text-zinc-900 tabular-nums">
                                      {m.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                    </span>
                                  </div>
                                  {m.details && (
                                    <p className="text-[10px] text-zinc-500 mt-1.5 bg-zinc-50 p-1.5 rounded-lg border border-zinc-100 italic">
                                      {m.details}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}

                  {drawerTab === 'lotes' && (
                    <div className="space-y-2">
                      {(detail.baixas || []).length === 0 ? (
                        <p className="text-sm text-zinc-500">Sem baixas de OP (Lotes_Baixas) para este código.</p>
                      ) : (
                        detail.baixas.map(b => (
                          <div
                            key={b.registro}
                            className={cn(
                              'border rounded-xl px-3 py-2.5',
                              b.anomalous ? 'border-amber-300 bg-amber-50/50' : 'border-zinc-200'
                            )}
                          >
                            <div className="flex justify-between">
                              <span className="text-xs font-extrabold">OP {b.lote ?? '—'}</span>
                              <span className="text-[10px] text-zinc-400">{b.date}</span>
                            </div>
                            <div className="text-xs mt-1 tabular-nums">
                              Qtde {b.qty.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                              {' · Ref '}
                              {b.qtyRef.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                              {b.diffPct > 0 && (
                                <span className="text-amber-700 font-bold"> · Δ {b.diffPct.toFixed(1)}%</span>
                              )}
                            </div>
                            {b.justificativa && (
                              <p className="text-[10px] text-zinc-600 mt-1">Justificativa: {b.justificativa}</p>
                            )}
                            {b.productCode && (
                              <p className="text-[10px] text-zinc-400 font-mono">Produto: {b.productCode}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {drawerTab === 'notas' && (
                    <div className="space-y-2">
                      {(detail.invoices || []).length === 0 ? (
                        <p className="text-sm text-zinc-500">Sem notas fiscais de compra importadas.</p>
                      ) : (
                        detail.invoices.map(inv => (
                          <div key={inv.id} className="border border-zinc-200 rounded-xl px-3 py-2.5">
                            <div className="flex justify-between">
                              <span className="text-xs font-extrabold">NF {inv.invoiceNumber || inv.id}</span>
                              <span className="text-[10px] text-zinc-400">{inv.invoiceDate}</span>
                            </div>
                            <div className="text-xs text-zinc-600 mt-1">{inv.supplierName || 'Fornecedor —'}</div>
                            <div className="text-sm font-bold tabular-nums mt-1">
                              {inv.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                              {' · '}
                              {inv.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
