import { cleanupPrintIframes } from '../../../geral/lib/printCleanup';
import { generateBarcodeBars } from '../../../ferramentas/etiquetas/lib/barcodeGenerator';
import type { LabelElement, LabelTemplate } from '../../../ferramentas/etiquetas/lib/types';

export interface BombonaLabelConfig {
  codigoReceb: string;
  codigoRef: string;
  insumoNome: string;
  fornecedor: string;
  lote: string;
  dataEntrada: string;
  dataValidade: string;
  notaFiscal: string;
  unidade: string;
  // Lista de volumes das bombonas individuais (ex: [250, 250])
  bombonas: Array<{
    peso: number;
    copias?: number;
  }>;
  statusText?: string; // padrão 'APROVADO'
}

export function buildBarcodeSvg(code: string): string {
  if (!code || !code.trim()) return '';
  try {
    const res = generateBarcodeBars(code.trim(), 'code128');
    const width = 120;
    const height = 40;
    const totalModules = res.totalModules || 100;
    const scale = width / totalModules;

    const rects = res.bars
      .map(
        (b) =>
          `<rect x="${(b.x * scale).toFixed(2)}" y="0" width="${(b.width * scale).toFixed(2)}" height="${height}" fill="#000" />`
      )
      .join('');

    return `
      <svg viewBox="0 0 ${width} ${height}" width="${width}px" height="${height}px" xmlns="http://www.w3.org/2000/svg">
        ${rects}
      </svg>
    `;
  } catch {
    return `<div style="font-family: monospace; font-size: 10px; font-weight: bold;">${code}</div>`;
  }
}

/**
 * Constrói o HTML fiel ao MODELO ANTERIOR (layout limpo em 2 blocos principais:
 * Topo com código de barras à esquerda e Cód/Nome do produto à direita;
 * Corpo com dados do fornecedor, lote, datas e peso à esquerda e carimbo APROVADO + Bombona à direita).
 */
export function buildBombonaLabelsHtml(config: BombonaLabelConfig): string {
  const widthMm = 100;
  const heightMm = 50;

  const barcodeSvg = buildBarcodeSvg(config.codigoReceb);
  const status = config.statusText || 'APROVADO';

  let pagesHtml = '';

  for (let idx = 0; idx < config.bombonas.length; idx++) {
    const item = config.bombonas[idx];
    const copies = Math.max(1, item.copias || 1);
    const pesoVal = item.peso;
    const pesoFmt = Number.isInteger(pesoVal)
      ? pesoVal.toString()
      : pesoVal.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

    for (let c = 0; c < copies; c++) {
      pagesHtml += `
        <div class="label-page">
          <div class="label-container">
            <!-- LINHA 1: CÓDIGO DE BARRAS À ESQUERDA E CÓDIGO/NOME DO INSUMO À DIREITA -->
            <div class="top-row">
              <div class="barcode-box">
                <div class="barcode-svg">${barcodeSvg}</div>
                <div class="barcode-text">${config.codigoReceb}</div>
              </div>
              <div class="product-box">
                <div class="prod-code">${config.codigoRef}</div>
                <div class="prod-name">${config.insumoNome}</div>
              </div>
            </div>

            <!-- LINHA 2: CORPO COM DADOS E CARIMBO APROVADO -->
            <div class="body-row">
              <div class="details-col">
                <div class="field-item">
                  <span class="field-label">FORNECEDOR:</span>
                  <span class="field-value">${config.fornecedor}</span>
                </div>
                <div class="field-item">
                  <span class="field-label">LOTE:</span>
                  <span class="field-value font-mono font-bold">${config.lote}</span>
                </div>
                <div class="field-row-2">
                  <div class="field-item">
                    <span class="field-label">ENTRADA:</span>
                    <span class="field-value">${config.dataEntrada || '—'}</span>
                  </div>
                  <div class="field-item">
                    <span class="field-label">VALIDADE:</span>
                    <span class="field-value">${config.dataValidade || '—'}</span>
                  </div>
                </div>
                <div class="field-row-2">
                  <div class="field-item">
                    <span class="field-label">QTDE. EMB.:</span>
                    <span class="field-value font-bold font-lg">${pesoFmt} ${config.unidade || 'KG'}</span>
                  </div>
                  <div class="field-item">
                    <span class="field-label">NF:</span>
                    <span class="field-value font-bold">${config.notaFiscal}</span>
                  </div>
                </div>
              </div>

              <!-- CARIMBO DE STATUS / BOMBONA -->
              <div class="stamp-col">
                <div class="status-badge">${status}</div>
                <div class="bombona-index">BOMBONA ${idx + 1}/${config.bombonas.length}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Etiquetas Bombona - ${config.insumoNome}</title>
        <style>
          @page {
            size: ${widthMm}mm ${heightMm}mm !important;
            margin: 0mm !important;
          }
          *, *:before, *:after {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: ${widthMm}mm;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
          }
          .label-page {
            width: ${widthMm}mm;
            height: ${heightMm}mm;
            page-break-after: always;
            page-break-inside: avoid;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2mm 3mm;
          }
          .label-container {
            width: 100%;
            height: 100%;
            border: 1.5px solid #000;
            border-radius: 4px;
            padding: 2mm 2.5mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          /* TOPO */
          .top-row {
            display: flex;
            align-items: center;
            border-bottom: 1.5px solid #000;
            padding-bottom: 1.5mm;
            gap: 3mm;
          }
          .barcode-box {
            width: 38mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .barcode-svg svg {
            display: block;
            width: 36mm;
            height: 9mm;
          }
          .barcode-text {
            font-family: monospace;
            font-size: 7.5pt;
            font-weight: bold;
            letter-spacing: 1px;
            line-height: 1;
            margin-top: 0.5mm;
          }
          .product-box {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .prod-code {
            font-size: 8pt;
            font-weight: bold;
            color: #000;
            line-height: 1.1;
          }
          .prod-name {
            font-size: 9pt;
            font-weight: 900;
            text-transform: uppercase;
            line-height: 1.1;
            color: #000;
            word-break: break-word;
          }

          /* CORPO */
          .body-row {
            display: flex;
            flex: 1;
            padding-top: 1.5mm;
            gap: 2mm;
          }
          .details-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .field-item {
            font-size: 7pt;
            line-height: 1.15;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .field-label {
            font-size: 6.5pt;
            font-weight: bold;
            color: #333;
            margin-right: 1.5mm;
          }
          .field-value {
            font-size: 7.5pt;
            color: #000;
          }
          .field-row-2 {
            display: flex;
            justify-content: space-between;
            gap: 2mm;
          }
          .font-bold { font-weight: bold; }
          .font-mono { font-family: monospace; }
          .font-lg { font-size: 8.5pt !important; }

          /* CARIMBO */
          .stamp-col {
            width: 25mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border-left: 1.5px solid #000;
            padding-left: 2mm;
          }
          .status-badge {
            border: 2px solid #000;
            padding: 1.5mm 1mm;
            font-size: 8pt;
            font-weight: 900;
            text-align: center;
            letter-spacing: 0.5px;
            width: 100%;
            border-radius: 2px;
          }
          .bombona-index {
            font-size: 6.5pt;
            font-weight: bold;
            margin-top: 2mm;
            text-align: center;
            color: #444;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
        <script>
          window.onload = function() {
            window.focus();
            window.print();
            setTimeout(function() {
              window.parent.postMessage({ type: 'print-done' }, '*');
            }, 1000);
          };
        </script>
      </body>
    </html>
  `;
}

export function printBombonaLabels(config: BombonaLabelConfig) {
  cleanupPrintIframes();

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '100mm';
  iframe.style.height = '50mm';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const html = buildBombonaLabelsHtml(config);
  doc.open();
  doc.write(html);
  doc.close();
}

/**
 * Constrói um LabelTemplate compatível com PrintModal (renderizador em Canvas 300 DPI e envio direto à Zebra)
 * reproduzindo o modelo antigo perfeitamente!
 */
export function buildBombonaLabelTemplate(
  config: BombonaLabelConfig,
  bombonaIndex: number,
  totalBombonas: number,
  peso: number
): LabelTemplate {
  const pesoFmt = Number.isInteger(peso)
    ? peso.toString()
    : peso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const status = config.statusText || 'APROVADO';

  const elements: LabelElement[] = [
    // Borda Externa
    {
      id: 'border_outer',
      type: 'box',
      x_mm: 1,
      y_mm: 1,
      width_mm: 98,
      height_mm: 48,
      zIndex: 1,
      props: {
        borderWidth: 0.55,
        borderColor: '#000000',
        backgroundColor: 'transparent',
        borderRadius: 1.5,
      },
    },

    // Código de Barras (Canto Superior Esquerdo)
    {
      id: 'barcode_receb',
      type: 'barcode',
      x_mm: 3,
      y_mm: 2.2,
      width_mm: 36,
      height_mm: 11,
      zIndex: 2,
      props: {
        value: config.codigoReceb || 'MP0000',
        format: 'code128',
        showText: true,
        fontSize: 7,
      },
    },

    // Código de Referência (Topo Direito)
    {
      id: 'txt_ref',
      type: 'text',
      x_mm: 42,
      y_mm: 2.5,
      width_mm: 55,
      height_mm: 3.8,
      zIndex: 2,
      props: {
        text: config.codigoRef || '—',
        fontSize: 8.5,
        fontWeight: 'bold',
        fontFamily: 'Inter',
        textAlign: 'left',
        color: '#000000',
      },
    },

    // Nome do Insumo (Topo Direito)
    {
      id: 'txt_nome',
      type: 'text',
      x_mm: 42,
      y_mm: 6.2,
      width_mm: 55,
      height_mm: 8.5,
      zIndex: 2,
      props: {
        text: config.insumoNome || '—',
        fontSize: 9.5,
        fontWeight: '800',
        fontFamily: 'Inter',
        textAlign: 'left',
        color: '#000000',
        uppercase: true,
        multiline: true,
      },
    },

    // Linha Divisória Horizontal
    {
      id: 'line_sep',
      type: 'line',
      x_mm: 2,
      y_mm: 15.5,
      width_mm: 96,
      height_mm: 0.4,
      zIndex: 2,
      props: {
        orientation: 'horizontal',
        strokeWidth: 0.4,
        strokeColor: '#000000',
        strokeStyle: 'solid',
      },
    },

    // Coluna de Dados: Fornecedor
    {
      id: 'txt_fornec',
      type: 'text',
      x_mm: 3.5,
      y_mm: 17,
      width_mm: 67,
      height_mm: 4,
      zIndex: 2,
      props: {
        text: `FORNECEDOR: ${config.fornecedor || '—'}`,
        fontSize: 7,
        fontWeight: '600',
        fontFamily: 'Inter',
        textAlign: 'left',
        color: '#000000',
        uppercase: true,
      },
    },

    // Coluna de Dados: Lote
    {
      id: 'txt_lote',
      type: 'text',
      x_mm: 3.5,
      y_mm: 21.8,
      width_mm: 67,
      height_mm: 4.5,
      zIndex: 2,
      props: {
        text: `LOTE: ${config.lote || '—'}`,
        fontSize: 8.5,
        fontWeight: '800',
        fontFamily: 'Inter',
        textAlign: 'left',
        color: '#000000',
      },
    },

    // Coluna de Dados: Entrada & Validade
    {
      id: 'txt_entr',
      type: 'text',
      x_mm: 3.5,
      y_mm: 27,
      width_mm: 32,
      height_mm: 4,
      zIndex: 2,
      props: {
        text: `ENTRADA: ${config.dataEntrada || '—'}`,
        fontSize: 7.5,
        fontWeight: '600',
        fontFamily: 'Inter',
        textAlign: 'left',
        color: '#000000',
      },
    },
    {
      id: 'txt_val',
      type: 'text',
      x_mm: 37,
      y_mm: 27,
      width_mm: 33,
      height_mm: 4,
      zIndex: 2,
      props: {
        text: `VALIDADE: ${config.dataValidade || '—'}`,
        fontSize: 7.5,
        fontWeight: '600',
        fontFamily: 'Inter',
        textAlign: 'left',
        color: '#000000',
      },
    },

    // Coluna de Dados: Qtde Emb & NF
    {
      id: 'txt_peso',
      type: 'text',
      x_mm: 3.5,
      y_mm: 32.5,
      width_mm: 36,
      height_mm: 5.5,
      zIndex: 2,
      props: {
        text: `QTDE. EMB.: ${pesoFmt} ${config.unidade || 'KG'}`,
        fontSize: 9.5,
        fontWeight: '800',
        fontFamily: 'Inter',
        textAlign: 'left',
        color: '#000000',
      },
    },
    {
      id: 'txt_nf',
      type: 'text',
      x_mm: 41,
      y_mm: 33,
      width_mm: 29,
      height_mm: 5,
      zIndex: 2,
      props: {
        text: `NF: ${config.notaFiscal || '—'}`,
        fontSize: 8.5,
        fontWeight: 'bold',
        fontFamily: 'Inter',
        textAlign: 'left',
        color: '#000000',
      },
    },

    // Linha Divisória Vertical do Carimbo
    {
      id: 'line_stamp_sep',
      type: 'line',
      x_mm: 72,
      y_mm: 16.5,
      width_mm: 0.4,
      height_mm: 31.5,
      zIndex: 2,
      props: {
        orientation: 'vertical',
        strokeWidth: 0.4,
        strokeColor: '#000000',
        strokeStyle: 'solid',
      },
    },

    // Caixa de Status / Carimbo
    {
      id: 'box_status',
      type: 'box',
      x_mm: 74,
      y_mm: 20,
      width_mm: 23,
      height_mm: 10,
      zIndex: 2,
      props: {
        borderWidth: 0.5,
        borderColor: '#000000',
        backgroundColor: 'transparent',
        borderRadius: 1,
      },
    },
    {
      id: 'badge_status',
      type: 'badge',
      x_mm: 74.5,
      y_mm: 22,
      width_mm: 22,
      height_mm: 6,
      zIndex: 3,
      props: {
        text: status,
        variant: 'black',
        fontSize: 8.5,
        fontWeight: '800',
        uppercase: true,
        borderRadius: 0.8,
      },
    },

    // Índice da Bombona (ex: BOMBONA 1/2)
    {
      id: 'txt_bombona_idx',
      type: 'text',
      x_mm: 73,
      y_mm: 34,
      width_mm: 25,
      height_mm: 4.5,
      zIndex: 2,
      props: {
        text: `BOMBONA ${bombonaIndex + 1}/${totalBombonas}`,
        fontSize: 7,
        fontWeight: 'bold',
        fontFamily: 'Inter',
        textAlign: 'center',
        color: '#333333',
      },
    },
  ];

  return {
    id: `bombona_${config.codigoReceb}_${bombonaIndex + 1}`,
    name: `Etiqueta ${config.codigoReceb} - Bombona ${bombonaIndex + 1}/${totalBombonas}`,
    category: 'estoque',
    width_mm: 100,
    height_mm: 50,
    orientation: 'landscape',
    elements_json: elements,
  };
}

/**
 * Gera um array de LabelTemplates para todas as bombonas configuradas.
 */
export function buildBombonaBatchTemplates(config: BombonaLabelConfig): LabelTemplate[] {
  const total = config.bombonas.length;
  return config.bombonas.map((b, idx) =>
    buildBombonaLabelTemplate(config, idx, total, b.peso)
  );
}
