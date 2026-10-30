import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { FilterBar, ReportTabs, StatusBadge, TabelaPainel } from '../../../geral/components/ui/ReportKit';
import type { ProductFaltaGroup } from '../lib/types';
import {
  formatSalesDate,
  salesOrderKey,
  salesOrderStatusLabel,
  salesOrderStatusVariante,
} from '../lib/salesStatusUi';
import { JanelaSelect } from './JanelaSelect';

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
    <div>
      <ReportTabs
        ativa={subTab}
        onChange={(id) => setSubTab(id as 'ativas' | 'historicas')}
        abas={[
          { id: 'ativas', label: 'Faltas ativas', contagem: data.ativas.length },
          { id: 'historicas', label: 'Históricas / cortes', contagem: data.historicas.length },
        ]}
      />
      <FilterBar busca={search} onBusca={setSearch} placeholder="Produto ou linha…">
        <JanelaSelect dias={daysLimit} onChange={onDaysLimitChange} />
      </FilterBar>

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
        <TabelaPainel>
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Produto</th>
                <th style={{ textAlign: 'right' }}>Falta</th>
                {subTab === 'ativas' && (
                  <>
                    <th style={{ textAlign: 'right' }}>Estoque+Prod+T</th>
                    <th style={{ textAlign: 'right' }}>Net</th>
                  </>
                )}
                <th style={{ textAlign: 'right' }}>Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => {
                const open = !!expanded[g.c_cod_prod];
                return (
                  <React.Fragment key={g.c_cod_prod}>
                    <tr>
                      <td>
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
                      <td>
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
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {g.total_falta.toLocaleString('pt-BR')}
                      </td>
                      {subTab === 'ativas' && (
                        <>
                          <td style={{ textAlign: 'right' }}>
                            {(g.estoque + g.producao + g.transit_purchase).toLocaleString('pt-BR')}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {g.falta_net.toLocaleString('pt-BR')}
                          </td>
                        </>
                      )}
                      <td style={{ textAlign: 'right' }}>
                        {g.pedidos_afetados.length}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={subTab === 'ativas' ? 6 : 4}>
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
                                  <td className="py-1.5 text-right font-bold">
                                    {item.falta}
                                  </td>
                                  <td className="py-1.5 text-center">
                                    <StatusBadge variante={salesOrderStatusVariante(item.c_status)}>
                                      {salesOrderStatusLabel(item.c_status)}
                                    </StatusBadge>
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
        </TabelaPainel>
      )}
    </div>
  );
}
