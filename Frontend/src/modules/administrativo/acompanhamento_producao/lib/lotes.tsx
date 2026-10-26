import React from 'react';
import { Calendar } from 'lucide-react';
import type { AcompanhamentoLote, StageDurationItem, LoteEtapaStatusResult, WeekRange, LoteEsperaDetails, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from './tipos';
import { parseProductUnitWeightKg as parseUnitWeightKgDaMedida } from '../../../producao/lib/unitConversion';
import { formatDateOnly, formatDurationBetween, parseLoteDateToIso } from './datas';

export function getLotePlanningOrdem(lote: AcompanhamentoLote): number {
  if (typeof lote.planningOrdem === 'number' && !isNaN(lote.planningOrdem)) {
    return lote.planningOrdem;
  }
  if (typeof (lote as any).planning_ordem === 'number' && !isNaN((lote as any).planning_ordem)) {
    return (lote as any).planning_ordem;
  }
  if (lote.details) {
    const match = lote.details.match(/\|\s*Ordem:\s*(\d+)/i) || lote.details.match(/\|\s*Seq:\s*(\d+)/i);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  return 999999;
}

export function getLoteReator(lote: { reatorId?: string | null; reator_id?: string | null; details?: string | null }): string | null {
  const direct = (lote.reatorId || lote.reator_id || '').trim();
  if (direct) return direct;
  const match = lote.details?.match(/Reator:\s*([^\s|]+)/i);
  return match?.[1] || null;
}

export function inferCategoriaEnvase(description: string): string {
  if (!description) return 'Outros';
  const upper = description.toUpperCase();
  if (upper.includes('SHAMPOO') || upper.includes('SHAMP') || upper.includes('SABONETE')) return 'Shampoo';
  if (upper.includes('MASCARA') || upper.includes('MÁSCARA') || upper.includes('CREME DE TRATAMENTO') || upper.includes('BOTOX') || upper.includes('MASC')) return 'Máscaras';
  if (upper.includes('CONDICIONADOR') || upper.includes('COND') || upper.includes('BALSAMO') || upper.includes('BÁLSAMO')) return 'Condicionador';
  if (upper.includes('OLEO') || upper.includes('ÓLEO') || upper.includes('SERUM') || upper.includes('SÉRUM') || upper.includes('ELIXIR') || upper.includes('REPARADOR')) return 'Óleos';
  if (upper.includes('AOX') || upper.includes('OXIDANTE') || upper.includes('EMULSAO OX') || upper.includes('EMULSÃO OX') || upper.includes('AGUA OX') || upper.includes('ÁGUA OX') || upper.includes('PEROXIDO') || upper.includes('PERÓXIDO') || upper.includes('VOL.') || upper.includes('10VOL') || upper.includes('20VOL') || upper.includes('30VOL') || upper.includes('40VOL')) return 'AOX';
  return 'Outros';
}

export function inferCorProduto(description: string): { isColorido: boolean; cor: string } {
  if (!description) return { isColorido: false, cor: 'Branco' };
  const upper = description.toUpperCase();

  if (upper.includes('RED') || upper.includes('VERMELH') || upper.includes('MARSALA') || upper.includes('RUBI') || upper.includes('CEREJA')) {
    return { isColorido: true, cor: 'Vermelho' };
  }
  if (upper.includes('RUIV') || upper.includes('COBRE') || upper.includes('COPPER')) {
    return { isColorido: true, cor: 'Ruivo/Cobre' };
  }
  if (upper.includes('LARANJ') || upper.includes('ORANGE')) {
    return { isColorido: true, cor: 'Laranja' };
  }
  if (upper.includes('AMAREL') || upper.includes('DOURAD') || upper.includes('GOLD') || upper.includes('YELLOW')) {
    return { isColorido: true, cor: 'Amarelo/Dourado' };
  }
  if (upper.includes('ROSA') || upper.includes('PINK')) {
    return { isColorido: true, cor: 'Rosa/Pink' };
  }
  if (upper.includes('MATIZADOR') || upper.includes('PLATIN') || upper.includes('VIOLET') || upper.includes('ROXO') || upper.includes('PURPLE') || upper.includes('SILVER') || upper.includes('CHAMPAGNE') || upper.includes('GRAFITE')) {
    return { isColorido: true, cor: 'Roxo/Violeta' };
  }
  if (upper.includes('AZUL') || upper.includes('BLUE')) {
    return { isColorido: true, cor: 'Azul' };
  }
  if (upper.includes('VERD') || upper.includes('GREEN')) {
    return { isColorido: true, cor: 'Verde' };
  }
  if (upper.includes('CASTANH') || upper.includes('MARROM') || upper.includes('BROWN') || upper.includes('CHOCOLAT')) {
    return { isColorido: true, cor: 'Castanho/Marrom' };
  }
  if (upper.includes('BLACK') || upper.includes('PRETO')) {
    return { isColorido: true, cor: 'Preto' };
  }
  if (upper.includes('COLOR') || upper.includes('TONALIZ') || upper.includes('PIGMENT')) {
    return { isColorido: true, cor: 'Vermelho' };
  }
  return { isColorido: false, cor: 'Branco' };
}

/**
 * Extrai o peso/volume unitário do produto a partir da descrição (ex: "60 ML" -> 0.06 kg, "500 G" -> 0.5 kg, "1000 ML" / "1 L" -> 1.0 kg)
 */
export function parseProductUnitWeightKg(descricao?: string, ehBase = false): number | null {
  return parseUnitWeightKgDaMedida(descricao, ehBase);
}

/** Chave React estável de uma linha de lote: lote + produto + ordem do planejamento (evita colisão em listas sem dedupe). */
export const loteRowKey = (l: { loteNumber?: string | null; productCode?: string | null; planningId?: string | null }): string =>
  `${l.loteNumber || ''}__${l.productCode || ''}__${l.planningId || ''}`;

/** Chave de fusão entre a lista do servidor e os lotes achados pela busca remota: lote + produto. */
export const loteMergeKey = (l: { loteNumber?: string | null; productCode?: string | null }): string =>
  `${(l.loteNumber || '').trim().toLowerCase()}__${(l.productCode || '').trim().toLowerCase()}`;

/**
 * Comparador estrito de número de lote.
 * 1. Prioriza correspondência exata (com ou sem # e zeros à esquerda).
 * 2. Em caso de busca parcial, casa apenas pelo início (startsWith), nunca no meio do número,
 *    evitando que digitar "2" traga números como "1025", "3200", etc.
 * 3. Ignora descrições de produtos e SKUs para evitar que volumes (ex: 250ml, 500g)
 *    tragam múltiplos produtos incorretos na pesquisa de lote.
 */
export function matchLoteStrict(loteNum: string | undefined | null, searchStr: string): boolean {
  if (!searchStr || !searchStr.trim()) return true;
  const q = searchStr.trim().toLowerCase().replace(/^#/, '').trim();
  if (!q) return true;
  const target = (loteNum || '').trim().toLowerCase().replace(/^#/, '').trim();
  const targetNoZero = target.replace(/^0+/, '');
  const qNoZero = q.replace(/^0+/, '');
  // 1. Correspondência exata
  if (target === q || (qNoZero !== '' && targetNoZero === qNoZero)) return true;
  // 2. Prefixo (começa com o lote digitado)
  return target.startsWith(q) || (qNoZero !== '' && targetNoZero.startsWith(qNoZero));
}

/**
 * Remove o prefixo textual de um número de lote digitado ("lote 123", "ordem: 45", "op 77", "nº 5", "n: 9", "#12").
 * "lote", "ordem", "nº" e "n°" saem mesmo coladas ao número; "op" e "n" só saem com espaço ou ":" / "#" depois.
 * Assim lotes cujo número começa com essas letras ("N1234", "OP-77") não são amputados.
 */
export function stripLotePrefix(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^(?:(?:lote|ordem|nº|n°)\s*[:#-]?\s*|(?:op|n)(?:\s*[:#]\s*|\s+))/i, '')
    .replace(/^#/, '')
    .trim();
}

/**
 * Normaliza strings de pesquisa de lote removendo prefixos como 'lote ', 'op ', 'ordem ', '#', etc.
 */
export function normalizeLoteSearch(raw: string): { clean: string; cleanNoZero: string; isNumeric: boolean; originalClean: string } {
  if (!raw) return { clean: '', cleanNoZero: '', isNumeric: false, originalClean: '' };
  const originalClean = raw.trim().toLowerCase();
  const clean = stripLotePrefix(raw);
  const cleanNoZero = clean.replace(/^0+/, '');
  const isNumeric = /^\d+$/.test(clean) && clean.length > 0;
  return { clean, cleanNoZero, isNumeric, originalClean };
}

/**
 * Localiza EXCLUSIVAMENTE um lote com correspondência EXATA de número de lote.
 * Nunca aciona em buscas parciais (ex: '15' ou '157').
 */
export function findExactLoteMatch<T extends { loteNumber?: string | null }>(
  items: T[],
  searchStr: string
): T | null {
  if (!searchStr || !searchStr.trim()) return null;
  const { clean, cleanNoZero, isNumeric } = normalizeLoteSearch(searchStr);
  if (!clean) return null;

  for (const item of items) {
    const target = stripLotePrefix(item.loteNumber || '');
    const targetNoZero = target.replace(/^0+/, '');
    if (target === clean || (isNumeric && cleanNoZero !== '' && targetNoZero === cleanNoZero)) {
      return item;
    }
  }
  return null;
}

/**
 * Localiza TODOS os produtos de um lote com correspondência EXATA de número de lote (preserva multi-produtos).
 */
export function findAllExactLoteMatches<T extends { loteNumber?: string | null }>(
  items: T[],
  searchStr: string
): T[] {
  if (!searchStr || !searchStr.trim()) return [];
  const { clean, cleanNoZero, isNumeric } = normalizeLoteSearch(searchStr);
  if (!clean) return [];

  const matches: T[] = [];
  for (const item of items) {
    const target = stripLotePrefix(item.loteNumber || '');
    const targetNoZero = target.replace(/^0+/, '');
    if (target === clean || (isNumeric && cleanNoZero !== '' && targetNoZero === cleanNoZero)) {
      matches.push(item);
    }
  }
  return matches;
}

/**
 * Desduplica itens garantindo que múltiplos produtos do mesmo lote (OP com mais de um produto)
 * sejam preservados com seus códigos, descrições e quantidades individuais.
 * Se houver duplicatas idênticas de lote + produto, consolida as quantidades.
 */
export function deduplicateLotesByNumber<T extends { loteNumber?: string | null; productCode?: string | null; quantity?: number; quantityKg?: number }>(
  items: T[]
): T[] {
  if (!items || items.length <= 1) return items || [];

  const map = new Map<string, T>();
  for (const item of items) {
    const rawNum = item.loteNumber;
    const rawCode = (item as any).productCode || (item as any).codigo || (item as any).item_code;

    const rawDesc = (item as any).productDescription || (item as any).descricao || '';
    const key = rawCode 
      ? `${(rawNum || '').trim().toLowerCase()}__${String(rawCode).trim().toLowerCase()}`
      : rawDesc
        ? `${(rawNum || '').trim().toLowerCase()}__${String(rawDesc).trim().toLowerCase()}`
        : (rawNum || '').trim().toLowerCase();
    if (!key || key === '__') continue;
    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key)!;
      const q1 = Number(existing.quantity) || 0;
      const q2 = Number(item.quantity) || 0;
      const kg1 = Number(existing.quantityKg) || 0;
      const kg2 = Number(item.quantityKg) || 0;
      // DEDUPLICAÇÃO: mesmo lote e produto não deve ter quantidade somada (evita dobrar)
      (existing as any).quantity = Math.max(q1, q2);
      (existing as any).quantityKg = Math.max(kg1, kg2);
    }
  }
  return Array.from(map.values());
}

/**
 * Consolida múltiplos produtos de uma mesma batelada/lote em um único card unificado
 * para Pesagem e Produção (Reatores / Caldeira), somando as quantidades de massa (kg) e unidades.
 */
export function consolidateLotesForBatch<T extends { loteNumber?: string | null; productCode?: string | null; quantity?: number; quantityKg?: number }>(
  items: T[]
): T[] {
  if (!items || items.length <= 1) return items || [];
  const map = new Map<string, T>();
  for (const item of items) {
    const rawNum = (item.loteNumber || '').trim().toLowerCase();
    if (!rawNum) continue;
    if (!map.has(rawNum)) {
      map.set(rawNum, { 
        ...item, 
        lotes: [{ ...item }] 
      } as any);
    } else {
      const existing = map.get(rawNum)!;
      (existing as any).quantity = (Number(existing.quantity) || 0) + (Number(item.quantity) || 0);
      (existing as any).quantityKg = (Number(existing.quantityKg) || 0) + (Number(item.quantityKg) || 0);
      if (!(existing as any).lotes) {
        (existing as any).lotes = [{ ...existing }];
      }
      (existing as any).lotes.push({ ...item });
    }
  }
  return Array.from(map.values());
}

/**
 * Filtro de coleção orientado a número de lote com exatidão inteligente e assertividade absoluta:
 * 1. Prioridade 1: correspondência EXATA de loteNumber. Se encontrar, retorna EXCLUSIVAMENTE esse lote.
 * 2. Prioridade 2: correspondência por início (startsWith) de loteNumber se for numérico.
 * 3. Prioridade 3: correspondência por substring no loteNumber.
 * 4. Prioridade 4: busca geral em loteNumber, productCode e productDescription.
 */
export function filterLotesBySearch<T extends { loteNumber?: string | null }>(
  items: T[],
  searchStr: string
): T[] {
  if (!searchStr || !searchStr.trim()) return items;
  const { clean, cleanNoZero, isNumeric, originalClean } = normalizeLoteSearch(searchStr);
  if (!clean && !originalClean) return items;

  // 1. Verificar correspondência exata primeiro (prioridade absoluta)
  if (clean) {
    const exact = items.filter(item => {
      const target = stripLotePrefix(item.loteNumber || '');
      const targetNoZero = target.replace(/^0+/, '');
      return target === clean || (isNumeric && cleanNoZero !== '' && targetNoZero === cleanNoZero);
    });
    if (exact.length > 0) return exact;
  }

  // 2. Se for numérico, buscar por início (startsWith) ou substring em loteNumber
  if (isNumeric && clean) {
    const startsWith = items.filter(item => {
      const target = stripLotePrefix(item.loteNumber || '');
      const targetNoZero = target.replace(/^0+/, '');
      return target.startsWith(clean) || (cleanNoZero !== '' && targetNoZero.startsWith(cleanNoZero));
    });
    if (startsWith.length > 0) return startsWith;

    const containsLote = items.filter(item => {
      const target = stripLotePrefix(item.loteNumber || '');
      return target.includes(clean);
    });
    if (containsLote.length > 0) return containsLote;
  }

  // 3. Busca geral por código ou descrição do produto ou número do lote
  return items.filter(item => {
    const lNum = (item.loteNumber || '').trim().toLowerCase().replace(/^#/, '').trim();
    const pCode = (((item as any).productCode || (item as any).codigo) || '').trim().toLowerCase();
    const pDesc = (((item as any).productDescription || (item as any).descricao) || '').trim().toLowerCase();
    return (
      (clean && lNum.includes(clean)) ||
      lNum.includes(originalClean) ||
      pCode.includes(originalClean) ||
      pDesc.includes(originalClean)
    );
  });
}

/**
 * Localiza de forma assertiva um lote a partir da busca (prioriza correspondência exata)
 */
export function findLoteBySearch<T extends { loteNumber?: string | null }>(
  items: T[],
  searchStr: string
): T | null {
  const exact = findExactLoteMatch(items, searchStr);
  if (exact) return exact;
  const filtered = filterLotesBySearch(items, searchStr);
  return filtered.length > 0 ? filtered[0] : null;
}

export function parseUnitWeightFromDescription(desc: string): number | null {
  if (!desc) return null;
  const upper = desc.toUpperCase();

  // 1) Litros
  const matchL = upper.match(/(\d+(?:[.,]\d+)?)\s*(?:L|LT|LTS|LITRO|LITROS)\b/);
  if (matchL) {
    const val = parseFloat(matchL[1].replace(',', '.'));
    if (val > 0) return val;
  }

  // 2) Quilos
  const matchKg = upper.match(/(\d+(?:[.,]\d+)?)\s*(?:KG|KGS|QUILO|QUILOS|K)\b/);
  if (matchKg) {
    const val = parseFloat(matchKg[1].replace(',', '.'));
    if (val > 0) return val;
  }

  // 3) Mililitros
  const matchMl = upper.match(/(\d+(?:[.,]\d+)?)\s*(?:ML)\b/);
  if (matchMl) {
    const val = parseFloat(matchMl[1].replace(',', '.'));
    if (val > 0) return val / 1000;
  }

  // 4) Gramas
  const matchG = upper.match(/(\d+(?:[.,]\d+)?)\s*(?:G|GR|GRS|GRAMA|GRAMAS)\b/);
  if (matchG) {
    const val = parseFloat(matchG[1].replace(',', '.'));
    if (val > 0) return val / 1000;
  }

  return null;
}

export function calculateStageDurations(lote: AcompanhamentoLote): {
  stages: StageDurationItem[];
  totalDuration: string;
  totalIsCompleted: boolean;
} {
  const nowIso = new Date().toISOString();
  const eff = getEffectiveStatus(lote);
  const isFinal = eff === 'Finalizada' || lote.erpStatus === 'EA';

  const pStart = lote.dataPesagem || lote.date;
  const pEnd = lote.dataProducao || lote.dataLiberadoEnvase || lote.dataEnvase || lote.dataRotulagem || lote.dataFinalizada;
  const pActive = eff === 'Pesagem';
  const pCompleted = !!pEnd;

  const prodStart = lote.dataProducao;
  const prodEnd = lote.dataLiberadoEnvase || lote.dataEnvase || lote.dataRotulagem || lote.dataFinalizada;
  const prodActive = eff === 'Produzido' || eff === 'Produção' || eff === 'Liberado para Envase';
  const prodCompleted = !!prodEnd;

  const envStart = lote.dataEnvase;
  const envEnd = lote.dataRotulagem || lote.dataFinalizada;
  const envActive = eff === 'Envase';
  const envCompleted = !!envEnd;

  const rotStart = lote.dataRotulagem;
  const rotEnd = lote.dataFinalizada;
  const rotActive = eff === 'Rotulagem';
  const rotCompleted = !!rotEnd;

  const stages: StageDurationItem[] = [
    {
      stage: 'pesagem',
      label: 'Pesagem',
      startDate: pStart,
      endDate: pEnd,
      durationFormatted: pStart ? formatDurationBetween(pStart, pEnd || (pActive ? nowIso : null)) : 'Não iniciada',
      isActive: pActive,
      isCompleted: pCompleted,
    },
    {
      stage: 'producao',
      label: 'Produzido',
      startDate: prodStart,
      endDate: prodEnd,
      durationFormatted: prodStart ? formatDurationBetween(prodStart, prodEnd || (prodActive ? nowIso : null)) : 'Não iniciada',
      isActive: prodActive,
      isCompleted: prodCompleted,
    },
    {
      stage: 'envase',
      label: 'Envase',
      startDate: envStart,
      endDate: envEnd,
      durationFormatted: envStart ? formatDurationBetween(envStart, envEnd || (envActive ? nowIso : null)) : 'Não iniciada',
      isActive: envActive,
      isCompleted: envCompleted,
    },
    {
      stage: 'rotulagem',
      label: 'Rotulagem',
      startDate: rotStart,
      endDate: rotEnd,
      durationFormatted: rotStart ? formatDurationBetween(rotStart, rotEnd || (rotActive ? nowIso : null)) : 'Não iniciada',
      isActive: rotActive,
      isCompleted: rotCompleted,
    },
  ];

  const firstStart = pStart || prodStart || envStart || rotStart;
  const totalEnd = lote.dataFinalizada || (isFinal ? lote.updatedAt : null);
  const totalDuration = firstStart ? formatDurationBetween(firstStart, totalEnd || nowIso) : '—';

  return {
    stages,
    totalDuration,
    totalIsCompleted: isFinal,
  };
}

export function renderCardTimelineDates(
  lote: AcompanhamentoLote | null | undefined,
  _etapa: 'pesagem_ativa' | 'pesagem_espera' | 'pesagem_fila' | 'reatores' | 'caldeira' | 'producao_fila' | 'envase_linha' | 'envase_fila' | 'rotulagem' | 'ordens',
  _onEditTimestamps?: (lote: AcompanhamentoLote) => void
) {
  if (!lote) return null;
  const dataAbertura = lote.date ? formatDateOnly(lote.date) : null;
  if (!dataAbertura) return null;

  return (
    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono py-0.5 border-t border-zinc-100/70">
      <span className="flex items-center gap-1 text-zinc-400">
        <Calendar className="h-3 w-3 shrink-0 text-zinc-400" />
        <span>Abertura:</span>
      </span>
      <span className="font-semibold text-zinc-700">{dataAbertura}</span>
    </div>
  );
}

export function getEffectiveStatus(lote: AcompanhamentoLote): string {
  const qtdParcial = Number(lote.quantidadeEnvasadaParcial || (lote as any).quantidade_envasada_parcial) || 0;
  const isParcial = lote.customStatus === 'Ordem Parcial' || qtdParcial > 0;

  // Se o lote constar como EA no ERP e não for parcial, o status efetivo é Ordem Finalizada
  if (lote.erpStatus === 'EA' && !isParcial) {
    return 'Ordem Finalizada';
  }

  if (lote.customStatus) {
    if (lote.customStatus === 'Produção') return 'Produzido';
    if (lote.customStatus === 'Finalizada') return 'Ordem Finalizada';
    if (lote.customStatus === 'Fila Pesagem') return 'Pesagem';
    if (lote.customStatus === 'Liberado Pesagem') return 'Pesagem';
    return lote.customStatus;
  }
  switch ((lote.erpStatus || '').toUpperCase()) {
    case 'PG': return 'Pesagem';
    case 'PP':
    case 'PR': return 'Produzido';
    case 'EN': return 'Envase';
    case 'CF': return 'Conferido';
    case 'EA': return 'Ordem Finalizada';
    default: return 'Aberto';
  }
}

/**
 * Regra Geral Canônica: Ordem Concluída / Finalizada.
 * Quando concluída, pertence EXCLUSIVAMENTE ao Quadro de Ordens (Ordens Finalizadas)
 * e NÃO pode mais aparecer em nenhum outro quadro operacional (Pesagem, Produção, Caldeira, Envase, Rotulagem).
 */
export function isLoteConcluido(l: AcompanhamentoLote | null | undefined): boolean {
  if (!l) return false;
  // 1. Se o chão de fábrica marcou explicitamente como Finalizada / Ordem Finalizada -> Concluído
  if (l.customStatus === 'Ordem Finalizada' || l.customStatus === 'Finalizada') return true;

  // 2. Se explicitamente marcado como Ordem Parcial -> NÃO está concluído (mantém como ordem pausada)
  if (l.customStatus === 'Ordem Parcial') return false;

  // 3. Se possui apontamento parcial e não foi explicitamente finalizado pelo chão de fábrica -> NÃO está concluído
  const qtdParcial = Number(l.quantidadeEnvasadaParcial || (l as any).quantidade_envasada_parcial) || 0;
  if (qtdParcial > 0) return false;

  // Se o lote é oriundo do Planejamento Semanal ativo, não pode ser fechado prematuramente por ERP status EA legado
  if (l.details?.includes('Planejamento Semanal')) return false;

  // 4. Se o lote constar como EA no ERP, fecha automaticamente (exceto se for parcial)
  if (l.erpStatus === 'EA') return true;

  const eff = getEffectiveStatus(l);
  return eff === 'Ordem Finalizada' || eff === 'Finalizada';
}

/**
 * Regra Geral Canônica: Ordem Parcial.
 * Lotes com apontamento parcial DEVEM continuar visíveis em Rotulagem e Produção (além de Envase e Ordens Parciais)
 * até que sejam integralmente finalizados pelo chão de fábrica.
 */
export function isLoteParcial(l: AcompanhamentoLote | null | undefined): boolean {
  if (!l) return false;
  if (isLoteConcluido(l)) return false;
  const qtdParcial = Number(l.quantidadeEnvasadaParcial || (l as any).quantidade_envasada_parcial) || 0;
  return l.customStatus === 'Ordem Parcial' || qtdParcial > 0;
}

/**
 * Verifica se um lote foi explicitamente ocultado/removido de um quadro operacional específico
 * (Pesagem, Produção, Envase ou Rotulagem).
 * Lotes ocultos NUNCA são ocultados do Quadro de Ordens (permanência de auditoria geral).
 */
export function isLoteOcultoNoQuadro(
  l: AcompanhamentoLote | null | undefined,
  quadro: 'pesagem' | 'producao' | 'rotulagem' | 'envase'
): boolean {
  if (!l) return false;
  const raw = l.quadrosOcultos || (l as any).quadros_ocultos;
  if (!raw) return false;
  if (Array.isArray(raw)) {
    return raw.some((q: any) => typeof q === 'string' && q.trim().toLowerCase() === quadro.toLowerCase());
  }
  return false;
}

/**
 * Retorna o status isolado da etapa (Pesagem, Produção, Rotulagem ou Envase).
 * Garante que uma pausa ou conclusão em uma etapa NUNCA contamine os outros quadros.
 */
export function getLoteEtapaStatus(
  l: AcompanhamentoLote | null | undefined,
  etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase'
): LoteEtapaStatusResult {
  if (!l) {
    return {
      status: 'pendente',
      isEspera: false,
      isConcluido: false,
      motivoEspera: null,
      insumoFaltanteCodigo: null,
      insumoFaltanteDescricao: null,
    };
  }

  // 1. Consulta estrutura específica de etapas gravada no lote (backend Postgres / JSONB)
  const rawEtapas = l.etapasStatus || (l as any).etapas_status;
  const etapaEntry = rawEtapas?.[etapa];
  const schedDate = getLoteScheduleDateIso(l, etapa);
  // A conclusão automática (data agendada passou / hoje depois das 18h) vem calculada do servidor; o relógio do
  // navegador só vale como fallback quando o campo não veio.
  const efetivaServidor = l.etapasEfetivas?.[etapa];
  const autoOk = efetivaServidor
    ? efetivaServidor.isConcluido
    : Boolean(schedDate && isPastEndOfDay(schedDate) && l.erpStatus !== 'CA');

  if (etapaEntry) {
    const isEspera = etapaEntry.status === 'Em Espera' || Boolean(etapaEntry.motivoEspera);
    const isExplicitConcluido = etapaEntry.status === 'concluido' || etapaEntry.status === 'Concluído';
    const isConcluido = isExplicitConcluido || (!isEspera && autoOk);
    return {
      status: etapaEntry.status || (isConcluido ? 'concluido' : isEspera ? 'Em Espera' : 'ativo'),
      isEspera,
      isConcluido,
      motivoEspera: isEspera ? (etapaEntry.motivoEspera || null) : null,
      insumoFaltanteCodigo: isEspera ? (etapaEntry.insumoFaltanteCodigo || null) : null,
      insumoFaltanteDescricao: isEspera ? (etapaEntry.insumoFaltanteDescricao || null) : null,
      updatedBy: etapaEntry.updatedBy || null,
      updatedAt: etapaEntry.updatedAt || null,
    };
  }

  // 2. Fallback de dados legados: APENAS atribui isEspera se o lote estiver em pausa e seu contexto pertencia a ESTA etapa
  const eff = getEffectiveStatus(l);
  const rawEspera = eff === 'Em Espera' || l.customStatus === 'Em Espera' || Boolean(l.motivoEspera);

  let isEsperaLegado = false;
  if (rawEspera) {
    if (etapa === 'pesagem') {
      isEsperaLegado = l.customStatus === 'Pesagem' || (!l.dataProducao && !l.dataLiberadoEnvase && !l.dataEnvase && !l.dataRotulagem);
    } else if (etapa === 'producao') {
      isEsperaLegado = (l.customStatus === 'Produção' || l.customStatus === 'Produzido' || l.customStatus === 'Caldeira') && !l.dataLiberadoEnvase && !l.dataEnvase;
    } else if (etapa === 'rotulagem') {
      isEsperaLegado = l.customStatus === 'Rotulagem';
    } else if (etapa === 'envase') {
      isEsperaLegado = l.customStatus === 'Envase' || l.customStatus === 'Ordem Parcial';
    }
  }

  const isConcluido = !isEsperaLegado && autoOk;

  return {
    status: isEsperaLegado ? 'Em Espera' : (isConcluido ? 'concluido' : 'pendente'),
    isEspera: isEsperaLegado,
    isConcluido,
    motivoEspera: isEsperaLegado ? (l.motivoEspera || null) : null,
    insumoFaltanteCodigo: isEsperaLegado ? (l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo || null) : null,
    insumoFaltanteDescricao: isEsperaLegado ? (l.insumoFaltanteDescricao || (l as any).insumo_faltante_descricao || null) : null,
  };
}

export function getEffectivePrevisao(dateAbertura?: string | null, dataPrevisao?: string | null): string | null {
  if (dataPrevisao && dataPrevisao.trim()) {
    return dataPrevisao.split('T')[0];
  }
  if (!dateAbertura || !dateAbertura.trim()) return null;
  try {
    let baseDate: Date | null = null;
    const clean = dateAbertura.trim().split('T')[0].split(' ')[0];
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3) {
        baseDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
    } else if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        baseDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      }
    }
    if (baseDate && !isNaN(baseDate.getTime())) {
      baseDate.setDate(baseDate.getDate() + 15);
      const y = baseDate.getFullYear();
      const m = String(baseDate.getMonth() + 1).padStart(2, '0');
      const d = String(baseDate.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch (e) {
    console.error("Erro calculando previsao padrao de 15 dias:", e);
  }
  return null;
}

export function isPastEndOfDay(scheduleDateIso?: string | null): boolean {
  if (!scheduleDateIso) return false;
  try {
    const now = new Date();
    const currentIsoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const cleanScheduleDate = scheduleDateIso.split('T')[0];
    
    if (cleanScheduleDate < currentIsoDate) {
      return true;
    }
    if (cleanScheduleDate === currentIsoDate && now.getHours() >= 18) {
      return true;
    }
  } catch {}
  return false;
}

export function getLoteScheduleDateIso(
  lote: AcompanhamentoLote,
  etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens'
): string | null {
  // 1. Se for ordens e possui data de finalização, a data de conclusão tem prioridade para histórico
  if (etapa === 'ordens' && lote.dataFinalizada) {
    const iso = parseLoteDateToIso(lote.dataFinalizada);
    if (iso) return iso;
  }

  // 2. Data gravada de execução da etapa específica (prioridade máxima para permitir datas independentes por etapa)
  if (etapa === 'pesagem' && lote.dataPesagem) {
    const iso = parseLoteDateToIso(lote.dataPesagem);
    if (iso) return iso;
  }
  if (etapa === 'producao' && lote.dataProducao) {
    const iso = parseLoteDateToIso(lote.dataProducao);
    if (iso) return iso;
  }
  if (etapa === 'rotulagem' && lote.dataRotulagem) {
    const iso = parseLoteDateToIso(lote.dataRotulagem);
    if (iso) return iso;
  }
  if (etapa === 'envase' && lote.dataEnvase) {
    const iso = parseLoteDateToIso(lote.dataEnvase);
    if (iso) return iso;
  }

  // 3. Fallback: se for pesagem e não tiver dataPesagem, mas tiver dataProducao
  if (etapa === 'pesagem' && lote.dataProducao) {
    const iso = parseLoteDateToIso(lote.dataProducao);
    if (iso) return iso;
  }

  // 4. Data de Previsão explícita
  if (lote.dataPrevisao && lote.dataPrevisao.trim()) {
    const iso = parseLoteDateToIso(lote.dataPrevisao);
    if (iso) return iso;
  }

  // 5. Se for lote do Planejamento Semanal com lote.date definido
  if (lote.details?.includes('Planejamento Semanal') && lote.date) {
    const iso = parseLoteDateToIso(lote.date);
    if (iso) return iso;
  }

  // 6. Data de abertura da OP / Lote no ERP
  if (lote.date) {
    const iso = parseLoteDateToIso(lote.date);
    if (iso) return iso;
  }

  return null;
}

export function getWeekRange(refDateStr?: string | null): WeekRange {
  let d: Date;
  if (refDateStr && /^\d{4}-\d{2}-\d{2}/.test(refDateStr.trim())) {
    const [y, m, day] = refDateStr.trim().split('T')[0].split('-').map(Number);
    d = new Date(y, m - 1, day, 12, 0, 0);
  } else {
    d = new Date();
  }
  const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday, ... 6 is Saturday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatIso = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  return {
    startIso: formatIso(monday),
    endIso: formatIso(sunday),
  };
}

export function isLoteDaSemana(
  lote: AcompanhamentoLote,
  etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens',
  refDateStr?: string | null
): boolean {
  const { startIso, endIso } = getWeekRange(refDateStr);
  const scheduleDate = getLoteScheduleDateIso(lote, etapa);
  if (!scheduleDate) return false;
  const cleanDate = scheduleDate.split('T')[0];
  return cleanDate >= startIso && cleanDate <= endIso;
}

export function getLoteEsperaDetails(
  lote: AcompanhamentoLote | null | undefined,
  programacaoEnvaseList?: ProgramacaoEnvaseItem[],
  programacaoRotulagemList?: ProgramacaoRotulagemItem[]
): LoteEsperaDetails {
  if (!lote) {
    return {
      isEmEspera: false,
      etapa: null,
      etapaLabel: '',
      motivo: null,
      insumoCodigo: null,
      insumoDescricao: null,
      badgeBg: 'bg-zinc-100',
      badgeText: 'text-zinc-700',
      badgeBorder: 'border-zinc-200'
    };
  }

  const rawEtapas = lote.etapasStatus || (lote as any).etapas_status || {};
  const cleanLoteNum = (lote.loteNumber || '').trim().toUpperCase();

  const envaseItem = programacaoEnvaseList?.find(it => (it.loteNumber || '').trim().toUpperCase() === cleanLoteNum);
  const isEnvaseEspera = rawEtapas.envase?.status === 'Em Espera' || rawEtapas.envase?.status === 'PAUSADO' || envaseItem?.statusEnvase === 'EM_ESPERA' || Boolean(rawEtapas.envase?.motivoEspera);

  const isProducaoEspera = rawEtapas.producao?.status === 'Em Espera' || rawEtapas.producao?.status === 'PAUSADO' || Boolean(rawEtapas.producao?.motivoEspera);

  const isPesagemEspera = rawEtapas.pesagem?.status === 'Em Espera' || rawEtapas.pesagem?.status === 'PAUSADO' || Boolean(rawEtapas.pesagem?.motivoEspera);

  const rotulagemItem = programacaoRotulagemList?.find(it => (it.loteNumber || '').trim().toUpperCase() === cleanLoteNum);
  const isRotulagemEspera = rawEtapas.rotulagem?.status === 'Em Espera' || rawEtapas.rotulagem?.status === 'PAUSADO' || rotulagemItem?.statusRotulagem === 'EM_ESPERA' || Boolean(rawEtapas.rotulagem?.motivoEspera);

  const eff = getEffectiveStatus(lote);
  const isGenericEspera = eff === 'Em Espera' || lote.customStatus === 'Em Espera' || Boolean(lote.dataEmEspera) || lote.erpStatus === 'ES' || Boolean(lote.motivoEspera);

  let activeEtapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | null = null;
  let motivo: string | null = null;
  let insumoCod: string | null = lote.insumoFaltanteCodigo || (lote as any).insumo_faltante_codigo || null;
  let insumoDesc: string | null = lote.insumoFaltanteDescricao || (lote as any).insumo_faltante_descricao || null;

  if (isEnvaseEspera) {
    activeEtapa = 'envase';
    motivo = rawEtapas.envase?.motivoEspera || envaseItem?.observacoes || lote.motivoEspera || null;
    insumoCod = rawEtapas.envase?.insumoFaltanteCodigo || insumoCod;
    insumoDesc = rawEtapas.envase?.insumoFaltanteDescricao || insumoDesc;
  } else if (isProducaoEspera) {
    activeEtapa = 'producao';
    motivo = rawEtapas.producao?.motivoEspera || lote.motivoEspera || null;
    insumoCod = rawEtapas.producao?.insumoFaltanteCodigo || insumoCod;
    insumoDesc = rawEtapas.producao?.insumoFaltanteDescricao || insumoDesc;
  } else if (isPesagemEspera) {
    activeEtapa = 'pesagem';
    motivo = rawEtapas.pesagem?.motivoEspera || lote.motivoEspera || null;
    insumoCod = rawEtapas.pesagem?.insumoFaltanteCodigo || insumoCod;
    insumoDesc = rawEtapas.pesagem?.insumoFaltanteDescricao || insumoDesc;
  } else if (isRotulagemEspera) {
    activeEtapa = 'rotulagem';
    motivo = rawEtapas.rotulagem?.motivoEspera || rotulagemItem?.observacoes || lote.motivoEspera || null;
    insumoCod = rawEtapas.rotulagem?.insumoFaltanteCodigo || insumoCod;
    insumoDesc = rawEtapas.rotulagem?.insumoFaltanteDescricao || insumoDesc;
  } else if (isGenericEspera) {
    if (lote.dataLiberadoEnvase || lote.dataEnvase) {
      activeEtapa = 'envase';
    } else if (lote.dataProducao) {
      activeEtapa = 'producao';
    } else {
      activeEtapa = 'pesagem';
    }
    motivo = lote.motivoEspera || null;
  }

  if (!activeEtapa) {
    return {
      isEmEspera: false,
      etapa: null,
      etapaLabel: '',
      motivo: null,
      insumoCodigo: null,
      insumoDescricao: null,
      badgeBg: 'bg-zinc-100',
      badgeText: 'text-zinc-700',
      badgeBorder: 'border-zinc-200'
    };
  }

  const mapEtapa: Record<'pesagem' | 'producao' | 'rotulagem' | 'envase', { label: string; bg: string; text: string; border: string }> = {
    pesagem: { label: 'Pesagem', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    producao: { label: 'Produção', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    envase: { label: 'Envase', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    rotulagem: { label: 'Rotulagem', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  };

  const config = mapEtapa[activeEtapa];
  return {
    isEmEspera: true,
    etapa: activeEtapa,
    etapaLabel: config.label,
    motivo,
    insumoCodigo: insumoCod,
    insumoDescricao: insumoDesc,
    badgeBg: config.bg,
    badgeText: config.text,
    badgeBorder: config.border
  };
}

export function getPrevisaoBadge(dateIso?: string | null) {
  if (!dateIso) return null;
  const clean = dateIso.split('T')[0];
  const parts = clean.split('-');
  if (parts.length !== 3) return null;
  
  const target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const dateFormatted = `${parts[2]}/${parts[1]}/${parts[0].substring(2)}`;

  if (diffDays < 0) {
    return {
      label: `${dateFormatted} (${Math.abs(diffDays)}d atraso)`,
      colorClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
      isOverdue: true,
      diffDays,
      formatted: dateFormatted
    };
  } else if (diffDays === 0) {
    return {
      label: `${dateFormatted} (Hoje)`,
      colorClass: 'bg-amber-100 text-amber-800 border-amber-300 font-bold',
      isToday: true,
      diffDays,
      formatted: dateFormatted
    };
  } else {
    return {
      label: `${dateFormatted} (${diffDays}d)`,
      colorClass: 'bg-blue-50 text-blue-700 border-blue-200 font-medium',
      isFuture: true,
      diffDays,
      formatted: dateFormatted
    };
  }
}

/**
 * Unidades do lote para exibição. Produto sem peso na descrição (`pesoDesconhecido`) não tem unidades calculadas:
 * mostra "—" em vez de "0 un". Com `classeUn`, a sigla "un" sai num <span> com essa classe.
 */
export function formatarUnidadesLote(
  lote: { quantity?: number | string | null; pesoDesconhecido?: boolean } | null | undefined,
  classeUn?: string
): React.ReactNode {
  if (lote?.pesoDesconhecido) return <span title="Produto sem peso na descrição">—</span>;
  const n = Number(lote?.quantity || 0).toLocaleString('pt-BR');
  return classeUn ? <>{n} <span className={classeUn}>un</span></> : `${n} un`;
}
