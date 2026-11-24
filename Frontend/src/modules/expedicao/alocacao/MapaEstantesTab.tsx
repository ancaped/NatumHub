import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  AlertTriangle,
  Building2,
  Grid3X3,
  Layers,
  LayoutGrid,
  Lock,
  MapPin,
  ScanBarcode,
  Settings,
} from 'lucide-react';
import {
  BotaoAcao,
  FilterBar,
  FiltroSelect,
  StatusBadge,
} from '../../geral/components/ui/ReportKit';
import { rotuloLinha, type LinhaBase } from '../../geral/lib/linhas';
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
  linhasConfigs?: LinhaBase[];
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
  linhasConfigs = [],
  canEdit,
  onSelectPosicao,
  onAbrirProduto,
  onMoverAlocacao,
  onGerenciarEstruturas,
}: MapaEstantesTabProps) {
  const [modoVisao, setModoVisao] = useState<'2d' | 'grade'>('2d');
  const [sentidoInverso, setSentidoInverso] = useState(true); // G -> A como na planilha Mapas_0309
  const [detalhado, setDetalhado] = useState(false);
  const [busca, setBusca] = useState('');
  const [andarFiltro, setAndarFiltro] = useState('ALL');

  const [dragInfo, setDragInfo] = useState<{
    alocacaoId: string;
    origemPosicaoId: string;
    produtoCodigo: string;
  } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const termo = busca.trim().toLowerCase();

  // Agrupamento dos galpões para o mini-mapa
  const galpoesAgrupados = useMemo(() => {
    const mapa = new Map<string, Estrutura[]>();
    for (const e of estruturas) {
      const g = e.galpao || 'Galpão 1 (Área Nobre)';
      mapa.set(g, [...(mapa.get(g) ?? []), e]);
    }
    return Array.from(mapa.entries());
  }, [estruturas]);

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

  // Cotas acumuladas de baixo (Prateleira 1 no piso = 0) para cima
  const infoPrateleiras = useMemo(() => {
    const asc = [...andares].sort((a, b) => a - b);
    let acumCm = 0;
    const cotas = new Map<number, { baseCm: number; topoCm: number; alturaCm: number; papel: string }>();
    for (const andar of asc) {
      const ref = posicoes.find((p) => p.andar === andar);
      const h = ref?.alturaCm ?? 74;
      const base = acumCm;
      const topo = base + h;
      cotas.set(andar, {
        baseCm: base,
        topoCm: topo,
        alturaCm: h,
        papel: ref?.papel === 'pulmao' ? 'Pulmão' : 'Picking',
      });
      acumCm = topo;
    }
    return { cotas, alturaTotalM: acumCm / 100 };
  }, [andares, posicoes]);

  const posByCodigo = useMemo(() => {
    const m = new Map<string, PosicaoComItens>();
    for (const p of posicoes) m.set(p.codigo.toUpperCase(), p);
    return m;
  }, [posicoes]);

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

  const rotuloDedicacao = (e: Estrutura) => {
    if (!e.linhasPermitidas || e.linhasPermitidas.length === 0) return 'Livre (Todas)';
    return e.linhasPermitidas.map((lp) => rotuloLinha(linhasConfigs, lp)).join(' + ');
  };

  const handleDropPosicao = async (e: React.DragEvent, posId: string) => {
    e.preventDefault();
    setDropTargetId(null);
    if (!canEdit) return;
    let payload = dragInfo;
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (raw) payload = JSON.parse(raw);
    } catch {
      /* fallback estado local */
    }
    setDragInfo(null);
    if (!payload || payload.origemPosicaoId === posId) return;
    await onMoverAlocacao(payload.alocacaoId, posId);
  };

  return (
    <div className="space-y-3">
      {/* Mini-mapa dos Galpões & Prateleiras */}
      <div className="panel-card !p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-zinc-800">
            <Building2 className="h-3.5 w-3.5 text-zinc-500" />
            Mini-mapa dos Galpões e Prateleiras
          </div>
          <button
            type="button"
            onClick={onGerenciarEstruturas}
            className="text-[11px] font-bold text-zinc-700 hover:text-zinc-950 flex items-center gap-1 cursor-pointer"
          >
            <Settings className="h-3 w-3" />
            Configurar Galpões & Linhas
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
          {galpoesAgrupados.map(([galpaoNome, listas]) => {
            const ehGalpao1 = listas.length > 1;
            return (
              <div
                key={galpaoNome}
                className={`rounded-xl border border-zinc-200 bg-zinc-50/70 p-2.5 space-y-2 ${
                  ehGalpao1 ? 'lg:col-span-2' : 'lg:col-span-1'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-zinc-600 uppercase tracking-wider">
                  <span>{galpaoNome}</span>
                  <span className="font-mono text-zinc-500">
                    {listas.length} {listas.length === 1 ? 'área' : 'prateleiras'}
                  </span>
                </div>
                <div
                  className={`grid gap-2 ${
                    ehGalpao1 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'
                  }`}
                >
                  {listas.map((est) => {
                    const ativa = est.id === estruturaAtivaId;
                    const pct = Math.round(est.ocupacaoMediaPct ?? 0);
                    return (
                      <button
                        key={est.id}
                        type="button"
                        onClick={() => onChangeEstrutura(est.id)}
                        className={`text-left rounded-xl border p-2.5 min-h-[44px] transition-all cursor-pointer space-y-1.5 ${
                          ativa
                            ? 'border-zinc-900 bg-white ring-2 ring-zinc-900/15 shadow-sm'
                            : 'border-zinc-200 bg-white/80 hover:border-zinc-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-xs font-extrabold text-zinc-900 leading-tight">
                            {est.nome}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              est.linhasPermitidas.length > 0
                                ? 'bg-amber-50 border border-amber-200 text-amber-900'
                                : 'bg-zinc-100 border border-zinc-200 text-zinc-600'
                            }`}
                          >
                            {rotuloDedicacao(est)}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500 ml-auto">
                            {est.posicoesOcupadas}/{est.totalPosicoes} vãos
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 flex-1 rounded-full bg-zinc-100 overflow-hidden">
                            <div
                              className={`h-full ${
                                pct >= 85
                                  ? 'bg-amber-500'
                                  : pct > 0
                                    ? 'bg-emerald-500'
                                    : 'bg-zinc-300'
                              }`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-zinc-600">
                            {pct}%
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra de busca + modo de exibição */}
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
          <div className="hidden md:flex items-center rounded-xl border border-zinc-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setModoVisao('2d')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                modoVisao === '2d'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Desenho 2D
            </button>
            <button
              type="button"
              onClick={() => setModoVisao('grade')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                modoVisao === 'grade'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              Grade Códigos
            </button>
          </div>
          <BotaoAcao
            onClick={() => setSentidoInverso((v) => !v)}
            title="Alternar ordem das colunas"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {sentidoInverso ? 'G → A' : 'A → G'}
          </BotaoAcao>
          {modoVisao === 'grade' && (
            <BotaoAcao
              onClick={() => setDetalhado((v) => !v)}
              title="Alternar entre visão compacta e detalhada"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              {detalhado ? 'Detalhado' : 'Compacto'}
            </BotaoAcao>
          )}
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
          Nenhuma posição cadastrada nesta estrutura. Acesse <strong>Galpões & Regras</strong> para gerar a grade.
        </div>
      ) : (
        <>
          {/* DESENHO 2D PROPORCIONAL (Desktop) */}
          {modoVisao === '2d' && (
            <div className="hidden md:block panel-card !p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-zinc-900">
                    Vista Frontal 2D Proporcional
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    Altura total: {infoPrateleiras.alturaTotalM.toFixed(2)} m ·{' '}
                    {colunas.length} colunas ({colunas[0]}…{colunas[colunas.length - 1]})
                  </span>
                </div>
                {canEdit && (
                  <span className="text-[11px] text-zinc-400">
                    Clique num vão para editar ou arraste uma pilha entre posições
                  </span>
                )}
              </div>

              {/* Cabeçalho das colunas alinhado ao desenho */}
              <div className="flex items-center gap-2 pl-[88px] pr-1">
                {colunas.map((col) => (
                  <div
                    key={`hdr-${col}`}
                    className="flex-1 min-w-0 text-center font-mono text-xs font-extrabold text-zinc-700 bg-zinc-100 rounded-md py-0.5"
                  >
                    Coluna {col}
                  </div>
                ))}
              </div>

              {/* Corpo do Porta-paletes / Pátio: níveis do topo até o piso */}
              <div className="space-y-0">
                {andares.map((andar) => {
                  const posAndar = posicoes.filter((p) => p.andar === andar);
                  const niveis = Array.from(new Set(posAndar.map((p) => p.nivel))).sort(
                    (a, b) => b - a,
                  );
                  const meta = infoPrateleiras.cotas.get(andar);
                  const alturaVaoCm = meta?.alturaCm ?? 74;
                  const heightPx = nivelUnico
                    ? 148
                    : Math.max(60, Math.round(alturaVaoCm * 0.92));

                  return (
                    <div key={`2d-prat-${andar}`} className="flex items-stretch gap-2">
                      {/* Régua vertical de cota à esquerda */}
                      <div className="w-[80px] shrink-0 flex flex-col justify-between py-1 pr-1.5 text-right border-r border-zinc-200">
                        <div className="text-[10px] font-mono font-bold text-zinc-500 leading-none">
                          {(meta ? meta.topoCm / 100 : 0).toFixed(2)} m
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-extrabold text-zinc-800 leading-tight">
                            {nivelUnico ? 'Pátio' : `Prat. ${andar}`}
                          </div>
                          <div className="text-[9.5px] font-mono text-zinc-500 leading-none">
                            {(alturaVaoCm / 100).toFixed(2)} m ·{' '}
                            <span
                              className={
                                meta?.papel === 'Picking'
                                  ? 'text-emerald-700 font-bold'
                                  : 'text-amber-700 font-bold'
                              }
                            >
                              {meta?.papel}
                            </span>
                          </div>
                        </div>
                        <div className="text-[9px] font-mono text-zinc-400 leading-none">
                          {(meta ? meta.baseCm / 100 : 0).toFixed(2)} m
                        </div>
                      </div>

                      {/* Vãos com montantes azuis e longarinas âmbar */}
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div
                          className="flex items-stretch bg-zinc-50/50 border-l-[5px] border-blue-700"
                          style={{ height: `${heightPx}px` }}
                        >
                          {colunas.map((col) => {
                            const slots = niveis
                              .map((nv) =>
                                posAndar.find((p) => p.coluna === col && p.nivel === nv),
                              )
                              .filter((p): p is PosicaoComItens => Boolean(p));

                            return (
                              <div
                                key={`2d-${andar}-${col}`}
                                className={`flex-1 min-w-0 border-r-[5px] border-blue-700 grid ${
                                  slots.length > 1 ? 'grid-cols-2 divide-x divide-zinc-300/70' : 'grid-cols-1'
                                }`}
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
                                  const apagado = termo !== '' && !casaBusca;
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
                                        if (
                                          !canEdit ||
                                          !dragInfo ||
                                          dragInfo.origemPosicaoId === pos.id
                                        )
                                          return;
                                        e.preventDefault();
                                        if (dropTargetId !== pos.id) setDropTargetId(pos.id);
                                      }}
                                      onDragLeave={() => {
                                        if (dropTargetId === pos.id) setDropTargetId(null);
                                      }}
                                      onDrop={(e) => void handleDropPosicao(e, pos.id)}
                                      title={`${pos.codigo} · ${pos.larguraOcupadaCm.toFixed(0)}/${pos.larguraCm}cm · ${pos.totalCaixas} cx`}
                                      className={`relative h-full min-w-0 flex items-end gap-[2px] px-[2px] pt-4 pb-[1px] cursor-pointer transition-all overflow-hidden ${
                                        isDropTarget
                                          ? 'bg-zinc-200 ring-2 ring-inset ring-zinc-900'
                                          : pos.temEstouro
                                            ? 'bg-rose-50/90 ring-1 ring-inset ring-rose-400'
                                            : casaBusca
                                              ? 'bg-amber-50/70 ring-2 ring-inset ring-zinc-900'
                                              : pos.itens.length > 0
                                                ? 'bg-white hover:bg-zinc-50'
                                                : 'bg-zinc-50/40 hover:bg-white'
                                      } ${apagado ? 'opacity-30' : ''}`}
                                    >
                                      {/* Rótulo do endereço no topo do vão */}
                                      <div className="absolute top-0.5 left-1 right-1 flex items-center justify-between pointer-events-none">
                                        <span className="font-mono text-[9px] font-extrabold text-zinc-700 leading-none">
                                          {pos.codigo}
                                        </span>
                                        {pos.temEstouro && (
                                          <AlertTriangle className="h-2.5 w-2.5 text-rose-600 shrink-0" />
                                        )}
                                      </div>

                                      {pos.itens.length === 0 ? (
                                        <div className="w-full text-center text-[8.5px] text-zinc-300 pb-1 select-none">
                                          Livre
                                        </div>
                                      ) : (
                                        pos.itens.map((item) => {
                                          const wPct =
                                            pos.larguraCm > 0
                                              ? Math.max(
                                                  12,
                                                  Math.min(
                                                    100,
                                                    (item.larguraOcupadaCm / pos.larguraCm) * 100,
                                                  ),
                                                )
                                              : 30;
                                          const hPct =
                                            pos.alturaCm > 0
                                              ? Math.max(
                                                  18,
                                                  Math.min(
                                                    100,
                                                    (item.alturaOcupadaCm / pos.alturaCm) * 100,
                                                  ),
                                                )
                                              : 60;
                                          const cor = corDaLinha(item.linhaPrefix);
                                          return (
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
                                                e.dataTransfer.setData(
                                                  'application/json',
                                                  JSON.stringify(p),
                                                );
                                              }}
                                              onDragEnd={() => {
                                                setDragInfo(null);
                                                setDropTargetId(null);
                                              }}
                                              title={`${item.produtoCodigo} — ${item.produtoDescricao} · ${item.fileirasLargura}fil×${item.camadasAltura}cam = ${item.totalCaixas} cx`}
                                              style={{
                                                width: `${wPct}%`,
                                                height: `${hPct}%`,
                                                backgroundColor: `${cor}26`,
                                                borderColor: item.estouroAltura ? '#e11d48' : cor,
                                              }}
                                              className={`min-w-0 rounded-t-[2px] border-[1.5px] flex flex-col justify-between p-[1px] overflow-hidden select-none ${
                                                canEdit ? 'cursor-grab active:cursor-grabbing' : ''
                                              }`}
                                            >
                                              <div className="flex items-center justify-between gap-0.5 leading-none">
                                                <span className="font-mono text-[7.5px] font-extrabold text-zinc-900 truncate">
                                                  {item.produtoCodigo}
                                                </span>
                                                {item.fixado && (
                                                  <Lock className="h-2 w-2 text-zinc-600 shrink-0" />
                                                )}
                                              </div>
                                              {/* Indicação visual de camadas empilhadas */}
                                              <div
                                                className="flex-1 grid gap-[1px] mt-[1px]"
                                                style={{
                                                  gridTemplateRows: `repeat(${Math.min(
                                                    4,
                                                    Math.max(1, item.camadasAltura),
                                                  )}, minmax(0, 1fr))`,
                                                  gridTemplateColumns: `repeat(${Math.min(
                                                    4,
                                                    Math.max(1, item.fileirasLargura),
                                                  )}, minmax(0, 1fr))`,
                                                }}
                                              >
                                                {Array.from({
                                                  length:
                                                    Math.min(4, Math.max(1, item.camadasAltura)) *
                                                    Math.min(4, Math.max(1, item.fileirasLargura)),
                                                }).map((_, idx) => (
                                                  <div
                                                    key={idx}
                                                    style={{ backgroundColor: `${cor}40` }}
                                                    className="rounded-[1px]"
                                                  />
                                                ))}
                                              </div>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                        {/* Longarina âmbar na base da prateleira */}
                        <div className="h-[5px] w-full bg-amber-500 border-b border-amber-700/40" />
                      </div>
                    </div>
                  );
                })}
                {/* Piso */}
                <div className="flex items-center gap-2">
                  <div className="w-[80px] shrink-0 text-right pr-1.5 text-[9.5px] font-mono font-bold text-zinc-500">
                    Piso 0,00 m
                  </div>
                  <div className="flex-1 h-[3px] bg-zinc-400 rounded-full" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 bg-blue-700 rounded-xs" /> Montante azul
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 bg-amber-500 rounded-xs" /> Longarina âmbar
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 border border-rose-500 bg-rose-100 rounded-xs" />{' '}
                  Estouro altura/largura
                </span>
                <span className="flex items-center gap-1">
                  <Lock className="h-3 w-3 text-zinc-500" /> Posição fixada
                </span>
              </div>
            </div>
          )}

          {/* GRADE CÓDIGOS (Desktop quando selecionada) */}
          {modoVisao === 'grade' && (
            <div className="hidden md:block space-y-2.5">
              {andares.map((andar) => {
                const posAndar = posicoes.filter((p) => p.andar === andar);
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
                                  onDrop={(e) => void handleDropPosicao(e, pos.id)}
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
                                            e.dataTransfer.setData(
                                              'application/json',
                                              JSON.stringify(p),
                                            );
                                          }}
                                          onDragEnd={() => {
                                            setDragInfo(null);
                                            setDropTargetId(null);
                                          }}
                                          title={`${item.produtoCodigo} — ${item.produtoDescricao} (${item.nomeLinha}) · ${item.fileirasLargura}×${item.camadasAltura} · ${item.totalCaixas} cx`}
                                          style={{ borderLeftColor: corDaLinha(item.linhaPrefix) }}
                                          className={`rounded-r border-l-[3px] pl-1 transition-colors ${
                                            canEdit
                                              ? 'hover:bg-zinc-100 cursor-grab active:cursor-grabbing'
                                              : ''
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
          )}

          {/* Visão Celular */}
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

                  {/* Mini barra 2D proporcional no card mobile */}
                  {pos.itens.length > 0 && (
                    <div className="flex items-end gap-1 h-4 bg-zinc-50 border-b-2 border-amber-500 px-1 rounded-t">
                      {pos.itens.map((it) => {
                        const w =
                          pos.larguraCm > 0
                            ? Math.max(10, Math.min(100, (it.larguraOcupadaCm / pos.larguraCm) * 100))
                            : 25;
                        return (
                          <div
                            key={it.id}
                            style={{
                              width: `${w}%`,
                              backgroundColor: `${corDaLinha(it.linhaPrefix)}44`,
                              borderColor: corDaLinha(it.linhaPrefix),
                            }}
                            className="h-3 border rounded-t-[2px]"
                          />
                        );
                      })}
                    </div>
                  )}

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
