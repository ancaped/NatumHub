import React from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { Download, Printer, Calendar, Search, X, RefreshCw } from 'lucide-react';
import { formatDateOnly } from '../lib/datas';
import { cn } from '../../../geral/lib/utils';
import { rotuloLote } from '../lib/lotes';

export interface RelatorioEnvaseModalProps {
  handleExportRelatorioEnvaseExcel: () => void;
  handlePrintRelatorioEnvase: () => void;
  handleSetRelatorioPeriod: (type: 'hoje' | 'amanha' | 'semana' | '7dias' | 'mes') => void;
  loadingRelatorioEnvase: boolean;
  relatorioAgrupamento: 'linha' | 'tabela' | 'produto';
  relatorioConsolidadoPorProduto: { productCode: string; productDescription: string; categoriaEnvase: string; totalUn: number; totalKg: number; lotes: string[]; linhas: Set<string>; }[];
  relatorioDataFim: string;
  relatorioDataInicio: string;
  relatorioEnvaseItems: { id: string | number; loteNumber: string; productCode: string; productDescription: string; dataProgramada: string; dataProgramadaFmt: string; diaSemana: string; linha: string; ordem: number; quantity: number; quantityKg: number; categoriaEnvase: string; cor: string; statusEnvase: string; observacoes: string; origem: 'programado' | 'liberado'; }[];
  relatorioIncluirLiberados: boolean;
  relatorioLinhaFilter: 'TODAS' | 'Linha 1' | 'Linha 2' | 'Linha 3';
  relatorioLinhasGroups: { groups: { id: string; title: string; shortTitle: string; color: string; items: { id: string | number; loteNumber: string; productCode: string; productDescription: string; dataProgramada: string; dataProgramadaFmt: string; diaSemana: string; linha: string; ordem: number; quantity: number; quantityKg: number; categoriaEnvase: string; cor: string; statusEnvase: string; observacoes: string; origem: 'programado' | 'liberado'; }[]; totalUn: number; totalKg: number; }[]; liberados: { id: string; title: string; shortTitle: string; color: string; items: { id: string | number; loteNumber: string; productCode: string; productDescription: string; dataProgramada: string; dataProgramadaFmt: string; diaSemana: string; linha: string; ordem: number; quantity: number; quantityKg: number; categoriaEnvase: string; cor: string; statusEnvase: string; observacoes: string; origem: 'programado' | 'liberado'; }[]; totalUn: number; totalKg: number; }; };
  relatorioSearch: string;
  relatorioStatusFilter: 'TODOS' | 'PROGRAMADO' | 'EM_ENVASE' | 'EM_ESPERA' | 'CONCLUIDO';
  relatorioTotals: { totalCount: number; totalUn: number; totalKg: number; linha1Count: number; linha1Un: number; linha1Kg: number; linha2Count: number; linha2Un: number; linha2Kg: number; linha3Count: number; linha3Un: number; linha3Kg: number; liberadosCount: number; liberadosUn: number; liberadosKg: number; };
  setRelatorioAgrupamento: React.Dispatch<React.SetStateAction<'linha' | 'tabela' | 'produto'>>;
  setRelatorioDataFim: React.Dispatch<React.SetStateAction<string>>;
  setRelatorioDataInicio: React.Dispatch<React.SetStateAction<string>>;
  setRelatorioIncluirLiberados: React.Dispatch<React.SetStateAction<boolean>>;
  setRelatorioLinhaFilter: React.Dispatch<React.SetStateAction<'TODAS' | 'Linha 1' | 'Linha 2' | 'Linha 3'>>;
  setRelatorioSearch: React.Dispatch<React.SetStateAction<string>>;
  setRelatorioStatusFilter: React.Dispatch<React.SetStateAction<'TODOS' | 'PROGRAMADO' | 'EM_ENVASE' | 'EM_ESPERA' | 'CONCLUIDO'>>;
  setShowRelatorioEnvaseModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function RelatorioEnvaseModal({ handleExportRelatorioEnvaseExcel, handlePrintRelatorioEnvase, handleSetRelatorioPeriod, loadingRelatorioEnvase, relatorioAgrupamento, relatorioConsolidadoPorProduto, relatorioDataFim, relatorioDataInicio, relatorioEnvaseItems, relatorioIncluirLiberados, relatorioLinhaFilter, relatorioLinhasGroups, relatorioSearch, relatorioStatusFilter, relatorioTotals, setRelatorioAgrupamento, setRelatorioDataFim, setRelatorioDataInicio, setRelatorioIncluirLiberados, setRelatorioLinhaFilter, setRelatorioSearch, setRelatorioStatusFilter, setShowRelatorioEnvaseModal }: RelatorioEnvaseModalProps) {
  return (
<Drawer size="full" onClose={() => setShowRelatorioEnvaseModal(false)}
  title={<span className="block whitespace-normal">Relatório de Programação de Envase</span>}
  badge={<span className="text-[11px] font-mono font-bold bg-zinc-900 px-2 py-0.5 rounded-full text-white">{relatorioTotals.totalCount} {relatorioTotals.totalCount === 1 ? 'item' : 'itens'}</span>}
  subtitle={<span className="block whitespace-normal font-sans">Filtre o período personalizado para conferência, impressão em folha A4 ou exportação para Excel.</span>}
  footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowRelatorioEnvaseModal(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 bg-zinc-200/80 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer"
              >
                Fechar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportRelatorioEnvaseExcel}
                  disabled={relatorioEnvaseItems.length === 0}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Exportar dados do relatório para arquivo Excel (.xlsx)"
                >
                  <Download className="h-4 w-4" />
                  <span>Exportar Excel</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintRelatorioEnvase}
                  disabled={relatorioEnvaseItems.length === 0}
                  className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Abrir prévia de impressão e imprimir em folha A4"
                >
                  <Printer className="h-4 w-4" />
                  <span>Imprimir Relatório</span>
                </button>
              </div>
            </div>
}>

            {/* Modal Body / Scrollable Area */}
            <div className="space-y-4 min-w-0">
              {/* Barra de Filtros e Período */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
                {/* Linha 1: Seletores de Data e Atalhos */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-zinc-600" />
                      <span>Período Personalizado:</span>
                    </span>

                    {/* Atalhos Rápidos de Período */}
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-[11px] text-zinc-600 font-semibold mr-1">Atalhos:</span>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('hoje')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Hoje
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('amanha')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Amanhã
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('semana')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Esta Semana
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('7dias')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Próx. 7 Dias
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('mes')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Este Mês
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        De (Data Inicial):
                      </label>
                      <input
                        type="date"
                        value={relatorioDataInicio}
                        onChange={e => setRelatorioDataInicio(e.target.value)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        Até (Data Final):
                      </label>
                      <input
                        type="date"
                        value={relatorioDataFim}
                        onChange={e => setRelatorioDataFim(e.target.value)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        Linha de Envase:
                      </label>
                      <select
                        value={relatorioLinhaFilter}
                        onChange={e => setRelatorioLinhaFilter(e.target.value as any)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      >
                        <option value="TODAS">Todas as Linhas</option>
                        <option value="Linha 1">Linha 1</option>
                        <option value="Linha 2">Linha 2</option>
                        <option value="Linha 3">Linha 3 (Óleos)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        Status do Lote:
                      </label>
                      <select
                        value={relatorioStatusFilter}
                        onChange={e => setRelatorioStatusFilter(e.target.value as any)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      >
                        <option value="TODOS">Todos os Status</option>
                        <option value="PROGRAMADO">📅 Apenas Programados</option>
                        <option value="EM_ENVASE">⚡ Em Envase</option>
                        <option value="EM_ESPERA">⏸️ Em Espera</option>
                        <option value="CONCLUIDO">✅ Concluídos</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        Modo de Exibição:
                      </label>
                      <select
                        value={relatorioAgrupamento}
                        onChange={e => setRelatorioAgrupamento(e.target.value as any)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      >
                        <option value="linha">Quadro por Linha (Compacto - Linhas 1, 2 e 3)</option>
                        <option value="tabela">Tabela Geral Detalhada</option>
                        <option value="produto">Consolidado por Produto (SKU)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Linha 2: Busca e Checkbox */}
                <div className="pt-2 border-t border-zinc-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Filtrar por lote, código SKU, descrição ou observação..."
                      value={relatorioSearch}
                      onChange={e => setRelatorioSearch(e.target.value)}
                      className="w-full bg-white border border-zinc-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                    {relatorioSearch && (
                      <button
                        type="button"
                        onClick={() => setRelatorioSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={relatorioIncluirLiberados}
                      onChange={e => setRelatorioIncluirLiberados(e.target.checked)}
                      className="rounded text-zinc-600 focus:ring-zinc-400 h-4 w-4 cursor-pointer"
                    />
                    <span>Incluir lotes liberados aguardando esteira</span>
                  </label>
                </div>
              </div>

              {/* Indicadores Resumo (KPIs) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide block">
                    Total de Lotes
                  </span>
                  <div className="text-xl font-mono font-extrabold text-zinc-900 mt-0.5">
                    {relatorioTotals.totalCount} <span className="text-xs font-normal text-zinc-500">lotes</span>
                  </div>
                </div>

                <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs">
                  <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-wide block">
                    Volume a Envasar
                  </span>
                  <div className="text-xl font-mono font-extrabold text-zinc-700 mt-0.5">
                    {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} <span className="text-xs font-normal text-zinc-500">un</span>
                  </div>
                </div>

                <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs">
                  <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide block">
                    Peso Total
                  </span>
                  <div className="text-xl font-mono font-extrabold text-emerald-700 mt-0.5">
                    {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} <span className="text-xs font-normal text-emerald-500">kg</span>
                  </div>
                </div>

                <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs flex flex-col justify-center text-xs">
                  <span className="text-[11px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-wide block mb-1">
                    Divisão por Linhas
                  </span>
                  <div className="space-y-0.5 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-zinc-700 font-bold">L1:</span>
                      <span>{relatorioTotals.linha1Count} lotes ({Number(relatorioTotals.linha1Un).toLocaleString('pt-BR')} un)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-700 font-bold">L2:</span>
                      <span>{relatorioTotals.linha2Count} lotes ({Number(relatorioTotals.linha2Un).toLocaleString('pt-BR')} un)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-700 font-bold">L3:</span>
                      <span>{relatorioTotals.linha3Count} lotes ({Number(relatorioTotals.linha3Un).toLocaleString('pt-BR')} un)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabela de Prévia em Tela */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                <div className="bg-zinc-100 px-4 py-2.5 border-b border-zinc-200 flex items-center justify-between text-xs font-bold text-zinc-800">
                  <span>Prévia dos Dados a Envasar ({relatorioEnvaseItems.length} registros)</span>
                  <span className="text-zinc-500 font-normal">
                    {formatDateOnly(relatorioDataInicio)} a {formatDateOnly(relatorioDataFim)}
                  </span>
                </div>

                <div className="max-h-[380px] overflow-y-auto">
                  {loadingRelatorioEnvase ? (
                    <div className="py-14 text-center text-zinc-400">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                      <p className="text-xs font-semibold">Carregando programação completa de envase...</p>
                    </div>
                  ) : relatorioEnvaseItems.length === 0 ? (
                    <div className="py-14 text-center text-zinc-400">
                      <Calendar className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                      <p className="text-xs font-bold text-zinc-700">Nenhum lote programado para o período selecionado</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Altere as datas ou selecione outro filtro para visualizar os produtos.
                      </p>
                    </div>
                  ) : relatorioAgrupamento === 'linha' ? (
                    /* QUADRO POR LINHA COMPACTO (Como no Quadro de Envase) */
                    <div className="p-3 bg-zinc-100/60 min-h-[300px] space-y-3">
                      <div className={cn(
                        "grid gap-3 items-start",
                        relatorioLinhasGroups.groups.length === 1 ? "grid-cols-1" :
                        relatorioLinhasGroups.groups.length === 2 ? "grid-cols-1 md:grid-cols-2" :
                        "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                      )}>
                        {relatorioLinhasGroups.groups.map(group => (
                          <div key={group.id} className="bg-white border border-zinc-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
                            {/* Header da Linha */}
                            <div className="px-3 py-2 bg-zinc-900 text-white flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-extrabold text-xs tracking-tight truncate">{group.title}</span>
                                <span className="px-1.5 py-0.2 rounded-full text-[11px] md:text-[10px] font-mono font-bold bg-white/20 text-white shrink-0">
                                  {group.items.length}
                                </span>
                              </div>
                              <span className="font-mono text-[11px] font-bold text-zinc-300 shrink-0">
                                {Number(group.totalUn).toLocaleString('pt-BR')} un
                              </span>
                            </div>

                            {/* Cards da Linha */}
                            <div className="p-2 space-y-1.5 bg-zinc-50/50 flex-1 max-h-[380px] overflow-y-auto">
                              {group.items.length === 0 ? (
                                <div className="py-8 text-center text-zinc-400 text-xs italic">
                                  Nenhum lote programado nesta linha
                                </div>
                              ) : (
                                group.items.map((it, idx) => (
                                  <div
                                    key={it.id || idx}
                                    className={cn(
                                      "p-2 rounded-lg border bg-white shadow-2xs text-xs space-y-1 transition-all",
                                      it.statusEnvase === 'EM_ENVASE' ? "border-zinc-300 ring-1 ring-zinc-200 bg-zinc-50/20" :
                                      it.statusEnvase === 'EM_ESPERA' ? "border-amber-300 bg-amber-50/30" :
                                      it.statusEnvase === 'CONCLUIDO' ? "border-emerald-200 bg-emerald-50/15" :
                                      "border-zinc-200"
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-1 text-[11px]">
                                      <div className="flex items-center gap-1.5 font-mono">
                                        <span className="font-extrabold px-1.5 py-0.2 rounded bg-zinc-900 text-white text-[11px] md:text-[10px]">
                                          {it.ordem > 0 && it.ordem < 999 ? `${it.ordem}º` : '—'}
                                        </span>
                                        <span className="font-bold text-zinc-900">{rotuloLote(it.loteNumber)}</span>
                                      </div>
                                      <div className="flex items-center gap-1 font-mono text-[11px] md:text-[10px] text-zinc-500">
                                        <span>{it.productCode}</span>
                                        {relatorioDataInicio !== relatorioDataFim && (
                                          <span className="px-1 py-0.2 bg-zinc-100 rounded text-zinc-700 font-semibold">{it.dataProgramadaFmt}</span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="font-bold text-zinc-900 text-xs line-clamp-1 leading-snug">
                                      {it.productDescription}
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-100 font-mono">
                                      <div>
                                        <strong className="text-zinc-700">{Number(it.quantity).toLocaleString('pt-BR')} un</strong>
                                        {it.quantityKg > 0 && (
                                          <span className="text-zinc-500 text-[11px] md:text-[10px] ml-1">({Number(it.quantityKg).toLocaleString('pt-BR')} kg)</span>
                                        )}
                                      </div>
                                      <div className="text-[11px] md:text-[10px] font-sans font-semibold">
                                        {it.statusEnvase === 'EM_ENVASE' && <span className="text-zinc-700">⚡ Em Envase</span>}
                                        {it.statusEnvase === 'EM_ESPERA' && (
                                          <span className="text-amber-700 truncate max-w-[120px]" title={it.observacoes}>
                                            ⏸️ {it.observacoes ? it.observacoes.slice(0, 16) : 'Espera'}
                                          </span>
                                        )}
                                        {it.statusEnvase === 'CONCLUIDO' && <span className="text-emerald-700">✅ Concluído</span>}
                                        {it.statusEnvase === 'PROGRAMADO' && <span className="text-zinc-500">Programado</span>}
                                        {it.statusEnvase === 'LIBERADO' && <span className="text-zinc-700">Liberado</span>}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Lotes liberados aguardando esteira */}
                      {relatorioIncluirLiberados && relatorioLinhasGroups.liberados.items.length > 0 && (
                        <div className="bg-white border border-zinc-200 rounded-xl p-3 shadow-xs">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-extrabold text-zinc-900">
                              Lotes Liberados Aguardando Linha ({relatorioLinhasGroups.liberados.items.length})
                            </span>
                            <span className="text-xs font-mono font-bold text-zinc-700">
                              {Number(relatorioLinhasGroups.liberados.totalUn).toLocaleString('pt-BR')} un
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {relatorioLinhasGroups.liberados.items.map((it, idx) => (
                              <div key={it.id || idx} className="p-2 border border-zinc-200 rounded-lg text-xs bg-zinc-50/50 space-y-0.5">
                                <div className="flex justify-between font-mono font-bold text-[11px]">
                                  <span>{rotuloLote(it.loteNumber)}</span>
                                  <span className="text-zinc-500">{it.productCode}</span>
                                </div>
                                <div className="font-semibold text-zinc-800 truncate text-[11px]">{it.productDescription}</div>
                                <div className="flex justify-between text-[11px] md:text-[10px] font-mono text-zinc-800">
                                  <strong>{Number(it.quantity).toLocaleString('pt-BR')} un</strong>
                                  <span>{Number(it.quantityKg).toLocaleString('pt-BR')} kg</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : relatorioAgrupamento === 'produto' ? (
                    /* Visualização Consolidada por SKU */
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold uppercase text-[11px] md:text-[10px] tracking-wider sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Cód. SKU</th>
                          <th className="py-2 px-3">Descrição do Produto</th>
                          <th className="py-2 px-3">Categoria</th>
                          <th className="py-2 px-3 text-right">Qtd Total (UN)</th>
                          <th className="py-2 px-3 text-right">Peso Total (KG)</th>
                          <th className="py-2 px-3">Lotes Associados</th>
                          <th className="py-2 px-3">Linhas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {relatorioConsolidadoPorProduto.map(prod => (
                          <tr key={`${prod.productCode}_${prod.productDescription}`} className="hover:bg-zinc-50/80">
                            <td className="py-2 px-3 font-mono font-bold text-zinc-900">{prod.productCode || '—'}</td>
                            <td className="py-2 px-3 font-semibold text-zinc-800">{prod.productDescription}</td>
                            <td className="py-2 px-3 text-zinc-600">{prod.categoriaEnvase}</td>
                            <td className="py-2 px-3 font-mono font-extrabold text-zinc-700 text-right">
                              {Number(prod.totalUn).toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-2 px-3 font-mono text-zinc-700 text-right">
                              {Number(prod.totalKg).toLocaleString('pt-BR')} kg
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-zinc-600">
                              {prod.lotes.map(l => `#${l}`).join(', ')}
                            </td>
                            <td className="py-2 px-3 text-[11px] text-zinc-600">
                              {Array.from(prod.linhas).join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-zinc-100 border-t border-zinc-200 font-bold text-xs sticky bottom-0">
                        <tr>
                          <td colSpan={3} className="py-2 px-3 text-zinc-800 font-extrabold">TOTAL GERAL CONSOLIDADO:</td>
                          <td className="py-2 px-3 text-right font-mono font-black text-zinc-800">
                            {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-zinc-800">
                            {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg
                          </td>
                          <td colSpan={2} className="py-2 px-3 text-zinc-500 font-normal">
                            {relatorioConsolidadoPorProduto.length} produtos diferentes
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    /* Visualização Detalhada em Tabela */
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold uppercase text-[11px] md:text-[10px] tracking-wider sticky top-0">
                        <tr>
                          <th className="py-2 px-2.5">Data</th>
                          <th className="py-2 px-2.5">Linha</th>
                          <th className="py-2 px-1.5 text-center">Ord</th>
                          <th className="py-2 px-2.5">Lote</th>
                          <th className="py-2 px-2">SKU</th>
                          <th className="py-2 px-3">Produto</th>
                          <th className="py-2 px-2.5">Cat / Cor</th>
                          <th className="py-2 px-2.5 text-right">Qtd (UN)</th>
                          <th className="py-2 px-2.5 text-right">Peso (KG)</th>
                          <th className="py-2 px-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {relatorioEnvaseItems.map((it, idx) => (
                          <tr key={`${it.id}_${idx}`} className="hover:bg-zinc-50/80">
                            <td className="py-2 px-2.5 font-mono text-zinc-700 whitespace-nowrap">
                              {it.dataProgramadaFmt} <span className="text-[11px] md:text-[10px] text-zinc-400">({it.diaSemana})</span>
                            </td>
                            <td className="py-2 px-2.5 font-bold text-zinc-800 whitespace-nowrap">
                              {it.linha}
                            </td>
                            <td className="py-2 px-1.5 font-mono font-bold text-center text-zinc-600">
                              {it.ordem > 0 && it.ordem < 999 ? `${it.ordem}º` : '—'}
                            </td>
                            <td className="py-2 px-2.5 font-mono font-extrabold text-zinc-900 whitespace-nowrap">
                              {rotuloLote(it.loteNumber)}
                            </td>
                            <td className="py-2 px-2 font-mono text-zinc-500 whitespace-nowrap">
                              {it.productCode}
                            </td>
                            <td className="py-2 px-3 font-semibold text-zinc-900 line-clamp-1 max-w-[240px]">
                              {it.productDescription}
                            </td>
                            <td className="py-2 px-2.5 text-zinc-600 text-[11px] whitespace-nowrap">
                              {it.categoriaEnvase} • {it.cor}
                            </td>
                            <td className="py-2 px-2.5 font-mono font-extrabold text-zinc-700 text-right whitespace-nowrap">
                              {Number(it.quantity).toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-2 px-2.5 font-mono text-zinc-700 text-right whitespace-nowrap">
                              {Number(it.quantityKg).toLocaleString('pt-BR')} kg
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[11px] md:text-[10px] font-bold font-mono",
                                it.statusEnvase === 'CONCLUIDO' ? "bg-emerald-100 text-emerald-800" :
                                it.statusEnvase === 'EM_ENVASE' ? "bg-amber-100 text-amber-800" :
                                it.statusEnvase === 'EM_ESPERA' ? "bg-red-100 text-red-800" :
                                "bg-zinc-100 text-zinc-700"
                              )}>
                                {it.statusEnvase}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-zinc-100 border-t border-zinc-200 font-bold text-xs sticky bottom-0">
                        <tr>
                          <td colSpan={7} className="py-2 px-3 text-zinc-800 font-extrabold">
                            TOTAL GERAL ({relatorioTotals.totalCount} lotes):
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-black text-zinc-800 whitespace-nowrap">
                            {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-black text-zinc-800 whitespace-nowrap">
                            {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
</Drawer>
  );
}
