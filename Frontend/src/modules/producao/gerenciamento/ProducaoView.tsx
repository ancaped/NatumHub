import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  AlertTriangle, CheckCircle2, X, RefreshCw, Database, Check, Play,
  ArrowUpDown, ArrowUp, ArrowDown, LayoutDashboard, Table, Layers, History,
  Settings, ArrowLeft, ClipboardList, User, TrendingUp, BarChart3,
  Scale, Package, FileText, EyeOff, HelpCircle, Info, Search, ClipboardCheck, Calendar,
  CalendarClock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AppLayout from '../../geral/components/layout/AppLayout';
import { apiFetch } from '../../geral/lib/http';
import { salesOrderStatusLabel } from '../../geral/lib/salesOrderStatus';


// Import subcomponents
import { InventoryTab } from './components/InventoryTab';
import { ProgramadasTab } from './components/ProgramadasTab';
import { KitsTab } from './components/KitsTab';
import { BasesTab } from './components/BasesTab';
import ItemRegistry from '../../compras/planejamento/components/ItemRegistry';
import { HistoryTab } from './components/HistoryTab';
import { SettingsTab } from './components/SettingsTab';
import { LotesTab } from './components/LotesTab';
import { LotesCalendarTab } from './components/LotesCalendarTab';
import { AprovacaoTab } from './components/AprovacaoTab';
import { PlanejamentoSemanalTab } from './components/PlanejamentoSemanalTab';
import { LoteDetailsDrawer } from './components/LoteDetailsDrawer';
import KitCompositionDrawer from '../components/KitCompositionDrawer';

type ProducaoLockedView = 'bases' | 'lotes';

export default function ProducaoView({
  onBackToHub,
  lockedView = null,
}: {
  onBackToHub: () => void;
  lockedView?: ProducaoLockedView | null;
}) {
  // Navigation State
  const [currentView, setCurrentView] = useState(lockedView || 'inventory');

  useEffect(() => {
    const viewLabels = {
      inventory: 'Gerenciamento de Produção',
      kits: 'Gerenciamento de Kits',
      programadas: 'Produções Programadas',
      aprovacao: 'Planejamento Semanal de Ordens',
      calendar: 'Calendário',
      lotes: 'Lotes de Produção',
      erros: 'Erros de Estoque',
      bases: 'Gestão de Bases',
      history: 'Histórico',
      ignored_items: 'Produtos Suspensos',
      imports: 'Importações ERP',
      settings: 'Configurações'
    };
    window.__current_page__ = viewLabels[currentView] || currentView;
  }, [currentView]);

  const [productionApprovalList, setProductionApprovalList] = useState([]);

  useEffect(() => {
    const loadApprovalList = () => {
      const stored = localStorage.getItem('natum_hub_production_approval_list');
      if (stored) {
        try { setProductionApprovalList(JSON.parse(stored)); } catch (e) { console.error(e); }
      } else {
        setProductionApprovalList([]);
      }
    };
    loadApprovalList();
    window.addEventListener('storage', loadApprovalList);
    return () => window.removeEventListener('storage', loadApprovalList);
  }, []);

  const handleToggleApprovalList = (code) => {
    let newList;
    if (productionApprovalList.includes(code)) {
      newList = productionApprovalList.filter(c => c !== code);
    } else {
      newList = [...productionApprovalList, code];
    }
    setProductionApprovalList(newList);
    localStorage.setItem('natum_hub_production_approval_list', JSON.stringify(newList));
    window.dispatchEvent(new Event('storage'));
  };
  
  // Data State
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({ critico: 0, ordem: 0, saudavel: 0, abundante: 0, lancamentos: 0 });
  const [bases, setBases] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [ignoredStatuses, setIgnoredStatuses] = useState(['descontinuado', 'terceirizado']);
  
  // Filtering & Pagination State
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedBase, setSelectedBase] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  // Global Settings (Stored in LocalStorage)
  const [diasComerciais, setDiasComerciais] = useState(() => {
    const saved = localStorage.getItem('diasComerciais');
    return saved ? parseInt(saved, 10) : 30;
  });
  const [limitPerPage, setLimitPerPage] = useState(() => {
    const saved = localStorage.getItem('limitPerPage');
    return saved ? parseInt(saved, 10) : 30;
  });

  // Temp settings state for inputs
  const [tempDiasComerciais, setTempDiasComerciais] = useState(diasComerciais);
  const [tempLimitPerPage, setTempLimitPerPage] = useState(limitPerPage);

  // Loading & Action State
  const [loading, setLoading] = useState(false);
  const [uploadingFat, setUploadingFat] = useState(false);
  const [uploadingLev, setUploadingLev] = useState(false);
  const [syncingDb, setSyncingDb] = useState(false);
  const [toast, setToast] = useState(null);
  
  // Modal Overrides State
  const [editingProduct, setEditingProduct] = useState(null);
  const [overrideIdeal, setOverrideIdeal] = useState('');
  const [overridePedidos, setOverridePedidos] = useState('');
  const [overrideMedia, setOverrideMedia] = useState('');
  const [overrideLaunch, setOverrideLaunch] = useState('AUTO'); // 'AUTO', 'LAUNCH', 'REGULAR'
  const [overrideVisible, setOverrideVisible] = useState('VISIBLE'); // 'VISIBLE', 'HIDDEN'
  const [overrideLine, setOverrideLine] = useState('AUTO'); // 'AUTO' ou prefixo da linha
  const [overrideObs, setOverrideObs] = useState('');
  const [overrideApenasKit, setOverrideApenasKit] = useState(0);
  const [overrideIsProgramada, setOverrideIsProgramada] = useState(0);
  const [overrideProgramadaDisparo, setOverrideProgramadaDisparo] = useState('');
  const [overrideProgramadaObjetivo, setOverrideProgramadaObjetivo] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  // Programadas Module States
  const [programadasProducts, setProgramadasProducts] = useState([]);
  const [programadasPage, setProgramadasPage] = useState(1);
  const [programadasTotalPages, setProgramadasTotalPages] = useState(1);
  const [programadasTotalItems, setProgramadasTotalItems] = useState(0);
  const [programadasSearch, setProgramadasSearch] = useState('');
  const [programadasSelectedStatus, setProgramadasSelectedStatus] = useState('ALL');
  const [programadasActiveTab, setProgramadasActiveTab] = useState('ALL');
  const [programadasSortField, setProgramadasSortField] = useState('codigo');
  const [programadasSortDir, setProgramadasSortDir] = useState<'asc' | 'desc'>('asc');
  const [programadasLoading, setProgramadasLoading] = useState(false);

  // Bulk Edit States
  const [allProducts, setAllProducts] = useState([]);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkSelected, setBulkSelected] = useState([]);
  const [bulkAction, setBulkAction] = useState('hide');
  const [bulkValueStr, setBulkValueStr] = useState('');
  const [bulkFilterLine, setBulkFilterLine] = useState('ALL');
  const [bulkFilterStatus, setBulkFilterStatus] = useState('ALL');
  const [bulkFilterVisibility, setBulkFilterVisibility] = useState('ALL');
  const [bulkFilterLaunch, setBulkFilterLaunch] = useState('ALL');

  // Kits Module States
  const [kits, setKits] = useState([]);
  const [kitsStats, setKitsStats] = useState({ total: 0, montar: 0, critico: 0, aguardando: 0, ordem: 0, saudavel: 0, abundante: 0 });
  const [coloracoes, setColoracoes] = useState([]);
  const [kitsPage, setKitsPage] = useState(1);
  const [kitsTotalPages, setKitsTotalPages] = useState(1);
  const [kitsTotalItems, setKitsTotalItems] = useState(0);
  const [kitsSearch, setKitsSearch] = useState('');
  const [kitsSelectedStatus, setKitsSelectedStatus] = useState('ALL');
  const [kitsActiveTab, setKitsActiveTab] = useState('ALL');
  const [expandedKits, setExpandedKits] = useState([]);
  const [uploadingKits, setUploadingKits] = useState(false);

  // Production History States
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyActiveTab, setHistoryActiveTab] = useState('ALL');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  
  // Quick Launch Modal State
  const [launchingProduct, setLaunchingProduct] = useState(null);
  const [launchDate, setLaunchDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [launchQty, setLaunchQty] = useState(100);
  const [launchObs, setLaunchObs] = useState('');

  // Base control & Similar items states
  const [consumeBase, setConsumeBase] = useState(false);
  const [baseProduct, setBaseProduct] = useState(null);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [selectedSims, setSelectedSims] = useState({}); // code -> { checked: bool, qty: number }
  const [similarLoading, setSimilarLoading] = useState(false);

  // Lotes State
  const [lotes, setLotes] = useState([]);
  const [lotesLoading, setLotesLoading] = useState(false);
  const [selectedLoteStatus, setSelectedLoteStatus] = useState('ALL');
  const [loteViewMode, setLoteViewMode] = useState<'table' | 'calendar'>('table');

  // Product Details Drawer State
  const [selectedProductDetails, setSelectedProductDetails] = useState(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [detailsDrawerLoading, setDetailsDrawerLoading] = useState(false);
  const [detailsDrawerActiveTab, setDetailsDrawerActiveTab] = useState('geral');
  const [productPendingOrders, setProductPendingOrders] = useState(null);
  const [simulatedBatchQty, setSimulatedBatchQty] = useState<number>(100);

  // Suspended Products States
  const [suspendedProducts, setSuspendedProducts] = useState([]);
  const [suspendedLoading, setSuspendedLoading] = useState(false);
  const [suspendedSearch, setSuspendedSearch] = useState('');

  // Lote Details Drawer State
  const [loteDetailsDrawerOpen, setLoteDetailsDrawerOpen] = useState(false);
  const [loteDetailsNumber, setLoteDetailsNumber] = useState<string | null>(null);

  // Kit Composition Drawer State
  const [compositionDrawerOpen, setCompositionDrawerOpen] = useState(false);
  const [selectedKitForComposition, setSelectedKitForComposition] = useState<{ codigo: string; descricao?: string } | null>(null);

  const handleOpenKitComposition = (kitCode: string, kitDesc?: string) => {
    setSelectedKitForComposition({ codigo: kitCode, descricao: kitDesc });
    setCompositionDrawerOpen(true);
  };

  const handleToggleComponentApenasKit = async (compCode: string, currentValue: number) => {
    const newValue = currentValue === 1 ? 0 : 1;
    try {
      const res = await apiFetch(`/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: compCode,
          produzir_apenas_kit: newValue,
        }),
      });
      if (res.ok) {
        showToast(
          `Item ${compCode} alterado para: ${newValue === 1 ? 'Apenas Kit (Demanda via Kits)' : 'Vendido Avulso (Demanda Direta + Kits)'}`,
          'success'
        );
        fetchProducts();
        fetchKits();
      } else {
        showToast('Erro ao atualizar política do componente', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Falha de conexão', 'error');
    }
  };

  useEffect(() => {
    if (!launchingProduct) {
      setConsumeBase(false);
      setBaseProduct(null);
      setSimilarProducts([]);
      setSelectedSims({});
      return;
    }

    // 1. Find the base product in the current products list
    const productBase = launchingProduct.base || 
      products.find(p => p.codigo === launchingProduct.codigo)?.base || 
      allProducts.find(p => p.codigo === launchingProduct.codigo)?.base;

    if (productBase) {
      const baseNameUpper = productBase.trim().toUpperCase();
      const baseExpanded = baseNameUpper
        .replace("SH ", "SHAMPOO ")
        .replace("COND ", "CONDICIONADOR ")
        .replace("MASC ", "MASCARA ");
      
      // Find matching product in local products array
      const match = products.find(p => {
        const descUpper = p.descricao.trim().toUpperCase();
        return descUpper === baseNameUpper ||
               descUpper === baseExpanded ||
               descUpper.startsWith(baseNameUpper) ||
               descUpper.startsWith(baseExpanded);
      });
      setBaseProduct(match || null);
    } else {
      setBaseProduct(null);
    }

    // 2. Fetch similar products
    setSimilarLoading(true);
    apiFetch(`/produtos/semelhantes/${launchingProduct.codigo}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSimilarProducts(data);
          // Initialize selectedSims quantities
          const initialSims = {};
          data.forEach(item => {
            initialSims[item.product.codigo] = {
              checked: false,
              qty: item.product.producao_recomendada > 0 ? item.product.producao_recomendada : 100
            };
          });
          setSelectedSims(initialSims);
        }
      })
      .catch(err => console.error("Error fetching similar products:", err))
      .finally(() => setSimilarLoading(false));

  }, [launchingProduct, products, allProducts]);

  // New Line Creation States
  const [showAddLineForm, setShowAddLineForm] = useState(false);
  const [newLinePrefix, setNewLinePrefix] = useState('');
  const [newLineName, setNewLineName] = useState('');
  const [newLineIdeal, setNewLineIdeal] = useState('3.2');
  const [newLineOrdem, setNewLineOrdem] = useState('1.6');
  const [newLineProd, setNewLineProd] = useState('1.2');
  const [newLineZ, setNewLineZ] = useState('0.0');

  // Retrospective Packaging Consumption Recalculation States
  const [recalcProd, setRecalcProd] = useState('');
  const [recalcIng, setRecalcIng] = useState('');
  const [recalcIngredients, setRecalcIngredients] = useState([]);
  const [recalcPreview, setRecalcPreview] = useState(null);
  const [recalcLoading, setRecalcLoading] = useState(false);

  useEffect(() => {
    if (!recalcProd) {
      setRecalcIngredients([]);
      return;
    }
    // Fetch product formulation lines
    apiFetch(`/produtos/formulacao/${recalcProd}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRecalcIngredients(data);
        }
      })
      .catch(err => console.error("Error loading formulation for recalc:", err));
  }, [recalcProd]);

  const handlePreviewRecalc = async () => {
    if (!recalcProd || !recalcIng) return;
    setRecalcLoading(true);
    try {
      const res = await apiFetch(`/producao/recalcular/preview?product_code=${recalcProd}&ingredient_code=${recalcIng}`);
      if (res.ok) {
        const data = await res.json();
        setRecalcPreview(data);
      } else {
        showToast("Erro ao carregar pré-visualização de recálculo", "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleApplyRecalc = async () => {
    if (!recalcPreview) return;
    try {
      const res = await apiFetch(`/producao/recalcular/ajustar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_code: recalcPreview.ingredient_code,
          adjustment_qty: recalcPreview.total_consumption,
          reason: `Recálculo retrospectivo de embalagem baseado na produção de ${recalcPreview.total_produced} un de ${recalcPreview.product_code}`
        })
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || "Ajuste aplicado com sucesso!", "success");
        setRecalcPreview(null);
        setRecalcProd('');
        setRecalcIng('');
        fetchProducts(); // Refresh stocks list
      } else {
        showToast("Erro ao aplicar ajuste de estoque", "error");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // === SORTING STATE ===
  const [sortField, setSortField] = useState(null); // estoque view
  const [sortDir, setSortDir] = useState('asc');
  const [kitSortField, setKitSortField] = useState(null);
  const [kitSortDir, setKitSortDir] = useState('asc');
  const [historySortField, setHistorySortField] = useState(null);
  const [historySortDir, setHistorySortDir] = useState('asc');

  // === IMPORT STATUS / HISTORY / WATCH CONFIG ===
  const [importStatus, setImportStatus] = useState([]);
  const [importHistory, setImportHistory] = useState([]);
  const [watchConfig, setWatchConfig] = useState({ pasta: 'PlanilhasBase', threshold_levantamento_dias: 7, threshold_faturamento_dias: 30, ativo: true });

  // === KIT COMPOSICAO (for settings view) ===
  const [kitComposicao, setKitComposicao] = useState([]);
  const [kitCompNewKit, setKitCompNewKit] = useState('');
  const [kitCompNewComp, setKitCompNewComp] = useState('');
  const [kitCompSearch, setKitCompSearch] = useState('');
  const [uploadingKitsConfig, setUploadingKitsConfig] = useState(false);

  // Show Toast Helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // === SORTING HELPERS ===
  const toggleSort = (field, currentField, setField, currentDir, setDir) => {
    if (currentField === field) {
      if (currentDir === 'asc') setDir('desc');
      else { setField(null); setDir('asc'); }
    } else {
      setField(field);
      setDir('asc');
    }
  };

  const SortIcon = ({ field, activeField, activeDir }) => {
    if (activeField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.3, marginLeft: 4 }} />;
    if (activeDir === 'asc') return <ArrowUp size={12} style={{ opacity: 0.7, marginLeft: 4 }} />;
    return <ArrowDown size={12} style={{ opacity: 0.7, marginLeft: 4 }} />;
  };

  // === FETCH FUNCTIONS ===
  const fetchImportStatus = async () => {
    try {
      const res = await apiFetch(`/import/status`);
      if (res.ok) setImportStatus(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchImportHistory = async () => {
    try {
      const res = await apiFetch(`/import/history`);
      if (res.ok) setImportHistory(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchWatchConfig = async () => {
    try {
      const res = await apiFetch(`/import/watch-config`);
      if (res.ok) setWatchConfig(await res.json());
    } catch (e) { console.error(e); }
  };

  const saveWatchConfig = async (cfg) => {
    try {
      const res = await apiFetch(`/import/watch-config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (res.ok) { showToast('Configurações de monitoramento salvas!'); setWatchConfig(cfg); }
    } catch (e) { showToast('Erro ao salvar configurações', 'error'); }
  };

  const fetchKitComposicao = async () => {
    try {
      const res = await apiFetch(`/kits/composicao`);
      if (res.ok) setKitComposicao(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleAddKitComposicao = async () => {
    if (!kitCompNewKit.trim() || !kitCompNewComp.trim()) return;
    try {
      const res = await apiFetch(`/kits/composicao`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kit_codigo: kitCompNewKit.trim(), componente_codigo: kitCompNewComp.trim() })
      });
      if (res.ok) { showToast('Relação adicionada!'); fetchKitComposicao(); setKitCompNewKit(''); setKitCompNewComp(''); }
      else { const e = await res.json(); showToast(e.error || 'Erro', 'error'); }
    } catch (e) { showToast('Erro de conexão', 'error'); }
  };

  const handleDeleteKitComposicao = async (kit, comp) => {
    if (!window.confirm(`Remover componente ${comp} do kit ${kit}?`)) return;
    try {
      const res = await apiFetch(`/kits/composicao/${kit}/${comp}`, { method: 'DELETE' });
      if (res.ok) { showToast('Relação removida!'); fetchKitComposicao(); }
    } catch (e) { showToast('Erro', 'error'); }
  };

  const handleUploadKitsConfig = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingKitsConfig(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch(`/kits/composicao/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) { showToast(data.message || 'Kits importados!'); fetchKitComposicao(); fetchKits(); }
      else showToast(data.error || 'Erro ao importar', 'error');
    } catch (e) { showToast('Erro de conexão', 'error'); }
    setUploadingKitsConfig(false);
    e.target.value = '';
  };

  // Compute import alert for sidebar badge
  const importAlertCount = useMemo(() => {
    if (!importStatus.length) return 0;
    return importStatus.filter(s => {
      if (!s.importado_em) return true; // never imported
      if (s.tipo === 'levantamento' && (s.dias_sem_importar ?? 999) > watchConfig.threshold_levantamento_dias) return true;
      if (s.tipo === 'faturamento' && (s.dias_sem_importar ?? 999) > watchConfig.threshold_faturamento_dias) return true;
      return false;
    }).length;
  }, [importStatus, watchConfig]);

  // Fetch ignored product statuses for items
  const fetchIgnoredStatuses = async () => {
    try {
      const res = await apiFetch(`/settings/ignored_product_statuses`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.value) {
          try {
            setIgnoredStatuses(JSON.parse(data.value));
          } catch (e) {
            console.error("Error parsing ignored product statuses:", e);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching ignored statuses:", e);
    }
  };

  const handleSaveIgnoredStatuses = async (newStatuses) => {
    try {
      const res = await apiFetch(`/settings/ignored_product_statuses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(newStatuses) })
      });
      if (res.ok) {
        setIgnoredStatuses(newStatuses);
        showToast("Status ignorados atualizados com sucesso!", "success");
      } else {
        showToast("Erro ao salvar status ignorados", "error");
      }
    } catch (e) {
      console.error("Error saving ignored statuses:", e);
      showToast("Falha de conexão ao salvar status", "error");
    }
  };

  // Fetch configs from API
  const fetchConfigs = async () => {
    try {
      const res = await apiFetch(`/configs`);
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
      }
    } catch (e) {
      console.error("Error fetching configs:", e);
    }
  };

  // Fetch products from API
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (activeTab !== 'ALL') params.append('linha', activeTab);
      if (selectedStatus !== 'ALL') params.append('status', selectedStatus);
      if (selectedBase !== 'ALL') params.append('base', selectedBase);
      if (showHidden) params.append('show_hidden', 'true');
      params.append('page', page.toString());
      params.append('limit', limitPerPage.toString());
      if (sortField) {
        params.append('sort', sortField);
        params.append('order', sortDir);
      }

      const res = await apiFetch(`/products?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
        setTotalItems(data.total || 0);
        setTotalPages(data.total_pages || 1);
        if (data.stats) setStats(data.stats);
        if (data.bases) setBases(data.bases);
      } else {
        let detail = '';
        try {
          const err = await res.json();
          detail = err?.error ? `: ${err.error}` : '';
        } catch {
          /* ignore */
        }
        showToast(`Erro ao buscar produtos da API${detail}`, "error");
      }
    } catch (e) {
      console.error("Error fetching products:", e);
      showToast("Falha de conexão com a API", "error");
    } finally {
      setLoading(false);
    }
  }, [search, activeTab, selectedStatus, selectedBase, page, limitPerPage, showHidden, sortField, sortDir]);

  // Fetch kits from API
  const fetchKits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (kitsSearch.trim()) params.append('search', kitsSearch.trim());
      if (kitsActiveTab !== 'ALL') params.append('linha', kitsActiveTab);
      if (kitsSelectedStatus !== 'ALL') params.append('status', kitsSelectedStatus);
      if (showHidden) params.append('show_hidden', 'true');
      params.append('page', kitsPage.toString());
      params.append('limit', limitPerPage.toString());
      if (kitSortField) {
        params.append('sort', kitSortField);
        params.append('order', kitSortDir);
      }

      const res = await apiFetch(`/kits?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setKits(data.items || []);
        setKitsTotalItems(data.total || 0);
        setKitsTotalPages(data.total_pages || 1);
        if (data.stats) setKitsStats(data.stats);
      } else {
        showToast("Erro ao buscar kits da API", "error");
      }
    } catch (e) {
      console.error("Error fetching kits:", e);
      showToast("Falha de conexão ao carregar kits", "error");
    } finally {
      setLoading(false);
    }
  }, [kitsSearch, kitsActiveTab, kitsSelectedStatus, kitsPage, limitPerPage, showHidden, kitSortField, kitSortDir]);

  useEffect(() => {
    if (currentView === 'kits') {
      fetchKits();
    }
  }, [currentView, fetchKits]);

  // Fetch programadas from API
  const fetchProgramadas = useCallback(async () => {
    setProgramadasLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('programadas_only', 'true');
      if (programadasSearch.trim()) params.append('search', programadasSearch.trim());
      if (programadasActiveTab !== 'ALL') params.append('linha', programadasActiveTab);
      if (programadasSelectedStatus !== 'ALL') params.append('status', programadasSelectedStatus);
      params.append('page', programadasPage.toString());
      params.append('limit', limitPerPage.toString());
      if (programadasSortField) {
        params.append('sort', programadasSortField);
        params.append('order', programadasSortDir);
      }

      const res = await apiFetch(`/products?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProgramadasProducts(data.items || []);
        setProgramadasTotalItems(data.total || 0);
        setProgramadasTotalPages(data.total_pages || 1);
      } else {
        showToast("Erro ao buscar produções programadas da API", "error");
      }
    } catch (e) {
      console.error("Error fetching programadas:", e);
      showToast("Falha de conexão ao carregar produções programadas", "error");
    } finally {
      setProgramadasLoading(false);
    }
  }, [programadasSearch, programadasActiveTab, programadasSelectedStatus, programadasPage, limitPerPage, programadasSortField, programadasSortDir]);

  useEffect(() => {
    if (currentView === 'programadas') {
      fetchProgramadas();
    }
  }, [currentView, fetchProgramadas]);

  // Fetch production history from API
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (historySearch.trim()) params.append('search', historySearch.trim());
      if (historyActiveTab !== 'ALL') params.append('linha', historyActiveTab);
      if (historyDateFilter) params.append('data', historyDateFilter);
      if (historySortField) {
        params.append('sort', historySortField);
        params.append('order', historySortDir);
      }

      const res = await apiFetch(`/historico?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryRecords(data || []);
      } else {
        showToast("Erro ao buscar histórico de produção", "error");
      }
    } catch (e) {
      console.error("Error fetching history:", e);
      showToast("Falha de conexão com a API", "error");
    } finally {
      setLoading(false);
    }
  }, [historySearch, historyActiveTab, historyDateFilter, historySortField, historySortDir]);

  useEffect(() => {
    if (currentView === 'history') {
      fetchHistory();
    }
  }, [currentView, fetchHistory]);

  // Fetch industrial production lots (ERP) from API
  const fetchLotes = useCallback(async () => {
    setLotesLoading(true);
    try {
      const res = await apiFetch(`/producao/lotes`);
      if (res.ok) {
        const data = await res.json();
        setLotes(data || []);
      } else {
        showToast("Erro ao buscar lotes de produção (ERP)", "error");
      }
    } catch (e) {
      console.error("Error fetching lotes:", e);
      showToast("Falha de conexão com a API", "error");
    } finally {
      setLotesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentView === 'lotes' || currentView === 'calendar' || currentView === 'erros' || lockedView === 'lotes') {
      fetchLotes();
    }
  }, [currentView, lockedView, fetchLotes]);

  const fetchSuspendedProducts = useCallback(async () => {
    setSuspendedLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('suspended_only', 'true');
      if (suspendedSearch.trim()) {
        params.append('search', suspendedSearch.trim());
      }
      params.append('limit', '10000');
      
      const res = await apiFetch(`/products?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSuspendedProducts(data.items || []);
      } else {
        showToast("Erro ao buscar produtos suspensos", "error");
      }
    } catch (e) {
      console.error("Error fetching suspended products:", e);
    } finally {
      setSuspendedLoading(false);
    }
  }, [suspendedSearch]);

  const handleUnsuspendProduct = async (code) => {
    if (!window.confirm(`Deseja realmente reativar o produto ${code} e remover sua suspensão?`)) return;
    try {
      const res = await apiFetch(`/overrides`);
      if (res.ok) {
        const overrides = await res.json();
        const existing = overrides.find(o => o.codigo === code);
        
        const updated = {
          codigo: code,
          estoque_ideal_manual: existing ? existing.estoque_ideal_manual : null,
          pedidos_manual: existing ? existing.pedidos_manual : null,
          media_manual: existing ? existing.media_manual : null,
          is_lancamento_manual: existing ? existing.is_lancamento_manual : null,
          visivel: 1, 
          observacao: existing ? existing.observacao : null,
          linha_prefix_manual: existing ? existing.linha_prefix_manual : null,
          status_produto: 'ativo', 
          categoria_produto: existing ? existing.categoria_produto : null,
          produzir_apenas_kit: existing ? existing.produzir_apenas_kit : null,
          lancamento_meta_meses: existing ? existing.lancamento_meta_meses : null,
          lancamento_data_inicio: existing ? existing.lancamento_data_inicio : null,
        };

        const saveRes = await apiFetch(`/overrides`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });

        if (saveRes.ok) {
          showToast("Produto reativado com sucesso!", "success");
          fetchSuspendedProducts();
          fetchProducts();
        } else {
          showToast("Erro ao reativar o produto.", "error");
        }
      } else {
        showToast("Erro ao ler overrides do banco.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro de conexão.", "error");
    }
  };

  useEffect(() => {
    if (currentView === 'ignored_items') {
      fetchSuspendedProducts();
    }
  }, [currentView, fetchSuspendedProducts]);

  const fetchProductDetails = async (code) => {
    setDetailsDrawerActiveTab('geral');
    setDetailsDrawerLoading(true);
    setSelectedProductDetails(null);
    setProductPendingOrders(null);
    setDetailsDrawerOpen(true);
    try {
      const [detRes, pedRes] = await Promise.all([
        apiFetch(`/produtos/${code}/detalhes`),
        apiFetch(`/produtos/${code}/pedidos-pendentes`),
      ]);
      if (detRes.ok) {
        const data = await detRes.json();
        setSelectedProductDetails(data);
        const defaultQty = data.producao_recomendada > 0 ? data.producao_recomendada : 100;
        setSimulatedBatchQty(defaultQty);
      } else {
        showToast("Erro ao buscar detalhes do produto", "error");
      }
      if (pedRes.ok) {
        setProductPendingOrders(await pedRes.json());
      }
    } catch (e) {
      console.error("Error fetching product details:", e);
      showToast("Falha ao carregar detalhes", "error");
    } finally {
      setDetailsDrawerLoading(false);
    }
  };

  const fetchLoteDetails = (loteNumber: string) => {
    setLoteDetailsNumber(loteNumber);
    setLoteDetailsDrawerOpen(true);
  };

  const handleLaunchProduction = async (e) => {
    if (e) e.preventDefault();
    if (!launchingProduct) return;

    const qty = parseInt(launchQty, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast("Por favor, preencha uma quantidade válida maior que zero.", "error");
      return;
    }
    if (!launchDate) {
      showToast("Por favor, selecione uma data para a produção.", "error");
      return;
    }

    try {
      // Gather all selected similar products to produce in parallel
      const simLaunches = [];
      for (const [simCode, simInfo] of Object.entries(selectedSims)) {
        if (simInfo.checked) {
          const simProd = similarProducts.find(s => s.product.codigo === simCode);
          if (simProd) {
            simLaunches.push({
              data_producao: launchDate,
              codigo: simCode,
              quantidade: parseInt(simInfo.qty, 10),
              observacoes: `Lançado em conjunto com ${launchingProduct.codigo}. ${launchObs.trim() === '' ? '' : launchObs.trim()}`.trim(),
              snap_estoque: simProd.product.estoque ?? null,
              snap_producao: simProd.product.producao ?? null,
              snap_pedidos: simProd.product.pedidos_aberto ?? null,
              snap_efp: simProd.product.estoque_futuro_com_producao ?? null,
              snap_media_vendas: simProd.product.media_vendas ?? null,
              snap_duracao_meses: simProd.product.duracao_meses ?? null,
              snap_status: simProd.product.status ?? null,
              snap_status_label: simProd.product.status_label ?? null,
              snap_producao_recomendada: simProd.product.producao_recomendada ?? null,
              snap_estoque_ideal_qtd: simProd.product.estoque_ideal_qtd ?? null,
              snap_demanda_ajustada: simProd.product.demanda_ajustada ?? null,
              consume_base: false,
              base_code: null
            });
          }
        }
      }

      const res = await apiFetch(`/historico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_producao: launchDate,
          codigo: launchingProduct.codigo,
          quantidade: qty,
          observacoes: launchObs.trim() === '' ? null : launchObs,
          snap_estoque: launchingProduct.estoque ?? null,
          snap_producao: launchingProduct.producao ?? null,
          snap_pedidos: launchingProduct.pedidos_aberto ?? null,
          snap_efp: launchingProduct.estoque_futuro_com_producao ?? null,
          snap_media_vendas: launchingProduct.media_vendas ?? null,
          snap_duracao_meses: launchingProduct.duracao_meses ?? null,
          snap_status: launchingProduct.status ?? null,
          snap_status_label: launchingProduct.status_label ?? null,
          snap_producao_recomendada: launchingProduct.producao_recomendada ?? null,
          snap_estoque_ideal_qtd: launchingProduct.estoque_ideal_qtd ?? null,
          snap_demanda_ajustada: launchingProduct.demanda_ajustada ?? null,
          consume_base: consumeBase,
          base_code: consumeBase && baseProduct ? baseProduct.codigo : null
        })
      });

      if (res.ok) {
        // Launch similar products in parallel
        let launchedSimCount = 0;
        for (const simPayload of simLaunches) {
          try {
            const simRes = await apiFetch(`/historico`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(simPayload)
            });
            if (simRes.ok) launchedSimCount++;
          } catch (err) {
            console.error(`Error launching similar product ${simPayload.codigo}:`, err);
          }
        }

        const successMsg = launchedSimCount > 0 
          ? `Produção de ${qty} un. para ${launchingProduct.codigo} e ${launchedSimCount} itens semelhantes lançados com sucesso!`
          : `Produção de ${qty} un. lançada com sucesso para ${launchingProduct.codigo}!`;

        showToast(successMsg, "success");
        setLaunchingProduct(null);
        setLaunchObs('');
        setConsumeBase(false);
        setBaseProduct(null);
        setSimilarProducts([]);
        setSelectedSims({});
        fetchProducts();
        fetchKits();
        if (currentView === 'history') {
          fetchHistory();
        }
      } else {
        const err = await res.json();
        showToast(err.error || "Erro ao lançar lote de produção", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Falha de conexão com o servidor", "error");
    }
  };

  const handleDeleteHistory = async (id) => {
    if (!window.confirm("Tem certeza que deseja estornar este lote de produção? A quantidade correspondente será subtraída do estoque em processo.")) {
      return;
    }

    try {
      const res = await apiFetch(`/historico/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast("Lote de produção estornado com sucesso!", "success");
        fetchProducts();
        fetchKits();
        fetchHistory();
      } else {
        const err = await res.json();
        showToast(err.error || "Erro ao excluir lote de produção", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro de conexão ao excluir lote", "error");
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  const toggleKitExpanded = (code) => {
    setExpandedKits(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleSaveGlobalSettings = (e) => {
    if (e) e.preventDefault();
    const days = parseInt(tempDiasComerciais, 10) || 30;
    const limit = parseInt(tempLimitPerPage, 10) || 30;
    
    setDiasComerciais(days);
    setLimitPerPage(limit);
    localStorage.setItem('diasComerciais', days.toString());
    localStorage.setItem('limitPerPage', limit.toString());
    
    setPage(1);
    showToast("Configurações globais salvas com sucesso!", "success");
  };

  const handleConfigChange = async (prefix, field, value) => {
    const updatedConfigs = configs.map(c => {
      if (c.linha_prefix === prefix) {
        return { ...c, [field]: parseFloat(value) || 0 };
      }
      return c;
    });
    setConfigs(updatedConfigs);

    const targetConfig = updatedConfigs.find(c => c.linha_prefix === prefix);
    if (targetConfig) {
      try {
        await apiFetch(`/configs`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(targetConfig),
        });
        fetchProducts();
      } catch (e) {
        console.error("Error saving config:", e);
      }
    }
  };

  const handleConfigToggleVisivel = async (prefix, currentVisivel) => {
    const nextVis = currentVisivel === 0 ? 1 : 0;
    const targetConfig = configs.find(c => c.linha_prefix === prefix);
    if (!targetConfig) return;

    const updatedConfig = { ...targetConfig, visivel: nextVis };
    setConfigs(prev => prev.map(c => c.linha_prefix === prefix ? updatedConfig : c));

    try {
      const res = await apiFetch(`/configs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });
      if (res.ok) {
        showToast(`Linha "${targetConfig.nome_linha}" ${nextVis === 1 ? 'ativada' : 'desativada'} com sucesso!`, 'success');
        fetchProducts();
        fetchKits();
      } else {
        showToast("Erro ao atualizar status da linha", "error");
        fetchConfigs();
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao conectar com a API", "error");
      fetchConfigs();
    }
  };

  const handleConfigDelete = async (prefix) => {
    if (prefix === 'DEFAULT') {
      showToast("Não é possível excluir a linha padrão DEFAULT", "error");
      return;
    }
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente a linha de prefixo "${prefix}"?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/configs/${prefix}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast("Linha excluída com sucesso!", "success");
        fetchConfigs();
        fetchProducts();
        fetchKits();
      } else {
        const data = await res.json();
        showToast(data.error || "Erro ao excluir linha", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro de conexão ao excluir linha", "error");
    }
  };

  const handleConfigCreate = async (e) => {
    if (e) e.preventDefault();
    if (!newLinePrefix.trim() || !newLineName.trim()) {
      showToast("Por favor, preencha o prefixo e o nome da linha.", "error");
      return;
    }

    if (configs.some(c => c.linha_prefix === newLinePrefix.trim())) {
      showToast(`O prefixo "${newLinePrefix}" já está cadastrado.`, "error");
      return;
    }

    const newConfig = {
      linha_prefix: newLinePrefix.trim(),
      nome_linha: newLineName.trim(),
      estoque_ideal_mult: parseFloat(newLineIdeal) || 3.2,
      abrir_ordem_mult: parseFloat(newLineOrdem) || 1.6,
      abrir_prod_mult: parseFloat(newLineProd) || 1.2,
      fator_seguranca_z: parseFloat(newLineZ) || 0.0,
      visivel: 1,
    };

    try {
      const res = await apiFetch(`/configs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        showToast("Nova linha cadastrada com sucesso!", "success");
        setShowAddLineForm(false);
        setNewLinePrefix('');
        setNewLineName('');
        setNewLineIdeal('3.2');
        setNewLineOrdem('1.6');
        setNewLineProd('1.2');
        setNewLineZ('0.0');
        fetchConfigs();
        fetchProducts();
        fetchKits();
      } else {
        const data = await res.json();
        showToast(data.error || "Erro ao cadastrar linha", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro de conexão ao cadastrar linha", "error");
    }
  };

  const handleSyncDatabase = async () => {
    setSyncingDb(true);
    try {
      const res = await apiFetch(`/import/sync?mode=incremental`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Sincronização realizada com sucesso!", "success");
        fetchProducts();
        fetchKits();
        fetchConfigs();
        fetchImportStatus();
        fetchImportHistory();
      } else {
        showToast(data.error || "Erro ao sincronizar com o banco de dados NATUM", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao conectar com a API de sincronização", "error");
    } finally {
      setSyncingDb(false);
    }
  };

  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    if (type === 'faturamento') {
      setUploadingFat(true);
    } else if (type === 'kits') {
      setUploadingKits(true);
    } else {
      setUploadingLev(true);
    }

    try {
      const endpoint = type === 'faturamento' ? 'faturamento' : type === 'kits' ? 'kits' : 'levantamento';
      const res = await apiFetch(`/import/${endpoint}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Importação concluída com sucesso!", "success");
        fetchProducts();
        fetchKits();
        fetchConfigs();
      } else {
        showToast(data.error || "Erro ao processar planilha ERP", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao conectar com a API de importação", "error");
    } finally {
      if (type === 'faturamento') {
        setUploadingFat(false);
      } else if (type === 'kits') {
        setUploadingKits(false);
      } else {
        setUploadingLev(false);
      }
    }
  };

  const openEditModal = (prod) => {
    setEditingProduct(prod);
    setOverrideIdeal(prod.estoque_ideal_manual !== null ? prod.estoque_ideal_manual.toString() : '');
    setOverridePedidos(prod.pedidos_manual !== null ? prod.pedidos_manual.toString() : '');
    setOverrideMedia(prod.media_manual !== null ? prod.media_manual.toString() : '');
    
    if (prod.is_lancamento_manual === 1) {
      setOverrideLaunch('LAUNCH');
    } else if (prod.is_lancamento_manual === 0) {
      setOverrideLaunch('REGULAR');
    } else {
      setOverrideLaunch('AUTO');
    }

    if (prod.visivel === 0) {
      setOverrideVisible('HIDDEN');
    } else {
      setOverrideVisible('VISIBLE');
    }

    setOverrideLine(prod.linha_prefix_manual !== null ? prod.linha_prefix_manual : 'AUTO');
    setOverrideObs(prod.observacao !== null ? prod.observacao : '');
    setOverrideApenasKit(prod.produzir_apenas_kit !== null ? prod.produzir_apenas_kit : 0);
    setOverrideIsProgramada(prod.is_producao_programada === 1 ? 1 : 0);
    setOverrideProgramadaDisparo(prod.producao_programada_disparo !== null && prod.producao_programada_disparo !== undefined ? prod.producao_programada_disparo.toString() : '');
    setOverrideProgramadaObjetivo(prod.producao_programada_objetivo !== null && prod.producao_programada_objetivo !== undefined ? prod.producao_programada_objetivo.toString() : '');
  };

  const handleSaveOverrides = async () => {
    if (!editingProduct) return;

    const isProg = overrideIsProgramada === 1 || 
      (overrideProgramadaDisparo.trim() !== '' && parseInt(overrideProgramadaDisparo, 10) > 0) ||
      (overrideProgramadaObjetivo.trim() !== '' && parseInt(overrideProgramadaObjetivo, 10) > 0);

    const payload = {
      codigo: editingProduct.codigo,
      estoque_ideal_manual: overrideIdeal.trim() === '' ? null : parseInt(overrideIdeal, 10) || 0,
      pedidos_manual: overridePedidos.trim() === '' ? null : parseInt(overridePedidos, 10) || 0,
      media_manual: overrideMedia.trim() === '' ? null : parseFloat(overrideMedia) || 0.0,
      is_lancamento_manual: overrideLaunch === 'AUTO' ? null : overrideLaunch === 'LAUNCH' ? 1 : 0,
      visivel: overrideVisible === 'HIDDEN' ? 0 : 1,
      linha_prefix_manual: overrideLine === 'AUTO' ? null : overrideLine,
      observacao: overrideObs.trim() === '' ? null : overrideObs,
      produzir_apenas_kit: overrideApenasKit,
      is_producao_programada: isProg ? 1 : 0,
      producao_programada_disparo: isProg && overrideProgramadaDisparo.trim() !== '' ? parseInt(overrideProgramadaDisparo, 10) || 0 : null,
      producao_programada_objetivo: isProg && overrideProgramadaObjetivo.trim() !== '' ? parseInt(overrideProgramadaObjetivo, 10) || 0 : null,
    };

    try {
      const res = await apiFetch(`/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(
          isProg 
            ? `Produto ${editingProduct.codigo} configurado na Produção Programada!` 
            : `Overrides salvos para ${editingProduct.codigo}`, 
          "success"
        );
        setEditingProduct(null);
        fetchProducts();
        fetchProgramadas();
      } else {
        showToast("Erro ao salvar overrides manuais", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Falha de conexão com a API", "error");
    }
  };

  const fetchAllProducts = async () => {
    try {
      const res = await apiFetch(`/products?limit=9999&show_hidden=true`);
      if (res.ok) {
        const data = await res.json();
        setAllProducts(data.items || []);
      }
    } catch (e) {
      console.error("Error fetching all products:", e);
    }
  };

  const fetchColoracoes = async () => {
    try {
      const res = await apiFetch(`/products?status=coloracao&limit=9999&show_hidden=true`);
      if (res.ok) {
        const data = await res.json();
        setColoracoes(data.items || []);
      }
    } catch (e) {
      console.error("Error fetching coloracoes:", e);
    }
  };

  const handleBulkApply = async (e) => {
    if (e) e.preventDefault();
    if (bulkSelected.length === 0) {
      showToast("Selecione pelo menos um produto na lista para aplicar a ação.", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`/overrides/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigos: bulkSelected,
          action: bulkAction,
          value_str: bulkValueStr.trim() === '' ? null : bulkValueStr
        })
      });

      if (res.ok) {
        showToast(`Ação aplicada com sucesso a ${bulkSelected.length} produtos!`, "success");
        setBulkSelected([]);
        setBulkValueStr('');
        fetchProducts();
        fetchAllProducts();
      } else {
        const err = await res.json();
        showToast(err.error || "Erro ao aplicar ações em lote", "error");
      }
    } catch (e) {
      console.error("Error in bulk overrides:", e);
      showToast("Falha de conexão com a API", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchAllProducts();
    fetchColoracoes();
    fetchImportStatus();
    fetchImportHistory();
    fetchWatchConfig();
    fetchKitComposicao();
    fetchIgnoredStatuses();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const tabOptions = [
    { id: 'ALL', name: 'Todos' },
    ...(configs.length > 0
      ? configs
          .filter(c => c.visivel !== 0)
          .map(c => ({ id: c.linha_prefix, name: c.nome_linha }))
      : [
          { id: '1', name: 'Natum' },
          { id: '2', name: 'Hair Extrattus' },
          { id: '10', name: 'Liss Shine' },
          { id: '14', name: 'Perfect Curls' },
          { id: '3', name: 'Pierre Capelli' },
          { id: '5', name: 'Bio Ozônio' },
          { id: '70', name: 'Vita Brasil' },
          { id: 'DEFAULT', name: 'Outros' },
        ])
  ];

  const gerenciamentoSidebarItems = [
    { id: 'inventory', label: 'Gerenciamento de Produção', icon: Table },
    { id: 'kits', label: 'Gerenciamento de Kits', icon: Layers },
    { id: 'programadas', label: 'Produções Programadas', icon: CalendarClock },
    { id: 'aprovacao', label: 'Planejamento Semanal', icon: CalendarClock, badge: productionApprovalList.length },
    { id: 'calendar', label: 'Calendário', icon: Calendar },
    { id: 'history', label: 'Histórico', icon: History },
    { id: 'ignored_items', label: 'Produtos Suspensos', icon: EyeOff },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const sidebarItems =
    lockedView === 'bases'
      ? [{ id: 'bases', label: 'Gestão de Bases', icon: Database }]
      : gerenciamentoSidebarItems;

  const layoutActiveTab = currentView;

  const handleLayoutTabChange = (tabId) => {
    if (tabId === 'inventory') {
      setCurrentView('inventory');
      setSelectedStatus('ALL');
      setPage(1);
    } else if (tabId === 'programadas') {
      setCurrentView('programadas');
      setProgramadasActiveTab('ALL');
      setProgramadasSearch('');
      setProgramadasSelectedStatus('ALL');
      setProgramadasPage(1);
      fetchProgramadas();
    } else if (tabId === 'aprovacao') {
      setCurrentView('aprovacao');
    } else if (tabId === 'calendar') {
      setCurrentView('calendar');
      fetchLotes();
    } else if (tabId === 'lotes') {
      setCurrentView('lotes');
      setSelectedLoteStatus('ALL');
      fetchLotes();
    } else if (tabId === 'erros') {
      setCurrentView('erros');
      setSelectedLoteStatus('ERR_ANY_ERROR');
      fetchLotes();
    } else if (tabId === 'kits') {
      setCurrentView('kits');
      setKitsActiveTab('ALL');
      setKitsSearch('');
      setKitsSelectedStatus('ALL');
      setKitsPage(1);
      fetchKits();
    } else if (tabId === 'history') {
      setCurrentView('history');
      fetchHistory();
    } else if (tabId === 'ignored_items') {
      setCurrentView('ignored_items');
      fetchSuspendedProducts();
    } else if (tabId === 'settings') {
      setCurrentView('settings');
      fetchKitComposicao();
    } else {
      setCurrentView(tabId);
    }
  };

  const headerActions = null;

  return (
    <AppLayout
      moduleTitle={
        lockedView === 'bases'
          ? 'Gestão de Bases'
          : lockedView === 'lotes'
            ? 'Lotes de Produção'
            : 'Natum Produção'
      }
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={layoutActiveTab}
      onTabChange={handleLayoutTabChange}
      headerActions={headerActions}
    >
          
          {/* VIEW: STOCK & ALERTS */}
          {currentView === 'inventory' && (
            <InventoryTab
              stats={stats}
              onShowDetails={fetchProductDetails}
              products={products}
              configs={configs}
              bases={bases}
              activeTab={activeTab}
              handleTabChange={handleTabChange}
              search={search}
              setSearch={setSearch}
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
              selectedBase={selectedBase}
              setSelectedBase={setSelectedBase}
              showHidden={showHidden}
              setShowHidden={setShowHidden}
              page={page}
              setPage={setPage}
              totalPages={totalPages}
              totalItems={totalItems}
              limitPerPage={limitPerPage}
              diasComerciais={diasComerciais}
              sortField={sortField}
              setSortField={setSortField}
              sortDir={sortDir}
              setSortDir={setSortDir}
              onLaunchProduct={(p) => {
                setLaunchingProduct(p);
                setLaunchQty(p.producao_recomendada > 0 ? p.producao_recomendada : 100);
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                setLaunchDate(`${yyyy}-${mm}-${dd}`);
              }}
              onEditOverrides={openEditModal}
              onRefresh={fetchProducts}
              loading={loading}
              tabOptions={tabOptions}
              toggleSort={toggleSort}
              SortIcon={SortIcon}
              productionApprovalList={productionApprovalList}
              onToggleApprovalList={handleToggleApprovalList}
            />
          )}

          {/* VIEW: PRODUÇÕES PROGRAMADAS */}
          {currentView === 'programadas' && (
            <ProgramadasTab
              products={programadasProducts}
              configs={configs}
              bases={bases}
              activeTab={programadasActiveTab}
              handleTabChange={(t) => { setProgramadasActiveTab(t); setProgramadasPage(1); }}
              search={programadasSearch}
              setSearch={setProgramadasSearch}
              selectedStatus={programadasSelectedStatus}
              setSelectedStatus={setProgramadasSelectedStatus}
              page={programadasPage}
              setPage={setProgramadasPage}
              totalPages={programadasTotalPages}
              totalItems={programadasTotalItems}
              limitPerPage={limitPerPage}
              diasComerciais={diasComerciais}
              sortField={programadasSortField}
              setSortField={setProgramadasSortField}
              sortDir={programadasSortDir}
              setSortDir={setProgramadasSortDir}
              onEditOverrides={openEditModal}
              onRefresh={fetchProgramadas}
              loading={programadasLoading}
              tabOptions={tabOptions}
              toggleSort={toggleSort}
              SortIcon={SortIcon}
              onShowDetails={fetchProductDetails}
              productionApprovalList={productionApprovalList}
              onToggleApprovalList={handleToggleApprovalList}
            />
          )}

          {/* VIEW: PLANEJAMENTO SEMANAL DE ORDENS (REATORES & HEURÍSTICA) */}
          {currentView === 'aprovacao' && (
            <PlanejamentoSemanalTab
              active={currentView === 'aprovacao'}
              productionApprovalList={productionApprovalList}
              onToggleApprovalList={handleToggleApprovalList}
              diasComerciais={diasComerciais}
              configs={configs}
              onLaunchSuccess={() => {
                fetchProducts();
                fetchKits();
              }}
            />
          )}

          {/* VIEW: BASES MANAGEMENT */}
          {currentView === 'bases' && (
            <BasesTab
              configs={configs}
              tabOptions={tabOptions}
              onLaunchProduct={(p) => {
                setLaunchingProduct(p);
                setLaunchQty(p.producao_recomendada > 0 ? p.producao_recomendada : 100);
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                setLaunchDate(`${yyyy}-${mm}-${dd}`);
              }}
              onEditOverrides={openEditModal}
              onRefresh={fetchProducts}
              productionApprovalList={productionApprovalList}
              onToggleApprovalList={handleToggleApprovalList}
            />
          )}

          {/* VIEW: KITS MANAGEMENT */}
          {currentView === 'kits' && (
            <KitsTab
              kitsStats={kitsStats}
              kits={kits}
              configs={configs}
              kitsActiveTab={kitsActiveTab}
              setKitsActiveTab={setKitsActiveTab}
              kitsSearch={kitsSearch}
              setKitsSearch={setKitsSearch}
              kitsSelectedStatus={kitsSelectedStatus}
              setKitsSelectedStatus={setKitsSelectedStatus}
              kitsPage={kitsPage}
              setKitsPage={setKitsPage}
              kitsTotalPages={kitsTotalPages}
              kitsTotalItems={kitsTotalItems}
              limitPerPage={limitPerPage}
              showHidden={showHidden}
              kitSortField={kitSortField}
              setKitSortField={setKitSortField}
              kitSortDir={kitSortDir}
              setKitSortDir={setKitSortDir}
              onLaunchProduct={(p) => {
                setLaunchingProduct(p);
                setLaunchQty(p.producao_recomendada > 0 ? p.producao_recomendada : 100);
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                setLaunchDate(`${yyyy}-${mm}-${dd}`);
              }}
              onEditOverrides={openEditModal}
              onRefresh={fetchKits}
              loading={loading}
              tabOptions={tabOptions}
              toggleSort={toggleSort}
              SortIcon={SortIcon}
              expandedKits={expandedKits}
              toggleKitExpanded={toggleKitExpanded}
              productionApprovalList={productionApprovalList}
              onToggleApprovalList={handleToggleApprovalList}
              onOpenComposition={handleOpenKitComposition}
              onToggleApenasKit={handleToggleComponentApenasKit}
            />
          )}

          {/* VIEW: PRODUCTION HISTORY */}
          {currentView === 'history' && (
            <HistoryTab
              historyRecords={historyRecords}
              configs={configs}
              historySearch={historySearch}
              setHistorySearch={setHistorySearch}
              historyActiveTab={historyActiveTab}
              setHistoryActiveTab={setHistoryActiveTab}
              historyDateFilter={historyDateFilter}
              setHistoryDateFilter={setHistoryDateFilter}
              historySortField={historySortField}
              setHistorySortField={setHistorySortField}
              historySortDir={historySortDir}
              setHistorySortDir={setHistorySortDir}
              onDeleteHistory={handleDeleteHistory}
              onRefresh={fetchHistory}
              loading={loading}
              toggleSort={toggleSort}
              SortIcon={SortIcon}
              expandedHistoryId={expandedHistoryId}
              setExpandedHistoryId={setExpandedHistoryId}
            />
          )}

          {/* VIEW: CALENDÁRIO DE PRODUÇÃO */}
          {currentView === 'calendar' && (
            <LotesCalendarTab
              lotes={lotes}
              onRefresh={fetchLotes}
              loading={lotesLoading}
              onOpenDetails={fetchLoteDetails}
            />
          )}

          {/* VIEW: LOTES DE PRODUÇÃO (ERP) */}
          {currentView === 'lotes' && (
            <LotesTab 
              lotes={lotes} 
              onRefresh={fetchLotes} 
              loading={lotesLoading} 
              onOpenDetails={fetchLoteDetails}
              selectedStatus="ALL"
              setSelectedStatus={setSelectedLoteStatus}
            />
          )}

          {/* VIEW: ERROS DE ESTOQUE */}
          {currentView === 'erros' && (
            <LotesTab 
              lotes={lotes} 
              onRefresh={fetchLotes} 
              loading={lotesLoading} 
              onOpenDetails={fetchLoteDetails}
              selectedStatus="ERR_ANY_ERROR"
              setSelectedStatus={setSelectedLoteStatus}
            />
          )}

          {/* VIEW: IGNORED ITEMS (PRODUTOS SUSPENSOS) */}
          {currentView === 'ignored_items' && (
            <div className="view-container animate-in fade-in duration-200">
              {/* Search Toolbar */}
              <div className="toolbar-section flex justify-between items-center gap-4">
                <div className="search-input-wrapper flex-1 max-w-md">
                  <Search size={18} />
                  <input 
                    type="text" 
                    placeholder="Buscar por código ou descrição..." 
                    className="search-input"
                    value={suspendedSearch}
                    onChange={(e) => setSuspendedSearch(e.target.value)}
                  />
                </div>
                <button className="btn-secondary cursor-pointer" onClick={fetchSuspendedProducts} title="Recarregar dados">
                  <RefreshCw size={16} />
                </button>
              </div>

              <div className="table-card text-left" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
                {suspendedLoading ? (
                  <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <RefreshCw className="animate-spin" size={32} />
                    <span>Carregando produtos suspensos...</span>
                  </div>
                ) : suspendedProducts.length === 0 ? (
                  <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <HelpCircle size={48} style={{ opacity: 0.3 }} />
                    <span>Nenhum produto suspenso encontrado.</span>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '15%' }}>REF</th>
                          <th style={{ width: '45%' }}>Descrição</th>
                          <th style={{ width: '15%' }}>Linha</th>
                          <th style={{ width: '15%' }}>Status</th>
                          <th style={{ width: '10%', textAlign: 'center' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suspendedProducts.map((p) => (
                          <tr 
                            key={p.codigo} 
                            className="hover:bg-zinc-50/50 transition-colors cursor-pointer"
                          >
                            <td 
                              onClick={() => fetchProductDetails(p.codigo)} 
                              className="font-mono text-zinc-650 font-bold hover:underline"
                            >
                              {p.codigo}
                            </td>
                            <td 
                              onClick={() => fetchProductDetails(p.codigo)} 
                              className="font-semibold text-zinc-800 hover:underline"
                            >
                              {p.descricao}
                            </td>
                            <td 
                              onClick={() => fetchProductDetails(p.codigo)} 
                              className="text-zinc-550 font-medium"
                            >
                              {p.nome_linha}
                            </td>
                            <td onClick={() => fetchProductDetails(p.codigo)}>
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[10px] font-bold uppercase">
                                {p.status_produto || 'suspenso'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnsuspendProduct(p.codigo);
                                }}
                                className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-bold shadow-sm cursor-pointer transition-all border border-zinc-950"
                              >
                                Reativar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW: SETTINGS */}
          {currentView === 'settings' && (
            <SettingsTab
              diasComerciais={diasComerciais}
              limitPerPage={limitPerPage}
              tempDiasComerciais={tempDiasComerciais}
              setTempDiasComerciais={setTempDiasComerciais}
              tempLimitPerPage={tempLimitPerPage}
              setTempLimitPerPage={setTempLimitPerPage}
              onSaveGlobalSettings={handleSaveGlobalSettings}
              allProducts={allProducts}
              recalcProd={recalcProd}
              setRecalcProd={setRecalcProd}
              recalcIng={recalcIng}
              setRecalcIng={setRecalcIng}
              recalcIngredients={recalcIngredients}
              recalcPreview={recalcPreview}
              setRecalcPreview={setRecalcPreview}
              recalcLoading={recalcLoading}
              onPreviewRecalc={handlePreviewRecalc}
              onApplyRecalc={handleApplyRecalc}
            />
          )}


      {/* Manual Override Dialog Modal */}
      {editingProduct && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Ajustar Manualmente - REF {editingProduct.codigo}</h3>
              <button className="action-btn cursor-pointer" onClick={() => setEditingProduct(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body text-left">
              <p className="modal-subtitle">
                Defina valores manuais para ignorar temporariamente os cálculos automáticos das planilhas ERP para este produto.
              </p>
              
              <div className="modal-info-box">
                <div className="modal-info-title">
                  <strong>{editingProduct.descricao}</strong>
                  <div className="modal-info-sub">
                    Estoque: {editingProduct.estoque} | Produção: {editingProduct.producao} | Pedidos Original: {editingProduct.pedidos_aberto}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Pedidos em Aberto Manual (Sobrescrever valor original)</label>
                <input 
                  type="number" 
                  className="form-control text-zinc-900" 
                  placeholder={`Planilha original: ${editingProduct.pedidos_aberto}`}
                  value={overridePedidos}
                  onChange={(e) => setOverridePedidos(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Média Mensal de Vendas Manual (Sobrescrever)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control text-zinc-900" 
                  placeholder={`Planilha original: ${editingProduct.media_vendas.toFixed(1)}`}
                  value={overrideMedia}
                  onChange={(e) => setOverrideMedia(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Estoque Ideal Fixo (Unidades de Produto - Sobrescrever meses)</label>
                <input 
                  type="number" 
                  className="form-control text-zinc-900" 
                  placeholder={`Automático atual: ${editingProduct.estoque_ideal_qtd.toFixed(0)}`}
                  value={overrideIdeal}
                  onChange={(e) => setOverrideIdeal(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Status de Vendas (Lançamento)</label>
                <select 
                  className="form-control text-zinc-900"
                  value={overrideLaunch}
                  onChange={(e) => setOverrideLaunch(e.target.value)}
                >
                  <option value="AUTO">Automático (Baseado no faturamento 2025)</option>
                  <option value="LAUNCH">Lançamento (Forçar sem histórico / desvio zero)</option>
                  <option value="REGULAR">Produto de Linha Regular (Forçar cálculo padrão)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Linha de Produto (Prefixo de Cálculo)</label>
                <select 
                  className="form-control text-zinc-900"
                  value={overrideLine}
                  onChange={(e) => setOverrideLine(e.target.value)}
                >
                  <option value="AUTO">Automático (Detecção automática pelo código)</option>
                  {configs.map((c) => (
                    <option key={c.linha_prefix} value={c.linha_prefix}>
                      {c.nome_linha} ({c.linha_prefix})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Visibilidade do Produto</label>
                <select 
                  className="form-control text-zinc-900"
                  value={overrideVisible}
                  onChange={(e) => setOverrideVisible(e.target.value)}
                >
                  <option value="VISIBLE">Visível (Aparecer nas listagens normais)</option>
                  <option value="HIDDEN">Oculto (Ocultar de listagens e alertas)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="checkbox"
                  id="produzir_apenas_kit"
                  checked={overrideApenasKit === 1}
                  onChange={(e) => setOverrideApenasKit(e.target.checked ? 1 : 0)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="produzir_apenas_kit" style={{ cursor: 'pointer', margin: 0, fontWeight: '500' }}>
                  Produzir apenas se houver demanda no Kit (Zera recomendação se kits estão OK)
                </label>
              </div>

              {/* Seção Produção Programada */}
              <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3 my-3">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    id="is_producao_programada"
                    checked={overrideIsProgramada === 1}
                    onChange={(e) => setOverrideIsProgramada(e.target.checked ? 1 : 0)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="is_producao_programada" className="cursor-pointer font-bold text-blue-900 text-xs select-none">
                    Habilitar Produção Programada (Gatilho e Objetivo)
                  </label>
                </div>
                <p className="text-[11px] text-blue-700/80 mt-1">
                  Ao marcar como Produção Programada, o item sairá da listagem de Gerenciamento de Produção e será gerenciado exclusivamente na aba <strong>Produções Programadas</strong>.
                </p>

                {overrideIsProgramada === 1 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-blue-200/60">
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="text-xs font-semibold text-zinc-700">
                        Estoque de Disparo (Gatilho)
                      </label>
                      <input 
                        type="number" 
                        className="form-control text-zinc-900 mt-1" 
                        placeholder="Ex: 500 (Dispara se EFP ≤ valor)"
                        value={overrideProgramadaDisparo}
                        onChange={(e) => setOverrideProgramadaDisparo(e.target.value)}
                      />
                      <span className="text-[10px] text-zinc-500 mt-0.5 block">
                        Dispara sugestão quando EFP for menor ou igual a este valor.
                      </span>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="text-xs font-semibold text-zinc-700">
                        Quantidade Objetivo (Lote)
                      </label>
                      <input 
                        type="number" 
                        className="form-control text-zinc-900 mt-1" 
                        placeholder="Ex: 1000 (Lote a produzir)"
                        value={overrideProgramadaObjetivo}
                        onChange={(e) => setOverrideProgramadaObjetivo(e.target.value)}
                      />
                      <span className="text-[10px] text-zinc-500 mt-0.5 block">
                        Quantidade fixa sugerida a cada ciclo de produção.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Observação de Produção</label>
                <textarea 
                  className="form-control text-zinc-900" 
                  placeholder="Ex: produzir somente sob encomenda/pedido..."
                  value={overrideObs}
                  onChange={(e) => setOverrideObs(e.target.value)}
                  rows={2}
                  style={{ resize: 'vertical', minHeight: '60px' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary cursor-pointer" onClick={() => setEditingProduct(null)}>Cancelar</button>
              <button className="btn-primary cursor-pointer" onClick={handleSaveOverrides}>Salvar Alterações</button>
            </div>
          </div>
        </div>
      )}

      {/* Launch Production Modal */}
      {launchingProduct && (
        <div className="modal-backdrop">
          <div className="modal-content text-left" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3>Registrar Lote de Produção</h3>
              <button className="action-btn cursor-pointer" onClick={() => setLaunchingProduct(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-subtitle">
                Defina a data, a quantidade e uma observação opcional para este lote de produção. A quantidade será adicionada automaticamente ao estoque em processo do produto.
              </p>
              
              <div className="modal-info-box">
                <div className="modal-info-title">
                  <strong>{launchingProduct.codigo}  {launchingProduct.descricao}</strong>
                  <div className="modal-info-sub">
                    Estoque atual: {launchingProduct.estoque} | Em Produção: {launchingProduct.producao} | Sugestão: {launchingProduct.producao_recomendada > 0 ? `${launchingProduct.producao_recomendada} un` : 'Nenhuma'}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Data da Produção</label>
                <input 
                  type="date" 
                  className="form-control text-zinc-900" 
                  value={launchDate}
                  onChange={(e) => setLaunchDate(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Quantidade a Produzir (Unidades)</label>
                <input 
                  type="number" 
                  className="form-control text-zinc-900 font-bold" 
                  placeholder="Ex: 150"
                  value={launchQty}
                  onChange={(e) => setLaunchQty(e.target.value)}
                  min="1"
                />
              </div>

              {/* Base Control Section */}
              {launchingProduct.base && (
                <div className="form-group" style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'hsl(var(--muted-hsl) / 0.3)', borderRadius: '0.5rem', border: '1px solid hsl(var(--border-hsl))' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: '600' }}>
                    <input 
                      type="checkbox" 
                      checked={consumeBase} 
                      onChange={(e) => setConsumeBase(e.target.checked)} 
                      disabled={!baseProduct || baseProduct.estoque <= 0}
                    />
                    <span>Consumir base do estoque</span>
                  </label>
                  <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: '4px', marginLeft: '1.25rem' }}>
                    {baseProduct ? (
                      <>
                        Utiliza a base: <strong>{baseProduct.descricao} ({baseProduct.codigo})</strong><br />
                        Estoque atual da base: <strong style={{ color: baseProduct.estoque > 0 ? 'hsl(var(--success-hsl))' : 'hsl(var(--danger-hsl))' }}>{baseProduct.estoque} unidades</strong>
                        {baseProduct.estoque <= 0 && <span style={{ color: 'rgb(244 63 94)', display: 'block', marginTop: '2px' }}>⚠️ Estoque de base insuficiente para consumo.</span>}
                      </>
                    ) : (
                      <span style={{ color: 'rgb(245 158 11)' }}>
                        ⚠️ Base "{launchingProduct.base}" não encontrada no cadastro de produtos ativos.
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label>Observações (Opcional)</label>
                <textarea 
                  className="form-control text-zinc-900" 
                  placeholder="Ex: Lote A1 - Produção sob encomenda, pedido #4521..."
                  value={launchObs}
                  onChange={(e) => setLaunchObs(e.target.value)}
                  rows={2}
                  style={{ resize: 'vertical', minHeight: '60px' }}
                />
              </div>

              {/* Similar Formulation Products Section */}
              {similarLoading ? (
                <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                  <RefreshCw className="animate-spin inline-block mr-1" size={12} />
                  <span>Buscando produtos com formulação semelhante...</span>
                </div>
              ) : similarProducts.length > 0 ? (
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="font-semibold" style={{ fontSize: '0.85rem' }}>Produtos com Formulação Semelhante (Setup Otimizado)</label>
                  <p style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: '0.5rem' }}>
                    Estes produtos compartilham ingredientes e podem ser produzidos juntos. Selecione para abrir ordem em conjunto:
                  </p>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid hsl(var(--border-hsl))', borderRadius: '0.5rem', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: '#fff' }}>
                    {similarProducts.map(item => {
                      const code = item.product.codigo;
                      const desc = item.product.descricao;
                      const simPct = (item.similarity * 100).toFixed(0);
                      const isChecked = selectedSims[code]?.checked || false;
                      const qty = selectedSims[code]?.qty || 100;
                      
                      return (
                        <div key={code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.35rem', borderRadius: '0.25rem', borderBottom: '1px solid hsl(var(--muted-hsl))', fontSize: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={(e) => setSelectedSims(prev => ({
                                ...prev,
                                [code]: { ...prev[code], checked: e.target.checked }
                              }))}
                            />
                            <div style={{ flex: 1 }}>
                              <div className="font-bold text-zinc-950" style={{ fontSize: '0.75rem' }}>{code} — {desc}</div>
                              <div style={{ color: 'hsl(var(--text-secondary-hsl))', fontSize: '0.65rem' }}>
                                Semelhança: {simPct}% | EFP: {item.product.estoque_futuro_com_producao} | Sugestão: {item.product.producao_recomendada > 0 ? `${item.product.producao_recomendada} un` : 'Nenhuma'}
                              </div>
                            </div>
                          </div>
                          {isChecked && (
                            <div style={{ width: '80px' }}>
                              <input 
                                type="number"
                                className="form-control text-zinc-900" 
                                style={{ fontSize: '0.7rem', padding: '0.25rem', textAlign: 'center' }}
                                value={qty}
                                onChange={(e) => setSelectedSims(prev => ({
                                  ...prev,
                                  [code]: { ...prev[code], qty: e.target.value }
                                }))}
                                min="1"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

            </div>
            <div className="modal-footer">
              <button className="btn-secondary cursor-pointer" onClick={() => setLaunchingProduct(null)}>Cancelar</button>
              <button className="btn-primary cursor-pointer" onClick={handleLaunchProduction} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Play size={14} />
                Lançar Produção
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Details Drawer */}
      <AnimatePresence>
        {detailsDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop"
              style={{ zIndex: 190 }}
              onClick={() => setDetailsDrawerOpen(false)}
            />
            {/* Drawer container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-screen w-full max-w-2xl bg-white shadow-2xl border-l border-zinc-200 flex flex-col text-left text-zinc-800"
              style={{ zIndex: 200 }}
            >
              {/* Header */}
              <div className="p-6 border-b border-zinc-150 flex items-center justify-between bg-zinc-50 shrink-0">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Detalhes do Produto</span>
                  <h3 className="font-extrabold text-zinc-900 text-lg mt-0.5 truncate">
                    {detailsDrawerLoading ? 'Carregando...' : selectedProductDetails?.description}
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">
                    Ref: {detailsDrawerLoading ? '...' : selectedProductDetails?.code}
                  </p>
                </div>
                <button
                  onClick={() => setDetailsDrawerOpen(false)}
                  className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-650 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tab Navigation */}
              {!detailsDrawerLoading && selectedProductDetails && (
                <div className="flex border-b border-zinc-150 bg-zinc-50 px-6 shrink-0">
                  <button
                    onClick={() => setDetailsDrawerActiveTab('geral')}
                    className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer focus:outline-none ${
                      detailsDrawerActiveTab === 'geral' 
                        ? 'border-zinc-900 text-zinc-900 font-extrabold' 
                        : 'border-transparent text-zinc-450 hover:text-zinc-650'
                    }`}
                  >
                    Geral
                  </button>
                  <button
                    onClick={() => setDetailsDrawerActiveTab('formula')}
                    className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer focus:outline-none ${
                      detailsDrawerActiveTab === 'formula' 
                        ? 'border-zinc-900 text-zinc-900 font-extrabold' 
                        : 'border-transparent text-zinc-450 hover:text-zinc-650'
                    }`}
                  >
                    Fórmula & Ingredientes
                  </button>
                  <button
                    onClick={() => setDetailsDrawerActiveTab('lotes')}
                    className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer focus:outline-none ${
                  detailsDrawerActiveTab === 'lotes' 
                        ? 'border-zinc-900 text-zinc-900 font-extrabold' 
                        : 'border-transparent text-zinc-450 hover:text-zinc-650'
                    }`}
                  >
                    Lotes de Produção
                  </button>
                  <button
                    onClick={() => setDetailsDrawerActiveTab('pedidos')}
                    className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer focus:outline-none ${
                      detailsDrawerActiveTab === 'pedidos'
                        ? 'border-zinc-900 text-zinc-900 font-extrabold'
                        : 'border-transparent text-zinc-450 hover:text-zinc-650'
                    }`}
                  >
                    Pedidos
                    {productPendingOrders?.pending_sales_orders?.length
                      ? ` (${productPendingOrders.pending_sales_orders.length})`
                      : ''}
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {detailsDrawerLoading ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
                    <RefreshCw className="h-8 w-8 animate-spin text-zinc-500" />
                    <span className="font-medium">Carregando ficha e estatísticas...</span>
                  </div>
                ) : selectedProductDetails ? (
                  <>
                    {/* TAB: GERAL */}
                    {detailsDrawerActiveTab === 'geral' && (
                      <div className="space-y-6 animate-in fade-in duration-150 text-left">
                        {/* Top Stats Cards */}
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Estoque Atual</span>
                            <p className="text-lg font-extrabold text-zinc-900 mt-1.5">
                              {selectedProductDetails.currentStock.toLocaleString('pt-BR')}{' '}
                              <span className="text-xs font-semibold text-zinc-550">{selectedProductDetails.unit}</span>
                            </p>
                          </div>
                          <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] text-zinc-400 font-bold uppercase block">Última Produção</span>
                              <p className="text-xs font-extrabold text-zinc-900 mt-1">
                                {selectedProductDetails.lastProductionDate 
                                  ? new Date(selectedProductDetails.lastProductionDate).toLocaleDateString('pt-BR') 
                                  : 'Nunca produzido'}
                              </p>
                            </div>
                            {selectedProductDetails.lastProductionQty !== null && selectedProductDetails.lastProductionQty !== undefined && (
                              <div className="text-[10px] text-zinc-500 font-bold mt-1">
                                Qtd: {selectedProductDetails.lastProductionQty.toLocaleString('pt-BR')} {selectedProductDetails.unit}
                              </div>
                            )}
                          </div>
                          <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Código ERP</span>
                            <p className="text-lg font-extrabold text-zinc-900 mt-1.5 font-mono">
                              {selectedProductDetails.code}
                            </p>
                          </div>
                        </div>

                        {/* Section: YoY Sales */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                            <TrendingUp className="h-4 w-4 text-zinc-650" />
                            <h4 className="font-extrabold text-sm text-zinc-900">Histórico de Vendas Ano a Ano</h4>
                          </div>
                          {selectedProductDetails.salesYoy.length === 0 ? (
                            <p className="text-xs text-zinc-400 py-3">Sem histórico de vendas registrado.</p>
                          ) : (
                            <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
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
                                      <td className="px-4 py-2.5 text-right font-semibold text-zinc-950">
                                        {s.totalQty.toLocaleString('pt-BR')}
                                      </td>
                                      <td className="px-4 py-2.5 text-right text-zinc-550">
                                        {s.monthlyAvg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Section: Monthly Sales Chart */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="h-4 w-4 text-zinc-650" />
                              <h4 className="font-extrabold text-sm text-zinc-900">Vendas Mensais Detalhadas</h4>
                            </div>
                          </div>

                          {selectedProductDetails.monthlySales.length === 0 ? (
                            <p className="text-xs text-zinc-400 py-3">Nenhum registro de venda mensal.</p>
                          ) : (
                            <div className="p-4 bg-zinc-50/50 border border-zinc-150 rounded-xl space-y-3">
                              {/* Visual Bar chart representation of monthly sales */}
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
                                          {m.qty.toLocaleString('pt-BR')} {selectedProductDetails.unit}
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
                    )}

                    {/* TAB: FÓRMULA & INGREDIENTES & SIMULADOR DE PRODUÇÃO COMPLETA */}
                    {detailsDrawerActiveTab === 'formula' && (
                      <div className="space-y-4 animate-in fade-in duration-150 text-left">
                        <div className="flex items-center justify-between border-b border-zinc-150 pb-3">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-zinc-650" />
                            <h4 className="font-extrabold text-sm text-zinc-900">Fórmula & Necessidade de Produção</h4>
                          </div>
                        </div>

                        {selectedProductDetails.formulation.length === 0 ? (
                          <p className="text-xs text-zinc-400 py-3">Nenhuma fórmula registrada para este produto.</p>
                        ) : (() => {
                          const formulation = selectedProductDetails.formulation || [];
                          const batchQty = Math.max(1, simulatedBatchQty || 1);

                          // Calculate bottlenecks and total requirements
                          let maxPossibleBatches = Infinity;
                          let bottleneckItem = null;
                          let missingItemsCount = 0;

                          const processedFormulation = formulation.map((line) => {
                            const unitQty = line.quantity || 0;
                            const totalNeeded = unitQty * batchQty;
                            const currentStock = line.currentStock ?? 0;
                            const missingQty = Math.max(0, totalNeeded - currentStock);
                            const maxThisItem = unitQty > 0 ? Math.floor(currentStock / unitQty) : Infinity;

                            if (maxThisItem < maxPossibleBatches) {
                              maxPossibleBatches = maxThisItem;
                              bottleneckItem = line;
                            }

                            if (missingQty > 0) {
                              missingItemsCount++;
                            }

                            return {
                              ...line,
                              unitQty,
                              totalNeeded,
                              currentStock,
                              missingQty,
                              isSufficient: currentStock >= totalNeeded,
                              maxThisItem
                            };
                          });

                          const rawMaterials = processedFormulation.filter(line => line.categoryId !== 'cat_emb');
                          const packaging = processedFormulation.filter(line => line.categoryId === 'cat_emb');
                          const isFullyAvailable = missingItemsCount === 0;

                          const renderTable = (list, title) => {
                            if (list.length === 0) return null;
                            return (
                              <div className="space-y-2">
                                <h5 className="font-extrabold text-[10px] text-zinc-450 uppercase tracking-wider">{title}</h5>
                                <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                                      <tr>
                                        <th className="px-3 py-2.5">Componente</th>
                                        <th className="px-3 py-2.5 text-right" title="Quantidade na fórmula unitária">Qtd Unit.</th>
                                        <th className="px-3 py-2.5 text-right font-bold text-zinc-800" title={`Total necessário para produzir ${batchQty} un`}>Necessidade ({batchQty} un)</th>
                                        <th className="px-3 py-2.5 text-right">Estoque Insumo</th>
                                        <th className="px-3 py-2.5 text-right">Falta p/ Lote</th>
                                        <th className="px-3 py-2.5 text-center">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100">
                                      {list.map((line) => {
                                        return (
                                          <tr key={line.ingredientCode} className="hover:bg-zinc-50/50 transition-colors">
                                            <td className="px-3 py-2">
                                              <div className="font-bold text-zinc-800">{line.description}</div>
                                              <div className="font-mono text-[9px] text-zinc-400">{line.ingredientCode}</div>
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium text-zinc-600">
                                              {line.unitQty.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                                            </td>
                                            <td className="px-3 py-2 text-right font-bold text-zinc-900">
                                              {line.totalNeeded.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium text-zinc-700">
                                              {line.currentStock.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-3 py-2 text-right font-bold">
                                              {line.missingQty > 0 ? (
                                                <span className="text-red-600">
                                                  -{line.missingQty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                                </span>
                                              ) : (
                                                <span className="text-green-600">0 (OK)</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                              <span
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-block ${
                                                  line.isSufficient
                                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                                    : 'bg-red-100 text-red-700 border border-red-200'
                                                }`}
                                              >
                                                {line.isSufficient ? 'Disponível' : `Faltam ${line.missingQty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          };

                          return (
                            <div className="space-y-4">
                              {/* Production Batch Simulator Header */}
                              <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <span className="text-[10px] text-zinc-400 font-bold uppercase block">Simulação de Batelada</span>
                                    <h5 className="font-bold text-xs text-zinc-800">O que é preciso para a produção completa deste item:</h5>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs font-bold text-zinc-600">Qtd a Produzir ({selectedProductDetails.unit || 'UN'}):</label>
                                    <input 
                                      type="number"
                                      min="1"
                                      value={simulatedBatchQty}
                                      onChange={(e) => setSimulatedBatchQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                      className="w-24 px-2 py-1 text-sm font-bold text-zinc-900 border border-zinc-300 rounded-lg text-right focus:outline-none focus:border-zinc-800 bg-white"
                                    />
                                  </div>
                                </div>

                                {/* Viability Overview Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                                  <div className="bg-white p-2.5 rounded-lg border border-zinc-150 shadow-2xs">
                                    <span className="text-[9px] text-zinc-400 font-bold uppercase block">Capacidade Imediata</span>
                                    <p className="text-sm font-extrabold text-zinc-900 mt-0.5">
                                      {maxPossibleBatches === Infinity ? '0' : maxPossibleBatches.toLocaleString('pt-BR')} {selectedProductDetails.unit || 'UN'}
                                    </p>
                                    <span className="text-[9px] text-zinc-500 block truncate" title={bottleneckItem ? `Limitado por: ${bottleneckItem.description}` : ''}>
                                      Gargalo: {bottleneckItem ? bottleneckItem.description : 'Nenhum'}
                                    </span>
                                  </div>

                                  <div className="bg-white p-2.5 rounded-lg border border-zinc-150 shadow-2xs">
                                    <span className="text-[9px] text-zinc-400 font-bold uppercase block">Itens com Falta</span>
                                    <p className="text-sm font-extrabold text-zinc-900 mt-0.5">
                                      <span className={missingItemsCount > 0 ? 'text-red-600' : 'text-green-600'}>
                                        {missingItemsCount} {missingItemsCount === 1 ? 'componente' : 'componentes'}
                                      </span>
                                    </p>
                                    <span className="text-[9px] text-zinc-500 block">
                                      Para produzir {batchQty} {selectedProductDetails.unit || 'UN'}
                                    </span>
                                  </div>

                                  <div className="bg-white p-2.5 rounded-lg border border-zinc-150 shadow-2xs col-span-2 sm:col-span-1">
                                    <span className="text-[9px] text-zinc-400 font-bold uppercase block">Status da Produção</span>
                                    <div className="mt-1">
                                      {isFullyAvailable ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">
                                          <CheckCircle2 size={12} /> Pronto para Produzir
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                                          <AlertTriangle size={12} /> Insumos Insuficientes
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Tables for Raw materials and packaging */}
                              {renderTable(rawMaterials, "Matérias-Primas Necessárias")}
                              {renderTable(packaging, "Embalagens Necessárias")}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* TAB: LOTES DE PRODUÇÃO */}
                    {detailsDrawerActiveTab === 'lotes' && (
                      <div className="space-y-3 animate-in fade-in duration-150 text-left">
                        <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                          <ClipboardList className="h-4 w-4 text-zinc-650" />
                          <h4 className="font-extrabold text-sm text-zinc-900">Lotes de Produção Recentes</h4>
                        </div>
                        {!selectedProductDetails.lastLots || selectedProductDetails.lastLots.length === 0 ? (
                          <p className="text-xs text-zinc-400 py-3">Nenhum lote de produção registrado para este produto.</p>
                        ) : (
                          <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                                <tr>
                                  <th className="px-4 py-3">Lote</th>
                                  <th className="px-4 py-3">Data</th>
                                  <th className="px-4 py-3 text-right">Quantidade</th>
                                  <th className="px-4 py-3 text-center">Status</th>
                                  <th className="px-4 py-3 text-right">Inconformidades</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100 font-medium">
                                {selectedProductDetails.lastLots.map((lote) => {
                                  const hasErrors = lote.yieldError || lote.pesagemError || lote.envaseError || lote.conferenciaError;
                                  
                                  return (
                                    <tr 
                                      key={lote.id} 
                                      className="hover:bg-zinc-50/50 transition-colors cursor-pointer"
                                      onClick={() => fetchLoteDetails(lote.loteNumber)}
                                    >
                                      <td className="px-4 py-2.5 font-mono font-bold text-zinc-800">{lote.loteNumber}</td>
                                      <td className="px-4 py-2.5 text-zinc-600">
                                        {new Date(lote.date).toLocaleDateString('pt-BR')}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-semibold text-zinc-950">
                                        {lote.quantity.toLocaleString('pt-BR')}
                                      </td>
                                      <td className="px-4 py-2.5 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          lote.status === 'FP' || lote.status === 'Finalizado' 
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                            : 'bg-blue-50 text-blue-700 border border-blue-100'
                                        }`}>
                                          {lote.status || 'Pendente'}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-right">
                                        {hasErrors ? (
                                          <div className="flex justify-end gap-1 flex-wrap">
                                            {lote.pesagemError && <span className="px-1.5 py-0.5 bg-red-50 text-red-650 border border-red-100 rounded text-[9px] font-bold">Pesagem</span>}
                                            {lote.envaseError && <span className="px-1.5 py-0.5 bg-red-50 text-red-650 border border-red-100 rounded text-[9px] font-bold">Envase</span>}
                                            {lote.yieldError && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[9px] font-bold">Rendimento</span>}
                                            {lote.conferenciaError && <span className="px-1.5 py-0.5 bg-red-50 text-red-650 border border-red-100 rounded text-[9px] font-bold">Conf.</span>}
                                          </div>
                                        ) : (
                                          <span className="text-zinc-400 text-[10px] font-semibold">Nenhuma</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB: PEDIDOS DE VENDA ABERTOS */}
                    {detailsDrawerActiveTab === 'pedidos' && (
                      <div className="space-y-3 animate-in fade-in duration-150 text-left">
                        <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                          <Package className="h-4 w-4 text-zinc-650" />
                          <h4 className="font-extrabold text-sm text-zinc-900">Pedidos em aberto</h4>
                        </div>
                        <p className="text-xs text-zinc-500 font-medium">
                          Pedidos de venda PP/LB/EX/CF/AL — faltas a faturar (unidades).
                        </p>
                        {(!productPendingOrders?.pending_sales_orders ||
                          productPendingOrders.pending_sales_orders.length === 0) ? (
                          <p className="text-xs text-zinc-400 py-3">
                            Nenhum pedido de venda pendente para este produto.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {productPendingOrders.pending_sales_orders.map((so: any, index: number) => {
                              const percent = so.n_qtde > 0 ? (so.n_qtde_fat / so.n_qtde) * 100 : 0;
                              return (
                                <div
                                  key={`${so.n_pedido}-${index}`}
                                  className="bg-white border border-zinc-150 p-4 rounded-xl shadow-sm space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 text-[9px] font-bold uppercase rounded">
                                      Pedido #{so.n_pedido}
                                      {so.n_codigo != null ? ` · Cli ${so.n_codigo}` : ''}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 font-semibold">
                                      {salesOrderStatusLabel(so.c_status)}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-zinc-400 font-medium">
                                    {so.d_pedido
                                      ? new Date(so.d_pedido).toLocaleDateString('pt-BR')
                                      : '—'}
                                  </div>
                                  <div className="grid grid-cols-3 gap-3 text-xs">
                                    <div>
                                      <span className="text-zinc-400 font-medium">Pedida</span>
                                      <p className="font-bold text-zinc-900">
                                        {(so.n_qtde ?? 0).toLocaleString('pt-BR')}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-zinc-400 font-medium">Faturada</span>
                                      <p className="font-bold text-emerald-600">
                                        {(so.n_qtde_fat ?? 0).toLocaleString('pt-BR')}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-zinc-400 font-medium">Pendente</span>
                                      <p className="font-bold text-amber-600">
                                        {(so.falta ?? 0).toLocaleString('pt-BR')}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500 rounded-full"
                                      style={{ width: `${Math.min(percent, 100)}%` }}
                                    />
                                  </div>
                                  <div className="flex justify-between text-xs text-zinc-550 pt-2 border-t border-zinc-100 items-center">
                                    <span
                                      className="font-bold text-zinc-700 truncate max-w-[170px]"
                                      title={so.c_nome || ''}
                                    >
                                      {so.c_nome || 'Cliente não informado'}
                                    </span>
                                    <span className="font-semibold text-zinc-400">
                                      Previsão:{' '}
                                      {so.d_previsao
                                        ? new Date(so.d_previsao).toLocaleDateString('pt-BR')
                                        : 'Não informado'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-zinc-400">
                    Ocorreu um erro ao carregar os dados.
                  </div>
                )}
              </div>
            </motion.div>
            </>
          )}
        </AnimatePresence>

        <LoteDetailsDrawer
          open={loteDetailsDrawerOpen}
          loteNumber={loteDetailsNumber}
          onClose={() => setLoteDetailsDrawerOpen(false)}
          onToast={(message, type) => showToast(message, type || 'success')}
          onResolved={fetchLotes}
        />

        <KitCompositionDrawer
          isOpen={compositionDrawerOpen}
          onClose={() => {
            setCompositionDrawerOpen(false);
            setSelectedKitForComposition(null);
          }}
          kitCodigo={selectedKitForComposition?.codigo || ''}
          kitDescricao={selectedKitForComposition?.descricao || ''}
          onCompositionUpdated={() => {
            fetchProducts();
            fetchKits();
          }}
        />

      {/* Action status notification Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? (
            <CheckCircle2 size={18} color="hsl(var(--success-hsl))" />
          ) : (
            <AlertTriangle size={18} color="hsl(var(--danger-hsl))" />
          )}
          <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{toast.message}</span>
        </div>
      )}
    </AppLayout>
  );
}
