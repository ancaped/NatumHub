import React, { useState, useMemo } from 'react';
import { 
  Search, RefreshCw, ChevronLeft, ChevronRight, 
  User, AlertTriangle, CheckCircle2, History, X,
  FileSearch, ArrowUpRight
} from 'lucide-react';
import { cn } from '../../../../modules/geral/lib/utils';

const getStatusBadgeClass = (status: string) => {
  switch ((status || '').toUpperCase()) {
    case 'EA':
    case 'FP':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'CF':
      return 'bg-zinc-100 text-zinc-800 border-zinc-200';
    case 'PG':
    case 'PP':
    case 'PR':
    case 'EN':
      return 'bg-amber-50 text-amber-900 border-amber-200';
    case 'CA':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
};

const getStatusLabel = (status: string) => {
  switch ((status || '').toUpperCase()) {
    case 'EA': return 'Estoque Atualizado';
    case 'PG': return 'Em Pesagem';
    case 'PP': return 'Pré-Produção';
    case 'PR': return 'Em Produção';
    case 'EN': return 'Em Envase';
    case 'CF': return 'Conferido';
    case 'CA': return 'Cancelado';
    case 'FP': return 'Finalizado';
    default: return status || '—';
  }
};

interface LotesTabProps {
  lotes: any[];
  onRefresh?: () => void;
  loading?: boolean;
  onOpenDetails?: (loteNumber: string) => void;
  selectedStatus?: string;
  setSelectedStatus?: (status: string) => void;
  viewMode?: 'table' | 'calendar';
  onViewModeChange?: (mode: 'table' | 'calendar') => void;
}

export function LotesTab({
  lotes,
  onRefresh,
  loading,
  onOpenDetails,
  selectedStatus = 'ALL',
  setSelectedStatus,
}: LotesTabProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [ocultarResolvidos, setOcultarResolvidos] = useState(false);
  const limitPerPage = 15;

  const filteredLotes = useMemo(() => {
    return lotes.filter(l => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || (
        (l.loteNumber || '').toLowerCase().includes(q) ||
        (l.productCode || '').toLowerCase().includes(q) ||
        (l.productDescription || '').toLowerCase().includes(q) ||
        (l.fabricatedBy || '').toLowerCase().includes(q)
      );
      
      let matchesStatus = false;
      if (selectedStatus === 'ALL') {
        matchesStatus = true;
      } else if (selectedStatus === 'ERR_YIELD') {
        matchesStatus = l.yieldError === true;
      } else if (selectedStatus === 'ERR_PESAGEM') {
        matchesStatus = l.pesagemError === true;
      } else if (selectedStatus === 'ERR_ENVASE') {
        matchesStatus = l.envaseError === true;
      } else if (selectedStatus === 'ERR_CONFERENCIA') {
        matchesStatus = l.conferenciaError === true;
      } else if (selectedStatus === 'ERR_ANY_ERROR') {
        matchesStatus = l.yieldError === true || l.pesagemError === true || l.envaseError === true || l.conferenciaError === true;
      } else if (selectedStatus === 'RESOLVED') {
        matchesStatus = l.isResolved === true;
      } else {
        matchesStatus = l.status === selectedStatus;
      }

      let matchesResolution = true;
      if (ocultarResolvidos && l.isResolved) {
        matchesResolution = false;
      }

      return matchesSearch && matchesStatus && matchesResolution;
    });
  }, [lotes, search, selectedStatus, ocultarResolvidos]);

  // Contagens para filtros rápidos
  const filterCounts = useMemo(() => {
    let comErros = 0;
    let justificados = 0;
    let ea = 0;
    lotes.forEach(l => {
      if (l.isResolved) justificados++;
      if (l.yieldError || l.pesagemError || l.envaseError || l.conferenciaError) comErros++;
      if (l.status === 'EA') ea++;
    });
    return {
      total: lotes.length,
      comErros,
      justificados,
      ea
    };
  }, [lotes]);

  // Pagination
  const totalItems = filteredLotes.length;
  const totalPages = Math.ceil(totalItems / limitPerPage) || 1;
  const paginatedLotes = useMemo(() => {
    const start = (page - 1) * limitPerPage;
    return filteredLotes.slice(start, start + limitPerPage);
  }, [filteredLotes, page]);

  const handleStatusFilterChange = (status: string) => {
    setSelectedStatus?.(status);
    setPage(1);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header do Módulo de Histórico / Análise */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-900 text-white rounded-xl shadow-2xs shrink-0">
            <History className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-zinc-900 tracking-tight">
                Histórico & Fechamento de Lotes
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-100 text-zinc-800 border border-zinc-200">
                {filterCounts.total} lotes industriais
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Auditoria de formulações, desvios operacionais, rendimentos de produção e justificativa de lotes.
            </p>
          </div>
        </div>

        {/* Botão de atualização rápida */}
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button 
              type="button"
              onClick={onRefresh} 
              disabled={loading}
              className="px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              title="Atualizar lotes"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin text-zinc-900")} />
              <span>Atualizar</span>
            </button>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca em HSL Zinc */}
      <div className="bg-white border border-zinc-200 rounded-xl p-3 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Campo de Busca */}
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Buscar por lote, código SKU, descrição ou operador..." 
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-8 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400 font-medium"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Segmentos Rápidos de Status */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleStatusFilterChange('ALL')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                selectedStatus === 'ALL'
                  ? "bg-zinc-900 text-white border-zinc-900 shadow-2xs"
                  : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
              )}
            >
              Todos ({filterCounts.total})
            </button>

            <button
              type="button"
              onClick={() => handleStatusFilterChange('ERR_ANY_ERROR')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border flex items-center gap-1",
                selectedStatus === 'ERR_ANY_ERROR'
                  ? "bg-rose-900 text-white border-rose-900 shadow-2xs"
                  : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              <span>Com Desvios ({filterCounts.comErros})</span>
            </button>

            <button
              type="button"
              onClick={() => handleStatusFilterChange('RESOLVED')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border flex items-center gap-1",
                selectedStatus === 'RESOLVED'
                  ? "bg-emerald-900 text-white border-emerald-900 shadow-2xs"
                  : "bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50"
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>Justificados ({filterCounts.justificados})</span>
            </button>

            <button
              type="button"
              onClick={() => handleStatusFilterChange('EA')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                selectedStatus === 'EA'
                  ? "bg-zinc-900 text-white border-zinc-900 shadow-2xs"
                  : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
              )}
            >
              Estoque Atualizado ({filterCounts.ea})
            </button>

            <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 border border-zinc-200 rounded-lg px-2.5 py-1 bg-white cursor-pointer select-none hover:bg-zinc-50 transition-colors ml-auto sm:ml-2">
              <input 
                type="checkbox" 
                checked={ocultarResolvidos} 
                onChange={(e) => { setOcultarResolvidos(e.target.checked); setPage(1); }} 
                className="accent-zinc-900 rounded" 
              />
              <span>Ocultar Justificados</span>
            </label>
          </div>
        </div>
      </div>

      {/* Tabela de Lotes em HSL Zinc */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden flex flex-col w-full text-xs">
        {loading ? (
          <div className="py-20 text-center text-zinc-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-zinc-400" />
            <span className="font-semibold text-zinc-600">Carregando lotes industriais...</span>
          </div>
        ) : filteredLotes.length === 0 ? (
          <div className="py-20 text-center text-zinc-400 flex flex-col items-center justify-center gap-2">
            <FileSearch className="h-10 w-10 text-zinc-300 stroke-[1.5]" />
            <p className="font-bold text-zinc-700 text-sm">Nenhum lote industrial encontrado</p>
            <p className="text-xs text-zinc-400 max-w-sm">
              {search ? `Nenhum lote corresponde ao termo de busca "${search}".` : 'Ajuste os filtros acima para visualizar os lotes.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-zinc-50/90 border-b border-zinc-200 select-none">
                <tr className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider">
                  <th className="px-4 py-3 w-28">Nº Lote</th>
                  <th className="px-4 py-3 w-28">Data</th>
                  <th className="px-4 py-3 w-28">REF / SKU</th>
                  <th className="px-4 py-3 min-w-[240px]">Produto</th>
                  <th className="px-4 py-3 w-32 text-right">Quantidade</th>
                  <th className="px-4 py-3 w-36 text-center">Status ERP</th>
                  <th className="px-4 py-3 w-48 text-center">Diagnóstico / Desvios</th>
                  <th className="px-4 py-3 w-40">Operador</th>
                  <th className="px-4 py-3 w-28 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {paginatedLotes.map((l) => {
                  const dateObj = new Date((l.date || '').replace(' ', 'T'));
                  const formattedDate = isNaN(dateObj.getTime()) ? l.date : dateObj.toLocaleDateString('pt-BR');
                  const hasErrors = l.yieldError || l.pesagemError || l.envaseError || l.conferenciaError;

                  return (
                    <tr 
                      key={l.id || l.loteNumber} 
                      onClick={() => onOpenDetails?.(l.loteNumber)}
                      className="hover:bg-zinc-50/70 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3 align-middle font-mono font-extrabold text-zinc-900">
                        <span className="group-hover:text-zinc-600 transition-colors">
                          #{l.loteNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-zinc-600 font-medium">
                        {formattedDate}
                      </td>
                      <td className="px-4 py-3 align-middle font-mono font-bold text-zinc-700">
                        {l.productCode}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="font-bold text-zinc-900 group-hover:text-zinc-700 transition-colors">
                          {l.productDescription || 'Item Não Sincronizado'}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-right font-mono font-bold text-zinc-900">
                        {Number(l.quantity || 0).toLocaleString('pt-BR')} kg
                      </td>
                      <td className="px-4 py-3 align-middle text-center">
                        <span className={cn(
                          "inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                          getStatusBadgeClass(l.status)
                        )}>
                          {getStatusLabel(l.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {l.isResolved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              Desvios Justificados
                            </span>
                          ) : hasErrors ? (
                            <>
                              {l.pesagemError && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200" title="Desvio no peso/insumos de pesagem">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Pesagem
                                </span>
                              )}
                              {l.yieldError && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200" title="Desvio de rendimento esperado">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Rendimento
                                </span>
                              )}
                              {l.envaseError && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-orange-50 text-orange-800 border border-orange-200" title="Desvio no envase">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Envase
                                </span>
                              )}
                              {l.conferenciaError && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200" title="Erro na conferência">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Conf.
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                              Conforme
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-zinc-650 font-medium">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate max-w-[140px]" title={l.fabricatedBy || 'Não informado'}>
                            {l.fabricatedBy || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDetails?.(l.loteNumber);
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold bg-zinc-100 hover:bg-zinc-900 hover:text-white text-zinc-800 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 border border-zinc-200 shadow-2xs group-hover:border-zinc-400"
                          title="Abrir Análise Detalhada deste lote"
                        >
                          <span>Analisar</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodapé de Paginação em HSL Zinc */}
        {filteredLotes.length > 0 && (
          <div className="px-4 py-3 bg-zinc-50/80 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
            <span>
              Exibindo <strong>{(page - 1) * limitPerPage + 1}</strong> a <strong>{Math.min(page * limitPerPage, totalItems)}</strong> de <strong>{totalItems}</strong> lotes industriais
            </span>
            <div className="flex items-center gap-1.5">
              <button 
                type="button"
                className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shadow-2xs transition-colors" 
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                title="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2.5 py-1 font-mono font-bold text-zinc-800 text-xs">
                {page} / {totalPages}
              </span>
              <button 
                type="button"
                className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shadow-2xs transition-colors" 
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                title="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
