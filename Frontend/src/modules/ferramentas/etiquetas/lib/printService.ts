import type { LabelElement, LabelTemplate, PrintConfig } from './types';
import { generateBarcodeBars } from './barcodeGenerator';
import { generateQrMatrix } from './qrCodeGenerator';
import { cleanupPrintIframes } from '../../../geral/lib/printCleanup';

/**
 * Replace dynamic tokens in element texts / barcodes / QRs during batch generation
 */
export function replaceDynamicTokens(
  rawText: string,
  seqIndex: number,
  totalCount: number,
  startSeq: number,
  padding: number
): string {
  if (!rawText || typeof rawText !== 'string') return rawText;

  const currentSeq = startSeq + seqIndex;
  const currentSeqStr = String(currentSeq).padStart(padding, '0');
  const totalStr = String(totalCount).padStart(padding, '0');
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return rawText
    .replace(/\{seq\}/gi, String(currentSeq))
    .replace(/\{seq_pad2\}/gi, String(currentSeq).padStart(2, '0'))
    .replace(/\{seq_pad3\}/gi, String(currentSeq).padStart(3, '0'))
    .replace(/\{seq_pad4\}/gi, String(currentSeq).padStart(4, '0'))
    .replace(/\{total\}/gi, totalStr)
    .replace(/\{date\}/gi, dateStr)
    .replace(/\{time\}/gi, timeStr);
}

/**
 * Render single element to pure HTML vector
 */
function renderElementHtml(
  el: LabelElement,
  seqIndex: number,
  totalCount: number,
  startSeq: number,
  padding: number
): string {
  const left = `${el.x_mm}mm`;
  const top = `${el.y_mm}mm`;
  const width = `${el.width_mm}mm`;
  const height = `${el.height_mm}mm`;
  const zIndex = el.zIndex || 1;

  switch (el.type) {
    case 'text': {
      const p = el.props;
      const text = replaceDynamicTokens(p.text || '', seqIndex, totalCount, startSeq, padding);
      const textTransform = p.uppercase ? 'uppercase' : 'none';
      const whiteSpace = p.multiline ? 'normal' : 'nowrap';
      const textAlign = p.textAlign || 'left';
      const justify =
        textAlign === 'center'
          ? 'center'
          : textAlign === 'right'
          ? 'flex-end'
          : 'flex-start';

      return `
        <div style="position:absolute; left:${left}; top:${top}; width:${width}; height:${height}; z-index:${zIndex}; display:flex; align-items:center; justify-content:${justify}; font-family:${p.fontFamily || 'Inter'}, sans-serif; font-size:${p.fontSize || 10}pt; font-weight:${p.fontWeight || 'normal'}; color:${p.color || '#000000'}; text-transform:${textTransform}; white-space:${whiteSpace}; line-height:1.2; word-break:break-word; overflow:hidden; box-sizing:border-box;">
          ${text}
        </div>
      `;
    }

    case 'badge': {
      const p = el.props;
      const text = replaceDynamicTokens(p.text || '', seqIndex, totalCount, startSeq, padding);
      const isBlack = p.variant === 'black';
      const isGray = p.variant === 'gray';
      const bg = isBlack ? '#000000' : isGray ? '#e4e4e7' : 'transparent';
      const color = isBlack ? '#ffffff' : '#000000';
      const border = isBlack ? 'none' : isGray ? 'none' : '1.5px solid #000000';

      return `
        <div style="position:absolute; left:${left}; top:${top}; width:${width}; height:${height}; z-index:${zIndex}; display:flex; align-items:center; justify-content:center; background-color:${bg}; color:${color}; border:${border}; border-radius:${p.borderRadius || 1.5}mm; font-family:Inter, sans-serif; font-size:${p.fontSize || 9}pt; font-weight:${p.fontWeight || 'bold'}; text-transform:${p.uppercase ? 'uppercase' : 'none'}; box-sizing:border-box; letter-spacing:0.5px; overflow:hidden;">
          ${text}
        </div>
      `;
    }

    case 'box': {
      const p = el.props;
      const bw = `${p.borderWidth || 0.5}mm`;
      const bc = p.borderColor || '#000000';
      const bg = p.backgroundColor && p.backgroundColor !== 'transparent' ? p.backgroundColor : 'transparent';
      const br = `${p.borderRadius || 0}mm`;
      const bs = p.borderStyle || 'solid';

      return `
        <div style="position:absolute; left:${left}; top:${top}; width:${width}; height:${height}; z-index:${zIndex}; border:${bw} ${bs} ${bc}; background-color:${bg}; border-radius:${br}; box-sizing:border-box;"></div>
      `;
    }

    case 'line': {
      const p = el.props;
      const sw = `${p.strokeWidth || 0.5}mm`;
      const sc = p.strokeColor || '#000000';
      const ss = p.strokeStyle || 'solid';

      if (p.orientation === 'vertical') {
        return `<div style="position:absolute; left:${left}; top:${top}; width:0; height:${height}; z-index:${zIndex}; border-left:${sw} ${ss} ${sc};"></div>`;
      }
      return `<div style="position:absolute; left:${left}; top:${top}; width:${width}; height:0; z-index:${zIndex}; border-top:${sw} ${ss} ${sc};"></div>`;
    }

    case 'barcode': {
      const p = el.props;
      const rawVal = replaceDynamicTokens(p.value || '123456', seqIndex, totalCount, startSeq, padding);
      const res = generateBarcodeBars(rawVal, p.format || 'code128');
      const barColor = '#000000';

      const svgBars = res.bars
        .map(
          (b) =>
            `<rect x="${(b.x / res.totalModules) * 100}%" y="0" width="${(b.width / res.totalModules) * 100}%" height="${p.showText ? '76%' : '100%'}" fill="${barColor}" />`
        )
        .join('');

      const textElement = p.showText
        ? `<div style="height:24%; font-family:'JetBrains Mono', monospace; font-size:${p.fontSize || 7.5}pt; font-weight:bold; text-align:center; color:#000000; display:flex; align-items:flex-end; justify-content:center; letter-spacing:1px;">${res.displayText}</div>`
        : '';

      return `
        <div style="position:absolute; left:${left}; top:${top}; width:${width}; height:${height}; z-index:${zIndex}; display:flex; flex-direction:column; justify-content:space-between; overflow:hidden;">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%; height:${p.showText ? '76%' : '100%'}; shape-rendering:crispEdges;">
            ${svgBars}
          </svg>
          ${textElement}
        </div>
      `;
    }

    case 'qrcode': {
      const p = el.props;
      const rawVal = replaceDynamicTokens(p.value || 'https://natumbiocosmeticos.com.br', seqIndex, totalCount, startSeq, padding);
      const matrix = generateQrMatrix(rawVal);
      const n = matrix.length;

      let rects = '';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (matrix[r][c]) {
            rects += `<rect x="${c}" y="${r}" width="1.02" height="1.02" fill="#000000" />`;
          }
        }
      }

      return `
        <div style="position:absolute; left:${left}; top:${top}; width:${width}; height:${height}; z-index:${zIndex}; display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 ${n} ${n}" style="width:100%; height:100%; shape-rendering:crispEdges;">
            ${rects}
          </svg>
        </div>
      `;
    }

    case 'image': {
      const p = el.props;
      return `
        <div style="position:absolute; left:${left}; top:${top}; width:${width}; height:${height}; z-index:${zIndex}; overflow:hidden;">
          <img src="${p.src}" style="width:100%; height:100%; object-fit:${p.fit || 'contain'}; opacity:${p.opacity ?? 1}; display:block;" />
        </div>
      `;
    }

    default:
      return '';
  }
}

/**
 * Generate print document HTML allowing the browser's native orientation and margins
 */
function buildPrintHtml(template: LabelTemplate, config: PrintConfig): string {
  const copies = Math.max(1, config.copies || 1);
  const widthMm = template.width_mm || 100;
  const heightMm = template.height_mm || 50;

  let pagesHtml = '';

  for (let i = 0; i < copies; i++) {
    const elementsHtml = template.elements_json
      .map((el) =>
        renderElementHtml(
          el,
          i,
          config.sequenceTotal || copies,
          config.sequenceStart || 1,
          config.sequencePadding || 2
        )
      )
      .join('');

    pagesHtml += `
      <div class="label-page">
        ${elementsHtml}
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Imprimir Etiquetas - NatumHub</title>
        <style>
          @page {
            margin: 0mm !important;
          }
          *, *:before, *:after {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0mm !important;
            padding: 0mm !important;
            background: #ffffff !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          .label-page {
            width: ${widthMm}mm !important;
            height: ${heightMm}mm !important;
            min-width: ${widthMm}mm !important;
            min-height: ${heightMm}mm !important;
            max-width: ${widthMm}mm !important;
            max-height: ${heightMm}mm !important;
            position: relative !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
            background: #ffffff !important;
            margin: 0mm !important;
            padding: 0mm !important;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
    </html>
  `;
}

/**
 * Trigger print via clean, unlocked iframe (leaves Layout and Paper selector unlocked in Chrome dialog)
 */
export function printLabelBatch(template: LabelTemplate, config: PrintConfig) {
  cleanupPrintIframes();

  const html = buildPrintHtml(template, config);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-natum-print', '1');
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '100mm';
  iframe.style.height = '50mm';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Erro ao acionar impressora:', e);
    }
  }, 250);
}

/**
 * Open print in clean new window
 */
export function openPrintWindow(template: LabelTemplate, config: PrintConfig) {
  const html = buildPrintHtml(template, config);
  const popup = window.open('', '_blank', 'width=800,height=600');
  if (!popup) {
    alert('Permita popups no navegador para abrir a impressão.');
    return;
  }

  popup.document.write(html);
  popup.document.close();

  setTimeout(() => {
    popup.focus();
    popup.print();
  }, 300);
}
