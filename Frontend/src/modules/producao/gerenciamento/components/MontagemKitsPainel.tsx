import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../geral/lib/http';
import { usePreviaServidor } from '../../lib/usePreviaServidor';
import { kitComponentNeedQty, kitOrderComponentNeed } from '../../lib/kitComponentQty';
import {
  Search, RefreshCw, HelpCircle, Layers, Boxes, ClipboardList, Package, ChevronRight, Printer,
} from 'lucide-react';
import { KitOrderPrintSheet, kitOrderPrintStyle } from '../../lib/KitOrderPrintSheet';

interface Props {
  tabOptions?: { id: string; name: string }[];
  onOpenComposition?: (code: string, descricao: string) => void;
}

function kitProduto(k: any) {
  return k?.produto || k?.kit_detalhes || k;
}

function cobre(comp: any) {
  // o servidor já calcula com fatores de proporção e sem a reserva das ordens abertas
  if (comp?.kits_cobertos != null) return Number(comp.kits_cobertos) || 0;
  const qtd = Number(comp?.quantidade) || 0;
  const estoque = Number(comp?.estoque) || 0;
  if (qtd <= 0) return estoque;
  return Math.floor(estoque / qtd);
}

function gargalo(k: any) {
  const comps = Array.isArray(k?.componentes) ? k.componentes : [];
  let worst: any = null;
  let worstN = Infinity;
  for (const comp of comps) {
    const n = cobre(comp);
    if (n < worstN) {
      worstN = n;
      worst = comp;
    }
  }
  return worst ? { ...worst, cobre: worstN } : null;
}

function situacao(k: any) {
  const agora = Number(k.max_montavel_estoque) || 0;
  const comProd = Number(k.max_montavel) || 0;
  if (agora > 0) return { id: 'montar', label: 'Montar agora', badge: 'abundante' };
  if (comProd > 0) return { id: 'aguardando', label: 'Itens em produção', badge: 'limitado' };
  return { id: 'sem', label: 'Sem estoque', badge: 'ruptura' };
}

function statusOrdem(status: string) {
  if (status === 'IN_PROGRESS') return 'Em montagem';
  if (status === 'COMPLETED') return 'Concluída';
  return 'Pendente';
}

function AcoesOrdem({
  ordem,
  busy,
  concluirQtd,
  setConcluirQtd,
  onMudar,
  onExcluir,
  onImprimir,
}: {
  ordem: any;
  busy: string | null;
  concluirQtd: Record<string, string>;
  setConcluirQtd: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onMudar: (ordem: any, status: string, quantityAssembled?: number) => void;
  onExcluir: (id: number) => void;
  onImprimir: (ordem: any) => void;
}) {
  const id = String(ordem.id);
  const montada = concluirQtd[id] ?? String(ordem.quantity ?? '');
  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" className="p-1.5 rounded text-zinc-600 hover:bg-zinc-100 cursor-pointer" title="Imprimir ordem" onClick={() => onImprimir(ordem)}>
        <Printer size={14} />
      </button>
      {ordem.status !== 'IN_PROGRESS' && ordem.status !== 'COMPLETED' && (
        <button type="button" disabled={busy === id} className="px-2 py-1 rounded border border-zinc-200 text-[10px] font-bold cursor-pointer disabled:opacity-50" onClick={() => onMudar(ordem, 'IN_PROGRESS')}>
          Em montagem
        </button>
      )}
      <input
        type="number"
        min={0}
        className="w-14 border border-zinc-200 rounded px-1 py-1 text-right"
        value={montada}
        title="Quantidade montada ao concluir"
        onChange={(e) => setConcluirQtd((prev) => ({ ...prev, [id]: e.target.value }))}
      />
      {ordem.status !== 'COMPLETED' && (
        <button
          type="button"
          disabled={busy === id}
          className="px-2 py-1 rounded-lg bg-zinc-900 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
          onClick={() => onMudar(ordem, 'COMPLETED', Number(montada) || Number(ordem.quantity) || 0)}
        >
          Concluir
        </button>
      )}
      {ordem.status !== 'COMPLETED' && (
        <button type="button" disabled={busy === id} className="px-2 py-1 rounded text-[10px] font-bold text-rose-700 cursor-pointer disabled:opacity-50" onClick={() => onExcluir(ordem.id)}>
          Excluir
        </button>
      )}
    </div>
  );
}

function OrdensDoKit(props: {
  ordens: any[];
  busy: string | null;
  concluirQtd: Record<string, string>;
  setConcluirQtd: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onMudar: (ordem: any, status: string, quantityAssembled?: number) => void;
  onExcluir: (id: number) => void;
  onImprimir: (ordem: any) => void;
}) {
  if (props.ordens.length === 0) {
    return <p className="text-xs text-zinc-500 mt-3">Nenhuma ordem aberta deste kit.</p>;
  }
  return (
    <div className="mt-3">
      <div className="components-panel-title">Ordens abertas deste kit</div>
      <table className="components-table">
        <thead>
          <tr>
            <th>Ordem</th>
            <th className="numeric-col">Pedida</th>
            <th>Situação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {props.ordens.map((o) => (
            <tr key={o.id}>
              <td className="comp-code">{o.orderNumber}</td>
              <td className="numeric-col">{Number(o.quantity) || 0} un</td>
              <td><span className={`status-badge ${o.status === 'IN_PROGRESS' ? 'aguardando' : 'ordem'}`}>{statusOrdem(o.status)}</span></td>
              <td>
                <AcoesOrdem
                  ordem={o}
                  busy={props.busy}
                  concluirQtd={props.concluirQtd}
                  setConcluirQtd={props.setConcluirQtd}
                  onMudar={props.onMudar}
                  onExcluir={props.onExcluir}
                  onImprimir={props.onImprimir}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MontagemKitsPainel({ tabOptions = [], onOpenComposition }: Props) {
  const [kits, setKits] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [linha, setLinha] = useState('ALL');
  const [filtro, setFiltro] = useState<'ALL' | 'montar' | 'aguardando' | 'sem'>('ALL');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { pedir: pedirPrevia, abrir: abrirPrevia, elemento: previaElemento } = usePreviaServidor((mensagem) => setAviso(mensagem));
  const [qtdDraft, setQtdDraft] = useState<Record<string, string>>({});
  const [concluirQtd, setConcluirQtd] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [modo, setModo] = useState<'capacidade' | 'ordens'>('capacidade');
  const [filtroOrdem, setFiltroOrdem] = useState<'abertas' | 'montagem' | 'concluidas' | 'todas'>('abertas');
  const [buscaOrdem, setBuscaOrdem] = useState('');
  const [printing, setPrinting] = useState<any>(null);
  const [ordemAberta, setOrdemAberta] = useState<number | null>(null);
  const [ficha, setFicha] = useState<{ assembledBy: string; checkedBy: string; observations: string; erpLaunched: boolean; comps: any[] } | null>(null);

  const imprimir = (ordem: any) => {
    setPrinting(ordem);
    window.setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 180);
  };

  const abrirFicha = (ordem: any) => {
    if (ordemAberta === ordem.id) {
      setOrdemAberta(null);
      setFicha(null);
      return;
    }
    let comps: any[] = [];
    try {
      comps = ordem.componentsLotes ? JSON.parse(ordem.componentsLotes) : [];
    } catch {
      comps = [];
    }
    setOrdemAberta(ordem.id);
    setFicha({
      assembledBy: ordem.assembledBy || '',
      checkedBy: ordem.checkedBy || '',
      observations: ordem.observations || '',
      erpLaunched: ordem.erpLaunched === 1,
      comps,
    });
  };

  const salvarFicha = async (ordem: any) => {
    if (!ficha) return;
    setBusy(String(ordem.id));
    const res = await apiFetch(`/kits/orders/${ordem.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assembledBy: ficha.assembledBy,
        checkedBy: ficha.checkedBy,
        observations: ficha.observations,
        erpLaunched: ficha.erpLaunched ? 1 : 0,
        componentsLotes: JSON.stringify(ficha.comps),
      }),
    });
    setBusy(null);
    if (!res.ok) {
      setAviso('Não foi possível salvar a ordem.');
      return;
    }
    setAviso(`Ordem ${ordem.orderNumber} atualizada.`);
    await load();
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kitsRes, ordersRes] = await Promise.all([
        apiFetch('/kits?limit=500&page=1'),
        apiFetch('/kits/orders'),
      ]);
      if (kitsRes.ok) {
        const data = await kitsRes.json();
        setKits(data.items || []);
      }
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const abertas = useMemo(() => orders.filter((o) => o.status !== 'COMPLETED'), [orders]);
  const abertasPorKit = useMemo(() => {
    const map = new Map<string, { count: number; qty: number }>();
    for (const order of abertas) {
      const code = String(order.kitProductCode || '');
      const current = map.get(code) || { count: 0, qty: 0 };
      current.count += 1;
      current.qty += Number(order.quantity) || 0;
      map.set(code, current);
    }
    return map;
  }, [abertas]);

  const contagem = useMemo(() => {
    let montar = 0;
    let aguardando = 0;
    let sem = 0;
    for (const k of kits) {
      const s = situacao(k).id;
      if (s === 'montar') montar += 1;
      else if (s === 'aguardando') aguardando += 1;
      else sem += 1;
    }
    return { montar, aguardando, sem, ordens: abertas.length };
  }, [kits, abertas.length]);

  const qtdDaOrdem = (k: any, code: string) => {
    const digitada = qtdDraft[code];
    if (digitada != null && digitada !== '') return Number(digitada) || 0;
    // O servidor já desconta dos componentes o que está reservado nas ordens abertas.
    return Math.max(0, Number(k.max_montavel_estoque) || 0);
  };

  const criarOrdem = async (k: any, eImprimir = false) => {
    const p = kitProduto(k);
    const code = String(p.codigo);
    const qtd = qtdDaOrdem(k, code);
    const jaAbertas = abertas.filter((o) => String(o.kitProductCode) === code);
    if (qtd <= 0) {
      setAviso('Não há componentes livres: o estoque está comprometido nas ordens abertas.');
      return;
    }
    const cobreAgora = Number(k.max_montavel_estoque) || 0;
    const avisos: string[] = [];
    if (jaAbertas.length > 0) {
      avisos.push(`Já existe ordem em aberto para ${code} (${jaAbertas.map((o) => o.orderNumber).join(', ')}). Criar outra?`);
    }
    if (qtd > cobreAgora) {
      avisos.push(`O estoque cobre ${cobreAgora} un e a ordem pede ${qtd}. Criar assim mesmo?`);
    }
    if (avisos.length > 0) {
      abrirPrevia({
        titulo: 'Criar ordem de montagem',
        linhas: [{ titulo: p.descricao || code, detalhe: `${qtd} un de ${code}` }],
        avisos,
        confirmarRotulo: 'OK, criar a ordem',
        executar: () => gravarOrdem(k, eImprimir, qtd),
      });
      return;
    }
    await gravarOrdem(k, eImprimir, qtd);
  };

  const gravarOrdem = async (k: any, eImprimir: boolean, qtd: number) => {
    const p = kitProduto(k);
    const code = String(p.codigo);
    setBusy(code);
    setAviso(null);
    try {
      let orderNum = `KIT-${Date.now()}`;
      const resNext = await apiFetch('/kits/next-order-number');
      if (resNext.ok) {
        const data = await resNext.json();
        if (data.nextOrderNumber) orderNum = data.nextOrderNumber;
      }
      const comps = Array.isArray(k.componentes) ? k.componentes : [];
      const lotesList = comps.map((comp: any) => {
        const perKit = Number(comp.quantidade) || 1;
        return {
          code: comp.codigo,
          description: comp.descricao,
          expected_qty: perKit,
          fator_proporcao_qtd: comp.fator_proporcao_qtd ?? null,
          fator_proporcao_kits: comp.fator_proporcao_kits ?? null,
          need_qty: kitComponentNeedQty(perKit, qtd, comp.fator_proporcao_qtd, comp.fator_proporcao_kits),
          lote: '',
        };
      });
      const res = await apiFetch('/kits/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNum,
          kitProductCode: code,
          kitProductDescription: p.descricao || '',
          quantity: qtd,
          status: 'PENDING',
          assembledBy: '',
          checkedBy: '',
          observations: '',
          componentsLotes: JSON.stringify(lotesList),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAviso(err.error || 'Não foi possível criar a ordem.');
        return;
      }
      // O servidor pode trocar o número se outro operador pegou o mesmo antes.
      const resposta = await res.json().catch(() => ({}));
      if (resposta?.orderNumber) orderNum = resposta.orderNumber;
      setQtdDraft((prev) => ({ ...prev, [code]: '' }));
      setAviso(`Ordem ${orderNum} criada: ${qtd} un de ${code}.`);
      setOpen(code);
      const criada = {
        orderNumber: orderNum,
        kitProductCode: code,
        kitProductDescription: p.descricao || '',
        quantity: qtd,
        status: 'PENDING',
        componentsLotes: JSON.stringify(lotesList),
        createdAt: new Date().toISOString(),
      };
      if (eImprimir) imprimir(criada);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const mudarOrdem = async (order: any, status: string, quantityAssembled?: number) => {
    setBusy(String(order.id));
    setAviso(null);
    const body: Record<string, unknown> = { status };
    if (quantityAssembled != null) body.quantityAssembled = quantityAssembled;
    const res = await apiFetch(`/kits/orders/${order.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      setAviso('Não foi possível atualizar a ordem.');
      return;
    }
    await load();
  };

  // Excluir é escrita em 2 passos: o servidor devolve a ordem que sairia e só apaga com confirmar=true.
  const excluirOrdem = async (id: number) => {
    setBusy(String(id));
    try {
      await pedirPrevia({
        url: `/kits/orders/${id}`,
        init: { method: 'DELETE' },
        titulo: 'Excluir ordem de montagem',
        confirmarRotulo: 'OK, excluir',
        linhas: (d) => [{
          titulo: `Ordem ${d.item?.order_number ?? id}`,
          detalhe: `${d.item?.kit_product_code ?? ''} • ${d.item?.quantity ?? ''} un`,
        }],
        erroPadrao: 'Não foi possível excluir a ordem.',
        aoConcluir: load,
      });
    } finally {
      setBusy(null);
    }
  };

  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kits.filter((k) => {
      const p = kitProduto(k);
      if (!p?.codigo) return false;
      if (linha !== 'ALL' && p.linha_prefix !== linha) return false;
      if (filtro !== 'ALL' && situacao(k).id !== filtro) return false;
      if (!q) return true;
      return String(p.codigo).toLowerCase().includes(q) || String(p.descricao || '').toLowerCase().includes(q);
    }).sort((a, b) => (Number(b.max_montavel_estoque) || 0) - (Number(a.max_montavel_estoque) || 0));
  }, [kits, linha, filtro, search]);

  const ordensVisiveis = useMemo(() => {
    const q = buscaOrdem.trim().toLowerCase();
    return orders.filter((o) => {
      if (filtroOrdem === 'abertas' && o.status !== 'PENDING') return false;
      if (filtroOrdem === 'montagem' && o.status !== 'IN_PROGRESS') return false;
      if (filtroOrdem === 'concluidas' && o.status !== 'COMPLETED') return false;
      if (!q) return true;
      return String(o.orderNumber || '').toLowerCase().includes(q)
        || String(o.kitProductCode || '').toLowerCase().includes(q)
        || String(o.kitProductDescription || '').toLowerCase().includes(q);
    });
  }, [orders, filtroOrdem, buscaOrdem]);

  const contagemOrdens = useMemo(() => ({
    abertas: orders.filter((o) => o.status === 'PENDING').length,
    montagem: orders.filter((o) => o.status === 'IN_PROGRESS').length,
    concluidas: orders.filter((o) => o.status === 'COMPLETED').length,
  }), [orders]);

  return (
    <div className="view-container animate-in fade-in duration-200">
      {previaElemento}
      {printing && (
        <>
          <style>{kitOrderPrintStyle}</style>
          <KitOrderPrintSheet order={printing} />
        </>
      )}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <button type="button" onClick={() => setModo('capacidade')} className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer ${modo === 'capacidade' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'}`}>
          O que dá para montar
        </button>
        <button type="button" onClick={() => setModo('ordens')} className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer ${modo === 'ordens' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'}`}>
          Ordens de montagem
        </button>
      </div>
      {aviso && <p className="text-xs font-semibold text-zinc-700 mb-3">{aviso}</p>}
      {modo === 'capacidade' && (
      <>


      {tabOptions.length > 0 && (
        <div className="tabs-container">
          {tabOptions.map((opt) => (
            <button key={opt.id} type="button" className={`tab-btn ${linha === opt.id ? 'active' : ''}`} onClick={() => setLinha(opt.id)}>
              {opt.name}
            </button>
          ))}
        </div>
      )}

      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input className="search-input" placeholder="Buscar kit por código (REF) ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="filters-wrapper">
          <button className="btn-secondary cursor-pointer" type="button" onClick={() => void load()} title="Recarregar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs mb-4">
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center' }} className="flex flex-col items-center gap-4 text-zinc-500">
            <RefreshCw className="animate-spin" size={32} />
            <span>Calculando quantos kits o estoque cobre...</span>
          </div>
        ) : visiveis.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center' }} className="flex flex-col items-center gap-4 text-zinc-500">
            <HelpCircle size={48} style={{ opacity: 0.3 }} />
            <span>Nenhum kit com esse filtro.</span>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-zinc-50">
                <tr className="border-b border-zinc-200">
                  <th className="px-3 py-3 w-8" />
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">REF</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Kit</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Monta agora</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Gargalo</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Com produção</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Ordens</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Situação</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visiveis.map((k) => {
                  const p = kitProduto(k);
                  const code = String(p.codigo);
                  const sit = situacao(k);
                  const lim = gargalo(k);
                  const ordem = abertasPorKit.get(code);
                  const expanded = open === code;
                  const comps = Array.isArray(k.componentes) ? k.componentes : [];
                  return (
                    <React.Fragment key={code}>
                      <tr className="hover:bg-zinc-50/30">
                        <td className="px-3 py-2.5 text-zinc-400 cursor-pointer" onClick={() => setOpen(expanded ? null : code)}>
                          <ChevronRight size={16} style={{ transform: expanded ? 'rotate(90deg)' : undefined }} />
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-800">{code}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-zinc-900">{p.descricao}</div>
                          <div className="text-[10px] text-zinc-500 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded w-fit mt-1">Linha: {p.nome_linha || 'Kits'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`montagem-badge ${sit.badge}`}>{Number(k.max_montavel_estoque) || 0} un</span>
                        </td>
                        <td className="px-4 py-2.5">
                          {lim ? (
                            <>
                              <div className="font-semibold text-zinc-800 max-w-[220px] truncate" title={lim.descricao}>{lim.descricao}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">{lim.codigo} · cobre {lim.cobre}</div>
                            </>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-zinc-800">{Number(k.max_montavel) || 0} un</td>
                        <td className="px-4 py-2.5">
                          {ordem ? (
                            <span className="font-bold text-zinc-800">{ordem.count} · {ordem.qty.toLocaleString('pt-BR')} un</span>
                          ) : <span className="text-zinc-400">Nenhuma</span>}
                          <div className="text-[10px] text-zinc-500 mt-0.5">Livre: {qtdDaOrdem(k, code)} un</div>
                        </td>
                        <td className="px-4 py-2.5"><span className={`status-badge ${sit.id === 'sem' ? 'critico' : sit.id}`}>{sit.label}</span></td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min={0}
                              className="w-16 border border-zinc-200 rounded px-1.5 py-1 text-right bg-white"
                              value={qtdDraft[code] ?? ''}
                              placeholder={String(qtdDaOrdem(k, code) || 0)}
                              onChange={(e) => setQtdDraft((prev) => ({ ...prev, [code]: e.target.value }))}
                              title="Quantidade da ordem. Vazio usa o que o estoque ainda cobre, descontando ordens abertas."
                            />
                            <button
                              type="button"
                              disabled={busy === code}
                              className="px-2 py-1 rounded-lg bg-zinc-900 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                              onClick={() => void criarOrdem(k)}
                            >
                              Gerar ordem
                            </button>
                            <button
                              type="button"
                              disabled={busy === code}
                              className="p-1.5 rounded border border-zinc-200 text-zinc-700 cursor-pointer disabled:opacity-50"
                              title="Gerar e imprimir a folha da ordem"
                              onClick={() => void criarOrdem(k, true)}
                            >
                              <Printer size={14} />
                            </button>
                            <button type="button" className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer" title="Editar composição" onClick={() => onOpenComposition?.(code, p.descricao)}>
                              <Layers size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="expanded-row-tr">
                          <td colSpan={9} style={{ padding: 0 }}>
                            <div className="components-detail-panel">
                              <div className="components-panel-title">O que limita a montagem</div>
                              <table className="components-table">
                                <thead>
                                  <tr>
                                    <th>REF</th>
                                    <th>Item</th>
                                    <th className="numeric-col">No kit</th>
                                    <th className="numeric-col">Estoque</th>
                                    <th className="numeric-col">Cobre</th>
                                    <th className="numeric-col">Na ordem ({qtdDaOrdem(k, code)} un)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {comps.map((comp: any) => {
                                    const n = cobre(comp);
                                    const isLim = lim && comp.codigo === lim.codigo;
                                    const need = kitComponentNeedQty(Number(comp.quantidade) || 1, qtdDaOrdem(k, code), comp.fator_proporcao_qtd, comp.fator_proporcao_kits);
                                    return (
                                      <tr key={comp.codigo}>
                                        <td className="comp-code">{comp.codigo}</td>
                                        <td className="comp-desc">
                                          {comp.descricao}
                                          {comp.fonte === 'item' && <span className="status-badge" style={{ marginLeft: 6, fontSize: '0.6rem' }}>insumo</span>}
                                          {isLim && <span className="status-badge critico" style={{ marginLeft: 6, fontSize: '0.6rem' }}>gargalo</span>}
                                        </td>
                                        <td className="numeric-col">{comp.quantidade}</td>
                                        <td className="numeric-col">
                                          {comp.estoque}
                                          {Number(comp.reservado_ordens) > 0 && <div className="text-[10px] font-normal text-zinc-500">reservado {comp.reservado_ordens}</div>}
                                        </td>
                                        <td className="numeric-col" style={{ fontWeight: 700 }}>{n} kits</td>
                                        <td className="numeric-col" style={{ fontWeight: 700, color: need > Number(comp.estoque) ? 'hsl(var(--danger-hsl))' : undefined }}>{need}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              <OrdensDoKit
                                ordens={abertas.filter((o) => String(o.kitProductCode) === code)}
                                busy={busy}
                                concluirQtd={concluirQtd}
                                setConcluirQtd={setConcluirQtd}
                                onMudar={mudarOrdem}
                                onExcluir={excluirOrdem}
                                onImprimir={imprimir}
                              />
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
          <span>{visiveis.length} kits nesta visão</span>
        </div>
      </div>
      </>
      )}

      {modo === 'ordens' && (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer ${filtroOrdem === 'abertas' ? 'ring-2 ring-amber-500 border-amber-500' : 'border-zinc-200'}`} onClick={() => setFiltroOrdem('abertas')}>
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600"><ClipboardList size={20} /></div>
            <div>
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Pendentes</div>
              <div className="text-xl font-bold text-amber-600">{contagemOrdens.abertas}</div>
            </div>
          </div>
          <div className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer ${filtroOrdem === 'montagem' ? 'ring-2 ring-blue-500 border-blue-500' : 'border-zinc-200'}`} onClick={() => setFiltroOrdem('montagem')}>
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600"><Package size={20} /></div>
            <div>
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Em montagem</div>
              <div className="text-xl font-bold text-blue-600">{contagemOrdens.montagem}</div>
            </div>
          </div>
          <div className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer ${filtroOrdem === 'concluidas' ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-zinc-200'}`} onClick={() => setFiltroOrdem('concluidas')}>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600"><Boxes size={20} /></div>
            <div>
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Concluídas</div>
              <div className="text-xl font-bold text-emerald-600">{contagemOrdens.concluidas}</div>
            </div>
          </div>
        </div>
        <div className="toolbar-section">
          <div className="search-input-wrapper">
            <Search size={18} />
            <input className="search-input" placeholder="Buscar lote, código ou kit..." value={buscaOrdem} onChange={(e) => setBuscaOrdem(e.target.value)} />
          </div>
          <div className="filters-wrapper">
            <button type="button" className="btn-secondary cursor-pointer" onClick={() => setFiltroOrdem('todas')}>Todas</button>
            <button type="button" className="btn-secondary cursor-pointer" onClick={() => void load()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs">
        <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50 font-bold text-[10px] uppercase tracking-wider text-zinc-500">
          {filtroOrdem === 'concluidas' ? 'Ordens concluídas' : filtroOrdem === 'montagem' ? 'Ordens em montagem' : filtroOrdem === 'todas' ? 'Todas as ordens' : 'Ordens pendentes'}
        </div>
        {ordensVisiveis.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }} className="text-zinc-500">Nenhuma ordem nesse filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-50">
                <tr className="border-b border-zinc-200">
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Lote</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Kit</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Quantidade</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Emissão</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Situação</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px]">ERP</th>
                  <th className="px-4 py-3 font-bold text-zinc-500 uppercase tracking-wider text-[10px] text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ordensVisiveis.map((o) => {
                  const aberta = ordemAberta === o.id;
                  return (
                    <React.Fragment key={o.id}>
                      <tr className="border-t border-zinc-100 hover:bg-zinc-50/30 cursor-pointer" onClick={() => abrirFicha(o)}>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-900">{o.orderNumber}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-zinc-900">{o.kitProductDescription}</div>
                          <div className="font-mono text-[10px] text-zinc-500">{o.kitProductCode}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="font-bold">{Number(o.quantity) || 0} un</div>
                          {o.quantityAssembled != null && <div className="text-[10px] text-zinc-500">Real: {o.quantityAssembled}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500">{(() => {
                          const raw = o.createdAt || o.created_at;
                          const date = raw ? new Date(raw) : null;
                          return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : (raw || '—');
                        })()}</td>
                        <td className="px-4 py-2.5">
                          <span className={`status-badge ${o.status === 'COMPLETED' ? 'saudavel' : o.status === 'IN_PROGRESS' ? 'aguardando' : 'ordem'}`}>{statusOrdem(o.status)}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`status-badge ${o.erpLaunched === 1 ? 'abundante' : ''}`}>{o.erpLaunched === 1 ? 'Lançado' : 'Não'}</span>
                        </td>
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <AcoesOrdem
                            ordem={o}
                            busy={busy}
                            concluirQtd={concluirQtd}
                            setConcluirQtd={setConcluirQtd}
                            onMudar={mudarOrdem}
                            onExcluir={excluirOrdem}
                            onImprimir={imprimir}
                          />
                        </td>
                      </tr>
                      {aberta && ficha && (
                        <tr className="expanded-row-tr">
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div className="components-detail-panel space-y-3">
                              <div className="components-panel-title">Organização da ordem {o.orderNumber}</div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <label className="text-[10px] font-bold text-zinc-500">Montador
                                  <input className="mt-1 w-full border border-zinc-200 rounded-lg px-2 py-1.5 text-xs" value={ficha.assembledBy} onChange={(e) => setFicha({ ...ficha, assembledBy: e.target.value })} />
                                </label>
                                <label className="text-[10px] font-bold text-zinc-500">Conferente
                                  <input className="mt-1 w-full border border-zinc-200 rounded-lg px-2 py-1.5 text-xs" value={ficha.checkedBy} onChange={(e) => setFicha({ ...ficha, checkedBy: e.target.value })} />
                                </label>
                                <label className="text-[10px] font-bold text-zinc-500 flex items-end gap-2 pb-1">
                                  <input type="checkbox" checked={ficha.erpLaunched} onChange={(e) => setFicha({ ...ficha, erpLaunched: e.target.checked })} />
                                  Lançado no ERP
                                </label>
                              </div>
                              <label className="text-[10px] font-bold text-zinc-500 block">Observações
                                <textarea className="mt-1 w-full border border-zinc-200 rounded-lg px-2 py-1.5 text-xs" rows={2} value={ficha.observations} onChange={(e) => setFicha({ ...ficha, observations: e.target.value })} />
                              </label>
                              <table className="components-table">
                                <thead>
                                  <tr>
                                    <th>Código</th>
                                    <th>Componente</th>
                                    <th className="numeric-col">Programada</th>
                                    <th>Lote utilizado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ficha.comps.map((item, idx) => (
                                    <tr key={item.code || idx}>
                                      <td className="comp-code">{item.code}</td>
                                      <td className="comp-desc">{item.description}</td>
                                      <td className="numeric-col">{kitOrderComponentNeed(item, Number(o.quantity) || 0)}</td>
                                      <td>
                                        <input
                                          className="w-full border border-zinc-200 rounded px-2 py-1 text-xs font-mono"
                                          value={item.lote || ''}
                                          onChange={(e) => {
                                            const comps = ficha.comps.slice();
                                            comps[idx] = { ...item, lote: e.target.value };
                                            setFicha({ ...ficha, comps });
                                          }}
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="flex gap-2">
                                <button type="button" className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-[10px] font-bold cursor-pointer" onClick={() => void salvarFicha(o)}>Salvar</button>
                                <button type="button" className="px-3 py-1.5 rounded-lg border border-zinc-200 text-[10px] font-bold cursor-pointer" onClick={() => imprimir({ ...o, ...ficha, assembledBy: ficha.assembledBy, componentsLotes: JSON.stringify(ficha.comps), observations: ficha.observations })}>Imprimir folha</button>
                              </div>
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
        <div className="pagination-container"><span>{ordensVisiveis.length} ordens</span></div>
        </div>
      </div>
      )}
    </div>
  );
}
