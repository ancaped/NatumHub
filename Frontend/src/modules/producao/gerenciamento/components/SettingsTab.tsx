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
  ignoredStatuses = [],
  onSaveIgnoredStatuses = () => {},
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
  uploadingKitsConfig,
  recalcProd,
  setRecalcProd,
  recalcIng,
  setRecalcIng,
  recalcIngredients,
  recalcPreview,
  setRecalcPreview,
  recalcLoading,
  onPreviewRecalc,
  onApplyRecalc
}) {  return (
    <div className="view-container animate-in fade-in duration-200">
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

        {/* 2. Recalculation Tool Card */}
        <div className="panel-card text-left">
          <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.25rem', color: 'hsl(var(--text-primary-hsl))' }}>Recálculo de Embalagem Retrospectivo</h3>
          <p style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: '1rem' }}>
            Ao adicionar uma embalagem a um produto que já vinha sendo produzido, utilize esta ferramenta para calcular a quantidade total produzida no passado e ajustar retroativamente o estoque da embalagem.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.75rem' }}>
            <div className="form-group">
              <label>Selecionar Produto Acabado</label>
              <select 
                className="form-control text-zinc-900"
                value={recalcProd}
                onChange={(e) => {
                  setRecalcProd(e.target.value);
                  setRecalcIng('');
                  setRecalcPreview(null);
                }}
                style={{ marginTop: '0.25rem', height: '36px' }}
              >
                <option value="">Selecione um produto...</option>
                {allProducts.map(p => (
                  <option key={p.codigo} value={p.codigo}>{p.codigo} — {p.descricao}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Selecionar Insumo / Embalagem</label>
              <select 
                className="form-control text-zinc-950"
                value={recalcIng}
                onChange={(e) => {
                  setRecalcIng(e.target.value);
                  setRecalcPreview(null);
                }}
                disabled={!recalcProd}
                style={{ marginTop: '0.25rem', height: '36px', color: 'black' }}
              >
                <option value="">Selecione o ingrediente...</option>
                {recalcIngredients.map(ing => (
                  <option key={ing.ingredient_code} value={ing.ingredient_code} style={{ color: 'black' }}>
                    {ing.ingredient_code} — {ing.description || ing.ingredient_code}
                  </option>
                ))}
              </select>
            </div>

            {recalcLoading && (
              <div style={{ padding: '0.5rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>
                <RefreshCw className="animate-spin inline-block mr-1" size={14} />
                Carregando dados históricos...
              </div>
            )}

            {recalcPreview && (
              <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--muted-hsl) / 0.2)', border: '1px solid hsl(var(--border-hsl))', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div>Total Produzido no Histórico: <strong>{recalcPreview.total_produced} unidades</strong></div>
                <div>Quantidade na Fórmula por Unidade: <strong>{recalcPreview.qty_per_unit}</strong></div>
                <div style={{ borderBottom: '1px solid hsl(var(--border-hsl))', paddingBottom: '0.25rem' }}>
                  Consumo Estimado Acumulado: <strong>{recalcPreview.total_consumption.toFixed(4)}</strong>
                </div>
                <div style={{ marginTop: '0.25rem' }}>Estoque Atual do Insumo: <strong>{recalcPreview.current_stock}</strong></div>
                <div>Estoque Esperado após Ajuste: <strong style={{ color: 'rgb(244 63 94)' }}>{recalcPreview.expected_stock.toFixed(2)}</strong></div>
                
                <button 
                  type="button" 
                  onClick={onApplyRecalc} 
                  disabled={recalcPreview.total_consumption <= 0}
                  className="btn-primary cursor-pointer" 
                  style={{ marginTop: '0.5rem', backgroundColor: 'rgb(244 63 94)', color: '#fff', fontSize: '0.75rem', padding: '0.4rem 0.8rem', justifyContent: 'center' }}
                >
                  Confirmar e Deduzir {recalcPreview.total_consumption.toFixed(2)} do Estoque
                </button>
              </div>
            )}

            {!recalcPreview && recalcProd && recalcIng && !recalcLoading && (
              <button 
                type="button"
                onClick={onPreviewRecalc}
                className="btn-secondary cursor-pointer"
                style={{ justifyContent: 'center' }}
              >
                Pré-visualizar Impacto no Estoque
              </button>
            )}
          </div>
        </div>

        {/* 3. Central de Definições Card (Redirect banner) */}
        <div className="panel-card full-width-card text-left" style={{ marginTop: '1.5rem', backgroundColor: 'hsl(var(--muted-hsl) / 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'hsl(var(--zinc-900-hsl, 240 5.9% 10%))', borderRadius: '0.75rem', color: '#fff' }}>
              ⚙️
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: '700', margin: 0, color: 'hsl(var(--text-primary-hsl))' }}>
                Central de Definições de Linhas & Status
              </h3>
              <p style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))', margin: '0.2rem 0 0 0' }}>
                As configurações de multiplicadores por linha de produto, composição de kits, ações em lote e status ignorados foram centralizadas no módulo <strong>Linha de Produtos</strong>.
              </p>
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'hsl(var(--text-secondary-hsl))' }}>
              Acesse a tela principal "Linha de Produtos" no Hub para gerenciar.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
