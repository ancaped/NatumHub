import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../geral/lib/http';
import { useAviso } from '../../../geral/components/ui/Aviso';
import { Drawer } from '../../../geral/components/ui/Drawer';
import { ReportHeader, ReportTabs, FilterBar, FiltroSelect, StatusBadge, TabelaPainel, BotaoAcao, type VarianteBadge } from '../../../geral/components/ui/ReportKit';
import { cn } from '../../../geral/lib/utils';
import { usePreviaServidor, linhasAjusteFila, linhasExclusaoFila } from '../../lib/usePreviaServidor';
import { kitComponentNeedQty } from '../../lib/kitComponentQty';
import { formatUnitsToKg } from '../../lib/unitConversion';
import { situacaoKit, situacaoComponente, componenteLimitante, type SituacaoKit } from '../../lib/kitsSituacao';
import { RefreshCw, HelpCircle, Edit3, CheckCircle2, Layers, Plus, FlaskConical, Boxes, X } from 'lucide-react';
import { MontagemKitsPainel } from './MontagemKitsPainel';
import { BatchOpportunityModal } from './BatchOpportunityModal';

function kitProduto(k: any) {
  return k?.produto || k?.kit_detalhes || k;
}

const SITUACAO_ROTULO: Record<SituacaoKit, string> = {
  montar_agora: 'Montar agora',
  falta_componente: 'Falta componente',
  ok: 'Ok',
};
const SITUACAO_VARIANTE: Record<SituacaoKit, VarianteBadge> = {
  montar_agora: 'ordem',
  falta_componente: 'critico',
  ok: 'saudavel',
};

/** Números do kit lidos do servidor: falta montar, dá para montar hoje e componente limitante. */
function resumoKit(k: any) {
  const p = kitProduto(k);
  const falta = Math.max(0, Number(p?.producao_recomendada) || 0);
  const montavelHoje = Math.max(0, Number(k?.max_montavel_estoque) || 0);
  const comps: any[] = Array.isArray(k?.componentes) ? k.componentes : [];
  return {
    falta,
    montavelHoje,
    situacao: situacaoKit(falta, montavelHoje),
    limitante: componenteLimitante(comps),
  };
}

export function KitsTab({
  kits,
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
  const [centralSubTab, setCentralSubTab] = useState<'kits' | 'montagem'>('kits');
  const [situacaoAtiva, setSituacaoAtiva] = useState<SituacaoKit | 'todos'>('montar_agora');
  const [busca, setBusca] = useState('');
  const [linha, setLinha] = useState('ALL');
  const [kitAbertoCodigo, setKitAbertoCodigo] = useState<string | null>(null);
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

  const lista: any[] = Array.isArray(kits) ? kits : [];

  const linhas = useMemo(() => {
    const set = new Set<string>();
    for (const k of lista) {
      const n = kitProduto(k)?.nome_linha;
      if (n) set.add(String(n));
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [lista]);

  const contagem = useMemo(() => {
    const c = { montar_agora: 0, falta_componente: 0, ok: 0, todos: 0 };
    for (const k of lista) {
      if (!kitProduto(k)?.codigo) continue;
      c[resumoKit(k).situacao] += 1;
      c.todos += 1;
    }
    return c;
  }, [lista]);

  const linhasVisiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista
      .filter((k) => kitProduto(k)?.codigo)
      .map((k) => ({ k, p: kitProduto(k), r: resumoKit(k) }))
      .filter(({ p, r }) => {
        if (situacaoAtiva !== 'todos' && r.situacao !== situacaoAtiva) return false;
        if (linha !== 'ALL' && String(p.nome_linha || '') !== linha) return false;
        if (!q) return true;
        return String(p.codigo).toLowerCase().includes(q) || String(p.descricao || '').toLowerCase().includes(q);
      })
      .sort((a, b) => b.r.falta - a.r.falta || String(a.p.descricao || '').localeCompare(String(b.p.descricao || ''), 'pt-BR'));
  }, [lista, situacaoAtiva, busca, linha]);

  const kitAberto = kitAbertoCodigo ? lista.find((k) => String(kitProduto(k)?.codigo) === kitAbertoCodigo) : null;

  const renderDrawerKit = () => {
    if (!kitAberto) return null;
    const p = kitProduto(kitAberto);
    const r = resumoKit(kitAberto);
    const comps: any[] = Array.isArray(kitAberto.componentes) ? kitAberto.componentes : [];
    return (
      <Drawer
        onClose={() => setKitAbertoCodigo(null)}
        size="xl"
        title={p.descricao}
        subtitle={<span className="font-mono">{p.codigo}{p.nome_linha ? ` · ${p.nome_linha}` : ''}</span>}
        badge={<StatusBadge variante={SITUACAO_VARIANTE[r.situacao]}>{SITUACAO_ROTULO[r.situacao]}</StatusBadge>}
        headerActions={
          <>
            <BotaoAcao
              primario
              title="Criar ordem de montagem deste kit"
              onClick={() => setKitOrderModal({ kit: kitAberto, qty: r.montavelHoje > 0 ? r.montavelHoje : (r.falta > 0 ? r.falta : 20), obs: '' })}
            >
              <Boxes size={13} /> Montar kit
            </BotaoAcao>
            <BotaoAcao title="Composição do kit" onClick={() => onOpenComposition?.(p.codigo, p.descricao)}>
              <Layers size={13} /> Composição
            </BotaoAcao>
            <BotaoAcao title="Ajustar regras do kit" onClick={() => onEditOverrides?.(p)}>
              <Edit3 size={13} /> Regras
            </BotaoAcao>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <div className="text-[10px] font-bold uppercase text-zinc-500">Falta montar</div>
              <div className="text-base font-bold font-mono text-zinc-900">{r.falta > 0 ? `${r.falta} un` : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-zinc-500">Dá para montar hoje</div>
              <div className="text-base font-bold font-mono text-zinc-900">{r.montavelHoje} un</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-zinc-500">Fila do PCP</div>
              <div className="mt-0.5">{renderQueueCell(String(p.codigo), p.descricao, r.falta > 0 ? r.falta : 50)}</div>
            </div>
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            Projeção: EFP {p.estoque_futuro_com_producao} (estoque {p.estoque} + produção {p.producao} − pedidos {p.pedidos_aberto})
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-zinc-500 mb-1.5">Componentes</div>
            {comps.length === 0 ? (
              <p className="text-zinc-500">Este kit não tem componentes na composição.</p>
            ) : (
              <TabelaPainel>
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th style={{ textAlign: 'right' }}>Por kit</th>
                    <th style={{ textAlign: 'right' }}>Estoque</th>
                    <th style={{ textAlign: 'right' }}>Reservado</th>
                    <th style={{ textAlign: 'right' }}>Cobre (kits)</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {comps.map((comp: any) => {
                    const cobre = Number(comp.kits_cobertos) || 0;
                    const st = situacaoComponente(cobre, r.falta);
                    const ehProduto = comp.fonte !== 'item';
                    const recQty = Number(comp.producao_recomendada) > 0 ? Number(comp.producao_recomendada) : 50;
                    return (
                      <tr key={comp.codigo}>
                        <td>
                          <button type="button" className="font-bold text-zinc-900 hover:underline cursor-pointer bg-transparent border-none p-0 text-left" onClick={() => onShowDetails?.(comp.codigo)}>
                            {comp.descricao}
                          </button>
                          <div className="text-[10px] text-zinc-400 font-mono">{comp.codigo}</div>
                        </td>
                        <td className="font-mono" style={{ textAlign: 'right' }}>{comp.quantidade}</td>
                        <td className="font-mono" style={{ textAlign: 'right' }}>{comp.estoque}</td>
                        <td className="font-mono" style={{ textAlign: 'right' }}>{comp.reservado_ordens || 0}</td>
                        <td className="font-mono font-bold" style={{ textAlign: 'right' }}>{cobre}</td>
                        <td>
                          <StatusBadge variante={st === 'cobre' ? 'saudavel' : st === 'parcial' ? 'ordem' : 'critico'}>
                            {st === 'cobre' ? 'Cobre' : st === 'parcial' ? 'Parcial' : 'Zerado'}
                          </StatusBadge>
                        </td>
                        <td>
                          {ehProduto && (
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                className="text-[10px] font-bold cursor-pointer text-zinc-600 hover:text-zinc-900"
                                title="Clique para alternar entre Somente Kit e Venda + Kit"
                                onClick={() => onToggleApenasKit?.(comp.codigo, comp.produzir_apenas_kit ?? 0)}
                              >
                                {comp.produzir_apenas_kit === 1 ? 'Só para kit' : 'Também avulso'}
                              </button>
                              {renderQueueCell(comp.codigo, comp.descricao, recQty, comp)}
                              <button type="button" onClick={() => setBatchModalProduct(comp)} className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer" title="Oportunidades de Batelada & Suprimentos">
                                <FlaskConical size={13} />
                              </button>
                              <button type="button" onClick={() => onEditOverrides?.(comp)} className="p-1 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer" title="Ajustar regras e overrides">
                                <Edit3 size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TabelaPainel>
            )}
          </div>
        </div>
      </Drawer>
    );
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      {previaElemento}
      {aviso}
      <ReportHeader
        titulo="Central de Kits"
        subtitulo={centralSubTab === 'kits' ? `${contagem.todos} kits. O que montar, o que falta e o que limita a montagem.` : 'Ordens de montagem de kits.'}
        acoes={centralSubTab === 'kits' && (
          <BotaoAcao onClick={onRefresh} disabled={loading} title="Recarregar kits">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Atualizar
          </BotaoAcao>
        )}
      />
      <ReportTabs
        ativa={centralSubTab}
        onChange={(id) => setCentralSubTab(id as 'kits' | 'montagem')}
        abas={[
          { id: 'kits', label: 'Kits' },
          { id: 'montagem', label: 'Ordens de Montagem' },
        ]}
      />

      {centralSubTab === 'montagem' ? (
        <MontagemKitsPainel
          tabOptions={tabOptions}
          onOpenComposition={onOpenComposition}
        />
      ) : (
        <>
          <ReportTabs
            ativa={situacaoAtiva}
            onChange={(id) => setSituacaoAtiva(id as SituacaoKit | 'todos')}
            abas={[
              { id: 'montar_agora', label: SITUACAO_ROTULO.montar_agora, contagem: contagem.montar_agora },
              { id: 'falta_componente', label: SITUACAO_ROTULO.falta_componente, contagem: contagem.falta_componente },
              { id: 'ok', label: SITUACAO_ROTULO.ok, contagem: contagem.ok },
              { id: 'todos', label: 'Todos', contagem: contagem.todos },
            ]}
          />
          <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar kit por código ou descrição...">
            {linhas.length > 1 && (
              <FiltroSelect
                value={linha}
                onChange={setLinha}
                opcoes={[{ valor: 'ALL', rotulo: 'Todas as linhas' }, ...linhas.map((n) => ({ valor: n, rotulo: n }))]}
              />
            )}
          </FilterBar>

          {loading && lista.length === 0 ? (
            <div className="panel-card flex flex-col items-center gap-4 text-zinc-500" style={{ padding: '3rem' }}>
              <RefreshCw className="animate-spin" size={28} />
              <span>Calculando os kits...</span>
            </div>
          ) : linhasVisiveis.length === 0 ? (
            <div className="panel-card flex flex-col items-center gap-3 text-zinc-500" style={{ padding: '3rem' }}>
              <HelpCircle size={40} style={{ opacity: 0.3 }} />
              <span>Nenhum kit nesta situação.</span>
            </div>
          ) : (
            <TabelaPainel>
              <thead>
                <tr>
                  <th>Kit</th>
                  <th style={{ textAlign: 'right' }}>Estoque</th>
                  <th style={{ textAlign: 'right' }}>Falta</th>
                  <th style={{ textAlign: 'right' }}>Dá para montar hoje</th>
                  <th>Limitado por</th>
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.map(({ k, p, r }) => (
                  <tr key={p.codigo} onClick={() => setKitAbertoCodigo(String(p.codigo))} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="font-bold text-zinc-900">{p.descricao}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">{p.codigo}{p.nome_linha ? ` · ${p.nome_linha}` : ''}</div>
                    </td>
                    <td className="font-mono" style={{ textAlign: 'right' }}>{p.estoque}</td>
                    <td className="font-mono font-bold" style={{ textAlign: 'right' }}>{r.falta > 0 ? `${r.falta} un` : '—'}</td>
                    <td className="font-mono font-bold" style={{ textAlign: 'right' }}>{r.montavelHoje}</td>
                    <td>
                      {r.limitante && r.situacao !== 'ok' ? (
                        <span className="text-zinc-600" title={`${r.limitante.codigo} — cobre ${Number(r.limitante.kits_cobertos) || 0} kits`}>
                          {r.limitante.descricao}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TabelaPainel>
          )}
        </>
      )}

      {renderDrawerKit()}

      {/* Modal Rápido: Criar Ordem de Montagem de Kit */}
      {kitOrderModal && (() => {
        const p = kitProduto(kitOrderModal.kit);
        const { montavelHoje: potencialHoje, limitante: gargaloComp } = resumoKit(kitOrderModal.kit);
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
                      <div className="text-xs font-mono font-bold text-amber-700">{gargaloComp.codigo} ({Number(gargaloComp.kits_cobertos) || 0} kits)</div>
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
