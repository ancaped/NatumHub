import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../geral/lib/http';
import { useAviso } from '../../../geral/components/ui/Aviso';
import { usePreviaServidor, linhasAjusteFila, linhasExclusaoFila } from '../../lib/usePreviaServidor';
import { kitComponentNeedQty } from '../../lib/kitComponentQty';
import { formatUnitsToKg } from '../../lib/unitConversion';
import {
  Search, RefreshCw, HelpCircle, AlertTriangle, Edit3, ChevronLeft, ChevronRight,
  CheckCircle2, PlusCircle, ChevronRight as ChevronRightIcon, Layers, Zap, CalendarClock, Package, Boxes, Plus, FlaskConical, X
} from 'lucide-react';
import { MontagemKitsPainel } from './MontagemKitsPainel';
import { BatchOpportunityModal } from './BatchOpportunityModal';

function kitProduto(k: any) {
  return k?.produto || k?.kit_detalhes || k;
}

function componentesProduto(k: any) {
  const lista = Array.isArray(k?.componentes) ? k.componentes : [];
  return lista.filter((c: any) => c && c.fonte !== 'item');
}

function cobreComponente(comp: any) {
  const qtd = Number(comp?.quantidade) || 0;
  const estoque = Number(comp?.estoque) || 0;
  if (qtd <= 0) return estoque;
  return Math.floor(estoque / qtd);
}

function calcularGargaloKit(k: any) {
  const comps = Array.isArray(k?.componentes) ? k.componentes : [];
  let worst: any = null;
  let worstN = Infinity;
  for (const comp of comps) {
    const n = cobreComponente(comp);
    if (n < worstN) {
      worstN = n;
      worst = comp;
    }
  }
  const maxEstoque = Number.isFinite(Number(k?.max_montavel_estoque))
    ? Number(k.max_montavel_estoque)
    : Number.isFinite(worstN) ? worstN : 0;
  return {
    potencialHoje: Math.max(0, maxEstoque),
    gargaloComp: worst ? { ...worst, cobre: worstN } : null,
  };
}

function DurationCell({ produto, diasComerciais }: { produto: any; diasComerciais: number }) {
  const meses = Number(produto?.duracao_meses);
  if (!Number.isFinite(meses)) {
    return <span className="text-[10px] text-zinc-400">Sem média</span>;
  }
  const ideal = Number(produto?.estoque_ideal_meses) || 0;
  const pct = ideal > 0 ? Math.min(100, Math.max(5, (meses / ideal) * 100)) : Math.min(100, Math.max(5, meses * 8));
  const dias = Number.isFinite(Number(produto?.duracao_dias))
    ? Number(produto.duracao_dias)
    : meses * (diasComerciais || 30);
  return (
    <div className="duration-container">
      <div className="duration-info">
        <span>{meses.toFixed(1)} meses</span>
        <span>{dias.toFixed(0)} dias</span>
      </div>
      <div className="duration-bar-bg">
        <div className={`duration-bar-fill ${produto.status || ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-400 mt-0.5">
        <span>Vendas/mês: {produto.produzir_apenas_kit === 1 ? '—' : Number(produto.demanda_ajustada || 0).toFixed(1)}</span>
      </div>
    </div>
  );
}

export function KitsTab({
  kitsStats,
  kits,
  kitsActiveTab,
  setKitsActiveTab,
  kitsSearch,
  setKitsSearch,
  kitsSelectedStatus,
  setKitsSelectedStatus,
  kitsPage,
  setKitsPage,
  kitsTotalPages,
  kitsTotalItems,
  limitPerPage,
  kitSortField,
  setKitSortField,
  kitSortDir,
  setKitSortDir,
  onLaunchProduct,
  onEditOverrides,
  onRefresh,
  loading,
  tabOptions,
  toggleSort,
  SortIcon,
  expandedKits,
  toggleKitExpanded,
  onOpenComposition,
  onToggleApenasKit,
  onShowDetails,
  diasComerciais = 30,
}: any) {
  const { avisar, aviso } = useAviso();
  const { pedir: pedirPrevia, elemento: previaElemento } = usePreviaServidor(avisar);
  const [centralSubTab, setCentralSubTab] = useState<'demandas' | 'montagem'>('demandas');
  const [modo, setModo] = useState<'kit' | 'itens'>('kit');
  const [queuedMap, setQueuedMap] = useState<Map<string, any>>(new Map());
  const [editingQueueCode, setEditingQueueCode] = useState<string | null>(null);
  const [editingQueueQty, setEditingQueueQty] = useState<number>(100);
  const [savingQueue, setSavingQueue] = useState(false);
  const [batchModalProduct, setBatchModalProduct] = useState<any | null>(null);
  const [kitOrderModal, setKitOrderModal] = useState<{ kit: any; qty: number; obs: string } | null>(null);
  const [creatingKitOrder, setCreatingKitOrder] = useState(false);

  const fetchQueuedItems = () => {
    apiFetch('/producao/fila-demandas')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.items)) {
          const map = new Map<string, any>();
          for (const it of data.items) {
            if (it.codigoProduto) {
              map.set(String(it.codigoProduto).trim(), it);
            }
          }
          setQueuedMap(map);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchQueuedItems();
  }, []);

  const handleEnqueueItem = async (code: string, desc: string, qty: number, compObj?: any) => {
    const cleanQty = Math.max(1, qty);
    try {
      const res = await apiFetch('/producao/fila-demandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoProduto: code,
          descricao: desc,
          quantidade: cleanQty,
          unidade: 'un',
          origemDemanda: 'kit',
          baseCodigo: compObj?.base_codigo,
          baseNome: compObj?.base,
        })
      });
      if (res.ok) {
        fetchQueuedItems();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateQueueQty = async (code: string, desc: string) => {
    if (editingQueueQty <= 0) return;
    setSavingQueue(true);
    try {
      const item = queuedMap.get(code);
      const targetId = item?.id;
      if (!targetId) return;
      await pedirPrevia({
        url: `/producao/fila-demandas/${encodeURIComponent(targetId)}`,
        init: {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantidade: editingQueueQty, unidade: 'un' }),
        },
        titulo: 'Ajustar quantidade na fila',
        confirmarRotulo: 'OK, ajustar',
        linhas: linhasAjusteFila,
        erroPadrao: 'Não foi possível ajustar o item da fila.',
        aoConcluir: () => {
          setEditingQueueCode(null);
          fetchQueuedItems();
        },
      });
    } finally {
      setSavingQueue(false);
    }
  };

  const handleRemoveFromQueue = async (code: string) => {
    setSavingQueue(true);
    try {
      const item = queuedMap.get(code);
      const targetId = item?.id;
      if (!targetId) return;
      await pedirPrevia({
        url: `/producao/fila-demandas/${encodeURIComponent(targetId)}`,
        init: { method: 'DELETE' },
        titulo: 'Tirar da fila',
        confirmarRotulo: 'OK, tirar da fila',
        linhas: linhasExclusaoFila,
        erroPadrao: 'Não foi possível tirar o item da fila.',
        aoConcluir: () => {
          setEditingQueueCode(null);
          fetchQueuedItems();
        },
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSavingQueue(false);
    }
  };

  const renderQueueCell = (code: string, desc: string, defaultQty: number, compObj?: any) => {
    const qItem = queuedMap.get(code);
    if (qItem) {
      const currentQ = qItem.quantidade || defaultQty;
      const isEditing = editingQueueCode === code;
      return (
        <div className="inline-block relative">
          <button
            type="button"
            onClick={() => {
              if (isEditing) {
                setEditingQueueCode(null);
              } else {
                setEditingQueueCode(code);
                setEditingQueueQty(currentQ);
              }
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
            title="Clique para ajustar a quantidade na fila ou remover"
          >
            <CheckCircle2 size={11} />
            <span>Na Fila ({currentQ} un)</span>
          </button>
          {isEditing && (
            <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-zinc-200 p-3 z-30 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase text-zinc-500">Qtd na Fila PCP</span>
                <button
                  type="button"
                  onClick={() => setEditingQueueCode(null)}
                  className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <input
                  type="number"
                  min={1}
                  value={editingQueueQty}
                  onChange={(e) => setEditingQueueQty(Math.max(1, Number(e.target.value) || 0))}
                  className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg font-mono text-xs font-bold text-zinc-900"
                />
                <span className="text-xs font-bold text-zinc-500">un</span>
              </div>
              <div className="text-[10px] text-zinc-400 font-mono mb-2">
                Equiv.: ~{formatUnitsToKg(editingQueueQty, desc)}
              </div>
              <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  disabled={savingQueue}
                  onClick={() => handleRemoveFromQueue(code)}
                  className="px-2 py-1 rounded text-[10px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  Remover
                </button>
                <button
                  type="button"
                  disabled={savingQueue}
                  onClick={() => handleUpdateQueueQty(code, desc)}
                  className="px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-bold cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => handleEnqueueItem(code, desc, defaultQty, compObj)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors cursor-pointer"
        title="Adicionar à fila de demandas do PCP"
      >
        <Plus size={11} />
        <span>+ Fila</span>
      </button>
    );
  };

  const handleEnqueueBatch = async (items: any[]) => {
    try {
      const res = await apiFetch('/producao/fila-demandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items)
      });
      if (res.ok) {
        fetchQueuedItems();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateKitOrder = async () => {
    if (!kitOrderModal) return;
    const { kit, qty, obs } = kitOrderModal;
    const p = kitProduto(kit);
    if (!p?.codigo || qty <= 0) return;

    setCreatingKitOrder(true);
    try {
      let orderNum = `KIT-${Date.now()}`;
      const resNext = await apiFetch('/kits/next-order-number');
      if (resNext.ok) {
        const data = await resNext.json();
        if (data.nextOrderNumber) orderNum = data.nextOrderNumber;
      }
      const comps = Array.isArray(kit.componentes) ? kit.componentes : [];
      const lotesList = comps.map((comp: any) => {
        const perKit = Number(comp.quantidade) || 1;
        return {
          code: comp.codigo,
          description: comp.descricao,
          expected_qty: perKit,
          fator_proporcao_qtd: comp.fator_proporcao_qtd ?? null,
          fator_proporcao_kits: comp.fator_proporcao_kits ?? null,
          need_qty: kitComponentNeedQty(perKit, qty, comp.fator_proporcao_qtd, comp.fator_proporcao_kits),
          lote: '',
        };
      });
      const res = await apiFetch('/kits/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNum,
          kitProductCode: String(p.codigo),
          kitProductDescription: p.descricao || '',
          quantity: qty,
          status: 'PENDING',
          assembledBy: '',
          checkedBy: '',
          observations: obs,
          componentsLotes: JSON.stringify(lotesList),
        }),
      });
      if (res.ok) {
        setKitOrderModal(null);
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingKitOrder(false);
    }
  };
  const [allKits, setAllKits] = useState<any[]>([]);
  const [loadingItens, setLoadingItens] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [soFalta, setSoFalta] = useState(true);

  useEffect(() => {
    if (modo !== 'itens') return;
    let cancelled = false;
    setLoadingItens(true);
    apiFetch('/kits?limit=500&page=1')
      .then(async (res) => {
        if (!res.ok) throw new Error('falha');
        const data = await res.json();
        if (!cancelled) setAllKits(data.items || []);
      })
      .catch(() => {
        if (!cancelled) setAllKits([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingItens(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modo, loading]);

  const itens = useMemo(() => {
    const map = new Map<string, any>();
    for (const kit of allKits) {
      const p = kitProduto(kit);
      for (const comp of componentesProduto(kit)) {
        const code = String(comp.codigo || '');
        if (!code) continue;
        const current = map.get(code) || { ...comp, kits: [] as { codigo: string; descricao: string }[], demandaKit: 0 };
        if (p?.codigo && !current.kits.some((k: any) => k.codigo === p.codigo)) {
          current.kits.push({ codigo: p.codigo, descricao: p.descricao });
        }
        const kitsAMontar = Math.max(0, Number(kit.producao_recomendada) || 0);
        current.demandaKit += kitComponentNeedQty(
          Number(comp.quantidade) || 0,
          kitsAMontar,
          comp.fator_proporcao_qtd,
          comp.fator_proporcao_kits,
        );
        map.set(code, current);
      }
    }
    const q = itemSearch.trim().toLowerCase();
    return [...map.values()]
      .filter((c) => !soFalta || (c.producao_recomendada || 0) > 0)
      .filter((c) => {
        if (!q) return true;
        return (
          String(c.codigo).toLowerCase().includes(q) ||
          String(c.descricao || '').toLowerCase().includes(q) ||
          c.kits.some((k: any) => String(k.descricao || '').toLowerCase().includes(q) || String(k.codigo).toLowerCase().includes(q))
        );
      })
      .sort((a, b) => (b.producao_recomendada || 0) - (a.producao_recomendada || 0));
  }, [allKits, itemSearch, soFalta]);

  return (
    <div className="view-container animate-in fade-in duration-200">
      {previaElemento}
      {aviso}
      {/* Central de Kits: Sub-abas de topo */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200">
        <div className="inline-flex p-1 bg-zinc-100 rounded-lg border border-zinc-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setCentralSubTab('demandas')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              centralSubTab === 'demandas'
                ? 'bg-white text-zinc-900 shadow-xs font-bold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Package size={14} />
            <span>Demandas de Kits</span>
          </button>
          <button
            type="button"
            onClick={() => setCentralSubTab('montagem')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              centralSubTab === 'montagem'
                ? 'bg-white text-zinc-900 shadow-xs font-bold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Boxes size={14} />
            <span>Ordens de Montagem</span>
          </button>
        </div>
      </div>

      {centralSubTab === 'montagem' ? (
        <MontagemKitsPainel
          tabOptions={tabOptions}
          onOpenComposition={onOpenComposition}
        />
      ) : (
        <>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setModo('kit')}
          className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer ${modo === 'kit' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'}`}
        >
          Visão por kit
        </button>
        <button
          type="button"
          onClick={() => setModo('itens')}
          className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer ${modo === 'itens' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'}`}
        >
          Visão por componente
        </button>
      </div>

      {modo === 'kit' ? (
        <>


          <div className="tabs-container">
            {(tabOptions || []).map((opt: any) => (
              <button key={opt.id} type="button" className={`tab-btn ${kitsActiveTab === opt.id ? 'active' : ''}`} onClick={() => { setKitsActiveTab(opt.id); setKitsPage(1); }}>
                {opt.name}
              </button>
            ))}
          </div>

          <div className="toolbar-section">
            <div className="search-input-wrapper">
              <Search size={18} />
              <input
                type="text"
                placeholder="Buscar kit por código (REF) ou descrição..."
                className="search-input"
                value={kitsSearch}
                onChange={(e) => { setKitsSearch(e.target.value); setKitsPage(1); }}
              />
            </div>
            <div className="filters-wrapper">
              <select className="select-filter" value={kitsSelectedStatus} onChange={(e) => { setKitsSelectedStatus(e.target.value); setKitsPage(1); }}>
                <option value="ALL">Todos os alertas</option>
                <option value="critico">Crítico: produzir</option>
                <option value="ordem">Abrir ordem</option>
                <option value="aguardando">Aguardando produção</option>
                <option value="saudavel">Estoque OK</option>
                <option value="abundante">Abundante</option>
              </select>
              <button className="btn-secondary cursor-pointer" onClick={onRefresh} title="Recarregar dados" type="button">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs">
            {loading ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }} className="flex flex-col items-center gap-4">
                <RefreshCw className="animate-spin" size={32} />
                <span>Calculando demanda dos kits...</span>
              </div>
            ) : kits.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }} className="flex flex-col items-center gap-4">
                <HelpCircle size={48} style={{ opacity: 0.3 }} />
                <span>Nenhum kit encontrado com os filtros selecionados.</span>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                  <thead className="bg-zinc-50 sticky top-0 z-10">
                    <tr className="border-b border-zinc-200">
                      <th className="px-3 py-3 w-8" />
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] cursor-pointer" onClick={() => toggleSort('codigo', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}>
                        <div className="flex items-center">REF <SortIcon field="codigo" activeField={kitSortField} activeDir={kitSortDir} /></div>
                      </th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] cursor-pointer" onClick={() => toggleSort('descricao', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}>
                        <div className="flex items-center">Descrição / Linha <SortIcon field="descricao" activeField={kitSortField} activeDir={kitSortDir} /></div>
                      </th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right cursor-pointer" onClick={() => toggleSort('estoque_futuro_com_producao', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}>
                        <div className="flex items-center justify-end">EFP <SortIcon field="estoque_futuro_com_producao" activeField={kitSortField} activeDir={kitSortDir} /></div>
                      </th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Duração</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Potencial Hoje (Gargalo)</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] cursor-pointer" onClick={() => toggleSort('status', kitSortField, setKitSortField, kitSortDir, setKitSortDir)}>
                        <div className="flex items-center">Status <SortIcon field="status" activeField={kitSortField} activeDir={kitSortDir} /></div>
                      </th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Sug. prod.</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-center">Fila</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {kits.map((k: any) => {
                      const p = kitProduto(k);
                      if (!p?.codigo) return null;
                      const expanded = expandedKits.includes(p.codigo);
                      const produtos = componentesProduto(k);
                      const faltas = produtos.filter((c: any) => (c.producao_recomendada || 0) > 0);
                      const { potencialHoje, gargaloComp } = calcularGargaloKit(k);
                      return (
                        <React.Fragment key={p.codigo}>
                          <tr className="hover:bg-zinc-50/30 transition-colors">
                            <td className="px-3 py-2.5 text-zinc-400 cursor-pointer" onClick={() => toggleKitExpanded(p.codigo)}>
                              <ChevronRightIcon size={16} style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.2s' }} />
                            </td>
                            <td className="px-4 py-2.5 font-mono font-bold text-zinc-800">
                              <button type="button" className="hover:underline cursor-pointer bg-transparent border-none p-0 font-bold" onClick={() => onShowDetails?.(p.codigo)}>{p.codigo}</button>
                            </td>
                            <td className="px-4 py-2.5">
                              <button type="button" className="font-bold text-zinc-900 hover:underline cursor-pointer bg-transparent border-none p-0 text-left" onClick={() => onShowDetails?.(p.codigo)}>{p.descricao}</button>
                              <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                                <span className="text-[10px] text-zinc-500 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded">Linha: {p.nome_linha || 'Kits'}</span>
                                <span className="text-[10px] text-zinc-500 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded">{produtos.length} itens de produção</span>
                                {faltas.length > 0 && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200 rounded">
                                    Falta produzir {faltas.length}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold font-mono text-zinc-900">
                              {p.estoque_futuro_com_producao}
                              <div className="text-[10px] text-zinc-400 font-semibold font-mono mt-0.5">
                                Est: {p.estoque} | Prod: {p.producao} | Ped: {p.pedidos_aberto}
                              </div>
                            </td>
                            <td className="px-4 py-2.5"><DurationCell produto={p} diasComerciais={diasComerciais} /></td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-col gap-0.5">
                                <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                  potencialHoje > 0
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  {potencialHoje} kits hoje
                                </span>
                                {gargaloComp && (
                                  <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[160px]" title={`Gargalo: ${gargaloComp.codigo} - ${gargaloComp.descricao} (cobre ${gargaloComp.cobre} kits)`}>
                                    Gargalo: <strong className="text-zinc-700">{gargaloComp.codigo}</strong> ({gargaloComp.cobre})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5"><span className={`status-badge ${p.status}`}>{p.status_label}</span></td>
                            <td className="px-4 py-2.5 text-right font-bold font-mono" style={{ color: p.producao_recomendada > 0 ? 'hsl(var(--danger-hsl))' : 'inherit' }}>
                              {p.producao_recomendada > 0 ? `${p.producao_recomendada} un` : '—'}
                              {p.producao_recomendada > 0 && p.estoque_ideal_qtd > 0 && (
                                <div className="text-[10px] text-zinc-400 font-semibold font-mono mt-0.5">Ideal: {Number(p.estoque_ideal_qtd).toFixed(0)}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {renderQueueCell(p.codigo, p.descricao, p.producao_recomendada > 0 ? p.producao_recomendada : 50)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <div className="flex gap-1 justify-center items-center">
                                <button
                                  type="button"
                                  onClick={() => setKitOrderModal({
                                    kit: k,
                                    qty: potencialHoje > 0 ? potencialHoje : (p.producao_recomendada > 0 ? p.producao_recomendada : 20),
                                    obs: ''
                                  })}
                                  className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                  title="Criar ordem de montagem deste kit diretamente"
                                >
                                  <Boxes size={12} />
                                  <span>Montar Kit</span>
                                </button>
                                <button type="button" className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer" title="Composição" onClick={() => onOpenComposition?.(p.codigo, p.descricao)}>
                                  <Layers size={14} />
                                </button>
                                <button type="button" className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer" title="Ajustar overrides" onClick={() => onEditOverrides?.(p)}>
                                  <Edit3 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="expanded-row-tr">
                              <td colSpan={10} style={{ padding: 0 }}>
                                <div className="components-detail-panel">
                                  <div className="components-panel-title">O que falta produzir neste kit</div>
                                  {produtos.length === 0 ? (
                                    <p className="text-xs text-zinc-500">Este kit não tem item de produção na composição.</p>
                                  ) : (
                                    <table className="components-table">
                                      <thead>
                                        <tr>
                                          <th>REF</th>
                                          <th>Item</th>
                                          <th className="numeric-col">Estoque</th>
                                          <th className="numeric-col">Produção</th>
                                          <th className="numeric-col">Pedidos</th>
                                          <th className="numeric-col">EFP</th>
                                          <th>Status</th>
                                          <th className="numeric-col">Sug. prod.</th>
                                          <th>Uso</th>
                                          <th />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {produtos.map((comp: any) => {
                                          const recQty = Number(comp.producao_recomendada) > 0 ? Number(comp.producao_recomendada) : 50;
                                          return (
                                            <tr key={comp.codigo}>
                                              <td className="comp-code font-mono">{comp.codigo}</td>
                                              <td className="comp-desc">{comp.descricao}</td>
                                              <td className="numeric-col font-mono">{comp.estoque}</td>
                                              <td className="numeric-col font-mono">{comp.producao}</td>
                                              <td className="numeric-col font-mono">{comp.pedidos_aberto}</td>
                                              <td className="numeric-col font-mono">{comp.estoque_futuro_com_producao}</td>
                                              <td><span className={`status-badge ${comp.status}`}>{comp.status_label}</span></td>
                                              <td className="numeric-col font-mono" style={{ color: comp.producao_recomendada > 0 ? 'hsl(var(--danger-hsl))' : undefined, fontWeight: 700 }}>
                                                {comp.producao_recomendada > 0 ? `${comp.producao_recomendada} un` : '—'}
                                              </td>
                                              <td>
                                                <button type="button" className="text-[10px] font-bold cursor-pointer" onClick={() => onToggleApenasKit?.(comp.codigo, comp.produzir_apenas_kit ?? 0)}>
                                                  {comp.produzir_apenas_kit === 1 ? 'Só para kit' : 'Também avulso'}
                                                </button>
                                              </td>
                                              <td>
                                                <div className="flex items-center gap-1 justify-center">
                                                  {renderQueueCell(comp.codigo, comp.descricao, recQty, comp)}
                                                  <button
                                                    type="button"
                                                    onClick={() => setBatchModalProduct(comp)}
                                                    className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                                                    title="Oportunidades de Batelada & Suprimentos"
                                                  >
                                                    <FlaskConical size={13} />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => onEditOverrides?.(comp)}
                                                    className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                                                    title="Ajustar regras e overrides"
                                                  >
                                                    <Edit3 size={13} />
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination-container">
              <span>Exibindo de {kits.length === 0 ? 0 : (kitsPage - 1) * limitPerPage + 1} a {Math.min(kitsPage * limitPerPage, kitsTotalItems)} de {kitsTotalItems} kits</span>
              <div className="pagination-controls">
                <button type="button" className="pagination-btn cursor-pointer" disabled={kitsPage <= 1} onClick={() => setKitsPage((p: number) => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
                <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontWeight: 700 }}>Página {kitsPage} de {kitsTotalPages}</span>
                <button type="button" className="pagination-btn cursor-pointer" disabled={kitsPage >= kitsTotalPages} onClick={() => setKitsPage((p: number) => Math.min(kitsTotalPages, p + 1))}><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="toolbar-section">
            <div className="search-input-wrapper">
              <Search size={18} />
              <input className="search-input" placeholder="Buscar item ou kit em que ele entra..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
            </div>
            <div className="filters-wrapper">
              <label className="toolbar-checkbox-wrapper select-none cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600">
                <input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)} />
                <span>Só com sugestão de produção</span>
              </label>
              <button className="btn-secondary cursor-pointer" type="button" onClick={onRefresh}><RefreshCw size={16} className={loadingItens ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs">
            {loadingItens ? (
              <div style={{ padding: '4rem', textAlign: 'center' }} className="flex flex-col items-center gap-4 text-zinc-500">
                <RefreshCw className="animate-spin" size={32} />
                <span>Juntando a demanda dos itens que entram em kit...</span>
              </div>
            ) : itens.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center' }} className="flex flex-col items-center gap-4 text-zinc-500">
                <Package size={48} style={{ opacity: 0.3 }} />
                <span>Nenhum item de kit com sugestão de produção.</span>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                  <thead className="bg-zinc-50">
                    <tr className="border-b border-zinc-200">
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Código</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Descrição / Kits Vinculados</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Estoque</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Em produção</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Demanda kit</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Demanda avulsa</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Demanda total</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Regime</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-center">Fila PCP</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {itens.map((comp) => {
                      const exclusiva = comp.produzir_apenas_kit === 1;
                      const avulsa = exclusiva ? 0 : Math.max(0, Number(comp.producao_recomendada) || 0);
                      const demandaKit = Number(comp.demandaKit) || 0;
                      const total = avulsa + demandaKit;
                      return (
                      <tr key={comp.codigo} className="hover:bg-zinc-50/30">
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-800">
                          <button type="button" className="hover:underline cursor-pointer bg-transparent border-none p-0 font-bold" onClick={() => onShowDetails?.(comp.codigo)}>{comp.codigo}</button>
                        </td>
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => onShowDetails?.(comp.codigo)} className="font-bold text-zinc-900 hover:underline cursor-pointer bg-transparent border-none p-0 text-left">{comp.descricao}</button>
                          <div className="flex flex-wrap gap-1 mt-1 max-w-[420px] whitespace-normal">
                            {comp.kits.map((k: any) => (
                              <span key={k.codigo} className="text-[10px] text-zinc-600 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded" title={k.codigo}>{k.descricao}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold font-mono">{comp.estoque}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{comp.producao}</td>
                        <td className="px-4 py-2.5 text-right font-bold font-mono text-zinc-700">{demandaKit > 0 ? `${demandaKit} un` : '0'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-600">{exclusiva ? '—' : `${avulsa} un`}</td>
                        <td className="px-4 py-2.5 text-right font-bold font-mono text-zinc-900">
                          <div>{total > 0 ? `${total} un` : '—'}</div>
                          {total > 0 && (
                            <div className="text-[10px] text-zinc-400 font-normal">
                              (~{formatUnitsToKg(total, comp.descricao)})
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <button type="button" className={`text-[10px] font-bold px-2 py-0.5 rounded-md border cursor-pointer ${exclusiva ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`} onClick={() => onToggleApenasKit?.(comp.codigo, comp.produzir_apenas_kit ?? 0)} title="Clique para alternar entre Somente Kit e Venda + Kit">
                            {exclusiva ? 'Somente Kit' : 'Venda + Kit'}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {renderQueueCell(comp.codigo, comp.descricao, total > 0 ? total : 50, comp)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setBatchModalProduct(comp)}
                              className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                              title="Oportunidades de Batelada & Suprimentos"
                            >
                              <FlaskConical size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditOverrides?.(comp)}
                              className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                              title="Ajustar regras e overrides"
                            >
                              <Edit3 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination-container">
              <span>{itens.length} itens de produção usados em kit</span>
            </div>
          </div>
        </>
      )}
        </>
      )}

      {/* Modal Rápido: Criar Ordem de Montagem de Kit */}
      {kitOrderModal && (() => {
        const p = kitProduto(kitOrderModal.kit);
        const { potencialHoje, gargaloComp } = calcularGargaloKit(kitOrderModal.kit);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-xl border border-zinc-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-5 py-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-zinc-900 text-white">
                    <Boxes size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">Criar Ordem de Montagem</h3>
                    <p className="text-[11px] text-zinc-500 font-mono">{p?.codigo} — {p?.descricao}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setKitOrderModal(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-4 text-xs">
                <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-zinc-500">Potencial de Montagem Hoje</div>
                    <div className="text-base font-bold font-mono text-zinc-900">{potencialHoje} kits disponíveis</div>
                  </div>
                  {gargaloComp && (
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase text-zinc-500">Item Gargalo</div>
                      <div className="text-xs font-mono font-bold text-amber-700">{gargaloComp.codigo} ({gargaloComp.cobre} kits)</div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">Quantidade de Kits a Montar</label>
                  <input
                    type="number"
                    min={1}
                    value={kitOrderModal.qty}
                    onChange={(e) => setKitOrderModal({ ...kitOrderModal, qty: Math.max(1, Number(e.target.value) || 0) })}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">Observações da Ordem (opcional)</label>
                  <input
                    type="text"
                    value={kitOrderModal.obs}
                    onChange={(e) => setKitOrderModal({ ...kitOrderModal, obs: e.target.value })}
                    placeholder="Ex: Prioridade expedição..."
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>
              <div className="px-5 py-3.5 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setKitOrderModal(null)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-zinc-700 text-xs font-bold hover:bg-zinc-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={creatingKitOrder || kitOrderModal.qty <= 0}
                  onClick={handleCreateKitOrder}
                  className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {creatingKitOrder ? 'Criando...' : 'Confirmar Ordem de Montagem'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de Aproveitamento de Batelada & Suprimentos */}
      {batchModalProduct && (
        <BatchOpportunityModal
          product={batchModalProduct}
          onClose={() => setBatchModalProduct(null)}
          onEnqueueBatch={handleEnqueueBatch}
        />
      )}
    </div>
  );
}
