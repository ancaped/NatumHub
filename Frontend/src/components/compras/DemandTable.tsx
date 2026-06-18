import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { DemandResult, Category } from '../../types';
import { AlertCircle, ArrowDownToLine, Package, Filter, CheckCircle2, ShoppingCart, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../../lib/utils';

type SortKey = 'itemCode' | 'description' | 'currentStock' | 'overallAvg' | 'futureStockForecast' | 'estimatedDurationDays' | 'recommendedQty';
type SortDir = 'asc' | 'desc';

interface DemandTableProps {
  mode?: 'materia_prima' | 'embalagens' | 'all';
}

export function DemandTable({ mode = 'all' }: DemandTableProps) {
  const defaultTab = mode === 'materia_prima' ? 'cat_mp' : mode === 'embalagens' ? 'cat_emb' : 'ALL';
  const [demands, setDemands] = useState<DemandResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetDays, setTargetDays] = useState(90);
  const [activeMainTab, setActiveMainTab] = useState<'ALL' | 'cat_mp' | 'cat_emb'>(defaultTab);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('estimatedDurationDays');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('');

  useEffect(() => {
    setActiveMainTab(defaultTab);
    setSelectedCategory(null);
  }, [mode, defaultTab]);

  useEffect(() => {
    loadCategories();
    loadDemands();
  }, [targetDays]);

  const loadCategories = async () => {
    try { setCategories(await api.getCategories()); }
    catch (e) { console.error(e); }
  };

  const loadDemands = async () => {
    setLoading(true);
    try {
      const results = await api.getDemands(undefined, targetDays);
      setDemands(results);
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar demandas');
    } finally {
      setLoading(false);
    }
  };

  // Get allowed subcategories based on active main tab
  const filteredSubcategories = useMemo(() => {
    if (activeMainTab === 'ALL') {
      return categories.filter(c => c.parentId !== null);
    }
    return categories.filter(c => c.parentId === activeMainTab);
  }, [categories, activeMainTab]);

  // Compute item counts for badges
  const counts = useMemo(() => {
    let mp = 0;
    let emb = 0;
    
    const mpIds = new Set<string>();
    mpIds.add('cat_mp');
    const embIds = new Set<string>();
    embIds.add('cat_emb');
    
    categories.forEach(c => {
      if (c.parentId === 'cat_mp') mpIds.add(c.id);
      if (c.parentId === 'cat_emb') embIds.add(c.id);
    });

    demands.forEach(d => {
      if (d.categoryId) {
        if (mpIds.has(d.categoryId)) mp++;
        if (embIds.has(d.categoryId)) emb++;
      }
    });

    return {
      all: demands.length,
      mp,
      emb
    };
  }, [demands, categories]);

  // Main Category filtered demands for KPI counts
  const mainFilteredDemands = useMemo(() => {
    if (activeMainTab === 'ALL') return demands;
    const allowedCategoryIds = new Set<string>();
    allowedCategoryIds.add(activeMainTab);
    categories.forEach(c => {
      if (c.parentId === activeMainTab) {
        allowedCategoryIds.add(c.id);
      }
    });
    return demands.filter(d => d.categoryId && allowedCategoryIds.has(d.categoryId));
  }, [demands, activeMainTab, categories]);

  // Filtered + sorted
  const filteredDemands = useMemo(() => {
    let result = demands;

    // Filter by main category tab
    if (activeMainTab !== 'ALL') {
      const allowedCategoryIds = new Set<string>();
      allowedCategoryIds.add(activeMainTab);
      categories.forEach(c => {
        if (c.parentId === activeMainTab) {
          allowedCategoryIds.add(c.id);
        }
      });
      result = result.filter(d => d.categoryId && allowedCategoryIds.has(d.categoryId));
    }

    // Subcategory filter
    if (selectedCategory) {
      result = result.filter(d => d.categoryId === selectedCategory);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        (d.itemCode || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
      );
    }
    // Urgency filter
    if (urgencyFilter) {
      result = result.filter(d => d.urgency === urgencyFilter);
    }
    // Sort
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  }, [demands, activeMainTab, selectedCategory, categories, search, urgencyFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-zinc-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-zinc-700" />
      : <ArrowDown className="h-3 w-3 text-zinc-700" />;
  };

  const toggleSelection = (itemCode: string) => {
    const newSel = new Set(selectedItems);
    if (newSel.has(itemCode)) newSel.delete(itemCode);
    else newSel.add(itemCode);
    setSelectedItems(newSel);
  };

  const selectAll = () => {
    if (selectedItems.size === filteredDemands.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredDemands.map(d => d.itemCode)));
    }
  };

  const handleCreateQuotation = async () => {
    if (selectedItems.size === 0) return;
    const title = prompt('Título para a nova cotação:');
    if (!title) return;
    try {
      const selectedDemands = demands.filter(d => selectedItems.has(d.itemCode));
      await api.createQuotation(title, selectedDemands.map(d => d.itemCode), selectedDemands.map(d => d.recommendedQty));
      alert('Cotação criada com sucesso!');
      setSelectedItems(new Set());
    } catch (e) {
      console.error(e);
      alert('Erro ao criar cotação');
    }
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-11rem)]">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
        <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm text-left flex items-center justify-between">
          <div>
            <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Itens com Demanda</span>
            <p className="text-2xl font-extrabold text-zinc-900 mt-1">
              {mainFilteredDemands.filter(d => d.recommendedQty > 0).length} <span className="text-xs font-semibold text-zinc-500">de {mainFilteredDemands.length}</span>
            </p>
          </div>
          <div className="p-2.5 bg-zinc-50 border border-zinc-100 rounded-lg text-zinc-650">
            <Package size={20} />
          </div>
        </div>
        
        <div className="bg-red-50/40 border border-red-100 p-4 rounded-xl shadow-sm text-left flex items-center justify-between">
          <div>
            <span className="text-[10px] text-red-500 font-bold uppercase block tracking-wider">Demanda Crítica</span>
            <p className="text-2xl font-extrabold text-red-700 mt-1">
              {mainFilteredDemands.filter(d => d.urgency === 'critical').length} <span className="text-xs font-semibold text-zinc-500">itens</span>
            </p>
          </div>
          <div className="p-2.5 bg-red-100/50 border border-red-200/50 rounded-lg text-red-650">
            <AlertCircle size={20} />
          </div>
        </div>

        <div className="bg-amber-50/40 border border-amber-100 p-4 rounded-xl shadow-sm text-left flex items-center justify-between">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase block tracking-wider">Demanda em Atenção</span>
            <p className="text-2xl font-extrabold text-amber-700 mt-1">
              {mainFilteredDemands.filter(d => d.urgency === 'warning').length} <span className="text-xs font-semibold text-zinc-500">itens</span>
            </p>
          </div>
          <div className="p-2.5 bg-amber-100/50 border border-amber-200/50 rounded-lg text-zinc-650">
            <AlertCircle size={20} />
          </div>
        </div>

        <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl shadow-sm text-left flex items-center justify-between">
          <div>
            <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Cobertura Alvo</span>
            <p className="text-2xl font-extrabold text-zinc-900 mt-1">
              {targetDays} <span className="text-xs font-semibold text-zinc-500">dias</span>
            </p>
          </div>
          <div className="p-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-650">
            <ArrowDownToLine size={20} />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col flex-1">
        {/* Category Tabs */}
        {mode === 'all' && (
          <div className="flex border-b border-zinc-200 bg-zinc-50/50 px-4 pt-2 shrink-0 gap-2">
            {([
              { id: 'ALL', name: 'Todos', count: counts.all },
              { id: 'cat_mp', name: 'Matéria-prima', count: counts.mp },
              { id: 'cat_emb', name: 'Embalagens', count: counts.emb }
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveMainTab(tab.id);
                  setSelectedCategory(null);
                }}
                className={cn(
                  "px-4 py-2 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-2",
                  activeMainTab === tab.id
                    ? "border-zinc-900 text-zinc-900 font-extrabold"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                )}
              >
                {tab.name}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono",
                  activeMainTab === tab.id ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-600"
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}

      {/* Header & Filters */}
      <div className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0 gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 bg-white border border-zinc-300 rounded-md px-3 py-1.5">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              type="text" placeholder="Buscar código ou descrição..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="text-sm bg-transparent border-none focus:outline-none w-48"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-500" />
            <select
              value={selectedCategory || ''}
              onChange={e => setSelectedCategory(e.target.value || null)}
              className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            >
              <option value="">{activeMainTab === 'ALL' ? 'Todas as Categorias' : 'Todas as Subcategorias'}</option>
              {filteredSubcategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Urgency Filter */}
          <select
            value={urgencyFilter}
            onChange={e => setUrgencyFilter(e.target.value)}
            className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none"
          >
            <option value="">Todos os Status</option>
            <option value="critical">🔴 Crítico (&lt;30 dias)</option>
            <option value="warning">🟡 Atenção (30-60 dias)</option>
            <option value="ok">🟢 OK (&gt;60 dias)</option>
          </select>

          {/* Target Days */}
          <div className="flex items-center gap-2 border-l border-zinc-300 pl-4">
            <span className="text-sm text-zinc-600">Meta:</span>
            <input
              type="number"
              value={targetDays}
              onChange={e => setTargetDays(Number(e.target.value))}
              className="w-16 text-sm border border-zinc-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            />
            <span className="text-xs text-zinc-500">dias</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{filteredDemands.length} itens</span>
          <button
            onClick={handleCreateQuotation}
            disabled={selectedItems.size === 0}
            className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-md font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ShoppingCart className="h-4 w-4" />
            Criar Cotação ({selectedItems.size})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500">Carregando...</div>
        ) : filteredDemands.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500 flex-col gap-2">
            <Package className="h-8 w-8 text-zinc-300" />
            <p>Nenhuma demanda encontrada.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-100 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 border-b border-zinc-200 w-10">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === filteredDemands.length && filteredDemands.length > 0}
                    onChange={selectAll}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                </th>
                <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 cursor-pointer hover:text-zinc-900"
                  onClick={() => toggleSort('description')}>
                  <span className="flex items-center gap-1">Ref / Item <SortIcon col="description" /></span>
                </th>
                <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-right cursor-pointer hover:text-zinc-900"
                  onClick={() => toggleSort('currentStock')}>
                  <span className="flex items-center justify-end gap-1">Estoque <SortIcon col="currentStock" /></span>
                </th>
                <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-right cursor-pointer hover:text-zinc-900"
                  onClick={() => toggleSort('overallAvg')}>
                  <span className="flex items-center justify-end gap-1">Média Mês <SortIcon col="overallAvg" /></span>
                </th>
                <th className="px-4 py-3 font-semibold text-zinc-500 border-b border-zinc-200 text-center text-[10px] uppercase tracking-wider">
                  Médias (24 | 25 | 26)
                </th>
                <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-right cursor-pointer hover:text-zinc-900"
                  onClick={() => toggleSort('futureStockForecast')}>
                  <span className="flex items-center justify-end gap-1">Prev. Futura <SortIcon col="futureStockForecast" /></span>
                </th>
                <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-center cursor-pointer hover:text-zinc-900"
                  onClick={() => toggleSort('estimatedDurationDays')}>
                  <span className="flex items-center justify-center gap-1">Duração Est. <SortIcon col="estimatedDurationDays" /></span>
                </th>
                <th className="px-4 py-3 font-semibold text-zinc-900 border-b border-zinc-200 text-right cursor-pointer hover:text-zinc-900"
                  onClick={() => toggleSort('recommendedQty')}>
                  <span className="flex items-center justify-end gap-1">Qtd Recom. <SortIcon col="recommendedQty" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredDemands.map(demand => (
                <tr
                  key={demand.itemCode}
                  className={cn(
                    "hover:bg-zinc-50 transition-colors",
                    selectedItems.has(demand.itemCode) && "bg-blue-50/50"
                  )}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(demand.itemCode)}
                      onChange={() => toggleSelection(demand.itemCode)}
                      className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-zinc-500">{demand.itemCode}</div>
                    <div className="font-medium text-zinc-900" title={demand.description}>
                      {demand.description}
                    </div>
                    {demand.notes && (
                      <div className="text-[10px] text-zinc-400 italic mt-0.5 truncate max-w-xs">
                        Obs: {demand.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-medium">{demand.currentStock.toLocaleString('pt-BR')} {demand.unit}</div>
                    <div className="text-xs text-zinc-500" title="Reserva + Pedidos">
                      -{demand.reservedQty} R / +{demand.inOrders} P
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-700">
                    {demand.overallAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {demand.unit}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="text-[10px] text-zinc-400 bg-zinc-50 py-1 rounded">
                      {demand.avg2024.toFixed(0)} | {demand.avg2025.toFixed(0)} | {demand.avg2026.toFixed(0)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-900">
                    {demand.futureStockForecast.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {demand.unit}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                      demand.urgency === 'critical' && "bg-red-100 text-red-800",
                      demand.urgency === 'warning' && "bg-amber-100 text-amber-800",
                      demand.urgency === 'ok' && "bg-emerald-100 text-emerald-800"
                    )}>
                      {demand.estimatedDurationDays === 9999 ? '∞' : `${demand.estimatedDurationDays} dias`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-zinc-900 text-base">
                      {demand.recommendedQty.toLocaleString('pt-BR')}
                    </span>
                    <span className="text-xs text-zinc-500 ml-1">{demand.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  </div>
  );
}
