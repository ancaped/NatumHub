import { apiJson } from '../../geral/lib/http';
import { rotuloLinha, type LinhaBase } from '../../geral/lib/linhas';
import type {
  ClienteSugestao,
  Estrutura,
  ImportarMapaItemInput,
  ImportarMapaLoteResultado,
  MoverAlocacaoInput,
  PainelAlocacaoResponse,
  ProdutoCaixaLoteInput,
  ProdutoDimensao,
  SugestaoResultado,
} from './types';

export function rotuloGrupoAlocacao(codigo: string, linhasConfigs: LinhaBase[]): string {
  const c = codigo.trim();
  if (c === 'coloracao') return 'Coloração';
  if (c === 'kits') return 'Todos os Kits';
  if (c.startsWith('kits:')) {
    const base = c.slice(5);
    return `Kits — ${rotuloLinha(linhasConfigs, base)}`;
  }
  return rotuloLinha(linhasConfigs, c);
}

export function produtoForaDasLinhasDaEstante(
  prod: ProdutoDimensao,
  estrutura?: Estrutura | null,
): boolean {
  const permitidas = estrutura?.linhasPermitidas ?? [];
  if (permitidas.length === 0) return false;
  if (prod.ehColoracao) {
    return !permitidas.includes('coloracao');
  }
  if (prod.ehKit) {
    return !permitidas.some((a) => a === 'kits' || a === prod.grupoAlocacao);
  }
  return !permitidas.some(
    (allowed) =>
      allowed === prod.grupoAlocacao ||
      prod.linhaPrefix === allowed ||
      prod.linhaPrincipal === allowed ||
      prod.linhaPrefix.startsWith(`${allowed}.`),
  );
}

export interface PainelParams {
  estruturaId?: string;
  janelaMeses: number;
  metaMeses: number;
  usarMetaLinha: boolean;
  incluirInativos: boolean;
}

export function fetchPainelAlocacao(params: PainelParams): Promise<PainelAlocacaoResponse> {
  const qs = new URLSearchParams();
  if (params.estruturaId) qs.set('estruturaId', params.estruturaId);
  qs.set('janelaMeses', String(params.janelaMeses));
  qs.set('metaMeses', String(params.metaMeses));
  qs.set('usarMetaLinha', String(params.usarMetaLinha));
  qs.set('incluirInativos', String(params.incluirInativos));
  return apiJson<PainelAlocacaoResponse>(`/expedicao/alocacao/painel?${qs.toString()}`);
}

export function fetchClientesSugestao(search: string, janelaMeses: number): Promise<ClienteSugestao[]> {
  const qs = new URLSearchParams();
  if (search.trim()) qs.set('search', search.trim());
  qs.set('janelaMeses', String(janelaMeses));
  return apiJson<ClienteSugestao[]>(`/expedicao/alocacao/clientes-sugestao?${qs.toString()}`);
}

export function sugerirAlocacao(
  body: {
    estruturaId: string;
    janelaMeses: number;
    metaMeses: number;
    usarMetaLinha: boolean;
    linhaPrefix?: string;
    incluirSaindoDeLinha: boolean;
    manterFixados: boolean;
    limparNaoFixados: boolean;
  },
  confirmar: boolean,
): Promise<SugestaoResultado> {
  const qs = confirmar ? '?confirmar=true' : '';
  return apiJson<SugestaoResultado>(`/expedicao/alocacao/sugerir${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function salvarVinculoProdutoCaixa(
  codigo: string,
  body: {
    caixaId: string | null;
    qtdeCxManual: number | null;
    camadasOverride: number | null;
    observacoes: string | null;
  },
  confirmar = true,
) {
  const qs = confirmar ? '?confirmar=true' : '';
  return apiJson(`/expedicao/alocacao/produtos/${encodeURIComponent(codigo)}/caixa${qs}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function salvarAlocacaoPosicao(
  body: {
    posicaoId: string;
    produtoCodigo: string;
    fileirasLargura: number;
    camadasAltura: number;
    fixado: boolean;
    observacoes: string | null;
  },
  confirmar = true,
) {
  const qs = confirmar ? '?confirmar=true' : '';
  return apiJson(`/expedicao/alocacao/alocacoes${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function atualizarPosicao(
  id: string,
  body: {
    alturaCm?: number;
    larguraCm?: number;
    comprimentoCm?: number;
    papel?: string;
    ativo?: boolean;
    observacoes?: string | null;
    aplicarAoAndar?: boolean;
  },
  confirmar = true,
) {
  const qs = confirmar ? '?confirmar=true' : '';
  return apiJson(`/expedicao/alocacao/posicoes/${encodeURIComponent(id)}${qs}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function salvarCaixa(
  id: string | null,
  body: {
    codigo: string;
    nome: string;
    alturaCm: number;
    comprimentoCm: number;
    larguraCm: number;
    empilhamentoMax: number;
    insumoErpCodigo: string | null;
    podeGirar?: boolean;
    pesoBrutoKg?: number | null;
    ativo: boolean;
    observacoes: string | null;
  },
  confirmar = true,
) {
  const qs = confirmar ? '?confirmar=true' : '';
  if (id) {
    return apiJson(`/expedicao/alocacao/caixas/${encodeURIComponent(id)}${qs}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }
  return apiJson(`/expedicao/alocacao/caixas${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function salvarAtacadista(
  id: string | null,
  body: {
    nomeExibicao: string;
    termoBusca: string;
    clienteCodigo: number | null;
    ativo: boolean;
  },
  confirmar = true,
) {
  const qs = confirmar ? '?confirmar=true' : '';
  if (id) {
    return apiJson(`/expedicao/alocacao/atacadistas/${encodeURIComponent(id)}${qs}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }
  return apiJson(`/expedicao/alocacao/atacadistas${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function salvarEstrutura(
  id: string | null,
  body: {
    nome: string;
    descricao: string | null;
    galpao?: string;
    zona?: string;
    linhasPermitidas?: string[];
    estradoLarguraCm: number;
    estradoComprimentoCm: number;
    ordem: number;
    ativo: boolean;
  },
  confirmar = true,
) {
  const qs = confirmar ? '?confirmar=true' : '';
  if (id) {
    return apiJson(`/expedicao/alocacao/estruturas/${encodeURIComponent(id)}${qs}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }
  return apiJson(`/expedicao/alocacao/estruturas${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function gerarGradeEstrutura(
  id: string,
  body: {
    colunas: string[];
    andares: Array<{ andar: number; alturaCm: number; papel: string; lados: number }>;
    larguraCm: number;
    comprimentoCm: number;
    substituirNaoFixadas: boolean;
  },
  confirmar = true,
) {
  const qs = confirmar ? '?confirmar=true' : '';
  return apiJson(`/expedicao/alocacao/estruturas/${encodeURIComponent(id)}/gerar-grade${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function moverAlocacao(body: MoverAlocacaoInput, confirmar = true) {
  const qs = confirmar ? '?confirmar=true' : '';
  return apiJson(`/expedicao/alocacao/mover${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function vincularProdutosCaixaLote(body: ProdutoCaixaLoteInput, confirmar = false) {
  const qs = confirmar ? '?confirmar=true' : '';
  return apiJson(`/expedicao/alocacao/produtos-lote${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function atualizarAbcLote(
  body: { produtoCodigos: string[]; incluirAbc: boolean | null },
  confirmar = false,
) {
  const qs = confirmar ? '?confirmar=true' : '';
  return apiJson<{
    atualizadosCount: number;
    ignoradosCount: number;
    incluirAbc: boolean | null;
  }>(`/expedicao/alocacao/abc-lote${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function importarMapaLote(
  body: {
    estruturaId: string;
    substituirEstrutura: boolean;
    itens: ImportarMapaItemInput[];
  },
  confirmar = false,
): Promise<ImportarMapaLoteResultado> {
  const qs = confirmar ? '?confirmar=true' : '';
  return apiJson<ImportarMapaLoteResultado>(`/expedicao/alocacao/importar-lote${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
