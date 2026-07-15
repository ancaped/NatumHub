import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Search, Loader2, Plus, Upload,
  CheckCircle2, AlertCircle, Clock, Trash2, Edit, Check, X,
  Package, RefreshCw, Truck,
} from 'lucide-react';
import { apiFetch, apiJson } from '../geral/lib/http';
import { cn } from '../geral/lib/utils';

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
  createdAt?: string;
  updatedAt?: string;
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

const emptyDraft = (): Draft => ({
  dataEmissao: new Date().toISOString().slice(0, 10),
  numeroNf: '',
  nomeCliente: '',
  observacoes: '',
  plataforma: 'Ecommerce',
  plataformaEnvio: 'Total Express',
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

export default function ExpedicaoView({ onBackToHub }: { onBackToHub: () => void }) {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<EcommerceOrder[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

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
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const pendente = orders.filter(o => o.status === 'Pendente').length;
    const enviado = orders.filter(o => o.status === 'Enviado').length;
    const cancelado = orders.filter(o => o.status === 'Cancelado').length;
    return { total: orders.length, pendente, enviado, cancelado };
  }, [orders]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setEditorOpen(true);
  };

  const openEdit = (o: EcommerceOrder) => {
    setEditingId(o.id);
    setDraft({
      dataEmissao: (o.dataEmissao || '').slice(0, 10),
      numeroNf: o.numeroNf || '',
      nomeCliente: o.nomeCliente || '',
      observacoes: o.observacoes || '',
      plataforma: o.plataforma || 'Ecommerce',
      plataformaEnvio: o.plataformaEnvio || 'Total Express',
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
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Falha ao salvar pedido.');
    } finally {
      setSaving(false);
    }
  };

  const removeOrder = async (id: string) => {
    if (!confirm('Remover este pedido?')) return;
    try {
      await apiJson(`/expedicao/ecommerce/${id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      alert(e?.message || 'Falha ao remover.');
    }
  };

  const markEnviado = async (o: EcommerceOrder) => {
    try {
      await apiJson(`/expedicao/ecommerce/${o.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Enviado' }),
      });
      await load();
    } catch (e: any) {
      alert(e?.message || 'Falha ao atualizar status.');
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
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Falha na importação Excel.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-200 bg-white flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBackToHub}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-50 border border-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Hub
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-zinc-700" />
              <h1 className="text-lg font-extrabold text-zinc-900">Expedição · E-commerce</h1>
            </div>
            <p className="text-xs text-zinc-500 truncate">Pedidos, separação, frete/pagamento e envio</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="cursor-pointer text-xs font-bold border border-zinc-300 bg-white hover:bg-zinc-50 px-3 py-2 rounded-xl flex items-center gap-1.5">
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Importar Excel
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={importing}
              onChange={e => onImportFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            onClick={openCreate}
            className="text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 px-3 py-2 rounded-xl flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Novo pedido
          </button>
        </div>
      </div>

      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total</span>
          <p className="text-2xl font-extrabold mt-1">{kpis.total}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pendentes</span>
          <p className="text-2xl font-extrabold text-amber-700 mt-1">{kpis.pendente}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Enviados</span>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1">{kpis.enviado}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cancelados</span>
          <p className="text-2xl font-extrabold text-rose-700 mt-1">{kpis.cancelado}</p>
        </div>
      </div>

      <div className="px-6 pb-3 flex items-center gap-2 flex-wrap shrink-0">
        <div className="flex items-center gap-2 bg-white border border-zinc-300 rounded-md px-3 py-1.5">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar NF, cliente, obs..."
            className="text-sm bg-transparent border-none focus:outline-none w-56"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option value="">Todos os status</option>
          <option value="Pendente">Pendente</option>
          <option value="Enviado">Enviado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <button
          onClick={load}
          className="text-sm bg-white border border-zinc-300 px-3 py-1.5 rounded-md font-medium hover:bg-zinc-50 flex items-center gap-2"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="flex-1 px-6 pb-6 min-h-0">
        <div className="h-full bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-auto flex-1">
            {loading ? (
              <div className="p-12 flex items-center justify-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedidos...
              </div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center text-sm text-zinc-500 flex flex-col items-center gap-2">
                <Package className="h-8 w-8 text-zinc-300" />
                Nenhum pedido encontrado. Importe um Excel ou cadastre manualmente.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200 sticky top-0">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                    <th className="px-4 py-3">Emissão</th>
                    <th className="px-4 py-3">NF</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Plataforma</th>
                    <th className="px-4 py-3">Envio</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Pgto / Frete</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-2.5 text-xs text-zinc-600">{formatDate(o.dataEmissao)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs font-bold">{o.numeroNf}</td>
                      <td className="px-4 py-2.5 max-w-[220px] truncate" title={o.nomeCliente}>{o.nomeCliente}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-600">{o.plataforma}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-600">{o.plataformaEnvio}</td>
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
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {o.status === 'Pendente' && (
                            <button
                              onClick={() => markEnviado(o)}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700"
                              title="Marcar como enviado"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-600" title="Editar">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button onClick={() => removeOrder(o.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600" title="Remover">
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      {editorOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setEditorOpen(false)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
            <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-start">
              <div>
                <span className="px-2 py-0.5 bg-zinc-900 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                  {editingId ? 'Editar pedido' : 'Novo pedido'}
                </span>
                <h3 className="font-bold text-zinc-900 text-lg mt-1">Expedição e-commerce</h3>
              </div>
              <button onClick={() => setEditorOpen(false)} className="p-1.5 hover:bg-zinc-150 rounded-lg text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {[
                ['dataEmissao', 'Data emissão', 'date'],
                ['numeroNf', 'Número NF', 'text'],
                ['nomeCliente', 'Cliente', 'text'],
                ['plataforma', 'Plataforma', 'text'],
                ['plataformaEnvio', 'Plataforma de envio', 'text'],
                ['quemSeparou', 'Quem separou', 'text'],
              ].map(([key, label, type]) => (
                <label key={key} className="block text-xs font-bold text-zinc-600 space-y-1">
                  <span>{label}</span>
                  <input
                    type={type}
                    value={(draft as any)[key]}
                    onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                    className="w-full text-sm border border-zinc-300 rounded-md px-3 py-2 font-medium text-zinc-900"
                  />
                </label>
              ))}
              <label className="block text-xs font-bold text-zinc-600 space-y-1">
                <span>Status</span>
                <select
                  value={draft.status}
                  onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
                  className="w-full text-sm border border-zinc-300 rounded-md px-3 py-2 font-medium"
                >
                  <option value="Pendente">Pendente</option>
                  <option value="Enviado">Enviado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </label>
              <label className="block text-xs font-bold text-zinc-600 space-y-1">
                <span>Observações</span>
                <textarea
                  value={draft.observacoes}
                  onChange={e => setDraft(d => ({ ...d, observacoes: e.target.value }))}
                  className="w-full text-sm border border-zinc-300 rounded-md px-3 py-2 min-h-[80px] font-medium"
                />
              </label>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-700">
                  <input type="checkbox" checked={draft.pagamentoOk} onChange={e => setDraft(d => ({ ...d, pagamentoOk: e.target.checked }))} />
                  Pagamento OK
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-700">
                  <input type="checkbox" checked={draft.freteOk} onChange={e => setDraft(d => ({ ...d, freteOk: e.target.checked }))} />
                  Frete OK
                </label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 flex gap-2">
              <button onClick={() => setEditorOpen(false)} className="flex-1 text-sm font-bold border border-zinc-300 rounded-xl py-2.5 hover:bg-zinc-50">
                Cancelar
              </button>
              <button
                onClick={saveDraft}
                disabled={saving}
                className="flex-1 text-sm font-bold bg-zinc-900 text-white rounded-xl py-2.5 hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
