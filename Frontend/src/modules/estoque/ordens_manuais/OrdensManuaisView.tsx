import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Plus, Printer, RefreshCw, Search, Trash2, CheckCircle2,
  RotateCcw, X, Pencil,
} from 'lucide-react';
import { apiJson } from '../../geral/lib/http';

type Kind = 'entrada' | 'saida';
type StatusFilter = 'OPEN' | 'POSTED' | 'ALL';

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

type ItemHit = {
  code: string;
  description: string;
  unit: string;
  categoryId?: string | null;
};

type DraftLine = {
  itemCode: string;
  description: string;
  unit: string;
  qty: string;
};

type PrintMode = 'ordem' | 'folha_saida' | 'folha_entrada';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): DraftLine {
  return { itemCode: '', description: '', unit: 'UN', qty: '' };
}

export default function OrdensManuaisView({ onBackToHub }: { onBackToHub: () => void }) {
  const [orders, setOrders] = useState<ManualOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [kindFilter, setKindFilter] = useState<'ALL' | Kind>('ALL');
  const [search, setSearch] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>('saida');
  const [partnerName, setPartnerName] = useState('');
  const [orderDate, setOrderDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyDraft()]);
  const [saving, setSaving] = useState(false);

  const [itemQuery, setItemQuery] = useState('');
  const [itemHits, setItemHits] = useState<ItemHit[]>([]);
  const [activeLineIdx, setActiveLineIdx] = useState<number | null>(null);

  const [printing, setPrinting] = useState<ManualOrder | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>('ordem');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (kindFilter !== 'ALL') params.set('kind', kindFilter);
      if (search.trim()) params.set('q', search.trim());
      const qs = params.toString();
      const data = await apiJson<ManualOrder[]>(
        `/estoque/ordens-manuais${qs ? `?${qs}` : ''}`,
      );
      setOrders(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar ordens');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, kindFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

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

  const openCreate = (k: Kind = 'saida') => {
    setEditingId(null);
    setKind(k);
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
          ? {
              ...l,
              itemCode: hit.code,
              description: hit.description,
              unit: hit.unit || 'UN',
            }
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
        await apiJson(`/estoque/ordens-manuais`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      setEditorOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const markPosted = async (o: ManualOrder) => {
    if (!window.confirm(`Marcar ${o.orderNumber} como lançada no ERP? Ela deixa de afetar a Prev. Futura.`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}/postar`, { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao postar');
    }
  };

  const reopen = async (o: ManualOrder) => {
    if (!window.confirm(`Reabrir ${o.orderNumber}? Volta a afetar a Prev. Futura.`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}/reabrir`, { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao reabrir');
    }
  };

  const remove = async (o: ManualOrder) => {
    if (!window.confirm(`Excluir ${o.orderNumber}?`)) return;
    try {
      await apiJson(`/estoque/ordens-manuais/${o.id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir');
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
    if (printMode === 'folha_saida') return 'Folha de Conferência — Saída (preenchimento manual)';
    return 'Folha de Conferência — Entrada (preenchimento manual)';
  }, [printing, printMode]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50 text-zinc-900">
      {/* Print layout */}
      {printing && (
        <div className="print-only p-6 text-black bg-white">
          <h1 className="text-xl font-bold mb-1">{printTitle}</h1>
          <p className="text-sm mb-4">
            {printing.orderNumber} · {printing.orderDate} · {printing.partnerName}
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
          {printMode !== 'ordem' && (
            <div className="mt-8 text-xs space-y-4">
              <p>Preenchimento físico — o Hub não registra esta conferência.</p>
              <div className="flex gap-16 pt-6">
                <div className="flex-1 border-t border-zinc-500 pt-1">Responsável 1</div>
                <div className="flex-1 border-t border-zinc-500 pt-1">Responsável 2</div>
              </div>
            </div>
          )}
          {printMode === 'ordem' && (
            <p className="mt-6 text-xs text-zinc-600">
              Registro Hub não movimenta estoque canônico. Após lançar no ERP, marque a ordem como lançada.
            </p>
          )}
        </div>
      )}

      <div className="no-print flex-1 flex flex-col min-h-0">
        <header className="bg-white border-b border-zinc-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onBackToHub}
            className="p-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg tracking-tight">Ordens Manuais</h1>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
              Entrada/saída de insumos · impressão física · Prev. Futura até lançar no ERP
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="p-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 cursor-pointer"
            title="Atualizar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => openCreate('saida')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 cursor-pointer"
          >
            <Plus size={16} /> Nova saída
          </button>
          <button
            type="button"
            onClick={() => openCreate('entrada')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-300 bg-white text-sm font-semibold hover:bg-zinc-50 cursor-pointer"
          >
            <Plus size={16} /> Nova entrada
          </button>
        </header>

        <div className="px-4 py-3 flex flex-wrap gap-2 items-center border-b border-zinc-200 bg-white shrink-0">
          <select
            className="text-sm border border-zinc-200 rounded-lg px-2 py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="OPEN">Abertas</option>
            <option value="POSTED">Lançadas no ERP</option>
            <option value="ALL">Todas</option>
          </select>
          <select
            className="text-sm border border-zinc-200 rounded-lg px-2 py-1.5"
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
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-zinc-200 rounded-lg"
              placeholder="Buscar nº, parceiro…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-center text-zinc-400 py-16 text-sm">Carregando…</div>
          ) : orders.length === 0 ? (
            <div className="text-center text-zinc-400 py-16 text-sm">Nenhuma ordem neste filtro.</div>
          ) : (
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-bold">Nº</th>
                    <th className="text-left px-3 py-2.5 font-bold">Tipo</th>
                    <th className="text-left px-3 py-2.5 font-bold">Data</th>
                    <th className="text-left px-3 py-2.5 font-bold">Parceiro</th>
                    <th className="text-left px-3 py-2.5 font-bold">Itens</th>
                    <th className="text-left px-3 py-2.5 font-bold">Status</th>
                    <th className="text-right px-3 py-2.5 font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                      <td className="px-3 py-2.5 font-mono font-semibold">{o.orderNumber}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                            o.kind === 'saida'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {o.kind === 'saida' ? 'Saída' : 'Entrada'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{o.orderDate}</td>
                      <td className="px-3 py-2.5 font-medium">{o.partnerName}</td>
                      <td className="px-3 py-2.5 text-zinc-500">{o.items.length}</td>
                      <td className="px-3 py-2.5">
                        {o.status === 'OPEN' ? (
                          <span className="text-blue-700 font-semibold">Aberta</span>
                        ) : (
                          <span className="text-zinc-500 font-semibold">Lançada ERP</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1 flex-wrap">
                          <button
                            type="button"
                            title="Imprimir ordem"
                            className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
                            onClick={() => startPrint(o, 'ordem')}
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            type="button"
                            title="Folha saída (papel)"
                            className="px-1.5 py-1 rounded-lg hover:bg-zinc-100 cursor-pointer text-[10px] font-bold text-amber-700"
                            onClick={() => startPrint(o, 'folha_saida')}
                          >
                            F.Saída
                          </button>
                          <button
                            type="button"
                            title="Folha entrada (papel)"
                            className="px-1.5 py-1 rounded-lg hover:bg-zinc-100 cursor-pointer text-[10px] font-bold text-emerald-700"
                            onClick={() => startPrint(o, 'folha_entrada')}
                          >
                            F.Entrada
                          </button>
                          {o.status === 'OPEN' && (
                            <>
                              <button
                                type="button"
                                title="Editar"
                                className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
                                onClick={() => openEdit(o)}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                title="Lançado no ERP"
                                className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 cursor-pointer"
                                onClick={() => markPosted(o)}
                              >
                                <CheckCircle2 size={14} />
                              </button>
                              <button
                                type="button"
                                title="Excluir"
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"
                                onClick={() => remove(o)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                          {o.status === 'POSTED' && (
                            <button
                              type="button"
                              title="Reabrir"
                              className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
                              onClick={() => reopen(o)}
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
            </div>
          )}
        </div>
      </div>

      {editorOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
              <h2 className="font-bold text-base">
                {editingId ? 'Editar ordem' : 'Nova ordem'} — {kind === 'saida' ? 'Saída' : 'Entrada'}
              </h2>
              <button type="button" className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer" onClick={() => setEditorOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Tipo</span>
                  <select
                    className="w-full border border-zinc-200 rounded-lg px-2 py-2"
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
                    className="w-full border border-zinc-200 rounded-lg px-2 py-2"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </label>
                <label className="space-y-1 sm:col-span-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Pessoa / empresa</span>
                  <input
                    className="w-full border border-zinc-200 rounded-lg px-2 py-2"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    placeholder="Destinatário ou origem"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-500">Observações</span>
                <input
                  className="w-full border border-zinc-200 rounded-lg px-2 py-2"
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
                        className="w-full border border-zinc-200 rounded-lg px-2 py-1.5 font-mono text-xs"
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
                        <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-40 overflow-auto">
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
                      className="col-span-5 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs"
                      placeholder="Descrição"
                      value={line.description}
                      onChange={(e) =>
                        setLines((p) =>
                          p.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l)),
                        )
                      }
                    />
                    <input
                      className="col-span-2 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs text-right"
                      placeholder="Qty"
                      value={line.qty}
                      onChange={(e) =>
                        setLines((p) => p.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)))
                      }
                    />
                    <input
                      className="col-span-1 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs"
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
                onClick={saveOrder}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
