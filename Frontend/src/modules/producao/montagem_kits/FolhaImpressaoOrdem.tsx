import { usePreviaServidor, mensagemErroServidor } from '../lib/usePreviaServidor';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, Search, RefreshCw, Layers, ClipboardList, PlusCircle, Trash2, 
  CheckCircle2, Printer, X, Eye, CheckCircle, ExternalLink, Calendar, User, FileText, Settings, AlertTriangle,
  UploadCloud, Plus
} from 'lucide-react';
import { formatQtyPerKitLabel, kitOrderComponentNeed } from '../lib/kitComponentQty';
import {
  linesFromPreview,
  parsePackagingDeductions,
  serializePackagingDeductions,
  splitPackagingLines,
  type PackagingPreviewResponse,
  type ViraPackagingLine,
} from '../lib/viraPackaging';

export default function FolhaImpressaoOrdem({ ctx }: { ctx: any }) {
  const { printingOrder, truncPrint } = ctx;
  return (
    <>
{        printingOrder.isViraPrint || printingOrder.kitProductDescription?.startsWith('CONVERSÃO') ? (
          /* Folha compacta de conversão — formulário manual de chão */
          <div
            id="print-area"
            className="hidden print:block p-5 bg-white text-zinc-900 font-sans w-full max-w-[850px] mx-auto shadow-none text-[9px] leading-tight"
          >
            <div className="flex justify-between items-start border-b border-zinc-900 pb-2 mb-2">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black tracking-tighter">NATUM</span>
                  <span className="text-[8px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">COSMÉTICOS</span>
                </div>
                <p className="text-[8px] font-bold uppercase tracking-widest text-zinc-600">Folha de Conversão de Produto</p>
              </div>
              <div className="text-right">
                <div className="inline-block bg-zinc-950 text-white px-2.5 py-1 rounded text-center">
                  <span className="text-[6px] uppercase font-black text-zinc-300 block">Nº Ordem / Lote Hub</span>
                  <span className="text-sm font-black">{printingOrder.orderNumber}</span>
                </div>
                <p className="text-[7px] text-zinc-500 font-bold mt-1 uppercase">
                  Emissão: {new Date(printingOrder.created_at || Date.now()).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>

            {/* DE → PARA + qtys */}
            <div className="border border-zinc-800 rounded mb-2 overflow-hidden">
              <div className="grid grid-cols-12 divide-x divide-zinc-300">
                <div className="col-span-5 p-1.5">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">DE (origem)</span>
                  <p className="font-mono font-bold text-[9px]">{printingOrder.deCodigo || '—'}</p>
                  <p className="font-semibold text-[8px] text-zinc-700 truncate">
                    {truncPrint(printingOrder.deDescricao, 48)}
                  </p>
                </div>
                <div className="col-span-5 p-1.5">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">PARA (destino)</span>
                  <p className="font-mono font-bold text-[9px]">
                    {printingOrder.paraCodigo || printingOrder.kitProductCode || '—'}
                  </p>
                  <p className="font-semibold text-[8px] text-zinc-700 truncate">
                    {truncPrint(printingOrder.paraDescricao, 48)}
                  </p>
                </div>
                <div className="col-span-2 p-1.5 text-center flex flex-col justify-center bg-zinc-50">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500">Fator</span>
                  <span className="font-black text-[11px]">
                    {printingOrder.viraMeta?.fator ?? '—'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-4 border-t border-zinc-300 divide-x divide-zinc-300 text-center">
                <div className="p-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Qtd DE</span>
                  <span className="font-bold">{printingOrder.viraMeta?.qtyDe ?? '—'}</span>
                </div>
                <div className="p-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Qtd PARA est.</span>
                  <span className="font-bold">
                    {printingOrder.viraMeta?.qtyPara ?? printingOrder.quantity ?? '—'}
                  </span>
                </div>
                <div className="p-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Qtd real PARA</span>
                  <div className="border-b border-dashed border-zinc-600 h-3.5 w-14 mx-auto mt-0.5" />
                </div>
                <div className="p-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Data conversão</span>
                  <div className="border-b border-dashed border-zinc-600 h-3.5 w-16 mx-auto mt-0.5" />
                </div>
              </div>
            </div>

            {/* Lotes produto */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="border border-zinc-400 rounded px-2 py-1.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Lote do produto de origem</span>
                  <span className="font-mono text-[8px] text-zinc-600">{printingOrder.deCodigo}</span>
                </div>
                <div className="border border-zinc-400 rounded h-6 w-28 bg-white shrink-0" title="Preencher à mão" />
              </div>
              <div className="border border-zinc-400 rounded px-2 py-1.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Lote item final (destino)</span>
                  <span className="font-mono text-[8px] text-zinc-600">
                    {printingOrder.paraCodigo || printingOrder.kitProductCode}
                  </span>
                </div>
                <div className="border border-zinc-400 rounded h-6 w-28 bg-white shrink-0" title="Preencher à mão" />
              </div>
            </div>

            {/* Embalagens retorno */}
            <div className="border border-zinc-700 rounded mb-1.5 overflow-hidden">
              <div className="bg-zinc-100 px-2 py-0.5 text-[7px] font-black uppercase tracking-wide text-zinc-700">
                Embalagens retorno (origem) — marcar se retornou ao estoque
              </div>
              <table className="w-full text-[8px] border-collapse">
                <thead>
                  <tr className="border-b border-zinc-400 text-[6.5px] uppercase font-black text-zinc-500">
                    <th className="py-0.5 px-1.5 text-left w-16">Cód.</th>
                    <th className="py-0.5 px-1.5 text-left">Descrição</th>
                    <th className="py-0.5 px-1.5 text-center w-10">Qtd</th>
                    <th className="py-0.5 px-1.5 text-center w-24">Retornou?</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const all = printingOrder.viraReturns || [];
                    const max = 8;
                    const rows = all.slice(0, max);
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="px-1.5 py-1 text-zinc-400 italic">
                            Sem embalagens de retorno sugeridas
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <>
                        {rows.map((r) => (
                          <tr key={`vr-${r.code}`} className="border-t border-zinc-200">
                            <td className="py-0.5 px-1.5 font-mono font-bold">{r.code}</td>
                            <td className="py-0.5 px-1.5">{truncPrint(r.description, 36)}</td>
                            <td className="py-0.5 px-1.5 text-center font-bold">{r.qty}</td>
                            <td className="py-0.5 px-1.5 text-center font-bold tracking-wide">
                              □ Sim&nbsp;&nbsp;□ Não
                            </td>
                          </tr>
                        ))}
                        {all.length > max && (
                          <tr className="border-t border-zinc-200">
                            <td colSpan={4} className="px-1.5 py-0.5 text-zinc-500 italic">
                              +{all.length - max} no Hub (não impressas)
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Embalagens saída */}
            <div className="border border-zinc-700 rounded mb-2 overflow-hidden">
              <div className="bg-zinc-100 px-2 py-0.5 text-[7px] font-black uppercase tracking-wide text-zinc-700">
                Embalagens saída (destino) — preencher lote da embalagem usada
              </div>
              <table className="w-full text-[8px] border-collapse">
                <thead>
                  <tr className="border-b border-zinc-400 text-[6.5px] uppercase font-black text-zinc-500">
                    <th className="py-0.5 px-1.5 text-left w-16">Cód.</th>
                    <th className="py-0.5 px-1.5 text-left">Descrição</th>
                    <th className="py-0.5 px-1.5 text-center w-10">Qtd</th>
                    <th className="py-0.5 px-1.5 text-left w-28">Lote emb.</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const all = printingOrder.viraConsumes || [];
                    const max = 8;
                    const rows = all.slice(0, max);
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="px-1.5 py-1 text-zinc-400 italic">
                            Sem embalagens de saída sugeridas
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <>
                        {rows.map((c) => (
                          <tr key={`vc-${c.code}`} className="border-t border-zinc-200">
                            <td className="py-0.5 px-1.5 font-mono font-bold">{c.code}</td>
                            <td className="py-0.5 px-1.5">{truncPrint(c.description, 36)}</td>
                            <td className="py-0.5 px-1.5 text-center font-bold">{c.qty}</td>
                            <td className="py-0.5 px-1.5">
                              <div className="border border-zinc-400 rounded h-4 w-full bg-white" />
                            </td>
                          </tr>
                        ))}
                        {all.length > max && (
                          <tr className="border-t border-zinc-200">
                            <td colSpan={4} className="px-1.5 py-0.5 text-zinc-500 italic">
                              +{all.length - max} no Hub (não impressas)
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Assinaturas + obs */}
            <div className="grid grid-cols-3 gap-2 mb-1.5 text-[8px]">
              <div className="border border-zinc-400 rounded px-2 py-1">
                <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Montou</span>
                <div className="border-b border-zinc-500 h-4 mt-1" />
              </div>
              <div className="border border-zinc-400 rounded px-2 py-1">
                <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Conferiu</span>
                <div className="border-b border-zinc-500 h-4 mt-1" />
              </div>
              <div className="border border-zinc-400 rounded px-2 py-1">
                <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Data</span>
                <div className="border-b border-zinc-500 h-4 mt-1" />
              </div>
            </div>
            <div className="border border-zinc-400 rounded px-2 py-1 mb-2">
              <span className="text-[6.5px] font-black uppercase text-zinc-500 block">Observações</span>
              <div className="border-b border-dashed border-zinc-400 h-3.5 mt-1" />
              <div className="border-b border-dashed border-zinc-400 h-3.5 mt-1" />
            </div>
            <p className="text-[6.5px] text-zinc-500 font-medium text-center">
              Registro Hub não movimenta estoque — lançar no ERP conforme preenchido nesta folha.
            </p>
          </div>
        ) : (
        <div id="print-area" className="hidden print:flex flex-col justify-between p-8 bg-white text-zinc-900 font-sans min-h-[94vh] w-full max-w-[850px] mx-auto relative shadow-none">
          <div className="space-y-6">
            {/* Elegant Top Header with logo and document type */}
            <div className="flex justify-between items-start border-b border-zinc-200 pb-4">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black tracking-tighter text-zinc-950">NATUM</span>
                  <span className="text-[10px] font-semibold tracking-[0.3em] text-zinc-450 uppercase">COSMÉTICOS</span>
                </div>
                <p className="text-[9px] font-bold text-zinc-455 uppercase tracking-widest mt-1">
                  Ordem de Montagem de Kit
                </p>
              </div>
              <div className="flex flex-col items-end">
                <div className="bg-zinc-950 text-white px-3 py-1.5 rounded-lg text-center min-w-32 shadow-sm">
                  <span className="text-[7px] uppercase font-black text-zinc-300 tracking-widest block mb-0.5">Nº DA ORDEM / LOTE</span>
                  <span className="text-sm font-black tracking-tight">{printingOrder.orderNumber}</span>
                </div>
                <span className="text-[8px] text-zinc-400 font-bold mt-1.5 uppercase">
                  Emissão: {new Date(printingOrder.created_at || Date.now()).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
            
            {/* Info Block - Clean modern layout */}
            <div className="grid grid-cols-12 border border-zinc-200 rounded-xl overflow-hidden divide-x divide-zinc-200 text-[10px]">
              <div className="p-3 bg-zinc-50/50 space-y-1 col-span-6">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">
                  Produto / Kit Comercial
                </span>
                <p className="font-extrabold text-zinc-900 leading-tight">{printingOrder.kitProductDescription}</p>
              </div>
              <div className="p-3 space-y-1 col-span-2 text-center flex flex-col justify-center">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">
                  Código do Kit
                </span>
                <p className="font-mono font-bold text-zinc-800 leading-none mt-1">{printingOrder.kitProductCode}</p>
              </div>
              <div className="p-3 bg-zinc-50/50 space-y-1 col-span-2 text-center flex flex-col justify-center">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">Programada</span>
                <p className="font-bold text-zinc-650 leading-none mt-1">{printingOrder.quantity} un</p>
              </div>
              <div className="p-3 space-y-1 col-span-2 text-center flex flex-col justify-center">
                <span className="text-[7.5px] uppercase font-black text-zinc-400 tracking-wider block">
                  Montada Real
                </span>
                {printingOrder.status === 'COMPLETED' ? (
                  <p className="font-black text-zinc-950 leading-none mt-1">
                    {printingOrder.quantityAssembled !== null && printingOrder.quantityAssembled !== undefined ? printingOrder.quantityAssembled : printingOrder.quantity} un
                  </p>
                ) : (
                  <div className="border-b border-dashed border-zinc-500 h-4 w-16 mx-auto mt-0.5"></div>
                )}
              </div>
            </div>

            {/* Components Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-950 pb-1.5">
                <h3 className="text-[9px] font-black text-zinc-950 uppercase tracking-widest">
                  Instruções e Componentes do Kit
                </h3>
                <span className="text-[8px] text-zinc-450 font-bold uppercase">Nexus — Controle de Fluxo</span>
              </div>
              <table className="w-full text-[9px] border-collapse">
                <thead>
                  <tr className="border-b border-zinc-950 text-zinc-900 font-black text-[8px] uppercase tracking-wider">
                    <th className="py-2 text-left w-20">Código</th>
                    <th className="py-2 text-left">Componente / Descrição</th>
                    <th className="py-2 text-center w-16">Qtd p/ Kit</th>
                    <th className="py-2 text-center w-20">Qtd Prog.</th>
                    <th className="py-2 text-center w-20">Qtd Usada</th>
                    <th className="py-2 text-left w-36 pl-4">Lote Utilizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {(() => {
                    try {
                      if (printingOrder.componentsLotes) {
                        const list = JSON.parse(printingOrder.componentsLotes);
                        return list.map(item => {
                          const kitQty = printingOrder.quantity || 0;
                          const kitDone = printingOrder.quantityAssembled || printingOrder.quantity || 0;
                          const plannedNeed = kitOrderComponentNeed(item, kitQty);
                          const usedQty =
                            item.used_qty !== undefined
                              ? parseFloat(item.used_qty)
                              : kitOrderComponentNeed(item, kitDone);
                          return (
                            <tr key={item.code} className="hover:bg-zinc-50/20">
                              <td className="py-2 font-mono font-bold text-zinc-900">{item.code}</td>
                              <td className="py-2 font-semibold text-zinc-800">{item.description}</td>
                              <td className="py-2 text-center font-bold text-zinc-500">
                                {formatQtyPerKitLabel(
                                  item.expected_qty,
                                  item.fator_proporcao_qtd,
                                  item.fator_proporcao_kits,
                                )}
                              </td>
                              <td className="py-2 text-center font-bold text-zinc-500">{plannedNeed} un</td>
                              <td className="py-2 text-center font-black text-zinc-900">
                                {printingOrder.status === 'COMPLETED' || item.used_qty !== undefined ? (
                                  `${usedQty} un`
                                ) : (
                                  <div className="border-b border-dashed border-zinc-400 h-4 w-12 mx-auto"></div>
                                )}
                              </td>
                              <td className="py-2 pl-4 italic text-zinc-455">
                                {item.lote ? (
                                  <span className="font-bold text-zinc-900 not-italic bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">{item.lote}</span>
                                ) : (
                                  <div className="border border-zinc-300 rounded-md h-6 w-full max-w-32 bg-zinc-50/30"></div>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      }
                    } catch (e) {
                      return <tr><td colSpan={6} className="p-4 text-center text-red-500 font-bold">Erro ao processar componentes</td></tr>;
                    }
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer details - Extremely polished signature grid */}
          <div className="space-y-6">
            {/* Observations */}
            <div className="border border-zinc-200 bg-zinc-50/30 p-3.5 rounded-xl space-y-2">
              <span className="text-[7.5px] uppercase font-black text-zinc-455 tracking-wider block">
                {printingOrder.status === 'COMPLETED' ? 'Observações de Retorno / Ocorrências Registradas' : 'Observações de Retorno / Ocorrências (Preenchimento Manual)'}
              </span>
              {printingOrder.status === 'COMPLETED' ? (
                <p className="text-[9.5px] italic text-zinc-650 leading-tight">
                  {printingOrder.observations || "Nenhuma observação registrada para esta ordem de montagem."}
                </p>
              ) : (
                <div className="space-y-2">
                  {printingOrder.observations && (
                    <p className="text-[9.5px] font-semibold text-zinc-850 mb-1 leading-tight">
                      {printingOrder.observations}
                    </p>
                  )}
                  <div className="border-b border-dashed border-zinc-300 h-4"></div>
                  <div className="border-b border-dashed border-zinc-300 h-4"></div>
                  <div className="border-b border-dashed border-zinc-300 h-4"></div>
                </div>
              )}
            </div>

            {/* Signature Grid */}
            <div className="grid grid-cols-3 gap-6 pt-4 border-t border-zinc-200">
              <div className="border border-zinc-200 bg-zinc-50/20 p-4 rounded-xl space-y-3 h-28 flex flex-col justify-between">
                <span className="text-[8px] font-black text-zinc-950 uppercase tracking-wider block border-b border-zinc-200 pb-1 text-center">
                  1. MONTADOR RESPONSÁVEL
                </span>
                <div className="space-y-2.5 text-[9.5px] text-zinc-650">
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold">Nome:</span>
                    <div className="flex-1 border-b border-zinc-300 h-4"></div>
                  </div>
                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="font-bold">Data:</span>
                    <span className="font-bold">____/____/______</span>
                  </div>
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50/20 p-4 rounded-xl space-y-3 h-28 flex flex-col justify-between">
                <span className="text-[8px] font-black text-zinc-950 uppercase tracking-wider block border-b border-zinc-200 pb-1 text-center">
                  2. CONFERENTE EXPEDIÇÃO
                </span>
                <div className="space-y-2.5 text-[9.5px] text-zinc-650">
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold">Nome:</span>
                    <div className="flex-1 border-b border-zinc-300 h-4"></div>
                  </div>
                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="font-bold">Data:</span>
                    <span className="font-bold">____/____/______</span>
                  </div>
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50/20 p-4 rounded-xl space-y-3 h-28 flex flex-col justify-between">
                <span className="text-[8px] font-black text-zinc-950 uppercase tracking-wider block border-b border-zinc-200 pb-1 text-center">3. RESPONSÁVEL CONTROLE</span>
                <div className="space-y-2.5 text-[9.5px] text-zinc-650">
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold">Nome:</span>
                    <div className="flex-1 border-b border-zinc-300 h-4"></div>
                  </div>
                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="font-bold">Data:</span>
                    <span className="font-bold">____/____/______</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
    </>
  );
}
