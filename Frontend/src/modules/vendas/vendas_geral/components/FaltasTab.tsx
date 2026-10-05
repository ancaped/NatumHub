import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { cn } from '../../../geral/lib/utils';
import type { ProductFaltaGroup } from '../lib/types';
import {
  formatSalesDate,
  salesOrderKey,
  salesOrderStatusColor,
  salesOrderStatusLabel,
} from '../lib/salesStatusUi';

interface FaltasTabProps {
  daysLimit: number;
  onDaysLimitChange: (days: number) => void;
  onOpenProduct: (code: string) => void;
  onOpenOrder: (nPedido: number, dPedido: string) => void;
  refreshToken: number;
}

export function FaltasTab({
  daysLimit,
  onDaysLimitChange,
  onOpenProduct,
  onOpenOrder,
  refreshToken,
}: FaltasTabProps) {
  const [data, setData] = useState<{ ativas: ProductFaltaGroup[]; historicas: ProductFaltaGroup[] }>({
    ativas: [],
    historicas: [],
  });
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<'ativas' | 'historicas'>('ativas');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/vendas/faltas?days=${daysLimit}`);
        if (res.ok && !cancelled) {
          const json = await res.json();
          setData({ ativas: json.ativas || [], historicas: json.historicas || [] });
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
  }, [daysLimit, refreshToken]);

  const list = subTab === 'ativas' ? data.ativas : data.historicas;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (g) =>
        g.c_cod_prod.toLowerCase().includes(q) ||
        g.c_nome_prod.toLowerCase().includes(q) ||
        g.c_nome_linha.toLowerCase().includes(q),
    );
  }, [list, search]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex gap-1 bg-zinc-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('ativas')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer',
                subTab === 'ativas' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500',
              )}
            >
              Faltas ativas ({data.ativas.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('historicas')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer',
                subTab === 'historicas' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500',
              )}
            >
              Históricas / cortes ({data.historicas.length})
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Produto ou linha…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg"
              />
            </div>
            <select
              value={daysLimit}
              onChange={(e) => onDaysLimitChange(Number(e.target.value))}
              className="text-sm border border-zinc-200 rounded-lg px-2 py-2"
            >
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={180}>180 dias</option>
              <option value={365}>1 ano</option>
              <option value={0}>Sem limite</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-zinc-400">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nenhuma falta neste filtro.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500 font-bold border-b">
              <tr>
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3 text-right">Falta</th>
                {subTab === 'ativas' && (
                  <>
                    <th className="px-4 py-3 text-right">Estoque+Prod+T</th>
                    <th className="px-4 py-3 text-right">Net</th>
                  </>
                )}
                <th className="px-4 py-3 text-right">Pedidos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((g) => {
                const open = !!expanded[g.c_cod_prod];
                return (
                  <React.Fragment key={g.c_cod_prod}>
                    <tr className="hover:bg-zinc-50/50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [g.c_cod_prod]: !prev[g.c_cod_prod],
                            }))
                          }
                          className="p-1 rounded hover:bg-zinc-100 cursor-pointer"
                        >
                          {open ? (
                            <ChevronUp className="h-4 w-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-zinc-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenProduct(g.c_cod_prod)}
                          className="text-left cursor-pointer hover:underline"
                        >
                          <span className="font-bold text-zinc-900 block">{g.c_nome_prod}</span>
                          <span className="font-mono text-[10px] text-zinc-400">
                            {g.c_cod_prod} · {g.c_nome_linha}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold text-rose-600">
                        {g.total_falta.toLocaleString('pt-BR')}
                      </td>
                      {subTab === 'ativas' && (
                        <>
                          <td className="px-4 py-3 text-right text-zinc-500">
                            {(g.estoque + g.producao + g.transit_purchase).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-amber-700">
                            {g.falta_net.toLocaleString('pt-BR')}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-right text-zinc-600">
                        {g.pedidos_afetados.length}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-zinc-50/40">
                        <td colSpan={subTab === 'ativas' ? 6 : 4} className="px-4 py-3">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-[9px] uppercase text-zinc-400">
                                <th className="py-1 text-left">Pedido</th>
                                <th className="py-1 text-left">Cliente</th>
                                <th className="py-1 text-right">Falta</th>
                                <th className="py-1 text-center">Status</th>
                                <th className="py-1 text-left">Previsão</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {g.pedidos_afetados.map((item) => (
                                <tr
                                  key={salesOrderKey(item.n_pedido, item.d_pedido)}
                                  className="cursor-pointer hover:bg-white"
                                  onClick={() => onOpenOrder(item.n_pedido, item.d_pedido)}
                                >
                                  <td className="py-1.5 font-bold">
                                    #{item.n_pedido}{' '}
                                    <span className="font-normal text-zinc-400">
                                      {formatSalesDate(item.d_pedido)}
                                    </span>
                                  </td>
                                  <td className="py-1.5">{item.c_nome || '—'}</td>
                                  <td className="py-1.5 text-right font-extrabold text-rose-600">
                                    {item.falta}
                                  </td>
                                  <td className="py-1.5 text-center">
                                    <span
                                      className={cn(
                                        'px-2 py-0.5 rounded-full text-[9px] font-bold border',
                                        salesOrderStatusColor(item.c_status),
                                      )}
                                    >
                                      {salesOrderStatusLabel(item.c_status)}
                                    </span>
                                  </td>
                                  <td className="py-1.5">{formatSalesDate(item.d_previsao)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
