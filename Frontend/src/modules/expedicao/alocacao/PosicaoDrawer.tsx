import React, { useEffect, useMemo, useState } from 'react';
import {
  Lock,
  Unlock,
  Plus,
  Trash2,
  Save,
  AlertTriangle,
  ArrowRight,
  Copy,
} from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import { StatusBadge } from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import type { PedidoPrevia } from '../../producao/lib/usePreviaServidor';
import { atualizarPosicao, salvarAlocacaoPosicao } from './api';
import type { Caixa, PosicaoComItens, ProdutoDimensao } from './types';

interface PosicaoDrawerProps {
  posicao: PosicaoComItens | null;
  posicoes: PosicaoComItens[];
  produtos: ProdutoDimensao[];
  caixas: Caixa[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onMoverAlocacao: (
    alocacaoId: string,
    destinoPosicaoId: string,
    copiar: boolean,
  ) => Promise<void>;
  avisar: (msg: string, tipo?: TipoAviso) => void;
  pedirPrevia: (p: PedidoPrevia) => Promise<void>;
}

export function PosicaoDrawer({
  posicao,
  posicoes,
  produtos,
  caixas,
  canEdit,
  onClose,
  onSaved,
  onMoverAlocacao,
  avisar,
  pedirPrevia,
}: PosicaoDrawerProps) {
  const [alturaCm, setAlturaCm] = useState('74');
  const [larguraCm, setLarguraCm] = useState('100');
  const [comprimentoCm, setComprimentoCm] = useState('120');
  const [papel, setPapel] = useState<'picking' | 'pulmao'>('picking');
  const [aplicarAndar, setAplicarAndar] = useState(false);
  const [salvandoPos, setSalvandoPos] = useState(false);

  const [buscaProd, setBuscaProd] = useState('');
  const [prodSelecionado, setProdSelecionado] = useState('');
  const [novoFileiras, setNovoFileiras] = useState(1);
  const [novoCamadas, setNovoCamadas] = useState(1);
  const [novoFixado, setNovoFixado] = useState(true);
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const [destinoMover, setDestinoMover] = useState<Record<string, string>>({});
  const [movendoId, setMovendoId] = useState<string | null>(null);

  const [edicoes, setEdicoes] = useState<
    Record<string, { fileiras: number; camadas: number; fixado: boolean }>
  >({});

  useEffect(() => {
    if (!posicao) return;
    setAlturaCm(String(posicao.alturaCm));
    setLarguraCm(String(posicao.larguraCm));
    setComprimentoCm(String(posicao.comprimentoCm));
    setPapel(posicao.papel === 'pulmao' ? 'pulmao' : 'picking');
    setAplicarAndar(false);
    setBuscaProd('');
    setProdSelecionado('');
    setNovoFileiras(1);
    setNovoCamadas(1);
    setNovoFixado(true);
    setDestinoMover({});
    const map: Record<string, { fileiras: number; camadas: number; fixado: boolean }> = {};
    for (const item of posicao.itens) {
      map[item.id] = {
        fileiras: item.fileirasLargura,
        camadas: item.camadasAltura,
        fixado: item.fixado,
      };
    }
    setEdicoes(map);
  }, [posicao]);

  const destinosDisponiveis = useMemo(() => {
    if (!posicao) return [];
    return posicoes
      .filter((p) => p.id !== posicao.id && p.ativo)
      .sort((a, b) => a.andar - b.andar || a.colunaOrdem - b.colunaOrdem || a.nivel - b.nivel);
  }, [posicoes, posicao]);

  const candidatos = useMemo(() => {
    if (!posicao) return [];
    const jaNaPos = new Set(posicao.itens.map((i) => i.produtoCodigo));
    const q = buscaProd.trim().toLowerCase();
    return produtos
      .filter((p) => !jaNaPos.has(p.codigo))
      .filter((p) => {
        if (!q) return true;
        return (
          p.codigo.toLowerCase().includes(q) ||
          p.descricao.toLowerCase().includes(q) ||
          (p.codigoBarras ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [posicao, produtos, buscaProd]);

  const produtoEscolhido = useMemo(
    () => produtos.find((p) => p.codigo === prodSelecionado) ?? null,
    [produtos, prodSelecionado],
  );

  // Cálculo automático de camadas e fileiras ideais ao selecionar o produto
  useEffect(() => {
    if (!posicao || !produtoEscolhido) return;
    const altCx = produtoEscolhido.caixaAlturaCm ?? 0;
    const largCx = produtoEscolhido.caixaLarguraCm ?? 0;
    const compCx = produtoEscolhido.caixaComprimentoCm ?? 0;
    const emp = produtoEscolhido.empilhamentoMax ?? 4;

    let camadasCalc = 1;
    if (altCx > 0) {
      const cabem = Math.floor((posicao.alturaCm + 1e-6) / altCx);
      const sugerido = Math.max(1, Math.min(cabem || 1, emp));
      camadasCalc = produtoEscolhido.camadasOverride ?? sugerido;
    }
    setNovoCamadas(camadasCalc);

    let fileirasCalc = 1;
    if (largCx > 0 && compCx > 0) {
      const cabemLargLivre = Math.max(1, Math.floor((posicao.larguraLivreCm + 1e-6) / largCx));
      const cabemComp = Math.max(1, Math.floor((posicao.comprimentoCm + 1e-6) / compCx));
      const cxPorFileira = Math.max(1, cabemComp * camadasCalc);
      const alvoCx =
        posicao.papel === 'pulmao'
          ? produtoEscolhido.caixasNecessariasPulmao || produtoEscolhido.caixasNecessariasTotal
          : produtoEscolhido.caixasNecessariasPicking || produtoEscolhido.caixasNecessariasTotal;
      if (alvoCx > 0) {
        const nec = Math.max(1, Math.ceil(alvoCx / cxPorFileira));
        fileirasCalc = Math.min(cabemLargLivre, nec);
      }
    }
    setNovoFileiras(Math.max(1, fileirasCalc));
  }, [posicao, produtoEscolhido]);

  if (!posicao) return null;

  const salvarPosicaoProps = async () => {
    const a = Number(alturaCm);
    const l = Number(larguraCm);
    const c = Number(comprimentoCm);
    if (!(a > 0 && l > 0 && c > 0)) {
      avisar('Informe medidas positivas para a posição.', 'erro');
      return;
    }
    setSalvandoPos(true);
    try {
      await atualizarPosicao(
        posicao.id,
        {
          alturaCm: a,
          larguraCm: l,
          comprimentoCm: c,
          papel,
          aplicarAoAndar: aplicarAndar,
        },
        true,
      );
      avisar(
        aplicarAndar
          ? `Prateleira ${posicao.andar} atualizada.`
          : `Posição ${posicao.codigo} atualizada.`,
        'sucesso',
      );
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao atualizar posição.', 'erro');
    } finally {
      setSalvandoPos(false);
    }
  };

  const salvarItemExistente = async (itemId: string, produtoCodigo: string) => {
    const ed = edicoes[itemId];
    if (!ed) return;
    try {
      await salvarAlocacaoPosicao(
        {
          posicaoId: posicao.id,
          produtoCodigo,
          fileirasLargura: Math.max(1, ed.fileiras),
          camadasAltura: Math.max(1, ed.camadas),
          fixado: ed.fixado,
          observacoes: null,
        },
        true,
      );
      avisar(`Alocação de ${produtoCodigo} atualizada.`, 'sucesso');
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao salvar alocação.', 'erro');
    }
  };

  const moverOuDuplicarItem = async (itemId: string, copiar: boolean) => {
    const destId = destinoMover[itemId];
    if (!destId) {
      avisar('Escolha a posição de destino primeiro.', 'erro');
      return;
    }
    setMovendoId(itemId);
    try {
      await onMoverAlocacao(itemId, destId, copiar);
    } finally {
      setMovendoId(null);
    }
  };

  const removerItem = (itemId: string, produtoCodigo: string) => {
    void pedirPrevia({
      url: `/expedicao/alocacao/alocacoes/${encodeURIComponent(itemId)}`,
      init: { method: 'DELETE' },
      titulo: 'Remover produto da posição',
      confirmarRotulo: 'Remover',
      pedirMotivo: true,
      linhas: () => [
        {
          titulo: `${produtoCodigo} em ${posicao.codigo}`,
          detalhe: 'Será removido da posição',
        },
      ],
      erroPadrao: 'Não foi possível remover a alocação.',
      aoConcluir: async () => {
        avisar(`${produtoCodigo} removido de ${posicao.codigo}.`, 'sucesso');
        await onSaved();
      },
    });
  };

  const adicionarProduto = async () => {
    if (!produtoEscolhido) return;
    setSalvandoNovo(true);
    try {
      await salvarAlocacaoPosicao(
        {
          posicaoId: posicao.id,
          produtoCodigo: produtoEscolhido.codigo,
          fileirasLargura: Math.max(1, novoFileiras),
          camadasAltura: Math.max(1, novoCamadas),
          fixado: novoFixado,
          observacoes: null,
        },
        true,
      );
      avisar(`${produtoEscolhido.codigo} alocado em ${posicao.codigo}.`, 'sucesso');
      setProdSelecionado('');
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao alocar produto.', 'erro');
    } finally {
      setSalvandoNovo(false);
    }
  };

  const previaLarguraNovo =
    produtoEscolhido?.caixaLarguraCm != null
      ? novoFileiras * produtoEscolhido.caixaLarguraCm
      : null;
  const previaCompNovo =
    produtoEscolhido?.caixaComprimentoCm && produtoEscolhido.caixaComprimentoCm > 0
      ? Math.max(1, Math.floor((posicao.comprimentoCm + 1e-6) / produtoEscolhido.caixaComprimentoCm))
      : null;
  const previaCaixasNovo =
    previaCompNovo != null ? novoFileiras * previaCompNovo * Math.max(1, novoCamadas) : null;

  const caixaMap = new Map(caixas.map((c) => [c.id, c]));

  return (
    <Drawer
      isOpen={Boolean(posicao)}
      onClose={onClose}
      size="lg"
      title={`Posição ${posicao.codigo}`}
      subtitle={`Prateleira ${posicao.andar} · Posição ${posicao.nivel} · Vão ${posicao.alturaCm} cm`}
      badge={
        <StatusBadge variante={posicao.papel === 'pulmao' ? 'aguardando' : 'saudavel'}>
          {posicao.papel === 'pulmao' ? 'Pulmão' : 'Picking'}
        </StatusBadge>
      }
    >
      <div className="p-4 sm:p-5 space-y-5 text-xs">
        {/* Ocupação atual */}
        <div className="panel-card !p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-zinc-700">
              Ocupação na largura: {posicao.larguraOcupadaCm.toFixed(1)} / {posicao.larguraCm} cm (
              {posicao.ocupacaoPct.toFixed(0)}%)
            </span>
            <span className="font-mono text-zinc-500">
              Livre: {posicao.larguraLivreCm.toFixed(1)} cm · {posicao.totalCaixas} cx ·{' '}
              {posicao.totalUnidades.toLocaleString('pt-BR')} un
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
            <div
              className={`h-full transition-all ${
                posicao.temEstouro
                  ? 'bg-rose-500'
                  : posicao.ocupacaoPct >= 90
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, posicao.ocupacaoPct))}%` }}
            />
          </div>
          {posicao.temEstouro && (
            <div className="flex items-center gap-1.5 text-rose-700 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Há estouro de largura ou altura nesta posição.
            </div>
          )}
        </div>

        {/* Itens alocados */}
        <div className="space-y-2">
          <h4 className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
            Produtos nesta posição ({posicao.itens.length})
          </h4>
          {posicao.itens.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-zinc-300 text-zinc-500 text-center">
              Posição vazia. Adicione um produto abaixo ou rode a sugestão automática.
            </div>
          ) : (
            <div className="space-y-2">
              {posicao.itens.map((item) => {
                const ed = edicoes[item.id] ?? {
                  fileiras: item.fileirasLargura,
                  camadas: item.camadasAltura,
                  fixado: item.fixado,
                };
                const cx = item.caixaId ? caixaMap.get(item.caixaId) : undefined;
                const largPrev = cx ? ed.fileiras * cx.larguraCm : item.larguraOcupadaCm;
                const altPrev = cx ? ed.camadas * cx.alturaCm : item.alturaOcupadaCm;
                const totalCxPrev = cx
                  ? ed.fileiras * item.caixasComprimento * ed.camadas
                  : item.totalCaixas;
                const totalUnPrev = item.qtdeCx ? totalCxPrev * item.qtdeCx : item.totalUnidades;
                const estouroPrev = cx ? altPrev > posicao.alturaCm + 1e-6 : item.estouroAltura;

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-bold text-zinc-900">
                            {item.produtoCodigo}
                          </span>
                          {item.caixaCodigo && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-semibold text-[10px]">
                              CX {item.caixaCodigo}
                            </span>
                          )}
                          {estouroPrev && (
                            <StatusBadge variante="critico">Estouro vão</StatusBadge>
                          )}
                        </div>
                        <p className="text-zinc-600 font-medium truncate">
                          {item.produtoDescricao}
                        </p>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            setEdicoes((prev) => ({
                              ...prev,
                              [item.id]: { ...ed, fixado: !ed.fixado },
                            }))
                          }
                          title={
                            ed.fixado
                              ? 'Travado (sugestão automática não move)'
                              : 'Destravado (sugestão automática pode reorganizar)'
                          }
                          className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 ${
                            ed.fixado
                              ? 'bg-zinc-900 text-white border-zinc-900'
                              : 'bg-white text-zinc-600 border-zinc-200'
                          }`}
                        >
                          {ed.fixado ? (
                            <Lock className="h-3 w-3" />
                          ) : (
                            <Unlock className="h-3 w-3" />
                          )}
                          {ed.fixado ? 'Fixo' : 'Livre'}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <label className="flex items-center gap-1.5">
                        <span className="text-zinc-500 font-semibold">Fileiras larg.:</span>
                        <input
                          type="number"
                          min={1}
                          disabled={!canEdit}
                          value={ed.fileiras}
                          onChange={(e) =>
                            setEdicoes((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...ed,
                                fileiras: Math.max(1, parseInt(e.target.value || '1', 10)),
                              },
                            }))
                          }
                          className="w-16 px-2 py-1 border border-zinc-200 rounded-lg font-mono text-zinc-900"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span className="text-zinc-500 font-semibold">Camadas:</span>
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, item.maxCamadas || 10)}
                          disabled={!canEdit}
                          value={ed.camadas}
                          onChange={(e) =>
                            setEdicoes((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...ed,
                                camadas: Math.max(1, parseInt(e.target.value || '1', 10)),
                              },
                            }))
                          }
                          className="w-16 px-2 py-1 border border-zinc-200 rounded-lg font-mono text-zinc-900"
                        />
                      </label>
                      <span className="text-zinc-600 font-mono text-[11px]">
                        {largPrev.toFixed(1)} cm · {totalCxPrev} cx ·{' '}
                        {totalUnPrev.toLocaleString('pt-BR')} un
                        {item.coberturaMeses != null
                          ? ` · ${item.coberturaMeses.toFixed(1)} m`
                          : ''}
                      </span>
                    </div>

                    {canEdit && (
                      <div className="space-y-2 pt-1.5 border-t border-zinc-100">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            aria-label={`Destino para mover ${item.produtoCodigo}`}
                            value={destinoMover[item.id] ?? ''}
                            onChange={(e) =>
                              setDestinoMover((m) => ({ ...m, [item.id]: e.target.value }))
                            }
                            className="flex-1 min-w-[140px] px-2 py-1.5 border border-zinc-200 rounded-lg bg-zinc-50 text-xs font-mono"
                          >
                            <option value="">Mover / copiar para posição...</option>
                            {destinosDisponiveis.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.codigo} ({d.papel === 'pulmao' ? 'Pulmão' : 'Pick'} · livre{' '}
                                {d.larguraLivreCm.toFixed(0)}cm)
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!destinoMover[item.id] || movendoId === item.id}
                            onClick={() => moverOuDuplicarItem(item.id, false)}
                            className="px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 font-semibold disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                          >
                            <ArrowRight className="h-3 w-3" /> Mover
                          </button>
                          <button
                            type="button"
                            disabled={!destinoMover[item.id] || movendoId === item.id}
                            onClick={() => moverOuDuplicarItem(item.id, true)}
                            className="px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 font-semibold disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="h-3 w-3" /> Duplicar
                          </button>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => removerItem(item.id, item.produtoCodigo)}
                            className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remover
                          </button>
                          <button
                            type="button"
                            onClick={() => salvarItemExistente(item.id, item.produtoCodigo)}
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="h-3.5 w-3.5" /> Salvar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Adicionar produto */}
        {canEdit && (
          <div className="panel-card !p-3 space-y-3">
            <h4 className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
              Adicionar produto nesta posição
            </h4>
            <input
              type="text"
              value={buscaProd}
              onChange={(e) => setBuscaProd(e.target.value)}
              placeholder="Buscar por código, nome ou código de barras..."
              className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs bg-white"
            />
            <select
              value={prodSelecionado}
              onChange={(e) => setProdSelecionado(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs bg-white"
            >
              <option value="">Selecione um produto ({candidatos.length})...</option>
              {candidatos.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.codigo} — {p.descricao}
                  {p.caixaCodigo ? ` [CX ${p.caixaCodigo}]` : ' [Sem caixa]'}
                </option>
              ))}
            </select>

            {produtoEscolhido && (
              <div className="space-y-2 bg-zinc-50 border border-zinc-200 rounded-xl p-2.5">
                {!produtoEscolhido.caixaId && (
                  <div className="text-amber-800 font-semibold">
                    Atenção: este produto ainda não tem caixa vinculada (cadastre em Dimensionamento ou Conferência ERP para calcular largura/capacidade).
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5">
                    <span className="font-semibold text-zinc-600">Fileiras:</span>
                    <input
                      type="number"
                      min={1}
                      value={novoFileiras}
                      onChange={(e) =>
                        setNovoFileiras(Math.max(1, parseInt(e.target.value || '1', 10)))
                      }
                      className="w-16 px-2 py-1 border border-zinc-200 rounded-lg bg-white font-mono"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="font-semibold text-zinc-600">Camadas:</span>
                    <input
                      type="number"
                      min={1}
                      value={novoCamadas}
                      onChange={(e) =>
                        setNovoCamadas(Math.max(1, parseInt(e.target.value || '1', 10)))
                      }
                      className="w-16 px-2 py-1 border border-zinc-200 rounded-lg bg-white font-mono"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={novoFixado}
                      onChange={(e) => setNovoFixado(e.target.checked)}
                    />
                    <span className="font-semibold text-zinc-700">Fixar endereço</span>
                  </label>
                </div>
                {previaLarguraNovo !== null && (
                  <div className="text-[11px] text-zinc-700 font-mono">
                    Calculado: {novoFileiras} fil. × {novoCamadas} cam. ·{' '}
                    {previaLarguraNovo.toFixed(1)} cm
                    {previaCaixasNovo !== null ? ` · ${previaCaixasNovo} cx` : ''} (livre:{' '}
                    {posicao.larguraLivreCm.toFixed(1)} cm)
                  </div>
                )}
                <button
                  type="button"
                  disabled={salvandoNovo}
                  onClick={adicionarProduto}
                  className="w-full py-2 min-h-[42px] rounded-xl bg-zinc-900 text-white font-bold flex items-center justify-center gap-1.5 hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  {salvandoNovo ? 'Adicionando...' : `Adicionar em ${posicao.codigo}`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Medidas e papel da posição */}
        {canEdit && (
          <div className="panel-card !p-3 space-y-2.5">
            <h4 className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
              Medidas e papel do vão
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="space-y-1">
                <span className="text-zinc-500 font-semibold block">Altura vão (cm)</span>
                <input
                  type="number"
                  step="0.1"
                  value={alturaCm}
                  onChange={(e) => setAlturaCm(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-zinc-500 font-semibold block">Largura (cm)</span>
                <input
                  type="number"
                  step="0.1"
                  value={larguraCm}
                  onChange={(e) => setLarguraCm(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-zinc-500 font-semibold block">Comp. (cm)</span>
                <input
                  type="number"
                  step="0.1"
                  value={comprimentoCm}
                  onChange={(e) => setComprimentoCm(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-zinc-500 font-semibold block">Papel</span>
                <select
                  value={papel}
                  onChange={(e) =>
                    setPapel(e.target.value === 'pulmao' ? 'pulmao' : 'picking')
                  }
                  className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-semibold"
                >
                  <option value="picking">Picking</option>
                  <option value="pulmao">Pulmão</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-zinc-600 cursor-pointer">
              <input
                type="checkbox"
                checked={aplicarAndar}
                onChange={(e) => setAplicarAndar(e.target.checked)}
              />
              <span>Aplicar estas dimensões e papel a toda a Prateleira {posicao.andar}</span>
            </label>
            <button
              type="button"
              disabled={salvandoPos}
              onClick={salvarPosicaoProps}
              className="px-3 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 font-bold text-zinc-800 cursor-pointer"
            >
              {salvandoPos ? 'Salvando...' : 'Salvar configuração da posição'}
            </button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
