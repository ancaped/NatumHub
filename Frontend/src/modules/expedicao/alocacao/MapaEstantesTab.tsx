import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, AlertTriangle, Lock, Layers, Settings } from 'lucide-react';
import { BotaoAcao, FilterBar, FiltroSelect, StatusBadge } from '../../geral/components/ui/ReportKit';
import type { Estrutura, PosicaoComItens } from './types';

interface MapaEstantesTabProps {
  estruturas: Estrutura[];
  estruturaAtivaId: string;
  onChangeEstrutura: (id: string) => void;
  posicoes: PosicaoComItens[];
  onSelectPosicao: (pos: PosicaoComItens) => void;
  onGerenciarEstruturas: () => void;
}

export function MapaEstantesTab({
  estruturas,
  estruturaAtivaId,
  onChangeEstrutura,
  posicoes,
  onSelectPosicao,
  onGerenciarEstruturas,
}: MapaEstantesTabProps) {
  const [sentidoInverso, setSentidoInverso] = useState(true); // G -> A como na planilha
  const [busca, setBusca] = useState('');
  const [andarFiltro, setAndarFiltro] = useState('ALL');

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

  const gridClassCols =
    colunas.length <= 4
      ? 'grid-cols-2 md:grid-cols-4'
      : colunas.length <= 7
        ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-7'
        : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6';

  return (
    <div className="space-y-3">
      <FilterBar
        busca={busca}
        onBusca={setBusca}
        placeholder="Localizar produto ou posição (ex.: A1, 2.13.036, Argan)..."
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
        <BotaoAcao onClick={onGerenciarEstruturas}>
          <Settings className="h-3.5 w-3.5" />
          Estantes e Andares
        </BotaoAcao>
      </FilterBar>

      {posicoes.length === 0 ? (
        <div className="panel-card p-8 text-center text-sm text-zinc-500">
          Nenhuma posição cadastrada nesta estrutura. Acesse <strong>Estantes e Andares</strong> para gerar a grade.
        </div>
      ) : (
        <>
          {/* Visão Desktop — Grade por andar (de cima para baixo, como na estrutura física) */}
          <div className="hidden md:block space-y-3">
            {andares.map((andar) => {
              const posAndar = posicoes.filter((p) => p.andar === andar);
              const niveis = Array.from(new Set(posAndar.map((p) => p.nivel))).sort(
                (a, b) => b - a,
              );
              const refPos = posAndar[0];
              const papelAndar = refPos?.papel === 'pulmao' ? 'Pulmão' : 'Picking';

              return (
                <div key={andar} className="panel-card !p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-zinc-500" />
                      <span className="text-xs font-extrabold text-zinc-900">
                        Andar {andar}
                      </span>
                      <StatusBadge
                        variante={refPos?.papel === 'pulmao' ? 'aguardando' : 'saudavel'}
                      >
                        {papelAndar}
                      </StatusBadge>
                      <span className="text-[11px] font-mono text-zinc-500">
                        Vão {refPos?.alturaCm ?? 0} cm · Estrado {refPos?.larguraCm ?? 100}×
                        {refPos?.comprimentoCm ?? 120} cm
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      Níveis {niveis.join(' / ')}
                    </span>
                  </div>

                  <div className={`grid ${gridClassCols} gap-2`}>
                    {colunas.map((col) => {
                      const slots = niveis
                        .map((nv) => posAndar.find((p) => p.coluna === col && p.nivel === nv))
                        .filter((p): p is PosicaoComItens => Boolean(p));

                      return (
                        <div key={col} className="space-y-1.5">
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

                            return (
                              <button
                                key={pos.id}
                                type="button"
                                onClick={() => onSelectPosicao(pos)}
                                className={`w-full text-left rounded-xl border p-2 transition-all cursor-pointer ${
                                  pos.temEstouro
                                    ? 'border-rose-300 bg-rose-50/50 hover:border-rose-400'
                                    : casaBusca
                                      ? 'border-zinc-900 bg-zinc-50 ring-2 ring-zinc-900/20'
                                      : pos.itens.length > 0
                                        ? 'border-zinc-200 bg-white hover:border-zinc-400'
                                        : 'border-dashed border-zinc-200 bg-zinc-50/50 hover:border-zinc-400'
                                } ${apagadoPorBusca ? 'opacity-40' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="font-mono text-xs font-extrabold text-zinc-900">
                                    {pos.codigo}
                                  </span>
                                  <span className="font-mono text-[10px] font-semibold text-zinc-500">
                                    {pos.larguraOcupadaCm.toFixed(0)}/{pos.larguraCm.toFixed(0)}cm
                                  </span>
                                </div>

                                <div className="h-1 w-full rounded-full bg-zinc-100 overflow-hidden mb-1.5">
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
                                  <div className="text-[10px] text-zinc-400 italic">Livre</div>
                                ) : (
                                  <div className="space-y-0.5">
                                    {pos.itens.slice(0, 3).map((item) => (
                                      <div
                                        key={item.id}
                                        className="flex items-center justify-between gap-1 text-[10px] leading-tight"
                                        title={`${item.produtoCodigo} — ${item.produtoDescricao}`}
                                      >
                                        <span className="font-mono font-bold text-zinc-800 truncate flex items-center gap-0.5">
                                          {item.fixado && (
                                            <Lock className="h-2.5 w-2.5 text-zinc-400 shrink-0" />
                                          )}
                                          {item.produtoCodigo}
                                        </span>
                                        <span className="font-mono text-zinc-500 shrink-0">
                                          {item.totalCaixas}cx
                                        </span>
                                      </div>
                                    ))}
                                    {pos.itens.length > 3 && (
                                      <div className="text-[10px] font-semibold text-zinc-500">
                                        +{pos.itens.length - 3} itens
                                      </div>
                                    )}
                                  </div>
                                )}

                                {pos.temEstouro && (
                                  <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-rose-700">
                                    <AlertTriangle className="h-3 w-3 shrink-0" /> Estouro
                                  </div>
                                )}
                              </button>
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

          {/* Visão Celular — Filtro de andar + Cartões verticais sem rolagem horizontal */}
          <div className="md:hidden space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAndarFiltro('ALL')}
                className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer min-h-[40px] ${
                  andarFiltro === 'ALL'
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-200'
                }`}
              >
                Todos ({posicoes.length})
              </button>
              {andares.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAndarFiltro(String(a))}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer min-h-[40px] ${
                    andarFiltro === String(a)
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-200'
                  }`}
                >
                  Andar {a}
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
                        Andar {pos.andar} · {pos.alturaCm}cm
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
                          <span className="truncate text-zinc-800">
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
