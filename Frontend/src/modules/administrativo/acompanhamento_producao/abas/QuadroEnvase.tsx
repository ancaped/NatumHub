import React from 'react';
import { Droplets, Printer, Search, X, Calendar, RefreshCw, Layers, FastForward, Undo2, ArrowUp, ArrowDown, CalendarPlus, Eye, Trash2, PauseCircle, Play, CheckCircle2, Package, AlertTriangle } from 'lucide-react';
import { rotuloLote, renderCardTimelineDates, contarLotesUnicos, loteRowKey, isLoteParcial, getEffectiveStatus, formatarUnidadesLote, getLoteEsperaDetails } from '../lib/lotes';
import { formatDateOnly, parseLoteDateToIso } from '../lib/datas';
import { cn } from '../../../geral/lib/utils';
import type { UnifiedQuadroHeaderProps, AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface QuadroEnvaseProps {
  dragOverTarget: string;
  encaixeSearch: string;
  envaseDayStats: { linha1Count: number; linha1Un: number; linha1Kg: number; linha2Count: number; linha2Un: number; linha2Kg: number; linha3Count: number; linha3Un: number; linha3Kg: number; totalCount: number; totalUn: number; totalKg: number; };
  envaseLinha1Items: ProgramacaoEnvaseItem[];
  envaseLinha2Items: ProgramacaoEnvaseItem[];
  envaseLinha3Items: ProgramacaoEnvaseItem[];
  envaseScopeFilter: 'TODOS' | 'LIBERADOS';
  envaseSearch: string;
  envaseSelectedDate: string;
  envaseShowAllDates: boolean;
  fetchProgramacaoEnvase: (dateStr: string) => Promise<void>;
  filteredEnvaseLinha1Items: ProgramacaoEnvaseItem[];
  filteredEnvaseLinha2Items: ProgramacaoEnvaseItem[];
  filteredEnvaseLinha3Items: ProgramacaoEnvaseItem[];
  getCurrentBoardDate: () => string;
  getLoteAdiadoInfo: (loteNumber: string, targetDate: string, etapa?: string) => { dataAdiadoPara: any; dataOriginal: any; isDestino: boolean; };
  getRealLote: (loteNumber?: string | null, productCode?: string | null) => AcompanhamentoLote | undefined;
  handleCancelAdiarLote: (loteNumber: string, targetDateToRestore?: string, etapa?: string, productCode?: string) => Promise<void>;
  handleChangeStatusEnvase: (item: ProgramacaoEnvaseItem, newStatus: string, observacoesCustom?: string) => Promise<void>;
  handleDropEnvaseColumn: (e: React.DragEvent, targetLinha: 'Linha 1' | 'Linha 2' | 'Linha 3', targetIndex?: number) => Promise<void>;
  handleEncaixarLote: (lote: AcompanhamentoLote, linha: 'Linha 1' | 'Linha 2' | 'Linha 3', categoriaEnvase?: string, isColorido?: boolean, cor?: string, targetDateOverride?: string) => Promise<void>;
  handleMoveLinha: (item: ProgramacaoEnvaseItem, targetLinha: 'Linha 1' | 'Linha 2' | 'Linha 3') => Promise<void>;
  handleMoveLoteNextDay: (lote: AcompanhamentoLote, targetDateOverride?: string) => Promise<void>;
  handleOpenAdiarModal: (params: { loteNumber: string; productCode: string; productDescription: string; currentDate?: string | null; etapaLabel?: string; origem: 'envase_linha' | 'envase_liberados' | 'ordens' | 'pesagem' | 'producao' | 'rotulagem'; realLote?: AcompanhamentoLote; envaseItem?: ProgramacaoEnvaseItem; }) => void;
  handleOpenEditTimestamps: (lote: AcompanhamentoLote) => void;
  handleOpenEnvaseEspera: (item: ProgramacaoEnvaseItem) => void;
  handleOpenPauseModal: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleOpenRelatorioEnvaseModal: () => Promise<void>;
  handleRemoveEnvase: (id: number, loteNumber: string) => void;
  handleRemoverDaFila: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  handleReorderEnvase: (id: number, linha: string, direction: 'up' | 'down') => Promise<void>;
  hasLoteProblemaOuPausa: (lote: AcompanhamentoLote | null | undefined, itemEnvase?: ProgramacaoEnvaseItem | null, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => boolean;
  isLoteTerceirizado: (l: AcompanhamentoLote) => boolean;
  loadingEnvase: boolean;
  lotesByNumber: Map<string, AcompanhamentoLote>;
  lotesLiberadosParaAcabamento: AcompanhamentoLote[];
  lotesParaEncaixe: { isAlreadyScheduled: boolean; scheduledItem: any; loteNumber: string; productCode: string; productDescription: string; quantity: number; quantityKg: number; date: string; details?: string | null; erpStatus: string; erpStatusLabel: string; customStatus?: string | null; category?: string | null; updatedBy?: string | null; updatedAt?: string | null; notes?: string | null; dataPesagem?: string | null; dataProducao?: string | null; dataLiberadoEnvase?: string | null; liberadoEnvaseLaudo?: boolean; dataEnvase?: string | null; dataRotulagem?: string | null; dataFinalizada?: string | null; dataEmEspera?: string | null; dataPrevisao?: string | null; motivoEspera?: string | null; isTerceirizado: boolean; fornecedorTerceirizado?: string | null; fornecedor_terceirizado?: string | null; fichaOrdem?: any | null; ficha_ordem?: any | null; quantidadeEnvasadaParcial?: number | null; quantidade_envasada_parcial?: number | null; insumoFaltanteCodigo?: string | null; insumo_faltante_codigo?: string | null; insumoFaltanteDescricao?: string | null; insumo_faltante_descricao?: string | null; quadrosOcultos?: string[] | null; quadros_ocultos?: string[] | null; historicoReagendamentos?: any[] | null; historico_reagendamentos?: any[] | null; etapasStatus?: Record<string, { status?: string | null; motivoEspera?: string | null; insumoFaltanteCodigo?: string | null; insumoFaltanteDescricao?: string | null; updatedBy?: string | null; updatedAt?: string | null; }> | null; etapas_status?: any | null; etapasEfetivas?: Partial<Record<'pesagem' | 'producao' | 'rotulagem' | 'envase', { status: string; isEspera: boolean; isConcluido: boolean; }>> | null; pesoDesconhecido?: boolean; planningOrdem?: number | null; planning_ordem?: number | null; reatorId?: string | null; planningId?: string | null; reator_id?: string | null; }[];
  multiProductLoteNumbers: Set<string>;
  performRemoteLookup: (query: string) => Promise<void>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  renderFiscoQuimicaBadge: (_loteNumber?: string | null) => any;
  renderLoteEsperaBadge: (lote: AcompanhamentoLote) => React.JSX.Element;
  renderLoteNumberBadge: (loteNum: string) => React.JSX.Element;
  renderLoteProblemaBanner: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => React.JSX.Element;
  renderLoteProductsInfo: (lote: AcompanhamentoLote | { loteNumber: string; productCode?: string; productDescription?: string; quantity?: number; quantityKg?: number; }, options?: { isConsolidatedBatch?: boolean; }) => React.JSX.Element;
  renderUnifiedQuadroHeader: ({ title, subtitle, icon, selectedDate, setSelectedDate, showAllDates, setShowAllDates, badgeCount, badgeCountLabel, badgeKg, badgeUn, badgeExtra, operationalMetrics, actionButtons, onRefresh, isRefreshing, }: UnifiedQuadroHeaderProps) => React.JSX.Element;
  setDragCardInfo: React.Dispatch<React.SetStateAction<{ board: 'envase' | 'rotulagem' | 'pesagem' | 'producao'; source: string; id?: number | string; loteNumber: string; productCode?: string; index?: number; linha?: 'Linha 1' | 'Linha 2' | 'Linha 3'; tipo?: 'MAQUINA' | 'MANUAL'; }>>;
  setDragOverTarget: React.Dispatch<React.SetStateAction<string>>;
  setEncaixeSearch: React.Dispatch<React.SetStateAction<string>>;
  setEnvaseScopeFilter: React.Dispatch<React.SetStateAction<'TODOS' | 'LIBERADOS'>>;
  setEnvaseSearch: React.Dispatch<React.SetStateAction<string>>;
  setEnvaseSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  setEnvaseShowAllDates: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedLoteDetails: React.Dispatch<React.SetStateAction<{ lote: AcompanhamentoLote | ProgramacaoEnvaseItem | ProgramacaoRotulagemItem; etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens'; }>>;
  todasOrdensAbertasFabrica: AcompanhamentoLote[];
}

export default function QuadroEnvase({ dragOverTarget, encaixeSearch, envaseDayStats, envaseLinha1Items, envaseLinha2Items, envaseLinha3Items, envaseScopeFilter, envaseSearch, envaseSelectedDate, envaseShowAllDates, fetchProgramacaoEnvase, filteredEnvaseLinha1Items, filteredEnvaseLinha2Items, filteredEnvaseLinha3Items, getCurrentBoardDate, getLoteAdiadoInfo, getRealLote, handleCancelAdiarLote, handleChangeStatusEnvase, handleDropEnvaseColumn, handleEncaixarLote, handleMoveLinha, handleMoveLoteNextDay, handleOpenAdiarModal, handleOpenEditTimestamps, handleOpenEnvaseEspera, handleOpenPauseModal, handleOpenRelatorioEnvaseModal, handleRemoveEnvase, handleRemoverDaFila, handleReorderEnvase, hasLoteProblemaOuPausa, isLoteTerceirizado, loadingEnvase, lotesByNumber, lotesLiberadosParaAcabamento, lotesParaEncaixe, multiProductLoteNumbers, performRemoteLookup, programacaoEnvase, programacaoRotulagem, renderFiscoQuimicaBadge, renderLoteEsperaBadge, renderLoteNumberBadge, renderLoteProblemaBanner, renderLoteProductsInfo, renderUnifiedQuadroHeader, setDragCardInfo, setDragOverTarget, setEncaixeSearch, setEnvaseScopeFilter, setEnvaseSearch, setEnvaseSelectedDate, setEnvaseShowAllDates, setSelectedLoteDetails, todasOrdensAbertasFabrica }: QuadroEnvaseProps) {
  return (
<div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Programação de Linhas de Envase",
            subtitle: "Fluxo contínuo de lotes em andamento nas esteiras e linhas operacionais.",
            icon: <Droplets className="h-5 w-5 text-white" />,
            selectedDate: envaseSelectedDate,
            setSelectedDate: setEnvaseSelectedDate,
            showAllDates: envaseShowAllDates,
            setShowAllDates: setEnvaseShowAllDates,
            badgeCount: envaseDayStats.totalCount,
            badgeKg: envaseDayStats.totalKg,
            onRefresh: () => fetchProgramacaoEnvase('TODOS'),
            isRefreshing: loadingEnvase,
            actionButtons: (
              <button
                type="button"
                onClick={handleOpenRelatorioEnvaseModal}
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 active:bg-black text-white rounded-xl text-xs font-extrabold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                title="Abrir e imprimir relatório de envase para um período personalizado"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimir Relatório de Envase</span>
              </button>
            ),
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Linha 1:</span>
                  <span className="font-mono">{envaseDayStats.linha1Count} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">{Number(envaseDayStats.linha1Un).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Linha 2:</span>
                  <span className="font-mono">{envaseDayStats.linha2Count} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">{Number(envaseDayStats.linha2Un).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Linha 3 (Óleos):</span>
                  <span className="font-mono">{envaseDayStats.linha3Count} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">{Number(envaseDayStats.linha3Un).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Total:</span>
                  <span className="font-mono">{envaseDayStats.totalCount} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">{Number(envaseDayStats.totalKg).toLocaleString('pt-BR')} kg</span>
                </div>
              </>
            )
          })}

          {/* BARRA DE PESQUISA DAS LINHAS DE ENVASE E LOCALIZADOR DE DATA */}
          <div className="bg-white border border-zinc-200 rounded-xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={envaseSearch}
                  onChange={e => setEnvaseSearch(e.target.value)}
                  placeholder="Pesquisar lote por número, SKU ou produto nas Linhas 1, 2 e 3 de Envase..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-9 pr-8 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400 font-medium"
                />
                {envaseSearch && (
                  <button
                    type="button"
                    onClick={() => setEnvaseSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Dica / Alerta Inteligente de Data: Se o lote pesquisado estiver agendado em OUTRA data no Envase */}
            {(() => {
              const q = envaseSearch.trim().toLowerCase();
              if (!q || q.length < 2) return null;
              
              const otherDateMatch = programacaoEnvase.find(it => {
                const matchNum = it.loteNumber?.toLowerCase().includes(q);
                const matchProd = it.productCode?.toLowerCase().includes(q) || it.productDescription?.toLowerCase().includes(q);
                const isDifferentDate = it.dataProgramada && it.dataProgramada !== envaseSelectedDate;
                return (matchNum || matchProd) && isDifferentDate;
              });

              if (!otherDateMatch) return null;

              return (
                <div className="flex items-center justify-between gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      Lote <strong>{rotuloLote(otherDateMatch.loteNumber)}</strong> agendado na <strong>{otherDateMatch.linha}</strong> para o dia <strong>{formatDateOnly(otherDateMatch.dataProgramada)}</strong>!
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEnvaseSelectedDate(otherDateMatch.dataProgramada);
                      setEnvaseShowAllDates(false);
                    }}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md text-[11px] shrink-0 transition-colors cursor-pointer shadow-2xs"
                  >
                    Ir para esta data
                  </button>
                </div>
              );
            })()}
          </div>

          {/* QUADRO COM 4 COLUNAS: LINHA 1 | LINHA 2 | LINHA 3 (ÓLEOS) | LIBERADOS PARA ENVASE */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* COLUNA LINHA 1 */}
            <div className="col-span-12 xl:col-span-3 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold tracking-tight">Linha 1 de Envase</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {envaseLinha1Items.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {Number(envaseDayStats.linha1Un).toLocaleString('pt-BR')} un
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverTarget !== 'envase_Linha 1') setDragOverTarget('envase_Linha 1');
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (dragOverTarget === 'envase_Linha 1') setDragOverTarget(null);
                  }
                }}
                onDrop={(e) => handleDropEnvaseColumn(e, 'Linha 1')}
                className={cn(
                  "p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5 transition-all rounded-b-lg",
                  dragOverTarget === 'envase_Linha 1' && "ring-2 ring-zinc-400 bg-zinc-50/50"
                )}
              >
                {loadingEnvase ? (
                  <div className="py-16 text-center text-zinc-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs font-semibold">Carregando Linha 1...</p>
                  </div>
                ) : filteredEnvaseLinha1Items.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Layers className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote na Linha 1 hoje</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {encaixeSearch ? `Nenhum lote correspondente à busca "${encaixeSearch}".` : 'Selecione um produto da lista de Liberados e clique em "+ Linha 1".'}
                    </p>
                  </div>
                ) : (
                  filteredEnvaseLinha1Items.map((item, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === filteredEnvaseLinha1Items.length - 1;
                    const isConcluido = item.statusEnvase === 'CONCLUIDO';
                    const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, envaseSelectedDate, 'envase') : null;
                    const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          const payload = {
                            board: 'envase',
                            source: 'linha',
                            linha: 'Linha 1',
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
                          const targetKey = `envase_Linha 1_${idx}`;
                          if (dragOverTarget !== targetKey) setDragOverTarget(targetKey);
                        }}
                        onDragLeave={(e) => {
                          e.stopPropagation();
                          if (dragOverTarget === `envase_Linha 1_${idx}`) setDragOverTarget(null);
                        }}
                        onDrop={(e) => handleDropEnvaseColumn(e, 'Linha 1', idx)}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2 cursor-grab active:cursor-grabbing",
                          dragOverTarget === `envase_Linha 1_${idx}` && "border-t-4 border-t-zinc-600 ring-2 ring-zinc-300",
                          isAdiadoOriginal
                            ? "border-red-400 bg-red-50/25 ring-1 ring-red-300"
                            : item.statusEnvase === 'EM_ENVASE'
                              ? "border-zinc-400 ring-1 ring-zinc-300 bg-zinc-50/20"
                              : item.statusEnvase === 'EM_ESPERA'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/30"
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
                                  onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'envase', item.productCode)}
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
                              onClick={() => handleReorderEnvase(item.id, 'Linha 1', 'up')}
                              disabled={isFirst}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderEnvase(item.id, 'Linha 1', 'down')}
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
                                  currentDate: item.dataProgramada || envaseSelectedDate || getCurrentBoardDate(),
                                  etapaLabel: 'Linha 1 de Envase',
                                  origem: 'envase_linha',
                                  realLote,
                                  envaseItem: item,
                                });
                              }}
                              className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'envase' })}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEnvase(item.id, item.loteNumber)}
                              className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Remover do quadro"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                        {renderFiscoQuimicaBadge(item.loteNumber)}

                        {(item.statusEnvase === 'EM_ESPERA' || item.observacaoEnvase) && (
                          <div
                            onClick={() => handleOpenEnvaseEspera(item)}
                            className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 text-[11px] font-semibold flex items-center justify-between gap-1 cursor-pointer hover:bg-amber-100 transition-colors"
                            title="Lote em espera no envase. Clique para alterar observação."
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <PauseCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span className="truncate">⏸️ {item.observacaoEnvase || 'Em Espera'}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[11px] md:text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'envase_linha', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'envase')}

                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 2')}
                              className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-zinc-50 text-zinc-700 hover:text-zinc-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 2"
                            >
                              L2
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 3')}
                              className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 3 (Óleos)"
                            >
                              L3
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {item.statusEnvase === 'EM_ESPERA' ? (
                              <button
                                type="button"
                                onClick={() => handleChangeStatusEnvase(item, 'EM_ENVASE')}
                                className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Retomar envase"
                              >
                                <Play className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenEnvaseEspera(item)}
                                className="p-1 text-zinc-400 hover:text-amber-700 hover:bg-amber-50 rounded cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Pausar / Colocar em espera"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleChangeStatusEnvase(item, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão do Envase" : "Concluir Envase"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA LINHA 2 */}
            <div className="col-span-12 xl:col-span-3 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold tracking-tight">Linha 2 de Envase</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {envaseLinha2Items.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {Number(envaseDayStats.linha2Un).toLocaleString('pt-BR')} un
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverTarget !== 'envase_Linha 2') setDragOverTarget('envase_Linha 2');
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (dragOverTarget === 'envase_Linha 2') setDragOverTarget(null);
                  }
                }}
                onDrop={(e) => handleDropEnvaseColumn(e, 'Linha 2')}
                className={cn(
                  "p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5 transition-all rounded-b-lg",
                  dragOverTarget === 'envase_Linha 2' && "ring-2 ring-zinc-400 bg-zinc-50/50"
                )}
              >
                {loadingEnvase ? (
                  <div className="py-16 text-center text-zinc-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs font-semibold">Carregando Linha 2...</p>
                  </div>
                ) : filteredEnvaseLinha2Items.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Layers className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote na Linha 2 hoje</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {encaixeSearch ? `Nenhum lote correspondente à busca "${encaixeSearch}".` : 'Selecione um produto da lista de Liberados e clique em "+ Linha 2".'}
                    </p>
                  </div>
                ) : (
                  filteredEnvaseLinha2Items.map((item, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === envaseLinha2Items.length - 1;
                    const isConcluido = item.statusEnvase === 'CONCLUIDO';
                    const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, envaseSelectedDate, 'envase') : null;
                    const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          const payload = {
                            board: 'envase',
                            source: 'linha',
                            linha: 'Linha 2',
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
                          const targetKey = `envase_Linha 2_${idx}`;
                          if (dragOverTarget !== targetKey) setDragOverTarget(targetKey);
                        }}
                        onDragLeave={(e) => {
                          e.stopPropagation();
                          if (dragOverTarget === `envase_Linha 2_${idx}`) setDragOverTarget(null);
                        }}
                        onDrop={(e) => handleDropEnvaseColumn(e, 'Linha 2', idx)}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2 cursor-grab active:cursor-grabbing",
                          dragOverTarget === `envase_Linha 2_${idx}` && "border-t-4 border-t-zinc-600 ring-2 ring-zinc-300",
                          isAdiadoOriginal
                            ? "border-red-400 bg-red-50/25 ring-1 ring-red-300"
                            : item.statusEnvase === 'EM_ENVASE'
                              ? "border-zinc-400 ring-1 ring-zinc-300 bg-zinc-50/20"
                              : item.statusEnvase === 'EM_ESPERA'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/30"
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
                                  onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'envase', item.productCode)}
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
                              onClick={() => handleReorderEnvase(item.id, 'Linha 2', 'up')}
                              disabled={isFirst}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderEnvase(item.id, 'Linha 2', 'down')}
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
                                  currentDate: item.dataProgramada || envaseSelectedDate || getCurrentBoardDate(),
                                  etapaLabel: 'Linha 2 de Envase',
                                  origem: 'envase_linha',
                                  realLote,
                                  envaseItem: item,
                                });
                              }}
                              className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'envase' })}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEnvase(item.id, item.loteNumber)}
                              className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Remover do quadro"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                        {renderFiscoQuimicaBadge(item.loteNumber)}

                        {(item.statusEnvase === 'EM_ESPERA' || item.observacaoEnvase) && (
                          <div
                            onClick={() => handleOpenEnvaseEspera(item)}
                            className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 text-[11px] font-semibold flex items-center justify-between gap-1 cursor-pointer hover:bg-amber-100 transition-colors"
                            title="Lote em espera no envase. Clique para alterar observação."
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <PauseCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span className="truncate">⏸️ {item.observacaoEnvase || 'Em Espera'}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[11px] md:text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'envase_linha', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'envase')}

                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 1')}
                              className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-zinc-50 text-zinc-700 hover:text-zinc-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 1"
                            >
                              L1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 3')}
                              className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 3 (Óleos)"
                            >
                              L3
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {item.statusEnvase === 'EM_ESPERA' ? (
                              <button
                                type="button"
                                onClick={() => handleChangeStatusEnvase(item, 'EM_ENVASE')}
                                className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Retomar envase"
                              >
                                <Play className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenEnvaseEspera(item)}
                                className="p-1 text-zinc-400 hover:text-amber-700 hover:bg-amber-50 rounded cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Pausar / Colocar em espera"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleChangeStatusEnvase(item, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão do Envase" : "Concluir Envase"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA LINHA 3 (APENAS ÓLEOS) */}
            <div className="col-span-12 xl:col-span-3 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-zinc-300" />
                  <span className="text-sm font-extrabold tracking-tight">Linha 3 (Apenas Óleos)</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {envaseLinha3Items.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {Number(envaseDayStats.linha3Un).toLocaleString('pt-BR')} un
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverTarget !== 'envase_Linha 3') setDragOverTarget('envase_Linha 3');
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (dragOverTarget === 'envase_Linha 3') setDragOverTarget(null);
                  }
                }}
                onDrop={(e) => handleDropEnvaseColumn(e, 'Linha 3')}
                className={cn(
                  "p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5 transition-all rounded-b-lg",
                  dragOverTarget === 'envase_Linha 3' && "ring-2 ring-amber-600 bg-amber-50/50"
                )}
              >
                {loadingEnvase ? (
                  <div className="py-16 text-center text-zinc-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs font-semibold">Carregando Linha 3...</p>
                  </div>
                ) : filteredEnvaseLinha3Items.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Droplets className="h-8 w-8 mx-auto mb-2 text-amber-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote de óleo na Linha 3 hoje</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {encaixeSearch ? `Nenhum lote correspondente à busca "${encaixeSearch}".` : 'Selecione um óleo da lista de Liberados e clique em "+ Linha 3 (Óleos)".'}
                    </p>
                  </div>
                ) : (
                  filteredEnvaseLinha3Items.map((item, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === envaseLinha3Items.length - 1;
                    const isConcluido = item.statusEnvase === 'CONCLUIDO';
                    const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, envaseSelectedDate, 'envase') : null;
                    const isAdiadoOriginal = Boolean(adiadoInfo && !adiadoInfo.isDestino);

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          const payload = {
                            board: 'envase',
                            source: 'linha',
                            linha: 'Linha 3',
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
                          const targetKey = `envase_Linha 3_${idx}`;
                          if (dragOverTarget !== targetKey) setDragOverTarget(targetKey);
                        }}
                        onDragLeave={(e) => {
                          e.stopPropagation();
                          if (dragOverTarget === `envase_Linha 3_${idx}`) setDragOverTarget(null);
                        }}
                        onDrop={(e) => handleDropEnvaseColumn(e, 'Linha 3', idx)}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2 cursor-grab active:cursor-grabbing",
                          dragOverTarget === `envase_Linha 3_${idx}` && "border-t-4 border-t-amber-600 ring-2 ring-amber-300",
                          isAdiadoOriginal
                            ? "border-red-400 bg-red-50/25 ring-1 ring-red-300"
                            : item.statusEnvase === 'EM_ENVASE'
                              ? "border-zinc-400 ring-1 ring-zinc-300 bg-zinc-50/20"
                              : item.statusEnvase === 'EM_ESPERA'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/30"
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
                                  onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'envase', item.productCode)}
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
                              onClick={() => handleReorderEnvase(item.id, 'Linha 3', 'up')}
                              disabled={isFirst}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderEnvase(item.id, 'Linha 3', 'down')}
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
                                  currentDate: item.dataProgramada || envaseSelectedDate || getCurrentBoardDate(),
                                  etapaLabel: `${item.linha || 'Linha 3'} de Envase`,
                                  origem: 'envase_linha',
                                  realLote,
                                  envaseItem: item,
                                });
                              }}
                              className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'envase' })}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEnvase(item.id, item.loteNumber)}
                              className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Remover do quadro"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                        {renderFiscoQuimicaBadge(item.loteNumber)}

                        {(item.statusEnvase === 'EM_ESPERA' || item.observacaoEnvase) && (
                          <div
                            onClick={() => handleOpenEnvaseEspera(item)}
                            className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 text-[11px] font-semibold flex items-center justify-between gap-1 cursor-pointer hover:bg-amber-100 transition-colors"
                            title="Lote em espera no envase. Clique para alterar observação."
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <PauseCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span className="truncate">⏸️ {item.observacaoEnvase || 'Em Espera'}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[11px] md:text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'envase_linha', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'envase')}

                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 1')}
                              className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-zinc-50 text-zinc-700 hover:text-zinc-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 1"
                            >
                              L1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 2')}
                              className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-zinc-50 text-zinc-700 hover:text-zinc-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 2"
                            >
                              L2
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {item.statusEnvase === 'EM_ESPERA' ? (
                              <button
                                type="button"
                                onClick={() => handleChangeStatusEnvase(item, 'EM_ENVASE')}
                                className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Retomar envase"
                              >
                                <Play className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenEnvaseEspera(item)}
                                className="p-1 text-zinc-400 hover:text-amber-700 hover:bg-amber-50 rounded cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                                title="Pausar / Colocar em espera"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleChangeStatusEnvase(item, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão do Envase" : "Concluir Envase"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 4: LIBERADOS PARA ENVASE (AGUARDANDO ENCAIXE) */}
            <div className="col-span-12 xl:col-span-3 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-white" />
                  <div>
                    <span className="text-sm font-extrabold tracking-tight">Lotes</span>
                    <span className="block text-[11px] md:text-[10px] font-medium text-zinc-300">Aguardando encaixe no envase</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {lotesParaEncaixe.length}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={encaixeSearch}
                    onChange={(e) => setEncaixeSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(encaixeSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {encaixeSearch && (
                    <button
                      type="button"
                      onClick={() => setEncaixeSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { setEnvaseScopeFilter('LIBERADOS'); }}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors",
                      envaseScopeFilter === 'LIBERADOS' ? "bg-white text-zinc-900 shadow-2xs border border-zinc-300" : "text-zinc-500 hover:text-zinc-800"
                    )}
                    title="Lotes já produzidos e liberados para envase"
                  >
                    Liberados ({contarLotesUnicos(lotesLiberadosParaAcabamento)})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEnvaseScopeFilter('TODOS'); }}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors",
                      envaseScopeFilter === 'TODOS' ? "bg-white text-zinc-900 shadow-2xs border border-zinc-300" : "text-zinc-500 hover:text-zinc-800"
                    )}
                    title="Todas as ordens abertas da fábrica no Hub"
                  >
                    Todas Abertas ({contarLotesUnicos(todasOrdensAbertasFabrica)})
                  </button>
                </div>
              </div>

              <div className="p-3 bg-zinc-50/30 min-h-[460px] max-h-[710px] overflow-y-auto space-y-2.5">
                {lotesParaEncaixe.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote aguardando envase</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {encaixeSearch ? `Nenhum lote correspondente à busca "${encaixeSearch}".` : "Conclua a fabricação na aba Quadro de Produção para liberar novos lotes aqui."}
                    </p>
                  </div>
                ) : (
                  lotesParaEncaixe.map((lote, idx) => {
                    const scheduledItem = programacaoEnvase.find(it => 
                      it.loteNumber === lote.loteNumber && 
                      (!it.productCode || !lote.productCode || it.productCode === lote.productCode)
                    );
                    const isScheduled = Boolean(scheduledItem);
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const temProblema = hasLoteProblemaOuPausa(lote, null, 'envase');

                    return (
                      <div
                        key={loteRowKey(lote)}
                        draggable
                        onDragStart={(e) => {
                          const payload = {
                            board: 'envase',
                            source: 'liberados',
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
                          isScheduled ? "border-zinc-300 bg-zinc-50/20" : "border-zinc-200"
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
                            {isLoteTerceirizado(lote) && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono" title="Lote Terceirizado">
                                Terceirizado
                              </span>
                            )}
                            {encaixeSearch.trim() && scheduledItem?.dataProgramada && parseLoteDateToIso(scheduledItem.dataProgramada) === envaseSelectedDate && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 font-sans">Já programado para esta data</span>
                            )}
                            {encaixeSearch.trim() && scheduledItem?.dataProgramada && parseLoteDateToIso(scheduledItem.dataProgramada) !== envaseSelectedDate && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-50 text-zinc-700 border border-zinc-200 font-sans">Agendado em {(() => { const iso = parseLoteDateToIso(scheduledItem.dataProgramada) || ''; const p = iso.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : formatDateOnly(iso); })()}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenPauseModal(lote, 'envase')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-colors",
                                temProblema
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : "text-zinc-400 hover:bg-amber-50 hover:text-amber-600"
                              )}
                              title="Informar falta de insumo ou pausar lote no Envase"
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
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'envase' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoverDaFila(lote.loteNumber, 'envase')}
                              className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-600 cursor-pointer transition-colors max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Remover dos Liberados para Envase"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[11px] md:text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-50 text-zinc-800 border border-zinc-200">
                              {getEffectiveStatus(lote)}
                            </span>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {renderFiscoQuimicaBadge(lote.loteNumber)}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {formatarUnidadesLote(lote, "text-[11px] md:text-[10px] text-zinc-500 font-normal")}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lote, 'envase_fila', handleOpenEditTimestamps)}

                        {renderLoteEsperaBadge(lote)}
                        {!getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem).isEmEspera && renderLoteProblemaBanner(lote, 'envase')}

                        <div className="pt-2 border-t border-zinc-100 space-y-1.5">
                          {encaixeSearch.trim() && (() => {
                            const iso = scheduledItem?.dataProgramada ? (parseLoteDateToIso(scheduledItem.dataProgramada) || '') : '';
                            if (iso && iso === envaseSelectedDate) return null;
                            const linha = scheduledItem?.linha === 'Linha 2' || scheduledItem?.linha === 'Linha 3' ? scheduledItem.linha : 'Linha 1';
                            return (
                              <button
                                type="button"
                                onClick={() => handleEncaixarLote(lote, linha, undefined, undefined, undefined, envaseSelectedDate)}
                                className="w-full py-1.5 text-[11px] font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg cursor-pointer"
                              >
                                {iso ? 'Mover para Hoje' : '+ Adicionar para Hoje'}
                              </button>
                            );
                          })()}
                          {isScheduled && scheduledItem ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] md:text-[10px] font-bold text-zinc-700 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded">
                                  {scheduledItem.linha} ({scheduledItem.ordem}º)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEnvase(scheduledItem.id, lote.loteNumber)}
                                  className="text-[11px] md:text-[10px] font-bold text-red-600 hover:text-red-800 hover:underline cursor-pointer flex items-center gap-0.5"
                                  title="Remover do quadro de envase"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Remover</span>
                                </button>
                              </div>
                              <div className="flex items-center gap-1">
                                {scheduledItem.linha !== 'Linha 1' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMoveLinha(scheduledItem, 'Linha 1')}
                                    className="flex-1 py-0.5 text-[11px] md:text-[10px] font-bold bg-zinc-50 text-zinc-800 border border-zinc-200 rounded hover:bg-zinc-100 cursor-pointer text-center"
                                    title="Mover para Linha 1"
                                  >
                                    L1
                                  </button>
                                )}
                                {scheduledItem.linha !== 'Linha 2' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMoveLinha(scheduledItem, 'Linha 2')}
                                    className="flex-1 py-0.5 text-[11px] md:text-[10px] font-bold bg-zinc-50 text-zinc-800 border border-zinc-200 rounded hover:bg-zinc-100 cursor-pointer text-center"
                                    title="Mover para Linha 2"
                                  >
                                    L2
                                  </button>
                                )}
                                {scheduledItem.linha !== 'Linha 3' && scheduledItem.linha !== 'Linha 3 (Óleos)' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMoveLinha(scheduledItem, 'Linha 3')}
                                    className="flex-1 py-0.5 text-[11px] md:text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded hover:bg-amber-100 cursor-pointer text-center"
                                    title="Mover para Linha 3 (Óleos)"
                                  >
                                    L3
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-1">
                              <button
                                type="button"
                                onClick={() => handleEncaixarLote(lote, 'Linha 1')}
                                className="py-1 px-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs"
                                title="Encaixar na Linha 1"
                              >
                                + L1
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEncaixarLote(lote, 'Linha 2')}
                                className="py-1 px-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs"
                                title="Encaixar na Linha 2"
                              >
                                + L2
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEncaixarLote(lote, 'Linha 3')}
                                className="py-1 px-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs"
                                title="Encaixar na Linha 3 (Apenas Óleos)"
                              >
                                + L3
                              </button>
                            </div>
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
