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
  const [ocultarResolvidos, setOcultarResolvidos] = useState(true);
  const limitPerPage = 15;

  const filteredLotes = useMemo(() => {
    return lotes.filter(l => {
      const matchesSearch = 
        (l.loteNumber || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.productCode || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.productDescription || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.fabricatedBy || '').toLowerCase().includes(search.toLowerCase());
      
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
    options.push({ value: 'ERR_PESAGEM', label: '⚠️ Erro de Pesagem' });
    options.push({ value: 'ERR_ENVASE', label: '⚠️ Erro de Envase' });
    options.push({ value: 'ERR_CONFERENCIA', label: '⚠️ Erro de Conferência' });
    options.push({ value: 'ERR_ANY_ERROR', label: '⚠️ Qualquer Erro de Lote' });
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
            {lotes.reduce((sum, l) => sum + (['EA', 'FP'].includes(l.status.toUpperCase()) ? l.quantity : 0), 0).toLocaleString()} kg
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

        <div className="filters-wrapper flex items-center gap-2">
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

          <label className="flex items-center gap-2 text-[11px] font-bold text-zinc-600 border border-zinc-200 rounded-lg px-3 py-1.5 bg-white cursor-pointer select-none hover:bg-zinc-50 transition-colors">
            <input 
              type="checkbox" 
              checked={ocultarResolvidos} 
              onChange={(e) => { setOcultarResolvidos(e.target.checked); setPage(1); }} 
              className="accent-zinc-900 rounded" 
            />
            Ocultar Resolvidos
          </label>

          <button className="btn-secondary cursor-pointer" onClick={onRefresh} title="Atualizar dados">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs">
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
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-zinc-50 sticky top-0 z-10">
                <tr className="border-b border-zinc-200">
                  <th className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px]" style={{ width: '10%' }}>Nº Lote</th>
                  <th className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px]" style={{ width: '12%' }}>Data</th>
                  <th className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px]" style={{ width: '10%' }}>REF</th>
                  <th className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px]" style={{ width: '28%' }}>Produto</th>
                  <th className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] text-right" style={{ width: '10%' }}>Quantidade</th>
                  <th className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px] text-center" style={{ width: '10%' }}>Status</th>
                  <th className="px-4 py-3 font-bold text-zinc-655 uppercase tracking-wider text-[10px]" style={{ width: '20%' }}>Operador / Autorização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
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
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle font-mono font-bold text-zinc-600" style={{ fontSize: '0.85rem' }}>
                        #{l.loteNumber}
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-zinc-700 font-semibold" style={{ fontSize: '0.8rem' }}>
                        {formattedDate}
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle font-mono font-bold text-zinc-600">{l.productCode}</td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle">
                        <div className="font-bold text-zinc-900">{l.productDescription || 'Item Não Sincronizado'}</div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-right font-bold text-zinc-900" style={{ fontSize: '0.85rem' }}>
                        {l.quantity.toLocaleString()} kg
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle text-center">
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span className={`status-badge ${getStatusBadgeClass(l.status)}`}>
                            {getStatusLabel(l.status)}
                          </span>
                          {l.isResolved === true && (
                            <span className="bg-emerald-55 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[9px] font-extrabold flex items-center gap-1 shadow-sm">
                              ✔️ Desvios Justificados
                            </span>
                          )}
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
                              opacity: l.isResolved ? 0.4 : 1,
                              textDecoration: l.isResolved ? 'line-through' : 'none',
                              animation: l.isResolved ? 'none' : 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                            }}>
                              <AlertTriangle size={10} /> ERRO RENDIMENTO
                            </span>
                          )}
                          {l.pesagemError === true && (
                            <span style={{ 
                              backgroundColor: '#fee2e2', 
                              color: '#b91c1c',
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              opacity: l.isResolved ? 0.4 : 1,
                              textDecoration: l.isResolved ? 'line-through' : 'none',
                              animation: l.isResolved ? 'none' : 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                            }}>
                              <AlertTriangle size={10} /> ERRO PESAGEM
                            </span>
                          )}
                          {l.envaseError === true && (
                            <span style={{ 
                              backgroundColor: '#ffedd5', 
                              color: '#c2410c',
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              opacity: l.isResolved ? 0.4 : 1,
                              textDecoration: l.isResolved ? 'line-through' : 'none',
                              animation: l.isResolved ? 'none' : 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                            }}>
                              <AlertTriangle size={10} /> ERRO ENVASE
                            </span>
                          )}
                          {l.conferenciaError === true && (
                            <span style={{ 
                              backgroundColor: '#f3e8ff', 
                              color: '#6b21a8',
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              opacity: l.isResolved ? 0.4 : 1,
                              textDecoration: l.isResolved ? 'line-through' : 'none',
                              animation: l.isResolved ? 'none' : 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                            }}>
                              <AlertTriangle size={10} /> ERRO CONFERÊNCIA
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-150 align-middle">
                        <div className="font-semibold text-zinc-700" style={{ fontSize: '0.75rem' }}>
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
