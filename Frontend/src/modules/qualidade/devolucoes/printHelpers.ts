/** Impressões no visual das listas de Compras (PrintListTab). */

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

import { cleanupPrintIframes } from '../../geral/lib/printCleanup';

export { cleanupPrintIframes };

export function printHtmlDocument(title: string, bodyHtml: string) {
  cleanupPrintIframes();
  if (!document.body) return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-natum-print', '1');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = 'about:blank';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  let cleaned = false;
  let started = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (document.activeElement === iframe) {
        iframe.blur();
      }
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
    if (!win || !doc) {
      cleanup();
      return;
    }

    try {
      doc.open();
      doc.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — Nexus</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 10mm 15mm 10mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      background: #fff;
      margin: 0;
      padding: 0;
      font-size: 10px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    header {
      margin-bottom: 20px;
      border-bottom: 2px solid #111827;
      padding-bottom: 10px;
    }
    .header-title {
      font-size: 18px;
      font-weight: 800;
      color: #111827;
      margin: 0 0 5px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-meta {
      display: flex;
      justify-content: space-between;
      color: #4b5563;
      font-size: 9px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 16px;
      margin-top: 8px;
      font-size: 10px;
      color: #374151;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      page-break-inside: auto;
    }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    th {
      background-color: #f9fafb;
      border-bottom: 2px solid #d1d5db;
      color: #374151;
      font-weight: 700;
      padding: 6px 4px;
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
    }
    td {
      border-bottom: 1px solid #e5e7eb;
      padding: 6px 4px;
      text-align: left;
      vertical-align: middle;
    }
    .num { text-align: right; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .signatures {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      page-break-inside: avoid;
    }
    .signature-box { width: 30%; text-align: center; }
    .signature-line {
      border-top: 1px solid #9ca3af;
      margin-top: 35px;
      margin-bottom: 5px;
    }
    .signature-title {
      font-size: 9px;
      color: #6b7280;
      font-weight: 600;
      text-transform: uppercase;
    }
    .signature-name {
      font-size: 9px;
      color: #111827;
      margin-top: 2px;
    }
    footer {
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      color: #9ca3af;
      border-top: 1px solid #f3f4f6;
      padding-top: 5px;
    }
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
        // Fallback: afterprint nem sempre dispara (Safari / cancelamento)
        setTimeout(cleanup, 60_000);
      } catch {
        cleanup();
      }
    }, 200);
  };

  // Firefox reseta about:blank; esperar load evita contentDocument nulo
  iframe.onload = () => runPrint();
  // Alguns browsers já estão complete ao append
  if (iframe.contentDocument?.readyState === 'complete') {
    runPrint();
  }
}

export type PrintItem = {
  itemCode: string;
  description: string;
  qty: number;
  lotes: string;
  qtyConferida?: number | null;
  analiseObs?: string | null;
  disposicao?: string | null;
  disposicaoObs?: string | null;
  erpStatus: string;
  erpBy?: string | null;
};

export type PrintDevolucao = {
  registerNumber: string;
  status: string;
  clientCode: string;
  clientName: string;
  returnDate: string;
  nfNumber: string;
  receiverName: string;
  carrierName: string;
  notes?: string | null;
  receivedBy?: string | null;
  cqBy?: string | null;
  items: PrintItem[];
};

const DISPOSICAO_LABEL: Record<string, string> = {
  retornar_estoque: 'Retornar estoque',
  trocar_embalagem: 'Trocar embalagem',
  trocar_rotulo: 'Trocar rótulo',
  descartar: 'Descartar',
  quarentena: 'Quarentena',
  outro: 'Outro',
};

export function disposicaoLabel(d?: string | null) {
  if (!d) return '—';
  return DISPOSICAO_LABEL[d] || d;
}

export function printDevolucaoFicha(d: PrintDevolucao) {
  const today = new Date().toLocaleString('pt-BR');
  const items = Array.isArray(d.items) ? d.items : [];
  const rows = items
    .map(
      (it) => `<tr>
      <td class="mono">${escapeHtml(it.itemCode)}</td>
      <td>${escapeHtml(it.description)}</td>
      <td class="num">${escapeHtml(String(it.qty))}</td>
      <td>${escapeHtml(it.lotes || '—')}</td>
      <td class="num">${it.qtyConferida != null ? escapeHtml(String(it.qtyConferida)) : ''}</td>
      <td>${escapeHtml(it.analiseObs || '')}</td>
      <td>${escapeHtml(disposicaoLabel(it.disposicao))}${
        it.disposicaoObs ? `<br/><span style="color:#6b7280">${escapeHtml(it.disposicaoObs)}</span>` : ''
      }</td>
      <td>${escapeHtml(it.erpStatus === 'lancado' ? 'Lançado' : 'Em processo')}</td>
    </tr>`,
    )
    .join('');

  const body = `
<header>
  <h1 class="header-title">Devolução de Cliente — Controle de Qualidade</h1>
  <div class="header-meta">
    <div>Nº <strong class="mono">${escapeHtml(d.registerNumber)}</strong> · Status: <strong>${escapeHtml(d.status)}</strong></div>
    <div>Gerado em: <strong>${escapeHtml(today)}</strong></div>
  </div>
  <div class="meta-grid">
    <div><strong>Cliente:</strong> ${escapeHtml(d.clientCode ? `${d.clientCode} — ${d.clientName}` : d.clientName)}</div>
    <div><strong>Data:</strong> ${escapeHtml(d.returnDate)}</div>
    <div><strong>NF:</strong> ${escapeHtml(d.nfNumber || '—')}</div>
    <div><strong>Recebedor:</strong> ${escapeHtml(d.receiverName || '—')}</div>
    <div><strong>Transportadora:</strong> ${escapeHtml(d.carrierName || '—')}</div>
    <div><strong>Obs.:</strong> ${escapeHtml(d.notes || '—')}</div>
  </div>
</header>
<table>
  <thead>
    <tr>
      <th>Código</th>
      <th>Descrição</th>
      <th class="num">Qtde</th>
      <th>Lote(s)</th>
      <th class="num">Qtde conf.</th>
      <th>Análise</th>
      <th>Disposição</th>
      <th>ERP</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="signatures">
  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-title">Recepção</div>
    <div class="signature-name">${escapeHtml(d.receivedBy || d.receiverName || '________________')}</div>
  </div>
  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-title">Controle de Qualidade</div>
    <div class="signature-name">${escapeHtml(d.cqBy || '________________')}</div>
  </div>
  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-title">Lançamento ERP</div>
    <div class="signature-name">________________</div>
  </div>
</div>
<footer>
  <div>Nexus — Sistema de Gestão Unificado</div>
  <div>Qualidade · Devoluções</div>
</footer>`;

  printHtmlDocument(`Devolução ${d.registerNumber}`, body);
}

export function printErpPending(d: PrintDevolucao) {
  const items = Array.isArray(d.items) ? d.items : [];
  const pending = items.filter((it) => it.erpStatus !== 'lancado');
  if (pending.length === 0) return;

  const today = new Date().toLocaleString('pt-BR');
  const rows = pending
    .map(
      (it) => `<tr>
      <td style="width:18px;text-align:center">□</td>
      <td class="mono">${escapeHtml(it.itemCode)}</td>
      <td>${escapeHtml(it.description)}</td>
      <td class="num">${escapeHtml(String(it.qtyConferida ?? it.qty))}</td>
      <td>${escapeHtml(it.lotes || '—')}</td>
      <td>${escapeHtml(disposicaoLabel(it.disposicao))}</td>
    </tr>`,
    )
    .join('');

  const body = `
<header>
  <h1 class="header-title">Itens a lançar no ERP — Devolução</h1>
  <div class="header-meta">
    <div>Nº <strong class="mono">${escapeHtml(d.registerNumber)}</strong> · ${escapeHtml(d.clientName)}</div>
    <div>Gerado em: <strong>${escapeHtml(today)}</strong> · Pendentes: <strong>${pending.length}</strong></div>
  </div>
</header>
<table>
  <thead>
    <tr>
      <th>OK</th>
      <th>Código</th>
      <th>Descrição</th>
      <th class="num">Qtde</th>
      <th>Lote(s)</th>
      <th>Disposição</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="signatures">
  <div class="signature-box" style="width:45%">
    <div class="signature-line"></div>
    <div class="signature-title">Responsável pelo lançamento</div>
  </div>
  <div class="signature-box" style="width:45%">
    <div class="signature-line"></div>
    <div class="signature-title">Data</div>
  </div>
</div>
<footer>
  <div>Nexus — Sistema de Gestão Unificado</div>
  <div>Qualidade · Devoluções · A lançar no ERP</div>
</footer>`;

  printHtmlDocument(`A lançar ERP ${d.registerNumber}`, body);
}
