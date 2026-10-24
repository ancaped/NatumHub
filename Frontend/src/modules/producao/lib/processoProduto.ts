import { parseProductUnitWeightKg } from './unitConversion';
import type { ReatorConfig } from '../gerenciamento/components/PlanejamentoSemanalTab';

/**
 * Classificação técnica de processo: Quente (Caldeira / Água Caldeira) vs Frio (Bases / Shampoos)
 * Realiza a conversão correta de Unidades de Produto para Massa a Granel em Kg
 */
export function getProductProcessType(p: any): ReturnType<typeof inferirProcesso> {
  const r = inferirProcesso(p);
  // Regras do cadastro do produto (Regras & Parâmetros PCP). NULL = segue o automático.
  const termico = p?.processo_termico;
  const bombona = p?.permite_bombona;
  if (termico !== 'quente' && termico !== 'frio' && typeof bombona !== 'boolean') return r;
  const out = { ...r };
  if (termico === 'quente' || termico === 'frio') {
    out.isQuente = termico === 'quente';
    out.label = `${r.label} (definido no produto)`;
    out.motivo = `Processo ${termico === 'quente' ? 'a quente' : 'a frio'} (definido no produto)`;
  }
  if (typeof bombona === 'boolean') out.canBombona = bombona;
  return out;
}

function inferirProcesso(p: any): { 
  isQuente: boolean; 
  isShampoo: boolean;
  canBombona: boolean;
  motivo: string; 
  label: string; 
  recipienteSugerido: string;
  unitWeightKg: number;
  reqUnits: number;
  reqQtyKg: number;
} {
  const desc = (p.descricao || '').toUpperCase();
  const base = (p.base || '').toUpperCase();
  const code = (p.codigo || '');
  const isBaseItem = p.categoria_produto === 'cat_base' || 
                     p.status_produto === 'bases' || 
                     p.status === 'bases' ||
                     code.includes('.36.') ||
                     desc.startsWith('BASE ') || 
                     desc.startsWith('PRE BASE ');

  if (isBaseItem) {
    const isBaseShampoo = desc.includes('SH') || desc.includes('SHAMPOO') || desc.includes('LAURIL');
    const isQuente = !isBaseShampoo && (desc.includes('MASC') || desc.includes('COND') || desc.includes('CREME') || desc.includes('AOX') || desc.includes('RELAX') || desc.includes('TIOGLICOLATO'));
    const recKg = p.producao_recomendada > 0 ? p.producao_recomendada : (isBaseShampoo ? 1000 : 500);
    return {
      isQuente,
      isShampoo: isBaseShampoo,
      canBombona: recKg <= 200,
      motivo: isBaseShampoo ? 'Base de Shampoo a Frio' : (isQuente ? 'Base a Quente (Caldeira)' : 'Base de Produção'),
      label: isBaseShampoo ? 'Base Frio' : (isQuente ? 'Base Quente' : 'Base Granel'),
      recipienteSugerido: isBaseShampoo ? 'R_1000_SHAMPOO' : (recKg >= 600 ? 'R_1000_MISTO' : (recKg <= 250 ? 'R_200' : 'R_500')),
      unitWeightKg: 1.0,
      reqUnits: recKg,
      reqQtyKg: recKg
    };
  }

  const unitWeightKg = parseProductUnitWeightKg(p.descricao);
  const reqUnits = Number(p.producao_recomendada || p.estoque_ideal_manual || p.lote_minimo || 100);
  // Converte unidades de envase para massa em kg de granel:
  const reqQtyKg = Math.max(1, Math.round(reqUnits * unitWeightKg * 10) / 10);

  const isShampoo = desc.includes('SH') || desc.includes('SHAMPOO') || desc.includes('SABONETE') || desc.includes('TONICO');
  if (isShampoo) {
    return { 
      isQuente: false, 
      isShampoo: true,
      canBombona: reqQtyKg <= 200,
      motivo: 'Processo a Frio (Mistura direta)', 
      label: 'A Frio (Shampoo)',
      recipienteSugerido: reqQtyKg >= 450 ? 'R_1000_SHAMPOO' : (reqQtyKg <= 200 ? 'BOMBONAS' : 'R_500'),
      unitWeightKg,
      reqUnits,
      reqQtyKg
    };
  }

  // Pomadas, ceras, óleos especiais -> Quente
  if (desc.includes('POMADA') || desc.includes('CERA') || desc.includes('PASTA') || desc.includes('OLEO') || desc.includes('SERUM')) {
    const isR40 = reqQtyKg <= 45;
    return { 
      isQuente: true, 
      isShampoo: false,
      canBombona: reqQtyKg < 200,
      motivo: isR40 ? 'Reator 40kg Quente (Fusão de ceras/óleos)' : 'Fusão de ceras/óleos (Quente)', 
      label: isR40 ? 'Reator 40kg' : 'Caldeira',
      recipienteSugerido: isR40 ? 'R_40' : (reqQtyKg <= 100 ? 'R_100' : (reqQtyKg >= 600 ? 'R_1000_MISTO' : (reqQtyKg <= 250 ? 'R_200' : 'R_500'))),
      unitWeightKg,
      reqUnits,
      reqQtyKg
    };
  }

  // Máscaras, Cremes, Botox -> Quente (se <= 45kg vai no Reator 40kg, se < 200kg pode ir na bombona com água quente da caldeira!)
  if (desc.includes('MASC') || desc.includes('CREME') || desc.includes('DEFRIZANTE') || desc.includes('BOTOX')) {
    const isR40 = reqQtyKg <= 45;
    const podeBombona = reqQtyKg < 200;
    return { 
      isQuente: true, 
      isShampoo: false,
      canBombona: podeBombona,
      motivo: isR40 ? 'Reator 40kg (Produção Quente)' : (podeBombona ? 'Máscara Quente na Bombona (Água da Caldeira)' : 'Emulsão a Quente (Requer Caldeira)'), 
      label: isR40 ? 'Reator 40kg' : (podeBombona ? 'Bombona (Água Caldeira)' : 'Caldeira'),
      recipienteSugerido: isR40 ? 'R_40' : (podeBombona ? 'BOMBONAS' : (reqQtyKg >= 600 ? 'R_1000_MISTO' : (reqQtyKg <= 250 ? 'R_200' : 'R_500'))),
      unitWeightKg,
      reqUnits,
      reqQtyKg
    };
  }

  // Leave-in com base pronta -> A Frio na bombona
  if (desc.includes('LEAVE') && base) {
    return { 
      isQuente: false, 
      isShampoo: false,
      canBombona: true,
      motivo: 'Leave-in com base pronta (Mistura a Frio)', 
      label: 'A Frio (Base)',
      recipienteSugerido: reqQtyKg <= 200 ? 'BOMBONAS' : (reqQtyKg >= 600 ? 'R_1000_MISTO' : 'R_500'),
      unitWeightKg,
      reqUnits,
      reqQtyKg
    };
  }

  // Condicionador: se NÃO tem base pronta cadastrada no ERP, precisa fundir tensoativo catiônico -> Quente
  if (desc.includes('COND') && !base) {
    const isR40 = reqQtyKg <= 45;
    return { 
      isQuente: true, 
      isShampoo: false,
      canBombona: reqQtyKg < 200,
      motivo: isR40 ? 'Reator 40kg (Condicionador Quente)' : 'Condicionador sem base pronta (Requer Caldeira)', 
      label: isR40 ? 'Reator 40kg' : 'Caldeira',
      recipienteSugerido: isR40 ? 'R_40' : (reqQtyKg <= 150 ? 'BOMBONAS' : (reqQtyKg >= 600 ? 'R_1000_MISTO' : (reqQtyKg <= 250 ? 'R_200' : 'R_500'))),
      unitWeightKg,
      reqUnits,
      reqQtyKg
    };
  }

  // Condicionador com base pronta -> A Frio em bombona
  if (desc.includes('COND') && base) {
    return { 
      isQuente: false, 
      isShampoo: false,
      canBombona: true,
      motivo: 'Condicionador com base pronta (Mistura a Frio)', 
      label: 'A Frio (Base)',
      recipienteSugerido: reqQtyKg <= 200 ? 'BOMBONAS' : (reqQtyKg >= 600 ? 'R_1000_MISTO' : 'R_500'),
      unitWeightKg,
      reqUnits,
      reqQtyKg
    };
  }

  return { 
    isQuente: false, 
    isShampoo: false,
    canBombona: reqQtyKg <= 200,
    motivo: 'Geral', 
    label: 'Geral',
    recipienteSugerido: reqQtyKg >= 600 ? 'R_1000_MISTO' : (reqQtyKg <= 200 ? 'BOMBONAS' : 'R_200'),
    unitWeightKg,
    reqUnits,
    reqQtyKg
  };
}

export type CorTag = 'black' | 'blond' | 'neutro' | 'red';

/**
 * Identificação e Sequenciamento de Cores para corte de tempo de CIP/Limpeza de Bicos de Envase:
 * 1. Branco / Neutro -> 1º da fila (inicia com os equipamentos 100% limpos sem risco de manchar)
 * 2. Blond / Matizador -> 2º da fila (pigmentos suaves violeta / azul)
 * 3. Black / Escuro -> 3º da fila (tons escuros, carvão)
 * 4. Vermelho / Marsala -> Sempre por último (pigmento de altíssima impregnação e lavagem pesada)
 */
export function getProductColorInfo(p: any): { 
  tag: CorTag; 
  label: string; 
  shortLabel: string;
  badgeClass: string; 
  dotClass: string;
  orderPriority: number; 
} {
  const desc = ((p.descricao || '') + ' ' + (p.nome || '') + ' ' + (p.base || '')).toUpperCase();

  // 4. Vermelho/Marsala: SEMPRE POR ÚLTIMO (orderPriority = 4)
  if (desc.includes('RED') || desc.includes('MARSALA') || desc.includes('VERMELH') || desc.includes('COBRE') || desc.includes('COLOR')) {
    return { 
      tag: 'red', 
      label: 'Vermelho / Marsala (Fim da fila)', 
      shortLabel: 'Red', 
      badgeClass: 'bg-red-50 text-red-700 border border-red-200 font-mono font-bold', 
      dotClass: 'bg-rose-600',
      orderPriority: 4 
    };
  }

  // 3. Black / Tons Escuros (orderPriority = 3)
  if (desc.includes('BLACK') || desc.includes('CARVAO') || desc.includes('CARVÃO') || desc.includes('PRETO')) {
    return { 
      tag: 'black', 
      label: 'Black / Escuro (3º da Fila)', 
      shortLabel: 'Black', 
      badgeClass: 'bg-zinc-900 text-zinc-100 font-mono font-bold border border-zinc-700', 
      dotClass: 'bg-zinc-900',
      orderPriority: 3 
    };
  }

  // 2. Blond / Matizadores (Silver, Platinum, Violet) (orderPriority = 2)
  if (desc.includes('BLOND') || desc.includes('PLATINUM') || desc.includes('SILVER') || desc.includes('MATIZ') || desc.includes('VIOLET') || desc.includes('BLUE')) {
    return { 
      tag: 'blond', 
      label: 'Blond / Matizador (2º da Fila)', 
      shortLabel: 'Matizador', 
      badgeClass: 'bg-zinc-100 text-zinc-800 border border-zinc-300 font-mono font-bold', 
      dotClass: 'bg-zinc-500',
      orderPriority: 2 
    };
  }

  // 1. Neutro / Branco: SEMPRE O PRIMEIRO (orderPriority = 1)
  return { 
    tag: 'neutro', 
    label: 'Branco / Neutro (1º da Fila)', 
    shortLabel: 'Branco', 
    badgeClass: 'bg-zinc-100 text-zinc-800 font-mono font-bold border border-zinc-300', 
    dotClass: 'bg-zinc-200 border border-zinc-400',
    orderPriority: 1 
  };
}

/** Data prevista de envase: data planejada (YYYY-MM-DD, local) + N dias corridos, em dd/mm. */
export function previsaoEnvase(dataPlanejada: string, dias: number): string {
  const [y, m, d] = (dataPlanejada || '').split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d + dias);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function getShortReatorName(id: string, recipDetail?: string, reatoresList?: ReatorConfig[]): string {
  if (id === 'BOMBONAS') {
    return recipDetail && recipDetail !== 'Reator' ? recipDetail : 'Bombona';
  }
  if (id === 'R_1000_SHAMPOO' || id === 'R_1000') return 'R-1000 (Shampoo)';
  if (id === 'R_1000_MISTO') return 'R-1000 (Misto)';
  if (id === 'R_500') return 'R-500';
  if (id === 'R_200') return 'R-200';
  if (id === 'R_100') return 'R-100 (Resistência)';
  if (id === 'R_40') return 'R-40 (Quente)';
  if (reatoresList) {
    const r = reatoresList.find(x => x.id === id);
    if (r) return r.nome;
  }
  return id;
}
