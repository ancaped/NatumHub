import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, ClipboardList, PackageX, Pencil, Plus, Printer,
  RefreshCw, Search, Trash2, X,
} from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import { apiJson } from '../../geral/lib/http';
import {
  cleanupPrintIframes,
  disposicaoLabel,
  printDevolucaoFicha,
  printErpPending,
} from './printHelpers';

type Status =
  | 'rascunho'
  | 'recebido'
  | 'em_conferencia'
  | 'disposto'
  | 'parcialmente_lancado'
  | 'finalizado';

type Disposicao =
  | 'retornar_estoque'
  | 'trocar_embalagem'
  | 'trocar_rotulo'
  | 'descartar'
  | 'quarentena'
  | 'outro'
  | '';

type Filtro = 'abertas' | 'finalizadas' | 'all';
type TabId = 'lista' | 'editor';

type DevolucaoItem = {
  id?: number;
  itemCode: string;
  description: string;
  qty: number;
  lotes: string;
  qtyConferida?: number | null;
  analiseObs?: string | null;
  disposicao?: string | null;
  disposicaoObs?: string | null;
  erpStatus: string;
  erpBy?: string | null;
  erpAt?: string | null;
  sortOrder?: number;
};

type Devolucao = {
  id: number;
  registerNumber: string;
  status: Status;
  clientCode: string;
  clientName: string;
  returnDate: string;
  nfNumber: string;
  receiverName: string;
  carrierName: string;
  notes?: string | null;
  receivedBy?: string | null;
  receivedAt?: string | null;
  cqBy?: string | null;
  cqAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  items: DevolucaoItem[];
};

type ClientHit = { n_codigo: number; c_nome?: string | null };

type DraftLine = {
  itemCode: string;
  description: string;
  qty: string;
  lotes: string;
  qtyConferida: string;
  analiseObs: string;
  disposicao: Disposicao;
  disposicaoObs: string;
};

const DISPOSICOES: { value: Disposicao; label: string }[] = [
  { value: 'retornar_estoque', label: 'Retornar estoque' },
  { value: 'trocar_embalagem', label: 'Trocar embalagem' },
  { value: 'trocar_rotulo', label: 'Trocar rótulo' },
  { value: 'descartar', label: 'Descartar' },
  { value: 'quarentena', label: 'Quarentena' },
  { value: 'outro', label: 'Outro' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(): DraftLine {
  return {
    itemCode: '',
    description: '',
    qty: '',
    lotes: '',
    qtyConferida: '',
    analiseObs: '',
    disposicao: '',
    disposicaoObs: '',
  };
}

function statusLabel(s: Status) {
  const map: Record<Status, string> = {
    rascunho: 'Rascunho',
    recebido: 'Recebido',
    em_conferencia: 'Em conferência',
    disposto: 'Disposto',
    parcialmente_lancado: 'Parcialmente lançado',
    finalizado: 'Finalizado',
  };
  return map[s] || s;
}

function statusClass(s: Status) {
  if (s === 'finalizado') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (s === 'rascunho') return 'bg-zinc-50 text-zinc-700 border-zinc-200';
  if (s === 'em_conferencia') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-sky-50 text-sky-800 border-sky-200';
}

export default function DevolucoesView({ onBackToHub }: { onBackToHub: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('lista');
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Devolucao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [current, setCurrent] = useState<Devolucao | null>(null);
  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [returnDate, setReturnDate] = useState(todayIso());
  const [nfNumber, setNfNumber] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const [clientQuery, setClientQuery] = useState('');
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ filtro });
      if (search.trim()) params.set('q', search.trim());
      const data = await apiJson<Devolucao[]>(`/qualidade/devolucoes?${params}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [filtro, search]);

  useEffect(() => {
    cleanupPrintIframes();
  }, []);

  useEffect(() => {
    if (activeTab === 'lista') void loadList();
  }, [activeTab, loadList]);

  useEffect(() => {
    (window as unknown as { __current_page__?: string }).__current_page__ =
      activeTab === 'lista' ? 'Lista' : editingId ? 'Editar' : 'Nova';
  }, [activeTab, editingId]);

  useEffect(() => {
    if (!clientQuery.trim() || clientQuery.trim().length < 2) {
      setClientHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const hits = await apiJson<ClientHit[]>(
          `/vendas/clientes?search=${encodeURIComponent(clientQuery.trim())}&days=3650`,
        );
        setClientHits(Array.isArray(hits) ? hits : []);
      } catch {
        setClientHits([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [clientQuery]);

  const openCreate = () => {
    setEditingId(null);
    setCurrent(null);
    setClientCode('');
    setClientName('');
    setReturnDate(todayIso());
    setNfNumber('');
    setReceiverName('');
    setCarrierName('');
    setNotes('');
    setLines([emptyLine()]);
    setActiveTab('editor');
  };

  const openEdit = async (d: Devolucao) => {
    setBusy(true);
    setError('');
    try {
      const full = await apiJson<Devolucao>(`/qualidade/devolucoes/${d.id}`);
      if (!full || typeof full !== 'object' || !full.id) {
        throw new Error('Resposta inválida ao abrir devolução');
      }
      const items = Array.isArray(full.items) ? full.items : [];
      setEditingId(full.id);
      setCurrent({ ...full, items });
      setClientCode(full.clientCode || '');
      setClientName(full.clientName || '');
      setReturnDate(full.returnDate || todayIso());
      setNfNumber(full.nfNumber || '');
      setReceiverName(full.receiverName || '');
      setCarrierName(full.carrierName || '');
      setNotes(full.notes || '');
      setLines(
        items.length
          ? items.map((it) => ({
              itemCode: it.itemCode,
              description: it.description,
              qty: String(it.qty),
              lotes: it.lotes || '',
              qtyConferida: it.qtyConferida != null ? String(it.qtyConferida) : '',
              analiseObs: it.analiseObs || '',
              disposicao: (it.disposicao as Disposicao) || '',
              disposicaoObs: it.disposicaoObs || '',
            }))
          : [emptyLine()],
      );
      setActiveTab('editor');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir');
    } finally {
      setBusy(false);
    }
  };

  const isDraft = !current || current.status === 'rascunho';
  const canConferir =
    current && (current.status === 'recebido' || current.status === 'em_conferencia');
  const canErp =
    current &&
    ['disposto', 'parcialmente_lancado', 'finalizado'].includes(current.status);

  const saveDraft = async () => {
    const items = lines
      .filter((l) => l.itemCode.trim() && Number(l.qty) > 0)
      .map((l) => ({
        itemCode: l.itemCode.trim(),
        description: l.description.trim(),
        qty: Number(l.qty),
        lotes: l.lotes.trim(),
      }));
    if (!clientName.trim()) {
      setError('Informe o nome do cliente');
      return;
    }
    if (items.length === 0) {
      setError('Informe ao menos um item');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        clientCode: clientCode.trim(),
        clientName: clientName.trim(),
        returnDate,
        nfNumber: nfNumber.trim(),
        receiverName: receiverName.trim(),
        carrierName: carrierName.trim(),
        notes: notes.trim() || null,
        items,
      };
      const saved = editingId
        ? await apiJson<Devolucao>(`/qualidade/devolucoes/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await apiJson<Devolucao>('/qualidade/devolucoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      setEditingId(saved.id);
      setCurrent(saved);
      await openEdit(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const receber = async () => {
    const items = lines
      .filter((l) => l.itemCode.trim() && Number(l.qty) > 0)
      .map((l) => ({
        itemCode: l.itemCode.trim(),
        description: l.description.trim(),
        qty: Number(l.qty),
        lotes: l.lotes.trim(),
      }));
    if (!clientName.trim()) {
      setError('Informe o nome do cliente');
      return;
    }
    if (items.length === 0) {
      setError('Informe ao menos um item');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = {
        clientCode: clientCode.trim(),
        clientName: clientName.trim(),
        returnDate,
        nfNumber: nfNumber.trim(),
        receiverName: receiverName.trim(),
        carrierName: carrierName.trim(),
        notes: notes.trim() || null,
        items,
      };
      let id = editingId;
      if (!id || !current || current.status === 'rascunho') {
        const saved = id
          ? await apiJson<Devolucao>(`/qualidade/devolucoes/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await apiJson<Devolucao>('/qualidade/devolucoes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
        id = saved.id;
        setEditingId(id);
      }
      const received = await apiJson<Devolucao>(`/qualidade/devolucoes/${id}/receber`, {
        method: 'POST',
      });
      await openEdit(received);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao receber');
    } finally {
      setBusy(false);
    }
  };

  const conferirLinha = async (idx: number) => {
    if (!current?.items[idx]?.id) return;
    const line = lines[idx];
    const itemId = current.items[idx].id!;
    setBusy(true);
    setError('');
    try {
      const saved = await apiJson<Devolucao>(
        `/qualidade/devolucoes/${current.id}/itens/${itemId}/conferir`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            qtyConferida: line.qtyConferida ? Number(line.qtyConferida) : null,
            analiseObs: line.analiseObs || null,
            disposicao: line.disposicao || null,
            disposicaoObs: line.disposicaoObs || null,
          }),
        },
      );
      const items = Array.isArray(saved.items) ? saved.items : [];
      setCurrent({ ...saved, items });
      setLines(
        items.map((it) => ({
          itemCode: it.itemCode,
          description: it.description,
          qty: String(it.qty),
          lotes: it.lotes || '',
          qtyConferida: it.qtyConferida != null ? String(it.qtyConferida) : '',
          analiseObs: it.analiseObs || '',
          disposicao: (it.disposicao as Disposicao) || '',
          disposicaoObs: it.disposicaoObs || '',
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao conferir item');
    } finally {
      setBusy(false);
    }
  };

  const fecharCq = async () => {
    if (!current) return;
    setBusy(true);
    try {
      // salva conferências pendentes
      for (let i = 0; i < lines.length; i++) {
        if (current.items[i]?.id && lines[i].disposicao) {
          await apiJson(`/qualidade/devolucoes/${current.id}/itens/${current.items[i].id}/conferir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              qtyConferida: lines[i].qtyConferida ? Number(lines[i].qtyConferida) : null,
              analiseObs: lines[i].analiseObs || null,
              disposicao: lines[i].disposicao || null,
              disposicaoObs: lines[i].disposicaoObs || null,
            }),
          });
        }
      }
      const saved = await apiJson<Devolucao>(`/qualidade/devolucoes/${current.id}/fechar-cq`, {
        method: 'POST',
      });
      await openEdit(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao fechar CQ');
    } finally {
      setBusy(false);
    }
  };

  const toggleErp = async (idx: number) => {
    if (!current?.items[idx]?.id) return;
    const item = current.items[idx];
    const next = item.erpStatus === 'lancado' ? 'em_processo' : 'lancado';
    setBusy(true);
    try {
      const saved = await apiJson<Devolucao>(
        `/qualidade/devolucoes/${current.id}/itens/${item.id}/erp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        },
      );
      await openEdit(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar ERP');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: Devolucao) => {
    if (!window.confirm(`Excluir rascunho ${d.registerNumber}?`)) return;
    try {
      await apiJson(`/qualidade/devolucoes/${d.id}`, { method: 'DELETE' });
      await loadList();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir');
    }
  };

  const sidebarItems = [
    { id: 'lista', label: 'Devoluções', icon: ClipboardList },
    { id: 'editor', label: editingId ? 'Detalhe' : 'Nova', icon: PackageX },
  ];

  const headerActions =
    activeTab === 'lista' ? (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void loadList()}
          className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer"
        >
          <Plus size={14} /> Nova devolução
        </button>
      </div>
    ) : current ? (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold cursor-pointer"
          onClick={() => printDevolucaoFicha(current)}
        >
          <Printer size={14} /> Ficha
        </button>
        {canErp && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-bold cursor-pointer"
            onClick={() => printErpPending(current)}
          >
            <Printer size={14} /> A lançar ERP
          </button>
        )}
      </div>
    ) : null;

  return (
    <AppLayout
      moduleTitle="Devoluções"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id) => {
        if (id === 'lista') {
          setActiveTab('lista');
          void loadList();
        } else if (id === 'editor' && !editingId && !current) {
          openCreate();
        } else {
          setActiveTab('editor');
        }
      }}
      headerActions={headerActions}
    >
      <div className="flex flex-col gap-3 h-full min-h-0">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === 'lista' && (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-0.5">
                {(
                  [
                    ['abertas', 'Abertas'],
                    ['finalizadas', 'Finalizadas'],
                    ['all', 'Todas'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      filtro === id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'
                    }`}
                    onClick={() => setFiltro(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[180px] max-w-md">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 text-sm border border-zinc-200 rounded-xl bg-white"
                  placeholder="Buscar nº, cliente, NF…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm min-h-0">
              <div className="h-full overflow-auto">
                {loading ? (
                  <div className="text-center text-zinc-400 py-16 text-sm">Carregando…</div>
                ) : rows.length === 0 ? (
                  <div className="text-center text-zinc-400 py-16 text-sm">Nenhuma devolução.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2.5 font-bold">Nº</th>
                        <th className="text-left px-3 py-2.5 font-bold">Cliente</th>
                        <th className="text-left px-3 py-2.5 font-bold">Data</th>
                        <th className="text-left px-3 py-2.5 font-bold">NF</th>
                        <th className="text-left px-3 py-2.5 font-bold">Status</th>
                        <th className="text-left px-3 py-2.5 font-bold">Itens</th>
                        <th className="text-right px-3 py-2.5 font-bold">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d) => (
                        <tr key={d.id} className="border-t border-zinc-100 hover:bg-zinc-50/80">
                          <td className="px-3 py-2.5 font-mono font-semibold">{d.registerNumber}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-zinc-800 truncate max-w-[220px]">
                              {d.clientName}
                            </div>
                            {d.clientCode && (
                              <div className="text-[10px] text-zinc-400 font-mono">{d.clientCode}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-600">{d.returnDate}</td>
                          <td className="px-3 py-2.5 text-zinc-600">{d.nfNumber || '—'}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full font-bold text-[10px] border ${statusClass(d.status)}`}
                            >
                              {statusLabel(d.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-zinc-500">{d.items?.length ?? 0}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                className="p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
                                onClick={() => void openEdit(d)}
                                title="Abrir"
                              >
                                <Pencil size={14} />
                              </button>
                              {d.status === 'rascunho' && (
                                <button
                                  type="button"
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"
                                  onClick={() => void remove(d)}
                                >
                                  <Trash2 size={14} />
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

        {activeTab === 'editor' && (
          <div className="flex-1 overflow-auto space-y-3 pb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 cursor-pointer"
                onClick={() => {
                  setActiveTab('lista');
                  void loadList();
                }}
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <p className="font-bold text-sm text-zinc-900">
                  {current
                    ? `${current.registerNumber} · ${statusLabel(current.status)}`
                    : 'Nova devolução'}
                </p>
                {current?.receivedBy && (
                  <p className="text-[11px] text-zinc-500">
                    Recebido por {current.receivedBy}
                    {current.cqBy ? ` · CQ: ${current.cqBy}` : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                <label className="space-y-1 sm:col-span-2 relative">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Cliente</span>
                  <div className="flex gap-2">
                    <input
                      className="w-28 border border-zinc-200 rounded-xl px-2.5 py-2 font-mono text-xs"
                      placeholder="Código"
                      value={clientCode}
                      disabled={!isDraft}
                      onChange={(e) => setClientCode(e.target.value)}
                    />
                    <input
                      className="flex-1 border border-zinc-200 rounded-xl px-2.5 py-2"
                      placeholder="Nome do cliente"
                      value={clientName}
                      disabled={!isDraft}
                      onChange={(e) => {
                        setClientName(e.target.value);
                        setClientQuery(e.target.value);
                      }}
                    />
                  </div>
                  {isDraft && clientHits.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-40 overflow-auto">
                      {clientHits.map((h) => (
                        <button
                          key={h.n_codigo}
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 cursor-pointer"
                          onClick={() => {
                            setClientCode(String(h.n_codigo));
                            setClientName(h.c_nome || '');
                            setClientHits([]);
                            setClientQuery('');
                          }}
                        >
                          <span className="font-mono font-semibold">{h.n_codigo}</span>
                          <span className="ml-2 text-zinc-600">{h.c_nome}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Data</span>
                  <input
                    type="date"
                    className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                    value={returnDate}
                    disabled={!isDraft}
                    onChange={(e) => setReturnDate(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Nº NF</span>
                  <input
                    className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                    value={nfNumber}
                    disabled={!isDraft}
                    onChange={(e) => setNfNumber(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Recebedor</span>
                  <input
                    className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                    value={receiverName}
                    disabled={!isDraft}
                    onChange={(e) => setReceiverName(e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Transportadora</span>
                  <input
                    className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                    value={carrierName}
                    disabled={!isDraft}
                    onChange={(e) => setCarrierName(e.target.value)}
                  />
                </label>
                <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <span className="text-[10px] font-bold uppercase text-zinc-500">Observações</span>
                  <input
                    className="w-full border border-zinc-200 rounded-xl px-2.5 py-2"
                    value={notes}
                    disabled={!isDraft}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
                <span className="text-[10px] font-bold uppercase text-zinc-500">Itens</span>
                {isDraft && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-zinc-700 hover:underline cursor-pointer"
                    onClick={() => setLines((p) => [...p, emptyLine()])}
                  >
                    + linha
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="text-left px-2 py-2 font-bold">Código</th>
                      <th className="text-left px-2 py-2 font-bold">Descrição / Conferência</th>
                      <th className="text-right px-2 py-2 font-bold">Qtde</th>
                      <th className="text-left px-2 py-2 font-bold">Lote(s)</th>
                      <th className="text-left px-2 py-2 font-bold">Disposição</th>
                      <th className="text-left px-2 py-2 font-bold">ERP</th>
                      <th className="text-right px-2 py-2 font-bold" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx} className="border-t border-zinc-100 align-top">
                        <td className="px-2 py-2">
                          <input
                            className="w-24 border border-zinc-200 rounded-lg px-2 py-1 font-mono"
                            value={line.itemCode}
                            disabled={!isDraft}
                            onChange={(e) =>
                              setLines((p) =>
                                p.map((l, i) => (i === idx ? { ...l, itemCode: e.target.value } : l)),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2 space-y-1">
                          <input
                            className="w-full border border-zinc-200 rounded-lg px-2 py-1"
                            placeholder="Descrição"
                            value={line.description}
                            disabled={!isDraft}
                            onChange={(e) =>
                              setLines((p) =>
                                p.map((l, i) =>
                                  i === idx ? { ...l, description: e.target.value } : l,
                                ),
                              )
                            }
                          />
                          {(canConferir || canErp || current?.status === 'em_conferencia') && (
                            <div className="flex gap-1">
                              <input
                                className="w-20 border border-zinc-200 rounded-lg px-2 py-1 text-right"
                                placeholder="Qtde conf."
                                value={line.qtyConferida}
                                disabled={!canConferir}
                                onChange={(e) =>
                                  setLines((p) =>
                                    p.map((l, i) =>
                                      i === idx ? { ...l, qtyConferida: e.target.value } : l,
                                    ),
                                  )
                                }
                              />
                              <input
                                className="flex-1 border border-zinc-200 rounded-lg px-2 py-1"
                                placeholder="Análise / obs. CQ"
                                value={line.analiseObs}
                                disabled={!canConferir}
                                onChange={(e) =>
                                  setLines((p) =>
                                    p.map((l, i) =>
                                      i === idx ? { ...l, analiseObs: e.target.value } : l,
                                    ),
                                  )
                                }
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="w-16 border border-zinc-200 rounded-lg px-2 py-1 text-right"
                            value={line.qty}
                            disabled={!isDraft}
                            onChange={(e) =>
                              setLines((p) =>
                                p.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="w-28 border border-zinc-200 rounded-lg px-2 py-1"
                            value={line.lotes}
                            disabled={!isDraft}
                            onChange={(e) =>
                              setLines((p) =>
                                p.map((l, i) => (i === idx ? { ...l, lotes: e.target.value } : l)),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2 space-y-1">
                          {canConferir ? (
                            <>
                              <select
                                className="w-full border border-zinc-200 rounded-lg px-2 py-1"
                                value={line.disposicao}
                                onChange={(e) =>
                                  setLines((p) =>
                                    p.map((l, i) =>
                                      i === idx
                                        ? { ...l, disposicao: e.target.value as Disposicao }
                                        : l,
                                    ),
                                  )
                                }
                              >
                                <option value="">—</option>
                                {DISPOSICOES.map((d) => (
                                  <option key={d.value} value={d.value}>
                                    {d.label}
                                  </option>
                                ))}
                              </select>
                              {line.disposicao === 'outro' && (
                                <input
                                  className="w-full border border-zinc-200 rounded-lg px-2 py-1"
                                  placeholder="Detalhe"
                                  value={line.disposicaoObs}
                                  onChange={(e) =>
                                    setLines((p) =>
                                      p.map((l, i) =>
                                        i === idx ? { ...l, disposicaoObs: e.target.value } : l,
                                      ),
                                    )
                                  }
                                />
                              )}
                              <button
                                type="button"
                                className="text-[10px] font-bold text-emerald-700 hover:underline cursor-pointer"
                                onClick={() => void conferirLinha(idx)}
                              >
                                Salvar linha
                              </button>
                            </>
                          ) : (
                            <span className="text-zinc-600">
                              {disposicaoLabel(line.disposicao || null)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {canErp ? (
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                                current?.items[idx]?.erpStatus === 'lancado'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                              onClick={() => void toggleErp(idx)}
                            >
                              {current?.items[idx]?.erpStatus === 'lancado' ? (
                                <>
                                  <CheckCircle2 size={12} /> Lançado
                                </>
                              ) : (
                                'Em processo'
                              )}
                            </button>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {isDraft && (
                            <button
                              type="button"
                              className="p-1 text-zinc-400 hover:text-red-600 cursor-pointer"
                              onClick={() =>
                                setLines((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== idx)))
                              }
                            >
                              <X size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              {isDraft && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-3 py-2 rounded-xl border border-zinc-200 text-sm font-semibold cursor-pointer disabled:opacity-50"
                    onClick={() => void saveDraft()}
                  >
                    Salvar rascunho
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
                    onClick={() => void receber()}
                  >
                    Receber (assinar)
                  </button>
                </>
              )}
              {canConferir && (
                <button
                  type="button"
                  disabled={busy}
                  className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
                  onClick={() => void fecharCq()}
                >
                  Fechar CQ (assinar)
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
