import React from 'react';
import { LayoutDashboard, AlertTriangle, Sliders, CheckCircle2, Info } from 'lucide-react';

export function DashboardTab({
  stats,
  totalItems,
  bases,
  productsLength,
  setCurrentView,
  setSelectedStatus,
  setSelectedBase
}) {
  const totalStats = stats.critico + stats.ordem + stats.saudavel + stats.abundante;
  const pctCritico = totalStats > 0 ? (stats.critico / totalStats) * 100 : 0;
  const pctOrdem = totalStats > 0 ? (stats.ordem / totalStats) * 100 : 0;
  const pctSaudavel = totalStats > 0 ? (stats.saudavel / totalStats) * 100 : 0;
  const pctAbundante = totalStats > 0 ? (stats.abundante / totalStats) * 100 : 0;

  return (
    <div className="view-container animate-in fade-in duration-200">
      {/* Summary KPIs */}
      <section className="summary-grid">
        <div 
          className="summary-card critico" 
          onClick={() => { setCurrentView('inventory'); setSelectedStatus('critico'); }} 
          style={{ cursor: 'pointer' }}
        >
          <div className="card-header">
            <span className="card-title">Produzir Urgente</span>
            <div className="card-icon">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="card-value">{stats.critico}</div>
          <div className="card-subtitle">Itens com estoque abaixo do crítico</div>
        </div>

        <div 
          className="summary-card ordem" 
          onClick={() => { setCurrentView('inventory'); setSelectedStatus('ordem'); }} 
          style={{ cursor: 'pointer' }}
        >
          <div className="card-header">
            <span className="card-title">Abrir Ordem</span>
            <div className="card-icon">
              <Sliders size={20} />
            </div>
          </div>
          <div className="card-value">{stats.ordem}</div>
          <div className="card-subtitle">Produtos no limite de segurança</div>
        </div>

        <div 
          className="summary-card saudavel" 
          onClick={() => { setCurrentView('inventory'); setSelectedStatus('saudavel'); }} 
          style={{ cursor: 'pointer' }}
        >
          <div className="card-header">
            <span className="card-title">Estoque Saudável</span>
            <div className="card-icon">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="card-value">{stats.saudavel}</div>
          <div className="card-subtitle">Produtos com estoque ideal</div>
        </div>

        <div 
          className="summary-card lancamento" 
          onClick={() => { setCurrentView('inventory'); setSelectedStatus('ALL'); setSelectedBase('ALL'); }} 
          style={{ cursor: 'pointer' }}
        >
          <div className="card-header">
            <span className="card-title">Novos Lançamentos</span>
            <div className="card-icon">
              <Info size={20} />
            </div>
          </div>
          <div className="card-value">{stats.lancamentos}</div>
          <div className="card-subtitle">Sem vendas históricas 2025</div>
        </div>
      </section>

      {/* Status Distribution & System Health */}
      <div className="dashboard-grid">
        {/* Distribution chart panel */}
        <div className="panel-card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '1rem', color: 'hsl(var(--text-primary-hsl))' }}>
            Distribuição de Alertas
          </h3>
          
          {totalStats > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ height: '24px', display: 'flex', borderRadius: '6px', overflow: 'hidden', backgroundColor: 'hsl(var(--card-border-hsl))' }}>
                {stats.critico > 0 && <div style={{ width: `${pctCritico}%`, backgroundColor: 'hsl(var(--danger-hsl))' }} title={`Crítico: ${stats.critico}`} />}
                {stats.ordem > 0 && <div style={{ width: `${pctOrdem}%`, backgroundColor: 'hsl(var(--warning-hsl))' }} title={`Ordem: ${stats.ordem}`} />}
                {stats.saudavel > 0 && <div style={{ width: `${pctSaudavel}%`, backgroundColor: 'hsl(var(--success-hsl))' }} title={`Saudável: ${stats.saudavel}`} />}
                {stats.abundante > 0 && <div style={{ width: `${pctAbundante}%`, backgroundColor: 'hsl(var(--info-hsl))' }} title={`Abundante: ${stats.abundante}`} />}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'hsl(var(--danger-hsl))' }}></span>
                  <span>Crítico: {stats.critico} ({pctCritico.toFixed(0)}%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'hsl(var(--warning-hsl))' }}></span>
                  <span>Abrir Ordem: {stats.ordem} ({pctOrdem.toFixed(0)}%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'hsl(var(--success-hsl))' }}></span>
                  <span>Estoque OK: {stats.saudavel} ({pctSaudavel.toFixed(0)}%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'hsl(var(--info-hsl))' }}></span>
                  <span>Abundante: {stats.abundante} ({pctAbundante.toFixed(0)}%)</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              Nenhum dado cadastrado. Por favor, importe as planilhas para visualizar estatísticas.
            </div>
          )}
        </div>

        {/* System Status Panel */}
        <div className="panel-card">
          <h3 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '1rem', color: 'hsl(var(--text-primary-hsl))' }}>
            Status dos Insumos
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid hsl(var(--card-border-hsl))' }}>
              <span style={{ color: 'hsl(var(--text-secondary-hsl))' }}>Total de Insumos Registrados:</span>
              <strong style={{ color: 'hsl(var(--text-primary-hsl))' }}>{stats.total_visible ?? (totalItems || productsLength)} itens</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid hsl(var(--card-border-hsl))' }}>
              <span style={{ color: 'hsl(var(--text-secondary-hsl))' }}>Bases de fragrância ativas:</span>
              <strong style={{ color: 'hsl(var(--text-primary-hsl))' }}>{bases.length} bases mapeadas</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
