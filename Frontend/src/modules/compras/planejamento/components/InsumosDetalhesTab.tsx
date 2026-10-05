import { apiFetch } from '../../../geral/lib/http';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Database, Calendar, TrendingUp, Info, ArrowLeft, 
  FileText, Clock, RefreshCw, BarChart3, ChevronRight, X 
} from 'lucide-react';
import { api } from '../../../geral/lib/api';
import { Item, Category } from '../../../geral/lib/types';
import { cn } from '../../../geral/lib/utils';


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
    month: string; // YYYY-MM
    qty: number;
  }[];
  monthlyConsumption: {
    month: string; // YYYY-MM
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
  consumedSinceLastReceived: number | null;
  daysSinceLastReceived: number | null;
  avgMonthlySinceLastReceived: number | null;
}

export function InsumosDetalhesTab({ parentCategoryFilter = null, active = false }: { parentCategoryFilter?: 'cat_mp' | 'cat_emb' | null; active?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Selected item details
  const [selectedItemCode, setSelectedItemCode] = useState<string | null>(null);
  const [details, setDetails] = useState<InsumoDetalhes | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [syncingStock, setSyncingStock] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Reset selected category when filter changes
  useEffect(() => {
    setSelectedCategory('ALL');
    setSelectedItemCode(null);
  }, [parentCategoryFilter]);

  useEffect(() => {
    if (active) {
      loadData();
    }
  }, [active]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsData, catsData] = await Promise.all([
        api.getItems(),
        api.getCategories()
      ]);
      setItems(itemsData);
      setCategories(catsData);
    } catch (e) {
      console.error("Erro ao carregar insumos:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (code: string) => {
    setDetailsLoading(true);
    setDetails(null);
    try {
      const res = await apiFetch(`/compras/insumos/${code}/detalhes`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data);
        // Find latest year from consumption or default to current year
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

  const handleSyncStockLive = async (code: string) => {
    if (syncingStock) return;
    setSyncingStock(true);
    try {
      await api.refreshItemStockLive(code);
      await loadDetails(code);
    } catch (e) {
      console.error("Erro ao sincronizar estoque do ERP:", e);
    } finally {
      setSyncingStock(false);
    }
  };

  useEffect(() => {

    if (selectedItemCode) {
      loadDetails(selectedItemCode);
    } else {
      setDetails(null);
    }
  }, [selectedItemCode]);

  const displayedCategories = useMemo(() => {
    if (!parentCategoryFilter) return categories;
    if (parentCategoryFilter === 'cat_emb') {
      return categories.filter(c => c.parentId === 'cat_emb' || c.parentId === 'cat_mat');
    }
    return categories.filter(c => c.parentId === parentCategoryFilter);
  }, [categories, parentCategoryFilter]);

  const filteredItems = useMemo(() => {
    const allowedCategoryIds = new Set<string>();
    if (parentCategoryFilter) {
      allowedCategoryIds.add(parentCategoryFilter);
      if (parentCategoryFilter === 'cat_emb') {
        allowedCategoryIds.add('cat_mat');
      }
      categories.forEach(c => {
        if (c.parentId === parentCategoryFilter || (parentCategoryFilter === 'cat_emb' && c.parentId === 'cat_mat')) {
          allowedCategoryIds.add(c.id);
        }
      });
    }

    return items.filter(i => {
      const matchesSearch = 
        (i.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.code || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesCategory = false;
      if (selectedCategory === 'ALL') {
        if (!parentCategoryFilter) {
          matchesCategory = true;
        } else {
          const isCategoryMatch = i.categoryId && allowedCategoryIds.has(i.categoryId);
          const isCodeMatch = parentCategoryFilter === 'cat_emb'
            ? (i.code && (i.code.startsWith('08.') || (!i.code.startsWith('9.15.') && i.code.startsWith('9.'))))
            : (i.code && i.code.startsWith('9.15.'));
          matchesCategory = Boolean(isCategoryMatch || isCodeMatch);
        }
      } else {
        matchesCategory = i.categoryId === selectedCategory;
      }

      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, selectedCategory, parentCategoryFilter, categories]);

  // Compute available years dynamically from all historical data
  const availableYears = useMemo(() => {
    if (!details) return [new Date().getFullYear()];
    const years = new Set<number>();
    if (details.consumptionYoy) {
      details.consumptionYoy.forEach(c => years.add(c.year));
    }
    if (details.monthlyConsumption) {
      details.monthlyConsumption.forEach(c => {
        if (c.month) years.add(parseInt(c.month.split('-')[0], 10));
      });
    }
    if (details.monthlyPurchases) {
      details.monthlyPurchases.forEach(c => {
        if (c.month) years.add(parseInt(c.month.split('-')[0], 10));
      });
    }
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [details]);

  // Compute monthly data for selected year
  const monthlyDataForYear = useMemo(() => {
    if (!details || !details.monthlyConsumption) return [];
    
    // Create array for 12 months
    const months = Array.from({ length: 12 }, (_, i) => {
      const mStr = String(i + 1).padStart(2, '0');
      return {
        monthKey: `${selectedYear}-${mStr}`,
        label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][i],
        qty: 0
      };
    });

    // Populate with actual data
    details.monthlyConsumption.forEach(p => {
      const match = months.find(m => m.monthKey === p.month);
      if (match) {
        match.qty = p.qty;
      }
    });

    const maxQty = Math.max(...months.map(m => m.qty), 1);
    return months.map(m => ({
      ...m,
      percent: (m.qty / maxQty) * 100
    }));
  }, [details, selectedYear]);

  const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    try {
      const date = new Date(d);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return d;
    }
  };

  return (
    <div className="flex h-[calc(100vh-6.25rem)] gap-6 text-left" style={{ minHeight: '500px' }}>
      {/* Left List Pane */}
      <div className={cn(
        "flex flex-col bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-350",
        selectedItemCode ? "w-1/2" : "w-full"
      )}>
        {/* Filters Header */}
        <div className="p-4 border-b border-zinc-150 space-y-3 bg-zinc-50/50">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por código ou descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm"
              />
            </div>
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm w-full md:w-56"
            >
              <option value="ALL">Todas as Categorias</option>
              {displayedCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="text-xs text-zinc-500 font-semibold">
            Mostrando {filteredItems.length} de {items.length} insumos
          </div>
        </div>

        {/* List Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
          {loading ? (
            <div className="p-8 text-center text-zinc-400 font-medium flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />
              Carregando lista de insumos...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-zinc-400">Nenhum insumo encontrado.</div>
          ) : (
            filteredItems.map((item) => (
              <button
                key={item.code}
                onClick={() => setSelectedItemCode(item.code)}
                className={cn(
                  "w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-50/70 transition-all border-l-4",
                  selectedItemCode === item.code 
                    ? "border-zinc-900 bg-zinc-50" 
                    : "border-transparent"
                )}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-zinc-500">{item.code}</span>
                    {item.isIgnored && (
                      <span className="px-1.5 py-0.5 bg-zinc-150 text-zinc-500 rounded text-[9px] font-bold uppercase">
                        Ignorado
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-zinc-800 text-sm truncate mt-0.5">{item.description}</h4>
                  <span className="text-[10px] text-zinc-400 font-medium mt-1 inline-block">
                    Unidade: {item.unit} | Categoria: {categories.find(c => c.id === item.categoryId)?.name || 'Outros'}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Detail Pane */}
      {selectedItemCode && (
        <div className="flex-1 bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-right-4 duration-350">
          {/* Detail Header */}
          <div className="px-6 py-4 border-b border-zinc-150 flex justify-between items-start bg-zinc-50/50 shrink-0">
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Detalhes do Insumo</span>
              <h3 className="font-extrabold text-zinc-900 text-base mt-0.5 truncate">
                {details?.description || 'Carregando...'}
              </h3>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">Código: {selectedItemCode}</p>
            </div>
            <button 
              onClick={() => setSelectedItemCode(null)}
              className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-650 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Detail Body */}
          {detailsLoading ? (
            <div className="flex-1 flex items-center justify-center text-zinc-400 font-semibold gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-zinc-500" />
              Carregando análises detalhadas...
            </div>
          ) : details ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Info Stats Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left relative group">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-zinc-400 font-bold uppercase block">Estoque Atual</span>
                    <button
                      onClick={() => handleSyncStockLive(details.code)}
                      disabled={syncingStock}
                      title="Reconsultar saldo do ERP em tempo real"
                      className="p-1 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-200 rounded transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3 w-3", syncingStock && "animate-spin text-zinc-700")} />
                    </button>
                  </div>
                  <p className="text-lg font-extrabold text-zinc-900 mt-1">
                    {details.currentStock.toLocaleString('pt-BR')} <span className="text-xs font-semibold text-zinc-500">{details.unit}</span>
                  </p>
                </div>

                <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                  <span className="text-[9px] text-zinc-400 font-bold uppercase block">Último Recebimento</span>
                  <p className="text-xs font-bold text-zinc-800 mt-2 truncate" title={details.lastReceivedDoc ? `NF #${details.lastReceivedDoc}` : undefined}>
                    {formatDate(details.lastReceivedDate)}
                  </p>
                  <span className="text-[9px] text-zinc-400 block mt-0.5">
                    {details.lastReceivedDoc ? `NF #${details.lastReceivedDoc}` : '-'}
                  </span>
                </div>
                <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                  <span className="text-[9px] text-zinc-400 font-bold uppercase block">Último Uso Produção</span>
                  <p className="text-xs font-bold text-zinc-800 mt-2 truncate" title={details.lastUsedLote ? `Lote #${details.lastUsedLote}` : undefined}>
                    {formatDate(details.lastUsedDate)}
                  </p>
                  <span className="text-[9px] text-zinc-400 block mt-0.5">
                    {details.lastUsedLote ? `Lote: ${details.lastUsedLote}` : '-'}
                  </span>
                </div>
              </div>

              {details.lastReceivedDate && (
                <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm space-y-2.5 text-left">
                  <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider block">
                    Uso Desde o Último Recebimento ({formatDate(details.lastReceivedDate)})
                  </span>
                  <div className="grid grid-cols-3 gap-4 pt-1">
                    <div>
                      <span className="text-[9px] text-zinc-400 font-bold block">Consumo Total</span>
                      <span className="text-sm font-bold text-zinc-800">
                        {details.consumedSinceLastReceived?.toLocaleString('pt-BR') || 0} {details.unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-400 font-bold block">Tempo Decorrido</span>
                      <span className="text-sm font-bold text-zinc-800">
                        {details.daysSinceLastReceived || 0} dias
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-400 font-bold block">Média Projetada</span>
                      <span className="text-sm font-bold text-emerald-700">
                        {details.avgMonthlySinceLastReceived?.toLocaleString('pt-BR') || 0} {details.unit}/mês
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes Panel */}
              {details.notes && (
                <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-xl flex items-start gap-3">
                  <Info className="h-4.5 w-4.5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <h5 className="text-xs font-bold text-amber-800">Observações de Cadastro</h5>
                    <p className="text-xs text-amber-700/95 mt-0.5">{details.notes}</p>
                  </div>
                </div>
              )}

              {/* Section: Products Used In */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
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

              {/* Section 1: YoY Consumption */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
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
                            <td className="px-4 py-2.5 font-bold text-zinc-800">{c.year}</td>
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

              {/* Section 2: Monthly Purchases Breakdown */}
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-zinc-650" />
                    <h4 className="font-extrabold text-sm text-zinc-900">Consumo Mensal Detalhado</h4>
                  </div>
                  {/* Select Year */}
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="px-2.5 py-1 bg-white border border-zinc-200 rounded-lg text-xs font-bold"
                  >
                    {availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>

                {monthlyDataForYear.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-3">Nenhum consumo mensal registrado neste ano.</p>
                ) : (
                  <div className="p-4 bg-zinc-50/50 border border-zinc-150 rounded-xl space-y-2">
                    {/* Visual Bar representation */}
                    <div className="grid grid-cols-12 gap-1.5 h-28 px-2">
                      {monthlyDataForYear.map((m) => (
                        <div key={m.monthKey} className="group relative flex flex-col justify-end h-full">
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-zinc-900 text-white text-[9px] font-bold py-1 px-1.5 rounded whitespace-nowrap z-10 pointer-events-none shadow-md">
                            {m.qty.toLocaleString('pt-BR')} {details.unit}
                          </div>
                          {/* Bar */}
                          <div 
                            style={{ height: `${m.percent}%` }}
                            className="w-full bg-zinc-800 rounded-t-sm group-hover:bg-zinc-900 transition-colors cursor-pointer"
                          />
                        </div>
                      ))}
                    </div>
                    {/* Labels */}
                    <div className="grid grid-cols-12 gap-1.5 px-2">
                      {monthlyDataForYear.map((m) => (
                        <div key={m.monthKey} className="text-center">
                          <span className="text-[8px] text-zinc-400 font-bold uppercase block truncate">
                            {m.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Invoices receipts list */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                  <FileText className="h-4 w-4 text-zinc-650" />
                  <h4 className="font-extrabold text-sm text-zinc-900">Histórico Recente de Invoices & NF</h4>
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
                            <td className="px-4 py-2.5 text-zinc-500">{formatDate(inv.invoiceDate)}</td>
                            <td className="px-4 py-2.5 font-semibold text-zinc-800 max-w-[150px] truncate" title={inv.supplierName}>
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

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-400">
              Selecione um insumo para ver a ficha detalhada.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
