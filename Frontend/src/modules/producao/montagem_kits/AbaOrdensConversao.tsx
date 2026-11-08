import { usePreviaServidor, mensagemErroServidor } from '../lib/usePreviaServidor';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Trash2, Printer } from 'lucide-react';
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

import { FilterBar, FiltroSelect, StatusBadge } from '../../geral/components/ui/ReportKit';

export default function AbaOrdensConversao({ ctx }: { ctx: any }) {
  const { buildViraPrintPayload, filterViraStatus, handleDeleteViraOrder, handleOpenEditViraOrderModal, loadingVira, setFilterViraStatus, setPrintingOrder, setViraSearch, viraOrders, viraOrdersFiltradas, viraSearch } = ctx;
  return (
    <>
          <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col overflow-hidden">
            <FilterBar busca={viraSearch} onBusca={setViraSearch} placeholder="Buscar por lote, produto de origem ou destino...">
              <FiltroSelect
                value={filterViraStatus}
                onChange={setFilterViraStatus}
                opcoes={[
                  { valor: 'ALL', rotulo: 'Todos os status' },
                  { valor: 'PENDING', rotulo: 'Em montagem' },
                  { valor: 'COMPLETED', rotulo: 'Concluídas' },
                ]}
              />
            </FilterBar>

            {/* List of Vira Orders */}
            <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
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
                    <div key={o.id} role="button" tabIndex={0} onClick={() => handleOpenEditViraOrderModal(o)} onKeyDown={(e) => { if (e.key === 'Enter') handleOpenEditViraOrderModal(o); }} className="p-3 space-y-2 cursor-pointer active:bg-zinc-50">
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
                        <StatusBadge variante={o.status === 'COMPLETED' ? 'saudavel' : 'ordem'}>{o.status === 'COMPLETED' ? 'Concluída' : 'Em montagem'}</StatusBadge>
                        <SeloOrdemParada ordem={o} />
                        <StatusBadge variante={o.erpLaunched === 1 ? 'saudavel' : 'descontinuado'} title="Lançado no ERP">ERP: {o.erpLaunched === 1 ? 'Sim' : 'Não'}</StatusBadge>
                        <span className="text-[10px] text-zinc-500 ml-auto">{o.completedAt ? `Concluída ${o.completedAt}${o.assembledBy ? ` por ${o.assembledBy}` : ''}` : `Emitida ${o.createdAt}`}</span>
                      </div>
                      <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
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
                  <table className="data-table compacta w-full text-left">
                    <thead>
                      <tr>
                        <th>Nº Ordem / Lote</th>
                        <th>Conversão (De ➔ Para)</th>
                        <th className="text-right">Qtd. Programada</th>
                        <th className="text-right">Qtd. Real</th>
                        <th>Data Emissão</th>
                        <th>Conclusão / Operador</th>
                        <th className="text-center">Status</th>
                        <th className="text-center">ERP</th>
                        <th className="text-center">Ações</th>
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
                          <tr key={o.id} onClick={() => handleOpenEditViraOrderModal(o)} className="border-b border-zinc-150 hover:bg-zinc-50 cursor-pointer">
                            <td className="font-extrabold text-zinc-955">{o.orderNumber}</td>
                            <td className="space-y-1">
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
                            <td className="text-right font-extrabold text-zinc-650">{o.quantity} un</td>
                            <td className="text-right font-black text-zinc-950">
                              {o.status === 'COMPLETED' ? `${o.quantityAssembled !== null && o.quantityAssembled !== undefined ? o.quantityAssembled : o.quantity} un` : '—'}
                            </td>
                            <td className="text-zinc-500 font-medium">{o.createdAt}</td>
                            <td className="text-zinc-550 font-medium">
                              {o.completedAt ? (
                                <div>
                                  <span className="block font-bold text-zinc-700">{o.completedAt}</span>
                                  <span className="text-[10px] text-zinc-400">Por: {o.assembledBy || '-'}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] italic text-zinc-400">Pendente de Produção</span>
                              )}
                            </td>
                            <td className="text-center">
                              <StatusBadge variante={o.status === 'COMPLETED' ? 'saudavel' : 'ordem'}>{o.status === 'COMPLETED' ? 'Concluída' : 'Em montagem'}</StatusBadge>
                              <SeloOrdemParada ordem={o} />
                            </td>
                            <td className="text-center">
                              <StatusBadge variante={o.erpLaunched === 1 ? 'saudavel' : 'descontinuado'} title="Lançado no ERP">{o.erpLaunched === 1 ? 'Sim' : 'Não'}</StatusBadge>
                            </td>
                            <td>
                              <div className="flex gap-2 justify-center items-center" onClick={(e) => e.stopPropagation()}>
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
