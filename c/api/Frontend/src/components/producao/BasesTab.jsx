import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, RefreshCw, ChevronDown, ChevronRight, Edit3, HelpCircle, AlertTriangle, CheckCircle2, PlusCircle
} from 'lucide-react';

const API_BASE = 'http://127.0.0.1:3001/api';

export function BasesTab({
  configs,
  tabOptions,
  onLaunchProduct,
  onEditOverrides,
  onRefresh,
  productionApprovalList = [],
  onToggleApprovalList
}) {
  const [bases, setBases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLine, setSelectedLine] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState('codigo');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedBases, setExpandedBases] = useState([]);
  const [baseDetails, setBaseDetails] = useState({});
  const [detailsLoading, setDetailsLoading] = useState({});

  const limitPerPage = 15;

  const loadBases = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/products?limit=5000&status=bases`);
      if (res.ok) {
        const data = await res.json();
        setBases(data.items || []);
      }
    } catch (e) {
      console.error("Erro ao buscar bases:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBases();
  }, []);

  const handleRefresh = async () => {
    await loadBases();
    if (onRefresh) onRefresh();
  };

  const toggleBaseExpanded = async (code) => {
    const isExpanded = expandedBases.includes(code);
    if (isExpanded) {
      setExpandedBases(expandedBases.filter(c => c !== code));
    } else {
      setExpandedBases([...expandedBases, code]);
      // Fetch details if not already loaded
      if (!baseDetails[code]) {
        setDetailsLoading(prev => ({ ...prev, [code]: true }));
        try {
          const res = await fetch(`${API_BASE}/estoque/item-info/${code}`);
          if (res.ok) {
            const data = await res.json();
            setBaseDetails(prev => ({ ...prev, [code]: data }));
          }
        } catch (e) {
          console.error("Erro ao carregar detalhes da base:", e);
        } finally {
          setDetailsLoading(prev => ({ ...prev, [code]: false }));
        }
      }
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Filter & Sort bases on client side
  const processedBases = useMemo(() => {
    let result = [...bases];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(b => 
        (b.codigo || '').toLowerCase().includes(term) ||
        (b.descricao || '').toLowerCase().includes(term)
      );
    }

    // Line filter
    if (selectedLine !== 'ALL') {
      result = result.filter(b => b.linha_prefix === selectedLine);
    }

    // Sorting
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'string') {
        return sortDir === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return sortDir === 'asc' 
          ? (valA > valB ? 1 : -1) 
          : (valB > valA ? 1 : -1);
      }
    });

    return result;
  }, [bases, searchTerm, selectedLine, sortField, sortDir]);

  // Pagination
  const totalItems = processedBases.length;
  const totalPages = Math.ceil(totalItems / limitPerPage) || 1;
  const paginatedBases = useMemo(() => {
    const startIdx = (currentPage - 1) * limitPerPage;
    return processedBases.slice(startIdx, startIdx + limitPerPage);
  }, [processedBases, currentPage]);

  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="view-header">
        <h2 className="view-title">Gestão de Bases</h2>
        <p className="view-subtitle">
          Gerenciamento do estoque de bases, composições e rastreamento de produtos acabados vinculados.
        </p>
      </div>

      {/* Tabs Nav for Product Lines */}
      <div className="tabs-container">
        {tabOptions.map((opt) => (
          <button 
            key={opt.id}
            className={`tab-btn ${selectedLine === opt.id ? 'active' : ''}`}
            onClick={() => { setSelectedLine(opt.id); setCurrentPage(1); }}
          >
            {opt.name}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar base por código ou descrição..." 
            className="search-input"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div className="filters-wrapper">
          <button className="btn-secondary cursor-pointer" onClick={handleRefresh} title="Recarregar dados">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Bases Table Card */}
      <div className="table-card">
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'rgb(115, 115, 115)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw className="animate-spin" size={32} />
            <span>Carregando dados das bases...</span>
          </div>
        ) : paginatedBases.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'rgb(115, 115, 115)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <HelpCircle size={48} style={{ opacity: 0.3 }} />
            <span>Nenhuma base encontrada.</span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '4%' }}></th>
                  <th 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => handleSort('codigo')}
                    className="sortable-th"
                  >
                    REF Base {sortField === 'codigo' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th 
                    style={{ width: '40%', cursor: 'pointer' }}
                    onClick={() => handleSort('descricao')}
                    className="sortable-th"
                  >
                    Descrição {sortField === 'descricao' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th 
                    className="numeric-col sortable-th" 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => handleSort('estoque')}
                  >
                    Estoque {sortField === 'estoque' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th 
                    className="numeric-col sortable-th" 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => handleSort('producao')}
                  >
                    Produção {sortField === 'producao' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th style={{ width: '12%' }}>Status</th>
                  <th style={{ width: '8%', textAlign: 'center' }}>Fila</th>
                  <th style={{ width: '8%' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedBases.map((b) => {
                  const isExpanded = expandedBases.includes(b.codigo);
                  const details = baseDetails[b.codigo];
                  const isDetailsLoading = detailsLoading[b.codigo];

                  return (
                    <React.Fragment key={b.codigo}>
                      <tr className={isExpanded ? "expanded-row-tr" : ""}>
                        <td>
                          <button 
                            className="expand-toggle-btn cursor-pointer"
                            onClick={() => toggleBaseExpanded(b.codigo)}
                            title={isExpanded ? "Ocultar detalhes" : "Exibir composição e vinculações"}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td className="product-code">{b.codigo}</td>
                        <td>
                          <div className="product-desc">{b.descricao}</div>
                          <div className="product-subinfo">
                            <span>Linha: {b.nome_linha}</span>
                          </div>
                        </td>
                        <td className="numeric-col font-bold">{b.estoque} un</td>
                        <td className="numeric-col text-zinc-500 font-semibold">{b.producao > 0 ? `${b.producao} un` : '-'}</td>
                        <td>
                          <span className="status-badge bases" style={{ background: '#f4f4f5', color: '#18181b', border: '1px solid #e4e4e7' }}>
                            Base
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onToggleApprovalList(b.codigo)}
                            className="action-btn cursor-pointer"
                            style={{ 
                              color: productionApprovalList.includes(b.codigo) ? 'rgb(22, 163, 74)' : '#a3a3a3',
                              border: 'none',
                              background: 'transparent',
                              padding: 0
                            }}
                            title={productionApprovalList.includes(b.codigo) ? "Remover da Fila de Aprovação" : "Adicionar à Fila de Aprovação"}
                          >
                            {productionApprovalList.includes(b.codigo) ? (
                              <CheckCircle2 size={14} />
                            ) : (
                              <PlusCircle size={14} />
                            )}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                            <button 
                              className="action-btn cursor-pointer" 
                              onClick={() => onEditOverrides(b)} 
                              title="Ajustar overrides manuais"
                            >
                              <Edit3 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Section */}
                      {isExpanded && (
                        <tr className="expanded-row-tr">
                          <td colSpan={8} style={{ padding: 0 }}>
                            <div className="components-detail-panel" style={{ padding: '1.5rem', background: '#fafafa', borderTop: '1px solid #e4e4e7' }}>
                              {isDetailsLoading ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#737373', fontSize: '0.875rem' }}>
                                  <RefreshCw className="animate-spin" size={16} />
                                  Carregando receita e relações...
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                  {/* Composition (Ingredientes) */}
                                  <div>
                                    <div className="components-panel-title" style={{ fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.75rem', color: '#27272a' }}>
                                      Composição da Base (Fórmula)
                                    </div>
                                    {(!details || !details.formulation || details.formulation.length === 0) ? (
                                      <div style={{ fontSize: '0.75rem', color: '#a3a3a3', italic: 'true' }}>
                                        Nenhuma receita cadastrada para esta base.
                                      </div>
                                    ) : (
                                      <table className="components-table" style={{ width: '100%', fontSize: '0.75rem' }}>
                                        <thead>
                                          <tr style={{ borderBottom: '1px solid #e4e4e7', textAlign: 'left' }}>
                                            <th style={{ padding: '0.5rem 0' }}>REF</th>
                                            <th>Ingrediente</th>
                                            <th className="numeric-col" style={{ textAlign: 'right' }}>Qtd (g/ml)</th>
                                            <th className="numeric-col" style={{ textAlign: 'right' }}>%</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {details.formulation.map((f, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f4f4f5' }}>
                                              <td className="comp-code" style={{ padding: '0.5rem 0', fontFamily: 'monospace' }}>{f.ingredient_code}</td>
                                              <td className="comp-desc" style={{ fontWeight: '500' }}>{f.description}</td>
                                              <td className="numeric-col" style={{ textAlign: 'right' }}>{f.quantity.toFixed(4)}</td>
                                              <td className="numeric-col" style={{ textAlign: 'right' }}>{(f.percentage * 100).toFixed(2)}%</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>

                                  {/* Relação de Rastreabilidade (Onde é utilizada) */}
                                  <div>
                                    <div className="components-panel-title" style={{ fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.75rem', color: '#27272a' }}>
                                      Utilizada nos Produtos Acabados
                                    </div>
                                    {(!details || !details.usedIn || details.usedIn.length === 0) ? (
                                      <div style={{ fontSize: '0.75rem', color: '#a3a3a3', italic: 'true' }}>
                                        Esta base não está vinculada a nenhum produto acabado.
                                      </div>
                                    ) : (
                                      <table className="components-table" style={{ width: '100%', fontSize: '0.75rem' }}>
                                        <thead>
                                          <tr style={{ borderBottom: '1px solid #e4e4e7', textAlign: 'left' }}>
                                            <th style={{ padding: '0.5rem 0' }}>REF Produto</th>
                                            <th>Descrição do Produto</th>
                                            <th className="numeric-col" style={{ textAlign: 'right' }}>Qtd na Fórmula</th>
                                            <th className="numeric-col" style={{ textAlign: 'right' }}>%</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {details.usedIn.map((u, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f4f4f5' }}>
                                              <td className="comp-code" style={{ padding: '0.5rem 0', fontFamily: 'monospace' }}>{u.product_code}</td>
                                              <td className="comp-desc" style={{ fontWeight: '500' }}>{u.description}</td>
                                              <td className="numeric-col" style={{ textAlign: 'right' }}>{u.quantity.toFixed(4)}</td>
                                              <td className="numeric-col" style={{ textAlign: 'right' }}>{(u.percentage * 100).toFixed(2)}%</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </div>
                              )}
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
        <div className="pagination-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#737373' }}>
            Exibindo de {totalItems === 0 ? 0 : (currentPage - 1) * limitPerPage + 1} a {Math.min(currentPage * limitPerPage, totalItems)} de {totalItems} bases
          </span>
          <div className="pagination-controls" style={{ display: 'flex', gap: '0.25rem' }}>
            <button 
              className="pagination-btn cursor-pointer" 
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              style={{ padding: '0.25rem 0.5rem', background: '#fff', border: '1px solid #e4e4e7', borderRadius: '4px', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
            >
              Anterior
            </button>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center' }}>
              Página {currentPage} de {totalPages}
            </span>
            <button 
              className="pagination-btn cursor-pointer" 
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              style={{ padding: '0.25rem 0.5rem', background: '#fff', border: '1px solid #e4e4e7', borderRadius: '4px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer' }}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
