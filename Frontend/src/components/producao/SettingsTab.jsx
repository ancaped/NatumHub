import React from 'react';
import { RefreshCw, Check, Trash2, UploadCloud, Search } from 'lucide-react';

export function SettingsTab({
  configs,
  diasComerciais,
  limitPerPage,
  tempDiasComerciais,
  setTempDiasComerciais,
  tempLimitPerPage,
  setTempLimitPerPage,
  onSaveGlobalSettings,
  onConfigChange,
  onConfigToggleVisivel,
  onConfigDelete,
  onConfigCreate,
  showAddLineForm,
  setShowAddLineForm,
  newLinePrefix,
  setNewLinePrefix,
  newLineName,
  setNewLineName,
  newLineIdeal,
  setNewLineIdeal,
  newLineOrdem,
  setNewLineOrdem,
  newLineProd,
  setNewLineProd,
  newLineZ,
  setNewLineZ,
  allProducts,
  bulkSearch,
  setBulkSearch,
  bulkSelected,
  setBulkSelected,
  bulkAction,
  setBulkAction,
  bulkValueStr,
  setBulkValueStr,
  bulkFilterLine,
  setBulkFilterLine,
  bulkFilterStatus,
  setBulkFilterStatus,
  bulkFilterVisibility,
  setBulkFilterVisibility,
  bulkFilterLaunch,
  setBulkFilterLaunch,
  onBulkApply,
  kitComposicao,
  kitCompNewKit,
  setKitCompNewKit,
  kitCompNewComp,
  setKitCompNewComp,
  kitCompSearch,
  setKitCompSearch,
  onAddKitComposicao,
  onDeleteKitComposicao,
  onUploadKitsConfig,
  uploadingKitsConfig
}) {

  const filteredBulkProducts = allProducts.filter(p => {
    // 1. Text Search
    const matchesSearch = (p.codigo || '').toLowerCase().includes(bulkSearch.toLowerCase()) ||
                          (p.descricao || '').toLowerCase().includes(bulkSearch.toLowerCase());
    if (!matchesSearch) return false;

    // 2. Line/Brand
    if (bulkFilterLine !== 'ALL' && p.linha_prefix !== bulkFilterLine) return false;

    // 3. Status
    if (bulkFilterStatus !== 'ALL' && p.status !== bulkFilterStatus) return false;

    // 4. Visibility
    if (bulkFilterVisibility !== 'ALL') {
      const isVisible = p.visivel !== 0;
      if (bulkFilterVisibility === 'visivel' && !isVisible) return false;
      if (bulkFilterVisibility === 'oculto' && isVisible) return false;
    }

    // 5. Launch status
    if (bulkFilterLaunch !== 'ALL') {
      const isLaunch = p.is_lancamento;
      if (bulkFilterLaunch === 'lancamento' && !isLaunch) return false;
      if (bulkFilterLaunch === 'regular' && isLaunch) return false;
    }

    return true;
  });

  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="view-header">
        <h2 className="view-title">Configurações do Sistema</h2>
        <p className="view-subtitle">
          Ajuste limiares de linha, parâmetros de conversão global e backups na nuvem.
        </p>
      </div>

      <div className="settings-grid">
        
        {/* 1. Global Settings Card */}
        <div className="panel-card text-left">
          <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '1rem', color: 'hsl(var(--text-primary-hsl))' }}>Parâmetros Globais</h3>
          <form onSubmit={onSaveGlobalSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Dias Comerciais por Mês</label>
              <input 
                type="number" 
                className="form-control text-zinc-900 font-bold" 
                value={tempDiasComerciais}
                onChange={(e) => setTempDiasComerciais(parseInt(e.target.value, 10) || '')}
                style={{ marginTop: '0.25rem' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: '0.25rem', display: 'block' }}>
                Usado para converter os meses ideais e alertas de duração em dias na tabela.
              </span>
            </div>

            <div className="form-group">
              <label>Itens por Página (Tabela)</label>
              <input 
                type="number" 
                className="form-control text-zinc-900 font-bold" 
                value={tempLimitPerPage}
                onChange={(e) => setTempLimitPerPage(parseInt(e.target.value, 10) || '')}
                style={{ marginTop: '0.25rem' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: '0.25rem', display: 'block' }}>
                Define o limite de paginação dinâmico enviado à API local de estoque.
              </span>
            </div>

            <button type="submit" className="btn-primary cursor-pointer" style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
              Salvar Parâmetros Globais
            </button>
          </form>
        </div>

        {/* 3. Line Configs Panel (Spans full width below) */}
        <div className="panel-card full-width-card text-left">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.25rem', color: 'hsl(var(--text-primary-hsl))' }}>Configurações por Linha de Produto</h3>
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                Defina fatores de segurança Z e multiplicadores de estoque em meses para alertas de produção em cada linha específica.
              </p>
            </div>
            <button 
              type="button" 
              className="btn-primary cursor-pointer" 
              onClick={() => setShowAddLineForm(!showAddLineForm)}
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
            >
              {showAddLineForm ? 'Fechar Formulário' : 'Nova Linha de Produto'}
            </button>
          </div>

          {/* Add New Line Form */}
          {showAddLineForm && (
            <form onSubmit={onConfigCreate} style={{ 
              backgroundColor: 'hsl(var(--background-hsl))',
              border: '1px solid hsl(var(--card-border-hsl))',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              marginBottom: '1.25rem',
              animation: 'fadeIn 0.15s ease-out'
            }}>
              <h4 style={{ fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.75rem', color: 'hsl(var(--text-primary-hsl))' }}>Cadastrar Nova Linha de Produto</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', fontSize: '0.7rem' }}>
                <div>
                  <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Prefixo Numérico (ex: 8)</label>
                  <input 
                    type="text" 
                    className="form-control text-zinc-900"
                    value={newLinePrefix}
                    onChange={(e) => setNewLinePrefix(e.target.value)}
                    placeholder="Prefixo do código..."
                    style={{ height: '32px', fontSize: '0.75rem', marginTop: '0.2rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Nome da Linha (ex: Liss Curls)</label>
                  <input 
                    type="text" 
                    className="form-control text-zinc-900"
                    value={newLineName}
                    onChange={(e) => setNewLineName(e.target.value)}
                    placeholder="Nome comercial..."
                    style={{ height: '32px', fontSize: '0.75rem', marginTop: '0.2rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Estoque Ideal (meses)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="form-control text-zinc-900"
                    value={newLineIdeal}
                    onChange={(e) => setNewLineIdeal(e.target.value)}
                    style={{ height: '32px', fontSize: '0.75rem', marginTop: '0.2rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Segurança Z (σ)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="form-control text-zinc-900"
                    value={newLineZ}
                    onChange={(e) => setNewLineZ(e.target.value)}
                    style={{ height: '32px', fontSize: '0.75rem', marginTop: '0.2rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Ordem (meses)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="form-control text-zinc-900"
                    value={newLineOrdem}
                    onChange={(e) => setNewLineOrdem(e.target.value)}
                    style={{ height: '32px', fontSize: '0.75rem', marginTop: '0.2rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Produção (meses)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="form-control text-zinc-900"
                    value={newLineProd}
                    onChange={(e) => setNewLineProd(e.target.value)}
                    style={{ height: '32px', fontSize: '0.75rem', marginTop: '0.2rem' }}
                  />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn-secondary cursor-pointer" 
                  onClick={() => setShowAddLineForm(false)}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn-primary cursor-pointer"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem' }}
                >
                  Salvar Nova Linha
                </button>
              </div>
            </form>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {configs.map((config) => (
              <div key={config.linha_prefix} className="line-item-card text-left" style={{ opacity: config.visivel === 0 ? 0.6 : 1, transition: 'opacity 0.15s ease' }}>
                <div className="line-item-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'hsl(var(--text-primary-hsl))', fontWeight: '600' }}>{config.nome_linha}</span>
                    <span style={{ color: 'hsl(var(--text-secondary-hsl))', fontSize: '0.65rem' }}>REF: {config.linha_prefix}.*</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => onConfigToggleVisivel(config.linha_prefix, config.visivel)}
                      title={config.visivel !== 0 ? "Linha ativa (aparece nas abas). Clique para desativar." : "Linha inativa (oculta nas abas). Clique para ativar."}
                      style={{ 
                        fontSize: '0.6rem',
                        padding: '2px 6px',
                        border: '1px solid hsl(var(--card-border-hsl))',
                        borderRadius: '4px',
                        backgroundColor: config.visivel !== 0 ? 'rgba(34, 197, 94, 0.08)' : 'hsl(var(--card-hsl))',
                        color: config.visivel !== 0 ? 'hsl(var(--success-hsl))' : 'hsl(var(--text-secondary-hsl))',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {config.visivel !== 0 ? 'Ativa' : 'Oculta'}
                    </button>

                    {config.linha_prefix !== 'DEFAULT' && (
                      <button
                        type="button"
                        onClick={() => onConfigDelete(config.linha_prefix)}
                        title="Excluir Linha de Produto"
                        style={{ 
                          color: 'hsl(var(--danger-hsl))', 
                          padding: '4px',
                          borderRadius: '4px',
                          border: '1px solid hsl(var(--card-border-hsl))',
                          backgroundColor: 'hsl(var(--card-hsl))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.65rem' }}>
                  <div>
                    <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Ideal (meses)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control-compact text-zinc-900"
                      value={config.estoque_ideal_mult}
                      onChange={(e) => onConfigChange(config.linha_prefix, 'estoque_ideal_mult', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Segurança Z (σ)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control-compact text-zinc-900"
                      value={config.fator_seguranca_z}
                      onChange={(e) => onConfigChange(config.linha_prefix, 'fator_seguranca_z', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Ordem (meses)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control-compact text-zinc-900"
                      value={config.abrir_ordem_mult}
                      onChange={(e) => onConfigChange(config.linha_prefix, 'abrir_ordem_mult', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Produção (meses)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control-compact text-zinc-900"
                      value={config.abrir_prod_mult}
                      onChange={(e) => onConfigChange(config.linha_prefix, 'abrir_prod_mult', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Ações em Massa por Produto Panel (Spans full width below) */}
        <div className="panel-card full-width-card text-left" style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.25rem', color: 'hsl(var(--text-primary-hsl))' }}>Ações em Massa por Produto</h3>
          <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: '1.25rem' }}>
            Selecione múltiplos produtos de uma só vez para alterar visibilidade, status de lançamento, observações ou linha em lote.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
            {/* Left side: Product Checklist */}
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))', marginBottom: '0.25rem', display: 'block' }}>
                  Filtros de Seleção Inteligente
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.4rem' }}>
                  {/* 1. Busca */}
                  <div className="search-input-wrapper" style={{ height: '32px' }}>
                    <Search size={14} />
                    <input 
                      type="text" 
                      placeholder="Buscar..." 
                      className="search-input"
                      value={bulkSearch}
                      onChange={(e) => setBulkSearch(e.target.value)}
                      style={{ padding: '0.3rem 0.5rem 0.3rem 2rem', fontSize: '0.75rem', height: '100%' }}
                    />
                  </div>

                  {/* 2. Linha */}
                  <select 
                    className="select-filter"
                    value={bulkFilterLine}
                    onChange={(e) => setBulkFilterLine(e.target.value)}
                    style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.5rem' }}
                  >
                    <option value="ALL">Todas as Linhas</option>
                    {configs.map(c => (
                      <option key={c.linha_prefix} value={c.linha_prefix}>{c.nome_linha}</option>
                    ))}
                  </select>

                  {/* 3. Status */}
                  <select 
                    className="select-filter"
                    value={bulkFilterStatus}
                    onChange={(e) => setBulkFilterStatus(e.target.value)}
                    style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.5rem' }}
                  >
                    <option value="ALL">Todos os Alertas</option>
                    <option value="critico">Crítico: Produzir</option>
                    <option value="ordem">Abrir Ordem</option>
                    <option value="saudavel">Estoque OK</option>
                    <option value="abundante">Abundante</option>
                  </select>

                  {/* 4. Visibilidade */}
                  <select 
                    className="select-filter"
                    value={bulkFilterVisibility}
                    onChange={(e) => setBulkFilterVisibility(e.target.value)}
                    style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.5rem' }}
                  >
                    <option value="ALL">Todas Visibilidades</option>
                    <option value="visivel">Visíveis</option>
                    <option value="oculto">Ocultos</option>
                  </select>

                  {/* 5. Lançamento */}
                  <select 
                    className="select-filter"
                    value={bulkFilterLaunch}
                    onChange={(e) => setBulkFilterLaunch(e.target.value)}
                    style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.5rem' }}
                  >
                    <option value="ALL">Tipos (Lanç./Reg.)</option>
                    <option value="lancamento">Lançamentos</option>
                    <option value="regular">Regulares</option>
                  </select>
                </div>
              </div>

              {/* Checklist Box Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: '0.5rem', fontWeight: '600' }}>
                <span>
                  {bulkSelected.length} selecionado(s) de {filteredBulkProducts.length} filtrado(s)
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button 
                    type="button"
                    className="btn-secondary cursor-pointer"
                    onClick={() => {
                      const matchingCodes = filteredBulkProducts.map(p => p.codigo);
                      setBulkSelected(prev => Array.from(new Set([...prev, ...matchingCodes])));
                    }}
                    style={{ padding: '2px 8px', fontSize: '0.65rem', height: 'auto', border: '1px solid hsl(var(--card-border-hsl))', borderRadius: '4px', backgroundColor: 'hsl(var(--card-hsl))' }}
                  >
                    Selecionar Todos Filtrados
                  </button>
                  <button 
                    type="button"
                    className="btn-secondary cursor-pointer"
                    onClick={() => setBulkSelected([])}
                    style={{ padding: '2px 8px', fontSize: '0.65rem', height: 'auto', border: '1px solid hsl(var(--card-border-hsl))', borderRadius: '4px', backgroundColor: 'hsl(var(--card-hsl))' }}
                  >
                    Desmarcar Todos
                  </button>
                </div>
              </div>

              {/* Scrollable list */}
              <div style={{ 
                maxHeight: '280px', 
                overflowY: 'auto', 
                border: '1px solid hsl(var(--card-border-hsl))', 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'hsl(var(--background-hsl))',
                padding: '0.5rem'
              }}>
                {filteredBulkProducts.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', fontSize: '0.75rem' }}>
                    Nenhum produto encontrado.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {filteredBulkProducts.map(p => {
                      const isChecked = bulkSelected.includes(p.codigo);
                      return (
                        <label 
                          key={p.codigo} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            fontSize: '0.75rem', 
                            padding: '0.3rem 0.5rem', 
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: isChecked ? 'rgba(0, 0, 0, 0.03)' : 'transparent',
                            transition: 'background-color 0.15s ease'
                          }}
                          className="bulk-product-row"
                        >
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBulkSelected(prev => [...prev, p.codigo]);
                              } else {
                                setBulkSelected(prev => prev.filter(c => c !== p.codigo));
                              }
                            }}
                            style={{ accentColor: 'hsl(var(--primary-hsl))' }}
                          />
                          <div style={{ display: 'flex', flex: '1', justifyContent: 'space-between', alignItems: 'center', minWidth: 0 }}>
                            <span style={{ fontWeight: '600', color: 'hsl(var(--text-primary-hsl))', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {p.codigo} - {p.descricao}
                            </span>
                            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                              {p.visivel === 0 && <span className="hidden-badge">Oculto</span>}
                              {p.is_lancamento && <span className="lancamento-badge" style={{ fontSize: '0.6rem', padding: '1px 4px' }}>Lançamento</span>}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right side: Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '1px solid hsl(var(--card-border-hsl))', paddingLeft: '2rem' }}>
              <div className="form-group">
                <label>Escolher Ação em Lote</label>
                <select 
                  className="form-control text-zinc-900"
                  value={bulkAction}
                  onChange={(e) => {
                    setBulkAction(e.target.value);
                    setBulkValueStr(''); // Clear value on action change
                  }}
                  style={{ marginTop: '0.25rem' }}
                >
                  <option value="hide">Ocultar Produtos Selecionados</option>
                  <option value="show">Tornar Produtos Visíveis</option>
                  <option value="set_launch_yes">Forçar como Lançamento (Desvio Zero)</option>
                  <option value="set_launch_no">Forçar como Produto Regular</option>
                  <option value="set_launch_auto">Retornar Lançamento para Automático</option>
                  <option value="set_obs">Adicionar Observação de Produção</option>
                  <option value="set_line">Alterar Linha de Produto</option>
                </select>
              </div>

              {/* Conditional input based on action */}
              {bulkAction === 'set_obs' && (
                <div className="form-group" style={{ animation: 'fadeIn 0.15s ease-out' }}>
                  <label>Escrever Observação para Todos</label>
                  <textarea 
                    className="form-control text-zinc-900"
                    placeholder="Exemplo: Produzir apenas sob encomenda/pedido em carteira..."
                    value={bulkValueStr}
                    onChange={(e) => setBulkValueStr(e.target.value)}
                    rows={3}
                    style={{ marginTop: '0.25rem', resize: 'vertical' }}
                  />
                </div>
              )}

              {bulkAction === 'set_line' && (
                <div className="form-group" style={{ animation: 'fadeIn 0.15s ease-out' }}>
                  <label>Escolher Nova Linha de Produto</label>
                  <select 
                    className="form-control text-zinc-900"
                    value={bulkValueStr}
                    onChange={(e) => setBulkValueStr(e.target.value)}
                    style={{ marginTop: '0.25rem' }}
                  >
                    <option value="">Selecione uma linha...</option>
                    <option value="AUTO">Automático (Mapeamento padrão por código)</option>
                    {configs.map((c) => (
                      <option key={c.linha_prefix} value={c.linha_prefix}>
                        {c.nome_linha} ({c.linha_prefix})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: '0.75rem' }}>
                  Essa ação será aplicada a <strong>{bulkSelected.length}</strong> produtos selecionados de forma definitiva e em lote.
                </div>
                <button 
                  className="btn-primary cursor-pointer" 
                  onClick={onBulkApply}
                  disabled={bulkSelected.length === 0}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Aplicar Ação em Lote
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Composição de Kits Panel (Spans full width below) */}
        <div className="panel-card full-width-card text-left" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.25rem', color: 'hsl(var(--text-primary-hsl))' }}>Composição de Kits Comerciais</h3>
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                Gerencie a relação entre os kits comerciais e seus componentes individuais.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label className="btn-secondary cursor-pointer" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
                <UploadCloud size={14} />
                {uploadingKitsConfig ? 'Enviando...' : 'Importar Planilha Excel'}
                <input 
                  type="file" 
                  accept=".xlsx" 
                  style={{ display: 'none' }} 
                  onChange={onUploadKitsConfig}
                  disabled={uploadingKitsConfig}
                />
              </label>
            </div>
          </div>

          {/* Add New Kit Composition Item Form */}
          <div style={{ 
            backgroundColor: 'hsl(var(--background-hsl))',
            border: '1px solid hsl(var(--card-border-hsl))',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: '700', marginBottom: '0.75rem', color: 'hsl(var(--text-primary-hsl))' }}>Adicionar Nova Relação</h4>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'end' }}>
              <div style={{ flex: '1', minWidth: '150px' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Código do Kit</label>
                <input 
                  type="text" 
                  className="form-control text-zinc-900"
                  placeholder="Ex: KIT001"
                  value={kitCompNewKit}
                  onChange={(e) => setKitCompNewKit(e.target.value)}
                  style={{ height: '32px', fontSize: '0.75rem', marginTop: '0.2rem' }}
                />
              </div>
              <div style={{ flex: '1', minWidth: '150px' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: '600', color: 'hsl(var(--text-secondary-hsl))' }}>Código do Componente</label>
                <input 
                  type="text" 
                  className="form-control text-zinc-900"
                  placeholder="Ex: COMP001"
                  value={kitCompNewComp}
                  onChange={(e) => setKitCompNewComp(e.target.value)}
                  style={{ height: '32px', fontSize: '0.75rem', marginTop: '0.2rem' }}
                />
              </div>
              <button 
                type="button" 
                onClick={onAddKitComposicao}
                className="btn-primary cursor-pointer"
                style={{ height: '32px', fontSize: '0.75rem', padding: '0 1rem' }}
              >
                Vincular Componente
              </button>
            </div>
          </div>

          {/* Search and Table of Compositions */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div className="search-input-wrapper" style={{ height: '32px', maxWidth: '300px' }}>
              <Search size={14} />
              <input 
                type="text" 
                placeholder="Buscar por Kit ou Componente..." 
                className="search-input text-zinc-900"
                value={kitCompSearch}
                onChange={(e) => setKitCompSearch(e.target.value)}
                style={{ padding: '0.3rem 0.5rem 0.3rem 2rem', fontSize: '0.75rem', height: '100%' }}
              />
            </div>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Código do Kit</th>
                  <th>Código do Componente</th>
                  <th style={{ width: '10%' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {kitComposicao.filter(row => 
                  (row.kit_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                  (row.componente_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase())
                ).length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', padding: '2rem' }}>
                      Nenhuma relação de composição encontrada.
                    </td>
                  </tr>
                ) : (
                  kitComposicao.filter(row => 
                    (row.kit_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                    (row.componente_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase())
                  ).map((row) => (
                    <tr key={`${row.kit_codigo}-${row.componente_codigo}`}>
                      <td style={{ fontWeight: '600' }}>{row.kit_codigo}</td>
                      <td>{row.componente_codigo}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => onDeleteKitComposicao(row.kit_codigo, row.componente_codigo)}
                          className="action-btn text-danger cursor-pointer"
                          title="Remover Vinculação"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
