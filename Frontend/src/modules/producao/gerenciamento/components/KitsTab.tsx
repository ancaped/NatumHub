import React from 'react';
import { 
  Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle, 
  ChevronDown, AlertTriangle, Edit3, ChevronLeft, ChevronRight, CheckCircle2, PlusCircle,
  Layers, Zap, CalendarClock
} from 'lucide-react';
import { ChevronRight as ChevronRightIcon } from 'lucide-react';

export function KitsTab({
  kitsStats,
  kits,
  configs,
  kitsActiveTab,
  setKitsActiveTab,
  kitsSearch,
  setKitsSearch,
  kitsSelectedStatus,
  setKitsSelectedStatus,
  kitsPage,
  setKitsPage,
  kitsTotalPages,
  kitsTotalItems,
  limitPerPage,
  showHidden,
  kitSortField,
  setKitSortField,
  kitSortDir,
  setKitSortDir,
  onLaunchProduct,
  onEditOverrides,
  onRefresh,
  loading,
  tabOptions,
  toggleSort,
  SortIcon,
  expandedKits,
  toggleKitExpanded,
  productionApprovalList = [],
  onToggleApprovalList,
  onOpenComposition,
  onToggleApenasKit
}: any) {
  return (
    <div className="view-container animate-in fade-in duration-200">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div 
          className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-indigo-300 hover:shadow-md ${kitsSelectedStatus === 'montar' ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/20' : 'border-zinc-200'}`}
          onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'montar' ? 'ALL' : 'montar'); setKitsPage(1); }}
          title="Clique para filtrar por kits prontos para montar"
        >
          <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
            <Layers size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Montar Urgente</div>
            <div className="text-xl font-bold text-indigo-600">{kitsStats?.montar ?? 0}</div>
          </div>
        </div>

        <div 
          className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-rose-300 hover:shadow-md ${kitsSelectedStatus === 'critico' ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-50/20' : 'border-zinc-200'}`}
          onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'critico' ? 'ALL' : 'critico'); setKitsPage(1); }}
          title="Clique para filtrar por kits críticos"
        >
          <div className="p-2.5 rounded-lg bg-rose-50 text-rose-600 shrink-0">
            <Zap size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Crítico: Produzir</div>
            <div className="text-xl font-bold text-rose-600">{kitsStats?.critico ?? 0}</div>
          </div>
        </div>

        <div 
          className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-amber-300 hover:shadow-md ${kitsSelectedStatus === 'aguardando' ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/20' : 'border-zinc-200'}`}
          onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'aguardando' ? 'ALL' : 'aguardando'); setKitsPage(1); }}
          title="Clique para filtrar por kits aguardando produção"
        >
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 shrink-0">
            <CalendarClock size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Aguardando Produção</div>
            <div className="text-xl font-bold text-amber-600">{kitsStats?.aguardando ?? 0}</div>
          </div>
        </div>

        <div 
          className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-emerald-300 hover:shadow-md ${kitsSelectedStatus === 'saudavel' ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/20' : 'border-zinc-200'}`}
          onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'saudavel' ? 'ALL' : 'saudavel'); setKitsPage(1); }}
          title="Clique para filtrar por estoque saudável"
        >
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Estoque Estável</div>
            <div className="text-xl font-bold text-emerald-600">{(kitsStats?.saudavel ?? 0) + (kitsStats?.abundante ?? 0)}</div>
          </div>
        </div>
      </div>
      {/* Tabs Nav */}
      <div className="tabs-container">
        {tabOptions.map((opt) => (
          <button 
            key={opt.id}
            className={`tab-btn ${kitsActiveTab === opt.id ? 'active' : ''}`}
            onClick={() => { setKitsActiveTab(opt.id); setKitsPage(1); }}
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
            placeholder="Buscar kit por código (REF) ou descrição..." 
            className="search-input"
            value={kitsSearch}
            onChange={(e) => { setKitsSearch(e.target.value); setKitsPage(1); }}
          />
        </div>

        <div className="filters-wrapper">
          <select 
            className="select-filter"
            value={kitsSelectedStatus}
            onChange={(e) => { setKitsSelectedStatus(e.target.value); setKitsPage(1); }}
          >
            <option value="ALL">Todos os Alertas</option>
            <option value="critico">Crítico: Produzir</option>
            <option value="ordem">Abrir Ordem</option>
            <option value="montar">Montar Urgente</option>
            <option value="aguardando">Aguardando Produção</option>
            <option value="saudavel">Estoque OK</option>
            <option value="abundante">Abundante</option>
          </select>

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
            <span>Calculando composição e estoques dos kits...</span>
          </div>
        ) : kits.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <HelpCircle size={48} style={{ opacity: 0.3 }} />
            <span>Nenhum kit encontrado com os filtros selecionados.</span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '4%' }}></th>
                  <th 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('codigo', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      REF Kit
                      <SortIcon field="codigo" activeField={kitSortField} activeDir={kitSortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '28%', cursor: 'pointer' }}
                    onClick={() => toggleSort('descricao', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Descrição do Kit
                      <SortIcon field="descricao" activeField={kitSortField} activeDir={kitSortDir} />
                    </div>
                  </th>
                  <th 
                    className="numeric-col sortable-th" 
                    style={{ width: '8%', cursor: 'pointer' }}
                    onClick={() => toggleSort('estoque_futuro_com_producao', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      EFP Kit
                      <SortIcon field="estoque_futuro_com_producao" activeField={kitSortField} activeDir={kitSortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '15%', cursor: 'pointer' }}
                    onClick={() => toggleSort('status', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Status Kit
                      <SortIcon field="status" activeField={kitSortField} activeDir={kitSortDir} />
                    </div>
                  </th>
                  <th 
                    className="numeric-col sortable-th" 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('producao_recomendada', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      Sug. Prod.
                      <SortIcon field="producao_recomendada" activeField={kitSortField} activeDir={kitSortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '15%', cursor: 'pointer' }}
                    onClick={() => toggleSort('max_montavel', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Capacidade Montagem
                      <SortIcon field="max_montavel" activeField={kitSortField} activeDir={kitSortDir} />
                    </div>
                  </th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Fila</th>
                  <th style={{ width: '10%' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {kits.map((k) => {
                  const p = k;
                  const isExpanded = expandedKits.includes(p.codigo);
                  const isOverridden = p.estoque_ideal_manual !== null || p.pedidos_manual !== null || p.media_manual !== null;
                  
                  let capacityClass = "abundante";
                  if (k.max_montavel === 0) {
                    capacityClass = "ruptura";
                  } else if (k.max_montavel < p.producao_recomendada) {
                    capacityClass = "limitado";
                  }

                  return (
                    <React.Fragment key={p.codigo}>
                      <tr className={isExpanded ? "expanded-row-tr" : ""}>
                        <td>
                          <button 
                            className="expand-toggle-btn cursor-pointer"
                            onClick={() => toggleKitExpanded(p.codigo)}
                            title={isExpanded ? "Ocultar componentes" : "Exibir componentes do kit"}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRightIcon size={14} />}
                          </button>
                        </td>
                        <td className="product-code">{p.codigo}</td>
                        <td>
                          <div className="product-desc">{p.descricao}</div>
                          <div className="product-subinfo">
                            <span>Linha: {p.nome_linha}</span>
                            {isOverridden && <span className="overrides-indicator">Editado</span>}
                          </div>
                        </td>
                        <td className="numeric-col" style={{ fontWeight: '700' }}>
                          {p.estoque_futuro_com_producao}
                          <div className="table-subtext">Est: {p.estoque} | Ped: {p.pedidos_aberto}</div>
                        </td>
                        <td>
                          <span className={`status-badge ${p.status}`}>
                            {p.status_label}
                          </span>
                        </td>
                        <td className="numeric-col" style={{ fontWeight: '700', color: p.producao_recomendada > 0 ? 'hsl(var(--danger-hsl))' : 'inherit' }}>
                          {p.producao_recomendada > 0 ? `${p.producao_recomendada} un` : '-'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span className={`montagem-badge ${capacityClass}`}>
                              Máx: {k.max_montavel} un montáveis
                            </span>
                            {p.status === 'montar' ? (
                              <span style={{ fontSize: '0.625rem', color: '#c2410c', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                Componentes OK — montar kit
                              </span>
                            ) : p.status === 'aguardando' ? (
                              <span style={{ fontSize: '0.625rem', color: '#1d4ed8', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                Componentes em produção — aguardar OP
                              </span>
                            ) : k.componentes_criticos.length > 0 ? (
                              <span style={{ fontSize: '0.625rem', color: 'hsl(var(--warning-hsl))', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <AlertTriangle size={10} />
                                Falta produzir {k.componentes_criticos.length} itens
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onToggleApprovalList(p.codigo)}
                            className="action-btn cursor-pointer"
                            style={{ 
                              color: productionApprovalList.includes(p.codigo) ? 'rgb(22, 163, 74)' : '#a3a3a3',
                              border: 'none',
                              background: 'transparent',
                              padding: 0
                            }}
                            title={productionApprovalList.includes(p.codigo) ? "Remover da Fila de Aprovação" : "Adicionar à Fila de Aprovação"}
                          >
                            {productionApprovalList.includes(p.codigo) ? (
                              <CheckCircle2 size={14} />
                            ) : (
                              <PlusCircle size={14} />
                            )}
                          </button>
                        </td>
                        <td style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          <button 
                            className="action-btn cursor-pointer" 
                            onClick={() => onOpenComposition?.(p.codigo, p.descricao)} 
                            title="Editar composição de itens deste kit"
                          >
                            <Layers size={14} />
                          </button>
                          <button className="action-btn cursor-pointer" onClick={() => onEditOverrides(p)} title="Ajustar overrides manuais">
                            <Edit3 size={14} />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Row containing Components details */}
                      {isExpanded && (
                        <tr className="expanded-row-tr">
                          <td colSpan="9" style={{ padding: 0 }}>
                            <div className="components-detail-panel">
                              <div className="components-panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Componentes do Kit ({k.componentes.length})</span>
                                <button 
                                  onClick={() => onOpenComposition?.(p.codigo, p.descricao)}
                                  style={{ 
                                    background: 'none', 
                                    border: 'none', 
                                    color: 'hsl(var(--primary-hsl, 220 90% 56%))', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 700, 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    cursor: 'pointer' 
                                  }}
                                >
                                  <Layers size={13} /> Gerenciar Composição do Kit
                                </button>
                              </div>
                              <table className="components-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: '13%' }}>REF Componente</th>
                                    <th style={{ width: '30%' }}>Descrição do Componente</th>
                                    <th className="numeric-col" style={{ width: '9%' }}>Estoque</th>
                                    <th className="numeric-col" style={{ width: '9%' }}>Produção</th>
                                    <th className="numeric-col" style={{ width: '9%' }}>Pedidos</th>
                                    <th style={{ width: '10%' }}>Necessita Prod.</th>
                                    <th style={{ width: '12%', textAlign: 'center' }}>Política de Uso</th>
                                    <th style={{ width: '8%', textAlign: 'center' }}>Produzir</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {k.componentes.map((comp) => (
                                    <tr key={comp.codigo}>
                                      <td className="comp-code">{comp.codigo}</td>
                                      <td className="comp-desc">
                                        {comp.descricao}
                                        {comp.fonte === 'item' && (
                                          <span className="status-badge" style={{ marginLeft: '6px', padding: '0px 4px', fontSize: '0.6rem', backgroundColor: '#f4f4f5', color: '#71717a' }}>
                                            embalagem/insumo
                                          </span>
                                        )}
                                      </td>
                                      <td className="numeric-col">{comp.estoque}</td>
                                      <td className="numeric-col">{comp.producao}</td>
                                      <td className="numeric-col">{comp.pedidos_aberto}</td>
                                      <td>
                                        {comp.producao_recomendada > 0 ? (
                                          <span className="status-badge critico" style={{ padding: '1px 4px', fontSize: '0.65rem' }}>
                                            Falta {comp.producao_recomendada} un
                                          </span>
                                        ) : (
                                          <span className="status-badge saudavel" style={{ padding: '1px 4px', fontSize: '0.65rem' }}>
                                            Suficiente
                                          </span>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        {comp.fonte === 'item' ? (
                                          <span style={{ color: '#a3a3a3', fontSize: '0.65rem' }}>Item Direto</span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => onToggleApenasKit?.(comp.codigo, comp.produzir_apenas_kit ?? 0)}
                                            style={{
                                              fontSize: '0.65rem',
                                              fontWeight: 700,
                                              padding: '2px 6px',
                                              borderRadius: 4,
                                              border: '1px solid',
                                              cursor: 'pointer',
                                              backgroundColor: comp.produzir_apenas_kit === 1 ? '#f5f3ff' : '#f4f4f5',
                                              color: comp.produzir_apenas_kit === 1 ? '#7c3aed' : '#52525b',
                                              borderColor: comp.produzir_apenas_kit === 1 ? '#ddd6fe' : '#e4e4e7',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 4
                                            }}
                                            title={
                                              comp.produzir_apenas_kit === 1
                                                ? 'Produzido apenas para kits (demanda calculada via kits). Clique para alternar.'
                                                : 'Vendido avulso também (demanda direta + kits). Clique para alternar.'
                                            }
                                          >
                                            <span style={{
                                              width: 6,
                                              height: 6,
                                              borderRadius: '50%',
                                              backgroundColor: comp.produzir_apenas_kit === 1 ? '#7c3aed' : '#a1a1aa'
                                            }} />
                                            {comp.produzir_apenas_kit === 1 ? 'Apenas Kit' : 'Vendido Avulso'}
                                          </button>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        {comp.fonte === 'item' ? (
                                          <span style={{ color: '#a3a3a3', fontSize: '0.65rem' }}>—</span>
                                        ) : (
                                          <button
                                            onClick={() => onLaunchProduct(comp)}
                                            className="action-btn cursor-pointer"
                                            style={{ 
                                              color: 'rgb(22, 163, 74)', 
                                              border: 'none', 
                                              background: 'transparent',
                                              padding: 0,
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center'
                                            }}
                                            title={`Lançar lote de produção para ${comp.descricao}`}
                                          >
                                            <PlusCircle size={14} />
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="pagination-container">
          <span>Exibindo de {(kitsPage - 1) * limitPerPage + 1} a {Math.min(kitsPage * limitPerPage, kitsTotalItems)} de {kitsTotalItems} kits</span>
          <div className="pagination-controls">
            <button 
              className="pagination-btn cursor-pointer" 
              disabled={kitsPage <= 1}
              onClick={() => setKitsPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontWeight: '700' }}>
              Página {kitsPage} de {kitsTotalPages}
            </span>
            <button 
              className="pagination-btn cursor-pointer" 
              disabled={kitsPage >= kitsTotalPages}
              onClick={() => setKitsPage(p => Math.min(kitsTotalPages, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
