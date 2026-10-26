import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, CalendarClock, Search, RefreshCw, Printer, Trash2, CheckCircle2, 
  X, AlertTriangle, HelpCircle, Edit3, Database, Check, ArrowRight,
  Clock, ChevronDown, ChevronUp, Package, Truck, Boxes, Sparkles, Settings,
  ShieldCheck, ShieldAlert, Layers, Plus, ChevronLeft, ChevronRight, Filter,
  TrendingDown, CheckCircle, Info, Flame, Snowflake, AlertCircle, ArrowUpDown, Tag,
  FileSpreadsheet, Download, GripVertical, AlertOctagon, SlidersHorizontal, FlaskConical, Zap
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../../../geral/lib/http';
import AvisoProdutosSemPeso from '../../components/AvisoProdutosSemPeso';
import { unidadesDeKg, ehBaseProduto } from '../../lib/unitConversion';
import { printHtmlViaIframe } from '../../../geral/lib/printCleanup';
import { loadNatumLogoDataUrl } from '../../../geral/lib/logoUtils';
import { getHoliday, getBrazilHolidaysForYear, HolidayInfo } from '../../../geral/lib/brazilHolidays';
import { ProductDetailsDrawer } from './ProductDetailsDrawer';
import CoberturaInsumosDrawer from './CoberturaInsumosDrawer';
import RetirarDaFilaDrawer from './RetirarDaFilaDrawer';
import PreviaAcaoDrawer, { PreviaAcao } from './PreviaAcaoDrawer';
import { canEdit, getAuthUser } from '../../../geral/lib/auth';
import { useAviso } from '../../../geral/components/ui/Aviso';
import Drawer from '../../../geral/components/ui/Drawer';
import { SeloCobertura, piorResultado, useCoberturaSemana, useCoberturaFila, chaveCandidato } from './cobertura';
import { getProductColorInfo, getProductProcessType, previsaoEnvase, getShortReatorName } from '../../lib/processoProduto';
import { SugestaoDrawer } from './planejamento/SugestaoDrawer';
import { ParametrosBateladaDrawer } from './planejamento/ParametrosBateladaDrawer';
import { EditarQuantidadeDrawer } from './planejamento/EditarQuantidadeDrawer';
import { VincularLoteDrawer } from './planejamento/VincularLoteDrawer';
import { AgendarDrawer } from './planejamento/AgendarDrawer';
import { ReatoresDrawer } from './planejamento/ReatoresDrawer';
import type { DiaSemana, ScheduleModalItem, LinkLoteModalItem, EditQtyModalItem, TechnicalModalItem, HeuristicStats } from './planejamento/tiposDrawers';
import { diasPermitidos, ordenarReatoresPorCaber } from '../../lib/heuristicaPlanejamento';
import { eBase } from '../../../geral/lib/regrasProduto';

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

interface PlanejamentoSemanalTabProps {
  active?: boolean;
  onScheduleChanged?: () => void;
  currentDate?: Date;
  onCurrentDateChange?: (d: Date) => void;
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
  const isoYear = new Date(firstThursday).getFullYear();
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
}

/** Lê `{ error }` da resposta do servidor (422/409/500) e cai no texto padrão se o corpo não vier. */
async function mensagemErroServidor(res: Response, padrao: string): Promise<string> {
  try {
    const err = await res.json();
    if (err?.error) return String(err.error);
  } catch { /* corpo vazio */ }
  return padrao;
}

/** Regras de chão de fábrica aplicadas no modal, no arraste e na sugestão. */
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
  if (opts.reatorId === 'BOMBONAS') {
    if (opts.kg > 200.05) {
      return `Bombona comporta até 200 kg. Esta ordem tem ${opts.kg} kg.`;
    }
  } else if (reator && opts.kg > Number(reator.capacidade_kg) + 0.05) {
    return `A massa de ${opts.kg} kg passa da capacidade de ${reator.capacidade_kg} kg deste reator.`;
  }
  if (opts.reatorId === 'R_100') {
    const ocupado = opts.plannedItems.some(i =>
      i.reator_id === 'R_100' &&
      i.ordem_status !== 'cancelado' &&
      (i.data_planejada || '').split('T')[0] === date &&
      !opts.ignoreIds?.has(i.id)
    );
    if (ocupado) {
      return 'O Reator 100kg funciona por resistência e aceita no máximo 1 produção por dia.';
    }
  }
  return null;
}

export function PlanejamentoSemanalTab({
  active = true,
  onScheduleChanged,
  currentDate: propCurrentDate,
  onCurrentDateChange,
  onShowDetails,
}: PlanejamentoSemanalTabProps) {
  // Só quem tem o módulo com nível "editar" (Configurações → Operadores) grava; o servidor também confere (403).
  const podeEditar = useMemo(() => canEdit(getAuthUser(), 'planejamento_producao'), []);
  const { avisar, aviso } = useAviso();

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
  const [retirarFilaId, setRetirarFilaId] = useState<string | null>(null);
  const [previaAcao, setPreviaAcao] = useState<PreviaAcao | null>(null);
  const [demandFilter, setDemandFilter] = useState<'FILA' | 'ALL' | 'CRITICOS' | 'PROGRAMADAS' | 'KITS' | 'BASES'>('FILA');
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('ALL');

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

  // Modais de Ação
  const [scheduleModalItem, setScheduleModalItem] = useState<ScheduleModalItem | null>(null);
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

  // Modal para Vincular / Editar Lote ERP diretamente no Card
  const [linkLoteModalItem, setLinkLoteModalItem] = useState<LinkLoteModalItem | null>(null);

  // Modal para Editar Quantidade Planejada (kg) diretamente no Card
  const [editQtyModalItem, setEditQtyModalItem] = useState<EditQtyModalItem | null>(null);

  // Modal de Configurações da Batelada (Parâmetros Técnicos)
  const [technicalModalItem, setTechnicalModalItem] = useState<TechnicalModalItem | null>(null);

  // Drag and Drop State (Arrastar cards no quadro ou do banco de demandas)
  const [draggedItem, setDraggedItem] = useState<PlanejamentoItem | null>(null);
  const [draggedBatch, setDraggedBatch] = useState<PlanejamentoItem[] | null>(null);
  const [draggedDrawerProduct, setDraggedDrawerProduct] = useState<any | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ reatorId: string; dateStr: string } | null>(null);

  const [coberturaAberta, setCoberturaAberta] = useState(false);

  // Drawer autônomo de Detalhes do Produto
  const [internalDrawerCode, setInternalDrawerCode] = useState<string | null>(null);
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);

  const handleShowProductDetails = useCallback((code: string) => {
    if (onShowDetails) {
      onShowDetails(code);
    } else {
      setInternalDrawerCode(code);
      setInternalDrawerOpen(true);
    }
  }, [onShowDetails]);

  // Modal de Otimização Automática (Heurística)
  const [heuristicModalOpen, setHeuristicModalOpen] = useState(false);
  const [heuristicProposal, setHeuristicProposal] = useState<PlanejamentoItem[]>([]);
  const [heuristicStats, setHeuristicStats] = useState<HeuristicStats>({ totalBatches: 0, totalKg: 0, groupedBases: 0, avoidedHolidays: 0, caldeiraDays: 0 });

  // Datas da semana de Segunda a Sexta
  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(currentDate);
    const days: DiaSemana[] = [];
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
        // Ordem cancelada não ocupa reator, não entra nas estatísticas e não conta na validação.
        setPlannedItems(data.filter(i => i.ordem_status !== 'cancelado'));
      } else {
        setPlannedItems([]);
      }
    } catch (e) {
      console.warn('Erro ao buscar planejamento semanal:', e);
      setPlannedItems([]);
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
          const isBase = eBase(p.codigo, p.categoria_produto, p.status_produto);

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
                             !!p.terceirizado_modo;
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

  useEffect(() => {
    const handleRefresh = () => {
      fetchFila();
    };
    window.addEventListener('natum:refresh-acompanhamento', handleRefresh);
    return () => {
      window.removeEventListener('natum:refresh-acompanhamento', handleRefresh);
    };
  }, [fetchFila]);

  useEffect(() => {
    const refresh = () => {
      if (!active || document.visibilityState !== 'visible') return;
      fetchPlanejamento();
      fetchFila();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [active, fetchPlanejamento, fetchFila]);

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
      const isBase = eBase(p.codigo, p.categoria_produto, p.status_produto);
      if (isBase) bases++;
      const efp = p.estoque_futuro_com_producao ?? p.estoque_futuro ?? 0;
      if (efp < 0 || p.status === 'critico' || p.status === 'ordem') criticos++;
      if (p.is_producao_programada === 1 || p.is_producao_programada === true) programadas++;
      if (p.is_kit || p.is_kit_component === 1 || p.produzir_apenas_kit === 1) kits++;
    }
    return { all, criticos, programadas, kits, bases };
  }, [products, selectedLineFilter]);

  // Itens elegíveis para o Banco de Demandas (Fila de Demandas PCP + Lotes Em Espera para Reagendamento)
  const demandCandidates = useMemo(() => {
    const prodMap = new Map(products.map(p => [p.codigo, p]));

    const mappedFila = filaDemandas
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

    const combined = [...mappedFila];

    const grouped: any[] = [];
    const seenGroups = new Set<string>();
    for (const item of combined) {
      if (item._batchGroupId) {
        if (seenGroups.has(item._batchGroupId)) continue;
        seenGroups.add(item._batchGroupId);
        const siblings = combined.filter(m => m._batchGroupId === item._batchGroupId);
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
  const diasAteEnvasePorCodigo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      const n = p.dias_ate_envase;
      if (n !== null && n !== undefined && Number.isFinite(Number(n)) && Number(n) >= 0) m.set(p.codigo, Number(n));
    }
    return m;
  }, [products]);

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

  const devolverParaFila = async (itens: PlanejamentoItem[], observacoes?: string) => {
    const payload = itens
      .filter(it => it.ordem_status !== 'concluido')
      .map(it => {
        const estUnOuNull = unidadesDeKg(Number(it.quantidade_planejada) || 0, it.descricao, ehBaseProduto({ codigo: it.codigo_produto, descricao: it.descricao }));
        // sem medida na descrição não dá para converter: vai a quantidade em kg mesmo
        const estUn = estUnOuNull == null ? (Number(it.quantidade_planejada) || 0) : Math.max(1, estUnOuNull);
        return {
          codigoProduto: it.codigo_produto,
          descricao: it.descricao || it.codigo_produto,
          quantidade: estUn,
          unidade: estUnOuNull == null ? 'kg' : 'un',
          quantidadeKg: Number(it.quantidade_planejada) || 0,
          origemDemanda: 'retorno_pcp',
          modo: 'somar',
          baseCodigo: it.base_codigo,
          baseNome: it.base_nome,
          observacoes
        };
      });
    if (payload.length === 0) return;
    const res = await apiFetch('/producao/fila-demandas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) await fetchFila();
  };

  // Salvar/Persistir Item no Planejamento. Não grava cópia local se o servidor recusar.
  const handleSaveItem = async (newItem: PlanejamentoItem): Promise<boolean> => {
    try {
      const res = await apiFetch('/producao/planejamento-semanal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      if (!res.ok) {
        avisar(await mensagemErroServidor(res, 'Não foi possível salvar o planejamento no servidor.'), 'erro');
        return false;
      }
      setPlannedItems(prev => {
        const filtered = prev.filter(i => i.id !== newItem.id);
        return [...filtered, newItem];
      });
      window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
      onScheduleChanged?.();
      return true;
    } catch (e) {
      console.warn('Falha ao salvar planejamento:', e);
      avisar('Falha de conexão ao salvar o planejamento.', 'erro');
      return false;
    }
  };

  // Grava várias ordens de uma vez. O servidor usa uma transação: entram todas ou nenhuma.
  // Com `consumirFila`, o servidor também consome a demanda da fila na mesma transação.
  const handleSaveItems = async (items: PlanejamentoItem[], consumirFila?: { filaId: string; kg: number }[]): Promise<boolean> => {
    if (items.length === 0) return true;
    try {
      const res = await apiFetch('/producao/planejamento-semanal/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(consumirFila && consumirFila.length > 0 ? { itens: items, consumirFila } : items)
      });
      if (!res.ok) {
        avisar(await mensagemErroServidor(res, 'Não foi possível salvar o planejamento no servidor.'), 'erro');
        return false;
      }
      const ids = new Set(items.map(i => i.id));
      setPlannedItems(prev => [...prev.filter(i => !ids.has(i.id)), ...items]);
      window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
      onScheduleChanged?.();
      return true;
    } catch (e) {
      console.warn('Falha ao salvar planejamento:', e);
      avisar('Falha de conexão ao salvar o planejamento.', 'erro');
      return false;
    }
  };

  // LIMPAR TODA A SEMANA — devolve à fila só o que o servidor realmente apagou
  const handleClearWeek = async () => {
    const weekLabel = `Semana ${currentWeekKey.split('-W')[1]} (${weekDays[0].dateStr.split('-').slice(1).reverse().join('/')} a ${weekDays[4].dateStr.split('-').slice(1).reverse().join('/')})`;
    try {
      // Sem confirmar o servidor só devolve a prévia (o que sairia e o que fica).
      const res = await apiFetch(`/producao/planejamento-semanal/clear?week=${currentWeekKey}`, { method: 'DELETE' });
      if (!res.ok) {
        avisar(await mensagemErroServidor(res, 'Não foi possível ler a semana no servidor.'), 'erro');
        return;
      }
      const data = await res.json();
      const apagaria: any[] = Array.isArray(data.deleted) ? data.deleted : [];
      setPreviaAcao({
        titulo: `Limpar ${weekLabel}`,
        linhas: apagaria.map((r) => ({
          titulo: r.descricao || r.codigoProduto,
          detalhe: `${r.codigoProduto} • ${Number(r.quantidadePlanejada || 0).toLocaleString('pt-BR')} kg`,
        })),
        avisos: Number(data.blocked) > 0 ? [`${data.blocked} ordem(ns) ficam: já estão em envase, rotulagem ou avançaram nos quadros.`] : [],
        confirmarRotulo: 'OK, limpar a semana',
        executar: executarLimparSemana,
      });
    } catch (e) {
      console.warn('Erro ao ler a semana no servidor:', e);
      avisar('Falha de conexão ao ler a semana.', 'erro');
    }
  };

  const executarLimparSemana = async () => {
    try {
      const res = await apiFetch(`/producao/planejamento-semanal/clear?week=${currentWeekKey}&confirmar=true`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        avisar('Não foi possível limpar a semana no servidor.', 'erro');
        return;
      }
      const data = await res.json();
      const removed: any[] = Array.isArray(data.deleted) ? data.deleted : [];
      if (removed.length > 0) {
        await devolverParaFila(removed.map((row) => ({
          id: row.id,
          week_key: currentWeekKey,
          data_planejada: weekDays[0].dateStr,
          reator_id: '',
          codigo_produto: row.codigoProduto,
          descricao: row.descricao,
          quantidade_planejada: Number(row.quantidadePlanejada) || 0,
          base_codigo: row.baseCodigo,
          base_nome: row.baseNome,
          ordem_status: 'planejado',
        })));
      }
      if (Number(data.blocked) > 0) {
        avisar(`${data.blocked} ordem(ns) não foram removidas porque já estão em envase, rotulagem ou avançaram nos quadros.`, 'info');
      }
    } catch (e) {
      console.warn('Erro ao limpar semana no servidor:', e);
      avisar('Falha de conexão ao limpar a semana.', 'erro');
    }
    await fetchPlanejamento();
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Aprovação da Produção: apenas o OK do PCP. Não mexe nos quadros.
  // Único caminho para ordem avulsa e batelada: grava status e flags físicos em /confirmar-fisico.
  const aplicarAprovacao = async (alvos: PlanejamentoItem[], aprovar: boolean) => {
    const ordemStatus = aprovar ? 'aprovado' : 'planejado';
    const urlOrdem = (it: PlanejamentoItem, confirmar: boolean) =>
      `/producao/planejamento-semanal/${encodeURIComponent(it.id)}/confirmar-fisico${confirmar ? '?confirmar=true' : ''}`;
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ massa: aprovar, embalagem: aprovar, rotulo: aprovar, ordem_status: ordemStatus })
    };
    // Prévia do servidor (sem confirmar) de cada ordem: status de antes e depois.
    const linhas: PreviaAcao['linhas'] = [];
    const avisos: string[] = [];
    for (const it of alvos) {
      try {
        const res = await apiFetch(urlOrdem(it, false), init);
        if (res.ok) {
          const d = await res.json();
          linhas.push({
            titulo: it.descricao || it.codigo_produto,
            detalhe: `${d.item?.antes?.ordemStatus ?? it.ordem_status ?? 'planejado'} → ${d.item?.depois?.ordemStatus ?? ordemStatus}`,
          });
        } else {
          avisos.push(await mensagemErroServidor(res, 'Erro ao atualizar aprovação de produção no servidor.'));
        }
      } catch (e) {
        console.error('Erro ao ler a aprovação de produção:', e);
        avisos.push('Erro ao atualizar aprovação de produção no servidor.');
      }
    }
    setPreviaAcao({
      titulo: aprovar ? 'Aprovar produção' : 'Remover aprovação da produção',
      linhas,
      avisos: [...new Set(avisos)],
      confirmarRotulo: aprovar ? 'OK, aprovar' : 'OK, remover aprovação',
      executar: () => executarAprovacao(alvos, aprovar, urlOrdem, init),
    });
  };

  const executarAprovacao = async (
    alvos: PlanejamentoItem[],
    aprovar: boolean,
    urlOrdem: (it: PlanejamentoItem, confirmar: boolean) => string,
    init: RequestInit,
  ) => {
    const ordemStatus = aprovar ? 'aprovado' : 'planejado';
    const atualizados: PlanejamentoItem[] = [];
    for (const it of alvos) {
      try {
        const res = await apiFetch(urlOrdem(it, true), init);
        if (!res.ok) {
          avisar(await mensagemErroServidor(res, 'Erro ao atualizar aprovação de produção no servidor.'), 'erro');
          break;
        }
        atualizados.push({
          ...it,
          ordem_status: ordemStatus,
          fisico_confirmado_massa: aprovar,
          fisico_confirmado_embalagem: aprovar,
          fisico_confirmado_rotulo: aprovar,
        });
      } catch (e) {
        console.error('Erro ao alternar aprovação de produção:', e);
        avisar('Erro ao atualizar aprovação de produção no servidor.', 'erro');
        break;
      }
    }
    if (atualizados.length === 0) return;
    const porId = new Map(atualizados.map(u => [u.id, u]));
    setPlannedItems(prev => prev.map(p => porId.get(p.id) || p));
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  const handleToggleAprovacao = (item: PlanejamentoItem) =>
    aplicarAprovacao([item], item.ordem_status !== 'aprovado');

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
    let savedAny = false;

    for (const it of targets) {
      const itQty = (autoQty && autoQty > 0 && targets.length === 1) ? autoQty : it.quantidade_planejada;
      const updated: PlanejamentoItem = {
        ...it,
        lote_erp: cleanLote || undefined,
        quantidade_planejada: itQty,
        ordem_status: cleanLote ? 'aprovado' : it.ordem_status,
      };
      if (await handleSaveItem(updated)) savedAny = true;
    }

    if (!savedAny) return;
    setLinkLoteModalItem(null);
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Editar Quantidade a ser Produzida (Massa em kg)
  const handleConfirmEditQty = async () => {
    if (!editQtyModalItem) return;
    const { item, newQty, batchItems, batchMasses } = editQtyModalItem;
    if (isNaN(newQty) || newQty <= 0) {
      avisar("Informe uma quantidade válida em kg (maior que zero).", 'info');
      return;
    }

    const qtyTargets = batchItems && batchItems.length > 1 ? batchItems : [item];
    const ignoreIds = new Set(qtyTargets.map(t => t.id));
    const massOf = (it: PlanejamentoItem) =>
      qtyTargets.length === 1 ? newQty : (batchMasses?.[it.id] ?? it.quantidade_planejada);
    if (item.reator_id === 'BOMBONAS' || qtyTargets.length === 1) {
      for (const it of qtyTargets) {
        const msg = validarAlocacao({
          reatorId: it.reator_id,
          dateStr: it.data_planejada,
          kg: Number(massOf(it)) || 0,
          reatores,
          plannedItems,
          ignoreIds,
        });
        if (msg) {
          avisar(msg, 'info');
          return;
        }
      }
    } else {
      const sumKg = qtyTargets.reduce((acc, it) => acc + (Number(massOf(it)) || 0), 0);
      const msg = validarAlocacao({
        reatorId: item.reator_id,
        dateStr: item.data_planejada,
        kg: sumKg,
        reatores,
        plannedItems,
        ignoreIds,
      });
      if (msg) {
        avisar(msg, 'info');
        return;
      }
    }

    if (batchItems && batchItems.length > 1) {
      let savedAny = false;
      for (const it of batchItems) {
        const itemQty = batchMasses?.[it.id] !== undefined ? batchMasses[it.id] : it.quantidade_planejada;
        const estUn = unidadesDeKg(itemQty, it.descricao, ehBaseProduto({ codigo: it.codigo_produto, descricao: it.descricao }));
        const updated: PlanejamentoItem = {
          ...it,
          quantidade_planejada: itemQty,
          observacoes: it.observacoes?.replace(/\|\s*[0-9.,]+\s*kg\s*\|\s*~[0-9.,]+\s*un/i, estUn == null ? `| ${itemQty} kg` : `| ${itemQty} kg | ~${estUn.toLocaleString('pt-BR')} un`),
        };
        if (await handleSaveItem(updated)) savedAny = true;
      }
      if (!savedAny) return;
    } else {
      const updated: PlanejamentoItem = {
        ...item,
        quantidade_planejada: newQty,
      };
      if (!await handleSaveItem(updated)) return;
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
    // Prévia do servidor para cada ordem: o que sairia e o que está bloqueado.
    const linhas: PreviaAcao['linhas'] = [];
    const avisos: string[] = [];
    for (const it of batchItems) {
      try {
        const res = await apiFetch(`/producao/planejamento-semanal/${encodeURIComponent(it.id)}`, { method: 'DELETE' });
        if (res.ok) {
          const d = await res.json();
          linhas.push({
            titulo: d.item?.descricao || it.descricao || it.codigo_produto,
            detalhe: `${d.item?.codigoProduto ?? it.codigo_produto} • ${Number(d.item?.quantidadePlanejada ?? it.quantidade_planejada ?? 0).toLocaleString('pt-BR')} kg`,
          });
        } else {
          avisos.push(await mensagemErroServidor(res, `Não foi possível ler ${it.descricao || it.codigo_produto}.`));
        }
      } catch (e) {
        console.error(e);
        avisos.push('Falha de conexão ao ler a ordem.');
      }
    }
    setPreviaAcao({
      titulo: batchItems.length > 1 ? 'Remover batelada do planejamento' : 'Remover ordem do planejamento',
      linhas,
      avisos: [...new Set(avisos)],
      confirmarRotulo: 'OK, remover',
      executar: () => executarDeleteBatch(batchItems),
    });
  };

  const executarDeleteBatch = async (batchItems: PlanejamentoItem[]) => {
    const removidos: PlanejamentoItem[] = [];
    let bloqueado = false;
    for (const it of batchItems) {
      try {
        const res = await apiFetch(`/producao/planejamento-semanal/${it.id}?confirmar=true`, { method: 'DELETE' });
        if (res.status === 409) {
          bloqueado = true;
          const err = await res.json().catch(() => ({}));
          avisar(err?.error || 'Esta ordem não pode sair do planejamento porque já está em outro quadro.', 'erro');
          continue;
        }
        if (res.ok && it.ordem_status !== 'concluido') removidos.push(it);
      } catch (e) {
        console.error(e);
      }
    }
    if (removidos.length > 0) {
      const batchGroupTag = batchItems.length > 1 ? `[batch:BAT_${Date.now()}]` : undefined;
      try {
        await devolverParaFila(removidos, batchGroupTag);
      } catch (e) {
        console.warn('Erro ao devolver itens à fila:', e);
      }
    }
    const removidosIds = new Set(removidos.map(i => i.id));
    setPlannedItems(prev => prev.filter(i => !removidosIds.has(i.id)));
    if (bloqueado) await fetchPlanejamento();
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // Alternar aprovação de todos os itens da batelada
  const handleToggleBatchAprovacao = (batchItems: PlanejamentoItem[]) =>
    aplicarAprovacao(batchItems, !batchItems.every(i => i.ordem_status === 'aprovado'));

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

  // Selos de cobertura de insumos nos cartões (quadro e Banco de Demandas); só avisam.
  const versaoPlano = plannedItems
    .map(i => `${i.id}:${i.data_planejada}:${i.quantidade_planejada}:${i.lote_erp || ''}:${i.ordem_sequencia ?? ''}`)
    .join('|');
  const { porOrdem: coberturaPorOrdem, recarregar: recarregarCobertura } = useCoberturaSemana(currentWeekKey, active, versaoPlano);
  const candidatosFila = useMemo(
    () =>
      demandBankOpen
        ? demandCandidates
            .map((p: any) => ({ codigo: String(p.codigo || ''), kg: Number(p.quantidade_kg) || 0 }))
            .filter(c => c.codigo && c.kg > 0)
        : [],
    [demandBankOpen, demandCandidates]
  );
  const coberturaPorCandidato = useCoberturaFila(currentWeekKey, demandBankOpen, candidatosFila);

  // Abre o modal "Vincular lote ERP" já com o número que a cobertura de insumos sugeriu.
  const handleVincularSugerido = async (ordemId: string, lote: string) => {
    const item = plannedItems.find(i => i.id === ordemId);
    if (!item) return;
    setCoberturaAberta(false);
    const mesmaCelula = plannedItems.filter(i => i.reator_id === item.reator_id && i.data_planejada === item.data_planejada);
    const grupo = groupCellItems(mesmaCelula).find(g => g.items.some(i => i.id === item.id));
    await handleOpenLinkLoteModal(item, grupo && grupo.items.length > 1 ? grupo.items : undefined);
    setLinkLoteModalItem(prev => (prev ? { ...prev, lote } : prev));
  };

  // Texto curto de uma ordem (produto, data, kg) para o Drawer de cobertura.
  const descreverOrdem = (id: string): string => {
    const it = plannedItems.find(i => i.id === id);
    if (!it) return id;
    const data = (it.data_planejada || '').split('T')[0].split('-').reverse().join('/');
    return `${it.codigo_produto} — ${it.descricao || 'sem descrição'} · ${data} · ${it.quantidade_planejada} kg`;
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
      avisar("Informe uma quantidade válida em kg (maior que zero).", 'info');
      return;
    }

    const cleanLote = loteErp.trim();
    const targets = batchItems && batchItems.length > 1 ? batchItems : [item];
    const updatedTargets: PlanejamentoItem[] = [];

    const totalKg = targets.length === 1
      ? quantidadeKg
      : Number(targets.reduce((acc, it) => acc + (Number(it.quantidade_planejada) || 0), 0).toFixed(1));
    const alocacaoMsg = validarAlocacao({
      reatorId,
      dateStr: dataPlanejada,
      kg: totalKg,
      reatores,
      plannedItems,
      ignoreIds: new Set(targets.map(t => t.id)),
    });
    if (alocacaoMsg) {
      avisar(alocacaoMsg, 'info');
      return;
    }

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
    }

    if (!(await handleSaveItems(updatedTargets))) return;
    setTechnicalModalItem(null);
  };

  // Adicionar e remover produtos da mesma ordem de produção (até 4 produtos por lote)
  const handleAddProductToSchedule = (prod: any) => {
    if (scheduleSelectedProducts.length >= 4) {
      avisar("Você pode adicionar no máximo 4 produtos por ordem de produção.", 'info');
      return;
    }
    if (scheduleSelectedProducts.some(p => p.codigo === prod.codigo)) {
      return;
    }
    if (scheduleSelectedProducts.length > 0) {
      const isSameFormula = sameFormulaProducts.some(sf => sf.codigo === prod.codigo);
      if (!isSameFormula) {
        avisar("Apenas produtos com a exata mesma formulação química (mesmas matérias-primas e proporções) podem ser agendados juntos na mesma batelada.", 'info');
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
      .filter(i => i.data_planejada === item.data_planejada && i.reator_id === item.reator_id)
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
      avisar("Por favor, selecione ao menos 1 produto para agendar na ordem de produção.", 'info');
      return;
    }

    if (isNaN(scheduleQty) || scheduleQty <= 0) {
      avisar("Informe uma massa total válida em kg (maior que zero).", 'info');
      return;
    }

    const alocacaoMsg = validarAlocacao({
      reatorId: scheduleReator,
      dateStr: scheduleDate,
      kg: scheduleQty,
      reatores,
      plannedItems,
    });
    if (alocacaoMsg) {
      avisar(alocacaoMsg, 'info');
      return;
    }

    const numItems = scheduleSelectedProducts.length;
    const sameDayItems = plannedItems.filter(i => i.data_planejada === scheduleDate);
    const batchTimestamp = Date.now();
    const batchId = numItems > 1 ? `BATCH_${batchTimestamp}` : '';
    const novosItens: PlanejamentoItem[] = [];

    for (let i = 0; i < numItems; i++) {
      const prod = scheduleSelectedProducts[i];
      const procInfo = getProductProcessType(prod);
      const colorInfo = getProductColorInfo(prod);
      const nextSeq = (sameDayItems.length + 1 + i) * 10;
      const itemId = `PLAN_${currentWeekKey}_${scheduleReator}_${scheduleDate}_${prod.codigo}_${batchTimestamp}_${i}`;

      const massPerItem = scheduleItemMasses[prod.codigo] !== undefined && scheduleItemMasses[prod.codigo] > 0
        ? Number(scheduleItemMasses[prod.codigo].toFixed(1))
        : Number((scheduleQty / numItems).toFixed(1));

      // sem medida na descrição o rendimento em unidades é desconhecido: a observação leva só os kg
      const estUnits = unidadesDeKg(massPerItem, prod.descricao, ehBaseProduto(prod));
      const sufixoUn = estUnits == null ? '' : ` | ~${estUnits.toLocaleString('pt-BR')} un`;
      const batchObs = numItems > 1 
        ? `Batelada conjunta (${i + 1}/${numItems}) [batch:${batchId}] | ${massPerItem} kg${sufixoUn}`
        : (procInfo.isQuente 
            ? (scheduleReator === 'BOMBONAS' ? 'Água Quente Caldeira (Bombona)' : (scheduleReator === 'R_100' ? 'Resistência (100kg)' : (scheduleReator === 'R_40' ? 'Reator 40kg (Quente)' : 'Requer Caldeira'))) 
            : 'Processo a Frio') + sufixoUn;

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
        batch_id: numItems > 1 ? batchId : undefined,
      };

      novosItens.push(newItem);
    }

    // O servidor grava as ordens e consome a demanda da fila na mesma transação (parcial deixa o saldo na fila).
    const consumirFila: { filaId: string; kg: number }[] = [];
    for (const prod of scheduleSelectedProducts) {
      const code = prod.codigo;
      const fItem = filaDemandas.find((f: any) => f.id === prod._filaId);
      if (fItem?.id) {
        const scheduledKg = Number(scheduleItemMasses[code] > 0 ? scheduleItemMasses[code] : (numItems === 1 ? scheduleQty : 0));
        consumirFila.push({ filaId: fItem.id, kg: scheduledKg });
      }
    }
    if (!(await handleSaveItems(novosItens, consumirFila))) return;
    fetchFila();

    setScheduleModalItem(null);
    setScheduleSelectedProducts([]);
    setScheduleItemMasses({});
    setScheduleSearch('');
    window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
    onScheduleChanged?.();
  };

  // ==========================================
  // IMPRESSÕES PROFISSIONAIS PARA FÁBRICA (A4)
  // ==========================================

  // 1. IMPRESSÃO DA PROGRAMAÇÃO SEMANAL DE PRODUÇÃO (A4 COMPACTO E DIRETO)
  const handlePrintWeeklyPlan = async () => {
    if (plannedItems.length === 0) {
      avisar("Nenhuma batelada agendada nesta semana para imprimir.", 'info');
      return;
    }

    const logoUrl = await loadNatumLogoDataUrl();

    // Unidades totais estimadas
    let totalEstimatedUnits = 0;
    for (const item of plannedItems) {
      const isBase = item.codigo_produto.includes('.36.') || (item.descricao || '').toUpperCase().startsWith('BASE ');
      if (!isBase) {
        totalEstimatedUnits += unidadesDeKg(item.quantidade_planejada, item.descricao, ehBaseProduto({ codigo: item.codigo_produto, descricao: item.descricao })) ?? 0;
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
        const rendimento = unidadesDeKg(item.quantidade_planejada, item.descricao, ehBaseProduto({ codigo: item.codigo_produto, descricao: item.descricao }));
        const yieldText = isBase ? 'Granel' : (rendimento == null ? '—' : `${rendimento.toLocaleString('pt-BR')} un`);
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
  const handleRunHeuristic = () => {
    // 1. Coleta apenas itens ATIVOS com necessidade ou programados
    const candidates = demandCandidates.filter(p => {
      const efp = p.estoque_futuro_com_producao ?? p.estoque_futuro ?? 0;
      return efp < 50 || p.is_producao_programada === 1 || p.is_producao_programada === true;
    });

    if (candidates.length === 0) {
      avisar("Nenhum produto com necessidade crítica ou programada no filtro atual. Experimente selecionar 'Todas as Linhas'.", 'info');
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
    for (const existing of plannedItems) {
      if (existing.reator_id === 'BOMBONAS') {
        bombonaSlotsCount[existing.data_planejada] = (bombonaSlotsCount[existing.data_planejada] || 0) + 1;
      } else {
        occupiedSlots.add(`${existing.reator_id}_${existing.data_planejada}`);
      }
    }
    const diasOcupados = new Set<string>(plannedItems.map(i => i.data_planejada));
    const diasExclusivos = new Set<string>();
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
      const producaoMinKg = Number(prod.producao_minima_kg) || 0;
      const reqMassKg = Math.max(procInfo.reqQtyKg, producaoMinKg);
      const usouMinimo = producaoMinKg > 0 && producaoMinKg > procInfo.reqQtyKg;
      const reqUnits = procInfo.reqUnits;
      const descExcl = (prod.descricao || '').toUpperCase();
      const exclusivo: boolean = prod.exclusivo_no_dia ?? descExcl.includes('AOX');
      const diasPermitidosProd = diasPermitidos(validDays, exclusivo, diasOcupados, diasExclusivos);
      const marcar = (dateStr: string) => {
        diasOcupados.add(dateStr);
        if (exclusivo) diasExclusivos.add(dateStr);
        if (usouMinimo) {
          const ult = proposed[proposed.length - 1];
          if (ult) ult.observacoes = `${ult.observacoes || ''} | mín. ${producaoMinKg} kg`;
        }
      };

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
          for (const day of diasPermitidosProd) {
            const slotKey = `${rShampoo.id}_${day.dateStr}`;
            if (!occupiedSlots.has(slotKey)) {
              occupiedSlots.add(slotKey);
              daysWithCaldeira.add(day.dateStr);

              const plannedKg = Math.min(1000, Math.max(1, Math.round(reqMassKg)));
              const plannedUnits = procInfo.unitWeightKg ? Math.round(plannedKg / procInfo.unitWeightKg) : null;

              proposed.push({
                id: `HEUR_${currentWeekKey}_${rShampoo.id}_${day.dateStr}_${prod.codigo}`,
                week_key: currentWeekKey,
                data_planejada: day.dateStr,
                reator_id: rShampoo.id,
                codigo_produto: prod.codigo,
                descricao: prod.descricao,
                quantidade_planejada: plannedKg,
                unidade: 'kg',
                base_codigo: prod.base || null,
                base_nome: prod.base || null,
                linha_envase: envLine,
                observacoes: `Reator Shampoo | ${plannedKg} kg${plannedUnits == null ? '' : ` | ~${plannedUnits.toLocaleString('pt-BR')} un`}`,
                ordem_status: 'planejado',
                fisico_confirmado_massa: false,
                fisico_confirmado_embalagem: false,
                fisico_confirmado_rotulo: false,
                recipiente_detalhe: 'Reator 1000kg',
                cor_tag: colorInfo.tag,
                ordem_sequencia: 1,
                processo_termico: 'frio'
              });
              marcar(day.dateStr);
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
          for (const day of diasPermitidosProd) {
            const slotKey = `${r40.id}_${day.dateStr}`;
            if (!occupiedSlots.has(slotKey)) {
              occupiedSlots.add(slotKey);
              daysWithCaldeira.add(day.dateStr);

              const plannedKg = Math.min(40, Math.max(reqMassKg, 20));
              const plannedUnits = procInfo.unitWeightKg ? Math.round(plannedKg / procInfo.unitWeightKg) : null;

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
                observacoes: `Reator 40kg (Produção Quente)${plannedUnits == null ? '' : ` | ~${plannedUnits.toLocaleString('pt-BR')} un`}`,
                ordem_status: 'planejado',
                fisico_confirmado_massa: false,
                fisico_confirmado_embalagem: false,
                fisico_confirmado_rotulo: false,
                recipiente_detalhe: 'Reator 40kg',
                cor_tag: colorInfo.tag,
                ordem_sequencia: 1,
                processo_termico: 'quente'
              });
              marcar(day.dateStr);
              scheduled = true;
              break;
            }
          }
        }
      }

      if (scheduled) continue;

      // CENÁRIO B: Quentes pequenos (< 200kg) batidas na bombona com água da caldeira!
      // Regra: Aproveita caldeira já ligada ou agrupa na bombona
      if (procInfo.isQuente && reqMassKg < 200 && procInfo.canBombona) {
        const bombonaReator = reatores.find(r => r.id === 'BOMBONAS' && r.ativo);
        if (bombonaReator) {
          const sortedDays = [...diasPermitidosProd].sort((a, b) => {
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
              const plannedUnits = procInfo.unitWeightKg ? Math.round(plannedKg / procInfo.unitWeightKg) : null;

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
                observacoes: `Água Quente Caldeira (Bombona)${plannedUnits == null ? '' : ` | ~${plannedUnits.toLocaleString('pt-BR')} un`}`,
                ordem_status: 'planejado',
                fisico_confirmado_massa: false,
                fisico_confirmado_embalagem: false,
                fisico_confirmado_rotulo: false,
                recipiente_detalhe: recip,
                cor_tag: colorInfo.tag,
                ordem_sequencia: 1,
                processo_termico: 'agua_caldeira'
              });
              marcar(day.dateStr);
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
          for (const day of diasPermitidosProd) {
            const currentDayBombonas = bombonaSlotsCount[day.dateStr] || 0;
            if (currentDayBombonas < 4) {
              bombonaSlotsCount[day.dateStr] = currentDayBombonas + 1;
              const bombonaCap = reqMassKg <= 60 ? 50 : (reqMassKg <= 120 ? 100 : 200);
              const recip = `Bombona ${bombonaCap}kg`;
              const plannedKg = Math.max(bombonaCap, Math.round(reqMassKg));
              const plannedUnits = procInfo.unitWeightKg ? Math.round(plannedKg / procInfo.unitWeightKg) : null;

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
                observacoes: `Mistura a Frio (Base Pronta)${plannedUnits == null ? '' : ` | ~${plannedUnits.toLocaleString('pt-BR')} un`}`,
                ordem_status: 'planejado',
                fisico_confirmado_massa: false,
                fisico_confirmado_embalagem: false,
                fisico_confirmado_rotulo: false,
                recipiente_detalhe: recip,
                cor_tag: colorInfo.tag,
                ordem_sequencia: 1,
                processo_termico: 'frio'
              });
              marcar(day.dateStr);
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

      // Menor reator em que caiba; depois os que não comportam, do maior para o menor
      const reatoresOrdenados = ordenarReatoresPorCaber(compatibleReatores, reqMassKg);

      for (const reator of reatoresOrdenados) {
        for (const day of diasPermitidosProd) {
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
            const plannedUnits = procInfo.unitWeightKg ? Math.round(plannedQty / procInfo.unitWeightKg) : null;

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
                : 'Processo a Frio') + `${plannedUnits == null ? '' : ` | ~${plannedUnits.toLocaleString('pt-BR')} un`}`,
              ordem_status: 'planejado',
              fisico_confirmado_massa: false,
              fisico_confirmado_embalagem: false,
              fisico_confirmado_rotulo: false,
              recipiente_detalhe: `Reator ${reator.capacidade_kg}kg`,
              cor_tag: colorInfo.tag,
              ordem_sequencia: 1,
              processo_termico: procInfo.isQuente ? (reator.id === 'R_100' ? 'resistencia' : (reator.id === 'R_40' ? 'quente' : 'caldeira')) : 'frio'
            });
            marcar(day.dateStr);
            scheduled = true;
            break;
          }
        }
        if (scheduled) break;
      }
    }

    const aceitas = proposed.filter(item => !validarAlocacao({
      reatorId: item.reator_id,
      dateStr: item.data_planejada,
      kg: Number(item.quantidade_planejada) || 0,
      reatores,
      plannedItems: [...plannedItems, ...proposed.filter(p => p.id !== item.id && p.data_planejada === item.data_planejada && p.reator_id === item.reator_id)],
    }));

    const totalKg = aceitas.reduce((acc, i) => acc + Number(i.quantidade_planejada || 0), 0);
    setHeuristicProposal(aceitas);
    setHeuristicStats({
      totalBatches: aceitas.length,
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
      const kgPorFila = new Map<string, number>();
      for (const item of heuristicProposal) {
        const cand = demandCandidates.find((c: any) => c.codigo === item.codigo_produto && c._filaId);
        if (!cand) continue;
        kgPorFila.set(cand._filaId, (kgPorFila.get(cand._filaId) || 0) + (Number(item.quantidade_planejada) || 0));
      }
      const consumirFila = Array.from(kgPorFila.entries())
        .filter(([filaId]) => filaDemandas.some((f: any) => f.id === filaId))
        .map(([filaId, kg]) => ({ filaId, kg }));
      // Ordens e consumo da fila gravam juntos no servidor (mesma transação).
      const res = await apiFetch('/producao/planejamento-semanal/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: heuristicProposal, consumirFila })
      });
      if (!res.ok) {
        avisar('Não foi possível gravar a sugestão no servidor.', 'erro');
        return;
      }
      await fetchPlanejamento();
      await fetchFila();
      setHeuristicModalOpen(false);
      avisar("Planejamento semanal aplicado.", 'sucesso');
    } catch (e) {
      console.warn('Erro ao salvar a sugestão:', e);
      avisar('Falha de conexão ao aplicar a sugestão.', 'erro');
    } finally {
      window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
      onScheduleChanged?.();
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {aviso}
      <AvisoProdutosSemPeso />
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
          {!podeEditar && (
            <span className="px-2 py-1 rounded-md border border-zinc-200 bg-zinc-100 text-zinc-600 text-[10px] font-bold">Somente leitura</span>
          )}
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

{podeEditar && (
          <>
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

          </>
          )}

                    <button
            onClick={() => setCoberturaAberta(true)}
            className="bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Insumos da semana: o que falta, o que chega e o que precisa de decisão (reserva do ERP, pedidos, notas e ordens manuais)"
          >
            <ShieldCheck size={14} className="text-zinc-500" />
            <span>Insumos da Semana</span>
          </button>

          <button
            onClick={handlePrintWeeklyPlan}
            className="p-1.5 bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded-lg transition-colors cursor-pointer"
            title="Imprimir Programação Semanal de Produção em formato A4"
          >
            <Printer size={15} />
          </button>

          {podeEditar && (
          <>
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
          </>
          )}
        </div>
      </div>

      {/* ÁREA PRINCIPAL: GRADE DE REATORES + GAVETA LATERAL DE DEMANDAS */}
      <div className="flex gap-4 items-start w-full">
        {/* GRADE MATRIZ: REATORES (LINHAS) x SEGUNDA A SEXTA (COLUNAS) */}
        <div className={`flex-1 bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden ${podeEditar ? '' : 'pointer-events-none'}`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-zinc-900 text-white border-b border-zinc-800">
                  <th className="p-3 w-56 font-bold text-zinc-200 border-r border-zinc-800">
                    REATOR / CAPACIDADE
                  </th>
                  {weekDays.map(day => {
                    const isToday = day.dateStr === formatDateStr(new Date());
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
                          <Package size={16} className="text-zinc-500 mt-0.5"><title>Bombonas Móveis de Mistura</title></Package>
                        ) : reator.id === 'R_100' ? (
                          <Zap size={16} className="text-zinc-500 mt-0.5"><title>Aquecimento por Resistência (Máx 1/dia)</title></Zap>
                        ) : reator.id === 'R_40' ? (
                          <Flame size={16} className="text-zinc-500 mt-0.5"><title>Reator 40kg (Produção Quente)</title></Flame>
                        ) : (reator.id === 'R_1000_SHAMPOO' || reator.id === 'R_1000') ? (
                          <Snowflake size={16} className="text-zinc-500 mt-0.5"><title>Exclusivo Shampoos</title></Snowflake>
                        ) : reator.id === 'R_1000_MISTO' ? (
                          <Boxes size={16} className="text-zinc-500 mt-0.5"><title>Caldeira - Produção Mista</title></Boxes>
                        ) : reator.tipo === 'quente' ? (
                          <Flame size={16} className="text-zinc-500 mt-0.5"><title>Requer Caldeira</title></Flame>
                        ) : (
                          <Boxes size={16} className="text-zinc-500 mt-0.5"><title>Caldeira / Misto</title></Boxes>
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

                              const totalKg = draggedBatch.reduce((acc, it) => acc + (Number(it.quantidade_planejada) || 0), 0);
                              const bloqueio = validarAlocacao({
                                reatorId: reator.id,
                                dateStr: day.dateStr,
                                kg: totalKg,
                                reatores,
                                plannedItems,
                                ignoreIds: new Set(draggedBatch.map(i => i.id)),
                              });
                              if (bloqueio) {
                                avisar(bloqueio, 'info');
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
                                const ok = await handleSaveItem(updated);
                                if (ok) updatedList.push(updated);
                              }
                              if (updatedList.length !== draggedBatch.length) {
                                await fetchPlanejamento();
                              }

                              setDraggedBatch(null);
                              setDraggedItem(null);
                              return;
                            }

                            if (draggedItem) {
                              if (draggedItem.reator_id === reator.id && draggedItem.data_planejada === day.dateStr) {
                                setDraggedItem(null);
                                return;
                              }
                              const bloqueioItem = validarAlocacao({
                                reatorId: reator.id,
                                dateStr: day.dateStr,
                                kg: Number(draggedItem.quantidade_planejada) || 0,
                                reatores,
                                plannedItems,
                                ignoreIds: new Set([draggedItem.id]),
                              });
                              if (bloqueioItem) {
                                avisar(bloqueioItem, 'info');
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

                              setDraggedItem(null);
                              const ok = await handleSaveItem(updated);
                              if (!ok) await fetchPlanejamento();
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
                                          <Flame size={12} className="text-orange-500 shrink-0"><title>Processo Quente</title></Flame>
                                        ) : (
                                          <Snowflake size={12} className="text-sky-400 shrink-0"><title>Processo Frio</title></Snowflake>
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
                                        {groupCellItems(cellItems).length > 1 && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleMoveOrder(batch.primaryItem, 'up')}
                                              className="p-1 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded cursor-pointer"
                                              title="Subir na sequência do dia"
                                            >
                                              <ChevronUp size={12} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleMoveOrder(batch.primaryItem, 'down')}
                                              className="p-1 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded cursor-pointer"
                                              title="Descer na sequência do dia"
                                            >
                                              <ChevronDown size={12} />
                                            </button>
                                          </>
                                        )}
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
                                          const estUn = unidadesDeKg(it.quantidade_planejada, it.descricao, ehBaseProduto({ codigo: it.codigo_produto, descricao: it.descricao }));
                                          return (
                                            <div key={it.id} className="text-[11px] leading-tight">
                                              <div className="font-bold text-zinc-800 line-clamp-1" title={it.descricao}>
                                                {it.descricao || it.codigo_produto}
                                              </div>
                                              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                                                <span>{it.codigo_produto}</span>
                                                <span><strong className="text-zinc-700">{it.quantidade_planejada} kg</strong> ({estUn == null ? "— un" : `~${estUn.toLocaleString("pt-BR")} un`})</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Envase previsto (dias até o envase definidos no produto) */}
                                    {(() => {
                                      const comEnvase = batch.items
                                        .map(it => ({ it, dias: diasAteEnvasePorCodigo.get(it.codigo_produto) }))
                                        .filter((x): x is { it: PlanejamentoItem; dias: number } => x.dias !== undefined);
                                      if (comEnvase.length === 0) return null;
                                      return (
                                        <div className="flex flex-col gap-0.5">
                                          {comEnvase.map(({ it, dias }) => (
                                            <span
                                              key={it.id}
                                              className="text-[10px] text-zinc-500"
                                              title={`Previsão: data planejada + ${dias} dia(s) até o envase (definido no produto). A liberação real continua sendo o laudo físico-químico.`}
                                            >
                                              Envase ≥ {previsaoEnvase(it.data_planejada, dias)}{batch.isMulti ? ` · ${it.codigo_produto}` : ''}
                                            </span>
                                          ))}
                                        </div>
                                      );
                                    })()}

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
                                                        const yieldUnits = unidadesDeKg(batch.primaryItem.quantidade_planejada, batch.primaryItem.descricao, ehBaseProduto({ codigo: batch.primaryItem.codigo_produto, descricao: batch.primaryItem.descricao }));
                                                        return yieldUnits == null ? '— un' : `~${yieldUnits.toLocaleString('pt-BR')} un`;
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
                                              <SeloCobertura
                                                resultado={piorResultado(batch.items.map(it => coberturaPorOrdem[it.id]))}
                                                onClick={() => setCoberturaAberta(true)}
                                                compacto
                                              />
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

                              {/* Capacidade livre do reator no dia */}
                              {cellItems.length > 0 && reator.id !== 'BOMBONAS' && (() => {
                                const usado = cellItems.reduce((acc, it) => acc + (Number(it.quantidade_planejada) || 0), 0);
                                const livre = Math.round(reator.capacidade_kg - usado);
                                return livre < 0 ? (
                                  <div className="text-[10px] text-red-600/80 text-right">excede {Math.abs(livre).toLocaleString('pt-BR')} kg</div>
                                ) : (
                                  <div className="text-[10px] text-zinc-500 text-right">{livre.toLocaleString('pt-BR')} kg livres</div>
                                );
                              })()}

                              {/* Botão de Agendamento Rápido na Célula Vaga */}
                              {cellItems.length === 0 && podeEditar && (
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
                  const isBase = eBase(prod.codigo, prod.categoria_produto, prod.status_produto);
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
                      key={prod._filaId ? `fila_${prod._filaId}` : prod.codigo} 
                      draggable={podeEditar}
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
                            handleShowProductDetails(prod.codigo);
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
                            handleShowProductDetails(prod.codigo);
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
                        <SeloCobertura
                          resultado={coberturaPorCandidato[chaveCandidato({ codigo: String(prod.codigo || ''), kg: Number(prod.quantidade_kg) || 0 })]}
                          onClick={() => setCoberturaAberta(true)}
                        />
                      </div>

                      {/* 5. Ação de Agendamento e Ver Detalhes */}
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowProductDetails(prod.codigo);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer py-1 px-1.5 rounded hover:bg-zinc-100"
                          title="Ver detalhes completos do produto"
                        >
                          <Info size={13} className="text-zinc-500" />
                          <span>Ver Detalhes</span>
                        </button>
                        <div className="flex items-center gap-1.5">
                        {podeEditar && (prod as any)._filaId && (
                          <button
                            type="button"
                            onClick={() => setRetirarFilaId(String((prod as any)._filaId))}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                            title="Tirar este item da fila"
                          >
                            Tirar
                          </button>
                        )}
                        {podeEditar && (
                        <button
                          onClick={() => handleOpenScheduleModal(prod)}
                          className="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-xs bg-zinc-900 hover:bg-zinc-800 text-white"
                        >
                          <Plus size={13} />
                          <span>Agendar</span>
                        </button>
                        )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: CONFIGURAÇÃO DE REATORES E REGRAS DE CAPACIDADE */}
      {reatoresModalOpen && (
        <ReatoresDrawer
          reatores={reatores}
          setReatores={setReatores}
          setReatoresModalOpen={setReatoresModalOpen}
          avisar={avisar}
          fetchReatores={fetchReatores}
        />
      )}

      {/* MODAL: AGENDAR PRODUTO NO REATOR / DIA */}
      {scheduleModalItem && (
        <AgendarDrawer
          products={products}
          reatores={reatores}
          weekDays={weekDays}
          sameFormulaProducts={sameFormulaProducts}
          loadingSameFormula={loadingSameFormula}
          scheduleSearch={scheduleSearch}
          setScheduleSearch={setScheduleSearch}
          scheduleSelectedProducts={scheduleSelectedProducts}
          setScheduleSelectedProducts={setScheduleSelectedProducts}
          scheduleItemMasses={scheduleItemMasses}
          scheduleQty={scheduleQty}
          scheduleReator={scheduleReator}
          setScheduleReator={setScheduleReator}
          scheduleDate={scheduleDate}
          setScheduleDate={setScheduleDate}
          scheduleRecipienteDetalhe={scheduleRecipienteDetalhe}
          setScheduleRecipienteDetalhe={setScheduleRecipienteDetalhe}
          setScheduleModalItem={setScheduleModalItem}
          handleAddProductToSchedule={handleAddProductToSchedule}
          handleRemoveProductFromSchedule={handleRemoveProductFromSchedule}
          handleChangeItemMass={handleChangeItemMass}
          handleChangeTotalMass={handleChangeTotalMass}
          handleConfirmSchedule={handleConfirmSchedule}
        />
      )}

      {/* MODAL: VINCULAR LOTE ERP DIRETAMENTE NO CARD */}
      {linkLoteModalItem && (
        <VincularLoteDrawer
          linkLoteModalItem={linkLoteModalItem}
          setLinkLoteModalItem={setLinkLoteModalItem}
          handleConfirmLinkLote={handleConfirmLinkLote}
        />
      )}

      {/* MODAL: EDITAR QUANTIDADE A SER PRODUZIDA (MASSA KG) */}
      {editQtyModalItem && (
        <EditarQuantidadeDrawer
          editQtyModalItem={editQtyModalItem}
          setEditQtyModalItem={setEditQtyModalItem}
          reatores={reatores}
          handleConfirmEditQty={handleConfirmEditQty}
        />
      )}

      {/* MODAL: CONFIGURAÇÕES DA BATELADA (PARÂMETROS TÉCNICOS, PROCESSO, EQUIPAMENTO) */}
      {technicalModalItem && (
        <ParametrosBateladaDrawer
          technicalModalItem={technicalModalItem}
          setTechnicalModalItem={setTechnicalModalItem}
          reatores={reatores}
          weekDays={weekDays}
          handleSaveTechnicalModal={handleSaveTechnicalModal}
        />
      )}

      {/* MODAL: PROPOSTA DA HEURÍSTICA AUTOMÁTICA */}
      {heuristicModalOpen && (
        <SugestaoDrawer
          heuristicProposal={heuristicProposal}
          heuristicStats={heuristicStats}
          reatores={reatores}
          setHeuristicModalOpen={setHeuristicModalOpen}
          handleApplyHeuristic={handleApplyHeuristic}
        />
      )}


      {/* MODAL: RELATÓRIO DE CONSUMO DE MATÉRIAS-PRIMAS E EMBALAGENS */}
      {previaAcao && <PreviaAcaoDrawer previa={previaAcao} onClose={() => setPreviaAcao(null)} />}
      {retirarFilaId && (
        <RetirarDaFilaDrawer
          filaId={retirarFilaId}
          onClose={() => setRetirarFilaId(null)}
          onRetirado={() => {
            setRetirarFilaId(null);
            fetchFila();
          }}
        />
      )}
      <CoberturaInsumosDrawer
        isOpen={coberturaAberta}
        onClose={() => setCoberturaAberta(false)}
        semana={currentWeekKey}
        descreverOrdem={descreverOrdem}
        onVincular={handleVincularSugerido}
        onMudou={recarregarCobertura}
      />

      {/* Drawer autônomo de Detalhes do Produto */}
      {internalDrawerOpen && internalDrawerCode && (
        <ProductDetailsDrawer
          productCode={internalDrawerCode}
          isOpen={internalDrawerOpen}
          onClose={() => {
            setInternalDrawerOpen(false);
            setInternalDrawerCode(null);
          }}
        />
      )}
    </div>
  );
}
