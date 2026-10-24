import React from 'react';
import { Check, RefreshCw } from 'lucide-react';
import Drawer from '../../../../geral/components/ui/Drawer';
import type { LinkLoteModalItem, Setter } from './tiposDrawers';

interface VincularLoteDrawerProps {
  linkLoteModalItem: LinkLoteModalItem;
  setLinkLoteModalItem: Setter<LinkLoteModalItem | null>;
  handleConfirmLinkLote: () => Promise<void>;
}

export function VincularLoteDrawer({
  linkLoteModalItem,
  setLinkLoteModalItem,
  handleConfirmLinkLote,
}: VincularLoteDrawerProps) {
  return (
    <Drawer isOpen onClose={() => setLinkLoteModalItem(null)} title="Vincular Lote ERP" size="md"
      footer={
        <>
          <button
            type="button"
            onClick={() => setLinkLoteModalItem(null)}
            className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmLinkLote}
            className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg shadow-xs cursor-pointer"
          >
            Salvar Lote
          </button>
        </>
      }
    >

        <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
          <strong className="text-zinc-900 block">{linkLoteModalItem.item.descricao || linkLoteModalItem.item.codigo_produto}</strong>
          <div className="flex items-center justify-between text-zinc-500 mt-1">
            <span>Data: <strong>{linkLoteModalItem.item.data_planejada}</strong></span>
            <span>Massa: <strong>{linkLoteModalItem.item.quantidade_planejada} kg</strong></span>
          </div>
        </div>

        {/* Histórico / Sugestão do Último Lote Adicionado */}
        {linkLoteModalItem.loadingUltimoLote ? (
          <div className="flex items-center gap-2 p-2.5 bg-blue-50/60 border border-blue-150 rounded-lg text-xs text-blue-700">
            <RefreshCw size={13} className="animate-spin text-blue-600 shrink-0" />
            <span>Consultando histórico de lotes no ERP...</span>
          </div>
        ) : linkLoteModalItem.ultimoLote ? (
          <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-lg text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-zinc-600 text-[11px] font-medium">Último lote registrado:</span>
              <span className="font-mono font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                #{linkLoteModalItem.ultimoLote}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              {linkLoteModalItem.dataUltimoLote && (
                <span>Data no ERP: <strong>{linkLoteModalItem.dataUltimoLote.split('T')[0].split(' ')[0].split('-').reverse().join('/')}</strong></span>
              )}
              {linkLoteModalItem.quantidadeKgLote && (
                <span className="text-emerald-700 font-bold">Massa no ERP: {linkLoteModalItem.quantidadeKgLote} kg</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 pt-1.5 border-t border-blue-200/60">
              <button
                type="button"
                onClick={() => {
                  const autoMassa = linkLoteModalItem.quantidadeKgLote && linkLoteModalItem.quantidadeKgLote > 0
                    ? linkLoteModalItem.quantidadeKgLote
                    : null;
                  setLinkLoteModalItem({ 
                    ...linkLoteModalItem, 
                    lote: linkLoteModalItem.ultimoLote!,
                    autoQty: autoMassa,
                  });
                }}
                className="w-full py-1 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded text-xs font-semibold cursor-pointer transition-colors shadow-2xs text-center"
              >
                Usar Lote #{linkLoteModalItem.ultimoLote}
              </button>
            </div>
            {linkLoteModalItem.autoQty && (
              <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-800 flex items-center gap-1">
                <Check size={12} className="text-emerald-600 shrink-0" />
                <span>Massa ajustada para <strong>{linkLoteModalItem.autoQty} kg</strong> ao salvar o lote.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] text-zinc-500">
            Nenhum lote anterior registrado para este produto.
          </div>
        )}

        <div>
          <label className="font-semibold text-zinc-700 text-xs block mb-1">
            Número do Lote ERP:
          </label>
          <input
            type="text"
            autoFocus
            placeholder="Ex: 261005, L2409 ou use a sugestão..."
            value={linkLoteModalItem.lote}
            onChange={(e) => setLinkLoteModalItem({ ...linkLoteModalItem, lote: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmLinkLote();
            }}
            className="w-full p-2.5 font-mono text-sm border border-zinc-300 rounded-lg bg-white font-bold text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            Ao salvar, o lote é sincronizado automaticamente com os quadros de acompanhamento de produção.
          </p>
        </div>
    </Drawer>
  );
}
