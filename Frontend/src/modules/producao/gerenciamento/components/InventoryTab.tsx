import React from 'react';
import { 
  Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle, 
  AlertTriangle, ChevronLeft, ChevronRight, Edit3, CheckCircle2, PlusCircle 
} from 'lucide-react';

export function InventoryTab({
  products,
  configs,
  bases,
  activeTab,
  handleTabChange,
  search,
  setSearch,
  selectedStatus,
  setSelectedStatus,
  selectedBase,
  setSelectedBase,
  showHidden,
  setShowHidden,
  page,
  setPage,
  totalPages,
  totalItems,
  limitPerPage,
  diasComerciais,
  sortField,
  setSortField,
  sortDir,
  setSortDir,
  onLaunchProduct,
  onEditOverrides,
  onRefresh,
  loading,
  tabOptions,
  toggleSort,
  SortIcon,
  onShowDetails,
  productionApprovalList = [],
  onToggleApprovalList
}) {
  return (
    <div className="view-container animate-in fade-in duration-200">
      {/* Tabs Nav */}
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

      {/* Filtering Toolbar */}
      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por código (REF) ou descrição..." 
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
            <option value="ALL">Todos os Alertas</option>
            <option value="critico">Crítico: Produzir</option>
            <option value="ordem">Abrir Ordem</option>
            <option value="saudavel">Estoque OK</option>
            <option value="abundante">Abundante</option>
            <option value="ERR_NO_FORMULA">Erro: Sem Formulação</option>
            <option value="ERR_MISSING_MATS">Erro: Falta Insumos</option>
            <option value="ERR_ANY">Erro: Qualquer Erro</option>
          </select>

          <select 
            className="select-filter"
            value={selectedBase}
            onChange={(e) => { setSelectedBase(e.target.value); setPage(1); }}
          >
            <option value="ALL">Qualquer Base</option>
            <option value="HAS_BASE">Com Base Relacionada</option>
            <option value="NO_BASE">Sem Base</option>
            {bases.map((baseName) => (
              <option key={baseName} value={baseName}>{baseName}</option>
            ))}
          </select>

          <label className="toolbar-checkbox-wrapper">
            <input 
              type="checkbox" 
              checked={showHidden} 
              onChange={(e) => { setShowHidden(e.target.checked); setPage(1); }} 
            />
            <span>Ver Ocultos</span>
          </label>

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
            <span>Calculando e carregando dados de estoque...</span>
          </div>
        ) : products.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <HelpCircle size={48} style={{ opacity: 0.3 }} />
            <span>Nenhum produto encontrado com os filtros selecionados.</span>
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
                    style={{ width: '35%', cursor: 'pointer' }}
                    onClick={() => toggleSort('descricao', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Descrição / Linha
                      <SortIcon field="descricao" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('estoque_futuro_com_producao', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right"
                    title="EFP = Estoque + Produção − Pedidos (disponível projetado). Não confundir com Est (espelho nQtdeEstoque do ERP)."
                  >
                    <div className="flex items-center gap-1 justify-end">
                      EFP
                      <HelpCircle size={11} className="text-zinc-400 shrink-0" aria-hidden />
                      <SortIcon field="estoque_futuro_com_producao" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '20%', cursor: 'pointer' }}
                    onClick={() => toggleSort('duracao_meses', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Duração
                      <SortIcon field="duracao_meses" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => toggleSort('status', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Status
                      <SortIcon field="status" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '8%', cursor: 'pointer' }}
                    onClick={() => toggleSort('producao_recomendada', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right"
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Sug. Prod.
                      <SortIcon field="producao_recomendada" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] text-center" style={{ width: '5%' }}>Fila</th>
                  <th className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] text-center" style={{ width: '5%' }}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {products.map((p) => {
                  const isOverridden = p.estoque_ideal_manual !== null || 
                                       p.pedidos_manual !== null || 
                                       p.media_manual !== null ||
                                       p.is_lancamento_manual !== null ||
                                       p.visivel === 0 ||
                                       p.linha_prefix_manual !== null ||
                                       p.observacao !== null;
                  const duracaoDiasCalculada = p.duracao_meses * diasComerciais;
                  const pct = Math.min(100, Math.max(5, (p.duracao_meses / p.estoque_ideal_meses) * 100));

                  return (
                    <tr key={p.codigo} className="hover:bg-zinc-50/30 transition-colors">
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
                          {p.base && <span className="base-badge">Base: {p.base}</span>}
                          {p.is_kit_component && (
                            <span className="usa-em-kit-badge" title="Este produto é um componente de kit(s)">
                              Usa em Kit
                            </span>
                          )}
                          {p.is_lancamento && (
                            <span className="lancamento-badge">
                              Lançamento
                            </span>
                          )}
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
                          {p.visivel === 0 && (
                            <span className="hidden-badge" title="Este produto está oculto das listagens normais">
                              Oculto
                            </span>
                          )}
                          {p.linha_prefix_manual !== null && (
                            <span className="overrides-indicator" title={`Prefixo de cálculo alterado manualmente para: ${p.linha_prefix_manual}`}>
                              Linha Customizada
                            </span>
                          )}
                          {isOverridden && (
                            <span className="overrides-indicator text-blue-650" title="Valores sobrescritos manualmente">
                              <Edit3 size={10} /> Editado
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
                        <span title="EFP = Est + Prod − Ped (projeção Hub; não comparar com nQtdeEstoque do ERP)">
                          {p.estoque_futuro_com_producao}
                        </span>
                        <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                          <span title="Est = espelho ERP Produtos.nQtdeEstoque (não é EFP)">
                            Est: {p.estoque}
                          </span>
                          {' | '}
                          <span title="Em produção: maior entre nQtdeProducao (ERP) e soma de Unidades dos lotes abertos no Hub">
                            Prod: {p.producao}
                          </span>
                          {' | '}
                          <span title="Faltas a faturar (unidades) — pedidos PP/LB/EX/CF/AL, janela Configurações. Diferente de nPedidos do cadastro ERP.">
                            Ped: {p.pedidos_aberto}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle">
                        <div className="duration-container flex flex-col gap-1">
                          <div className="duration-info flex justify-between font-semibold text-zinc-700 text-[10px]">
                            <span>{p.duracao_meses.toFixed(1)} meses</span>
                            <span>{duracaoDiasCalculada.toFixed(0)} dias</span>
                          </div>
                          <div className="duration-bar-bg h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div 
                              className={`duration-bar-fill h-full rounded-full ${p.status}`} 
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-400 mt-0.5">
                            <span>Vendas/mês: {p.produzir_apenas_kit === 1 ? '—' : p.demanda_ajustada.toFixed(1)}</span>
                            {p.desvio_padrao > 0 && p.produzir_apenas_kit !== 1 && <span title={`Média: ${p.media_vendas.toFixed(0)} | σ: ${p.desvio_padrao.toFixed(0)}`}>σ: {p.desvio_padrao.toFixed(0)}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle">
                        <span className={`status-badge ${p.status}`}>
                          {p.status_label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-right font-bold text-zinc-800" style={{ color: p.producao_recomendada > 0 ? 'hsl(var(--danger-hsl))' : 'inherit' }}>
                        {p.producao_recomendada > 0 ? `${p.producao_recomendada} un` : '-'}
                        {p.producao_recomendada > 0 && (
                          <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                            Ideal: {p.estoque_ideal_qtd.toFixed(0)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onToggleApprovalList(p.codigo)}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            productionApprovalList.includes(p.codigo)
                              ? 'text-emerald-650 hover:bg-emerald-50'
                              : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'
                          }`}
                          title={productionApprovalList.includes(p.codigo) ? "Remover da Fila de Aprovação" : "Adicionar à Fila de Aprovação"}
                        >
                          {productionApprovalList.includes(p.codigo) ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <PlusCircle size={14} />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-center">
                        <div className="flex gap-1 justify-center">
                          <button 
                            className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer" 
                            onClick={() => onEditOverrides(p)} 
                            title="Ajustar overrides manuais"
                          >
                            <Edit3 size={14} />
                          </button>
                        </div>
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
          <span>Exibindo de {(page - 1) * limitPerPage + 1} a {Math.min(page * limitPerPage, totalItems)} de {totalItems} produtos</span>
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
