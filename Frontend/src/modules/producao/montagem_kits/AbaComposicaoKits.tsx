import { usePreviaServidor, mensagemErroServidor } from '../lib/usePreviaServidor';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Layers, AlertTriangle, UploadCloud, Plus } from 'lucide-react';
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

import { BotaoAcao, FilterBar } from '../../geral/components/ui/ReportKit';

export default function AbaComposicaoKits({ ctx }: { ctx: any }) {
  const { handleUploadKitsConfig, kitCompSearch, kitComposicao, masterKitsList, setIsDrawerOpen, setIsNewKitModalOpen, setKitCompSearch, setSelectedDrawerKitCode, setSelectedDrawerKitDesc, uploadingKitsConfig } = ctx;
  return (
    <>
          <div className="space-y-4 animate-in fade-in duration-200 flex-1 flex flex-col overflow-hidden">
            <FilterBar busca={kitCompSearch} onBusca={setKitCompSearch} placeholder="Buscar kit por código ou descrição...">
              <BotaoAcao primario className="min-h-11 md:min-h-0" onClick={() => setIsNewKitModalOpen(true)}>
                <Plus size={14} /> Compor novo kit
              </BotaoAcao>
              <label className="tab-btn min-h-11 md:min-h-0 cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: '0.75rem' }}>
                <UploadCloud size={14} />
                {uploadingKitsConfig ? 'Importando...' : 'Importar Excel (.xlsx)'}
                <input type="file" accept=".xlsx" className="hidden" onChange={handleUploadKitsConfig} disabled={uploadingKitsConfig} />
              </label>
            </FilterBar>

            {/* Lista Mestre-Detalhe dos Kits Montáveis */}
            <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="px-4 md:px-6 py-3.5 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-zinc-600">
                <span>Catálogo de Kits Montáveis ({masterKitsList.length})</span>
                <span className="text-[11px] text-zinc-400 font-normal">Clique em um kit para gerenciar seus insumos/proporções</span>
              </div>

              <div className="overflow-y-auto flex-1 p-4">
                {masterKitsList.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400 font-bold space-y-2">
                    <Layers className="w-8 h-8 mx-auto text-zinc-300" />
                    <p>Nenhum kit encontrado.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {masterKitsList.map((kit) => {
                      const kitItems = kitComposicao.filter(row => row.kit_codigo === kit.codigo);
                      const compCount = kitItems.length;
                      return (
                        <div
                          key={kit.codigo}
                          onClick={() => {
                            setSelectedDrawerKitCode(kit.codigo);
                            setSelectedDrawerKitDesc(kit.descricao);
                            setIsDrawerOpen(true);
                          }}
                          className="p-4 bg-white border border-zinc-200 hover:border-zinc-900 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-4 group relative overflow-hidden"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-extrabold px-2.5 py-1 bg-zinc-100 group-hover:bg-zinc-900 group-hover:text-white text-zinc-900 rounded-lg transition-colors">
                                {kit.codigo}
                              </span>
                              {compCount > 0 ? (
                                <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full font-bold text-[11px] inline-flex items-center gap-1">
                                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                                  {compCount} {compCount === 1 ? 'insumo' : 'insumos'}
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full font-bold text-[11px] inline-flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  Sem composição
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm font-bold text-zinc-900 line-clamp-2 leading-snug">
                              {kit.descricao}
                            </h4>
                          </div>

                          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                            <div className="text-[11px] text-zinc-500 font-medium">
                              {compCount > 0 ? (
                                <span className="text-zinc-600">
                                  Insumos ativos vinculados
                                </span>
                              ) : (
                                <span className="text-amber-600 font-semibold">
                                  Configure a estrutura do kit
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="px-3 py-1.5 bg-zinc-100 group-hover:bg-zinc-900 text-zinc-700 group-hover:text-white rounded-xl font-bold transition-all inline-flex items-center gap-1.5 shadow-xs"
                            >
                              Ver / Editar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
    </>
  );
}
