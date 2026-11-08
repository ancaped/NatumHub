import React from 'react';
import Drawer from '../../geral/components/ui/Drawer';
import { Boxes, Printer } from 'lucide-react';
import { formatQtyPerKitLabel } from '../lib/kitComponentQty';

/** Componentes de um kit (estoque, produção, pedidos e o que precisa produzir), em painel lateral. */
export default function DrawerKitComponentes({ ctx }: { ctx: any }) {
  const { kits, kitDetalheCodigo, setKitDetalheCodigo, kitMontarQtys, handleOpenNewOrderModal, handleQuickCreateAndPrintKit } = ctx;
  const k = kits.find((x: any) => x.codigo === kitDetalheCodigo);
  if (!k) return null;
  const comps = k.componentes || [];
  const currentQty = kitMontarQtys[k.codigo] !== undefined
    ? kitMontarQtys[k.codigo]
    : (k.producao_recomendada > 0 ? k.producao_recomendada : (k.max_montavel > 0 ? k.max_montavel : 10));
  return (
    <Drawer
      onClose={() => setKitDetalheCodigo('')}
      title={k.descricao}
      subtitle={k.codigo}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={() => handleQuickCreateAndPrintKit(k, currentQty)}
            className="min-h-11 sm:min-h-9 px-4 rounded-xl border border-zinc-300 bg-white text-zinc-700 text-xs font-bold hover:bg-zinc-50 cursor-pointer inline-flex items-center gap-1.5"
          >
            <Printer size={14} /> Gerar e imprimir ordem ({currentQty} un)
          </button>
          <button
            type="button"
            onClick={() => { setKitDetalheCodigo(''); handleOpenNewOrderModal(k.codigo); }}
            className="min-h-11 sm:min-h-9 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
          >
            <Boxes size={14} /> Nova ordem de montagem
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <span className="block text-[10px] font-extrabold uppercase text-zinc-500">Estoque</span>
          <b className="font-mono text-zinc-900">{k.estoque} un</b>
          <span className="block text-[10px] text-zinc-400">Ped: {k.pedidos_aberto} un</span>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <span className="block text-[10px] font-extrabold uppercase text-zinc-500">Alerta</span>
          <b className="text-zinc-900">{k.status_label}</b>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <span className="block text-[10px] font-extrabold uppercase text-zinc-500">Produzir</span>
          <b className="font-mono text-zinc-900">{k.producao_recomendada > 0 ? `${k.producao_recomendada} un` : '—'}</b>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <span className="block text-[10px] font-extrabold uppercase text-zinc-500">Máx. montável</span>
          <b className="font-mono text-zinc-900">{k.max_montavel} un</b>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-2">Componentes do kit ({comps.length})</h4>
        {comps.length === 0 ? (
          <p className="text-xs text-zinc-500">Este kit não tem componentes na composição.</p>
        ) : (
          <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 bg-white">
            {comps.map((comp: any) => (
              <div key={comp.codigo} className="p-3 text-xs space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-zinc-800">{comp.codigo}</span>
                    <span className="block text-zinc-700 break-words">{comp.descricao}</span>
                  </div>
                  <span className="font-bold text-zinc-900 shrink-0">
                    {formatQtyPerKitLabel(Number(comp.quantidade) || 1, comp.fator_proporcao_qtd, comp.fator_proporcao_kits)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                  <span>Estoque <b className="text-zinc-900">{comp.estoque} un</b></span>
                  <span>Produção {comp.producao} un</span>
                  <span>Pedidos {comp.pedidos_aberto} un</span>
                  {comp.fonte === 'item' ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold uppercase text-[9px]">embalagem/insumo</span>
                  ) : comp.necessita_producao ? (
                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-bold uppercase text-[9px]">Precisa produzir</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
