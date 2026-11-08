import { usePreviaServidor, mensagemErroServidor } from '../lib/usePreviaServidor';
import React from 'react';
import { RefreshCw, Layers, PlusCircle, Printer } from 'lucide-react';
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

export default function AbaComponentesAlertas({ ctx }: { ctx: any }) {
  const { setKitDetalheCodigo, handleOpenNewOrderModal, handleQuickCreateAndPrintKit, kitMontarQtys, kits, kitsSearch, kitsSelectedStatus, loading, setKitMontarQtys, setKitsPage, setKitsSearch, setKitsSelectedStatus } = ctx;
  return (
    <>
          <div className="space-y-4 animate-in fade-in duration-200">
            <FilterBar busca={kitsSearch} onBusca={(v) => { setKitsSearch(v); setKitsPage(1); }} placeholder="Buscar kit por código ou descrição...">
              <FiltroSelect
                value={kitsSelectedStatus}
                onChange={(v) => { setKitsSelectedStatus(v); setKitsPage(1); }}
                opcoes={[
                  { valor: 'ALL', rotulo: 'Todos os alertas' },
                  { valor: 'critico', rotulo: 'Crítico: produzir' },
                  { valor: 'ordem', rotulo: 'Abrir ordem' },
                  { valor: 'montar', rotulo: 'Montar urgente' },
                  { valor: 'aguardando', rotulo: 'Aguardando produção' },
                  { valor: 'saudavel', rotulo: 'Estoque OK' },
                  { valor: 'abundante', rotulo: 'Abundante' },
                ]}
              />
            </FilterBar>

            {/* List Table */}
            <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
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
                    const currentQty = kitMontarQtys[k.codigo] !== undefined
                      ? kitMontarQtys[k.codigo]
                      : (k.producao_recomendada > 0 ? k.producao_recomendada : (k.max_montavel > 0 ? k.max_montavel : 10));
                    const capClass = k.max_montavel === 0
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : k.max_montavel < k.producao_recomendada
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    return (
                      <div key={k.codigo} role="button" tabIndex={0} onClick={() => setKitDetalheCodigo(k.codigo)} onKeyDown={(e) => { if (e.key === 'Enter') setKitDetalheCodigo(k.codigo); }} className="p-3 space-y-2.5 cursor-pointer active:bg-zinc-50">
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
                          <StatusBadge variante={k.status}>{k.status_label}</StatusBadge>
                          <span className={`px-2 py-1 rounded border text-[9px] font-extrabold ${capClass}`}>Máx: {k.max_montavel} un</span>
                          {k.producao_recomendada > 0 && (
                            <span className="text-[10px] font-bold text-red-600 ml-auto">Produzir {k.producao_recomendada} un</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr>
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
                            <tr onClick={() => setKitDetalheCodigo(k.codigo)} className="border-b border-zinc-150 hover:bg-zinc-50 cursor-pointer">
                              <td className="font-extrabold text-zinc-955">{k.codigo}</td>
                              <td className="font-bold text-zinc-900">{k.descricao}</td>
                              <td className="text-right font-bold text-zinc-900">
                                {k.estoque} un
                                <span className="block font-medium text-[10px] text-zinc-400">Ped: {k.pedidos_aberto} un</span>
                              </td>
                              <td>
                                <StatusBadge variante={k.status}>{k.status_label}</StatusBadge>
                              </td>
                              <td className="text-right font-extrabold text-zinc-900">
                                {k.producao_recomendada > 0 ? (
                                  <span className="text-red-600">{k.producao_recomendada} un</span>
                                ) : (
                                  <span className="text-zinc-450">-</span>
                                )}
                              </td>
                              <td>
                                <span className={`px-2 py-1 rounded border text-[9px] font-extrabold tracking-wide ${capacityClass}`}>
                                  Máx: {k.max_montavel} un
                                </span>
                              </td>
                              <td className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    value={currentQty}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setKitMontarQtys(prev => ({ ...prev, [k.codigo]: val }));
                                    }}
                                    className="w-20 text-right border border-zinc-300 rounded-lg px-2 py-1 text-xs font-bold text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                                    title="Editar quantidade a montar para este kit"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-semibold">un</span>
                                </div>
                              </td>
                              <td className="text-center" onClick={(e) => e.stopPropagation()}>
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
