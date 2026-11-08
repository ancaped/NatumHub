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

export default function AbaOrdensConversao({ ctx }: { ctx: any }) {
  const { buildViraPrintPayload, filterViraStatus, handleDeleteViraOrder, handleOpenEditViraOrderModal, loadingVira, setFilterViraStatus, setPrintingOrder, setViraSearch, viraOrders, viraOrdersFiltradas, viraSearch } = ctx;
  return (
    <>
          <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col overflow-hidden">
            {/* Search and filter toolbar */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0 sm:min-w-[280px]">
                <div className="relative flex-1 min-w-[12rem] max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar por lote, produto de origem ou destino..."
                    value={viraSearch}
                    onChange={(e) => setViraSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-955 text-xs font-semibold text-zinc-900"
                  />
                </div>
                <select
                  value={filterViraStatus}
                  onChange={(e) => setFilterViraStatus(e.target.value)}
                  className="bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="PENDING">Em Montagem (Pendente)</option>
                  <option value="COMPLETED">Concluídas</option>
                </select>
              </div>
            </div>

            {/* List of Vira Orders */}
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
              {loadingVira ? (
                <div className="flex-1 flex items-center justify-center p-12 text-zinc-400 font-semibold text-xs">
                  Carregando ordens de conversão...
                </div>
              ) : (
                <>
                <div className="md:hidden divide-y divide-zinc-100">
                  {viraOrdersFiltradas.length === 0 && (
                    <p className="p-8 text-center text-zinc-500 font-bold text-xs">Nenhuma conversão encontrada.</p>
                  )}
                  {viraOrdersFiltradas.map(o => (
                    <div key={o.id} className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-extrabold text-zinc-950 text-sm">{o.orderNumber}</span>
                        <div className="text-right shrink-0">
                          <span className="font-extrabold text-zinc-900 block">{o.status === 'COMPLETED' ? `${o.quantityAssembled !== null && o.quantityAssembled !== undefined ? o.quantityAssembled : o.quantity} un` : `${o.quantity} un`}</span>
                          {o.status === 'COMPLETED' && o.quantityAssembled !== null && o.quantityAssembled !== undefined && o.quantityAssembled !== o.quantity && (
                            <span className="text-[10px] font-bold text-zinc-500">Prog.: {o.quantity} un</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs space-y-0.5">
                        <div className="text-zinc-800 font-bold break-words"><span className="text-[10px] text-zinc-400 font-mono">DE </span>{o.deProdutoDescricao} <span className="text-[10px] text-zinc-500">({o.deProdutoCodigo})</span></div>
                        <div className="text-zinc-900 font-extrabold break-words"><span className="text-[10px] text-zinc-500 font-mono">PARA </span>{o.paraProdutoDescricao} <span className="text-[10px] text-zinc-500">({o.paraProdutoCodigo})</span></div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                          o.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>{o.status === 'COMPLETED' ? 'Concluída' : 'Em Montagem'}</span>
                        <SeloOrdemParada ordem={o} />
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          o.erpLaunched === 1 ? 'bg-zinc-900 text-white border border-zinc-900' : 'bg-zinc-100 text-zinc-500 border border-zinc-200'
                        }`}>ERP: {o.erpLaunched === 1 ? 'Sim' : 'Não'}</span>
                        <span className="text-[10px] text-zinc-500 ml-auto">{o.completedAt ? `Concluída ${o.completedAt}${o.assembledBy ? ` por ${o.assembledBy}` : ''}` : `Emitida ${o.createdAt}`}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleOpenEditViraOrderModal(o)} className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer">
                          <Eye size={14} /> Abrir
                        </button>
                        <button onClick={() => { setPrintingOrder(buildViraPrintPayload(o)); setTimeout(() => window.print(), 100); }} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-700 cursor-pointer" aria-label="Imprimir folha">
                          <Printer size={16} />
                        </button>
                        <button onClick={() => handleDeleteViraOrder(o.id)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-red-600 cursor-pointer" aria-label="Excluir ordem">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-y-auto flex-1">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-155 font-bold text-zinc-500 sticky top-0 z-10">
                      <tr>
                        <th className="p-4">Nº Ordem / Lote</th>
                        <th className="p-4">Conversão (De ➔ Para)</th>
                        <th className="p-4 text-right">Qtd. Programada</th>
                        <th className="p-4 text-right">Qtd. Real</th>
                        <th className="p-4">Data Emissão</th>
                        <th className="p-4">Conclusão / Operador</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">ERP</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(() => {
                        const filtered = viraOrders.filter(o => {
                          const matchesSearch = 
                            (o.orderNumber || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.deProdutoCodigo || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.deProdutoDescricao || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.paraProdutoCodigo || '').toLowerCase().includes(viraSearch.toLowerCase()) ||
                            (o.paraProdutoDescricao || '').toLowerCase().includes(viraSearch.toLowerCase());
                          
                          const matchesStatus = 
                            filterViraStatus === 'ALL' || 
                            o.status === filterViraStatus;

                          return matchesSearch && matchesStatus;
                        });

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={9} className="p-8 text-center text-zinc-450 font-bold">
                                Nenhuma conversão encontrada.
                              </td>
                            </tr>
                          );
                        }

                        return filtered.map(o => (
                          <tr key={o.id} className="border-b border-zinc-150 hover:bg-zinc-50/50">
                            <td className="p-4 font-extrabold text-zinc-955">{o.orderNumber}</td>
                            <td className="p-4 space-y-1">
                              <div className="flex items-center gap-1.5 text-zinc-800 font-bold">
                                <span className="text-[10px] text-zinc-400 font-mono">DE:</span>
                                <span>{o.deProdutoDescricao}</span>
                                <span className="text-[9px] text-zinc-500">({o.deProdutoCodigo})</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-zinc-900 font-extrabold">
                                <span className="text-[10px] text-zinc-500 font-mono">PARA:</span>
                                <span>{o.paraProdutoDescricao}</span>
                                <span className="text-[9px] text-zinc-500">({o.paraProdutoCodigo})</span>
                              </div>
                            </td>
                            <td className="p-4 text-right font-extrabold text-zinc-650">{o.quantity} un</td>
                            <td className="p-4 text-right font-black text-zinc-950">
                              {o.status === 'COMPLETED' ? `${o.quantityAssembled !== null && o.quantityAssembled !== undefined ? o.quantityAssembled : o.quantity} un` : '—'}
                            </td>
                            <td className="p-4 text-zinc-500 font-medium">{o.createdAt}</td>
                            <td className="p-4 text-zinc-550 font-medium">
                              {o.completedAt ? (
                                <div>
                                  <span className="block font-bold text-zinc-700">{o.completedAt}</span>
                                  <span className="text-[10px] text-zinc-400">Por: {o.assembledBy || '-'}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] italic text-zinc-400">Pendente de Produção</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                                o.status === 'COMPLETED' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {o.status === 'COMPLETED' ? 'Concluída' : 'Em Montagem'}
                              </span>
                              <SeloOrdemParada ordem={o} />
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                                o.erpLaunched === 1
                                  ? 'bg-zinc-900 text-white border border-zinc-900'
                                  : 'bg-zinc-100 text-zinc-450 border border-zinc-200'
                              }`}>
                                {o.erpLaunched === 1 ? 'Sim' : 'Não'}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-2 justify-center items-center">
                                <button 
                                  onClick={() => {
                                    setPrintingOrder(buildViraPrintPayload(o));
                                    setTimeout(() => window.print(), 100);
                                  }}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                  title="Imprimir Folha de Conversão"
                                >
                                  <Printer size={14} />
                                </button>
                                <button 
                                  onClick={() => handleOpenEditViraOrderModal(o)}
                                  className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                  title="Registrar Retorno / Observar"
                                >
                                  <Eye size={14} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteViraOrder(o.id)}
                                  className="p-1.5 hover:bg-zinc-100 text-red-600 hover:text-red-700 rounded-lg cursor-pointer"
                                  title="Excluir Ordem"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          </div>
    </>
  );
}
