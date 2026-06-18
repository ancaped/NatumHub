import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Search, CheckCircle2, RefreshCw, X, ShieldAlert,
  Edit, Info, Check, Filter, Layers, ListFilter, AlertTriangle, HelpCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

const API_BASE = 'http://127.0.0.1:3001/api';

interface ProductOverride {
  codigo: string;
  estoque_ideal_manual: number | null;
  pedidos_manual: number | null;
  media_manual: number | null;
  is_lancamento_manual: number | null;
  visivel: number | null;
  observacao: string | null;
  linha_prefix_manual: string | null;
  status_produto: string | null;
  categoria_produto: string | null;
}

interface ProductResult {
  codigo: string;
  descricao: string;
  linha_prefix: string;
  nome_linha: string;
  base: string | null;
  fase: string | null;
  estoque: number;
  producao: number;
  pedidos_aberto: number;
  estoque_futuro: number;
  estoque_futuro_com_producao: number;
  status: string;
  status_label: string;
  producao_recomendada: number;
  media_vendas: number;
  is_lancamento: boolean;
  visivel: number | null;
  observacao: string | null;
  linha_prefix_manual: string | null;
  status_produto: string | null;
  categoria_produto: string | null;
}

interface LineConfig {
  linha_prefix: string;
  nome_linha: string;
}

interface ActiveProductsViewProps {
  onBackToHub: () => void;
  standalone?: boolean;
}

export default function ActiveProductsView({ onBackToHub, standalone = false }: ActiveProductsViewProps) {
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [configs, setConfigs] = useState<LineConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [lineFilter, setLineFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  // Editing Drawer
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  
  // Form overrides state
  const [statusForm, setStatusForm] = useState('ativo');
  const [categoryForm, setCategoryForm] = useState('');
  const [lineOverride, setLineOverride] = useState('');
  const [idealStockOverride, setIdealStockOverride] = useState('');
  const [salesOverride, setSalesOverride] = useState('');
  const [ordersOverride, setOrdersOverride] = useState('');
  const [obsForm, setObsForm] = useState('');
  const [isLaunchOverride, setIsLaunchOverride] = useState('AUTO'); // 'AUTO' | 'YES' | 'NO'
  const [visibleOverride, setVisibleOverride] = useState('1'); // '1' = visível, '0' = oculto

  // Bulk actions state
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkLine, setBulkLine] = useState('');
  const [bulkObs, setBulkObs] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodsRes, confRes] = await Promise.all([
        fetch(`${API_BASE}/products?limit=5000&show_hidden=true`),
        fetch(`${API_BASE}/configs`)
      ]);
      
      if (prodsRes.ok && confRes.ok) {
        const prodsData = await prodsRes.json();
        const confsData = await confRes.json();
        setProducts(prodsData.items || []);
        setConfigs(confsData || []);
      }
    } catch (e) {
      console.error("Erro ao carregar dados de produtos ativos:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        (p.descricao || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.codigo || '').toLowerCase().includes(search.toLowerCase());
      
      const resolvedStatus = p.status_produto || 'ativo';
      const matchesStatus = statusFilter === 'ALL' || resolvedStatus === statusFilter;
      
      const resolvedLine = p.linha_prefix_manual || p.linha_prefix;
      const matchesLine = lineFilter === 'ALL' || resolvedLine === lineFilter;

      const resolvedCategory = p.categoria_produto || 'Sem Categoria';
      const matchesCategory = categoryFilter === 'ALL' || resolvedCategory === categoryFilter;

      return matchesSearch && matchesStatus && matchesLine && matchesCategory;
    });
  }, [products, search, statusFilter, lineFilter, categoryFilter]);

  // Unique Categories for Filter
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.categoria_produto) {
        cats.add(p.categoria_produto);
      }
    });
    return Array.from(cats).sort();
  }, [products]);

  // Handle row selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const codes = filteredProducts.map(p => p.codigo);
      setSelectedCodes(new Set(codes));
    } else {
      setSelectedCodes(new Set());
    }
  };

  const handleSelectRow = (codigo: string) => {
    const next = new Set(selectedCodes);
    if (next.has(codigo)) next.delete(codigo);
    else next.add(codigo);
    setSelectedCodes(next);
  };

  // Open Edit Drawer
  const handleOpenEdit = (p: ProductResult) => {
    setSelectedProduct(p);
    
    // Populate form states
    setStatusForm(p.status_produto || 'ativo');
    setCategoryForm(p.categoria_produto || '');
    setLineOverride(p.linha_prefix_manual || 'AUTO');
    setIdealStockOverride(p.visivel === 0 ? '' : (p.producao_recomendada === 0 && p.status === 'descontinuado' ? '' : '')); // We will check actual overrides
    
    // We need to fetch the exact raw override from backend/local list if possible
    // For simplicity, let's prefill based on product data (if they exist)
    setObsForm(p.observacao || '');
    
    const isLaunch = p.is_lancamento;
    // We'll set overrides based on the values in the calculated results
    setIsLaunchOverride(
      p.linha_prefix_manual === null && p.status_produto === null ? 'AUTO' : 'AUTO'
    );
    setVisibleOverride(p.visivel === 0 ? '0' : '1');
    
    // Fetch exact overrides for this product code to fill the form accurately
    fetchProductOverride(p.codigo);
  };

  const fetchProductOverride = async (code: string) => {
    setDrawerLoading(true);
    try {
      const res = await fetch(`${API_BASE}/overrides`);
      if (res.ok) {
        const overridesList: ProductOverride[] = await res.json();
        const override = overridesList.find(o => o.codigo === code);
        if (override) {
          setStatusForm(override.status_produto || 'ativo');
          setCategoryForm(override.categoria_produto || '');
          setLineOverride(override.linha_prefix_manual || 'AUTO');
          setIdealStockOverride(override.estoque_ideal_manual?.toString() || '');
          setSalesOverride(override.media_manual?.toString() || '');
          setOrdersOverride(override.pedidos_manual?.toString() || '');
          setObsForm(override.observacao || '');
          
          if (override.is_lancamento_manual === 1) setIsLaunchOverride('YES');
          else if (override.is_lancamento_manual === 0) setIsLaunchOverride('NO');
          else setIsLaunchOverride('AUTO');

          if (override.visivel === 0) setVisibleOverride('0');
          else setVisibleOverride('1');
        } else {
          // Clear overrides inputs
          setIdealStockOverride('');
          setSalesOverride('');
          setOrdersOverride('');
          setIsLaunchOverride('AUTO');
          setVisibleOverride('1');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleSaveIndividualOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setDrawerLoading(true);
    try {
      const ovr: ProductOverride = {
        codigo: selectedProduct.codigo,
        estoque_ideal_manual: idealStockOverride ? parseInt(idealStockOverride, 10) : null,
        pedidos_manual: ordersOverride ? parseInt(ordersOverride, 10) : null,
        media_manual: salesOverride ? parseFloat(salesOverride) : null,
        is_lancamento_manual: isLaunchOverride === 'YES' ? 1 : isLaunchOverride === 'NO' ? 0 : null,
        visivel: visibleOverride === '0' ? 0 : null, // 0 = hidden, null/1 = visible
        observacao: obsForm.trim() || null,
        linha_prefix_manual: lineOverride === 'AUTO' ? null : lineOverride,
        status_produto: statusForm || 'ativo',
        categoria_produto: categoryForm.trim() || null,
      };

      const res = await fetch(`${API_BASE}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ovr),
      });

      if (res.ok) {
        setSelectedProduct(null);
        await loadData();
      } else {
        alert("Erro ao salvar configurações do produto.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro de conexão ao salvar.");
    } finally {
      setDrawerLoading(false);
    }
  };

  // Bulk Save
  const handleBulkAction = async (action: string, value: string) => {
    if (selectedCodes.size === 0) return;
    setLoading(true);
    try {
      const codesArray = Array.from(selectedCodes);
      const req = {
        codigos: codesArray,
        action,
        value_str: value || null,
      };

      const res = await fetch(`${API_BASE}/overrides/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (res.ok) {
        setSelectedCodes(new Set());
        setBulkStatus('');
        setBulkCategory('');
        setBulkLine('');
        setBulkObs('');
        await loadData();
      } else {
        alert("Erro ao aplicar alteração em lote.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao processar alteração em lote.");
    } finally {
      setLoading(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string | null) => {
    const statusVal = status || 'ativo';
    const styles: Record<string, string> = {
      ativo: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      lancamento: 'bg-sky-50 text-sky-700 border-sky-100',
      descontinuado: 'bg-rose-50 text-rose-700 border-rose-100',
      apoio: 'bg-amber-50 text-amber-700 border-amber-100',
      coloracao: 'bg-purple-50 text-purple-700 border-purple-100',
      terceirizado: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    };

    const labels: Record<string, string> = {
      ativo: 'Ativo / Em Linha',
      lancamento: 'Lançamento',
      descontinuado: 'Sair de Linha',
      apoio: 'Material de Apoio',
      coloracao: 'Coloração',
      terceirizado: 'Terceirizado',
    };

    return (
      <span className={cn("px-2 py-0.5 border text-[11px] font-bold rounded-full", styles[statusVal] || styles.ativo)}>
        {labels[statusVal] || labels.ativo}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-zinc-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          {!standalone && (
            <button 
              onClick={onBackToHub}
              className="bg-white border border-zinc-200 hover:bg-zinc-100 p-2 rounded-xl text-zinc-650 hover:text-zinc-900 transition-colors cursor-pointer"
              title="Voltar ao Estoque Hub"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h1 className="font-bold text-base tracking-tight text-zinc-800">Linhas & Produtos Ativos</h1>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Configure status, categorias e overrides de produtos</p>
          </div>
        </div>

        <button 
          onClick={loadData}
          className="p-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-zinc-650 transition-colors flex items-center gap-1.5 text-xs font-semibold"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar
        </button>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Table/List View */}
        <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-4">
          
          {/* Filtering and Search Header */}
          <div className="bg-white p-4 border border-zinc-200 rounded-2xl shadow-sm space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Search Bar */}
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar produto por código ou descrição..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm"
                />
              </div>

              {/* Status Filter */}
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm appearance-none cursor-pointer"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="ativo">Ativos / Em Linha</option>
                  <option value="lancamento">Lançamentos</option>
                  <option value="descontinuado">Sair de Linha / Descontinuado</option>
                  <option value="apoio">Material de Apoio</option>
                  <option value="coloracao">Coloração</option>
                  <option value="terceirizado">Terceirizado</option>
                </select>
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              </div>

              {/* Line Filter */}
              <div className="relative">
                <select
                  value={lineFilter}
                  onChange={(e) => setLineFilter(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm appearance-none cursor-pointer"
                >
                  <option value="ALL">Todas as Linhas</option>
                  {configs.map(c => (
                    <option key={c.linha_prefix} value={c.linha_prefix}>{c.nome_linha}</option>
                  ))}
                </select>
                <Layers className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold pt-1">
              <span>Filtros ativos encontraram {filteredProducts.length} de {products.length} produtos</span>
              <div className="flex items-center gap-2">
                {/* Category Filter */}
                <span className="text-zinc-400">Categoria:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-transparent border-none text-zinc-700 hover:text-zinc-900 cursor-pointer font-bold focus:outline-none"
                >
                  <option value="ALL">Todas</option>
                  <option value="Sem Categoria">Sem Categoria</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Main Table Card */}
          <div className="flex-1 bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-zinc-50 border-b border-zinc-150 font-bold text-zinc-500 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center">
                      <input 
                        type="checkbox"
                        checked={filteredProducts.length > 0 && selectedCodes.size === filteredProducts.length}
                        onChange={handleSelectAll}
                        className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                    </th>
                    <th className="px-4 py-3 w-24">Código</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3 w-40">Linha de Venda</th>
                    <th className="px-4 py-3 w-40">Status</th>
                    <th className="px-4 py-3 w-40">Categoria</th>
                    <th className="px-4 py-3">Obs.</th>
                    <th className="px-4 py-3 w-16 text-center">Editar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-zinc-400 font-medium">
                        <RefreshCw className="h-5 w-5 animate-spin text-zinc-500 mx-auto mb-2" />
                        Carregando produtos...
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-zinc-400">Nenhum produto corresponde aos filtros aplicados.</td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const isSelected = selectedCodes.has(p.codigo);
                      return (
                        <tr 
                          key={p.codigo} 
                          className={cn(
                            "hover:bg-zinc-50/70 transition-colors group cursor-pointer",
                            isSelected && "bg-zinc-50/50"
                          )}
                          onClick={() => handleSelectRow(p.codigo)}
                        >
                          <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectRow(p.codigo)}
                              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                            />
                          </td>
                          <td className="px-4 py-2.5 font-mono font-bold text-zinc-500">{p.codigo}</td>
                          <td className="px-4 py-2.5 font-bold text-zinc-800">{p.descricao}</td>
                          <td className="px-4 py-2.5 text-zinc-600">
                            {p.linha_prefix_manual ? (
                              <span className="flex items-center gap-1">
                                {configs.find(c => c.linha_prefix === p.linha_prefix_manual)?.nome_linha || p.linha_prefix_manual}
                                <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1 rounded font-bold uppercase scale-90">manual</span>
                              </span>
                            ) : (
                              configs.find(c => c.linha_prefix === p.linha_prefix)?.nome_linha || p.linha_prefix
                            )}
                          </td>
                          <td className="px-4 py-2.5">{renderStatusBadge(p.status_produto)}</td>
                          <td className="px-4 py-2.5">
                            {p.categoria_produto ? (
                              <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 border border-zinc-200 rounded text-[10px] font-semibold">
                                {p.categoria_produto}
                              </span>
                            ) : (
                              <span className="text-zinc-300 italic scale-95">Nenhuma</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 max-w-[200px] truncate text-zinc-500 font-medium" title={p.observacao || undefined}>
                            {p.observacao || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleOpenEdit(p)}
                              className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 rounded-lg transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bulk Selection Footer Actions */}
            {selectedCodes.size > 0 && (
              <div className="bg-zinc-900 text-white px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-zinc-800 shadow-2xl animate-in slide-in-from-bottom duration-300 z-20 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="bg-zinc-800 text-white font-bold px-2 py-0.5 rounded text-sm">
                    {selectedCodes.size}
                  </span>
                  <span className="text-sm font-medium text-zinc-300">produtos selecionados para edição em lote</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Status Bulk Select */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Status:</span>
                    <select
                      value={bulkStatus}
                      onChange={(e) => {
                        setBulkStatus(e.target.value);
                        handleBulkAction('set_status', e.target.value);
                      }}
                      className="bg-zinc-800 text-white border border-zinc-700 rounded-lg text-xs font-semibold py-1.5 px-2.5 focus:outline-none"
                    >
                      <option value="">Alterar para...</option>
                      <option value="ativo">Ativo / Em Linha</option>
                      <option value="lancamento">Lançamento</option>
                      <option value="descontinuado">Sair de Linha / Descontinuado</option>
                      <option value="apoio">Material de Apoio</option>
                      <option value="coloracao">Coloração</option>
                      <option value="terceirizado">Terceirizado</option>
                    </select>
                  </div>

                  {/* Category Bulk Input */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">Categoria:</span>
                    <input
                      type="text"
                      placeholder="Nova categoria..."
                      value={bulkCategory}
                      onChange={(e) => setBulkCategory(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleBulkAction('set_category', bulkCategory);
                        }
                      }}
                      className="bg-zinc-800 text-white placeholder-zinc-500 border border-zinc-700 rounded-lg text-xs font-semibold py-1.5 px-2.5 w-32 focus:outline-none focus:ring-1 focus:ring-white"
                    />
                    <button 
                      onClick={() => handleBulkAction('set_category', bulkCategory)}
                      className="px-2 py-1.5 bg-white text-zinc-900 rounded-lg text-xs font-bold hover:bg-zinc-200 transition-colors"
                    >
                      Aplicar
                    </button>
                  </div>

                  {/* Clear Selection */}
                  <button 
                    onClick={() => setSelectedCodes(new Set())}
                    className="text-xs text-zinc-400 hover:text-white px-2 py-1.5 font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Backdrop for Edit Drawer */}
        {selectedProduct && (
          <div 
            className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity duration-300 z-40" 
            onClick={() => setSelectedProduct(null)}
          />
        )}

        {/* Edit Drawer (Side panel) */}
        <div className={cn(
          "w-96 bg-white border-l border-zinc-200 shadow-2xl flex flex-col h-full absolute right-0 top-0 transition-transform duration-350 z-50",
          selectedProduct ? "translate-x-0" : "translate-x-full"
        )}>
          {/* Drawer Header */}
          <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center shrink-0">
            <div>
              <h3 className="font-extrabold text-zinc-900 text-base">Configurar Produto</h3>
              <p className="text-[10px] text-zinc-400 font-mono mt-0.5">Código: {selectedProduct?.codigo}</p>
            </div>
            <button 
              onClick={() => setSelectedProduct(null)}
              className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-650 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Content Form */}
          {drawerLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 font-medium">
              <RefreshCw className="h-5 w-5 animate-spin text-zinc-500 mb-2" />
              Carregando overrides do produto...
            </div>
          ) : (
            <form onSubmit={handleSaveIndividualOverride} className="flex-1 overflow-y-auto p-6 space-y-5 text-left">
              {/* Product Info Display */}
              <div>
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Descrição</span>
                <p className="font-bold text-zinc-800 text-sm mt-0.5">{selectedProduct?.descricao}</p>
              </div>

              {/* Status Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 block">Status do Produto</label>
                <select
                  value={statusForm}
                  onChange={(e) => setStatusForm(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                >
                  <option value="ativo">Ativo / Em Linha (Padrão)</option>
                  <option value="lancamento">Lançamento</option>
                  <option value="descontinuado">Sair de Linha / Descontinuado</option>
                  <option value="apoio">Material de Apoio</option>
                  <option value="coloracao">Coloração</option>
                  <option value="terceirizado">Terceirizado</option>
                </select>
                <span className="text-[10px] text-zinc-400 font-semibold block leading-tight">
                  Status alteram o comportamento de demandas de compras e recomendações de produção.
                </span>
              </div>

              {/* Custom Category Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 block">Categoria Customizada</label>
                <input
                  type="text"
                  placeholder="Ex: Shampoo, Condicionador, etc."
                  value={categoryForm}
                  onChange={(e) => setCategoryForm(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                />
              </div>

              {/* Line Override */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 block">Linha de Venda (Override)</label>
                <select
                  value={lineOverride}
                  onChange={(e) => setLineOverride(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                >
                  <option value="AUTO">Automático (Da importação do sistema)</option>
                  {configs.map(c => (
                    <option key={c.linha_prefix} value={c.linha_prefix}>{c.nome_linha}</option>
                  ))}
                </select>
              </div>

              {/* Toggle Launch Override */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 block">Marcar como Lançamento</label>
                <select
                  value={isLaunchOverride}
                  onChange={(e) => setIsLaunchOverride(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                >
                  <option value="AUTO">Determinar pelo Status de Linha</option>
                  <option value="YES">Sim (Forçar Lançamento)</option>
                  <option value="NO">Não (Forçar Normal)</option>
                </select>
              </div>

              <div className="border-t border-zinc-150 my-2 pt-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">Overrides de Estoque & Metas</span>
                
                {/* Ideal Stock Override Input */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-650 block">Estoque Ideal Fixo</label>
                    <input
                      type="number"
                      placeholder="Automático (meses)"
                      value={idealStockOverride}
                      onChange={(e) => setIdealStockOverride(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-650 block">Override Média Vendas</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Automático (calculado)"
                      value={salesOverride}
                      onChange={(e) => setSalesOverride(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-650 block">Pedidos em Aberto</label>
                    <input
                      type="number"
                      placeholder="Automático (carteira)"
                      value={ordersOverride}
                      onChange={(e) => setOrdersOverride(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-650 block">Visibilidade</label>
                    <select
                      value={visibleOverride}
                      onChange={(e) => setVisibleOverride(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                    >
                      <option value="1">Exibir no Sistema</option>
                      <option value="0">Ocultar de Linha (Esconder)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Custom Observations Area */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 block">Observações do Produto</label>
                <textarea
                  placeholder="Ex: Produzir apenas sob demanda firme de pedido..."
                  value={obsForm}
                  onChange={(e) => setObsForm(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                />
              </div>

              {/* Submit / Action Buttons */}
              <div className="pt-4 flex gap-3 border-t border-zinc-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  Salvar
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
