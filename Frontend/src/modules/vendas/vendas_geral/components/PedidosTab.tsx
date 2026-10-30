import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { FilterBar, FiltroSelect, ReportTabs, StatusBadge, TabelaPainel } from '../../../geral/components/ui/ReportKit';
import type { ResumoPedidos, SalesOrder } from '../lib/types';
import {
  STATUS_FILTER_CHIPS,
  formatSalesCurrency,
  formatSalesDate,
  salesOrderKey,
  salesOrderStatusLabel,
  salesOrderStatusVariante,
  atendimentoUi,
} from '../lib/salesStatusUi';
import { JanelaSelect } from './JanelaSelect';

interface PedidosTabProps {
  daysLimit: number;
  onDaysLimitChange: (days: number) => void;
  onOpenOrder: (nPedido: number, dPedido: string) => void;
  refreshToken: number;
}

type AbaPedidos = 'abertos' | 'prontos' | 'atrasados' | 'todos';

// "ativos" e "ALL" são as visões das abas; o seletor só oferece os status individuais.
const STATUS_INDIVIDUAIS = STATUS_FILTER_CHIPS.filter((c) => c.id !== 'ativos');

export function PedidosTab({
  daysLimit,
  onDaysLimitChange,
  onOpenOrder,
  refreshToken,
}: PedidosTabProps) {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [resumo, setResumo] = useState<ResumoPedidos | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [aba, setAba] = useState<AbaPedidos>('abertos');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Contagens vêm do servidor (mesma regra de "aberto" e "atrasado" das linhas).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/vendas/pedidos/resumo?search=${encodeURIComponent(debouncedSearch)}&days=${daysLimit}`,
        );
        if (res.ok && !cancelled) setResumo(await res.json());
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, daysLimit, refreshToken]);

  const statusConsulta = aba === 'todos' ? statusFilter : 'ativos';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const atend = aba === 'prontos' ? '&atendimento=completo' : '';
        const res = await apiFetch(
          `/vendas/pedidos?search=${encodeURIComponent(debouncedSearch)}&status=${statusConsulta}&days=${daysLimit}${atend}`,
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
  }, [debouncedSearch, statusConsulta, aba, daysLimit, refreshToken]);

  const visiveis = useMemo(
    () => (aba === 'atrasados' ? orders.filter((o) => o.atrasado) : orders),
    [orders, aba],
  );

  return (
    <div>
      <ReportTabs
        ativa={aba}
        onChange={(id) => setAba(id as AbaPedidos)}
        abas={[
          { id: 'abertos', label: 'Abertos', contagem: resumo?.abertos },
          { id: 'prontos', label: 'Prontos p/ faturar', contagem: resumo?.prontos },
          { id: 'atrasados', label: 'Atrasados', contagem: resumo?.atrasados },
          { id: 'todos', label: 'Todos', contagem: resumo?.total },
        ]}
      />
      <FilterBar busca={search} onBusca={setSearch} placeholder="Cliente ou nº do pedido…">
        {aba === 'todos' && (
          <FiltroSelect
            value={statusFilter}
            onChange={setStatusFilter}
            opcoes={STATUS_INDIVIDUAIS.map((c) => ({ valor: c.id, rotulo: c.label }))}
          />
        )}
        <JanelaSelect dias={daysLimit} onChange={onDaysLimitChange} />
      </FilterBar>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <span className="text-sm font-bold">Carregando pedidos…</span>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="text-center py-16 text-sm text-zinc-400 font-medium">
          Nenhum pedido neste filtro.
        </div>
      ) : (
        <TabelaPainel>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Atende</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
              <th style={{ textAlign: 'right' }}>Residual</th>
              <th>Previsão</th>
              <th>NF</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((o) => (
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
                  <span className="line-clamp-1 max-w-[240px]">{o.c_nome || 'Consumidor final'}</span>
                  {o.n_codigo != null && (
                    <span className="block font-mono text-[10px] text-zinc-400">{o.n_codigo}</span>
                  )}
                </td>
                <td>
                  <StatusBadge variante={salesOrderStatusVariante(o.c_status)}>
                    {salesOrderStatusLabel(o.c_status)}
                  </StatusBadge>
                </td>
                <td>
                  {(() => {
                    const at = atendimentoUi(o.atendimento);
                    return at ? <StatusBadge variante={at.variante}>{at.rotulo}</StatusBadge> : null;
                  })()}
                </td>
                <td style={{ textAlign: 'right' }}>{formatSalesCurrency(o.n_valor_tot)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {(o.residual_un ?? 0).toLocaleString('pt-BR')}
                </td>
                <td>
                  {formatSalesDate(o.d_previsao)}
                  {o.atrasado && (
                    <>
                      {' '}
                      <StatusBadge variante="critico">Atrasado</StatusBadge>
                    </>
                  )}
                </td>
                <td>{o.n_nota_fiscal > 0 ? o.n_nota_fiscal : '—'}</td>
              </tr>
            ))}
          </tbody>
        </TabelaPainel>
      )}
      {resumo && (
        <p style={{ fontSize: '0.72rem', marginTop: 8, color: 'hsl(var(--text-secondary-hsl))' }}>
          Residual dos pedidos em aberto: {resumo.residual_abertos_un.toLocaleString('pt-BR')} un
        </p>
      )}
    </div>
  );
}
