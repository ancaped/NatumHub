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
  CalendarClock,
} from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import { StatusBadge } from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import type { PedidoPrevia } from '../../producao/lib/usePreviaServidor';
import type { LinhaBase } from '../../geral/lib/linhas';
import {
  atualizarPosicao,
  fetchLotesErpProduto,
  moverLotePosicao,
  produtoForaDasLinhasDaEstante,
  rotuloGrupoAlocacao,
  salvarAlocacaoPosicao,
  salvarLotePosicao,
} from './api';
import { DesenhoPalete3dGiravel } from './DesenhoPalete3dGiravel';
import type {
  Caixa,
  Estrutura,
  LoteErpSugestao,
  PosicaoComItens,
  ProdutoDimensao,
} from './types';

interface PosicaoDrawerProps {
  posicao: PosicaoComItens | null;
  estruturaAtiva?: Estrutura | null;
  linhasConfigs?: LinhaBase[];
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
  estruturaAtiva = null,
  linhasConfigs = [],
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

  const [tipoOcupacao, setTipoOcupacao] = useState<'padrao' | 'misto' | 'reservado'>('padrao');
  const [ocupacaoManualPct, setOcupacaoManualPct] = useState<number>(50);
  const [etiquetaLivre, setEtiquetaLivre] = useState('');
  const [reservaMotivo, setReservaMotivo] = useState('');
  const [reservaAte, setReservaAte] = useState('');
  const [compartilhadoFracionado, setCompartilhadoFracionado] = useState(false);
  const [salvandoUso, setSalvandoUso] = useState(false);

  const [buscaProd, setBuscaProd] = useState('');
  const [prodSelecionado, setProdSelecionado] = useState('');
  const [novoFileiras, setNovoFileiras] = useState(1);
  const [novoCamadas, setNovoCamadas] = useState(1);
  const [novoFixado, setNovoFixado] = useState(true);
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const [destinoMover, setDestinoMover] = useState<Record<string, string>>({});
  const [movendoId, setMovendoId] = useState<string | null>(null);

  const [formLoteAberto, setFormLoteAberto] = useState(false);
  const [loteProdCodigo, setLoteProdCodigo] = useState('');
  const [loteNum, setLoteNum] = useState('');
  const [loteCaixas, setLoteCaixas] = useState(1);
  const [loteDataFab, setLoteDataFab] = useState('');
  const [loteDataVal, setLoteDataVal] = useState('');
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [lotesErp, setLotesErp] = useState<LoteErpSugestao[]>([]);
  const [carregandoLotesErp, setCarregandoLotesErp] = useState(false);
  const [destinoMoverLote, setDestinoMoverLote] = useState<Record<string, string>>({});
  const [qtdMoverLote, setQtdMoverLote] = useState<Record<string, number>>({});
  const [movendoLoteId, setMovendoLoteId] = useState<string | null>(null);

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
    const tipoNorm =
      posicao.tipoOcupacao === 'misto' || posicao.tipoOcupacao === 'reservado'
        ? posicao.tipoOcupacao
        : 'padrao';
    setTipoOcupacao(tipoNorm);
    setOcupacaoManualPct(
      typeof posicao.ocupacaoManualPct === 'number' ? posicao.ocupacaoManualPct : 50,
    );
    setEtiquetaLivre(posicao.etiquetaLivre ?? '');
    setReservaMotivo(posicao.reservaMotivo ?? '');
    setReservaAte(posicao.reservaAte ?? '');
    setCompartilhadoFracionado(Boolean(posicao.compartilhadoFracionado));
    setBuscaProd('');
    setProdSelecionado('');
    setNovoFileiras(1);
    setNovoCamadas(1);
    setNovoFixado(true);
    setDestinoMover({});
    setFormLoteAberto(false);
    setLoteProdCodigo(posicao.itens[0]?.produtoCodigo ?? '');
    setLoteNum('');
    setLoteCaixas(Math.max(1, posicao.itens[0]?.totalCaixas ?? 1));
    setLoteDataFab('');
    setLoteDataVal('');
    setDestinoMoverLote({});
    setQtdMoverLote({});
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

  useEffect(() => {
    if (!formLoteAberto || !loteProdCodigo) {
      setLotesErp([]);
      return;
    }
    let cancelado = false;
    setCarregandoLotesErp(true);
    fetchLotesErpProduto(loteProdCodigo)
      .then((lista) => {
        if (!cancelado) setLotesErp(lista.slice(0, 6));
      })
      .catch(() => {
        if (!cancelado) setLotesErp([]);
      })
      .finally(() => {
        if (!cancelado) setCarregandoLotesErp(false);
      });
    return () => {
      cancelado = true;
    };
  }, [formLoteAberto, loteProdCodigo]);

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
          ? `Andar ${posicao.andar} atualizado.`
          : `Vão ${posicao.codigo} atualizado.`,
        'sucesso',
      );
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao atualizar vão.', 'erro');
    } finally {
      setSalvandoPos(false);
    }
  };

  const salvarUsoVao = async () => {
    if (tipoOcupacao === 'reservado' && !reservaMotivo.trim()) {
      avisar('Informe um motivo curto para a reserva deste vão.', 'erro');
      return;
    }
    setSalvandoUso(true);
    try {
      await atualizarPosicao(
        posicao.id,
        {
          tipoOcupacao,
          ocupacaoManualPct: tipoOcupacao === 'misto' ? ocupacaoManualPct : null,
          etiquetaLivre: tipoOcupacao === 'misto' ? etiquetaLivre.trim() : '',
          reservaMotivo: tipoOcupacao === 'reservado' ? reservaMotivo.trim() : '',
          reservaAte: tipoOcupacao === 'reservado' ? reservaAte.trim() : '',
          compartilhadoFracionado,
        },
        true,
      );
      avisar(`Uso do vão ${posicao.codigo} atualizado.`, 'sucesso');
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao atualizar uso do vão.', 'erro');
    } finally {
      setSalvandoUso(false);
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

  const salvarNovoLote = async () => {
    if (!loteProdCodigo || !loteNum.trim()) {
      avisar('Selecione o produto e informe o número do lote.', 'erro');
      return;
    }
    setSalvandoLote(true);
    try {
      await salvarLotePosicao(
        {
          posicaoId: posicao.id,
          produtoCodigo: loteProdCodigo,
          lote: loteNum.trim(),
          caixas: Math.max(1, loteCaixas),
          dataFabricacao: loteDataFab || null,
          dataValidade: loteDataVal || null,
          garantirAlocacao: true,
        },
        true,
      );
      avisar(`Lote #${loteNum.trim()} salvo em ${posicao.codigo}.`, 'sucesso');
      setLoteNum('');
      setLoteDataFab('');
      setLoteDataVal('');
      setFormLoteAberto(false);
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao salvar lote.', 'erro');
    } finally {
      setSalvandoLote(false);
    }
  };

  const moverLote = async (loteId: string, maxCaixas: number) => {
    const destId = destinoMoverLote[loteId];
    if (!destId) {
      avisar('Selecione o vão de destino do lote.', 'erro');
      return;
    }
    const cx = Math.max(1, Math.min(maxCaixas, qtdMoverLote[loteId] ?? maxCaixas));
    setMovendoLoteId(loteId);
    try {
      const res = await moverLotePosicao(
        { loteId, destinoPosicaoId: destId, caixas: cx },
        true,
      );
      avisar(
        `Lote #${res.lote} movido para ${res.destinoPosicaoCodigo} (${res.caixasMovidas} cx).`,
        'sucesso',
      );
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao mover lote.', 'erro');
    } finally {
      setMovendoLoteId(null);
    }
  };

  const removerLote = (loteId: string, lote: string, prodCod: string) => {
    void pedirPrevia({
      url: `/expedicao/alocacao/lotes/${encodeURIComponent(loteId)}`,
      init: { method: 'DELETE' },
      titulo: 'Remover registro de lote',
      confirmarRotulo: 'Remover lote',
      pedirMotivo: true,
      linhas: () => [
        {
          titulo: `Lote #${lote} · ${prodCod}`,
          detalhe: `Será removido do vão ${posicao.codigo}`,
        },
      ],
      erroPadrao: 'Não foi possível remover o lote.',
      aoConcluir: async () => {
        avisar(`Lote #${lote} removido de ${posicao.codigo}.`, 'sucesso');
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
  const rotuloAndarSub = posicao.andar > 0 ? `Andar ${posicao.andar}` : 'Pátio';
  const tipoVaoAtual =
    posicao.tipoOcupacao === 'misto' || posicao.tipoOcupacao === 'reservado'
      ? posicao.tipoOcupacao
      : 'padrao';

  return (
    <Drawer
      isOpen={Boolean(posicao)}
      onClose={onClose}
      size="lg"
      title={`Vão ${posicao.codigo}`}
      subtitle={`${rotuloAndarSub} · Vão ${posicao.nivel} · Palete ${posicao.larguraCm}×${posicao.comprimentoCm} cm · Vão livre ${posicao.alturaCm} cm`}
      badge={
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge variante={posicao.papel === 'pulmao' ? 'aguardando' : 'saudavel'}>
            {posicao.papel === 'pulmao' ? 'Pulmão' : 'Picking'}
          </StatusBadge>
          {tipoVaoAtual === 'misto' && (
            <StatusBadge variante="descontinuado">Palete Misto</StatusBadge>
          )}
          {tipoVaoAtual === 'reservado' && (
            <StatusBadge variante="aguardando">Reservado</StatusBadge>
          )}
          {posicao.compartilhadoFracionado && (
            <StatusBadge variante="descontinuado">Compartilhado</StatusBadge>
          )}
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-5 text-xs">
        {/* Ocupação atual */}
        <div className="panel-card !p-3 space-y-2">
          {posicao.itens.length === 0 && tipoVaoAtual === 'misto' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-zinc-800">
                  Palete Misto · ocupação estimada ~{(posicao.ocupacaoManualPct ?? 50).toFixed(0)}%
                </span>
                <span className="font-mono text-zinc-500">Sem SKU fixo</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className="h-full transition-all bg-zinc-600"
                  style={{
                    width: `${Math.min(100, Math.max(0, posicao.ocupacaoManualPct ?? 50))}%`,
                  }}
                />
              </div>
              {posicao.etiquetaLivre && (
                <p className="text-[11px] text-zinc-700 font-medium">
                  {posicao.etiquetaLivre}
                </p>
              )}
              <p className="text-[11px] text-zinc-500">
                Vão marcado para carga mista / aleatória; ignorado pela sugestão automática.
              </p>
            </>
          ) : posicao.itens.length === 0 && tipoVaoAtual === 'reservado' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-amber-900">Vão reservado</span>
                {posicao.reservaAte && (
                  <span className="font-mono text-[11px] font-semibold text-amber-800">
                    Prev. {posicao.reservaAte}
                  </span>
                )}
              </div>
              {posicao.reservaMotivo && (
                <p className="text-[11px] text-zinc-800 font-medium">
                  {posicao.reservaMotivo}
                </p>
              )}
              <p className="text-[11px] text-zinc-500">
                Não é consumido pela sugestão automática enquanto estiver reservado.
              </p>
            </>
          ) : (
            <>
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
                      ? 'bg-red-500'
                      : posicao.ocupacaoPct >= 90
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, posicao.ocupacaoPct))}%` }}
                />
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600 pt-0.5">
            <span>
              Acesso:{' '}
              <strong className="text-zinc-900">
                {posicao.acessoEquipamento === 'empilhadeira'
                  ? 'Empilhadeira / Paleteira'
                  : 'Manual (a pé)'}
              </strong>{' '}
              <span className="font-mono text-zinc-500">
                (base {((posicao.cotaBaseCm ?? 0) / 100).toFixed(2)} m)
              </span>
              {posicao.compartilhadoFracionado && (
                <span className="ml-2 text-zinc-500">· Compartilhado / Fracionado</span>
              )}
            </span>
            {(posicao.pesoCargaKg ?? 0) > 0 && (
              <span className="font-mono text-zinc-700">
                Carga ~{Math.round(posicao.pesoCargaKg ?? 0)} kg · c/ palete ~
                {Math.round(posicao.pesoTotalComPaleteKg ?? 0)} kg
              </span>
            )}
          </div>
          {posicao.temEstouro && (
            <div className="flex items-center gap-1.5 text-red-700 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Há estouro de largura ou altura neste vão.
            </div>
          )}
        </div>

        {/* Palete 3D girável 360° do vão */}
        <div className="panel-card !p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
              Palete 3D no vão
            </h4>
            <span className="font-mono text-[11px] text-zinc-500">
              {posicao.larguraCm}×{posicao.comprimentoCm} cm (Alt. livre {posicao.alturaCm} cm)
            </span>
          </div>
          <DesenhoPalete3dGiravel
            posicao={posicao}
            posicoes={posicoes}
            produtos={produtos}
            caixas={caixas}
          />
        </div>

        {/* Tipo de uso / ocupação do vão */}
        {canEdit && (
          <div className="panel-card !p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
                Uso do vão
              </h4>
              {posicao.itens.length > 0 && tipoOcupacao !== 'padrao' && (
                <span className="text-[11px] text-amber-700 font-semibold">
                  Há itens vinculados: eles seguem visíveis até serem removidos.
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'padrao', rotulo: 'Padrão' },
                  { id: 'misto', rotulo: 'Palete Misto' },
                  { id: 'reservado', rotulo: 'Reservado' },
                ] as const
              ).map((op) => {
                const ativo = tipoOcupacao === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setTipoOcupacao(op.id)}
                    className={`px-3 py-1.5 min-h-[38px] max-sm:min-h-[44px] rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                      ativo
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {op.rotulo}
                  </button>
                );
              })}
            </div>

            {tipoOcupacao === 'misto' && (
              <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-2.5">
                <label className="block space-y-1">
                  <span className="font-semibold text-zinc-600 block">
                    Descrição livre do palete
                  </span>
                  <input
                    type="text"
                    value={etiquetaLivre}
                    onChange={(e) => setEtiquetaLivre(e.target.value)}
                    placeholder="Ex.: Sobras de lote + material feira"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl bg-white text-xs"
                  />
                </label>
                <div className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">
                    Ocupação estimada do vão
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[25, 50, 75, 100].map((pct) => {
                      const sel = Math.round(ocupacaoManualPct) === pct;
                      return (
                        <button
                          key={`pct-${pct}`}
                          type="button"
                          onClick={() => setOcupacaoManualPct(pct)}
                          className={`px-3 py-1.5 min-h-[36px] max-sm:min-h-[42px] rounded-lg border font-mono text-xs font-semibold cursor-pointer ${
                            sel
                              ? 'bg-zinc-900 text-white border-zinc-900'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                          }`}
                        >
                          {pct}%
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tipoOcupacao === 'reservado' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-2.5">
                <label className="sm:col-span-2 space-y-1">
                  <span className="font-semibold text-zinc-700 block">Motivo da reserva</span>
                  <input
                    type="text"
                    value={reservaMotivo}
                    onChange={(e) => setReservaMotivo(e.target.value)}
                    placeholder="Ex.: Pedido Coloração #26936"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl bg-white text-xs"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-700 block">Previsão (opcional)</span>
                  <input
                    type="text"
                    value={reservaAte}
                    onChange={(e) => setReservaAte(e.target.value)}
                    placeholder="Ex.: 05/12"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl bg-white text-xs font-mono"
                  />
                </label>
              </div>
            )}

            <label className="flex items-start gap-2 text-zinc-700 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={compartilhadoFracionado}
                onChange={(e) => setCompartilhadoFracionado(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="text-zinc-800">Compartilhado / Fracionado</strong>
                <span className="block text-[11px] text-zinc-500">
                  Prioriza Curva C, caixas abertas ou múltiplas nuances sem travar por soma rígida de largura.
                </span>
              </span>
            </label>

            <button
              type="button"
              disabled={salvandoUso}
              onClick={salvarUsoVao}
              className="px-3 py-2 min-h-[38px] max-sm:min-h-[44px] rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 font-semibold disabled:opacity-50 cursor-pointer"
            >
              {salvandoUso ? 'Salvando uso...' : 'Salvar uso do vão'}
            </button>
          </div>
        )}

        {/* Itens alocados */}
        <div className="space-y-2">
          <h4 className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
            Produtos neste vão ({posicao.itens.length})
          </h4>
          {posicao.itens.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-zinc-300 text-zinc-500 text-center">
              Vão vazio. Adicione um produto abaixo ou rode a sugestão automática.
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
                const prodItem = produtos.find((p) => p.codigo === item.produtoCodigo);

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
                          {(prodItem?.opPendenteCaixas ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[10px]">
                              +{prodItem?.opPendenteCaixas} cx em OP ({prodItem?.opProximaEtapa ?? 'Produção'})
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
                        {item.pesoEstimadoKg != null && item.pesoEstimadoKg > 0
                          ? ` · ~${Math.round(item.pesoEstimadoKg)} kg`
                          : ''}
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
                            <option value="">Mover / copiar para vão...</option>
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
                            className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-semibold flex items-center gap-1 cursor-pointer"
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

        {/* Lotes FEFO neste vão */}
        <div className="panel-card !p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-zinc-800 uppercase tracking-wider text-[11px] inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Lotes neste vão — FEFO ({posicao.lotes?.length ?? 0})
            </h4>
            {canEdit && (
              <button
                type="button"
                onClick={() => setFormLoteAberto((v) => !v)}
                className="px-2.5 py-1 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 font-semibold text-zinc-800 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                {formLoteAberto ? 'Fechar' : 'Registrar lote'}
              </button>
            )}
          </div>

          {(posicao.lotes?.length ?? 0) === 0 ? (
            <div className="text-[11px] text-zinc-500">
              Nenhum lote cadastrado neste vão ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {(posicao.lotes ?? []).map((l) => {
                const varBadge =
                  l.statusValidade === 'vencido' || l.statusValidade === 'critico_90d'
                    ? 'critico'
                    : l.statusValidade === 'atencao_180d'
                      ? 'aguardando'
                      : l.dataValidade
                        ? 'saudavel'
                        : 'descontinuado';
                const lblBadge =
                  l.statusValidade === 'vencido'
                    ? 'Vencido'
                    : l.diasParaVencer != null && l.diasParaVencer <= 180
                      ? `${l.diasParaVencer}d`
                      : l.dataValidade
                        ? 'OK'
                        : 'Sem data';
                return (
                  <div
                    key={l.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-2.5 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-bold text-zinc-900">Lote #{l.lote}</span>
                        <span className="font-mono text-zinc-600">{l.produtoCodigo}</span>
                        <StatusBadge variante={varBadge}>{lblBadge}</StatusBadge>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-zinc-800">
                        {l.caixas} cx · Val.{' '}
                        {l.dataValidade
                          ? l.dataValidade.split('-').reverse().join('/')
                          : '—'}
                      </span>
                    </div>
                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          aria-label={`Destino para mover lote ${l.lote}`}
                          value={destinoMoverLote[l.id] ?? ''}
                          onChange={(e) =>
                            setDestinoMoverLote((m) => ({ ...m, [l.id]: e.target.value }))
                          }
                          className="flex-1 min-w-[130px] px-2 py-1 border border-zinc-200 rounded-lg bg-white font-mono text-[11px]"
                        >
                          <option value="">Mover lote para vão...</option>
                          {destinosDisponiveis.map((d) => (
                            <option key={`ml-${d.id}`} value={d.id}>
                              {d.codigo} ({d.papel === 'pulmao' ? 'Pulmão' : 'Pick'})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          max={l.caixas}
                          value={qtdMoverLote[l.id] ?? l.caixas}
                          onChange={(e) =>
                            setQtdMoverLote((q) => ({
                              ...q,
                              [l.id]: Math.max(1, parseInt(e.target.value || '1', 10)),
                            }))
                          }
                          className="w-14 px-2 py-1 border border-zinc-200 rounded-lg bg-white font-mono text-[11px]"
                        />
                        <button
                          type="button"
                          disabled={!destinoMoverLote[l.id] || movendoLoteId === l.id}
                          onClick={() => moverLote(l.id, l.caixas)}
                          className="px-2.5 py-1 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 font-semibold text-zinc-800 disabled:opacity-40 cursor-pointer"
                        >
                          Mover
                        </button>
                        <button
                          type="button"
                          onClick={() => removerLote(l.id, l.lote, l.produtoCodigo)}
                          className="p-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                          title="Remover lote"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {canEdit && formLoteAberto && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 space-y-2.5">
              <label className="block space-y-1">
                <span className="font-semibold text-zinc-600 block">Produto</span>
                <select
                  value={loteProdCodigo}
                  onChange={(e) => setLoteProdCodigo(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white text-xs"
                >
                  <option value="">Selecione o produto...</option>
                  {posicao.itens.map((it) => (
                    <option key={`lp-it-${it.id}`} value={it.produtoCodigo}>
                      {it.produtoCodigo} — {it.produtoDescricao}
                    </option>
                  ))}
                  {candidatos.slice(0, 60).map((p) => (
                    <option key={`lp-cd-${p.codigo}`} value={p.codigo}>
                      {p.codigo} — {p.descricao}
                    </option>
                  ))}
                </select>
              </label>

              {loteProdCodigo && (carregandoLotesErp || lotesErp.length > 0) && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 block">
                    {carregandoLotesErp
                      ? 'Buscando lotes do ERP...'
                      : 'Lotes recentes do ERP (clique para preencher):'}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {lotesErp.map((le) => (
                      <button
                        key={`erp-l-${le.lote}`}
                        type="button"
                        onClick={() => {
                          setLoteNum(le.lote);
                          setLoteDataFab(le.dataFabricacao ?? '');
                          setLoteDataVal(le.dataValidadeSugerida ?? '');
                        }}
                        className="px-2 py-1 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 font-mono text-[11px] font-semibold text-zinc-800 cursor-pointer"
                      >
                        #{le.lote}
                        {le.dataValidadeSugerida ? ` · val. ${le.dataValidadeSugerida}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Lote</span>
                  <input
                    type="text"
                    value={loteNum}
                    onChange={(e) => setLoteNum(e.target.value)}
                    placeholder="Ex.: 15885"
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Caixas</span>
                  <input
                    type="number"
                    min={1}
                    value={loteCaixas}
                    onChange={(e) => setLoteCaixas(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Fabricação</span>
                  <input
                    type="date"
                    value={loteDataFab}
                    onChange={(e) => setLoteDataFab(e.target.value)}
                    className="w-full px-2 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-semibold text-zinc-600 block">Validade</span>
                  <input
                    type="date"
                    value={loteDataVal}
                    onChange={(e) => setLoteDataVal(e.target.value)}
                    className="w-full px-2 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setFormLoteAberto(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={salvandoLote}
                  onClick={salvarNovoLote}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {salvandoLote ? 'Salvando...' : 'Salvar lote'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Adicionar produto */}
        {canEdit && (
          tipoVaoAtual !== 'padrao' && posicao.itens.length === 0 ? (
            <div className="panel-card !p-3 text-zinc-500 text-xs">
              Para vincular produtos cadastrados diretamente neste vão, altere o uso para{' '}
              <strong className="text-zinc-800">Padrão</strong>.
            </div>
          ) : (
            <div className="panel-card !p-3 space-y-3">
            <h4 className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
              Adicionar produto neste vão
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
                {produtoForaDasLinhasDaEstante(produtoEscolhido, estruturaAtiva) && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      Atenção: esta prateleira é dedicada às linhas{' '}
                      <strong>
                        {(estruturaAtiva?.linhasPermitidas ?? [])
                          .map((lp) => rotuloGrupoAlocacao(lp, linhasConfigs))
                          .join(', ')}
                      </strong>
                      . Você pode gravar manualmente, mas a sugestão automática mantém linhas separadas.
                    </span>
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
          )
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
              <span>Aplicar estas dimensões e papel a todo o Andar {posicao.andar}</span>
            </label>
            <button
              type="button"
              disabled={salvandoPos}
              onClick={salvarPosicaoProps}
              className="px-3 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 font-bold text-zinc-800 cursor-pointer"
            >
              {salvandoPos ? 'Salvando...' : 'Salvar configuração do vão'}
            </button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
