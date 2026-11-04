// Relatório impresso de compras: uma montagem só para a lista atual (PrintListTab) e para a
// via do lote (ListasAcompanhamentoTab). As telas calculam os valores e passam aqui já prontos.

export interface ColunaRelatorio {
  key: string;
  label: string;
  align: 'left' | 'center' | 'right';
}

export interface ItemRelatorio {
  codigo: string;
  descricao: string;
  /** Linha pequena sob a descrição (categoria na lista atual, fornecedor sugerido no lote). */
  subtexto?: string | null;
  observacao?: string | null;
  unidade: string;
  estoque: number;
  media: number;
  simProducao: number;
  previsaoFutura: number;
  /** Duração do estoque em dias; 9999 = sem consumo (infinita). */
  duracaoDias: number;
  gatilhoDias: number | null;
  metaDias: number | null;
  /** Limiares usados só para a cor/ênfase (já com os padrões 30 e 90 aplicados). */
  gatilhoRef: number;
  metaRef: number;
  quantidade: number;
  /** Duração depois da compra; 9999 = infinita. */
  duracaoPosDias: number;
  ultimaNF?: string | null;
  ultimoPedido?: string | null;
}

export interface DadosRelatorio {
  titulo: string;
  lote?: string | null;
  geradoEm: string;
  solicitante?: string | null;
  observacoes?: string | null;
  colunas: ColunaRelatorio[];
  itens: ItemRelatorio[];
  /** Data URL da logo; vazio = sem logo. */
  logo?: string | null;
}

export function escaparHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const fmt = (n: number, opcoes?: Intl.NumberFormatOptions) => (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', opcoes);
const comUnidade = (n: number, un: string) => `${fmt(n)}${un ? ` ${escaparHtml(un)}` : ''}`;

function celulas(col: string, it: ItemRelatorio): string {
  switch (col) {
    case 'itemCode':
      return `<td class="cod">${escaparHtml(it.codigo || '-')}</td>
        <td class="desc">${escaparHtml(it.descricao || '-')}${it.subtexto ? `<span class="sub">${escaparHtml(it.subtexto)}</span>` : ''}${it.observacao ? `<span class="obs">Obs: ${escaparHtml(it.observacao)}</span>` : ''}</td>`;
    case 'lastSupplierInvoice':
      return `<td class="txt">${escaparHtml(it.ultimaNF || '-')}</td>`;
    case 'lastSupplierOrder':
      return `<td class="txt">${escaparHtml(it.ultimoPedido || '-')}</td>`;
    case 'currentStock':
      return `<td class="num">${comUnidade(it.estoque, it.unidade)}</td>`;
    case 'overallAvg':
      return `<td class="num">${comUnidade(it.media, it.unidade)}</td>`;
    case 'simProducao':
      return `<td class="num">${it.simProducao > 0 ? fmt(it.simProducao, { maximumFractionDigits: 1 }) : '-'}</td>`;
    case 'futureStockForecast':
      return `<td class="num">${comUnidade(it.previsaoFutura, it.unidade)}</td>`;
    case 'estimatedDurationDays': {
      const baixo = it.duracaoDias < it.gatilhoRef;
      return `<td class="ctr${baixo ? ' alerta' : ''}">${it.duracaoDias === 9999 ? '9999+' : `${it.duracaoDias} dias`}</td>`;
    }
    case 'triggerDays':
      return `<td class="ctr">${it.gatilhoDias !== null && it.gatilhoDias !== undefined ? `${it.gatilhoDias}d` : '-'}</td>`;
    case 'targetDays':
      return `<td class="ctr forte">${it.metaDias !== null && it.metaDias !== undefined ? `${it.metaDias}d` : '90d'}</td>`;
    case 'recommendedQty': {
      const tom = it.duracaoPosDias < it.gatilhoRef ? 'alerta' : it.duracaoPosDias < it.metaRef ? 'atencao' : 'ok';
      return `<td class="num qtd"><div class="qtd-v">${it.quantidade > 0 ? comUnidade(it.quantidade, it.unidade) : '-'}</div><div class="pos ${tom}">Pós: ${it.duracaoPosDias === 9999 ? '∞' : `${it.duracaoPosDias}d`}</div></td>`;
    }
    default:
      return '';
  }
}

function cabecalhos(colunas: ColunaRelatorio[]): string {
  return colunas.map((c) => {
    if (c.key === 'itemCode') return '<th class="l" style="width:62px">Ref</th><th class="l">Descrição do insumo</th>';
    const cls = c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : 'l';
    return `<th class="${cls}">${escaparHtml(c.label)}</th>`;
  }).join('');
}

const CSS = `
  @page { size: A4 portrait; margin: 14mm 10mm 18mm 10mm;
    @bottom-left { content: "Nexus"; font: 8px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #71717a; }
    @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #71717a; } }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #27272a; background: #fff; margin: 0; font-size: 10px; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 1px solid #a1a1aa; }
  .logo { max-height: 42px; max-width: 120px; object-fit: contain; display: block; }
  .tit { flex: 1; min-width: 0; }
  .tit h1 { margin: 0; font-size: 17px; font-weight: 700; color: #09090b; letter-spacing: -0.2px; line-height: 1.2; }
  .lote { display: inline-block; margin-top: 5px; padding: 1px 8px; border: 1px solid #52525b; border-radius: 999px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; font-weight: 600; color: #27272a; }
  .meta { text-align: right; font-size: 9px; color: #52525b; line-height: 1.6; white-space: nowrap; }
  .meta b { color: #27272a; font-weight: 600; }
  .observacoes { margin: -4px 0 12px; padding: 4px 8px; border-left: 2px solid #52525b; background: #fafafa; font-size: 9px; color: #3f3f46; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { padding: 5px 6px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #3f3f46; border-bottom: 1.5px solid #52525b; }
  td { padding: 5px 6px; font-size: 9px; vertical-align: middle; border-bottom: 1px solid #e4e4e7; }
  .l { text-align: left; } .r { text-align: right; } .c { text-align: center; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.ctr { text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.txt { text-align: left; max-width: 120px; }
  td.cod { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 9px; color: #3f3f46; white-space: nowrap; }
  td.desc { font-size: 10px; font-weight: 500; color: #18181b; }
  .sub { display: block; font-size: 8px; font-weight: 400; color: #71717a; }
  .obs { display: block; font-size: 8px; font-weight: 400; font-style: italic; color: #52525b; }
  td.alerta { font-weight: 700; color: #b91c1c; }
  td.forte { font-weight: 700; }
  td.qtd { background: #f4f4f5; border-left: 1px solid #d4d4d8; }
  .qtd-v { font-weight: 700; font-size: 10px; color: #09090b; }
  .pos { font-size: 8px; font-weight: 400; margin-top: 1px; }
  .pos.alerta { color: #b91c1c; font-weight: 700; } .pos.atencao { color: #a16207; } .pos.ok { color: #3f6b4f; }
  .assinaturas { display: flex; justify-content: space-between; margin-top: 44px; break-inside: avoid; page-break-inside: avoid; }
  .assinatura { width: 42%; text-align: center; }
  .linha { border-top: 1px solid #71717a; margin-bottom: 4px; }
  .rotulo { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #52525b; }
  .nota { margin-top: 18px; padding-top: 6px; border-top: 1px solid #e4e4e7; font-size: 8px; color: #71717a; }
`;

export function montarRelatorioCompra(d: DadosRelatorio): string {
  const colunas = d.colunas.filter((c) => c.key);
  const linhas = d.itens.map((it) => `<tr>${colunas.map((c) => celulas(c.key, it)).join('')}</tr>`).join('');
  const lote = d.lote ? escaparHtml(d.lote) : '';
  const logo = d.logo ? `<img class="logo" src="${escaparHtml(d.logo)}" alt="">` : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escaparHtml(d.titulo)}${lote ? ` — ${lote}` : ''}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  ${logo}
  <div class="tit">
    <h1>${escaparHtml(d.titulo)}</h1>
    ${lote ? `<span class="lote">${lote}</span>` : ''}
  </div>
  <div class="meta">
    <div><b>Gerado em:</b> ${escaparHtml(d.geradoEm)}</div>
    <div><b>Itens:</b> ${d.itens.length}</div>
    ${d.solicitante ? `<div><b>Solicitante:</b> ${escaparHtml(d.solicitante)}</div>` : ''}
    <div><b>Objetivos de estoque:</b> por subcategoria</div>
  </div>
</header>
${d.observacoes ? `<div class="observacoes"><b>Observações:</b> ${escaparHtml(d.observacoes)}</div>` : ''}
<table>
  <thead><tr>${cabecalhos(colunas)}</tr></thead>
  <tbody>${linhas}</tbody>
</table>
<div class="assinaturas">
  <div class="assinatura"><div class="linha"></div><div class="rotulo">Solicitante${d.solicitante ? ` (${escaparHtml(d.solicitante)})` : ''}</div></div>
  <div class="assinatura"><div class="linha"></div><div class="rotulo">Comprador / Lançamento ERP</div></div>
</div>
<div class="nota">* Metas e pontos de disparo são calculados conforme a subcategoria/insumo definido no sistema.${lote ? ` Rastreado sob ${lote}.` : ''}</div>
</body>
</html>`;
}
