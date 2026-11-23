import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  AlertTriangle,
  Lock,
  Layers,
  Settings,
  ScanBarcode,
  LayoutGrid,
  MapPin,
} from 'lucide-react';
import {
  BotaoAcao,
  FilterBar,
  FiltroSelect,
  StatusBadge,
} from '../../geral/components/ui/ReportKit';
import type { Estrutura, PosicaoComItens, ProdutoDimensao } from './types';

const LINHA_CORES = [
  '#10b981',
  '#0ea5e9',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
  '#ef4444',
];

function corDaLinha(prefix: string): string {
  let hash = 0;
  for (let i = 0; i < prefix.length; i++) {
    hash = (hash * 31 + prefix.charCodeAt(i)) >>> 0;
  }
  return LINHA_CORES[hash % LINHA_CORES.length];
}

interface MapaEstantesTabProps {
  estruturas: Estrutura[];
  estruturaAtivaId: string;
  onChangeEstrutura: (id: string) => void;
  posicoes: PosicaoComItens[];
  produtos: ProdutoDimensao[];
  canEdit: boolean;
  onSelectPosicao: (pos: PosicaoComItens) => void;
  onAbrirProduto: (p: ProdutoDimensao) => void;
  onMoverAlocacao: (alocacaoId: string, destinoPosicaoId: string) => Promise<void>;
  onGerenciarEstruturas: () => void;
}

export function MapaEstantesTab({
  estruturas,
  estruturaAtivaId,
  onChangeEstrutura,
  posicoes,
  produtos,
  canEdit,
  onSelectPosicao,
  onAbrirProduto,
  onMoverAlocacao,
  onGerenciarEstruturas,
}: MapaEstantesTabProps) {
  const [sentidoInverso, setSentidoInverso] = useState(true); // G -> A como na planilha Mapas_0309
  const [detalhado, setDetalhado] = useState(false); // Compacto por padrão
  const [busca, setBusca] = useState('');
  const [andarFiltro, setAndarFiltro] = useState('ALL');

  const [dragInfo, setDragInfo] = useState<{
    alocacaoId: string;
    origemPosicaoId: string;
    produtoCodigo: string;
  } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const termo = busca.trim().toLowerCase();

  const colunas = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of posicoes) {
      if (!mapa.has(p.coluna)) mapa.set(p.coluna, p.colunaOrdem);
    }
    return Array.from(mapa.entries())
      .sort((a, b) => (sentidoInverso ? b[1] - a[1] : a[1] - b[1]))
      .map((e) => e[0]);
  }, [posicoes, sentidoInverso]);

  const andares = useMemo(
    () => Array.from(new Set(posicoes.map((p) => p.andar))).sort((a, b) => b - a),
    [posicoes],
  );
  const nivelUnico = andares.length === 1;

  const posByCodigo = useMemo(() => {
    const m = new Map<string, PosicaoComItens>();
    for (const p of posicoes) m.set(p.codigo.toUpperCase(), p);
    return m;
  }, [posicoes]);

  // Busca rápida / leitor de código de barras (EAN, código, nome)
  const produtosEncontrados = useMemo(() => {
    if (termo.length < 2) return [];
    const exatos: ProdutoDimensao[] = [];
    const parciais: ProdutoDimensao[] = [];
    for (const p of produtos) {
      const c = p.codigo.toLowerCase();
      const ean = (p.codigoBarras ?? '').toLowerCase();
      const desc = p.descricao.toLowerCase();
      if (c === termo || (ean !== '' && ean === termo)) {
        exatos.push(p);
      } else if (c.includes(termo) || ean.includes(termo) || desc.includes(termo)) {
        parciais.push(p);
      }
    }
    return [...exatos, ...parciais].slice(0, 5);
  }, [produtos, termo]);

  const posicoesFiltradasMobile = useMemo(() => {
    return posicoes.filter((p) => {
      if (andarFiltro !== 'ALL' && p.andar !== Number(andarFiltro)) return false;
      if (!termo) return true;
      if (p.codigo.toLowerCase().includes(termo)) return true;
      return p.itens.some(
        (i) =>
          i.produtoCodigo.toLowerCase().includes(termo) ||
          i.produtoDescricao.toLowerCase().includes(termo),
      );
    });
  }, [posicoes, andarFiltro, termo]);

  const handleBuscaKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !termo) return;
    const posDireta = posByCodigo.get(termo.toUpperCase());
    if (posDireta) {
      onSelectPosicao(posDireta);
      return;
    }
    const exato = produtos.find(
      (p) =>
        p.codigo.toLowerCase() === termo ||
        (p.codigoBarras ?? '').toLowerCase() === termo,
    );
    if (!exato) return;
    const primeiroEnd = exato.enderecosPicking[0] ?? exato.enderecosPulmao[0];
    const posProd = primeiroEnd ? posByCodigo.get(primeiroEnd.toUpperCase()) : undefined;
    if (posProd) {
      onSelectPosicao(posProd);
    } else {
      onAbrirProduto(exato);
    }
  };

  const gridClassCols =
    colunas.length <= 2
      ? 'grid-cols-1 md:grid-cols-2'
      : colunas.length <= 4
        ? 'grid-cols-2 md:grid-cols-4'
        : colunas.length <= 7
          ? 'grid-cols-2 lg:grid-cols-4 xl:grid-cols-7'
          : 'grid-cols-2 lg:grid-cols-4 xl:grid-cols-6';

  return (
    <div className="space-y-3">
      <div onKeyDown={handleBuscaKeyDown}>
        <FilterBar
          busca={busca}
          onBusca={setBusca}
          placeholder="Bipar código de barras, produto (ex.: 2.13.036, Argan) ou posição (A1)..."
        >
          {estruturas.length > 0 && (
            <FiltroSelect
              value={estruturaAtivaId}
              onChange={onChangeEstrutura}
              opcoes={estruturas.map((e) => ({ valor: e.id, rotulo: e.nome }))}
            />
          )}
          <BotaoAcao
            onClick={() => setSentidoInverso((v) => !v)}
            title="Alternar ordem das colunas no mapa"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {sentidoInverso ? 'G → A' : 'A → G'}
          </BotaoAcao>
          <BotaoAcao
            onClick={() => setDetalhado((v) => !v)}
            title="Alternar entre visão compacta (código) e detalhada (nome + caixas)"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {detalhado ? 'Detalhado' : 'Compacto'}
          </BotaoAcao>
          <BotaoAcao onClick={onGerenciarEstruturas}>
            <Settings className="h-3.5 w-3.5" />
            Estantes & Prateleiras
          </BotaoAcao>
        </FilterBar>
      </div>

      {/* Cartão instantâneo de localização / leitor de código de barras */}
      {termo.length >= 2 && produtosEncontrados.length > 0 && (
        <div className="panel-card !p-3 space-y-2 border-zinc-300 bg-zinc-50/80">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
            <ScanBarcode className="h-3.5 w-3.5" />
            Localização rápida ({produtosEncontrados.length}
            {produtosEncontrados.length === 5 ? '+' : ''})
          </div>
          <div className="space-y-1.5">
            {produtosEncontrados.map((p) => (
              <div
                key={p.codigo}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: corDaLinha(p.linhaPrefix) }}
                    />
                    <span className="font-mono font-extrabold text-zinc-900">{p.codigo}</span>
                    <span className="font-semibold text-zinc-800 truncate">{p.descricao}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500 flex flex-wrap gap-2">
                    <span>{p.caixaCodigo ? `CX ${p.caixaCodigo}` : 'Sem caixa'}</span>
                    <span>{p.qtdeCxEfetiva ? `${p.qtdeCxEfetiva}/cx` : 'Sem qtde/cx'}</span>
                    <span>Estoque: {Math.round(p.estoqueAtual).toLocaleString('pt-BR')} un</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {p.enderecosPicking.map((cod) => {
                    const target = posByCodigo.get(cod.toUpperCase());
                    return (
                      <button
                        key={`qk-pk-${cod}`}
                        type="button"
                        onClick={() => (target ? onSelectPosicao(target) : onAbrirProduto(p))}
                        className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 font-mono font-bold text-xs flex items-center gap-1 hover:bg-emerald-100 cursor-pointer"
                      >
                        <MapPin className="h-3 w-3" /> Pick {cod}
                      </button>
                    );
                  })}
                  {p.enderecosPulmao.map((cod) => {
                    const target = posByCodigo.get(cod.toUpperCase());
                    return (
                      <button
                        key={`qk-pl-${cod}`}
                        type="button"
                        onClick={() => (target ? onSelectPosicao(target) : onAbrirProduto(p))}
                        className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-zinc-100 border border-zinc-300 text-zinc-900 font-mono font-bold text-xs flex items-center gap-1 hover:bg-zinc-200 cursor-pointer"
                      >
                        <MapPin className="h-3 w-3" /> Pulmão {cod}
                      </button>
                    );
                  })}
                  {p.enderecosPicking.length === 0 && p.enderecosPulmao.length === 0 && (
                    <button
                      type="button"
                      onClick={() => onAbrirProduto(p)}
                      className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-zinc-900 text-white font-bold text-xs cursor-pointer"
                    >
                      Sem endereço · Alocar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {posicoes.length === 0 ? (
        <div className="panel-card p-8 text-center text-sm text-zinc-500">
          Nenhuma posição cadastrada nesta estrutura. Acesse <strong>Estantes & Prateleiras</strong> para gerar a grade.
        </div>
      ) : (
        <>
          {/* Visão Desktop — Pares lado a lado por prateleira [G12 | G11 ... A12 | A11] */}
          <div className="hidden md:block space-y-2.5">
            {andares.map((andar) => {
              const posAndar = posicoes.filter((p) => p.andar === andar);
              // Esquerda = par maior (G12, F12...), Direita = ímpar menor (G11, F11...), espelhando Mapas_0309
              const niveis = Array.from(new Set(posAndar.map((p) => p.nivel))).sort(
                (a, b) => b - a,
              );
              const refPos = posAndar[0];
              const papelAndar = refPos?.papel === 'pulmao' ? 'Pulmão' : 'Picking';
              const minNv = Math.min(...niveis);
              const maxNv = Math.max(...niveis);
              const rotuloPrat = nivelUnico ? 'Pátio / Chão' : `Prateleira ${andar}`;
              const rotuloPos =
                niveis.length > 1 ? `Posições ${minNv}–${maxNv}` : `Posição ${minNv}`;

              return (
                <div key={andar} className="panel-card !p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-1.5">
                    <div className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="text-xs font-extrabold text-zinc-900">
                        {rotuloPrat}
                      </span>
                      <StatusBadge
                        variante={refPos?.papel === 'pulmao' ? 'aguardando' : 'saudavel'}
                      >
                        {papelAndar}
                      </StatusBadge>
                      <span className="text-[11px] font-mono text-zinc-500">
                        {rotuloPos} · Vão {refPos?.alturaCm ?? 0} cm · Estrado{' '}
                        {refPos?.larguraCm ?? 100}×{refPos?.comprimentoCm ?? 120} cm
                      </span>
                    </div>
                    {canEdit && (
                      <span className="text-[10px] text-zinc-400">
                        Arraste um código para mover entre posições
                      </span>
                    )}
                  </div>

                  <div className={`grid ${gridClassCols} gap-1`}>
                    {colunas.map((col) => {
                      const slots = niveis
                        .map((nv) => posAndar.find((p) => p.coluna === col && p.nivel === nv))
                        .filter((p): p is PosicaoComItens => Boolean(p));

                      return (
                        <div
                          key={col}
                          className={`grid ${slots.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-0.5 rounded-xl bg-zinc-50/70 p-0.5 border border-zinc-100`}
                        >
                          {slots.map((pos) => {
                            const casaBusca =
                              termo !== '' &&
                              (pos.codigo.toLowerCase().includes(termo) ||
                                pos.itens.some(
                                  (i) =>
                                    i.produtoCodigo.toLowerCase().includes(termo) ||
                                    i.produtoDescricao.toLowerCase().includes(termo),
                                ));
                            const apagadoPorBusca = termo !== '' && !casaBusca;
                            const isDropTarget = dropTargetId === pos.id;

                            return (
                              <div
                                key={pos.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelectPosicao(pos)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelectPosicao(pos);
                                  }
                                }}
                                onDragOver={(e) => {
                                  if (!canEdit || !dragInfo || dragInfo.origemPosicaoId === pos.id)
                                    return;
                                  e.preventDefault();
                                  if (dropTargetId !== pos.id) setDropTargetId(pos.id);
                                }}
                                onDragLeave={() => {
                                  if (dropTargetId === pos.id) setDropTargetId(null);
                                }}
                                onDrop={async (e) => {
                                  e.preventDefault();
                                  setDropTargetId(null);
                                  if (!canEdit) return;
                                  let payload = dragInfo;
                                  try {
                                    const raw = e.dataTransfer.getData('application/json');
                                    if (raw) payload = JSON.parse(raw);
                                  } catch {
                                    /* usa estado local */
                                  }
                                  setDragInfo(null);
                                  if (!payload || payload.origemPosicaoId === pos.id) return;
                                  await onMoverAlocacao(payload.alocacaoId, pos.id);
                                }}
                                className={`min-w-0 text-left rounded-lg border p-1 transition-all cursor-pointer select-none ${
                                  isDropTarget
                                    ? 'border-zinc-900 bg-zinc-100 ring-2 ring-zinc-900/30'
                                    : pos.temEstouro
                                      ? 'border-rose-300 bg-rose-50/60 hover:border-rose-400'
                                      : casaBusca
                                        ? 'border-zinc-900 bg-white ring-2 ring-zinc-900/25'
                                        : pos.itens.length > 0
                                          ? 'border-zinc-200 bg-white hover:border-zinc-400'
                                          : 'border-dashed border-zinc-200 bg-white/50 hover:border-zinc-400'
                                } ${apagadoPorBusca ? 'opacity-35' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-0.5 mb-0.5">
                                  <span className="font-mono text-[9.5px] font-extrabold text-zinc-900 leading-none">
                                    {pos.codigo}
                                  </span>
                                  <span className="font-mono text-[8.5px] font-semibold text-zinc-500 leading-none">
                                    {pos.larguraOcupadaCm.toFixed(0)}cm
                                  </span>
                                </div>

                                <div className="h-1 w-full rounded-full bg-zinc-100 overflow-hidden mb-1">
                                  <div
                                    className={`h-full ${
                                      pos.temEstouro
                                        ? 'bg-rose-500'
                                        : pos.ocupacaoPct >= 90
                                          ? 'bg-amber-500'
                                          : pos.itens.length > 0
                                            ? 'bg-emerald-500'
                                            : 'bg-zinc-200'
                                    }`}
                                    style={{
                                      width: `${Math.min(100, Math.max(0, pos.ocupacaoPct))}%`,
                                    }}
                                  />
                                </div>

                                {pos.itens.length === 0 ? (
                                  <div className="text-[9px] text-zinc-400 italic leading-tight">
                                    Livre
                                  </div>
                                ) : (
                                  <div className="space-y-0.5">
                                    {pos.itens.slice(0, detalhado ? 6 : 5).map((item) => (
                                      <div
                                        key={item.id}
                                        draggable={canEdit}
                                        onDragStart={(e) => {
                                          if (!canEdit) return;
                                          e.stopPropagation();
                                          const p = {
                                            alocacaoId: item.id,
                                            origemPosicaoId: pos.id,
                                            produtoCodigo: item.produtoCodigo,
                                          };
                                          setDragInfo(p);
                                          e.dataTransfer.effectAllowed = 'move';
                                          e.dataTransfer.setData('application/json', JSON.stringify(p));
                                        }}
                                        onDragEnd={() => {
                                          setDragInfo(null);
                                          setDropTargetId(null);
                                        }}
                                        title={`${item.produtoCodigo} — ${item.produtoDescricao} (${item.nomeLinha}) · ${item.fileirasLargura}×${item.camadasAltura} · ${item.totalCaixas} cx${item.fixado ? ' · Fixado' : ''}`}
                                        style={{ borderLeftColor: corDaLinha(item.linhaPrefix) }}
                                        className={`rounded-r border-l-[3px] pl-1 transition-colors ${
                                          canEdit ? 'hover:bg-zinc-100 cursor-grab active:cursor-grabbing' : ''
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-0.5 text-[9.5px] leading-tight">
                                          <span className="font-mono font-bold tracking-tighter text-zinc-800 whitespace-nowrap">
                                            {item.produtoCodigo}
                                          </span>
                                          {detalhado && item.fixado && (
                                            <Lock className="h-2 w-2 text-zinc-400 shrink-0" />
                                          )}
                                        </div>
                                        {detalhado && (
                                          <div className="flex items-center justify-between gap-1 text-[8.5px] text-zinc-500 leading-tight">
                                            <span className="truncate">{item.produtoDescricao}</span>
                                            <span className="font-mono shrink-0">
                                              {item.totalCaixas}cx
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    {pos.itens.length > (detalhado ? 6 : 5) && (
                                      <div className="text-[9px] font-semibold text-zinc-500 pl-0.5">
                                        +{pos.itens.length - (detalhado ? 6 : 5)} itens
                                      </div>
                                    )}
                                  </div>
                                )}

                                {pos.temEstouro && (
                                  <div className="mt-0.5 flex items-center gap-0.5 text-[9px] font-bold text-rose-700">
                                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" /> Estouro
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Visão Celular — Filtro de prateleira + Cartões verticais sem rolagem horizontal */}
          <div className="md:hidden space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAndarFiltro('ALL')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer min-h-[44px] ${
                  andarFiltro === 'ALL'
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-200'
                }`}
              >
                Todas ({posicoes.length})
              </button>
              {andares.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAndarFiltro(String(a))}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer min-h-[44px] ${
                    andarFiltro === String(a)
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-200'
                  }`}
                >
                  {nivelUnico ? 'Pátio' : `Prat. ${a}`}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {posicoesFiltradasMobile.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => onSelectPosicao(pos)}
                  className={`w-full text-left rounded-xl border p-3 space-y-2 min-h-[44px] cursor-pointer ${
                    pos.temEstouro
                      ? 'border-rose-300 bg-rose-50/40'
                      : 'border-zinc-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-zinc-900">
                        {pos.codigo}
                      </span>
                      <StatusBadge
                        variante={pos.papel === 'pulmao' ? 'aguardando' : 'saudavel'}
                      >
                        {pos.papel === 'pulmao' ? 'Pulmão' : 'Picking'}
                      </StatusBadge>
                      <span className="text-[11px] text-zinc-500">
                        {nivelUnico ? 'Pátio' : `Prat. ${pos.andar}`} · {pos.alturaCm}cm
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-zinc-700">
                      {pos.larguraOcupadaCm.toFixed(0)}/{pos.larguraCm.toFixed(0)}cm
                    </span>
                  </div>

                  {pos.itens.length === 0 ? (
                    <div className="text-xs text-zinc-400">Posição livre</div>
                  ) : (
                    <div className="space-y-1">
                      {pos.itens.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="truncate text-zinc-800 flex items-center gap-1.5">
                            <span
                              className="inline-block h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: corDaLinha(item.linhaPrefix) }}
                            />
                            <strong className="font-mono">{item.produtoCodigo}</strong> —{' '}
                            {item.produtoDescricao}
                          </span>
                          <span className="font-mono text-zinc-600 shrink-0">
                            {item.totalCaixas}cx
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
