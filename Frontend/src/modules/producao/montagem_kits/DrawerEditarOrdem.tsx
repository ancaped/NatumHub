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

export default function DrawerEditarOrdem({ ctx }: { ctx: any }) {
  const { editAssembledBy, editCheckedBy, editComponentLotes, editComponentUsedQty, editErpLaunched, editNotes, editOrderNumber, editQuantity, editQuantityAssembled, editStatus, handleKitQuantityAssembledChange, handlePrintOrder, handleUpdateOrder, selectedOrder, setEditAssembledBy, setEditCheckedBy, setEditComponentLotes, setEditComponentUsedQty, setEditNotes, setEditOrderNumber, setEditQuantity, setEditStatus, setLancarErpOrdemId, setShowEditOrderModal, submittingEditOrder } = ctx;
  return (
    <>
        <Drawer
          onClose={() => setShowEditOrderModal(false)}
          title={`Lote ${editOrderNumber || selectedOrder.orderNumber}`}
          subtitle="Retorno / edição da ordem de montagem"
          size="lg"
          headerActions={
                <button
                  type="button"
                  onClick={() => {
                    const parsedEditQty = parseFloat(String(editQuantity)) || selectedOrder.quantity || 0;
                    let list = [];
                    try {
                      if (selectedOrder.componentsLotes) {
                        const originalList = JSON.parse(selectedOrder.componentsLotes);
                        list = originalList.map(item => ({
                          ...item,
                          lote: editComponentLotes[item.code] || "",
                          used_qty:
                            editComponentUsedQty[item.code] !== undefined
                              ? parseFloat(editComponentUsedQty[item.code])
                              : kitOrderComponentNeed(item, parseFloat(String(editQuantityAssembled)) || 0),
                          need_qty: kitOrderComponentNeed(item, parsedEditQty),
                        }));
                      }
                    } catch (err) {}
                    handlePrintOrder({
                      ...selectedOrder,
                      orderNumber: editOrderNumber || selectedOrder.orderNumber,
                      quantity: parsedEditQty,
                      quantityAssembled: parseFloat(String(editQuantityAssembled)) || 0,
                      status: editStatus,
                      assembledBy: editAssembledBy,
                      checkedBy: editCheckedBy,
                      observations: editNotes,
                      erpLaunched: editErpLaunched ? 1 : 0,
                      componentsLotes: list.length > 0 ? JSON.stringify(list) : selectedOrder.componentsLotes,
                    });
                  }}
                  className="px-2.5 py-1 hover:bg-zinc-100 rounded-lg text-zinc-700 hover:text-zinc-950 flex items-center gap-1 text-xs font-bold border border-zinc-200 cursor-pointer shadow-xs"
                  title="Imprimir folha desta ordem com os valores atuais"
                >
                  <Printer size={13} />
                  <span>Imprimir Folha</span>
                </button>
          }
        >
            <form onSubmit={handleUpdateOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-3">
                <div>
                  <span className="text-[10px] text-zinc-400 font-extrabold uppercase block">Produto Kit</span>
                  <span className="font-bold text-zinc-900">{selectedOrder.kitProductDescription} ({selectedOrder.kitProductCode})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-200/60">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lote da Ordem</label>
                    <input 
                      type="text"
                      value={editOrderNumber}
                      onChange={(e) => setEditOrderNumber(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg p-2 text-xs font-mono font-bold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Qtd a Montar (Prog.)</label>
                    <input 
                      type="number"
                      step="any"
                      min="1"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg p-2 text-xs font-bold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      required
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-extrabold uppercase block">Data Emissão</span>
                    <span className="font-bold text-zinc-800 text-xs mt-2 block">{selectedOrder.createdAt}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 col-span-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white font-bold text-zinc-900"
                  >
                    <option value="PENDING">Pendente</option>
                    <option value="COMPLETED">Concluída</option>
                  </select>
                </div>
                <div className="space-y-1 col-span-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Qtd Real Montada</label>
                  <input
                    type="number"
                    step="any"
                    value={editQuantityAssembled}
                    onChange={(e) => {
                      const val = e.target.value;
                      let list = [];
                      try {
                        if (selectedOrder.componentsLotes) {
                          list = JSON.parse(selectedOrder.componentsLotes);
                        }
                      } catch (err) {}
                      handleKitQuantityAssembledChange(val, list);
                    }}
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-bold text-zinc-900 bg-white"
                  />
                </div>
                <div className="space-y-1 col-span-1 flex items-end">
                  {selectedOrder.erpLaunched === 1 ? (
                    <span className="flex items-center justify-center border border-emerald-200 rounded-xl p-2.5 w-full bg-emerald-50 font-bold text-emerald-800 text-[10px] h-10">
                      Lançado no ERP
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLancarErpOrdemId(selectedOrder.id)}
                      className="flex items-center justify-center border border-zinc-900 rounded-xl p-2.5 w-full bg-zinc-900 text-white font-bold text-[10px] h-10 min-h-11 sm:min-h-10"
                    >
                      Lançar no ERP
                    </button>
                  )}
                </div>
              </div>

              {/* Responsible Operator Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                    <User size={10} />
                    Quem Montou
                  </label>
                  <input 
                    type="text" 
                    value={editAssembledBy}
                    onChange={(e) => setEditAssembledBy(e.target.value)}
                    placeholder="Nome do operador..."
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                    <User size={10} />
                    Quem Conferiu
                  </label>
                  <input 
                    type="text" 
                    value={editCheckedBy}
                    onChange={(e) => setEditCheckedBy(e.target.value)}
                    placeholder="Nome do conferente..."
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              </div>

              {/* Components lotes section */}
              {(() => {
                try {
                  if (selectedOrder.componentsLotes) {
                    const list = JSON.parse(selectedOrder.componentsLotes);
                    const parsedPlannedKitQty = parseFloat(String(editQuantity)) || selectedOrder.quantity || 0;
                    return (
                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-1.5 text-zinc-800 font-bold border-b pb-1.5">
                          <ClipboardList size={14} />
                          <span>Lotes de Fabricação dos Componentes Individuais</span>
                        </div>
                        <p className="text-[9px] text-zinc-400">
                          Preencha com os lotes retornados no papel de montagem preenchido manualmente.
                        </p>
                        
                        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                          {list.map(item => {
                            const planned = kitOrderComponentNeed(item, parsedPlannedKitQty);
                            const used =
                              editComponentUsedQty[item.code] !== undefined
                                ? editComponentUsedQty[item.code]
                                : kitOrderComponentNeed(
                                    item,
                                    parseFloat(String(editQuantityAssembled)) || parsedPlannedKitQty || 0,
                                  );
                            return (
                            <div key={item.code} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-2 last:border-none">
                              <div className="flex-1 truncate">
                                <span className="font-bold text-zinc-900 text-[11px] block truncate">{item.description}</span>
                                <span className="text-[9px] text-zinc-555">
                                  REF: {item.code} |{' '}
                                  {formatQtyPerKitLabel(
                                    item.expected_qty,
                                    item.fator_proporcao_qtd,
                                    item.fator_proporcao_kits,
                                  )}{' '}
                                  | Nec: <strong>{planned} un</strong>
                                  {editStatus === 'COMPLETED' ? ` | Usada: ${used} un` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="flex flex-col space-y-0.5">
                                  <span className="text-[8px] uppercase text-zinc-400 font-bold">Lote</span>
                                  <input
                                    type="text"
                                    placeholder="Lote..."
                                    value={editComponentLotes[item.code] || ''}
                                    onChange={(e) => setEditComponentLotes({ ...editComponentLotes, [item.code]: e.target.value })}
                                    className="border border-zinc-300 bg-white rounded-lg px-2.5 py-1 text-xs w-28 focus:outline-none"
                                  />
                                </div>
                                <div className="flex flex-col space-y-0.5">
                                  <span className="text-[8px] uppercase text-zinc-400 font-bold">Qtd Usada</span>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="Qtd..."
                                    value={
                                      editComponentUsedQty[item.code] !== undefined
                                        ? editComponentUsedQty[item.code]
                                        : kitOrderComponentNeed(
                                            item,
                                            parseFloat(String(editQuantityAssembled)) || 0,
                                          )
                                    }
                                    onChange={(e) => setEditComponentUsedQty({ ...editComponentUsedQty, [item.code]: e.target.value })}
                                    className="border border-zinc-300 bg-white rounded-lg px-2.5 py-1 text-xs w-20 focus:outline-none font-semibold text-zinc-900"
                                  />
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                } catch (err) {
                  return <div className="text-red-500 font-bold">Erro ao exibir componentes</div>;
                }
              })()}

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                  <FileText size={10} />
                  Observações de Retorno / Ocorrências
                </label>
                <textarea 
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Ex: Danificou embalagem do item X, trocado por lote Y..."
                  rows={3}
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setShowEditOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  disabled={submittingEditOrder}
                  onClick={(e) => handleUpdateOrder(e, true)}
                  className="px-4 py-2 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-900 rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Salvar alterações e imprimir a folha de montagem atualizada"
                >
                  <Printer size={14} />
                  {submittingEditOrder ? "Salvando..." : "Salvar e Imprimir"}
                </button>
                <button 
                  type="submit"
                  disabled={submittingEditOrder}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingEditOrder ? "Salvando..." : "Salvar Retorno"}
                </button>
              </div>
            </form>
        </Drawer>
    </>
  );
}
