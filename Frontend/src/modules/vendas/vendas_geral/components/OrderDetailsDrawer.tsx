import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Package } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { cn } from '../../../geral/lib/utils';
import Drawer from '../../../geral/components/ui/Drawer';
import { StatusBadge } from '../../../geral/components/ui/ReportKit';
import type { SalesOrder } from '../lib/types';
import {
  formatSalesCurrency,
  formatSalesDate,
  salesOrderStatusVariante,
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

  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      badge="Pedido de Venda"
      title={order ? `#${order.n_pedido} · ${formatSalesDate(order.d_pedido)}` : (error || 'Detalhe do Pedido')}
      subtitle={order ? `${order.c_nome || 'Consumidor final'} · Total: ${formatSalesCurrency(order.n_valor_tot)}` : undefined}
      tabs={[
        { id: 'itens', label: 'Itens', icon: Package, badge: order?.items?.length },
        { id: 'resumo', label: 'Resumo & Prazos' },
      ]}
      activeTab={tab}
      onTabChange={(t) => setTab(t as any)}
      size="xl"
      loading={loading}
      loadingText="Carregando pedido de venda..."
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-all ml-auto"
        >
          Fechar Painel
        </button>
      }
    >
      <div className="space-y-4">
        {order && !loading && (
          <div className="p-3 border border-zinc-200/80 rounded-xl bg-zinc-50 flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge variante={salesOrderStatusVariante(order.c_status)}>
              {salesOrderStatusLabel(order.c_status)}
            </StatusBadge>
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
                    <th className="px-3 py-2 text-right">Estoque</th>
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
                          {item.descricao && (
                            <div className="text-[11px] text-zinc-500 truncate max-w-[320px]" title={item.descricao}>
                              {item.descricao}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{item.n_qtde}</td>
                        <td className="px-3 py-2 text-right text-zinc-500">{item.n_qtde_fat}</td>
                        <td className={cn('px-3 py-2 text-right font-extrabold', falta > 0 ? 'text-rose-600' : 'text-zinc-400')}>
                          {falta}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right',
                            falta > 0 && item.estoque != null && item.estoque < falta ? 'text-amber-600 font-bold' : 'text-zinc-500',
                          )}
                        >
                          {item.estoque != null ? Math.round(item.estoque) : '—'}
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
    </Drawer>
  );
}
