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

export default function AbaComponentesAlertas({ ctx }: { ctx: any }) {
  const { expandedKits, fetchKits, handleOpenNewOrderModal, handleQuickCreateAndPrintKit, kitMontarQtys, kits, kitsSearch, kitsSelectedStatus, loading, setKitMontarQtys, setKitsPage, setKitsSearch, setKitsSelectedStatus, toggleKitExpanded } = ctx;
  return (
    <>
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-200">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Buscar kit por código ou descrição..." 
                  className="w-full text-xs border border-zinc-300 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-zinc-950 bg-white"
                  value={kitsSearch}
                  onChange={(e) => { setKitsSearch(e.target.value); setKitsPage(1); }}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <select 
                  className="text-xs border border-zinc-300 rounded-xl px-3 py-2 bg-white focus:outline-none"
                  value={kitsSelectedStatus}
                  onChange={(e) => { setKitsSelectedStatus(e.target.value); setKitsPage(1); }}
                >
                  <option value="ALL">Todos os Alertas</option>
                  <option value="critico">Crítico: Produzir</option>
                  <option value="ordem">Abrir Ordem</option>
                  <option value="montar">Montar Urgente</option>
                  <option value="aguardando">Aguardando Produção</option>
                  <option value="saudavel">Estoque OK</option>
                  <option value="abundante">Abundante</option>
                </select>

                <button 
                  onClick={fetchKits}
                  className="p-2.5 bg-white border border-zinc-300 rounded-xl text-zinc-550 hover:text-zinc-900 cursor-pointer"
                  title="Atualizar"
                >
                  {loading ? <RefreshCw className="animate-spin h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* List Table */}
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              {loading ? (
                <div className="py-16 text-center text-zinc-400 flex flex-col items-center gap-2">
                  <RefreshCw className="animate-spin h-8 w-8 text-zinc-300" />
                  <span className="text-xs font-medium">Calculando estoques e alertas de componentes...</span>
                </div>
              ) : kits.length === 0 ? (
                <div className="py-16 text-center text-zinc-400">
                  <Layers size={40} className="mx-auto text-zinc-200 mb-2" />
                  <span className="text-xs font-bold text-zinc-700">Nenhum kit encontrado com os filtros selecionados</span>
                </div>
              ) : (
                <>
                <div className="md:hidden divide-y divide-zinc-100">
                  {kits.map((k) => {
                    const isExpanded = expandedKits.includes(k.codigo);
                    const currentQty = kitMontarQtys[k.codigo] !== undefined
                      ? kitMontarQtys[k.codigo]
                      : (k.producao_recomendada > 0 ? k.producao_recomendada : (k.max_montavel > 0 ? k.max_montavel : 10));
                    const capClass = k.max_montavel === 0
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : k.max_montavel < k.producao_recomendada
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    return (
                      <div key={k.codigo} className="p-3 space-y-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="font-extrabold text-zinc-950 text-sm">{k.codigo}</span>
                            <span className="block font-bold text-zinc-900 text-xs break-words">{k.descricao}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-extrabold text-zinc-900 block">{k.estoque} un</span>
                            <span className="text-[10px] text-zinc-400">Ped: {k.pedidos_aberto} un</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                            k.status === 'critico' ? 'bg-red-50 text-red-700 border border-red-200' :
                            k.status === 'ordem' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            k.status === 'montar' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                            k.status === 'aguardando' ? 'bg-zinc-100 text-zinc-700 border border-zinc-200' :
                            'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>{k.status_label}</span>
                          <span className={`px-2 py-1 rounded border text-[9px] font-extrabold ${capClass}`}>Máx: {k.max_montavel} un</span>
                          {k.producao_recomendada > 0 && (
                            <span className="text-[10px] font-bold text-red-600 ml-auto">Produzir {k.producao_recomendada} un</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            value={currentQty}
                            onChange={(e) => { const val = e.target.value; setKitMontarQtys(prev => ({ ...prev, [k.codigo]: val })); }}
                            className="w-20 min-h-11 text-right border border-zinc-300 rounded-xl px-2 text-sm font-bold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            aria-label="Quantidade a montar"
                          />
                          <span className="text-[10px] text-zinc-400 font-semibold">un</span>
                          <button onClick={() => handleOpenNewOrderModal(k.codigo)} className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 text-white text-xs font-bold cursor-pointer">
                            <PlusCircle size={14} /> Ordem
                          </button>
                          <button onClick={() => handleQuickCreateAndPrintKit(k, currentQty)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-700 cursor-pointer" aria-label="Gerar e imprimir ordem" title="Gerar e imprimir">
                            <Printer size={16} />
                          </button>
                          <button onClick={() => toggleKitExpanded(k.codigo)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-700 cursor-pointer" aria-label="Ver componentes" aria-expanded={isExpanded}>
                            {isExpanded ? <X size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 divide-y divide-zinc-100">
                            <div className="px-3 py-2 text-[10px] font-extrabold uppercase text-zinc-500">Componentes ({k.componentes?.length || 0})</div>
                            {k.componentes?.map(comp => (
                              <div key={comp.codigo} className="px-3 py-2 text-xs space-y-0.5">
                                <div className="flex justify-between gap-2">
                                  <span className="font-bold text-zinc-800">{comp.codigo}</span>
                                  <span className="font-bold text-zinc-900">
                                    {formatQtyPerKitLabel(Number(comp.quantidade) || 1, comp.fator_proporcao_qtd, comp.fator_proporcao_kits)}
                                  </span>
                                </div>
                                <span className="block text-zinc-700 break-words">{comp.descricao}</span>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">
                                  <span>Estoque <b className="text-zinc-900">{comp.estoque} un</b></span>
                                  <span>Produção {comp.producao} un</span>
                                  <span>Pedidos {comp.pedidos_aberto} un</span>
                                  {comp.fonte === 'item' ? (
                                    <span className="font-bold uppercase text-amber-700">embalagem/insumo</span>
                                  ) : comp.necessita_producao ? (
                                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold">Produzir</span>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-550 font-bold uppercase text-[9px]">
                        <th style={{ width: '4%' }}></th>
                        <th style={{ width: '10%' }}>Código</th>
                        <th style={{ width: '26%' }}>Descrição</th>
                        <th style={{ width: '10%' }} className="text-right">Estoque</th>
                        <th style={{ width: '12%' }}>Status Alerta</th>
                        <th style={{ width: '10%' }} className="text-right">Sug. Produção</th>
                        <th style={{ width: '12%' }}>Capacidade</th>
                        <th style={{ width: '12%' }} className="text-right">Qtd a Montar</th>
                        <th style={{ width: '8%', textAlign: 'center' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kits.map((k) => {
                        const isExpanded = expandedKits.includes(k.codigo);
                        let capacityClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                        if (k.max_montavel === 0) {
                          capacityClass = "bg-red-50 text-red-700 border-red-200";
                        } else if (k.max_montavel < k.producao_recomendada) {
                          capacityClass = "bg-amber-50 text-amber-700 border-amber-255";
                        }

                        const currentQty = kitMontarQtys[k.codigo] !== undefined
                          ? kitMontarQtys[k.codigo]
                          : (k.producao_recomendada > 0 ? k.producao_recomendada : (k.max_montavel > 0 ? k.max_montavel : 10));

                        return (
                          <React.Fragment key={k.codigo}>
                            <tr className={`border-b border-zinc-150 ${isExpanded ? 'bg-zinc-50/20' : ''}`}>
                              <td className="p-3 text-center">
                                <button 
                                  onClick={() => toggleKitExpanded(k.codigo)}
                                  className="p-1 hover:bg-zinc-100 rounded text-zinc-655 cursor-pointer"
                                >
                                  {isExpanded ? <X size={12} /> : <Eye size={12} />}
                                </button>
                              </td>
                              <td className="p-3 font-extrabold text-zinc-955">{k.codigo}</td>
                              <td className="p-3 font-bold text-zinc-900">{k.descricao}</td>
                              <td className="p-3 text-right font-bold text-zinc-900">
                                {k.estoque} un
                                <span className="block font-medium text-[10px] text-zinc-400">Ped: {k.pedidos_aberto} un</span>
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${
                                  k.status === 'critico' ? 'bg-red-50 text-red-700 border border-red-200' :
                                  k.status === 'ordem' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  k.status === 'montar' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                  k.status === 'aguardando' ? 'bg-zinc-900 text-white border border-zinc-900' :
                                  'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                  {k.status_label}
                                </span>
                              </td>
                              <td className="p-3 text-right font-extrabold text-zinc-900">
                                {k.producao_recomendada > 0 ? (
                                  <span className="text-red-600">{k.producao_recomendada} un</span>
                                ) : (
                                  <span className="text-zinc-450">-</span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded border text-[9px] font-extrabold tracking-wide ${capacityClass}`}>
                                  Máx: {k.max_montavel} un
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    value={currentQty}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setKitMontarQtys(prev => ({ ...prev, [k.codigo]: val }));
                                    }}
                                    className="w-16 text-right border border-zinc-300 rounded-lg px-2 py-1 text-xs font-bold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                                    title="Editar quantidade a montar para este kit"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-semibold">un</span>
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button 
                                    onClick={() => handleQuickCreateAndPrintKit(k, currentQty)}
                                    className="p-1.5 hover:bg-zinc-100 text-zinc-700 hover:text-zinc-950 rounded-lg cursor-pointer"
                                    title="Gerar e Imprimir Ordem de Montagem diretamente com esta quantidade"
                                  >
                                    <Printer size={15} />
                                  </button>
                                  <button 
                                    onClick={() => handleOpenNewOrderModal(k.codigo)}
                                    className="p-1.5 hover:bg-zinc-100 text-zinc-700 hover:text-zinc-950 rounded-lg cursor-pointer"
                                    title="Configurar Ordem de Montagem detalhada"
                                  >
                                    <PlusCircle size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded components list */}
                            {isExpanded && (
                              <tr className="bg-zinc-50/50">
                                <td colSpan={9} className="p-4 border-b border-zinc-200">
                                  <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 text-xs">
                                    <h4 className="font-extrabold text-zinc-900 border-b pb-2 mb-3">Componentes do Kit ({k.componentes?.length || 0})</h4>
                                    <table className="w-full text-xs text-left border-collapse">
                                      <thead>
                                        <tr className="text-zinc-400 font-bold border-b border-zinc-100 pb-1">
                                          <th className="pb-2">REF</th>
                                          <th className="pb-2">Componente</th>
                                          <th className="pb-2 text-center">Qtd/Kit</th>
                                          <th className="pb-2 text-right">Estoque</th>
                                          <th className="pb-2 text-right">Produção</th>
                                          <th className="pb-2 text-right">Pedidos</th>
                                          <th className="pb-2 text-center">Necessita Produzir</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {k.componentes?.map(comp => (
                                          <tr key={comp.codigo} className="border-b border-zinc-100 last:border-none">
                                            <td className="py-2.5 font-bold text-zinc-800">{comp.codigo}</td>
                                            <td className="py-2.5 text-zinc-700">
                                              <span className="block">{comp.descricao}</span>
                                              {comp.fonte === 'item' && (
                                                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700">embalagem/insumo</span>
                                              )}
                                            </td>
                                            <td className="py-2.5 text-center font-bold text-zinc-900">
                                              {formatQtyPerKitLabel(
                                                Number(comp.quantidade) || 1,
                                                comp.fator_proporcao_qtd,
                                                comp.fator_proporcao_kits,
                                              )}
                                            </td>
                                            <td className="py-2.5 text-right font-bold text-zinc-900">{comp.estoque} un</td>
                                            <td className="py-2.5 text-right text-zinc-500">{comp.producao} un</td>
                                            <td className="py-2.5 text-right text-zinc-500">{comp.pedidos_aberto} un</td>
                                            <td className="py-2.5 text-center">
                                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                                comp.necessita_producao 
                                                  ? 'bg-red-50 text-red-700' 
                                                  : 'bg-zinc-100 text-zinc-450'
                                              }`}>
                                                {comp.fonte === 'item' ? '—' : (comp.necessita_producao ? 'Sim' : 'Não')}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
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
