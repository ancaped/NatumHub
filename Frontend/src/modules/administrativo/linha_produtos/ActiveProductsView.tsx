import { apiFetch } from '../../geral/lib/http';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, CheckCircle2, RefreshCw, ShieldAlert,
  Edit, Check, Filter, Layers, ListFilter, AlertTriangle,
  Database, Trash2, Plus, Loader2, Settings, GraduationCap, UploadCloud
} from 'lucide-react';
import { cn } from '../../geral/lib/utils';
import { Category, PRODUCT_LINE_STATUSES, GraduationCandidate } from '../../geral/lib/types';
import { api } from '../../geral/lib/api';
import { eBase } from '../../geral/lib/regrasProduto';
import KitCompositionDrawer from '../../producao/components/KitCompositionDrawer';
import Drawer from '../../geral/components/ui/Drawer';
import { useAviso } from '../../geral/components/ui/Aviso';
import PreviaAcaoDrawer, { PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';
import ConfiguracoesTab from './ConfiguracoesTab';
import AuditOverridesTab from './AuditOverridesTab';
import type { LineConfig, ProductOverride } from './tipos';
import KitsTab from './KitsTab';
import LinhasTab from './LinhasTab';



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
  const [productTypeFilter, setProductTypeFilter] = useState<'ALL' | 'PRODUCTS' | 'KITS' | 'BASES'>('ALL');
  const POR_PAGINA = 100;
  const [pagina, setPagina] = useState(1);
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
  const [uploadingKitsConfig, setUploadingKitsConfig] = useState(false);

  // States: Drawer de Composição de Kits
  const [selectedDrawerKitCode, setSelectedDrawerKitCode] = useState('');
  const [selectedDrawerKitDesc, setSelectedDrawerKitDesc] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // States: Compor Novo Kit Modal
  const [isNewKitModalOpen, setIsNewKitModalOpen] = useState(false);
  const [newKitSearch, setNewKitSearch] = useState('');

  // Lista Mestre unificada de Kits Montáveis


  // Reset selections when active tab changes
  useEffect(() => {
    setSelectedCodes(new Set());
  }, [activeAtivosTab]);


  // Overrides Audit states
  const [allOverrides, setAllOverrides] = useState<ProductOverride[]>([]);

  // Category & Ignored status configuration states

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodsRes, confRes, ovrRes, catsData, gradRes, kitsRes] = await Promise.all([
        apiFetch(`/products?limit=5000&show_hidden=true&include_kits=true`),
        apiFetch(`/configs`),
        apiFetch(`/overrides`),
        api.getCategories(),
        apiFetch(`/lancamento/graduation-check`),
        apiFetch(`/kits/composicao`)
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
      }
    } catch (e) {
      console.error("Erro ao carregar dados de produtos ativos:", e);
    } finally {
      setLoading(false);
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

      const isBaseProduto = eBase(p.codigo, p.categoria_produto, p.status_produto);
      const matchesType = 
        productTypeFilter === 'ALL' ||
        (productTypeFilter === 'PRODUCTS' && !isKit && !isBaseProduto) ||
        (productTypeFilter === 'KITS' && isKit) ||
        (productTypeFilter === 'BASES' && isBaseProduto);

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
  // Paginação no cliente: volta à primeira página quando qualquer filtro muda.
  useEffect(() => {
    setPagina(1);
  }, [search, statusFilter, lineFilter, categoryFilter, productTypeFilter]);
  const totalPaginas = Math.max(1, Math.ceil(filteredProducts.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const produtosDaPagina = useMemo(
    () => filteredProducts.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA),
    [filteredProducts, paginaAtual],
  );
  const temFiltro = search !== '' || statusFilter !== 'ALL' || lineFilter !== 'ALL' || categoryFilter !== 'ALL' || productTypeFilter !== 'ALL';
  const limparFiltros = () => {
    setSearch('');
    setStatusFilter('ALL');
    setLineFilter('ALL');
    setCategoryFilter('ALL');
    setProductTypeFilter('ALL');
  };

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
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className={cn("inline-flex items-center px-2.5 py-1 border text-[11px] font-bold rounded-full whitespace-nowrap", styles[lifeStatus] || styles.ativo)}>
          {labels[lifeStatus] || labels.ativo}
        </span>
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
                      <option value="BASES">Bases de Produção</option>
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
                  <span className="flex items-center gap-3">
                    {filteredProducts.length} de {products.length} produtos
                    {temFiltro && (
                      <button onClick={limparFiltros} className="text-zinc-500 hover:text-zinc-900 underline underline-offset-2 cursor-pointer">
                        Limpar filtros
                      </button>
                    )}
                  </span>
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
                        <th className="px-4 py-3 w-24 text-[10px] uppercase tracking-wider">Tipo</th>
                        <th className="px-4 py-3 w-48 text-[10px] uppercase tracking-wider">Linha de Venda</th>
                        <th className="px-4 py-3 min-w-[9.5rem] text-[10px] uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 w-40 text-[10px] uppercase tracking-wider">Categoria</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-wider">Obs.</th>
                        <th className="px-4 py-3 w-16 text-center text-[10px] uppercase tracking-wider">Editar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {loading ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-zinc-400 font-medium">
                            <RefreshCw className="h-5 w-5 animate-spin text-zinc-500 mx-auto mb-2" />
                            Carregando produtos...
                          </td>
                        </tr>
                      ) : filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-zinc-400">Nenhum produto corresponde aos filtros aplicados.</td>
                        </tr>
                      ) : (
                        produtosDaPagina.map((p) => {
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
                              <td className="px-4 py-2.5">
                                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-zinc-100 text-zinc-600 border border-zinc-200 rounded">
                                  {isKit ? 'Kit' : eBase(p.codigo, p.categoria_produto, p.status_produto) ? 'Base' : 'Produto'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-zinc-600">
                                {(() => {
                                  const prefixo = p.linha_prefix_manual || p.linha_prefix;
                                  const nome = configs.find(c => c.linha_prefix === prefixo)?.nome_linha || prefixo;
                                  return (
                                    <span className="flex items-center gap-1.5">
                                      {prefixo !== 'DEFAULT' && <span className="font-mono text-[10px] text-zinc-400 shrink-0">{prefixo}</span>}
                                      <span>{nome}</span>
                                      {p.linha_prefix_manual && (
                                        <span className="text-[9px] bg-zinc-100 text-zinc-500 px-1 rounded font-bold uppercase scale-90">manual</span>
                                      )}
                                    </span>
                                  );
                                })()}
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

                {filteredProducts.length > POR_PAGINA && (
                  <div className="px-4 py-2 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between text-xs text-zinc-500 font-semibold shrink-0">
                    <span>
                      {(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, filteredProducts.length)} de {filteredProducts.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPagina(paginaAtual - 1)}
                        disabled={paginaAtual <= 1}
                        className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default"
                      >
                        Anterior
                      </button>
                      <span>Página {paginaAtual} de {totalPaginas}</span>
                      <button
                        onClick={() => setPagina(paginaAtual + 1)}
                        disabled={paginaAtual >= totalPaginas}
                        className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 font-bold disabled:opacity-40 cursor-pointer disabled:cursor-default"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}

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
            <LinhasTab
              products={products}
              configs={configs}
              pedirBulk={pedirBulk}
              pedirPrevia={(p) => setPrevia(p)}
              avisar={avisar}
              onReload={loadData}
            />
          )}

          {activeAtivosTab === 'kits' && (
            <KitsTab
              products={products}
              categories={categories}
              kitComposicao={kitComposicao}
              onAbrirComposicao={(codigo, descricao) => {
                setSelectedDrawerKitCode(codigo);
                setSelectedDrawerKitDesc(descricao);
                setIsDrawerOpen(true);
              }}
              onNovoKit={() => setIsNewKitModalOpen(true)}
              uploadingKits={uploadingKitsConfig}
              onUploadKits={handleUploadKitsConfig}
              pedirPrevia={(p) => setPrevia(p)}
              avisar={avisar}
            />
          )}

          {activeAtivosTab === 'overrides' && (
            <AuditOverridesTab
              allOverrides={allOverrides}
              products={products}
              configs={configs}
              categories={categories}
              pedirBulk={pedirBulk}
              onReload={loadData}
            />
          )}

          {activeAtivosTab === 'configuracoes' && (
            <ConfiguracoesTab
              products={products}
              categories={categories}
              setCategories={setCategories}
              pedirPrevia={(p) => setPrevia(p)}
              avisar={avisar}
              onSettingsSaved={loadData}
            />
          )}
        </main>
      </div>

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
