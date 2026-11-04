import { FileText } from 'lucide-react';

export interface PedidoCompraHistorico {
  nPedido: number;
  dPedido: string | null;
  cNomeF: string | null;
  nQtde: number;
  nChegou: number;
  nPreco: number;
}

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (d: string | null | undefined) => {
  if (!d) return '-';
  try { const date = new Date(d); return date.toLocaleDateString('pt-BR'); } catch { return d; }
};

/** Miolo da aba "Histórico de Pedidos" do Drawer de insumo (Compras) e de produto (Coloração/Apoio). */
export function HistoricoPedidosTable({ pedidos, rotuloItem }: { pedidos: PedidoCompraHistorico[] | null | undefined; rotuloItem: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-zinc-105 pb-2">
        <FileText className="h-4 w-4 text-zinc-650" />
        <h4 className="font-extrabold text-sm text-zinc-900">Histórico de Pedidos de Compra (Últimos 100)</h4>
      </div>
      {!pedidos || pedidos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
          <FileText className="h-8 w-8 text-zinc-300 mb-2" />
          <p className="text-sm font-medium">Nenhum pedido de compra registrado</p>
          <p className="text-xs mt-0.5">Este {rotuloItem} não possui histórico de pedidos.</p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
              <tr>
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3 text-right">Qtd Pedida</th>
                <th className="px-4 py-3 text-right">Qtd Recebida</th>
                <th className="px-4 py-3 text-right">Preço Unit.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-[11px]">
              {pedidos.map((po, idx) => (
                <tr key={`${po.nPedido}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-zinc-700">#{po.nPedido}</td>
                  <td className="px-4 py-2.5 text-zinc-500">{formatDate(po.dPedido)}</td>
                  <td className="px-4 py-2.5 font-semibold text-zinc-800 max-w-[150px] truncate" title={po.cNomeF || ''}>
                    {po.cNomeF || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-800">
                    {po.nQtde.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-600">
                    {po.nChegou.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-900 font-bold">
                    {formatCurrency(po.nPreco)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
