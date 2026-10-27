import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../geral/lib/http';
import { useAviso } from '../../../geral/components/ui/Aviso';
import { usePreviaServidor, linhasAjusteFila, linhasExclusaoFila } from '../../lib/usePreviaServidor';
import { kitComponentNeedQty } from '../../lib/kitComponentQty';
import { formatUnitsToKg } from '../../lib/unitConversion';
import {
  componentesAProduzir, duracaoValida, ehEmbalagem, limitante, necessidade, porKitRotulo,
  situacao, statusComponente, vendaAvulsaMensal, type KitResumo, type SituacaoKit,
} from '../../lib/kitsSituacao';
import {
  Search, RefreshCw, HelpCircle, Edit3, CheckCircle2, ChevronRight as ChevronRightIcon,
  Layers, Package, Boxes, Plus, FlaskConical, X
} from 'lucide-react';
import { MontagemKitsPainel } from './MontagemKitsPainel';
import { BatchOpportunityModal } from './BatchOpportunityModal';

const fmt = (n: any) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

const TH = 'px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px]';
const TD = 'px-4 py-2.5 border-b border-zinc-100 align-middle';

const SITUACAO_INFO: Record<SituacaoKit, { rotulo: string; pill: string }> = {
  montar: { rotulo: 'Montar agora', pill: 'bg-zinc-900 text-white border-zinc-900' },
  produzir: { rotulo: 'Produzir componente', pill: 'bg-rose-50 text-rose-700 border-rose-200' },
  embalagem: { rotulo: 'Falta embalagem', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  ok: { rotulo: 'Kits OK', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const PILL_STATUS: Record<string, string> = {
  Cobre: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Parcial: 'bg-amber-50 text-amber-700 border-amber-200',
  Produzir: 'bg-rose-50 text-rose-700 border-rose-200',
  Comprar: 'bg-amber-50 text-amber-700 border-amber-200',
};

function Pill({ classe, children }: { classe: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${classe}`}>{children}</span>;
}

function corBarra(meses: number | null) {
  if (meses == null) return 'bg-zinc-300';
  if (meses < 1) return 'bg-rose-500';
  if (meses < 2) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function DuracaoCell({ meses, dias, rotuloVendas, vendasTexto }: { meses: number | null; dias: number | null; rotuloVendas: string; vendasTexto: string }) {
  const m = duracaoValida(meses);
  const pct = m == null ? 0 : Math.max(0, Math.min(100, (m / 6) * 100));
  const d = dias == null || !Number.isFinite(dias) || Math.abs(dias) > 9999 ? null : dias;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between font-semibold font-mono text-zinc-700 text-[10px]">
        <span>{m == null ? '—' : `${fmt(m)}m`}</span>
        <span>{d == null ? '' : `${Math.round(d)}d`}</span>
      </div>
      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${corBarra(m)}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-400 font-mono mt-0.5">
        <span>{rotuloVendas}: {vendasTexto}</span>
      </div>
    </div>
  );
}

export function KitsTab({
  onEditOverrides,
  onRefresh,
  loading,
  tabOptions,
  onOpenComposition,
  onToggleApenasKit,
  onShowDetails,
}: any) {
  const { avisar, aviso } = useAviso();
  const { pedir: pedirPrevia, elemento: previaElemento } = usePreviaServidor(avisar);
  const [centralSubTab, setCentralSubTab] = useState<'demandas' | 'montagem'>('demandas');
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
        <span>Fila</span>
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
    const p = kit;
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

  const [kitsAll, setKitsAll] = useState<KitResumo[]>([]);
  const [prods, setProds] = useState<Map<string, any>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [situacaoSel, setSituacaoSel] = useState<SituacaoKit | 'todos'>('montar');
  const [visao, setVisao] = useState<'kit' | 'comp'>('kit');
  const [linha, setLinha] = useState('Todos');
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      const [rk, rp] = await Promise.all([
        apiFetch('/kits?limit=500&page=1'),
        apiFetch('/products?include_all_regimes=true&page=1&limit=9999'),
      ]);
      if (rk.ok) {
        const jk = await rk.json();
        setKitsAll(jk.items || []);
      }
      if (rp.ok) {
        const jp = await rp.json();
        setProds(new Map((jp.items || []).map((p: any) => [p.codigo, p])));
      }
    } catch {
      /* mantém o que já estava na tela */
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) carregar();
  }, [loading, carregar]);

  const contagem = useMemo(() => {
    const c = { montar: 0, produzir: 0, embalagem: 0, ok: 0 };
    kitsAll.forEach((k) => { c[situacao(k)]++; });
    return c;
  }, [kitsAll]);

  const linhas = useMemo(() => ['Todos', ...new Set(kitsAll.map((k) => k.nome_linha).filter(Boolean) as string[])], [kitsAll]);

  const passaBusca = (codigo: string, descricao: string) => {
    const q = busca.trim().toLowerCase();
    return !q || `${codigo} ${descricao}`.toLowerCase().includes(q);
  };

  const listaKits = useMemo(() => {
    const ordem: Record<SituacaoKit, number> = { montar: 0, produzir: 1, embalagem: 2, ok: 3 };
    return kitsAll
      .filter((k) => (linha === 'Todos' || k.nome_linha === linha) && passaBusca(k.codigo, k.descricao))
      .filter((k) => situacaoSel === 'todos' || situacao(k) === situacaoSel)
      .sort((a, b) => ordem[situacao(a)] - ordem[situacao(b)] || necessidade(b) - necessidade(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitsAll, linha, busca, situacaoSel]);

  const listaComps = useMemo(
    () => componentesAProduzir(kitsAll, prods)
      .filter((e) => (linha === 'Todos' || e.nome_linha === linha) && passaBusca(e.codigo, e.descricao)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kitsAll, prods, linha, busca],
  );

  const alternarAberto = (codigo: string) => {
    setAbertos((prev) => {
      const n = new Set(prev);
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo);
      return n;
    });
  };

  const atualizar = () => {
    carregar();
    if (onRefresh) onRefresh();
  };

  const produtoDe = (c: any) => prods.get(c.codigo) ?? c;

  const botoesComponente = (produto: any) => (
    <>
      <button
        type="button"
        onClick={() => setBatchModalProduct(produto)}
        className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
        title="Oportunidades de Batelada & Suprimentos"
      >
        <FlaskConical size={13} />
      </button>
      <button
        type="button"
        onClick={() => onEditOverrides?.(produto)}
        className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
        title="Ajustar regras e overrides"
      >
        <Edit3 size={13} />
      </button>
    </>
  );

  const seloVenda = (codigo: string, fallback: any) => {
    const p = prods.get(codigo);
    const avulso = vendaAvulsaMensal(p);
    const soKit = (p?.produzir_apenas_kit ?? fallback?.produzir_apenas_kit ?? 0) === 1;
    return (
      <button
        type="button"
        onClick={() => onToggleApenasKit?.(codigo, soKit ? 1 : 0)}
        className={`px-1.5 py-0.5 text-[10px] font-semibold border rounded cursor-pointer ${avulso > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}
        title={soKit ? 'Só para kit: clique para produzir também avulso' : 'Também avulso: clique para produzir só para kit'}
      >
        {avulso > 0 ? `Vende avulso ${fmt(avulso)}/m` : 'Só no kit'}
      </button>
    );
  };

  const linhaKit = (k: KitResumo) => {
    const s = situacao(k);
    const need = necessidade(k);
    const lim = limitante(k);
    const aberto = abertos.has(k.codigo);
    const montavel = Number(k.max_montavel_estoque) || 0;
    const comps = k.componentes || [];
    const mostraTrava = s !== 'ok' && s !== 'montar' && lim;
    const kAny: any = k;
    return (
      <React.Fragment key={k.codigo}>
        <tr className="hover:bg-zinc-50/50 transition-colors cursor-pointer" onClick={() => alternarAberto(k.codigo)}>
          <td className={`${TD} w-6 text-zinc-400`}>
            <ChevronRightIcon size={14} style={{ transform: aberto ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }} />
          </td>
          <td className={`${TD} font-mono font-bold text-zinc-900`}>
            <button type="button" className="hover:underline cursor-pointer bg-transparent border-none p-0 font-bold" onClick={(e) => { e.stopPropagation(); onShowDetails?.(k.codigo); }}>{k.codigo}</button>
          </td>
          <td className={TD} style={{ minWidth: 220 }}>
            <button type="button" className="font-bold text-zinc-900 hover:underline cursor-pointer bg-transparent border-none p-0 text-left" onClick={(e) => { e.stopPropagation(); onShowDetails?.(k.codigo); }}>{k.descricao}</button>
            <div className="flex flex-wrap gap-1.5 mt-1 items-center">
              <span className="text-[10px] text-zinc-500 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded">Linha: {k.nome_linha || 'Kits'}</span>
              <span className="text-[10px] text-zinc-600 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded">{comps.length} componentes</span>
              {mostraTrava && lim && (
                <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border rounded ${ehEmbalagem(lim.codigo) ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  Trava: {String(lim.descricao || '').slice(0, 34)}{Number(lim.estoque) < 0 ? ` (${lim.estoque})` : ''}
                </span>
              )}
            </div>
          </td>
          <td className={`${TD} text-right font-bold font-mono text-zinc-900 whitespace-nowrap`}>
            <span>{fmt(k.estoque_futuro_com_producao)}</span>
            <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
              Est: {fmt(kAny.estoque)} | Prod: {fmt(kAny.producao)} | Ped: {fmt(kAny.pedidos_aberto)}
            </div>
          </td>
          <td className={TD} style={{ minWidth: 150 }}>
            <DuracaoCell meses={kAny.duracao_meses ?? null} dias={kAny.duracao_dias ?? null} rotuloVendas="Vendas kit" vendasTexto={k.media_vendas == null ? '—' : `${fmt(k.media_vendas)}/m`} />
          </td>
          <td className={TD}><Pill classe={SITUACAO_INFO[s].pill}>{SITUACAO_INFO[s].rotulo}</Pill></td>
          <td className={`${TD} text-right font-bold font-mono whitespace-nowrap ${montavel > 0 ? 'text-zinc-900' : 'text-zinc-300'}`}>
            {fmt(montavel)} kits
            {mostraTrava && lim && <div className="text-[10px] text-zinc-400 font-normal">limita: {lim.codigo}</div>}
          </td>
          <td className={`${TD} text-right font-bold font-mono text-zinc-900 whitespace-nowrap`}>{need > 0 ? `${fmt(need)} kits` : '—'}</td>
          <td className={`${TD} text-center whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
            {renderQueueCell(k.codigo, k.descricao, need > 0 ? need : 50)}
          </td>
          <td className={`${TD} text-center whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-1 justify-center items-center">
              <button
                type="button"
                onClick={() => setKitOrderModal({ kit: k, qty: montavel > 0 ? montavel : (need > 0 ? need : 20), obs: '' })}
                className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                title="Criar ordem de montagem deste kit diretamente"
              >
                <Boxes size={12} />
                <span>Montar Kit</span>
              </button>
              <button type="button" className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer" title="Composição" onClick={() => onOpenComposition?.(k.codigo, k.descricao)}>
                <Layers size={14} />
              </button>
              <button type="button" className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer" title="Ajustar regras e overrides" onClick={() => onEditOverrides?.(k)}>
                <Edit3 size={14} />
              </button>
            </div>
          </td>
        </tr>
        {aberto && (
          <tr className="bg-zinc-50/60">
            <td className="border-b border-zinc-100" />
            <td colSpan={9} className="border-b border-zinc-100 px-4 pt-1.5 pb-3">
              {comps.length === 0 ? (
                <p className="text-xs text-zinc-500 py-2">Este kit não tem componentes na composição.</p>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr>
                      {['Componente', 'Venda', 'Por kit', 'Estoque', 'Reservado (ordens)', 'Cobre (kits)', 'Status', 'Precisa produzir', 'Fila PCP'].map((t, i) => (
                        <th key={t} className={`px-2.5 py-1.5 text-[9px] font-bold uppercase text-zinc-400 border-b border-zinc-200 ${(i >= 2 && i <= 5) || i === 7 ? 'text-right' : i === 8 ? 'text-center' : ''}`}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map((c) => {
                      const emb = ehEmbalagem(c.codigo);
                      const trava = !!lim && c.codigo === lim.codigo && s !== 'ok' && s !== 'montar';
                      const st = statusComponente(c, need);
                      const rec = Number(c.producao_recomendada) || 0;
                      return (
                        <tr key={c.codigo} className={trava ? 'bg-orange-50' : ''}>
                          <td className="px-2.5 py-1.5 border-b border-zinc-100">
                            <div className="font-semibold text-zinc-900 text-[11px]">{c.descricao}</div>
                            <div className="font-mono text-zinc-400 text-[10px]">{c.codigo}{trava && <> · <b className="text-orange-700">trava o kit</b></>}</div>
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-zinc-100">
                            {emb
                              ? <span className="px-1.5 py-0.5 text-[10px] font-semibold border rounded bg-zinc-100 text-zinc-600 border-zinc-200">Embalagem</span>
                              : seloVenda(c.codigo, c)}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-zinc-100 text-right font-mono">{porKitRotulo(c)}</td>
                          <td className={`px-2.5 py-1.5 border-b border-zinc-100 text-right font-mono ${Number(c.estoque) < 0 ? 'text-rose-700 font-bold' : ''}`}>{fmt(c.estoque)}</td>
                          <td className="px-2.5 py-1.5 border-b border-zinc-100 text-right font-mono text-zinc-500">{c.reservado_ordens ? fmt(c.reservado_ordens) : '—'}</td>
                          <td className="px-2.5 py-1.5 border-b border-zinc-100 text-right font-mono font-bold">{fmt(c.kits_cobertos)} kits</td>
                          <td className="px-2.5 py-1.5 border-b border-zinc-100"><Pill classe={PILL_STATUS[st]}>{st}</Pill></td>
                          <td className="px-2.5 py-1.5 border-b border-zinc-100 text-right font-mono font-bold">{!emb && rec > 0 ? `${fmt(rec)} un` : '—'}</td>
                          <td className="px-2.5 py-1.5 border-b border-zinc-100 text-center">
                            {!emb && (
                              <div className="flex items-center gap-1 justify-center">
                                {renderQueueCell(c.codigo, c.descricao, rec > 0 ? rec : 50, produtoDe(c))}
                                {botoesComponente(produtoDe(c))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const linhaComponente = (e: ReturnType<typeof componentesAProduzir>[number]) => {
    const p = prods.get(e.codigo) || {};
    const produzir = e.recomendada > 0;
    return (
      <tr key={e.codigo} className="hover:bg-zinc-50/50 transition-colors">
        <td className={`${TD} font-mono font-bold text-zinc-900`}>
          <button type="button" className="hover:underline cursor-pointer bg-transparent border-none p-0 font-bold" onClick={() => onShowDetails?.(e.codigo)}>{e.codigo}</button>
        </td>
        <td className={TD} style={{ minWidth: 260 }}>
          <button type="button" className="font-bold text-zinc-900 hover:underline cursor-pointer bg-transparent border-none p-0 text-left" onClick={() => onShowDetails?.(e.codigo)}>{e.descricao}</button>
          <div className="flex flex-wrap gap-1.5 mt-1">{seloVenda(e.codigo, p)}</div>
        </td>
        <td className={`${TD} text-[10px] text-zinc-600`}>
          {e.kits.length} kit(s): {e.kits.slice(0, 2).join(', ')}{e.kits.length > 2 ? '…' : ''}
        </td>
        <td className={`${TD} text-right font-bold font-mono text-zinc-900 whitespace-nowrap`}>
          {fmt(e.efp)}
          <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Est: {fmt(p.estoque)} | Prod: {fmt(p.producao)}</div>
        </td>
        <td className={TD} style={{ minWidth: 170 }}>
          <DuracaoCell meses={e.meses} dias={e.dias} rotuloVendas={`Avulso ${fmt(e.avulso)} + kits ${fmt(e.demandaKits)}`} vendasTexto={`${fmt(e.total)}/m`} />
        </td>
        <td className={TD}>
          <Pill classe={produzir ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
            {produzir ? 'Produzir' : 'Sem estoque p/ kit'}
          </Pill>
        </td>
        <td className={`${TD} text-right font-bold font-mono text-zinc-900 whitespace-nowrap`}>{produzir ? `${fmt(e.recomendada)} un` : '—'}</td>
        <td className={`${TD} text-center`}>
          <div className="flex items-center gap-1 justify-center">
            {renderQueueCell(e.codigo, e.descricao, produzir ? e.recomendada : 50, prods.get(e.codigo))}
            {botoesComponente(prods.get(e.codigo) ?? { codigo: e.codigo, descricao: e.descricao })}
          </div>
        </td>
      </tr>
    );
  };

  const segmentos: [SituacaoKit | 'todos', string, number][] = [
    ['montar', 'Montar agora', contagem.montar],
    ['produzir', 'Produzir componente', contagem.produzir],
    ['embalagem', 'Falta embalagem', contagem.embalagem],
    ['ok', 'Kits OK', contagem.ok],
    ['todos', 'Todos', kitsAll.length],
  ];

  const botaoSeg = (ativo: boolean) => `px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${ativo ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-600 hover:text-zinc-900'}`;

  return (
    <div className="view-container animate-in fade-in duration-200">
      {previaElemento}
      {aviso}
      {/* Central de Kits: Sub-abas de topo */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200">
        <div className="inline-flex p-1 bg-zinc-100 rounded-lg border border-zinc-200 text-xs font-semibold">
          <button type="button" onClick={() => setCentralSubTab('demandas')} className={botaoSeg(centralSubTab === 'demandas')}>
            <Package size={14} />
            <span>Demandas de Kits</span>
          </button>
          <button type="button" onClick={() => setCentralSubTab('montagem')} className={botaoSeg(centralSubTab === 'montagem')}>
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
          {/* Faixa de situação (mesmo estilo de Demandas de Produção) */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-zinc-100 p-1.5 rounded-xl border border-zinc-200">
            <div className="inline-flex rounded-lg p-0.5 bg-zinc-200/60 text-xs font-semibold flex-wrap gap-0.5">
              {segmentos.map(([id, rotulo, n]) => (
                <button key={id} type="button" onClick={() => { setSituacaoSel(id); setVisao('kit'); }} className={botaoSeg(situacaoSel === id && visao === 'kit')}>
                  <span>{rotulo}</span>
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">{n}</span>
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg p-0.5 bg-zinc-200/60 text-xs font-semibold gap-0.5">
              <button type="button" onClick={() => setVisao('kit')} className={botaoSeg(visao === 'kit')}>Por kit</button>
              <button type="button" onClick={() => setVisao('comp')} className={botaoSeg(visao === 'comp')}>Componentes a produzir</button>
            </div>
          </div>

          <div className="tabs-container">
            {linhas.map((l) => (
              <button key={l} type="button" className={`tab-btn ${linha === l ? 'active' : ''}`} onClick={() => setLinha(l)}>
                {l}
              </button>
            ))}
          </div>

          <div className="toolbar-section">
            <div className="search-input-wrapper">
              <Search size={18} />
              <input
                type="text"
                placeholder="Buscar kit ou componente por código (REF) ou descrição..."
                className="search-input"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="filters-wrapper">
              <button className="btn-secondary cursor-pointer" onClick={atualizar} title="Recarregar dados" type="button">
                <RefreshCw size={16} className={loading || carregando ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs">
            {carregando ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }} className="flex flex-col items-center gap-4">
                <RefreshCw className="animate-spin" size={32} />
                <span>Calculando demanda dos kits...</span>
              </div>
            ) : (visao === 'kit' ? listaKits.length : listaComps.length) === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }} className="flex flex-col items-center gap-4">
                <HelpCircle size={48} style={{ opacity: 0.3 }} />
                <span>{visao === 'kit' ? 'Nenhum kit nesta situação.' : 'Nada a produzir.'}</span>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 sticky top-0 z-10">
                    {visao === 'kit' ? (
                      <tr className="border-b border-zinc-200">
                        <th className="px-3 py-3 w-6" />
                        <th className={TH}>REF</th>
                        <th className={TH}>Descrição / Linha</th>
                        <th className={`${TH} text-right`} title="EFP = Estoque + Produção − Pedidos (disponível projetado)">EFP</th>
                        <th className={TH}>Duração (kit)</th>
                        <th className={TH}>Status</th>
                        <th className={`${TH} text-right`}>Dá p/ montar hoje</th>
                        <th className={`${TH} text-right`}>Sug. montar</th>
                        <th className={`${TH} text-center`}>Fila PCP</th>
                        <th className={`${TH} text-center`}>Ações</th>
                      </tr>
                    ) : (
                      <tr className="border-b border-zinc-200">
                        <th className={TH}>REF</th>
                        <th className={TH}>Componente</th>
                        <th className={TH}>Usado em</th>
                        <th className={`${TH} text-right`} title="EFP = Estoque + Produção − Pedidos (disponível projetado)">EFP</th>
                        <th className={TH}>Duração (avulso + kits)</th>
                        <th className={TH}>Status</th>
                        <th className={`${TH} text-right`}>Sug. prod.</th>
                        <th className={`${TH} text-center`}>Fila PCP</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {visao === 'kit' ? listaKits.map(linhaKit) : listaComps.map(linhaComponente)}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination-container">
              <span>
                {visao === 'kit'
                  ? `${listaKits.length} de ${kitsAll.length} kits. "Dá p/ montar hoje" já desconta o que as ordens de montagem abertas reservam.`
                  : `${listaComps.length} componentes de produção que travam algum kit. Duração = projeção ÷ (venda avulsa + venda dos kits em que entra).`}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Modal Rápido: Criar Ordem de Montagem de Kit */}
      {kitOrderModal && (() => {
        const p = kitOrderModal.kit;
        const potencialHoje = Math.max(0, Number(p.max_montavel_estoque) || 0);
        const lim = limitante(p);
        const gargaloComp = lim ? { codigo: lim.codigo, cobre: lim.kits_cobertos ?? 0 } : null;
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
