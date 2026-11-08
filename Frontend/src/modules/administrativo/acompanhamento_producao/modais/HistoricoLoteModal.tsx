import React from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { rotuloLote, calculateStageDurations, getEffectiveStatus } from '../lib/lotes';
import { Clock, CheckCircle2, Droplets, CheckSquare, Calendar, RefreshCw, Info } from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { formatDateTime, formatDurationBetween } from '../lib/datas';
import type { StatusHistoryEntry, AcompanhamentoLote, ProgramacaoEnvaseItem } from '../lib/tipos';

export interface HistoricoLoteModalProps {
  getBadgeClass: (status: string | null | undefined) => 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold' | 'bg-amber-50 text-amber-700 border-amber-200 font-semibold' | 'bg-zinc-100 text-zinc-800 border-zinc-300 font-semibold' | 'bg-zinc-100 text-zinc-700 border-zinc-200';
  historyList: StatusHistoryEntry[];
  historyModalLote: AcompanhamentoLote;
  loadingHistory: boolean;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  setHistoryModalLote: React.Dispatch<React.SetStateAction<AcompanhamentoLote>>;
}

export default function HistoricoLoteModal({ getBadgeClass, historyList, historyModalLote, loadingHistory, programacaoEnvase, setHistoryModalLote }: HistoricoLoteModalProps) {
  return (
<Drawer size="lg" onClose={() => setHistoryModalLote(null)}
  title={`Histórico do Lote ${rotuloLote(historyModalLote.loteNumber)}`}
  subtitle={<span className="block whitespace-normal font-sans">{historyModalLote.productDescription} • {Number(historyModalLote.quantity).toLocaleString('pt-BR')} un ({Number(historyModalLote.quantityKg).toLocaleString('pt-BR')} kg)</span>}
  footer={
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setHistoryModalLote(null)}
                className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
}>

            <div className="space-y-4 min-w-0 max-w-full">
              {/* TEMPO EM CADA ETAPA */}
              {(() => {
                const metrics = calculateStageDurations(historyModalLote);
                return (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-zinc-200/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-zinc-700" />
                        <span className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">
                          Tempo em Cada Etapa
                        </span>
                      </div>
                      <div className="text-xs font-mono font-bold text-zinc-700 bg-white px-2.5 py-1 rounded-lg border border-zinc-200 flex items-center gap-1.5 shadow-2xs">
                        <span>Tempo Total:</span>
                        <span className={metrics.totalIsCompleted ? "text-emerald-700 font-extrabold" : "text-zinc-700 font-extrabold"}>
                          {metrics.totalDuration}
                        </span>
                        {metrics.totalIsCompleted && (
                          <span className="text-[11px] md:text-[10px] text-emerald-600 font-medium">✓ finalizado</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {metrics.stages.map((st) => (
                        <div
                          key={st.stage}
                          className={cn(
                            "p-2.5 rounded-xl border text-xs flex flex-col justify-between transition-all",
                            st.isActive
                              ? "bg-white border-zinc-400 ring-2 ring-zinc-100 shadow-xs"
                              : st.isCompleted
                                ? "bg-white border-zinc-200/90 shadow-2xs"
                                : "bg-zinc-50/50 border-zinc-200/50 text-zinc-400 opacity-75"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              "font-bold text-xs",
                              st.isActive ? "text-zinc-900 font-extrabold" : st.isCompleted ? "text-zinc-800" : "text-zinc-500"
                            )}>
                              {st.label}
                            </span>
                            {st.isActive ? (
                              <span className="px-1.5 py-0.5 rounded-md text-[11px] md:text-[9px] font-bold bg-zinc-100 text-zinc-800 animate-pulse">
                                Ativa
                              </span>
                            ) : st.isCompleted ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : null}
                          </div>

                          <div className="mt-2 flex items-baseline justify-between pt-1.5 border-t border-zinc-100">
                            <span className="text-[11px] md:text-[10px] text-zinc-400 font-medium">Duração:</span>
                            <span className={cn(
                              "font-mono font-bold text-xs",
                              st.isActive ? "text-zinc-700 font-extrabold" : st.isCompleted ? "text-zinc-900" : "text-zinc-400"
                            )}>
                              {st.durationFormatted}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ESTIMATIVA DE ENVASE & APROVEITAMENTO DE MASSA NO HISTÓRICO */}
              {(() => {
                const totalUn = Number(historyModalLote.quantity) || 0;
                const totalMassa = Number(historyModalLote.quantityKg) || 0;
                const parcQty = Number(historyModalLote.quantidadeEnvasadaParcial || (historyModalLote as any).quantidade_envasada_parcial) || 0;
                const isFin = Boolean(historyModalLote.dataFinalizada || getEffectiveStatus(historyModalLote) === 'Ordem Finalizada');
                const qtdReal = isFin ? totalUn : (parcQty > 0 ? parcQty : 0);
                const massaReal = totalUn > 0 && qtdReal > 0 ? Math.round(((qtdReal * totalMassa) / totalUn) * 100) / 100 : (isFin ? totalMassa : 0);
                const rendPct = totalUn > 0 && qtdReal > 0 ? Math.min(100, Math.round((qtdReal / totalUn) * 1000) / 10) : (isFin ? 100 : 0);
                const saldUn = Math.max(0, totalUn - qtdReal);
                const saldKg = Math.max(0, Math.round((totalMassa - massaReal) * 100) / 100);

                const envItem = programacaoEnvase.find(it => (it.loteNumber || '').trim() === (historyModalLote.loteNumber || '').trim());
                const linEnvase = envItem?.linha || 'Linha 1';
                const minEstimados = totalUn > 0 ? Math.round((totalUn / 1200) * 60) : 0;
                const hEst = Math.floor(minEstimados / 60);
                const mEst = minEstimados % 60;
                const tempoFmtEnvase = `${hEst}h ${mEst.toString().padStart(2, '0')}min`;

                return (
                  <div className="space-y-3">
                    {/* Bloco Estimativa de Envase */}
                    <div className="bg-zinc-50/40 border border-zinc-200 rounded-xl p-3.5 text-xs space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100">
                        <span className="font-bold text-zinc-950 flex items-center gap-1.5">
                          <Droplets className="h-4 w-4 text-zinc-600" />
                          Estimativa de Envase ({linEnvase})
                        </span>
                        <span className="font-mono text-[11px] md:text-[10px] bg-zinc-100 text-zinc-900 px-2 py-0.5 rounded font-bold">
                          1.200 un/h nominal
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 font-mono">
                        <div>
                          <span className="text-[11px] md:text-[10px] text-zinc-400 block font-sans">Tempo Previsto:</span>
                          <span className="font-bold text-zinc-900">{tempoFmtEnvase}</span>
                        </div>
                        <div>
                          <span className="text-[11px] md:text-[10px] text-zinc-400 block font-sans">Início do Envase:</span>
                          <span className="text-zinc-800">{historyModalLote.dataEnvase ? formatDateTime(historyModalLote.dataEnvase) : 'Aguardando linha'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bloco Aproveitamento de Massa */}
                    <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-3.5 text-xs space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-emerald-100">
                        <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                          <CheckSquare className="h-4 w-4 text-emerald-600" />
                          Histórico de Rendimento & Fechamento de Massa
                        </span>
                        <span className="font-mono text-[11px] md:text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded font-bold">
                          {rendPct > 0 ? `${rendPct}% aproveitamento` : 'Em processamento'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                        <div className="bg-white p-2 rounded-lg border border-zinc-200">
                          <span className="text-[11px] md:text-[9px] uppercase font-bold text-zinc-400 block font-sans">Planejado</span>
                          <span className="font-bold text-zinc-800">{totalMassa} kg</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-zinc-200">
                          <span className="text-[11px] md:text-[9px] uppercase font-bold text-zinc-600 block font-sans">Apontado</span>
                          <span className="font-bold text-zinc-700">{massaReal} kg</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-emerald-200">
                          <span className="text-[11px] md:text-[9px] uppercase font-bold text-emerald-600 block font-sans">Rendimento</span>
                          <span className="font-bold text-emerald-700">{rendPct > 0 ? `${rendPct}%` : '—'}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-zinc-200">
                          <span className="text-[11px] md:text-[9px] uppercase font-bold text-zinc-400 block font-sans">Saldo/Perda</span>
                          <span className="font-bold text-amber-700">{saldKg} kg</span>
                        </div>
                      </div>
                      {rendPct > 0 && (
                        <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden mt-1">
                          <div className={cn("h-full rounded-full", rendPct >= 98 ? "bg-emerald-600" : "bg-amber-500")} style={{ width: `${Math.max(4, rendPct)}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="bg-zinc-50 border border-zinc-200/80 rounded-lg p-4 space-y-2">
                <span className="text-[11px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Datas Registradas por Etapa
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-amber-900">Pesagem:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataPesagem)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-zinc-900">Produção:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataProducao)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-zinc-900">Envase:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataEnvase)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-zinc-900">Rotulagem:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataRotulagem)}</span>
                  </div>
                  {historyModalLote.dataPrevisao && (
                    <div className="col-span-2 flex items-center justify-between p-2 bg-zinc-50/70 rounded-xl border border-zinc-200">
                      <span className="font-semibold text-zinc-950 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-zinc-600" />
                        Previsão de Produção (Meta):
                      </span>
                      <span className="font-mono text-zinc-800 font-bold">{formatDateTime(historyModalLote.dataPrevisao)}</span>
                    </div>
                  )}
                  {historyModalLote.dataEmEspera && (
                    <div className="col-span-2 flex items-center justify-between p-2 bg-amber-50/60 rounded-xl border border-amber-200">
                      <span className="font-semibold text-amber-950">Em Espera ({historyModalLote.motivoEspera || 'Pausado'}):</span>
                      <span className="font-mono text-amber-800">{formatDateTime(historyModalLote.dataEmEspera)}</span>
                    </div>
                  )}
                  <div className="col-span-2 flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-emerald-900">Finalizada:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataFinalizada)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <span className="text-[11px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Linha do Tempo de Alterações
                </span>

                {loadingHistory ? (
                  <div className="py-8 text-center text-zinc-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs">Carregando histórico detalhado...</p>
                  </div>
                ) : historyList.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-lg">
                    <Info className="h-5 w-5 mx-auto mb-1 text-zinc-300" />
                    <p className="text-xs font-semibold text-zinc-600">Nenhum evento gravado anteriormente</p>
                    <p className="text-[11px] text-zinc-400">As novas alterações serão registradas aqui em tempo real.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyList.map((entry, idx) => {
                      const nextEntry = historyList[idx + 1];
                      const durationInStatus = nextEntry ? formatDurationBetween(entry.changedAt, nextEntry.changedAt) : null;

                      return (
                        <div
                          key={entry.id}
                          className="flex items-start justify-between gap-3 p-3 bg-white border border-zinc-200 rounded-xl text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "px-2 py-0.5 rounded-md text-[11px] md:text-[10px] font-bold border",
                              entry.status === 'Previsão Alterada'
                                ? "bg-zinc-50 text-zinc-700 border-zinc-200"
                                : getBadgeClass(entry.status)
                            )}>
                              {entry.status}
                            </span>
                            <div>
                              <span className="font-bold text-zinc-900">{entry.changedBy || 'Operador'}</span>
                              {entry.notes && (
                                <span className={cn(
                                  "text-[11px] md:text-[10px] ml-1.5 font-bold",
                                  entry.status === 'Previsão Alterada' ? "text-zinc-800" : "text-amber-800"
                                )}>
                                  • {entry.notes}
                                </span>
                              )}
                              {durationInStatus && (
                                <div className="text-[11px] md:text-[10px] text-zinc-400 mt-0.5">
                                  Permaneceu por: <strong className="font-mono text-zinc-600">{durationInStatus}</strong>
                                </div>
                              )}
                            </div>
                          </div>

                          <span className="text-[11px] font-mono text-zinc-500 shrink-0 text-right">
                            {formatDateTime(entry.changedAt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

</Drawer>
  );
}
