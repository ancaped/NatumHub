/** Registry de módulos — espelha modules_registry.rs do backend */

export interface ModuleLeaf {
  key: string;
  label: string;
}

export interface ModuleGroup {
  key: string;
  label: string;
  hubView: string;
  children: ModuleLeaf[];
}

export const MODULE_KEYS = {
  ESTOQUE_INSUMOS: 'estoque_insumos',
  /** @deprecated alias — use ESTOQUE_MP + ESTOQUE_EMB */
  ESTOQUE_PRODUTOS: 'estoque_produtos',
  ESTOQUE_MP: 'estoque_materia_prima',
  ESTOQUE_EMB: 'estoque_embalagens',
  ESTOQUE_COLOR: 'estoque_coloracao',
  ESTOQUE_APOIO: 'estoque_apoio',
  ESTOQUE_ORDENS_MANUAIS: 'estoque_ordens_manuais',
  ESTOQUE_PREVISAO_USO: 'estoque_previsao_uso',
  ESTOQUE_ITENS: 'estoque_itens',
  ESTOQUE_ALMOX: 'estoque_almoxarifado',
  ESTOQUE_SUPERMERCADO: 'estoque_supermercado',
  ESTOQUE_PECAS: 'estoque_pecas',
  ESTOQUE_EQUIPAMENTOS: 'estoque_equipamentos',
  ESTOQUE_MANUTENCOES: 'estoque_manutencoes',
  ESTOQUE_MOVIMENTACOES: 'estoque_movimentacoes',
  /** @deprecated alias — use ADMIN_LINHA_PRODUTOS */
  ESTOQUE_ATIVOS: 'estoque_ativos',
  ADMIN_LINHA_PRODUTOS: 'admin_linha_produtos',
  ADMIN_RELATORIOS: 'admin_relatorios',
  ADMIN_PRODUTOS_ATIVOS_RELATORIOS: 'admin_produtos_ativos_relatorios',
  ADMIN_FUNCIONARIOS: 'admin_funcionarios',
  PRODUCAO: 'producao',
  PRODUCAO_BASES: 'producao_bases',
  PRODUCAO_LOTES: 'producao_lotes',
  PRODUCAO_PROC: 'producao_proc',
  MONTAGEM_KITS: 'montagem_kits',
  MICROBIOLOGIA: 'microbiologia',
  FISCO_QUIMICA: 'fisco_quimica',
  /** @deprecated removido — use COMPRAS_MP / EMB / COLOR / APOIO */
  COMPRAS: 'compras',
  COMPRAS_MP: 'compras_materia_prima',
  COMPRAS_EMB: 'compras_embalagens',
  COMPRAS_COLOR: 'compras_coloracao',
  COMPRAS_APOIO: 'compras_apoio',
  COMPRAS_COT: 'compras_quotations',
  COMPRAS_ONLINE: 'compras_online',
  COMPRAS_PEDIDOS: 'compras_pedidos',
  COMPRAS_NOTAS: 'compras_notas',
  COMPRAS_ALMOX: 'compras_almoxarifado',
  COMPRAS_SIMULATION: 'compras_simulation',
  VENDAS: 'vendas',
  VENDAS_ONLINE: 'vendas_online',
  CONTROLE_QUALIDADE: 'controle_qualidade',
  QUALIDADE_POPS: 'qualidade_pops',
  QUALIDADE_TREINAMENTOS: 'qualidade_treinamentos',
  QUALIDADE_TEMPERATURA: 'qualidade_temperatura',
  QUALIDADE_LIMPEZA: 'qualidade_limpeza',
  QUALIDADE_RECEBIMENTO_MP: 'qualidade_recebimento_mp',
  QUALIDADE_DOCUMENTACAO: 'qualidade_documentacao',
  QUALIDADE_DEVOLUCOES: 'qualidade_devolucoes',
  ADMINISTRATIVO: 'administrativo',
  /** @deprecated alias — use EXPEDICAO_ECOMMERCE */
  EXPEDICAO: 'expedicao',
  EXPEDICAO_ECOMMERCE: 'expedicao_ecommerce',
  EXPEDICAO_SEPARACAO: 'expedicao_separacao',
  FINANCEIRO: 'financeiro',
  FERRAMENTAS_ETIQUETAS: 'ferramentas_etiquetas',
  FERRAMENTAS_EDITOR: 'ferramentas_editor',
  FERRAMENTAS_IMPRESSORAS: 'ferramentas_impressoras',
  CONFIGURACOES: 'hub_settings',
  OPERADORES: 'hub_operadores',
} as const;

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'estoque', label: 'Estoque' },
  { value: 'producao', label: 'Produção' },
  { value: 'micro', label: 'Microbiologia' },
  { value: 'fisco', label: 'Físico-Química' },
  { value: 'compras', label: 'Compras' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'vendas', label: 'Vendas' },
  { value: 'qualidade', label: 'Qualidade' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'expedicao', label: 'Expedição' },
  { value: 'operador', label: 'Operador (customizado)' },
];

export function moduleRegistry(): ModuleGroup[] {
  return [
    {
      key: 'estoque',
      label: 'Estoque',
      hubView: 'estoque_hub',
      children: [
        { key: MODULE_KEYS.ESTOQUE_MP, label: 'Matéria-Prima' },
        { key: MODULE_KEYS.ESTOQUE_EMB, label: 'Embalagens' },
        { key: MODULE_KEYS.ESTOQUE_COLOR, label: 'Coloração' },
        { key: MODULE_KEYS.ESTOQUE_APOIO, label: 'Material de Apoio' },
        { key: MODULE_KEYS.ESTOQUE_ORDENS_MANUAIS, label: 'Ordens Manuais' },
        { key: MODULE_KEYS.ESTOQUE_PRODUTOS, label: 'Produtos Acabados' },
      ],
    },
    {
      key: 'almoxarifado',
      label: 'Almoxarifado',
      hubView: 'almoxarifado_hub',
      children: [
        { key: MODULE_KEYS.ESTOQUE_ITENS, label: 'Itens' },
        { key: MODULE_KEYS.ESTOQUE_ALMOX, label: 'Almoxarifado' },
        { key: MODULE_KEYS.ESTOQUE_SUPERMERCADO, label: 'Supermercado' },
        { key: MODULE_KEYS.ESTOQUE_PECAS, label: 'Peças de Reposição' },
        { key: MODULE_KEYS.ESTOQUE_EQUIPAMENTOS, label: 'Equipamentos' },
        { key: MODULE_KEYS.ESTOQUE_MANUTENCOES, label: 'Manutenções' },
        { key: MODULE_KEYS.ESTOQUE_MOVIMENTACOES, label: 'Movimentações' },
      ],
    },
    {
      key: 'producao',
      label: 'Produção',
      hubView: 'producao_hub',
      children: [
        { key: MODULE_KEYS.PRODUCAO, label: 'Gerenciamento' },
        { key: MODULE_KEYS.PRODUCAO_PROC, label: 'PROC (Processos)' },
        { key: MODULE_KEYS.MONTAGEM_KITS, label: 'Kits' },
        { key: MODULE_KEYS.MICROBIOLOGIA, label: 'Microbiologia' },
        { key: MODULE_KEYS.FISCO_QUIMICA, label: 'Físico-Química' },
      ],
    },
    {
      key: 'compras',
      label: 'Compras',
      hubView: 'compras_hub',
      children: [
        { key: MODULE_KEYS.COMPRAS_MP, label: 'Matéria-Prima' },
        { key: MODULE_KEYS.COMPRAS_EMB, label: 'Embalagens' },
        { key: MODULE_KEYS.COMPRAS_COLOR, label: 'Coloração' },
        { key: MODULE_KEYS.COMPRAS_APOIO, label: 'Material de Apoio' },
        { key: MODULE_KEYS.COMPRAS_PEDIDOS, label: 'Pedidos' },
        { key: MODULE_KEYS.COMPRAS_NOTAS, label: 'Notas Fiscais' },
        { key: MODULE_KEYS.COMPRAS_SIMULATION, label: 'Simulador' },
      ],
    },
    {
      key: 'vendas',
      label: 'Vendas',
      hubView: 'vendas_hub',
      children: [
        { key: MODULE_KEYS.VENDAS, label: 'Vendas Geral' },
        { key: MODULE_KEYS.VENDAS_ONLINE, label: 'Vendas Online' },
      ],
    },
    {
      key: 'qualidade',
      label: 'Qualidade',
      hubView: 'qualidade_hub',
      children: [
        { key: MODULE_KEYS.CONTROLE_QUALIDADE, label: 'Controle de Qualidade' },
        { key: MODULE_KEYS.QUALIDADE_DEVOLUCOES, label: 'Devoluções' },
        { key: MODULE_KEYS.QUALIDADE_POPS, label: 'POPs' },
        { key: MODULE_KEYS.QUALIDADE_TREINAMENTOS, label: 'Treinamentos' },
        { key: MODULE_KEYS.QUALIDADE_TEMPERATURA, label: 'Temperatura' },
        { key: MODULE_KEYS.QUALIDADE_LIMPEZA, label: 'Limpeza' },
        { key: MODULE_KEYS.QUALIDADE_RECEBIMENTO_MP, label: 'Recebimento MP' },
        { key: MODULE_KEYS.QUALIDADE_DOCUMENTACAO, label: 'Documentação' },
      ],
    },
    {
      key: 'administrativo',
      label: 'Administrativo',
      hubView: 'administrativo',
      children: [
        { key: MODULE_KEYS.ADMIN_LINHA_PRODUTOS, label: 'Linha de Produtos' },
        { key: MODULE_KEYS.ADMIN_RELATORIOS, label: 'Relatórios' },
        { key: MODULE_KEYS.ADMIN_FUNCIONARIOS, label: 'Funcionários' },
      ],
    },
    {
      key: 'expedicao',
      label: 'Expedição',
      hubView: 'expedicao_hub',
      children: [{ key: MODULE_KEYS.EXPEDICAO_ECOMMERCE, label: 'E-commerce' }],
    },    {
      key: 'financeiro',
      label: 'Financeiro',
      hubView: 'financeiro',
      children: [{ key: MODULE_KEYS.FINANCEIRO, label: 'Financeiro' }],
    },
    {
      key: 'ferramentas',
      label: 'Ferramentas',
      hubView: 'ferramentas_hub',
      children: [
        { key: MODULE_KEYS.FERRAMENTAS_ETIQUETAS, label: 'Etiquetas' },
        { key: MODULE_KEYS.FERRAMENTAS_EDITOR, label: 'Editor de Etiquetas' },
        { key: MODULE_KEYS.FERRAMENTAS_IMPRESSORAS, label: 'Central de Impressoras' },
      ],
    },
    {
      key: 'sistema',
      label: 'Sistema',
      hubView: 'hub',
      children: [
        { key: MODULE_KEYS.CONFIGURACOES, label: 'Configurações' },
        { key: MODULE_KEYS.OPERADORES, label: 'Gestão de Operadores' },
      ],
    },
  ];
}

export function defaultModulesForRole(role: string): string[] {
  switch (role.toLowerCase()) {
    case 'admin':
      return moduleRegistry().flatMap((g) => g.children.map((c) => c.key));
    case 'estoque':
      return [
        MODULE_KEYS.ESTOQUE_MP,
        MODULE_KEYS.ESTOQUE_EMB,
        MODULE_KEYS.ESTOQUE_COLOR,
        MODULE_KEYS.ESTOQUE_APOIO,
        MODULE_KEYS.ESTOQUE_ORDENS_MANUAIS,
        MODULE_KEYS.ESTOQUE_ITENS,
        MODULE_KEYS.ESTOQUE_ALMOX,
        MODULE_KEYS.ESTOQUE_SUPERMERCADO,
        MODULE_KEYS.ESTOQUE_PECAS,
        MODULE_KEYS.ESTOQUE_MANUTENCOES,
        MODULE_KEYS.ESTOQUE_MOVIMENTACOES,
        MODULE_KEYS.ESTOQUE_PRODUTOS,
      ];
    case 'producao':
    case 'produção':
      return [
        MODULE_KEYS.PRODUCAO,
        MODULE_KEYS.PRODUCAO_LOTES,
        MODULE_KEYS.MONTAGEM_KITS,
      ];
    case 'micro':
    case 'microbiologia':
      return [MODULE_KEYS.MICROBIOLOGIA];
    case 'fisco':
    case 'fisico-quimica':
    case 'físico-química':
      return [MODULE_KEYS.FISCO_QUIMICA];
    case 'compras':
      return [
        MODULE_KEYS.COMPRAS_MP,
        MODULE_KEYS.COMPRAS_EMB,
        MODULE_KEYS.COMPRAS_COLOR,
        MODULE_KEYS.COMPRAS_APOIO,
        MODULE_KEYS.COMPRAS_COT,
        MODULE_KEYS.COMPRAS_ONLINE,
        MODULE_KEYS.COMPRAS_PEDIDOS,
        MODULE_KEYS.COMPRAS_NOTAS,
        MODULE_KEYS.COMPRAS_ALMOX,
      ];
    case 'financeiro':
      return [MODULE_KEYS.FINANCEIRO];
    case 'vendas':
      return [MODULE_KEYS.VENDAS, MODULE_KEYS.VENDAS_ONLINE];
    case 'qualidade':
      return [
        MODULE_KEYS.CONTROLE_QUALIDADE,
        MODULE_KEYS.QUALIDADE_DEVOLUCOES,
        MODULE_KEYS.QUALIDADE_POPS,
        MODULE_KEYS.QUALIDADE_TREINAMENTOS,
        MODULE_KEYS.QUALIDADE_TEMPERATURA,
        MODULE_KEYS.QUALIDADE_LIMPEZA,
        MODULE_KEYS.QUALIDADE_RECEBIMENTO_MP,
        MODULE_KEYS.QUALIDADE_DOCUMENTACAO,
      ];
    case 'administrativo':
      return [
        MODULE_KEYS.ADMIN_LINHA_PRODUTOS,
        MODULE_KEYS.ADMIN_PRODUTOS_ATIVOS_RELATORIOS,
        MODULE_KEYS.ADMIN_FUNCIONARIOS,
      ];
    case 'expedicao':
      return [MODULE_KEYS.EXPEDICAO_ECOMMERCE];
    default:
      return [];
  }
}
