import { formatQtyPerKitLabel, kitOrderComponentNeed } from './kitComponentQty';

function quando(order: any) {
  const raw = order?.createdAt || order?.created_at;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return String(raw || '');
  return date.toLocaleDateString('pt-BR');
}

function componentes(order: any) {
  try {
    if (!order?.componentsLotes) return [];
    const list = JSON.parse(order.componentsLotes);
    return Array.isArray(list) ? list : [];
  } catch {
    return null;
  }
}

export function KitOrderPrintSheet({ order }: { order: any }) {
  const itens = componentes(order);
  const programada = Number(order.quantity) || 0;
  const montada = order.quantityAssembled != null ? Number(order.quantityAssembled) : programada;

  return (
    <div id="print-area" className="hidden print:block bg-white text-zinc-900 font-sans p-8">
      <div className="flex justify-between items-start border-b border-zinc-200 pb-4">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black tracking-tighter">NATUM</span>
            <span className="text-[10px] font-semibold tracking-[0.3em] text-zinc-500 uppercase">Cosméticos</span>
          </div>
          <p className="text-[9px] font-bold uppercase tracking-widest mt-1">Ordem de montagem de kit</p>
        </div>
        <div className="text-right">
          <div className="bg-zinc-950 text-white px-3 py-1.5 rounded-lg min-w-32">
            <span className="text-[7px] uppercase font-black text-zinc-300 block">Nº da ordem / lote</span>
            <span className="text-sm font-black">{order.orderNumber}</span>
          </div>
          <span className="text-[8px] text-zinc-500 font-bold mt-1.5 block uppercase">Emissão: {quando(order)}</span>
        </div>
      </div>

      <div className="grid grid-cols-12 border border-zinc-200 rounded-xl overflow-hidden divide-x divide-zinc-200 text-[10px] mt-4">
        <div className="p-3 col-span-6">
          <span className="text-[7.5px] uppercase font-black text-zinc-400 block">Kit</span>
          <p className="font-extrabold">{order.kitProductDescription}</p>
        </div>
        <div className="p-3 col-span-2 text-center">
          <span className="text-[7.5px] uppercase font-black text-zinc-400 block">Código</span>
          <p className="font-mono font-bold">{order.kitProductCode}</p>
        </div>
        <div className="p-3 col-span-2 text-center">
          <span className="text-[7.5px] uppercase font-black text-zinc-400 block">Programada</span>
          <p className="font-bold">{programada} un</p>
        </div>
        <div className="p-3 col-span-2 text-center">
          <span className="text-[7.5px] uppercase font-black text-zinc-400 block">Montada</span>
          {order.status === 'COMPLETED' ? (
            <p className="font-black">{montada} un</p>
          ) : (
            <div className="border-b border-dashed border-zinc-500 h-4 w-16 mx-auto mt-2" />
          )}
        </div>
      </div>

      <h3 className="text-[9px] font-black uppercase tracking-widest border-b border-zinc-950 pb-1.5 mt-6">Componentes</h3>
      <table className="w-full text-[9px] border-collapse mt-2">
        <thead>
          <tr className="border-b border-zinc-950 font-black uppercase text-[8px]">
            <th className="py-2 text-left">Código</th>
            <th className="py-2 text-left">Componente</th>
            <th className="py-2 text-center">Por kit</th>
            <th className="py-2 text-center">Programada</th>
            <th className="py-2 text-center">Usada</th>
            <th className="py-2 text-left pl-3">Lote</th>
          </tr>
        </thead>
        <tbody>
          {itens == null && (
            <tr><td colSpan={6} className="py-3 text-center">Não foi possível ler a composição desta ordem.</td></tr>
          )}
          {itens?.map((item: any) => {
            const planned = kitOrderComponentNeed(item, programada);
            const used = item.used_qty != null ? Number(item.used_qty) : kitOrderComponentNeed(item, montada);
            return (
              <tr key={item.code} className="border-t border-zinc-200">
                <td className="py-2 font-mono font-bold">{item.code}</td>
                <td className="py-2 font-semibold">{item.description}</td>
                <td className="py-2 text-center">{formatQtyPerKitLabel(item.expected_qty, item.fator_proporcao_qtd, item.fator_proporcao_kits)}</td>
                <td className="py-2 text-center font-bold">{planned} un</td>
                <td className="py-2 text-center font-black">
                  {order.status === 'COMPLETED' || item.used_qty != null ? `${used} un` : <div className="border-b border-dashed border-zinc-400 h-4 w-12 mx-auto" />}
                </td>
                <td className="py-2 pl-3">
                  {item.lote ? item.lote : <div className="border border-zinc-300 rounded h-6 w-28" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border border-zinc-200 rounded-xl p-3 mt-6 text-[9px]">
        <span className="text-[7.5px] uppercase font-black text-zinc-400 block">Observações</span>
        {order.observations ? <p className="mt-1">{order.observations}</p> : <div className="border-b border-dashed border-zinc-300 h-4 mt-2" />}
        <div className="border-b border-dashed border-zinc-300 h-4 mt-2" />
      </div>

      <div className="grid grid-cols-3 gap-4 mt-6 text-[9px]">
        {[
          ['Montador', order.assembledBy],
          ['Conferente', order.checkedBy],
          ['Controle', ''],
        ].map(([titulo, nome]) => (
          <div key={titulo} className="border border-zinc-200 rounded-xl p-3 h-24">
            <span className="text-[8px] font-black uppercase block border-b border-zinc-200 pb-1 text-center">{titulo}</span>
            <p className="mt-3">Nome: {nome || '________________'}</p>
            <p className="mt-2">Data: ____/____/______</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export const kitOrderPrintStyle = `
@media print {
  body * { visibility: hidden !important; }
  #print-area, #print-area * { visibility: visible !important; }
  #print-area {
    display: block !important;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    background: white;
  }
  @page { size: A4 portrait; margin: 12mm; }
}
`;
