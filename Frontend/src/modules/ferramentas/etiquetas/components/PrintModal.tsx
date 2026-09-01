import React, { useState } from 'react';
import { Printer, X, Check, AlertCircle, Sparkles, Hash, Copy, Layout, Loader2, ExternalLink } from 'lucide-react';
import type { LabelTemplate, PrintConfig } from '../lib/types';
import { printLabelBatch, openPrintWindow } from '../lib/printService';
import { labelsApi } from '../lib/labelsApi';
import { printersApi } from '../../impressoras/lib/printersApi';
import type { HubPrinter } from '../../impressoras/lib/types';
import PrinterSelector from './PrinterSelector';

interface PrintModalProps {
  template: LabelTemplate;
  isOpen: boolean;
  onClose: () => void;
  onPrintSuccess?: () => void;
}

export default function PrintModal({ template, isOpen, onClose, onPrintSuccess }: PrintModalProps) {
  const [copies, setCopies] = useState<number>(1);
  const [enableSequence, setEnableSequence] = useState<boolean>(false);
  const [sequenceStart, setSequenceStart] = useState<number>(1);
  const [sequenceTotal, setSequenceTotal] = useState<number>(10);
  const [sequencePadding, setSequencePadding] = useState<number>(2);
  const [selectedPrinter, setSelectedPrinter] = useState<HubPrinter | null>(null);

  if (!isOpen) return null;

  const handleConfirmPrint = async () => {
    const totalCopies = enableSequence ? Math.max(1, sequenceTotal - sequenceStart + 1) : copies;
    const config: PrintConfig = {
      copies: totalCopies,
      enableSequence,
      sequenceStart,
      sequenceTotal: enableSequence ? sequenceTotal : copies,
      sequencePadding,
    };

    printLabelBatch(template, config);

    // Record in history & spooler queue
    try {
      await labelsApi.recordPrint({
        template_id: template.id.startsWith('template_') ? undefined : template.id,
        template_name: template.name,
        copies: totalCopies,
        printer_name: selectedPrinter?.name || 'Térmica 100x50mm',
      });

      if (selectedPrinter) {
        try {
          await printersApi.createPrintJob({
            printer_id: selectedPrinter.id,
            title: `Etiquetas ${template.name}`,
            template_id: template.id.startsWith('template_') ? undefined : template.id,
            payload_type: 'label_canvas_json',
            payload_data: JSON.stringify(template),
            copies: totalCopies,
          });
        } catch (jobErr) {
          console.warn('Não foi possível enfileirar print job:', jobErr);
        }
      }

      if (onPrintSuccess) onPrintSuccess();
    } catch (e) {
      console.warn('Erro ao salvar histórico de impressão:', e);
    }

    onClose();
  };

  const handleOpenWindow = () => {
    const totalCopies = enableSequence ? Math.max(1, sequenceTotal - sequenceStart + 1) : copies;
    const config: PrintConfig = {
      copies: totalCopies,
      enableSequence,
      sequenceStart,
      sequenceTotal: enableSequence ? sequenceTotal : copies,
      sequencePadding,
    };

    openPrintWindow(template, config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-zinc-900 text-white rounded-xl">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Imprimir Etiquetas</h2>
              <p className="text-xs text-zinc-500 font-mono">
                {template.name} ({template.width_mm}x{template.height_mm}mm)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-sm text-zinc-700">
          {/* Copies or Sequence */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-900">Quantidade de Etiquetas</label>
              <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setEnableSequence(false)}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    !enableSequence ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-500'
                  }`}
                >
                  Cópias
                </button>
                <button
                  type="button"
                  onClick={() => setEnableSequence(true)}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    enableSequence ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-500'
                  }`}
                >
                  Sequência
                </button>
              </div>
            </div>

            {!enableSequence ? (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-24 border border-zinc-300 rounded-xl p-2 font-mono text-center font-bold text-sm bg-zinc-50 focus:bg-white"
                />
                <span className="text-xs text-zinc-500">etiquetas idênticas</span>
              </div>
            ) : (
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[11px] text-zinc-500 block mb-1">Início:</span>
                    <input
                      type="number"
                      min="1"
                      value={sequenceStart}
                      onChange={(e) => setSequenceStart(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full border border-zinc-300 rounded-lg p-1.5 font-mono text-center font-bold text-xs bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-500 block mb-1">Fim / Total:</span>
                    <input
                      type="number"
                      min={sequenceStart}
                      value={sequenceTotal}
                      onChange={(e) => setSequenceTotal(Math.max(sequenceStart, parseInt(e.target.value, 10) || sequenceStart))}
                      className="w-full border border-zinc-300 rounded-lg p-1.5 font-mono text-center font-bold text-xs bg-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Integrated Printer Selector */}
          <PrinterSelector
            selectedPrinter={selectedPrinter}
            onSelectPrinter={setSelectedPrinter}
          />

          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <Layout className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Dica de Impressão Térmica:</span>
            </p>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              1. No diálogo, selecione Layout <strong>Paisagem (Horizontal)</strong>.<br />
              2. Em Margens, escolha <strong>Nenhuma (0mm)</strong> para preenchimento total de 100x50mm.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleOpenWindow}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer"
            title="Abre a impressão em uma janela separada"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Abrir Janela</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmPrint}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-sm active:scale-98"
            >
              <Printer className="h-4 w-4" />
              <span>
                Imprimir {enableSequence ? sequenceTotal - sequenceStart + 1 : copies}{' '}
                {copies === 1 && !enableSequence ? 'Etiqueta' : 'Etiquetas'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
