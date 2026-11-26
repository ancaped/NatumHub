import React, { useEffect, useMemo, useState } from 'react';
import { Factory, MapPin, PackagePlus, RefreshCw, Search, Sparkles } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import { StatusBadge } from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import { fetchOpsChegando, salvarLotePosicao } from './api';
import type { OpChegandoItem, OpsChegandoResponse, PosicaoComItens } from './types';

interface OpsChegandoDrawerProps {
  open: boolean;
  estruturaId: string;
  posicoes?: PosicaoComItens[];
  canEdit: boolean;
  onClose: () => void;
  onSaved?: () => Promise<void>;
  onAbrirPosicaoCodigo: (codigo: string) => void;
  onAbrirProdutoCodigo: (codigo: string) => void;
  onAbrirSugestao: () => void;
  avisar: (msg: string, tipo?: TipoAviso) => void;
}

type FiltroModo = 'TODAS' | 'ALERTAS' | 'ENVASE' | 'LIBERADO' | 'PRODUZIDO';

function badgeEtapa(etapa: string, statusErp?: string) {
  const sig = (statusErp ?? '').toUpperCase();
  if (sig === 'EN' || etapa.includes('(EN)')) {
    return <StatusBadge variante="saudavel">EN · Em Envase</StatusBadge>;
  }
  if (sig === 'PR' || etapa.includes('(PR)')) {
    return <StatusBadge variante="aguardando">PR · Em Produção</StatusBadge>;
  }
  if (sig === 'PP' || etapa.includes('(PP)')) {
    return <StatusBadge variante="descontinuado">PP · Pré-Produção</StatusBadge>;
  }
  if (sig === 'PG' || etapa.includes('(PG)')) {
    return <StatusBadge variante="descontinuado">PG · Em Pesagem</StatusBadge>;
  }
  if (etapa === 'Envase' || etapa === 'Ordem Parcial' || etapa === 'Rotulagem') {
    return <StatusBadge variante="saudavel">{etapa}</StatusBadge>;
  }
  if (etapa === 'Liberado para Envase') {
    return <StatusBadge variante="aguardando">Liberado Envase</StatusBadge>;
  }
  return <StatusBadge variante="descontinuado">{etapa}</StatusBadge>;
}

function badgeEspaco(item: OpChegandoItem) {
  if (item.situacaoEspaco === 'sem_endereco') {
    return <StatusBadge variante="critico">Sem endereço</StatusBadge>;
  }
  if (item.situacaoEspaco === 'sem_qtde_cx') {
    return <StatusBadge variante="critico">Sem qtde/cx</StatusBadge>;
  }
  if (item.situacaoEspaco === 'falta_espaco') {
    return <StatusBadge variante="aguardando">Falta +{item.deficitCaixas} cx</StatusBadge>;
  }
  return <StatusBadge variante="saudavel">Cabe</StatusBadge>;
}

export function OpsChegandoDrawer({
  open,
  estruturaId,
  posicoes = [],
  canEdit,
  onClose,
  onSaved,
  onAbrirPosicaoCodigo,
  onAbrirProdutoCodigo,
  onAbrirSugestao,
  avisar,
}: OpsChegandoDrawerProps) {
  const [dados, setDados] = useState<OpsChegandoResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroModo>('TODAS');
  const [entradaKey, setEntradaKey] = useState<string | null>(null);
  const [entradaPosId, setEntradaPosId] = useState('');
  const [entradaCaixas, setEntradaCaixas] = useState(1);
  const [entradaValidade, setEntradaValidade] = useState('');
  const [salvandoEntrada, setSalvandoEntrada] = useState(false);

  const posicoesAtivas = useMemo(
    () =>
      posicoes
        .filter((p) => p.ativo && (p.tipoOcupacao ?? 'padrao') === 'padrao')
        .sort((a, b) => a.andar - b.andar || a.colunaOrdem - b.colunaOrdem || a.nivel - b.nivel),
    [posicoes],
  );

  const abrirEntradaOp = (it: OpChegandoItem) => {
    const k = `${it.loteNumber}-${it.produtoCodigo}`;
    if (entradaKey === k) {
      setEntradaKey(null);
      return;
    }
    const prefCod = it.enderecosPulmao[0] ?? it.enderecosPicking[0];
    const prefPos = prefCod
      ? posicoesAtivas.find((p) => p.codigo.toUpperCase() === prefCod.toUpperCase())
      : undefined;
    setEntradaPosId(prefPos?.id ?? posicoesAtivas[0]?.id ?? '');
    setEntradaCaixas(Math.max(1, it.caixasChegando || 1));
    setEntradaValidade('');
    setEntradaKey(k);
  };

  const confirmarEntradaOp = async (it: OpChegandoItem) => {
    if (!entradaPosId) {
      avisar('Escolha um vão de destino para dar entrada.', 'erro');
      return;
    }
    setSalvandoEntrada(true);
    try {
      await salvarLotePosicao(
        {
          posicaoId: entradaPosId,
          produtoCodigo: it.produtoCodigo,
          lote: it.loteNumber,
          caixas: Math.max(1, entradaCaixas),
          dataValidade: entradaValidade || null,
          garantirAlocacao: true,
        },
        true,
      );
      const posSel = posicoesAtivas.find((p) => p.id === entradaPosId);
      avisar(
        `Lote #${it.loteNumber} (${it.produtoCodigo}) registrado em ${posSel?.codigo ?? 'vão'} (${entradaCaixas} cx).`,
        'sucesso',
      );
      setEntradaKey(null);
      await onSaved?.();
      await carregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao dar entrada do lote.', 'erro');
    } finally {
      setSalvandoEntrada(false);
    }
  };

  const carregar = async () => {
    setCarregando(true);
    try {
      const res = await fetchOpsChegando({ estruturaId: estruturaId || undefined });
      setDados(res);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao carregar OPs chegando.', 'erro');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void carregar();
  }, [open, estruturaId]);

  const itensFiltrados = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    return dados.itens.filter((it) => {
      if (filtro === 'ALERTAS' && it.situacaoEspaco === 'ok') return false;
      if (filtro === 'ENVASE' && it.etapaOrdem !== 1) return false;
      if (filtro === 'LIBERADO' && it.etapaOrdem !== 2) return false;
      if (filtro === 'PRODUZIDO' && it.etapaOrdem !== 3) return false;
      if (!q) return true;
      return (
        it.loteNumber.toLowerCase().includes(q) ||
        (it.statusErp ?? '').toLowerCase().includes(q) ||
        it.etapa.toLowerCase().includes(q) ||
        it.produtoCodigo.toLowerCase().includes(q) ||
        it.produtoDescricao.toLowerCase().includes(q) ||
        it.grupoAlocacaoNome.toLowerCase().includes(q)
      );
    });
  }, [dados, busca, filtro]);

  if (!open) return null;

  const resumo = dados?.resumo;
  const totalAlertas = (resumo?.semEndereco ?? 0) + (resumo?.faltaEspaco ?? 0);

  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      size="lg"
      title="OPs chegando da Produção"
      subtitle="Ordens abertas direto do ERP (EN, PR, PP, PG — exclui EA finalizadas e CA canceladas)"
      badge={
        resumo ? (
          <StatusBadge variante={totalAlertas > 0 ? 'aguardando' : 'saudavel'}>
            {resumo.totalOps} OPs · {resumo.totalCaixasChegando} cx
          </StatusBadge>
        ) : undefined
      }
      headerActions={
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={carregando}
          className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
          title="Recarregar OPs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      }
    >
      <div className="p-4 sm:p-5 space-y-4 text-xs">
        {resumo && (
          <div className="panel-card !p-3 flex flex-wrap items-center justify-between gap-2 text-zinc-700">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1 font-bold text-zinc-900">
                <Factory className="h-3.5 w-3.5" />
                {resumo.totalOps} lotes ativos
              </span>
              <span>
                Envase (EN): <strong className="font-mono">{resumo.emEnvaseRotulagem}</strong>
              </span>
              <span>
                Produção (PR): <strong className="font-mono">{resumo.liberadoEnvase}</strong>
              </span>
              <span>
                Pesagem/Pré (PG/PP): <strong className="font-mono">{resumo.produzido}</strong>
              </span>
              <span>
                Sem endereço: <strong className="font-mono text-red-700">{resumo.semEndereco}</strong>
              </span>
              <span>
                Falta espaço: <strong className="font-mono text-amber-800">{resumo.faltaEspaco}</strong>
              </span>
            </div>
            {canEdit && totalAlertas > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAbrirSugestao();
                }}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Organizar pulmão
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar lote, código ou produto..."
              className="w-full pl-8 pr-3 py-2 border border-zinc-200 rounded-xl bg-white text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                { id: 'TODAS', rotulo: 'Todas' },
                { id: 'ALERTAS', rotulo: `Alertas (${totalAlertas})` },
                { id: 'ENVASE', rotulo: 'Envase (EN)' },
                { id: 'LIBERADO', rotulo: 'Produção (PR)' },
                { id: 'PRODUZIDO', rotulo: 'Pesagem/Pré' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`px-2.5 py-1.5 min-h-[34px] max-sm:min-h-[40px] rounded-lg border font-semibold cursor-pointer transition-colors ${
                  filtro === f.id
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>

        {carregando && !dados ? (
          <div className="p-8 text-center text-zinc-500">Consultando lotes da Produção...</div>
        ) : itensFiltrados.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-zinc-300 text-center text-zinc-500">
            Nenhuma OP encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="space-y-2">
            {itensFiltrados.map((it) => {
              const enderecos = [...it.enderecosPicking, ...it.enderecosPulmao];
              const estMaisOp = (it.estoqueCaixas ?? 0) + it.caixasChegando;
              return (
                <div
                  key={`${it.loteNumber}-${it.produtoCodigo}`}
                  className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-bold text-zinc-900">
                          Lote #{it.loteNumber}
                        </span>
                        {badgeEtapa(it.etapa, it.statusErp)}
                        {it.dataLote && (
                          <span className="font-mono text-[10px] text-zinc-500">
                            ERP {it.dataLote}
                          </span>
                        )}
                        {it.dataPrevisao && (
                          <span className="font-mono text-[10px] text-zinc-500">
                            Prev. {it.dataPrevisao}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onAbrirProdutoCodigo(it.produtoCodigo)}
                        className="text-left hover:underline cursor-pointer block max-w-full"
                      >
                        <span className="font-mono font-semibold text-zinc-800">
                          {it.produtoCodigo}
                        </span>{' '}
                        <span className="text-zinc-600">{it.produtoDescricao}</span>
                      </button>
                    </div>
                    <div className="shrink-0">{badgeEspaco(it)}</div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600 pt-1 border-t border-zinc-100">
                    <div className="font-mono flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>{Math.round(it.quantidadeKg)} kg</span>
                      <span>
                        {it.unidadesEstimadas > 0
                          ? `~${it.unidadesEstimadas.toLocaleString('pt-BR')} un`
                          : 'un n/d'}
                      </span>
                      <span className="font-bold text-zinc-900">
                        +{it.caixasChegando} cx chegando
                      </span>
                      {it.qtdeCxEfetiva && (
                        <span className="text-zinc-500">
                          Est+OP {estMaisOp} cx / Cap. {it.capacidadeAlocadaCaixas} cx
                        </span>
                      )}
                    </div>

                    {enderecos.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <MapPin className="h-3 w-3 text-zinc-400" />
                        {it.enderecosPicking.map((cod) => (
                          <button
                            key={`op-pk-${it.loteNumber}-${cod}`}
                            type="button"
                            onClick={() => onAbrirPosicaoCodigo(cod)}
                            className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[10px] font-bold hover:bg-emerald-100 cursor-pointer"
                          >
                            {cod}
                          </button>
                        ))}
                        {it.enderecosPulmao.map((cod) => (
                          <button
                            key={`op-pl-${it.loteNumber}-${cod}`}
                            type="button"
                            onClick={() => onAbrirPosicaoCodigo(cod)}
                            className="px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono text-[10px] font-bold hover:bg-zinc-200 cursor-pointer"
                          >
                            {cod}
                          </button>
                        ))}
                      </div>
                    )}
                    {canEdit && posicoesAtivas.length > 0 && (
                      <button
                        type="button"
                        onClick={() => abrirEntradaOp(it)}
                        className="px-2.5 py-1 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <PackagePlus className="h-3 w-3" />
                        Dar entrada
                      </button>
                    )}
                  </div>

                  {entradaKey === `${it.loteNumber}-${it.produtoCodigo}` && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-zinc-600 block">
                            Vão destino
                          </span>
                          <select
                            value={entradaPosId}
                            onChange={(e) => setEntradaPosId(e.target.value)}
                            className="w-full px-2 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono text-xs"
                          >
                            {posicoesAtivas.map((p) => (
                              <option key={`ent-pos-${p.id}`} value={p.id}>
                                {p.codigo} ({p.papel === 'pulmao' ? 'Pulmão' : 'Pick'})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-zinc-600 block">
                            Caixas
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={entradaCaixas}
                            onChange={(e) =>
                              setEntradaCaixas(Math.max(1, parseInt(e.target.value || '1', 10)))
                            }
                            className="w-full px-2 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono text-xs"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-semibold text-zinc-600 block">
                            Validade (opcional)
                          </span>
                          <input
                            type="date"
                            value={entradaValidade}
                            onChange={(e) => setEntradaValidade(e.target.value)}
                            className="w-full px-2 py-1.5 border border-zinc-200 rounded-lg bg-white font-mono text-xs"
                          />
                        </label>
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEntradaKey(null)}
                          className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={salvandoEntrada}
                          onClick={() => confirmarEntradaOp(it)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 font-semibold disabled:opacity-50 cursor-pointer"
                        >
                          {salvandoEntrada ? 'Gravando...' : 'Confirmar entrada'}
                        </button>
                      </div>
                    </div>
                  )}

                  {it.motivoEspera && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                      Espera: {it.motivoEspera}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
}
