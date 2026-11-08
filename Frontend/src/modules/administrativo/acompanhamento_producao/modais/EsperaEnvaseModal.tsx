import React from 'react';
import Modal from '../../../geral/components/ui/Modal';
import { rotuloLote } from '../lib/lotes';
import { PauseCircle } from 'lucide-react';
import type { ProgramacaoEnvaseItem } from '../lib/tipos';

export interface EsperaEnvaseModalProps {
  envaseEsperaCustom: string;
  envaseEsperaItem: ProgramacaoEnvaseItem;
  envaseEsperaMotivo: string;
  envaseEsperaMotivoRestante: string;
  envaseEsperaParcialQtd: number;
  handleConfirmEnvaseEspera: () => Promise<void>;
  setEnvaseEsperaCustom: React.Dispatch<React.SetStateAction<string>>;
  setEnvaseEsperaItem: React.Dispatch<React.SetStateAction<ProgramacaoEnvaseItem>>;
  setEnvaseEsperaMotivo: React.Dispatch<React.SetStateAction<string>>;
  setEnvaseEsperaMotivoRestante: React.Dispatch<React.SetStateAction<string>>;
  setEnvaseEsperaParcialQtd: React.Dispatch<React.SetStateAction<number>>;
}

export default function EsperaEnvaseModal({ envaseEsperaCustom, envaseEsperaItem, envaseEsperaMotivo, envaseEsperaMotivoRestante, envaseEsperaParcialQtd, handleConfirmEnvaseEspera, setEnvaseEsperaCustom, setEnvaseEsperaItem, setEnvaseEsperaMotivo, setEnvaseEsperaMotivoRestante, setEnvaseEsperaParcialQtd }: EsperaEnvaseModalProps) {
  return (
<Modal title="Colocar Envase em Espera" subtitle={`Lote ${rotuloLote(envaseEsperaItem.loteNumber)} • ${envaseEsperaItem.linha}`} size="sm" onClose={() => setEnvaseEsperaItem(null)}>

            <div className="space-y-4">
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200 text-xs space-y-1">
                <div className="font-bold text-zinc-900">{envaseEsperaItem.productCode} - {envaseEsperaItem.productDescription}</div>
                <div className="flex items-center justify-between text-zinc-500 font-mono text-[11px] pt-1">
                  <span>Qtd: <strong>{Number(envaseEsperaItem.quantity).toLocaleString('pt-BR')} un</strong></span>
                  <span>Massa: <strong>{Number(envaseEsperaItem.quantityKg).toLocaleString('pt-BR')} kg</strong></span>
                  <span>Linha: <strong>{envaseEsperaItem.linha}</strong></span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Motivo da Espera / Pausa *</label>
                <select
                  value={envaseEsperaMotivo}
                  onChange={e => setEnvaseEsperaMotivo(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                >
                  <option value="Falta de Embalagem / Frasco">Falta de Embalagem / Frasco</option>
                  <option value="Falta de Tampa / Válvula / Bico">Falta de Tampa / Válvula / Bico</option>
                  <option value="Falta de Rótulo / Etiqueta">Falta de Rótulo / Etiqueta</option>
                  <option value="Envase Parcial (interrompido)">Envase Parcial (interrompido)</option>
                  <option value="Problema Mecânico na Envasadora">Problema Mecânico na Envasadora</option>
                  <option value="Aguardando Liberação do CQ / Físico-Químico">Aguardando Liberação do CQ / Físico-Químico</option>
                  <option value="Setup / Troca de Formato de Linha">Setup / Troca de Formato de Linha</option>
                  <option value="Aguardando Matéria-Prima / Bulk">Aguardando Matéria-Prima / Bulk</option>
                  <option value="Outro Motivo">Outro Motivo (especificar abaixo)</option>
                </select>
              </div>

              {envaseEsperaMotivo === 'Envase Parcial (interrompido)' ? (
                <div className="space-y-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-amber-950">
                      Quantidade Já Envasada (unidades) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Number(envaseEsperaItem.quantity) || undefined}
                      value={envaseEsperaParcialQtd || ''}
                      onChange={e => setEnvaseEsperaParcialQtd(e.target.value ? Number(e.target.value) : null)}
                      placeholder={`Ex: 500 (Total da ordem: ${Number(envaseEsperaItem.quantity).toLocaleString('pt-BR')} un)`}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                    />
                    {envaseEsperaParcialQtd !== null && envaseEsperaParcialQtd > 0 && (
                      <div className="text-[11px] text-amber-900 font-medium">
                        Restante a envasar posteriormente: <strong>{Math.max(0, (Number(envaseEsperaItem.quantity) || 0) - envaseEsperaParcialQtd).toLocaleString('pt-BR')} un</strong>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-amber-950">
                      Motivo de não ter envasado o restante
                    </label>
                    <textarea
                      rows={2}
                      value={envaseEsperaMotivoRestante}
                      onChange={e => setEnvaseEsperaMotivoRestante(e.target.value)}
                      placeholder="Ex: Faltou frasco para o restante do lote, troca de lote urgente..."
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-400"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">
                    Observações Adicionais / Detalhes {envaseEsperaMotivo === 'Outro Motivo' && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    rows={2}
                    value={envaseEsperaCustom}
                    onChange={e => setEnvaseEsperaCustom(e.target.value)}
                    placeholder="Ex: Faltando frasco de 250ml âmbar, previsão de chegada às 14h..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
              )}
            </div>

            <div className="pt-3 mt-4 border-t border-zinc-100 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEnvaseEsperaItem(null)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-200/60 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmEnvaseEspera}
                disabled={
                  (envaseEsperaMotivo === 'Outro Motivo' && !envaseEsperaCustom.trim()) ||
                  (envaseEsperaMotivo === 'Envase Parcial (interrompido)' && (!envaseEsperaParcialQtd || envaseEsperaParcialQtd <= 0))
                }
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                <span>Confirmar Espera</span>
              </button>
            </div>
</Modal>
  );
}
