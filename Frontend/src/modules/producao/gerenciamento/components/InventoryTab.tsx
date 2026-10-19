import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle, 
  AlertTriangle, ChevronLeft, ChevronRight, Edit3, CheckCircle2, Plus,
  Zap, Package, Sliders, FlaskConical, Calendar, Layers, Target, Check
} from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { parseProductUnitWeightKg, formatUnitsToKg } from '../../lib/unitConversion';
import { BatchOpportunityModal } from './BatchOpportunityModal';

export function InventoryTab({
  products,
  configs,
  bases,
  activeTab,
  handleTabChange,
  search,
  setSearch,
  selectedStatus,
  setSelectedStatus,
  selectedBase,
  setSelectedBase,
  showHidden,
  setShowHidden,
  page,
  setPage,
  totalPages,
  totalItems,
  limitPerPage,
  diasComerciais,
  sortField,
  setSortField,
  sortDir,
  setSortDir,
  onLaunchProduct,
  onEditOverrides,
  onRefresh,
  loading,
  tabOptions,
  toggleSort,
  SortIcon,
  onShowDetails,
  productionApprovalList = [],
  onToggleApprovalList,
  onToggleApenasKit
}: any) {
  // Segmented Control: 'needed' | 'normal' | 'kit_mixed' | 'kit_only' | 'programadas' | 'fixas'
  type InventorySegment = 'needed' | 'normal' | 'kit_mixed' | 'kit_only' | 'programadas' | 'fixas';
  const [segment, setSegment] = useState<InventorySegment>('needed');
  const [hideQueued, setHideQueued] = useState(false);
  
  // State for PostgreSQL Fila de Demandas
  const [queuedItems, setQueuedItems] = useState<any[]>([]);
  const [batchModalProduct, setBatchModalProduct] = useState<any | null>(null);
  const [enqueuingBulk, setEnqueuingBulk] = useState(false);

  // Fetch current queue from Postgres
  const fetchQueue = useCallback(async () => {
    try {
      const res = await apiFetch('/producao/fila-demandas');
      if (res.ok) {
        const data = await res.json();
        setQueuedItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch (err) {
      console.error('Erro ao ler fila de demandas:', err);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const queuedMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of queuedItems) {
      if (item.codigoProduto) {
        map.set(item.codigoProduto, item);
      }
    }
    return map;
  }, [queuedItems]);

  // Segment counts
  const segmentCounts = useMemo(() => {
    let needed = 0;
    let normal = 0;
    let kit_mixed = 0;
    let kit_only = 0;
    let programadas = 0;
    let fixas = 0;

    for (const p of products) {
      const isProg = p.is_producao_programada === 1;
      const isFixa = p.is_lancamento || p.is_lancamento_manual === 1;
      const isRec = (p.producao_recomendada || 0) > 0;
      const inQueue = p.na_fila || queuedMap.has(p.codigo);
      const inPlan = p.planejado_semana;
      const isKitComp = Boolean(p.is_kit_component);
      const onlyKit = p.produzir_apenas_kit === 1;

      if (isRec || inQueue || inPlan) needed++;
      if (isProg) programadas++;
      if (isFixa) fixas++;
      if (!isKitComp && !isProg && !isFixa) normal++;
      if (isKitComp && !onlyKit) kit_mixed++;
      if (isKitComp && onlyKit) kit_only++;
    }

    return { needed, normal, kit_mixed, kit_only, programadas, fixas };
  }, [products, queuedMap]);

  // Filter products by active segment and search/queue options
  const displayedProducts = useMemo(() => {
    return products.filter((p: any) => {
      const isProg = p.is_producao_programada === 1;
      const isFixa = p.is_lancamento || p.is_lancamento_manual === 1;
      const isRec = (p.producao_recomendada || 0) > 0;
      const inQueue = p.na_fila || queuedMap.has(p.codigo);
      const inPlan = p.planejado_semana;
      const isKitComp = Boolean(p.is_kit_component);
      const onlyKit = p.produzir_apenas_kit === 1;

      if (hideQueued && (inQueue || inPlan)) {
        return false;
      }

      if (segment === 'needed') {
        return isRec || inQueue || inPlan;
      }
      if (segment === 'normal') {
        return !isKitComp && !isProg && !isFixa;
      }
      if (segment === 'kit_mixed') {
        return isKitComp && !onlyKit;
      }
      if (segment === 'kit_only') {
        return isKitComp && onlyKit;
      }
      if (segment === 'programadas') {
        return isProg;
      }
      if (segment === 'fixas') {
        return isFixa;
      }
      return true;
    });
  }, [products, segment, hideQueued, queuedMap]);

  // Handle single enqueue
  const handleEnqueue = async (p: any) => {
    const qty = p.producao_recomendada > 0 ? p.producao_recomendada : (p.estoque_ideal_qtd || 100);
    const weight = parseProductUnitWeightKg(p.descricao);
    const kg = Math.round(qty * weight * 10) / 10;
    const origem = p.is_producao_programada === 1 ? 'programada' : (p.is_lancamento ? 'fixa' : 'sugestao_estoque');

    try {
      const res = await apiFetch('/producao/fila-demandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoProduto: p.codigo,
          descricao: p.descricao,
          quantidade: qty,
          unidade: 'un',
          quantidadeKg: kg,
          origemDemanda: origem,
          baseCodigo: p.base_codigo,
          baseNome: p.base
        })
      });

      if (res.ok) {
        await fetchQueue();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('Erro ao adicionar à fila de demandas:', err);
    }
  };

  // Handle remove from queue
  const handleRemoveFromQueue = async (p: any) => {
    const item = queuedMap.get(p.codigo);
    if (!item?.id) return;

    try {
      const res = await apiFetch(`/producao/fila-demandas/${item.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchQueue();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('Erro ao remover da fila de demandas:', err);
    }
  };

  // Enqueue batch from BatchOpportunityModal
  const handleEnqueueBatch = async (items: any[]) => {
    try {
      const res = await apiFetch('/producao/fila-demandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items)
      });
      if (res.ok) {
        await fetchQueue();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('Erro ao enviar batelada:', err);
    }
  };

  // Bulk enqueue all recommended items
  const handleBulkEnqueue = async () => {
    const toEnqueue = displayedProducts.filter((p: any) => {
      const inQueue = p.na_fila || queuedMap.has(p.codigo);
      const inPlan = p.planejado_semana;
      return p.producao_recomendada > 0 && !inQueue && !inPlan;
    });

    if (toEnqueue.length === 0) return;

    setEnqueuingBulk(true);
    try {
      const payload = toEnqueue.map((p: any) => {
        const qty = p.producao_recomendada;
        const weight = parseProductUnitWeightKg(p.descricao);
        const kg = Math.round(qty * weight * 10) / 10;
        const origem = p.is_producao_programada === 1 ? 'programada' : (p.is_lancamento ? 'fixa' : 'sugestao_estoque');
        return {
          codigoProduto: p.codigo,
          descricao: p.descricao,
          quantidade: qty,
          unidade: 'un',
          quantidadeKg: kg,
          origemDemanda: origem,
          baseCodigo: p.base_codigo,
          baseNome: p.base
        };
      });

      const res = await apiFetch('/producao/fila-demandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchQueue();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('Erro no envio em lote para fila:', err);
    } finally {
      setEnqueuingBulk(false);
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      {/* Segmented Control Superior (6 Regimes Canônicos) */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-zinc-100 p-1.5 rounded-xl border border-zinc-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg p-0.5 bg-zinc-200/60 text-xs font-semibold flex-wrap gap-0.5">
            <button
              onClick={() => setSegment('needed')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                segment === 'needed'
                  ? 'bg-white text-zinc-900 shadow-xs font-bold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Zap size={14} className={segment === 'needed' ? 'text-amber-600' : ''} />
              <span>Tudo p/ Produzir Hoje</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">
                {segmentCounts.needed}
              </span>
            </button>

            <button
              onClick={() => setSegment('normal')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                segment === 'normal'
                  ? 'bg-white text-zinc-900 shadow-xs font-bold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Layers size={14} />
              <span>Linha Normal</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">
                {segmentCounts.normal}
              </span>
            </button>

            <button
              onClick={() => setSegment('kit_mixed')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                segment === 'kit_mixed'
                  ? 'bg-white text-zinc-900 shadow-xs font-bold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Package size={14} className={segment === 'kit_mixed' ? 'text-sky-600' : ''} />
              <span>Venda + Kit (Misto)</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">
                {segmentCounts.kit_mixed}
              </span>
            </button>

            <button
              onClick={() => setSegment('kit_only')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                segment === 'kit_only'
                  ? 'bg-white text-zinc-900 shadow-xs font-bold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Package size={14} className={segment === 'kit_only' ? 'text-violet-600' : ''} />
              <span>Somente em Kits</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">
                {segmentCounts.kit_only}
              </span>
            </button>

            <button
              onClick={() => setSegment('programadas')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                segment === 'programadas'
                  ? 'bg-white text-zinc-900 shadow-xs font-bold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Calendar size={14} />
              <span>Programadas</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">
                {segmentCounts.programadas}
              </span>
            </button>

            <button
              onClick={() => setSegment('fixas')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                segment === 'fixas'
                  ? 'bg-white text-zinc-900 shadow-xs font-bold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Target size={14} />
              <span>Fixas / Metas</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">
                {segmentCounts.fixas}
              </span>
            </button>
          </div>
        </div>

        {/* Action: Enviar Sugeridos para a Fila */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleBulkEnqueue}
            disabled={enqueuingBulk || loading}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            title="Adiciona todos os produtos sugeridos com necessidade à Fila de Demandas do PCP"
          >
            {enqueuingBulk ? (
              <RefreshCw className="animate-spin" size={13} />
            ) : (
              <Plus size={13} />
            )}
            <span>Enviar Sugeridos para a Fila</span>
          </button>
        </div>
      </div>

      {/* Tabs Nav (Linhas de Produtos) */}
      <div className="tabs-container">
        {tabOptions.map((opt: any) => (
          <button 
            key={opt.id}
            className={`tab-btn ${activeTab === opt.id ? 'active' : ''}`}
            onClick={() => handleTabChange(opt.id)}
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
            placeholder="Buscar por código (REF) ou descrição..." 
            className="search-input"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="filters-wrapper">
          <select 
            className="select-filter"
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
          >
            <option value="ALL">Todos os Alertas</option>
            <option value="critico">Crítico: Produzir</option>
            <option value="ordem">Abrir Ordem</option>
            <option value="saudavel">Estoque OK</option>
            <option value="abundante">Abundante</option>
            <option value="ERR_NO_FORMULA">Sem Formulação</option>
            <option value="ERR_MISSING_MATS">Falta Insumos</option>
          </select>

          <select 
            className="select-filter"
            value={selectedBase}
            onChange={(e) => { setSelectedBase(e.target.value); setPage(1); }}
          >
            <option value="ALL">Qualquer Base</option>
            <option value="HAS_BASE">Com Base Relacionada</option>
            <option value="NO_BASE">Sem Base</option>
            {bases.map((baseName: string) => (
              <option key={baseName} value={baseName}>{baseName}</option>
            ))}
          </select>

          <label className="toolbar-checkbox-wrapper select-none cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700" title="Ocultar produtos que já estão na Fila ou no Planejamento">
            <input 
              type="checkbox" 
              checked={hideQueued} 
              onChange={(e) => setHideQueued(e.target.checked)} 
            />
            <span>Ocultar já Agendados / Fila</span>
          </label>

          <label className="toolbar-checkbox-wrapper">
            <input 
              type="checkbox" 
              checked={showHidden} 
              onChange={(e) => { setShowHidden(e.target.checked); setPage(1); }} 
            />
            <span>Ver Ocultos</span>
          </label>

          <button className="btn-secondary cursor-pointer" onClick={() => { onRefresh(); fetchQueue(); }} title="Recarregar dados">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden flex flex-col w-full text-xs">
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw className="animate-spin" size={32} />
            <span>Calculando e carregando dados de estoque...</span>
          </div>
        ) : displayedProducts.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <HelpCircle size={48} style={{ opacity: 0.3 }} />
            <span>Nenhum produto encontrado com os filtros selecionados.</span>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-zinc-50 sticky top-0 z-10">
                <tr className="border-b border-zinc-200">
                  <th 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('codigo', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      REF
                      <SortIcon field="codigo" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '35%', cursor: 'pointer' }}
                    onClick={() => toggleSort('descricao', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Descrição / Linha
                      <SortIcon field="descricao" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('estoque_futuro_com_producao', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right"
                    title="EFP = Estoque + Produção − Pedidos (disponível projetado)"
                  >
                    <div className="flex items-center gap-1 justify-end">
                      EFP
                      <SortIcon field="estoque_futuro_com_producao" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '18%', cursor: 'pointer' }}
                    onClick={() => toggleSort('duracao_meses', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Duração
                      <SortIcon field="duracao_meses" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '12%', cursor: 'pointer' }}
                    onClick={() => toggleSort('status', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Status
                      <SortIcon field="status" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th 
                    style={{ width: '10%', cursor: 'pointer' }}
                    onClick={() => toggleSort('producao_recomendada', sortField, setSortField, sortDir, setSortDir)}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] select-none hover:bg-zinc-100 transition-colors text-right"
                  >
                    <div className="flex items-center gap-1 justify-end">
                      Sug. Prod.
                      <SortIcon field="producao_recomendada" activeField={sortField} activeDir={sortDir} />
                    </div>
                  </th>
                  <th className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] text-center" style={{ width: '8%' }}>Fila PCP</th>
                  <th className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] text-center" style={{ width: '7%' }}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {displayedProducts.map((p: any) => {
                  const isOverridden = p.estoque_ideal_manual !== null || 
                                       p.pedidos_manual !== null || 
                                       p.media_manual !== null ||
                                       p.is_lancamento_manual !== null ||
                                       p.visivel === 0 ||
                                       p.linha_prefix_manual !== null ||
                                       p.observacao !== null;
                  const duracaoDiasCalculada = p.duracao_meses * diasComerciais;
                  const pct = Math.min(100, Math.max(5, (p.duracao_meses / p.estoque_ideal_meses) * 100));

                  const inQueue = p.na_fila || queuedMap.has(p.codigo);
                  const inPlan = p.planejado_semana;
                  const hasConflict = p.conflito_regra;

                  return (
                    <tr key={p.codigo} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-2.5 border-b border-zinc-100 align-middle font-mono font-bold text-zinc-700">
                        <button 
                          onClick={() => onShowDetails(p.codigo)} 
                          className="hover:underline text-left font-bold text-zinc-900 cursor-pointer bg-transparent border-none p-0"
                        >
                          {p.codigo}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-100 align-middle">
                        <div className="font-bold text-zinc-900 flex items-center gap-2">
                          <button 
                            onClick={() => onShowDetails(p.codigo)} 
                            className="hover:underline text-left font-bold text-zinc-900 cursor-pointer bg-transparent border-none p-0"
                          >
                            {p.descricao}
                          </button>
                        </div>
                        <div className="product-subinfo flex flex-wrap gap-1.5 mt-1 items-center">
                          <span className="text-[10px] text-zinc-500 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded">Linha: {p.nome_linha}</span>
                          {p.base && <span className="text-[10px] text-zinc-600 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded">Base: {p.base}</span>}
                          {p.is_kit_component ? (
                            p.produzir_apenas_kit === 1 ? (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-violet-50 text-violet-700 border border-violet-200 rounded">
                                Somente Kit {p.parent_kits?.length ? `(${p.parent_kits.join(', ')})` : ''}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[9px] font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded">
                                Venda + Kit {p.parent_kits?.length ? `(${p.parent_kits.join(', ')})` : ''}
                              </span>
                            )
                          ) : null}
                          {onToggleApenasKit && Boolean(p.is_kit_component) && (segment === 'kit_mixed' || segment === 'kit_only') && (
                            <button
                              type="button"
                              onClick={() => onToggleApenasKit(p.codigo, p.produzir_apenas_kit ?? 0)}
                              className="text-[9px] text-zinc-500 hover:text-zinc-900 underline cursor-pointer"
                              title="Alternar entre Somente Kit e Venda + Kit"
                            >
                              {p.produzir_apenas_kit === 1 ? 'Mudar p/ Venda + Kit' : 'Mudar p/ Somente Kit'}
                            </button>
                          )}
                          {p.is_producao_programada === 1 && (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-zinc-900 text-white rounded">
                              Programada {p.programada_gatilho ? `(Gat: ${p.programada_gatilho} | Obj: ${p.programada_objetivo || '—'})` : ''}
                            </span>
                          )}
                          {p.is_lancamento && (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-zinc-100 text-zinc-800 border border-zinc-300 rounded">
                              Fixa / Meta {p.lancamento_gatilho ? `(Gat: ${p.lancamento_gatilho} | Máx: ${p.lancamento_estoque_maximo || '—'})` : ''}
                            </span>
                          )}
                          {!p.has_formulation && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200 rounded">
                              Sem Fórmula
                            </span>
                          )}
                          {p.missing_ingredients && p.missing_ingredients.length > 0 && (
                            <button
                              onClick={() => setBatchModalProduct(p)}
                              className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
                              title="Clique para ver insumos faltantes e oportunidades de batelada"
                            >
                              <AlertTriangle size={10} />
                              Falta Insumos ({p.missing_ingredients.length})
                            </button>
                          )}
                          {isOverridden && (
                            <span className="text-[9px] font-semibold text-zinc-500 flex items-center gap-0.5">
                              <Edit3 size={10} /> Editado
                            </span>
                          )}
                        </div>
                        {p.observacao && (
                          <div className="observation-text flex items-center gap-1 mt-1 text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 w-fit">
                            <AlertTriangle size={11} className="shrink-0" />
                            <span>Obs: {p.observacao}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-right font-bold font-mono text-zinc-900">
                        <span>{p.estoque_futuro_com_producao}</span>
                        <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          Est: {p.estoque} | Prod: {p.producao} | Ped: {p.pedidos_aberto}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-100 align-middle">
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between font-semibold font-mono text-zinc-700 text-[10px]">
                            <span>{p.duracao_meses.toFixed(1)}m</span>
                            <span>{duracaoDiasCalculada.toFixed(0)}d</span>
                          </div>
                          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${p.status === 'critico' ? 'bg-rose-500' : p.status === 'ordem' ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-400 font-mono mt-0.5">
                            <span>Vendas: {p.demanda_ajustada.toFixed(1)}/m</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-100 align-middle">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === 'critico' 
                            ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                            : p.status === 'ordem' 
                            ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {p.status_label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-right font-bold font-mono text-zinc-900">
                        {p.producao_recomendada > 0 ? (
                          <div>
                            <span className="text-zinc-900">{p.producao_recomendada} un</span>
                            <div className="text-[10px] text-zinc-500 font-normal font-mono">
                              (~{formatUnitsToKg(p.producao_recomendada, p.descricao)})
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      {/* Fila PCP Action */}
                      <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-center">
                        {inPlan ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200" title="Item agendado no Planejamento Semanal">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Planejado
                          </span>
                        ) : inQueue ? (
                          <button
                            onClick={() => handleRemoveFromQueue(p)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                            title="Na fila de demandas. Clique para remover."
                          >
                            <Check size={12} />
                            Na Fila
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEnqueue(p)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shadow-xs cursor-pointer"
                            title="Adicionar à fila de demandas do PCP"
                          >
                            <Plus size={12} />
                            + Fila
                          </button>
                        )}
                      </td>
                      {/* Context Actions */}
                      <td className="px-4 py-2.5 border-b border-zinc-100 align-middle text-center">
                        <div className="flex gap-1 justify-center items-center">
                          <button 
                            className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer" 
                            onClick={() => setBatchModalProduct(p)} 
                            title="Ver Oportunidades de Batelada & Suprimentos"
                          >
                            <FlaskConical size={14} />
                          </button>
                          <button 
                            className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer" 
                            onClick={() => onEditOverrides(p)} 
                            title="Ajustar regras e overrides"
                          >
                            <Edit3 size={14} />
                          </button>
                        </div>
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
          <span className="font-mono text-xs text-zinc-500">
            Exibindo de {(page - 1) * limitPerPage + 1} a {Math.min(page * limitPerPage, totalItems)} de {totalItems} produtos
          </span>
          <div className="pagination-controls">
            <button 
              className="pagination-btn cursor-pointer" 
              disabled={page <= 1}
              onClick={() => setPage((p: number) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontWeight: '700' }} className="font-mono text-xs">
              Página {page} de {totalPages}
            </span>
            <button 
              className="pagination-btn cursor-pointer" 
              disabled={page >= totalPages}
              onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Aproveitamento de Batelada & Suprimentos */}
      {batchModalProduct && (
        <BatchOpportunityModal
          product={batchModalProduct}
          onClose={() => setBatchModalProduct(null)}
          onEnqueueBatch={handleEnqueueBatch}
        />
      )}
    </div>
  );
}
