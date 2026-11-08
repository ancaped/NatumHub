import React from 'react';
import { Scale, Check, FastForward, Undo2, ArrowUp, ArrowDown, CalendarPlus, Eye, CheckCircle2, Plus, Search, X, PauseCircle, Play, Pencil } from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { getLoteEtapaStatus, loteRowKey, renderCardTimelineDates, formatarUnidadesLote, getLoteEsperaDetails } from '../lib/lotes';
import { formatDateOnly, parseLoteDateToIso } from '../lib/datas';
import type { UnifiedQuadroHeaderProps, AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface QuadroPesagemProps {
  baseLotesFilaPesagem: AcompanhamentoLote[];
  currentUser: AuthUser;
  dragOverTarget: string;
  fetchLotes: () => Promise<void>;
  filteredLotesPesando: AcompanhamentoLote[];
  getLoteAdiadoInfo: (loteNumber: string, targetDate: string, etapa?: string) => { dataAdiadoPara: any; dataOriginal: any; isDestino: boolean; };
  handleCancelAdiarLote: (loteNumber: string, targetDateToRestore?: string, etapa?: string, productCode?: string) => Promise<void>;
  handleDropPesagem: (e: React.DragEvent, targetLocation: 'ativa' | 'fila', targetIndex?: number) => Promise<void>;
  handleMoveLoteNextDay: (lote: AcompanhamentoLote, targetDateOverride?: string) => Promise<void>;
  handleOpenAddLoteModal: (target: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleOpenEditTimestamps: (lote: AcompanhamentoLote) => void;
  handleOpenPauseModal: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleRemoverDaFila: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  handleReorderPesagem: (loteNumber: string, direction: 'up' | 'down') => void;
  handleResumeLote: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  insumosFaltantesList: { codigo: string; descricao: string; count: number; }[];
  loading: boolean;
  lotesEsperaPesagemCount: number;
  lotesFilaPesagem: AcompanhamentoLote[];
  manualFilasAdicionados: Record<'pesagem' | 'producao' | 'rotulagem', string[]>;
  multiProductLoteNumbers: Set<string>;
  performRemoteLookup: (query: string) => Promise<void>;
  pesagemConcluidosLotes: string[];
  pesagemFilaFilter: 'TODOS' | 'ESPERA';
  pesagemFilaSearch: string;
  pesagemSearch: string;
  pesagemSelectedDate: string;
  pesagemShowAllDates: boolean;
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
  setPesagemConcluidosLotes: (u: string[] | ((prev: string[]) => string[])) => void;
  setPesagemFilaFilter: React.Dispatch<React.SetStateAction<'TODOS' | 'ESPERA'>>;
  setPesagemFilaSearch: React.Dispatch<React.SetStateAction<string>>;
  setPesagemOrderOverrides: (u: string[] | ((prev: string[]) => string[])) => void;
  setPesagemSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  setPesagemShowAllDates: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedInsumoFaltanteFilter: React.Dispatch<React.SetStateAction<string>>;
  setSelectedLoteDetails: React.Dispatch<React.SetStateAction<{ lote: AcompanhamentoLote | ProgramacaoEnvaseItem | ProgramacaoRotulagemItem; etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens'; }>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
  sortedLotesPesando: AcompanhamentoLote[];
}

export default function QuadroPesagem({ baseLotesFilaPesagem, currentUser, dragOverTarget, fetchLotes, filteredLotesPesando, getLoteAdiadoInfo, handleCancelAdiarLote, handleDropPesagem, handleMoveLoteNextDay, handleOpenAddLoteModal, handleOpenEditTimestamps, handleOpenPauseModal, handleRemoverDaFila, handleReorderPesagem, handleResumeLote, insumosFaltantesList, loading, lotesEsperaPesagemCount, lotesFilaPesagem, manualFilasAdicionados, multiProductLoteNumbers, performRemoteLookup, pesagemConcluidosLotes, pesagemFilaFilter, pesagemFilaSearch, pesagemSearch, pesagemSelectedDate, pesagemShowAllDates, programacaoEnvase, programacaoRotulagem, renderLoteEsperaBadge, renderLoteNumberBadge, renderLoteProblemaBanner, renderLoteProductsInfo, renderUnifiedQuadroHeader, saveEtapaStatus, selectedInsumoFaltanteFilter, setDragCardInfo, setDragOverTarget, setLotes, setPesagemConcluidosLotes, setPesagemFilaFilter, setPesagemFilaSearch, setPesagemOrderOverrides, setPesagemSelectedDate, setPesagemShowAllDates, setSelectedInsumoFaltanteFilter, setSelectedLoteDetails, showToast, sortedLotesPesando }: QuadroPesagemProps) {
  return (
<div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Quadro de Pesagem & Fracionamento",
            subtitle: "Fluxo sequencial e contínuo de fracionamento e pesagem de matérias-primas para formulação.",
            icon: <Scale className="h-6 w-6 text-white" />,
            selectedDate: pesagemSelectedDate,
            setSelectedDate: setPesagemSelectedDate,
            showAllDates: pesagemShowAllDates,
            setShowAllDates: setPesagemShowAllDates,
            badgeCount: sortedLotesPesando.length + baseLotesFilaPesagem.length,
            badgeKg: sortedLotesPesando.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0) + baseLotesFilaPesagem.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0),
            onRefresh: fetchLotes,
            isRefreshing: loading,
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                  <span>Na Balança:</span>
                  <span className="font-mono">{sortedLotesPesando.length} lotes</span>
                  <span className="text-emerald-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-emerald-700">
                    {sortedLotesPesando.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Fila de Pesagem:</span>
                  <span className="font-mono text-zinc-900">{baseLotesFilaPesagem.length} lotes</span>
                  {lotesEsperaPesagemCount > 0 && (
                    <span className="text-xs font-semibold text-amber-700 font-mono">({lotesEsperaPesagemCount} em espera)</span>
                  )}
                </div>
              </>
            )
          })}

          {/* QUADRO COM 2 COLUNAS HARMONIZADAS: NA BALANÇA (50%) | FILA DE PESAGEM (50%) */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* COLUNA 1: NA BALANÇA / CABINE (PESAGEM ATIVA) */}
            <div className="col-span-12 xl:col-span-6 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-white" />
                  <span className="font-extrabold text-sm tracking-tight">Na Balança / Cabine</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                    {filteredLotesPesando.length}{pesagemSearch ? ` / ${sortedLotesPesando.length}` : ''}
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    {filteredLotesPesando.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverTarget !== 'pesagem_ativa') setDragOverTarget('pesagem_ativa');
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (dragOverTarget === 'pesagem_ativa') setDragOverTarget(null);
                  }
                }}
                onDrop={(e) => handleDropPesagem(e, 'ativa')}
                className={cn(
                  "p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5 transition-all rounded-b-xl",
                  dragOverTarget === 'pesagem_ativa' && "ring-2 ring-emerald-500 bg-emerald-50/40"
                )}
              >
                {filteredLotesPesando.length === 0 ? (
                  <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Scale className="h-10 w-10 mx-auto mb-2 text-zinc-300" />
                    <p className="text-xs font-bold text-zinc-700">
                      {pesagemSearch ? `Nenhum lote na balança correspondente a "${pesagemSearch}"` : 'Nenhum lote pesando na cabine neste momento'}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {pesagemSearch ? 'Verifique a Fila de Pesagem ou adicione um lote digitado.' : 'Inicie a pesagem de um lote da fila ao lado para organizá-lo na sequência.'}
                    </p>
                  </div>
                ) : (
                  filteredLotesPesando.map((lote, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === filteredLotesPesando.length - 1;
                    const isSearched = !!(pesagemSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(pesagemSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(pesagemSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(pesagemSearch.trim().toLowerCase())
                    ));
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, pesagemSelectedDate, 'pesagem');
                    const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);
                    const etapaPesagem = getLoteEtapaStatus(lote, 'pesagem');
                    const isPesagemConcluida = pesagemConcluidosLotes.includes(lote.loteNumber) || etapaPesagem.isConcluido;

                    return (
                      <div
                        key={loteRowKey(lote)}
                        draggable
                        onDragStart={(e) => {
                          const payload = {
                            board: 'pesagem',
                            source: 'ativa',
                            loteNumber: lote.loteNumber,
                            productCode: lote.productCode,
                            index: idx
                          };
                          e.dataTransfer.setData('application/json', JSON.stringify(payload));
                          e.dataTransfer.effectAllowed = 'move';
                          setDragCardInfo(payload as any);
                        }}
                        onDragEnd={() => { setDragCardInfo(null); setDragOverTarget(null); }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'move';
                          const targetKey = `pesagem_ativa_${idx}`;
                          if (dragOverTarget !== targetKey) setDragOverTarget(targetKey);
                        }}
                        onDragLeave={(e) => {
                          e.stopPropagation();
                          if (dragOverTarget === `pesagem_ativa_${idx}`) setDragOverTarget(null);
                        }}
                        onDrop={(e) => handleDropPesagem(e, 'ativa', idx)}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2 cursor-grab active:cursor-grabbing",
                          dragOverTarget === `pesagem_ativa_${idx}` && "border-t-4 border-t-zinc-900 ring-2 ring-zinc-300",
                          isAdiadoOriginal
                            ? "border-red-400 bg-red-50/25 ring-1 ring-red-300"
                            : isSearched
                              ? "border-zinc-400 ring-2 ring-zinc-300/80 bg-zinc-50/40"
                              : isPesagemConcluida
                                ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                                : "border-zinc-200 hover:border-zinc-300"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {idx + 1}º
                            </span>
                            {isPesagemConcluida ? (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 font-mono">
                                <Check className="h-3 w-3 text-emerald-700" />
                                Concluído
                              </span>
                            ) : (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Pesando
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
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'pesagem', lote.productCode)}
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
                            {isSearched && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-white font-mono">Buscado</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleReorderPesagem(lote.loteNumber, 'up')}
                              disabled={isFirst}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-500 disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderPesagem(lote.loteNumber, 'down')}
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
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'pesagem' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, 'pesagem_ativa', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(lote, 'pesagem')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {formatarUnidadesLote(lote)}
                          </span>
                        </div>

                        <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              const newConcluido = !isPesagemConcluida;
                              const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                              const targetDate = pesagemSelectedDate || (lote.dataPesagem ? parseLoteDateToIso(lote.dataPesagem) : null) || new Date().toISOString().split('T')[0];
                              setPesagemConcluidosLotes(prev => {
                                const next = newConcluido
                                  ? Array.from(new Set([...prev, lote.loteNumber]))
                                  : prev.filter(x => x !== lote.loteNumber);
                                return next;
                              });
                              try {
                                await saveEtapaStatus(lote.loteNumber, 'pesagem', newConcluido ? 'concluido' : 'ativo', null, null, null, responsibleName, targetDate);
                              } catch (err) {
                                console.error('Erro salvando etapa pesagem:', err);
                              }
                              showToast(newConcluido ? `Pesagem do lote #${lote.loteNumber} concluída!` : `Pesagem do lote #${lote.loteNumber} em andamento na balança.`);
                            }}
                            className={cn(
                              "p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center justify-center flex-1",
                              isPesagemConcluida
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                            )}
                            title={isPesagemConcluida ? "Desmarcar realização da pesagem" : "Concluir pesagem (marcar como realizada)"}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setPesagemConcluidosLotes(prev => {
                                const next = prev.filter(x => x !== lote.loteNumber);
                                return next;
                              });
                              setPesagemOrderOverrides(prev => {
                                const next = prev.filter(x => x !== lote.loteNumber);
                                return next;
                              });
                              const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                              await saveEtapaStatus(lote.loteNumber, 'pesagem', 'fila', null, null, null, responsibleName);
                              showToast(`Lote #${lote.loteNumber} retornado para a fila de pesagem.`);
                            }}
                            className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            title="Voltar para a Fila de Pesagem"
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

            {/* COLUNA 2: FILA DE PESAGEM (INTEGRADA COM ITENS EM ESPERA) */}
            <div className="col-span-12 xl:col-span-6 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-zinc-300" />
                  <span className="font-extrabold text-sm tracking-tight">Fila de Pesagem</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddLoteModal('pesagem')}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="Adicionar lote na Fila de Pesagem"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Adicionar Lote</span>
                  </button>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                    {lotesFilaPesagem.length}{pesagemFilaSearch || pesagemFilaFilter === 'ESPERA' ? ` / ${baseLotesFilaPesagem.length}` : ''}
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    {lotesFilaPesagem.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
              </div>

              {/* Barra de Pesquisa, Seletor Rápido e Insumo Faltante */}
              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={pesagemFilaSearch}
                    onChange={(e) => setPesagemFilaSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(pesagemFilaSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {pesagemFilaSearch && (
                    <button
                      type="button"
                      onClick={() => setPesagemFilaSearch('')}
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
                      onClick={() => setPesagemFilaFilter('TODOS')}
                      className={cn(
                        "px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1",
                        pesagemFilaFilter === 'TODOS'
                          ? "bg-zinc-900 text-white shadow-2xs"
                          : "text-zinc-600 hover:text-zinc-900"
                      )}
                    >
                      <span>Todos na Fila</span>
                      <span className="font-mono text-[11px] md:text-[10px] opacity-80">({baseLotesFilaPesagem.length})</span>
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
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverTarget !== 'pesagem_fila') setDragOverTarget('pesagem_fila');
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (dragOverTarget === 'pesagem_fila') setDragOverTarget(null);
                  }
                }}
                onDrop={(e) => handleDropPesagem(e, 'fila')}
                className={cn(
                  "p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5 transition-all rounded-b-xl",
                  dragOverTarget === 'pesagem_fila' && "ring-2 ring-amber-500 bg-amber-50/40"
                )}
              >
                {lotesFilaPesagem.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">
                      {pesagemFilaSearch ? `Nenhum lote na fila com a busca "${pesagemFilaSearch}"` : 'Nenhum lote aguardando início de pesagem'}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1">Todos os lotes foram iniciados ou não há demandas de pesagem no momento.</p>
                  </div>
                ) : (
                  lotesFilaPesagem.map((lote, idx) => {
                    const esperaDetails = getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem);
                    const etapaPesagem = getLoteEtapaStatus(lote, 'pesagem');
                    const isEspera = esperaDetails.isEmEspera;
                    const isSearched = !!(pesagemFilaSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(pesagemFilaSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(pesagemFilaSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(pesagemFilaSearch.trim().toLowerCase())
                    ));
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, pesagemSelectedDate, 'pesagem');
                    const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);

                    return (
                      <div
                        key={loteRowKey(lote)}
                        draggable
                        onDragStart={(e) => {
                          const payload = {
                            board: 'pesagem',
                            source: 'fila',
                            loteNumber: lote.loteNumber,
                            productCode: lote.productCode,
                            index: idx
                          };
                          e.dataTransfer.setData('application/json', JSON.stringify(payload));
                          e.dataTransfer.effectAllowed = 'move';
                          setDragCardInfo(payload as any);
                        }}
                        onDragEnd={() => { setDragCardInfo(null); setDragOverTarget(null); }}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2 cursor-grab active:cursor-grabbing",
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
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
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
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'pesagem', lote.productCode)}
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
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'pesagem' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const isManual = (manualFilasAdicionados.pesagem || []).includes(lote.loteNumber);
                                if (isManual) {
                                  handleRemoverDaFila(lote.loteNumber, 'pesagem');
                                } else {
                                  if (window.confirm(`Deseja realmente ocultar o lote #${lote.loteNumber} de todo o Quadro de Pesagem? (Ele continuará visível no Quadro de Ordens)`)) {
                                    handleRemoverDaFila(lote.loteNumber, 'pesagem');
                                  }
                                }
                              }}
                              className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-600 cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Remover/Ocultar da Fila de Pesagem"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, isEspera ? 'pesagem_espera' : 'pesagem_fila', handleOpenEditTimestamps)}

                        {renderLoteEsperaBadge(lote)}
                        {!isEspera && renderLoteProblemaBanner(lote, 'pesagem')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {formatarUnidadesLote(lote)}
                          </span>
                        </div>

                        <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between gap-1.5">
                          {isEspera ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleResumeLote(lote, esperaDetails.etapa || 'pesagem')}
                                className="flex-1 py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs flex items-center justify-center gap-1"
                                title="Retomar pesagem do lote"
                              >
                                <Play className="h-3.5 w-3.5 fill-white text-white" />
                                <span>Retomar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenPauseModal(lote, esperaDetails.etapa || 'pesagem')}
                                className="py-1.5 px-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                                title="Editar motivo da pausa"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  setPesagemOrderOverrides(prev => {
                                    if (prev.includes(lote.loteNumber)) return prev;
                                    const next = [...prev, lote.loteNumber];
                                    return next;
                                  });
                                  setPesagemConcluidosLotes(prev => {
                                    const next = prev.filter(x => x !== lote.loteNumber);
                                    return next;
                                  });
                                  const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                  const targetDate = pesagemSelectedDate || new Date().toISOString().split('T')[0];

                                  // Sincroniza a data de pesagem do lote com a data da tela de pesagem selecionada
                                  setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { 
                                    ...l, 
                                    dataPesagem: `${targetDate}T08:00:00Z`
                                  } : l));

                                  await saveEtapaStatus(lote.loteNumber, 'pesagem', 'ativo', null, null, null, responsibleName, targetDate);
                                  await fetchLotes();
                                  showToast(`Lote #${lote.loteNumber} iniciado na pesagem em ${formatDateOnly(targetDate)}!`);
                                }}
                                className="flex-1 py-1.5 px-2.5 bg-zinc-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs flex items-center justify-center gap-1"
                                title="Iniciar lote na Balança"
                              >
                                <Play className="h-3.5 w-3.5 fill-white text-white" />
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
