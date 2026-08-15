import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ClipboardList, Layers,
  Pencil, Plus, Printer, RefreshCw, RotateCcw, Search, Trash2, X,
} from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import { apiJson } from '../../geral/lib/http';
import { printBlankSheets, printErpLaunchList, printSingleOrder } from './printHelpers';

type Kind = 'entrada' | 'saida';
type TabId = 'entradas' | 'saidas' | 'registro' | 'tipos';
type StatusFilter = 'OPEN' | 'POSTED';
type SheetStatusFilter = 'ALL' | 'retirada' | 'conferida';

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

type SheetRegister = {
  id: number;
  registerNumber: string;
  kind: Kind;
  status: 'retirada' | 'conferida';
  createdBy?: string | null;
  createdAt: string;
  conferredBy?: string | null;
  conferredAt?: string | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): DraftLine {
  return { itemCode: '', description: '', unit: 'UN', qty: '' };
}

function partnerLabel(o: { recordType?: string; partnerName?: string }) {
  const t = (o.recordType || '').trim();
  const p = (o.partnerName || '').trim();
  if (t && p) return `${t.toUpperCase()} — ${p}`;
  return t || p || '—';
}

export default function OrdensManuaisView({ onBackToHub }: { onBackToHub: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('saidas');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [sheets, setSheets] = useState<SheetRegister[]>([]);
  const [types, setTypes] = useState<RecordType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sheetStatusFilter, setSheetStatusFilter] = useState<SheetStatusFilter>('retirada');
  const [sheetKindFilter, setSheetKindFilter] = useState<'ALL' | Kind>('ALL');

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

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockKind, setBlockKind] = useState<Kind>('saida');
  const [blockQty, setBlockQty] = useState('10');
  const [blockBusy, setBlockBusy] = useState(false);

  const [erpPrintBusy, setErpPrintBusy] = useState(false);

  const tabKind: Kind | null =
    activeTab === 'entradas' ? 'entrada' : activeTab === 'saidas' ? 'saida' : null;

  const loadOrders = useCallback(async () => {
    if (!tabKind) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        kind: tabKind,
      });
      if (search.trim()) params.set('q', search.trim());
      const data = await apiJson<ManualOrder[]>(`/estoque/ordens-manuais?${params}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar ordens');
    } finally {
      setLoading(false);
    }
  }, [tabKind, statusFilter, search]);

  const loadSheets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (sheetStatusFilter !== 'ALL') params.set('status', sheetStatusFilter);
      if (sheetKindFilter !== 'ALL') params.set('kind', sheetKindFilter);
      if (search.trim()) params.set('q', search.trim());
      const qs = params.toString();
      const data = await apiJson<SheetRegister[]>(
        `/estoque/ordens-manuais/registros${qs ? `?${qs}` : ''}`,
      );
      setSheets(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar registros');
    } finally {
      setLoading(false);
    }
  }, [sheetStatusFilter, sheetKindFilter, search]);

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
    } else if (activeTab === 'registro') {
      void loadSheets();
    } else {
      void loadOrders();
    }
  }, [activeTab, loadOrders, loadSheets, loadTypes]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    const labels: Record<TabId, string> = {
      entradas: 'Entradas',
      saidas: 'Saídas',
      registro: 'Registro',
      tipos: 'Tipos',
    };
    (window as unknown as { __current_page__?: string }).__current_page__ = labels[activeTab];
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

  const retiradaCount = useMemo(
    () => (activeTab === 'registro' ? sheets.filter((s) => s.status === 'retirada').length : undefined),
    [activeTab, sheets],
  );

  const sidebarItems = [
    { id: 'saidas', label: 'Saídas', icon: ArrowUpFromLine },
    { id: 'entradas', label: 'Entradas', icon: ArrowDownToLine },
    { id: 'registro', label: 'Registro', icon: ClipboardList, badge: retiradaCount },
    { id: 'tipos', label: 'Tipos de registro', icon: Layers },
  ];

  const openCreate = (k: Kind) => {
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
      setError('Informe ao menos um item com código e quantidade.');
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
      await loadOrders();
      void loadTypes();
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
      setError(e instanceof Error ? e.message : 'Falha ao lançar');
    }
  };

  const reopen = async (o: ManualOrder) => {
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}/reabrir`, { method: 'POST' });
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao reabrir');
    }
  };

  const remove = async (o: ManualOrder) => {
    if (!window.confirm(`Excluir ordem ${o.orderNumber}?`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}`, { method: 'DELETE' });
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir');
    }
  };

  const saveType = async () => {
    if (!newTypeName.trim()) return;
    setTypeBusy(true);
    try {
      await apiJson('/estoque/ordens-manuais/tipos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTypeName.trim() }),
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

  const printSheets = (list: SheetRegister[]) => {
    printBlankSheets(list.map((s) => ({ registerNumber: s.registerNumber, kind: s.kind })));
  };

  const printOrder = (o: ManualOrder) => {
    printSingleOrder(o);
  };

  const printErpQueue = async () => {
    if (!tabKind) return;
    setErpPrintBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ status: 'OPEN', kind: tabKind });
      const data = await apiJson<ManualOrder[]>(`/estoque/ordens-manuais?${params}`);
      const list = Array.isArray(data) ? data : [];
      if (list.length === 0) {
        setError('Nenhuma ordem aberta para lançar no ERP neste movimento.');
        return;
      }
      printErpLaunchList(list, tabKind);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao preparar impressão ERP');
    } finally {
      setErpPrintBusy(false);
    }
  };

  const generateBlock = async () => {
    const quantity = Math.floor(Number(blockQty));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100) {
      setError('Quantidade deve ser entre 1 e 100.');
      return;
    }
    setBlockBusy(true);
    setError('');
    try {
      const created = await apiJson<SheetRegister[]>('/estoque/ordens-manuais/registros/bloco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: blockKind, quantity }),
      });
      setBlockOpen(false);
      await loadSheets();
      if (Array.isArray(created) && created.length > 0) {
        if (window.confirm(`${created.length} folha(s) gerada(s). Imprimir agora?`)) {
          printSheets(created);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar bloco');
    } finally {
      setBlockBusy(false);
    }
  };

  const conferirSheet = async (s: SheetRegister) => {
    try {
      await apiJson(`/estoque/ordens-manuais/registros/${s.id}/conferir`, { method: 'POST' });
      await loadSheets();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao conferir');
    }
  };

  const reabrirSheet = async (s: SheetRegister) => {
    try {
      await apiJson(`/estoque/ordens-manuais/registros/${s.id}/reabrir`, { method: 'POST' });
      await loadSheets();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao reabrir');
    }
  };

  const headerActions =
    activeTab === 'entradas' || activeTab === 'saidas' ? (
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
          disabled={erpPrintBusy}
          onClick={() => void printErpQueue()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
          title="Imprimir ordens abertas para lançar no ERP"
        >
          <Printer size={14} />
          {erpPrintBusy ? 'Preparando…' : 'A lançar no ERP'}
        </button>
        <button
          type="button"
          onClick={() => openCreate(activeTab === 'entradas' ? 'entrada' : 'saida')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 cursor-pointer"
        >
          <Plus size={14} />
          {activeTab === 'entradas' ? 'Nova entrada' : 'Nova saída'}
        </button>
      </div>
    ) : activeTab === 'registro' ? (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void loadSheets()}
          className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer"
          title="Atualizar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={() => {
            setBlockKind('saida');
            setBlockQty('10');
            setBlockOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 cursor-pointer"
        >
          <Plus size={14} /> Gerar bloco
        </button>
      </div>
    ) : null;

  return (
    <>
      <AppLayout
        moduleTitle="Ordens Manuais"
        onBackToHub={onBackToHub}
        sidebarItems={sidebarItems}
        activeTab={activeTab}
        onTabChange={(id) => {
          setActiveTab(id as TabId);
          setSearch('');
          if (id === 'entradas' || id === 'saidas') setStatusFilter('OPEN');
          if (id === 'registro') setSheetStatusFilter('retirada');
        }}
        headerActions={headerActions}
      >
        <div className="no-print flex flex-col gap-3 h-full min-h-0">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {(activeTab === 'entradas' || activeTab === 'saidas') && (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-0.5">
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      statusFilter === 'OPEN' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'
                    }`}
                    onClick={() => setStatusFilter('OPEN')}
                  >
                    Abertas
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      statusFilter === 'POSTED' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'
                    }`}
                    onClick={() => setStatusFilter('POSTED')}
                  >
                    Lançadas no ERP
                  </button>
                </div>
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
                            <td className="px-3 py-2.5 text-zinc-600">{o.orderDate}</td>
                            <td className="px-3 py-2.5 text-zinc-500">{o.items.length}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex justify-end gap-1 flex-wrap">
                                <button
                                  type="button"
                                  title="Imprimir ordem"
                                  className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
                                  onClick={() => printOrder(o)}
                                >
                                  <Printer size={14} />
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

          {activeTab === 'registro' && (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  className="text-sm border border-zinc-200 rounded-xl px-2.5 py-2 bg-white"
                  value={sheetStatusFilter}
                  onChange={(e) => setSheetStatusFilter(e.target.value as SheetStatusFilter)}
                >
                  <option value="retirada">Retiradas</option>
                  <option value="conferida">Conferidas</option>
                  <option value="ALL">Todas</option>
                </select>
                <select
                  className="text-sm border border-zinc-200 rounded-xl px-2.5 py-2 bg-white"
                  value={sheetKindFilter}
                  onChange={(e) => setSheetKindFilter(e.target.value as 'ALL' | Kind)}
                >
                  <option value="ALL">Entrada e saída</option>
                  <option value="saida">Só saída (CSI)</option>
                  <option value="entrada">Só entrada (CEI)</option>
                </select>
                <div className="relative flex-1 min-w-[180px] max-w-md">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    className="w-full pl-8 pr-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white"
                    placeholder="Buscar nº registro…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto">
                  {loading ? (
                    <div className="text-center text-zinc-400 py-16 text-sm">Carregando…</div>
                  ) : sheets.length === 0 ? (
                    <div className="text-center text-zinc-400 py-16 text-sm">
                      Nenhuma folha. Use «Gerar bloco» para criar registros sequenciais.
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-bold">Nº registro</th>
                          <th className="text-left px-3 py-2.5 font-bold">Tipo</th>
                          <th className="text-left px-3 py-2.5 font-bold">Status</th>
                          <th className="text-left px-3 py-2.5 font-bold">Criado</th>
                          <th className="text-right px-3 py-2.5 font-bold">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheets.map((s) => (
                          <tr key={s.id} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                            <td className="px-3 py-2.5 font-mono font-semibold text-zinc-800">
                              {s.registerNumber}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                                  s.kind === 'saida'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {s.kind === 'saida' ? 'Saída' : 'Entrada'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              {s.status === 'conferida' ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  Conferida
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-50 text-amber-800 border border-amber-200">
                                  Retirada
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-zinc-500">{s.createdAt.slice(0, 10)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex justify-end gap-1 flex-wrap">
                                <button
                                  type="button"
                                  title="Imprimir folha em branco"
                                  className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
                                  onClick={() => printSheets([s])}
                                >
                                  <Printer size={14} />
                                </button>
                                {s.status === 'retirada' ? (
                                  <button
                                    type="button"
                                    title="Marcar como conferida"
                                    className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 cursor-pointer"
                                    onClick={() => void conferirSheet(s)}
                                  >
                                    <Archive size={14} />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    title="Reabrir (voltar para retirada)"
                                    className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
                                    onClick={() => void reabrirSheet(s)}
                                  >
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

      {blockOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-zinc-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm text-zinc-900">Gerar bloco de folhas</p>
              <button type="button" className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer" onClick={() => setBlockOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Cria números sequenciais (CEI/CSI) já como Retirada, prontos para imprimir e preencher à mão.
            </p>
            <label className="block space-y-1 text-sm">
              <span className="text-[10px] font-bold uppercase text-zinc-500">Tipo</span>
              <select
                className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                value={blockKind}
                onChange={(e) => setBlockKind(e.target.value as Kind)}
              >
                <option value="saida">Controle de Saída de Insumo (CSI)</option>
                <option value="entrada">Controle de Entrada de Insumo (CEI)</option>
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-[10px] font-bold uppercase text-zinc-500">Quantidade de folhas</span>
              <input
                type="number"
                min={1}
                max={100}
                className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                value={blockQty}
                onChange={(e) => setBlockQty(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-xl border border-zinc-200 text-sm font-semibold cursor-pointer"
                onClick={() => setBlockOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={blockBusy}
                className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
                onClick={() => void generateBlock()}
              >
                {blockBusy ? 'Gerando…' : 'Gerar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
