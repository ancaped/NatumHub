import type { HubPrinter } from '../../impressoras/lib/types';
import { printersApi } from '../../impressoras/lib/printersApi';
import { renderLabelPngDataUrl } from './printCanvasRenderer';
import { readLabelFillScale, readLabelOffsetX } from './printService';
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

/** Confere se a impressora tem o que precisa para imprimir direto; devolve o nome para o envio. */
export function validarImpressoraDireta(printer: HubPrinter): string {
  const nome = (printer.system_printer_name || '').trim();
  const ip = (printer.ip_address || '').trim();
  if (printer.connection_type === 'windows_lpd') {
    if (!ip || !nome) {
      throw new Error('Em Impressoras, informe o PC e o nome do compartilhamento desta impressora.');
    }
  } else if (printer.connection_type === 'network_tcp') {
    if (!ip) throw new Error('Em Impressoras, informe o IP desta impressora.');
  } else if (!nome) {
    throw new Error(
      'Essa impressora não está ligada ao nome do Windows. Em Impressoras, importe o dispositivo.'
    );
  }
  return nome;
}

/** DPI do desenho: impressora compartilhada/de rede recebe pontos crus (sem driver), então desenha na DPI dela. */
export function dpiDoDesenho(printer: HubPrinter, dpiOverride?: number): number {
  const remota = printer.connection_type === 'windows_lpd' || printer.connection_type === 'network_tcp';
  if (remota) return printer.dpi && printer.dpi >= 150 ? printer.dpi : 203;
  if (dpiOverride && dpiOverride >= 150) return dpiOverride;
  return printer.dpi && printer.dpi >= 150 ? printer.dpi : 300;
}

/** Envia a etiqueta pelo servidor (spooler do Windows, PC compartilhado ou rede), sem o diálogo do navegador. */
export async function printLabelDirect(
  template: LabelTemplate,
  config: PrintConfig,
  printer: HubPrinter,
  dpiOverride?: number
): Promise<void> {
  const printerName = validarImpressoraDireta(printer);

  const copies = Math.max(1, config.copies || 1);
  if (config.enableSequence && copies > 80) {
    throw new Error('A sequência direta aceita até 80 etiquetas por vez.');
  }

  const dpi = dpiDoDesenho(printer, dpiOverride);
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
    printer_id: printer.id,
    printer_name: printerName,
    width_mm: template.width_mm || 100,
    height_mm: template.height_mm || 50,
    copies: jobCopies,
    landscape,
    fill_scale: fill,
    offset_x_mm: readLabelOffsetX(),
    pages_png_base64: pages,
  });
}
