import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  ShoppingCart,
  AlertTriangle,
} from 'lucide-react';
import { apiJson } from '../../geral/lib/http';
import AppLayout from '../../geral/components/layout/AppLayout';

type Tab = 'reposicao' | 'demandas';

interface DemandItem {
  id: string;
  itemCode: string;
  itemDescription?: string | null;
  qtyRequested: number;
  qtyReceived: number;
  unitCost?: number | null;
}

interface Demand {
  id: string;
  status: string;
  title?: string | null;
  notes?: string | null;
  createdAt: string;
  items: DemandItem[];
}

interface ReplenishItem {
  itemCode: string;
  qtyOnHand: number;
  minQty: number;
  suggestedBuyQty: number;
  avgDailyOut30: number;
}

interface Props {
  onBackToHub: () => void;
}

export default function ComprasAlmoxarifadoView({ onBackToHub }: Props) {
  const [tab, setTab] = useState<Tab>('demandas');
  const [demands, setDemands] = useState<Demand[]>([]);
  const [replenish, setReplenish] = useState<ReplenishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, r] = await Promise.all([
        apiJson<{ demands: Demand[] }>('/almox/demands'),
        apiJson<{ items: ReplenishItem[] }>('/almox/replenishment'),
      ]);
      setDemands(d.demands ?? []);
      setReplenish(r.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const fromMin = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiJson('/almox/demands/from-min', { method: 'POST' });
      setTab('demandas');
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar demanda');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setBusy(true);
    try {
      await apiJson(`/almox/demands/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar status');
    } finally {
      setBusy(false);
    }
  };

  const openReceive = (d: Demand) => {
    setReceiveId(d.id);
    const map: Record<string, string> = {};
    d.items.forEach((it) => {
      map[it.itemCode] = String(Math.max(0, it.qtyRequested - it.qtyReceived));
    });
    setReceiveQty(map);
  };

  const confirmReceive = async () => {
    if (!receiveId) return;
    setBusy(true);
    setError(null);
    try {
      const items = Object.entries(receiveQty)
        .map(([itemCode, qty]) => ({
          itemCode,
          qtyReceived: Number(qty) || 0,
        }))
        .filter((x) => x.qtyReceived > 0);
      await apiJson(`/almox/demands/${receiveId}/receive`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      setReceiveId(null);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro no recebimento');
    } finally {
      setBusy(false);
    }
  };

  const openCount = demands.filter((d) => d.status === 'aberta' || d.status === 'pedida').length;

  const sidebarItems = [
    {
      id: 'reposicao',
      label: 'Abaixo do mínimo',
      icon: AlertTriangle,
      badge: replenish.length || undefined,
    },
    {
      id: 'demandas',
      label: 'Demandas',
      icon: ClipboardList,
      badge: openCount || undefined,
    },
  ];

  return (
    <AppLayout
      moduleTitle="Almoxarifado"
      moduleSubtitle="Compras · demandas locais"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      headerActions={
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || replenish.length === 0}
            onClick={fromMin}
            className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Gerar de mínimos
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      }
    >
      <div className="w-full max-w-none space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <div className={tab !== 'reposicao' ? 'hidden' : 'space-y-3'}>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-zinc-700" />
            <h2 className="font-semibold text-zinc-900">Abaixo do mínimo ({replenish.length})</h2>
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
            {replenish.length === 0 ? (
              <p className="text-sm text-zinc-400 px-4 py-10 text-center">
                Nada pendente de reposição.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-right">Mín</th>
                    <th className="px-4 py-3 text-right">Média/dia</th>
                    <th className="px-4 py-3 text-right">Comprar</th>
                  </tr>
                </thead>
                <tbody>
                  {replenish.map((r) => (
                    <tr key={r.itemCode} className="border-t border-zinc-100">
                      <td className="px-4 py-2.5 font-mono text-xs">{r.itemCode}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600 font-semibold">
                        {r.qtyOnHand.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.minQty.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {r.avgDailyOut30.toFixed(3)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        {r.suggestedBuyQty.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className={tab !== 'demandas' ? 'hidden' : 'space-y-3'}>
          {loading && demands.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-zinc-400" />
            </div>
          ) : (
            demands.map((d) => (
              <div
                key={d.id}
                className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-zinc-900">
                      {d.title || `Demanda ${(d.id || '').slice(0, 8)}`}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {(d.createdAt || '').slice(0, 19).replace('T', ' ')} · {d.status}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {d.status === 'aberta' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus(d.id, 'pedida')}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 font-semibold hover:bg-zinc-50 cursor-pointer"
                      >
                        Marcar pedida
                      </button>
                    )}
                    {(d.status === 'aberta' || d.status === 'pedida') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openReceive(d)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Receber
                      </button>
                    )}
                    {d.status !== 'cancelada' && d.status !== 'recebida' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus(d.id, 'cancelada')}
                        className="text-xs px-2.5 py-1.5 rounded-lg text-red-600 font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
                <ul className="text-sm divide-y divide-zinc-100 border border-zinc-100 rounded-xl overflow-hidden">
                  {d.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex justify-between gap-3 px-3 py-2 bg-zinc-50/50"
                    >
                      <div>
                        <div className="font-mono text-xs">{it.itemCode}</div>
                        <div className="text-zinc-600">{it.itemDescription}</div>
                      </div>
                      <div className="text-right tabular-nums text-xs text-zinc-600">
                        ped {it.qtyRequested.toFixed(2)}
                        <br />
                        rec {it.qtyReceived.toFixed(2)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {!loading && demands.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-8">
              Nenhuma demanda. Use “Gerar de mínimos” quando houver itens em falta.
            </p>
          )}
        </div>
      </div>

      {receiveId && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-lg text-zinc-900">Receber demanda</h3>
            <p className="text-sm text-zinc-500">
              Confirma entrada no almoxarifado local para as quantidades abaixo.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Object.keys(receiveQty).map((code) => (
                <label key={code} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-mono text-xs">{code}</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={receiveQty[code]}
                    onChange={(e) =>
                      setReceiveQty((prev) => ({ ...prev, [code]: e.target.value }))
                    }
                    className="w-28 border border-zinc-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReceiveId(null)}
                className="px-3 py-2 text-sm rounded-xl border border-zinc-200 font-semibold cursor-pointer hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmReceive}
                className="px-3 py-2 text-sm rounded-xl bg-zinc-900 text-white font-semibold disabled:opacity-60 cursor-pointer"
              >
                Confirmar entradas
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
