import React, { useEffect, useState } from 'react';
import { Search, RefreshCw, Users } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { cn } from '../../../geral/lib/utils';
import type { SalesCliente, SalesOrder } from '../lib/types';
import { orderResidual } from '../lib/types';
import {
  STATUS_FILTER_CHIPS,
  formatSalesCurrency,
  formatSalesDate,
  salesOrderKey,
  salesOrderStatusColor,
  salesOrderStatusLabel,
} from '../lib/salesStatusUi';

interface ClientesTabProps {
  daysLimit: number;
  onDaysLimitChange: (days: number) => void;
  onOpenOrder: (nPedido: number, dPedido: string) => void;
  refreshToken: number;
}

export function ClientesTab({
  daysLimit,
  onDaysLimitChange,
  onOpenOrder,
  refreshToken,
}: ClientesTabProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [clientes, setClientes] = useState<SalesCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SalesCliente | null>(null);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(
          `/vendas/clientes?search=${encodeURIComponent(debouncedSearch)}&days=${daysLimit}`,
        );
        if (res.ok && !cancelled) {
          setClientes((await res.json()) || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, daysLimit, refreshToken]);

  useEffect(() => {
    if (!selected) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setOrdersLoading(true);
      try {
        const res = await apiFetch(
          `/vendas/clientes/${selected.n_codigo}/pedidos?status=${statusFilter}&days=${daysLimit}`,
        );
        if (res.ok && !cancelled) {
          setOrders((await res.json()) || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selected, statusFilter, daysLimit, refreshToken]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200 h-full min-h-[480px]">
      <div className="lg:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-zinc-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou código do cliente…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg"
            />
          </div>
          <select
            value={daysLimit}
            onChange={(e) => onDaysLimitChange(Number(e.target.value))}
            className="w-full text-sm border border-zinc-200 rounded-lg px-2 py-2"
          >
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={180}>180 dias</option>
            <option value={365}>1 ano</option>
            <option value={0}>Sem limite</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-16 text-sm text-zinc-400">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Nenhum cliente encontrado.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {clientes.map((c) => (
                <li key={c.n_codigo}>
                  <button
                    type="button"
                    onClick={() => setSelected(c)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-zinc-50 cursor-pointer transition-colors',
                      selected?.n_codigo === c.n_codigo && 'bg-zinc-100',
                    )}
                  >
                    <span className="font-bold text-sm text-zinc-900 line-clamp-1">
                      {c.c_nome || `Cliente ${c.n_codigo}`}
                    </span>
                    <span className="flex justify-between mt-1 text-[10px] text-zinc-500">
                      <span className="font-mono">{c.n_codigo}</span>
                      <span>
                        <strong className="text-rose-600">{c.pedidos_abertos}</strong> abertos ·{' '}
                        {c.pedidos_total} total
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="lg:col-span-3 bg-white border border-zinc-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-400 p-8 text-center">
            Selecione um cliente para ver pedidos e histórico.
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-zinc-100">
              <h3 className="font-extrabold text-zinc-900 text-sm">{selected.c_nome}</h3>
              <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                Código {selected.n_codigo} · abertos{' '}
                {formatSalesCurrency(selected.valor_abertos)}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {STATUS_FILTER_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setStatusFilter(chip.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer',
                      statusFilter === chip.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-600 border-zinc-200',
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {ordersLoading ? (
                <div className="flex justify-center py-16">
                  <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
              ) : orders.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-16">Nenhum pedido neste filtro.</p>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500 font-bold sticky top-0">
                    <tr>
                      <th className="px-4 py-2">Pedido</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2 text-right">Valor</th>
                      <th className="px-4 py-2 text-right">Residual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {orders.map((o) => (
                      <tr
                        key={salesOrderKey(o.n_pedido, o.d_pedido)}
                        onClick={() => onOpenOrder(o.n_pedido, o.d_pedido)}
                        className="hover:bg-zinc-50 cursor-pointer"
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-extrabold">#{o.n_pedido}</span>
                          <span className="block text-[10px] text-zinc-400">
                            {formatSalesDate(o.d_pedido)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[9px] font-bold border',
                              salesOrderStatusColor(o.c_status),
                            )}
                          >
                            {salesOrderStatusLabel(o.c_status)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold">
                          {formatSalesCurrency(o.n_valor_tot)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-extrabold text-rose-600">
                          {orderResidual(o).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
