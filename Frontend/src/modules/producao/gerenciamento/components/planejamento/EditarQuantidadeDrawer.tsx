import React from 'react';
import Drawer from '../../../../geral/components/ui/Drawer';
import { parseProductUnitWeightKg } from '../../../lib/unitConversion';
import { getShortReatorName } from '../../../lib/processoProduto';
import type { ReatorConfig } from '../PlanejamentoSemanalTab';
import type { EditQtyModalItem, Setter } from './tiposDrawers';

interface EditarQuantidadeDrawerProps {
  editQtyModalItem: EditQtyModalItem;
  setEditQtyModalItem: Setter<EditQtyModalItem | null>;
  reatores: ReatorConfig[];
  handleConfirmEditQty: () => Promise<void>;
}

export function EditarQuantidadeDrawer({
  editQtyModalItem,
  setEditQtyModalItem,
  reatores,
  handleConfirmEditQty,
}: EditarQuantidadeDrawerProps) {
  return (
    <Drawer isOpen onClose={() => setEditQtyModalItem(null)} title="Editar Quantidade (Massa)" size="md"
      footer={
        <>
          <button
            type="button"
            onClick={() => setEditQtyModalItem(null)}
            className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmEditQty}
            className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg shadow-xs cursor-pointer"
          >
            Salvar Quantidade
          </button>
        </>
      }
    >

        <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
          <strong className="text-zinc-900 block">
            {editQtyModalItem.batchItems && editQtyModalItem.batchItems.length > 1
              ? `Batelada Conjunta (${editQtyModalItem.batchItems.length} produtos)`
              : (editQtyModalItem.item.descricao || editQtyModalItem.item.codigo_produto)}
          </strong>
          <div className="flex items-center justify-between text-zinc-500 mt-1">
            <span>Data: <strong>{editQtyModalItem.item.data_planejada}</strong></span>
            <span>Equipamento: <strong>{getShortReatorName(editQtyModalItem.item.reator_id, editQtyModalItem.item.recipiente_detalhe, reatores)}</strong></span>
          </div>
        </div>

        {editQtyModalItem.batchItems && editQtyModalItem.batchItems.length > 1 ? (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-zinc-700">Massas Individuais por Produto:</div>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {editQtyModalItem.batchItems.map(it => {
                const currentVal = editQtyModalItem.batchMasses?.[it.id] ?? it.quantidade_planejada;
                const uW = parseProductUnitWeightKg(it.descricao);
                const estUn = Math.round(currentVal / (uW || 1));
                return (
                  <div key={it.id} className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
                    <div className="font-bold text-zinc-900 truncate mb-1" title={it.descricao}>
                      {it.descricao || it.codigo_produto}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={currentVal || ''}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          const nextMasses = { ...(editQtyModalItem.batchMasses || {}), [it.id]: val };
                          const nextTotal = Object.values(nextMasses).reduce((a, b) => a + (Number(b) || 0), 0);
                          setEditQtyModalItem({
                            ...editQtyModalItem,
                            batchMasses: nextMasses,
                            newQty: Number(nextTotal.toFixed(1))
                          });
                        }}
                        className="w-24 p-1.5 text-xs font-bold border border-zinc-300 rounded bg-white text-zinc-900 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-zinc-500 font-mono text-[11px]">kg</span>
                      <span className="text-zinc-500 font-medium text-[11px] ml-auto">
                        ~{estUn.toLocaleString('pt-BR')} un
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-800">Massa Total da Batelada:</span>
              <span className="font-mono font-extrabold text-sm text-zinc-900">{editQtyModalItem.newQty} kg</span>
            </div>
          </div>
        ) : (() => {
          const uW = parseProductUnitWeightKg(editQtyModalItem.item.descricao);
          const isB = (editQtyModalItem.item.codigo_produto || '').includes('.36.') || (editQtyModalItem.item.descricao || '').toUpperCase().startsWith('BASE ');
          const projectedUnits = Math.round(editQtyModalItem.newQty / (uW || 1));

          return (
            <div>
              <label className="font-semibold text-zinc-700 text-xs block mb-1">
                Massa a ser Produzida (kg):
              </label>
              <input
                type="number"
                autoFocus
                min={1}
                value={editQtyModalItem.newQty || ''}
                onChange={(e) => setEditQtyModalItem({ ...editQtyModalItem, newQty: Number(e.target.value) })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmEditQty();
                }}
                className="w-full p-2.5 text-sm font-bold border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-600">
                <span>Rendimento Projetado:</span>
                <strong className="text-emerald-700 font-bold text-xs">
                  {isB ? 'Base Granel' : `~${projectedUnits.toLocaleString('pt-BR')} un`}
                </strong>
              </div>
            </div>
          );
        })()}
    </Drawer>
  );
}
