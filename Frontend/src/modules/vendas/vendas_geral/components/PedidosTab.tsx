import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Layers, Package, Clock } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { cn } from '../../../geral/lib/utils';
import type { SalesOrder } from '../lib/types';
import { orderResidual } from '../lib/types';
import {
  STATUS_FILTER_CHIPS,
  formatSalesCurrency,
  formatSalesDate,
  salesOrderKey,
  salesOrderStatusColor,
  salesOrderStatusLabel,
} from '../lib/salesStatusUi';

interface PedidosTabProps {
  daysLimit: number;
  onDaysLimitChange: (days: number) => void;
  onOpenOrder: (nPedido: number, dPedido: string) => void;
  refreshToken: number;
}

export function PedidosTab({
  daysLimit,
  onDaysLimitChange,
  onOpenOrder,
  refreshToken,
}: PedidosTabProps) {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ativos');

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
          `/vendas/pedidos?search=${encodeURIComponent(debouncedSearch)}&status=${statusFilter}&days=${daysLimit}`,
        );
        if (res.ok && !cancelled) {
          setOrders((await res.json()) || []);
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
  }, [debouncedSearch, statusFilter, daysLimit, refreshToken]);

  const kpi = useMemo(() => {
    const openStatuses = new Set(['PP', 'AL', 'LB', 'EX', 'CF']);
    let abertos = 0;
    let residual = 0;
    let atrasados = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const o of orders) {
      const st = (o.c_status || '').trim();
      const res = orderResidual(o);
      if (openStatuses.has(st)) {
        abertos += 1;
        residual += res;
        if (o.d_previsao) {
          const prev = new Date(o.d_previsao.includes('T') ? o.d_previsao : o.d_previsao.replace(' ', 'T'));
          if (!Number.isNaN(prev.getTime()) && prev < today && res > 0) atrasados += 1;
        }
      }
    }
    return { abertos, residual, atrasados, total: orders.length };
  }, [orders]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-zinc-100 rounded-lg">
            <Layers className="h-4 w-4 text-zinc-800" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-400 block">Na lista</span>
            <span className="text-lg font-extrabold">{kpi.total}</span>
            {statusFilter === 'ativos' && (
              <span className="text-[10px] text-zinc-400 ml-1">abertos</span>
            )}
          </div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-rose-50 rounded-lg">
            <Package className="h-4 w-4 text-rose-600" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-400 block">Residual (un)</span>
            <span className="text-lg font-extrabold text-rose-700">
              {kpi.residual.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-50 rounded-lg">
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-400 block">Atrasados (prev.)</span>
            <span className="text-lg font-extrabold text-amber-700">{kpi.atrasados}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cliente ou nº do pedido…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-[10px] font-bold uppercase text-zinc-400">Janela</label>
              <select
                value={daysLimit}
                onChange={(e) => onDaysLimitChange(Number(e.target.value))}
                className="text-sm border border-zinc-200 rounded-lg px-2 py-2 bg-white"
              >
                <option value={30}>30 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>180 dias</option>
                <option value={365}>1 ano</option>
                <option value={0}>Sem limite</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTER_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusFilter(chip.id)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors cursor-pointer',
                  statusFilter === chip.id
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
            <RefreshCw className="h-8 w-8 animate-spin" />
            <span className="text-sm font-bold">Carregando pedidos…</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-sm text-zinc-400 font-medium">
            Nenhum pedido neste filtro.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500 font-bold border-b border-zinc-100">
                <tr>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Residual</th>
                  <th className="px-4 py-3">Previsão</th>
                  <th className="px-4 py-3">NF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {orders.map((o) => {
                  const key = salesOrderKey(o.n_pedido, o.d_pedido);
                  const residual = orderResidual(o);
                  return (
                    <tr
                      key={key}
                      onClick={() => onOpenOrder(o.n_pedido, o.d_pedido)}
                      className="hover:bg-zinc-50/80 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-extrabold text-zinc-900">#{o.n_pedido}</span>
                        <span className="block text-[10px] text-zinc-400 font-medium">
                          {formatSalesDate(o.d_pedido)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-zinc-800 line-clamp-1 max-w-[240px]">
                          {o.c_nome || 'Consumidor final'}
                        </span>
                        {o.n_codigo != null && (
                          <span className="block font-mono text-[10px] text-zinc-400">
                            {o.n_codigo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase',
                            salesOrderStatusColor(o.c_status),
                          )}
                        >
                          {salesOrderStatusLabel(o.c_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatSalesCurrency(o.n_valor_tot)}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-extrabold',
                          residual > 0 ? 'text-rose-600' : 'text-zinc-400',
                        )}
                      >
                        {residual.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{formatSalesDate(o.d_previsao)}</td>
                      <td className="px-4 py-3 text-zinc-500">
                        {o.n_nota_fiscal > 0 ? o.n_nota_fiscal : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
