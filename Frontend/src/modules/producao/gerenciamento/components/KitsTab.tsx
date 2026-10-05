import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../../../geral/lib/http';
import { 
  Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle, 
  ChevronDown, AlertTriangle, Edit3, ChevronLeft, ChevronRight, CheckCircle2, PlusCircle,
  Layers, Zap, CalendarClock, History, FileText, Check, Clock, User, Package, Boxes
} from 'lucide-react';
import { ChevronRight as ChevronRightIcon } from 'lucide-react';

export function KitsTab({
  kitsStats,
  kits,
  configs,
  kitsActiveTab,
  setKitsActiveTab,
  kitsSearch,
  setKitsSearch,
  kitsSelectedStatus,
  setKitsSelectedStatus,
  kitsPage,
  setKitsPage,
  kitsTotalPages,
  kitsTotalItems,
  limitPerPage,
  showHidden,
  kitSortField,
  setKitSortField,
  kitSortDir,
  setKitSortDir,
  onLaunchProduct,
  onEditOverrides,
  onRefresh,
  loading,
  tabOptions,
  toggleSort,
  SortIcon,
  expandedKits,
  toggleKitExpanded,
  productionApprovalList = [],
  onToggleApprovalList,
  onOpenComposition,
  onToggleApenasKit
}: any) {
  const [kitViewMode, setKitViewMode] = useState<'planejamento' | 'historico'>('planejamento');
  const [kitOrders, setKitOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('ALL');

  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await apiFetch('/kits/orders');
      if (res.ok) {
        const data = await res.json();
        setKitOrders(data || []);
      }
    } catch (e) {
      console.error("Error fetching kit orders:", e);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    if (kitViewMode === 'historico') {
      fetchOrders();
    }
  }, [kitViewMode, fetchOrders]);

  const filteredHistoryOrders = useMemo(() => {
    return kitOrders.filter(o => {
      const q = historySearch.toLowerCase().trim();
      const matchSearch = !q ||
        (o.orderNumber || '').toLowerCase().includes(q) ||
        (o.kitProductCode || '').toLowerCase().includes(q) ||
        (o.kitProductDescription || '').toLowerCase().includes(q) ||
        (o.assembledBy || '').toLowerCase().includes(q) ||
        (o.observations || '').toLowerCase().includes(q);

      const matchStatus = historyStatusFilter === 'ALL' || o.status === historyStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [kitOrders, historySearch, historyStatusFilter]);

  const historyStats = useMemo(() => {
    const total = kitOrders.length;
    const completed = kitOrders.filter(o => o.status === 'COMPLETED').length;
    const inProgress = kitOrders.filter(o => o.status === 'IN_PROGRESS').length;
    const pending = kitOrders.filter(o => o.status === 'PENDING').length;
    const totalUnits = kitOrders.reduce((sum, o) => sum + (Number(o.quantityAssembled) || Number(o.quantity) || 0), 0);
    return { total, completed, inProgress, pending, totalUnits };
  }, [kitOrders]);

  return (
    <div className="view-container animate-in fade-in duration-200">
      {/* Switcher de Visão: Planejamento vs Histórico */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-zinc-50 p-2 rounded-2xl border border-zinc-200">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setKitViewMode('planejamento')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              kitViewMode === 'planejamento'
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                : 'bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            📊 Planejamento e Estoques de Kits
          </button>
          <button
            type="button"
            onClick={() => { setKitViewMode('historico'); fetchOrders(); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
              kitViewMode === 'historico'
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                : 'bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            📜 Histórico de Montagens e Lotes
            {kitOrders.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-zinc-200 text-zinc-800 font-bold">
                {kitOrders.length}
              </span>
            )}
          </button>
        </div>

        {kitViewMode === 'historico' && (
          <button
            type="button"
            onClick={fetchOrders}
            disabled={loadingOrders}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl cursor-pointer shadow-xs"
          >
            <RefreshCw size={14} className={loadingOrders ? 'animate-spin' : ''} />
            <span>Atualizar Histórico</span>
          </button>
        )}
      </div>

      {kitViewMode === 'historico' ? (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Summary KPIs do Histórico */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-xs flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-zinc-100 text-zinc-700 shrink-0">
                <Boxes size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Total de Ordens</div>
                <div className="text-xl font-bold text-zinc-900">{historyStats.total}</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-xs flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Concluídas</div>
                <div className="text-xl font-bold text-emerald-600">{historyStats.completed}</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-xs flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                <Clock size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Em Aberto / Montagem</div>
                <div className="text-xl font-bold text-blue-600">{historyStats.pending + historyStats.inProgress}</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-xs flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                <Layers size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Kits Montados</div>
                <div className="text-xl font-bold text-indigo-600">{historyStats.totalUnits.toLocaleString('pt-BR')} un</div>
              </div>
            </div>
          </div>

          {/* Toolbar de busca e filtro */}
          <div className="bg-white border border-zinc-200 p-3 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[280px] flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Buscar ordem nº, SKU do kit, descrição ou responsável..."
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={historyStatusFilter}
                onChange={e => setHistoryStatusFilter(e.target.value)}
                className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              >
                <option value="ALL">Todos os Status</option>
                <option value="COMPLETED">Apenas Concluídos</option>
                <option value="IN_PROGRESS">Em Montagem</option>
                <option value="PENDING">Pendentes</option>
              </select>
            </div>
          </div>

          {/* Tabela do Histórico de Kits */}
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50/90 border-b border-zinc-200 text-[11px] font-bold text-zinc-600 uppercase tracking-wider select-none">
                    <th className="py-3 px-4 w-28">Nº Ordem</th>
                    <th className="py-3 px-4 w-28">Data</th>
                    <th className="py-3 px-4 w-24">REF SKU</th>
                    <th className="py-3 px-4 min-w-[260px]">Kit Comercial</th>
                    <th className="py-3 px-4 text-right w-36">Quantidade</th>
                    <th className="py-3 px-4 text-center w-36">Status Montagem</th>
                    <th className="py-3 px-4 w-40">Responsável</th>
                    <th className="py-3 px-4 min-w-[180px]">Componentes & Lotes</th>
                    <th className="py-3 px-4 min-w-[180px]">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {loadingOrders ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-zinc-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                        <p className="text-xs font-semibold">Carregando histórico de ordens...</p>
                      </td>
                    </tr>
                  ) : filteredHistoryOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-zinc-400">
                        <Boxes className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                        <p className="text-sm font-semibold text-zinc-700">Nenhuma ordem de montagem encontrada</p>
                        <p className="text-xs text-zinc-400 mt-1">As ordens registradas no sistema aparecerão aqui.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredHistoryOrders.map((o) => {
                      const isCompleted = o.status === 'COMPLETED';
                      const isProgress = o.status === 'IN_PROGRESS';
                      const isPending = o.status === 'PENDING';

                      return (
                        <tr key={o.id} className={`hover:bg-zinc-50/80 transition-colors ${isCompleted ? 'bg-zinc-50/40' : 'bg-white'}`}>
                          <td className="py-2.5 px-4 font-mono font-bold text-xs text-zinc-900 select-all whitespace-nowrap">
                            #{o.orderNumber}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-650 font-medium whitespace-nowrap">
                            {o.createdAt ? new Date(o.createdAt).toLocaleDateString('pt-BR') : '—'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-zinc-600 font-semibold whitespace-nowrap">
                            {o.kitProductCode}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-zinc-900 leading-snug">{o.kitProductDescription}</div>
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="font-mono font-bold text-xs text-zinc-900">
                              {o.quantity} <span className="text-[10px] text-zinc-500">solic.</span>
                            </div>
                            <div className="text-[11px] font-mono text-emerald-700 font-semibold">
                              {o.quantityAssembled ?? o.quantity} <span className="text-[10px] text-zinc-400">montado</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : isProgress
                                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                                  : isPending
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-zinc-100 text-zinc-700 border-zinc-300'
                            }`}>
                              {isCompleted ? 'Concluído' : isProgress ? 'Em Montagem' : isPending ? 'Pendente' : o.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-xs text-zinc-700 font-medium whitespace-nowrap">
                            {o.assembledBy || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-zinc-600 font-mono truncate max-w-xs">
                            {o.componentsLotes || <span className="text-zinc-300 italic font-sans">—</span>}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-zinc-600 truncate max-w-xs">
                            {o.observations || <span className="text-zinc-300 italic">—</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-zinc-50 px-4 py-2.5 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-500">
              <span>Exibindo <strong>{filteredHistoryOrders.length}</strong> de <strong>{kitOrders.length}</strong> ordens de montagem</span>
              <span>Dados sincronizados com o banco de dados do Nexus.</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div 
              className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-indigo-300 hover:shadow-md ${kitsSelectedStatus === 'montar' ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/20' : 'border-zinc-200'}`}
              onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'montar' ? 'ALL' : 'montar'); setKitsPage(1); }}
              title="Clique para filtrar por kits prontos para montar"
            >
              <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                <Layers size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Montar Urgente</div>
                <div className="text-xl font-bold text-indigo-600">{kitsStats?.montar ?? 0}</div>
              </div>
            </div>

            <div 
              className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-rose-300 hover:shadow-md ${kitsSelectedStatus === 'critico' ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-50/20' : 'border-zinc-200'}`}
              onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'critico' ? 'ALL' : 'critico'); setKitsPage(1); }}
              title="Clique para filtrar por kits críticos"
            >
              <div className="p-2.5 rounded-lg bg-rose-50 text-rose-600 shrink-0">
                <Zap size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Crítico: Produzir</div>
                <div className="text-xl font-bold text-rose-600">{kitsStats?.critico ?? 0}</div>
              </div>
            </div>

            <div 
              className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-amber-300 hover:shadow-md ${kitsSelectedStatus === 'aguardando' ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/20' : 'border-zinc-200'}`}
              onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'aguardando' ? 'ALL' : 'aguardando'); setKitsPage(1); }}
              title="Clique para filtrar por kits aguardando produção"
            >
              <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 shrink-0">
                <CalendarClock size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Aguardando Produção</div>
                <div className="text-xl font-bold text-amber-600">{kitsStats?.aguardando ?? 0}</div>
              </div>
            </div>

            <div 
              className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-emerald-300 hover:shadow-md ${kitsSelectedStatus === 'saudavel' ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/20' : 'border-zinc-200'}`}
              onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'saudavel' ? 'ALL' : 'saudavel'); setKitsPage(1); }}
              title="Clique para filtrar por estoque saudável"
            >
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Estoque Estável</div>
                <div className="text-xl font-bold text-emerald-600">{(kitsStats?.saudavel ?? 0) + (kitsStats?.abundante ?? 0)}</div>
              </div>
            </div>
          </div>

          {/* Tabs Nav */}
          <div className="tabs-container">
            {tabOptions.map((opt: any) => (
              <button 
                key={opt.id}
                className={`tab-btn ${kitsActiveTab === opt.id ? 'active' : ''}`}
                onClick={() => { setKitsActiveTab(opt.id); setKitsPage(1); }}
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
                placeholder="Buscar kit por código (REF) ou descrição..." 
                className="search-input"
                value={kitsSearch}
                onChange={(e) => { setKitsSearch(e.target.value); setKitsPage(1); }}
              />
            </div>

            <div className="filters-wrapper">
              <select 
                className="select-filter"
                value={kitsSelectedStatus}
                onChange={(e) => { setKitsSelectedStatus(e.target.value); setKitsPage(1); }}
              >
                <option value="ALL">Todos os Alertas</option>
                <option value="critico">Crítico: Produzir</option>
                <option value="ordem">Abrir Ordem</option>
                <option value="montar">Montar Urgente</option>
                <option value="aguardando">Aguardando Produção</option>
                <option value="saudavel">Estoque OK</option>
                <option value="abundante">Abundante</option>
              </select>

              <button className="btn-secondary cursor-pointer" onClick={onRefresh} title="Recarregar dados">
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* Main Table Card */}
          <div className="table-card">
            {loading ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <RefreshCw className="animate-spin" size={32} />
                <span>Calculando composição e estoques dos kits...</span>
              </div>
            ) : kits.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <HelpCircle size={48} style={{ opacity: 0.3 }} />
                <span>Nenhum kit encontrado com os filtros selecionados.</span>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '4%' }}></th>
                      <th 
                        style={{ width: '10%', cursor: 'pointer' }}
                        onClick={() => toggleSort('codigo', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                        className="sortable-th"
                      >
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          REF Kit
                          <SortIcon field="codigo" activeField={kitSortField} activeDir={kitSortDir} />
                        </div>
                      </th>
                      <th 
                        style={{ width: '28%', cursor: 'pointer' }}
                        onClick={() => toggleSort('descricao', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                        className="sortable-th"
                      >
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          Descrição do Kit
                          <SortIcon field="descricao" activeField={kitSortField} activeDir={kitSortDir} />
                        </div>
                      </th>
                      <th 
                        className="numeric-col sortable-th" 
                        style={{ width: '8%', cursor: 'pointer' }}
                        onClick={() => toggleSort('estoque_futuro_com_producao', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          EFP Kit
                          <SortIcon field="estoque_futuro_com_producao" activeField={kitSortField} activeDir={kitSortDir} />
                        </div>
                      </th>
                      <th 
                        style={{ width: '15%', cursor: 'pointer' }}
                        onClick={() => toggleSort('status', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}
                        className="sortable-th"
                      >
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          Status do Kit
                          <SortIcon field="status" activeField={kitSortField} activeDir={kitSortDir} />
                        </div>
                      </th>
                      <th style={{ width: '15%' }}>Capacidade de Montagem</th>
                      <th style={{ width: '6%', textAlign: 'center' }} title="Fila de Aprovação da Produção">Fila</th>
                      <th style={{ width: '14%' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kits.map((k: any) => {
                      const p = k.produto || k.kit_detalhes || k;
                      if (!p || !p.codigo) return null;
                      const isExpanded = expandedKits.includes(p.codigo);
                      let capacityClass = 'capacity-ok';
                      if (k.max_montavel === 0) capacityClass = 'capacity-zero';
                      else if (k.max_montavel < 50) capacityClass = 'capacity-low';
                      const componentes = Array.isArray(k.componentes) ? k.componentes : [];
                      const componentesCriticos = Array.isArray(k.componentes_criticos) ? k.componentes_criticos : [];

                      return (
                        <React.Fragment key={p.codigo}>
                          <tr 
                            className={`main-row ${isExpanded ? 'expanded' : ''}`}
                            onClick={() => toggleKitExpanded(p.codigo)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td style={{ textAlign: 'center', padding: '0.25rem' }}>
                              <span style={{ 
                                display: 'inline-flex',
                                transform: isExpanded ? 'rotate(90deg)' : 'none', 
                                transition: 'transform 0.2s',
                                color: '#71717a'
                              }}>
                                <ChevronRightIcon size={16} />
                              </span>
                            </td>
                            <td className="code-col">{p.codigo}</td>
                            <td className="desc-col font-medium">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="kit-icon-badge" title="Kit Comercial">
                                  <Layers size={12} />
                                </span>
                                <div>
                                  <div>{p.descricao}</div>
                                  <div style={{ fontSize: '0.675rem', color: '#71717a' }}>
                                    {componentes.length} itens inclusos na composição
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="numeric-col">{p.estoque_futuro_com_producao}</td>
                            <td>
                              <span className={`status-badge ${p.status}`}>
                                {p.status_label}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span className={`montagem-badge ${capacityClass}`}>
                                  Máx: {k.max_montavel} un montáveis
                                </span>
                                {p.status === 'montar' ? (
                                  <span style={{ fontSize: '0.625rem', color: '#c2410c', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    Componentes OK — montar kit
                                  </span>
                                ) : p.status === 'aguardando' ? (
                                  <span style={{ fontSize: '0.625rem', color: '#1d4ed8', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    Componentes em produção — aguardar OP
                                  </span>
                                ) : componentesCriticos.length > 0 ? (
                                  <span style={{ fontSize: '0.625rem', color: 'hsl(var(--warning-hsl))', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    <AlertTriangle size={10} />
                                    Falta produzir {componentesCriticos.length} itens
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => onToggleApprovalList(p.codigo)}
                                className="action-btn cursor-pointer"
                                style={{ 
                                  color: productionApprovalList.includes(p.codigo) ? 'rgb(22, 163, 74)' : '#a3a3a3',
                                  border: 'none',
                                  background: 'transparent',
                                  padding: 0
                                }}
                                title={productionApprovalList.includes(p.codigo) ? "Remover da Fila de Aprovação" : "Adicionar à Fila de Aprovação"}
                              >
                                {productionApprovalList.includes(p.codigo) ? (
                                  <CheckCircle2 size={14} />
                                ) : (
                                  <PlusCircle size={14} />
                                )}
                              </button>
                            </td>
                            <td style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                              <button 
                                className="action-btn cursor-pointer" 
                                onClick={() => onOpenComposition?.(p.codigo, p.descricao)} 
                                title="Editar composição de itens deste kit"
                              >
                                <Layers size={14} />
                              </button>
                              <button className="action-btn cursor-pointer" onClick={() => onEditOverrides(p)} title="Ajustar overrides manuais">
                                <Edit3 size={14} />
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Row containing Components details */}
                          {isExpanded && (
                            <tr className="expanded-row-tr">
                              <td colSpan={9} style={{ padding: 0 }}>
                                <div className="components-detail-panel">
                                  <div className="components-panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>Componentes do Kit ({componentes.length})</span>
                                    <button 
                                      onClick={() => onOpenComposition?.(p.codigo, p.descricao)}
                                      style={{ 
                                        background: 'none', 
                                        border: 'none', 
                                        color: 'hsl(var(--primary-hsl, 220 90% 56%))', 
                                        fontSize: '0.75rem', 
                                        fontWeight: 700, 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '4px', 
                                        cursor: 'pointer' 
                                      }}
                                    >
                                      <Layers size={13} /> Gerenciar Composição do Kit
                                    </button>
                                  </div>
                                  <table className="components-table">
                                    <thead>
                                      <tr>
                                        <th style={{ width: '13%' }}>REF Componente</th>
                                        <th style={{ width: '30%' }}>Descrição do Componente</th>
                                        <th className="numeric-col" style={{ width: '9%' }}>Estoque</th>
                                        <th className="numeric-col" style={{ width: '9%' }}>Produção</th>
                                        <th className="numeric-col" style={{ width: '9%' }}>Pedidos</th>
                                        <th style={{ width: '10%' }}>Necessita Prod.</th>
                                        <th style={{ width: '12%', textAlign: 'center' }}>Política de Uso</th>
                                        <th style={{ width: '8%', textAlign: 'center' }}>Produzir</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {componentes.map((comp: any, compIdx: number) => {
                                        if (!comp) return null;
                                        return (
                                        <tr key={comp.codigo || compIdx}>
                                          <td className="comp-code">{comp.codigo || '—'}</td>
                                          <td className="comp-desc">
                                            {comp.descricao || '—'}
                                            {comp.fonte === 'item' && (
                                              <span className="status-badge" style={{ marginLeft: '6px', padding: '0px 4px', fontSize: '0.6rem', backgroundColor: '#f4f4f5', color: '#71717a' }}>
                                                embalagem/insumo
                                              </span>
                                            )}
                                          </td>
                                          <td className="numeric-col">{comp.estoque}</td>
                                          <td className="numeric-col">{comp.producao}</td>
                                          <td className="numeric-col">{comp.pedidos_aberto}</td>
                                          <td>
                                            {comp.producao_recomendada > 0 ? (
                                              <span className="status-badge critico" style={{ padding: '1px 4px', fontSize: '0.65rem' }}>
                                                Falta {comp.producao_recomendada} un
                                              </span>
                                            ) : (
                                              <span className="status-badge saudavel" style={{ padding: '1px 4px', fontSize: '0.65rem' }}>
                                                Suficiente
                                              </span>
                                            )}
                                          </td>
                                          <td style={{ textAlign: 'center' }}>
                                            {comp.fonte === 'item' ? (
                                              <span style={{ color: '#a3a3a3', fontSize: '0.65rem' }}>Item Direto</span>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => onToggleApenasKit?.(comp.codigo, comp.produzir_apenas_kit ?? 0)}
                                                style={{
                                                  fontSize: '0.65rem',
                                                  fontWeight: 700,
                                                  padding: '2px 6px',
                                                  borderRadius: 4,
                                                  border: '1px solid',
                                                  cursor: 'pointer',
                                                  backgroundColor: comp.produzir_apenas_kit === 1 ? '#f5f3ff' : '#f4f4f5',
                                                  color: comp.produzir_apenas_kit === 1 ? '#7c3aed' : '#52525b',
                                                  borderColor: comp.produzir_apenas_kit === 1 ? '#ddd6fe' : '#e4e4e7',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: 4
                                                }}
                                                title={
                                                  comp.produzir_apenas_kit === 1
                                                    ? 'Produzido apenas para kits (demanda calculada via kits). Clique para alternar.'
                                                    : 'Vendido avulso também (demanda direta + kits). Clique para alternar.'
                                                }
                                              >
                                                <span style={{
                                                  width: 6,
                                                  height: 6,
                                                  borderRadius: '50%',
                                                  backgroundColor: comp.produzir_apenas_kit === 1 ? '#7c3aed' : '#a1a1aa'
                                                }} />
                                                {comp.produzir_apenas_kit === 1 ? 'Apenas Kit' : 'Vendido Avulso'}
                                              </button>
                                            )}
                                          </td>
                                          <td style={{ textAlign: 'center' }}>
                                            {comp.fonte === 'item' ? (
                                              <span style={{ color: '#a3a3a3', fontSize: '0.65rem' }}>—</span>
                                            ) : (
                                              <button 
                                                className="btn-launch-sm cursor-pointer"
                                                onClick={() => onLaunchProduct(comp)}
                                                title="Lançar lote de produção para este componente"
                                              >
                                                Lançar
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    </tbody>
                                  </table>
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

            {/* Pagination Controls */}
            <div className="pagination-container">
              <span>Exibindo de {(kitsPage - 1) * limitPerPage + 1} a {Math.min(kitsPage * limitPerPage, kitsTotalItems)} de {kitsTotalItems} kits</span>
              <div className="pagination-controls">
                <button 
                  className="pagination-btn cursor-pointer" 
                  disabled={kitsPage <= 1}
                  onClick={() => setKitsPage((p: number) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontWeight: '700' }}>
                  Página {kitsPage} de {kitsTotalPages}
                </span>
                <button 
                  className="pagination-btn cursor-pointer" 
                  disabled={kitsPage >= kitsTotalPages}
                  onClick={() => setKitsPage((p: number) => Math.min(kitsTotalPages, p + 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
