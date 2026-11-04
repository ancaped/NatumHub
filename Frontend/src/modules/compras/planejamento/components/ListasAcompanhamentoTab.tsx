import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../../geral/lib/api';
import { PurchaseRequestBatch, PurchaseRequestBatchDetail, PurchaseRequestBatchItem } from '../../../geral/lib/types';
import { 
  ClipboardList, Search, RefreshCw, Printer, CheckCircle2, Clock, 
  AlertCircle, ChevronDown, ChevronRight, Eye, Trash2, Edit3, Check, 
  X, Layers, Boxes, Palette, Tag, Package, ExternalLink, Calendar, User, FileText, Settings
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { imprimirRelatorioCompra } from '../imprimirRelatorioCompra';
import type { ItemRelatorio } from '../relatorioCompra';
import { ReportHeader, BotaoAcao, ReportTabs, FilterBar, FiltroSelect, StatusBadge } from '../../../geral/components/ui/ReportKit';

interface ListasAcompanhamentoTabProps {
  active?: boolean;
  mode?: string;
  /** Lote recém-gerado: a tela abre esse lote, rola até ele e o destaca. */
  destaqueLoteId?: string | null;
}

const MODULO_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  materia_prima: { label: 'Matéria-Prima', icon: Boxes, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  embalagens: { label: 'Embalagens', icon: Layers, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  coloracao: { label: 'Coloração', icon: Palette, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  apoio: { label: 'Material de Apoio', icon: Tag, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  geral: { label: 'Geral', icon: Package, color: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
};

const COLUMN_METADATA: Record<string, { label: string; align: 'left' | 'center' | 'right' }> = {
  itemCode: { label: 'Ref / Item', align: 'left' },
  currentStock: { label: 'Estoque', align: 'right' },
  overallAvg: { label: 'Média Mês', align: 'right' },
  simProducao: { label: 'Sim. Produção', align: 'right' },
  futureStockForecast: { label: 'Prev. Futura', align: 'right' },
  estimatedDurationDays: { label: 'Duração Est.', align: 'center' },
  triggerDays: { label: 'Disp. (Ponto Pedido)', align: 'center' },
  targetDays: { label: 'Obj. (Meta)', align: 'center' },
  recommendedQty: { label: 'Qtd Recomendada', align: 'right' },
};

export function ListasAcompanhamentoTab({ active = true, mode = 'all', destaqueLoteId = null }: ListasAcompanhamentoTabProps) {
  const [batches, setBatches] = useState<PurchaseRequestBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [moduleFilter, setModuleFilter] = useState<string>(mode === 'all' ? 'ALL' : mode);

  // Column customization for print
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [columns, setColumns] = useState<Record<string, boolean>>({
    itemCode: true,
    currentStock: true,
    overallAvg: true,
    simProducao: true,
    futureStockForecast: true,
    estimatedDurationDays: true,
    triggerDays: false,
    targetDays: false,
    recommendedQty: true,
  });

  const [columnOrder, setColumnOrder] = useState<string[]>([
    'itemCode',
    'currentStock',
    'overallAvg',
    'simProducao',
    'futureStockForecast',
    'estimatedDurationDays',
    'triggerDays',
    'targetDays',
    'recommendedQty',
  ]);

  useEffect(() => {
    const storedConfig = localStorage.getItem('natum_hub_print_list_column_config');
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig);
        setColumns(prev => ({
          ...prev,
          ...parsed,
        }));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const saveColumnConfig = (newConfig: Record<string, boolean>) => {
    setColumns(newConfig);
    localStorage.setItem('natum_hub_print_list_column_config', JSON.stringify(newConfig));
  };

  // Selected batch for detail modal/expansion
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchDetails, setBatchDetails] = useState<Record<string, PurchaseRequestBatchDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  // Editing notes
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');

  const loadBatches = async () => {
    setLoading(true);
    try {
      const data = await api.getPurchaseLists({
        modulo: moduleFilter === 'ALL' ? undefined : moduleFilter,
        search: search.trim() ? search.trim() : undefined,
      });
      setBatches(data);
    } catch (e) {
      console.error('Erro ao carregar lotes de listas de compras:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (active) {
      loadBatches();
    }
  }, [active, moduleFilter]);

  // Listen to external updates
  useEffect(() => {
    const handleUpdate = () => {
      if (active) loadBatches();
    };
    window.addEventListener('compras_solicitacoes_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('compras_solicitacoes_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [active]);

  const loadBatchDetail = async (id: string) => {
    if (batchDetails[id]) return;
    setLoadingDetail(id);
    try {
      const detail = await api.getPurchaseListDetail(id);
      setBatchDetails(prev => ({ ...prev, [id]: detail }));
    } catch (e) {
      console.error('Erro ao carregar detalhes do lote:', e);
    } finally {
      setLoadingDetail(null);
    }
  };

  // Lote recém-gerado: mostra todos os status, sem busca, abre o lote, rola até ele e dá um anel de destaque.
  const [destaqueId, setDestaqueId] = useState<string | null>(null);
  const rolouPara = useRef<string | null>(null);
  useEffect(() => {
    if (!destaqueLoteId) {
      setDestaqueId(null);
      return;
    }
    setStatusFilter('ALL');
    setSearch('');
    setDestaqueId(destaqueLoteId);
    rolouPara.current = null;
    (async () => {
      setLoading(true);
      try {
        setBatches(await api.getPurchaseLists({ modulo: moduleFilter === 'ALL' ? undefined : moduleFilter }));
      } catch (e) {
        console.error('Erro ao carregar lotes de listas de compras:', e);
      } finally {
        setLoading(false);
      }
      setExpandedBatchId(destaqueLoteId);
      loadBatchDetail(destaqueLoteId);
    })();
  }, [destaqueLoteId]);

  useEffect(() => {
    if (!active || !destaqueId || loading || rolouPara.current === destaqueId) return;
    if (!batches.some(b => b.id === destaqueId)) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`lote-${destaqueId}`);
      if (el && el.offsetParent !== null) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        rolouPara.current = destaqueId;
      }
    }, 80);
    return () => clearTimeout(t);
  }, [active, destaqueId, loading, batches]);

  const handleToggleExpand = (id: string) => {
    if (expandedBatchId === id) {
      setExpandedBatchId(null);
    } else {
      setExpandedBatchId(id);
      loadBatchDetail(id);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    if (newStatus === 'cancelado' && !confirm('Deseja realmente cancelar este lote de solicitação?')) {
      return;
    }
    try {
      await api.updatePurchaseList(id, { status: newStatus });
      await loadBatches();
      if (batchDetails[id]) {
        const detail = await api.getPurchaseListDetail(id);
        setBatchDetails(prev => ({ ...prev, [id]: detail }));
      }
      window.dispatchEvent(new Event('compras_solicitacoes_updated'));
    } catch (e) {
      console.error('Erro ao atualizar status do lote:', e);
      alert('Erro ao atualizar status do lote.');
    }
  };

  const handleSaveNotes = async (id: string) => {
    try {
      await api.updatePurchaseList(id, { observacoes: editNotes });
      setEditingBatchId(null);
      await loadBatches();
      if (batchDetails[id]) {
        const detail = await api.getPurchaseListDetail(id);
        setBatchDetails(prev => ({ ...prev, [id]: detail }));
      }
    } catch (e) {
      console.error('Erro ao salvar observações:', e);
    }
  };

  const handlePrintBatch = async (batch: PurchaseRequestBatch) => {
    let detail = batchDetails[batch.id];
    if (!detail) {
      try {
        detail = await api.getPurchaseListDetail(batch.id);
        setBatchDetails(prev => ({ ...prev, [batch.id]: detail }));
      } catch (e) {
        alert('Não foi possível carregar os itens do lote para impressão.');
        return;
      }
    }

    const items = detail.items || [];
    if (items.length === 0) {
      alert('Este lote não possui itens.');
      return;
    }

    const reportTitle = batch.titulo || (
      batch.modulo === 'materia_prima' ? 'Relatório de Compras — Matéria-Prima' :
      batch.modulo === 'embalagens' ? 'Relatório de Compras — Embalagens' :
      batch.modulo === 'coloracao' ? 'Relatório de Compras — Coloração' :
      batch.modulo === 'apoio' ? 'Relatório de Compras — Material de Apoio' :
      'Relatório de Compras'
    );

    const createdAtFormatted = new Date(batch.createdAt).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const itens: ItemRelatorio[] = items.map(item => {
      const currentAvg = item.overallAvgAtTime || 0;
      const daily = currentAvg / 30.0;
      const itemTargetDays = item.targetDaysAtTime || 90;
      const itemTriggerDays = item.triggerDaysAtTime || 30;
      const futureStock = item.futureStockAtTime || 0;
      const qty = item.quantityRequested || 0;
      const postStock = Math.max(0, futureStock + qty);
      return {
        codigo: item.itemCode,
        descricao: item.itemDescription,
        subtexto: item.supplierName ? `Fornec. sugerido: ${item.supplierName}` : null,
        observacao: item.observacao || null,
        unidade: item.unit || '',
        estoque: item.currentStockAtTime,
        media: Math.round(currentAvg),
        simProducao: item.simProducaoAtTime || 0,
        previsaoFutura: futureStock,
        duracaoDias: daily > 0 ? Math.round(futureStock / daily) : 9999,
        gatilhoDias: item.triggerDaysAtTime ?? null,
        metaDias: item.targetDaysAtTime ?? null,
        gatilhoRef: itemTriggerDays,
        metaRef: itemTargetDays,
        quantidade: qty,
        duracaoPosDias: daily > 0 ? Math.round(postStock / daily) : 9999,
      };
    });

    void imprimirRelatorioCompra({
      titulo: reportTitle,
      lote: batch.loteNumero,
      geradoEm: createdAtFormatted,
      solicitante: batch.createdBy || 'Sistema',
      observacoes: batch.observacoes || null,
      colunas: columnOrder.filter(k => columns[k] && COLUMN_METADATA[k]).map(k => ({ key: k, label: COLUMN_METADATA[k].label, align: COLUMN_METADATA[k].align })),
      itens,
    });
  };

  // KPIs
  const kpis = useMemo(() => {
    const total = batches.length;
    const pendentes = batches.filter(b => b.status === 'pendente').length;
    const parciais = batches.filter(b => b.status === 'parcial').length;
    const atendidos = batches.filter(b => b.status === 'atendido').length;
    const concluidos = batches.filter(b => b.status === 'concluido').length;
    return { total, pendentes, parciais, atendidos, concluidos };
  }, [batches]);

  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchLote = b.loteNumero.toLowerCase().includes(q);
        const matchTitle = (b.titulo || '').toLowerCase().includes(q);
        const matchObs = (b.observacoes || '').toLowerCase().includes(q);
        const matchUser = (b.createdBy || '').toLowerCase().includes(q);
        if (!matchLote && !matchTitle && !matchObs && !matchUser) return false;
      }
      return true;
    });
  }, [batches, search, statusFilter]);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-12.25rem)] animate-in fade-in duration-200">
      <ReportHeader
        titulo="Solicitações"
        subtitulo="Listas enviadas, status de atendimento e cruzamento com os pedidos de compra do ERP."
        acoes={
          <>
            <BotaoAcao onClick={() => setShowColumnConfig(!showColumnConfig)} title="Escolher quais colunas serão impressas no relatório">
              <Settings size={13} /> Colunas de impressão
            </BotaoAcao>
            <BotaoAcao onClick={loadBatches} disabled={loading}>
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} /> Atualizar
            </BotaoAcao>
          </>
        }
      />

      {/* Column Customization Panel */}
      {showColumnConfig && (
        <div className="bg-white px-4 py-3 rounded-xl border border-zinc-200 shadow-sm flex flex-col gap-2.5 shrink-0 animate-in fade-in duration-150">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <Settings className="h-4 w-4 text-zinc-500" /> Escolha as Colunas que Aparecerão na Impressão:
            </span>
            <button 
              onClick={() => setShowColumnConfig(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer p-1 rounded hover:bg-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {columnOrder.map((colKey) => {
              const meta = COLUMN_METADATA[colKey];
              if (!meta) return null;
              return (
                <label 
                  key={colKey} 
                  className={cn(
                    "px-2.5 py-1.5 border rounded-lg flex items-center gap-2 shadow-2xs text-xs cursor-pointer transition-colors select-none",
                    columns[colKey] ? "bg-zinc-900 text-white border-zinc-900 font-bold" : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100 font-medium"
                  )}
                >
                  <input 
                    type="checkbox" 
                    checked={!!columns[colKey]} 
                    onChange={e => saveColumnConfig({ ...columns, [colKey]: e.target.checked })} 
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>{meta.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <ReportTabs
        ativa={statusFilter}
        onChange={setStatusFilter}
        abas={[
          { id: 'pendente', label: 'Aguardando pedido ERP', contagem: kpis.pendentes },
          { id: 'parcial', label: 'Parcialmente comprado', contagem: kpis.parciais },
          { id: 'atendido', label: 'Pedidos lançados', contagem: kpis.atendidos },
          { id: 'concluido', label: 'Concluídos', contagem: kpis.concluidos },
          { id: 'ALL', label: 'Todos', contagem: kpis.total },
        ]}
      />

      <FilterBar busca={search} onBusca={setSearch} placeholder="Buscar por lote, título, solicitante ou observação...">
        <FiltroSelect
          value={moduleFilter}
          onChange={setModuleFilter}
          opcoes={[
            { valor: 'ALL', rotulo: 'Módulo: Todos' },
            { valor: 'materia_prima', rotulo: 'Matéria-Prima' },
            { valor: 'embalagens', rotulo: 'Embalagens' },
            { valor: 'coloracao', rotulo: 'Coloração' },
            { valor: 'apoio', rotulo: 'Apoio' },
          ]}
        />
        <span className="text-xs text-zinc-500 font-semibold">{filteredBatches.length} lotes</span>
      </FilterBar>

      {/* Main Table Panel */}
      <div className="flex-1 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-zinc-400 text-xs">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Carregando lotes de solicitação...
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3 py-16">
              <ClipboardList className="h-10 w-10 text-zinc-300" />
              <p className="text-sm font-semibold">Nenhum lote de solicitação encontrado</p>
              <p className="text-xs max-w-sm text-center text-zinc-400">
                Para criar um lote, adicione produtos na aba "Lista" do módulo correspondente e clique no botão "Gerar Lote de Solicitação".
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-150">
              {filteredBatches.map(batch => {
                const isExpanded = expandedBatchId === batch.id;
                const detail = batchDetails[batch.id];
                const modMeta = MODULO_LABELS[batch.modulo] || MODULO_LABELS.geral;
                const ModIcon = modMeta.icon;
                const createdAt = new Date(batch.createdAt);
                const daysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

                return (
                  <div
                    key={batch.id}
                    id={`lote-${batch.id}`}
                    className={cn('transition-colors hover:bg-zinc-50/40', destaqueId === batch.id && 'ring-2 ring-inset ring-amber-300 bg-amber-50/30')}
                  >
                    {/* Batch Row Header */}
                    <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      {/* Left: Lote Info */}
                      <div className="flex items-start gap-3 min-w-[280px]">
                        <button
                          onClick={() => handleToggleExpand(batch.id)}
                          className="p-1 text-zinc-400 hover:text-zinc-800 rounded hover:bg-zinc-100 transition-colors mt-0.5 cursor-pointer"
                          title={isExpanded ? "Recolher itens" : "Ver itens do lote"}
                        >
                          {isExpanded ? <ChevronDown className="h-5 w-5 text-zinc-800" /> : <ChevronRight className="h-5 w-5" />}
                        </button>

                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-sm text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                              {batch.loteNumero}
                            </span>
                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1", modMeta.color)}>
                              <ModIcon className="h-3 w-3" />
                              {modMeta.label}
                            </span>
                          </div>

                          <div className="font-bold text-xs text-zinc-800 mt-1">
                            {batch.titulo || `Lista de Solicitação — ${modMeta.label}`}
                          </div>

                          <div className="flex items-center gap-3 text-[10px] text-zinc-400 mt-0.5 font-medium">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {createdAt.toLocaleDateString('pt-BR')} às {createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" /> {batch.createdBy || 'Sistema'}
                            </span>
                            {daysAgo > 0 && (
                              <>
                                <span>•</span>
                                <span className={cn(daysAgo >= 3 && batch.status === 'pendente' ? "text-amber-600 font-bold" : "")}>
                                  há {daysAgo} {daysAgo === 1 ? 'dia' : 'dias'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Middle: Progress / Status */}
                      <div className="flex-1 max-w-sm w-full text-left">
                        <div className="flex justify-between items-center text-[10px] font-bold text-zinc-600 mb-1">
                          <span>Atendimento no ERP</span>
                          <span>{batch.itemsWithOrder} de {batch.totalItems} itens com pedido</span>
                        </div>
                        <div className="w-full bg-zinc-150 h-2 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all duration-300",
                              batch.status === 'concluido' ? "bg-emerald-500" :
                              batch.status === 'atendido' ? "bg-teal-500" :
                              batch.status === 'parcial' ? "bg-blue-500" : "bg-amber-400"
                            )}
                            style={{ width: `${batch.totalItems > 0 ? (batch.itemsWithOrder / batch.totalItems) * 100 : 0}%` }}
                          />
                        </div>

                        <div className="mt-1.5 flex items-center gap-2">
                          {batch.status === 'pendente' && (
                            <StatusBadge variante="aguardando"><Clock size={11} /> Aguardando pedido no ERP</StatusBadge>
                          )}
                          {batch.status === 'parcial' && (
                            <StatusBadge variante="ordem"><RefreshCw size={11} /> Parcialmente lançado ({batch.itemsWithOrder}/{batch.totalItems})</StatusBadge>
                          )}
                          {batch.status === 'atendido' && (
                            <StatusBadge variante="saudavel"><CheckCircle2 size={11} /> Pedidos ERP lançados</StatusBadge>
                          )}
                          {batch.status === 'concluido' && (
                            <StatusBadge variante="abundante"><Package size={11} /> Concluído / entregue</StatusBadge>
                          )}
                          {batch.status === 'cancelado' && (
                            <StatusBadge variante="descontinuado"><X size={11} /> Cancelado</StatusBadge>
                          )}

                          {batch.observacoes && (
                            <span className="text-[10px] text-zinc-500 italic truncate max-w-xs" title={batch.observacoes}>
                              "{batch.observacoes}"
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handlePrintBatch(batch)}
                          className="px-3 py-1.5 text-xs font-bold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                          title="Reimprimir relatório deste lote"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Reimprimir Lote
                        </button>

                        <button
                          onClick={() => handleToggleExpand(batch.id)}
                          className="px-3 py-1.5 text-xs font-bold border border-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-100 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          {isExpanded ? 'Ocultar' : 'Ver Itens'} ({batch.totalItems})
                        </button>

                        {batch.status !== 'concluido' && batch.status !== 'cancelado' && (
                          <button
                            onClick={() => handleUpdateStatus(batch.id, 'concluido')}
                            className="p-1.5 text-zinc-400 hover:text-emerald-600 rounded hover:bg-emerald-50 cursor-pointer"
                            title="Marcar lote como concluído manualmente"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}

                        {batch.status !== 'cancelado' && (
                          <button
                            onClick={() => handleUpdateStatus(batch.id, 'cancelado')}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                            title="Cancelar lote"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div className="bg-zinc-50/70 border-t border-zinc-200 p-4 animate-in slide-in-from-top-2 duration-150">
                        {loadingDetail === batch.id ? (
                          <div className="py-6 text-center text-xs text-zinc-400">Carregando itens e dados do ERP...</div>
                        ) : !detail || detail.items.length === 0 ? (
                          <div className="py-6 text-center text-xs text-zinc-400">Nenhum item encontrado neste lote.</div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                                  Itens Solicitados no Lote ({detail.items.length})
                                </span>
                                <button
                                  onClick={() => handlePrintBatch(batch)}
                                  className="px-2 py-1 text-[11px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded hover:bg-zinc-100 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                  title="Imprimir relatório deste lote"
                                >
                                  <Printer className="h-3.5 w-3.5 text-zinc-600" />
                                  Imprimir Relatório
                                </button>
                              </div>

                              {editingBatchId === batch.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editNotes}
                                    onChange={e => setEditNotes(e.target.value)}
                                    placeholder="Editar observação do lote..."
                                    className="px-2 py-1 text-xs border border-zinc-300 rounded bg-white w-64"
                                  />
                                  <button onClick={() => handleSaveNotes(batch.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => setEditingBatchId(null)} className="p-1 text-zinc-400 hover:bg-zinc-100 rounded">
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEditingBatchId(batch.id); setEditNotes(batch.observacoes || ''); }}
                                  className="text-[10px] text-zinc-500 hover:text-zinc-800 flex items-center gap-1 font-semibold cursor-pointer"
                                >
                                  <Edit3 className="h-3 w-3" /> Editar Observações
                                </button>
                              )}
                            </div>

                            <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-2xs">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-zinc-100/70 border-b border-zinc-200 text-zinc-600 font-bold uppercase text-[10px] tracking-wider">
                                  <tr>
                                    <th className="py-2 px-3">Ref / Código</th>
                                    <th className="py-2 px-3">Descrição do Insumo</th>
                                    <th className="py-2 px-3 text-right">Estoque Época</th>
                                    <th className="py-2 px-3 text-right">Média Mês</th>
                                    <th className="py-2 px-3 text-center">Meta</th>
                                    <th className="py-2 px-3 text-right">Qtd Solicitada</th>
                                    <th className="py-2 px-3">Pedidos no ERP</th>
                                    <th className="py-2 px-3">Previsão / Fornecedor</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {detail.items.map(item => {
                                    const hasOrder = !!item.erpPedidoNumero;
                                    const isDelivered = item.status === 'entregue';

                                    return (
                                      <tr key={item.id} className="hover:bg-zinc-50/70">
                                        <td className="py-2.5 px-3 font-mono font-bold text-zinc-900">
                                          {item.itemCode}
                                        </td>
                                        <td className="py-2.5 px-3">
                                          <div className="font-semibold text-zinc-800">{item.itemDescription}</div>
                                          {item.supplierName && (
                                            <span className="text-[10px] text-zinc-400 block">Fornec. sugerido: {item.supplierName}</span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-zinc-600">
                                          {item.currentStockAtTime.toLocaleString('pt-BR')} <span className="text-[9px] text-zinc-400">{item.unit}</span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-zinc-600">
                                          {Math.round(item.overallAvgAtTime).toLocaleString('pt-BR')} <span className="text-[9px] text-zinc-400">{item.unit}</span>
                                        </td>
                                        <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-700 text-[10px]">
                                          {item.targetDaysAtTime}d
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 bg-zinc-50/50">
                                          {item.quantityRequested.toLocaleString('pt-BR')} <span className="text-[9px] text-zinc-400 font-sans">{item.unit}</span>
                                        </td>

                                        {/* Pedidos do ERP atribuídos ao item */}
                                        <td className="py-2.5 px-3">
                                          {(item.erpPedidos ?? []).length > 0 ? (
                                            <div className="space-y-1.5">
                                              {(item.erpPedidos ?? []).map(ped => (
                                                <div key={`${ped.numero}-${ped.qtd}-${ped.qtdAtribuida}`} className="text-[10px] text-zinc-600">
                                                  <StatusBadge variante={ped.aberto ? 'saudavel' : 'abundante'} title={ped.aberto ? 'Pedido aberto' : 'Pedido finalizado ou já recebido'}>
                                                    <Package size={11} /> Pedido ERP #{ped.numero}
                                                  </StatusBadge>
                                                  <span className="ml-1.5">
                                                    {ped.data ? `${ped.data.slice(0, 10).split('-').reverse().join('/')} · ` : ''}
                                                    <strong>{ped.qtd.toLocaleString('pt-BR')}</strong> {item.unit}
                                                    {ped.qtdAtribuida < ped.qtd - 1e-6 && (
                                                      <span className="text-zinc-400"> (parte: {ped.qtdAtribuida.toLocaleString('pt-BR')})</span>
                                                    )}
                                                    <span className={ped.chegou > 0 ? 'text-emerald-700' : 'text-zinc-400'}> · chegou {ped.chegou.toLocaleString('pt-BR')}</span>
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <StatusBadge variante="aguardando"><Clock size={11} /> Aguardando pedido no ERP</StatusBadge>
                                          )}
                                        </td>

                                        {/* Fornecedor / Previsão */}
                                        <td className="py-2.5 px-3 text-left text-[10px]">
                                          {hasOrder ? (
                                            <div>
                                              <div className="font-semibold text-zinc-800 truncate max-w-[160px]" title={item.erpFornecedor || ''}>
                                                {item.erpFornecedor || 'Fornecedor não informado'}
                                              </div>
                                              <div className="text-zinc-400 mt-0.5">
                                                {item.erpPrevisaoEntrega ? `Prev. Entrega: ${item.erpPrevisaoEntrega}` : item.erpPedidoData ? `Feito em: ${item.erpPedidoData}` : ''}
                                              </div>
                                            </div>
                                          ) : (
                                            <span className="text-zinc-400 italic">Pendente de compra</span>
                                          )}
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
