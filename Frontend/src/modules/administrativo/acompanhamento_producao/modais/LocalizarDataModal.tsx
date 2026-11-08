import React from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { Search, X, CheckCircle2, Droplets, Tag, Scale, Flame } from 'lucide-react';
import { getEffectiveStatus, formatarUnidadesLote } from '../lib/lotes';
import { formatDateOnly, parseLoteDateToIso } from '../lib/datas';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem, TabType } from '../lib/tipos';

export interface LocalizarDataModalProps {
  localizarDataSearch: string;
  lotes: AcompanhamentoLote[];
  performRemoteLookup: (query: string) => Promise<void>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  setCurrentTab: React.Dispatch<React.SetStateAction<TabType>>;
  setEnvaseSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  setEnvaseShowAllDates: React.Dispatch<React.SetStateAction<boolean>>;
  setLocalizarDataSearch: React.Dispatch<React.SetStateAction<string>>;
  setPesagemSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  setProducaoSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  setRotulagemSelectedDate: React.Dispatch<React.SetStateAction<string>>;
  setRotulagemShowAllDates: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLocalizarDataModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function LocalizarDataModal({ localizarDataSearch, lotes, performRemoteLookup, programacaoEnvase, programacaoRotulagem, setCurrentTab, setEnvaseSelectedDate, setEnvaseShowAllDates, setLocalizarDataSearch, setPesagemSelectedDate, setProducaoSelectedDate, setRotulagemSelectedDate, setRotulagemShowAllDates, setShowLocalizarDataModal }: LocalizarDataModalProps) {
  return (
<Drawer size="lg" onClose={() => setShowLocalizarDataModal(false)}
  title="Localizador de Datas e Agendamentos"
  badge={<span className="text-[11px] md:text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">Busca Rápida</span>}
  subtitle={<span className="block whitespace-normal font-sans">Encontre em qual data qualquer lote está agendado no Envase, Rotulagem, Produção ou Pesagem.</span>}
  footer={
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLocalizarDataModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
}>
<div className="space-y-3">

            {/* Input de Pesquisa */}
            <div className="rounded-xl p-3 bg-zinc-50 border border-zinc-200 space-y-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  autoFocus
                  value={localizarDataSearch}
                  onChange={(e) => setLocalizarDataSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      performRemoteLookup(localizarDataSearch);
                    }
                  }}
                  placeholder="Digite o número do lote (ex: 15686, 15795) ou SKU do produto..."
                  className="w-full bg-white border border-zinc-300 rounded-xl pl-9 pr-8 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder:text-zinc-400 font-medium"
                />
                {localizarDataSearch && (
                  <button
                    type="button"
                    onClick={() => setLocalizarDataSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                Digite ao menos 2 caracteres para pesquisar o histórico de agendamento em todas as etapas.
              </p>
            </div>

            {/* Lista de Resultados */}
            <div className="space-y-3 min-h-[300px]">
              {(() => {
                const q = localizarDataSearch.trim().toLowerCase();
                if (!q || q.length < 2) {
                  return (
                    <div className="py-16 text-center text-zinc-400">
                      <Search className="h-10 w-10 mx-auto mb-2 text-zinc-300 stroke-1" />
                      <p className="text-xs font-bold text-zinc-600">Pesquise por qualquer lote ou produto</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Exemplo: digite <span className="font-mono font-bold text-zinc-700">15686</span> ou <span className="font-mono font-bold text-zinc-700">15795</span> para ver suas datas.
                      </p>
                    </div>
                  );
                }

                // Busca nos lotes gerais
                const matchedLotes = lotes.filter(l => {
                  const num = (l.loteNumber || '').toLowerCase();
                  const code = (l.productCode || '').toLowerCase();
                  const desc = (l.productDescription || '').toLowerCase();
                  return num.includes(q) || code.includes(q) || desc.includes(q);
                });

                // Também verifica em programacaoEnvase caso o lote não esteja na lista principal
                const envaseOnly = programacaoEnvase
                  .filter(it => it.loteNumber?.toLowerCase().includes(q) || it.productCode?.toLowerCase().includes(q))
                  .filter(it => !matchedLotes.some(m => m.loteNumber === it.loteNumber));

                // Também verifica em programacaoRotulagem caso o lote não esteja na lista principal
                const rotulagemOnly = programacaoRotulagem
                  .filter(it => it.loteNumber?.toLowerCase().includes(q) || it.productCode?.toLowerCase().includes(q))
                  .filter(it => !matchedLotes.some(m => m.loteNumber === it.loteNumber) && !envaseOnly.some(e => e.loteNumber === it.loteNumber));

                const allLoteNumbers = Array.from(new Set([
                  ...matchedLotes.map(l => l.loteNumber),
                  ...envaseOnly.map(e => e.loteNumber),
                  ...rotulagemOnly.map(r => r.loteNumber)
                ])).slice(0, 20);

                if (allLoteNumbers.length === 0) {
                  return (
                    <div className="py-12 text-center text-zinc-400 space-y-3">
                      <CheckCircle2 className="h-8 w-8 mx-auto text-zinc-300" />
                      <div>
                        <p className="text-xs font-bold text-zinc-600">Nenhum agendamento encontrado para "{q}"</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          O lote pode não estar nos quadros ativos ou pertencer a um período anterior.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => performRemoteLookup(localizarDataSearch)}
                        className="px-3 py-1.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                      >
                        <Search className="h-3.5 w-3.5" />
                        <span>Buscar no banco completo do servidor</span>
                      </button>
                    </div>
                  );
                }

                return allLoteNumbers.map(loteNum => {
                  const lote = lotes.find(l => l.loteNumber === loteNum);
                  const envaseItems = programacaoEnvase.filter(it => it.loteNumber === loteNum);
                  const rotulagemItems = programacaoRotulagem.filter(it => it.loteNumber === loteNum);

                  const prodDesc = lote?.productDescription || envaseItems[0]?.productDescription || rotulagemItems[0]?.productDescription || 'Sem descrição';
                  const prodCode = lote?.productCode || envaseItems[0]?.productCode || rotulagemItems[0]?.productCode;
                  const effStatus = lote ? getEffectiveStatus(lote) : 'Agendado';

                  return (
                    <div
                      key={loteNum}
                      className="p-3.5 bg-white border border-zinc-200 rounded-xl shadow-2xs hover:border-zinc-400 transition-all space-y-3"
                    >
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-extrabold text-zinc-900">
                              #{loteNum}
                            </span>
                            {prodCode && (
                              <span className="text-[11px] font-mono text-zinc-500">
                                [{prodCode}]
                              </span>
                            )}
                            <span className="text-[11px] md:text-[10px] px-2 py-0.5 rounded font-bold bg-zinc-100 text-zinc-800 border border-zinc-200">
                              {effStatus}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-zinc-800 mt-0.5">
                            {prodDesc}
                          </p>
                        </div>
                        {lote && (
                          <div className="text-right font-mono text-[11px] text-zinc-500 shrink-0">
                            <div>{Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg</div>
                            <div>{formatarUnidadesLote(lote)}</div>
                          </div>
                        )}
                      </div>

                      {/* Raio-X das Etapas & Datas */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-100">
                        {/* ENVASE */}
                        <div className="p-2.5 rounded-lg bg-zinc-50/50 border border-zinc-100 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-zinc-950 flex items-center gap-1.5 text-[11px]">
                              <Droplets className="h-3.5 w-3.5 text-zinc-600" />
                              Envase
                            </span>
                          </div>
                          {envaseItems.length > 0 ? (
                            envaseItems.map(item => (
                              <div key={item.id} className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100/60 first:border-0 first:pt-0">
                                <div>
                                  <div className="font-bold text-zinc-900 text-xs">
                                    📅 {formatDateOnly(item.dataProgramada)}
                                  </div>
                                  <div className="text-[11px] md:text-[10px] text-zinc-700">
                                    {item.linha} • {item.ordem}º da fila
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEnvaseSelectedDate(item.dataProgramada);
                                    setEnvaseShowAllDates(false);
                                    setCurrentTab('quadro_envase');
                                    setShowLocalizarDataModal(false);
                                  }}
                                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-[11px] md:text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                                >
                                  Ver no Envase
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-zinc-500">
                                {lote?.customStatus === 'Liberado para Envase' ? '✅ Liberado (na fila)' : 'Não agendado no envase'}
                              </span>
                              {lote?.customStatus === 'Liberado para Envase' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCurrentTab('quadro_envase');
                                    setShowLocalizarDataModal(false);
                                  }}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] md:text-[10px] font-bold cursor-pointer transition-colors"
                                >
                                  Ver na Fila
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* ROTULAGEM */}
                        <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-[11px]">
                              <Tag className="h-3.5 w-3.5 text-emerald-600" />
                              Rotulagem
                            </span>
                          </div>
                          {rotulagemItems.length > 0 ? (
                            rotulagemItems.map(item => (
                              <div key={item.id} className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-100/60 first:border-0 first:pt-0">
                                <div>
                                  <div className="font-bold text-emerald-900 text-xs">
                                    📅 {formatDateOnly(item.dataProgramada)}
                                  </div>
                                  <div className="text-[11px] md:text-[10px] text-emerald-700">
                                    {item.tipo === 'MAQUINA' ? 'Máquina' : 'Manual'} • {item.ordem}º da fila
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRotulagemSelectedDate(item.dataProgramada);
                                    setRotulagemShowAllDates(false);
                                    setCurrentTab('quadro_rotulagem');
                                    setShowLocalizarDataModal(false);
                                  }}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] md:text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                                >
                                  Ver na Rotulagem
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-zinc-500">
                                Não agendado na rotulagem
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setCurrentTab('quadro_rotulagem');
                                  setShowLocalizarDataModal(false);
                                }}
                                className="px-2 py-1 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 rounded text-[11px] md:text-[10px] font-bold cursor-pointer transition-colors"
                              >
                                Ver Rotulagem
                              </button>
                            </div>
                          )}
                        </div>

                        {/* PESAGEM */}
                        <div className="p-2.5 rounded-lg bg-amber-50/50 border border-amber-100 space-y-1.5">
                          <span className="font-bold text-amber-950 flex items-center gap-1.5 text-[11px]">
                            <Scale className="h-3.5 w-3.5 text-amber-600" />
                            Pesagem
                          </span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-zinc-700">
                              {lote?.dataPesagem ? `Data: ${formatDateOnly(lote.dataPesagem)}` : 'Aguardando agendamento'}
                            </span>
                            {lote?.dataPesagem && (
                              <button
                                type="button"
                                onClick={() => {
                                  const dateIso = parseLoteDateToIso(lote.dataPesagem);
                                  if (dateIso) setPesagemSelectedDate(dateIso);
                                  setCurrentTab('quadro_pesagem');
                                  setShowLocalizarDataModal(false);
                                }}
                                className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] md:text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                              >
                                Ir para Pesagem
                              </button>
                            )}
                          </div>
                        </div>

                        {/* PRODUÇÃO */}
                        <div className="p-2.5 rounded-lg bg-zinc-50/50 border border-zinc-100 space-y-1.5">
                          <span className="font-bold text-zinc-950 flex items-center gap-1.5 text-[11px]">
                            <Flame className="h-3.5 w-3.5 text-zinc-600" />
                            Produção / Reatores
                          </span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-zinc-700">
                              {lote?.dataProducao ? `Data: ${formatDateOnly(lote.dataProducao)}` : 'Aguardando agendamento'}
                            </span>
                            {lote?.dataProducao && (
                              <button
                                type="button"
                                onClick={() => {
                                  const dateIso = parseLoteDateToIso(lote.dataProducao);
                                  if (dateIso) setProducaoSelectedDate(dateIso);
                                  setCurrentTab('quadro_producao');
                                  setShowLocalizarDataModal(false);
                                }}
                                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-[11px] md:text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                              >
                                Ir para Produção
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Rodapé */}
</div>
</Drawer>
  );
}
