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

export default function DrawerEditarOrdemConversao({ ctx }: { ctx: any }) {
  const { editViraAssembledBy, editViraCheckedBy, editViraMotivo, editViraNotes, editViraPackagingLines, editViraQuantityAssembled, editViraStatus, handleUpdateViraOrder, selectedViraOrder, setEditViraAssembledBy, setEditViraCheckedBy, setEditViraMotivo, setEditViraNotes, setEditViraPackagingLines, setEditViraQuantityAssembled, setEditViraStatus, setLancarErpViraId, setShowEditViraOrderModal, submittingEditViraOrder } = ctx;
  return (
    <>
        <Drawer
          onClose={() => setShowEditViraOrderModal(false)}
          title={`Lote ${selectedViraOrder.orderNumber}`}
          subtitle="Retorno de lote / ordem de conversão"
          size="lg"
        >
            <form onSubmit={handleUpdateViraOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Status da Produção</label>
                  <select
                    value={editViraStatus}
                    onChange={(e) => setEditViraStatus(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900 font-bold text-zinc-900 bg-white"
                  >
                    <option value="PENDING">Em Montagem (Pendente)</option>
                    <option value="COMPLETED">Concluída</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lançado no ERP?</label>
                  <div className="flex items-center min-h-11 sm:min-h-9">
                    {selectedViraOrder.erpLaunched === 1 ? (
                      <span className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-800">
                        Lançado no ERP
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLancarErpViraId(selectedViraOrder.id)}
                        title="Salve a ordem antes: o lançamento usa o que está salvo"
                        className="px-3 py-1.5 min-h-11 sm:min-h-0 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer"
                      >
                        Lançar no ERP
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Operador Montador</label>
                  <input
                    type="text"
                    value={editViraAssembledBy}
                    onChange={(e) => setEditViraAssembledBy(e.target.value)}
                    placeholder="Nome do operador..."
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Conferente Expedição</label>
                  <input
                    type="text"
                    value={editViraCheckedBy}
                    onChange={(e) => setEditViraCheckedBy(e.target.value)}
                    placeholder="Nome do conferente..."
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-900"
                  />
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                  Ajuste de Quantidade Realizada (itens PARA)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-zinc-400 font-bold block">QTD. PROGRAMADA PARA:</span>
                    <span className="font-bold text-zinc-650 block">{selectedViraOrder.quantity} un</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Qtd. real convertida</label>
                    <input
                      type="number"
                      value={editViraQuantityAssembled}
                      onChange={(e) => setEditViraQuantityAssembled(parseFloat(e.target.value) || 0)}
                      className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900"
                      required
                    />
                  </div>
                </div>
              </div>

              {editViraPackagingLines.length > 0 && (
                <div className="border border-zinc-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-extrabold text-[10px] uppercase text-zinc-500 tracking-wider">
                    Embalagens — confirmar retornos
                  </h4>
                  {editViraPackagingLines
                    .filter((l) => l.role === 'return')
                    .map((line) => {
                      const i = editViraPackagingLines.indexOf(line);
                      return (
                        <label
                          key={`edit-ret-${line.code}-${i}`}
                          className="flex items-center gap-2 text-[11px] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={line.returned !== false}
                            onChange={(e) => {
                              const next = [...editViraPackagingLines];
                              next[i] = { ...line, returned: e.target.checked };
                              setEditViraPackagingLines(next);
                            }}
                          />
                          <span className="font-bold text-zinc-600 w-16">Retornou</span>
                          <span className="font-mono flex-1 truncate">
                            {line.code} · {line.description}
                          </span>
                          <span className="font-bold text-zinc-700">{line.qty}</span>
                        </label>
                      );
                    })}
                  {editViraPackagingLines.filter((l) => l.role === 'consume').length > 0 && (
                    <div className="pt-2 border-t border-zinc-100 space-y-1">
                      <p className="text-[9px] font-bold text-amber-700 uppercase">Saídas (destino)</p>
                      {editViraPackagingLines
                        .filter((l) => l.role === 'consume')
                        .map((line, i) => (
                          <div key={`edit-con-${line.code}-${i}`} className="flex justify-between text-[11px]">
                            <span className="font-mono truncate">
                              {line.code} · {line.description}
                            </span>
                            <span className="font-bold">{line.qty}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Motivo / embalagem</label>
                <input
                  type="text"
                  value={editViraMotivo}
                  onChange={(e) => setEditViraMotivo(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs"
                  placeholder="Ex.: origem não retornou — danificada"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block flex items-center gap-1">
                  <FileText size={10} />
                  Observações de Retorno / Ocorrências
                </label>
                <textarea
                  value={editViraNotes}
                  onChange={(e) => setEditViraNotes(e.target.value)}
                  placeholder="Ex: Conversão concluída..."
                  rows={3}
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditViraOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEditViraOrder}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingEditViraOrder ? 'Salvando...' : 'Salvar Retorno'}
                </button>
              </div>
            </form>
        </Drawer>
    </>
  );
}
