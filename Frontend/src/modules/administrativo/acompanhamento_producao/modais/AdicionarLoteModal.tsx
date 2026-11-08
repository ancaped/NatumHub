import React from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { Search, X, CheckCircle2, Plus } from 'lucide-react';
import { isLoteConcluido, loteRowKey, rotuloLote, getEffectiveStatus, formatarUnidadesLote } from '../lib/lotes';
import { formatDateOnly } from '../lib/datas';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface AdicionarLoteModalProps {
  addLoteModalSearch: string;
  addLoteModalTarget: 'pesagem' | 'producao' | 'rotulagem' | 'envase';
  baseLotesFilaPesagem: AcompanhamentoLote[];
  baseLotesFilaProducao: AcompanhamentoLote[];
  baseLotesParaEncaixe: { isAlreadyScheduled: boolean; scheduledItem: any; loteNumber: string; productCode: string; productDescription: string; quantity: number; quantityKg: number; date: string; details?: string | null; erpStatus: string; erpStatusLabel: string; customStatus?: string | null; category?: string | null; updatedBy?: string | null; updatedAt?: string | null; notes?: string | null; dataPesagem?: string | null; dataProducao?: string | null; dataLiberadoEnvase?: string | null; liberadoEnvaseLaudo?: boolean; dataEnvase?: string | null; dataRotulagem?: string | null; dataFinalizada?: string | null; dataEmEspera?: string | null; dataPrevisao?: string | null; motivoEspera?: string | null; isTerceirizado: boolean; fornecedorTerceirizado?: string | null; fornecedor_terceirizado?: string | null; fichaOrdem?: any | null; ficha_ordem?: any | null; quantidadeEnvasadaParcial?: number | null; quantidade_envasada_parcial?: number | null; insumoFaltanteCodigo?: string | null; insumo_faltante_codigo?: string | null; insumoFaltanteDescricao?: string | null; insumo_faltante_descricao?: string | null; quadrosOcultos?: string[] | null; quadros_ocultos?: string[] | null; historicoReagendamentos?: any[] | null; historico_reagendamentos?: any[] | null; etapasStatus?: Record<string, { status?: string | null; motivoEspera?: string | null; insumoFaltanteCodigo?: string | null; insumoFaltanteDescricao?: string | null; updatedBy?: string | null; updatedAt?: string | null; }> | null; etapas_status?: any | null; etapasEfetivas?: Partial<Record<'pesagem' | 'producao' | 'rotulagem' | 'envase', { status: string; isEspera: boolean; isConcluido: boolean; }>> | null; pesoDesconhecido?: boolean; planningOrdem?: number | null; planning_ordem?: number | null; reatorId?: string | null; planningId?: string | null; reator_id?: string | null; }[];
  baseLotesParaRotulagem: AcompanhamentoLote[];
  handleConfirmAddLote: (lote: AcompanhamentoLote) => Promise<void>;
  lotes: AcompanhamentoLote[];
  lotesProducao: AcompanhamentoLote[];
  performRemoteLookup: (query: string) => Promise<void>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  setAddLoteModalSearch: React.Dispatch<React.SetStateAction<string>>;
  setAddLoteModalTarget: React.Dispatch<React.SetStateAction<'pesagem' | 'producao' | 'rotulagem' | 'envase'>>;
  sortedLotesPesando: AcompanhamentoLote[];
}

export default function AdicionarLoteModal({ addLoteModalSearch, addLoteModalTarget, baseLotesFilaPesagem, baseLotesFilaProducao, baseLotesParaEncaixe, baseLotesParaRotulagem, handleConfirmAddLote, lotes, lotesProducao, performRemoteLookup, programacaoEnvase, programacaoRotulagem, setAddLoteModalSearch, setAddLoteModalTarget, sortedLotesPesando }: AdicionarLoteModalProps) {
  return (
<Drawer size="md" onClose={() => setAddLoteModalTarget(null)}
  title="Adicionar Lote à Fila"
  subtitle={<span className="block whitespace-normal font-sans">Destino: <span className="font-bold text-amber-700">{
    addLoteModalTarget === 'pesagem' ? 'Fila de Pesagem' :
    addLoteModalTarget === 'producao' ? 'Fila de Produção' :
    addLoteModalTarget === 'rotulagem' ? 'Lotes Disponíveis para Rotulagem' : 'Liberados para Envase'
  }</span></span>}
  footer={
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddLoteModalTarget(null)}
                className="px-4 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
}>
<div className="space-y-3">

            {/* Campo de Busca Rápida */}
            <div className="rounded-xl p-3 bg-zinc-50 border border-zinc-200 space-y-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  autoFocus
                  value={addLoteModalSearch}
                  onChange={(e) => setAddLoteModalSearch(e.target.value)}
                  placeholder="Buscar lote por número (#), código ou produto..."
                  className="w-full bg-white border border-zinc-300 rounded-xl pl-9 pr-8 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder:text-zinc-400 font-medium"
                />
                {addLoteModalSearch && (
                  <button
                    type="button"
                    onClick={() => setAddLoteModalSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                Selecione um lote abaixo para incluí-lo nesta fila com 1 clique:
              </p>
            </div>

            {/* Lista de Candidatos */}
            <div className="space-y-2 min-h-[250px]">
              {(() => {
                const q = addLoteModalSearch.trim().toLowerCase();
                const currentSet = new Set<string>();
                if (addLoteModalTarget === 'pesagem') {
                  sortedLotesPesando.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                  baseLotesFilaPesagem.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                } else if (addLoteModalTarget === 'producao') {
                  lotesProducao.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                  baseLotesFilaProducao.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                } else if (addLoteModalTarget === 'rotulagem') {
                  programacaoRotulagem.forEach(it => currentSet.add((it.loteNumber || '').trim().toUpperCase()));
                  baseLotesParaRotulagem.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                } else if (addLoteModalTarget === 'envase') {
                  programacaoEnvase.forEach(it => currentSet.add((it.loteNumber || '').trim().toUpperCase()));
                  baseLotesParaEncaixe.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                }

                const candidates = lotes
                  .filter(l => {
                    // Se o usuário está buscando explicitamente, só bloqueia se o chão de fábrica marcou como finalizada
                    if (q) {
                      if (l.customStatus === 'Ordem Finalizada' || l.customStatus === 'Finalizada') return false;
                    } else {
                      if (isLoteConcluido(l)) return false;
                    }
                    const num = (l.loteNumber || '').trim().toUpperCase();
                    if (currentSet.has(num)) return false;
                    if (!q) return true;
                    const prodCode = (l.productCode || '').toLowerCase();
                    const prodDesc = (l.productDescription || '').toLowerCase();
                    const loteNum = (l.loteNumber || '').toLowerCase();
                    return loteNum.includes(q) || prodCode.includes(q) || prodDesc.includes(q);
                  })
                  .slice(0, 30);

                if (candidates.length === 0) {
                  return (
                    <div className="py-10 text-center text-zinc-400 space-y-3">
                      <CheckCircle2 className="h-8 w-8 mx-auto text-zinc-300" />
                      <div>
                        <p className="text-xs font-bold text-zinc-600">Nenhum lote disponível encontrado na memória</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {q ? `Nenhum lote em aberto corresponde a "${q}".` : 'Todos os lotes em aberto já estão alocados ou concluídos.'}
                        </p>
                      </div>
                      {q && (
                        <button
                          type="button"
                          onClick={() => performRemoteLookup(addLoteModalSearch)}
                          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                        >
                          <Search className="h-3.5 w-3.5" />
                          <span>Buscar #{q} no ERP / Banco Completo</span>
                        </button>
                      )}
                    </div>
                  );
                }

                return candidates.map(candidate => (
                  <div
                    key={loteRowKey(candidate)}
                    className="p-3 bg-white border border-zinc-200 rounded-xl hover:border-zinc-400 hover:shadow-2xs transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-extrabold text-zinc-900">
                          {rotuloLote(candidate.loteNumber)}
                        </span>
                        {candidate.productCode && (
                          <span className="text-[11px] md:text-[10px] text-zinc-500 font-mono">
                            [{candidate.productCode}]
                          </span>
                        )}
                        <span className="text-[11px] md:text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 font-medium">
                          {getEffectiveStatus(candidate)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-zinc-800 truncate mt-0.5">
                        {candidate.productDescription || 'Sem descrição'}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono mt-1">
                        <span>{Number(candidate.quantityKg || 0).toLocaleString('pt-BR')} kg</span>
                        <span>•</span>
                        <span>{formatarUnidadesLote(candidate)}</span>
                        {candidate.dataPrevisao && (
                          <>
                            <span>•</span>
                            <span>Prev: {formatDateOnly(candidate.dataPrevisao)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConfirmAddLote(candidate)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs hover:shadow-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{addLoteModalTarget === 'envase' ? 'Liberar Envase' : 'Adicionar'}</span>
                    </button>
                  </div>
                ));
              })()}
            </div>

            {/* Rodapé */}
</div>
</Drawer>
  );
}
