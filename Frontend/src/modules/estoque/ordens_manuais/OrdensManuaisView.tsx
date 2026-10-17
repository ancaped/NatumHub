import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  Layers,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
  AlertCircle,
} from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import StatCard from '../../geral/components/ui/StatCard';
import Modal from '../../geral/components/ui/Modal';
import { apiJson } from '../../geral/lib/http';
import { printBlankSheets, printErpLaunchList, printSingleOrder } from './printHelpers';

type Kind = 'entrada' | 'saida';
type TabId = 'saidas' | 'entradas' | 'registro' | 'tipos';
type StatusFilter = 'ALL' | 'OPEN' | 'POSTED';
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

const TYPE_SUGGESTIONS = [
  'Uso Interno',
  'Venda',
  'Doação',
  'Descarte',
  'Transferência',
  'Amostra',
  'Manutenção',
  'Devolução',
  'Ajuste de Inventário',
  'Consumo Fábrica',
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): DraftLine {
  return { itemCode: '', description: '', unit: 'UN', qty: '' };
}

function formatDate(isoString?: string | null) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString.includes('T') ? isoString : `${isoString}T12:00:00`);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('pt-BR').format(d);
  } catch {
    return isoString;
  }
}

function partnerLabel(o: { recordType?: string; partnerName?: string }) {
  const t = (o.recordType || '').trim();
  const p = (o.partnerName || '').trim();
  if (t && p) return `${t.toUpperCase()} — ${p}`;
  return t || p || '—';
}

function fmtNum(val: number) {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '0';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export default function OrdensManuaisView({ onBackToHub }: { onBackToHub: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('saidas');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [sheets, setSheets] = useState<SheetRegister[]>([]);
  const [types, setTypes] = useState<RecordType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [sheetStatusFilter, setSheetStatusFilter] = useState<SheetStatusFilter>('ALL');
  const [sheetKindFilter, setSheetKindFilter] = useState<'ALL' | Kind>('ALL');

  // Modal para criar/editar ordem
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>('saida');
  const [recordType, setRecordType] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [orderDate, setOrderDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyDraft()]);
  const [saving, setSaving] = useState(false);

  // Modal de visualização de detalhes
  const [viewingOrder, setViewingOrder] = useState<ManualOrder | null>(null);

  // Autocomplete de itens
  const [itemQuery, setItemQuery] = useState('');
  const [itemHits, setItemHits] = useState<ItemHit[]>([]);
  const [itemHitsLoading, setItemHitsLoading] = useState(false);
  const [activeLineIdx, setActiveLineIdx] = useState<number | null>(null);

  // Gestão de Tipos
  const [newTypeName, setNewTypeName] = useState('');
  const [typeBusy, setTypeBusy] = useState(false);

  // Modal de Geração de Bloco
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockKind, setBlockKind] = useState<Kind>('saida');
  const [blockQty, setBlockQty] = useState('10');
  const [blockBusy, setBlockBusy] = useState(false);

  // Impressão da fila ERP
  const [erpPrintBusy, setErpPrintBusy] = useState(false);

  const tabKind: Kind | null =
    activeTab === 'entradas' ? 'entrada' : activeTab === 'saidas' ? 'saida' : null;

  // Carrega todas as ordens do movimento (Saída ou Entrada) sem restringir status na requisição,
  // garantindo que os contadores de KPI e a lista mostrem 100% dos dados reais
  const loadOrders = useCallback(async () => {
    if (!tabKind) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ kind: tabKind });
      const data = await apiJson<ManualOrder[]>(`/estoque/ordens-manuais?${params}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar ordens');
    } finally {
      setLoading(false);
    }
  }, [tabKind]);

  // Carrega todas as folhas físicas (Registro)
  const loadSheets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiJson<SheetRegister[]>('/estoque/ordens-manuais/registros');
      setSheets(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar registros');
    } finally {
      setLoading(false);
    }
  }, []);

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
      entradas: 'Entradas Manuais (CEI)',
      saidas: 'Saídas Manuais (CSI)',
      registro: 'Registro (Folhas Físicas)',
      tipos: 'Tipos de Registro',
    };
    (window as unknown as { __current_page__?: string }).__current_page__ = labels[activeTab];
  }, [activeTab]);

  useEffect(() => {
    if (!itemQuery.trim() || activeLineIdx == null) {
      setItemHits([]);
      setItemHitsLoading(false);
      return;
    }
    setItemHitsLoading(true);
    const t = setTimeout(async () => {
      try {
        const hits = await apiJson<ItemHit[]>(
          `/estoque/ordens-manuais/itens/busca?q=${encodeURIComponent(itemQuery.trim())}`,
        );
        setItemHits(Array.isArray(hits) ? hits : []);
      } catch {
        setItemHits([]);
      } finally {
        setItemHitsLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [itemQuery, activeLineIdx]);

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const retiradaCount = useMemo(
    () => (activeTab === 'registro' ? sheets.filter((s) => s.status === 'retirada').length : undefined),
    [activeTab, sheets],
  );

  const sidebarItems = [
    { id: 'saidas', label: 'Saídas (CSI)', icon: ArrowUpFromLine },
    { id: 'entradas', label: 'Entradas (CEI)', icon: ArrowDownToLine },
    { id: 'registro', label: 'Registro (Folhas Físicas)', icon: ClipboardList, badge: retiradaCount },
    { id: 'tipos', label: 'Tipos de Registro', icon: Layers },
  ];

  // Métricas calculadas em cima de TODAS as ordens carregadas
  const statsOrders = useMemo(() => {
    const total = orders.length;
    const open = orders.filter((o) => o.status === 'OPEN').length;
    const posted = orders.filter((o) => o.status === 'POSTED').length;
    const totalItems = orders.reduce((sum, o) => sum + (o.items?.length || 0), 0);
    const totalQty = orders.reduce(
      (sum, o) => sum + (o.items?.reduce((s, it) => s + (Number(it.qty) || 0), 0) || 0),
      0,
    );
    return { total, open, posted, totalItems, totalQty };
  }, [orders]);

  // Ordens filtradas por status e busca textual
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Filtro de status
      if (statusFilter === 'OPEN' && o.status !== 'OPEN') return false;
      if (statusFilter === 'POSTED' && o.status !== 'POSTED') return false;

      // Filtro de busca textual
      const q = search.trim().toLowerCase();
      if (!q) return true;

      const num = (o.orderNumber || '').toLowerCase();
      const partner = (o.partnerName || '').toLowerCase();
      const rtype = (o.recordType || '').toLowerCase();
      const nts = (o.notes || '').toLowerCase();
      const hasItem = (o.items || []).some(
        (it) =>
          (it.itemCode || '').toLowerCase().includes(q) ||
          (it.description || '').toLowerCase().includes(q),
      );

      return (
        num.includes(q) ||
        partner.includes(q) ||
        rtype.includes(q) ||
        nts.includes(q) ||
        hasItem
      );
    });
  }, [orders, statusFilter, search]);

  // Métricas de folhas
  const statsSheets = useMemo(() => {
    const total = sheets.length;
    const retiradas = sheets.filter((s) => s.status === 'retirada').length;
    const conferidas = sheets.filter((s) => s.status === 'conferida').length;
    const saidas = sheets.filter((s) => s.kind === 'saida').length;
    const entradas = sheets.filter((s) => s.kind === 'entrada').length;
    return { total, retiradas, conferidas, saidas, entradas };
  }, [sheets]);

  // Folhas filtradas por status, tipo e busca
  const filteredSheets = useMemo(() => {
    return sheets.filter((s) => {
      if (sheetStatusFilter !== 'ALL' && s.status !== sheetStatusFilter) return false;
      if (sheetKindFilter !== 'ALL' && s.kind !== sheetKindFilter) return false;

      const q = search.trim().toLowerCase();
      if (!q) return true;

      const num = (s.registerNumber || '').toLowerCase();
      const createdBy = (s.createdBy || '').toLowerCase();
      return num.includes(q) || createdBy.includes(q);
    });
  }, [sheets, sheetStatusFilter, sheetKindFilter, search]);

  const filteredTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    if (!q) return types;
    return types.filter((t) => (t.name || '').toLowerCase().includes(q));
  }, [types, typeSearch]);

  const openCreate = (k: Kind) => {
    setEditingId(null);
    setKind(k);
    setRecordType(types[0]?.name || 'Uso Interno');
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
      o.items.length > 0
        ? o.items.map((it) => ({
            itemCode: it.itemCode,
            description: it.description,
            unit: it.unit || 'UN',
            qty: String(it.qty),
          }))
        : [emptyDraft()],
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

  const draftTotals = useMemo(() => {
    const validLines = lines.filter((l) => l.itemCode.trim() && Number(l.qty) > 0);
    const sumQty = validLines.reduce((acc, l) => acc + (Number(l.qty) || 0), 0);
    return { count: validLines.length, sumQty };
  }, [lines]);

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
      setError('Informe o tipo de registro (ex.: Venda, Uso Interno).');
      return;
    }
    if (!partnerName.trim()) {
      setError('Informe a pessoa, setor ou empresa parceira.');
      return;
    }
    if (items.length === 0) {
      setError('Informe ao menos um item válido com código e quantidade.');
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
        showToast('Ordem manual atualizada com sucesso!');
      } else {
        await apiJson('/estoque/ordens-manuais', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        showToast('Ordem manual registrada com sucesso!');
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
    if (!window.confirm(`Confirma o lançamento da ordem ${o.orderNumber} no ERP?\n\nIsso marcará o status como concluído.`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}/postar`, { method: 'POST' });
      showToast(`Ordem ${o.orderNumber} marcada como lançada no ERP!`);
      if (viewingOrder?.id === o.id) {
        setViewingOrder((prev) => (prev ? { ...prev, status: 'POSTED' } : null));
      }
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao marcar como lançada');
    }
  };

  const reopen = async (o: ManualOrder) => {
    if (!window.confirm(`Deseja reabrir a ordem ${o.orderNumber}?\n\nEla voltará para a fila de pendências a lançar.`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}/reabrir`, { method: 'POST' });
      showToast(`Ordem ${o.orderNumber} reaberta com sucesso.`);
      if (viewingOrder?.id === o.id) {
        setViewingOrder((prev) => (prev ? { ...prev, status: 'OPEN' } : null));
      }
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao reabrir ordem');
    }
  };

  const remove = async (o: ManualOrder) => {
    if (!window.confirm(`ATENÇÃO: Tem certeza que deseja excluir definitivamente a ordem ${o.orderNumber}?`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}`, { method: 'DELETE' });
      showToast(`Ordem ${o.orderNumber} excluída.`);
      if (viewingOrder?.id === o.id) {
        setViewingOrder(null);
      }
      await loadOrders();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir ordem');
    }
  };

  const saveType = async (typeName?: string) => {
    const val = (typeName || newTypeName).trim();
    if (!val) return;
    setTypeBusy(true);
    setError('');
    try {
      await apiJson('/estoque/ordens-manuais/tipos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: val }),
      });
      setNewTypeName('');
      showToast(`Tipo "${val}" cadastrado com sucesso!`);
      await loadTypes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar tipo');
    } finally {
      setTypeBusy(false);
    }
  };

  const deleteType = async (t: RecordType) => {
    if (!window.confirm(`Remover o tipo de registro "${t.name}"?\n\nAs ordens já existentes continuarão com a descrição preservada.`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/tipos/${t.id}`, { method: 'DELETE' });
      showToast(`Tipo "${t.name}" removido.`);
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
      const openOrders = orders.filter((o) => o.status === 'OPEN');
      if (openOrders.length === 0) {
        setError('Nenhuma ordem aberta pendente de lançamento no ERP neste movimento.');
        return;
      }
      printErpLaunchList(openOrders, tabKind);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao preparar impressão da fila ERP');
    } finally {
      setErpPrintBusy(false);
    }
  };

  const generateBlock = async () => {
    const quantity = Math.floor(Number(blockQty));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100) {
      setError('Quantidade deve ser entre 1 e 100 folhas.');
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
        showToast(`${created.length} folha(s) física(s) gerada(s) com sucesso!`);
        if (window.confirm(`${created.length} folha(s) gerada(s) sequencialmente.\nDeseja imprimir agora em formato A4?`)) {
          printSheets(created);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar bloco de folhas');
    } finally {
      setBlockBusy(false);
    }
  };

  const conferirSheet = async (s: SheetRegister) => {
    try {
      await apiJson(`/estoque/ordens-manuais/registros/${s.id}/conferir`, { method: 'POST' });
      showToast(`Folha ${s.registerNumber} marcada como conferida!`);
      await loadSheets();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao conferir');
    }
  };

  const reabrirSheet = async (s: SheetRegister) => {
    try {
      await apiJson(`/estoque/ordens-manuais/registros/${s.id}/reabrir`, { method: 'POST' });
      showToast(`Folha ${s.registerNumber} reaberta (Retirada).`);
      await loadSheets();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao reabrir folha');
    }
  };

  // Header Actions
  const headerActions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (activeTab === 'tipos') void loadTypes();
          else if (activeTab === 'registro') void loadSheets();
          else void loadOrders();
        }}
        className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 transition-all cursor-pointer shadow-xs active:scale-95"
        title="Atualizar dados"
      >
        <RefreshCw size={16} className={loading ? 'animate-spin text-zinc-900' : ''} />
      </button>

      {(activeTab === 'entradas' || activeTab === 'saidas') && (
        <>
          <button
            type="button"
            disabled={erpPrintBusy}
            onClick={() => void printErpQueue()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-800 hover:bg-zinc-50 hover:border-zinc-300 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Imprimir relatório executivo com todas as ordens abertas para lançamento no ERP"
          >
            <Printer size={14} className="text-zinc-600" />
            <span>{erpPrintBusy ? 'Preparando…' : 'A lançar no ERP'}</span>
          </button>

          <button
            type="button"
            onClick={() => openCreate(activeTab === 'entradas' ? 'entrada' : 'saida')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <Plus size={15} />
            <span>{activeTab === 'entradas' ? 'Nova Entrada (CEI)' : 'Nova Saída (CSI)'}</span>
          </button>
        </>
      )}

      {activeTab === 'registro' && (
        <button
          type="button"
          onClick={() => {
            setBlockKind('saida');
            setBlockQty('10');
            setBlockOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-all shadow-xs cursor-pointer active:scale-98"
        >
          <Plus size={15} />
          <span>Gerar Bloco de Folhas</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      <AppLayout
        moduleTitle="Ordens Manuais"
        moduleSubtitle="Controle Operacional de Entradas (CEI), Saídas (CSI) e Folhas Físicas"
        onBackToHub={onBackToHub}
        sidebarItems={sidebarItems}
        activeTab={activeTab}
        onTabChange={(id) => {
          setActiveTab(id as TabId);
          setSearch('');
          setError('');
          setStatusFilter('ALL');
          setSheetStatusFilter('ALL');
        }}
        headerActions={headerActions}
      >
        <div className="no-print flex flex-col gap-4 h-full min-h-0">
          {/* Feedback Banners */}
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 flex items-center justify-between shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle size={16} className="text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError('')}
                className="text-red-500 hover:text-red-800 p-1 rounded-lg hover:bg-red-100/50 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {successMsg && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMsg('')}
                className="text-emerald-600 hover:text-emerald-900 p-1 rounded-lg hover:bg-emerald-100/50 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* KPI StatCards para Saídas e Entradas */}
          {(activeTab === 'saidas' || activeTab === 'entradas') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
              <StatCard
                title={activeTab === 'saidas' ? 'Ordens de Saída' : 'Ordens de Entrada'}
                value={statsOrders.total}
                description={activeTab === 'saidas' ? 'Total cadastradas (CSI)' : 'Total cadastradas (CEI)'}
                icon={activeTab === 'saidas' ? ArrowUpFromLine : ArrowDownToLine}
                onClick={() => setStatusFilter('ALL')}
                className="hover:border-zinc-400 cursor-pointer"
              />
              <StatCard
                title="Abertas / Pendentes"
                value={statsOrders.open}
                description="Aguardando lançamento no ERP"
                icon={Clock}
                trend={
                  statsOrders.open > 0
                    ? { value: `${statsOrders.open} pendente(s)`, type: 'down' }
                    : { value: 'Em dia', type: 'up' }
                }
                onClick={() => setStatusFilter('OPEN')}
                className={`cursor-pointer ${statsOrders.open > 0 ? 'border-amber-200 bg-amber-50/30' : ''}`}
              />
              <StatCard
                title="Lançadas no ERP"
                value={statsOrders.posted}
                description="Processadas e arquivadas"
                icon={CheckCircle2}
                trend={{ value: `${Math.round((statsOrders.posted / (statsOrders.total || 1)) * 100)}%`, type: 'up' }}
                onClick={() => setStatusFilter('POSTED')}
                className="hover:border-zinc-400 cursor-pointer"
              />
              <StatCard
                title="Itens Movimentados"
                value={fmtNum(statsOrders.totalQty)}
                description={`${statsOrders.totalItems} linhas de insumos`}
                icon={Boxes}
              />
            </div>
          )}

          {/* KPI StatCards para Folhas Físicas */}
          {activeTab === 'registro' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
              <StatCard
                title="Total de Folhas"
                value={statsSheets.total}
                description="Registros sequenciais gerados"
                icon={ClipboardList}
                onClick={() => setSheetStatusFilter('ALL')}
                className="hover:border-zinc-400 cursor-pointer"
              />
              <StatCard
                title="Folhas Retiradas"
                value={statsSheets.retiradas}
                description="Em uso físico na fábrica"
                icon={Clock}
                trend={
                  statsSheets.retiradas > 0
                    ? { value: `${statsSheets.retiradas} em uso`, type: 'down' }
                    : { value: 'Todas conferidas', type: 'up' }
                }
                onClick={() => setSheetStatusFilter('retirada')}
                className={`cursor-pointer ${statsSheets.retiradas > 0 ? 'border-amber-200 bg-amber-50/30' : ''}`}
              />
              <StatCard
                title="Folhas Conferidas"
                value={statsSheets.conferidas}
                description="Conferidas pelo almoxarifado"
                icon={Archive}
                trend={{ value: 'Ok', type: 'up' }}
                onClick={() => setSheetStatusFilter('conferida')}
                className="hover:border-zinc-400 cursor-pointer"
              />
              <StatCard
                title="Distribuição"
                value={`${statsSheets.saidas} CSI / ${statsSheets.entradas} CEI`}
                description="Saídas vs Entradas"
                icon={Layers}
              />
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA: SAÍDAS / ENTRADAS                                                    */}
          {/* ========================================================================= */}
          {(activeTab === 'entradas' || activeTab === 'saidas') && (
            <div className="flex flex-col flex-1 min-h-0 gap-3">
              {/* Barra de Filtros & Busca */}
              <div className="bg-white border border-zinc-200 p-3 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Segmented status pills */}
                  <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100/70 p-1">
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        statusFilter === 'ALL'
                          ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                      onClick={() => setStatusFilter('ALL')}
                    >
                      Todas ({statsOrders.total})
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        statusFilter === 'OPEN'
                          ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                      onClick={() => setStatusFilter('OPEN')}
                    >
                      Abertas ({statsOrders.open})
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        statusFilter === 'POSTED'
                          ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                      onClick={() => setStatusFilter('POSTED')}
                    >
                      Lançadas ({statsOrders.posted})
                    </button>
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    className="w-full pl-9 pr-8 py-2 text-xs font-medium border border-zinc-200 rounded-xl bg-zinc-50/50 hover:bg-white focus:bg-white focus:border-zinc-400 focus:outline-none transition-all placeholder:text-zinc-400"
                    placeholder="Buscar por Nº ordem, solicitante, insumo…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Tabela de Ordens */}
              <div className="flex-1 bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
                      <RefreshCw size={24} className="animate-spin text-zinc-900" />
                      <span className="text-xs font-semibold">Carregando ordens manuais…</span>
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
                      <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-150 text-zinc-400">
                        <FileText size={32} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-zinc-700">Nenhuma ordem encontrada</p>
                        <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                          {search.trim()
                            ? `Nenhum resultado corresponde à busca "${search}".`
                            : statusFilter === 'OPEN'
                            ? `Não há ordens abertas no momento (${statsOrders.posted} ordem(ns) já lançadas).`
                            : `Não há ordens de ${activeTab === 'entradas' ? 'entrada' : 'saída'} registradas.`}
                        </p>
                      </div>
                      {statusFilter !== 'ALL' && statsOrders.total > 0 && (
                        <button
                          type="button"
                          onClick={() => setStatusFilter('ALL')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                        >
                          Ver todas ({statsOrders.total})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openCreate(activeTab === 'entradas' ? 'entrada' : 'saida')}
                        className="mt-2 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 cursor-pointer shadow-xs"
                      >
                        <Plus size={14} />
                        <span>Criar {activeTab === 'entradas' ? 'Entrada' : 'Saída'}</span>
                      </button>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50/80 text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0 border-b border-zinc-200 backdrop-blur-xs z-10">
                        <tr>
                          <th className="text-left px-4 py-3 font-bold">Nº Ordem</th>
                          <th className="text-left px-4 py-3 font-bold">Registro / Destinatário</th>
                          <th className="text-left px-4 py-3 font-bold">Data Emissão</th>
                          <th className="text-center px-4 py-3 font-bold">Itens</th>
                          <th className="text-center px-4 py-3 font-bold">Status ERP</th>
                          <th className="text-right px-4 py-3 font-bold">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filteredOrders.map((o) => {
                          const isPosted = o.status === 'POSTED';
                          const totalQtyOrder = (o.items || []).reduce(
                            (acc, it) => acc + (Number(it.qty) || 0),
                            0,
                          );

                          return (
                            <tr
                              key={o.id}
                              onClick={() => setViewingOrder(o)}
                              className="hover:bg-zinc-50/90 transition-colors cursor-pointer group"
                            >
                              {/* Nº Ordem */}
                              <td className="px-4 py-3 font-mono font-bold text-zinc-900">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[11px] ${
                                    o.kind === 'saida'
                                      ? 'bg-amber-50/80 text-amber-900 border-amber-200/80'
                                      : 'bg-emerald-50/80 text-emerald-900 border-emerald-200/80'
                                  }`}
                                >
                                  {o.orderNumber}
                                </span>
                              </td>

                              {/* Registro / Solicitante */}
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    {o.recordType && (
                                      <span className="inline-flex px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 font-bold text-[10px] uppercase border border-zinc-200/60">
                                        {o.recordType}
                                      </span>
                                    )}
                                    <span className="font-bold text-zinc-900 truncate max-w-[280px]">
                                      {o.partnerName || '—'}
                                    </span>
                                  </div>
                                  {o.notes && (
                                    <p className="text-[11px] text-zinc-400 truncate max-w-sm">
                                      {o.notes}
                                    </p>
                                  )}
                                </div>
                              </td>

                              {/* Data */}
                              <td className="px-4 py-3 text-zinc-600 font-medium">
                                {formatDate(o.orderDate)}
                              </td>

                              {/* Itens */}
                              <td className="px-4 py-3 text-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 font-bold text-[11px] border border-zinc-200/60">
                                  <Boxes size={12} className="text-zinc-500" />
                                  {o.items?.length || 0} ({fmtNum(totalQtyOrder)} un)
                                </span>
                              </td>

                              {/* Status */}
                              <td className="px-4 py-3 text-center">
                                {isPosted ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] uppercase border border-emerald-200">
                                    <CheckCircle2 size={11} /> Lançada ERP
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px] uppercase border border-amber-200">
                                    <Clock size={11} /> Aberta (Pendente)
                                  </span>
                                )}
                              </td>

                              {/* Ações */}
                              <td
                                className="px-4 py-3 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    title="Visualizar detalhes"
                                    className="p-1.5 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer transition-all"
                                    onClick={() => setViewingOrder(o)}
                                  >
                                    <Eye size={14} />
                                  </button>

                                  <button
                                    type="button"
                                    title="Imprimir ordem em A4"
                                    className="p-1.5 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer transition-all"
                                    onClick={() => printOrder(o)}
                                  >
                                    <Printer size={14} />
                                  </button>

                                  {!isPosted ? (
                                    <>
                                      <button
                                        type="button"
                                        title="Editar ordem"
                                        className="p-1.5 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer transition-all"
                                        onClick={() => openEdit(o)}
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        title="Marcar como lançada no ERP"
                                        className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer transition-all"
                                        onClick={() => void markPosted(o)}
                                      >
                                        <CheckCircle2 size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        title="Excluir ordem"
                                        className="p-1.5 rounded-lg border border-transparent hover:border-red-200 hover:bg-red-50 text-zinc-400 hover:text-red-600 cursor-pointer transition-all"
                                        onClick={() => void remove(o)}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      title="Reabrir ordem (retornar para pendente)"
                                      className="p-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer transition-all"
                                      onClick={() => void reopen(o)}
                                    >
                                      <RotateCcw size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA: FOLHAS FÍSICAS (REGISTRO CEI/CSI)                                    */}
          {/* ========================================================================= */}
          {activeTab === 'registro' && (
            <div className="flex flex-col flex-1 min-h-0 gap-3">
              {/* Barra de Filtros & Busca */}
              <div className="bg-white border border-zinc-200 p-3 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100/70 p-1">
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        sheetStatusFilter === 'ALL'
                          ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                      onClick={() => setSheetStatusFilter('ALL')}
                    >
                      Todas ({statsSheets.total})
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        sheetStatusFilter === 'retirada'
                          ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                      onClick={() => setSheetStatusFilter('retirada')}
                    >
                      Retiradas ({statsSheets.retiradas})
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        sheetStatusFilter === 'conferida'
                          ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                      onClick={() => setSheetStatusFilter('conferida')}
                    >
                      Conferidas ({statsSheets.conferidas})
                    </button>
                  </div>

                  <select
                    className="text-xs font-bold border border-zinc-200 rounded-xl px-3 py-2 bg-white text-zinc-700 hover:border-zinc-300 focus:outline-none cursor-pointer"
                    value={sheetKindFilter}
                    onChange={(e) => setSheetKindFilter(e.target.value as 'ALL' | Kind)}
                  >
                    <option value="ALL">Entrada e Saída (Todos)</option>
                    <option value="saida">Apenas Saída (CSI)</option>
                    <option value="entrada">Apenas Entrada (CEI)</option>
                  </select>
                </div>

                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    className="w-full pl-9 pr-8 py-2 text-xs font-medium border border-zinc-200 rounded-xl bg-zinc-50/50 hover:bg-white focus:bg-white focus:border-zinc-400 focus:outline-none transition-all placeholder:text-zinc-400"
                    placeholder="Buscar por Nº de registro (ex: CSI-0001)…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Tabela de Folhas */}
              <div className="flex-1 bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
                      <RefreshCw size={24} className="animate-spin text-zinc-900" />
                      <span className="text-xs font-semibold">Carregando folhas físicas…</span>
                    </div>
                  ) : filteredSheets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
                      <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-150 text-zinc-400">
                        <ClipboardList size={32} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-zinc-700">Nenhuma folha física encontrada</p>
                        <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                          Use «Gerar Bloco» para criar talões sequenciais numerados com layout A4 para prancheta física.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBlockKind('saida');
                          setBlockQty('10');
                          setBlockOpen(true);
                        }}
                        className="mt-2 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 cursor-pointer shadow-xs"
                      >
                        <Plus size={14} />
                        <span>Gerar Bloco de Folhas</span>
                      </button>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50/80 text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0 border-b border-zinc-200 backdrop-blur-xs z-10">
                        <tr>
                          <th className="text-left px-4 py-3 font-bold">Nº Registro</th>
                          <th className="text-left px-4 py-3 font-bold">Movimento</th>
                          <th className="text-left px-4 py-3 font-bold">Situação da Folha</th>
                          <th className="text-left px-4 py-3 font-bold">Data Emissão</th>
                          <th className="text-right px-4 py-3 font-bold">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filteredSheets.map((s) => (
                          <tr key={s.id} className="hover:bg-zinc-50/90 transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-zinc-900">
                              <span className="inline-flex px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 font-mono text-[11px]">
                                {s.registerNumber}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                                  s.kind === 'saida'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                {s.kind === 'saida' ? 'Saída (CSI)' : 'Entrada (CEI)'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {s.status === 'conferida' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <Check size={11} /> Conferida no Estoque
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-amber-50 text-amber-800 border border-amber-200">
                                  <Clock size={11} /> Retirada (Em uso)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-zinc-500 font-medium">
                              {formatDate(s.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  title="Imprimir folha em branco A4"
                                  className="p-1.5 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer transition-all"
                                  onClick={() => printSheets([s])}
                                >
                                  <Printer size={14} />
                                </button>
                                {s.status === 'retirada' ? (
                                  <button
                                    type="button"
                                    title="Marcar folha como conferida"
                                    className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer transition-all"
                                    onClick={() => void conferirSheet(s)}
                                  >
                                    <Archive size={14} />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    title="Reabrir folha (voltar para retirada)"
                                    className="p-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer transition-all"
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
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA: TIPOS DE REGISTRO                                                    */}
          {/* ========================================================================= */}
          {activeTab === 'tipos' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
              {/* Card de Cadastro e Sugestões */}
              <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-xs p-5 flex flex-col gap-4">
                <div>
                  <h3 className="font-extrabold text-sm text-zinc-900 tracking-tight flex items-center gap-2">
                    <Layers size={16} className="text-zinc-600" />
                    Novo Tipo de Registro
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    Classifique as ordens por finalidade (ex.: Venda, Uso Interno, Doação, Manutenção).
                  </p>
                </div>

                <div className="space-y-2">
                  <input
                    className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-xs font-medium focus:border-zinc-400 focus:outline-none transition-all placeholder:text-zinc-400"
                    placeholder="Nome do tipo (ex.: Consumo Interno)"
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
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 hover:bg-zinc-800 transition-all shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>{typeBusy ? 'Salvando…' : 'Adicionar Tipo'}</span>
                  </button>
                </div>

                {/* Sugestões Rápidas */}
                <div className="pt-3 border-t border-zinc-100">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block mb-2">
                    Sugestões Rápidas (1 clique)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TYPE_SUGGESTIONS.map((sug) => {
                      const alreadyExists = types.some(
                        (t) => (t.name || '').toLowerCase() === sug.toLowerCase(),
                      );
                      return (
                        <button
                          key={sug}
                          type="button"
                          disabled={alreadyExists || typeBusy}
                          onClick={() => void saveType(sug)}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                            alreadyExists
                              ? 'bg-zinc-50 text-zinc-300 border-zinc-150 cursor-not-allowed'
                              : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300 active:scale-95'
                          }`}
                        >
                          + {sug}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Lista de Tipos Cadastrados */}
              <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-xs p-5 flex flex-col gap-3 min-h-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-zinc-900 tracking-tight">
                      Tipos Cadastrados ({types.length})
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Utilizados para agrupar e categorizar movimentações manuais.
                    </p>
                  </div>
                  <div className="relative w-48">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      className="w-full pl-7 pr-3 py-1.5 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 hover:bg-white focus:bg-white focus:outline-none"
                      placeholder="Filtrar tipos…"
                      value={typeSearch}
                      onChange={(e) => setTypeSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-auto border border-zinc-100 rounded-xl">
                  {filteredTypes.length === 0 ? (
                    <div className="py-12 text-center text-xs text-zinc-400">
                      Nenhum tipo de registro cadastrado ou encontrado.
                    </div>
                  ) : (
                    <ul className="divide-y divide-zinc-100">
                      {filteredTypes.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between px-4 py-3 text-xs hover:bg-zinc-50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <Tag size={14} className="text-zinc-400" />
                            <span className="font-bold text-zinc-900 text-sm">{t.name}</span>
                            <span className="text-[10px] text-zinc-400">
                              Cadastrado em {formatDate(t.createdAt)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remover tipo"
                            onClick={() => void deleteType(t)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </AppLayout>

      {/* ========================================================================= */}
      {/* MODAL: VISUALIZAR DETALHES DA ORDEM                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!viewingOrder}
        onClose={() => setViewingOrder(null)}
        title={viewingOrder ? `Ordem ${viewingOrder.orderNumber}` : 'Detalhes da Ordem'}
        subtitle={
          viewingOrder
            ? `${viewingOrder.kind === 'saida' ? 'Controle de Saída (CSI)' : 'Controle de Entrada (CEI)'} · Emitida em ${formatDate(viewingOrder.orderDate)}`
            : ''
        }
        size="2xl"
      >
        {viewingOrder && (
          <div className="space-y-5">
            {/* Metadados e Responsáveis */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50 p-4 rounded-2xl border border-zinc-200/80">
              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block">
                  Tipo & Destinatário
                </span>
                <p className="font-extrabold text-sm text-zinc-900 mt-0.5">
                  {partnerLabel(viewingOrder)}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block">
                  Situação ERP
                </span>
                <div className="mt-1">
                  {viewingOrder.status === 'POSTED' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">
                      <CheckCircle2 size={12} /> Lançada no ERP
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] uppercase">
                      <Clock size={12} /> Aberta (Pendente)
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider block">
                  Data & Registro
                </span>
                <p className="text-xs font-semibold text-zinc-700 mt-0.5">
                  {formatDate(viewingOrder.orderDate)}
                </p>
              </div>
            </div>

            {viewingOrder.notes && (
              <div className="bg-amber-50/60 border border-amber-200/70 p-3 rounded-xl text-xs text-amber-900">
                <strong>Observações:</strong> {viewingOrder.notes}
              </div>
            )}

            {/* Tabela de Itens */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">
                  Itens da Ordem ({viewingOrder.items?.length || 0})
                </span>
              </div>
              <div className="border border-zinc-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px] border-b border-zinc-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold">#</th>
                      <th className="text-left px-3 py-2 font-bold">Código</th>
                      <th className="text-left px-3 py-2 font-bold">Descrição do Material</th>
                      <th className="text-right px-3 py-2 font-bold">Quantidade</th>
                      <th className="text-center px-3 py-2 font-bold">Un</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {(viewingOrder.items || []).map((it, idx) => (
                      <tr key={idx} className="hover:bg-zinc-50">
                        <td className="px-3 py-2 text-zinc-400 font-mono text-center w-8">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-800">
                          {it.itemCode}
                        </td>
                        <td className="px-3 py-2 text-zinc-800 font-medium">{it.description}</td>
                        <td className="px-3 py-2 text-right font-extrabold text-zinc-900">
                          {fmtNum(it.qty)}
                        </td>
                        <td className="px-3 py-2 text-center text-zinc-500">{it.unit || 'UN'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-zinc-50/80 font-bold border-t border-zinc-200">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right text-zinc-600">
                        TOTAL DE UNIDADES:
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-900 font-black">
                        {fmtNum(
                          (viewingOrder.items || []).reduce(
                            (acc, it) => acc + (Number(it.qty) || 0),
                            0,
                          ),
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-zinc-400">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Ações do Rodapé do Modal */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printOrder(viewingOrder)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold hover:bg-zinc-50 cursor-pointer shadow-xs"
                >
                  <Printer size={14} /> Imprimir A4
                </button>

                {viewingOrder.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => {
                      const ord = viewingOrder;
                      setViewingOrder(null);
                      openEdit(ord);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold hover:bg-zinc-50 cursor-pointer shadow-xs"
                  >
                    <Pencil size={14} /> Editar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {viewingOrder.status === 'OPEN' ? (
                  <button
                    type="button"
                    onClick={() => void markPosted(viewingOrder)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 size={15} /> Marcar como Lançada no ERP
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void reopen(viewingOrder)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer shadow-xs"
                  >
                    <RotateCcw size={14} /> Reabrir Ordem
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewingOrder(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: CRIAR / EDITAR ORDEM MANUAL                                        */}
      {/* ========================================================================= */}
      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? 'Editar Ordem Manual' : 'Nova Ordem Manual'}
        subtitle={`${kind === 'saida' ? 'Controle de Saída de Insumo (CSI)' : 'Controle de Entrada de Insumo (CEI)'} · Preenchimento de Itens`}
        size="2xl"
      >
        <div className="space-y-4 text-xs">
          {/* Seletor de Movimento (se for criação nova) */}
          {!editingId && (
            <div className="flex gap-2 p-1 bg-zinc-100 rounded-xl border border-zinc-200/80">
              <button
                type="button"
                className={`flex-1 py-2 rounded-lg font-extrabold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  kind === 'saida'
                    ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                onClick={() => setKind('saida')}
              >
                <ArrowUpFromLine size={14} className={kind === 'saida' ? 'text-amber-600' : ''} />
                Saída de Insumo (CSI)
              </button>
              <button
                type="button"
                className={`flex-1 py-2 rounded-lg font-extrabold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  kind === 'entrada'
                    ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200/60'
                    : 'text-zinc-500 hover:text-zinc-900'
                }`}
                onClick={() => setKind('entrada')}
              >
                <ArrowDownToLine size={14} className={kind === 'entrada' ? 'text-emerald-600' : ''} />
                Entrada de Insumo (CEI)
              </button>
            </div>
          )}

          {/* Dados Gerais da Ordem */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50/70 p-4 rounded-2xl border border-zinc-200">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider block">
                Tipo de Registro
              </span>
              <input
                list="om-modal-types"
                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:border-zinc-400"
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
                placeholder="Venda, Uso Interno…"
              />
              <datalist id="om-modal-types">
                {types.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider block">
                Pessoa / Setor / Fornecedor
              </span>
              <input
                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:border-zinc-400"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="Ex.: Manutenção, Edson Ferrari…"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider block">
                Data do Movimento
              </span>
              <input
                type="date"
                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:border-zinc-400"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </label>

            <div className="sm:col-span-3">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider block">
                  Observações Internas (Opcional)
                </span>
                <input
                  className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-xs font-medium bg-white focus:outline-none focus:border-zinc-400 placeholder:text-zinc-400"
                  placeholder="Justificativa ou nota adicional para o lançamento ERP…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Grade Dinâmica de Itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider">
                Insumos & Quantidades ({lines.length})
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-bold text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                onClick={() => setLines((p) => [...p, emptyDraft()])}
              >
                <Plus size={13} /> Adicionar Linha
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-xl border border-zinc-200 shadow-2xs relative"
                >
                  {/* Código com Autocomplete */}
                  <div className="col-span-3 relative">
                    <input
                      className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold bg-zinc-50 focus:bg-white focus:border-zinc-400 focus:outline-none"
                      placeholder="Código item"
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

                    {/* Popover de Resultados do Autocomplete */}
                    {activeLineIdx === idx && (itemHits.length > 0 || itemHitsLoading) && (
                      <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {itemHitsLoading ? (
                          <div className="p-3 text-center text-zinc-400 text-[11px]">Buscando insumos…</div>
                        ) : (
                          itemHits.map((h) => (
                            <button
                              key={h.code}
                              type="button"
                              className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 border-b border-zinc-100 last:border-0 cursor-pointer flex flex-col"
                              onClick={() => pickItem(idx, h)}
                            >
                              <span className="font-mono font-extrabold text-zinc-900">{h.code}</span>
                              <span className="text-zinc-600 text-[11px] truncate">{h.description}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Descrição */}
                  <div className="col-span-5">
                    <input
                      className="w-full border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:border-zinc-400 focus:outline-none"
                      placeholder="Descrição do insumo"
                      value={line.description}
                      onChange={(e) =>
                        setLines((p) => p.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l)))
                      }
                    />
                  </div>

                  {/* Quantidade */}
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="any"
                      className="w-full border border-zinc-200 rounded-lg px-2 py-1.5 text-xs text-right font-bold bg-white focus:border-zinc-400 focus:outline-none"
                      placeholder="Qtd"
                      value={line.qty}
                      onChange={(e) =>
                        setLines((p) => p.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)))
                      }
                    />
                  </div>

                  {/* Unidade */}
                  <div className="col-span-1">
                    <input
                      className="w-full border border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs text-center font-bold uppercase bg-zinc-50 focus:bg-white focus:border-zinc-400 focus:outline-none"
                      value={line.unit}
                      onChange={(e) =>
                        setLines((p) => p.map((l, i) => (i === idx ? { ...l, unit: e.target.value } : l)))
                      }
                    />
                  </div>

                  {/* Remover Linha */}
                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                      title="Excluir item"
                      onClick={() => setLines((p) => (p.length <= 1 ? [emptyDraft()] : p.filter((_, i) => i !== idx)))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Resumo de Linhas e Quantidades */}
            <div className="flex items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-200/80 text-xs">
              <span className="font-semibold text-zinc-600">
                Total de Linhas Válidas: <strong className="text-zinc-900">{draftTotals.count}</strong>
              </span>
              <span className="font-semibold text-zinc-600">
                Soma das Quantidades: <strong className="text-zinc-900 font-mono text-sm">{fmtNum(draftTotals.sumQty)}</strong>
              </span>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="pt-3 border-t border-zinc-200 flex justify-end gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              onClick={() => setEditorOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 hover:bg-zinc-800 transition-all cursor-pointer shadow-xs"
              onClick={() => void saveOrder()}
            >
              {saving ? 'Salvando…' : editingId ? 'Salvar Alterações' : 'Criar Ordem Manual'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: GERAR BLOCO DE FOLHAS                                              */}
      {/* ========================================================================= */}
      <Modal
        isOpen={blockOpen}
        onClose={() => setBlockOpen(false)}
        title="Gerar Bloco de Folhas Físicas"
        subtitle="Criação sequencial de folhas impressas CEI/CSI para prancheta de controle manual"
        size="md"
      >
        <div className="space-y-4 text-xs">
          {/* Seletor do Tipo de Folha */}
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider block mb-1.5">
              Tipo de Folha Física
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBlockKind('saida')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  blockKind === 'saida'
                    ? 'border-amber-400 bg-amber-50/50 shadow-2xs'
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                  <ArrowUpFromLine size={14} className="text-amber-600" />
                  <span>Saída (CSI)</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Controle de Saída de Insumo para produção ou uso.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setBlockKind('entrada')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  blockKind === 'entrada'
                    ? 'border-emerald-400 bg-emerald-50/50 shadow-2xs'
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                  <ArrowDownToLine size={14} className="text-emerald-600" />
                  <span>Entrada (CEI)</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Controle de Entrada de Insumo no almoxarifado.
                </p>
              </button>
            </div>
          </div>

          {/* Quantidade de Folhas */}
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider block mb-1.5">
              Quantidade de Folhas a Gerar
            </span>
            <div className="flex items-center gap-2 mb-2">
              {['5', '10', '20', '50'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBlockQty(preset)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    blockQty === preset
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  {preset} folhas
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:border-zinc-400"
              value={blockQty}
              onChange={(e) => setBlockQty(e.target.value)}
              placeholder="Ou digite a quantidade…"
            />
          </div>

          <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200/80 text-[11px] text-zinc-500 leading-relaxed">
            As folhas serão criadas com números sequenciais únicos (ex.: CSI-0001, CSI-0002) no status <strong>Retirada</strong> e prontas para impressão A4 oficial.
          </div>

          {/* Ações */}
          <div className="pt-3 border-t border-zinc-200 flex justify-end gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              onClick={() => setBlockOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={blockBusy}
              className="px-5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 hover:bg-zinc-800 transition-all cursor-pointer shadow-xs"
              onClick={() => void generateBlock()}
            >
              {blockBusy ? 'Gerando…' : 'Gerar e Imprimir'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
