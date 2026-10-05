import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, CalendarClock, Search, RefreshCw, Printer, Trash2, CheckCircle2, 
  X, AlertTriangle, HelpCircle, Edit3, Database, Play, Check, ArrowRight,
  Clock, ChevronDown, ChevronUp, Package, Truck, Boxes, Sparkles, Settings,
  ShieldCheck, ShieldAlert, Layers, Plus, ChevronLeft, ChevronRight, Filter,
  TrendingDown, CheckCircle, Info, Flame, Snowflake, AlertCircle, ArrowUpDown, Tag,
  FileSpreadsheet, Download, GripVertical, AlertOctagon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../../../geral/lib/http';
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
      shortLabel: '🔴 Red', 
      badgeClass: 'bg-rose-600 text-white font-bold', 
      dotClass: 'bg-rose-600',
      orderPriority: 4 
    };
  }

  // 3. Black / Tons Escuros (orderPriority = 3)
  if (desc.includes('BLACK') || desc.includes('CARVAO') || desc.includes('CARVÃO') || desc.includes('PRETO')) {
    return { 
      tag: 'black', 
      label: 'Black / Escuro (3º da Fila)', 
      shortLabel: '⚫ Black', 
      badgeClass: 'bg-zinc-900 text-zinc-100 font-bold border border-zinc-700', 
      dotClass: 'bg-zinc-900',
      orderPriority: 3 
    };
  }

  // 2. Blond / Matizadores (Silver, Platinum, Violet) (orderPriority = 2)
  if (desc.includes('BLOND') || desc.includes('PLATINUM') || desc.includes('SILVER') || desc.includes('MATIZ') || desc.includes('VIOLET') || desc.includes('BLUE')) {
    return { 
      tag: 'blond', 
      label: 'Blond / Matizador (2º da Fila)', 
      shortLabel: '🟣 Blond', 
      badgeClass: 'bg-purple-600 text-white font-bold', 
      dotClass: 'bg-purple-600',
      orderPriority: 2 
    };
  }

  // 1. Neutro / Branco: SEMPRE O PRIMEIRO (orderPriority = 1)
  return { 
    tag: 'neutro', 
    label: 'Branco / Neutro (1º da Fila)', 
    shortLabel: '⚪ Branco', 
    badgeClass: 'bg-zinc-100 text-zinc-800 font-bold border border-zinc-300', 
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
      label: isBaseShampoo ? '❄️ Base Frio' : (isQuente ? '🔥 Base Quente' : '🧪 Base Granel'),
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
      label: isR40 ? '🔥 Reator 40kg' : 'Caldeira',
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
      label: isR40 ? '🔥 Reator 40kg' : (podeBombona ? '🔥 Bombona (Água Caldeira)' : '🔥 Caldeira'),
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
      label: isR40 ? '🔥 Reator 40kg' : 'Caldeira',
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
  const [demandFilter, setDemandFilter] = useState<'ALL' | 'CRITICOS' | 'PROGRAMADAS' | 'KITS' | 'BASES'>('ALL');
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('ALL');

  // Modais de Ação
  const [scheduleModalItem, setScheduleModalItem] = useState<{
    product: any;
    targetDate?: string;
    targetReator?: string;
  } | null>(null);
  const [scheduleQty, setScheduleQty] = useState<number>(100);
  const [scheduleReator, setScheduleReator] = useState<string>('R_100');
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleEnvaseLine, setScheduleEnvaseLine] = useState<string>('L1');
  const [scheduleRecipienteDetalhe, setScheduleRecipienteDetalhe] = useState<string>('Reator');

  // Modal de Lote ERP / Despacho
  const [dispatchModalItem, setDispatchModalItem] = useState<PlanejamentoItem | null>(null);
  const [loteErpInput, setLoteErpInput] = useState('');
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);

  // Modal para Vincular / Editar Lote ERP diretamente no Card
  const [linkLoteModalItem, setLinkLoteModalItem] = useState<{
    item: PlanejamentoItem;
    lote: string;
    loadingUltimoLote?: boolean;
    ultimoLote?: string | null;
    dataUltimoLote?: string | null;
    sugestaoProximo?: string | null;
    origemUltimoLote?: string | null;
  } | null>(null);

  // Modal para Editar Quantidade Planejada (kg) diretamente no Card
  const [editQtyModalItem, setEditQtyModalItem] = useState<{ item: PlanejamentoItem; newQty: number } | null>(null);

  // Drag and Drop State (Arrastar cards no quadro ou do banco de demandas)
  const [draggedItem, setDraggedItem] = useState<PlanejamentoItem | null>(null);
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
    }
  }, [active, fetchReatores, fetchProducts]);

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

  // Itens elegíveis para o Banco de Demandas
  const demandCandidates = useMemo(() => {
    return products.filter(p => {
      // Filtro de Linha Comercial
      if (selectedLineFilter !== 'ALL' && p.linha_prefix !== selectedLineFilter) {
        return false;
      }

      const isBase = p.categoria_produto === 'cat_base' || 
                     p.status_produto === 'bases' || 
                     p.status === 'bases' ||
                     (p.codigo || '').includes('.36.') ||
                     (p.descricao || '').toUpperCase().startsWith('BASE ') ||
                     (p.descricao || '').toUpperCase().startsWith('PRE BASE ');

      // Filtro de busca textual (permite encontrar qualquer produto do catálogo)
      const hasSearch = !!demandSearch.trim();
      if (hasSearch) {
        const q = demandSearch.toLowerCase().trim();
        const code = (p.codigo || '').toLowerCase();
        const desc = (p.descricao || '').toLowerCase();
        const base = (p.base || '').toLowerCase();
        if (!code.includes(q) && !desc.includes(q) && !base.includes(q)) return false;

        if (demandFilter === 'CRITICOS') {
          const efp = p.estoque_futuro_com_producao ?? p.estoque_futuro ?? 0;
          return efp < 0 || p.status === 'critico' || p.status === 'ordem';
        }
        if (demandFilter === 'PROGRAMADAS') {
          return p.is_producao_programada === 1 || p.is_producao_programada === true;
        }
        if (demandFilter === 'KITS') {
          return p.is_kit || p.is_kit_component === 1 || p.produzir_apenas_kit === 1;
        }
        if (demandFilter === 'BASES') {
          return isBase;
        }
        return true;
      }

      // Sem busca textual: filtra pela aba selecionada
      if (demandFilter === 'CRITICOS') {
        const efp = p.estoque_futuro_com_producao ?? p.estoque_futuro ?? 0;
        return efp < 0 || p.status === 'critico' || p.status === 'ordem';
      }
      if (demandFilter === 'PROGRAMADAS') {
        return p.is_producao_programada === 1 || p.is_producao_programada === true;
      }
      if (demandFilter === 'KITS') {
        return p.is_kit || p.is_kit_component === 1 || p.produzir_apenas_kit === 1;
      }
      if (demandFilter === 'BASES') {
        return isBase;
      }

      // No modo ALL: traz todos os itens ativos (permitindo planejar qualquer item desejado)
      return true;
    }).sort((a, b) => {
      const efpA = a.estoque_futuro_com_producao ?? a.estoque_futuro ?? 0;
      const efpB = b.estoque_futuro_com_producao ?? b.estoque_futuro ?? 0;
      const isDeficitA = efpA < 0 ? 1 : 0;
      const isDeficitB = efpB < 0 ? 1 : 0;
      if (isDeficitA !== isDeficitB) return isDeficitB - isDeficitA;

      const pedA = (a.pedidos_aberto || 0) > 0 ? 1 : 0;
      const pedB = (b.pedidos_aberto || 0) > 0 ? 1 : 0;
      if (pedA !== pedB) return pedB - pedA;

      return efpA - efpB;
    });
  }, [products, selectedLineFilter, demandSearch, demandFilter]);

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
    }
  };

  // Excluir Item do Planejamento
  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Deseja remover esta batelada do planejamento semanal?")) return;
    try {
      await apiFetch(`/producao/planejamento-semanal/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Erro ao deletar no servidor:', e);
    }
    setPlannedItems(prev => {
      const next = prev.filter(i => i.id !== id);
      localStorage.setItem(`plan_semanal_${currentWeekKey}`, JSON.stringify(next));
      return next;
    });
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

  // Abertura do Modal de Lote ERP com busca automática do último lote
  const handleOpenLinkLoteModal = async (item: PlanejamentoItem) => {
    setLinkLoteModalItem({
      item,
      lote: item.lote_erp || '',
      loadingUltimoLote: true,
      ultimoLote: null,
      dataUltimoLote: null,
      sugestaoProximo: null,
      origemUltimoLote: null,
    });

    try {
      const res = await apiFetch(`/producao/ultimo-lote?code=${encodeURIComponent(item.codigo_produto)}`);
      if (res.ok) {
        const data = await res.json();
        setLinkLoteModalItem(prev => {
          if (!prev || prev.item.id !== item.id) return prev;
          return {
            ...prev,
            loadingUltimoLote: false,
            ultimoLote: data.ultimo_lote,
            dataUltimoLote: data.data_ultimo_lote,
            sugestaoProximo: data.sugestao_proximo,
            origemUltimoLote: data.origem,
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

  // Vincular / Atualizar Lote ERP diretamente no Card
  const handleConfirmLinkLote = async () => {
    if (!linkLoteModalItem) return;
    const { item, lote } = linkLoteModalItem;
    const cleanLote = lote.trim();

    const updated: PlanejamentoItem = {
      ...item,
      lote_erp: cleanLote || undefined,
      ordem_status: cleanLote ? 'aprovado' : item.ordem_status,
    };

    setPlannedItems(prev => prev.map(p => p.id === item.id ? updated : p));
    setLinkLoteModalItem(null);
    await handleSaveItem(updated);
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Editar Quantidade a ser Produzida (Massa em kg)
  const handleConfirmEditQty = async () => {
    if (!editQtyModalItem) return;
    const { item, newQty } = editQtyModalItem;
    if (isNaN(newQty) || newQty <= 0) {
      alert("Informe uma quantidade válida em kg (maior que zero).");
      return;
    }

    const updated: PlanejamentoItem = {
      ...item,
      quantidade_planejada: newQty,
    };

    setPlannedItems(prev => prev.map(p => p.id === item.id ? updated : p));
    setEditQtyModalItem(null);
    await handleSaveItem(updated);
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Abrir Modal de Agendamento com Dimensionamento e Processo Quente/Frio
  const handleOpenScheduleModal = (product: any, targetDate?: string, targetReator?: string) => {
    setScheduleModalItem({ product, targetDate, targetReator });
    
    const procInfo = getProductProcessType(product);
    // Quantidade sugerida em MASSA (kg) baseada no peso/volume unitário
    const suggestedMassKg = procInfo.reqQtyKg <= 50 ? 50 : Math.round(procInfo.reqQtyKg);
    setScheduleQty(suggestedMassKg);

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
    setScheduleDate(targetDate || weekDays[0].dateStr);

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
  };

  // Reordenar bateladas no dia (sequenciamento de cores/envase)
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

  // Confirmar Agendamento Manual
  const handleConfirmSchedule = async () => {
    if (!scheduleModalItem || !scheduleModalItem.product) return;
    const { product } = scheduleModalItem;
    const procInfo = getProductProcessType(product);
    const colorInfo = getProductColorInfo(product);

    // TRAVA 1: Reator 100kg (Resistência) -> Máximo 1 produção por dia
    if (scheduleReator === 'R_100') {
      const existingIn100 = plannedItems.filter(i => i.data_planejada === scheduleDate && i.reator_id === 'R_100');
      if (existingIn100.length >= 1) {
        alert("⚠️ Limite atingido: O Reator 100kg funciona por resistência e está limitado a no máximo 1 produção por dia! Escolha outro dia ou use uma Bombona de Mistura.");
        return;
      }
    }

    // TRAVA 2: Reator 1000kg Shampoo -> Exclusivo para Shampoos
    if (scheduleReator === 'R_1000_SHAMPOO' || scheduleReator === 'R_1000') {
      if (!procInfo.isShampoo) {
        alert("⚠️ O Reator 1000kg (Shampoo) é exclusivo para Shampoos! Para outros produtos de grande volume, utilize o Reator 1000kg (Produção Mista) ou 500kg.");
        return;
      }
    }

    // Calcula ordem de sequência no dia
    const sameDayItems = plannedItems.filter(i => i.data_planejada === scheduleDate);
    const nextSeq = sameDayItems.length + 1;

    const itemId = `PLAN_${currentWeekKey}_${scheduleReator}_${scheduleDate}_${product.codigo}_${Date.now()}`;

    const newItem: PlanejamentoItem = {
      id: itemId,
      week_key: currentWeekKey,
      data_planejada: scheduleDate,
      reator_id: scheduleReator,
      codigo_produto: product.codigo,
      descricao: product.descricao,
      quantidade_planejada: scheduleQty,
      unidade: 'kg',
      base_codigo: product.base || null,
      base_nome: product.base || null,
      linha_envase: scheduleEnvaseLine,
      observacoes: (procInfo.isQuente 
        ? (scheduleReator === 'BOMBONAS' ? '🔥 Água Quente Caldeira (Bombona)' : (scheduleReator === 'R_100' ? '⚡ Resistência (100kg)' : (scheduleReator === 'R_40' ? '🔥 Reator 40kg (Quente)' : '🔥 Requer Caldeira'))) 
        : '❄️ Processo a Frio') + ` | ~${Math.round(scheduleQty / (procInfo.unitWeightKg || 1)).toLocaleString('pt-BR')} un`,
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
    setScheduleModalItem(null);
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
            descUpper.includes('BORRIFADOR') ||
            ingCode.startsWith('2.') ||
            ingCode.startsWith('3.');

          const category: 'materia_prima' | 'embalagem' = isEmbalagem ? 'embalagem' : 'materia_prima';
          const unit = isEmbalagem ? 'UN' : 'KG';
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
  const handlePrintWeeklyPlan = () => {
    if (plannedItems.length === 0) {
      alert("Nenhuma batelada agendada nesta semana para imprimir.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Não foi possível abrir a janela de impressão. Verifique se o bloqueador de popups do navegador está ativo.");
      return;
    }

    // Unidades totais estimadas
    let totalEstimatedUnits = 0;
    for (const item of plannedItems) {
      const isBase = item.codigo_produto.includes('.36.') || (item.descricao || '').toUpperCase().startsWith('BASE ');
      if (!isBase) {
        const uWeight = parseProductUnitWeightKg(item.descricao);
        totalEstimatedUnits += Math.round(item.quantidade_planejada / (uWeight || 1));
      }
    }

    const formatPrintReatorName = (id: string, recipDetail?: string) => getShortReatorName(id, recipDetail, reatores);

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
        const reatorNome = formatPrintReatorName(item.reator_id, item.recipiente_detalhe);

        return `
          <tr>
            <td style="text-align: center; font-weight: bold; font-family: monospace; border: 1px solid #cbd5e1; padding: 3px;">#${item.ordem_sequencia || 1}</td>
            <td style="font-weight: 600; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${reatorNome}</td>
            <td style="font-family: monospace; font-weight: bold; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${item.codigo_produto}</td>
            <td style="border: 1px solid #cbd5e1; padding: 3px;">
              <strong>${item.descricao || item.codigo_produto}</strong>
              ${isBase ? '<span style="background: #e0f2fe; color: #0369a1; padding: 1px 3px; border-radius: 2px; font-size: 8px; font-weight: bold; margin-left: 3px;">BASE</span>' : ''}
            </td>
            <td style="text-align: right; font-weight: bold; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${Number(item.quantidade_planejada || 0).toLocaleString('pt-BR')} kg</td>
            <td style="text-align: right; font-weight: 600; color: #1e3a8a; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">${yieldText}</td>
            <td style="text-align: center; font-family: monospace; font-size: 8.5px; border: 1px solid #cbd5e1; padding: 3px; white-space: nowrap;">
              ${item.lote_erp || '—'}
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
              📅 ${day.label} (${day.dayNumber}/${currentWeekKey.split('-W')[0]})
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
                  <th style="width: 25px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: center;">Seq</th>
                  <th style="width: 120px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: left;">Reator</th>
                  <th style="width: 60px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: left;">Código</th>
                  <th style="padding: 2px 3px; border: 1px solid #cbd5e1; text-align: left;">Produto / Semi-Acabado</th>
                  <th style="width: 60px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: right;">Massa</th>
                  <th style="width: 70px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: right;">Rendimento</th>
                  <th style="width: 65px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: center;">Lote ERP</th>
                  <th style="width: 40px; padding: 2px 3px; border: 1px solid #cbd5e1; text-align: center;">Visto</th>
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
          }
          .header-box {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 4px;
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
            margin-top: 1px;
            font-weight: 600;
          }
          .summary-bar {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 3px;
            padding: 3px 6px;
            margin-bottom: 8px;
            font-size: 8.5px;
            display: flex;
            justify-content: space-between;
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
          <div>
            <h1>NATUM COSMÉTICOS · PROGRAMAÇÃO SEMANAL DE PRODUÇÃO</h1>
            <div class="sub">
              PCP & Fabricação · <strong>Semana ${currentWeekKey}</strong> (${weekDays[0].label} ${weekDays[0].dateStr.split('-').slice(1).reverse().join('/')} a ${weekDays[4].label} ${weekDays[4].dateStr.split('-').slice(1).reverse().join('/')})
            </div>
          </div>
          <div style="text-align: right; font-size: 8px; color: #64748b;">
            Emissão: ${new Date().toLocaleString('pt-BR')}
          </div>
        </div>

        <div class="summary-bar">
          <span><strong>Volume Total:</strong> ${weekStats.totalKg.toLocaleString('pt-BR')} kg</span>
          <span><strong>Bateladas:</strong> ${weekStats.totalBatches} lotes</span>
          <span><strong>Rendimento Previsto:</strong> ~${totalEstimatedUnits.toLocaleString('pt-BR')} un</span>
          <span><strong>Carga Envase:</strong> L1: ${weekStats.envaseDayLoad.L1.toLocaleString('pt-BR')} kg · L2: ${weekStats.envaseDayLoad.L2.toLocaleString('pt-BR')} kg · L3: ${weekStats.envaseDayLoad.L3.toLocaleString('pt-BR')} kg</span>
          <span><strong>Caldeira / Quente:</strong> ${weekStats.caldeiraItems} lotes</span>
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

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // 2. IMPRESSÃO DO RELATÓRIO CONSOLIDADO DE MATÉRIAS-PRIMAS E EMBALAGENS (A4 RETRATO)
  const handlePrintMaterialsReport = () => {
    if (materialsList.length === 0) {
      alert("Nenhum dado de materiais carregado para impressão.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Não foi possível abrir a janela de impressão. Verifique se o bloqueador de popups do navegador está ativo.");
      return;
    }

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
                  🚨 RUPTURA (${isMp ? `${Math.round(mat.missingQty * 10) / 10} kg` : `${Math.round(mat.missingQty)} un`})
                </span>
              ` : `
                <span style="background: #dcfce7; color: #166534; padding: 2px 4px; border-radius: 3px; font-weight: bold; font-size: 7.5px; border: 1px solid #86efac;">
                  ✅ OK
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
          <div class="title-area">
            <h1>NATUM COSMÉTICOS · CONSUMO DE MATÉRIAS-PRIMAS E EMBALAGENS</h1>
            <div class="sub">
              Explosão Consolidada de Fórmulas · <strong>Semana ${currentWeekKey}</strong> (${weekDays[0].label} a ${weekDays[4].label})
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
              ${missingMp.length > 0 ? `🚨 ${missingMp.length} em ruptura` : '✅ Estoque OK'}
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Embalagens & Rótulos</div>
            <div class="kpi-val">${embItems.length} componentes</div>
            <div style="font-size: 7.5px; font-weight: bold; margin-top: 1px; color: ${missingEmb.length > 0 ? '#dc2626' : '#15803d'};">
              ${missingEmb.length > 0 ? `🚨 ${missingEmb.length} em ruptura` : '✅ Estoque OK'}
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

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
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
                observacoes: `❄️ Reator 1.000kg (Exclusivo Shampoos) | ~${plannedUnits.toLocaleString('pt-BR')} un`,
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
                observacoes: `🔥 Reator 40kg (Produção Quente) | ~${plannedUnits.toLocaleString('pt-BR')} un`,
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
                observacoes: `🔥 Água Quente Caldeira (Bombona) | ~${plannedUnits.toLocaleString('pt-BR')} un`,
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
                observacoes: `❄️ Mistura a Frio (Base Pronta) | ~${plannedUnits.toLocaleString('pt-BR')} un`,
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
                ? (reator.id === 'R_100' ? '⚡ Resistência (100kg - Máx 1/dia)' : (reator.id === 'R_40' ? '🔥 Reator 40kg (Quente)' : '🔥 Requer Caldeira (Quente)')) 
                : '❄️ Processo a Frio') + ` | ~${plannedUnits.toLocaleString('pt-BR')} un`,
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
    }
  };

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

          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 font-semibold text-xs">
            <CalendarClock size={16} className="text-blue-600" />
            <span>Semana {currentWeekKey.split('-W')[1]} ({weekDays[0].dateStr.split('-').slice(1).reverse().join('/')} a {weekDays[4].dateStr.split('-').slice(1).reverse().join('/')})</span>
          </div>

          <button
            onClick={() => fetchPlanejamento()}
            className="p-2 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors"
            title="Atualizar Planejamento"
          >
            <RefreshCw size={15} className={loadingPlan ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Métricas Compactas da Semana */}
        <div className="flex items-center gap-3 text-xs">
          <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
            <Boxes size={14} className="text-zinc-500" />
            <span className="text-zinc-500">Bateladas:</span>
            <strong className="text-zinc-900 font-bold">{weekStats.totalBatches}</strong>
          </div>
          <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
            <ScaleIcon size={14} className="text-zinc-500" />
            <span className="text-zinc-500">Massa:</span>
            <strong className="text-zinc-900 font-bold">{weekStats.totalKg.toLocaleString('pt-BR')} kg</strong>
          </div>
          <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
            <Flame size={14} className="text-orange-500" />
            <span className="text-zinc-500">Caldeira:</span>
            <strong className="text-orange-700 font-bold">{weekStats.caldeiraItems} lotes</strong>
          </div>
          <div className="px-2.5 py-1 bg-zinc-50 border border-zinc-200 rounded-md flex items-center gap-1.5">
            <Layers size={14} className="text-zinc-500" />
            <span className="text-zinc-500">Ocupação:</span>
            <strong className={`font-bold ${weekStats.occupancyRate > 90 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {weekStats.occupancyRate}%
            </strong>
          </div>
        </div>

        {/* Botões de Ação Principal */}
        <div className="flex items-center gap-2">
          {/* BOTÃO LIMPAR SEMANA SOLICITADO POR EDSON */}
          <button
            onClick={handleClearWeek}
            disabled={plannedItems.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              plannedItems.length > 0 
                ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200 cursor-pointer' 
                : 'bg-zinc-50 text-zinc-400 border-zinc-200 cursor-not-allowed'
            }`}
            title="Limpar todas as bateladas agendadas para esta semana"
          >
            <Trash2 size={14} />
            <span>Limpar Semana</span>
          </button>

          <button
            onClick={() => setReatoresModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-750 text-xs font-semibold rounded-lg border border-zinc-200 transition-colors"
          >
            <Settings size={14} />
            <span>Reatores</span>
          </button>


          <button
            onClick={handlePrintWeeklyPlan}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Imprimir Programação Semanal de Produção em formato A4 Paisagem (com reatores, bateladas e sequenciamento de cores)"
          >
            <Printer size={14} className="text-zinc-200" />
            <span>Imprimir Programação</span>
          </button>

          <button
            onClick={handleOpenMaterialsReport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold rounded-lg border border-blue-200 transition-colors cursor-pointer"
            title="Relatório consolidado de matérias-primas e embalagens necessárias na semana planejada"
          >
            <Boxes size={14} className="text-blue-600" />
            <span>Consumo MP & Embalagens</span>
          </button>

          <button
            onClick={handleRunHeuristic}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer"
            title="Gerar sugestão inteligente respeitando reatores, processos Quente/Frio e limites de lote"
          >
            <Sparkles size={14} className="text-yellow-300" />
            <span>Otimizar Semana</span>
          </button>

          <button
            onClick={() => setDemandBankOpen(!demandBankOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              demandBankOpen ? 'bg-zinc-800 text-white border-zinc-800' : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            }`}
          >
            <Package size={14} />
            <span>Banco de Demandas</span>
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
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="p-3 w-56 font-bold text-zinc-700 border-r border-zinc-200">
                    REATOR / CAPACIDADE
                  </th>
                  {weekDays.map(day => (
                    <th key={day.dateStr} className={`p-3 font-bold border-r border-zinc-200 min-w-[200px] ${
                      day.holiday ? 'bg-amber-50/70 text-amber-900' : 'text-zinc-800'
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
                        <div className="text-[10px] text-amber-800 font-normal truncate mt-0.5" title={day.holiday.name}>
                          {day.holiday.name}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {reatores.filter(r => r.ativo).map(reator => (
                  <tr key={reator.id} className="hover:bg-zinc-50/40 transition-colors">
                    {/* Linha do Reator / Bombonas */}
                    <td className="p-3 font-semibold text-zinc-800 border-r border-zinc-200 bg-zinc-50/50 align-top w-56">
                      <div className="flex items-start gap-1.5">
                        {reator.id === 'BOMBONAS' ? (
                          <Package size={16} className="text-amber-600 mt-0.5" title="Bombonas Móveis de Mistura" />
                        ) : reator.id === 'R_100' ? (
                          <AlertCircle size={16} className="text-amber-500 mt-0.5" title="Aquecimento por Resistência (Máx 1/dia)" />
                        ) : reator.id === 'R_40' ? (
                          <Flame size={16} className="text-orange-600 mt-0.5" title="Reator 40kg (Produção Quente)" />
                        ) : (reator.id === 'R_1000_SHAMPOO' || reator.id === 'R_1000') ? (
                          <Snowflake size={16} className="text-blue-500 mt-0.5" title="Exclusivo Shampoos" />
                        ) : reator.id === 'R_1000_MISTO' ? (
                          <Boxes size={16} className="text-purple-600 mt-0.5" title="Caldeira - Produção Mista" />
                        ) : reator.tipo === 'quente' ? (
                          <Flame size={16} className="text-orange-500 mt-0.5" title="Requer Caldeira" />
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
                          <span className="px-1.5 py-0.2 rounded font-bold bg-blue-100 text-blue-900 border border-blue-200">
                            ❄️ Exclusivo Shampoo
                          </span>
                        )}
                        {reator.id === 'R_1000_MISTO' && (
                          <span className="px-1.5 py-0.2 rounded font-bold bg-purple-100 text-purple-900 border border-purple-200">
                            🔥 Produção Mista
                          </span>
                        )}
                        {reator.id === 'R_100' && (
                          <span className="px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            ⚡ Resistência (Máx 1/dia)
                          </span>
                        )}
                        {reator.id === 'R_40' && (
                          <span className="px-1.5 py-0.2 rounded font-bold bg-orange-100 text-orange-900 border border-orange-200">
                            🔥 Produção Quente (40kg)
                          </span>
                        )}
                        {reator.id === 'BOMBONAS' && (
                          <span className="px-1.5 py-0.2 rounded font-bold bg-amber-50 text-amber-850 border border-amber-200">
                            🛢️ Mistura Móvel (Múltiplas/dia)
                          </span>
                        )}
                        {reator.id !== 'R_1000_SHAMPOO' && reator.id !== 'R_1000' && reator.id !== 'R_1000_MISTO' && reator.id !== 'R_100' && reator.id !== 'R_40' && reator.id !== 'BOMBONAS' && (
                          <span className="px-1.5 py-0.2 rounded font-semibold bg-orange-50 text-orange-800 border border-orange-200">
                            🔥 Caldeira (Quente/Frio)
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

                            // 1. Arrastando card de batelada existente
                            if (draggedItem) {
                              if (draggedItem.reator_id === reator.id && draggedItem.data_planejada === day.dateStr) {
                                setDraggedItem(null);
                                return;
                              }

                              const targetReator = reatores.find(r => r.id === reator.id);
                              let newQty = draggedItem.quantidade_planejada;
                              let newRecipiente = draggedItem.recipiente_detalhe;

                              if (reator.id === 'BOMBONAS') {
                                if (!newRecipiente || newRecipiente === 'Reator') {
                                  newRecipiente = newQty <= 50 ? 'Bombona 50kg' : (newQty <= 100 ? 'Bombona 100kg' : 'Bombona 200kg');
                                }
                              } else {
                                newRecipiente = 'Reator';
                                if (targetReator && targetReator.capacidade_kg > 0 && newQty < 40 && targetReator.capacidade_kg >= 100) {
                                  newQty = targetReator.capacidade_kg;
                                }
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
                              {cellItems.map(item => {
                                const itemColor = getProductColorInfo({ descricao: item.descricao, base: item.base_codigo });

                                return (
                                  <div
                                    key={item.id}
                                    draggable={true}
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', item.id);
                                      e.dataTransfer.effectAllowed = 'move';
                                      setDraggedItem(item);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedItem(null);
                                      setDragOverCell(null);
                                    }}
                                    className={`p-2 rounded-lg border transition-all text-xs flex flex-col gap-1.5 shadow-xs cursor-grab active:cursor-grabbing select-none ${
                                      draggedItem?.id === item.id ? 'opacity-30 border-dashed border-blue-400 scale-95' : ''
                                    } ${
                                      item.ordem_status === 'lote_criado'
                                        ? 'bg-emerald-50/70 border-emerald-300'
                                        : 'bg-white border-zinc-200 hover:border-blue-400 hover:shadow-sm'
                                    }`}
                                    title="Arraste para mover para outro dia ou reator"
                                  >
                                    {/* 1. Header: Sequência, Cor, Título e Ações */}
                                    <div className="flex items-start justify-between gap-1">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <GripVertical size={11} className="text-zinc-400 shrink-0 opacity-60 hover:opacity-100" />
                                        <span className="shrink-0 px-1.5 py-0.5 bg-zinc-800 text-white font-mono text-[9px] font-bold rounded" title="Ordem no dia">
                                          #{item.ordem_sequencia || 1}
                                        </span>
                                        <span className="font-bold text-zinc-900 text-xs leading-tight line-clamp-2" title={item.descricao}>
                                          {item.descricao || item.codigo_produto}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-0.5 shrink-0 ml-1">
                                        <button
                                          onClick={() => handleMoveOrder(item, 'up')}
                                          className="p-0.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded cursor-pointer"
                                          title="Subir ordem"
                                        >
                                          <ChevronUp size={12} />
                                        </button>
                                        <button
                                          onClick={() => handleMoveOrder(item, 'down')}
                                          className="p-0.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded cursor-pointer"
                                          title="Descer ordem"
                                        >
                                          <ChevronDown size={12} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteItem(item.id)}
                                          className="p-0.5 hover:bg-red-50 text-zinc-400 hover:text-red-500 rounded cursor-pointer ml-0.5"
                                          title="Remover do Planejamento"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* 2. Métricas Técnicas: Quantidade (Editável), Rendimento e Processo Térmico */}
                                    {(() => {
                                      const uWeight = parseProductUnitWeightKg(item.descricao);
                                      const yieldUnits = Math.round(item.quantidade_planejada / (uWeight || 1));
                                      const linkedProd = products.find(p => p.codigo === item.codigo_produto);
                                      const pedAberto = linkedProd?.pedidos_aberto || 0;
                                      const isBase = (item.codigo_produto || '').includes('.36.') || 
                                        (item.descricao || '').toUpperCase().startsWith('BASE ') || 
                                        (item.descricao || '').toUpperCase().startsWith('PRE BASE ') ||
                                        item.codigo_produto === '8.11.002' ||
                                        item.codigo_produto === '8.12.002' ||
                                        item.codigo_produto === '8.13.001';

                                      const isQuente = item.processo_termico === 'resistencia' || 
                                        item.processo_termico === 'agua_caldeira' || 
                                        item.reator_id === 'R_40' || 
                                        item.recipiente_detalhe === 'Reator 40kg' || 
                                        (item.observacoes || '').includes('Caldeira');

                                      const thermalLabel = item.processo_termico === 'resistencia' ? '⚡ Resistência' :
                                        item.processo_termico === 'agua_caldeira' ? '🔥 Água Caldeira' :
                                        (item.reator_id === 'R_40' || item.recipiente_detalhe === 'Reator 40kg') ? '🔥 40kg' :
                                        (item.observacoes || '').includes('Caldeira') ? '🔥 Caldeira' : '❄️ Frio';

                                      const isAprovado = item.ordem_status === 'aprovado' || (item.fisico_confirmado_massa && item.fisico_confirmado_embalagem && item.fisico_confirmado_rotulo);

                                      return (
                                        <>
                                          <div className="flex items-center justify-between text-[11px] bg-zinc-50 px-2 py-1 rounded border border-zinc-100">
                                            <div className="flex items-center gap-1.5 font-semibold text-zinc-800">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditQtyModalItem({ item, newQty: item.quantidade_planejada });
                                                }}
                                                className="flex items-center gap-1 hover:text-blue-700 hover:bg-blue-50 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                                title="Clique para editar a quantidade (kg) a produzir"
                                              >
                                                <span>{item.quantidade_planejada} kg</span>
                                                <Edit3 size={10} className="text-zinc-400 hover:text-blue-600" />
                                              </button>
                                              <span className="text-zinc-300">•</span>
                                              <span className="text-zinc-500 font-normal">{isBase ? 'Base Granel' : `~${yieldUnits.toLocaleString('pt-BR')} un`}</span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                              {isBase && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                                                  🧪 Base
                                                </span>
                                              )}
                                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                                isQuente ? 'bg-orange-100 text-orange-900 border border-orange-200' : 'bg-blue-100 text-blue-900 border border-blue-200'
                                              }`}>
                                                {thermalLabel}
                                              </span>
                                              {item.recipiente_detalhe && item.recipiente_detalhe !== 'Reator' && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded" title={item.recipiente_detalhe}>
                                                  🛢️ {item.recipiente_detalhe.replace('Bombona ', '')}
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          {/* 3. Rodapé: Pedidos da Carteira, Base, Lote ERP (Interativo) e Botão Único de Aprovação */}
                                          <div className="flex items-center justify-between text-[10px] pt-0.5">
                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                              {pedAberto > 0 && (
                                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[9px] rounded shrink-0" title="Pedidos em carteira">
                                                  📦 {pedAberto.toLocaleString('pt-BR')}
                                                </span>
                                              )}
                                              {item.base_codigo && (
                                                <span className="text-[9px] text-zinc-500 truncate max-w-[80px]" title={`Base: ${item.base_codigo}`}>
                                                  Base: <strong className="text-zinc-700">{item.base_codigo}</strong>
                                                </span>
                                              )}
                                              {/* Vincular / Visualizar Lote ERP */}
                                              {item.lote_erp ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenLinkLoteModal(item);
                                                  }}
                                                  className="font-mono text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 font-bold text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                                                  title="Lote ERP vinculado. Clique para editar."
                                                >
                                                  <Tag size={9} className="text-emerald-600" />
                                                  <span>#{item.lote_erp}</span>
                                                </button>
                                              ) : (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenLinkLoteModal(item);
                                                  }}
                                                  className="text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 font-semibold text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                                                  title="Vincular Lote ERP a esta batelada"
                                                >
                                                  <Tag size={9} className="text-blue-500" />
                                                  <span>+ Lote</span>
                                                </button>
                                              )}
                                            </div>

                                            {/* Botão Único de Ícone de Aprovação (substitui M/E/R e envia diretamente aos quadros) */}
                                            <div className="flex items-center gap-1 shrink-0">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleToggleAprovacao(item);
                                                }}
                                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all shadow-xs ${
                                                  isAprovado 
                                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                                    : 'bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200'
                                                }`}
                                                title={isAprovado 
                                                  ? "Batelada Aprovada: Enviada aos Quadros de Pesagem e Produção (Clique para revogar)" 
                                                  : "Clique para Aprovar a Batelada e disponibilizar nos Quadros operacionais"
                                                }
                                              >
                                                <CheckCircle2 size={12} className={isAprovado ? "text-white" : "text-zinc-400"} />
                                                <span>{isAprovado ? 'Aprovado' : 'Aprovar'}</span>
                                              </button>
                                            </div>
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
                                    if (demandCandidates.length > 0) {
                                      handleOpenScheduleModal(demandCandidates[0], day.dateStr, reator.id);
                                    } else {
                                      alert("Nenhum produto pendente no Banco de Demandas.");
                                    }
                                  }}
                                  className="w-full py-6 flex flex-col items-center justify-center gap-1 border border-dashed border-zinc-200 hover:border-blue-400 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50/30 transition-all cursor-pointer"
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

          {/* RODAPÉ DO QUADRO: CARGA DAS LINHAS DE ENVASE */}
          <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-zinc-650">
              <Package size={15} className="text-purple-600" />
              <strong className="text-zinc-800">Carga Estimada nas 3 Linhas de Envase:</strong>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span>Linha 1 (Frascos): <strong>{weekStats.envaseDayLoad.L1.toLocaleString('pt-BR')} kg</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span>Linha 2 (Potes): <strong>{weekStats.envaseDayLoad.L2.toLocaleString('pt-BR')} kg</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Linha 3 (Especiais): <strong>{weekStats.envaseDayLoad.L3.toLocaleString('pt-BR')} kg</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* GAVETA LATERAL: BANCO DE DEMANDAS COM FILTRO POR LINHA DE PRODUTO E DADOS DE VENDA */}
        {demandBankOpen && (
          <div className="w-[420px] bg-white rounded-xl border border-zinc-200 shadow-xs flex flex-col h-[750px] shrink-0">
            {/* Cabeçalho da Gaveta */}
            <div className="p-3 border-b border-zinc-200 flex flex-col gap-2 bg-zinc-50/70 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Package size={16} className="text-zinc-700" />
                  <h3 className="font-bold text-zinc-900 text-xs">Banco de Demandas</h3>
                </div>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-[10px] rounded-full">
                  {demandCandidates.length} itens ativos
                </span>
              </div>

              {/* Seletor de Linha Comercial de Produto */}
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 block mb-0.5">
                  Linha de Produtos:
                </label>
                <select
                  value={selectedLineFilter}
                  onChange={(e) => setSelectedLineFilter(e.target.value)}
                  className="w-full p-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-800 focus:outline-hidden"
                >
                  <option value="ALL">Todas as Linhas de Produtos</option>
                  {availableLines.map(line => (
                    <option key={line} value={line}>Linha {line}</option>
                  ))}
                </select>
              </div>

              {/* Filtros de Tipo de Demanda */}
              <div className="grid grid-cols-5 gap-1 text-[10px]">
                <button
                  onClick={() => setDemandFilter('ALL')}
                  className={`py-1 px-1 rounded font-semibold cursor-pointer flex items-center justify-center gap-0.5 ${
                    demandFilter === 'ALL' ? 'bg-zinc-800 text-white' : 'bg-zinc-200/70 text-zinc-700 hover:bg-zinc-200'
                  }`}
                  title="Todos os produtos ativos do catálogo"
                >
                  <span>Todos</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded-full ${
                    demandFilter === 'ALL' ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-300 text-zinc-700'
                  }`}>
                    {demandFilterCounts.all}
                  </span>
                </button>
                <button
                  onClick={() => setDemandFilter('CRITICOS')}
                  className={`py-1 px-1 rounded font-semibold cursor-pointer flex items-center justify-center gap-0.5 ${
                    demandFilter === 'CRITICOS' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                  title="Produtos com déficit ou status crítico"
                >
                  <span>Críticos</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded-full ${
                    demandFilter === 'CRITICOS' ? 'bg-red-700 text-red-100' : 'bg-red-100 text-red-800'
                  }`}>
                    {demandFilterCounts.criticos}
                  </span>
                </button>
                <button
                  onClick={() => setDemandFilter('PROGRAMADAS')}
                  className={`py-1 px-1 rounded font-semibold cursor-pointer flex items-center justify-center gap-0.5 ${
                    demandFilter === 'PROGRAMADAS' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                  title="Produtos com programação de produção ativa"
                >
                  <span>Prog.</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded-full ${
                    demandFilter === 'PROGRAMADAS' ? 'bg-blue-700 text-blue-100' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {demandFilterCounts.programadas}
                  </span>
                </button>
                <button
                  onClick={() => setDemandFilter('KITS')}
                  className={`py-1 px-1 rounded font-semibold cursor-pointer flex items-center justify-center gap-0.5 ${
                    demandFilter === 'KITS' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                  }`}
                  title="Kits e componentes de kits"
                >
                  <span>Kits</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded-full ${
                    demandFilter === 'KITS' ? 'bg-purple-700 text-purple-100' : 'bg-purple-100 text-purple-800'
                  }`}>
                    {demandFilterCounts.kits}
                  </span>
                </button>
                <button
                  onClick={() => setDemandFilter('BASES')}
                  className={`py-1 px-1 rounded font-semibold cursor-pointer flex items-center justify-center gap-0.5 ${
                    demandFilter === 'BASES' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                  title="Bases de fabricação e semi-acabados"
                >
                  <span>Bases</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded-full ${
                    demandFilter === 'BASES' ? 'bg-amber-700 text-amber-100' : 'bg-amber-200 text-amber-900 font-bold'
                  }`}>
                    {demandFilterCounts.bases}
                  </span>
                </button>
              </div>

              {/* Campo de Busca */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar REF, nome ou base..."
                  value={demandSearch}
                  onChange={(e) => setDemandSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Lista com Scroll e Dados Ricos de PCP */}
            <div className="flex-1 overflow-y-auto p-2 divide-y divide-zinc-100">
              {demandCandidates.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 text-xs">
                  Nenhum produto ativo pendente no filtro atual.
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
                  const colorInfo = getProductColorInfo(prod);
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
                      {/* 1. Descrição e Código */}
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="font-bold text-zinc-900 text-xs leading-snug line-clamp-2" title={prod.descricao}>
                          {prod.descricao}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-600 font-semibold bg-zinc-100 px-1 py-0.5 rounded shrink-0">
                          {prod.codigo}
                        </span>
                      </div>

                      {/* 2. Badges de Sequência, Cor, Processo e Base */}
                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        {/* Tag de Cor com prioridade */}
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${colorInfo.badgeClass}`} title={colorInfo.label}>
                          {colorInfo.shortLabel}
                        </span>

                        {/* Tag Térmica */}
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          procInfo.isQuente ? 'bg-orange-100 text-orange-900 border border-orange-200' : 'bg-blue-100 text-blue-900 border border-blue-200'
                        }`}>
                          {procInfo.label}
                        </span>

                        {isBase && (
                          <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-bold rounded">
                            🧪 Base de Fabricação
                          </span>
                        )}

                        {pedidosAberto > 0 && (
                          <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-bold rounded">
                            📦 {pedidosAberto.toLocaleString('pt-BR')} em carteira
                          </span>
                        )}

                        {isProgramada && (
                          <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[9px] font-bold rounded">
                            ⭐ Programada
                          </span>
                        )}

                        {prod.linha_prefix && (
                          <span className="px-1.5 py-0.2 bg-zinc-100 text-zinc-650 text-[9px] rounded font-medium">
                            Linha {prod.linha_prefix}
                          </span>
                        )}

                        {prod.base && (
                          <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-750 text-[9px] rounded truncate max-w-[140px]" title={`Base: ${prod.base}`}>
                            Base: {prod.base}
                          </span>
                        )}
                      </div>

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

                      {/* 5. Ação de Agendamento */}
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
                        <span className="text-[10px] text-zinc-500">
                          Sugerido: <strong className="text-zinc-700">{procInfo.recipienteSugerido === 'BOMBONAS' ? '🛢️ Bombona' : (procInfo.recipienteSugerido === 'R_40' ? '🔥 Reator 40kg' : ((procInfo.recipienteSugerido === 'R_1000_SHAMPOO' || procInfo.recipienteSugerido === 'R_1000') ? '⚗️ 1000kg (Shampoo)' : (procInfo.recipienteSugerido === 'R_1000_MISTO' ? '⚗️ 1000kg (Misto)' : '⚗️ Reator')))}</strong>
                        </span>
                        <button
                          onClick={() => handleOpenScheduleModal(prod)}
                          className="flex items-center gap-1 px-3 py-1 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-semibold rounded-lg border border-blue-200 hover:border-blue-600 transition-all cursor-pointer shadow-2xs"
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
                        <option value="quente">🔥 Quente (Requer Caldeira)</option>
                        <option value="frio">❄️ A Frio (Mistura)</option>
                        <option value="misto">🔄 Misto (Quente ou Frio)</option>
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
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Reatores
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AGENDAR PRODUTO NO REATOR / DIA */}
      {scheduleModalItem && scheduleModalItem.product && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 flex flex-col gap-4 border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock size={18} className="text-blue-600" />
                <h3 className="font-bold text-zinc-900 text-sm">Agendar Batelada no Quadro</h3>
              </div>
              <button 
                onClick={() => setScheduleModalItem(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {(() => {
              const procModal = getProductProcessType(scheduleModalItem.product);
              const uWeightKg = procModal.unitWeightKg;
              const pedAbertoModal = scheduleModalItem.product.pedidos_aberto || 0;
              const recUnitsModal = scheduleModalItem.product.producao_recomendada || 0;
              const estimatedUnitsYield = Math.round(scheduleQty / (uWeightKg || 1));
              const volFormatted = uWeightKg >= 1 ? `${uWeightKg} kg` : `${Math.round(uWeightKg * 1000)} mL/g`;

              return (
                <>
                  <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <strong className="text-zinc-900 text-sm block leading-tight">{scheduleModalItem.product.descricao}</strong>
                        <div className="flex items-center gap-2 text-zinc-500 text-[11px] mt-0.5">
                          <span>REF: <strong className="font-mono">{scheduleModalItem.product.codigo}</strong></span>
                          {scheduleModalItem.product.base && (
                            <span>Base: <strong>{scheduleModalItem.product.base}</strong></span>
                          )}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        procModal.isQuente 
                          ? 'bg-orange-100 text-orange-900 border border-orange-200' 
                          : 'bg-blue-100 text-blue-900 border border-blue-200'
                      }`}>
                        {procModal.label}
                      </span>
                    </div>

                    {/* Resumo de Engenharia e Demanda */}
                    <div className="grid grid-cols-3 gap-2 bg-white p-2 rounded-md border border-zinc-200/80 text-[10px]">
                      <div>
                        <span className="text-zinc-500 block">Volume Unit.:</span>
                        <strong className="text-zinc-800 text-xs">{volFormatted}</strong>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">📦 Em Pedido:</span>
                        <strong className={`text-xs ${pedAbertoModal > 0 ? 'text-amber-800 font-bold' : 'text-zinc-700'}`}>
                          {pedAbertoModal.toLocaleString('pt-BR')} un
                        </strong>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Qtd. Recom.:</span>
                        <strong className="text-blue-700 text-xs">
                          {recUnitsModal.toLocaleString('pt-BR')} un
                          <span className="text-[9px] font-normal text-zinc-500 block">(~{procModal.reqQtyKg} kg)</span>
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 text-xs">
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
                          const r = reatores.find(x => x.id === rId);
                          if (r) {
                            if (rId === 'BOMBONAS') {
                              setScheduleRecipienteDetalhe('Bombona 50kg');
                              setScheduleQty(50);
                            } else {
                              setScheduleRecipienteDetalhe('Reator');
                              setScheduleQty(r.capacidade_kg);
                            }
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
                            if (e.target.value === 'Bombona 50kg') setScheduleQty(50);
                            else if (e.target.value === 'Bombona 100kg') setScheduleQty(100);
                            else if (e.target.value === 'Bombona 200kg') setScheduleQty(200);
                          }}
                          className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-800"
                        >
                          <option value="Bombona 50kg">🛢️ Bombona 50 kg (Mistura rápida a frio)</option>
                          <option value="Bombona 100kg">🛢️ Bombona 100 kg (Mistura / Água Quente da Caldeira)</option>
                          <option value="Bombona 200kg">🛢️ Bombona 200 kg (Bases / Água Quente da Caldeira)</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="font-semibold text-zinc-700 block mb-1">Massa da Batelada (kg):</label>
                      <input
                        type="number"
                        value={scheduleQty}
                        onChange={(e) => setScheduleQty(Number(e.target.value))}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs font-bold"
                      />
                      <div className="mt-1.5 text-[11px] text-zinc-600 flex items-center justify-between">
                        <div>
                          <span>Rendimento estimado: </span>
                          <strong className="text-emerald-700 font-bold text-xs">
                            ~{estimatedUnitsYield.toLocaleString('pt-BR')} un
                          </strong>
                        </div>
                        {pedAbertoModal > 0 && (
                          <div>
                            {estimatedUnitsYield >= pedAbertoModal ? (
                              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-medium">✅ Cobre os pedidos em aberto ({pedAbertoModal} un)</span>
                            ) : (
                              <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-medium">⚠️ Abaixo dos pedidos ({pedAbertoModal} un)</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
              <button
                onClick={() => setScheduleModalItem(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg border border-zinc-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSchedule}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Confirmar Agendamento
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
                {linkLoteModalItem.dataUltimoLote && (
                  <div className="text-[10px] text-zinc-500 flex items-center justify-between">
                    <span>Data: {linkLoteModalItem.dataUltimoLote.split('T')[0].split(' ')[0].split('-').reverse().join('/')}</span>
                    <span className="text-blue-600 font-semibold">{linkLoteModalItem.origemUltimoLote || 'ERP'}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-blue-200/60">
                  <button
                    type="button"
                    onClick={() => setLinkLoteModalItem({ ...linkLoteModalItem, lote: linkLoteModalItem.ultimoLote! })}
                    className="px-2.5 py-1 bg-white hover:bg-blue-100 text-blue-800 border border-blue-300 rounded text-[11px] font-semibold cursor-pointer transition-colors shadow-2xs"
                  >
                    Usar #{linkLoteModalItem.ultimoLote}
                  </button>
                  {linkLoteModalItem.sugestaoProximo && (
                    <button
                      type="button"
                      onClick={() => setLinkLoteModalItem({ ...linkLoteModalItem, lote: linkLoteModalItem.sugestaoProximo! })}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                    >
                      Sugerir Próximo: #{linkLoteModalItem.sugestaoProximo}
                    </button>
                  )}
                </div>
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
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer"
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
              <strong className="text-zinc-900 block">{editQtyModalItem.item.descricao || editQtyModalItem.item.codigo_produto}</strong>
              <div className="flex items-center justify-between text-zinc-500 mt-1">
                <span>Data: <strong>{editQtyModalItem.item.data_planejada}</strong></span>
                <span>Equipamento: <strong>{getShortReatorName(editQtyModalItem.item.reator_id, editQtyModalItem.item.recipiente_detalhe, reatores)}</strong></span>
              </div>
            </div>

            {(() => {
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
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer"
              >
                Salvar Quantidade
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
              <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg">
                <span className="text-purple-700 text-[11px] block">Bases Agrupadas</span>
                <strong className="text-purple-950 font-bold text-sm">{heuristicStats.groupedBases}</strong>
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
                              ? 'bg-orange-100 text-orange-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {(item.observacoes || '').includes('Caldeira') ? '🔥 Caldeira' : '❄️ A Frio'}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-semibold">
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
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                  <Boxes size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-zinc-900 text-sm">Consumo Semanal de Insumos & Embalagens</h3>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[10px] font-bold rounded">
                      {currentWeekKey}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Explosão de materiais necessária para produzir as {plannedItems.length} bateladas agendadas ({weekStats.totalKg.toLocaleString('pt-BR')} kg).
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
                  onClick={handleExportMaterialsExcel}
                  disabled={loadingMaterialsReport || materialsList.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                  title="Baixar planilha Excel com abas de Matérias-Primas e Embalagens"
                >
                  <FileSpreadsheet size={14} />
                  <span>Exportar Excel (.xlsx)</span>
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
                  className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* KPIs Consolidados */}
            {(() => {
              const mpItems = materialsList.filter(m => m.category === 'materia_prima');
              const embItems = materialsList.filter(m => m.category === 'embalagem');
              const missingMp = mpItems.filter(m => m.isMissing);
              const missingEmb = embItems.filter(m => m.isMissing);
              const totalMissing = missingMp.length + missingEmb.length;

              return (
                <div className="grid grid-cols-4 gap-2.5 p-3.5 bg-zinc-50/50 border-b border-zinc-200 text-xs">
                  <div className="p-2.5 bg-white border border-zinc-200 rounded-lg">
                    <span className="text-zinc-500 text-[11px] block">Matérias-Primas</span>
                    <strong className="text-zinc-900 text-base font-bold block">{mpItems.length} insumos</strong>
                    <span className={`text-[10px] font-semibold mt-0.5 block ${missingMp.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {missingMp.length > 0 ? `🚨 ${missingMp.length} com ruptura de estoque` : '✅ Todas com estoque'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white border border-zinc-200 rounded-lg">
                    <span className="text-zinc-500 text-[11px] block">Embalagens (Frascos/Tampas)</span>
                    <strong className="text-zinc-900 text-base font-bold block">{embItems.length} itens</strong>
                    <span className={`text-[10px] font-semibold mt-0.5 block ${missingEmb.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {missingEmb.length > 0 ? `🚨 ${missingEmb.length} com ruptura de estoque` : '✅ Todas com estoque'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white border border-zinc-200 rounded-lg">
                    <span className="text-zinc-500 text-[11px] block">Massa Total Programada</span>
                    <strong className="text-zinc-900 text-base font-bold block">{weekStats.totalKg.toLocaleString('pt-BR')} kg</strong>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">em {plannedItems.length} bateladas</span>
                  </div>

                  <div className="p-2.5 bg-white border border-zinc-200 rounded-lg">
                    <span className="text-zinc-500 text-[11px] block">Status Geral de Suprimentos</span>
                    <strong className={`text-base font-bold block ${totalMissing > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {totalMissing > 0 ? `${totalMissing} Faltas no Galpão` : '100% Suprido'}
                    </strong>
                    <span className="text-[10px] text-zinc-500 mt-0.5 block">
                      {totalMissing > 0 ? 'Requer compras imediatas' : 'Liberado para pesagem'}
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
                      className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                        materialsFilterTab === 'ALL' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      Todos ({materialsList.length})
                    </button>
                    <button
                      onClick={() => setMaterialsFilterTab('FALTAS')}
                      className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                        materialsFilterTab === 'FALTAS' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
                      }`}
                    >
                      🚨 Ruptura / Faltas ({missingCount})
                    </button>
                    <button
                      onClick={() => setMaterialsFilterTab('MP')}
                      className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                        materialsFilterTab === 'MP' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      🧪 Matérias-Primas ({mpCount})
                    </button>
                    <button
                      onClick={() => setMaterialsFilterTab('EMB')}
                      className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                        materialsFilterTab === 'EMB' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                      }`}
                    >
                      📦 Embalagens ({embCount})
                    </button>
                  </div>
                );
              })()}

              <div className="relative w-72">
                <Search size={14} className="absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filtrar por código ou descrição..."
                  value={materialsSearch}
                  onChange={(e) => setMaterialsSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Conteúdo: Tabela com Scroll */}
            <div className="flex-1 overflow-y-auto">
              {loadingMaterialsReport ? (
                <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-500">
                  <RefreshCw size={24} className="animate-spin text-blue-600" />
                  <span className="text-xs font-semibold">Explodindo fórmulas e consultando estoques do galpão...</span>
                </div>
              ) : materialsList.length === 0 ? (
                <div className="py-20 text-center text-zinc-400 text-xs">
                  Nenhuma matéria-prima ou embalagem encontrada para os itens agendados nesta semana.
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
                    <thead className="sticky top-0 bg-zinc-100/90 backdrop-blur-xs border-b border-zinc-200 z-10 text-[11px] font-bold text-zinc-700">
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
                          <tr key={mat.code} className={`hover:bg-zinc-50 transition-colors ${mat.isMissing ? 'bg-red-50/20' : ''}`}>
                            <td className="p-2.5 font-mono text-[11px] font-bold text-zinc-900 whitespace-nowrap">
                              {mat.code}
                            </td>
                            <td className="p-2.5">
                              <span className="font-semibold text-zinc-900 block" title={mat.description}>
                                {mat.description}
                              </span>
                            </td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isMp ? 'bg-blue-100 text-blue-900' : 'bg-purple-100 text-purple-900'
                              }`}>
                                {isMp ? '🧪 MP' : '📦 EMB'}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-bold text-zinc-900 whitespace-nowrap">
                              {reqFormatted}
                            </td>
                            <td className="p-2.5 text-right text-zinc-700 whitespace-nowrap">
                              {stockFormatted}
                            </td>
                            <td className={`p-2.5 text-right font-bold whitespace-nowrap ${
                              mat.isMissing ? 'text-red-600' : 'text-emerald-700'
                            }`}>
                              {mat.projectedBalance >= 0 ? `+${balanceFormatted}` : balanceFormatted}
                            </td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              {mat.isMissing ? (
                                <span className="px-2 py-0.5 bg-red-100 text-red-800 border border-red-200 rounded font-bold text-[10px]">
                                  🚨 Ruptura ({isMp ? `${Math.round(mat.missingQty * 10) / 10} kg` : `${Math.round(mat.missingQty)} un`})
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded font-bold text-[10px]">
                                  ✅ Suficiente
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-[11px] text-zinc-600 whitespace-nowrap">
                              {mat.purchaseOrders && mat.purchaseOrders.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {mat.purchaseOrders.slice(0, 2).map((po, idx) => (
                                    <span key={idx} className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-amber-200">
                                      🚚 OC #{po.n_pedido}: {po.n_pendente || po.n_qtde} {mat.unit} {po.d_previsao ? `(${po.d_previsao})` : ''}
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
