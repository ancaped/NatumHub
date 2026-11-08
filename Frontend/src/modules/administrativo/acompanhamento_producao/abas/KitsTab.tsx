import React from 'react';
import { SlidersHorizontal, Search, X, RefreshCw, Boxes } from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { formatDurationBetween } from '../lib/datas';
import { ColumnFilterHeader } from '../lib/ColumnFilterHeader';
import type { KitAssemblyOrder } from '../lib/tipos';

export interface KitsTabProps {
  filteredKitOrders: KitAssemblyOrder[];
  handleClearAllKitsFilters: () => void;
  handleKitsColumnFilterChange: (columnKey: string, selected: Set<string> | undefined) => void;
  kitOrders: KitAssemblyOrder[];
  kitOrdersSearch: string;
  kitsColumnFilters: Record<string, Set<string>>;
  kitsColumnOptions: Record<string, { value: string; label: string; count: number; }[]>;
  loadingKits: boolean;
  setKitOrdersSearch: React.Dispatch<React.SetStateAction<string>>;
  setSelectedKitOrder: React.Dispatch<React.SetStateAction<KitAssemblyOrder>>;
}

export default function KitsTab({ filteredKitOrders, handleClearAllKitsFilters, handleKitsColumnFilterChange, kitOrders, kitOrdersSearch, kitsColumnFilters, kitsColumnOptions, loadingKits, setKitOrdersSearch, setSelectedKitOrder }: KitsTabProps) {
  return (
<div className="space-y-3">
          {/* Barra Superior da Aba de Kits */}
          <div className="bg-white border border-zinc-200 p-3 rounded-lg shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-600">
                  Exibindo <strong>{filteredKitOrders.length}</strong> de <strong>{kitOrders.length}</strong> ordens de kits
                </span>
                {Object.keys(kitsColumnFilters).length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-zinc-50 text-zinc-700 border border-zinc-200">
                    <SlidersHorizontal className="h-3 w-3" />
                    {Object.keys(kitsColumnFilters).length} coluna(s) com filtro
                  </span>
                )}
                {(Object.keys(kitsColumnFilters).length > 0 || kitOrdersSearch) && (
                  <button
                    type="button"
                    onClick={handleClearAllKitsFilters}
                    className="text-xs text-red-600 hover:text-red-800 underline font-medium cursor-pointer ml-1"
                  >
                    Limpar todos os filtros
                  </button>
                )}
              </div>

              {/* Busca de Ordens de Kits */}
              <div className="relative min-w-[240px] max-w-sm flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={kitOrdersSearch}
                  onChange={e => setKitOrdersSearch(e.target.value)}
                  placeholder="Buscar ordem nº, SKU do kit, descrição..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-8 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                />
                {kitOrdersSearch && (
                  <button
                    type="button"
                    onClick={() => setKitOrdersSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabela de Ordens de Kits */}
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden">
            {/* Celular: cartões clicáveis (abre o mesmo detalhe do botão Editar) */}
            <div className="md:hidden divide-y divide-zinc-100">
              {loadingKits ? (
                <div className="py-12 text-center text-zinc-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                  <p className="text-xs font-semibold">Carregando ordens de kits...</p>
                </div>
              ) : filteredKitOrders.length === 0 ? (
                <div className="py-12 px-4 text-center text-zinc-400">
                  <Boxes className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                  <p className="text-sm font-semibold text-zinc-700">Nenhuma ordem de kit encontrada</p>
                </div>
              ) : (
                filteredKitOrders.map((order) => {
                  const isCompleted = order.status === 'COMPLETED';
                  const isProgress = order.status === 'IN_PROGRESS';
                  const isPending = order.status === 'PENDING';
                  const isEspera = (order.observations || '').toLowerCase().includes('espera');
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedKitOrder(order)}
                      className={cn(
                        "w-full min-h-11 text-left p-3 space-y-1.5 cursor-pointer active:bg-zinc-100",
                        isCompleted ? "bg-zinc-50/40" : isEspera ? "bg-amber-50/30" : "bg-white"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-xs text-zinc-900">#{order.orderNumber} <span className="text-zinc-500 font-semibold">· {order.kitProductCode}</span></div>
                          <div className="font-bold text-sm text-zinc-900 leading-snug">{order.kitProductDescription}</div>
                        </div>
                        <span className={cn(
                          "shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
                          isCompleted
                            ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                            : isProgress
                              ? "bg-zinc-100 text-zinc-900 border-zinc-300"
                              : isPending
                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                : "bg-zinc-100 text-zinc-700 border-zinc-300"
                        )}>
                          {isCompleted ? 'Concluído' : isProgress ? 'Em Montagem' : isPending ? 'Pendente' : order.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-600">
                        <span className="font-mono font-bold text-zinc-900">{order.quantity} <span className="text-[11px] font-normal text-zinc-500">solicitado</span></span>
                        <span className="font-mono font-semibold text-emerald-700">{order.quantityAssembled ?? 0} <span className="text-[11px] font-normal text-zinc-400">montado</span></span>
                        <span>{order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '—'}</span>
                        <span className="font-mono">{formatDurationBetween(order.createdAt, order.completedAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                        <span className="truncate">{order.assembledBy || '—'}{order.observations ? ` · ${order.observations}` : ''}</span>
                        <span className="shrink-0 px-3 py-2 bg-zinc-900 text-white rounded-lg text-xs font-semibold">Editar</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50/90 border-b border-zinc-200 text-[11px] font-bold text-zinc-600 uppercase tracking-wider select-none">
                    <ColumnFilterHeader
                      columnKey="orderNumber"
                      label="Nº Ordem"
                      options={kitsColumnOptions.orderNumber || []}
                      selectedValues={kitsColumnFilters.orderNumber}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="w-28"
                    />
                    <ColumnFilterHeader
                      columnKey="createdAt"
                      label="Data"
                      options={kitsColumnOptions.createdAt || []}
                      selectedValues={kitsColumnFilters.createdAt}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="w-28"
                    />
                    <ColumnFilterHeader
                      columnKey="kitProductCode"
                      label="REF SKU"
                      options={kitsColumnOptions.kitProductCode || []}
                      selectedValues={kitsColumnFilters.kitProductCode}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="w-24"
                    />
                    <ColumnFilterHeader
                      columnKey="kitProductDescription"
                      label="Kit Comercial"
                      options={kitsColumnOptions.kitProductDescription || []}
                      selectedValues={kitsColumnFilters.kitProductDescription}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="min-w-[260px]"
                    />
                    <th className="py-3 px-4 text-right w-36">Quantidade</th>
                    <ColumnFilterHeader
                      columnKey="status"
                      label="Status Montagem"
                      options={kitsColumnOptions.status || []}
                      selectedValues={kitsColumnFilters.status}
                      onFilterChange={handleKitsColumnFilterChange}
                      align="center"
                      className="w-36"
                    />
                    <th className="py-3 px-4 text-center w-36">Tempo / Duração</th>
                    <ColumnFilterHeader
                      columnKey="assembledBy"
                      label="Responsável"
                      options={kitsColumnOptions.assembledBy || []}
                      selectedValues={kitsColumnFilters.assembledBy}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="w-40"
                    />
                    <th className="py-3 px-4 min-w-[180px]">Observações / Espera</th>
                    <th className="py-3 px-3 text-center w-20">Ações</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {loadingKits ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center text-zinc-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                        <p className="text-xs font-semibold">Carregando ordens de kits...</p>
                      </td>
                    </tr>
                  ) : filteredKitOrders.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center text-zinc-400">
                        <Boxes className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                        <p className="text-sm font-semibold text-zinc-700">Nenhuma ordem de kit encontrada</p>
                        <p className="text-xs text-zinc-400 mt-1">As ordens geradas no módulo de montagem de kits aparecerão aqui automaticamente.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredKitOrders.map((order) => {
                      const isCompleted = order.status === 'COMPLETED';
                      const isProgress = order.status === 'IN_PROGRESS';
                      const isPending = order.status === 'PENDING';
                      const isEspera = (order.observations || '').toLowerCase().includes('espera');

                      return (
                        <tr
                          key={order.id}
                          className={cn(
                            "hover:bg-zinc-50/80 transition-colors",
                            isCompleted ? "bg-zinc-50/40" : isEspera ? "bg-amber-50/20" : "bg-white"
                          )}
                        >
                          {/* Nº Ordem */}
                          <td className="py-2.5 px-4 font-mono font-bold text-xs text-zinc-900 select-all whitespace-nowrap">
                            #{order.orderNumber}
                          </td>

                          {/* Data */}
                          <td className="py-2.5 px-4 text-zinc-650 font-medium whitespace-nowrap">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '—'}
                          </td>

                          {/* REF SKU */}
                          <td className="py-2.5 px-4 font-mono text-zinc-600 font-semibold whitespace-nowrap">
                            {order.kitProductCode}
                          </td>

                          {/* Kit Descrição */}
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-zinc-900 leading-snug">
                              {order.kitProductDescription}
                            </div>
                          </td>

                          {/* Quantidade Solicitada vs Montada */}
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="font-mono font-bold text-xs text-zinc-900">
                              {order.quantity} <span className="text-[11px] md:text-[10px] text-zinc-500">solicitado</span>
                            </div>
                            <div className="text-[11px] font-mono text-emerald-700 font-semibold">
                              {order.quantityAssembled ?? 0} <span className="text-[11px] md:text-[10px] text-zinc-400">montado</span>
                            </div>
                          </td>

                          {/* Status Montagem */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] md:text-[10px] font-bold border",
                              isCompleted
                                ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                : isProgress
                                  ? "bg-zinc-100 text-zinc-900 border-zinc-300"
                                  : isPending
                                    ? "bg-amber-100 text-amber-900 border-amber-300"
                                    : "bg-zinc-100 text-zinc-700 border-zinc-300"
                            )}>
                              {isCompleted ? 'Concluído' : isProgress ? 'Em Montagem' : isPending ? 'Pendente' : order.status}
                            </span>
                          </td>

                          {/* Tempo / Duração */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            <div className={cn(
                              "font-mono font-bold text-xs",
                              isCompleted ? "text-emerald-800" : isProgress ? "text-zinc-700" : "text-zinc-600"
                            )}>
                              {formatDurationBetween(order.createdAt, order.completedAt)}
                            </div>
                            <div className="text-[11px] md:text-[10px] text-zinc-400 font-medium">
                              {isCompleted ? 'tempo total' : isProgress ? 'em montagem' : 'aguardando'}
                            </div>
                          </td>

                          {/* Responsável */}
                          <td className="py-2.5 px-4 text-xs text-zinc-700 font-medium whitespace-nowrap">
                            {order.assembledBy || '—'}
                          </td>

                          {/* Observações / Espera */}
                          <td className="py-2.5 px-4 text-xs text-zinc-600 truncate max-w-xs">
                            {order.observations || <span className="text-zinc-300 italic">—</span>}
                          </td>

                          {/* Ações */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedKitOrder(order)}
                              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé da tabela de Kits */}
            <div className="bg-zinc-50 px-4 py-2.5 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-500">
              <span>
                Exibindo <strong>{filteredKitOrders.length}</strong> de <strong>{kitOrders.length}</strong> ordens de kits
              </span>
              <span>
                Integrado diretamente com o módulo de <strong>Gerenciamento de Kits</strong>.
              </span>
            </div>
          </div>
        </div>
  );
}
