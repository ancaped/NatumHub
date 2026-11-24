import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckSquare, Sparkles, Square } from 'lucide-react';
import {
  BotaoAcao,
  FilterBar,
  FiltroSelect,
  StatusBadge,
  TabelaPainel,
  type VarianteBadge,
} from '../../geral/components/ui/ReportKit';
import type { TipoAviso } from '../../geral/components/ui/Aviso';
import type { PedidoPrevia } from '../../producao/lib/usePreviaServidor';
import { agruparLinhas, rotuloLinha, type LinhaBase } from '../../geral/lib/linhas';
import { atualizarAbcLote } from './api';
import type { ProdutoDimensao } from './types';

interface CurvaAbcTabProps {
  produtos: ProdutoDimensao[];
  linhasConfigs: LinhaBase[];
  janelaMeses: number;
  metaMeses: number;
  usarMetaLinha: boolean;
  incluirInativos: boolean;
  canEdit: boolean;
  onChangeJanela: (m: number) => void;
  onChangeMeta: (metaMeses: number, usarLinha: boolean) => void;
  onChangeIncluirInativos: (v: boolean) => void;
  onAbrirProduto: (p: ProdutoDimensao) => void;
  onAbrirSugestao: () => void;
  onSaved: () => Promise<void>;
  avisar: (msg: string, tipo?: TipoAviso) => void;
  pedirPrevia: (p: PedidoPrevia) => Promise<void>;
  onFiltroProdutosChange?: (filtrados: ProdutoDimensao[]) => void;
}

function chaveGrupoPrincipal(p: ProdutoDimensao): string {
  const lp = (p.linhaPrincipal ?? '').trim();
  return lp || p.linhaPrefix;
}

function situacaoBadge(s: string): { label: string; variante: VarianteBadge } {
  switch (s) {
    case 'ok':
      return { label: 'OK', variante: 'saudavel' };
    case 'sem_caixa':
      return { label: 'Sem caixa', variante: 'critico' };
    case 'sem_qtde_cx':
      return { label: 'Sem qtde/cx', variante: 'critico' };
    case 'sem_endereco':
      return { label: 'Sem endereço', variante: 'ordem' };
    case 'estoque_acima_capacidade':
      return { label: 'Acima cap.', variante: 'aguardando' };
    case 'estouro_vao':
      return { label: 'Estouro vão', variante: 'critico' };
    default:
      return { label: s, variante: 'apoio' };
  }
}

function abcVariante(curva: string): VarianteBadge {
  if (curva === 'A') return 'saudavel';
  if (curva === 'B') return 'ordem';
  if (curva === 'C') return 'apoio';
  return 'descontinuado';
}

export function CurvaAbcTab({
  produtos,
  linhasConfigs,
  janelaMeses,
  metaMeses,
  usarMetaLinha,
  incluirInativos,
  canEdit,
  onChangeJanela,
  onChangeMeta,
  onChangeIncluirInativos,
  onAbrirProduto,
  onAbrirSugestao,
  onSaved,
  avisar,
  pedirPrevia,
  onFiltroProdutosChange,
}: CurvaAbcTabProps) {
  const [linhaGrupoFiltro, setLinhaGrupoFiltro] = useState<string>('ALL');
  const [curvaFiltro, setCurvaFiltro] = useState<string>('NA_ABC');
  const [situacaoAlocFiltro, setSituacaoAlocFiltro] = useState<string>('ALL');
  const [situacaoCatalogo, setSituacaoCatalogo] = useState<string>('ativos_e_saindo');
  const [busca, setBusca] = useState<string>('');
  const [mostrarTodos, setMostrarTodos] = useState<boolean>(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [salvandoCodigo, setSalvandoCodigo] = useState<string | null>(null);

  // Principais presentes ordenadas (ex.: Hair Extrattus, Natum, Liss Shine, Perfect Curls)
  const gruposLinhas = useMemo(() => {
    const mapa = new Map<
      string,
      { chave: string; rotulo: string; naAbc: number; total: number; vendas: number }
    >();
    for (const p of produtos) {
      const ch = chaveGrupoPrincipal(p);
      const cur = mapa.get(ch) ?? {
        chave: ch,
        rotulo: rotuloLinha(linhasConfigs, ch) || p.nomeLinha || ch,
        naAbc: 0,
        total: 0,
        vendas: 0,
      };
      cur.total += 1;
      if (p.incluirAbcEfetivo) {
        cur.naAbc += 1;
        cur.vendas += p.vendasTotal;
      }
      mapa.set(ch, cur);
    }
    const ordemBase = agruparLinhas(linhasConfigs)
      .filter((g) => g.nivel === 0)
      .map((g) => g.linha.linha_prefix);
    return Array.from(mapa.values()).sort((a, b) => {
      const ia = ordemBase.indexOf(a.chave);
      const ib = ordemBase.indexOf(b.chave);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return b.vendas - a.vendas || a.chave.localeCompare(b.chave);
    });
  }, [produtos, linhasConfigs]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (linhaGrupoFiltro !== 'ALL' && chaveGrupoPrincipal(p) !== linhaGrupoFiltro) return false;
      if (curvaFiltro === 'NA_ABC' && !p.incluirAbcEfetivo) return false;
      if (curvaFiltro === 'FORA' && p.incluirAbcEfetivo) return false;
      if (
        curvaFiltro !== 'ALL' &&
        curvaFiltro !== 'NA_ABC' &&
        curvaFiltro !== 'FORA' &&
        p.curvaAbc !== curvaFiltro
      ) {
        return false;
      }
      if (situacaoAlocFiltro !== 'ALL' && p.situacaoAlocacao !== situacaoAlocFiltro) return false;
      if (situacaoCatalogo === 'ativos' && p.situacao !== 'ativo') return false;
      if (situacaoCatalogo === 'lancamento' && p.situacao !== 'lancamento') return false;
      if (situacaoCatalogo === 'saindo_de_linha' && p.situacao !== 'saindo_de_linha') return false;
      if (situacaoCatalogo === 'ativos_e_saindo' && p.situacao === 'descontinuado') return false;
      if (!q) return true;
      return (
        p.codigo.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q) ||
        (p.codigoBarras ?? '').toLowerCase().includes(q) ||
        p.enderecosPicking.some((e) => e.toLowerCase().includes(q)) ||
        p.enderecosPulmao.some((e) => e.toLowerCase().includes(q))
      );
    });
  }, [
    produtos,
    linhaGrupoFiltro,
    curvaFiltro,
    situacaoAlocFiltro,
    situacaoCatalogo,
    busca,
  ]);

  useEffect(() => {
    onFiltroProdutosChange?.(filtrados);
  }, [filtrados, onFiltroProdutosChange]);

  const visiveis = mostrarTodos ? filtrados : filtrados.slice(0, 100);
  const metaSelectVal = usarMetaLinha ? 'linha' : String(metaMeses);

  const resumoEscopo = useMemo(() => {
    const escopo =
      linhaGrupoFiltro === 'ALL'
        ? produtos
        : produtos.filter((p) => chaveGrupoPrincipal(p) === linhaGrupoFiltro);
    let naAbc = 0;
    let fora = 0;
    let cntA = 0;
    let cntB = 0;
    let cntC = 0;
    for (const p of escopo) {
      if (!p.incluirAbcEfetivo) {
        fora += 1;
      } else {
        naAbc += 1;
        if (p.curvaAbc === 'A') cntA += 1;
        else if (p.curvaAbc === 'B') cntB += 1;
        else cntC += 1;
      }
    }
    return { naAbc, fora, cntA, cntB, cntC };
  }, [produtos, linhaGrupoFiltro]);

  const alternarIndividual = async (p: ProdutoDimensao) => {
    if (!canEdit) return;
    setSalvandoCodigo(p.codigo);
    const proximo = !p.incluirAbcEfetivo;
    try {
      await atualizarAbcLote({ produtoCodigos: [p.codigo], incluirAbc: proximo }, true);
      avisar(
        proximo
          ? `${p.codigo} incluído na Curva ABC.`
          : `${p.codigo} retirado da Curva ABC.`,
        'sucesso',
      );
      await onSaved();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Erro ao alterar elegibilidade ABC.', 'erro');
    } finally {
      setSalvandoCodigo(null);
    }
  };

  const aplicarAbcEmLote = (incluirAbc: boolean | null) => {
    const codigos = Array.from(selecionados);
    if (codigos.length === 0) return;
    const acaoNome =
      incluirAbc === true
        ? 'Incluir na Curva ABC'
        : incluirAbc === false
          ? 'Retirar da Curva ABC'
          : 'Restaurar regra automática da ABC';
    void pedirPrevia({
      url: '/expedicao/alocacao/abc-lote',
      init: { method: 'POST', body: JSON.stringify({ produtoCodigos: codigos, incluirAbc }) },
      titulo: `${acaoNome} (${codigos.length} produtos)`,
      confirmarRotulo: acaoNome,
      linhas: (d) => [
        {
          titulo: 'Produtos elegíveis no catálogo',
          detalhe: String(d?.resultado?.atualizadosCount ?? d?.atualizadosCount ?? codigos.length),
        },
        {
          titulo: 'Regra aplicada',
          detalhe: acaoNome,
        },
      ],
      erroPadrao: 'Erro ao atualizar Curva ABC em lote.',
      aoConcluir: async (d) => {
        const qtd = d?.resultado?.atualizadosCount ?? d?.atualizadosCount ?? codigos.length;
        avisar(`${qtd} produtos atualizados na Curva ABC.`, 'sucesso');
        setSelecionados(new Set());
        await onSaved();
      },
    });
  };

  const todosVisiveisMarcados =
    visiveis.length > 0 && visiveis.every((p) => selecionados.has(p.codigo));

  const toggleTodosVisiveis = () => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (todosVisiveisMarcados) {
        for (const p of visiveis) next.delete(p.codigo);
      } else {
        for (const p of visiveis) next.add(p.codigo);
      }
      return next;
    });
  };

  const toggleUm = (codigo: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Pills por Linha Principal: Hair Extrattus, Natum, etc. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setLinhaGrupoFiltro('ALL');
            setMostrarTodos(false);
          }}
          className={`px-3 py-1.5 min-h-[38px] rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
            linhaGrupoFiltro === 'ALL'
              ? 'bg-zinc-900 text-white border-zinc-900'
              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          Todas as linhas ({produtos.filter((p) => p.incluirAbcEfetivo).length})
        </button>
        {gruposLinhas.map((g) => {
          const ativo = linhaGrupoFiltro === g.chave;
          return (
            <button
              key={g.chave}
              type="button"
              onClick={() => {
                setLinhaGrupoFiltro(g.chave);
                setMostrarTodos(false);
              }}
              className={`px-3 py-1.5 min-h-[38px] rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                ativo
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              {g.rotulo} ({g.naAbc})
            </button>
          );
        })}
      </div>

      {/* Faixa compacta de resumo do cálculo separado */}
      <div className="panel-card !px-3 !py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-zinc-800">
            Curva calculada por linha principal (80% A / 95% B / 100% C):
          </span>
          <StatusBadge variante="saudavel">A: {resumoEscopo.cntA}</StatusBadge>
          <StatusBadge variante="ordem">B: {resumoEscopo.cntB}</StatusBadge>
          <StatusBadge variante="apoio">C: {resumoEscopo.cntC}</StatusBadge>
          <StatusBadge variante="descontinuado">Fora: {resumoEscopo.fora}</StatusBadge>
        </div>
        <span className="text-[11px] text-zinc-500">
          Itens sem giro ou de apoio (sacola, brinde, amostra, display) ficam fora por padrão.
        </span>
      </div>

      <FilterBar
        busca={busca}
        onBusca={(v) => {
          setBusca(v);
          setMostrarTodos(false);
        }}
        placeholder="Buscar código, produto, código de barras ou endereço..."
      >
        <FiltroSelect
          value={curvaFiltro}
          onChange={setCurvaFiltro}
          opcoes={[
            { valor: 'NA_ABC', rotulo: 'Na Curva ABC (A/B/C)' },
            { valor: 'FORA', rotulo: 'Fora da ABC' },
            { valor: 'ALL', rotulo: 'Curva: Todas (incl. Fora)' },
            { valor: 'A', rotulo: 'Somente Curva A' },
            { valor: 'B', rotulo: 'Somente Curva B' },
            { valor: 'C', rotulo: 'Somente Curva C' },
          ]}
        />
        <FiltroSelect
          value={situacaoAlocFiltro}
          onChange={setSituacaoAlocFiltro}
          opcoes={[
            { valor: 'ALL', rotulo: 'Alocação: Todas' },
            { valor: 'ok', rotulo: 'Alocados (OK)' },
            { valor: 'sem_endereco', rotulo: 'Sem endereço' },
            { valor: 'sem_caixa', rotulo: 'Sem caixa' },
            { valor: 'sem_qtde_cx', rotulo: 'Sem qtde/cx' },
            { valor: 'estoque_acima_capacidade', rotulo: 'Estoque > capacidade' },
            { valor: 'estouro_vao', rotulo: 'Estouro de vão' },
          ]}
        />
        <FiltroSelect
          value={situacaoCatalogo}
          onChange={(val) => {
            setSituacaoCatalogo(val);
            onChangeIncluirInativos(val === 'todos');
          }}
          opcoes={[
            { valor: 'ativos_e_saindo', rotulo: 'Ativos + Saindo' },
            { valor: 'ativos', rotulo: 'Só Ativos' },
            { valor: 'lancamento', rotulo: 'Lançamentos' },
            { valor: 'saindo_de_linha', rotulo: 'Saindo de linha' },
            { valor: 'todos', rotulo: 'Todos (incl. inativos)' },
          ]}
        />
        <FiltroSelect
          value={String(janelaMeses)}
          onChange={(v) => onChangeJanela(Number(v))}
          opcoes={[
            { valor: '12', rotulo: 'Janela: 12 meses' },
            { valor: '6', rotulo: 'Janela: 6 meses' },
            { valor: '3', rotulo: 'Janela: 3 meses' },
          ]}
        />
        <FiltroSelect
          value={metaSelectVal}
          onChange={(v) => {
            if (v === 'linha') onChangeMeta(metaMeses, true);
            else onChangeMeta(Number(v), false);
          }}
          opcoes={[
            { valor: 'linha', rotulo: 'Meta: da Linha' },
            { valor: '1', rotulo: 'Meta: 1 mês' },
            { valor: '2', rotulo: 'Meta: 2 meses' },
            { valor: '3', rotulo: 'Meta: 3 meses' },
            { valor: '4', rotulo: 'Meta: 4 meses' },
          ]}
        />
        {canEdit && (
          <BotaoAcao primario onClick={onAbrirSugestao}>
            <Sparkles className="h-3.5 w-3.5" />
            Sugerir Alocação
          </BotaoAcao>
        )}
      </FilterBar>

      {/* Barra de lote da ABC */}
      {canEdit && selecionados.size > 0 && (
        <div className="rounded-xl border border-zinc-300 bg-zinc-900 text-white p-3 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-2 mr-auto">
            <span className="font-bold">
              {selecionados.size} {selecionados.size === 1 ? 'selecionado' : 'selecionados'}
            </span>
            <button
              type="button"
              onClick={() => setSelecionados(new Set())}
              className="text-zinc-300 hover:text-white underline cursor-pointer"
            >
              Limpar
            </button>
          </div>
          <button
            type="button"
            onClick={() => aplicarAbcEmLote(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold cursor-pointer"
          >
            Incluir na ABC
          </button>
          <button
            type="button"
            onClick={() => aplicarAbcEmLote(false)}
            className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold cursor-pointer"
          >
            Retirar da ABC
          </button>
          <button
            type="button"
            onClick={() => aplicarAbcEmLote(null)}
            className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-semibold cursor-pointer"
          >
            Regra automática
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 px-1">
        <span>
          Exibindo <strong>{visiveis.length}</strong> de <strong>{filtrados.length}</strong> produtos
          {incluirInativos ? ' (incluindo inativos)' : ''}
        </span>
        {filtrados.length > 100 && !mostrarTodos && (
          <button
            type="button"
            onClick={() => setMostrarTodos(true)}
            className="font-bold text-zinc-800 underline cursor-pointer"
          >
            Mostrar todos ({filtrados.length})
          </button>
        )}
      </div>

      {/* Tabela Desktop compacta para 1280px sem overflow */}
      <div className="hidden md:block">
        <TabelaPainel>
          <thead>
            <tr>
              {canEdit && (
                <th className="w-8 text-center">
                  <button
                    type="button"
                    onClick={toggleTodosVisiveis}
                    aria-label="Selecionar todos visíveis"
                    className="p-1 text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  >
                    {todosVisiveisMarcados ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
              )}
              <th>Produto</th>
              <th>Linha</th>
              <th className="text-center">ABC (Linha)</th>
              <th className="text-right whitespace-nowrap">Giro/mês</th>
              <th className="text-center whitespace-nowrap">Caixa / Est.</th>
              <th>Endereços</th>
              <th className="text-center">Elegível ABC</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="text-center py-8 text-zinc-500">
                  Nenhum produto encontrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              visiveis.map((p) => {
                const st = situacaoBadge(p.situacaoAlocacao);
                const enderecos = [...p.enderecosPicking, ...p.enderecosPulmao];
                const marcado = selecionados.has(p.codigo);
                const grupoRotulo =
                  rotuloLinha(linhasConfigs, p.linhaPrefix) || p.nomeLinha;
                return (
                  <tr key={p.codigo} className={marcado ? 'bg-zinc-50' : undefined}>
                    {canEdit && (
                      <td className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${p.codigo}`}
                          checked={marcado}
                          onChange={() => toggleUm(p.codigo)}
                          className="cursor-pointer"
                        />
                      </td>
                    )}
                    <td>
                      <button
                        type="button"
                        onClick={() => onAbrirProduto(p)}
                        className="text-left cursor-pointer hover:underline"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-zinc-900">{p.codigo}</span>
                          {p.ehKit && (
                            <span className="px-1.5 rounded bg-zinc-100 text-zinc-700 text-[10px] font-bold">
                              Kit
                            </span>
                          )}
                          {p.situacao === 'saindo_de_linha' && (
                            <span className="px-1.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                              Saindo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-600 max-w-[230px] truncate">
                          {p.descricao}
                        </div>
                      </button>
                    </td>
                    <td className="text-xs text-zinc-600 max-w-[120px] truncate">
                      {grupoRotulo}
                    </td>
                    <td className="text-center whitespace-nowrap">
                      <StatusBadge variante={abcVariante(p.curvaAbc)}>
                        {p.curvaAbc}
                      </StatusBadge>
                      {p.incluirAbcEfetivo && (
                        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                          {p.percentualAbc.toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono whitespace-nowrap">
                      <div className="font-bold text-zinc-900">{p.mediaTotal.toFixed(1)}</div>
                      <div className="text-[10px] text-zinc-500">
                        {p.mediaVarejo.toFixed(0)}V · {p.mediaAtacado.toFixed(0)}A
                      </div>
                    </td>
                    <td className="text-center font-mono text-xs whitespace-nowrap">
                      <div>
                        {p.caixaCodigo ? `CX ${p.caixaCodigo}` : '—'} ·{' '}
                        {p.qtdeCxEfetiva ?? '—'}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        Est: {p.estoqueCaixas ?? Math.round(p.estoqueAtual)}
                        {p.estoqueCaixas != null ? 'cx' : 'un'}
                      </div>
                    </td>
                    <td>
                      {enderecos.length === 0 ? (
                        <StatusBadge variante={st.variante}>{st.label}</StatusBadge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {p.enderecosPicking.map((e) => (
                            <span
                              key={`pk-${e}`}
                              className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold"
                            >
                              {e}
                            </span>
                          ))}
                          {p.enderecosPulmao.map((e) => (
                            <span
                              key={`pl-${e}`}
                              className="px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono text-[10px] font-bold"
                            >
                              {e}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        disabled={!canEdit || salvandoCodigo === p.codigo}
                        onClick={() => void alternarIndividual(p)}
                        title={
                          p.motivoForaAbc
                            ? `${p.motivoForaAbc} — clique para incluir na ABC`
                            : 'Na ABC — clique para retirar da ABC'
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                          p.incluirAbcEfetivo
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                            : 'bg-zinc-100 text-zinc-600 border-zinc-300 hover:bg-zinc-200'
                        }`}
                      >
                        {salvandoCodigo === p.codigo
                          ? '...'
                          : p.incluirAbcEfetivo
                            ? p.incluirAbcOverride === true
                              ? 'Manual: Sim'
                              : 'Na ABC'
                            : p.incluirAbcOverride === false
                              ? 'Manual: Fora'
                              : 'Fora'}
                      </button>
                      {p.motivoForaAbc && !p.incluirAbcEfetivo && (
                        <div className="text-[10px] text-zinc-400 truncate max-w-[110px] mx-auto mt-0.5">
                          {p.motivoForaAbc}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TabelaPainel>
      </div>

      {/* Cartões Celular */}
      <div className="md:hidden space-y-2">
        {visiveis.length === 0 ? (
          <div className="panel-card p-6 text-center text-xs text-zinc-500">
            Nenhum produto encontrado com os filtros atuais.
          </div>
        ) : (
          visiveis.map((p) => {
            const st = situacaoBadge(p.situacaoAlocacao);
            return (
              <div key={p.codigo} className="panel-card !p-3 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onAbrirProduto(p)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-extrabold text-zinc-900">{p.codigo}</span>
                      <StatusBadge variante={abcVariante(p.curvaAbc)}>{p.curvaAbc}</StatusBadge>
                      <StatusBadge variante={st.variante}>{st.label}</StatusBadge>
                    </div>
                    <div className="font-semibold text-zinc-800 truncate mt-0.5">
                      {p.descricao}
                    </div>
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={salvandoCodigo === p.codigo}
                      onClick={() => void alternarIndividual(p)}
                      className={`px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold border shrink-0 cursor-pointer ${
                        p.incluirAbcEfetivo
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          : 'bg-zinc-100 text-zinc-600 border-zinc-300'
                      }`}
                    >
                      {p.incluirAbcEfetivo ? 'Na ABC' : 'Fora'}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-100 text-[11px] font-mono">
                  <span>
                    Giro: {p.mediaTotal.toFixed(0)}/m ({p.mediaVarejo.toFixed(0)}V/
                    {p.mediaAtacado.toFixed(0)}A)
                  </span>
                  <span>
                    {p.caixaCodigo ? `CX ${p.caixaCodigo}` : 'Sem CX'} · Est.{' '}
                    {p.estoqueCaixas ?? Math.round(p.estoqueAtual)}
                  </span>
                </div>

                {p.enderecosPicking.length === 0 && p.enderecosPulmao.length === 0 ? (
                  <div className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Sem endereço cadastrado
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 text-[11px] font-mono">
                    {p.enderecosPicking.map((e) => (
                      <span
                        key={`mpk-${e}`}
                        className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold"
                      >
                        Pick {e}
                      </span>
                    ))}
                    {p.enderecosPulmao.map((e) => (
                      <span
                        key={`mpl-${e}`}
                        className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold"
                      >
                        Pulm {e}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
