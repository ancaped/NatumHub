import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import TirarEsperaDrawer from './TirarEsperaDrawer';
import { pedirMotivoExclusao } from '../../producao/lib/useMotivoExclusao';
import PreviaAcaoDrawer, { type PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

import AppLayout, { SidebarItem } from '../../geral/components/layout/AppLayout';
import { cn } from '../../geral/lib/utils';
import { apiJson } from '../../geral/lib/http';
import { getAuthUser } from '../../geral/lib/auth';
import { getHoliday, isWeekend } from '../../geral/lib/brazilHolidays';

import { PlanejamentoSemanalTab } from '../../producao/gerenciamento/components/PlanejamentoSemanalTab';

import { CATEGORIAS_ENVASE, CORES_PREDEFINIDAS, REMOTE_LOOKUP_TTL_MS, REMOTE_LOTES_TTL_MS, MOTIVOS_PAUSA_PADRAO } from './lib/constantes';
import { parseLoteDateToIso, formatDateOnly } from './lib/datas';

import { getLotePlanningOrdem, inferCategoriaEnvase, inferCorProduto, loteMergeKey, stripLotePrefix, normalizeLoteSearch, deduplicateLotesByNumber, consolidateLotesForBatch, filterLotesBySearch, getEffectiveStatus, isLoteConcluido, isLoteParcial, isLoteOcultoNoQuadro, getLoteEtapaStatus, getEffectivePrevisao, isPastEndOfDay, getLoteScheduleDateIso, getLoteEsperaDetails, getPrevisaoBadge, rotuloLote, ehLotePlanejado } from './lib/lotes';
import type { CaldeiraRegistro, AdiarModalItem, UnifiedQuadroHeaderProps, StatusHistoryEntry, AcompanhamentoLote, LoteAdiadoRegistro, TerceirizadoSolicitacao, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem, KitAssemblyOrder, TabType, AcompanhamentoProducaoProps } from './lib/tipos';

import { useEstadoServidor, paraSet, deSet } from './lib/estadoQuadros';

import AvisoProdutosSemPeso from '../../producao/components/AvisoProdutosSemPeso';

import DetalhesItemModal from './modais/DetalhesItemModal';
import RelatorioEnvaseModal from './modais/RelatorioEnvaseModal';
import EsperaLoteModal from './modais/EsperaLoteModal';
import PausaLoteModal from './modais/PausaLoteModal';
import AdicionarLoteModal from './modais/AdicionarLoteModal';
import LocalizarDataModal from './modais/LocalizarDataModal';
import DetalhesKitModal from './modais/DetalhesKitModal';
import HistoricoLoteModal from './modais/HistoricoLoteModal';
import TerceirizadoLoteModal from './modais/TerceirizadoLoteModal';
import EsperaEnvaseModal from './modais/EsperaEnvaseModal';
import AjustarDatasModal from './modais/AjustarDatasModal';
import AdiarLoteModal from './modais/AdiarLoteModal';
import RelatorioEnvaseImpressao from './modais/RelatorioEnvaseImpressao';
import ConfiguracoesTab from './abas/ConfiguracoesTab';
import CalendarioTab from './abas/CalendarioTab';
import QuadroOrdens from './abas/QuadroOrdens';
import QuadroEnvase from './abas/QuadroEnvase';
import QuadroRotulagem from './abas/QuadroRotulagem';
import QuadroProducao from './abas/QuadroProducao';
import QuadroPesagem from './abas/QuadroPesagem';
import KitsTab from './abas/KitsTab';
import LotesTerceirizadosTab from './abas/LotesTerceirizadosTab';
import { exportarExcelGeral } from './lib/exportarExcelGeral';
import { exportarRelatorioEnvaseExcel } from './lib/exportarRelatorioEnvaseExcel';
import { renderCabecalhoQuadro } from './abas/CabecalhoQuadro';
import { calcularRelatorioEnvaseItems } from './calculos/relatorioEnvaseItems';
import { calcularCalendarDays } from './calculos/calendarDays';
import { calcularRelatorioLinhasGroups } from './calculos/relatorioLinhasGroups';
import { calcularFilteredLotes } from './calculos/filteredLotes';
import { calcularFilterCounts } from './calculos/filterCounts';
import { calcularBaseLotesFilaPesagem } from './calculos/baseLotesFilaPesagem';
import { calcularBaseLotesFilaProducao } from './calculos/baseLotesFilaProducao';
import { calcularBaseLotesParaEncaixe } from './calculos/baseLotesParaEncaixe';
import { calcularBaseLotesParaRotulagem } from './calculos/baseLotesParaRotulagem';
import { calcularSidebarItems } from './calculos/sidebarItems';
import { saveEtapaStatusAcao } from './acoes/saveEtapaStatus';
import { handleConfirmAdiarLoteAcao } from './acoes/handleConfirmAdiarLote';
import { handleCancelAdiarLoteAcao } from './acoes/handleCancelAdiarLote';
import { handleMoveLoteNextDayAcao } from './acoes/handleMoveLoteNextDay';
import { handleConfirmEncaixeModalAcao } from './acoes/handleConfirmEncaixeModal';
import { handleEncaixarLoteAcao } from './acoes/handleEncaixarLote';
import { handleAutoSortCampanhaAcao } from './acoes/handleAutoSortCampanha';
import { executeStatusUpdateAcao } from './acoes/executeStatusUpdate';
import { handleMoverLoteParaQuadroAcao } from './acoes/handleMoverLoteParaQuadro';
import { handleOcultarLoteDoQuadroAcao } from './acoes/handleOcultarLoteDoQuadro';
import { handleConfirmAddLoteAcao } from './acoes/handleConfirmAddLote';
import { renderQuadrosOcultosBadgesAcao } from './acoes/renderQuadrosOcultosBadges';
import { renderLoteProductsInfoAcao } from './acoes/renderLoteProductsInfo';
import { getLoteAdiadoInfoAcao } from './acoes/getLoteAdiadoInfo';
import { renderLoteEsperaBadgeAcao } from './acoes/renderLoteEsperaBadge';
import { renderLoteProblemaBannerAcao } from './acoes/renderLoteProblemaBanner';
import { handleApplyBatchStatusAcao } from './acoes/handleApplyBatchStatus';
import { handleAddApontamentoAcao } from './acoes/handleAddApontamento';
import { handleRemoveApontamentoAcao } from './acoes/handleRemoveApontamento';
import { handleEncaixarRotulagemAcao } from './acoes/handleEncaixarRotulagem';
import { handleDropPesagemAcao } from './acoes/handleDropPesagem';
import { handleDropProducaoAcao } from './acoes/handleDropProducao';

// Reexports: outros módulos importam estes nomes daqui.
export * from './lib/tipos';
export * from './lib/constantes';
export * from './lib/datas';
export * from './lib/lotes';
export * from './lib/ColumnFilterHeader';

export default function AcompanhamentoProducaoView({ onBack, mode = 'administrativo', initialTab }: AcompanhamentoProducaoProps) {
  const currentUser = getAuthUser();

  const [currentTab, setCurrentTab] = useState<TabType>(() => {
    if (initialTab) return initialTab;
    if (mode === 'planejamento') return 'planejamento_semanal';
    return 'lotes';
  });

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
  const [kitsColumnFilters, setKitsColumnFilters] = useState<Record<string, Set<string>>>({});

  // Busca Geral
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  const [kitOrdersSearch, setKitOrdersSearch] = useState('');

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
  const [producaoOrderOverrides, setProducaoOrderOverrides] = useEstadoServidor<string[]>('producao_order_overrides', 'natum_producao_order_overrides', [], { aoErro: m => showToast(m, 'error') });

  // Sequência de Ordenação Manual no Quadro de Pesagem
  const [pesagemOrderOverrides, setPesagemOrderOverrides] = useEstadoServidor<string[]>('pesagem_order_overrides', 'natum_pesagem_order_overrides', [], { aoErro: m => showToast(m, 'error') });

  // Inclusões Manuais em Liberados para Envase e Filas
  const [manualLiberadosEnvase, setManualLiberadosEnvase] = useEstadoServidor<Set<string>>('manual_liberados_envase', 'natum_manual_liberados_envase', new Set(), { paraJson: deSet, deJson: paraSet, aoErro: m => showToast(m, 'error') });

  const [manualFilasAdicionados, setManualFilasAdicionados] = useEstadoServidor<Record<'pesagem' | 'producao' | 'rotulagem', string[]>>('filas_manuais_adicionados', 'natum_filas_manuais_adicionados', { pesagem: [], producao: [], rotulagem: [] }, { aoErro: m => showToast(m, 'error') });

  // Modal para Adicionar Lote a qualquer fila
  const [addLoteModalTarget, setAddLoteModalTarget] = useState<'pesagem' | 'producao' | 'rotulagem' | 'envase' | null>(null);
  const [addLoteModalSearch, setAddLoteModalSearch] = useState<string>('');

  // Filtros do Quadro de Pesagem (busca da grade ativa vs busca independente da fila)
  const [pesagemSearch, setPesagemSearch] = useState<string>('');
  const [pesagemFilaSearch, setPesagemFilaSearch] = useState<string>('');
  const [pesagemStatusFilter, setPesagemStatusFilter] = useState<'TODOS' | 'AGUARDANDO' | 'EM_PESAGEM'>('TODOS');

  // Filtros e Sub-quadros do Quadro de Produção (busca de reatores ativos vs busca independente da fila)
  const [producaoSearch, setProducaoSearch] = useState<string>('');
  const [producaoFilaSearch, setProducaoFilaSearch] = useState<string>('');
  const [producaoCategoryFilter, setProducaoCategoryFilter] = useState<string>('TODOS');
  const [producaoSubTab, setProducaoSubTab] = useState<'reatores' | 'caldeira' | 'todos'>('reatores');
  const [caldeiraSearch, setCaldeiraSearch] = useState<string>('');

  // Quadro de Rotulagem (busca das esteiras ativas vs busca independente da fila)
  const [programacaoRotulagem, setProgramacaoRotulagem] = useState<ProgramacaoRotulagemItem[]>([]);
  const [loadingRotulagem, setLoadingRotulagem] = useState<boolean>(false);
  const [rotulagemSearch, setRotulagemSearch] = useState<string>('');
  const [rotulagemFilaSearch, setRotulagemFilaSearch] = useState<string>('');
  const [rotulagemStatusFilter, setRotulagemStatusFilter] = useState<'TODOS' | 'PROGRAMADO' | 'EM_ROTULAGEM' | 'CONCLUIDO'>('TODOS');

  // Modal / Localizador Facilitado de Datas dos Lotes
  const [showLocalizarDataModal, setShowLocalizarDataModal] = useState<boolean>(false);
  const [localizarDataSearch, setLocalizarDataSearch] = useState<string>('');

  // Estado de Drag & Drop para os quadros
  const [dragCardInfo, setDragCardInfo] = useState<{
    board: 'envase' | 'rotulagem' | 'pesagem' | 'producao';
    source: string;
    id?: number | string;
    loteNumber: string;
    productCode?: string;
    index?: number;
    linha?: 'Linha 1' | 'Linha 2' | 'Linha 3';
    tipo?: 'MAQUINA' | 'MANUAL';
  } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  // Filtros do Quadro de Ordens
  const [ordensSearch, setOrdensSearch] = useState<string>('');

  // Detalhes do Item Contextual por Quadro
  const [selectedLoteDetails, setSelectedLoteDetails] = useState<{
    lote: AcompanhamentoLote | ProgramacaoEnvaseItem | ProgramacaoRotulagemItem;
    etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase' | 'ordens';
  } | null>(null);

  // Modal de Espera do Envase
  const [envaseEsperaItem, setEnvaseEsperaItem] = useState<ProgramacaoEnvaseItem | null>(null);
  const [envaseEsperaMotivo, setEnvaseEsperaMotivo] = useState<string>('Falta de Embalagem / Frasco');
  const [envaseEsperaCustom, setEnvaseEsperaCustom] = useState<string>('');
  const [envaseEsperaParcialQtd, setEnvaseEsperaParcialQtd] = useState<number | null>(null);
  const [envaseEsperaMotivoRestante, setEnvaseEsperaMotivoRestante] = useState<string>('');

  // Histórico de Lotes Adiados
  const [lotesAdiadosHistorico, setLotesAdiadosHistorico] = useEstadoServidor<LoteAdiadoRegistro[]>('lotes_adiados_historico', 'natum_lotes_adiados_historico', [], { aoErro: m => showToast(m, 'error') });

  // Lotes concluídos em Pesagem e Produção para manter card visível com toggle verde/reversão
  const [pesagemConcluidosLotes, setPesagemConcluidosLotes] = useEstadoServidor<string[]>('pesagem_concluidos_lotes', 'natum_pesagem_concluidos_lotes', [], { aoErro: m => showToast(m, 'error') });

  const [producaoConcluidosLotes, setProducaoConcluidosLotes] = useEstadoServidor<string[]>('producao_concluidos_lotes', 'natum_producao_concluidos_lotes', [], { aoErro: m => showToast(m, 'error') });

  // Salva o status de uma etapa específica (Pesagem, Produção, Rotulagem ou Envase) de forma 100% isolada
  const saveEtapaStatus = useCallback(async (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase', status: string, motivoEspera?: string | null, insumoFaltanteCodigo?: string | null, insumoFaltanteDescricao?: string | null, updatedBy?: string, dataAgendada?: string | null) => saveEtapaStatusAcao({ currentUser, setLotes, showToast }, loteNumber, etapa, status, motivoEspera, insumoFaltanteCodigo, insumoFaltanteDescricao, updatedBy, dataAgendada), [currentUser]);

  // Filtros de Problemas / Falta para Pesagem e Produção

  // Quadro de Caldeira (Processamento Térmico em Produção)
  const [caldeiraAtiva, setCaldeiraAtiva] = useEstadoServidor<{ ligouEm: string; operador: string; lotes: string[] } | null>('caldeira_ativa', 'natum_caldeira_ativa', null, { aoErro: m => showToast(m, 'error') });
  const [caldeiraHistorico, setCaldeiraHistorico] = useEstadoServidor<CaldeiraRegistro[]>('caldeira_historico', 'natum_caldeira_historico', [], { aoErro: m => showToast(m, 'error') });
  const [lotesComCaldeira, setLotesComCaldeira] = useEstadoServidor<Set<string>>('lotes_com_caldeira', 'natum_lotes_com_caldeira', new Set(), { paraJson: deSet, deJson: paraSet, aoErro: m => showToast(m, 'error') });
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

  // Drawer Nova Solicitação (o formulário vive no painel de solicitações)
  const [novaSolicitacaoAberta, setNovaSolicitacaoAberta] = useState(false);

  const [previaAcao, setPreviaAcao] = useState<PreviaAcao | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Lotes trazidos pela busca remota (chave lote+produto -> lote e instante), mantidos entre refreshes
  const remoteLotesRef = useRef<Map<string, { lote: AcompanhamentoLote; at: number }>>(new Map());

  // Carregar lotes da API (sincronizando diretamente com a fonte única de verdade do servidor)
  const fetchLotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<AcompanhamentoLote[]>('/api/administrativo/acompanhamento-producao');
      const freshList = Array.isArray(data) ? data : [];
      // Lotes trazidos pela busca remota continuam visíveis por alguns minutos; sem isso somem no próximo refresh.
      const now = Date.now();
      const known = new Set(freshList.map(loteMergeKey));
      const kept: AcompanhamentoLote[] = [];
      for (const [k, v] of Array.from(remoteLotesRef.current.entries())) {
        if (now - v.at > REMOTE_LOTES_TTL_MS) remoteLotesRef.current.delete(k);
        else if (!known.has(k)) kept.push(v.lote);
      }
      setLotes(kept.length > 0 ? [...kept, ...freshList] : freshList);
    } catch (err) {
      console.error("Erro ao carregar lotes de acompanhamento:", err);
      showToast("Não foi possível carregar os lotes de produção.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Cache de buscas remotas para evitar requisições redundantes
  // chave da busca -> instante da última consulta; uma falha libera a chave, uma resposta vazia vale por 60 s
  const remoteLookupCache = useRef<Map<string, number>>(new Map());

  // Busca remota de fallback: caso o operador pesquise um lote não presente na memória inicial
  const performRemoteLookup = useCallback(async (query: string) => {
    const { clean, isNumeric } = normalizeLoteSearch(query);
    if (!clean || clean.length < 3) return;

    // Se já estiver em memória com correspondência exata, não precisa consultar o servidor
    const localExact = lotes.find(l => {
      const target = stripLotePrefix(l.loteNumber || '');
      const targetNoZero = target.replace(/^0+/, '');
      return target === clean || (isNumeric && targetNoZero === clean.replace(/^0+/, ''));
    });
    if (localExact) return;

    const cacheKey = clean.toLowerCase();
    const lastLookup = remoteLookupCache.current.get(cacheKey);
    if (lastLookup !== undefined && Date.now() - lastLookup < REMOTE_LOOKUP_TTL_MS) return;
    remoteLookupCache.current.set(cacheKey, Date.now());

    try {
      const data = await apiJson<AcompanhamentoLote[]>(`/api/administrativo/acompanhamento-producao?search=${encodeURIComponent(clean)}`);
      if (Array.isArray(data) && data.length > 0) {
        const at = Date.now();
        for (const item of data) remoteLotesRef.current.set(loteMergeKey(item), { lote: item, at });
        setLotes(prev => {
          const existingKeys = new Set(prev.map(loteMergeKey));
          let added = false;
          const next = [...prev];
          for (const item of data) {
            const k = loteMergeKey(item);
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
      remoteLookupCache.current.delete(cacheKey);
      console.warn('[RemoteLookup] Erro ao consultar lote no backend:', err);
    }
  }, [lotes]);

  // Monitorar inputs de busca para carregar do backend caso não esteja em memória
  useEffect(() => {
    const activeQuery = pesagemSearch.trim() || producaoSearch.trim() || encaixeSearch.trim() || rotulagemSearch.trim() || ordensSearch.trim() || addLoteModalSearch.trim();
    if (!activeQuery) return;
    const { clean } = normalizeLoteSearch(activeQuery);
    if (!clean || clean.length < 3) return;

    const timer = setTimeout(() => {
      performRemoteLookup(clean);
    }, 350);
    return () => clearTimeout(timer);
  }, [pesagemSearch, producaoSearch, encaixeSearch, rotulagemSearch, ordensSearch, addLoteModalSearch, performRemoteLookup]);

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

  const handleConfirmAdiarLote = async (targetDate: string) => handleConfirmAdiarLoteAcao({ adiarModalItem, currentUser, fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem, getCurrentBoardDate, programacaoEnvase, programacaoRotulagem, setAdiarModalItem, setLotes, setLotesAdiadosHistorico, setProgramacaoEnvase, setProgramacaoRotulagem, setSavingAdiarLote, showToast }, targetDate);

  // Cancelar / Desfazer Adiamento e retornar para a data original
  const handleCancelAdiarLote = async (loteNumber: string, targetDateToRestore?: string, etapa?: string, productCode?: string) => handleCancelAdiarLoteAcao({ adiarModalItem, currentUser, fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem, lotesAdiadosHistorico, programacaoEnvase, programacaoRotulagem, setAdiarModalItem, setLotes, setLotesAdiadosHistorico, setProgramacaoEnvase, setProgramacaoRotulagem, showToast }, loteNumber, targetDateToRestore, etapa, productCode);

  // Mover Lote / Adiar (compatibilidade direta se targetDateOverride for informado ou abertura do modal)
  const handleMoveLoteNextDay = async (lote: AcompanhamentoLote, targetDateOverride?: string) => handleMoveLoteNextDayAcao({ currentTab, currentUser, fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem, getCurrentBoardDate, handleOpenAdiarModalForLote, programacaoEnvase, programacaoRotulagem, setLotes, setLotesAdiadosHistorico, setProgramacaoEnvase, setProgramacaoRotulagem, showToast }, lote, targetDateOverride);

  useEffect(() => {
    fetchLotes();
    fetchKitOrders();
    fetchSolicitacoes();
    fetchProgramacaoRotulagem('TODOS');
  }, [fetchLotes, fetchKitOrders, fetchSolicitacoes, fetchProgramacaoRotulagem]);

  useEffect(() => {
    const handleRefresh = () => {
      setPesagemOrderOverrides([]);
      setProducaoOrderOverrides([]);
      fetchLotes();
    };
    window.addEventListener('natum:refresh-acompanhamento', handleRefresh);
    return () => window.removeEventListener('natum:refresh-acompanhamento', handleRefresh);
  }, [fetchLotes]);

  useEffect(() => {
    const refreshBoards = () => {
      if (document.visibilityState !== 'visible') return;
      fetchLotes();
      fetchProgramacaoEnvase('TODOS');
      fetchProgramacaoRotulagem('TODOS');
    };
    window.addEventListener('focus', refreshBoards);
    document.addEventListener('visibilitychange', refreshBoards);
    const timer = window.setInterval(refreshBoards, 60000);
    return () => {
      window.removeEventListener('focus', refreshBoards);
      document.removeEventListener('visibilitychange', refreshBoards);
      window.clearInterval(timer);
    };
  }, [fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem]);

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
  const handleConfirmEncaixeModal = async () => handleConfirmEncaixeModalAcao({ currentUser, encaixarModalLote, envaseSelectedDate, fetchProgramacaoEnvase, modalEncaixeCategoria, modalEncaixeCor, modalEncaixeCustomCor, modalEncaixeIsColorido, modalEncaixeLinha, modalEncaixeOrdem, programacaoEnvase, saveEtapaStatus, setEncaixarModalLote, setLotes, setSavingEncaixeModal, showToast });

  // Encaixar lote em produção no Quadro de Envase (Rápido)
  const handleEncaixarLote = async (lote: AcompanhamentoLote, linha: 'Linha 1' | 'Linha 2' | 'Linha 3', categoriaEnvase?: string, isColorido?: boolean, cor?: string, targetDateOverride?: string) => handleEncaixarLoteAcao({ currentUser, envaseSelectedDate, fetchProgramacaoEnvase, programacaoEnvase, saveEtapaStatus, setLotes, showToast }, lote, linha, categoriaEnvase, isColorido, cor, targetDateOverride);

  // Reordenar item na linha (Subir ou Descer)
  const handleReorderEnvase = async (id: number, linha: string, direction: 'up' | 'down') => {
    const lineItems = programacaoEnvase
      .filter(it => it.linha === linha && (envaseShowAllDates || !it.dataProgramada || parseLoteDateToIso(it.dataProgramada) === envaseSelectedDate))
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    const currentIndex = lineItems.findIndex(it => it.id === id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= lineItems.length) return;

    const temp = lineItems[currentIndex];
    lineItems[currentIndex] = lineItems[targetIndex];
    lineItems[targetIndex] = temp;

    lineItems.forEach((it, i) => {
      it.ordem = i + 1;
    });

    const payloadItems = lineItems.map(it => ({
      id: it.id,
      linha: it.linha,
      ordem: it.ordem,
    }));

    const lineIds = new Set(lineItems.map(it => it.id));
    setProgramacaoEnvase(prev => [
      ...prev.filter(it => !lineIds.has(it.id)),
      ...lineItems
    ]);

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

  const handleReorderEnvaseList = async (linha: 'Linha 1' | 'Linha 2' | 'Linha 3', fromIndex: number, toIndex: number) => {
    const lineItems = [...programacaoEnvase
      .filter(it => it.linha === linha && (envaseShowAllDates || !it.dataProgramada || parseLoteDateToIso(it.dataProgramada) === envaseSelectedDate))
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))];
    if (fromIndex < 0 || fromIndex >= lineItems.length || toIndex < 0 || toIndex >= lineItems.length || fromIndex === toIndex) return;
    const [moved] = lineItems.splice(fromIndex, 1);
    lineItems.splice(toIndex, 0, moved);
    lineItems.forEach((it, i) => {
      it.ordem = i + 1;
    });
    const lineIds = new Set(lineItems.map(it => it.id));
    setProgramacaoEnvase(prev => [
      ...prev.filter(it => !lineIds.has(it.id)),
      ...lineItems
    ]);
    const payloadItems = lineItems.map(it => ({
      id: it.id,
      linha: it.linha,
      ordem: it.ordem,
    }));
    try {
      await apiJson('/api/administrativo/envase/programacao/reorder', {
        method: 'POST',
        body: JSON.stringify({ items: payloadItems })
      });
      fetchProgramacaoEnvase(envaseSelectedDate);
    } catch (e: any) {
      console.error("Erro ao reordenar envase por drag:", e);
      fetchProgramacaoEnvase(envaseSelectedDate);
    }
  };

  const handleDropEnvaseColumn = async (e: React.DragEvent, targetLinha: 'Linha 1' | 'Linha 2' | 'Linha 3', targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;
    try {
      const data = JSON.parse(rawData);
      if (data.board !== 'envase') return;
      if (data.source === 'liberados') {
        const targetLote = lotes.find(l => 
          l.loteNumber === data.loteNumber && 
          (!data.productCode || !l.productCode || l.productCode === data.productCode)
        ) || baseLotesParaEncaixe.find(l => 
          l.loteNumber === data.loteNumber && 
          (!data.productCode || !l.productCode || l.productCode === data.productCode)
        );
        if (targetLote) {
          await handleEncaixarLote(targetLote, targetLinha);
        }
      } else if (data.source === 'linha') {
        if (data.linha !== targetLinha) {
          const item = programacaoEnvase.find(it => it.id === data.id);
          if (item) {
            await handleMoveLinha(item, targetLinha);
          }
        } else if (data.index !== undefined && targetIndex !== undefined && data.index !== targetIndex) {
          await handleReorderEnvaseList(targetLinha, data.index, targetIndex);
        }
      }
    } catch (err) {
      console.error('Erro no drop de envase:', err);
    } finally {
      setDragCardInfo(null);
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
        await apiJson('/api/administrativo/lote-status', {
          method: 'POST',
          body: JSON.stringify({
            loteNumber: envaseEsperaItem.loteNumber,
            quantidadeEnvasadaParcial: envaseEsperaParcialQtd,
            motivoEspera: motivoFinal,
            customStatus: 'Ordem Parcial',
          })
        });
        setLotes(prev => prev.map(l => (l.loteNumber || '').trim() === envaseEsperaItem.loteNumber.trim() ? {
          ...l,
          customStatus: 'Ordem Parcial',
          quantidadeEnvasadaParcial: envaseEsperaParcialQtd,
          motivoEspera: motivoFinal
        } : l));
      } catch (err: any) {
        console.error('Erro ao salvar o envase parcial no backend:', err);
        showToast(`Não foi possível registrar o envase parcial: ${err?.message || err}`, 'error');
        return;
      }
    }
    handleChangeStatusEnvase(envaseEsperaItem, 'EM_ESPERA', motivoFinal);
    setEnvaseEsperaItem(null);
  };

  // Handlers do Quadro de Caldeira
  const handleToggleCaldeiraLote = async (loteNumber: string) => {
    const isCurrentlyCaldeira = lotesComCaldeira.has(loteNumber) || lotes.some(l => l.loteNumber === loteNumber && l.category === 'Caldeira');
    const newIsCaldeira = !isCurrentlyCaldeira;

    setLotesComCaldeira(prev => {
      const next = new Set(prev);
      if (!newIsCaldeira) {
        next.delete(loteNumber);
      } else {
        next.add(loteNumber);
      }
      return next;
    });

    setLotes(prev => prev.map(l => l.loteNumber === loteNumber ? { ...l, category: newIsCaldeira ? 'Caldeira' : null } : l));

    // Só a marcação de caldeira muda: sem customStatus o servidor mantém o status do lote.
    try {
      await apiJson('/api/administrativo/lote-status', {
        method: 'POST',
        body: JSON.stringify({
          loteNumber,
          category: newIsCaldeira ? 'Caldeira' : null,
        })
      });
    } catch (e: any) {
      console.error('Erro ao atualizar Caldeira no backend:', e);
      showToast(`Não foi possível salvar a marcação de Caldeira: ${e?.message || e}`, 'error');
      return;
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
  const handleAutoSortCampanha = async (linha: string) => handleAutoSortCampanhaAcao({ envaseSelectedDate, fetchProgramacaoEnvase, programacaoEnvase, setProgramacaoEnvase, showToast }, linha);

  // Isolamento Estrito de Terceirizados (Códigos SKU e Números de Lote cadastrados em solicitações)
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
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(editTerceirizadoLote.loteNumber)}/terceirizado?confirmar=true`, {
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
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/terceirizado?confirmar=true`, {
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
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(num)}/terceirizado?confirmar=true`, {
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

  // Alteração de Status com verificação de "Em Espera"
  const handleStatusChange = async (loteNumber: string, newStatus: string) => {
    return await handleSelectStatusChange(loteNumber, newStatus);
  };

  const handleSelectStatusChange = async (loteNumber: string, newStatus: string) => {
    return await executeStatusUpdate(loteNumber, newStatus, null);
  };

  // Salvar alteração de status com motivo opcional
  const executeStatusUpdate = async (loteNumber: string, newStatus: string, motivoEspera: string | null, resetConfirmado = false, motivoReset = '') => executeStatusUpdateAcao({ currentUser, executeStatusUpdate, lotes, pesagemSelectedDate, setLotes, setPauseModalLote, setPesagemConcluidosLotes, setPreviaAcao, setProgramacaoEnvase, setProgramacaoRotulagem, setRecentlyUpdatedLotes, setSavingLote, showToast }, loteNumber, newStatus, motivoEspera, resetConfirmado, motivoReset);

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

  const handleMoverLoteParaQuadro = useCallback(async (loteNumber: string, targetStatus: string, targetQuadroNome: string, targetDateOverride?: string) => handleMoverLoteParaQuadroAcao({ currentTab, currentUser, envaseSelectedDate, executeStatusUpdate, fetchLotes, fetchProgramacaoEnvase, ordensSelectedDate, pesagemSelectedDate, producaoSelectedDate, rotulagemSelectedDate, setLotes, showToast }, loteNumber, targetStatus, targetQuadroNome, targetDateOverride), [fetchLotes, currentTab, fetchProgramacaoEnvase, producaoSelectedDate, pesagemSelectedDate, envaseSelectedDate, rotulagemSelectedDate, ordensSelectedDate, currentUser]);

  const handleOcultarLoteDoQuadro = useCallback(async (loteNumber: string, quadro: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => handleOcultarLoteDoQuadroAcao({ fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem, setLotes, setManualLiberadosEnvase, setProgramacaoEnvase, showToast }, loteNumber, quadro), [fetchLotes, fetchProgramacaoEnvase, fetchProgramacaoRotulagem]);

  // Remover agendamento do Quadro de Envase (remove da linha/data específica mantendo outros agendamentos e o lote ativo)
  const executarRemoverEnvase = useCallback(async (id: number, loteNumber: string, motivo: string) => {
    // 1. Atualização otimista local: se tem ID > 0, remove APENAS aquele item agendado!
    // Preserva se o mesmo lote tiver outro agendamento em outra linha ou data!
    setProgramacaoEnvase(prev => {
      if (id && id > 0) {
        return prev.filter(it => it.id !== id);
      }
      return prev.filter(it => it.loteNumber !== loteNumber);
    });

    try {
      if (id && id > 0) {
        await apiJson(`/api/administrativo/envase/programacao/${id}?motivo=${encodeURIComponent(motivo)}`, {
          method: 'DELETE',
        }).catch(() => {});
      } else if (loteNumber) {
        await apiJson(`/api/administrativo/envase/programacao/lote/${encodeURIComponent(loteNumber)}?motivo=${encodeURIComponent(motivo)}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
      showToast(`Agendamento do lote #${loteNumber} removido da linha de envase.`, 'success');
      await fetchProgramacaoEnvase('TODOS');
    } catch (e: any) {
      console.error("Erro ao remover item do quadro de envase:", e);
      showToast(`Erro ao remover item do envase: ${e?.message || e}`, 'error');
    }
  }, [fetchProgramacaoEnvase]);

  // Tirar da linha de envase apaga o agendamento: pede o motivo e a cópia fica na auditoria.
  const handleRemoveEnvase = useCallback((id: number, loteNumber: string) => {
    pedirMotivoExclusao({
      titulo: 'Tirar agendamento do envase',
      alvo: `Lote #${loteNumber}`,
      confirmarRotulo: 'OK, tirar do envase',
      executar: (motivo) => executarRemoverEnvase(id, loteNumber, motivo),
    });
  }, [executarRemoverEnvase]);

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
        return next;
      });
    } else {
      setManualFilasAdicionados(prev => {
        const currentList = prev[etapa] || [];
        const nextList = currentList.filter(n => n !== loteNumber);
        const next = { ...prev, [etapa]: nextList };
        return next;
      });
    }

    await handleOcultarLoteDoQuadro(loteNumber, etapa);
  }, [handleOcultarLoteDoQuadro]);

  const handleOpenAddLoteModal = useCallback((target: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => {
    setAddLoteModalTarget(target);
    setAddLoteModalSearch('');
  }, []);

  const handleConfirmAddLote = useCallback(async (lote: AcompanhamentoLote) => handleConfirmAddLoteAcao({ addLoteModalTarget, currentUser, envaseSelectedDate, executeStatusUpdate, fetchLotes, pesagemSelectedDate, producaoSelectedDate, rotulagemSelectedDate, saveEtapaStatus, setAddLoteModalTarget, setManualFilasAdicionados, setManualLiberadosEnvase, setPesagemConcluidosLotes, setProducaoConcluidosLotes, showToast }, lote), [addLoteModalTarget, currentUser, pesagemSelectedDate, producaoSelectedDate, rotulagemSelectedDate, envaseSelectedDate, saveEtapaStatus, executeStatusUpdate, fetchLotes]);

  const handleMoverParaCaldeira = useCallback(async (loteNumber: string) => {
    setLotesComCaldeira(prev => {
      const next = new Set(prev);
      next.add(loteNumber);
      return next;
    });
    setProducaoOrderOverrides(prev => {
      if (prev.includes(loteNumber)) return prev;
      const next = [...prev, loteNumber];
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
  const renderQuadrosOcultosBadges = (lote: AcompanhamentoLote) => renderQuadrosOcultosBadgesAcao({ handleRestaurarLoteNoQuadro }, lote);

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

  const renderLoteNumberBadge = (loteNum: string) => {
    if (!loteNum) return null;
    if (ehLotePlanejado(loteNum)) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[11px] md:text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 font-sans flex items-center gap-1 shadow-2xs" title="Ordem do Planejamento Semanal ainda sem lote do ERP">
          <span>Planejado</span>
        </span>
      );
    }
    return <span>{rotuloLote(loteNum)}</span>;
  };

  // Renderiza produtos do lote:
  // - No Envase e na Rotulagem: cada card representa SEU PRÓPRIO SKU/item, repetindo o lote com seu próprio produto
  // - Na Pesagem e na Produção: agrupa e consolida todos os produtos da batelada no mesmo card
  const renderLoteProductsInfo = (lote: AcompanhamentoLote | { loteNumber: string; productCode?: string; productDescription?: string; quantity?: number; quantityKg?: number }, options?: { isConsolidatedBatch?: boolean }) => renderLoteProductsInfoAcao({ currentTab, renderLoteNumberBadge }, lote, options);

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
  const getLoteAdiadoInfo = useCallback((loteNumber: string, targetDate: string, etapa?: string) => getLoteAdiadoInfoAcao({ lotesAdiadosHistorico, lotesByNumber }, loteNumber, targetDate, etapa), [lotesAdiadosHistorico, lotesByNumber]);

  // Renderiza banner destacado de lote em espera persistente (em qualquer etapa da fábrica)
  const renderLoteEsperaBadge = (lote: AcompanhamentoLote) => renderLoteEsperaBadgeAcao({ handleOpenPauseModal, handleResumeLote, programacaoEnvase, programacaoRotulagem }, lote);

  // Renderiza banner destacado de problema / insumo faltante no card de qualquer fila (isolado por etapa)
  const renderLoteProblemaBanner = (lote: AcompanhamentoLote, etapa?: 'pesagem' | 'producao' | 'rotulagem' | 'envase') => renderLoteProblemaBannerAcao({ handleOpenPauseModal, handleResumeLote, hasLoteProblemaOuPausa }, lote, etapa);

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

  const handleApplyBatchStatus = async (statusValue: string, motivoOverride?: string | null, resetConfirmado = false, motivoReset = '') => handleApplyBatchStatusAcao({ batchCustomMotivo, batchEsperaMotivo, currentUser, fetchLotes, handleApplyBatchStatus, selectedLotes, setBatchStatusValue, setIsBatchUpdating, setPreviaAcao, setSelectedLotes, setShowBatchEsperaModal, showToast }, statusValue, motivoOverride, resetConfirmado, motivoReset);

  // Alternar flag de Terceirizado
  const handleToggleTerceirizado = async (loteNumber: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setLotes(prev => prev.map(l => l.loteNumber === loteNumber ? { ...l, isTerceirizado: newValue } : l));
    try {
      await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/terceirizado?confirmar=true`, {
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

  const [tirarEsperaLote, setTirarEsperaLote] = useState<string | null>(null);

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

  const handleAddApontamento = async () => handleAddApontamentoAcao({ currentUser, novoApontamento, parcialModalLote, setLotes, setNovoApontamento, setParcialModalLote, setSavingParcial, showToast });

  const handleRemoveApontamento = async (apId: string) => handleRemoveApontamentoAcao({ parcialModalLote, setLotes, setParcialModalLote, setSavingParcial, showToast }, apId);

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
  const filterCounts = useMemo(() => calcularFilterCounts({ currentTab, isLoteTerceirizado, lotes }), [lotes, currentTab, isLoteTerceirizado]);

  // Contagens para o Quadro de Pesagem (Unificado por Batelada)
  const totalPesagemAberto = useMemo(() => {
    return consolidateLotesForBatch(lotes.filter(l => {
      if (isLoteTerceirizado(l)) return false;
      if (isLoteConcluido(l)) return false;
      if (isLoteOcultoNoQuadro(l, 'pesagem')) return false;
      const etapaStatus = getLoteEtapaStatus(l, 'pesagem');
      if (etapaStatus.isConcluido) return false;
      const eff = getEffectiveStatus(l);
      return eff === 'Pesagem' || (!l.customStatus && l.erpStatus === 'PG') || Boolean(l.details?.includes('Planejamento Semanal'));
    })).length;
  }, [lotes, isLoteTerceirizado]);

  // Contagens para o Quadro de Produção (Manipulação - Unificado por Batelada)
  const totalProducaoAberto = useMemo(() => {
    return consolidateLotesForBatch(lotes.filter(l => {
      if (isLoteTerceirizado(l)) return false;
      if (isLoteConcluido(l)) return false;
      if (isLoteOcultoNoQuadro(l, 'producao')) return false;
      const etapaStatus = getLoteEtapaStatus(l, 'producao');
      if (etapaStatus.isConcluido) return false;
      const eff = getEffectiveStatus(l);
      return eff === 'Produção' || l.customStatus === 'Produção' || (!l.customStatus && l.erpStatus === 'PR') || isLoteParcial(l) || Boolean(l.details?.includes('Planejamento Semanal'));
    })).length;
  }, [lotes, isLoteTerceirizado]);

  // Contagens para o Quadro de Envase (Liberados e Prontos para Encaixar + Em Linha)
  const totalEnvaseDisponivel = useMemo(() => {
    return programacaoEnvase.filter(it => {
      if (it.statusEnvase === 'CONCLUIDO') return false;
      if (isPastEndOfDay(it.dataProgramada) && it.statusEnvase !== 'EM_ESPERA') return false;
      const realLote = lotes.find(l => (l.loteNumber || '').trim().toUpperCase() === (it.loteNumber || '').trim().toUpperCase());
      if (realLote && (isLoteConcluido(realLote) || isLoteOcultoNoQuadro(realLote, 'envase'))) return false;
      return true;
    }).length;
  }, [lotes, programacaoEnvase]);

  // Contagens para o Quadro de Rotulagem (Itens ativos na programação de rotulagem)
  const totalRotulagemDisponivel = useMemo(() => {
    return programacaoRotulagem.filter(it => {
      if (it.statusRotulagem === 'CONCLUIDO') return false;
      if (isPastEndOfDay(it.dataProgramada) && it.statusRotulagem !== 'EM_ESPERA') return false;
      const realLote = lotes.find(l => (l.loteNumber || '').trim().toUpperCase() === (it.loteNumber || '').trim().toUpperCase());
      if (realLote && (isLoteConcluido(realLote) || isLoteOcultoNoQuadro(realLote, 'rotulagem'))) return false;
      return true;
    }).length;
  }, [lotes, programacaoRotulagem]);

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
  const sidebarItems: SidebarItem[] = useMemo(() => calcularSidebarItems({ filterCounts, mode, totalKitsAberto, totalTerceirizadosAberto }), [mode, filterCounts.aberto, totalPesagemAberto, totalProducaoAberto, totalRotulagemDisponivel, totalEnvaseDisponivel, totalOrdensFinalizadasNaoLancadas, totalTerceirizadosAberto, totalKitsAberto]);

  // Celular: mantém a aba ativa visível na tira horizontal de abas do AppLayout
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const ativa = document.querySelector('div.md\\:hidden.touch-pan-x > button.bg-zinc-900');
      ativa?.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [currentTab]);

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
  const filteredLotes = useMemo(() => calcularFilteredLotes({ baseTabLotes, deferredSearch, getLoteColumnValue, lotesColumnFilters, selectedInsumoFaltanteFilter }), [baseTabLotes, deferredSearch, lotesColumnFilters, selectedInsumoFaltanteFilter, getLoteColumnValue]);

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

  // Exportar Excel (.xlsx) completo com 3 abas: Lotes, Terceirizados, Kits
  const handleExportExcel = () => exportarExcelGeral({ isLoteTerceirizado, kitOrders, lotes, showToast, solicitacoes });

  // Helpers de Estilização de Badges (Padrão HSL Zinc + 3 Famílias Semânticas)
  const getBadgeClass = (status: string | null | undefined) => {
    switch (status) {
      case 'Liberado para Envase':
      case 'Ordem Finalizada':
      case 'Finalizada':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold';
      case 'Em Espera':
      case 'Ordem Parcial':
        return 'bg-amber-50 text-amber-700 border-amber-200 font-semibold';
      case 'Pesagem':
      case 'Produzido':
      case 'Produção':
      case 'Rotulagem':
      case 'Envase':
        return 'bg-zinc-100 text-zinc-800 border-zinc-300 font-semibold';
      default:
        return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    }
  };

  const getErpBadgeClass = (erpCode: string) => {
    if (erpCode === 'EA') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold';
    }
    switch (erpCode) {
      case 'PG':
      case 'PR':
      case 'CF':
        return 'bg-zinc-100 text-zinc-800 border-zinc-300 font-semibold';
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
  const calendarDays = useMemo(() => calcularCalendarDays({ currentMonth, currentYear, lotesByDate, today }), [currentYear, currentMonth, lotesByDate, today]);

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

  const renderUnifiedQuadroHeader = (args: UnifiedQuadroHeaderProps) => renderCabecalhoQuadro({ setLocalizarDataSearch, setShowLocalizarDataModal }, args);

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
      // Exclui ordens em espera dos quadros operacionais diários de execução
      if (it.statusEnvase === 'EM_ESPERA') return false;
      if (realLote) {
        const esp = getLoteEsperaDetails(realLote, programacaoEnvase, programacaoRotulagem);
        if (esp.isEmEspera || realLote.customStatus === 'Em Espera' || Boolean(realLote.motivoEspera) || realLote.erpStatus === 'ES') return false;
      }
      return true;
    });

    const dateFiltered = (envaseShowAllDates || envaseSearch.trim().length > 0)
      ? activeProgramacao
      : activeProgramacao.filter(it => {
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

  const baseLotesParaEncaixe = useMemo(() => calcularBaseLotesParaEncaixe({ encaixeSearch, encaixeStatusFilter, envaseScopeFilter, lotes, manualLiberadosEnvase, programacaoEnvase, programacaoRotulagem }), [lotes, encaixeSearch, programacaoEnvase, programacaoRotulagem, envaseScopeFilter, encaixeStatusFilter, manualLiberadosEnvase]);

  const lotesParaEncaixe = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(baseLotesParaEncaixe, encaixeSearch));
  }, [baseLotesParaEncaixe, encaixeSearch]);

  const filteredEnvaseLinha1Items = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(envaseLinha1Items, envaseSearch));
  }, [envaseLinha1Items, envaseSearch]);

  const filteredEnvaseLinha2Items = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(envaseLinha2Items, envaseSearch));
  }, [envaseLinha2Items, envaseSearch]);

  const filteredEnvaseLinha3Items = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(envaseLinha3Items, envaseSearch));
  }, [envaseLinha3Items, envaseSearch]);

  // =========================================================================
  // PROCESSAMENTO DO RELATÓRIO DE ENVASE (FILTRAGEM, TOTAIS E EXPORTAÇÃO)
  // =========================================================================
  const relatorioEnvaseItems = useMemo(() => calcularRelatorioEnvaseItems({ baseLotesParaEncaixe, getRealLote, programacaoEnvase, relatorioDataFim, relatorioDataInicio, relatorioIncluirLiberados, relatorioLinhaFilter, relatorioSearch, relatorioStatusFilter }), [programacaoEnvase, baseLotesParaEncaixe, relatorioDataInicio, relatorioDataFim, relatorioLinhaFilter, relatorioStatusFilter, relatorioSearch, relatorioIncluirLiberados, lotesByNumber, lotesByNumberAndProduct]);

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
  const relatorioLinhasGroups = useMemo(() => calcularRelatorioLinhasGroups({ relatorioEnvaseItems, relatorioLinhaFilter }), [relatorioEnvaseItems, relatorioLinhaFilter]);

  const handleExportRelatorioEnvaseExcel = () => exportarRelatorioEnvaseExcel({ relatorioConsolidadoPorProduto, relatorioDataFim, relatorioDataInicio, relatorioEnvaseItems, relatorioTotals, showToast });

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
        const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
        // Não inclui lotes em espera na pesagem (isolado ou global)
        if (etapaStatus.isEspera || esperaDetails.isEmEspera || l.customStatus === 'Em Espera' || Boolean(l.motivoEspera) || l.erpStatus === 'ES') return false;

        const isPlanned = Boolean(l.details?.includes('Planejamento Semanal'));
        // Lotes ativamente na balança ou concluídos nesta data
        const isPesando = (
          etapaStatus.status === 'ativo' ||
          etapaStatus.isConcluido ||
          l.customStatus === 'Pesagem' ||
          pesagemOrderOverrides.includes(l.loteNumber) ||
          pesagemConcluidosLotes.includes(l.loteNumber) ||
          isPlanned
        ) && etapaStatus.status !== 'fila' && (etapaStatus.status !== 'pendente' || isPlanned || l.customStatus === 'Pesagem') && l.customStatus !== 'Fila Pesagem';
        if (!isPesando) return false;
        if (selectedInsumoFaltanteFilter !== 'TODOS') {
          if ((l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) !== selectedInsumoFaltanteFilter) return false;
        }
        if (!pesagemShowAllDates && !pesagemSearch.trim()) {
          const scheduleDate = getLoteScheduleDateIso(l, 'pesagem');
          const adiadoInfo = getLoteAdiadoInfo(l.loteNumber, pesagemSelectedDate, 'pesagem');
          const isAdiadoDestaData = Boolean(adiadoInfo && !adiadoInfo.isDestino);
          if (scheduleDate !== pesagemSelectedDate && !isAdiadoDestaData) return false;
        }
        return true;
      });
    return consolidateLotesForBatch(deduplicateLotesByNumber(raw));
  }, [lotes, isLoteTerceirizado, selectedInsumoFaltanteFilter, pesagemOrderOverrides, pesagemConcluidosLotes, pesagemShowAllDates, pesagemSelectedDate, pesagemSearch, getLoteAdiadoInfo]);

  // Lotes ordenados sequencialmente para o Quadro de Pesagem Ativa
  const sortedLotesPesando = useMemo(() => {
    const list = [...lotesPesando];
    if (pesagemOrderOverrides.length === 0) {
      return list.sort((a, b) => {
        const ordA = getLotePlanningOrdem(a);
        const ordB = getLotePlanningOrdem(b);
        if (ordA !== ordB) return ordA - ordB;
        return a.loteNumber.localeCompare(b.loteNumber);
      });
    }
    return list.sort((a, b) => {
      const idxA = pesagemOrderOverrides.indexOf(a.loteNumber);
      const idxB = pesagemOrderOverrides.indexOf(b.loteNumber);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      const ordA = getLotePlanningOrdem(a);
      const ordB = getLotePlanningOrdem(b);
      if (ordA !== ordB) return ordA - ordB;
      return a.loteNumber.localeCompare(b.loteNumber);
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
  };

  // Lotes aguardando início de pesagem + lotes em espera (Fila Unificada de Pesagem)
  // Lotes em espera / ordens paradas (Fila de Pesagem limpa)
  const baseLotesFilaPesagem = useMemo(() => calcularBaseLotesFilaPesagem({ isLoteTerceirizado, lotes, manualFilasAdicionados, pesagemConcluidosLotes, programacaoEnvase, programacaoRotulagem, selectedInsumoFaltanteFilter, sortedLotesPesando }), [lotes, isLoteTerceirizado, selectedInsumoFaltanteFilter, sortedLotesPesando, manualFilasAdicionados, programacaoEnvase, programacaoRotulagem]);

  const lotesFilaPesagem = useMemo(() => {
    let list = filterLotesBySearch(baseLotesFilaPesagem, pesagemFilaSearch);
    if (!pesagemFilaSearch.trim() && pesagemFilaFilter === 'ESPERA') {
      list = list.filter(l => getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem).isEmEspera);
    }
    return consolidateLotesForBatch(deduplicateLotesByNumber(list));
  }, [baseLotesFilaPesagem, pesagemFilaSearch, pesagemFilaFilter, programacaoEnvase, programacaoRotulagem]);

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
        const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
        // Não inclui se estiver em espera na produção ou globalmente
        if (etapaStatus.isEspera || esperaDetails.isEmEspera || l.customStatus === 'Em Espera' || Boolean(l.motivoEspera) || l.erpStatus === 'ES') return false;

        // Permite coexistência: se estiver em produção ou alocado nos reatores, ou concluído na data
        // ou aprovado / lote vinculado do planejamento semanal na data selecionada
        const isPlanned = Boolean(l.details?.includes('Planejamento Semanal'));
        const isProd = (
          etapaStatus.status === 'ativo' ||
          etapaStatus.isConcluido ||
          isPlanned ||
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
          const adiadoInfo = getLoteAdiadoInfo(l.loteNumber, producaoSelectedDate, 'producao');
          const isAdiadoDestaData = Boolean(adiadoInfo && !adiadoInfo.isDestino);
          if (scheduleDate !== producaoSelectedDate && !isAdiadoDestaData) return false;
        }
        return true;
      });
    return consolidateLotesForBatch(deduplicateLotesByNumber(raw));
  }, [lotes, isLoteTerceirizado, selectedInsumoFaltanteFilter, producaoOrderOverrides, producaoConcluidosLotes, producaoShowAllDates, producaoSelectedDate, producaoSearch, getLoteAdiadoInfo]);

  // Lotes ordenados sequencialmente para o Quadro de Produção
  const sortedLotesEmFabricacao = useMemo(() => {
    const list = [...lotesProducao];
    if (producaoOrderOverrides.length === 0) {
      return list.sort((a, b) => {
        const ordA = getLotePlanningOrdem(a);
        const ordB = getLotePlanningOrdem(b);
        if (ordA !== ordB) return ordA - ordB;
        return a.loteNumber.localeCompare(b.loteNumber);
      });
    }
    return list.sort((a, b) => {
      const idxA = producaoOrderOverrides.indexOf(a.loteNumber);
      const idxB = producaoOrderOverrides.indexOf(b.loteNumber);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      const ordA = getLotePlanningOrdem(a);
      const ordB = getLotePlanningOrdem(b);
      if (ordA !== ordB) return ordA - ordB;
      return a.loteNumber.localeCompare(b.loteNumber);
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
  };

  // Lotes aguardando produção + lotes em espera (Fila Unificada de Produção)
  const baseLotesFilaProducao = useMemo(() => calcularBaseLotesFilaProducao({ isLoteTerceirizado, lotes, lotesProducao, manualFilasAdicionados, programacaoEnvase, programacaoRotulagem, selectedInsumoFaltanteFilter }), [lotes, isLoteTerceirizado, selectedInsumoFaltanteFilter, lotesProducao, manualFilasAdicionados, programacaoEnvase, programacaoRotulagem]);

  const lotesFilaProducao = useMemo(() => {
    let list = filterLotesBySearch(baseLotesFilaProducao, producaoFilaSearch);
    if (!producaoFilaSearch.trim() && producaoFilaFilter === 'ESPERA') {
      list = list.filter(l => getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem).isEmEspera);
    }
    return consolidateLotesForBatch(deduplicateLotesByNumber(list));
  }, [baseLotesFilaProducao, producaoFilaSearch, producaoFilaFilter, programacaoEnvase, programacaoRotulagem]);

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
    return filterLotesBySearch(sortedLotesPesando, pesagemSearch);
  }, [sortedLotesPesando, pesagemSearch]);

  const filteredLotesEsperaPesagem = useMemo(() => {
    return filterLotesBySearch(lotesEsperaPesagem, pesagemSearch);
  }, [lotesEsperaPesagem, pesagemSearch]);

  const filteredLotesReatoresNormais = useMemo(() => {
    return filterLotesBySearch(lotesReatoresNormais, producaoSearch);
  }, [lotesReatoresNormais, producaoSearch]);

  const filteredLotesCaldeira = useMemo(() => {
    const q = producaoSearch.trim() || caldeiraSearch.trim();
    return filterLotesBySearch(lotesCaldeira, q);
  }, [lotesCaldeira, producaoSearch, caldeiraSearch]);

  // Quadros ativos de esteiras de rotulagem
  const rotulagemMaquinaItems = useMemo(() => {
    const base = programacaoRotulagem
      .filter(it => it.tipo === 'MAQUINA')
      .filter(it => {
        const realLote = getRealLote(it.loteNumber, it.productCode);
        // REGRA GERAL: Ordem concluída ou removida da rotulagem não aparece
        if (realLote && (isLoteConcluido(realLote) || isLoteOcultoNoQuadro(realLote, 'rotulagem'))) return false;
        // Exclui ordens em espera dos quadros operacionais diários
        if (it.statusRotulagem === 'EM_ESPERA') return false;
        if (realLote) {
          const esp = getLoteEsperaDetails(realLote, programacaoEnvase, programacaoRotulagem);
          if (esp.isEmEspera || realLote.customStatus === 'Em Espera' || Boolean(realLote.motivoEspera) || realLote.erpStatus === 'ES') return false;
        }
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
        // Exclui ordens em espera dos quadros operacionais diários
        if (it.statusRotulagem === 'EM_ESPERA') return false;
        if (realLote) {
          const esp = getLoteEsperaDetails(realLote, programacaoEnvase, programacaoRotulagem);
          if (esp.isEmEspera || realLote.customStatus === 'Em Espera' || Boolean(realLote.motivoEspera) || realLote.erpStatus === 'ES') return false;
        }
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

  // Fila lateral de escolha para rotulagem: Lotes Disponíveis para Rotulagem (busca independente)
  const baseLotesParaRotulagem = useMemo(() => calcularBaseLotesParaRotulagem({ lotes, manualFilasAdicionados, programacaoEnvase, programacaoRotulagem, rotulagemFilaSearch, rotulagemScopeFilter, rotulagemSelectedDate }), [lotes, rotulagemFilaSearch, programacaoRotulagem, manualFilasAdicionados, rotulagemScopeFilter, rotulagemSelectedDate, programacaoEnvase]);

  const lotesParaRotulagem = useMemo(() => {
    return deduplicateLotesByNumber(filterLotesBySearch(baseLotesParaRotulagem, rotulagemFilaSearch));
  }, [baseLotesParaRotulagem, rotulagemFilaSearch]);

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

  const handleEncaixarRotulagem = async (lote: AcompanhamentoLote, tipo: 'MAQUINA' | 'MANUAL') => handleEncaixarRotulagemAcao({ currentUser, fetchProgramacaoRotulagem, programacaoRotulagem, rotulagemSelectedDate, saveEtapaStatus, setLotes, setProgramacaoRotulagem, showToast }, lote, tipo);

  const handleReorderRotulagem = async (id: number | string, tipo: 'MAQUINA' | 'MANUAL', direction: 'up' | 'down') => {
    const targetDate = rotulagemSelectedDate || new Date().toISOString().split('T')[0];
    const list = programacaoRotulagem
      .filter(it => it.tipo === tipo && (rotulagemShowAllDates || !it.dataProgramada || parseLoteDateToIso(it.dataProgramada) === targetDate))
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const idx = list.findIndex(it => it.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;

    list.forEach((item, index) => {
      item.ordem = index + 1;
    });

    const listIds = new Set(list.map(it => it.id));
    const others = programacaoRotulagem.filter(it => !listIds.has(it.id));
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
      fetchProgramacaoRotulagem('TODOS');
    } catch (e: any) {
      console.error("Erro ao reordenar rotulagem:", e);
      showToast("Erro ao reordenar: " + (e?.message || e), "error");
      fetchProgramacaoRotulagem('TODOS');
    }
  };

  const handleMoveRotulagemTipo = async (item: ProgramacaoRotulagemItem, targetTipo: 'MAQUINA' | 'MANUAL') => {
    if (item.tipo === targetTipo) return;
    try {
      await apiJson('/api/administrativo/rotulagem/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: item.id,
          dataProgramada: item.dataProgramada,
          tipo: targetTipo,
          ordem: item.ordem,
          loteNumber: item.loteNumber,
          productCode: item.productCode,
          productDescription: item.productDescription,
          quantity: item.quantity,
          quantityKg: item.quantityKg,
          statusRotulagem: item.statusRotulagem,
          observacoes: item.observacoes,
          createdBy: item.createdBy,
        })
      });
      showToast(`Lote #${item.loteNumber} transferido para Rotulagem ${targetTipo === 'MAQUINA' ? 'Máquina' : 'Manual'}!`);
      fetchProgramacaoRotulagem('TODOS');
    } catch (e: any) {
      console.error("Erro ao transferir rotulagem:", e);
      showToast("Falha ao transferir rotulagem: " + (e?.message || e), "error");
    }
  };

  const handleReorderRotulagemList = async (tipo: 'MAQUINA' | 'MANUAL', fromIndex: number, toIndex: number) => {
    const targetDate = rotulagemSelectedDate || new Date().toISOString().split('T')[0];
    const list = [...programacaoRotulagem
      .filter(it => it.tipo === tipo && (rotulagemShowAllDates || !it.dataProgramada || parseLoteDateToIso(it.dataProgramada) === targetDate))
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))];
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length || fromIndex === toIndex) return;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    list.forEach((it, i) => {
      it.ordem = i + 1;
    });
    const listIds = new Set(list.map(it => it.id));
    const others = programacaoRotulagem.filter(it => !listIds.has(it.id));
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
      fetchProgramacaoRotulagem('TODOS');
    } catch (e: any) {
      console.error("Erro ao reordenar rotulagem:", e);
      fetchProgramacaoRotulagem('TODOS');
    }
  };

  const handleDropRotulagem = async (e: React.DragEvent, targetTipo: 'MAQUINA' | 'MANUAL', targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;
    try {
      const data = JSON.parse(rawData);
      if (data.board !== 'rotulagem') return;
      if (data.source === 'disponiveis') {
        const targetLote = lotes.find(l => 
          l.loteNumber === data.loteNumber && 
          (!data.productCode || !l.productCode || l.productCode === data.productCode)
        ) || baseLotesParaRotulagem.find(l => 
          l.loteNumber === data.loteNumber && 
          (!data.productCode || !l.productCode || l.productCode === data.productCode)
        );
        if (targetLote) {
          await handleEncaixarRotulagem(targetLote, targetTipo);
        }
      } else if (data.source === 'coluna') {
        if (data.tipo !== targetTipo) {
          const item = programacaoRotulagem.find(it => it.id === data.id);
          if (item) {
            await handleMoveRotulagemTipo(item, targetTipo);
          }
        } else if (data.index !== undefined && targetIndex !== undefined && data.index !== targetIndex) {
          await handleReorderRotulagemList(targetTipo, data.index, targetIndex);
        }
      }
    } catch (err) {
      console.error('Erro no drop de rotulagem:', err);
    } finally {
      setDragCardInfo(null);
    }
  };

  const handleDropPesagem = async (e: React.DragEvent, targetLocation: 'ativa' | 'fila', targetIndex?: number) => handleDropPesagemAcao({ currentUser, fetchLotes, pesagemSelectedDate, saveEtapaStatus, setDragCardInfo, setDragOverTarget, setPesagemConcluidosLotes, setPesagemOrderOverrides, showToast, sortedLotesPesando }, e, targetLocation, targetIndex);

  const handleDropProducao = async (e: React.DragEvent, targetLocation: 'ativa' | 'fila' | 'caldeira', targetIndex?: number) => handleDropProducaoAcao({ currentUser, filteredLotesReatoresNormais, handleToggleCaldeiraLote, lotesComCaldeira, saveEtapaStatus, setDragCardInfo, setDragOverTarget, setProducaoOrderOverrides, showToast }, e, targetLocation, targetIndex);

  // Tirar da rotulagem apaga o agendamento: pede o motivo e a cópia fica na auditoria.
  const handleRemoveRotulagem = (id: number | string) => {
    const item = programacaoRotulagem.find(it => it.id === id);
    pedirMotivoExclusao({
      titulo: 'Tirar agendamento da rotulagem',
      alvo: `Lote #${item?.loteNumber ?? id}`,
      confirmarRotulo: 'OK, tirar da rotulagem',
      executar: (motivo) => executarRemoverRotulagem(id, motivo),
    });
  };

  const executarRemoverRotulagem = async (id: number | string, motivo: string) => {
    const item = programacaoRotulagem.find(it => it.id === id);
    setProgramacaoRotulagem(prev => prev.filter(it => it.id !== id));
    try {
      if (typeof id === 'number' && id > 0) {
        await apiJson(`/api/administrativo/rotulagem/programacao/${id}?motivo=${encodeURIComponent(motivo)}`, {
          method: 'DELETE',
        });
      } else if (item?.loteNumber) {
        await apiJson(`/api/administrativo/rotulagem/programacao/lote/${encodeURIComponent(item.loteNumber)}?motivo=${encodeURIComponent(motivo)}`, {
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
    return found ? found.icon : '';
  };

  const getCorBadgeClass = (corName?: string | null, isColorido?: boolean) => {
    if (!isColorido || !corName || corName === 'Branco') {
      return 'bg-zinc-100 text-zinc-700 border-zinc-300';
    }
    const found = CORES_PREDEFINIDAS.find(c => c.id === corName);
    return found ? found.badgeClass : 'bg-zinc-50 text-zinc-700 border-zinc-200';
  };

  const getCorDotClass = (corName?: string | null, isColorido?: boolean) => {
    if (!isColorido || !corName || corName === 'Branco') {
      return 'bg-zinc-200 border border-zinc-400';
    }
    const found = CORES_PREDEFINIDAS.find(c => c.id === corName);
    return found ? found.dotClass : 'bg-zinc-700';
  };

  return (
    <AppLayout
      moduleTitle={mode === 'planejamento' ? "Planejamento de Produção" : "Acompanhamento de Produção"}
      onBackToHub={onBack || (() => {})}
      sidebarItems={sidebarItems}
      activeTab={currentTab}
      onTabChange={(id) => setCurrentTab(id as TabType)}

    >
      {previaAcao && <PreviaAcaoDrawer previa={previaAcao} onClose={() => setPreviaAcao(null)} />}
      {mode !== 'planejamento' && <AvisoProdutosSemPeso className="mb-2" />}
      {/* Toast flutuante de confirmação */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold backdrop-blur-md",
              toastMessage.type === 'success'
                ? 'bg-zinc-900 text-white border-zinc-800'
                : 'bg-red-950 text-red-100 border-red-800'
            )}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-400" />
            )}
            {toastMessage.text}
          </div>
        </div>
      )}

      {tirarEsperaLote && (
        <TirarEsperaDrawer
          lote={tirarEsperaLote}
          onClose={() => setTirarEsperaLote(null)}
          onDone={() => {
            setTirarEsperaLote(null);
            fetchLotes();
            window.dispatchEvent(new Event('natum:refresh-acompanhamento'));
          }}
        />
      )}

      {/* VIEW: PLANEJAMENTO SEMANAL (PCP) */}
      {currentTab === 'planejamento_semanal' && (
        <div className="space-y-4">
          <PlanejamentoSemanalTab
            active={true}
            onScheduleChanged={() => {
              fetchLotes();
            }}
          />
        </div>
      )}

      {/* VIEW 1 & VIEW 2: STATUS DE LOTES (INTERNOS) E TERCEIRIZADOS */}
      {(currentTab === 'lotes' || currentTab === 'terceirizados') && <LotesTerceirizadosTab
        baseTabLotes={baseTabLotes}
        batchStatusValue={batchStatusValue}
        currentPage={currentPage}
        currentTab={currentTab}
        editingPrevisaoLote={editingPrevisaoLote}
        fetchKitOrders={fetchKitOrders}
        fetchLotes={fetchLotes}
        fetchSolicitacoes={fetchSolicitacoes}
        getBadgeClass={getBadgeClass}
        getErpBadgeClass={getErpBadgeClass}
        handleApplyBatchStatus={handleApplyBatchStatus}
        handleBatchMoveToTerceirizados={handleBatchMoveToTerceirizados}
        handleClearAllLotesFilters={handleClearAllLotesFilters}
        handleLotesColumnFilterChange={handleLotesColumnFilterChange}
        handleMoveLoteNextDay={handleMoveLoteNextDay}
        handleOpenEditTerceirizado={handleOpenEditTerceirizado}
        handleOpenEditTimestamps={handleOpenEditTimestamps}
        handleOpenHistory={handleOpenHistory}
        handleOpenPauseModal={handleOpenPauseModal}
        handleResumeLote={handleResumeLote}
        handleSavePrevisao={handleSavePrevisao}
        handleSelectStatusChange={handleSelectStatusChange}
        handleSort={handleSort}
        insumosFaltantesList={insumosFaltantesList}
        isBatchUpdating={isBatchUpdating}
        loading={loading}
        loadingKits={loadingKits}
        loadingSolicitacoes={loadingSolicitacoes}
        lotes={lotes}
        lotesCaldeira={lotesCaldeira}
        lotesColumnFilters={lotesColumnFilters}
        lotesColumnOptions={lotesColumnOptions}
        lotesPesando={lotesPesando}
        multiProductLoteNumbers={multiProductLoteNumbers}
        novaSolicitacaoAberta={novaSolicitacaoAberta}
        pageSize={pageSize}
        paginatedLotes={paginatedLotes}
        pesagemOrderOverrides={pesagemOrderOverrides}
        producaoOrderOverrides={producaoOrderOverrides}
        programacaoEnvase={programacaoEnvase}
        programacaoRotulagem={programacaoRotulagem}
        recentlyUpdatedLotes={recentlyUpdatedLotes}
        renderFiscoQuimicaBadge={renderFiscoQuimicaBadge}
        renderLoteNumberBadge={renderLoteNumberBadge}
        savingLote={savingLote}
        savingPrevisao={savingPrevisao}
        search={search}
        selectedInsumoFaltanteFilter={selectedInsumoFaltanteFilter}
        selectedLotes={selectedLotes}
        setBatchStatusValue={setBatchStatusValue}
        setCurrentPage={setCurrentPage}
        setEditingPrevisaoLote={setEditingPrevisaoLote}
        setNovaSolicitacaoAberta={setNovaSolicitacaoAberta}
        setPageSize={setPageSize}
        setSearch={setSearch}
        setSelectedInsumoFaltanteFilter={setSelectedInsumoFaltanteFilter}
        setSelectedLotes={setSelectedLotes}
        setTempPrevisaoVal={setTempPrevisaoVal}
        setTerceirizadosSubTab={setTerceirizadosSubTab}
        setTirarEsperaLote={setTirarEsperaLote}
        showToast={showToast}
        solicitacoes={solicitacoes}
        sortedLotes={sortedLotes}
        sortedLotesEmFabricacao={sortedLotesEmFabricacao}
        sortField={sortField}
        sortOrder={sortOrder}
        tempPrevisaoVal={tempPrevisaoVal}
        terceirizadosSubTab={terceirizadosSubTab}
        toggleSelectAll={toggleSelectAll}
        toggleSelectLote={toggleSelectLote}
        totalPages={totalPages}
      />}

      {/* VIEW 3: ABA DE KITS (INTEGRADA COM GERENCIAMENTO DE KITS) */}
      {currentTab === 'kits' && <KitsTab
        filteredKitOrders={filteredKitOrders}
        handleClearAllKitsFilters={handleClearAllKitsFilters}
        handleKitsColumnFilterChange={handleKitsColumnFilterChange}
        kitOrders={kitOrders}
        kitOrdersSearch={kitOrdersSearch}
        kitsColumnFilters={kitsColumnFilters}
        kitsColumnOptions={kitsColumnOptions}
        loadingKits={loadingKits}
        setKitOrdersSearch={setKitOrdersSearch}
        setSelectedKitOrder={setSelectedKitOrder}
      />}

      {/* VIEW: QUADRO DE PESAGEM (HARMONIZADO COM O QUADRO DE ENVASE EM 3 COLUNAS) */}
      {currentTab === 'quadro_pesagem' && <QuadroPesagem
        baseLotesFilaPesagem={baseLotesFilaPesagem}
        currentUser={currentUser}
        dragOverTarget={dragOverTarget}
        fetchLotes={fetchLotes}
        filteredLotesPesando={filteredLotesPesando}
        getLoteAdiadoInfo={getLoteAdiadoInfo}
        handleCancelAdiarLote={handleCancelAdiarLote}
        handleDropPesagem={handleDropPesagem}
        handleMoveLoteNextDay={handleMoveLoteNextDay}
        handleOpenAddLoteModal={handleOpenAddLoteModal}
        handleOpenEditTimestamps={handleOpenEditTimestamps}
        handleOpenPauseModal={handleOpenPauseModal}
        handleRemoverDaFila={handleRemoverDaFila}
        handleReorderPesagem={handleReorderPesagem}
        handleResumeLote={handleResumeLote}
        insumosFaltantesList={insumosFaltantesList}
        loading={loading}
        lotesEsperaPesagemCount={lotesEsperaPesagemCount}
        lotesFilaPesagem={lotesFilaPesagem}
        manualFilasAdicionados={manualFilasAdicionados}
        multiProductLoteNumbers={multiProductLoteNumbers}
        performRemoteLookup={performRemoteLookup}
        pesagemConcluidosLotes={pesagemConcluidosLotes}
        pesagemFilaFilter={pesagemFilaFilter}
        pesagemFilaSearch={pesagemFilaSearch}
        pesagemSearch={pesagemSearch}
        pesagemSelectedDate={pesagemSelectedDate}
        pesagemShowAllDates={pesagemShowAllDates}
        programacaoEnvase={programacaoEnvase}
        programacaoRotulagem={programacaoRotulagem}
        renderLoteEsperaBadge={renderLoteEsperaBadge}
        renderLoteNumberBadge={renderLoteNumberBadge}
        renderLoteProblemaBanner={renderLoteProblemaBanner}
        renderLoteProductsInfo={renderLoteProductsInfo}
        renderUnifiedQuadroHeader={renderUnifiedQuadroHeader}
        saveEtapaStatus={saveEtapaStatus}
        selectedInsumoFaltanteFilter={selectedInsumoFaltanteFilter}
        setDragCardInfo={setDragCardInfo}
        setDragOverTarget={setDragOverTarget}
        setLotes={setLotes}
        setPesagemConcluidosLotes={setPesagemConcluidosLotes}
        setPesagemFilaFilter={setPesagemFilaFilter}
        setPesagemFilaSearch={setPesagemFilaSearch}
        setPesagemOrderOverrides={setPesagemOrderOverrides}
        setPesagemSelectedDate={setPesagemSelectedDate}
        setPesagemShowAllDates={setPesagemShowAllDates}
        setSelectedInsumoFaltanteFilter={setSelectedInsumoFaltanteFilter}
        setSelectedLoteDetails={setSelectedLoteDetails}
        showToast={showToast}
        sortedLotesPesando={sortedLotesPesando}
      />}

      {/* VIEW: QUADRO DE PRODUÇÃO (QUADRO DE PRODUÇÃO + QUADRO DE CALDEIRA + FILA LADO A LADO) */}
      {currentTab === 'quadro_producao' && <QuadroProducao
        baseLotesFilaProducao={baseLotesFilaProducao}
        caldeiraAtiva={caldeiraAtiva}
        currentUser={currentUser}
        dragOverTarget={dragOverTarget}
        fetchLotes={fetchLotes}
        filteredLotesCaldeira={filteredLotesCaldeira}
        filteredLotesReatoresNormais={filteredLotesReatoresNormais}
        getLoteAdiadoInfo={getLoteAdiadoInfo}
        handleCancelAdiarLote={handleCancelAdiarLote}
        handleDropProducao={handleDropProducao}
        handleMoveLoteNextDay={handleMoveLoteNextDay}
        handleMoverParaCaldeira={handleMoverParaCaldeira}
        handleOpenAddLoteModal={handleOpenAddLoteModal}
        handleOpenEditTimestamps={handleOpenEditTimestamps}
        handleOpenPauseModal={handleOpenPauseModal}
        handleRemoverDaFila={handleRemoverDaFila}
        handleReorderProducao={handleReorderProducao}
        handleResumeLote={handleResumeLote}
        handleToggleCaldeiraLote={handleToggleCaldeiraLote}
        insumosFaltantesList={insumosFaltantesList}
        loading={loading}
        lotesCaldeira={lotesCaldeira}
        lotesFilaProducao={lotesFilaProducao}
        lotesReatoresNormais={lotesReatoresNormais}
        multiProductLoteNumbers={multiProductLoteNumbers}
        performRemoteLookup={performRemoteLookup}
        producaoConcluidosLotes={producaoConcluidosLotes}
        producaoFilaFilter={producaoFilaFilter}
        producaoFilaSearch={producaoFilaSearch}
        producaoSearch={producaoSearch}
        producaoSelectedDate={producaoSelectedDate}
        producaoShowAllDates={producaoShowAllDates}
        programacaoEnvase={programacaoEnvase}
        programacaoRotulagem={programacaoRotulagem}
        renderLoteEsperaBadge={renderLoteEsperaBadge}
        renderLoteNumberBadge={renderLoteNumberBadge}
        renderLoteProblemaBanner={renderLoteProblemaBanner}
        renderLoteProductsInfo={renderLoteProductsInfo}
        renderUnifiedQuadroHeader={renderUnifiedQuadroHeader}
        saveEtapaStatus={saveEtapaStatus}
        selectedInsumoFaltanteFilter={selectedInsumoFaltanteFilter}
        setDragCardInfo={setDragCardInfo}
        setDragOverTarget={setDragOverTarget}
        setLotes={setLotes}
        setProducaoConcluidosLotes={setProducaoConcluidosLotes}
        setProducaoFilaFilter={setProducaoFilaFilter}
        setProducaoFilaSearch={setProducaoFilaSearch}
        setProducaoOrderOverrides={setProducaoOrderOverrides}
        setProducaoSelectedDate={setProducaoSelectedDate}
        setProducaoShowAllDates={setProducaoShowAllDates}
        setSelectedInsumoFaltanteFilter={setSelectedInsumoFaltanteFilter}
        setSelectedLoteDetails={setSelectedLoteDetails}
        showToast={showToast}
      />}

      {/* VIEW: QUADRO DE ROTULAGEM */}
      {currentTab === 'quadro_rotulagem' && <QuadroRotulagem
        dragOverTarget={dragOverTarget}
        fetchLotes={fetchLotes}
        fetchProgramacaoRotulagem={fetchProgramacaoRotulagem}
        filteredRotulagemManualItems={filteredRotulagemManualItems}
        filteredRotulagemMaquinaItems={filteredRotulagemMaquinaItems}
        getCurrentBoardDate={getCurrentBoardDate}
        getLoteAdiadoInfo={getLoteAdiadoInfo}
        getRealLote={getRealLote}
        handleCancelAdiarLote={handleCancelAdiarLote}
        handleChangeStatusRotulagem={handleChangeStatusRotulagem}
        handleDropRotulagem={handleDropRotulagem}
        handleEncaixarRotulagem={handleEncaixarRotulagem}
        handleMoveLoteNextDay={handleMoveLoteNextDay}
        handleMoveTipoRotulagem={handleMoveTipoRotulagem}
        handleOpenAddLoteModal={handleOpenAddLoteModal}
        handleOpenAdiarModal={handleOpenAdiarModal}
        handleOpenEditTimestamps={handleOpenEditTimestamps}
        handleOpenPauseModal={handleOpenPauseModal}
        handleRemoverDaFila={handleRemoverDaFila}
        handleRemoveRotulagem={handleRemoveRotulagem}
        handleReorderRotulagem={handleReorderRotulagem}
        hasLoteProblemaOuPausa={hasLoteProblemaOuPausa}
        loading={loading}
        loadingRotulagem={loadingRotulagem}
        lotesByNumber={lotesByNumber}
        lotesLiberadosParaAcabamento={lotesLiberadosParaAcabamento}
        lotesParaRotulagem={lotesParaRotulagem}
        multiProductLoteNumbers={multiProductLoteNumbers}
        performRemoteLookup={performRemoteLookup}
        programacaoEnvase={programacaoEnvase}
        programacaoRotulagem={programacaoRotulagem}
        renderLoteEsperaBadge={renderLoteEsperaBadge}
        renderLoteNumberBadge={renderLoteNumberBadge}
        renderLoteProblemaBanner={renderLoteProblemaBanner}
        renderLoteProductsInfo={renderLoteProductsInfo}
        renderUnifiedQuadroHeader={renderUnifiedQuadroHeader}
        rotulagemDayStats={rotulagemDayStats}
        rotulagemFilaSearch={rotulagemFilaSearch}
        rotulagemMaquinaItems={rotulagemMaquinaItems}
        rotulagemScopeFilter={rotulagemScopeFilter}
        rotulagemSearch={rotulagemSearch}
        rotulagemSelectedDate={rotulagemSelectedDate}
        rotulagemShowAllDates={rotulagemShowAllDates}
        setDragCardInfo={setDragCardInfo}
        setDragOverTarget={setDragOverTarget}
        setRotulagemFilaSearch={setRotulagemFilaSearch}
        setRotulagemScopeFilter={setRotulagemScopeFilter}
        setRotulagemSearch={setRotulagemSearch}
        setRotulagemSelectedDate={setRotulagemSelectedDate}
        setRotulagemShowAllDates={setRotulagemShowAllDates}
        setSelectedLoteDetails={setSelectedLoteDetails}
        todasOrdensAbertasFabrica={todasOrdensAbertasFabrica}
      />}

      {/* VIEW: QUADRO DE PROGRAMAÇÃO DE ENVASE */}
      {currentTab === 'quadro_envase' && <QuadroEnvase
        dragOverTarget={dragOverTarget}
        encaixeSearch={encaixeSearch}
        envaseDayStats={envaseDayStats}
        envaseLinha1Items={envaseLinha1Items}
        envaseLinha2Items={envaseLinha2Items}
        envaseLinha3Items={envaseLinha3Items}
        envaseScopeFilter={envaseScopeFilter}
        envaseSearch={envaseSearch}
        envaseSelectedDate={envaseSelectedDate}
        envaseShowAllDates={envaseShowAllDates}
        fetchProgramacaoEnvase={fetchProgramacaoEnvase}
        filteredEnvaseLinha1Items={filteredEnvaseLinha1Items}
        filteredEnvaseLinha2Items={filteredEnvaseLinha2Items}
        filteredEnvaseLinha3Items={filteredEnvaseLinha3Items}
        getCurrentBoardDate={getCurrentBoardDate}
        getLoteAdiadoInfo={getLoteAdiadoInfo}
        getRealLote={getRealLote}
        handleCancelAdiarLote={handleCancelAdiarLote}
        handleChangeStatusEnvase={handleChangeStatusEnvase}
        handleDropEnvaseColumn={handleDropEnvaseColumn}
        handleEncaixarLote={handleEncaixarLote}
        handleMoveLinha={handleMoveLinha}
        handleMoveLoteNextDay={handleMoveLoteNextDay}
        handleOpenAdiarModal={handleOpenAdiarModal}
        handleOpenEditTimestamps={handleOpenEditTimestamps}
        handleOpenEnvaseEspera={handleOpenEnvaseEspera}
        handleOpenPauseModal={handleOpenPauseModal}
        handleOpenRelatorioEnvaseModal={handleOpenRelatorioEnvaseModal}
        handleRemoveEnvase={handleRemoveEnvase}
        handleRemoverDaFila={handleRemoverDaFila}
        handleReorderEnvase={handleReorderEnvase}
        hasLoteProblemaOuPausa={hasLoteProblemaOuPausa}
        isLoteTerceirizado={isLoteTerceirizado}
        loadingEnvase={loadingEnvase}
        lotesByNumber={lotesByNumber}
        lotesLiberadosParaAcabamento={lotesLiberadosParaAcabamento}
        lotesParaEncaixe={lotesParaEncaixe}
        multiProductLoteNumbers={multiProductLoteNumbers}
        performRemoteLookup={performRemoteLookup}
        programacaoEnvase={programacaoEnvase}
        programacaoRotulagem={programacaoRotulagem}
        renderFiscoQuimicaBadge={renderFiscoQuimicaBadge}
        renderLoteEsperaBadge={renderLoteEsperaBadge}
        renderLoteNumberBadge={renderLoteNumberBadge}
        renderLoteProblemaBanner={renderLoteProblemaBanner}
        renderLoteProductsInfo={renderLoteProductsInfo}
        renderUnifiedQuadroHeader={renderUnifiedQuadroHeader}
        setDragCardInfo={setDragCardInfo}
        setDragOverTarget={setDragOverTarget}
        setEncaixeSearch={setEncaixeSearch}
        setEnvaseScopeFilter={setEnvaseScopeFilter}
        setEnvaseSearch={setEnvaseSearch}
        setEnvaseSelectedDate={setEnvaseSelectedDate}
        setEnvaseShowAllDates={setEnvaseShowAllDates}
        setSelectedLoteDetails={setSelectedLoteDetails}
        todasOrdensAbertasFabrica={todasOrdensAbertasFabrica}
      />}

      {/* VIEW: QUADRO DE ORDENS (FINALIZADAS X PARCIAIS) */}
      {currentTab === 'quadro_ordens' && <QuadroOrdens
        baseLotesParaOrdens={baseLotesParaOrdens}
        baseOrdensFinalizadas={baseOrdensFinalizadas}
        baseOrdensParciais={baseOrdensParciais}
        executeStatusUpdate={executeStatusUpdate}
        fetchLotes={fetchLotes}
        filteredOrdensFinalizadas={filteredOrdensFinalizadas}
        filteredOrdensParciais={filteredOrdensParciais}
        handleMoveLoteNextDay={handleMoveLoteNextDay}
        handleOpenEditTimestamps={handleOpenEditTimestamps}
        handleOpenHistory={handleOpenHistory}
        loading={loading}
        lotesParaOrdens={lotesParaOrdens}
        multiProductLoteNumbers={multiProductLoteNumbers}
        ordensFinalizadas={ordensFinalizadas}
        ordensParciais={ordensParciais}
        ordensSearch={ordensSearch}
        ordensSelectedDate={ordensSelectedDate}
        ordensShowAllDates={ordensShowAllDates}
        performRemoteLookup={performRemoteLookup}
        renderQuadrosOcultosBadges={renderQuadrosOcultosBadges}
        renderUnifiedQuadroHeader={renderUnifiedQuadroHeader}
        setOrdensSearch={setOrdensSearch}
        setOrdensSelectedDate={setOrdensSelectedDate}
        setOrdensShowAllDates={setOrdensShowAllDates}
        setParcialModalLote={setParcialModalLote}
        setSelectedLoteDetails={setSelectedLoteDetails}
        totalOrdensFinalizadasNaoLancadas={totalOrdensFinalizadasNaoLancadas}
      />}

      {/* VIEW: CALENDÁRIO MENSAL */}
      {currentTab === 'calendar' && <CalendarioTab
        calendarDays={calendarDays}
        calendarSearch={calendarSearch}
        calendarStatusFilter={calendarStatusFilter}
        currentMonth={currentMonth}
        currentYear={currentYear}
        getBadgeClass={getBadgeClass}
        getErpBadgeClass={getErpBadgeClass}
        handleGoToToday={handleGoToToday}
        handleNextMonth={handleNextMonth}
        handleOpenHistory={handleOpenHistory}
        handlePrevMonth={handlePrevMonth}
        handleSelectStatusChange={handleSelectStatusChange}
        savingLote={savingLote}
        selectedDateIso={selectedDateIso}
        selectedDayInfo={selectedDayInfo}
        setCalendarSearch={setCalendarSearch}
        setCalendarStatusFilter={setCalendarStatusFilter}
        setSelectedDateIso={setSelectedDateIso}
      />}

      {/* VIEW 5: ABA CONFIGURAÇÕES (EXPORTAÇÃO EXCEL) */}
      {currentTab === 'configuracoes' && <ConfiguracoesTab handleExportExcel={handleExportExcel} />}

      {/* MODAL DE EM ESPERA EM LOTE */}
      {showBatchEsperaModal && <EsperaLoteModal batchCustomMotivo={batchCustomMotivo} batchEsperaMotivo={batchEsperaMotivo} handleApplyBatchStatus={handleApplyBatchStatus} isBatchUpdating={isBatchUpdating} selectedLotes={selectedLotes} setBatchCustomMotivo={setBatchCustomMotivo} setBatchEsperaMotivo={setBatchEsperaMotivo} setBatchStatusValue={setBatchStatusValue} setShowBatchEsperaModal={setShowBatchEsperaModal} />}

      {/* MODAL PARA PAUSAR / AJUSTAR PAUSA DO LOTE */}
      {pauseModalLote && <PausaLoteModal handlePauseInsumoLookup={handlePauseInsumoLookup} handleResumeLote={handleResumeLote} handleSavePause={handleSavePause} pauseInsumoCodigo={pauseInsumoCodigo} pauseInsumoDescricao={pauseInsumoDescricao} pauseLoadingInsumo={pauseLoadingInsumo} pauseModalEtapa={pauseModalEtapa} pauseModalLote={pauseModalLote} pauseMotivoCustom={pauseMotivoCustom} pauseTipoMotivo={pauseTipoMotivo} savingPause={savingPause} setPauseInsumoCodigo={setPauseInsumoCodigo} setPauseInsumoDescricao={setPauseInsumoDescricao} setPauseModalEtapa={setPauseModalEtapa} setPauseModalLote={setPauseModalLote} setPauseMotivoCustom={setPauseMotivoCustom} setPauseTipoMotivo={setPauseTipoMotivo} />}

      {/* MODAL PARA ADICIONAR LOTE NA FILA OU LIBERADOS PARA ENVASE */}
      {addLoteModalTarget && <AdicionarLoteModal addLoteModalSearch={addLoteModalSearch} addLoteModalTarget={addLoteModalTarget} baseLotesFilaPesagem={baseLotesFilaPesagem} baseLotesFilaProducao={baseLotesFilaProducao} baseLotesParaEncaixe={baseLotesParaEncaixe} baseLotesParaRotulagem={baseLotesParaRotulagem} handleConfirmAddLote={handleConfirmAddLote} lotes={lotes} lotesProducao={lotesProducao} performRemoteLookup={performRemoteLookup} programacaoEnvase={programacaoEnvase} programacaoRotulagem={programacaoRotulagem} setAddLoteModalSearch={setAddLoteModalSearch} setAddLoteModalTarget={setAddLoteModalTarget} sortedLotesPesando={sortedLotesPesando} />}

      {/* MODAL DE PESQUISA FACILITADA: LOCALIZAR LOTE NAS DATAS E ETAPAS */}
      {showLocalizarDataModal && <LocalizarDataModal localizarDataSearch={localizarDataSearch} lotes={lotes} performRemoteLookup={performRemoteLookup} programacaoEnvase={programacaoEnvase} programacaoRotulagem={programacaoRotulagem} setCurrentTab={setCurrentTab} setEnvaseSelectedDate={setEnvaseSelectedDate} setEnvaseShowAllDates={setEnvaseShowAllDates} setLocalizarDataSearch={setLocalizarDataSearch} setPesagemSelectedDate={setPesagemSelectedDate} setProducaoSelectedDate={setProducaoSelectedDate} setRotulagemSelectedDate={setRotulagemSelectedDate} setRotulagemShowAllDates={setRotulagemShowAllDates} setShowLocalizarDataModal={setShowLocalizarDataModal} />}
      {selectedKitOrder && <DetalhesKitModal handleUpdateKitOrder={handleUpdateKitOrder} savingKitOrder={savingKitOrder} selectedKitOrder={selectedKitOrder} setSelectedKitOrder={setSelectedKitOrder} />}

      {/* MODAL DE HISTÓRICO DE DATAS E MUDANÇAS DE STATUS */}
      {historyModalLote && <HistoricoLoteModal getBadgeClass={getBadgeClass} historyList={historyList} historyModalLote={historyModalLote} loadingHistory={loadingHistory} programacaoEnvase={programacaoEnvase} setHistoryModalLote={setHistoryModalLote} />}

          {/* MODAL DE EDIÇÃO DE TERCEIRIZADO (FORNECEDOR E PREVISÃO) */}
      {editTerceirizadoLote && <TerceirizadoLoteModal editTerceirizadoFornecedor={editTerceirizadoFornecedor} editTerceirizadoLote={editTerceirizadoLote} editTerceirizadoPrevisao={editTerceirizadoPrevisao} handleReturnTerceirizadoFromModal={handleReturnTerceirizadoFromModal} handleSaveEditTerceirizado={handleSaveEditTerceirizado} savingTerceirizado={savingTerceirizado} setEditTerceirizadoFornecedor={setEditTerceirizadoFornecedor} setEditTerceirizadoLote={setEditTerceirizadoLote} setEditTerceirizadoPrevisao={setEditTerceirizadoPrevisao} />}

      {/* MODAL DE ESPERA DO ENVASE COM MOTIVO */}
      {envaseEsperaItem && <EsperaEnvaseModal envaseEsperaCustom={envaseEsperaCustom} envaseEsperaItem={envaseEsperaItem} envaseEsperaMotivo={envaseEsperaMotivo} envaseEsperaMotivoRestante={envaseEsperaMotivoRestante} envaseEsperaParcialQtd={envaseEsperaParcialQtd} handleConfirmEnvaseEspera={handleConfirmEnvaseEspera} setEnvaseEsperaCustom={setEnvaseEsperaCustom} setEnvaseEsperaItem={setEnvaseEsperaItem} setEnvaseEsperaMotivo={setEnvaseEsperaMotivo} setEnvaseEsperaMotivoRestante={setEnvaseEsperaMotivoRestante} setEnvaseEsperaParcialQtd={setEnvaseEsperaParcialQtd} />}

      {/* MODAL CONTEXTUAL: VER DETALHES DO ITEM */}
      {selectedLoteDetails && <DetalhesItemModal caldeiraAtiva={caldeiraAtiva} caldeiraHistorico={caldeiraHistorico} getBadgeClass={getBadgeClass} handleOpenHistory={handleOpenHistory} lotesComCaldeira={lotesComCaldeira} pesagemConcluidosLotes={pesagemConcluidosLotes} producaoConcluidosLotes={producaoConcluidosLotes} programacaoEnvase={programacaoEnvase} programacaoRotulagem={programacaoRotulagem} selectedLoteDetails={selectedLoteDetails} setSelectedLoteDetails={setSelectedLoteDetails} />}

      {/* MODAL AJUSTAR DATAS E HORÁRIOS MANUALMENTE */}
      {editTimestampsLote && <AjustarDatasModal editTimestampsLote={editTimestampsLote} handleSaveTimestamps={handleSaveTimestamps} savingTimestamps={savingTimestamps} setEditTimestampsLote={setEditTimestampsLote} setTimestampsForm={setTimestampsForm} timestampsForm={timestampsForm} />}

      {/* Modal para Selecionar Data para Adiar Lote / Programação */}
      {adiarModalItem && <AdiarLoteModal adiarModalItem={adiarModalItem} handleCancelAdiarLote={handleCancelAdiarLote} handleConfirmAdiarLote={handleConfirmAdiarLote} lotesAdiadosHistorico={lotesAdiadosHistorico} savingAdiarLote={savingAdiarLote} setAdiarModalItem={setAdiarModalItem} setQuickDate={setQuickDate} setQuickNextMonday={setQuickNextMonday} />}

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
      {showRelatorioEnvaseModal && <RelatorioEnvaseModal handleExportRelatorioEnvaseExcel={handleExportRelatorioEnvaseExcel} handlePrintRelatorioEnvase={handlePrintRelatorioEnvase} handleSetRelatorioPeriod={handleSetRelatorioPeriod} loadingRelatorioEnvase={loadingRelatorioEnvase} relatorioAgrupamento={relatorioAgrupamento} relatorioConsolidadoPorProduto={relatorioConsolidadoPorProduto} relatorioDataFim={relatorioDataFim} relatorioDataInicio={relatorioDataInicio} relatorioEnvaseItems={relatorioEnvaseItems} relatorioIncluirLiberados={relatorioIncluirLiberados} relatorioLinhaFilter={relatorioLinhaFilter} relatorioLinhasGroups={relatorioLinhasGroups} relatorioSearch={relatorioSearch} relatorioStatusFilter={relatorioStatusFilter} relatorioTotals={relatorioTotals} setRelatorioAgrupamento={setRelatorioAgrupamento} setRelatorioDataFim={setRelatorioDataFim} setRelatorioDataInicio={setRelatorioDataInicio} setRelatorioIncluirLiberados={setRelatorioIncluirLiberados} setRelatorioLinhaFilter={setRelatorioLinhaFilter} setRelatorioSearch={setRelatorioSearch} setRelatorioStatusFilter={setRelatorioStatusFilter} setShowRelatorioEnvaseModal={setShowRelatorioEnvaseModal} />}

      {/* ÁREA DE IMPRESSÃO LIMPA (FOLHA A4 - VISÍVEL APENAS NA IMPRESSÃO) */}
      <RelatorioEnvaseImpressao currentUser={currentUser} relatorioAgrupamento={relatorioAgrupamento} relatorioConsolidadoPorProduto={relatorioConsolidadoPorProduto} relatorioDataFim={relatorioDataFim} relatorioDataInicio={relatorioDataInicio} relatorioEnvaseItems={relatorioEnvaseItems} relatorioIncluirLiberados={relatorioIncluirLiberados} relatorioLinhaFilter={relatorioLinhaFilter} relatorioLinhasGroups={relatorioLinhasGroups} relatorioTotals={relatorioTotals} />

    </AppLayout>
  );
}

