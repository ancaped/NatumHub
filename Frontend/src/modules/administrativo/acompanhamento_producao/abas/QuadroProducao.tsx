import React from 'react';
import { FlaskConical, Flame, Check, FastForward, Undo2, ArrowUp, ArrowDown, CalendarPlus, Eye, CheckCircle2, Scale, Plus, Search, X, PauseCircle, Play, Pencil } from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { getLoteEtapaStatus, loteRowKey, isLoteParcial, renderCardTimelineDates, formatarUnidadesLote, getLoteEsperaDetails } from '../lib/lotes';
import { formatDateOnly, parseLoteDateToIso } from '../lib/datas';
import { apiJson } from '../../../geral/lib/http';
import type { UnifiedQuadroHeaderProps, AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface QuadroProducaoProps {
  baseLotesFilaProducao: AcompanhamentoLote[];
  caldeiraAtiva: { ligouEm: string; operador: string; lotes: string[]; };
  currentUser: AuthUser;
  dragOverTarget: string;
  fetchLotes: () => Promise<void>;
  filteredLotesCaldeira: AcompanhamentoLote[];
  filteredLotesReatoresNormais: AcompanhamentoLote[];
  getLoteAdiadoInfo: (loteNumber: string, targetDate: string, etapa?: string) => { dataAdiadoPara: any; dataOriginal: any; isDestino: boolean; };
  handleCancelAdiarLote: (loteNumber: string, targetDateToRestore?: string, etapa?: string, productCode?: string) => Promise<void>;
  handleDropProducao: (e: React.DragEvent, targetLocation: 'ativa' | 'fila' | 'caldeira', targetIndex?: number) => Promise<void>;
  handleMoveLoteNextDay: (lote: AcompanhamentoLote, targetDateOverride?: string) => Promise<void>;
  handleMoverParaCaldeira: (loteNumber: string) => Promise<void>;
  handleOpenAddLoteModal: (target: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleOpenEditTimestamps: (lote: AcompanhamentoLote) => void;
  handleOpenPauseModal: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleRemoverDaFila: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  handleReorderProducao: (loteNumber: string, direction: 'up' | 'down') => void;
  handleResumeLote: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  handleToggleCaldeiraLote: (loteNumber: string) => Promise<void>;
  insumosFaltantesList: { codigo: string; descricao: string; count: number; }[];
  loading: boolean;
  lotesCaldeira: AcompanhamentoLote[];
  lotesFilaProducao: AcompanhamentoLote[];
  lotesReatoresNormais: AcompanhamentoLote[];
  multiProductLoteNumbers: Set<string>;
  performRemoteLookup: (query: string) => Promise<void>;
  producaoConcluidosLotes: string[];
  producaoFilaFilter: 'TODOS' | 'ESPERA';
  producaoFilaSearch: string;
  producaoSearch: string;
  producaoSelectedDate: string;
  producaoShowAllDates: boolean;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  renderLoteEsperaBadge: (lote: AcompanhamentoLote) => React.JSX.Element;
  renderLoteNumberBadge: (loteNum: string) => React.JSX.Element;
  renderLoteProblemaBanner: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => React.JSX.Element;
  renderLoteProductsInfo: (lote: AcompanhamentoLote | { loteNumber: string; productCode?: string; productDescription?: string; quantity?: number; quantityKg?: number; }, options?: { isConsolidatedBatch?: boolean; }) => React.JSX.Element;
  renderUnifiedQuadroHeader: ({ title, subtitle, icon, selectedDate, setSelectedDate, showAllDates, setShowAllDates, badgeCount, badgeCountLabel, badgeKg, badgeUn, badgeExtra, operationalMetrics, actionButtons, onRefresh, isRefreshing, }: UnifiedQuadroHeaderProps) => React.JSX.Element;
  saveEtapaStatus: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase', status: string, motivoEspera?: string | null, insumoFaltanteCodigo?: string | null, insumoFaltanteDescricao?: string | null, updatedBy?: string, dataAgendada?: string | null) => Promise<void>;
  selectedInsumoFaltanteFilter: string;
  setDragCardInfo: React.Dispatch<React.SetStateAction<{ board: 'envase' | 'rotulagem' | 'pesagem' | 'producao'; source: string; id?: number | string; loteNumber: string; productCode?: string; index?: number; linha?: 'Linha 1' | 'Linha 2' | 'Linha 3'; tipo?: 'MAQUINA' | 'MANUAL'; }>>;
  setDragOverTarget: React.Dispatch<React.SetStateAction<string>>;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setProducaoConcluidosLotes: (u: string[] | ((prev: string[]) => string[])) => void;
  setProducaoFilaFilter: React.Dispatch<React.SetStateAction<'TODOS' | 'ESPERA'>>;
  setProducaoFilaSearch: React.Dispatch<React.SetStateAction<string>>;
  setProducaoOrderOverrides: (u: string[] | ((prev: string[]) => string[])) => void;
  setProducaoSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  setProducaoShowAllDates: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedInsumoFaltanteFilter: React.Dispatch<React.SetStateAction<string>>;
  setSelectedLoteDetails: React.Dispatch<React.SetStateAction<{ lote: AcompanhamentoLote | ProgramacaoEnvaseItem | ProgramacaoRotulagemItem; etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens'; }>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export default function QuadroProducao({ baseLotesFilaProducao, caldeiraAtiva, currentUser, dragOverTarget, fetchLotes, filteredLotesCaldeira, filteredLotesReatoresNormais, getLoteAdiadoInfo, handleCancelAdiarLote, handleDropProducao, handleMoveLoteNextDay, handleMoverParaCaldeira, handleOpenAddLoteModal, handleOpenEditTimestamps, handleOpenPauseModal, handleRemoverDaFila, handleReorderProducao, handleResumeLote, handleToggleCaldeiraLote, insumosFaltantesList, loading, lotesCaldeira, lotesFilaProducao, lotesReatoresNormais, multiProductLoteNumbers, performRemoteLookup, producaoConcluidosLotes, producaoFilaFilter, producaoFilaSearch, producaoSearch, producaoSelectedDate, producaoShowAllDates, programacaoEnvase, programacaoRotulagem, renderLoteEsperaBadge, renderLoteNumberBadge, renderLoteProblemaBanner, renderLoteProductsInfo, renderUnifiedQuadroHeader, saveEtapaStatus, selectedInsumoFaltanteFilter, setDragCardInfo, setDragOverTarget, setLotes, setProducaoConcluidosLotes, setProducaoFilaFilter, setProducaoFilaSearch, setProducaoOrderOverrides, setProducaoSelectedDate, setProducaoShowAllDates, setSelectedInsumoFaltanteFilter, setSelectedLoteDetails, showToast }: QuadroProducaoProps) {
  return (
<div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Quadro de Produção & Caldeira",
            subtitle: "Acompanhamento da produção nos reatores, processos térmicos na caldeira e fila de produção.",
            icon: <FlaskConical className="h-6 w-6 text-white" />,
            selectedDate: producaoSelectedDate,
            setSelectedDate: setProducaoSelectedDate,
            showAllDates: producaoShowAllDates,
            setShowAllDates: setProducaoShowAllDates,
            badgeCount: lotesReatoresNormais.length + lotesCaldeira.length + lotesFilaProducao.length,
            badgeKg: lotesReatoresNormais.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0) + lotesCaldeira.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0) + lotesFilaProducao.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0),
            onRefresh: fetchLotes,
            isRefreshing: loading,
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold">
                  <FlaskConical className="h-3.5 w-3.5 text-zinc-600" />
                  <span>Produção:</span>
                  <span className="font-mono">{lotesReatoresNormais.length} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">
                    {lotesReatoresNormais.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold bg-zinc-50 border-zinc-200 text-zinc-800">
                  <Flame className="h-3.5 w-3.5 text-amber-600" />
                  <span>Caldeira:</span>
                  <span className="font-mono">{lotesCaldeira.length} lotes</span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Fila:</span>
                  <span className="font-mono text-zinc-900">{lotesFilaProducao.length} lotes</span>
                </div>
              </>
            ),
          })}

          {/* QUADRO PRINCIPAL COM 3 COLUNAS LADO A LADO: REATORES | CALDEIRA | FILA */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* COLUNA 1: QUADRO DE PRODUÇÃO (4 COLUNAS) */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-4 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-white" />
                  <span className="font-extrabold text-sm tracking-tight">Quadro de Produção</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                    {filteredLotesReatoresNormais.length}{producaoSearch ? ` / ${lotesReatoresNormais.length}` : ''}
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    {filteredLotesReatoresNormais.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTarget('producao-reatores');
                }}
                onDragLeave={() => {
                  if (dragOverTarget === 'producao-reatores') setDragOverTarget(null);
                }}
                onDrop={(e) => handleDropProducao(e, 'ativa')}
                className={cn(
                  "p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5 transition-colors",
                  dragOverTarget === 'producao-reatores' ? "bg-zinc-50/60 ring-2 ring-zinc-400 rounded-xl" : ""
                )}
              >
                {filteredLotesReatoresNormais.length === 0 ? (
                  <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <FlaskConical className="h-10 w-10 mx-auto mb-2 text-zinc-300" />
                    <p className="text-sm font-bold text-zinc-700">
                      {producaoSearch ? `Nenhum lote nos reatores com "${producaoSearch}"` : 'Nenhum lote em fabricação nos reatores'}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Inicie a fabricação de um lote da fila ao lado para organizá-lo na sequência.
                    </p>
                  </div>
                ) : (
                  filteredLotesReatoresNormais.map((lote, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === filteredLotesReatoresNormais.length - 1;
                    const isSearched = !!(producaoSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(producaoSearch.trim().toLowerCase())
                    ));

                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, producaoSelectedDate, 'producao');
                    const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);
                    const etapaProducao = getLoteEtapaStatus(lote, 'producao');
                    const isProdConcluida = producaoConcluidosLotes.includes(lote.loteNumber) || etapaProducao.isConcluido;

                    return (
                      <div
                        key={loteRowKey(lote)}
                        draggable
                        onDragStart={(e) => {
                          setDragCardInfo({ board: 'producao', source: 'ativa', id: lote.loteNumber, loteNumber: lote.loteNumber, index: idx });
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            board: 'producao',
                            source: 'ativa',
                            loteNumber: lote.loteNumber,
                            index: idx
                          }));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.stopPropagation();
                          handleDropProducao(e, 'ativa', idx);
                        }}
                        className={cn(
                          "bg-white border rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2.5 cursor-grab active:cursor-grabbing hover:border-zinc-400",
                          isAdiadoOriginal
                            ? "border-red-400 bg-red-50/25 ring-1 ring-red-300"
                            : isSearched
                              ? "border-zinc-500 ring-2 ring-zinc-300/80 bg-zinc-50/20"
                              : isProdConcluida
                                ? "border-emerald-400 bg-emerald-50/20 ring-1 ring-emerald-200"
                                : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 pb-2 border-b border-zinc-100">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {idx + 1}º
                            </span>
                            {isProdConcluida ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 font-mono">
                                <Check className="h-3.5 w-3.5 text-emerald-700" />
                                Concluído
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-zinc-200">
                                Em Fabricação (Reator)
                              </span>
                            )}
                            {isAdiadoOriginal && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300 font-mono flex items-center gap-1"
                                  title={`Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-red-600" />
                                  Adiado p/ {formatDateOnly(adiadoInfo.dataAdiadoPara)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'producao', lote.productCode)}
                                  className="px-1.5 py-0.5 text-[11px] md:text-[10px] font-bold text-red-700 hover:text-white bg-red-50 hover:bg-red-600 border border-red-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                            {isMulti && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono" title="Ordem conjunta com múltiplos produtos">
                                Multi-Produto
                              </span>
                            )}
                            {isLoteParcial(lote) && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono" title="Ordem com apontamento parcial pendente">
                                Parcial
                              </span>
                            )}
                            {isSearched && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-white font-mono">Buscado</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleReorderProducao(lote.loteNumber, 'up')}
                              disabled={isFirst}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-500 disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderProducao(lote.loteNumber, 'down')}
                              disabled={isLast}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-500 disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Descer ordem"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-700 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'producao' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, 'reatores', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(lote, 'producao')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {formatarUnidadesLote(lote)}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const newConcluido = !isProdConcluida;
                              if (newConcluido) {
                                setProducaoConcluidosLotes(prev => {
                                  const next = Array.from(new Set([...prev, lote.loteNumber]));
                                  return next;
                                });
                                const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                saveEtapaStatus(lote.loteNumber, 'producao', 'concluido', null, null, null, responsibleName);
                                showToast(`Fabricação do lote #${lote.loteNumber} concluída (marcada como realizada)!`);
                              } else {
                                setProducaoConcluidosLotes(prev => {
                                  const next = prev.filter(x => x !== lote.loteNumber);
                                  return next;
                                });
                                const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                saveEtapaStatus(lote.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
                                showToast(`Fabricação do lote #${lote.loteNumber} desmarcada (planejamento pendente).`);
                              }
                            }}
                            className={cn(
                              "py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center justify-center flex-1",
                              isProdConcluida
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                            )}
                            title={isProdConcluida ? "Desmarcar realização da fabricação" : "Concluir fabricação (marcar planejamento como realizado)"}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleCaldeiraLote(lote.loteNumber)}
                            className="py-1.5 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                            title="Mover para o Quadro de Caldeira ao lado"
                          >
                            <Flame className="h-4 w-4 text-amber-600 fill-amber-500" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProducaoOrderOverrides(prev => {
                                const next = prev.filter(x => x !== lote.loteNumber);
                                return next;
                              });
                              setProducaoConcluidosLotes(prev => {
                                const next = prev.filter(x => x !== lote.loteNumber);
                                return next;
                              });
                              const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                              saveEtapaStatus(lote.loteNumber, 'producao', 'fila', null, null, null, responsibleName);
                              showToast(`Lote #${lote.loteNumber} retornado para a Fila de Produção.`);
                            }}
                            className="py-1.5 px-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                            title="Retornar lote para a Fila de Produção"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 2: QUADRO DE CALDEIRA (4 COLUNAS - LADO A LADO) */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-4 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "p-1 rounded text-white",
                    caldeiraAtiva ? "bg-amber-500/20 text-amber-400" : "bg-white/10 text-zinc-300"
                  )}>
                    <Flame className="h-4 w-4 fill-amber-400 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm tracking-tight">Quadro de Caldeira</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white border border-white/10">
                    {filteredLotesCaldeira.length}{producaoSearch ? ` / ${lotesCaldeira.length}` : ''}
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    {filteredLotesCaldeira.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTarget('producao-caldeira');
                }}
                onDragLeave={() => {
                  if (dragOverTarget === 'producao-caldeira') setDragOverTarget(null);
                }}
                onDrop={(e) => handleDropProducao(e, 'caldeira')}
                className={cn(
                  "p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5 transition-colors",
                  dragOverTarget === 'producao-caldeira' ? "bg-zinc-100/60 ring-2 ring-zinc-400 rounded-xl" : ""
                )}
              >
                {filteredLotesCaldeira.length === 0 ? (
                  <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white shadow-2xs">
                    <Flame className="h-10 w-10 mx-auto mb-2 text-zinc-300" />
                    <p className="text-sm font-bold text-zinc-800">
                      {producaoSearch ? `Nenhum lote na caldeira com "${producaoSearch}"` : 'Nenhum lote no Quadro de Caldeira'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                      Clique em <span className="font-bold text-zinc-800">"+ Caldeira"</span> nos reatores ao lado ou na fila para alocar lotes aqui.
                    </p>
                  </div>
                ) : (
                  filteredLotesCaldeira.map((lote, idx) => {
                    const isSearched = !!(producaoSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(producaoSearch.trim().toLowerCase())
                    ));

                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, producaoSelectedDate, 'producao');
                    const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);
                    const etapaProducao = getLoteEtapaStatus(lote, 'producao');
                    const isCaldeiraConcluida = producaoConcluidosLotes.includes(lote.loteNumber) || etapaProducao.isConcluido;

                    return (
                      <div
                        key={loteRowKey(lote)}
                        draggable
                        onDragStart={(e) => {
                          setDragCardInfo({ board: 'producao', source: 'caldeira', id: lote.loteNumber, loteNumber: lote.loteNumber, index: idx });
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            board: 'producao',
                            source: 'caldeira',
                            loteNumber: lote.loteNumber,
                            index: idx
                          }));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.stopPropagation();
                          handleDropProducao(e, 'caldeira', idx);
                        }}
                        className={cn(
                          "bg-white border-2 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2.5 ring-1 cursor-grab active:cursor-grabbing hover:border-amber-400",
                          isAdiadoOriginal
                            ? "border-red-400 bg-red-50/25 ring-red-300"
                            : isSearched
                              ? "border-amber-500 ring-amber-300 bg-amber-50/20"
                              : isCaldeiraConcluida
                                ? "border-emerald-400 bg-emerald-50/20 ring-emerald-200"
                                : "border-amber-200 ring-amber-100"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 pb-2 border-b border-amber-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-amber-600 text-white flex items-center gap-1">
                              <Flame className="h-3 w-3 fill-white text-white" />
                              <span>{idx + 1}º Caldeira</span>
                            </span>
                            {isCaldeiraConcluida ? (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 font-mono">
                                <Check className="h-3 w-3 text-emerald-700" />
                                Concluído
                              </span>
                            ) : caldeiraAtiva ? (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-900 border border-red-300 animate-pulse flex items-center gap-1">
                                <Flame className="h-3 w-3 fill-red-600 text-red-600" />
                                Aquecendo
                              </span>
                            ) : (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                                Processo Térmico
                              </span>
                            )}
                            {isAdiadoOriginal && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300 font-mono flex items-center gap-1"
                                  title={`Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-red-600" />
                                  Adiado p/ {formatDateOnly(adiadoInfo.dataAdiadoPara)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'producao', lote.productCode)}
                                  className="px-1.5 py-0.5 text-[11px] md:text-[10px] font-bold text-red-700 hover:text-white bg-red-50 hover:bg-red-600 border border-red-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                            {isMulti && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono" title="Ordem conjunta com múltiplos produtos">
                                Multi-Produto
                              </span>
                            )}
                            {isLoteParcial(lote) && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono" title="Ordem com apontamento parcial pendente">
                                Parcial
                              </span>
                            )}
                            {isSearched && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-white font-mono">Buscado</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-amber-100 rounded text-zinc-400 hover:text-zinc-600 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'producao' })}
                              className="p-1 hover:bg-amber-50 rounded text-zinc-600 hover:text-amber-950 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleCaldeiraLote(lote.loteNumber)}
                              className="p-1 text-zinc-500 hover:text-red-700 hover:bg-red-50 border border-zinc-200 rounded-md cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Remover da Caldeira e retornar para os Reatores"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, 'caldeira', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(lote, 'producao')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-amber-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {formatarUnidadesLote(lote)}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-amber-100 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const newConcluido = !isCaldeiraConcluida;
                              if (newConcluido) {
                                setProducaoConcluidosLotes(prev => {
                                  const next = Array.from(new Set([...prev, lote.loteNumber]));
                                  return next;
                                });
                                const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                saveEtapaStatus(lote.loteNumber, 'producao', 'concluido', null, null, null, responsibleName);
                                showToast(`Processamento térmico do lote #${lote.loteNumber} concluído (marcado como realizado)!`);
                              } else {
                                setProducaoConcluidosLotes(prev => {
                                  const next = prev.filter(x => x !== lote.loteNumber);
                                  return next;
                                });
                                const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                saveEtapaStatus(lote.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
                                showToast(`Processamento térmico do lote #${lote.loteNumber} desmarcado (planejamento pendente).`);
                              }
                            }}
                            className={cn(
                              "py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center justify-center flex-1",
                              isCaldeiraConcluida
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                            )}
                            title={isCaldeiraConcluida ? "Desmarcar realização da caldeira" : "Concluir caldeira (marcar planejamento como realizado)"}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 3: FILA DE PRODUÇÃO (AGUARDANDO INÍCIO) */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-4 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-zinc-300" />
                  <span className="font-extrabold text-sm tracking-tight">Fila de Produção</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddLoteModal('producao')}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="Adicionar lote na Fila de Produção"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Adicionar Lote</span>
                  </button>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                    {lotesFilaProducao.length}{producaoFilaSearch || producaoFilaFilter === 'ESPERA' ? ` / ${baseLotesFilaProducao.length}` : ''}
                  </span>
                </div>
              </div>

              {/* Barra de Pesquisa e Lotes Externos na Fila de Produção */}
              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={producaoFilaSearch}
                    onChange={(e) => setProducaoFilaSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(producaoFilaSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {producaoFilaSearch && (
                    <button
                      type="button"
                      onClick={() => setProducaoFilaSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Seletor rápido: Todos na Fila vs Em Espera */}
                  <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-white shrink-0 text-xs">
                    <button
                      type="button"
                      onClick={() => setProducaoFilaFilter('TODOS')}
                      className={cn(
                        "px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1",
                        producaoFilaFilter === 'TODOS'
                          ? "bg-zinc-900 text-white shadow-2xs"
                          : "text-zinc-600 hover:text-zinc-900"
                      )}
                    >
                      <span>Todos na Fila</span>
                      <span className="font-mono text-[11px] md:text-[10px] opacity-80">({baseLotesFilaProducao.length})</span>
                    </button>
                  </div>

                  {/* Filtro de Insumo Faltante */}
                  {insumosFaltantesList.length > 0 && (
                    <select
                      value={selectedInsumoFaltanteFilter}
                      onChange={(e) => setSelectedInsumoFaltanteFilter(e.target.value)}
                      className="flex-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-md px-2 py-1 text-[11px] font-bold focus:outline-none cursor-pointer truncate"
                      title="Filtrar por Insumo Faltante"
                    >
                      <option value="TODOS">⚠️ Insumo Faltante (Todos)</option>
                      {insumosFaltantesList.filter(i => i && i.codigo).map(i => (
                        <option key={i.codigo} value={i.codigo}>
                          [{i.codigo}] {i.descricao} ({i.count})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTarget('producao-fila');
                }}
                onDragLeave={() => {
                  if (dragOverTarget === 'producao-fila') setDragOverTarget(null);
                }}
                onDrop={(e) => handleDropProducao(e, 'fila')}
                className={cn(
                  "p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5 transition-colors",
                  dragOverTarget === 'producao-fila' ? "bg-amber-50/60 ring-2 ring-amber-500 rounded-xl" : ""
                )}
              >
                {lotesFilaProducao.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">
                      {producaoFilaFilter === 'ESPERA'
                        ? 'Nenhum lote pausado / em espera na produção'
                        : producaoFilaSearch
                          ? `Nenhum lote na fila com a busca "${producaoFilaSearch}"`
                          : 'Nenhum lote aguardando fabricação'}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {producaoFilaFilter === 'ESPERA'
                        ? 'Todos os lotes da fila de produção estão liberados para fabricação.'
                        : 'Conclua a pesagem de lotes na aba Quadro de Pesagem para que eles apareçam aqui.'}
                    </p>
                  </div>
                ) : (
                  lotesFilaProducao.map((lote, idx) => {
                    const esperaDetails = getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem);
                    const etapaProducao = getLoteEtapaStatus(lote, 'producao');
                    const isEspera = esperaDetails.isEmEspera;
                    const isSearched = !!(producaoFilaSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(producaoFilaSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(producaoFilaSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(producaoFilaSearch.trim().toLowerCase())
                    ));

                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, producaoSelectedDate, 'producao');
                    const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);

                    return (
                      <div
                        key={loteRowKey(lote)}
                        draggable
                        onDragStart={(e) => {
                          setDragCardInfo({ board: 'producao', source: 'fila', id: lote.loteNumber, loteNumber: lote.loteNumber, index: idx });
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            board: 'producao',
                            source: 'fila',
                            loteNumber: lote.loteNumber,
                            index: idx
                          }));
                        }}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2 cursor-grab active:cursor-grabbing hover:border-amber-400",
                          isAdiadoOriginal
                            ? "border-red-400 bg-red-50/25 ring-1 ring-red-300"
                            : isSearched
                              ? "border-amber-500 ring-2 ring-amber-300/80 bg-amber-50/20"
                              : isEspera
                                ? "border-amber-300 bg-amber-50/15"
                                : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold text-zinc-900 flex-wrap">
                            {renderLoteNumberBadge(lote.loteNumber)}
                            {!isMulti && lote.productCode && <span className="text-[11px] md:text-[10px] text-zinc-400 font-normal">({lote.productCode})</span>}
                            {isEspera ? (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1 font-sans">
                                <PauseCircle className="h-3 w-3 text-amber-600" />
                                {esperaDetails.etapaLabel || 'Pausado'}
                              </span>
                            ) : (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                                Fila
                              </span>
                            )}
                            {isAdiadoOriginal && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300 font-mono flex items-center gap-1"
                                  title={`Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-red-600" />
                                  Adiado p/ {formatDateOnly(adiadoInfo.dataAdiadoPara)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'producao', lote.productCode)}
                                  className="px-1.5 py-0.5 text-[11px] md:text-[10px] font-bold text-red-700 hover:text-white bg-red-50 hover:bg-red-600 border border-red-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                            {isMulti && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono" title="Ordem conjunta com múltiplos produtos">
                                Multi-Produto
                              </span>
                            )}
                            {isLoteParcial(lote) && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono" title="Ordem com apontamento parcial pendente">
                                Parcial
                              </span>
                            )}
                            {isSearched && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-white font-mono">Buscado</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-700 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'producao' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoverDaFila(lote.loteNumber, 'producao')}
                              className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-600 cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Remover da Fila de Produção"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, 'producao_fila', handleOpenEditTimestamps)}

                        {renderLoteEsperaBadge(lote)}
                        {!isEspera && renderLoteProblemaBanner(lote, 'producao')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {formatarUnidadesLote(lote)}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-1.5">
                          {isEspera ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleResumeLote(lote, esperaDetails.etapa || 'producao')}
                                className="flex-1 py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs flex items-center justify-center gap-1"
                                title="Retomar lote nos Reatores"
                              >
                                <Play className="h-3.5 w-3.5 fill-white text-white" />
                                <span>Retomar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleMoverParaCaldeira(lote.loteNumber);
                                  handleResumeLote(lote, 'producao');
                                }}
                                className="py-1.5 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer text-center shadow-2xs flex items-center justify-center"
                                title="Retomar diretamente no Quadro de Caldeira"
                              >
                                <Flame className="h-3.5 w-3.5 fill-white text-white" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenPauseModal(lote, 'producao')}
                                className="py-1.5 px-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                                title="Editar motivo da pausa na Produção"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  setProducaoOrderOverrides(prev => {
                                    if (prev.includes(lote.loteNumber)) return prev;
                                    const next = [...prev, lote.loteNumber];
                                    return next;
                                  });
                                  const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                  const targetDate = producaoSelectedDate || new Date().toISOString().split('T')[0];

                                  // Sincroniza a data do lote com a data da tela de produção selecionada
                                  if (parseLoteDateToIso(lote.dataPrevisao || '') !== targetDate) {
                                    setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { ...l, dataPrevisao: targetDate } : l));
                                    try {
                                      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
                                        method: 'POST',
                                        body: JSON.stringify({
                                          dataPrevisao: targetDate,
                                          updatedBy: responsibleName,
                                        })
                                      });
                                    } catch (e) {
                                      console.error('Erro ao sincronizar dataPrevisao ao iniciar produção:', e);
                                    }
                                  }

                                  await saveEtapaStatus(lote.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
                                  showToast(`Lote #${lote.loteNumber} iniciado nos reatores em ${formatDateOnly(targetDate)}!`);
                                }}
                                className="flex-1 py-1.5 px-2 bg-zinc-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs flex items-center justify-center"
                                title="Iniciar Fabricação nos Reatores"
                              >
                                <Play className="h-3.5 w-3.5 fill-white text-white" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const targetDate = producaoSelectedDate || new Date().toISOString().split('T')[0];
                                  const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

                                  if (parseLoteDateToIso(lote.dataPrevisao || '') !== targetDate) {
                                    setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { ...l, dataPrevisao: targetDate } : l));
                                    try {
                                      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
                                        method: 'POST',
                                        body: JSON.stringify({
                                          dataPrevisao: targetDate,
                                          updatedBy: responsibleName,
                                        })
                                      });
                                    } catch (e) {
                                      console.error('Erro ao sincronizar dataPrevisao para Caldeira:', e);
                                    }
                                  }

                                  await handleMoverParaCaldeira(lote.loteNumber);
                                  setProducaoOrderOverrides(prev => {
                                    if (prev.includes(lote.loteNumber)) return prev;
                                    const next = [...prev, lote.loteNumber];
                                    return next;
                                  });
                                  await saveEtapaStatus(lote.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
                                  showToast(`Lote #${lote.loteNumber} alocado no Quadro de Caldeira em ${formatDateOnly(targetDate)}!`);
                                }}
                                className="flex-1 py-1.5 px-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer text-center shadow-2xs flex items-center justify-center"
                                title="Iniciar processo térmico diretamente no Quadro de Caldeira"
                              >
                                <Flame className="h-3.5 w-3.5 fill-white text-white" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
  );
}
