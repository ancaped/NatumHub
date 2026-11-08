import React from 'react';
import * as XLSX from 'xlsx';

export interface exportarRelatorioEnvaseExcelCtx {
  relatorioConsolidadoPorProduto: { productCode: string; productDescription: string; categoriaEnvase: string; totalUn: number; totalKg: number; lotes: string[]; linhas: Set<string>; }[];
  relatorioDataFim: string;
  relatorioDataInicio: string;
  relatorioEnvaseItems: { id: string | number; loteNumber: string; productCode: string; productDescription: string; dataProgramada: string; dataProgramadaFmt: string; diaSemana: string; linha: string; ordem: number; quantity: number; quantityKg: number; categoriaEnvase: string; cor: string; statusEnvase: string; observacoes: string; origem: 'programado' | 'liberado'; }[];
  relatorioTotals: { totalCount: number; totalUn: number; totalKg: number; linha1Count: number; linha1Un: number; linha1Kg: number; linha2Count: number; linha2Un: number; linha2Kg: number; linha3Count: number; linha3Un: number; linha3Kg: number; liberadosCount: number; liberadosUn: number; liberadosKg: number; };
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export function exportarRelatorioEnvaseExcel({ relatorioConsolidadoPorProduto, relatorioDataFim, relatorioDataInicio, relatorioEnvaseItems, relatorioTotals, showToast }: exportarRelatorioEnvaseExcelCtx) {
    try {
      const wb = XLSX.utils.book_new();

      const detailedAoa = [
        [
          "Data Programada", "Dia da Semana", "Linha", "Ordem", "Lote",
          "Código SKU", "Descrição do Produto", "Qtd (Unidades)", "Peso Total (Kg)",
          "Categoria", "Cor", "Status Envase", "Observações"
        ],
        ...relatorioEnvaseItems.map(it => [
          it.dataProgramadaFmt,
          it.diaSemana,
          it.linha,
          it.ordem,
          it.loteNumber,
          it.productCode,
          it.productDescription,
          it.quantity,
          it.quantityKg,
          it.categoriaEnvase,
          it.cor,
          it.statusEnvase,
          it.observacoes
        ]),
        [],
        [
          "TOTAL:", "", "", "", `${relatorioTotals.totalCount} lotes`,
          "", "", relatorioTotals.totalUn, relatorioTotals.totalKg, "", "", "", ""
        ]
      ];
      const wsDetails = XLSX.utils.aoa_to_sheet(detailedAoa);
      XLSX.utils.book_append_sheet(wb, wsDetails, "Programacao_Envase");

      const consolidadoAoa = [
        ["Código SKU", "Descrição do Produto", "Categoria", "Total Unidades", "Peso Total (Kg)", "Lotes Associados", "Linhas"],
        ...relatorioConsolidadoPorProduto.map(c => [
          c.productCode,
          c.productDescription,
          c.categoriaEnvase,
          c.totalUn,
          c.totalKg,
          c.lotes.map(l => `#${l}`).join(', '),
          Array.from(c.linhas).join(', ')
        ]),
        [],
        [
          "TOTAL CONSOLIDADO:", "", "", relatorioTotals.totalUn, relatorioTotals.totalKg, "", ""
        ]
      ];
      const wsConsolidado = XLSX.utils.aoa_to_sheet(consolidadoAoa);
      XLSX.utils.book_append_sheet(wb, wsConsolidado, "Consolidado_Produtos");

      const filename = `Relatorio_Envase_${relatorioDataInicio}_a_${relatorioDataFim}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast("Planilha do Relatório de Envase exportada com sucesso!");
    } catch (e: any) {
      console.error("Erro ao exportar relatório em Excel:", e);
      showToast("Falha ao exportar relatório em Excel: " + (e?.message || e), "error");
    }
  }
