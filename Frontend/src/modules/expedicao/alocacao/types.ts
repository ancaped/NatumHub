export interface Estrutura {
  id: string;
  nome: string;
  descricao: string | null;
  estradoLarguraCm: number;
  estradoComprimentoCm: number;
  ordem: number;
  ativo: boolean;
}

export interface Posicao {
  id: string;
  estruturaId: string;
  codigo: string;
  coluna: string;
  colunaOrdem: number;
  nivel: number;
  andar: number;
  lado: number;
  papel: 'picking' | 'pulmao' | string;
  larguraCm: number;
  comprimentoCm: number;
  alturaCm: number;
  ativo: boolean;
  observacoes: string | null;
}

export interface Caixa {
  id: string;
  codigo: string;
  nome: string;
  alturaCm: number;
  comprimentoCm: number;
  larguraCm: number;
  empilhamentoMax: number;
  insumoErpCodigo: string | null;
  ativo: boolean;
  observacoes: string | null;
}

export interface Atacadista {
  id: string;
  nomeExibicao: string;
  termoBusca: string;
  clienteCodigo: number | null;
  ativo: boolean;
  pedidosEncontrados: number;
}

export interface AlocacaoItemView {
  id: string;
  posicaoId: string;
  posicaoCodigo: string;
  estruturaId: string;
  papel: 'picking' | 'pulmao' | string;
  andar: number;
  nivel: number;
  produtoCodigo: string;
  produtoDescricao: string;
  linhaPrefix: string;
  nomeLinha: string;
  fileirasLargura: number;
  camadasAltura: number;
  fixado: boolean;
  observacoes: string | null;
  caixaId: string | null;
  caixaCodigo: string | null;
  caixaAlturaCm: number | null;
  caixaComprimentoCm: number | null;
  caixaLarguraCm: number | null;
  caixasComprimento: number;
  maxCamadas: number;
  totalCaixas: number;
  qtdeCx: number | null;
  totalUnidades: number;
  larguraOcupadaCm: number;
  alturaOcupadaCm: number;
  alturaVaoCm: number;
  estouroAltura: boolean;
  coberturaMeses: number | null;
}

export interface PosicaoComItens extends Posicao {
  itens: AlocacaoItemView[];
  larguraOcupadaCm: number;
  larguraLivreCm: number;
  ocupacaoPct: number;
  temEstouro: boolean;
  totalCaixas: number;
  totalUnidades: number;
}

export type SituacaoAlocacao =
  | 'ok'
  | 'sem_caixa'
  | 'sem_qtde_cx'
  | 'sem_endereco'
  | 'estoque_acima_capacidade'
  | 'estouro_vao';

export interface ProdutoDimensao {
  codigo: string;
  descricao: string;
  codigoBarras: string | null;
  linhaPrefix: string;
  nomeLinha: string;
  linhaPrincipal: string | null;
  situacao: string;
  atendimento: string;
  ehKit: boolean;
  estoqueAtual: number;
  estoqueCaixas: number | null;
  qtdeCxErp: number | null;
  qtdeCxEfetiva: number | null;
  qtdeCxOrigem: 'manual' | 'erp' | 'ausente' | string;
  caixaId: string | null;
  caixaCodigo: string | null;
  caixaNome: string | null;
  caixaOrigem: 'manual' | 'erp_formula' | 'ausente' | string;
  caixaAlturaCm: number | null;
  caixaComprimentoCm: number | null;
  caixaLarguraCm: number | null;
  empilhamentoMax: number | null;
  insumoCaixaErp: string | null;
  insumoCaixaErpDesc: string | null;
  camadasOverride: number | null;
  vendasVarejo: number;
  mediaVarejo: number;
  vendasAtacado: number;
  mediaAtacado: number;
  vendasTotal: number;
  mediaTotal: number;
  percentualAbc: number;
  acumuladoAbc: number;
  curvaAbc: 'A' | 'B' | 'C' | string;
  metaMesesEfetiva: number;
  caixasNecessariasPicking: number;
  caixasNecessariasPulmao: number;
  caixasNecessariasTotal: number;
  alocacoes: AlocacaoItemView[];
  enderecosPicking: string[];
  enderecosPulmao: string[];
  totalCaixasAlocadas: number;
  totalUnidadesAlocadas: number;
  coberturaMesesAlocada: number | null;
  situacaoAlocacao: SituacaoAlocacao | string;
}

export interface InsumoCaixaErpNaoVinculado {
  ingredientCode: string;
  description: string;
  qtdProdutos: number;
  exemplosProdutos: string[];
}

export interface PainelResumo {
  totalProdutos: number;
  alocados: number;
  semEndereco: number;
  semCaixa: number;
  semQtdeCx: number;
  estoqueAcimaCapacidade: number;
  totalPosicoes: number;
  posicoesOcupadas: number;
  ocupacaoMediaPct: number;
}

export interface PainelAlocacaoResponse {
  janelaMeses: number;
  metaMeses: number;
  usarMetaLinha: boolean;
  estruturaAtivaId: string;
  estruturas: Estrutura[];
  posicoes: PosicaoComItens[];
  caixas: Caixa[];
  atacadistas: Atacadista[];
  produtos: ProdutoDimensao[];
  insumosCaixaErp: InsumoCaixaErpNaoVinculado[];
  resumo: PainelResumo;
}

export interface ClienteSugestao {
  codigo: number | null;
  nome: string;
  pedidos: number;
  unidades: number;
  jaAtacadista: boolean;
}

export interface SugestaoProposta {
  produtoCodigo: string;
  produtoDescricao: string;
  curvaAbc: string;
  linhaPrefix: string;
  posicaoId: string;
  posicaoCodigo: string;
  papel: string;
  fileirasLargura: number;
  camadasAltura: number;
  totalCaixas: number;
  totalUnidades: number;
  larguraOcupadaCm: number;
}

export interface SugestaoNaoAlocado {
  produtoCodigo: string;
  produtoDescricao: string;
  curvaAbc: string;
  motivo: string;
}

export interface SugestaoResumo {
  estruturaId: string;
  removidasCount: number;
  propostasCount: number;
  produtosAlocados: number;
  posicoesUsadas: number;
  naoAlocadosCount: number;
  ocupacaoMediaPct: number;
}

export interface SugestaoResultado {
  previa?: boolean;
  propostas: SugestaoProposta[];
  naoAlocados: SugestaoNaoAlocado[];
  resumo: SugestaoResumo;
}

export interface MoverAlocacaoInput {
  alocacaoId: string;
  destinoPosicaoId: string;
  copiar?: boolean;
  fileirasLargura?: number | null;
  camadasAltura?: number | null;
}

export interface ProdutoCaixaLoteInput {
  produtoCodigos: string[];
  caixaId?: string | null;
  limparCaixa?: boolean;
  qtdeCxManual?: number | null;
  limparQtdeCx?: boolean;
}

export interface ImportarMapaItemInput {
  posicaoCodigo: string;
  produtoCodigo: string;
  fileirasLargura: number;
  camadasAltura?: number | null;
  fixado?: boolean;
}

export interface ImportarMapaLoteResultado {
  previa?: boolean;
  estruturaId: string;
  substituirEstrutura: boolean;
  validos: number;
  ignoradosPosicao: number;
  ignoradosProduto: number;
  removidosAtuais: number;
  exemplosIgnorados: string[];
}
