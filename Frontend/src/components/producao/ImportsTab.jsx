import React from 'react';
import { UploadCloud, Check, Clock, FolderOpen, RefreshCw, X, Database } from 'lucide-react';

export function ImportsTab({
  importStatus,
  importHistory,
  watchConfig,
  setWatchConfig,
  onSaveWatchConfig,
  onFileUpload,
  uploadingLev,
  uploadingFat,
  syncingDb,
  onSyncDatabase,
  onRefresh
}) {
  const lastSync = importHistory.find(h => h.tipo === 'sync');

  return (
    <div className="view-container animate-in fade-in duration-200">
      <style>{`
        @keyframes loading-bar-anim {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        .animate-spin {
          animation: spin 1.2s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="view-header">
        <h2 className="view-title">Importação de Planilhas ERP</h2>
        <p className="view-subtitle">
          Importe planilhas manualmente ou configure a pasta monitorada para que o sistema atualize automaticamente as informações de estoques e faturamento.
        </p>
      </div>

      {/* Sincronização SQL Server Real-time Section */}
      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.75rem', color: 'hsl(var(--text-primary-hsl))' }}>Sincronização em Tempo Real (Offline-First)</h3>
      <div className="panel-card" style={{
        padding: '1.25rem',
        marginBottom: '1.5rem',
        background: 'linear-gradient(135deg, rgba(24, 24, 27, 0.95) 0%, rgba(39, 39, 42, 0.95) 100%)',
        color: '#ffffff',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: '-20px',
          right: '-20px',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: syncingDb ? 'rgba(59, 130, 246, 0.15)' : lastSync?.status === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          filter: 'blur(25px)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '280px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}>
              <Database size={20} />
            </div>
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: '700', margin: 0 }}>Banco de Dados Local (SQLite Buffer)</h4>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.65)', margin: '0.1rem 0 0' }}>
                O sistema funciona Offline-First. Acesse e trabalhe com os dados do buffer mesmo sem conexão com o servidor.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <div>
                <strong>Última Sincronização:</strong>{' '}
                <span style={{ color: lastSync?.status === 'success' ? '#34d399' : lastSync?.status === 'error' ? '#f87171' : 'rgba(255, 255, 255, 0.5)' }}>
                  {lastSync?.importado_em ? new Date(lastSync.importado_em.replace(' ', 'T')).toLocaleString('pt-BR') : 'Nunca'}
                </span>
              </div>
              <div>
                <strong>Status:</strong>{' '}
                <span style={{
                  color: lastSync?.status === 'success' ? '#34d399' : lastSync?.status === 'error' ? '#f87171' : 'rgba(255, 255, 255, 0.5)',
                  fontWeight: '600'
                }}>
                  {lastSync?.status === 'success' ? 'Sucesso' : lastSync?.status === 'error' ? 'Erro na Conexão' : 'Sem Informações'}
                </span>
              </div>
              {lastSync?.mensagem && (
                <div style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.55)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lastSync.mensagem}>
                  {lastSync.mensagem}
                </div>
              )}
            </div>

            <button
              onClick={onSyncDatabase}
              disabled={syncingDb}
              className={`btn-primary cursor-pointer ${syncingDb ? 'opacity-75' : ''}`}
              style={{
                height: '40px',
                padding: '0 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: '600',
                backgroundColor: '#ffffff',
                color: '#18181b',
                border: 'none',
                borderRadius: '6px',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
              }}
              onMouseEnter={(e) => { if (!syncingDb) { e.currentTarget.style.backgroundColor = '#e4e4e7'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
              onMouseLeave={(e) => { if (!syncingDb) { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.transform = 'none'; } }}
            >
              <RefreshCw size={16} className={syncingDb ? 'animate-spin' : ''} />
              {syncingDb ? 'Sincronizando...' : 'Sincronizar Agora'}
            </button>
          </div>
        </div>

        {syncingDb && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: '3px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            overflow: 'hidden'
          }}>
            <div style={{
              width: '40%',
              height: '100%',
              backgroundColor: '#3b82f6',
              borderRadius: '2px',
              animation: 'loading-bar-anim 1.5s infinite ease-in-out'
            }} />
          </div>
        )}
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
