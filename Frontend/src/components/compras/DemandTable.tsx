import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { DemandResult, Category, Item } from '../../types';
import { AlertCircle, ArrowDownToLine, Package, Filter, CheckCircle2, ShoppingCart, Search, ArrowUpDown, ArrowUp, ArrowDown, Clock, TrendingUp, BarChart3, FileText, ChevronRight, X, Info, RefreshCw, Database, Factory } from 'lucide-react';
import { cn } from '../../lib/utils';

interface InsumoDetalhes {
  code: string;
  description: string;
  unit: string;
  notes: string | null;
  categoryId: string | null;
  categoryName: string | null;
  currentStock: number;
  consumptionYoy: {
    year: number;
    totalQty: number;
    monthlyAvg: number;
  }[];
  monthlyPurchases: {
    month: string;
    qty: number;
  }[];
  monthlyConsumption: {
    month: string;
    qty: number;
  }[];
  recentInvoices: {
    invoiceNumber: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
    supplierName: string;
    invoiceDate: string;
  }[];
  lastUsedDate: string | null;
  lastUsedLote: string | null;
  lastReceivedDate: string | null;
  lastReceivedDoc: string | null;
  productsUsedIn: {
    productCode: string;
    description: string;
    quantity: number;
  }[];
  pendingOrders: {
    nPedido: number;
    dPedido: string | null;
    cNomeF: string | null;
    nQtde: number;
    nChegou: number;
    nPreco: number;
  }[];
  quotations: {
    id: string;
    title: string;
    status: string;
    recommendedQty: number;
    approvedQty: number | null;
    finalQty: number | null;
    createdAt: string;
  }[];
  openProductionOrders: {
    productCode: string;
    productDescription: string;
    productionDate: string;
    quantityProduced: number;
    insumoQtyPerUnit: number;
    insumoQtyNeeded: number;
    observations: string | null;
    loteNumber: string;
    status: string;
    statusLabel: string;
    insumoQtyWeighed: number;
    pesagemCompleted: boolean;
  }[];
}

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

  const [selectedItemCode, setSelectedItemCode] = useState<string | null>(null);
  const [details, setDetails] = useState<InsumoDetalhes | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [drawerTab, setDrawerTab] = useState<'visao_geral' | 'consumo' | 'pedidos' | 'producao' | 'cotacoes' | 'semelhantes'>('visao_geral');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState('');
  
  // Similar items state
  const [similarItems, setSimilarItems] = useState<Item[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [similarSearch, setSimilarSearch] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

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

  const API_BASE = 'http://127.0.0.1:3001/api';

  const loadDetails = async (code: string) => {
    setDetailsLoading(true);
    setDetails(null);
    try {
      const res = await fetch(`${API_BASE}/compras/insumos/${code}/detalhes`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data);
        if (data.consumptionYoy && data.consumptionYoy.length > 0) {
          setSelectedYear(data.consumptionYoy[0].year);
        } else {
          setSelectedYear(new Date().getFullYear());
        }
      }
    } catch (e) {
      console.error("Erro ao carregar detalhes do insumo:", e);
    } finally {
      setDetailsLoading(false);
    }
  };

  const loadSimilarItems = async () => {
    if (!selectedItemCode) return;
    setSimilarLoading(true);
    try {
      const data = await api.getSimilarItems(selectedItemCode);
      setSimilarItems(data);
      if (allItems.length === 0) {
        const items = await api.getItems();
        setAllItems(items.filter(i => !i.isIgnored && i.code !== selectedItemCode));
      }
    } catch (e) {
      console.error("Erro ao carregar itens semelhantes:", e);
    } finally {
      setSimilarLoading(false);
    }
  };

  useEffect(() => {
    if (selectedItemCode) {
      loadDetails(selectedItemCode);
      setDrawerTab('visao_geral');
      setIsEditingNotes(false);
      setTempNotes('');
      setSimilarItems([]);
      setSimilarSearch('');
    } else {
      setDetails(null);
    }
  }, [selectedItemCode]);

  useEffect(() => {
    if (selectedItemCode && drawerTab === 'semelhantes') {
      loadSimilarItems();
    }
  }, [selectedItemCode, drawerTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, urgencyFilter, activeMainTab]);

  const filteredSubcategories = useMemo(() => {
    if (activeMainTab === 'ALL') {
      return categories.filter(c => c.parentId !== null);
    }
    return categories.filter(c => c.parentId === activeMainTab);
  }, [categories, activeMainTab]);

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
    return { all: demands.length, mp, emb };
  }, [demands, categories]);

  const mainFilteredDemands = useMemo(() => {
    if (activeMainTab === 'ALL') return demands;
    const allowedCategoryIds = new Set<string>();
    allowedCategoryIds.add(activeMainTab);
    categories.forEach(c => {
      if (c.parentId === activeMainTab) allowedCategoryIds.add(c.id);
    });
    return demands.filter(d => d.categoryId && allowedCategoryIds.has(d.categoryId));
  }, [demands, activeMainTab, categories]);

  const filteredDemands = useMemo(() => {
    let result = demands;
    if (activeMainTab !== 'ALL') {
      const allowedCategoryIds = new Set<string>();
      allowedCategoryIds.add(activeMainTab);
      categories.forEach(c => {
        if (c.parentId === activeMainTab) allowedCategoryIds.add(c.id);
      });
      result = result.filter(d => d.categoryId && allowedCategoryIds.has(d.categoryId));
    }
    if (selectedCategory) result = result.filter(d => d.categoryId === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(d => (d.itemCode || '').toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q));
    }
    if (urgencyFilter) result = result.filter(d => d.urgency === urgencyFilter);
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  }, [demands, activeMainTab, selectedCategory, categories, search, urgencyFilter, sortKey, sortDir]);

  const paginatedDemands = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredDemands.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredDemands, currentPage]);

  const totalPages = Math.ceil(filteredDemands.length / itemsPerPage);

  const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '-';
    try { const date = new Date(d); return date.toLocaleDateString('pt-BR'); } catch { return d; }
  };

  const availableYears = useMemo(() => {
    if (!details) return [new Date().getFullYear()];
    const years = new Set<number>();
    if (details.consumptionYoy) details.consumptionYoy.forEach(c => years.add(c.year));
    if (details.monthlyConsumption) details.monthlyConsumption.forEach(c => { if (c.month) years.add(parseInt(c.month.split('-')[0], 10)); });
    if (details.monthlyPurchases) details.monthlyPurchases.forEach(c => { if (c.month) years.add(parseInt(c.month.split('-')[0], 10)); });
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [details]);

  const monthlyDataForYear = useMemo(() => {
    if (!details || !details.monthlyConsumption) return [];
    const months = Array.from({ length: 12 }, (_, i) => {
      const mStr = String(i + 1).padStart(2, '0');
      return { monthKey: `${selectedYear}-${mStr}`, label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][i], qty: 0 };
    });
    details.monthlyConsumption.forEach(p => {
      const match = months.find(m => m.monthKey === p.month);
      if (match) match.qty = p.qty;
    });
    const maxQty = Math.max(...months.map(m => m.qty), 1);
    return months.map(m => ({ ...m, percent: (m.qty / maxQty) * 100 }));
  }, [details, selectedYear]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-zinc-300" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-zinc-700" /> : <ArrowDown className="h-3 w-3 text-zinc-700" />;
  };

  const toggleSelection = (itemCode: string) => {
    const newSel = new Set(selectedItems);
    if (newSel.has(itemCode)) newSel.delete(itemCode);
    else newSel.add(itemCode);
    setSelectedItems(newSel);
  };

  const selectAll = () => {
    if (selectedItems.size === filteredDemands.length) setSelectedItems(new Set());
    else setSelectedItems(new Set(filteredDemands.map(d => d.itemCode)));
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
    } catch (e) { console.error(e); alert('Erro ao criar cotação'); }
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-11rem)]">
      {mode !== 'materia_prima' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm text-left flex items-center justify-between">
            <div>
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Itens com Demanda</span>
              <p className="text-2xl font-extrabold text-zinc-900 mt-1">{mainFilteredDemands.filter(d => d.recommendedQty > 0).length} <span className="text-xs font-semibold text-zinc-500">de {mainFilteredDemands.length}</span></p>
            </div>
            <div className="p-2.5 bg-zinc-50 border border-zinc-100 rounded-lg text-zinc-650"><Package size={20} /></div>
          </div>
          <div className="bg-red-50/40 border border-red-100 p-4 rounded-xl shadow-sm text-left flex items-center justify-between">
            <div>
              <span className="text-[10px] text-red-500 font-bold uppercase block tracking-wider">Demanda Crítica</span>
              <p className="text-2xl font-extrabold text-red-700 mt-1">{mainFilteredDemands.filter(d => d.urgency === 'critical').length} <span className="text-xs font-semibold text-zinc-500">itens</span></p>
            </div>
            <div className="p-2.5 bg-red-100/50 border border-red-200/50 rounded-lg text-red-650"><AlertCircle size={20} /></div>
          </div>
          <div className="bg-amber-50/40 border border-amber-100 p-4 rounded-xl shadow-sm text-left flex items-center justify-between">
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase block tracking-wider">Demanda em Atenção</span>
              <p className="text-2xl font-extrabold text-amber-700 mt-1">{mainFilteredDemands.filter(d => d.urgency === 'warning').length} <span className="text-xs font-semibold text-zinc-500">itens</span></p>
            </div>
            <div className="p-2.5 bg-amber-100/50 border border-amber-200/50 rounded-lg text-zinc-650"><AlertCircle size={20} /></div>
          </div>
          <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl shadow-sm text-left flex items-center justify-between">
            <div>
              <span className="text-[10px] text-zinc-400 font-bold uppercase block tracking-wider">Cobertura Alvo</span>
              <p className="text-2xl font-extrabold text-zinc-900 mt-1">{targetDays} <span className="text-xs font-semibold text-zinc-500">dias</span></p>
            </div>
            <div className="p-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-650"><ArrowDownToLine size={20} /></div>
          </div>
        </div>
      )}

      <div className="flex-1 flex gap-4 overflow-hidden relative">
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col w-full">
          {mode === 'all' && (
            <div className="flex border-b border-zinc-200 bg-zinc-50/50 px-4 pt-2 shrink-0 gap-2">
              {([
                { id: 'ALL', name: 'Todos', count: counts.all },
                { id: 'cat_mp', name: 'Matéria-prima', count: counts.mp },
                { id: 'cat_emb', name: 'Embalagens', count: counts.emb }
              ] as const).map(tab => (
                <button key={tab.id} onClick={() => { setActiveMainTab(tab.id); setSelectedCategory(null); }} className={cn("px-4 py-2 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-2", activeMainTab === tab.id ? "border-zinc-900 text-zinc-900 font-extrabold" : "border-transparent text-zinc-500 hover:text-zinc-800")}>
                  {tab.name}
                  <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono", activeMainTab === tab.id ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-600")}>{tab.count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0 gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 bg-white border border-zinc-300 rounded-md px-3 py-1.5">
                <Search className="h-4 w-4 text-zinc-400" />
                <input type="text" placeholder="Buscar código ou descrição..." value={search} onChange={e => setSearch(e.target.value)} className="text-sm bg-transparent border-none focus:outline-none w-48" />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-zinc-500" />
                <select value={selectedCategory || ''} onChange={e => setSelectedCategory(e.target.value || null)} className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none">
                  <option value="">{activeMainTab === 'ALL' ? 'Todas as Categorias' : 'Todas as Subcategorias'}</option>
                  {filteredSubcategories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
              <select value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)} className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none">
                <option value="">Todos os Status</option>
                <option value="critical">🔴 Crítico (&lt;30 dias)</option>
                <option value="warning">🟡 Atenção (30-60 dias)</option>
                <option value="ok">🟢 OK (&gt;60 dias)</option>
              </select>
              <div className="flex items-center gap-2 border-l border-zinc-300 pl-4">
                <span className="text-sm text-zinc-600">Meta:</span>
                <input type="number" value={targetDays} onChange={e => setTargetDays(Number(e.target.value))} className="w-16 text-sm border border-zinc-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none" />
                <span className="text-xs text-zinc-500">dias</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">{filteredDemands.length} itens</span>
              {mode !== 'materia_prima' && (
                <button onClick={handleCreateQuotation} disabled={selectedItems.size === 0} className="text-sm bg-zinc-900 text-white px-4 py-2 rounded-md font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Criar Cotação ({selectedItems.size})
                </button>
              )}
            </div>
          </div>

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
                    {mode !== 'materia_prima' && (
                      <th className="px-4 py-3 border-b border-zinc-200 w-10">
                        <input type="checkbox" checked={selectedItems.size === filteredDemands.length && filteredDemands.length > 0} onChange={selectAll} className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900" />
                      </th>
                    )}
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('description')}><span className="flex items-center gap-1">Ref / Item <SortIcon col="description" /></span></th>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-right cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('currentStock')}><span className="flex items-center justify-end gap-1">Estoque <SortIcon col="currentStock" /></span></th>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-right cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('overallAvg')}><span className="flex items-center justify-end gap-1">Média Mês <SortIcon col="overallAvg" /></span></th>
                    <th className="px-4 py-3 font-semibold text-zinc-500 border-b border-zinc-200 text-center text-[10px] uppercase tracking-wider">Médias (24 | 25 | 26)</th>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-right cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('futureStockForecast')}><span className="flex items-center justify-end gap-1">Prev. Futura <SortIcon col="futureStockForecast" /></span></th>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-center cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('estimatedDurationDays')}><span className="flex items-center justify-center gap-1">Duração Est. <SortIcon col="estimatedDurationDays" /></span></th>
                    <th className="px-4 py-3 font-semibold text-zinc-900 border-b border-zinc-200 text-right cursor-pointer hover:text-zinc-900" onClick={() => toggleSort('recommendedQty')}><span className="flex items-center justify-end gap-1">Qtd Recom. <SortIcon col="recommendedQty" /></span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {paginatedDemands.map(demand => (
                    <tr key={demand.itemCode} onClick={() => setSelectedItemCode(demand.itemCode)} className={cn("hover:bg-zinc-50 transition-colors cursor-pointer", selectedItemCode === demand.itemCode && "bg-zinc-100", selectedItems.has(demand.itemCode) && "bg-blue-50/50")}>
                      {mode !== 'materia_prima' && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedItems.has(demand.itemCode)} onChange={() => toggleSelection(demand.itemCode)} className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900" />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-zinc-500">{demand.itemCode}</div>
                        <div className="font-medium text-zinc-900" title={demand.description}>{demand.description}</div>
                        {demand.notes && <div className="text-[10px] text-zinc-400 italic mt-0.5 truncate max-w-xs">Obs: {demand.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium">{demand.currentStock.toLocaleString('pt-BR')} {demand.unit}</div>
                        <div className="text-xs text-zinc-500" title="Reserva + Pedidos">-{demand.reservedQty} R / +{demand.inOrders} P</div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-700">{demand.overallAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {demand.unit}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="text-[10px] text-zinc-400 bg-zinc-50 py-1 rounded">{demand.avg2024.toFixed(0)} | {demand.avg2025.toFixed(0)} | {demand.avg2026.toFixed(0)}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-zinc-900">{demand.futureStockForecast.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {demand.unit}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", demand.urgency === 'critical' && "bg-red-100 text-red-800", demand.urgency === 'warning' && "bg-amber-100 text-amber-800", demand.urgency === 'ok' && "bg-emerald-100 text-emerald-800")}>
                          {demand.estimatedDurationDays === 9999 ? '∞' : `${demand.estimatedDurationDays} dias`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-zinc-900 text-base">{demand.recommendedQty.toLocaleString('pt-BR')}</span>
                        <span className="text-xs text-zinc-500 ml-1">{demand.unit}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0">
              <span className="text-xs text-zinc-500">Mostrando {Math.min(filteredDemands.length, (currentPage - 1) * itemsPerPage + 1)} a {Math.min(filteredDemands.length, currentPage * itemsPerPage)} de {filteredDemands.length} itens</span>
              <div className="flex items-center gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-bold bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed">Anterior</button>
                <span className="text-xs text-zinc-500">Pág {currentPage} de {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-bold bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed">Próximo</button>
              </div>
            </div>
          )}
        </div>

        {selectedItemCode && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
            <div className="absolute inset-0 cursor-pointer" onClick={() => setSelectedItemCode(null)} />
            
            <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-350 z-10">
              <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-start shrink-0">
                <div className="min-w-0 flex-1 text-left">
                  <span className="px-2 py-0.5 bg-zinc-900 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                    Ficha Técnica & Consumo
                  </span>
                  <h3 className="font-bold text-zinc-900 text-lg mt-1 truncate">
                    {details?.description || 'Carregando...'}
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">Código: {selectedItemCode}</p>
                </div>
                <button 
                  onClick={() => setSelectedItemCode(null)} 
                  className="p-1.5 hover:bg-zinc-150 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

            {/* Drawer Tab Navigation */}
            <div className="flex border-b border-zinc-200 bg-zinc-50 shrink-0">
              {([
                { id: 'visao_geral' as const, label: 'Visão Geral', icon: Info },
                { id: 'consumo' as const, label: 'Consumo', icon: BarChart3 },
                { id: 'pedidos' as const, label: 'Pedidos', icon: Clock },
                { id: 'producao' as const, label: 'Produção', icon: Factory },
                { id: 'cotacoes' as const, label: 'Cotações', icon: ShoppingCart },
                { id: 'semelhantes' as const, label: 'Semelhantes', icon: Database },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDrawerTab(tab.id)}
                  className={cn(
                    "flex-1 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    drawerTab === tab.id ? "border-zinc-900 text-zinc-900 font-extrabold" : "border-transparent text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Detail Body */}
            {detailsLoading ? (
              <div className="flex-1 flex items-center justify-center text-zinc-400 font-semibold gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-zinc-500" />
                Carregando análises detalhadas...
              </div>
            ) : details ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">

                {/* ===== TAB: Visão Geral ===== */}
                {drawerTab === 'visao_geral' && (
                  <>
                    {/* Info Stats Cards */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                        <span className="text-[9px] text-zinc-400 font-bold uppercase block tracking-wider">Estoque Atual</span>
                        <p className="text-lg font-extrabold text-zinc-900 mt-1">
                          {details.currentStock.toLocaleString('pt-BR')} <span className="text-xs font-semibold text-zinc-500">{details.unit}</span>
                        </p>
                      </div>
                      <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                        <span className="text-[9px] text-zinc-400 font-bold uppercase block tracking-wider">Último Recebimento</span>
                        <p className="text-xs font-bold text-zinc-805 mt-2 truncate" title={details.lastReceivedDoc ? `NF #${details.lastReceivedDoc}` : undefined}>
                          {formatDate(details.lastReceivedDate)}
                        </p>
                        <span className="text-[9px] text-zinc-400 block mt-0.5">
                          {details.lastReceivedDoc ? `NF #${details.lastReceivedDoc}` : '-'}
                        </span>
                      </div>
                      <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                        <span className="text-[9px] text-zinc-400 font-bold uppercase block tracking-wider">Último Uso Produção</span>
                        <p className="text-xs font-bold text-zinc-805 mt-2 truncate" title={details.lastUsedLote ? `Lote #${details.lastUsedLote}` : undefined}>
                          {formatDate(details.lastUsedDate)}
                        </p>
                        <span className="text-[9px] text-zinc-400 block mt-0.5">
                          {details.lastUsedLote ? `Lote: ${details.lastUsedLote}` : '-'}
                        </span>
                      </div>
                    </div>

                    {/* Notes Panel (Editable) */}
                    <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 text-left">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                          <Info className="h-4 w-4 text-zinc-400 shrink-0" /> Observações do Insumo
                        </h5>
                        {isEditingNotes ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  await api.updateItemDetails(details.code, tempNotes.trim() || null, false);
                                  setIsEditingNotes(false);
                                  loadDetails(details.code);
                                } catch (e) {
                                  console.error(e);
                                  alert("Erro ao salvar observações");
                                }
                              }}
                              className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => {
                                setTempNotes(details.notes || '');
                                setIsEditingNotes(false);
                              }}
                              className="text-[10px] font-bold text-zinc-400 hover:text-zinc-650 transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setTempNotes(details.notes || '');
                              setIsEditingNotes(true);
                            }}
                            className="text-[10px] font-bold text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                      {isEditingNotes ? (
                        <textarea
                          value={tempNotes}
                          onChange={(e) => setTempNotes(e.target.value)}
                          className="w-full text-xs border border-zinc-300 rounded-md p-2 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white"
                          rows={3}
                          placeholder="Digite observações sobre este insumo..."
                        />
                      ) : (
                        <p className={cn("text-xs mt-0.5 whitespace-pre-wrap", details.notes ? "text-zinc-750" : "text-zinc-400 italic")}>
                          {details.notes || "Nenhuma observação registrada."}
                        </p>
                      )}
                    </div>

                    {/* Products Used In */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-105 pb-2">
                        <Database className="h-4 w-4 text-zinc-650" />
                        <h4 className="font-extrabold text-sm text-zinc-900">Produtos que Utilizam este Insumo</h4>
                      </div>
                      {!details.productsUsedIn || details.productsUsedIn.length === 0 ? (
                        <p className="text-xs text-zinc-400 py-2">Este insumo não está cadastrado em nenhuma fórmula de produto ativo.</p>
                      ) : (
                        <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150 sticky top-0">
                              <tr>
                                <th className="px-4 py-2.5">Código</th>
                                <th className="px-4 py-2.5">Produto</th>
                                <th className="px-4 py-2.5 text-right">Qtd na Fórmula</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {details.productsUsedIn.map((p) => (
                                <tr key={p.productCode} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-2 font-bold text-zinc-500 font-mono">{p.productCode}</td>
                                  <td className="px-4 py-2 font-semibold text-zinc-800">{p.description}</td>
                                  <td className="px-4 py-2 text-right font-medium text-zinc-900">
                                    {p.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Recent Invoices / NF */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-105 pb-2">
                        <FileText className="h-4 w-4 text-zinc-650" />
                        <h4 className="font-extrabold text-sm text-zinc-900">Histórico Recente de NF</h4>
                      </div>
                      {details.recentInvoices.length === 0 ? (
                        <p className="text-xs text-zinc-400 py-3">Sem registros de notas fiscais de compra para este insumo.</p>
                      ) : (
                        <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                              <tr>
                                <th className="px-4 py-3">NF</th>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Fornecedor</th>
                                <th className="px-4 py-3 text-right">Qtd</th>
                                <th className="px-4 py-3 text-right">Preço Unit</th>
                                <th className="px-4 py-3 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 text-[11px]">
                              {details.recentInvoices.map((inv, idx) => (
                                <tr key={`${inv.invoiceNumber}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-2.5 font-bold text-zinc-700">#{inv.invoiceNumber}</td>
                                  <td className="px-4 py-2.5 text-zinc-550">{formatDate(inv.invoiceDate)}</td>
                                  <td className="px-4 py-2.5 font-semibold text-zinc-850 max-w-[150px] truncate" title={inv.supplierName}>
                                    {inv.supplierName}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-zinc-800">
                                    {inv.quantity.toLocaleString('pt-BR')}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-zinc-550">
                                    {formatCurrency(inv.unitPrice)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-bold text-zinc-900">
                                    {formatCurrency(inv.totalValue)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ===== TAB: Consumo ===== */}
                {drawerTab === 'consumo' && (
                  <>
                    {/* YoY Consumption */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-105 pb-2">
                        <TrendingUp className="h-4 w-4 text-zinc-650" />
                        <h4 className="font-extrabold text-sm text-zinc-900">Médias de Consumo Ano a Ano</h4>
                      </div>
                      {details.consumptionYoy.length === 0 ? (
                        <p className="text-xs text-zinc-400 py-3">Sem histórico de consumo registrado.</p>
                      ) : (
                        <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                              <tr>
                                <th className="px-4 py-3">Ano</th>
                                <th className="px-4 py-3 text-right">Consumo Total ({details.unit})</th>
                                <th className="px-4 py-3 text-right">Média Mensal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {details.consumptionYoy.map((c) => (
                                <tr key={c.year} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-2.5 font-bold text-zinc-805">{c.year}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-zinc-950">
                                    {c.totalQty.toLocaleString('pt-BR')}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-zinc-550">
                                    {c.monthlyAvg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Monthly Consumption Detailed (Bar chart) */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center border-b border-zinc-105 pb-2">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-zinc-650" />
                          <h4 className="font-extrabold text-sm text-zinc-900">Consumo Mensal Detalhado</h4>
                        </div>
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(Number(e.target.value))}
                          className="px-2.5 py-1 bg-white border border-zinc-200 rounded-lg text-xs font-bold font-sans cursor-pointer focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                        >
                          {availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>

                      {monthlyDataForYear.length === 0 ? (
                        <p className="text-xs text-zinc-400 py-3">Nenhum consumo mensal registrado neste ano.</p>
                      ) : (
                        <div className="p-4 bg-zinc-50/50 border border-zinc-150 rounded-xl space-y-3">
                          <div className="grid grid-cols-12 gap-1.5 h-36 items-end pt-4 px-2">
                            {monthlyDataForYear.map((m) => (
                              <div key={m.monthKey} className="group relative flex flex-col items-center h-full justify-end">
                                <div className="absolute bottom-full mb-1 bg-zinc-900 text-white text-[9px] font-bold py-1 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-md">
                                  {m.qty.toLocaleString('pt-BR')} {details.unit}
                                </div>
                                <div 
                                  style={{ height: `${m.percent}%` }}
                                  className="w-full bg-zinc-850 rounded-t-sm group-hover:bg-zinc-900 transition-colors cursor-pointer"
                                />
                                <span className="text-[8px] text-zinc-400 font-bold uppercase mt-1.5 scale-90 md:scale-100">
                                  {m.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ===== TAB: Pedidos em Aberto ===== */}
                {drawerTab === 'pedidos' && (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-105 pb-2">
                        <Clock className="h-4 w-4 text-zinc-650" />
                        <h4 className="font-extrabold text-sm text-zinc-900">Pedidos de Compra em Aberto</h4>
                      </div>
                      {!details.pendingOrders || details.pendingOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                          <Clock className="h-8 w-8 text-zinc-300 mb-2" />
                          <p className="text-sm font-medium">Nenhum pedido de compra em aberto</p>
                          <p className="text-xs mt-0.5">Este insumo não possui pedidos pendentes.</p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl text-left">
                              <span className="text-[9px] text-blue-500 font-bold uppercase tracking-wider">Pedidos Abertos</span>
                              <p className="text-xl font-extrabold text-blue-700 mt-0.5">{details.pendingOrders.length}</p>
                            </div>
                            <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl text-left">
                              <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider">Qtd Total Pendente</span>
                              <p className="text-xl font-extrabold text-amber-700 mt-0.5">
                                {details.pendingOrders.reduce((sum, po) => sum + (po.nQtde - po.nChegou), 0).toLocaleString('pt-BR')}
                                <span className="text-xs font-semibold text-zinc-500 ml-1">{details.unit}</span>
                              </p>
                            </div>
                          </div>
                          <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                              <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                                <tr>
                                  <th className="px-4 py-3">Pedido</th>
                                  <th className="px-4 py-3">Data</th>
                                  <th className="px-4 py-3">Fornecedor</th>
                                  <th className="px-4 py-3 text-right">Qtd Pedida</th>
                                  <th className="px-4 py-3 text-right">Qtd Falta</th>
                                  <th className="px-4 py-3 text-right">Preço</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100 text-[11px]">
                                {details.pendingOrders.map((po, idx) => (
                                  <tr key={`${po.nPedido}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-4 py-2.5 font-bold text-zinc-700">#{po.nPedido}</td>
                                    <td className="px-4 py-2.5 text-zinc-500">{formatDate(po.dPedido)}</td>
                                    <td className="px-4 py-2.5 font-semibold text-zinc-800 max-w-[150px] truncate" title={po.cNomeF || ''}>
                                      {po.cNomeF || '-'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-zinc-800">
                                      {po.nQtde.toLocaleString('pt-BR')}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-bold text-amber-600">
                                      {(po.nQtde - po.nChegou).toLocaleString('pt-BR')}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-zinc-900 font-bold">
                                      {formatCurrency(po.nPreco)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* ===== TAB: Cotações ===== */}
                {drawerTab === 'cotacoes' && (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-105 pb-2">
                        <ShoppingCart className="h-4 w-4 text-zinc-650" />
                        <h4 className="font-extrabold text-sm text-zinc-900">Histórico de Cotações</h4>
                      </div>
                      {!details.quotations || details.quotations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                          <ShoppingCart className="h-8 w-8 text-zinc-300 mb-2" />
                          <p className="text-sm font-medium">Nenhuma cotação registrada</p>
                          <p className="text-xs mt-0.5">Este insumo não possui cotações no histórico.</p>
                        </div>
                      ) : (
                        <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                              <tr>
                                <th className="px-4 py-3">Cotação</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Data Criação</th>
                                <th className="px-4 py-3 text-right">Qtd Recomendada</th>
                                <th className="px-4 py-3 text-right">Qtd Aprovada</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 text-[11px]">
                              {details.quotations.map((q, idx) => (
                                <tr key={`${q.id}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-2.5 font-bold text-zinc-700 truncate max-w-[150px]" title={q.title}>
                                    {q.title}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                                      q.status === 'draft' && "bg-zinc-100 text-zinc-650",
                                      q.status === 'pending_demand_approval' && "bg-amber-100 text-amber-800",
                                      q.status === 'quoting' && "bg-blue-100 text-blue-800",
                                      q.status === 'quoted' && "bg-purple-100 text-purple-800",
                                      q.status === 'approved' && "bg-emerald-100 text-emerald-800",
                                      q.status === 'ordered' && "bg-teal-100 text-teal-800",
                                    )}>
                                      {q.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-zinc-500">{formatDate(q.createdAt)}</td>
                                  <td className="px-4 py-2.5 text-right font-medium text-zinc-805">
                                    {q.recommendedQty.toLocaleString('pt-BR')}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-bold text-zinc-950">
                                    {q.finalQty ? q.finalQty.toLocaleString('pt-BR') : q.approvedQty ? q.approvedQty.toLocaleString('pt-BR') : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ===== TAB: Produção ===== */}
                {drawerTab === 'producao' && (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-105 pb-2">
                        <Factory className="h-4 w-4 text-zinc-650" />
                        <h4 className="font-extrabold text-sm text-zinc-900">Ordens de Produção em Aberto / Pendentes</h4>
                      </div>
                      {!details.openProductionOrders || details.openProductionOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
                          <Factory className="h-8 w-8 text-zinc-300 mb-2" />
                          <p className="text-sm font-medium">Nenhuma ordem de produção em aberto</p>
                          <p className="text-xs mt-0.5">Todas as OPs deste insumo estão concluídas ou pesadas.</p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2.5 mb-3">
                            <div className="bg-indigo-50/40 border border-indigo-100 p-2.5 rounded-xl text-left">
                              <span className="text-[9px] text-indigo-500 font-bold uppercase tracking-wider block">Ordens</span>
                              <p className="text-lg font-extrabold text-indigo-700 mt-0.5">{details.openProductionOrders.length}</p>
                            </div>
                            <div className="bg-amber-50/40 border border-amber-100 p-2.5 rounded-xl text-left">
                              <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block">Total Esperado</span>
                              <p className="text-lg font-extrabold text-amber-700 mt-0.5">
                                {details.openProductionOrders.reduce((sum, op) => sum + op.insumoQtyNeeded, 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                                <span className="text-[10px] font-semibold text-zinc-500 ml-1">{details.unit}</span>
                              </p>
                            </div>
                          </div>
                          <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                              <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                                <tr>
                                  <th className="px-3 py-2.5">Lote</th>
                                  <th className="px-3 py-2.5">Produto</th>
                                  <th className="px-3 py-2.5">Data</th>
                                  <th className="px-3 py-2.5 text-center">Status</th>
                                  <th className="px-3 py-2.5 text-right">Qtd Lote</th>
                                  <th className="px-3 py-2.5 text-right">Esperado</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100 text-[11px]">
                                {details.openProductionOrders.map((op, idx) => {
                                  const getStatusBadge = (status, label) => {
                                    const s = (status || '').toUpperCase();
                                    if (s === 'EA') return <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-zinc-100 text-zinc-650 uppercase">EA</span>;
                                    if (s === 'CF') return <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-100 text-emerald-800 uppercase">CF</span>;
                                    if (s === 'PG') return <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-100 text-amber-800 uppercase">PG</span>;
                                    if (s === 'PP') return <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-blue-100 text-blue-800 uppercase">PP</span>;
                                    if (s === 'PR') return <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-100 text-indigo-800 uppercase">PR</span>;
                                    if (s === 'EN') return <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-100 text-purple-800 uppercase">EN</span>;
                                    if (s === 'CA') return <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-red-100 text-red-800 uppercase">CA</span>;
                                    if (s === 'FP') return <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-zinc-200 text-zinc-800 uppercase">FP</span>;
                                    return <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-zinc-100 text-zinc-600 uppercase">{label || status}</span>;
                                  };

                                  return (
                                    <tr key={`${op.productCode}-${op.loteNumber}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                      <td className="px-3 py-2 font-bold text-zinc-700 font-mono text-[10px]">
                                        {op.loteNumber || 'S/L'}
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="font-mono text-[9px] text-zinc-400">{op.productCode}</div>
                                        <div className="font-semibold text-zinc-850 truncate max-w-[150px]" title={op.productDescription}>
                                          {op.productDescription}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-zinc-500">{formatDate(op.productionDate)}</td>
                                      <td className="px-3 py-2 text-center">
                                        {getStatusBadge(op.status, op.statusLabel)}
                                      </td>
                                      <td className="px-3 py-2 text-right font-medium text-zinc-700">
                                        {op.quantityProduced.toLocaleString('pt-BR')}
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-indigo-700">
                                        {op.insumoQtyNeeded.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}

                {/* ===== TAB: Semelhantes ===== */}
                {drawerTab === 'semelhantes' && (
                  <div className="space-y-4 text-left">
                    <div className="flex items-center gap-2 border-b border-zinc-200 pb-2">
                      <Database className="h-4 w-4 text-zinc-650" />
                      <h4 className="font-extrabold text-sm text-zinc-900">Insumos Semelhantes / Contratipos</h4>
                    </div>

                    {/* Add Similar Item Section */}
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-3">
                      <h5 className="text-xs font-bold text-zinc-700">Associar Novo Insumo Semelhante</h5>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                          <input
                            type="text"
                            placeholder="Buscar insumo por código ou descrição..."
                            value={similarSearch}
                            onChange={(e) => setSimilarSearch(e.target.value)}
                            className="w-full text-xs border border-zinc-300 rounded-md pl-8 pr-3 py-2 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white"
                          />
                        </div>
                      </div>
                      
                      {/* Search Results */}
                      {similarSearch.trim().length >= 2 && (
                        <div className="bg-white border border-zinc-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-zinc-100 shadow-sm">
                          {allItems
                            .filter(i => 
                              (i.code.toLowerCase().includes(similarSearch.toLowerCase()) || 
                               i.description.toLowerCase().includes(similarSearch.toLowerCase())) &&
                              !similarItems.some(s => s.code === i.code)
                            )
                            .slice(0, 10)
                            .map(item => (
                              <div key={item.code} className="p-2 flex items-center justify-between text-xs hover:bg-zinc-50 transition-colors">
                                <div className="truncate pr-2">
                                  <span className="font-mono font-bold text-zinc-500 mr-2">{item.code}</span>
                                  <span className="font-medium text-zinc-800">{item.description}</span>
                                </div>
                                <button
                                  onClick={async () => {
                                    try {
                                      await api.addSimilarItem(details.code, item.code);
                                      setSimilarSearch('');
                                      loadSimilarItems();
                                    } catch (e) {
                                      console.error(e);
                                      alert("Erro ao associar insumo");
                                    }
                                  }}
                                  className="text-[10px] font-bold bg-zinc-900 text-white px-2 py-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                                >
                                  Adicionar
                                </button>
                              </div>
                            ))}
                          {allItems.filter(i => 
                            (i.code.toLowerCase().includes(similarSearch.toLowerCase()) || 
                             i.description.toLowerCase().includes(similarSearch.toLowerCase())) &&
                            !similarItems.some(s => s.code === i.code)
                          ).length === 0 && (
                            <p className="text-xs text-zinc-400 p-3 text-center">Nenhum insumo disponível encontrado.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Associated Items List */}
                    {similarLoading ? (
                      <div className="flex items-center justify-center py-8 text-zinc-400 text-xs gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando semelhantes...
                      </div>
                    ) : similarItems.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-zinc-200 rounded-xl text-zinc-400">
                        <Database className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-zinc-500">Nenhum insumo contratipo/semelhante associado.</p>
                        <p className="text-[10px] mt-0.5">Use o campo de busca acima para associar insumos semelhantes.</p>
                      </div>
                    ) : (
                      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="divide-y divide-zinc-150">
                          {similarItems.map(item => (
                            <div key={item.code} className="p-3 flex items-center justify-between hover:bg-zinc-50/50 transition-colors">
                              <div className="flex-1 min-w-0 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                                    {item.code}
                                  </span>
                                  <span className="text-xs font-semibold text-zinc-800 truncate" title={item.description}>
                                    {item.description}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={async () => {
                                  if (confirm(`Remover a associação de semelhança com "${item.description}"?`)) {
                                    try {
                                      await api.removeSimilarItem(details.code, item.code);
                                      loadSimilarItems();
                                    } catch (e) {
                                      console.error(e);
                                      alert("Erro ao remover associação");
                                    }
                                  }
                                }}
                                className="text-zinc-400 hover:text-red-650 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                                title="Remover associação"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            ) : null}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
