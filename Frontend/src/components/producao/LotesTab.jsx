import React, { useState, useMemo } from 'react';
import { 
  Search, RefreshCw, HelpCircle, ChevronLeft, ChevronRight, 
  Layers, User, Calendar, ClipboardList, AlertTriangle
} from 'lucide-react';

const getStatusBadgeClass = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'EA': return 'saudavel'; // Closed/Finished
    case 'CF': return 'abundante'; // Checked
    case 'PG':
    case 'PP':
    case 'PR':
    case 'EN': return 'ordem';   // In progress
    case 'CA': return 'critico'; // Cancelled
    case 'FP': return 'saudavel'; // Finalized
    default: return 'abundante';
  }
};

const getStatusLabel = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'EA': return 'Estoque Atualizado';
    case 'PG': return 'Em Pesagem';
    case 'PP': return 'Pré-Produção';
    case 'PR': return 'Em Produção';
    case 'EN': return 'Em Envase';
    case 'CF': return 'Conferido';
    case 'CA': return 'Cancelado';
    case 'FP': return 'Finalizado';
    default: return status;
  }
};

export function LotesTab({
  lotes,
  onRefresh,
  loading,
  onOpenDetails,
  selectedStatus = 'ALL',
  setSelectedStatus
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limitPerPage = 15;

  const filteredLotes = useMemo(() => {
    return lotes.filter(l => {
      const matchesSearch = 
        (l.loteNumber || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.productCode || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.productDescription || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.fabricatedBy || '').toLowerCase().includes(search.toLowerCase());
      
      const matchesStatus = 
        selectedStatus === 'ALL' || 
        (selectedStatus === 'ERR_YIELD' ? l.yieldError === true : l.status === selectedStatus);

      return matchesSearch && matchesStatus;
    });
  }, [lotes, search, selectedStatus]);

  // Pagination
  const totalItems = filteredLotes.length;
  const totalPages = Math.ceil(totalItems / limitPerPage) || 1;
  const paginatedLotes = useMemo(() => {
    const start = (page - 1) * limitPerPage;
    return filteredLotes.slice(start, start + limitPerPage);
  }, [filteredLotes, page]);

  // Get unique status values for filter
  const statusOptions = useMemo(() => {
    const statuses = new Set();
    lotes.forEach(l => {
      if (l.status) statuses.add(l.status);
    });
    const options = Array.from(statuses).map(s => ({ value: s, label: getStatusLabel(s) }));
    options.push({ value: 'ERR_YIELD', label: '⚠️ Erro de Rendimento (>10%)' });
    return options;
  }, [lotes]);

  const handleStatusChange = (e) => {
    setSelectedStatus(e.target.value);
    setPage(1);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="view-header">
        <h2 className="view-title">Lotes de Produção (ERP)</h2>
        <p className="view-subtitle">
          Histórico completo dos lotes de fabricação industrial sincronizados diretamente com o servidor ERP.
        </p>
      </div>

      {/* KPI Cards */}
      <section className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="summary-card abundant">
          <div className="card-header">
            <span className="card-title">Total de Lotes</span>
            <div className="card-icon"><ClipboardList size={20} /></div>
          </div>
          <div className="card-value">{lotes.length}</div>
          <div className="card-subtitle">Lotes carregados no banco local</div>
        </div>

        <div className="summary-card ordem">
          <div className="card-header">
            <span className="card-title">Lotes em Produção</span>
            <div className="card-icon"><Layers size={20} /></div>
          </div>
          <div className="card-value">
            {lotes.filter(l => ['PG', 'PP', 'PR', 'EN', 'CF'].includes(l.status.toUpperCase())).length}
          </div>
          <div className="card-subtitle">Lotes em andamento na fábrica</div>
        </div>

        <div className="summary-card saudavel">
          <div className="card-header">
            <span className="card-title">Total Produzido (Lotes)</span>
            <div className="card-icon"><Calendar size={20} /></div>
          </div>
          <div className="card-value">
            {lotes.reduce((sum, l) => sum + (['EA', 'FP'].includes(l.status.toUpperCase()) ? l.quantity : 0), 0).toLocaleString()} un
          </div>
          <div className="card-subtitle">Volume físico total dos lotes concluídos</div>
        </div>
      </section>

      {/* Filtering Toolbar */}
      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por lote, REF, produto ou operador..." 
            className="search-input"
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        <div className="filters-wrapper">
          <select 
            className="select-filter"
            value={selectedStatus}
            onChange={handleStatusChange}
          >
            <option value="ALL">Todos os Status</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button className="btn-secondary cursor-pointer" onClick={onRefresh} title="Atualizar dados">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="table-card">
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw className="animate-spin" size={32} />
            <span>Carregando lotes industriais...</span>
          </div>
        ) : filteredLotes.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <HelpCircle size={48} style={{ opacity: 0.3 }} />
            <span>Nenhum lote industrial encontrado.</span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '10%' }}>Nº Lote</th>
                  <th style={{ width: '12%' }}>Data</th>
                  <th style={{ width: '10%' }}>REF</th>
                  <th style={{ width: '28%' }}>Produto</th>
                  <th className="numeric-col" style={{ width: '10%' }}>Quantidade</th>
                  <th style={{ width: '10%' }}>Status</th>
                  <th style={{ width: '20%' }}>Operador / Autorização</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLotes.map((l) => {
                  const dateObj = new Date(l.date.replace(' ', 'T'));
                  const formattedDate = isNaN(dateObj.getTime()) ? l.date : dateObj.toLocaleDateString('pt-BR');

                  return (
                    <tr 
                      key={l.id} 
                      onClick={() => onOpenDetails && onOpenDetails(l.loteNumber)}
                      style={{ cursor: onOpenDetails ? 'pointer' : 'default' }}
                      className="hover:bg-zinc-50/50 transition-colors"
                    >
                      <td className="product-code" style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                        #{l.loteNumber}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'hsl(var(--text-primary-hsl))', fontWeight: '500' }}>
                        {formattedDate}
                      </td>
                      <td className="product-code">{l.productCode}</td>
                      <td>
                        <div className="product-desc" style={{ fontWeight: '500' }}>{l.productDescription || 'Item Não Sincronizado'}</div>
                      </td>
                      <td className="numeric-col" style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                        {l.quantity.toLocaleString()} un
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span className={`status-badge ${getStatusBadgeClass(l.status)}`}>
                            {getStatusLabel(l.status)}
                          </span>
                          {l.yieldError === true && (
                            <span style={{ 
                              backgroundColor: 'hsl(var(--warning-background-hsl))', 
                              color: 'hsl(var(--warning-foreground-hsl))',
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                            }}>
                              <AlertTriangle size={10} /> ERRO RENDIMENTO
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-primary-hsl))', fontWeight: '600' }}>
                          <User size={10} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle', opacity: 0.6 }} />
                          {l.fabricatedBy || 'N/A'}
                        </div>
                        {l.authorizedBy && (
                          <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: '2px' }}>
                            Autorizado por: {l.authorizedBy}
                          </div>
                        )}
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
          <span>Exibindo de {(page - 1) * limitPerPage + 1} a {Math.min(page * limitPerPage, totalItems)} de {totalItems} lotes</span>
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
