import React, { useMemo } from 'react';
import { 
  Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle, 
  AlertTriangle, ChevronLeft, ChevronRight, Edit3, CheckCircle2, PlusCircle,
  CalendarClock, Zap, CheckCircle, Package, Layers, Info
} from 'lucide-react';

interface ProgramadasTabProps {
  products: any[];
  configs: any[];
  bases?: string[];
  activeTab: string;
  handleTabChange: (tabId: string) => void;
  search: string;
  setSearch: (s: string) => void;
  selectedStatus: string;
  setSelectedStatus: (s: string) => void;
  selectedLine?: string;
  setSelectedLine?: (l: string) => void;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  totalItems: number;
  limitPerPage: number;
  diasComerciais: number;
  sortField: string;
  setSortField: (f: string) => void;
  sortDir: 'asc' | 'desc';
  setSortDir: (d: 'asc' | 'desc') => void;
  onEditOverrides: (p: any) => void;
  onRefresh: () => void;
  loading: boolean;
  tabOptions: any[];
  toggleSort: (field: string, currentField: string, setField: any, currentDir: string, setDir: any) => void;
  SortIcon: React.ComponentType<{ field: string; activeField: string; activeDir: string }>;
  onShowDetails: (code: string) => void;
  productionApprovalList?: string[];
  onToggleApprovalList?: (code: string) => void;
}

export function ProgramadasTab({
  products = [],
  configs = [],
  bases = [],
  activeTab,
  handleTabChange,
  search,
  setSearch,
  selectedStatus,
  setSelectedStatus,
  page,
  setPage,
  totalPages,
  totalItems,
  limitPerPage,
  diasComerciais = 30,
  sortField,
  setSortField,
  sortDir,
  setSortDir,
  onEditOverrides,
  onRefresh,
  loading,
  tabOptions = [],
  toggleSort,
  SortIcon,
  onShowDetails,
  productionApprovalList = [],
  onToggleApprovalList
}: ProgramadasTabProps) {
  // Filtra estritamente apenas itens que tenham sido configurados como produção programada
  const programadasList = useMemo(() => {
    return (products || []).filter((p) => p.is_producao_programada === 1);
  }, [products]);

  // Statistics for scheduled products
  const summaryStats = useMemo(() => {
    const total = programadasList.length;
    let disparados = 0;
    let ok = 0;
    let volumeTotalDisparado = 0;

    programadasList.forEach((p) => {
      const disparo = p.producao_programada_disparo ?? 0;
      const efp = p.estoque_futuro_com_producao ?? 0;
      if (efp <= disparo) {
        disparados += 1;
        volumeTotalDisparado += p.producao_recomendada || p.producao_programada_objetivo || 0;
      } else {
        ok += 1;
      }
    });

    return { total, disparados, ok, volumeTotalDisparado };
  }, [programadasList]);

  return (
    <div className="view-container animate-in fade-in duration-200">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
            <CalendarClock size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Itens Programados</div>
            <div className="text-xl font-bold text-zinc-900">{summaryStats.total}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-50 text-rose-600 shrink-0">
            <Zap size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Disparos Ativos (Produzir)</div>
            <div className="text-xl font-bold text-rose-600">{summaryStats.disparados}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
            <CheckCircle size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Estoque Estável</div>
            <div className="text-xl font-bold text-emerald-650">{summaryStats.ok}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 shrink-0">
            <Package size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Volume a Produzir</div>
            <div className="text-xl font-bold text-zinc-900">{summaryStats.volumeTotalDisparado.toLocaleString('pt-BR')} un</div>
          </div>
        </div>
      </div>

      {/* Tabs Nav for Lines */}
      {tabOptions && tabOptions.length > 0 && (
        <div className="tabs-container">
          {tabOptions.map((opt) => (
            <button 
              key={opt.id}
              className={`tab-btn ${activeTab === opt.id ? 'active' : ''}`}
              onClick={() => handleTabChange(opt.id)}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}

      {/* Filtering Toolbar */}
      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar item programado por código ou descrição..." 
            className="search-input"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="filters-wrapper">
          <select 
            className="select-filter"
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
          >
            <option value="ALL">Todos os Disparos</option>
            <option value="critico">🔴 Disparo Atingido (Produzir)</option>
            <option value="saudavel">🟢 Estoque Estável</option>
          </select>

          <button className="btn-secondary cursor-pointer" onClick={onRefresh} title="Recarregar dados">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs">
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw className="animate-spin" size={32} />
            <span>Carregando produções programadas...</span>
          </div>
        ) : programadasList.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <CalendarClock size={24} />
            </div>
            <div className="text-base font-bold text-zinc-800">
              {search || selectedStatus !== 'ALL' || activeTab !== 'ALL'
                ? 'Nenhum produto encontrado com os filtros selecionados.'
                : 'Nenhum produto em Produção Programada'}
            </div>
            <p className="max-w-md text-xs text-zinc-500 leading-relaxed">
              {search || selectedStatus !== 'ALL' || activeTab !== 'ALL'
                ? 'Tente limpar a busca ou alterar os filtros de alerta/linha.'
                : 'Para adicionar um produto à Produção Programada, vá até a aba "Gerenciamento de Produção", clique no botão de editar (✏️) do produto e marque a opção "Habilitar Produção Programada" definindo o Estoque de Disparo e a Quantidade Objetivo.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-zinc-50 sticky top-0 z-10">
                <tr className="border-b border-zinc-200">
                  <th 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('codigo', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      REF
                      <SortIcon field="codigo" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '32%', cursor: 'pointer' }}
                    onClick={() => toggleSort('descricao', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Descrição / Linha
                      <SortIcon field="descricao" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => toggleSort('estoque_futuro_com_producao', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right"
                    title="EFP = Estoque + Produção − Pedidos (disponível projetado)"
                  >
                    <div className="flex items-center gap-1 justify-end">
                      EFP Projetado
                      <SortIcon field="estoque_futuro_com_producao" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => toggleSort('producao_programada_disparo', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right"
                    title="Gatilho: quando EFP for menor ou igual a este valor, dispara a ordem de produção"
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Gatilho (Disparo)
                      <SortIcon field="producao_programada_disparo" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => toggleSort('producao_programada_objetivo', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right"
                    title="Lote padrão a produzir a cada ciclo de disparo"
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Lote Objetivo
                      <SortIcon field="producao_programada_objetivo" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => toggleSort('status', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Status Disparo
                      <SortIcon field="status" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('producao_recomendada', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right"
                    title="Sugestão de lote quando o gatilho de disparo é atingido"
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Sugestão
                      <SortIcon field="producao_recomendada" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ width: '10%', textAlign: 'center' }} className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px]">
                    Fila Aprov.
                  </th>
                  <th style={{ width: '10%', textAlign: 'center' }} className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {programadasList.map((p) => {
                  const disparo = p.producao_programada_disparo ?? 0;
                  const objetivo = p.producao_programada_objetivo ?? 0;
                  const efp = p.estoque_futuro_com_producao ?? 0;
                  const isDisparado = efp <= disparo;

                  return (
                    <tr key={p.codigo} className={`hover:bg-zinc-50/40 transition-colors ${isDisparado ? 'bg-rose-50/20' : ''}`}>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle font-mono font-bold text-zinc-600">
                        <button 
                          onClick={() => onShowDetails(p.codigo)} 
                          className="hover:underline text-left font-bold text-zinc-800 cursor-pointer bg-transparent border-none p-0"
                          style={{ textAlign: 'left', outline: 'none' }}
                        >
                          {p.codigo}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle">
                        <div className="font-bold text-zinc-900">
                          <button 
                            onClick={() => onShowDetails(p.codigo)} 
                            className="hover:underline text-left font-bold text-zinc-900 cursor-pointer bg-transparent border-none p-0"
                            style={{ textAlign: 'left', fontSize: 'inherit', fontWeight: 'inherit', outline: 'none' }}
                          >
                            {p.descricao}
                          </button>
                        </div>
                        <div className="product-subinfo flex flex-wrap gap-1.5 mt-1 items-center">
                          <span className="text-[10px] text-zinc-500 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded">Linha: {p.nome_linha}</span>
                          <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <CalendarClock size={10} /> Programada
                          </span>
                          {p.base && <span className="base-badge">Base: {p.base}</span>}
                          {!p.has_formulation && (
                            <span className="hidden-badge" style={{ backgroundColor: 'rgb(244 63 94)', color: '#fff', fontWeight: 'bold' }} title="Produto sem receita cadastrada no sistema">
                              Sem Fórmula
                            </span>
                          )}
                          {p.missing_ingredients && p.missing_ingredients.length > 0 && (
                            <span className="overrides-indicator" style={{ backgroundColor: 'rgb(245 158 11)', color: '#fff', fontWeight: 'bold' }} title={`Itens faltando para a sugestão de produção: ${p.missing_ingredients.join(', ')}`}>
                              Falta Insumos ({p.missing_ingredients.length})
                            </span>
                          )}
                        </div>
                        {p.observacao && (
                          <div className="observation-text flex items-center gap-1 mt-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 w-fit" title="Restrição de produção">
                            <AlertTriangle size={11} className="shrink-0" />
                            <span>Obs: {p.observacao}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-right font-bold text-zinc-900">
                        <span className={isDisparado ? 'text-rose-600 font-extrabold text-sm' : 'text-zinc-900 font-bold'}>
                          {efp.toLocaleString('pt-BR')} un
                        </span>
                        <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                          <span>Est: {p.estoque}</span>
                          {' | '}
                          <span>Prod: {p.producao}</span>
                          {' | '}
                          <span>Ped: {p.pedidos_aberto}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-right font-semibold text-zinc-700">
                        <div className="inline-flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded text-zinc-800 font-mono font-bold">
                          ≤ {disparo.toLocaleString('pt-BR')} un
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">Ponto de Disparo</div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-right font-semibold text-zinc-700">
                        <div className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 px-2 py-0.5 rounded font-mono font-bold">
                          {objetivo.toLocaleString('pt-BR')} un
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">Lote Padrão</div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle">
                        {isDisparado ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                            <Zap size={12} className="text-rose-600" /> Disparar Produção
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 size={12} className="text-emerald-600" /> Estoque OK
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-right font-bold" style={{ color: p.producao_recomendada > 0 ? 'hsl(var(--danger-hsl))' : 'inherit' }}>
                        {p.producao_recomendada > 0 ? (
                          <span className="text-rose-600 text-sm font-extrabold">{p.producao_recomendada.toLocaleString('pt-BR')} un</span>
                        ) : (
                          <span className="text-zinc-400 font-normal">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                        {onToggleApprovalList && (
                          <button
                            onClick={() => onToggleApprovalList(p.codigo)}
                            className={`p-1.5 rounded transition-colors cursor-pointer ${
                              productionApprovalList.includes(p.codigo)
                                ? 'text-emerald-650 bg-emerald-50 hover:bg-emerald-100'
                                : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'
                            }`}
                            title={productionApprovalList.includes(p.codigo) ? "Remover da Fila de Aprovação" : "Adicionar à Fila de Aprovação"}
                          >
                            {productionApprovalList.includes(p.codigo) ? (
                              <CheckCircle2 size={16} />
                            ) : (
                              <PlusCircle size={16} />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-center">
                        <button 
                          className="p-1.5 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer" 
                          onClick={() => onEditOverrides(p)} 
                          title="Editar parâmetros da Produção Programada"
                        >
                          <Edit3 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="pagination-container">
          <span>Exibindo de {(page - 1) * limitPerPage + 1} a {Math.min(page * limitPerPage, totalItems)} de {totalItems} produtos programados</span>
          <div className="pagination-controls">
            <button 
              className="pagination-btn cursor-pointer" 
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontWeight: '700' }}>
              Página {page} de {totalPages}
            </span>
            <button 
              className="pagination-btn cursor-pointer" 
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
