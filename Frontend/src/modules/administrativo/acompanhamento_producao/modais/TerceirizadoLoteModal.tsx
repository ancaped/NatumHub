import React from 'react';
import Modal from '../../../geral/components/ui/Modal';
import { rotuloLote, formatarUnidadesLote } from '../lib/lotes';
import { RotateCcw, RefreshCw } from 'lucide-react';
import type { AcompanhamentoLote } from '../lib/tipos';

export interface TerceirizadoLoteModalProps {
  editTerceirizadoFornecedor: string;
  editTerceirizadoLote: AcompanhamentoLote;
  editTerceirizadoPrevisao: string;
  handleReturnTerceirizadoFromModal: () => Promise<void>;
  handleSaveEditTerceirizado: () => Promise<void>;
  savingTerceirizado: boolean;
  setEditTerceirizadoFornecedor: React.Dispatch<React.SetStateAction<string>>;
  setEditTerceirizadoLote: React.Dispatch<React.SetStateAction<AcompanhamentoLote>>;
  setEditTerceirizadoPrevisao: React.Dispatch<React.SetStateAction<string>>;
}

export default function TerceirizadoLoteModal({ editTerceirizadoFornecedor, editTerceirizadoLote, editTerceirizadoPrevisao, handleReturnTerceirizadoFromModal, handleSaveEditTerceirizado, savingTerceirizado, setEditTerceirizadoFornecedor, setEditTerceirizadoLote, setEditTerceirizadoPrevisao }: TerceirizadoLoteModalProps) {
  return (
<Modal title={editTerceirizadoLote.isTerceirizado ? 'Editar Lote Terceirizado' : 'Mover para Terceirizados'} subtitle={`Lote ${rotuloLote(editTerceirizadoLote.loteNumber)} • ${editTerceirizadoLote.productCode}`} size="sm" onClose={() => setEditTerceirizadoLote(null)}>

            <div className="space-y-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-1">
                <p className="text-xs font-bold text-zinc-800 line-clamp-2">
                  {editTerceirizadoLote.productDescription}
                </p>
                <div className="flex items-center justify-between text-xs text-zinc-600 pt-1 border-t border-zinc-200/60 font-mono">
                  <span>Massa: <strong>{Number(editTerceirizadoLote.quantityKg || 0).toLocaleString('pt-BR')} kg</strong></span>
                  <span>Unidades: <strong>{formatarUnidadesLote(editTerceirizadoLote)}</strong></span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Fornecedor Terceirizado
                </label>
                <input
                  type="text"
                  value={editTerceirizadoFornecedor}
                  onChange={e => setEditTerceirizadoFornecedor(e.target.value)}
                  placeholder="Nome do terceirista / fornecedor..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Previsão de Entrega
                </label>
                <input
                  type="date"
                  value={editTerceirizadoPrevisao}
                  onChange={e => setEditTerceirizadoPrevisao(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              {editTerceirizadoLote.isTerceirizado && (
                <div className="pt-2 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={handleReturnTerceirizadoFromModal}
                    disabled={savingTerceirizado}
                    className="text-xs text-amber-700 hover:text-amber-900 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Retornar para Produção Interna</span>
                  </button>
                </div>
              )}
            </div>

            <div className="pt-3 mt-4 border-t border-zinc-100 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTerceirizadoLote(null)}
                className="px-3.5 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditTerceirizado}
                disabled={savingTerceirizado}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingTerceirizado && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Salvar Alterações</span>
              </button>
            </div>
</Modal>
  );
}
