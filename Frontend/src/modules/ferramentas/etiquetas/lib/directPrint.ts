import type { HubPrinter } from '../../impressoras/lib/types';
import { printersApi } from '../../impressoras/lib/printersApi';
import { renderLabelPngDataUrl } from './printCanvasRenderer';
import { readLabelFillScale } from './printService';
import type { LabelTemplate, PrintConfig } from './types';

const FEED_KEY = 'nexus.labelFeed';

export type LabelFeed = 'landscape' | 'portrait';

/** Deitada é o padrão. Em pé gira 90° na impressora. */
export function readLabelFeed(): LabelFeed {
  try {
    return localStorage.getItem(FEED_KEY) === 'portrait' ? 'portrait' : 'landscape';
  } catch {
    return 'landscape';
  }
}

export function writeLabelFeed(feed: LabelFeed) {
  try {
    localStorage.setItem(FEED_KEY, feed);
  } catch {
    /* ignore */
  }
}

/** Envia a etiqueta ao spooler do Windows, sem o diálogo do navegador. */
export async function printLabelDirect(
  template: LabelTemplate,
  config: PrintConfig,
  printer: HubPrinter
): Promise<void> {
  const printerName = (printer.system_printer_name || '').trim();
  if (!printerName) {
    throw new Error(
      'Essa impressora não está ligada ao nome do Windows. Em Impressoras, importe o dispositivo.'
    );
  }

  const copies = Math.max(1, config.copies || 1);
  if (config.enableSequence && copies > 80) {
    throw new Error('A sequência direta aceita até 80 etiquetas por vez.');
  }

  const dpi = printer.dpi && printer.dpi >= 150 ? printer.dpi : 203;
  const fill = (config.fillScale ?? readLabelFillScale()) / 100;
  const landscape = readLabelFeed() === 'portrait';
  const total = config.sequenceTotal || copies;
  const start = config.sequenceStart || 1;
  const padding = config.sequencePadding || 2;

  const pages: string[] = [];
  let jobCopies = Math.min(copies, 200);
  if (config.enableSequence) {
    for (let i = 0; i < copies; i++) {
      pages.push(await renderLabelPngDataUrl(template, i, total, start, padding, dpi));
    }
    jobCopies = 1;
  } else {
    pages.push(await renderLabelPngDataUrl(template, 0, total, start, padding, dpi));
  }

  await printersApi.printDirect({
    printer_name: printerName,
    width_mm: template.width_mm || 100,
    height_mm: template.height_mm || 50,
    copies: jobCopies,
    landscape,
    fill_scale: fill,
    pages_png_base64: pages,
  });
}
