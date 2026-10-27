/** Funções puras da sugestão automática de sequência (Planejamento Semanal). */

/**
 * Ordena reatores pelo menor em que a massa caiba (capacidade >= kg, do menor para o maior);
 * depois os que não comportam, do maior para o menor.
 */
export function ordenarReatoresPorCaber<T extends { capacidade_kg: number }>(reatores: T[], reqKg: number): T[] {
  const cabem = reatores.filter(r => r.capacidade_kg >= reqKg).sort((a, b) => a.capacidade_kg - b.capacidade_kg);
  const naoCabem = reatores.filter(r => r.capacidade_kg < reqKg).sort((a, b) => b.capacidade_kg - a.capacidade_kg);
  return [...cabem, ...naoCabem];
}

/**
 * Dias em que o produto pode entrar: nunca em dia já tomado por um exclusivo;
 * se o produto é exclusivo, só em dia sem nenhuma ordem (existente ou proposta).
 */
export function diasPermitidos<D extends { dateStr: string }>(
  dias: D[],
  exclusivo: boolean,
  diasOcupados: Set<string>,
  diasExclusivos: Set<string>,
): D[] {
  return dias.filter(d => !diasExclusivos.has(d.dateStr) && (!exclusivo || !diasOcupados.has(d.dateStr)));
}

// ---------------------------------------------------------------------------------------------
// Sugestão da semana. Decisão do Edson (2026-10-27): a capacidade do reator limita só o tamanho
// de cada batelada (ordem), nunca o total do dia; o mesmo reator pode ter várias produções por dia.
// ---------------------------------------------------------------------------------------------

export interface ReatorPlano {
  id: string;
  capacidade_kg: number;
  tipo: string;
  ordem: number;
  ativo: boolean;
}

export interface PerfilProducao {
  codigo: string;
  /** Massa total a produzir, em kg. */
  kg: number;
  isQuente: boolean;
  isShampoo: boolean;
  canBombona: boolean;
  exclusivo: boolean;
}

export type CenarioBatelada = 'shampoo' | 'r40' | 'bombona_quente' | 'bombona_frio' | 'reator';

export interface BateladaPlanejada {
  codigo: string;
  reatorId: string;
  dateStr: string;
  /** Massa da batelada em kg (nunca passa da capacidade do reator). */
  kg: number;
  recipiente: string;
  processoTermico: 'frio' | 'quente' | 'caldeira' | 'agua_caldeira' | 'resistencia';
  cenario: CenarioBatelada;
  /** 1-based; `partes` > 1 quando o produto foi dividido por passar da maior capacidade compatível. */
  parte: number;
  partes: number;
}

const ehReatorShampoo = (r: ReatorPlano) => r.tipo === 'caldeira_shampoo' || r.id === 'R_1000_SHAMPOO' || r.id === 'R_1000';
const ehBombona = (r: ReatorPlano) => r.tipo === 'bombona' || r.id === 'BOMBONAS';
const ehR40 = (r: ReatorPlano) => r.id === 'R_40';

/** Reatores compatíveis com o tipo do produto e com o porte pedido (regras de tipo: shampoo, quente pequeno, bombona, caldeira/resistência). */
export function reatoresDoPerfil<R extends ReatorPlano>(
  reatores: R[],
  p: Pick<PerfilProducao, 'kg' | 'isQuente' | 'isShampoo' | 'canBombona'>,
): { cenario: CenarioBatelada; candidatos: R[] } {
  const ativos = reatores.filter(r => r.ativo);
  if (p.isShampoo && p.kg >= 450) {
    const c = ativos.filter(ehReatorShampoo);
    if (c.length) return { cenario: 'shampoo', candidatos: c };
  }
  if (p.isQuente && p.kg <= 45) {
    const c = ativos.filter(ehR40);
    if (c.length) return { cenario: 'r40', candidatos: c };
  }
  if (p.canBombona && (p.isQuente ? p.kg < 200 : p.kg <= 200)) {
    const c = ativos.filter(ehBombona);
    if (c.length) return { cenario: p.isQuente ? 'bombona_quente' : 'bombona_frio', candidatos: c };
  }
  return {
    cenario: 'reator',
    candidatos: ativos.filter(r => !ehReatorShampoo(r) && !ehBombona(r) && !ehR40(r)),
  };
}

/** Divide a massa em partes iguais (1 casa decimal) de no máximo `capacidade` kg cada; a soma é sempre `kg`. */
export function dividirEmBateladas(kg: number, capacidade: number): number[] {
  if (!(kg > 0) || !(capacidade > 0)) return [];
  const n = Math.max(1, Math.ceil(kg / capacidade - 1e-9));
  const base = Math.floor((kg / n) * 10) / 10;
  const partes = Array.from({ length: n }, () => base);
  partes[n - 1] = Math.round((kg - base * (n - 1)) * 10) / 10;
  // sobra do arredondamento nunca pode estourar a capacidade
  if (partes[n - 1] > capacidade) {
    const resto = Math.round((partes[n - 1] - capacidade) * 10) / 10;
    partes[n - 1] = capacidade;
    partes[0] = Math.round((partes[0] + resto) * 10) / 10;
  }
  return partes;
}

function dimensionar(cenario: CenarioBatelada, reator: ReatorPlano, b: number): { kg: number; recipiente: string } {
  if (cenario === 'shampoo') return { kg: Math.min(reator.capacidade_kg, Math.max(1, Math.round(b))), recipiente: `Reator ${reator.capacidade_kg}kg` };
  if (cenario === 'r40') return { kg: Math.min(reator.capacidade_kg, Math.max(b, 20)), recipiente: 'Reator 40kg' };
  if (cenario === 'bombona_quente' || cenario === 'bombona_frio') {
    const tamanho = b <= 60 ? 50 : b <= 120 ? 100 : 200;
    return { kg: Math.min(reator.capacidade_kg, Math.max(tamanho, Math.round(b))), recipiente: `Bombona ${tamanho}kg` };
  }
  // dimensiona pela necessidade, sem superdimensionar o tanque
  return { kg: Math.min(reator.capacidade_kg, Math.max(1, Math.round(b * 10) / 10)), recipiente: `Reator ${reator.capacidade_kg}kg` };
}

function processoDe(cenario: CenarioBatelada, reator: ReatorPlano, isQuente: boolean): BateladaPlanejada['processoTermico'] {
  if (cenario === 'shampoo' || cenario === 'bombona_frio') return 'frio';
  if (cenario === 'r40') return 'quente';
  if (cenario === 'bombona_quente') return 'agua_caldeira';
  if (!isQuente) return 'frio';
  return reator.id === 'R_100' ? 'resistencia' : 'caldeira';
}

/**
 * Distribui os produtos (já em ordem de urgência) em bateladas nos dias úteis da semana.
 * Sem limite de ordens por dia em nenhum reator: cada batelada vai para o dia permitido de menor carga em kg
 * (empate: o mais cedo), então o mais urgente fica com os dias mais cedo. A divisão em bateladas só acontece
 * quando a massa passa da maior capacidade compatível. Produto sem reator compatível ou sem dia livre vai em `semLugar`.
 */
export function planejarSemana<R extends ReatorPlano, D extends { dateStr: string }>(args: {
  perfis: PerfilProducao[];
  reatores: R[];
  dias: D[];
  /** kg já planejados por dia (ordens existentes), para balancear a carga. */
  cargaKgPorDia?: Record<string, number>;
  /** Dias que já têm ordem (existente), para produto exclusivo. */
  diasOcupados?: Set<string>;
}): { bateladas: BateladaPlanejada[]; semLugar: string[]; diasCaldeira: Set<string> } {
  const carga: Record<string, number> = { ...(args.cargaKgPorDia || {}) };
  const diasOcupados = new Set<string>(args.diasOcupados || []);
  const diasExclusivos = new Set<string>();
  const diasCaldeira = new Set<string>();
  const bateladas: BateladaPlanejada[] = [];
  const semLugar: string[] = [];

  for (const perfil of args.perfis) {
    const { cenario, candidatos } = reatoresDoPerfil(args.reatores, perfil);
    const permitidos = diasPermitidos(args.dias, perfil.exclusivo, diasOcupados, diasExclusivos);
    if (candidatos.length === 0 || permitidos.length === 0 || !(perfil.kg > 0)) {
      semLugar.push(perfil.codigo);
      continue;
    }
    const maiorCap = Math.max(...candidatos.map(c => c.capacidade_kg));
    const partes = dividirEmBateladas(perfil.kg, maiorCap);
    const usados = new Set<string>();

    partes.forEach((parteKg, i) => {
      // menor reator em que a batelada caiba (empate: o de menor `ordem`)
      const reator = ordenarReatoresPorCaber(
        [...candidatos].sort((a, b) => a.ordem - b.ordem),
        parteKg,
      )[0];
      const dia = permitidos.reduce((melhor, d) => ((carga[d.dateStr] || 0) < (carga[melhor.dateStr] || 0) ? d : melhor), permitidos[0]);
      const dim = dimensionar(cenario, reator, parteKg);
      carga[dia.dateStr] = (carga[dia.dateStr] || 0) + dim.kg;
      usados.add(dia.dateStr);
      const processoTermico = processoDe(cenario, reator, perfil.isQuente);
      if (processoTermico !== 'frio') diasCaldeira.add(dia.dateStr);
      bateladas.push({
        codigo: perfil.codigo,
        reatorId: reator.id,
        dateStr: dia.dateStr,
        kg: dim.kg,
        recipiente: dim.recipiente,
        processoTermico,
        cenario,
        parte: i + 1,
        partes: partes.length,
      });
    });

    for (const d of usados) {
      diasOcupados.add(d);
      if (perfil.exclusivo) diasExclusivos.add(d);
    }
  }
  return { bateladas, semLugar, diasCaldeira };
}
