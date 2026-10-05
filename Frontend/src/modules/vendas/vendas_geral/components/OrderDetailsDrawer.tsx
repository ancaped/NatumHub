import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Package } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { cn } from '../../../geral/lib/utils';
import type { SalesOrder } from '../lib/types';
import {
  formatSalesCurrency,
  formatSalesDate,
  salesOrderStatusColor,
  salesOrderStatusLabel,
} from '../lib/salesStatusUi';

interface OrderDetailsDrawerProps {
  open: boolean;
  nPedido: number | null;
  dPedido: string | null;
  onClose: () => void;
  onOpenProduct?: (code: string) => void;
}

export function OrderDetailsDrawer({
  open,
  nPedido,
  dPedido,
  onClose,
  onOpenProduct,
}: OrderDetailsDrawerProps) {
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'itens' | 'resumo'>('itens');

  useEffect(() => {
    if (!open || nPedido == null || !dPedido) {
      setOrder(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setTab('itens');
      try {
        const d = dPedido.length >= 10 ? dPedido.slice(0, 10) : dPedido;
        const res = await apiFetch(
          `/vendas/pedidos/detalhe?n_pedido=${nPedido}&d_pedido=${encodeURIComponent(d)}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Pedido não encontrado');
        }
        const data = await res.json();
        if (!cancelled) setOrder(data);
      } catch (e: any) {
        if (!cancelled) {
          setOrder(null);
          setError(e?.message || 'Erro ao carregar pedido');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, nPedido, dPedido]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
        <div className="h-16 border-b border-zinc-200 px-6 flex items-center justify-between shrink-0 bg-zinc-50">
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">
              Pedido de venda
            </span>
            <h3 className="font-extrabold text-zinc-900 text-sm truncate mt-0.5">
              {loading
                ? 'Carregando…'
                : order
                  ? `#${order.n_pedido} · ${formatSalesDate(order.d_pedido)}`
                  : error || '—'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {order && !loading && (
          <div className="px-6 py-3 border-b border-zinc-100 bg-white flex flex-wrap items-center gap-2 text-xs">
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase',
                salesOrderStatusColor(order.c_status),
              )}
            >
              {salesOrderStatusLabel(order.c_status)}
            </span>
            <span className="font-semibold text-zinc-800 truncate max-w-[220px]">
              {order.c_nome || 'Consumidor final'}
            </span>
            {order.n_codigo != null && (
              <span className="font-mono text-zinc-400">cli {order.n_codigo}</span>
            )}
            <span className="ml-auto font-bold text-zinc-900">
              {formatSalesCurrency(order.n_valor_tot)}
            </span>
            {order.n_nota_fiscal > 0 && (
              <span className="text-zinc-500">NF {order.n_nota_fiscal}</span>
            )}
          </div>
        )}

        <div className="border-b border-zinc-150 px-6 flex bg-zinc-50/50 shrink-0">
          <button
            type="button"
            onClick={() => setTab('itens')}
            className={cn(
              'px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer',
              tab === 'itens'
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-450 hover:text-zinc-700',
            )}
          >
            Itens
          </button>
          <button
            type="button"
            onClick={() => setTab('resumo')}
            className={cn(
              'px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer',
              tab === 'resumo'
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-450 hover:text-zinc-700',
            )}
          >
            Resumo
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-400">
              <RefreshCw className="h-8 w-8 animate-spin" />
              <span className="text-sm font-bold">Carregando pedido…</span>
            </div>
          )}
          {error && !loading && (
            <div className="text-center text-sm text-rose-600 font-semibold py-12">{error}</div>
          )}
          {order && !loading && tab === 'itens' && (
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500 font-bold">
                  <tr>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2 text-right">Qtde</th>
                    <th className="px-3 py-2 text-right">Fat.</th>
                    <th className="px-3 py-2 text-right">Falta</th>
                    <th className="px-3 py-2 text-right">Preço</th>
                    <th className="px-3 py-2">Lote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {(order.items || []).map((item) => {
                    const falta = Math.max(0, item.n_qtde - item.n_qtde_fat);
                    return (
                      <tr key={item.id || `${item.c_cod_prod}-${item.n_registro}`} className="hover:bg-zinc-50/50">
                        <td className="px-3 py-2">
                          {onOpenProduct ? (
                            <button
                              type="button"
                              onClick={() => onOpenProduct(item.c_cod_prod)}
                              className="font-mono text-[11px] font-bold text-zinc-800 hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <Package className="h-3 w-3 text-zinc-400" />
                              {item.c_cod_prod}
                            </button>
                          ) : (
                            <span className="font-mono font-bold">{item.c_cod_prod}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{item.n_qtde}</td>
                        <td className="px-3 py-2 text-right text-zinc-500">{item.n_qtde_fat}</td>
                        <td className={cn('px-3 py-2 text-right font-extrabold', falta > 0 ? 'text-rose-600' : 'text-zinc-400')}>
                          {falta}
                        </td>
                        <td className="px-3 py-2 text-right">{formatSalesCurrency(item.n_preco)}</td>
                        <td className="px-3 py-2 text-zinc-500">{item.c_lote || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {order && !loading && tab === 'resumo' && (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[10px] font-bold uppercase text-zinc-400">Residual (un)</dt>
                <dd className="font-extrabold text-zinc-900 mt-0.5">{order.residual_un ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-zinc-400">Previsão</dt>
                <dd className="font-semibold mt-0.5">{formatSalesDate(order.d_previsao)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-zinc-400">Entrega</dt>
                <dd className="font-semibold mt-0.5">{formatSalesDate(order.d_entrega)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-zinc-400">Nota fiscal</dt>
                <dd className="font-semibold mt-0.5">{order.n_nota_fiscal > 0 ? order.n_nota_fiscal : '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[10px] font-bold uppercase text-zinc-400">Observações</dt>
                <dd className="mt-1 text-zinc-700 whitespace-pre-wrap text-xs">
                  {order.m_observac?.trim() || '—'}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
