import { apiFetch } from '../../../geral/lib/http';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Database, Calendar, TrendingUp, Info, 
  FileText, Clock, RefreshCw, BarChart3, ChevronRight, X, ShoppingCart, Tag,
  ArrowUpDown, ArrowUp, ArrowDown, Printer, PlusCircle, CheckCircle2, AlertCircle, Package, Settings
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { api } from '../../../geral/lib/api';
import type { DemandResult } from '../../../geral/lib/types';
import { getAuthUser, isSupervisor } from '../../../geral/lib/auth';

interface ProductRow {
  codigo: string;
  descricao: string;
  linha_prefix: string;
  nome_linha: string;
  estoque: number;
  media_vendas: number;
  status: string;
  status_label: string;
  estoque_ideal_qtd?: number;
  faltas_ativas?: number;
  pedidos_compra_aberto?: number;
  sugestao_compra?: number;
  estoque_ideal_manual?: number;
  pedidos_manual?: number;
  media_manual?: number;
  is_lancamento_manual?: number;
  visivel?: number;
  observacao?: string;
  linha_prefix_manual?: string;
  status_produto?: string;
  categoria_produto?: string;
  produzir_apenas_kit?: number;
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

interface PendingOrdersData {
  pending_sales_orders: {
    n_pedido: number;
    d_pedido: string;
    c_nome: string;
    c_status: string;
    n_qtde: number;
    n_qtde_fat: number;
    falta: number;
    d_previsao: string | null;
  }[];
  in_transit_purchase_orders: {
    n_pedido: number;
    c_nome_f: string | null;
    d_previsao: string | null;
    n_qtde: number;
    n_chegou: number;
    n_pendente: number;
  }[];
}

interface ProdutosCompraTabProps {
  statusFilter: 'coloracao' | 'apoio';
  title: string;
  active?: boolean;
  initialCategoryFilter?: string | null;
}

export function ProdutosCompraTab({ statusFilter, title, active = false, initialCategoryFilter = null }: ProdutosCompraTabProps) {
  const canConfig = isSupervisor(getAuthUser());
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [triggerDaysInput, setTriggerDaysInput] = useState<number>(30);
  const [targetDaysInput, setTargetDaysInput] = useState<number>(90);
  const [tempTriggerDays, setTempTriggerDays] = useState<string>('30');
  const [tempTargetDays, setTempTargetDays] = useState<string>('90');
  const [customConfigs, setCustomConfigs] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [itemConfig, setItemConfig] = useState<any | null>(null);
  const [globalAvgPeriod, setGlobalAvgPeriod] = useState<number>(12);
  const [demandsByCode, setDemandsByCode] = useState<Record<string, DemandResult>>({});

  const activeCategoryId = initialCategoryFilter || 
    (statusFilter === 'coloracao' ? 'cat_coloracao' : 'cat_apoio');

  const [selectedLine, setSelectedLine] = useState<string>('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('');

  // Selected product details & pending orders
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
  const [details, setDetails] = useState<ProductDetalhes | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  
  const [pendingOrders, setPendingOrders] = useState<PendingOrdersData | null>(null);
  const [pendingOrdersLoading, setPendingOrdersLoading] = useState(false);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [drawerTab, setDrawerTab] = useState<'visao_geral' | 'vendas_mensais' | 'pedidos_venda' | 'pedidos_compra' | 'configuracoes'>('visao_geral');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState('');

  // Local pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  // Sorting state
  const [sortKey, setSortKey] = useState<string>('sugestao_compra');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedForQuote, setSelectedForQuote] = useState<Set<string>>(new Set());

  // Print list & report options
  const [printList, setPrintList] = useState<string[]>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [reportType, setReportType] = useState<'disponibilidade' | 'sugestao'>(statusFilter === 'coloracao' ? 'disponibilidade' : 'sugestao');
  const [printFilterType, setPrintFilterType] = useState<'all' | 'selected' | 'disponiveis' | 'com_pedidos' | 'ruptura' | 'needed' | 'list'>('all');
  const [includeTransitInReport, setIncludeTransitInReport] = useState<boolean>(false);
  const [modalSearchTerm, setModalSearchTerm] = useState<string>('');
  const [lastErpStockSync, setLastErpStockSync] = useState<{ at: string; count: number } | null>(null);

  useEffect(() => {
    const loadPrintList = () => {
      const stored = localStorage.getItem('natum_hub_print_list');
      if (stored) {
        try { setPrintList(JSON.parse(stored)); } catch (e) { console.error(e); }
      } else {
        setPrintList([]);
      }
    };
    loadPrintList();
    window.addEventListener('storage', loadPrintList);
    return () => window.removeEventListener('storage', loadPrintList);
  }, []);

  const isInPrintList = (code: string) => {
    const cleanCode = code.replace(/\./g, '');
    return printList.some(c => c.replace(/\./g, '') === cleanCode);
  };

  const handleTogglePrintList = (code: string) => {
    const cleanCode = code.replace(/\./g, '');
    let newList: string[];
    if (printList.some(c => c.replace(/\./g, '') === cleanCode)) {
      newList = printList.filter(c => c.replace(/\./g, '') !== cleanCode);
    } else {
      newList = [...printList, code];
    }
    setPrintList(newList);
    localStorage.setItem('natum_hub_print_list', JSON.stringify(newList));
    window.dispatchEvent(new Event('storage'));
  };

  const handleAddSelectedToPrintList = () => {
    if (selectedForQuote.size === 0) return;
    const toAdd = Array.from(selectedForQuote);
    const existing = new Set(printList.map(c => (c || '').replace(/\./g, '')));
    const newItems = toAdd.filter(code => !existing.has((code || '').replace(/\./g, '')));
    const newList = [...printList, ...newItems];
    setPrintList(newList);
    localStorage.setItem('natum_hub_print_list', JSON.stringify(newList));
    window.dispatchEvent(new Event('storage'));
    setSelectedForQuote(new Set());
  };

  const loadCustomConfigs = async () => {
    try {
      const list = await api.getCustomPurchaseConfigs();
      setCustomConfigs(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveTriggerDays = async (val: number) => {
    if (!canConfig) return;
    setTriggerDaysInput(val);
    try {
      const existing = customConfigs.find(c => c.level === 'subcategoria' && c.targetId === activeCategoryId);
      await api.saveCustomPurchaseConfig({
        level: 'subcategoria',
        targetId: activeCategoryId,
        diasStart: val,
        diasTarget: targetDaysInput,
        useLeadTime: existing?.useLeadTime ?? 0,
        safetyDays: existing?.safetyDays ?? 0,
        objetivoTipo: existing?.objetivoTipo ?? 'padrao',
        objetivoValor: existing?.objetivoValor ?? 0,
        periodoMedia: existing?.periodoMedia ?? null
      });
      await loadCustomConfigs();
      await loadDemands();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveTargetDays = async (val: number) => {
    if (!canConfig) return;
    setTargetDaysInput(val);
    try {
      const existing = customConfigs.find(c => c.level === 'subcategoria' && c.targetId === activeCategoryId);
      await api.saveCustomPurchaseConfig({
        level: 'subcategoria',
        targetId: activeCategoryId,
        diasStart: triggerDaysInput,
        diasTarget: val,
        useLeadTime: existing?.useLeadTime ?? 0,
        safetyDays: existing?.safetyDays ?? 0,
        objetivoTipo: existing?.objetivoTipo ?? 'padrao',
        objetivoValor: existing?.objetivoValor ?? 0,
        periodoMedia: existing?.periodoMedia ?? null
      });
      await loadCustomConfigs();
      await loadDemands();
    } catch (e) {
      console.error(e);
    }
  };

  const loadItemConfig = async (code: string) => {
    try {
      const list = await api.getCustomPurchaseConfigs();
      const cfg = list.find(c => c.level === 'item' && c.targetId === code);
      if (cfg) {
        setItemConfig(cfg);
      } else {
        setItemConfig({
          level: 'item',
          targetId: code,
          diasStart: null,
          diasTarget: null,
          useLeadTime: 0,
          safetyDays: 0,
          objetivoTipo: 'padrao',
          objetivoValor: 0,
          periodoMedia: null
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveItemConfig = async (updated: any) => {
    if (!canConfig) return;
    setItemConfig(updated);
    try {
      await api.saveCustomPurchaseConfig(updated);
      await loadCustomConfigs();
      await loadDemands();
    } catch (e) {
      console.error(e);
    }
  };

  const loadDemands = async () => {
    try {
      const results = await api.getDemands(undefined, targetDaysInput);
      const map: Record<string, DemandResult> = {};
      for (const d of results) {
        map[d.itemCode] = d;
        map[d.itemCode.replace(/\./g, '')] = d;
      }
      setDemandsByCode(map);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (active) {
      loadProducts();
      loadDemands();
      setSelectedItemCodeNull();
      loadCustomConfigs();
      api.getCategories().then(setCategories).catch(console.error);

      // Load global average period config
      const loadGlobalConfig = async () => {
        try {
          const cfgKey = statusFilter === 'coloracao' ? 'compras_coloracao' : statusFilter === 'apoio' ? 'compras_apoio' : 'compras_main';
          const cfg = await api.getComprasConfig(cfgKey);
          if (cfg?.averagePeriodMonths) {
            setGlobalAvgPeriod(cfg.averagePeriodMonths);
          }
        } catch (e) {
          console.error(e);
        }
      };
      loadGlobalConfig();
    }
  }, [statusFilter, active, targetDaysInput]);

  useEffect(() => {
    if (active) loadDemands();
  }, [customConfigs, active, targetDaysInput]);

  useEffect(() => {
    const cfg = customConfigs.find(c => c.level === 'subcategoria' && c.targetId === activeCategoryId);
    if (cfg) {
      setTriggerDaysInput(cfg.diasStart ?? cfg.diasTarget ?? 90);
      setTargetDaysInput(cfg.diasTarget ?? 90);
    } else {
      const cat = categories.find(c => c.id === activeCategoryId);
      const parentCfg = cat?.parentId ? customConfigs.find(c => c.level === 'subcategoria' && c.targetId === cat.parentId) : null;
      if (parentCfg) {
        setTriggerDaysInput(parentCfg.diasStart ?? parentCfg.diasTarget ?? 90);
        setTargetDaysInput(parentCfg.diasTarget ?? 90);
      } else {
        setTriggerDaysInput(90);
        setTargetDaysInput(90);
      }
    }
  }, [activeCategoryId, customConfigs, categories]);

  useEffect(() => {
    setTempTriggerDays(triggerDaysInput.toString());
  }, [triggerDaysInput]);

  useEffect(() => {
    setTempTargetDays(targetDaysInput.toString());
  }, [targetDaysInput]);

  const setSelectedItemCodeNull = () => {
    setSelectedProductCode(null);
    setDetails(null);
    setPendingOrders(null);
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const [res, history] = await Promise.all([
        apiFetch(`/products?limit=5000&status=${statusFilter}`),
        api.getImportHistory().catch(() => [] as Awaited<ReturnType<typeof api.getImportHistory>>),
      ]);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
      }
      const erp = history.find(
        (h) => h.source === 'ERP' || (h.filename || '').includes('SQL Server')
      );
      if (erp?.imported_at) {
        setLastErpStockSync({ at: erp.imported_at, count: erp.item_count ?? 0 });
      } else {
        setLastErpStockSync(null);
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
      const res = await apiFetch(`/produtos/${code}/detalhes`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data);
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

  const loadPendingOrders = async (code: string) => {
    setPendingOrdersLoading(true);
    setPendingOrders(null);
    try {
      const res = await apiFetch(`/produtos/${code}/pedidos-pendentes`);
      if (res.ok) {
        setPendingOrders(await res.json());
      }
    } catch (e) {
      console.error("Erro ao carregar pedidos pendentes do produto:", e);
    } finally {
      setPendingOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProductCode) {
      loadDetails(selectedProductCode);
      loadPendingOrders(selectedProductCode);
      loadItemConfig(selectedProductCode);
      setDrawerTab('visao_geral');
      setIsEditingNotes(false);
      setTempNotes('');
    } else {
      setDetails(null);
      setPendingOrders(null);
      setItemConfig(null);
    }
  }, [selectedProductCode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedLine, urgencyFilter]);

  // Extract lines dynamically for filters
  const availableLines = useMemo(() => {
    const linesMap = new Map<string, string>();
    products.forEach(p => {
      if (p.linha_prefix && p.nome_linha) {
        linesMap.set(p.linha_prefix, p.nome_linha);
      }
    });
    return Array.from(linesMap.entries()).map(([prefix, name]) => ({ prefix, name }));
  }, [products]);

  // Compute products metrics in real time based on targetDays
  const computedProducts = useMemo(() => {
    return products.map(p => {
      const stock = p.estoque || 0;
      const demandRow = demandsByCode[p.codigo] || demandsByCode[p.codigo.replace(/\./g, '')];
      const mediaVendas = demandRow?.overallAvg && demandRow.overallAvg > 0
        ? demandRow.overallAvg
        : (p.media_vendas || 0);
      const activeFaltas = p.faltas_ativas || 0;
      const transit = p.pedidos_compra_aberto || 0;

      // Resolve configuration based on precedence
      let activeCfg = null;
      let configLvl = "default";

      if (customConfigs && customConfigs.length > 0) {
        const itemCfg = customConfigs.find(c => c.level === 'item' && c.targetId === p.codigo);
        if (itemCfg) {
          activeCfg = itemCfg;
          configLvl = "item";
        } else if (p.categoria_produto) {
          const subcatCfg = customConfigs.find(c => c.level === 'subcategoria' && c.targetId === p.categoria_produto);
          if (subcatCfg) {
            activeCfg = subcatCfg;
            configLvl = "subcategoria";
          } else {
            const cat = categories.find(c => c.id === p.categoria_produto);
            const parentCfg = cat?.parentId ? customConfigs.find(c => c.level === 'subcategoria' && c.targetId === cat.parentId) : null;
            if (parentCfg) {
              activeCfg = parentCfg;
              configLvl = "subcategoria";
            }
          }
        }
      }

      // Calculate target days
      const targetDaysVal = activeCfg?.diasTarget !== null && activeCfg?.diasTarget !== undefined
        ? activeCfg.diasTarget
        : targetDaysInput;

      // Calculate trigger days
      let triggerDays = targetDaysVal;
      if (activeCfg) {
        if (activeCfg.useLeadTime === 1) {
          triggerDays = 15 + activeCfg.safetyDays; // fallback lead time is 15
        } else if (activeCfg.diasStart !== null && activeCfg.diasStart !== undefined) {
          triggerDays = activeCfg.diasStart;
        }
      } else {
        triggerDays = triggerDaysInput;
      }

      const targetStockBase = (targetDaysVal / 30) * mediaVendas;
      let targetStock = targetStockBase;

      if (activeCfg) {
        if (activeCfg.objetivoTipo === 'porcentagem') {
          targetStock = targetStockBase * (1.0 + activeCfg.objetivoValor / 100.0);
        } else if (activeCfg.objetivoTipo === 'desvio_padrao') {
          const stdDev = 0.3 * mediaVendas; // fallback volatility 30%
          targetStock = targetStockBase + stdDev;
        } else if (activeCfg.objetivoTipo === 'multiplicador') {
          const stdDev = 0.3 * mediaVendas;
          targetStock = targetStockBase + activeCfg.objetivoValor * stdDev;
        }
      }

      const rawIdeal = targetStock;
      const estoqueIdealQtd = p.estoque_ideal_manual !== undefined && p.estoque_ideal_manual !== null
        ? p.estoque_ideal_manual 
        : rawIdeal;

      const futureStock = stock + transit - activeFaltas;

      // Cobertura (Dias)
      const coverageDays = mediaVendas > 0 
        ? Math.max(0, Math.round((futureStock / mediaVendas) * 30))
        : 9999;

      // Sugestão: quantidade para atingir a meta quando cobertura < objetivo (disparo só afeta urgência)
      let suggestion = 0;
      if (mediaVendas > 0 && coverageDays < targetDaysVal) {
        suggestion = Math.max(0, Math.round(estoqueIdealQtd - futureStock));
      }

      const urgency = coverageDays < triggerDays
        ? 'critical'
        : coverageDays < targetDaysVal
          ? 'warning'
          : 'ok';

      return {
        ...p,
        media_vendas: mediaVendas,
        estoque_ideal_qtd_computed: estoqueIdealQtd,
        sugestao_compra_computed: suggestion,
        cobertura_dias_computed: coverageDays,
        urgency_computed: urgency,
        future_stock_computed: futureStock,
        trigger_days_computed: demandRow?.triggerDays ?? triggerDays,
        target_days_computed: demandRow?.targetDays ?? targetDaysVal,
      };
    });
  }, [products, triggerDaysInput, targetDaysInput, customConfigs, categories, demandsByCode]);

  const filteredProducts = useMemo(() => {
    let result = computedProducts;

    if (initialCategoryFilter) {
      result = result.filter(p => p.categoria_produto === initialCategoryFilter);
    } else {
      const parentCatId = statusFilter === 'coloracao' ? 'cat_coloracao' : 'cat_apoio';
      const childCategoryIds = new Set(
        categories
          .filter(c => c.parentId === parentCatId)
          .map(c => c.id)
      );
      if (childCategoryIds.size > 0) {
        result = result.filter(p => !p.categoria_produto || !childCategoryIds.has(p.categoria_produto));
      }
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(p => 
        (p.descricao || '').toLowerCase().includes(q) || 
        (p.codigo || '').toLowerCase().includes(q)
      );
    }

    if (selectedLine && selectedLine !== 'ALL') {
      result = result.filter(p => p.linha_prefix === selectedLine);
    }

    if (urgencyFilter) {
      result = result.filter(p => p.urgency_computed === urgencyFilter);
    }

    result = [...result].sort((a, b) => {
      let aVal = a[sortKey as keyof typeof a];
      let bVal = b[sortKey as keyof typeof b];

      // Map special keys to computed fields if needed
      if (sortKey === 'sugestao_compra') {
        aVal = a.sugestao_compra_computed;
        bVal = b.sugestao_compra_computed;
      } else if (sortKey === 'cobertura_dias') {
        aVal = a.cobertura_dias_computed;
        bVal = b.cobertura_dias_computed;
      } else if (sortKey === 'media_vendas') {
        aVal = a.media_vendas;
        bVal = b.media_vendas;
      } else if (sortKey === 'future_stock') {
        aVal = a.future_stock_computed;
        bVal = b.future_stock_computed;
      } else if (sortKey === 'estoque') {
        aVal = a.estoque;
        bVal = b.estoque;
      }

      if (aVal === undefined || aVal === null) aVal = typeof bVal === 'number' ? 0 : '';
      if (bVal === undefined || bVal === null) bVal = typeof aVal === 'number' ? 0 : '';

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const res = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return sortDir === 'asc' ? res : -res;
      }

      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [computedProducts, searchTerm, selectedLine, urgencyFilter, sortKey, sortDir, initialCategoryFilter, categories, statusFilter]);

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const selectedProduct = useMemo(() => {
    return computedProducts.find(p => p.codigo === selectedProductCode);
  }, [computedProducts, selectedProductCode]);

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
    
    const months = Array.from({ length: 12 }, (_, i) => {
      const mStr = String(i + 1).padStart(2, '0');
      return {
        monthKey: `${selectedYear}-${mStr}`,
        label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][i],
        qty: 0
      };
    });

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

  const handleSaveNotes = async (notesText: string) => {
    if (!selectedProduct) return;
    try {
      const res = await apiFetch(`/overrides`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          codigo: selectedProduct.codigo,
          estoque_ideal_manual: selectedProduct.estoque_ideal_manual ?? null,
          pedidos_manual: selectedProduct.pedidos_manual ?? null,
          media_manual: selectedProduct.media_manual ?? null,
          is_lancamento_manual: selectedProduct.is_lancamento_manual ?? null,
          visivel: selectedProduct.visivel ?? null,
          observacao: notesText.trim() || null,
          linha_prefix_manual: selectedProduct.linha_prefix_manual ?? null,
          status_produto: selectedProduct.status_produto ?? null,
          categoria_produto: selectedProduct.categoria_produto ?? null
        })
      });
      if (res.ok) {
        setIsEditingNotes(false);
        await loadProducts();
        await loadDetails(selectedProduct.codigo);
      } else {
        alert("Erro ao salvar observações");
      }
    } catch (e) {
      console.error("Erro ao salvar observações:", e);
      alert("Erro ao conectar com o servidor");
    }
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-zinc-300" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-zinc-700" /> : <ArrowDown className="h-3 w-3 text-zinc-700" />;
  };

  const handlePrint = () => {
    setShowPrintModal(false);

    let itemsToPrint = filteredProducts;
    if (reportType === 'disponibilidade') {
      if (printFilterType === 'selected') {
        itemsToPrint = filteredProducts.filter(p => selectedForQuote.has(p.codigo));
      } else if (printFilterType === 'disponiveis') {
        itemsToPrint = filteredProducts.filter(p => {
          const s = includeTransitInReport ? p.future_stock_computed : (p.estoque - (p.faltas_ativas || 0));
          return s > 0;
        });
      } else if (printFilterType === 'com_pedidos') {
        itemsToPrint = filteredProducts.filter(p => (p.faltas_ativas || 0) > 0);
      } else if (printFilterType === 'ruptura') {
        itemsToPrint = filteredProducts.filter(p => {
          const s = includeTransitInReport ? p.future_stock_computed : (p.estoque - (p.faltas_ativas || 0));
          return s <= 0;
        });
      } else if (printFilterType === 'list') {
        itemsToPrint = filteredProducts.filter(p => isInPrintList(p.codigo));
      }
    } else {
      if (printFilterType === 'selected') {
        itemsToPrint = filteredProducts.filter(p => selectedForQuote.has(p.codigo));
      } else if (printFilterType === 'needed') {
        itemsToPrint = filteredProducts.filter(p => p.sugestao_compra_computed > 0);
      } else if (printFilterType === 'list') {
        itemsToPrint = filteredProducts.filter(p => isInPrintList(p.codigo));
      }
    }

    if (itemsToPrint.length === 0) {
      alert("Não há itens para imprimir com os filtros selecionados.");
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      alert("Não foi possível iniciar a impressão.");
      document.body.removeChild(iframe);
      return;
    }

    const today = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const isColor = statusFilter === 'coloracao';
    const isDisponibilidade = reportType === 'disponibilidade';

    // Summary calculations
    const totalFaltas = itemsToPrint.reduce((acc, p) => acc + (p.faltas_ativas || 0), 0);
    const countDisponiveis = itemsToPrint.filter(p => {
      const s = includeTransitInReport ? p.future_stock_computed : (p.estoque - (p.faltas_ativas || 0));
      return s > 0;
    }).length;
    const countRuptura = itemsToPrint.filter(p => {
      const s = includeTransitInReport ? p.future_stock_computed : (p.estoque - (p.faltas_ativas || 0));
      return s <= 0;
    }).length;

    let filterLabel = 'Todos os Itens Filtrados';
    if (reportType === 'disponibilidade') {
      if (printFilterType === 'selected') filterLabel = `Colorações Selecionadas (${selectedForQuote.size})`;
      else if (printFilterType === 'disponiveis') filterLabel = 'Apenas Disponíveis (Saldo > 0)';
      else if (printFilterType === 'com_pedidos') filterLabel = 'Apenas com Pedidos de Venda / Faltas';
      else if (printFilterType === 'ruptura') filterLabel = 'Apenas em Ruptura / Falta (Saldo ≤ 0)';
      else if (printFilterType === 'list') filterLabel = `Itens Marcados (${printList.length})`;
    } else {
      if (printFilterType === 'selected') filterLabel = `Itens Selecionados (${selectedForQuote.size})`;
      else if (printFilterType === 'needed') filterLabel = 'Apenas Recomendados para Compra';
      else if (printFilterType === 'list') filterLabel = `Itens Marcados (${printList.length})`;
    }

    const rowsHtml = itemsToPrint.map(p => {
      if (isDisponibilidade) {
        const faltas = p.faltas_ativas || 0;
        const transito = p.pedidos_compra_aberto || 0;
        const saldo = includeTransitInReport
          ? p.future_stock_computed
          : (p.estoque - faltas);
        const isDisponivel = saldo > 0;
        const isEmFalta = saldo <= 0;
        const cobertoPorTransito = includeTransitInReport && p.estoque < faltas && (p.estoque + transito) >= faltas;

        let statusText = isDisponivel ? `Disponível (+${saldo.toLocaleString('pt-BR')} un)` : `Em Falta (${saldo.toLocaleString('pt-BR')} un)`;
        let statusBadgeBg = isDisponivel ? '#dcfce7' : '#fee2e2';
        let statusBadgeColor = isDisponivel ? '#166534' : '#991b1b';
        let statusBorder = isDisponivel ? '#bbf7d0' : '#fecaca';

        if (cobertoPorTransito) {
          statusText = `Coberto por Trânsito (+${transito.toLocaleString('pt-BR')} un)`;
          statusBadgeBg = '#e0f2fe';
          statusBadgeColor = '#075985';
          statusBorder = '#bae6fd';
        }

        return `
          <tr style="background-color: ${isEmFalta ? '#fff1f2' : 'transparent'};">
            <td style="font-family: monospace; font-size: 10px; font-weight: bold; color: #475569;">${p.codigo}</td>
            <td style="text-align: left; font-weight: 600; font-size: 10.5px; color: #0f172a;">${p.descricao}</td>
            <td style="text-align: right; font-weight: 600; color: #1e293b;">${p.estoque.toLocaleString('pt-BR')} un</td>
            <td style="text-align: right; color: ${faltas > 0 ? '#b91c1c' : '#64748b'}; font-weight: ${faltas > 0 ? '700' : 'normal'};">
              ${faltas > 0 ? `${faltas.toLocaleString('pt-BR')} un` : '-'}
            </td>
            ${includeTransitInReport ? `
            <td style="text-align: right; color: ${transito > 0 ? '#0369a1' : '#64748b'}; font-weight: ${transito > 0 ? '700' : 'normal'};">
              ${transito > 0 ? `+${transito.toLocaleString('pt-BR')} un` : '-'}
            </td>
            ` : ''}
            <td style="text-align: right; font-weight: 800; font-size: 11px; color: ${isDisponivel ? '#15803d' : '#b91c1c'}; background-color: ${isDisponivel ? '#f0fdf4' : '#fef2f2'};">
              ${saldo.toLocaleString('pt-BR')} un
            </td>
            <td style="text-align: center;">
              <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8.5px; font-weight: 700; background-color: ${statusBadgeBg}; color: ${statusBadgeColor}; border: 1px solid ${statusBorder};">
                ${statusText}
              </span>
            </td>
          </tr>
        `;
      } else {
        return `
          <tr>
            <td style="font-family: monospace; font-size: 10px;">${p.codigo}</td>
            <td style="text-align: left; font-weight: 500; font-size: 10px;">${p.descricao}</td>
            ${isColor ? '' : `<td>${p.nome_linha || '-'}</td>`}
            <td style="text-align: right;">${p.estoque.toLocaleString('pt-BR')} un</td>
            <td style="text-align: right;">${(p.media_vendas || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} un</td>
            ${isColor ? '' : `
            <td style="text-align: center; font-size: 9px;">${(p as any).trigger_days_computed ?? '-'}d</td>
            <td style="text-align: center; font-size: 9px;">${(p as any).target_days_computed ?? '-'}d</td>
            `}
            <td style="text-align: right;">${(p.faltas_ativas || 0).toLocaleString('pt-BR')} un</td>
            <td style="text-align: right;">${(p.pedidos_compra_aberto || 0).toLocaleString('pt-BR')} un</td>
            <td style="text-align: right; font-weight: ${p.cobertura_dias_computed < 60 ? 'bold' : 'normal'};">
              ${p.cobertura_dias_computed === 9999 ? '∞' : `${p.cobertura_dias_computed} dias`}
            </td>
            <td style="text-align: right; font-weight: bold; background-color: ${p.sugestao_compra_computed > 0 ? '#f4f4f5' : 'transparent'};">
              ${p.sugestao_compra_computed > 0 ? `${p.sugestao_compra_computed.toLocaleString('pt-BR')} un` : '-'}
            </td>
          </tr>
        `;
      }
    }).join('');

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${isDisponibilidade ? 'Relatório de Disponibilidade de ' + title + (includeTransitInReport ? ' (Estoque + Trânsito - Pedidos)' : ' (Estoque Físico Atual - Pedidos)') : 'Relatório de Sugestão de Compras — ' + title}</title>
        <meta charset="utf-8">
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 10mm 15mm 10mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #1f2937;
            background-color: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 10px;
            line-height: 1.4;
          }
          header {
            margin-bottom: 14px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
          }
          .header-title {
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .header-meta {
            display: flex;
            justify-content: space-between;
            color: #475569;
            font-size: 9px;
            margin-bottom: 8px;
          }
          .meta-group {
            display: flex;
            gap: 15px;
          }
          .summary-cards {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 14px;
          }
          .summary-card {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px 10px;
          }
          .summary-card-label {
            font-size: 8px;
            text-transform: uppercase;
            font-weight: 700;
            color: #64748b;
          }
          .summary-card-value {
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          th {
            background-color: #f1f5f9;
            border-bottom: 2px solid #cbd5e1;
            color: #1e293b;
            font-weight: 700;
            padding: 5px 4px;
            text-align: center;
            font-size: 8.5px;
            text-transform: uppercase;
          }
          td {
            border-bottom: 1px solid #e2e8f0;
            padding: 5px 4px;
            text-align: center;
            vertical-align: middle;
          }
          .signatures {
            margin-top: 35px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .signature-box {
            width: 45%;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #94a3b8;
            margin-top: 25px;
            margin-bottom: 4px;
          }
          .signature-title {
            font-size: 8.5px;
            color: #64748b;
            font-weight: 600;
            text-transform: uppercase;
          }
          footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #94a3b8;
            border-top: 1px solid #f1f5f9;
            padding-top: 4px;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <header>
          <h1 class="header-title">${isDisponibilidade ? 'Relatório de Disponibilidade de ' + title : 'Relatório de Compras de ' + title}</h1>
          <div class="header-meta">
            <div>Gerado em: <strong>${today}</strong></div>
            <div class="meta-group">
              <div>Itens: <strong>${itemsToPrint.length}</strong></div>
              <div>Filtro: <strong>${filterLabel}</strong></div>
              ${isDisponibilidade ? `<div>Trânsito: <strong>${includeTransitInReport ? 'Considerado (+ Compras)' : 'Desconsiderado (Apenas Físico Atual)'}</strong></div>` : ''}
            </div>
          </div>
          ${isDisponibilidade ? `
          <div class="summary-cards">
            <div class="summary-card">
              <div class="summary-card-label">Total Listado</div>
              <div class="summary-card-value">${itemsToPrint.length} itens</div>
            </div>
            <div class="summary-card" style="border-left: 3px solid #16a34a;">
              <div class="summary-card-label" style="color: #16a34a;">Disponíveis (Saldo &gt; 0)</div>
              <div class="summary-card-value" style="color: #16a34a;">${countDisponiveis} itens <span style="font-size: 9px; font-weight: normal;">(${itemsToPrint.length > 0 ? Math.round((countDisponiveis / itemsToPrint.length) * 100) : 0}%)</span></div>
            </div>
            <div class="summary-card" style="border-left: 3px solid #dc2626;">
              <div class="summary-card-label" style="color: #dc2626;">Em Ruptura / Falta</div>
              <div class="summary-card-value" style="color: #dc2626;">${countRuptura} itens</div>
            </div>
            <div class="summary-card" style="border-left: 3px solid #2563eb;">
              <div class="summary-card-label" style="color: #2563eb;">Pedidos de Venda (Faltas)</div>
              <div class="summary-card-value" style="color: #2563eb;">${totalFaltas.toLocaleString('pt-BR')} un</div>
            </div>
          </div>
          ` : ''}
        </header>

        <table>
          <thead>
            ${isDisponibilidade ? `
            <tr>
              <th style="width: 75px; text-align: left;">Código</th>
              <th style="text-align: left;">Descrição / Tom</th>
              <th style="width: 75px; text-align: right;">Estoque Físico</th>
              <th style="width: 80px; text-align: right;">Pedidos Venda</th>
              ${includeTransitInReport ? '<th style="width: 75px; text-align: right;">Em Trânsito</th>' : ''}
              <th style="width: 95px; text-align: right; background-color: #e2e8f0; border-bottom: 2px solid #0f172a;">${includeTransitInReport ? 'Saldo Futuro' : 'Saldo Atual'}</th>
              <th style="width: 110px; text-align: center;">Situação</th>
            </tr>
            ` : `
            <tr>
              <th style="width: 80px;">Código</th>
              <th>Descrição</th>
              ${isColor ? '' : '<th>Linha</th>'}
              <th style="width: 70px; text-align: right;">Estoque Físico</th>
              <th style="width: 70px; text-align: right;">Média Vendas</th>
              ${isColor ? '' : `
              <th style="width: 50px; text-align: center;">Disparo</th>
              <th style="width: 50px; text-align: center;">Objetivo</th>
              `}
              <th style="width: 70px; text-align: right;">Faltas Vendas</th>
              <th style="width: 70px; text-align: right;">Em Trânsito</th>
              <th style="width: 70px; text-align: right;">Duração Est.</th>
              <th style="width: 85px; text-align: right; background-color: #f4f4f5; border-bottom: 2px solid #27272a;">Recomendado</th>
            </tr>
            `}
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="margin-top: 18px; padding: 8px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 8px; color: #475569; page-break-inside: avoid;">
          <strong style="color: #0f172a; display: block; margin-bottom: 3px; font-size: 8.5px; text-transform: uppercase;">Nota Explicativa (Metodologia de Cálculo):</strong>
          <ul style="margin: 0; padding-left: 12px; line-height: 1.4;">
            ${isDisponibilidade ? `
            <li style="margin-bottom: 2px;"><strong>Estoque Físico:</strong> Estoque real registrado no ERP Natum.</li>
            <li style="margin-bottom: 2px;"><strong>Pedidos Venda:</strong> Pedidos de venda em aberto catalogados e acompanhados na Produção (faltas de vendas).</li>
            ${includeTransitInReport ? '<li style="margin-bottom: 2px;"><strong>Em Trânsito:</strong> Pedidos de compra já emitidos e pendentes de entrega pelo fornecedor.</li>' : ''}
            <li><strong>${includeTransitInReport ? 'Saldo Futuro' : 'Saldo Atual'}:</strong> Calculado como <code style="font-family: monospace;">${includeTransitInReport ? 'Estoque Físico + Em Trânsito - Pedidos Venda' : 'Estoque Físico - Pedidos Venda'}</code>. Valores positivos indicam pronta entrega real / saldo livre.</li>
            ` : `
            <li style="margin-bottom: 2px;"><strong>Média Vendas:</strong> Média mensal com período configurado por item (saídas/faturamento nos últimos N meses).</li>
            ${isColor ? '' : '<li style="margin-bottom: 2px;"><strong>Disparo / Objetivo:</strong> Dias de cobertura por item (configuração personalizada).</li>'}
            <li style="margin-bottom: 2px;"><strong>Duração Estimada:</strong> Calculada como <code style="font-family: monospace;">(Estoque Físico + Em Trânsito - Faltas de Venda) / Consumo Diário</code>.</li>
            <li><strong>Recomendado:</strong> Sugestão de compras expressa por: <code style="font-family: monospace;">Estoque Ideal + Faltas de Venda - Estoque Físico - Em Trânsito</code>.</li>
            `}
          </ul>
        </div>

        <div class="signatures">
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title">Responsável pelo Suprimento / Compras</div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title">Diretoria / Aprovação</div>
          </div>
        </div>

        <footer>
          <div>NatumHub &bull; Sistema de Gestão Industrial</div>
          <div>Página 1 de 1</div>
        </footer>
      </body>
      </html>
    `;

    doc.open();
    doc.write(printHtml);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    }, 300);
  };

  return (
    <div className="flex flex-col gap-4 w-full min-h-0 h-[calc(100dvh-10.5rem)] md:h-[calc(100vh-6.25rem)]">
      {/* Filters & Actions Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col w-full flex-1">
        {lastErpStockSync && (
          <div className="px-4 py-1.5 border-b border-zinc-200 bg-zinc-50/80 text-[11px] text-zinc-600 flex items-center gap-2 shrink-0">
            <Database className="h-3.5 w-3.5 text-zinc-400" />
            <span>
              Estoque ERP — último sync:{' '}
              <strong className="text-zinc-800">
                {new Date(lastErpStockSync.at.replace(' ', 'T')).toLocaleString('pt-BR')}
              </strong>
            </span>
            <span className="text-zinc-400 hidden sm:inline">
              · Se divergir do ERP, rode Sync em Configurações.
            </span>
          </div>
        )}
        <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0 gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Search Input */}
            <div className="flex items-center gap-2 bg-white border border-zinc-350 rounded-md px-3 py-1.5 shadow-sm">
              <Search className="h-4 w-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder={`Buscar em ${title.toLowerCase()}...`} 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                className="text-xs bg-transparent border-none focus:outline-none w-48" 
              />
            </div>

            {/* Product Line Filter */}
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-zinc-500" />
              <select 
                value={selectedLine} 
                onChange={e => setSelectedLine(e.target.value)} 
                className="text-xs border border-zinc-300 rounded-md px-2.5 py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none shadow-sm"
              >
                <option value="ALL">Todas as Linhas</option>
                {availableLines.map(line => (
                  <option key={line.prefix} value={line.prefix}>{line.name}</option>
                ))}
              </select>
            </div>

            {/* Urgency Filter */}
            <select 
              value={urgencyFilter} 
              onChange={e => setUrgencyFilter(e.target.value)} 
              className="text-xs border border-zinc-300 rounded-md px-2.5 py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none shadow-sm"
            >
              <option value="">Todos os Status</option>
              <option value="critical">🔴 Crítico (&lt; disparo)</option>
              <option value="warning">🟡 Atenção (disparo–meta)</option>
              <option value="ok">🟢 OK (≥ meta)</option>
            </select>

            <div className="flex items-center gap-2 border-l border-zinc-300 pl-4">
              <span className="text-xs text-zinc-650 font-semibold">Disparo:</span>
              <input 
                type="number" 
                value={tempTriggerDays} 
                disabled={!canConfig}
                onChange={e => setTempTriggerDays(e.target.value)} 
                onBlur={() => handleSaveTriggerDays(Number(tempTriggerDays) || 0)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleSaveTriggerDays(Number(tempTriggerDays) || 0);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                title={canConfig ? undefined : 'Apenas supervisor pode alterar Disp./Obj.'}
                className="w-12 text-xs border border-zinc-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none shadow-sm text-center font-bold disabled:bg-zinc-100 disabled:text-zinc-500 disabled:cursor-not-allowed" 
              />
              <span className="text-[10px] text-zinc-400 font-bold uppercase">dias</span>
            </div>
            <div className="flex items-center gap-2 pl-2">
              <span className="text-xs text-zinc-650 font-semibold">Objetivo:</span>
              <input 
                type="number" 
                value={tempTargetDays} 
                disabled={!canConfig}
                onChange={e => setTempTargetDays(e.target.value)} 
                onBlur={() => handleSaveTargetDays(Number(tempTargetDays) || 0)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleSaveTargetDays(Number(tempTargetDays) || 0);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                title={canConfig ? undefined : 'Apenas supervisor pode alterar Disp./Obj.'}
                className="w-12 text-xs border border-zinc-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none shadow-sm text-center font-bold disabled:bg-zinc-100 disabled:text-zinc-500 disabled:cursor-not-allowed" 
              />
              <span className="text-[10px] text-zinc-400 font-bold uppercase">dias</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 font-semibold">{filteredProducts.length} itens</span>
            <button
              type="button"
              disabled={selectedForQuote.size === 0}
              onClick={async () => {
                if (selectedForQuote.size === 0) return;
                const title = prompt('Título para a nova cotação:');
                if (!title) return;
                try {
                  const selected = computedProducts.filter((p) => selectedForQuote.has(p.codigo));
                  await api.createQuotation(
                    title,
                    selected.map((p) => p.codigo),
                    selected.map((p) => p.sugestao_compra_computed || 0),
                  );
                  alert('Cotação criada com sucesso! Abra Compras > Cotações para continuar.');
                  setSelectedForQuote(new Set());
                } catch (e) {
                  console.error(e);
                  alert('Erro ao criar cotação: ' + (e instanceof Error ? e.message : String(e)));
                }
              }}
              className="text-xs bg-white border border-zinc-300 hover:bg-zinc-50 disabled:opacity-40 text-zinc-800 px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Cotar ({selectedForQuote.size})
            </button>
            {selectedForQuote.size > 0 && (
              <button
                onClick={handleAddSelectedToPrintList}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                title="Adicionar produtos selecionados à aba Lista"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Adicionar à Lista ({selectedForQuote.size})
              </button>
            )}
            <button 
              onClick={() => {
                if (statusFilter === 'coloracao') {
                  setReportType('disponibilidade');
                  if (selectedForQuote.size > 0) {
                    setPrintFilterType('selected');
                  } else {
                    setPrintFilterType('all');
                  }
                } else {
                  const neededCount = filteredProducts.filter(p => p.sugestao_compra_computed > 0).length;
                  setReportType('sugestao');
                  if (selectedForQuote.size > 0) {
                    setPrintFilterType('selected');
                  } else {
                    setPrintFilterType(neededCount > 0 ? 'needed' : 'all');
                  }
                }
                setModalSearchTerm('');
                setShowPrintModal(true);
              }} 
              className="text-xs bg-zinc-900 hover:bg-zinc-800 text-white px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer border border-zinc-950"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir Relatório
            </button>
            <button 
              onClick={loadProducts}
              className="p-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg text-zinc-600 hover:text-zinc-900 transition-colors shadow-sm"
              title="Atualizar dados"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Product Table List */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-zinc-550" />
              <span className="font-semibold text-xs">Carregando lista de produtos...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-2">
              <Package className="h-8 w-8 text-zinc-300" />
              <p className="text-sm">Nenhum produto encontrado nesta categoria.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs whitespace-nowrap table-fixed">
              <thead className="bg-zinc-100 sticky top-0 z-10 shadow-sm border-b border-zinc-250">
                <tr>
                  <th className="px-2 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-zinc-300"
                      checked={
                        paginatedProducts.length > 0 &&
                        paginatedProducts.every((p) => selectedForQuote.has(p.codigo))
                      }
                      onChange={() => {
                        const next = new Set(selectedForQuote);
                        const allOnPage = paginatedProducts.every((p) => next.has(p.codigo));
                        if (allOnPage) {
                          paginatedProducts.forEach((p) => next.delete(p.codigo));
                        } else {
                          paginatedProducts.forEach((p) => next.add(p.codigo));
                        }
                        setSelectedForQuote(next);
                      }}
                      title="Selecionar página para cotação"
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold text-zinc-700 cursor-pointer hover:text-zinc-900 w-2/5" onClick={() => toggleSort('descricao')}>
                    <span className="flex items-center gap-1">Ref / Item <SortIcon col="descricao" /></span>
                  </th>
                  <th className="px-4 py-3 font-semibold text-zinc-700 text-right cursor-pointer hover:text-zinc-900 w-1/8" onClick={() => toggleSort('estoque')}>
                    <span className="flex items-center justify-end gap-1">Estoque <SortIcon col="estoque" /></span>
                  </th>
                  <th className="px-4 py-3 font-semibold text-zinc-700 text-right cursor-pointer hover:text-zinc-900 w-1/8" onClick={() => toggleSort('media_vendas')}>
                    <span className="flex items-center justify-end gap-1">Média Mês <SortIcon col="media_vendas" /></span>
                  </th>
                  <th className="px-4 py-3 font-semibold text-zinc-700 text-right cursor-pointer hover:text-zinc-900 w-1/8" onClick={() => toggleSort('future_stock')}>
                    <span className="flex items-center justify-end gap-1">Prev. Futura <SortIcon col="future_stock" /></span>
                  </th>
                  <th className="px-4 py-3 font-semibold text-zinc-700 text-center cursor-pointer hover:text-zinc-900 w-1/8" onClick={() => toggleSort('cobertura_dias')}>
                    <span className="flex items-center justify-center gap-1">Cobertura <SortIcon col="cobertura_dias" /></span>
                  </th>
                  <th className="px-4 py-3 font-semibold text-zinc-900 text-right cursor-pointer hover:text-zinc-900 w-1/8" onClick={() => toggleSort('sugestao_compra')}>
                    <span className="flex items-center justify-end gap-1">Sugestão <SortIcon col="sugestao_compra" /></span>
                  </th>
                  <th className="px-2 py-3 font-semibold text-zinc-700 text-center w-12">Lista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {paginatedProducts.map(p => {
                  const hasSugestao = p.sugestao_compra_computed > 0;
                  const isSelected = selectedProductCode === p.codigo;
                  return (
                    <tr 
                      key={p.codigo} 
                      onClick={() => setSelectedProductCode(p.codigo)} 
                      className={cn(
                        "hover:bg-zinc-50/70 transition-colors cursor-pointer text-[13px] font-medium text-zinc-700",
                        isSelected && "bg-zinc-100/90",
                        hasSugestao && "bg-amber-50/40 hover:bg-amber-50/60"
                      )}
                    >
                      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-zinc-300"
                          checked={selectedForQuote.has(p.codigo)}
                          onChange={() => {
                            const next = new Set(selectedForQuote);
                            if (next.has(p.codigo)) next.delete(p.codigo);
                            else next.add(p.codigo);
                            setSelectedForQuote(next);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 truncate">
                        <div className="font-mono text-[10px] font-bold text-zinc-400">{p.codigo}</div>
                        <div className="font-bold text-zinc-900 truncate" title={p.descricao}>{p.descricao}</div>
                        {p.nome_linha && (
                          <span className="inline-block px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[9px] font-extrabold uppercase mt-0.5">
                            {p.nome_linha}
                          </span>
                        )}
                        {p.observacao && (
                          <div className="text-[10px] text-zinc-400 italic mt-0.5 truncate max-w-xs">Obs: {p.observacao}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold text-zinc-800">{p.estoque.toLocaleString('pt-BR')} un</div>
                        <div className="text-[10px] text-zinc-450 font-bold">
                          -{p.faltas_ativas || 0} F / +{p.pedidos_compra_aberto || 0} T
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-650">
                        {p.media_vendas ? Math.round(p.media_vendas).toLocaleString('pt-BR') : '0'} un
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-800 font-semibold">
                        {p.future_stock_computed.toLocaleString('pt-BR')} un
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold",
                          p.urgency_computed === 'critical' && "bg-red-100 text-red-800 border border-red-200",
                          p.urgency_computed === 'warning' && "bg-amber-100 text-amber-800 border border-amber-200",
                          p.urgency_computed === 'ok' && "bg-emerald-100 text-emerald-800 border border-emerald-250"
                        )}>
                          {p.cobertura_dias_computed === 9999 ? '∞' : `${p.cobertura_dias_computed} dias`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold">
                        {hasSugestao ? (
                          <span className="text-amber-800 bg-amber-100 border border-amber-250/50 px-2 py-1 rounded-lg text-sm shadow-sm animate-pulse">
                            {p.sugestao_compra_computed.toLocaleString('pt-BR')} un
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-medium">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleTogglePrintList(p.codigo)}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors cursor-pointer",
                            isInPrintList(p.codigo) 
                              ? "text-emerald-600 hover:bg-emerald-50" 
                              : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-650"
                          )}
                          title={isInPrintList(p.codigo) ? "Remover da Lista de Impressão" : "Adicionar à Lista de Impressão"}
                        >
                          {isInPrintList(p.codigo) ? (
                            <CheckCircle2 className="h-4.5 w-4.5" />
                          ) : (
                            <PlusCircle className="h-4.5 w-4.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Local Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex items-center justify-between shrink-0">
            <span className="text-xs text-zinc-500 font-semibold">
              Mostrando {Math.min(filteredProducts.length, (currentPage - 1) * itemsPerPage + 1)} a {Math.min(filteredProducts.length, currentPage * itemsPerPage)} de {filteredProducts.length} itens
            </span>
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1} 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                className="px-3 py-1.5 rounded-lg border border-zinc-255 text-xs font-bold bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Anterior
              </button>
              <span className="text-xs text-zinc-550 font-bold">Pág {currentPage} de {totalPages}</span>
              <button 
                disabled={currentPage === totalPages} 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                className="px-3 py-1.5 rounded-lg border border-zinc-255 text-xs font-bold bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over Product Details Drawer */}
      {selectedProductCode && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="absolute inset-0 cursor-pointer" onClick={setSelectedItemCodeNull} />
          
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-350 z-10 text-left">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/50 flex justify-between items-start shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-zinc-900 text-white rounded-full text-[9px] font-extrabold uppercase tracking-wider">
                    Detalhamento de Produto Acabado
                  </span>
                  {selectedProduct?.visivel === 0 && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-[9px] font-extrabold uppercase tracking-wider">
                      Suspenso
                    </span>
                  )}
                </div>
                <h3 className="font-extrabold text-zinc-900 text-lg mt-1.5 truncate">
                  {details?.description || 'Carregando...'}
                </h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">Código do Produto: {selectedProductCode}</p>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                {selectedProduct && (
                  <button
                    onClick={async () => {
                      const newVisivel = selectedProduct.visivel === 0 ? 1 : 0;
                      if (confirm(newVisivel === 0 
                        ? `Tem certeza que deseja suspender o produto "${selectedProduct.descricao}"? Ele será ocultado das demandas e sugestões de compra.`
                        : `Deseja reativar o produto "${selectedProduct.descricao}"?`
                      )) {
                        try {
                          const res = await apiFetch(`/overrides`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              codigo: selectedProduct.codigo,
                              estoque_ideal_manual: selectedProduct.estoque_ideal_manual ?? null,
                              pedidos_manual: selectedProduct.pedidos_manual ?? null,
                              media_manual: selectedProduct.media_manual ?? null,
                              is_lancamento_manual: selectedProduct.is_lancamento_manual ?? null,
                              visivel: newVisivel,
                              observacao: selectedProduct.observacao ?? null,
                              linha_prefix_manual: selectedProduct.linha_prefix_manual ?? null,
                              status_produto: selectedProduct.status_produto ?? null,
                              categoria_produto: selectedProduct.categoria_produto ?? null,
                              produzir_apenas_kit: selectedProduct.produzir_apenas_kit ?? null
                            })
                          });
                          if (res.ok) {
                            await loadProducts();
                            if (newVisivel === 0) {
                              setSelectedItemCodeNull();
                            } else {
                              await loadDetails(selectedProduct.codigo);
                            }
                          } else {
                            alert("Erro ao salvar alteração");
                          }
                        } catch (e) {
                          console.error(e);
                          alert("Erro de conexão com o servidor");
                        }
                      }
                    }}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer border",
                      selectedProduct.visivel === 0
                        ? "bg-emerald-50 text-emerald-700 border-emerald-250/30 hover:bg-emerald-100/70"
                        : "bg-rose-50 text-rose-700 border-rose-250/30 hover:bg-rose-100/70"
                    )}
                    title={selectedProduct.visivel === 0 ? "Reativar Produto" : "Suspender Produto das Demandas"}
                  >
                    {selectedProduct.visivel === 0 ? (
                      <>Reativar Produto</>
                    ) : (
                      <>Suspender Produto</>
                    )}
                  </button>
                )}
                <button 
                  onClick={setSelectedItemCodeNull} 
                  className="p-1.5 hover:bg-zinc-150 rounded-lg text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer border border-zinc-250/20"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Tab Navigation */}
            <div className="flex border-b border-zinc-200 bg-zinc-50 shrink-0">
              {([
                { id: 'visao_geral' as const, label: 'Visão Geral', icon: Info },
                { id: 'vendas_mensais' as const, label: 'Consumo/Vendas', icon: BarChart3 },
                { id: 'pedidos_venda' as const, label: 'Pedidos Pendentes', icon: Clock },
                { id: 'pedidos_compra' as const, label: 'Compras em Trânsito', icon: ShoppingCart },
                { id: 'configuracoes' as const, label: 'Configurações', icon: Settings },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDrawerTab(tab.id)}
                  className={cn(
                    "flex-1 py-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    drawerTab === tab.id 
                      ? "border-zinc-900 text-zinc-900 font-extrabold bg-white" 
                      : "border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/50"
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Detail Body */}
            {detailsLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 font-semibold gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-zinc-550" />
                Carregando dados detalhados...
              </div>
            ) : details ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* ===== TAB: Visão Geral ===== */}
                {drawerTab === 'visao_geral' && (
                  <div className="space-y-6">
                    {/* Math breakdown for compra suggestion */}
                    {selectedProduct && (
                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 space-y-4 shadow-sm text-left">
                        <div className="flex items-center gap-2 border-b border-zinc-200 pb-2">
                          <ShoppingCart className="h-4.5 w-4.5 text-amber-600 animate-pulse" />
                          <h4 className="font-extrabold text-sm text-zinc-900">Análise de Recomendação de Compra</h4>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                          <div className="bg-white border border-zinc-150 p-3 rounded-lg shadow-sm">
                            <span className="text-[9px] text-zinc-400 font-extrabold uppercase block tracking-wider">Estoque Ideal</span>
                            <p className="text-sm font-extrabold text-zinc-850 mt-1">
                              {Math.round(selectedProduct.estoque_ideal_qtd_computed).toLocaleString('pt-BR')} un
                            </p>
                          </div>
                          <div className="bg-white border border-zinc-150 p-3 rounded-lg shadow-sm">
                            <span className="text-[9px] text-zinc-400 font-extrabold uppercase block tracking-wider">Faltas Ativas</span>
                            <p className="text-sm font-extrabold text-rose-700 mt-1">
                              +{(selectedProduct.faltas_ativas || 0).toLocaleString('pt-BR')} un
                            </p>
                          </div>
                          <div className="bg-white border border-zinc-155 p-3 rounded-lg shadow-sm">
                            <span className="text-[9px] text-zinc-400 font-extrabold uppercase block tracking-wider">Estoque Físico</span>
                            <p className="text-sm font-extrabold text-zinc-850 mt-1">
                              -{(selectedProduct.estoque || 0).toLocaleString('pt-BR')} un
                            </p>
                          </div>
                          <div className="bg-white border border-zinc-155 p-3 rounded-lg shadow-sm">
                            <span className="text-[9px] text-zinc-400 font-extrabold uppercase block tracking-wider">Em Trânsito</span>
                            <p className="text-sm font-extrabold text-blue-700 mt-1">
                              -{(selectedProduct.pedidos_compra_aberto || 0).toLocaleString('pt-BR')} un
                            </p>
                          </div>
                        </div>

                        {/* Math Formula breakdown */}
                        <div className="bg-zinc-100/70 p-3 rounded-lg border border-zinc-200/50 space-y-2">
                          <span className="text-[9px] text-zinc-550 font-extrabold uppercase block">Fórmula de Sugestão</span>
                          <div className="text-xs font-mono text-zinc-700 bg-white p-2.5 rounded border border-zinc-200 overflow-x-auto shadow-inner">
                            Sugestão = Estoque Ideal ({Math.round(selectedProduct.estoque_ideal_qtd_computed)}) 
                            + Faltas ({(selectedProduct.faltas_ativas || 0)}) 
                            - Estoque ({(selectedProduct.estoque || 0)}) 
                            - Trânsito ({(selectedProduct.pedidos_compra_aberto || 0)})
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-zinc-650 font-bold">Resultado da Sugestão:</span>
                            <span className={cn(
                              "text-xs font-extrabold px-3 py-1 rounded-full shadow-sm border",
                              selectedProduct.sugestao_compra_computed > 0 
                                ? "bg-amber-100 text-amber-850 border-amber-200" 
                                : "bg-zinc-200 text-zinc-600 border-zinc-300"
                            )}>
                              {selectedProduct.sugestao_compra_computed > 0 
                                ? `${selectedProduct.sugestao_compra_computed.toLocaleString('pt-BR')} un` 
                                : "Sem necessidade de compra"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Stats summary */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl shadow-sm text-left">
                        <span className="text-[9px] text-zinc-400 font-extrabold uppercase block tracking-wider">Estoque Atual</span>
                        <p className="text-lg font-extrabold text-zinc-900 mt-1">
                          {details.currentStock.toLocaleString('pt-BR')} <span className="text-xs font-bold text-zinc-500">{details.unit || 'un'}</span>
                        </p>
                      </div>
                      <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl shadow-sm text-left">
                        <span className="text-[9px] text-zinc-400 font-extrabold uppercase block tracking-wider">Média Mensal (lista)</span>
                        <p className="text-lg font-extrabold text-zinc-900 mt-1">
                          {(selectedProduct?.media_vendas ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}{' '}
                          <span className="text-xs font-bold text-zinc-500">{details.unit || 'un'}/mês</span>
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1 font-medium">
                          Período: últimos {itemConfig?.periodoMedia ?? globalAvgPeriod ?? 12} meses (config. do item)
                        </p>
                      </div>
                    </div>

                    {/* Observations Panel */}
                    <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 text-left">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-extrabold text-zinc-700 flex items-center gap-1.5 uppercase tracking-wider">
                          <Info className="h-4 w-4 text-zinc-400 shrink-0" /> Observações do Produto (Suprimentos)
                        </h5>
                        {isEditingNotes ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveNotes(tempNotes)}
                              className="text-[10px] font-extrabold text-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => {
                                setTempNotes(selectedProduct?.observacao || '');
                                setIsEditingNotes(false);
                              }}
                              className="text-[10px] font-extrabold text-zinc-400 hover:text-zinc-650 transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setTempNotes(selectedProduct?.observacao || '');
                              setIsEditingNotes(true);
                            }}
                            className="text-[10px] font-extrabold text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                      {isEditingNotes ? (
                        <textarea
                          value={tempNotes}
                          onChange={(e) => setTempNotes(e.target.value)}
                          className="w-full text-xs border border-zinc-300 rounded-md p-2.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-medium"
                          rows={3}
                          placeholder="Digite observações de compra, lote mínimo, prazo de fornecedor..."
                        />
                      ) : (
                        <p className={cn("text-xs mt-0.5 whitespace-pre-wrap font-medium", selectedProduct?.observacao ? "text-zinc-750" : "text-zinc-400 italic")}>
                          {selectedProduct?.observacao || "Nenhuma observação registrada. Clique em Editar para adicionar notas integradas com o módulo de cadastro."}
                        </p>
                      )}
                    </div>

                    {/* Recent Invoices List */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-150 pb-2">
                        <FileText className="h-4.5 w-4.5 text-zinc-600" />
                        <h4 className="font-extrabold text-xs text-zinc-800 uppercase tracking-wider">Histórico de Recebimento de Notas</h4>
                      </div>
                      {!details.recentInvoices || details.recentInvoices.length === 0 ? (
                        <p className="text-xs text-zinc-450 italic py-2">Sem faturas de recebimento recentes no sistema.</p>
                      ) : (
                        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                          <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="bg-zinc-50 font-bold text-zinc-550 border-b border-zinc-200 sticky top-0">
                              <tr>
                                <th className="px-4 py-2.5">Nota Fiscal</th>
                                <th className="px-4 py-2.5">Data</th>
                                <th className="px-4 py-2.5">Fornecedor</th>
                                <th className="px-4 py-2.5 text-right">Qtd</th>
                                <th className="px-4 py-2.5 text-right">Preço</th>
                                <th className="px-4 py-2.5 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 text-[11px] font-medium text-zinc-650">
                              {details.recentInvoices.map((inv, idx) => (
                                <tr key={`${inv.invoiceNumber}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-2.5 font-bold text-zinc-700">#{inv.invoiceNumber}</td>
                                  <td className="px-4 py-2.5">{formatDate(inv.invoiceDate)}</td>
                                  <td className="px-4 py-2.5 truncate max-w-[140px]" title={inv.supplierName}>{inv.supplierName}</td>
                                  <td className="px-4 py-2.5 text-right font-bold text-zinc-700">{inv.quantity.toLocaleString('pt-BR')}</td>
                                  <td className="px-4 py-2.5 text-right">{formatCurrency(inv.unitPrice)}</td>
                                  <td className="px-4 py-2.5 text-right font-extrabold text-zinc-900">{formatCurrency(inv.totalValue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ===== TAB: Vendas Mensais ===== */}
                {drawerTab === 'vendas_mensais' && (
                  <div className="space-y-6">
                    {/* YoY sales */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-zinc-150 pb-2">
                        <TrendingUp className="h-4.5 w-4.5 text-zinc-600" />
                        <h4 className="font-extrabold text-xs text-zinc-800 uppercase tracking-wider">Histórico de Saídas e Vendas (Ano a Ano)</h4>
                      </div>
                      <p className="text-[10px] text-zinc-500 font-medium">
                        A coluna <strong>Média Mês</strong> da lista usa o período configurado ({itemConfig?.periodoMedia ?? globalAvgPeriod ?? 12} meses), não a média anual ÷ 12 abaixo.
                      </p>
                      {!details.salesYoy || details.salesYoy.length === 0 ? (
                        <p className="text-xs text-zinc-450 italic py-2">Sem histórico de faturamento registrado.</p>
                      ) : (
                        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 font-bold text-zinc-550 border-b border-zinc-200">
                              <tr>
                                <th className="px-4 py-3">Ano</th>
                                <th className="px-4 py-3 text-right">Volume Total (un)</th>
                                <th className="px-4 py-3 text-right">Média Mensal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 font-medium text-zinc-700">
                              {details.salesYoy.map(s => (
                                <tr key={s.year} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-2.5 font-bold">{s.year}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-zinc-900">{s.totalQty.toLocaleString('pt-BR')} un</td>
                                  <td className="px-4 py-2.5 text-right text-zinc-550">{s.monthlyAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} un/mês</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Monthly chart */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center border-b border-zinc-150 pb-2">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-4.5 w-4.5 text-zinc-600" />
                          <h4 className="font-extrabold text-xs text-zinc-800 uppercase tracking-wider">Faturamento de Vendas Mensais</h4>
                        </div>
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(Number(e.target.value))}
                          className="px-2.5 py-1 bg-white border border-zinc-355 rounded-lg text-xs font-bold shadow-sm"
                        >
                          {availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>

                      {!details.monthlySales || details.monthlySales.length === 0 ? (
                        <p className="text-xs text-zinc-450 italic py-2">Nenhum faturamento mensal registrado para {selectedYear}.</p>
                      ) : (
                        <div className="p-4 bg-zinc-50/50 border border-zinc-200 rounded-xl space-y-2">
                          <div className="grid grid-cols-12 gap-1.5 h-28 px-2">
                            {monthlyDataForYear.map((m) => (
                              <div key={m.monthKey} className="group relative flex flex-col justify-end h-full">
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-zinc-900 text-white text-[9px] font-bold py-1 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-md">
                                  {m.qty.toLocaleString('pt-BR')} un
                                </div>
                                <div 
                                  style={{ height: `${m.percent}%` }}
                                  className="w-full bg-zinc-800 rounded-t-sm group-hover:bg-zinc-900 transition-colors cursor-pointer"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-12 gap-1.5 px-2">
                            {monthlyDataForYear.map((m) => (
                              <div key={m.monthKey} className="text-center">
                                <span className="text-[8px] text-zinc-400 font-extrabold uppercase block truncate">
                                  {m.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ===== TAB: Pedidos de Venda Pendentes (Faltas) ===== */}
                {drawerTab === 'pedidos_venda' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-150 pb-2">
                      <h4 className="font-extrabold text-xs text-zinc-850 uppercase tracking-wider">Pedidos de Venda Pendentes (Faltas Ativas)</h4>
                      <span className="text-xs font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                        {pendingOrders?.pending_sales_orders.length || 0} pedidos
                      </span>
                    </div>

                    {pendingOrdersLoading ? (
                      <div className="flex items-center justify-center py-12 text-zinc-450 gap-2 text-xs">
                        <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />
                        Carregando pedidos pendentes...
                      </div>
                    ) : !pendingOrders || pendingOrders.pending_sales_orders.length === 0 ? (
                      <p className="text-xs text-zinc-450 italic py-6 text-center">Este produto não possui pedidos de venda pendentes/em falta.</p>
                    ) : (
                      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-zinc-50 font-bold text-zinc-550 border-b border-zinc-200">
                            <tr>
                              <th className="px-4 py-2.5">Pedido</th>
                              <th className="px-4 py-2.5">Data</th>
                              <th className="px-4 py-2.5">Cliente</th>
                              <th className="px-4 py-2.5 text-center">Status</th>
                              <th className="px-4 py-2.5 text-right">Qtd Pedida</th>
                              <th className="px-4 py-2.5 text-right">Qtd Fat</th>
                              <th className="px-4 py-2.5 text-right text-rose-700 bg-rose-50/50">Falta Real</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 font-medium text-zinc-650">
                            {pendingOrders.pending_sales_orders.map((so, idx) => (
                              <tr key={`${so.n_pedido}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-zinc-700">#{so.n_pedido}</td>
                                <td className="px-4 py-2.5">{formatDate(so.d_pedido)}</td>
                                <td className="px-4 py-2.5 max-w-[130px] truncate" title={so.c_nome}>{so.c_nome}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[9px] font-bold uppercase">
                                    {so.c_status}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right">{so.n_qtde.toLocaleString('pt-BR')}</td>
                                <td className="px-4 py-2.5 text-right">{so.n_qtde_fat.toLocaleString('pt-BR')}</td>
                                <td className="px-4 py-2.5 text-right font-extrabold text-rose-700 bg-rose-50/30">
                                  {so.falta.toLocaleString('pt-BR')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== TAB: Compras em Trânsito ===== */}
                {drawerTab === 'pedidos_compra' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-150 pb-2">
                      <h4 className="font-extrabold text-xs text-zinc-850 uppercase tracking-wider">Ordens de Compra em Aberto (Em Trânsito)</h4>
                      <span className="text-xs font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                        {pendingOrders?.in_transit_purchase_orders.length || 0} ordens
                      </span>
                    </div>

                    {pendingOrdersLoading ? (
                      <div className="flex items-center justify-center py-12 text-zinc-450 gap-2 text-xs">
                        <RefreshCw className="h-4 w-4 animate-spin text-zinc-500" />
                        Carregando ordens de compra em trânsito...
                      </div>
                    ) : !pendingOrders || pendingOrders.in_transit_purchase_orders.length === 0 ? (
                      <p className="text-xs text-zinc-450 italic py-6 text-center">Nenhuma compra em trânsito/pendente registrada para este produto.</p>
                    ) : (
                      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="bg-zinc-50 font-bold text-zinc-550 border-b border-zinc-200">
                            <tr>
                              <th className="px-4 py-2.5">Pedido Compra</th>
                              <th className="px-4 py-2.5">Fornecedor</th>
                              <th className="px-4 py-2.5 text-right">Qtd Pedida</th>
                              <th className="px-4 py-2.5 text-right">Qtd Entregue</th>
                              <th className="px-4 py-2.5 text-right text-blue-700 bg-blue-50/50">Saldo Pendente</th>
                              <th className="px-4 py-2.5">Previsão Entrega</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 font-medium text-zinc-650">
                            {pendingOrders.in_transit_purchase_orders.map((po, idx) => (
                              <tr key={`${po.n_pedido}-${idx}`} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-zinc-700">#{po.n_pedido}</td>
                                <td className="px-4 py-2.5 max-w-[150px] truncate" title={po.c_nome_f || undefined}>
                                  {po.c_nome_f || 'Não informado'}
                                </td>
                                <td className="px-4 py-2.5 text-right">{po.n_qtde.toLocaleString('pt-BR')}</td>
                                <td className="px-4 py-2.5 text-right">{po.n_chegou.toLocaleString('pt-BR')}</td>
                                <td className="px-4 py-2.5 text-right font-extrabold text-blue-700 bg-blue-50/30">
                                  {po.n_pendente.toLocaleString('pt-BR')}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-zinc-500">
                                  {formatDate(po.d_previsao)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== TAB: Configurações ===== */}
                {drawerTab === 'configuracoes' && (
                  <div className="space-y-6 text-left">
                    <div className="flex items-center gap-2 border-b border-zinc-200 pb-2">
                      <Settings className="h-4 w-4 text-zinc-650" />
                      <h4 className="font-extrabold text-sm text-zinc-900">Configurações Específicas do Item</h4>
                    </div>

                    {/* Suspensão Rápida */}
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-700 block">Suspensão de Compra</span>
                        <span className="text-[10px] text-zinc-500 block">Suspende sugestões de compra automáticas para este item</span>
                      </div>
                      <button
                        onClick={async () => {
                          const newVisivel = selectedProduct.visivel === 0 ? 1 : 0;
                          try {
                            const res = await apiFetch(`/overrides`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                codigo: selectedProduct.codigo,
                                estoque_ideal_manual: selectedProduct.estoque_ideal_manual ?? null,
                                pedidos_manual: selectedProduct.pedidos_manual ?? null,
                                media_manual: selectedProduct.media_manual ?? null,
                                is_lancamento_manual: selectedProduct.is_lancamento_manual ?? null,
                                visivel: newVisivel,
                                observacao: selectedProduct.observacao ?? null,
                                linha_prefix_manual: selectedProduct.linha_prefix_manual ?? null,
                                status_produto: selectedProduct.status_produto ?? null,
                                categoria_produto: selectedProduct.categoria_produto ?? null,
                                produzir_apenas_kit: selectedProduct.produzir_apenas_kit ?? null
                              })
                            });
                            if (res.ok) {
                              await loadProducts();
                              await loadDetails(selectedProduct.codigo);
                            }
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                          selectedProduct.visivel === 0
                            ? "bg-red-50 text-red-705 border-red-200 hover:bg-red-100" 
                            : "bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-150"
                        )}
                      >
                        {selectedProduct.visivel === 0 ? "Item Suspenso (Reativar)" : "Item Ativo (Suspender)"}
                      </button>
                    </div>

                    {/* Subcategoria */}
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2">
                      <div>
                        <span className="text-xs font-bold text-zinc-700 block">Subcategoria / Linha de Produto</span>
                        <span className="text-[10px] text-zinc-500 block">Altere a categoria associada a este produto acabado</span>
                      </div>
                      <select
                        value={selectedProduct.categoria_produto || ''}
                        disabled={!canConfig}
                        title={canConfig ? undefined : 'Apenas supervisor pode alterar categoria'}
                        onChange={async (e) => {
                          if (!canConfig) return;
                          const newCatId = e.target.value;
                          try {
                            const res = await apiFetch(`/overrides`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                codigo: selectedProduct.codigo,
                                estoque_ideal_manual: selectedProduct.estoque_ideal_manual ?? null,
                                pedidos_manual: selectedProduct.pedidos_manual ?? null,
                                media_manual: selectedProduct.media_manual ?? null,
                                is_lancamento_manual: selectedProduct.is_lancamento_manual ?? null,
                                visivel: selectedProduct.visivel ?? null,
                                observacao: selectedProduct.observacao ?? null,
                                linha_prefix_manual: selectedProduct.linha_prefix_manual ?? null,
                                status_produto: selectedProduct.status_produto ?? null,
                                categoria_produto: newCatId || null,
                                produzir_apenas_kit: selectedProduct.produzir_apenas_kit ?? null
                              })
                            });
                            if (res.ok) {
                              await loadProducts();
                              await loadDetails(selectedProduct.codigo);
                            }
                          } catch (ex) {
                            console.error(ex);
                          }
                        }}
                        className="text-xs border border-zinc-300 rounded-md px-2 py-1.5 bg-white w-full focus:ring-1 focus:ring-zinc-900 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-500 disabled:cursor-not-allowed"
                      >
                        <option value="">Sem Categoria</option>
                        {categories
                          .filter(c => c.parentId === (statusFilter === 'coloracao' ? 'cat_coloracao' : 'cat_apoio'))
                          .map(cat => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))
                        }
                      </select>
                    </div>

                    {/* Reordenação Customizada */}
                    {itemConfig && (
                      <div className={cn("bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-4", !canConfig && "opacity-70 pointer-events-none")}>
                        <h5 className="text-xs font-bold text-zinc-800">Regras de Reposição Personalizadas</h5>
                        {!canConfig && (
                          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
                            Apenas supervisor pode alterar Disp./Obj. e regras do item.
                          </p>
                        )}
                        
                        {/* Ponto de Disparo (Start Compra) */}
                        <div className="space-y-2">
                          <span className="text-xs font-semibold text-zinc-700 block">Gatilho / Ponto de Disparo:</span>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { value: 'default', label: 'Padrão (Geral)' },
                              { value: 'manual', label: 'Manual (Dias)' },
                              { value: 'lead_time', label: 'Lead Time Forn.' }
                            ].map(opt => {
                              const isSelected = opt.value === 'default' 
                                ? (itemConfig.diasStart === null && itemConfig.useLeadTime === 0)
                                : opt.value === 'lead_time'
                                  ? itemConfig.useLeadTime === 1
                                  : (itemConfig.diasStart !== null && itemConfig.useLeadTime === 0);
                              return (
                                <button
                                  key={opt.value}
                                  onClick={() => {
                                    const next = { ...itemConfig };
                                    if (opt.value === 'default') {
                                      next.diasStart = null;
                                      next.useLeadTime = 0;
                                    } else if (opt.value === 'lead_time') {
                                      next.useLeadTime = 1;
                                      next.diasStart = null;
                                    } else {
                                      next.diasStart = 30;
                                      next.useLeadTime = 0;
                                    }
                                    handleSaveItemConfig(next);
                                  }}
                                  className={cn(
                                    "py-1.5 px-2 rounded text-[10px] font-bold border transition-all cursor-pointer text-center",
                                    isSelected 
                                      ? "bg-zinc-900 border-zinc-900 text-white"
                                      : "bg-white border-zinc-200 text-zinc-650 hover:bg-zinc-50"
                                  )}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Conditional inputs */}
                          {itemConfig.diasStart !== null && itemConfig.useLeadTime === 0 && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-zinc-500">Dias de Cobertura:</span>
                              <input
                                type="number"
                                value={itemConfig.diasStart}
                                onChange={(e) => {
                                  handleSaveItemConfig({ ...itemConfig, diasStart: Number(e.target.value) });
                                }}
                                className="w-16 text-xs border border-zinc-300 rounded px-2 py-1 focus:ring-1 focus:ring-zinc-900"
                              />
                            </div>
                          )}

                          {itemConfig.useLeadTime === 1 && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-zinc-500">Segurança (dias):</span>
                              <input
                                type="number"
                                value={itemConfig.safetyDays}
                                onChange={(e) => {
                                  handleSaveItemConfig({ ...itemConfig, safetyDays: Number(e.target.value) });
                                }}
                                className="w-16 text-xs border border-zinc-300 rounded px-2 py-1 focus:ring-1 focus:ring-zinc-900"
                              />
                            </div>
                          )}
                        </div>

                        <hr className="border-zinc-200" />

                        {/* Objetivo Final (Meta) */}
                        <div className="space-y-2">
                          <span className="text-xs font-semibold text-zinc-700 block">Objetivo de Estoque (Meta Alvo):</span>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { value: 'padrao', label: 'Padrão (Geral)' },
                              { value: 'manual', label: 'Manual (Dias)' },
                              { value: 'porcentagem', label: 'Porcentagem (+%)' },
                              { value: 'multiplicador', label: 'Fator Sigma (+Z*StdDev)' }
                            ].map(opt => {
                              const isSelected = itemConfig.objetivoTipo === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  onClick={() => {
                                    const next = { ...itemConfig, objetivoTipo: opt.value };
                                    if (opt.value === 'padrao') {
                                      next.diasTarget = null;
                                      next.objetivoValor = 0;
                                    } else if (opt.value === 'manual') {
                                      next.diasTarget = 90;
                                    } else if (opt.value === 'porcentagem') {
                                      next.diasTarget = null;
                                      next.objetivoValor = 20; // +20% default
                                    } else if (opt.value === 'multiplicador') {
                                      next.diasTarget = null;
                                      next.objetivoValor = 1.65; // 1.65 sigma default
                                    }
                                    handleSaveItemConfig(next);
                                  }}
                                  className={cn(
                                    "py-1.5 px-2 rounded text-[10px] font-bold border transition-all cursor-pointer text-center",
                                    isSelected 
                                      ? "bg-zinc-900 border-zinc-900 text-white"
                                      : "bg-white border-zinc-200 text-zinc-650 hover:bg-zinc-50"
                                  )}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Conditional inputs */}
                          {itemConfig.objetivoTipo === 'manual' && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-zinc-500">Dias Alvo (Meta):</span>
                              <input
                                type="number"
                                value={itemConfig.diasTarget || 90}
                                onChange={(e) => {
                                  handleSaveItemConfig({ ...itemConfig, diasTarget: Number(e.target.value) });
                                }}
                                className="w-16 text-xs border border-zinc-300 rounded px-2 py-1 focus:ring-1 focus:ring-zinc-955"
                              />
                            </div>
                          )}

                          {itemConfig.objetivoTipo === 'porcentagem' && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-zinc-500">Fator de Aumento (%):</span>
                              <input
                                type="number"
                                value={itemConfig.objetivoValor}
                                onChange={(e) => {
                                  handleSaveItemConfig({ ...itemConfig, objetivoValor: Number(e.target.value) });
                                }}
                                className="w-16 text-xs border border-zinc-300 rounded px-2 py-1 focus:ring-1 focus:ring-zinc-955"
                              />
                            </div>
                          )}

                          {itemConfig.objetivoTipo === 'multiplicador' && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] text-zinc-500">Z * Desvio Padrão:</span>
                              <input
                                type="number"
                                step="0.05"
                                value={itemConfig.objetivoValor}
                                onChange={(e) => {
                                  handleSaveItemConfig({ ...itemConfig, objetivoValor: Number(e.target.value) });
                                }}
                                className="w-16 text-xs border border-zinc-300 rounded px-2 py-1 focus:ring-1 focus:ring-zinc-955"
                              />
                            </div>
                          )}
                        </div>

                        <hr className="border-zinc-200" />

                        {/* Tempo de Cálculo da Média */}
                        <div className="space-y-2">
                          <span className="text-xs font-semibold text-zinc-700 block">Tempo de Cálculo da Média:</span>
                          <select
                            value={itemConfig.periodoMedia !== undefined && itemConfig.periodoMedia !== null ? itemConfig.periodoMedia : ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : Number(e.target.value);
                              handleSaveItemConfig({ ...itemConfig, periodoMedia: val });
                            }}
                            className="text-xs border border-zinc-300 rounded-md px-2 py-1.5 bg-white w-full focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                          >
                            <option value="">Padrão Geral ({globalAvgPeriod} meses)</option>
                            <option value={3}>3 meses</option>
                            <option value={6}>6 meses</option>
                            <option value={12}>12 meses</option>
                            <option value={24}>24 meses</option>
                          </select>
                          <span className="text-[9px] text-zinc-400 block mt-0.5">
                            Substitui o período de cálculo de média geral para este produto individual.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-400">
                Selecione um produto para visualizar o detalhamento de compras.
              </div>
            )}

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50/50 flex justify-end shrink-0">
              <button 
                onClick={setSelectedItemCodeNull}
                className="px-5 py-2 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer transition-all border border-zinc-950"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Options Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setShowPrintModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-zinc-150 p-6 z-10 text-left animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 shrink-0">
              <div>
                <h3 className="font-extrabold text-zinc-900 text-sm flex items-center gap-2 uppercase tracking-wide">
                  <Printer className="h-4 w-4 text-zinc-700" /> Relatório de {title}
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">Defina os parâmetros de disponibilidade e selecione os itens</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1 rounded-md transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
              {/* Type Selector Tabs */}
              <div>
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">Tipo de Relatório:</span>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-xl border border-zinc-200">
                  <button
                    type="button"
                    onClick={() => {
                      setReportType('disponibilidade');
                    }}
                    className={cn(
                      "py-2 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer",
                      reportType === 'disponibilidade'
                        ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                        : "text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    Disponibilidade
                    <span className="block text-[9px] font-normal text-zinc-400 mt-0.5">Estoque + Pedidos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReportType('sugestao');
                    }}
                    className={cn(
                      "py-2 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer",
                      reportType === 'sugestao'
                        ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                        : "text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    Sugestão de Compra
                    <span className="block text-[9px] font-normal text-zinc-400 mt-0.5">Metas de Reposição</span>
                  </button>
                </div>
              </div>

              {/* Transit Toggle (Only for Disponibilidade) */}
              {reportType === 'disponibilidade' && (
                <div 
                  className={cn(
                    "p-3 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer",
                    includeTransitInReport ? "bg-sky-50/70 border-sky-200" : "bg-amber-50/60 border-amber-200"
                  )} 
                  onClick={() => setIncludeTransitInReport(!includeTransitInReport)}
                >
                  <input
                    type="checkbox"
                    checked={includeTransitInReport}
                    onChange={(e) => {
                      e.stopPropagation();
                      setIncludeTransitInReport(e.target.checked);
                    }}
                    className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-4 w-4 cursor-pointer shrink-0"
                  />
                  <div className="flex-1 text-xs">
                    <strong className={cn("block font-bold", includeTransitInReport ? "text-sky-950" : "text-amber-950")}>
                      {includeTransitInReport ? "Considerar Pedidos de Compra em Trânsito" : "Desconsiderar Trânsito (Apenas Estoque Físico Atual)"}
                    </strong>
                    <span className={cn("text-[10px] leading-tight block mt-0.5", includeTransitInReport ? "text-sky-800" : "text-amber-800")}>
                      {includeTransitInReport 
                        ? "Previsão Futura: Saldo = Estoque Físico + Pedidos de Compra − Pedidos de Venda." 
                        : "Estoque Atual Real: Saldo = Estoque Físico Atual − Pedidos de Venda (mostra exatamente o que você tem no estoque físico hoje)."}
                    </span>
                  </div>
                </div>
              )}

              {/* Filter Options */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Filtro de Escopo:</span>
                  {selectedForQuote.size > 0 && (
                    <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      {selectedForQuote.size} item(ns) marcado(s)
                    </span>
                  )}
                </div>

                {reportType === 'disponibilidade' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className={cn(
                      "flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all",
                      printFilterType === 'all' ? "bg-zinc-900 text-white border-zinc-900 shadow-sm" : "bg-zinc-50 border-zinc-200 hover:border-zinc-300 text-zinc-800"
                    )}>
                      <input 
                        type="radio" 
                        name="print_filter" 
                        checked={printFilterType === 'all'} 
                        onChange={() => setPrintFilterType('all')} 
                        className="hidden" 
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex justify-between items-center font-bold">
                          <span>Todas as Colorações</span>
                          <span className={cn("text-[10px] px-1.5 py-0.2 rounded", printFilterType === 'all' ? "bg-zinc-800 text-zinc-200" : "bg-zinc-200 text-zinc-700")}>
                            {filteredProducts.length}
                          </span>
                        </div>
                        <span className={cn("text-[9.5px] block truncate", printFilterType === 'all' ? "text-zinc-300" : "text-zinc-500")}>
                          Catálogo completo
                        </span>
                      </div>
                    </label>

                    <label className={cn(
                      "flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all",
                      printFilterType === 'selected' ? "bg-zinc-900 text-white border-zinc-900 shadow-sm" : "bg-zinc-50 border-zinc-200 hover:border-zinc-300 text-zinc-800"
                    )}>
                      <input 
                        type="radio" 
                        name="print_filter" 
                        checked={printFilterType === 'selected'} 
                        onChange={() => setPrintFilterType('selected')} 
                        className="hidden" 
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex justify-between items-center font-bold">
                          <span>Apenas Selecionadas</span>
                          <span className={cn("text-[10px] px-1.5 py-0.2 rounded font-extrabold", printFilterType === 'selected' ? "bg-zinc-800 text-zinc-200" : "bg-blue-100 text-blue-800")}>
                            {selectedForQuote.size}
                          </span>
                        </div>
                        <span className={cn("text-[9.5px] block truncate", printFilterType === 'selected' ? "text-zinc-300" : "text-zinc-500")}>
                          Marcadas individualmente
                        </span>
                      </div>
                    </label>

                    <label className={cn(
                      "flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all",
                      printFilterType === 'disponiveis' ? "bg-emerald-900 text-white border-emerald-900 shadow-sm" : "bg-emerald-50/50 border-emerald-200 hover:border-emerald-300 text-zinc-800"
                    )}>
                      <input 
                        type="radio" 
                        name="print_filter" 
                        checked={printFilterType === 'disponiveis'} 
                        onChange={() => setPrintFilterType('disponiveis')} 
                        className="hidden" 
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex justify-between items-center font-bold">
                          <span className={printFilterType === 'disponiveis' ? "text-white" : "text-emerald-900"}>Apenas Disponíveis</span>
                          <span className={cn("text-[10px] px-1.5 py-0.2 rounded font-extrabold", printFilterType === 'disponiveis' ? "bg-emerald-800 text-emerald-100" : "bg-emerald-100 text-emerald-800")}>
                            {filteredProducts.filter(p => {
                              const s = includeTransitInReport ? p.future_stock_computed : (p.estoque - (p.faltas_ativas || 0));
                              return s > 0;
                            }).length}
                          </span>
                        </div>
                        <span className={cn("text-[9.5px] block truncate", printFilterType === 'disponiveis' ? "text-emerald-200" : "text-emerald-700")}>
                          Saldo livre &gt; 0
                        </span>
                      </div>
                    </label>

                    <label className={cn(
                      "flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all",
                      printFilterType === 'com_pedidos' ? "bg-blue-900 text-white border-blue-900 shadow-sm" : "bg-blue-50/50 border-blue-200 hover:border-blue-300 text-zinc-800"
                    )}>
                      <input 
                        type="radio" 
                        name="print_filter" 
                        checked={printFilterType === 'com_pedidos'} 
                        onChange={() => setPrintFilterType('com_pedidos')} 
                        className="hidden" 
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex justify-between items-center font-bold">
                          <span className={printFilterType === 'com_pedidos' ? "text-white" : "text-blue-900"}>Com Pedidos Venda</span>
                          <span className={cn("text-[10px] px-1.5 py-0.2 rounded font-extrabold", printFilterType === 'com_pedidos' ? "bg-blue-800 text-blue-100" : "bg-blue-100 text-blue-800")}>
                            {filteredProducts.filter(p => (p.faltas_ativas || 0) > 0).length}
                          </span>
                        </div>
                        <span className={cn("text-[9.5px] block truncate", printFilterType === 'com_pedidos' ? "text-blue-200" : "text-blue-700")}>
                          Com faltas catalogadas
                        </span>
                      </div>
                    </label>

                    <label className={cn(
                      "flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all sm:col-span-2",
                      printFilterType === 'ruptura' ? "bg-red-900 text-white border-red-900 shadow-sm" : "bg-red-50/50 border-red-200 hover:border-red-300 text-zinc-800"
                    )}>
                      <input 
                        type="radio" 
                        name="print_filter" 
                        checked={printFilterType === 'ruptura'} 
                        onChange={() => setPrintFilterType('ruptura')} 
                        className="hidden" 
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex justify-between items-center font-bold">
                          <span className={printFilterType === 'ruptura' ? "text-white" : "text-red-900"}>Em Ruptura / Falta (Saldo &le; 0)</span>
                          <span className={cn("text-[10px] px-1.5 py-0.2 rounded font-extrabold", printFilterType === 'ruptura' ? "bg-red-800 text-red-100" : "bg-red-100 text-red-800")}>
                            {filteredProducts.filter(p => {
                              const s = includeTransitInReport ? p.future_stock_computed : (p.estoque - (p.faltas_ativas || 0));
                              return s <= 0;
                            }).length} itens
                          </span>
                        </div>
                        <span className={cn("text-[9.5px] block", printFilterType === 'ruptura' ? "text-red-200" : "text-red-700")}>
                          Colorações zeradas ou com estoque insuficiente para os pedidos
                        </span>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className={cn(
                      "flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all",
                      printFilterType === 'needed' ? "bg-zinc-900 text-white border-zinc-900 shadow-sm" : "bg-zinc-50 border-zinc-200 hover:border-zinc-300 text-zinc-800"
                    )}>
                      <input 
                        type="radio" 
                        name="print_filter" 
                        checked={printFilterType === 'needed'} 
                        onChange={() => setPrintFilterType('needed')} 
                        className="hidden" 
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex justify-between items-center font-bold">
                          <span>Sugestão &gt; 0</span>
                          <span className={cn("text-[10px] px-1.5 py-0.2 rounded", printFilterType === 'needed' ? "bg-zinc-800 text-zinc-200" : "bg-zinc-200 text-zinc-700")}>
                            {filteredProducts.filter(p => p.sugestao_compra_computed > 0).length}
                          </span>
                        </div>
                        <span className={cn("text-[9.5px] block truncate", printFilterType === 'needed' ? "text-zinc-300" : "text-zinc-500")}>
                          Recomendação ativa
                        </span>
                      </div>
                    </label>

                    <label className={cn(
                      "flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all",
                      printFilterType === 'selected' ? "bg-zinc-900 text-white border-zinc-900 shadow-sm" : "bg-zinc-50 border-zinc-200 hover:border-zinc-300 text-zinc-800"
                    )}>
                      <input 
                        type="radio" 
                        name="print_filter" 
                        checked={printFilterType === 'selected'} 
                        onChange={() => setPrintFilterType('selected')} 
                        className="hidden" 
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex justify-between items-center font-bold">
                          <span>Selecionadas</span>
                          <span className={cn("text-[10px] px-1.5 py-0.2 rounded font-extrabold", printFilterType === 'selected' ? "bg-zinc-800 text-zinc-200" : "bg-blue-100 text-blue-800")}>
                            {selectedForQuote.size}
                          </span>
                        </div>
                        <span className={cn("text-[9.5px] block truncate", printFilterType === 'selected' ? "text-zinc-300" : "text-zinc-500")}>
                          Itens marcados
                        </span>
                      </div>
                    </label>

                    <label className={cn(
                      "flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-all sm:col-span-2",
                      printFilterType === 'all' ? "bg-zinc-900 text-white border-zinc-900 shadow-sm" : "bg-zinc-50 border-zinc-200 hover:border-zinc-300 text-zinc-800"
                    )}>
                      <input 
                        type="radio" 
                        name="print_filter" 
                        checked={printFilterType === 'all'} 
                        onChange={() => setPrintFilterType('all')} 
                        className="hidden" 
                      />
                      <div className="flex-1 text-xs">
                        <div className="flex justify-between items-center font-bold">
                          <span>Todos os Itens Filtrados</span>
                          <span className={cn("text-[10px] px-1.5 py-0.2 rounded", printFilterType === 'all' ? "bg-zinc-800 text-zinc-200" : "bg-zinc-200 text-zinc-700")}>
                            {filteredProducts.length}
                          </span>
                        </div>
                        <span className={cn("text-[9.5px] block truncate", printFilterType === 'all' ? "text-zinc-300" : "text-zinc-500")}>
                          Lista completa com base nos filtros atuais
                        </span>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Interactive Item Selection Box */}
              <div className="border border-zinc-200 rounded-xl p-3 bg-zinc-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                    Marcar / Desmarcar Colorações Específicas:
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedForQuote);
                        filteredProducts
                          .filter(p => !modalSearchTerm || p.codigo.toLowerCase().includes(modalSearchTerm.toLowerCase()) || p.descricao.toLowerCase().includes(modalSearchTerm.toLowerCase()))
                          .forEach(p => next.add(p.codigo));
                        setSelectedForQuote(next);
                        setPrintFilterType('selected');
                      }}
                      className="text-[10px] text-zinc-700 font-bold hover:underline cursor-pointer"
                    >
                      Marcar Todas
                    </button>
                    <span className="text-zinc-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedForQuote(new Set());
                      }}
                      className="text-[10px] text-zinc-500 hover:text-zinc-800 cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    placeholder="Filtrar colorações por código ou tom..."
                    className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 divide-y divide-zinc-100 bg-white border border-zinc-200 rounded-lg p-1.5">
                  {filteredProducts
                    .filter(p => !modalSearchTerm || p.codigo.toLowerCase().includes(modalSearchTerm.toLowerCase()) || p.descricao.toLowerCase().includes(modalSearchTerm.toLowerCase()))
                    .map(p => {
                      const isChecked = selectedForQuote.has(p.codigo);
                      const saldo = includeTransitInReport ? p.future_stock_computed : (p.estoque - (p.faltas_ativas || 0));
                      return (
                        <label 
                          key={p.codigo}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-xs select-none",
                            isChecked ? "bg-zinc-100" : "hover:bg-zinc-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const next = new Set(selectedForQuote);
                              if (isChecked) next.delete(p.codigo);
                              else next.add(p.codigo);
                              setSelectedForQuote(next);
                              if (next.size > 0 && printFilterType !== 'selected') {
                                setPrintFilterType('selected');
                              }
                            }}
                            className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-3.5 w-3.5 cursor-pointer"
                          />
                          <span className="font-mono font-bold text-[10.5px] text-zinc-600 w-16">{p.codigo}</span>
                          <span className="flex-1 truncate font-medium text-zinc-800 text-[11px]">{p.descricao}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">Físico: {p.estoque}</span>
                          <span className={cn(
                            "text-[10px] font-bold font-mono px-1 rounded",
                            saldo > 0 ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
                          )}>
                            Saldo: {saldo}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 justify-end pt-3 border-t border-zinc-100 shrink-0">
              <button 
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 border border-zinc-250 hover:bg-zinc-50 text-zinc-700 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handlePrint}
                className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-lg shadow-md cursor-pointer border border-zinc-950 flex items-center gap-1.5 transition-all"
              >
                <Printer className="h-3.5 w-3.5" />
                Gerar e Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
