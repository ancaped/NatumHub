import { unidadesDeKg, ehBaseProduto } from '../../../../lib/unitConversion';
import { printHtmlViaIframe } from '../../../../../geral/lib/printCleanup';
import { loadNatumLogoDataUrl } from '../../../../../geral/lib/logoUtils';
import type { ReatorConfig, PlanejamentoItem } from './planejamentoSemanal';
import type { DiaSemana } from '../tiposDrawers';
import type { TipoAviso } from '../../../../../geral/components/ui/Aviso';

export interface ParametrosImpressaoSemana {
  currentWeekKey: string;
  weekDays: DiaSemana[];
  plannedItems: PlanejamentoItem[];
  reatores: ReatorConfig[];
  weekStats: { totalKg: number; totalBatches: number };
  avisar: (mensagem: string, tipo?: TipoAviso) => void;
}

/**
 * Programação semanal de produção em A4 (compacto): monta o HTML e imprime pelo iframe oculto.
 * Corpo movido tal como estava no componente (a indentação dentro dos templates faz parte do HTML gerado).
 */
export async function imprimirPlanejamentoSemanal({ currentWeekKey, weekDays, plannedItems, reatores, weekStats, avisar }: ParametrosImpressaoSemana): Promise<void> {
    if (plannedItems.length === 0) {
      avisar("Nenhuma batelada agendada nesta semana para imprimir.", 'info');
      return;
    }

    const logoUrl = await loadNatumLogoDataUrl();

    // Unidades totais estimadas
    let totalEstimatedUnits = 0;
    for (const item of plannedItems) {
      const isBase = item.codigo_produto.includes('.36.') || (item.descricao || '').toUpperCase().startsWith('BASE ');
      if (!isBase) {
        totalEstimatedUnits += unidadesDeKg(item.quantidade_planejada, item.descricao, ehBaseProduto({ codigo: item.codigo_produto, descricao: item.descricao })) ?? 0;
      }
    }

    // Gera detalhamento dia a dia
    const daysHtml = weekDays.map(day => {
      const dayItems = plannedItems.filter(i => i.data_planejada === day.dateStr);
      if (dayItems.length === 0 && !day.holiday) {
        return '';
      }

      dayItems.sort((a, b) => {
        const rOrderA = reatores.find(r => r.id === a.reator_id)?.ordem ?? 99;
        const rOrderB = reatores.find(r => r.id === b.reator_id)?.ordem ?? 99;
        if (rOrderA !== rOrderB) return rOrderA - rOrderB;
        return (a.ordem_sequencia || 1) - (b.ordem_sequencia || 1);
      });

      const dayTotalKg = dayItems.reduce((acc, it) => acc + Number(it.quantidade_planejada || 0), 0);

      const itemsRows = dayItems.map(item => {
        const isBase = item.codigo_produto.includes('.36.') || (item.descricao || '').toUpperCase().startsWith('BASE ');
        const rendimento = unidadesDeKg(item.quantidade_planejada, item.descricao, ehBaseProduto({ codigo: item.codigo_produto, descricao: item.descricao }));
        const yieldText = isBase ? 'Granel' : (rendimento == null ? '—' : `${rendimento.toLocaleString('pt-BR')} un`);
        const rawLote = item.lote_erp ? String(item.lote_erp).trim() : '';
        const loteErpDisplay = (rawLote && rawLote !== '-' && rawLote !== '—') ? rawLote : '';

        return `
          <tr>
            <td style="font-family: monospace; font-weight: bold; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${item.codigo_produto}</td>
            <td style="border: 1px solid #cbd5e1; padding: 3px;">
              <strong>${item.descricao || item.codigo_produto}</strong>
              ${isBase ? '<span style="background: #e0f2fe; color: #0369a1; padding: 1px 3px; border-radius: 2px; font-size: 8px; font-weight: bold; margin-left: 3px;">BASE</span>' : ''}
            </td>
            <td style="text-align: right; font-weight: bold; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${Number(item.quantidade_planejada || 0).toLocaleString('pt-BR')} kg</td>
            <td style="text-align: right; font-weight: 600; color: #1e3a8a; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${yieldText}</td>
            <td style="text-align: center; font-family: monospace; font-size: 8.5px; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">
              ${loteErpDisplay}
            </td>
            <td style="text-align: center; border: 1px solid #cbd5e1; padding: 3px; font-size: 10px;">
              [&nbsp;&nbsp;&nbsp;&nbsp;]
            </td>
          </tr>
        `;
      }).join('');

      return `
        <div style="margin-bottom: 8px; page-break-inside: avoid;">
          <div style="background: #18181b; color: white; padding: 3px 6px; display: flex; justify-content: space-between; align-items: center; border-radius: 2px 2px 0 0; font-size: 9px;">
            <span style="font-weight: bold; text-transform: uppercase;">
              ${day.label} (${day.dayNumber}/${currentWeekKey.split('-W')[0]})
              ${day.holiday ? ` <span style="background: #f59e0b; color: #000; padding: 1px 4px; border-radius: 2px; font-size: 7.5px; margin-left: 4px;">FERIADO: ${day.holiday.name}</span>` : ''}
            </span>
            <span style="font-weight: bold;">
              ${dayItems.length} lotes | ${dayTotalKg.toLocaleString('pt-BR')} kg
            </span>
          </div>
          ${dayItems.length === 0 ? `
            <div style="padding: 4px; text-align: center; color: #94a3b8; border: 1px solid #cbd5e1; border-top: none; font-size: 8px;">
              Sem produções agendadas.
            </div>
          ` : `
            <table style="width: 100%; border-collapse: collapse; font-size: 8.5px;">
              <thead>
                <tr style="background: #f8fafc; color: #475569; font-size: 7.5px; text-transform: uppercase;">
                  <th style="width: 75px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: left;">Código</th>
                  <th style="padding: 2px 3px; border: 1px solid #cbd5e1; text-align: left;">Produto / Semi-Acabado</th>
                  <th style="width: 70px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: right;">Massa</th>
                  <th style="width: 80px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: right;">Rendimento</th>
                  <th style="width: 80px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: center;">Lote ERP</th>
                  <th style="width: 45px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: center;">Visto</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          `}
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Programação Semanal de Produção - ${currentWeekKey} - Natum Cosméticos</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 8.5px;
            color: #0f172a;
            margin: 0;
            padding: 4px;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .header-box h1 {
            font-size: 13px;
            font-weight: 800;
            margin: 0;
            color: #0f172a;
            text-transform: uppercase;
          }
          .header-box .sub {
            font-size: 9.5px;
            color: #475569;
            margin-top: 2px;
            font-weight: 600;
          }
          .header-logo {
            max-height: 46px;
            max-width: 140px;
            object-fit: contain;
          }
          .summary-bar {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 3px;
            padding: 4px 8px;
            margin-bottom: 8px;
            font-size: 8.5px;
            display: flex;
            justify-content: flex-start;
            gap: 28px;
            align-items: center;
          }
          .signature-section {
            margin-top: 14px;
            display: flex;
            justify-content: space-between;
            gap: 40px;
            page-break-inside: avoid;
          }
          .sig-box {
            flex: 1;
            border-top: 1px solid #475569;
            text-align: center;
            padding-top: 3px;
            font-size: 8px;
            color: #334155;
          }
          @media print {
            body { padding: 0; }
            button { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="header-logo" />` : ''}
            <div>
              <h1>NATUM COSMÉTICOS · PROGRAMAÇÃO SEMANAL DE PRODUÇÃO</h1>
              <div class="sub">
                PCP & Fabricação · <strong>Semana ${currentWeekKey}</strong> (${weekDays[0].label} ${weekDays[0].dateStr.split('-').slice(1).reverse().join('/')} a ${weekDays[4].label} ${weekDays[4].dateStr.split('-').slice(1).reverse().join('/')})
              </div>
            </div>
          </div>
          <div style="text-align: right; font-size: 8px; color: #64748b; white-space: nowrap;">
            Emissão: ${new Date().toLocaleString('pt-BR')}
          </div>
        </div>

        <div class="summary-bar">
          <span><strong>Volume Total:</strong> ${weekStats.totalKg.toLocaleString('pt-BR')} kg</span>
          <span><strong>Bateladas:</strong> ${weekStats.totalBatches} lotes</span>
          <span><strong>Rendimento Previsto:</strong> ~${totalEstimatedUnits.toLocaleString('pt-BR')} un</span>
        </div>

        ${daysHtml}

        <div class="signature-section">
          <div class="sig-box">
            <strong>Programador PCP</strong><br />
            Data: ____/____/________
          </div>
          <div class="sig-box">
            <strong>Supervisor de Produção / Fabricação</strong><br />
            Data: ____/____/________
          </div>
        </div>
      </body>
      </html>
    `;

    printHtmlViaIframe(html);
}
