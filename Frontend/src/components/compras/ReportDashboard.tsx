import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { PricePoint, SupplierSpend, CategorySpend, Item, Category } from '../../types';
import { TrendingUp, DollarSign, Package, Search, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';

type ReportView = 'spending_supplier' | 'spending_category' | 'price_evolution';

export function ReportDashboard({ mode = 'all' }: { mode?: 'materia_prima' | 'embalagens' | 'all' }) {
  const [view, setView] = useState<ReportView>('spending_supplier');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [pricePoints, setPricePoints] = useState<PricePoint[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [supplierSpend, setSupplierSpend] = useState<SupplierSpend[]>([]);
  const [categorySpend, setCategorySpend] = useState<CategorySpend[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.getItems(), api.getCategories()])
      .then(([itemsData, catsData]) => {
        setItems(itemsData);
        setCategories(catsData);
      })
      .catch(console.error);
  }, []);

  const loadPriceEvolution = async (code: string) => {
    setSelectedItem(code);
    setLoading(true);
    try { setPricePoints(await api.getPriceEvolution(code)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    setLoading(true);
    if (view === 'spending_supplier') {
      api.getSpendingBySupplier(startDate, endDate, mode).then(setSupplierSpend).catch(console.error).finally(() => setLoading(false));
    } else if (view === 'spending_category') {
      api.getSpendingByCategory(startDate, endDate, mode).then(setCategorySpend).catch(console.error).finally(() => setLoading(false));
    } else { setLoading(false); }
  }, [view, startDate, endDate, mode]);

  const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const filteredItems = items.filter(i => {
    if (i.isIgnored) return false;
    if (mode === 'materia_prima') {
      const cat = categories.find(c => c.id === i.categoryId);
      if (!(i.categoryId === 'cat_mp' || (cat && cat.parentId === 'cat_mp'))) return false;
    } else if (mode === 'embalagens') {
      const cat = categories.find(c => c.id === i.categoryId);
      if (!(i.categoryId === 'cat_emb' || (cat && cat.parentId === 'cat_emb'))) return false;
    }
    return (
      (i.code || '').toLowerCase().includes(itemSearch.toLowerCase()) || 
      (i.description || '').toLowerCase().includes(itemSearch.toLowerCase())
    );
  }).slice(0, 30);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex items-center gap-4 flex-wrap">
        {([
          { id: 'spending_supplier', label: 'Gasto por Fornecedor', icon: DollarSign },
          { id: 'spending_category', label: 'Gasto por Categoria', icon: Package },
          { id: 'price_evolution', label: 'Evolução de Preço', icon: TrendingUp },
        ] as const).map(r => (
          <button key={r.id} onClick={() => setView(r.id)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              view === r.id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200")}>
            <r.icon className="h-4 w-4" /> {r.label}
          </button>
        ))}
      </div>

      {view !== 'price_evolution' && (
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex items-center gap-4">
          <Calendar className="h-4 w-4 text-zinc-500" />
          <span className="text-sm text-zinc-600">Período:</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none" />
          <span className="text-sm text-zinc-400">até</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none" />
        </div>
      )}

      {/* Spending by Supplier */}
      {view === 'spending_supplier' && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm">
          <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
            <h3 className="font-semibold">Ranking de Fornecedores por Gasto Total</h3>
          </div>
          <div className="p-6 space-y-3">
            {supplierSpend.length === 0 ? (
              <p className="text-center text-zinc-500 py-8">Nenhum dado encontrado para o período.</p>
            ) : supplierSpend.map((s, i) => {
              const max = Math.max(...supplierSpend.map(x => x.totalValue), 1);
              return (
                <div key={s.supplierId} className="flex items-center gap-4">
                  <span className="text-sm font-bold text-zinc-400 w-8 text-right">{i + 1}º</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium truncate max-w-sm">{s.supplierName}</span>
                      <div className="flex gap-4 text-sm">
                        <span className="text-zinc-500">{s.invoiceCount} NFs</span>
                        <span className="font-bold">{fmt(s.totalValue)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-700 rounded-full" style={{ width: `${(s.totalValue / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Spending by Category */}
      {view === 'spending_category' && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm">
          <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
            <h3 className="font-semibold">Gasto por Categoria</h3>
          </div>
          <div className="p-6 space-y-4">
            {categorySpend.length === 0 ? (
              <p className="text-center text-zinc-500 py-8">Nenhum dado encontrado para o período.</p>
            ) : categorySpend.map(c => {
              const max = Math.max(...categorySpend.map(x => x.totalValue), 1);
              return (
                <div key={c.categoryId} className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{c.categoryName}</span>
                      <div className="flex gap-4 text-sm">
                        <span className="text-zinc-500">{c.itemCount} itens</span>
                        <span className="font-bold">{fmt(c.totalValue)}</span>
                      </div>
                    </div>
                    <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(c.totalValue / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Price Evolution */}
      {view === 'price_evolution' && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4 bg-white rounded-xl border border-zinc-200 shadow-sm flex flex-col" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
            <div className="p-3 border-b border-zinc-200">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-zinc-50 rounded-md">
                <Search className="h-4 w-4 text-zinc-400" />
                <input type="text" placeholder="Buscar item..." value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  className="flex-1 text-sm bg-transparent border-none focus:outline-none" />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {filteredItems.map(item => (
                <button key={item.code} onClick={() => loadPriceEvolution(item.code)}
                  className={cn("w-full text-left px-4 py-3 border-b border-zinc-50 text-sm hover:bg-zinc-50",
                    selectedItem === item.code && "bg-zinc-100 font-medium")}>
                  <div className="font-mono text-xs text-zinc-500">{item.code}</div>
                  <div className="truncate">{item.description}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-8 bg-white rounded-xl border border-zinc-200 shadow-sm">
            <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
              <h3 className="font-semibold">{selectedItem ? `Evolução — ${selectedItem}` : 'Selecione um item'}</h3>
            </div>
            <div className="p-6">
              {!selectedItem ? (
                <p className="text-center text-zinc-500 py-16">Selecione um item à esquerda.</p>
              ) : pricePoints.length === 0 ? (
                <p className="text-center text-zinc-500 py-16">Nenhum dado de preço para este item.</p>
              ) : (
                <div className="space-y-2">
                  {pricePoints.map((pp, i) => {
                    const maxP = Math.max(...pricePoints.map(p => p.unitPrice), 1);
                    const prev = i > 0 ? pricePoints[i-1].unitPrice : pp.unitPrice;
                    const diff = pp.unitPrice - prev;
                    return (
                      <div key={`${pp.invoiceNumber}-${i}`} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500 w-24 shrink-0">{pp.date?.split(' ')[0]}</span>
                        <div className="flex-1 h-5 bg-zinc-100 rounded overflow-hidden">
                          <div className={cn("h-full rounded", diff > 0 ? "bg-red-400" : diff < 0 ? "bg-emerald-400" : "bg-zinc-400")}
                            style={{ width: `${(pp.unitPrice / maxP) * 100}%` }} />
                        </div>
                        <span className="text-sm font-mono w-28 text-right">{fmt(pp.unitPrice)}</span>
                        <span className="text-xs text-zinc-500 truncate w-28">{pp.supplierName}</span>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-200 mt-4">
                    <div className="text-center">
                      <div className="text-xs text-zinc-500">Menor</div>
                      <div className="font-bold text-emerald-600">{fmt(Math.min(...pricePoints.map(p => p.unitPrice)))}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-zinc-500">Maior</div>
                      <div className="font-bold text-red-600">{fmt(Math.max(...pricePoints.map(p => p.unitPrice)))}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-zinc-500">Média</div>
                      <div className="font-bold">{fmt(pricePoints.reduce((a, b) => a + b.unitPrice, 0) / pricePoints.length)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
