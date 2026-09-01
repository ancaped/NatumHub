import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { PurchaseRequestBatch, PurchaseRequestBatchDetail, PurchaseRequestBatchItem } from '../../../geral/lib/types';
import { 
  ClipboardList, Search, RefreshCw, Printer, CheckCircle2, Clock, 
  AlertCircle, ChevronDown, ChevronRight, Eye, Trash2, Edit3, Check, 
  X, Layers, Boxes, Palette, Tag, Package, ExternalLink, Calendar, User, FileText, Settings
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';

interface ListasAcompanhamentoTabProps {
  active?: boolean;
  mode?: string;
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

export function ListasAcompanhamentoTab({ active = true, mode = 'all' }: ListasAcompanhamentoTabProps) {
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
        status: statusFilter === 'ALL' ? undefined : statusFilter,
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
  }, [active, moduleFilter, statusFilter]);

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

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      alert('Não foi possível iniciar a impressão.');
      document.body.removeChild(iframe);
      return;
    }

    const rowsHtml = items.map(item => {
      const currentAvg = item.overallAvgAtTime || 0;
      const daily = currentAvg / 30.0;
      const itemTargetDays = item.targetDaysAtTime || 90;
      const itemTriggerDays = item.triggerDaysAtTime || 30;
      const futureStock = item.futureStockAtTime || 0;
      const qty = item.quantityRequested || 0;
      const postStock = Math.max(0, futureStock + qty);
      const postDuration = daily > 0 ? Math.round(postStock / daily) : 9999;
      const currentDuration = daily > 0 ? Math.round(futureStock / daily) : 9999;
      const sim = item.simProducaoAtTime || 0;

      const cellsHtml = columnOrder.map(colKey => {
        if (!columns[colKey]) return '';

        if (colKey === 'itemCode') {
          return `
            <td style="font-family: monospace; font-size: 10px;">${item.itemCode || '-'}</td>
            <td style="text-align: left; font-weight: 500; font-size: 10px;">
              ${item.itemDescription || '-'}
              ${item.supplierName ? `<span style="font-size: 8px; color: #6b7280; display: block;">Fornec. sugerido: ${item.supplierName}</span>` : ''}
              ${item.observacao ? `<div style="font-size: 8px; color: #b45309; font-style: italic;">Obs: ${item.observacao}</div>` : ''}
            </td>
          `;
        }
        if (colKey === 'currentStock') {
          return `<td style="text-align: right;">${item.currentStockAtTime.toLocaleString('pt-BR')} ${item.unit || ''}</td>`;
        }
        if (colKey === 'overallAvg') {
          return `<td style="text-align: right;">${Math.round(currentAvg).toLocaleString('pt-BR')} ${item.unit || ''}</td>`;
        }
        if (colKey === 'simProducao') {
          return `<td style="text-align: right;">${sim > 0 ? sim.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '-'}</td>`;
        }
        if (colKey === 'futureStockForecast') {
          return `<td style="text-align: right;">${futureStock.toLocaleString('pt-BR')} ${item.unit || ''}</td>`;
        }
        if (colKey === 'estimatedDurationDays') {
          return `
            <td style="text-align: center; font-weight: ${currentDuration < itemTriggerDays ? 'bold' : 'normal'}; color: ${currentDuration < itemTriggerDays ? '#b91c1c' : '#374151'};">
              ${currentDuration === 9999 ? '9999+' : `${currentDuration} dias`}
            </td>
          `;
        }
        if (colKey === 'triggerDays') {
          return `<td style="text-align: center; font-size: 9px;">${item.triggerDaysAtTime !== undefined && item.triggerDaysAtTime !== null ? `${item.triggerDaysAtTime}d` : '-'}</td>`;
        }
        if (colKey === 'targetDays') {
          return `<td style="text-align: center; font-size: 9px; font-weight: bold;">${item.targetDaysAtTime !== undefined && item.targetDaysAtTime !== null ? `${item.targetDaysAtTime}d` : '90d'}</td>`;
        }
        if (colKey === 'recommendedQty') {
          return `
            <td style="text-align: right; font-weight: bold; background-color: #f4f4f5;">
              <div>${qty > 0 ? `${qty.toLocaleString('pt-BR')} ${item.unit || ''}` : '-'}</div>
              <div style="font-size: 8px; color: ${postDuration < itemTriggerDays ? '#b91c1c' : postDuration < itemTargetDays ? '#b45309' : '#047857'}; font-weight: normal; margin-top: 2px; text-align: right;">
                Pós: ${postDuration === 9999 ? '∞' : `${postDuration}d`}
              </div>
            </td>
          `;
        }
        return '';
      }).join('');

      return `<tr>${cellsHtml}</tr>`;
    }).join('');

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

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle} — ${batch.loteNumero}</title>
        <meta charset="utf-8">
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm 10mm 15mm 10mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1f2937;
            background-color: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 10px;
            line-height: 1.4;
          }
          header {
            margin-bottom: 16px;
            border-bottom: 2px solid #111827;
            padding-bottom: 8px;
          }
          .title-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .header-title {
            font-size: 16px;
            font-weight: 800;
            color: #111827;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .lote-badge {
            background: #111827;
            color: #ffffff;
            font-weight: 800;
            font-size: 13px;
            padding: 4px 10px;
            border-radius: 6px;
            font-family: monospace;
          }
          .header-meta {
            display: flex;
            justify-content: space-between;
            color: #4b5563;
            font-size: 9px;
            margin-top: 6px;
          }
          .meta-group {
            display: flex;
            gap: 15px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          th {
            background-color: #f3f4f6;
            border-bottom: 1px solid #d1d5db;
            border-top: 1px solid #d1d5db;
            padding: 5px 6px;
            font-weight: 700;
            color: #374151;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          td {
            border-bottom: 1px solid #e5e7eb;
            padding: 5px 6px;
            vertical-align: middle;
            font-size: 9px;
          }
          tfoot {
            display: table-footer-group;
          }
          .signatures {
            margin-top: 45px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .sig-box {
            width: 42%;
            text-align: center;
          }
          .sig-line {
            border-top: 1px solid #9ca3af;
            margin-top: 30px;
            margin-bottom: 4px;
          }
          .sig-label {
            font-size: 9px;
            color: #6b7280;
            font-weight: bold;
            text-transform: uppercase;
          }
          .footer-note {
            margin-top: 15px;
            font-size: 8.5px;
            color: #6b7280;
            border-top: 1px dashed #d1d5db;
            padding-top: 6px;
            display: flex;
            justify-content: space-between;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <header>
          <div class="title-container">
            <div class="header-title">${reportTitle}</div>
            <div class="lote-badge">${batch.loteNumero}</div>
          </div>
          <div class="header-meta">
            <div class="meta-group">
              <div><strong>Gerado em:</strong> ${createdAtFormatted}</div>
              <div><strong>Itens no Relatório:</strong> ${items.length}</div>
              <div><strong>Solicitante:</strong> ${batch.createdBy || 'Sistema'}</div>
              <div><strong>Objetivos de Estoque:</strong> Calculados por subcategoria</div>
            </div>
            <div><strong>Ambiente Industrial Nexus</strong></div>
          </div>
          ${batch.observacoes ? `<div style="margin-top: 6px; font-size: 9px; color: #374151; background: #f9fafb; padding: 4px 8px; border-radius: 4px; border-left: 3px solid #111827;"><strong>Observações:</strong> ${batch.observacoes}</div>` : ''}
        </header>

        <table>
          <thead>
            <tr>
              ${columnOrder.map(colKey => {
                if (!columns[colKey]) return '';
                const meta = COLUMN_METADATA[colKey];
                if (colKey === 'itemCode') {
                  return `
                    <th style="text-align: left; width: 65px;">Ref</th>
                    <th style="text-align: left;">Descrição do Insumo</th>
                  `;
                }
                return `<th style="text-align: ${meta.align};">${meta.label}</th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="signatures">
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Solicitante ${batch.createdBy ? `(${batch.createdBy})` : ''}</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Comprador / Lançamento ERP</div>
          </div>
        </div>

        <div class="footer-note">
          <div>* Metas e pontos de disparo são calculados conforme a subcategoria/insumo definido no sistema. Rastreado sob ${batch.loteNumero}.</div>
          <div>Página 1 de 1</div>
        </div>
      </body>
      </html>
    `;

    doc.open();
    doc.write(printHtml);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
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
  }, [batches, search]);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-12.25rem)] animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="text-left">
          <h3 className="font-extrabold text-zinc-900 text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-zinc-800" />
            Acompanhamento de Solicitações & Lotes de Compras
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Rastreamento de listas enviadas, status de atendimento e cruzamento automático com pedidos de compra do ERP.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowColumnConfig(!showColumnConfig)}
            className={cn(
              "text-xs border px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs",
              showColumnConfig 
                ? "bg-zinc-900 text-white border-zinc-900" 
                : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 bg-white"
            )}
            title="Escolher quais colunas serão impressas no relatório"
          >
            <Settings className="h-3.5 w-3.5" />
            Configurar Colunas de Impressão
          </button>

          <button 
            onClick={loadBatches} 
            disabled={loading}
            className="text-xs border border-zinc-200 text-zinc-700 px-3.5 py-2 rounded-lg font-bold hover:bg-zinc-50 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Atualizar
          </button>
        </div>
      </div>

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
        <div 
          onClick={() => setStatusFilter('ALL')}
          className={cn(
            "bg-white p-3 rounded-xl border shadow-2xs cursor-pointer transition-all text-left",
            statusFilter === 'ALL' ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300"
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total de Lotes</div>
          <div className="text-xl font-extrabold text-zinc-900 mt-0.5">{kpis.total}</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Listas emitidas</div>
        </div>

        <div 
          onClick={() => setStatusFilter('pendente')}
          className={cn(
            "bg-amber-50/50 p-3 rounded-xl border shadow-2xs cursor-pointer transition-all text-left",
            statusFilter === 'pendente' ? "border-amber-600 ring-1 ring-amber-600" : "border-amber-200 hover:border-amber-300"
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Aguardando Pedido ERP
          </div>
          <div className="text-xl font-extrabold text-amber-900 mt-0.5">{kpis.pendentes}</div>
          <div className="text-[10px] text-amber-700 mt-0.5">Sem pedido lançado</div>
        </div>

        <div 
          onClick={() => setStatusFilter('parcial')}
          className={cn(
            "bg-blue-50/50 p-3 rounded-xl border shadow-2xs cursor-pointer transition-all text-left",
            statusFilter === 'parcial' ? "border-blue-600 ring-1 ring-blue-600" : "border-blue-200 hover:border-blue-300"
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Parcialmente Comprado
          </div>
          <div className="text-xl font-extrabold text-blue-900 mt-0.5">{kpis.parciais}</div>
          <div className="text-[10px] text-blue-700 mt-0.5">Parte com pedido ERP</div>
        </div>

        <div 
          onClick={() => setStatusFilter('atendido')}
          className={cn(
            "bg-teal-50/50 p-3 rounded-xl border shadow-2xs cursor-pointer transition-all text-left",
            statusFilter === 'atendido' ? "border-teal-600 ring-1 ring-teal-600" : "border-teal-200 hover:border-teal-300"
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-teal-700 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Pedidos Lançados
          </div>
          <div className="text-xl font-extrabold text-teal-900 mt-0.5">{kpis.atendidos}</div>
          <div className="text-[10px] text-teal-700 mt-0.5">Todos itens com pedido</div>
        </div>

        <div 
          onClick={() => setStatusFilter('concluido')}
          className={cn(
            "bg-emerald-50/50 p-3 rounded-xl border shadow-2xs cursor-pointer transition-all text-left",
            statusFilter === 'concluido' ? "border-emerald-600 ring-1 ring-emerald-600" : "border-emerald-200 hover:border-emerald-300"
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
            <Package className="h-3 w-3" /> Concluídos
          </div>
          <div className="text-xl font-extrabold text-emerald-900 mt-0.5">{kpis.concluidos}</div>
          <div className="text-[10px] text-emerald-700 mt-0.5">Mercadorias entregues</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar por lote, item, título ou observação..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            />
          </div>
          <span className="text-xs text-zinc-500 font-semibold">{filteredBatches.length} lotes encontrados</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Módulo Filter */}
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-lg">
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'materia_prima', label: 'Matéria-Prima' },
              { id: 'embalagens', label: 'Embalagens' },
              { id: 'coloracao', label: 'Coloração' },
              { id: 'apoio', label: 'Apoio' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setModuleFilter(m.id)}
                className={cn(
                  "px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer",
                  moduleFilter === m.id ? "bg-white text-zinc-900 shadow-2xs" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-white border border-zinc-200 text-xs rounded-lg px-2.5 py-1.5 font-bold text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
          >
            <option value="ALL">Status: Todos</option>
            <option value="pendente">Aguardando Pedido ERP</option>
            <option value="parcial">Parcialmente Comprado</option>
            <option value="atendido">Todos Pedidos Lançados</option>
            <option value="concluido">Concluídos</option>
            <option value="cancelado">Cancelados</option>
          </select>
        </div>
      </div>

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
                  <div key={batch.id} className="transition-colors hover:bg-zinc-50/40">
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
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="h-3 w-3" /> Aguardando Pedido no ERP
                            </span>
                          )}
                          {batch.status === 'parcial' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                              <RefreshCw className="h-3 w-3" /> Parcialmente Lançado ({batch.itemsWithOrder}/{batch.totalItems})
                            </span>
                          )}
                          {batch.status === 'atendido' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                              <CheckCircle2 className="h-3 w-3" /> Pedidos ERP Lançados
                            </span>
                          )}
                          {batch.status === 'concluido' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <Package className="h-3 w-3" /> Concluído / Entregue
                            </span>
                          )}
                          {batch.status === 'cancelado' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                              <X className="h-3 w-3" /> Cancelado
                            </span>
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
                                    <th className="py-2 px-3">Status no ERP</th>
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

                                        {/* Status ERP */}
                                        <td className="py-2.5 px-3">
                                          {hasOrder ? (
                                            <div>
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                                                <Package className="h-3 w-3" /> Pedido ERP #{item.erpPedidoNumero}
                                              </span>
                                              <div className="text-[10px] text-zinc-500 mt-0.5">
                                                Qtd Comprada: <strong>{item.erpPedidoQtd?.toLocaleString('pt-BR')}</strong> {item.unit}
                                                {item.erpPedidoChegou !== undefined && item.erpPedidoChegou !== null && item.erpPedidoChegou > 0 && (
                                                  <span className="text-emerald-700 ml-1">
                                                    (Entregue: {item.erpPedidoChegou.toLocaleString('pt-BR')})
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                              <Clock className="h-3 w-3" /> Aguardando Pedido no ERP
                                            </span>
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
