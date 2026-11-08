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

export default function AbaFormulasConversao({ ctx }: { ctx: any }) {
  const { expandedViraFormulaKey, getViraDeNamePreview, getViraParaNamePreview, handleAddViraComposicao, handleDeleteViraComposicao, newViraDeCodigo, newViraParaCodigo, newViraQuantidade, renderFormulaPreview, setNewViraDeCodigo, setNewViraParaCodigo, setNewViraQuantidade, setViraCompSearch, toggleFormulaPackagingPreview, viraCompSearch, viraComposicao, viraComposicaoFiltrada } = ctx;
  return (
    <>
          <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col overflow-hidden">
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 space-y-4 shrink-0">
              <form onSubmit={handleAddViraComposicao} className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Produto Origem (DE)</label>
                  <input
                    type="text"
                    placeholder="Código do produto de origem..."
                    value={newViraDeCodigo}
                    onChange={(e) => setNewViraDeCodigo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-900"
                    list="produtos-list"
                    required
                  />
                  {getViraDeNamePreview() && (
                    <div className="text-[10px] text-zinc-550 font-bold truncate max-w-xs">{getViraDeNamePreview()}</div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Produto Destino (PARA)</label>
                  <input
                    type="text"
                    placeholder="Código do produto final..."
                    value={newViraParaCodigo}
                    onChange={(e) => setNewViraParaCodigo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-950 text-xs font-semibold text-zinc-900"
                    list="produtos-list"
                    required
                  />
                  {getViraParaNamePreview() && (
                    <div className="text-[10px] text-zinc-550 font-bold truncate max-w-xs">{getViraParaNamePreview()}</div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Fator de Conversão</label>
                  <input
                    type="number"
                    step="any"
                    value={newViraQuantidade}
                    onChange={(e) => setNewViraQuantidade(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-955 text-xs font-semibold text-zinc-900"
                    required
                  />
                  <p className="text-[9px] text-zinc-450 font-medium leading-snug">
                    1 origem → N destino (ex.: 300g → 100g = fator 3)
                  </p>
                </div>
                <button
                  type="submit"
                  className="w-full bg-zinc-900 hover:bg-zinc-850 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer min-h-11 md:min-h-9"
                >
                  Vincular Conversão de Produto
                </button>
              </form>
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
              <div className="p-4 border-b border-zinc-100 flex items-center shrink-0">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar por código ou descrição..."
                    value={viraCompSearch}
                    onChange={(e) => setViraCompSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-955 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="md:hidden divide-y divide-zinc-100 overflow-y-auto">
                {viraComposicaoFiltrada.length === 0 && (
                  <p className="p-8 text-center text-zinc-500 font-bold text-xs">Nenhuma fórmula de conversão cadastrada.</p>
                )}
                {viraComposicaoFiltrada.map(row => {
                  const key = `${row.deProdutoCodigo}|${row.paraProdutoCodigo}`;
                  const expanded = expandedViraFormulaKey === key;
                  return (
                    <div key={key} className="p-3 space-y-2">
                      <div className="text-xs space-y-0.5">
                        <div className="text-zinc-800 font-bold break-words"><span className="text-[10px] text-zinc-400 font-mono">DE </span>{row.deProdutoDescricao} <span className="font-mono text-[10px] text-zinc-500">({row.deProdutoCodigo})</span></div>
                        <div className="text-zinc-900 font-extrabold break-words"><span className="text-[10px] text-zinc-500 font-mono">PARA </span>{row.paraProdutoDescricao} <span className="font-mono text-[10px] text-zinc-500">({row.paraProdutoCodigo})</span></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-900 text-xs font-extrabold">1 → {row.quantidade}</span>
                        <button type="button" onClick={() => toggleFormulaPackagingPreview(row)} className="ml-auto min-h-11 px-3 inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-bold cursor-pointer" aria-expanded={expanded}>
                          <Eye size={14} /> Embalagens
                        </button>
                        <button type="button" onClick={() => handleDeleteViraComposicao(row.deProdutoCodigo, row.paraProdutoCodigo)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 cursor-pointer" aria-label="Remover fórmula de conversão">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {expanded && <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3">{renderFormulaPreview()}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block overflow-y-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3">Cód. Origem</th>
                      <th className="px-6 py-3">Produto de Origem (DE)</th>
                      <th className="px-6 py-3">Cód. Destino</th>
                      <th className="px-6 py-3">Produto de Destino (PARA)</th>
                      <th className="px-6 py-3 text-center">Proporção</th>
                      <th className="px-6 py-3 text-center w-28">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {(() => {
                      const filtered = viraComposicao.filter(row => 
                        (row.deProdutoCodigo || '').toLowerCase().includes(viraCompSearch.toLowerCase()) || 
                        (row.deProdutoDescricao || '').toLowerCase().includes(viraCompSearch.toLowerCase()) ||
                        (row.paraProdutoCodigo || '').toLowerCase().includes(viraCompSearch.toLowerCase()) ||
                        (row.paraProdutoDescricao || '').toLowerCase().includes(viraCompSearch.toLowerCase())
                      );

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-zinc-450 font-bold">
                              Nenhuma fórmula de conversão cadastrada.
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map(row => {
                        const key = `${row.deProdutoCodigo}|${row.paraProdutoCodigo}`;
                        const expanded = expandedViraFormulaKey === key;
                        return (
                          <React.Fragment key={key}>
                            <tr className="hover:bg-zinc-50/50 transition-colors">
                              <td className="px-6 py-3 font-mono font-bold text-zinc-800">{row.deProdutoCodigo}</td>
                              <td className="px-6 py-3 font-bold text-zinc-900">{row.deProdutoDescricao}</td>
                              <td className="px-6 py-3 font-mono text-zinc-650">{row.paraProdutoCodigo}</td>
                              <td className="px-6 py-3 text-zinc-700">{row.paraProdutoDescricao}</td>
                              <td className="px-6 py-3 text-center font-bold text-zinc-900">
                                1 → {row.quantidade}
                              </td>
                              <td className="px-6 py-3 text-center">
                                <div className="inline-flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleFormulaPackagingPreview(row)}
                                    className="p-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 rounded-lg border border-zinc-200 transition-colors cursor-pointer"
                                    title="Ver embalagens (por unidade)"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteViraComposicao(row.deProdutoCodigo, row.paraProdutoCodigo)}
                                    className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg border border-red-200 transition-colors cursor-pointer"
                                    title="Remover fórmula de conversão"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="bg-zinc-50/80">
                                <td colSpan={6} className="px-6 py-3">
                                  {renderFormulaPreview()}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
    </>
  );
}
