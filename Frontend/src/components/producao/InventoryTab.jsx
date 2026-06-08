import React from 'react';
import { 
  Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle, 
  AlertTriangle, ChevronLeft, ChevronRight, Play, Edit3 
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
  SortIcon
}) {
  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="view-header">
        <h2 className="view-title">Gerenciamento de Produção</h2>
        <p className="view-subtitle">
          Lista de produtos dinâmica com cálculos baseados em faturamento histórico e limiares de segurança.
        </p>
      </div>

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
      <div className="table-card">
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
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('codigo', sortField, setSortField, sortDir, setSortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      REF
                      <SortIcon field="codigo" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '35%', cursor: 'pointer' }}
                    onClick={() => toggleSort('descricao', sortField, setSortField, sortDir, setSortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Descrição / Linha
                      <SortIcon field="descricao" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    className="numeric-col sortable-th" 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('estoque_futuro_com_producao', sortField, setSortField, sortDir, setSortDir)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      EFP
                      <SortIcon field="estoque_futuro_com_producao" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '20%', cursor: 'pointer' }}
                    onClick={() => toggleSort('duracao_meses', sortField, setSortField, sortDir, setSortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Duração
                      <SortIcon field="duracao_meses" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => toggleSort('status', sortField, setSortField, sortDir, setSortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Status
                      <SortIcon field="status" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    className="numeric-col sortable-th" 
                    style={{ width: '8%', cursor: 'pointer' }}
                    onClick={() => toggleSort('producao_recomendada', sortField, setSortField, sortDir, setSortDir)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      Sug. Prod.
                      <SortIcon field="producao_recomendada" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ width: '5%' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
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
                    <tr key={p.codigo}>
                      <td className="product-code">{p.codigo}</td>
                      <td>
                        <div className="product-desc">{p.descricao}</div>
                        <div className="product-subinfo">
                          <span>Linha: {p.nome_linha}</span>
                          {p.base && <span className="base-badge">Base: {p.base}</span>}
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
                            <span className="overrides-indicator" title="Valores sobrescritos manualmente">
                              <Edit3 size={10} /> Editado
                            </span>
                          )}
                        </div>
                        {p.observacao && (
                          <div className="observation-text" title="Restrição de produção">
                            <AlertTriangle size={12} />
                            <span>Obs: {p.observacao}</span>
                          </div>
                        )}
                      </td>
                      <td className="numeric-col" style={{ fontWeight: '700' }}>
                        {p.estoque_futuro_com_producao}
                        <div className="table-subtext">
                          Est: {p.estoque} | Prod: {p.producao} | Ped: {p.pedidos_aberto}
                        </div>
                      </td>
                      <td>
                        <div className="duration-container">
                          <div className="duration-info">
                            <span>{p.duracao_meses.toFixed(1)} meses</span>
                            <span>{duracaoDiasCalculada.toFixed(0)} dias</span>
                          </div>
                          <div className="duration-bar-bg">
                            <div 
                              className={`duration-bar-fill ${p.status}`} 
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                            <span>Vendas/mês: {p.demanda_ajustada.toFixed(1)}</span>
                            {p.desvio_padrao > 0 && <span title={`Média: ${p.media_vendas.toFixed(0)} | σ: ${p.desvio_padrao.toFixed(0)}`}>σ: {p.desvio_padrao.toFixed(0)}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${p.status}`}>
                          {p.status_label}
                        </span>
                      </td>
                      <td className="numeric-col" style={{ fontWeight: '700', color: p.producao_recomendada > 0 ? 'hsl(var(--danger-hsl))' : 'inherit' }}>
                        {p.producao_recomendada > 0 ? `${p.producao_recomendada} un` : '-'}
                        {p.producao_recomendada > 0 && (
                          <div className="table-subtext">
                            Ideal: {p.estoque_ideal_qtd.toFixed(0)}
                          </div>
                        )}
                      </td>
                      <td style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <button 
                          className="action-btn text-success cursor-pointer" 
                          onClick={() => onLaunchProduct(p)} 
                          title="Lançar Lote de Produção"
                          style={{ color: 'hsl(var(--success-hsl))' }}
                        >
                          <Play size={14} />
                        </button>
                        <button className="action-btn cursor-pointer" onClick={() => onEditOverrides(p)} title="Ajustar overrides manuais">
                          <Edit3 size={14} />
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
