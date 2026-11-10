export interface ProductOverride {
  codigo: string;
  estoque_ideal_manual: number | null;
  pedidos_manual: number | null;
  media_manual: number | null;
  is_lancamento_manual: number | null;
  visivel: number | null;
  observacao: string | null;
  linha_prefix_manual: string | null;
  status_produto: string | null;
  categoria_produto: string | null;
  produzir_apenas_kit?: number | null;
  lancamento_meta_meses?: number | null;
  lancamento_data_inicio?: string | null;
  terceirizado_modo?: string | null;
  is_producao_programada?: number | null;
  producao_programada_disparo?: number | null;
  producao_programada_objetivo?: number | null;
}

export interface LineConfig {
  linha_prefix: string;
  nome_linha: string;
  estoque_ideal_mult: number;
  abrir_ordem_mult: number;
  abrir_prod_mult: number;
  fator_seguranca_z: number;
  visivel: number | null;
}

/** Opções do pedido de ação em lote em 2 passos (prévia no painel, grava no OK). */
export interface PedirBulkOpts {
  titulo: string;
  codigos: string[];
  action: string;
  value: string | null;
  confirmarRotulo: string;
  aoConcluir: () => void | Promise<void>;
  aoCancelar?: () => void;
}

export interface ProductResult {
  codigo: string;
  descricao: string;
  linha_prefix: string;
  nome_linha: string;
  base: string | null;
  fase: string | null;
  estoque: number;
  producao: number;
  pedidos_aberto: number;
  estoque_futuro: number;
  estoque_futuro_com_producao: number;
  status: string;
  status_label: string;
  producao_recomendada: number;
  media_vendas: number;
  is_lancamento: boolean;
  visivel: number | null;
  observacao: string | null;
  linha_prefix_manual: string | null;
  status_produto: string | null;
  categoria_produto: string | null;
  base_codigo?: string | null;
  terceirizado_modo?: string | null;
  produzir_apenas_kit?: number | null;
  is_kit?: boolean;
  is_kit_component?: boolean;
  parent_kits?: string[];
  estoque_ideal_manual?: number | null;
  estoque_ideal_qtd?: number;
  estoque_ideal_meses?: number;
}

/** Situação do produto no catálogo (L1): "descontinuado" é guardado como valor, mas aparece como Inativo. */
export const SITUACOES_UI: { value: string; label: string; description: string }[] = [
  { value: 'ativo', label: 'Ativo', description: 'Produto normal do catálogo.' },
  { value: 'lancamento', label: 'Lançamento', description: 'Em lançamento: gatilho e meta de giro próprios até graduar.' },
  { value: 'saindo_de_linha', label: 'Saindo de linha', description: 'Produção reduzida até acabar o estoque.' },
  { value: 'descontinuado', label: 'Inativo', description: 'Some das telas e do "onde é usado" dos insumos; o histórico fica guardado.' },
];

/** Atendimento: só "estoque" gera demanda automática de produção e de insumo. */
export const ATENDIMENTOS_UI: { value: string; label: string; selo: string; description: string }[] = [
  { value: 'estoque', label: 'Fabricado para estoque', selo: 'Estoque', description: 'Gera demanda de produção e de insumo.' },
  { value: 'encomenda', label: 'Por encomenda', selo: 'Por encomenda', description: 'Fabricado aqui só com pedido; sem demanda automática de produção nem de insumo.' },
  { value: 'terceirizado', label: 'Terceirizado', selo: 'Terceirizado', description: 'Fabricado por terceiro; ativo, sem demanda de insumo.' },
];

export interface AtendimentosInfo {
  linhas: Record<string, { atendimento: string; ativa: boolean }>;
  produtos: Record<string, { situacao: string; atendimento: string | null; atendimentoEfetivo: string }>;
}
