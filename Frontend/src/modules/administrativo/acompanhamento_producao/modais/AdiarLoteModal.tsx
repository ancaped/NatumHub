import React from 'react';
import Modal from '../../../geral/components/ui/Modal';
import { rotuloLote } from '../lib/lotes';
import { formatDateOnly, formatWeekdayAndDate } from '../lib/datas';
import { Undo2, Calendar, Clock, RefreshCw, Check } from 'lucide-react';
import type { AdiarModalItem, LoteAdiadoRegistro } from '../lib/tipos';

export interface AdiarLoteModalProps {
  adiarModalItem: AdiarModalItem;
  handleCancelAdiarLote: (loteNumber: string, targetDateToRestore?: string, etapa?: string, productCode?: string) => Promise<void>;
  handleConfirmAdiarLote: (targetDate: string) => Promise<void>;
  lotesAdiadosHistorico: LoteAdiadoRegistro[];
  savingAdiarLote: boolean;
  setAdiarModalItem: React.Dispatch<React.SetStateAction<AdiarModalItem>>;
  setQuickDate: (daysToAdd: number) => void;
  setQuickNextMonday: () => void;
}

export default function AdiarLoteModal({ adiarModalItem, handleCancelAdiarLote, handleConfirmAdiarLote, lotesAdiadosHistorico, savingAdiarLote, setAdiarModalItem, setQuickDate, setQuickNextMonday }: AdiarLoteModalProps) {
  return (
<Modal title="Adiar Lote" subtitle={adiarModalItem.etapaLabel || 'Programação de Produção / Envase'} size="sm" onClose={() => { if (!savingAdiarLote) setAdiarModalItem(null); }}>

            {/* Modal Body */}
            <div className="space-y-4">
              {/* Card Resumo do Lote */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-black px-2.5 py-1 bg-zinc-900 text-white rounded-lg shadow-2xs">
                    {rotuloLote(adiarModalItem.loteNumber)}
                  </span>
                  {adiarModalItem.productCode && (
                    <span className="text-[11px] font-mono font-bold text-zinc-500 bg-white border border-zinc-200 px-2 py-0.5 rounded-md">
                      {adiarModalItem.productCode}
                    </span>
                  )}
                </div>
                {adiarModalItem.productDescription && (
                  <p className="text-xs font-bold text-zinc-800 leading-snug line-clamp-2">
                    {adiarModalItem.productDescription}
                  </p>
                )}
                <div className="pt-2 border-t border-zinc-200/80 flex items-center justify-between text-xs">
                  <span className="text-zinc-500 font-medium">Data Atual:</span>
                  <span className="font-mono font-bold text-zinc-700">
                    {formatDateOnly(adiarModalItem.currentDate)}
                    {adiarModalItem.currentDate ? ` (${formatWeekdayAndDate(adiarModalItem.currentDate).split(',')[0]})` : ''}
                  </span>
                </div>

                {(() => {
                  const reg = lotesAdiadosHistorico.find(r => r.loteNumber === adiarModalItem.loteNumber);
                  if (!reg || !reg.dataOriginal) return null;
                  return (
                    <div className="pt-2 border-t border-red-200 flex items-center justify-between gap-2 text-xs bg-red-50/70 p-2.5 rounded-lg border border-red-200">
                      <div className="text-[11px] text-red-950 leading-tight">
                        <span className="font-extrabold block text-red-800">⚠️ Lote com adiamento registrado:</span>
                        <span className="text-zinc-600 font-medium">Original: <strong>{formatDateOnly(reg.dataOriginal)}</strong> ➔ Previsto: <strong>{formatDateOnly(reg.dataAdiadoPara)}</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelAdiarLote(adiarModalItem.loteNumber, reg.dataOriginal, adiarModalItem.origem, adiarModalItem.productCode)}
                        className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                        title="Cancelar o adiamento deste lote e retornar para a data de origem"
                      >
                        <Undo2 className="h-3 w-3" />
                        <span>Desfazer Adiamento</span>
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Seletor de Data */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold text-zinc-800 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-zinc-600" />
                  <span>Selecione a Nova Data Desejada</span>
                </label>

                <input
                  type="date"
                  value={adiarModalItem.targetDate}
                  onChange={e => {
                    const val = e.target.value;
                    setAdiarModalItem(prev => prev ? { ...prev, targetDate: val } : null);
                  }}
                  className="w-full bg-white border-2 border-zinc-200 focus:border-zinc-900 rounded-xl px-3 py-2 text-sm font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 cursor-pointer shadow-xs transition-colors"
                />

                {/* Prévia amigável por extenso */}
                {adiarModalItem.targetDate && (
                  <div className="p-2.5 bg-zinc-50/70 border border-zinc-200 rounded-xl text-xs text-zinc-950 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-zinc-600 shrink-0" />
                    <div>
                      <span className="text-[11px] text-zinc-700 block font-semibold">Previsão confirmada:</span>
                      <strong className="text-xs font-bold capitalize">
                        {formatWeekdayAndDate(adiarModalItem.targetDate)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Atalhos Rápidos de Data */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
                  Atalhos Rápidos:
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuickDate(1)}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-zinc-50 hover:text-zinc-700 hover:border-zinc-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center"
                    title="Adiar em 1 dia"
                  >
                    +1 Dia
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate(2)}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-zinc-50 hover:text-zinc-700 hover:border-zinc-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center"
                    title="Adiar em 2 dias"
                  >
                    +2 Dias
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate(3)}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-zinc-50 hover:text-zinc-700 hover:border-zinc-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center"
                    title="Adiar em 3 dias"
                  >
                    +3 Dias
                  </button>
                  <button
                    type="button"
                    onClick={setQuickNextMonday}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-zinc-50 hover:text-zinc-700 hover:border-zinc-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center truncate"
                    title="Adiar para a próxima segunda-feira útil"
                  >
                    Próx. Seg
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate(7)}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-zinc-50 hover:text-zinc-700 hover:border-zinc-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center"
                    title="Adiar em 1 semana (7 dias)"
                  >
                    +1 Sem
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 mt-4 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setAdiarModalItem(null)}
                disabled={savingAdiarLote}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 bg-zinc-200/80 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => handleConfirmAdiarLote(adiarModalItem.targetDate)}
                disabled={savingAdiarLote || !adiarModalItem.targetDate}
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingAdiarLote ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Confirmar p/ {formatDateOnly(adiarModalItem.targetDate)}</span>
                  </>
                )}
              </button>
            </div>
</Modal>
  );
}
