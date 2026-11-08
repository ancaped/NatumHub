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

export default function AbaOrdensMontagem({ ctx }: { ctx: any }) {
  const { fetchOrders, filterStatus, filteredOrders, handleDeleteOrder, handleOpenEditModal, handlePrintOrder, loadingOrders, searchOrder, setFilterStatus, setSearchOrder } = ctx;
  return (
    <>
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-200">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Buscar ordem por lote ou kit..."
                  className="w-full text-xs border border-zinc-300 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-zinc-950 bg-white"
                  value={searchOrder}
                  onChange={(e) => setSearchOrder(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <select 
                  className="text-xs border border-zinc-300 rounded-xl px-3 py-2 bg-white focus:outline-none"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="PENDING">Pendentes (Expedição)</option>
                  <option value="COMPLETED">Concluídas</option>
                </select>

                <button 
                  onClick={fetchOrders}
                  className="p-2.5 bg-white border border-zinc-300 rounded-xl text-zinc-550 hover:text-zinc-900 cursor-pointer"
                  title="Atualizar"
                >
                  {loadingOrders ? <RefreshCw className="animate-spin h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              {loadingOrders ? (
                <div className="py-16 text-center text-zinc-400 flex flex-col items-center gap-2">
                  <RefreshCw className="animate-spin h-8 w-8 text-zinc-300" />
                  <span className="text-xs font-medium">Carregando ordens de montagem...</span>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="py-16 text-center text-zinc-400 flex flex-col items-center gap-2">
                  <ClipboardList size={40} className="text-zinc-200" />
                  <span className="text-xs font-bold text-zinc-700">Nenhuma ordem de montagem encontrada</span>
                  <p className="text-[10px] text-zinc-550">Gere uma nova ordem clicando no botão no topo.</p>
                </div>
              ) : (
                <>
                <div className="md:hidden divide-y divide-zinc-100">
                  {filteredOrders.map((o) => (
                    <div key={o.id} className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-extrabold text-zinc-950 text-sm">Lote {o.orderNumber}</span>
                          <span className="block font-bold text-zinc-900 text-xs break-words">{o.kitProductDescription}</span>
                          <span className="text-[10px] text-zinc-500">REF: {o.kitProductCode}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-extrabold text-zinc-900 block">{o.quantity} un</span>
                          {o.quantityAssembled !== null && o.quantityAssembled !== undefined && o.quantityAssembled !== o.quantity && (
                            <span className="text-[10px] font-bold text-zinc-500 block">Real: {o.quantityAssembled} un</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                          o.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {o.status === 'COMPLETED' ? 'Concluída' : 'Em Montagem'}
                        </span>
                        <SeloOrdemParada ordem={o} />
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          o.erpLaunched === 1
                            ? 'bg-zinc-900 text-white border border-zinc-900'
                            : 'bg-zinc-100 text-zinc-500 border border-zinc-200'
                        }`}>
                          ERP: {o.erpLaunched === 1 ? 'Sim' : 'Não'}
                        </span>
                        <span className="text-[10px] text-zinc-500 ml-auto">{o.completedAt ? `Montado ${o.completedAt}${o.assembledBy ? ` por ${o.assembledBy}` : ''}` : `Emitida ${o.createdAt}`}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleOpenEditModal(o)} className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer">
                          <Eye size={14} /> Abrir
                        </button>
                        <button onClick={() => handlePrintOrder(o)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-700 cursor-pointer" title="Imprimir" aria-label="Imprimir ordem">
                          <Printer size={16} />
                        </button>
                        <button onClick={() => handleDeleteOrder(o.id)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-red-600 cursor-pointer" title="Excluir" aria-label="Excluir ordem">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-550 font-bold uppercase text-[9px]">
                        <th className="p-3">Lote Ordem</th>
                        <th className="p-3">Kit</th>
                        <th className="p-3 text-right">Qtd a Montar</th>
                        <th className="p-3">Emissão</th>
                        <th className="p-3">Montado Em</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">ERP</th>
                        <th className="p-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => (
                        <tr key={o.id} className="border-b border-zinc-150 hover:bg-zinc-50/50">
                          <td className="p-3 font-extrabold text-zinc-950">{o.orderNumber}</td>
                          <td className="p-3">
                            <span className="font-bold text-zinc-900 block">{o.kitProductDescription}</span>
                            <span className="text-[10px] text-zinc-500">REF: {o.kitProductCode}</span>
                          </td>
                          <td className="p-3 text-right">
                            <span className="font-extrabold text-zinc-900 block">{o.quantity} un</span>
                            {o.quantityAssembled !== null && o.quantityAssembled !== undefined && o.quantityAssembled !== o.quantity && (
                              <span className="text-[9px] font-bold text-zinc-500 block">Real: {o.quantityAssembled} un</span>
                            )}
                          </td>
                          <td className="p-3 text-zinc-500 font-medium">{o.createdAt}</td>
                          <td className="p-3 text-zinc-550 font-medium">
                            {o.completedAt ? (
                              <div>
                                <span className="block font-bold text-zinc-700">{o.completedAt}</span>
                                <span className="text-[10px] text-zinc-400">Por: {o.assembledBy || '-'}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] italic text-zinc-400">Pendente na Produção</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                              o.status === 'COMPLETED' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {o.status === 'COMPLETED' ? 'Concluída' : 'Em Montagem'}
                            </span>
                            <SeloOrdemParada ordem={o} />
                          </td>
                          <td className="p-3">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                              o.erpLaunched === 1
                                ? 'bg-zinc-900 text-white border border-zinc-900'
                                : 'bg-zinc-100 text-zinc-450 border border-zinc-200'
                            }`}>
                              {o.erpLaunched === 1 ? 'Sim' : 'Não'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2 justify-center items-center">
                              <button 
                                onClick={() => handlePrintOrder(o)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                title="Imprimir Ordem para preenchimento manual"
                              >
                                <Printer size={14} />
                              </button>
                              <button 
                                onClick={() => handleOpenEditModal(o)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                title="Preencher Retorno / Editar"
                              >
                                <Eye size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteOrder(o.id)}
                                className="p-1.5 hover:bg-zinc-100 text-red-600 hover:text-red-700 rounded-lg cursor-pointer"
                                title="Excluir"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
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
