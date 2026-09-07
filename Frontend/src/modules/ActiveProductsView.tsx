import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Search, CheckCircle2, RefreshCw, X, ShieldAlert,
  Edit, Info, Check, Filter, Layers, ListFilter, AlertTriangle, HelpCircle,
  Database, Trash2, Plus, Loader2, Settings, Rocket, GraduationCap, UploadCloud
} from 'lucide-react';
import { cn, API_BASE, apiFetch } from '../lib/utils';
import { Category, PRODUCT_LINE_STATUSES, GraduationCandidate } from '../types';
import { api } from '../lib/api';
import { showToast, confirmDialog } from '../components/shared/feedback';


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
  estoque_ideal_mult: number;
  abrir_ordem_mult: number;
  abrir_prod_mult: number;
  fator_seguranca_z: number;
  visivel: number | null;
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
  const [selectedOverrideCodes, setSelectedOverrideCodes] = useState<Set<string>>(new Set());

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
  const [lancamentoMetaForm, setLancamentoMetaForm] = useState('6');
  const [lancamentoDataInicioForm, setLancamentoDataInicioForm] = useState('');
  const [graduationCandidates, setGraduationCandidates] = useState<GraduationCandidate[]>([]);

  // Bulk actions state
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkLine, setBulkLine] = useState('');
  const [bulkObs, setBulkObs] = useState('');

  const [activeAtivosTab, setActiveAtivosTab] = useState<'status' | 'linhas' | 'kits' | 'overrides' | 'configuracoes'>('status');

  // Kits Composition state
  const [kitComposicao, setKitComposicao] = useState<any[]>([]);
  const [kitCompNewKit, setKitCompNewKit] = useState('');
  const [kitCompNewComp, setKitCompNewComp] = useState('');
  const [kitCompNewQty, setKitCompNewQty] = useState(1);
  const [kitCompSearch, setKitCompSearch] = useState('');
  const [uploadingKitsConfig, setUploadingKitsConfig] = useState(false);

  // Reset selections when active tab changes
  useEffect(() => {
    setSelectedCodes(new Set());
    setSelectedOverrideCodes(new Set());
  }, [activeAtivosTab]);

  // Line Prefix Config CRUD states
  const [editingLineConfig, setEditingLineConfig] = useState<LineConfig | null>(null);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [linePrefixForm, setLinePrefixForm] = useState('');
  const [lineNameForm, setLineNameForm] = useState('');
  const [idealMultForm, setIdealMultForm] = useState('3.0');
  const [ordemMultForm, setOrdemMultForm] = useState('1.5');
  const [prodMultForm, setProdMultForm] = useState('1.0');
  const [fatorZForm, setFatorZForm] = useState('1.65');
  const [visibleLineForm, setVisibleLineForm] = useState('1');
  const [lineFormError, setLineFormError] = useState<string | null>(null);
  const [lineSaving, setLineSaving] = useState(false);

  // Overrides Audit states
  const [allOverrides, setAllOverrides] = useState<ProductOverride[]>([]);

  // Category & Ignored status configuration states
  const [categories, setCategories] = useState<Category[]>([]);
  const [configNewCatName, setConfigNewCatName] = useState('');
  const [configNewCatParent, setConfigNewCatParent] = useState('');
  const [configIgnoredStatuses, setConfigIgnoredStatuses] = useState<string[]>([]);
  const [globalDiasComerciais, setGlobalDiasComerciais] = useState('22');
  const [globalLimitPerPage, setGlobalLimitPerPage] = useState('30');
  const [globalLancamentoMeta, setGlobalLancamentoMeta] = useState('6');
  const [globalSettingsSaving, setGlobalSettingsSaving] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatParent, setEditCatParent] = useState('');
  const [configSubTab, setConfigSubTab] = useState<'parametros' | 'status' | 'categorias'>('parametros');

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodsRes, confRes, ovrRes, catsData, ignoredRes, gradRes, kitsRes, diasRes, limitRes, metaGlobalRes] = await Promise.all([
        apiFetch(`${API_BASE}/products?limit=5000&show_hidden=true`),
        apiFetch(`${API_BASE}/configs`),
        apiFetch(`${API_BASE}/overrides`),
        api.getCategories(),
        apiFetch(`${API_BASE}/settings/ignored_product_statuses`),
        apiFetch(`${API_BASE}/lancamento/graduation-check`),
        apiFetch(`${API_BASE}/kits/composicao`),
        apiFetch(`${API_BASE}/settings/dias_comerciais`),
        apiFetch(`${API_BASE}/settings/limit_per_page`),
        apiFetch(`${API_BASE}/settings/lancamento_meta_meses_global`)
      ]);
      
      if (prodsRes.ok && confRes.ok && ovrRes.ok) {
        const prodsData = await prodsRes.json();
        const confsData = await confRes.json();
        const overridesData = await ovrRes.json();
        setProducts(prodsData.items || []);
        setConfigs(confsData || []);
        setAllOverrides(overridesData || []);
        setCategories(catsData || []);
        
        if (gradRes.ok) {
          const gradData = await gradRes.json();
          setGraduationCandidates(gradData || []);
        }

        if (kitsRes.ok) {
          const kitsData = await kitsRes.json();
          setKitComposicao(kitsData || []);
        }

        if (diasRes.ok) {
          const d = await diasRes.json();
          if (d && d.value) setGlobalDiasComerciais(d.value);
        }
        if (limitRes.ok) {
          const l = await limitRes.json();
          if (l && l.value) setGlobalLimitPerPage(l.value);
        }
        if (metaGlobalRes.ok) {
          const m = await metaGlobalRes.json();
          if (m && m.value) setGlobalLancamentoMeta(m.value);
        }

        let ignoredList = ['descontinuado', 'terceirizado'];
        if (ignoredRes.ok) {
          try {
            const data = await ignoredRes.json();
            if (data && typeof data.value === 'string') {
              ignoredList = JSON.parse(data.value);
            }
          } catch (e) {
            console.error("Erro ao fazer parse dos status suspensos:", e);
          }
        }
        setConfigIgnoredStatuses(ignoredList);
      }
    } catch (e) {
      console.error("Erro ao carregar dados de produtos ativos:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalSettingsSaving(true);
    try {
      const responses = await Promise.all([
        apiFetch(`${API_BASE}/settings/dias_comerciais`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: globalDiasComerciais })
        }),
        apiFetch(`${API_BASE}/settings/limit_per_page`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: globalLimitPerPage })
        }),
        apiFetch(`${API_BASE}/settings/lancamento_meta_meses_global`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: globalLancamentoMeta })
        })
      ]);
      if (responses.every(r => r.ok)) {
        showToast("Configurações globais salvas com sucesso!", 'success');
        await loadData();
      } else {
        showToast("Erro ao salvar algumas configurações.", 'error');
      }
    } catch (e) {
      console.error(e);
      showToast("Erro de conexão ao salvar.", 'error');
    } finally {
      setGlobalSettingsSaving(false);
    }
  };

  const fetchKitComposicao = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/kits/composicao`);
      if (res.ok) setKitComposicao(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddKitComposicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kitCompNewKit.trim() || !kitCompNewComp.trim()) return;
    try {
      const res = await apiFetch(`${API_BASE}/kits/composicao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          kit_codigo: kitCompNewKit.trim(), 
          componente_codigo: kitCompNewComp.trim(),
          quantidade: kitCompNewQty
        })
      });
      if (res.ok) {
        setKitCompNewKit('');
        setKitCompNewComp('');
        setKitCompNewQty(1);
        await fetchKitComposicao();
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao adicionar kit.', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Erro de conexão.', 'error');
    }
  };

  const handleDeleteKitComposicao = async (kit: string, comp: string) => {
    if (!await confirmDialog(`Remover componente ${comp} do kit ${kit}?`, { variant: 'danger' })) return;
    try {
      const res = await apiFetch(`${API_BASE}/kits/composicao/${kit}/${comp}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchKitComposicao();
      } else {
        showToast('Erro ao excluir relação.', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Erro de conexão.', 'error');
    }
  };

  const handleUploadKitsConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingKitsConfig(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch(`${API_BASE}/kits/composicao/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        await fetchKitComposicao();
        await loadData();
      } else {
        showToast(data.error || 'Erro ao importar.', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Erro de conexão.', 'error');
    } finally {
      setUploadingKitsConfig(false);
      e.target.value = '';
    }
  };

  const handleGraduateAll = async () => {
    if (graduationCandidates.length === 0) return;
    if (!await confirmDialog(`Graduar todos os ${graduationCandidates.length} candidatos para o status "Ativa"?`, { variant: 'default' })) return;
    setLoading(true);
    try {
      const codes = graduationCandidates.map(c => c.codigo);
      const res = await apiFetch(`${API_BASE}/overrides/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigos: codes,
          action: 'set_status',
          value_str: 'ativo'
        }),
      });

      if (res.ok) {
        await loadData();
      } else {
        showToast("Erro ao graduar produtos em lote.", 'error');
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao graduar produtos em lote.", 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered Products
  const isCategoryMatch = (prodCat: string | null, filterCat: string) => {
    if (filterCat === 'ALL') return true;
    if (filterCat === 'Sem Categoria') return !prodCat;
    if (!prodCat) return false;
    if (prodCat === filterCat) return true;
    
    // Check if parent category matches
    const cat = categories.find(c => c.id === prodCat);
    if (cat && cat.parentId === filterCat) return true;
    
    return false;
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        (p.descricao || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.codigo || '').toLowerCase().includes(search.toLowerCase());
      
      const resolvedStatus = p.status_produto || 'ativo';
      const matchesStatus = statusFilter === 'ALL' || resolvedStatus === statusFilter;
      
      const resolvedLine = p.linha_prefix_manual || p.linha_prefix;
      const matchesLine = lineFilter === 'ALL' || resolvedLine === lineFilter;

      const matchesCategory = isCategoryMatch(p.categoria_produto, categoryFilter);

      return matchesSearch && matchesStatus && matchesLine && matchesCategory;
    });
  }, [products, search, statusFilter, lineFilter, categoryFilter, categories]);

  // Group categories by parent category
  const groupedCategories = useMemo(() => {
    const roots = categories.filter(c => c.parentId === null);
    const subMap: Record<string, Category[]> = {};
    categories.forEach(c => {
      if (c.parentId) {
        if (!subMap[c.parentId]) subMap[c.parentId] = [];
        subMap[c.parentId].push(c);
      }
    });
    return roots.map(r => ({
      root: r,
      subs: subMap[r.id] || []
    }));
  }, [categories]);

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
      const res = await apiFetch(`${API_BASE}/overrides`);
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

          setLancamentoMetaForm(override.lancamento_meta_meses?.toString() || '6');
          setLancamentoDataInicioForm(override.lancamento_data_inicio || '');
          if (override.visivel === 0) setVisibleOverride('0');
          else setVisibleOverride('1');
        } else {
          // Clear overrides inputs
          setIdealStockOverride('');
          setSalesOverride('');
          setOrdersOverride('');
          setIsLaunchOverride('AUTO');
          setLancamentoMetaForm('6');
          setLancamentoDataInicioForm('');
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
      const ovr = {
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
        lancamento_meta_meses: statusForm === 'lancamento' ? parseInt(lancamentoMetaForm, 10) || 6 : null,
        lancamento_data_inicio: statusForm === 'lancamento' ? (lancamentoDataInicioForm.trim() || new Date().toISOString().split('T')[0]) : null,
      };

      const res = await apiFetch(`${API_BASE}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ovr),
      });

      if (res.ok) {
        setSelectedProduct(null);
        await loadData();
      } else {
        showToast("Erro ao salvar configurações do produto.", 'error');
      }
    } catch (e) {
      console.error(e);
      showToast("Erro de conexão ao salvar.", 'error');
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

      const res = await apiFetch(`${API_BASE}/overrides/bulk`, {
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
        showToast("Erro ao aplicar alteração em lote.", 'error');
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao processar alteração em lote.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLineModal = (cfg: LineConfig | null = null) => {
    setEditingLineConfig(cfg);
    setLineFormError(null);
    if (cfg) {
      setLinePrefixForm(cfg.linha_prefix);
      setLineNameForm(cfg.nome_linha);
      setIdealMultForm(cfg.estoque_ideal_mult.toString());
      setOrdemMultForm(cfg.abrir_ordem_mult.toString());
      setProdMultForm(cfg.abrir_prod_mult.toString());
      setFatorZForm(cfg.fator_seguranca_z.toString());
      setVisibleLineForm(cfg.visivel === 0 ? '0' : '1');
    } else {
      setLinePrefixForm('');
      setLineNameForm('');
      setIdealMultForm('3.0');
      setOrdemMultForm('1.5');
      setProdMultForm('1.0');
      setFatorZForm('1.65');
      setVisibleLineForm('1');
    }
    setIsLineModalOpen(true);
  };

  const handleSaveLineConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linePrefixForm.trim() || !lineNameForm.trim()) {
      setLineFormError("Prefixo e Nome da Linha são obrigatórios.");
      return;
    }
    setLineSaving(true);
    setLineFormError(null);
    try {
      const cfg: LineConfig = {
        linha_prefix: linePrefixForm.trim(),
        nome_linha: lineNameForm.trim(),
        estoque_ideal_mult: parseFloat(idealMultForm) || 3.0,
        abrir_ordem_mult: parseFloat(ordemMultForm) || 1.5,
        abrir_prod_mult: parseFloat(prodMultForm) || 1.0,
        fator_seguranca_z: parseFloat(fatorZForm) || 1.65,
        visivel: visibleLineForm === '0' ? 0 : 1
      };
      const res = await apiFetch(`${API_BASE}/configs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (res.ok) {
        setIsLineModalOpen(false);
        await loadData();
      } else {
        const errData = await res.json();
        setLineFormError(errData.error || "Erro ao salvar a configuração de linha.");
      }
    } catch (err) {
      console.error(err);
      setLineFormError("Falha de conexão ao salvar.");
    } finally {
      setLineSaving(false);
    }
  };

  const handleDeleteLineConfig = async (prefix: string) => {
    if (prefix === 'DEFAULT') {
      showToast("A linha DEFAULT não pode ser excluída.", 'error');
      return;
    }
    if (!await confirmDialog(`Tem certeza que deseja excluir as regras para a linha com prefixo "${prefix}"?`, { variant: 'danger' })) {
      return;
    }
    try {
      const res = await apiFetch(`${API_BASE}/configs/${prefix}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await loadData();
      } else {
        const errData = await res.json();
        showToast(errData.error || "Erro ao excluir.", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Falha de conexão ao excluir.", 'error');
    }
  };

  const handleClearOverride = async (code: string) => {
    if (!await confirmDialog(`Remover todas as configurações manuais do produto "${code}"?`, { variant: 'danger' })) {
      return;
    }
    try {
      const ovr: ProductOverride = {
        codigo: code,
        estoque_ideal_manual: null,
        pedidos_manual: null,
        media_manual: null,
        is_lancamento_manual: null,
        visivel: null,
        observacao: null,
        linha_prefix_manual: null,
        status_produto: null,
        categoria_produto: null
      };
      const res = await apiFetch(`${API_BASE}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ovr)
      });
      if (res.ok) {
        await loadData();
      } else {
        showToast("Erro ao remover configurações.", 'error');
      }
    } catch (e) {
      console.error(e);
      showToast("Erro de conexão.", 'error');
    }
  };

  const handleClearOverridesBulk = async () => {
    if (selectedOverrideCodes.size === 0) return;
    if (!await confirmDialog(`Remover todas as configurações manuais dos ${selectedOverrideCodes.size} produtos selecionados?`, { variant: 'danger' })) {
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/overrides/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigos: Array.from(selectedOverrideCodes),
          action: 'clear',
          value_str: null
        })
      });
      if (res.ok) {
        setSelectedOverrideCodes(new Set());
        await loadData();
      } else {
        showToast("Erro ao remover configurações em lote.", 'error');
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao processar remoção em lote.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configNewCatName.trim()) return;

    try {
      const newCat: Category = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        name: configNewCatName.trim(),
        parentId: configNewCatParent || null,
      };
      await api.saveCategory(newCat);
      setConfigNewCatName('');
      setConfigNewCatParent('');
      const catsData = await api.getCategories();
      setCategories(catsData || []);
    } catch (e) {
      console.error(e);
      showToast("Erro ao salvar categoria", 'error');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!await confirmDialog("Tem certeza que deseja excluir esta categoria?", { variant: 'danger' })) return;
    try {
      await api.deleteCategory(id);
      const catsData = await api.getCategories();
      setCategories(catsData || []);
    } catch (e) {
      console.error(e);
      showToast("Erro ao excluir categoria", 'error');
    }
  };

  const handleToggleIgnoredStatus = async (status: string) => {
    const isIgnored = configIgnoredStatuses.includes(status);
    const updated = isIgnored 
      ? configIgnoredStatuses.filter(s => s !== status)
      : [...configIgnoredStatuses, status];
    
    setConfigIgnoredStatuses(updated);
    
    try {
      await apiFetch(`${API_BASE}/settings/ignored_product_statuses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(updated) })
      });
    } catch (e) {
      console.error(e);
      showToast("Erro ao salvar status ignorados", 'error');
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string | null) => {
    const statusVal = status || 'ativo';
    const styles: Record<string, string> = {
      ativo: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      lancamento: 'bg-sky-50 text-sky-700 border-sky-100',
      saindo_de_linha: 'bg-amber-50 text-amber-700 border-amber-100',
      descontinuado: 'bg-rose-50 text-rose-700 border-rose-100',
      terceirizado: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      bases: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    };

    const labels: Record<string, string> = {
      ativo: 'Ativa',
      lancamento: 'Lançamento',
      saindo_de_linha: 'Saindo de Linha',
      descontinuado: 'Saiu de Linha',
      terceirizado: 'Terceirizado',
      bases: 'Bases',
    };

    const icons: Record<string, string> = {
      ativo: '✅',
      lancamento: '🚀',
      saindo_de_linha: '⚠️',
      descontinuado: '🚫',
      terceirizado: '🏭',
      bases: '🧪',
    };

    return (
      <span className={cn("px-2 py-0.5 border text-[11px] font-bold rounded-full", styles[statusVal] || styles.ativo)}>
        {icons[statusVal] || ''} {labels[statusVal] || labels.ativo}
      </span>
    );
  };

  const getCategoryName = (catId: string | null) => {
    if (!catId) return 'Nenhuma';
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.name : catId;
  };

  const getKitNamePreview = () => {
    if (!kitCompNewKit.trim()) return '';
    const cleaned = kitCompNewKit.trim().replace(/['"]/g, '').toLowerCase();
    const found = products.find(p => (p.codigo || '').replace(/['"]/g, '').trim().toLowerCase() === cleaned);
    return found ? found.descricao : 'Produto não encontrado no estoque';
  };

  const getCompNamePreview = () => {
    if (!kitCompNewComp.trim()) return '';
    const cleaned = kitCompNewComp.trim().replace(/['"]/g, '').toLowerCase();
    const found = products.find(p => (p.codigo || '').replace(/['"]/g, '').trim().toLowerCase() === cleaned);
    return found ? found.descricao : 'Produto não encontrado no estoque';
  };

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden w-full">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        {/* Header */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-zinc-900 text-white p-2 rounded-xl shadow-sm">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase">
              Linha de Produtos
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
        <div className="p-2 border-b border-zinc-100 space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Painel Ativos
          </div>
          <button
            onClick={() => setActiveAtivosTab('status')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
              activeAtivosTab === 'status' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
            Status dos Produtos
          </button>
          <button
            onClick={() => setActiveAtivosTab('linhas')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
              activeAtivosTab === 'linhas' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <Layers className="h-4 w-4" />
            Definição de Linhas
          </button>
          <button
            onClick={() => setActiveAtivosTab('kits')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
              activeAtivosTab === 'kits' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <Database className="h-4 w-4" />
            Composição de Kits
          </button>
          <button
            onClick={() => setActiveAtivosTab('overrides')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
              activeAtivosTab === 'overrides' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <ShieldAlert className="h-4 w-4 text-rose-500" />
            Audit de Overrides
          </button>
          <button
            onClick={() => setActiveAtivosTab('configuracoes')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
              activeAtivosTab === 'configuracoes' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <Settings className="h-4 w-4" />
            Configurações
          </button>
        </div>

        {/* Sidebar Info/Stats */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-zinc-50 rounded-xl p-4 space-y-3 border border-zinc-100">
            <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Status & Linhas</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Monitore a visibilidade dos produtos no planejamento, configure multiplicadores de estoque por linha de vendas, e gerencie status individuais.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Produtos Totais</span>
              <span className="text-sm font-extrabold text-zinc-900">{products.length}</span>
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Linhas de Venda</span>
              <span className="text-sm font-extrabold text-zinc-900">{configs.length}</span>
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] text-zinc-400 font-bold uppercase">Overrides Ativos</span>
              <span className="text-sm font-extrabold text-amber-600">{allOverrides.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8 shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">
              {activeAtivosTab === 'status' && 'Status dos Produtos'}
              {activeAtivosTab === 'linhas' && 'Definição de Linhas'}
              {activeAtivosTab === 'kits' && 'Composição de Kits Comerciais'}
              {activeAtivosTab === 'overrides' && 'Audit de Overrides'}
              {activeAtivosTab === 'configuracoes' && 'Configurações'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {activeAtivosTab === 'status' && 'Configure status, categorias e regras individuais por produto acabado.'}
              {activeAtivosTab === 'linhas' && 'Gerencie multiplicadores de estoque ideal e segurança para cada linha.'}
              {activeAtivosTab === 'kits' && 'Gerencie a relação entre os kits comerciais e seus componentes individuais.'}
              {activeAtivosTab === 'overrides' && 'Visualize todos os overrides manuais ativos e limpe-os de forma centralizada.'}
              {activeAtivosTab === 'configuracoes' && 'Gerencie categorias, subcategorias e status ignorados.'}
            </p>
          </div>
          <button 
            onClick={loadData}
            className="p-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-zinc-600 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 flex flex-col">
          {activeAtivosTab === 'status' && (
            <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
              {/* Graduation Candidates Banner */}
              {graduationCandidates.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-white flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 shadow-lg animate-in slide-in-from-top-4 duration-350">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-zinc-800 rounded-xl">
                      <GraduationCap className="h-6 w-6 text-amber-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Graduação de Lançamentos</h4>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {graduationCandidates.length} produto{graduationCandidates.length > 1 ? 's lançados já atingiram' : ' lançado já atingiu'} a meta de meses de giro histórico e pode{graduationCandidates.length > 1 ? 'm' : ''} ser graduado{graduationCandidates.length > 1 ? 's' : ''} para Ativa.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleGraduateAll}
                      className="px-3.5 py-2 bg-white text-zinc-900 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      Graduar Todos em Lote
                    </button>
                  </div>
                </div>
              )}
              {/* Filtering and Search Header */}
              <div className="bg-white p-4 border border-zinc-200 rounded-2xl shadow-sm space-y-3 shrink-0">
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
                      <option value="ativo">✅ Ativa</option>
                      <option value="lancamento">🚀 Lançamento</option>
                      <option value="saindo_de_linha">⚠️ Saindo de Linha</option>
                      <option value="descontinuado">🚫 Saiu de Linha</option>
                      <option value="terceirizado">🏭 Terceirizado</option>
                      <option value="bases">🧪 Bases</option>
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
                    <span className="text-zinc-400">Categoria:</span>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="bg-transparent border-none text-zinc-700 hover:text-zinc-900 cursor-pointer font-bold focus:outline-none"
                    >
                      <option value="ALL">Todas</option>
                      <option value="Sem Categoria">Sem Categoria</option>
                      {groupedCategories.map(group => (
                        <optgroup key={group.root.id} label={group.root.name}>
                          <option value={group.root.id}>{group.root.name} (Geral)</option>
                          {group.subs.map(sub => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Table Container */}
              <div className="flex-1 bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-100 font-bold text-zinc-500 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 w-10 text-center">
                          <input 
                            type="checkbox"
                            checked={filteredProducts.length > 0 && selectedCodes.size === filteredProducts.length}
                            onChange={handleSelectAll}
                            className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
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
                                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
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
                                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 border border-zinc-200 rounded text-[10px] font-bold">
                                    {getCategoryName(p.categoria_produto)}
                                  </span>
                                ) : (
                                  <span className="text-zinc-300 italic scale-95 font-medium">Nenhuma</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 max-w-[200px] truncate text-zinc-500 font-medium" title={p.observacao || undefined}>
                                {p.observacao || '-'}
                              </td>
                              <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleOpenEdit(p)}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 rounded-lg transition-colors cursor-pointer"
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

                {/* Bulk Actions Bar */}
                {selectedCodes.size > 0 && (
                  <div className="bg-zinc-900 text-white px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-zinc-800 shadow-2xl shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="bg-zinc-800 text-white font-bold px-2 py-0.5 rounded text-sm">
                        {selectedCodes.size}
                      </span>
                      <span className="text-xs font-medium text-zinc-300">produtos selecionados para edição em lote</span>
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
                          <option value="ativo">✅ Ativa</option>
                          <option value="lancamento">🚀 Lançamento</option>
                          <option value="saindo_de_linha">⚠️ Saindo de Linha</option>
                          <option value="descontinuado">🚫 Saiu de Linha</option>
                          <option value="terceirizado">🏭 Terceirizado</option>
                          <option value="bases">🧪 Bases</option>
                        </select>
                      </div>

                      {/* Line Bulk Select */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Linha:</span>
                        <select
                          value={bulkLine}
                          onChange={(e) => {
                            setBulkLine(e.target.value);
                            handleBulkAction('set_line', e.target.value);
                          }}
                          className="bg-zinc-800 text-white border border-zinc-700 rounded-lg text-xs font-semibold py-1.5 px-2.5 focus:outline-none"
                        >
                          <option value="">Alterar para...</option>
                          <option value="AUTO">Automático (Padrão)</option>
                          {configs.map(c => (
                            <option key={c.linha_prefix} value={c.linha_prefix}>{c.nome_linha}</option>
                          ))}
                        </select>
                      </div>

                      {/* Category Bulk Input */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Categoria:</span>
                        <select
                          value={bulkCategory}
                          onChange={(e) => setBulkCategory(e.target.value)}
                          className="bg-zinc-800 text-white border border-zinc-700 rounded-lg text-xs font-semibold py-1.5 px-2 w-36 focus:outline-none"
                        >
                          <option value="">Alterar para...</option>
                          <option value="AUTO">Automático (Padrão)</option>
                          {groupedCategories.map(group => (
                            <optgroup key={group.root.id} label={group.root.name}>
                              <option value={group.root.id}>{group.root.name} (Geral)</option>
                              {group.subs.map(sub => (
                                <option key={sub.id} value={sub.id}>{sub.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button 
                          onClick={() => handleBulkAction('set_category', bulkCategory)}
                          className="px-2 py-1.5 bg-white text-zinc-900 rounded-lg text-xs font-bold hover:bg-zinc-200 transition-colors cursor-pointer"
                        >
                          Aplicar
                        </button>
                      </div>

                      {/* Clear Selection */}
                      <button 
                        onClick={() => setSelectedCodes(new Set())}
                        className="text-xs text-zinc-400 hover:text-white px-2 py-1.5 font-medium transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeAtivosTab === 'linhas' && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="flex justify-between items-center shrink-0">
                <span className="text-xs font-bold text-zinc-400">Tabela de parâmetros e dias-estoque calculados por linha</span>
                <button
                  onClick={() => handleOpenLineModal(null)}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Nova Linha
                </button>
              </div>

              {/* Config Table Card */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-100 font-bold text-zinc-500">
                    <tr>
                      <th className="px-6 py-3.5 w-28">Prefixo</th>
                      <th className="px-6 py-3.5">Nome da Linha</th>
                      <th className="px-6 py-3.5 text-right">Mult. Estoque Ideal</th>
                      <th className="px-6 py-3.5 text-right">Mult. Ordem</th>
                      <th className="px-6 py-3.5 text-right">Mult. Produção</th>
                      <th className="px-6 py-3.5 text-right">Fator Z (Segurança)</th>
                      <th className="px-6 py-3.5 text-center">Status</th>
                      <th className="px-6 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {configs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-zinc-400">Nenhuma configuração de linha encontrada.</td>
                      </tr>
                    ) : (
                      configs.map(cfg => (
                        <tr key={cfg.linha_prefix} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-3 font-mono font-bold text-zinc-500">{cfg.linha_prefix}</td>
                          <td className="px-6 py-3 font-bold text-zinc-800">{cfg.nome_linha}</td>
                          <td className="px-6 py-3 text-right font-medium text-zinc-700">{cfg.estoque_ideal_mult.toFixed(1)} meses</td>
                          <td className="px-6 py-3 text-right text-zinc-600">{cfg.abrir_ordem_mult.toFixed(1)}x</td>
                          <td className="px-6 py-3 text-right text-zinc-600">{cfg.abrir_prod_mult.toFixed(1)}x</td>
                          <td className="px-6 py-3 text-right text-zinc-600">{cfg.fator_seguranca_z.toFixed(2)}</td>
                          <td className="px-6 py-3 text-center">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                              cfg.visivel === 0 ? "bg-zinc-100 text-zinc-500 border-zinc-200" : "bg-emerald-50 text-emerald-700 border-emerald-100"
                            )}>
                              {cfg.visivel === 0 ? "Oculto" : "Ativo"}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right space-x-2">
                            <button
                              onClick={() => handleOpenLineModal(cfg)}
                              className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-lg font-bold text-zinc-700 transition-colors cursor-pointer border border-zinc-200/30"
                            >
                              Editar
                            </button>
                            {cfg.linha_prefix !== 'DEFAULT' && (
                              <button
                                onClick={() => handleDeleteLineConfig(cfg.linha_prefix)}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold transition-colors cursor-pointer border border-rose-100"
                              >
                                Excluir
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeAtivosTab === 'kits' && (
            <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
              <span className="text-xs font-bold text-zinc-400 shrink-0">
                Gerencie a relação de componentes que compõem cada Kit comercial da Natum.
              </span>

              {/* Form to add a new relation & spreadsheet import */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4 shrink-0">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  
                  {/* Add relation Form */}
                  <form onSubmit={handleAddKitComposicao} className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase">Código do Kit</label>
                      <input
                        type="text"
                        placeholder="Ex: 2.11.064"
                        value={kitCompNewKit}
                        onChange={(e) => setKitCompNewKit(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold"
                        required
                      />
                      {getKitNamePreview() && (
                        <div className="text-[10px] text-zinc-500 font-semibold truncate max-w-xs">{getKitNamePreview()}</div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase">Código do Componente</label>
                      <input
                        type="text"
                        placeholder="Ex: 70.12.010"
                        value={kitCompNewComp}
                        onChange={(e) => setKitCompNewComp(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold"
                        required
                      />
                      {getCompNamePreview() && (
                        <div className="text-[10px] text-zinc-500 font-semibold truncate max-w-xs">{getCompNamePreview()}</div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase">Qtd/Kit</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qtd"
                        value={kitCompNewQty}
                        onChange={(e) => setKitCompNewQty(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer h-[36px]"
                    >
                      Vincular Componente
                    </button>
                  </form>

                  {/* Excel import */}
                  <div className="shrink-0 flex items-center">
                    <label className="bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 h-[36px]">
                      <UploadCloud className="w-4 h-4 text-zinc-500" />
                      {uploadingKitsConfig ? 'Enviando...' : 'Importar Excel (.xlsx)'}
                      <input
                        type="file"
                        accept=".xlsx"
                        className="hidden"
                        onChange={handleUploadKitsConfig}
                        disabled={uploadingKitsConfig}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Table of Composition */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
                {/* Search Bar inside Table Panel */}
                <div className="p-4 border-b border-zinc-100 flex items-center shrink-0">
                  <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Buscar por Kit ou Componente..."
                      value={kitCompSearch}
                      onChange={(e) => setKitCompSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-medium"
                    />
                  </div>
                </div>

                {/* Scrollable Table Wrapper */}
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-100 font-bold text-zinc-500 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3">Código do Kit</th>
                        <th className="px-6 py-3">Descrição do Kit</th>
                        <th className="px-6 py-3">Código do Componente</th>
                        <th className="px-6 py-3">Descrição do Componente</th>
                        <th className="px-6 py-3 text-center">Qtd/Kit</th>
                        <th className="px-6 py-3 text-center w-28">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {kitComposicao.filter(row => 
                        (row.kit_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                        (row.kit_descricao || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                        (row.componente_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                        (row.componente_descricao || '').toLowerCase().includes(kitCompSearch.toLowerCase())
                      ).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-zinc-400">
                            Nenhuma relação de composição de kits encontrada.
                          </td>
                        </tr>
                      ) : (
                        kitComposicao.filter(row => 
                          (row.kit_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                          (row.kit_descricao || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                          (row.componente_codigo || '').toLowerCase().includes(kitCompSearch.toLowerCase()) || 
                          (row.componente_descricao || '').toLowerCase().includes(kitCompSearch.toLowerCase())
                        ).map((row) => (
                          <tr key={`${row.kit_codigo}-${row.componente_codigo}`} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-6 py-3 font-mono font-bold text-zinc-800">{row.kit_codigo}</td>
                            <td className="px-6 py-3 font-bold text-zinc-900">{row.kit_descricao}</td>
                            <td className="px-6 py-3 font-mono text-zinc-600">{row.componente_codigo}</td>
                            <td className="px-6 py-3 text-zinc-700">{row.componente_descricao}</td>
                            <td className="px-6 py-3 text-center font-bold text-zinc-900">{row.quantidade}</td>
                            <td className="px-6 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleDeleteKitComposicao(row.kit_codigo, row.componente_codigo)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-red-100 transition-colors cursor-pointer inline-flex items-center justify-center"
                                title="Desvincular componente do kit"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeAtivosTab === 'overrides' && (
            <div className="flex-1 flex flex-col space-y-4">
              <span className="text-xs font-bold text-zinc-400 shrink-0">Lista de desvios manuais inseridos para alterar dias-estoque, médias, carteira de pedidos ou status</span>

              {/* Overrides Table Card */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-100 font-bold text-zinc-500">
                    <tr>
                      <th className="px-4 py-3.5 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={allOverrides.length > 0 && selectedOverrideCodes.size === allOverrides.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const codes = allOverrides.map(o => o.codigo);
                              setSelectedOverrideCodes(new Set(codes));
                            } else {
                              setSelectedOverrideCodes(new Set());
                            }
                          }}
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                        />
                      </th>
                      <th className="px-6 py-3.5 w-24">Código</th>
                      <th className="px-6 py-3.5">Descrição do Produto</th>
                      <th className="px-6 py-3.5">Ajustes Manuais Detectados</th>
                      <th className="px-6 py-3.5">Observações</th>
                      <th className="px-6 py-3.5 text-center w-32">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {allOverrides.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-400">Nenhum override manual cadastrado. Todos os produtos seguem as regras automáticas de suas linhas.</td>
                      </tr>
                    ) : (
                      allOverrides.map(ovr => {
                        const prod = products.find(p => p.codigo === ovr.codigo);
                        const description = prod ? prod.descricao : 'Produto não cadastrado ou oculto';
                        const isSelected = selectedOverrideCodes.has(ovr.codigo);
                        
                        // Detect modified parameters
                        const mods: string[] = [];
                        if (ovr.estoque_ideal_manual !== null) mods.push(`Estoque Fixo (${ovr.estoque_ideal_manual} UN)`);
                        if (ovr.media_manual !== null) mods.push(`Média Vendas (${ovr.media_manual}/mês)`);
                        if (ovr.pedidos_manual !== null) mods.push(`Pedidos Carteira (${ovr.pedidos_manual} UN)`);
                        if (ovr.is_lancamento_manual !== null) mods.push(ovr.is_lancamento_manual === 1 ? 'Marcar Lançamento' : 'Forçar Normal');
                        if (ovr.visivel === 0) mods.push('Ocultar Produto');
                        if (ovr.linha_prefix_manual !== null) mods.push(`Linha Manual (${ovr.linha_prefix_manual})`);
                        if (ovr.status_produto !== null) mods.push(`Status Manual (${ovr.status_produto})`);
                        if (ovr.categoria_produto !== null) mods.push(`Categoria Manual (${ovr.categoria_produto})`);

                        return (
                          <tr 
                            key={ovr.codigo} 
                            className={cn(
                              "hover:bg-zinc-50/70 transition-colors group cursor-pointer",
                              isSelected && "bg-zinc-50/50"
                            )}
                            onClick={() => {
                              const next = new Set(selectedOverrideCodes);
                              if (next.has(ovr.codigo)) next.delete(ovr.codigo);
                              else next.add(ovr.codigo);
                              setSelectedOverrideCodes(next);
                            }}
                          >
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  const next = new Set(selectedOverrideCodes);
                                  if (next.has(ovr.codigo)) next.delete(ovr.codigo);
                                  else next.add(ovr.codigo);
                                  setSelectedOverrideCodes(next);
                                }}
                                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                              />
                            </td>
                            <td className="px-6 py-3 font-mono font-bold text-zinc-500">{ovr.codigo}</td>
                            <td className="px-6 py-3 font-bold text-zinc-800">{description}</td>
                            <td className="px-6 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {mods.map((m, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/50 rounded-full text-[10px] font-bold">
                                    {m}
                                  </span>
                                ))}
                                {mods.length === 0 && <span className="text-zinc-300 italic">Nenhum ajuste real salvo</span>}
                              </div>
                            </td>
                            <td className="px-6 py-3 text-zinc-500 max-w-[200px] truncate" title={ovr.observacao || undefined}>
                              {ovr.observacao || '-'}
                            </td>
                            <td className="px-6 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleClearOverride(ovr.codigo)}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold border border-red-100 transition-colors cursor-pointer"
                                title="Limpar overrides manuais e restaurar regras padrão da linha"
                              >
                                Limpar Overrides
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bulk Actions Bar for Overrides */}
              {selectedOverrideCodes.size > 0 && (
                <div className="bg-zinc-900 text-white px-6 py-4 flex items-center justify-between gap-4 border-t border-zinc-800 shadow-2xl shrink-0 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <span className="bg-zinc-800 text-white font-bold px-2 py-0.5 rounded text-sm">
                      {selectedOverrideCodes.size}
                    </span>
                    <span className="text-xs font-medium text-zinc-300">overrides selecionados para limpeza em lote</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleClearOverridesBulk}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer text-xs"
                    >
                      <Trash2 className="w-4 h-4" />
                      Limpar Overrides Selecionados
                    </button>
                    <button 
                      onClick={() => setSelectedOverrideCodes(new Set())}
                      className="text-xs text-zinc-400 hover:text-white px-2 py-1.5 font-medium transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeAtivosTab === 'configuracoes' && (
            <div className="flex-1 flex flex-col space-y-6">
              {/* Secondary Sub-Tabs Nav */}
              <div className="flex border-b border-zinc-200 shrink-0">
                <button
                  onClick={() => setConfigSubTab('parametros')}
                  className={cn(
                    "px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 focus:outline-none",
                    configSubTab === 'parametros'
                      ? "border-zinc-900 text-zinc-900"
                      : "border-transparent text-zinc-400 hover:text-zinc-700 hover:border-zinc-200"
                  )}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Parâmetros Gerais
                </button>
                <button
                  onClick={() => setConfigSubTab('status')}
                  className={cn(
                    "px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 focus:outline-none",
                    configSubTab === 'status'
                      ? "border-zinc-900 text-zinc-900"
                      : "border-transparent text-zinc-400 hover:text-zinc-700 hover:border-zinc-200"
                  )}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Status de Planejamento
                </button>
                <button
                  onClick={() => setConfigSubTab('categorias')}
                  className={cn(
                    "px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 focus:outline-none",
                    configSubTab === 'categorias'
                      ? "border-zinc-900 text-zinc-900"
                      : "border-transparent text-zinc-400 hover:text-zinc-700 hover:border-zinc-200"
                  )}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Categorias e Subcategorias
                </button>
              </div>

              {/* Sub-Tab Contents */}
              <div className="flex-1 overflow-y-auto pr-1">
                {configSubTab === 'parametros' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-4">
                      <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-2">
                        Parâmetros Globais do Sistema
                      </h3>
                      <form onSubmit={handleSaveGlobalSettings} className="space-y-3.5 text-left">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase">Dias Comerciais por Mês</label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-800"
                            value={globalDiasComerciais}
                            onChange={(e) => setGlobalDiasComerciais(e.target.value)}
                            required
                          />
                          <span className="text-[9px] text-zinc-400 block leading-tight">
                            Usado para converter os meses ideais e prazos em dias na tabela.
                          </span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase">Itens por Página (Tabelas)</label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-800"
                            value={globalLimitPerPage}
                            onChange={(e) => setGlobalLimitPerPage(e.target.value)}
                            required
                          />
                          <span className="text-[9px] text-zinc-400 block leading-tight">
                            Define a paginação padrão das listagens de estoque e produção.
                          </span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase">Meta de Giro Global (Meses para Lançamentos)</label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-800"
                            value={globalLancamentoMeta}
                            onChange={(e) => setGlobalLancamentoMeta(e.target.value)}
                            required
                          />
                          <span className="text-[9px] text-zinc-400 block leading-tight">
                            Duração padrão para a formatura do Lançamento para Ativo se não houver ajuste individual.
                          </span>
                        </div>

                        <button
                          type="submit"
                          disabled={globalSettingsSaving}
                          className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-xs font-bold py-2 rounded-xl shadow-sm transition-all cursor-pointer flex justify-center items-center"
                        >
                          {globalSettingsSaving ? 'Salvando...' : 'Salvar Parâmetros Globais'}
                        </button>
                      </form>
                    </div>

                    <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-4">
                      <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-2">
                        Diretrizes de Roteamento e Regras de Negócio
                      </h3>
                      
                      <div className="space-y-4 text-xs text-zinc-600 leading-relaxed text-left">
                        <div>
                          <h4 className="font-extrabold text-zinc-800 flex items-center gap-1.5 mb-1">
                            <span className="p-1 bg-zinc-100 rounded text-[9px] font-bold text-zinc-600">FG</span>
                            Comportamento por Status do Produto
                          </h4>
                          <ul className="list-disc pl-4 space-y-1 text-zinc-500 text-[11px]">
                            <li><strong>Ativa:</strong> Estoque ideal calculado via Dias-Estoque da Linha x Média Móvel de Vendas.</li>
                            <li><strong>Lançamento:</strong> Estoque ideal fixo manual (`meta_meses`). Gradua automaticamente para Ativa após atingir o histórico de giro configurado.</li>
                            <li><strong>Saindo de Linha:</strong> Produção ativa apenas para consumir materiais remanescentes. Compras de insumos exclusivos são paralisadas gradativamente (embalagens primeiro).</li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-extrabold text-zinc-800 flex items-center gap-1.5 mb-1">
                            <span className="p-1 bg-zinc-100 rounded text-[9px] font-bold text-zinc-600">CAT</span>
                            Roteamento de Compras por Categoria
                          </h4>
                          <p className="text-[11px] text-zinc-500">
                            A categoria principal do produto acabado ou de seus insumos determina em qual painel do módulo de Compras o planejamento será realizado:
                          </p>
                          <ul className="list-disc pl-4 mt-1 space-y-1 text-zinc-500 text-[11px]">
                            <li><strong>Matéria-Prima / Embalagem Geral:</strong> Direcionado ao painel geral de Compras.</li>
                            <li><strong>Coloração (`cat_coloracao`):</strong> Direcionado ao painel exclusivo **Compras &gt; Coloração**, operando com dias de cobertura parametrizados independentemente.</li>
                            <li><strong>Material de Apoio (`cat_apoio`):</strong> Direcionado ao painel exclusivo **Compras &gt; Material de Apoio**.</li>
                          </ul>
                        </div>

                        <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 space-y-1.5">
                          <h5 className="font-bold text-amber-800 text-[11px] flex items-center gap-1">
                            ⚠️ Regra de Auto-Suspensão Inteligente (Fim de Linha)
                          </h5>
                          <p className="text-[10px] text-amber-700">
                            Para evitar perdas de matéria-prima, insumos de produtos <strong>Saindo de Linha</strong> não são suspensos todos de uma vez:
                            Embalagens exclusivas são suspensas imediatamente, mas matérias-primas continuam sendo compradas enquanto houver estoque remanescente de embalagens exclusivas do produto acabado, otimizando o escoamento total do produto.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {configSubTab === 'status' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-4">
                      <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-2">
                        Filtros Globais de Planejamento (Status Ignorados)
                      </h3>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        Selecione quais status de produtos acabados devem ser <strong>desconsiderados</strong> na consolidação automática de demanda de insumos. Insumos exclusivos de produtos com os status marcados serão auto-suspensos no painel de Compras.
                      </p>
                      
                      <div className="space-y-2 pt-2">
                        {['ativo', 'lancamento', 'saindo_de_linha', 'descontinuado', 'terceirizado', 'bases'].map(statusVal => {
                          const labelMap: Record<string, string> = {
                            ativo: '✅ Ativa',
                            lancamento: '🚀 Lançamento',
                            saindo_de_linha: '⚠️ Saindo de Linha',
                            descontinuado: '🚫 Saiu de Linha',
                            terceirizado: '🏭 Terceirizado',
                            bases: '🧪 Bases'
                          };
                          const descMap: Record<string, string> = {
                            ativo: 'Planejamento normal de produção e compras.',
                            lancamento: 'Produção utiliza meta manual e cálculo de faturamento progressivo.',
                            saindo_de_linha: 'Recomendado ignorar parcialmente (compra bloqueada, consome estoque).',
                            descontinuado: 'Recomendado ignorar. Produção suspensa e compras zeradas.',
                            terceirizado: 'Recomendado ignorar. Sem requisição de insumos pelo sistema.',
                            bases: 'Evita duplicar estoque de insumos que já fazem parte de formulações internas.',
                          };
                          const isChecked = configIgnoredStatuses.includes(statusVal);
                          return (
                            <label key={statusVal} className="flex items-center gap-3 p-2.5 hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer border border-zinc-100">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleIgnoredStatus(statusVal)}
                                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-4 w-4"
                              />
                              <div>
                                <div className="text-xs font-bold text-zinc-800">{labelMap[statusVal]}</div>
                                <span className="text-[10px] text-zinc-400 font-semibold leading-none">
                                  {descMap[statusVal]}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-2 bg-zinc-50 border border-zinc-200 rounded-2xl p-6 space-y-4 text-xs text-zinc-600 leading-relaxed text-left">
                      <h4 className="font-bold text-zinc-700 uppercase tracking-wider">Como funciona o bloqueio de Status?</h4>
                      <p>
                        Marcar um status como <strong>Ignorado</strong> impede que o motor de planejamento do NatumHub inclua os produtos suspensos nas planilhas de demanda de compras e estimativas de dias de estoque.
                      </p>
                      <p>
                        Isso é crucial para evitar alertas falsos de compras para insumos de itens que saíram de catálogo ou cuja produção é terceirizada e não consome estoque local de matérias-primas.
                      </p>
                      <p>
                        Note que o status <strong>Saindo de Linha</strong> tem comportamento dinâmico e inteligente para matérias-primas mesmo se marcado como suspenso, pois visa consumir os saldos remanescentes das embalagens associadas.
                      </p>
                    </div>
                  </div>
                )}

                {configSubTab === 'categorias' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-4">
                      <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-2">
                        Nova Subcategoria
                      </h3>
                      
                      <form onSubmit={handleAddCategory} className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase">Nome da Subcategoria</label>
                          <input
                            type="text"
                            placeholder="Ex: Tonalizantes, Fragrâncias Florais, etc."
                            value={configNewCatName}
                            onChange={(e) => setConfigNewCatName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-medium"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase">Categoria Pai (Root)</label>
                          <select
                            value={configNewCatParent}
                            onChange={(e) => setConfigNewCatParent(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-medium"
                            required
                          >
                            <option value="">Selecione uma categoria pai...</option>
                            <option value="cat_mp">Matéria Prima</option>
                            <option value="cat_emb">Embalagem</option>
                            <option value="cat_mat">Materiais</option>
                            <option value="cat_coloracao">Coloração</option>
                            <option value="cat_apoio">Material de Apoio</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="w-full bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold py-2 rounded-xl shadow-sm transition-all cursor-pointer"
                        >
                          Adicionar Subcategoria
                        </button>
                      </form>
                    </div>

                    <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-4">
                      <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-2">
                        Subcategorias Personalizadas Cadastradas
                      </h3>
                      
                      <div className="overflow-y-auto max-h-[350px] border border-zinc-100 rounded-xl divide-y divide-zinc-50">
                        {categories.filter(c => c.parentId !== null).length === 0 ? (
                          <div className="p-4 text-center text-zinc-400 text-xs italic">
                            Nenhuma subcategoria personalizada cadastrada.
                          </div>
                        ) : (
                          categories.filter(c => c.parentId !== null).map(cat => {
                            const parentName = categories.find(p => p.id === cat.parentId)?.name || cat.parentId;
                            return (
                              <div key={cat.id} className="flex justify-between items-center p-3 text-xs hover:bg-zinc-50 transition-colors">
                                <div>
                                  <div className="font-bold text-zinc-800">{cat.name}</div>
                                  <div className="text-[10px] text-zinc-400 uppercase font-semibold">Pai: {parentName}</div>
                                </div>
                                <button
                                  onClick={() => handleDeleteCategory(cat.id)}
                                  className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-100 transition-colors cursor-pointer"
                                >
                                  Excluir
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Edit Line Config Modal */}
      {isLineModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <header className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex justify-between items-center">
              <h3 className="font-extrabold text-zinc-900 text-base">
                {editingLineConfig ? 'Editar Configuração de Linha' : 'Nova Configuração de Linha'}
              </h3>
              <button 
                onClick={() => setIsLineModalOpen(false)}
                className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <form onSubmit={handleSaveLineConfig} className="p-6 space-y-4 text-left">
              {lineFormError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-xl text-xs flex gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{lineFormError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 block">Prefixo de Linha</label>
                  <input
                    type="text"
                    disabled={!!editingLineConfig}
                    placeholder="Ex: 9.15."
                    value={linePrefixForm}
                    onChange={(e) => setLinePrefixForm(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium disabled:bg-zinc-100 disabled:text-zinc-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 block">Nome da Linha</label>
                  <input
                    type="text"
                    placeholder="Ex: Capilar Professional"
                    value={lineNameForm}
                    onChange={(e) => setLineNameForm(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-3 mt-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">Multiplicadores & Segurança</span>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 block" title="Calcula o estoque ideal em meses de venda média">Estoque Ideal (Meses)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: 3.0"
                      value={idealMultForm}
                      onChange={(e) => setIdealMultForm(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 block" title="Segurança estatística Z para cálculo de estoque mínimo">Fator de Segurança Z</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: 1.65"
                      value={fatorZForm}
                      onChange={(e) => setFatorZForm(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 block" title="Multiplicador do ponto de ressuprimento/abrir ordem">Mult. Abrir Ordem</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: 1.5"
                      value={ordemMultForm}
                      onChange={(e) => setOrdemMultForm(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-600 block" title="Multiplicador da quantidade ideal a produzir/lote recomendado">Mult. Lote Produção</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: 1.0"
                      value={prodMultForm}
                      onChange={(e) => setProdMultForm(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 mt-3">
                  <label className="text-[11px] font-bold text-zinc-600 block">Visibilidade no Painel de Planejamento</label>
                  <select
                    value={visibleLineForm}
                    onChange={(e) => setVisibleLineForm(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                  >
                    <option value="1">Exibir Linha e seus Produtos</option>
                    <option value="0">Ocultar de Linha (Desativar)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3 border-t border-zinc-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsLineModalOpen(false)}
                  className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={lineSaving}
                  className="flex-1 py-2 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {lineSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Salvar Config
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Backdrop for Edit Drawer */}
      {selectedProduct && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity duration-300 z-40 cursor-pointer" 
          onClick={() => setSelectedProduct(null)}
        />
      )}

      {/* Edit Drawer (Side panel) */}
      <div className={cn(
        "w-96 bg-white border-l border-zinc-200 shadow-2xl flex flex-col h-full fixed right-0 top-0 transition-transform duration-350 z-50",
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
            className="p-1 hover:bg-zinc-200 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
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
                {PRODUCT_LINE_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                ))}
                <option value="bases">🧪 Bases</option>
              </select>
              <span className="text-[10px] text-zinc-400 font-semibold block leading-tight">
                {PRODUCT_LINE_STATUSES.find(s => s.value === statusForm)?.description || 'Status alteram o comportamento de demandas de compras e recomendações de produção.'}
              </span>
            </div>

            {/* Launch Parameters (conditional) */}
            {statusForm === 'lancamento' && (
              <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-200">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Configurações de Lançamento</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-600 block">Meta de Giro (Meses)</label>
                    <input
                      type="number"
                      min="1"
                      value={lancamentoMetaForm}
                      onChange={(e) => setLancamentoMetaForm(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-600 block">Data de Início</label>
                    <input
                      type="date"
                      value={lancamentoDataInicioForm}
                      onChange={(e) => setLancamentoDataInicioForm(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-semibold"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Grouped Category Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 block">Categoria do Produto</label>
              <select
                value={categoryForm}
                onChange={(e) => setCategoryForm(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
              >
                <option value="">Sem Categoria (Automática)</option>
                {groupedCategories.map(group => (
                  <optgroup key={group.root.id} label={group.root.name}>
                    <option value={group.root.id}>{group.root.name} (Geral)</option>
                    {group.subs.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
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

            <div className="border-t border-zinc-100 my-2 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">Overrides de Estoque & Metas</span>
              
              {/* Ideal Stock Override Input */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-600 block">Estoque Ideal Fixo</label>
                  <input
                    type="number"
                    placeholder="Automático (meses)"
                    value={idealStockOverride}
                    onChange={(e) => setIdealStockOverride(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-600 block">Override Média Vendas</label>
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
                  <label className="text-[11px] font-bold text-zinc-600 block">Pedidos em Aberto</label>
                  <input
                    type="number"
                    placeholder="Automático (carteira)"
                    value={ordersOverride}
                    onChange={(e) => setOrdersOverride(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-600 block">Visibilidade</label>
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
                className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="h-4 w-4" />
                Salvar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
