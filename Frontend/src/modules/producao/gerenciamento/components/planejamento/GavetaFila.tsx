import React from 'react';
import { Package, BookOpen, Plus, Trash2, Search, Info } from 'lucide-react';
import { eBase } from '../../../../geral/lib/regrasProduto';
import { getProductProcessType } from '../../../lib/processoProduto';

export type AbaFila = 'disponiveis' | 'falta' | 'bases';

export interface DadosFila {
  filaCardRef: React.RefObject<HTMLDivElement | null>;
  filaAltura: number | null;
  demandCandidates: any[];
  demandVisiveis: any[];
  qtdDisponiveis: number;
  qtdAguardandoInsumo: number;
  filaDemandas: any[];
  basesResumo: any[];
  basesVisiveis: any[];
  produtoPorCodigo: Map<string, any>;
}

export interface BuscaFila {
  filaAba: AbaFila;
  setFilaAba: (aba: AbaFila) => void;
  demandSearch: string;
  setDemandSearch: (v: string) => void;
  basesBusca: string;
  setBasesBusca: (v: string) => void;
}

export interface AcoesFila {
  setRegrasAberto: (v: boolean) => void;
  setAdicionarFila: (v: { codigo?: string; qtdKg?: number } | null) => void;
  setLimparFilaAberto: (v: boolean) => void;
  setRetirarFilaId: (id: string | null) => void;
  setCoberturaAberta: (v: boolean) => void;
  setDraggedDrawerProduct: (v: any | null) => void;
  setDragOverCell: (v: { reatorId: string; dateStr: string } | null) => void;
  handleShowProductDetails: (code: string) => void;
  handleOpenScheduleModal: (product: any | null, targetDate?: string, targetReator?: string) => void;
  handleFixarNaFila: (prod: any) => void;
}

interface GavetaFilaProps {
  fila: DadosFila;
  busca: BuscaFila;
  acoes: AcoesFila;
  podeEditar: boolean;
}

/** Gaveta lateral: Banco de Demandas (fila do PCP, itens aguardando insumos e bases). */
export function GavetaFila({ fila, busca, acoes, podeEditar }: GavetaFilaProps) {
  const {
    filaCardRef, filaAltura, demandCandidates, demandVisiveis, qtdDisponiveis, qtdAguardandoInsumo, filaDemandas, basesResumo, basesVisiveis, produtoPorCodigo,
  } = fila;
  const { filaAba, setFilaAba, demandSearch, setDemandSearch, basesBusca, setBasesBusca } = busca;
  const {
    setRegrasAberto, setAdicionarFila, setLimparFilaAberto, setRetirarFilaId, setCoberturaAberta, setDraggedDrawerProduct, setDragOverCell,
    handleShowProductDetails, handleOpenScheduleModal, handleFixarNaFila,
  } = acoes;

  return (
    <div
      ref={filaCardRef}
      style={filaAltura ? { height: filaAltura } : undefined}
      className="order-first lg:order-none w-full lg:w-[420px] bg-white rounded-xl border border-zinc-200 shadow-xs flex flex-col min-h-0 max-h-[85dvh] lg:max-h-none lg:h-[750px] shrink-0 lg:sticky top-3 lg:self-start"
    >
      {/* Cabeçalho da Gaveta */}
      <div className="p-3 border-b border-zinc-200 flex flex-col gap-2 bg-zinc-50/70 rounded-t-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Package size={16} className="text-zinc-700" />
            <h3 className="font-bold text-zinc-900 text-xs">Fila de Demandas</h3>
          </div>
          <span className="px-2 py-0.5 bg-zinc-900 text-white font-bold text-[11px] md:text-[10px] rounded-full">
            {demandCandidates.length} itens na fila
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRegrasAberto(true)}
            className="flex items-center gap-1 px-2.5 py-1 max-md:min-h-11 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            title="Regras gerais do planejamento (também lidas pelo agente de IA)"
          >
            <BookOpen size={12} />
            Regras
          </button>
        {podeEditar && (
          <>
            <button
              type="button"
              onClick={() => setAdicionarFila({})}
              className="flex items-center gap-1 px-2.5 py-1 max-md:min-h-11 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              <Plus size={12} />
              Adicionar item
            </button>
            <button
              type="button"
              disabled={filaDemandas.length === 0}
              onClick={() => setLimparFilaAberto(true)}
              className="flex items-center gap-1 px-2.5 py-1 max-md:min-h-11 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Apaga todos os itens da fila (pede o motivo)"
            >
              <Trash2 size={12} />
              Limpar fila
            </button>
          </>
        )}
        </div>

        {/* Abas */}
        <div className="flex flex-wrap items-center gap-1">
          {([['disponiveis', 'Disponíveis', String(qtdDisponiveis)], ['falta', 'Aguardando insumos', String(qtdAguardandoInsumo)], ['bases', 'Bases', basesResumo.length > 0 ? String(basesResumo.length) : '']] as const).map(([id, rotulo, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilaAba(id)}
              className={`px-2.5 py-1 max-md:min-h-11 text-[11px] font-bold rounded-md cursor-pointer transition-colors ${filaAba === id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}
            >
              {rotulo}{n !== '' ? ` (${n})` : ''}
            </button>
          ))}
        </div>

        {/* Campo de Busca */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2.5 max-md:top-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder={filaAba === 'bases' ? 'Buscar base por REF ou descrição...' : 'Buscar REF, descrição ou lote na fila...'}
            value={filaAba === 'bases' ? basesBusca : demandSearch}
            onChange={(e) => (filaAba === 'bases' ? setBasesBusca(e.target.value) : setDemandSearch(e.target.value))}
            className="w-full pl-8 pr-3 py-1.5 max-md:min-h-11 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
          />
        </div>
      </div>

      {/* Lista com Scroll e Dados Ricos de PCP */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 divide-y divide-zinc-100">
        {filaAba === 'bases' ? (
          basesVisiveis.length === 0 ? (
            <div className="py-8 text-center text-zinc-400 text-xs">Nenhuma base encontrada.</div>
          ) : (
            basesVisiveis.map((b: any) => {
              const estoqueBase = Number(produtoPorCodigo.get(b.codigo)?.estoque ?? 0);
              const necessidade = Number(b.demanda_total_kg) || 0;
              return (
                <div key={b.codigo} className="py-2.5 px-2 flex flex-col gap-1.5 hover:bg-zinc-50 transition-colors">
                  <div className="flex items-start justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleShowProductDetails(b.codigo)}
                      className="font-bold text-zinc-900 text-xs leading-snug line-clamp-2 text-left hover:underline cursor-pointer bg-transparent border-none p-0"
                    >
                      {b.descricao}
                    </button>
                    <span className="font-mono text-[11px] md:text-[10px] text-zinc-600 font-semibold bg-zinc-100 px-1 py-0.5 rounded shrink-0">{b.codigo}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px] md:text-[10px]">
                    <div className="flex flex-col">
                      <span className="text-zinc-500 text-[11px] md:text-[9px]">Estoque</span>
                      <strong className="text-zinc-900">{Math.round(estoqueBase).toLocaleString('pt-BR')} kg</strong>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-zinc-500 text-[11px] md:text-[9px]">Na fila</span>
                      <strong className="text-zinc-900">{b.na_fila ? `${Number(b.fila_qtd_kg || 0).toLocaleString('pt-BR')} kg` : '—'}</strong>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-zinc-500 text-[11px] md:text-[9px]">Em ordens</span>
                      <strong className="text-zinc-900">{b.planejado_semana ? `${Number(b.planejado_kg || 0).toLocaleString('pt-BR')} kg` : '—'}</strong>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-zinc-500 text-[11px] md:text-[9px]">Necessidade</span>
                      <strong className={necessidade > 0 ? 'text-amber-800' : 'text-zinc-900'}>{necessidade > 0 ? `${Math.round(necessidade).toLocaleString('pt-BR')} kg` : '—'}</strong>
                    </div>
                  </div>
                  {podeEditar && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setAdicionarFila({
                          codigo: b.codigo,
                          qtdKg: Number(b.sugestao_base_kg) > 0 ? Math.ceil(Number(b.sugestao_base_kg)) : (Number(b.lote_padrao_kg) || 200),
                        })}
                        className="flex items-center gap-1 px-2.5 py-1 max-md:min-h-11 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                      >
                        <Plus size={12} />
                        {b.na_fila ? 'Ajustar na fila' : 'Enviar à fila'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : demandVisiveis.length === 0 ? (
          <div className="py-8 text-center text-zinc-400 text-xs">
            {filaAba === 'falta' ? 'Nenhum item da fila está aguardando insumos.' : 'Nenhum item disponível com os insumos cobertos.'}
          </div>
        ) : (
          demandVisiveis.map(prod => {
            const efp = prod.estoque_futuro_com_producao ?? prod.estoque_futuro ?? 0;
            const isCritico = efp < 0 || prod.status === 'critico';
            const isProgramada = prod.is_producao_programada === 1 || prod.is_producao_programada === true;
            const isBase = eBase(prod.codigo, prod.categoria_produto, prod.status_produto);
            const procInfo = getProductProcessType(prod);
            const mediaVendas = prod.media_vendas || prod.media_manual || 0;
            const qtdRecomendada = prod.producao_recomendada || 0;
            const estoqueFisico = prod.estoque || 0;
            const pedidosAberto = prod.pedidos_aberto || 0;
            // 999+ = sem consumo (sem venda média): não há cobertura em dias para mostrar
            const coberturaDias = prod.duracao_dias !== undefined && prod.duracao_dias !== null && Number.isFinite(Number(prod.duracao_dias)) && Number(prod.duracao_dias) < 900
              ? Math.round(prod.duracao_dias) 
              : null;

            return (
              <div 
                key={prod._filaId ? `fila_${prod._filaId}` : prod.codigo} 
                draggable={podeEditar}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', prod.codigo);
                  e.dataTransfer.effectAllowed = 'copy';
                  setDraggedDrawerProduct(prod);
                }}
                onDragEnd={() => {
                  setDraggedDrawerProduct(null);
                  setDragOverCell(null);
                }}
                className={`py-2.5 px-2 flex flex-col gap-2 hover:bg-zinc-50 border-b border-zinc-100 transition-colors cursor-grab active:cursor-grabbing select-none ${
                  isBase ? 'bg-amber-50/20' : ''
                }`}
                title="Arraste este produto para uma célula do quadro para agendar"
              >
                {/* 1. Descrição e Código com visualização de detalhes */}
                <div className="flex items-start justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShowProductDetails(prod.codigo);
                    }}
                    className="font-bold text-zinc-900 text-xs leading-snug line-clamp-2 text-left hover:underline hover:text-zinc-700 cursor-pointer bg-transparent border-none p-0"
                    title={`Ver detalhes de ${prod.descricao}`}
                  >
                    {prod.descricao}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShowProductDetails(prod.codigo);
                    }}
                    className="font-mono text-[11px] md:text-[10px] text-zinc-600 font-semibold bg-zinc-100 hover:bg-zinc-200 hover:text-zinc-900 px-1 py-0.5 rounded shrink-0 cursor-pointer transition-colors"
                    title={`Ver detalhes do produto ${prod.codigo}`}
                  >
                    {prod.codigo}
                  </button>
                </div>

                {/* 2. Badges Relevantes (Batelada Conjunta, Base de Fabricação, Programada) */}
                {((Array.isArray((prod as any)._batchSiblings) && (prod as any)._batchSiblings.length > 1) || isBase || isProgramada || prod.base) && (
                  <div className="flex flex-wrap items-center gap-1 text-[11px] md:text-[10px]">
                    {Array.isArray((prod as any)._batchSiblings) && (prod as any)._batchSiblings.length > 1 && (
                      <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-800 border border-zinc-300 font-mono text-[11px] md:text-[9px] font-bold rounded">
                        Batelada Conjunta Sugerida ({(prod as any)._batchSiblings.length} SKUs • {(prod as any)._totalBatchKg} kg)
                      </span>
                    )}

                    {isBase && (
                      <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-800 border border-zinc-300 text-[11px] md:text-[9px] font-bold rounded">
                        Base de Fabricação
                      </span>
                    )}

                    {isProgramada && (
                      <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-800 border border-zinc-200 text-[11px] md:text-[9px] font-bold rounded">
                        Programada
                      </span>
                    )}

                    {prod.base && (
                      <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-700 border border-zinc-200 text-[11px] md:text-[9px] rounded truncate max-w-[140px]" title={`Base: ${prod.base}`}>
                        Base: {prod.base}
                      </span>
                    )}
                  </div>
                )}

                {/* 3. Painel de Métricas de Venda & Produção Solicitadas por Edson */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 bg-zinc-50/90 p-2 rounded-lg border border-zinc-200/70 text-[11px] md:text-[10px]">
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-[11px] md:text-[9px] block">Média Vendas:</span>
                    <span className="font-bold text-zinc-900 text-xs mt-0.5">
                      {isBase ? 'Semi-acabado' : `${Math.round(mediaVendas).toLocaleString('pt-BR')} un/mês`}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-[11px] md:text-[9px] block">Qtd. Recom.:</span>
                    <span className="font-bold text-zinc-700 text-xs mt-0.5">
                      {isBase 
                        ? `${(qtdRecomendada || procInfo.reqQtyKg).toLocaleString('pt-BR')} kg`
                        : `${qtdRecomendada.toLocaleString('pt-BR')} un`}
                    </span>
                    {!isBase && (
                      <span className="text-[11px] md:text-[9px] text-zinc-500 font-semibold" title={`Equivalente a ${procInfo.reqQtyKg} kg em massa a granel`}>
                        (~{procInfo.reqQtyKg} kg)
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-zinc-500 text-[11px] md:text-[9px] block">{isBase ? 'Estoque Atual:' : 'Estoque Futuro:'}</span>
                    <span className={`font-bold text-xs mt-0.5 ${isCritico && !isBase ? 'text-red-600' : 'text-emerald-700'}`}>
                      {isBase ? `${Math.round(estoqueFisico).toLocaleString('pt-BR')} kg` : `${efp.toLocaleString('pt-BR')} un`}
                    </span>
                  </div>
                </div>

                {/* 4. Linha de Apoio: Estoque Físico, Pedidos em Aberto e Cobertura */}
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] md:text-[10px] text-zinc-500 px-0.5">
                  <div className="flex flex-wrap items-center gap-x-1.5">
                    <span>Estoque: <strong className="text-zinc-700">{estoqueFisico.toLocaleString('pt-BR')}</strong></span>
                    <span>•</span>
                    <span>Pedidos: <strong className={pedidosAberto > 0 ? "text-amber-800 font-bold" : "text-zinc-700"}>{pedidosAberto.toLocaleString('pt-BR')}</strong></span>
                    <span>•</span>
                    <span>Cobertura: <strong className="text-zinc-700">{coberturaDias !== null ? `${coberturaDias}d` : '—'}</strong></span>
                  </div>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 text-[11px] md:text-[9px] font-bold rounded border ${prod._automatica ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : 'bg-zinc-900 text-white border-zinc-900'}`}
                    title={prod._automatica ? 'Calculado pela Demanda de Produção (acaba antes, primeiro). Fixe para virar item manual.' : 'Item manual da fila'}
                  >
                    {prod._automatica ? 'Automático' : 'Manual'}
                  </span>
                </div>
                {prod._situacao === 'aguardando_insumos' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCoberturaAberta(true); }}
                    className="text-left px-2 py-1 rounded-md border border-red-200 bg-red-50 text-red-700 text-[11px] md:text-[10px] font-semibold cursor-pointer"
                    title="Ver cobertura de insumos da semana"
                  >
                    {prod._motivoSituacao
                      ? prod._motivoSituacao
                      : `Falta: ${(prod._falta as any[]).slice(0, 3).map(f => `${f.descricao || f.codigo} (${Number(f.falta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${f.unidade ? ` ${f.unidade}` : ''})`).join(', ')}${(prod._falta as any[]).length > 3 ? ` e mais ${(prod._falta as any[]).length - 3}` : ''}`}
                  </button>
                )}

                {/* 5. Ação de Agendamento e Ver Detalhes */}
                <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShowProductDetails(prod.codigo);
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer py-1 px-1.5 max-md:min-h-11 rounded hover:bg-zinc-100"
                    title="Ver detalhes completos do produto"
                  >
                    <Info size={13} className="text-zinc-500" />
                    <span>Ver Detalhes</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5">
                  {podeEditar && (prod as any)._filaId && (
                    <button
                      type="button"
                      onClick={() => setRetirarFilaId(String((prod as any)._filaId))}
                      className="px-2.5 py-1 max-md:min-h-11 text-xs font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                      title="Tirar este item da fila"
                    >
                      Tirar
                    </button>
                  )}
                  {podeEditar && prod._automatica && (
                    <button
                      type="button"
                      onClick={() => handleFixarNaFila(prod)}
                      className="px-2.5 py-1 max-md:min-h-11 text-xs font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                      title="Fixar este item na fila (vira item manual)"
                    >
                      Fixar na fila
                    </button>
                  )}
                  {podeEditar && (
                  <button
                    onClick={() => handleOpenScheduleModal(prod)}
                    className="flex items-center gap-1 px-3 py-1 max-md:min-h-11 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-xs bg-zinc-900 hover:bg-zinc-800 text-white"
                  >
                    <Plus size={13} />
                    <span>Agendar</span>
                  </button>
                  )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
