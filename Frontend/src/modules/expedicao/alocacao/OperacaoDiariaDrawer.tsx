import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, MapPin, RefreshCw, Search } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import { StatusBadge } from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import { fetchReposicaoFefo, moverLotePosicao } from './api';
import type { AlocacaoLoteView, ReposicaoFefoResponse } from './types';

interface OperacaoDiariaDrawerProps {
  open: boolean;
  estruturaId: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onAbrirPosicaoId: (posicaoId: string) => void;
  onAbrirProdutoCodigo: (codigo: string) => void;
  avisar: (msg: string, tipo?: TipoAviso) => void;
}

type AbaOperacao = 'tarefas' | 'lotes' | 'alertas';

function badgeValidade(l: Pick<AlocacaoLoteView, 'statusValidade' | 'diasParaVencer' | 'dataValidade'>) {
  if (l.statusValidade === 'vencido') {
    return <StatusBadge variante="critico">Vencido</StatusBadge>;
  }
  if (l.statusValidade === 'critico_90d') {
    return <StatusBadge variante="critico">{l.diasParaVencer}d</StatusBadge>;
  }
  if (l.statusValidade === 'atencao_180d') {
    return <StatusBadge variante="aguardando">{l.diasParaVencer}d</StatusBadge>;
  }
  if (l.dataValidade) {
    return <StatusBadge variante="saudavel">OK</StatusBadge>;
  }
  return <StatusBadge variante="descontinuado">Sem validade</StatusBadge>;
}

function formatarDataBr(iso: string | null) {
  if (!iso || iso.length < 10) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function OperacaoDiariaDrawer({
  open,
  estruturaId,
  canEdit,
  onClose,
  onSaved,
  onAbrirPosicaoId,
  onAbrirProdutoCodigo,
  avisar,
}: OperacaoDiariaDrawerProps) {
  const [dados, setDados] = useState<ReposicaoFefoResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aba, setAba] = useState<AbaOperacao>('tarefas');
  const [busca, setBusca] = useState('');
  const [qtdMover, setQtdMover] = useState<Record<string, number>>({});
  const [movendoId, setMovendoId] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      const res = await fetchReposicaoFefo(estruturaId || undefined);
      setDados(res);
      const iniciais: Record<string, number> = {};
      for (const t of res.tarefas) {
        iniciais[t.loteId] = t.caixasSugeridas;
      }
      setQtdMover(iniciais);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao carregar fila FEFO e reposição.', 'erro');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void carregar();
  }, [open, estruturaId]);

  const tarefasFiltradas = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    return dados.tarefas.filter((t) => {
      if (!q) return true;
      return (
        t.produtoCodigo.toLowerCase().includes(q) ||
        t.produtoDescricao.toLowerCase().includes(q) ||
        t.lote.toLowerCase().includes(q) ||
        t.origemPosicaoCodigo.toLowerCase().includes(q) ||
        t.destinoPosicaoCodigo.toLowerCase().includes(q)
      );
    });
  }, [dados, busca]);

  const lotesFiltrados = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    return dados.lotesValidade.filter((l) => {
      if (
        aba === 'alertas' &&
        l.statusValidade !== 'vencido' &&
        l.statusValidade !== 'critico_90d' &&
        l.statusValidade !== 'atencao_180d'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        l.produtoCodigo.toLowerCase().includes(q) ||
        l.produtoDescricao.toLowerCase().includes(q) ||
        l.lote.toLowerCase().includes(q) ||
        l.posicaoCodigo.toLowerCase().includes(q)
      );
    });
  }, [dados, aba, busca]);

  if (!open) return null;

  const moverParaPicking = async (loteId: string, destinoPosicaoId: string, maxCx: number) => {
    const cx = Math.max(1, Math.min(maxCx, qtdMover[loteId] ?? 1));
    setMovendoId(loteId);
    try {
      const res = await moverLotePosicao({ loteId, destinoPosicaoId, caixas: cx }, true);
      avisar(
        `Lote #${res.lote} movido de ${res.origemPosicaoCodigo} para ${res.destinoPosicaoCodigo} (${res.caixasMovidas} cx).`,
        'sucesso',
      );
      await onSaved();
      await carregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao mover lote.', 'erro');
    } finally {
      setMovendoId(null);
    }
  };

  const resumo = dados?.resumo;
  const totalAlertasVal = (resumo?.vencidos ?? 0) + (resumo?.criticos90d ?? 0) + (resumo?.atencao180d ?? 0);

  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      size="lg"
      title="FEFO & Operação Diária"
      subtitle="Controle de validade por lote e reposição guiada Pulmão → Picking"
      badge={
        resumo ? (
          <StatusBadge
            variante={
              resumo.violacoesFefo > 0 || resumo.vencidos > 0
                ? 'critico'
                : resumo.reposicoesPendentes > 0
                  ? 'aguardando'
                  : 'saudavel'
            }
          >
            {resumo.totalLotes} lotes · {resumo.totalCaixasEmLotes} cx
          </StatusBadge>
        ) : undefined
      }
      headerActions={
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={carregando}
          className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      }
    >
      <div className="p-4 sm:p-5 space-y-4 text-xs">
        {resumo && (
          <div className="panel-card !p-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-zinc-700">
            <span className="inline-flex items-center gap-1 font-bold text-zinc-900">
              <CalendarClock className="h-3.5 w-3.5" />
              {resumo.totalLotes} lotes em estante
            </span>
            <span>
              Violações FEFO:{' '}
              <strong className={`font-mono ${resumo.violacoesFefo > 0 ? 'text-red-700' : 'text-zinc-900'}`}>
                {resumo.violacoesFefo}
              </strong>
            </span>
            <span>
              Reposições: <strong className="font-mono">{resumo.reposicoesPendentes}</strong>
            </span>
            <span>
              Vencidos/≤90d:{' '}
              <strong className={`font-mono ${resumo.vencidos + resumo.criticos90d > 0 ? 'text-red-700' : 'text-zinc-900'}`}>
                {resumo.vencidos + resumo.criticos90d}
              </strong>
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto, lote ou vão..."
              className="w-full pl-8 pr-3 py-2 border border-zinc-200 rounded-xl bg-white text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setAba('tarefas')}
              className={`px-2.5 py-1.5 min-h-[34px] max-sm:min-h-[40px] rounded-lg border font-semibold cursor-pointer ${
                aba === 'tarefas'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Reposição & FEFO ({dados?.tarefas.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setAba('lotes')}
              className={`px-2.5 py-1.5 min-h-[34px] max-sm:min-h-[40px] rounded-lg border font-semibold cursor-pointer ${
                aba === 'lotes'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Lotes FEFO ({resumo?.totalLotes ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setAba('alertas')}
              className={`px-2.5 py-1.5 min-h-[34px] max-sm:min-h-[40px] rounded-lg border font-semibold cursor-pointer ${
                aba === 'alertas'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Validade próx. ({totalAlertasVal})
            </button>
          </div>
        </div>

        {carregando && !dados ? (
          <div className="p-8 text-center text-zinc-500">Analisando lotes e validades...</div>
        ) : aba === 'tarefas' ? (
          tarefasFiltradas.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-zinc-300 text-center text-zinc-500">
              Nenhuma violação FEFO nem reposição Pulmão → Picking pendente.
              <div className="text-[11px] mt-1">
                Cadastre os lotes nos vãos ou dê entrada a partir de &quot;OPs chegando&quot;.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {tarefasFiltradas.map((t) => (
                <div
                  key={`${t.loteId}-${t.destinoPosicaoId}`}
                  className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge variante={t.tipo === 'violacao_fefo' ? 'critico' : 'aguardando'}>
                          {t.tipo === 'violacao_fefo' ? 'FEFO' : 'Reposição'}
                        </StatusBadge>
                        <span className="font-mono font-bold text-zinc-900">Lote #{t.lote}</span>
                        <span className="font-mono text-[11px] text-zinc-500">
                          Val. {formatarDataBr(t.dataValidade)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAbrirProdutoCodigo(t.produtoCodigo)}
                        className="text-left hover:underline cursor-pointer block max-w-full"
                      >
                        <span className="font-mono font-semibold text-zinc-800">{t.produtoCodigo}</span>{' '}
                        <span className="text-zinc-600">{t.produtoDescricao}</span>
                      </button>
                      <p className="text-[11px] text-zinc-500">{t.motivo}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      <button
                        type="button"
                        onClick={() => onAbrirPosicaoId(t.origemPosicaoId)}
                        className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 font-bold text-zinc-800 hover:bg-zinc-200 cursor-pointer"
                      >
                        Pulmão {t.origemPosicaoCodigo}
                      </button>
                      <ArrowRight className="h-3 w-3 text-zinc-400" />
                      <button
                        type="button"
                        onClick={() => onAbrirPosicaoId(t.destinoPosicaoId)}
                        className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                      >
                        Picking {t.destinoPosicaoCodigo}
                      </button>
                      <span className="text-zinc-500">({t.caixasDisponiveis} cx disp.)</span>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={t.caixasDisponiveis}
                          value={qtdMover[t.loteId] ?? t.caixasSugeridas}
                          onChange={(e) =>
                            setQtdMover((m) => ({
                              ...m,
                              [t.loteId]: Math.max(1, parseInt(e.target.value || '1', 10)),
                            }))
                          }
                          aria-label={`Caixas para mover do lote ${t.lote}`}
                          className="w-16 px-2 py-1.5 border border-zinc-200 rounded-lg font-mono text-xs bg-white"
                        />
                        <button
                          type="button"
                          disabled={movendoId === t.loteId}
                          onClick={() =>
                            moverParaPicking(t.loteId, t.destinoPosicaoId, t.caixasDisponiveis)
                          }
                          className="px-3 py-1.5 min-h-[34px] max-sm:min-h-[40px] rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 font-semibold disabled:opacity-50 cursor-pointer"
                        >
                          {movendoId === t.loteId ? 'Movendo...' : 'Mover p/ Picking'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : lotesFiltrados.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-zinc-300 text-center text-zinc-500">
            Nenhum lote encontrado neste filtro.
          </div>
        ) : (
          <div className="space-y-2">
            {lotesFiltrados.map((l) => (
              <div
                key={l.id}
                className="rounded-xl border border-zinc-200 bg-white p-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-bold text-zinc-900">Lote #{l.lote}</span>
                    {badgeValidade(l)}
                    <button
                      type="button"
                      onClick={() => onAbrirPosicaoId(l.posicaoId)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 font-mono text-[10px] font-bold text-zinc-800 hover:bg-zinc-200 cursor-pointer"
                    >
                      <MapPin className="h-2.5 w-2.5" />
                      {l.posicaoCodigo} ({l.papel === 'pulmao' ? 'Pulmão' : 'Pick'})
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAbrirProdutoCodigo(l.produtoCodigo)}
                    className="text-left hover:underline cursor-pointer block max-w-full truncate"
                  >
                    <span className="font-mono font-semibold text-zinc-800">{l.produtoCodigo}</span>{' '}
                    <span className="text-zinc-600">{l.produtoDescricao}</span>
                  </button>
                </div>
                <div className="text-right font-mono shrink-0">
                  <div className="font-bold text-zinc-900">{l.caixas} cx</div>
                  <div className="text-[10px] text-zinc-500">
                    Val. {formatarDataBr(l.dataValidade)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
