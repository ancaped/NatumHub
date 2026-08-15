import type { LabelElement, LabelTemplate } from './types';
import { generateBarcodeBars } from './barcodeGenerator';
import { generateQrMatrix } from './qrCodeGenerator';
import { replaceDynamicTokens } from './printService';

// 300 DPI = ~11.811 pixels per mm (standard thermal print head resolution)
const DPI = 300;
const MM_TO_PX = DPI / 25.4; // 11.811023622

/**
 * Preload all images in the template
 */
async function preloadImages(elements: LabelElement[]): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  const imagePromises: Promise<void>[] = [];

  for (const el of elements) {
    if (el.type === 'image' && el.props?.src) {
      const src = el.props.src;
      if (!map.has(src)) {
        const p = new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            map.set(src, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        });
        imagePromises.push(p);
      }
    }
  }

  await Promise.all(imagePromises);
  return map;
}

/**
 * Draw multiline wrapped text cleanly on canvas
 */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  totalHeight: number,
  lineHeight: number,
  align: string
) {
  // Support explicit line breaks \n
  const paragraphs = text.split('\n');
  const allLines: string[] = [];

  for (const p of paragraphs) {
    const words = p.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      allLines.push(currentLine);
    }
  }

  if (allLines.length === 0) return;

  const totalTextHeight = allLines.length * lineHeight;
  const startY = y + Math.max(0, (totalHeight - totalTextHeight) / 2) + lineHeight / 2;

  allLines.forEach((line, i) => {
    const lineY = startY + i * lineHeight;
    if (align === 'center') {
      ctx.fillText(line, x + maxWidth / 2, lineY);
    } else if (align === 'right') {
      ctx.fillText(line, x + maxWidth, lineY);
    } else {
      ctx.fillText(line, x, lineY);
    }
  });
}

/**
 * Render a label template onto an offscreen Canvas at 300 DPI
 */
export async function renderLabelToCanvas(
  template: LabelTemplate,
  seqIndex: number,
  totalCount: number,
  startSeq: number,
  padding: number,
  printMode: 'landscape_100x50' | 'landscape_on_50x100_roll' | 'portrait_50x100'
): Promise<HTMLCanvasElement> {
  const isRotated = printMode === 'landscape_on_50x100_roll';
  const widthMm = template.width_mm || 100;
  const heightMm = template.height_mm || 50;

  const canvas = document.createElement('canvas');

  if (isRotated) {
    // 50mm width x 100mm height canvas for rotated roll feed
    canvas.width = Math.round(heightMm * MM_TO_PX);
    canvas.height = Math.round(widthMm * MM_TO_PX);
  } else if (printMode === 'portrait_50x100') {
    canvas.width = Math.round(heightMm * MM_TO_PX);
    canvas.height = Math.round(widthMm * MM_TO_PX);
  } else {
    // 100mm width x 50mm height
    canvas.width = Math.round(widthMm * MM_TO_PX);
    canvas.height = Math.round(heightMm * MM_TO_PX);
  }

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return canvas;

  // Solid white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const imagesMap = await preloadImages(template.elements_json);

  ctx.save();

  if (isRotated) {
    // Rotate 90° clockwise: design (100x50) fits on roll (50x100)
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  }

  // Draw all elements
  for (const el of template.elements_json) {
    drawElement(ctx, el, seqIndex, totalCount, startSeq, padding, imagesMap);
  }

  ctx.restore();

  return canvas;
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: LabelElement,
  seqIndex: number,
  totalCount: number,
  startSeq: number,
  padding: number,
  imagesMap: Map<string, HTMLImageElement>
) {
  const x = el.x_mm * MM_TO_PX;
  const y = el.y_mm * MM_TO_PX;
  const w = el.width_mm * MM_TO_PX;
  const h = el.height_mm * MM_TO_PX;
  const p = el.props || {};

  ctx.save();

  switch (el.type) {
    case 'box': {
      const bw = Math.max(1, (p.borderWidth || 0.6) * MM_TO_PX);
      const br = (p.borderRadius || 0) * MM_TO_PX;
      const bc = p.borderColor || '#000000';
      const bg = p.backgroundColor && p.backgroundColor !== 'transparent' ? p.backgroundColor : null;

      ctx.lineWidth = bw;
      ctx.strokeStyle = bc;

      if (p.borderStyle === 'dashed') {
        ctx.setLineDash([bw * 4, bw * 2]);
      } else if (p.borderStyle === 'dotted') {
        ctx.setLineDash([bw * 1.5, bw * 1.5]);
      }

      ctx.beginPath();
      if (br > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(x + bw / 2, y + bw / 2, Math.max(1, w - bw), Math.max(1, h - bw), br);
      } else {
        ctx.rect(x + bw / 2, y + bw / 2, Math.max(1, w - bw), Math.max(1, h - bw));
      }

      if (bg) {
        ctx.fillStyle = bg;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }

    case 'line': {
      const sw = Math.max(1, (p.strokeWidth || 0.5) * MM_TO_PX);
      const sc = p.strokeColor || '#000000';

      ctx.lineWidth = sw;
      ctx.strokeStyle = sc;

      if (p.strokeStyle === 'dashed') {
        ctx.setLineDash([sw * 4, sw * 2]);
      } else if (p.strokeStyle === 'dotted') {
        ctx.setLineDash([sw * 1.5, sw * 1.5]);
      }

      ctx.beginPath();
      if (p.orientation === 'vertical') {
        ctx.moveTo(x + sw / 2, y);
        ctx.lineTo(x + sw / 2, y + h);
      } else {
        ctx.moveTo(x, y + sw / 2);
        ctx.lineTo(x + w, y + sw / 2);
      }
      ctx.stroke();
      break;
    }

    case 'badge': {
      const rawText = replaceDynamicTokens(p.text || '', seqIndex, totalCount, startSeq, padding);
      const text = p.uppercase ? rawText.toUpperCase() : rawText;
      const isBlack = p.variant === 'black';
      const isGray = p.variant === 'gray';
      const bg = isBlack ? '#000000' : isGray ? '#e4e4e7' : null;
      const textColor = isBlack ? '#ffffff' : '#000000';
      const br = (p.borderRadius || 1.5) * MM_TO_PX;

      ctx.beginPath();
      if (br > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, br);
      } else {
        ctx.rect(x, y, w, h);
      }

      if (bg) {
        ctx.fillStyle = bg;
        ctx.fill();
      } else {
        ctx.lineWidth = 1.5 * (MM_TO_PX / 3.7795);
        ctx.strokeStyle = '#000000';
        ctx.stroke();
      }

      const fontPt = p.fontSize || 9;
      const fontPx = fontPt * (DPI / 72);
      ctx.font = `bold ${Math.round(fontPx)}px Inter, sans-serif`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + h / 2);
      break;
    }

    case 'text': {
      const rawText = replaceDynamicTokens(p.text || '', seqIndex, totalCount, startSeq, padding);
      const text = p.uppercase ? rawText.toUpperCase() : rawText;
      const fontPt = p.fontSize || 10;
      const fontPx = fontPt * (DPI / 72);
      const fontWeight = p.fontWeight || 'normal';
      const fontFamily = p.fontFamily === 'JetBrains Mono' ? 'JetBrains Mono, monospace' : 'Inter, sans-serif';
      const lineHeight = fontPx * 1.25;

      ctx.font = `${fontWeight} ${Math.round(fontPx)}px ${fontFamily}`;
      ctx.fillStyle = p.color || '#000000';
      ctx.textBaseline = 'middle';

      const align = p.textAlign || 'left';
      if (align === 'center') {
        ctx.textAlign = 'center';
      } else if (align === 'right') {
        ctx.textAlign = 'right';
      } else {
        ctx.textAlign = 'left';
      }

      if (p.multiline || text.includes('\n')) {
        drawWrappedText(ctx, text, x, y, w, h, lineHeight, align);
      } else {
        const textX = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
        ctx.fillText(text, textX, y + h / 2, w);
      }
      break;
    }

    case 'barcode': {
      const rawVal = replaceDynamicTokens(p.value || '123456', seqIndex, totalCount, startSeq, padding);
      const res = generateBarcodeBars(rawVal, p.format || 'code128');
      const showText = p.showText !== false;
      const barHeight = showText ? h * 0.76 : h;

      ctx.fillStyle = '#000000';
      for (const b of res.bars) {
        const bx = x + (b.x / res.totalModules) * w;
        const bw = (b.width / res.totalModules) * w;
        ctx.fillRect(bx, y, bw, barHeight);
      }

      if (showText) {
        const fontPt = p.fontSize || 7.5;
        const fontPx = fontPt * (DPI / 72);
        ctx.font = `bold ${Math.round(fontPx)}px JetBrains Mono, monospace`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(res.displayText, x + w / 2, y + h, w);
      }
      break;
    }

    case 'qrcode': {
      const rawVal = replaceDynamicTokens(p.value || 'https://natumbiocosmeticos.com.br', seqIndex, totalCount, startSeq, padding);
      const matrix = generateQrMatrix(rawVal);
      const n = matrix.length;
      const cellW = w / n;
      const cellH = h / n;

      ctx.fillStyle = '#000000';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (matrix[r][c]) {
            ctx.fillRect(x + c * cellW, y + r * cellH, cellW + 0.5, cellH + 0.5);
          }
        }
      }
      break;
    }

    case 'image': {
      const src = p.src;
      if (src && imagesMap.has(src)) {
        const img = imagesMap.get(src)!;
        ctx.drawImage(img, x, y, w, h);
      }
      break;
    }
  }

  ctx.restore();
}
