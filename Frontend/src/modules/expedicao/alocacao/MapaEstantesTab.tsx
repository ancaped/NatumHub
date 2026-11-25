import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Building2, MapPin, ScanBarcode } from 'lucide-react';
import { BotaoAcao, FilterBar, StatusBadge } from '../../geral/components/ui/ReportKit';
import { DesenhoPrateleira3dSvg } from './DesenhoPrateleira3dSvg';
import type { Caixa, Estrutura, PosicaoComItens, ProdutoDimensao } from './types';

interface MapaEstantesTabProps {
  estruturas: Estrutura[];
  estruturaAtivaId: string;
  onChangeEstrutura: (id: string) => void;
  posicoes: PosicaoComItens[];
  produtos: ProdutoDimensao[];
  caixas?: Caixa[];
  onSelectPosicao: (pos: PosicaoComItens) => void;
  onAbrirProduto: (p: ProdutoDimensao) => void;
}

export function MapaEstantesTab({
  estruturas,
  estruturaAtivaId,
  onChangeEstrutura,
  posicoes,
  produtos,
  caixas = [],
  onSelectPosicao,
  onAbrirProduto,
}: MapaEstantesTabProps) {
  const [sentidoInverso, setSentidoInverso] = useState(true);
  const [busca, setBusca] = useState('');

  const termo = busca.trim().toLowerCase();

  const prodPorCodigo = useMemo(() => {
    const m = new Map<string, ProdutoDimensao>();
    for (const p of produtos) m.set(p.codigo, p);
    return m;
  }, [produtos]);

  const galpoesAgrupados = useMemo(() => {
    const mapa = new Map<string, Estrutura[]>();
    for (const e of estruturas) {
      const g = e.galpao || 'Galpão 1 (Área Nobre)';
      mapa.set(g, [...(mapa.get(g) ?? []), e]);
    }
    return Array.from(mapa.entries());
  }, [estruturas]);

  const estruturaAtiva = useMemo(
    () => estruturas.find((e) => e.id === estruturaAtivaId) ?? null,
    [estruturas, estruturaAtivaId],
  );

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

  const posByCodigo = useMemo(() => {
    const m = new Map<string, PosicaoComItens>();
    for (const p of posicoes) m.set(p.codigo.toUpperCase(), p);
    return m;
  }, [posicoes]);

  const posicoesEncontradas = useMemo(() => {
    if (termo.length < 2) return [];
    const exatas: PosicaoComItens[] = [];
    const parciais: PosicaoComItens[] = [];
    for (const pos of posicoes) {
      const cod = pos.codigo.toLowerCase();
      const etq = (pos.etiquetaLivre ?? '').toLowerCase();
      const mot = (pos.reservaMotivo ?? '').toLowerCase();
      if (cod === termo) {
        exatas.push(pos);
      } else if (cod.includes(termo) || etq.includes(termo) || mot.includes(termo)) {
        parciais.push(pos);
      }
    }
    return [...exatas, ...parciais].slice(0, 4);
  }, [posicoes, termo]);

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

  const temResultadosRapidos =
    termo.length >= 2 && (posicoesEncontradas.length > 0 || produtosEncontrados.length > 0);

  return (
    <div className="space-y-2.5">
      {/* Seletor compacto de Galpão / Prateleira */}
      <div className="panel-card !px-3 !py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {galpoesAgrupados.map(([galpaoNome, listas]) => {
          const rotuloGalpao = galpaoNome.replace(/\s*\([^)]*\)\s*$/, '').trim();
          return (
            <div key={galpaoNome} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {rotuloGalpao}:
              </span>
              {listas.map((est) => {
                const ativa = est.id === estruturaAtivaId;
                return (
                  <button
                    key={est.id}
                    type="button"
                    onClick={() => onChangeEstrutura(est.id)}
                    className={`px-2.5 py-1 min-h-[34px] max-sm:min-h-[40px] rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      ativa
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {est.nome}{' '}
                    <span className={`font-mono text-[10px] ${ativa ? 'text-zinc-300' : 'text-zinc-400'}`}>
                      ({est.posicoesOcupadas}/{est.totalPosicoes})
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Barra única de busca e sentido das colunas */}
      <div onKeyDown={handleBuscaKeyDown}>
        <FilterBar
          busca={busca}
          onBusca={setBusca}
          placeholder="Bipar EAN, produto ou vão (ex.: 2.13.036, A1)..."
        >
          <BotaoAcao
            onClick={() => setSentidoInverso((v) => !v)}
            title="Alternar ordem das colunas"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {sentidoInverso ? 'G → A' : 'A → G'}
          </BotaoAcao>
        </FilterBar>
      </div>

      {/* Localização rápida de vãos / leitor de código de barras */}
      {temResultadosRapidos && (
        <div className="panel-card !p-3 space-y-2 border-zinc-300 bg-zinc-50/80">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-600">
            <ScanBarcode className="h-3.5 w-3.5" />
            Acesso rápido
          </div>

          {posicoesEncontradas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {posicoesEncontradas.map((pos) => (
                <button
                  key={`qk-pos-${pos.id}`}
                  type="button"
                  onClick={() => onSelectPosicao(pos)}
                  className="px-2.5 py-1.5 min-h-[40px] rounded-lg bg-white border border-zinc-300 text-zinc-900 font-mono font-bold text-xs flex items-center gap-1.5 hover:bg-zinc-100 cursor-pointer"
                >
                  <MapPin className="h-3 w-3 text-zinc-500" />
                  Vão {pos.codigo}
                  <span className="font-sans font-normal text-zinc-500">
                    ({pos.andar}º ·{' '}
                    {pos.itens.length > 0
                      ? `${pos.totalCaixas} cx`
                      : pos.tipoOcupacao === 'misto'
                        ? `misto ${(pos.ocupacaoManualPct ?? 50).toFixed(0)}%`
                        : pos.tipoOcupacao === 'reservado'
                          ? 'reservado'
                          : 'livre'}
                    )
                  </span>
                </button>
              ))}
            </div>
          )}

          {produtosEncontrados.length > 0 && (
            <div className="space-y-1.5">
              {produtosEncontrados.map((p) => (
                <div
                  key={p.codigo}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-zinc-900">{p.codigo}</span>
                      <span className="font-medium text-zinc-800 truncate">{p.descricao}</span>
                      <StatusBadge variante="aguardando">{p.grupoAlocacaoNome}</StatusBadge>
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
                          className="px-2.5 py-1.5 min-h-[40px] rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-bold text-xs flex items-center gap-1 hover:bg-emerald-100 cursor-pointer"
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
                          className="px-2.5 py-1.5 min-h-[40px] rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-800 font-mono font-bold text-xs flex items-center gap-1 hover:bg-zinc-200 cursor-pointer"
                        >
                          <MapPin className="h-3 w-3" /> Pulmão {cod}
                        </button>
                      );
                    })}
                    {p.enderecosPicking.length === 0 && p.enderecosPulmao.length === 0 && (
                      <button
                        type="button"
                        onClick={() => onAbrirProduto(p)}
                        className="px-2.5 py-1.5 min-h-[40px] rounded-lg bg-zinc-900 text-white font-bold text-xs cursor-pointer"
                      >
                        Alocar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {posicoes.length === 0 ? (
        <div className="panel-card p-8 text-center text-sm text-zinc-500">
          Nenhum vão cadastrado nesta prateleira. Acesse <strong>Galpões & Regras</strong> para gerar a grade.
        </div>
      ) : (
        <DesenhoPrateleira3dSvg
          estrutura={estruturaAtiva}
          posicoes={posicoes}
          colunas={colunas}
          andares={andares}
          prodPorCodigo={prodPorCodigo}
          caixas={caixas}
          termoBusca={busca}
          onSelectPosicao={onSelectPosicao}
        />
      )}
    </div>
  );
}
