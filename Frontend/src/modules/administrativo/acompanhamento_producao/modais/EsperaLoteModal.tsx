import React from 'react';
import Modal from '../../../geral/components/ui/Modal';
import { MOTIVOS_PAUSA_PADRAO } from '../lib/constantes';

export interface EsperaLoteModalProps {
  batchCustomMotivo: string;
  batchEsperaMotivo: string;
  handleApplyBatchStatus: (statusValue: string, motivoOverride?: string | null, resetConfirmado?: boolean, motivoReset?: string) => Promise<void>;
  isBatchUpdating: boolean;
  selectedLotes: Set<string>;
  setBatchCustomMotivo: React.Dispatch<React.SetStateAction<string>>;
  setBatchEsperaMotivo: React.Dispatch<React.SetStateAction<string>>;
  setBatchStatusValue: React.Dispatch<React.SetStateAction<string>>;
  setShowBatchEsperaModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function EsperaLoteModal({ batchCustomMotivo, batchEsperaMotivo, handleApplyBatchStatus, isBatchUpdating, selectedLotes, setBatchCustomMotivo, setBatchEsperaMotivo, setBatchStatusValue, setShowBatchEsperaModal }: EsperaLoteModalProps) {
  return (
<Modal title={`Pausar ${selectedLotes.size} Lotes em Espera`} size="sm" onClose={() => { setShowBatchEsperaModal(false); setBatchStatusValue(''); }}>
<div className="space-y-4">
<p className="text-xs text-zinc-500">Selecione o motivo da pausa para os lotes selecionados</p>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-zinc-700">Motivo da Pausa:</label>
                <select
                  value={batchEsperaMotivo}
                  onChange={e => setBatchEsperaMotivo(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  {MOTIVOS_PAUSA_PADRAO.map(motivo => (
                    <option key={motivo} value={motivo}>{motivo}</option>
                  ))}
                  <option value="Outro">Outro Motivo (personalizado)...</option>
                </select>
              </div>

              {batchEsperaMotivo === 'Outro' && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-zinc-700">Descreva o motivo:</label>
                  <input
                    type="text"
                    value={batchCustomMotivo}
                    onChange={e => setBatchCustomMotivo(e.target.value)}
                    placeholder="Ex: Aguardando aprovação de lote..."
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => { setShowBatchEsperaModal(false); setBatchStatusValue(''); }}
                className="px-4 py-2 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = batchEsperaMotivo === 'Outro' ? batchCustomMotivo.trim() : batchEsperaMotivo;
                  handleApplyBatchStatus('Em Espera', m || 'Em Espera');
                }}
                disabled={isBatchUpdating}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isBatchUpdating ? 'Aplicando...' : `Confirmar para ${selectedLotes.size} Lotes`}
              </button>
            </div>
</div>
</Modal>
  );
}
