import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  AlertTriangle, CheckCircle2, X, RefreshCw, Database, Check, Play,
  ArrowUpDown, ArrowUp, ArrowDown, LayoutDashboard, Table, Layers, History,
  Settings, ArrowLeft, ClipboardList, User, TrendingUp, BarChart3,
  Scale, Package, FileText, EyeOff, HelpCircle, Info, Search, ClipboardCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const API_BASE = 'http://127.0.0.1:3001/api';

// Import subcomponents
import { DashboardTab } from '../components/producao/DashboardTab';
import { InventoryTab } from '../components/producao/InventoryTab';
import { KitsTab } from '../components/producao/KitsTab';
import { BasesTab } from '../components/producao/BasesTab';
import ItemRegistry from '../components/compras/ItemRegistry';
import { HistoryTab } from '../components/producao/HistoryTab';
import { SettingsTab } from '../components/producao/SettingsTab';
import { LotesTab } from '../components/producao/LotesTab';
import { AprovacaoTab } from '../components/producao/AprovacaoTab';

export default function ProducaoView({ onBackToHub }) {
  // Navigation State
  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    const viewLabels = {
      dashboard: 'Dashboard',
      inventory: 'Gerenciamento de Produção',
      aprovacao: 'Aprovação de Produção',
      kits: 'Gestão de Kits',
      bases: 'Gestão de Bases',
      history: 'Histórico de Produção',
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
  const [showHidden, setShowHidden] = useState(false);

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
  const [kitsPage, setKitsPage] = useState(1);
  const [kitsTotalPages, setKitsTotalPages] = useState(1);
  const [kitsTotalItems, setKitsTotalItems] = useState(0);
  const [kitsSearch, setKitsSearch] = useState('');
  const [kitsSelectedStatus, setKitsSelectedStatus] = useState('ALL');
  const [kitsActiveTab, setKitsActiveTab] = useState('ALL');
  const [expandedKits, setExpandedKits] = useState([]);
  const [uploadingKits, setUploadingKits] = useState(false);

  // Google Drive Sync State
  const [googleStatus, setGoogleStatus] = useState({ configured: false, authenticated: false, client_id: '', last_sync: 'Nunca sincronizado' });
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [syncingGoogle, setSyncingGoogle] = useState(false);

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

  // Product Details Drawer State
  const [selectedProductDetails, setSelectedProductDetails] = useState(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [detailsDrawerLoading, setDetailsDrawerLoading] = useState(false);
  const [detailsDrawerActiveTab, setDetailsDrawerActiveTab] = useState('geral');

  // Suspended Products States
  const [suspendedProducts, setSuspendedProducts] = useState([]);
  const [suspendedLoading, setSuspendedLoading] = useState(false);
  const [suspendedSearch, setSuspendedSearch] = useState('');

  // Lote Details Drawer State
  const [selectedLoteDetails, setSelectedLoteDetails] = useState(null);
  const [loteDetailsDrawerOpen, setLoteDetailsDrawerOpen] = useState(false);
  const [loteDetailsDrawerLoading, setLoteDetailsDrawerLoading] = useState(false);
  const [loteActiveSubTab, setLoteActiveSubTab] = useState('inicio');
  const [resolutionObs, setResolutionObs] = useState('');
  const [resolveLoteLoading, setResolveLoteLoading] = useState(false);
  const [associateSwapSimilar, setAssociateSwapSimilar] = useState(true);
  const [selectedExpectedCode, setSelectedExpectedCode] = useState('');
  const [selectedActualCode, setSelectedActualCode] = useState('');
  const [mappedSwaps, setMappedSwaps] = useState([]);

  useEffect(() => {
    if (selectedLoteDetails && selectedLoteDetails.pesagem_items) {
      const missing = selectedLoteDetails.pesagem_items.filter(item => item.status === 'MISSING');
      const unplanned = selectedLoteDetails.pesagem_items.filter(item => item.status === 'UNPLANNED');
      if (missing.length > 0) {
        setSelectedExpectedCode(missing[0].ingredient_code);
      } else {
        setSelectedExpectedCode('');
      }
      if (unplanned.length > 0) {
        setSelectedActualCode(unplanned[0].ingredient_code);
      } else {
        setSelectedActualCode('');
      }
    } else {
      setSelectedExpectedCode('');
      setSelectedActualCode('');
    }
  }, [selectedLoteDetails]);

  useEffect(() => {
    if (!launchingProduct) {
      setConsumeBase(false);
      setBaseProduct(null);
      setSimilarProducts([]);
      setSelectedSims({});
      return;
    }

    // 1. Find the base product in the current products list
    if (launchingProduct.base) {
      const baseNameUpper = launchingProduct.base.trim().toUpperCase();
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
    fetch(`${API_BASE}/produtos/semelhantes/${launchingProduct.codigo}`)
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

  }, [launchingProduct, products]);

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
    fetch(`${API_BASE}/produtos/formulacao/${recalcProd}`)
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
      const res = await fetch(`${API_BASE}/producao/recalcular/preview?product_code=${recalcProd}&ingredient_code=${recalcIng}`);
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
      const res = await fetch(`${API_BASE}/producao/recalcular/ajustar`, {
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
      const res = await fetch(`${API_BASE}/import/status`);
      if (res.ok) setImportStatus(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchImportHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/import/history`);
      if (res.ok) setImportHistory(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchWatchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/import/watch-config`);
      if (res.ok) setWatchConfig(await res.json());
    } catch (e) { console.error(e); }
  };

  const saveWatchConfig = async (cfg) => {
    try {
      const res = await fetch(`${API_BASE}/import/watch-config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (res.ok) { showToast('Configurações de monitoramento salvas!'); setWatchConfig(cfg); }
    } catch (e) { showToast('Erro ao salvar configurações', 'error'); }
  };

  const fetchKitComposicao = async () => {
    try {
      const res = await fetch(`${API_BASE}/kits/composicao`);
      if (res.ok) setKitComposicao(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleAddKitComposicao = async () => {
    if (!kitCompNewKit.trim() || !kitCompNewComp.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/kits/composicao`, {
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
      const res = await fetch(`${API_BASE}/kits/composicao/${kit}/${comp}`, { method: 'DELETE' });
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
      const res = await fetch(`${API_BASE}/kits/composicao/upload`, { method: 'POST', body: formData });
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
      const res = await fetch(`${API_BASE}/settings/ignored_product_statuses`);
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
      const res = await fetch(`${API_BASE}/settings/ignored_product_statuses`, {
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
      const res = await fetch(`${API_BASE}/configs`);
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

      const res = await fetch(`${API_BASE}/products?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
        setTotalItems(data.total || 0);
        setTotalPages(data.total_pages || 1);
        if (data.stats) setStats(data.stats);
        if (data.bases) setBases(data.bases);
      } else {
        showToast("Erro ao buscar produtos da API", "error");
      }
    } catch (e) {
      console.error("Error fetching products:", e);
      showToast("Falha de conexão com o servidor local", "error");
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

      const res = await fetch(`${API_BASE}/kits?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setKits(data.items || []);
        setKitsTotalItems(data.total || 0);
        setKitsTotalPages(data.total_pages || 1);
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
    fetchKits();
  }, [fetchKits]);

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

      const res = await fetch(`${API_BASE}/historico?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryRecords(data || []);
      } else {
        showToast("Erro ao buscar histórico de produção", "error");
      }
    } catch (e) {
      console.error("Error fetching history:", e);
      showToast("Falha de conexão com o servidor local", "error");
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
      const res = await fetch(`${API_BASE}/producao/lotes`);
      if (res.ok) {
        const data = await res.json();
        setLotes(data || []);
      } else {
        showToast("Erro ao buscar lotes de produção (ERP)", "error");
      }
    } catch (e) {
      console.error("Error fetching lotes:", e);
      showToast("Falha de conexão com o servidor local", "error");
    } finally {
      setLotesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentView === 'lotes') {
      fetchLotes();
    }
  }, [currentView, fetchLotes]);

  const fetchSuspendedProducts = useCallback(async () => {
    setSuspendedLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('suspended_only', 'true');
      if (suspendedSearch.trim()) {
        params.append('search', suspendedSearch.trim());
      }
      params.append('limit', '10000');
      
      const res = await fetch(`${API_BASE}/products?${params.toString()}`);
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

  useEffect(() => {
    if (currentView === 'ignored_items') {
      fetchSuspendedProducts();
    }
  }, [currentView, fetchSuspendedProducts]);

  const fetchProductDetails = async (code) => {
    setDetailsDrawerActiveTab('geral');
    setDetailsDrawerLoading(true);
    setSelectedProductDetails(null);
    setDetailsDrawerOpen(true);
    try {
      const res = await fetch(`${API_BASE}/produtos/${code}/detalhes`);
      if (res.ok) {
        const data = await res.json();
        setSelectedProductDetails(data);
      } else {
        showToast("Erro ao buscar detalhes do produto", "error");
      }
    } catch (e) {
      console.error("Error fetching product details:", e);
      showToast("Falha ao carregar detalhes", "error");
    } finally {
      setDetailsDrawerLoading(false);
    }
  };

  const fetchLoteDetails = async (loteNumber) => {
    setLoteActiveSubTab('inicio');
    setLoteDetailsDrawerLoading(true);
    setSelectedLoteDetails(null);
    setLoteDetailsDrawerOpen(true);
    setResolutionObs('');
    setAssociateSwapSimilar(true);
    setMappedSwaps([]);
    try {
      const res = await fetch(`${API_BASE}/producao/lotes/${loteNumber}/detalhes`);
      if (res.ok) {
        const data = await res.json();
        setSelectedLoteDetails(data);
      } else {
        showToast("Erro ao buscar detalhes do lote", "error");
      }
    } catch (e) {
      console.error("Error fetching lote details:", e);
      showToast("Falha ao carregar detalhes do lote", "error");
    } finally {
      setLoteDetailsDrawerLoading(false);
    }
  };

  const handleResolveLoteErrors = async (loteNumber) => {
    if (!resolutionObs.trim()) {
      showToast("Por favor, preencha a justificativa / observação.", "error");
      return;
    }
    setResolveLoteLoading(true);
    try {
      const res = await fetch(`${API_BASE}/producao/lotes/${loteNumber}/resolver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          observations: resolutionObs,
          resolved_by: "Administrador",
        }),
      });

      if (res.ok) {
        showToast("Desvios do lote justificados com sucesso!", "success");

        if (associateSwapSimilar && mappedSwaps.length > 0) {
          for (const swap of mappedSwaps) {
            try {
              await api.addSimilarItem(swap.expectedCode, swap.actualCode);
            } catch (err) {
              console.error(`Erro ao associar ${swap.expectedCode} e ${swap.actualCode} como semelhantes:`, err);
            }
          }
          showToast(`${mappedSwaps.length} substituição(ões) salva(s) no cadastro de semelhantes!`, "success");
        }

        fetchLoteDetails(loteNumber);
        fetchLotes();
      } else {
        showToast("Erro ao justificar desvios do lote", "error");
      }
    } catch (e) {
      console.error("Error resolving lote:", e);
      showToast("Falha ao justificar desvios", "error");
    } finally {
      setResolveLoteLoading(false);
    }
  };

  const handleUndoResolveLoteErrors = async (loteNumber) => {
    if (!window.confirm("Deseja reabrir os desvios deste lote e remover a justificativa?")) return;
    setResolveLoteLoading(true);
    try {
      const res = await fetch(`${API_BASE}/producao/lotes/${loteNumber}/resolver`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast("Resolução estornada com sucesso!", "success");
        fetchLoteDetails(loteNumber);
        fetchLotes();
      } else {
        showToast("Erro ao estornar resolução", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Falha ao estornar resolução", "error");
    } finally {
      setResolveLoteLoading(false);
    }
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

      const res = await fetch(`${API_BASE}/historico`, {
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
            const simRes = await fetch(`${API_BASE}/historico`, {
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
      const res = await fetch(`${API_BASE}/historico/${id}`, {
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
        await fetch(`${API_BASE}/configs`, {
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
      const res = await fetch(`${API_BASE}/configs`, {
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
      const res = await fetch(`${API_BASE}/configs/${prefix}`, {
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
      const res = await fetch(`${API_BASE}/configs`, {
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
      const res = await fetch(`${API_BASE}/import/sync`, {
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
      const res = await fetch(`${API_BASE}/import/${endpoint}`, {
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
  };

  const handleSaveOverrides = async () => {
    if (!editingProduct) return;

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
    };

    try {
      const res = await fetch(`${API_BASE}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(`Overrides salvos para ${editingProduct.codigo}`, "success");
        setEditingProduct(null);
        fetchProducts();
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
      const res = await fetch(`${API_BASE}/products?limit=9999&show_hidden=true`);
      if (res.ok) {
        const data = await res.json();
        setAllProducts(data.items || []);
      }
    } catch (e) {
      console.error("Error fetching all products:", e);
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
      const res = await fetch(`${API_BASE}/overrides/bulk`, {
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
      showToast("Falha de conexão com o servidor local", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchGoogleStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/google/status`);
      if (res.ok) {
        const data = await res.json();
        setGoogleStatus(data);
        if (data.client_id) setClientId(data.client_id);
      }
    } catch (e) {
      console.error("Error fetching Google status:", e);
    }
  };

  const handleSaveGoogleConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/google/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Credenciais salvas com sucesso!", "success");
        fetchGoogleStatus();
      } else {
        showToast(data.error || "Erro ao salvar credenciais", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Falha de conexão com a API do Google Config", "error");
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch(`${API_BASE}/google/auth-url`);
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, '_blank');
        showToast("Link de login do Google aberto no navegador", "info");
      } else {
        showToast(data.error || "Configure o Client ID antes de fazer login", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao requisitar link de autenticação", "error");
    }
  };

  const handleGoogleSync = async () => {
    setSyncingGoogle(true);
    try {
      const res = await fetch(`${API_BASE}/google/sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Sincronização realizada com sucesso!", "success");
        fetchGoogleStatus();
      } else {
        showToast(data.error || "Falha na sincronização. Verifique o login.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao tentar sincronizar com o Google Drive", "error");
    } finally {
      setSyncingGoogle(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchGoogleStatus();
    fetchAllProducts();
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

  return (
    <div className="app-container">
      {/* Top Header */}
      <header>
        <div className="logo-section">
          <div className="logo-icon">
            <Layers size={20} color="#fff" />
          </div>
          <div>
            <h1>Natum Produção</h1>
            <p className="header-subtitle">
              Ecossistema de Planejamento e Estoques
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div 
            className={`google-sync-badge ${googleStatus.authenticated ? 'synced' : ''}`} 
            onClick={() => googleStatus.authenticated ? handleGoogleSync() : showToast("Configure o backup no Hub principal", "info")}
            title={googleStatus.authenticated ? `Backup Google Drive ativo. Última sincronização: ${googleStatus.last_sync}. Clique para sincronizar agora.` : 'Configure o backup no Hub principal.'}
            style={{ cursor: 'pointer' }}
          >
            <Database size={14} />
            <span style={{ fontSize: '0.75rem' }}>{googleStatus.authenticated ? 'Drive Conectado' : 'Configurar Backup'}</span>
            {googleStatus.authenticated && <Check size={12} style={{ marginLeft: '4px' }} />}
          </div>
        </div>
      </header>

      {/* Main Layout containing Sidebar and active panel */}
      <div className="main-layout">
        {/* Navigation Sidebar */}
        <aside className="sidebar">
          <button 
            className="sidebar-link cursor-pointer"
            onClick={onBackToHub}
            style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(0,0,0,0.06)', borderRadius: '0', paddingBottom: '0.75rem' }}
          >
            <ArrowLeft size={16} />
            <span style={{ fontWeight: 'bold' }}>Voltar ao Hub</span>
          </button>

          <button 
            className={`sidebar-link cursor-pointer ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
          </button>
          
          <button 
            className={`sidebar-link cursor-pointer ${currentView === 'inventory' && selectedStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => {
              setCurrentView('inventory');
              setSelectedStatus('ALL');
              setPage(1);
            }}
          >
            <Table size={16} />
            <span>Gerenciamento de Produção</span>
          </button>

          <button 
            className={`sidebar-link cursor-pointer ${currentView === 'aprovacao' ? 'active' : ''}`}
            onClick={() => setCurrentView('aprovacao')}
          >
            <ClipboardCheck size={16} />
            <span>Aprovação de Produção</span>
            {productionApprovalList.length > 0 && (
              <span style={{
                marginLeft: 'auto',
                backgroundColor: '#27272a',
                color: '#f4f4f5',
                fontSize: '10px',
                fontWeight: '700',
                padding: '1px 6px',
                borderRadius: '10px',
                border: '1px solid #3f3f46'
              }}>
                {productionApprovalList.length}
              </span>
            )}
          </button>

          <button 
            className={`sidebar-link cursor-pointer ${currentView === 'lotes' && selectedLoteStatus === 'ERR_ANY_ERROR' ? 'active' : ''}`}
            onClick={() => {
              setCurrentView('lotes');
              setSelectedLoteStatus('ERR_ANY_ERROR');
            }}
          >
            <AlertTriangle size={16} className="text-amber-500" />
            <span>Erros de Estoque</span>
          </button>
          
          <button 
            className={`sidebar-link cursor-pointer ${currentView === 'bases' ? 'active' : ''}`}
            onClick={() => setCurrentView('bases')}
          >
            <Database size={16} />
            <span>Gestão de Bases</span>
          </button>
          
          <button 
            className={`sidebar-link cursor-pointer ${currentView === 'history' ? 'active' : ''}`}
            onClick={() => setCurrentView('history')}
          >
            <History size={16} />
            <span>Histórico de Produção</span>
          </button>
          
          <button 
            className={`sidebar-link cursor-pointer ${currentView === 'lotes' && selectedLoteStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => {
              setCurrentView('lotes');
              setSelectedLoteStatus('ALL');
            }}
          >
            <ClipboardList size={16} />
            <span>Lotes de Produção</span>
          </button>
          
          <button 
            className={`sidebar-link cursor-pointer ${currentView === 'ignored_items' ? 'active' : ''}`}
            onClick={() => setCurrentView('ignored_items')}
          >
            <EyeOff size={16} />
            <span>Produtos Suspensos</span>
          </button>

          <button 
            className={`sidebar-link cursor-pointer ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => {
              setCurrentView('settings');
              fetchKitComposicao();
            }}
          >
            <Settings size={16} />
            <span>Configurações</span>
          </button>

          <div className="sidebar-footer">
            <div>Versão: 0.003 alpha</div>
            <div>Banco: SQLite Local</div>
          </div>
        </aside>

        {/* View Panel Content */}
        <main className="view-content">
          
          {/* VIEW: DASHBOARD */}
          {currentView === 'dashboard' && (
            <DashboardTab
              stats={stats}
              totalItems={totalItems}
              bases={bases}
              productsLength={products.length}
              googleStatus={googleStatus}
              onGoogleSync={handleGoogleSync}
              setCurrentView={setCurrentView}
              setSelectedStatus={setSelectedStatus}
              setSelectedBase={setSelectedBase}
            />
          )}

          {/* VIEW: STOCK & ALERTS */}
          {currentView === 'inventory' && (
            <InventoryTab
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

          {/* VIEW: APPROVAL QUEUE */}
          {currentView === 'aprovacao' && (
            <AprovacaoTab
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

          {/* VIEW: PRODUCTION LOTS (ERP) */}
          {currentView === 'lotes' && (
            <LotesTab 
              lotes={lotes} 
              onRefresh={fetchLotes} 
              loading={lotesLoading} 
              onOpenDetails={fetchLoteDetails}
              selectedStatus={selectedLoteStatus}
              setSelectedStatus={setSelectedLoteStatus}
            />
          )}

          {/* VIEW: IGNORED ITEMS (PRODUTOS SUSPENSOS) */}
          {currentView === 'ignored_items' && (
            <div className="view-container animate-in fade-in duration-200">
              <div className="view-header text-left">
                <h2 className="view-title">Produtos Suspensos</h2>
                <p className="view-subtitle">
                  Produtos acabados (linhas de produtos) suspensos nas demandas e no painel de gerenciamento devido aos seus status configurados (ex: descontinuado, terceirizado).
                </p>
              </div>

              {/* Search Toolbar */}
              <div className="toolbar-section flex justify-between items-center gap-4 mt-6">
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
                          <th style={{ width: '50%' }}>Descrição</th>
                          <th style={{ width: '20%' }}>Linha</th>
                          <th style={{ width: '15%' }}>Status</th>
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

        </main>
      </div>

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
                  <strong>{launchingProduct.codigo} — {launchingProduct.descricao}</strong>
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

                    {/* TAB: FÓRMULA & INGREDIENTES */}
                    {detailsDrawerActiveTab === 'formula' && (
                      <div className="space-y-3 animate-in fade-in duration-150 text-left">
                        <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                          <Layers className="h-4 w-4 text-zinc-650" />
                          <h4 className="font-extrabold text-sm text-zinc-900">Fórmula & Ingredientes</h4>
                        </div>
                        {selectedProductDetails.formulation.length === 0 ? (
                          <p className="text-xs text-zinc-400 py-3">Nenhuma fórmula registrada para este produto.</p>
                        ) : (() => {
                          const rawMaterials = selectedProductDetails.formulation.filter(line => line.categoryId !== 'cat_emb');
                          const packaging = selectedProductDetails.formulation.filter(line => line.categoryId === 'cat_emb');

                          const renderTable = (list, title) => {
                            if (list.length === 0) return null;
                            return (
                              <div className="space-y-2">
                                <h5 className="font-extrabold text-[10px] text-zinc-450 uppercase tracking-wider">{title}</h5>
                                <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                                      <tr>
                                        <th className="px-4 py-3">Ingrediente</th>
                                        <th className="px-4 py-3 text-right">Qtd</th>
                                        <th className="px-4 py-3 text-right">Fórmula %</th>
                                        <th className="px-4 py-3 text-right">Estoque Insumo</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100">
                                      {list.map((line) => {
                                        const needsPercentage = line.percentage !== null && line.percentage !== undefined;
                                        const pctVal = needsPercentage ? line.percentage * 100 : 0;
                                        const isOutOfStock = (line.currentStock ?? 0) <= 0;

                                        return (
                                          <tr key={line.ingredientCode} className="hover:bg-zinc-50/50 transition-colors">
                                            <td className="px-4 py-2.5">
                                              <div className="font-bold text-zinc-800">{line.description}</div>
                                              <div className="font-mono text-[9px] text-zinc-400">{line.ingredientCode}</div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-medium text-zinc-700">
                                              {(line.quantity ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-zinc-550">
                                              {needsPercentage ? `${pctVal.toFixed(3)}%` : '-'}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                              <span
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                  isOutOfStock
                                                    ? 'bg-red-100 text-red-700 border border-red-200'
                                                    : 'bg-green-100 text-green-700 border border-green-200'
                                                }`}
                                              >
                                                {(line.currentStock ?? 0).toLocaleString('pt-BR')}
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
                            <div className="space-y-6">
                              {renderTable(rawMaterials, "Matérias-Primas")}
                              {renderTable(packaging, "Embalagens")}
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

        <AnimatePresence>
          {loteDetailsDrawerOpen && (
            <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop bg-black/60 backdrop-blur-sm"
              style={{ zIndex: 190 }}
              onClick={() => setLoteDetailsDrawerOpen(false)}
            />
            {/* Drawer container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-screen w-full max-w-3xl bg-white border-l border-zinc-200 shadow-2xl flex flex-col text-left text-zinc-800 font-sans"
              style={{ zIndex: 200 }}
            >
              {/* Header */}
              <div className="p-6 border-b border-zinc-150 flex items-center justify-between bg-zinc-50 shrink-0">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Análise Detalhada de Lote
                  </span>
                  <h3 className="font-extrabold text-zinc-900 text-lg mt-0.5 flex items-center gap-2">
                    Lote #{selectedLoteDetails?.lote_number || '...'}
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1.5">
                    <span className="font-bold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                      {selectedLoteDetails?.product_code}
                    </span>
                    <span className="text-zinc-400">•</span>
                    <span className="truncate max-w-md text-zinc-600">{selectedLoteDetails?.product_description}</span>
                  </p>
                </div>
                <button
                  onClick={() => setLoteDetailsDrawerOpen(false)}
                  className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-650 transition-colors cursor-pointer border border-zinc-200 bg-white shadow-sm"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sub-tab Navigation */}
              <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-150 flex gap-2 shrink-0">
                {[
                  { id: 'inicio', label: 'Início', icon: LayoutDashboard },
                  { id: 'pesagem', label: 'Pesagem', icon: Scale },
                  { id: 'envase', label: 'Envase', icon: Package },
                  { id: 'conferencia', label: 'Conferência', icon: FileText },
                ].map(t => {
                  const Icon = t.icon;
                  const isActive = loteActiveSubTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setLoteActiveSubTab(t.id)}
                      className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-zinc-900 text-white shadow-md' 
                          : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                      }`}
                    >
                      <Icon size={14} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
                {loteDetailsDrawerLoading ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
                    <RefreshCw className="h-8 w-8 animate-spin text-zinc-500" />
                    <span className="font-medium text-sm text-zinc-500">Analisando registros de estoque do lote...</span>
                  </div>
                ) : selectedLoteDetails ? (
                  <>
                    {/* TAB: INÍCIO */}
                    {loteActiveSubTab === 'inicio' && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
                        {/* Meta Cards Grid */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Status do Lote</span>
                            <div className="mt-1.5">
                              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                                selectedLoteDetails.status.toUpperCase() === 'EA' 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50'
                                  : selectedLoteDetails.status.toUpperCase() === 'CA'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                                  : 'bg-amber-50 text-amber-700 border-amber-200/50'
                              }`}>
                                {selectedLoteDetails.status_label}
                              </span>
                            </div>
                          </div>
                          
                          <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Data de Abertura</span>
                            <p className="text-sm font-bold text-zinc-800 mt-1">
                              {new Date(selectedLoteDetails.date.replace(' ', 'T')).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          
                          <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Operador (Pesagem/Prod)</span>
                            <p className="text-sm font-bold text-zinc-800 mt-1">
                              {selectedLoteDetails.fabricated_by || 'Não registrado'}
                            </p>
                          </div>

                          <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl shadow-sm text-left">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase block">Autorização (Liberação)</span>
                            <p className="text-sm font-bold text-zinc-800 mt-1">
                              {selectedLoteDetails.authorized_by || 'Não registrado'}
                            </p>
                          </div>
                        </div>

                        {/* Batch yields */}
                        <div className="bg-zinc-50 border border-zinc-150 p-5 rounded-xl space-y-4 shadow-sm">
                          <h4 className="font-extrabold text-sm text-zinc-900 border-b border-zinc-200 pb-2">Rendimento Geral do Lote</h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="text-left">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase block">Massa Teórica (Pesada)</span>
                              <p className="text-lg font-extrabold text-zinc-900 mt-0.5">{(selectedLoteDetails.pesagem_total_actual ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} Kg</p>
                            </div>
                            <div className="text-left">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase block">Massa Envasada (SKUs)</span>
                              <p className="text-lg font-extrabold text-zinc-900 mt-0.5">{(selectedLoteDetails.total_packaged_weight_kg ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} Kg</p>
                            </div>
                            <div className="text-left">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase block">Aproveitamento de Massa</span>
                              <p className={`text-lg font-extrabold mt-0.5 ${
                                selectedLoteDetails.bulk_yield_percentage >= 90.0 ? 'text-emerald-600' : 'text-amber-600'
                              }`}>
                                {selectedLoteDetails.bulk_yield_percentage.toFixed(2)}%
                              </p>
                            </div>
                          </div>

                          <div className="p-3.5 bg-white rounded-lg border border-zinc-200 text-xs text-zinc-500">
                            O lote registrou uma perda de <strong className="text-zinc-800 font-bold">{selectedLoteDetails.bulk_loss_kg.toFixed(3)} Kg</strong> de massa entre a pesagem de matérias-primas e a conferência final de envase.
                          </div>
                        </div>

                        {/* DESVIOS E RESOLUÇÃO */}
                        {(() => {
                          const hasYieldError = selectedLoteDetails.bulk_yield_percentage < 90.0;
                          const hasPesagemError = selectedLoteDetails.pesagem_items.some(item => item.status !== 'OK');
                          const hasEnvaseError = selectedLoteDetails.envase_products.some(p => p.packaging_items.some(item => item.status !== 'OK'));
                          const hasConfError = selectedLoteDetails.conferencia_items.some(item => item.status !== 'OK');
                          const hasErrors = hasYieldError || hasPesagemError || hasEnvaseError || hasConfError;

                          // Swap detection
                          const missingIngredients = selectedLoteDetails.pesagem_items.filter(item => item.status === 'MISSING');
                          const unplannedIngredients = selectedLoteDetails.pesagem_items.filter(item => item.status === 'UNPLANNED');
                          
                          const missingIng = missingIngredients[0];
                          const unplannedIng = unplannedIngredients[0];
                          const swapSuggestion = missingIng && unplannedIng ? {
                            expected: missingIng.ingredient_code,
                            expectedDesc: missingIng.description,
                            actual: unplannedIng.ingredient_code,
                            actualDesc: unplannedIng.description
                          } : null;

                          if (selectedLoteDetails.is_resolved) {
                            return (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3 text-left shadow-sm">
                                <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                  <span>Desvios Justificados e Aprovados</span>
                                </div>
                                <div className="text-xs text-zinc-700 font-medium space-y-1 bg-white p-3 rounded-lg border border-emerald-100">
                                  <p className="font-bold text-zinc-900">Justificativa:</p>
                                  <p className="italic">"{selectedLoteDetails.resolution_obs}"</p>
                                </div>
                                <button
                                  disabled={resolveLoteLoading}
                                  onClick={() => handleUndoResolveLoteErrors(selectedLoteDetails.lote_number)}
                                  className="text-xs text-rose-600 hover:text-rose-700 font-bold hover:underline cursor-pointer disabled:opacity-50"
                                >
                                  Estornar Justificativa (Reabrir Desvios)
                                </button>
                              </div>
                            );
                          }

                          if (!hasErrors) {
                            return (
                              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3 text-left">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-emerald-800">Lote sem desvios críticos</p>
                                  <p className="text-[10px] text-emerald-600 mt-0.5">Todos os parâmetros de pesagem, envase e rendimento estão dentro da tolerância esperada.</p>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 space-y-4 text-left shadow-sm">
                              <div className="flex items-center gap-2 text-rose-800 font-extrabold text-sm border-b border-zinc-250 pb-2">
                                <AlertTriangle className="h-4 w-4 text-rose-600" />
                                <span>Justificar Desvios do Lote</span>
                              </div>

                              <p className="text-[10px] text-zinc-500 font-medium">
                                Identificamos desvios de pesagem, envase ou rendimento neste lote. Registre uma justificativa para aprovar o lote com ressalvas.
                              </p>

                              {(() => {
                                const availableMissing = missingIngredients.filter(item => 
                                  !mappedSwaps.some(swap => swap.expectedCode === item.ingredient_code)
                                );
                                const availableUnplanned = unplannedIngredients.filter(item => 
                                  !mappedSwaps.some(swap => swap.actualCode === item.ingredient_code)
                                );

                                const handleAddSwap = () => {
                                  if (!selectedExpectedCode || !selectedActualCode) return;
                                  const expectedItem = missingIngredients.find(item => item.ingredient_code === selectedExpectedCode);
                                  const actualItem = unplannedIngredients.find(item => item.ingredient_code === selectedActualCode);
                                  if (expectedItem && actualItem) {
                                    setMappedSwaps([...mappedSwaps, {
                                      expectedCode: selectedExpectedCode,
                                      expectedDesc: expectedItem.description,
                                      actualCode: selectedActualCode,
                                      actualDesc: actualItem.description
                                    }]);
                                    setSelectedExpectedCode('');
                                    setSelectedActualCode('');
                                  }
                                };

                                return (
                                  <>
                                    {missingIngredients.length > 0 && unplannedIngredients.length > 0 && (
                                      <div className="bg-blue-50/80 border border-blue-200/50 rounded-xl p-3.5 space-y-3 shadow-sm">
                                        <div className="flex gap-2.5">
                                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex-shrink-0 mt-0.5 animate-pulse">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                          </div>
                                          <div className="text-xs text-blue-900 font-medium flex-1">
                                            <span className="font-extrabold block text-blue-950">Mapear Substituições de Insumos</span>
                                            Selecione um insumo planejado ausente e o respectivo substituto para vinculá-los:
                                          </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                          <div className="space-y-1">
                                            <label className="text-[10px] text-zinc-550 font-bold block">Insumo Planejado (Ausente)</label>
                                            <select
                                              value={selectedExpectedCode}
                                              onChange={(e) => setSelectedExpectedCode(e.target.value)}
                                              className="w-full text-xs border border-blue-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 bg-white font-medium"
                                            >
                                              <option value="">-- Selecione o Insumo --</option>
                                              {availableMissing.map(item => (
                                                <option key={item.ingredient_code} value={item.ingredient_code}>
                                                  {item.description} ({item.ingredient_code})
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          
                                          <div className="space-y-1">
                                            <label className="text-[10px] text-zinc-550 font-bold block">Insumo Utilizado (Substituto)</label>
                                            <select
                                              value={selectedActualCode}
                                              onChange={(e) => setSelectedActualCode(e.target.value)}
                                              className="w-full text-xs border border-blue-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500 bg-white font-medium"
                                            >
                                              <option value="">-- Selecione o Insumo --</option>
                                              {availableUnplanned.map(item => (
                                                <option key={item.ingredient_code} value={item.ingredient_code}>
                                                  {item.description} ({item.ingredient_code})
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          disabled={!selectedExpectedCode || !selectedActualCode}
                                          onClick={handleAddSwap}
                                          className="w-full py-1.5 bg-blue-600 hover:bg-blue-750 text-white rounded-lg text-[10px] font-bold shadow-sm disabled:opacity-50 cursor-pointer transition-all"
                                        >
                                          + Vincular Substituição
                                        </button>

                                        {mappedSwaps.length > 0 && (
                                          <div className="space-y-1.5 mt-2 bg-white rounded-lg border border-blue-100 p-2.5">
                                            <span className="text-[9px] text-zinc-400 font-extrabold uppercase block">Substituições Vinculadas neste Lote:</span>
                                            <div className="space-y-1">
                                              {mappedSwaps.map((swap, idx) => (
                                                <div key={idx} className="flex justify-between items-center bg-zinc-50 border border-zinc-200 rounded-md p-1.5 text-[10px]">
                                                  <div className="font-medium text-zinc-700 flex items-center gap-1.5 flex-1 truncate">
                                                    <span className="font-bold text-zinc-900 truncate max-w-[100px]" title={swap.expectedDesc}>{swap.expectedDesc}</span>
                                                    <span className="text-zinc-400">➡️</span>
                                                    <span className="font-bold text-zinc-900 truncate max-w-[100px]" title={swap.actualDesc}>{swap.actualDesc}</span>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setMappedSwaps(mappedSwaps.filter((_, i) => i !== idx));
                                                    }}
                                                    className="text-rose-550 hover:text-rose-700 font-bold ml-2 cursor-pointer"
                                                  >
                                                    Remover
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        <label className="flex items-center gap-2 bg-white border border-blue-200 rounded-lg p-2.5 cursor-pointer text-[10px] font-bold text-zinc-700 select-none shadow-sm mt-2">
                                          <input
                                            type="checkbox"
                                            checked={associateSwapSimilar}
                                            onChange={(e) => setAssociateSwapSimilar(e.target.checked)}
                                            className="accent-blue-600 rounded"
                                          />
                                          Cadastrar substituições vinculadas como insumos semelhantes (não alertar nas próximas produções)
                                        </label>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}

                              <div className="space-y-1.5">
                                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Justificativa / Observação</label>
                                <textarea
                                  value={resolutionObs}
                                  onChange={(e) => setResolutionObs(e.target.value)}
                                  placeholder="Digite a justificativa dos desvios observados..."
                                  rows="3"
                                  className="w-full text-xs border border-zinc-300 rounded-xl p-3 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-medium shadow-inner"
                                />
                              </div>

                              <button
                                onClick={() => handleResolveLoteErrors(selectedLoteDetails.lote_number)}
                                disabled={resolveLoteLoading || !resolutionObs.trim()}
                                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                              >
                                {resolveLoteLoading ? (
                                  <>
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    Processando...
                                  </>
                                ) : (
                                  "Resolver Desvios e Aprovar Lote"
                                )}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* TAB: PESAGEM */}
                    {loteActiveSubTab === 'pesagem' && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                        <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
                          <div>
                            <h4 className="font-extrabold text-sm text-zinc-900">Ficha de Pesagem de Matérias-Primas</h4>
                            <p className="text-[10px] text-zinc-500 mt-0.5">Comparativo do previsto em formulação vs o real lançado pelas baixas no lote.</p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase">Total Pesado</span>
                            <p className="text-sm font-extrabold text-zinc-900">{(selectedLoteDetails.pesagem_total_actual ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} Kg</p>
                          </div>
                        </div>

                        <div className="bg-white border border-zinc-150 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                              <tr>
                                <th className="px-4 py-3">Insumo</th>
                                <th className="px-4 py-3 text-right">Previsto</th>
                                <th className="px-4 py-3 text-right">Pesado</th>
                                <th className="px-4 py-3 text-right">Desvio</th>
                                <th className="px-4 py-3 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {selectedLoteDetails.pesagem_items.map((item) => (
                                <tr key={item.ingredient_code} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-3">
                                    <div className="font-bold text-zinc-800">{item.description}</div>
                                    <div className="text-[9px] text-zinc-400 font-mono mt-0.5">{item.ingredient_code}</div>
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium text-zinc-500 font-mono">
                                    {(item.expected_qty ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} Kg
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-zinc-900 font-mono">
                                    {(item.actual_qty ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} Kg
                                  </td>
                                  <td className={`px-4 py-3 text-right font-bold font-mono ${
                                    Math.abs(item.difference ?? 0) < 0.0001 ? 'text-zinc-500' :
                                    (item.difference ?? 0) > 0.0 ? 'text-emerald-600' : 'text-rose-600'
                                  }`}>
                                    {(item.difference ?? 0) > 0.0 ? '+' : ''}{(item.difference ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} Kg
                                    {item.expected_qty > 0.0 && (
                                      <span className="text-[9px] font-normal block opacity-80 mt-0.5">
                                        ({item.percentage_diff > 0.0 ? '+' : ''}{item.percentage_diff.toFixed(1)}%)
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                                      item.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                                      item.status === 'MISSING' ? 'bg-rose-50 text-rose-700 border-rose-200/50' :
                                      item.status === 'EXTRA' ? 'bg-blue-50 text-blue-700 border-blue-200/50' :
                                      'bg-amber-50 text-amber-700 border-amber-200/50'
                                    }`}>
                                      {item.status === 'OK' ? 'OK' : 
                                       item.status === 'MISSING' ? 'Faltando' :
                                       item.status === 'EXTRA' ? 'Extra' : 'Desvio'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* TAB: ENVASE */}
                    {loteActiveSubTab === 'envase' && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
                        {selectedLoteDetails.envase_products.map((prod) => (
                          <div key={prod.product_code} className="space-y-3 bg-zinc-50/50 border border-zinc-150 p-4 rounded-xl shadow-sm">
                            <div className="flex justify-between items-center border-b border-zinc-150 pb-2">
                              <div>
                                <h4 className="font-extrabold text-sm text-zinc-850">{prod.description}</h4>
                                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Código: {prod.product_code} | Embalagem Unitária: {prod.unit_weight_kg * 1000}g</p>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-zinc-400 font-bold uppercase">Unidades Envasadas</span>
                                <p className="text-sm font-extrabold text-zinc-900">{(prod.actual_units_envasadas ?? 0).toLocaleString('pt-BR')} un</p>
                              </div>
                            </div>

                            {!prod.has_packaging_formula ? (
                              <div className="flex items-center gap-3 bg-blue-50/80 border border-blue-200/60 rounded-xl px-4 py-3.5">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100/80 text-blue-600 flex-shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-blue-800">Nenhuma embalagem cadastrada</p>
                                  <p className="text-[10px] text-blue-600 mt-0.5">Este produto não possui embalagens registradas na formulação. Não foi feita baixa de embalagens.</p>
                                </div>
                              </div>
                            ) : prod.packaging_items.length === 0 ? (
                              <div className="flex items-center gap-3 bg-amber-50/80 border border-amber-200/60 rounded-xl px-4 py-3.5">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100/80 text-amber-600 flex-shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-amber-800">Sem movimentação de embalagens</p>
                                  <p className="text-[10px] text-amber-600 mt-0.5">Embalagens estão cadastradas na formulação, mas nenhuma saída foi registrada neste lote.</p>
                                </div>
                              </div>
                            ) : (
                            <div className="overflow-hidden rounded-lg border border-zinc-150 bg-white shadow-sm">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                                  <tr>
                                    <th className="px-4 py-2.5">Insumo Embalagem</th>
                                    <th className="px-4 py-2.5 text-right">Previsto</th>
                                    <th className="px-4 py-2.5 text-right">Consumido</th>
                                    <th className="px-4 py-2.5 text-right">Diferença</th>
                                    <th className="px-4 py-2.5 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {prod.packaging_items.map((item) => (
                                    <tr key={item.packaging_code} className="hover:bg-zinc-50/50 transition-colors">
                                      <td className="px-4 py-2.5">
                                        <div className="font-bold text-zinc-800">{item.description}</div>
                                        <div className="text-[9px] text-zinc-400 font-mono mt-0.5">{item.packaging_code}</div>
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-semibold text-zinc-500 font-mono">
                                        {(item.expected_qty ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-bold text-zinc-900 font-mono">
                                        {(item.actual_qty ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                      </td>
                                      <td className={`px-4 py-2.5 text-right font-bold font-mono ${
                                        Math.abs(item.difference ?? 0) < 0.01 ? 'text-zinc-500' :
                                        (item.difference ?? 0) > 0.0 ? 'text-emerald-600' : 'text-rose-600'
                                      }`}>
                                        {(item.difference ?? 0) > 0.0 ? '+' : ''}{(item.difference ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-4 py-2.5 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                                          item.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                                          item.status === 'MISSING' ? 'bg-rose-50 text-rose-700 border-rose-200/50' :
                                          'bg-amber-50 text-amber-700 border-amber-200/50'
                                        }`}>
                                          {item.status === 'OK' ? 'OK' : item.status === 'MISSING' ? 'Ausente' : 'Desvio'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* TAB: CONFERÊNCIA */}
                    {loteActiveSubTab === 'conferencia' && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                        <div className="border-b border-zinc-200 pb-3">
                          <h4 className="font-extrabold text-sm text-zinc-900">Conferência de Finalização do Lote</h4>
                          <p className="text-[10px] text-zinc-500 mt-0.5">Validação das unidades envasadas (menos 1 para retém) versus o saldo lançado em Estoque Atualizado (EA).</p>
                        </div>

                        {selectedLoteDetails.status.toUpperCase() !== 'EA' && (
                          <div className="flex items-center gap-3 bg-blue-50/80 border border-blue-200/60 rounded-xl px-4 py-3.5">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100/80 text-blue-600 flex-shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-blue-800">Lote em aberto — Status: {selectedLoteDetails.status_label}</p>
                              <p className="text-[10px] text-blue-600 mt-0.5">A conferência de estoque só é possível após a finalização do lote (status EA — Estoque Atualizado). As colunas de lançamento no estoque e discrepância não se aplicam neste momento.</p>
                            </div>
                          </div>
                        )}

                        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 font-bold text-zinc-500 border-b border-zinc-150">
                              <tr>
                                <th className="px-4 py-3">Produto</th>
                                <th className="px-4 py-3 text-right">Envasados (Frascos)</th>
                                <th className="px-4 py-3 text-right">Previsto Final (F-1)</th>
                                {selectedLoteDetails.status.toUpperCase() === 'EA' && (
                                  <>
                                    <th className="px-4 py-3 text-right">Lançado no Estoque</th>
                                    <th className="px-4 py-3 text-right">Discrepância</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {selectedLoteDetails?.conferencia_items.map((item) => (
                                <tr key={item.product_code} className="hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-3">
                                    <div className="font-bold text-zinc-800">{item.description}</div>
                                    <div className="text-[9px] text-zinc-400 font-mono mt-0.5">{item.product_code}</div>
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-zinc-550 font-mono">
                                    {(item.actual_units_envasadas ?? 0).toLocaleString('pt-BR')} un
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-zinc-900 font-mono">
                                    {(item.expected_finalized_units ?? 0).toLocaleString('pt-BR')} un
                                  </td>
                                  {selectedLoteDetails?.status.toUpperCase() === 'EA' && (
                                    <>
                                      <td className="px-4 py-3 text-right font-bold text-zinc-900 font-mono">
                                        {(item.registered_units_stock ?? 0).toLocaleString('pt-BR')} un
                                      </td>
                                      <td className={`px-4 py-3 text-right font-bold font-mono ${
                                        (item.discrepancy ?? 0) == 0.0 ? 'text-zinc-500' : 'text-rose-600'
                                      }`}>
                                        {(item.discrepancy ?? 0) > 0.0 ? '+' : ''}{(item.discrepancy ?? 0).toLocaleString('pt-BR')} un
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                                          item.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border-emerald-250/50' :
                                          'bg-rose-50 text-rose-700 border-rose-250/50'
                                        }`}>
                                          {item.status === 'OK' ? 'Aprovado' : 'Discrepante'}
                                        </span>
                                      </td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="p-4 bg-amber-50/20 border border-amber-100 rounded-xl space-y-2 text-xs">
                          <h5 className="font-bold text-amber-800">Regra de Fechamento de Lote (Antigo ERP):</h5>
                          <ul className="list-disc pl-4 space-y-1 text-zinc-650">
                            <li>O operador registra o envase total (quantidade de frascos consumidos).</li>
                            <li><strong>Retém Amostra</strong>: 1 unidade do lote deve ficar retida em laboratório (retém).</li>
                            <li>O estoque lançado no sistema (EA) deve ser exatamente igual a <strong className="text-zinc-850 font-bold">Quantidade Envasada - 1</strong>.</li>
                            <li>Qualquer desvio nesta contagem indica que o operador errou na digitação final ou que amostras de retém não foram contabilizadas corretamente.</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-zinc-500">
                    Ocorreu um erro ao carregar os dados analíticos do lote.
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
    </div>
  );
}
