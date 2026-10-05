import { cleanupPrintIframes } from '../../../geral/lib/printCleanup';

export interface LoteZebraLabelData {
  productName: string;
  productCode: string;
  batch: string;
  dateFormatted: string;
  volumeInfo?: string; // ex: '60,00 L  (Aproximadamente 120 unidades ou 11 caixas)'
  statusText?: string; // ex: 'APROVADO'
  procText?: string;   // ex: 'PROC: 25351.432828/2012-66' ou 'PROC EM BRANCO'
  envaseText?: string; // ex: 'Envase: 495,0 g'
  copies?: number;
}

export function buildLoteZebraLabelHtml(data: LoteZebraLabelData): string {
  const copies = Math.max(1, data.copies || 1);
  const widthMm = 100;
  const heightMm = 50;

  const productName = (data.productName || '').trim().toUpperCase();
  const productCode = (data.productCode || '').trim();
  const batch = (data.batch || '').trim();
  const dateFormatted = (data.dateFormatted || '').trim();
  const volumeInfo = (data.volumeInfo || '').trim();
  const statusText = (data.statusText || 'APROVADO').trim().toUpperCase();
  const procText = (data.procText || '').trim();
  const envaseText = (data.envaseText || '').trim();

  let pagesHtml = '';

  for (let i = 0; i < copies; i++) {
    pagesHtml += `
      <div class="label-page">
        <div class="label-container">
          <!-- CABEÇALHO: NOME DO PRODUTO -->
          <div class="header-title">
            ${productName}
          </div>

          <!-- SUB-CABEÇALHO: VOLUME E UNIDADES/CAIXAS -->
          ${volumeInfo ? `<div class="header-volume">${volumeInfo}</div>` : `<div class="header-volume-placeholder"></div>`}

          <!-- CORPO: LADO ESQUERDO (DATA E CÓDIGO) E QUADRO CENTRAL DE CQ/PROC/ENVASE -->
          <div class="body-row">
            <!-- COLUNA ESQUERDA -->
            <div class="left-col">
              <div class="field-group">
                <span class="field-label">DATA LOTE</span>
                <span class="field-value-date">${dateFormatted || '—'}</span>
              </div>
              <div class="field-group code-group">
                <span class="field-label">CÓD.PROD.</span>
                <span class="field-value-code">${productCode || '—'}</span>
              </div>
            </div>

            <!-- QUADRO RETANGULAR (APROVADO / PROC / ENVASE) -->
            <div class="center-box">
              <div class="box-status">
                <span class="status-badge">${statusText}</span>
              </div>
              <div class="box-proc">
                ${procText ? `<span class="proc-text">${procText}</span>` : `<span class="proc-text-empty">PROC EM BRANCO</span>`}
              </div>
              ${envaseText ? `
                <div class="box-envase">
                  <span class="envase-text">${envaseText}</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- RODAPÉ: Nº DO LOTE EM DESTAQUE À DIREITA -->
          <div class="footer-row">
            <div class="footer-batch">
              Nº Lote: <strong>${batch}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Etiqueta Lote Zebra GC420t - ${batch}</title>
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
            margin: 0mm !important;
            padding: 0mm !important;
            background: #ffffff !important;
            font-family: Arial, Helvetica, sans-serif !important;
            color: #000000 !important;
            -webkit-font-smoothing: antialiased;
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
            padding: 2.2mm 3.2mm 1.8mm 3.2mm !important;
          }
          .label-container {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            border: 1.2px solid #000000 !important;
            padding: 1.5mm 2.2mm 1.2mm 2.2mm !important;
            background: #ffffff !important;
          }
          .header-title {
            font-size: 10.5pt !important;
            font-weight: 900 !important;
            text-align: center !important;
            line-height: 1.15 !important;
            letter-spacing: 0.1px !important;
            text-transform: uppercase !important;
            max-height: 8.5mm !important;
            overflow: hidden !important;
          }
          .header-volume {
            font-size: 8.5pt !important;
            font-weight: 500 !important;
            text-align: center !important;
            line-height: 1.2 !important;
            margin-top: 0.8mm !important;
            margin-bottom: 1mm !important;
          }
          .header-volume-placeholder {
            height: 1mm !important;
          }
          .body-row {
            display: flex !important;
            flex-direction: row !important;
            align-items: stretch !important;
            justify-content: space-between !important;
            gap: 2.5mm !important;
            flex: 1 !important;
            margin-top: 0.5mm !important;
          }
          .left-col {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-around !important;
            width: 27mm !important;
            flex-shrink: 0 !important;
          }
          .field-group {
            display: flex !important;
            flex-direction: column !important;
            line-height: 1.1 !important;
          }
          .field-label {
            font-size: 6.8pt !important;
            font-weight: 900 !important;
            letter-spacing: 0.3px !important;
            color: #000000 !important;
          }
          .field-value-date {
            font-size: 8.8pt !important;
            font-weight: 700 !important;
            color: #000000 !important;
          }
          .field-value-code {
            font-size: 11.5pt !important;
            font-weight: 900 !important;
            letter-spacing: -0.2px !important;
            color: #000000 !important;
          }
          .center-box {
            flex: 1 !important;
            border: 1.4px solid #000000 !important;
            border-radius: 0.8mm !important;
            padding: 1.2mm 2mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-evenly !important;
            align-items: center !important;
            text-align: center !important;
            background: #ffffff !important;
            min-height: 16.5mm !important;
          }
          .box-status {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .status-badge {
            font-size: 9pt !important;
            font-weight: 900 !important;
            letter-spacing: 0.5px !important;
            text-transform: uppercase !important;
            background: #000000 !important;
            color: #ffffff !important;
            padding: 0.6mm 2.2mm !important;
            border-radius: 0.6mm !important;
            line-height: 1 !important;
          }
          .box-proc {
            font-size: 7.8pt !important;
            font-weight: 800 !important;
            line-height: 1.15 !important;
            color: #000000 !important;
          }
          .proc-text {
            font-family: Arial, Helvetica, sans-serif !important;
          }
          .proc-text-empty {
            font-size: 7.2pt !important;
            font-weight: 800 !important;
            color: #000000 !important;
            border: 0.8px dashed #000000 !important;
            padding: 0.4mm 1.5mm !important;
            border-radius: 0.5mm !important;
          }
          .box-envase {
            font-size: 8.5pt !important;
            font-weight: 800 !important;
            line-height: 1.15 !important;
            color: #000000 !important;
          }
          .envase-text {
            font-weight: 900 !important;
          }
          .footer-row {
            display: flex !important;
            justify-content: flex-end !important;
            align-items: flex-end !important;
            margin-top: 0.5mm !important;
          }
          .footer-batch {
            font-size: 13.5pt !important;
            font-weight: 600 !important;
            letter-spacing: -0.2px !important;
            color: #000000 !important;
            line-height: 1 !important;
          }
          .footer-batch strong {
            font-size: 15pt !important;
            font-weight: 900 !important;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
    </html>
  `;
}

export function printLoteZebraLabel(data: LoteZebraLabelData): void {
  cleanupPrintIframes();

  const html = buildLoteZebraLabelHtml(data);

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

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Erro ao acionar impressora Zebra:', err);
    }
  };

  if (iframe.contentWindow?.document.readyState === 'complete') {
    setTimeout(triggerPrint, 250);
  } else {
    iframe.onload = () => setTimeout(triggerPrint, 250);
  }
}
