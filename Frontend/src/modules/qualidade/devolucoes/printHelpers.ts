/** Impressões no visual das listas de Compras (PrintListTab). */

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

import { cleanupPrintIframes } from '../../geral/lib/printCleanup';
import { apiFetch } from '../../geral/lib/http';
import { COMPANY_INFO, LAB_NAME } from '../../geral/lib/microbioUtils';
import { loadNatumLogoDataUrl } from '../../geral/lib/logoUtils';

export { cleanupPrintIframes, loadNatumLogoDataUrl };

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
  caixaFechada?: boolean;
  unidadesPorCaixa?: number | null;
  qtyConferida?: number | null;
  analiseObs?: string | null;
  disposicao?: string | null;
  disposicaoObs?: string | null;
  erpStatus: string;
  fqPhMedido?: number | null;
  fqViscosidadeMedido?: number | null;
  fqDensidadeMedido?: number | null;
  fqResultado?: string | null;
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
  volumeCount?: number;
  receivedBy?: string | null;
  cqBy?: string | null;
  items: PrintItem[];
};

const DISPOSICAO_LABEL: Record<string, string> = {
  retornar_estoque: 'Retornar estoque',
  trocar_embalagem: 'Trocar embalagem',
  trocar_rotulo: 'Trocar rótulo',
  descartar: 'Descarte / Avaria',
  quarentena: 'Quarentena',
  analise_fq: 'Análise físico-química',
  outro: 'Outro',
};

export function disposicaoLabel(d?: string | null) {
  if (!d) return '—';
  return DISPOSICAO_LABEL[d] || d;
}

export async function printDevolucaoFicha(d: PrintDevolucao) {
  const logo = await loadNatumLogoDataUrl();
  const items = Array.isArray(d.items) ? d.items : [];
  const rows = itemRows(items.map((it) => ({
    itemCode: it.itemCode,
    description: it.description,
    qty: it.qty,
    lotes: it.lotes,
    caixaFechada: it.caixaFechada,
    unidadesPorCaixa: it.unidadesPorCaixa,
    disposicao: it.disposicao,
    disposicaoObs: it.disposicaoObs,
  })));
  const body = `
    <div style="border:1px solid #000;padding:6px 8px;margin-bottom:8px;font-size:8.5pt;">
      <div><strong>EMPRESA/CLIENTE:</strong> ${escapeHtml(d.clientCode ? `${d.clientCode} — ${d.clientName}` : (d.clientName || '—'))}</div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:3px;">
        <div><strong>NF DEVOL.:</strong> ${escapeHtml(d.nfNumber || '—')}</div>
        <div><strong>TRANSPORTADORA:</strong> ${escapeHtml(d.carrierName || '—')}</div>
        <div><strong>DATA:</strong> ${escapeHtml(fmtPrintDate(d.returnDate))}</div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:3px;">
        <div><strong>RECEBEDOR:</strong> ${escapeHtml(d.receiverName || d.receivedBy || '—')}</div>
        <div><strong>VOLUME:</strong> ${escapeHtml(volumeLabel(d.volumeCount || 1))}</div>
      </div>
      ${d.notes ? `<div style="margin-top:4px;"><strong>MOTIVO:</strong> ${escapeHtml(d.notes)}</div>` : ''}
    </div>
    <table style="width:100%;border-collapse:separate;border-spacing:0;border-top:1px solid #000;border-left:1px solid #000;margin:0 0 12px;font-size:8pt;">
      <thead>
        <tr style="background:#f4f4f5;">
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;text-align:left;">CÓDIGO</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;text-align:left;">DESCRIÇÃO</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;width:70px;">QUANTIDADE</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;width:70px;text-align:left;">LOTE</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;width:110px;text-align:left;">DESTINO</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;text-align:left;">OBSERVAÇÃO</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px 28px;margin-top:16px;">
      ${signatureBox('Responsável pelo recebimento')}
      ${signatureBox('Controle de Qualidade')}
      ${signatureBox('Autorizo o retorno para o estoque')}
      ${signatureBox('Itens retornaram para o estoque')}
    </div>`;
  printRawDocument(
    `Recebimento ${d.registerNumber}`,
    laudoShell(logo, 'RELATÓRIO DE RECEBIMENTO DE DEVOLUÇÃO', d.registerNumber, fmtPrintDate(), body),
  );
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
  <h1 class="header-title">Itens para retorno ao estoque — Devolução</h1>
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
      <th>Destino</th>
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
  <div>Qualidade · Devoluções · Retorno ao estoque</div>
</footer>`;

  printHtmlDocument(`Retorno ao estoque ${d.registerNumber}`, body);
}

export function printRawDocument(title: string, bodyHtml: string) {
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
      if (document.activeElement === iframe) iframe.blur();
      window.focus();
      iframe.src = 'about:blank';
      iframe.remove();
    } catch {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch { /* ignore */ }
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
      doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { margin: 0; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style></head><body>${bodyHtml}</body></html>`);
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
  if (iframe.contentDocument?.readyState === 'complete') runPrint();
}



function fmtPrintDate(iso?: string | null) {
  if (!iso) return new Date().toLocaleDateString('pt-BR');
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (day && iso.length <= 10) return `${day[3]}/${day[2]}/${day[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

const DEFAULT_LAUDO_FOOTER =
  'Os produtos relacionados neste documento deverão estar identificados e armazenados em local específico para produtos DEVOLVIDOS.';

export const reportCellLine = 'border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;';
export const reportTableStyle =
  'width:100%;border-collapse:separate;border-spacing:0;border-top:1px solid #000;border-left:1px solid #000;font-size:8pt;';

export function fmtReportDate(iso?: string | null) {
  return fmtPrintDate(iso);
}

export function reportSignatures(titles: string[]) {
  const cols = Math.max(1, titles.length);
  return `<div style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:16px;margin-top:6px;">${titles
    .map((title) => signatureBox(title))
    .join('')}</div>`;
}

export async function printLaudoDocument(
  pageTitle: string,
  title: string,
  number: string,
  issued: string,
  body: string,
  footer?: string,
) {
  const logo = await loadNatumLogoDataUrl();
  printRawDocument(pageTitle, laudoShell(logo, title, number, issued, body, footer));
}

function laudoShell(logo: string, title: string, number: string, issued: string, body: string, footer?: string) {
  const mark = logo
    ? `<img src="${logo}" alt="Natum" style="max-height:52px;max-width:160px;object-fit:contain;" />`
    : `<div style="font-family:'Times New Roman',Times,serif;font-size:18pt;font-weight:bold;">natum</div>`;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;line-height:1.35;color:#000;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1.5px solid #000;padding-bottom:8px;">
      <div style="width:160px;">${mark}</div>
      <div style="text-align:right;">
        <div style="font-family:'Times New Roman',Times,serif;font-size:16pt;font-weight:bold;letter-spacing:0.04em;">${escapeHtml(LAB_NAME)}</div>
        <div style="font-family:'Times New Roman',Times,serif;font-size:8pt;font-weight:bold;letter-spacing:0.28em;margin-top:2px;">CONTROLE DE QUALIDADE</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin:10px 0 8px;">
      <div>
        <div style="font-family:'Times New Roman',Times,serif;font-size:12pt;font-weight:bold;">${escapeHtml(title)}</div>
        <div style="font-family:'Times New Roman',Times,serif;font-size:14pt;font-weight:bold;font-style:italic;margin-top:2px;">${escapeHtml(number)}</div>
      </div>
      <div style="text-align:right;font-size:8.5pt;"><strong>DATA DE EMISSÃO:</strong> ${escapeHtml(issued)}</div>
    </div>
    <div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:5px 0;margin-bottom:10px;font-size:8pt;">
      <strong>EMPRESA:</strong> ${escapeHtml(COMPANY_INFO.name)} &nbsp;·&nbsp;
      ${escapeHtml(COMPANY_INFO.address)} &nbsp;·&nbsp; ${escapeHtml(COMPANY_INFO.contact)}
    </div>
    ${body}
    <div style="margin-top:18px;font-size:7.5pt;">
      <strong>OBS:</strong> ${escapeHtml(footer || DEFAULT_LAUDO_FOOTER)}
    </div>
  </div>`;
}

function signatureBox(title: string) {
  return `<div style="page-break-inside:avoid;">
    <div style="height:28mm;"></div>
    <div style="border-top:1px solid #000;padding-top:4px;">
      <div style="font-size:8pt;font-weight:bold;text-transform:uppercase;">${escapeHtml(title)}</div>
      <div style="margin-top:8px;font-size:8pt;">Data: ____/____/________</div>
    </div>
  </div>`;
}

export type PrintControleItem = {
  id?: number;
  itemCode: string;
  description: string;
  qty: number;
  lotes: string;
  caixaFechada?: boolean;
  unidadesPorCaixa?: number | null;
  disposicao?: string | null;
  disposicaoObs?: string | null;
  erpStatus?: string | null;
};

export type PrintControleDevolucao = {
  id?: number;
  registerNumber: string;
  clientCode: string;
  clientName: string;
  returnDate: string;
  nfNumber: string;
  carrierName: string;
  receiverName: string;
  notes?: string | null;
  volumeCount: number;
  items: PrintControleItem[];
};

export type PrintControle = {
  sheetNumber: string;
  createdAt: string;
  createdBy?: string | null;
  volumeCount: number;
  devolucoes: PrintControleDevolucao[];
};

function disposicaoOrder(disposicao?: string | null) {
  const order = ['retornar_estoque', 'trocar_embalagem', 'trocar_rotulo', 'analise_fq', 'quarentena', 'outro', 'descartar'];
  const index = order.indexOf(disposicao || '');
  return index === -1 ? order.length : index;
}

const cellLine = 'border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;';

function formatPrintQty(it: PrintControleItem) {
  const total = Number(it.qty) || 0;
  const totalStr = `${total.toLocaleString('pt-BR')} un`;
  if (!it.caixaFechada || !it.unidadesPorCaixa || it.unidadesPorCaixa <= 0) {
    return `<div style="font-weight:bold;">${escapeHtml(totalStr)}</div>`;
  }
  const upc = it.unidadesPorCaixa;
  const cx = Math.floor(total / upc);
  const rem = total % upc;
  let cxText = '';
  if (cx > 0 && rem === 0) {
    cxText = `${cx} cx de ${upc} un`;
  } else if (cx > 0) {
    cxText = `${cx} cx (${upc} un) + ${rem} un`;
  } else {
    cxText = `${rem} un (${upc} un/cx)`;
  }
  return `<div><strong style="font-size:8pt;">${escapeHtml(totalStr)}</strong></div><div style="font-size:7pt;color:#15803d;font-weight:bold;white-space:nowrap;margin-top:1px;">${escapeHtml(cxText)}</div>`;
}

function itemRows(items: PrintControleItem[]) {
  return [...items]
    .sort((a, b) => disposicaoOrder(a.disposicao) - disposicaoOrder(b.disposicao))
    .map((it) => `<tr style="break-inside:avoid;page-break-inside:avoid;">
    <td style="${cellLine}font-family:monospace;white-space:nowrap;">${escapeHtml(it.itemCode || '—')}</td>
    <td style="${cellLine}">${escapeHtml(it.description || '')}${it.caixaFechada ? ' <span style="font-size:7pt;font-weight:bold;color:#15803d;border:1px solid #16a34a;border-radius:2px;padding:0 3px;margin-left:4px;">CX FECHADA</span>' : ''}</td>
    <td style="${cellLine}text-align:center;font-family:monospace;">${formatPrintQty(it)}</td>
    <td style="${cellLine}font-family:monospace;">${escapeHtml(it.lotes || '—')}</td>
    <td style="${cellLine}">${escapeHtml(disposicaoLabel(it.disposicao))}</td>
    <td style="${cellLine}">${escapeHtml(it.disposicaoObs || '')}</td>
  </tr>`).join('');
}

function volumeLabel(n: number) {
  return n === 1 ? '1 volume' : `${n} volumes`;
}

export async function printControleDevolucao(sheet: PrintControle) {
  const logo = await loadNatumLogoDataUrl();
  const blocks = sheet.devolucoes.map((dev) => `
    <div style="border:1px solid #000;padding:6px 8px;margin-bottom:8px;font-size:8.5pt;">
      <div style="display:flex;justify-content:space-between;gap:8px;">
        <div><strong>EMPRESA/CLIENTE:</strong> ${escapeHtml(dev.clientCode ? `${dev.clientCode} — ${dev.clientName}` : (dev.clientName || '—'))}</div>
        <div style="font-family:monospace;"><strong>REGISTRO:</strong> ${escapeHtml(dev.registerNumber)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:3px;">
        <div><strong>NF DEVOL.:</strong> ${escapeHtml(dev.nfNumber || '—')}</div>
        <div><strong>TRANSPORTADORA:</strong> ${escapeHtml(dev.carrierName || '—')}</div>
        <div><strong>DATA:</strong> ${escapeHtml(fmtPrintDate(dev.returnDate))}</div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:3px;">
        <div><strong>RECEBEDOR:</strong> ${escapeHtml(dev.receiverName || '—')}</div>
        <div><strong>VOLUME:</strong> ${escapeHtml(volumeLabel(dev.volumeCount || 1))}</div>
      </div>
      ${dev.notes ? `<div style="margin-top:4px;"><strong>MOTIVO:</strong> ${escapeHtml(dev.notes)}</div>` : ''}
    </div>
    <table style="width:100%;border-collapse:separate;border-spacing:0;border-top:1px solid #000;border-left:1px solid #000;margin:0 0 12px;font-size:8pt;">
      <thead>
        <tr style="background:#f4f4f5;">
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;text-align:left;">CÓDIGO</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;text-align:left;">DESCRIÇÃO</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;width:70px;">QUANTIDADE</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;width:70px;text-align:left;">LOTE</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;width:110px;text-align:left;">DESTINO</th>
          <th style="border-right:1px solid #000;border-bottom:1px solid #000;padding:4px 5px;text-align:left;">OBSERVAÇÃO</th>
        </tr>
      </thead>
      <tbody>${itemRows(dev.items)}</tbody>
    </table>`).join('');
  const body = `
    <div style="font-size:8pt;margin-bottom:8px;">
      <strong>VOLUMES DESTE CONTROLE:</strong> ${sheet.volumeCount} &nbsp;·&nbsp;
      <strong>DEVOLUÇÕES:</strong> ${sheet.devolucoes.length} &nbsp;·&nbsp;
      <strong>EMITIDO POR:</strong> ${escapeHtml(sheet.createdBy || '—')}
    </div>
    ${blocks}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px 28px;margin-top:16px;">
      ${signatureBox('Responsável pelo recebimento')}
      ${signatureBox('Controle de Qualidade')}
      ${signatureBox('Autorizo o retorno para o estoque')}
      ${signatureBox('Itens retornaram para o estoque')}
    </div>`;
  printRawDocument(
    `Recebimento ${sheet.sheetNumber}`,
    laudoShell(logo, 'RELATÓRIO DE RECEBIMENTO DE DEVOLUÇÃO', sheet.sheetNumber, fmtPrintDate(sheet.createdAt), body),
  );
}
