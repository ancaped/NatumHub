import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Edit, Check, Layers, GraduationCap } from 'lucide-react';
import { apiFetch } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';
import Drawer from '../../geral/components/ui/Drawer';
import { Category, GraduationCandidate, PRODUCT_LINE_STATUSES } from '../../geral/lib/types';
import { eBase, STATUS_IGNORADOS_PADRAO } from '../../geral/lib/regrasProduto';
import type { LineConfig, PedirBulkOpts, ProductOverride, ProductResult } from './tipos';

interface Props {
  products: ProductResult[];
  categories: Category[];
  configs: LineConfig[];
  /** Composição dos kits do ERP (identifica kits e conta componentes). */
  kitComposicao: any[];
  graduationCandidates: GraduationCandidate[];
  loading: boolean;
  /** Ação em lote em 2 passos: prévia no painel e só grava no OK. */
  pedirBulk: (opts: PedirBulkOpts) => Promise<void>;
  avisar: (mensagem: string, tipo?: 'sucesso' | 'erro' | 'info') => void;
  /** Recarrega os dados da tela depois de gravar. */
  onReload: () => Promise<void> | void;
  /** Abre o painel de composição do kit (mora no arquivo principal). */
  /** Abre Produção > Kits (a composição não se edita aqui); ausente se o operador não tem acesso. */
  onAbrirKits?: () => void;
  /** Códigos dos produtos que têm ajuste manual (visão "Ajuste manual"). */
  codigosComAjuste: Set<string>;
}

type Vista = 'todos' | 'ativos' | 'kits' | 'bases' | 'terceirizados' | 'semlinha' | 'ajuste';

const VISTAS: { id: Vista; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'ativos', label: 'Ativos' },
  { id: 'kits', label: 'Kits' },
  { id: 'bases', label: 'Bases' },
  { id: 'terceirizados', label: 'Terceirizados' },
  { id: 'semlinha', label: 'Sem linha' },
  { id: 'ajuste', label: 'Ajuste manual' },
];

/** Aba Produtos da Linha de Produtos: tabela com filtros, paginação, ações em lote e painel de edição do produto. */
export default function StatusTab({ products, categories, configs, kitComposicao, graduationCandidates, loading, pedirBulk, avisar, onReload, onAbrirKits, codigosComAjuste }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [lineFilter, setLineFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [vista, setVista] = useState<Vista>('todos');
  const POR_PAGINA = 100;
  const [pagina, setPagina] = useState(1);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  // Editing Drawer
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const [abaProduto, setAbaProduto] = useState<'geral' | 'ajustes'>('geral');
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
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkLine, setBulkLine] = useState('');

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

  const ehKit = (p: ProductResult) =>
    Boolean(
      p.is_kit ||
      p.categoria_produto === 'kit' ||
      (p.categoria_produto && kitCategoryIds.includes(p.categoria_produto)) ||
      kitComposicao.some(kc => kc.kit_codigo === p.codigo)
    );
  const pertenceVista = (p: ProductResult, v: Vista): boolean => {
    const status = p.status_produto || 'ativo';
    switch (v) {
      case 'todos': return true;
      case 'ativos': return !STATUS_IGNORADOS_PADRAO.includes(status) && p.visivel !== 0;
      case 'kits': return ehKit(p);
      case 'bases': return eBase(p.codigo, p.categoria_produto, p.status_produto);
      case 'terceirizados': return status === 'terceirizado';
      case 'semlinha': return (p.linha_prefix_manual || p.linha_prefix || 'DEFAULT') === 'DEFAULT';
      case 'ajuste': return codigosComAjuste.has(p.codigo);
    }
  };
  const contagemVistas = useMemo(() => {
    const cont: Record<string, number> = {};
    for (const v of VISTAS) cont[v.id] = products.filter(p => pertenceVista(p, v.id)).length;
    return cont;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, categories, kitComposicao, codigosComAjuste]);

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

      return matchesSearch && matchesStatus && matchesLine && matchesCategory && pertenceVista(p, vista);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, statusFilter, lineFilter, categoryFilter, vista, categories, kitCategoryIds, kitComposicao, codigosComAjuste]);

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
  }, [search, statusFilter, lineFilter, categoryFilter, vista]);
  const totalPaginas = Math.max(1, Math.ceil(filteredProducts.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const produtosDaPagina = useMemo(
    () => filteredProducts.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA),
    [filteredProducts, paginaAtual],
  );
  const temFiltro = search !== '' || statusFilter !== 'ALL' || lineFilter !== 'ALL' || categoryFilter !== 'ALL' || vista !== 'todos';
  const limparFiltros = () => {
    setSearch('');
    setStatusFilter('ALL');
    setLineFilter('ALL');
    setCategoryFilter('ALL');
    setVista('todos');
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
    setAbaProduto('geral');
    
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
        await onReload();
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
        await onReload();
      },
      aoCancelar: () => {
        setBulkStatus('');
        setBulkLine('');
        setBulkCategory('');
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

  const handleGraduateAll = async () => {
    if (graduationCandidates.length === 0) return;
    await pedirBulk({
      titulo: `Graduar ${graduationCandidates.length} candidato(s) para "Ativa"`,
      codigos: graduationCandidates.map(c => c.codigo),
      action: 'graduar_lancamento',
      value: null,
      confirmarRotulo: 'Graduar',
      aoConcluir: async () => { await onReload(); },
    });
  };

  return (
    <>
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
              {/* Busca, filtros e visões */}
              <div className="bg-white border border-zinc-200 rounded-2xl p-3 shrink-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[260px] max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Buscar por código ou descrição (ex: 10.13.003)"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-sm font-medium"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filtrar por status"
                    className="h-9 pl-3 pr-8 bg-white border border-zinc-200 rounded-xl text-[13px] text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                  >
                    <option value="ALL">Todos os status</option>
                    <option value="ativo">Ativa</option>
                    <option value="lancamento">Lançamento</option>
                    <option value="saindo_de_linha">Saindo de Linha</option>
                    <option value="descontinuado">Saiu de Linha</option>
                    <option value="terceirizado">Terceirizado</option>
                  </select>
                  <select
                    value={lineFilter}
                    onChange={(e) => setLineFilter(e.target.value)}
                    aria-label="Filtrar por linha"
                    className="h-9 pl-3 pr-8 bg-white border border-zinc-200 rounded-xl text-[13px] text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer max-w-[200px]"
                  >
                    <option value="ALL">Todas as linhas</option>
                    {configs.map(c => (
                      <option key={c.linha_prefix} value={c.linha_prefix}>{c.nome_linha}</option>
                    ))}
                  </select>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filtrar por categoria"
                    className="h-9 pl-3 pr-8 bg-white border border-zinc-200 rounded-xl text-[13px] text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer max-w-[220px]"
                  >
                    <option value="ALL">Todas as categorias</option>
                    <option value="Sem Categoria">Sem categoria</option>
                    {groupedCategories.map(group => (
                      <optgroup key={group.root.id} label={group.root.name}>
                        <option value={group.root.id}>{group.root.name} (Geral)</option>
                        {group.subs.map(sub => (
                          <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {temFiltro && (
                    <button onClick={limparFiltros} className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 underline underline-offset-2 cursor-pointer px-1">
                      Limpar filtros
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {VISTAS.map(v => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVista(v.id)}
                      className={cn(
                        'px-3 py-1.5 rounded-full border text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5',
                        vista === v.id ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                      )}
                    >
                      {v.label}
                      <span className={cn('font-mono text-[10px]', vista === v.id ? 'text-zinc-300' : 'text-zinc-400')}>{contagemVistas[v.id] ?? 0}</span>
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-zinc-500">{filteredProducts.length} de {products.length} produtos</span>
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
                        <th className="px-4 py-3 text-[10px] uppercase tracking-wider">Produto</th>
                        <th className="px-4 py-3 w-24 text-[10px] uppercase tracking-wider">Tipo</th>
                        <th className="px-4 py-3 w-48 text-[10px] uppercase tracking-wider">Linha de Venda</th>
                        <th className="px-4 py-3 min-w-[9.5rem] text-[10px] uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 w-56 text-[10px] uppercase tracking-wider">Categoria</th>
                        <th className="px-4 py-3 w-16 text-center text-[10px] uppercase tracking-wider">Editar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-zinc-400 font-medium">
                            <RefreshCw className="h-5 w-5 animate-spin text-zinc-500 mx-auto mb-2" />
                            Carregando produtos...
                          </td>
                        </tr>
                      ) : filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-zinc-400">Nenhum produto corresponde aos filtros aplicados.</td>
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
                              <td className="px-4 py-2.5 font-bold text-zinc-800">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[13px]">{p.descricao}</span>
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
                                <div className="font-mono text-[11px] font-medium text-zinc-500 mt-0.5">{p.codigo}</div>
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
                                <span className="flex items-center gap-2">
                                  {p.categoria_produto ? (
                                    <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 rounded text-[10px] font-bold">
                                      {getCategoryName(p.categoria_produto)}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-400 italic font-medium">Nenhuma</span>
                                  )}
                                  {codigosComAjuste.has(p.codigo) && (
                                    <span title="Tem ajuste manual" className="text-[10px] font-bold text-zinc-600 bg-zinc-100 border border-zinc-200 rounded px-1.5 py-0.5">manual</span>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleOpenEdit(p)}
                                  className="p-1.5 hover:bg-zinc-150 text-zinc-400 hover:text-zinc-800 rounded-lg transition-colors cursor-pointer"
                                  title="Editar Produto/Kit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                {isKit && onAbrirKits && (
                                  <button
                                    onClick={() => onAbrirKits()}
                                    className="p-1.5 hover:bg-zinc-100 text-zinc-600 rounded-lg transition-colors cursor-pointer"
                                    title="Composição do kit: abrir Produção > Kits"
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

              </div>
              {selectedCodes.size > 0 && (
                <div role="region" aria-label="Edição em lote" className="shrink-0 bg-zinc-900 text-white rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2.5 shadow-xl">
                  <span className="bg-zinc-800 text-white font-bold px-2 py-0.5 rounded text-xs">{selectedCodes.size}</span>
                  <span className="text-xs text-zinc-300 flex-1 min-w-[160px]">
                    {selectedCodes.size === 1 ? 'produto selecionado' : 'produtos selecionados'}. Escolha o que mudar; uma prévia mostra o antes e o depois.
                  </span>
                  <select
                    aria-label="Mudar status"
                    value={bulkStatus}
                    onChange={(e) => { setBulkStatus(e.target.value); if (e.target.value) handleBulkAction('set_status', e.target.value); }}
                    className="h-8 bg-zinc-800 text-white border border-zinc-700 rounded-xl text-xs font-bold px-2 focus:outline-none cursor-pointer"
                  >
                    <option value="">Mudar status…</option>
                    <option value="ativo">Ativa</option>
                    <option value="lancamento">Lançamento</option>
                    <option value="saindo_de_linha">Saindo de Linha</option>
                    <option value="descontinuado">Saiu de Linha</option>
                    <option value="terceirizado">Terceirizado</option>
                  </select>
                  <select
                    aria-label="Mudar linha"
                    value={bulkLine}
                    onChange={(e) => { setBulkLine(e.target.value); if (e.target.value) handleBulkAction('set_line', e.target.value); }}
                    className="h-8 bg-zinc-800 text-white border border-zinc-700 rounded-xl text-xs font-bold px-2 max-w-[220px] focus:outline-none cursor-pointer"
                  >
                    <option value="">Mudar linha…</option>
                    <option value="AUTO">Automática (pelo prefixo)</option>
                    {configs.map(c => (
                      <option key={c.linha_prefix} value={c.linha_prefix}>{c.nome_linha}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Mudar categoria ou subcategoria"
                    value={bulkCategory}
                    onChange={(e) => { setBulkCategory(e.target.value); if (e.target.value) handleBulkAction('set_category', e.target.value); }}
                    className="h-8 bg-zinc-800 text-white border border-zinc-700 rounded-xl text-xs font-bold px-2 max-w-[240px] focus:outline-none cursor-pointer"
                  >
                    <option value="">Mudar categoria…</option>
                    <option value="AUTO">Automática</option>
                    {groupedCategories.map(group => (
                      <optgroup key={group.root.id} label={group.root.name}>
                        <option value={group.root.id}>{group.root.name} (Geral)</option>
                        {group.subs.map(sub => (
                          <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button onClick={() => setSelectedCodes(new Set())} className="text-xs text-zinc-400 hover:text-white px-2 py-1.5 font-medium transition-colors cursor-pointer">
                    Limpar seleção
                  </button>
                </div>
              )}
            </div>

      {/* Edit Drawer (Side panel) */}
      {selectedProduct && (
        <Drawer
          onClose={() => setSelectedProduct(null)}
          size="sm"
          title={selectedProduct.descricao}
          subtitle={`Código: ${selectedProduct.codigo}`}
          tabs={[
            { id: 'geral', label: 'Geral' },
            { id: 'ajustes', label: 'Ajustes', badge: codigosComAjuste.has(selectedProduct.codigo) ? '•' : undefined },
          ]}
          activeTab={abaProduto}
          onTabChange={(id) => setAbaProduto(id as 'geral' | 'ajustes')}
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
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Linha', selectedProduct.nome_linha || selectedProduct.linha_prefix || '—'],
                ['Média/mês', (selectedProduct.media_vendas ?? 0).toFixed(1)],
                ['Ideal', String(Math.round(selectedProduct.estoque_ideal_qtd || 0))],
              ].map(([rot, val]) => (
                <div key={rot} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 min-w-0">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{rot}</span>
                  <span className="text-sm font-extrabold text-zinc-900 block truncate">{val}</span>
                </div>
              ))}
            </div>

            <div className={abaProduto === 'geral' ? 'space-y-5' : 'hidden'}>
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
                {onAbrirKits && (
                <button
                  type="button"
                  onClick={() => onAbrirKits()}
                  className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                  Abrir Produção &gt; Kits
                </button>
                )}
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
            </div>
            <div className={abaProduto === 'ajustes' ? 'space-y-5' : 'hidden'}>
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

            <div>
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

            </div>
          </form>
        </Drawer>
      )}
    </>
  );
}
