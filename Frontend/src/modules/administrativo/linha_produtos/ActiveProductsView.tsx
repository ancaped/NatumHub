import { apiFetch } from '../../geral/lib/http';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, CheckCircle2, RefreshCw, ShieldAlert,
  Edit, Check, Filter, Layers, ListFilter, AlertTriangle,
  Database, Trash2, Plus, Loader2, Settings, GraduationCap, UploadCloud
} from 'lucide-react';
import { cn, randomId } from '../../geral/lib/utils';
import { Category, PRODUCT_LINE_STATUSES, GraduationCandidate } from '../../geral/lib/types';
import { api } from '../../geral/lib/api';
import { eBase, STATUS_IGNORADOS_PADRAO, DIAS_COMERCIAIS_PADRAO, LIMITE_POR_PAGINA_PADRAO } from '../../geral/lib/regrasProduto';
import KitCompositionDrawer from '../../producao/components/KitCompositionDrawer';
import Drawer from '../../geral/components/ui/Drawer';
import { useAviso } from '../../geral/components/ui/Aviso';
import PreviaAcaoDrawer, { PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';


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
  produzir_apenas_kit?: number | null;
  lancamento_meta_meses?: number | null;
  lancamento_data_inicio?: string | null;
  terceirizado_modo?: string | null;
  is_producao_programada?: number | null;
  producao_programada_disparo?: number | null;
  producao_programada_objetivo?: number | null;
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
  base_codigo?: string | null;
  terceirizado_modo?: string | null;
  produzir_apenas_kit?: number | null;
  is_kit?: boolean;
  is_kit_component?: boolean;
  parent_kits?: string[];
  estoque_ideal_manual?: number | null;
  estoque_ideal_qtd?: number;
  estoque_ideal_meses?: number;
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
  const { avisar, aviso } = useAviso();
  const [previa, setPrevia] = useState<(PreviaAcao & { aoFechar?: () => void }) | null>(null);
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [configs, setConfigs] = useState<LineConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [lineFilter, setLineFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [productTypeFilter, setProductTypeFilter] = useState<'ALL' | 'PRODUCTS' | 'KITS'>('ALL');
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
  const [produzirApenasKitForm, setProduzirApenasKitForm] = useState<number>(0);
  const [isLaunchOverride, setIsLaunchOverride] = useState('AUTO'); // 'AUTO' | 'YES' | 'NO'
  const [visibleOverride, setVisibleOverride] = useState('1'); // '1' = visível, '0' = oculto
  const [lancamentoMetaForm, setLancamentoMetaForm] = useState('6');
  const [lancamentoDataInicioForm, setLancamentoDataInicioForm] = useState('');
  const [baseCodigoForm, setBaseCodigoForm] = useState('');
  const [graduationCandidates, setGraduationCandidates] = useState<GraduationCandidate[]>([]);

  // Bulk actions state
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkLine, setBulkLine] = useState('');

  const [activeAtivosTab, setActiveAtivosTab] = useState<'status' | 'linhas' | 'kits' | 'overrides' | 'configuracoes'>('status');

  // Kits Composition state
  const [kitComposicao, setKitComposicao] = useState<any[]>([]);
  const [kitCompSearch, setKitCompSearch] = useState('');
  const [uploadingKitsConfig, setUploadingKitsConfig] = useState(false);

  // States: Drawer de Composição de Kits
  const [selectedDrawerKitCode, setSelectedDrawerKitCode] = useState('');
  const [selectedDrawerKitDesc, setSelectedDrawerKitDesc] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // States: Compor Novo Kit Modal
  const [isNewKitModalOpen, setIsNewKitModalOpen] = useState(false);
  const [newKitSearch, setNewKitSearch] = useState('');

  // Lista Mestre unificada de Kits Montáveis
  const masterKitsList = useMemo(() => {
    const map = new Map<string, { codigo: string; descricao: string; status?: string; categoria?: string }>();
    
    // 1. Identificar categorias de Kit cadastradas no banco
    const kitCategoryIds = categories
      .filter(c => {
        const name = (c.name || '').toLowerCase();
        return name === 'kits' || name === 'kit';
      })
      .map(c => c.id);

    // 2. Adicionar produtos com a categoria de Kits
    products.forEach(p => {
      const isKit = p.categoria_produto === 'kit' || (p.categoria_produto && kitCategoryIds.includes(p.categoria_produto));
      if (isKit && p.codigo) {
        map.set(p.codigo, {
          codigo: p.codigo,
          descricao: p.descricao || 'Kit Montável',
          status: p.status_produto,
          categoria: p.categoria_produto
        });
      }
    });

    // 3. Adicionar composições existentes para não ocultar nada preexistente
    kitComposicao.forEach(kc => {
      if (kc.kit_codigo && !map.has(kc.kit_codigo)) {
        map.set(kc.kit_codigo, {
          codigo: kc.kit_codigo,
          descricao: kc.kit_descricao || 'Kit Montável',
          status: 'Ativo',
          categoria: 'kit'
        });
      }
    });

    const list = Array.from(map.values()).sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
    if (!kitCompSearch.trim()) return list;
    const q = kitCompSearch.trim().toLowerCase();
    return list.filter(k => 
      (k.codigo || '').toLowerCase().includes(q) || 
      (k.descricao || '').toLowerCase().includes(q)
    );
  }, [categories, products, kitComposicao, kitCompSearch]);


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
  const [linhaSearch, setLinhaSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_POR_PAGINA = 50;

  // Category & Ignored status configuration states
  const [configNewCatName, setConfigNewCatName] = useState('');
  const [configNewCatParent, setConfigNewCatParent] = useState('');
  const [configIgnoredStatuses, setConfigIgnoredStatuses] = useState<string[]>([]);
  const [globalDiasComerciais, setGlobalDiasComerciais] = useState(String(DIAS_COMERCIAIS_PADRAO));
  const [globalLimitPerPage, setGlobalLimitPerPage] = useState(String(LIMITE_POR_PAGINA_PADRAO));
  const [globalLancamentoMeta, setGlobalLancamentoMeta] = useState('6');
  const [globalSettingsSaving, setGlobalSettingsSaving] = useState(false);
  const [configSubTab, setConfigSubTab] = useState<'parametros' | 'status' | 'categorias'>('parametros');

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodsRes, confRes, ovrRes, catsData, ignoredRes, gradRes, kitsRes, diasRes, limitRes, metaGlobalRes] = await Promise.all([
        apiFetch(`/products?limit=5000&show_hidden=true&include_kits=true`),
        apiFetch(`/configs`),
        apiFetch(`/overrides`),
        api.getCategories(),
        apiFetch(`/settings/ignored_product_statuses`),
        apiFetch(`/lancamento/graduation-check`),
        apiFetch(`/kits/composicao`),
        apiFetch(`/settings/dias_comerciais`),
        apiFetch(`/settings/limit_per_page`),
        apiFetch(`/settings/lancamento_meta_meses_global`)
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

        let ignoredList = [...STATUS_IGNORADOS_PADRAO];
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
        apiFetch(`/settings/dias_comerciais`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: globalDiasComerciais })
        }),
        apiFetch(`/settings/limit_per_page`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: globalLimitPerPage })
        }),
        apiFetch(`/settings/lancamento_meta_meses_global`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: globalLancamentoMeta })
        })
      ]);
      if (responses.every(r => r.ok)) {
        avisar("Configurações globais salvas com sucesso!", 'sucesso');
        await loadData();
      } else {
        avisar("Erro ao salvar algumas configurações.", 'erro');
      }
    } catch (e) {
      console.error(e);
      avisar("Erro de conexão ao salvar.", 'erro');
    } finally {
      setGlobalSettingsSaving(false);
    }
  };

  const fetchKitComposicao = async () => {
    try {
      const res = await apiFetch(`/kits/composicao`);
      if (res.ok) setKitComposicao(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const ROTULO_CAMPO: Record<string, string> = {
    visivel: 'Visibilidade',
    is_lancamento_manual: 'Lançamento',
    lancamento_gatilho: 'Gatilho',
    lancamento_estoque_maximo: 'Estoque máximo',
    observacao: 'Observação',
    linha_prefix_manual: 'Linha',
    status_produto: 'Status',
    categoria_produto: 'Categoria',
    estoque_ideal_manual: 'Estoque ideal',
    pedidos_manual: 'Pedidos',
    media_manual: 'Média de vendas',
  };

  const formatarValorPrevia = (campo: string, v: string | null) => {
    if (v === null || v === undefined || v === '') return '(vazio)';
    if (campo === 'visivel') return v === '0' ? 'oculto' : 'visível';
    if (campo === 'is_lancamento_manual') return v === '1' ? 'sim' : 'não';
    if (campo === 'status_produto') return PRODUCT_LINE_STATUSES.find(s => s.value === v)?.label || v;
    if (campo === 'categoria_produto') return categories.find(c => c.id === v)?.name || v;
    if (campo === 'linha_prefix_manual') return configs.find(c => c.linha_prefix === v)?.nome_linha || v;
    return v;
  };

  const chamarBulk = (codigos: string[], action: string, value: string | null, confirmar: boolean) =>
    apiFetch(`/overrides/bulk${confirmar ? '?confirmar=true' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigos, action, value_str: value }),
    });

  /** Ação em lote em 2 passos: pede a prévia ao servidor, mostra no painel e só grava no OK. */
  const pedirBulk = async (opts: {
    titulo: string;
    codigos: string[];
    action: string;
    value: string | null;
    confirmarRotulo: string;
    aoConcluir: () => void | Promise<void>;
    aoCancelar?: () => void;
  }) => {
    try {
      const res = await chamarBulk(opts.codigos, opts.action, opts.value, false);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisar(data.error || 'Erro ao preparar a alteração em lote.', 'erro');
        opts.aoCancelar?.();
        return;
      }
      const r = data.resultado || {};
      const itens: { codigo: string; mudancas: { campo: string; de: string | null; para: string | null }[] }[] = r.itens || [];
      const linhas = itens.map(i => ({
        titulo: `${i.codigo} · ${products.find(p => p.codigo === i.codigo)?.descricao || 'produto'}`,
        detalhe: i.mudancas
          .map(m => `${ROTULO_CAMPO[m.campo] || m.campo}: ${formatarValorPrevia(m.campo, m.de)} → ${formatarValorPrevia(m.campo, m.para)}`)
          .join(' | '),
      }));
      const avisos: string[] = [];
      if ((r.totalComMudanca ?? 0) > itens.length) avisos.push(`Mostrando ${itens.length} de ${r.totalComMudanca} produtos que mudam.`);
      if ((r.totalProdutos ?? 0) > (r.totalComMudanca ?? 0)) avisos.push(`${r.totalProdutos - r.totalComMudanca} produto(s) já estão com esse valor e não mudam.`);
      setPrevia({
        titulo: opts.titulo,
        linhas,
        avisos,
        confirmarRotulo: opts.confirmarRotulo,
        aoFechar: opts.aoCancelar,
        executar: async () => {
          const r2 = await chamarBulk(opts.codigos, opts.action, opts.value, true);
          if (!r2.ok) {
            const e = await r2.json().catch(() => ({}));
            throw new Error(e.error || 'Erro ao aplicar a alteração em lote.');
          }
          await opts.aoConcluir();
        },
      });
    } catch (e) {
      console.error(e);
      avisar('Erro de conexão ao preparar a alteração em lote.', 'erro');
      opts.aoCancelar?.();
    }
  };

  const handleUploadKitsConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingKitsConfig(true);
    const enviar = (confirmar: boolean) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch(`/kits/composicao/upload${confirmar ? '?confirmar=true' : ''}`, { method: 'POST', body: formData });
    };
    try {
      const res = await enviar(false);
      const data = await res.json();
      if (!res.ok) {
        avisar(data.error || 'Erro ao importar.', 'erro');
        return;
      }
      const r = data.resultado || {};
      const kits: string[] = r.kitsAfetados || [];
      setPrevia({
        titulo: 'Importar composição de kits',
        linhas: [
          { titulo: 'Relações manuais que saem', detalhe: String(r.removidas ?? 0) },
          { titulo: 'Relações do arquivo que entram', detalhe: String(r.importadas ?? 0) },
          { titulo: 'Kits afetados', detalhe: String(kits.length) },
          ...kits.slice(0, 50).map(k => ({ titulo: k })),
        ],
        avisos: [
          'Todas as relações manuais atuais são substituídas pelas do arquivo (as vindas do ERP ficam).',
          ...(kits.length > 50 ? [`Mostrando 50 de ${kits.length} kits.`] : []),
        ],
        confirmarRotulo: 'Importar e substituir',
        executar: async () => {
          const r2 = await enviar(true);
          const d2 = await r2.json().catch(() => ({}));
          if (!r2.ok) throw new Error(d2.error || 'Erro ao importar.');
          await fetchKitComposicao();
          await loadData();
          avisar(d2.message || 'Composição de kits importada.', 'sucesso');
        },
      });
    } catch (err) {
      console.error(err);
      avisar('Erro de conexão.', 'erro');
    } finally {
      setUploadingKitsConfig(false);
    }
  };

  const handleGraduateAll = async () => {
    if (graduationCandidates.length === 0) return;
    await pedirBulk({
      titulo: `Graduar ${graduationCandidates.length} candidato(s) para "Ativa"`,
      codigos: graduationCandidates.map(c => c.codigo),
      action: 'graduar_lancamento',
      value: null,
      confirmarRotulo: 'Graduar',
      aoConcluir: async () => { await loadData(); },
    });
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

  const kitCategoryIds = useMemo(() => {
    return categories
      .filter(c => {
        const name = (c.name || '').toLowerCase();
        return name === 'kits' || name === 'kit';
      })
      .map(c => c.id);
  }, [categories]);

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

      const isKit = Boolean(
        p.is_kit || 
        p.categoria_produto === 'kit' || 
        (p.categoria_produto && kitCategoryIds.includes(p.categoria_produto)) || 
        kitComposicao.some(kc => kc.kit_codigo === p.codigo)
      );

      const matchesType = 
        productTypeFilter === 'ALL' ||
        (productTypeFilter === 'PRODUCTS' && !isKit) ||
        (productTypeFilter === 'KITS' && isKit);

      return matchesSearch && matchesStatus && matchesLine && matchesCategory && matchesType;
    });
  }, [products, search, statusFilter, lineFilter, categoryFilter, productTypeFilter, categories, kitCategoryIds, kitComposicao]);

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
    setBaseCodigoForm(p.base_codigo || '');
    setLineOverride(p.linha_prefix_manual || 'AUTO');
    setIdealStockOverride(p.estoque_ideal_manual != null ? p.estoque_ideal_manual.toString() : '');
    setObsForm(p.observacao || '');
    setProduzirApenasKitForm(p.produzir_apenas_kit === 1 ? 1 : 0);
    
    setIsLaunchOverride('AUTO');
    setVisibleOverride(p.visivel === 0 ? '0' : '1');
    
    // Fetch exact overrides for this product code to fill the form accurately
    fetchProductOverride(p.codigo);
  };

  const fetchProductOverride = async (code: string) => {
    setDrawerLoading(true);
    try {
      const res = await apiFetch(`/overrides`);
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
          setProduzirApenasKitForm(override.produzir_apenas_kit === 1 ? 1 : 0);
          
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
          setProduzirApenasKitForm(0);
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
        base_codigo: baseCodigoForm.trim() || null,
        lancamento_meta_meses: statusForm === 'lancamento' ? parseInt(lancamentoMetaForm, 10) || 6 : null,
        lancamento_data_inicio: statusForm === 'lancamento' ? (lancamentoDataInicioForm.trim() || new Date().toISOString().split('T')[0]) : null,
        produzir_apenas_kit: produzirApenasKitForm,
      };

      const res = await apiFetch(`/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ovr),
      });

      if (res.ok) {
        setSelectedProduct(null);
        await loadData();
      } else {
        avisar("Erro ao salvar configurações do produto.", 'erro');
      }
    } catch (e) {
      console.error(e);
      avisar("Erro de conexão ao salvar.", 'erro');
    } finally {
      setDrawerLoading(false);
    }
  };

  // Bulk Save (2 passos: prévia no painel, grava no OK)
  const handleBulkAction = async (action: string, value: string) => {
    if (selectedCodes.size === 0) return;
    const rotulos: Record<string, string> = { set_status: 'status', set_line: 'linha', set_category: 'categoria' };
    await pedirBulk({
      titulo: `Alterar ${rotulos[action] || 'ajuste'} de ${selectedCodes.size} produto(s)`,
      codigos: Array.from(selectedCodes),
      action,
      value: value || null,
      confirmarRotulo: 'Aplicar',
      aoConcluir: async () => {
        setSelectedCodes(new Set());
        setBulkStatus('');
        setBulkCategory('');
        setBulkLine('');
        await loadData();
      },
      aoCancelar: () => {
        setBulkStatus('');
        setBulkLine('');
      },
    });
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
      const res = await apiFetch(`/configs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (res.ok) {
        setIsLineModalOpen(false);
        await loadData();
        avisar('Linha salva. Use "Recalcular linhas dos produtos" para aplicar aos produtos.', 'info');
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
      avisar("A linha DEFAULT não pode ser excluída.", 'erro');
      return;
    }
    try {
      const res = await apiFetch(`/configs/${prefix}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisar(data.error || "Erro ao excluir.", 'erro');
        return;
      }
      const r = data.resultado || {};
      setPrevia({
        titulo: `Excluir a linha "${prefix}"`,
        linhas: [
          { titulo: 'Produtos que voltam para DEFAULT', detalhe: String(r.produtosParaDefault ?? 0) },
          { titulo: 'Ajustes manuais de linha que voltam para DEFAULT', detalhe: String(r.overridesParaDefault ?? 0) },
        ],
        avisos: [`As regras da linha "${prefix}" são apagadas.`],
        confirmarRotulo: 'Excluir linha',
        executar: async () => {
          const r2 = await apiFetch(`/configs/${prefix}?confirmar=true`, { method: 'DELETE' });
          if (!r2.ok) {
            const e = await r2.json().catch(() => ({}));
            throw new Error(e.error || 'Erro ao excluir.');
          }
          await loadData();
          avisar('Linha excluída. Use "Recalcular linhas dos produtos" para reaplicar as linhas restantes.', 'info');
        },
      });
    } catch (err) {
      console.error(err);
      avisar("Falha de conexão ao excluir.", 'erro');
    }
  };

  const handleRecalcularLinhas = async () => {
    try {
      const res = await apiFetch(`/configs/recalcular-linhas`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        avisar(data.error || 'Erro ao calcular a prévia.', 'erro');
        return;
      }
      const r = data.resultado || {};
      const lista: { codigo: string; descricao: string; de: string; para: string }[] = r.lista || [];
      const avisos: string[] = [];
      if (r.listaTruncada) avisos.push(`Mostrando ${lista.length} de ${r.produtosQueMudam} produtos que mudam.`);
      avisos.push('Os ajustes manuais de linha dos produtos não mudam.');
      setPrevia({
        titulo: 'Recalcular linhas dos produtos',
        linhas: lista.map(i => ({ titulo: `${i.codigo} · ${i.descricao}`, detalhe: `${i.de} → ${i.para}` })),
        avisos: (r.produtosQueMudam ?? 0) === 0 ? ['Nenhum produto muda de linha.'] : avisos,
        confirmarRotulo: 'Recalcular',
        executar: async () => {
          const r2 = await apiFetch(`/configs/recalcular-linhas?confirmar=true`, { method: 'POST' });
          if (!r2.ok) {
            const e = await r2.json().catch(() => ({}));
            throw new Error(e.error || 'Erro ao recalcular as linhas.');
          }
          await loadData();
        },
      });
    } catch (err) {
      console.error(err);
      avisar('Falha de conexão ao preparar o recálculo.', 'erro');
    }
  };

  const handleClearOverride = async (code: string) => {
    await pedirBulk({
      titulo: `Remover configurações manuais de ${code}`,
      codigos: [code],
      action: 'clear',
      value: null,
      confirmarRotulo: 'Remover',
      aoConcluir: async () => { await loadData(); },
    });
  };

  const handleClearOverridesBulk = async () => {
    if (selectedOverrideCodes.size === 0) return;
    await pedirBulk({
      titulo: `Remover configurações manuais de ${selectedOverrideCodes.size} produto(s)`,
      codigos: Array.from(selectedOverrideCodes),
      action: 'clear',
      value: null,
      confirmarRotulo: 'Remover',
      aoConcluir: async () => {
        setSelectedOverrideCodes(new Set());
        await loadData();
      },
    });
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configNewCatName.trim()) return;

    try {
      const newCat: Category = {
        id: randomId(),
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
      avisar("Erro ao salvar categoria", 'erro');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setPrevia({
      titulo: 'Excluir categoria',
      linhas: [{ titulo: categories.find(c => c.id === id)?.name || id, detalhe: 'será excluída' }],
      confirmarRotulo: 'Excluir',
      executar: async () => {
        try {
          await api.deleteCategory(id);
        } catch (e) {
          console.error(e);
          throw new Error('Erro ao excluir categoria');
        }
        const catsData = await api.getCategories();
        setCategories(catsData || []);
      },
    });
  };

  const handleToggleIgnoredStatus = async (status: string) => {
    const isIgnored = configIgnoredStatuses.includes(status);
    const updated = isIgnored 
      ? configIgnoredStatuses.filter(s => s !== status)
      : [...configIgnoredStatuses, status];
    
    setConfigIgnoredStatuses(updated);
    
    try {
      const res = await apiFetch(`/settings/ignored_product_statuses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(updated) })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error(e);
      setConfigIgnoredStatuses(configIgnoredStatuses);
      avisar("Erro ao salvar status ignorados", 'erro');
    }
  };

  const configsFiltradas = useMemo(() => {
    const q = linhaSearch.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter(c => c.linha_prefix.toLowerCase().includes(q) || (c.nome_linha || '').toLowerCase().includes(q));
  }, [configs, linhaSearch]);

  const overridesFiltrados = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return allOverrides;
    return allOverrides.filter(o => {
      const desc = products.find(p => p.codigo === o.codigo)?.descricao || '';
      return o.codigo.toLowerCase().includes(q) || desc.toLowerCase().includes(q) || (o.observacao || '').toLowerCase().includes(q);
    });
  }, [allOverrides, products, auditSearch]);

  const auditTotalPaginas = Math.max(1, Math.ceil(overridesFiltrados.length / AUDIT_POR_PAGINA));
  const auditPaginaAtual = Math.min(auditPage, auditTotalPaginas);
  const overridesPagina = overridesFiltrados.slice((auditPaginaAtual - 1) * AUDIT_POR_PAGINA, auditPaginaAtual * AUDIT_POR_PAGINA);

  const renderStatusBadge = (status: string | null, categoria?: string | null, codigo?: string | null) => {
    const statusVal = status || 'ativo';
    // Ciclo de vida — não incluir roteamento (cat_base)
    const styles: Record<string, string> = {
      ativo: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      lancamento: 'bg-zinc-900 text-white border-zinc-900',
      saindo_de_linha: 'bg-amber-50 text-amber-700 border-amber-100',
      descontinuado: 'bg-rose-50 text-rose-700 border-rose-100',
      terceirizado: 'bg-white text-zinc-600 border-zinc-300',
    };

    const labels: Record<string, string> = {
      ativo: 'Ativa',
      lancamento: 'Lançamento',
      saindo_de_linha: 'Saindo de Linha',
      descontinuado: 'Saiu de Linha',
      terceirizado: 'Terceirizado',
    };

    const lifeStatus = statusVal === 'bases' ? 'ativo' : statusVal;
    const isBase = eBase(codigo, categoria, statusVal);

    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className={cn("inline-flex items-center px-2.5 py-1 border text-[11px] font-bold rounded-full whitespace-nowrap", styles[lifeStatus] || styles.ativo)}>
          {labels[lifeStatus] || labels.ativo}
        </span>
        {isBase && (
          <span className="inline-flex items-center px-2.5 py-1 border text-[11px] font-bold rounded-full whitespace-nowrap bg-zinc-100 text-zinc-700 border-zinc-200">
            Base
          </span>
        )}
      </span>
    );
  };

  const getCategoryName = (catId: string | null) => {
    if (!catId) return 'Nenhuma';
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.name : catId;
  };

  return (
    <div className="flex flex-1 h-full bg-zinc-50 font-sans text-zinc-900 overflow-hidden w-full">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0 -mt-px">

        {/* Navigation Tabs */}
        <div className="p-2 border-b border-zinc-100 space-y-0.5">
          <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Painel Ativos
          </div>
          {([
            { id: 'status' as const, label: 'Status dos Produtos', icon: CheckCircle2 },
            { id: 'linhas' as const, label: 'Definição de Linhas', icon: Layers },
            { id: 'kits' as const, label: 'Composição de Kits', icon: Database },
            { id: 'overrides' as const, label: 'Audit de Overrides', icon: ShieldAlert },
            { id: 'configuracoes' as const, label: 'Configurações', icon: Settings },
          ]).map((item) => {
            const Icon = item.icon;
            const isActive = activeAtivosTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveAtivosTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer",
                  isActive
                    ? "bg-zinc-900 text-white font-bold shadow-sm"
                    : "text-zinc-600 font-medium hover:bg-zinc-50 hover:text-zinc-900"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : item.id === 'overrides' ? "text-rose-500" : "text-zinc-400")} />
                <span className="truncate text-left">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sidebar Info/Stats */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3.5 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Produtos</span>
              <span className="text-sm font-extrabold text-zinc-900 tabular-nums">{products.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Linhas</span>
              <span className="text-sm font-extrabold text-zinc-900 tabular-nums">{configs.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Overrides</span>
              <span className="text-sm font-extrabold text-amber-600 tabular-nums">{allOverrides.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <main className="flex-1 overflow-y-auto p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6 no-print">
            <div />
            <button 
              onClick={loadData}
              className="p-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-zinc-650 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm cursor-pointer active:scale-98"
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </button>
          </div>
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
              <div className="toolbar-section !rounded-2xl !mb-0 shrink-0">
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* Search Bar */}
                  <div className="relative lg:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Buscar por código ou descrição (ex: 10.13.003)..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm font-medium"
                    />
                  </div>

                  {/* Type Filter */}
                  <div className="relative">
                    <select
                      value={productTypeFilter}
                      onChange={(e) => setProductTypeFilter(e.target.value as any)}
                      className="w-full pl-3 pr-8 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm appearance-none cursor-pointer font-semibold text-zinc-700"
                    >
                      <option value="ALL">Todos os Tipos</option>
                      <option value="PRODUCTS">Produtos Acabados</option>
                      <option value="KITS">Kits Comerciais</option>
                    </select>
                    <Layers className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  </div>

                  {/* Status Filter */}
                  <div className="relative">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm appearance-none cursor-pointer"
                    >
                      <option value="ALL">Todos os Status</option>
                      <option value="ativo">Ativa</option>
                      <option value="lancamento">Lançamento</option>
                      <option value="saindo_de_linha">Saindo de Linha</option>
                      <option value="descontinuado">Saiu de Linha</option>
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
                    <ListFilter className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  </div>
                </div>

                <div className="w-full flex items-center justify-between text-xs text-zinc-500 font-semibold pt-1 border-t border-zinc-100 mt-1">
                  <span>{filteredProducts.length} de {products.length} produtos</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Categoria</span>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="bg-white border border-zinc-200 rounded-lg px-2 py-1 text-zinc-700 hover:text-zinc-900 cursor-pointer font-bold focus:outline-none focus:ring-1 focus:ring-zinc-900"
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
              <div className="table-card !rounded-2xl !mb-0 flex-1 overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-auto table-wrapper">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-150 font-bold text-zinc-500 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 w-10 text-center">
                          <input 
                            type="checkbox"
                            checked={filteredProducts.length > 0 && selectedCodes.size === filteredProducts.length}
                            onChange={handleSelectAll}
                            className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                          />
                        </th>
                        <th className="px-4 py-3 w-24 text-[10px] uppercase tracking-wider">Código</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-wider">Descrição</th>
                        <th className="px-4 py-3 w-40 text-[10px] uppercase tracking-wider">Linha de Venda</th>
                        <th className="px-4 py-3 min-w-[9.5rem] text-[10px] uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 w-40 text-[10px] uppercase tracking-wider">Categoria</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-wider">Obs.</th>
                        <th className="px-4 py-3 w-16 text-center text-[10px] uppercase tracking-wider">Editar</th>
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
                          const isKit = Boolean(
                            p.is_kit || 
                            p.categoria_produto === 'kit' || 
                            (p.categoria_produto && kitCategoryIds.includes(p.categoria_produto)) || 
                            kitComposicao.some(kc => kc.kit_codigo === p.codigo)
                          );
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
                              <td className="px-4 py-2.5 font-bold text-zinc-800">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span>{p.descricao}</span>
                                  {isKit && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide bg-zinc-100 text-zinc-700 border border-zinc-200 rounded">
                                      KIT
                                    </span>
                                  )}
                                  {p.produzir_apenas_kit === 1 && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-250 rounded" title={p.parent_kits?.length ? `Usado nos kits: ${p.parent_kits.join(', ')}` : 'Produzido apenas para kits'}>
                                      Apenas Kit
                                    </span>
                                  )}
                                  {p.is_kit_component && p.produzir_apenas_kit !== 1 && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 bg-zinc-100 border border-zinc-200 rounded" title={p.parent_kits?.length ? `Usado nos kits: ${p.parent_kits.join(', ')}` : 'Componente de kit'}>
                                      Comp. Kit
                                    </span>
                                  )}
                                </div>
                              </td>
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
                              <td className="px-4 py-3 align-middle">{renderStatusBadge(p.status_produto, p.categoria_produto, p.codigo)}</td>
                              <td className="px-4 py-2.5">
                                {p.categoria_produto ? (
                                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-650 border border-zinc-200 rounded text-[10px] font-bold">
                                    {getCategoryName(p.categoria_produto)}
                                  </span>
                                ) : (
                                  <span className="text-zinc-350 italic scale-95 font-medium">Nenhuma</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 max-w-[200px] truncate text-zinc-500 font-medium" title={p.observacao || undefined}>
                                {p.observacao || '-'}
                              </td>
                              <td className="px-4 py-2.5 text-center flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleOpenEdit(p)}
                                  className="p-1.5 hover:bg-zinc-150 text-zinc-400 hover:text-zinc-800 rounded-lg transition-colors cursor-pointer"
                                  title="Editar Produto/Kit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                {isKit && (
                                  <button
                                    onClick={() => {
                                      setSelectedDrawerKitCode(p.codigo);
                                      setSelectedDrawerKitDesc(p.descricao);
                                      setIsDrawerOpen(true);
                                    }}
                                    className="p-1.5 hover:bg-zinc-100 text-zinc-600 rounded-lg transition-colors cursor-pointer"
                                    title="Gerenciar Composição do Kit"
                                  >
                                    <Layers className="w-4 h-4" />
                                  </button>
                                )}
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
                          <option value="ativo">Ativa</option>
                          <option value="lancamento">Lançamento</option>
                          <option value="saindo_de_linha">Saindo de Linha</option>
                          <option value="descontinuado">Saiu de Linha</option>
                          <option value="terceirizado">Terceirizado</option>
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
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar linha por prefixo ou nome..."
                    value={linhaSearch}
                    onChange={(e) => setLinhaSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm font-medium"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRecalcularLinhas}
                    className="bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 border border-zinc-200 transition-all cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Recalcular linhas dos produtos
                  </button>
                  <button
                    onClick={() => handleOpenLineModal(null)}
                    className="bg-zinc-900 hover:bg-zinc-850 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    Nova Linha
                  </button>
                </div>
              </div>

              {/* Config Table Card */}
              <div className="table-card !rounded-2xl !mb-0 overflow-hidden flex flex-col">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500">
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
                    {configsFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-zinc-400">Nenhuma configuração de linha encontrada.</td>
                      </tr>
                    ) : (
                      configsFiltradas.map(cfg => (
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
                              cfg.visivel === 0 ? "bg-zinc-100 text-zinc-500 border-zinc-200" : "bg-zinc-900 text-white border-zinc-900"
                            )}>
                              {cfg.visivel === 0 ? "Oculto" : "Ativo"}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right space-x-2">
                            <button
                              onClick={() => handleOpenLineModal(cfg)}
                              className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-lg font-bold text-zinc-700 transition-colors cursor-pointer border border-zinc-250/30"
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
              <span className="text-xs font-bold text-zinc-455 shrink-0">
                Catálogo mestre dos Kits comerciais e montáveis da Natum com suporte a insumos fracionários.
              </span>

              {/* Toolbar com importação Excel e busca */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative w-full max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Buscar kit por código ou descrição..."
                      value={kitCompSearch}
                      onChange={(e) => setKitCompSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-xs font-medium transition-all"
                    />
                  </div>
                </div>

                {/* Excel import & Compor Novo Kit */}
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNewKitModalOpen(true)}
                    className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 h-[36px]"
                  >
                    <Plus className="w-4 h-4" />
                    Compor Novo Kit
                  </button>

                  <label className="bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 h-[36px]">
                    <UploadCloud className="w-4 h-4 text-zinc-500" />
                    {uploadingKitsConfig ? 'Importando...' : 'Importar Excel (.xlsx)'}
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

              {/* Lista Mestre-Detalhe dos Kits Montáveis */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
                <div className="px-6 py-3.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between text-xs font-bold text-zinc-600">
                  <span>Catálogo de Kits Montáveis ({masterKitsList.length})</span>
                  <span className="text-[11px] text-zinc-400 font-normal">Clique em um kit para gerenciar seus insumos/proporções</span>
                </div>

                <div className="overflow-y-auto flex-1 p-4">
                  {masterKitsList.length === 0 ? (
                    <div className="p-12 text-center text-zinc-400 font-bold space-y-2">
                      <Layers className="w-8 h-8 mx-auto text-zinc-300" />
                      <p>Nenhum kit encontrado no catálogo.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {masterKitsList.map((kit) => {
                        const kitItems = kitComposicao.filter(row => row.kit_codigo === kit.codigo);
                        const compCount = kitItems.length;
                        return (
                          <div
                            key={kit.codigo}
                            onClick={() => {
                              setSelectedDrawerKitCode(kit.codigo);
                              setSelectedDrawerKitDesc(kit.descricao);
                              setIsDrawerOpen(true);
                            }}
                            className="p-4 bg-white border border-zinc-200 hover:border-zinc-900 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-4 group relative overflow-hidden"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-extrabold px-2.5 py-1 bg-zinc-100 group-hover:bg-zinc-900 group-hover:text-white text-zinc-900 rounded-lg transition-colors">
                                  {kit.codigo}
                                </span>
                                {compCount > 0 ? (
                                  <span className="px-2.5 py-1 bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-full font-bold text-[11px] inline-flex items-center gap-1">
                                    <Layers className="w-3.5 h-3.5 text-zinc-500" />
                                    {compCount} {compCount === 1 ? 'insumo' : 'insumos'}
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full font-bold text-[11px] inline-flex items-center gap-1 animate-pulse">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                    Sem composição
                                  </span>
                                )}
                              </div>

                              <h4 className="text-sm font-bold text-zinc-900 line-clamp-2 leading-snug">
                                {kit.descricao}
                              </h4>
                            </div>

                            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                              <div className="text-[11px] text-zinc-500 font-medium">
                                {compCount > 0 ? (
                                  <span className="text-zinc-600">
                                    Insumos ativos vinculados
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-semibold">
                                    Configure a estrutura do kit
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="px-3 py-1.5 bg-zinc-100 group-hover:bg-zinc-900 text-zinc-700 group-hover:text-white rounded-xl font-bold transition-all inline-flex items-center gap-1.5 shadow-xs"
                              >
                                Ver / Editar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeAtivosTab === 'overrides' && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="relative w-full max-w-sm shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, descrição ou observação..."
                  value={auditSearch}
                  onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm font-medium"
                />
              </div>

              {/* Overrides Table Card */}
              <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500">
                    <tr>
                      <th className="px-4 py-3.5 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={overridesFiltrados.length > 0 && selectedOverrideCodes.size === overridesFiltrados.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const codes = overridesFiltrados.map(o => o.codigo);
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
                    {overridesFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-400">
                          {allOverrides.length === 0
                            ? 'Nenhum override manual cadastrado. Todos os produtos seguem as regras automáticas de suas linhas.'
                            : 'Nenhum override encontrado para essa busca.'}
                        </td>
                      </tr>
                    ) : (
                      overridesPagina.map(ovr => {
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
                        if (ovr.categoria_produto !== null) mods.push(`Categoria Manual (${categories.find(c => c.id === ovr.categoria_produto)?.name || 'categoria removida'})`);

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
                              <div className="flex flex-wrap gap-1">
                                {mods.map((m, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-250/50 rounded-full text-[10px] font-bold whitespace-nowrap">
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
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold border border-rose-150 transition-colors cursor-pointer"
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
                {overridesFiltrados.length > AUDIT_POR_PAGINA && (
                  <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-100 bg-zinc-50 text-xs font-semibold text-zinc-600">
                    <span>
                      {(auditPaginaAtual - 1) * AUDIT_POR_PAGINA + 1}–{Math.min(auditPaginaAtual * AUDIT_POR_PAGINA, overridesFiltrados.length)} de {overridesFiltrados.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={auditPaginaAtual <= 1}
                        onClick={() => setAuditPage(auditPaginaAtual - 1)}
                        className="px-2.5 py-1 bg-white border border-zinc-200 rounded-lg font-bold text-zinc-700 disabled:opacity-40 cursor-pointer"
                      >
                        Anterior
                      </button>
                      <span>Página {auditPaginaAtual} de {auditTotalPaginas}</span>
                      <button
                        type="button"
                        disabled={auditPaginaAtual >= auditTotalPaginas}
                        onClick={() => setAuditPage(auditPaginaAtual + 1)}
                        className="px-2.5 py-1 bg-white border border-zinc-200 rounded-lg font-bold text-zinc-700 disabled:opacity-40 cursor-pointer"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
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
            <div className="flex-1 flex flex-col space-y-4">
              {/* Secondary Sub-Tabs Nav */}
              <div className="flex gap-1.5 p-1 bg-zinc-100/80 border border-zinc-200 rounded-2xl shrink-0 w-fit">
                <button
                  onClick={() => setConfigSubTab('parametros')}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 focus:outline-none",
                    configSubTab === 'parametros'
                      ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                      : "text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Parâmetros
                </button>
                <button
                  onClick={() => setConfigSubTab('status')}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 focus:outline-none",
                    configSubTab === 'status'
                      ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                      : "text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Status
                </button>
                <button
                  onClick={() => setConfigSubTab('categorias')}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 focus:outline-none",
                    configSubTab === 'categorias'
                      ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
                      : "text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Categorias
                </button>
              </div>

              {/* Sub-Tab Contents */}
              <div className="flex-1 overflow-y-auto pr-1">
                {configSubTab === 'parametros' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Parâmetros Globais
                      </h3>
                      <form onSubmit={handleSaveGlobalSettings} className="space-y-3.5 text-left">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Dias Comerciais por Mês</label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-800"
                            value={globalDiasComerciais}
                            onChange={(e) => setGlobalDiasComerciais(e.target.value)}
                            required
                          />
                          <span className="text-[10px] text-zinc-450 block leading-tight">
                            Converte meses ideais e prazos em dias na tabela.
                          </span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Itens por Página</label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-800"
                            value={globalLimitPerPage}
                            onChange={(e) => setGlobalLimitPerPage(e.target.value)}
                            required
                          />
                          <span className="text-[10px] text-zinc-450 block leading-tight">
                            Paginação padrão de estoque e produção.
                          </span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Meta de Giro (Lançamentos)</label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-800"
                            value={globalLancamentoMeta}
                            onChange={(e) => setGlobalLancamentoMeta(e.target.value)}
                            required
                          />
                          <span className="text-[10px] text-zinc-450 block leading-tight">
                            Meses padrão até graduar Lançamento → Ativo.
                          </span>
                        </div>

                        <button
                          type="submit"
                          disabled={globalSettingsSaving}
                          className="w-full bg-zinc-900 hover:bg-zinc-850 disabled:bg-zinc-300 text-white text-xs font-bold py-2 rounded-xl shadow-sm transition-all cursor-pointer flex justify-center items-center"
                        >
                          {globalSettingsSaving ? 'Salvando...' : 'Salvar Parâmetros'}
                        </button>
                      </form>
                    </div>

                    <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Regras de negócio
                      </h3>
                      
                      <div className="space-y-4 text-xs text-zinc-650 leading-relaxed text-left">
                        <div>
                          <h4 className="font-bold text-zinc-800 mb-1.5">Status do produto</h4>
                          <ul className="space-y-1 text-zinc-500 text-[11px]">
                            <li><strong className="text-zinc-700">Ativa:</strong> estoque ideal via dias-estoque da linha × média móvel.</li>
                            <li><strong className="text-zinc-700">Lançamento:</strong> meta manual; gradua para Ativa após o giro configurado.</li>
                            <li><strong className="text-zinc-700">Saindo de Linha:</strong> produz para consumir materiais; compras exclusivas freiam gradualmente.</li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-bold text-zinc-800 mb-1.5">Roteamento por categoria</h4>
                          <ul className="space-y-1 text-zinc-500 text-[11px]">
                            <li><strong className="text-zinc-700">MP / Embalagem:</strong> painel geral de Compras.</li>
                            <li><strong className="text-zinc-700">Base (`cat_base`):</strong> Produção → Gestão de Bases.</li>
                            <li><strong className="text-zinc-700">Coloração / Apoio:</strong> painéis exclusivos em Compras.</li>
                          </ul>
                        </div>

                        <div className="bg-amber-50/60 border border-amber-100 rounded-xl px-3.5 py-3">
                          <p className="text-[11px] text-amber-800 leading-relaxed">
                            <strong>Fim de linha:</strong> embalagens exclusivas suspendem na hora; MPs seguem enquanto houver saldo de embalagem, para escoar o acabado.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {configSubTab === 'status' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Status ignorados no planejamento
                      </h3>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Ciclo de vida desconsiderado na demanda. Categorias de roteamento ficam na aba Categorias.
                      </p>
                      
                      <div className="space-y-1.5 pt-1">
                        {['ativo', 'lancamento', 'saindo_de_linha', 'descontinuado', 'terceirizado'].map(statusVal => {
                          const labelMap: Record<string, string> = {
                            ativo: 'Ativa',
                            lancamento: 'Lançamento',
                            saindo_de_linha: 'Saindo de Linha',
                            descontinuado: 'Saiu de Linha',
                            terceirizado: 'Terceirizado',
                          };
                          const descMap: Record<string, string> = {
                            ativo: 'Planejamento normal.',
                            lancamento: 'Meta manual e giro progressivo.',
                            saindo_de_linha: 'Compra freada; consome estoque.',
                            descontinuado: 'Produção e compras zeradas.',
                            terceirizado: 'Sem requisição local de insumos.',
                          };
                          const isChecked = configIgnoredStatuses.includes(statusVal);
                          return (
                            <label key={statusVal} className="flex items-start gap-3 p-2.5 hover:bg-zinc-50 rounded-xl transition-colors cursor-pointer border border-zinc-100">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleIgnoredStatus(statusVal)}
                                className="mt-0.5 rounded border-zinc-350 text-zinc-900 focus:ring-zinc-900 h-4 w-4"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-zinc-800">{labelMap[statusVal]}</div>
                                <span className="text-[10px] text-zinc-400 font-medium leading-snug block">
                                  {descMap[statusVal]}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-3 text-xs text-zinc-600 leading-relaxed text-left">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Como funciona</h4>
                      <p>
                        Status <strong>ignorado</strong> sai das planilhas de demanda e estimativas de dias de estoque — evita alertas falsos para itens fora de catálogo ou terceirizados.
                      </p>
                      <p>
                        <strong>Saindo de Linha</strong> mantém comportamento dinâmico para MPs mesmo se marcado, visando consumir embalagens remanescentes.
                      </p>
                    </div>
                  </div>
                )}

                {configSubTab === 'categorias' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div className="md:col-span-3 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-[11px] text-zinc-600">
                      <strong className="text-zinc-800">Categorias ≠ Status.</strong> Status = ciclo de vida. Categorias = roteamento (Compras / Estoque / Produção).
                    </div>
                    <div className="md:col-span-1 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Nova Subcategoria
                      </h3>
                      
                      <form onSubmit={handleAddCategory} className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nome</label>
                          <input
                            type="text"
                            placeholder="Ex: Tonalizantes, Fragrâncias..."
                            value={configNewCatName}
                            onChange={(e) => setConfigNewCatName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-medium"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Categoria Pai</label>
                          <select
                            value={configNewCatParent}
                            onChange={(e) => setConfigNewCatParent(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-medium"
                            required
                          >
                            <option value="">Selecione...</option>
                            <option value="cat_mp">Matéria Prima</option>
                            <option value="cat_emb">Embalagem</option>
                            <option value="cat_mat">Materiais</option>
                            <option value="cat_coloracao">Coloração</option>
                            <option value="cat_apoio">Material de Apoio</option>
                            <option value="cat_base">Base de Produção</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="w-full bg-zinc-900 hover:bg-zinc-850 text-white text-xs font-bold py-2 rounded-xl shadow-sm transition-all cursor-pointer"
                        >
                          Adicionar Subcategoria
                        </button>
                      </form>
                    </div>

                    <div className="md:col-span-2 bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4">
                      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-100 pb-2">
                        Subcategorias cadastradas
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
                                  <div className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider">Pai: {parentName}</div>
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

      {/* Edit Line Config */}
      {isLineModalOpen && (
        <Drawer
          onClose={() => setIsLineModalOpen(false)}
          size="sm"
          title={editingLineConfig ? 'Editar Configuração de Linha' : 'Nova Configuração de Linha'}
          footer={
            <>
              <button
                type="button"
                onClick={() => setIsLineModalOpen(false)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-config-linha"
                disabled={lineSaving}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
            </>
          }
        >
          <form id="form-config-linha" onSubmit={handleSaveLineConfig} className="space-y-4 text-left">
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

            <div className="border-t border-zinc-150 pt-3 mt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">Multiplicadores & Segurança</span>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-650 block" title="Calcula o estoque ideal em meses de venda média">Estoque Ideal (Meses)</label>
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
                  <label className="text-[11px] font-bold text-zinc-650 block" title="Segurança estatística Z para cálculo de estoque mínimo">Fator de Segurança Z</label>
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
                  <label className="text-[11px] font-bold text-zinc-650 block" title="Multiplicador do ponto de ressuprimento/abrir ordem">Mult. Abrir Ordem</label>
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
                  <label className="text-[11px] font-bold text-zinc-650 block" title="Multiplicador da quantidade ideal a produzir/lote recomendado">Mult. Lote Produção</label>
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
                <label className="text-[11px] font-bold text-zinc-650 block">Visibilidade no Painel de Planejamento</label>
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
          </form>
        </Drawer>
      )}

      {/* Edit Drawer (Side panel) */}
      {selectedProduct && (
        <Drawer
          onClose={() => setSelectedProduct(null)}
          size="sm"
          title="Configurar Produto"
          subtitle={`Código: ${selectedProduct.codigo}`}
          loading={drawerLoading}
          loadingText="Carregando overrides do produto..."
          footer={
            <>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-override-produto"
                disabled={drawerLoading}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-950 text-white rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Salvar
              </button>
            </>
          }
        >
          <form id="form-override-produto" onSubmit={handleSaveIndividualOverride} className="space-y-5 text-left">
            {/* Product Info Display */}
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Descrição</span>
              <p className="font-bold text-zinc-800 text-sm">{selectedProduct?.descricao}</p>
            </div>

            {/* Kit Fast Action Banner if it's a Kit */}
            {(selectedProduct?.is_kit || selectedProduct?.categoria_produto === 'kit' || kitComposicao.some(kc => kc.kit_codigo === selectedProduct?.codigo)) && (
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-zinc-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-zinc-600" />
                    Kit Comercial Montável
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 leading-snug">
                  Este item é montado a partir de componentes/insumos.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedProduct) {
                      setSelectedDrawerKitCode(selectedProduct.codigo);
                      setSelectedDrawerKitDesc(selectedProduct.descricao);
                      setIsDrawerOpen(true);
                    }
                  }}
                  className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                  Ver / Editar Composição deste Kit
                </button>
              </div>
            )}

            {/* Status Select — ciclo de vida */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 block">Status de ciclo de vida</label>
              <select
                value={statusForm}
                onChange={(e) => setStatusForm(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
              >
                {PRODUCT_LINE_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <span className="text-[10px] text-zinc-400 font-semibold block leading-tight">
                {PRODUCT_LINE_STATUSES.find(s => s.value === statusForm)?.description || (categoryForm === 'cat_base' ? 'Produto base: use a categoria abaixo; status de ciclo de vida continua aplicável.' : 'Status alteram recomendações de produção e compras.')}
              </span>
            </div>

            {/* Modo de Demanda & Produção (Apenas Kit vs Vendido Individual) */}
            <div className="space-y-1.5 p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
              <label className="text-xs font-bold text-zinc-700 block">Modo de Demanda & Produção</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProduzirApenasKitForm(0)}
                  className={`p-2.5 rounded-lg text-xs font-bold border transition-all text-left flex flex-col gap-0.5 cursor-pointer ${
                    produzirApenasKitForm === 0
                      ? 'bg-white border-zinc-900 shadow-xs text-zinc-900'
                      : 'bg-zinc-100/60 border-zinc-200 text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <span>Vendido Individual</span>
                  <span className="text-[10px] font-normal text-zinc-400">Tem vendas avulsas e pode compor kits</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProduzirApenasKitForm(1)}
                  className={`p-2.5 rounded-lg text-xs font-bold border transition-all text-left flex flex-col gap-0.5 cursor-pointer ${
                    produzirApenasKitForm === 1
                      ? 'bg-zinc-900 border-zinc-900 shadow-xs text-white'
                      : 'bg-zinc-100/60 border-zinc-200 text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <span>Apenas para Kit</span>
                  <span className="text-[10px] font-normal text-zinc-400">Demanda gerada pela montagem dos kits</span>
                </button>
              </div>
              {selectedProduct?.parent_kits && selectedProduct.parent_kits.length > 0 && (
                <p className="text-[10px] text-zinc-500 pt-1">
                  Utilizado nos kits: <strong className="text-zinc-700">{selectedProduct.parent_kits.join(', ')}</strong>
                </p>
              )}
            </div>

            {/* Launch Parameters (conditional) */}
            {statusForm === 'lancamento' && (
              <div className="bg-zinc-50 border border-zinc-150 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-200">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Configurações de Lançamento</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-650 block">Meta de Giro (Meses)</label>
                    <input
                      type="number"
                      min="1"
                      value={lancamentoMetaForm}
                      onChange={(e) => setLancamentoMetaForm(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-650 block">Data de Início</label>
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

            {/* Grouped Category Select — roteamento Compras/Estoque */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 block">Categoria de roteamento</label>
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

            {categoryForm !== 'cat_base' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 block">Produto base vinculado</label>
                <input
                  type="text"
                  list="base-produtos-list"
                  placeholder="Código do produto base (cat_base)"
                  value={baseCodigoForm}
                  onChange={(e) => setBaseCodigoForm(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium font-mono"
                />
                <datalist id="base-produtos-list">
                  {products.filter((p) => eBase(p.codigo, p.categoria_produto, p.status_produto)).map((p) => (
                    <option key={p.codigo} value={p.codigo}>{p.descricao}</option>
                  ))}
                </datalist>
                <span className="text-[10px] text-zinc-400 block">Usado como sugestão na resolução de lotes de produção.</span>
              </div>
            )}

            {/* Line Override */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 block">Linha de Venda (Override)</label>
              <select
                value={lineOverride}
                onChange={(e) => setLineOverride(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-medium"
              >
                <option value="AUTO">Automático (pelo código do produto)</option>
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
                <option value="AUTO">Automático (segue o status: Lançamento é lançamento)</option>
                <option value="YES">Sim (Forçar Lançamento)</option>
                <option value="NO">Não (Forçar Normal)</option>
              </select>
            </div>

            {/* Política de Estoque Ideal */}
            <div className="space-y-2 p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
              <label className="text-xs font-bold text-zinc-700 block">Política de Estoque Ideal</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                  <input
                    type="radio"
                    name="stockPolicy"
                    checked={!idealStockOverride}
                    onChange={() => setIdealStockOverride('')}
                    className="text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                  />
                  Variável (Média da Linha)
                </label>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                  <input
                    type="radio"
                    name="stockPolicy"
                    checked={Boolean(idealStockOverride)}
                    onChange={() => {
                      if (!idealStockOverride) {
                        const defaultQty = selectedProduct?.estoque_ideal_qtd ? Math.round(selectedProduct.estoque_ideal_qtd) : 100;
                        setIdealStockOverride(String(defaultQty));
                      }
                    }}
                    className="text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                  />
                  Fixo em Unidades
                </label>
              </div>

              {idealStockOverride ? (
                <div className="space-y-1 pt-1">
                  <label className="text-[11px] font-bold text-zinc-650 block">Estoque Ideal Fixo (Unidades Alvo)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 500"
                    value={idealStockOverride}
                    onChange={(e) => setIdealStockOverride(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 text-xs font-bold text-zinc-900"
                  />
                  <span className="text-[10px] text-zinc-400 block">
                    O sistema usará fixamente {idealStockOverride || 0} unidades como alvo ideal, sem recalcular por média móvel.
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-zinc-500 bg-white p-2.5 rounded-lg border border-zinc-200 leading-relaxed">
                  <span className="font-semibold text-zinc-700">Calculado dinamicamente:</span> Média Mensal ({selectedProduct?.media_vendas?.toFixed(1) || '0.0'}) × Multiplicador da Linha ({configs.find(c => c.linha_prefix === (lineOverride === 'AUTO' ? selectedProduct?.linha_prefix : lineOverride))?.estoque_ideal_mult || 3.0} meses) = <strong className="text-zinc-900 font-bold">{Math.round(selectedProduct?.estoque_ideal_qtd || 0)} un ideais</strong>.
                </div>
              )}
            </div>

            <div className="border-t border-zinc-150 my-2 pt-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-3">Overrides de Vendas & Carteira</span>
              
              <div className="grid grid-cols-2 gap-3">
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
              </div>

              <div className="mt-3">
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
          </form>
        </Drawer>
      )}

      <KitCompositionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        kitCodigo={selectedDrawerKitCode}
        kitDescricao={selectedDrawerKitDesc}
        onCompositionUpdated={() => {
          fetchKitComposicao();
        }}
      />

      {/* Compor novo kit: escolher o produto */}
      {isNewKitModalOpen && (
        <Drawer
          onClose={() => { setIsNewKitModalOpen(false); setNewKitSearch(''); }}
          size="md"
          title="Definir Composição para Novo Kit"
          footer={
            <button
              type="button"
              onClick={() => { setIsNewKitModalOpen(false); setNewKitSearch(''); }}
              className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          }
        >
          <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
            <p className="text-xs text-zinc-500 font-medium">
              Pesquise e selecione qualquer produto cadastrado no sistema para iniciar a definição da sua composição (estrutura de insumos).
            </p>

            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Pesquise por código ou descrição do produto..."
                value={newKitSearch}
                onChange={(e) => setNewKitSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-xs font-semibold text-zinc-900"
              />
            </div>

            <div className="flex-1 overflow-y-auto border border-zinc-200 rounded-xl divide-y divide-zinc-100">
              {products
                .filter(p => {
                  if (!newKitSearch.trim()) return false;
                  const q = newKitSearch.toLowerCase();
                  return (
                    (p.codigo || '').toLowerCase().includes(q) ||
                    (p.descricao || '').toLowerCase().includes(q)
                  );
                })
                .slice(0, 50)
                .map(p => {
                  const isAlreadyKit = kitComposicao.some(kc => kc.kit_codigo === p.codigo);
                  return (
                    <button
                      key={p.codigo}
                      type="button"
                      onClick={() => {
                        setSelectedDrawerKitCode(p.codigo);
                        setSelectedDrawerKitDesc(p.descricao);
                        setIsDrawerOpen(true);
                        setIsNewKitModalOpen(false);
                        setNewKitSearch('');
                      }}
                      className="w-full text-left p-3 hover:bg-zinc-50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md border border-zinc-200">
                            {p.codigo}
                          </span>
                          <span className="text-xs font-bold text-zinc-950 truncate">
                            {p.descricao}
                          </span>
                        </div>
                      </div>
                      {isAlreadyKit ? (
                        <span className="text-[10px] font-bold text-zinc-400 shrink-0">
                          Já possui composição
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-zinc-700 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md shrink-0">
                          Iniciar composição
                        </span>
                      )}
                    </button>
                  );
                })}
              {newKitSearch.trim() && products.filter(p => {
                const q = newKitSearch.toLowerCase();
                return (
                  (p.codigo || '').toLowerCase().includes(q) ||
                  (p.descricao || '').toLowerCase().includes(q)
                );
              }).length === 0 && (
                <div className="p-8 text-center text-zinc-400 font-bold text-xs">
                  Nenhum produto encontrado com essa busca.
                </div>
              )}
              {!newKitSearch.trim() && (
                <div className="p-8 text-center text-zinc-450 font-bold text-xs space-y-1">
                  <Search className="w-5 h-5 text-zinc-350 mx-auto" />
                  <p>Comece a digitar para pesquisar produtos.</p>
                </div>
              )}
            </div>
          </div>
        </Drawer>
      )}

      {previa && (
        <PreviaAcaoDrawer
          previa={previa}
          onClose={() => {
            previa.aoFechar?.();
            setPrevia(null);
          }}
        />
      )}
      {aviso}
    </div>
  );
}
