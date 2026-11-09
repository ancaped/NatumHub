import { CorrectiveWeekSummary } from '../../../geral/lib/types';
import { escapeHtml } from './fiscoUtils';

/** Folha A4 da baixa semanal dos agentes corretivos (para anexar ao controle de estoque). */
export function imprimirBaixaSemanal(week: CorrectiveWeekSummary): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Permita as janelas pop-up para imprimir o relatório de baixas.');
    return;
  }

  const rowsHtml = week.items
    .map(
      (it) => `
    <tr>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7; font-family: monospace; font-weight: bold;">${escapeHtml(it.batch)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7;">${escapeHtml(it.analysis_date)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7;"><strong>${escapeHtml(it.product_code)}</strong> - ${escapeHtml(it.product_name)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7;">${escapeHtml(it.agent_name)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7; text-align: right;">${it.trial_qty_g_per_l ? `${it.trial_qty_g_per_l} g/L` : '—'}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7; text-align: right;">${it.batch_size_kg ? `${it.batch_size_kg.toLocaleString('pt-BR')} kg` : '—'}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e4e4e7; text-align: right; font-weight: bold; font-family: monospace;">${it.total_agent_kg.toFixed(3)} kg</td>
    </tr>
  `
    )
    .join('');

  const totalsHtml = Object.entries(week.agent_totals)
    .map(
      ([name, kg]) => `
    <div style="display: flex; justify-content: space-between; padding: 6px 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 6px;">
      <span style="font-weight: 600; color: #0f172a;">${escapeHtml(name)}</span>
      <span style="font-weight: 700; font-family: monospace; color: #0284c7;">${kg.toFixed(3)} kg</span>
    </div>
  `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Baixa Semanal de Corretivos - ${escapeHtml(week.label)}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.4; margin: 0; padding: 20px; }
        h1 { font-size: 16px; margin: 0 0 4px 0; color: #0f172a; text-transform: uppercase; }
        .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; text-transform: uppercase; }
        .badge-ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .badge-pending { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #f1f5f9; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; color: #475569; }
        .totals-box { margin-top: 20px; padding: 15px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; }
        .signature-box { margin-top: 40px; display: flex; justify-content: space-between; gap: 30px; }
        .sign-line { flex: 1; border-top: 1px solid #475569; text-align: center; padding-top: 5px; font-size: 10px; color: #475569; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>Controle de Baixa Semanal de Insumos Corretivos</h1>
          <div style="font-size: 12px; color: #64748b; font-weight: bold; margin-top: 3px;">
            ${escapeHtml(week.label)} · Nexus · Físico-Química
          </div>
        </div>
        <div>
          <span class="badge ${week.is_baixa_realizada ? 'badge-ok' : 'badge-pending'}">
            ${week.is_baixa_realizada ? 'Baixa Realizada no ERP' : 'Baixa Pendente no ERP'}
          </span>
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <h2 style="font-size: 12px; text-transform: uppercase; margin-bottom: 8px; color: #334155;">1. Resumo Total de Insumos para Baixa Manual no ERP</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px;">
          ${totalsHtml}
        </div>
      </div>

      <h2 style="font-size: 12px; text-transform: uppercase; margin-top: 20px; margin-bottom: 8px; color: #334155;">2. Relação de Lotes Corrigidos na Semana</h2>
      <table>
        <thead>
          <tr>
            <th>Lote</th>
            <th>Data</th>
            <th>Produto</th>
            <th>Agente Corretivo</th>
            <th style="text-align: right;">Dose (g/L)</th>
            <th style="text-align: right;">Tanque (kg)</th>
            <th style="text-align: right;">Consumo (kg)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="signature-box">
        <div class="sign-line">
          <strong>Responsável CQ / Laboratório</strong><br/>
          Data: ____/____/________
        </div>
        <div class="sign-line">
          <strong>Operador Almoxarifado / ERP</strong><br/>
          ${week.baixa_usuario ? `Baixado por: ${escapeHtml(week.baixa_usuario)}` : 'Data da Baixa: ____/____/________'}
        </div>
      </div>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
