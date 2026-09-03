import React, { useState } from 'react';
import { 
  Search, RefreshCw, X, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle, 
  ChevronDown, Eye, Trash2, Package, History, Layers, Check, Edit3 
} from 'lucide-react';
import { API_BASE } from '../../lib/utils';

export function HistoryTab({
  historyRecords,
  configs,
  historySearch,
  setHistorySearch,
  historyActiveTab,
  setHistoryActiveTab,
  historyDateFilter,
  setHistoryDateFilter,
  historySortField,
  setHistorySortField,
  historySortDir,
  setHistorySortDir,
  onDeleteHistory,
  onRefresh,
  loading,
  toggleSort,
  SortIcon,
  expandedHistoryId,
  setExpandedHistoryId
}) {
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState('');

  const handleSaveLoteErp = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/historico/${id}/lote`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lote_erp: editVal.trim() === '' ? null : editVal.trim() })
      });
      if (res.ok) {
        setEditingId(null);
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao atualizar lote");
      }
    } catch (e) {
      console.error(e);
      alert("Falha de conexão com o servidor");
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="view-header">
        <h2 className="view-title">Histórico de Produção Lançada</h2>
        <p className="view-subtitle">
          Lista de lotes industriais definidos por dia. A exclusão de um registro estorna automaticamente o estoque em processo.
        </p>
      </div>

      {/* Summary KPIs */}
      <section className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="summary-card saudavel">
          <div className="card-header">
            <span className="card-title">Lotes Registrados</span>
            <div className="card-icon">
              <History size={20} />
            </div>
          </div>
          <div className="card-value">{historyRecords.length}</div>
          <div className="card-subtitle">Lotes ativos no período selecionado</div>
        </div>

        <div className="summary-card ordem">
          <div className="card-header">
            <span className="card-title">Total Produzido</span>
            <div className="card-icon">
              <Layers size={20} />
            </div>
          </div>
          <div className="card-value">
            {historyRecords.reduce((sum, r) => sum + r.quantidade, 0).toLocaleString()} un
          </div>
          <div className="card-subtitle">Unidades enviadas para linha de envase/produção</div>
        </div>
      </section>

      {/* Filtering Toolbar */}
      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por REF ou descrição..." 
            className="search-input"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />
        </div>

        <div className="filters-wrapper">
          <select 
            className="select-filter"
            value={historyActiveTab}
            onChange={(e) => setHistoryActiveTab(e.target.value)}
          >
            <option value="ALL">Todas as Linhas</option>
            {configs.filter(c => c.visivel !== 0).map(c => (
              <option key={c.linha_prefix} value={c.linha_prefix}>{c.nome_linha}</option>
            ))}
          </select>

          <input 
            type="date" 
            className="select-filter bg-white text-zinc-900" 
            value={historyDateFilter}
            onChange={(e) => setHistoryDateFilter(e.target.value)}
            style={{ padding: '0 0.5rem', minWidth: '150px' }}
            title="Filtrar por data específica da produção"
          />

          {historyDateFilter && (
            <button 
              className="btn-secondary cursor-pointer" 
              onClick={() => setHistoryDateFilter('')}
              title="Limpar filtro de data"
              style={{ padding: '0 0.5rem' }}
            >
              <X size={14} />
            </button>
          )}

          <button className="btn-secondary cursor-pointer" onClick={onRefresh} title="Recarregar histórico">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card">
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw className="animate-spin" size={32} />
            <span>Carregando dados do histórico...</span>
          </div>
        ) : historyRecords.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <HelpCircle size={48} style={{ opacity: 0.3 }} />
            <span>Nenhum lote registrado para os filtros selecionados.</span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '4%' }}></th>
                  <th 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('data_producao', historySortField, setHistorySortField, historySortDir, setHistorySortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Data Produção
                      <SortIcon field="data_producao" activeField={historySortField} activeDir={historySortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '9%', cursor: 'pointer' }}
                    onClick={() => toggleSort('codigo', historySortField, setHistorySortField, historySortDir, setHistorySortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      REF
                      <SortIcon field="codigo" activeField={historySortField} activeDir={historySortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '25%', cursor: 'pointer' }}
                    onClick={() => toggleSort('descricao', historySortField, setHistorySortField, historySortDir, setHistorySortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Produto / Linha
                      <SortIcon field="descricao" activeField={historySortField} activeDir={historySortDir} />
                    </div>
                  </th>
                  <th 
                    className="numeric-col sortable-th" 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('quantidade', historySortField, setHistorySortField, historySortDir, setHistorySortDir)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      Quantidade
                      <SortIcon field="quantidade" activeField={historySortField} activeDir={historySortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => toggleSort('lote_erp', historySortField, setHistorySortField, historySortDir, setHistorySortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Lote ERP
                      <SortIcon field="lote_erp" activeField={historySortField} activeDir={historySortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '20%', cursor: 'pointer' }}
                    onClick={() => toggleSort('observacoes', historySortField, setHistorySortField, historySortDir, setHistorySortDir)}
                    className="sortable-th"
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      Observações
                      <SortIcon field="observacoes" activeField={historySortField} activeDir={historySortDir} />
                    </div>
                  </th>
                  <th style={{ width: '8%' }}>Status</th>
                  <th style={{ width: '10%' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {historyRecords.map((r) => {
                  const dateObj = new Date(r.data_producao + 'T12:00:00');
                  const formattedDate = dateObj.toLocaleDateString('pt-BR');
                  const isExpanded = expandedHistoryId === r.id;
                  const hasSnapshot = r.snap_estoque !== null && r.snap_estoque !== undefined;

                  return (
                    <React.Fragment key={r.id}>
                      <tr 
                        onClick={() => hasSnapshot && setExpandedHistoryId(isExpanded ? null : r.id)} 
                        style={{ cursor: hasSnapshot ? 'pointer' : 'default' }}
                        className={isExpanded ? 'expanded-row' : ''}
                      >
                        <td style={{ textAlign: 'center', padding: '0.35rem' }}>
                          {hasSnapshot && (
                            <ChevronDown 
                              size={14} 
                              style={{ 
                                transition: 'transform 0.2s ease', 
                                transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                opacity: 0.5 
                              }} 
                            />
                          )}
                        </td>
                        <td style={{ fontWeight: '600', color: 'hsl(var(--text-primary-hsl))' }}>
                          {formattedDate}
                        </td>
                        <td className="product-code">{r.codigo}</td>
                        <td>
                          <div className="product-desc">{r.descricao}</div>
                          <div className="product-subinfo">
                            <span>Linha: {r.nome_linha}</span>
                          </div>
                        </td>
                        <td className="numeric-col" style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                          {r.quantidade.toLocaleString()} un
                        </td>
                        <td onClick={(e) => { e.stopPropagation(); }} style={{ verticalAlign: 'middle' }}>
                          {editingId === r.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <input
                                type="text"
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveLoteErp(r.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                style={{
                                  width: '5.5rem',
                                  padding: '0.15rem 0.35rem',
                                  fontSize: '0.75rem',
                                  border: '1px solid #d4d4d8',
                                  borderRadius: '0.25rem',
                                  fontWeight: 'bold',
                                  color: '#18181b',
                                  outline: 'none'
                                }}
                                autoFocus
                              />
                              <button 
                                onClick={() => handleSaveLoteErp(r.id)}
                                style={{ background: 'none', border: 'none', padding: 0, color: 'rgb(22, 163, 74)', cursor: 'pointer', display: 'flex' }}
                                title="Confirmar"
                              >
                                <Check size={14} />
                              </button>
                              <button 
                                onClick={() => setEditingId(null)}
                                style={{ background: 'none', border: 'none', padding: 0, color: 'rgb(239, 68, 68)', cursor: 'pointer', display: 'flex' }}
                                title="Cancelar"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div 
                              onClick={() => {
                                setEditingId(r.id);
                                setEditVal(r.lote_erp || '');
                              }}
                              className="flex items-center gap-1 cursor-pointer group"
                              style={{ fontWeight: '700', color: r.lote_erp ? '#18181b' : '#a3a3a3', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
                              title="Clique para editar o Lote ERP"
                            >
                              <span>{r.lote_erp || 'Inserir Lote'}</span>
                              <Edit3 size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ marginLeft: '4px' }} />
                            </div>
                          )}
                        </td>
                        <td>
                          {r.observacoes ? (
                            <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                              {r.observacoes}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', fontStyle: 'italic' }}>
                              Sem obs.
                            </span>
                          )}
                        </td>
                        <td>
                          {r.snap_status_label ? (
                            <span className={`status-pill pill-${r.snap_status}`}>
                              {r.snap_status_label}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', fontStyle: 'italic' }}>—</span>
                          )}
                        </td>
                        <td style={{ display: 'flex', gap: '0.25rem' }}>
                          {hasSnapshot && (
                            <button 
                              className="action-btn cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setExpandedHistoryId(isExpanded ? null : r.id); }} 
                              title="Ver cenário do momento"
                              style={{ color: 'hsl(var(--primary-hsl))' }}
                            >
                              <Eye size={14} />
                            </button>
                          )}
                          <button 
                            className="action-btn cursor-pointer" 
                            onClick={(e) => { e.stopPropagation(); onDeleteHistory(r.id); }} 
                            title="Estornar Lote"
                            style={{ color: 'hsl(var(--danger-hsl))' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      {/* Expandable Snapshot Detail Row */}
                      {isExpanded && hasSnapshot && (
                        <tr className="snapshot-detail-row">
                          <td colSpan={9} style={{ padding: 0, border: 'none' }}>
                            <div className="snapshot-panel">
                              <div className="snapshot-header">
                                <Package size={14} style={{ opacity: 0.6 }} />
                                <span>Cenário do produto no momento da decisão — {formattedDate}</span>
                              </div>
                              <div className="snapshot-grid">
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Estoque Atual</div>
                                  <div className="snapshot-value">{(r.snap_estoque ?? 0).toLocaleString()} un</div>
                                </div>
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Em Produção</div>
                                  <div className="snapshot-value">{(r.snap_producao ?? 0).toLocaleString()} un</div>
                                </div>
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Pedidos Abertos</div>
                                  <div className="snapshot-value">{(r.snap_pedidos ?? 0).toLocaleString()} un</div>
                                </div>
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Estoque Futuro (EFP)</div>
                                  <div className="snapshot-value" style={{ 
                                    fontWeight: '700',
                                    color: (r.snap_efp ?? 0) <= 0 ? 'hsl(0, 65%, 45%)' : 'hsl(var(--text-primary-hsl))'
                                  }}>
                                    {(r.snap_efp ?? 0).toLocaleString()} un
                                  </div>
                                </div>
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Média Vendas/Média</div>
                                  <div className="snapshot-value">{(r.snap_media_vendas ?? 0).toFixed(1)}</div>
                                </div>
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Duração (Meses)</div>
                                  <div className="snapshot-value" style={{
                                    color: (r.snap_duracao_meses ?? 0) < 1 ? 'hsl(0, 65%, 45%)' : 'hsl(var(--text-primary-hsl))'
                                  }}>
                                    {(r.snap_duracao_meses ?? 0).toFixed(1)} m
                                  </div>
                                </div>
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Estoque Ideal</div>
                                  <div className="snapshot-value">{(r.snap_estoque_ideal_qtd ?? 0).toFixed(0)} un</div>
                                </div>
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Demanda Ajust.</div>
                                  <div className="snapshot-value">{(r.snap_demanda_ajustada ?? 0).toFixed(1)}</div>
                                </div>
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Sugestão Produção</div>
                                  <div className="snapshot-value" style={{ fontWeight: '700', color: 'hsl(var(--primary-hsl))' }}>
                                    {(r.snap_producao_recomendada ?? 0).toLocaleString()} un
                                  </div>
                                </div>
                                <div className="snapshot-item">
                                  <div className="snapshot-label">Status no Dia</div>
                                  <div className="snapshot-value">
                                    <span 
                                      className={`status-pill pill-${r.snap_status}`}
                                      style={{ fontSize: '0.7rem' }}
                                    >
                                      {r.snap_status_label ?? '—'}
                                    </span>
                                  </div>
                                </div>
                              </div>
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
      </div>
    </div>
  );
}
