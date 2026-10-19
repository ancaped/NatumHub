import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, CalendarClock, Search, RefreshCw, Printer, Trash2, CheckCircle2, 
  X, AlertTriangle, HelpCircle, Edit3, Database, Play, Check, ArrowRight,
  Clock, ChevronDown, ChevronUp, Package, Truck, Boxes, Sparkles, Settings,
  ShieldCheck, ShieldAlert, Layers, Plus, ChevronLeft, ChevronRight, Filter,
  TrendingDown, CheckCircle, Info, Flame, Snowflake, AlertCircle, ArrowUpDown, Tag,
  FileSpreadsheet, Download, GripVertical, AlertOctagon, SlidersHorizontal, FlaskConical, Zap
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../../../geral/lib/http';
import { printHtmlViaIframe } from '../../../geral/lib/printCleanup';
import { loadNatumLogoDataUrl } from '../../../geral/lib/logoUtils';
import { getHoliday, getBrazilHolidaysForYear, HolidayInfo } from '../../../geral/lib/brazilHolidays';

export interface InsumoConsumoItem {
  code: string;
  description: string;
  category: 'materia_prima' | 'embalagem';
  unit: string;
  totalRequired: number;
  currentStock: number;
  projectedBalance: number;
  isMissing: boolean;
  missingQty: number;
  purchaseOrders: {
    n_pedido: number;
    c_nome_f?: string;
    d_previsao?: string;
    n_qtde: number;
    n_chegou: number;
    n_pendente: number;
  }[];
  nextDeliveryDate?: string;
  productsUsedIn: {
    productCode: string;
    description: string;
    batchKg: number;
    requiredQty: number;
  }[];
}

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

interface PlanejamentoSemanalTabProps {
  active?: boolean;
  productionApprovalList?: string[];
  onToggleApprovalList?: (code: string) => void;
  diasComerciais?: number;
  configs?: any[];
  onLaunchSuccess?: () => void;
  onScheduleChanged?: () => void;
  currentDate?: Date;
  onCurrentDateChange?: (d: Date) => void;
  hideHeaderNav?: boolean;
  onShowDetails?: (code: string) => void;
}

// Reatores padrão de fábrica solicitados por Edson com classificação Quente / Frio / Shampoos / Bombonas
const DEFAULT_REATORES: ReatorConfig[] = [
  { id: 'R_1000_SHAMPOO', nome: 'Reator 1000kg (Caldeira - Exclusivo Shampoo)', capacidade_kg: 1000, tipo: 'caldeira_shampoo', ordem: 1, ativo: true },
  { id: 'R_1000_MISTO', nome: 'Reator 1000kg (Caldeira - Produção Mista)', capacidade_kg: 1000, tipo: 'caldeira', ordem: 2, ativo: true },
  { id: 'R_500', nome: 'Reator 500kg (Caldeira - Quente/Frio)', capacidade_kg: 500, tipo: 'caldeira', ordem: 3, ativo: true },
  { id: 'R_200', nome: 'Reator 200kg (Caldeira - Quente/Frio)', capacidade_kg: 200, tipo: 'caldeira', ordem: 4, ativo: true },
  { id: 'R_100', nome: 'Reator 100kg (Resistência - Máx 1/dia)', capacidade_kg: 100, tipo: 'resistencia', ordem: 5, ativo: true },
  { id: 'R_40', nome: 'Reator 40kg (Produção Quente)', capacidade_kg: 40, tipo: 'quente', ordem: 6, ativo: true },
  { id: 'BOMBONAS', nome: 'Bombonas (50kg, 100kg, 200kg)', capacidade_kg: 200, tipo: 'bombona', ordem: 7, ativo: true },
];

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

/**
 * Extrai o peso/volume unitário do produto a partir da descrição (ex: "60 ML" -> 0.06 kg, "500 G" -> 0.5 kg, "1 L" -> 1.0 kg)
 */
export function parseProductUnitWeightKg(descricao?: string): number {
  if (!descricao) return 1.0;
  const desc = descricao.toUpperCase();
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*(ML|L|GR|G|KG)\b/i);
  if (!m) return 1.0;

  const val = parseFloat(m[1].replace(',', '.'));
  if (isNaN(val) || val <= 0) return 1.0;

  const unit = m[2].toUpperCase();
  if (unit === 'KG' || unit === 'L') {
    return val;
  }
  if (unit === 'G' || unit === 'GR' || unit === 'ML') {
    return val / 1000.0;
  }
  return 1.0;
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
    if (cleanLote && !cleanLote.toUpperCase().startsWith('PLAN_') && !cleanLote.toUpperCase().startsWith('PL-')) {
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
      const uW = parseProductUnitWeightKg(it.descricao);
      return acc + Math.round((Number(it.quantidade_planejada) || 0) / (uW || 1));
    }, 0);
    const isMulti = items.length > 1;
    const loteErp = items.find(it => it.lote_erp && it.lote_erp.trim())?.lote_erp?.trim();
    const isAprovado = items.every(it => 
      it.ordem_status === 'aprovado' || 
      (it.fisico_confirmado_massa && it.fisico_confirmado_embalagem && it.fisico_confirmado_rotulo) ||
      isPastEndOfDay(it.data_planejada)
    );
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

/**
 * Classificação técnica de processo: Quente (Caldeira / Água Caldeira) vs Frio (Bases / Shampoos)
 * Realiza a conversão correta de Unidades de Produto para Massa a Granel em Kg
 */
export function getProductProcessType(p: any): { 
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
      canBombona: reqQtyKg <= 150,
      motivo: isR40 ? 'Reator 40kg Quente (Fusão de ceras/óleos)' : 'Fusão de ceras/óleos (Quente)', 
      label: isR40 ? 'Reator 40kg' : 'Caldeira',
      recipienteSugerido: isR40 ? 'R_40' : (reqQtyKg <= 100 ? 'R_100' : (reqQtyKg >= 600 ? 'R_1000_MISTO' : (reqQtyKg <= 250 ? 'R_200' : 'R_500'))),
      unitWeightKg,
      reqUnits,
      reqQtyKg
    };
  }

  // Máscaras, Cremes, Botox -> Quente (se <= 45kg vai no Reator 40kg, se <= 150kg pode ir na bombona com água quente da caldeira!)
  if (desc.includes('MASC') || desc.includes('CREME') || desc.includes('DEFRIZANTE') || desc.includes('BOTOX')) {
    const isR40 = reqQtyKg <= 45;
    const podeBombona = reqQtyKg <= 150;
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
      canBombona: reqQtyKg <= 150,
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

/**
 * Utilitário de cálculo de data/semana ISO
 */
function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekKey(d: Date): string {
  const monday = getMondayOfWeek(d);
  const target = new Date(monday.valueOf());
  const dayNr = (monday.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function PlanejamentoSemanalTab({
  active = true,
  productionApprovalList = [],
  onToggleApprovalList,
  diasComerciais = 30,
  configs = [],
  onLaunchSuccess,
  onScheduleChanged,
  currentDate: propCurrentDate,
  onCurrentDateChange,
  hideHeaderNav = false,
  onShowDetails,
}: PlanejamentoSemanalTabProps) {
  // Estado da semana atual selecionada (sincronizada com prop se fornecida)
  const [internalCurrentDate, setInternalCurrentDate] = useState<Date>(() => new Date());
  const currentDate = propCurrentDate || internalCurrentDate;
  const setCurrentDate = (d: Date | ((prev: Date) => Date)) => {
    const nextVal = typeof d === 'function' ? d(currentDate) : d;
    if (onCurrentDateChange) {
      onCurrentDateChange(nextVal);
    } else {
      setInternalCurrentDate(nextVal);
    }
  };
  
  // Reatores
  const [reatores, setReatores] = useState<ReatorConfig[]>(DEFAULT_REATORES);
  const [loadingReatores, setLoadingReatores] = useState(false);
  const [reatoresModalOpen, setReatoresModalOpen] = useState(false);

  // Itens do Planejamento
  const [plannedItems, setPlannedItems] = useState<PlanejamentoItem[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(false);

  // Banco de Produtos do Sistema (Catálogo Completo - Apenas Ativos)
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Painel lateral e busca do Banco de Demandas
  const [demandBankOpen, setDemandBankOpen] = useState(true);
  const [demandSearch, setDemandSearch] = useState('');
  const [filaDemandas, setFilaDemandas] = useState<any[]>([]);
  const [demandFilter, setDemandFilter] = useState<'FILA' | 'ALL' | 'CRITICOS' | 'PROGRAMADAS' | 'KITS' | 'BASES'>('FILA');

  const fetchFila = useCallback(async () => {
    try {
      const res = await apiFetch('/producao/fila-demandas');
      if (res.ok) {
        const data = await res.json();
        setFilaDemandas(Array.isArray(data.items) ? data.items : []);
      }
    } catch (e) {
      console.warn('Erro ao buscar fila de demandas:', e);
    }
  }, []);
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('ALL');

  // Modais de Ação
  const [scheduleModalItem, setScheduleModalItem] = useState<{
    product?: any | null;
    targetDate?: string;
    targetReator?: string;
  } | null>(null);
  const [scheduleSearch, setScheduleSearch] = useState<string>('');
  const [scheduleSelectedProducts, setScheduleSelectedProducts] = useState<any[]>([]);
  const [scheduleItemMasses, setScheduleItemMasses] = useState<Record<string, number>>({});
  const [scheduleQty, setScheduleQty] = useState<number>(100);
  const [scheduleReator, setScheduleReator] = useState<string>('R_100');
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleEnvaseLine, setScheduleEnvaseLine] = useState<string>('L1');
  const [scheduleRecipienteDetalhe, setScheduleRecipienteDetalhe] = useState<string>('Reator');
  const [sameFormulaProducts, setSameFormulaProducts] = useState<any[]>([]);
  const [loadingSameFormula, setLoadingSameFormula] = useState<boolean>(false);

  // Modal de Lote ERP / Despacho
  const [dispatchModalItem, setDispatchModalItem] = useState<PlanejamentoItem | null>(null);
  const [loteErpInput, setLoteErpInput] = useState('');
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);

  // Modal para Vincular / Editar Lote ERP diretamente no Card
  const [linkLoteModalItem, setLinkLoteModalItem] = useState<{
    item: PlanejamentoItem;
    batchItems?: PlanejamentoItem[];
    lote: string;
    loadingUltimoLote?: boolean;
    ultimoLote?: string | null;
    dataUltimoLote?: string | null;
    quantidadeKgLote?: number | null;
    autoQty?: number | null;
    sugestaoProximo?: string | null;
    origemUltimoLote?: string | null;
  } | null>(null);

  // Modal para Editar Quantidade Planejada (kg) diretamente no Card
  const [editQtyModalItem, setEditQtyModalItem] = useState<{ 
    item: PlanejamentoItem; 
    newQty: number;
    batchItems?: PlanejamentoItem[];
    batchMasses?: Record<string, number>;
  } | null>(null);

  // Modal de Configurações da Batelada (Parâmetros Técnicos)
  const [technicalModalItem, setTechnicalModalItem] = useState<{
    item: PlanejamentoItem;
    batchItems?: PlanejamentoItem[];
    processoTermico: string;
    origemFormulacao: 'completa' | 'base';
    baseCodigo: string;
    baseNome: string;
    reatorId: string;
    recipienteDetalhe: string;
    dataPlanejada: string;
    quantidadeKg: number;
    linhaEnvase: string;
    loteErp: string;
    observacoes: string;
    loadingUltimoLote?: boolean;
    ultimoLote?: string | null;
    dataUltimoLote?: string | null;
    quantidadeKgLote?: number | null;
    sugestaoProximo?: string | null;
  } | null>(null);

  // Drag and Drop State (Arrastar cards no quadro ou do banco de demandas)
  const [draggedItem, setDraggedItem] = useState<PlanejamentoItem | null>(null);
  const [draggedBatch, setDraggedBatch] = useState<PlanejamentoItem[] | null>(null);
  const [draggedDrawerProduct, setDraggedDrawerProduct] = useState<any | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ reatorId: string; dateStr: string } | null>(null);

  // Modal Relatório de Consumo de Insumos & Embalagens da Semana
  const [materialsReportOpen, setMaterialsReportOpen] = useState(false);
  const [loadingMaterialsReport, setLoadingMaterialsReport] = useState(false);
  const [materialsList, setMaterialsList] = useState<InsumoConsumoItem[]>([]);
  const [materialsFilterTab, setMaterialsFilterTab] = useState<'ALL' | 'FALTAS' | 'MP' | 'EMB'>('ALL');
  const [materialsSearch, setMaterialsSearch] = useState('');

  // Modal de Otimização Automática (Heurística)
  const [heuristicModalOpen, setHeuristicModalOpen] = useState(false);
  const [heuristicProposal, setHeuristicProposal] = useState<PlanejamentoItem[]>([]);
  const [heuristicStats, setHeuristicStats] = useState<{
    totalBatches: number;
    totalKg: number;
    groupedBases: number;
    avoidedHolidays: number;
    caldeiraDays: number;
  }>({ totalBatches: 0, totalKg: 0, groupedBases: 0, avoidedHolidays: 0, caldeiraDays: 0 });

  // Datas da semana de Segunda a Sexta
  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(currentDate);
    const days: { date: Date; dateStr: string; label: string; dayNumber: number; holiday: HolidayInfo | null }[] = [];
    const labels = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = formatDateStr(d);
      const holiday = getHoliday(dateStr);
      days.push({
        date: d,
        dateStr,
        label: labels[i],
        dayNumber: d.getDate(),
        holiday
      });
    }
    return days;
  }, [currentDate]);

  const currentWeekKey = useMemo(() => getWeekKey(currentDate), [currentDate]);

  // Carregar Reatores do Backend
  const fetchReatores = useCallback(async () => {
    setLoadingReatores(true);
    try {
      const res = await apiFetch('/producao/reatores');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setReatores(data);
        }
      }
    } catch (e) {
      console.warn('Usando reatores padrão locais:', e);
    } finally {
      setLoadingReatores(false);
    }
  }, []);

  // Carregar Planejamento da Semana
  const fetchPlanejamento = useCallback(async () => {
    setLoadingPlan(true);
    try {
      const res = await apiFetch(`/producao/planejamento-semanal?week=${currentWeekKey}`);
      if (res.ok) {
        const data: PlanejamentoItem[] = await res.json();
        setPlannedItems(data);
      } else {
        const stored = localStorage.getItem(`plan_semanal_${currentWeekKey}`);
        if (stored) {
          setPlannedItems(JSON.parse(stored));
        } else {
          setPlannedItems([]);
        }
      }
    } catch (e) {
      console.warn('Erro ao buscar planejamento semanal, usando cache:', e);
      const stored = localStorage.getItem(`plan_semanal_${currentWeekKey}`);
      if (stored) setPlannedItems(JSON.parse(stored));
    } finally {
      setLoadingPlan(false);
    }
  }, [currentWeekKey]);

  // Carregar produtos ESTRITAMENTE ATIVOS (sem show_hidden=true)
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      // NÃO passa show_hidden para o backend já aplicar os filtros de ativos, mas inclui programadas, kits e bases
      const res = await apiFetch(`/products?limit=9999&include_programadas=true&include_kits=true&include_bases=true`);
      if (res.ok) {
        const data = await res.json();
        // Filtro estrito client-side para garantir que itens inativos/descontinuados/terceirizados sejam expurgados
        // MAS preserva bases ativas de produção
        const activeItems = (data.items || []).filter((p: any) => {
          const isBase = p.categoria_produto === 'cat_base' || 
                         p.status_produto === 'bases' || 
                         p.status === 'bases' ||
                         (p.codigo || '').includes('.36.') ||
                         (p.descricao || '').toUpperCase().startsWith('BASE ') ||
                         (p.descricao || '').toUpperCase().startsWith('PRE BASE ');

          if (isBase) {
            return p.visivel !== 0;
          }

          const isSuspended = p.visivel === 0 || 
                             p.status === 'descontinuado' || 
                             p.status === 'inativo' || 
                             p.status === 'terceirizado' ||
                             p.status_produto === 'descontinuado' || 
                             p.status_produto === 'inativo' || 
                             p.status_produto === 'terceirizado' ||
                             p.terceirizado_modo === 1;
          return !isSuspended;
        });
        setProducts(activeItems);
      }
    } catch (e) {
      console.error('Erro ao buscar produtos:', e);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    if (active) {
      fetchReatores();
      fetchProducts();
      fetchFila();
    }
  }, [active, fetchReatores, fetchProducts, fetchFila]);

  useEffect(() => {
    if (active) {
      fetchPlanejamento();
    }
  }, [active, fetchPlanejamento]);

  // Navegação de Semanas
  const handlePrevWeek = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 7);
    setCurrentDate(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 7);
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Linhas comerciais de produtos disponíveis
  const availableLines = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.linha_prefix && p.linha_prefix.trim()) {
        set.add(p.linha_prefix.trim());
      }
    }
    return Array.from(set).sort();
  }, [products]);

  // Contadores para as abas do Banco de Demandas
  const demandFilterCounts = useMemo(() => {
    let all = 0;
    let criticos = 0;
    let programadas = 0;
    let kits = 0;
    let bases = 0;

    for (const p of products) {
      if (selectedLineFilter !== 'ALL' && p.linha_prefix !== selectedLineFilter) continue;
      all++;
      const isBase = p.categoria_produto === 'cat_base' || 
                     p.status_produto === 'bases' || 
                     p.status === 'bases' ||
                     (p.codigo || '').includes('.36.') ||
                     (p.descricao || '').toUpperCase().startsWith('BASE ') ||
                     (p.descricao || '').toUpperCase().startsWith('PRE BASE ');
      if (isBase) bases++;
      const efp = p.estoque_futuro_com_producao ?? p.estoque_futuro ?? 0;
      if (efp < 0 || p.status === 'critico' || p.status === 'ordem') criticos++;
      if (p.is_producao_programada === 1 || p.is_producao_programada === true) programadas++;
      if (p.is_kit || p.is_kit_component === 1 || p.produzir_apenas_kit === 1) kits++;
    }
    return { all, criticos, programadas, kits, bases };
  }, [products, selectedLineFilter]);

  // Itens elegíveis para o Banco de Demandas (Exclusivo Fila de Demandas)
  const demandCandidates = useMemo(() => {
    const prodMap = new Map(products.map(p => [p.codigo, p]));
    const mapped = filaDemandas
      .filter(f => {
        if (!demandSearch.trim()) return true;
        const q = demandSearch.toLowerCase().trim();
        const code = (f.codigoProduto || f.codigo_produto || '').toLowerCase();
        const desc = (f.descricao || '').toLowerCase();
        const obs = (f.observacoes || '').toLowerCase();
        return code.includes(q) || desc.includes(q) || obs.includes(q);
      })
      .map(f => {
        const code = f.codigoProduto || f.codigo_produto;
        const p = prodMap.get(code) || {};
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
          observacoes: f.observacoes
        };
      });

    const grouped: any[] = [];
    const seenGroups = new Set<string>();
    for (const item of mapped) {
      if (item._batchGroupId) {
        if (seenGroups.has(item._batchGroupId)) continue;
        seenGroups.add(item._batchGroupId);
        const siblings = mapped.filter(m => m._batchGroupId === item._batchGroupId);
        const totalBatchKg = Number(siblings.reduce((acc, s) => acc + (Number(s.quantidade_kg) || 0), 0).toFixed(1));
        grouped.push({
          ...item,
          _batchSiblings: siblings,
          _totalBatchKg: totalBatchKg
        });
      } else {
        grouped.push(item);
      }
    }
    return grouped;
  }, [products, filaDemandas, demandSearch]);

  // Mapeamento de Itens Agendados na Grade (por Reator e por Dia)
  const matrixItemsMap = useMemo(() => {
    const map: Record<string, PlanejamentoItem[]> = {};
    for (const item of plannedItems) {
      const key = `${item.reator_id}_${item.data_planejada}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [plannedItems]);

  // Estatísticas da semana atual
  const weekStats = useMemo(() => {
    let totalKg = 0;
    let totalBatches = plannedItems.length;
    let envaseDayLoad: Record<string, number> = { L1: 0, L2: 0, L3: 0 };
    let caldeiraItems = 0;

    for (const item of plannedItems) {
      totalKg += Number(item.quantidade_planejada || 0);
      const line = item.linha_envase || 'L1';
      if (envaseDayLoad[line] !== undefined) {
        envaseDayLoad[line] += Number(item.quantidade_planejada || 0);
      }
      if ((item.observacoes || '').includes('Caldeira')) {
        caldeiraItems++;
      }
    }

    const activeReatoresCount = reatores.filter(r => r.ativo).length;
    const availableSlots = activeReatoresCount * 5;
    const occupancyRate = availableSlots > 0 ? Math.round((totalBatches / availableSlots) * 100) : 0;

    return { totalKg, totalBatches, occupancyRate, envaseDayLoad, caldeiraItems };
  }, [plannedItems, reatores]);

  // Salvar/Persistir Item no Planejamento
  const handleSaveItem = async (newItem: PlanejamentoItem) => {
    try {
      const res = await apiFetch('/producao/planejamento-semanal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      if (res.ok) {
        setPlannedItems(prev => {
          const filtered = prev.filter(i => i.id !== newItem.id);
          const next = [...filtered, newItem];
          localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(next));
          return next;
        });
      } else {
        setPlannedItems(prev => {
          const filtered = prev.filter(i => i.id !== newItem.id);
          const next = [...filtered, newItem];
          localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(next));
          return next;
        });
      }
    } catch (e) {
      console.warn('Salvando localmente:', e);
      setPlannedItems(prev => {
        const filtered = prev.filter(i => i.id !== newItem.id);
        const next = [...filtered, newItem];
        localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(next));
        return next;
      });
    } finally {
      window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
      onScheduleChanged?.();
    }
  };

  // Excluir Item do Planejamento (e retornar para a Fila se não concluído)
  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Deseja remover esta batelada do planejamento semanal? Ela retornará para a Fila de Demandas.")) return;
    const itemToRemove = plannedItems.find(i => i.id === id);
    try {
      await apiFetch(`/producao/planejamento-semanal/${id}`, { method: 'DELETE' });
      if (itemToRemove && itemToRemove.ordem_status !== 'concluido') {
        const uW = parseProductUnitWeightKg(itemToRemove.descricao);
        const estUn = Math.max(1, Math.round((Number(itemToRemove.quantidade_planejada) || 0) / (uW || 1)));
        await apiFetch('/producao/fila-demandas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigoProduto: itemToRemove.codigo_produto,
            descricao: itemToRemove.descricao,
            quantidade: estUn,
            unidade: 'un',
            quantidadeKg: Number(itemToRemove.quantidade_planejada) || 0,
            origemDemanda: 'retorno_pcp',
            baseCodigo: itemToRemove.base_codigo,
            baseNome: itemToRemove.base_nome
          })
        });
        await fetchFila();
      }
    } catch (e) {
      console.warn('Erro ao deletar no servidor:', e);
    }
    setPlannedItems(prev => {
      const next = prev.filter(i => i.id !== id);
      localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(next));
      return next;
    });
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // LIMPAR TODA A SEMANA (NOVO BOTÃO SOLICITADO POR EDSON)
  const handleClearWeek = async () => {
    const weekLabel = `Semana ${currentWeekKey.split('-W')[1]} (${weekDays[0].dateStr.split('-').slice(1).reverse().join('/')} a ${weekDays[4].dateStr.split('-').slice(1).reverse().join('/')})`;
    if (!window.confirm(`Deseja realmente limpar todas as bateladas agendadas para a ${weekLabel}? O quadro ficará zerado.`)) {
      return;
    }
    try {
      await apiFetch(`/producao/planejamento-semanal/clear?week=${currentWeekKey}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('Erro ao limpar semana no servidor:', e);
    }
    setPlannedItems([]);
    localStorage.removeItem(`plan_semanal_${currentWeekKey}`);
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Toggle Aprovação da Produção (substitui o antigo MER com botão único de ícone)
  const handleToggleAprovacao = async (item: PlanejamentoItem) => {
    const isCurrentlyApproved = item.ordem_status === 'aprovado' || (item.fisico_confirmado_massa && item.fisico_confirmado_embalagem && item.fisico_confirmado_rotulo);
    const newApproved = !isCurrentlyApproved;

    const updated: PlanejamentoItem = {
      ...item,
      ordem_status: newApproved ? 'aprovado' : 'planejado',
      fisico_confirmado_massa: newApproved,
      fisico_confirmado_embalagem: newApproved,
      fisico_confirmado_rotulo: newApproved,
    };

    setPlannedItems(prev => prev.map(p => p.id === item.id ? updated : p));

    try {
      await apiFetch(`/api/producao/planejamento-semanal/${item.id}/confirmar-fisico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          massa: newApproved,
          embalagem: newApproved,
          rotulo: newApproved,
          ordem_status: newApproved ? 'aprovado' : 'planejado'
        })
      });

      await handleSaveItem(updated);
      window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
      onScheduleChanged?.();
    } catch (e) {
      console.error('Erro ao alternar aprovação de produção:', e);
      setPlannedItems(prev => prev.map(p => p.id === item.id ? item : p));
      alert('Erro ao atualizar aprovação de produção no servidor.');
    }
  };

  // Carregar produtos com a EXATA mesma formulação química quando o 1º produto da batelada é selecionado
  useEffect(() => {
    const mainCode = scheduleSelectedProducts[0]?.codigo;
    if (!mainCode) {
      setSameFormulaProducts([]);
      return;
    }
    let active = true;
    setLoadingSameFormula(true);
    apiFetch(`/producao/produtos-mesma-formulacao/${encodeURIComponent(mainCode)}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (active) setSameFormulaProducts(Array.isArray(data) ? data : []);
        } else {
          if (active) setSameFormulaProducts([]);
        }
      })
      .catch(() => {
        if (active) setSameFormulaProducts([]);
      })
      .finally(() => {
        if (active) setLoadingSameFormula(false);
      });
    return () => { active = false; };
  }, [scheduleSelectedProducts[0]?.codigo]);

  // Abertura do Modal de Lote ERP com busca automática do último lote
  const handleOpenLinkLoteModal = async (item: PlanejamentoItem, batchItems?: PlanejamentoItem[]) => {
    const rawLote = item.lote_erp || '';
    const isProvisional = rawLote.toUpperCase().startsWith('PLAN_') || rawLote.toUpperCase().startsWith('PL-');
    setLinkLoteModalItem({
      item,
      batchItems,
      lote: isProvisional ? '' : rawLote,
      loadingUltimoLote: true,
      ultimoLote: null,
      dataUltimoLote: null,
      quantidadeKgLote: null,
      autoQty: null,
      sugestaoProximo: null,
      origemUltimoLote: null,
    });

    try {
      const res = await apiFetch(`/producao/ultimo-lote?code=${encodeURIComponent(item.codigo_produto)}`);
      if (res.ok) {
        const data = await res.json();
        const ultLoteStr = (data.ultimo_lote || '').toString().trim();
        const isUltProvisional = !ultLoteStr || ultLoteStr.toUpperCase().startsWith('PLAN_') || ultLoteStr.toUpperCase().startsWith('PL-');
        setLinkLoteModalItem(prev => {
          if (!prev || prev.item.id !== item.id) return prev;
          return {
            ...prev,
            loadingUltimoLote: false,
            ultimoLote: isUltProvisional ? null : ultLoteStr,
            dataUltimoLote: isUltProvisional ? null : data.data_ultimo_lote,
            quantidadeKgLote: isUltProvisional ? null : data.quantidade_kg,
            origemUltimoLote: isUltProvisional ? null : data.origem,
          };
        });
      } else {
        setLinkLoteModalItem(prev => prev ? { ...prev, loadingUltimoLote: false } : null);
      }
    } catch (err) {
      console.warn('Erro ao buscar histórico de lotes:', err);
      setLinkLoteModalItem(prev => prev ? { ...prev, loadingUltimoLote: false } : null);
    }
  };

  // Vincular / Atualizar Lote ERP diretamente no Card (aplica para todos os itens da batelada)
  const handleConfirmLinkLote = async () => {
    if (!linkLoteModalItem) return;
    const { item, batchItems, lote, autoQty } = linkLoteModalItem;
    const cleanLote = lote.trim();

    const targets = batchItems && batchItems.length > 1 ? batchItems : [item];
    const updatedTargets: PlanejamentoItem[] = [];

    for (const it of targets) {
      const itQty = (autoQty && autoQty > 0 && targets.length === 1) ? autoQty : it.quantidade_planejada;
      const updated: PlanejamentoItem = {
        ...it,
        lote_erp: cleanLote || undefined,
        quantidade_planejada: itQty,
        ordem_status: cleanLote ? 'aprovado' : it.ordem_status,
      };
      updatedTargets.push(updated);
      await handleSaveItem(updated);
    }

    setPlannedItems(prev => prev.map(p => {
      const match = updatedTargets.find(u => u.id === p.id);
      return match || p;
    }));
    setLinkLoteModalItem(null);
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Editar Quantidade a ser Produzida (Massa em kg)
  const handleConfirmEditQty = async () => {
    if (!editQtyModalItem) return;
    const { item, newQty, batchItems, batchMasses } = editQtyModalItem;
    if (isNaN(newQty) || newQty <= 0) {
      alert("Informe uma quantidade válida em kg (maior que zero).");
      return;
    }

    if (batchItems && batchItems.length > 1) {
      const updatedList: PlanejamentoItem[] = [];
      for (const it of batchItems) {
        const itemQty = batchMasses?.[it.id] !== undefined ? batchMasses[it.id] : it.quantidade_planejada;
        const uW = parseProductUnitWeightKg(it.descricao);
        const estUn = Math.round(itemQty / (uW || 1));
        const updated: PlanejamentoItem = {
          ...it,
          quantidade_planejada: itemQty,
          observacoes: it.observacoes?.replace(/\|\s*[0-9.,]+\s*kg\s*\|\s*~[0-9.,]+\s*un/i, `| ${itemQty} kg | ~${estUn.toLocaleString('pt-BR')} un`),
        };
        updatedList.push(updated);
        await handleSaveItem(updated);
      }
      const updatedMap = new Map(updatedList.map(u => [u.id, u]));
      setPlannedItems(prev => prev.map(p => updatedMap.get(p.id) || p));
    } else {
      const updated: PlanejamentoItem = {
        ...item,
        quantidade_planejada: newQty,
      };
      setPlannedItems(prev => prev.map(p => p.id === item.id ? updated : p));
      await handleSaveItem(updated);
    }

    setEditQtyModalItem(null);
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Abertura rápida do modal para ajustar massas individuais de múltiplos itens da batelada
  const handleOpenBatchMassEditModal = (batchItems: PlanejamentoItem[]) => {
    const masses: Record<string, number> = {};
    batchItems.forEach(it => {
      masses[it.id] = it.quantidade_planejada;
    });
    const sumKg = Number(batchItems.reduce((s, it) => s + (Number(it.quantidade_planejada) || 0), 0).toFixed(1));
    setEditQtyModalItem({
      item: batchItems[0],
      newQty: sumKg,
      batchItems,
      batchMasses: masses,
    });
  };

  // Excluir batelada (remove todos os itens componentes)
  const handleDeleteBatch = async (batchItems: PlanejamentoItem[]) => {
    const msg = batchItems.length > 1
      ? `Deseja remover esta batelada conjunta com ${batchItems.length} itens do planejamento?`
      : `Deseja remover este item do planejamento?`;
    if (!window.confirm(msg)) return;

    const itemIds = new Set(batchItems.map(i => i.id));
    setPlannedItems(prev => {
      const next = prev.filter(i => !itemIds.has(i.id));
      localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(next));
      return next;
    });

    const returnPayload: any[] = [];
    const batchGroupTag = batchItems.length > 1 ? `[batch:BAT_${Date.now()}]` : undefined;
    for (const it of batchItems) {
      try {
        await apiFetch(`/producao/planejamento/${it.id}`, { method: 'DELETE' });
        if (it.ordem_status !== 'concluido') {
          const uW = parseProductUnitWeightKg(it.descricao);
          const estUn = Math.max(1, Math.round((Number(it.quantidade_planejada) || 0) / (uW || 1)));
          returnPayload.push({
            codigoProduto: it.codigo_produto,
            descricao: it.descricao,
            quantidade: estUn,
            unidade: 'un',
            quantidadeKg: Number(it.quantidade_planejada) || 0,
            origemDemanda: 'retorno_pcp',
            baseCodigo: it.base_codigo,
            baseNome: it.base_nome,
            observacoes: batchGroupTag
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
    if (returnPayload.length > 0) {
      try {
        await apiFetch('/producao/fila-demandas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(returnPayload)
        });
        await fetchFila();
      } catch (e) {
        console.warn('Erro ao devolver itens à fila:', e);
      }
    }
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Alternar aprovação de todos os itens da batelada
  const handleToggleBatchAprovacao = async (batchItems: PlanejamentoItem[]) => {
    const allApproved = batchItems.every(i => 
      i.ordem_status === 'aprovado' || (i.fisico_confirmado_massa && i.fisico_confirmado_embalagem && i.fisico_confirmado_rotulo)
    );
    const nextStatus = allApproved ? 'planejado' : 'aprovado';
    const nextConfirmado = !allApproved;

    const updatedItems: PlanejamentoItem[] = [];
    for (const it of batchItems) {
      const updated: PlanejamentoItem = {
        ...it,
        ordem_status: nextStatus,
        fisico_confirmado_massa: nextConfirmado,
        fisico_confirmado_embalagem: nextConfirmado,
        fisico_confirmado_rotulo: nextConfirmado,
      };
      updatedItems.push(updated);
      await handleSaveItem(updated);
    }

    setPlannedItems(prev => {
      const map = new Map(updatedItems.map(u => [u.id, u]));
      return prev.map(p => map.get(p.id) || p);
    });
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Abrir Modal de Configurações da Batelada (Parâmetros)
  const handleOpenTechnicalModal = async (item: PlanejamentoItem, batchItems?: PlanejamentoItem[]) => {
    const isUsingBase = Boolean(
      item.base_codigo ||
      (item.codigo_produto || '').includes('.36.') ||
      (item.descricao || '').toUpperCase().startsWith('BASE ') ||
      (item.descricao || '').toUpperCase().startsWith('PRE BASE ')
    );

    const linkedProd = products.find(p => p.codigo === item.codigo_produto);
    const suggestedBaseCode = item.base_codigo || linkedProd?.base || '';
    const suggestedBaseNome = item.base_nome || linkedProd?.base || '';

    const totalBatchKg = batchItems && batchItems.length > 1
      ? Number(batchItems.reduce((acc, it) => acc + (Number(it.quantidade_planejada) || 0), 0).toFixed(1))
      : item.quantidade_planejada;

    setTechnicalModalItem({
      item,
      batchItems,
      processoTermico: item.processo_termico || 'frio',
      origemFormulacao: isUsingBase ? 'base' : 'completa',
      baseCodigo: suggestedBaseCode,
      baseNome: suggestedBaseNome,
      reatorId: item.reator_id,
      recipienteDetalhe: item.recipiente_detalhe || 'Reator',
      dataPlanejada: item.data_planejada,
      quantidadeKg: totalBatchKg,
      linhaEnvase: item.linha_envase || 'L1',
      loteErp: item.lote_erp || '',
      observacoes: item.observacoes || '',
      loadingUltimoLote: true,
      ultimoLote: null,
      dataUltimoLote: null,
      quantidadeKgLote: null,
      sugestaoProximo: null,
    });

    try {
      const res = await apiFetch(`/producao/ultimo-lote?code=${encodeURIComponent(item.codigo_produto)}`);
      if (res.ok) {
        const data = await res.json();
        setTechnicalModalItem(prev => {
          if (!prev || prev.item.id !== item.id) return prev;
          return {
            ...prev,
            loadingUltimoLote: false,
            ultimoLote: data.ultimo_lote,
            dataUltimoLote: data.data_ultimo_lote,
            quantidadeKgLote: data.quantidade_kg,
          };
        });
      } else {
        setTechnicalModalItem(prev => prev ? { ...prev, loadingUltimoLote: false } : null);
      }
    } catch {
      setTechnicalModalItem(prev => prev ? { ...prev, loadingUltimoLote: false } : null);
    }
  };

  const handleSaveTechnicalModal = async () => {
    if (!technicalModalItem) return;
    const {
      item,
      batchItems,
      processoTermico,
      origemFormulacao,
      baseCodigo,
      baseNome,
      reatorId,
      recipienteDetalhe,
      dataPlanejada,
      quantidadeKg,
      linhaEnvase,
      loteErp,
      observacoes,
    } = technicalModalItem;

    if (isNaN(quantidadeKg) || quantidadeKg <= 0) {
      alert("Informe uma quantidade válida em kg (maior que zero).");
      return;
    }

    const cleanLote = loteErp.trim();
    const targets = batchItems && batchItems.length > 1 ? batchItems : [item];
    const updatedTargets: PlanejamentoItem[] = [];

    for (const it of targets) {
      const itQty = targets.length === 1 ? quantidadeKg : it.quantidade_planejada;
      const updated: PlanejamentoItem = {
        ...it,
        processo_termico: processoTermico,
        base_codigo: origemFormulacao === 'base' ? (baseCodigo.trim() || undefined) : undefined,
        base_nome: origemFormulacao === 'base' ? (baseNome.trim() || undefined) : undefined,
        reator_id: reatorId,
        recipiente_detalhe: reatorId === 'BOMBONAS' ? recipienteDetalhe : (reatorId === 'R_40' ? 'Reator 40kg' : 'Reator'),
        data_planejada: dataPlanejada,
        quantidade_planejada: itQty,
        linha_envase: linhaEnvase,
        lote_erp: cleanLote || undefined,
        observacoes: targets.length === 1 ? (observacoes.trim() || undefined) : it.observacoes,
        ordem_status: cleanLote ? 'aprovado' : it.ordem_status,
      };
      updatedTargets.push(updated);
      await handleSaveItem(updated);
    }

    const targetMap = new Map(updatedTargets.map(u => [u.id, u]));
    setPlannedItems(prev => prev.map(p => targetMap.get(p.id) || p));
    setTechnicalModalItem(null);
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Adicionar e remover produtos da mesma ordem de produção (até 4 produtos por lote)
  const handleAddProductToSchedule = (prod: any) => {
    if (scheduleSelectedProducts.length >= 4) {
      alert("Você pode adicionar no máximo 4 produtos por ordem de produção.");
      return;
    }
    if (scheduleSelectedProducts.some(p => p.codigo === prod.codigo)) {
      return;
    }
    if (scheduleSelectedProducts.length > 0) {
      const isSameFormula = sameFormulaProducts.some(sf => sf.codigo === prod.codigo);
      if (!isSameFormula) {
        alert("Apenas produtos com a exata mesma formulação química (mesmas matérias-primas e proporções) podem ser agendados juntos na mesma batelada.");
        return;
      }
    }
    const nextProds = [...scheduleSelectedProducts, prod];
    setScheduleSelectedProducts(nextProds);

    // Sugerir divisão equitativa inicial do volume total
    const currentTotal = scheduleQty > 0 ? scheduleQty : 100;
    const share = Number((currentTotal / nextProds.length).toFixed(1));
    const nextMasses: Record<string, number> = {};
    nextProds.forEach(p => {
      nextMasses[p.codigo] = share;
    });
    setScheduleItemMasses(nextMasses);
    const sumTotal = Object.values(nextMasses).reduce((a, b) => a + (Number(b) || 0), 0);
    setScheduleQty(Number(sumTotal.toFixed(1)));
  };

  const handleRemoveProductFromSchedule = (codigo: string) => {
    const nextProds = scheduleSelectedProducts.filter(p => p.codigo !== codigo);
    setScheduleSelectedProducts(nextProds);
    const nextMasses = { ...scheduleItemMasses };
    delete nextMasses[codigo];
    setScheduleItemMasses(nextMasses);
    const sumTotal = Object.values(nextMasses).reduce((a, b) => a + (Number(b) || 0), 0);
    setScheduleQty(nextProds.length > 0 ? Number(sumTotal.toFixed(1)) : 100);
  };

  const handleChangeItemMass = (codigo: string, mass: number) => {
    const nextMasses = { ...scheduleItemMasses, [codigo]: mass };
    setScheduleItemMasses(nextMasses);
    const sumTotal = scheduleSelectedProducts.reduce((acc, p) => {
      const val = p.codigo === codigo ? mass : (nextMasses[p.codigo] ?? 0);
      return acc + val;
    }, 0);
    setScheduleQty(Number(sumTotal.toFixed(1)));
  };

  const handleChangeTotalMass = (newTotal: number) => {
    setScheduleQty(newTotal);
    if (scheduleSelectedProducts.length > 0) {
      const share = Number((newTotal / scheduleSelectedProducts.length).toFixed(1));
      const nextMasses: Record<string, number> = {};
      scheduleSelectedProducts.forEach(p => {
        nextMasses[p.codigo] = share;
      });
      setScheduleItemMasses(nextMasses);
    }
  };

  // Abrir Modal de Agendamento com Dimensionamento e Pesquisa / Multilote (até 4 itens)
  const handleOpenScheduleModal = (product: any | null, targetDate?: string, targetReator?: string) => {
    setScheduleModalItem({ product, targetDate, targetReator });
    setScheduleSearch('');

    if (product) {
      if (Array.isArray(product._batchSiblings) && product._batchSiblings.length > 1) {
        setScheduleSelectedProducts(product._batchSiblings);
        const masses: Record<string, number> = {};
        let sumKg = 0;
        for (const s of product._batchSiblings) {
          const pInfo = getProductProcessType(s);
          const kg = Number(s.quantidade_kg) || (pInfo.reqQtyKg <= 50 ? 50 : Math.round(pInfo.reqQtyKg));
          masses[s.codigo] = kg;
          sumKg += kg;
        }
        setScheduleQty(Number(sumKg.toFixed(1)));
        setScheduleItemMasses(masses);
      } else {
        setScheduleSelectedProducts([product]);
        const procInfo = getProductProcessType(product);
        const suggestedMassKg = Number(product.quantidade_kg) || (procInfo.reqQtyKg <= 50 ? 50 : Math.round(procInfo.reqQtyKg));
        setScheduleQty(suggestedMassKg);
        setScheduleItemMasses({ [product.codigo]: suggestedMassKg });
      }
      const procInfo = getProductProcessType(product);
      const suggestedMassKg = Array.isArray(product._batchSiblings) && product._batchSiblings.length > 1
        ? Number(product._totalBatchKg) || 100
        : (Number(product.quantidade_kg) || (procInfo.reqQtyKg <= 50 ? 50 : Math.round(procInfo.reqQtyKg)));

      // Encontra reator compatível com o processo e tamanho
      let matchingReator = reatores.find(r => r.id === targetReator);
      if (!matchingReator) {
        if (procInfo.recipienteSugerido) {
          matchingReator = reatores.find(r => r.id === procInfo.recipienteSugerido && r.ativo);
        }
        if (!matchingReator) {
          matchingReator = reatores.find(r => {
            if (!r.ativo) return false;
            if ((r.id === 'R_1000_SHAMPOO' || r.id === 'R_1000') && !procInfo.isShampoo) return false;
            return r.capacidade_kg >= suggestedMassKg * 0.7 && r.capacidade_kg <= Math.max(suggestedMassKg * 2.2, 100);
          }) || reatores[0];
        }
      }
      
      const reatorId = matchingReator ? matchingReator.id : (suggestedMassKg <= 200 ? 'BOMBONAS' : 'R_500');
      setScheduleReator(reatorId);
      setScheduleDate(targetDate || weekDays[0]?.dateStr || '');

      if (reatorId === 'BOMBONAS') {
        if (suggestedMassKg <= 60) setScheduleRecipienteDetalhe('Bombona 50kg');
        else if (suggestedMassKg <= 120) setScheduleRecipienteDetalhe('Bombona 100kg');
        else setScheduleRecipienteDetalhe('Bombona 200kg');
      } else {
        setScheduleRecipienteDetalhe('Reator');
      }
      
      // Linha de envase sugerida
      const desc = (product.descricao || '').toUpperCase();
      if (desc.includes('MASC') || desc.includes('POTE')) {
        setScheduleEnvaseLine('L2');
      } else if (desc.includes('POMADA') || desc.includes('OLEO') || desc.includes('SERUM')) {
        setScheduleEnvaseLine('L3');
      } else {
        setScheduleEnvaseLine('L1');
      }
    } else {
      setScheduleSelectedProducts([]);
      setScheduleItemMasses({});
      setScheduleQty(100);
      setScheduleReator(targetReator || 'R_100');
      setScheduleDate(targetDate || weekDays[0]?.dateStr || '');
      setScheduleRecipienteDetalhe(targetReator === 'BOMBONAS' ? 'Bombona 100kg' : 'Reator');
      setScheduleEnvaseLine('L1');
    }
  };

  // Reordenar ordens no dia (sequenciamento de cores/envase)
  const handleMoveOrder = async (item: PlanejamentoItem, direction: 'up' | 'down') => {
    const dayItems = plannedItems
      .filter(i => i.data_planejada === item.data_planejada)
      .sort((a, b) => (a.ordem_sequencia || 1) - (b.ordem_sequencia || 1));
    
    const currentIndex = dayItems.findIndex(i => i.id === item.id);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= dayItems.length) return;

    const targetItem = dayItems[targetIndex];
    const currentSeq = item.ordem_sequencia || (currentIndex + 1);
    const targetSeq = targetItem.ordem_sequencia || (targetIndex + 1);

    const updatedItem = { ...item, ordem_sequencia: targetSeq };
    const updatedTarget = { ...targetItem, ordem_sequencia: currentSeq };

    await handleSaveItem(updatedItem);
    await handleSaveItem(updatedTarget);
  };

  // Confirmar Agendamento Manual (suporta até 4 itens com massa individual personalizável)
  const handleConfirmSchedule = async () => {
    if (scheduleSelectedProducts.length === 0) {
      alert("Por favor, selecione ao menos 1 produto para agendar na ordem de produção.");
      return;
    }

    if (isNaN(scheduleQty) || scheduleQty <= 0) {
      alert("Informe uma massa total válida em kg (maior que zero).");
      return;
    }

    // TRAVA 1: Reator 100kg (Resistência) -> Máximo 1 produção por dia
    if (scheduleReator === 'R_100') {
      const existingIn100 = plannedItems.filter(i => i.data_planejada === scheduleDate && i.reator_id === 'R_100');
      if (existingIn100.length >= 1) {
        alert("Limite atingido: O Reator 100kg funciona por resistência e está limitado a no máximo 1 produção por dia! Escolha outro dia ou use uma Bombona de Mistura.");
        return;
      }
    }

    const numItems = scheduleSelectedProducts.length;
    const sameDayItems = plannedItems.filter(i => i.data_planejada === scheduleDate);
    const batchTimestamp = Date.now();
    const batchId = numItems > 1 ? `BATCH_${batchTimestamp}` : '';

    for (let i = 0; i < numItems; i++) {
      const prod = scheduleSelectedProducts[i];
      const procInfo = getProductProcessType(prod);
      const colorInfo = getProductColorInfo(prod);
      const nextSeq = (sameDayItems.length + 1 + i) * 10;
      const itemId = `PLAN_${currentWeekKey}_${scheduleReator}_${scheduleDate}_${prod.codigo}_${batchTimestamp}_${i}`;

      const massPerItem = scheduleItemMasses[prod.codigo] !== undefined && scheduleItemMasses[prod.codigo] > 0
        ? Number(scheduleItemMasses[prod.codigo].toFixed(1))
        : Number((scheduleQty / numItems).toFixed(1));

      const estUnits = Math.round(massPerItem / (procInfo.unitWeightKg || 1));
      const batchObs = numItems > 1 
        ? `Batelada conjunta (${i + 1}/${numItems}) [batch:${batchId}] | ${massPerItem} kg | ~${estUnits.toLocaleString('pt-BR')} un`
        : (procInfo.isQuente 
            ? (scheduleReator === 'BOMBONAS' ? 'Água Quente Caldeira (Bombona)' : (scheduleReator === 'R_100' ? 'Resistência (100kg)' : (scheduleReator === 'R_40' ? 'Reator 40kg (Quente)' : 'Requer Caldeira'))) 
            : 'Processo a Frio') + ` | ~${estUnits.toLocaleString('pt-BR')} un`;

      const newItem: PlanejamentoItem = {
        id: itemId,
        week_key: currentWeekKey,
        data_planejada: scheduleDate,
        reator_id: scheduleReator,
        codigo_produto: prod.codigo,
        descricao: prod.descricao,
        quantidade_planejada: massPerItem,
        unidade: 'kg',
        base_codigo: prod.base || null,
        base_nome: prod.base || null,
        linha_envase: scheduleEnvaseLine,
        observacoes: batchObs,
        ordem_status: 'planejado',
        fisico_confirmado_massa: false,
        fisico_confirmado_embalagem: false,
        fisico_confirmado_rotulo: false,
        recipiente_detalhe: scheduleReator === 'BOMBONAS' ? scheduleRecipienteDetalhe : (scheduleReator === 'R_40' ? 'Reator 40kg' : 'Reator'),
        cor_tag: colorInfo.tag,
        ordem_sequencia: nextSeq,
        processo_termico: procInfo.isQuente ? (scheduleReator === 'BOMBONAS' ? 'agua_caldeira' : (scheduleReator === 'R_100' ? 'resistencia' : (scheduleReator === 'R_40' ? 'quente' : 'caldeira'))) : 'frio',
      };

      await handleSaveItem(newItem);
    }

    // Desinfileirar da Fila Postgres se estava presente
    for (const prod of scheduleSelectedProducts) {
      const code = prod.codigo;
      const fItem = filaDemandas.find((f: any) => (f.codigoProduto || f.codigo_produto) === code || f.id === prod._filaId);
      if (fItem?.id) {
        try {
          await apiFetch(`/producao/fila-demandas/${fItem.id}`, { method: 'DELETE' });
        } catch (e) {
          console.warn('Erro ao remover item da fila:', e);
        }
      }
    }
    fetchFila();

    setScheduleModalItem(null);
    setScheduleSelectedProducts([]);
    setScheduleItemMasses({});
    setScheduleSearch('');
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Disparar Ordem e Gerar Lote ERP oficial
  const handleDispatchOrder = async () => {
    if (!dispatchModalItem) return;
    if (!loteErpInput.trim()) {
      alert("Por favor, digite o número do Lote ERP.");
      return;
    }

    setIsSubmittingDispatch(true);
    try {
      const res = await apiFetch(`/historico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_producao: dispatchModalItem.data_planejada,
          codigo: dispatchModalItem.codigo_produto,
          quantidade: dispatchModalItem.quantidade_planejada,
          observacoes: dispatchModalItem.observacoes || `Planejamento Semanal ${currentWeekKey} - Reator ${dispatchModalItem.reator_id}`,
          lote_erp: loteErpInput.trim()
        })
      });

      if (res.ok) {
        const updated = {
          ...dispatchModalItem,
          ordem_status: 'lote_criado',
          lote_erp: loteErpInput.trim()
        };
        await handleSaveItem(updated);
        setDispatchModalItem(null);
        setLoteErpInput('');
        if (onLaunchSuccess) onLaunchSuccess();
        window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
        onScheduleChanged?.();
        alert(`Ordem liberada com sucesso! Lote ERP: ${loteErpInput}`);
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao gerar lote de produção no ERP.");
      }
    } catch (e) {
      console.error(e);
      alert("Falha de conexão com a API.");
    } finally {
      setIsSubmittingDispatch(false);
    }
  };

  // ==========================================
  // RELATÓRIO DE CONSUMO DE MATÉRIAS-PRIMAS E EMBALAGENS DA SEMANA
  // ==========================================
  const handleOpenMaterialsReport = async () => {
    setMaterialsReportOpen(true);
    setLoadingMaterialsReport(true);

    try {
      // 1. Agrupar produtos planejados na semana e somar massa total por código
      const productBatchMap = new Map<string, { productCode: string; description: string; totalKg: number; totalUnits: number }>();
      for (const item of plannedItems) {
        const code = item.codigo_produto;
        if (!code) continue;
        const kg = Number(item.quantidade_planejada || 0);
        const uWeight = parseProductUnitWeightKg(item.descricao);
        const units = Math.max(1, Math.round(kg / (uWeight || 1.0)));

        const existing = productBatchMap.get(code);
        if (existing) {
          existing.totalKg += kg;
          existing.totalUnits += units;
        } else {
          productBatchMap.set(code, {
            productCode: code,
            description: item.descricao || code,
            totalKg: kg,
            totalUnits: units
          });
        }
      }

      const uniqueProducts = Array.from(productBatchMap.values());
      if (uniqueProducts.length === 0) {
        setMaterialsList([]);
        setLoadingMaterialsReport(false);
        return;
      }

      // 2. Buscar insumos de cada produto em paralelo via /producao/insumos-status/:code?bulk_kg=...&qty=...
      const fetchPromises = uniqueProducts.map(async (prod) => {
        try {
          const cleanCode = encodeURIComponent(prod.productCode.trim());
          const res = await apiFetch(`/producao/insumos-status/${cleanCode}?bulk_kg=${prod.totalKg}&qty=${prod.totalUnits}`);
          if (res.ok) {
            const data = await res.json();
            return { prod, data };
          }
          return null;
        } catch (e) {
          console.warn(`Erro ao buscar insumos de ${prod.productCode}:`, e);
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);

      // 3. Consolidar e somar todos os insumos e embalagens
      const aggregatedMap = new Map<string, InsumoConsumoItem>();

      for (const resItem of results) {
        if (!resItem || !resItem.data || !resItem.data.ingredients) continue;
        const { prod, data } = resItem;

        for (const ing of data.ingredients) {
          const ingCode = (ing.ingredient_code || '').trim();
          if (!ingCode) continue;
          const descUpper = (ing.description || '').toUpperCase();

          // Identificar se é Embalagem ou Matéria-Prima
          const isEmbalagem = 
            ing.category_id === 'cat_emb' ||
            (ing.unit && ing.unit.toUpperCase() === 'UN') ||
            ingCode.startsWith('9.') ||
            ingCode.startsWith('2.') ||
            ingCode.startsWith('3.') ||
            descUpper.startsWith('PT ') ||
            descUpper.startsWith('FR ') ||
            descUpper.startsWith('TP ') ||
            descUpper.startsWith('CX ') ||
            descUpper.startsWith('ROT ') ||
            descUpper.startsWith('ETIQ ') ||
            descUpper.includes('FRASCO') ||
            descUpper.includes('TAMPA') ||
            descUpper.includes('ROTULO') ||
            descUpper.includes('RÓTULO') ||
            descUpper.includes('CAIXA') ||
            descUpper.includes('POTE') ||
            descUpper.includes('VALVULA') ||
            descUpper.includes('VÁLVULA') ||
            descUpper.includes('BISNAGA') ||
            descUpper.includes('CARTUCHO') ||
            descUpper.includes('BICO') ||
            descUpper.includes('SACHE') ||
            descUpper.includes('SACHÊ') ||
            descUpper.includes('ETIQUETA') ||
            descUpper.includes('FITA') ||
            descUpper.includes('PALLET') ||
            descUpper.includes('DISPENSER') ||
            descUpper.includes('PUMP') ||
            descUpper.includes('BORRIFADOR');

          const category: 'materia_prima' | 'embalagem' = isEmbalagem ? 'embalagem' : 'materia_prima';
          const unit = ing.unit ? ing.unit.toUpperCase() : (isEmbalagem ? 'UN' : 'KG');
          const reqQty = Number(ing.total_required || 0);

          const existing = aggregatedMap.get(ingCode);
          if (existing) {
            existing.totalRequired += reqQty;
            existing.productsUsedIn.push({
              productCode: prod.productCode,
              description: prod.description,
              batchKg: prod.totalKg,
              requiredQty: reqQty
            });
            if (ing.purchase_orders && ing.purchase_orders.length > 0) {
              existing.purchaseOrders.push(...ing.purchase_orders);
            }
            if (ing.next_delivery_date && !existing.nextDeliveryDate) {
              existing.nextDeliveryDate = ing.next_delivery_date;
            }
          } else {
            aggregatedMap.set(ingCode, {
              code: ingCode,
              description: ing.description || ingCode,
              category,
              unit,
              totalRequired: reqQty,
              currentStock: Number(ing.current_stock || 0),
              projectedBalance: 0,
              isMissing: false,
              missingQty: 0,
              purchaseOrders: ing.purchase_orders ? [...ing.purchase_orders] : [],
              nextDeliveryDate: ing.next_delivery_date,
              productsUsedIn: [{
                productCode: prod.productCode,
                description: prod.description,
                batchKg: prod.totalKg,
                requiredQty: reqQty
              }]
            });
          }
        }
      }

      // 4. Calcular saldos e faltas
      const consolidatedList: InsumoConsumoItem[] = [];
      for (const item of aggregatedMap.values()) {
        item.projectedBalance = item.currentStock - item.totalRequired;
        item.isMissing = item.projectedBalance < 0;
        item.missingQty = item.isMissing ? Math.abs(item.projectedBalance) : 0;
        consolidatedList.push(item);
      }

      // Ordenar: primeiro os que faltam (maior déficit), depois alfabético
      consolidatedList.sort((a, b) => {
        if (a.isMissing && !b.isMissing) return -1;
        if (!a.isMissing && b.isMissing) return 1;
        if (a.isMissing && b.isMissing) return a.projectedBalance - b.projectedBalance;
        return a.description.localeCompare(b.description);
      });

      setMaterialsList(consolidatedList);
    } catch (err) {
      console.error('Erro ao gerar relatório de materiais:', err);
      alert('Erro ao calcular explosão de materiais. Verifique a conexão com o servidor.');
    } finally {
      setLoadingMaterialsReport(false);
    }
  };

  const handleExportMaterialsExcel = () => {
    if (materialsList.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }

    const mpData = materialsList
      .filter(m => m.category === 'materia_prima')
      .map(m => ({
        'Código': m.code,
        'Descrição': m.description,
        'Unidade': m.unit,
        'Necessidade Semana': Math.round(m.totalRequired * 100) / 100,
        'Estoque Atual': Math.round(m.currentStock * 100) / 100,
        'Saldo Projetado': Math.round(m.projectedBalance * 100) / 100,
        'Situação': m.isMissing ? 'RUPTURA / FALTA' : 'SUFICIENTE',
        'Falta (Comprar)': m.missingQty > 0 ? Math.round(m.missingQty * 100) / 100 : 0,
        'Previsão Chegada': m.nextDeliveryDate || '-',
        'Produtos que Consomem': m.productsUsedIn.map(p => `${p.description} (${p.batchKg}kg)`).join('; ')
      }));

    const embData = materialsList
      .filter(m => m.category === 'embalagem')
      .map(m => ({
        'Código': m.code,
        'Descrição': m.description,
        'Unidade': m.unit,
        'Necessidade Semana': Math.round(m.totalRequired),
        'Estoque Atual': Math.round(m.currentStock),
        'Saldo Projetado': Math.round(m.projectedBalance),
        'Situação': m.isMissing ? 'RUPTURA / FALTA' : 'SUFICIENTE',
        'Falta (Comprar)': m.missingQty > 0 ? Math.round(m.missingQty) : 0,
        'Previsão Chegada': m.nextDeliveryDate || '-',
        'Produtos que Consomem': m.productsUsedIn.map(p => `${p.description} (${p.batchKg}kg)`).join('; ')
      }));

    const wb = XLSX.utils.book_new();
    const wsMp = XLSX.utils.json_to_sheet(mpData);
    const wsEmb = XLSX.utils.json_to_sheet(embData);

    XLSX.utils.book_append_sheet(wb, wsMp, 'Matérias-Primas');
    XLSX.utils.book_append_sheet(wb, wsEmb, 'Embalagens');

    XLSX.writeFile(wb, `Consumo_Materiais_${currentWeekKey}.xlsx`);
  };

  // ==========================================
  // IMPRESSÕES PROFISSIONAIS PARA FÁBRICA (A4)
  // ==========================================

  // 1. IMPRESSÃO DA PROGRAMAÇÃO SEMANAL DE PRODUÇÃO (A4 COMPACTO E DIRETO)
  const handlePrintWeeklyPlan = async () => {
    if (plannedItems.length === 0) {
      alert("Nenhuma batelada agendada nesta semana para imprimir.");
      return;
    }

    const logoUrl = await loadNatumLogoDataUrl();

    // Unidades totais estimadas
    let totalEstimatedUnits = 0;
    for (const item of plannedItems) {
      const isBase = item.codigo_produto.includes('.36.') || (item.descricao || '').toUpperCase().startsWith('BASE ');
      if (!isBase) {
        const uWeight = parseProductUnitWeightKg(item.descricao);
        totalEstimatedUnits += Math.round(item.quantidade_planejada / (uWeight || 1));
      }
    }

    // Gera detalhamento dia a dia
    const daysHtml = weekDays.map(day => {
      const dayItems = plannedItems.filter(i => i.data_planejada === day.dateStr);
      if (dayItems.length === 0 && !day.holiday) {
        return '';
      }

      dayItems.sort((a, b) => {
        const rOrderA = reatores.find(r => r.id === a.reator_id)?.ordem ?? 99;
        const rOrderB = reatores.find(r => r.id === b.reator_id)?.ordem ?? 99;
        if (rOrderA !== rOrderB) return rOrderA - rOrderB;
        return (a.ordem_sequencia || 1) - (b.ordem_sequencia || 1);
      });

      const dayTotalKg = dayItems.reduce((acc, it) => acc + Number(it.quantidade_planejada || 0), 0);

      const itemsRows = dayItems.map(item => {
        const isBase = item.codigo_produto.includes('.36.') || (item.descricao || '').toUpperCase().startsWith('BASE ');
        const uWeight = parseProductUnitWeightKg(item.descricao);
        const yieldText = isBase ? 'Granel' : `${Math.round(item.quantidade_planejada / (uWeight || 1)).toLocaleString('pt-BR')} un`;
        const rawLote = item.lote_erp ? String(item.lote_erp).trim() : '';
        const loteErpDisplay = (rawLote && rawLote !== '-' && rawLote !== '—') ? rawLote : '';

        return `
          <tr>
            <td style="font-family: monospace; font-weight: bold; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${item.codigo_produto}</td>
            <td style="border: 1px solid #cbd5e1; padding: 3px;">
              <strong>${item.descricao || item.codigo_produto}</strong>
              ${isBase ? '<span style="background: #e0f2fe; color: #0369a1; padding: 1px 3px; border-radius: 2px; font-size: 8px; font-weight: bold; margin-left: 3px;">BASE</span>' : ''}
            </td>
            <td style="text-align: right; font-weight: bold; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${Number(item.quantidade_planejada || 0).toLocaleString('pt-BR')} kg</td>
            <td style="text-align: right; font-weight: 600; color: #1e3a8a; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${yieldText}</td>
            <td style="text-align: center; font-family: monospace; font-size: 8.5px; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">
              ${loteErpDisplay}
            </td>
            <td style="text-align: center; border: 1px solid #cbd5e1; padding: 3px; font-size: 10px;">
              [&nbsp;&nbsp;&nbsp;&nbsp;]
            </td>
          </tr>
        `;
      }).join('');

      return `
        <div style="margin-bottom: 8px; page-break-inside: avoid;">
          <div style="background: #18181b; color: white; padding: 3px 6px; display: flex; justify-content: space-between; align-items: center; border-radius: 2px 2px 0 0; font-size: 9px;">
            <span style="font-weight: bold; text-transform: uppercase;">
              ${day.label} (${day.dayNumber}/${currentWeekKey.split('-W')[0]})
              ${day.holiday ? ` <span style="background: #f59e0b; color: #000; padding: 1px 4px; border-radius: 2px; font-size: 7.5px; margin-left: 4px;">FERIADO: ${day.holiday.name}</span>` : ''}
            </span>
            <span style="font-weight: bold;">
              ${dayItems.length} lotes | ${dayTotalKg.toLocaleString('pt-BR')} kg
            </span>
          </div>
          ${dayItems.length === 0 ? `
            <div style="padding: 4px; text-align: center; color: #94a3b8; border: 1px solid #cbd5e1; border-top: none; font-size: 8px;">
              Sem produções agendadas.
            </div>
          ` : `
            <table style="width: 100%; border-collapse: collapse; font-size: 8.5px;">
              <thead>
                <tr style="background: #f8fafc; color: #475569; font-size: 7.5px; text-transform: uppercase;">
                  <th style="width: 75px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: left;">Código</th>
                  <th style="padding: 2px 3px; border: 1px solid #cbd5e1; text-align: left;">Produto / Semi-Acabado</th>
                  <th style="width: 70px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: right;">Massa</th>
                  <th style="width: 80px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: right;">Rendimento</th>
                  <th style="width: 80px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: center;">Lote ERP</th>
                  <th style="width: 45px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: center;">Visto</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          `}
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Programação Semanal de Produção - ${currentWeekKey} - Natum Cosméticos</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 8.5px;
            color: #0f172a;
            margin: 0;
            padding: 4px;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .header-box h1 {
            font-size: 13px;
            font-weight: 800;
            margin: 0;
            color: #0f172a;
            text-transform: uppercase;
          }
          .header-box .sub {
            font-size: 9.5px;
            color: #475569;
            margin-top: 2px;
            font-weight: 600;
          }
          .header-logo {
            max-height: 46px;
            max-width: 140px;
            object-fit: contain;
          }
          .summary-bar {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 3px;
            padding: 4px 8px;
            margin-bottom: 8px;
            font-size: 8.5px;
            display: flex;
            justify-content: flex-start;
            gap: 28px;
            align-items: center;
          }
          .signature-section {
            margin-top: 14px;
            display: flex;
            justify-content: space-between;
            gap: 40px;
            page-break-inside: avoid;
          }
          .sig-box {
            flex: 1;
            border-top: 1px solid #475569;
            text-align: center;
            padding-top: 3px;
            font-size: 8px;
            color: #334155;
          }
          @media print {
            body { padding: 0; }
            button { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="header-logo" />` : ''}
            <div>
              <h1>NATUM COSMÉTICOS · PROGRAMAÇÃO SEMANAL DE PRODUÇÃO</h1>
              <div class="sub">
                PCP & Fabricação · <strong>Semana ${currentWeekKey}</strong> (${weekDays[0].label} ${weekDays[0].dateStr.split('-').slice(1).reverse().join('/')} a ${weekDays[4].label} ${weekDays[4].dateStr.split('-').slice(1).reverse().join('/')})
              </div>
            </div>
          </div>
          <div style="text-align: right; font-size: 8px; color: #64748b; white-space: nowrap;">
            Emissão: ${new Date().toLocaleString('pt-BR')}
          </div>
        </div>

        <div class="summary-bar">
          <span><strong>Volume Total:</strong> ${weekStats.totalKg.toLocaleString('pt-BR')} kg</span>
          <span><strong>Bateladas:</strong> ${weekStats.totalBatches} lotes</span>
          <span><strong>Rendimento Previsto:</strong> ~${totalEstimatedUnits.toLocaleString('pt-BR')} un</span>
        </div>

        ${daysHtml}

        <div class="signature-section">
          <div class="sig-box">
            <strong>Programador PCP</strong><br />
            Data: ____/____/________
          </div>
          <div class="sig-box">
            <strong>Supervisor de Produção / Fabricação</strong><br />
            Data: ____/____/________
          </div>
        </div>
      </body>
      </html>
    `;

    printHtmlViaIframe(html);
  };

  // 2. IMPRESSÃO DO RELATÓRIO CONSOLIDADO DE MATÉRIAS-PRIMAS E EMBALAGENS (A4 RETRATO)
  const handlePrintMaterialsReport = async () => {
    if (materialsList.length === 0) {
      alert("Nenhum dado de materiais carregado para impressão.");
      return;
    }

    const logoUrl = await loadNatumLogoDataUrl();

    const mpItems = materialsList.filter(m => m.category === 'materia_prima');
    const embItems = materialsList.filter(m => m.category === 'embalagem');
    const missingMp = mpItems.filter(m => m.isMissing);
    const missingEmb = embItems.filter(m => m.isMissing);
    const totalMissing = missingMp.length + missingEmb.length;

    const renderTableRows = (items: InsumoConsumoItem[], isMp: boolean) => {
      return items.map(mat => {
        const reqStr = isMp 
          ? `${(Math.round(mat.totalRequired * 100) / 100).toLocaleString('pt-BR')} ${mat.unit}`
          : `${Math.round(mat.totalRequired).toLocaleString('pt-BR')} ${mat.unit}`;
        const stockStr = isMp 
          ? `${(Math.round(mat.currentStock * 100) / 100).toLocaleString('pt-BR')} ${mat.unit}`
          : `${Math.round(mat.currentStock).toLocaleString('pt-BR')} ${mat.unit}`;
        const balStr = isMp 
          ? `${(Math.round(mat.projectedBalance * 100) / 100).toLocaleString('pt-BR')} ${mat.unit}`
          : `${Math.round(mat.projectedBalance).toLocaleString('pt-BR')} ${mat.unit}`;

        const poStr = mat.purchaseOrders && mat.purchaseOrders.length > 0
          ? mat.purchaseOrders.slice(0, 2).map(po => `OC #${po.n_pedido}: ${po.n_pendente || po.n_qtde} ${mat.unit} (${po.d_previsao || 'sem data'})`).join('<br/>')
          : '—';

        const prodsStr = mat.productsUsedIn.length <= 2 
          ? mat.productsUsedIn.map(p => `${p.description} (${p.batchKg}kg)`).join(', ')
          : `${mat.productsUsedIn.length} produtos agendados`;

        return `
          <tr style="background: ${mat.isMissing ? '#fef2f2' : '#ffffff'};">
            <td style="font-family: monospace; font-weight: bold; border: 1px solid #cbd5e1; padding: 4px; font-size: 8.5px;">${mat.code}</td>
            <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 8.5px;">
              <strong>${mat.description}</strong>
            </td>
            <td style="text-align: right; font-weight: bold; border: 1px solid #cbd5e1; padding: 4px; font-size: 8.5px;">${reqStr}</td>
            <td style="text-align: right; border: 1px solid #cbd5e1; padding: 4px; font-size: 8.5px;">${stockStr}</td>
            <td style="text-align: right; font-weight: bold; color: ${mat.isMissing ? '#dc2626' : '#15803d'}; border: 1px solid #cbd5e1; padding: 4px; font-size: 8.5px;">
              ${mat.projectedBalance >= 0 ? '+' : ''}${balStr}
            </td>
            <td style="text-align: center; border: 1px solid #cbd5e1; padding: 4px; font-size: 8.5px;">
              ${mat.isMissing ? `
                <span style="background: #fee2e2; color: #991b1b; padding: 2px 4px; border-radius: 3px; font-weight: bold; font-size: 7.5px; border: 1px solid #fca5a5;">
                  RUPTURA (${isMp ? `${Math.round(mat.missingQty * 10) / 10} kg` : `${Math.round(mat.missingQty)} un`})
                </span>
              ` : `
                <span style="background: #dcfce7; color: #166534; padding: 2px 4px; border-radius: 3px; font-weight: bold; font-size: 7.5px; border: 1px solid #86efac;">
                  OK
                </span>
              `}
            </td>
            <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 7.5px; color: #475569;">${poStr}</td>
            <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 7.5px; color: #64748b;">${prodsStr}</td>
          </tr>
        `;
      }).join('');
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Consumo de Insumos e Embalagens - ${currentWeekKey} - Natum Cosméticos</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            font-size: 9.5px;
            color: #0f172a;
            margin: 0;
            padding: 8px;
            background: #ffffff;
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 6px;
            margin-bottom: 10px;
          }
          .title-area h1 {
            font-size: 14px;
            font-weight: 800;
            margin: 0;
            color: #0f172a;
            text-transform: uppercase;
          }
          .title-area .sub {
            font-size: 10px;
            color: #475569;
            margin-top: 2px;
            font-weight: 600;
          }
          .kpis {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
            margin-bottom: 12px;
          }
          .kpi-card {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 5px 6px;
          }
          .kpi-title {
            font-size: 7.5px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: bold;
          }
          .kpi-val {
            font-size: 12px;
            font-weight: 800;
            color: #0f172a;
            margin-top: 1px;
          }
          .section-title {
            font-size: 10px;
            font-weight: 800;
            color: #1e293b;
            text-transform: uppercase;
            margin: 14px 0 5px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8.5px;
            margin-bottom: 10px;
          }
          th {
            background: #f1f5f9;
            color: #334155;
            padding: 4px;
            border: 1px solid #cbd5e1;
            text-transform: uppercase;
            font-size: 7.5px;
          }
          .signature-box {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            gap: 30px;
            page-break-inside: avoid;
          }
          .sign-line {
            flex: 1;
            border-top: 1px solid #475569;
            text-align: center;
            padding-top: 4px;
            font-size: 8.5px;
            color: #334155;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height: 46px; max-width: 140px; object-fit: contain;" />` : ''}
            <div class="title-area">
              <h1>NATUM COSMÉTICOS · CONSUMO DE MATÉRIAS-PRIMAS E EMBALAGENS</h1>
              <div class="sub">
                Explosão Consolidada de Fórmulas · <strong>Semana ${currentWeekKey}</strong> (${weekDays[0].label} a ${weekDays[4].label})
              </div>
            </div>
          </div>
          <div style="text-align: right; font-size: 8.5px; color: #475569;">
            <div><strong>Emissão:</strong> ${new Date().toLocaleString('pt-BR')}</div>
            <div><strong>Total Bateladas:</strong> ${plannedItems.length} lotes</div>
            <div><strong>Massa Programada:</strong> ${weekStats.totalKg.toLocaleString('pt-BR')} kg</div>
          </div>
        </div>

        <div class="kpis">
          <div class="kpi-card">
            <div class="kpi-title">Matérias-Primas</div>
            <div class="kpi-val">${mpItems.length} insumos</div>
            <div style="font-size: 7.5px; font-weight: bold; margin-top: 1px; color: ${missingMp.length > 0 ? '#dc2626' : '#15803d'};">
              ${missingMp.length > 0 ? `${missingMp.length} em ruptura` : 'Estoque OK'}
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Embalagens & Rótulos</div>
            <div class="kpi-val">${embItems.length} componentes</div>
            <div style="font-size: 7.5px; font-weight: bold; margin-top: 1px; color: ${missingEmb.length > 0 ? '#dc2626' : '#15803d'};">
              ${missingEmb.length > 0 ? `${missingEmb.length} em ruptura` : 'Estoque OK'}
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Massa Granel Total</div>
            <div class="kpi-val">${weekStats.totalKg.toLocaleString('pt-BR')} kg</div>
            <div style="font-size: 7.5px; color: #64748b; margin-top: 1px;">Carga total a pesar</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Status Suprimentos</div>
            <div class="kpi-val" style="color: ${totalMissing > 0 ? '#dc2626' : '#15803d'};">
              ${totalMissing > 0 ? `${totalMissing} Faltas no Galpão` : '100% Suprido'}
            </div>
            <div style="font-size: 7.5px; color: #64748b; margin-top: 1px;">
              ${totalMissing > 0 ? 'Compras urgentes' : 'Liberado p/ pesagem'}
            </div>
          </div>
        </div>

        <!-- TABELA 1: MATÉRIAS-PRIMAS -->
        <div class="section-title">
          <span>1. Matérias-Primas (Pesagem e Granel)</span>
          <span style="font-size: 8px; color: #64748b;">${mpItems.length} insumos</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 75px; text-align: left;">Código</th>
              <th style="text-align: left;">Insumo / Matéria-Prima</th>
              <th style="width: 80px; text-align: right;">Necessidade</th>
              <th style="width: 75px; text-align: right;">Estoque Galpão</th>
              <th style="width: 75px; text-align: right;">Saldo Previsto</th>
              <th style="width: 85px; text-align: center;">Situação</th>
              <th style="width: 140px; text-align: left;">Pedidos de Compra (OC)</th>
              <th style="width: 140px; text-align: left;">Produtos</th>
            </tr>
          </thead>
          <tbody>
            ${renderTableRows(mpItems, true)}
          </tbody>
        </table>

        <!-- TABELA 2: EMBALAGENS E RÓTULOS -->
        <div class="section-title" style="page-break-before: auto;">
          <span>2. Embalagens, Frascos, Potes e Rótulos (Envase)</span>
          <span style="font-size: 8px; color: #64748b;">${embItems.length} itens</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 75px; text-align: left;">Código</th>
              <th style="text-align: left;">Componente / Embalagem</th>
              <th style="width: 80px; text-align: right;">Necessidade</th>
              <th style="width: 75px; text-align: right;">Estoque Galpão</th>
              <th style="width: 75px; text-align: right;">Saldo Previsto</th>
              <th style="width: 85px; text-align: center;">Situação</th>
              <th style="width: 140px; text-align: left;">Pedidos de Compra (OC)</th>
              <th style="width: 140px; text-align: left;">Produtos</th>
            </tr>
          </thead>
          <tbody>
            ${renderTableRows(embItems, false)}
          </tbody>
        </table>

        <div class="signature-box">
          <div class="sign-line">
            <strong>Responsável Almoxarifado / Suprimentos</strong><br />
            Data: ____/____/________
          </div>
          <div class="sign-line">
            <strong>Conferência e Liberação de Pesagem</strong><br />
            Data: ____/____/________
          </div>
        </div>

      </body>
      </html>
    `;

    printHtmlViaIframe(html);
  };
  // HEURÍSTICA APRIMORADA: QUENTE / FRIO / CALDEIRA / SHAMPOOS / BOMBONAS / SEQUENCIAMENTO DE CORES
  const handleRunHeuristic = () => {
    // 1. Coleta apenas itens ATIVOS com necessidade ou programados
    const candidates = demandCandidates.filter(p => {
      const efp = p.estoque_futuro_com_producao ?? p.estoque_futuro ?? 0;
      return efp < 50 || p.is_producao_programada === 1 || p.is_producao_programada === true;
    });

    if (candidates.length === 0) {
      alert("Nenhum produto com necessidade crítica ou programada no filtro atual. Experimente selecionar 'Todas as Linhas'.");
      return;
    }

    // Ordena: primeiro os com maior gravidade de ruptura (menor EFP)
    candidates.sort((a, b) => {
      const efpA = a.estoque_futuro_com_producao ?? a.estoque_futuro ?? 0;
      const efpB = b.estoque_futuro_com_producao ?? b.estoque_futuro ?? 0;
      return efpA - efpB;
    });

    const validDays = weekDays.filter(d => !d.holiday);
    const avoidedHolidaysCount = weekDays.filter(d => d.holiday).length;

    const proposed: PlanejamentoItem[] = [];
    const occupiedSlots = new Set<string>(); // para reatores com 1 slot por dia
    const bombonaSlotsCount: Record<string, number> = {}; // dataStr -> count (suporta até 4 bateladas/dia)
    let groupedBasesCount = 0;
    const daysWithCaldeira = new Set<string>();

    // 2. Agrupamento por Base/Família (reduz lavagens e aproveita tanques)
    const baseGroups: Record<string, any[]> = {};
    const unbasedProducts: any[] = [];

    for (const cand of candidates) {
      if (cand.base && cand.base.trim() !== '') {
        const b = cand.base.trim().toUpperCase();
        if (!baseGroups[b]) baseGroups[b] = [];
        baseGroups[b].push(cand);
      } else {
        unbasedProducts.push(cand);
      }
    }

    const allOrderedCandidates: any[] = [];
    Object.keys(baseGroups).forEach(bKey => {
      const list = baseGroups[bKey];
      if (list.length > 1) groupedBasesCount += list.length;
      allOrderedCandidates.push(...list);
    });
    allOrderedCandidates.push(...unbasedProducts);

    // 3. Distribuição inteligente por Reator com regras Quente/Frio, Shampoos e Bombonas
    for (const prod of allOrderedCandidates) {
      const procInfo = getProductProcessType(prod);
      const colorInfo = getProductColorInfo(prod);
      const reqMassKg = procInfo.reqQtyKg;
      const reqUnits = procInfo.reqUnits;

      // Linha de envase sugerida
      const desc = (prod.descricao || '').toUpperCase();
      let envLine = 'L1';
      if (desc.includes('MASC') || desc.includes('POTE')) envLine = 'L2';
      else if (desc.includes('POMADA') || desc.includes('OLEO') || desc.includes('SERUM')) envLine = 'L3';

      let scheduled = false;

      // CENÁRIO A: Shampoos de Grande Volume (>= 450kg) ou bases de shampoo agrupadas -> Reator 1000kg (Exclusivo Shampoos)
      if (procInfo.isShampoo && reqMassKg >= 450) {
        const rShampoo = reatores.find(r => (r.id === 'R_1000_SHAMPOO' || r.id === 'R_1000') && r.ativo);
        if (rShampoo) {
          for (const day of validDays) {
            const slotKey = `${rShampoo.id}_${day.dateStr}`;
            if (!occupiedSlots.has(slotKey)) {
              occupiedSlots.add(slotKey);
              daysWithCaldeira.add(day.dateStr);

              const plannedUnits = Math.round(1000 / procInfo.unitWeightKg);

              proposed.push({
                id: `HEUR_${currentWeekKey}_${rShampoo.id}_${day.dateStr}_${prod.codigo}`,
                week_key: currentWeekKey,
                data_planejada: day.dateStr,
                reator_id: rShampoo.id,
                codigo_produto: prod.codigo,
                descricao: prod.descricao,
                quantidade_planejada: 1000,
                unidade: 'kg',
                base_codigo: prod.base || null,
                base_nome: prod.base || null,
                linha_envase: envLine,
                observacoes: `Reator 1.000kg (Exclusivo Shampoos) | ~${plannedUnits.toLocaleString('pt-BR')} un`,
                ordem_status: 'planejado',
                fisico_confirmado_massa: false,
                fisico_confirmado_embalagem: false,
                fisico_confirmado_rotulo: false,
                recipiente_detalhe: 'Reator 1000kg',
                cor_tag: colorInfo.tag,
                ordem_sequencia: 1,
                processo_termico: 'frio'
              });
              scheduled = true;
              break;
            }
          }
        }
      }

      if (scheduled) continue;

      // CENÁRIO B0: Produções Quentes Pequenas (<= 45kg) -> Prioridade no Reator 40kg (Produção Quente)
      if (procInfo.isQuente && reqMassKg <= 45) {
        const r40 = reatores.find(r => r.id === 'R_40' && r.ativo);
        if (r40) {
          for (const day of validDays) {
            const slotKey = `${r40.id}_${day.dateStr}`;
            if (!occupiedSlots.has(slotKey)) {
              occupiedSlots.add(slotKey);
              daysWithCaldeira.add(day.dateStr);

              const plannedKg = Math.min(40, Math.max(reqMassKg, 20));
              const plannedUnits = Math.round(plannedKg / procInfo.unitWeightKg);

              proposed.push({
                id: `HEUR_${currentWeekKey}_${r40.id}_${day.dateStr}_${prod.codigo}`,
                week_key: currentWeekKey,
                data_planejada: day.dateStr,
                reator_id: r40.id,
                codigo_produto: prod.codigo,
                descricao: prod.descricao,
                quantidade_planejada: plannedKg,
                unidade: 'kg',
                base_codigo: prod.base || null,
                base_nome: prod.base || null,
                linha_envase: envLine,
                observacoes: `Reator 40kg (Produção Quente) | ~${plannedUnits.toLocaleString('pt-BR')} un`,
                ordem_status: 'planejado',
                fisico_confirmado_massa: false,
                fisico_confirmado_embalagem: false,
                fisico_confirmado_rotulo: false,
                recipiente_detalhe: 'Reator 40kg',
                cor_tag: colorInfo.tag,
                ordem_sequencia: 1,
                processo_termico: 'quente'
              });
              scheduled = true;
              break;
            }
          }
        }
      }

      if (scheduled) continue;

      // CENÁRIO B: Máscaras quentes pequenas (<= 150kg) batidas na bombona com água da caldeira!
      // Regra: Aproveita caldeira já ligada ou agrupa na bombona
      if (procInfo.isQuente && reqMassKg <= 150 && procInfo.canBombona) {
        const bombonaReator = reatores.find(r => r.id === 'BOMBONAS' && r.ativo);
        if (bombonaReator) {
          const sortedDays = [...validDays].sort((a, b) => {
            const aHasCaldeira = daysWithCaldeira.has(a.dateStr) ? 0 : 1;
            const bHasCaldeira = daysWithCaldeira.has(b.dateStr) ? 0 : 1;
            return aHasCaldeira - bHasCaldeira;
          });

          for (const day of sortedDays) {
            const currentDayBombonas = bombonaSlotsCount[day.dateStr] || 0;
            if (currentDayBombonas < 4) {
              bombonaSlotsCount[day.dateStr] = currentDayBombonas + 1;
              daysWithCaldeira.add(day.dateStr);

              const bombonaCap = reqMassKg <= 60 ? 50 : (reqMassKg <= 120 ? 100 : 200);
              const recip = `Bombona ${bombonaCap}kg`;
              const plannedKg = Math.max(bombonaCap, Math.round(reqMassKg));
              const plannedUnits = Math.round(plannedKg / procInfo.unitWeightKg);

              proposed.push({
                id: `HEUR_${currentWeekKey}_BOMBONAS_${day.dateStr}_${prod.codigo}`,
                week_key: currentWeekKey,
                data_planejada: day.dateStr,
                reator_id: 'BOMBONAS',
                codigo_produto: prod.codigo,
                descricao: prod.descricao,
                quantidade_planejada: plannedKg,
                unidade: 'kg',
                base_codigo: prod.base || null,
                base_nome: prod.base || null,
                linha_envase: envLine,
                observacoes: `Água Quente Caldeira (Bombona) | ~${plannedUnits.toLocaleString('pt-BR')} un`,
                ordem_status: 'planejado',
                fisico_confirmado_massa: false,
                fisico_confirmado_embalagem: false,
                fisico_confirmado_rotulo: false,
                recipiente_detalhe: recip,
                cor_tag: colorInfo.tag,
                ordem_sequencia: 1,
                processo_termico: 'agua_caldeira'
              });
              scheduled = true;
              break;
            }
          }
        }
      }

      if (scheduled) continue;

      // CENÁRIO C: Produtos a frio de base pronta (Condicionador / Leave-in / Shampoos <= 200kg)
      if (!procInfo.isQuente && procInfo.canBombona && reqMassKg <= 200) {
        const bombonaReator = reatores.find(r => r.id === 'BOMBONAS' && r.ativo);
        if (bombonaReator) {
          for (const day of validDays) {
            const currentDayBombonas = bombonaSlotsCount[day.dateStr] || 0;
            if (currentDayBombonas < 4) {
              bombonaSlotsCount[day.dateStr] = currentDayBombonas + 1;
              const bombonaCap = reqMassKg <= 60 ? 50 : (reqMassKg <= 120 ? 100 : 200);
              const recip = `Bombona ${bombonaCap}kg`;
              const plannedKg = Math.max(bombonaCap, Math.round(reqMassKg));
              const plannedUnits = Math.round(plannedKg / procInfo.unitWeightKg);

              proposed.push({
                id: `HEUR_${currentWeekKey}_BOMBONAS_${day.dateStr}_${prod.codigo}`,
                week_key: currentWeekKey,
                data_planejada: day.dateStr,
                reator_id: 'BOMBONAS',
                codigo_produto: prod.codigo,
                descricao: prod.descricao,
                quantidade_planejada: plannedKg,
                unidade: 'kg',
                base_codigo: prod.base || null,
                base_nome: prod.base || null,
                linha_envase: envLine,
                observacoes: `Mistura a Frio (Base Pronta) | ~${plannedUnits.toLocaleString('pt-BR')} un`,
                ordem_status: 'planejado',
                fisico_confirmado_massa: false,
                fisico_confirmado_embalagem: false,
                fisico_confirmado_rotulo: false,
                recipiente_detalhe: recip,
                cor_tag: colorInfo.tag,
                ordem_sequencia: 1,
                processo_termico: 'frio'
              });
              scheduled = true;
              break;
            }
          }
        }
      }

      if (scheduled) continue;

      // CENÁRIO D: Alocação nos Reatores Fixos (R_1000_MISTO, R_500, R_200, R_100)
      const compatibleReatores = reatores.filter(r => {
        if (!r.ativo) return false;
        if (r.id === 'BOMBONAS') return false;
        if (r.id === 'R_1000_SHAMPOO' || r.id === 'R_1000') return false; // Exclusivo de shampoo (já alocado no cenário A)

        // R_1000_MISTO (caldeira - produção mista de grande porte)
        if (r.id === 'R_1000_MISTO') {
          return reqMassKg >= 600;
        }

        // R_500 (caldeira)
        if (r.id === 'R_500') {
          return reqMassKg >= 250 && reqMassKg <= 700;
        }

        // R_200 (caldeira)
        if (r.id === 'R_200') {
          return reqMassKg >= 120 && reqMassKg <= 300;
        }

        // R_100 usa resistência (apenas 1 por dia)
        if (r.id === 'R_100') {
          return reqMassKg >= 60 && reqMassKg <= 140;
        }

        // R_40 (Produção Quente de pequeno porte)
        if (r.id === 'R_40') {
          return procInfo.isQuente && reqMassKg <= 50;
        }

        return false;
      });

      // Ordena pelo reator mais próximo do tamanho
      compatibleReatores.sort((a, b) => Math.abs(a.capacidade_kg - reqMassKg) - Math.abs(b.capacidade_kg - reqMassKg));

      for (const reator of compatibleReatores) {
        for (const day of validDays) {
          const slotKey = `${reator.id}_${day.dateStr}`;

          // Se for R_100, valida trava rígida de 1 por dia
          if (reator.id === 'R_100') {
            const countIn100 = proposed.filter(p => p.data_planejada === day.dateStr && p.reator_id === 'R_100').length;
            if (countIn100 >= 1) continue;
          }

          if (!occupiedSlots.has(slotKey)) {
            occupiedSlots.add(slotKey);

            if (procInfo.isQuente) {
              daysWithCaldeira.add(day.dateStr);
            }

            const plannedQty = Math.min(reator.capacidade_kg, Math.max(reqMassKg, Math.round(reator.capacidade_kg * 0.8)));
            const plannedUnits = Math.round(plannedQty / procInfo.unitWeightKg);

            proposed.push({
              id: `HEUR_${currentWeekKey}_${reator.id}_${day.dateStr}_${prod.codigo}`,
              week_key: currentWeekKey,
              data_planejada: day.dateStr,
              reator_id: reator.id,
              codigo_produto: prod.codigo,
              descricao: prod.descricao,
              quantidade_planejada: plannedQty,
              unidade: 'kg',
              base_codigo: prod.base || null,
              base_nome: prod.base || null,
              linha_envase: envLine,
              observacoes: (procInfo.isQuente 
                ? (reator.id === 'R_100' ? 'Resistência (100kg - Máx 1/dia)' : (reator.id === 'R_40' ? 'Reator 40kg (Quente)' : 'Requer Caldeira (Quente)')) 
                : 'Processo a Frio') + ` | ~${plannedUnits.toLocaleString('pt-BR')} un`,
              ordem_status: 'planejado',
              fisico_confirmado_massa: false,
              fisico_confirmado_embalagem: false,
              fisico_confirmado_rotulo: false,
              recipiente_detalhe: `Reator ${reator.capacidade_kg}kg`,
              cor_tag: colorInfo.tag,
              ordem_sequencia: 1,
              processo_termico: procInfo.isQuente ? (reator.id === 'R_100' ? 'resistencia' : (reator.id === 'R_40' ? 'quente' : 'caldeira')) : 'frio'
            });
            scheduled = true;
            break;
          }
        }
        if (scheduled) break;
      }
    }

    // 4. SEQUENCIAMENTO DE CORES NO DIA:
    // Organiza para cada dia na ordem de processo fabril:
    // 1 (Branco/Neutro - Primeiro) -> 2 (Blond/Matizador) -> 3 (Black/Escuro) -> 4 (Vermelho/Marsala - SEMPRE POR ÚLTIMO!)
    const dayGroups: Record<string, PlanejamentoItem[]> = {};
    for (const item of proposed) {
      if (!dayGroups[item.data_planejada]) dayGroups[item.data_planejada] = [];
      dayGroups[item.data_planejada].push(item);
    }

    Object.keys(dayGroups).forEach(dStr => {
      const items = dayGroups[dStr];
      items.sort((a, b) => {
        const prodA = products.find(p => p.codigo === a.codigo_produto);
        const prodB = products.find(p => p.codigo === b.codigo_produto);
        const prioA = prodA ? getProductColorInfo(prodA).orderPriority : 1;
        const prioB = prodB ? getProductColorInfo(prodB).orderPriority : 1;
        return prioA - prioB;
      });
      // Atribui a ordem sequencial correta
      items.forEach((it, idx) => {
        it.ordem_sequencia = idx + 1;
      });
    });

    const totalKg = proposed.reduce((acc, i) => acc + Number(i.quantidade_planejada || 0), 0);
    setHeuristicProposal(proposed);
    setHeuristicStats({
      totalBatches: proposed.length,
      totalKg,
      groupedBases: groupedBasesCount,
      avoidedHolidays: avoidedHolidaysCount,
      caldeiraDays: daysWithCaldeira.size
    });
    setHeuristicModalOpen(true);
  };

  // Aplicar proposta da Heurística
  const handleApplyHeuristic = async () => {
    try {
      await apiFetch('/producao/planejamento-semanal/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(heuristicProposal)
      });
      setPlannedItems(heuristicProposal);
      localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(heuristicProposal));
      setHeuristicModalOpen(false);
      alert("Planejamento Semanal otimizado aplicado com sucesso!");
    } catch (e) {
      console.warn('Erro ao salvar bulk no servidor, gravando localmente:', e);
      setPlannedItems(heuristicProposal);
      localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(heuristicProposal));
      setHeuristicModalOpen(false);
    } finally {
      window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
      onScheduleChanged?.();
    }
  };

  // Agrupar itens de uma célula em bateladas consolidadas (mesmo lote_erp ou batchId compartilhado)
  const groupCellItems = useCallback((items: PlanejamentoItem[]) => {
    const groups: {
      key: string;
      items: PlanejamentoItem[];
      primaryItem: PlanejamentoItem;
      isMulti: boolean;
      totalKg: number;
      isQuente: boolean;
      isAprovado: boolean;
      loteErp?: string;
    }[] = [];

    const processed = new Set<string>();

    for (const item of items) {
      if (processed.has(item.id)) continue;

      const batchMatch = item.observacoes?.match(/\[batch:([^\]]+)\]/i);
      const batchId = batchMatch ? batchMatch[1].trim() : null;
      const loteErp = item.lote_erp?.trim();

      const siblings = items.filter(other => {
        if (other.id === item.id) return true;
        if (batchId) {
          const otherBatch = other.observacoes?.match(/\[batch:([^\]]+)\]/i);
          if (otherBatch && otherBatch[1].trim() === batchId) return true;
        }
        if (loteErp && other.lote_erp?.trim() === loteErp) {
          return true;
        }
        const tsMatch = item.id.match(/_(\d{10,14})_\d+$/);
        const otherTsMatch = other.id.match(/_(\d{10,14})_\d+$/);
        if (tsMatch && otherTsMatch && tsMatch[1] === otherTsMatch[1]) {
          return true;
        }
        return false;
      });

      siblings.forEach(s => processed.add(s.id));

      const totalKg = Number(siblings.reduce((sum, s) => sum + (Number(s.quantidade_planejada) || 0), 0).toFixed(1));
      const isQuente = siblings.some(s => 
        s.processo_termico === 'resistencia' || 
        s.processo_termico === 'agua_caldeira' || 
        s.processo_termico === 'caldeira' ||
        s.processo_termico === 'quente' ||
        s.reator_id === 'R_40' || 
        s.recipiente_detalhe === 'Reator 40kg' || 
        (s.observacoes || '').includes('Caldeira')
      );
      const isAprovado = siblings.every(s => 
        s.ordem_status === 'aprovado' || 
        (s.fisico_confirmado_massa && s.fisico_confirmado_embalagem && s.fisico_confirmado_rotulo) ||
        isPastEndOfDay(s.data_planejada)
      );

      groups.push({
        key: batchId || (loteErp ? `LOTE_${loteErp}` : item.id),
        items: siblings,
        primaryItem: siblings[0],
        isMulti: siblings.length > 1,
        totalKg,
        isQuente,
        isAprovado,
        loteErp: siblings.find(s => s.lote_erp)?.lote_erp,
      });
    }

    return groups;
  }, []);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* BARRA SUPERIOR DE COMANDOS */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-zinc-200 shadow-xs">
        {/* Navegação Semanal */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 hover:bg-white rounded-md text-zinc-650 hover:text-zinc-900 transition-colors"
              title="Semana Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-white rounded-md transition-colors"
            >
              Semana Atual
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1.5 hover:bg-white rounded-md text-zinc-650 hover:text-zinc-900 transition-colors"
              title="Próxima Semana"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-900 font-mono font-bold text-xs">
            <CalendarClock size={14} className="text-zinc-600" />
            <span>Semana {currentWeekKey.split('-W')[1]} ({weekDays[0].dateStr.split('-').slice(1).reverse().join('/')} a {weekDays[4].dateStr.split('-').slice(1).reverse().join('/')})</span>
          </div>

          <button
            onClick={() => { fetchPlanejamento(); fetchFila(); }}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
            title="Atualizar Planejamento"
          >
            <RefreshCw size={15} className={loadingPlan ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Métricas Compactas da Semana (font-mono) */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
            <span className="text-zinc-500 font-sans">Ordens:</span>
            <strong className="text-zinc-900 font-bold">{weekStats.totalBatches}</strong>
          </div>
          <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
            <span className="text-zinc-500 font-sans">Massa:</span>
            <strong className="text-zinc-900 font-bold">{weekStats.totalKg.toLocaleString('pt-BR')} kg</strong>
          </div>
          <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
            <span className="text-zinc-500 font-sans">Caldeira:</span>
            <strong className="text-zinc-800 font-bold">{weekStats.caldeiraItems}</strong>
          </div>
          <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
            <span className="text-zinc-500 font-sans">Ocupação:</span>
            <strong className={`font-bold ${weekStats.occupancyRate > 90 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {weekStats.occupancyRate}%
            </strong>
          </div>
        </div>

        {/* Hierarquia de Ações (HSL Zinc) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setDemandBankOpen(!demandBankOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              demandBankOpen
                ? 'bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-900 shadow-2xs'
                : 'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 shadow-2xs'
            }`}
          >
            <Package size={14} />
            <span>Banco de Demandas / Na Fila</span>
            <span className={`font-mono px-1.5 py-0.2 rounded text-[10px] ${
              demandBankOpen ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-800'
            }`}>
              {filaDemandas.length}
            </span>
          </button>

          <button
            onClick={() => handleOpenScheduleModal(null, weekDays[0]?.dateStr, reatores[0]?.id || 'R_500')}
            className="bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Agendar nova batelada ou ordem conjunta"
          >
            <Plus size={14} className="text-zinc-600" />
            <span>+ Agendar / Ordem Conjunta</span>
          </button>

          <button
            onClick={handleRunHeuristic}
            className="bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Sugerir sequência otimizada de produção para a semana"
          >
            <Sparkles size={14} className="text-zinc-500" />
            <span>Sugerir Sequência</span>
          </button>

          <button
            onClick={handleOpenMaterialsReport}
            className="bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Relatório consolidado de matérias-primas e embalagens necessárias na semana planejada"
          >
            <Boxes size={14} className="text-zinc-500" />
            <span>Insumos da Semana</span>
          </button>

          <button
            onClick={handlePrintWeeklyPlan}
            className="p-1.5 bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded-lg transition-colors cursor-pointer"
            title="Imprimir Programação Semanal de Produção em formato A4"
          >
            <Printer size={15} />
          </button>

          <button
            onClick={() => setReatoresModalOpen(true)}
            className="p-1.5 bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded-lg transition-colors cursor-pointer"
            title="Configurar Reatores e Capacidades"
          >
            <Settings size={15} />
          </button>

          <button
            onClick={handleClearWeek}
            disabled={plannedItems.length === 0}
            className={`p-1.5 rounded-lg border transition-colors ${
              plannedItems.length > 0 
                ? 'bg-white border-zinc-200 text-zinc-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 cursor-pointer' 
                : 'bg-zinc-50 text-zinc-300 border-zinc-200 cursor-not-allowed'
            }`}
            title="Limpar todas as ordens de produção agendadas para esta semana"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* ÁREA PRINCIPAL: GRADE DE REATORES + GAVETA LATERAL DE DEMANDAS */}
      <div className="flex gap-4 items-start w-full">
        {/* GRADE MATRIZ: REATORES (LINHAS) x SEGUNDA A SEXTA (COLUNAS) */}
        <div className="flex-1 bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-zinc-900 text-white border-b border-zinc-800">
                  <th className="p-3 w-56 font-bold text-zinc-200 border-r border-zinc-800">
                    REATOR / CAPACIDADE
                  </th>
                  {weekDays.map(day => {
                    const isToday = day.dateStr === new Date().toISOString().split('T')[0];
                    return (
                    <th key={day.dateStr} className={`p-3 font-bold border-r border-zinc-800 min-w-[200px] ${
                      day.holiday ? 'bg-amber-950/60 text-amber-200' : isToday ? 'bg-zinc-800 border-b-2 border-b-emerald-400 text-white' : 'text-zinc-100'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span>{day.label} ({day.dayNumber})</span>
                        {day.holiday && (
                          <span className="text-[10px] bg-amber-200/80 text-amber-950 px-1.5 py-0.5 rounded font-normal" title={day.holiday.name}>
                            Feriado
                          </span>
                        )}
                      </div>
                      {day.holiday && (
                        <div className="text-[10px] text-amber-300 font-normal truncate mt-0.5" title={day.holiday.name}>
                          {day.holiday.name}
                        </div>
                      )}
                    </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {reatores.filter(r => r.ativo).map(reator => (
                  <tr key={reator.id} className="hover:bg-zinc-50/40 transition-colors">
                    {/* Linha do Reator / Bombonas */}
                    <td className="p-3 font-semibold text-zinc-800 border-r border-zinc-200 bg-zinc-50/50 align-top w-56">
                      <div className="flex items-start gap-1.5">
                        {reator.id === 'BOMBONAS' ? (
                          <Package size={16} className="text-zinc-500 mt-0.5" title="Bombonas Móveis de Mistura" />
                        ) : reator.id === 'R_100' ? (
                          <Zap size={16} className="text-zinc-500 mt-0.5" title="Aquecimento por Resistência (Máx 1/dia)" />
                        ) : reator.id === 'R_40' ? (
                          <Flame size={16} className="text-zinc-500 mt-0.5" title="Reator 40kg (Produção Quente)" />
                        ) : (reator.id === 'R_1000_SHAMPOO' || reator.id === 'R_1000') ? (
                          <Snowflake size={16} className="text-zinc-500 mt-0.5" title="Exclusivo Shampoos" />
                        ) : reator.id === 'R_1000_MISTO' ? (
                          <Boxes size={16} className="text-zinc-500 mt-0.5" title="Caldeira - Produção Mista" />
                        ) : reator.tipo === 'quente' ? (
                          <Flame size={16} className="text-zinc-500 mt-0.5" title="Requer Caldeira" />
                        ) : (
                          <Boxes size={16} className="text-zinc-500 mt-0.5" title="Caldeira / Misto" />
                        )}
                        <div className="flex flex-col">
                          <span className="font-bold text-zinc-900 text-xs leading-tight">{reator.nome}</span>
                          <span className="text-[10px] text-zinc-500 mt-0.5">
                            {reator.id === 'BOMBONAS' ? '50kg, 100kg e 200kg' : `Capacidade: ${reator.capacidade_kg} kg`}
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] mt-1.5 flex flex-wrap gap-1">
                        {(reator.id === 'R_1000_SHAMPOO' || reator.id === 'R_1000') && (
                          <span className="px-1.5 py-0.2 rounded font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                            Shampoo (Frio)
                          </span>
                        )}
                        {reator.id === 'R_1000_MISTO' && (
                          <span className="px-1.5 py-0.2 rounded font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                            Produção Mista
                          </span>
                        )}
                        {reator.id === 'R_100' && (
                          <span className="px-1.5 py-0.2 rounded font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Resistência (1/dia)
                          </span>
                        )}
                        {reator.id === 'R_40' && (
                          <span className="px-1.5 py-0.2 rounded font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                            Quente (40kg)
                          </span>
                        )}
                        {reator.id === 'BOMBONAS' && (
                          <span className="px-1.5 py-0.2 rounded font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                            Bombonas Móveis
                          </span>
                        )}
                        {reator.id !== 'R_1000_SHAMPOO' && reator.id !== 'R_1000' && reator.id !== 'R_1000_MISTO' && reator.id !== 'R_100' && reator.id !== 'R_40' && reator.id !== 'BOMBONAS' && (
                          <span className="px-1.5 py-0.2 rounded font-semibold bg-zinc-100 text-zinc-800 border border-zinc-200">
                            Caldeira
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Colunas Segunda a Sexta */}
                    {weekDays.map(day => {
                      const cellKey = `${reator.id}_${day.dateStr}`;
                      const cellItems = matrixItemsMap[cellKey] || [];
                      const isHoliday = !!day.holiday;

                      return (
                        <td 
                          key={day.dateStr} 
                          onDragOver={(e) => {
                            if (isHoliday) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverCell?.reatorId !== reator.id || dragOverCell?.dateStr !== day.dateStr) {
                              setDragOverCell({ reatorId: reator.id, dateStr: day.dateStr });
                            }
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            if (dragOverCell?.reatorId === reator.id && dragOverCell?.dateStr === day.dateStr) {
                              setDragOverCell(null);
                            }
                          }}
                          onDrop={async (e) => {
                            e.preventDefault();
                            setDragOverCell(null);
                            if (isHoliday) return;

                            // 1. Arrastando card de batelada existente (conjunta ou individual)
                            if (draggedBatch && draggedBatch.length > 0) {
                              const isSameLocation = draggedBatch.every(i => i.reator_id === reator.id && i.data_planejada === day.dateStr);
                              if (isSameLocation) {
                                setDraggedBatch(null);
                                setDraggedItem(null);
                                return;
                              }

                              const updatedList: PlanejamentoItem[] = [];

                              for (let idx = 0; idx < draggedBatch.length; idx++) {
                                const it = draggedBatch[idx];
                                let newQty = it.quantidade_planejada;
                                let newRecipiente = it.recipiente_detalhe;

                                if (reator.id === 'BOMBONAS') {
                                  if (!newRecipiente || newRecipiente === 'Reator') {
                                    newRecipiente = newQty <= 50 ? 'Bombona 50kg' : (newQty <= 100 ? 'Bombona 100kg' : 'Bombona 200kg');
                                  }
                                } else {
                                  newRecipiente = 'Reator';
                                }

                                const updated: PlanejamentoItem = {
                                  ...it,
                                  reator_id: reator.id,
                                  data_planejada: day.dateStr,
                                  quantidade_planejada: newQty,
                                  recipiente_detalhe: newRecipiente,
                                  ordem_sequencia: cellItems.length + 1 + idx
                                };
                                updatedList.push(updated);
                                await handleSaveItem(updated);
                              }

                              const updatedIds = new Set(updatedList.map(u => u.id));
                              setPlannedItems(prev => {
                                const next = prev.filter(i => !updatedIds.has(i.id)).concat(updatedList);
                                localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(next));
                                return next;
                              });

                              setDraggedBatch(null);
                              setDraggedItem(null);
                              return;
                            }

                            if (draggedItem) {
                              if (draggedItem.reator_id === reator.id && draggedItem.data_planejada === day.dateStr) {
                                setDraggedItem(null);
                                return;
                              }

                              let newQty = draggedItem.quantidade_planejada;
                              let newRecipiente = draggedItem.recipiente_detalhe;

                              if (reator.id === 'BOMBONAS') {
                                if (!newRecipiente || newRecipiente === 'Reator') {
                                  newRecipiente = newQty <= 50 ? 'Bombona 50kg' : (newQty <= 100 ? 'Bombona 100kg' : 'Bombona 200kg');
                                }
                              } else {
                                newRecipiente = 'Reator';
                              }

                              const updated: PlanejamentoItem = {
                                ...draggedItem,
                                reator_id: reator.id,
                                data_planejada: day.dateStr,
                                quantidade_planejada: newQty,
                                recipiente_detalhe: newRecipiente,
                                ordem_sequencia: cellItems.length + 1
                              };

                              setPlannedItems(prev => {
                                const next = prev.filter(i => i.id !== draggedItem.id).concat(updated);
                                localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(next));
                                return next;
                              });

                              setDraggedItem(null);
                              await handleSaveItem(updated);
                              return;
                            }

                            // 2. Arrastando produto novo do Banco de Demandas
                            if (draggedDrawerProduct) {
                              handleOpenScheduleModal(draggedDrawerProduct, day.dateStr, reator.id);
                              setDraggedDrawerProduct(null);
                              return;
                            }
                          }}
                          className={`p-2 border-r border-zinc-200 align-top transition-all relative ${
                            isHoliday ? 'bg-amber-50/30' : ''
                          } ${
                            dragOverCell?.reatorId === reator.id && dragOverCell?.dateStr === day.dateStr
                              ? 'bg-blue-100/70 ring-2 ring-blue-500 ring-inset rounded-sm shadow-inner'
                              : ''
                          }`}
                        >
                          {isHoliday ? (
                            <div className="p-3 bg-amber-50/60 border border-amber-200 border-dashed rounded-lg text-center text-amber-800 text-[11px]">
                              <AlertCircle size={14} className="mx-auto mb-1 text-amber-500" />
                              <span>Feriado Nacional</span>
                              <div className="text-[9px] text-amber-700 mt-0.5 truncate">{day.holiday?.name}</div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2 min-h-[110px]">
                              {groupCellItems(cellItems).map(batch => {
                                return (
                                  <div
                                    key={batch.key}
                                    draggable={true}
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', batch.primaryItem.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                      setDraggedBatch(batch.items);
                                      setDraggedItem(batch.primaryItem);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedBatch(null);
                                      setDraggedItem(null);
                                      setDragOverCell(null);
                                    }}
                                    className={`p-2 rounded-lg border transition-all text-xs flex flex-col gap-1.5 shadow-xs cursor-grab active:cursor-grabbing select-none ${
                                      (draggedBatch?.some(b => b.id === batch.primaryItem.id) || draggedItem?.id === batch.primaryItem.id) ? 'opacity-30 border-dashed border-zinc-400 scale-95' : ''
                                    } ${
                                      batch.isAprovado || batch.loteErp
                                        ? 'bg-white border-zinc-200 border-l-4 border-l-emerald-500 hover:border-zinc-300'
                                        : 'bg-white border-zinc-200 border-l-4 border-l-zinc-400 hover:border-zinc-300'
                                    }`}
                                    title="Arraste para mover para outro dia ou reator"
                                  >
                                    {/* 1. Header: Ícone Térmico Discreto, Nome do Produto / Badge Batelada, Botões de Parâmetros e Lixeira */}
                                    <div className="flex items-start justify-between gap-1">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        {/* Ícone Minimalista de Quente ou Frio */}
                                        {batch.isQuente ? (
                                          <Flame size={12} className="text-orange-500 shrink-0" title="Processo Quente" />
                                        ) : (
                                          <Snowflake size={12} className="text-sky-400 shrink-0" title="Processo Frio" />
                                        )}
                                        {batch.isMulti ? (
                                          <div 
                                            onClick={() => handleOpenTechnicalModal(batch.primaryItem, batch.items)}
                                            className="cursor-pointer flex items-center gap-1"
                                            title="Batelada Conjunta - Clique para configurar parâmetros"
                                          >
                                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 text-[10px] font-bold uppercase tracking-wide border border-zinc-300 font-mono">
                                              Batelada ({batch.items.length} itens)
                                            </span>
                                          </div>
                                        ) : (
                                          <span 
                                            onClick={() => handleOpenTechnicalModal(batch.primaryItem)}
                                            className="font-bold text-zinc-900 text-xs leading-tight line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors" 
                                            title="Clique para configurar parâmetros (Processo, Reator, Lote)"
                                          >
                                            {batch.primaryItem.descricao || batch.primaryItem.codigo_produto}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-0.5 shrink-0 ml-1">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenTechnicalModal(batch.primaryItem, batch.items)}
                                          className="p-1 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded cursor-pointer transition-colors"
                                          title="Configurar Parâmetros"
                                        >
                                          <Settings size={12} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteBatch(batch.items)}
                                          className="p-1 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded cursor-pointer ml-0.5"
                                          title="Remover do Planejamento"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* 2. Se for multi-produto, lista os itens com código, descrição e kg individual */}
                                    {batch.isMulti && (
                                      <div className="space-y-1 pl-1.5 border-l-2 border-zinc-300 my-0.5">
                                        {batch.items.map((it) => {
                                          const uW = parseProductUnitWeightKg(it.descricao);
                                          const estUn = Math.round(it.quantidade_planejada / (uW || 1));
                                          return (
                                            <div key={it.id} className="text-[11px] leading-tight">
                                              <div className="font-bold text-zinc-800 line-clamp-1" title={it.descricao}>
                                                {it.descricao || it.codigo_produto}
                                              </div>
                                              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                                                <span>{it.codigo_produto}</span>
                                                <span><strong className="text-zinc-700">{it.quantidade_planejada} kg</strong> (~{estUn.toLocaleString('pt-BR')} un)</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* 3. Métricas: Massa Total (kg) e Rendimento Previsto */}
                                    {(() => {
                                      const isBase = (batch.primaryItem.codigo_produto || '').includes('.36.') || 
                                        (batch.primaryItem.descricao || '').toUpperCase().startsWith('BASE ') || 
                                        (batch.primaryItem.descricao || '').toUpperCase().startsWith('PRE BASE ') ||
                                        batch.primaryItem.codigo_produto === '8.11.002' ||
                                        batch.primaryItem.codigo_produto === '8.12.002' ||
                                        batch.primaryItem.codigo_produto === '8.13.001';

                                      return (
                                        <>
                                          <div className="flex items-center justify-between text-[11px] bg-zinc-50 px-2 py-1 rounded border border-zinc-150">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (batch.isMulti) {
                                                  handleOpenBatchMassEditModal(batch.items);
                                                } else {
                                                  setEditQtyModalItem({ item: batch.primaryItem, newQty: batch.primaryItem.quantidade_planejada });
                                                }
                                              }}
                                              className="flex items-center gap-1 font-bold text-zinc-800 hover:text-blue-700 hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                              title="Clique para editar a massa (kg)"
                                            >
                                              <span className="font-mono font-extrabold text-zinc-900">{batch.totalKg} kg</span>
                                              <Edit3 size={10} className="text-zinc-400 hover:text-blue-600" />
                                            </button>
                                            <span className="text-zinc-500 font-medium text-[11px]">
                                              {batch.isMulti 
                                                ? `${batch.items.length} produtos` 
                                                : (isBase 
                                                    ? 'Base Granel' 
                                                    : (() => {
                                                        const uW = parseProductUnitWeightKg(batch.primaryItem.descricao);
                                                        const yieldUnits = Math.round(batch.primaryItem.quantidade_planejada / (uW || 1));
                                                        return `~${yieldUnits.toLocaleString('pt-BR')} un`;
                                                      })()
                                                  )}
                                            </span>
                                          </div>

                                          {/* 4. Rodapé: Lote ERP e Botão de Aprovação (Apenas Ícone) */}
                                          <div className="flex items-center justify-between text-[10px] pt-0.5">
                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                              {batch.loteErp ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenLinkLoteModal(batch.primaryItem, batch.items);
                                                  }}
                                                  className="font-mono text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 font-bold text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                                                  title="Lote ERP compartilhado vinculado. Clique para editar."
                                                >
                                                  <Tag size={9} className="text-emerald-600" />
                                                  <span>#{batch.loteErp}</span>
                                                </button>
                                              ) : (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenLinkLoteModal(batch.primaryItem, batch.items);
                                                  }}
                                                  className="bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-dashed border-zinc-300 font-medium text-[10px] px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                                                  title="Vincular Lote ERP compartilhado"
                                                >
                                                  <Tag size={9} className="text-zinc-500" />
                                                  <span>+ Vincular Lote</span>
                                                </button>
                                              )}
                                            </div>

                                            {/* Botão de Aprovação: APENAS O ÍCONE (Sem texto) */}
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (batch.isMulti) {
                                                  handleToggleBatchAprovacao(batch.items);
                                                } else {
                                                  handleToggleAprovacao(batch.primaryItem);
                                                }
                                              }}
                                              className={`p-1 rounded cursor-pointer transition-all shadow-xs ${
                                                batch.isAprovado 
                                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                                  : 'bg-zinc-100 hover:bg-emerald-50 text-zinc-400 hover:text-emerald-600 border border-zinc-200'
                                              }`}
                                              title={batch.isAprovado 
                                                ? "Batelada Aprovada (Clique para desaprovar)" 
                                                : "Aprovar Batelada"
                                              }
                                            >
                                              <CheckCircle2 size={13} className={batch.isAprovado ? "text-white" : "text-zinc-400 hover:text-emerald-600"} />
                                            </button>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                );
                              })}

                              {/* Botão de Agendamento Rápido na Célula Vaga */}
                              {cellItems.length === 0 && (
                                <button
                                  onClick={() => {
                                    handleOpenScheduleModal(null, day.dateStr, reator.id);
                                  }}
                                  className="w-full py-6 flex flex-col items-center justify-center gap-1 border border-dashed border-zinc-200 hover:border-zinc-400 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-all cursor-pointer"
                                >
                                  <Plus size={14} />
                                  <span className="text-[10px] font-medium">Agendar</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* GAVETA LATERAL: BANCO DE DEMANDAS (FILA EXCLUSIVA) */}
        {demandBankOpen && (
          <div className="w-[420px] bg-white rounded-xl border border-zinc-200 shadow-xs flex flex-col h-[750px] shrink-0">
            {/* Cabeçalho da Gaveta */}
            <div className="p-3 border-b border-zinc-200 flex flex-col gap-2 bg-zinc-50/70 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Package size={16} className="text-zinc-700" />
                  <h3 className="font-bold text-zinc-900 text-xs">Fila de Demandas</h3>
                </div>
                <span className="px-2 py-0.5 bg-zinc-900 text-white font-bold text-[10px] rounded-full">
                  {demandCandidates.length} itens na fila
                </span>
              </div>

              {/* Campo de Busca */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar REF, descrição ou lote na fila..."
                  value={demandSearch}
                  onChange={(e) => setDemandSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
                />
              </div>
            </div>

            {/* Lista com Scroll e Dados Ricos de PCP */}
            <div className="flex-1 overflow-y-auto p-2 divide-y divide-zinc-100">
              {demandCandidates.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 text-xs">
                  Nenhum item pendente na fila de demandas.
                </div>
              ) : (
                demandCandidates.map(prod => {
                  const efp = prod.estoque_futuro_com_producao ?? prod.estoque_futuro ?? 0;
                  const isCritico = efp < 0 || prod.status === 'critico';
                  const isProgramada = prod.is_producao_programada === 1 || prod.is_producao_programada === true;
                  const isBase = prod.categoria_produto === 'cat_base' || 
                                 prod.status_produto === 'bases' || 
                                 prod.status === 'bases' ||
                                 (prod.codigo || '').includes('.36.') ||
                                 (prod.descricao || '').toUpperCase().startsWith('BASE ') ||
                                 (prod.descricao || '').toUpperCase().startsWith('PRE BASE ');
                  const procInfo = getProductProcessType(prod);
                  const mediaVendas = prod.media_vendas || prod.media_manual || 0;
                  const qtdRecomendada = prod.producao_recomendada || 0;
                  const estoqueFisico = prod.estoque || 0;
                  const pedidosAberto = prod.pedidos_aberto || 0;
                  const coberturaDias = prod.duracao_dias !== undefined && prod.duracao_dias !== null 
                    ? Math.round(prod.duracao_dias) 
                    : null;

                  return (
                    <div 
                      key={prod.codigo} 
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', prod.codigo);
                        e.dataTransfer.effectAllowed = 'copy';
                        setDraggedDrawerProduct(prod);
                      }}
                      onDragEnd={() => {
                        setDraggedDrawerProduct(null);
                        setDragOverCell(null);
                      }}
                      className={`py-2.5 px-2 flex flex-col gap-2 hover:bg-zinc-50 border-b border-zinc-100 transition-colors cursor-grab active:cursor-grabbing select-none ${
                        isBase ? 'bg-amber-50/20' : ''
                      }`}
                      title="Arraste este produto para uma célula do quadro para agendar"
                    >
                      {/* 1. Descrição e Código com visualização de detalhes */}
                      <div className="flex items-start justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onShowDetails?.(prod.codigo);
                          }}
                          className="font-bold text-zinc-900 text-xs leading-snug line-clamp-2 text-left hover:underline hover:text-zinc-700 cursor-pointer bg-transparent border-none p-0"
                          title={`Ver detalhes de ${prod.descricao}`}
                        >
                          {prod.descricao}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onShowDetails?.(prod.codigo);
                          }}
                          className="font-mono text-[10px] text-zinc-600 font-semibold bg-zinc-100 hover:bg-zinc-200 hover:text-zinc-900 px-1 py-0.5 rounded shrink-0 cursor-pointer transition-colors"
                          title={`Ver detalhes do produto ${prod.codigo}`}
                        >
                          {prod.codigo}
                        </button>
                      </div>

                      {/* 2. Badges Relevantes (Batelada Conjunta, Base de Fabricação, Programada) */}
                      {((Array.isArray((prod as any)._batchSiblings) && (prod as any)._batchSiblings.length > 1) || isBase || isProgramada || prod.base) && (
                        <div className="flex flex-wrap items-center gap-1 text-[10px]">
                          {Array.isArray((prod as any)._batchSiblings) && (prod as any)._batchSiblings.length > 1 && (
                            <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-800 border border-zinc-300 font-mono text-[9px] font-bold rounded">
                              Batelada Conjunta Sugerida ({(prod as any)._batchSiblings.length} SKUs • {(prod as any)._totalBatchKg} kg)
                            </span>
                          )}

                          {isBase && (
                            <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-800 border border-zinc-300 text-[9px] font-bold rounded">
                              Base de Fabricação
                            </span>
                          )}

                          {isProgramada && (
                            <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-800 border border-zinc-200 text-[9px] font-bold rounded">
                              Programada
                            </span>
                          )}

                          {prod.base && (
                            <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-700 border border-zinc-200 text-[9px] rounded truncate max-w-[140px]" title={`Base: ${prod.base}`}>
                              Base: {prod.base}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 3. Painel de Métricas de Venda & Produção Solicitadas por Edson */}
                      <div className="grid grid-cols-3 gap-1.5 bg-zinc-50/90 p-2 rounded-lg border border-zinc-200/70 text-[10px]">
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[9px] block">Média Vendas:</span>
                          <span className="font-bold text-zinc-900 text-xs mt-0.5">
                            {isBase ? 'Semi-acabado' : `${Math.round(mediaVendas).toLocaleString('pt-BR')} un/mês`}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[9px] block">Qtd. Recom.:</span>
                          <span className="font-bold text-blue-700 text-xs mt-0.5">
                            {isBase 
                              ? `${(qtdRecomendada || procInfo.reqQtyKg).toLocaleString('pt-BR')} kg`
                              : `${qtdRecomendada.toLocaleString('pt-BR')} un`}
                          </span>
                          {!isBase && (
                            <span className="text-[9px] text-zinc-500 font-semibold" title={`Equivalente a ${procInfo.reqQtyKg} kg em massa a granel`}>
                              (~{procInfo.reqQtyKg} kg)
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-zinc-500 text-[9px] block">{isBase ? 'Estoque Atual:' : 'Estoque Futuro:'}</span>
                          <span className={`font-bold text-xs mt-0.5 ${isCritico && !isBase ? 'text-red-600' : 'text-emerald-700'}`}>
                            {isBase ? `${Math.round(estoqueFisico).toLocaleString('pt-BR')} kg` : `${efp.toLocaleString('pt-BR')} un`}
                          </span>
                        </div>
                      </div>

                      {/* 4. Linha de Apoio: Estoque Físico, Pedidos em Aberto e Cobertura */}
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 px-0.5">
                        <div className="flex items-center gap-1.5">
                          <span>Estoque: <strong className="text-zinc-700">{estoqueFisico.toLocaleString('pt-BR')}</strong></span>
                          <span>•</span>
                          <span>Pedidos: <strong className={pedidosAberto > 0 ? "text-amber-800 font-bold" : "text-zinc-700"}>{pedidosAberto.toLocaleString('pt-BR')}</strong></span>
                          {coberturaDias !== null && (
                            <>
                              <span>•</span>
                              <span>Cobertura: <strong className="text-zinc-700">{coberturaDias}d</strong></span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 5. Ação de Agendamento e Ver Detalhes */}
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
                        {onShowDetails ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onShowDetails(prod.codigo);
                            }}
                            className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer py-1 px-1.5 rounded hover:bg-zinc-100"
                            title="Ver detalhes completos do produto"
                          >
                            <Info size={13} className="text-zinc-500" />
                            <span>Ver Detalhes</span>
                          </button>
                        ) : <div />}
                        <button
                          onClick={() => handleOpenScheduleModal(prod)}
                          className="flex items-center gap-1 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-xs"
                        >
                          <Plus size={13} />
                          <span>Agendar</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: CONFIGURAÇÃO DE REATORES COM TIPO QUENTE / FRIO */}
      {reatoresModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 flex flex-col gap-4 border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-zinc-700" />
                <h3 className="font-bold text-zinc-900 text-sm">Configuração de Reatores da Produção</h3>
              </div>
              <button 
                onClick={() => setReatoresModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              Configure os reatores fabris e o tipo de processo térmico (Quente para caldeira, Frio para agitação simples ou Misto).
            </p>

            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {reatores.map((r, idx) => (
                <div key={r.id} className="flex flex-col gap-2 p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-700">{idx + 1}.</span>
                      <strong className="text-zinc-900">{r.nome}</strong>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <input 
                        type="checkbox"
                        checked={r.ativo}
                        onChange={(e) => {
                          const updated = reatores.map(item => item.id === r.id ? { ...item, ativo: e.target.checked } : item);
                          setReatores(updated);
                        }}
                        className="rounded text-blue-600"
                      />
                      <span className="text-zinc-650">Ativo</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Capacidade (kg):</span>
                      <input
                        type="number"
                        value={r.capacidade_kg}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setReatores(reatores.map(item => item.id === r.id ? { ...item, capacidade_kg: val } : item));
                        }}
                        className="w-full p-1 bg-white border border-zinc-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Processo Térmico:</span>
                      <select
                        value={r.tipo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setReatores(reatores.map(item => item.id === r.id ? { ...item, tipo: val } : item));
                        }}
                        className="w-full p-1 bg-white border border-zinc-300 rounded text-xs font-semibold"
                      >
                        <option value="quente">Quente (Requer Caldeira)</option>
                        <option value="frio">A Frio (Mistura)</option>
                        <option value="misto">Misto (Quente ou Frio)</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
              <button
                onClick={() => setReatoresModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
              >
                Fechar
              </button>
              <button
                onClick={async () => {
                  try {
                    await apiFetch('/producao/reatores', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(reatores)
                    });
                    setReatoresModalOpen(false);
                    alert("Reatores atualizados com sucesso!");
                  } catch (e) {
                    console.error(e);
                    setReatoresModalOpen(false);
                  }
                }}
                className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Reatores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AGENDAR PRODUTO NO REATOR / DIA */}
      {scheduleModalItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-5 flex flex-col gap-4 border border-zinc-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock size={18} className="text-blue-600" />
                <h3 className="font-bold text-zinc-900 text-sm">Agendar Batelada no Quadro</h3>
              </div>
              <button 
                onClick={() => {
                  setScheduleModalItem(null);
                  setScheduleSelectedProducts([]);
                  setScheduleSearch('');
                }}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Barra de Pesquisa de Produtos */}
            <div className="space-y-1.5">
              <label className="font-semibold text-zinc-700 text-xs block">
                {scheduleSelectedProducts.length === 0
                  ? 'Buscar e Selecionar Produto Principal:'
                  : 'Adicionar Produto na Mesma Ordem (Exata Mesma Formulação Química):'}
              </label>
              <div className="relative">
                <div className="flex items-center gap-2 border border-zinc-300 rounded-lg px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                  <Search size={14} className="text-zinc-400 shrink-0" />
                  <input
                    type="text"
                    placeholder={scheduleSelectedProducts.length === 0
                      ? "Digite nome ou código (ex: Creme, Shampoo, 8.11...)"
                      : "Buscar produto da mesma fórmula..."}
                    value={scheduleSearch}
                    onChange={(e) => setScheduleSearch(e.target.value)}
                    className="w-full text-xs bg-transparent focus:outline-none font-medium text-zinc-800"
                    autoFocus={scheduleSelectedProducts.length === 0}
                  />
                  {scheduleSearch && (
                    <button
                      type="button"
                      onClick={() => setScheduleSearch('')}
                      className="text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Dropdown de Resultados da Pesquisa */}
                {scheduleSearch.trim().length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-zinc-200 max-h-56 overflow-y-auto z-50 divide-y divide-zinc-100">
                    {(() => {
                      const term = scheduleSearch.toLowerCase();
                      const sourcePool = scheduleSelectedProducts.length > 0
                        ? products.filter(p => sameFormulaProducts.some(sf => sf.codigo === p.codigo))
                        : products;
                      const results = sourcePool.filter(p => 
                        (p.descricao || '').toLowerCase().includes(term) ||
                        (p.codigo || '').toLowerCase().includes(term)
                      ).slice(0, 10);

                      if (results.length === 0) {
                        return (
                          <div className="p-3 text-center text-xs text-zinc-500">
                            {scheduleSelectedProducts.length > 0
                              ? `Nenhum produto com a exata mesma formulação encontrado para "${scheduleSearch}".`
                              : `Nenhum produto encontrado para "${scheduleSearch}".`}
                          </div>
                        );
                      }

                      return results.map(p => {
                        const isAlreadySelected = scheduleSelectedProducts.some(x => x.codigo === p.codigo);
                        const isLimitReached = scheduleSelectedProducts.length >= 4;

                        return (
                          <div
                            key={p.codigo}
                            className="p-2.5 hover:bg-zinc-50 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-zinc-900 truncate">{p.descricao}</div>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                                <span className="font-mono">{p.codigo}</span>
                                {p.base && <span>• Base: <strong>{p.base}</strong></span>}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isAlreadySelected || isLimitReached}
                              onClick={() => {
                                handleAddProductToSchedule(p);
                                setScheduleSearch('');
                              }}
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold shrink-0 cursor-pointer transition-colors ${
                                isAlreadySelected
                                  ? 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed'
                                  : isLimitReached
                                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                                  : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs'
                              }`}
                            >
                              {isAlreadySelected ? 'Já incluído' : '+ Adicionar'}
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Sugestões Rápidas: Exata Mesma Formulação Química */}
            {scheduleSelectedProducts.length > 0 && scheduleSelectedProducts.length < 4 && (() => {
              const availableCandidates = sameFormulaProducts.filter(sf => 
                !scheduleSelectedProducts.some(sel => sel.codigo === sf.codigo)
              );

              if (availableCandidates.length === 0) {
                return (
                  <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs text-zinc-500 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-zinc-400 shrink-0" />
                    <span>
                      {loadingSameFormula 
                        ? 'Verificando formulações químicas compatíveis...' 
                        : 'Não há outros produtos com a exata mesma formulação química (mesmas matérias-primas e proporções) para agendar em conjunto.'}
                    </span>
                  </div>
                );
              }

              return (
                <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-lg space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900 text-[11px]">
                    <Sparkles size={13} className="text-blue-600" />
                    <span>Exata Mesma Formulação Química ({availableCandidates.length} disponíveis):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableCandidates.slice(0, 6).map(cand => {
                      const fullProd = products.find(p => p.codigo === cand.codigo) || cand;
                      return (
                        <button
                          key={cand.codigo}
                          type="button"
                          onClick={() => handleAddProductToSchedule(fullProd)}
                          className="text-[11px] px-2 py-1 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-md font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          title="Adicionar à batelada conjunta"
                        >
                          <Plus size={12} className="text-blue-600" />
                          <span className="truncate max-w-[200px]">{cand.descricao} ({cand.codigo})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Lista dos Produtos Selecionados na Ordem de Produção */}
            {scheduleSelectedProducts.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-800">
                  <span>Itens na Ordem de Produção ({scheduleSelectedProducts.length}/4):</span>
                  <span className="text-[11px] text-zinc-500 font-normal">
                    {scheduleSelectedProducts.length > 1 ? 'Ajuste os kg individuais de cada um abaixo' : '100% da ordem'}
                  </span>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {scheduleSelectedProducts.map((p) => {
                    const uWeight = parseProductUnitWeightKg(p.descricao);
                    const currentItemKg = scheduleItemMasses[p.codigo] !== undefined 
                      ? scheduleItemMasses[p.codigo] 
                      : Number((scheduleQty / scheduleSelectedProducts.length).toFixed(1));
                    const itemYield = Math.round(currentItemKg / (uWeight || 1));
                    const pct = scheduleQty > 0 ? Math.round((currentItemKg / scheduleQty) * 100) : 0;
                    const procP = getProductProcessType(p);

                    return (
                      <div
                        key={p.codigo}
                        className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-zinc-900 truncate" title={p.descricao}>{p.descricao}</div>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                            <span className="font-mono font-medium">{p.codigo}</span>
                            {p.base && <span>• Base: <strong>{p.base}</strong></span>}
                            <span>• {pct}% da ordem</span>
                            <span className="text-[9px] text-zinc-400">({procP.label})</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-zinc-500 font-medium">Qtd:</label>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={currentItemKg}
                                onChange={(e) => handleChangeItemMass(p.codigo, Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-20 px-2 py-1 text-right font-bold text-xs bg-white border border-zinc-300 rounded-md focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="text-xs font-semibold text-zinc-700">kg</span>
                            </div>
                            <span className="text-[10px] text-blue-700 font-bold mt-0.5">
                              ~{itemYield.toLocaleString('pt-BR')} un
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveProductFromSchedule(p.codigo)}
                            className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors"
                            title="Remover produto da ordem"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-zinc-50 border border-dashed border-zinc-200 rounded-lg text-center text-xs text-zinc-500">
                Digite no campo acima para pesquisar e selecionar o(s) produto(s) da ordem de produção.
              </div>
            )}

            {/* Parâmetros do Agendamento */}
            <div className="flex flex-col gap-3 text-xs pt-1 border-t border-zinc-150">
              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Dia da Semana:</label>
                <select
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs"
                >
                  {weekDays.map(d => (
                    <option key={d.dateStr} value={d.dateStr} disabled={!!d.holiday}>
                      {d.label} ({d.dateStr.split('-').slice(1).reverse().join('/')}) {d.holiday ? `— Feriado: ${d.holiday.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Equipamento / Reator de Produção:</label>
                <select
                  value={scheduleReator}
                  onChange={(e) => {
                    const rId = e.target.value;
                    setScheduleReator(rId);
                    if (rId === 'BOMBONAS') {
                      setScheduleRecipienteDetalhe('Bombona 50kg');
                    } else {
                      setScheduleRecipienteDetalhe('Reator');
                    }
                  }}
                  className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs"
                >
                  {reatores.filter(r => r.ativo).map(r => (
                    <option key={r.id} value={r.id}>
                      {r.nome} ({r.id === 'BOMBONAS' ? '50/100/200 kg' : `${r.capacidade_kg} kg`})
                    </option>
                  ))}
                </select>
              </div>

              {scheduleReator === 'BOMBONAS' && (
                <div>
                  <label className="font-semibold text-zinc-700 block mb-1">Recipiente da Bombona:</label>
                  <select
                    value={scheduleRecipienteDetalhe}
                    onChange={(e) => {
                      setScheduleRecipienteDetalhe(e.target.value);
                    }}
                    className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-800"
                  >
                    <option value="Bombona 50kg">Bombona 50 kg (Mistura rápida a frio)</option>
                    <option value="Bombona 100kg">Bombona 100 kg (Mistura / Água Quente da Caldeira)</option>
                    <option value="Bombona 200kg">Bombona 200 kg (Bases / Água Quente da Caldeira)</option>
                  </select>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-zinc-700">Massa Total da Ordem (kg):</label>
                  {scheduleSelectedProducts.length > 1 && (
                    <span className="text-[10px] text-zinc-500">
                      (Soma automática dos {scheduleSelectedProducts.length} itens)
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  value={scheduleQty}
                  onChange={(e) => handleChangeTotalMass(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs font-bold"
                />
                {scheduleSelectedProducts.length > 1 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-zinc-600">
                    {scheduleSelectedProducts.map(p => {
                      const m = scheduleItemMasses[p.codigo] ?? (scheduleQty / scheduleSelectedProducts.length);
                      return (
                        <span key={p.codigo} className="px-2 py-0.5 bg-zinc-100 rounded text-zinc-700 border border-zinc-200">
                          {p.codigo}: <strong className="text-blue-700">{Number(m).toFixed(1)} kg</strong>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => {
                  setScheduleModalItem(null);
                  setScheduleSelectedProducts([]);
                  setScheduleSearch('');
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={scheduleSelectedProducts.length === 0}
                onClick={handleConfirmSchedule}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg shadow-xs cursor-pointer ${
                  scheduleSelectedProducts.length === 0
                    ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                }`}
              >
                Confirmar Agendamento ({scheduleSelectedProducts.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DISPARAR ORDEM & GERAR LOTE ERP */}
      {dispatchModalItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 flex flex-col gap-4 border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <Play size={18} className="text-emerald-600" />
                <h3 className="font-bold text-zinc-900 text-sm">Liberar Ordem / Gerar Lote ERP</h3>
              </div>
              <button 
                onClick={() => setDispatchModalItem(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-650">
              Ao liberar esta batelada, ela será oficializada no histórico e no chão de fábrica (Pesagem e Envase).
            </p>

            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs flex flex-col gap-1">
              <strong className="text-zinc-900">{dispatchModalItem.descricao}</strong>
              <div className="flex items-center justify-between text-zinc-500 mt-1">
                <span>Data: <strong>{dispatchModalItem.data_planejada}</strong></span>
                <span>Massa: <strong>{dispatchModalItem.quantidade_planejada} kg</strong></span>
              </div>
            </div>

            <div>
              <label className="font-semibold text-zinc-700 block mb-1 text-xs">
                Número do Lote ERP *:
              </label>
              <input
                type="text"
                placeholder="Ex: 260901, 1042..."
                value={loteErpInput}
                onChange={(e) => setLoteErpInput(e.target.value)}
                className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs font-mono font-bold"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
              <button
                onClick={() => setDispatchModalItem(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDispatchOrder}
                disabled={isSubmittingDispatch}
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmittingDispatch ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>Confirmar e Liberar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VINCULAR LOTE ERP DIRETAMENTE NO CARD */}
      {linkLoteModalItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 flex flex-col gap-4 border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <Tag size={18} className="text-blue-600" />
                <h3 className="font-bold text-zinc-900 text-sm">Vincular Lote ERP</h3>
              </div>
              <button 
                onClick={() => setLinkLoteModalItem(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
              <strong className="text-zinc-900 block">{linkLoteModalItem.item.descricao || linkLoteModalItem.item.codigo_produto}</strong>
              <div className="flex items-center justify-between text-zinc-500 mt-1">
                <span>Data: <strong>{linkLoteModalItem.item.data_planejada}</strong></span>
                <span>Massa: <strong>{linkLoteModalItem.item.quantidade_planejada} kg</strong></span>
              </div>
            </div>

            {/* Histórico / Sugestão do Último Lote Adicionado */}
            {linkLoteModalItem.loadingUltimoLote ? (
              <div className="flex items-center gap-2 p-2.5 bg-blue-50/60 border border-blue-150 rounded-lg text-xs text-blue-700">
                <RefreshCw size={13} className="animate-spin text-blue-600 shrink-0" />
                <span>Consultando histórico de lotes no ERP...</span>
              </div>
            ) : linkLoteModalItem.ultimoLote ? (
              <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-lg text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600 text-[11px] font-medium">Último lote registrado:</span>
                  <span className="font-mono font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
                    #{linkLoteModalItem.ultimoLote}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  {linkLoteModalItem.dataUltimoLote && (
                    <span>Data no ERP: <strong>{linkLoteModalItem.dataUltimoLote.split('T')[0].split(' ')[0].split('-').reverse().join('/')}</strong></span>
                  )}
                  {linkLoteModalItem.quantidadeKgLote && (
                    <span className="text-emerald-700 font-bold">Massa no ERP: {linkLoteModalItem.quantidadeKgLote} kg</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-blue-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      const autoMassa = linkLoteModalItem.quantidadeKgLote && linkLoteModalItem.quantidadeKgLote > 0
                        ? linkLoteModalItem.quantidadeKgLote
                        : null;
                      setLinkLoteModalItem({ 
                        ...linkLoteModalItem, 
                        lote: linkLoteModalItem.ultimoLote!,
                        autoQty: autoMassa,
                      });
                    }}
                    className="w-full py-1 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded text-xs font-semibold cursor-pointer transition-colors shadow-2xs text-center"
                  >
                    Usar Lote #{linkLoteModalItem.ultimoLote}
                  </button>
                </div>
                {linkLoteModalItem.autoQty && (
                  <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-800 flex items-center gap-1">
                    <Check size={12} className="text-emerald-600 shrink-0" />
                    <span>Massa ajustada para <strong>{linkLoteModalItem.autoQty} kg</strong> ao salvar o lote.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] text-zinc-500">
                Nenhum lote anterior registrado para este produto.
              </div>
            )}

            <div>
              <label className="font-semibold text-zinc-700 text-xs block mb-1">
                Número do Lote ERP:
              </label>
              <input
                type="text"
                autoFocus
                placeholder="Ex: 261005, L2409 ou use a sugestão..."
                value={linkLoteModalItem.lote}
                onChange={(e) => setLinkLoteModalItem({ ...linkLoteModalItem, lote: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmLinkLote();
                }}
                className="w-full p-2.5 font-mono text-sm border border-zinc-300 rounded-lg bg-white font-bold text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Ao salvar, o lote é sincronizado automaticamente com os quadros de acompanhamento de produção.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => setLinkLoteModalItem(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLinkLote}
                className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Lote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR QUANTIDADE A SER PRODUZIDA (MASSA KG) */}
      {editQtyModalItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 flex flex-col gap-4 border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 size={18} className="text-blue-600" />
                <h3 className="font-bold text-zinc-900 text-sm">Editar Quantidade (Massa)</h3>
              </div>
              <button 
                onClick={() => setEditQtyModalItem(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
              <strong className="text-zinc-900 block">
                {editQtyModalItem.batchItems && editQtyModalItem.batchItems.length > 1
                  ? `Batelada Conjunta (${editQtyModalItem.batchItems.length} produtos)`
                  : (editQtyModalItem.item.descricao || editQtyModalItem.item.codigo_produto)}
              </strong>
              <div className="flex items-center justify-between text-zinc-500 mt-1">
                <span>Data: <strong>{editQtyModalItem.item.data_planejada}</strong></span>
                <span>Equipamento: <strong>{getShortReatorName(editQtyModalItem.item.reator_id, editQtyModalItem.item.recipiente_detalhe, reatores)}</strong></span>
              </div>
            </div>

            {editQtyModalItem.batchItems && editQtyModalItem.batchItems.length > 1 ? (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-zinc-700">Massas Individuais por Produto:</div>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {editQtyModalItem.batchItems.map(it => {
                    const currentVal = editQtyModalItem.batchMasses?.[it.id] ?? it.quantidade_planejada;
                    const uW = parseProductUnitWeightKg(it.descricao);
                    const estUn = Math.round(currentVal / (uW || 1));
                    return (
                      <div key={it.id} className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
                        <div className="font-bold text-zinc-900 truncate mb-1" title={it.descricao}>
                          {it.descricao || it.codigo_produto}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={currentVal || ''}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              const nextMasses = { ...(editQtyModalItem.batchMasses || {}), [it.id]: val };
                              const nextTotal = Object.values(nextMasses).reduce((a, b) => a + (Number(b) || 0), 0);
                              setEditQtyModalItem({
                                ...editQtyModalItem,
                                batchMasses: nextMasses,
                                newQty: Number(nextTotal.toFixed(1))
                              });
                            }}
                            className="w-24 p-1.5 text-xs font-bold border border-zinc-300 rounded bg-white text-zinc-900 focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-zinc-500 font-mono text-[11px]">kg</span>
                          <span className="text-zinc-500 font-medium text-[11px] ml-auto">
                            ~{estUn.toLocaleString('pt-BR')} un
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-800">Massa Total da Batelada:</span>
                  <span className="font-mono font-extrabold text-sm text-zinc-900">{editQtyModalItem.newQty} kg</span>
                </div>
              </div>
            ) : (() => {
              const uW = parseProductUnitWeightKg(editQtyModalItem.item.descricao);
              const isB = (editQtyModalItem.item.codigo_produto || '').includes('.36.') || (editQtyModalItem.item.descricao || '').toUpperCase().startsWith('BASE ');
              const projectedUnits = Math.round(editQtyModalItem.newQty / (uW || 1));

              return (
                <div>
                  <label className="font-semibold text-zinc-700 text-xs block mb-1">
                    Massa a ser Produzida (kg):
                  </label>
                  <input
                    type="number"
                    autoFocus
                    min={1}
                    value={editQtyModalItem.newQty || ''}
                    onChange={(e) => setEditQtyModalItem({ ...editQtyModalItem, newQty: Number(e.target.value) })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmEditQty();
                    }}
                    className="w-full p-2.5 text-sm font-bold border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-600">
                    <span>Rendimento Projetado:</span>
                    <strong className="text-emerald-700 font-bold text-xs">
                      {isB ? 'Base Granel' : `~${projectedUnits.toLocaleString('pt-BR')} un`}
                    </strong>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => setEditQtyModalItem(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmEditQty}
                className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Quantidade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURAÇÕES DA BATELADA (PARÂMETROS TÉCNICOS, PROCESSO, EQUIPAMENTO) */}
      {technicalModalItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-5 flex flex-col gap-4 border border-zinc-200 max-h-[90vh] overflow-y-auto">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-blue-600" />
                <div>
                  <h3 className="font-bold text-zinc-900 text-sm">Configurações da Batelada</h3>
                  <span className="text-[11px] text-zinc-500 font-mono">{technicalModalItem.item.codigo_produto}</span>
                </div>
              </div>
              <button 
                onClick={() => setTechnicalModalItem(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Identificação do Produto */}
            <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
              <strong className="text-zinc-900 block text-xs leading-snug">
                {technicalModalItem.item.descricao || technicalModalItem.item.codigo_produto}
              </strong>
            </div>

            {/* 1. Processo Térmico & Aquecimento */}
            <div className="space-y-1.5">
              <label className="font-bold text-zinc-800 text-xs flex items-center gap-1.5">
                <span>Processo Térmico & Aquecimento:</span>
              </label>
              
              {/* Escolha Principal: Frio vs Quente */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setTechnicalModalItem({ 
                    ...technicalModalItem, 
                    processoTermico: 'frio',
                    recipienteDetalhe: technicalModalItem.reatorId === 'BOMBONAS' ? 'Bombona 50kg' : 'Reator'
                  })}
                  className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                    technicalModalItem.processoTermico === 'frio'
                      ? 'bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-200 font-bold'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Snowflake size={16} className="text-blue-500 shrink-0" />
                  <div>
                    <div className="font-bold">A Frio (Mistura)</div>
                    <div className="text-[10px] text-zinc-500 font-normal">Homogeneização direta</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (technicalModalItem.processoTermico === 'frio') {
                      setTechnicalModalItem({ 
                        ...technicalModalItem, 
                        processoTermico: 'caldeira' 
                      });
                    }
                  }}
                  className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                    technicalModalItem.processoTermico !== 'frio'
                      ? 'bg-orange-50 border-orange-400 text-orange-900 ring-2 ring-orange-200 font-bold'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Flame size={16} className="text-orange-500 shrink-0" />
                  <div>
                    <div className="font-bold">A Quente</div>
                    <div className="text-[10px] text-zinc-500 font-normal">Aquecimento / Emulsão</div>
                  </div>
                </button>
              </div>

              {/* Sub-processos térmicos com parametrização automática de equipamento */}
              {technicalModalItem.processoTermico !== 'frio' && (
                <div className="p-2.5 bg-orange-50/50 border border-orange-200 rounded-lg space-y-1.5 mt-2">
                  <span className="text-[11px] font-bold text-orange-950 block">Selecione o Tipo de Processo Quente:</span>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setTechnicalModalItem({
                        ...technicalModalItem,
                        processoTermico: 'agua_caldeira',
                        reatorId: 'BOMBONAS',
                        recipienteDetalhe: 'Bombona 100kg',
                      })}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                        technicalModalItem.processoTermico === 'agua_caldeira' || technicalModalItem.reatorId === 'BOMBONAS'
                          ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold ring-1 ring-amber-300'
                          : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="text-xs font-bold">Bombona (Água Caldeira)</div>
                      <div className="text-[10px] text-zinc-500 font-normal">Usa água aquecida da caldeira</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTechnicalModalItem({
                        ...technicalModalItem,
                        processoTermico: 'resistencia',
                        reatorId: 'R_100',
                        recipienteDetalhe: 'Reator',
                      })}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                        technicalModalItem.processoTermico === 'resistencia' || technicalModalItem.reatorId === 'R_100'
                          ? 'bg-zinc-900 border-zinc-900 text-white font-bold'
                          : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="text-xs font-bold">Tanque Resistência (R-100)</div>
                      <div className="text-[10px] text-zinc-500 font-normal">R-100 aquecimento elétrico</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTechnicalModalItem({
                        ...technicalModalItem,
                        processoTermico: 'quente',
                        reatorId: 'R_40',
                        recipienteDetalhe: 'Reator 40kg',
                      })}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                        technicalModalItem.reatorId === 'R_40'
                          ? 'bg-zinc-900 border-zinc-900 text-white font-bold'
                          : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="text-xs font-bold">Panela 40kg (R-40)</div>
                      <div className="text-[10px] text-zinc-500 font-normal">Produção piloto / pequena</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const defaultReator = reatores.find(r => r.ativo && r.id !== 'BOMBONAS' && r.id !== 'R_40' && r.id !== 'R_100')?.id || 'R_500';
                        setTechnicalModalItem({
                          ...technicalModalItem,
                          processoTermico: 'caldeira',
                          reatorId: (technicalModalItem.reatorId === 'BOMBONAS' || technicalModalItem.reatorId === 'R_40' || technicalModalItem.reatorId === 'R_100') ? defaultReator : technicalModalItem.reatorId,
                          recipienteDetalhe: 'Reator',
                        });
                      }}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                        technicalModalItem.processoTermico === 'caldeira' && technicalModalItem.reatorId !== 'BOMBONAS' && technicalModalItem.reatorId !== 'R_40' && technicalModalItem.reatorId !== 'R_100'
                          ? 'bg-red-100 border-red-400 text-red-950 font-bold ring-1 ring-red-300'
                          : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="text-xs font-bold">Reator Caldeira (Vapor)</div>
                      <div className="text-[10px] text-zinc-500 font-normal">Reatores industriais a vapor</div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Origem da Formulação / Uso de Base */}
            <div className="space-y-1.5 pt-1 border-t border-zinc-150">
              <label className="font-bold text-zinc-800 text-xs">Origem da Formulação:</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setTechnicalModalItem({ ...technicalModalItem, origemFormulacao: 'completa' })}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    technicalModalItem.origemFormulacao === 'completa'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-200 font-bold'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <div className="font-bold">Produção Completa</div>
                  <div className="text-[10px] text-zinc-500 font-normal">Fabricação do zero (Granel)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTechnicalModalItem({ ...technicalModalItem, origemFormulacao: 'base' })}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    technicalModalItem.origemFormulacao === 'base'
                      ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-200 font-bold'
                      : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <div className="font-bold">Usar Base Pronta</div>
                  <div className="text-[10px] text-zinc-500 font-normal">Diluição / Aditivação de base</div>
                </button>
              </div>

              {technicalModalItem.origemFormulacao === 'base' && (
                <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg text-xs space-y-1.5 mt-1">
                  <label className="font-semibold text-amber-950 text-[11px] block">Código / Descrição da Base:</label>
                  <input
                    type="text"
                    placeholder="Ex: BASE MASCARA, 8.11.002..."
                    value={technicalModalItem.baseCodigo}
                    onChange={(e) => setTechnicalModalItem({ 
                      ...technicalModalItem, 
                      baseCodigo: e.target.value,
                      baseNome: e.target.value 
                    })}
                    className="w-full p-2 bg-white border border-amber-300 rounded text-xs font-semibold text-zinc-900"
                  />
                </div>
              )}
            </div>

            {/* 3. Equipamento & Recipiente */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-150 text-xs">
              <div>
                <label className="font-bold text-zinc-800 block mb-1">Equipamento / Reator:</label>
                <select
                  value={technicalModalItem.reatorId}
                  onChange={(e) => {
                    const rId = e.target.value;
                    let recip = technicalModalItem.recipienteDetalhe;
                    if (rId === 'BOMBONAS') recip = 'Bombona 50kg';
                    else if (rId === 'R_40') recip = 'Reator 40kg';
                    else recip = 'Reator';
                    setTechnicalModalItem({
                      ...technicalModalItem,
                      reatorId: rId,
                      recipienteDetalhe: recip,
                    });
                  }}
                  className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs font-medium"
                >
                  {reatores.filter(r => r.ativo).map(r => (
                    <option key={r.id} value={r.id}>
                      {r.nome} ({r.id === 'BOMBONAS' ? '50/100/200 kg' : `${r.capacidade_kg} kg`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-800 block mb-1">Recipiente:</label>
                {technicalModalItem.reatorId === 'BOMBONAS' ? (
                  <select
                    value={technicalModalItem.recipienteDetalhe}
                    onChange={(e) => {
                      setTechnicalModalItem({
                        ...technicalModalItem,
                        recipienteDetalhe: e.target.value,
                      });
                    }}
                    className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs font-semibold text-amber-900"
                  >
                    <option value="Bombona 50kg">Bombona 50 kg</option>
                    <option value="Bombona 100kg">Bombona 100 kg</option>
                    <option value="Bombona 200kg">Bombona 200 kg</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={technicalModalItem.reatorId === 'R_40' ? 'Reator 40kg' : 'Reator'}
                    className="w-full p-2 bg-zinc-100 border border-zinc-200 rounded-lg text-xs text-zinc-600 font-medium"
                  />
                )}
              </div>
            </div>

            {/* 4. Planejamento: Dia, Massa (kg), Quantidade Esperada (~un) */}
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-150 text-xs">
              <div>
                <label className="font-bold text-zinc-800 block mb-1">Dia da Semana:</label>
                <select
                  value={technicalModalItem.dataPlanejada}
                  onChange={(e) => setTechnicalModalItem({ ...technicalModalItem, dataPlanejada: e.target.value })}
                  className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs font-medium"
                >
                  {weekDays.map(d => (
                    <option key={d.dateStr} value={d.dateStr} disabled={!!d.holiday}>
                      {d.label} ({d.dateStr.split('-').slice(1).reverse().join('/')}) {d.holiday ? `— Feriado: ${d.holiday.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-800 block mb-1">Massa (kg):</label>
                <input
                  type="number"
                  min={1}
                  value={technicalModalItem.quantidadeKg || ''}
                  onChange={(e) => setTechnicalModalItem({ ...technicalModalItem, quantidadeKg: Number(e.target.value) })}
                  className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs font-bold text-zinc-900"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-800 block mb-1">Qtd. Esperada (~un):</label>
                {(() => {
                  const uW = parseProductUnitWeightKg(technicalModalItem.item.descricao);
                  const expectedUnits = Math.round((technicalModalItem.quantidadeKg || 0) / (uW || 1));
                  return (
                    <div className="p-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold text-blue-700 flex items-center justify-between">
                      <span>~{expectedUnits.toLocaleString('pt-BR')} un</span>
                      <span className="text-[10px] text-zinc-400 font-normal">
                        ({uW >= 1 ? `${uW} kg` : `${Math.round(uW * 1000)} g`})
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 5. Lote ERP com Data e Autoajuste de Massa */}
            <div className="pt-1 border-t border-zinc-150 text-xs space-y-1.5">
              <label className="font-bold text-zinc-800 block">Lote ERP Oficial:</label>
              {technicalModalItem.loadingUltimoLote ? (
                <div className="flex items-center gap-2 p-2 bg-blue-50/60 border border-blue-150 rounded-lg text-[11px] text-blue-700">
                  <RefreshCw size={12} className="animate-spin text-blue-600 shrink-0" />
                  <span>Consultando histórico de lotes no ERP...</span>
                </div>
              ) : technicalModalItem.ultimoLote ? (
                <div className="p-2 bg-blue-50/80 border border-blue-200 rounded-lg text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600">
                      Último Lote: <strong className="text-blue-900 font-mono font-bold">#{technicalModalItem.ultimoLote}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const autoMassa = technicalModalItem.quantidadeKgLote && technicalModalItem.quantidadeKgLote > 0
                          ? technicalModalItem.quantidadeKgLote
                          : technicalModalItem.quantidadeKg;
                        setTechnicalModalItem({
                          ...technicalModalItem,
                          loteErp: technicalModalItem.ultimoLote!,
                          quantidadeKg: autoMassa,
                        });
                      }}
                      className="px-2.5 py-0.5 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded text-[11px] font-semibold cursor-pointer shadow-2xs"
                    >
                      Usar #{technicalModalItem.ultimoLote}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500">
                    {technicalModalItem.dataUltimoLote && (
                      <span>Data no ERP: <strong>{technicalModalItem.dataUltimoLote.split('T')[0].split(' ')[0].split('-').reverse().join('/')}</strong></span>
                    )}
                    {technicalModalItem.quantidadeKgLote && (
                      <span className="text-emerald-700 font-bold">Massa no ERP: {technicalModalItem.quantidadeKgLote} kg</span>
                    )}
                  </div>
                  {technicalModalItem.quantidadeKgLote && technicalModalItem.loteErp === technicalModalItem.ultimoLote && (
                    <div className="text-[10px] text-emerald-700 font-medium pt-0.5">
                      ✓ Quantidade da batelada ajustada para {technicalModalItem.quantidadeKgLote} kg conforme registrado no ERP.
                    </div>
                  )}
                </div>
              ) : null}

              <input
                type="text"
                placeholder="Digite ou selecione o Lote ERP..."
                value={technicalModalItem.loteErp}
                onChange={(e) => setTechnicalModalItem({ ...technicalModalItem, loteErp: e.target.value })}
                className="w-full p-2 font-mono text-xs font-bold bg-white border border-zinc-300 rounded-lg text-zinc-900"
              />
            </div>

            {/* 6. Observações Técnicas / Instruções */}
            <div className="pt-1 border-t border-zinc-150 text-xs">
              <label className="font-bold text-zinc-800 block mb-1">Observações Técnicas / Instruções:</label>
              <textarea
                rows={2}
                placeholder="Instruções manuais para pesagem ou produção (se houver)..."
                value={technicalModalItem.observacoes}
                onChange={(e) => setTechnicalModalItem({ ...technicalModalItem, observacoes: e.target.value })}
                className="w-full p-2 bg-white border border-zinc-300 rounded-lg text-xs resize-none"
              />
            </div>

            {/* Rodapé com Botões */}
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => setTechnicalModalItem(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTechnicalModal}
                className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Salvar Configurações</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PROPOSTA DA HEURÍSTICA AUTOMÁTICA */}
      {heuristicModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-5 flex flex-col gap-4 border border-zinc-200 max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-yellow-500" />
                <h3 className="font-bold text-zinc-900 text-sm">Proposta de Otimização Semanal (Heurística)</h3>
              </div>
              <button 
                onClick={() => setHeuristicModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Resumo da Otimização */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-blue-700 text-[11px] block">Bateladas</span>
                <strong className="text-blue-950 font-bold text-sm">{heuristicStats.totalBatches}</strong>
              </div>
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-emerald-700 text-[11px] block">Massa Total</span>
                <strong className="text-emerald-950 font-bold text-sm">{heuristicStats.totalKg.toLocaleString('pt-BR')} kg</strong>
              </div>
              <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                <span className="text-orange-700 text-[11px] block">Dias de Caldeira</span>
                <strong className="text-orange-950 font-bold text-sm">{heuristicStats.caldeiraDays} dias</strong>
              </div>
              <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg">
                <span className="text-zinc-600 text-[11px] block">Bases Agrupadas</span>
                <strong className="text-zinc-900 font-mono font-bold text-sm">{heuristicStats.groupedBases}</strong>
              </div>
            </div>

            <p className="text-xs text-zinc-500">
              A heurística priorizou apenas produtos ativos, dimensionou os tanques estritamente de acordo com a necessidade (sem superdimensionar) e separou processos que requerem caldeira dos processos a frio.
            </p>

            {/* Tabela com a lista de bateladas sugeridas */}
            <div className="flex-1 overflow-y-auto border border-zinc-200 rounded-lg">
              <table className="w-full text-left text-xs divide-y divide-zinc-200">
                <thead className="bg-zinc-50 font-bold text-zinc-700 sticky top-0">
                  <tr>
                    <th className="p-2.5">Dia</th>
                    <th className="p-2.5">Reator</th>
                    <th className="p-2.5">Produto</th>
                    <th className="p-2.5">Volume</th>
                    <th className="p-2.5">Processo</th>
                    <th className="p-2.5">Envase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {heuristicProposal.map((item, idx) => {
                    const r = reatores.find(x => x.id === item.reator_id);
                    return (
                      <tr key={idx} className="hover:bg-zinc-50/60">
                        <td className="p-2.5 font-semibold text-zinc-800">
                          {item.data_planejada.split('-').slice(1).reverse().join('/')}
                        </td>
                        <td className="p-2.5 text-zinc-700 font-semibold">
                          {r ? r.nome : item.reator_id}
                        </td>
                        <td className="p-2.5 font-bold text-zinc-900 truncate max-w-[200px]" title={item.descricao}>
                          {item.descricao}
                        </td>
                        <td className="p-2.5 font-mono text-zinc-800 font-bold">
                          {item.quantidade_planejada} kg
                        </td>
                        <td className="p-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            (item.observacoes || '').includes('Caldeira') 
                              ? 'bg-zinc-100 text-zinc-800 border border-zinc-200' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {(item.observacoes || '').includes('Caldeira') ? 'Caldeira' : 'A Frio'}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 rounded text-[10px] font-semibold">
                            {item.linha_envase}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
              <button
                onClick={() => setHeuristicModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
              >
                Descartar
              </button>
              <button
                onClick={handleApplyHeuristic}
                className="px-4 py-1.5 text-xs font-semibold bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check size={14} />
                <span>Aplicar no Quadro Semanal</span>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* MODAL: RELATÓRIO DE CONSUMO DE MATÉRIAS-PRIMAS E EMBALAGENS */}
      {materialsReportOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[90vh] border border-zinc-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
              <div className="flex items-center gap-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-zinc-900 text-sm">Consumo Semanal de Insumos & Embalagens</h3>
                    <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono text-[10px] font-semibold rounded">
                      {currentWeekKey}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Necessidade de materiais para as {plannedItems.length} ordens de produção programadas ({weekStats.totalKg.toLocaleString('pt-BR')} kg).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintMaterialsReport}
                  disabled={loadingMaterialsReport || materialsList.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-900 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                  title="Imprimir relatório consolidado de insumos e embalagens em folha A4"
                >
                  <Printer size={14} />
                  <span>Imprimir Relatório</span>
                </button>

                <button
                  onClick={handleOpenMaterialsReport}
                  disabled={loadingMaterialsReport}
                  className="p-1.5 hover:bg-zinc-100 text-zinc-600 rounded-lg border border-zinc-200 cursor-pointer transition-colors"
                  title="Recalcular Consumo"
                >
                  <RefreshCw size={14} className={loadingMaterialsReport ? "animate-spin" : ""} />
                </button>

                <button 
                  onClick={() => setMaterialsReportOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg cursor-pointer transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Resumo Métrico */}
            {(() => {
              const mpItems = materialsList.filter(m => m.category === 'materia_prima');
              const embItems = materialsList.filter(m => m.category === 'embalagem');
              const missingMp = mpItems.filter(m => m.isMissing);
              const missingEmb = embItems.filter(m => m.isMissing);
              const totalMissing = missingMp.length + missingEmb.length;

              return (
                <div className="grid grid-cols-4 gap-2.5 p-3 bg-zinc-50/50 border-b border-zinc-200 text-xs">
                  <div className="p-2.5 bg-white border border-zinc-200 rounded-lg">
                    <span className="text-zinc-500 text-[11px] block">Matérias-Primas</span>
                    <strong className="text-zinc-900 text-sm font-bold block">{mpItems.length} itens</strong>
                    <span className={`text-[10px] font-medium mt-0.5 block ${missingMp.length > 0 ? 'text-rose-600 font-semibold' : 'text-zinc-500'}`}>
                      {missingMp.length > 0 ? `${missingMp.length} com déficit` : 'Estoque regular'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white border border-zinc-200 rounded-lg">
                    <span className="text-zinc-500 text-[11px] block">Embalagens</span>
                    <strong className="text-zinc-900 text-sm font-bold block">{embItems.length} itens</strong>
                    <span className={`text-[10px] font-medium mt-0.5 block ${missingEmb.length > 0 ? 'text-rose-600 font-semibold' : 'text-zinc-500'}`}>
                      {missingEmb.length > 0 ? `${missingEmb.length} com déficit` : 'Estoque regular'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white border border-zinc-200 rounded-lg">
                    <span className="text-zinc-500 text-[11px] block">Massa Programada</span>
                    <strong className="text-zinc-900 text-sm font-bold block">{weekStats.totalKg.toLocaleString('pt-BR')} kg</strong>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">em {plannedItems.length} ordens de produção</span>
                  </div>

                  <div className="p-2.5 bg-white border border-zinc-200 rounded-lg">
                    <span className="text-zinc-500 text-[11px] block">Status Geral</span>
                    <strong className={`text-sm font-bold block ${totalMissing > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {totalMissing > 0 ? `${totalMissing} itens com déficit` : '100% Suprido'}
                    </strong>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">
                      {totalMissing > 0 ? 'Requer pedidos de compra' : 'Liberado para pesagem'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Barra de Filtros e Busca */}
            <div className="p-3 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 bg-white">
              {(() => {
                const mpCount = materialsList.filter(m => m.category === 'materia_prima').length;
                const embCount = materialsList.filter(m => m.category === 'embalagem').length;
                const missingCount = materialsList.filter(m => m.isMissing).length;

                return (
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      onClick={() => setMaterialsFilterTab('ALL')}
                      className={`px-3 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                        materialsFilterTab === 'ALL' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      Todos ({materialsList.length})
                    </button>
                    <button
                      onClick={() => setMaterialsFilterTab('FALTAS')}
                      className={`px-3 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                        materialsFilterTab === 'FALTAS' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      Com Déficit ({missingCount})
                    </button>
                    <button
                      onClick={() => setMaterialsFilterTab('MP')}
                      className={`px-3 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                        materialsFilterTab === 'MP' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      Matérias-Primas ({mpCount})
                    </button>
                    <button
                      onClick={() => setMaterialsFilterTab('EMB')}
                      className={`px-3 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                        materialsFilterTab === 'EMB' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      Embalagens ({embCount})
                    </button>
                  </div>
                );
              })()}

              <div className="relative w-64">
                <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filtrar por código ou descrição..."
                  value={materialsSearch}
                  onChange={(e) => setMaterialsSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
                />
              </div>
            </div>

            {/* Conteúdo: Tabela com Scroll */}
            <div className="flex-1 overflow-y-auto">
              {loadingMaterialsReport ? (
                <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-500">
                  <RefreshCw size={24} className="animate-spin text-zinc-600" />
                  <span className="text-xs font-medium">Calculando insumos e consultando estoques...</span>
                </div>
              ) : materialsList.length === 0 ? (
                <div className="py-20 text-center text-zinc-400 text-xs">
                  Nenhum insumo ou embalagem encontrado para as ordens agendadas.
                </div>
              ) : (() => {
                const filtered = materialsList.filter(item => {
                  if (materialsFilterTab === 'FALTAS' && !item.isMissing) return false;
                  if (materialsFilterTab === 'MP' && item.category !== 'materia_prima') return false;
                  if (materialsFilterTab === 'EMB' && item.category !== 'embalagem') return false;
                  if (materialsSearch.trim()) {
                    const q = materialsSearch.toLowerCase().trim();
                    const code = item.code.toLowerCase();
                    const desc = item.description.toLowerCase();
                    if (!code.includes(q) && !desc.includes(q)) return false;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="py-16 text-center text-zinc-400 text-xs">
                      Nenhum item corresponde ao filtro selecionado.
                    </div>
                  );
                }

                return (
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-zinc-100/95 backdrop-blur-xs border-b border-zinc-200 z-10 text-[11px] font-bold text-zinc-700">
                      <tr>
                        <th className="p-2.5">CÓDIGO</th>
                        <th className="p-2.5">DESCRIÇÃO DO MATERIAL</th>
                        <th className="p-2.5 text-center">TIPO</th>
                        <th className="p-2.5 text-right">NECESSIDADE DA SEMANA</th>
                        <th className="p-2.5 text-right">ESTOQUE ATUAL</th>
                        <th className="p-2.5 text-right">SALDO PREVISTO</th>
                        <th className="p-2.5 text-center">SITUAÇÃO</th>
                        <th className="p-2.5">PEDIDOS DE COMPRA (OC)</th>
                        <th className="p-2.5">PRODUTOS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filtered.map(mat => {
                        const isMp = mat.category === 'materia_prima';
                        const reqFormatted = isMp
                          ? `${(Math.round(mat.totalRequired * 100) / 100).toLocaleString('pt-BR')} ${mat.unit}`
                          : `${Math.round(mat.totalRequired).toLocaleString('pt-BR')} ${mat.unit}`;
                        const stockFormatted = isMp
                          ? `${(Math.round(mat.currentStock * 100) / 100).toLocaleString('pt-BR')} ${mat.unit}`
                          : `${Math.round(mat.currentStock).toLocaleString('pt-BR')} ${mat.unit}`;
                        const balanceFormatted = isMp
                          ? `${(Math.round(mat.projectedBalance * 100) / 100).toLocaleString('pt-BR')} ${mat.unit}`
                          : `${Math.round(mat.projectedBalance).toLocaleString('pt-BR')} ${mat.unit}`;

                        return (
                          <tr key={mat.code} className={`hover:bg-zinc-50 transition-colors ${mat.isMissing ? 'bg-rose-50/20' : ''}`}>
                            <td className="p-2.5 font-mono text-[11px] font-semibold text-zinc-900 whitespace-nowrap">
                              {mat.code}
                            </td>
                            <td className="p-2.5">
                              <span className="font-semibold text-zinc-900 block" title={mat.description}>
                                {mat.description}
                              </span>
                            </td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
                                {isMp ? 'MP' : 'EMB'}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-bold text-zinc-900 whitespace-nowrap">
                              {reqFormatted}
                            </td>
                            <td className="p-2.5 text-right text-zinc-700 whitespace-nowrap">
                              {stockFormatted}
                            </td>
                            <td className={`p-2.5 text-right font-bold whitespace-nowrap ${
                              mat.isMissing ? 'text-rose-600' : 'text-emerald-700'
                            }`}>
                              {mat.projectedBalance >= 0 ? `+${balanceFormatted}` : balanceFormatted}
                            </td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              {mat.isMissing ? (
                                <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-medium text-[10px]">
                                  Déficit ({isMp ? `${Math.round(mat.missingQty * 10) / 10} kg` : `${Math.round(mat.missingQty)} un`})
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 rounded font-medium text-[10px]">
                                  Suficiente
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-[11px] text-zinc-600 whitespace-nowrap">
                              {mat.purchaseOrders && mat.purchaseOrders.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {mat.purchaseOrders.slice(0, 2).map((po, idx) => (
                                    <span key={idx} className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[10px] font-medium border border-zinc-200">
                                      OC #{po.n_pedido}: {po.n_pendente || po.n_qtde} {mat.unit} {po.d_previsao ? `(${po.d_previsao})` : ''}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-zinc-400 text-[10px]">-</span>
                              )}
                            </td>
                            <td className="p-2.5 text-[10px] text-zinc-600 max-w-[200px]">
                              <span title={mat.productsUsedIn.map(p => `${p.description}: ${p.batchKg}kg`).join(' | ')}>
                                {mat.productsUsedIn.length === 1 ? (
                                  <span className="truncate block">{mat.productsUsedIn[0].description}</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-700 font-semibold">
                                    {mat.productsUsedIn.length} produtos
                                  </span>
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between text-xs">
              <span className="text-zinc-500">
                Total de <strong>{materialsList.length}</strong> insumos e embalagens mapeados nas fórmulas.
              </span>
              <button
                onClick={() => setMaterialsReportOpen(false)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-900 text-white font-semibold rounded-lg shadow-xs cursor-pointer"
              >
                Fechar Relatório
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScaleIcon(props: any) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m0-18l-8 4m8-4l8 4M4 7l3 6m-3-6l-3 6m14-6l3 6m-3-6l-3 6" />
    </svg>
  );
}
