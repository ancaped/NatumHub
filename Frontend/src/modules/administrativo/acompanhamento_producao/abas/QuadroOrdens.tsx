import React from 'react';
import { CheckSquare, Search, X, CheckCheck, CheckCircle2, Clock, CalendarPlus, Eye, History, RotateCcw, Pencil, Check, Package } from 'lucide-react';
import { getPrevisaoBadge, getEffectivePrevisao, loteRowKey, rotuloLote, formatarUnidadesLote, renderCardTimelineDates, getEffectiveStatus } from '../lib/lotes';
import { cn } from '../../../geral/lib/utils';
import type { UnifiedQuadroHeaderProps, AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface QuadroOrdensProps {
  baseLotesParaOrdens: AcompanhamentoLote[];
  baseOrdensFinalizadas: AcompanhamentoLote[];
  baseOrdensParciais: AcompanhamentoLote[];
  executeStatusUpdate: (loteNumber: string, newStatus: string, motivoEspera: string | null, resetConfirmado?: boolean, motivoReset?: string) => Promise<void>;
  fetchLotes: () => Promise<void>;
  filteredOrdensFinalizadas: AcompanhamentoLote[];
  filteredOrdensParciais: AcompanhamentoLote[];
  handleMoveLoteNextDay: (lote: AcompanhamentoLote, targetDateOverride?: string) => Promise<void>;
  handleOpenEditTimestamps: (lote: AcompanhamentoLote) => void;
  handleOpenHistory: (lote: AcompanhamentoLote) => Promise<void>;
  loading: boolean;
  lotesParaOrdens: AcompanhamentoLote[];
  multiProductLoteNumbers: Set<string>;
  ordensFinalizadas: AcompanhamentoLote[];
  ordensParciais: AcompanhamentoLote[];
  ordensSearch: string;
  ordensSelectedDate: string;
  ordensShowAllDates: boolean;
  performRemoteLookup: (query: string) => Promise<void>;
  renderQuadrosOcultosBadges: (lote: AcompanhamentoLote) => React.JSX.Element;
  renderUnifiedQuadroHeader: ({ title, subtitle, icon, selectedDate, setSelectedDate, showAllDates, setShowAllDates, badgeCount, badgeCountLabel, badgeKg, badgeUn, badgeExtra, operationalMetrics, actionButtons, onRefresh, isRefreshing, }: UnifiedQuadroHeaderProps) => React.JSX.Element;
  setOrdensSearch: React.Dispatch<React.SetStateAction<string>>;
  setOrdensSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  setOrdensShowAllDates: React.Dispatch<React.SetStateAction<boolean>>;
  setParcialModalLote: React.Dispatch<React.SetStateAction<AcompanhamentoLote>>;
  setSelectedLoteDetails: React.Dispatch<React.SetStateAction<{ lote: AcompanhamentoLote | ProgramacaoEnvaseItem | ProgramacaoRotulagemItem; etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens'; }>>;
  totalOrdensFinalizadasNaoLancadas: number;
}

export default function QuadroOrdens({ baseLotesParaOrdens, baseOrdensFinalizadas, baseOrdensParciais, executeStatusUpdate, fetchLotes, filteredOrdensFinalizadas, filteredOrdensParciais, handleMoveLoteNextDay, handleOpenEditTimestamps, handleOpenHistory, loading, lotesParaOrdens, multiProductLoteNumbers, ordensFinalizadas, ordensParciais, ordensSearch, ordensSelectedDate, ordensShowAllDates, performRemoteLookup, renderQuadrosOcultosBadges, renderUnifiedQuadroHeader, setOrdensSearch, setOrdensSelectedDate, setOrdensShowAllDates, setParcialModalLote, setSelectedLoteDetails, totalOrdensFinalizadasNaoLancadas }: QuadroOrdensProps) {
  return (
<div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Quadro de Ordens",
            subtitle: "Acompanhamento contínuo de ordens finalizadas no chão de fábrica e ordens com apontamentos parciais.",
            icon: <CheckSquare className="h-6 w-6 text-white" />,
            selectedDate: ordensSelectedDate,
            setSelectedDate: setOrdensSelectedDate,
            showAllDates: ordensShowAllDates,
            setShowAllDates: setOrdensShowAllDates,
            badgeCount: totalOrdensFinalizadasNaoLancadas,
            badgeCountLabel: "pendente(s) no ERP",
            badgeKg: ordensFinalizadas.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0) + ordensParciais.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0),
            onRefresh: fetchLotes,
            isRefreshing: loading,
            actionButtons: (
              <div className="relative min-w-[220px] max-w-xs">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={ordensSearch}
                  onChange={e => setOrdensSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      performRemoteLookup(ordensSearch);
                    }
                  }}
                  placeholder="Pesquisar lote em Ordens..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                />
                {ordensSearch && (
                  <button
                    type="button"
                    onClick={() => setOrdensSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ),
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                  <span>Finalizadas:</span>
                  <span className="font-mono">{ordensFinalizadas.length}{ordensSearch ? ` / ${baseOrdensFinalizadas.length}` : ''} ordens</span>
                  <span className="text-emerald-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-emerald-700">
                    {ordensFinalizadas.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0).toLocaleString('pt-BR')} un
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-bold">
                  <span>Parciais:</span>
                  <span className="font-mono">{ordensParciais.length}{ordensSearch ? ` / ${baseOrdensParciais.length}` : ''} ordens</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-700">
                    {ordensParciais.reduce((acc, l) => acc + (Number(l.quantidadeEnvasadaParcial || (l as any).quantidade_envasada_parcial) || 0), 0).toLocaleString('pt-BR')} un
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Em Andamento:</span>
                  <span className="font-mono">{lotesParaOrdens.length}{ordensSearch ? ` / ${baseLotesParaOrdens.length}` : ''} lotes</span>
                </div>
              </>
            )
          })}

          {/* GRID COM 3 COLUNAS: ORDENS FINALIZADAS (ESQ) | ORDENS PARCIAIS (CENTRO) | FILA DE ESCOLHA (DIR) */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* COLUNA 1: ORDENS FINALIZADAS */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCheck className="h-4 w-4 text-white" />
                  <span className="text-sm font-extrabold tracking-tight">Ordens Finalizadas</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {filteredOrdensFinalizadas.length}
                  </span>
                </div>
                <div className="text-right flex items-center gap-1.5 flex-wrap justify-end">
                  <span className="text-[11px] md:text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold" title="Lançadas no ERP (EA)">
                    {filteredOrdensFinalizadas.filter(l => l.erpStatus === 'EA').length} no ERP
                  </span>
                  <span className="text-[11px] md:text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold" title="Pendentes no ERP">
                    {filteredOrdensFinalizadas.filter(l => l.erpStatus !== 'EA').length} pend.
                  </span>
                  <span className="text-zinc-500 text-xs">|</span>
                  <span className="font-mono text-xs text-zinc-300 font-semibold">
                    {filteredOrdensFinalizadas.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0).toLocaleString('pt-BR')} un
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200">
                <p className="text-[11px] text-zinc-600 font-medium">
                  Ordens concluídas no chão de fábrica e status de sincronização com o ERP (EA).
                </p>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5">
                {filteredOrdensFinalizadas.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhuma ordem finalizada pendente</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {ordensSearch ? `Nenhuma ordem correspondente à busca "${ordensSearch}".` : 'Finalize um lote na fila de andamento ao lado para exibi-lo aqui.'}
                    </p>
                  </div>
                ) : (
                  filteredOrdensFinalizadas.map((lote, idx) => {
                    const prevBadge = getPrevisaoBadge(getEffectivePrevisao(lote.date, lote.dataPrevisao));
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    return (
                      <div
                        key={loteRowKey(lote)}
                        className="bg-white border border-emerald-200 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-1 pb-2 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {rotuloLote(lote.loteNumber)}
                            </span>
                            {lote.erpStatus === 'EA' ? (
                              <span className="text-[11px] md:text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600 inline shrink-0" />
                                Lançado no ERP (EA)
                              </span>
                            ) : (
                              <span className="text-[11px] md:text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1">
                                <Clock className="h-3 w-3 text-amber-600 inline shrink-0" />
                                Pendente no ERP
                              </span>
                            )}
                            {isMulti && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono" title="Ordem conjunta com múltiplos produtos">
                                Multi-Produto
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'ordens' })}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver detalhes do lote"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(lote)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver histórico do lote"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-zinc-900 line-clamp-1">
                            {lote.productCode} - {lote.productDescription}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {formatarUnidadesLote(lote, "text-[11px] md:text-[10px] text-zinc-500 font-normal")}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lote, 'ordens', handleOpenEditTimestamps)}

                        {renderQuadrosOcultosBadges(lote)}

                        {prevBadge && (
                          <div className="flex items-center justify-between pt-1 text-[11px]">
                            <span className="text-zinc-400">Previsão:</span>
                            <span className={cn("px-1.5 py-0.5 rounded text-[11px] md:text-[10px] border", prevBadge.colorClass)}>
                              {prevBadge.label}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                          <div className="text-[11px] md:text-[10px] text-zinc-400">
                            Resp: <span className="font-semibold text-zinc-700">{lote.updatedBy || 'Sistema'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => executeStatusUpdate(lote.loteNumber, 'Envase', null)}
                            className="p-1.5 text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer flex items-center justify-center max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                            title="Reverter para status anterior"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 2: ORDENS PARCIAIS */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-zinc-300" />
                  <span className="text-sm font-extrabold tracking-tight">Ordens Parciais</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {filteredOrdensParciais.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {filteredOrdensParciais.reduce((acc, l) => acc + (Number(l.quantidadeEnvasadaParcial || (l as any).quantidade_envasada_parcial) || 0), 0).toLocaleString('pt-BR')} un
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200">
                <p className="text-[11px] text-zinc-600 font-medium">
                  Lotes com produção ou envase parcialmente realizados em fábrica.
                </p>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5">
                {filteredOrdensParciais.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhuma ordem parcial ativa</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {ordensSearch ? `Nenhuma ordem correspondente à busca "${ordensSearch}".` : 'Adicione um apontamento parcial em qualquer lote da fila ao lado.'}
                    </p>
                  </div>
                ) : (
                  filteredOrdensParciais.map((lote, idx) => {
                    const totalQty = Number(lote.quantity) || 0;
                    const parcialQty = Number(lote.quantidadeEnvasadaParcial || (lote as any).quantidade_envasada_parcial) || 0;
                    const pct = totalQty > 0 ? Math.min(100, Math.round((parcialQty / totalQty) * 100)) : 0;
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);

                    return (
                      <div
                        key={loteRowKey(lote)}
                        className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-1 pb-2 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {rotuloLote(lote.loteNumber)}
                            </span>
                            <span className="text-[11px] md:text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-50 text-zinc-900 border border-zinc-200">
                              Parcial ({pct}%)
                            </span>
                            {isMulti && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono" title="Ordem conjunta com múltiplos produtos">
                                Multi-Produto
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'ordens' })}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver detalhes do lote"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(lote)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver histórico do lote"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-zinc-900 line-clamp-1">
                            {lote.productCode} - {lote.productDescription}
                          </div>
                        </div>

                        {renderCardTimelineDates(lote, 'ordens', handleOpenEditTimestamps)}

                        {renderQuadrosOcultosBadges(lote)}

                        {/* Barra de Progresso Parcial */}
                        <div className="space-y-1 bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-zinc-900">
                              {parcialQty.toLocaleString('pt-BR')} <span className="font-normal text-zinc-500">de {totalQty.toLocaleString('pt-BR')} un</span>
                            </span>
                            <span className="font-bold text-zinc-700">{pct}%</span>
                          </div>
                          <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-zinc-900 h-full rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {/* Botões de Ação na Ordem Parcial */}
                        <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-zinc-100">
                          <button
                            type="button"
                            onClick={() => setParcialModalLote(lote)}
                            className="p-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-900 border border-zinc-300 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                            title="Editar apontamento parcial"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => executeStatusUpdate(lote.loteNumber, 'Ordem Finalizada', null)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
                            title="Concluir totalmente e mover para Ordens Finalizadas"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 3: LOTES EM ANDAMENTO (FILA DE ESCOLHA À DIREITA) */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-12 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm font-extrabold tracking-tight">Lotes em Andamento</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {lotesParaOrdens.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {lotesParaOrdens.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0).toLocaleString('pt-BR')} un
                </div>
              </div>

              {/* Caixa de Busca Embutida na Coluna de Escolha (Molde Envase) */}
              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={ordensSearch}
                    onChange={e => setOrdensSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(ordensSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {ordensSearch && (
                    <button
                      type="button"
                      onClick={() => setOrdensSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200">
                <p className="text-[11px] text-zinc-600 font-medium">
                  Selecione um lote ativo para lançar apontamento parcial ou marcar como finalizado.
                </p>
              </div>

              <div className="p-3 bg-zinc-50/30 min-h-[460px] max-h-[710px] overflow-y-auto space-y-2.5">
                {lotesParaOrdens.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote em andamento</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {ordensSearch ? `Nenhum lote correspondente à busca "${ordensSearch}".` : "Todos os lotes ativos já foram apontados ou finalizados."}
                    </p>
                  </div>
                ) : (
                  lotesParaOrdens.map((lote, idx) => {
                    const eff = getEffectiveStatus(lote);
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    return (
                      <div
                        key={loteRowKey(lote)}
                        className="bg-white border border-zinc-200 rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {rotuloLote(lote.loteNumber)}
                            </span>
                            <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-zinc-200">
                              {eff}
                            </span>
                            {isMulti && (
                              <span className="text-[11px] md:text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono" title="Ordem conjunta com múltiplos produtos">
                                Multi-Produto
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'ordens' })}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded hover:bg-zinc-100 transition-colors cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver detalhes do lote"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(lote)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded hover:bg-zinc-100 transition-colors cursor-pointer max-md:min-h-11 max-md:min-w-11 max-md:inline-flex max-md:items-center max-md:justify-center"
                              title="Ver histórico do lote"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-zinc-900 line-clamp-1">
                            {lote.productCode} - {lote.productDescription}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {formatarUnidadesLote(lote, "text-[11px] md:text-[10px] text-zinc-500 font-normal")}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lote, 'ordens', handleOpenEditTimestamps)}

                        {renderQuadrosOcultosBadges(lote)}

                        {/* Botões de Ação Rápida */}
                        <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-zinc-100">
                          <button
                            type="button"
                            onClick={() => setParcialModalLote(lote)}
                            className="p-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-900 border border-zinc-200 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                            title="Registrar apontamento parcial"
                          >
                            <Clock className="h-3.5 w-3.5 text-zinc-600" />
                          </button>

                          <button
                            type="button"
                            onClick={() => executeStatusUpdate(lote.loteNumber, 'Ordem Finalizada', null)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
                            title="Marcar como ordem finalizada (aguardando lançamento no ERP)"
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
        </div>
  );
}
