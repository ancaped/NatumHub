/**
 * Expedição E-commerce — abas Pedidos | Cadastros | Expedição.
 *
 * Permissões:
 * - `expedicao_ecommerce` (ou alias legado `expedicao`): acesso completo.
 * - `expedicao_separacao`: somente aba Expedição (marcar enviado / quem separou).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Search, Loader2, Plus, Upload,
  CheckCircle2, AlertCircle, Clock, Trash2, Edit, Check, X,
  Package, RefreshCw, Truck, Settings, ListOrdered,
} from 'lucide-react';
import { apiJson } from '../geral/lib/http';
import { cn } from '../geral/lib/utils';
import { getAuthUser } from '../geral/lib/auth';
import { syncCurrentPageForView } from '../geral/lib/viewLabels';
import AppLayout from '../geral/components/layout/AppLayout';

interface EcommerceOrder {
  id: string;
  dataEmissao: string;
  numeroNf: string;
  nomeCliente: string;
  observacoes: string | null;
  plataforma: string;
  plataformaEnvio: string;
  status: 'Pendente' | 'Enviado' | 'Cancelado' | string;
  quemSeparou: string | null;
  pagamentoOk: boolean;
  freteOk: boolean;
  dataEnvio: string | null;
}

interface LookupItem {
  id: string;
  nome: string;
  ativo: boolean;
}

type Draft = {
  dataEmissao: string;
  numeroNf: string;
  nomeCliente: string;
  observacoes: string;
  plataforma: string;
  plataformaEnvio: string;
  status: string;
  quemSeparou: string;
  pagamentoOk: boolean;
  freteOk: boolean;
};

type TabId = 'pedidos' | 'cadastros' | 'expedicao';
type LookupKind = 'platforms' | 'shipping' | 'clients';

const emptyDraft = (): Draft => ({
  dataEmissao: new Date().toISOString().slice(0, 10),
  numeroNf: '',
  nomeCliente: '',
  observacoes: '',
  plataforma: '',
  plataformaEnvio: '',
  status: 'Pendente',
  quemSeparou: '',
  pagamentoOk: false,
  freteOk: false,
});

function statusIcon(status: string) {
  if (status === 'Enviado') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === 'Cancelado') return <AlertCircle className="h-3.5 w-3.5 text-rose-600" />;
  return <Clock className="h-3.5 w-3.5 text-amber-600" />;
}

function statusBadge(status: string) {
  if (status === 'Enviado') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Cancelado') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-800 border-amber-200';
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('pt-BR');
}

function useExpedicaoPermissions() {
  return useMemo(() => {
    const modules = getAuthUser()?.modules ?? [];
    const canFull = modules.some((m) => ['expedicao_ecommerce', 'expedicao'].includes(m));
    const canSeparacao =
      canFull || modules.includes('expedicao_separacao');
    return { canFull, canSeparacao };
  }, []);
}

function OrdersTable({
  orders,
  loading,
  onEdit,
  onMarkEnviado,
  showShipAction = true,
}: {
  orders: EcommerceOrder[];
  loading: boolean;
  onEdit?: (o: EcommerceOrder) => void;
  onMarkEnviado?: (o: EcommerceOrder) => void;
  showShipAction?: boolean;
}) {
  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedidos...
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-zinc-500 flex flex-col items-center gap-2">
        <Package className="h-8 w-8 text-zinc-300" />
        Nenhum pedido encontrado.
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-zinc-50 border-b border-zinc-200 sticky top-0">
        <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
          <th className="px-4 py-3">Emissão</th>
          <th className="px-4 py-3">NF</th>
          <th className="px-4 py-3">Cliente</th>
          <th className="px-4 py-3">Plataforma</th>
          <th className="px-4 py-3">Envio</th>
          <th className="px-4 py-3">Separou</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Pgto / Frete</th>
          {showShipAction && <th className="px-4 py-3 text-right">Ações</th>}
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr
            key={o.id}
            onClick={() => onEdit && onEdit(o)}
            className="border-b border-zinc-100 hover:bg-zinc-50/70 transition-all cursor-pointer"
          >
            <td className="px-4 py-2.5 text-xs text-zinc-650">{formatDate(o.dataEmissao)}</td>
            <td className="px-4 py-2.5 font-mono text-xs font-bold text-zinc-900">{o.numeroNf}</td>
            <td className="px-4 py-2.5 max-w-[220px] truncate text-zinc-800 font-semibold" title={o.nomeCliente}>{o.nomeCliente}</td>
            <td className="px-4 py-2.5 text-xs text-zinc-600">{o.plataforma}</td>
            <td className="px-4 py-2.5 text-xs text-zinc-600">{o.plataformaEnvio}</td>
            <td className="px-4 py-2.5 text-xs text-zinc-650 font-medium">{o.quemSeparou || '—'}</td>
            <td className="px-4 py-2.5">
              <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded border', statusBadge(o.status))}>
                {statusIcon(o.status)} {o.status}
              </span>
            </td>
            <td className="px-4 py-2.5 text-[10px] font-bold">
              <span className={o.pagamentoOk ? 'text-emerald-700' : 'text-zinc-400'}>Pgto</span>
              {' · '}
              <span className={o.freteOk ? 'text-emerald-700' : 'text-zinc-400'}>Frete</span>
            </td>
            {showShipAction && (
              <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="inline-flex items-center gap-1">
                  {showShipAction && o.status === 'Pendente' && onMarkEnviado && (
                    <button
                      onClick={() => onMarkEnviado(o)}
                      className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 cursor-pointer"
                      title="Marcar como enviado"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ExpedicaoView({ onBackToHub }: { onBackToHub: () => void }) {
  const { canFull, canSeparacao } = useExpedicaoPermissions();
  const defaultTab: TabId = canFull ? 'pedidos' : 'expedicao';
  const [tab, setTab] = useState<TabId>(defaultTab);

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<EcommerceOrder[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const [platforms, setPlatforms] = useState<LookupItem[]>([]);
  const [shipping, setShipping] = useState<LookupItem[]>([]);
  const [clients, setClients] = useState<LookupItem[]>([]);
  const [lookupDraft, setLookupDraft] = useState('');
  const [lookupKind, setLookupKind] = useState<LookupKind>('platforms');
  const [shipQuemSeparou, setShipQuemSeparou] = useState('');

  const activePlatforms = useMemo(() => platforms.filter((p) => p.ativo), [platforms]);
  const activeShipping = useMemo(() => shipping.filter((s) => s.ativo), [shipping]);
  const activeClients = useMemo(() => clients.filter((c) => c.ativo), [clients]);

  const loadLookups = useCallback(async () => {
    try {
      const [p, s, c] = await Promise.all([
        apiJson<LookupItem[]>('/expedicao/lookups/platforms'),
        apiJson<LookupItem[]>('/expedicao/lookups/shipping'),
        apiJson<LookupItem[]>('/expedicao/lookups/clients'),
      ]);
      setPlatforms(Array.isArray(p) ? p : []);
      setShipping(Array.isArray(s) ? s : []);
      setClients(Array.isArray(c) ? c : []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (statusFilter) qs.set('status', statusFilter);
      const data = await apiJson<EcommerceOrder[]>(`/expedicao/ecommerce?${qs.toString()}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadLookups();
    load();
  }, [loadLookups, load]);

  useEffect(() => {
    const labels: Record<TabId, string> = {
      pedidos: 'Pedidos',
      cadastros: 'Cadastros',
      expedicao: 'Expedição',
    };
    syncCurrentPageForView('expedicao_ecommerce', labels[tab]);
  }, [tab]);

  const kpis = useMemo(() => {
    const pendente = orders.filter((o) => o.status === 'Pendente').length;
    const enviado = orders.filter((o) => o.status === 'Enviado').length;
    const cancelado = orders.filter((o) => o.status === 'Cancelado').length;
    return { total: orders.length, pendente, enviado, cancelado };
  }, [orders]);

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === 'Pendente'),
    [orders]
  );

  const openCreate = () => {
    const d = emptyDraft();
    d.plataforma = activePlatforms[0]?.nome ?? '';
    d.plataformaEnvio = activeShipping[0]?.nome ?? '';
    d.nomeCliente = activeClients[0]?.nome ?? '';
    setEditingId(null);
    setDraft(d);
    setEditorOpen(true);
  };

  const openEdit = (o: EcommerceOrder) => {
    setEditingId(o.id);
    setDraft({
      dataEmissao: (o.dataEmissao || '').slice(0, 10),
      numeroNf: o.numeroNf || '',
      nomeCliente: o.nomeCliente || '',
      observacoes: o.observacoes || '',
      plataforma: o.plataforma || '',
      plataformaEnvio: o.plataformaEnvio || '',
      status: o.status || 'Pendente',
      quemSeparou: o.quemSeparou || '',
      pagamentoOk: !!o.pagamentoOk,
      freteOk: !!o.freteOk,
    });
    setEditorOpen(true);
  };

  const saveDraft = async () => {
    if (!draft.numeroNf.trim() || !draft.nomeCliente.trim()) {
      alert('Informe NF e nome do cliente.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        dataEmissao: new Date(`${draft.dataEmissao}T12:00:00.000Z`).toISOString(),
        numeroNf: draft.numeroNf.trim(),
        nomeCliente: draft.nomeCliente.trim(),
        observacoes: draft.observacoes.trim() || null,
        plataforma: draft.plataforma.trim() || 'Ecommerce',
        plataformaEnvio: draft.plataformaEnvio.trim() || 'Total Express',
        status: draft.status,
        quemSeparou: draft.quemSeparou.trim() || null,
        pagamentoOk: draft.pagamentoOk,
        freteOk: draft.freteOk,
      };
      if (editingId) {
        await apiJson(`/expedicao/ecommerce/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        await apiJson('/expedicao/ecommerce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      setEditorOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao salvar pedido.';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const removeOrder = async (id: string) => {
    if (!confirm('Remover este pedido?')) return;
    try {
      await apiJson(`/expedicao/ecommerce/${id}`, { method: 'DELETE' });
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao remover.';
      alert(msg);
    }
  };

  const markEnviado = async (o: EcommerceOrder, quemSeparou?: string) => {
    try {
      await apiJson(`/expedicao/ecommerce/${o.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Enviado',
          quemSeparou: quemSeparou?.trim() || o.quemSeparou || null,
        }),
      });
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao atualizar status.';
      alert(msg);
    }
  };

  const onImportFile = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiJson<{ imported: number; updated: number }>('/expedicao/ecommerce/import', {
        method: 'POST',
        body: fd,
      });
      alert(`Importação concluída: ${res.imported ?? 0} novos, ${res.updated ?? 0} atualizados.`);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha na importação Excel.';
      alert(msg);
    } finally {
      setImporting(false);
    }
  };

  const lookupPath = (kind: LookupKind) => `/expedicao/lookups/${kind}`;

  const addLookup = async () => {
    const nome = lookupDraft.trim();
    if (!nome) return;
    try {
      await apiJson(lookupPath(lookupKind), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      });
      setLookupDraft('');
      await loadLookups();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao cadastrar.';
      alert(msg);
    }
  };

  const toggleLookup = async (kind: LookupKind, item: LookupItem) => {
    try {
      await apiJson(`${lookupPath(kind)}/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !item.ativo }),
      });
      await loadLookups();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao atualizar.';
      alert(msg);
    }
  };

  const removeLookup = async (kind: LookupKind, id: string) => {
    if (!confirm('Remover este cadastro?')) return;
    try {
      await apiJson(`${lookupPath(kind)}/${id}`, { method: 'DELETE' });
      await loadLookups();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao remover.';
      alert(msg);
    }
  };

  const lookupList = lookupKind === 'platforms' ? platforms : lookupKind === 'shipping' ? shipping : clients;

  const sidebarItems = useMemo(() => {
    return [
      ...(canFull ? [{ id: 'pedidos', label: 'Pedidos', icon: ListOrdered }] : []),
      ...(canFull ? [{ id: 'cadastros', label: 'Cadastros', icon: Settings }] : []),
      ...(canSeparacao ? [{ id: 'expedicao', label: 'Expedição', icon: Truck }] : []),
    ];
  }, [canFull, canSeparacao]);

  return (
    <AppLayout
      moduleTitle="Expedição · E-commerce"
      moduleSubtitle={tab === 'pedidos' ? 'Pedidos do dia' : tab === 'cadastros' ? 'Cadastros e Lookups' : 'Separação e Envio'}
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={tab}
      onTabChange={(id) => setTab(id as TabId)}
      headerActions={
        canFull && tab === 'pedidos' && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="cursor-pointer text-xs font-bold border border-zinc-300 bg-white hover:bg-zinc-50 px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm">
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-zinc-500" />}
              Importar Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={importing}
                onChange={(e) => onImportFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              onClick={openCreate}
              className="text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Novo pedido
            </button>
          </div>
        )
      }
    >
      <div className="w-full max-w-none space-y-4">
        {tab === 'pedidos' && canFull && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total</span>
                <p className="text-2xl font-extrabold mt-1 text-zinc-900">{kpis.total}</p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pendentes</span>
                <p className="text-2xl font-extrabold text-amber-755 mt-1">{kpis.pendente}</p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Enviados</span>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">{kpis.enviado}</p>
              </div>
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cancelados</span>
                <p className="text-2xl font-extrabold text-rose-700 mt-1">{kpis.cancelado}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por NF, cliente, obs..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:border-zinc-450"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-sm border border-zinc-200 rounded-xl px-3 py-2 bg-white font-bold text-zinc-700 focus:outline-none"
                >
                  <option value="">Todos os status</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Enviado">Enviado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
                <button
                  onClick={load}
                  className="text-sm bg-white border border-zinc-200 px-3 py-2 rounded-xl font-bold hover:bg-zinc-50 flex items-center gap-2 text-zinc-700 cursor-pointer"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                  Atualizar
                </button>
              </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs">
              <OrdersTable
                orders={orders}
                loading={loading}
                onEdit={openEdit}
                onMarkEnviado={(o) => markEnviado(o)}
              />
            </div>
          </>
        )}

        {tab === 'cadastros' && canFull && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex gap-2 flex-wrap">
              {([
                ['platforms', 'Plataformas'],
                ['shipping', 'Envio'],
                ['clients', 'Clientes'],
              ] as [LookupKind, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setLookupKind(k)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-all',
                    lookupKind === k ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200 text-zinc-650'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 max-w-md">
              <input
                value={lookupDraft}
                onChange={(e) => setLookupDraft(e.target.value)}
                placeholder="Novo nome..."
                className="flex-1 text-sm border border-zinc-200 rounded-xl px-3 py-2"
              />
              <button onClick={addLookup} className="text-xs font-bold bg-zinc-900 text-white px-4 py-2 rounded-xl cursor-pointer">
                Adicionar
              </button>
            </div>
            <ul className="divide-y divide-zinc-150 border border-zinc-200 rounded-2xl overflow-hidden bg-zinc-50/50">
              {lookupList.map((item) => (
                <li key={item.id} className="flex items-center justify-between px-4 py-3 bg-white">
                  <span className={cn('text-sm font-medium', !item.ativo && 'text-zinc-400 line-through')}>
                    {item.nome}
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => toggleLookup(lookupKind, item)}
                      className="text-xs font-bold text-zinc-650 hover:text-zinc-900 cursor-pointer"
                    >
                      {item.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => removeLookup(lookupKind, item.id)}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                </li>
              ))}
              {lookupList.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-zinc-500 bg-white">Nenhum cadastro ainda.</li>
              )}
            </ul>
          </div>
        )}

        {tab === 'expedicao' && canSeparacao && (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <label className="text-xs font-bold text-zinc-650 space-y-1">
                <span>Quem separou (padrão)</span>
                <input
                  value={shipQuemSeparou}
                  onChange={(e) => setShipQuemSeparou(e.target.value)}
                  placeholder="Nome do separador"
                  className="block text-sm border border-zinc-250 rounded-xl px-3 py-2 w-56 focus:outline-none"
                />
              </label>
              <button
                onClick={() => { setStatusFilter('Pendente'); load(); }}
                className="text-sm bg-white border border-zinc-200 px-3 py-2.5 rounded-xl font-bold hover:bg-zinc-50 flex items-center gap-2 text-zinc-700 cursor-pointer"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                Atualizar pendentes
              </button>
            </div>
            <p className="text-xs text-zinc-500 font-semibold">
              {pendingOrders.length} pedido(s) pendente(s) — marque como enviado após separação e conferência.
            </p>
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs">
              <OrdersTable
                orders={pendingOrders}
                loading={loading}
                onEdit={canFull ? openEdit : undefined}
                onMarkEnviado={(o) => markEnviado(o, shipQuemSeparou)}
              />
            </div>
          </div>
        )}
      </div>

      {editorOpen && canFull && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setEditorOpen(false)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
            <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-start">
              <div>
                <span className="px-2 py-0.5 bg-zinc-900 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                  {editingId ? 'Editar pedido' : 'Novo pedido'}
                </span>
                <h3 className="font-bold text-zinc-900 text-lg mt-1">Pedido e-commerce</h3>
              </div>
              <button onClick={() => setEditorOpen(false)} className="p-1.5 hover:bg-zinc-150 rounded-lg text-zinc-400 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <label className="block text-xs font-bold text-zinc-650 space-y-1">
                <span>Data emissão</span>
                <input
                  type="date"
                  value={draft.dataEmissao}
                  onChange={(e) => setDraft((d) => ({ ...d, dataEmissao: e.target.value }))}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 font-medium text-zinc-900"
                />
              </label>
              <label className="block text-xs font-bold text-zinc-650 space-y-1">
                <span>Número NF</span>
                <input
                  value={draft.numeroNf}
                  onChange={(e) => setDraft((d) => ({ ...d, numeroNf: e.target.value }))}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 font-medium text-zinc-900"
                />
              </label>
              <label className="block text-xs font-bold text-zinc-650 space-y-1">
                <span>Cliente</span>
                <select
                  value={draft.nomeCliente}
                  onChange={(e) => setDraft((d) => ({ ...d, nomeCliente: e.target.value }))}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 font-medium bg-white focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {activeClients.map((c) => (
                    <option key={c.id} value={c.nome}>{c.nome}</option>
                  ))}
                </select>
                <input
                  value={draft.nomeCliente}
                  onChange={(e) => setDraft((d) => ({ ...d, nomeCliente: e.target.value }))}
                  placeholder="Ou digite o nome"
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 font-medium text-zinc-900 mt-1"
                />
              </label>
              <label className="block text-xs font-bold text-zinc-650 space-y-1">
                <span>Plataforma</span>
                <select
                  value={draft.plataforma}
                  onChange={(e) => setDraft((d) => ({ ...d, plataforma: e.target.value }))}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 font-medium bg-white focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {activePlatforms.map((p) => (
                    <option key={p.id} value={p.nome}>{p.nome}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-zinc-650 space-y-1">
                <span>Plataforma de envio</span>
                <select
                  value={draft.plataformaEnvio}
                  onChange={(e) => setDraft((d) => ({ ...d, plataformaEnvio: e.target.value }))}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 font-medium bg-white focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {activeShipping.map((s) => (
                    <option key={s.id} value={s.nome}>{s.nome}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-zinc-650 space-y-1">
                <span>Quem separou</span>
                <input
                  value={draft.quemSeparou}
                  onChange={(e) => setDraft((d) => ({ ...d, quemSeparou: e.target.value }))}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 font-medium text-zinc-900"
                />
              </label>
              <label className="block text-xs font-bold text-zinc-650 space-y-1">
                <span>Status</span>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 font-medium bg-white focus:outline-none"
                >
                  <option value="Pendente">Pendente</option>
                  <option value="Enviado">Enviado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </label>
              <label className="block text-xs font-bold text-zinc-655 space-y-1">
                <span>Observações</span>
                <textarea
                  value={draft.observacoes || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, observacoes: e.target.value }))}
                  className="w-full text-sm border border-zinc-200 rounded-xl px-3 py-2 min-h-[80px] font-medium"
                />
              </label>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 cursor-pointer">
                  <input type="checkbox" checked={draft.pagamentoOk} onChange={(e) => setDraft((d) => ({ ...d, pagamentoOk: e.target.checked }))} className="rounded border-zinc-300" />
                  Pagamento OK
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 cursor-pointer">
                  <input type="checkbox" checked={draft.freteOk} onChange={(e) => setDraft((d) => ({ ...d, freteOk: e.target.checked }))} className="rounded border-zinc-300" />
                  Frete OK
                </label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 flex flex-col gap-2 shrink-0 bg-zinc-50/50">
              <div className="flex gap-2">
                <button onClick={() => setEditorOpen(false)} className="flex-1 text-sm font-bold border border-zinc-300 rounded-xl py-2.5 hover:bg-zinc-50 cursor-pointer bg-white">
                  Cancelar
                </button>
                <button
                  onClick={saveDraft}
                  disabled={saving}
                  className="flex-1 text-sm font-bold bg-zinc-900 text-white rounded-xl py-2.5 hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Tem certeza que deseja remover este pedido permanentemente?')) {
                      removeOrder(editingId);
                      setEditorOpen(false);
                    }
                  }}
                  className="w-full text-xs font-bold text-rose-600 hover:text-rose-700 py-2 border border-rose-200 hover:bg-rose-50 rounded-xl transition-all cursor-pointer bg-white"
                >
                  Excluir Pedido
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
