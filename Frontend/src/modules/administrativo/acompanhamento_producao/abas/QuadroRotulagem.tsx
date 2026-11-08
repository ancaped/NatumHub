import React from 'react';
import { Tag, Search, X, Calendar, FastForward, Undo2, ArrowUp, ArrowDown, CalendarPlus, Eye, Trash2, CheckCircle2, Package, Plus, AlertTriangle } from 'lucide-react';
import { rotuloLote, renderCardTimelineDates, contarLotesUnicos, loteRowKey, isLoteParcial, getEffectiveStatus, formatarUnidadesLote, getLoteEsperaDetails } from '../lib/lotes';
import { formatDateOnly } from '../lib/datas';
import { cn } from '../../../geral/lib/utils';
import type { UnifiedQuadroHeaderProps, AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface QuadroRotulagemProps {
  dragOverTarget: string;
  fetchLotes: () => Promise<void>;
  fetchProgramacaoRotulagem: (dateStr?: string) => Promise<void>;
  filteredRotulagemManualItems: ProgramacaoRotulagemItem[];
  filteredRotulagemMaquinaItems: ProgramacaoRotulagemItem[];
  getCurrentBoardDate: () => string;
  getLoteAdiadoInfo: (loteNumber: string, targetDate: string, etapa?: string) => { dataAdiadoPara: any; dataOriginal: any; isDestino: boolean; };
  getRealLote: (loteNumber?: string | null, productCode?: string | null) => AcompanhamentoLote | undefined;
  handleCancelAdiarLote: (loteNumber: string, targetDateToRestore?: string, etapa?: string, productCode?: string) => Promise<void>;
  handleChangeStatusRotulagem: (id: number | string, status: 'PROGRAMADO' | 'EM_ROTULAGEM' | 'CONCLUIDO') => Promise<void>;
  handleDropRotulagem: (e: React.DragEvent, targetTipo: 'MAQUINA' | 'MANUAL', targetIndex?: number) => Promise<void>;
  handleEncaixarRotulagem: (lote: AcompanhamentoLote, tipo: 'MAQUINA' | 'MANUAL') => Promise<void>;
  handleMoveLoteNextDay: (lote: AcompanhamentoLote, targetDateOverride?: string) => Promise<void>;
  handleMoveTipoRotulagem: (item: ProgramacaoRotulagemItem, targetTipo: 'MAQUINA' | 'MANUAL') => Promise<void>;
  handleOpenAddLoteModal: (target: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleOpenAdiarModal: (params: { loteNumber: string; productCode: string; productDescription: string; currentDate?: string | null; etapaLabel?: string; origem: 'envase_linha' | 'envase_liberados' | 'ordens' | 'pesagem' | 'producao' | 'rotulagem'; realLote?: AcompanhamentoLote; envaseItem?: ProgramacaoEnvaseItem; }) => void;
  handleOpenEditTimestamps: (lote: AcompanhamentoLote) => void;
  handleOpenPauseModal: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleRemoverDaFila: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  handleRemoveRotulagem: (id: number | string) => void;
  handleReorderRotulagem: (id: number | string, tipo: 'MAQUINA' | 'MANUAL', direction: 'up' | 'down') => Promise<void>;
  hasLoteProblemaOuPausa: (lote: AcompanhamentoLote | null | undefined, itemEnvase?: ProgramacaoEnvaseItem | null, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => boolean;
  loading: boolean;
  loadingRotulagem: boolean;
  lotesByNumber: Map<string, AcompanhamentoLote>;
  lotesLiberadosParaAcabamento: AcompanhamentoLote[];
  lotesParaRotulagem: AcompanhamentoLote[];
  multiProductLoteNumbers: Set<string>;
  performRemoteLookup: (query: string) => Promise<void>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  renderLoteEsperaBadge: (lote: AcompanhamentoLote) => React.JSX.Element;
  renderLoteNumberBadge: (loteNum: string) => React.JSX.Element;
  renderLoteProblemaBanner: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => React.JSX.Element;
  renderLoteProductsInfo: (lote: AcompanhamentoLote | { loteNumber: string; productCode?: string; productDescription?: string; quantity?: number; quantityKg?: number; }, options?: { isConsolidatedBatch?: boolean; }) => React.JSX.Element;
  renderUnifiedQuadroHeader: ({ title, subtitle, icon, selectedDate, setSelectedDate, showAllDates, setShowAllDates, badgeCount, badgeCountLabel, badgeKg, badgeUn, badgeExtra, operationalMetrics, actionButtons, onRefresh, isRefreshing, }: UnifiedQuadroHeaderProps) => React.JSX.Element;
  rotulagemDayStats: { maquinaCount: number; maquinaUn: number; maquinaKg: number; manualCount: number; manualUn: number; manualKg: number; totalCount: number; totalUn: number; totalKg: number; };
  rotulagemFilaSearch: string;
  rotulagemMaquinaItems: ProgramacaoRotulagemItem[];
  rotulagemScopeFilter: 'TODOS' | 'LIBERADOS';
  rotulagemSearch: string;
  rotulagemSelectedDate: string;
  rotulagemShowAllDates: boolean;
  setDragCardInfo: React.Dispatch<React.SetStateAction<{ board: 'envase' | 'rotulagem' | 'pesagem' | 'producao'; source: string; id?: number | string; loteNumber: string; productCode?: string; index?: number; linha?: 'Linha 1' | 'Linha 2' | 'Linha 3'; tipo?: 'MAQUINA' | 'MANUAL'; }>>;
  setDragOverTarget: React.Dispatch<React.SetStateAction<string>>;
  setRotulagemFilaSearch: React.Dispatch<React.SetStateAction<string>>;
  setRotulagemScopeFilter: React.Dispatch<React.SetStateAction<'TODOS' | 'LIBERADOS'>>;
  setRotulagemSearch: React.Dispatch<React.SetStateAction<string>>;
  setRotulagemSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  setRotulagemShowAllDates: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedLoteDetails: React.Dispatch<React.SetStateAction<{ lote: AcompanhamentoLote | ProgramacaoEnvaseItem | ProgramacaoRotulagemItem; etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens'; }>>;
  todasOrdensAbertasFabrica: AcompanhamentoLote[];
}

export default function QuadroRotulagem({ dragOverTarget, fetchLotes, fetchProgramacaoRotulagem, filteredRotulagemManualItems, filteredRotulagemMaquinaItems, getCurrentBoardDate, getLoteAdiadoInfo, getRealLote, handleCancelAdiarLote, handleChangeStatusRotulagem, handleDropRotulagem, handleEncaixarRotulagem, handleMoveLoteNextDay, handleMoveTipoRotulagem, handleOpenAddLoteModal, handleOpenAdiarModal, handleOpenEditTimestamps, handleOpenPauseModal, handleRemoverDaFila, handleRemoveRotulagem, handleReorderRotulagem, hasLoteProblemaOuPausa, loading, loadingRotulagem, lotesByNumber, lotesLiberadosParaAcabamento, lotesParaRotulagem, multiProductLoteNumbers, performRemoteLookup, programacaoEnvase, programacaoRotulagem, renderLoteEsperaBadge, renderLoteNumberBadge, renderLoteProblemaBanner, renderLoteProductsInfo, renderUnifiedQuadroHeader, rotulagemDayStats, rotulagemFilaSearch, rotulagemMaquinaItems, rotulagemScopeFilter, rotulagemSearch, rotulagemSelectedDate, rotulagemShowAllDates, setDragCardInfo, setDragOverTarget, setRotulagemFilaSearch, setRotulagemScopeFilter, setRotulagemSearch, setRotulagemSelectedDate, setRotulagemShowAllDates, setSelectedLoteDetails, todasOrdensAbertasFabrica }: QuadroRotulagemProps) {
  return (
<div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Quadro de Rotulagem",
            subtitle: "Organização e sequenciamento de rotulagem (Máquina e Manual) para lotes liberados e em produção.",
            icon: <Tag className="h-6 w-6 text-white" />,
            selectedDate: rotulagemSelectedDate,
            setSelectedDate: setRotulagemSelectedDate,
            showAllDates: rotulagemShowAllDates,
            setShowAllDates: setRotulagemShowAllDates,
            badgeCount: rotulagemDayStats.totalCount,
            badgeCountLabel: "programado(s)",
            badgeUn: rotulagemDayStats.totalUn,
            onRefresh: () => {
              fetchLotes();
              fetchProgramacaoRotulagem('TODOS');
            },
            isRefreshing: loading || loadingRotulagem,
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Máquina:</span>
                  <span className="font-mono">{rotulagemDayStats.maquinaCount} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">{Number(rotulagemDayStats.maquinaUn).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Manual:</span>
                  <span className="font-mono">{rotulagemDayStats.manualCount} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">{Number(rotulagemDayStats.manualUn).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                  <span>Disponíveis:</span>
                  <span className="font-mono">{lotesParaRotulagem.length} lotes</span>
                </div>
              </>
            )
          })}

          {/* BARRA DE PESQUISA DAS ESTEIRAS DE ROTULAGEM E LOCALIZADOR DE DATA */}
          <div className="bg-white border border-zinc-200 rounded-xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={rotulagemSearch}
                  onChange={e => setRotulagemSearch(e.target.value)}
                  placeholder="Pesquisar lote por número, SKU ou produto nas Esteiras (Máquina e Manual)..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-9 pr-8 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400 font-medium"
                />
                {rotulagemSearch && (
                  <button
                    type="button"
                    onClick={() => setRotulagemSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Dica / Alerta Inteligente de Data: Se o lote pesquisado estiver agendado em OUTRA data na Rotulagem */}
            {(() => {
              const q = rotulagemSearch.trim().toLowerCase();
              if (!q || q.length < 2) return null;
              
              const otherDateMatch = programacaoRotulagem.find(it => {
                const matchNum = it.loteNumber?.toLowerCase().includes(q);
                const matchProd = it.productCode?.toLowerCase().includes(q) || it.productDescription?.toLowerCase().includes(q);
                const isDifferentDate = it.dataProgramada && it.dataProgramada !== rotulagemSelectedDate;
                return (matchNum || matchProd) && isDifferentDate;
              });

              if (!otherDateMatch) return null;

              return (
                <div className="flex items-center justify-between gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      Lote <strong>{rotuloLote(otherDateMatch.loteNumber)}</strong> agendado na <strong>Rotulagem {otherDateMatch.tipo === 'MAQUINA' ? 'Máquina' : 'Manual'}</strong> para o dia <strong>{formatDateOnly(otherDateMatch.dataProgramada)}</strong>!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRotulagemSelectedDate(otherDateMatch.dataProgramada);
                      setRotulagemShowAllDates(false);
                    }}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md text-[11px] shrink-0 transition-colors cursor-pointer shadow-2xs"
                  >
                    Ir para esta data
                  </button>
                </div>
              );
            })()}
          </div>

          {/* GRID COM QUADROS VISUAIS À ESQUERDA E ESCOLHA DE LOTES À DIREITA */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* QUADROS VISUAIS (ESQUERDA - COL-SPAN-8): MÁQUINA E MANUAL */}
            <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* COLUNA 1: ROTULAGEM MÁQUINA */}
              <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
                <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-white" />
                    <span className="font-extrabold text-sm tracking-tight">Rotulagem Máquina</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                      {rotulagemMaquinaItems.length}
                    </span>
                    <span className="text-xs font-mono text-zinc-300">
                      {Number(rotulagemDayStats.maquinaUn).toLocaleString('pt-BR')} un
                    </span>
                  </div>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverTarget !== 'rotulagem_MAQUINA') setDragOverTarget('rotulagem_MAQUINA');
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      if (dragOverTarget === 'rotulagem_MAQUINA') setDragOverTarget(null);
                    }
                  }}
                  onDrop={(e) => handleDropRotulagem(e, 'MAQUINA')}
                  className={cn(
                    "p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5 transition-all rounded-xl",
                    dragOverTarget === 'rotulagem_MAQUINA' && "ring-2 ring-zinc-900 bg-zinc-100/70"
                  )}
                >
                  {filteredRotulagemMaquinaItems.length === 0 ? (
                    <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                      <Tag className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                      <p className="text-xs font-bold text-zinc-700">Nenhum lote na Rotulagem Máquina</p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {rotulagemSearch ? `Nenhum lote correspondente à busca "${rotulagemSearch}".` : 'Selecione um lote da coluna ao lado e clique em "+ Máquina".'}
                      </p>
                    </div>
                  ) : (
                    filteredRotulagemMaquinaItems.map((item, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === filteredRotulagemMaquinaItems.length - 1;
                      const isConcluido = item.statusRotulagem === 'CONCLUIDO';
                      const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, rotulagemSelectedDate, 'rotulagem') : null;
                      const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => {
                            const payload = {
                              board: 'rotulagem',
                              source: 'coluna',
                              tipo: 'MAQUINA',
                              id: item.id,
                              loteNumber: item.loteNumber,
                              productCode: item.productCode,
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
                            const targetKey = `rotulagem_MAQUINA_${idx}`;
                            if (dragOverTarget !== targetKey) setDragOverTarget(targetKey);
                          }}
                          onDragLeave={(e) => {
                            e.stopPropagation();
                            if (dragOverTarget === `rotulagem_MAQUINA_${idx}`) setDragOverTarget(null);
                          }}
                          onDrop={(e) => handleDropRotulagem(e, 'MAQUINA', idx)}
                          className={cn(
                            "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2 cursor-grab active:cursor-grabbing",
                            dragOverTarget === `rotulagem_MAQUINA_${idx}` && "border-t-4 border-t-zinc-900 ring-2 ring-zinc-400",
                            isAdiadoOriginal
                              ? "border-red-400 bg-red-50/25 ring-1 ring-red-300"
                              : item.statusRotulagem === 'EM_ROTULAGEM'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/20"
                                : isConcluido
                                  ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                                  : "border-zinc-200"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-zinc-900 text-white">
                                {idx + 1}º
                              </span>
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
                                    onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'rotulagem', item.productCode)}
                                    className="px-1.5 py-0.5 text-[11px] md:text-[10px] font-bold text-red-700 hover:text-white bg-red-50 hover:bg-red-600 border border-red-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                    title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                  >
                                    <Undo2 className="h-2.5 w-2.5" />
                                    <span>Desfazer</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleReorderRotulagem(item.id, 'MAQUINA', 'up')}
                                disabled={isFirst}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Subir ordem"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReorderRotulagem(item.id, 'MAQUINA', 'down')}
                                disabled={isLast}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Descer ordem"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const realLote = getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber);
                                  handleOpenAdiarModal({
                                    loteNumber: item.loteNumber,
                                    productCode: item.productCode,
                                    productDescription: item.productDescription,
                                    currentDate: item.dataProgramada || rotulagemSelectedDate || getCurrentBoardDate(),
                                    etapaLabel: 'Rotulagem Automática',
                                    origem: 'rotulagem',
                                    realLote,
                                  });
                                }}
                                className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Adiar lote (selecionar nova data)"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'rotulagem' })}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Ver Detalhes do Item"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveRotulagem(item.id)}
                                className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Remover da rotulagem"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                          <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                            <span className="font-bold text-zinc-900">
                              {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[11px] md:text-[10px] text-zinc-500 font-normal">un</span>
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                            </span>
                          </div>

                          {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'rotulagem', handleOpenEditTimestamps)}

                          {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'rotulagem')}

                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                            <button
                              type="button"
                              onClick={() => handleMoveTipoRotulagem(item, 'MANUAL')}
                              className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Rotulagem Manual"
                            >
                              Man
                            </button>

                            <button
                              type="button"
                              onClick={() => handleChangeStatusRotulagem(item.id, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão da Rotulagem" : "Concluir Rotulagem"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* COLUNA 2: ROTULAGEM MANUAL */}
              <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
                <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-zinc-400" />
                    <span className="font-extrabold text-sm tracking-tight">Rotulagem Manual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                      {filteredRotulagemManualItems.length}
                    </span>
                    <span className="text-xs font-mono text-zinc-300">
                      {Number(rotulagemDayStats.manualUn).toLocaleString('pt-BR')} un
                    </span>
                  </div>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverTarget !== 'rotulagem_MANUAL') setDragOverTarget('rotulagem_MANUAL');
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      if (dragOverTarget === 'rotulagem_MANUAL') setDragOverTarget(null);
                    }
                  }}
                  onDrop={(e) => handleDropRotulagem(e, 'MANUAL')}
                  className={cn(
                    "p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5 transition-all rounded-xl",
                    dragOverTarget === 'rotulagem_MANUAL' && "ring-2 ring-zinc-900 bg-zinc-100/70"
                  )}
                >
                  {filteredRotulagemManualItems.length === 0 ? (
                    <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                      <Tag className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                      <p className="text-xs font-bold text-zinc-700">Nenhum lote na Rotulagem Manual</p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {rotulagemSearch ? `Nenhum lote correspondente à busca "${rotulagemSearch}".` : 'Selecione um lote da coluna ao lado e clique em "+ Manual".'}
                      </p>
                    </div>
                  ) : (
                    filteredRotulagemManualItems.map((item, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === filteredRotulagemManualItems.length - 1;
                      const isConcluido = item.statusRotulagem === 'CONCLUIDO';
                      const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, rotulagemSelectedDate, 'rotulagem') : null;
                      const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => {
                            const payload = {
                              board: 'rotulagem',
                              source: 'coluna',
                              tipo: 'MANUAL',
                              id: item.id,
                              loteNumber: item.loteNumber,
                              productCode: item.productCode,
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
                            const targetKey = `rotulagem_MANUAL_${idx}`;
                            if (dragOverTarget !== targetKey) setDragOverTarget(targetKey);
                          }}
                          onDragLeave={(e) => {
                            e.stopPropagation();
                            if (dragOverTarget === `rotulagem_MANUAL_${idx}`) setDragOverTarget(null);
                          }}
                          onDrop={(e) => handleDropRotulagem(e, 'MANUAL', idx)}
                          className={cn(
                            "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2 cursor-grab active:cursor-grabbing",
                            dragOverTarget === `rotulagem_MANUAL_${idx}` && "border-t-4 border-t-zinc-900 ring-2 ring-zinc-400",
                            isAdiadoOriginal
                              ? "border-red-400 bg-red-50/25 ring-1 ring-red-300"
                              : item.statusRotulagem === 'EM_ROTULAGEM'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/20"
                                : isConcluido
                                  ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                                  : "border-zinc-200"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-zinc-900 text-white">
                                {idx + 1}º
                              </span>
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
                                    onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'rotulagem', item.productCode)}
                                    className="px-1.5 py-0.5 text-[11px] md:text-[10px] font-bold text-red-700 hover:text-white bg-red-50 hover:bg-red-600 border border-red-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                    title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                  >
                                    <Undo2 className="h-2.5 w-2.5" />
                                    <span>Desfazer</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleReorderRotulagem(item.id, 'MANUAL', 'up')}
                                disabled={isFirst}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Subir ordem"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReorderRotulagem(item.id, 'MANUAL', 'down')}
                                disabled={isLast}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Descer ordem"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const realLote = getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber);
                                  handleOpenAdiarModal({
                                    loteNumber: item.loteNumber,
                                    productCode: item.productCode,
                                    productDescription: item.productDescription,
                                    currentDate: item.dataProgramada || rotulagemSelectedDate || getCurrentBoardDate(),
                                    etapaLabel: 'Rotulagem Manual',
                                    origem: 'rotulagem',
                                    realLote,
                                  });
                                }}
                                className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Adiar lote (selecionar nova data)"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'rotulagem' })}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Ver Detalhes do Item"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveRotulagem(item.id)}
                                className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Remover da rotulagem"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                          <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                            <span className="font-bold text-zinc-900">
                              {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[11px] md:text-[10px] text-zinc-500 font-normal">un</span>
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                            </span>
                          </div>

                          {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'rotulagem', handleOpenEditTimestamps)}

                          {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'rotulagem')}

                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                            <button
                              type="button"
                              onClick={() => handleMoveTipoRotulagem(item, 'MAQUINA')}
                              className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Rotulagem Máquina"
                            >
                              Máq
                            </button>

                            <button
                              type="button"
                              onClick={() => handleChangeStatusRotulagem(item.id, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão da Rotulagem" : "Concluir Rotulagem"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* COLUNA DE ESCOLHA (DIREITA - COL-SPAN-4): LOTES DISPONÍVEIS ENTRE PESAGEM E PRODUÇÃO */}
            <div className="col-span-12 lg:col-span-4 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-zinc-300" />
                  <span className="font-extrabold text-sm tracking-tight">Lotes Disponíveis para Rotulagem</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddLoteModal('rotulagem')}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="Adicionar lote nos Lotes Disponíveis para Rotulagem"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Adicionar Lote</span>
                  </button>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {lotesParaRotulagem.length}
                  </span>
                </div>
              </div>

              {/* Caixa de Busca Embutida na Coluna de Escolha (Molde Envase) */}
              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={rotulagemFilaSearch}
                    onChange={e => setRotulagemFilaSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(rotulagemFilaSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {rotulagemFilaSearch && (
                    <button
                      type="button"
                      onClick={() => setRotulagemFilaSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { setRotulagemScopeFilter('LIBERADOS'); }}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors",
                      rotulagemScopeFilter === 'LIBERADOS' ? "bg-white text-zinc-900 shadow-2xs border border-zinc-300" : "text-zinc-500 hover:text-zinc-800"
                    )}
                    title="Lotes já produzidos e liberados para rotulagem"
                  >
                    Liberados ({contarLotesUnicos(lotesLiberadosParaAcabamento)})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRotulagemScopeFilter('TODOS'); }}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors",
                      rotulagemScopeFilter === 'TODOS' ? "bg-white text-zinc-900 shadow-2xs border border-zinc-300" : "text-zinc-500 hover:text-zinc-800"
                    )}
                    title="Todas as ordens abertas da fábrica no Hub"
                  >
                    Todas Abertas ({contarLotesUnicos(todasOrdensAbertasFabrica)})
                  </button>
                </div>
              </div>

              <div className="p-3 bg-zinc-50/30 min-h-[460px] max-h-[710px] overflow-y-auto space-y-2.5">
                {lotesParaRotulagem.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote disponível</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {rotulagemFilaSearch ? `Nenhum lote correspondente à busca "${rotulagemFilaSearch}".` : "Não há lotes entre as etapas de Pesagem e Produção no momento."}
                    </p>
                  </div>
                ) : (
                  lotesParaRotulagem.map((lote, idx) => {
                    const scheduledMaq = programacaoRotulagem.find(it => 
                      it.loteNumber === lote.loteNumber && 
                      it.tipo === 'MAQUINA' && 
                      (!it.productCode || !lote.productCode || it.productCode === lote.productCode)
                    );
                    const scheduledMan = programacaoRotulagem.find(it => 
                      it.loteNumber === lote.loteNumber && 
                      it.tipo === 'MANUAL' && 
                      (!it.productCode || !lote.productCode || it.productCode === lote.productCode)
                    );
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const temProblema = hasLoteProblemaOuPausa(lote, null, 'rotulagem');

                    return (
                      <div
                        key={loteRowKey(lote)}
                        draggable
                        onDragStart={(e) => {
                          const payload = {
                            board: 'rotulagem',
                            source: 'disponiveis',
                            loteNumber: lote.loteNumber,
                            productCode: lote.productCode
                          };
                          e.dataTransfer.setData('application/json', JSON.stringify(payload));
                          e.dataTransfer.effectAllowed = 'move';
                          setDragCardInfo(payload as any);
                        }}
                        onDragEnd={() => { setDragCardInfo(null); setDragOverTarget(null); }}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2 cursor-grab active:cursor-grabbing",
                          temProblema ? "border-amber-400 bg-amber-50/20 ring-1 ring-amber-300" :
                          (scheduledMaq || scheduledMan) ? "border-zinc-400 bg-zinc-50/50" : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold text-zinc-900 flex-wrap">
                            {renderLoteNumberBadge(lote.loteNumber)}
                            <span className="text-[11px] md:text-[10px] text-zinc-400 font-normal">({lote.productCode})</span>
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
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenPauseModal(lote, 'rotulagem')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-colors",
                                temProblema
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : "text-zinc-400 hover:bg-amber-50 hover:text-amber-600"
                              )}
                              title="Informar falta de rótulo / insumo ou pausar lote na Rotulagem"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
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
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'rotulagem' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoverDaFila(lote.loteNumber, 'rotulagem')}
                              className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-600 cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Remover da Fila de Rotulagem"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[11px] md:text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-zinc-200 font-mono">
                              {getEffectiveStatus(lote)}
                            </span>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {formatarUnidadesLote(lote, "text-[11px] md:text-[10px] text-zinc-500 font-normal")}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lote, 'rotulagem', handleOpenEditTimestamps)}

                        {renderLoteEsperaBadge(lote)}
                        {!getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem).isEmEspera && renderLoteProblemaBanner(lote, 'rotulagem')}

                        <div className="pt-2 border-t border-zinc-100 space-y-1.5">
                          {(scheduledMaq || scheduledMan) && (
                            <div className="flex flex-wrap items-center gap-1 text-[11px] md:text-[10px] font-bold">
                              {scheduledMaq && (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                                  ✓ Na Máquina ({scheduledMaq.ordem}º)
                                </span>
                              )}
                              {scheduledMan && (
                                <span className="px-1.5 py-0.5 bg-zinc-50 text-zinc-800 border border-zinc-200 rounded">
                                  ✓ No Manual ({scheduledMan.ordem}º)
                                </span>
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEncaixarRotulagem(lote, 'MAQUINA')}
                              disabled={!!scheduledMaq}
                              className="py-1 px-2 bg-zinc-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              + Máq
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEncaixarRotulagem(lote, 'MANUAL')}
                              disabled={!!scheduledMan}
                              className="py-1 px-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 rounded-lg text-xs font-bold transition-colors cursor-pointer text-center disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              + Man
                            </button>
                          </div>
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
