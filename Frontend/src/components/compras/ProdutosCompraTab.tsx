import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Database, Calendar, TrendingUp, Info, 
  FileText, Clock, RefreshCw, BarChart3, ChevronRight, X, ShoppingCart, Tag
} from 'lucide-react';
import { cn } from '../../lib/utils';

const API_BASE = 'http://127.0.0.1:3001/api';

interface ProductRow {
  codigo: string;
  descricao: string;
  linha_prefix: string;
  nome_linha: string;
  estoque: number;
  media_vendas: number;
  status: string;
  status_label: string;
}

interface ProductDetalhes {
  code: string;
  description: string;
  unit: string;
  currentStock: number;
  formulation: {
    productCode: string;
    ingredientCode: string;
    description: string;
    quantity: number;
    currentStock: number;
  }[];
  salesYoy: {
    year: number;
    totalQty: number;
    monthlyAvg: number;
  }[];
  monthlySales: {
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
}

interface ProdutosCompraTabProps {
  statusFilter: 'coloracao' | 'apoio';
  title: string;
}

export function ProdutosCompraTab({ statusFilter, title }: ProdutosCompraTabProps) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Selected product details
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
  const [details, setDetails] = useState<ProductDetalhes | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    loadProducts();
    setSelectedItemCodeNull();
  }, [statusFilter]);

  const setSelectedItemCodeNull = () => {
    setSelectedProductCode(null);
    setDetails(null);
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/products?limit=5000&status=${statusFilter}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
      }
    } catch (e) {
      console.error(`Erro ao carregar produtos do tipo ${statusFilter}:`, e);
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (code: string) => {
    setDetailsLoading(true);
    setDetails(null);
    try {
      const res = await fetch(`${API_BASE}/products/${code}/detalhes`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data);
        // Find latest year from sales or default to current year
        if (data.salesYoy && data.salesYoy.length > 0) {
          setSelectedYear(data.salesYoy[0].year);
        } else {
          setSelectedYear(new Date().getFullYear());
        }
      }
    } catch (e) {
      console.error("Erro ao carregar detalhes do produto:", e);
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProductCode) {
      loadDetails(selectedProductCode);
    } else {
      setDetails(null);
    }
  }, [selectedProductCode]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        (p.descricao || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.codigo || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [products, searchTerm]);

  // Compute available years dynamically from sales historical data
  const availableYears = useMemo(() => {
    if (!details) return [new Date().getFullYear()];
    const years = new Set<number>();
    if (details.salesYoy) {
      details.salesYoy.forEach(s => years.add(s.year));
    }
    if (details.monthlySales) {
      details.monthlySales.forEach(s => {
        if (s.month) years.add(parseInt(s.month.split('-')[0], 10));
      });
    }
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [details]);

  // Compute monthly data for selected year
  const monthlyDataForYear = useMemo(() => {
    if (!details || !details.monthlySales) return [];
    
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
    details.monthlySales.forEach(s => {
      const match = months.find(m => m.monthKey === s.month);
      if (match) {
        match.qty = s.qty;
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
    <div className="flex h-[calc(100vh-8rem)] gap-6 text-left" style={{ minHeight: '500px' }}>
      {/* Left List Pane */}
      <div className={cn(
        "flex flex-col bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-350",
        selectedProductCode ? "w-1/2" : "w-full"
      )}>
        {/* Filters Header */}
        <div className="p-4 border-b border-zinc-150 space-y-3 bg-zinc-50/50">
          <div className="flex gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder={`Buscar em ${title.toLowerCase()} por código ou descrição...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm"
              />
            </div>
            <button 
              onClick={loadProducts}
              className="p-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-zinc-650 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
          <div className="text-xs text-zinc-500 font-semibold flex items-center justify-between">
            <span>Mostrando {filteredProducts.length} de {products.length} itens</span>
            <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-full font-bold text-[10px] uppercase">
              {statusFilter === 'coloracao' ? 'Coloração' : 'Material de Apoio'}
            </span>
          </div>
        </div>

        {/* List Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
          {loading ? (
            <div className="p-8 text-center text-zinc-400 font-medium flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />
              Carregando lista de produtos...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-zinc-400">Nenhum produto encontrado nesta categoria.</div>
          ) : (
            filteredProducts.map((p) => (
              <button
                key={p.codigo}
                onClick={() => setSelectedProductCode(p.codigo)}
                className={cn(
                  "w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-50/70 transition-all border-l-4",
                  selectedProductCode === p.codigo 
                    ? "border-zinc-900 bg-zinc-50" 
                    : "border-transparent"
                )}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-zinc-500">{p.codigo}</span>
                    <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-700 rounded text-[9px] font-bold uppercase">
                      {p.nome_linha}
                    </span>
                  </div>
                  <h4 className="font-bold text-zinc-800 text-sm truncate mt-0.5">{p.descricao}</h4>
                  <div className="flex items-center gap-4 text-[10px] text-zinc-400 font-semibold mt-1">
                    <span>Estoque: <strong className="text-zinc-700">{p.estoque.toLocaleString('pt-BR')} un</strong></span>
                    <span>Média Vendas: <strong className="text-zinc-700">{p.media_vendas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/mês</strong></span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Detail Pane */}
      {selectedProductCode && (
        <div className="flex-1 bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-right-4 duration-350">
          {/* Detail Header */}
          <div className="px-6 py-4 border-b border-zinc-150 flex justify-between items-start bg-zinc-50/50 shrink-0">
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Detalhamento de Compra & Vendas</span>
              <h3 className="font-extrabold text-zinc-900 text-base mt-0.5 truncate">
                {details?.description || 'Carregando...'}
              </h3>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">Código do Produto: {selectedProductCode}</p>
            </div>
            <button 
              onClick={() => setSelectedProductCode(null)}
              className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-650 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Detail Body */}
          {detailsLoading ? (
            <div className="flex-1 flex items-center justify-center text-zinc-400 font-semibold gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-zinc-500" />
              Carregando dados detalhados...
            </div>
          ) : details ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Info Stats Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                  <span className="text-[9px] text-zinc-400 font-bold uppercase block">Estoque Físico Atual</span>
                  <p className="text-lg font-extrabold text-zinc-900 mt-1">
                    {details.currentStock.toLocaleString('pt-BR')} <span className="text-xs font-semibold text-zinc-500">{details.unit || 'UN'}</span>
                  </p>
                </div>
                <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                  <span className="text-[9px] text-zinc-400 font-bold uppercase block">Média de Vendas Anual</span>
                  <p className="text-lg font-extrabold text-zinc-900 mt-1">
                    {details.salesYoy.length > 0 
                      ? `${details.salesYoy[0].monthlyAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} un/mês` 
                      : '0 un/mês'}
                  </p>
                </div>
              </div>

              {/* Section 1: Invoices receipts list */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                  <FileText className="h-4 w-4 text-zinc-650" />
                  <h4 className="font-extrabold text-sm text-zinc-900">Histórico de Compras (Notas Fiscais de Entrada)</h4>
                </div>
                {!details.recentInvoices || details.recentInvoices.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-3">Sem registros de notas fiscais de compra para este produto.</p>
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

              {/* Section 2: YoY Sales */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                  <TrendingUp className="h-4 w-4 text-zinc-650" />
                  <h4 className="font-extrabold text-sm text-zinc-900">Histórico de Saídas e Vendas (Ano a Ano)</h4>
                </div>
                {!details.salesYoy || details.salesYoy.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-3">Sem histórico de vendas registrado.</p>
                ) : (
                  <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                        <tr>
                          <th className="px-4 py-3">Ano</th>
                          <th className="px-4 py-3 text-right">Faturamento/Saída Total (un)</th>
                          <th className="px-4 py-3 text-right">Média Mensal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {details.salesYoy.map((c) => (
                          <tr key={c.year} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-4 py-2.5 font-bold text-zinc-800">{c.year}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-zinc-950">
                              {c.totalQty.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-2.5 text-right text-zinc-550">
                              {c.monthlyAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 3: Monthly Sales Breakdown */}
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-zinc-650" />
                    <h4 className="font-extrabold text-sm text-zinc-900">Vendas Mensais Detalhadas</h4>
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

                {!details.monthlySales || details.monthlySales.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-3">Nenhum faturamento mensal registrado neste ano.</p>
                ) : (
                  <div className="p-4 bg-zinc-50/50 border border-zinc-150 rounded-xl space-y-3">
                    <div className="grid grid-cols-12 gap-1.5 h-36 items-end pt-4 px-2">
                      {monthlyDataForYear.map((m) => (
                        <div key={m.monthKey} className="group relative flex flex-col items-center h-full justify-end">
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-1 bg-zinc-900 text-white text-[9px] font-bold py-1 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-md">
                            {m.qty.toLocaleString('pt-BR')} un
                          </div>
                          {/* Bar */}
                          <div 
                            style={{ height: `${m.percent}%` }}
                            className="w-full bg-zinc-800 rounded-t-sm group-hover:bg-zinc-900 transition-colors cursor-pointer"
                          />
                          {/* Month Label */}
                          <span className="text-[8px] text-zinc-400 font-bold uppercase mt-1.5 scale-90 md:scale-100">
                            {m.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-400">
              Selecione um produto para ver o histórico de compra e vendas.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
