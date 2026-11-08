import SeletorKit from './SeletorKit';
import { rotuloConteudo } from '../lib/viraPackaging';
import Drawer from '../../geral/components/ui/Drawer';
import { usePreviaServidor, mensagemErroServidor } from '../lib/usePreviaServidor';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, Search, RefreshCw, Layers, ClipboardList, PlusCircle, Trash2, 
  CheckCircle2, Printer, X, Eye, CheckCircle, ExternalLink, Calendar, User, FileText, Settings, AlertTriangle,
  UploadCloud, Plus
} from 'lucide-react';
import {
  formatQtyPerKitLabel,
  kitComponentNeedQty,
  kitOrderComponentNeed,
} from '../lib/kitComponentQty';
import {
  linesFromPreview,
  parsePackagingDeductions,
  serializePackagingDeductions,
  splitPackagingLines,
  type PackagingPreviewResponse,
  type ViraPackagingLine,
} from '../lib/viraPackaging';

export default function DrawerNovaOrdemConversao({ ctx }: { ctx: any }) {
  const { escolherOrigemConversao, escolherDestinoConversao, viraVariacoes, viraConteudoOrigem, loadingVariacoes, viraEmbalagensFonte, newViraBaixaOrigem, setNewViraBaixaOrigem, newViraFormula, products, viraComposicao, parConversaoExistente, newViraDeCodigo, newViraParaCodigo, handleDeleteViraComposicao, handleCreateViraOrder, loadingViraPackaging, newViraFator, newViraMotivo, newViraOrderNotes, newViraOrderNumber, newViraPackagingLines, newViraQtyDe, newViraQtyPara, newViraQtyParaManual, refreshNewViraPackaging, selectedViraComp, setNewViraFator, setNewViraMotivo, setNewViraOrderNotes, setNewViraOrderNumber, setNewViraPackagingLines, setNewViraQtyDe, setNewViraQtyPara, setNewViraQtyParaManual, setShowNewViraOrderModal, submittingNewViraOrder } = ctx;
  return (
    <>
        <Drawer
          onClose={() => setShowNewViraOrderModal(false)}
          title="Nova Ordem de Conversão"
          subtitle="Troca de um produto por outro (origem → destino)"
          size="lg"
        >
            <form onSubmit={handleCreateViraOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lote da Ordem</label>
                  <input
                    type="text"
                    value={newViraOrderNumber}
                    onChange={(e) => setNewViraOrderNumber(e.target.value)}
                    placeholder="Ex: V-1001"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-semibold text-zinc-900 bg-zinc-50/50"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Produto de origem (o que será convertido)</label>
                <SeletorKit
                  kits={(products || []).map((pr: any) => ({ codigo: pr.codigo, descricao: pr.descricao, estoque: pr.estoque }))}
                  valor={newViraDeCodigo}
                  onChange={(c: string) => void escolherOrigemConversao(c)}
                  placeholder="Digite o código ou o nome do produto de origem…"
                />
                {viraConteudoOrigem != null && (
                  <p className="text-[10px] text-zinc-500">Conteúdo por unidade (pela formulação): <b className="text-zinc-800">{rotuloConteudo(viraConteudoOrigem)}</b></p>
                )}
              </div>

              {newViraDeCodigo && (() => {
                const trocasFixas = (viraComposicao || [])
                  .filter((vc: any) => vc.deProdutoCodigo === newViraDeCodigo && !(viraVariacoes || []).some((v: any) => String(v.codigo).trim() === vc.paraProdutoCodigo))
                  .map((vc: any) => ({ codigo: vc.paraProdutoCodigo, descricao: vc.paraProdutoDescricao, conteudoKg: null, fator: parseFloat(vc.quantidade) || 1, fixa: true }));
                const opcoes = [...(viraVariacoes || []).map((v: any) => ({ ...v, fixa: false })), ...trocasFixas];
                return (
                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Produto de destino (em quê será convertido)</label>
                    {loadingVariacoes ? (
                      <p className="text-[11px] text-zinc-500">Buscando itens com a mesma formulação…</p>
                    ) : opcoes.length > 0 ? (
                      <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-100 bg-white">
                        {opcoes.map((o: any) => {
                          const marcado = String(o.codigo).trim() === String(newViraParaCodigo).trim();
                          return (
                            <button
                              key={o.codigo}
                              type="button"
                              onClick={() => void escolherDestinoConversao(o.codigo)}
                              className={`w-full text-left px-3 py-2.5 min-h-11 flex items-center justify-between gap-3 cursor-pointer ${marcado ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-50'}`}
                            >
                              <span className="min-w-0">
                                <span className="block text-xs font-bold break-words">{o.descricao}</span>
                                <span className={`font-mono text-[10px] ${marcado ? 'text-zinc-300' : 'text-zinc-500'}`}>{o.codigo}</span>
                              </span>
                              <span className="shrink-0 text-right text-[11px]">
                                <b className="block">{o.fixa ? 'Troca fixa' : rotuloConteudo(o.conteudoKg)}</b>
                                <span className={marcado ? 'text-zinc-300' : 'text-zinc-500'}>fator 1 → {String(Math.round(o.fator * 1000) / 1000).replace('.', ',')}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500">Nenhum item com a mesma formulação encontrado para esta origem.</p>
                    )}
                    <details className="text-[11px]" open={opcoes.length === 0 && !loadingVariacoes}>
                      <summary className="cursor-pointer min-h-11 sm:min-h-0 flex items-center font-bold text-zinc-600">Escolher outro produto (troca fixa)</summary>
                      <div className="pt-2">
                        <SeletorKit
                          kits={(products || []).map((pr: any) => ({ codigo: pr.codigo, descricao: pr.descricao, estoque: pr.estoque }))}
                          valor={opcoes.some((o: any) => String(o.codigo).trim() === String(newViraParaCodigo).trim()) ? '' : newViraParaCodigo}
                          onChange={(c: string) => void escolherDestinoConversao(c)}
                          placeholder="Digite o código ou o nome do destino…"
                        />
                      </div>
                    </details>
                  </div>
                );
              })()}

              {selectedViraComp && (() => {
                const existente = parConversaoExistente(selectedViraComp.deProdutoCodigo, selectedViraComp.paraProdutoCodigo);
                const fatorNovo = Number(newViraFator) || 0;
                const mudou = existente && Math.abs((parseFloat(existente.quantidade) || 0) - fatorNovo) > 1e-9;
                const marcaMudou = existente && !!existente.baixaOrigemNaVenda !== newViraBaixaOrigem;
                const destinoVar = (viraVariacoes || []).find((v: any) => String(v.codigo).trim() === String(selectedViraComp.paraProdutoCodigo).trim());
                return (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                    {newViraFormula === 'igual' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border bg-zinc-100 text-zinc-700 border-zinc-200" title="Mesma formulação de matéria-prima: muda só a embalagem ou o tamanho">Mesma formulação</span>
                    )}
                    {newViraFormula === 'diferente' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border bg-amber-50 text-amber-700 border-amber-200" title="As formulações de matéria-prima são diferentes: é uma troca fixa entre produtos">Formulação diferente · troca fixa</span>
                    )}
                    <span className="text-zinc-600 basis-full sm:basis-0 sm:flex-1 min-w-0">
                      {destinoVar && viraConteudoOrigem
                        ? `Conteúdo ${rotuloConteudo(viraConteudoOrigem)} → ${rotuloConteudo(destinoVar.conteudoKg)}: fator 1 → ${String(Math.round(fatorNovo * 1000) / 1000).replace('.', ',')}.`
                        : existente
                          ? (mudou ? `Fator salvo 1 → ${existente.quantidade}; será atualizado para 1 → ${fatorNovo} ao criar a ordem.` : `Fator salvo deste par: 1 → ${existente.quantidade}.`)
                          : `Par novo: o fator 1 → ${fatorNovo || '?'} será salvo ao criar a ordem.`}
                      {destinoVar && existente && mudou ? ` (Salvo antes: 1 → ${existente.quantidade}; será atualizado.)` : ''}
                    </span>
                    {existente && (
                      <button
                        type="button"
                        onClick={() => handleDeleteViraComposicao(selectedViraComp.deProdutoCodigo, selectedViraComp.paraProdutoCodigo)}
                        className="text-[10px] font-bold text-zinc-400 hover:text-red-600 underline cursor-pointer min-h-11 sm:min-h-0"
                      >
                        Excluir este par
                      </button>
                    )}
                    <label className="basis-full flex items-start gap-2 cursor-pointer min-h-11 sm:min-h-0 pt-1 border-t border-zinc-200 mt-1">
                      <input
                        type="checkbox"
                        checked={!!newViraBaixaOrigem}
                        onChange={(e) => setNewViraBaixaOrigem(e.target.checked)}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="text-zinc-700">
                        <b className="text-zinc-900">Vende como o destino:</b> a venda do destino baixa a origem no planejamento.
                        <span className="block text-[10px] text-zinc-500">Use na troca fixa em que a origem sai de fato (ex.: Natum 5 L vendido como Liss Shine 5 L).{marcaMudou ? ' Será salvo ao criar a ordem.' : ''}</span>
                      </span>
                    </label>
                  </div>
                );
              })()}

              {selectedViraComp && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                    Quantidade (origem × fator de conversão → destino)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-400 font-bold uppercase block">Qtd origem (DE)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={newViraQtyDe}
                        onChange={(e) => {
                          const qtyDe = parseFloat(e.target.value) || 0;
                          setNewViraQtyDe(qtyDe);
                          const qtyPara = newViraQtyParaManual
                            ? newViraQtyPara
                            : qtyDe * (Number(newViraFator) || 1);
                          if (!newViraQtyParaManual) setNewViraQtyPara(qtyPara);
                          void refreshNewViraPackaging(
                            qtyDe,
                            newViraQtyParaManual ? newViraQtyPara : qtyPara,
                          );
                        }}
                        className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-400 font-bold uppercase block">Fator de conversão (1→N)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={newViraFator}
                        onChange={(e) => {
                          const fator = parseFloat(e.target.value) || 0;
                          setNewViraFator(fator);
                          if (!newViraQtyParaManual) {
                            const qtyPara = (Number(newViraQtyDe) || 0) * fator;
                            setNewViraQtyPara(qtyPara);
                            void refreshNewViraPackaging(Number(newViraQtyDe) || 0, qtyPara);
                          }
                        }}
                        className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-zinc-400 font-bold uppercase block">Qtd estimada PARA</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={newViraQtyPara}
                        onChange={(e) => {
                          const qtyPara = parseFloat(e.target.value) || 0;
                          setNewViraQtyParaManual(true);
                          setNewViraQtyPara(qtyPara);
                          void refreshNewViraPackaging(Number(newViraQtyDe) || 0, qtyPara);
                        }}
                        className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900"
                        required
                      />
                    </div>
                  </div>
                  <p className="text-[9px] text-zinc-450">
                    {selectedViraComp.deProdutoCodigo} → {selectedViraComp.paraProdutoCodigo}
                    {loadingViraPackaging ? ' · atualizando embalagens…' : ''}
                  </p>
                </div>
              )}

              {selectedViraComp && (
                <div className="space-y-3 border border-zinc-200 rounded-xl p-4">
                  <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                    Embalagens da conversão (registro — não movimenta estoque no Hub)
                  </h4>
                  {viraEmbalagensFonte && (
                    <p className="text-[10px] text-zinc-500">Sugeridas a partir da {viraEmbalagensFonte}. Confira e ajuste se preciso.</p>
                  )}
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold text-emerald-700 uppercase">Retorno ao estoque (origem)</p>
                    {newViraPackagingLines.filter((l) => l.role === 'return').length === 0 ? (
                      <p className="text-[11px] text-zinc-400">Nenhuma embalagem sugerida na formulação DE</p>
                    ) : (
                      newViraPackagingLines
                        .filter((l) => l.role === 'return')
                        .map((line, idx) => {
                          const i = newViraPackagingLines.indexOf(line);
                          return (
                            <div key={`ret-${line.code}-${idx}`} className="flex flex-wrap items-center gap-2 text-[11px]">
                              <label className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={line.returned !== false}
                                  onChange={(e) => {
                                    const next = [...newViraPackagingLines];
                                    next[i] = { ...line, returned: e.target.checked };
                                    setNewViraPackagingLines(next);
                                  }}
                                />
                                <span className="font-bold text-zinc-600">Retornou</span>
                              </label>
                              <span className="font-mono text-zinc-800 truncate flex-1 min-w-[120px]">
                                {line.code} · {line.description}
                              </span>
                              <input
                                type="number"
                                step="any"
                                value={line.qty}
                                onChange={(e) => {
                                  const next = [...newViraPackagingLines];
                                  next[i] = { ...line, qty: parseFloat(e.target.value) || 0 };
                                  setNewViraPackagingLines(next);
                                }}
                                className="w-20 border border-zinc-200 rounded-lg px-2 py-1 font-bold"
                              />
                            </div>
                          );
                        })
                    )}
                  </div>
                  <div className="space-y-2 pt-2 border-t border-zinc-100">
                    <p className="text-[9px] font-bold text-amber-700 uppercase">Saída (destino)</p>
                    {newViraPackagingLines.filter((l) => l.role === 'consume').length === 0 ? (
                      <p className="text-[11px] text-zinc-400">Nenhuma embalagem sugerida na formulação PARA</p>
                    ) : (
                      newViraPackagingLines
                        .filter((l) => l.role === 'consume')
                        .map((line) => {
                          const i = newViraPackagingLines.indexOf(line);
                          return (
                            <div key={`con-${line.code}-${i}`} className="flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="font-mono text-zinc-800 truncate flex-1 min-w-[120px]">
                                {line.code} · {line.description}
                              </span>
                              <input
                                type="number"
                                step="any"
                                value={line.qty}
                                onChange={(e) => {
                                  const next = [...newViraPackagingLines];
                                  next[i] = { ...line, qty: parseFloat(e.target.value) || 0 };
                                  setNewViraPackagingLines(next);
                                }}
                                className="w-20 border border-zinc-200 rounded-lg px-2 py-1 font-bold"
                              />
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Motivo / observação de embalagem</label>
                <input
                  type="text"
                  value={newViraMotivo}
                  onChange={(e) => setNewViraMotivo(e.target.value)}
                  placeholder="Ex.: frasco origem rachado — sem retorno"
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Observações / Instruções</label>
                <textarea
                  value={newViraOrderNotes}
                  onChange={(e) => setNewViraOrderNotes(e.target.value)}
                  placeholder="Ex: Conferência lote-a-lote..."
                  rows={2}
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewViraOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingNewViraOrder || !selectedViraComp}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingNewViraOrder ? 'Criando...' : 'Criar Ordem'}
                </button>
              </div>
            </form>
        </Drawer>
    </>
  );
}
