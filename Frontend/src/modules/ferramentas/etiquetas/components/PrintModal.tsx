import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Printer, X } from 'lucide-react';
import type { LabelTemplate, PrintConfig } from '../lib/types';
import { openPrintWindow } from '../lib/printService';
import { printLabelDirect, readLabelFeed, type LabelFeed } from '../lib/directPrint';
import { readLabelFillScale } from '../lib/printService';
import { renderLabelPngDataUrl } from '../lib/printCanvasRenderer';
import { labelsApi } from '../lib/labelsApi';
import { printersApi } from '../../impressoras/lib/printersApi';
import type { HubPrinter } from '../../impressoras/lib/types';
import PrinterSelector from './PrinterSelector';
import LabelFillControl from './LabelFillControl';

interface PrintModalProps {
  template: LabelTemplate;
  isOpen: boolean;
  onClose: () => void;
  onPrintSuccess?: () => void;
  initialCopies?: number;
  initialEnableSequence?: boolean;
  initialSequenceStart?: number;
  initialSequenceTotal?: number;
  history?: {
    product_code?: string;
    product_name?: string;
    lot_number?: string;
  };
}

export default function PrintModal({
  template,
  isOpen,
  onClose,
  onPrintSuccess,
  initialCopies = 1,
  initialEnableSequence = false,
  initialSequenceStart = 1,
  initialSequenceTotal = 10,
  history,
}: PrintModalProps) {
  const [copies, setCopies] = useState(initialCopies);
  const [enableSequence, setEnableSequence] = useState(initialEnableSequence);
  const [sequenceStart, setSequenceStart] = useState(initialSequenceStart);
  const [sequenceTotal, setSequenceTotal] = useState(initialSequenceTotal);
  const [selectedPrinter, setSelectedPrinter] = useState<HubPrinter | null>(null);
  const [sending, setSending] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [feed, setFeed] = useState<LabelFeed>('landscape');
  const [fillPercent, setFillPercent] = useState(100);

  const totalPages = enableSequence ? Math.max(1, sequenceTotal - sequenceStart + 1) : 1;

  useEffect(() => {
    if (!isOpen) return;
    setCopies(initialCopies);
    setEnableSequence(initialEnableSequence);
    setSequenceStart(initialSequenceStart);
    setSequenceTotal(initialSequenceTotal);
    setPreviewPage(0);
    setPrintError(null);
    setFeed(readLabelFeed());
    setFillPercent(readLabelFillScale());
  }, [isOpen, template.id, initialCopies, initialEnableSequence, initialSequenceStart, initialSequenceTotal]);

  useEffect(() => {
    if (previewPage > totalPages - 1) setPreviewPage(Math.max(0, totalPages - 1));
  }, [previewPage, totalPages]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setPreviewLoading(true);
    const pageIndex = enableSequence ? Math.min(previewPage, totalPages - 1) : 0;
    renderLabelPngDataUrl(
      template,
      pageIndex,
      enableSequence ? sequenceTotal : copies,
      enableSequence ? sequenceStart : 1,
      2,
      160
    )
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, template, previewPage, enableSequence, sequenceStart, sequenceTotal, copies, totalPages]);

  if (!isOpen) return null;

  const labelW = template.width_mm || 100;
  const labelH = template.height_mm || 50;
  const portrait = feed === 'portrait';
  const outW = portrait ? labelH : labelW;
  const outH = portrait ? labelW : labelH;
  const fit = Math.min(480 / outW, 280 / outH);
  const frameW = Math.round(outW * fit);
  const frameH = Math.round(outH * fit);
  const zoom = fillPercent / 100;

  const buildConfig = (): PrintConfig => {
    const totalCopies = enableSequence ? totalPages : copies;
    return {
      copies: totalCopies,
      enableSequence,
      sequenceStart,
      sequenceTotal: enableSequence ? sequenceTotal : copies,
      sequencePadding: 2,
    };
  };

  const handleConfirmPrint = async () => {
    const config = buildConfig();
    if (!selectedPrinter) {
      setPrintError('Selecione a impressora cadastrada no Windows.');
      return;
    }

    setSending(true);
    setPrintError(null);
    try {
      await printLabelDirect(template, config, selectedPrinter);
    } catch (err: any) {
      setPrintError(err?.message || 'Não foi possível imprimir.');
      setSending(false);
      return;
    }

    try {
      await labelsApi.recordPrint({
        template_id: template.id.startsWith('template_') ? undefined : template.id,
        template_name: template.name,
        copies: config.copies,
        printer_name: selectedPrinter.name,
        product_code: history?.product_code,
        product_name: history?.product_name,
        lot_number: history?.lot_number,
      });
      try {
        await printersApi.createPrintJob({
          printer_id: selectedPrinter.id,
          title: `Etiquetas ${template.name}`,
          template_id: template.id.startsWith('template_') ? undefined : template.id,
          payload_type: 'label_canvas_json',
          payload_data: JSON.stringify(template),
          copies: config.copies,
        });
      } catch (jobErr) {
        console.warn('Não foi possível enfileirar print job:', jobErr);
      }
      if (onPrintSuccess) onPrintSuccess();
    } catch (e) {
      console.warn('Erro ao salvar histórico de impressão:', e);
    }

    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-zinc-900 text-white rounded-xl">
              <Printer className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-zinc-900">Visualizar impressão</h2>
              <p className="text-xs text-zinc-500 font-mono truncate">
                {template.name} · {labelW}×{labelH} mm
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-5 min-h-0">
          <div className="lg:col-span-3 bg-zinc-100 p-6 flex flex-col items-center justify-center gap-4">
            <div
              className="bg-white border border-zinc-300 shadow-md relative overflow-hidden"
              style={{ width: frameW, height: frameH }}
            >
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Prévia da etiqueta"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: portrait ? frameH : frameW,
                    height: portrait ? frameW : frameH,
                    transform: `translate(-50%, -50%) rotate(${portrait ? 90 : 0}deg) scale(${zoom})`,
                    transformOrigin: 'center center',
                  }}
                />
              )}
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!enableSequence || previewPage <= 0}
                onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-mono font-bold text-zinc-700">
                {enableSequence
                  ? `Página ${previewPage + 1} de ${totalPages}`
                  : copies === 1
                    ? '1 cópia idêntica'
                    : `${copies} cópias idênticas`}
              </span>
              <button
                type="button"
                disabled={!enableSequence || previewPage >= totalPages - 1}
                onClick={() => setPreviewPage((p) => Math.min(totalPages - 1, p + 1))}
                className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              {portrait ? 'Em pé' : 'Deitada'} · preenchimento {fillPercent}%
            </p>
          </div>

          <div className="lg:col-span-2 p-5 space-y-4 border-t lg:border-t-0 lg:border-l border-zinc-100">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900">Páginas</label>
                <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setEnableSequence(false)}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      !enableSequence ? 'bg-white text-zinc-900 shadow-xs font-bold' : 'text-zinc-500'
                    }`}
                  >
                    Cópias
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnableSequence(true)}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
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
                    max="200"
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-24 border border-zinc-300 rounded-xl p-2 font-mono text-center font-bold text-sm bg-zinc-50"
                  />
                  <span className="text-xs text-zinc-500">cópias iguais</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[11px] text-zinc-500 block mb-1">Início</span>
                    <input
                      type="number"
                      min="1"
                      value={sequenceStart}
                      onChange={(e) => setSequenceStart(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full border border-zinc-300 rounded-lg p-1.5 font-mono text-center font-bold text-xs bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-500 block mb-1">Fim</span>
                    <input
                      type="number"
                      min={sequenceStart}
                      value={sequenceTotal}
                      onChange={(e) =>
                        setSequenceTotal(Math.max(sequenceStart, parseInt(e.target.value, 10) || sequenceStart))
                      }
                      className="w-full border border-zinc-300 rounded-lg p-1.5 font-mono text-center font-bold text-xs bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <PrinterSelector selectedPrinter={selectedPrinter} onSelectPrinter={setSelectedPrinter} />
            <LabelFillControl
              onChange={({ percent, feed: nextFeed }) => {
                setFillPercent(percent);
                setFeed(nextFeed);
              }}
            />

            {printError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 leading-relaxed">
                {printError}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => openPrintWindow(template, buildConfig())}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 rounded-xl cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Pelo navegador</span>
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
              disabled={sending}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              <span>
                Imprimir {enableSequence ? totalPages : copies}{' '}
                {(enableSequence ? totalPages : copies) === 1 ? 'etiqueta' : 'etiquetas'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
