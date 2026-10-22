import React, { useEffect, useState } from 'react';
import Drawer from '../../geral/components/ui/Drawer';
import { StatusBadge } from '../../geral/components/ui/ReportKit';
import { apiFetch } from '../../geral/lib/http';

interface ItemPedido {
  id: number;
  cReferencia: string;
  cDescricao: string | null;
  cUnidade: string | null;
  nQtde: number;
  nChegou: number;
}

interface Pedido {
  nRegistro: number;
  nPedido: number;
  dPedido: string | null;
  cNomeF: string | null;
  cStatus: string | null;
  dPrevisao: string | null;
  items?: ItemPedido[];
}

const fmt = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const fmtData = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

/** Resumo de leitura de um pedido de compra (aberto direto de outras telas, pelo número do pedido). */
export default function PedidoResumoDrawer({ nPedido, onClose }: { nPedido: number; onClose: () => void }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const lista = await apiFetch(`/compras/pedidos?search=${nPedido}`).then((r) => (r.ok ? r.json() : []));
        const achado = (Array.isArray(lista) ? lista : []).find((p: Pedido) => p.nPedido === nPedido);
        if (!achado) throw new Error(`Pedido ${nPedido} não encontrado.`);
        const det = await apiFetch(`/compras/pedidos/${achado.nRegistro}`).then((r) => (r.ok ? r.json() : null));
        if (!det) throw new Error('Não foi possível carregar o pedido.');
        if (!cancelado) setPedido(det);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Não foi possível carregar o pedido.');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [nPedido]);

  return (
    <Drawer
      onClose={onClose}
      badge="Pedido de Compra"
      title={`Pedido #${nPedido}`}
      subtitle={pedido ? `${pedido.cNomeF || 'Fornecedor não informado'} · ${fmtData(pedido.dPedido)}` : undefined}
      size="lg"
      loading={!pedido && !erro}
      loadingText="Carregando o pedido..."
    >
      <div style={{ padding: 16 }}>
        {erro && <p style={{ fontSize: '0.78rem', color: 'hsl(var(--danger-hsl))' }}>{erro}</p>}
        {pedido && (
          <>
            <p style={{ fontSize: '0.75rem', marginBottom: 10 }}>
              Previsão de entrega: <strong>{fmtData(pedido.dPrevisao)}</strong>{' '}
              <StatusBadge variante={pedido.cStatus === 'T' ? 'saudavel' : 'ordem'}>{pedido.cStatus === 'T' ? 'Fechado' : 'Em aberto'}</StatusBadge>
            </p>
            <div className="panel-card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="data-table compacta">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="numeric-col">Pedido</th>
                    <th className="numeric-col">Chegou</th>
                    <th className="numeric-col">Pendente</th>
                  </tr>
                </thead>
                <tbody>
                  {(pedido.items ?? []).map((i) => (
                    <tr key={i.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{i.cDescricao || i.cReferencia}</div>
                        <span className="product-code" style={{ fontSize: '0.65rem' }}>{i.cReferencia}</span>
                      </td>
                      <td className="numeric-col">{fmt(i.nQtde)} {i.cUnidade ?? ''}</td>
                      <td className="numeric-col">{fmt(i.nChegou)}</td>
                      <td className="numeric-col" style={{ fontWeight: 700 }}>{fmt(Math.max(i.nQtde - i.nChegou, 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
