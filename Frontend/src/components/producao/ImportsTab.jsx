import React from 'react';
import { UploadCloud, Check, Clock, FolderOpen, RefreshCw, X } from 'lucide-react';

export function ImportsTab({
  importStatus,
  importHistory,
  watchConfig,
  setWatchConfig,
  onSaveWatchConfig,
  onFileUpload,
  uploadingLev,
  uploadingFat,
  onRefresh
}) {
  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="view-header">
        <h2 className="view-title">Importação de Planilhas ERP</h2>
        <p className="view-subtitle">
          Importe planilhas manualmente ou configure a pasta monitorada para que o sistema atualize automaticamente as informações de estoques e faturamento.
        </p>
      </div>

      {/* Manual Upload Section */}
      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.75rem', color: 'hsl(var(--text-primary-hsl))' }}>Importação Manual</h3>
      <section className="upload-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <label className="upload-card cursor-pointer" style={{ minHeight: '180px' }}>
          <input 
            type="file" 
            accept=".xlsx" 
            style={{ display: 'none' }} 
            onChange={(e) => onFileUpload(e, 'levantamento')}
            disabled={uploadingLev}
          />
          <UploadCloud size={40} className="upload-icon" />
          <div className="upload-title" style={{ fontSize: '1.05rem', marginTop: '0.5rem' }}>Levantamento de Produção</div>
          <div className="upload-desc" style={{ maxWidth: '300px', margin: '0.25rem auto 0' }}>
            Contém estoques atuais, produção ativa, pedidos em aberto e classificação de bases
          </div>
          {uploadingLev && <div className="upload-progress" style={{ width: '100%' }}></div>}
        </label>

        <label className="upload-card cursor-pointer" style={{ minHeight: '180px' }}>
          <input 
            type="file" 
            accept=".xlsx" 
            style={{ display: 'none' }} 
            onChange={(e) => onFileUpload(e, 'faturamento')}
            disabled={uploadingFat}
          />
          <UploadCloud size={40} className="upload-icon" />
          <div className="upload-title" style={{ fontSize: '1.05rem', marginTop: '0.5rem' }}>Faturamento Anual 2025</div>
          <div className="upload-desc" style={{ maxWidth: '300px', margin: '0.25rem auto 0' }}>
            Histórico de faturamento de vendas de 12 meses (Janeiro a Dezembro) para calcular desvio padrão
          </div>
          {uploadingFat && <div className="upload-progress" style={{ width: '100%' }}></div>}
        </label>
      </section>

      {/* Status and Alerts Section */}
      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginTop: '1.5rem', marginBottom: '0.5rem', color: 'hsl(var(--text-primary-hsl))' }}>Status das Importações & Alertas</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {['levantamento', 'faturamento'].map((tipo) => {
          const status = importStatus.find(s => s.tipo === tipo) || { tipo, ultimo_arquivo: null, importado_em: null, dias_sem_importar: null };
          const threshold = tipo === 'levantamento' ? watchConfig.threshold_levantamento_dias : watchConfig.threshold_faturamento_dias;
          const label = tipo === 'levantamento' ? 'Levantamento de Produção' : 'Faturamento Anual';
          
          let isOverdue = false;
          let statusText = 'Atualizado';
          let badgeClass = 'saudavel';
          
          if (!status.importado_em) {
            isOverdue = true;
            statusText = 'Nunca Importado';
            badgeClass = 'critico';
          } else if ((status.dias_sem_importar ?? 999) > threshold) {
            isOverdue = true;
            statusText = `Atrasado (${status.dias_sem_importar} dias)`;
            badgeClass = 'critico';
          } else {
            statusText = `Atualizado (${status.dias_sem_importar} dias)`;
          }

          return (
            <div key={tipo} className="panel-card" style={{
              borderLeft: `4px solid ${isOverdue ? 'hsl(var(--danger-hsl))' : 'hsl(var(--success-hsl))'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              padding: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{label}</span>
                <span className={`status-badge ${badgeClass}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                  {statusText}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.5rem' }}>
                <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}><strong>Último arquivo:</strong> {status.ultimo_arquivo || 'Nenhum'}</div>
                <div><strong>Importado em:</strong> {status.importado_em ? new Date(status.importado_em.replace(' ', 'T')).toLocaleString('pt-BR') : 'Nunca'}</div>
                <div><strong>Limite tolerado:</strong> {threshold} dias</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Automatic Folder Watching Config */}
      <div className="panel-card full-width-card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <FolderOpen size={18} style={{ color: 'hsl(var(--primary-hsl))' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'hsl(var(--text-primary-hsl))', margin: 0 }}>Monitoramento Automático de Pasta</h3>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: '1rem' }}>
          O sistema monitora a pasta definida abaixo para importar automaticamente novas planilhas adicionadas que sigam os padrões de nome.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); onSaveWatchConfig(watchConfig); }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <div className="form-group">
            <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Pasta a Monitorar (Caminho ou Pasta Base)</label>
            <input 
              type="text" 
              className="form-control text-zinc-900" 
              value={watchConfig.pasta}
              onChange={(e) => setWatchConfig({ ...watchConfig, pasta: e.target.value })}
              placeholder="Ex: PlanilhasBase"
              style={{ height: '36px', marginTop: '0.25rem' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Alerta Levantamento (Dias sem importar)</label>
            <input 
              type="number" 
              className="form-control text-zinc-900 font-bold" 
              value={watchConfig.threshold_levantamento_dias}
              onChange={(e) => setWatchConfig({ ...watchConfig, threshold_levantamento_dias: parseInt(e.target.value, 10) || 7 })}
              style={{ height: '36px', marginTop: '0.25rem' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Alerta Faturamento (Dias sem importar)</label>
            <input 
              type="number" 
              className="form-control text-zinc-900 font-bold" 
              value={watchConfig.threshold_faturamento_dias}
              onChange={(e) => setWatchConfig({ ...watchConfig, threshold_faturamento_dias: parseInt(e.target.value, 10) || 30 })}
              style={{ height: '36px', marginTop: '0.25rem' }}
            />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '36px' }}>
            <input 
              type="checkbox" 
              id="watch-config-ativo"
              checked={watchConfig.ativo}
              onChange={(e) => setWatchConfig({ ...watchConfig, ativo: e.target.checked })}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="watch-config-ativo" style={{ fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}>Monitoramento Ativo</label>
          </div>
          <button type="submit" className="btn-primary cursor-pointer" style={{ height: '36px', justifyContent: 'center' }}>
            <Check size={16} style={{ marginRight: '4px' }} /> Salvar Configuração
          </button>
        </form>
      </div>

      {/* Import History Section */}
      <div className="panel-card full-width-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Clock size={18} style={{ color: 'hsl(var(--primary-hsl))' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'hsl(var(--text-primary-hsl))', margin: 0 }}>Histórico de Importações Recentes</h3>
        </div>
        <div className="table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '20%' }}>Data/Hora</th>
                <th style={{ width: '15%' }}>Tipo</th>
                <th style={{ width: '35%' }}>Arquivo</th>
                <th style={{ width: '10%' }} className="numeric-col">Itens</th>
                <th style={{ width: '10%' }}>Status</th>
                <th style={{ width: '10%' }}>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {importHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', padding: '2rem' }}>
                    Nenhuma importação registrada no histórico.
                  </td>
                </tr>
              ) : (
                importHistory.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontSize: '0.75rem' }}>{new Date(h.importado_em.replace(' ', 'T')).toLocaleString('pt-BR')}</td>
                    <td>
                      <span style={{
                        textTransform: 'capitalize',
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: '600',
                        backgroundColor: h.tipo === 'kits' ? 'rgba(59, 130, 246, 0.1)' : h.tipo === 'levantamento' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: h.tipo === 'kits' ? '#2563eb' : h.tipo === 'levantamento' ? '#059669' : '#d97706'
                      }}>
                        {h.tipo}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{h.nome_arquivo}</td>
                    <td className="numeric-col" style={{ fontSize: '0.75rem', fontWeight: '700' }}>{h.registros}</td>
                    <td>
                      <span className={`status-badge ${h.status === 'sucesso' || h.status === 'success' ? 'saudavel' : 'critico'}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                        {h.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))' }} title={h.mensagem}>
                      {h.mensagem || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
