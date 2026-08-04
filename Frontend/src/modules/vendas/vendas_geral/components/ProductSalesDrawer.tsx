import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Truck, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { cn } from '../../../geral/lib/utils';
import type {
  PendingPurchaseOrderItem,
  ProductDetails,
  ProductFaltaItem,
} from '../lib/types';
import {
  formatSalesDate,
  salesOrderStatusColor,
  salesOrderStatusLabel,
} from '../lib/salesStatusUi';

interface ProductSalesDrawerProps {
  open: boolean;
  productCode: string | null;
  onClose: () => void;
  onOpenOrder?: (nPedido: number, dPedido: string) => void;
}

export function ProductSalesDrawer({
  open,
  productCode,
  onClose,
  onOpenOrder,
}: ProductSalesDrawerProps) {
  const [details, setDetails] = useState<ProductDetails | null>(null);
  const [pending, setPending] = useState<{
    pending_sales_orders: ProductFaltaItem[];
    in_transit_purchase_orders: PendingPurchaseOrderItem[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'geral' | 'pedidos' | 'compras'>('geral');

  useEffect(() => {
    if (!open || !productCode) {
      setDetails(null);
      setPending(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setTab('geral');
      setPending(null);
      try {
        const res = await apiFetch(`/produtos/${encodeURIComponent(productCode)}/detalhes`);
        if (!res.ok) throw new Error('Produto não localizado');
        const data = await res.json();
        if (cancelled) return;
        setDetails({
          code: data.code,
          description: data.description,
          unit: data.unit || 'UN',
          currentStock: data.currentStock ?? 0,
          salesYoy: data.salesYoy || [],
          monthlySales: data.monthlySales || [],
        });
        setPendingLoading(true);
        const resPending = await apiFetch(
          `/produtos/${encodeURIComponent(productCode)}/pedidos-pendentes`,
        );
        if (resPending.ok && !cancelled) {
          setPending(await resPending.json());
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Erro ao carregar produto');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPendingLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, productCode]);

  if (!open) return null;

  const maxMonthly = Math.max(1, ...(details?.monthlySales.map((m) => m.qty) || [1]));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
        <div className="h-16 border-b border-zinc-200 px-6 flex items-center justify-between shrink-0 bg-zinc-50">
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">
              Produto
            </span>
            <h3 className="font-extrabold text-zinc-900 text-sm truncate mt-0.5">
              {loading ? 'Carregando…' : details?.description || error || productCode}
            </h3>
            {details && (
              <span className="font-mono text-[10px] text-zinc-400">{details.code}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="border-b border-zinc-150 px-6 flex bg-zinc-50/50 shrink-0">
          {(
            [
              ['geral', 'Geral'],
              ['pedidos', 'Pedidos abertos'],
              ['compras', 'Compras'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5',
                tab === id
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-450 hover:text-zinc-700',
              )}
            >
              {label}
              {id === 'pedidos' && pending && pending.pending_sales_orders.length > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[9px] font-bold">
                  {pending.pending_sales_orders.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-400">
              <RefreshCw className="h-8 w-8 animate-spin" />
            </div>
          )}
          {error && !loading && (
            <div className="flex items-center gap-2 text-rose-600 text-sm font-semibold">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {details && !loading && tab === 'geral' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-zinc-200 rounded-xl p-4">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Estoque</span>
                  <p className="text-xl font-extrabold mt-1">
                    {details.currentStock.toLocaleString('pt-BR')}{' '}
                    <span className="text-xs text-zinc-400">{details.unit}</span>
                  </p>
                </div>
                <div className="border border-zinc-200 rounded-xl p-4">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">YoY</span>
                  <div className="mt-2 space-y-1">
                    {details.salesYoy.slice(0, 4).map((y) => (
                      <div key={y.year} className="flex justify-between text-xs">
                        <span className="text-zinc-500">{y.year}</span>
                        <span className="font-bold">{y.totalQty.toLocaleString('pt-BR')} un</span>
                      </div>
                    ))}
                    {details.salesYoy.length === 0 && (
                      <span className="text-xs text-zinc-400">Sem histórico</span>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-700 mb-3">Vendas mensais</h4>
                <div className="flex items-end gap-1 h-28">
                  {details.monthlySales.slice(-12).map((m) => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div
                        className="w-full bg-zinc-800 rounded-t min-h-[2px]"
                        style={{ height: `${Math.max(4, (m.qty / maxMonthly) * 100)}%` }}
                        title={`${m.month}: ${m.qty}`}
                      />
                      <span className="text-[8px] text-zinc-400 truncate w-full text-center">
                        {m.month.slice(5) || m.month}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === 'pedidos' && (
            pendingLoading ? (
              <RefreshCw className="h-6 w-6 animate-spin text-zinc-400 mx-auto mt-12" />
            ) : !pending?.pending_sales_orders.length ? (
              <p className="text-sm text-zinc-400 text-center py-12">Nenhum pedido aberto neste produto.</p>
            ) : (
              <div className="border border-zinc-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500 font-bold">
                    <tr>
                      <th className="px-3 py-2">Pedido</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2 text-right">Falta</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {pending.pending_sales_orders.map((p) => (
                      <tr
                        key={`${p.n_pedido}|${p.d_pedido}`}
                        className={cn(
                          'hover:bg-zinc-50/50',
                          onOpenOrder && 'cursor-pointer',
                        )}
                        onClick={() => onOpenOrder?.(p.n_pedido, p.d_pedido)}
                      >
                        <td className="px-3 py-2 font-bold">
                          #{p.n_pedido}
                          <span className="block text-[10px] font-normal text-zinc-400">
                            {formatSalesDate(p.d_pedido)}
                          </span>
                        </td>
                        <td className="px-3 py-2 truncate max-w-[160px]">{p.c_nome || '—'}</td>
                        <td className="px-3 py-2 text-right font-extrabold text-rose-600">{p.falta}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[9px] font-bold border',
                              salesOrderStatusColor(p.c_status),
                            )}
                          >
                            {salesOrderStatusLabel(p.c_status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          {tab === 'compras' && (
            pendingLoading ? (
              <RefreshCw className="h-6 w-6 animate-spin text-zinc-400 mx-auto mt-12" />
            ) : !pending?.in_transit_purchase_orders.length ? (
              <p className="text-sm text-zinc-400 text-center py-12">Nenhuma compra em trânsito.</p>
            ) : (
              <div className="space-y-2">
                {pending.in_transit_purchase_orders.map((po, idx) => (
                  <div
                    key={`${po.n_pedido}-${idx}`}
                    className="border border-zinc-200 rounded-xl p-3 flex items-center gap-3 text-xs"
                  >
                    <Truck className="h-4 w-4 text-sky-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-zinc-800">PO #{po.n_pedido}</p>
                      <p className="text-zinc-500 truncate">{po.c_nome_f || 'Fornecedor'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold">{po.n_pendente} un</p>
                      <p className="text-[10px] text-zinc-400">
                        prev. {formatSalesDate(po.d_previsao)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
