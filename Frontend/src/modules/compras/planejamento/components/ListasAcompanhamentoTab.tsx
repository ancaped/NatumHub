import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { PurchaseRequestBatch, PurchaseRequestBatchDetail, PurchaseRequestBatchItem } from '../../../geral/lib/types';
import { RefreshCw, Printer, Check, X, Edit3, Settings } from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { imprimirRelatorioCompra } from '../imprimirRelatorioCompra';
import type { ItemRelatorio } from '../relatorioCompra';
import { ReportHeader, BotaoAcao, ReportTabs, FilterBar, FiltroSelect, StatusBadge, TabelaPainel, type VarianteBadge } from '../../../geral/components/ui/ReportKit';
import Drawer from '../../../geral/components/ui/Drawer';
import { SimulacaoLoteDrawer } from './SimulacaoLoteDrawer';

interface ListasAcompanhamentoTabProps {
  active?: boolean;
  mode?: string;
  /** Lote recém-gerado: a tela abre o Drawer desse lote. */
  destaqueLoteId?: string | null;
}

const MODULOS_FIXOS = ['materia_prima', 'embalagens', 'coloracao', 'apoio'];

const STATUS_BADGE: Record<string, { variante: VarianteBadge; rotulo: string }> = {
  pendente: { variante: 'aguardando', rotulo: 'Aguardando pedido' },
  parcial: { variante: 'ordem', rotulo: 'Parcial' },
  atendido: { variante: 'saudavel', rotulo: 'Pedidos lançados' },
  concluido: { variante: 'abundante', rotulo: 'Concluído' },
  cancelado: { variante: 'descontinuado', rotulo: 'Cancelado' },
};

const fmtData = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const fmtDataCurta = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const numeroLote = (n: string) => n.replace(/^lote\s*/i, '');
const vazio: React.CSSProperties = { textAlign: 'center', padding: 24, color: 'hsl(var(--text-secondary-hsl))' };

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

  // Lote aberto no Drawer
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [simulacaoLoteId, setSimulacaoLoteId] = useState<string | null>(null);
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

  // Lote recém-gerado: mostra todos os status, sem busca, recarrega e abre o Drawer desse lote.
  useEffect(() => {
    if (!destaqueLoteId) return;
    setStatusFilter('ALL');
    setSearch('');
    (async () => {
      setLoading(true);
      try {
        setBatches(await api.getPurchaseLists({ modulo: moduleFilter === 'ALL' ? undefined : moduleFilter }));
      } catch (e) {
        console.error('Erro ao carregar lotes de listas de compras:', e);
      } finally {
        setLoading(false);
      }
      setSelectedBatchId(destaqueLoteId);
      loadBatchDetail(destaqueLoteId);
    })();
  }, [destaqueLoteId]);

  const handleOpenBatch = (id: string) => {
    setSelectedBatchId(id);
    loadBatchDetail(id);
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

  const selectedBatch = batches.find(b => b.id === selectedBatchId) ?? null;
  const selectedDetail = selectedBatchId ? batchDetails[selectedBatchId] : undefined;

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
    <div className="animate-in fade-in duration-200">
      <ReportHeader
        titulo="Solicitações"
        subtitulo="Lotes enviados para compra e o que já virou pedido no ERP."
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
          { id: 'pendente', label: 'Aguardando pedido', contagem: kpis.pendentes },
          { id: 'parcial', label: 'Parcial', contagem: kpis.parciais },
          { id: 'atendido', label: 'Pedidos lançados', contagem: kpis.atendidos },
          { id: 'concluido', label: 'Concluídos', contagem: kpis.concluidos },
          { id: 'ALL', label: 'Todos', contagem: kpis.total },
        ]}
      />

      <FilterBar busca={search} onBusca={setSearch} placeholder="Buscar por lote, título, solicitante ou observação...">
        {!MODULOS_FIXOS.includes(mode) && (
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
        )}
      </FilterBar>

      <TabelaPainel>
        <thead>
          <tr>
            <th>Lote</th>
            <th>Título</th>
            <th>Enviado em</th>
            <th>Por</th>
            <th>Itens com pedido</th>
            <th className="numeric-col">Entregues</th>
            <th>Status</th>
            <th style={{ width: 1 }}></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={8} style={vazio}>Carregando solicitações...</td></tr>
          )}
          {!loading && filteredBatches.length === 0 && (
            <tr><td colSpan={8} style={vazio}>Nenhuma solicitação encontrada.</td></tr>
          )}
          {!loading && filteredBatches.map(batch => {
            const st = STATUS_BADGE[batch.status];
            const pct = batch.totalItems > 0 ? Math.min(100, (batch.itemsWithOrder / batch.totalItems) * 100) : 0;
            return (
              <tr key={batch.id} style={{ cursor: 'pointer' }} onClick={() => handleOpenBatch(batch.id)}>
                <td><span className="product-code" style={{ fontWeight: 700 }}>{numeroLote(batch.loteNumero)}</span></td>
                <td style={{ fontWeight: 600 }}>{batch.titulo || '—'}</td>
                <td>{fmtData(batch.createdAt)}</td>
                <td>{batch.createdBy || 'Sistema'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'hsl(var(--border-hsl, 240 6% 90%))', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'hsl(240 6% 10%)' }} />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{batch.itemsWithOrder} de {batch.totalItems}</span>
                  </div>
                </td>
                <td className="numeric-col">{batch.itemsCompleted}</td>
                <td>{st ? <StatusBadge variante={st.variante}>{st.rotulo}</StatusBadge> : batch.status}</td>
                <td>
                  <button
                    type="button"
                    title="Reimprimir"
                    aria-label="Reimprimir"
                    onClick={e => { e.stopPropagation(); void handlePrintBatch(batch); }}
                    className="p-1.5 text-zinc-400 hover:text-zinc-800 rounded hover:bg-zinc-100 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TabelaPainel>

      <Drawer
        isOpen={Boolean(selectedBatch)}
        onClose={() => { setSelectedBatchId(null); setEditingBatchId(null); }}
        badge="Solicitação"
        title={selectedBatch ? `LOTE ${numeroLote(selectedBatch.loteNumero)}${selectedBatch.titulo ? ` · ${selectedBatch.titulo}` : ''}` : ''}
        subtitle={selectedBatch ? `${selectedBatch.createdBy || 'Sistema'} · ${fmtData(selectedBatch.createdAt)} · ${selectedBatch.itemsWithOrder} de ${selectedBatch.totalItems} itens com pedido` : undefined}
        size="xl"
        loading={Boolean(selectedBatch && loadingDetail === selectedBatch.id)}
        loadingText="Carregando itens e dados do ERP..."
        footer={selectedBatch && (
          <div className="flex items-center justify-end gap-2 w-full">
            {selectedBatch.status !== 'cancelado' && (
              <BotaoAcao onClick={() => handleUpdateStatus(selectedBatch.id, 'cancelado')}>Cancelar lote</BotaoAcao>
            )}
            {selectedBatch.status !== 'concluido' && selectedBatch.status !== 'cancelado' && (
              <BotaoAcao onClick={() => handleUpdateStatus(selectedBatch.id, 'concluido')}>Marcar concluído</BotaoAcao>
            )}
            <BotaoAcao onClick={() => setSimulacaoLoteId(selectedBatch.id)} title="Produtos da simulação de produção que puxam os itens deste lote">
              Produtos da simulação
            </BotaoAcao>
            <BotaoAcao primario onClick={() => handlePrintBatch(selectedBatch)}>
              <Printer size={13} /> Imprimir
            </BotaoAcao>
          </div>
        )}
      >
        {selectedBatch && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              {STATUS_BADGE[selectedBatch.status]
                ? <StatusBadge variante={STATUS_BADGE[selectedBatch.status].variante}>{STATUS_BADGE[selectedBatch.status].rotulo}</StatusBadge>
                : <span>{selectedBatch.status}</span>}
              {editingBatchId === selectedBatch.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Editar observação do lote..."
                    className="px-2 py-1 text-xs border border-zinc-300 rounded bg-white w-64"
                  />
                  <button onClick={() => handleSaveNotes(selectedBatch.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer" title="Salvar">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingBatchId(null)} className="p-1 text-zinc-400 hover:bg-zinc-100 rounded cursor-pointer" title="Cancelar edição">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingBatchId(selectedBatch.id); setEditNotes(selectedBatch.observacoes || ''); }}
                  className="text-[11px] text-zinc-500 hover:text-zinc-800 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Edit3 className="h-3 w-3" /> Editar observações
                </button>
              )}
            </div>

            {selectedBatch.observacoes && editingBatchId !== selectedBatch.id && (
              <div className="panel-card" style={{ padding: '8px 12px', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                <strong>Observações: </strong>{selectedBatch.observacoes}
              </div>
            )}

            <TabelaPainel>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="numeric-col">Solicitado</th>
                  <th>Pedidos no ERP</th>
                </tr>
              </thead>
              <tbody>
                {(!selectedDetail || selectedDetail.items.length === 0) && (
                  <tr><td colSpan={3} style={vazio}>Nenhum item encontrado neste lote.</td></tr>
                )}
                {selectedDetail?.items.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className="product-code" style={{ fontSize: '0.68rem', fontWeight: 700 }}>{item.itemCode}</span>
                      <div style={{ fontWeight: 600 }}>{item.itemDescription}</div>
                      {item.observacao && (
                        <div style={{ fontSize: '0.68rem', fontStyle: 'italic', color: 'hsl(var(--text-secondary-hsl))' }}>{item.observacao}</div>
                      )}
                    </td>
                    <td className="numeric-col" style={{ whiteSpace: 'nowrap' }}>{item.quantityRequested.toLocaleString('pt-BR')} {item.unit}</td>
                    <td>
                      {(item.erpPedidos ?? []).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {(item.erpPedidos ?? []).map(ped => (
                            <div key={`${ped.numero}-${ped.qtd}-${ped.qtdAtribuida}`} style={{ fontSize: '0.72rem' }}>
                              <strong>#{ped.numero}</strong>{' '}
                              <span style={{ color: 'hsl(var(--text-secondary-hsl))' }}>
                                {ped.qtdAtribuida.toLocaleString('pt-BR')} {item.unit}
                                {ped.previsao ? ` · prev. ${fmtDataCurta(ped.previsao)}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <StatusBadge variante="aguardando">Sem pedido</StatusBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TabelaPainel>
          </div>
        )}
      </Drawer>

      {simulacaoLoteId && <SimulacaoLoteDrawer loteId={simulacaoLoteId} onClose={() => setSimulacaoLoteId(null)} />}
    </div>
  );
}
