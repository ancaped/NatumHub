import React from 'react';
import { ReportHeader, BotaoAcao, ReportTabs, StatusBadge } from '../../../geral/components/ui/ReportKit';
import { Plus, Tag, Package, SlidersHorizontal, RefreshCw, Search, X, Building2, AlertTriangle, Check, Calendar, CalendarPlus, Clock, Play, PauseCircle, History, Pencil, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import TerceirizadosSolicitacoesPainel from '../TerceirizadosSolicitacoesPainel';
import { cn } from '../../../geral/lib/utils';
import { ColumnFilterHeader } from '../lib/ColumnFilterHeader';
import { loteRowKey, formatarUnidadesLote, getEffectiveStatus, isLoteConcluido, getPrevisaoBadge } from '../lib/lotes';
import { formatDateOnly, formatDateShort } from '../lib/datas';
import type { AcompanhamentoLote, TerceirizadoSolicitacao, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface LotesTerceirizadosTabProps {
  baseTabLotes: AcompanhamentoLote[];
  batchStatusValue: string;
  currentPage: number;
  currentTab: 'lotes' | 'terceirizados';
  editingPrevisaoLote: string;
  fetchKitOrders: () => Promise<void>;
  fetchLotes: () => Promise<void>;
  fetchSolicitacoes: () => Promise<void>;
  getBadgeClass: (status: string | null | undefined) => 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold' | 'bg-zinc-100 text-zinc-800 border-zinc-300 font-semibold' | 'bg-amber-50 text-amber-700 border-amber-200 font-semibold' | 'bg-zinc-100 text-zinc-700 border-zinc-200';
  getErpBadgeClass: (erpCode: string) => 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold' | 'bg-zinc-100 text-zinc-800 border-zinc-300 font-semibold' | 'bg-zinc-50 text-zinc-600 border-zinc-200';
  handleApplyBatchStatus: (statusValue: string, motivoOverride?: string | null, resetConfirmado?: boolean, motivoReset?: string) => Promise<void>;
  handleBatchMoveToTerceirizados: () => Promise<void>;
  handleClearAllLotesFilters: () => void;
  handleLotesColumnFilterChange: (columnKey: string, selected: Set<string> | undefined) => void;
  handleMoveLoteNextDay: (lote: AcompanhamentoLote, targetDateOverride?: string) => Promise<void>;
  handleOpenEditTerceirizado: (lote: AcompanhamentoLote) => void;
  handleOpenEditTimestamps: (lote: AcompanhamentoLote) => void;
  handleOpenHistory: (lote: AcompanhamentoLote) => Promise<void>;
  handleOpenPauseModal: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => void;
  handleResumeLote: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  handleSavePrevisao: (loteNumber: string, dateStr: string | null) => Promise<void>;
  handleSelectStatusChange: (loteNumber: string, newStatus: string) => Promise<void>;
  handleSort: (field: keyof AcompanhamentoLote) => void;
  insumosFaltantesList: { codigo: string; descricao: string; count: number; }[];
  isBatchUpdating: boolean;
  loading: boolean;
  loadingKits: boolean;
  loadingSolicitacoes: boolean;
  lotes: AcompanhamentoLote[];
  lotesCaldeira: AcompanhamentoLote[];
  lotesColumnFilters: Record<string, Set<string>>;
  lotesColumnOptions: Record<string, { value: string; label: string; count: number; }[]>;
  lotesPesando: AcompanhamentoLote[];
  multiProductLoteNumbers: Set<string>;
  novaSolicitacaoAberta: boolean;
  pageSize: number;
  paginatedLotes: AcompanhamentoLote[];
  pesagemOrderOverrides: string[];
  producaoOrderOverrides: string[];
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  recentlyUpdatedLotes: Record<string, { status: string; timestamp: number; }>;
  renderFiscoQuimicaBadge: (_loteNumber?: string | null) => any;
  renderLoteNumberBadge: (loteNum: string) => React.JSX.Element;
  savingLote: string;
  savingPrevisao: boolean;
  search: string;
  selectedInsumoFaltanteFilter: string;
  selectedLotes: Set<string>;
  setBatchStatusValue: React.Dispatch<React.SetStateAction<string>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setEditingPrevisaoLote: React.Dispatch<React.SetStateAction<string>>;
  setNovaSolicitacaoAberta: React.Dispatch<React.SetStateAction<boolean>>;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  setSelectedInsumoFaltanteFilter: React.Dispatch<React.SetStateAction<string>>;
  setSelectedLotes: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTempPrevisaoVal: React.Dispatch<React.SetStateAction<string>>;
  setTerceirizadosSubTab: React.Dispatch<React.SetStateAction<'solicitados' | 'acompanhamento'>>;
  setTirarEsperaLote: React.Dispatch<React.SetStateAction<string>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
  solicitacoes: TerceirizadoSolicitacao[];
  sortedLotes: AcompanhamentoLote[];
  sortedLotesEmFabricacao: AcompanhamentoLote[];
  sortField: keyof AcompanhamentoLote;
  sortOrder: 'asc' | 'desc';
  tempPrevisaoVal: string;
  terceirizadosSubTab: 'solicitados' | 'acompanhamento';
  toggleSelectAll: () => void;
  toggleSelectLote: (loteNumber: string) => void;
  totalPages: number;
}

export default function LotesTerceirizadosTab({ baseTabLotes, batchStatusValue, currentPage, currentTab, editingPrevisaoLote, fetchKitOrders, fetchLotes, fetchSolicitacoes, getBadgeClass, getErpBadgeClass, handleApplyBatchStatus, handleBatchMoveToTerceirizados, handleClearAllLotesFilters, handleLotesColumnFilterChange, handleMoveLoteNextDay, handleOpenEditTerceirizado, handleOpenEditTimestamps, handleOpenHistory, handleOpenPauseModal, handleResumeLote, handleSavePrevisao, handleSelectStatusChange, handleSort, insumosFaltantesList, isBatchUpdating, loading, loadingKits, loadingSolicitacoes, lotes, lotesCaldeira, lotesColumnFilters, lotesColumnOptions, lotesPesando, multiProductLoteNumbers, novaSolicitacaoAberta, pageSize, paginatedLotes, pesagemOrderOverrides, producaoOrderOverrides, programacaoEnvase, programacaoRotulagem, recentlyUpdatedLotes, renderFiscoQuimicaBadge, renderLoteNumberBadge, savingLote, savingPrevisao, search, selectedInsumoFaltanteFilter, selectedLotes, setBatchStatusValue, setCurrentPage, setEditingPrevisaoLote, setNovaSolicitacaoAberta, setPageSize, setSearch, setSelectedInsumoFaltanteFilter, setSelectedLotes, setTempPrevisaoVal, setTerceirizadosSubTab, setTirarEsperaLote, showToast, solicitacoes, sortedLotes, sortedLotesEmFabricacao, sortField, sortOrder, tempPrevisaoVal, terceirizadosSubTab, toggleSelectAll, toggleSelectLote, totalPages }: LotesTerceirizadosTabProps) {
  return (
<div className="space-y-3">
          {/* Terceirizados: cabeçalho e sub-abas no padrão do ReportKit */}
          {currentTab === 'terceirizados' && (
            <>
              <ReportHeader
                titulo="Terceirizados"
                subtitulo={`${solicitacoes.length} solicitações · ${baseTabLotes.length} lotes`}
                acoes={
                  <BotaoAcao
                    primario
                    onClick={() => { setTerceirizadosSubTab('solicitados'); setNovaSolicitacaoAberta(true); }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Nova Solicitação
                  </BotaoAcao>
                }
              />
              <ReportTabs
                ativa={terceirizadosSubTab}
                onChange={(id) => {
                  setTerceirizadosSubTab(id as 'solicitados' | 'acompanhamento');
                  if (id === 'solicitados') fetchSolicitacoes();
                }}
                abas={[
                  {
                    id: 'solicitados',
                    label: 'Solicitações & Aguardando Lote ERP',
                    icone: <Tag className="h-3.5 w-3.5" />,
                    contagem: solicitacoes.filter(s => s.status === 'SOLICITADO').length || undefined,
                  },
                  {
                    id: 'acompanhamento',
                    label: 'Lotes Terceirizados em Produção',
                    icone: <Package className="h-3.5 w-3.5" />,
                    contagem: baseTabLotes.length,
                  },
                ]}
              />
            </>
          )}

          {currentTab === 'terceirizados' && terceirizadosSubTab === 'solicitados' ? (
            <TerceirizadosSolicitacoesPainel
              solicitacoes={solicitacoes}
              loading={loadingSolicitacoes}
              recarregar={fetchSolicitacoes}
              lotes={lotes}
              aoMudarLotes={fetchLotes}
              irParaLote={(lote) => { setTerceirizadosSubTab('acompanhamento'); setSearch(lote); }}
              avisar={showToast}
              novaAberta={novaSolicitacaoAberta}
              setNovaAberta={setNovaSolicitacaoAberta}
            />
          ) : (
            <>
              {/* BARRA SUPERIOR DE FILTROS LIMPA (FILTROS POR COLUNA ATIVOS) */}
              <div className="bg-white border border-zinc-200 p-3 rounded-lg shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-600">
                      Exibindo <strong>{sortedLotes.length}</strong> de <strong>{baseTabLotes.length}</strong> lotes {currentTab === 'terceirizados' ? 'terceirizados' : 'internos'}
                    </span>
                    {Object.keys(lotesColumnFilters).length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-zinc-100 text-zinc-800 border border-zinc-200">
                        <SlidersHorizontal className="h-3 w-3" />
                        {Object.keys(lotesColumnFilters).length} coluna(s) com filtro
                      </span>
                    )}
                    {(Object.keys(lotesColumnFilters).length > 0 || search) && (
                      <button
                        type="button"
                        onClick={handleClearAllLotesFilters}
                        className="text-xs text-red-600 hover:text-red-800 underline font-medium cursor-pointer ml-1"
                      >
                        Limpar todos os filtros
                      </button>
                    )}
                  </div>

                  {/* Filtro de Insumo Faltante */}
                    {insumosFaltantesList.length > 0 && (
                      <div className="flex items-center gap-1">
                        <select
                          value={selectedInsumoFaltanteFilter}
                          onChange={(e) => setSelectedInsumoFaltanteFilter(e.target.value)}
                          className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                          title="Filtrar por Insumo Faltante"
                        >
                          <option value="TODOS">⚠️ Todos Insumos Faltantes ({insumosFaltantesList.reduce((s, i) => s + (i?.count || 0), 0)} OPs)</option>
                          {insumosFaltantesList.filter(i => i && i.codigo).map(i => (
                            <option key={i.codigo} value={i.codigo}>
                              [{i.codigo}] {i.descricao} ({i.count} OP{i.count > 1 ? 's' : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { fetchLotes(); fetchKitOrders(); fetchSolicitacoes(); }}
                      disabled={loading || loadingKits || loadingSolicitacoes}
                      className="p-2 border border-zinc-200 rounded-lg hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                      title="Recarregar dados"
                    >
                      <RefreshCw className={cn("h-4 w-4", (loading || loadingKits || loadingSolicitacoes) && "animate-spin")} />
                    </button>
                    {/* Busca de Lotes */}
                  <div className="relative min-w-[240px] max-w-sm flex-1">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={currentTab === 'terceirizados' ? "Buscar terceirizado, código, lote..." : "Buscar lote, código SKU, descrição..."}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-8 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

          {/* BARRA DE AÇÃO EM LOTE PARA SELEÇÃO MÚLTIPLA */}
          {selectedLotes.size > 0 && (
            <div className="bg-zinc-900 text-white px-4 py-2.5 rounded-lg shadow-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-6 h-6 bg-zinc-700 text-white rounded-full text-xs font-bold">
                  {selectedLotes.size}
                </span>
                <span className="text-xs font-semibold text-zinc-200">
                  {selectedLotes.size === 1 ? '1 lote selecionado' : `${selectedLotes.size} lotes selecionados`}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedLotes(new Set())}
                  className="text-xs text-zinc-400 hover:text-white underline transition-colors cursor-pointer ml-1"
                >
                  Desmarcar todos
                </button>
              </div>

              <div className="flex items-center gap-2">
                {currentTab === 'lotes' && (
                  <button
                    type="button"
                    onClick={handleBatchMoveToTerceirizados}
                    disabled={isBatchUpdating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50 mr-1"
                    title="Mover todos os lotes selecionados para Terceirizados"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Mover para Terceirizados</span>
                  </button>
                )}

                <span className="text-xs text-zinc-300 font-medium">Status em lote:</span>
                <select
                  value={batchStatusValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBatchStatusValue(val);
                    if (val) handleApplyBatchStatus(val);
                  }}
                  disabled={isBatchUpdating}
                  className="bg-zinc-800 text-white border border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer"
                >
                  <option value="">Selecione o status...</option>
                  <optgroup label="Pesagem e Produção">
                    <option value="Pesagem">Pesagem</option>
                    <option value="Produzido">Produzido</option>
                    <option value="Liberado para Envase">Liberado para Envase</option>
                  </optgroup>
                  <optgroup label="Embalagem">
                    <option value="Rotulagem">Rotulagem</option>
                    <option value="Envase">Envase</option>
                    <option value="Finalizada">Finalizada</option>
                  </optgroup>
                  <optgroup label="Paralisado">
                    <option value="Em Espera">⏸️ Em Espera...</option>
                  </optgroup>
                  <optgroup label="Redefinir">
                    <option value="__RESET__">Restaurar Padrão (Sem Status)</option>
                  </optgroup>
                </select>
                {isBatchUpdating && (
                  <RefreshCw className="h-4 w-4 animate-spin text-zinc-400" />
                )}
              </div>
            </div>
          )}

          {/* TABELA PLANILHA ESTILO GERENCIAMENTO DE PRODUÇÃO */}
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50/90 border-b border-zinc-200 text-[11px] font-bold text-zinc-600 uppercase tracking-wider select-none">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={sortedLotes.length > 0 && sortedLotes.every(l => selectedLotes.has(l.loteNumber))}
                        ref={el => {
                          if (el) {
                            const someSelected = sortedLotes.some(l => selectedLotes.has(l.loteNumber)) && !sortedLotes.every(l => selectedLotes.has(l.loteNumber));
                            el.indeterminate = someSelected;
                          }
                        }}
                        onChange={toggleSelectAll}
                        className="rounded border-zinc-300 text-zinc-600 focus:ring-zinc-400 cursor-pointer h-4 w-4"
                        title="Selecionar todos os lotes visíveis"
                      />
                    </th>
                    <ColumnFilterHeader
                      columnKey="loteNumber"
                      label="Lote"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.loteNumber || []}
                      selectedValues={lotesColumnFilters.loteNumber}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-32"
                    />
                    <ColumnFilterHeader
                      columnKey="date"
                      label="Data"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.date || []}
                      selectedValues={lotesColumnFilters.date}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-28"
                    />
                    <ColumnFilterHeader
                      columnKey="productCode"
                      label="REF / SKU"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.productCode || []}
                      selectedValues={lotesColumnFilters.productCode}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-28"
                    />
                    <ColumnFilterHeader
                      columnKey="productDescription"
                      label="Produto"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.productDescription || []}
                      selectedValues={lotesColumnFilters.productDescription}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="min-w-[260px]"
                    />
                    <th
                      onClick={() => handleSort('quantity')}
                      className="py-3 px-4 cursor-pointer hover:bg-zinc-100 transition-colors text-right w-36"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Quantidade / Peso</span>
                        {sortField === 'quantity' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                      </div>
                    </th>
                    <ColumnFilterHeader
                      columnKey="erpStatus"
                      label="Status ERP (Contábil)"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.erpStatus || []}
                      selectedValues={lotesColumnFilters.erpStatus}
                      onFilterChange={handleLotesColumnFilterChange}
                      align="center"
                      className="w-40"
                    />
                    <ColumnFilterHeader
                      columnKey="customStatus"
                      label={currentTab === 'terceirizados' ? "Status Fábrica (Nosso)" : "Quadros & Etapas Ativas"}
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.customStatus || []}
                      selectedValues={lotesColumnFilters.customStatus}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-56"
                    />
                    <th className="py-3 px-3 text-left font-bold text-[11px] uppercase tracking-wider text-zinc-600 w-44">
                      Laudo FQ
                    </th>
                    {currentTab === 'terceirizados' && (
                      <th className="py-3 px-4 text-left font-bold text-[11px] uppercase tracking-wider text-zinc-600 w-40">
                        Fornecedor
                      </th>
                    )}
                    <ColumnFilterHeader
                      columnKey="dataPrevisao"
                      label="Previsão"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.dataPrevisao || []}
                      selectedValues={lotesColumnFilters.dataPrevisao}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-40"
                    />
                    <th className="py-3 px-4 text-zinc-500 font-bold min-w-[200px]">
                      Etapas & Datas
                    </th>
                    <th className="py-3 px-3 text-center text-zinc-400 font-medium w-28">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {loading ? (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-zinc-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                        <p className="text-xs font-semibold">Carregando lotes...</p>
                      </td>
                    </tr>
                  ) : sortedLotes.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-zinc-400">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                        <p className="text-sm font-semibold text-zinc-700">Nenhum lote corresponde ao filtro selecionado</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {currentTab === 'terceirizados'
                            ? 'Nenhum lote terceirizado encontrado. Você pode marcar lotes como terceirizados na aba principal.'
                            : 'Clique em "Todos" ou selecione outro status no topo.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedLotes.map((lote) => {
                      const isEa = lote.erpStatus === 'EA';
                      const isFinalizada = lote.customStatus === 'Finalizada';
                      const isEspera = lote.customStatus === 'Em Espera';
                      const isConcluido = isEa || isFinalizada;
                      const isBusy = savingLote === lote.loteNumber;
                      const normalizedCustomStatus = (lote.customStatus === 'Produção' ? 'Produzido' : lote.customStatus) || '';
                      const isJustUpdated = recentlyUpdatedLotes[lote.loteNumber];

                      return (
                        <tr
                          key={loteRowKey(lote)}
                          className={cn(
                            "hover:bg-zinc-50/80 transition-colors",
                            selectedLotes.has(lote.loteNumber) ? "bg-zinc-50/40" : isConcluido ? "bg-zinc-50/40" : isEspera ? "bg-amber-50/20" : "bg-white"
                          )}
                        >
                          {/* Checkbox de Seleção */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedLotes.has(lote.loteNumber)}
                              onChange={() => toggleSelectLote(lote.loteNumber)}
                              className="rounded border-zinc-300 text-zinc-600 focus:ring-zinc-400 cursor-pointer h-4 w-4"
                            />
                          </td>

                          {/* Lote */}
                          <td className="py-2.5 px-4 font-mono font-bold text-xs text-zinc-800 select-all whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {renderLoteNumberBadge(lote.loteNumber)}
                              {multiProductLoteNumbers.has(lote.loteNumber) && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[11px] md:text-[9px] font-bold bg-zinc-50 text-zinc-700 border border-zinc-200"
                                  title="OP Conjunta com múltiplos produtos"
                                >
                                  MULTI
                                </span>
                              )}
                              {lote.isTerceirizado && (
                                <StatusBadge variante="descontinuado" title="Lote Terceirizado">TERC</StatusBadge>
                              )}
                            </div>
                          </td>

                          {/* Data */}
                          <td className="py-2.5 px-4 text-zinc-650 font-medium whitespace-nowrap">
                            {formatDateOnly(lote.date)}
                          </td>

                          {/* REF SKU */}
                          <td className="py-2.5 px-4 font-mono text-zinc-600 font-semibold whitespace-nowrap">
                            {lote.productCode}
                          </td>

                          {/* Produto */}
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-zinc-900 leading-snug">
                              {lote.productDescription}
                            </div>
                          </td>

                          {/* Quantidade (Unidades E Kg do lote completo) */}
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="font-mono font-bold text-xs text-zinc-900">
                              {formatarUnidadesLote(lote, "text-[11px] md:text-[10px] text-zinc-500")}
                            </div>
                            <div className="text-[11px] font-mono text-zinc-500 font-semibold">
                              {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} <span className="text-[11px] md:text-[10px] text-zinc-400">kg total</span>
                            </div>
                          </td>

                          {/* Status ERP */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                              getErpBadgeClass(lote.erpStatus)
                            )}>
                              {isEa ? 'Concluído (EA)' : lote.erpStatusLabel}
                            </span>
                          </td>

                          {/* Quadros & Etapas Ativas */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {currentTab === 'lotes' ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1 max-w-[280px]">
                                  {(() => {
                                    const eff = getEffectiveStatus(lote);
                                    const isOrdensFin = isLoteConcluido(lote);
                                    const isPesando = !isOrdensFin && (lotesPesando.some(p => p.loteNumber === lote.loteNumber) || pesagemOrderOverrides.includes(lote.loteNumber) || eff === 'Pesagem');
                                    const isProducao = !isOrdensFin && (sortedLotesEmFabricacao.some(p => p.loteNumber === lote.loteNumber) || producaoOrderOverrides.includes(lote.loteNumber) || eff === 'Produzido' || eff === 'Produção');
                                    const isCaldeira = !isOrdensFin && (lotesCaldeira.some(c => c.loteNumber === lote.loteNumber));
                                    const isEnvase = !isOrdensFin && (programacaoEnvase.some(e => e.loteNumber === lote.loteNumber) || eff === 'Envase' || eff === 'Liberado para Envase');
                                    const isRotulagem = !isOrdensFin && (programacaoRotulagem.some(r => r.loteNumber === lote.loteNumber) || eff === 'Rotulagem');
                                    const isEspera = !isOrdensFin && !!lote.motivoEspera;

                                    const badges = [];
                                    if (isPesando) badges.push(<span key="pes" className="px-2 py-0.5 rounded-md text-[11px] md:text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">⚖️ Pesagem</span>);
                                    if (isProducao) badges.push(<span key="prod" className="px-2 py-0.5 rounded-md text-[11px] md:text-[10px] font-bold bg-zinc-100 text-zinc-900 border border-zinc-200 shadow-2xs">🧪 Produção</span>);
                                    if (isCaldeira) badges.push(<span key="cald" className="px-2 py-0.5 rounded-md text-[11px] md:text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">🔥 Caldeira</span>);
                                    if (isEnvase) badges.push(<span key="env" className="px-2 py-0.5 rounded-md text-[11px] md:text-[10px] font-bold bg-zinc-100 text-zinc-800 border border-zinc-200 shadow-2xs">📦 Envase</span>);
                                    if (isRotulagem) badges.push(<span key="rot" className="px-2 py-0.5 rounded-md text-[11px] md:text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">🏷️ Rotulagem</span>);
                                    if (isOrdensFin) badges.push(<span key="ord" className="px-2 py-0.5 rounded-md text-[11px] md:text-[10px] font-bold bg-zinc-200 text-zinc-900 border border-zinc-300 shadow-2xs">🏁 Concluído</span>);
                                    if (isEspera) badges.push(<span key="esp" className="px-2 py-0.5 rounded-md text-[11px] md:text-[10px] font-bold bg-red-50 text-red-900 border border-red-200 truncate max-w-[140px] shadow-2xs" title={lote.motivoEspera || ''}>⏸️ {lote.motivoEspera}</span>);

                                    if (badges.length === 0) {
                                      return <span className="text-[11px] text-zinc-400 font-medium italic">Aguardando início</span>;
                                    }
                                    return badges;
                                  })()}
                                </div>
                                {lote.motivoEspera && (
                                  <button
                                    type="button"
                                    onClick={() => setTirarEsperaLote(lote.loteNumber)}
                                    className="inline-flex items-center text-[11px] md:text-[10px] font-bold px-2 py-0.5 rounded-md border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                                    title="Tirar a marca de Em Espera deste lote (mostra a prévia antes de gravar)"
                                  >
                                    Tirar Em Espera
                                  </button>
                                )}
                                {lote.motivoEspera && (
                                  <div
                                    onClick={() => handleOpenPauseModal(lote)}
                                    className="inline-flex items-center gap-1 text-[11px] md:text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 cursor-pointer hover:bg-amber-100 transition-colors line-clamp-1 max-w-[240px]"
                                    title="Clique para editar motivo ou insumo faltante"
                                  >
                                    <span>⏸️</span>
                                    <span className="truncate">{lote.motivoEspera}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={getEffectiveStatus(lote) === 'Sem Status' ? '' : getEffectiveStatus(lote)}
                                  onChange={(e) => handleSelectStatusChange(lote.loteNumber, e.target.value)}
                                  disabled={savingLote === lote.loteNumber}
                                  className={cn(
                                    "text-xs font-bold rounded-lg border px-2.5 py-1.5 focus:outline-none transition-all cursor-pointer shadow-2xs",
                                    getBadgeClass(lote.customStatus),
                                    recentlyUpdatedLotes[lote.loteNumber] && "ring-2 ring-emerald-400 scale-102"
                                  )}
                                >
                                  <option value="">Padrão ({lote.erpStatusLabel || lote.erpStatus || 'Sem Status'})</option>
                                  {currentTab === 'terceirizados' ? (
                                    <optgroup label="Situação no Terceirista">
                                      <option value="Aguardando Insumos">Aguardando Insumos</option>
                                      <option value="Em Fabricação Externa">Em Fabricação Externa</option>
                                      <option value="Enviado para Envase">Enviado para Envase</option>
                                      <option value="Entregue na Fábrica">Entregue na Fábrica</option>
                                      <option value="Finalizada">Finalizado</option>
                                    </optgroup>
                                  ) : (
                                    <>
                                      <optgroup label="Pesagem e Produção">
                                        <option value="Pesagem">Pesagem</option>
                                        <option value="Produzido">Produzido</option>
                                        <option value="Liberado para Envase">Liberado para Envase</option>
                                      </optgroup>
                                      <optgroup label="Embalagem">
                                        <option value="Rotulagem">Rotulagem</option>
                                        <option value="Envase">Envase</option>
                                        <option value="Ordem Parcial">Ordem Parcial</option>
                                        <option value="Ordem Finalizada">Ordem Finalizada</option>
                                      </optgroup>
                                    </>
                                  )}
                                  {lote.customStatus && (
                                    <optgroup label="Redefinir">
                                      <option value="">Restaurar Padrão ERP</option>
                                    </optgroup>
                                  )}
                                </select>
                                {lote.motivoEspera && (
                                  <button
                                    type="button"
                                    onClick={() => setTirarEsperaLote(lote.loteNumber)}
                                    className="inline-flex items-center text-[11px] md:text-[10px] font-bold px-2 py-0.5 rounded-md border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                                    title="Tirar a marca de Em Espera deste lote (mostra a prévia antes de gravar)"
                                  >
                                    Tirar Em Espera
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Laudo Físico-Química */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {renderFiscoQuimicaBadge(lote.loteNumber) || (
                              <span className="text-zinc-400 italic text-[11px]">— Sem laudo</span>
                            )}
                          </td>

                          {currentTab === 'terceirizados' && (
                            <td className="py-2.5 px-4 whitespace-nowrap text-xs font-semibold text-zinc-800">
                              {lote.fornecedorTerceirizado || (lote as any).fornecedor_terceirizado || (
                                <span className="text-zinc-400 italic text-[11px]">— Não definido</span>
                              )}
                            </td>
                          )}

                          {/* Previsão de Produção */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {editingPrevisaoLote === lote.loteNumber ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={tempPrevisaoVal}
                                  onChange={e => setTempPrevisaoVal(e.target.value)}
                                  className="text-xs bg-white border border-zinc-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSavePrevisao(lote.loteNumber, tempPrevisaoVal)}
                                  disabled={savingPrevisao}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                                  title="Salvar previsão"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPrevisaoLote(null)}
                                  className="p-1 text-zinc-400 hover:bg-zinc-100 rounded cursor-pointer"
                                  title="Cancelar"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingPrevisaoLote(lote.loteNumber);
                                  setTempPrevisaoVal(lote.dataPrevisao ? lote.dataPrevisao.split('T')[0] : '');
                                }}
                                className="group cursor-pointer flex items-center gap-1.5"
                                title="Clique para definir ou alterar a previsão de produção"
                              >
                                {(() => {
                                  const badge = getPrevisaoBadge(lote.dataPrevisao);
                                  if (!badge) {
                                    return (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-700 bg-zinc-50 group-hover:bg-zinc-100 px-2 py-1 rounded-lg border border-dashed border-zinc-200 transition-colors">
                                        <Calendar className="h-3 w-3 text-zinc-400 group-hover:text-zinc-600" />
                                        + Definir
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className={cn(
                                      "inline-flex items-center gap-1 text-[11px] md:text-[10px] px-2 py-0.5 rounded-full border shadow-2xs transition-all group-hover:ring-2 group-hover:ring-zinc-300",
                                      badge.colorClass
                                    )}>
                                      <Calendar className="h-2.5 w-2.5" />
                                      {badge.label}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </td>

                          {/* Etapas & Datas Registradas */}
                          <td className="py-2 px-4 text-[11px] md:text-[10px] font-medium text-zinc-600 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              {lote.dataPrevisao && currentTab !== 'terceirizados' && (
                                <div className="flex items-center gap-1 text-zinc-900 font-semibold">
                                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                                  <span className="font-bold">Previsão:</span> {formatDateShort(lote.dataPrevisao)}
                                </div>
                              )}
                              {lote.dataPesagem && (
                                <div className="flex items-center gap-1 text-amber-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  <span className="font-bold">Pesagem:</span> {formatDateShort(lote.dataPesagem)}
                                </div>
                              )}
                              {lote.dataProducao && (
                                <div className="flex items-center gap-1 text-zinc-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                                  <span className="font-bold">Produzido:</span> {formatDateShort(lote.dataProducao)}
                                </div>
                              )}
                              {lote.dataLiberadoEnvase && (
                                <div className="flex items-center gap-1 text-zinc-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                                  <span className="font-bold">Liberado Envase:</span> {formatDateShort(lote.dataLiberadoEnvase)}
                                </div>
                              )}
                              {lote.dataEnvase && (
                                <div className="flex items-center gap-1 text-zinc-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                                  <span className="font-bold">Envase:</span> {formatDateShort(lote.dataEnvase)}
                                </div>
                              )}
                              {lote.dataRotulagem && (
                                <div className="flex items-center gap-1 text-zinc-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" />
                                  <span className="font-bold">Rotulagem:</span> {formatDateShort(lote.dataRotulagem)}
                                </div>
                              )}
                              {lote.dataEmEspera && (
                                <div className="flex items-center gap-1 text-amber-900 font-semibold">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  <span className="font-bold">Espera:</span> {formatDateShort(lote.dataEmEspera)}
                                  {lote.motivoEspera && <span className="opacity-75 text-[11px] md:text-[9px]">({lote.motivoEspera})</span>}
                                </div>
                              )}
                              {lote.dataFinalizada && (
                                <div className="flex items-center gap-1 text-emerald-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  <span className="font-bold">Finalizada:</span> {formatDateShort(lote.dataFinalizada)}
                                </div>
                              )}
                              {!lote.dataPesagem && !lote.dataProducao && !lote.dataLiberadoEnvase && !lote.dataEnvase && !lote.dataRotulagem && !lote.dataEmEspera && !lote.dataFinalizada && (
                                <span className="text-zinc-300 italic">—</span>
                              )}
                            </div>
                          </td>

                          {/* Ações: +1 Dia, Timestamps, Histórico e Terceirizados */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              {currentTab === 'lotes' ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveLoteNextDay(lote)}
                                    className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
                                    title="Adiar lote (selecionar nova data)"
                                  >
                                    <CalendarPlus className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTimestamps(lote)}
                                    className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                    title="Ajustar datas e horários manuais deste lote"
                                  >
                                    <Clock className="h-4 w-4" />
                                  </button>
                                  {lote.motivoEspera ? (
                                    <button
                                      type="button"
                                      onClick={() => handleResumeLote(lote)}
                                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                      title="Lote Pausado. Clique para Retomar."
                                    >
                                      <Play className="h-4 w-4 fill-current" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenPauseModal(lote)}
                                      className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                      title="Pausar este lote"
                                    >
                                      <PauseCircle className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTerceirizado(lote)}
                                    className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
                                    title="Mover este lote para Terceirizados & Definir Fornecedor e Previsão"
                                  >
                                    <Building2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenHistory(lote)}
                                    className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                                    title="Ver histórico de alterações de status e datas"
                                  >
                                    <History className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTerceirizado(lote)}
                                    className="px-2.5 py-1 bg-zinc-50 hover:bg-zinc-50 text-zinc-700 hover:text-zinc-700 border border-zinc-200 hover:border-zinc-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                    title="Editar Fornecedor e Previsão"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                                    <span>Editar</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé da tabela com Paginação Completa e Seletor de Limite */}
            <div className="bg-zinc-50 px-4 py-3 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Exibindo <strong>{paginatedLotes.length}</strong> de <strong>{sortedLotes.length}</strong> lotes {currentTab === 'terceirizados' ? 'terceirizados' : 'internos'}
                  {sortedLotes.length !== baseTabLotes.length && (
                    <span className="text-zinc-400 ml-1">
                      (filtrados de um total de {baseTabLotes.length})
                    </span>
                  )}
                </span>
                <span className="text-zinc-300">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500">Por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="border border-zinc-300 rounded-lg px-2 py-1 bg-white text-xs font-bold text-zinc-800 focus:outline-none cursor-pointer"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={99999}>Todos ({sortedLotes.length})</option>
                  </select>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(1)}
                    className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                    title="Primeira Página"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                    title="Página Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-3 py-1 bg-white border border-zinc-200 rounded-lg font-bold text-zinc-900 text-xs">
                    Página {currentPage} de {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                    title="Próxima Página"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                    title="Última Página"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
        </div>
  );
}
