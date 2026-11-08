export type Severidade = 'ok' | 'aviso' | 'critico';

export interface ChecagemSaude {
  chave: string;
  titulo: string;
  severidade: Severidade;
  quantidade: number;
}

export interface RespostaSaude {
  ultima: { executadoEm: string; resultado?: { checagens?: ChecagemSaude[] } } | null;
}

export interface InsumoFalta {
  status: 'ok' | 'depende_atrasado' | 'chega_depois' | 'chega_sem_data' | 'falta';
}

export interface ProdutoFalta {
  semFormula: boolean;
  embalagem: InsumoFalta[];
  materiaPrima: InsumoFalta[];
}

export interface LinhaFaltas {
  linha: string;
  produtos: ProdutoFalta[];
}

export interface RelatorioFaltas {
  semana: string;
  ordens: LinhaFaltas[];
}

export interface PedidoCompra {
  nRegistro: number;
  cNomeF?: string | null;
  dPrevisao?: string | null;
}

/** Sem cobertura = insumo em falta + produto sem fórmula; os demais (chega depois, sem previsão, pedido atrasado) são "outros". */
export function contarFaltas(produtos: ProdutoFalta[]): { semCobertura: number; outros: number } {
  let semCobertura = 0;
  let outros = 0;
  for (const p of produtos) {
    if (p.semFormula) semCobertura += 1;
    for (const i of [...p.embalagem, ...p.materiaPrima]) {
      if (i.status === 'falta') semCobertura += 1;
      else outros += 1;
    }
  }
  return { semCobertura, outros };
}
