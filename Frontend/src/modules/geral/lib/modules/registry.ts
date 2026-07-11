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
  ESTOQUE_PRODUTOS: 'estoque_produtos',
  ESTOQUE_ATIVOS: 'estoque_ativos',
  PRODUCAO: 'producao',
  MONTAGEM_KITS: 'montagem_kits',
  MICROBIOLOGIA: 'microbiologia',
  FISCO_QUIMICA: 'fisco_quimica',
  COMPRAS: 'compras',
  COMPRAS_MP: 'compras_materia_prima',
  COMPRAS_EMB: 'compras_embalagens',
  COMPRAS_COLOR: 'compras_coloracao',
  COMPRAS_APOIO: 'compras_apoio',
  COMPRAS_COT: 'compras_quotations',
  COMPRAS_ONLINE: 'compras_online',
  COMPRAS_PEDIDOS: 'compras_pedidos',
  COMPRAS_NOTAS: 'compras_notas',
  VENDAS: 'vendas',
  FINANCEIRO: 'financeiro',
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
  { value: 'operador', label: 'Operador (customizado)' },
];

export function moduleRegistry(): ModuleGroup[] {
  return [
    {
      key: 'estoque',
      label: 'Estoque',
      hubView: 'estoque_hub',
      children: [
        { key: MODULE_KEYS.ESTOQUE_INSUMOS, label: 'Insumos' },
        { key: MODULE_KEYS.ESTOQUE_PRODUTOS, label: 'Produtos' },
        { key: MODULE_KEYS.ESTOQUE_ATIVOS, label: 'Linha de Produtos' },
      ],
    },
    {
      key: 'producao',
      label: 'Produção',
      hubView: 'producao_hub',
      children: [
        { key: MODULE_KEYS.PRODUCAO, label: 'Gerenciamento' },
        { key: MODULE_KEYS.MONTAGEM_KITS, label: 'Montagem de Kits' },
        { key: MODULE_KEYS.MICROBIOLOGIA, label: 'Microbiologia' },
        { key: MODULE_KEYS.FISCO_QUIMICA, label: 'Físico-Química' },
      ],
    },
    {
      key: 'compras',
      label: 'Compras',
      hubView: 'compras_hub',
      children: [
        { key: MODULE_KEYS.COMPRAS, label: 'Planejamento Geral' },
        { key: MODULE_KEYS.COMPRAS_MP, label: 'Matéria-Prima' },
        { key: MODULE_KEYS.COMPRAS_EMB, label: 'Embalagens' },
        { key: MODULE_KEYS.COMPRAS_COLOR, label: 'Coloração' },
        { key: MODULE_KEYS.COMPRAS_APOIO, label: 'Material de Apoio' },
        { key: MODULE_KEYS.COMPRAS_COT, label: 'Cotações' },
        { key: MODULE_KEYS.COMPRAS_ONLINE, label: 'Compras Online' },
        { key: MODULE_KEYS.COMPRAS_PEDIDOS, label: 'Pedidos' },
        { key: MODULE_KEYS.COMPRAS_NOTAS, label: 'Notas Fiscais' },
      ],
    },
    {
      key: 'vendas',
      label: 'Vendas',
      hubView: 'vendas',
      children: [{ key: MODULE_KEYS.VENDAS, label: 'Vendas Geral' }],
    },
    {
      key: 'financeiro',
      label: 'Financeiro',
      hubView: 'financeiro',
      children: [{ key: MODULE_KEYS.FINANCEIRO, label: 'Financeiro' }],
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
      return [MODULE_KEYS.ESTOQUE_INSUMOS, MODULE_KEYS.ESTOQUE_PRODUTOS, MODULE_KEYS.ESTOQUE_ATIVOS];
    case 'producao':
    case 'produção':
      return [MODULE_KEYS.PRODUCAO, MODULE_KEYS.MONTAGEM_KITS];
    case 'micro':
    case 'microbiologia':
      return [MODULE_KEYS.MICROBIOLOGIA];
    case 'fisco':
    case 'fisico-quimica':
    case 'físico-química':
      return [MODULE_KEYS.FISCO_QUIMICA];
    case 'compras':
      return [
        MODULE_KEYS.COMPRAS,
        MODULE_KEYS.COMPRAS_MP,
        MODULE_KEYS.COMPRAS_EMB,
        MODULE_KEYS.COMPRAS_COLOR,
        MODULE_KEYS.COMPRAS_APOIO,
        MODULE_KEYS.COMPRAS_COT,
        MODULE_KEYS.COMPRAS_ONLINE,
        MODULE_KEYS.COMPRAS_PEDIDOS,
        MODULE_KEYS.COMPRAS_NOTAS,
      ];
    case 'financeiro':
      return [MODULE_KEYS.FINANCEIRO];
    case 'vendas':
      return [MODULE_KEYS.VENDAS];
    default:
      return [];
  }
}
