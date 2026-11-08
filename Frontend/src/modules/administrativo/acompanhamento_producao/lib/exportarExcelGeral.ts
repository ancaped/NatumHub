import React from 'react';
import * as XLSX from 'xlsx';
import { getEffectiveStatus } from './lotes';
import type { AcompanhamentoLote, TerceirizadoSolicitacao, KitAssemblyOrder } from './tipos';

export interface exportarExcelGeralCtx {
  isLoteTerceirizado: (l: AcompanhamentoLote) => boolean;
  kitOrders: KitAssemblyOrder[];
  lotes: AcompanhamentoLote[];
  showToast: (text: string, type?: 'success' | 'error') => void;
  solicitacoes: TerceirizadoSolicitacao[];
}

export function exportarExcelGeral({ isLoteTerceirizado, kitOrders, lotes, showToast, solicitacoes }: exportarExcelGeralCtx) {
    try {
      const wb = XLSX.utils.book_new();

      // 1. ABA LOTES (PRODUÇÃO INTERNA)
      const lotesInternos = lotes.filter(l => !isLoteTerceirizado(l));
      const lotesAoa = [
        [
          "Lote", "Código SKU", "Descrição do Produto", "Qtd (Unidades)", "Peso Total (Kg)",
          "Data do Lote", "Previsão Entrega", "Situação", "Status Atual", "Categoria",
          "Pesagem", "Produzido", "Liberado Envase", "Envase", "Rotulagem", "Finalizado", "Em Espera", "Motivo Espera",
          "Responsável", "Última Atualização", "Observações"
        ],
        ...lotesInternos.map(l => {
          const isConcluido = l.erpStatus === 'EA' || l.customStatus === 'Finalizada';
          return [
            l.loteNumber || "",
            l.productCode || "",
            l.productDescription || "",
            l.quantity || 0,
            l.quantityKg || 0,
            l.date ? new Date(l.date).toLocaleDateString('pt-BR') : "",
            l.dataPrevisao ? new Date(l.dataPrevisao).toLocaleDateString('pt-BR') : "",
            isConcluido ? "Concluído" : "Em Aberto",
            getEffectiveStatus(l),
            l.category || "",
            l.dataPesagem ? new Date(l.dataPesagem).toLocaleString('pt-BR') : "",
            l.dataProducao ? new Date(l.dataProducao).toLocaleString('pt-BR') : "",
            l.dataLiberadoEnvase ? new Date(l.dataLiberadoEnvase).toLocaleString('pt-BR') : "",
            l.dataEnvase ? new Date(l.dataEnvase).toLocaleString('pt-BR') : "",
            l.dataRotulagem ? new Date(l.dataRotulagem).toLocaleString('pt-BR') : "",
            l.dataFinalizada ? new Date(l.dataFinalizada).toLocaleString('pt-BR') : "",
            l.dataEmEspera ? new Date(l.dataEmEspera).toLocaleString('pt-BR') : "",
            l.motivoEspera || "",
            l.updatedBy || "",
            l.updatedAt ? new Date(l.updatedAt).toLocaleString('pt-BR') : "",
            l.notes || ""
          ];
        })
      ];
      const wsLotes = XLSX.utils.aoa_to_sheet(lotesAoa);
      XLSX.utils.book_append_sheet(wb, wsLotes, "Lotes");

      // 2. ABA TERCEIRIZADOS (LOTES TERCEIRIZADOS + SOLICITAÇÕES)
      const lotesTerceirizados = lotes.filter(l => isLoteTerceirizado(l));
      const tercAoa = [
        [
          "Origem", "Identificador / Nº Lote", "Código SKU", "Descrição do Produto",
          "Qtd (Unidades)", "Peso Total (Kg)", "Data Abertura / Criado", "Previsão Entrega",
          "Fornecedor", "Status Atual", "Aprov. Embalagem", "Aprov. Matéria-Prima",
          "Responsável / Solicitante", "Observações"
        ],
        ...lotesTerceirizados.map(l => [
          "Lote ERP",
          l.loteNumber || "",
          l.productCode || "",
          l.productDescription || "",
          l.quantity || 0,
          l.quantityKg || 0,
          l.date ? new Date(l.date).toLocaleDateString('pt-BR') : "",
          l.dataPrevisao ? new Date(l.dataPrevisao).toLocaleDateString('pt-BR') : "",
          "",
          getEffectiveStatus(l),
          "-",
          "-",
          l.updatedBy || "",
          l.notes || l.motivoEspera || ""
        ]),
        ...solicitacoes.map(s => [
          "Solicitação",
          s.loteNumber ? `${s.loteNumber} (ID #${s.id})` : `ID #${s.id}`,
          s.productCode || "",
          s.productDescription || "",
          s.quantityUn || (s.unit === 'UN' ? s.quantity : 0),
          s.quantityKg || (s.unit === 'KG' ? s.quantity : 0),
          s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : "",
          s.previsaoEntrega ? new Date(s.previsaoEntrega).toLocaleDateString('pt-BR') : (s.previsaoEntrega || ""),
          s.fornecedor || "",
          s.status || "",
          s.aprovacaoEmbalagem ? "SIM" : "NÃO",
          s.aprovacaoMateriaPrima ? "SIM" : "NÃO",
          s.solicitadoPor || "",
          s.observacoes || ""
        ])
      ];
      const wsTerc = XLSX.utils.aoa_to_sheet(tercAoa);
      XLSX.utils.book_append_sheet(wb, wsTerc, "Terceirizados");

      // 3. ABA KITS (ORDENS DE MONTAGEM DE KITS)
      const kitsAoa = [
        [
          "Nº Ordem", "Código do Kit", "Descrição do Kit", "Qtd Planejada", "Qtd Montada",
          "Status", "Data Criação", "Data Conclusão", "Montado Por", "Conferido Por",
          "ERP Lançado", "Lotes Componentes", "Observações"
        ],
        ...kitOrders.map(k => [
          k.orderNumber || "",
          k.kitProductCode || "",
          k.kitProductDescription || "",
          k.quantity || 0,
          k.quantity_assembled !== null && k.quantity_assembled !== undefined ? k.quantity_assembled : 0,
          k.status || "",
          k.created_at ? new Date(k.created_at).toLocaleDateString('pt-BR') : "",
          k.completed_at ? new Date(k.completed_at).toLocaleDateString('pt-BR') : "",
          k.assembled_by || "",
          k.checked_by || "",
          k.erp_launched ? "SIM" : "NÃO",
          k.components_lotes || "",
          k.observations || ""
        ])
      ];
      const wsKits = XLSX.utils.aoa_to_sheet(kitsAoa);
      XLSX.utils.book_append_sheet(wb, wsKits, "Kits");

      // Salvar Arquivo
      const filename = `Producao_Lotes_Terceirizados_Kits_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast("Planilha Excel exportada com sucesso (3 abas: Lotes, Terceirizados e Kits)!");
    } catch (e: any) {
      console.error("Erro ao exportar Excel:", e);
      showToast("Falha ao exportar planilha Excel.", "error");
    }
  }
