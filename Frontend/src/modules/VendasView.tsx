import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Search, RefreshCw, BarChart3, X, 
  TrendingUp, ShoppingBag, DollarSign, Package, Layers 
} from 'lucide-react';
import { cn } from '../lib/utils';

const API_BASE = 'http://127.0.0.1:3001/api';

interface VendasViewProps {
  onBackToHub: () => void;
}

interface ProductSalesInfo {
  codigo: string;
  descricao: string;
  linha_prefix: string;
  nome_linha: string;
  base: string | null;
  estoque: number;
  media_vendas: number; // Avg monthly sales
  status: string;
  is_lancamento: boolean;
}

interface SalesYoYItem {
  year: number;
  totalQty: number;
  monthlyAvg: number;
}

interface MonthlySalesItem {
  month: string;
  qty: number;
}

interface ProductDetails {
  code: string;
  description: string;
  unit: string;
  currentStock: number;
  salesYoy: SalesYoYItem[];
  monthlySales: MonthlySalesItem[];
}

export default function VendasView({ onBackToHub }: VendasViewProps) {
  React.useEffect(() => {
    (window as any).__current_page__ = "Módulo de Vendas";
  }, []);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'produtos'>('dashboard');
  const [products, setProducts] = useState<ProductSalesInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [linhaFilter, setLinhaFilter] = useState('ALL');

  // Details Drawer States
  const [selectedProductDetails, setSelectedProductDetails] = useState<ProductDetails | null>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [detailsDrawerLoading, setDetailsDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Load products list
  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/products?limit=5000`);
      if (res.ok) {
        const data = await res.json();
        // Map backend ProductCalculationResult to our simplified ProductSalesInfo
        const items = (data.items || []).map((item: any) => ({
          codigo: item.codigo,
          descricao: item.descricao,
          linha_prefix: item.linhaPrefix || item.linha_prefix,
          nome_linha: item.nomeLinha || item.nome_linha,
          base: item.base,
          estoque: item.estoque,
          media_vendas: item.mediaVendas || item.media_vendas || 0.0,
          status: item.status,
          is_lancamento: item.isLancamento || item.is_lancamento || false,
        }));
        setProducts(items);
      }
    } catch (e) {
      console.error("Erro ao carregar lista de produtos:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Fetch product details for Drawer
  const handleOpenProductDetails = async (code: string) => {
    setDetailsDrawerOpen(true);
    setDetailsDrawerLoading(true);
    setDrawerError(null);
    setSelectedProductDetails(null);
    try {
      const res = await fetch(`${API_BASE}/produtos/${code}/detalhes`);
      if (res.ok) {
        const data = await res.json();
        setSelectedProductDetails({
          code: data.code,
          description: data.description,
          unit: data.unit || 'UN',
          currentStock: data.currentStock ?? 0.0,
          salesYoy: data.salesYoy || [],
          monthlySales: data.monthlySales || [],
        });
      } else {
        setDrawerError("Produto não localizado no servidor.");
      }
    } catch (e) {
      console.error("Erro ao carregar detalhes do produto:", e);
      setDrawerError("Erro ao carregar dados de vendas.");
    } finally {
      setDetailsDrawerLoading(false);
    }
  };

  // Get unique lines for filtering
  const lines = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.nome_linha) set.add(p.nome_linha);
    });
    return Array.from(set).sort();
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.codigo.toLowerCase().includes(search.toLowerCase()) || 
                          p.descricao.toLowerCase().includes(search.toLowerCase());
      const matchLinha = linhaFilter === 'ALL' || p.nome_linha === linhaFilter;
      return matchSearch && matchLinha;
    });
  }, [products, search, linhaFilter]);

  // Dashboard calculations
  const dashboardStats = useMemo(() => {
    const totalCount = products.length;
    const activeSalesCount = products.filter(p => p.media_vendas > 0).length;
    const totalMonthlyDemand = products.reduce((acc, p) => acc + p.media_vendas, 0);
    const topSellers = [...products]
      .sort((a, b) => b.media_vendas - a.media_vendas)
      .slice(0, 10);

    return {
      totalCount,
      activeSalesCount,
      totalMonthlyDemand,
      topSellers
    };
  }, [products]);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-zinc-200 shrink-0">
          <h1 className="font-bold text-base tracking-tight text-zinc-850 uppercase flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-zinc-900" />
            Módulo de Vendas
          </h1>
        </div>
        
        {/* Voltar ao Hub Button */}
        <div className="p-2 border-b border-zinc-100">
          <button
            onClick={onBackToHub}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5 text-zinc-400" />
            Voltar ao Hub
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === 'dashboard'
                ? "bg-zinc-100 text-zinc-900 font-bold"
                : "text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900"
            )}
          >
            <BarChart3 className={cn("h-5 w-5 shrink-0", activeTab === 'dashboard' ? "text-zinc-900" : "text-zinc-400")} />
            Painel de Vendas
          </button>
          <button
            onClick={() => setActiveTab('produtos')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === 'produtos'
                ? "bg-zinc-100 text-zinc-900 font-bold"
                : "text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900"
            )}
          >
            <ShoppingBag className={cn("h-5 w-5 shrink-0", activeTab === 'produtos' ? "text-zinc-900" : "text-zinc-400")} />
            Consulta de Produtos
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative bg-zinc-50/50">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 shrink-0 shadow-sm">
          <h2 className="text-xl font-bold text-zinc-800">
            {activeTab === 'dashboard' ? 'Resumo de Vendas e Demanda' : 'Análise por Produto'}
          </h2>
          <button
            onClick={loadProducts}
            disabled={loading}
            className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold border border-zinc-200 shadow-sm cursor-pointer bg-white"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Atualizar
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-96 gap-3 text-zinc-400">
              <RefreshCw className="h-10 w-10 animate-spin text-zinc-500" />
              <span className="font-bold text-sm">Carregando dados de vendas...</span>
            </div>
          ) : activeTab === 'dashboard' ? (
            // DASHBOARD TAB
            <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Stat cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-zinc-100 text-zinc-900 rounded-xl">
                    <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Total de Itens</span>
                    <span className="text-2xl font-extrabold text-zinc-900 mt-1 block">
                      {dashboardStats.totalCount}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-zinc-100 text-zinc-900 rounded-xl">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Itens com Vendas Ativas</span>
                    <span className="text-2xl font-extrabold text-zinc-900 mt-1 block">
                      {dashboardStats.activeSalesCount}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-zinc-100 text-zinc-900 rounded-xl">
                    <DollarSign className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Demanda Média Mensal (Total)</span>
                    <span className="text-2xl font-extrabold text-zinc-900 mt-1 block">
                      {Math.round(dashboardStats.totalMonthlyDemand).toLocaleString('pt-BR')} <span className="text-xs font-semibold text-zinc-400">un</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Top Selling Products List */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
                  <h3 className="font-bold text-zinc-800 text-sm flex items-center gap-2">
                    <BarChart3 className="h-4.5 w-4.5 text-zinc-500" />
                    Top 10 Produtos por Demanda Mensal
                  </h3>
                  <span className="text-xs text-zinc-400">Ordenado pela média de vendas mensal</span>
                </div>
                <div className="divide-y divide-zinc-150">
                  {dashboardStats.topSellers.map((p, idx) => (
                    <div 
                      key={p.codigo} 
                      onClick={() => handleOpenProductDetails(p.codigo)}
                      className="p-4 flex items-center justify-between hover:bg-zinc-50/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="font-mono text-xs font-bold text-zinc-400 w-6">#{idx + 1}</span>
                        <div className="min-w-0">
                          <h4 className="font-bold text-zinc-800 text-xs truncate">{p.descricao}</h4>
                          <span className="font-mono text-[10px] text-zinc-400">{p.codigo} &bull; {p.nome_linha}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-8 shrink-0">
                        <div className="text-right">
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide block">Estoque</span>
                          <span className="text-xs font-bold text-zinc-800">{p.estoque.toLocaleString('pt-BR')} un</span>
                        </div>
                        <div className="text-right min-w-24">
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide block">Demanda Mensal</span>
                          <span className="text-xs font-extrabold text-zinc-900">{Math.round(p.media_vendas).toLocaleString('pt-BR')} un/mês</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // PRODUCTS LIST TAB
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Filters header */}
              <div className="p-4 border-b border-zinc-150 bg-zinc-50/50 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por código ou descrição..."
                    className="w-full border border-zinc-300 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-800"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <label className="text-xs font-bold text-zinc-550 shrink-0">Filtrar Linha:</label>
                  <select
                    value={linhaFilter}
                    onChange={(e) => setLinhaFilter(e.target.value)}
                    className="border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-800 min-w-48 cursor-pointer"
                  >
                    <option value="ALL">Todas as Linhas</option>
                    {lines.map(line => (
                      <option key={line} value={line}>{line}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Código</th>
                      <th className="px-6 py-4">Descrição</th>
                      <th className="px-6 py-4">Linha</th>
                      <th className="px-6 py-4 text-right">Estoque</th>
                      <th className="px-6 py-4 text-right">Demanda Mensal (Média)</th>
                      <th className="px-6 py-4 text-center">Status Vendas</th>
                      <th className="px-6 py-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-150">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-zinc-400 font-medium">
                          Nenhum produto localizado com estes filtros.
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((p) => {
                        const statusColors = p.is_lancamento 
                          ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : p.media_vendas > 100 
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : p.media_vendas > 0 
                              ? 'bg-zinc-100 text-zinc-700 border-zinc-200'
                              : 'bg-red-50 text-red-700 border-red-200';

                        const statusLabel = p.is_lancamento 
                          ? 'Lançamento'
                          : p.media_vendas > 100 
                            ? 'Alta Demanda'
                            : p.media_vendas > 0 
                              ? 'Média/Baixa Demanda'
                              : 'Sem Venda';

                        return (
                          <tr key={p.codigo} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-6 py-4.5 font-mono font-bold text-zinc-900">{p.codigo}</td>
                            <td className="px-6 py-4.5">
                              <div className="font-bold text-zinc-800">{p.descricao}</div>
                              {p.base && <div className="text-[10px] text-zinc-400">Base: {p.base}</div>}
                            </td>
                            <td className="px-6 py-4.5 font-semibold text-zinc-600">{p.nome_linha}</td>
                            <td className="px-6 py-4.5 text-right font-semibold text-zinc-800">
                              {p.estoque.toLocaleString('pt-BR')} un
                            </td>
                            <td className="px-6 py-4.5 text-right font-extrabold text-zinc-900">
                              {Math.round(p.media_vendas).toLocaleString('pt-BR')} un/mês
                            </td>
                            <td className="px-6 py-4.5 text-center">
                              <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold border", statusColors)}>
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-6 py-4.5 text-center">
                              <button
                                onClick={() => handleOpenProductDetails(p.codigo)}
                                className="text-xs bg-zinc-900 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
                              >
                                Ver Detalhes
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Product Details Drawer */}
      {detailsDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
            {/* Header */}
            <div className="h-16 border-b border-zinc-200 px-6 flex items-center justify-between shrink-0 bg-zinc-50">
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">Histórico do Produto</span>
                <h3 className="font-extrabold text-zinc-900 text-sm truncate mt-0.5">
                  {detailsDrawerLoading ? 'Carregando...' : selectedProductDetails?.description}
                </h3>
              </div>
              <button
                onClick={() => setDetailsDrawerOpen(false)}
                className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailsDrawerLoading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
                  <RefreshCw className="h-8 w-8 animate-spin text-zinc-500" />
                  <span className="font-bold text-xs">Carregando histórico completo...</span>
                </div>
              ) : drawerError ? (
                <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 text-xs font-semibold text-center">
                  {drawerError}
                </div>
              ) : selectedProductDetails ? (
                <>
                  {/* Basic Stats Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl shadow-xs text-left">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Estoque Atual</span>
                      <p className="text-lg font-extrabold text-zinc-900 mt-1">
                        {(selectedProductDetails.currentStock ?? 0).toLocaleString('pt-BR')}{' '}
                        <span className="text-xs font-semibold text-zinc-500">{selectedProductDetails.unit}</span>
                      </p>
                    </div>
                    <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl shadow-xs text-left">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Código ERP</span>
                      <p className="text-lg font-extrabold text-zinc-900 mt-1 font-mono">
                        {selectedProductDetails.code}
                      </p>
                    </div>
                  </div>

                  {/* YoY Sales Table */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-zinc-150 pb-2">
                      <TrendingUp className="h-4.5 w-4.5 text-zinc-650" />
                      <h4 className="font-extrabold text-sm text-zinc-900">Histórico Anual de Vendas (YoY)</h4>
                    </div>
                    {selectedProductDetails.salesYoy.length === 0 ? (
                      <p className="text-xs text-zinc-400 py-3">Sem histórico de vendas anuais registrado.</p>
                    ) : (
                      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-200 text-[10px] uppercase">
                            <tr>
                              <th className="px-4 py-3">Ano</th>
                              <th className="px-4 py-3 text-right">Total Vendido ({selectedProductDetails.unit})</th>
                              <th className="px-4 py-3 text-right">Média Mensal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {selectedProductDetails.salesYoy.map((s) => (
                              <tr key={s.year} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-zinc-800">{s.year}</td>
                                <td className="px-4 py-2.5 text-right font-bold text-zinc-900">
                                  {(s.totalQty ?? 0).toLocaleString('pt-BR')}
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-zinc-500">
                                  {(s.monthlyAvg ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Monthly sales chart */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-zinc-150 pb-2">
                      <BarChart3 className="h-4.5 w-4.5 text-zinc-650" />
                      <h4 className="font-extrabold text-sm text-zinc-900">Vendas Mensais Detalhadas</h4>
                    </div>
                    {selectedProductDetails.monthlySales.length === 0 ? (
                      <p className="text-xs text-zinc-400 py-3">Nenhum registro de venda mensal.</p>
                    ) : (
                      <div className="p-4 bg-zinc-50/50 border border-zinc-200 rounded-xl space-y-4">
                        <div className="grid grid-cols-12 gap-1.5 h-36 items-end pt-4 px-2">
                          {(() => {
                            const sortedMonthlySales = [...selectedProductDetails.monthlySales]
                              .sort((a, b) => a.month.localeCompare(b.month))
                              .slice(-12);

                            const maxQty = Math.max(...sortedMonthlySales.map((m) => m.qty), 1);

                            return sortedMonthlySales.map((m) => {
                              const percent = (m.qty / maxQty) * 100;
                              const [yr, mo] = m.month.split('-');
                              const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                              const label = `${monthNames[parseInt(mo) - 1]} ${yr.slice(-2)}`;

                              return (
                                <div key={m.month} className="group relative flex flex-col items-center h-full justify-end">
                                  <div className="absolute bottom-full mb-1 bg-zinc-900 text-white text-[9px] font-bold py-1 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-md">
                                    {(m.qty ?? 0).toLocaleString('pt-BR')} {selectedProductDetails.unit}
                                  </div>
                                  <div
                                    style={{ height: `${percent}%` }}
                                    className="w-full bg-zinc-800 rounded-t-sm group-hover:bg-zinc-900 transition-colors cursor-pointer"
                                  />
                                  <span className="text-[8px] text-zinc-400 font-bold uppercase mt-1.5 scale-90 md:scale-100 whitespace-nowrap">
                                    {label}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
