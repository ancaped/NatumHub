/**
 * Impressão A4 Padronizada com os Relatórios do Sistema (Padrão Compras / PCP).
 * Estilo executivo limpo: sem checkboxes, com linhas de grade definidas, cores e fontes oficiais.
 */

export function printHtmlDocument(title: string, bodyHtml: string, extraCss = '') {
  try {
    if (document.activeElement instanceof HTMLIFrameElement) {
      document.activeElement.blur();
    }
    window.focus();
    document.querySelectorAll('iframe[data-natum-print="1"]').forEach((el) => {
      try {
        (el as HTMLIFrameElement).src = 'about:blank';
        el.remove();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-natum-print', '1');
  iframe.src = 'about:blank';
  document.body.appendChild(iframe);

  let cleaned = false;
  let started = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (document.activeElement === iframe) iframe.blur();
      window.focus();
      iframe.src = 'about:blank';
      iframe.remove();
    } catch {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }
  };

  const runPrint = () => {
    if (started || cleaned) return;
    started = true;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!doc || !win) {
      cleanup();
      return;
    }

  try {
  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #111827;
      background: #fff;
      font-size: 8.5px;
      line-height: 1.35;
    }
    .mono {
      font-family: "Courier New", Courier, monospace;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .font-bold { font-weight: 700; }
    .uppercase { text-transform: uppercase; }

    /* Cabeçalho Padrão do Sistema */
    header {
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .header-title {
      font-size: 15px;
      font-weight: 800;
      margin: 0 0 4px 0;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      color: #111827;
    }
    .header-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #4b5563;
    }
    .header-meta strong {
      color: #111827;
    }

    /* Tabelas Padrão com Linhas Definidas */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    th {
      background-color: #f3f4f6;
      color: #111827;
      font-weight: 700;
      font-size: 8.5px;
      text-transform: uppercase;
      padding: 5px 6px;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1.5px solid #111827;
      border-right: 1px solid #e5e7eb;
      text-align: left;
    }
    th:last-child {
      border-right: 0;
    }
    td {
      border-bottom: 1px solid #e5e7eb;
      border-right: 1px solid #f3f4f6;
      padding: 5px 6px;
      font-size: 8.5px;
      vertical-align: middle;
    }
    td:last-child {
      border-right: 0;
    }
    tr:nth-child(even) td {
      background-color: #fafafa;
    }

    /* Assinaturas Padrão */
    .signatures {
      margin-top: 35px;
      display: flex;
      justify-content: space-between;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signature-box {
      width: 45%;
      text-align: center;
    }
    .signature-box.tri {
      width: 30%;
    }
    .signature-line {
      border-top: 1px solid #9ca3af;
      margin-top: 28px;
      margin-bottom: 4px;
    }
    .signature-title {
      font-size: 8.5px;
      color: #4b5563;
      font-weight: 600;
      text-transform: uppercase;
    }

    /* Rodapé Fixo Padrão */
    footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: #9ca3af;
      border-top: 1px solid #f3f4f6;
      padding-top: 5px;
    }

    ${extraCss}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`);
    doc.close();
  } catch {
    cleanup();
    return;
  }

    setTimeout(() => {
      try {
        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
        setTimeout(cleanup, 60_000);
      } catch {
        cleanup();
      }
    }, 200);
  };

  iframe.onload = () => runPrint();
  if (iframe.contentDocument?.readyState === 'complete') {
    runPrint();
  }
}

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(val: number) {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '0';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export type PrintSheet = {
  registerNumber: string;
  kind: 'entrada' | 'saida';
};

export type PrintOrderItem = {
  itemCode: string;
  description: string;
  unit: string;
  qty: number;
};

export type PrintOrder = {
  orderNumber: string;
  kind: 'entrada' | 'saida';
  recordType: string;
  partnerName: string;
  orderDate: string;
  notes?: string | null;
  items: PrintOrderItem[];
};

function sheetTitle(kind: 'entrada' | 'saida') {
  return kind === 'entrada'
    ? 'Controle de Entrada de Insumo (CEI)'
    : 'Controle de Saída de Insumo (CSI)';
}

function partnerLabel(o: { recordType?: string; partnerName?: string }) {
  const t = (o.recordType || '').trim();
  const p = (o.partnerName || '').trim();
  if (t && p) return `${t.toUpperCase()} — ${p}`;
  return t || p || '—';
}

const BLANK_ROWS = 15;

/** Folha CEI/CSI padronizada para preenchimento manual com linhas de grade limpas e assinaturas. */
export function printBlankSheets(sheets: PrintSheet[]) {
  if (sheets.length === 0) return;

  const todayStr = new Date().toLocaleDateString('pt-BR');

  const pages = sheets
    .map((sheet, idx) => {
      const rows = Array.from({ length: BLANK_ROWS })
        .map(
          (_, rIdx) => `<tr class="blank-row">
            <td class="text-center font-bold" style="color: #6b7280;">${rIdx + 1}</td>
            <td style="border-right: 1px solid #e5e7eb;">&nbsp;</td>
            <td style="border-right: 1px solid #e5e7eb;">&nbsp;</td>
            <td style="border-right: 1px solid #e5e7eb;">&nbsp;</td>
            <td style="border-right: 1px solid #e5e7eb;">&nbsp;</td>
            <td style="border-right: 1px solid #e5e7eb;">&nbsp;</td>
            <td>&nbsp;</td>
          </tr>`,
        )
        .join('');

      return `<section class="sheet-page${idx === sheets.length - 1 ? ' page-last' : ''}">
  <header>
    <h1 class="header-title">${escapeHtml(sheetTitle(sheet.kind))}</h1>
    <div class="header-meta">
      <div>NatumHub · Ordens Manuais</div>
      <div>Nº Registro: <strong class="mono font-bold">${escapeHtml(sheet.registerNumber)}</strong></div>
      <div>Data Emissão: <strong>${todayStr}</strong></div>
    </div>
  </header>

  <!-- Metadados de Campo -->
  <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 12px; font-size: 8.5px; color: #374151;">
    <div style="flex: 2; display: flex; align-items: flex-end; gap: 4px;">
      <strong style="white-space: nowrap;">SETOR / ORIGEM:</strong>
      <span style="flex: 1; border-bottom: 1px dashed #9ca3af; height: 12px;"></span>
    </div>
    <div style="flex: 1; display: flex; align-items: flex-end; gap: 4px;">
      <strong style="white-space: nowrap;">DATA MOVIMENTO:</strong>
      <span style="flex: 1; border-bottom: 1px dashed #9ca3af; height: 12px;"></span>
    </div>
    <div style="flex: 2; display: flex; align-items: flex-end; gap: 4px;">
      <strong style="white-space: nowrap;">RESPONSÁVEL:</strong>
      <span style="flex: 1; border-bottom: 1px dashed #9ca3af; height: 12px;"></span>
    </div>
    <div style="flex: 1; display: flex; align-items: flex-end; gap: 4px;">
      <strong style="white-space: nowrap;">Nº DOC / NF:</strong>
      <span style="flex: 1; border-bottom: 1px dashed #9ca3af; height: 12px;"></span>
    </div>
  </div>

  <!-- Tabela de Insumos -->
  <table>
    <thead>
      <tr>
        <th style="width: 25px; text-align: center;">#</th>
        <th style="width: 110px;">Código Item</th>
        <th>Descrição do Material / Insumo</th>
        <th style="width: 120px;">Lote / Validade</th>
        <th style="width: 65px; text-align: right;">Qtd</th>
        <th style="width: 40px; text-align: center;">Un</th>
        <th style="width: 60px; text-align: center;">Visto</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Assinaturas -->
  <div class="signatures">
    <div class="signature-box tri">
      <div class="signature-line"></div>
      <div class="signature-title">Elaborado / Entregue por</div>
    </div>
    <div class="signature-box tri">
      <div class="signature-line"></div>
      <div class="signature-title">Conferido por (Estoque)</div>
    </div>
    <div class="signature-box tri">
      <div class="signature-line"></div>
      <div class="signature-title">Visto Controle de Qualidade</div>
    </div>
  </div>

  <footer>
    <div>NatumHub — Sistema de Gestão Unificado</div>
    <div>Folha de Registro Físico (CEI/CSI)</div>
  </footer>
</section>`;
    })
    .join('\n');

  const css = `
    .sheet-page {
      width: 100%;
      min-height: 265mm;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      break-after: page;
    }
    .page-last {
      page-break-after: auto;
      break-after: auto;
    }
    .blank-row {
      height: 9mm;
    }
    .blank-row td {
      border-bottom: 1px solid #d1d5db;
    }
  `;

  printHtmlDocument('Folhas de Registro CEI/CSI', pages, css);
}

/** Lançamento em Lote no ERP padronizado no estilo do sistema (sem checkboxes). */
export function printErpLaunchList(orders: PrintOrder[], kind: 'entrada' | 'saida') {
  if (orders.length === 0) return;

  const kindLabel = kind === 'entrada' ? 'Entrada' : 'Saída';
  const today = new Date().toLocaleString('pt-BR');

  let totalItemsCount = 0;
  orders.forEach((o) => {
    totalItemsCount += o.items.length;
  });

  const blocks = orders
    .map((o) => {
      const itemRows = o.items
        .map(
          (it, idx) => `<tr>
          <td class="text-center font-bold" style="color: #6b7280; width: 25px;">${idx + 1}</td>
          <td class="mono font-bold" style="width: 110px;">${escapeHtml(it.itemCode)}</td>
          <td>${escapeHtml(it.description)}</td>
          <td class="text-right font-bold" style="width: 70px;">${fmtNum(it.qty)}</td>
          <td class="text-center" style="width: 40px;">${escapeHtml(it.unit || 'UN')}</td>
          <td style="width: 150px; border-right: 0;">&nbsp;</td>
        </tr>`,
        )
        .join('');

      return `<div style="margin-bottom: 16px; page-break-inside: avoid; break-inside: avoid;">
  <div style="padding: 4px 8px; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-bottom: 1.5px solid #111827; display: flex; justify-content: space-between; align-items: center; font-size: 9px;">
    <div>
      <span class="mono font-bold" style="font-size: 10px; color: #111827;">${escapeHtml(o.orderNumber)}</span>
      <span style="color: #9ca3af; margin: 0 6px;">|</span>
      <strong style="color: #111827;">${escapeHtml(partnerLabel(o))}</strong>
    </div>
    <div style="color: #4b5563;">Data: <strong>${escapeHtml(o.orderDate)}</strong></div>
  </div>
  ${
    o.notes
      ? `<div style="padding: 4px 8px; background-color: #fffbeb; border: 1px solid #fef08a; border-top: 0; font-size: 8px; color: #92400e;">
    <strong>Observações:</strong> ${escapeHtml(o.notes)}
  </div>`
      : ''
  }

  <table style="margin-bottom: 0;">
    <thead>
      <tr>
        <th style="width: 25px; text-align: center;">#</th>
        <th style="width: 110px;">Código Item</th>
        <th>Descrição do Item</th>
        <th style="width: 70px; text-align: right;">Qtd</th>
        <th style="width: 40px; text-align: center;">Un</th>
        <th style="width: 150px;">Nº Ordem / Doc ERP</th>
      </tr>
    </thead>
    <tbody>${itemRows || '<tr><td colspan="6" class="text-center">Sem itens</td></tr>'}</tbody>
  </table>
</div>`;
    })
    .join('\n');

  const body = `
<header>
  <h1 class="header-title">REGISTRO DE ORDENS MANUAIS A LANÇAR NO ERP — ${kindLabel.toUpperCase()}S</h1>
  <div class="header-meta">
    <div>Gerado em: <strong>${escapeHtml(today)}</strong></div>
    <div>Ordens Abertas: <strong>${orders.length}</strong></div>
    <div>Total de Itens: <strong>${totalItemsCount}</strong></div>
  </div>
</header>

${blocks}

<div class="signatures">
  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-title">Responsável pelo Lançamento (ERP)</div>
  </div>
  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-title">Visto Supervisor de Estoque</div>
  </div>
</div>

<footer>
  <div>NatumHub — Sistema de Gestão Unificado</div>
  <div>Relatório de Lançamento ERP</div>
</footer>`;

  printHtmlDocument(`Fila ERP — ${kindLabel}`, body);
}

/** Impressão individual de uma Ordem Manual (CEI/CSI) padronizada com o sistema. */
export function printSingleOrder(o: PrintOrder) {
  const kindLabel = o.kind === 'entrada' ? 'Entrada' : 'Saída';
  const todayStr = new Date().toLocaleDateString('pt-BR');

  let totalQtySum = 0;
  const rows = o.items
    .map((it, idx) => {
      totalQtySum += Number(it.qty) || 0;
      return `<tr>
      <td class="text-center font-bold" style="color: #6b7280; width: 25px;">${idx + 1}</td>
      <td class="mono font-bold" style="width: 120px;">${escapeHtml(it.itemCode)}</td>
      <td>${escapeHtml(it.description)}</td>
      <td class="text-right font-bold" style="width: 80px;">${fmtNum(it.qty)}</td>
      <td class="text-center" style="width: 45px;">${escapeHtml(it.unit || 'UN')}</td>
    </tr>`;
    })
    .join('');

  const body = `
<header>
  <h1 class="header-title">ORDEM MANUAL DE ${kindLabel.toUpperCase()} — Nº ${escapeHtml(o.orderNumber)}</h1>
  <div class="header-meta">
    <div>NatumHub · Gestão Operacional de Estoque</div>
    <div>Emissão: <strong>${escapeHtml(o.orderDate || todayStr)}</strong></div>
    <div>Situação: <strong>Registrada</strong></div>
  </div>
</header>

<!-- Resumo do Documento -->
<div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 8.5px; color: #374151;">
  <div style="display: flex; gap: 20px; flex-wrap: wrap;">
    <div><strong>Tipo de Registro:</strong> ${escapeHtml(o.recordType || 'Geral')}</div>
    <div><strong>Parceiro / Fornecedor / Destino:</strong> ${escapeHtml(o.partnerName || '—')}</div>
  </div>
  ${
    o.notes
      ? `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #f3f4f6; color: #4b5563;">
    <strong>Observações:</strong> ${escapeHtml(o.notes)}
  </div>`
      : ''
  }
</div>

<!-- Tabela de Itens -->
<table>
  <thead>
    <tr>
      <th style="width: 25px; text-align: center;">#</th>
      <th style="width: 120px;">Código Item</th>
      <th>Descrição do Material / Insumo</th>
      <th style="width: 80px; text-align: right;">Quantidade</th>
      <th style="width: 45px; text-align: center;">Un</th>
    </tr>
  </thead>
  <tbody>${rows || '<tr><td colspan="5" class="text-center">Sem itens adicionados</td></tr>'}</tbody>
  <tfoot>
    <tr style="background-color: #f3f4f6; font-weight: bold;">
      <td colspan="3" class="text-right">TOTAL DA ORDEM (${o.items.length} itens):</td>
      <td class="text-right">${fmtNum(totalQtySum)}</td>
      <td class="text-center">—</td>
    </tr>
  </tfoot>
</table>

<div class="signatures">
  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-title">Emitido por (Estoque)</div>
  </div>
  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-title">Conferido / Recebido por</div>
  </div>
</div>

<footer>
  <div>NatumHub — Sistema de Gestão Unificado</div>
  <div>Documento Operacional de Estoque</div>
</footer>`;

  printHtmlDocument(`Ordem ${o.orderNumber}`, body);
}
