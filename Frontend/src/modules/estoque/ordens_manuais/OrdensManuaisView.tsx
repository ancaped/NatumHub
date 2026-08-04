import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ClipboardList, Layers, Pencil, Plus, Printer, RefreshCw,
  RotateCcw, Search, Trash2, X,
} from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import { apiJson } from '../../geral/lib/http';

type Kind = 'entrada' | 'saida';
type TabId = 'abertas' | 'lancadas' | 'tipos';
type PrintMode = 'ordem' | 'folha_saida' | 'folha_entrada';

type OrderItem = {
  id?: number;
  itemCode: string;
  description: string;
  unit: string;
  qty: number;
  notes?: string | null;
};

type ManualOrder = {
  id: number;
  orderNumber: string;
  kind: Kind;
  recordType: string;
  partnerName: string;
  orderDate: string;
  status: 'OPEN' | 'POSTED';
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  postedBy?: string | null;
  postedAt?: string | null;
  items: OrderItem[];
};

type RecordType = { id: number; name: string; createdAt: string };

type ItemHit = { code: string; description: string; unit: string };

type DraftLine = { itemCode: string; description: string; unit: string; qty: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): DraftLine {
  return { itemCode: '', description: '', unit: 'UN', qty: '' };
}

function partnerLabel(o: Pick<ManualOrder, 'recordType' | 'partnerName'>) {
  const t = (o.recordType || '').trim();
  const p = (o.partnerName || '').trim();
  if (t && p) return `${t.toUpperCase()} — ${p}`;
  return t || p || '—';
}

export default function OrdensManuaisView({ onBackToHub }: { onBackToHub: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('abertas');
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [types, setTypes] = useState<RecordType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kindFilter, setKindFilter] = useState<'ALL' | Kind>('ALL');
  const [search, setSearch] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>('saida');
  const [recordType, setRecordType] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [orderDate, setOrderDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyDraft()]);
  const [saving, setSaving] = useState(false);

  const [itemQuery, setItemQuery] = useState('');
  const [itemHits, setItemHits] = useState<ItemHit[]>([]);
  const [activeLineIdx, setActiveLineIdx] = useState<number | null>(null);

  const [newTypeName, setNewTypeName] = useState('');
  const [typeBusy, setTypeBusy] = useState(false);

  const [printing, setPrinting] = useState<ManualOrder | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>('ordem');

  const statusForTab = activeTab === 'abertas' ? 'OPEN' : activeTab === 'lancadas' ? 'POSTED' : null;

  const loadOrders = useCallback(async () => {
    if (!statusForTab) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status: statusForTab });
      if (kindFilter !== 'ALL') params.set('kind', kindFilter);
      if (search.trim()) params.set('q', search.trim());
      const data = await apiJson<ManualOrder[]>(`/estoque/ordens-manuais?${params}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar ordens');
    } finally {
      setLoading(false);
    }
  }, [statusForTab, kindFilter, search]);

  const loadTypes = useCallback(async () => {
    try {
      const data = await apiJson<RecordType[]>('/estoque/ordens-manuais/tipos');
      setTypes(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'tipos') {
      setLoading(false);
      void loadTypes();
    } else {
      void loadOrders();
    }
  }, [activeTab, loadOrders, loadTypes]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    (window as unknown as { __current_page__?: string }).__current_page__ =
      activeTab === 'abertas' ? 'Abertas' : activeTab === 'lancadas' ? 'Lançadas' : 'Tipos';
  }, [activeTab]);

  useEffect(() => {
    if (!itemQuery.trim() || activeLineIdx == null) {
      setItemHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const hits = await apiJson<ItemHit[]>(
          `/estoque/ordens-manuais/itens/busca?q=${encodeURIComponent(itemQuery.trim())}`,
        );
        setItemHits(Array.isArray(hits) ? hits : []);
      } catch {
        setItemHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [itemQuery, activeLineIdx]);

  const openCount = useMemo(
    () => (activeTab === 'abertas' ? orders.length : undefined),
    [activeTab, orders.length],
  );

  const sidebarItems = [
    { id: 'abertas', label: 'Abertas', icon: ClipboardList, badge: openCount },
    { id: 'lancadas', label: 'Lançadas no ERP', icon: CheckCircle2 },
    { id: 'tipos', label: 'Tipos de registro', icon: Layers },
  ];

  const openCreate = (k: Kind = 'saida') => {
    setEditingId(null);
    setKind(k);
    setRecordType(types[0]?.name || '');
    setPartnerName('');
    setOrderDate(todayIso());
    setNotes('');
    setLines([emptyDraft()]);
    setEditorOpen(true);
  };

  const openEdit = (o: ManualOrder) => {
    if (o.status !== 'OPEN') return;
    setEditingId(o.id);
    setKind(o.kind);
    setRecordType(o.recordType || '');
    setPartnerName(o.partnerName || '');
    setOrderDate(o.orderDate);
    setNotes(o.notes || '');
    setLines(
      o.items.map((it) => ({
        itemCode: it.itemCode,
        description: it.description,
        unit: it.unit || 'UN',
        qty: String(it.qty),
      })),
    );
    setEditorOpen(true);
  };

  const pickItem = (idx: number, hit: ItemHit) => {
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? { ...l, itemCode: hit.code, description: hit.description, unit: hit.unit || 'UN' }
          : l,
      ),
    );
    setItemHits([]);
    setItemQuery('');
    setActiveLineIdx(null);
  };

  const saveOrder = async () => {
    const items = lines
      .filter((l) => l.itemCode.trim() && Number(l.qty) > 0)
      .map((l) => ({
        itemCode: l.itemCode.trim(),
        description: l.description.trim(),
        unit: l.unit || 'UN',
        qty: Number(l.qty),
      }));
    if (!recordType.trim()) {
      setError('Informe o tipo de registro (ex.: Venda, Uso/Interno).');
      return;
    }
    if (!partnerName.trim()) {
      setError('Informe a pessoa/empresa.');
      return;
    }
    if (items.length === 0) {
      setError('Adicione ao menos um item com quantidade.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        kind,
        recordType: recordType.trim(),
        partnerName: partnerName.trim(),
        orderDate,
        notes: notes.trim() || null,
        items,
      };
      if (editingId) {
        await apiJson(`/estoque/ordens-manuais/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        await apiJson('/estoque/ordens-manuais', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      setEditorOpen(false);
      await Promise.all([loadOrders(), loadTypes()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const markPosted = async (o: ManualOrder) => {
    if (!window.confirm(`Marcar ${o.orderNumber} como lançada no ERP?`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}/postar`, { method: 'POST' });
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao postar');
    }
  };

  const reopen = async (o: ManualOrder) => {
    if (!window.confirm(`Reabrir ${o.orderNumber}?`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}/reabrir`, { method: 'POST' });
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao reabrir');
    }
  };

  const remove = async (o: ManualOrder) => {
    if (!window.confirm(`Excluir ${o.orderNumber}?`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}`, { method: 'DELETE' });
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir');
    }
  };

  const saveType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    setTypeBusy(true);
    setError('');
    try {
      await apiJson('/estoque/ordens-manuais/tipos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setNewTypeName('');
      await loadTypes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar tipo');
    } finally {
      setTypeBusy(false);
    }
  };

  const deleteType = async (t: RecordType) => {
    if (!window.confirm(`Remover o tipo "${t.name}" do cadastro? Ordens existentes mantêm o texto.`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/tipos/${t.id}`, { method: 'DELETE' });
      await loadTypes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao remover tipo');
    }
  };

  const startPrint = (o: ManualOrder, mode: PrintMode) => {
    setPrinting(o);
    setPrintMode(mode);
    setTimeout(() => window.print(), 80);
  };

  const printTitle = useMemo(() => {
    if (!printing) return '';
    if (printMode === 'ordem') {
      return printing.kind === 'saida' ? 'Ordem de Saída Manual' : 'Ordem de Entrada Manual';
    }
    if (printMode === 'folha_saida') return 'Folha de Conferência — Saída';
    return 'Folha de Conferência — Entrada';
  }, [printing, printMode]);

  const headerActions =
    activeTab !== 'tipos' ? (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void loadOrders()}
          className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer"
          title="Atualizar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={() => openCreate('saida')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 cursor-pointer"
        >
          <Plus size={14} /> Nova saída
        </button>
        <button
          type="button"
          onClick={() => openCreate('entrada')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold hover:bg-zinc-50 cursor-pointer"
        >
          <Plus size={14} /> Nova entrada
        </button>
      </div>
    ) : null;

  return (
    <>
      {printing && (
        <div className="print-only p-6 text-black bg-white">
          <h1 className="text-xl font-bold mb-1">{printTitle}</h1>
          <p className="text-sm mb-1 font-semibold">{partnerLabel(printing)}</p>
          <p className="text-sm mb-4">
            {printing.orderNumber} · {printing.orderDate}
            {printing.notes ? ` · ${printing.notes}` : ''}
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="border border-zinc-400 p-1.5 text-left">Código</th>
                <th className="border border-zinc-400 p-1.5 text-left">Descrição</th>
                <th className="border border-zinc-400 p-1.5 text-right">Qtde ordem</th>
                <th className="border border-zinc-400 p-1.5 text-left">Un</th>
                {printMode !== 'ordem' && (
                  <>
                    <th className="border border-zinc-400 p-1.5 text-left">Qtde conferida</th>
                    <th className="border border-zinc-400 p-1.5 text-left">Lote</th>
                    <th className="border border-zinc-400 p-1.5 text-left">Ass.</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {printing.items.map((it) => (
                <tr key={`${it.itemCode}-${it.qty}`}>
                  <td className="border border-zinc-400 p-1.5 font-mono">{it.itemCode}</td>
                  <td className="border border-zinc-400 p-1.5">{it.description}</td>
                  <td className="border border-zinc-400 p-1.5 text-right">{it.qty}</td>
                  <td className="border border-zinc-400 p-1.5">{it.unit}</td>
                  {printMode !== 'ordem' && (
                    <>
                      <td className="border border-zinc-400 p-1.5 h-8" />
                      <td className="border border-zinc-400 p-1.5" />
                      <td className="border border-zinc-400 p-1.5" />
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AppLayout
        moduleTitle="Ordens Manuais"
        onBackToHub={onBackToHub}
        sidebarItems={sidebarItems}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        headerActions={headerActions}
      >
        <div className="no-print flex flex-col gap-3 h-full min-h-0">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {activeTab !== 'tipos' && (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  className="text-sm border border-zinc-200 rounded-xl px-2.5 py-2 bg-white"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as 'ALL' | Kind)}
                >
                  <option value="ALL">Entrada e saída</option>
                  <option value="saida">Só saída</option>
                  <option value="entrada">Só entrada</option>
                </select>
                <div className="relative flex-1 min-w-[180px] max-w-md">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    className="w-full pl-8 pr-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white"
                    placeholder="Buscar nº, tipo, pessoa…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto">
                  {loading ? (
                    <div className="text-center text-zinc-400 py-16 text-sm">Carregando…</div>
                  ) : orders.length === 0 ? (
                    <div className="text-center text-zinc-400 py-16 text-sm">Nenhuma ordem neste filtro.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-bold">Registro</th>
                          <th className="text-left px-3 py-2.5 font-bold">Nº</th>
                          <th className="text-left px-3 py-2.5 font-bold">Mov.</th>
                          <th className="text-left px-3 py-2.5 font-bold">Data</th>
                          <th className="text-left px-3 py-2.5 font-bold">Itens</th>
                          <th className="text-right px-3 py-2.5 font-bold">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                            <td className="px-3 py-2.5">
                              <span className="inline-flex max-w-[280px] items-center px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 text-[11px] font-bold text-zinc-800 truncate">
                                {partnerLabel(o)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono font-semibold text-zinc-700">{o.orderNumber}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                                  o.kind === 'saida'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {o.kind === 'saida' ? 'Saída' : 'Entrada'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-zinc-600">{o.orderDate}</td>
                            <td className="px-3 py-2.5 text-zinc-500">{o.items.length}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex justify-end gap-1 flex-wrap">
                                <button type="button" title="Imprimir ordem" className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer" onClick={() => startPrint(o, 'ordem')}>
                                  <Printer size={14} />
                                </button>
                                <button type="button" className="px-1.5 py-1 rounded-lg hover:bg-zinc-100 cursor-pointer text-[10px] font-bold text-amber-700" onClick={() => startPrint(o, 'folha_saida')}>
                                  F.Saída
                                </button>
                                <button type="button" className="px-1.5 py-1 rounded-lg hover:bg-zinc-100 cursor-pointer text-[10px] font-bold text-emerald-700" onClick={() => startPrint(o, 'folha_entrada')}>
                                  F.Entrada
                                </button>
                                {o.status === 'OPEN' && (
                                  <>
                                    <button type="button" className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer" onClick={() => openEdit(o)}>
                                      <Pencil size={14} />
                                    </button>
                                    <button type="button" className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 cursor-pointer" onClick={() => markPosted(o)}>
                                      <CheckCircle2 size={14} />
                                    </button>
                                    <button type="button" className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer" onClick={() => remove(o)}>
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}
                                {o.status === 'POSTED' && (
                                  <button type="button" className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer" onClick={() => reopen(o)}>
                                    <RotateCcw size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'tipos' && (
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4 space-y-4 max-w-xl">
              <p className="text-sm text-zinc-500">
                Cadastre tipos sob demanda (Venda, Uso/Interno, Doação…). Ao criar uma ordem, o tipo aparece junto ao nome da pessoa.
              </p>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-zinc-200 rounded-xl px-3 py-2 text-sm"
                  placeholder="Novo tipo (ex.: Uso/Interno)"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveType();
                  }}
                />
                <button
                  type="button"
                  disabled={typeBusy || !newTypeName.trim()}
                  onClick={() => void saveType()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  <Plus size={14} /> Adicionar
                </button>
              </div>
              <ul className="divide-y divide-zinc-100 border border-zinc-100 rounded-xl overflow-hidden">
                {types.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-zinc-400">Nenhum tipo ainda.</li>
                ) : (
                  types.map((t) => (
                    <li key={t.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                      <span className="font-semibold text-zinc-800">{t.name}</span>
                      <button
                        type="button"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        onClick={() => void deleteType(t)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      </AppLayout>

      {editorOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-zinc-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
              <div>
                <p className="font-bold text-sm text-zinc-900">
                  {editingId ? 'Editar ordem' : 'Nova ordem'} · {kind === 'saida' ? 'Saída' : 'Entrada'}
                </p>
                {(recordType.trim() || partnerName.trim()) && (
                  <span className="inline-flex mt-1 px-2 py-0.5 rounded-lg border border-zinc-200 bg-zinc-50 text-[11px] font-bold text-zinc-700">
                    {partnerLabel({ recordType, partnerName })}
                  </span>
                )}
              </div>
              <button type="button" className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer" onClick={() => setEditorOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Tipo de registro</span>
                  <input
                    list="om-record-types"
                    className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                    value={recordType}
                    onChange={(e) => setRecordType(e.target.value)}
                    placeholder="Venda, Uso/Interno…"
                  />
                  <datalist id="om-record-types">
                    {types.map((t) => (
                      <option key={t.id} value={t.name} />
                    ))}
                  </datalist>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Pessoa / empresa</span>
                  <input
                    className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    placeholder="Ex.: Edson Ferrari"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Movimento</span>
                  <select
                    className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as Kind)}
                    disabled={!!editingId}
                  >
                    <option value="saida">Saída</option>
                    <option value="entrada">Entrada</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Data</span>
                  <input
                    type="date"
                    className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-500">Observações</span>
                <input
                  className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Itens</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-zinc-700 hover:underline cursor-pointer"
                    onClick={() => setLines((p) => [...p, emptyDraft()])}
                  >
                    + linha
                  </button>
                </div>
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start relative">
                    <div className="col-span-3 relative">
                      <input
                        className="w-full border border-zinc-200 rounded-xl px-2 py-1.5 font-mono text-xs"
                        placeholder="Código"
                        value={line.itemCode}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLines((p) => p.map((l, i) => (i === idx ? { ...l, itemCode: v } : l)));
                          setActiveLineIdx(idx);
                          setItemQuery(v);
                        }}
                        onFocus={() => {
                          setActiveLineIdx(idx);
                          setItemQuery(line.itemCode);
                        }}
                      />
                      {activeLineIdx === idx && itemHits.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-40 overflow-auto">
                          {itemHits.map((h) => (
                            <button
                              key={h.code}
                              type="button"
                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-zinc-50 cursor-pointer"
                              onClick={() => pickItem(idx, h)}
                            >
                              <span className="font-mono font-semibold">{h.code}</span>
                              <span className="text-zinc-500 ml-2">{h.description}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      className="col-span-5 border border-zinc-200 rounded-xl px-2 py-1.5 text-xs"
                      placeholder="Descrição"
                      value={line.description}
                      onChange={(e) =>
                        setLines((p) => p.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l)))
                      }
                    />
                    <input
                      className="col-span-2 border border-zinc-200 rounded-xl px-2 py-1.5 text-xs text-right"
                      placeholder="Qty"
                      value={line.qty}
                      onChange={(e) =>
                        setLines((p) => p.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)))
                      }
                    />
                    <input
                      className="col-span-1 border border-zinc-200 rounded-xl px-2 py-1.5 text-xs"
                      value={line.unit}
                      onChange={(e) =>
                        setLines((p) => p.map((l, i) => (i === idx ? { ...l, unit: e.target.value } : l)))
                      }
                    />
                    <button
                      type="button"
                      className="col-span-1 p-1.5 text-zinc-400 hover:text-red-600 cursor-pointer"
                      onClick={() => setLines((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== idx)))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-zinc-200 flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-xl border border-zinc-200 text-sm font-semibold cursor-pointer"
                onClick={() => setEditorOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
                onClick={() => void saveOrder()}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
