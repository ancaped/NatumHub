export interface ProductSalesInfo {
  codigo: string;
  descricao: string;
  linha_prefix: string;
  nome_linha: string;
  base: string | null;
  estoque: number;
  media_vendas: number;
  status: string;
  is_lancamento: boolean;
}

export interface SalesYoYItem {
  year: number;
  totalQty: number;
  monthlyAvg: number;
}

export interface MonthlySalesItem {
  month: string;
  qty: number;
}

export interface ProductDetails {
  code: string;
  description: string;
  unit: string;
  currentStock: number;
  salesYoy: SalesYoYItem[];
  monthlySales: MonthlySalesItem[];
}

export interface SalesOrderItem {
  id: number;
  n_pedido: number;
  d_pedido: string;
  n_registro: number | null;
  c_cod_prod: string;
  n_qtde: number;
  n_qtde_fat: number;
  n_preco: number;
  c_lote: string | null;
  /** Só no detalhe do pedido. */
  descricao?: string | null;
  estoque?: number | null;
}

export interface SalesOrder {
  n_pedido: number;
  d_pedido: string;
  n_codigo: number | null;
  c_nome: string | null;
  n_valor_tot: number;
  c_status: string | null;
  n_nota_fiscal: number;
  d_previsao: string | null;
  d_entrega: string | null;
  m_observac: string | null;
  items: SalesOrderItem[];
  residual_un?: number;
  /** Regras do servidor (`aberto` = status em aberto; `atrasado` = aberto com residual e previsão vencida). */
  aberto?: boolean;
  atrasado?: boolean;
}

/** `GET /api/vendas/pedidos/resumo`. */
export interface ResumoPedidos {
  abertos: number;
  atrasados: number;
  total: number;
  residual_abertos_un: number;
}

export interface ProductFaltaItem {
  n_pedido: number;
  d_pedido: string;
  c_nome: string | null;
  c_status: string | null;
  n_qtde: number;
  n_qtde_fat: number;
  falta: number;
  d_previsao: string | null;
  n_codigo?: number | null;
}

export interface ProductFaltaGroup {
  c_cod_prod: string;
  c_nome_prod: string;
  c_nome_linha: string;
  total_falta: number;
  pedidos_afetados: ProductFaltaItem[];
  estoque: number;
  producao: number;
  transit_purchase: number;
  falta_net: number;
}

export interface PendingPurchaseOrderItem {
  n_pedido: number;
  c_nome_f: string | null;
  d_previsao: string | null;
  n_qtde: number;
  n_chegou: number;
  n_pendente: number;
}

export interface SalesCliente {
  n_codigo: number;
  c_nome: string | null;
  pedidos_total: number;
  pedidos_abertos: number;
  valor_abertos: number;
}

export type VendasTab = 'pedidos' | 'faltas' | 'clientes' | 'produtos';
