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

import { ReportHeader, BotaoAcao, FilterBar, FiltroSelect, StatusBadge } from '../../geral/components/ui/ReportKit';

export default function AbaOrdensMontagem({ ctx }: { ctx: any }) {
  const { fetchOrders, filterStatus, filteredOrders, handleDeleteOrder, handleOpenEditModal, handlePrintOrder, loadingOrders, searchOrder, setFilterStatus, setSearchOrder } = ctx;
  return (
    <>
          <div className="space-y-4 animate-in fade-in duration-200">
            <FilterBar busca={searchOrder} onBusca={setSearchOrder} placeholder="Buscar ordem por lote ou kit...">
              <FiltroSelect
                value={filterStatus}
                onChange={setFilterStatus}
                opcoes={[
                  { valor: 'ALL', rotulo: 'Todos os status' },
                  { valor: 'PENDING', rotulo: 'Em montagem' },
                  { valor: 'COMPLETED', rotulo: 'Concluídas' },
                ]}
              />
            </FilterBar>

            {/* List */}
            <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
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
                    <div key={o.id} role="button" tabIndex={0} onClick={() => handleOpenEditModal(o)} onKeyDown={(e) => { if (e.key === 'Enter') handleOpenEditModal(o); }} className="p-3 space-y-2 cursor-pointer active:bg-zinc-50">
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
                        <StatusBadge variante={o.status === 'COMPLETED' ? 'saudavel' : 'ordem'}>{o.status === 'COMPLETED' ? 'Concluída' : 'Em montagem'}</StatusBadge>
                        <SeloOrdemParada ordem={o} />
                        <StatusBadge variante={o.erpLaunched === 1 ? 'saudavel' : 'descontinuado'} title="Lançado no ERP">ERP: {o.erpLaunched === 1 ? 'Sim' : 'Não'}</StatusBadge>
                        <span className="text-[10px] text-zinc-500 ml-auto">{o.completedAt ? `Montado ${o.completedAt}${o.assembledBy ? ` por ${o.assembledBy}` : ''}` : `Emitida ${o.createdAt}`}</span>
                      </div>
                      <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
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
                      <tr>
                        <th>Lote Ordem</th>
                        <th>Kit</th>
                        <th className="text-right">Qtd a Montar</th>
                        <th>Emissão</th>
                        <th>Montado Em</th>
                        <th>Status</th>
                        <th>ERP</th>
                        <th className="text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((o) => (
                        <tr key={o.id} onClick={() => handleOpenEditModal(o)} className="border-b border-zinc-150 hover:bg-zinc-50 cursor-pointer">
                          <td className="font-extrabold text-zinc-950">{o.orderNumber}</td>
                          <td>
                            <span className="font-bold text-zinc-900 block">{o.kitProductDescription}</span>
                            <span className="text-[10px] text-zinc-500">REF: {o.kitProductCode}</span>
                          </td>
                          <td className="text-right">
                            <span className="font-extrabold text-zinc-900 block">{o.quantity} un</span>
                            {o.quantityAssembled !== null && o.quantityAssembled !== undefined && o.quantityAssembled !== o.quantity && (
                              <span className="text-[9px] font-bold text-zinc-500 block">Real: {o.quantityAssembled} un</span>
                            )}
                          </td>
                          <td className="text-zinc-500 font-medium">{o.createdAt}</td>
                          <td className="text-zinc-550 font-medium">
                            {o.completedAt ? (
                              <div>
                                <span className="block font-bold text-zinc-700">{o.completedAt}</span>
                                <span className="text-[10px] text-zinc-400">Por: {o.assembledBy || '-'}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] italic text-zinc-400">Pendente na Produção</span>
                            )}
                          </td>
                          <td>
                            <StatusBadge variante={o.status === 'COMPLETED' ? 'saudavel' : 'ordem'}>{o.status === 'COMPLETED' ? 'Concluída' : 'Em montagem'}</StatusBadge>
                            <SeloOrdemParada ordem={o} />
                          </td>
                          <td>
                            <StatusBadge variante={o.erpLaunched === 1 ? 'saudavel' : 'descontinuado'} title="Lançado no ERP">{o.erpLaunched === 1 ? 'Sim' : 'Não'}</StatusBadge>
                          </td>
                          <td>
                            <div className="flex gap-2 justify-center items-center" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={() => handlePrintOrder(o)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 rounded-lg cursor-pointer"
                                title="Imprimir Ordem para preenchimento manual"
                              >
                                <Printer size={14} />
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
