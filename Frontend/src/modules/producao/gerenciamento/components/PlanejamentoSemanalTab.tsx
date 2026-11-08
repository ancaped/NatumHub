import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Calendar, X, AlertTriangle, HelpCircle, Database, Check, ArrowRight, Clock, Truck, ShieldAlert, Layers, Filter, TrendingDown, CheckCircle, ArrowUpDown, FileSpreadsheet, Download, GripVertical, AlertOctagon, SlidersHorizontal, FlaskConical
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../../../geral/lib/http';
import AvisoProdutosSemPeso from '../../components/AvisoProdutosSemPeso';
import { unidadesDeKg, ehBaseProduto } from '../../lib/unitConversion';
import { getHoliday, getBrazilHolidaysForYear, HolidayInfo } from '../../../geral/lib/brazilHolidays';
import { ProductDetailsDrawer } from './ProductDetailsDrawer';
import CoberturaInsumosDrawer from './CoberturaInsumosDrawer';
import RetirarDaFilaDrawer from './RetirarDaFilaDrawer';
import LimparFilaDrawer from './LimparFilaDrawer';
import RegrasPanel from './RegrasPanel';
import PreviaAcaoDrawer, { PreviaAcao } from './PreviaAcaoDrawer';
import { canEdit, getAuthUser } from '../../../geral/lib/auth';
import { useAviso } from '../../../geral/components/ui/Aviso';
import Drawer from '../../../geral/components/ui/Drawer';
import { useCoberturaSemana } from './cobertura';
import { usePreviaServidor } from '../../lib/usePreviaServidor';
import { getProductColorInfo, getProductProcessType, getShortReatorName, ehBombona, bombonaParaMassa, recipienteDoReator, resolverRecipienteSugerido } from '../../lib/processoProduto';
import { ParametrosBateladaDrawer } from './planejamento/ParametrosBateladaDrawer';
import { EditarQuantidadeDrawer } from './planejamento/EditarQuantidadeDrawer';
import { VincularLoteDrawer } from './planejamento/VincularLoteDrawer';
import { AgendarDrawer } from './planejamento/AgendarDrawer';
import { AdicionarFilaDrawer } from './planejamento/AdicionarFilaDrawer';
import { ReatoresDrawer } from './planejamento/ReatoresDrawer';
import type { DiaSemana, ScheduleModalItem, LinkLoteModalItem, EditQtyModalItem, TechnicalModalItem } from './planejamento/tiposDrawers';
import { eBase } from '../../../geral/lib/regrasProduto';

import {
  DEFAULT_REATORES, infoDoReator, groupCellItems, getMondayOfWeek, formatDateStr, getWeekKey, mensagemErroServidor, candidatoDaFila, validarAlocacao,
  type CellBatchGroup, type ReatorConfig, type PlanejamentoItem,
} from './planejamento/lib/planejamentoSemanal';
import { imprimirPlanejamentoSemanal } from './planejamento/lib/imprimirPlanejamento';
import { CartaoOrdem } from './planejamento/CartaoOrdem';
import { BarraSemana } from './planejamento/BarraSemana';
import { ListaPorDia } from './planejamento/ListaPorDia';
import { GradeSemanal } from './planejamento/GradeSemanal';
import { GavetaFila } from './planejamento/GavetaFila';

// Os importadores de fora continuam lendo estes tipos e funções daqui.
export type { ReatorConfig, PlanejamentoItem, InsumoSummary, CellBatchGroup } from './planejamento/lib/planejamentoSemanal';
export { infoDoReator, isPastEndOfDay, groupCellItems, validarAlocacao } from './planejamento/lib/planejamentoSemanal';

interface PlanejamentoSemanalTabProps {
  active?: boolean;
  onScheduleChanged?: () => void;
  currentDate?: Date;
  onCurrentDateChange?: (d: Date) => void;
  onShowDetails?: (code: string) => void;
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
  // No celular (abaixo de lg) o Banco de Demandas começa fechado: a fila empilha embaixo da barra de comandos
  const [demandBankOpen, setDemandBankOpen] = useState(() => {
    try { return window.matchMedia('(min-width: 1024px)').matches; } catch { return true; }
  });
  const [demandSearch, setDemandSearch] = useState('');
  const [filaAba, setFilaAba] = useState<'disponiveis' | 'falta' | 'bases'>('disponiveis');
  // Tudo o que o servidor manda (manuais da tabela + automáticos calculados); `filaDemandas` são só os manuais.
  const [filaTodos, setFilaTodos] = useState<any[]>([]);
  const filaDemandas = useMemo(() => filaTodos.filter(f => f.origem !== 'automatica'), [filaTodos]);
  const [retirarFilaId, setRetirarFilaId] = useState<string | null>(null);
  const [limparFilaAberto, setLimparFilaAberto] = useState(false);
  const [regrasAberto, setRegrasAberto] = useState(false);
  const [adicionarFila, setAdicionarFila] = useState<{ codigo?: string; qtdKg?: number } | null>(null);
  const [basesResumo, setBasesResumo] = useState<any[]>([]);
  const [basesBusca, setBasesBusca] = useState('');
  // Card da fila: vai da posição dele até o fim da tela, em qualquer altura de janela.
  const filaCardRef = useRef<HTMLDivElement>(null);
  const [filaAltura, setFilaAltura] = useState<number | null>(null);
  const [previaAcao, setPreviaAcao] = useState<PreviaAcao | null>(null);
  const [demandFilter, setDemandFilter] = useState<'FILA' | 'ALL' | 'CRITICOS' | 'PROGRAMADAS' | 'KITS' | 'BASES'>('FILA');
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('ALL');

  const semanaFila = getWeekKey(currentDate);
  const fetchFila = useCallback(async () => {
    try {
      const res = await apiFetch(`/producao/fila-demandas?week=${encodeURIComponent(semanaFila)}`);
      if (res.ok) {
        const data = await res.json();
        setFilaTodos(Array.isArray(data.items) ? data.items : []);
      }
    } catch (e) {
      console.warn('Erro ao buscar fila de demandas:', e);
    }

  }, [semanaFila]);

  // Modais de Ação
  const [scheduleModalItem, setScheduleModalItem] = useState<ScheduleModalItem | null>(null);
  const [scheduleSearch, setScheduleSearch] = useState<string>('');
  const [scheduleSelectedProducts, setScheduleSelectedProducts] = useState<any[]>([]);
  const [scheduleItemMasses, setScheduleItemMasses] = useState<Record<string, number>>({});
  const [scheduleQty, setScheduleQty] = useState<number>(100);
  const [scheduleReator, setScheduleReator] = useState<string>('R_100');
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleEnvaseLine, setScheduleEnvaseLine] = useState<string>('L1');
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

  // "Sugerir Sequência": a prévia e a gravação vêm do servidor (2 passos).
  const [sugerindo, setSugerindo] = useState(false);
  const { pedir: pedirPrevia, elemento: previaServidor } = usePreviaServidor(avisar);

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
                             p.status_produto === 'terceirizado';
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

  // Aba Bases do card da fila: todas as bases, com ou sem demanda (recarrega quando a fila ou o quadro mudam).
  useEffect(() => {
    if (!active || !demandBankOpen || filaAba !== 'bases') return;
    let vivo = true;
    apiFetch('/producao/bases-resumo')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && d) setBasesResumo(Array.isArray(d.items) ? d.items : []); })
      .catch(e => console.warn('Erro ao buscar bases:', e));
    return () => { vivo = false; };
  }, [active, demandBankOpen, filaAba, filaDemandas, plannedItems]);

  useEffect(() => {
    if (!demandBankOpen) return;
    const ajustar = () => {
      const el = filaCardRef.current;
      if (!el) return;
      // Altura calculada pela janela só em ≥1024 px; abaixo disso a fila empilha com altura natural (max-h em dvh)
      if (!window.matchMedia('(min-width: 1024px)').matches) {
        setFilaAltura(null);
        return;
      }
      const topo = Math.max(el.getBoundingClientRect().top, 12);
      setFilaAltura(Math.max(360, Math.floor(window.innerHeight - topo - 12)));
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    window.addEventListener('scroll', ajustar, true);
    return () => {
      window.removeEventListener('resize', ajustar);
      window.removeEventListener('scroll', ajustar, true);
    };
  }, [demandBankOpen]);

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

    const mappedFila = filaTodos
      .filter(f => {
        if (!demandSearch.trim()) return true;
        const q = demandSearch.toLowerCase().trim();
        const code = (f.codigoProduto || f.codigo_produto || '').toLowerCase();
        const desc = (f.descricao || '').toLowerCase();
        const obs = (f.observacoes || '').toLowerCase();
        return code.includes(q) || desc.includes(q) || obs.includes(q);
      })
      .map(f => candidatoDaFila(f, prodMap.get(f.codigoProduto || f.codigo_produto) || {}));

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
  }, [products, filaTodos, demandSearch]);

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

    return { totalKg, totalBatches, envaseDayLoad, caldeiraItems };
  }, [plannedItems]);

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
    const res = await apiFetch('/producao/fila-demandas?confirmar=true', {
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
      const res = await apiFetch('/producao/planejamento-semanal/bulk?confirmar=true', {
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
        pedirMotivo: true,
        executar: executarLimparSemana,
      });
    } catch (e) {
      console.warn('Erro ao ler a semana no servidor:', e);
      avisar('Falha de conexão ao ler a semana.', 'erro');
    }
  };

  const executarLimparSemana = async (motivo?: string) => {
    try {
      const res = await apiFetch(`/producao/planejamento-semanal/clear?week=${currentWeekKey}&confirmar=true&motivo=${encodeURIComponent(motivo ?? '')}`, {
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
    if (ehBombona(reatores.find(x => x.id === item.reator_id)) || qtyTargets.length === 1) {
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
      pedirMotivo: true,
      executar: (motivo) => executarDeleteBatch(batchItems, motivo),
    });
  };

  const executarDeleteBatch = async (batchItems: PlanejamentoItem[], motivo?: string) => {
    const removidos: PlanejamentoItem[] = [];
    let bloqueado = false;
    for (const it of batchItems) {
      try {
        const res = await apiFetch(`/producao/planejamento-semanal/${it.id}?confirmar=true&motivo=${encodeURIComponent(motivo ?? '')}`, { method: 'DELETE' });
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
  // Abas da fila: mesma situação de insumos que o servidor calculou (depois das ordens do quadro da semana).
  const aguardaInsumo = (p: any): boolean => p._situacao === 'aguardando_insumos';
  const qtdAguardandoInsumo = demandCandidates.filter(aguardaInsumo).length;
  const qtdDisponiveis = demandCandidates.length - qtdAguardandoInsumo;
  const demandVisiveis = filaAba === 'falta' ? demandCandidates.filter(aguardaInsumo) : demandCandidates.filter(p => !aguardaInsumo(p));
  const produtoPorCodigo = useMemo(() => new Map<string, any>(products.map(p => [p.codigo, p])), [products]);
  const codigosNaFila = useMemo(() => new Set<string>(filaDemandas.map(f => f.codigoProduto || f.codigo_produto)), [filaDemandas]);
  const basesVisiveis = useMemo(() => {
    const q = basesBusca.trim().toLowerCase();
    return basesResumo.filter(b => !q || String(b.codigo || '').toLowerCase().includes(q) || String(b.descricao || '').toLowerCase().includes(q));
  }, [basesResumo, basesBusca]);

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
        recipiente_detalhe: recipienteDoReator(reatores.find(x => x.id === reatorId)),
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
          const sugeridoId = resolverRecipienteSugerido(procInfo.recipienteSugerido, reatores, suggestedMassKg);
          matchingReator = reatores.find(r => r.id === sugeridoId && r.ativo);
        }
        if (!matchingReator) {
          matchingReator = reatores.find(r => {
            if (!r.ativo) return false;
            if ((r.id === 'R_1000_SHAMPOO' || r.id === 'R_1000') && !procInfo.isShampoo) return false;
            return r.capacidade_kg >= suggestedMassKg * 0.7 && r.capacidade_kg <= Math.max(suggestedMassKg * 2.2, 100);
          }) || reatores[0];
        }
      }
      
      const reatorId = matchingReator ? matchingReator.id : (bombonaParaMassa(reatores, suggestedMassKg)?.id ?? 'R_500');
      setScheduleReator(reatorId);
      setScheduleDate(targetDate || weekDays[0]?.dateStr || '');

      
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
            ? (ehBombona(reatores.find(x => x.id === scheduleReator)) ? 'Água Quente Caldeira (Bombona)' : (scheduleReator === 'R_100' ? 'Resistência (100kg)' : (scheduleReator === 'R_40' ? 'Reator 40kg (Quente)' : 'Requer Caldeira'))) 
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
        recipiente_detalhe: recipienteDoReator(reatores.find(x => x.id === scheduleReator)),
        cor_tag: colorInfo.tag,
        ordem_sequencia: nextSeq,
        processo_termico: procInfo.isQuente ? (ehBombona(reatores.find(x => x.id === scheduleReator)) ? 'agua_caldeira' : (scheduleReator === 'R_100' ? 'resistencia' : (scheduleReator === 'R_40' ? 'quente' : 'caldeira'))) : 'frio',
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
  const handlePrintWeeklyPlan = () => imprimirPlanejamentoSemanal({ currentWeekKey, weekDays, plannedItems, reatores, weekStats, avisar });

  // Sugestão da semana ("Seguir sequência"): o servidor percorre a fila (manuais por prioridade, depois automáticos por EFP)
  // e só propõe o que tem 100% dos insumos e embalagens cobertos, contando o quadro e o que a própria sequência já colocou.
  // Aqui só se mostra a prévia (bateladas e pulados) e se grava no OK.
  const handleRunHeuristic = async () => {
    setSugerindo(true);
    try {
      const dm = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/');
      await pedirPrevia({
        url: '/producao/planejamento/sugerir-sequencia',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ week: currentWeekKey, motivo: 'Seguir sequência (tela do Planejamento)' }),
        },
        titulo: `Seguir sequência — semana ${currentWeekKey.split('-W')[1]}`,
        confirmarRotulo: 'Gravar sequência',
        linhas: (d) => (d?.bateladas ?? []).map((b: any) => ({
          titulo: `${b.descricao || b.produto}${b.partes > 1 ? ` (batelada ${b.parte}/${b.partes})` : ''}`,
          detalhe: `${dm(String(b.dia))} · ${getShortReatorName(b.reator, undefined, reatores)} · ${Number(b.kg).toLocaleString('pt-BR')} kg · ${b.recipiente} · ${b.origem === 'automatica' ? 'automático' : 'manual'}`,
        })),
        avisos: (d) => [
          ...(d?.bateladas ?? []).length === 0 ? ['Nenhum item da fila tem os insumos 100% cobertos para entrar na semana.'] : [],
          ...(d?.pulados ?? []).slice(0, 12).map((p: any) => `${p.codigo} ${p.descricao}: ${p.detalhe}`),
          ...((d?.pulados ?? []).length > 12 ? [`E mais ${(d.pulados.length - 12)} item(ns) pulado(s).`] : []),
        ],
        erroPadrao: 'Não foi possível montar a sugestão da semana.',
        aoConcluir: async () => {
          await fetchPlanejamento();
          await fetchFila();
          avisar('Planejamento semanal aplicado.', 'sucesso');
          window.dispatchEvent(new CustomEvent('natum:refresh-acompanhamento'));
          onScheduleChanged?.();
        },
      });
    } finally {
      setSugerindo(false);
    }
  };

  // Fixa um item automático da fila: vira item manual (rota existente, 2 passos) e passa a mandar sobre o automático.
  const handleFixarNaFila = (prod: any) => {
    void pedirPrevia({
      url: '/producao/fila-demandas',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          codigoProduto: prod.codigo,
          descricao: prod.descricao,
          quantidade: Number(prod.quantidade) || 0,
          unidade: prod.unidade || 'un',
          quantidadeKg: Number(prod.quantidade_kg) || null,
          origemDemanda: 'fixada_da_fila_automatica',
          linhaEnvase: prod.linha_envase || null,
          baseCodigo: prod.base_codigo || null,
          baseNome: prod.base || null,
        }]),
      },
      titulo: 'Fixar na fila',
      confirmarRotulo: 'Fixar',
      linhas: (d) => (d?.depois ?? []).map((i: any) => ({
        titulo: i.descricao || i.codigo_produto,
        detalhe: `${Number(i.quantidade).toLocaleString('pt-BR')} ${i.unidade ?? ''}${i.quantidade_kg != null ? ` (${Number(i.quantidade_kg).toLocaleString('pt-BR')} kg)` : ''}`,
      })),
      erroPadrao: 'Não foi possível fixar o item na fila.',
      aoConcluir: fetchFila,
    });
  };

  const arraste = { draggedItem, draggedBatch, draggedDrawerProduct, dragOverCell, setDraggedItem, setDraggedBatch, setDraggedDrawerProduct, setDragOverCell };
  const acoesCartao = {
    handleOpenTechnicalModal, handleMoveOrder, handleDeleteBatch, handleOpenBatchMassEditModal, handleOpenLinkLoteModal,
    handleToggleBatchAprovacao, handleToggleAprovacao, setEditQtyModalItem, setCoberturaAberta,
  };
  const cartao = { arraste, acoes: acoesCartao, diasAteEnvasePorCodigo, coberturaPorOrdem };
  // Cartão de uma ordem/batelada: o mesmo componente serve à grade (desktop) e à lista por dia (celular)
  const renderCartaoOrdem = (batch: CellBatchGroup, cellItems: PlanejamentoItem[]) => (
    <CartaoOrdem key={batch.key} batch={batch} cellItems={cellItems} {...cartao} />
  );

  return (
    <div className="flex flex-col gap-4 w-full">
      {aviso}
      <AvisoProdutosSemPeso />
      {/* BARRA SUPERIOR DE COMANDOS */}
      <BarraSemana
        semana={{ currentWeekKey, weekDays, weekStats, loadingPlan, plannedItems, filaTodos }}
        acoes={{
          handlePrevWeek, handleToday, handleNextWeek, fetchPlanejamento, fetchFila, handleOpenScheduleModal, handleRunHeuristic,
          handlePrintWeeklyPlan, handleClearWeek, setCoberturaAberta, setReatoresModalOpen, setDemandBankOpen,
        }}
        podeEditar={podeEditar}
        demandBankOpen={demandBankOpen}
        sugerindo={sugerindo}
        reatores={reatores}
      />

      {/* ÁREA PRINCIPAL: GRADE DE REATORES + GAVETA LATERAL DE DEMANDAS */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-start w-full">
        {/* LISTA POR DIA (CELULAR): segunda a sexta, reatores com as mesmas ordens da grade */}
        <ListaPorDia
          weekDays={weekDays}
          reatores={reatores}
          matrixItemsMap={matrixItemsMap}
          podeEditar={podeEditar}
          handleOpenScheduleModal={handleOpenScheduleModal}
          cartao={cartao}
        />

        {/* GRADE MATRIZ: REATORES (LINHAS) x SEGUNDA A SEXTA (COLUNAS) */}
        <GradeSemanal
          weekDays={weekDays}
          reatores={reatores}
          matrixItemsMap={matrixItemsMap}
          plannedItems={plannedItems}
          podeEditar={podeEditar}
          arraste={arraste}
          cartao={cartao}
          avisar={avisar}
          handleSaveItem={handleSaveItem}
          fetchPlanejamento={fetchPlanejamento}
          handleOpenScheduleModal={handleOpenScheduleModal}
        />

        {/* GAVETA LATERAL: BANCO DE DEMANDAS (FILA EXCLUSIVA) */}
        {demandBankOpen && (
          <GavetaFila
            fila={{
              filaCardRef, filaAltura, demandCandidates, demandVisiveis, qtdDisponiveis, qtdAguardandoInsumo, filaDemandas, basesResumo, basesVisiveis, produtoPorCodigo,
            }}
            busca={{ filaAba, setFilaAba, demandSearch, setDemandSearch, basesBusca, setBasesBusca }}
            acoes={{
              setRegrasAberto, setAdicionarFila, setLimparFilaAberto, setRetirarFilaId, setCoberturaAberta, setDraggedDrawerProduct, setDragOverCell,
              handleShowProductDetails, handleOpenScheduleModal, handleFixarNaFila,
            }}
            podeEditar={podeEditar}
          />
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

      {previaServidor}

      {/* MODAL: RELATÓRIO DE CONSUMO DE MATÉRIAS-PRIMAS E EMBALAGENS */}
      {previaAcao && <PreviaAcaoDrawer previa={previaAcao} onClose={() => setPreviaAcao(null)} />}
      {regrasAberto && (
        <Drawer onClose={() => setRegrasAberto(false)} size="md" title="Regras do planejamento" subtitle="Regras gerais e anotações que o planejamento (e o agente de IA) segue">
          <div className="p-4">
            <RegrasPanel podeEditar={podeEditar} />
          </div>
        </Drawer>
      )}
      {limparFilaAberto && (
        <LimparFilaDrawer
          onClose={() => setLimparFilaAberto(false)}
          onLimpa={() => {
            setLimparFilaAberto(false);
            avisar('Fila limpa.', 'sucesso');
            fetchFila();
          }}
        />
      )}
      {adicionarFila && (
        <AdicionarFilaDrawer
          products={products}
          codigosNaFila={codigosNaFila}
          inicial={adicionarFila.codigo ? { codigo: adicionarFila.codigo, qtdKg: adicionarFila.qtdKg } : null}
          onClose={() => setAdicionarFila(null)}
          onAdicionado={async () => {
            setAdicionarFila(null);
            avisar('Item adicionado à fila.', 'sucesso');
            await fetchFila();
          }}
        />
      )}
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
