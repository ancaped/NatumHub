import { cleanupPrintIframes } from '../../../geral/lib/printCleanup';
import type { LaudoItem, LaudoEnsaio } from '../types';

const PADRAO_ENSAIOS_NOMES = [
  'Aspecto',
  'Cor',
  'Odor',
  'pH',
  'Ponto de Fusão (°C)',
];

/**
 * Constrói o HTML de 1 laudo preenchido individual (estilo NatumHub elegante v1).
 */
export function buildLaudoSingleCardHtml(laudo: LaudoItem, logoSrc?: string | null): string {
  // Mescla ensaios existentes ou padrões
  const ensaiosParaExibir = [...(laudo.ensaios || [])];
  if (ensaiosParaExibir.length === 0) {
    PADRAO_ENSAIOS_NOMES.forEach((nome) => {
      ensaiosParaExibir.push({
        ensaio: nome,
        especificacao: 'Conforme padrão',
        resultado: 'Conforme',
        conforme: true,
      });
    });
  }

  const ensaiosRows = ensaiosParaExibir
    .map(
      (e, idx) => `
      <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="col-ensaio"><strong>${e.ensaio || '—'}</strong></td>
        <td class="col-spec">${e.especificacao || '—'}</td>
        <td class="col-res">${e.resultado || '—'}</td>
        <td class="col-conf text-center">
          <span class="badge-conf ${e.conforme ? 'conf-c' : 'conf-nc'}">
            ${e.conforme ? 'CONFORME' : 'NÃO CONF.'}
          </span>
        </td>
      </tr>
    `
    )
    .join('');

  const statusAprovado = laudo.parecer === 'APROVADO';
  const statusReprovado = laudo.parecer === 'REPROVADO';
  const statusQuarentena = laudo.parecer === 'QUARENTENA';
  const dataFmt = laudo.data_analise ? laudo.data_analise.split('-').reverse().join('/') : '';
  const dataEntradaFmt = laudo.data_entrada ? laudo.data_entrada.split('-').reverse().join('/') : '—';
  const dataValidadeFmt = laudo.data_validade ? laudo.data_validade.split('-').reverse().join('/') : '—';

  return `
    <div class="laudo-container">
      <!-- CABEÇALHO ELEGANTE EM 3 COLUNAS -->
      <div class="header-table">
        <div class="header-logo">
          ${
            logoSrc
              ? `<img src="${logoSrc}" alt="Logo" class="logo-img" />`
              : `<div class="logo-text">NATUMIX</div>`
          }
        </div>
        <div class="header-title">
          <div class="title-main">LAUDO DE CONTROLE DE QUALIDADE</div>
          <div class="title-sub">RECEBIMENTO DE MATÉRIA-PRIMA</div>
          <div class="title-code">FOR-CQL-036 V.03</div>
        </div>
        <div class="header-control">
          <div class="control-box">
            <span class="ctrl-label">LAUDO / REG:</span>
            <span class="ctrl-val font-mono">${laudo.codigo_laudo}</span>
          </div>
          <div class="control-box">
            <span class="ctrl-label">DATA ANÁLISE:</span>
            <span class="ctrl-val font-mono">${dataFmt || '—'}</span>
          </div>
        </div>
      </div>

      <!-- DADOS DA MATÉRIA PRIMA -->
      <table class="info-table">
        <tr>
          <td class="w-65">
            <span class="lbl">INSUMO / MATÉRIA-PRIMA:</span>
            <span class="val font-bold">${laudo.codigo_ref ? `[${laudo.codigo_ref}] ` : ''}${laudo.insumo_nome}</span>
          </td>
          <td class="w-35">
            <span class="lbl">CÓD. RECEBIMENTO:</span>
            <span class="val font-mono font-bold">${laudo.codigo_receb || '—'}</span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="lbl">FORNECEDOR:</span>
            <span class="val">${laudo.fornecedor_nome || '—'}</span>
          </td>
          <td>
            <span class="lbl">NOTA FISCAL:</span>
            <span class="val font-mono font-bold">${laudo.nota_fiscal || '—'}</span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="lbl">LOTE FORNECEDOR:</span>
            <span class="val font-mono font-bold">${laudo.lote_fornecedor || '—'}</span>
          </td>
          <td>
            <span class="lbl">QUANTIDADE TOTAL:</span>
            <span class="val font-bold">${laudo.quantidade_total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${laudo.unidade || 'KG'}</span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="lbl">DATA DE ENTRADA:</span>
            <span class="val font-mono">${dataEntradaFmt}</span>
          </td>
          <td>
            <span class="lbl">DATA DE VALIDADE:</span>
            <span class="val font-mono">${dataValidadeFmt}</span>
          </td>
        </tr>
      </table>

      <!-- TABELA DE ENSAIOS FÍSICO-QUÍMICOS -->
      <table class="tests-table">
        <thead>
          <tr>
            <th class="col-ensaio">ANÁLISE / ENSAIO</th>
            <th class="col-spec">ESPECIFICAÇÃO</th>
            <th class="col-res">RESULTADO</th>
            <th class="col-conf text-center">SITUAÇÃO</th>
          </tr>
        </thead>
        <tbody>
          ${ensaiosRows}
        </tbody>
      </table>

      <!-- RODAPÉ: PARECER E ASSINATURA COM ESPAÇO AMPLO PARA VISTO/CARIMBO -->
      <div class="footer-row">
        <div class="parecer-col">
          <span class="lbl">PARECER FINAL:</span>
          <div class="parecer-badges">
            <span class="chk-item ${statusAprovado ? 'chk-selected' : ''}">
              [${statusAprovado ? ' X ' : '   '}] APROVADO
            </span>
            <span class="chk-item ${statusReprovado ? 'chk-selected' : ''}">
              [${statusReprovado ? ' X ' : '   '}] REPROVADO
            </span>
            <span class="chk-item ${statusQuarentena ? 'chk-selected' : ''}">
              [${statusQuarentena ? ' X ' : '   '}] QUARENTENA
            </span>
          </div>
          ${laudo.observacoes ? `<div class="obs-box"><strong>Obs:</strong> ${laudo.observacoes}</div>` : ''}
        </div>

        <!-- ESPAÇO AMPLO PARA ASSINATURA À CANETA, VISTO E CARIMBO FÍSICO DO CQ -->
        <div class="sign-col">
          <div class="carimbo-space">
            <span class="carimbo-hint">(Espaço para Visto / Carimbo do CQ)</span>
          </div>
          <div class="sign-line"></div>
          <div class="sign-name">
            <strong>${laudo.responsavel_cq || 'Controle de Qualidade'}</strong>
          </div>
          <div class="sign-sub">Analista CQ / Responsável Técnico</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Constrói o HTML de 1 laudo em branco (modelo avulso para preenchimento manual).
 */
export function buildLaudoBlankCardHtml(logoSrc?: string | null): string {
  const blankRows = PADRAO_ENSAIOS_NOMES.map(
    (nome, idx) => `
    <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
      <td class="col-ensaio"><strong>${nome}</strong></td>
      <td class="col-spec"></td>
      <td class="col-res"></td>
      <td class="col-conf text-center"></td>
    </tr>
  `
  ).join('');

  return `
    <div class="laudo-container blank-card">
      <!-- CABEÇALHO ELEGANTE -->
      <div class="header-table">
        <div class="header-logo">
          ${
            logoSrc
              ? `<img src="${logoSrc}" alt="Logo" class="logo-img" />`
              : `<div class="logo-text">NATUMIX</div>`
          }
        </div>
        <div class="header-title">
          <div class="title-main">LAUDO DE CONTROLE DE QUALIDADE</div>
          <div class="title-sub">RECEBIMENTO DE MATÉRIA-PRIMA (MODELO AVULSO)</div>
          <div class="title-code">FOR-CQL-036 V.03</div>
        </div>
        <div class="header-control">
          <div class="control-box">
            <span class="ctrl-label">LAUDO / REG:</span>
            <span class="ctrl-val font-mono">___________</span>
          </div>
          <div class="control-box">
            <span class="ctrl-label">DATA ANÁLISE:</span>
            <span class="ctrl-val font-mono">___/___/______</span>
          </div>
        </div>
      </div>

      <!-- DADOS DA MATÉRIA PRIMA EM BRANCO -->
      <table class="info-table">
        <tr>
          <td class="w-65">
            <span class="lbl">INSUMO / MATÉRIA-PRIMA:</span>
            <span class="val font-mono">________________________________________________</span>
          </td>
          <td class="w-35">
            <span class="lbl">CÓD. RECEBIMENTO:</span>
            <span class="val font-mono">____________________</span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="lbl">FORNECEDOR:</span>
            <span class="val font-mono">________________________________________________</span>
          </td>
          <td>
            <span class="lbl">NOTA FISCAL:</span>
            <span class="val font-mono">____________________</span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="lbl">LOTE FORNECEDOR:</span>
            <span class="val font-mono">________________________________</span>
          </td>
          <td>
            <span class="lbl">QUANTIDADE TOTAL:</span>
            <span class="val font-mono">____________________</span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="lbl">DATA DE ENTRADA:</span>
            <span class="val font-mono">___/___/______</span>
          </td>
          <td>
            <span class="lbl">DATA DE VALIDADE:</span>
            <span class="val font-mono">___/___/______</span>
          </td>
        </tr>
      </table>

      <!-- TABELA DE ENSAIOS -->
      <table class="tests-table">
        <thead>
          <tr>
            <th class="col-ensaio">ANÁLISE / ENSAIO</th>
            <th class="col-spec">ESPECIFICAÇÃO</th>
            <th class="col-res">RESULTADO</th>
            <th class="col-conf text-center">SITUAÇÃO</th>
          </tr>
        </thead>
        <tbody>
          ${blankRows}
        </tbody>
      </table>

      <!-- RODAPÉ -->
      <div class="footer-row">
        <div class="parecer-col">
          <span class="lbl">PARECER FINAL:</span>
          <div class="parecer-badges">
            <span class="chk-item">[   ] APROVADO</span>
            <span class="chk-item">[   ] REPROVADO</span>
            <span class="chk-item">[   ] QUARENTENA</span>
          </div>
          <div class="obs-box" style="margin-top: 6px;">
            <strong>Obs:</strong> __________________________________________________
          </div>
        </div>

        <div class="sign-col">
          <div class="carimbo-space">
            <span class="carimbo-hint">(Espaço para Visto / Carimbo do CQ)</span>
          </div>
          <div class="sign-line"></div>
          <div class="sign-name">
            <strong>Assinatura do Analista CQ</strong>
          </div>
          <div class="sign-sub">Analista CQ / Responsável Técnico</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Estilos CSS padronizados para impressão fiel da folha A4 com 2 laudos.
 */
function getPrintStyleSheet(): string {
  return `
    @page {
      size: A4 portrait;
      margin: 6mm 8mm 6mm 8mm;
    }
    *, *::before, *::after {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #111827;
      background: #ffffff;
    }

    .sheet-container {
      display: flex;
      flex-direction: column;
      height: 284mm;
      max-height: 284mm;
      justify-content: space-between;
      page-break-after: always;
      page-break-inside: avoid;
    }

    .laudo-slot {
      height: 137mm;
      max-height: 137mm;
      display: flex;
      flex-direction: column;
    }

    /* LINHA PONTILHADA DE CORTE */
    .cut-divider {
      height: 8mm;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .cut-line {
      width: 100%;
      border-top: 1.5px dashed #9ca3af;
      position: absolute;
      top: 50%;
    }
    .cut-badge {
      background: #ffffff;
      padding: 0 10px;
      font-size: 7.5pt;
      color: #4b5563;
      position: relative;
      z-index: 2;
      font-weight: bold;
      letter-spacing: 1px;
    }

    /* MOLDURA PRINCIPAL DO LAUDO ESTILO NATUMHUB V1 */
    .laudo-container {
      border: 1.5px solid #1f2937;
      border-radius: 4px;
      padding: 6px 10px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #ffffff;
    }

    /* CABEÇALHO EM 3 BLOCOS */
    .header-table {
      display: flex;
      align-items: center;
      border-bottom: 1.5px solid #1f2937;
      padding-bottom: 5px;
      margin-bottom: 4px;
    }
    .header-logo {
      width: 85px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-img {
      max-height: 38px;
      max-width: 82px;
      object-fit: contain;
    }
    .logo-text {
      font-size: 13pt;
      font-weight: 900;
      letter-spacing: 1.5px;
      color: #047857;
      font-family: Arial, Helvetica, sans-serif;
    }
    .header-title {
      flex: 1;
      text-align: center;
      padding: 0 8px;
    }
    .title-main {
      font-size: 10.5pt;
      font-weight: 900;
      letter-spacing: 0.5px;
      color: #111827;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .title-sub {
      font-size: 8pt;
      font-weight: 700;
      color: #374151;
      margin-top: 1px;
    }
    .title-code {
      font-size: 7.5pt;
      font-weight: 700;
      color: #4b5563;
      margin-top: 1px;
    }
    .header-control {
      width: 140px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .control-box {
      border: 1px solid #374151;
      background: #f9fafb;
      padding: 2px 6px;
      border-radius: 3px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ctrl-label {
      font-size: 6.5pt;
      font-weight: bold;
      color: #4b5563;
    }
    .ctrl-val {
      font-size: 8pt;
      font-weight: 800;
      color: #111827;
    }

    /* DADOS DO INSUMO */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 4px;
      font-size: 7.5pt;
    }
    .info-table td {
      border: 1px solid #d1d5db;
      padding: 2.5px 5px;
      vertical-align: middle;
    }
    .w-65 { width: 65%; }
    .w-35 { width: 35%; }
    .lbl {
      font-size: 6.5pt;
      color: #4b5563;
      font-weight: bold;
      display: block;
      line-height: 1;
      margin-bottom: 1px;
    }
    .val {
      color: #111827;
      line-height: 1.2;
      font-size: 7.5pt;
    }

    /* TABELA DE ENSAIOS */
    .tests-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 4px;
      font-size: 7.5pt;
      flex: 1;
    }
    .tests-table th {
      background: #f3f4f6;
      border: 1px solid #9ca3af;
      padding: 2.5px 6px;
      font-size: 6.5pt;
      font-weight: 800;
      text-align: left;
      color: #1f2937;
    }
    .tests-table td {
      border: 1px solid #d1d5db;
      padding: 2.5px 6px;
      vertical-align: middle;
      height: 5.2mm;
    }
    .row-even { background: #ffffff; }
    .row-odd { background: #fafafa; }
    .col-ensaio { width: 32%; }
    .col-spec { width: 34%; }
    .col-res { width: 22%; }
    .col-conf { width: 12%; }
    .text-center { text-align: center; }

    /* BADGES DE CONFORMIDADE */
    .badge-conf {
      display: inline-block;
      font-weight: 800;
      font-size: 6.5pt;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .conf-c {
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .conf-nc {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }

    /* RODAPÉ AMPLO: PARECER E ASSINATURA DO ANALISTA CQ */
    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      border-top: 1.5px solid #1f2937;
      padding-top: 4px;
      gap: 12px;
      min-height: 24mm;
    }
    .parecer-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .parecer-badges {
      display: flex;
      gap: 6px;
      margin-top: 2px;
    }
    .chk-item {
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2px 6px;
      border: 1px solid #9ca3af;
      border-radius: 3px;
      background: #f9fafb;
      color: #374151;
    }
    .chk-selected {
      border-color: #047857;
      background: #ecfdf5;
      color: #065f46;
      box-shadow: 0 0 0 1px #047857;
    }
    .obs-box {
      font-size: 7pt;
      color: #4b5563;
      margin-top: 2px;
    }

    /* ESPAÇO AMPLIADO PARA ASSINATURA, VISTO E CARIMBO FÍSICO DO CQ */
    .sign-col {
      width: 220px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      text-align: center;
      padding-top: 2px;
    }
    .carimbo-space {
      height: 12mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .carimbo-hint {
      font-size: 6.5pt;
      color: #9ca3af;
      font-style: italic;
    }
    .sign-line {
      border-top: 1px solid #111827;
      margin-bottom: 2px;
      width: 95%;
      margin-left: auto;
      margin-right: auto;
    }
    .sign-name {
      font-size: 8pt;
      color: #111827;
      line-height: 1.1;
    }
    .sign-sub {
      font-size: 6.5pt;
      color: #6b7280;
    }

    .font-bold { font-weight: bold; }
    .font-mono { font-family: monospace; }
  `;
}

/**
 * Imprime 2 laudos DIFERENTES na mesma folha A4 (ou o segundo em branco).
 */
export function printLaudoA4(
  laudo1: LaudoItem,
  laudo2?: LaudoItem | null,
  logoSrc?: string | null
) {
  cleanupPrintIframes();

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const cardHtml1 = buildLaudoSingleCardHtml(laudo1, logoSrc);
  const cardHtml2 = laudo2
    ? buildLaudoSingleCardHtml(laudo2, logoSrc)
    : buildLaudoBlankCardHtml(logoSrc);

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Laudo CQ A4 - ${laudo1.codigo_laudo}${laudo2 ? ` & ${laudo2.codigo_laudo}` : ''}</title>
      <style>
        ${getPrintStyleSheet()}
      </style>
    </head>
    <body>
      <div class="sheet-container">
        <!-- 1º LAUDO (PARTE SUPERIOR) -->
        <div class="laudo-slot">
          ${cardHtml1}
        </div>

        <!-- LINHA DE CORTE CENTRAL -->
        <div class="cut-divider">
          <div class="cut-line"></div>
          <span class="cut-badge">✂ CORTE AQUI (2 LAUDOS POR FOLHA A4) ✂</span>
        </div>

        <!-- 2º LAUDO DIFERENTE OU EM BRANCO (PARTE INFERIOR) -->
        <div class="laudo-slot">
          ${cardHtml2}
        </div>
      </div>

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

  doc.open();
  doc.write(html);
  doc.close();
}

/**
 * Imprime uma lista de múltiplos laudos em lote, agrupando de 2 em 2 por folha A4.
 */
export function printMultipleLaudosA4(
  laudos: LaudoItem[],
  logoSrc?: string | null
) {
  if (!laudos || laudos.length === 0) return;

  cleanupPrintIframes();

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  let sheetsHtml = '';

  for (let i = 0; i < laudos.length; i += 2) {
    const l1 = laudos[i];
    const l2 = i + 1 < laudos.length ? laudos[i + 1] : null;

    const card1 = buildLaudoSingleCardHtml(l1, logoSrc);
    const card2 = l2 ? buildLaudoSingleCardHtml(l2, logoSrc) : buildLaudoBlankCardHtml(logoSrc);

    sheetsHtml += `
      <div class="sheet-container">
        <div class="laudo-slot">
          ${card1}
        </div>
        <div class="cut-divider">
          <div class="cut-line"></div>
          <span class="cut-badge">✂ CORTE AQUI (2 LAUDOS POR FOLHA A4) ✂</span>
        </div>
        <div class="laudo-slot">
          ${card2}
        </div>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Laudos CQ em Lote (${laudos.length} laudos)</title>
      <style>
        ${getPrintStyleSheet()}
      </style>
    </head>
    <body>
      ${sheetsHtml}
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

  doc.open();
  doc.write(html);
  doc.close();
}
