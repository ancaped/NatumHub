import React, { useEffect, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { cn } from '../../../geral/lib/utils';
import { FilterBar, FiltroSelect, StatusBadge, TabelaPainel } from '../../../geral/components/ui/ReportKit';
import type { SalesCliente, SalesOrder } from '../lib/types';
import {
  STATUS_FILTER_CHIPS,
  formatSalesCurrency,
  formatSalesDate,
  salesOrderKey,
  salesOrderStatusLabel,
  salesOrderStatusVariante,
} from '../lib/salesStatusUi';
import { JanelaSelect } from './JanelaSelect';

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
    <div>
      <FilterBar busca={search} onBusca={setSearch} placeholder="Nome ou código do cliente…">
        <JanelaSelect dias={daysLimit} onChange={onDaysLimitChange} />
      </FilterBar>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 min-h-[480px]">
        <div className="lg:col-span-2 panel-card flex flex-col overflow-hidden" style={{ padding: 0 }}>
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
                          <strong>{c.pedidos_abertos}</strong> abertos · {c.pedidos_total} total
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 panel-card flex flex-col overflow-hidden" style={{ padding: 0 }}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-400 p-8 text-center">
              Selecione um cliente para ver pedidos e histórico.
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-zinc-100 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-extrabold text-zinc-900 text-sm">{selected.c_nome}</h3>
                  <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                    Código {selected.n_codigo} · abertos {formatSalesCurrency(selected.valor_abertos)}
                  </p>
                </div>
                <FiltroSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  opcoes={STATUS_FILTER_CHIPS.map((c) => ({ valor: c.id, rotulo: c.label }))}
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {ordersLoading ? (
                  <div className="flex justify-center py-16">
                    <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-center text-sm text-zinc-400 py-16">Nenhum pedido neste filtro.</p>
                ) : (
                  <TabelaPainel>
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                        <th style={{ textAlign: 'right' }}>Residual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr
                          key={salesOrderKey(o.n_pedido, o.d_pedido)}
                          onClick={() => onOpenOrder(o.n_pedido, o.d_pedido)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <strong>#{o.n_pedido}</strong>
                            <span className="block text-[10px] text-zinc-400">{formatSalesDate(o.d_pedido)}</span>
                          </td>
                          <td>
                            <StatusBadge variante={salesOrderStatusVariante(o.c_status)}>
                              {salesOrderStatusLabel(o.c_status)}
                            </StatusBadge>
                          </td>
                          <td style={{ textAlign: 'right' }}>{formatSalesCurrency(o.n_valor_tot)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {(o.residual_un ?? 0).toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TabelaPainel>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
