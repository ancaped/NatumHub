import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Search, RefreshCw, BarChart3, X, 
  TrendingUp, ShoppingBag, DollarSign, Package, Layers,
  AlertTriangle, Clock, Calendar, ChevronDown, ChevronUp,
  Truck, Info, AlertCircle, CheckCircle2, XCircle
} from 'lucide-react';
import { cn, API_BASE, apiFetch } from '../lib/utils';


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

interface SalesOrderItem {
  id: number;
  n_pedido: number;
  d_pedido: string;
  n_registro: number | null;
  c_cod_prod: string;
  n_qtde: number;
  n_qtde_fat: number;
  n_preco: number;
  c_lote: string | null;
}

interface SalesOrder {
  n_pedido: number;
  d_pedido: string;
  n_codigo: number | null;
  c_nome: string | null;
  n_valor_tot: number;
  c_status: string | null;
  n_nota_fiscal: number;
  d_previsao: string | null;
  d_entrega: string | null;
  m_observac: string | null;
  items: SalesOrderItem[];
}

interface ProductFaltaItem {
  n_pedido: number;
  d_pedido: string;
  c_nome: string | null;
  c_status: string | null;
  n_qtde: number;
  n_qtde_fat: number;
  falta: number;
  d_previsao: string | null;
}

interface ProductFaltaGroup {
  c_cod_prod: string;
  c_nome_prod: string;
  c_nome_linha: string;
  total_falta: number;
  pedidos_afetados: ProductFaltaItem[];
  estoque: number;
  producao: number;
  transit_purchase: number;
  falta_net: number;
}

interface PendingPurchaseOrderItem {
  n_pedido: number;
  c_nome_f: string | null;
  d_previsao: string | null;
  n_qtde: number;
  n_chegou: number;
  n_pendente: number;
}

const statusLabels: Record<string, string> = {
  FT: 'Faturado',
  CA: 'Cancelado',
  FP: 'Faturado Parcial',
  EX: 'Em Expedição',
  PP: 'Pré-Pedido / Pronto',
  CF: 'Conferência',
  LB: 'Liberado',
  AL: 'Estoque Alocado',
};

const statusColors: Record<string, string> = {
  FT: 'bg-emerald-50 text-emerald-700 border-emerald-250',
  CA: 'bg-rose-50 text-rose-700 border-rose-200',
  FP: 'bg-amber-50 text-amber-700 border-amber-250',
  EX: 'bg-sky-50 text-sky-700 border-sky-200',
  PP: 'bg-purple-50 text-purple-700 border-purple-100',
  CF: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  LB: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  AL: 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function VendasView({ onBackToHub }: VendasViewProps) {
  React.useEffect(() => {
    (window as any).__current_page__ = "Módulo de Vendas";
  }, []);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'produtos' | 'pedidos' | 'faltas'>('dashboard');
  const [products, setProducts] = useState<ProductSalesInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [linhaFilter, setLinhaFilter] = useState('ALL');

  // Sales Orders States
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('ativos');
  const [expandedOrders, setExpandedOrders] = useState<Record<number, boolean>>({});

  // Faltas States
  const [faltasData, setFaltasData] = useState<{ ativas: ProductFaltaGroup[]; historicas: ProductFaltaGroup[] }>({ ativas: [], historicas: [] });
  const [faltasLoading, setFaltasLoading] = useState(false);
  const [faltasSubTab, setFaltasSubTab] = useState<'ativas' | 'historicas'>('ativas');
  const [expandedFaltas, setExpandedFaltas] = useState<Record<string, boolean>>({});
  const [faltasSearch, setFaltasSearch] = useState('');
  const [faltasDaysLimit, setFaltasDaysLimit] = useState<number>(180);

  // Details Drawer States
  const [selectedProductDetails, setSelectedProductDetails] = useState<ProductDetails | null>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [detailsDrawerLoading, setDetailsDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'geral' | 'pedidos' | 'compras'>('geral');
  const [drawerPendingData, setDrawerPendingData] = useState<{
    pending_sales_orders: ProductFaltaItem[];
    in_transit_purchase_orders: PendingPurchaseOrderItem[];
  } | null>(null);
  const [drawerPendingLoading, setDrawerPendingLoading] = useState(false);

  const handleDaysLimitChange = async (val: number) => {
    setFaltasDaysLimit(val);
    try {
      await apiFetch(`${API_BASE}/settings/sales_faltas_days_limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: String(val) }),
      });
    } catch (e) {
      console.error("Erro ao salvar limite de dias de vendas:", e);
    }
  };

  // Load products list
  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/products?limit=5000`);
      if (res.ok) {
        const data = await res.json();
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

  // Load Sales Orders list
  const loadSalesOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/vendas/pedidos?search=${encodeURIComponent(ordersSearch)}&status=${ordersStatusFilter}&days=${faltasDaysLimit}`);
      if (res.ok) {
        const data = await res.json();
        setSalesOrders(data || []);
      }
    } catch (e) {
      console.error("Erro ao carregar pedidos de venda:", e);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Load Faltas list
  const loadFaltas = async (days: number = 180) => {
    setFaltasLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/vendas/faltas?days=${days}`);
      if (res.ok) {
        const data = await res.json();
        setFaltasData(data || { ativas: [], historicas: [] });
      }
    } catch (e) {
      console.error("Erro ao carregar relatório de faltas:", e);
    } finally {
      setFaltasLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    // Load persisted days limit setting
    const loadSettings = async () => {
      try {
        const res = await apiFetch(`${API_BASE}/settings/sales_faltas_days_limit`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.value) {
            setFaltasDaysLimit(Number(data.value));
          }
        }
      } catch (e) {
        console.error("Erro ao carregar limite de dias de vendas:", e);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'pedidos') {
      loadSalesOrders();
    } else if (activeTab === 'faltas') {
      loadFaltas(faltasDaysLimit);
    }
  }, [activeTab, ordersSearch, ordersStatusFilter, faltasDaysLimit]);

  // Fetch product details for Drawer
  const handleOpenProductDetails = async (code: string) => {
    setDetailsDrawerOpen(true);
    setDetailsDrawerLoading(true);
    setDrawerError(null);
    setSelectedProductDetails(null);
    setDrawerTab('geral');
    setDrawerPendingData(null);

    // 1. Fetch sales info
    try {
      const res = await apiFetch(`${API_BASE}/produtos/${code}/detalhes`);
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

        // 2. Fetch pending orders & purchase transit
        setDrawerPendingLoading(true);
        const resPending = await apiFetch(`${API_BASE}/produtos/${code}/pedidos-pendentes`);
        if (resPending.ok) {
          const pendingData = await resPending.json();
          setDrawerPendingData(pendingData);
        }
      } else {
        setDrawerError("Produto não localizado no servidor.");
      }
    } catch (e) {
      console.error("Erro ao carregar detalhes do produto:", e);
      setDrawerError("Erro ao carregar dados de vendas.");
    } finally {
      setDetailsDrawerLoading(false);
      setDrawerPendingLoading(false);
    }
  };

  // Toggle order expansion
  const toggleOrderExpand = (nPedido: number) => {
    setExpandedOrders(prev => ({
      ...prev,
      [nPedido]: !prev[nPedido]
    }));
  };

  // Toggle falta expansion
  const toggleFaltaExpand = (cCodProd: string) => {
    setExpandedFaltas(prev => ({
      ...prev,
      [cCodProd]: !prev[cCodProd]
    }));
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

  // Filtered consolidated faltas list
  const filteredFaltas = useMemo(() => {
    const list = faltasSubTab === 'ativas' ? faltasData.ativas : faltasData.historicas;
    let result = list;
    if (faltasSearch.trim()) {
      const q = faltasSearch.toLowerCase();
      result = result.filter(f => 
        (f.c_cod_prod || '').toLowerCase().includes(q) ||
        (f.c_nome_prod || '').toLowerCase().includes(q)
      );
    }

    if (faltasSubTab === 'ativas') {
      // Sort: falta_net desc, then total_falta desc
      return [...result].sort((a, b) => {
        const netA = a.falta_net ?? 0;
        const netB = b.falta_net ?? 0;
        if (netB !== netA) return netB - netA;
        return b.total_falta - a.total_falta;
      });
    } else {
      return [...result].sort((a, b) => b.total_falta - a.total_falta);
    }
  }, [faltasData, faltasSubTab, faltasSearch]);

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

  const handleRefresh = () => {
    if (activeTab === 'dashboard' || activeTab === 'produtos') {
      loadProducts();
    } else if (activeTab === 'pedidos') {
      loadSalesOrders();
    } else if (activeTab === 'faltas') {
      loadFaltas(faltasDaysLimit);
    }
  };

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
            onClick={() => setActiveTab('pedidos')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === 'pedidos'
                ? "bg-zinc-100 text-zinc-900 font-bold"
                : "text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900"
            )}
          >
            <Layers className={cn("h-5 w-5 shrink-0", activeTab === 'pedidos' ? "text-zinc-900" : "text-zinc-400")} />
            Pedidos em Aberto
          </button>

          <button
            onClick={() => setActiveTab('faltas')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === 'faltas'
                ? "bg-zinc-100 text-zinc-900 font-bold"
                : "text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900"
            )}
          >
            <AlertTriangle className={cn("h-5 w-5 shrink-0", activeTab === 'faltas' ? "text-zinc-900" : "text-zinc-400")} />
            Itens em Falta
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
            {activeTab === 'dashboard' && 'Resumo de Vendas e Demanda'}
            {activeTab === 'produtos' && 'Análise por Produto'}
            {activeTab === 'pedidos' && 'Pedidos de Vendas em Aberto'}
            {activeTab === 'faltas' && 'Relatório de Itens em Falta (Faltas)'}
          </h2>
          <button
            onClick={handleRefresh}
            disabled={loading || ordersLoading || faltasLoading}
            className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold border border-zinc-200 shadow-sm cursor-pointer bg-white"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", (loading || ordersLoading || faltasLoading) && "animate-spin")} />
            Atualizar
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 text-left">
          {activeTab === 'dashboard' ? (
            loading ? (
              <div className="flex flex-col items-center justify-center h-96 gap-3 text-zinc-400">
                <RefreshCw className="h-10 w-10 animate-spin text-zinc-500" />
                <span className="font-bold text-sm">Carregando dados de vendas...</span>
              </div>
            ) : (
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
            )
          ) : activeTab === 'produtos' ? (
            // PRODUCTS LIST TAB
            loading ? (
              <div className="flex flex-col items-center justify-center h-96 gap-3 text-zinc-400">
                <RefreshCw className="h-10 w-10 animate-spin text-zinc-500" />
                <span className="font-bold text-sm">Carregando lista de produtos...</span>
              </div>
            ) : (
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
            )
          ) : activeTab === 'pedidos' ? (
            // SALES ORDERS TAB
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Filters header */}
              <div className="p-4 border-b border-zinc-150 bg-zinc-50/50 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                  <input
                    type="text"
                    value={ordersSearch}
                    onChange={(e) => setOrdersSearch(e.target.value)}
                    placeholder="Buscar por cliente ou nº pedido..."
                    className="w-full border border-zinc-300 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-800"
                  />
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto flex-wrap">
                  {/* Period Limit Select */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 font-bold whitespace-nowrap">Pedidos dos últimos:</span>
                    <select
                      value={faltasDaysLimit}
                      onChange={(e) => handleDaysLimitChange(Number(e.target.value))}
                      className="border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none font-semibold text-zinc-700 cursor-pointer"
                    >
                      <option value={30}>30 dias</option>
                      <option value={60}>60 dias</option>
                      <option value={90}>90 dias</option>
                      <option value={180}>180 dias (6 meses)</option>
                      <option value={365}>365 dias (1 ano)</option>
                      <option value={0}>Sem Limite</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-zinc-550 shrink-0">Filtrar Status:</label>
                    <select
                      value={ordersStatusFilter}
                      onChange={(e) => setOrdersStatusFilter(e.target.value)}
                      className="border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-800 min-w-48 cursor-pointer"
                    >
                    <option value="ALL">Todos os Pedidos</option>
                    <option value="ativos">Apenas em Aberto (Ativos)</option>
                    <option value="concluidos">Apenas Faturados/Cancelados</option>
                    <option value="EX">Em Expedição (EX)</option>
                    <option value="PP">Pré-Pedido (PP)</option>
                    <option value="FP">Faturado Parcial (FP)</option>
                    <option value="FT">Faturado (FT)</option>
                    <option value="LB">Liberado (LB)</option>
                    <option value="AL">Alocado (AL)</option>
                    <option value="CF">Conferência (CF)</option>
                    <option value="CA">Cancelado (CA)</option>
                  </select>
                </div>
              </div>
            </div>

              {/* Table */}
              <div className="overflow-x-auto">
                {ordersLoading ? (
                  <div className="p-8 text-center text-zinc-400 font-medium flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />
                    Carregando pedidos de vendas...
                  </div>
                ) : salesOrders.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400">Nenhum pedido de venda localizado com estes filtros.</div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-6 py-4 w-10"></th>
                        <th className="px-6 py-4">Pedido</th>
                        <th className="px-6 py-4">Data</th>
                        <th className="px-6 py-4">Cliente</th>
                        <th className="px-6 py-4 text-right">Valor Total</th>
                        <th className="px-6 py-4 text-center">Status</th>
                        <th className="px-6 py-4 text-center">NF</th>
                        <th className="px-6 py-4">Previsão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-150">
                      {salesOrders.map((order) => {
                        const isExpanded = !!expandedOrders[order.n_pedido];
                        const itemsCount = order.items.length;
                        const pendingCount = order.items.reduce((acc, item) => acc + Math.max(0, item.n_qtde - item.n_qtde_fat), 0);

                        return (
                          <React.Fragment key={`${order.n_pedido}-${order.d_pedido}`}>
                            <tr 
                              className={cn(
                                "hover:bg-zinc-50/50 transition-colors cursor-pointer",
                                isExpanded && "bg-zinc-50"
                              )}
                              onClick={() => toggleOrderExpand(order.n_pedido)}
                            >
                              <td className="px-6 py-4 text-center">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                                )}
                              </td>
                              <td className="px-6 py-4 font-bold text-zinc-900">#{order.n_pedido}</td>
                              <td className="px-6 py-4 text-zinc-500">{formatDate(order.d_pedido)}</td>
                              <td className="px-6 py-4">
                                <div className="font-bold text-zinc-800 max-w-[250px] truncate" title={order.c_nome || ''}>
                                  {order.c_nome || 'Consumidor Final'}
                                </div>
                                <div className="text-[10px] text-zinc-400">Cliente ID: {order.n_codigo || '-'}</div>
                              </td>
                              <td className="px-6 py-4 text-right font-extrabold text-zinc-900">
                                {formatCurrency(order.n_valor_tot)}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold border block text-center",
                                  statusColors[order.c_status || ''] || 'bg-zinc-100 text-zinc-700 border-zinc-200'
                                )}>
                                  {statusLabels[order.c_status || ''] || order.c_status || '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center font-mono font-semibold text-zinc-650">
                                {order.n_nota_fiscal > 0 ? order.n_nota_fiscal : '-'}
                              </td>
                              <td className="px-6 py-4 text-zinc-600 font-semibold">
                                {order.d_previsao ? formatDate(order.d_previsao) : '-'}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-zinc-50/20">
                                <td colSpan={8} className="px-12 py-4 text-left">
                                  <div className="border border-zinc-150 rounded-xl overflow-hidden bg-white shadow-xs max-w-5xl">
                                    <div className="p-3 bg-zinc-50 border-b border-zinc-150 flex justify-between items-center text-xs font-bold text-zinc-600">
                                      <span>Itens Solicitados ({itemsCount} itens)</span>
                                      {pendingCount > 0 && (
                                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full font-bold text-[10px] border border-rose-200">
                                          {pendingCount} itens faltantes/pendentes
                                        </span>
                                      )}
                                    </div>
                                    <table className="w-full text-left text-xs">
                                      <thead className="bg-zinc-50/50 border-b border-zinc-100 font-bold text-zinc-400 text-[10px] uppercase">
                                        <tr>
                                          <th className="px-4 py-2">Código</th>
                                          <th className="px-4 py-2">Produto</th>
                                          <th className="px-4 py-2 text-right">Pedido</th>
                                          <th className="px-4 py-2 text-right">Faturado</th>
                                          <th className="px-4 py-2 text-right text-rose-700">Saldo Falta</th>
                                          <th className="px-4 py-2 text-right">Preço</th>
                                          <th className="px-4 py-2 text-right">Total</th>
                                          <th className="px-4 py-2">Lote</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-100 text-[11px]">
                                        {order.items.map((item) => {
                                          const faltaQty = Math.max(0, item.n_qtde - item.n_qtde_fat);
                                          return (
                                            <tr key={item.id} className="hover:bg-zinc-50/30 transition-colors">
                                              <td className="px-4 py-2 font-mono font-bold text-zinc-700">{item.c_cod_prod}</td>
                                              <td className="px-4 py-2 font-semibold text-zinc-850">
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenProductDetails(item.c_cod_prod);
                                                  }}
                                                  className="hover:underline hover:text-zinc-950 text-left font-bold text-zinc-700 cursor-pointer"
                                                >
                                                  {products.find(p => p.codigo === item.c_cod_prod)?.descricao || 'Produto Legado'}
                                                </button>
                                              </td>
                                              <td className="px-4 py-2 text-right font-medium text-zinc-650">{item.n_qtde}</td>
                                              <td className="px-4 py-2 text-right font-medium text-zinc-650">{item.n_qtde_fat}</td>
                                              <td className={cn(
                                                "px-4 py-2 text-right font-extrabold",
                                                faltaQty > 0 ? "text-rose-600" : "text-zinc-400"
                                              )}>
                                                {faltaQty > 0 ? faltaQty : '-'}
                                              </td>
                                              <td className="px-4 py-2 text-right text-zinc-500">{formatCurrency(item.n_preco)}</td>
                                              <td className="px-4 py-2 text-right font-bold text-zinc-900">
                                                {formatCurrency(item.n_qtde * item.n_preco)}
                                              </td>
                                              <td className="px-4 py-2 font-mono text-zinc-500">{item.c_lote || '-'}</td>
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
                )}
              </div>
            </div>
          ) : (
            // FALTAS TAB
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Tab Selector & Search */}
              <div className="p-4 border-b border-zinc-150 bg-zinc-50/50 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex border border-zinc-200 rounded-xl bg-white p-1 shadow-xs shrink-0 self-start md:self-auto">
                  <button
                    onClick={() => { setFaltasSubTab('ativas'); setExpandedFaltas({}); }}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all",
                      faltasSubTab === 'ativas'
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "text-zinc-650 hover:bg-zinc-50"
                    )}
                  >
                    Faltas Ativas (Demandas)
                  </button>
                  <button
                    onClick={() => { setFaltasSubTab('historicas'); setExpandedFaltas({}); }}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all",
                      faltasSubTab === 'historicas'
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "text-zinc-650 hover:bg-zinc-50"
                    )}
                  >
                    Faltas Históricas (Cortes)
                  </button>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                  {/* Period Limit Select */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 font-semibold whitespace-nowrap">Pedidos dos últimos:</span>
                    <select
                      value={faltasDaysLimit}
                      onChange={(e) => handleDaysLimitChange(Number(e.target.value))}
                      className="border border-zinc-300 rounded-lg px-2.5 py-1 text-xs bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none font-semibold text-zinc-700"
                    >
                      <option value={30}>30 dias</option>
                      <option value={60}>60 dias</option>
                      <option value={90}>90 dias</option>
                      <option value={180}>180 dias (6 meses)</option>
                      <option value={365}>365 dias (1 ano)</option>
                      <option value={0}>Sem Limite</option>
                    </select>
                  </div>

                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-zinc-400" />
                    <input
                      type="text"
                      value={faltasSearch}
                      onChange={(e) => setFaltasSearch(e.target.value)}
                      placeholder="Buscar faltas por código ou nome..."
                      className="w-full border border-zinc-300 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white text-zinc-800"
                    />
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                {faltasLoading ? (
                  <div className="p-8 text-center text-zinc-400 font-medium flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />
                    Carregando itens faltantes...
                  </div>
                ) : filteredFaltas.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400">Nenhum registro de falta localizado com estes filtros.</div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150 uppercase tracking-wider text-[10px]">
                      {faltasSubTab === 'ativas' ? (
                        <tr>
                          <th className="px-4 py-4 w-10"></th>
                          <th className="px-4 py-4">Código</th>
                          <th className="px-4 py-4">Produto</th>
                          <th className="px-4 py-4 text-right">Estoque Físico</th>
                          <th className="px-4 py-4 text-right">Previsto (Prod+Trân)</th>
                          <th className="px-4 py-4 text-right">Pedidos em Aberto</th>
                          <th className="px-4 py-4 text-right">Falta Líquida</th>
                          <th className="px-4 py-4 text-center">Status Cobertura</th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="px-6 py-4 w-10"></th>
                          <th className="px-6 py-4">Código</th>
                          <th className="px-6 py-4">Descrição</th>
                          <th className="px-6 py-4">Linha</th>
                          <th className="px-6 py-4 text-right">Total Cortado</th>
                          <th className="px-6 py-4 text-center">Pedidos Afetados</th>
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-zinc-150">
                      {filteredFaltas.map((group) => {
                        const isExpanded = !!expandedFaltas[group.c_cod_prod];
                        const isCovered = (group.falta_net ?? 0) === 0;
                        return (
                          <React.Fragment key={group.c_cod_prod}>
                            <tr 
                              className={cn(
                                "hover:bg-zinc-50/50 transition-colors cursor-pointer",
                                isExpanded && "bg-zinc-50",
                                faltasSubTab === 'ativas' && isCovered && "bg-emerald-50/15 hover:bg-emerald-50/25",
                                faltasSubTab === 'ativas' && !isCovered && "bg-rose-50/10 hover:bg-rose-50/20"
                              )}
                              onClick={() => toggleFaltaExpand(group.c_cod_prod)}
                            >
                              {faltasSubTab === 'ativas' ? (
                                <>
                                  <td className="px-4 py-4 text-center">
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-zinc-400" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                                    )}
                                  </td>
                                  <td className="px-4 py-4 font-mono font-bold text-zinc-900">{group.c_cod_prod}</td>
                                  <td className="px-4 py-4">
                                    <div 
                                      onClick={(e) => { e.stopPropagation(); handleOpenProductDetails(group.c_cod_prod); }}
                                      className="font-bold text-zinc-800 hover:underline cursor-pointer"
                                    >
                                      {group.c_nome_prod}
                                    </div>
                                    <div className="text-[10px] text-zinc-400 font-semibold">{group.c_nome_linha}</div>
                                  </td>
                                  <td className="px-4 py-4 text-right font-semibold text-zinc-700">
                                    {group.estoque.toLocaleString('pt-BR')} un
                                  </td>
                                  <td className="px-4 py-4 text-right text-zinc-500 font-medium">
                                    {(group.producao + group.transit_purchase).toLocaleString('pt-BR')} un
                                    <div className="text-[9px] text-zinc-400">
                                      (Prod: {group.producao} | Comp: {group.transit_purchase})
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 text-right font-bold text-zinc-650">
                                    {group.total_falta.toLocaleString('pt-BR')} un
                                  </td>
                                  <td className={cn(
                                    "px-4 py-4 text-right font-extrabold",
                                    isCovered ? "text-emerald-700" : "text-rose-700"
                                  )}>
                                    {group.falta_net.toLocaleString('pt-BR')} un
                                  </td>
                                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                    {isCovered ? (
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        COBERTO
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                                        FALTA REAL
                                      </span>
                                    )}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-6 py-4 text-center">
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-zinc-400" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-zinc-400" />
                                    )}
                                  </td>
                                  <td className="px-6 py-4 font-mono font-bold text-zinc-900">{group.c_cod_prod}</td>
                                  <td className="px-6 py-4">
                                    <div 
                                      onClick={(e) => { e.stopPropagation(); handleOpenProductDetails(group.c_cod_prod); }}
                                      className="font-bold text-zinc-800 hover:underline cursor-pointer"
                                    >
                                      {group.c_nome_prod}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 font-semibold text-zinc-650">{group.c_nome_linha}</td>
                                  <td className="px-6 py-4 text-right font-extrabold text-rose-700">
                                    {group.total_falta.toLocaleString('pt-BR')} un
                                  </td>
                                  <td className="px-6 py-4 text-center font-bold text-zinc-600">
                                    {group.pedidos_afetados.length} pedidos
                                  </td>
                                </>
                              )}
                            </tr>
                            {isExpanded && (
                              <tr className="bg-zinc-50/20">
                                <td colSpan={faltasSubTab === 'ativas' ? 8 : 6} className="px-12 py-4 text-left">
                                  <div className="border border-zinc-150 rounded-xl overflow-hidden bg-white shadow-xs max-w-4xl">
                                    <div className="p-3 bg-zinc-50 border-b border-zinc-150 text-xs font-bold text-zinc-600">
                                      Pedidos individuais gerando esta falta
                                    </div>
                                    <table className="w-full text-left text-xs">
                                      <thead className="bg-zinc-50/50 border-b border-zinc-100 font-bold text-zinc-400 text-[10px] uppercase">
                                        <tr>
                                          <th className="px-4 py-2">Pedido</th>
                                          <th className="px-4 py-2">Data</th>
                                          <th className="px-4 py-2">Cliente</th>
                                          <th className="px-4 py-2 text-right">Pedido</th>
                                          <th className="px-4 py-2 text-right">Faturado</th>
                                          <th className="px-4 py-2 text-right text-rose-700">Falta</th>
                                          <th className="px-4 py-2 text-center">Status</th>
                                          <th className="px-4 py-2">Previsão</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-100 text-[11px]">
                                        {group.pedidos_afetados.map((item, idx) => (
                                          <tr key={`${item.n_pedido}-${idx}`} className="hover:bg-zinc-50/30 transition-colors">
                                            <td className="px-4 py-2 font-bold text-zinc-700 text-left">#{item.n_pedido}</td>
                                            <td className="px-4 py-2 text-zinc-500">{formatDate(item.d_pedido)}</td>
                                            <td className="px-4 py-2 font-semibold text-zinc-800 text-left">{item.c_nome || 'Consumidor Final'}</td>
                                            <td className="px-4 py-2 text-right font-medium text-zinc-650">{item.n_qtde}</td>
                                            <td className="px-4 py-2 text-right font-medium text-zinc-500">{item.n_qtde_fat}</td>
                                            <td className="px-4 py-2 text-right font-extrabold text-rose-600">{item.falta}</td>
                                            <td className="px-4 py-2 text-center">
                                              <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[9px] font-bold border",
                                                statusColors[item.c_status || ''] || 'bg-zinc-100'
                                              )}>
                                                {statusLabels[item.c_status || ''] || item.c_status || '-'}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2 text-zinc-600 font-semibold">
                                              {item.d_previsao ? formatDate(item.d_previsao) : '-'}
                                            </td>
                                          </tr>
                                        ))}
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
                )}
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
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">Histórico e Demanda do Produto</span>
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

            {/* Tab Bar inside Drawer */}
            <div className="border-b border-zinc-150 px-6 flex bg-zinc-50/50 shrink-0">
              <button
                onClick={() => setDrawerTab('geral')}
                className={cn(
                  "px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer",
                  drawerTab === 'geral'
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-450 hover:text-zinc-700"
                )}
              >
                Geral (Vendas)
              </button>
              <button
                onClick={() => setDrawerTab('pedidos')}
                className={cn(
                  "px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
                  drawerTab === 'pedidos'
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-450 hover:text-zinc-700"
                )}
              >
                Pedidos Pendentes (Clientes)
                {drawerPendingData && drawerPendingData.pending_sales_orders.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[9px] font-bold">
                    {drawerPendingData.pending_sales_orders.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setDrawerTab('compras')}
                className={cn(
                  "px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
                  drawerTab === 'compras'
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-450 hover:text-zinc-700"
                )}
              >
                Compras em Trânsito
                {drawerPendingData && drawerPendingData.in_transit_purchase_orders.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-sky-500 text-white rounded-full text-[9px] font-bold">
                    {drawerPendingData.in_transit_purchase_orders.length}
                  </span>
                )}
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 text-left">
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
                drawerTab === 'geral' ? (
                  <div className="space-y-6">
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
                  </div>
                ) : drawerTab === 'pedidos' ? (
                  // PEDIDOS PENDENTES TAB
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-zinc-150 pb-2">
                      <Layers className="h-4.5 w-4.5 text-zinc-650" />
                      <h4 className="font-extrabold text-sm text-zinc-900">Pedidos de Venda Ativos em Falta</h4>
                    </div>

                    {drawerPendingLoading ? (
                      <div className="p-8 text-center text-zinc-400 font-medium flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />
                        Carregando pedidos pendentes...
                      </div>
                    ) : !drawerPendingData || drawerPendingData.pending_sales_orders.length === 0 ? (
                      <div className="p-8 text-center bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-400 font-medium text-xs">
                        Não há nenhum pedido de venda ativo gerando faltas para este produto.
                      </div>
                    ) : (
                      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150 uppercase tracking-wider text-[9px]">
                            <tr>
                              <th className="px-4 py-3">Pedido</th>
                              <th className="px-4 py-3">Data</th>
                              <th className="px-4 py-3">Cliente</th>
                              <th className="px-4 py-3 text-right">Pedido</th>
                              <th className="px-4 py-3 text-right">Faturado</th>
                              <th className="px-4 py-3 text-right text-rose-700">Falta</th>
                              <th className="px-4 py-3 text-center">Status</th>
                              <th className="px-4 py-3">Previsão</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 text-[11px]">
                            {drawerPendingData.pending_sales_orders.map((item, idx) => (
                              <tr key={`${item.n_pedido}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-zinc-900 text-left">#{item.n_pedido}</td>
                                <td className="px-4 py-2.5 text-zinc-500">{formatDate(item.d_pedido)}</td>
                                <td className="px-4 py-2.5 font-semibold text-zinc-800 text-left max-w-[150px] truncate" title={item.c_nome || ''}>
                                  {item.c_nome || 'Consumidor Final'}
                                </td>
                                <td className="px-4 py-2.5 text-right text-zinc-700 font-medium">{item.n_qtde}</td>
                                <td className="px-4 py-2.5 text-right text-zinc-500">{item.n_qtde_fat}</td>
                                <td className="px-4 py-2.5 text-right text-rose-600 font-bold">{item.falta}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-bold border",
                                    statusColors[item.c_status || ''] || 'bg-zinc-100'
                                  )}>
                                    {statusLabels[item.c_status || ''] || item.c_status || '-'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 font-medium text-zinc-650">
                                  {item.d_previsao ? formatDate(item.d_previsao) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  // COMPRAS EM TRANSITO TAB
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-zinc-150 pb-2">
                      <Truck className="h-4.5 w-4.5 text-zinc-650" />
                      <h4 className="font-extrabold text-sm text-zinc-900">Pedidos de Compra (Em Trânsito)</h4>
                    </div>

                    {drawerPendingLoading ? (
                      <div className="p-8 text-center text-zinc-400 font-medium flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />
                        Carregando trânsito...
                      </div>
                    ) : !drawerPendingData || drawerPendingData.in_transit_purchase_orders.length === 0 ? (
                      <div className="p-8 text-center bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-400 font-medium text-xs">
                        Nenhum pedido de compra (em trânsito) localizado para este produto acabado.
                      </div>
                    ) : (
                      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150 uppercase tracking-wider text-[9px]">
                            <tr>
                              <th className="px-4 py-3">Ordem Compra</th>
                              <th className="px-4 py-3">Fornecedor</th>
                              <th className="px-4 py-3 text-right">Comprado</th>
                              <th className="px-4 py-3 text-right">Recebido</th>
                              <th className="px-4 py-3 text-right text-sky-700">Saldo Trânsito</th>
                              <th className="px-4 py-3">Previsão Entrega</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 text-[11px]">
                            {drawerPendingData.in_transit_purchase_orders.map((item, idx) => (
                              <tr key={`${item.n_pedido}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-zinc-900 text-left">#{item.n_pedido}</td>
                                <td className="px-4 py-2.5 font-semibold text-zinc-800 text-left max-w-[180px] truncate" title={item.c_nome_f || ''}>
                                  {item.c_nome_f}
                                </td>
                                <td className="px-4 py-2.5 text-right text-zinc-700 font-medium">{item.n_qtde.toLocaleString('pt-BR')}</td>
                                <td className="px-4 py-2.5 text-right text-zinc-500">{item.n_chegou.toLocaleString('pt-BR')}</td>
                                <td className="px-4 py-2.5 text-right text-sky-600 font-bold">{item.n_pendente.toLocaleString('pt-BR')}</td>
                                <td className="px-4 py-2.5 font-medium text-zinc-650">
                                  {item.d_previsao ? formatDate(item.d_previsao) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
