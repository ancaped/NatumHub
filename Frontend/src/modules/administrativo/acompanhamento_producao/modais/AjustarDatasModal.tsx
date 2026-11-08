import React from 'react';
import Modal from '../../../geral/components/ui/Modal';
import { rotuloLote } from '../lib/lotes';
import { Calendar, Scale, FlaskConical, CheckCircle2, Droplets, Tag, CheckSquare, RefreshCw, Check } from 'lucide-react';
import type { AcompanhamentoLote } from '../lib/tipos';

export interface AjustarDatasModalProps {
  editTimestampsLote: AcompanhamentoLote;
  handleSaveTimestamps: () => Promise<void>;
  savingTimestamps: boolean;
  setEditTimestampsLote: React.Dispatch<React.SetStateAction<AcompanhamentoLote>>;
  setTimestampsForm: React.Dispatch<React.SetStateAction<{ dataPesagem: string; dataProducao: string; dataLiberadoEnvase: string; dataEnvase: string; dataRotulagem: string; dataFinalizada: string; dataPrevisao: string; }>>;
  timestampsForm: { dataPesagem: string; dataProducao: string; dataLiberadoEnvase: string; dataEnvase: string; dataRotulagem: string; dataFinalizada: string; dataPrevisao: string; };
}

export default function AjustarDatasModal({ editTimestampsLote, handleSaveTimestamps, savingTimestamps, setEditTimestampsLote, setTimestampsForm, timestampsForm }: AjustarDatasModalProps) {
  return (
<Modal title={`Ajustar Datas do Lote ${rotuloLote(editTimestampsLote.loteNumber)}`} subtitle={editTimestampsLote.productDescription} size="lg" onClose={() => setEditTimestampsLote(null)}>

            <div className="space-y-3.5">
              <div className="p-2.5 bg-zinc-50/60 border border-zinc-200 rounded-xl text-xs text-zinc-950">
                Ajuste manualmente os registros de horário de cada etapa do lote. Deixe em branco se a etapa ainda não foi iniciada ou concluída.
              </div>

              {/* Data Previsão / Programada */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-zinc-600" />
                  <span>Data Programada / Previsão (Dia de Produção)</span>
                </label>
                <input
                  type="date"
                  value={timestampsForm.dataPrevisao}
                  onChange={e => setTimestampsForm(prev => ({ ...prev, dataPrevisao: e.target.value }))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Data Pesagem */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <Scale className="h-3.5 w-3.5 text-amber-600" />
                    <span>Início Pesagem</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataPesagem}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataPesagem: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Produção */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <FlaskConical className="h-3.5 w-3.5 text-zinc-600" />
                    <span>Início Produção</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataProducao}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataProducao: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Liberado Envase */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-zinc-600" />
                    <span>Liberado para Envase</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataLiberadoEnvase}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataLiberadoEnvase: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Envase */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <Droplets className="h-3.5 w-3.5 text-zinc-600" />
                    <span>Início Envase</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataEnvase}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataEnvase: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Rotulagem */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Entrada Rotulagem</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataRotulagem}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataRotulagem: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Finalizada */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <CheckSquare className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Finalização da Ordem</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataFinalizada}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataFinalizada: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 mt-4 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setEditTimestampsLote(null)}
                disabled={savingTimestamps}
                className="px-4 py-2 text-xs font-bold text-zinc-700 hover:text-zinc-950 bg-zinc-200/70 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSaveTimestamps}
                disabled={savingTimestamps}
                className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingTimestamps ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Salvar Datas</span>
                  </>
                )}
              </button>
            </div>
</Modal>
  );
}
