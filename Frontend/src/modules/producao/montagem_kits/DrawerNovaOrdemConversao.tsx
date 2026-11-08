import { apiFetch } from '../../geral/lib/http';
import { useAviso } from '../../geral/components/ui/Aviso';
import Drawer from '../../geral/components/ui/Drawer';
import { usePreviaServidor, mensagemErroServidor } from '../lib/usePreviaServidor';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, Search, RefreshCw, Layers, ClipboardList, PlusCircle, Trash2, 
  CheckCircle2, Printer, X, Eye, CheckCircle, ExternalLink, Calendar, User, FileText, Settings, AlertTriangle,
  UploadCloud, Plus
} from 'lucide-react';
import KitCompositionDrawer from '../components/KitCompositionDrawer';
import LancarKitErpDrawer from './LancarKitErpDrawer';
import { api } from '../../geral/lib/api';
import { Category } from '../../geral/lib/types';
import { SeloOrdemParada } from '../lib/ordemParada';
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
  const { atualizarParConversao, parConversaoExistente, newViraDeCodigo, newViraParaCodigo, getViraDeNamePreview, getViraParaNamePreview, handleDeleteViraComposicao, handleCreateViraOrder, loadingViraPackaging, newViraFator, newViraMotivo, newViraOrderNotes, newViraOrderNumber, newViraPackagingLines, newViraQtyDe, newViraQtyPara, newViraQtyParaManual, refreshNewViraPackaging, selectedViraComp, setNewViraFator, setNewViraMotivo, setNewViraOrderNotes, setNewViraOrderNumber, setNewViraPackagingLines, setNewViraQtyDe, setNewViraQtyPara, setNewViraQtyParaManual, setShowNewViraOrderModal, submittingNewViraOrder } = ctx;
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Produto de origem (DE)</label>
                  <input
                    type="text"
                    list="produtos-list"
                    value={newViraDeCodigo}
                    onChange={(e) => void atualizarParConversao(e.target.value, newViraParaCodigo)}
                    placeholder="Código do produto de origem"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-semibold text-zinc-900 bg-white"
                    required
                  />
                  {getViraDeNamePreview() && <p className="text-[10px] text-zinc-500 font-bold break-words">{getViraDeNamePreview()}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Produto de destino (PARA)</label>
                  <input
                    type="text"
                    list="produtos-list"
                    value={newViraParaCodigo}
                    onChange={(e) => void atualizarParConversao(newViraDeCodigo, e.target.value)}
                    placeholder="Código do produto de destino"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-semibold text-zinc-900 bg-white"
                    required
                  />
                  {getViraParaNamePreview() && <p className="text-[10px] text-zinc-500 font-bold break-words">{getViraParaNamePreview()}</p>}
                </div>
              </div>

              {selectedViraComp && (() => {
                const existente = parConversaoExistente(selectedViraComp.deProdutoCodigo, selectedViraComp.paraProdutoCodigo);
                const fatorReceita = Number(newViraFator) || 0;
                const mudou = existente && Math.abs((parseFloat(existente.quantidade) || 0) - fatorReceita) > 1e-9;
                return (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${existente ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {existente ? 'Receita encontrada' : 'Par novo'}
                    </span>
                    <span className="text-zinc-600 basis-full sm:basis-0 sm:flex-1 min-w-0">
                      {existente
                        ? (mudou ? `Receita atual 1 → ${existente.quantidade}; será atualizada para 1 → ${fatorReceita} ao criar a ordem.` : `Receita: 1 → ${existente.quantidade}. Ajuste o fator abaixo para alterá-la.`)
                        : `A receita 1 → ${fatorReceita || '?'} será criada ao criar a ordem. Preencha o fator e as embalagens abaixo.`}
                    </span>
                    {existente && (
                      <button
                        type="button"
                        onClick={() => handleDeleteViraComposicao(selectedViraComp.deProdutoCodigo, selectedViraComp.paraProdutoCodigo)}
                        className="text-[10px] font-bold text-zinc-400 hover:text-red-600 underline cursor-pointer min-h-11 sm:min-h-0"
                      >
                        Excluir receita deste par
                      </button>
                    )}
                  </div>
                );
              })()}

              {selectedViraComp && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                    Receita do par e quantidade (DE × fator → PARA)
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
                      <label className="text-[9px] text-zinc-400 font-bold uppercase block">Fator da receita (1→N)</label>
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
                    Embalagens (registro — não movimenta estoque no Hub)
                  </h4>
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
