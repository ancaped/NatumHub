import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { 
  ArrowLeft, Search, Database, Layers, Boxes, Calendar, FileText, 
  RefreshCw, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, 
  Info, Shield, Package, ShoppingCart, User, HelpCircle, FileSpreadsheet, Lock,
  Truck, Receipt, Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { StockMovement, FormulationLine, DbDumpResult } from '../types';

const API_BASE = 'http://127.0.0.1:3001/api';

type EstoqueMode = 'insumos' | 'produtos' | 'materiais';

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
    title: 'Insumos & Matérias-Primas',
    subtitle: 'Matérias-primas químicas, essências e embalagens com movimentação física e pedidos pendentes.',
    icon: Layers,
    pageName: 'Módulo de Estoque > Insumos',
  },
  produtos: {
    title: 'Produtos Acabados',
    subtitle: 'Formulações, estoque atual, previsões de demanda, ordens recomendadas e histórico de lotes.',
    icon: Package,
    pageName: 'Módulo de Estoque > Produtos',
  },
  materiais: {
    title: 'Materiais & Consumíveis',
    subtitle: 'Materiais de escritório, laboratório, limpeza e itens auxiliares de consumo geral.',
    icon: Boxes,
    pageName: 'Módulo de Estoque > Materiais',
  },
};

export default function EstoqueView({ mode, onBackToHub }: EstoqueViewProps) {
  const config = MODE_CONFIGS[mode];
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
  const [drawerTab, setDrawerTab] = useState<'movimentacoes' | 'formulacao' | 'notas' | 'pedidos' | 'lotes'>('movimentacoes');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [formulation, setFormulation] = useState<FormulationLine[]>([]);
  const [extraInfo, setExtraInfo] = useState<ItemExtraInfo | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Load Main Data
  const loadData = async () => {
    setLoading(true);
    try {
      if (mode === 'produtos') {
        // Get calculated products with stocks via REST API
        const res = await fetch(`${API_BASE}/products?limit=5000`);
        if (res.ok) {
          const data = await res.json();
          setProducts(data.items || []);
        }
      } else {
        // Get raw items/demands via Tauri API (for stock snapshots of Insumos/Materiais)
        const demandsData = await api.getDemands();
        setDemands(demandsData as any);
      }
    } catch (e) {
      console.error("Erro ao carregar dados de estoque:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    (window as any).__current_page__ = config.pageName;
  }, [mode]);

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
    } catch (e) {
      console.error("Erro ao carregar detalhes do item:", e);
      setDrawerError("Erro ao carregar os dados de rastreabilidade.");
    } finally {
      setDrawerLoading(false);
    }
  };

  // Filter demands based on mode and search
  const filteredDemands = useMemo(() => {
    let list = demands;
    if (mode === 'insumos') {
      list = list.filter(d => d.categoryId === 'cat_mp' || d.categoryId === 'cat_emb');
    } else if (mode === 'materiais') {
      list = list.filter(d => d.categoryId === 'cat_mat');
    } else {
      return [];
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => 
        d.itemCode.toLowerCase().includes(q) || 
        d.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [demands, mode, search]);

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    if (mode !== 'produtos') return [];
    let list = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => 
        p.codigo.toLowerCase().includes(q) || 
        p.descricao.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, mode, search]);

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
    } else {
      tabs.push({ id: 'movimentacoes', label: 'Movimentações', icon: ArrowUpRight });
      tabs.push({ id: 'notas', label: 'Notas Fiscais', icon: Receipt });
      tabs.push({ id: 'pedidos', label: 'Pedidos Pendentes', icon: Truck });
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
              <ModeIcon className="h-5 w-5" />
            </div>
            <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase">
              {mode === 'insumos' ? 'Insumos' : mode === 'produtos' ? 'Produtos' : 'Materiais'}
            </h1>
          </div>
        </div>

        {/* Back Button */}
        <div className="p-3 border-b border-zinc-100">
          <button
            onClick={onBackToHub}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer border border-zinc-250/50"
          >
            <ArrowLeft className="h-4 w-4 text-zinc-400" />
            Voltar ao Estoque Hub
          </button>
        </div>

        {/* Module Description in sidebar */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-zinc-50 rounded-xl p-4 space-y-3 border border-zinc-100">
            <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">{config.title}</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">{config.subtitle}</p>
          </div>
          
          {/* Quick stats */}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Total Itens</span>
              <span className="text-sm font-extrabold text-zinc-900">
                {mode === 'produtos' ? filteredProducts.length : filteredDemands.length}
              </span>
            </div>
            {mode !== 'produtos' && (
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
            {mode === 'produtos' && (
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
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">{config.title}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{config.subtitle}</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">

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
                  {mode === 'produtos' ? `${filteredProducts.length} itens` : `${filteredDemands.length} itens`}
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
                  ) : mode === 'produtos' ? (
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
                            <th className="px-6 py-4 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {filteredProducts.map((p) => (
                            <tr key={p.codigo} className="hover:bg-zinc-50/50 transition-colors">
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
                                  p.status === 'abundante' && "bg-blue-50 text-blue-700 border border-blue-200"
                                )}>
                                  {p.status_label}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => handleOpenDrawer(p.codigo, p.descricao, 'UN', 'produto', p.estoque)}
                                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-900 hover:text-white rounded-lg text-xs font-bold text-zinc-700 transition-all cursor-pointer shadow-sm border border-zinc-200"
                                >
                                  Rastrear &amp; Fórmula
                                </button>
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
                            <th className="px-6 py-4 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {filteredDemands.map((d) => (
                            <tr key={d.itemCode} className="hover:bg-zinc-50/50 transition-colors">
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
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => handleOpenDrawer(
                                    d.itemCode,
                                    d.description,
                                    d.unit,
                                    mode === 'insumos' ? 'insumo' : 'material',
                                    d.currentStock
                                  )}
                                  className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-900 hover:text-white rounded-lg text-xs font-bold text-zinc-700 transition-all cursor-pointer shadow-sm border border-zinc-200"
                                >
                                  Ver Detalhes
                                </button>
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

        </main>
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
                /* Product Recipe Formulation Table */
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                    <Info className="h-3.5 w-3.5 text-zinc-400" />
                    Ingredientes necessários para fabricar um lote deste produto.
                  </div>
                  {formulation.length === 0 ? (
                    <div className="text-center py-12 text-zinc-400">Nenhuma fórmula registrada para este produto.</div>
                  ) : (
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
                          {formulation.map((line) => (
                            <tr key={line.ingredientCode} className="hover:bg-zinc-50/50 transition-colors">
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
                        <div key={inv.id} className="bg-white border border-zinc-150 p-4 rounded-xl shadow-sm space-y-2 hover:border-zinc-300 transition-colors">
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : drawerTab === 'pedidos' ? (
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
                      {extraInfo.pendingOrders.map((po) => {
                        const remaining = po.nQtde - po.nChegou;
                        const percent = po.nQtde > 0 ? (po.nChegou / po.nQtde) * 100 : 0;
                        return (
                          <div key={po.nPedido} className="bg-white border border-zinc-150 p-4 rounded-xl shadow-sm space-y-3 hover:border-zinc-300 transition-colors">
                            <div className="flex items-center justify-between">
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 text-[9px] font-bold uppercase rounded">
                                Pedido #{po.nPedido}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                                <Calendar size={10} />
                                {formatDate(po.dPedido)}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs">
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
    </div>
  );
}
