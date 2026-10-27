// Regras da Central de Kits (situação do kit, componente limitante, componentes a produzir).
// Funções puras: a tela só desenha o que sai daqui.

export interface KitComponente {
  codigo: string;
  descricao: string;
  quantidade?: number | null;
  fator_proporcao_qtd?: number | null;
  fator_proporcao_kits?: number | null;
  estoque?: number | null;
  reservado_ordens?: number | null;
  kits_cobertos?: number | null;
  producao_recomendada?: number | null;
  produzir_apenas_kit?: number | null;
}

export interface KitResumo {
  codigo: string;
  descricao: string;
  nome_linha?: string | null;
  media_vendas?: number | null;
  producao_recomendada?: number | null;
  estoque_futuro_com_producao?: number | null;
  max_montavel_estoque?: number | null;
  componentes?: KitComponente[] | null;
}

export interface ProdutoVenda {
  media_vendas?: number | null;
  produzir_apenas_kit?: number | null;
  estoque_futuro_com_producao?: number | null;
}

export type SituacaoKit = 'montar' | 'produzir' | 'embalagem' | 'ok';

/** Embalagem/insumo comprado: código começa com "9.". */
export function ehEmbalagem(codigo: string): boolean {
  return String(codigo ?? '').startsWith('9.');
}

/** Quantos kits precisam ser montados: sugestão do servidor ou o que falta para o EFP deixar de ser negativo. */
export function necessidade(k: KitResumo): number {
  const efp = Number(k.estoque_futuro_com_producao) || 0;
  return Math.max(Number(k.producao_recomendada) || 0, efp < 0 ? -efp : 0);
}

/** Componente que menos kits cobre (o que trava a montagem). */
export function limitante(k: KitResumo): KitComponente | null {
  const cs = (k.componentes || [])
    .slice()
    .sort((a, b) => (a.kits_cobertos ?? 0) - (b.kits_cobertos ?? 0));
  return cs[0] || null;
}

export function situacao(k: KitResumo): SituacaoKit {
  if (necessidade(k) <= 0) return 'ok';
  if ((Number(k.max_montavel_estoque) || 0) > 0) return 'montar';
  const lim = limitante(k);
  if (lim && ehEmbalagem(lim.codigo)) return 'embalagem';
  return 'produzir';
}

/** Venda avulsa mensal de um produto (0 quando só existe para kit ou não vende). */
export function vendaAvulsaMensal(p: ProdutoVenda | undefined | null): number {
  if (!p || p.produzir_apenas_kit === 1) return 0;
  return Number(p.media_vendas) || 0;
}

export type StatusComponente = 'Cobre' | 'Parcial' | 'Produzir' | 'Comprar';

export function statusComponente(c: KitComponente, necessidadeKits: number): StatusComponente {
  const cobre = Number(c.kits_cobertos) || 0;
  if (cobre <= 0) return ehEmbalagem(c.codigo) ? 'Comprar' : 'Produzir';
  return cobre < necessidadeKits ? 'Parcial' : 'Cobre';
}

/** Rótulo "por kit": "1 a cada N" quando há proporção, senão a quantidade. */
export function porKitRotulo(c: KitComponente): string {
  const fk = Number(c.fator_proporcao_kits) || 0;
  if (fk > 1) return `1 a cada ${fk}`;
  return String(Number(c.quantidade) || 0);
}

/** Consumo mensal do componente pelas vendas de um kit. */
export function consumoMensalPorKit(k: KitResumo, c: KitComponente): number {
  const vendasKit = Number(k.media_vendas) || 0;
  const fq = Number(c.fator_proporcao_qtd) || 0;
  const fk = Number(c.fator_proporcao_kits) || 0;
  if (fq > 0 && fk > 0) return (vendasKit * fq) / fk;
  return vendasKit * (Number(c.quantidade) || 1);
}

export interface ComponenteAProduzir {
  codigo: string;
  descricao: string;
  nome_linha: string | null;
  kits: string[];
  demandaKits: number;
  avulso: number;
  total: number;
  meses: number | null;
  dias: number | null;
  recomendada: number;
  cobertura: number;
  efp: number | null;
}

/** Componentes de produção (fora embalagem) que travam algum kit ou têm sugestão de produção. */
export function componentesAProduzir(
  kits: KitResumo[],
  produtos: Map<string, ProdutoVenda & { [k: string]: any }>,
): ComponenteAProduzir[] {
  const mapa = new Map<string, ComponenteAProduzir>();
  for (const k of kits) {
    for (const c of k.componentes || []) {
      if (ehEmbalagem(c.codigo)) continue;
      const e = mapa.get(c.codigo) || {
        codigo: c.codigo,
        descricao: c.descricao,
        nome_linha: k.nome_linha ?? null,
        kits: [],
        demandaKits: 0,
        avulso: 0,
        total: 0,
        meses: null,
        dias: null,
        recomendada: 0,
        cobertura: Infinity,
        efp: null,
      };
      e.kits.push(k.descricao.replace(/^KIT\s+/i, '').slice(0, 28));
      e.demandaKits += consumoMensalPorKit(k, c);
      e.recomendada = Math.max(e.recomendada, Number(c.producao_recomendada) || 0);
      e.cobertura = Math.min(e.cobertura, c.kits_cobertos ?? 0);
      mapa.set(c.codigo, e);
    }
  }
  const lista: ComponenteAProduzir[] = [];
  for (const e of mapa.values()) {
    if (!(e.recomendada > 0 || e.cobertura <= 0)) continue;
    const p = produtos.get(e.codigo);
    e.avulso = vendaAvulsaMensal(p);
    e.total = e.avulso + e.demandaKits;
    e.efp = p && p.estoque_futuro_com_producao != null ? Number(p.estoque_futuro_com_producao) : null;
    e.meses = e.total > 0 && e.efp != null ? e.efp / e.total : null;
    e.dias = e.meses == null ? null : e.meses * 30;
    lista.push(e);
  }
  return lista.sort((a, b) => b.recomendada - a.recomendada);
}

/** Duração utilizável na tela: nunca devolve valor absurdo (sem venda ou fora de escala vira null). */
export function duracaoValida(meses: number | null | undefined): number | null {
  if (meses == null || !Number.isFinite(meses) || Math.abs(meses) > 999) return null;
  return meses;
}
