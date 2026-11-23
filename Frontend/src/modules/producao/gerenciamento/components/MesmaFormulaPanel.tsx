import React from 'react';
import { FlaskConical, Plus, CheckCircle2, CalendarCheck } from 'lucide-react';
import { apiFetch, apiJson } from '../../../geral/lib/http';
import { unidadesParaKg, ehBaseProduto } from '../../lib/unitConversion';

export interface ProdutoMesmaFormula {
  codigo: string;
  descricao: string;
  base?: string | null;
  base_codigo?: string | null;
  unidade?: string;
  estoque?: number;
  pedidos_aberto?: number;
  estoque_futuro?: number;
  media_vendas?: number;
  producao_recomendada?: number;
  status?: string;
  status_label?: string;
  status_produto?: string | null;
  na_fila?: boolean;
  planejado_semana?: boolean;
}

export async function carregarMesmaFormula(codigo: string): Promise<ProdutoMesmaFormula[]> {
  const res = await apiFetch(`/producao/produtos-mesma-formulacao/${encodeURIComponent(codigo.trim())}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function enviarProdutoMesmaFormulaParaFila(item: ProdutoMesmaFormula): Promise<void> {
  const isBase = ehBaseProduto(item);
  const qtd = (item.producao_recomendada ?? 0) > 0 ? Number(item.producao_recomendada) : 100;
  const kg = isBase ? qtd : unidadesParaKg(qtd, item.descricao, false);
  await apiJson('/producao/fila-demandas?confirmar=true', {
    method: 'POST',
    body: JSON.stringify({
      codigoProduto: item.codigo,
      descricao: item.descricao,
      quantidade: qtd,
      unidade: isBase ? 'kg' : 'un',
      quantidadeKg: kg == null ? null : Math.round(kg * 10) / 10,
      origemDemanda: 'sugestao_estoque',
      baseCodigo: item.base_codigo ?? null,
      baseNome: item.base ?? null,
    }),
  });
  window.dispatchEvent(new Event('natum:refresh-acompanhamento'));
}

function statusProdutoBadge(statusProduto?: string | null) {
  switch (statusProduto) {
    case 'lancamento':
      return { rotulo: 'Lançamento', classe: 'bg-zinc-100 text-zinc-800 border-zinc-300' };
    case 'saindo_de_linha':
      return { rotulo: 'Saindo de linha', classe: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'descontinuado':
      return { rotulo: 'Descontinuado', classe: 'bg-zinc-100 text-zinc-500 border-zinc-200' };
    case 'terceirizado':
      return { rotulo: 'Terceirizado', classe: 'bg-zinc-100 text-zinc-600 border-zinc-200' };
    default:
      return null;
  }
}

interface MesmaFormulaPanelProps {
  itens: ProdutoMesmaFormula[];
  loading: boolean;
  podeEditar: boolean;
  enviandoCodigo?: string | null;
  erro?: string | null;
  onAbrirProduto?: (codigo: string) => void;
  onEnviarFila?: (item: ProdutoMesmaFormula) => void;
}

export function MesmaFormulaPanel({
  itens,
  loading,
  podeEditar,
  enviandoCodigo,
  erro,
  onAbrirProduto,
  onEnviarFila,
}: MesmaFormulaPanelProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-150 text-left">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-150 pb-2.5">
        <div className="flex items-start gap-2">
          <FlaskConical className="h-4 w-4 text-zinc-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-extrabold text-sm text-zinc-900">Produtos com a mesma formulação</h4>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Mesmas matérias-primas e proporções — úteis para aproveitar a mesma batelada no planejamento semanal.
            </p>
          </div>
        </div>
      </div>

      {erro && (
        <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold">
          {erro}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-zinc-400 py-4">Buscando produtos com a mesma formulação...</p>
      ) : itens.length === 0 ? (
        <p className="text-xs text-zinc-400 py-4">
          Nenhum outro produto compartilha exatamente esta mesma formulação.
        </p>
      ) : (
        <>
          {/* Desktop: tabela enxuta */}
          <div className="hidden md:block bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 font-bold text-zinc-600 border-b border-zinc-200 text-[11px]">
                <tr>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2 text-right">Estoque</th>
                  <th className="px-3 py-2 text-right">Média/mês</th>
                  <th className="px-3 py-2 text-right">EFP</th>
                  <th className="px-3 py-2 text-right">Sugestão</th>
                  <th className="px-3 py-2 text-right">Fila</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {itens.map((item) => {
                  const efp = item.estoque_futuro ?? item.estoque ?? 0;
                  const recom = item.producao_recomendada ?? 0;
                  const inativo = item.status_produto === 'descontinuado' || item.status_produto === 'terceirizado';
                  const spBadge = statusProdutoBadge(item.status_produto);
                  const unidade = item.unidade || 'UN';

                  return (
                    <tr key={item.codigo} className={`hover:bg-zinc-50/70 ${inativo ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2.5">
                        {onAbrirProduto ? (
                          <button
                            type="button"
                            onClick={() => onAbrirProduto(item.codigo)}
                            className="font-bold text-zinc-900 hover:underline text-left cursor-pointer bg-transparent border-none p-0 block"
                            title={`Abrir detalhes de ${item.codigo}`}
                          >
                            {item.descricao}
                          </button>
                        ) : (
                          <div className="font-bold text-zinc-900">{item.descricao}</div>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-zinc-500">{item.codigo}</span>
                          {item.base && (
                            <span className="px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 text-[10px]">
                              Base: {item.base}
                            </span>
                          )}
                          {spBadge && (
                            <span className={`px-1.5 py-0.2 rounded border text-[10px] font-semibold ${spBadge.classe}`}>
                              {spBadge.rotulo}
                            </span>
                          )}
                          {item.planejado_semana && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                              <CalendarCheck size={10} />
                              Planejado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        <div className="font-bold text-zinc-900">
                          {(item.estoque ?? 0).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">{unidade}</span>
                        </div>
                        {(item.pedidos_aberto ?? 0) > 0 && (
                          <div className="text-[10px] text-amber-700 font-semibold">
                            Ped: {(item.pedidos_aberto ?? 0).toLocaleString('pt-BR')}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-zinc-600">
                        {Math.round(item.media_vendas ?? 0).toLocaleString('pt-BR')}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono font-bold ${efp < 0 ? 'text-red-600' : 'text-zinc-900'}`}>
                        {efp.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {recom > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                            {recom.toLocaleString('pt-BR')}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {item.na_fila ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 text-white text-[10px] font-bold">
                            <CheckCircle2 size={11} />
                            Na fila
                          </span>
                        ) : podeEditar && onEnviarFila && !inativo ? (
                          <button
                            type="button"
                            disabled={enviandoCodigo === item.codigo}
                            onClick={() => onEnviarFila(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-100 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                          >
                            <Plus size={12} />
                            {enviandoCodigo === item.codigo ? 'Enviando...' : 'Fila'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: cartões sem rolagem horizontal */}
          <div className="md:hidden space-y-2">
            {itens.map((item) => {
              const efp = item.estoque_futuro ?? item.estoque ?? 0;
              const recom = item.producao_recomendada ?? 0;
              const inativo = item.status_produto === 'descontinuado' || item.status_produto === 'terceirizado';
              const spBadge = statusProdutoBadge(item.status_produto);
              const unidade = item.unidade || 'UN';

              return (
                <div
                  key={item.codigo}
                  className={`p-3 rounded-xl border border-zinc-200 bg-white space-y-2 ${inativo ? 'opacity-65' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    {onAbrirProduto ? (
                      <button
                        type="button"
                        onClick={() => onAbrirProduto(item.codigo)}
                        className="font-bold text-xs text-zinc-900 text-left hover:underline cursor-pointer bg-transparent border-none p-0 min-h-11 flex items-center"
                      >
                        {item.descricao}
                      </button>
                    ) : (
                      <div className="font-bold text-xs text-zinc-900">{item.descricao}</div>
                    )}
                    <span className="font-mono text-[11px] text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded shrink-0">
                      {item.codigo}
                    </span>
                  </div>

                  {(spBadge || item.planejado_semana || item.base) && (
                    <div className="flex flex-wrap items-center gap-1 text-[11px]">
                      {item.base && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                          Base: {item.base}
                        </span>
                      )}
                      {spBadge && (
                        <span className={`px-1.5 py-0.5 rounded border font-semibold ${spBadge.classe}`}>
                          {spBadge.rotulo}
                        </span>
                      )}
                      {item.planejado_semana && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                          <CalendarCheck size={11} />
                          Planejado
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 bg-zinc-50 rounded-lg p-2 border border-zinc-200/70 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block">Estoque / Pedidos</span>
                      <strong className="font-mono text-zinc-900">
                        {(item.estoque ?? 0).toLocaleString('pt-BR')} {unidade}
                        {(item.pedidos_aberto ?? 0) > 0 ? ` · Ped ${item.pedidos_aberto}` : ''}
                      </strong>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Média/mês</span>
                      <strong className="font-mono text-zinc-900">
                        {Math.round(item.media_vendas ?? 0).toLocaleString('pt-BR')} {unidade}
                      </strong>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">EFP</span>
                      <strong className={`font-mono ${efp < 0 ? 'text-red-600' : 'text-zinc-900'}`}>
                        {efp.toLocaleString('pt-BR')} {unidade}
                      </strong>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Sugestão</span>
                      <strong className={`font-mono ${recom > 0 ? 'text-amber-800' : 'text-zinc-500'}`}>
                        {recom > 0 ? `${recom.toLocaleString('pt-BR')} ${unidade}` : '—'}
                      </strong>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    {item.na_fila ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-bold">
                        <CheckCircle2 size={13} />
                        Na fila
                      </span>
                    ) : podeEditar && onEnviarFila && !inativo ? (
                      <button
                        type="button"
                        disabled={enviandoCodigo === item.codigo}
                        onClick={() => onEnviarFila(item)}
                        className="inline-flex items-center gap-1 px-3 min-h-11 rounded-lg border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-100 text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        <Plus size={14} />
                        {enviandoCodigo === item.codigo ? 'Enviando...' : 'Adicionar à fila'}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
