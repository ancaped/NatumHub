import React from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { rotuloLote, getLoteEtapaStatus } from '../lib/lotes';
import { Play, RefreshCw, PauseCircle, Tag } from 'lucide-react';
import { MOTIVOS_PAUSA_PADRAO } from '../lib/constantes';
import { cn } from '../../../geral/lib/utils';
import type { AcompanhamentoLote } from '../lib/tipos';

export interface PausaLoteModalProps {
  handlePauseInsumoLookup: (codeStr: string) => Promise<void>;
  handleResumeLote: (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => Promise<void>;
  handleSavePause: () => Promise<void>;
  pauseInsumoCodigo: string;
  pauseInsumoDescricao: string;
  pauseLoadingInsumo: boolean;
  pauseModalEtapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase';
  pauseModalLote: AcompanhamentoLote;
  pauseMotivoCustom: string;
  pauseTipoMotivo: string;
  savingPause: boolean;
  setPauseInsumoCodigo: React.Dispatch<React.SetStateAction<string>>;
  setPauseInsumoDescricao: React.Dispatch<React.SetStateAction<string>>;
  setPauseModalEtapa: React.Dispatch<React.SetStateAction<'pesagem' | 'producao' | 'rotulagem' | 'envase'>>;
  setPauseModalLote: React.Dispatch<React.SetStateAction<AcompanhamentoLote>>;
  setPauseMotivoCustom: React.Dispatch<React.SetStateAction<string>>;
  setPauseTipoMotivo: React.Dispatch<React.SetStateAction<string>>;
}

export default function PausaLoteModal({ handlePauseInsumoLookup, handleResumeLote, handleSavePause, pauseInsumoCodigo, pauseInsumoDescricao, pauseLoadingInsumo, pauseModalEtapa, pauseModalLote, pauseMotivoCustom, pauseTipoMotivo, savingPause, setPauseInsumoCodigo, setPauseInsumoDescricao, setPauseModalEtapa, setPauseModalLote, setPauseMotivoCustom, setPauseTipoMotivo }: PausaLoteModalProps) {
  return (
<Drawer size="md" onClose={() => setPauseModalLote(null)}
  title={`Pausar Lote ${rotuloLote(pauseModalLote.loteNumber)}`}
  badge={<span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-900 border border-amber-300 font-semibold uppercase">{pauseModalEtapa === 'pesagem' ? 'Pesagem' : pauseModalEtapa === 'producao' ? 'Produção' : pauseModalEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase'}</span>}
  subtitle={<span className="block whitespace-normal font-sans">[{pauseModalLote.productCode}] {pauseModalLote.productDescription}</span>}
  footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div>
                {getLoteEtapaStatus(pauseModalLote, pauseModalEtapa).isEspera && (
                  <button
                    type="button"
                    onClick={() => {
                      handleResumeLote(pauseModalLote, pauseModalEtapa);
                      setPauseModalLote(null);
                    }}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    <span>Retomar {
                      pauseModalEtapa === 'pesagem' ? 'Pesagem' :
                      pauseModalEtapa === 'producao' ? 'Produção' :
                      pauseModalEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase'
                    }</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPauseModalLote(null)}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold text-zinc-600 hover:bg-zinc-100 cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSavePause}
                  disabled={savingPause}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingPause ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <PauseCircle className="h-3.5 w-3.5" />
                      <span>Confirmar Pausa ({
                        pauseModalEtapa === 'pesagem' ? 'Pesagem' :
                        pauseModalEtapa === 'producao' ? 'Produção' :
                        pauseModalEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase'
                      })</span>
                    </>
                  )}
                </button>
              </div>
            </div>
}>
<div className="space-y-4">

            {/* SELETOR DE ETAPAS / SETORES ISOLADOS */}
            <div>
              <label className="font-bold text-zinc-700 block mb-1 text-xs">
                Setor da Fábrica (Pausa Isolada):
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 rounded-xl border border-zinc-200">
                {(['pesagem', 'producao', 'rotulagem', 'envase'] as const).map(et => {
                  const etLabels: Record<string, string> = {
                    pesagem: 'Pesagem',
                    producao: 'Produção',
                    rotulagem: 'Rotulagem',
                    envase: 'Envase'
                  };
                  const isSelected = pauseModalEtapa === et;
                  const etStatus = getLoteEtapaStatus(pauseModalLote, et);
                  return (
                    <button
                      key={et}
                      type="button"
                      onClick={() => {
                        setPauseModalEtapa(et);
                        const info = getLoteEtapaStatus(pauseModalLote, et);
                        setPauseInsumoCodigo(info.insumoFaltanteCodigo || '');
                        setPauseInsumoDescricao(info.insumoFaltanteDescricao || '');
                        if (info.insumoFaltanteCodigo) {
                          setPauseTipoMotivo('Falta de Insumo / Matéria-Prima');
                          setPauseMotivoCustom('');
                        } else if (info.motivoEspera) {
                          if (MOTIVOS_PAUSA_PADRAO.includes(info.motivoEspera)) {
                            setPauseTipoMotivo(info.motivoEspera);
                            setPauseMotivoCustom('');
                          } else {
                            setPauseTipoMotivo('Outro Motivo');
                            setPauseMotivoCustom(info.motivoEspera);
                          }
                        } else {
                          setPauseTipoMotivo('Falta de Insumo / Matéria-Prima');
                          setPauseMotivoCustom('');
                        }
                      }}
                      className={cn(
                        "py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5",
                        isSelected
                          ? "bg-zinc-900 text-white shadow-2xs"
                          : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70"
                      )}
                    >
                      <span>{etLabels[et]}</span>
                      {etStatus.isEspera && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title={`Pausa ativa em ${etLabels[et]}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-zinc-700 block mb-1.5">
                  Motivo da Pausa em {
                    pauseModalEtapa === 'pesagem' ? 'Pesagem' :
                    pauseModalEtapa === 'producao' ? 'Produção' :
                    pauseModalEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase'
                  }:
                </label>
                <select
                  value={pauseTipoMotivo}
                  onChange={e => setPauseTipoMotivo(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  {MOTIVOS_PAUSA_PADRAO.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Se for Falta de Insumo / Matéria-Prima: Busca por Código SKU */}
              {pauseTipoMotivo === 'Falta de Insumo / Matéria-Prima' && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-amber-600" />
                      Insumo Faltante (Código / SKU):
                    </span>
                    {pauseLoadingInsumo && (
                      <span className="text-[11px] text-amber-700 flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Buscando produto...
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-1">
                      <input
                        type="text"
                        value={pauseInsumoCodigo}
                        onChange={e => handlePauseInsumoLookup(e.target.value)}
                        placeholder="Ex: MP-001"
                        className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-900 uppercase focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={pauseInsumoDescricao}
                        onChange={e => setPauseInsumoDescricao(e.target.value)}
                        placeholder="Descrição exata do insumo..."
                        className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    💡 Ao informar o código, todos os lotes que aguardam este insumo poderão ser filtrados simultaneamente nas telas de produção e relatórios.
                  </p>
                </div>
              )}

              {/* Se for Outro Motivo */}
              {pauseTipoMotivo === 'Outro Motivo' && (
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">
                    Descreva o motivo da pausa:
                  </label>
                  <input
                    type="text"
                    value={pauseMotivoCustom}
                    onChange={e => setPauseMotivoCustom(e.target.value)}
                    placeholder="Ex: Quebra do agitador mecânico..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              )}

              {/* Dica operacional */}
              <div className="text-[11px] text-zinc-600 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200">
                📌 <strong>Isolamento Operacional:</strong> A pausa configurada é <strong>exclusiva</strong> do setor selecionado (<span className="font-bold uppercase text-zinc-800">{pauseModalEtapa}</span>). Os outros setores da fábrica continuam operando normalmente sem bloqueio nem badges de espera.
              </div>
            </div>

</div>
</Drawer>
  );
}
