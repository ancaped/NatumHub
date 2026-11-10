import { Package, Boxes, Snowflake, Flame, Zap } from 'lucide-react';
import { unidadesDeKg, ehBaseProduto } from '../../../../lib/unitConversion';
import { ehBombona } from '../../../../lib/processoProduto';

export interface ReatorConfig {
  id: string;
  nome: string;
  capacidade_kg: number;
  tipo: 'quente' | 'frio' | 'misto' | string;
  ordem: number;
  ativo: boolean;
}

export interface PlanejamentoItem {
  id: string;
  week_key: string;
  data_planejada: string; // YYYY-MM-DD
  reator_id: string;
  codigo_produto: string;
  descricao?: string;
  quantidade_planejada: number;
  unidade?: string;
  base_codigo?: string;
  base_nome?: string;
  linha_envase?: string; // 'L1' | 'L2' | 'L3'
  observacoes?: string;
  ordem_status?: string; // 'planejado' | 'aprovado' | 'lote_criado' | 'cancelado'
  lote_erp?: string;
  fisico_confirmado_massa?: boolean;
  fisico_confirmado_embalagem?: boolean;
  fisico_confirmado_rotulo?: boolean;
  recipiente_detalhe?: string; // 'Reator' | 'Bombona 50kg' | 'Bombona 100kg' | 'Bombona 200kg'
  cor_tag?: string; // 'black' | 'blond' | 'neutro' | 'red'
  ordem_sequencia?: number;
  processo_termico?: string;
  batch_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InsumoSummary {
  ingredient_code: string;
  description: string;
  total_required: number;
  current_stock: number;
  missing_qty: number;
  is_missing: boolean;
  is_divergente?: boolean;
  fisico_confirmado?: boolean;
  next_delivery_date?: string;
  po_number?: number;
}


// Reatores padrão de fábrica solicitados por Edson com classificação Quente / Frio / Shampoos / Bombonas
export const DEFAULT_REATORES: ReatorConfig[] = [
  { id: 'R_1000_SHAMPOO', nome: 'Reator 1000kg (Caldeira - Exclusivo Shampoo)', capacidade_kg: 1000, tipo: 'caldeira_shampoo', ordem: 1, ativo: true },
  { id: 'R_1000_MISTO', nome: 'Reator 1000kg (Caldeira - Produção Mista)', capacidade_kg: 1000, tipo: 'caldeira', ordem: 2, ativo: true },
  { id: 'R_500', nome: 'Reator 500kg (Caldeira - Quente/Frio)', capacidade_kg: 500, tipo: 'caldeira', ordem: 3, ativo: true },
  { id: 'R_200', nome: 'Reator 200kg (Caldeira - Quente/Frio)', capacidade_kg: 200, tipo: 'caldeira', ordem: 4, ativo: true },
  { id: 'R_100', nome: 'Reator 100kg (Resistência)', capacidade_kg: 100, tipo: 'resistencia', ordem: 5, ativo: true },
  { id: 'R_40', nome: 'Reator 40kg (Produção Quente)', capacidade_kg: 40, tipo: 'quente', ordem: 6, ativo: true },
  { id: 'BOMBONAS', nome: 'Bombona 50kg', capacidade_kg: 50, tipo: 'bombona', ordem: 7, ativo: true },
];

const BADGE_ZINC = 'bg-zinc-100 text-zinc-800 border-zinc-200';
/** Ícone e selo do reator pelo tipo configurado (uma fonte só para a tela). */
const INFO_POR_TIPO: Record<string, { Icone: typeof Package; titulo: string; rotulo: string; badge: string }> = {
  caldeira_shampoo: { Icone: Snowflake, titulo: 'Exclusivo Shampoos', rotulo: 'Shampoo (Frio)', badge: BADGE_ZINC },
  caldeira: { Icone: Boxes, titulo: 'Caldeira / Misto', rotulo: 'Caldeira', badge: BADGE_ZINC },
  resistencia: { Icone: Zap, titulo: 'Aquecimento por Resistência', rotulo: 'Resistência', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  quente: { Icone: Flame, titulo: 'Produção Quente', rotulo: 'Quente', badge: BADGE_ZINC },
  bombona: { Icone: Package, titulo: 'Bombonas Móveis de Mistura', rotulo: 'Bombona', badge: BADGE_ZINC },
  frio: { Icone: Snowflake, titulo: 'A Frio Simples', rotulo: 'A Frio', badge: BADGE_ZINC },
  misto: { Icone: Boxes, titulo: 'Misto Geral', rotulo: 'Misto', badge: BADGE_ZINC },
};
const TIPO_POR_ID_ANTIGO: Record<string, string> = {
  BOMBONAS: 'bombona', R_100: 'resistencia', R_40: 'quente', R_1000_SHAMPOO: 'caldeira_shampoo', R_1000: 'caldeira_shampoo', R_1000_MISTO: 'misto',
};
export function infoDoReator(r: Pick<ReatorConfig, 'id' | 'tipo'>) {
  const tipo = INFO_POR_TIPO[r.tipo] ? r.tipo : (TIPO_POR_ID_ANTIGO[r.id] ?? 'caldeira');
  return { tipo, ...INFO_POR_TIPO[tipo] };
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

export interface CellBatchGroup {
  key: string;
  items: PlanejamentoItem[];
  primaryItem: PlanejamentoItem;
  totalKg: number;
  totalUnits: number;
  isMulti: boolean;
  loteErp?: string;
  isAprovado: boolean;
  isLoteCriado: boolean;
  isQuente: boolean;
}

export function groupCellItems(cellItems: PlanejamentoItem[]): CellBatchGroup[] {
  const groups: Map<string, PlanejamentoItem[]> = new Map();

  for (const item of cellItems) {
    let key = '';
    const cleanLote = (item.lote_erp || '').trim();
    const cleanBatch = (item.batch_id || '').trim();
    if (cleanBatch) {
      key = `BATCH_${cleanBatch}`;
    } else if (cleanLote && !cleanLote.toUpperCase().startsWith('PLAN_') && !cleanLote.toUpperCase().startsWith('PL-')) {
      key = `LOTE_${cleanLote}`;
    } else {
      const mBatch = item.observacoes?.match(/\[batch:([^\]]+)\]/);
      if (mBatch) {
        key = `BATCH_${mBatch[1]}`;
      } else if (item.observacoes?.includes('Batelada conjunta')) {
        const parts = item.id.split('_');
        if (parts.length >= 2 && !isNaN(Number(parts[parts.length - 2]))) {
          key = `BATCH_${parts[parts.length - 2]}`;
        } else {
          key = `CONJUNTA_${item.reator_id}_${item.data_planejada}`;
        }
      } else {
        key = `ITEM_${item.id}`;
      }
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  return Array.from(groups.entries()).map(([key, items]) => {
    const primaryItem = items[0];
    const totalKg = Number(items.reduce((acc, it) => acc + (Number(it.quantidade_planejada) || 0), 0).toFixed(1));
    const totalUnits = items.reduce((acc, it) => {
      return acc + (unidadesDeKg(Number(it.quantidade_planejada) || 0, it.descricao, ehBaseProduto({ codigo: it.codigo_produto, descricao: it.descricao })) ?? 0);
    }, 0);
    const isMulti = items.length > 1;
    const loteErp = items.find(it => it.lote_erp && it.lote_erp.trim())?.lote_erp?.trim();
    const isAprovado = items.every(it => it.ordem_status === 'aprovado');
    const isLoteCriado = items.some(it => it.ordem_status === 'lote_criado' || Boolean(it.lote_erp));
    const isQuente = items.some(it => 
      it.processo_termico === 'resistencia' || 
      it.processo_termico === 'agua_caldeira' || 
      it.processo_termico === 'caldeira' ||
      it.processo_termico === 'quente' ||
      it.reator_id === 'R_40' || 
      it.recipiente_detalhe === 'Reator 40kg' || 
      (it.observacoes || '').includes('Caldeira')
    );

    return {
      key,
      items,
      primaryItem,
      totalKg,
      totalUnits,
      isMulti,
      loteErp,
      isAprovado,
      isLoteCriado,
      isQuente
    };
  });
}

/**
 * Utilitário de cálculo de data/semana ISO
 */
export function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getWeekKey(d: Date): string {
  const monday = getMondayOfWeek(d);
  const target = new Date(monday.valueOf());
  const dayNr = (monday.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const isoYear = new Date(firstThursday).getFullYear();
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
}

/** Lê `{ error }` da resposta do servidor (422/409/500) e cai no texto padrão se o corpo não vier. */
export async function mensagemErroServidor(res: Response, padrao: string): Promise<string> {
  try {
    const err = await res.json();
    if (err?.error) return String(err.error);
  } catch { /* corpo vazio */ }
  return padrao;
}

/** Item da fila de demandas com os dados do produto (cálculo do Gerenciamento) por baixo. */
export function candidatoDaFila(f: any, p: any): any {
  const code = f.codigoProduto || f.codigo_produto;
  const batchMatch = (f.observacoes || '').match(/\[batch:([^\]]+)\]/i);
  return {
    ...p,
    _filaId: f.id,
    _isFromFila: true,
    _batchGroupId: batchMatch ? batchMatch[1].trim() : null,
    codigo: code,
    descricao: f.descricao,
    producao_recomendada: f.quantidade,
    quantidade: f.quantidade,
    quantidade_kg: f.quantidadeKg || f.quantidade_kg,
    origem_demanda: f.origemDemanda || f.origem_demanda,
    base_codigo: f.baseCodigo || f.base_codigo,
    base: f.baseNome || f.base_nome,
    unidade: f.unidade || 'un',
    observacoes: f.observacoes,
    // Fila automática: calculada pelo servidor (sem linha na tabela); `situacao` e `falta` vêm da cobertura de insumos.
    _automatica: f.origem === 'automatica',
    _situacao: f.situacao === 'aguardando_insumos' ? 'aguardando_insumos' : 'disponivel',
    _falta: Array.isArray(f.falta) ? f.falta : [],
    _motivoSituacao: f.motivoSituacao || null,
  };
}

/** Espelho, para avisar na hora, da regra que o servidor aplica ao gravar (`validar_capacidade` em `planejamento.rs`): modal, arraste e sugestão passam todos por ela no servidor. A capacidade limita só a batelada; não há limite de ordens por dia no reator (decisão do Edson, 2026-10-27). */
export function validarAlocacao(opts: {
  reatorId: string;
  dateStr: string;
  kg: number;
  reatores: ReatorConfig[];
  plannedItems: PlanejamentoItem[];
  ignoreIds?: Set<string>;
}): string | null {
  const date = (opts.dateStr || '').split('T')[0];
  const reator = opts.reatores.find(r => r.id === opts.reatorId);
  if (reator && opts.kg > Number(reator.capacidade_kg) + 0.05) {
    return ehBombona(reator)
      ? `${reator.nome} comporta até ${reator.capacidade_kg} kg. Esta ordem tem ${opts.kg} kg.`
      : `A massa de ${opts.kg} kg passa da capacidade de ${reator.capacidade_kg} kg deste reator.`;
  }
  return null;
}
