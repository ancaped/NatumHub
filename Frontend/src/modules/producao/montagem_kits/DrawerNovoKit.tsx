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

export default function DrawerNovoKit({ ctx }: { ctx: any }) {
  const { kitComposicao, newKitSearch, products, setIsDrawerOpen, setIsNewKitModalOpen, setNewKitSearch, setSelectedDrawerKitCode, setSelectedDrawerKitDesc } = ctx;
  return (
    <>
        <Drawer
          onClose={() => { setIsNewKitModalOpen(false); setNewKitSearch(''); }}
          title="Compor Novo Kit"
          subtitle="Definir composição para um produto"
          size="md"
        >
            <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
              <p className="text-xs text-zinc-500 font-medium">
                Pesquise e selecione qualquer produto cadastrado no sistema para iniciar a definição da sua composição (estrutura de insumos).
              </p>

              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Pesquise por código ou descrição do produto..."
                  value={newKitSearch}
                  onChange={(e) => setNewKitSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 text-xs font-semibold text-zinc-900"
                />
              </div>

              <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-100">
                {products
                  .filter(p => {
                    if (!newKitSearch.trim()) return false;
                    const q = newKitSearch.toLowerCase();
                    return (
                      (p.codigo || '').toLowerCase().includes(q) ||
                      (p.descricao || '').toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 50)
                  .map(p => {
                    const isAlreadyKit = kitComposicao.some(kc => kc.kit_codigo === p.codigo);
                    return (
                      <button
                        key={p.codigo}
                        type="button"
                        onClick={() => {
                          setSelectedDrawerKitCode(p.codigo);
                          setSelectedDrawerKitDesc(p.descricao);
                          setIsDrawerOpen(true);
                          setIsNewKitModalOpen(false);
                          setNewKitSearch('');
                        }}
                        className="w-full text-left p-3 hover:bg-zinc-50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md border border-zinc-200">
                              {p.codigo}
                            </span>
                            <span className="text-xs font-bold text-zinc-950 truncate">
                              {p.descricao}
                            </span>
                          </div>
                        </div>
                        {isAlreadyKit ? (
                          <span className="text-[10px] font-bold text-zinc-400 shrink-0">
                            Já possui composição
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-zinc-700 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-md shrink-0">
                            Iniciar composição
                          </span>
                        )}
                      </button>
                    );
                  })}
                {newKitSearch.trim() && products.filter(p => {
                  const q = newKitSearch.toLowerCase();
                  return (
                    (p.codigo || '').toLowerCase().includes(q) ||
                    (p.descricao || '').toLowerCase().includes(q)
                  );
                }).length === 0 && (
                  <div className="p-8 text-center text-zinc-400 font-bold text-xs">
                    Nenhum produto encontrado com essa busca.
                  </div>
                )}
                {!newKitSearch.trim() && (
                  <div className="p-8 text-center text-zinc-450 font-bold text-xs space-y-1">
                    <Search className="w-5 h-5 text-zinc-350 mx-auto" />
                    <p>Comece a digitar para pesquisar produtos.</p>
                  </div>
                )}
              </div>
            </div>
        </Drawer>
    </>
  );
}
