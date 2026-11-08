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

import SeletorKit from './SeletorKit';

export default function DrawerNovaOrdem({ ctx }: { ctx: any }) {
  const { allKitsDropdown, handleCreateOrder, handleKitChange, newComponentLotes, newKitNotes, newKitQty, newOrderNumber, selectedKitCode, selectedKitObj, setNewComponentLotes, setNewKitNotes, setNewKitQty, setNewOrderNumber, setShowNewOrderModal, submittingNewOrder } = ctx;
  return (
    <>
        <Drawer
          onClose={() => setShowNewOrderModal(false)}
          title="Nova Ordem de Montagem"
          subtitle="Criar ordem de montagem de kit"
          size="md"
        >
            <form onSubmit={handleCreateOrder} className="space-y-4 text-xs font-medium text-zinc-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Lote da Ordem</label>
                  <input 
                    type="text" 
                    value={newOrderNumber}
                    onChange={(e) => setNewOrderNumber(e.target.value)}
                    placeholder="Ex: KIT-15423"
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                    required
                  />
                  <p className="text-[9px] text-zinc-455 italic mt-0.5">Editável. As próximas ordens seguirão a ordem sequencial.</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Quantidade a Montar</label>
                  <input 
                    type="number" 
                    value={newKitQty}
                    onChange={(e) => setNewKitQty(e.target.value)}
                    min="1"
                    className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Selecionar Kit</label>
                <SeletorKit kits={allKitsDropdown} valor={selectedKitCode} onChange={(c: string) => handleKitChange(c)} />
              </div>

              {/* Components individual lotes form section */}
              {selectedKitObj && selectedKitObj.componentes && selectedKitObj.componentes.length > 0 && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-zinc-800 font-bold border-b pb-1.5">
                    <ClipboardList size={14} />
                    <span>Lotes de Fabricação dos Componentes (Opcional)</span>
                  </div>
                  <p className="text-[9px] text-zinc-400">
                    Se você já souber quais lotes dos produtos individuais serão usados, digite-os abaixo. Caso contrário, imprima a ordem em branco para preenchimento manual no chão de fábrica e registre depois.
                  </p>
                  
                  <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                    {selectedKitObj.componentes.map(comp => {
                      const kitQty = parseFloat(String(newKitQty)) || 0;
                      const need = kitComponentNeedQty(
                        Number(comp.quantidade) || 1,
                        kitQty,
                        comp.fator_proporcao_qtd,
                        comp.fator_proporcao_kits,
                      );
                      return (
                      <div key={comp.codigo} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-2 last:border-none">
                        <div className="flex-1 truncate">
                          <span className="font-bold text-zinc-900 text-[11px] block truncate">{comp.descricao}</span>
                          <span className="text-[9px] text-zinc-500">
                            REF: {comp.codigo} |{' '}
                            {formatQtyPerKitLabel(
                              Number(comp.quantidade) || 1,
                              comp.fator_proporcao_qtd,
                              comp.fator_proporcao_kits,
                            )}{' '}
                            | Nec: <strong className="text-zinc-800">{need} un</strong>
                            {comp.fonte === 'item' ? ' · embalagem/insumo' : ''}
                          </span>
                        </div>
                        <input
                          type="text"
                          placeholder={comp.fonte === 'item' ? 'Lote / lote embalagem…' : 'Lote do produto...'}
                          value={newComponentLotes[comp.codigo] || ''}
                          onChange={(e) => setNewComponentLotes({ ...newComponentLotes, [comp.codigo]: e.target.value })}
                          className="border border-zinc-350 bg-white rounded-lg px-2.5 py-1.5 text-xs w-full sm:w-44 focus:outline-none"
                        />
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-extrabold uppercase block">Observações da Ordem</label>
                <textarea 
                  value={newKitNotes}
                  onChange={(e) => setNewKitNotes(e.target.value)}
                  placeholder="Instruções de expedição, montagem específica..."
                  rows={3}
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => setShowNewOrderModal(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-xl hover:bg-zinc-50 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  disabled={submittingNewOrder}
                  onClick={(e) => handleCreateOrder(e, true)}
                  className="px-4 py-2 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-900 rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Criar a ordem e abrir imediatamente a janela de impressão"
                >
                  <Printer size={14} />
                  {submittingNewOrder ? "Gerando..." : "Gerar e Imprimir"}
                </button>
                <button 
                  type="submit"
                  disabled={submittingNewOrder}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingNewOrder ? "Gerando..." : "Gerar Ordem"}
                </button>
              </div>
            </form>
        </Drawer>
    </>
  );
}
