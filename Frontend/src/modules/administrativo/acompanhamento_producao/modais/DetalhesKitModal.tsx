import React from 'react';
import Modal from '../../../geral/components/ui/Modal';
import { Clock, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatDateTime, formatDurationBetween } from '../lib/datas';
import type { KitAssemblyOrder } from '../lib/tipos';

export interface DetalhesKitModalProps {
  handleUpdateKitOrder: (orderId: number, status: string, quantityAssembled: number, observations?: string) => Promise<void>;
  savingKitOrder: boolean;
  selectedKitOrder: KitAssemblyOrder;
  setSelectedKitOrder: React.Dispatch<React.SetStateAction<KitAssemblyOrder>>;
}

export default function DetalhesKitModal({ handleUpdateKitOrder, savingKitOrder, selectedKitOrder, setSelectedKitOrder }: DetalhesKitModalProps) {
  return (
<Modal title={`Ordem de Montagem #${selectedKitOrder.orderNumber}`} subtitle={`${selectedKitOrder.kitProductDescription} (SKU: ${selectedKitOrder.kitProductCode})`} size="sm" onClose={() => setSelectedKitOrder(null)}>
<div className="space-y-4">

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-zinc-700 block mb-1">Status da Ordem:</label>
                <select
                  id="kit-status-select"
                  defaultValue={selectedKitOrder.status}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="PENDING">Pendente (Aguardando)</option>
                  <option value="IN_PROGRESS">Em Montagem</option>
                  <option value="COMPLETED">Concluído</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Quantidade Montada:</label>
                <input
                  id="kit-qty-assembled"
                  type="number"
                  defaultValue={selectedKitOrder.quantityAssembled ?? selectedKitOrder.quantity}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 font-mono font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <span className="text-[11px] md:text-[10px] text-zinc-400 mt-1 block">
                  Total solicitado na ordem: {selectedKitOrder.quantity} kits.
                </span>
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Observações / Motivo de Espera:</label>
                <textarea
                  id="kit-obs"
                  defaultValue={selectedKitOrder.observations || ''}
                  placeholder="Ex: Em Espera - Aguardando caixa do fornecedor..."
                  rows={3}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              {/* Resumo de Tempo de Montagem */}
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-zinc-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5 text-zinc-500" />
                    Criado em:
                  </span>
                  <span className="font-mono font-semibold">{formatDateTime(selectedKitOrder.createdAt)}</span>
                </div>
                {selectedKitOrder.completedAt && (
                  <div className="flex items-center justify-between text-zinc-600">
                    <span className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Concluído em:
                    </span>
                    <span className="font-mono font-semibold">{formatDateTime(selectedKitOrder.completedAt)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-200 text-zinc-900 font-bold">
                  <span>Tempo {selectedKitOrder.status === 'COMPLETED' ? 'Total de Montagem' : 'Decorrido'}:</span>
                  <span className="font-mono text-zinc-700 font-extrabold text-sm">
                    {formatDurationBetween(selectedKitOrder.createdAt, selectedKitOrder.completedAt)}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedKitOrder(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingKitOrder}
                onClick={() => {
                  const statusEl = document.getElementById('kit-status-select') as HTMLSelectElement;
                  const qtyEl = document.getElementById('kit-qty-assembled') as HTMLInputElement;
                  const obsEl = document.getElementById('kit-obs') as HTMLTextAreaElement;
                  handleUpdateKitOrder(
                    selectedKitOrder.id,
                    statusEl.value,
                    Number(qtyEl.value) || 0,
                    obsEl.value.trim()
                  );
                }}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingKitOrder && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Salvar Ordem de Kit</span>
              </button>
            </div>
</div>
</Modal>
  );
}
