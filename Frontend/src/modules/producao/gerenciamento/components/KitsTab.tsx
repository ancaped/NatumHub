import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../geral/lib/http';
import { kitComponentNeedQty } from '../../lib/kitComponentQty';
import {
  Search, RefreshCw, HelpCircle, AlertTriangle, Edit3, ChevronLeft, ChevronRight,
  CheckCircle2, PlusCircle, ChevronRight as ChevronRightIcon, Layers, Zap, CalendarClock, Package,
} from 'lucide-react';

function kitProduto(k: any) {
  return k?.produto || k?.kit_detalhes || k;
}

function componentesProduto(k: any) {
  const lista = Array.isArray(k?.componentes) ? k.componentes : [];
  return lista.filter((c: any) => c && c.fonte !== 'item');
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
  productionApprovalList = [],
  onToggleApprovalList,
  onOpenComposition,
  onToggleApenasKit,
  onShowDetails,
  diasComerciais = 30,
}: any) {
  const [modo, setModo] = useState<'kit' | 'itens'>('kit');
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div
              className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-rose-300 hover:shadow-md ${kitsSelectedStatus === 'critico' ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-50/20' : 'border-zinc-200'}`}
              onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'critico' ? 'ALL' : 'critico'); setKitsPage(1); }}
            >
              <div className="p-2.5 rounded-lg bg-rose-50 text-rose-600 shrink-0"><Zap size={20} /></div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Produzir urgente</div>
                <div className="text-xl font-bold text-rose-600">{kitsStats?.critico ?? 0}</div>
              </div>
            </div>
            <div
              className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-amber-300 hover:shadow-md ${kitsSelectedStatus === 'ordem' ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/20' : 'border-zinc-200'}`}
              onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'ordem' ? 'ALL' : 'ordem'); setKitsPage(1); }}
            >
              <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 shrink-0"><AlertTriangle size={20} /></div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Abrir ordem</div>
                <div className="text-xl font-bold text-amber-600">{kitsStats?.ordem ?? 0}</div>
              </div>
            </div>
            <div
              className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-blue-300 hover:shadow-md ${kitsSelectedStatus === 'aguardando' ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/20' : 'border-zinc-200'}`}
              onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'aguardando' ? 'ALL' : 'aguardando'); setKitsPage(1); }}
            >
              <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 shrink-0"><CalendarClock size={20} /></div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Aguardando produção</div>
                <div className="text-xl font-bold text-blue-600">{kitsStats?.aguardando ?? 0}</div>
              </div>
            </div>
            <div
              className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-emerald-300 hover:shadow-md ${kitsSelectedStatus === 'saudavel' ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/20' : 'border-zinc-200'}`}
              onClick={() => { setKitsSelectedStatus(kitsSelectedStatus === 'saudavel' ? 'ALL' : 'saudavel'); setKitsPage(1); }}
            >
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0"><CheckCircle2 size={20} /></div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Estoque saudável</div>
                <div className="text-xl font-bold text-emerald-600">{(kitsStats?.saudavel ?? 0) + (kitsStats?.abundante ?? 0)}</div>
              </div>
            </div>
          </div>

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
                            <td className="px-4 py-2.5 text-right font-bold text-zinc-900">
                              {p.estoque_futuro_com_producao}
                              <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                                Est: {p.estoque} | Prod: {p.producao} | Ped: {p.pedidos_aberto}
                              </div>
                            </td>
                            <td className="px-4 py-2.5"><DurationCell produto={p} diasComerciais={diasComerciais} /></td>
                            <td className="px-4 py-2.5"><span className={`status-badge ${p.status}`}>{p.status_label}</span></td>
                            <td className="px-4 py-2.5 text-right font-bold" style={{ color: p.producao_recomendada > 0 ? 'hsl(var(--danger-hsl))' : 'inherit' }}>
                              {p.producao_recomendada > 0 ? `${p.producao_recomendada} un` : '—'}
                              {p.producao_recomendada > 0 && p.estoque_ideal_qtd > 0 && (
                                <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">Ideal: {Number(p.estoque_ideal_qtd).toFixed(0)}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => onToggleApprovalList?.(p.codigo)}
                                className={`p-1 rounded cursor-pointer ${productionApprovalList.includes(p.codigo) ? 'text-emerald-600 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100'}`}
                                title={productionApprovalList.includes(p.codigo) ? 'Remover do planejamento semanal' : 'Adicionar ao planejamento semanal'}
                              >
                                {productionApprovalList.includes(p.codigo) ? <CheckCircle2 size={14} /> : <PlusCircle size={14} />}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <div className="flex gap-1 justify-center">
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
                              <td colSpan={9} style={{ padding: 0 }}>
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
                                        {produtos.map((comp: any) => (
                                          <tr key={comp.codigo}>
                                            <td className="comp-code">{comp.codigo}</td>
                                            <td className="comp-desc">{comp.descricao}</td>
                                            <td className="numeric-col">{comp.estoque}</td>
                                            <td className="numeric-col">{comp.producao}</td>
                                            <td className="numeric-col">{comp.pedidos_aberto}</td>
                                            <td className="numeric-col">{comp.estoque_futuro_com_producao}</td>
                                            <td><span className={`status-badge ${comp.status}`}>{comp.status_label}</span></td>
                                            <td className="numeric-col" style={{ color: comp.producao_recomendada > 0 ? 'hsl(var(--danger-hsl))' : undefined, fontWeight: 700 }}>
                                              {comp.producao_recomendada > 0 ? `${comp.producao_recomendada} un` : '—'}
                                            </td>
                                            <td>
                                              <button type="button" className="text-[10px] font-bold cursor-pointer" onClick={() => onToggleApenasKit?.(comp.codigo, comp.produzir_apenas_kit ?? 0)}>
                                                {comp.produzir_apenas_kit === 1 ? 'Só para kit' : 'Também avulso'}
                                              </button>
                                            </td>
                                            <td>
                                              <button type="button" className="px-2 py-1 rounded-lg bg-zinc-900 text-white text-[10px] font-bold cursor-pointer" onClick={() => onLaunchProduct(comp)}>Lançar</button>
                                            </td>
                                          </tr>
                                        ))}
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
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Descrição</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Estoque</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Em produção</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Demanda kit</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Demanda avulsa</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Demanda total</th>
                      <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Tipo</th>
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
                          <div className="font-bold text-zinc-900">{comp.descricao}</div>
                          <div className="flex flex-wrap gap-1 mt-1 max-w-[420px] whitespace-normal">
                            {comp.kits.map((k: any) => (
                              <span key={k.codigo} className="text-[10px] text-zinc-600 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded" title={k.codigo}>{k.descricao}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold">{comp.estoque}</td>
                        <td className="px-4 py-2.5 text-right">{comp.producao}</td>
                        <td className="px-4 py-2.5 text-right font-bold">{demandaKit}</td>
                        <td className="px-4 py-2.5 text-right">{avulsa}</td>
                        <td className="px-4 py-2.5 text-right font-bold">{total}</td>
                        <td className="px-4 py-2.5">
                          <button type="button" className={`text-[10px] font-bold px-2 py-0.5 rounded-md border cursor-pointer ${exclusiva ? 'bg-zinc-100 text-zinc-700 border-zinc-200' : 'bg-slate-50 text-slate-700 border-slate-200'}`} onClick={() => onToggleApenasKit?.(comp.codigo, comp.produzir_apenas_kit ?? 0)}>
                            {exclusiva ? 'Apenas Kit' : 'Misto'}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button type="button" className="px-2 py-1 rounded-lg bg-zinc-900 text-white text-[10px] font-bold cursor-pointer" onClick={() => onLaunchProduct(comp)}>Lançar</button>
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
    </div>
  );
}
