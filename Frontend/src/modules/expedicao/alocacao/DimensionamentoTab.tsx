import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import {
  BotaoAcao,
  FilterBar,
  FiltroSelect,
  StatusBadge,
  TabelaPainel,
  type VarianteBadge,
} from '../../geral/components/ui/ReportKit';
import {
  agruparLinhas,
  prefixosDaLinha,
  rotuloLinha,
  type LinhaBase,
} from '../../geral/lib/linhas';
import type { ProdutoDimensao } from './types';

interface DimensionamentoTabProps {
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
  onFiltroProdutosChange?: (filtrados: ProdutoDimensao[]) => void;
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

export function DimensionamentoTab({
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
  onFiltroProdutosChange,
}: DimensionamentoTabProps) {
  const [busca, setBusca] = useState('');
  const [linhaFiltro, setLinhaFiltro] = useState('ALL');
  const [curvaFiltro, setCurvaFiltro] = useState('ALL');
  const [situacaoAlocFiltro, setSituacaoAlocFiltro] = useState('ALL');
  const [situacaoCatalogo, setSituacaoCatalogo] = useState('ativos_e_saindo');
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const opcoesLinhas = useMemo(() => {
    const presentesSet = new Set(produtos.map((p) => p.linhaPrefix));
    const presentes = linhasConfigs.filter((c) =>
      prefixosDaLinha(linhasConfigs, c.linha_prefix).some((x) => presentesSet.has(x)),
    );
    const ordenadas = agruparLinhas(presentes).map((g) => g.linha.linha_prefix);
    const fora = Array.from(presentesSet)
      .filter((k) => !ordenadas.includes(k))
      .sort();
    return [...ordenadas, ...fora].map((prefix) => ({
      valor: prefix,
      rotulo:
        rotuloLinha(linhasConfigs, prefix) === prefix
          ? produtos.find((p) => p.linhaPrefix === prefix)?.nomeLinha ?? prefix
          : rotuloLinha(linhasConfigs, prefix),
    }));
  }, [produtos, linhasConfigs]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const prefixosPermitidos =
      linhaFiltro === 'ALL' ? null : new Set(prefixosDaLinha(linhasConfigs, linhaFiltro));

    return produtos.filter((p) => {
      if (prefixosPermitidos && !prefixosPermitidos.has(p.linhaPrefix)) return false;
      if (curvaFiltro !== 'ALL' && p.curvaAbc !== curvaFiltro) return false;
      if (situacaoAlocFiltro !== 'ALL' && p.situacaoAlocacao !== situacaoAlocFiltro) {
        return false;
      }
      if (situacaoCatalogo === 'ativos' && p.situacao !== 'ativo') return false;
      if (situacaoCatalogo === 'lancamento' && p.situacao !== 'lancamento') return false;
      if (situacaoCatalogo === 'saindo_de_linha' && p.situacao !== 'saindo_de_linha') {
        return false;
      }
      if (
        situacaoCatalogo === 'ativos_e_saindo' &&
        p.situacao === 'descontinuado'
      ) {
        return false;
      }
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
    busca,
    linhaFiltro,
    curvaFiltro,
    situacaoAlocFiltro,
    situacaoCatalogo,
    linhasConfigs,
  ]);

  useEffect(() => {
    onFiltroProdutosChange?.(filtrados);
  }, [filtrados, onFiltroProdutosChange]);

  const visiveis = mostrarTodos ? filtrados : filtrados.slice(0, 100);
  const metaSelectVal = usarMetaLinha ? 'linha' : String(metaMeses);

  return (
    <div className="space-y-2.5">
      <FilterBar
        busca={busca}
        onBusca={(v) => {
          setBusca(v);
          setMostrarTodos(false);
        }}
        placeholder="Buscar por código, produto, código de barras ou endereço (A1, B7)..."
      >
        <FiltroSelect
          value={linhaFiltro}
          onChange={setLinhaFiltro}
          opcoes={[{ valor: 'ALL', rotulo: 'Todas as linhas' }, ...opcoesLinhas]}
        />
        <FiltroSelect
          value={curvaFiltro}
          onChange={setCurvaFiltro}
          opcoes={[
            { valor: 'ALL', rotulo: 'Curva: Todas' },
            { valor: 'A', rotulo: 'Curva A' },
            { valor: 'B', rotulo: 'Curva B' },
            { valor: 'C', rotulo: 'Curva C' },
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

      {/* Tabela Desktop */}
      <div className="hidden md:block">
        <TabelaPainel>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Linha</th>
              <th className="text-center">ABC</th>
              <th className="text-right whitespace-nowrap">Demanda/mês</th>
              <th className="text-center whitespace-nowrap">Caixa / Qtde</th>
              <th>Endereços</th>
              <th className="text-right whitespace-nowrap">Cap. Aloc.</th>
              <th className="text-right whitespace-nowrap">Estoque</th>
              <th className="text-center">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-zinc-500">
                  Nenhum produto encontrado com os filtros atuais.
                </td>
              </tr>
            ) : (
              visiveis.map((p) => {
                const st = situacaoBadge(p.situacaoAlocacao);
                const enderecos = [...p.enderecosPicking, ...p.enderecosPulmao];
                return (
                  <tr
                    key={p.codigo}
                    onClick={() => onAbrirProduto(p)}
                    className="cursor-pointer hover:bg-zinc-50 transition-colors"
                  >
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-zinc-900">{p.codigo}</span>
                        {p.ehKit && (
                          <span className="px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 text-[10px] font-bold">
                            Kit
                          </span>
                        )}
                        {p.situacao === 'saindo_de_linha' && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            Saindo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-600 max-w-[180px] truncate">
                        {p.descricao}
                      </div>
                    </td>
                    <td className="text-xs text-zinc-600 max-w-[110px] truncate">
                      {rotuloLinha(linhasConfigs, p.linhaPrefix) || p.nomeLinha}
                    </td>
                    <td className="text-center">
                      <StatusBadge
                        variante={
                          p.curvaAbc === 'A'
                            ? 'saudavel'
                            : p.curvaAbc === 'B'
                              ? 'ordem'
                              : 'apoio'
                        }
                      >
                        {p.curvaAbc}
                      </StatusBadge>
                    </td>
                    <td className="text-right font-mono whitespace-nowrap">
                      <div className="font-bold text-zinc-900">{p.mediaTotal.toFixed(1)}</div>
                      <div className="text-[10px] text-zinc-500">
                        {p.mediaVarejo.toFixed(0)}V · {p.mediaAtacado.toFixed(0)}A
                      </div>
                    </td>
                    <td className="text-center font-mono text-xs whitespace-nowrap">
                      <div>{p.caixaCodigo ? `CX ${p.caixaCodigo}` : '—'}</div>
                      <div className="text-[10px] text-zinc-500">
                        {p.qtdeCxEfetiva ? `${p.qtdeCxEfetiva}/cx` : 's/ qtde'}
                      </div>
                    </td>
                    <td>
                      {enderecos.length === 0 ? (
                        <span className="text-zinc-400 text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {p.enderecosPicking.map((e) => (
                            <span
                              key={`pk-${e}`}
                              className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold"
                              title="Picking"
                            >
                              {e}
                            </span>
                          ))}
                          {p.enderecosPulmao.map((e) => (
                            <span
                              key={`pl-${e}`}
                              className="px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono text-[10px] font-bold"
                              title="Pulmão"
                            >
                              {e}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {p.totalCaixasAlocadas > 0 ? (
                        <>
                          <div className="font-bold text-zinc-900">
                            {p.totalCaixasAlocadas} cx
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {p.totalUnidadesAlocadas.toLocaleString('pt-BR')} un
                            {p.coberturaMesesAlocada != null
                              ? ` · ${p.coberturaMesesAlocada.toFixed(1)}m`
                              : ''}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-right font-mono text-xs whitespace-nowrap">
                      <div>{Math.round(p.estoqueAtual).toLocaleString('pt-BR')} un</div>
                      {p.estoqueCaixas != null && (
                        <div className="text-[10px] text-zinc-500">{p.estoqueCaixas} cx</div>
                      )}
                    </td>
                    <td className="text-center">
                      <StatusBadge variante={st.variante}>{st.label}</StatusBadge>
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
              <button
                key={p.codigo}
                type="button"
                onClick={() => onAbrirProduto(p)}
                className="w-full text-left panel-card !p-3 space-y-2 min-h-[44px] cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-extrabold text-zinc-900">
                        {p.codigo}
                      </span>
                      <StatusBadge
                        variante={
                          p.curvaAbc === 'A'
                            ? 'saudavel'
                            : p.curvaAbc === 'B'
                              ? 'ordem'
                              : 'apoio'
                        }
                      >
                        {p.curvaAbc}
                      </StatusBadge>
                      <StatusBadge variante={st.variante}>{st.label}</StatusBadge>
                    </div>
                    <div className="text-xs font-semibold text-zinc-800 truncate mt-0.5">
                      {p.descricao}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                  {p.enderecosPicking.map((e) => (
                    <span
                      key={`mpk-${e}`}
                      className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold"
                    >
                      Pick: {e}
                    </span>
                  ))}
                  {p.enderecosPulmao.map((e) => (
                    <span
                      key={`mpl-${e}`}
                      className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold"
                    >
                      Pulm: {e}
                    </span>
                  ))}
                  {p.enderecosPicking.length === 0 && p.enderecosPulmao.length === 0 && (
                    <span className="text-amber-700 font-semibold flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Sem endereço
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-100 text-[11px]">
                  <div>
                    <div className="text-zinc-400">Média/mês</div>
                    <div className="font-mono font-bold text-zinc-900">
                      {p.mediaTotal.toFixed(0)} ({p.mediaVarejo.toFixed(0)}V/{p.mediaAtacado.toFixed(0)}A)
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-400">Caixa / Qtde</div>
                    <div className="font-mono font-bold text-zinc-900">
                      {p.caixaCodigo ? `CX ${p.caixaCodigo}` : '—'} · {p.qtdeCxEfetiva ?? '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-zinc-400">Est. / Cap.</div>
                    <div className="font-mono font-bold text-zinc-900">
                      {p.estoqueCaixas ?? '—'} / {p.totalCaixasAlocadas} cx
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
