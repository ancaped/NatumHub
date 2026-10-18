export interface ModuleCatalogItem {
  key: string;
  label: string;
  group: 'Produção' | 'Compras' | 'Estoque & Almoxarifado' | 'Qualidade' | 'Administrativo' | 'Sistema & Ferramentas';
  subPages: string[];
}

export const MODULE_CATALOG: ModuleCatalogItem[] = [
  // Produção
  {
    key: 'producao',
    label: 'Produção > Gerenciamento',
    group: 'Produção',
    subPages: ['Dashboard', 'Fila de Produção', 'Produções Programadas', 'Histórico'],
  },
  {
    key: 'fisco_quimica',
    label: 'Produção > Físico-Química',
    group: 'Produção',
    subPages: ['Ensaios de Lote', 'Cadastro de Análise', 'Laudos Aprovados'],
  },
  {
    key: 'microbiologia',
    label: 'Produção > Microbiologia',
    group: 'Produção',
    subPages: ['Semeadura / Incubação', 'Leitura de Placas', 'Laudos'],
  },
  {
    key: 'producao_lotes',
    label: 'Produção > Lotes',
    group: 'Produção',
    subPages: ['Geração de Lote', 'Rastreabilidade', 'Histórico'],
  },
  {
    key: 'producao_bases',
    label: 'Produção > Gestão de Bases',
    group: 'Produção',
    subPages: ['Formulação de Base', 'Lançamento de Batelada', 'Saldos'],
  },
  {
    key: 'producao_proc',
    label: 'Produção > Processos (PROC)',
    group: 'Produção',
    subPages: ['Fluxos ANVISA', 'Etapas de Fabricação', 'Validação'],
  },
  {
    key: 'montagem_kits',
    label: 'Produção > Kits',
    group: 'Produção',
    subPages: ['Composição de Kits', 'Ordens de Montagem', 'Conferência'],
  },
  {
    key: 'planejamento_producao',
    label: 'Produção > Planejamento',
    group: 'Produção',
    subPages: ['Planejamento Semanal', 'Capacidade Fabril', 'Gatilhos'],
  },
// Compras
  {
    key: 'compras_simulation',
    label: 'Compras > Simulador MRP',
    group: 'Compras',
    subPages: ['Cálculo de Necessidades', 'Gatilhos de Estoque Mínimo', 'Projeção'],
  },
  {
    key: 'compras_materia_prima',
    label: 'Compras > Matéria-Prima',
    group: 'Compras',
    subPages: ['Reposição', 'Cotações', 'Fornecedores'],
  },
  {
    key: 'compras_pedidos',
    label: 'Compras > Pedidos',
    group: 'Compras',
    subPages: ['Pedidos Abertos', 'Aguardando Entrega', 'Histórico'],
  },
  {
    key: 'compras_notas',
    label: 'Compras > Notas Fiscais',
    group: 'Compras',
    subPages: ['Entrada XML / DANFE', 'Conferência', 'Vinculação Pedido'],
  },
  {
    key: 'compras_online',
    label: 'Compras > Compras Online',
    group: 'Compras',
    subPages: ['Mercado Livre / Amazon', 'Rastreio de Pacotes', 'Histórico'],
  },

  // Estoque & Almoxarifado
  {
    key: 'estoque_almoxarifado',
    label: 'Almoxarifado > Controle Geral',
    group: 'Estoque & Almoxarifado',
    subPages: ['Catálogo de Insumos', 'Saldos em Prateleira', 'Movimentações'],
  },
  {
    key: 'estoque_ordens_manuais',
    label: 'Estoque > Ordens Manuais',
    group: 'Estoque & Almoxarifado',
    subPages: ['Entrada Manual', 'Saída / Baixa Manual', 'Ajuste de Inventário'],
  },
  {
    key: 'estoque_equipamentos',
    label: 'Almoxarifado > Equipamentos',
    group: 'Estoque & Almoxarifado',
    subPages: ['Cadastro de Máquinas', 'Histórico de Manutenções', 'Peças'],
  },
  {
    key: 'estoque_materia_prima',
    label: 'Estoque > Matéria-Prima',
    group: 'Estoque & Almoxarifado',
    subPages: ['Consulta de Lotes', 'Localização', 'Saldos'],
  },

  // Qualidade
  {
    key: 'qualidade_pops',
    label: 'Qualidade > POPs',
    group: 'Qualidade',
    subPages: ['Procedimentos Ativos', 'Revisões Anuais', 'Upload PDF/HTML'],
  },
  {
    key: 'qualidade_documentacao',
    label: 'Qualidade > Documentação BPF',
    group: 'Qualidade',
    subPages: ['Certificados e Alvarás', 'Controle de Vencimentos', 'Auditoria'],
  },
  {
    key: 'qualidade_recebimento_mp',
    label: 'Qualidade > Recebimento MP',
    group: 'Qualidade',
    subPages: ['Conferência de Laudo', 'Amostragem', 'Liberação / Quarentena'],
  },
  {
    key: 'qualidade_devolucoes',
    label: 'Qualidade > Devoluções',
    group: 'Qualidade',
    subPages: ['Registro de RNC', 'Análise de Causa', 'Destinação'],
  },
  {
    key: 'qualidade_avarias',
    label: 'Qualidade > Avarias',
    group: 'Qualidade',
    subPages: ['Avarias de Transporte', 'Avarias Internas', 'Descarte'],
  },
  {
    key: 'controle_qualidade',
    label: 'Qualidade > Controle Geral',
    group: 'Qualidade',
    subPages: ['Inspeção de Linha', 'Checklist', 'Liberação'],
  },

  // Administrativo
  {
    key: 'admin_linha_produtos',
    label: 'Administrativo > Linha de Produtos',
    group: 'Administrativo',
    subPages: ['Produtos Ativos', 'Overrides', 'Bases e Fórmulas'],
  },
  {
    key: 'admin_acompanhamento_producao',
    label: 'Administrativo > Acompanhamento de Produção',
    group: 'Administrativo',
    subPages: ['Quadro Geral', 'Demandas Urgentes', 'Aguardando Lote ERP'],
  },
  {
    key: 'admin_funcionarios',
    label: 'Administrativo > Funcionários',
    group: 'Administrativo',
    subPages: ['Quadro de Operadores', 'Setores', 'Turnos'],
  },
  {
    key: 'admin_produtos_ativos_relatorios',
    label: 'Administrativo > Relatórios',
    group: 'Administrativo',
    subPages: ['Relatórios de Ativos', 'Estatísticas', 'Exportação'],
  },

  // Sistema & Ferramentas
  {
    key: 'desenvolvimento',
    label: 'Desenvolvimento > Central',
    group: 'Sistema & Ferramentas',
    subPages: ['Mapa Arquitetural', 'Fila de Demandas', 'Trilha de Auditoria', 'Novo Módulo'],
  },
  {
    key: 'hub_settings',
    label: 'Configurações Gerais',
    group: 'Sistema & Ferramentas',
    subPages: ['Servidor & Conexão', 'PostgreSQL & Backup', 'Sincronização ERP', 'Operadores'],
  },
  {
    key: 'ferramentas_editor',
    label: 'Ferramentas > Editor de Etiquetas',
    group: 'Sistema & Ferramentas',
    subPages: ['Layout ZPL', 'Impressão Direta', 'Modelos'],
  },
  {
    key: 'ferramentas_impressoras',
    label: 'Ferramentas > Central de Impressoras',
    group: 'Sistema & Ferramentas',
    subPages: ['Impressoras de Rede', 'Zebra / Argox', 'Status Spooler'],
  },
];

/** Resolve o item de catálogo a partir de uma view ou chave */
export function resolveCatalogItem(viewKey?: string): ModuleCatalogItem | undefined {
  if (!viewKey) return undefined;
  const k = viewKey.toLowerCase();
  return MODULE_CATALOG.find((m) => m.key.toLowerCase() === k);
}
