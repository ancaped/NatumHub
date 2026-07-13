import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { 
  ArrowLeft, Search, Database, Layers, Boxes, Calendar, FileText, 
  RefreshCw, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, 
  Info, Shield, Package, ShoppingCart, User, HelpCircle, FileSpreadsheet, Lock,
  Truck, Receipt, Clock, X, Link
} from 'lucide-react';
import { cn } from '../lib/utils';
import ActiveProductsView from './ActiveProductsView';
import { StockMovement, FormulationLine, DbDumpResult } from '../types';
const API_BASE = 'http://127.0.0.1:3001/api';

type EstoqueMode = 'insumos' | 'produtos' | 'ativos';

interface EstoqueViewProps {
  mode: EstoqueMode;
  onBackToHub: () => void;
}

interface ProductCalculationResult {
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
}

interface DemandResultWithIgnored {
  itemCode: string;
  description: string;
  unit: string;
  categoryId: string | null;
  categoryName: string;
  currentStock: number;
  reservedQty: number;
  inProduction: number;
  inOrders: number;
  overallAvg: number;
  urgency: string;
  notes: string | null;
}

// Extra info from /api/estoque/item-info/:code
interface InvoiceInfo {
  id: number;
  invoiceNumber: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  supplierName: string;
  supplierId: string;
  invoiceDate: string;
}

interface PendingOrderInfo {
  nPedido: number;
  dPedido: string | null;
  cNomeF: string | null;
  nQtde: number;
  nChegou: number;
  nPreco: number;
}

interface ProductLoteInfo {
  id: string;
  quantity: number;
  date: string;
  documentNumber: string | null;
  details: string | null;
}

interface ItemExtraInfo {
  invoices: InvoiceInfo[];
  pendingOrders: PendingOrderInfo[];
  formulation: FormulationLine[];
  lotes: ProductLoteInfo[];
}

const MODE_CONFIGS = {
  insumos: {
    title: 'Insumos',
    subtitle: 'Níveis de estoque de matérias-primas químicas, essências, embalagens e materiais de consumo com histórico de movimentações.',
    icon: Layers,
    pageName: 'Módulo de Estoque > Insumos',
  },
  produtos: {
    title: 'Produtos',
    subtitle: 'Formulações, estoque atual, previsões de demanda, ordens recomendadas e histórico de lotes.',
    icon: Package,
    pageName: 'Módulo de Estoque > Produtos',
  },
  ativos: {
    title: 'Linha de Produtos',
    subtitle: 'Definição de linhas de produtos, visibilidade e status ativo/lançamento.',
    icon: CheckCircle2,
    pageName: 'Módulo de Estoque > Linha de Produtos',
  },
};

export default function EstoqueView({ mode = 'insumos', onBackToHub }: EstoqueViewProps) {
  const [activeTab, setActiveTab] = useState<EstoqueMode>(mode);
  const [insumosSubTab, setInsumosSubTab] = useState<'todas' | 'mp' | 'emb' | 'mat' | 'relatorios' | 'contagens'>('todas');
  const [produtosSubTab, setProdutosSubTab] = useState<'todos' | 'relatorios' | 'contagens'>('todos');

  // Sync active tab if mode changes
  useEffect(() => {
    setActiveTab(mode);
  }, [mode]);

  if (activeTab === 'ativos') {
    return <ActiveProductsView onBackToHub={onBackToHub} standalone={false} />;
  }

  const config = MODE_CONFIGS[activeTab];
  const ModeIcon = config.icon;
  
  // Data States
  const [demands, setDemands] = useState<DemandResultWithIgnored[]>([]);
  const [products, setProducts] = useState<ProductCalculationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Side Drawer States
  const [selectedItem, setSelectedItem] = useState<{
    code: string;
    description: string;
    unit: string;
    type: 'insumo' | 'produto' | 'material';
    stock: number;
  } | null>(null);
  const [drawerTab, setDrawerTab] = useState<'movimentacoes' | 'formulacao' | 'notas' | 'pedidos' | 'lotes' | 'similar'>('movimentacoes');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [formulation, setFormulation] = useState<FormulationLine[]>([]);
  const [extraInfo, setExtraInfo] = useState<ItemExtraInfo | null>(null);
  const [productPendingOrders, setProductPendingOrders] = useState<any>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [similarItems, setSimilarItems] = useState<any[]>([]);
  const [similarSearch, setSimilarSearch] = useState('');
  const [allItems, setAllItems] = useState<any[]>([]);

  const reloadSimilarItems = async (code: string) => {
    try {
      const data = await api.getSimilarItems(code);
      setSimilarItems(data || []);
    } catch (e) {
      console.error("Erro ao carregar insumos semelhantes:", e);
    }
  };

  // Invoice detail modal state
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const handleOpenInvoiceDetail = async (invoiceNumber: string, supplierId: string | null) => {
    setInvoiceLoading(true);
    setSelectedInvoice(null);
    try {
      const params = new URLSearchParams();
      if (supplierId) params.set('supplier_id', supplierId);
      const res = await fetch(`${API_BASE}/compras/notas/${invoiceNumber}?${params.toString()}`);
      if (res.ok) {
        setSelectedInvoice(await res.json());
      }
    } catch (e) {
      console.error("Erro ao carregar detalhes da nota fiscal:", e);
    } finally {
      setInvoiceLoading(false);
    }
  };

  // Load Main Data
  const loadData = async (silent = false) => {
    if ((activeTab as string) === 'ativos') return;
    if (!silent) setLoading(true);
    try {
      if (activeTab === 'produtos') {
        // Get calculated products with stocks via REST API
        const res = await fetch(`${API_BASE}/products?limit=5000`);
        if (res.ok) {
          const data = await res.json();
          setProducts(data.items || []);
        }
      } else if (activeTab === 'insumos') {
        // Get raw items/demands via Tauri API (for stock snapshots of Insumos/Materiais)
        const demandsData = await api.getDemands();
        setDemands(demandsData as any);
      }
    } catch (e) {
      console.error("Erro ao carregar dados de estoque:", e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const hasProducts = products.length > 0;
    const hasDemands = demands.length > 0;
    const alreadyLoaded = (activeTab === 'produtos' && hasProducts) || 
                          (activeTab === 'insumos' && hasDemands);
    
    if ((activeTab as string) !== 'ativos') {
      loadData(alreadyLoaded);
    }
    (window as any).__current_page__ = config.pageName;
  }, [activeTab]);

  // Click handler to open detail drawer
  const handleOpenDrawer = async (
    code: string,
    description: string,
    unit: string,
    type: 'insumo' | 'produto' | 'material',
    stock: number
  ) => {
    setSelectedItem({ code, description, unit, type, stock });
    setDrawerLoading(true);
    setDrawerError(null);
    setMovements([]);
    setFormulation([]);
    setExtraInfo(null);
    setProductPendingOrders(null);
    
    // Choose default drawer tab based on type
    if (type === 'produto') {
      setDrawerTab('formulacao');
    } else {
      setDrawerTab('movimentacoes');
    }

    try {
      // Fetch movements
      const movRes = await fetch(`${API_BASE}/estoque/movimentacoes/${code}`);
      if (movRes.ok) {
        setMovements(await movRes.json());
      }

      // Fetch pending sales/purchase orders if product
      if (type === 'produto') {
        const pedRes = await fetch(`${API_BASE}/produtos/${code}/pedidos-pendentes`);
        if (pedRes.ok) {
          setProductPendingOrders(await pedRes.json());
        }
      }

      // Fetch extra info (invoices, pending orders, formulation, lotes)
      const extraRes = await fetch(`${API_BASE}/estoque/item-info/${code}`);
      if (extraRes.ok) {
        const extra: ItemExtraInfo = await extraRes.json();
        setExtraInfo(extra);
        if (extra.formulation.length > 0) {
          setFormulation(extra.formulation);
        }
      }

      // Fallback: If finished product and formulation not from item-info, fetch directly
      if (type === 'produto') {
        const formRes = await fetch(`${API_BASE}/produtos/formulacao/${code}`);
        if (formRes.ok) {
          const formData = await formRes.json();
          if (formData.length > 0) {
            setFormulation(formData);
          }
        }
      }

      if (type !== 'produto') {
        try {
          const simData = await api.getSimilarItems(code);
          setSimilarItems(simData || []);
          const allData = await api.getItems();
          setAllItems(allData || []);
        } catch (e) {
          console.error("Erro ao carregar dados de semelhantes:", e);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar detalhes do item:", e);
      setDrawerError("Erro ao carregar os dados de rastreabilidade.");
    } finally {
      setDrawerLoading(false);
    }
  };

  // Filter demands based on activeTab, insumosSubTab and search
  const filteredDemands = useMemo(() => {
    if (activeTab !== 'insumos') return [];
    let list = demands;

    if (insumosSubTab === 'mp') {
      list = list.filter(d => d.itemCode.startsWith('9.15.'));
    } else if (insumosSubTab === 'emb') {
      list = list.filter(d => d.itemCode.startsWith('9.') && !d.itemCode.startsWith('9.15.'));
    } else if (insumosSubTab === 'mat') {
      list = list.filter(d => d.itemCode.startsWith('08.'));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => 
        d.itemCode.toLowerCase().includes(q) || 
        d.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [demands, activeTab, insumosSubTab, search]);

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    if (activeTab !== 'produtos') return [];
    let list = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => 
        p.codigo.toLowerCase().includes(q) || 
        p.descricao.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, activeTab, search]);

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

  // Drawer tab list depends on item type
  const drawerTabs = useMemo(() => {
    if (!selectedItem) return [];
    const tabs: { id: typeof drawerTab; label: string; icon: any }[] = [];
    
    if (selectedItem.type === 'produto') {
      tabs.push({ id: 'formulacao', label: 'Formulação', icon: FileSpreadsheet });
      tabs.push({ id: 'lotes', label: 'Lotes Produzidos', icon: Package });
      tabs.push({ id: 'movimentacoes', label: 'Movimentações', icon: ArrowUpRight });
      tabs.push({ id: 'pedidos', label: 'Pedidos em Aberto', icon: Truck });
    } else {
      tabs.push({ id: 'formulacao', label: 'Usado em Produtos', icon: Layers });
      tabs.push({ id: 'movimentacoes', label: 'Movimentações', icon: ArrowUpRight });
      tabs.push({ id: 'notas', label: 'Notas Fiscais', icon: Receipt });
      tabs.push({ id: 'pedidos', label: 'Pedidos Pendentes', icon: Truck });
      tabs.push({ id: 'similar', label: 'Semelhantes', icon: Link });
    }
    return tabs;
  }, [selectedItem]);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-zinc-900 text-white p-2 rounded-xl shadow-sm">
              {activeTab === 'insumos' ? <Layers className="h-5 w-5" /> : <Package className="h-5 w-5" />}
            </div>
            <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase">
              {activeTab === 'insumos' ? 'Insumos' : 'Produtos'}
            </h1>
          </div>
        </div>

        {/* Back Button */}
        <div className="p-3 border-b border-zinc-100">
          <button
            onClick={onBackToHub}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer border border-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao Estoque Hub
          </button>
        </div>

        {/* Navigation Tabs */}
        {activeTab === 'insumos' ? (
          <div className="p-2 border-b border-zinc-100 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Categorias
            </div>
            <button
              onClick={() => setInsumosSubTab('todas')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                insumosSubTab === 'todas' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              )}
            >
              <Layers className="h-4 w-4" />
              Visão Geral (Todas)
            </button>
            <button
              onClick={() => setInsumosSubTab('mp')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                insumosSubTab === 'mp' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              )}
            >
              <Database className="h-4 w-4" />
              Matéria-Prima
            </button>
            <button
              onClick={() => setInsumosSubTab('emb')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                insumosSubTab === 'emb' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              )}
            >
              <Boxes className="h-4 w-4" />
              Embalagens
            </button>
            <button
              onClick={() => setInsumosSubTab('mat')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                insumosSubTab === 'mat' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              )}
            >
              <Boxes className="h-4 w-4 text-purple-450" />
              Materiais & Consumo
            </button>

            <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider pt-2">
              Operação de Estoque
            </div>
            <button
              onClick={() => setInsumosSubTab('relatorios')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                insumosSubTab === 'relatorios' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              )}
            >
              <FileText className="h-4 w-4 text-zinc-450" />
              Relatórios de Estoque
            </button>
            <button
              onClick={() => setInsumosSubTab('contagens')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                insumosSubTab === 'contagens' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              )}
            >
              <Calendar className="h-4 w-4 text-zinc-450" />
              Contagens Programadas
            </button>
          </div>
        ) : (
          <div className="p-2 border-b border-zinc-100 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Catálogo
            </div>
            <button
              onClick={() => setProdutosSubTab('todos')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                produtosSubTab === 'todos' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              )}
            >
              <Package className="h-4 w-4" />
              Todos os Produtos
            </button>

            <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider pt-2">
              Operação de Estoque
            </div>
            <button
              onClick={() => setProdutosSubTab('relatorios')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                produtosSubTab === 'relatorios' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              )}
            >
              <FileText className="h-4 w-4 text-zinc-450" />
              Relatórios de Estoque
            </button>
            <button
              onClick={() => setProdutosSubTab('contagens')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                produtosSubTab === 'contagens' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-650 hover:bg-zinc-50"
              )}
            >
              <Calendar className="h-4 w-4 text-zinc-450" />
              Contagens Programadas
            </button>
          </div>
        )}

        {/* Module Description and Stats in sidebar */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-zinc-50 rounded-xl p-4 space-y-3 border border-zinc-100">
            <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">{config.title}</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">{config.subtitle}</p>
          </div>
          
          {(activeTab as string) !== 'ativos' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] text-zinc-400 font-bold uppercase">Total Itens</span>
                <span className="text-sm font-extrabold text-zinc-900">
                  {activeTab === 'produtos' ? filteredProducts.length : filteredDemands.length}
                </span>
              </div>
              {activeTab === 'produtos' ? (
                <>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Críticos</span>
                    <span className="text-sm font-extrabold text-red-600">
                      {filteredProducts.filter(p => p.status === 'critico').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Requer Ordem</span>
                    <span className="text-sm font-extrabold text-amber-600">
                      {filteredProducts.filter(p => p.status === 'ordem').length}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Críticos</span>
                    <span className="text-sm font-extrabold text-red-600">
                      {filteredDemands.filter(d => d.urgency === 'critical').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Atenção</span>
                    <span className="text-sm font-extrabold text-amber-600">
                      {filteredDemands.filter(d => d.urgency === 'warning').length}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {(activeTab as string) === 'ativos' ? (
          <ActiveProductsView onBackToHub={onBackToHub} standalone={false} />
        ) : (
          <>
            <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 shrink-0">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-zinc-900">{config.title}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{config.subtitle}</p>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6 flex flex-col">
              {activeTab === 'insumos' && insumosSubTab === 'relatorios' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white border border-zinc-200 rounded-2xl shadow-sm space-y-4 max-w-2xl mx-auto mt-12 animate-in fade-in duration-300">
                  <div className="bg-zinc-50 p-4 rounded-full text-zinc-650 border border-zinc-150">
                    <FileText className="h-10 w-10 text-zinc-500" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900">Relatórios de Estoque (Insumos)</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed max-w-md">
                    Esta funcionalidade está programada para uma futura atualização. Aqui você poderá consultar o histórico completo de movimentações físicas, giro de estoque médio mensal, projeção futura por categoria e curva ABC de insumos.
                  </p>
                </div>
              ) : activeTab === 'insumos' && insumosSubTab === 'contagens' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white border border-zinc-200 rounded-2xl shadow-sm space-y-4 max-w-2xl mx-auto mt-12 animate-in fade-in duration-300">
                  <div className="bg-zinc-50 p-4 rounded-full text-zinc-650 border border-zinc-150">
                    <Calendar className="h-10 w-10 text-zinc-500" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900">Contagens Programadas (Insumos)</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed max-w-md">
                    Esta funcionalidade está programada para uma futura atualização. Permitirá o agendamento de inventários periódicos (cíclicos), registro de divergências físico-contábil, e geração automática de acertos e relatórios de auditoria.
                  </p>
                </div>
              ) : activeTab === 'produtos' && produtosSubTab === 'relatorios' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white border border-zinc-200 rounded-2xl shadow-sm space-y-4 max-w-2xl mx-auto mt-12 animate-in fade-in duration-300">
                  <div className="bg-zinc-50 p-4 rounded-full text-zinc-650 border border-zinc-150">
                    <FileText className="h-10 w-10 text-zinc-500" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900">Relatórios de Estoque (Produtos)</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed max-w-md">
                    Esta funcionalidade está programada para uma futura atualização. Permitirá a análise de lucratividade estimada, cobertura de estoque físico, histórico anual YoY (Year-over-Year), e relatórios gerenciais consolidados.
                  </p>
                </div>
              ) : activeTab === 'produtos' && produtosSubTab === 'contagens' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-white border border-zinc-200 rounded-2xl shadow-sm space-y-4 max-w-2xl mx-auto mt-12 animate-in fade-in duration-300">
                  <div className="bg-zinc-50 p-4 rounded-full text-zinc-650 border border-zinc-150">
                    <Calendar className="h-10 w-10 text-zinc-500" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900">Contagens Programadas (Produtos)</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed max-w-md">
                    Esta funcionalidade está programada para uma futura atualização. Permitirá o planejamento e controle de inventários rotativos físicos do almoxarifado de produtos acabados.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
              {/* Controls bar */}
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar por código ou descrição..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all text-sm shadow-sm"
                  />
                </div>
                <div className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-3 py-1.5 rounded-lg">
                  {activeTab === 'produtos' ? `${filteredProducts.length} itens` : `${filteredDemands.length} itens`}
                </div>
              </div>

              {/* Table / List */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  {loading ? (
                    <div className="p-12 text-center text-zinc-400 font-semibold flex items-center justify-center gap-3">
                      <RefreshCw className="h-5 w-5 animate-spin text-zinc-500" />
                      Carregando dados de estoque...
                    </div>
                  ) : activeTab === 'produtos' ? (
                    filteredProducts.length === 0 ? (
                      <div className="p-12 text-center text-zinc-400">Nenhum produto encontrado.</div>
                    ) : (
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold">
                          <tr>
                            <th className="px-6 py-4">Código</th>
                            <th className="px-6 py-4">Descrição</th>
                            <th className="px-6 py-4 text-right">Estoque Físico</th>
                            <th className="px-6 py-4 text-right">Em Produção</th>
                            <th className="px-6 py-4 text-right">Pedidos em Aberto</th>
                            <th className="px-6 py-4 text-center">Status de Estoque</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {filteredProducts.map((p) => (
                            <tr
                              key={p.codigo}
                              onClick={() => handleOpenDrawer(p.codigo, p.descricao, 'UN', 'produto', p.estoque)}
                              className="hover:bg-zinc-50/50 transition-colors cursor-pointer"
                            >
                              <td className="px-6 py-4 font-mono text-xs text-zinc-500">{p.codigo}</td>
                              <td className="px-6 py-4 font-bold text-zinc-800">{p.descricao}</td>
                              <td className="px-6 py-4 text-right font-semibold text-zinc-900">{p.estoque.toLocaleString('pt-BR')} UN</td>
                              <td className="px-6 py-4 text-right text-zinc-500">{p.producao > 0 ? `+${p.producao.toLocaleString('pt-BR')}` : '-'}</td>
                              <td className="px-6 py-4 text-right text-zinc-500">{p.pedidos_aberto > 0 ? `-${p.pedidos_aberto.toLocaleString('pt-BR')}` : '-'}</td>
                              <td className="px-6 py-4 text-center">
                                <span className={cn(
                                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide",
                                  p.status === 'critico' && "bg-red-50 text-red-700 border border-red-200",
                                  p.status === 'ordem' && "bg-amber-50 text-amber-700 border border-amber-200",
                                  p.status === 'saudavel' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                                  p.status === 'abundante' && "bg-blue-50 text-blue-700 border border-blue-200",
                                  p.status === 'descontinuado' && "bg-zinc-100 text-zinc-750 border border-zinc-200",
                                  p.status === 'bases' && "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                )}>
                                  {p.status_label}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : (
                    filteredDemands.length === 0 ? (
                      <div className="p-12 text-center text-zinc-400">Nenhum item encontrado.</div>
                    ) : (
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold">
                          <tr>
                            <th className="px-6 py-4">Código</th>
                            <th className="px-6 py-4">Descrição</th>
                            <th className="px-6 py-4 text-right">Estoque Físico</th>
                            <th className="px-6 py-4 text-right">Reservado</th>
                            <th className="px-6 py-4 text-right">Pedidos Solicitados</th>
                            <th className="px-6 py-4 text-right">Consumo Médio</th>
                            <th className="px-6 py-4 text-center">Situação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {filteredDemands.map((d) => (
                            <tr 
                              key={d.itemCode} 
                              onClick={() => handleOpenDrawer(
                                d.itemCode,
                                d.description,
                                d.unit,
                                d.itemCode.startsWith('08.') ? 'material' : 'insumo',
                                d.currentStock
                              )}
                              className="hover:bg-zinc-50/50 transition-colors cursor-pointer"
                            >
                              <td className="px-6 py-4 font-mono text-xs text-zinc-500">{d.itemCode}</td>
                              <td className="px-6 py-4 font-bold text-zinc-800">{d.description}</td>
                              <td className="px-6 py-4 text-right font-semibold text-zinc-900">{d.currentStock.toLocaleString('pt-BR')} {d.unit}</td>
                              <td className="px-6 py-4 text-right text-zinc-500">{d.reservedQty > 0 ? `-${d.reservedQty.toLocaleString('pt-BR')}` : '-'}</td>
                              <td className="px-6 py-4 text-right text-zinc-500">{d.inOrders > 0 ? `+${d.inOrders.toLocaleString('pt-BR')}` : '-'}</td>
                              <td className="px-6 py-4 text-right font-medium text-zinc-650">
                                {d.overallAvg > 0 ? `${d.overallAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/mês` : '-'}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={cn(
                                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide",
                                  d.urgency === 'critical' && "bg-red-50 text-red-700 border border-red-200",
                                  d.urgency === 'warning' && "bg-amber-50 text-amber-700 border border-amber-200",
                                  d.urgency === 'ok' && "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                )}>
                                  {d.urgency === 'critical' && 'Crítico'}
                                  {d.urgency === 'warning' && 'Atenção'}
                                  {d.urgency === 'ok' && 'OK'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
          </>
        )}
      </div>

      {/* Side Detail Drawer (Movimentações, Fórmula, Notas, Pedidos, Lotes) */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          {/* Overlay click to close */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setSelectedItem(null)} />
          
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-350 z-10">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-start">
              <div>
                <span className="px-2 py-0.5 bg-zinc-900 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                  {selectedItem.type === 'insumo' && 'Insumo'}
                  {selectedItem.type === 'material' && 'Material'}
                  {selectedItem.type === 'produto' && 'Produto Acabado'}
                </span>
                <h3 className="font-bold text-zinc-900 text-lg mt-1">{selectedItem.description}</h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">{selectedItem.code} | Estoque Atual: {selectedItem.stock.toLocaleString('pt-BR')} {selectedItem.unit}</p>
              </div>
              <button 
                onClick={() => setSelectedItem(null)} 
                className="p-1.5 hover:bg-zinc-150 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </button>
            </div>

            {/* Drawer Tab Navigation */}
            <div className="flex border-b border-zinc-200 bg-zinc-50 shrink-0">
              {drawerTabs.map(tab => (
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

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {drawerLoading ? (
                <div className="h-full flex items-center justify-center text-zinc-400 font-semibold gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Carregando informações...
                </div>
              ) : drawerError ? (
                <div className="bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-xl text-xs flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{drawerError}</span>
                </div>
              ) : drawerTab === 'formulacao' ? (
                /* Product Recipe Formulation Table OR Insumo Usage */
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                    <Info className="h-3.5 w-3.5 text-zinc-400" />
                    {selectedItem.type === 'produto' 
                      ? 'Ingredientes necessários para fabricar um lote deste produto.'
                      : 'Produtos que utilizam este insumo em suas formulações.'}
                  </div>
                  {formulation.length === 0 ? (
                    <div className="text-center py-12 text-zinc-400">
                      {selectedItem.type === 'produto'
                        ? 'Nenhuma fórmula registrada para este produto.'
                        : 'Este item não faz parte da fórmula de nenhum produto registrado.'}
                    </div>
                  ) : selectedItem.type === 'produto' ? (
                    // Separate ingredients into Matérias-Primas and Embalagens
                    (() => {
                      const rawMaterials = formulation.filter(line => line.ingredientCode.startsWith('9.15.'));
                      const packaging = formulation.filter(line => !line.ingredientCode.startsWith('9.15.'));
                      return (
                        <div className="space-y-6">
                          {rawMaterials.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wider px-1">
                                Matérias-Primas ({rawMaterials.length})
                              </h4>
                              <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                                <table className="w-full text-left text-xs whitespace-nowrap">
                                  <thead className="bg-zinc-50 text-zinc-500 font-semibold border-b border-zinc-200">
                                    <tr>
                                      <th className="px-4 py-3">Código</th>
                                      <th className="px-4 py-3">Descrição Ingrediente</th>
                                      <th className="px-4 py-3 text-right">Qtd</th>
                                      <th className="px-4 py-3 text-right">Percentual</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-zinc-100">
                                    {rawMaterials.map((line, idx) => (
                                      <tr key={`raw-${line.ingredientCode}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">{line.ingredientCode}</td>
                                        <td className="px-4 py-3 font-bold text-zinc-800">{line.description || 'Não especificado'}</td>
                                        <td className="px-4 py-3 text-right font-semibold">{line.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
                                        <td className="px-4 py-3 text-right font-medium text-zinc-650">
                                          {line.percentage ? `${line.percentage.toFixed(2)}%` : '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {packaging.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wider px-1">
                                Embalagens ({packaging.length})
                              </h4>
                              <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                                <table className="w-full text-left text-xs whitespace-nowrap">
                                  <thead className="bg-zinc-50 text-zinc-500 font-semibold border-b border-zinc-200">
                                    <tr>
                                      <th className="px-4 py-3">Código</th>
                                      <th className="px-4 py-3">Descrição Ingrediente</th>
                                      <th className="px-4 py-3 text-right">Qtd</th>
                                      <th className="px-4 py-3 text-right">Percentual</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-zinc-100">
                                    {packaging.map((line, idx) => (
                                      <tr key={`pack-${line.ingredientCode}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">{line.ingredientCode}</td>
                                        <td className="px-4 py-3 font-bold text-zinc-800">{line.description || 'Não especificado'}</td>
                                        <td className="px-4 py-3 text-right font-semibold">{line.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
                                        <td className="px-4 py-3 text-right font-medium text-zinc-650">
                                          {line.percentage ? `${line.percentage.toFixed(2)}%` : '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-zinc-50 text-zinc-500 font-semibold border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-3">Código</th>
                            <th className="px-4 py-3">Nome do Produto</th>
                            <th className="px-4 py-3 text-right">Qtd</th>
                            <th className="px-4 py-3 text-right">Percentual</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {formulation.map((line, idx) => (
                            <tr key={`${line.productCode}-${line.ingredientCode}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                              <td className="px-4 py-3 font-mono text-[10px] text-zinc-500">{line.productCode}</td>
                              <td className="px-4 py-3 font-bold text-zinc-800">{line.description || 'Não especificado'}</td>
                              <td className="px-4 py-3 text-right font-semibold">{line.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
                              <td className="px-4 py-3 text-right font-medium text-zinc-650">
                                {line.percentage ? `${line.percentage.toFixed(2)}%` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : drawerTab === 'lotes' ? (
                /* Product Batch History */
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                    <Package className="h-3.5 w-3.5 text-zinc-400" />
                    Últimos lotes produzidos registrados no sistema.
                  </div>
                  {(!extraInfo || extraInfo.lotes.length === 0) ? (
                    <div className="text-center py-12 text-zinc-400">Nenhum lote registrado recentemente.</div>
                  ) : (
                    <div className="space-y-3">
                      {extraInfo.lotes.map((lote) => (
                        <div key={lote.id} className="bg-white border border-zinc-150 p-4 rounded-xl shadow-sm space-y-2 hover:border-zinc-300 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 text-[9px] font-bold uppercase rounded">
                              Lote Produzido
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                              <Calendar size={10} />
                              {formatDate(lote.date)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between pt-1">
                            <strong className="text-zinc-900 text-base font-extrabold">
                              +{lote.quantity.toLocaleString('pt-BR')} UN
                            </strong>
                            {lote.documentNumber && (
                              <span className="text-xs font-mono font-bold text-zinc-500">
                                Doc: #{lote.documentNumber}
                              </span>
                            )}
                          </div>
                          {lote.details && (
                            <p className="text-xs text-zinc-500 font-medium pt-1 border-t border-zinc-100 mt-1">
                              {lote.details}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : drawerTab === 'notas' ? (
                /* Recent Invoices for Insumos/Materiais */
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                    <Receipt className="h-3.5 w-3.5 text-zinc-400" />
                    Últimas notas fiscais de compra registradas para este item.
                  </div>
                  {(!extraInfo || extraInfo.invoices.length === 0) ? (
                    <div className="text-center py-12 text-zinc-400">Nenhuma nota fiscal encontrada para este item.</div>
                  ) : (
                    <div className="space-y-3">
                      {extraInfo.invoices.map((inv) => (
                        <button
                          key={inv.id}
                          onClick={() => handleOpenInvoiceDetail(inv.invoiceNumber, inv.supplierId)}
                          className="w-full text-left bg-white border border-zinc-150 p-4 rounded-xl shadow-sm space-y-2 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer block focus:outline-none"
                          title="Clique para ver detalhes desta nota fiscal"
                        >
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 text-[9px] font-bold uppercase rounded">
                              NF #{inv.invoiceNumber}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                              <Calendar size={10} />
                              {formatDate(inv.invoiceDate)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between pt-1">
                            <strong className="text-zinc-900 text-base font-extrabold">
                              {inv.quantity.toLocaleString('pt-BR')} {inv.unit}
                            </strong>
                            <span className="text-sm font-bold text-zinc-700">
                              {formatCurrency(inv.totalValue)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-100">
                            <span className="font-medium">{inv.supplierName || 'Fornecedor não informado'}</span>
                            <span className="font-semibold">P.U. {formatCurrency(inv.unitPrice)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : drawerTab === 'pedidos' ? (
                selectedItem.type === 'produto' ? (
                  /* Pending Sales Orders (Faltas) for Products */
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                      <Truck className="h-3.5 w-3.5 text-zinc-400" />
                      Pedidos de venda ativos (faltas) aguardando faturamento.
                    </div>
                    {(!productPendingOrders || !productPendingOrders.pending_sales_orders || productPendingOrders.pending_sales_orders.length === 0) ? (
                      <div className="text-center py-12 text-zinc-400">Nenhum pedido de venda pendente para este produto.</div>
                    ) : (
                      <div className="space-y-3">
                        {productPendingOrders.pending_sales_orders.map((so: any, index: number) => {
                          const percent = so.n_qtde > 0 ? (so.n_qtde_fat / so.n_qtde) * 100 : 0;
                          return (
                            <div key={`${so.n_pedido}-${index}`} className="bg-white border border-zinc-150 p-4 rounded-xl shadow-sm space-y-3 hover:border-zinc-300 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 text-[9px] font-bold uppercase rounded">
                                  Pedido #{so.n_pedido}
                                </span>
                                <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                                  <Calendar size={10} />
                                  {formatDate(so.d_pedido)}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-xs text-left">
                                <div>
                                  <span className="text-zinc-400 font-medium">Qtd. Pedida</span>
                                  <p className="font-bold text-zinc-900">{so.n_qtde.toLocaleString('pt-BR')}</p>
                                </div>
                                <div>
                                  <span className="text-zinc-400 font-medium">Qtd. Faturada</span>
                                  <p className="font-bold text-emerald-600">{so.n_qtde_fat.toLocaleString('pt-BR')}</p>
                                </div>
                                <div className="text-right">
                                  <span className="text-zinc-400 font-medium">Qtd. Pendente</span>
                                  <p className="font-bold text-amber-600">{so.falta.toLocaleString('pt-BR')}</p>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div className="space-y-1">
                                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(percent, 100)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-between text-xs text-zinc-550 pt-2 border-t border-zinc-100 items-center">
                                <span className="font-bold text-zinc-700 truncate max-w-[170px]" title={so.c_nome}>{so.c_nome || 'Cliente não informado'}</span>
                                <span className="font-semibold text-zinc-400">Previsão: {so.d_previsao ? formatDate(so.d_previsao) : 'Não informado'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Pending Purchase Orders for Insumos/Materiais */
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                      <Truck className="h-3.5 w-3.5 text-zinc-400" />
                      Pedidos de compra com quantidade pendente de recebimento.
                    </div>
                    {(!extraInfo || extraInfo.pendingOrders.length === 0) ? (
                      <div className="text-center py-12 text-zinc-400">Nenhum pedido pendente para este item.</div>
                    ) : (
                      <div className="space-y-3">
                        {extraInfo.pendingOrders.map((po, index) => {
                          const remaining = po.nQtde - po.nChegou;
                          const percent = po.nQtde > 0 ? (po.nChegou / po.nQtde) * 100 : 0;
                          return (
                            <div key={`${po.nPedido}-${index}`} className="bg-white border border-zinc-150 p-4 rounded-xl shadow-sm space-y-3 hover:border-zinc-300 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 text-[9px] font-bold uppercase rounded">
                                  Pedido #{po.nPedido}
                                </span>
                                <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                                  <Calendar size={10} />
                                  {formatDate(po.dPedido)}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-xs text-left">
                                <div>
                                  <span className="text-zinc-400 font-medium">Solicitado</span>
                                  <p className="font-bold text-zinc-900">{po.nQtde.toLocaleString('pt-BR')}</p>
                                </div>
                                <div>
                                  <span className="text-zinc-400 font-medium">Recebido</span>
                                  <p className="font-bold text-emerald-600">{po.nChegou.toLocaleString('pt-BR')}</p>
                                </div>
                                <div className="text-right">
                                  <span className="text-zinc-400 font-medium">Faltante</span>
                                  <p className="font-bold text-amber-600">{remaining.toLocaleString('pt-BR')}</p>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div className="space-y-1">
                                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(percent, 100)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-100">
                                <span className="font-medium">{po.cNomeF || 'Fornecedor não informado'}</span>
                                <span className="font-semibold">P.U. {formatCurrency(po.nPreco)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )
              ) : drawerTab === 'similar' ? (
                /* Similar Items management for Insumos */
                <div className="space-y-4 text-left">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                    <Info className="h-3.5 w-3.5 text-zinc-400" />
                    Gerencie insumos semelhantes que podem ser usados como substitutos em lotes de produção.
                  </div>

                  {/* Search and associate similar items */}
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-3">
                    <h5 className="text-xs font-bold text-zinc-700">Associar Novo Insumo Semelhante</h5>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Buscar insumo por código ou descrição..."
                        value={similarSearch}
                        onChange={(e) => setSimilarSearch(e.target.value)}
                        className="w-full text-xs border border-zinc-300 rounded-md pl-8 pr-3 py-2 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white"
                      />
                    </div>

                    {/* Results list */}
                    {similarSearch.trim().length >= 2 && (
                      <div className="bg-white border border-zinc-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-zinc-100 shadow-sm">
                        {allItems
                          .filter(i => 
                            i.code !== selectedItem.code &&
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
                                    await api.addSimilarItem(selectedItem.code, item.code);
                                    setSimilarSearch('');
                                    reloadSimilarItems(selectedItem.code);
                                  } catch (e) {
                                    console.error(e);
                                    alert("Erro ao associar insumo");
                                  }
                                }}
                                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                              >
                                Associar
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* List of associated similar items */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-zinc-700">Insumos Semelhantes Cadastrados ({similarItems.length})</h5>
                    {similarItems.length === 0 ? (
                      <div className="text-center py-8 text-zinc-400 bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200">
                        Nenhum insumo semelhante associado a este item.
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-100 border border-zinc-150 rounded-xl bg-white overflow-hidden font-medium">
                        {similarItems.map(item => (
                          <div key={item.code} className="p-3 flex items-center justify-between text-xs hover:bg-zinc-50/30 transition-colors">
                            <div>
                              <div className="font-semibold text-zinc-900">{item.description}</div>
                              <div className="text-[10px] text-zinc-450 font-mono mt-0.5 font-bold">REF: {item.code}</div>
                            </div>
                            <button
                              onClick={async () => {
                                if (window.confirm(`Remover similaridade com o insumo "${item.description}"?`)) {
                                  try {
                                    await api.removeSimilarItem(selectedItem.code, item.code);
                                    reloadSimilarItems(selectedItem.code);
                                  } catch (e) {
                                    console.error(e);
                                    alert("Erro ao remover associação");
                                  }
                                }
                              }}
                              className="text-xs text-rose-650 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                            >
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Timeline Movements List */
                <div className="space-y-6">
                  {movements.length === 0 ? (
                    <div className="text-center py-12 text-zinc-400">Nenhuma movimentação registrada nos últimos 12 meses.</div>
                  ) : (
                    <div className="relative pl-6 border-l-2 border-zinc-200 space-y-6 text-left">
                      {movements.map((mov) => {
                        const isEntrada = mov.movementType === 'entrada';
                        return (
                          <div key={mov.id} className="relative">
                            {/* Dot indicator */}
                            <div className={cn(
                              "absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 bg-white flex items-center justify-center shadow-sm",
                              isEntrada ? "border-emerald-500 text-emerald-500" : "border-rose-500 text-rose-500"
                            )}>
                              {isEntrada ? <ArrowUpRight size={8} /> : <ArrowDownRight size={8} />}
                            </div>

                            {/* Details card */}
                            <div className="bg-white border border-zinc-150 p-4 rounded-xl shadow-sm space-y-2">
                              <div className="flex items-center justify-between">
                                <span className={cn(
                                  "px-2 py-0.5 text-[9px] font-bold uppercase rounded",
                                  isEntrada ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200"
                                )}>
                                  {isEntrada ? 'Entrada' : 'Saída'}
                                </span>
                                <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                                  <Calendar size={10} />
                                  {mov.date}
                                </span>
                              </div>

                              <div className="flex items-baseline justify-between pt-1">
                                <strong className="text-zinc-900 text-base font-extrabold">
                                  {isEntrada ? '+' : '-'}{mov.quantity.toLocaleString('pt-BR')} {selectedItem.unit}
                                </strong>
                                {mov.documentNumber && (
                                  <span className="text-xs font-mono font-bold text-zinc-500">
                                    Doc: #{mov.documentNumber}
                                  </span>
                                )}
                              </div>

                              {mov.details && (
                                <p className="text-xs text-zinc-500 font-medium pt-1 border-t border-zinc-100 mt-1">
                                  {mov.details}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex justify-end">
              <button 
                onClick={() => setSelectedItem(null)} 
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal inside EstoqueView */}
      {(selectedInvoice || invoiceLoading) && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 cursor-pointer" onClick={() => { setSelectedInvoice(null); }} />

          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 z-10 border border-zinc-200">
            {invoiceLoading ? (
              <div className="p-12 flex items-center justify-center text-zinc-400 font-semibold gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                Carregando detalhes da nota fiscal...
              </div>
            ) : selectedInvoice ? (
              <>
                <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-start shrink-0">
                  <div>
                    <span className="px-2 py-0.5 bg-zinc-900 text-white rounded text-[9px] font-bold uppercase tracking-wider">
                      Nota Fiscal de Compra
                    </span>
                    <h3 className="font-bold text-zinc-900 text-base mt-1">NF #{selectedInvoice.invoiceNumber}</h3>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {selectedInvoice.supplierName || 'Fornecedor não informado'} | {formatDate(selectedInvoice.invoiceDate)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="p-1.5 hover:bg-zinc-150 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-6 py-3 bg-zinc-50/20 border-b border-zinc-100 flex justify-between text-xs shrink-0">
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Cód. Fornecedor</span>
                    <p className="font-semibold text-zinc-800">{selectedInvoice.supplierId || '-'}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Valor Total</span>
                    <p className="font-bold text-zinc-900">{formatCurrency(selectedInvoice.totalValue)}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Itens Faturados nesta Nota</h4>
                  <div className="space-y-2">
                    {selectedInvoice.items.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="bg-zinc-50 border border-zinc-150 rounded-xl p-3 shadow-sm space-y-1 hover:border-zinc-350 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-zinc-800 text-xs truncate">{item.description || item.itemCode}</p>
                            <p className="text-[9px] font-mono text-zinc-400">Cód: {item.itemCode}</p>
                          </div>
                        </div>
                        <div className="flex justify-between items-baseline text-xs pt-1">
                          <span className="font-semibold text-zinc-750">{item.quantity.toLocaleString('pt-BR')} {item.unit || 'UN'}</span>
                          <span className="text-zinc-500 text-[10px]">P.U. {formatCurrency(item.unitPrice)}</span>
                          <span className="font-extrabold text-zinc-900">{formatCurrency(item.totalValue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex justify-end shrink-0">
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
