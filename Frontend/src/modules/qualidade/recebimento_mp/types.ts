export interface RecebimentoErpItem {
  registro: number;
  fornecedor: string;
  nota: number;
  codigo_ref: string;
  insumo_desc: string;
  unidade: string;
  quantidade: number;
  data_entrada: string;
  lote_fornec: string;
  data_validade: string;
  codigo_receb: string;
  status_erp: string;
  usuario_erp: string;
  n_registro?: number | null;
  laudo_id?: number | string | null;
  codigo_laudo?: string | null;
  laudo_parecer?: string | null;
  classificacao?: 'MATERIA_PRIMA' | 'EMBALAGENS' | 'ROTULOS' | 'OUTROS';
}

export interface LaudoEnsaio {
  ensaio: string;
  especificacao: string;
  resultado: string;
  conforme: boolean;
}

export interface LaudoItem {
  id: number | string;
  codigo_laudo: string;
  registro_erp: number;
  codigo_receb: string;
  codigo_ref: string;
  insumo_nome: string;
  fornecedor_nome: string;
  nota_fiscal: string;
  lote_fornecedor: string;
  quantidade_total: number;
  unidade: string;
  data_entrada?: string | null;
  data_validade?: string | null;
  data_analise: string;
  responsavel_cq: string;
  parecer: 'APROVADO' | 'REPROVADO' | 'QUARENTENA';
  ensaios: LaudoEnsaio[];
  observacoes: string;
  created_at: string;
  updated_at: string;
}

export interface CreateLaudoRequest {
  registro_erp: number;
  codigo_receb: string;
  codigo_ref: string;
  insumo_nome: string;
  fornecedor_nome: string;
  nota_fiscal: string;
  lote_fornecedor: string;
  quantidade_total: number;
  unidade: string;
  data_entrada?: string | null;
  data_validade?: string | null;
  data_analise?: string | null;
  responsavel_cq: string;
  parecer: string;
  ensaios: LaudoEnsaio[];
  observacoes?: string;
  criar_amostra_retencao?: boolean;
  localizacao_amostra?: string;
  quantidade_amostra?: string;
}

export interface UpdateLaudoRequest {
  data_analise?: string | null;
  responsavel_cq: string;
  parecer: string;
  ensaios: LaudoEnsaio[];
  observacoes?: string;
}

export interface AmostraItem {
  id: number | string;
  codigo_amostra: string;
  laudo_id?: number | string | null;
  codigo_receb: string;
  insumo_nome: string;
  lote: string;
  fornecedor: string;
  data_coleta: string;
  data_validade_retencao?: string | null;
  localizacao: string;
  quantidade_amostra: string;
  status: 'RETIDA' | 'EM_ANALISE' | 'DESCARTADA';
  responsavel: string;
  observacoes: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAmostraRequest {
  laudo_id?: string | null;
  codigo_receb: string;
  insumo_nome: string;
  lote: string;
  fornecedor: string;
  data_coleta?: string;
  data_validade_retencao?: string;
  localizacao?: string;
  quantidade_amostra?: string;
  status?: string;
  responsavel?: string;
  observacoes?: string;
}

export interface UpdateAmostraRequest {
  data_validade_retencao?: string;
  localizacao: string;
  quantidade_amostra: string;
  status: string;
  responsavel: string;
  observacoes?: string;
}
