/**
 * Catálogo dos relatórios em A4 que o Nexus imprime. Hoje cada um tem o HTML/CSS dentro do módulo dono
 * (situação `codigo`). Quando um relatório virar modelo registrado em Relatórios, passa a `registrado`.
 * Fonte do levantamento: ai-memory `notes/ferramentas-mapa-relatorios-a4.md`.
 */
export type TipoRelatorio = 'Laudo' | 'Folha' | 'Relatório' | 'Ficha';
export type SituacaoRelatorio = 'codigo' | 'registrado';

export interface RelatorioItem {
  chave: string;
  nome: string;
  modulo: string;
  tipo: TipoRelatorio;
  /** Arquivos do módulo dono onde o relatório é montado hoje. */
  arquivos: string[];
  descricao: string;
  situacao: SituacaoRelatorio;
}

const M = 'Frontend/src/modules/';

export const RELATORIOS: RelatorioItem[] = [
  // Qualidade
  { chave: 'laudo_cq_a4', nome: 'Laudo CQ A4 (um ou em lote)', modulo: 'Qualidade', tipo: 'Laudo', arquivos: [M + 'qualidade/recebimento_mp/lib/printLaudoA4.ts'], descricao: 'Laudo de controle de qualidade do recebimento de matéria-prima, individual ou vários por página.', situacao: 'codigo' },
  { chave: 'devolucao_documentos', nome: 'Folha e relatório de devolução', modulo: 'Qualidade', tipo: 'Folha', arquivos: [M + 'qualidade/devolucoes/printHelpers.ts'], descricao: 'Folha de controle e relatórios da devolução (A4 retrato).', situacao: 'codigo' },
  { chave: 'avaria_folha_controle', nome: 'Folha de Controle — Avarias', modulo: 'Qualidade', tipo: 'Folha', arquivos: [M + 'qualidade/avarias/AvariasFolhas.tsx'], descricao: 'Lista dos itens de avaria da folha, com assinaturas de CQ, expedição e estoque.', situacao: 'codigo' },
  { chave: 'pop', nome: 'POP (procedimento operacional)', modulo: 'Qualidade', tipo: 'Ficha', arquivos: [M + 'qualidade/pops/components/PopFolhasImpressao.tsx'], descricao: 'Impressão do procedimento com cabeçalho do documento.', situacao: 'codigo' },
  { chave: 'formulario_pop', nome: 'Folha de formulário de POP', modulo: 'Qualidade', tipo: 'Folha', arquivos: [M + 'qualidade/pops/components/formularios/FormularioFolhas.tsx'], descricao: 'Formulários de registro ligados aos POPs (retrato ou paisagem).', situacao: 'codigo' },
  // Produção
  { chave: 'fisco_laudo', nome: 'Laudo de Análise Físico-Química', modulo: 'Produção', tipo: 'Laudo', arquivos: [M + 'producao/fisco_quimica/lib/fiscoUtils.ts'], descricao: 'Laudo do lote analisado, com padrão e resultado.', situacao: 'codigo' },
  { chave: 'fisco_resumo', nome: 'Relatório Resumido de Análises Físico-Químicas', modulo: 'Produção', tipo: 'Relatório', arquivos: [M + 'producao/fisco_quimica/lib/fiscoUtils.ts'], descricao: 'Resumo dos lotes em folha A4 paisagem.', situacao: 'codigo' },
  { chave: 'fisco_corretivos', nome: 'Baixa Semanal de Corretivos', modulo: 'Produção', tipo: 'Folha', arquivos: [M + 'producao/fisco_quimica/components/CorrectiveBatchesTab.tsx'], descricao: 'Baixa dos corretivos usados na semana.', situacao: 'codigo' },
  { chave: 'microbio_laudo', nome: 'Laudo Microbiológico', modulo: 'Produção', tipo: 'Laudo', arquivos: [M + 'producao/microbiologia/components/ReportTemplate.tsx'], descricao: 'Laudo de ensaios microbiológicos.', situacao: 'codigo' },
  { chave: 'saude_estoque', nome: 'Relatório de Saúde do Estoque', modulo: 'Produção', tipo: 'Relatório', arquivos: [M + 'producao/gerenciamento/components/StockHealthTab.tsx'], descricao: 'Situação de cobertura e saúde dos produtos.', situacao: 'codigo' },
  { chave: 'programacao_semanal', nome: 'Programação Semanal de Produção', modulo: 'Produção', tipo: 'Relatório', arquivos: [M + 'producao/gerenciamento/components/PlanejamentoSemanalTab.tsx'], descricao: 'Programação da semana, com folhas de Processo Frio e Processo Quente.', situacao: 'codigo' },
  { chave: 'kit_conversao', nome: 'Folha de Conversão de Produto (vira)', modulo: 'Produção', tipo: 'Folha', arquivos: [M + 'producao/montagem_kits/MontagemKitsView.tsx'], descricao: 'Folha de reetiquetagem / reenvase de produto.', situacao: 'codigo' },
  { chave: 'kit_ordem', nome: 'Ordem de montagem de kit', modulo: 'Produção', tipo: 'Folha', arquivos: [M + 'producao/lib/KitOrderPrintSheet.tsx', M + 'producao/gerenciamento/components/MontagemKitsPainel.tsx'], descricao: 'Folha da ordem de montagem com os componentes do kit.', situacao: 'codigo' },
  // Compras
  { chave: 'compras_necessidade', nome: 'Relatório de Necessidade de Compras', modulo: 'Compras', tipo: 'Relatório', arquivos: [M + 'compras/planejamento/components/DemandTable.tsx'], descricao: 'Itens a comprar pela demanda de produção.', situacao: 'codigo' },
  { chave: 'compras_disponibilidade', nome: 'Relatório de Compras / Disponibilidade', modulo: 'Compras', tipo: 'Relatório', arquivos: [M + 'compras/planejamento/components/ProdutosCompraTab.tsx'], descricao: 'Compras de produtos de apoio e coloração e disponibilidade (estoque + trânsito − pedidos).', situacao: 'codigo' },
  { chave: 'compras_relatorio', nome: 'Relatório impresso de compras', modulo: 'Compras', tipo: 'Relatório', arquivos: [M + 'compras/planejamento/relatorioCompra.ts', M + 'compras/planejamento/imprimirRelatorioCompra.ts'], descricao: 'Lista de compra pronta para enviar, com título e lote.', situacao: 'codigo' },
  { chave: 'compras_simulacao', nome: 'Simulação — ficha técnica', modulo: 'Compras', tipo: 'Ficha', arquivos: [M + 'compras/planejamento/components/SimulationTab.tsx'], descricao: 'Resultado da simulação de compras em folha A4.', situacao: 'codigo' },
  // Estoque
  { chave: 'estoque_registro_fisico', nome: 'Folha de Registro Físico / Lançamento ERP', modulo: 'Estoque', tipo: 'Folha', arquivos: [M + 'estoque/ordens_manuais/printHelpers.ts'], descricao: 'Folhas das ordens manuais de estoque, para registro físico e lançamento no ERP.', situacao: 'codigo' },
  // Administrativo
  { chave: 'admin_faltas_linha', nome: 'Faltas de insumos por linha', modulo: 'Administrativo', tipo: 'Relatório', arquivos: [M + 'administrativo/relatorios/FaltasInsumosLinhaTab.tsx'], descricao: 'Insumos em falta agrupados por linha de produto (A4 paisagem).', situacao: 'codigo' },
  // Ferramentas
  { chave: 'balanca_relatorio', nome: 'Relatório da Carga da Balança', modulo: 'Ferramentas', tipo: 'Relatório', arquivos: [M + 'ferramentas/balanca/BalancaView.tsx'], descricao: 'Itens da carga da balança (ativos, fragrâncias, inativos).', situacao: 'codigo' },
];

export const MODULOS_RELATORIOS = Array.from(new Set(RELATORIOS.map((r) => r.modulo)));
