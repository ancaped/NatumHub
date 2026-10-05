import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import {
  Table,
  Calendar as CalendarIcon,
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  History,
  Scale,
  Package,
  Check,
  CheckCheck,
  FlaskConical,
  Sparkles,
  Calculator,
  Calendar,
  Layers,
  ArrowRight,
  Info,
  PauseCircle,
  Building2,
  Boxes,
  Tag,
  Settings,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  CheckSquare,
  Play,
  Sparkle,
  Droplets,
  FileSpreadsheet,
  Pencil,
  Flame,
  Eye,
  EyeOff,
  Undo2,
  ArrowRightLeft,
  CalendarPlus,
  Printer,
  FileText,
  FastForward
} from 'lucide-react';
import * as XLSX from 'xlsx';
import AppLayout, { SidebarItem } from '../../geral/components/layout/AppLayout';
import { cn } from '../../geral/lib/utils';
import { apiJson } from '../../geral/lib/http';
import { getAuthUser } from '../../geral/lib/auth';
import { getHoliday, isWeekend, HolidayInfo } from '../../geral/lib/brazilHolidays';
import { api } from '../../geral/lib/api';
import { FiscoQuimicaAnalysis } from '../../geral/lib/types';

export interface StatusHistoryEntry {
  id: number;
  loteNumber: string;
  status: string;
  category?: string | null;
  changedBy?: string | null;
  changedAt: string;
  notes?: string | null;
}

export interface AcompanhamentoLote {
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;       // Unidades
  quantityKg: number;     // Kg do lote completo
  date: string;
  erpStatus: string;
  erpStatusLabel: string;
  customStatus?: string | null;
  category?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  notes?: string | null;
  dataPesagem?: string | null;
  dataProducao?: string | null;
  dataLiberadoEnvase?: string | null;
  dataEnvase?: string | null;
  dataRotulagem?: string | null;
  dataFinalizada?: string | null;
  dataEmEspera?: string | null;
  dataPrevisao?: string | null;
  motivoEspera?: string | null;
  isTerceirizado: boolean;
  fornecedorTerceirizado?: string | null;
  fornecedor_terceirizado?: string | null;
  fichaOrdem?: any | null;
  ficha_ordem?: any | null;
  quantidadeEnvasadaParcial?: number | null;
  quantidade_envasada_parcial?: number | null;
  insumoFaltanteCodigo?: string | null;
  insumo_faltante_codigo?: string | null;
  insumoFaltanteDescricao?: string | null;
  insumo_faltante_descricao?: string | null;
  quadrosOcultos?: string[] | null;
  quadros_ocultos?: string[] | null;
  historicoReagendamentos?: any[] | null;
  historico_reagendamentos?: any[] | null;
  etapasStatus?: Record<string, {
    status?: string | null;
    motivoEspera?: string | null;
    insumoFaltanteCodigo?: string | null;
    insumoFaltanteDescricao?: string | null;
    updatedBy?: string | null;
    updatedAt?: string | null;
  }> | null;
  etapas_status?: any | null;
}

export interface LoteAdiadoRegistro {
  id: string;
  loteNumber: string;
  productCode?: string;
  productDescription?: string;
  quantity?: number;
  quantityKg?: number;
  dataOriginal: string;
  dataAdiadoPara: string;
  dataAcao: string;
  responsavel?: string;
  etapa?: string;
}

export interface TerceirizadoSolicitacao {
  id: number;
  productCode: string;
  productDescription: string;
  quantity: number;
  unit: string;
  quantityKg?: number | null;
  quantityUn?: number | null;
  status: 'SOLICITADO' | 'APROVADO' | 'VINCULADO' | 'CANCELADO';
  loteNumber?: string | null;
  fornecedor?: string | null;
  previsaoEntrega?: string | null;
  observacoes?: string | null;
  solicitadoPor?: string | null;
  aprovacaoEmbalagem?: boolean;
  aprovacaoEmbalagemPor?: string | null;
  aprovacaoEmbalagemEm?: string | null;
  aprovacaoMateriaPrima?: boolean;
  aprovacaoMateriaPrimaPor?: string | null;
  aprovacaoMateriaPrimaEm?: string | null;
  createdAt: string;
  vinculadoEm?: string | null;
}

export interface ProgramacaoEnvaseItem {
  id: number;
  dataProgramada: string;
  linha: string; // 'Linha 1' | 'Linha 2'
  ordem: number;
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  quantityKg: number;
  categoriaEnvase: string; // 'Shampoo' | 'Máscaras' | 'Condicionador' | 'Óleos' | 'AOX' | 'Outros'
  isColorido?: boolean;
  cor?: string | null;
  statusEnvase: string; // 'PROGRAMADO' | 'EM_ENVASE' | 'CONCLUIDO' | 'CANCELADO'
  observacoes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramacaoRotulagemItem {
  id: number | string;
  dataProgramada: string;
  tipo: 'MAQUINA' | 'MANUAL';
  ordem: number;
  loteNumber: string;
  productCode: string;
  productDescription: string;
  quantity: number;
  quantityKg: number;
  statusRotulagem: 'PROGRAMADO' | 'EM_ROTULAGEM' | 'CONCLUIDO';
  observacoes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt?: string;
}


export const CATEGORIAS_ENVASE = [
  { id: 'Shampoo', label: 'Shampoo', icon: '🧴', colorClass: 'bg-sky-100 text-sky-900 border-sky-300' },
  { id: 'Máscaras', label: 'Máscaras', icon: '🧖', colorClass: 'bg-purple-100 text-purple-900 border-purple-300' },
  { id: 'Condicionador', label: 'Condicionador', icon: '🧴', colorClass: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  { id: 'Óleos', label: 'Óleos', icon: '💧', colorClass: 'bg-amber-100 text-amber-900 border-amber-300' },
  { id: 'AOX', label: 'AOX (Oxidante)', icon: '⚗️', colorClass: 'bg-orange-100 text-orange-900 border-orange-300' },
  { id: 'Outros', label: 'Outros', icon: '📦', colorClass: 'bg-zinc-100 text-zinc-800 border-zinc-300' },
] as const;

export const CORES_PREDEFINIDAS = [
  { id: 'Branco', label: 'Branco / Neutro', hex: '#f4f4f5', dotClass: 'bg-zinc-200 border border-zinc-400', badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-300' },
  { id: 'Amarelo/Dourado', label: 'Amarelo / Dourado', hex: '#facc15', dotClass: 'bg-yellow-400', badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  { id: 'Laranja', label: 'Laranja', hex: '#fb923c', dotClass: 'bg-orange-400', badgeClass: 'bg-orange-50 text-orange-800 border-orange-300' },
  { id: 'Vermelho', label: 'Vermelho', hex: '#ef4444', dotClass: 'bg-red-500', badgeClass: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'Rosa/Pink', label: 'Rosa / Pink', hex: '#ec4899', dotClass: 'bg-pink-500', badgeClass: 'bg-pink-50 text-pink-700 border-pink-200' },
  { id: 'Ruivo/Cobre', label: 'Ruivo / Cobre', hex: '#d97706', dotClass: 'bg-amber-600', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'Roxo/Violeta', label: 'Roxo / Violeta (Matizador)', hex: '#9333ea', dotClass: 'bg-purple-600', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: 'Azul', label: 'Azul', hex: '#3b82f6', dotClass: 'bg-blue-500', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'Verde', label: 'Verde', hex: '#10b981', dotClass: 'bg-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'Castanho/Marrom', label: 'Castanho / Marrom', hex: '#78350f', dotClass: 'bg-amber-900', badgeClass: 'bg-amber-100 text-amber-950 border-amber-300' },
  { id: 'Preto', label: 'Preto', hex: '#18181b', dotClass: 'bg-zinc-900', badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-400' },
] as const;

export const ORDEM_CORES_FABRICA: Record<string, number> = {
  'Branco': 0,
  'Amarelo/Dourado': 1,
  'Laranja': 2,
  'Vermelho': 3,
  'Rosa/Pink': 4,
  'Ruivo/Cobre': 5,
  'Roxo/Violeta': 6,
  'Azul': 7,
  'Verde': 8,
  'Castanho/Marrom': 9,
  'Preto': 10,
};

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
 * Normaliza strings de pesquisa de lote removendo prefixos como 'lote ', 'op ', 'ordem ', '#', etc.
 */
export function normalizeLoteSearch(raw: string): { clean: string; cleanNoZero: string; isNumeric: boolean; originalClean: string } {
  if (!raw) return { clean: '', cleanNoZero: '', isNumeric: false, originalClean: '' };
  const originalClean = raw.trim().toLowerCase();
  const clean = originalClean
    .replace(/^(lote|op|ordem|nº|n°|n)\s*[:#-]?\s*/i, '')
    .replace(/^#/, '')
    .trim();
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
    const rawTarget = (item.loteNumber || '').trim().toLowerCase();
    const target = rawTarget.replace(/^(lote|op|ordem|nº|n°|n)\s*[:#-]?\s*/i, '').replace(/^#/, '').trim();
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
    const rawTarget = (item.loteNumber || '').trim().toLowerCase();
    const target = rawTarget.replace(/^(lote|op|ordem|nº|n°|n)\s*[:#-]?\s*/i, '').replace(/^#/, '').trim();
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
      const rawTarget = (item.loteNumber || '').trim().toLowerCase();
      const target = rawTarget.replace(/^(lote|op|ordem|nº|n°|n)\s*[:#-]?\s*/i, '').replace(/^#/, '').trim();
      const targetNoZero = target.replace(/^0+/, '');
      return target === clean || (isNumeric && cleanNoZero !== '' && targetNoZero === cleanNoZero);
    });
    if (exact.length > 0) return exact;
  }

  // 2. Se for numérico, buscar por início (startsWith) ou substring em loteNumber
  if (isNumeric && clean) {
    const startsWith = items.filter(item => {
      const rawTarget = (item.loteNumber || '').trim().toLowerCase();
      const target = rawTarget.replace(/^(lote|op|ordem|nº|n°|n)\s*[:#-]?\s*/i, '').replace(/^#/, '').trim();
      const targetNoZero = target.replace(/^0+/, '');
      return target.startsWith(clean) || (cleanNoZero !== '' && targetNoZero.startsWith(cleanNoZero));
    });
    if (startsWith.length > 0) return startsWith;

    const containsLote = items.filter(item => {
      const rawTarget = (item.loteNumber || '').trim().toLowerCase();
      const target = rawTarget.replace(/^(lote|op|ordem|nº|n°|n)\s*[:#-]?\s*/i, '').replace(/^#/, '').trim();
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

export interface KitAssemblyOrder {
  id: number;
  orderNumber: string;
  kitProductCode: string;
  kitProductDescription: string;
  quantity: number;
  status: string; // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  createdAt?: string;
  completedAt?: string;
  assembledBy?: string;
  checkedBy?: string;
  observations?: string;
  erpLaunched?: number;
  componentsLotes?: string;
  quantityAssembled?: number;
  quantity_assembled?: number;
  created_at?: string;
  completed_at?: string;
  assembled_by?: string;
  checked_by?: string;
  erp_launched?: number;
  components_lotes?: string;
}

export const STATUS_OPTIONS = [
  { value: 'Pesagem', label: 'Pesagem', category: 'Pesagem e Produção', color: 'amber' },
  { value: 'Produzido', label: 'Produzido', category: 'Pesagem e Produção', color: 'blue' },
  { value: 'Liberado para Envase', label: 'Liberado para Envase', category: 'Pesagem e Produção', color: 'teal' },
  { value: 'Rotulagem', label: 'Rotulagem', category: 'Embalagem', color: 'cyan' },
  { value: 'Envase', label: 'Envase', category: 'Embalagem', color: 'purple' },
  { value: 'Ordem Parcial', label: 'Ordem Parcial', category: 'Embalagem', color: 'indigo' },
  { value: 'Ordem Finalizada', label: 'Ordem Finalizada', category: 'Embalagem', color: 'emerald' },
] as const;

export const MOTIVOS_PAUSA_PADRAO = [
  'Falta de Insumo / Matéria-Prima',
  'Aguardando Embalagem / Frasco / Caixa',
  'Aguardando Rótulo',
  'Aguardando Laudo / CQ',
  'Manutenção / Quebra de Máquina',
  'Ajuste / Correção de Formulação',
  'Outro Motivo'
];

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function parseLoteDateToIso(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim().split(' ')[0].split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return null;
}

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const clean = iso.trim();
    const dateOnly = clean.split('T')[0].split(' ')[0];
    if (dateOnly.includes('-')) {
      const parts = dateOnly.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    }
    if (dateOnly.includes('/')) {
      const parts = dateOnly.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
      }
      return dateOnly;
    }
    const d = new Date(clean);
    return isNaN(d.getTime()) ? clean : d.toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function formatWeekdayAndDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const clean = iso.trim().split('T')[0].split(' ')[0];
    const [y, m, d] = clean.split('-').map(Number);
    if (!y || !m || !d) return formatDateOnly(iso);
    const date = new Date(y, m - 1, d);
    const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${weekdays[date.getDay()]}, ${String(d).padStart(2, '0')} de ${months[m - 1]} de ${y}`;
  } catch {
    return formatDateOnly(iso);
  }
}

function formatShortWeekday(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const clean = iso.trim().split('T')[0];
    const [y, m, d] = clean.split('-').map(Number);
    if (!y || !m || !d) return '';
    const date = new Date(y, m - 1, d);
    const shortDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return shortDays[date.getDay()] || '';
  } catch {
    return '';
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

export function formatIsoDateShort(iso: string | null | undefined): string {
  return formatDateShort(iso);
}

export function formatDurationBetween(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return '—';
  const start = new Date(startIso).getTime();
  if (isNaN(start)) return '—';
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (isNaN(end)) return '—';
  const diffMs = end - start;
  if (diffMs < 0) return '—';

  const totalMin = Math.floor(diffMs / (1000 * 60));
  if (totalMin < 1) return '< 1 min';
  const min = totalMin % 60;
  const hours = Math.floor(totalMin / 60) % 24;
  const days = Math.floor(totalMin / (60 * 24));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (min > 0 || parts.length === 0) parts.push(`${min}min`);
  return parts.join(' ');
}

export interface StageDurationItem {
  stage: string;
  label: string;
  startDate?: string | null;
  endDate?: string | null;
  durationFormatted: string;
  isActive: boolean;
  isCompleted: boolean;
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

export interface LoteEtapaStatusResult {
  status: string;
  isEspera: boolean;
  isConcluido: boolean;
  motivoEspera: string | null;
  insumoFaltanteCodigo: string | null;
  insumoFaltanteDescricao: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
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

  if (etapaEntry) {
    const isEspera = etapaEntry.status === 'Em Espera' || Boolean(etapaEntry.motivoEspera);
    const isConcluido = etapaEntry.status === 'concluido' || etapaEntry.status === 'Concluído';
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

  return {
    status: isEsperaLegado ? 'Em Espera' : 'pendente',
    isEspera: isEsperaLegado,
    isConcluido: false,
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

export function getLoteScheduleDateIso(
  lote: AcompanhamentoLote,
  etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens'
): string | null {
  // 1. Data de Previsão explícita (definida no planejamento, reagendamento, adiantamento ou ao iniciar)
  // Tem prioridade máxima absoluta porque reflete a data em que o lote está programado para ser trabalhado.
  if (lote.dataPrevisao && lote.dataPrevisao.trim()) {
    const iso = parseLoteDateToIso(lote.dataPrevisao);
    if (iso) return iso;
  }

  // 2. Se for ordens e possui data de finalização, a data de conclusão tem prioridade para histórico
  if (etapa === 'ordens' && lote.dataFinalizada) {
    const iso = parseLoteDateToIso(lote.dataFinalizada);
    if (iso) return iso;
  }

  // 3. Fallbacks caso NÃO haja dataPrevisao: data gravada de execução da etapa
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

  // Fallback: se for pesagem e não tiver dataPesagem nem dataPrevisao, mas tiver dataProducao
  if (etapa === 'pesagem' && lote.dataProducao) {
    const iso = parseLoteDateToIso(lote.dataProducao);
    if (iso) return iso;
  }

  // 4. Data de abertura da OP / Lote no ERP
  if (lote.date) {
    const iso = parseLoteDateToIso(lote.date);
    if (iso) return iso;
  }

  return null;
}

export interface WeekRange {
  startIso: string;
  endIso: string;
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

export interface LoteEsperaDetails {
  isEmEspera: boolean;
  etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | null;
  etapaLabel: string;
  motivo: string | null;
  insumoCodigo: string | null;
  insumoDescricao: string | null;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
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
    pesagem: { label: 'Pesagem', bg: 'bg-amber-500/10', text: 'text-amber-800', border: 'border-amber-300' },
    producao: { label: 'Produção', bg: 'bg-orange-500/10', text: 'text-orange-800', border: 'border-orange-300' },
    envase: { label: 'Envase', bg: 'bg-teal-500/10', text: 'text-teal-800', border: 'border-teal-300' },
    rotulagem: { label: 'Rotulagem', bg: 'bg-purple-500/10', text: 'text-purple-800', border: 'border-purple-300' },
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

export interface ColumnOption {
  value: string;
  label: string;
  count?: number;
}

export interface ColumnFilterHeaderProps {
  label?: string;
  title?: string;
  columnKey: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: any) => void;
  options?: ColumnOption[];
  allValues?: ColumnOption[];
  selectedValues?: Set<string>;
  onFilterChange?: (columnKey: string, newSelected: Set<string> | undefined) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export function ColumnFilterHeader({
  label,
  title,
  columnKey,
  sortField,
  sortOrder,
  onSort,
  options,
  allValues,
  selectedValues,
  onFilterChange,
  align = 'left',
  className = '',
}: ColumnFilterHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const popoverRef = useRef<HTMLTableCellElement>(null);

  const displayTitle = label || title || '';
  const availableOptions = options || allValues || [];

  const isFiltered = Boolean(selectedValues !== undefined);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!searchVal.trim()) return availableOptions;
    const raw = searchVal.trim().toLowerCase();
    const q = raw.replace(/^#/, '');

    if (columnKey === 'loteNumber' || /^\d+$/.test(q)) {
      const qNoZero = q.replace(/^0+/, '');
      // 1. Correspondência exata de lote
      const exact = availableOptions.filter(opt => {
        const val = (opt.value || opt.label || '').toLowerCase().replace(/^#/, '');
        return val === q || (qNoZero !== '' && val.replace(/^0+/, '') === qNoZero);
      });
      if (exact.length > 0) return exact;

      // 2. Prefixo de lote (startsWith)
      const prefix = availableOptions.filter(opt => {
        const val = (opt.value || opt.label || '').toLowerCase().replace(/^#/, '');
        return val.startsWith(q) || (qNoZero !== '' && val.replace(/^0+/, '').startsWith(qNoZero));
      });
      if (prefix.length > 0) return prefix;
    }

    return availableOptions.filter(opt =>
      (opt.label || '').toLowerCase().includes(raw) || (opt.value || '').toLowerCase().includes(raw)
    );
  }, [availableOptions, searchVal, columnKey]);

  const toggleValue = (val: string) => {
    if (!onFilterChange) return;
    const current = selectedValues || new Set(availableOptions.map(a => a.value));
    const next = new Set(current);
    if (next.has(val)) {
      next.delete(val);
    } else {
      next.add(val);
    }
    if (next.size === availableOptions.length) {
      onFilterChange(columnKey, undefined);
    } else {
      onFilterChange(columnKey, next);
    }
  };

  const handleSelectOnly = (val: string) => {
    if (onFilterChange) {
      onFilterChange(columnKey, new Set([val]));
    }
  };

  const handleSelectAll = () => {
    if (searchVal.trim()) {
      if (onFilterChange) {
        const current = selectedValues ? new Set(selectedValues) : new Set(availableOptions.map(a => a.value));
        filteredOptions.forEach(o => current.add(o.value));
        if (current.size === availableOptions.length) {
          onFilterChange(columnKey, undefined);
        } else {
          onFilterChange(columnKey, current);
        }
      }
    } else {
      if (onFilterChange) onFilterChange(columnKey, undefined);
    }
  };

  const handleClearAll = () => {
    if (searchVal.trim()) {
      if (onFilterChange) {
        const current = selectedValues ? new Set(selectedValues) : new Set(availableOptions.map(a => a.value));
        filteredOptions.forEach(o => current.delete(o.value));
        onFilterChange(columnKey, current);
      }
    } else {
      if (onFilterChange) onFilterChange(columnKey, new Set());
    }
  };

  const displayedOptions = useMemo(() => filteredOptions.slice(0, 100), [filteredOptions]);

  return (
    <th
      ref={popoverRef}
      className={cn(
        "py-3 px-3 relative select-none font-bold text-[11px] uppercase tracking-wider text-zinc-600",
        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    >
      <div className={cn(
        "flex items-center gap-1.5",
        align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-between'
      )}>
        {onSort ? (
          <button
            type="button"
            onClick={() => onSort(columnKey)}
            className="flex items-center gap-1 hover:text-zinc-900 transition-colors cursor-pointer group truncate"
          >
            <span className={cn(sortField === columnKey ? "text-zinc-900 font-extrabold" : "")}>{displayTitle}</span>
            {sortField === columnKey ? (
              <span className="text-zinc-900 font-bold text-xs">{sortOrder === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="text-zinc-300 opacity-0 group-hover:opacity-100 text-xs transition-opacity">↕</span>
            )}
          </button>
        ) : (
          <span className="truncate">{displayTitle}</span>
        )}

        {onFilterChange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(prev => !prev);
            }}
            className={cn(
              "p-1 rounded-md transition-all cursor-pointer flex items-center gap-1 shrink-0 ml-auto",
              isFiltered
                ? "bg-indigo-600 text-white shadow-xs hover:bg-indigo-700"
                : "text-zinc-400 hover:text-zinc-800 bg-zinc-100/90 hover:bg-zinc-200 border border-zinc-200/80"
            )}
            title={`Filtrar coluna: ${displayTitle}`}
          >
            <Filter className={cn("h-3 w-3", isFiltered ? "text-white" : "text-zinc-500")} />
            {isFiltered && (
              <span className="text-[9px] font-mono font-bold leading-none bg-indigo-800 px-1 py-0.5 rounded">
                {selectedValues!.size}
              </span>
            )}
          </button>
        )}
      </div>

      {isOpen && onFilterChange && (
        <div
          className={cn(
            "absolute z-50 top-full mt-1.5 min-w-[240px] max-w-xs bg-white rounded-xl border border-zinc-200 shadow-2xl p-3 text-left normal-case tracking-normal font-normal text-xs animate-in fade-in zoom-in-95 duration-150",
            align === 'right' ? "right-0 left-auto" : "left-0"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100 font-bold text-zinc-900 text-xs">
            <span className="truncate">Filtrar: {displayTitle}</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {availableOptions.length > 5 && (
            <div className="relative my-2">
              <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Buscar valor..."
                className="w-full pl-7 pr-2.5 py-1 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:bg-white focus:ring-1 focus:ring-zinc-900"
                autoFocus
              />
            </div>
          )}

          <div className="flex items-center justify-between py-1.5 px-0.5 text-[11px] text-zinc-500">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
            >
              Selecionar Todos
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
            >
              Limpar
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-0.5 py-1 pr-1">
            {displayedOptions.length === 0 ? (
              <p className="text-zinc-400 text-center py-3 text-[11px]">Nenhum valor disponível</p>
            ) : (
              <>
                {displayedOptions.map((opt) => {
                  const checked = !selectedValues || selectedValues.has(opt.value);
                  return (
                    <div
                      key={opt.value}
                      className="flex items-center justify-between group/opt px-2 py-1 hover:bg-zinc-100 rounded-lg cursor-pointer text-zinc-700 hover:text-zinc-900 text-xs transition-colors"
                    >
                      <label className="flex items-center gap-2 truncate flex-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleValue(opt.value)}
                          className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="truncate" title={opt.label}>{opt.label}</span>
                      </label>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSelectOnly(opt.value);
                          }}
                          className="opacity-0 group-hover/opt:opacity-100 text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline px-1 py-0.5 rounded transition-opacity cursor-pointer font-semibold"
                          title={`Filtrar somente por "${opt.label}"`}
                        >
                          Somente
                        </button>
                        {opt.count !== undefined && (
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {opt.count}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredOptions.length > 100 && (
                  <div className="pt-2 pb-1 text-center">
                    <p className="text-[10px] text-zinc-400 font-medium">
                      Exibindo 100 de {filteredOptions.length} opções (utilize a busca para refinar)
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </th>
  );
}

interface Props {
  onBack: () => void;
}

export default function AcompanhamentoProducaoView({ onBack }: Props) {
  const currentUser = getAuthUser();

  // Navegação por Sidebar: 'lotes' | 'quadro_pesagem' | 'quadro_producao' | 'quadro_rotulagem' | 'quadro_envase' | 'quadro_ordens' | 'terceirizados' | 'kits' | 'calendar' | 'configuracoes'
  type TabType = 'lotes' | 'quadro_pesagem' | 'quadro_producao' | 'quadro_rotulagem' | 'quadro_envase' | 'quadro_ordens' | 'terceirizados' | 'kits' | 'calendar' | 'configuracoes';
  const [currentTab, setCurrentTab] = useState<TabType>('lotes');

  // Dados de Lotes (Internos e Terceirizados)
  const [lotes, setLotes] = useState<AcompanhamentoLote[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLote, setSavingLote] = useState<string | null>(null);

  // Seleção Múltipla de Lotes para mudança de status em massa
  const [selectedLotes, setSelectedLotes] = useState<Set<string>>(new Set());
  const [batchStatusValue, setBatchStatusValue] = useState<string>('');
  const [isBatchUpdating, setIsBatchUpdating] = useState<boolean>(false);
  const [showBatchEsperaModal, setShowBatchEsperaModal] = useState<boolean>(false);
  const [batchEsperaMotivo, setBatchEsperaMotivo] = useState<string>('Aguardando Rótulo');
  const [batchCustomMotivo, setBatchCustomMotivo] = useState<string>('');

  // Dados de Ordens de Montagem de Kits
  const [kitOrders, setKitOrders] = useState<KitAssemblyOrder[]>([]);
  const [loadingKits, setLoadingKits] = useState(false);
  // Filtros de Lotes por Coluna (Estilo Planilha)
  const [lotesColumnFilters, setLotesColumnFilters] = useState<Record<string, Set<string>>>({});
  const [solicColumnFilters, setSolicColumnFilters] = useState<Record<string, Set<string>>>({});
  const [kitsColumnFilters, setKitsColumnFilters] = useState<Record<string, Set<string>>>({});

  // Busca Geral
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);



  const [kitOrdersSearch, setKitOrdersSearch] = useState('');
  const [solicitacoesSearch, setSolicitacoesSearch] = useState('');

  // Ordenação de Lotes
  const [sortField, setSortField] = useState<keyof AcompanhamentoLote>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal de Histórico de Mudanças de Status
  const [historyModalLote, setHistoryModalLote] = useState<AcompanhamentoLote | null>(null);
  const [historyList, setHistoryList] = useState<StatusHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modal para Pausar / Editar Pausa do Lote
  const [pauseModalLote, setPauseModalLote] = useState<AcompanhamentoLote | null>(null);
  const [pauseModalEtapa, setPauseModalEtapa] = useState<'pesagem' | 'producao' | 'rotulagem' | 'envase'>('pesagem');
  const [pauseTipoMotivo, setPauseTipoMotivo] = useState<string>('Falta de Insumo / Matéria-Prima');
  const [pauseMotivoCustom, setPauseMotivoCustom] = useState<string>('');
  const [pauseInsumoCodigo, setPauseInsumoCodigo] = useState<string>('');
  const [pauseInsumoDescricao, setPauseInsumoDescricao] = useState<string>('');
  const [pauseLoadingInsumo, setPauseLoadingInsumo] = useState<boolean>(false);
  const [savingPause, setSavingPause] = useState<boolean>(false);

  // Filtro de Insumo Faltante
  const [selectedInsumoFaltanteFilter, setSelectedInsumoFaltanteFilter] = useState<string>('TODOS');

  // Navegação de Datas em Pesagem, Produção, Rotulagem, Envase e Ordens
  const [pesagemSelectedDate, setPesagemSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [pesagemShowAllDates, setPesagemShowAllDates] = useState<boolean>(false);
  const [pesagemFilaFilter, setPesagemFilaFilter] = useState<'TODOS' | 'ESPERA'>('TODOS');

  const [producaoSelectedDate, setProducaoSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [producaoShowAllDates, setProducaoShowAllDates] = useState<boolean>(false);
  const [producaoFilaFilter, setProducaoFilaFilter] = useState<'TODOS' | 'ESPERA'>('TODOS');

  const [rotulagemSelectedDate, setRotulagemSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [rotulagemShowAllDates, setRotulagemShowAllDates] = useState<boolean>(false);

  const [ordensSelectedDate, setOrdensSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [ordensShowAllDates, setOrdensShowAllDates] = useState<boolean>(false);

  const [envaseShowAllDates, setEnvaseShowAllDates] = useState<boolean>(false);
  const [rotulagemScopeFilter, setRotulagemScopeFilter] = useState<'LIBERADOS' | 'TODOS'>('LIBERADOS');
  const [envaseScopeFilter, setEnvaseScopeFilter] = useState<'LIBERADOS' | 'TODOS'>('LIBERADOS');

  // Dados de Análises Físico-Química
  const [fiscoAnalyses, setFiscoAnalyses] = useState<FiscoQuimicaAnalysis[]>([]);

  // Modal para Ajuste Manual de Datas e Horários das Etapas
  const [editTimestampsLote, setEditTimestampsLote] = useState<AcompanhamentoLote | null>(null);
  const [timestampsForm, setTimestampsForm] = useState({
    dataPesagem: '',
    dataProducao: '',
    dataLiberadoEnvase: '',
    dataEnvase: '',
    dataRotulagem: '',
    dataFinalizada: '',
    dataPrevisao: '',
  });
  const [savingTimestamps, setSavingTimestamps] = useState(false);

  // Modal de Apontamento de Envase Parcial
  const [parcialModalLote, setParcialModalLote] = useState<AcompanhamentoLote | null>(null);
  const [savingParcial, setSavingParcial] = useState(false);
  const [novoApontamento, setNovoApontamento] = useState({
    data: '',
    quantidade: '',
    observacao: '',
  });

  // Modal para Atualizar Ordem de Kit
  const [selectedKitOrder, setSelectedKitOrder] = useState<KitAssemblyOrder | null>(null);
  const [savingKitOrder, setSavingKitOrder] = useState(false);

  // Notificação Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Feedback visual imediato ao alterar Status Nosso
  const [recentlyUpdatedLotes, setRecentlyUpdatedLotes] = useState<Record<string, { status: string; timestamp: number }>>({});

  // Calendário & Quadro de Envase
  const today = useMemo(() => new Date(), []);
  const [calendarViewMode, setCalendarViewMode] = useState<'quadro_envase' | 'mensal'>('quadro_envase');
  const [envaseSelectedDate, setEnvaseSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [programacaoEnvase, setProgramacaoEnvase] = useState<ProgramacaoEnvaseItem[]>([]);
  const [loadingEnvase, setLoadingEnvase] = useState(false);
  const [envaseCategoryFilter, setEnvaseCategoryFilter] = useState<string>('TODOS');
  const [encaixeSearch, setEncaixeSearch] = useState<string>('');
  const [envaseSearch, setEnvaseSearch] = useState<string>('');
  const [encaixeStatusFilter, setEncaixeStatusFilter] = useState<string>('TODOS');
  const [encaixeOnlyProblemas, setEncaixeOnlyProblemas] = useState<boolean>(false);
  const [encaixeCategoryOverrides, setEncaixeCategoryOverrides] = useState<Record<string, string>>({});
  const [showAddManualModal, setShowAddManualModal] = useState(false);

  // Modal de Encaixe Personalizado (Linha, Categoria, Cor)
  const [encaixarModalLote, setEncaixarModalLote] = useState<AcompanhamentoLote | null>(null);
  const [modalEncaixeLinha, setModalEncaixeLinha] = useState<'Linha 1' | 'Linha 2'>('Linha 1');
  const [modalEncaixeCategoria, setModalEncaixeCategoria] = useState<string>('Shampoo');
  const [modalEncaixeIsColorido, setModalEncaixeIsColorido] = useState<boolean>(false);
  const [modalEncaixeCor, setModalEncaixeCor] = useState<string>('Branco');
  const [modalEncaixeCustomCor, setModalEncaixeCustomCor] = useState<string>('');
  const [modalEncaixeOrdem, setModalEncaixeOrdem] = useState<number | ''>('');
  const [savingEncaixeModal, setSavingEncaixeModal] = useState<boolean>(false);
  // Modal de Edição de Lote Terceirizado (Fornecedor e Previsão)
  const [editTerceirizadoLote, setEditTerceirizadoLote] = useState<AcompanhamentoLote | null>(null);
  const [editTerceirizadoFornecedor, setEditTerceirizadoFornecedor] = useState<string>('');
  const [editTerceirizadoPrevisao, setEditTerceirizadoPrevisao] = useState<string>('');
  const [savingTerceirizado, setSavingTerceirizado] = useState<boolean>(false);

  // Sequência de Ordenação Manual no Quadro de Produção
  const [producaoOrderOverrides, setProducaoOrderOverrides] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('natum_producao_order_overrides');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  // Sequência de Ordenação Manual no Quadro de Pesagem
  const [pesagemOrderOverrides, setPesagemOrderOverrides] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('natum_pesagem_order_overrides');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  // Inclusões Manuais em Liberados para Envase e Filas
  const [manualLiberadosEnvase, setManualLiberadosEnvase] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('natum_manual_liberados_envase');
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [manualFilasAdicionados, setManualFilasAdicionados] = useState<Record<'pesagem' | 'producao' | 'rotulagem', string[]>>(() => {
    try {
      const s = localStorage.getItem('natum_filas_manuais_adicionados');
      return s ? JSON.parse(s) : { pesagem: [], producao: [], rotulagem: [] };
    } catch {
      return { pesagem: [], producao: [], rotulagem: [] };
    }
  });

  // Modal para Adicionar Lote a qualquer fila
  const [addLoteModalTarget, setAddLoteModalTarget] = useState<'pesagem' | 'producao' | 'rotulagem' | 'envase' | null>(null);
  const [addLoteModalSearch, setAddLoteModalSearch] = useState<string>('');


  // Filtros do Quadro de Pesagem
  const [pesagemSearch, setPesagemSearch] = useState<string>('');
  const [pesagemStatusFilter, setPesagemStatusFilter] = useState<'TODOS' | 'AGUARDANDO' | 'EM_PESAGEM'>('TODOS');

  // Filtros e Sub-quadros do Quadro de Produção
  const [producaoSearch, setProducaoSearch] = useState<string>('');
  const [producaoCategoryFilter, setProducaoCategoryFilter] = useState<string>('TODOS');
  const [producaoSubTab, setProducaoSubTab] = useState<'reatores' | 'caldeira' | 'todos'>('reatores');
  const [caldeiraSearch, setCaldeiraSearch] = useState<string>('');

  // Quadro de Rotulagem
  const [programacaoRotulagem, setProgramacaoRotulagem] = useState<ProgramacaoRotulagemItem[]>([]);
  const [loadingRotulagem, setLoadingRotulagem] = useState<boolean>(false);
  const [rotulagemSearch, setRotulagemSearch] = useState<string>('');
  const [rotulagemStatusFilter, setRotulagemStatusFilter] = useState<'TODOS' | 'PROGRAMADO' | 'EM_ROTULAGEM' | 'CONCLUIDO'>('TODOS');
  const [rotulagemOnlyProblemas, setRotulagemOnlyProblemas] = useState<boolean>(false);

  // Filtros do Quadro de Ordens
  const [ordensSearch, setOrdensSearch] = useState<string>('');

  // Detalhes do Item Contextual por Quadro
  const [selectedLoteDetails, setSelectedLoteDetails] = useState<{
    lote: AcompanhamentoLote;
    quadro: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens';
    programacaoItem?: any;
  } | null>(null);

  // Modal de Espera do Envase
  const [envaseEsperaItem, setEnvaseEsperaItem] = useState<ProgramacaoEnvaseItem | null>(null);
  const [envaseEsperaMotivo, setEnvaseEsperaMotivo] = useState<string>('Falta de Embalagem / Frasco');
  const [envaseEsperaCustom, setEnvaseEsperaCustom] = useState<string>('');
  const [envaseEsperaParcialQtd, setEnvaseEsperaParcialQtd] = useState<string>('');
  const [envaseEsperaMotivoRestante, setEnvaseEsperaMotivoRestante] = useState<string>('');

  // Histórico de Lotes Adiados
  const [lotesAdiadosHistorico, setLotesAdiadosHistorico] = useState<LoteAdiadoRegistro[]>(() => {
    try {
      const s = localStorage.getItem('natum_lotes_adiados_historico');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  // Lotes concluídos em Pesagem e Produção para manter card visível com toggle verde/reversão
  const [pesagemConcluidosLotes, setPesagemConcluidosLotes] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('natum_pesagem_concluidos_lotes');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  const [producaoConcluidosLotes, setProducaoConcluidosLotes] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('natum_producao_concluidos_lotes');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  // Status e pausas isoladas por etapa (Pesagem, Produção, Rotulagem, Envase)
  const [localEtapasStatus, setLocalEtapasStatus] = useState<Record<string, Record<string, any>>>(() => {
    try {
      const s = localStorage.getItem('natum_etapas_status');
      return s ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  });

  // Salva o status de uma etapa específica (Pesagem, Produção, Rotulagem ou Envase) de forma 100% isolada
  const saveEtapaStatus = useCallback(async (
    loteNumber: string,
    etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase',
    status: string,
    motivoEspera?: string | null,
    insumoFaltanteCodigo?: string | null,
    insumoFaltanteDescricao?: string | null,
    updatedBy?: string
  ) => {
    const responsible = updatedBy || (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
    const nowIso = new Date().toISOString();

    // 1. Atualização otimista no cache local e localStorage
    setLocalEtapasStatus(prev => {
      const lotePrev = prev[loteNumber] || {};
      const next = {
        ...prev,
        [loteNumber]: {
          ...lotePrev,
          [etapa]: {
            status,
            motivoEspera: motivoEspera || null,
            insumoFaltanteCodigo: insumoFaltanteCodigo || null,
            insumoFaltanteDescricao: insumoFaltanteDescricao || null,
            updatedBy: responsible,
            updatedAt: nowIso,
          }
        }
      };
      try {
        localStorage.setItem('natum_etapas_status', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. Atualização otimista na lista de lotes em memória
    setLotes(prev => prev.map(l => {
      if (l.loteNumber !== loteNumber) return l;
      const currentEtapas = l.etapasStatus || (l as any).etapas_status || {};
      return {
        ...l,
        etapasStatus: {
          ...currentEtapas,
          [etapa]: {
            status,
            motivoEspera: motivoEspera || null,
            insumoFaltanteCodigo: insumoFaltanteCodigo || null,
            insumoFaltanteDescricao: insumoFaltanteDescricao || null,
            updatedBy: responsible,
            updatedAt: nowIso,
          }
        }
      };
    }));

    // 3. Persistência no backend (Postgres via rota dedicada de etapa)
    try {
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/etapa-status`, {
        method: 'POST',
        body: JSON.stringify({
          etapa,
          status,
          motivoEspera: motivoEspera || null,
          insumoFaltanteCodigo: insumoFaltanteCodigo || null,
          insumoFaltanteDescricao: insumoFaltanteDescricao || null,
          updatedBy: responsible,
        })
      });
    } catch (err) {
      console.error(`Erro ao persistir etapa ${etapa} do lote #${loteNumber}:`, err);
    }
  }, [currentUser]);

  // Filtros de Problemas / Falta para Pesagem e Produção
  const [pesagemOnlyProblemas, setPesagemOnlyProblemas] = useState<boolean>(false);
  const [producaoOnlyProblemas, setProducaoOnlyProblemas] = useState<boolean>(false);

  // Quadro de Caldeira (Processamento Térmico em Produção)
  interface CaldeiraRegistro {
    id: string;
    ligouEm: string;
    desligouEm?: string;
    operador: string;
    lotes: string[];
    observacoes?: string;
  }
  const [caldeiraAtiva, setCaldeiraAtiva] = useState<{ ligouEm: string; operador: string; lotes: string[] } | null>(() => {
    try {
      const s = localStorage.getItem('natum_caldeira_ativa');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const [caldeiraHistorico, setCaldeiraHistorico] = useState<CaldeiraRegistro[]>(() => {
    try {
      const s = localStorage.getItem('natum_caldeira_historico');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  const [lotesComCaldeira, setLotesComCaldeira] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('natum_lotes_com_caldeira');
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [showCaldeiraView, setShowCaldeiraView] = useState<boolean>(false);

  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [calendarSearch, setCalendarSearch] = useState('');
  const [calendarStatusFilter, setCalendarStatusFilter] = useState<string>('ABERTO');
  const [selectedDateIso, setSelectedDateIso] = useState<string | null>(null);

  // Previsão de Produção
  const [editingPrevisaoLote, setEditingPrevisaoLote] = useState<string | null>(null);
  const [tempPrevisaoVal, setTempPrevisaoVal] = useState<string>('');
  const [savingPrevisao, setSavingPrevisao] = useState(false);

  // Sub-Aba Terceirizados & Solicitações (Default: 'solicitados' para acesso imediato)
  const [terceirizadosSubTab, setTerceirizadosSubTab] = useState<'solicitados' | 'acompanhamento'>('solicitados');
  const [solicitacoes, setSolicitacoes] = useState<TerceirizadoSolicitacao[]>([]);
  const [loadingSolicitacoes, setLoadingSolicitacoes] = useState(false);

  // Modal Nova Solicitação
  const [showNovaSolicitacaoModal, setShowNovaSolicitacaoModal] = useState(false);
  const [solicProductCode, setSolicProductCode] = useState('');
  const [solicProductDesc, setSolicProductDesc] = useState('');
  const [solicQuantityKg, setSolicQuantityKg] = useState('');
  const [solicQuantityUn, setSolicQuantityUn] = useState('');
  const [solicUnitWeight, setSolicUnitWeight] = useState<number | null>(null);
  const [isCustomWeight, setIsCustomWeight] = useState(false);
  const [loadingProductLookup, setLoadingProductLookup] = useState(false);
  const [solicFornecedor, setSolicFornecedor] = useState('');
  const [solicPrevisao, setSolicPrevisao] = useState('');
  const [solicObservacoes, setSolicObservacoes] = useState('');
  const [solicLoteNumber, setSolicLoteNumber] = useState('');
  const [savingSolicitacao, setSavingSolicitacao] = useState(false);

  // Modal Vínculo Manual
  const [showVincularModal, setShowVincularModal] = useState<TerceirizadoSolicitacao | null>(null);
  const [vincularLoteInput, setVincularLoteInput] = useState('');
  const [savingVinculo, setSavingVinculo] = useState(false);
  const [loadingLotesRecentes, setLoadingLotesRecentes] = useState(false);

  // Edição Inline de Previsão na Solicitação de Terceirizado
  const [editingPrevisaoSolicId, setEditingPrevisaoSolicId] = useState<number | null>(null);
  const [tempPrevisaoSolicVal, setTempPrevisaoSolicVal] = useState<string>('');
  const [savingPrevisaoSolic, setSavingPrevisaoSolic] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Carregar lotes da API (preservando lotes buscados remotamente que não constem na fatia inicial)
  const fetchLotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<AcompanhamentoLote[]>('/api/administrativo/acompanhamento-producao');
      setLotes(prev => {
        const freshList = Array.isArray(data) ? data : [];
        if (prev.length === 0) return freshList;

        const getKey = (l: AcompanhamentoLote) => `${(l.loteNumber || '').trim().toLowerCase()}__${(l.productCode || '').trim().toLowerCase()}`;
        const freshKeys = new Set(freshList.map(getKey));

        // Preserva lotes já presentes no estado (ex: buscados remotamente ou com status operacional) que não vieram na listagem padrão
        const preserved: AcompanhamentoLote[] = [];
        for (const old of prev) {
          const k = getKey(old);
          if (!freshKeys.has(k)) {
            preserved.push(old);
          }
        }
        return preserved.length > 0 ? [...freshList, ...preserved] : freshList;
      });
    } catch (err) {
      console.error("Erro ao carregar lotes de acompanhamento:", err);
      showToast("Não foi possível carregar os lotes de produção.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Cache de buscas remotas para evitar requisições redundantes
  const remoteLookupCache = useRef<Set<string>>(new Set());

  // Busca remota de fallback: caso o operador pesquise um lote não presente na memória inicial
  const performRemoteLookup = useCallback(async (query: string) => {
    const { clean, isNumeric } = normalizeLoteSearch(query);
    if (!clean || clean.length < 3) return;

    // Se já estiver em memória com correspondência exata, não precisa consultar o servidor
    const localExact = lotes.find(l => {
      const rawTarget = (l.loteNumber || '').trim().toLowerCase();
      const target = rawTarget.replace(/^(lote|op|ordem|nº|n°|n)\s*[:#-]?\s*/i, '').replace(/^#/, '').trim();
      const targetNoZero = target.replace(/^0+/, '');
      return target === clean || (isNumeric && targetNoZero === clean.replace(/^0+/, ''));
    });
    if (localExact) return;

    const cacheKey = clean.toLowerCase();
    if (remoteLookupCache.current.has(cacheKey)) return;
    remoteLookupCache.current.add(cacheKey);

    try {
      const data = await apiJson<AcompanhamentoLote[]>(`/api/administrativo/acompanhamento-producao?search=${encodeURIComponent(clean)}`);
      if (Array.isArray(data) && data.length > 0) {
        setLotes(prev => {
          const getKey = (l: AcompanhamentoLote) => `${(l.loteNumber || '').trim().toLowerCase()}__${(l.productCode || '').trim().toLowerCase()}`;
          const existingKeys = new Set(prev.map(getKey));
          let added = false;
          const next = [...prev];
          for (const item of data) {
            const k = getKey(item);
            if (!existingKeys.has(k)) {
              next.unshift(item);
              existingKeys.add(k);
              added = true;
            }
          }
          return added ? next : prev;
        });
      }
    } catch (err) {
      console.warn('[RemoteLookup] Erro ao consultar lote no backend:', err);
    }
  }, [lotes]);

  // Monitorar inputs de busca para carregar do backend caso não esteja em memória
  useEffect(() => {
    const activeQuery = pesagemSearch.trim() || producaoSearch.trim() || encaixeSearch.trim() || rotulagemSearch.trim() || ordensSearch.trim();
    if (!activeQuery) return;
    const { clean } = normalizeLoteSearch(activeQuery);
    if (!clean || clean.length < 3) return;

    const timer = setTimeout(() => {
      performRemoteLookup(clean);
    }, 350);
    return () => clearTimeout(timer);
  }, [pesagemSearch, producaoSearch, encaixeSearch, rotulagemSearch, ordensSearch, performRemoteLookup]);

  // Carregar ordens de montagem de Kits
  const fetchKitOrders = useCallback(async () => {
    setLoadingKits(true);
    try {
      const data = await apiJson<KitAssemblyOrder[]>('/api/kits/orders');
      setKitOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao carregar ordens de kits:", err);
    } finally {
      setLoadingKits(false);
    }
  }, []);

  // Carregar solicitações de terceirizados
  const fetchSolicitacoes = useCallback(async () => {
    setLoadingSolicitacoes(true);
    try {
      const data = await apiJson<TerceirizadoSolicitacao[]>('/api/administrativo/terceirizados/solicitacoes');
      setSolicitacoes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erro ao carregar solicitações de terceirizados:", err);
    } finally {
      setLoadingSolicitacoes(false);
    }
  }, []);

  // Carregar programação de envase para a data selecionada
  const fetchProgramacaoEnvase = useCallback(async (dateStr: string) => {
    setLoadingEnvase(true);
    try {
      const data = await apiJson<ProgramacaoEnvaseItem[]>(`/api/administrativo/envase/programacao?data=${encodeURIComponent(dateStr)}`);
      setProgramacaoEnvase(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Erro ao carregar programação de envase:", e);
      showToast("Não foi possível carregar a programação de envase.", "error");
    } finally {
      setLoadingEnvase(false);
    }
  }, []);

  // Carregar programação de rotulagem
  const fetchProgramacaoRotulagem = useCallback(async (dateStr: string = 'TODOS') => {
    setLoadingRotulagem(true);
    try {
      const data = await apiJson<ProgramacaoRotulagemItem[]>(`/api/administrativo/rotulagem/programacao?data=${encodeURIComponent(dateStr)}`);
      setProgramacaoRotulagem(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Erro ao carregar programação de rotulagem:", e);
      showToast("Não foi possível carregar a programação de rotulagem.", "error");
    } finally {
      setLoadingRotulagem(false);
    }
  }, []);

  // Carregar análises físico-químicas
  const fetchFiscoAnalyses = useCallback(async () => {
    try {
      const data = await api.getFiscoQuimicaAnalyses();
      setFiscoAnalyses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[FQ] Erro ao carregar análises físico-químicas:', err);
    }
  }, []);

  const fiscoAnalysesByBatch = useMemo(() => {
    const map = new Map<string, FiscoQuimicaAnalysis>();
    fiscoAnalyses.forEach(a => {
      if (a.batch) {
        const clean = a.batch.trim().toLowerCase();
        map.set(clean, a);
        const noZero = clean.replace(/^0+/, '');
        if (noZero) map.set(noZero, a);
      }
    });
    return map;
  }, [fiscoAnalyses]);

  const renderFiscoQuimicaBadge = (_loteNumber?: string | null) => {
    // Conforme solicitado no feedback s52yeds57lb: removida tag 'conforme / pH' dos cards de envase/produção
    return null;
  };

  // Ajuste Manual de Datas e Horários das Etapas
  const handleOpenEditTimestamps = (lote: AcompanhamentoLote) => {
    setEditTimestampsLote(lote);
    const formatInputDateTime = (iso?: string | null) => {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      } catch {
        return '';
      }
    };

    setTimestampsForm({
      dataPesagem: formatInputDateTime(lote.dataPesagem),
      dataProducao: formatInputDateTime(lote.dataProducao),
      dataLiberadoEnvase: formatInputDateTime(lote.dataLiberadoEnvase),
      dataEnvase: formatInputDateTime(lote.dataEnvase),
      dataRotulagem: formatInputDateTime(lote.dataRotulagem),
      dataFinalizada: formatInputDateTime(lote.dataFinalizada),
      dataPrevisao: lote.dataPrevisao ? lote.dataPrevisao.split('T')[0] : '',
    });
  };

  const handleSaveTimestamps = async () => {
    if (!editTimestampsLote) return;
    setSavingTimestamps(true);
    try {
      const payload = {
        dataPesagem: timestampsForm.dataPesagem ? new Date(timestampsForm.dataPesagem).toISOString() : null,
        dataProducao: timestampsForm.dataProducao ? new Date(timestampsForm.dataProducao).toISOString() : null,
        dataLiberadoEnvase: timestampsForm.dataLiberadoEnvase ? new Date(timestampsForm.dataLiberadoEnvase).toISOString() : null,
        dataEnvase: timestampsForm.dataEnvase ? new Date(timestampsForm.dataEnvase).toISOString() : null,
        dataRotulagem: timestampsForm.dataRotulagem ? new Date(timestampsForm.dataRotulagem).toISOString() : null,
        dataFinalizada: timestampsForm.dataFinalizada ? new Date(timestampsForm.dataFinalizada).toISOString() : null,
        dataPrevisao: timestampsForm.dataPrevisao || null,
      };

      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(editTimestampsLote.loteNumber)}/timestamps`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const updatedLote: AcompanhamentoLote = {
        ...editTimestampsLote,
        ...payload,
      };

      setLotes(prev => prev.map(l => l.loteNumber === editTimestampsLote.loteNumber ? updatedLote : l));
      showToast(`Datas do lote #${editTimestampsLote.loteNumber} salvas com sucesso!`);
      setEditTimestampsLote(null);
    } catch (err: any) {
      console.error('Erro ao salvar datas do lote:', err);
      showToast(`Erro ao salvar datas: ${err?.message || err}`, 'error');
    } finally {
      setSavingTimestamps(false);
    }
  };

  const getCurrentBoardDate = useCallback(() => {
    if (currentTab === 'quadro_pesagem') return pesagemSelectedDate;
    if (currentTab === 'quadro_producao') return producaoSelectedDate;
    if (currentTab === 'quadro_envase') return envaseSelectedDate;
    if (currentTab === 'quadro_rotulagem') return rotulagemSelectedDate;
    if (currentTab === 'quadro_ordens') return ordensSelectedDate;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [currentTab, pesagemSelectedDate, producaoSelectedDate, envaseSelectedDate, rotulagemSelectedDate, ordensSelectedDate]);

  // =========================================================================
  // RELATÓRIO DE PROGRAMAÇÃO DE ENVASE (IMPRESSÃO E EXPORTAÇÃO PERSONALIZADA)
  // =========================================================================
  const [showRelatorioEnvaseModal, setShowRelatorioEnvaseModal] = useState<boolean>(false);
  const [loadingRelatorioEnvase, setLoadingRelatorioEnvase] = useState<boolean>(false);
  const [relatorioDataInicio, setRelatorioDataInicio] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [relatorioDataFim, setRelatorioDataFim] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [relatorioLinhaFilter, setRelatorioLinhaFilter] = useState<'TODAS' | 'Linha 1' | 'Linha 2' | 'Linha 3'>('TODAS');
  const [relatorioStatusFilter, setRelatorioStatusFilter] = useState<'TODOS' | 'PROGRAMADO' | 'EM_ENVASE' | 'EM_ESPERA' | 'CONCLUIDO'>('TODOS');
  const [relatorioSearch, setRelatorioSearch] = useState<string>('');
  const [relatorioAgrupamento, setRelatorioAgrupamento] = useState<'linha' | 'tabela' | 'produto'>('linha');
  const [relatorioIncluirLiberados, setRelatorioIncluirLiberados] = useState<boolean>(false);

  const handleSetRelatorioPeriod = (type: 'hoje' | 'amanha' | 'semana' | '7dias' | 'mes') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (type === 'hoje') {
      const todayIso = toIso(now);
      setRelatorioDataInicio(todayIso);
      setRelatorioDataFim(todayIso);
    } else if (type === 'amanha') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowIso = toIso(tomorrow);
      setRelatorioDataInicio(tomorrowIso);
      setRelatorioDataFim(tomorrowIso);
    } else if (type === 'semana') {
      const current = new Date(now);
      const day = current.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(current);
      monday.setDate(current.getDate() + diffToMonday);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      setRelatorioDataInicio(toIso(monday));
      setRelatorioDataFim(toIso(friday));
    } else if (type === '7dias') {
      const end = new Date(now);
      end.setDate(now.getDate() + 6);
      setRelatorioDataInicio(toIso(now));
      setRelatorioDataFim(toIso(end));
    } else if (type === 'mes') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setRelatorioDataInicio(toIso(firstDay));
      setRelatorioDataFim(toIso(lastDay));
    }
  };

  const handleOpenRelatorioEnvaseModal = async () => {
    setShowRelatorioEnvaseModal(true);
    if (envaseSelectedDate) {
      setRelatorioDataInicio(envaseSelectedDate);
      setRelatorioDataFim(envaseSelectedDate);
    }
    setLoadingRelatorioEnvase(true);
    try {
      const allData = await apiJson<ProgramacaoEnvaseItem[]>(`/api/administrativo/envase/programacao?data=TODOS`);
      if (Array.isArray(allData)) {
        setProgramacaoEnvase(allData);
      }
    } catch (err) {
      console.warn("Erro ao recarregar dados de envase para relatório:", err);
    } finally {
      setLoadingRelatorioEnvase(false);
    }
  };

  // =========================================================================
  // MODAL & FLUXO DE ADIAMENTO DE LOTE (SELEÇÃO DE DATA)
  // =========================================================================
  interface AdiarModalItem {
    loteNumber: string;
    productCode: string;
    productDescription: string;
    currentDate: string; // YYYY-MM-DD
    targetDate: string;  // YYYY-MM-DD
    etapaLabel: string;
    origem: 'envase_linha' | 'envase_liberados' | 'ordens' | 'pesagem' | 'producao' | 'rotulagem';
    realLote?: AcompanhamentoLote;
    envaseItem?: ProgramacaoEnvaseItem;
  }

  const [adiarModalItem, setAdiarModalItem] = useState<AdiarModalItem | null>(null);
  const [savingAdiarLote, setSavingAdiarLote] = useState(false);

  const handleOpenAdiarModal = (params: {
    loteNumber: string;
    productCode: string;
    productDescription: string;
    currentDate?: string | null;
    etapaLabel?: string;
    origem: 'envase_linha' | 'envase_liberados' | 'ordens' | 'pesagem' | 'producao' | 'rotulagem';
    realLote?: AcompanhamentoLote;
    envaseItem?: ProgramacaoEnvaseItem;
  }) => {
    const currentBoardDate = getCurrentBoardDate();
    const baseDate = params.currentDate ? parseLoteDateToIso(params.currentDate) || currentBoardDate : currentBoardDate;

    // Próximo dia por padrão
    const [y, m, d] = (baseDate || currentBoardDate).split('-').map(Number);
    const nextDate = new Date(y, m - 1, d + 1);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const defaultTargetDate = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;

    setAdiarModalItem({
      loteNumber: params.loteNumber,
      productCode: params.productCode,
      productDescription: params.productDescription,
      currentDate: baseDate,
      targetDate: defaultTargetDate,
      etapaLabel: params.etapaLabel || 'Programação',
      origem: params.origem,
      realLote: params.realLote,
      envaseItem: params.envaseItem,
    });
  };

  const handleOpenAdiarModalForLote = (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'envase' | 'rotulagem' | 'ordens') => {
    const currentBoardDate = getCurrentBoardDate();
    const currentEtapa = etapa || (() => {
      if (currentTab === 'quadro_pesagem') return 'pesagem';
      if (currentTab === 'quadro_producao') return 'producao';
      if (currentTab === 'quadro_envase') return 'envase';
      if (currentTab === 'quadro_rotulagem') return 'rotulagem';
      if (currentTab === 'quadro_ordens') return 'ordens';
      return undefined;
    })();
    const loteSched = getLoteScheduleDateIso(lote, currentEtapa) || parseLoteDateToIso(lote.dataPrevisao || '') || parseLoteDateToIso(lote.date || '') || currentBoardDate;

    const etapaLabel = (() => {
      if (currentEtapa === 'envase') return 'Quadro de Envase';
      if (currentEtapa === 'pesagem') return 'Quadro de Pesagem';
      if (currentEtapa === 'producao') return 'Quadro de Produção';
      if (currentEtapa === 'rotulagem') return 'Quadro de Rotulagem';
      return 'Quadro de Ordens';
    })();

    const envaseItem = programacaoEnvase.find(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim());

    handleOpenAdiarModal({
      loteNumber: lote.loteNumber,
      productCode: lote.productCode,
      productDescription: lote.productDescription,
      currentDate: loteSched,
      etapaLabel,
      origem: currentEtapa === 'envase' ? 'envase_liberados' : ((currentEtapa || 'ordens') as any),
      realLote: lote,
      envaseItem,
    });
  };

  const setQuickDate = (daysToAdd: number) => {
    if (!adiarModalItem) return;
    const base = adiarModalItem.currentDate || getCurrentBoardDate();
    const [y, m, d] = base.split('-').map(Number);
    const nextDate = new Date(y, m - 1, d + daysToAdd);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const targetDate = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;
    setAdiarModalItem(prev => prev ? { ...prev, targetDate } : null);
  };

  const setQuickNextMonday = () => {
    if (!adiarModalItem) return;
    const base = adiarModalItem.currentDate || getCurrentBoardDate();
    const [y, m, d] = base.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay(); // 0 domingo, 1 segunda, ..., 6 sabado
    const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : (8 - day);
    date.setDate(date.getDate() + daysUntilMonday);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const targetDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    setAdiarModalItem(prev => prev ? { ...prev, targetDate } : null);
  };

  const handleConfirmAdiarLote = async (targetDate: string) => {
    if (!adiarModalItem || !targetDate) return;
    setSavingAdiarLote(true);
    const { loteNumber, productCode, realLote, envaseItem } = adiarModalItem;
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

    try {
      // 1. Se houver agendamento em programacaoEnvase, atualizar no backend
      const envaseMatches = programacaoEnvase.filter(it => (it.loteNumber || '').trim() === loteNumber.trim());
      if (envaseMatches.length === 0 && envaseItem) {
        envaseMatches.push(envaseItem);
      }

      if (envaseMatches.length > 0) {
        for (const it of envaseMatches) {
          try {
            await apiJson('/api/administrativo/envase/programacao', {
              method: 'POST',
              body: JSON.stringify({
                id: it.id && it.id > 0 ? it.id : undefined,
                dataProgramada: targetDate,
                linha: it.linha || 'Linha 1',
                ordem: it.ordem || 1,
                loteNumber: it.loteNumber || loteNumber,
                productCode: it.productCode || productCode,
                productDescription: it.productDescription || realLote?.productDescription || '',
                quantity: Number(it.quantity) || 0,
                quantityKg: Number(it.quantityKg) || 0,
                categoriaEnvase: it.categoriaEnvase || 'Outros',
                isColorido: Boolean(it.isColorido),
                cor: it.cor || null,
                statusEnvase: it.statusEnvase || 'PROGRAMADO',
                observacoes: it.observacoes || null,
                createdBy: it.createdBy || responsibleName,
              })
            });
          } catch (e) {
            console.error("Erro ao atualizar data em programacaoEnvase:", e);
          }
        }
        setProgramacaoEnvase(prev => prev.map(it => (it.loteNumber || '').trim() === loteNumber.trim() ? { ...it, dataProgramada: targetDate } : it));
        await fetchProgramacaoEnvase('TODOS');
      }

      // 2. Se estiver em rotulagem, atualizar dataProgramada em programacaoRotulagem
      const rotulagemItemsToUpdate = programacaoRotulagem.filter(it => (it.loteNumber || '').trim() === loteNumber.trim());
      if (rotulagemItemsToUpdate.length > 0) {
        for (const item of rotulagemItemsToUpdate) {
          try {
            const numQty = Number(item.quantity);
            const numKg = Number(item.quantityKg);
            await apiJson('/api/administrativo/rotulagem/programacao', {
              method: 'POST',
              body: JSON.stringify({
                id: typeof item.id === 'number' ? item.id : undefined,
                dataProgramada: targetDate,
                tipo: item.tipo,
                ordem: item.ordem,
                loteNumber: String(item.loteNumber || '').trim(),
                productCode: String(item.productCode || '').trim(),
                productDescription: String(item.productDescription || '').trim(),
                quantity: (!isNaN(numQty) && numQty > 0) ? numQty : 0,
                quantityKg: (!isNaN(numKg) && numKg > 0) ? numKg : 0,
                statusRotulagem: item.statusRotulagem || 'PROGRAMADO',
                observacoes: item.observacoes || null,
                createdBy: typeof item.createdBy === 'string' ? item.createdBy : responsibleName,
              })
            });
          } catch (e) {
            console.error("Erro ao atualizar data em programacaoRotulagem:", e);
          }
        }
        setProgramacaoRotulagem(prev => prev.map(it => (it.loteNumber || '').trim() === loteNumber.trim() ? { ...it, dataProgramada: targetDate } : it));
        await fetchProgramacaoRotulagem('TODOS');
      }

      // 3. Atualizar data_previsao no backend (lote_custom_status)
      setLotes(prev => prev.map(l => (l.loteNumber || '').trim() === loteNumber.trim() ? { ...l, dataPrevisao: targetDate } : l));

      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/previsao`, {
        method: 'POST',
        body: JSON.stringify({
          dataPrevisao: targetDate,
          updatedBy: responsibleName,
          fornecedorTerceirizado: realLote?.fornecedorTerceirizado || null
        })
      });

      // Salvar registro de adiamento no histórico reativo
      const dataOrig = (adiarModalItem.currentDate || getCurrentBoardDate() || parseLoteDateToIso(realLote?.date || '') || '').split('T')[0].split(' ')[0];
      const dataPara = targetDate.split('T')[0].split(' ')[0];
      if (dataOrig && dataPara && dataPara > dataOrig) {
        const newReg: LoteAdiadoRegistro = {
          id: `${loteNumber}_${dataPara}_${Date.now()}`,
          loteNumber,
          productCode: productCode || realLote?.productCode,
          productDescription: realLote?.productDescription || '',
          quantity: Number(realLote?.quantity) || 0,
          quantityKg: Number(realLote?.quantityKg) || 0,
          dataOriginal: dataOrig,
          dataAdiadoPara: dataPara,
          dataAcao: new Date().toISOString(),
          responsavel: responsibleName,
          etapa: adiarModalItem.origem,
        };
        setLotesAdiadosHistorico(prev => {
          const next = [newReg, ...prev.filter(x => !(x.loteNumber === loteNumber && (x.dataAdiadoPara === dataPara || x.dataOriginal === dataOrig)))];
          try { localStorage.setItem('natum_lotes_adiados_historico', JSON.stringify(next)); } catch {}
          return next;
        });
      } else if (dataOrig && dataPara && dataPara <= dataOrig) {
        setLotesAdiadosHistorico(prev => {
          const next = prev.filter(x => !(x.loteNumber === loteNumber && x.dataOriginal === dataOrig));
          try { localStorage.setItem('natum_lotes_adiados_historico', JSON.stringify(next)); } catch {}
          return next;
        });
      }

      await fetchLotes();
      showToast(`📅 Lote #${loteNumber} adiado para ${formatDateOnly(targetDate)} com sucesso!`);
      setAdiarModalItem(null);
    } catch (err: any) {
      console.error('Erro ao adiar lote:', err);
      showToast(`Falha ao adiar lote #${loteNumber}: ${err?.message || err}`, 'error');
    } finally {
      setSavingAdiarLote(false);
    }
  };

  // Cancelar / Desfazer Adiamento e retornar para a data original
  const handleCancelAdiarLote = async (
    loteNumber: string,
    targetDateToRestore?: string,
    etapa?: string,
    productCode?: string
  ) => {
    if (!loteNumber) return;

    let restoreDate = targetDateToRestore;
    if (!restoreDate) {
      const reg = lotesAdiadosHistorico.find(r => r.loteNumber === loteNumber);
      if (reg?.dataOriginal) {
        restoreDate = reg.dataOriginal;
      }
    }
    if (!restoreDate) {
      showToast('Não foi possível identificar a data original para restauração.', 'error');
      return;
    }

    const cleanDate = restoreDate.split('T')[0].split(' ')[0];
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

    try {
      // 1. Se estiver em programacaoEnvase, restaurar data no backend
      const envaseMatches = programacaoEnvase.filter(it => (it.loteNumber || '').trim() === loteNumber.trim());
      if (envaseMatches.length > 0) {
        for (const it of envaseMatches) {
          try {
            await apiJson('/api/administrativo/envase/programacao', {
              method: 'POST',
              body: JSON.stringify({
                id: it.id && it.id > 0 ? it.id : undefined,
                dataProgramada: cleanDate,
                linha: it.linha || 'Linha 1',
                ordem: it.ordem || 1,
                loteNumber: it.loteNumber || loteNumber,
                productCode: it.productCode || productCode,
                productDescription: it.productDescription || '',
                quantity: Number(it.quantity) || 0,
                quantityKg: Number(it.quantityKg) || 0,
                categoriaEnvase: it.categoriaEnvase || 'Outros',
                isColorido: Boolean(it.isColorido),
                cor: it.cor || null,
                statusEnvase: it.statusEnvase || 'PROGRAMADO',
                observacoes: it.observacoes || null,
                createdBy: it.createdBy || responsibleName,
              })
            });
          } catch (e) {
            console.error("Erro ao restaurar data em programacaoEnvase:", e);
          }
        }
        setProgramacaoEnvase(prev => prev.map(it => (it.loteNumber || '').trim() === loteNumber.trim() ? { ...it, dataProgramada: cleanDate } : it));
        await fetchProgramacaoEnvase('TODOS');
      }

      // 2. Se estiver em rotulagem, restaurar dataProgramada
      const rotulagemItemsToRestore = programacaoRotulagem.filter(it => (it.loteNumber || '').trim() === loteNumber.trim());
      if (rotulagemItemsToRestore.length > 0) {
        for (const item of rotulagemItemsToRestore) {
          try {
            const numQty = Number(item.quantity);
            const numKg = Number(item.quantityKg);
            await apiJson('/api/administrativo/rotulagem/programacao', {
              method: 'POST',
              body: JSON.stringify({
                id: typeof item.id === 'number' ? item.id : undefined,
                dataProgramada: cleanDate,
                tipo: item.tipo,
                ordem: item.ordem,
                loteNumber: String(item.loteNumber || '').trim(),
                productCode: String(item.productCode || '').trim(),
                productDescription: String(item.productDescription || '').trim(),
                quantity: (!isNaN(numQty) && numQty > 0) ? numQty : 0,
                quantityKg: (!isNaN(numKg) && numKg > 0) ? numKg : 0,
                statusRotulagem: item.statusRotulagem || 'PROGRAMADO',
                observacoes: item.observacoes || null,
                createdBy: typeof item.createdBy === 'string' ? item.createdBy : responsibleName,
              })
            });
          } catch (e) {
            console.error("Erro ao restaurar data em programacaoRotulagem:", e);
          }
        }
        setProgramacaoRotulagem(prev => prev.map(it => (it.loteNumber || '').trim() === loteNumber.trim() ? { ...it, dataProgramada: cleanDate } : it));
        await fetchProgramacaoRotulagem('TODOS');
      }

      // 3. Atualizar data_previsao no backend (lote_custom_status)
      setLotes(prev => prev.map(l => (l.loteNumber || '').trim() === loteNumber.trim() ? { ...l, dataPrevisao: cleanDate } : l));
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/previsao`, {
        method: 'POST',
        body: JSON.stringify({
          dataPrevisao: cleanDate,
          updatedBy: responsibleName
        })
      });

      // 4. Remover registro de adiamento do histórico reativo
      setLotesAdiadosHistorico(prev => {
        const next = prev.filter(x => x.loteNumber !== loteNumber);
        try { localStorage.setItem('natum_lotes_adiados_historico', JSON.stringify(next)); } catch {}
        return next;
      });

      if (adiarModalItem) {
        setAdiarModalItem(null);
      }

      await fetchLotes();
      showToast(`↩️ Adiamento do Lote #${loteNumber} cancelado! Retornado para ${formatDateOnly(cleanDate)}.`);
    } catch (err: any) {
      console.error('Erro ao cancelar adiamento:', err);
      showToast(`Falha ao cancelar adiamento: ${err?.message || err}`, 'error');
    }
  };

  // Mover Lote / Adiar (compatibilidade direta se targetDateOverride for informado ou abertura do modal)
  const handleMoveLoteNextDay = async (lote: AcompanhamentoLote, targetDateOverride?: string) => {
    if (!targetDateOverride) {
      handleOpenAdiarModalForLote(lote);
      return;
    }
    const currentBoardDate = getCurrentBoardDate();
    const currentEtapa = (() => {
      if (currentTab === 'quadro_pesagem') return 'pesagem';
      if (currentTab === 'quadro_producao') return 'producao';
      if (currentTab === 'quadro_envase') return 'envase';
      if (currentTab === 'quadro_rotulagem') return 'rotulagem';
      if (currentTab === 'quadro_ordens') return 'ordens';
      return undefined;
    })();
    const loteSched = getLoteScheduleDateIso(lote, currentEtapa) || parseLoteDateToIso(lote.dataPrevisao || '') || parseLoteDateToIso(lote.date || '');
    const baseDateStr = (loteSched && loteSched >= currentBoardDate) ? loteSched : currentBoardDate;

    let nextDayStr = targetDateOverride;
    if (!nextDayStr) {
      const [y, m, d] = (baseDateStr || currentBoardDate).split('-').map(Number);
      const nextDate = new Date(y, m - 1, d + 1);
      const pad = (n: number) => n.toString().padStart(2, '0');
      nextDayStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;
    }

    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

    const envaseItems = programacaoEnvase.filter(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim());
    if (envaseItems.length > 0) {
      for (const it of envaseItems) {
        try {
          await apiJson('/api/administrativo/envase/programacao', {
            method: 'POST',
            body: JSON.stringify({
              id: it.id && it.id > 0 ? it.id : undefined,
              dataProgramada: nextDayStr,
              linha: it.linha,
              ordem: it.ordem,
              loteNumber: it.loteNumber,
              productCode: it.productCode,
              productDescription: it.productDescription,
              quantity: Number(it.quantity) || 0,
              quantityKg: Number(it.quantityKg) || 0,
              categoriaEnvase: it.categoriaEnvase || 'Outros',
              isColorido: Boolean(it.isColorido),
              cor: it.cor || null,
              statusEnvase: it.statusEnvase || 'PROGRAMADO',
              observacoes: it.observacoes || null,
              createdBy: it.createdBy || responsibleName,
            })
          });
        } catch (e) {
          console.error("Erro ao atualizar data em programacaoEnvase:", e);
        }
      }
      setProgramacaoEnvase(prev => prev.map(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim() ? { ...it, dataProgramada: nextDayStr! } : it));
      await fetchProgramacaoEnvase('TODOS');
    }

    const rotulagemItemsToPostpone = programacaoRotulagem.filter(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim());
    if (rotulagemItemsToPostpone.length > 0) {
      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || (typeof currentUser === 'string' ? currentUser : 'Operador');
      for (const item of rotulagemItemsToPostpone) {
        try {
          const numQty = Number(item.quantity);
          const numKg = Number(item.quantityKg);
          await apiJson('/api/administrativo/rotulagem/programacao', {
            method: 'POST',
            body: JSON.stringify({
              id: typeof item.id === 'number' ? item.id : undefined,
              dataProgramada: nextDayStr,
              tipo: item.tipo,
              ordem: item.ordem,
              loteNumber: String(item.loteNumber || '').trim(),
              productCode: String(item.productCode || '').trim(),
              productDescription: String(item.productDescription || '').trim(),
              quantity: (!isNaN(numQty) && numQty > 0) ? numQty : 0,
              quantityKg: (!isNaN(numKg) && numKg > 0) ? numKg : 0,
              statusRotulagem: item.statusRotulagem || 'PROGRAMADO',
              observacoes: item.observacoes || null,
              createdBy: typeof item.createdBy === 'string' ? item.createdBy : responsibleName,
            })
          });
        } catch (e) {
          console.error("Erro ao adiar data em programacaoRotulagem:", e);
        }
      }
      setProgramacaoRotulagem(prev => prev.map(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim() ? { ...it, dataProgramada: nextDayStr! } : it));
      await fetchProgramacaoRotulagem('TODOS');
    }

    try {
      setLotes(prev => prev.map(l => (l.loteNumber || '').trim() === (lote.loteNumber || '').trim() ? { ...l, dataPrevisao: nextDayStr! } : l));

      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
        method: 'POST',
        body: JSON.stringify({
          dataPrevisao: nextDayStr,
          updatedBy: responsibleName,
          fornecedorTerceirizado: lote.fornecedorTerceirizado || null
        })
      });

      // Salvar registro de adiamento no histórico reativo
      const dataOrig = (baseDateStr || getCurrentBoardDate() || '').split('T')[0].split(' ')[0];
      const dataPara = nextDayStr.split('T')[0].split(' ')[0];
      if (dataOrig && dataPara && dataPara > dataOrig) {
        const newReg: LoteAdiadoRegistro = {
          id: `${lote.loteNumber}_${dataPara}_${Date.now()}`,
          loteNumber: lote.loteNumber,
          productCode: lote.productCode,
          productDescription: lote.productDescription || '',
          quantity: Number(lote.quantity) || 0,
          quantityKg: Number(lote.quantityKg) || 0,
          dataOriginal: dataOrig,
          dataAdiadoPara: dataPara,
          dataAcao: new Date().toISOString(),
          responsavel: responsibleName,
          etapa: currentEtapa,
        };
        setLotesAdiadosHistorico(prev => {
          const next = [newReg, ...prev.filter(x => !(x.loteNumber === lote.loteNumber && (x.dataAdiadoPara === dataPara || x.dataOriginal === dataOrig)))];
          try { localStorage.setItem('natum_lotes_adiados_historico', JSON.stringify(next)); } catch {}
          return next;
        });
      } else if (dataOrig && dataPara && dataPara <= dataOrig) {
        setLotesAdiadosHistorico(prev => {
          const next = prev.filter(x => !(x.loteNumber === lote.loteNumber && x.dataOriginal === dataOrig));
          try { localStorage.setItem('natum_lotes_adiados_historico', JSON.stringify(next)); } catch {}
          return next;
        });
      }

      await fetchLotes();
      showToast(`📅 Lote #${lote.loteNumber} adiado para ${formatDateOnly(nextDayStr)}!`);
    } catch (err: any) {
      console.error('Erro ao adiar lote para o dia seguinte:', err);
      showToast(`Falha ao adiar lote #${lote.loteNumber}: ${err?.message || err}`, 'error');
      await fetchLotes();
    }
  };

  useEffect(() => {
    fetchLotes();
    fetchKitOrders();
    fetchSolicitacoes();
    fetchFiscoAnalyses();
    fetchProgramacaoRotulagem('TODOS');
  }, [fetchLotes, fetchKitOrders, fetchSolicitacoes, fetchFiscoAnalyses, fetchProgramacaoRotulagem]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchLotes();
    };
    window.addEventListener('natum:refresh-acompanhamento', handleRefresh);
    return () => window.removeEventListener('natum:refresh-acompanhamento', handleRefresh);
  }, [fetchLotes]);

  useEffect(() => {
    if (currentTab === 'quadro_envase') {
      fetchProgramacaoEnvase('TODOS');
    } else if (currentTab === 'calendar' && calendarViewMode === 'quadro_envase') {
      fetchProgramacaoEnvase(envaseSelectedDate);
    } else if (currentTab === 'quadro_rotulagem') {
      fetchProgramacaoRotulagem('TODOS');
    }
  }, [currentTab, calendarViewMode, envaseSelectedDate, fetchProgramacaoEnvase, fetchProgramacaoRotulagem]);

  // Abrir Modal de Encaixe com valores pré-inferidos
  const handleOpenEncaixeModal = (lote: AcompanhamentoLote, defaultLinha: 'Linha 1' | 'Linha 2' = 'Linha 1') => {
    setEncaixarModalLote(lote);
    setModalEncaixeLinha(defaultLinha);
    const cat = inferCategoriaEnvase(lote.productDescription);
    setModalEncaixeCategoria(cat);
    const corInfo = inferCorProduto(lote.productDescription);
    setModalEncaixeIsColorido(corInfo.isColorido);
    setModalEncaixeCor(corInfo.cor);
    setModalEncaixeCustomCor('');
    setModalEncaixeOrdem('');
  };

  // Confirmar Encaixe via Modal
  const handleConfirmEncaixeModal = async () => {
    if (!encaixarModalLote) return;
    setSavingEncaixeModal(true);
    const corFinal = modalEncaixeIsColorido
      ? (modalEncaixeCor === 'Outro' && modalEncaixeCustomCor.trim() ? modalEncaixeCustomCor.trim() : modalEncaixeCor)
      : 'Branco';

    const existing = programacaoEnvase.find(it => 
      (it.loteNumber || '').trim().toUpperCase() === (encaixarModalLote.loteNumber || '').trim().toUpperCase() &&
      (!it.productCode || !encaixarModalLote.productCode || (it.productCode || '').trim() === (encaixarModalLote.productCode || '').trim())
    );

    try {
      await apiJson('/api/administrativo/envase/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: existing && existing.id > 0 ? existing.id : undefined,
          dataProgramada: envaseSelectedDate,
          linha: modalEncaixeLinha,
          ordem: typeof modalEncaixeOrdem === 'number' && modalEncaixeOrdem > 0 ? modalEncaixeOrdem : undefined,
          loteNumber: encaixarModalLote.loteNumber,
          productCode: encaixarModalLote.productCode,
          productDescription: encaixarModalLote.productDescription,
          quantity: encaixarModalLote.quantity || 0,
          quantityKg: encaixarModalLote.quantityKg || 0,
          categoriaEnvase: modalEncaixeCategoria,
          isColorido: modalEncaixeIsColorido,
          cor: corFinal,
          statusEnvase: 'PROGRAMADO',
          createdBy: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador',
        })
      });
      const targetDate = envaseSelectedDate || getTodayIso();
      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
      setLotes(prev => prev.map(l => l.loteNumber === encaixarModalLote.loteNumber ? { ...l, dataPrevisao: targetDate } : l));
      try {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(encaixarModalLote.loteNumber)}/previsao`, {
          method: 'POST',
          body: JSON.stringify({
            dataPrevisao: targetDate,
            updatedBy: responsibleName,
            fornecedorTerceirizado: encaixarModalLote.fornecedorTerceirizado || null
          })
        });
      } catch (err) {
        console.warn('Erro ao sincronizar dataPrevisao no encaixe:', err);
      }
      saveEtapaStatus(encaixarModalLote.loteNumber, 'envase', 'ativo', null, null, null, responsibleName);
      showToast(`Lote #${encaixarModalLote.loteNumber} encaixado na ${modalEncaixeLinha} (${modalEncaixeCategoria} • ${corFinal})!`);
      setEncaixarModalLote(null);
      await fetchProgramacaoEnvase('TODOS');
    } catch (e: any) {
      console.error("Erro ao encaixar lote no quadro:", e);
      showToast("Falha ao encaixar lote: " + (e?.message || e), "error");
    } finally {
      setSavingEncaixeModal(false);
    }
  };

  // Encaixar lote em produção no Quadro de Envase (Rápido)
  const handleEncaixarLote = async (
    lote: AcompanhamentoLote,
    linha: 'Linha 1' | 'Linha 2' | 'Linha 3',
    categoriaEnvase?: string,
    isColorido?: boolean,
    cor?: string,
    targetDateOverride?: string
  ) => {
    const catFinal = categoriaEnvase || inferCategoriaEnvase(lote.productDescription);
    const corInfo = inferCorProduto(lote.productDescription);
    const isColFinal = isColorido !== undefined ? isColorido : corInfo.isColorido;
    const corFinal = cor || (isColFinal ? corInfo.cor : 'Branco');
    const dataAlvo = targetDateOverride || envaseSelectedDate;

    const existing = programacaoEnvase.find(it => 
      (it.loteNumber || '').trim().toUpperCase() === (lote.loteNumber || '').trim().toUpperCase() &&
      (!it.productCode || !lote.productCode || (it.productCode || '').trim() === (lote.productCode || '').trim())
    );

    try {
      await apiJson('/api/administrativo/envase/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: existing && existing.id > 0 ? existing.id : undefined,
          dataProgramada: dataAlvo,
          linha,
          loteNumber: lote.loteNumber,
          productCode: lote.productCode,
          productDescription: lote.productDescription,
          quantity: lote.quantity || 0,
          quantityKg: lote.quantityKg || 0,
          categoriaEnvase: catFinal,
          isColorido: isColFinal,
          cor: corFinal,
          statusEnvase: 'PROGRAMADO',
          createdBy: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador',
        })
      });
      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
      setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { ...l, dataPrevisao: dataAlvo } : l));
      try {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
          method: 'POST',
          body: JSON.stringify({
            dataPrevisao: dataAlvo,
            updatedBy: responsibleName,
            fornecedorTerceirizado: lote.fornecedorTerceirizado || null
          })
        });
      } catch (err) {
        console.warn('Erro ao sincronizar dataPrevisao no encaixe:', err);
      }
      saveEtapaStatus(lote.loteNumber, 'envase', 'ativo', null, null, null, responsibleName);
      showToast(`Lote #${lote.loteNumber} encaixado na ${linha} (${catFinal} • ${corFinal})!`);
      await fetchProgramacaoEnvase('TODOS');
    } catch (e: any) {
      console.error("Erro ao encaixar lote no quadro:", e);
      showToast("Falha ao encaixar lote: " + (e?.message || e), "error");
    }
  };

  // Reordenar item na linha (Subir ou Descer)
  const handleReorderEnvase = async (id: number, linha: string, direction: 'up' | 'down') => {
    const lineItems = programacaoEnvase
      .filter(it => it.linha === linha)
      .sort((a, b) => a.ordem - b.ordem);

    const currentIndex = lineItems.findIndex(it => it.id === id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= lineItems.length) return;

    const currentItem = lineItems[currentIndex];
    const targetItem = lineItems[targetIndex];

    const currentOrdem = currentItem.ordem;
    const targetOrdem = targetItem.ordem === currentOrdem 
      ? (direction === 'up' ? currentOrdem - 1 : currentOrdem + 1)
      : targetItem.ordem;

    const payloadItems = [
      { id: currentItem.id, linha, ordem: targetOrdem },
      { id: targetItem.id, linha, ordem: currentOrdem },
    ];

    setProgramacaoEnvase(prev => prev.map(it => {
      if (it.id === currentItem.id) return { ...it, ordem: targetOrdem };
      if (it.id === targetItem.id) return { ...it, ordem: currentOrdem };
      return it;
    }));

    try {
      await apiJson('/api/administrativo/envase/programacao/reorder', {
        method: 'POST',
        body: JSON.stringify({ items: payloadItems })
      });
      fetchProgramacaoEnvase(envaseSelectedDate);
    } catch (e: any) {
      console.error("Erro ao reordenar envase:", e);
      showToast("Falha ao reordenar: " + (e?.message || e), "error");
      fetchProgramacaoEnvase(envaseSelectedDate);
    }
  };

  // Mover item entre Linha 1 e Linha 2
  const handleMoveLinha = async (item: ProgramacaoEnvaseItem, targetLinha: 'Linha 1' | 'Linha 2' | 'Linha 3') => {
    try {
      await apiJson('/api/administrativo/envase/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          dataProgramada: item.dataProgramada,
          linha: targetLinha,
          loteNumber: item.loteNumber,
          productCode: item.productCode,
          productDescription: item.productDescription,
          quantity: item.quantity,
          quantityKg: item.quantityKg,
          categoriaEnvase: item.categoriaEnvase,
          statusEnvase: item.statusEnvase,
          observacoes: item.observacoes,
          createdBy: item.createdBy,
        })
      });
      showToast(`Lote #${item.loteNumber} transferido para ${targetLinha}!`);
      fetchProgramacaoEnvase(envaseSelectedDate);
    } catch (e: any) {
      console.error("Erro ao transferir linha:", e);
      showToast("Falha ao transferir linha: " + (e?.message || e), "error");
    }
  };

  // Alterar Status do item no envase (com suporte a observações de espera)
  const handleChangeStatusEnvase = async (item: ProgramacaoEnvaseItem, newStatus: string, observacoesCustom?: string) => {
    const finalObs = observacoesCustom !== undefined ? observacoesCustom : item.observacoes;
    setProgramacaoEnvase(prev => prev.map(it => it.id === item.id ? { ...it, statusEnvase: newStatus, observacoes: finalObs } : it));
    try {
      await apiJson('/api/administrativo/envase/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          dataProgramada: item.dataProgramada,
          linha: item.linha,
          ordem: item.ordem,
          loteNumber: item.loteNumber,
          productCode: item.productCode,
          productDescription: item.productDescription,
          quantity: item.quantity,
          quantityKg: item.quantityKg,
          categoriaEnvase: item.categoriaEnvase,
          statusEnvase: newStatus,
          observacoes: finalObs,
          createdBy: item.createdBy,
        })
      });
      const etapaStatus = newStatus === 'CONCLUIDO' ? 'concluido' : (newStatus === 'EM_ESPERA' ? 'Em Espera' : 'ativo');
      saveEtapaStatus(item.loteNumber, 'envase', etapaStatus, newStatus === 'EM_ESPERA' ? finalObs : null);
      showToast(`Status do lote #${item.loteNumber} atualizado para ${newStatus}!`);
      fetchProgramacaoEnvase(envaseSelectedDate);
    } catch (e: any) {
      console.error("Erro ao atualizar status do envase:", e);
      showToast("Falha ao atualizar status: " + (e?.message || e), "error");
      fetchProgramacaoEnvase(envaseSelectedDate);
    }
  };

  const handleOpenEnvaseEspera = (item: ProgramacaoEnvaseItem) => {
    setEnvaseEsperaItem(item);
    setEnvaseEsperaMotivo('Falta de Embalagem / Frasco');
    setEnvaseEsperaCustom('');
    setEnvaseEsperaParcialQtd(null);
    setEnvaseEsperaMotivoRestante('');
  };

  const handleConfirmEnvaseEspera = async () => {
    if (!envaseEsperaItem) return;
    let motivoFinal = envaseEsperaCustom.trim() || envaseEsperaMotivo;
    if (envaseEsperaMotivo === 'Envase Parcial (interrompido)') {
      motivoFinal = `Envase Parcial (${envaseEsperaParcialQtd || 0} un). Motivo restante: ${envaseEsperaMotivoRestante || 'Não especificado'}`;
      try {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(envaseEsperaItem.loteNumber)}/custom-status`, {
          method: 'POST',
          body: JSON.stringify({
            quantidadeEnvasadaParcial: envaseEsperaParcialQtd,
            motivoEspera: motivoFinal,
            customStatus: 'Ordem Parcial',
            updatedBy: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador',
          })
        });
        setLotes(prev => prev.map(l => (l.loteNumber || '').trim() === envaseEsperaItem.loteNumber.trim() ? {
          ...l,
          customStatus: 'Ordem Parcial',
          quantidadeEnvasadaParcial: envaseEsperaParcialQtd,
          motivoEspera: motivoFinal
        } : l));
      } catch (err) {
        console.error('Erro ao salvar custom-status parcial no backend:', err);
      }
    }
    handleChangeStatusEnvase(envaseEsperaItem, 'EM_ESPERA', motivoFinal);
    setEnvaseEsperaItem(null);
  };

  // Handlers do Quadro de Caldeira
  const handleToggleCaldeiraLote = async (loteNumber: string) => {
    const isCurrentlyCaldeira = lotesComCaldeira.has(loteNumber) || lotes.some(l => l.loteNumber === loteNumber && l.category === 'Caldeira');
    const newIsCaldeira = !isCurrentlyCaldeira;
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

    setLotesComCaldeira(prev => {
      const next = new Set(prev);
      if (!newIsCaldeira) {
        next.delete(loteNumber);
      } else {
        next.add(loteNumber);
      }
      try {
        localStorage.setItem('natum_lotes_com_caldeira', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    setLotes(prev => prev.map(l => l.loteNumber === loteNumber ? { ...l, category: newIsCaldeira ? 'Caldeira' : null } : l));

    try {
      await apiJson('/api/administrativo/lote-status', {
        method: 'POST',
        body: JSON.stringify({
          loteNumber,
          customStatus: 'Produzido',
          category: newIsCaldeira ? 'Caldeira' : null,
          updatedBy: responsibleName
        })
      });
    } catch (e) {
      console.error('Erro ao atualizar Caldeira no backend:', e);
    }

    if (newIsCaldeira) {
      showToast(`Lote #${loteNumber} marcado para Caldeira (Processo a Quente)!`);
    } else {
      showToast(`Lote #${loteNumber} removido da lista de Caldeira.`);
    }
  };

  const handleLigarCaldeira = () => {
    const operador = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
    const lotesArr = Array.from(lotesComCaldeira);
    const novoEstado = {
      ligouEm: new Date().toISOString(),
      operador,
      lotes: lotesArr,
    };
    setCaldeiraAtiva(novoEstado);
    try {
      localStorage.setItem('natum_caldeira_ativa', JSON.stringify(novoEstado));
    } catch {}
    showToast("🔥 Caldeira ligada! Registro de aquecimento iniciado.");
  };

  const handleDesligarCaldeira = () => {
    if (!caldeiraAtiva) return;
    const desligouEm = new Date().toISOString();
    const novoRegistro: CaldeiraRegistro = {
      id: `caldeira-${Date.now()}`,
      ligouEm: caldeiraAtiva.ligouEm,
      desligouEm,
      operador: caldeiraAtiva.operador,
      lotes: caldeiraAtiva.lotes,
    };
    const novoHist = [novoRegistro, ...caldeiraHistorico];
    setCaldeiraHistorico(novoHist);
    setCaldeiraAtiva(null);
    try {
      localStorage.removeItem('natum_caldeira_ativa');
      localStorage.setItem('natum_caldeira_historico', JSON.stringify(novoHist));
    } catch {}
    showToast("❄️ Caldeira desligada e arquivada no histórico de aquecimento.");
  };

  // Alterar Categoria de Envase
  const handleChangeCategoriaEnvase = async (item: ProgramacaoEnvaseItem, newCategoria: string) => {
    setProgramacaoEnvase(prev => prev.map(it => it.id === item.id ? { ...it, categoriaEnvase: newCategoria } : it));
    try {
      await apiJson('/api/administrativo/envase/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          dataProgramada: item.dataProgramada,
          linha: item.linha,
          ordem: item.ordem,
          loteNumber: item.loteNumber,
          productCode: item.productCode,
          productDescription: item.productDescription,
          quantity: item.quantity,
          quantityKg: item.quantityKg,
          categoriaEnvase: newCategoria,
          statusEnvase: item.statusEnvase,
          observacoes: item.observacoes,
          createdBy: item.createdBy,
        })
      });
      showToast(`Categoria alterada para ${newCategoria}!`);
      fetchProgramacaoEnvase(envaseSelectedDate);
    } catch (e: any) {
      console.error("Erro ao atualizar categoria:", e);
      showToast("Falha ao atualizar categoria: " + (e?.message || e), "error");
      fetchProgramacaoEnvase(envaseSelectedDate);
    }
  };

  // Alterar Cor de Envase (Subcategoria Cromática)
  const handleChangeCorEnvase = async (item: ProgramacaoEnvaseItem, isColorido: boolean, cor: string) => {
    setProgramacaoEnvase(prev => prev.map(it => it.id === item.id ? { ...it, isColorido, cor } : it));
    try {
      await apiJson('/api/administrativo/envase/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          dataProgramada: item.dataProgramada,
          linha: item.linha,
          ordem: item.ordem,
          loteNumber: item.loteNumber,
          productCode: item.productCode,
          productDescription: item.productDescription,
          quantity: item.quantity,
          quantityKg: item.quantityKg,
          categoriaEnvase: item.categoriaEnvase,
          isColorido,
          cor,
          statusEnvase: item.statusEnvase,
          observacoes: item.observacoes,
          createdBy: item.createdBy,
        })
      });
      showToast(`Cor do lote #${item.loteNumber} alterada para ${cor}!`);
      fetchProgramacaoEnvase(envaseSelectedDate);
    } catch (e: any) {
      console.error("Erro ao atualizar cor:", e);
      showToast("Falha ao atualizar cor: " + (e?.message || e), "error");
      fetchProgramacaoEnvase(envaseSelectedDate);
    }
  };

  // Organizar Campanha da Linha (Agrupa por Categoria e Ordena por Escala de Cores)
  const handleAutoSortCampanha = async (linha: string) => {
    const lineItems = programacaoEnvase.filter(it => it.linha === linha);
    if (lineItems.length <= 1) {
      showToast(`Linha ${linha} possui poucos itens para reorganização.`);
      return;
    }

    const catOrder: Record<string, number> = {
      'Shampoo': 1,
      'Condicionador': 2,
      'Máscaras': 3,
      'Óleos': 4,
      'AOX': 5,
      'Outros': 6,
    };

    const sorted = [...lineItems].sort((a, b) => {
      const orderCatA = catOrder[a.categoriaEnvase] ?? 99;
      const orderCatB = catOrder[b.categoriaEnvase] ?? 99;
      if (orderCatA !== orderCatB) return orderCatA - orderCatB;

      // Se mesma categoria: Branco primeiro (0), depois coloridos (1)
      const isColA = a.isColorido ? 1 : 0;
      const isColB = b.isColorido ? 1 : 0;
      if (isColA !== isColB) return isColA - isColB;

      // Sequência cromática
      const corOrderA = ORDEM_CORES_FABRICA[a.cor || ''] ?? 99;
      const corOrderB = ORDEM_CORES_FABRICA[b.cor || ''] ?? 99;
      return corOrderA - corOrderB;
    });

    const reorderPayload = sorted.map((it, idx) => ({
      id: it.id,
      linha,
      ordem: idx + 1,
    }));

    setProgramacaoEnvase(prev => prev.map(it => {
      const found = reorderPayload.find(r => r.id === it.id);
      return found ? { ...it, ordem: found.ordem } : it;
    }));

    try {
      await apiJson('/api/administrativo/envase/programacao/reorder', {
        method: 'POST',
        body: JSON.stringify({ items: reorderPayload })
      });
      showToast(`Campanha da ${linha} organizada por Categorias e Sequência de Cores!`);
      fetchProgramacaoEnvase(envaseSelectedDate);
    } catch (e: any) {
      showToast("Erro ao organizar campanha: " + (e?.message || e), "error");
      fetchProgramacaoEnvase(envaseSelectedDate);
    }
  };

  // Remover item do Quadro de Envase
  const handleRemoveEnvase = async (id: number, loteNumber: string) => {
    setProgramacaoEnvase(prev => prev.filter(it => it.id !== id && it.loteNumber !== loteNumber));
    try {
      if (id && id > 0) {
        await apiJson(`/api/administrativo/envase/programacao/${id}`, {
          method: 'DELETE',
        });
      } else if (loteNumber) {
        await apiJson(`/api/administrativo/envase/programacao/lote/${encodeURIComponent(loteNumber)}`, {
          method: 'DELETE',
        });
      }
      saveEtapaStatus(loteNumber, 'envase', 'fila');
      showToast(`Lote #${loteNumber} removido da programação de envase.`);
      fetchProgramacaoEnvase(envaseSelectedDate);
    } catch (e: any) {
      console.error("Erro ao remover item do quadro por id, tentando fallback por lote:", e);
      if (loteNumber) {
        try {
          await apiJson(`/api/administrativo/envase/programacao/lote/${encodeURIComponent(loteNumber)}`, {
            method: 'DELETE',
          });
          showToast(`Lote #${loteNumber} removido da programação de envase.`);
          fetchProgramacaoEnvase(envaseSelectedDate);
          return;
        } catch (e2) {
          console.error("Erro no fallback de exclusao por lote:", e2);
        }
      }
      showToast("Falha ao remover item do quadro: " + (e?.message || e), "error");
      fetchProgramacaoEnvase(envaseSelectedDate);
    }
  };

  // Isolamento Estrito de Terceirizados (Códigos SKU e Números de Lote cadastrados em solicitações)
  const terceirizadoProductCodes = useMemo(() => {
    return new Set(
      solicitacoes
        .filter(s => s.status !== 'CANCELADO' && s.productCode)
        .map(s => s.productCode.trim().toUpperCase())
    );
  }, [solicitacoes]);

  const terceirizadoLoteNumbers = useMemo(() => {
    return new Set(
      solicitacoes
        .filter(s => s.status !== 'CANCELADO' && s.loteNumber)
        .map(s => s.loteNumber!.trim().toUpperCase())
    );
  }, [solicitacoes]);

  // Função central para determinar se um lote pertence a Terceirizados
  const isLoteTerceirizado = useCallback((l: AcompanhamentoLote) => {
    if (l.isTerceirizado) return true;
    const lNum = (l.loteNumber || '').trim().toUpperCase();
    if (lNum && terceirizadoLoteNumbers.has(lNum)) return true;
    return false;
  }, [terceirizadoLoteNumbers]);

  // Mover Lote para Terceirizados
  const handleMoveToTerceirizado = (loteNumber: string) => {
    const target = lotes.find(l => l.loteNumber === loteNumber);
    if (target) {
      handleOpenEditTerceirizado(target);
    }
  };

  // Handlers para Edição de Lote Terceirizado
  const handleOpenEditTerceirizado = (lote: AcompanhamentoLote) => {
    setEditTerceirizadoLote(lote);
    setEditTerceirizadoFornecedor(lote.fornecedorTerceirizado || (lote as any).fornecedor_terceirizado || '');
    const effPrev = getEffectivePrevisao(lote.date, lote.dataPrevisao);
    setEditTerceirizadoPrevisao(lote.dataPrevisao ? lote.dataPrevisao.split('T')[0] : (effPrev || ''));
  };

  const handleSaveEditTerceirizado = async () => {
    if (!editTerceirizadoLote) return;
    setSavingTerceirizado(true);
    try {
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(editTerceirizadoLote.loteNumber)}/terceirizado`, {
        method: 'POST',
        body: JSON.stringify({
          isTerceirizado: true,
          fornecedor_terceirizado: editTerceirizadoFornecedor.trim() || null
        })
      });

      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(editTerceirizadoLote.loteNumber)}/previsao`, {
        method: 'POST',
        body: JSON.stringify({
          data_previsao: editTerceirizadoPrevisao || null,
          fornecedor_terceirizado: editTerceirizadoFornecedor.trim() || null
        })
      });

      setLotes(prev => prev.map(l => {
        if (l.loteNumber === editTerceirizadoLote.loteNumber) {
          return {
            ...l,
            isTerceirizado: true,
            dataPrevisao: editTerceirizadoPrevisao || null,
            fornecedorTerceirizado: editTerceirizadoFornecedor.trim() || null,
            fornecedor_terceirizado: editTerceirizadoFornecedor.trim() || null,
          };
        }
        return l;
      }));

      showToast(`Lote #${editTerceirizadoLote.loteNumber} atualizado em Terceirizados.`);
      setEditTerceirizadoLote(null);
      fetchLotes();
    } catch (e: any) {
      console.error("Erro ao salvar dados de terceirizado:", e);
      showToast("Falha ao salvar terceirizado: " + (e?.message || e), "error");
    } finally {
      setSavingTerceirizado(false);
    }
  };

  const handleReturnTerceirizadoFromModal = async () => {
    if (!editTerceirizadoLote) return;
    setSavingTerceirizado(true);
    try {
      await handleReturnToInterno(editTerceirizadoLote.loteNumber);
      setEditTerceirizadoLote(null);
    } finally {
      setSavingTerceirizado(false);
    }
  };

  // Retornar Lote para Produção Interna
  const handleReturnToInterno = async (loteNumber: string) => {
    setLotes(prev => prev.map(l => l.loteNumber === loteNumber ? { ...l, isTerceirizado: false } : l));
    try {
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/terceirizado`, {
        method: 'POST',
        body: JSON.stringify({ isTerceirizado: false })
      });
      showToast(`Lote #${loteNumber} retornado para Produção Interna.`);
      fetchLotes();
    } catch (e: any) {
      console.error("Erro ao retornar lote para produção interna:", e);
      showToast("Erro ao retornar lote para produção interna.", "error");
      fetchLotes();
    }
  };

  // Mover Seleção Múltipla para Terceirizados
  const handleBatchMoveToTerceirizados = async () => {
    const loteNumbers = Array.from(selectedLotes);
    if (loteNumbers.length === 0) return;
    setIsBatchUpdating(true);
    try {
      for (const num of loteNumbers) {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(num)}/terceirizado`, {
          method: 'POST',
          body: JSON.stringify({ isTerceirizado: true })
        });
      }
      showToast(`${loteNumbers.length} lote(s) movido(s) para Terceirizados.`);
      setSelectedLotes(new Set());
      fetchLotes();
    } catch (e: any) {
      showToast("Erro ao mover lotes: " + (e?.message || e), "error");
    } finally {
      setIsBatchUpdating(false);
    }
  };

  // Handlers para Filtros de Coluna de Lotes
  const handleLotesColumnFilterChange = useCallback((columnKey: string, selected: Set<string> | undefined) => {
    setLotesColumnFilters(prev => {
      const next = { ...prev };
      if (selected === undefined) {
        delete next[columnKey];
      } else {
        next[columnKey] = selected;
      }
      return next;
    });
  }, []);

  const handleClearAllLotesFilters = useCallback(() => {
    setLotesColumnFilters({});
    setSearch('');
  }, []);

  // Handlers para Filtros de Coluna de Solicitações
  const handleSolicColumnFilterChange = useCallback((columnKey: string, selected: Set<string> | undefined) => {
    setSolicColumnFilters(prev => {
      const next = { ...prev };
      if (selected === undefined) {
        delete next[columnKey];
      } else {
        next[columnKey] = selected;
      }
      return next;
    });
  }, []);

  const handleClearAllSolicFilters = useCallback(() => {
    setSolicColumnFilters({});
    setSolicitacoesSearch('');
  }, []);

  // Handlers para Filtros de Coluna de Kits
  const handleKitsColumnFilterChange = useCallback((columnKey: string, selected: Set<string> | undefined) => {
    setKitsColumnFilters(prev => {
      const next = { ...prev };
      if (selected === undefined) {
        delete next[columnKey];
      } else {
        next[columnKey] = selected;
      }
      return next;
    });
  }, []);

  const handleClearAllKitsFilters = useCallback(() => {
    setKitsColumnFilters({});
    setKitOrdersSearch('');
  }, []);

  // Busca do Produto pelo Código ao Digitar
  const handleProductCodeChange = async (code: string) => {
    const upper = code.toUpperCase();
    setSolicProductCode(upper);
    const clean = upper.trim();
    if (!clean || clean.length < 2) {
      return;
    }
    setLoadingProductLookup(true);
    try {
      const res = await apiJson<{ codigo: string; descricao: string; pesoUnitarioKg?: number | null }>(
        `/api/administrativo/terceirizados/produto/${encodeURIComponent(clean)}`
      );
      if (res && res.descricao) {
        setSolicProductDesc(res.descricao);
        const weight = res.pesoUnitarioKg || parseUnitWeightFromDescription(res.descricao);
        setSolicUnitWeight(weight || null);

        // Recalcular se já havia quantidade digitada
        if (weight && weight > 0) {
          if (solicQuantityKg && !solicQuantityUn) {
            const kg = parseFloat(solicQuantityKg);
            if (!isNaN(kg) && kg > 0) {
              setSolicQuantityUn(Math.round(kg / weight).toString());
            }
          } else if (solicQuantityUn && !solicQuantityKg) {
            const un = parseFloat(solicQuantityUn);
            if (!isNaN(un) && un > 0) {
              const kg = un * weight;
              setSolicQuantityKg(Number.isInteger(kg) ? kg.toString() : kg.toFixed(2));
            }
          }
        }
      }
    } catch {
      // Produto não encontrado ou digitando
    } finally {
      setLoadingProductLookup(false);
    }
  };

  // Conversão de KG para UN
  const handleQuantityKgChange = (val: string) => {
    setSolicQuantityKg(val);
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num > 0 && solicUnitWeight && solicUnitWeight > 0) {
      const un = Math.round(num / solicUnitWeight);
      setSolicQuantityUn(un > 0 ? un.toString() : '');
    } else if (!val) {
      setSolicQuantityUn('');
    }
  };

  // Conversão de UN para KG
  const handleQuantityUnChange = (val: string) => {
    setSolicQuantityUn(val);
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num > 0 && solicUnitWeight && solicUnitWeight > 0) {
      const kg = num * solicUnitWeight;
      setSolicQuantityKg(Number.isInteger(kg) ? kg.toString() : kg.toFixed(2));
    } else if (!val) {
      setSolicQuantityKg('');
    }
  };

  // Ajuste do fator de peso unitário
  const handleCustomWeightChange = (newWeightStr: string) => {
    const w = parseFloat(newWeightStr.replace(',', '.'));
    if (!isNaN(w) && w > 0) {
      setSolicUnitWeight(w);
      if (solicQuantityKg) {
        const kg = parseFloat(solicQuantityKg);
        if (!isNaN(kg) && kg > 0) {
          setSolicQuantityUn(Math.round(kg / w).toString());
        }
      } else if (solicQuantityUn) {
        const un = parseFloat(solicQuantityUn);
        if (!isNaN(un) && un > 0) {
          const kg = un * w;
          setSolicQuantityKg(Number.isInteger(kg) ? kg.toString() : kg.toFixed(2));
        }
      }
    }
  };

  // Salvar Previsão de Produção
  const handleSavePrevisao = async (loteNumber: string, dateStr: string | null) => {
    setSavingPrevisao(true);
    const dateVal = dateStr?.trim() || null;
    const previous = [...lotes];
    setLotes(prev => prev.map(item => item.loteNumber === loteNumber ? { ...item, dataPrevisao: dateVal } : item));
    try {
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/previsao`, {
        method: 'POST',
        body: JSON.stringify({
          dataPrevisao: dateVal,
          updatedBy: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador'
        })
      });
      showToast(dateVal ? `Previsão do lote #${loteNumber} salva!` : `Previsão do lote #${loteNumber} removida.`);
      setEditingPrevisaoLote(null);
    } catch (err) {
      console.error("Erro ao salvar previsão:", err);
      showToast("Falha ao salvar previsão de produção.", "error");
      setLotes(previous);
    } finally {
      setSavingPrevisao(false);
    }
  };

  // Criar Nova Solicitação de Terceirizado
  const handleCreateSolicitacao = async () => {
    if (!solicProductCode.trim()) {
      showToast("Informe o código do produto.", "error");
      return;
    }
    const qtyUn = parseFloat(solicQuantityUn);
    const qtyKg = parseFloat(solicQuantityKg);
    if ((isNaN(qtyUn) || qtyUn <= 0) && (isNaN(qtyKg) || qtyKg <= 0)) {
      showToast("Informe ao menos uma quantidade válida (KG ou Unidades).", "error");
      return;
    }

    const mainQty = !isNaN(qtyUn) && qtyUn > 0 ? qtyUn : qtyKg;
    const mainUnit = !isNaN(qtyUn) && qtyUn > 0 ? 'UN' : 'KG';

    setSavingSolicitacao(true);
    try {
      await apiJson('/api/administrativo/terceirizados/solicitacoes', {
        method: 'POST',
        body: JSON.stringify({
          productCode: solicProductCode.trim(),
          productDescription: solicProductDesc.trim() || undefined,
          quantity: mainQty,
          unit: mainUnit,
          quantityKg: !isNaN(qtyKg) && qtyKg > 0 ? qtyKg : undefined,
          quantityUn: !isNaN(qtyUn) && qtyUn > 0 ? qtyUn : undefined,
          fornecedor: solicFornecedor.trim() || undefined,
          previsaoEntrega: solicPrevisao.trim() || undefined,
          observacoes: solicObservacoes.trim() || undefined,
          loteNumber: solicLoteNumber.trim() || undefined,
          solicitadoPor: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador'
        })
      });
      if (solicLoteNumber.trim()) {
        try {
          await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(solicLoteNumber.trim())}/terceirizado`, {
            method: 'POST',
            body: JSON.stringify({ isTerceirizado: true })
          });
        } catch (_) {}
      }
      showToast("Solicitação de terceirizado criada com sucesso!");
      setShowNovaSolicitacaoModal(false);
      setSolicProductCode('');
      setSolicProductDesc('');
      setSolicQuantityKg('');
      setSolicQuantityUn('');
      setSolicUnitWeight(null);
      setIsCustomWeight(false);
      setSolicFornecedor('');
      setSolicPrevisao('');
      setSolicObservacoes('');
      setSolicLoteNumber('');
      fetchSolicitacoes();
      fetchLotes(); // Lotes vinculados migram para Terceirizados imediatamente
    } catch (e: any) {
      console.error("Erro ao criar solicitação:", e);
      showToast("Falha ao criar solicitação: " + (e?.message || e), "error");
    } finally {
      setSavingSolicitacao(false);
    }
  };

  // Salvar Previsão de Entrega da Solicitação de Terceirizado
  const handleSavePrevisaoSolicitacao = async (solicId: number, dateStr: string | null) => {
    setSavingPrevisaoSolic(true);
    const dateVal = dateStr?.trim() || null;
    const previous = [...solicitacoes];
    setSolicitacoes(prev => prev.map(s => s.id === solicId ? { ...s, previsaoEntrega: dateVal } : s));
    try {
      await apiJson(`/api/administrativo/terceirizados/solicitacoes/${solicId}/previsao`, {
        method: 'POST',
        body: JSON.stringify({
          previsaoEntrega: dateVal,
          updatedBy: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador'
        })
      });
      showToast(dateVal ? 'Previsão de entrega atualizada com sucesso!' : 'Previsão de entrega removida.');
      setEditingPrevisaoSolicId(null);
      fetchSolicitacoes();
      fetchLotes(); // Sincroniza lotes se houver lote vinculado
    } catch (err: any) {
      console.error("Erro ao salvar previsão da solicitação:", err);
      showToast("Falha ao salvar previsão: " + (err?.message || err), "error");
      setSolicitacoes(previous);
    } finally {
      setSavingPrevisaoSolic(false);
    }
  };

  // Alternar Aprovação (Embalagens ou Matéria-Prima)
  const handleToggleAprovacao = async (solicId: number, tipo: 'embalagem' | 'materia_prima', currentValue: boolean) => {
    try {
      const updated = await apiJson<TerceirizadoSolicitacao>(
        `/api/administrativo/terceirizados/solicitacoes/${solicId}/aprovar`,
        {
          method: 'POST',
          body: JSON.stringify({
            tipo,
            aprovado: !currentValue,
            aprovadoPor: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador'
          })
        }
      );
      setSolicitacoes(prev => prev.map(s => s.id === solicId ? updated : s));
      showToast(
        !currentValue
          ? `${tipo === 'embalagem' ? 'Embalagem' : 'Matéria-Prima'} aprovada com sucesso!`
          : `Aprovação de ${tipo === 'embalagem' ? 'embalagem' : 'matéria-prima'} desfeita.`
      );
    } catch (err: any) {
      console.error("Erro ao registrar aprovação:", err);
      showToast("Falha ao alterar aprovação: " + (err?.message || err), "error");
    }
  };

  // Lotes sugeridos para vínculo (mais recentes do mesmo produto, excluindo lotes já vinculados)
  const lotesSugeridosParaVinculo = useMemo(() => {
    if (!showVincularModal) return [];

    const targetCode = (showVincularModal.productCode || '').trim().toUpperCase();
    const targetDesc = (showVincularModal.productDescription || '').trim().toLowerCase();

    // 1. Coleta os lotes que já estão vinculados a outras solicitações ativas
    const vinculadosSet = new Set<string>();
    solicitacoes.forEach(s => {
      // Se não for a solicitação atual e tiver loteNumber associado em solicitação não cancelada
      if (s.id !== showVincularModal.id && s.loteNumber && s.status !== 'CANCELADO') {
        vinculadosSet.add(s.loteNumber.trim().toUpperCase());
      }
    });

    // 2. Filtra lotes do mesmo produto que NÃO estejam vinculados
    const matches = lotes.filter(l => {
      const lNum = (l.loteNumber || '').trim().toUpperCase();
      if (!lNum) return false;

      // Não mostrar lotes já vinculados a outras solicitações
      if (vinculadosSet.has(lNum)) return false;

      const pCode = (l.productCode || '').trim().toUpperCase();
      if (targetCode && pCode) {
        return pCode === targetCode;
      }
      if (targetDesc && l.productDescription) {
        return l.productDescription.trim().toLowerCase() === targetDesc;
      }
      return false;
    });

    // 3. Deduplica por número de lote
    const seen = new Set<string>();
    const uniqueMatches: AcompanhamentoLote[] = [];
    for (const m of matches) {
      const lNum = (m.loteNumber || '').trim().toUpperCase();
      if (!seen.has(lNum)) {
        seen.add(lNum);
        uniqueMatches.push(m);
      }
    }

    // 4. Ordena do mais recente para o mais antigo:
    // Critérios: Data do lote (date ou dataPrevisao) desc, depois número do lote numérico desc
    return uniqueMatches.sort((a, b) => {
      const dateA = a.date || a.dataPrevisao || '';
      const dateB = b.date || b.dataPrevisao || '';
      if (dateA && dateB && dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      const numA = parseInt((a.loteNumber || '').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt((b.loteNumber || '').replace(/\D/g, ''), 10) || 0;
      return numB - numA;
    });
  }, [showVincularModal, lotes, solicitacoes]);

  // Abrir Modal de Vínculo com busca remota de lotes recentes no ERP
  const handleOpenVincularModal = async (solic: TerceirizadoSolicitacao) => {
    setShowVincularModal(solic);
    setVincularLoteInput(solic.loteNumber || '');

    if (solic.productCode && solic.productCode.trim()) {
      setLoadingLotesRecentes(true);
      try {
        const clean = solic.productCode.trim();
        const data = await apiJson<AcompanhamentoLote[]>(`/api/administrativo/acompanhamento-producao?search=${encodeURIComponent(clean)}`);
        if (Array.isArray(data) && data.length > 0) {
          setLotes(prev => {
            const getKey = (l: AcompanhamentoLote) => `${(l.loteNumber || '').trim().toLowerCase()}__${(l.productCode || '').trim().toLowerCase()}`;
            const existingKeys = new Set(prev.map(getKey));
            let added = false;
            const next = [...prev];
            for (const item of data) {
              const k = getKey(item);
              if (!existingKeys.has(k)) {
                next.unshift(item);
                existingKeys.add(k);
                added = true;
              }
            }
            return added ? next : prev;
          });
        }
      } catch (err) {
        console.warn("Erro ao buscar lotes recentes do produto para vínculo:", err);
      } finally {
        setLoadingLotesRecentes(false);
      }
    }
  };

  // Vincular Solicitação de Terceirizado a um Lote
  const handleVincularSolicitacao = async () => {
    if (!showVincularModal) return;
    if (!vincularLoteInput.trim()) {
      showToast("Informe o número do lote.", "error");
      return;
    }

    setSavingVinculo(true);
    try {
      await apiJson(`/api/administrativo/terceirizados/solicitacoes/${showVincularModal.id}/vincular`, {
        method: 'POST',
        body: JSON.stringify({
          loteNumber: vincularLoteInput.trim()
        })
      });
      try {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(vincularLoteInput.trim())}/terceirizado`, {
          method: 'POST',
          body: JSON.stringify({ isTerceirizado: true })
        });
      } catch (_) {}
      showToast(`Solicitação vinculada ao lote #${vincularLoteInput.trim()}!`);
      setShowVincularModal(null);
      setVincularLoteInput('');
      fetchSolicitacoes();
      fetchLotes();
    } catch (e: any) {
      console.error("Erro ao vincular lote:", e);
      showToast("Falha ao vincular lote: " + (e?.message || e), "error");
    } finally {
      setSavingVinculo(false);
    }
  };

  // Excluir Solicitação
  const handleDeleteSolicitacao = async (id: number) => {
    if (!window.confirm("Deseja realmente excluir esta solicitação?")) return;
    try {
      await apiJson(`/api/administrativo/terceirizados/solicitacoes/${id}`, {
        method: 'DELETE'
      });
      showToast("Solicitação excluída com sucesso.");
      fetchSolicitacoes();
    } catch (e) {
      console.error("Erro ao excluir solicitação:", e);
      showToast("Falha ao excluir solicitação.", "error");
    }
  };

  // Desvincular Solicitação de Terceirizado
  const handleDesvincularSolicitacao = async (id: number, loteNumber?: string | null) => {
    if (!window.confirm(`Deseja desvincular o lote ${loteNumber ? '#' + loteNumber : ''} desta solicitação? Ela retornará para o status SOLICITADO.`)) return;
    try {
      await apiJson(`/api/administrativo/terceirizados/solicitacoes/${id}/desvincular`, {
        method: 'POST'
      });
      showToast("Lote desvinculado com sucesso.");
      fetchSolicitacoes();
      fetchLotes();
    } catch (e: any) {
      console.error("Erro ao desvincular lote:", e);
      showToast("Falha ao desvincular lote: " + (e?.message || e), "error");
    }
  };

  // Alteração de Status com verificação de "Em Espera"
  const handleStatusChange = async (loteNumber: string, newStatus: string) => {
    return await handleSelectStatusChange(loteNumber, newStatus);
  };

  const handleOpenEsperaModal = (
    loteNumber: string,
    etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase',
    _initialMotivo?: string
  ) => {
    const existing = lotes.find(l => l.loteNumber === loteNumber);
    if (existing) handleOpenPauseModal(existing, etapa);
  };

  const handleSelectStatusChange = async (loteNumber: string, newStatus: string) => {
    return await executeStatusUpdate(loteNumber, newStatus, null);
  };

  // Salvar alteração de status com motivo opcional
  const executeStatusUpdate = async (loteNumber: string, newStatus: string, motivoEspera: string | null) => {
    setSavingLote(loteNumber);
    const previousLotes = [...lotes];
    const option = STATUS_OPTIONS.find(o => o.value === newStatus);
    const category = option ? option.category : (
      newStatus === 'Produção' || newStatus === 'Produzido' || newStatus === 'Fila Pesagem' || newStatus === 'Liberado Pesagem' || newStatus === 'Pesagem'
        ? 'Pesagem e Produção'
        : (newStatus === 'Finalizada' || newStatus === 'Ordem Finalizada' || newStatus === 'Rotulagem' || newStatus === 'Envase' ? 'Embalagem' : null)
    );
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
    const nowIso = new Date().toISOString();

    // Atualização otimista na UI
    setLotes(prev => prev.map(item => {
      if (item.loteNumber === loteNumber) {
        const updated: AcompanhamentoLote = {
          ...item,
          customStatus: newStatus || null,
          category: category,
          updatedBy: responsibleName,
          updatedAt: nowIso,
          motivoEspera: newStatus === 'Em Espera' ? motivoEspera : null
        };
        if (newStatus === 'Pesagem' || newStatus === 'Fila Pesagem') updated.dataPesagem = item.dataPesagem || nowIso;
        if (newStatus === 'Produzido' || newStatus === 'Produção') {
          updated.dataProducao = item.dataProducao || nowIso;
          if (!updated.dataPesagem) {
            updated.dataPesagem = item.dataPesagem || item.dataPrevisao || pesagemSelectedDate || nowIso;
          }
        }
        if (newStatus === 'Liberado Pesagem') {
          if (!updated.dataPesagem) {
            updated.dataPesagem = item.dataPesagem || item.dataPrevisao || pesagemSelectedDate || nowIso;
          }
        }
        if (newStatus === 'Liberado para Envase') updated.dataLiberadoEnvase = item.dataLiberadoEnvase || nowIso;
        if (newStatus === 'Envase') updated.dataEnvase = item.dataEnvase || nowIso;
        if (newStatus === 'Rotulagem') updated.dataRotulagem = item.dataRotulagem || nowIso;
        if (newStatus === 'Finalizada' || newStatus === 'Ordem Finalizada') updated.dataFinalizada = item.dataFinalizada || nowIso;
        if (newStatus === 'Em Espera') updated.dataEmEspera = item.dataEmEspera || nowIso;
        return updated;
      }
      return item;
    }));

    // Mantém o lote como concluído no Quadro de Pesagem se entrou em produção ou liberado
    if (newStatus === 'Produção' || newStatus === 'Produzido' || newStatus === 'Liberado Pesagem') {
      setPesagemConcluidosLotes(prev => {
        if (prev.includes(loteNumber)) return prev;
        const next = [...prev, loteNumber];
        try {
          localStorage.setItem('natum_pesagem_concluidos_lotes', JSON.stringify(next));
        } catch {}
        return next;
      });
    } else if (newStatus === 'Fila Pesagem') {
      setPesagemConcluidosLotes(prev => {
        const next = prev.filter(x => x !== loteNumber);
        try {
          localStorage.setItem('natum_pesagem_concluidos_lotes', JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    // Se o status for de finalização, remove imediatamente das filas operacionais de Envase e Rotulagem
    if (newStatus === 'Finalizada' || newStatus === 'Ordem Finalizada') {
      const cleanTarget = (loteNumber || '').trim().toLowerCase();
      setProgramacaoEnvase(prev => prev.filter(it => (it.loteNumber || '').trim().toLowerCase() !== cleanTarget));
      setProgramacaoRotulagem(prev => prev.filter(it => (it.loteNumber || '').trim().toLowerCase() !== cleanTarget));
      apiJson(`/api/administrativo/envase/programacao/lote/${encodeURIComponent(loteNumber)}`, {
        method: 'DELETE'
      }).catch(() => {});
      apiJson(`/api/administrativo/rotulagem/programacao/lote/${encodeURIComponent(loteNumber)}`, {
        method: 'DELETE'
      }).catch(() => {});
    }

    try {
      if (!newStatus) {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}`, {
          method: 'DELETE',
        });
        showToast(`Lote ${loteNumber} redefinido para status padrão.`);
      } else {
        await apiJson('/api/administrativo/lote-status', {
          method: 'POST',
          body: JSON.stringify({
            loteNumber,
            customStatus: newStatus,
            category,
            updatedBy: responsibleName,
            motivoEspera: newStatus === 'Em Espera' ? motivoEspera : null,
          })
        });
        showToast(
          newStatus === 'Em Espera'
            ? `Lote ${loteNumber} em espera: ${motivoEspera || 'Sem motivo'}`
            : `Lote ${loteNumber} atualizado para ${newStatus}.`
        );
        setRecentlyUpdatedLotes(prev => ({
          ...prev,
          [loteNumber]: { status: newStatus || 'Padrão', timestamp: Date.now() }
        }));
        setTimeout(() => {
          setRecentlyUpdatedLotes(prev => {
            const next = { ...prev };
            delete next[loteNumber];
            return next;
          });
        }, 2500);
      }
    } catch (err) {
      console.error("Erro ao salvar status do lote:", err);
      setLotes(previousLotes);
      showToast("Falha ao salvar alteração no servidor.", "error");
      throw err;
    } finally {
      setSavingLote(null);
      setPauseModalLote(null);
    }
  };

  // Identificação e movimentação rápida de lotes entre quadros a partir da busca
  const getLoteCurrentQuadro = useCallback((lote: AcompanhamentoLote): { quadroId: string; quadroNome: string; status: string } => {
    if (isLoteConcluido(lote)) {
      return { quadroId: 'quadro_ordens', quadroNome: 'Quadro de Ordens (Finalizada)', status: 'Ordem Finalizada' };
    }
    if (isLoteParcial(lote)) {
      return { quadroId: 'quadro_ordens', quadroNome: 'Quadro de Ordens (Parcial)', status: 'Ordem Parcial' };
    }
    const eff = getEffectiveStatus(lote);
    if (eff === 'Pesagem' || (!lote.customStatus && lote.erpStatus === 'PG')) {
      return { quadroId: 'quadro_pesagem', quadroNome: 'Quadro de Pesagem', status: 'Pesagem' };
    }
    if (eff === 'Produção' || lote.customStatus === 'Produção' || (!lote.customStatus && lote.erpStatus === 'PR')) {
      return { quadroId: 'quadro_producao', quadroNome: 'Quadro de Produção', status: 'Produção' };
    }
    if (eff === 'Produzido' || eff === 'Liberado para Envase' || lote.customStatus === 'Produzido' || lote.customStatus === 'Liberado para Envase') {
      return { quadroId: 'quadro_envase', quadroNome: 'Quadro de Envase', status: 'Liberado para Envase' };
    }
    if (eff === 'Rotulagem' || lote.customStatus === 'Rotulagem') {
      return { quadroId: 'quadro_rotulagem', quadroNome: 'Quadro de Rotulagem', status: 'Rotulagem' };
    }
    if (eff === 'Em Espera' || lote.customStatus === 'Em Espera') {
      return { quadroId: 'espera', quadroNome: 'Em Espera', status: 'Em Espera' };
    }
    return { quadroId: 'outros', quadroNome: eff || 'Outros', status: eff || 'Aberto' };
  }, []);

  const handleMoverLoteParaQuadro = useCallback(async (
    loteNumber: string,
    targetStatus: string,
    targetQuadroNome: string,
    targetDateOverride?: string
  ) => {
    try {
      let normalizedStatus = targetStatus;
      let category: string | null = null;
      if (targetStatus === 'Produção' || targetStatus === 'Produzido') {
        normalizedStatus = 'Produzido';
        category = 'Pesagem e Produção';
      } else if (targetStatus === 'Finalizada' || targetStatus === 'Ordem Finalizada') {
        normalizedStatus = 'Ordem Finalizada';
        category = 'Embalagem';
      } else if (targetStatus === 'Pesagem' || targetStatus === 'Fila Pesagem' || targetStatus === 'Liberado Pesagem') {
        normalizedStatus = targetStatus;
        category = 'Pesagem e Produção';
      } else if (targetStatus === 'Liberado para Envase') {
        normalizedStatus = 'Liberado para Envase';
        category = 'Pesagem e Produção';
      } else if (targetStatus === 'Rotulagem' || targetStatus === 'Envase' || targetStatus === 'Ordem Parcial') {
        normalizedStatus = targetStatus;
        category = 'Embalagem';
      } else {
        const opt = STATUS_OPTIONS.find(o => o.value === targetStatus);
        category = opt ? opt.category : null;
      }

      // Determinar a data destino selecionada no quadro alvo
      const targetDate = targetDateOverride || (() => {
        const norm = targetQuadroNome.toLowerCase();
        if (norm.includes('produção') || norm.includes('producao')) return producaoSelectedDate;
        if (norm.includes('pesagem')) return pesagemSelectedDate;
        if (norm.includes('envase')) return envaseSelectedDate;
        if (norm.includes('rotulagem')) return rotulagemSelectedDate;
        if (norm.includes('ordens')) return ordensSelectedDate;
        if (currentTab === 'quadro_producao') return producaoSelectedDate;
        if (currentTab === 'quadro_pesagem') return pesagemSelectedDate;
        if (currentTab === 'quadro_envase') return envaseSelectedDate;
        if (currentTab === 'quadro_rotulagem') return rotulagemSelectedDate;
        if (currentTab === 'quadro_ordens') return ordensSelectedDate;
        return new Date().toISOString().split('T')[0];
      })();

      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
      const nowIso = new Date().toISOString();

      // Atualização imediata otimista no estado local para feedback instantâneo
      setLotes(prev => prev.map(item => {
        if (item.loteNumber === loteNumber) {
          const updated: AcompanhamentoLote = {
            ...item,
            customStatus: normalizedStatus,
            dataPrevisao: targetDate || item.dataPrevisao,
            category: category || item.category,
            updatedBy: responsibleName,
            updatedAt: nowIso
          };
          if (normalizedStatus === 'Pesagem' || normalizedStatus === 'Fila Pesagem') updated.dataPesagem = item.dataPesagem || nowIso;
          if (normalizedStatus === 'Produzido' || normalizedStatus === 'Produção') updated.dataProducao = item.dataProducao || nowIso;
          if (normalizedStatus === 'Liberado para Envase') updated.dataLiberadoEnvase = item.dataLiberadoEnvase || nowIso;
          if (normalizedStatus === 'Envase') updated.dataEnvase = item.dataEnvase || nowIso;
          if (normalizedStatus === 'Rotulagem') updated.dataRotulagem = item.dataRotulagem || nowIso;
          if (normalizedStatus === 'Finalizada' || normalizedStatus === 'Ordem Finalizada') updated.dataFinalizada = item.dataFinalizada || nowIso;
          return updated;
        }
        return item;
      }));

      await executeStatusUpdate(loteNumber, normalizedStatus, null);

      // Salvar a nova data de previsão no backend com a data do quadro destino
      if (targetDate) {
        try {
          await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/previsao`, {
            method: 'POST',
            body: JSON.stringify({
              dataPrevisao: targetDate,
              updatedBy: responsibleName
            })
          });
          setLotes(prev => prev.map(item => item.loteNumber === loteNumber ? { ...item, dataPrevisao: targetDate } : item));
        } catch (prevErr) {
          console.warn('[handleMoverLoteParaQuadro] Aviso ao sincronizar dataPrevisao:', prevErr);
        }
      }

      // Se estava oculto no quadro de destino, restaura automaticamente para voltar a aparecer
      let targetQuadroKey = '';
      const normDest = targetQuadroNome.toLowerCase();
      if (normDest.includes('pesagem')) targetQuadroKey = 'pesagem';
      else if (normDest.includes('produção') || normDest.includes('producao')) targetQuadroKey = 'producao';
      else if (normDest.includes('envase')) targetQuadroKey = 'envase';
      else if (normDest.includes('rotulagem')) targetQuadroKey = 'rotulagem';

      if (targetQuadroKey) {
        try {
          await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/restaurar-quadro`, {
            method: 'POST',
            body: JSON.stringify({ quadro: targetQuadroKey })
          });
        } catch (_) {}
      }

      await fetchLotes();
      if (currentTab === 'quadro_envase' || targetQuadroNome.toLowerCase().includes('envase')) {
        await fetchProgramacaoEnvase('TODOS');
      }

      const dateFmt = formatDateOnly(targetDate);
      showToast(`✅ Lote #${loteNumber} adicionado/movido para ${targetQuadroNome} (${dateFmt})!`, 'success');
    } catch (err: any) {
      console.error("Erro ao mover lote entre quadros:", err);
      showToast(`Erro ao mover lote #${loteNumber}: ${err?.message || err}`, 'error');
    }
  }, [fetchLotes, currentTab, fetchProgramacaoEnvase, producaoSelectedDate, pesagemSelectedDate, envaseSelectedDate, rotulagemSelectedDate, ordensSelectedDate, currentUser]);

  const handleOcultarLoteDoQuadro = useCallback(async (loteNumber: string, quadro: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => {
    try {
      // Atualização otimista imediata no estado local
      setLotes(prev => prev.map(l => {
        if (l.loteNumber === loteNumber) {
          const currentOcultos = Array.isArray(l.quadrosOcultos) ? [...l.quadrosOcultos] : [];
          if (!currentOcultos.some(q => q.toLowerCase() === quadro.toLowerCase())) {
            currentOcultos.push(quadro);
          }
          return { ...l, quadrosOcultos: currentOcultos, quadros_ocultos: currentOcultos };
        }
        return l;
      }));

      // Se for do envase, limpar localmente de programacaoEnvase se constar
      if (quadro === 'envase') {
        setProgramacaoEnvase(prev => prev.filter(p => p.loteNumber !== loteNumber));
      }

      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/ocultar-quadro`, {
        method: 'POST',
        body: JSON.stringify({ quadro })
      });

      const quadroNomeMap: Record<string, string> = {
        pesagem: 'Pesagem',
        producao: 'Produção',
        rotulagem: 'Rotulagem',
        envase: 'Envase'
      };
      showToast(`Lote #${loteNumber} removido do quadro de ${quadroNomeMap[quadro] || quadro}. (Permanece integralmente no Quadro de Ordens)`, 'info');
      await fetchLotes();
      if (quadro === 'envase') {
        await fetchProgramacaoEnvase('TODOS');
      } else if (quadro === 'rotulagem') {
        await fetchProgramacaoRotulagem('TODOS');
      }
    } catch (err: any) {
      console.error('Erro ao ocultar lote do quadro:', err);
      showToast(`Erro ao remover lote #${loteNumber}: ${err?.message || err}`, 'error');
      await fetchLotes();
    }
  }, [fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem]);

  const handleRestaurarLoteNoQuadro = useCallback(async (loteNumber: string, quadro: string) => {
    try {
      // Atualização otimista local
      setLotes(prev => prev.map(l => {
        if (l.loteNumber === loteNumber) {
          const currentOcultos = Array.isArray(l.quadrosOcultos)
            ? l.quadrosOcultos.filter(q => quadro.toLowerCase() === 'todos' ? false : q.toLowerCase() !== quadro.toLowerCase())
            : [];
          return { ...l, quadrosOcultos: currentOcultos, quadros_ocultos: currentOcultos };
        }
        return l;
      }));

      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/restaurar-quadro`, {
        method: 'POST',
        body: JSON.stringify({ quadro })
      });

      showToast(`Lote #${loteNumber} restaurado com sucesso!`, 'success');
      await fetchLotes();
      if (quadro.toLowerCase() === 'envase' || quadro.toLowerCase() === 'todos') {
        await fetchProgramacaoEnvase('TODOS');
      }
      if (quadro.toLowerCase() === 'rotulagem' || quadro.toLowerCase() === 'todos') {
        await fetchProgramacaoRotulagem('TODOS');
      }
    } catch (err: any) {
      console.error('Erro ao restaurar lote no quadro:', err);
      showToast(`Erro ao restaurar lote #${loteNumber}: ${err?.message || err}`, 'error');
      await fetchLotes();
    }
  }, [fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem]);

  const handleRemoverDaFila = useCallback(async (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => {
    if (etapa === 'envase') {
      setManualLiberadosEnvase(prev => {
        const next = new Set(prev);
        next.delete((loteNumber || '').trim().toLowerCase());
        next.delete(loteNumber);
        try {
          localStorage.setItem('natum_manual_liberados_envase', JSON.stringify(Array.from(next)));
        } catch {}
        return next;
      });
    } else {
      setManualFilasAdicionados(prev => {
        const currentList = prev[etapa] || [];
        const nextList = currentList.filter(n => n !== loteNumber);
        const next = { ...prev, [etapa]: nextList };
        try {
          localStorage.setItem('natum_filas_manuais_adicionados', JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    await handleOcultarLoteDoQuadro(loteNumber, etapa);
  }, [handleOcultarLoteDoQuadro]);

  const handleOpenAddLoteModal = useCallback((target: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => {
    setAddLoteModalTarget(target);
    setAddLoteModalSearch('');
  }, []);

  const handleConfirmAddLote = useCallback(async (lote: AcompanhamentoLote) => {
    if (!addLoteModalTarget) return;
    const target = addLoteModalTarget;
    const cleanNum = (lote.loteNumber || '').trim().toLowerCase();

    try {
      if (target === 'envase') {
        setManualLiberadosEnvase(prev => {
          const next = new Set(prev);
          next.add(cleanNum);
          next.add(lote.loteNumber);
          try {
            localStorage.setItem('natum_manual_liberados_envase', JSON.stringify(Array.from(next)));
          } catch {}
          return next;
        });

        // Se estava oculto no envase, restaura
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/restaurar-quadro`, {
          method: 'POST',
          body: JSON.stringify({ quadro: 'envase' })
        }).catch(() => {});

        // Atualiza customStatus para Liberado para Envase
        await executeStatusUpdate(lote.loteNumber, 'Liberado para Envase', null).catch(() => {});

        showToast(`✅ Lote #${lote.loteNumber} liberado para envase com sucesso!`, 'success');
      } else {
        setManualFilasAdicionados(prev => {
          const currentList = prev[target] || [];
          if (!currentList.includes(lote.loteNumber)) {
            const nextList = [...currentList, lote.loteNumber];
            const next = { ...prev, [target]: nextList };
            try {
              localStorage.setItem('natum_filas_manuais_adicionados', JSON.stringify(next));
            } catch {}
            return next;
          }
          return prev;
        });

        // Se estava oculto nesse quadro, restaura
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/restaurar-quadro`, {
          method: 'POST',
          body: JSON.stringify({ quadro: target })
        }).catch(() => {});

        const targetLabel = target === 'pesagem' ? 'Pesagem' : target === 'producao' ? 'Produção' : 'Rotulagem';
        showToast(`✅ Lote #${lote.loteNumber} adicionado à Fila de ${targetLabel}!`, 'success');
      }

      await fetchLotes();
      setAddLoteModalTarget(null);
    } catch (e: any) {
      console.error("Erro ao adicionar lote à fila:", e);
      showToast(`Erro ao adicionar lote: ${e?.message || e}`, 'error');
    }
  }, [addLoteModalTarget, executeStatusUpdate, fetchLotes]);

  const handleMoverParaCaldeira = useCallback(async (loteNumber: string) => {
    setLotesComCaldeira(prev => {
      const next = new Set(prev);
      next.add(loteNumber);
      try {
        localStorage.setItem('natum_lotes_com_caldeira', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    setProducaoOrderOverrides(prev => {
      if (prev.includes(loteNumber)) return prev;
      const next = [...prev, loteNumber];
      try {
        localStorage.setItem('natum_producao_order_overrides', JSON.stringify(next));
      } catch {}
      return next;
    });
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

    // Atualização otimista em memória
    setLotes(prev => prev.map(l => l.loteNumber === loteNumber ? { ...l, category: 'Caldeira' } : l));

    await saveEtapaStatus(loteNumber, 'producao', 'ativo', null, null, null, responsibleName);

    try {
      await apiJson('/api/administrativo/lote-status', {
        method: 'POST',
        body: JSON.stringify({
          loteNumber,
          customStatus: 'Produzido',
          category: 'Caldeira',
          updatedBy: responsibleName
        })
      });
    } catch (e) {
      console.error('Erro ao salvar categoria Caldeira no backend:', e);
    }

    showToast(`🔥 Lote #${loteNumber} alocado com sucesso no Quadro de Caldeira!`, 'success');
  }, [currentUser, saveEtapaStatus]);

  // Renderização de tags de quadros dos quais o lote foi removido, com botão de restauração rápida
  const renderQuadrosOcultosBadges = (lote: AcompanhamentoLote) => {
    const raw = lote.quadrosOcultos || (lote as any).quadros_ocultos;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
    const quadroNomeMap: Record<string, string> = {
      pesagem: 'Pesagem',
      producao: 'Produção',
      rotulagem: 'Rotulagem',
      envase: 'Envase'
    };
    return (
      <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-zinc-100 text-[10px]">
        <span className="text-zinc-500 font-semibold flex items-center gap-1">
          <EyeOff className="h-3 w-3 text-rose-500 shrink-0" />
          <span>Fora de:</span>
        </span>
        {raw.map((q: string) => (
          <span key={q} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 capitalize font-medium">
            <span>{quadroNomeMap[q.toLowerCase()] || q}</span>
            <button
              type="button"
              onClick={() => handleRestaurarLoteNoQuadro(lote.loteNumber, q)}
              className="hover:text-rose-900 cursor-pointer ml-0.5 p-0.5 hover:bg-rose-100 rounded"
              title={`Restaurar lote no quadro de ${quadroNomeMap[q.toLowerCase()] || q}`}
            >
              <Undo2 className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {raw.length > 1 && (
          <button
            type="button"
            onClick={() => handleRestaurarLoteNoQuadro(lote.loteNumber, 'todos')}
            className="text-indigo-600 hover:text-indigo-800 underline font-semibold ml-0.5 cursor-pointer text-[10px]"
            title="Restaurar visualização em todos os quadros operacionais"
          >
            Restaurar todos
          </button>
        )}
      </div>
    );
  };

  // Verifica se o lote possui apontamento de problema, insumo faltante ou motivo de pausa (isolado por etapa quando especificada)
  const hasLoteProblemaOuPausa = (
    lote: AcompanhamentoLote | null | undefined,
    itemEnvase?: ProgramacaoEnvaseItem | null,
    etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase'
  ): boolean => {
    if (!lote) return false;
    if (etapa) {
      const etapaInfo = getLoteEtapaStatus(lote, etapa);
      const isEnvaseEspera = etapa === 'envase' && (itemEnvase?.statusEnvase === 'EM_ESPERA' || Boolean(itemEnvase?.observacoes && itemEnvase.observacoes.toLowerCase().includes('espera')));
      return Boolean(etapaInfo.isEspera || etapaInfo.insumoFaltanteCodigo || etapaInfo.motivoEspera || isEnvaseEspera);
    }
    const cod = lote.insumoFaltanteCodigo || (lote as any).insumo_faltante_codigo;
    const desc = lote.insumoFaltanteDescricao || (lote as any).insumo_faltante_descricao;
    const motivo = lote.motivoEspera;
    const eff = getEffectiveStatus(lote);
    const isEspera = eff === 'Em Espera' || lote.customStatus === 'Em Espera' || Boolean(lote.dataEmEspera) || lote.erpStatus === 'ES';
    const isEnvaseEspera = itemEnvase?.statusEnvase === 'EM_ESPERA' || Boolean(itemEnvase?.observacoes && itemEnvase.observacoes.toLowerCase().includes('espera'));
    return Boolean(cod || desc || motivo || isEspera || isEnvaseEspera);
  };

  // Renderiza produtos do lote com suporte completo a múltiplos produtos (ex: lotes com 2 produtos)
  const renderLoteProductsInfo = (lote: AcompanhamentoLote | { loteNumber: string; productCode?: string; productDescription?: string; quantity?: number; quantityKg?: number }) => {
    if (!lote || !lote.loteNumber) return null;
    const prods = lotes.filter(l => (l.loteNumber || '').trim().toLowerCase() === (lote.loteNumber || '').trim().toLowerCase());
    if (prods.length <= 1) {
      return (
        <div>
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-zinc-900">
            <span>#{lote.loteNumber}</span>
            {lote.productCode && <span className="text-zinc-400 font-normal">({lote.productCode})</span>}
          </div>
          <p className="text-xs font-bold text-zinc-800 mt-0.5 line-clamp-2 leading-tight">
            {lote.productDescription}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-zinc-900">
          <span>#{lote.loteNumber}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 font-sans">
            {prods.length} Produtos
          </span>
        </div>
        <div className="space-y-1 pl-1.5 border-l-2 border-purple-300">
          {prods.map((p, pIdx) => (
            <div key={`${p.productCode || pIdx}_${pIdx}`} className="text-[11px] leading-tight">
              <span className="font-bold text-zinc-800 line-clamp-1">{p.productDescription}</span>
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                <span>{p.productCode}</span>
                <span>{Number(p.quantity || 0).toLocaleString('pt-BR')} un</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const lotesByNumber = useMemo(() => {
    const map = new Map<string, AcompanhamentoLote>();
    for (const l of lotes) {
      if (l.loteNumber) {
        map.set(l.loteNumber.trim(), l);
      }
    }
    return map;
  }, [lotes]);

  const lotesByNumberAndProduct = useMemo(() => {
    const map = new Map<string, AcompanhamentoLote>();
    for (const l of lotes) {
      if (l.loteNumber && l.productCode) {
        map.set(`${l.loteNumber.trim().toLowerCase()}__${l.productCode.trim().toLowerCase()}`, l);
      }
    }
    return map;
  }, [lotes]);

  const getRealLote = (loteNumber?: string | null, productCode?: string | null): AcompanhamentoLote | undefined => {
    if (!loteNumber) return undefined;
    const cleanLote = loteNumber.trim();
    if (productCode) {
      const match = lotesByNumberAndProduct.get(`${cleanLote.toLowerCase()}__${productCode.trim().toLowerCase()}`);
      if (match) return match;
    }
    return lotesByNumber.get(cleanLote);
  };

  // Retorna informações de adiamento se o lote foi adiado a partir de uma data de referência e etapa
  const getLoteAdiadoInfo = useCallback((loteNumber: string, targetDate: string, etapa?: string) => {
    if (!targetDate || !loteNumber) return null;
    const cleanTarget = targetDate.split('T')[0].split(' ')[0];

    const isStrictlyAfter = (dateA: string, dateB: string) => {
      if (!dateA || !dateB) return false;
      return dateA.localeCompare(dateB) > 0;
    };

    // 1. Do histórico gravado localmente (gerado por ações diretas nos quadros)
    const local = lotesAdiadosHistorico.find(reg => {
      const orig = (reg.dataOriginal || '').split('T')[0].split(' ')[0];
      const para = (reg.dataAdiadoPara || '').split('T')[0].split(' ')[0];
      const regEtapa = (reg.etapa || reg.origem || '').toLowerCase();
      const matchEtapa = !etapa || !regEtapa || regEtapa.includes(etapa.toLowerCase()) || etapa.toLowerCase().includes(regEtapa);
      return reg.loteNumber === loteNumber && (para === cleanTarget || orig === cleanTarget) && isStrictlyAfter(para, orig) && matchEtapa;
    });
    if (local) {
      const isDestino = (local.dataAdiadoPara || '').split('T')[0].split(' ')[0] === cleanTarget;
      return { dataAdiadoPara: local.dataAdiadoPara, dataOriginal: local.dataOriginal, isDestino };
    }

    // 2. Do historico_reagendamentos vindo do banco de dados (lote_custom_status)
    const l = lotesByNumber.get(loteNumber);
    if (l) {
      const hist = l.historicoReagendamentos || (l as any).historico_reagendamentos;
      if (Array.isArray(hist)) {
        for (const h of hist) {
          const orig = (h.dataAnterior || h.dataOriginal || '').split('T')[0].split(' ')[0];
          const para = (h.novaData || h.dataAdiadoPara || '').split('T')[0].split(' ')[0];
          const hEtapa = (h.etapa || h.origem || '').toLowerCase();

          // Histórico geral de lote_custom_status (data_previsao de PCP) não deve interferir
          // em linhas operacionais com grade própria (envase ou rotulagem), a menos que explicitamente gravado para essa etapa.
          if ((etapa === 'envase' || etapa === 'rotulagem') && !hEtapa.includes(etapa)) {
            continue;
          }

          const matchEtapa = !etapa || !hEtapa || hEtapa.includes(etapa.toLowerCase()) || etapa.toLowerCase().includes(hEtapa);
          if ((para === cleanTarget || orig === cleanTarget) && para && orig && isStrictlyAfter(para, orig) && matchEtapa) {
            const motivo = (h.motivo || '').toLowerCase();
            const tipo = (h.tipo || '').toLowerCase();
            if (tipo === 'antecipacao' || motivo.startsWith('antecipado')) {
              continue;
            }
            const isDestino = para === cleanTarget;
            return { dataAdiadoPara: para, dataOriginal: orig, isDestino };
          }
        }
      }
    }
    return null;
  }, [lotesAdiadosHistorico, lotesByNumber]);

  // Renderiza banner destacado de lote em espera persistente (em qualquer etapa da fábrica)
  const renderLoteEsperaBadge = (lote: AcompanhamentoLote) => {
    const espera = getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem);
    if (!espera.isEmEspera) return null;

    return (
      <div
        onClick={() => handleOpenPauseModal(lote, espera.etapa || undefined)}
        className={cn(
          "p-2 rounded-lg text-[11px] font-semibold flex flex-col gap-1 cursor-pointer transition-all shadow-2xs border",
          espera.badgeBg,
          espera.badgeText,
          espera.badgeBorder
        )}
        title="Clique para editar o motivo da espera ou insumo faltante"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 font-bold truncate">
            <PauseCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              ⏸️ Em Espera: <span className="font-extrabold underline decoration-current">{espera.etapaLabel}</span>
            </span>
          </div>
          <span className="text-[10px] opacity-75 underline font-normal shrink-0 hover:opacity-100">
            Editar
          </span>
        </div>

        {espera.insumoCodigo ? (
          <div className="text-[10px] font-mono bg-rose-100/70 border border-rose-200 px-2 py-0.5 rounded text-rose-900 font-semibold truncate">
            🚨 Faltante: [{espera.insumoCodigo}] {espera.insumoDescricao || ''}
          </div>
        ) : null}

        {espera.motivo && espera.motivo !== 'Falta de Insumo / Matéria-Prima' && (
          <div className="text-[10px] italic truncate pl-5">
            Motivo: {espera.motivo}
          </div>
        )}

        <div className="pt-1 border-t border-current/15 flex items-center justify-between text-[10px]">
          <span className="opacity-75 font-normal">Fluxo pausado ({espera.etapaLabel})</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleResumeLote(lote, espera.etapa || undefined);
            }}
            className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold transition-colors cursor-pointer flex items-center gap-0.5 shadow-2xs"
            title="Liberar lote e retomar para a fila"
          >
            <Play className="h-2.5 w-2.5 fill-current" />
            <span>Retomar</span>
          </button>
        </div>
      </div>
    );
  };

  // Renderiza banner destacado de problema / insumo faltante no card de qualquer fila (isolado por etapa)
  const renderLoteProblemaBanner = (
    lote: AcompanhamentoLote,
    etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase'
  ) => {
    if (!hasLoteProblemaOuPausa(lote, null, etapa)) return null;

    let cod: string | null | undefined;
    let desc: string | null | undefined;
    let motivo: string | null | undefined;
    let isEspera: boolean;

    if (etapa) {
      const etapaInfo = getLoteEtapaStatus(lote, etapa);
      cod = etapaInfo.insumoFaltanteCodigo;
      desc = etapaInfo.insumoFaltanteDescricao;
      motivo = etapaInfo.motivoEspera;
      isEspera = etapaInfo.isEspera;
    } else {
      cod = lote.insumoFaltanteCodigo || (lote as any).insumo_faltante_codigo;
      desc = lote.insumoFaltanteDescricao || (lote as any).insumo_faltante_descricao;
      motivo = lote.motivoEspera;
      const eff = getEffectiveStatus(lote);
      isEspera = eff === 'Em Espera' || lote.customStatus === 'Em Espera' || Boolean(lote.dataEmEspera);
    }

    return (
      <div
        onClick={() => handleOpenPauseModal(lote, etapa)}
        className={cn(
          "p-2 rounded-lg text-[11px] font-semibold flex flex-col gap-1 cursor-pointer transition-all shadow-2xs border",
          cod 
            ? "bg-rose-50/90 border-rose-200 text-rose-950 hover:bg-rose-100" 
            : "bg-amber-50/90 border-amber-200 text-amber-950 hover:bg-amber-100"
        )}
        title="Clique para editar o motivo da pausa ou insumo faltante"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 font-bold truncate">
            {cod ? (
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
            ) : (
              <PauseCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            )}
            <span className="truncate">
              {cod ? 'Falta de Insumo / Material' : (motivo || 'Lote em Espera')}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 underline font-normal shrink-0 hover:text-zinc-800">
            Editar
          </span>
        </div>

        {cod && (
          <div className="text-[10px] font-mono bg-rose-100/70 border border-rose-200 px-2 py-0.5 rounded text-rose-900 font-semibold truncate">
            🚨 Faltante: [{cod}] {desc || ''}
          </div>
        )}

        {motivo && motivo !== 'Falta de Insumo / Matéria-Prima' && (
          <div className="text-[10px] text-amber-900/90 italic truncate">
            Motivo: {motivo}
          </div>
        )}

        {isEspera && (
          <div className="pt-1 border-t border-zinc-200/50 flex items-center justify-between text-[10px]">
            <span className="text-zinc-500 font-normal">Fluxo pausado</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleResumeLote(lote, etapa);
              }}
              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold transition-colors cursor-pointer flex items-center gap-0.5 shadow-2xs"
              title="Liberar lote e retomar para a fila"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              <span>Retomar</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // Funções de Seleção Múltipla de Lotes
  const toggleSelectLote = (loteNumber: string) => {
    setSelectedLotes(prev => {
      const next = new Set(prev);
      if (next.has(loteNumber)) next.delete(loteNumber);
      else next.add(loteNumber);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedLotes.size === sortedLotes.length && sortedLotes.length > 0) {
      setSelectedLotes(new Set());
    } else {
      setSelectedLotes(new Set(sortedLotes.map(l => l.loteNumber)));
    }
  };

  const handleApplyBatchStatus = async (statusValue: string, motivoOverride?: string | null) => {
    if (!statusValue) return;
    if (statusValue === 'Em Espera' && motivoOverride === undefined) {
      setShowBatchEsperaModal(true);
      return;
    }

    const loteNumbers = Array.from(selectedLotes);
    if (loteNumbers.length === 0) return;

    setIsBatchUpdating(true);
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
    const finalStatus = statusValue === '__RESET__' ? null : statusValue;
    const option = STATUS_OPTIONS.find(o => o.value === finalStatus);
    const category = option ? option.category : null;
    const finalMotivo = statusValue === 'Em Espera'
      ? (motivoOverride || (batchEsperaMotivo === 'Outro' ? batchCustomMotivo : batchEsperaMotivo))
      : null;

    try {
      await apiJson('/api/administrativo/lote-status/batch', {
        method: 'POST',
        body: JSON.stringify({
          loteNumbers,
          customStatus: finalStatus,
          category,
          updatedBy: responsibleName,
          motivoEspera: finalMotivo,
        })
      });

      showToast(`${loteNumbers.length} lote(s) atualizado(s) para "${finalStatus || 'Padrão'}".`);
      setSelectedLotes(new Set());
      setBatchStatusValue('');
      fetchLotes();
    } catch (e: any) {
      console.error("Erro ao aplicar status em lote:", e);
      showToast("Falha ao atualizar status dos lotes: " + (e?.message || e), "error");
    } finally {
      setIsBatchUpdating(false);
      setShowBatchEsperaModal(false);
    }
  };

  // Alternar flag de Terceirizado
  const handleToggleTerceirizado = async (loteNumber: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setLotes(prev => prev.map(l => l.loteNumber === loteNumber ? { ...l, isTerceirizado: newValue } : l));
    try {
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/terceirizado`, {
        method: 'POST',
        body: JSON.stringify({ isTerceirizado: newValue })
      });
      showToast(newValue ? `Lote #${loteNumber} movido para Terceirizados.` : `Lote #${loteNumber} movido para Internos.`);
    } catch (e) {
      console.error("Erro ao alternar flag de terceirizado:", e);
      setLotes(prev => prev.map(l => l.loteNumber === loteNumber ? { ...l, isTerceirizado: currentValue } : l));
      showToast("Erro ao alterar classificação.", "error");
    }
  };

  // Atualizar Ordem de Kit
  const handleUpdateKitOrder = async (orderId: number, status: string, quantityAssembled: number, observations?: string) => {
    setSavingKitOrder(true);
    try {
      await apiJson(`/api/kits/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          quantity_assembled: quantityAssembled,
          observations: observations || undefined,
          assembled_by: (currentUser?.displayName || (currentUser as any)?.display_name) || undefined
        })
      });
      showToast(`Ordem de Kit #${selectedKitOrder?.orderNumber} atualizada!`);
      setSelectedKitOrder(null);
      fetchKitOrders();
    } catch (err) {
      console.error("Erro ao atualizar ordem de kit:", err);
      showToast("Falha ao atualizar ordem de kit.", "error");
    } finally {
      setSavingKitOrder(false);
    }
  };

  // Abrir Modal de Histórico de Mudanças de Status
  const handleOpenHistory = async (lote: AcompanhamentoLote) => {
    setHistoryModalLote(lote);
    setLoadingHistory(true);
    try {
      const data = await apiJson<StatusHistoryEntry[]>(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/history`);
      setHistoryList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Erro ao carregar histórico:", e);
      setHistoryList([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handlers para Pausar / Retomar Lote e Insumo Faltante
  const handlePauseInsumoLookup = async (codeStr: string) => {
    const clean = codeStr.trim().toUpperCase();
    setPauseInsumoCodigo(clean);
    if (!clean || clean.length < 2) {
      setPauseInsumoDescricao('');
      return;
    }
    setPauseLoadingInsumo(true);
    try {
      const res = await apiJson<{ codigo: string; descricao: string }>(
        `/api/administrativo/terceirizados/produto/${encodeURIComponent(clean)}`
      );
      if (res && res.descricao) {
        setPauseInsumoDescricao(res.descricao);
      }
    } catch (e) {
      console.warn("Insumo não encontrado no cadastro:", e);
    } finally {
      setPauseLoadingInsumo(false);
    }
  };


  const handleOpenPauseModal = (
    lote: AcompanhamentoLote,
    etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase'
  ) => {
    let targetEtapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' = etapa || 'pesagem';
    if (!etapa) {
      if (currentTab === 'quadro_pesagem') targetEtapa = 'pesagem';
      else if (currentTab === 'quadro_producao') targetEtapa = 'producao';
      else if (currentTab === 'quadro_rotulagem') targetEtapa = 'rotulagem';
      else if (currentTab === 'quadro_envase') targetEtapa = 'envase';
    }
    setPauseModalEtapa(targetEtapa);
    setPauseModalLote(lote);

    const etapaInfo = getLoteEtapaStatus(lote, targetEtapa);
    const cod = etapaInfo.insumoFaltanteCodigo || '';
    const desc = etapaInfo.insumoFaltanteDescricao || '';
    setPauseInsumoCodigo(cod);
    setPauseInsumoDescricao(desc);

    if (cod) {
      setPauseTipoMotivo('Falta de Insumo / Matéria-Prima');
      setPauseMotivoCustom('');
    } else if (etapaInfo.motivoEspera) {
      if (MOTIVOS_PAUSA_PADRAO.includes(etapaInfo.motivoEspera)) {
        setPauseTipoMotivo(etapaInfo.motivoEspera);
        setPauseMotivoCustom('');
      } else {
        setPauseTipoMotivo('Outro Motivo');
        setPauseMotivoCustom(etapaInfo.motivoEspera);
      }
    } else {
      setPauseTipoMotivo('Falta de Insumo / Matéria-Prima');
      setPauseMotivoCustom('');
    }
  };

  const handleSavePause = async () => {
    if (!pauseModalLote) return;
    let finalMotivo = pauseTipoMotivo === 'Outro Motivo'
      ? pauseMotivoCustom.trim() || 'Pausa Operacional'
      : pauseTipoMotivo;

    const insumoCod = pauseInsumoCodigo.trim().toUpperCase();
    const insumoDesc = pauseInsumoDescricao.trim();

    if (pauseTipoMotivo === 'Falta de Insumo / Matéria-Prima' && insumoCod) {
      finalMotivo = `Falta de Insumo: [${insumoCod}] ${insumoDesc || insumoCod}`;
    }

    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
    const targetEtapa = pauseModalEtapa;

    setSavingPause(true);
    try {
      await saveEtapaStatus(
        pauseModalLote.loteNumber,
        targetEtapa,
        'Em Espera',
        finalMotivo,
        insumoCod || null,
        insumoDesc || null,
        responsibleName
      );

      const etapaLabel = targetEtapa === 'pesagem' ? 'Pesagem' :
        targetEtapa === 'producao' ? 'Produção' :
        targetEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase';

      showToast(`Lote #${pauseModalLote.loteNumber} pausado em ${etapaLabel}: ${finalMotivo}`);
      setPauseModalLote(null);
    } catch (e) {
      console.error("Erro ao pausar lote:", e);
      showToast("Falha ao salvar pausa do lote.", "error");
    } finally {
      setSavingPause(false);
    }
  };

  const handleResumeLote = async (
    lote: AcompanhamentoLote,
    etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase'
  ) => {
    const esperaDetails = getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem);
    const targetEtapa = etapa || esperaDetails.etapa || pauseModalEtapa || 'pesagem';
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

    try {
      await saveEtapaStatus(
        lote.loteNumber,
        targetEtapa,
        'ativo',
        null,
        null,
        null,
        responsibleName
      );

      // Se for envase e houver item em programacaoEnvase com EM_ESPERA, restaura statusEnvase
      if (targetEtapa === 'envase') {
        const envItem = programacaoEnvase.find(it => (it.loteNumber || '').trim().toUpperCase() === (lote.loteNumber || '').trim().toUpperCase());
        if (envItem && envItem.statusEnvase === 'EM_ESPERA') {
          handleChangeStatusEnvase(envItem, 'PROGRAMADO', '');
        }
      }

      const etapaLabel = targetEtapa === 'pesagem' ? 'Pesagem' :
        targetEtapa === 'producao' ? 'Produção' :
        targetEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase';

      showToast(`Lote #${lote.loteNumber} retomado em ${etapaLabel}!`);
      if (pauseModalLote?.loteNumber === lote.loteNumber) {
        setPauseModalLote(null);
      }
    } catch (e) {
      console.error("Erro ao retomar lote:", e);
      showToast("Falha ao retomar lote.", "error");
    }
  };

  // Modal de Envase Parcial Handlers
  const handleOpenParcialModal = (lote: AcompanhamentoLote) => {
    setParcialModalLote(lote);
    const todayStr = new Date().toISOString().split('T')[0];
    setNovoApontamento({
      data: todayStr,
      quantidade: '',
      observacao: '',
    });
  };

  const handleAddApontamento = async () => {
    if (!parcialModalLote) return;
    const qtd = parseFloat(String(novoApontamento.quantidade).replace(',', '.'));
    if (!qtd || isNaN(qtd) || qtd <= 0) {
      showToast("Informe uma quantidade válida envasada.", "error");
      return;
    }

    const existingList = Array.isArray(parcialModalLote.ficha_ordem?.apontamentosParciais)
      ? parcialModalLote.ficha_ordem.apontamentosParciais
      : Array.isArray(parcialModalLote.fichaOrdem?.apontamentosParciais)
      ? parcialModalLote.fichaOrdem.apontamentosParciais
      : [];

    const dateFormatted = novoApontamento.data
      ? novoApontamento.data.split('-').reverse().join('/')
      : new Date().toLocaleDateString('pt-BR');

    const novoItem = {
      id: String(Date.now()),
      data: dateFormatted,
      quantidade: qtd,
      observacao: novoApontamento.observacao.trim(),
      operador: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador',
    };

    const updatedList = [...existingList, novoItem];
    const totalEnvasado = updatedList.reduce((acc, a) => acc + (Number(a.quantidade) || 0), 0);
    const shouldFinish = totalEnvasado >= (parcialModalLote.quantity || 0);
    const newStatus = shouldFinish ? 'Ordem Finalizada' : 'Ordem Parcial';

    setSavingParcial(true);
    try {
      const fichaObj = {
        ...(parcialModalLote.ficha_ordem || parcialModalLote.fichaOrdem || {}),
        apontamentosParciais: updatedList,
      };

      await apiJson('/api/administrativo/lote-ficha', {
        method: 'POST',
        body: JSON.stringify({
          loteNumber: parcialModalLote.loteNumber,
          fichaOrdem: fichaObj,
          quantidadeEnvasadaParcial: totalEnvasado,
          customStatus: newStatus,
        })
      });

      const updated = {
        ...parcialModalLote,
        ficha_ordem: fichaObj,
        fichaOrdem: fichaObj,
        quantidade_envasada_parcial: totalEnvasado,
        quantidadeEnvasadaParcial: totalEnvasado,
        customStatus: newStatus,
      };

      setParcialModalLote(updated);
      setLotes(prev => prev.map(l => l.loteNumber === parcialModalLote.loteNumber ? updated : l));
      setNovoApontamento(prev => ({ ...prev, quantidade: '', observacao: '' }));
      showToast(`Apontamento de ${qtd.toLocaleString('pt-BR')} un salvo!`);
    } catch (e) {
      console.error("Erro ao salvar apontamento parcial:", e);
      showToast("Não foi possível salvar o apontamento.", "error");
    } finally {
      setSavingParcial(false);
    }
  };

  const handleRemoveApontamento = async (apId: string) => {
    if (!parcialModalLote) return;
    const existingList = Array.isArray(parcialModalLote.ficha_ordem?.apontamentosParciais)
      ? parcialModalLote.ficha_ordem.apontamentosParciais
      : Array.isArray(parcialModalLote.fichaOrdem?.apontamentosParciais)
      ? parcialModalLote.fichaOrdem.apontamentosParciais
      : [];

    const updatedList = existingList.filter((a: any) => a.id !== apId);
    const totalEnvasado = updatedList.reduce((acc, a) => acc + (Number(a.quantidade) || 0), 0);
    const newStatus = totalEnvasado > 0 ? 'Ordem Parcial' : parcialModalLote.customStatus;

    setSavingParcial(true);
    try {
      const fichaObj = {
        ...(parcialModalLote.ficha_ordem || parcialModalLote.fichaOrdem || {}),
        apontamentosParciais: updatedList,
      };

      await apiJson('/api/administrativo/lote-ficha', {
        method: 'POST',
        body: JSON.stringify({
          loteNumber: parcialModalLote.loteNumber,
          fichaOrdem: fichaObj,
          quantidadeEnvasadaParcial: totalEnvasado,
          customStatus: newStatus,
        })
      });

      const updated = {
        ...parcialModalLote,
        ficha_ordem: fichaObj,
        fichaOrdem: fichaObj,
        quantidade_envasada_parcial: totalEnvasado,
        quantidadeEnvasadaParcial: totalEnvasado,
        customStatus: newStatus,
      };

      setParcialModalLote(updated);
      setLotes(prev => prev.map(l => l.loteNumber === parcialModalLote.loteNumber ? updated : l));
      showToast("Apontamento removido.");
    } catch (e) {
      console.error("Erro ao remover apontamento:", e);
      showToast("Falha ao remover apontamento.", "error");
    } finally {
      setSavingParcial(false);
    }
  };

  const handleFinalizarOrdemParcial = async () => {
    if (!parcialModalLote) return;
    setSavingParcial(true);
    try {
      await apiJson('/api/administrativo/lote-status', {
        method: 'POST',
        body: JSON.stringify({
          loteNumber: parcialModalLote.loteNumber,
          customStatus: 'Ordem Finalizada',
        })
      });

      setLotes(prev => prev.map(l => l.loteNumber === parcialModalLote.loteNumber ? { ...l, customStatus: 'Ordem Finalizada' } : l));
      showToast(`Lote #${parcialModalLote.loteNumber} concluído como Ordem Finalizada!`);
      setParcialModalLote(null);
    } catch (e) {
      console.error("Erro ao finalizar ordem:", e);
      showToast("Falha ao finalizar ordem.", "error");
    } finally {
      setSavingParcial(false);
    }
  };

  // Lista agrupada de insumos faltantes em lotes pausados
  const insumosFaltantesList = useMemo(() => {
    const map = new Map<string, { codigo: string; descricao: string; count: number }>();
    lotes.forEach(l => {
      const cod = l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo;
      if (l.motivoEspera && cod) {
        const desc = l.insumoFaltanteDescricao || (l as any).insumo_faltante_descricao || cod;
        const existing = map.get(cod);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(cod, { codigo: cod, descricao: desc, count: 1 });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [lotes]);

  // Contagens para Lotes (Internos vs Terceirizados com base no isolamento estrito)
  const filterCounts = useMemo(() => {
    const list = currentTab === 'terceirizados'
      ? lotes.filter(l => isLoteTerceirizado(l))
      : lotes.filter(l => !isLoteTerceirizado(l));

    let aberto = 0;
    let concluidoEa = 0;
    let pesagem = 0;
    let produzido = 0;
    let liberadoEnvase = 0;
    let envase = 0;
    let rotulagem = 0;
    let espera = 0;
    let finalizada = 0;
    let pendente = 0;

    list.forEach(l => {
      const isConcluido = isLoteConcluido(l);
      if (!isConcluido) aberto++;
      if (isConcluido) concluidoEa++;

      const eff = getEffectiveStatus(l);
      if (eff === 'Pesagem') pesagem++;
      else if (eff === 'Produzido' || eff === 'Produção') produzido++;
      else if (eff === 'Liberado para Envase') liberadoEnvase++;
      else if (eff === 'Envase') envase++;
      else if (eff === 'Rotulagem') rotulagem++;
      else if (eff === 'Em Espera' || l.motivoEspera) espera++;
      else if (isConcluido) finalizada++;
      else pendente++;
    });

    return {
      todos: list.length,
      aberto,
      concluidoEa,
      pesagem,
      produzido,
      liberadoEnvase,
      envase,
      rotulagem,
      espera,
      finalizada,
      pendente
    };
  }, [lotes, currentTab, isLoteTerceirizado]);

  // Contagens para o Quadro de Pesagem
  const totalPesagemAberto = useMemo(() => {
    return lotes.filter(l => {
      if (isLoteTerceirizado(l)) return false;
      if (isLoteConcluido(l)) return false;
      const eff = getEffectiveStatus(l);
      return eff === 'Pesagem' || (!l.customStatus && l.erpStatus === 'PG');
    }).length;
  }, [lotes, isLoteTerceirizado]);

  // Contagens para o Quadro de Produção (Manipulação)
  const totalProducaoAberto = useMemo(() => {
    return lotes.filter(l => {
      if (isLoteTerceirizado(l)) return false;
      if (isLoteConcluido(l)) return false;
      const eff = getEffectiveStatus(l);
      return eff === 'Produção' || l.customStatus === 'Produção' || (!l.customStatus && l.erpStatus === 'PR') || isLoteParcial(l);
    }).length;
  }, [lotes, isLoteTerceirizado]);

  // Contagens para o Quadro de Envase (Liberados e Prontos para Encaixar)
  const totalEnvaseDisponivel = useMemo(() => {
    return lotes.filter(l => {
      if (isLoteTerceirizado(l)) {
        const effStatus = getEffectiveStatus(l);
        const isAptoTerc = effStatus === 'Liberado para Envase' || effStatus === 'Produzido' || effStatus === 'Envase' ||
          l.customStatus === 'Liberado para Envase' || l.customStatus === 'Produzido' || l.customStatus === 'Envase' || isLoteParcial(l);
        if (!isAptoTerc) return false;
      }
      if (isLoteConcluido(l)) return false;
      if (isLoteOcultoNoQuadro(l, 'envase')) return false;

      // Se já está programado no quadro de envase (Linha 1, 2 ou 3), não conta como disponível para encaixe
      const isAlreadyScheduled = programacaoEnvase.some(it => 
        (it.loteNumber || '').trim().toUpperCase() === (l.loteNumber || '').trim().toUpperCase() && 
        (!it.productCode || !l.productCode || (it.productCode || '').trim().toUpperCase() === (l.productCode || '').trim().toUpperCase())
      );
      if (isAlreadyScheduled) return false;

      const eff = getEffectiveStatus(l);
      const etapaProducao = getLoteEtapaStatus(l, 'producao');
      const temProblema = hasLoteProblemaOuPausa(l, null, 'envase');

      // Lotes aptos/liberados para envase
      const isLiberado = eff === 'Produzido' || eff === 'Liberado para Envase' || eff === 'Envase' ||
        l.customStatus === 'Produzido' || l.customStatus === 'Liberado para Envase' || l.customStatus === 'Envase' ||
        (!l.customStatus && (l.erpStatus === 'PR' || l.erpStatus === 'EN')) ||
        etapaProducao.isConcluido ||
        isLoteParcial(l);

      // Pendências do fluxo de envase (lotes pausados no envase ou com falta de insumo no envase)
      const isPendencia = temProblema && (
        isLiberado ||
        Boolean(l.dataLiberadoEnvase) ||
        Boolean(l.dataEnvase) ||
        l.category === 'Embalagem'
      );

      if (!isLiberado && !isPendencia) return false;
      if (eff === 'Pesagem' || eff === 'Em Pesagem') return false;
      if (eff === 'Produção' && !isLoteParcial(l) && !l.dataLiberadoEnvase && !etapaProducao.isConcluido) return false;

      return true;
    }).length;
  }, [lotes, isLoteTerceirizado, programacaoEnvase]);

  // Contagens para o Quadro de Rotulagem (Lotes entre Pesagem e Produção)
  const totalRotulagemDisponivel = useMemo(() => {
    return lotes.filter(l => {
      if (isLoteTerceirizado(l)) {
        const effStatus = getEffectiveStatus(l);
        const isAptoTerc = effStatus === 'Rotulagem' || effStatus === 'Liberado para Envase' || effStatus === 'Produzido' ||
          l.customStatus === 'Rotulagem' || l.customStatus === 'Liberado para Envase' || l.customStatus === 'Produzido' || isLoteParcial(l);
        if (!isAptoTerc) return false;
      }
      if (isLoteConcluido(l)) return false;
      if (isLoteParcial(l)) return true;
      const eff = getEffectiveStatus(l);
      return (
        (eff === 'Pesagem' || eff === 'Produção' || eff === 'Em Pesagem' || eff === 'Produzido' || eff === 'Liberado para Envase' || eff === 'Rotulagem' ||
         l.erpStatus === 'PG' || l.erpStatus === 'PP' || l.erpStatus === 'PR') &&
        l.erpStatus !== 'CA'
      );
    }).length;
  }, [lotes, isLoteTerceirizado]);

  // Contagens para a Aba de Terceirizados
  const totalTerceirizadosAberto = useMemo(() => {
    return lotes.filter(l => isLoteTerceirizado(l) && l.erpStatus !== 'EA' && l.customStatus !== 'Finalizada').length;
  }, [lotes, isLoteTerceirizado]);

  // Contagens para a Aba de Kits
  const totalKitsAberto = useMemo(() => {
    return kitOrders.filter(k => k.status !== 'COMPLETED' && k.status !== 'CANCELLED').length;
  }, [kitOrders]);

  // Contagens para o Quadro de Ordens (Ordens Finalizadas pelo chão de fábrica pendentes de lançamento no ERP)
  const totalOrdensFinalizadasNaoLancadas = useMemo(() => {
    return lotes.filter(l => {
      if (isLoteTerceirizado(l)) return false;
      const eff = getEffectiveStatus(l);
      const isFin = eff === 'Ordem Finalizada' || eff === 'Finalizada' || l.customStatus === 'Ordem Finalizada' || l.customStatus === 'Finalizada';
      return isFin && l.erpStatus !== 'EA';
    }).length;
  }, [lotes, isLoteTerceirizado]);

  // Sidebar Items
  const sidebarItems: SidebarItem[] = useMemo(() => [
    {
      id: 'lotes',
      label: 'Status de Lotes',
      icon: Table,
      badge: filterCounts.aberto > 0 ? filterCounts.aberto : undefined,
    },
    {
      id: 'terceirizados',
      label: 'Terceirizados',
      icon: Building2,
      badge: totalTerceirizadosAberto > 0 ? totalTerceirizadosAberto : undefined,
    },
    {
      id: 'kits',
      label: 'Ordens de Kits',
      icon: Boxes,
      badge: totalKitsAberto > 0 ? totalKitsAberto : undefined,
    },
    {
      id: 'quadro_pesagem',
      label: 'Quadro de Pesagem',
      icon: Scale,
      badge: totalPesagemAberto > 0 ? totalPesagemAberto : undefined,
    },
    {
      id: 'quadro_producao',
      label: 'Quadro de Produção',
      icon: FlaskConical,
      badge: totalProducaoAberto > 0 ? totalProducaoAberto : undefined,
    },
    {
      id: 'quadro_rotulagem',
      label: 'Quadro de Rotulagem',
      icon: Tag,
      badge: totalRotulagemDisponivel > 0 ? totalRotulagemDisponivel : undefined,
    },
    {
      id: 'quadro_envase',
      label: 'Quadro de Envase',
      icon: Layers,
      badge: totalEnvaseDisponivel > 0 ? totalEnvaseDisponivel : undefined,
    },
    {
      id: 'quadro_ordens',
      label: 'Quadro de Ordens',
      icon: CheckSquare,
      badge: totalOrdensFinalizadasNaoLancadas > 0 ? totalOrdensFinalizadasNaoLancadas : undefined,
    },
    {
      id: 'calendar',
      label: 'Calendário',
      icon: CalendarIcon,
    },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: Settings,
    },
  ], [filterCounts.aberto, totalPesagemAberto, totalProducaoAberto, totalRotulagemDisponivel, totalEnvaseDisponivel, totalOrdensFinalizadasNaoLancadas, totalTerceirizadosAberto, totalKitsAberto]);

  // Lista base de lotes para a aba ativa (Internos vs Terceirizados estritos)
  const baseTabLotes = useMemo(() => {
    return lotes.filter(lote => {
      const isTerc = isLoteTerceirizado(lote);
      if (currentTab === 'terceirizados' && !isTerc) return false;
      if (currentTab === 'lotes' && isTerc) return false;
      return true;
    });
  }, [lotes, currentTab, isLoteTerceirizado]);

  // Extrai o valor formatado de uma coluna do lote para filtragem
  const getLoteColumnValue = useCallback((lote: AcompanhamentoLote, colKey: string): string => {
    switch (colKey) {
      case 'loteNumber':
        return lote.loteNumber || '';
      case 'date':
        return formatDateOnly(lote.date);
      case 'productCode':
        return lote.productCode || '';
      case 'productDescription':
        return lote.productDescription || '';
      case 'erpStatus': {
        const isEa = lote.erpStatus === 'EA';
        return isEa ? 'Concluído (EA)' : (lote.erpStatusLabel || lote.erpStatus || 'Sem Status ERP');
      }
      case 'customStatus':
        return getEffectiveStatus(lote);
      case 'dataPrevisao': {
        if (!lote.dataPrevisao) return 'Sem Previsão';
        const badge = getPrevisaoBadge(lote.dataPrevisao);
        return badge ? badge.label : formatDateOnly(lote.dataPrevisao);
      }
      default:
        return '';
    }
  }, []);

  // Opções únicas disponíveis para cada coluna de Lotes
  const lotesColumnOptions = useMemo(() => {
    const columns = ['loteNumber', 'date', 'productCode', 'productDescription', 'erpStatus', 'customStatus', 'dataPrevisao'];
    const options: Record<string, { value: string; label: string; count: number }[]> = {};

    columns.forEach(colKey => {
      const counts = new Map<string, number>();
      baseTabLotes.forEach(l => {
        const val = getLoteColumnValue(l, colKey) || '(Vazio)';
        counts.set(val, (counts.get(val) || 0) + 1);
      });
      options[colKey] = Array.from(counts.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    });

    return options;
  }, [baseTabLotes, getLoteColumnValue]);

  // Filtragem dos lotes da Planilha (Busca Instantânea O(1) + Filtros de Insumo e Coluna)
  const filteredLotes = useMemo(() => {
    const rawQ = deferredSearch.trim().toLowerCase();
    let result = baseTabLotes;

    // 1. Busca rápida inteligente (precisão de lote x busca textual)
    if (rawQ) {
      const cleanQ = rawQ.replace(/^#/, '').trim();
      const isLoteNumberSearch = rawQ.startsWith('#') || /^\d+$/.test(cleanQ);

      if (isLoteNumberSearch) {
        // Busca orientada a número de LOTE:
        // Pesquisa exclusivamente no número do lote para evitar trazer centenas de produtos com volumes numéricos na descrição (ex: 250ml, 500g)
        const noLeadingZero = cleanQ.replace(/^0+/, '');

        // 1. Correspondência exata (com ou sem zeros à esquerda)
        const exactMatches = baseTabLotes.filter(l => {
          const lNum = (l.loteNumber || '').trim().toLowerCase();
          return lNum === cleanQ || (noLeadingZero !== '' && lNum.replace(/^0+/, '') === noLeadingZero);
        });

        if (exactMatches.length > 0) {
          result = exactMatches;
        } else {
          // 2. Prefixo estrito no número de lote (startsWith)
          result = baseTabLotes.filter(l => {
            const lNum = (l.loteNumber || '').trim().toLowerCase().replace(/^#/, '');
            return lNum.startsWith(cleanQ) || (noLeadingZero !== '' && lNum.replace(/^0+/, '').startsWith(noLeadingZero));
          });
        }
      } else {
        // Busca textual geral (descrição, código SKU, responsável, motivo, insumo)
        result = baseTabLotes.filter(lote => {
          const matchLote = (lote.loteNumber || '').toLowerCase().includes(cleanQ);
          const matchCode = (lote.productCode || '').toLowerCase().includes(cleanQ);
          const matchDesc = (lote.productDescription || '').toLowerCase().includes(cleanQ);
          const matchResp = (lote.updatedBy || '').toLowerCase().includes(cleanQ);
          const matchMotivo = (lote.motivoEspera || '').toLowerCase().includes(cleanQ);
          const matchInsumo = (lote.insumoFaltanteCodigo || '').toLowerCase().includes(cleanQ) || (lote.insumoFaltanteDescricao || '').toLowerCase().includes(cleanQ);
          return matchLote || matchCode || matchDesc || matchResp || matchMotivo || matchInsumo;
        });
      }
    }

    // 2. Filtro de Insumo Faltante
    if (selectedInsumoFaltanteFilter !== 'TODOS') {
      result = result.filter(l => (l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) === selectedInsumoFaltanteFilter);
    }

    // 3. Filtros de Coluna
    if (Object.keys(lotesColumnFilters).length > 0) {
      result = result.filter(lote => {
        for (const [colKey, selectedValues] of Object.entries(lotesColumnFilters)) {
          if (selectedValues === undefined) continue;
          const val = getLoteColumnValue(lote, colKey) || '(Vazio)';
          if (!selectedValues.has(val)) return false;
        }
        return true;
      });
    }

    return result;
  }, [baseTabLotes, deferredSearch, lotesColumnFilters, selectedInsumoFaltanteFilter, getLoteColumnValue]);

  // Ordenação dos lotes
  const sortedLotes = useMemo(() => {
    return [...filteredLotes].sort((a, b) => {
      let aVal: any = a[sortField] || '';
      let bVal: any = b[sortField] || '';

      if (sortField === 'quantity' || sortField === 'quantityKg') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredLotes, sortField, sortOrder]);

  const handleSort = (field: keyof AcompanhamentoLote) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Redefine a página quando qualquer filtro ou ordenação mudar
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, lotesColumnFilters, selectedInsumoFaltanteFilter, currentTab, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedLotes.length / pageSize));
  const paginatedLotes = useMemo(() => {
    if (pageSize >= 99999) return sortedLotes;
    const start = (currentPage - 1) * pageSize;
    return sortedLotes.slice(start, start + pageSize);
  }, [sortedLotes, currentPage, pageSize]);

  // Extrai valor de coluna de Kit
  const getKitColumnValue = useCallback((k: KitAssemblyOrder, colKey: string): string => {
    switch (colKey) {
      case 'orderNumber':
        return `#${k.orderNumber}`;
      case 'createdAt':
        return k.createdAt ? new Date(k.createdAt).toLocaleDateString('pt-BR') : '';
      case 'kitProductCode':
        return k.kitProductCode || '';
      case 'kitProductDescription':
        return k.kitProductDescription || '';
      case 'status':
        return k.status === 'COMPLETED' ? 'Concluído' : k.status === 'IN_PROGRESS' ? 'Em Montagem' : k.status === 'CANCELLED' ? 'Cancelado' : 'Pendente';
      case 'assembledBy':
        return k.assembledBy || 'Não atribuído';
      default:
        return '';
    }
  }, []);

  // Opções para colunas de Kits
  const kitsColumnOptions = useMemo(() => {
    const columns = ['orderNumber', 'createdAt', 'kitProductCode', 'kitProductDescription', 'status', 'assembledBy'];
    const options: Record<string, { value: string; label: string; count: number }[]> = {};

    columns.forEach(colKey => {
      const counts = new Map<string, number>();
      kitOrders.forEach(k => {
        const val = getKitColumnValue(k, colKey) || '(Vazio)';
        counts.set(val, (counts.get(val) || 0) + 1);
      });
      options[colKey] = Array.from(counts.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    });

    return options;
  }, [kitOrders, getKitColumnValue]);

  // Filtragem das Ordens de Kits
  const filteredKitOrders = useMemo(() => {
    const q = kitOrdersSearch.trim().toLowerCase();

    return kitOrders.filter(order => {
      if (q) {
        const matchNum = (order.orderNumber || '').toLowerCase().includes(q);
        const matchCode = (order.kitProductCode || '').toLowerCase().includes(q);
        const matchDesc = (order.kitProductDescription || '').toLowerCase().includes(q);
        const matchObs = (order.observations || '').toLowerCase().includes(q);
        if (!matchNum && !matchCode && !matchDesc && !matchObs) return false;
      }

      for (const [colKey, selectedValues] of Object.entries(kitsColumnFilters)) {
        if (selectedValues === undefined) continue;
        const val = getKitColumnValue(order, colKey) || '(Vazio)';
        if (!selectedValues.has(val)) return false;
      }

      return true;
    });
  }, [kitOrders, kitOrdersSearch, kitsColumnFilters, getKitColumnValue]);

  // Lista dinâmica de Fornecedores / Terceiristas sugeridos
  const suggestedFornecedores = useMemo(() => {
    const defaults = ['DAC Cosméticos', 'Vhiory', 'Natum Cosméticos', 'Artnor', 'Inovatta'];
    const fromList = solicitacoes.map(s => s.fornecedor?.trim()).filter(Boolean) as string[];
    return Array.from(new Set([...defaults, ...fromList]));
  }, [solicitacoes]);

  // Extrai valor de coluna de Solicitação
  const getSolicColumnValue = useCallback((s: TerceirizadoSolicitacao, colKey: string): string => {
    switch (colKey) {
      case 'createdAt':
        return s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '';
      case 'productCode':
        return s.productCode || '';
      case 'productDescription':
        return s.productDescription || '';
      case 'fornecedor':
        return s.fornecedor || 'Não definido';
      case 'previsaoEntrega': {
        const badge = getPrevisaoBadge(s.previsaoEntrega);
        return badge ? badge.label : (s.previsaoEntrega ? new Date(s.previsaoEntrega).toLocaleDateString('pt-BR') : 'Sem Previsão');
      }
      case 'aprovacoes': {
        const isAprovado = Boolean(s.aprovacaoEmbalagem && s.aprovacaoMateriaPrima);
        if (isAprovado) return '100% Aprovado';
        if (s.aprovacaoEmbalagem && !s.aprovacaoMateriaPrima) return 'Emb. Aprovada';
        if (!s.aprovacaoEmbalagem && s.aprovacaoMateriaPrima) return 'MP Aprovada';
        return 'Pendente';
      }
      case 'status':
        return s.status === 'VINCULADO' ? 'Vinculado ao ERP' : (s.aprovacaoEmbalagem && s.aprovacaoMateriaPrima ? 'Aprovado' : 'Aguardando Aprovação');
      case 'loteNumber':
        return s.loteNumber || 'Não vinculado';
      default:
        return '';
    }
  }, []);

  // Opções para colunas de Solicitações
  const solicColumnOptions = useMemo(() => {
    const columns = ['createdAt', 'productCode', 'productDescription', 'fornecedor', 'previsaoEntrega', 'aprovacoes', 'status', 'loteNumber'];
    const options: Record<string, { value: string; label: string; count: number }[]> = {};

    columns.forEach(colKey => {
      const counts = new Map<string, number>();
      solicitacoes.forEach(s => {
        const val = getSolicColumnValue(s, colKey) || '(Vazio)';
        counts.set(val, (counts.get(val) || 0) + 1);
      });
      options[colKey] = Array.from(counts.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    });

    return options;
  }, [solicitacoes, getSolicColumnValue]);

  // Filtragem de Solicitações de Terceirizados
  const filteredSolicitacoes = useMemo(() => {
    const q = solicitacoesSearch.trim().toLowerCase();

    return solicitacoes.filter(s => {
      if (q) {
        const mCode = (s.productCode || '').toLowerCase().includes(q);
        const mDesc = (s.productDescription || '').toLowerCase().includes(q);
        const mForn = (s.fornecedor || '').toLowerCase().includes(q);
        const mLote = (s.loteNumber || '').toLowerCase().includes(q);
        if (!mCode && !mDesc && !mForn && !mLote) return false;
      }

      for (const [colKey, selectedValues] of Object.entries(solicColumnFilters)) {
        if (selectedValues === undefined) continue;
        const val = getSolicColumnValue(s, colKey) || '(Vazio)';
        if (!selectedValues.has(val)) return false;
      }

      return true;
    });
  }, [solicitacoes, solicitacoesSearch, solicColumnFilters, getSolicColumnValue]);

  // Exportar Excel (.xlsx) completo com 3 abas: Lotes, Terceirizados, Kits
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1. ABA LOTES (PRODUÇÃO INTERNA)
      const lotesInternos = lotes.filter(l => !isLoteTerceirizado(l));
      const lotesAoa = [
        [
          "Lote", "Código SKU", "Descrição do Produto", "Qtd (Unidades)", "Peso Total (Kg)",
          "Data do Lote", "Previsão Entrega", "Situação", "Status Atual", "Categoria",
          "Pesagem", "Produzido", "Liberado Envase", "Envase", "Rotulagem", "Finalizado", "Em Espera", "Motivo Espera",
          "Responsável", "Última Atualização", "Observações"
        ],
        ...lotesInternos.map(l => {
          const isConcluido = l.erpStatus === 'EA' || l.customStatus === 'Finalizada';
          return [
            l.loteNumber || "",
            l.productCode || "",
            l.productDescription || "",
            l.quantity || 0,
            l.quantityKg || 0,
            l.date ? new Date(l.date).toLocaleDateString('pt-BR') : "",
            l.dataPrevisao ? new Date(l.dataPrevisao).toLocaleDateString('pt-BR') : "",
            isConcluido ? "Concluído" : "Em Aberto",
            getEffectiveStatus(l),
            l.category || "",
            l.dataPesagem ? new Date(l.dataPesagem).toLocaleString('pt-BR') : "",
            l.dataProducao ? new Date(l.dataProducao).toLocaleString('pt-BR') : "",
            l.dataLiberadoEnvase ? new Date(l.dataLiberadoEnvase).toLocaleString('pt-BR') : "",
            l.dataEnvase ? new Date(l.dataEnvase).toLocaleString('pt-BR') : "",
            l.dataRotulagem ? new Date(l.dataRotulagem).toLocaleString('pt-BR') : "",
            l.dataFinalizada ? new Date(l.dataFinalizada).toLocaleString('pt-BR') : "",
            l.dataEmEspera ? new Date(l.dataEmEspera).toLocaleString('pt-BR') : "",
            l.motivoEspera || "",
            l.updatedBy || "",
            l.updatedAt ? new Date(l.updatedAt).toLocaleString('pt-BR') : "",
            l.notes || ""
          ];
        })
      ];
      const wsLotes = XLSX.utils.aoa_to_sheet(lotesAoa);
      XLSX.utils.book_append_sheet(wb, wsLotes, "Lotes");

      // 2. ABA TERCEIRIZADOS (LOTES TERCEIRIZADOS + SOLICITAÇÕES)
      const lotesTerceirizados = lotes.filter(l => isLoteTerceirizado(l));
      const tercAoa = [
        [
          "Origem", "Identificador / Nº Lote", "Código SKU", "Descrição do Produto",
          "Qtd (Unidades)", "Peso Total (Kg)", "Data Abertura / Criado", "Previsão Entrega",
          "Fornecedor", "Status Atual", "Aprov. Embalagem", "Aprov. Matéria-Prima",
          "Responsável / Solicitante", "Observações"
        ],
        ...lotesTerceirizados.map(l => [
          "Lote ERP",
          l.loteNumber || "",
          l.productCode || "",
          l.productDescription || "",
          l.quantity || 0,
          l.quantityKg || 0,
          l.date ? new Date(l.date).toLocaleDateString('pt-BR') : "",
          l.dataPrevisao ? new Date(l.dataPrevisao).toLocaleDateString('pt-BR') : "",
          "",
          getEffectiveStatus(l),
          "-",
          "-",
          l.updatedBy || "",
          l.notes || l.motivoEspera || ""
        ]),
        ...solicitacoes.map(s => [
          "Solicitação",
          s.loteNumber ? `${s.loteNumber} (ID #${s.id})` : `ID #${s.id}`,
          s.productCode || "",
          s.productDescription || "",
          s.quantityUn || (s.unit === 'UN' ? s.quantity : 0),
          s.quantityKg || (s.unit === 'KG' ? s.quantity : 0),
          s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : "",
          s.previsaoEntrega ? new Date(s.previsaoEntrega).toLocaleDateString('pt-BR') : (s.previsaoEntrega || ""),
          s.fornecedor || "",
          s.status || "",
          s.aprovacaoEmbalagem ? "SIM" : "NÃO",
          s.aprovacaoMateriaPrima ? "SIM" : "NÃO",
          s.solicitadoPor || "",
          s.observacoes || ""
        ])
      ];
      const wsTerc = XLSX.utils.aoa_to_sheet(tercAoa);
      XLSX.utils.book_append_sheet(wb, wsTerc, "Terceirizados");

      // 3. ABA KITS (ORDENS DE MONTAGEM DE KITS)
      const kitsAoa = [
        [
          "Nº Ordem", "Código do Kit", "Descrição do Kit", "Qtd Planejada", "Qtd Montada",
          "Status", "Data Criação", "Data Conclusão", "Montado Por", "Conferido Por",
          "ERP Lançado", "Lotes Componentes", "Observações"
        ],
        ...kitOrders.map(k => [
          k.orderNumber || "",
          k.kitProductCode || "",
          k.kitProductDescription || "",
          k.quantity || 0,
          k.quantity_assembled !== null && k.quantity_assembled !== undefined ? k.quantity_assembled : 0,
          k.status || "",
          k.created_at ? new Date(k.created_at).toLocaleDateString('pt-BR') : "",
          k.completed_at ? new Date(k.completed_at).toLocaleDateString('pt-BR') : "",
          k.assembled_by || "",
          k.checked_by || "",
          k.erp_launched ? "SIM" : "NÃO",
          k.components_lotes || "",
          k.observations || ""
        ])
      ];
      const wsKits = XLSX.utils.aoa_to_sheet(kitsAoa);
      XLSX.utils.book_append_sheet(wb, wsKits, "Kits");

      // Salvar Arquivo
      const filename = `Producao_Lotes_Terceirizados_Kits_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast("Planilha Excel exportada com sucesso (3 abas: Lotes, Terceirizados e Kits)!");
    } catch (e: any) {
      console.error("Erro ao exportar Excel:", e);
      showToast("Falha ao exportar planilha Excel.", "error");
    }
  };

  // Helpers de Estilização de Badges
  const getBadgeClass = (status: string | null | undefined) => {
    switch (status) {
      case 'Pesagem':
        return 'bg-amber-100 text-amber-900 border-amber-300 font-semibold';
      case 'Produzido':
      case 'Produção':
        return 'bg-blue-100 text-blue-900 border-blue-300 font-semibold';
      case 'Liberado para Envase':
        return 'bg-teal-100 text-teal-900 border-teal-300 font-semibold';
      case 'Rotulagem':
        return 'bg-cyan-100 text-cyan-900 border-cyan-300 font-semibold';
      case 'Envase':
        return 'bg-purple-100 text-purple-900 border-purple-300 font-semibold';
      case 'Em Espera':
        return 'bg-orange-100 text-orange-950 border-orange-300 font-semibold';
      case 'Ordem Parcial':
        return 'bg-indigo-100 text-indigo-900 border-indigo-300 font-semibold';
      case 'Ordem Finalizada':
      case 'Finalizada':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold';
      default:
        return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    }
  };

  const getErpBadgeClass = (erpCode: string) => {
    if (erpCode === 'EA') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    switch (erpCode) {
      case 'PG':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'PR':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'CF':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-zinc-50 text-zinc-600 border-zinc-200';
    }
  };

  // CALENDÁRIO: Mapeamento de lotes por data ISO
  const lotesByDate = useMemo(() => {
    const map = new Map<string, AcompanhamentoLote[]>();
    for (const l of lotes) {
      const eff = getEffectiveStatus(l);
      const isConcluido = l.erpStatus === 'EA' || eff === 'Finalizada';
      if (calendarStatusFilter === 'ABERTO' && isConcluido) continue;
      if (calendarStatusFilter === 'CONCLUIDO_EA' && l.erpStatus !== 'EA' && eff !== 'Finalizada') continue;
      if (calendarStatusFilter === 'PESAGEM' && eff !== 'Pesagem') continue;
      if (calendarStatusFilter === 'PRODUCAO' && eff !== 'Produção') continue;
      if (calendarStatusFilter === 'ENVASE' && eff !== 'Envase') continue;
      if (calendarStatusFilter === 'ROTULAGEM' && eff !== 'Rotulagem') continue;
      if (calendarStatusFilter === 'EM_ESPERA' && eff !== 'Em Espera') continue;
      if (calendarStatusFilter === 'FINALIZADA' && eff !== 'Finalizada') continue;

      if (calendarSearch.trim()) {
        const q = calendarSearch.trim().toLowerCase();
        const matchLote = (l.loteNumber || '').toLowerCase().includes(q);
        const matchCode = (l.productCode || '').toLowerCase().includes(q);
        const matchDesc = (l.productDescription || '').toLowerCase().includes(q);
        if (!matchLote && !matchCode && !matchDesc) continue;
      }

      const iso = parseLoteDateToIso(l.date);
      if (iso) {
        if (!map.has(iso)) map.set(iso, []);
        map.get(iso)!.push(l);
      }
    }
    return map;
  }, [lotes, calendarStatusFilter, calendarSearch]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const handleGoToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    const pad = (n: number) => n.toString().padStart(2, '0');
    setSelectedDateIso(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  };

  // Grade de dias do Calendário
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay();
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const days: Array<{
      dateIso: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isWeekend: boolean;
      holiday: HolidayInfo | null;
      items: AcompanhamentoLote[];
      count: number;
      totalKg: number;
      openCount: number;
      completedCount: number;
    }> = [];

    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    // Mês Anterior
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateIso = `${prevYear}-${pad(prevMonth + 1)}-${pad(dayNum)}`;
      const items = lotesByDate.get(dateIso) || [];
      const open = items.filter(x => x.erpStatus !== 'EA' && x.customStatus !== 'Finalizada').length;
      const totalKg = items.reduce((s, x) => s + (Number(x.quantityKg) || 0), 0);
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: isWeekend(dateIso),
        holiday: getHoliday(dateIso),
        items,
        count: items.length,
        totalKg,
        openCount: open,
        completedCount: items.length - open,
      });
    }

    // Mês Atual
    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const dateIso = `${currentYear}-${pad(currentMonth + 1)}-${pad(dayNum)}`;
      const items = lotesByDate.get(dateIso) || [];
      const open = items.filter(x => x.erpStatus !== 'EA' && x.customStatus !== 'Finalizada').length;
      const totalKg = items.reduce((s, x) => s + (Number(x.quantityKg) || 0), 0);
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: true,
        isToday: dateIso === todayIso,
        isWeekend: isWeekend(dateIso),
        holiday: getHoliday(dateIso),
        items,
        count: items.length,
        totalKg,
        openCount: open,
        completedCount: items.length - open,
      });
    }

    // Próximo Mês
    const totalSlots = days.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - days.length;
    for (let dayNum = 1; dayNum <= remainingSlots; dayNum++) {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateIso = `${nextYear}-${pad(nextMonth + 1)}-${pad(dayNum)}`;
      const items = lotesByDate.get(dateIso) || [];
      const open = items.filter(x => x.erpStatus !== 'EA' && x.customStatus !== 'Finalizada').length;
      const totalKg = items.reduce((s, x) => s + (Number(x.quantityKg) || 0), 0);
      days.push({
        dateIso,
        dayNum,
        isCurrentMonth: false,
        isToday: dateIso === todayIso,
        isWeekend: isWeekend(dateIso),
        holiday: getHoliday(dateIso),
        items,
        count: items.length,
        totalKg,
        openCount: open,
        completedCount: items.length - open,
      });
    }

    return days;
  }, [currentYear, currentMonth, lotesByDate, today]);

  // Detalhes do dia selecionado no Calendário
  const selectedDayInfo = useMemo(() => {
    if (!selectedDateIso) return null;
    const items = lotesByDate.get(selectedDateIso) || [];
    const [y, m, d] = selectedDateIso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeekName = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ][dateObj.getDay()];

    const openCount = items.filter(x => x.erpStatus !== 'EA' && x.customStatus !== 'Finalizada').length;
    const totalKg = items.reduce((s, x) => s + (Number(x.quantityKg) || 0), 0);
    const totalUnidades = items.reduce((s, x) => s + (Number(x.quantity) || 0), 0);

    return {
      dateIso: selectedDateIso,
      dayFormatted: `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`,
      dayOfWeekName,
      holiday: getHoliday(selectedDateIso),
      isWeekend: isWeekend(selectedDateIso),
      items,
      count: items.length,
      totalKg,
      totalUnidades,
      openCount,
      completedCount: items.length - openCount,
    };
  }, [selectedDateIso, lotesByDate]);


  const formatEnvaseDateTitle = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return dateStr;
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  interface UnifiedQuadroHeaderProps {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    selectedDate: string;
    setSelectedDate: (d: string) => void;
    showAllDates: boolean;
    setShowAllDates: (all: boolean) => void;
    badgeCount?: number;
    badgeCountLabel?: string;
    badgeKg?: number;
    badgeUn?: number;
    badgeExtra?: React.ReactNode;
    operationalMetrics?: React.ReactNode;
    actionButtons?: React.ReactNode;
    onRefresh?: () => void;
    isRefreshing?: boolean;
  }

  const renderUnifiedQuadroHeader = ({
    title,
    subtitle,
    icon,
    selectedDate,
    setSelectedDate,
    showAllDates,
    setShowAllDates,
    badgeCount,
    badgeCountLabel = 'lote(s)',
    badgeKg,
    badgeUn,
    badgeExtra,
    operationalMetrics,
    actionButtons,
    onRefresh,
    isRefreshing = false,
  }: UnifiedQuadroHeaderProps) => {
    const handlePrevDay = () => {
      const parts = selectedDate.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2] - 1);
      const pad = (n: number) => n.toString().padStart(2, '0');
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setShowAllDates(false);
    };

    const handleNextDay = () => {
      const parts = selectedDate.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2] + 1);
      const pad = (n: number) => n.toString().padStart(2, '0');
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setShowAllDates(false);
    };

    const handleToday = () => {
      const d = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      setSelectedDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setShowAllDates(false);
    };

    const todayStr = (() => {
      const d = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })();

    const isTodaySelected = selectedDate === todayStr;
    const dateParts = selectedDate.split('-');
    const displayDateFormatted = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : selectedDate;

    return (
      <div className="bg-white rounded-xl p-3.5 border border-zinc-200 shadow-2xs space-y-3">
        {/* Linha Superior: Identificação do Quadro + Controles de Planejamento Diário */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-zinc-900 text-white rounded-xl shadow-2xs shrink-0">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-zinc-900 tracking-tight">{title}</h2>
                {badgeCount !== undefined && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-100 text-zinc-900 border border-zinc-200">
                    {badgeCount} {badgeCountLabel}
                  </span>
                )}
                {badgeKg !== undefined && badgeKg > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {Number(badgeKg).toLocaleString('pt-BR')} kg
                  </span>
                )}
                {badgeUn !== undefined && badgeUn > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-100 text-zinc-800 border border-zinc-200">
                    {Number(badgeUn).toLocaleString('pt-BR')} un
                  </span>
                )}
                {badgeExtra}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {subtitle}
                <span className="text-zinc-300 mx-1.5">•</span>
                <span className={showAllDates ? "text-zinc-600 font-semibold" : "text-indigo-600 font-semibold"}>
                  {showAllDates ? "Exibindo todos os lotes pendentes" : `Planejamento focado no dia ${displayDateFormatted}`}
                </span>
              </p>
            </div>
          </div>

          {/* Controles de Data e Modo */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Modo: Deste Dia vs Todos */}
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setShowAllDates(false)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                  !showAllDates ? "bg-white text-zinc-900 shadow-2xs font-extrabold" : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Ver apenas lotes programados para o dia selecionado"
              >
                <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                <span>Deste Dia</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAllDates(true)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                  showAllDates ? "bg-white text-zinc-900 shadow-2xs font-extrabold" : "text-zinc-500 hover:text-zinc-900"
                )}
                title="Ver todos os lotes pendentes nesta etapa (visão geral)"
              >
                <Layers className="h-3.5 w-3.5 text-zinc-600" />
                <span>Todos Pendentes</span>
              </button>
            </div>

            {/* Navegador Diário */}
            <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-lg p-1">
              <button
                type="button"
                onClick={handlePrevDay}
                className="p-1 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded cursor-pointer transition-colors"
                title="Dia anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleToday}
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer",
                  isTodaySelected ? "bg-indigo-600 text-white shadow-2xs" : "text-zinc-700 hover:bg-zinc-200"
                )}
                title="Ir para o dia de hoje"
              >
                Hoje
              </button>

              <div className="relative flex items-center">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setShowAllDates(false);
                    }
                  }}
                  className="text-xs font-mono font-bold bg-white border border-zinc-200 rounded px-2 py-0.5 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={handleNextDay}
                className="p-1 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded cursor-pointer transition-colors"
                title="Próximo dia"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="p-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-650 hover:text-zinc-900 rounded-lg transition-colors cursor-pointer"
                title="Atualizar dados"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </button>
            )}
          </div>
        </div>

        {/* Linha Inferior: Indicadores Operacionais e Ações Contextuais */}
        {(operationalMetrics || actionButtons) && (
          <div className="pt-2.5 border-t border-zinc-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {operationalMetrics}
            </div>
            {actionButtons && (
              <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                {actionButtons}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const handlePrevDayEnvase = () => {
    const [y, m, d] = envaseSelectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d - 1);
    setEnvaseSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
    setEnvaseShowAllDates(false);
  };

  const handleNextDayEnvase = () => {
    const [y, m, d] = envaseSelectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d + 1);
    setEnvaseSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
    setEnvaseShowAllDates(false);
  };

  const handleTodayEnvase = () => {
    const d = new Date();
    setEnvaseSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    setEnvaseShowAllDates(false);
  };

  const baseProgramacaoEnvase = useMemo(() => {
    // REGRA GERAL: Ordem concluída ou removida do envase não aparece em nenhum outro quadro operacional (inclusive linhas de envase)
    const activeProgramacao = programacaoEnvase.filter(it => {
      const realLote = getRealLote(it.loteNumber, it.productCode);
      if (realLote && (isLoteConcluido(realLote) || isLoteOcultoNoQuadro(realLote, 'envase'))) return false;
      return true;
    });

    const dateFiltered = (envaseShowAllDates || envaseSearch.trim().length > 0)
      ? activeProgramacao
      : activeProgramacao.filter(it => {
          if (it.statusEnvase === 'EM_ESPERA') return true;
          const itDate = it.dataProgramada ? parseLoteDateToIso(it.dataProgramada) : (it.createdAt ? parseLoteDateToIso(it.createdAt) : null);
          return itDate === envaseSelectedDate;
        });

    // Deduplicação defensiva: garante que o mesmo lote + SKU na mesma linha e data nunca duplique
    const seen = new Set<string>();
    const deduplicated: ProgramacaoEnvaseItem[] = [];
    for (const it of dateFiltered) {
      const itDate = it.dataProgramada ? parseLoteDateToIso(it.dataProgramada) : (it.createdAt ? parseLoteDateToIso(it.createdAt) : '');
      const key = `${itDate}__${it.linha}__${(it.loteNumber || '').trim().toLowerCase()}__${(it.productCode || '').trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduplicated.push(it);
    }
    return deduplicated;
  }, [programacaoEnvase, envaseShowAllDates, envaseSelectedDate, envaseSearch, lotesByNumber, lotesByNumberAndProduct, getLoteAdiadoInfo]);

  const envaseLinha1Items = useMemo(() => {
    const list = baseProgramacaoEnvase.filter(it => it.linha === 'Linha 1');
    return list.sort((a, b) => a.ordem - b.ordem);
  }, [baseProgramacaoEnvase]);

  const envaseLinha2Items = useMemo(() => {
    const list = baseProgramacaoEnvase.filter(it => it.linha === 'Linha 2');
    return list.sort((a, b) => a.ordem - b.ordem);
  }, [baseProgramacaoEnvase]);

  const envaseLinha3Items = useMemo(() => {
    const list = baseProgramacaoEnvase.filter(it => it.linha === 'Linha 3' || it.linha === 'Linha 3 (Óleos)');
    return list.sort((a, b) => a.ordem - b.ordem);
  }, [baseProgramacaoEnvase]);

  const envaseDayStats = useMemo(() => {
    const allLinha1 = baseProgramacaoEnvase.filter(it => it.linha === 'Linha 1');
    const allLinha2 = baseProgramacaoEnvase.filter(it => it.linha === 'Linha 2');
    const allLinha3 = baseProgramacaoEnvase.filter(it => it.linha === 'Linha 3' || it.linha === 'Linha 3 (Óleos)');
    const totalUn1 = allLinha1.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalKg1 = allLinha1.reduce((sum, it) => sum + (Number(it.quantityKg) || 0), 0);
    const totalUn2 = allLinha2.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalKg2 = allLinha2.reduce((sum, it) => sum + (Number(it.quantityKg) || 0), 0);
    const totalUn3 = allLinha3.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalKg3 = allLinha3.reduce((sum, it) => sum + (Number(it.quantityKg) || 0), 0);

    return {
      linha1Count: allLinha1.length,
      linha1Un: totalUn1,
      linha1Kg: totalKg1,
      linha2Count: allLinha2.length,
      linha2Un: totalUn2,
      linha2Kg: totalKg2,
      linha3Count: allLinha3.length,
      linha3Un: totalUn3,
      linha3Kg: totalKg3,
      totalCount: baseProgramacaoEnvase.length,
      totalUn: totalUn1 + totalUn2 + totalUn3,
      totalKg: totalKg1 + totalKg2 + totalKg3,
    };
  }, [baseProgramacaoEnvase]);

  // Pool unificado de lotes liberados da produção aptos para Envase e Rotulagem (142 ordens)
  const lotesLiberadosParaAcabamento = useMemo(() => {
    const raw = lotes.filter(l => {
      if (isLoteTerceirizado(l)) {
        const effStatus = getEffectiveStatus(l);
        const isAptoTerc = effStatus === 'Liberado para Envase' || effStatus === 'Produzido' || effStatus === 'Envase' || effStatus === 'Rotulagem' ||
          l.customStatus === 'Liberado para Envase' || l.customStatus === 'Produzido' || l.customStatus === 'Envase' || l.customStatus === 'Rotulagem' || isLoteParcial(l);
        if (!isAptoTerc) return false;
      }
      if (isLoteConcluido(l)) return false;

      const eff = getEffectiveStatus(l);
      const etapaProducao = getLoteEtapaStatus(l, 'producao');
      const etapaEnvase = getLoteEtapaStatus(l, 'envase');
      const etapaRotulagem = getLoteEtapaStatus(l, 'rotulagem');
      const temProblemaAcabamento = etapaEnvase.isEspera || etapaRotulagem.isEspera;

      const isLiberado = eff === 'Produzido' || eff === 'Liberado para Envase' || eff === 'Envase' || eff === 'Rotulagem' ||
        l.customStatus === 'Produzido' || l.customStatus === 'Liberado para Envase' || l.customStatus === 'Envase' || l.customStatus === 'Rotulagem' ||
        (!l.customStatus && (l.erpStatus === 'PR' || l.erpStatus === 'EN')) ||
        etapaProducao.isConcluido ||
        isLoteParcial(l);

      const isPendencia = temProblemaAcabamento && (
        isLiberado ||
        Boolean(l.dataLiberadoEnvase) ||
        Boolean(l.dataEnvase) ||
        Boolean(l.dataRotulagem) ||
        l.category === 'Embalagem'
      );

      if (!isLiberado && !isPendencia) return false;
      if (eff === 'Pesagem' || eff === 'Em Pesagem') return false;
      if (eff === 'Produção' && !isLoteParcial(l) && !l.dataLiberadoEnvase && !etapaProducao.isConcluido) return false;

      return true;
    });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado]);

  // Total de ordens abertas da fábrica no Hub (162 ordens)
  const todasOrdensAbertasFabrica = useMemo(() => {
    const raw = lotes.filter(l => {
      if (isLoteTerceirizado(l)) {
        const effStatus = getEffectiveStatus(l);
        const isAptoTerc = effStatus === 'Rotulagem' || effStatus === 'Liberado para Envase' || effStatus === 'Produzido' ||
          l.customStatus === 'Rotulagem' || l.customStatus === 'Liberado para Envase' || l.customStatus === 'Produzido' || isLoteParcial(l);
        if (!isAptoTerc) return false;
      }
      if (isLoteConcluido(l)) return false;
      if (isLoteParcial(l)) return true;
      const eff = getEffectiveStatus(l);
      const isAberta = l.erpStatus !== 'CA' && eff !== 'Finalizada' && eff !== 'Ordem Finalizada' && l.customStatus !== 'Finalizada' && l.customStatus !== 'Ordem Finalizada';
      return isAberta;
    });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado]);

  const baseLotesParaEncaixe = useMemo(() => {
    const isSearching = Boolean(encaixeSearch.trim());
    return lotes
      .filter(l => {
        // REGRA GERAL: Ordem concluída NUNCA aparece em filas ativas
        if (isLoteConcluido(l)) return false;

        // Se há pesquisa ativa no quadro de envase, exibir diretamente qualquer lote aberto
        if (isSearching) return true;

        if (isLoteOcultoNoQuadro(l, 'envase')) return false;

        // REGRA REQUISITADA: Se o lote JÁ ESTÁ programado no quadro de envase (Linha 1, 2 ou 3), NÃO exibir na coluna de Liberados para Envase
        const isAlreadyScheduled = programacaoEnvase.some(it => 
          (it.loteNumber || '').trim().toUpperCase() === (l.loteNumber || '').trim().toUpperCase() && 
          (!it.productCode || !l.productCode || (it.productCode || '').trim().toUpperCase() === (l.productCode || '').trim().toUpperCase())
        );
        if (isAlreadyScheduled) return false;

        const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
        // REGRA REQUISITADA: Lotes em espera NUNCA são filtrados por data! Continuam aparecendo todos os dias
        if (esperaDetails.isEmEspera) {
          if (encaixeOnlyProblemas && !hasLoteProblemaOuPausa(l, null, 'envase')) {
            return false;
          }
          return true;
        }

        if (encaixeOnlyProblemas && !hasLoteProblemaOuPausa(l, null, 'envase')) {
          return false;
        }

        // Se o usuário selecionou visualização explícita de "Todas as Ordens Abertas"
        if (envaseScopeFilter === 'TODOS') {
          if (encaixeStatusFilter === 'TODOS') return true;
          return getEffectiveStatus(l) === encaixeStatusFilter;
        }

        // REGRA REQUISITADA:
        // "liberados para envase, quando eu fizer a analise fisico-quimica, eles são liberados para envase automaticamente (unica regra automatica) aqui, (permitir adicionar lote manualmente ao liberado para envase, assim como remover, ok ?"
        const cleanNum = (l.loteNumber || '').trim().toLowerCase();
        const cleanNumNoZero = cleanNum.replace(/^0+/, '');
        const hasFqAnalysis = fiscoAnalysesByBatch.has(cleanNum) || (cleanNumNoZero ? fiscoAnalysesByBatch.has(cleanNumNoZero) : false) || Boolean(l.dataLiberadoEnvase);
        const isManual = manualLiberadosEnvase.has(cleanNum) || manualLiberadosEnvase.has(l.loteNumber) || l.customStatus === 'Liberado para Envase';

        if (hasFqAnalysis || isManual) {
          if (encaixeStatusFilter === 'TODOS') return true;
          return getEffectiveStatus(l) === encaixeStatusFilter;
        }

        return false;
      })
      .map(l => ({
        ...l,
        isAlreadyScheduled: false,
        scheduledItem: undefined
      }));
  }, [lotes, encaixeSearch, programacaoEnvase, programacaoRotulagem, encaixeOnlyProblemas, envaseScopeFilter, encaixeStatusFilter, fiscoAnalysesByBatch, manualLiberadosEnvase]);

  const lotesParaEncaixe = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(baseLotesParaEncaixe, encaixeSearch));
  }, [baseLotesParaEncaixe, encaixeSearch]);

  const filteredEnvaseLinha1Items = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(envaseLinha1Items, encaixeSearch));
  }, [envaseLinha1Items, encaixeSearch]);

  const filteredEnvaseLinha2Items = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(envaseLinha2Items, encaixeSearch));
  }, [envaseLinha2Items, encaixeSearch]);

  const filteredEnvaseLinha3Items = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(envaseLinha3Items, encaixeSearch));
  }, [envaseLinha3Items, encaixeSearch]);

  // =========================================================================
  // PROCESSAMENTO DO RELATÓRIO DE ENVASE (FILTRAGEM, TOTAIS E EXPORTAÇÃO)
  // =========================================================================
  const relatorioEnvaseItems = useMemo(() => {
    const list: Array<{
      id: string | number;
      loteNumber: string;
      productCode: string;
      productDescription: string;
      dataProgramada: string;
      dataProgramadaFmt: string;
      diaSemana: string;
      linha: string;
      ordem: number;
      quantity: number;
      quantityKg: number;
      categoriaEnvase: string;
      cor: string;
      statusEnvase: string;
      observacoes: string;
      origem: 'programado' | 'liberado';
    }> = [];

    const minDate = relatorioDataInicio <= relatorioDataFim ? relatorioDataInicio : relatorioDataFim;
    const maxDate = relatorioDataInicio <= relatorioDataFim ? relatorioDataFim : relatorioDataInicio;
    const query = relatorioSearch.trim().toLowerCase();

    const seenProgKeys = new Set<string>();
    for (const it of programacaoEnvase) {
      const realLote = getRealLote(it.loteNumber, it.productCode);
      if (realLote && (isLoteConcluido(realLote) || isLoteOcultoNoQuadro(realLote, 'envase'))) {
        if (relatorioStatusFilter !== 'CONCLUIDO') {
          continue;
        }
      }

      const itDate = it.dataProgramada
        ? parseLoteDateToIso(it.dataProgramada)
        : (it.createdAt ? parseLoteDateToIso(it.createdAt) : null);
      if (!itDate) continue;

      if (itDate < minDate || itDate > maxDate) continue;

      if (relatorioLinhaFilter !== 'TODAS') {
        if (relatorioLinhaFilter === 'Linha 3') {
          if (!it.linha.includes('Linha 3')) continue;
        } else if (it.linha !== relatorioLinhaFilter) {
          continue;
        }
      }

      if (relatorioStatusFilter !== 'TODOS') {
        if (it.statusEnvase !== relatorioStatusFilter) continue;
      }

      if (query) {
        const m1 = (it.loteNumber || '').toLowerCase().includes(query);
        const m2 = (it.productCode || '').toLowerCase().includes(query);
        const m3 = (it.productDescription || '').toLowerCase().includes(query);
        const m4 = (it.linha || '').toLowerCase().includes(query);
        const m5 = (it.categoriaEnvase || '').toLowerCase().includes(query);
        if (!m1 && !m2 && !m3 && !m4 && !m5) continue;
      }

      // Deduplicação estrita: o mesmo lote + SKU agendado só aparece uma vez no relatório (evita duplicar linhas e somar quantidades)
      const progKey = `${itDate}__${it.linha}__${(it.loteNumber || '').trim().toLowerCase()}__${(it.productCode || '').trim().toLowerCase()}`;
      if (seenProgKeys.has(progKey)) {
        continue;
      }
      seenProgKeys.add(progKey);

      list.push({
        id: it.id || `prog_${it.loteNumber}_${it.linha}_${it.ordem}`,
        loteNumber: it.loteNumber,
        productCode: it.productCode,
        productDescription: it.productDescription,
        dataProgramada: itDate,
        dataProgramadaFmt: formatDateOnly(itDate),
        diaSemana: formatShortWeekday(itDate),
        linha: it.linha || 'Linha 1',
        ordem: it.ordem || 1,
        quantity: Number(it.quantity) || 0,
        quantityKg: Number(it.quantityKg) || 0,
        categoriaEnvase: it.categoriaEnvase || 'Outros',
        cor: it.cor || (it.isColorido ? 'Colorido' : 'Branco'),
        statusEnvase: it.statusEnvase || 'PROGRAMADO',
        observacoes: it.observacoes || '',
        origem: 'programado',
      });
    }

    if (relatorioIncluirLiberados) {
      const scheduledLotes = new Set(list.map(i => `${i.loteNumber.trim().toUpperCase()}__${(i.productCode || '').trim().toUpperCase()}`));
      const seenLiberados = new Set<string>();
      for (const l of baseLotesParaEncaixe) {
        const lNum = (l.loteNumber || '').trim().toUpperCase();
        const lCode = (l.productCode || '').trim().toUpperCase();
        const lKey = `${lNum}__${lCode}`;
        if (scheduledLotes.has(lKey) || seenLiberados.has(lKey)) continue;
        seenLiberados.add(lKey);

        const sched = getLoteScheduleDateIso(l, 'envase') || parseLoteDateToIso(l.dataPrevisao || '') || parseLoteDateToIso(l.date || '');
        if (!sched) continue;
        if (sched < minDate || sched > maxDate) continue;

        if (query) {
          const m1 = (l.loteNumber || '').toLowerCase().includes(query);
          const m2 = (l.productCode || '').toLowerCase().includes(query);
          const m3 = (l.productDescription || '').toLowerCase().includes(query);
          if (!m1 && !m2 && !m3) continue;
        }

        const cat = inferCategoriaEnvase(l.productDescription);
        const corInfo = inferCorProduto(l.productDescription);

        list.push({
          id: `lib_${l.loteNumber}`,
          loteNumber: l.loteNumber,
          productCode: l.productCode,
          productDescription: l.productDescription,
          dataProgramada: sched,
          dataProgramadaFmt: formatDateOnly(sched),
          diaSemana: formatShortWeekday(sched),
          linha: 'Liberado p/ Envase',
          ordem: 999,
          quantity: Number(l.quantity) || 0,
          quantityKg: Number(l.quantityKg) || 0,
          categoriaEnvase: cat,
          cor: corInfo.cor || (corInfo.isColorido ? 'Colorido' : 'Branco'),
          statusEnvase: 'LIBERADO',
          observacoes: l.notes || l.motivoEspera || '',
          origem: 'liberado',
        });
      }
    }

    return list.sort((a, b) => {
      if (a.dataProgramada !== b.dataProgramada) return a.dataProgramada.localeCompare(b.dataProgramada);
      if (a.linha !== b.linha) return a.linha.localeCompare(b.linha);
      return a.ordem - b.ordem;
    });
  }, [programacaoEnvase, baseLotesParaEncaixe, relatorioDataInicio, relatorioDataFim, relatorioLinhaFilter, relatorioStatusFilter, relatorioSearch, relatorioIncluirLiberados, lotesByNumber, lotesByNumberAndProduct]);

  const relatorioTotals = useMemo(() => {
    const totalCount = relatorioEnvaseItems.length;
    const totalUn = relatorioEnvaseItems.reduce((acc, it) => acc + it.quantity, 0);
    const totalKg = relatorioEnvaseItems.reduce((acc, it) => acc + it.quantityKg, 0);

    const linha1 = relatorioEnvaseItems.filter(it => it.linha === 'Linha 1');
    const linha2 = relatorioEnvaseItems.filter(it => it.linha === 'Linha 2');
    const linha3 = relatorioEnvaseItems.filter(it => it.linha.includes('Linha 3'));
    const liberados = relatorioEnvaseItems.filter(it => it.origem === 'liberado');

    return {
      totalCount,
      totalUn,
      totalKg,
      linha1Count: linha1.length,
      linha1Un: linha1.reduce((acc, it) => acc + it.quantity, 0),
      linha1Kg: linha1.reduce((acc, it) => acc + it.quantityKg, 0),
      linha2Count: linha2.length,
      linha2Un: linha2.reduce((acc, it) => acc + it.quantity, 0),
      linha2Kg: linha2.reduce((acc, it) => acc + it.quantityKg, 0),
      linha3Count: linha3.length,
      linha3Un: linha3.reduce((acc, it) => acc + it.quantity, 0),
      linha3Kg: linha3.reduce((acc, it) => acc + it.quantityKg, 0),
      liberadosCount: liberados.length,
      liberadosUn: liberados.reduce((acc, it) => acc + it.quantity, 0),
      liberadosKg: liberados.reduce((acc, it) => acc + it.quantityKg, 0),
    };
  }, [relatorioEnvaseItems]);

  const relatorioConsolidadoPorProduto = useMemo(() => {
    const map = new Map<string, {
      productCode: string;
      productDescription: string;
      categoriaEnvase: string;
      totalUn: number;
      totalKg: number;
      lotes: string[];
      linhas: Set<string>;
    }>();

    for (const it of relatorioEnvaseItems) {
      const key = `${(it.productCode || '').trim().toUpperCase()}__${(it.productDescription || '').trim().toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalUn += it.quantity;
        existing.totalKg += it.quantityKg;
        if (it.loteNumber && !existing.lotes.includes(it.loteNumber)) existing.lotes.push(it.loteNumber);
        if (it.linha) existing.linhas.add(it.linha);
      } else {
        map.set(key, {
          productCode: it.productCode || '',
          productDescription: it.productDescription || '',
          categoriaEnvase: it.categoriaEnvase || '',
          totalUn: it.quantity,
          totalKg: it.quantityKg,
          lotes: it.loteNumber ? [it.loteNumber] : [],
          linhas: new Set(it.linha ? [it.linha] : []),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalUn - a.totalUn);
  }, [relatorioEnvaseItems]);

  // Agrupamento por Linha (como no quadro - Linha 1, Linha 2 e Linha 3)
  const relatorioLinhasGroups = useMemo(() => {
    const l1 = relatorioEnvaseItems.filter(it => it.linha === 'Linha 1');
    const l2 = relatorioEnvaseItems.filter(it => it.linha === 'Linha 2');
    const l3 = relatorioEnvaseItems.filter(it => it.linha.includes('Linha 3'));
    const lib = relatorioEnvaseItems.filter(it => it.origem === 'liberado');

    const sortFn = (a: typeof relatorioEnvaseItems[0], b: typeof relatorioEnvaseItems[0]) => {
      if (a.dataProgramada !== b.dataProgramada) return a.dataProgramada.localeCompare(b.dataProgramada);
      return (a.ordem || 0) - (b.ordem || 0);
    };

    const groups: Array<{
      id: string;
      title: string;
      shortTitle: string;
      color: string;
      items: typeof relatorioEnvaseItems;
      totalUn: number;
      totalKg: number;
    }> = [];

    if (relatorioLinhaFilter === 'TODAS' || relatorioLinhaFilter === 'Linha 1') {
      groups.push({
        id: 'linha_1',
        title: 'Linha 1 de Envase',
        shortTitle: 'Linha 1',
        color: '#2563eb',
        items: [...l1].sort(sortFn),
        totalUn: l1.reduce((acc, it) => acc + it.quantity, 0),
        totalKg: l1.reduce((acc, it) => acc + it.quantityKg, 0),
      });
    }

    if (relatorioLinhaFilter === 'TODAS' || relatorioLinhaFilter === 'Linha 2') {
      groups.push({
        id: 'linha_2',
        title: 'Linha 2 de Envase',
        shortTitle: 'Linha 2',
        color: '#4f46e5',
        items: [...l2].sort(sortFn),
        totalUn: l2.reduce((acc, it) => acc + it.quantity, 0),
        totalKg: l2.reduce((acc, it) => acc + it.quantityKg, 0),
      });
    }

    if (relatorioLinhaFilter === 'TODAS' || relatorioLinhaFilter === 'Linha 3') {
      groups.push({
        id: 'linha_3',
        title: 'Linha 3 (Óleos)',
        shortTitle: 'Linha 3',
        color: '#d97706',
        items: [...l3].sort(sortFn),
        totalUn: l3.reduce((acc, it) => acc + it.quantity, 0),
        totalKg: l3.reduce((acc, it) => acc + it.quantityKg, 0),
      });
    }

    return {
      groups,
      liberados: {
        id: 'liberados',
        title: 'Lotes Liberados Aguardando Linha',
        shortTitle: 'Liberados',
        color: '#0891b2',
        items: [...lib].sort((a, b) => a.dataProgramada.localeCompare(b.dataProgramada)),
        totalUn: lib.reduce((acc, it) => acc + it.quantity, 0),
        totalKg: lib.reduce((acc, it) => acc + it.quantityKg, 0),
      }
    };
  }, [relatorioEnvaseItems, relatorioLinhaFilter]);

  const handleExportRelatorioEnvaseExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const detailedAoa = [
        [
          "Data Programada", "Dia da Semana", "Linha", "Ordem", "Lote",
          "Código SKU", "Descrição do Produto", "Qtd (Unidades)", "Peso Total (Kg)",
          "Categoria", "Cor", "Status Envase", "Observações"
        ],
        ...relatorioEnvaseItems.map(it => [
          it.dataProgramadaFmt,
          it.diaSemana,
          it.linha,
          it.ordem,
          it.loteNumber,
          it.productCode,
          it.productDescription,
          it.quantity,
          it.quantityKg,
          it.categoriaEnvase,
          it.cor,
          it.statusEnvase,
          it.observacoes
        ]),
        [],
        [
          "TOTAL:", "", "", "", `${relatorioTotals.totalCount} lotes`,
          "", "", relatorioTotals.totalUn, relatorioTotals.totalKg, "", "", "", ""
        ]
      ];
      const wsDetails = XLSX.utils.aoa_to_sheet(detailedAoa);
      XLSX.utils.book_append_sheet(wb, wsDetails, "Programacao_Envase");

      const consolidadoAoa = [
        ["Código SKU", "Descrição do Produto", "Categoria", "Total Unidades", "Peso Total (Kg)", "Lotes Associados", "Linhas"],
        ...relatorioConsolidadoPorProduto.map(c => [
          c.productCode,
          c.productDescription,
          c.categoriaEnvase,
          c.totalUn,
          c.totalKg,
          c.lotes.map(l => `#${l}`).join(', '),
          Array.from(c.linhas).join(', ')
        ]),
        [],
        [
          "TOTAL CONSOLIDADO:", "", "", relatorioTotals.totalUn, relatorioTotals.totalKg, "", ""
        ]
      ];
      const wsConsolidado = XLSX.utils.aoa_to_sheet(consolidadoAoa);
      XLSX.utils.book_append_sheet(wb, wsConsolidado, "Consolidado_Produtos");

      const filename = `Relatorio_Envase_${relatorioDataInicio}_a_${relatorioDataFim}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast("Planilha do Relatório de Envase exportada com sucesso!");
    } catch (e: any) {
      console.error("Erro ao exportar relatório em Excel:", e);
      showToast("Falha ao exportar relatório em Excel: " + (e?.message || e), "error");
    }
  };

  const handlePrintRelatorioEnvase = () => {
    window.print();
  };

  // Lotes pesando ativamente na cabine / balança (Quadro da Esquerda - Sem filtro de pesquisa geral, apenas ativos)
  // Lotes pesando ativamente na cabine / balança (Quadro da Esquerda - Sem filtro de pesquisa geral, apenas ativos)
  const lotesPesando = useMemo(() => {
    const raw = lotes
      .filter(l => !isLoteTerceirizado(l) || getLoteEtapaStatus(l, 'pesagem').status === 'ativo' || (pesagemSearch.trim() && l.loteNumber.includes(pesagemSearch.trim())))
      .filter(l => {
        // REGRA GERAL: Ordem concluída ou removida da pesagem não aparece
        if (isLoteConcluido(l) || isLoteOcultoNoQuadro(l, 'pesagem')) return false;

        const etapaStatus = getLoteEtapaStatus(l, 'pesagem');
        // Não inclui lotes em espera na pesagem (isolado)
        if (etapaStatus.isEspera) return false;

        // Lotes ativamente na balança ou concluídos nesta data
        const isPesando = (
          etapaStatus.status === 'ativo' ||
          etapaStatus.isConcluido ||
          l.customStatus === 'Pesagem' ||
          pesagemOrderOverrides.includes(l.loteNumber) ||
          pesagemConcluidosLotes.includes(l.loteNumber)
        ) && etapaStatus.status !== 'fila' && etapaStatus.status !== 'pendente' && l.customStatus !== 'Fila Pesagem';
        if (!isPesando) return false;
        if (selectedInsumoFaltanteFilter !== 'TODOS') {
          if ((l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) !== selectedInsumoFaltanteFilter) return false;
        }
        if (!pesagemShowAllDates && !pesagemSearch.trim()) {
          const scheduleDate = getLoteScheduleDateIso(l, 'pesagem');
          if (scheduleDate !== pesagemSelectedDate) return false;
        }
        return true;
      });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado, selectedInsumoFaltanteFilter, pesagemOrderOverrides, pesagemConcluidosLotes, pesagemShowAllDates, pesagemSelectedDate, pesagemSearch]);

  // Lotes ordenados sequencialmente para o Quadro de Pesagem Ativa
  const sortedLotesPesando = useMemo(() => {
    const list = [...lotesPesando];
    if (pesagemOrderOverrides.length === 0) return list;
    return list.sort((a, b) => {
      const idxA = pesagemOrderOverrides.indexOf(a.loteNumber);
      const idxB = pesagemOrderOverrides.indexOf(b.loteNumber);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }, [lotesPesando, pesagemOrderOverrides]);

  // Lotes em Espera na Pesagem (Auxiliar para contagem)
  const lotesEsperaPesagem = useMemo(() => {
    const raw = lotes
      .filter(l => !isLoteTerceirizado(l))
      .filter(l => {
        // REGRA GERAL: Ordem concluída não aparece em nenhum outro quadro
        if (isLoteConcluido(l)) return false;

        const etapaStatus = getLoteEtapaStatus(l, 'pesagem');
        if (!etapaStatus.isEspera) return false;
        if (!pesagemShowAllDates && !pesagemSearch.trim()) {
          const scheduleDate = getLoteScheduleDateIso(l, 'pesagem');
          if (scheduleDate !== pesagemSelectedDate) return false;
        }
        return true;
      });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado, pesagemShowAllDates, pesagemSelectedDate, pesagemSearch, getLoteAdiadoInfo]);

  const handleReorderPesagem = (loteNumber: string, direction: 'up' | 'down') => {
    const currentList = sortedLotesPesando.map(l => l.loteNumber);
    const idx = currentList.indexOf(loteNumber);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;
    const updated = [...currentList];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setPesagemOrderOverrides(updated);
    try {
      localStorage.setItem('natum_pesagem_order_overrides', JSON.stringify(updated));
    } catch {}
  };

  // Lotes aguardando início de pesagem + lotes em espera (Fila Unificada de Pesagem)
  // Lotes em espera / ordens paradas (Fila de Pesagem limpa)
  const baseLotesFilaPesagem = useMemo(() => {
    const raw = lotes
      .filter(l => {
        // REGRA GERAL: Ordem concluída NUNCA aparece em filas ativas
        if (isLoteConcluido(l)) return false;

        // Se há pesquisa ativa no quadro de pesagem, qualquer lote aberto (não concluído) pode aparecer no resultado
        if (pesagemSearch.trim()) return true;

        if (isLoteTerceirizado(l)) return false;
        if (isLoteOcultoNoQuadro(l, 'pesagem')) return false;

        // REGRA REQUISITADA: Se o lote já estiver no quadro de Pesagem Ativa (na balança), NÃO pode estar na fila
        const isNaBalanca = sortedLotesPesando.some(p => p.loteNumber === l.loteNumber);
        if (isNaBalanca) return false;

        // REGRA REQUISITADA: Fila de pesagem deve ser limpa, deixando apenas as ordens paradas (em espera)
        const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
        const etapaStatus = getLoteEtapaStatus(l, 'pesagem');
        const isOrdemParada = esperaDetails.isEmEspera || etapaStatus.isEspera || l.customStatus === 'Em Espera' || l.customStatus === 'Fila Pesagem' || !!l.motivoEspera;

        // Se foi adicionado manualmente à fila pelo operador
        const isManual = (manualFilasAdicionados.pesagem || []).includes(l.loteNumber);

        if (!isOrdemParada && !isManual) {
          return false;
        }

        if (selectedInsumoFaltanteFilter !== 'TODOS') {
          if ((l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) !== selectedInsumoFaltanteFilter) return false;
        }
        return true;
      });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado, selectedInsumoFaltanteFilter, sortedLotesPesando, pesagemSearch, manualFilasAdicionados, programacaoEnvase, programacaoRotulagem]);

  const lotesFilaPesagem = useMemo(() => {
    let list = filterLotesBySearch(baseLotesFilaPesagem, pesagemSearch);
    if (!pesagemSearch.trim() && pesagemFilaFilter === 'ESPERA') {
      list = list.filter(l => getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem).isEmEspera);
    }
    return deduplicateLotesByNumber(list);
  }, [baseLotesFilaPesagem, pesagemSearch, pesagemFilaFilter, programacaoEnvase, programacaoRotulagem]);

  const lotesEsperaPesagemCount = useMemo(() => {
    return baseLotesFilaPesagem.filter(l => getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem).isEmEspera).length;
  }, [baseLotesFilaPesagem, programacaoEnvase, programacaoRotulagem]);

  const lotesPesagem = useMemo(() => {
    return deduplicateLotesByNumber([...sortedLotesPesando, ...baseLotesFilaPesagem]);
  }, [sortedLotesPesando, baseLotesFilaPesagem]);

  // Lotes para o Quadro de Produção (Manipulação em Reatores contínua ativa - NÃO filtra por producaoSearch)
  const lotesProducao = useMemo(() => {
    const raw = lotes
      .filter(l => !isLoteTerceirizado(l) || getLoteEtapaStatus(l, 'producao').status === 'ativo' || (producaoSearch.trim() && l.loteNumber.includes(producaoSearch.trim())))
      .filter(l => {
        // REGRA GERAL: Se a ordem estiver concluída ou removida da produção, NÃO aparece
        if (isLoteConcluido(l) || isLoteOcultoNoQuadro(l, 'producao')) return false;

        const etapaStatus = getLoteEtapaStatus(l, 'producao');
        // Não inclui se estiver em espera na produção
        if (etapaStatus.isEspera) return false;

        // Permite coexistência: se estiver em produção ou alocado nos reatores, ou concluído na data
        // ou aprovado / lote vinculado do planejamento semanal na data selecionada
        const isProd = (
          etapaStatus.status === 'ativo' ||
          etapaStatus.isConcluido ||
          producaoOrderOverrides.includes(l.loteNumber) ||
          producaoConcluidosLotes.includes(l.loteNumber) ||
          ((l.customStatus === 'Produção' || l.customStatus === 'Produzido' || l.customStatus === 'Pesagem' || (!l.customStatus && l.erpStatus === 'PR')) && etapaStatus.status !== 'fila')
        );
        if (!isProd) return false;
        if (selectedInsumoFaltanteFilter !== 'TODOS') {
          if ((l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) !== selectedInsumoFaltanteFilter) return false;
        }
        if (!producaoShowAllDates && !producaoSearch.trim()) {
          const scheduleDate = getLoteScheduleDateIso(l, 'producao');
          if (scheduleDate !== producaoSelectedDate) return false;
        }
        return true;
      });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado, selectedInsumoFaltanteFilter, producaoOrderOverrides, producaoConcluidosLotes, producaoShowAllDates, producaoSelectedDate, producaoSearch]);

  // Lotes ordenados sequencialmente para o Quadro de Produção
  const sortedLotesEmFabricacao = useMemo(() => {
    const list = [...lotesProducao];
    if (producaoOrderOverrides.length === 0) return list;
    return list.sort((a, b) => {
      const idxA = producaoOrderOverrides.indexOf(a.loteNumber);
      const idxB = producaoOrderOverrides.indexOf(b.loteNumber);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }, [lotesProducao, producaoOrderOverrides]);

  const handleReorderProducao = (loteNumber: string, direction: 'up' | 'down') => {
    const currentList = sortedLotesEmFabricacao.map(l => l.loteNumber);
    const idx = currentList.indexOf(loteNumber);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;
    const updated = [...currentList];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setProducaoOrderOverrides(updated);
    try {
      localStorage.setItem('natum_producao_order_overrides', JSON.stringify(updated));
    } catch {}
  };

  // Lotes aguardando produção + lotes em espera (Fila Unificada de Produção)
  const baseLotesFilaProducao = useMemo(() => {
    const raw = lotes
      .filter(l => {
        // REGRA GERAL: Se a ordem estiver concluída, NUNCA aparece em filas ativas
        if (isLoteConcluido(l)) return false;

        // Se há pesquisa ativa no quadro de produção, qualquer lote aberto (não concluído) pode aparecer no resultado
        if (producaoSearch.trim()) return true;

        if (isLoteTerceirizado(l)) return false;
        if (isLoteOcultoNoQuadro(l, 'producao')) return false;

        // REGRA REQUISITADA: Se o lote já estiver no quadro de Produção (reatores ou caldeira), NÃO pode estar na fila
        const isNaProducaoAtiva = lotesProducao.some(p => p.loteNumber === l.loteNumber);
        if (isNaProducaoAtiva) return false;

        const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
        // REGRA REQUISITADA: Lotes em espera NUNCA são filtrados por data! Continuam aparecendo todos os dias
        if (esperaDetails.isEmEspera) {
          if (selectedInsumoFaltanteFilter !== 'TODOS') {
            if ((l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) !== selectedInsumoFaltanteFilter) return false;
          }
          return true;
        }

        // REGRA GERAL: Se for ordem parcial, DEVE continuar aparecendo na produção!
        if (isLoteParcial(l)) {
          if (selectedInsumoFaltanteFilter !== 'TODOS') {
            if ((l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) !== selectedInsumoFaltanteFilter) return false;
          }
          return true;
        }

        // Se foi adicionado manualmente à fila de produção
        const isManual = (manualFilasAdicionados.producao || []).includes(l.loteNumber);
        if (isManual) return true;

        // REGRA REQUISITADA: Pegar lotes abertos da semana, lotes antigos ignorar
        if (!isLoteDaSemana(l, 'producao', producaoSelectedDate)) {
          return false;
        }

        const eff = getEffectiveStatus(l);
        const isFila = (
          !isNaProducaoAtiva || esperaDetails.isEmEspera
        ) &&
          eff !== 'Liberado para Envase' &&
          eff !== 'Envase' &&
          eff !== 'Ordem Finalizada' &&
          eff !== 'Finalizada' &&
          l.customStatus !== 'Liberado para Envase' &&
          l.customStatus !== 'Envase';

        if (!isFila) return false;
        if (selectedInsumoFaltanteFilter !== 'TODOS') {
          if ((l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) !== selectedInsumoFaltanteFilter) return false;
        }
        return true;
      });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado, selectedInsumoFaltanteFilter, lotesProducao, producaoSelectedDate, producaoSearch, manualFilasAdicionados, programacaoEnvase, programacaoRotulagem]);

  const lotesFilaProducao = useMemo(() => {
    let list = filterLotesBySearch(baseLotesFilaProducao, producaoSearch);
    if (!producaoSearch.trim() && producaoFilaFilter === 'ESPERA') {
      list = list.filter(l => getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem).isEmEspera);
    }
    return deduplicateLotesByNumber(list);
  }, [baseLotesFilaProducao, producaoSearch, producaoFilaFilter, programacaoEnvase, programacaoRotulagem]);

  const lotesEsperaProducaoCount = useMemo(() => {
    return baseLotesFilaProducao.filter(l => getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem).isEmEspera).length;
  }, [baseLotesFilaProducao, programacaoEnvase, programacaoRotulagem]);

  // Separação do Quadro de Produção: Reatores em Fabricação vs Quadro de Caldeira
  const lotesCaldeira = useMemo(() => {
    return sortedLotesEmFabricacao.filter(l => lotesComCaldeira.has(l.loteNumber) || l.category === 'Caldeira' || (caldeiraAtiva && caldeiraAtiva.lotes.includes(l.loteNumber)));
  }, [sortedLotesEmFabricacao, lotesComCaldeira, caldeiraAtiva]);

  const lotesReatoresNormais = useMemo(() => {
    return sortedLotesEmFabricacao.filter(l => !lotesComCaldeira.has(l.loteNumber) && l.category !== 'Caldeira' && !(caldeiraAtiva && caldeiraAtiva.lotes.includes(l.loteNumber)));
  }, [sortedLotesEmFabricacao, lotesComCaldeira, caldeiraAtiva]);

  // Identificação de lotes que contêm múltiplos produtos (OP conjunta)
  const multiProductLoteNumbers = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    for (const l of lotes) {
      if (!l.loteNumber) continue;
      const set = counts.get(l.loteNumber) || new Set<string>();
      if (l.productCode) set.add(l.productCode.trim());
      counts.set(l.loteNumber, set);
    }
    const result = new Set<string>();
    for (const [num, set] of counts.entries()) {
      if (set.size > 1) {
        result.add(num);
      }
    }
    return result;
  }, [lotes]);

  // Filtragens por busca para manter todos os quadros e colunas reativos e sincronizados
  const filteredLotesPesando = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(sortedLotesPesando, pesagemSearch));
  }, [sortedLotesPesando, pesagemSearch]);

  const filteredLotesEsperaPesagem = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(lotesEsperaPesagem, pesagemSearch));
  }, [lotesEsperaPesagem, pesagemSearch]);

  const filteredLotesReatoresNormais = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(lotesReatoresNormais, producaoSearch));
  }, [lotesReatoresNormais, producaoSearch]);

  const filteredLotesCaldeira = useMemo(() => {
    const q = producaoSearch.trim() || caldeiraSearch.trim();
    return deduplicateLotesByNumber(filterLotesBySearch(lotesCaldeira, q));
  }, [lotesCaldeira, producaoSearch, caldeiraSearch]);

  // Quadros ativos de esteiras de rotulagem
  const rotulagemMaquinaItems = useMemo(() => {
    const base = programacaoRotulagem
      .filter(it => it.tipo === 'MAQUINA')
      .filter(it => {
        const realLote = getRealLote(it.loteNumber, it.productCode);
        // REGRA GERAL: Ordem concluída ou removida da rotulagem não aparece
        if (realLote && (isLoteConcluido(realLote) || isLoteOcultoNoQuadro(realLote, 'rotulagem'))) return false;
        if (it.statusRotulagem === 'EM_ESPERA') return true;
        if (rotulagemShowAllDates || rotulagemSearch.trim().length > 0) return true;
        const itemDate = it.dataProgramada ? parseLoteDateToIso(it.dataProgramada) : (realLote ? getLoteScheduleDateIso(realLote, 'rotulagem') : null);
        return itemDate === rotulagemSelectedDate;
      })
      .filter(it => rotulagemStatusFilter === 'TODOS' || it.statusRotulagem === rotulagemStatusFilter);
    return deduplicateLotesByNumber(base.sort((a, b) => a.ordem - b.ordem));
  }, [programacaoRotulagem, rotulagemStatusFilter, rotulagemShowAllDates, rotulagemSelectedDate, rotulagemSearch, lotesByNumber, lotesByNumberAndProduct]);

  const rotulagemManualItems = useMemo(() => {
    const base = programacaoRotulagem
      .filter(it => it.tipo === 'MANUAL')
      .filter(it => {
        const realLote = getRealLote(it.loteNumber, it.productCode);
        // REGRA GERAL: Ordem concluída ou removida da rotulagem não aparece
        if (realLote && (isLoteConcluido(realLote) || isLoteOcultoNoQuadro(realLote, 'rotulagem'))) return false;
        if (it.statusRotulagem === 'EM_ESPERA') return true;
        if (rotulagemShowAllDates || rotulagemSearch.trim().length > 0) return true;
        const itemDate = it.dataProgramada ? parseLoteDateToIso(it.dataProgramada) : (realLote ? getLoteScheduleDateIso(realLote, 'rotulagem') : null);
        return itemDate === rotulagemSelectedDate;
      })
      .filter(it => rotulagemStatusFilter === 'TODOS' || it.statusRotulagem === rotulagemStatusFilter);
    return deduplicateLotesByNumber(base.sort((a, b) => a.ordem - b.ordem));
  }, [programacaoRotulagem, rotulagemStatusFilter, rotulagemShowAllDates, rotulagemSelectedDate, rotulagemSearch, lotesByNumber, lotesByNumberAndProduct]);

  const filteredRotulagemMaquinaItems = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(rotulagemMaquinaItems, rotulagemSearch));
  }, [rotulagemMaquinaItems, rotulagemSearch]);

  const filteredRotulagemManualItems = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(rotulagemManualItems, rotulagemSearch));
  }, [rotulagemManualItems, rotulagemSearch]);

  // Fila lateral de escolha para rotulagem: Lotes Disponíveis para Rotulagem
  const baseLotesParaRotulagem = useMemo(() => {
    const isSearching = Boolean(rotulagemSearch.trim());
    return lotes.filter(l => {
      // REGRA GERAL: Ordem concluída NUNCA aparece em filas ativas
      if (isLoteConcluido(l)) return false;

      // Se há pesquisa ativa no quadro de rotulagem, exibir diretamente qualquer lote aberto
      if (isSearching) return true;

      if (isLoteOcultoNoQuadro(l, 'rotulagem')) return false;

      // REGRA REQUISITADA: Se o lote já estiver no quadro de rotulagem (Máquina ou Manual), NÃO pode estar na fila
      const isAlreadyInRotulagemBoard = programacaoRotulagem.some(it => (it.loteNumber || '').trim().toUpperCase() === (l.loteNumber || '').trim().toUpperCase());
      if (isAlreadyInRotulagemBoard) return false;

      const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
      // REGRA REQUISITADA: Lotes em espera NUNCA são filtrados por data!
      if (esperaDetails.isEmEspera) {
        if (rotulagemOnlyProblemas && !hasLoteProblemaOuPausa(l, null, 'rotulagem')) return false;
        return true;
      }

      if (rotulagemOnlyProblemas) return false;

      // Se foi adicionado manualmente à fila de rotulagem
      const isManual = (manualFilasAdicionados.rotulagem || []).includes(l.loteNumber);
      if (isManual) return true;

      // Se escopo foi selecionado manualmente como 'TODOS'
      if (rotulagemScopeFilter === 'TODOS') return true;

      // REGRA REQUISITADA: Pegar lotes abertos da semana, lotes antigos ignorar
      if (!isLoteDaSemana(l, 'rotulagem', rotulagemSelectedDate)) {
        return false;
      }

      return true;
    });
  }, [lotes, rotulagemSearch, programacaoRotulagem, rotulagemOnlyProblemas, manualFilasAdicionados, rotulagemScopeFilter, rotulagemSelectedDate, programacaoEnvase]);

  const lotesParaRotulagem = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(baseLotesParaRotulagem, rotulagemSearch));
  }, [baseLotesParaRotulagem, rotulagemSearch]);

  // Ordens Finalizadas pelo Chão de Fábrica e Sincronizadas no ERP
  const baseOrdensFinalizadas = useMemo(() => {
    const raw = lotes
      .filter(l => !isLoteTerceirizado(l))
      .filter(l => {
        // REGRA GERAL: Ordem Concluída pertence exclusivamente aqui
        if (!isLoteConcluido(l)) return false;
        if (!ordensShowAllDates && !ordensSearch.trim()) {
          const scheduleDate = getLoteScheduleDateIso(l, 'ordens');
          if (scheduleDate !== ordensSelectedDate) return false;
        }
        return true;
      });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado, ordensShowAllDates, ordensSelectedDate, ordensSearch]);

  const filteredOrdensFinalizadas = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(baseOrdensFinalizadas, ordensSearch));
  }, [baseOrdensFinalizadas, ordensSearch]);

  const ordensFinalizadas = useMemo(() => {
    return ordensSearch.trim() ? filteredOrdensFinalizadas : baseOrdensFinalizadas;
  }, [ordensSearch, filteredOrdensFinalizadas, baseOrdensFinalizadas]);

  // Ordens com Produção / Envase Parcial
  const baseOrdensParciais = useMemo(() => {
    const raw = lotes
      .filter(l => !isLoteTerceirizado(l))
      .filter(l => {
        // REGRA GERAL: Se estiver concluída, sai de parciais e vai para finalizadas
        if (isLoteConcluido(l)) return false;
        if (!isLoteParcial(l)) return false;
        if (!ordensShowAllDates && !ordensSearch.trim()) {
          const scheduleDate = getLoteScheduleDateIso(l, 'ordens');
          if (scheduleDate !== ordensSelectedDate) return false;
        }
        return true;
      });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado, ordensShowAllDates, ordensSelectedDate, ordensSearch]);

  const filteredOrdensParciais = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(baseOrdensParciais, ordensSearch));
  }, [baseOrdensParciais, ordensSearch]);

  const ordensParciais = useMemo(() => {
    return ordensSearch.trim() ? filteredOrdensParciais : baseOrdensParciais;
  }, [ordensSearch, filteredOrdensParciais, baseOrdensParciais]);

  // Lotes em Andamento aptos para Fechamento (Fila lateral do Quadro de Ordens)
  const baseLotesParaOrdens = useMemo(() => {
    const raw = lotes
      .filter(l => !isLoteTerceirizado(l) || (ordensSearch.trim() && l.loteNumber.includes(ordensSearch.trim())))
      .filter(l => {
        // Não inclui se já estiver concluído nem se for parcial (pois parcial já tem sua própria coluna)
        if (isLoteConcluido(l)) return false;
        if (isLoteParcial(l)) return false;

        // Se há pesquisa ativa no quadro de ordens, qualquer lote aberto (não concluído e não parcial) pode aparecer
        if (ordensSearch.trim()) return true;

        const eff = getEffectiveStatus(l);
        return (
          eff === 'Envase' || eff === 'Rotulagem' || eff === 'Produzido' || eff === 'Liberado para Envase' || eff === 'Produção' || eff === 'Pesagem' ||
          l.customStatus === 'Envase' || l.customStatus === 'Rotulagem' || l.customStatus === 'Produzido' || l.customStatus === 'Liberado para Envase' || l.customStatus === 'Produção' || l.customStatus === 'Pesagem' ||
          l.erpStatus === 'PR' || l.erpStatus === 'PP' || l.erpStatus === 'EN' || l.erpStatus === 'PG'
        );
      });
    return deduplicateLotesByNumber(raw);
  }, [lotes, isLoteTerceirizado, ordensSearch]);

  const filteredLotesParaOrdens = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(baseLotesParaOrdens, ordensSearch));
  }, [baseLotesParaOrdens, ordensSearch]);

  const lotesParaOrdens = filteredLotesParaOrdens;



  const rotulagemDayStats = useMemo(() => {
    const totalMaqUn = rotulagemMaquinaItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const totalMaqKg = rotulagemMaquinaItems.reduce((s, it) => s + (Number(it.quantityKg) || 0), 0);
    const totalManUn = rotulagemManualItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const totalManKg = rotulagemManualItems.reduce((s, it) => s + (Number(it.quantityKg) || 0), 0);
    return {
      maquinaCount: rotulagemMaquinaItems.length,
      maquinaUn: totalMaqUn,
      maquinaKg: totalMaqKg,
      manualCount: rotulagemManualItems.length,
      manualUn: totalManUn,
      manualKg: totalManKg,
      totalCount: rotulagemMaquinaItems.length + rotulagemManualItems.length,
      totalUn: totalMaqUn + totalManUn,
      totalKg: totalMaqKg + totalManKg,
    };
  }, [rotulagemMaquinaItems, rotulagemManualItems]);

  const countEncaixeProblemas = useMemo(() => {
    return baseLotesParaEncaixe.filter(l => hasLoteProblemaOuPausa(l, null, 'envase')).length;
  }, [baseLotesParaEncaixe]);

  const countRotulagemProblemas = useMemo(() => {
    return baseLotesParaRotulagem.filter(l => hasLoteProblemaOuPausa(l, null, 'rotulagem')).length;
  }, [baseLotesParaRotulagem]);

  const handleEncaixarRotulagem = async (lote: AcompanhamentoLote, tipo: 'MAQUINA' | 'MANUAL') => {
    const existing = programacaoRotulagem.find(it => 
      it.loteNumber === lote.loteNumber && 
      it.tipo === tipo &&
      (!it.productCode || !lote.productCode || it.productCode === lote.productCode)
    );
    if (existing) {
      showToast(`Lote #${lote.loteNumber} (${lote.productCode || ''}) já está na fila de Rotulagem ${tipo === 'MAQUINA' ? 'Máquina' : 'Manual'}!`, 'error');
      return;
    }
    const currentList = programacaoRotulagem.filter(it => it.tipo === tipo);
    const nextOrdem = currentList.length > 0 ? Math.max(...currentList.map(it => it.ordem)) + 1 : 1;
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || (typeof currentUser === 'string' ? currentUser : 'Operador');
    const numQty = Number(lote.quantity);
    const numKg = Number(lote.quantityKg);
    const payload = {
      dataProgramada: rotulagemSelectedDate || new Date().toISOString().split('T')[0],
      tipo,
      ordem: nextOrdem,
      loteNumber: String(lote.loteNumber || '').trim(),
      productCode: String(lote.productCode || '').trim(),
      productDescription: String(lote.productDescription || '').trim(),
      quantity: (!isNaN(numQty) && numQty > 0) ? numQty : 0,
      quantityKg: (!isNaN(numKg) && numKg > 0) ? numKg : 0,
      statusRotulagem: 'PROGRAMADO',
      createdBy: responsibleName,
    };
    try {
      const savedItem = await apiJson<ProgramacaoRotulagemItem>('/api/administrativo/rotulagem/programacao', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setProgramacaoRotulagem(prev => [...prev.filter(it => it.id !== savedItem.id), savedItem]);
      const targetDate = payload.dataProgramada;
      setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { ...l, dataPrevisao: targetDate } : l));
      try {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
          method: 'POST',
          body: JSON.stringify({
            dataPrevisao: targetDate,
            updatedBy: responsibleName,
            fornecedorTerceirizado: lote.fornecedorTerceirizado || null
          })
        });
      } catch (err) {
        console.warn('Erro ao sincronizar dataPrevisao na rotulagem:', err);
      }
      saveEtapaStatus(lote.loteNumber, 'rotulagem', 'ativo', null, null, null, responsibleName);
      showToast(`Lote #${lote.loteNumber} (${lote.productCode || ''}) adicionado à Rotulagem ${tipo === 'MAQUINA' ? 'Máquina' : 'Manual'}!`);
      fetchProgramacaoRotulagem('TODOS');
    } catch (e: any) {
      console.error("Erro ao agendar rotulagem:", e);
      showToast("Erro ao agendar rotulagem: " + (e?.message || e), "error");
    }
  };

  const handleReorderRotulagem = async (id: number | string, tipo: 'MAQUINA' | 'MANUAL', direction: 'up' | 'down') => {
    const list = programacaoRotulagem.filter(it => it.tipo === tipo).sort((a, b) => a.ordem - b.ordem);
    const idx = list.findIndex(it => it.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const tempOrdem = list[idx].ordem;
    list[idx].ordem = list[targetIdx].ordem;
    list[targetIdx].ordem = tempOrdem;

    const others = programacaoRotulagem.filter(it => it.tipo !== tipo);
    setProgramacaoRotulagem([...others, ...list]);

    const reorderPayload = list.map(it => ({
      id: Number(it.id),
      tipo: it.tipo,
      ordem: it.ordem,
    }));

    try {
      await apiJson('/api/administrativo/rotulagem/programacao/reorder', {
        method: 'POST',
        body: JSON.stringify({ items: reorderPayload })
      });
    } catch (e: any) {
      console.error("Erro ao reordenar rotulagem:", e);
      showToast("Erro ao reordenar: " + (e?.message || e), "error");
      fetchProgramacaoRotulagem('TODOS');
    }
  };

  const handleRemoveRotulagem = async (id: number | string) => {
    const item = programacaoRotulagem.find(it => it.id === id);
    setProgramacaoRotulagem(prev => prev.filter(it => it.id !== id));
    try {
      if (typeof id === 'number' && id > 0) {
        await apiJson(`/api/administrativo/rotulagem/programacao/${id}`, {
          method: 'DELETE',
        });
      } else if (item?.loteNumber) {
        await apiJson(`/api/administrativo/rotulagem/programacao/lote/${encodeURIComponent(item.loteNumber)}`, {
          method: 'DELETE',
        });
      }
      if (item) {
        saveEtapaStatus(item.loteNumber, 'rotulagem', 'fila');
        showToast(`Lote #${item.loteNumber} removido da Rotulagem.`);
      }
      fetchProgramacaoRotulagem('TODOS');
    } catch (e: any) {
      console.error("Erro ao remover rotulagem:", e);
      showToast("Erro ao remover: " + (e?.message || e), "error");
      fetchProgramacaoRotulagem('TODOS');
    }
  };

  const handleMoveTipoRotulagem = async (item: ProgramacaoRotulagemItem, targetTipo: 'MAQUINA' | 'MANUAL') => {
    const filtered = programacaoRotulagem.filter(it => it.id !== item.id);
    const currentTargetList = filtered.filter(it => it.tipo === targetTipo);
    const nextOrdem = currentTargetList.length > 0 ? Math.max(...currentTargetList.map(it => it.ordem)) + 1 : 1;
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || (typeof currentUser === 'string' ? currentUser : (item.createdBy || 'Operador'));
    const numQty = Number(item.quantity);
    const numKg = Number(item.quantityKg);

    try {
      const updatedItem = await apiJson<ProgramacaoRotulagemItem>('/api/administrativo/rotulagem/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: typeof item.id === 'number' ? item.id : undefined,
          dataProgramada: item.dataProgramada,
          tipo: targetTipo,
          ordem: nextOrdem,
          loteNumber: String(item.loteNumber || '').trim(),
          productCode: String(item.productCode || '').trim(),
          productDescription: String(item.productDescription || '').trim(),
          quantity: (!isNaN(numQty) && numQty > 0) ? numQty : 0,
          quantityKg: (!isNaN(numKg) && numKg > 0) ? numKg : 0,
          statusRotulagem: item.statusRotulagem || 'PROGRAMADO',
          observacoes: item.observacoes || null,
          createdBy: responsibleName,
        })
      });
      setProgramacaoRotulagem([...filtered, updatedItem]);
      showToast(`Lote #${item.loteNumber} movido para Rotulagem ${targetTipo === 'MAQUINA' ? 'Máquina' : 'Manual'}.`);
      fetchProgramacaoRotulagem('TODOS');
    } catch (e: any) {
      console.error("Erro ao mover tipo de rotulagem:", e);
      showToast("Erro ao alterar tipo: " + (e?.message || e), "error");
      fetchProgramacaoRotulagem('TODOS');
    }
  };

  const handleChangeStatusRotulagem = async (id: number | string, status: 'PROGRAMADO' | 'EM_ROTULAGEM' | 'CONCLUIDO') => {
    const item = programacaoRotulagem.find(it => it.id === id);
    if (!item) return;

    setProgramacaoRotulagem(prev => prev.map(it => it.id === id ? { ...it, statusRotulagem: status } : it));
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || (typeof currentUser === 'string' ? currentUser : (item.createdBy || 'Operador'));
    const numQty = Number(item.quantity);
    const numKg = Number(item.quantityKg);

    try {
      await apiJson('/api/administrativo/rotulagem/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: typeof item.id === 'number' ? item.id : undefined,
          dataProgramada: item.dataProgramada,
          tipo: item.tipo,
          ordem: item.ordem,
          loteNumber: String(item.loteNumber || '').trim(),
          productCode: String(item.productCode || '').trim(),
          productDescription: String(item.productDescription || '').trim(),
          quantity: (!isNaN(numQty) && numQty > 0) ? numQty : 0,
          quantityKg: (!isNaN(numKg) && numKg > 0) ? numKg : 0,
          statusRotulagem: status,
          observacoes: item.observacoes || null,
          createdBy: responsibleName,
        })
      });
      const etapaStatus = status === 'CONCLUIDO' ? 'concluido' : (status === 'EM_ROTULAGEM' ? 'ativo' : 'fila');
      saveEtapaStatus(item.loteNumber, 'rotulagem', etapaStatus);
      fetchProgramacaoRotulagem('TODOS');
    } catch (e: any) {
      console.error("Erro ao atualizar status de rotulagem:", e);
      showToast("Erro ao salvar status: " + (e?.message || e), "error");
      fetchProgramacaoRotulagem('TODOS');
    }
  };

  const getCategoriaBadgeClass = (categoria: string) => {
    const found = CATEGORIAS_ENVASE.find(c => c.id === categoria);
    return found ? found.colorClass : 'bg-zinc-100 text-zinc-800 border-zinc-300';
  };

  const getCategoriaIcon = (categoria: string) => {
    const found = CATEGORIAS_ENVASE.find(c => c.id === categoria);
    return found ? found.icon : '📦';
  };

  const getCorBadgeClass = (corName?: string | null, isColorido?: boolean) => {
    if (!isColorido || !corName || corName === 'Branco') {
      return 'bg-zinc-100 text-zinc-700 border-zinc-300';
    }
    const found = CORES_PREDEFINIDAS.find(c => c.id === corName);
    return found ? found.badgeClass : 'bg-pink-50 text-pink-700 border-pink-200';
  };

  const getCorDotClass = (corName?: string | null, isColorido?: boolean) => {
    if (!isColorido || !corName || corName === 'Branco') {
      return 'bg-zinc-200 border border-zinc-400';
    }
    const found = CORES_PREDEFINIDAS.find(c => c.id === corName);
    return found ? found.dotClass : 'bg-pink-500';
  };

  return (
    <AppLayout
      moduleTitle="Acompanhamento de Produção"
      onBackToHub={onBack}
      sidebarItems={sidebarItems}
      activeTab={currentTab}
      onTabChange={(id) => setCurrentTab(id as TabType)}

    >
      {/* Toast flutuante de confirmação */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold backdrop-blur-md",
              toastMessage.type === 'success'
                ? 'bg-zinc-900 text-white border-zinc-800'
                : 'bg-rose-950 text-rose-100 border-rose-800'
            )}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            {toastMessage.text}
          </div>
        </div>
      )}

      {/* VIEW 1 & VIEW 2: STATUS DE LOTES (INTERNOS) E TERCEIRIZADOS */}
      {(currentTab === 'lotes' || currentTab === 'terceirizados') && (
        <div className="space-y-3">
          {/* Sub-Aba Exclusiva para Terceirizados: Acompanhamento de Lotes vs Solicitações */}
          {currentTab === 'terceirizados' && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-zinc-200 shadow-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setTerceirizadosSubTab('solicitados'); fetchSolicitacoes(); }}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5",
                    terceirizadosSubTab === 'solicitados'
                      ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                      : "bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  <Tag className="h-3.5 w-3.5" />
                  <span>Solicitações & Aguardando Lote ERP</span>
                  {solicitacoes.filter(s => s.status === 'SOLICITADO').length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-400 text-zinc-950 font-bold ml-0.5">
                      {solicitacoes.filter(s => s.status === 'SOLICITADO').length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTerceirizadosSubTab('acompanhamento')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5",
                    terceirizadosSubTab === 'acompanhamento'
                      ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                      : "bg-white text-zinc-650 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>Lotes Terceirizados em Produção ({filterCounts.todos})</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNovaSolicitacaoModal(true)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Nova Solicitação Terceirizado</span>
                </button>
              </div>
            </div>
          )}

          {currentTab === 'terceirizados' && terceirizadosSubTab === 'solicitados' ? (
            <div className="space-y-3">
              {/* Barra Superior de Filtros para Solicitações */}
              <div className="bg-white border border-zinc-200 p-3 rounded-lg shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-600">
                      Exibindo <strong>{filteredSolicitacoes.length}</strong> de <strong>{solicitacoes.length}</strong> solicitações
                    </span>
                    {Object.keys(solicColumnFilters).length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <SlidersHorizontal className="h-3 w-3" />
                        {Object.keys(solicColumnFilters).length} filtro(s) ativo(s)
                      </span>
                    )}
                    {(Object.keys(solicColumnFilters).length > 0 || solicitacoesSearch) && (
                      <button
                        type="button"
                        onClick={handleClearAllSolicFilters}
                        className="text-xs text-rose-600 hover:text-rose-800 underline font-medium cursor-pointer ml-1"
                      >
                        Limpar todos os filtros
                      </button>
                    )}
                  </div>

                  {/* Busca */}
                  <div className="relative min-w-[240px] max-w-sm flex-1">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={solicitacoesSearch}
                      onChange={e => setSolicitacoesSearch(e.target.value)}
                      placeholder="Buscar por código SKU, produto, fornecedor..."
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-8 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                    />
                    {solicitacoesSearch && (
                      <button
                        type="button"
                        onClick={() => setSolicitacoesSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabela de Solicitações */}
              <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zinc-50/90 border-b border-zinc-200 text-[11px] font-bold text-zinc-600 uppercase tracking-wider select-none">
                        <ColumnFilterHeader
                          columnKey="createdAt"
                          label="Data Solicitada"
                          options={solicColumnOptions.createdAt || []}
                          selectedValues={solicColumnFilters.createdAt}
                          onFilterChange={handleSolicColumnFilterChange}
                          className="w-36"
                        />
                        <ColumnFilterHeader
                          columnKey="productCode"
                          label="REF / SKU"
                          options={solicColumnOptions.productCode || []}
                          selectedValues={solicColumnFilters.productCode}
                          onFilterChange={handleSolicColumnFilterChange}
                          className="w-28"
                        />
                        <ColumnFilterHeader
                          columnKey="productDescription"
                          label="Produto"
                          options={solicColumnOptions.productDescription || []}
                          selectedValues={solicColumnFilters.productDescription}
                          onFilterChange={handleSolicColumnFilterChange}
                          className="min-w-[240px]"
                        />
                        <th className="py-3 px-4 text-right w-32">Quantidade</th>
                        <ColumnFilterHeader
                          columnKey="fornecedor"
                          label="Fornecedor"
                          options={solicColumnOptions.fornecedor || []}
                          selectedValues={solicColumnFilters.fornecedor}
                          onFilterChange={handleSolicColumnFilterChange}
                          className="w-36"
                        />
                        <ColumnFilterHeader
                          columnKey="previsaoEntrega"
                          label="Previsão"
                          options={solicColumnOptions.previsaoEntrega || []}
                          selectedValues={solicColumnFilters.previsaoEntrega}
                          onFilterChange={handleSolicColumnFilterChange}
                          className="w-36"
                        />
                        <ColumnFilterHeader
                          columnKey="aprovacoes"
                          label="Aprovações"
                          options={solicColumnOptions.aprovacoes || []}
                          selectedValues={solicColumnFilters.aprovacoes}
                          onFilterChange={handleSolicColumnFilterChange}
                          align="center"
                          className="w-44"
                        />
                        <ColumnFilterHeader
                          columnKey="status"
                          label="Etapa / Status"
                          options={solicColumnOptions.status || []}
                          selectedValues={solicColumnFilters.status}
                          onFilterChange={handleSolicColumnFilterChange}
                          align="center"
                          className="w-36"
                        />
                        <ColumnFilterHeader
                          columnKey="loteNumber"
                          label="Lote ERP"
                          options={solicColumnOptions.loteNumber || []}
                          selectedValues={solicColumnFilters.loteNumber}
                          onFilterChange={handleSolicColumnFilterChange}
                          className="w-32"
                        />
                        <th className="py-3 px-4 text-center w-24 text-zinc-500">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-800">
                      {loadingSolicitacoes ? (
                        <tr>
                          <td colSpan={10} className="py-16 text-center text-zinc-400">
                            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                            <p className="text-xs font-semibold">Carregando solicitações...</p>
                          </td>
                        </tr>
                      ) : filteredSolicitacoes.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-16 text-center text-zinc-400">
                            <Package className="h-8 w-8 mx-auto mb-2 text-zinc-300 stroke-[1.5]" />
                            <p className="text-xs font-bold text-zinc-700">Nenhuma solicitação encontrada</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                              Clique em "+ Nova Solicitação" no topo para registrar uma demanda com terceirista.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredSolicitacoes.map(solic => {
                          const isVinculado = solic.status === 'VINCULADO';
                          const isAprovado = Boolean(solic.aprovacaoEmbalagem && solic.aprovacaoMateriaPrima);
                          const prevBadge = getPrevisaoBadge(solic.previsaoEntrega);
                          return (
                            <tr
                              key={solic.id}
                              className={cn(
                                "hover:bg-zinc-50/80 transition-colors",
                                isVinculado ? "bg-emerald-50/20" : isAprovado ? "bg-indigo-50/20" : "bg-white"
                              )}
                            >
                              <td className="py-2.5 px-4 font-mono text-zinc-600 whitespace-nowrap">
                                {formatDateTime(solic.createdAt)}
                              </td>
                              <td className="py-2.5 px-4 font-mono font-bold text-zinc-900 whitespace-nowrap">
                                {solic.productCode}
                              </td>
                              <td className="py-2.5 px-4 font-medium text-zinc-900 min-w-[240px]">
                                {solic.productDescription}
                                {solic.observacoes && (
                                  <span className="block text-[10px] text-zinc-500 italic mt-0.5">
                                    Obs: {solic.observacoes}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-right whitespace-nowrap font-mono font-bold text-zinc-900">
                                <div>
                                  {solic.quantity.toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">{solic.unit}</span>
                                </div>
                                {Boolean(solic.quantityKg && solic.unit === 'UN') && (
                                  <div className="text-[10px] text-zinc-400 font-mono font-normal">
                                    ≈ {Number(solic.quantityKg).toLocaleString('pt-BR')} kg
                                  </div>
                                )}
                                {Boolean(solic.quantityUn && solic.unit === 'KG') && (
                                  <div className="text-[10px] text-zinc-400 font-mono font-normal">
                                    ≈ {Number(solic.quantityUn).toLocaleString('pt-BR')} un
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-zinc-700 whitespace-nowrap">
                                {solic.fornecedor || '—'}
                              </td>
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                {editingPrevisaoSolicId === solic.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="date"
                                      value={tempPrevisaoSolicVal}
                                      onChange={e => setTempPrevisaoSolicVal(e.target.value)}
                                      className="text-xs bg-white border border-zinc-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSavePrevisaoSolicitacao(solic.id, tempPrevisaoSolicVal)}
                                      disabled={savingPrevisaoSolic}
                                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                                      title="Salvar previsão"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingPrevisaoSolicId(null)}
                                      className="p-1 text-zinc-400 hover:bg-zinc-100 rounded cursor-pointer"
                                      title="Cancelar"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() => {
                                      setEditingPrevisaoSolicId(solic.id);
                                      setTempPrevisaoSolicVal(solic.previsaoEntrega ? solic.previsaoEntrega.split('T')[0] : '');
                                    }}
                                    className="group cursor-pointer flex items-center gap-1.5"
                                    title="Clique para definir ou alterar a previsão de produção/entrega"
                                  >
                                    {(() => {
                                      const badge = getPrevisaoBadge(solic.previsaoEntrega);
                                      if (!badge) {
                                        return (
                                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-700 bg-zinc-50 group-hover:bg-zinc-100 px-2 py-1 rounded-lg border border-dashed border-zinc-200 transition-colors">
                                            <Calendar className="h-3 w-3 text-zinc-400 group-hover:text-zinc-600" />
                                            + Definir
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className={cn(
                                          "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border shadow-2xs transition-all group-hover:ring-2 group-hover:ring-zinc-300",
                                          badge.colorClass
                                        )}>
                                          <Calendar className="h-2.5 w-2.5" />
                                          {badge.label}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                )}
                              </td>


                              {/* APROVAÇÕES: Embalagem & Matéria-Prima */}
                              <td className="py-2 px-3 whitespace-nowrap">
                                <div className="flex flex-col gap-1">
                                  {/* Embalagens */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAprovacao(solic.id, 'embalagem', Boolean(solic.aprovacaoEmbalagem))}
                                    title={solic.aprovacaoEmbalagem
                                      ? `Embalagem aprovada por ${solic.aprovacaoEmbalagemPor || 'Operador'} em ${solic.aprovacaoEmbalagemEm ? formatDateTime(solic.aprovacaoEmbalagemEm) : ''}. Clique para desmarcar.`
                                      : "Clique para aprovar Embalagens"}
                                    className={cn(
                                      "inline-flex items-center justify-between gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all cursor-pointer shadow-2xs",
                                      solic.aprovacaoEmbalagem
                                        ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                                        : "bg-zinc-50 text-zinc-600 border-dashed border-zinc-300 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300"
                                    )}
                                  >
                                    <span className="flex items-center gap-1">
                                      <Package className="h-3 w-3 text-zinc-500" />
                                      <span>Embalagem</span>
                                    </span>
                                    {solic.aprovacaoEmbalagem ? (
                                      <span className="inline-flex items-center gap-0.5 text-emerald-700 font-black">
                                        <Check className="h-3 w-3 stroke-[3]" /> OK
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-zinc-400 font-normal">Pendente</span>
                                    )}
                                  </button>

                                  {/* Matéria-Prima */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAprovacao(solic.id, 'materia_prima', Boolean(solic.aprovacaoMateriaPrima))}
                                    title={solic.aprovacaoMateriaPrima
                                      ? `Matéria-prima aprovada por ${solic.aprovacaoMateriaPrimaPor || 'Operador'} em ${solic.aprovacaoMateriaPrimaEm ? formatDateTime(solic.aprovacaoMateriaPrimaEm) : ''}. Clique para desmarcar.`
                                      : "Clique para aprovar Matéria-Prima"}
                                    className={cn(
                                      "inline-flex items-center justify-between gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all cursor-pointer shadow-2xs",
                                      solic.aprovacaoMateriaPrima
                                        ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                                        : "bg-zinc-50 text-zinc-600 border-dashed border-zinc-300 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300"
                                    )}
                                  >
                                    <span className="flex items-center gap-1">
                                      <FlaskConical className="h-3 w-3 text-zinc-500" />
                                      <span>Mat. Prima</span>
                                    </span>
                                    {solic.aprovacaoMateriaPrima ? (
                                      <span className="inline-flex items-center gap-0.5 text-emerald-700 font-black">
                                        <Check className="h-3 w-3 stroke-[3]" /> OK
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-zinc-400 font-normal">Pendente</span>
                                    )}
                                  </button>
                                </div>
                              </td>

                              {/* STATUS / ETAPA */}
                              <td className="py-2.5 px-4 text-center whitespace-nowrap">
                                {isVinculado ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    Vinculado ao Lote
                                  </span>
                                ) : isAprovado ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 shadow-2xs">
                                    <CheckCheck className="h-3.5 w-3.5 text-indigo-600" />
                                    Aprovado • Liberado
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                                    <Clock className="h-3 w-3 text-amber-600" />
                                    Aguardando ({(solic.aprovacaoEmbalagem ? 1 : 0) + (solic.aprovacaoMateriaPrima ? 1 : 0)}/2)
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-4 whitespace-nowrap font-mono font-bold">
                                {solic.loteNumber ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTerceirizadosSubTab('acompanhamento');
                                      setSearch(solic.loteNumber || '');
                                    }}
                                    className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
                                    title="Ir para o lote em acompanhamento"
                                  >
                                    <span>#{solic.loteNumber}</span>
                                    <ArrowRight className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <span className="text-zinc-400 italic text-[11px]">Não aberto</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingPrevisaoSolicId(solic.id);
                                      setTempPrevisaoSolicVal(solic.previsaoEntrega ? solic.previsaoEntrega.split('T')[0] : '');
                                    }}
                                    className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                    title="Definir ou alterar data de previsão de entrega"
                                  >
                                    <Calendar className="h-3.5 w-3.5" />
                                  </button>
                                  {!isVinculado ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenVincularModal(solic)}
                                      className="p-1.5 text-zinc-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                      title="Vincular a um lote de produção do ERP"
                                    >
                                      <Layers className="h-3.5 w-3.5" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleDesvincularSolicitacao(solic.id, solic.loteNumber)}
                                      className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                      title={`Desvincular lote #${solic.loteNumber} desta solicitação`}
                                    >
                                      <X className="h-3.5 w-3.5 text-amber-600" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSolicitacao(solic.id)}
                                    className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    title="Excluir solicitação"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-zinc-50/80 border-t border-zinc-200 text-xs text-zinc-500 flex items-center justify-between">
                  <span>
                    Exibindo <strong>{filteredSolicitacoes.length}</strong> solicitações de terceirizados.
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    O vínculo de lotes é realizado de forma manual pelo supervisor através do ícone de vincular ao lado de cada solicitação.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* BARRA SUPERIOR DE FILTROS LIMPA (FILTROS POR COLUNA ATIVOS) */}
              <div className="bg-white border border-zinc-200 p-3 rounded-lg shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-600">
                      Exibindo <strong>{sortedLotes.length}</strong> de <strong>{baseTabLotes.length}</strong> lotes {currentTab === 'terceirizados' ? 'terceirizados' : 'internos'}
                    </span>
                    {Object.keys(lotesColumnFilters).length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <SlidersHorizontal className="h-3 w-3" />
                        {Object.keys(lotesColumnFilters).length} coluna(s) com filtro
                      </span>
                    )}
                    {(Object.keys(lotesColumnFilters).length > 0 || search) && (
                      <button
                        type="button"
                        onClick={handleClearAllLotesFilters}
                        className="text-xs text-rose-600 hover:text-rose-800 underline font-medium cursor-pointer ml-1"
                      >
                        Limpar todos os filtros
                      </button>
                    )}
                  </div>

                  {/* Filtro de Insumo Faltante */}
                    {insumosFaltantesList.length > 0 && (
                      <div className="flex items-center gap-1">
                        <select
                          value={selectedInsumoFaltanteFilter}
                          onChange={(e) => setSelectedInsumoFaltanteFilter(e.target.value)}
                          className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                          title="Filtrar por Insumo Faltante"
                        >
                          <option value="TODOS">⚠️ Todos Insumos Faltantes ({insumosFaltantesList.reduce((s, i) => s + (i?.count || 0), 0)} OPs)</option>
                          {insumosFaltantesList.filter(i => i && i.codigo).map(i => (
                            <option key={i.codigo} value={i.codigo}>
                              [{i.codigo}] {i.descricao} ({i.count} OP{i.count > 1 ? 's' : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { fetchLotes(); fetchKitOrders(); fetchSolicitacoes(); }}
                      disabled={loading || loadingKits || loadingSolicitacoes}
                      className="p-2 border border-zinc-200 rounded-lg hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                      title="Recarregar dados"
                    >
                      <RefreshCw className={cn("h-4 w-4", (loading || loadingKits || loadingSolicitacoes) && "animate-spin")} />
                    </button>
                    {/* Busca de Lotes */}
                  <div className="relative min-w-[240px] max-w-sm flex-1">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={currentTab === 'terceirizados' ? "Buscar terceirizado, código, lote..." : "Buscar lote, código SKU, descrição..."}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-8 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

          {/* BARRA DE AÇÃO EM LOTE PARA SELEÇÃO MÚLTIPLA */}
          {selectedLotes.size > 0 && (
            <div className="bg-zinc-900 text-white px-4 py-2.5 rounded-lg shadow-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded-full text-xs font-bold">
                  {selectedLotes.size}
                </span>
                <span className="text-xs font-semibold text-zinc-200">
                  {selectedLotes.size === 1 ? '1 lote selecionado' : `${selectedLotes.size} lotes selecionados`}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedLotes(new Set())}
                  className="text-xs text-zinc-400 hover:text-white underline transition-colors cursor-pointer ml-1"
                >
                  Desmarcar todos
                </button>
              </div>

              <div className="flex items-center gap-2">
                {currentTab === 'lotes' && (
                  <button
                    type="button"
                    onClick={handleBatchMoveToTerceirizados}
                    disabled={isBatchUpdating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50 mr-1"
                    title="Mover todos os lotes selecionados para Terceirizados"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Mover para Terceirizados</span>
                  </button>
                )}

                <span className="text-xs text-zinc-300 font-medium">Status em lote:</span>
                <select
                  value={batchStatusValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBatchStatusValue(val);
                    if (val) handleApplyBatchStatus(val);
                  }}
                  disabled={isBatchUpdating}
                  className="bg-zinc-800 text-white border border-zinc-700 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">Selecione o status...</option>
                  <optgroup label="Pesagem e Produção">
                    <option value="Pesagem">Pesagem</option>
                    <option value="Produzido">Produzido</option>
                    <option value="Liberado para Envase">Liberado para Envase</option>
                  </optgroup>
                  <optgroup label="Embalagem">
                    <option value="Rotulagem">Rotulagem</option>
                    <option value="Envase">Envase</option>
                    <option value="Finalizada">Finalizada</option>
                  </optgroup>
                  <optgroup label="Paralisado">
                    <option value="Em Espera">⏸️ Em Espera...</option>
                  </optgroup>
                  <optgroup label="Redefinir">
                    <option value="__RESET__">Restaurar Padrão (Sem Status)</option>
                  </optgroup>
                </select>
                {isBatchUpdating && (
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
                )}
              </div>
            </div>
          )}

          {/* TABELA PLANILHA ESTILO GERENCIAMENTO DE PRODUÇÃO */}
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50/90 border-b border-zinc-200 text-[11px] font-bold text-zinc-600 uppercase tracking-wider select-none">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={sortedLotes.length > 0 && sortedLotes.every(l => selectedLotes.has(l.loteNumber))}
                        ref={el => {
                          if (el) {
                            const someSelected = sortedLotes.some(l => selectedLotes.has(l.loteNumber)) && !sortedLotes.every(l => selectedLotes.has(l.loteNumber));
                            el.indeterminate = someSelected;
                          }
                        }}
                        onChange={toggleSelectAll}
                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                        title="Selecionar todos os lotes visíveis"
                      />
                    </th>
                    <ColumnFilterHeader
                      columnKey="loteNumber"
                      label="Lote"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.loteNumber || []}
                      selectedValues={lotesColumnFilters.loteNumber}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-32"
                    />
                    <ColumnFilterHeader
                      columnKey="date"
                      label="Data"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.date || []}
                      selectedValues={lotesColumnFilters.date}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-28"
                    />
                    <ColumnFilterHeader
                      columnKey="productCode"
                      label="REF / SKU"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.productCode || []}
                      selectedValues={lotesColumnFilters.productCode}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-28"
                    />
                    <ColumnFilterHeader
                      columnKey="productDescription"
                      label="Produto"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.productDescription || []}
                      selectedValues={lotesColumnFilters.productDescription}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="min-w-[260px]"
                    />
                    <th
                      onClick={() => handleSort('quantity')}
                      className="py-3 px-4 cursor-pointer hover:bg-zinc-100 transition-colors text-right w-36"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Quantidade / Peso</span>
                        {sortField === 'quantity' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                      </div>
                    </th>
                    <ColumnFilterHeader
                      columnKey="erpStatus"
                      label="Status ERP (Contábil)"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.erpStatus || []}
                      selectedValues={lotesColumnFilters.erpStatus}
                      onFilterChange={handleLotesColumnFilterChange}
                      align="center"
                      className="w-40"
                    />
                    <ColumnFilterHeader
                      columnKey="customStatus"
                      label={currentTab === 'terceirizados' ? "Status Fábrica (Nosso)" : "Quadros & Etapas Ativas"}
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.customStatus || []}
                      selectedValues={lotesColumnFilters.customStatus}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-56"
                    />
                    <th className="py-3 px-3 text-left font-bold text-[11px] uppercase tracking-wider text-zinc-600 w-44">
                      Laudo FQ
                    </th>
                    {currentTab === 'terceirizados' && (
                      <th className="py-3 px-4 text-zinc-600 font-bold w-40">
                        Fornecedor
                      </th>
                    )}
                    <ColumnFilterHeader
                      columnKey="dataPrevisao"
                      label="Previsão"
                      onSort={handleSort}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      options={lotesColumnOptions.dataPrevisao || []}
                      selectedValues={lotesColumnFilters.dataPrevisao}
                      onFilterChange={handleLotesColumnFilterChange}
                      className="w-40"
                    />
                    <th className="py-3 px-4 text-zinc-500 font-bold min-w-[200px]">
                      Etapas & Datas
                    </th>
                    <th className="py-3 px-3 text-center text-zinc-400 font-medium w-28">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {loading ? (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-zinc-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                        <p className="text-xs font-semibold">Carregando lotes...</p>
                      </td>
                    </tr>
                  ) : sortedLotes.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-zinc-400">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                        <p className="text-sm font-semibold text-zinc-700">Nenhum lote corresponde ao filtro selecionado</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {currentTab === 'terceirizados'
                            ? 'Nenhum lote terceirizado encontrado. Você pode marcar lotes como terceirizados na aba principal.'
                            : 'Clique em "Todos" ou selecione outro status no topo.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedLotes.map((lote) => {
                      const isEa = lote.erpStatus === 'EA';
                      const isFinalizada = lote.customStatus === 'Finalizada';
                      const isEspera = lote.customStatus === 'Em Espera';
                      const isConcluido = isEa || isFinalizada;
                      const isBusy = savingLote === lote.loteNumber;
                      const normalizedCustomStatus = (lote.customStatus === 'Produção' ? 'Produzido' : lote.customStatus) || '';
                      const isJustUpdated = recentlyUpdatedLotes[lote.loteNumber];

                      return (
                        <tr
                          key={`${lote.loteNumber}_${lote.productCode || ''}`}
                          className={cn(
                            "hover:bg-zinc-50/80 transition-colors",
                            selectedLotes.has(lote.loteNumber) ? "bg-blue-50/40" : isConcluido ? "bg-zinc-50/40" : isEspera ? "bg-orange-50/20" : "bg-white"
                          )}
                        >
                          {/* Checkbox de Seleção */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedLotes.has(lote.loteNumber)}
                              onChange={() => toggleSelectLote(lote.loteNumber)}
                              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                            />
                          </td>

                          {/* Lote */}
                          <td className="py-2.5 px-4 font-mono font-bold text-xs text-zinc-800 select-all whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>#{lote.loteNumber}</span>
                              {multiProductLoteNumbers.has(lote.loteNumber) && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200"
                                  title="OP Conjunta com múltiplos produtos"
                                >
                                  MULTI
                                </span>
                              )}
                              {lote.isTerceirizado && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200"
                                  title="Lote Terceirizado"
                                >
                                  TERC
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Data */}
                          <td className="py-2.5 px-4 text-zinc-650 font-medium whitespace-nowrap">
                            {formatDateOnly(lote.date)}
                          </td>

                          {/* REF SKU */}
                          <td className="py-2.5 px-4 font-mono text-zinc-600 font-semibold whitespace-nowrap">
                            {lote.productCode}
                          </td>

                          {/* Produto */}
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-zinc-900 leading-snug">
                              {lote.productDescription}
                            </div>
                          </td>

                          {/* Quantidade (Unidades E Kg do lote completo) */}
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="font-mono font-bold text-xs text-zinc-900">
                              {Number(lote.quantity || 0).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500">un</span>
                            </div>
                            <div className="text-[11px] font-mono text-zinc-500 font-semibold">
                              {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-400">kg total</span>
                            </div>
                          </td>

                          {/* Status ERP */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                              getErpBadgeClass(lote.erpStatus)
                            )}>
                              {isEa ? 'Concluído (EA)' : lote.erpStatusLabel}
                            </span>
                          </td>

                          {/* Quadros & Etapas Ativas */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {currentTab === 'lotes' ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1 max-w-[280px]">
                                  {(() => {
                                    const eff = getEffectiveStatus(lote);
                                    const isOrdensFin = isLoteConcluido(lote);
                                    const isPesando = !isOrdensFin && (lotesPesando.some(p => p.loteNumber === lote.loteNumber) || pesagemOrderOverrides.includes(lote.loteNumber) || eff === 'Pesagem');
                                    const isProducao = !isOrdensFin && (sortedLotesEmFabricacao.some(p => p.loteNumber === lote.loteNumber) || producaoOrderOverrides.includes(lote.loteNumber) || eff === 'Produzido' || eff === 'Produção');
                                    const isCaldeira = !isOrdensFin && (lotesCaldeira.some(c => c.loteNumber === lote.loteNumber));
                                    const isEnvase = !isOrdensFin && (programacaoEnvase.some(e => e.loteNumber === lote.loteNumber) || eff === 'Envase' || eff === 'Liberado para Envase');
                                    const isRotulagem = !isOrdensFin && (programacaoRotulagem.some(r => r.loteNumber === lote.loteNumber) || eff === 'Rotulagem');
                                    const isEspera = !isOrdensFin && !!lote.motivoEspera;

                                    const badges = [];
                                    if (isPesando) badges.push(<span key="pes" className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">⚖️ Pesagem</span>);
                                    if (isProducao) badges.push(<span key="prod" className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 shadow-2xs">🧪 Produção</span>);
                                    if (isCaldeira) badges.push(<span key="cald" className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-100 text-orange-900 border border-orange-300 shadow-2xs">🔥 Caldeira</span>);
                                    if (isEnvase) badges.push(<span key="env" className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 shadow-2xs">📦 Envase</span>);
                                    if (isRotulagem) badges.push(<span key="rot" className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">🏷️ Rotulagem</span>);
                                    if (isOrdensFin) badges.push(<span key="ord" className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-200 text-zinc-900 border border-zinc-300 shadow-2xs">🏁 Concluído</span>);
                                    if (isEspera) badges.push(<span key="esp" className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300 truncate max-w-[140px] shadow-2xs" title={lote.motivoEspera || ''}>⏸️ {lote.motivoEspera}</span>);

                                    if (badges.length === 0) {
                                      return <span className="text-[11px] text-zinc-400 font-medium italic">Aguardando início</span>;
                                    }
                                    return badges;
                                  })()}
                                </div>
                                {lote.motivoEspera && (
                                  <div
                                    onClick={() => handleOpenPauseModal(lote)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 cursor-pointer hover:bg-amber-100 transition-colors line-clamp-1 max-w-[240px]"
                                    title="Clique para editar motivo ou insumo faltante"
                                  >
                                    <span>⏸️</span>
                                    <span className="truncate">{lote.motivoEspera}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={getEffectiveStatus(lote) === 'Sem Status' ? '' : getEffectiveStatus(lote)}
                                  onChange={(e) => handleSelectStatusChange(lote.loteNumber, e.target.value)}
                                  disabled={savingLote === lote.loteNumber}
                                  className={cn(
                                    "text-xs font-bold rounded-lg border px-2.5 py-1.5 focus:outline-none transition-all cursor-pointer shadow-2xs",
                                    getBadgeClass(lote.customStatus),
                                    recentlyUpdatedLotes[lote.loteNumber] && "ring-2 ring-emerald-400 scale-102"
                                  )}
                                >
                                  <option value="">Padrão ({lote.erpStatusLabel || lote.erpStatus || 'Sem Status'})</option>
                                  <optgroup label="Pesagem e Produção">
                                    <option value="Pesagem">Pesagem</option>
                                    <option value="Produzido">Produzido</option>
                                    <option value="Liberado para Envase">Liberado para Envase</option>
                                  </optgroup>
                                  <optgroup label="Embalagem">
                                    <option value="Rotulagem">Rotulagem</option>
                                    <option value="Envase">Envase</option>
                                    <option value="Ordem Parcial">Ordem Parcial</option>
                                    <option value="Ordem Finalizada">Ordem Finalizada</option>
                                  </optgroup>
                                  {lote.customStatus === 'Em Espera' && (
                                    <optgroup label="Pausa">
                                      <option value="Em Espera">⏸️ Em Espera (Pausado)</option>
                                    </optgroup>
                                  )}
                                  {lote.customStatus && (
                                    <optgroup label="Redefinir">
                                      <option value="">Restaurar Padrão ERP</option>
                                    </optgroup>
                                  )}
                                </select>
                              </div>
                            )}
                          </td>

                          {/* Laudo Físico-Química */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {renderFiscoQuimicaBadge(lote.loteNumber) || (
                              <span className="text-zinc-400 italic text-[11px]">— Sem laudo</span>
                            )}
                          </td>

                          {currentTab === 'terceirizados' && (
                            <td className="py-2.5 px-4 whitespace-nowrap text-xs font-semibold text-zinc-800">
                              {lote.fornecedorTerceirizado || (lote as any).fornecedor_terceirizado || (
                                <span className="text-zinc-400 italic text-[11px]">— Não definido</span>
                              )}
                            </td>
                          )}

                          {/* Previsão de Produção */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {editingPrevisaoLote === lote.loteNumber ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={tempPrevisaoVal}
                                  onChange={e => setTempPrevisaoVal(e.target.value)}
                                  className="text-xs bg-white border border-zinc-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSavePrevisao(lote.loteNumber, tempPrevisaoVal)}
                                  disabled={savingPrevisao}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                                  title="Salvar previsão"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPrevisaoLote(null)}
                                  className="p-1 text-zinc-400 hover:bg-zinc-100 rounded cursor-pointer"
                                  title="Cancelar"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingPrevisaoLote(lote.loteNumber);
                                  setTempPrevisaoVal(lote.dataPrevisao ? lote.dataPrevisao.split('T')[0] : '');
                                }}
                                className="group cursor-pointer flex items-center gap-1.5"
                                title="Clique para definir ou alterar a previsão de produção"
                              >
                                {(() => {
                                  const badge = getPrevisaoBadge(lote.dataPrevisao);
                                  if (!badge) {
                                    return (
                                      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 group-hover:text-zinc-700 bg-zinc-50 group-hover:bg-zinc-100 px-2 py-1 rounded-lg border border-dashed border-zinc-200 transition-colors">
                                        <Calendar className="h-3 w-3 text-zinc-400 group-hover:text-zinc-600" />
                                        + Definir
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className={cn(
                                      "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border shadow-2xs transition-all group-hover:ring-2 group-hover:ring-zinc-300",
                                      badge.colorClass
                                    )}>
                                      <Calendar className="h-2.5 w-2.5" />
                                      {badge.label}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </td>

                          {/* Etapas & Datas Registradas */}
                          <td className="py-2 px-4 text-[10px] font-medium text-zinc-600 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              {lote.dataPrevisao && (
                                <div className="flex items-center gap-1 text-indigo-900 font-semibold">
                                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                  <span className="font-bold">Previsão:</span> {formatDateShort(lote.dataPrevisao)}
                                </div>
                              )}
                              {lote.dataPesagem && (
                                <div className="flex items-center gap-1 text-amber-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  <span className="font-bold">Pesagem:</span> {formatDateShort(lote.dataPesagem)}
                                </div>
                              )}
                              {lote.dataProducao && (
                                <div className="flex items-center gap-1 text-blue-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                  <span className="font-bold">Produzido:</span> {formatDateShort(lote.dataProducao)}
                                </div>
                              )}
                              {lote.dataLiberadoEnvase && (
                                <div className="flex items-center gap-1 text-teal-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                                  <span className="font-bold">Liberado Envase:</span> {formatDateShort(lote.dataLiberadoEnvase)}
                                </div>
                              )}
                              {lote.dataEnvase && (
                                <div className="flex items-center gap-1 text-purple-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                                  <span className="font-bold">Envase:</span> {formatDateShort(lote.dataEnvase)}
                                </div>
                              )}
                              {lote.dataRotulagem && (
                                <div className="flex items-center gap-1 text-cyan-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                                  <span className="font-bold">Rotulagem:</span> {formatDateShort(lote.dataRotulagem)}
                                </div>
                              )}
                              {lote.dataEmEspera && (
                                <div className="flex items-center gap-1 text-orange-900 font-semibold">
                                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                  <span className="font-bold">Espera:</span> {formatDateShort(lote.dataEmEspera)}
                                  {lote.motivoEspera && <span className="opacity-75 text-[9px]">({lote.motivoEspera})</span>}
                                </div>
                              )}
                              {lote.dataFinalizada && (
                                <div className="flex items-center gap-1 text-emerald-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  <span className="font-bold">Finalizada:</span> {formatDateShort(lote.dataFinalizada)}
                                </div>
                              )}
                              {!lote.dataPesagem && !lote.dataProducao && !lote.dataLiberadoEnvase && !lote.dataEnvase && !lote.dataRotulagem && !lote.dataEmEspera && !lote.dataFinalizada && (
                                <span className="text-zinc-300 italic">—</span>
                              )}
                            </div>
                          </td>

                          {/* Ações: +1 Dia, Timestamps, Histórico e Terceirizados */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              {currentTab === 'lotes' ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveLoteNextDay(lote)}
                                    className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                    title="Adiar lote (selecionar nova data)"
                                  >
                                    <CalendarPlus className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTimestamps(lote)}
                                    className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                    title="Ajustar datas e horários manuais deste lote"
                                  >
                                    <Clock className="h-4 w-4" />
                                  </button>
                                  {lote.motivoEspera ? (
                                    <button
                                      type="button"
                                      onClick={() => handleResumeLote(lote)}
                                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                      title="Lote Pausado. Clique para Retomar."
                                    >
                                      <Play className="h-4 w-4 fill-current" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenPauseModal(lote)}
                                      className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                      title="Pausar este lote"
                                    >
                                      <PauseCircle className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTerceirizado(lote)}
                                    className="p-1.5 text-zinc-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                                    title="Mover este lote para Terceirizados & Definir Fornecedor e Previsão"
                                  >
                                    <Building2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenHistory(lote)}
                                    className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                                    title="Ver histórico de alterações de status e datas"
                                  >
                                    <History className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTerceirizado(lote)}
                                    className="px-2.5 py-1 bg-zinc-50 hover:bg-indigo-50 text-zinc-700 hover:text-indigo-700 border border-zinc-200 hover:border-indigo-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                    title="Editar Fornecedor e Previsão"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                                    <span>Editar</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé da tabela com Paginação Completa e Seletor de Limite */}
            <div className="bg-zinc-50 px-4 py-3 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Exibindo <strong>{paginatedLotes.length}</strong> de <strong>{sortedLotes.length}</strong> lotes {currentTab === 'terceirizados' ? 'terceirizados' : 'internos'}
                  {sortedLotes.length !== baseTabLotes.length && (
                    <span className="text-zinc-400 ml-1">
                      (filtrados de um total de {baseTabLotes.length})
                    </span>
                  )}
                </span>
                <span className="text-zinc-300">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500">Por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="border border-zinc-300 rounded-lg px-2 py-1 bg-white text-xs font-bold text-zinc-800 focus:outline-none cursor-pointer"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={99999}>Todos ({sortedLotes.length})</option>
                  </select>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(1)}
                    className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                    title="Primeira Página"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                    title="Página Anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-3 py-1 bg-white border border-zinc-200 rounded-lg font-bold text-zinc-900 text-xs">
                    Página {currentPage} de {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                    title="Próxima Página"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                    title="Última Página"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
        </div>
      )}

      {/* VIEW 3: ABA DE KITS (INTEGRADA COM GERENCIAMENTO DE KITS) */}
      {currentTab === 'kits' && (
        <div className="space-y-3">
          {/* Barra Superior da Aba de Kits */}
          <div className="bg-white border border-zinc-200 p-3 rounded-lg shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-600">
                  Exibindo <strong>{filteredKitOrders.length}</strong> de <strong>{kitOrders.length}</strong> ordens de kits
                </span>
                {Object.keys(kitsColumnFilters).length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <SlidersHorizontal className="h-3 w-3" />
                    {Object.keys(kitsColumnFilters).length} coluna(s) com filtro
                  </span>
                )}
                {(Object.keys(kitsColumnFilters).length > 0 || kitOrdersSearch) && (
                  <button
                    type="button"
                    onClick={handleClearAllKitsFilters}
                    className="text-xs text-rose-600 hover:text-rose-800 underline font-medium cursor-pointer ml-1"
                  >
                    Limpar todos os filtros
                  </button>
                )}
              </div>

              {/* Busca de Ordens de Kits */}
              <div className="relative min-w-[240px] max-w-sm flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={kitOrdersSearch}
                  onChange={e => setKitOrdersSearch(e.target.value)}
                  placeholder="Buscar ordem nº, SKU do kit, descrição..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-8 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                />
                {kitOrdersSearch && (
                  <button
                    type="button"
                    onClick={() => setKitOrdersSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabela de Ordens de Kits */}
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50/90 border-b border-zinc-200 text-[11px] font-bold text-zinc-600 uppercase tracking-wider select-none">
                    <ColumnFilterHeader
                      columnKey="orderNumber"
                      label="Nº Ordem"
                      options={kitsColumnOptions.orderNumber || []}
                      selectedValues={kitsColumnFilters.orderNumber}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="w-28"
                    />
                    <ColumnFilterHeader
                      columnKey="createdAt"
                      label="Data"
                      options={kitsColumnOptions.createdAt || []}
                      selectedValues={kitsColumnFilters.createdAt}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="w-28"
                    />
                    <ColumnFilterHeader
                      columnKey="kitProductCode"
                      label="REF SKU"
                      options={kitsColumnOptions.kitProductCode || []}
                      selectedValues={kitsColumnFilters.kitProductCode}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="w-24"
                    />
                    <ColumnFilterHeader
                      columnKey="kitProductDescription"
                      label="Kit Comercial"
                      options={kitsColumnOptions.kitProductDescription || []}
                      selectedValues={kitsColumnFilters.kitProductDescription}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="min-w-[260px]"
                    />
                    <th className="py-3 px-4 text-right w-36">Quantidade</th>
                    <ColumnFilterHeader
                      columnKey="status"
                      label="Status Montagem"
                      options={kitsColumnOptions.status || []}
                      selectedValues={kitsColumnFilters.status}
                      onFilterChange={handleKitsColumnFilterChange}
                      align="center"
                      className="w-36"
                    />
                    <th className="py-3 px-4 text-center w-36">Tempo / Duração</th>
                    <ColumnFilterHeader
                      columnKey="assembledBy"
                      label="Responsável"
                      options={kitsColumnOptions.assembledBy || []}
                      selectedValues={kitsColumnFilters.assembledBy}
                      onFilterChange={handleKitsColumnFilterChange}
                      className="w-40"
                    />
                    <th className="py-3 px-4 min-w-[180px]">Observações / Espera</th>
                    <th className="py-3 px-3 text-center w-20">Ações</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {loadingKits ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center text-zinc-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                        <p className="text-xs font-semibold">Carregando ordens de kits...</p>
                      </td>
                    </tr>
                  ) : filteredKitOrders.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center text-zinc-400">
                        <Boxes className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                        <p className="text-sm font-semibold text-zinc-700">Nenhuma ordem de kit encontrada</p>
                        <p className="text-xs text-zinc-400 mt-1">As ordens geradas no módulo de montagem de kits aparecerão aqui automaticamente.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredKitOrders.map((order) => {
                      const isCompleted = order.status === 'COMPLETED';
                      const isProgress = order.status === 'IN_PROGRESS';
                      const isPending = order.status === 'PENDING';
                      const isEspera = (order.observations || '').toLowerCase().includes('espera');

                      return (
                        <tr
                          key={order.id}
                          className={cn(
                            "hover:bg-zinc-50/80 transition-colors",
                            isCompleted ? "bg-zinc-50/40" : isEspera ? "bg-orange-50/20" : "bg-white"
                          )}
                        >
                          {/* Nº Ordem */}
                          <td className="py-2.5 px-4 font-mono font-bold text-xs text-zinc-900 select-all whitespace-nowrap">
                            #{order.orderNumber}
                          </td>

                          {/* Data */}
                          <td className="py-2.5 px-4 text-zinc-650 font-medium whitespace-nowrap">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '—'}
                          </td>

                          {/* REF SKU */}
                          <td className="py-2.5 px-4 font-mono text-zinc-600 font-semibold whitespace-nowrap">
                            {order.kitProductCode}
                          </td>

                          {/* Kit Descrição */}
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-zinc-900 leading-snug">
                              {order.kitProductDescription}
                            </div>
                          </td>

                          {/* Quantidade Solicitada vs Montada */}
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="font-mono font-bold text-xs text-zinc-900">
                              {order.quantity} <span className="text-[10px] text-zinc-500">solicitado</span>
                            </div>
                            <div className="text-[11px] font-mono text-emerald-700 font-semibold">
                              {order.quantityAssembled ?? 0} <span className="text-[10px] text-zinc-400">montado</span>
                            </div>
                          </td>

                          {/* Status Montagem */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                              isCompleted
                                ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                : isProgress
                                  ? "bg-blue-100 text-blue-900 border-blue-300"
                                  : isPending
                                    ? "bg-amber-100 text-amber-900 border-amber-300"
                                    : "bg-zinc-100 text-zinc-700 border-zinc-300"
                            )}>
                              {isCompleted ? 'Concluído' : isProgress ? 'Em Montagem' : isPending ? 'Pendente' : order.status}
                            </span>
                          </td>

                          {/* Tempo / Duração */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            <div className={cn(
                              "font-mono font-bold text-xs",
                              isCompleted ? "text-emerald-800" : isProgress ? "text-blue-700" : "text-zinc-600"
                            )}>
                              {formatDurationBetween(order.createdAt, order.completedAt)}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-medium">
                              {isCompleted ? 'tempo total' : isProgress ? 'em montagem' : 'aguardando'}
                            </div>
                          </td>

                          {/* Responsável */}
                          <td className="py-2.5 px-4 text-xs text-zinc-700 font-medium whitespace-nowrap">
                            {order.assembledBy || '—'}
                          </td>

                          {/* Observações / Espera */}
                          <td className="py-2.5 px-4 text-xs text-zinc-600 truncate max-w-xs">
                            {order.observations || <span className="text-zinc-300 italic">—</span>}
                          </td>

                          {/* Ações */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedKitOrder(order)}
                              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé da tabela de Kits */}
            <div className="bg-zinc-50 px-4 py-2.5 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-500">
              <span>
                Exibindo <strong>{filteredKitOrders.length}</strong> de <strong>{kitOrders.length}</strong> ordens de kits
              </span>
              <span>
                Integrado diretamente com o módulo de <strong>Gerenciamento de Kits</strong>.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: QUADRO DE PESAGEM (HARMONIZADO COM O QUADRO DE ENVASE EM 3 COLUNAS) */}
      {currentTab === 'quadro_pesagem' && (
        <div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Quadro de Pesagem & Fracionamento",
            subtitle: "Fluxo sequencial e contínuo de fracionamento e pesagem de matérias-primas para formulação.",
            icon: <Scale className="h-6 w-6 text-amber-400" />,
            selectedDate: pesagemSelectedDate,
            setSelectedDate: setPesagemSelectedDate,
            showAllDates: pesagemShowAllDates,
            setShowAllDates: setPesagemShowAllDates,
            badgeCount: sortedLotesPesando.length + baseLotesFilaPesagem.length,
            badgeKg: sortedLotesPesando.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0) + baseLotesFilaPesagem.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0),
            onRefresh: fetchLotes,
            isRefreshing: loading,
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                  <span>Na Balança:</span>
                  <span className="font-mono">{sortedLotesPesando.length} lotes</span>
                  <span className="text-emerald-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-emerald-700">
                    {sortedLotesPesando.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Fila de Pesagem:</span>
                  <span className="font-mono text-zinc-900">{baseLotesFilaPesagem.length} lotes</span>
                  {lotesEsperaPesagemCount > 0 && (
                    <span className="text-xs font-semibold text-amber-700 font-mono">({lotesEsperaPesagemCount} em espera)</span>
                  )}
                </div>
              </>
            )
          })}

          {/* QUADRO COM 2 COLUNAS HARMONIZADAS: NA BALANÇA (50%) | FILA DE PESAGEM (50%) */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* COLUNA 1: NA BALANÇA / CABINE (PESAGEM ATIVA) */}
            <div className="col-span-12 xl:col-span-6 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-emerald-400" />
                  <span className="font-extrabold text-sm tracking-tight">Na Balança / Cabine</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                    {filteredLotesPesando.length}{pesagemSearch ? ` / ${sortedLotesPesando.length}` : ''}
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    {filteredLotesPesando.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5">
                {filteredLotesPesando.length === 0 ? (
                  <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Scale className="h-10 w-10 mx-auto mb-2 text-zinc-300" />
                    <p className="text-xs font-bold text-zinc-700">
                      {pesagemSearch ? `Nenhum lote na balança correspondente a "${pesagemSearch}"` : 'Nenhum lote pesando na cabine neste momento'}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {pesagemSearch ? 'Verifique a Fila de Pesagem ou adicione um lote digitado.' : 'Inicie a pesagem de um lote da fila ao lado para organizá-lo na sequência.'}
                    </p>
                  </div>
                ) : (
                  filteredLotesPesando.map((lote, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === filteredLotesPesando.length - 1;
                    const isSearched = !!(pesagemSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(pesagemSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(pesagemSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(pesagemSearch.trim().toLowerCase())
                    ));
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, pesagemSelectedDate, 'pesagem');
                    const etapaPesagem = getLoteEtapaStatus(lote, 'pesagem');
                    const isPesagemConcluida = pesagemConcluidosLotes.includes(lote.loteNumber) || etapaPesagem.isConcluido;

                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                          adiadoInfo
                            ? "border-rose-400 bg-rose-50/25 ring-1 ring-rose-300"
                            : isSearched
                              ? "border-emerald-500 ring-2 ring-emerald-300/80 bg-emerald-50/20"
                              : isPesagemConcluida
                                ? "border-emerald-400 bg-emerald-50/20 ring-1 ring-emerald-200"
                                : "border-emerald-200/80"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {idx + 1}º
                            </span>
                            {isPesagemConcluida ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 font-mono">
                                <Check className="h-3 w-3 text-emerald-700" />
                                Concluído
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Pesando
                              </span>
                            )}
                            {adiadoInfo && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                  title={adiadoInfo.isDestino ? `Lote transferido de ${formatDateOnly(adiadoInfo.dataOriginal)} para esta data` : `Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-rose-600" />
                                  {adiadoInfo.isDestino ? `Adiado de ${formatDateOnly(adiadoInfo.dataOriginal)}` : `Adiado p/ ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'pesagem', lote.productCode)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                            {isSearched && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono animate-pulse">
                                📍 Buscado
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleReorderPesagem(lote.loteNumber, 'up')}
                              disabled={isFirst}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-500 disabled:opacity-20 cursor-pointer"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderPesagem(lote.loteNumber, 'down')}
                              disabled={isLast}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-500 disabled:opacity-20 cursor-pointer"
                              title="Descer ordem"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-indigo-50 rounded text-zinc-400 hover:text-indigo-600 cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'pesagem' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, 'pesagem_ativa', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(lote, 'pesagem')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantity || 0).toLocaleString('pt-BR')} un
                          </span>
                        </div>

                        <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              const newConcluido = !isPesagemConcluida;
                              const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                              setPesagemConcluidosLotes(prev => {
                                const next = newConcluido
                                  ? Array.from(new Set([...prev, lote.loteNumber]))
                                  : prev.filter(x => x !== lote.loteNumber);
                                try { localStorage.setItem('natum_pesagem_concluidos_lotes', JSON.stringify(next)); } catch {}
                                return next;
                              });
                              try {
                                await saveEtapaStatus(lote.loteNumber, 'pesagem', newConcluido ? 'concluido' : 'ativo', null, null, null, responsibleName);
                              } catch (err) {
                                console.error('Erro salvando etapa pesagem:', err);
                              }
                              showToast(newConcluido ? `Pesagem do lote #${lote.loteNumber} concluída!` : `Pesagem do lote #${lote.loteNumber} em andamento na balança.`);
                            }}
                            className={cn(
                              "p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center justify-center flex-1",
                              isPesagemConcluida
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                            )}
                            title={isPesagemConcluida ? "Desmarcar realização da pesagem" : "Concluir pesagem (marcar como realizada)"}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setPesagemConcluidosLotes(prev => {
                                const next = prev.filter(x => x !== lote.loteNumber);
                                try { localStorage.setItem('natum_pesagem_concluidos_lotes', JSON.stringify(next)); } catch {}
                                return next;
                              });
                              setPesagemOrderOverrides(prev => {
                                const next = prev.filter(x => x !== lote.loteNumber);
                                try { localStorage.setItem('natum_pesagem_order_overrides', JSON.stringify(next)); } catch {}
                                return next;
                              });
                              const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                              await saveEtapaStatus(lote.loteNumber, 'pesagem', 'fila', null, null, null, responsibleName);
                              showToast(`Lote #${lote.loteNumber} retornado para a fila de pesagem.`);
                            }}
                            className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            title="Voltar para a Fila de Pesagem"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEsperaModal(lote.loteNumber, 'pesagem')}
                            className="p-1.5 bg-zinc-100 hover:bg-amber-100 hover:text-amber-900 text-zinc-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            title="Colocar pesagem em espera"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 2: FILA DE PESAGEM (INTEGRADA COM ITENS EM ESPERA) */}
            <div className="col-span-12 xl:col-span-6 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-amber-400" />
                  <span className="font-extrabold text-sm tracking-tight">Fila de Pesagem</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddLoteModal('pesagem')}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="Adicionar lote na Fila de Pesagem"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Adicionar Lote</span>
                  </button>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                    {lotesFilaPesagem.length}{pesagemSearch || pesagemFilaFilter === 'ESPERA' ? ` / ${baseLotesFilaPesagem.length}` : ''}
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    {lotesFilaPesagem.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
              </div>

              {/* Barra de Pesquisa, Seletor Rápido e Insumo Faltante */}
              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={pesagemSearch}
                    onChange={(e) => setPesagemSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(pesagemSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {pesagemSearch && (
                    <button
                      type="button"
                      onClick={() => setPesagemSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Seletor rápido: Todos na Fila vs Em Espera */}
                  <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-white shrink-0 text-xs">
                    <button
                      type="button"
                      onClick={() => setPesagemFilaFilter('TODOS')}
                      className={cn(
                        "px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1",
                        pesagemFilaFilter === 'TODOS'
                          ? "bg-zinc-900 text-white shadow-2xs"
                          : "text-zinc-600 hover:text-zinc-900"
                      )}
                    >
                      <span>Todos na Fila</span>
                      <span className="font-mono text-[10px] opacity-80">({baseLotesFilaPesagem.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPesagemFilaFilter('ESPERA')}
                      className={cn(
                        "px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1",
                        pesagemFilaFilter === 'ESPERA'
                          ? "bg-amber-600 text-white shadow-2xs"
                          : "text-amber-800 hover:text-amber-950 hover:bg-amber-50"
                      )}
                    >
                      <PauseCircle className="h-3 w-3" />
                      <span>Em Espera</span>
                      <span className="font-mono text-[10px] opacity-80">({lotesEsperaPesagemCount})</span>
                    </button>
                  </div>

                  {/* Filtro de Insumo Faltante */}
                  {insumosFaltantesList.length > 0 && (
                    <select
                      value={selectedInsumoFaltanteFilter}
                      onChange={(e) => setSelectedInsumoFaltanteFilter(e.target.value)}
                      className="flex-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-md px-2 py-1 text-[11px] font-bold focus:outline-none cursor-pointer truncate"
                      title="Filtrar por Insumo Faltante"
                    >
                      <option value="TODOS">⚠️ Insumo Faltante (Todos)</option>
                      {insumosFaltantesList.filter(i => i && i.codigo).map(i => (
                        <option key={i.codigo} value={i.codigo}>
                          [{i.codigo}] {i.descricao} ({i.count})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5">
                {lotesFilaPesagem.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">
                      {pesagemSearch ? `Nenhum lote na fila com a busca "${pesagemSearch}"` : 'Nenhum lote aguardando início de pesagem'}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1">Todos os lotes foram iniciados ou não há demandas de pesagem no momento.</p>
                  </div>
                ) : (
                  lotesFilaPesagem.map((lote, idx) => {
                    const esperaDetails = getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem);
                    const etapaPesagem = getLoteEtapaStatus(lote, 'pesagem');
                    const isEspera = esperaDetails.isEmEspera;
                    const isSearched = !!(pesagemSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(pesagemSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(pesagemSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(pesagemSearch.trim().toLowerCase())
                    ));
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, pesagemSelectedDate, 'pesagem');

                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                          adiadoInfo
                            ? "border-rose-400 bg-rose-50/25 ring-1 ring-rose-300"
                            : isSearched
                              ? "border-amber-500 ring-2 ring-amber-300/80 bg-amber-50/20"
                              : isEspera
                                ? "border-amber-300 bg-amber-50/15"
                                : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold text-zinc-900 flex-wrap">
                            <span>#{lote.loteNumber}</span>
                            <span className="text-[10px] text-zinc-400 font-normal">({lote.productCode})</span>
                            {isEspera ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1 font-sans">
                                <PauseCircle className="h-3 w-3 text-amber-600" />
                                {esperaDetails.etapaLabel || 'Pausado'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
                                Fila
                              </span>
                            )}
                            {adiadoInfo && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                  title={adiadoInfo.isDestino ? `Lote transferido de ${formatDateOnly(adiadoInfo.dataOriginal)} para esta data` : `Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-rose-600" />
                                  {adiadoInfo.isDestino ? `Adiado de ${formatDateOnly(adiadoInfo.dataOriginal)}` : `Adiado p/ ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'pesagem', lote.productCode)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                            {isSearched && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-600 text-white font-mono animate-pulse">
                                📍 Buscado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-indigo-50 rounded text-zinc-400 hover:text-indigo-600 cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'pesagem' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoverDaFila(lote.loteNumber, 'pesagem')}
                              className="p-1 hover:bg-rose-50 rounded text-zinc-400 hover:text-rose-600 cursor-pointer transition-colors"
                              title="Remover da Fila de Pesagem"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, isEspera ? 'pesagem_espera' : 'pesagem_fila', handleOpenEditTimestamps)}

                        {renderLoteEsperaBadge(lote)}
                        {!isEspera && renderLoteProblemaBanner(lote, 'pesagem')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantity || 0).toLocaleString('pt-BR')} un
                          </span>
                        </div>

                        <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between gap-1.5">
                          {isEspera ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleResumeLote(lote, esperaDetails.etapa || 'pesagem')}
                                className="flex-1 py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs flex items-center justify-center gap-1"
                                title="Retomar pesagem do lote"
                              >
                                <Play className="h-3.5 w-3.5 fill-white text-white" />
                                <span>Retomar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenPauseModal(lote, esperaDetails.etapa || 'pesagem')}
                                className="py-1.5 px-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                                title="Editar motivo da pausa"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  setPesagemOrderOverrides(prev => {
                                    if (prev.includes(lote.loteNumber)) return prev;
                                    const next = [...prev, lote.loteNumber];
                                    try { localStorage.setItem('natum_pesagem_order_overrides', JSON.stringify(next)); } catch {}
                                    return next;
                                  });
                                  const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                  const targetDate = pesagemSelectedDate || new Date().toISOString().split('T')[0];

                                  // Sincroniza a data do lote com a data da tela de pesagem selecionada
                                  if (parseLoteDateToIso(lote.dataPrevisao || '') !== targetDate) {
                                    setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { ...l, dataPrevisao: targetDate } : l));
                                    try {
                                      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
                                        method: 'POST',
                                        body: JSON.stringify({
                                          dataPrevisao: targetDate,
                                          updatedBy: responsibleName,
                                        })
                                      });
                                    } catch (e) {
                                      console.error('Erro ao sincronizar dataPrevisao ao iniciar pesagem:', e);
                                    }
                                  }

                                  await saveEtapaStatus(lote.loteNumber, 'pesagem', 'ativo', null, null, null, responsibleName);
                                  showToast(`Lote #${lote.loteNumber} iniciado na pesagem em ${formatDateOnly(targetDate)}!`);
                                }}
                                className="flex-1 py-1.5 px-2.5 bg-zinc-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs flex items-center justify-center gap-1"
                                title="Iniciar lote na Balança"
                              >
                                <Play className="h-3.5 w-3.5 fill-white text-white" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEsperaModal(lote.loteNumber, 'pesagem')}
                                className="py-1.5 px-2.5 bg-zinc-100 hover:bg-orange-100 hover:text-orange-900 text-zinc-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                                title="Pausar lote (ex: falta de insumo)"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: QUADRO DE PRODUÇÃO (QUADRO DE PRODUÇÃO + QUADRO DE CALDEIRA + FILA LADO A LADO) */}
      {currentTab === 'quadro_producao' && (
        <div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Quadro de Produção & Caldeira",
            subtitle: "Acompanhamento da produção nos reatores, processos térmicos na caldeira e fila de produção.",
            icon: <FlaskConical className="h-6 w-6 text-blue-400" />,
            selectedDate: producaoSelectedDate,
            setSelectedDate: setProducaoSelectedDate,
            showAllDates: producaoShowAllDates,
            setShowAllDates: setProducaoShowAllDates,
            badgeCount: lotesReatoresNormais.length + lotesCaldeira.length + lotesFilaProducao.length,
            badgeKg: lotesReatoresNormais.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0) + lotesCaldeira.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0) + lotesFilaProducao.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0),
            onRefresh: fetchLotes,
            isRefreshing: loading,
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-bold">
                  <FlaskConical className="h-3.5 w-3.5 text-blue-600" />
                  <span>Produção:</span>
                  <span className="font-mono">{lotesReatoresNormais.length} lotes</span>
                  <span className="text-blue-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-blue-700">
                    {lotesReatoresNormais.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold bg-orange-50 border-orange-200 text-orange-950">
                  <Flame className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />
                  <span>Caldeira:</span>
                  <span className="font-mono">{lotesCaldeira.length} lotes</span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Fila:</span>
                  <span className="font-mono text-zinc-900">{lotesFilaProducao.length} lotes</span>
                </div>
              </>
            ),
          })}

          {/* QUADRO PRINCIPAL COM 3 COLUNAS LADO A LADO: REATORES | CALDEIRA | FILA */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* COLUNA 1: QUADRO DE PRODUÇÃO (4 COLUNAS) */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-4 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-blue-400" />
                  <span className="font-extrabold text-sm tracking-tight">Quadro de Produção</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                    {filteredLotesReatoresNormais.length}{producaoSearch ? ` / ${lotesReatoresNormais.length}` : ''}
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    {filteredLotesReatoresNormais.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5">
                {filteredLotesReatoresNormais.length === 0 ? (
                  <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <FlaskConical className="h-10 w-10 mx-auto mb-2 text-zinc-300" />
                    <p className="text-sm font-bold text-zinc-700">
                      {producaoSearch ? `Nenhum lote nos reatores com "${producaoSearch}"` : 'Nenhum lote em fabricação nos reatores'}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Inicie a fabricação de um lote da fila ao lado para organizá-lo na sequência.
                    </p>
                  </div>
                ) : (
                  filteredLotesReatoresNormais.map((lote, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === filteredLotesReatoresNormais.length - 1;
                    const isSearched = !!(producaoSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(producaoSearch.trim().toLowerCase())
                    ));

                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, producaoSelectedDate, 'producao');
                    const etapaProducao = getLoteEtapaStatus(lote, 'producao');
                    const isProdConcluida = producaoConcluidosLotes.includes(lote.loteNumber) || etapaProducao.isConcluido;

                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className={cn(
                          "bg-white border rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2.5",
                          adiadoInfo
                            ? "border-rose-400 bg-rose-50/25 ring-1 ring-rose-300"
                            : isSearched
                              ? "border-blue-500 ring-2 ring-blue-300/80 bg-blue-50/20"
                              : isProdConcluida
                                ? "border-emerald-400 bg-emerald-50/20 ring-1 ring-emerald-200"
                                : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 pb-2 border-b border-zinc-100">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {idx + 1}º
                            </span>
                            {isProdConcluida ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 font-mono">
                                <Check className="h-3.5 w-3.5 text-emerald-700" />
                                Concluído
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-zinc-200">
                                Em Fabricação (Reator)
                              </span>
                            )}
                            {adiadoInfo && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                  title={adiadoInfo.isDestino ? `Lote transferido de ${formatDateOnly(adiadoInfo.dataOriginal)} para esta data` : `Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-rose-600" />
                                  {adiadoInfo.isDestino ? `Adiado de ${formatDateOnly(adiadoInfo.dataOriginal)}` : `Adiado p/ ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'producao', lote.productCode)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                            {isLoteParcial(lote) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-sans" title="Ordem com apontamento parcial pendente">
                                🌓 Parcial
                              </span>
                            )}
                            {isSearched && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white font-mono animate-pulse">
                                📍 Buscado
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleReorderProducao(lote.loteNumber, 'up')}
                              disabled={isFirst}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-500 disabled:opacity-20 cursor-pointer"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderProducao(lote.loteNumber, 'down')}
                              disabled={isLast}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-500 disabled:opacity-20 cursor-pointer"
                              title="Descer ordem"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setProducaoOrderOverrides(prev => {
                                  const next = prev.filter(x => x !== lote.loteNumber);
                                  try { localStorage.setItem('natum_producao_order_overrides', JSON.stringify(next)); } catch {}
                                  return next;
                                });
                                setProducaoConcluidosLotes(prev => {
                                  const next = prev.filter(x => x !== lote.loteNumber);
                                  try { localStorage.setItem('natum_producao_concluidos_lotes', JSON.stringify(next)); } catch {}
                                  return next;
                                });
                                const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                saveEtapaStatus(lote.loteNumber, 'producao', 'fila', null, null, null, responsibleName);
                                showToast(`Lote #${lote.loteNumber} retornado para a Fila de Produção.`);
                              }}
                              className="p-1 hover:bg-amber-50 rounded text-zinc-400 hover:text-amber-700 cursor-pointer"
                              title="Retornar lote para a Fila de Produção"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-indigo-50 rounded text-zinc-400 hover:text-indigo-600 cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'producao' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, 'reatores', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(lote, 'producao')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantity || 0).toLocaleString('pt-BR')} un
                          </span>
                        </div>

                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const newConcluido = !isProdConcluida;
                              if (newConcluido) {
                                setProducaoConcluidosLotes(prev => {
                                  const next = Array.from(new Set([...prev, lote.loteNumber]));
                                  try { localStorage.setItem('natum_producao_concluidos_lotes', JSON.stringify(next)); } catch {}
                                  return next;
                                });
                                const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                saveEtapaStatus(lote.loteNumber, 'producao', 'concluido', null, null, null, responsibleName);
                                showToast(`Fabricação do lote #${lote.loteNumber} concluída (marcada como realizada)!`);
                              } else {
                                setProducaoConcluidosLotes(prev => {
                                  const next = prev.filter(x => x !== lote.loteNumber);
                                  try { localStorage.setItem('natum_producao_concluidos_lotes', JSON.stringify(next)); } catch {}
                                  return next;
                                });
                                const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                saveEtapaStatus(lote.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
                                showToast(`Fabricação do lote #${lote.loteNumber} desmarcada (planejamento pendente).`);
                              }
                            }}
                            className={cn(
                              "py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center justify-center flex-1",
                              isProdConcluida
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                            )}
                            title={isProdConcluida ? "Desmarcar realização da fabricação" : "Concluir fabricação (marcar planejamento como realizado)"}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleCaldeiraLote(lote.loteNumber)}
                            className="py-1.5 px-2.5 bg-orange-50 hover:bg-orange-100 text-orange-950 border border-orange-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                            title="Mover para o Quadro de Caldeira ao lado"
                          >
                            <Flame className="h-4 w-4 text-orange-600 fill-orange-500" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEsperaModal(lote.loteNumber, 'producao')}
                            className="py-1.5 px-2.5 bg-zinc-100 hover:bg-orange-100 hover:text-orange-900 text-zinc-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                            title="Aguardar Laudo QC / Colocar em Espera na Produção"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 2: QUADRO DE CALDEIRA (4 COLUNAS - LADO A LADO) */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-4 bg-white border border-orange-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "p-1 rounded text-white",
                    caldeiraAtiva ? "bg-rose-600 animate-pulse" : "bg-white/20"
                  )}>
                    <Flame className="h-4 w-4 fill-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm tracking-tight">Quadro de Caldeira</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-black/30 text-white border border-white/10">
                    {filteredLotesCaldeira.length}{producaoSearch ? ` / ${lotesCaldeira.length}` : ''}
                  </span>
                  <span className="text-xs font-mono text-orange-100">
                    {filteredLotesCaldeira.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0).toLocaleString('pt-BR')} kg
                  </span>
                </div>
              </div>

              <div className="p-3 bg-orange-50/20 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5">
                {filteredLotesCaldeira.length === 0 ? (
                  <div className="py-20 text-center text-zinc-400 border border-dashed border-orange-200 rounded-xl p-4 bg-white shadow-2xs">
                    <Flame className="h-10 w-10 mx-auto mb-2 text-orange-400" />
                    <p className="text-sm font-bold text-zinc-800">
                      {producaoSearch ? `Nenhum lote na caldeira com "${producaoSearch}"` : 'Nenhum lote no Quadro de Caldeira'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                      Clique em <span className="font-bold text-orange-700">"+ Caldeira"</span> nos reatores ao lado ou na fila para alocar lotes aqui.
                    </p>
                  </div>
                ) : (
                  filteredLotesCaldeira.map((lote, idx) => {
                    const isSearched = !!(producaoSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(producaoSearch.trim().toLowerCase())
                    ));

                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, producaoSelectedDate, 'producao');
                    const etapaProducao = getLoteEtapaStatus(lote, 'producao');
                    const isCaldeiraConcluida = producaoConcluidosLotes.includes(lote.loteNumber) || etapaProducao.isConcluido;

                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className={cn(
                          "bg-white border-2 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2.5 ring-1",
                          adiadoInfo
                            ? "border-rose-400 bg-rose-50/25 ring-rose-300"
                            : isSearched
                              ? "border-orange-500 ring-orange-300 bg-orange-50/20"
                              : isCaldeiraConcluida
                                ? "border-emerald-400 bg-emerald-50/20 ring-emerald-200"
                                : "border-orange-200 ring-orange-100"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 pb-2 border-b border-orange-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-orange-600 text-white flex items-center gap-1">
                              <Flame className="h-3 w-3 fill-white text-white" />
                              <span>{idx + 1}º Caldeira</span>
                            </span>
                            {isCaldeiraConcluida ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 font-mono">
                                <Check className="h-3 w-3 text-emerald-700" />
                                Concluído
                              </span>
                            ) : caldeiraAtiva ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 animate-pulse flex items-center gap-1">
                                <Flame className="h-3 w-3 fill-rose-600 text-rose-600" />
                                Aquecendo
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-900 border border-orange-200">
                                Processo Térmico
                              </span>
                            )}
                            {adiadoInfo && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                  title={`Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-rose-600" />
                                  Adiado p/ {formatDateOnly(adiadoInfo.dataAdiadoPara)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'producao', lote.productCode)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                            {isLoteParcial(lote) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-sans" title="Ordem com apontamento parcial pendente">
                                🌓 Parcial
                              </span>
                            )}
                            {isSearched && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-600 text-white font-mono animate-pulse">
                                📍 Buscado
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-orange-100 rounded text-zinc-400 hover:text-indigo-600 cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'producao' })}
                              className="p-1 hover:bg-orange-50 rounded text-zinc-600 hover:text-orange-950 cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleCaldeiraLote(lote.loteNumber)}
                              className="p-1 text-zinc-500 hover:text-rose-700 hover:bg-rose-50 border border-zinc-200 rounded-md cursor-pointer transition-colors"
                              title="Remover da Caldeira e retornar para os Reatores"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, 'caldeira', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(lote, 'producao')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-orange-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantity || 0).toLocaleString('pt-BR')} un
                          </span>
                        </div>

                        <div className="pt-2 border-t border-orange-100 flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const newConcluido = !isCaldeiraConcluida;
                              if (newConcluido) {
                                setProducaoConcluidosLotes(prev => {
                                  const next = Array.from(new Set([...prev, lote.loteNumber]));
                                  try { localStorage.setItem('natum_producao_concluidos_lotes', JSON.stringify(next)); } catch {}
                                  return next;
                                });
                                const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                saveEtapaStatus(lote.loteNumber, 'producao', 'concluido', null, null, null, responsibleName);
                                showToast(`Processamento térmico do lote #${lote.loteNumber} concluído (marcado como realizado)!`);
                              } else {
                                setProducaoConcluidosLotes(prev => {
                                  const next = prev.filter(x => x !== lote.loteNumber);
                                  try { localStorage.setItem('natum_producao_concluidos_lotes', JSON.stringify(next)); } catch {}
                                  return next;
                                });
                                const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                saveEtapaStatus(lote.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
                                showToast(`Processamento térmico do lote #${lote.loteNumber} desmarcado (planejamento pendente).`);
                              }
                            }}
                            className={cn(
                              "py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center justify-center flex-1",
                              isCaldeiraConcluida
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                            )}
                            title={isCaldeiraConcluida ? "Desmarcar realização da caldeira" : "Concluir caldeira (marcar planejamento como realizado)"}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEsperaModal(lote.loteNumber, 'producao')}
                            className="py-1.5 px-2.5 bg-zinc-100 hover:bg-amber-100 hover:text-amber-900 text-zinc-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                            title="Colocar em Espera na Caldeira"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 3: FILA DE PRODUÇÃO (AGUARDANDO INÍCIO) */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-4 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-amber-400" />
                  <span className="font-extrabold text-sm tracking-tight">Fila de Produção</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddLoteModal('producao')}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="Adicionar lote na Fila de Produção"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Adicionar Lote</span>
                  </button>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-white">
                    {lotesFilaProducao.length}{producaoSearch || producaoFilaFilter === 'ESPERA' ? ` / ${baseLotesFilaProducao.length}` : ''}
                  </span>
                </div>
              </div>

              {/* Barra de Pesquisa e Lotes Externos na Fila de Produção */}
              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={producaoSearch}
                    onChange={(e) => setProducaoSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(producaoSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {producaoSearch && (
                    <button
                      type="button"
                      onClick={() => setProducaoSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Seletor rápido: Todos na Fila vs Em Espera */}
                  <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-white shrink-0 text-xs">
                    <button
                      type="button"
                      onClick={() => setProducaoFilaFilter('TODOS')}
                      className={cn(
                        "px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1",
                        producaoFilaFilter === 'TODOS'
                          ? "bg-zinc-900 text-white shadow-2xs"
                          : "text-zinc-600 hover:text-zinc-900"
                      )}
                    >
                      <span>Todos na Fila</span>
                      <span className="font-mono text-[10px] opacity-80">({baseLotesFilaProducao.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProducaoFilaFilter('ESPERA')}
                      className={cn(
                        "px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1",
                        producaoFilaFilter === 'ESPERA'
                          ? "bg-amber-600 text-white shadow-2xs"
                          : "text-amber-800 hover:text-amber-950 hover:bg-amber-50"
                      )}
                    >
                      <PauseCircle className="h-3 w-3" />
                      <span>Em Espera</span>
                      <span className="font-mono text-[10px] opacity-80">({lotesEsperaProducaoCount})</span>
                    </button>
                  </div>

                  {/* Filtro de Insumo Faltante */}
                  {insumosFaltantesList.length > 0 && (
                    <select
                      value={selectedInsumoFaltanteFilter}
                      onChange={(e) => setSelectedInsumoFaltanteFilter(e.target.value)}
                      className="flex-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-md px-2 py-1 text-[11px] font-bold focus:outline-none cursor-pointer truncate"
                      title="Filtrar por Insumo Faltante"
                    >
                      <option value="TODOS">⚠️ Insumo Faltante (Todos)</option>
                      {insumosFaltantesList.filter(i => i && i.codigo).map(i => (
                        <option key={i.codigo} value={i.codigo}>
                          [{i.codigo}] {i.descricao} ({i.count})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5">
                {lotesFilaProducao.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">
                      {producaoFilaFilter === 'ESPERA'
                        ? 'Nenhum lote pausado / em espera na produção'
                        : producaoSearch
                          ? `Nenhum lote na fila com a busca "${producaoSearch}"`
                          : 'Nenhum lote aguardando fabricação'}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {producaoFilaFilter === 'ESPERA'
                        ? 'Todos os lotes da fila de produção estão liberados para fabricação.'
                        : 'Conclua a pesagem de lotes na aba Quadro de Pesagem para que eles apareçam aqui.'}
                    </p>
                  </div>
                ) : (
                  lotesFilaProducao.map((lote, idx) => {
                    const esperaDetails = getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem);
                    const etapaProducao = getLoteEtapaStatus(lote, 'producao');
                    const isEspera = esperaDetails.isEmEspera;
                    const isSearched = !!(producaoSearch.trim() && (
                      lote.loteNumber.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productCode?.toLowerCase().includes(producaoSearch.trim().toLowerCase()) ||
                      lote.productDescription?.toLowerCase().includes(producaoSearch.trim().toLowerCase())
                    ));

                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const adiadoInfo = getLoteAdiadoInfo(lote.loteNumber, producaoSelectedDate, 'producao');

                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                          adiadoInfo
                            ? "border-rose-400 bg-rose-50/25 ring-1 ring-rose-300"
                            : isSearched
                              ? "border-amber-500 ring-2 ring-amber-300/80 bg-amber-50/20"
                              : isEspera
                                ? "border-amber-300 bg-amber-50/15"
                                : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold text-zinc-900 flex-wrap">
                            <span>#{lote.loteNumber}</span>
                            <span className="text-[10px] text-zinc-400 font-normal">({lote.productCode})</span>
                            {isEspera ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1 font-sans">
                                <PauseCircle className="h-3 w-3 text-amber-600" />
                                {esperaDetails.etapaLabel || 'Pausado'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                                Fila
                              </span>
                            )}
                            {adiadoInfo && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                  title={adiadoInfo.isDestino ? `Lote transferido de ${formatDateOnly(adiadoInfo.dataOriginal)} para esta data` : `Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-rose-600" />
                                  {adiadoInfo.isDestino ? `Adiado de ${formatDateOnly(adiadoInfo.dataOriginal)}` : `Adiado p/ ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(lote.loteNumber, adiadoInfo.dataOriginal, 'producao', lote.productCode)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                            {isLoteParcial(lote) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-sans" title="Ordem com apontamento parcial pendente">
                                🌓 Parcial
                              </span>
                            )}
                            {isSearched && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-600 text-white font-mono animate-pulse">
                                📍 Buscado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-indigo-50 rounded text-zinc-400 hover:text-indigo-600 cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'producao' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoverDaFila(lote.loteNumber, 'producao')}
                              className="p-1 hover:bg-rose-50 rounded text-zinc-400 hover:text-rose-600 cursor-pointer transition-colors"
                              title="Remover da Fila de Produção"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {/* Bloco de Datas do Card */}
                        {renderCardTimelineDates(lote, 'producao_fila', handleOpenEditTimestamps)}

                        {renderLoteEsperaBadge(lote)}
                        {!isEspera && renderLoteProblemaBanner(lote, 'producao')}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantity || 0).toLocaleString('pt-BR')} un
                          </span>
                        </div>

                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-1.5">
                          {isEspera ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleResumeLote(lote, esperaDetails.etapa || 'producao')}
                                className="flex-1 py-1.5 px-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs flex items-center justify-center gap-1"
                                title="Retomar lote nos Reatores"
                              >
                                <Play className="h-3.5 w-3.5 fill-white text-white" />
                                <span>Retomar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleMoverParaCaldeira(lote.loteNumber);
                                  handleResumeLote(lote, 'producao');
                                }}
                                className="py-1.5 px-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer text-center shadow-2xs flex items-center justify-center"
                                title="Retomar diretamente no Quadro de Caldeira"
                              >
                                <Flame className="h-3.5 w-3.5 fill-white text-white" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenPauseModal(lote, 'producao')}
                                className="py-1.5 px-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                                title="Editar motivo da pausa na Produção"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  setProducaoOrderOverrides(prev => {
                                    if (prev.includes(lote.loteNumber)) return prev;
                                    const next = [...prev, lote.loteNumber];
                                    try { localStorage.setItem('natum_producao_order_overrides', JSON.stringify(next)); } catch {}
                                    return next;
                                  });
                                  const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
                                  const targetDate = producaoSelectedDate || new Date().toISOString().split('T')[0];

                                  // Sincroniza a data do lote com a data da tela de produção selecionada
                                  if (parseLoteDateToIso(lote.dataPrevisao || '') !== targetDate) {
                                    setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { ...l, dataPrevisao: targetDate } : l));
                                    try {
                                      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
                                        method: 'POST',
                                        body: JSON.stringify({
                                          dataPrevisao: targetDate,
                                          updatedBy: responsibleName,
                                        })
                                      });
                                    } catch (e) {
                                      console.error('Erro ao sincronizar dataPrevisao ao iniciar produção:', e);
                                    }
                                  }

                                  await saveEtapaStatus(lote.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
                                  showToast(`Lote #${lote.loteNumber} iniciado nos reatores em ${formatDateOnly(targetDate)}!`);
                                }}
                                className="flex-1 py-1.5 px-2 bg-zinc-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs flex items-center justify-center"
                                title="Iniciar Fabricação nos Reatores"
                              >
                                <Play className="h-3.5 w-3.5 fill-white text-white" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const targetDate = producaoSelectedDate || new Date().toISOString().split('T')[0];
                                  const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

                                  if (parseLoteDateToIso(lote.dataPrevisao || '') !== targetDate) {
                                    setLotes(prev => prev.map(l => l.loteNumber === lote.loteNumber ? { ...l, dataPrevisao: targetDate } : l));
                                    try {
                                      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/previsao`, {
                                        method: 'POST',
                                        body: JSON.stringify({
                                          dataPrevisao: targetDate,
                                          updatedBy: responsibleName,
                                        })
                                      });
                                    } catch (e) {
                                      console.error('Erro ao sincronizar dataPrevisao para Caldeira:', e);
                                    }
                                  }

                                  await handleMoverParaCaldeira(lote.loteNumber);
                                  setProducaoOrderOverrides(prev => {
                                    if (prev.includes(lote.loteNumber)) return prev;
                                    const next = [...prev, lote.loteNumber];
                                    try { localStorage.setItem('natum_producao_order_overrides', JSON.stringify(next)); } catch {}
                                    return next;
                                  });
                                  await saveEtapaStatus(lote.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
                                  showToast(`Lote #${lote.loteNumber} alocado no Quadro de Caldeira em ${formatDateOnly(targetDate)}!`);
                                }}
                                className="flex-1 py-1.5 px-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer text-center shadow-2xs flex items-center justify-center"
                                title="Iniciar processo térmico diretamente no Quadro de Caldeira"
                              >
                                <Flame className="h-3.5 w-3.5 fill-white text-white" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEsperaModal(lote.loteNumber, 'producao')}
                                className="py-1.5 px-2.5 bg-zinc-100 hover:bg-orange-100 hover:text-orange-900 text-zinc-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
                                title="Pausar lote na produção (ex: falta de insumo)"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: QUADRO DE ROTULAGEM */}
      {currentTab === 'quadro_rotulagem' && (
        <div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Quadro de Rotulagem",
            subtitle: "Organização e sequenciamento de rotulagem (Máquina e Manual) para lotes liberados e em produção.",
            icon: <Tag className="h-6 w-6 text-emerald-400" />,
            selectedDate: rotulagemSelectedDate,
            setSelectedDate: setRotulagemSelectedDate,
            showAllDates: rotulagemShowAllDates,
            setShowAllDates: setRotulagemShowAllDates,
            badgeCount: rotulagemDayStats.totalCount,
            badgeCountLabel: "programado(s)",
            badgeUn: rotulagemDayStats.totalUn,
            onRefresh: () => {
              fetchLotes();
              fetchProgramacaoRotulagem('TODOS');
            },
            isRefreshing: loading || loadingRotulagem,
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Máquina:</span>
                  <span className="font-mono">{rotulagemDayStats.maquinaCount} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">{Number(rotulagemDayStats.maquinaUn).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Manual:</span>
                  <span className="font-mono">{rotulagemDayStats.manualCount} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">{Number(rotulagemDayStats.manualUn).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                  <span>Disponíveis:</span>
                  <span className="font-mono">{lotesParaRotulagem.length} lotes</span>
                </div>
              </>
            )
          })}

          {/* GRID COM QUADROS VISUAIS À ESQUERDA E ESCOLHA DE LOTES À DIREITA */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* QUADROS VISUAIS (ESQUERDA - COL-SPAN-8): MÁQUINA E MANUAL */}
            <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* COLUNA 1: ROTULAGEM MÁQUINA */}
              <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
                <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-emerald-400" />
                    <span className="font-extrabold text-sm tracking-tight">Rotulagem Máquina</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                      {rotulagemMaquinaItems.length}
                    </span>
                    <span className="text-xs font-mono text-zinc-300">
                      {Number(rotulagemDayStats.maquinaUn).toLocaleString('pt-BR')} un
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5">
                  {filteredRotulagemMaquinaItems.length === 0 ? (
                    <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                      <Tag className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                      <p className="text-xs font-bold text-zinc-700">Nenhum lote na Rotulagem Máquina</p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {rotulagemSearch ? `Nenhum lote correspondente à busca "${rotulagemSearch}".` : 'Selecione um lote da coluna ao lado e clique em "+ Máquina".'}
                      </p>
                    </div>
                  ) : (
                    filteredRotulagemMaquinaItems.map((item, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === filteredRotulagemMaquinaItems.length - 1;
                      const isConcluido = item.statusRotulagem === 'CONCLUIDO';
                      const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, rotulagemSelectedDate, 'rotulagem') : null;

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                            adiadoInfo
                              ? "border-rose-400 bg-rose-50/25 ring-1 ring-rose-300"
                              : item.statusRotulagem === 'EM_ROTULAGEM'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/20"
                                : isConcluido
                                  ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                                  : "border-zinc-200"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-zinc-900 text-white">
                                {item.ordem}º
                              </span>
                              {adiadoInfo && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                    title={adiadoInfo.isDestino ? `Lote transferido de ${formatDateOnly(adiadoInfo.dataOriginal)} para esta data` : `Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                  >
                                    <FastForward className="h-3 w-3 text-rose-600" />
                                    {adiadoInfo.isDestino ? `Adiado de ${formatDateOnly(adiadoInfo.dataOriginal)}` : `Adiado p/ ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'rotulagem', item.productCode)}
                                    className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                    title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                  >
                                    <Undo2 className="h-2.5 w-2.5" />
                                    <span>Desfazer</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleReorderRotulagem(item.id, 'MAQUINA', 'up')}
                                disabled={isFirst}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                                title="Subir ordem"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReorderRotulagem(item.id, 'MAQUINA', 'down')}
                                disabled={isLast}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                                title="Descer ordem"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const realLote = getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber);
                                  handleOpenAdiarModal({
                                    loteNumber: item.loteNumber,
                                    productCode: item.productCode,
                                    productDescription: item.productDescription,
                                    currentDate: item.dataProgramada || rotulagemSelectedDate || getCurrentBoardDate(),
                                    etapaLabel: 'Rotulagem Automática',
                                    origem: 'rotulagem',
                                    realLote,
                                  });
                                }}
                                className="p-1 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                                title="Adiar lote (selecionar nova data)"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'rotulagem' })}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer"
                                title="Ver Detalhes do Item"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveRotulagem(item.id)}
                                className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                title="Remover da rotulagem"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                          <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                            <span className="font-bold text-zinc-900">
                              {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">un</span>
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                            </span>
                          </div>

                          {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'rotulagem', handleOpenEditTimestamps)}

                          {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'rotulagem')}

                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                            <button
                              type="button"
                              onClick={() => handleMoveTipoRotulagem(item, 'MANUAL')}
                              className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Rotulagem Manual"
                            >
                              Man
                            </button>

                            <button
                              type="button"
                              onClick={() => handleChangeStatusRotulagem(item.id, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão da Rotulagem" : "Concluir Rotulagem"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* COLUNA 2: ROTULAGEM MANUAL */}
              <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
                <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-sky-400" />
                    <span className="font-extrabold text-sm tracking-tight">Rotulagem Manual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                      {filteredRotulagemManualItems.length}
                    </span>
                    <span className="text-xs font-mono text-zinc-300">
                      {Number(rotulagemDayStats.manualUn).toLocaleString('pt-BR')} un
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-zinc-50/50 min-h-[480px] max-h-[750px] overflow-y-auto space-y-2.5">
                  {filteredRotulagemManualItems.length === 0 ? (
                    <div className="py-20 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                      <Tag className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                      <p className="text-xs font-bold text-zinc-700">Nenhum lote na Rotulagem Manual</p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {rotulagemSearch ? `Nenhum lote correspondente à busca "${rotulagemSearch}".` : 'Selecione um lote da coluna ao lado e clique em "+ Manual".'}
                      </p>
                    </div>
                  ) : (
                    filteredRotulagemManualItems.map((item, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === filteredRotulagemManualItems.length - 1;
                      const isConcluido = item.statusRotulagem === 'CONCLUIDO';
                      const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, rotulagemSelectedDate, 'rotulagem') : null;

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                            adiadoInfo
                              ? "border-rose-400 bg-rose-50/25 ring-1 ring-rose-300"
                              : item.statusRotulagem === 'EM_ROTULAGEM'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/20"
                                : isConcluido
                                  ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                                  : "border-zinc-200"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-zinc-900 text-white">
                                {item.ordem}º
                              </span>
                              {adiadoInfo && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                    title={adiadoInfo.isDestino ? `Lote transferido de ${formatDateOnly(adiadoInfo.dataOriginal)} para esta data` : `Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                  >
                                    <FastForward className="h-3 w-3 text-rose-600" />
                                    {adiadoInfo.isDestino ? `Adiado de ${formatDateOnly(adiadoInfo.dataOriginal)}` : `Adiado p/ ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'rotulagem', item.productCode)}
                                    className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                    title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                  >
                                    <Undo2 className="h-2.5 w-2.5" />
                                    <span>Desfazer</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleReorderRotulagem(item.id, 'MANUAL', 'up')}
                                disabled={isFirst}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                                title="Subir ordem"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReorderRotulagem(item.id, 'MANUAL', 'down')}
                                disabled={isLast}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                                title="Descer ordem"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const realLote = getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber);
                                  handleOpenAdiarModal({
                                    loteNumber: item.loteNumber,
                                    productCode: item.productCode,
                                    productDescription: item.productDescription,
                                    currentDate: item.dataProgramada || rotulagemSelectedDate || getCurrentBoardDate(),
                                    etapaLabel: 'Rotulagem Manual',
                                    origem: 'rotulagem',
                                    realLote,
                                  });
                                }}
                                className="p-1 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                                title="Adiar lote (selecionar nova data)"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'rotulagem' })}
                                className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer"
                                title="Ver Detalhes do Item"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveRotulagem(item.id)}
                                className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                title="Remover da rotulagem"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                          <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                            <span className="font-bold text-zinc-900">
                              {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">un</span>
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                            </span>
                          </div>

                          {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'rotulagem', handleOpenEditTimestamps)}

                          {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'rotulagem')}

                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                            <button
                              type="button"
                              onClick={() => handleMoveTipoRotulagem(item, 'MAQUINA')}
                              className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Rotulagem Máquina"
                            >
                              Máq
                            </button>

                            <button
                              type="button"
                              onClick={() => handleChangeStatusRotulagem(item.id, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão da Rotulagem" : "Concluir Rotulagem"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* COLUNA DE ESCOLHA (DIREITA - COL-SPAN-4): LOTES DISPONÍVEIS ENTRE PESAGEM E PRODUÇÃO */}
            <div className="col-span-12 lg:col-span-4 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-amber-400" />
                  <span className="font-extrabold text-sm tracking-tight">Lotes Disponíveis para Rotulagem</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddLoteModal('rotulagem')}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="Adicionar lote nos Lotes Disponíveis para Rotulagem"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Adicionar Lote</span>
                  </button>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {lotesParaRotulagem.length}
                  </span>
                </div>
              </div>

              {/* Caixa de Busca Embutida na Coluna de Escolha (Molde Envase) */}
              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={rotulagemSearch}
                    onChange={e => setRotulagemSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(rotulagemSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {rotulagemSearch && (
                    <button
                      type="button"
                      onClick={() => setRotulagemSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { setRotulagemScopeFilter('LIBERADOS'); setRotulagemOnlyProblemas(false); }}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors",
                      rotulagemScopeFilter === 'LIBERADOS' && !rotulagemOnlyProblemas ? "bg-white text-zinc-900 shadow-2xs border border-zinc-300" : "text-zinc-500 hover:text-zinc-800"
                    )}
                    title="Lotes já produzidos e liberados para rotulagem"
                  >
                    Liberados ({lotesLiberadosParaAcabamento.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRotulagemScopeFilter('TODOS'); setRotulagemOnlyProblemas(false); }}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors",
                      rotulagemScopeFilter === 'TODOS' && !rotulagemOnlyProblemas ? "bg-white text-zinc-900 shadow-2xs border border-zinc-300" : "text-zinc-500 hover:text-zinc-800"
                    )}
                    title="Todas as ordens abertas da fábrica no Hub"
                  >
                    Todas Abertas ({todasOrdensAbertasFabrica.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotulagemOnlyProblemas(true)}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1",
                      rotulagemOnlyProblemas ? "bg-amber-500 text-white shadow-2xs" : "text-amber-700 hover:bg-amber-100/80"
                    )}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    <span>Falta / Problemas ({countRotulagemProblemas})</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-zinc-50/30 min-h-[460px] max-h-[710px] overflow-y-auto space-y-2.5">
                {lotesParaRotulagem.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote disponível</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {rotulagemSearch ? `Nenhum lote correspondente à busca "${rotulagemSearch}".` : "Não há lotes entre as etapas de Pesagem e Produção no momento."}
                    </p>
                  </div>
                ) : (
                  lotesParaRotulagem.map((lote, idx) => {
                    const scheduledMaq = programacaoRotulagem.find(it => 
                      it.loteNumber === lote.loteNumber && 
                      it.tipo === 'MAQUINA' && 
                      (!it.productCode || !lote.productCode || it.productCode === lote.productCode)
                    );
                    const scheduledMan = programacaoRotulagem.find(it => 
                      it.loteNumber === lote.loteNumber && 
                      it.tipo === 'MANUAL' && 
                      (!it.productCode || !lote.productCode || it.productCode === lote.productCode)
                    );
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const temProblema = hasLoteProblemaOuPausa(lote, null, 'rotulagem');

                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                          temProblema ? "border-amber-400 bg-amber-50/20 ring-1 ring-amber-300" :
                          (scheduledMaq || scheduledMan) ? "border-zinc-400 bg-zinc-50/50" : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold text-zinc-900 flex-wrap">
                            <span>#{lote.loteNumber}</span>
                            <span className="text-[10px] text-zinc-400 font-normal">({lote.productCode})</span>
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                            {isLoteParcial(lote) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-sans" title="Ordem com apontamento parcial pendente">
                                🌓 Parcial
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenPauseModal(lote, 'rotulagem')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-colors",
                                temProblema
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : "text-zinc-400 hover:bg-amber-50 hover:text-amber-600"
                              )}
                              title="Informar falta de rótulo / insumo ou pausar lote na Rotulagem"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-indigo-50 rounded text-zinc-400 hover:text-indigo-600 cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'rotulagem' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoverDaFila(lote.loteNumber, 'rotulagem')}
                              className="p-1 hover:bg-rose-50 rounded text-zinc-400 hover:text-rose-600 cursor-pointer transition-colors"
                              title="Remover da Fila de Rotulagem"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-zinc-200 font-mono">
                              {getEffectiveStatus(lote)}
                            </span>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantity || 0).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lote, 'rotulagem', handleOpenEditTimestamps)}

                        {renderLoteEsperaBadge(lote)}
                        {!getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem).isEmEspera && renderLoteProblemaBanner(lote, 'rotulagem')}

                        <div className="pt-2 border-t border-zinc-100 space-y-1.5">
                          {(scheduledMaq || scheduledMan) && (
                            <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold">
                              {scheduledMaq && (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                                  ✓ Na Máquina ({scheduledMaq.ordem}º)
                                </span>
                              )}
                              {scheduledMan && (
                                <span className="px-1.5 py-0.5 bg-sky-50 text-sky-800 border border-sky-200 rounded">
                                  ✓ No Manual ({scheduledMan.ordem}º)
                                </span>
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEncaixarRotulagem(lote, 'MAQUINA')}
                              disabled={!!scheduledMaq}
                              className="py-1 px-2 bg-zinc-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              + Máq
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEncaixarRotulagem(lote, 'MANUAL')}
                              disabled={!!scheduledMan}
                              className="py-1 px-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 rounded-lg text-xs font-bold transition-colors cursor-pointer text-center disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              + Man
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: QUADRO DE PROGRAMAÇÃO DE ENVASE */}
      {currentTab === 'quadro_envase' && (
        <div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Programação de Linhas de Envase",
            subtitle: "Fluxo contínuo de lotes em andamento nas esteiras e linhas operacionais.",
            icon: <Droplets className="h-5 w-5 text-indigo-400" />,
            selectedDate: envaseSelectedDate,
            setSelectedDate: setEnvaseSelectedDate,
            showAllDates: envaseShowAllDates,
            setShowAllDates: setEnvaseShowAllDates,
            badgeCount: envaseDayStats.totalCount,
            badgeKg: envaseDayStats.totalKg,
            onRefresh: () => fetchProgramacaoEnvase('TODOS'),
            isRefreshing: loadingEnvase,
            actionButtons: (
              <button
                type="button"
                onClick={handleOpenRelatorioEnvaseModal}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-extrabold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                title="Abrir e imprimir relatório de envase para um período personalizado"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimir Relatório de Envase</span>
              </button>
            ),
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-bold">
                  <span>Linha 1:</span>
                  <span className="font-mono">{envaseDayStats.linha1Count} lotes</span>
                  <span className="text-blue-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-blue-700">{Number(envaseDayStats.linha1Un).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold">
                  <span>Linha 2:</span>
                  <span className="font-mono">{envaseDayStats.linha2Count} lotes</span>
                  <span className="text-indigo-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-indigo-700">{Number(envaseDayStats.linha2Un).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                  <span>Linha 3 (Óleos):</span>
                  <span className="font-mono">{envaseDayStats.linha3Count} lotes</span>
                  <span className="text-amber-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-amber-700">{Number(envaseDayStats.linha3Un).toLocaleString('pt-BR')} un</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Total:</span>
                  <span className="font-mono">{envaseDayStats.totalCount} lotes</span>
                  <span className="text-zinc-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-zinc-600">{Number(envaseDayStats.totalKg).toLocaleString('pt-BR')} kg</span>
                </div>
              </>
            )
          })}

          {/* QUADRO COM 4 COLUNAS: LINHA 1 | LINHA 2 | LINHA 3 (ÓLEOS) | LIBERADOS PARA ENVASE */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* COLUNA LINHA 1 */}
            <div className="col-span-12 xl:col-span-3 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold tracking-tight">Linha 1 de Envase</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {envaseLinha1Items.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {Number(envaseDayStats.linha1Un).toLocaleString('pt-BR')} un
                </div>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5">
                {loadingEnvase ? (
                  <div className="py-16 text-center text-zinc-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs font-semibold">Carregando Linha 1...</p>
                  </div>
                ) : filteredEnvaseLinha1Items.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Layers className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote na Linha 1 hoje</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {encaixeSearch ? `Nenhum lote correspondente à busca "${encaixeSearch}".` : 'Selecione um produto da lista de Liberados e clique em "+ Linha 1".'}
                    </p>
                  </div>
                ) : (
                  filteredEnvaseLinha1Items.map((item, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === filteredEnvaseLinha1Items.length - 1;
                    const isConcluido = item.statusEnvase === 'CONCLUIDO';
                    const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, envaseSelectedDate, 'envase') : null;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                          adiadoInfo
                            ? "border-rose-400 bg-rose-50/25 ring-1 ring-rose-300"
                            : item.statusEnvase === 'EM_ENVASE'
                              ? "border-purple-400 ring-1 ring-purple-300 bg-purple-50/20"
                              : item.statusEnvase === 'EM_ESPERA'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/30"
                                : isConcluido
                                  ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                                  : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {item.ordem}º
                            </span>
                            {adiadoInfo && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                  title={adiadoInfo.isDestino ? `Lote transferido de ${formatDateOnly(adiadoInfo.dataOriginal)} para esta data` : `Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-rose-600" />
                                  {adiadoInfo.isDestino ? `Adiado de ${formatDateOnly(adiadoInfo.dataOriginal)}` : `Adiado p/ ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'envase', item.productCode)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleReorderEnvase(item.id, 'Linha 1', 'up')}
                              disabled={isFirst}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderEnvase(item.id, 'Linha 1', 'down')}
                              disabled={isLast}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                              title="Descer ordem"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const realLote = getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber);
                                handleOpenAdiarModal({
                                  loteNumber: item.loteNumber,
                                  productCode: item.productCode,
                                  productDescription: item.productDescription,
                                  currentDate: item.dataProgramada || envaseSelectedDate || getCurrentBoardDate(),
                                  etapaLabel: 'Linha 1 de Envase',
                                  origem: 'envase_linha',
                                  realLote,
                                  envaseItem: item,
                                });
                              }}
                              className="p-1 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'envase' })}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEnvase(item.id, item.loteNumber)}
                              className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              title="Remover do quadro"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                        {renderFiscoQuimicaBadge(item.loteNumber)}

                        {(item.statusEnvase === 'EM_ESPERA' || item.observacaoEnvase) && (
                          <div
                            onClick={() => handleOpenEnvaseEspera(item)}
                            className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 text-[11px] font-semibold flex items-center justify-between gap-1 cursor-pointer hover:bg-amber-100 transition-colors"
                            title="Lote em espera no envase. Clique para alterar observação."
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <PauseCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span className="truncate">⏸️ {item.observacaoEnvase || 'Em Espera'}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'envase_linha', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'envase')}

                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 2')}
                              className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-indigo-50 text-zinc-700 hover:text-indigo-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 2"
                            >
                              L2
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 3')}
                              className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 3 (Óleos)"
                            >
                              L3
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {item.statusEnvase === 'EM_ESPERA' ? (
                              <button
                                type="button"
                                onClick={() => handleChangeStatusEnvase(item, 'EM_ENVASE')}
                                className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer transition-colors"
                                title="Retomar envase"
                              >
                                <Play className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenEnvaseEspera(item)}
                                className="p-1 text-zinc-400 hover:text-amber-700 hover:bg-amber-50 rounded cursor-pointer transition-colors"
                                title="Pausar / Colocar em espera"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleChangeStatusEnvase(item, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão do Envase" : "Concluir Envase"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA LINHA 2 */}
            <div className="col-span-12 xl:col-span-3 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold tracking-tight">Linha 2 de Envase</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {envaseLinha2Items.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {Number(envaseDayStats.linha2Un).toLocaleString('pt-BR')} un
                </div>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5">
                {loadingEnvase ? (
                  <div className="py-16 text-center text-zinc-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs font-semibold">Carregando Linha 2...</p>
                  </div>
                ) : filteredEnvaseLinha2Items.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Layers className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote na Linha 2 hoje</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {encaixeSearch ? `Nenhum lote correspondente à busca "${encaixeSearch}".` : 'Selecione um produto da lista de Liberados e clique em "+ Linha 2".'}
                    </p>
                  </div>
                ) : (
                  filteredEnvaseLinha2Items.map((item, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === envaseLinha2Items.length - 1;
                    const isConcluido = item.statusEnvase === 'CONCLUIDO';
                    const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, envaseSelectedDate, 'envase') : null;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                          adiadoInfo
                            ? "border-rose-400 bg-rose-50/25 ring-1 ring-rose-300"
                            : item.statusEnvase === 'EM_ENVASE'
                              ? "border-purple-400 ring-1 ring-purple-300 bg-purple-50/20"
                              : item.statusEnvase === 'EM_ESPERA'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/30"
                                : isConcluido
                                  ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                                  : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {item.ordem}º
                            </span>
                            {adiadoInfo && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                  title={adiadoInfo.isDestino ? `Lote transferido de ${formatDateOnly(adiadoInfo.dataOriginal)} para esta data` : `Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-rose-600" />
                                  {adiadoInfo.isDestino ? `Adiado de ${formatDateOnly(adiadoInfo.dataOriginal)}` : `Adiado p/ ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'envase', item.productCode)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleReorderEnvase(item.id, 'Linha 2', 'up')}
                              disabled={isFirst}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderEnvase(item.id, 'Linha 2', 'down')}
                              disabled={isLast}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                              title="Descer ordem"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const realLote = getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber);
                                handleOpenAdiarModal({
                                  loteNumber: item.loteNumber,
                                  productCode: item.productCode,
                                  productDescription: item.productDescription,
                                  currentDate: item.dataProgramada || envaseSelectedDate || getCurrentBoardDate(),
                                  etapaLabel: 'Linha 2 de Envase',
                                  origem: 'envase_linha',
                                  realLote,
                                  envaseItem: item,
                                });
                              }}
                              className="p-1 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'envase' })}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEnvase(item.id, item.loteNumber)}
                              className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              title="Remover do quadro"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                        {renderFiscoQuimicaBadge(item.loteNumber)}

                        {(item.statusEnvase === 'EM_ESPERA' || item.observacaoEnvase) && (
                          <div
                            onClick={() => handleOpenEnvaseEspera(item)}
                            className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 text-[11px] font-semibold flex items-center justify-between gap-1 cursor-pointer hover:bg-amber-100 transition-colors"
                            title="Lote em espera no envase. Clique para alterar observação."
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <PauseCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span className="truncate">⏸️ {item.observacaoEnvase || 'Em Espera'}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'envase_linha', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'envase')}

                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 1')}
                              className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-blue-50 text-zinc-700 hover:text-blue-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 1"
                            >
                              L1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 3')}
                              className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 3 (Óleos)"
                            >
                              L3
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {item.statusEnvase === 'EM_ESPERA' ? (
                              <button
                                type="button"
                                onClick={() => handleChangeStatusEnvase(item, 'EM_ENVASE')}
                                className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer transition-colors"
                                title="Retomar envase"
                              >
                                <Play className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenEnvaseEspera(item)}
                                className="p-1 text-zinc-400 hover:text-amber-700 hover:bg-amber-50 rounded cursor-pointer transition-colors"
                                title="Pausar / Colocar em espera"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleChangeStatusEnvase(item, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão do Envase" : "Concluir Envase"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA LINHA 3 (APENAS ÓLEOS) */}
            <div className="col-span-12 xl:col-span-3 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-extrabold tracking-tight">Linha 3 (Apenas Óleos)</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {envaseLinha3Items.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {Number(envaseDayStats.linha3Un).toLocaleString('pt-BR')} un
                </div>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5">
                {loadingEnvase ? (
                  <div className="py-16 text-center text-zinc-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs font-semibold">Carregando Linha 3...</p>
                  </div>
                ) : filteredEnvaseLinha3Items.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Droplets className="h-8 w-8 mx-auto mb-2 text-amber-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote de óleo na Linha 3 hoje</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {encaixeSearch ? `Nenhum lote correspondente à busca "${encaixeSearch}".` : 'Selecione um óleo da lista de Liberados e clique em "+ Linha 3 (Óleos)".'}
                    </p>
                  </div>
                ) : (
                  filteredEnvaseLinha3Items.map((item, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === envaseLinha3Items.length - 1;
                    const isConcluido = item.statusEnvase === 'CONCLUIDO';
                    const adiadoInfo = !isConcluido ? getLoteAdiadoInfo(item.loteNumber, envaseSelectedDate, 'envase') : null;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                          adiadoInfo
                            ? "border-rose-400 bg-rose-50/25 ring-1 ring-rose-300"
                            : item.statusEnvase === 'EM_ENVASE'
                              ? "border-purple-400 ring-1 ring-purple-300 bg-purple-50/20"
                              : item.statusEnvase === 'EM_ESPERA'
                                ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50/30"
                                : isConcluido
                                  ? "border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200"
                                  : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-zinc-900 text-white">
                              {item.ordem}º
                            </span>
                            {adiadoInfo && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-mono flex items-center gap-1"
                                  title={adiadoInfo.isDestino ? `Lote transferido de ${formatDateOnly(adiadoInfo.dataOriginal)} para esta data` : `Lote originalmente previsto para esta data e transferido para ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                >
                                  <FastForward className="h-3 w-3 text-rose-600" />
                                  {adiadoInfo.isDestino ? `Adiado de ${formatDateOnly(adiadoInfo.dataOriginal)}` : `Adiado p/ ${formatDateOnly(adiadoInfo.dataAdiadoPara)}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAdiarLote(item.loteNumber, adiadoInfo.dataOriginal, 'envase', item.productCode)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-300 rounded flex items-center gap-0.5 transition-colors cursor-pointer shadow-2xs"
                                  title={`Cancelar adiamento e retornar lote para ${formatDateOnly(adiadoInfo.dataOriginal)}`}
                                >
                                  <Undo2 className="h-2.5 w-2.5" />
                                  <span>Desfazer</span>
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleReorderEnvase(item.id, 'Linha 3', 'up')}
                              disabled={isFirst}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                              title="Subir ordem"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorderEnvase(item.id, 'Linha 3', 'down')}
                              disabled={isLast}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded disabled:opacity-20 cursor-pointer"
                              title="Descer ordem"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const realLote = getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber);
                                handleOpenAdiarModal({
                                  loteNumber: item.loteNumber,
                                  productCode: item.productCode,
                                  productDescription: item.productDescription,
                                  currentDate: item.dataProgramada || envaseSelectedDate || getCurrentBoardDate(),
                                  etapaLabel: `${item.linha || 'Linha 3'} de Envase`,
                                  origem: 'envase_linha',
                                  realLote,
                                  envaseItem: item,
                                });
                              }}
                              className="p-1 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote: item, etapa: 'envase' })}
                              className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEnvase(item.id, item.loteNumber)}
                              className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              title="Remover do quadro"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderLoteProductsInfo(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any))}

                        {renderFiscoQuimicaBadge(item.loteNumber)}

                        {(item.statusEnvase === 'EM_ESPERA' || item.observacaoEnvase) && (
                          <div
                            onClick={() => handleOpenEnvaseEspera(item)}
                            className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 text-[11px] font-semibold flex items-center justify-between gap-1 cursor-pointer hover:bg-amber-100 transition-colors"
                            title="Lote em espera no envase. Clique para alterar observação."
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <PauseCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span className="truncate">⏸️ {item.observacaoEnvase || 'Em Espera'}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(item.quantity).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(item.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lotesByNumber.get(item.loteNumber) || (item as any), 'envase_linha', handleOpenEditTimestamps)}

                        {renderLoteProblemaBanner(getRealLote(item.loteNumber, item.productCode) || lotesByNumber.get(item.loteNumber) || (item as any), 'envase')}

                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-100">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 1')}
                              className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-blue-50 text-zinc-700 hover:text-blue-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 1"
                            >
                              L1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLinha(item, 'Linha 2')}
                              className="text-[10px] font-bold px-1.5 py-0.5 bg-zinc-50 hover:bg-indigo-50 text-zinc-700 hover:text-indigo-700 border border-zinc-200 rounded cursor-pointer transition-colors"
                              title="Mover para Linha 2"
                            >
                              L2
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {item.statusEnvase === 'EM_ESPERA' ? (
                              <button
                                type="button"
                                onClick={() => handleChangeStatusEnvase(item, 'EM_ENVASE')}
                                className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer transition-colors"
                                title="Retomar envase"
                              >
                                <Play className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenEnvaseEspera(item)}
                                className="p-1 text-zinc-400 hover:text-amber-700 hover:bg-amber-50 rounded cursor-pointer transition-colors"
                                title="Pausar / Colocar em espera"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleChangeStatusEnvase(item, isConcluido ? 'PROGRAMADO' : 'CONCLUIDO')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-all shadow-2xs flex items-center justify-center",
                                isConcluido
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-1 ring-emerald-400"
                                  : "bg-zinc-100 hover:bg-emerald-50 text-zinc-600 hover:text-emerald-700 border border-zinc-200"
                              )}
                              title={isConcluido ? "Desmarcar conclusão do Envase" : "Concluir Envase"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 4: LIBERADOS PARA ENVASE (AGUARDANDO ENCAIXE) */}
            <div className="col-span-12 xl:col-span-3 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-extrabold tracking-tight">Liberados para Envase</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddLoteModal('envase')}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="Adicionar lote manualmente aos Liberados para Envase"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Adicionar Lote</span>
                  </button>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {lotesParaEncaixe.length}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={encaixeSearch}
                    onChange={(e) => setEncaixeSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(encaixeSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {encaixeSearch && (
                    <button
                      type="button"
                      onClick={() => setEncaixeSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { setEnvaseScopeFilter('LIBERADOS'); setEncaixeOnlyProblemas(false); }}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors",
                      envaseScopeFilter === 'LIBERADOS' && !encaixeOnlyProblemas ? "bg-white text-zinc-900 shadow-2xs border border-zinc-300" : "text-zinc-500 hover:text-zinc-800"
                    )}
                    title="Lotes já produzidos e liberados para envase"
                  >
                    Liberados ({lotesLiberadosParaAcabamento.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEnvaseScopeFilter('TODOS'); setEncaixeOnlyProblemas(false); }}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors",
                      envaseScopeFilter === 'TODOS' && !encaixeOnlyProblemas ? "bg-white text-zinc-900 shadow-2xs border border-zinc-300" : "text-zinc-500 hover:text-zinc-800"
                    )}
                    title="Todas as ordens abertas da fábrica no Hub"
                  >
                    Todas Abertas ({todasOrdensAbertasFabrica.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setEncaixeOnlyProblemas(true)}
                    className={cn(
                      "px-2 py-0.5 text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1",
                      encaixeOnlyProblemas ? "bg-amber-500 text-white shadow-2xs" : "text-amber-700 hover:bg-amber-100/80"
                    )}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    <span>Falta / Problemas ({countEncaixeProblemas})</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-zinc-50/30 min-h-[460px] max-h-[710px] overflow-y-auto space-y-2.5">
                {lotesParaEncaixe.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote aguardando envase</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {encaixeSearch ? `Nenhum lote correspondente à busca "${encaixeSearch}".` : "Conclua a fabricação na aba Quadro de Produção para liberar novos lotes aqui."}
                    </p>
                  </div>
                ) : (
                  lotesParaEncaixe.map((lote, idx) => {
                    const scheduledItem = programacaoEnvase.find(it => 
                      it.loteNumber === lote.loteNumber && 
                      (!it.productCode || !lote.productCode || it.productCode === lote.productCode)
                    );
                    const isScheduled = Boolean(scheduledItem);
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    const temProblema = hasLoteProblemaOuPausa(lote, null, 'envase');

                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className={cn(
                          "bg-white border rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2",
                          temProblema ? "border-amber-400 bg-amber-50/20 ring-1 ring-amber-300" :
                          isScheduled ? "border-indigo-300 bg-indigo-50/20" : "border-zinc-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold text-zinc-900 flex-wrap">
                            <span>#{lote.loteNumber}</span>
                            <span className="text-[10px] text-zinc-400 font-normal">({lote.productCode})</span>
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                            {isLoteParcial(lote) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-sans" title="Ordem com apontamento parcial pendente">
                                🌓 Parcial
                              </span>
                            )}
                            {isLoteTerceirizado(lote) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-sans" title="Lote Terceirizado">
                                🏭 Terceirizado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenPauseModal(lote, 'envase')}
                              className={cn(
                                "p-1 rounded cursor-pointer transition-colors",
                                temProblema
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : "text-zinc-400 hover:bg-amber-50 hover:text-amber-600"
                              )}
                              title="Informar falta de insumo ou pausar lote no Envase"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 hover:bg-indigo-50 rounded text-zinc-400 hover:text-indigo-600 cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'envase' })}
                              className="p-1 hover:bg-zinc-100 rounded text-zinc-600 hover:text-zinc-900 cursor-pointer"
                              title="Ver Detalhes do Item"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoverDaFila(lote.loteNumber, 'envase')}
                              className="p-1 hover:bg-rose-50 rounded text-zinc-400 hover:text-rose-600 cursor-pointer transition-colors"
                              title="Remover dos Liberados para Envase"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                              {getEffectiveStatus(lote)}
                            </span>
                          </div>
                        </div>

                        {renderLoteProductsInfo(lote)}

                        {renderFiscoQuimicaBadge(lote.loteNumber)}

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantity || 0).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantityKg || 0).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lote, 'envase_fila', handleOpenEditTimestamps)}

                        {renderLoteEsperaBadge(lote)}
                        {!getLoteEsperaDetails(lote, programacaoEnvase, programacaoRotulagem).isEmEspera && renderLoteProblemaBanner(lote, 'envase')}

                        <div className="pt-2 border-t border-zinc-100 space-y-1.5">
                          {isScheduled && scheduledItem ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                  {scheduledItem.linha} ({scheduledItem.ordem}º)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEnvase(scheduledItem.id, lote.loteNumber)}
                                  className="text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer flex items-center gap-0.5"
                                  title="Remover do quadro de envase"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Remover</span>
                                </button>
                              </div>
                              <div className="flex items-center gap-1">
                                {scheduledItem.linha !== 'Linha 1' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMoveLinha(scheduledItem, 'Linha 1')}
                                    className="flex-1 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer text-center"
                                    title="Mover para Linha 1"
                                  >
                                    L1
                                  </button>
                                )}
                                {scheduledItem.linha !== 'Linha 2' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMoveLinha(scheduledItem, 'Linha 2')}
                                    className="flex-1 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 rounded hover:bg-indigo-100 cursor-pointer text-center"
                                    title="Mover para Linha 2"
                                  >
                                    L2
                                  </button>
                                )}
                                {scheduledItem.linha !== 'Linha 3' && scheduledItem.linha !== 'Linha 3 (Óleos)' && (
                                  <button
                                    type="button"
                                    onClick={() => handleMoveLinha(scheduledItem, 'Linha 3')}
                                    className="flex-1 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded hover:bg-amber-100 cursor-pointer text-center"
                                    title="Mover para Linha 3 (Óleos)"
                                  >
                                    L3
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-1">
                              <button
                                type="button"
                                onClick={() => handleEncaixarLote(lote, 'Linha 1')}
                                className="py-1 px-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs"
                                title="Encaixar na Linha 1"
                              >
                                + L1
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEncaixarLote(lote, 'Linha 2')}
                                className="py-1 px-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs"
                                title="Encaixar na Linha 2"
                              >
                                + L2
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEncaixarLote(lote, 'Linha 3')}
                                className="py-1 px-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer text-center shadow-2xs"
                                title="Encaixar na Linha 3 (Apenas Óleos)"
                              >
                                + L3
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: QUADRO DE ORDENS (FINALIZADAS X PARCIAIS) */}
      {currentTab === 'quadro_ordens' && (
        <div className="space-y-4">
          {renderUnifiedQuadroHeader({
            title: "Quadro de Ordens",
            subtitle: "Acompanhamento contínuo de ordens finalizadas no chão de fábrica e ordens com apontamentos parciais.",
            icon: <CheckSquare className="h-6 w-6 text-emerald-400" />,
            selectedDate: ordensSelectedDate,
            setSelectedDate: setOrdensSelectedDate,
            showAllDates: ordensShowAllDates,
            setShowAllDates: setOrdensShowAllDates,
            badgeCount: totalOrdensFinalizadasNaoLancadas,
            badgeCountLabel: "pendente(s) no ERP",
            badgeKg: ordensFinalizadas.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0) + ordensParciais.reduce((s, l) => s + (Number(l.quantityKg) || 0), 0),
            onRefresh: fetchLotes,
            isRefreshing: loading,
            actionButtons: (
              <div className="relative min-w-[220px] max-w-xs">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={ordensSearch}
                  onChange={e => setOrdensSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      performRemoteLookup(ordensSearch);
                    }
                  }}
                  placeholder="Pesquisar lote em Ordens..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                />
                {ordensSearch && (
                  <button
                    type="button"
                    onClick={() => setOrdensSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ),
            operationalMetrics: (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                  <span>Finalizadas:</span>
                  <span className="font-mono">{ordensFinalizadas.length}{ordensSearch ? ` / ${baseOrdensFinalizadas.length}` : ''} ordens</span>
                  <span className="text-emerald-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-emerald-700">
                    {ordensFinalizadas.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0).toLocaleString('pt-BR')} un
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 font-bold">
                  <span>Parciais:</span>
                  <span className="font-mono">{ordensParciais.length}{ordensSearch ? ` / ${baseOrdensParciais.length}` : ''} ordens</span>
                  <span className="text-purple-400 font-normal">|</span>
                  <span className="font-mono text-[11px] text-purple-700">
                    {ordensParciais.reduce((acc, l) => acc + (Number(l.quantidadeEnvasadaParcial || (l as any).quantidade_envasada_parcial) || 0), 0).toLocaleString('pt-BR')} un
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold">
                  <span>Em Andamento:</span>
                  <span className="font-mono">{lotesParaOrdens.length}{ordensSearch ? ` / ${baseLotesParaOrdens.length}` : ''} lotes</span>
                </div>
              </>
            )
          })}

          {/* GRID COM 3 COLUNAS: ORDENS FINALIZADAS (ESQ) | ORDENS PARCIAIS (CENTRO) | FILA DE ESCOLHA (DIR) */}
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* COLUNA 1: ORDENS FINALIZADAS */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCheck className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-extrabold tracking-tight">Ordens Finalizadas</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {filteredOrdensFinalizadas.length}
                  </span>
                </div>
                <div className="text-right flex items-center gap-1.5 flex-wrap justify-end">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold" title="Lançadas no ERP (EA)">
                    {filteredOrdensFinalizadas.filter(l => l.erpStatus === 'EA').length} no ERP
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold" title="Pendentes no ERP">
                    {filteredOrdensFinalizadas.filter(l => l.erpStatus !== 'EA').length} pend.
                  </span>
                  <span className="text-zinc-500 text-xs">|</span>
                  <span className="font-mono text-xs text-zinc-300 font-semibold">
                    {filteredOrdensFinalizadas.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0).toLocaleString('pt-BR')} un
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200">
                <p className="text-[11px] text-zinc-600 font-medium">
                  Ordens concluídas no chão de fábrica e status de sincronização com o ERP (EA).
                </p>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5">
                {filteredOrdensFinalizadas.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhuma ordem finalizada pendente</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {ordensSearch ? `Nenhuma ordem correspondente à busca "${ordensSearch}".` : 'Finalize um lote na fila de andamento ao lado para exibi-lo aqui.'}
                    </p>
                  </div>
                ) : (
                  filteredOrdensFinalizadas.map((lote, idx) => {
                    const prevBadge = getPrevisaoBadge(getEffectivePrevisao(lote.date, lote.dataPrevisao));
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className="bg-white border border-emerald-200 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-1 pb-2 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-zinc-900 text-white">
                              #{lote.loteNumber}
                            </span>
                            {lote.erpStatus === 'EA' ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600 inline shrink-0" />
                                Lançado no ERP (EA)
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1">
                                <Clock className="h-3 w-3 text-amber-600 inline shrink-0" />
                                Pendente no ERP
                              </span>
                            )}
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 text-zinc-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'ordens' })}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                              title="Ver detalhes do lote"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(lote)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                              title="Ver histórico do lote"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-zinc-900 line-clamp-1">
                            {lote.productCode} - {lote.productDescription}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantity).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lote, 'ordens', handleOpenEditTimestamps)}

                        {renderQuadrosOcultosBadges(lote)}

                        {prevBadge && (
                          <div className="flex items-center justify-between pt-1 text-[11px]">
                            <span className="text-zinc-400">Previsão:</span>
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] border", prevBadge.colorClass)}>
                              {prevBadge.label}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100">
                          <div className="text-[10px] text-zinc-400">
                            Resp: <span className="font-semibold text-zinc-700">{lote.updatedBy || 'Sistema'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => executeStatusUpdate(lote.loteNumber, 'Envase', null)}
                            className="p-1.5 text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                            title="Reverter para status anterior"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 2: ORDENS PARCIAIS */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-6 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-extrabold tracking-tight">Ordens Parciais</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {filteredOrdensParciais.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {filteredOrdensParciais.reduce((acc, l) => acc + (Number(l.quantidadeEnvasadaParcial || (l as any).quantidade_envasada_parcial) || 0), 0).toLocaleString('pt-BR')} un
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200">
                <p className="text-[11px] text-zinc-600 font-medium">
                  Lotes com produção ou envase parcialmente realizados em fábrica.
                </p>
              </div>

              <div className="p-3 bg-zinc-50/50 min-h-[500px] max-h-[750px] overflow-y-auto space-y-2.5">
                {filteredOrdensParciais.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-purple-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhuma ordem parcial ativa</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {ordensSearch ? `Nenhuma ordem correspondente à busca "${ordensSearch}".` : 'Adicione um apontamento parcial em qualquer lote da fila ao lado.'}
                    </p>
                  </div>
                ) : (
                  filteredOrdensParciais.map((lote, idx) => {
                    const totalQty = Number(lote.quantity) || 0;
                    const parcialQty = Number(lote.quantidadeEnvasadaParcial || (lote as any).quantidade_envasada_parcial) || 0;
                    const pct = totalQty > 0 ? Math.min(100, Math.round((parcialQty / totalQty) * 100)) : 0;
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);

                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className="bg-white border border-purple-200 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-1 pb-2 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-lg bg-zinc-900 text-white">
                              #{lote.loteNumber}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-900 border border-purple-200">
                              Parcial ({pct}%)
                            </span>
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 text-zinc-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'ordens' })}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                              title="Ver detalhes do lote"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(lote)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                              title="Ver histórico do lote"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-zinc-900 line-clamp-1">
                            {lote.productCode} - {lote.productDescription}
                          </div>
                        </div>

                        {renderCardTimelineDates(lote, 'ordens', handleOpenEditTimestamps)}

                        {renderQuadrosOcultosBadges(lote)}

                        {/* Barra de Progresso Parcial */}
                        <div className="space-y-1 bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="font-bold text-purple-900">
                              {parcialQty.toLocaleString('pt-BR')} <span className="font-normal text-zinc-500">de {totalQty.toLocaleString('pt-BR')} un</span>
                            </span>
                            <span className="font-bold text-purple-700">{pct}%</span>
                          </div>
                          <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-purple-600 h-full rounded-full transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {/* Botões de Ação na Ordem Parcial */}
                        <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-zinc-100">
                          <button
                            type="button"
                            onClick={() => setParcialModalLote(lote)}
                            className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                            title="Editar apontamento parcial"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => executeStatusUpdate(lote.loteNumber, 'Ordem Finalizada', null)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
                            title="Concluir totalmente e mover para Ordens Finalizadas"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUNA 3: LOTES EM ANDAMENTO (FILA DE ESCOLHA À DIREITA) */}
            <div className="col-span-12 xl:col-span-4 lg:col-span-12 bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
              <div className="bg-zinc-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-sky-400" />
                  <span className="text-sm font-extrabold tracking-tight">Lotes em Andamento</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/10 text-white">
                    {lotesParaOrdens.length}
                  </span>
                </div>
                <div className="text-right font-mono text-xs text-zinc-300 font-semibold">
                  {lotesParaOrdens.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0).toLocaleString('pt-BR')} un
                </div>
              </div>

              {/* Caixa de Busca Embutida na Coluna de Escolha (Molde Envase) */}
              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200 space-y-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={ordensSearch}
                    onChange={e => setOrdensSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        performRemoteLookup(ordensSearch);
                      }
                    }}
                    placeholder="Buscar lote por número, SKU ou produto..."
                    className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-7 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                  {ordensSearch && (
                    <button
                      type="button"
                      onClick={() => setOrdensSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 border-b border-zinc-200">
                <p className="text-[11px] text-zinc-600 font-medium">
                  Selecione um lote ativo para lançar apontamento parcial ou marcar como finalizado.
                </p>
              </div>

              <div className="p-3 bg-zinc-50/30 min-h-[460px] max-h-[710px] overflow-y-auto space-y-2.5">
                {lotesParaOrdens.length === 0 ? (
                  <div className="py-16 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-xl p-4 bg-white">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p className="text-xs font-bold text-zinc-700">Nenhum lote em andamento</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {ordensSearch ? `Nenhum lote correspondente à busca "${ordensSearch}".` : "Todos os lotes ativos já foram apontados ou finalizados."}
                    </p>
                  </div>
                ) : (
                  lotesParaOrdens.map((lote, idx) => {
                    const eff = getEffectiveStatus(lote);
                    const isMulti = multiProductLoteNumbers.has(lote.loteNumber);
                    return (
                      <div
                        key={`${lote.loteNumber}_${lote.productCode || idx}`}
                        className="bg-white border border-zinc-200 rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-zinc-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-zinc-900 text-white">
                              #{lote.loteNumber}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-800 border border-zinc-200">
                              {eff}
                            </span>
                            {isMulti && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-sans" title="Ordem conjunta com múltiplos produtos">
                                📦 Multi-Produto
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveLoteNextDay(lote)}
                              className="p-1 text-zinc-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer"
                              title="Adiar lote (selecionar nova data)"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLoteDetails({ lote, etapa: 'ordens' })}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded hover:bg-zinc-100 transition-colors cursor-pointer"
                              title="Ver detalhes do lote"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(lote)}
                              className="p-1 text-zinc-400 hover:text-zinc-700 rounded hover:bg-zinc-100 transition-colors cursor-pointer"
                              title="Ver histórico do lote"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-zinc-900 line-clamp-1">
                            {lote.productCode} - {lote.productDescription}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-zinc-100">
                          <span className="font-bold text-zinc-900">
                            {Number(lote.quantity).toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-500 font-normal">un</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {Number(lote.quantityKg).toLocaleString('pt-BR')} kg
                          </span>
                        </div>

                        {renderCardTimelineDates(lote, 'ordens', handleOpenEditTimestamps)}

                        {renderQuadrosOcultosBadges(lote)}

                        {/* Botões de Ação Rápida */}
                        <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-zinc-100">
                          <button
                            type="button"
                            onClick={() => setParcialModalLote(lote)}
                            className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                            title="Registrar apontamento parcial"
                          >
                            <Clock className="h-3.5 w-3.5 text-purple-600" />
                          </button>

                          <button
                            type="button"
                            onClick={() => executeStatusUpdate(lote.loteNumber, 'Ordem Finalizada', null)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
                            title="Marcar como ordem finalizada (aguardando lançamento no ERP)"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: CALENDÁRIO MENSAL */}
      {currentTab === 'calendar' && (
        <div className="space-y-4">
          <div className="space-y-3">
              {/* BARRA SUPERIOR DO MÊS */}
              <div className="bg-white rounded-lg p-3.5 border border-zinc-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Navegação Mês */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 hover:bg-white text-zinc-700 hover:text-zinc-950 rounded-lg transition-all cursor-pointer"
                  title="Mês Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-3 text-xs font-bold text-zinc-900 min-w-[130px] text-center">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 hover:bg-white text-zinc-700 hover:text-zinc-950 rounded-lg transition-all cursor-pointer"
                  title="Próximo Mês"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleGoToToday}
                className="px-3 py-1.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Hoje
              </button>
            </div>

            {/* Filtros de Status no Calendário */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('ABERTO')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'ABERTO'
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                    : "bg-zinc-50 text-zinc-650 border-zinc-200 hover:bg-zinc-100"
                )}
              >
                Em Aberto
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('PESAGEM')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'PESAGEM'
                    ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                    : "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                )}
              >
                Pesagem
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('PRODUCAO')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'PRODUCAO'
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100"
                )}
              >
                Produção
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('ENVASE')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'ENVASE'
                    ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                    : "bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100"
                )}
              >
                Envase
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('ROTULAGEM')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'ROTULAGEM'
                    ? "bg-cyan-600 text-white border-cyan-600 shadow-xs"
                    : "bg-cyan-50 text-cyan-900 border-cyan-200 hover:bg-cyan-100"
                )}
              >
                Rotulagem
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('EM_ESPERA')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'EM_ESPERA'
                    ? "bg-orange-600 text-white border-orange-600 shadow-xs"
                    : "bg-orange-50 text-orange-950 border-orange-200 hover:bg-orange-100"
                )}
              >
                Em Espera
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('FINALIZADA')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'FINALIZADA'
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                    : "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
                )}
              >
                Finalizada
              </button>
              <button
                type="button"
                onClick={() => setCalendarStatusFilter('TODOS')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  calendarStatusFilter === 'TODOS'
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                    : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                )}
              >
                Todos
              </button>
            </div>

            {/* Busca rápida no calendário */}
            <div className="relative min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Localizar no calendário..."
                value={calendarSearch}
                onChange={(e) => setCalendarSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 border border-zinc-200 rounded-xl text-xs bg-zinc-50 text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              {calendarSearch && (
                <button
                  type="button"
                  onClick={() => setCalendarSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* GRADE DO MÊS */}
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden">
            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-bold text-zinc-500 uppercase tracking-wider text-center py-2">
              {WEEKDAY_NAMES.map((name, i) => (
                <div key={name} className={cn(i === 0 || i === 6 ? "text-zinc-400" : "")}>
                  {name}
                </div>
              ))}
            </div>

            {/* Células do Calendário */}
            <div className="grid grid-cols-7 divide-x divide-y divide-zinc-100">
              {calendarDays.map((cell) => {
                const isSelected = selectedDateIso === cell.dateIso;
                const hasItems = cell.items.length > 0;

                return (
                  <div
                    key={cell.dateIso}
                    onClick={() => {
                      if (hasItems) {
                        setSelectedDateIso(cell.dateIso);
                      }
                    }}
                    className={cn(
                      "min-h-[105px] p-2 flex flex-col justify-between transition-colors select-none",
                      cell.isCurrentMonth ? "bg-white" : "bg-zinc-50/40 text-zinc-400",
                      cell.isWeekend && cell.isCurrentMonth && "bg-zinc-50/30",
                      hasItems && "cursor-pointer hover:bg-zinc-50/80",
                      isSelected && "ring-2 ring-zinc-900 ring-inset bg-zinc-50/90",
                      cell.isToday && !isSelected && "border-2 border-zinc-900/30"
                    )}
                  >
                    {/* Linha do topo */}
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-xs font-bold inline-flex items-center justify-center h-6 w-6 rounded-full",
                        cell.isToday ? "bg-zinc-900 text-white" : cell.isCurrentMonth ? "text-zinc-800" : "text-zinc-400"
                      )}>
                        {cell.dayNum}
                      </span>

                      {hasItems && (
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                            cell.openCount > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                          )}>
                            {cell.items.length} {cell.items.length === 1 ? 'lote' : 'lotes'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Feriado */}
                    {cell.holiday && (
                      <span className="text-[9px] font-semibold text-rose-600 truncate block mt-0.5" title={cell.holiday.name}>
                        {cell.holiday.name}
                      </span>
                    )}

                    {/* Chips de Lotes no dia */}
                    <div className="space-y-1 mt-1.5 flex-1 overflow-hidden">
                      {cell.items.slice(0, 3).map((item) => {
                        const isEa = item.erpStatus === 'EA';
                        const isFinal = item.customStatus === 'Finalizada';
                        return (
                          <div
                            key={item.loteNumber}
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-md truncate font-medium border flex items-center justify-between gap-1",
                              isEa || isFinal
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : getBadgeClass(item.customStatus)
                            )}
                            title={`${item.loteNumber} - ${item.productDescription} • ${item.quantity} un • ${item.quantityKg} kg`}
                          >
                            <span className="truncate">
                              <strong className="font-mono mr-1">#{item.loteNumber}:</strong>
                              {item.productDescription}
                            </span>
                            <span className="font-mono text-[9px] opacity-75 shrink-0">
                              {item.quantityKg}kg
                            </span>
                          </div>
                        );
                      })}
                      {cell.items.length > 3 && (
                        <div className="text-[9px] font-bold text-zinc-400 text-center">
                          +{cell.items.length - 3} mais...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PAINEL INFERIOR DE DETALHES DO DIA SELECIONADO */}
          {selectedDayInfo && (
            <div className="bg-white border border-zinc-200 rounded-lg shadow-xs p-5 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div>
                  <h3 className="font-bold text-sm text-zinc-900">
                    Lotes em {selectedDayInfo.dayOfWeekName}, {selectedDayInfo.dayFormatted}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {selectedDayInfo.count} lotes registrados • {Number(selectedDayInfo.totalUnidades).toLocaleString('pt-BR')} un • {Number(selectedDayInfo.totalKg).toLocaleString('pt-BR')} kg total
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDateIso(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl cursor-pointer"
                  title="Fechar detalhes do dia"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tabela dos Lotes do Dia */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 text-[11px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-200">
                      <th className="py-2.5 px-3 w-28">Lote</th>
                      <th className="py-2.5 px-3 min-w-[220px]">Produto / SKU</th>
                      <th className="py-2.5 px-3 text-right w-36">Quantidade / Peso</th>
                      <th className="py-2.5 px-3 w-36 text-center">Status ERP</th>
                      <th className="py-2.5 px-3 w-44">Status Nosso</th>
                      <th className="py-2.5 px-3 w-52">Datas Registradas</th>
                      <th className="py-2.5 px-3 w-16 text-center">Hist.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {selectedDayInfo.items.map((item) => {
                      const isEa = item.erpStatus === 'EA';
                      const isBusy = savingLote === item.loteNumber;

                      return (
                        <tr key={item.loteNumber} className="hover:bg-zinc-50/80">
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 select-all">
                            #{item.loteNumber}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-zinc-900">{item.productDescription}</div>
                            <div className="text-[10px] font-mono text-zinc-400">SKU: {item.productCode}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                            <div className="font-bold text-zinc-900">{Number(item.quantity || 0).toLocaleString('pt-BR')} un</div>
                            <div className="text-[10px] text-zinc-500 font-semibold">{Number(item.quantityKg || 0).toLocaleString('pt-BR')} kg</div>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border",
                              getErpBadgeClass(item.erpStatus)
                            )}>
                              {isEa ? 'Concluído (EA)' : item.erpStatusLabel}
                            </span>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <select
                              value={item.customStatus || ''}
                              onChange={(e) => handleSelectStatusChange(item.loteNumber, e.target.value)}
                              disabled={isBusy}
                              className={cn(
                                "w-full text-xs font-bold rounded-xl border px-2.5 py-1.5 focus:outline-none transition-all cursor-pointer",
                                getBadgeClass(item.customStatus),
                                isBusy && "opacity-50 cursor-wait"
                              )}
                            >
                              <option value="">Aguardando Definição</option>
                              <optgroup label="Pesagem e Produção">
                                <option value="Pesagem">Pesagem</option>
                                <option value="Produzido">Produzido</option>
                                <option value="Liberado para Envase">Liberado para Envase</option>
                              </optgroup>
                              <optgroup label="Embalagem">
                                <option value="Rotulagem">Rotulagem</option>
                                <option value="Envase">Envase</option>
                                <option value="Finalizada">Finalizada</option>
                              </optgroup>
                              <optgroup label="Paralisado">
                                <option value="Em Espera">⏸️ Em Espera...</option>
                              </optgroup>
                            </select>
                          </td>
                          <td className="py-2 px-3 text-[10px] font-medium text-zinc-600 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              {item.dataPesagem && <div>🟡 <strong>Pesagem:</strong> {formatDateShort(item.dataPesagem)}</div>}
                              {item.dataProducao && <div>🔵 <strong>Produzido:</strong> {formatDateShort(item.dataProducao)}</div>}
                              {item.dataLiberadoEnvase && <div>🟢 <strong>Liberado Envase:</strong> {formatDateShort(item.dataLiberadoEnvase)}</div>}
                              {item.dataEnvase && <div>🟣 <strong>Envase:</strong> {formatDateShort(item.dataEnvase)}</div>}
                              {item.dataRotulagem && <div>🔷 <strong>Rotulagem:</strong> {formatDateShort(item.dataRotulagem)}</div>}
                              {item.dataEmEspera && <div>🟠 <strong>Espera:</strong> {formatDateShort(item.dataEmEspera)} ({item.motivoEspera || '—'})</div>}
                              {item.dataFinalizada && <div>🟢 <strong>Finalizada:</strong> {formatDateShort(item.dataFinalizada)}</div>}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(item)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                              title="Ver histórico de alterações"
                            >
                              <History className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        </div>
      )}


      {/* VIEW 5: ABA CONFIGURAÇÕES (EXPORTAÇÃO EXCEL) */}
      {currentTab === 'configuracoes' && (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-200">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Configurações & Exportação</h2>
            <p className="text-xs text-zinc-500">
              Exporte dados e relatórios do acompanhamento de produção.
            </p>
          </div>

          {/* CARD 1: EXPORTAÇÃO EXCEL (.XLSX) */}
          <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-lg shadow-2xs">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Exportar Planilha Excel (.xlsx)</h3>
                  <p className="text-xs text-zinc-500">
                    Gera um arquivo de planilha no formato Microsoft Excel (.xlsx) com 3 abas organizadas:
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
              >
                <Download className="h-4 w-4" />
                <span>Baixar Planilha Completa (.xlsx)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1">
                <span className="text-[11px] font-bold text-zinc-800 flex items-center gap-1.5">
                  <Table className="h-3.5 w-3.5 text-blue-600" /> Aba 1: Lotes de Produção
                </span>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Lotes internos, quantidades em unidades e kg, status ERP, status nosso, previsão e histórico de datas.
                </p>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1">
                <span className="text-[11px] font-bold text-zinc-800 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-purple-600" /> Aba 2: Terceirizados
                </span>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Lotes de terceirizados e solicitações em aberto com fornecedores e aprovações de insumos.
                </p>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1">
                <span className="text-[11px] font-bold text-zinc-800 flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5 text-amber-600" /> Aba 3: Ordens de Kits
                </span>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Ordens de montagem de kits com quantidades planejadas, montadas, operador e status.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EM ESPERA EM LOTE */}
      {showBatchEsperaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-2xl border border-zinc-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-100 text-orange-700 rounded-xl">
                  <PauseCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Pausar {selectedLotes.size} Lotes em Espera</h3>
                  <p className="text-xs text-zinc-500">Selecione o motivo da pausa para os lotes selecionados</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowBatchEsperaModal(false); setBatchStatusValue(''); }}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-zinc-700">Motivo da Pausa:</label>
                <select
                  value={batchEsperaMotivo}
                  onChange={e => setBatchEsperaMotivo(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  {MOTIVOS_PAUSA_PADRAO.map(motivo => (
                    <option key={motivo} value={motivo}>{motivo}</option>
                  ))}
                  <option value="Outro">Outro Motivo (personalizado)...</option>
                </select>
              </div>

              {batchEsperaMotivo === 'Outro' && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-zinc-700">Descreva o motivo:</label>
                  <input
                    type="text"
                    value={batchCustomMotivo}
                    onChange={e => setBatchCustomMotivo(e.target.value)}
                    placeholder="Ex: Aguardando aprovação de lote..."
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => { setShowBatchEsperaModal(false); setBatchStatusValue(''); }}
                className="px-4 py-2 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = batchEsperaMotivo === 'Outro' ? batchCustomMotivo.trim() : batchEsperaMotivo;
                  handleApplyBatchStatus('Em Espera', m || 'Em Espera');
                }}
                disabled={isBatchUpdating}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isBatchUpdating ? 'Aplicando...' : `Confirmar para ${selectedLotes.size} Lotes`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA PAUSAR / AJUSTAR PAUSA DO LOTE */}
      {pauseModalLote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2 text-amber-600">
                <PauseCircle className="h-5 w-5" />
                <div>
                  <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-1.5">
                    <span>Pausar Lote #{pauseModalLote.loteNumber}</span>
                    <span className="text-zinc-400 font-normal">|</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-900 border border-amber-300 font-semibold uppercase">
                      {pauseModalEtapa === 'pesagem' ? 'Pesagem' :
                        pauseModalEtapa === 'producao' ? 'Produção' :
                        pauseModalEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase'}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-500 font-normal line-clamp-1">
                    [{pauseModalLote.productCode}] {pauseModalLote.productDescription}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPauseModalLote(null)}
                className="p-1 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* SELETOR DE ETAPAS / SETORES ISOLADOS */}
            <div>
              <label className="font-bold text-zinc-700 block mb-1 text-xs">
                Setor da Fábrica (Pausa Isolada):
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 rounded-xl border border-zinc-200">
                {(['pesagem', 'producao', 'rotulagem', 'envase'] as const).map(et => {
                  const etLabels: Record<string, string> = {
                    pesagem: 'Pesagem',
                    producao: 'Produção',
                    rotulagem: 'Rotulagem',
                    envase: 'Envase'
                  };
                  const isSelected = pauseModalEtapa === et;
                  const etStatus = getLoteEtapaStatus(pauseModalLote, et);
                  return (
                    <button
                      key={et}
                      type="button"
                      onClick={() => {
                        setPauseModalEtapa(et);
                        const info = getLoteEtapaStatus(pauseModalLote, et);
                        setPauseInsumoCodigo(info.insumoFaltanteCodigo || '');
                        setPauseInsumoDescricao(info.insumoFaltanteDescricao || '');
                        if (info.insumoFaltanteCodigo) {
                          setPauseTipoMotivo('Falta de Insumo / Matéria-Prima');
                          setPauseMotivoCustom('');
                        } else if (info.motivoEspera) {
                          if (MOTIVOS_PAUSA_PADRAO.includes(info.motivoEspera)) {
                            setPauseTipoMotivo(info.motivoEspera);
                            setPauseMotivoCustom('');
                          } else {
                            setPauseTipoMotivo('Outro Motivo');
                            setPauseMotivoCustom(info.motivoEspera);
                          }
                        } else {
                          setPauseTipoMotivo('Falta de Insumo / Matéria-Prima');
                          setPauseMotivoCustom('');
                        }
                      }}
                      className={cn(
                        "py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5",
                        isSelected
                          ? "bg-zinc-900 text-white shadow-2xs"
                          : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70"
                      )}
                    >
                      <span>{etLabels[et]}</span>
                      {etStatus.isEspera && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title={`Pausa ativa em ${etLabels[et]}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-zinc-700 block mb-1.5">
                  Motivo da Pausa em {
                    pauseModalEtapa === 'pesagem' ? 'Pesagem' :
                    pauseModalEtapa === 'producao' ? 'Produção' :
                    pauseModalEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase'
                  }:
                </label>
                <select
                  value={pauseTipoMotivo}
                  onChange={e => setPauseTipoMotivo(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  {MOTIVOS_PAUSA_PADRAO.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Se for Falta de Insumo / Matéria-Prima: Busca por Código SKU */}
              {pauseTipoMotivo === 'Falta de Insumo / Matéria-Prima' && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-amber-600" />
                      Insumo Faltante (Código / SKU):
                    </span>
                    {pauseLoadingInsumo && (
                      <span className="text-[11px] text-amber-700 flex items-center gap-1">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Buscando produto...
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-1">
                      <input
                        type="text"
                        value={pauseInsumoCodigo}
                        onChange={e => handlePauseInsumoLookup(e.target.value)}
                        placeholder="Ex: MP-001"
                        className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-900 uppercase focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={pauseInsumoDescricao}
                        onChange={e => setPauseInsumoDescricao(e.target.value)}
                        placeholder="Descrição exata do insumo..."
                        className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    💡 Ao informar o código, todos os lotes que aguardam este insumo poderão ser filtrados simultaneamente nas telas de produção e relatórios.
                  </p>
                </div>
              )}

              {/* Se for Outro Motivo */}
              {pauseTipoMotivo === 'Outro Motivo' && (
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">
                    Descreva o motivo da pausa:
                  </label>
                  <input
                    type="text"
                    value={pauseMotivoCustom}
                    onChange={e => setPauseMotivoCustom(e.target.value)}
                    placeholder="Ex: Quebra do agitador mecânico..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              )}

              {/* Dica operacional */}
              <div className="text-[11px] text-zinc-600 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200">
                📌 <strong>Isolamento Operacional:</strong> A pausa configurada é <strong>exclusiva</strong> do setor selecionado (<span className="font-bold uppercase text-zinc-800">{pauseModalEtapa}</span>). Os outros setores da fábrica continuam operando normalmente sem bloqueio nem badges de espera.
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
              <div>
                {getLoteEtapaStatus(pauseModalLote, pauseModalEtapa).isEspera && (
                  <button
                    type="button"
                    onClick={() => {
                      handleResumeLote(pauseModalLote, pauseModalEtapa);
                      setPauseModalLote(null);
                    }}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    <span>Retomar {
                      pauseModalEtapa === 'pesagem' ? 'Pesagem' :
                      pauseModalEtapa === 'producao' ? 'Produção' :
                      pauseModalEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase'
                    }</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPauseModalLote(null)}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold text-zinc-600 hover:bg-zinc-100 cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSavePause}
                  disabled={savingPause}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingPause ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <PauseCircle className="h-3.5 w-3.5" />
                      <span>Confirmar Pausa ({
                        pauseModalEtapa === 'pesagem' ? 'Pesagem' :
                        pauseModalEtapa === 'producao' ? 'Produção' :
                        pauseModalEtapa === 'rotulagem' ? 'Rotulagem' : 'Envase'
                      })</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA ADICIONAR LOTE NA FILA OU LIBERADOS PARA ENVASE */}
      {addLoteModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Cabeçalho */}
            <div className="bg-zinc-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-white/10 text-amber-400">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    Adicionar Lote à Fila
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Destino: <span className="font-bold text-amber-400">{
                      addLoteModalTarget === 'pesagem' ? 'Fila de Pesagem' :
                      addLoteModalTarget === 'producao' ? 'Fila de Produção' :
                      addLoteModalTarget === 'rotulagem' ? 'Lotes Disponíveis para Rotulagem' : 'Liberados para Envase'
                    }</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddLoteModalTarget(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Campo de Busca Rápida */}
            <div className="p-4 bg-zinc-50 border-b border-zinc-200 shrink-0 space-y-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  autoFocus
                  value={addLoteModalSearch}
                  onChange={(e) => setAddLoteModalSearch(e.target.value)}
                  placeholder="Buscar lote por número (#), código ou produto..."
                  className="w-full bg-white border border-zinc-300 rounded-xl pl-9 pr-8 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder:text-zinc-400 font-medium"
                />
                {addLoteModalSearch && (
                  <button
                    type="button"
                    onClick={() => setAddLoteModalSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                Selecione um lote abaixo para incluí-lo nesta fila com 1 clique:
              </p>
            </div>

            {/* Lista de Candidatos */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1 min-h-[250px]">
              {(() => {
                const q = addLoteModalSearch.trim().toLowerCase();
                const currentSet = new Set<string>();
                if (addLoteModalTarget === 'pesagem') {
                  sortedLotesPesando.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                  baseLotesFilaPesagem.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                } else if (addLoteModalTarget === 'producao') {
                  lotesProducao.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                  baseLotesFilaProducao.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                } else if (addLoteModalTarget === 'rotulagem') {
                  programacaoRotulagem.forEach(it => currentSet.add((it.loteNumber || '').trim().toUpperCase()));
                  baseLotesParaRotulagem.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                } else if (addLoteModalTarget === 'envase') {
                  programacaoEnvase.forEach(it => currentSet.add((it.loteNumber || '').trim().toUpperCase()));
                  baseLotesParaEncaixe.forEach(l => currentSet.add((l.loteNumber || '').trim().toUpperCase()));
                }

                const candidates = lotes
                  .filter(l => {
                    if (isLoteConcluido(l)) return false;
                    const num = (l.loteNumber || '').trim().toUpperCase();
                    if (currentSet.has(num)) return false;
                    if (!q) return true;
                    const prodCode = (l.productCode || '').toLowerCase();
                    const prodDesc = (l.productDescription || '').toLowerCase();
                    const loteNum = (l.loteNumber || '').toLowerCase();
                    return loteNum.includes(q) || prodCode.includes(q) || prodDesc.includes(q);
                  })
                  .slice(0, 30);

                if (candidates.length === 0) {
                  return (
                    <div className="py-12 text-center text-zinc-400">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                      <p className="text-xs font-bold text-zinc-600">Nenhum lote disponível encontrado</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {q ? `Nenhum lote em aberto corresponde a "${q}".` : 'Todos os lotes em aberto já estão alocados ou concluídos.'}
                      </p>
                    </div>
                  );
                }

                return candidates.map(candidate => (
                  <div
                    key={`${candidate.loteNumber}_${candidate.productCode}`}
                    className="p-3 bg-white border border-zinc-200 rounded-xl hover:border-zinc-400 hover:shadow-2xs transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-extrabold text-zinc-900">
                          #{candidate.loteNumber}
                        </span>
                        {candidate.productCode && (
                          <span className="text-[10px] text-zinc-500 font-mono">
                            [{candidate.productCode}]
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 font-medium">
                          {getEffectiveStatus(candidate)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-zinc-800 truncate mt-0.5">
                        {candidate.productDescription || 'Sem descrição'}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono mt-1">
                        <span>{Number(candidate.quantityKg || 0).toLocaleString('pt-BR')} kg</span>
                        <span>•</span>
                        <span>{Number(candidate.quantity || 0).toLocaleString('pt-BR')} un</span>
                        {candidate.dataPrevisao && (
                          <>
                            <span>•</span>
                            <span>Prev: {formatDateOnly(candidate.dataPrevisao)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConfirmAddLote(candidate)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1 shadow-2xs hover:shadow-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{addLoteModalTarget === 'envase' ? 'Liberar Envase' : 'Adicionar'}</span>
                    </button>
                  </div>
                ));
              })()}
            </div>

            {/* Rodapé */}
            <div className="p-3 bg-zinc-100 border-t border-zinc-200 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setAddLoteModalTarget(null)}
                className="px-4 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedKitOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="font-bold text-sm text-zinc-900">
                  Ordem de Montagem #{selectedKitOrder.orderNumber}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {selectedKitOrder.kitProductDescription} (SKU: {selectedKitOrder.kitProductCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKitOrder(null)}
                className="p-1 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-zinc-700 block mb-1">Status da Ordem:</label>
                <select
                  id="kit-status-select"
                  defaultValue={selectedKitOrder.status}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="PENDING">Pendente (Aguardando)</option>
                  <option value="IN_PROGRESS">Em Montagem</option>
                  <option value="COMPLETED">Concluído</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Quantidade Montada:</label>
                <input
                  id="kit-qty-assembled"
                  type="number"
                  defaultValue={selectedKitOrder.quantityAssembled ?? selectedKitOrder.quantity}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 font-mono font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <span className="text-[10px] text-zinc-400 mt-1 block">
                  Total solicitado na ordem: {selectedKitOrder.quantity} kits.
                </span>
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Observações / Motivo de Espera:</label>
                <textarea
                  id="kit-obs"
                  defaultValue={selectedKitOrder.observations || ''}
                  placeholder="Ex: Em Espera - Aguardando caixa do fornecedor..."
                  rows={3}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              {/* Resumo de Tempo de Montagem */}
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-zinc-600">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5 text-zinc-500" />
                    Criado em:
                  </span>
                  <span className="font-mono font-semibold">{formatDateTime(selectedKitOrder.createdAt)}</span>
                </div>
                {selectedKitOrder.completedAt && (
                  <div className="flex items-center justify-between text-zinc-600">
                    <span className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Concluído em:
                    </span>
                    <span className="font-mono font-semibold">{formatDateTime(selectedKitOrder.completedAt)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-200 text-zinc-900 font-bold">
                  <span>Tempo {selectedKitOrder.status === 'COMPLETED' ? 'Total de Montagem' : 'Decorrido'}:</span>
                  <span className="font-mono text-indigo-700 font-extrabold text-sm">
                    {formatDurationBetween(selectedKitOrder.createdAt, selectedKitOrder.completedAt)}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedKitOrder(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingKitOrder}
                onClick={() => {
                  const statusEl = document.getElementById('kit-status-select') as HTMLSelectElement;
                  const qtyEl = document.getElementById('kit-qty-assembled') as HTMLInputElement;
                  const obsEl = document.getElementById('kit-obs') as HTMLTextAreaElement;
                  handleUpdateKitOrder(
                    selectedKitOrder.id,
                    statusEl.value,
                    Number(qtyEl.value) || 0,
                    obsEl.value.trim()
                  );
                }}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingKitOrder && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Salvar Ordem de Kit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE HISTÓRICO DE DATAS E MUDANÇAS DE STATUS */}
      {historyModalLote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
              <div>
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-zinc-700" />
                  <h3 className="font-bold text-base text-zinc-900">
                    Histórico do Lote #{historyModalLote.loteNumber}
                  </h3>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-md">
                  {historyModalLote.productDescription} • {Number(historyModalLote.quantity).toLocaleString('pt-BR')} un ({Number(historyModalLote.quantityKg).toLocaleString('pt-BR')} kg)
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHistoryModalLote(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* TEMPO EM CADA ETAPA */}
              {(() => {
                const metrics = calculateStageDurations(historyModalLote);
                return (
                  <div className="bg-gradient-to-br from-zinc-50 to-zinc-100/70 border border-zinc-200 rounded-lg p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-zinc-200/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-zinc-700" />
                        <span className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">
                          Tempo em Cada Etapa
                        </span>
                      </div>
                      <div className="text-xs font-mono font-bold text-zinc-700 bg-white px-2.5 py-1 rounded-lg border border-zinc-200 flex items-center gap-1.5 shadow-2xs">
                        <span>Tempo Total:</span>
                        <span className={metrics.totalIsCompleted ? "text-emerald-700 font-extrabold" : "text-indigo-700 font-extrabold"}>
                          {metrics.totalDuration}
                        </span>
                        {metrics.totalIsCompleted && (
                          <span className="text-[10px] text-emerald-600 font-medium">✓ finalizado</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      {metrics.stages.map((st) => (
                        <div
                          key={st.stage}
                          className={cn(
                            "p-2.5 rounded-xl border text-xs flex flex-col justify-between transition-all",
                            st.isActive
                              ? "bg-white border-blue-400 ring-2 ring-blue-100 shadow-xs"
                              : st.isCompleted
                                ? "bg-white border-zinc-200/90 shadow-2xs"
                                : "bg-zinc-50/50 border-zinc-200/50 text-zinc-400 opacity-75"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn(
                              "font-bold text-xs",
                              st.isActive ? "text-blue-900 font-extrabold" : st.isCompleted ? "text-zinc-800" : "text-zinc-500"
                            )}>
                              {st.label}
                            </span>
                            {st.isActive ? (
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-blue-100 text-blue-800 animate-pulse">
                                Ativa
                              </span>
                            ) : st.isCompleted ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : null}
                          </div>

                          <div className="mt-2 flex items-baseline justify-between pt-1.5 border-t border-zinc-100">
                            <span className="text-[10px] text-zinc-400 font-medium">Duração:</span>
                            <span className={cn(
                              "font-mono font-bold text-xs",
                              st.isActive ? "text-blue-700 font-extrabold" : st.isCompleted ? "text-zinc-900" : "text-zinc-400"
                            )}>
                              {st.durationFormatted}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ESTIMATIVA DE ENVASE & APROVEITAMENTO DE MASSA NO HISTÓRICO */}
              {(() => {
                const totalUn = Number(historyModalLote.quantity) || 0;
                const totalMassa = Number(historyModalLote.quantityKg) || 0;
                const parcQty = Number(historyModalLote.quantidadeEnvasadaParcial || (historyModalLote as any).quantidade_envasada_parcial) || 0;
                const isFin = Boolean(historyModalLote.dataFinalizada || getEffectiveStatus(historyModalLote) === 'Ordem Finalizada');
                const qtdReal = isFin ? totalUn : (parcQty > 0 ? parcQty : 0);
                const massaReal = totalUn > 0 && qtdReal > 0 ? Math.round(((qtdReal * totalMassa) / totalUn) * 100) / 100 : (isFin ? totalMassa : 0);
                const rendPct = totalUn > 0 && qtdReal > 0 ? Math.min(100, Math.round((qtdReal / totalUn) * 1000) / 10) : (isFin ? 100 : 0);
                const saldUn = Math.max(0, totalUn - qtdReal);
                const saldKg = Math.max(0, Math.round((totalMassa - massaReal) * 100) / 100);

                const envItem = programacaoEnvase.find(it => (it.loteNumber || '').trim() === (historyModalLote.loteNumber || '').trim());
                const linEnvase = envItem?.linha || 'Linha 1';
                const minEstimados = totalUn > 0 ? Math.round((totalUn / 1200) * 60) : 0;
                const hEst = Math.floor(minEstimados / 60);
                const mEst = minEstimados % 60;
                const tempoFmtEnvase = `${hEst}h ${mEst.toString().padStart(2, '0')}min`;

                return (
                  <div className="space-y-3">
                    {/* Bloco Estimativa de Envase */}
                    <div className="bg-sky-50/40 border border-sky-200 rounded-xl p-3.5 text-xs space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-sky-100">
                        <span className="font-bold text-sky-950 flex items-center gap-1.5">
                          <Droplets className="h-4 w-4 text-sky-600" />
                          Estimativa de Envase ({linEnvase})
                        </span>
                        <span className="font-mono text-[10px] bg-sky-100 text-sky-900 px-2 py-0.5 rounded font-bold">
                          1.200 un/h nominal
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 font-mono">
                        <div>
                          <span className="text-[10px] text-zinc-400 block font-sans">Tempo Previsto:</span>
                          <span className="font-bold text-sky-900">{tempoFmtEnvase}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block font-sans">Início do Envase:</span>
                          <span className="text-zinc-800">{historyModalLote.dataEnvase ? formatDateTime(historyModalLote.dataEnvase) : 'Aguardando linha'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bloco Aproveitamento de Massa */}
                    <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-3.5 text-xs space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-emerald-100">
                        <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                          <CheckSquare className="h-4 w-4 text-emerald-600" />
                          Histórico de Rendimento & Fechamento de Massa
                        </span>
                        <span className="font-mono text-[10px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded font-bold">
                          {rendPct > 0 ? `${rendPct}% aproveitamento` : 'Em processamento'}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center font-mono">
                        <div className="bg-white p-2 rounded-lg border border-zinc-200">
                          <span className="text-[9px] uppercase font-bold text-zinc-400 block font-sans">Planejado</span>
                          <span className="font-bold text-zinc-800">{totalMassa} kg</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-purple-200">
                          <span className="text-[9px] uppercase font-bold text-purple-600 block font-sans">Apontado</span>
                          <span className="font-bold text-purple-700">{massaReal} kg</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-emerald-200">
                          <span className="text-[9px] uppercase font-bold text-emerald-600 block font-sans">Rendimento</span>
                          <span className="font-bold text-emerald-700">{rendPct > 0 ? `${rendPct}%` : '—'}</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-zinc-200">
                          <span className="text-[9px] uppercase font-bold text-zinc-400 block font-sans">Saldo/Perda</span>
                          <span className="font-bold text-amber-700">{saldKg} kg</span>
                        </div>
                      </div>
                      {rendPct > 0 && (
                        <div className="w-full bg-zinc-200 h-2 rounded-full overflow-hidden mt-1">
                          <div className={cn("h-full rounded-full", rendPct >= 98 ? "bg-emerald-600" : "bg-amber-500")} style={{ width: `${Math.max(4, rendPct)}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="bg-zinc-50 border border-zinc-200/80 rounded-lg p-4 space-y-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Datas Registradas por Etapa
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-amber-900">Pesagem:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataPesagem)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-blue-900">Produção:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataProducao)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-purple-900">Envase:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataEnvase)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-cyan-900">Rotulagem:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataRotulagem)}</span>
                  </div>
                  {historyModalLote.dataPrevisao && (
                    <div className="col-span-2 flex items-center justify-between p-2 bg-indigo-50/70 rounded-xl border border-indigo-200">
                      <span className="font-semibold text-indigo-950 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                        Previsão de Produção (Meta):
                      </span>
                      <span className="font-mono text-indigo-800 font-bold">{formatDateTime(historyModalLote.dataPrevisao)}</span>
                    </div>
                  )}
                  {historyModalLote.dataEmEspera && (
                    <div className="col-span-2 flex items-center justify-between p-2 bg-orange-50/60 rounded-xl border border-orange-200">
                      <span className="font-semibold text-orange-950">Em Espera ({historyModalLote.motivoEspera || 'Pausado'}):</span>
                      <span className="font-mono text-orange-800">{formatDateTime(historyModalLote.dataEmEspera)}</span>
                    </div>
                  )}
                  <div className="col-span-2 flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-100">
                    <span className="font-semibold text-emerald-900">Finalizada:</span>
                    <span className="font-mono text-zinc-600">{formatDateTime(historyModalLote.dataFinalizada)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Linha do Tempo de Alterações
                </span>

                {loadingHistory ? (
                  <div className="py-8 text-center text-zinc-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-zinc-400" />
                    <p className="text-xs">Carregando histórico detalhado...</p>
                  </div>
                ) : historyList.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 border border-dashed border-zinc-200 rounded-lg">
                    <Info className="h-5 w-5 mx-auto mb-1 text-zinc-300" />
                    <p className="text-xs font-semibold text-zinc-600">Nenhum evento gravado anteriormente</p>
                    <p className="text-[11px] text-zinc-400">As novas alterações serão registradas aqui em tempo real.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyList.map((entry, idx) => {
                      const nextEntry = historyList[idx + 1];
                      const durationInStatus = nextEntry ? formatDurationBetween(entry.changedAt, nextEntry.changedAt) : null;

                      return (
                        <div
                          key={entry.id}
                          className="flex items-start justify-between gap-3 p-3 bg-white border border-zinc-200 rounded-xl text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "px-2 py-0.5 rounded-md text-[10px] font-bold border",
                              entry.status === 'Previsão Alterada'
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : getBadgeClass(entry.status)
                            )}>
                              {entry.status}
                            </span>
                            <div>
                              <span className="font-bold text-zinc-900">{entry.changedBy || 'Operador'}</span>
                              {entry.notes && (
                                <span className={cn(
                                  "text-[10px] ml-1.5 font-bold",
                                  entry.status === 'Previsão Alterada' ? "text-indigo-800" : "text-orange-800"
                                )}>
                                  • {entry.notes}
                                </span>
                              )}
                              {durationInStatus && (
                                <div className="text-[10px] text-zinc-400 mt-0.5">
                                  Permaneceu por: <strong className="font-mono text-zinc-600">{durationInStatus}</strong>
                                </div>
                              )}
                            </div>
                          </div>

                          <span className="text-[11px] font-mono text-zinc-500 shrink-0 text-right">
                            {formatDateTime(entry.changedAt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3.5 bg-zinc-50 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryModalLote(null)}
                className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVA SOLICITAÇÃO DE TERCEIRIZADO */}
      {showNovaSolicitacaoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-lg w-full border border-zinc-200 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Tag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900">Nova Solicitação para Terceirizado</h3>
                  <p className="text-xs text-zinc-500">Cadastre o produto e quantidade para produzir externamente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNovaSolicitacaoModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Código SKU e Descrição */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700">REF / SKU *</label>
                    {loadingProductLookup && <RefreshCw className="h-3 w-3 animate-spin text-indigo-600" />}
                  </div>
                  <input
                    type="text"
                    value={solicProductCode}
                    onChange={e => handleProductCodeChange(e.target.value)}
                    placeholder="Ex: 5.11.002"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    autoFocus
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700">Descrição do Produto</label>
                    {solicUnitWeight && solicUnitWeight > 0 && (
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                        {solicUnitWeight >= 1 ? `${solicUnitWeight} kg/un` : `${Math.round(solicUnitWeight * 1000)} ml/un`}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={solicProductDesc}
                    onChange={e => {
                      setSolicProductDesc(e.target.value);
                      const w = parseUnitWeightFromDescription(e.target.value);
                      if (w && !isCustomWeight) setSolicUnitWeight(w);
                    }}
                    placeholder="Descrição puxada automaticamente do cadastro"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              </div>

              {/* Quantidades Bi-Direcionais (KG <-> UN) */}
              <div className="p-3.5 bg-zinc-50/80 border border-zinc-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                    <Calculator className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Quantidades Programadas</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {solicUnitWeight && solicUnitWeight > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsCustomWeight(!isCustomWeight)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                      >
                        {isCustomWeight ? "Ocultar fator" : "Ajustar fator conversão"}
                      </button>
                    )}
                  </div>
                </div>

                {isCustomWeight && (
                  <div className="flex items-center gap-2 p-2 bg-indigo-50/60 border border-indigo-200 rounded-xl text-xs text-indigo-950">
                    <span className="text-[11px] font-semibold shrink-0">Peso Unitário (kg por frasco/unidade):</span>
                    <input
                      type="number"
                      step="0.001"
                      value={solicUnitWeight || ''}
                      onChange={e => handleCustomWeightChange(e.target.value)}
                      placeholder="Ex: 0.5"
                      className="w-24 bg-white border border-indigo-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                    />
                    <span className="text-[10px] text-indigo-700">kg/un</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                      <span>Quantidade em KG</span>
                      <span className="text-[10px] text-zinc-400 font-normal">Massa Total</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        value={solicQuantityKg}
                        onChange={e => handleQuantityKgChange(e.target.value)}
                        placeholder="Ex: 1000"
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 pr-9 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 pointer-events-none">
                        KG
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                      <span>Quantidade em Unidades</span>
                      <span className="text-[10px] text-zinc-400 font-normal">Frascos / Peças</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        value={solicQuantityUn}
                        onChange={e => handleQuantityUnChange(e.target.value)}
                        placeholder="Ex: 2000"
                        className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 pr-9 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 pointer-events-none">
                        UN
                      </span>
                    </div>
                  </div>
                </div>

                {Boolean(solicQuantityKg && solicQuantityUn && solicUnitWeight) && (
                  <div className="text-[11px] text-zinc-600 bg-white border border-zinc-200/80 rounded-xl px-3 py-1.5 flex items-center justify-between">
                    <span>
                      Relação: <strong>{Number(solicQuantityKg).toLocaleString('pt-BR')} KG</strong> equivalem a <strong>{Number(solicQuantityUn).toLocaleString('pt-BR')} UN</strong>
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      (Fator: {solicUnitWeight} kg/un)
                    </span>
                  </div>
                )}
              </div>

              {/* Fornecedor e Previsão de Entrega */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Fornecedor / Terceirista</label>
                  <input
                    type="text"
                    list="terceiristas-sugeridos-list"
                    value={solicFornecedor}
                    onChange={e => setSolicFornecedor(e.target.value)}
                    placeholder="Ex: DAC Cosméticos, Vhiory..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                  <datalist id="terceiristas-sugeridos-list">
                    {suggestedFornecedores.map(f => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Previsão de Produção / Entrega</label>
                  <input
                    type="date"
                    value={solicPrevisao}
                    onChange={e => setSolicPrevisao(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              </div>

              {/* Lote Específico (Opcional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
                  <span>Número do Lote ERP (Opcional)</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Isola este lote para Terceirizados</span>
                </label>
                <input
                  type="text"
                  value={solicLoteNumber}
                  onChange={e => setSolicLoteNumber(e.target.value)}
                  placeholder="Ex: 26038 (se já souber o número do lote)"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Observações da Demanda</label>
                <textarea
                  rows={2}
                  value={solicObservacoes}
                  onChange={e => setSolicObservacoes(e.target.value)}
                  placeholder="Informações sobre embalagens, matéria-prima, envio de insumos..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNovaSolicitacaoModal(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-200/60 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateSolicitacao}
                disabled={savingSolicitacao}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingSolicitacao && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Salvar Solicitação</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VINCULAR LOTE */}
      {showVincularModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900">Vincular a Lote ERP</h3>
                  <p className="text-xs text-zinc-500">Selecione um lote recente ou informe o número manualmente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVincularModal(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Resumo da solicitação */}
              <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-500 uppercase tracking-wider text-[10px]">Produto Solicitado</span>
                  <span className="px-2 py-0.5 rounded-md bg-zinc-200/80 text-zinc-700 font-mono font-bold text-[11px]">
                    {showVincularModal.productCode}
                  </span>
                </div>
                <p className="font-medium text-zinc-800 text-xs">
                  {showVincularModal.productDescription}
                </p>
                <div className="flex items-center gap-4 pt-1 border-t border-zinc-200/60 text-zinc-600 text-[11px]">
                  <span><strong>Qtd Solicitada:</strong> {showVincularModal.quantity.toLocaleString('pt-BR')} {showVincularModal.unit}</span>
                  {showVincularModal.fornecedor && (
                    <span><strong>Fornecedor:</strong> {showVincularModal.fornecedor}</span>
                  )}
                </div>
              </div>

              {/* Lotes sugeridos do produto no ERP */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <span>Lotes Recentes deste Produto no ERP</span>
                    {loadingLotesRecentes && <RefreshCw className="h-3 w-3 animate-spin text-indigo-600" />}
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    {lotesSugeridosParaVinculo.length > 0 ? `${lotesSugeridosParaVinculo.length} disponível(is)` : ''}
                  </span>
                </div>

                {loadingLotesRecentes && lotesSugeridosParaVinculo.length === 0 ? (
                  <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
                    <span>Buscando lotes recentes no ERP...</span>
                  </div>
                ) : lotesSugeridosParaVinculo.length > 0 ? (
                  <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100 max-h-56 overflow-y-auto bg-white shadow-inner">
                    {lotesSugeridosParaVinculo.map(l => {
                      const isSelected = vincularLoteInput === l.loteNumber;
                      return (
                        <button
                          key={l.loteNumber}
                          type="button"
                          onClick={() => setVincularLoteInput(l.loteNumber)}
                          className={cn(
                            "w-full text-left p-2.5 px-3 flex items-center justify-between gap-3 transition-colors cursor-pointer text-xs",
                            isSelected
                              ? "bg-indigo-50/90 text-indigo-950 font-medium"
                              : "hover:bg-zinc-50/80 text-zinc-700"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={cn(
                              "font-mono font-bold px-2 py-0.5 rounded-md text-xs",
                              isSelected ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-800"
                            )}>
                              #{l.loteNumber}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                                <span>Data: {formatDateOnly(l.date || l.dataPrevisao)}</span>
                                <span>•</span>
                                <span>
                                  {l.quantity ? `${l.quantity.toLocaleString('pt-BR')} un` : ''}
                                  {l.quantityKg ? ` (${l.quantityKg.toLocaleString('pt-BR')} kg)` : ''}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
                              {l.customStatus || l.erpStatusLabel || l.erpStatus || 'Aguardando'}
                            </span>
                            {isSelected ? (
                              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                <Check className="h-3 w-3 stroke-[3]" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-zinc-300 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>Nenhum lote recente não vinculado foi encontrado para este produto no histórico do ERP. Digite o número desejado abaixo.</span>
                  </div>
                )}
              </div>

              {/* CAMPO DE ENTRADA MANUAL DO LOTE */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-zinc-700">Número do Lote Selecionado *</label>
                <input
                  type="text"
                  value={vincularLoteInput}
                  onChange={e => setVincularLoteInput(e.target.value.trim())}
                  placeholder="Ex: 260388"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600"
                />
                <p className="text-[11px] text-zinc-500">
                  O lote será classificado como Terceirizado e passará imediatamente para a esteira normal de acompanhamento.
                </p>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowVincularModal(null)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-200/60 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleVincularSolicitacao}
                disabled={savingVinculo || !vincularLoteInput.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {savingVinculo && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Confirmar Vínculo</span>
              </button>
            </div>
          </div>
        </div>
      )}
          {/* MODAL DE EDIÇÃO DE TERCEIRIZADO (FORNECEDOR E PREVISÃO) */}
      {editTerceirizadoLote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-zinc-900">
                    {editTerceirizadoLote.isTerceirizado ? 'Editar Lote Terceirizado' : 'Mover para Terceirizados'}
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono">
                    Lote #{editTerceirizadoLote.loteNumber} • {editTerceirizadoLote.productCode}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditTerceirizadoLote(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-1">
                <p className="text-xs font-bold text-zinc-800 line-clamp-2">
                  {editTerceirizadoLote.productDescription}
                </p>
                <div className="flex items-center justify-between text-xs text-zinc-600 pt-1 border-t border-zinc-200/60 font-mono">
                  <span>Massa: <strong>{Number(editTerceirizadoLote.quantityKg || 0).toLocaleString('pt-BR')} kg</strong></span>
                  <span>Unidades: <strong>{Number(editTerceirizadoLote.quantity || 0).toLocaleString('pt-BR')} un</strong></span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Fornecedor Terceirizado
                </label>
                <input
                  type="text"
                  value={editTerceirizadoFornecedor}
                  onChange={e => setEditTerceirizadoFornecedor(e.target.value)}
                  placeholder="Nome do terceirista / fornecedor..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Previsão de Entrega
                </label>
                <input
                  type="date"
                  value={editTerceirizadoPrevisao}
                  onChange={e => setEditTerceirizadoPrevisao(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              {editTerceirizadoLote.isTerceirizado && (
                <div className="pt-2 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={handleReturnTerceirizadoFromModal}
                    disabled={savingTerceirizado}
                    className="text-xs text-amber-700 hover:text-amber-900 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Retornar para Produção Interna</span>
                  </button>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-zinc-50/80 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTerceirizadoLote(null)}
                className="px-3.5 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditTerceirizado}
                disabled={savingTerceirizado}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingTerceirizado && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ESPERA DO ENVASE COM MOTIVO */}
      {envaseEsperaItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-md w-full border border-zinc-200 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-amber-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <PauseCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900">Colocar Envase em Espera</h3>
                  <p className="text-xs text-zinc-500">Lote #{envaseEsperaItem.loteNumber} • {envaseEsperaItem.linha}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnvaseEsperaItem(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200 text-xs space-y-1">
                <div className="font-bold text-zinc-900">{envaseEsperaItem.productCode} - {envaseEsperaItem.productDescription}</div>
                <div className="flex items-center justify-between text-zinc-500 font-mono text-[11px] pt-1">
                  <span>Qtd: <strong>{Number(envaseEsperaItem.quantity).toLocaleString('pt-BR')} un</strong></span>
                  <span>Massa: <strong>{Number(envaseEsperaItem.quantityKg).toLocaleString('pt-BR')} kg</strong></span>
                  <span>Linha: <strong>{envaseEsperaItem.linha}</strong></span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Motivo da Espera / Pausa *</label>
                <select
                  value={envaseEsperaMotivo}
                  onChange={e => setEnvaseEsperaMotivo(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                >
                  <option value="Falta de Embalagem / Frasco">Falta de Embalagem / Frasco</option>
                  <option value="Falta de Tampa / Válvula / Bico">Falta de Tampa / Válvula / Bico</option>
                  <option value="Falta de Rótulo / Etiqueta">Falta de Rótulo / Etiqueta</option>
                  <option value="Envase Parcial (interrompido)">Envase Parcial (interrompido)</option>
                  <option value="Problema Mecânico na Envasadora">Problema Mecânico na Envasadora</option>
                  <option value="Aguardando Liberação do CQ / Físico-Químico">Aguardando Liberação do CQ / Físico-Químico</option>
                  <option value="Setup / Troca de Formato de Linha">Setup / Troca de Formato de Linha</option>
                  <option value="Aguardando Matéria-Prima / Bulk">Aguardando Matéria-Prima / Bulk</option>
                  <option value="Outro Motivo">Outro Motivo (especificar abaixo)</option>
                </select>
              </div>

              {envaseEsperaMotivo === 'Envase Parcial (interrompido)' ? (
                <div className="space-y-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-amber-950">
                      Quantidade Já Envasada (unidades) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Number(envaseEsperaItem.quantity) || undefined}
                      value={envaseEsperaParcialQtd || ''}
                      onChange={e => setEnvaseEsperaParcialQtd(e.target.value ? Number(e.target.value) : null)}
                      placeholder={`Ex: 500 (Total da ordem: ${Number(envaseEsperaItem.quantity).toLocaleString('pt-BR')} un)`}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                    />
                    {envaseEsperaParcialQtd !== null && envaseEsperaParcialQtd > 0 && (
                      <div className="text-[11px] text-amber-900 font-medium">
                        Restante a envasar posteriormente: <strong>{Math.max(0, (Number(envaseEsperaItem.quantity) || 0) - envaseEsperaParcialQtd).toLocaleString('pt-BR')} un</strong>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-amber-950">
                      Motivo de não ter envasado o restante
                    </label>
                    <textarea
                      rows={2}
                      value={envaseEsperaMotivoRestante}
                      onChange={e => setEnvaseEsperaMotivoRestante(e.target.value)}
                      placeholder="Ex: Faltou frasco para o restante do lote, troca de lote urgente..."
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-400"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">
                    Observações Adicionais / Detalhes {envaseEsperaMotivo === 'Outro Motivo' && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    rows={2}
                    value={envaseEsperaCustom}
                    onChange={e => setEnvaseEsperaCustom(e.target.value)}
                    placeholder="Ex: Faltando frasco de 250ml âmbar, previsão de chegada às 14h..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEnvaseEsperaItem(null)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-200/60 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmEnvaseEspera}
                disabled={
                  (envaseEsperaMotivo === 'Outro Motivo' && !envaseEsperaCustom.trim()) ||
                  (envaseEsperaMotivo === 'Envase Parcial (interrompido)' && (!envaseEsperaParcialQtd || envaseEsperaParcialQtd <= 0))
                }
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                <span>Confirmar Espera</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONTEXTUAL: VER DETALHES DO ITEM */}
      {selectedLoteDetails && (() => {
        const { lote, etapa: _etapa, quadro: _quadro } = selectedLoteDetails as any;
        const etapa = _etapa || _quadro || 'ordens';
        const eff = getEffectiveStatus(lote);
        const prevBadge = getPrevisaoBadge(getEffectivePrevisao(lote.date, lote.dataPrevisao));
        const hasCaldeira = lotesComCaldeira.has(lote.loteNumber) || lote.category === 'Caldeira';
        const caldeiraLigadaNoLote = caldeiraAtiva && caldeiraAtiva.lotes.includes(lote.loteNumber);
        const historicoCaldeiraLote = caldeiraHistorico.filter(h => h.lotes.includes(lote.loteNumber));

        // Dados quantitativos e aproveitamento de massa
        const totalUnidades = Number(lote.quantity) || 0;
        const totalKg = Number(lote.quantityKg) || 0;
        const parcialQty = Number(lote.quantidadeEnvasadaParcial || (lote as any).quantidade_envasada_parcial) || 0;
        const isFinalizada = Boolean(lote.dataFinalizada || eff === 'Ordem Finalizada');
        const qtdRealEnvasada = isFinalizada ? totalUnidades : (parcialQty > 0 ? parcialQty : 0);
        const massaRealKg = totalUnidades > 0 && qtdRealEnvasada > 0 ? Math.round(((qtdRealEnvasada * totalKg) / totalUnidades) * 100) / 100 : (isFinalizada ? totalKg : 0);
        const rendimentoPct = totalUnidades > 0 && qtdRealEnvasada > 0 ? Math.min(100, Math.round((qtdRealEnvasada / totalUnidades) * 1000) / 10) : (isFinalizada ? 100 : 0);
        const saldoUn = Math.max(0, totalUnidades - qtdRealEnvasada);
        const saldoKg = Math.max(0, Math.round((totalKg - massaRealKg) * 100) / 100);

        // Estimativa de Envase
        const envaseItem = programacaoEnvase.find(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim());
        const linhaEnvase = envaseItem?.linha || 'Linha 1';
        const taxaMediaEnvasePorHora = 1200; // 1.200 un/h taxa nominal média operacional
        const tempoEstimadoMinutos = totalUnidades > 0 ? Math.round((totalUnidades / taxaMediaEnvasePorHora) * 60) : 0;
        const horasEstimadas = Math.floor(tempoEstimadoMinutos / 60);
        const minutosEstimados = tempoEstimadoMinutos % 60;
        const tempoFormatadoEnvase = `${horasEstimadas}h ${minutosEstimados.toString().padStart(2, '0')}min`;

        const dataInicioEnvase = lote.dataEnvase || lote.dataLiberadoEnvase;
        let previsaoConclusaoEnvase: string | null = null;
        if (dataInicioEnvase) {
          try {
            const d = new Date(dataInicioEnvase);
            if (!isNaN(d.getTime())) {
              const termino = new Date(d.getTime() + tempoEstimadoMinutos * 60000);
              previsaoConclusaoEnvase = `${termino.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${termino.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            }
          } catch {}
        }

        // Programação de Rotulagem
        const rotulagemItem = programacaoRotulagem.find(it => (it.loteNumber || '').trim() === (lote.loteNumber || '').trim());
        const tipoRotulagem = rotulagemItem?.tipo === 'MAQUINA' ? 'Máquina Automatizada' : rotulagemItem?.tipo === 'MANUAL' ? 'Rotulagem Manual' : 'Padrão';

        // Verificação de etapas
        const isPesagemConcluida = pesagemConcluidosLotes.includes(lote.loteNumber) || getLoteEtapaStatus(lote, 'pesagem').isConcluido || Boolean(lote.dataProducao || lote.dataLiberadoEnvase || isFinalizada);
        const isProducaoConcluida = producaoConcluidosLotes.includes(lote.loteNumber) || getLoteEtapaStatus(lote, 'producao').isConcluido || lote.customStatus === 'Liberado para Envase' || Boolean(lote.dataEnvase || isFinalizada);
        const isRotulagemConcluida = rotulagemItem?.statusRotulagem === 'CONCLUIDO' || isFinalizada;
        const isEnvaseConcluido = envaseItem?.statusEnvase === 'CONCLUIDO' || isFinalizada;

        const getEtapaInfo = () => {
          switch (etapa) {
            case 'pesagem':
              return {
                title: 'Detalhes do Lote — Pesagem',
                icon: <Scale className="h-5 w-5 text-indigo-600" />,
              };
            case 'producao':
              return {
                title: 'Detalhes do Lote — Fabricação',
                icon: <FlaskConical className="h-5 w-5 text-amber-600" />,
              };
            case 'rotulagem':
              return {
                title: 'Detalhes do Lote — Rotulagem',
                icon: <Tag className="h-5 w-5 text-blue-600" />,
              };
            case 'envase':
              return {
                title: 'Detalhes do Lote — Envase',
                icon: <Droplets className="h-5 w-5 text-sky-600" />,
              };
            case 'ordens':
            default:
              return {
                title: 'Detalhes da Ordem de Produção',
                icon: <CheckSquare className="h-5 w-5 text-emerald-600" />,
              };
          }
        };

        const info = getEtapaInfo();

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-3xl w-full border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              {/* Top Header */}
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white border border-zinc-200 rounded-xl shadow-2xs">
                    {info.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base text-zinc-900">{info.title}</h3>
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-900 text-white">
                        #{lote.loteNumber}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 font-medium line-clamp-1 mt-0.5">
                      {lote.productCode} — {lote.productDescription}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLoteDetails(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-6 overflow-y-auto space-y-5">
                {/* 1. Métricas Chave do Lote */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Qtd Planejada</span>
                    <span className="font-mono font-bold text-sm text-zinc-900">{totalUnidades.toLocaleString('pt-BR')} un</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Massa Total</span>
                    <span className="font-mono font-bold text-sm text-zinc-900">{totalKg.toLocaleString('pt-BR')} kg</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Data de Abertura</span>
                    <span className="font-mono text-sm font-semibold text-zinc-800">{formatDateOnly(lote.date)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Status Geral</span>
                    <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-bold border inline-block mt-0.5", getBadgeClass(eff))}>
                      {eff}
                    </span>
                  </div>
                </div>

                {/* Previsão e Fornecedor Terceirizado */}
                {(prevBadge || lote.isTerceirizado) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {prevBadge && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-50 border border-zinc-200 rounded-lg">
                        <span className="text-zinc-500 font-medium">Previsão:</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-bold border", prevBadge.colorClass)}>
                          {prevBadge.label}
                        </span>
                      </div>
                    )}
                    {lote.isTerceirizado && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="font-bold">Terceirizado:</span>
                        <span>{lote.fornecedorTerceirizado || (lote as any).fornecedor_terceirizado || 'Fornecedor Externo'}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. JORNADA COMPLETA DAS 4 ETAPAS DE PRODUÇÃO */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-zinc-700" />
                      Jornada do Lote — 4 Etapas de Produção
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      Rastreabilidade contínua
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* ETAPA 1: PESAGEM */}
                    <div className={cn(
                      "p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 transition-all",
                      isPesagemConcluida
                        ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200"
                        : lote.dataPesagem
                          ? "bg-indigo-50/40 border-indigo-300 ring-1 ring-indigo-200"
                          : "bg-zinc-50 border-zinc-200 opacity-80"
                    )}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/60">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                          <Scale className="h-4 w-4 text-indigo-600" />
                          <span>1. Pesagem</span>
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold font-mono",
                          isPesagemConcluida
                            ? "bg-emerald-100 text-emerald-800"
                            : lote.dataPesagem
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-zinc-200 text-zinc-600"
                        )}>
                          {isPesagemConcluida ? '✓ Concluído' : lote.dataPesagem ? 'Na Balança' : 'Pendente'}
                        </span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="text-zinc-500">
                          Início: <strong className="text-zinc-800 font-sans">{lote.dataPesagem ? formatDateTime(lote.dataPesagem) : 'Aguardando'}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Duração: <strong className="text-indigo-700">{lote.dataPesagem ? formatDurationBetween(lote.dataPesagem, lote.dataProducao) : '—'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* ETAPA 2: PRODUÇÃO / FABRICAÇÃO */}
                    <div className={cn(
                      "p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 transition-all",
                      isProducaoConcluida
                        ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200"
                        : lote.dataProducao
                          ? "bg-amber-50/40 border-amber-300 ring-1 ring-amber-200"
                          : "bg-zinc-50 border-zinc-200 opacity-80"
                    )}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/60">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                          <FlaskConical className="h-4 w-4 text-amber-600" />
                          <span>2. Fabricação</span>
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold font-mono",
                          isProducaoConcluida
                            ? "bg-emerald-100 text-emerald-800"
                            : lote.dataProducao
                              ? "bg-amber-100 text-amber-800"
                              : "bg-zinc-200 text-zinc-600"
                        )}>
                          {isProducaoConcluida ? '✓ Liberado' : lote.dataProducao ? 'Em Reator' : 'Pendente'}
                        </span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="text-zinc-500 truncate" title={hasCaldeira ? 'Caldeira a Vapor + Reator' : (lote.category || 'Reator')}>
                          Eq: <strong className="text-zinc-800 font-sans">{hasCaldeira ? 'Caldeira + Reator' : (lote.category || 'Reator')}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Início: <strong className="text-zinc-800 font-sans">{lote.dataProducao ? formatDateTime(lote.dataProducao) : 'Aguardando'}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Duração: <strong className="text-amber-700">{lote.dataProducao ? formatDurationBetween(lote.dataProducao, lote.dataLiberadoEnvase || lote.dataEnvase) : '—'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* ETAPA 3: ROTULAGEM */}
                    <div className={cn(
                      "p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 transition-all",
                      isRotulagemConcluida
                        ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200"
                        : lote.dataRotulagem
                          ? "bg-blue-50/40 border-blue-300 ring-1 ring-blue-200"
                          : "bg-zinc-50 border-zinc-200 opacity-80"
                    )}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/60">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                          <Tag className="h-4 w-4 text-blue-600" />
                          <span>3. Rotulagem</span>
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold font-mono",
                          isRotulagemConcluida
                            ? "bg-emerald-100 text-emerald-800"
                            : lote.dataRotulagem
                              ? "bg-blue-100 text-blue-800"
                              : "bg-zinc-200 text-zinc-600"
                        )}>
                          {isRotulagemConcluida ? '✓ Concluído' : lote.dataRotulagem ? 'Rotulando' : 'Programado'}
                        </span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="text-zinc-500 truncate" title={tipoRotulagem}>
                          Modo: <strong className="text-zinc-800 font-sans">{tipoRotulagem}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Início: <strong className="text-zinc-800 font-sans">{lote.dataRotulagem ? formatDateTime(lote.dataRotulagem) : 'Aguardando'}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Duração: <strong className="text-blue-700">{lote.dataRotulagem ? formatDurationBetween(lote.dataRotulagem, lote.dataFinalizada) : '—'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* ETAPA 4: ENVASE */}
                    <div className={cn(
                      "p-3 rounded-xl border text-xs flex flex-col justify-between space-y-2 transition-all",
                      isEnvaseConcluido
                        ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200"
                        : lote.dataEnvase
                          ? "bg-sky-50/40 border-sky-300 ring-1 ring-sky-200"
                          : "bg-zinc-50 border-zinc-200 opacity-80"
                    )}>
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200/60">
                        <div className="flex items-center gap-1.5 font-bold text-zinc-900">
                          <Droplets className="h-4 w-4 text-sky-600" />
                          <span>4. Envase</span>
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold font-mono",
                          isEnvaseConcluido
                            ? "bg-emerald-100 text-emerald-800"
                            : lote.dataEnvase
                              ? "bg-sky-100 text-sky-800"
                              : "bg-zinc-200 text-zinc-600"
                        )}>
                          {isEnvaseConcluido ? '✓ Envasado' : lote.dataEnvase ? 'Em Linha' : 'Aguardando'}
                        </span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="text-zinc-500">
                          Linha: <strong className="text-zinc-800 font-sans">{linhaEnvase}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Entrada: <strong className="text-zinc-800 font-sans">{dataInicioEnvase ? formatDateTime(dataInicioEnvase) : 'Aguardando'}</strong>
                        </div>
                        <div className="text-zinc-500">
                          Duração: <strong className="text-sky-700">{lote.dataEnvase ? formatDurationBetween(lote.dataEnvase, lote.dataFinalizada) : '—'}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. ESTIMATIVA DE ENVASE */}
                <div className="bg-sky-50/40 border border-sky-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-sky-100">
                    <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                      <Droplets className="h-4 w-4 text-sky-600" />
                      Estimativa de Envase & Ritmo da Linha
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-sky-100 text-sky-900">
                      {linhaEnvase} • {taxaMediaEnvasePorHora.toLocaleString('pt-BR')} un/h nominal
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-sky-100 shadow-2xs font-mono">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block font-sans">Tempo Previsto de Envase</span>
                      <span className="text-sm font-bold text-sky-900">{tempoFormatadoEnvase}</span>
                      <span className="text-[10px] text-zinc-400 block font-sans mt-0.5">para {totalUnidades.toLocaleString('pt-BR')} unidades</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-sky-100 shadow-2xs font-mono">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block font-sans">Previsão Estimada de Término</span>
                      <span className="text-sm font-bold text-zinc-900">
                        {previsaoConclusaoEnvase || (dataInicioEnvase ? 'Em cálculo' : 'Disponível após liberação')}
                      </span>
                      <span className="text-[10px] text-zinc-400 block font-sans mt-0.5">
                        {dataInicioEnvase ? `Início: ${formatDateTime(dataInicioEnvase)}` : 'Aguardando entrada em linha'}
                      </span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-sky-100 shadow-2xs font-mono">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block font-sans">Status Operacional do Envase</span>
                      <span className={cn(
                        "text-xs font-bold font-sans inline-block mt-0.5 px-2 py-0.5 rounded",
                        isEnvaseConcluido
                          ? "bg-emerald-100 text-emerald-800"
                          : envaseItem?.statusEnvase === 'EM_ESPERA'
                            ? "bg-amber-100 text-amber-900"
                            : envaseItem?.statusEnvase === 'EM_ENVASE'
                              ? "bg-purple-100 text-purple-900"
                              : "bg-zinc-100 text-zinc-700"
                      )}>
                        {isEnvaseConcluido ? '✓ Envase Concluído' : envaseItem?.statusEnvase === 'EM_ESPERA' ? '⏸️ Linha em Espera' : envaseItem?.statusEnvase === 'EM_ENVASE' ? '⚡ Envasando em Linha' : 'Programado na Fila'}
                      </span>
                      {envaseItem?.motivoEspera && (
                        <span className="text-[10px] text-amber-700 block font-sans truncate mt-0.5" title={envaseItem.motivoEspera}>
                          {envaseItem.motivoEspera}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. HISTÓRICO DE APROVEITAMENTO DE MASSA & FECHAMENTO DE OP */}
                <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                    <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                      Histórico de Aproveitamento de Massa & Fechamento da OP
                    </span>
                    <span className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded-md font-bold",
                      isFinalizada
                        ? "bg-emerald-100 text-emerald-900"
                        : parcialQty > 0
                          ? "bg-purple-100 text-purple-900"
                          : "bg-zinc-100 text-zinc-700"
                    )}>
                      {isFinalizada ? 'Ordem Finalizada' : parcialQty > 0 ? 'Envase Parcial' : 'Em Andamento'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
                    <div className="bg-white p-2.5 rounded-lg border border-zinc-200 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block font-sans">Massa Planejada</span>
                      <span className="font-bold text-sm text-zinc-800">{totalKg.toLocaleString('pt-BR')} kg</span>
                      <span className="text-[10px] text-zinc-500 block font-sans">{totalUnidades.toLocaleString('pt-BR')} un</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-purple-200 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-purple-600 block font-sans">Real Envasado</span>
                      <span className="font-bold text-sm text-purple-700">{massaRealKg.toLocaleString('pt-BR')} kg</span>
                      <span className="text-[10px] text-purple-600 block font-sans">{qtdRealEnvasada.toLocaleString('pt-BR')} un</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-emerald-200 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-emerald-600 block font-sans">Aproveitamento</span>
                      <span className={cn(
                        "font-extrabold text-sm",
                        rendimentoPct >= 98 ? "text-emerald-700" : rendimentoPct >= 90 ? "text-amber-700" : "text-zinc-700"
                      )}>
                        {rendimentoPct > 0 ? `${rendimentoPct}%` : '—'}
                      </span>
                      <span className="text-[10px] text-zinc-400 block font-sans">meta: 98% a 100%</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-zinc-200 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block font-sans">Saldo / Perda</span>
                      <span className="font-bold text-sm text-amber-700">{saldoKg.toLocaleString('pt-BR')} kg</span>
                      <span className="text-[10px] text-amber-600 block font-sans">{saldoUn.toLocaleString('pt-BR')} un</span>
                    </div>
                  </div>

                  {/* Barra de Aproveitamento de Massa */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                      <span>Rendimento da Massa Produzida:</span>
                      <span className="font-bold text-emerald-800">
                        {rendimentoPct > 0 ? `${rendimentoPct}% aproveitamento` : 'Aguardando fechamento/apontamento'}
                      </span>
                    </div>
                    <div className="w-full bg-zinc-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          rendimentoPct >= 98
                            ? "bg-emerald-600"
                            : rendimentoPct >= 90
                              ? "bg-amber-500"
                              : rendimentoPct > 0
                                ? "bg-rose-500"
                                : "bg-zinc-300"
                        )}
                        style={{ width: `${Math.max(4, rendimentoPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                    <div>
                      <span className="text-zinc-500 block">Fechamento no Sistema:</span>
                      <span className="font-bold text-zinc-800 font-sans">
                        {isFinalizada
                          ? '✓ Ordem Finalizada no Chão de Fábrica'
                          : parcialQty > 0
                            ? '🌓 Apontamento Parcial Registrado'
                            : 'Em Aberto / Execução no Chão de Fábrica'}
                      </span>
                      {lote.dataFinalizada && (
                        <span className="text-[10px] font-mono text-zinc-500 block">
                          Finalizada em: {formatDateTime(lote.dataFinalizada)}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Integração / Lançamento ERP:</span>
                      <span className={cn(
                        "font-bold font-sans",
                        lote.erpStatus === 'EA'
                          ? "text-emerald-700"
                          : isFinalizada
                            ? "text-amber-700"
                            : "text-zinc-600"
                      )}>
                        {lote.erpStatus === 'EA'
                          ? '✓ Baixada e Conciliada no ERP'
                          : isFinalizada
                            ? 'Aguardando Lançamento no ERP'
                            : 'Ordem ativa na fábrica'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. CONTEXTO APROFUNDADO DA ETAPA */}
                {etapa === 'pesagem' && (
                  <div className="space-y-3 bg-indigo-50/30 border border-indigo-100 rounded-xl p-3.5">
                    <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <Scale className="h-4 w-4 text-indigo-600" />
                      Insumos & Matérias-Primas do Lote
                    </span>

                    {/* Alerta de Espera */}
                    {(lote.motivoEspera || lote.dataEmEspera || eff === 'Em Espera' || lote.customStatus === 'Em Espera') && (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <PauseCircle className="h-4 w-4 text-amber-600" />
                          <span>Lote Colocado em Espera</span>
                          {lote.dataEmEspera && (
                            <span className="text-[10px] font-mono text-amber-700 ml-auto">
                              desde {formatDateTime(lote.dataEmEspera)}
                            </span>
                          )}
                        </div>
                        <p className="text-amber-800 font-medium">
                          Motivo: <strong>{lote.motivoEspera || 'Aguardando liberação operacional'}</strong>
                        </p>
                        {(lote.insumoFaltanteCodigo || (lote as any).insumo_faltante_codigo) && (
                          <div className="text-[11px] text-amber-900 bg-amber-100/60 p-2 rounded-lg mt-1 font-mono">
                            Insumo Faltante: <strong>{lote.insumoFaltanteCodigo || (lote as any).insumo_faltante_codigo}</strong> - {lote.insumoFaltanteDescricao || (lote as any).insumo_faltante_descricao || ''}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ficha / Matérias Primas */}
                    {((lote.fichaOrdem || (lote as any).ficha_ordem)?.materias_primas?.length > 0) ? (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-zinc-700 block">
                          Ficha de Formulação ({((lote.fichaOrdem || (lote as any).ficha_ordem)?.materias_primas?.length)} itens):
                        </span>
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {((lote.fichaOrdem || (lote as any).ficha_ordem).materias_primas as any[]).map((mp, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-zinc-200">
                              <span className="font-mono text-zinc-800 truncate max-w-[380px]">
                                {mp.codigo || mp.code} - {mp.descricao || mp.description}
                              </span>
                              <span className="font-mono font-bold text-zinc-900 shrink-0">
                                {Number(mp.quantidade || mp.quantity || 0).toLocaleString('pt-BR')} {mp.unidade || 'kg'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 italic">Nenhuma matéria-prima discriminada nesta ordem no ERP.</p>
                    )}
                  </div>
                )}

                {etapa === 'producao' && (
                  <div className="space-y-3 bg-amber-50/30 border border-amber-100 rounded-xl p-3.5">
                    <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <Flame className="h-4 w-4 text-orange-600" />
                      Processamento Térmico (Caldeira / Vapor)
                    </span>

                    <div className={cn(
                      "p-3 rounded-xl border text-xs space-y-1.5 transition-all",
                      caldeiraLigadaNoLote
                        ? "bg-rose-50 border-rose-300 text-rose-950"
                        : hasCaldeira
                          ? "bg-orange-50 border-orange-200 text-orange-950"
                          : "bg-zinc-50 border-zinc-200 text-zinc-700"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Flame className={cn("h-4 w-4", caldeiraLigadaNoLote ? "fill-rose-500 text-rose-500 animate-pulse" : hasCaldeira ? "fill-orange-500 text-orange-500" : "text-zinc-400")} />
                          <span>Status do Vapor</span>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase",
                          caldeiraLigadaNoLote
                            ? "bg-rose-600 text-white animate-pulse"
                            : hasCaldeira
                              ? "bg-orange-200 text-orange-900"
                              : "bg-zinc-200 text-zinc-700"
                        )}>
                          {caldeiraLigadaNoLote ? 'Aquecendo Agora' : hasCaldeira ? 'Requer Caldeira' : 'Processo a Frio'}
                        </span>
                      </div>

                      {caldeiraLigadaNoLote && caldeiraAtiva && (
                        <p className="text-[11px] text-rose-800 font-medium">
                          🔥 Caldeira ligada desde <strong>{formatDateTime(caldeiraAtiva.ligouEm)}</strong> ({formatDurationBetween(caldeiraAtiva.ligouEm)}) pelo operador <strong>{caldeiraAtiva.operador}</strong>.
                        </p>
                      )}

                      {historicoCaldeiraLote.length > 0 && (
                        <div className="text-[11px] pt-1 border-t border-zinc-200/60 space-y-0.5">
                          <span className="font-semibold block">Histórico de aquecimentos:</span>
                          {historicoCaldeiraLote.map(h => (
                            <div key={h.id} className="text-zinc-600 font-mono">
                              • {formatDateTime(h.ligouEm)} até {formatDateTime(h.desligouEm)} ({h.duracaoMinutos} min) — {h.operador}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Observações Operacionais */}
                {lote.notes && (
                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">
                      Observações Registradas
                    </span>
                    <p className="text-zinc-700 italic">"{lote.notes}"</p>
                  </div>
                )}

                <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1">
                  <span>Última alteração por: <strong className="text-zinc-700 font-semibold">{lote.updatedBy || 'Sistema'}</strong></span>
                  {lote.updatedAt && <span className="font-mono">{formatDateTime(lote.updatedAt)}</span>}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const l = lote;
                    setSelectedLoteDetails(null);
                    handleOpenHistory(l);
                  }}
                  className="px-4 py-2 text-xs font-bold text-zinc-700 hover:text-zinc-950 bg-zinc-200/70 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Ver todo o histórico cronológico deste lote"
                >
                  <History className="h-4 w-4" />
                  <span>Histórico do Lote</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedLoteDetails(null)}
                  className="px-6 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL AJUSTAR DATAS E HORÁRIOS MANUALMENTE */}
      {editTimestampsLote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-lg w-full border border-zinc-200 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-1.5">
                    <span>Ajustar Datas do Lote #{editTimestampsLote.loteNumber}</span>
                  </h3>
                  <p className="text-xs text-zinc-500 truncate max-w-sm">
                    {editTimestampsLote.productDescription}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditTimestampsLote(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 max-h-[70vh] overflow-y-auto">
              <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-950">
                Ajuste manualmente os registros de horário de cada etapa do lote. Deixe em branco se a etapa ainda não foi iniciada ou concluída.
              </div>

              {/* Data Previsão / Programada */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Data Programada / Previsão (Dia de Produção)</span>
                </label>
                <input
                  type="date"
                  value={timestampsForm.dataPrevisao}
                  onChange={e => setTimestampsForm(prev => ({ ...prev, dataPrevisao: e.target.value }))}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Data Pesagem */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <Scale className="h-3.5 w-3.5 text-amber-600" />
                    <span>Início Pesagem</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataPesagem}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataPesagem: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Produção */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <FlaskConical className="h-3.5 w-3.5 text-blue-600" />
                    <span>Início Produção</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataProducao}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataProducao: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Liberado Envase */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
                    <span>Liberado para Envase</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataLiberadoEnvase}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataLiberadoEnvase: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Envase */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <Droplets className="h-3.5 w-3.5 text-purple-600" />
                    <span>Início Envase</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataEnvase}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataEnvase: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Rotulagem */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Entrada Rotulagem</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataRotulagem}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataRotulagem: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Data Finalizada */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <CheckSquare className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Finalização da Ordem</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={timestampsForm.dataFinalizada}
                    onChange={e => setTimestampsForm(prev => ({ ...prev, dataFinalizada: e.target.value }))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setEditTimestampsLote(null)}
                disabled={savingTimestamps}
                className="px-4 py-2 text-xs font-bold text-zinc-700 hover:text-zinc-950 bg-zinc-200/70 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSaveTimestamps}
                disabled={savingTimestamps}
                className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingTimestamps ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Salvar Datas</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Selecionar Data para Adiar Lote / Programação */}
      {adiarModalItem && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!savingAdiarLote) setAdiarModalItem(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30">
                  <CalendarPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight leading-none text-white">
                    Adiar Lote
                  </h3>
                  <p className="text-[11px] text-zinc-300 mt-1 font-medium">
                    {adiarModalItem.etapaLabel || 'Programação de Produção / Envase'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdiarModalItem(null)}
                disabled={savingAdiarLote}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer disabled:opacity-30"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Card Resumo do Lote */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-black px-2.5 py-1 bg-zinc-900 text-white rounded-lg shadow-2xs">
                    #{adiarModalItem.loteNumber}
                  </span>
                  {adiarModalItem.productCode && (
                    <span className="text-[11px] font-mono font-bold text-zinc-500 bg-white border border-zinc-200 px-2 py-0.5 rounded-md">
                      {adiarModalItem.productCode}
                    </span>
                  )}
                </div>
                {adiarModalItem.productDescription && (
                  <p className="text-xs font-bold text-zinc-800 leading-snug line-clamp-2">
                    {adiarModalItem.productDescription}
                  </p>
                )}
                <div className="pt-2 border-t border-zinc-200/80 flex items-center justify-between text-xs">
                  <span className="text-zinc-500 font-medium">Data Atual:</span>
                  <span className="font-mono font-bold text-zinc-700">
                    {formatDateOnly(adiarModalItem.currentDate)}
                    {adiarModalItem.currentDate ? ` (${formatWeekdayAndDate(adiarModalItem.currentDate).split(',')[0]})` : ''}
                  </span>
                </div>

                {(() => {
                  const reg = lotesAdiadosHistorico.find(r => r.loteNumber === adiarModalItem.loteNumber);
                  if (!reg || !reg.dataOriginal) return null;
                  return (
                    <div className="pt-2 border-t border-rose-200 flex items-center justify-between gap-2 text-xs bg-rose-50/70 p-2.5 rounded-lg border border-rose-200">
                      <div className="text-[11px] text-rose-950 leading-tight">
                        <span className="font-extrabold block text-rose-800">⚠️ Lote com adiamento registrado:</span>
                        <span className="text-zinc-600 font-medium">Original: <strong>{formatDateOnly(reg.dataOriginal)}</strong> ➔ Previsto: <strong>{formatDateOnly(reg.dataAdiadoPara)}</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelAdiarLote(adiarModalItem.loteNumber, reg.dataOriginal, adiarModalItem.origem, adiarModalItem.productCode)}
                        className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                        title="Cancelar o adiamento deste lote e retornar para a data de origem"
                      >
                        <Undo2 className="h-3 w-3" />
                        <span>Desfazer Adiamento</span>
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Seletor de Data */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold text-zinc-800 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  <span>Selecione a Nova Data Desejada</span>
                </label>

                <input
                  type="date"
                  value={adiarModalItem.targetDate}
                  onChange={e => {
                    const val = e.target.value;
                    setAdiarModalItem(prev => prev ? { ...prev, targetDate: val } : null);
                  }}
                  className="w-full bg-white border-2 border-indigo-200 focus:border-indigo-600 rounded-xl px-3 py-2 text-sm font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-xs transition-colors"
                />

                {/* Prévia amigável por extenso */}
                {adiarModalItem.targetDate && (
                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs text-indigo-950 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-600 shrink-0" />
                    <div>
                      <span className="text-[11px] text-indigo-700 block font-semibold">Previsão confirmada:</span>
                      <strong className="text-xs font-bold capitalize">
                        {formatWeekdayAndDate(adiarModalItem.targetDate)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Atalhos Rápidos de Data */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
                  Atalhos Rápidos:
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuickDate(1)}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center"
                    title="Adiar em 1 dia"
                  >
                    +1 Dia
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate(2)}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center"
                    title="Adiar em 2 dias"
                  >
                    +2 Dias
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate(3)}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center"
                    title="Adiar em 3 dias"
                  >
                    +3 Dias
                  </button>
                  <button
                    type="button"
                    onClick={setQuickNextMonday}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center truncate"
                    title="Adiar para a próxima segunda-feira útil"
                  >
                    Próx. Seg
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate(7)}
                    className="px-2 py-1.5 text-xs font-bold bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-zinc-200 rounded-lg text-zinc-700 transition-colors cursor-pointer text-center"
                    title="Adiar em 1 semana (7 dias)"
                  >
                    +1 Sem
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setAdiarModalItem(null)}
                disabled={savingAdiarLote}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 bg-zinc-200/80 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => handleConfirmAdiarLote(adiarModalItem.targetDate)}
                disabled={savingAdiarLote || !adiarModalItem.targetDate}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingAdiarLote ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Confirmar p/ {formatDateOnly(adiarModalItem.targetDate)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ESTILO GLOBAL PARA IMPRESSÃO DE FOLHA A4 */}
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 6mm 6mm 6mm 6mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #relatorio-envase-print-area, #relatorio-envase-print-area * {
            visibility: visible !important;
          }
          #relatorio-envase-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #111827 !important;
            font-size: 8pt !important;
            line-height: 1.2 !important;
            z-index: 9999999 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* MODAL DE RELATÓRIO DE ENVASE PERSONALIZADO (INTERATIVO EM TELA) */}
      {showRelatorioEnvaseModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150 no-print"
          onClick={() => setShowRelatorioEnvaseModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                    <span>Relatório de Programação de Envase</span>
                    <span className="text-[11px] font-mono font-bold bg-indigo-600/80 px-2 py-0.5 rounded-full text-white">
                      {relatorioTotals.totalCount} {relatorioTotals.totalCount === 1 ? 'item' : 'itens'}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-300 mt-0.5 font-medium">
                    Filtre o período personalizado para conferência, impressão em folha A4 ou exportação para Excel.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRelatorioEnvaseModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body / Scrollable Area */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Barra de Filtros e Período */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3">
                {/* Linha 1: Seletores de Data e Atalhos */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-indigo-600" />
                      <span>Período Personalizado:</span>
                    </span>

                    {/* Atalhos Rápidos de Período */}
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-[11px] text-zinc-600 font-semibold mr-1">Atalhos:</span>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('hoje')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-indigo-50 hover:text-indigo-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Hoje
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('amanha')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-indigo-50 hover:text-indigo-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Amanhã
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('semana')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-indigo-50 hover:text-indigo-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Esta Semana
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('7dias')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-indigo-50 hover:text-indigo-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Próx. 7 Dias
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetRelatorioPeriod('mes')}
                        className="px-2 py-0.5 rounded-md bg-white border border-zinc-200 hover:bg-indigo-50 hover:text-indigo-700 font-bold text-zinc-700 text-[11px] cursor-pointer transition-colors"
                      >
                        Este Mês
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        De (Data Inicial):
                      </label>
                      <input
                        type="date"
                        value={relatorioDataInicio}
                        onChange={e => setRelatorioDataInicio(e.target.value)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        Até (Data Final):
                      </label>
                      <input
                        type="date"
                        value={relatorioDataFim}
                        onChange={e => setRelatorioDataFim(e.target.value)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        Linha de Envase:
                      </label>
                      <select
                        value={relatorioLinhaFilter}
                        onChange={e => setRelatorioLinhaFilter(e.target.value as any)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      >
                        <option value="TODAS">Todas as Linhas</option>
                        <option value="Linha 1">Linha 1</option>
                        <option value="Linha 2">Linha 2</option>
                        <option value="Linha 3">Linha 3 (Óleos)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        Status do Lote:
                      </label>
                      <select
                        value={relatorioStatusFilter}
                        onChange={e => setRelatorioStatusFilter(e.target.value as any)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      >
                        <option value="TODOS">Todos os Status</option>
                        <option value="PROGRAMADO">📅 Apenas Programados</option>
                        <option value="EM_ENVASE">⚡ Em Envase</option>
                        <option value="EM_ESPERA">⏸️ Em Espera</option>
                        <option value="CONCLUIDO">✅ Concluídos</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-600 block mb-1">
                        Modo de Exibição:
                      </label>
                      <select
                        value={relatorioAgrupamento}
                        onChange={e => setRelatorioAgrupamento(e.target.value as any)}
                        className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-indigo-700 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                      >
                        <option value="linha">Quadro por Linha (Compacto - Linhas 1, 2 e 3)</option>
                        <option value="tabela">Tabela Geral Detalhada</option>
                        <option value="produto">Consolidado por Produto (SKU)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Linha 2: Busca e Checkbox */}
                <div className="pt-2 border-t border-zinc-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Filtrar por lote, código SKU, descrição ou observação..."
                      value={relatorioSearch}
                      onChange={e => setRelatorioSearch(e.target.value)}
                      className="w-full bg-white border border-zinc-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                    {relatorioSearch && (
                      <button
                        type="button"
                        onClick={() => setRelatorioSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={relatorioIncluirLiberados}
                      onChange={e => setRelatorioIncluirLiberados(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    />
                    <span>Incluir lotes liberados aguardando esteira</span>
                  </label>
                </div>
              </div>

              {/* Indicadores Resumo (KPIs) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide block">
                    Total de Lotes
                  </span>
                  <div className="text-xl font-mono font-extrabold text-zinc-900 mt-0.5">
                    {relatorioTotals.totalCount} <span className="text-xs font-normal text-zinc-500">lotes</span>
                  </div>
                </div>

                <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs">
                  <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide block">
                    Volume a Envasar
                  </span>
                  <div className="text-xl font-mono font-extrabold text-indigo-700 mt-0.5">
                    {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} <span className="text-xs font-normal text-indigo-500">un</span>
                  </div>
                </div>

                <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs">
                  <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide block">
                    Peso Total
                  </span>
                  <div className="text-xl font-mono font-extrabold text-emerald-700 mt-0.5">
                    {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} <span className="text-xs font-normal text-emerald-500">kg</span>
                  </div>
                </div>

                <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-2xs flex flex-col justify-center text-xs">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide block mb-1">
                    Divisão por Linhas
                  </span>
                  <div className="space-y-0.5 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-blue-700 font-bold">L1:</span>
                      <span>{relatorioTotals.linha1Count} lotes ({Number(relatorioTotals.linha1Un).toLocaleString('pt-BR')} un)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-indigo-700 font-bold">L2:</span>
                      <span>{relatorioTotals.linha2Count} lotes ({Number(relatorioTotals.linha2Un).toLocaleString('pt-BR')} un)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-700 font-bold">L3:</span>
                      <span>{relatorioTotals.linha3Count} lotes ({Number(relatorioTotals.linha3Un).toLocaleString('pt-BR')} un)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabela de Prévia em Tela */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                <div className="bg-zinc-100 px-4 py-2.5 border-b border-zinc-200 flex items-center justify-between text-xs font-bold text-zinc-800">
                  <span>Prévia dos Dados a Envasar ({relatorioEnvaseItems.length} registros)</span>
                  <span className="text-zinc-500 font-normal">
                    {formatDateOnly(relatorioDataInicio)} a {formatDateOnly(relatorioDataFim)}
                  </span>
                </div>

                <div className="max-h-[380px] overflow-y-auto">
                  {loadingRelatorioEnvase ? (
                    <div className="py-14 text-center text-zinc-400">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-zinc-400" />
                      <p className="text-xs font-semibold">Carregando programação completa de envase...</p>
                    </div>
                  ) : relatorioEnvaseItems.length === 0 ? (
                    <div className="py-14 text-center text-zinc-400">
                      <Calendar className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                      <p className="text-xs font-bold text-zinc-700">Nenhum lote programado para o período selecionado</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Altere as datas ou selecione outro filtro para visualizar os produtos.
                      </p>
                    </div>
                  ) : relatorioAgrupamento === 'linha' ? (
                    /* QUADRO POR LINHA COMPACTO (Como no Quadro de Envase) */
                    <div className="p-3 bg-zinc-100/60 min-h-[300px] space-y-3">
                      <div className={cn(
                        "grid gap-3 items-start",
                        relatorioLinhasGroups.groups.length === 1 ? "grid-cols-1" :
                        relatorioLinhasGroups.groups.length === 2 ? "grid-cols-1 md:grid-cols-2" :
                        "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                      )}>
                        {relatorioLinhasGroups.groups.map(group => (
                          <div key={group.id} className="bg-white border border-zinc-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
                            {/* Header da Linha */}
                            <div className="px-3 py-2 bg-zinc-900 text-white flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-extrabold text-xs tracking-tight truncate">{group.title}</span>
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-white/20 text-white shrink-0">
                                  {group.items.length}
                                </span>
                              </div>
                              <span className="font-mono text-[11px] font-bold text-zinc-300 shrink-0">
                                {Number(group.totalUn).toLocaleString('pt-BR')} un
                              </span>
                            </div>

                            {/* Cards da Linha */}
                            <div className="p-2 space-y-1.5 bg-zinc-50/50 flex-1 max-h-[380px] overflow-y-auto">
                              {group.items.length === 0 ? (
                                <div className="py-8 text-center text-zinc-400 text-xs italic">
                                  Nenhum lote programado nesta linha
                                </div>
                              ) : (
                                group.items.map((it, idx) => (
                                  <div
                                    key={it.id || idx}
                                    className={cn(
                                      "p-2 rounded-lg border bg-white shadow-2xs text-xs space-y-1 transition-all",
                                      it.statusEnvase === 'EM_ENVASE' ? "border-purple-300 ring-1 ring-purple-200 bg-purple-50/20" :
                                      it.statusEnvase === 'EM_ESPERA' ? "border-amber-300 bg-amber-50/30" :
                                      it.statusEnvase === 'CONCLUIDO' ? "border-emerald-200 bg-emerald-50/15" :
                                      "border-zinc-200"
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-1 text-[11px]">
                                      <div className="flex items-center gap-1.5 font-mono">
                                        <span className="font-extrabold px-1.5 py-0.2 rounded bg-zinc-900 text-white text-[10px]">
                                          {it.ordem > 0 && it.ordem < 999 ? `${it.ordem}º` : '—'}
                                        </span>
                                        <span className="font-bold text-zinc-900">#{it.loteNumber}</span>
                                      </div>
                                      <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                                        <span>{it.productCode}</span>
                                        {relatorioDataInicio !== relatorioDataFim && (
                                          <span className="px-1 py-0.2 bg-zinc-100 rounded text-zinc-700 font-semibold">{it.dataProgramadaFmt}</span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="font-bold text-zinc-900 text-xs line-clamp-1 leading-snug">
                                      {it.productDescription}
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-100 font-mono">
                                      <div>
                                        <strong className="text-indigo-700">{Number(it.quantity).toLocaleString('pt-BR')} un</strong>
                                        {it.quantityKg > 0 && (
                                          <span className="text-zinc-500 text-[10px] ml-1">({Number(it.quantityKg).toLocaleString('pt-BR')} kg)</span>
                                        )}
                                      </div>
                                      <div className="text-[10px] font-sans font-semibold">
                                        {it.statusEnvase === 'EM_ENVASE' && <span className="text-purple-700">⚡ Em Envase</span>}
                                        {it.statusEnvase === 'EM_ESPERA' && (
                                          <span className="text-amber-700 truncate max-w-[120px]" title={it.observacoes}>
                                            ⏸️ {it.observacoes ? it.observacoes.slice(0, 16) : 'Espera'}
                                          </span>
                                        )}
                                        {it.statusEnvase === 'CONCLUIDO' && <span className="text-emerald-700">✅ Concluído</span>}
                                        {it.statusEnvase === 'PROGRAMADO' && <span className="text-zinc-500">Programado</span>}
                                        {it.statusEnvase === 'LIBERADO' && <span className="text-cyan-700">Liberado</span>}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Lotes liberados aguardando esteira */}
                      {relatorioIncluirLiberados && relatorioLinhasGroups.liberados.items.length > 0 && (
                        <div className="bg-white border border-cyan-200 rounded-xl p-3 shadow-xs">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-extrabold text-cyan-900">
                              Lotes Liberados Aguardando Linha ({relatorioLinhasGroups.liberados.items.length})
                            </span>
                            <span className="text-xs font-mono font-bold text-cyan-700">
                              {Number(relatorioLinhasGroups.liberados.totalUn).toLocaleString('pt-BR')} un
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {relatorioLinhasGroups.liberados.items.map((it, idx) => (
                              <div key={it.id || idx} className="p-2 border border-zinc-200 rounded-lg text-xs bg-zinc-50/50 space-y-0.5">
                                <div className="flex justify-between font-mono font-bold text-[11px]">
                                  <span>#{it.loteNumber}</span>
                                  <span className="text-zinc-500">{it.productCode}</span>
                                </div>
                                <div className="font-semibold text-zinc-800 truncate text-[11px]">{it.productDescription}</div>
                                <div className="flex justify-between text-[10px] font-mono text-cyan-800">
                                  <strong>{Number(it.quantity).toLocaleString('pt-BR')} un</strong>
                                  <span>{Number(it.quantityKg).toLocaleString('pt-BR')} kg</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : relatorioAgrupamento === 'produto' ? (
                    /* Visualização Consolidada por SKU */
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold uppercase text-[10px] tracking-wider sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Cód. SKU</th>
                          <th className="py-2 px-3">Descrição do Produto</th>
                          <th className="py-2 px-3">Categoria</th>
                          <th className="py-2 px-3 text-right">Qtd Total (UN)</th>
                          <th className="py-2 px-3 text-right">Peso Total (KG)</th>
                          <th className="py-2 px-3">Lotes Associados</th>
                          <th className="py-2 px-3">Linhas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {relatorioConsolidadoPorProduto.map(prod => (
                          <tr key={`${prod.productCode}_${prod.productDescription}`} className="hover:bg-zinc-50/80">
                            <td className="py-2 px-3 font-mono font-bold text-zinc-900">{prod.productCode || '—'}</td>
                            <td className="py-2 px-3 font-semibold text-zinc-800">{prod.productDescription}</td>
                            <td className="py-2 px-3 text-zinc-600">{prod.categoriaEnvase}</td>
                            <td className="py-2 px-3 font-mono font-extrabold text-indigo-700 text-right">
                              {Number(prod.totalUn).toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-2 px-3 font-mono text-zinc-700 text-right">
                              {Number(prod.totalKg).toLocaleString('pt-BR')} kg
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-zinc-600">
                              {prod.lotes.map(l => `#${l}`).join(', ')}
                            </td>
                            <td className="py-2 px-3 text-[11px] text-zinc-600">
                              {Array.from(prod.linhas).join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-zinc-100 border-t border-zinc-200 font-bold text-xs sticky bottom-0">
                        <tr>
                          <td colSpan={3} className="py-2 px-3 text-zinc-800 font-extrabold">TOTAL GERAL CONSOLIDADO:</td>
                          <td className="py-2 px-3 text-right font-mono font-black text-indigo-800">
                            {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-zinc-800">
                            {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg
                          </td>
                          <td colSpan={2} className="py-2 px-3 text-zinc-500 font-normal">
                            {relatorioConsolidadoPorProduto.length} produtos diferentes
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    /* Visualização Detalhada em Tabela */
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold uppercase text-[10px] tracking-wider sticky top-0">
                        <tr>
                          <th className="py-2 px-2.5">Data</th>
                          <th className="py-2 px-2.5">Linha</th>
                          <th className="py-2 px-1.5 text-center">Ord</th>
                          <th className="py-2 px-2.5">Lote</th>
                          <th className="py-2 px-2">SKU</th>
                          <th className="py-2 px-3">Produto</th>
                          <th className="py-2 px-2.5">Cat / Cor</th>
                          <th className="py-2 px-2.5 text-right">Qtd (UN)</th>
                          <th className="py-2 px-2.5 text-right">Peso (KG)</th>
                          <th className="py-2 px-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {relatorioEnvaseItems.map((it, idx) => (
                          <tr key={`${it.id}_${idx}`} className="hover:bg-zinc-50/80">
                            <td className="py-2 px-2.5 font-mono text-zinc-700 whitespace-nowrap">
                              {it.dataProgramadaFmt} <span className="text-[10px] text-zinc-400">({it.diaSemana})</span>
                            </td>
                            <td className="py-2 px-2.5 font-bold text-zinc-800 whitespace-nowrap">
                              {it.linha}
                            </td>
                            <td className="py-2 px-1.5 font-mono font-bold text-center text-zinc-600">
                              {it.ordem > 0 && it.ordem < 999 ? `${it.ordem}º` : '—'}
                            </td>
                            <td className="py-2 px-2.5 font-mono font-extrabold text-zinc-900 whitespace-nowrap">
                              #{it.loteNumber}
                            </td>
                            <td className="py-2 px-2 font-mono text-zinc-500 whitespace-nowrap">
                              {it.productCode}
                            </td>
                            <td className="py-2 px-3 font-semibold text-zinc-900 line-clamp-1 max-w-[240px]">
                              {it.productDescription}
                            </td>
                            <td className="py-2 px-2.5 text-zinc-600 text-[11px] whitespace-nowrap">
                              {it.categoriaEnvase} • {it.cor}
                            </td>
                            <td className="py-2 px-2.5 font-mono font-extrabold text-indigo-700 text-right whitespace-nowrap">
                              {Number(it.quantity).toLocaleString('pt-BR')} un
                            </td>
                            <td className="py-2 px-2.5 font-mono text-zinc-700 text-right whitespace-nowrap">
                              {Number(it.quantityKg).toLocaleString('pt-BR')} kg
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold font-mono",
                                it.statusEnvase === 'CONCLUIDO' ? "bg-emerald-100 text-emerald-800" :
                                it.statusEnvase === 'EM_ENVASE' ? "bg-amber-100 text-amber-800" :
                                it.statusEnvase === 'EM_ESPERA' ? "bg-rose-100 text-rose-800" :
                                "bg-zinc-100 text-zinc-700"
                              )}>
                                {it.statusEnvase}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-zinc-100 border-t border-zinc-200 font-bold text-xs sticky bottom-0">
                        <tr>
                          <td colSpan={7} className="py-2 px-3 text-zinc-800 font-extrabold">
                            TOTAL GERAL ({relatorioTotals.totalCount} lotes):
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-black text-indigo-800 whitespace-nowrap">
                            {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-black text-zinc-800 whitespace-nowrap">
                            {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowRelatorioEnvaseModal(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-600 hover:text-zinc-900 bg-zinc-200/80 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer"
              >
                Fechar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportRelatorioEnvaseExcel}
                  disabled={relatorioEnvaseItems.length === 0}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Exportar dados do relatório para arquivo Excel (.xlsx)"
                >
                  <Download className="h-4 w-4" />
                  <span>Exportar Excel</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintRelatorioEnvase}
                  disabled={relatorioEnvaseItems.length === 0}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Abrir prévia de impressão e imprimir em folha A4"
                >
                  <Printer className="h-4 w-4" />
                  <span>Imprimir Relatório</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ÁREA DE IMPRESSÃO LIMPA (FOLHA A4 - VISÍVEL APENAS NA IMPRESSÃO) */}
      <div id="relatorio-envase-print-area" className="hidden print:block">
        {/* Cabeçalho da Empresa Compacto */}
        <div style={{ borderBottom: '2px solid #18181b', paddingBottom: '4px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <h1 style={{ fontSize: '13pt', fontWeight: '900', margin: 0, color: '#18181b', letterSpacing: '-0.5px' }}>
                  NATUM COSMÉTICOS
                </h1>
                <span style={{ fontSize: '9.5pt', fontWeight: '800', color: '#4f46e5' }}>
                  PROGRAMAÇÃO DE ENVASE
                </span>
              </div>
              <div style={{ fontSize: '7.5pt', color: '#71717a', marginTop: '1px' }}>
                Relatório Operacional das Linhas de Produção &bull; {relatorioLinhaFilter === 'TODAS' ? 'Todas as Linhas' : relatorioLinhaFilter}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '7.5pt', color: '#52525b', lineHeight: 1.25 }}>
              <div><strong>Período:</strong> {formatDateOnly(relatorioDataInicio)} {relatorioDataInicio !== relatorioDataFim ? `a ${formatDateOnly(relatorioDataFim)}` : ''}</div>
              <div><strong>Emissão:</strong> {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} &bull; <strong>Op:</strong> {(currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador'}</div>
            </div>
          </div>
        </div>

        {/* Resumo de Totais Compacto (Linha Única) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f4f4f5',
            border: '1px solid #e4e4e7',
            borderRadius: '4px',
            padding: '3px 8px',
            marginBottom: '6px',
            fontSize: '8pt',
          }}
        >
          <div>
            <strong>TOTAL GERAL:</strong> {relatorioTotals.totalCount} lotes &bull;{' '}
            <strong style={{ color: '#3730a3' }}>{Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un</strong> &bull;{' '}
            <span style={{ color: '#047857' }}>{Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', fontSize: '7.5pt', fontFamily: 'monospace' }}>
            <span><strong>L1:</strong> {relatorioTotals.linha1Count} lotes ({Number(relatorioTotals.linha1Un).toLocaleString('pt-BR')} un)</span>
            <span><strong>L2:</strong> {relatorioTotals.linha2Count} lotes ({Number(relatorioTotals.linha2Un).toLocaleString('pt-BR')} un)</span>
            <span><strong>L3:</strong> {relatorioTotals.linha3Count} lotes ({Number(relatorioTotals.linha3Un).toLocaleString('pt-BR')} un)</span>
          </div>
        </div>

        {/* Conteúdo: Modo de Exibição */}
        {relatorioAgrupamento === 'produto' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
            <thead>
              <tr style={{ background: '#f4f4f5', borderTop: '1px solid #18181b', borderBottom: '1px solid #18181b' }}>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Cód. SKU</th>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Descrição do Produto</th>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Categoria</th>
                <th style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 'bold' }}>Qtd (UN)</th>
                <th style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 'bold' }}>Peso (KG)</th>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Lotes</th>
                <th style={{ padding: '4px 5px', textAlign: 'left', fontWeight: 'bold' }}>Linhas</th>
              </tr>
            </thead>
            <tbody>
              {relatorioConsolidadoPorProduto.map((prod, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e4e4e7', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                  <td style={{ padding: '3px 5px', fontFamily: 'monospace', fontWeight: 'bold' }}>{prod.productCode}</td>
                  <td style={{ padding: '3px 5px' }}>{prod.productDescription}</td>
                  <td style={{ padding: '3px 5px', color: '#52525b' }}>{prod.categoriaEnvase}</td>
                  <td style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>
                    {Number(prod.totalUn).toLocaleString('pt-BR')} un
                  </td>
                  <td style={{ padding: '3px 5px', textAlign: 'right', fontFamily: 'monospace' }}>
                    {Number(prod.totalKg).toLocaleString('pt-BR')} kg
                  </td>
                  <td style={{ padding: '3px 5px', fontFamily: 'monospace', fontSize: '7.5pt', color: '#52525b' }}>
                    {prod.lotes.map(l => `#${l}`).join(', ')}
                  </td>
                  <td style={{ padding: '3px 5px', fontSize: '7.5pt', color: '#52525b' }}>
                    {Array.from(prod.linhas).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f4f4f5', borderTop: '2px solid #18181b', borderBottom: '2px solid #18181b', fontWeight: 'bold' }}>
                <td colSpan={3} style={{ padding: '5px' }}>TOTAL CONSOLIDADO ({relatorioConsolidadoPorProduto.length} produtos):</td>
                <td style={{ padding: '5px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un
                </td>
                <td style={{ padding: '5px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        ) : relatorioAgrupamento === 'tabela' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
            <thead>
              <tr style={{ background: '#f4f4f5', borderTop: '1px solid #18181b', borderBottom: '1px solid #18181b' }}>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Data</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Linha</th>
                <th style={{ padding: '4px 3px', textAlign: 'center', fontWeight: 'bold' }}>Ord</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Lote</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>SKU</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Produto</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Cat / Cor</th>
                <th style={{ padding: '4px 3px', textAlign: 'right', fontWeight: 'bold' }}>Qtd (UN)</th>
                <th style={{ padding: '4px 3px', textAlign: 'right', fontWeight: 'bold' }}>Peso (KG)</th>
                <th style={{ padding: '4px 3px', textAlign: 'left', fontWeight: 'bold' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {relatorioEnvaseItems.map((it, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e4e4e7', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                  <td style={{ padding: '3px', whiteSpace: 'nowrap' }}>{it.dataProgramadaFmt} ({it.diaSemana})</td>
                  <td style={{ padding: '3px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{it.linha}</td>
                  <td style={{ padding: '3px', textAlign: 'center', fontFamily: 'monospace' }}>
                    {it.ordem > 0 && it.ordem < 999 ? `${it.ordem}º` : '—'}
                  </td>
                  <td style={{ padding: '3px', fontFamily: 'monospace', fontWeight: 'bold', whiteSpace: 'nowrap' }}>#{it.loteNumber}</td>
                  <td style={{ padding: '3px', fontFamily: 'monospace', color: '#52525b', whiteSpace: 'nowrap' }}>{it.productCode}</td>
                  <td style={{ padding: '3px' }}>{it.productDescription}</td>
                  <td style={{ padding: '3px', color: '#52525b', fontSize: '7.5pt', whiteSpace: 'nowrap' }}>
                    {it.categoriaEnvase} • {it.cor}
                  </td>
                  <td style={{ padding: '3px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {Number(it.quantity).toLocaleString('pt-BR')} un
                  </td>
                  <td style={{ padding: '3px', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {Number(it.quantityKg).toLocaleString('pt-BR')} kg
                  </td>
                  <td style={{ padding: '3px', fontSize: '7.5pt', whiteSpace: 'nowrap' }}>{it.statusEnvase}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f4f4f5', borderTop: '2px solid #18181b', borderBottom: '2px solid #18181b', fontWeight: 'bold' }}>
                <td colSpan={7} style={{ padding: '4px' }}>TOTAL GERAL ({relatorioTotals.totalCount} lotes):</td>
                <td style={{ padding: '4px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(relatorioTotals.totalUn).toLocaleString('pt-BR')} un
                </td>
                <td style={{ padding: '4px', textAlign: 'right', fontFamily: 'monospace' }}>
                  {Number(relatorioTotals.totalKg).toLocaleString('pt-BR')} kg
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        ) : (
          /* MODO PADRÃO: QUADRO POR LINHA COMPACTO (Como no Quadro de Envase) */
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${relatorioLinhasGroups.groups.length || 1}, minmax(0, 1fr))`,
                gap: '6px',
                alignItems: 'start',
              }}
            >
              {relatorioLinhasGroups.groups.map(group => (
                <div key={group.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Cabeçalho da Coluna / Linha */}
                  <div
                    style={{
                      background: '#18181b',
                      color: '#ffffff',
                      padding: '3px 6px',
                      borderRadius: '4px 4px 0 0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '7.5pt',
                    }}
                  >
                    <span style={{ fontWeight: '800' }}>{group.title}</span>
                    <span style={{ fontSize: '7pt', fontFamily: 'monospace', opacity: 0.9 }}>
                      {group.items.length} {group.items.length === 1 ? 'lote' : 'lotes'} &bull; {Number(group.totalUn).toLocaleString('pt-BR')} un
                    </span>
                  </div>

                  {/* Lista de Lotes da Linha */}
                  <div
                    style={{
                      border: '1px solid #d4d4d8',
                      borderTop: 'none',
                      borderRadius: '0 0 4px 4px',
                      padding: '3px',
                      background: '#fafafa',
                      minHeight: '70px',
                    }}
                  >
                    {group.items.length === 0 ? (
                      <div style={{ padding: '16px 8px', textAlign: 'center', color: '#a1a1aa', fontSize: '7pt', fontStyle: 'italic' }}>
                        Nenhum lote programado
                      </div>
                    ) : (
                      group.items.map((it, idx) => (
                        <div
                          key={it.id || idx}
                          style={{
                            border: '1px solid #e4e4e7',
                            borderRadius: '3px',
                            padding: '2.5px 4px',
                            marginBottom: '3px',
                            background: '#ffffff',
                            pageBreakInside: 'avoid',
                          }}
                        >
                          {/* Linha 1: Ordem + Lote + SKU (+ Data se período de múltiplos dias) */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '7pt' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <span
                                style={{
                                  background: '#18181b',
                                  color: '#ffffff',
                                  fontWeight: '800',
                                  fontSize: '6.5pt',
                                  padding: '0.5px 3px',
                                  borderRadius: '2px',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {it.ordem > 0 && it.ordem < 999 ? `${it.ordem}º` : '—'}
                              </span>
                              <span style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '7.5pt', color: '#09090b' }}>
                                #{it.loteNumber}
                              </span>
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: '6.5pt', color: '#52525b', display: 'flex', gap: '3px' }}>
                              <span>{it.productCode}</span>
                              {relatorioDataInicio !== relatorioDataFim && (
                                <span style={{ fontWeight: 'bold', color: '#18181b', background: '#f4f4f5', padding: '0 2px', borderRadius: '2px' }}>
                                  {it.dataProgramadaFmt}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Linha 2: Descrição do Produto Resumida */}
                          <div
                            style={{
                              fontWeight: '700',
                              fontSize: '7pt',
                              color: '#18181b',
                              margin: '1px 0',
                              lineHeight: '1.15',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={it.productDescription}
                          >
                            {it.productDescription}
                          </div>

                          {/* Linha 3: Quantidade (un / kg) e Status Resumido */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '6.5pt',
                              borderTop: '1px dotted #e4e4e7',
                              paddingTop: '1px',
                              marginTop: '1px',
                            }}
                          >
                            <div style={{ fontFamily: 'monospace' }}>
                              <strong style={{ color: '#3730a3' }}>{Number(it.quantity).toLocaleString('pt-BR')} un</strong>
                              {it.quantityKg > 0 && (
                                <span style={{ color: '#71717a', marginLeft: '3px' }}>
                                  ({Number(it.quantityKg).toLocaleString('pt-BR')} kg)
                                </span>
                              )}
                            </div>
                            <div>
                              {it.statusEnvase === 'EM_ENVASE' && (
                                <span style={{ color: '#7e22ce', fontWeight: '800' }}>⚡ Em Envase</span>
                              )}
                              {it.statusEnvase === 'EM_ESPERA' && (
                                <span style={{ color: '#b45309', fontWeight: '800' }}>
                                  ⏸️ {it.observacoes ? it.observacoes.slice(0, 15) : 'Espera'}
                                </span>
                              )}
                              {it.statusEnvase === 'CONCLUIDO' && (
                                <span style={{ color: '#15803d', fontWeight: '800' }}>✅ Concluído</span>
                              )}
                              {it.statusEnvase === 'PROGRAMADO' && (
                                <span style={{ color: '#71717a' }}>Programado</span>
                              )}
                              {it.statusEnvase === 'LIBERADO' && (
                                <span style={{ color: '#0369a1', fontWeight: '800' }}>Liberado</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Se houver lotes liberados e o usuário optou por incluir */}
            {relatorioIncluirLiberados && relatorioLinhasGroups.liberados.items.length > 0 && (
              <div style={{ marginTop: '6px', pageBreakInside: 'avoid' }}>
                <div
                  style={{
                    background: '#0e7490',
                    color: '#ffffff',
                    padding: '2.5px 5px',
                    borderRadius: '3px 3px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '7pt',
                  }}
                >
                  <span style={{ fontWeight: '800' }}>{relatorioLinhasGroups.liberados.title}</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {relatorioLinhasGroups.liberados.items.length} lotes &bull; {Number(relatorioLinhasGroups.liberados.totalUn).toLocaleString('pt-BR')} un
                  </span>
                </div>
                <div
                  style={{
                    border: '1px solid #cbd5e1',
                    borderTop: 'none',
                    borderRadius: '0 0 3px 3px',
                    padding: '3px',
                    background: '#f8fafc',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '3px',
                  }}
                >
                  {relatorioLinhasGroups.liberados.items.map((it, idx) => (
                    <div
                      key={it.id || idx}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '2px',
                        padding: '2px 3px',
                        background: '#ffffff',
                        fontSize: '6.5pt',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>#{it.loteNumber}</span>
                        <span style={{ color: '#64748b' }}>{it.productCode}</span>
                      </div>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '600' }}>
                        {it.productDescription}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0369a1', fontFamily: 'monospace' }}>
                        <strong>{Number(it.quantity).toLocaleString('pt-BR')} un</strong>
                        <span>{Number(it.quantityKg).toLocaleString('pt-BR')} kg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rodapé Compacto com Assinaturas */}
        <div
          style={{
            marginTop: '10px',
            paddingTop: '4px',
            borderTop: '1px solid #d4d4d8',
            display: 'flex',
            justifyContent: 'space-around',
            textAlign: 'center',
            fontSize: '7pt',
            pageBreakInside: 'avoid',
          }}
        >
          <div>
            <div style={{ borderBottom: '1px solid #71717a', width: '150px', margin: '0 auto 2px auto' }}></div>
            <strong>Responsável pelo Envase</strong>
            <div style={{ color: '#71717a', fontSize: '6pt' }}>Assinatura e Data</div>
          </div>
          <div>
            <div style={{ borderBottom: '1px solid #71717a', width: '150px', margin: '0 auto 2px auto' }}></div>
            <strong>Supervisão de Produção / PCP</strong>
            <div style={{ color: '#71717a', fontSize: '6pt' }}>Visto / Conferência</div>
          </div>
        </div>
      </div>

    </AppLayout>
  );
}

