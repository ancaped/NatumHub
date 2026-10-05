import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../geral/lib/api';
import { DemandResult } from '../../../geral/lib/types';
import { Trash2, Printer, Search, Plus, FileText, RefreshCw, X, Package, Settings, Layers, Tag, CheckCircle2, ClipboardList, Check } from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import { getAuthUser } from '../../../geral/lib/auth';


const COLUMN_METADATA: Record<string, { label: string; align: 'left' | 'center' | 'right' }> = {
  itemCode: { label: 'Ref / Item', align: 'left' },
  lastSupplierInvoice: { label: 'Últ. NF', align: 'left' },
  lastSupplierOrder: { label: 'Últ. Pedido', align: 'left' },
  currentStock: { label: 'Estoque', align: 'right' },
  overallAvg: { label: 'Média Mês', align: 'right' },
  simProducao: { label: 'Sim. Produção', align: 'right' },
  futureStockForecast: { label: 'Prev. Futura', align: 'right' },
  estimatedDurationDays: { label: 'Duração Est.', align: 'center' },
  triggerDays: { label: 'Disp.', align: 'center' },
  targetDays: { label: 'Obj. (Meta)', align: 'center' },
  recommendedQty: { label: 'Qtd Recomendada', align: 'right' }
};

export function PrintListTab({ active = true, mode = 'all' }: { active?: boolean; mode?: string }) {
  const [printList, setPrintList] = useState<string[]>([]);
  const [demands, setDemands] = useState<DemandResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [manualQtys, setManualQtys] = useState<Record<string, number>>(() => {
    const stored = localStorage.getItem('natum_hub_print_list_manual_qtys');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  const [manualAvgs, setManualAvgs] = useState<Record<string, number>>(() => {
    const stored = localStorage.getItem('natum_hub_print_list_manual_avgs');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  const [columns, setColumns] = useState<Record<string, boolean>>({
    itemCode: true,
    lastSupplierInvoice: false,
    lastSupplierOrder: false,
    currentStock: true,
    overallAvg: true,
    simProducao: true,
    futureStockForecast: true,
    estimatedDurationDays: true,
    triggerDays: false,
    targetDays: false,
    recommendedQty: true
  });
  
  const [columnOrder, setColumnOrder] = useState<string[]>([
    'itemCode',
    'lastSupplierInvoice',
    'lastSupplierOrder',
    'currentStock',
    'overallAvg',
    'simProducao',
    'futureStockForecast',
    'estimatedDurationDays',
    'triggerDays',
    'targetDays',
    'recommendedQty'
  ]);

  // Load columnConfig & order from localStorage on mount
  useEffect(() => {
    const storedOrder = localStorage.getItem('natum_hub_print_list_column_order');
    if (storedOrder) {
      try {
        const parsed = JSON.parse(storedOrder);
        let newOrder = [...parsed];
        if (!newOrder.includes('triggerDays')) {
          const idx = newOrder.indexOf('recommendedQty');
          if (idx !== -1) {
            newOrder.splice(idx, 0, 'triggerDays');
          } else {
            newOrder.push('triggerDays');
          }
        }
        if (!newOrder.includes('targetDays')) {
          const idx = newOrder.indexOf('recommendedQty');
          if (idx !== -1) {
            newOrder.splice(idx, 0, 'targetDays');
          } else {
            newOrder.push('targetDays');
          }
        }
        if (!newOrder.includes('simProducao')) {
          const idx = newOrder.indexOf('futureStockForecast');
          if (idx !== -1) {
            newOrder.splice(idx, 0, 'simProducao');
          } else {
            newOrder.push('simProducao');
          }
        }
        setColumnOrder(newOrder);
      } catch (e) {
        console.error(e);
      }
    }
    const storedConfig = localStorage.getItem('natum_hub_print_list_column_config');
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig);
        setColumns({
          triggerDays: true,
          targetDays: true,
          ...parsed,
          simProducao: parsed.simProducao !== undefined ? parsed.simProducao : true,
        });
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const saveColumnOrder = (newOrder: string[]) => {
    setColumnOrder(newOrder);
    localStorage.setItem('natum_hub_print_list_column_order', JSON.stringify(newOrder));
  };

  const saveColumnConfig = (newConfig: Record<string, boolean>) => {
    setColumns(newConfig);
    localStorage.setItem('natum_hub_print_list_column_config', JSON.stringify(newConfig));
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...columnOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    saveColumnOrder(newOrder);
  };

  const handleUpdateManualQty = (code: string, qty: number | '') => {
    const newQtys = { ...manualQtys };
    if (qty === '') {
      delete newQtys[code];
    } else {
      newQtys[code] = qty;
    }
    setManualQtys(newQtys);
    localStorage.setItem('natum_hub_print_list_manual_qtys', JSON.stringify(newQtys));
  };

  const handleUpdateManualAvg = (code: string, avg: number | '') => {
    const newAvgs = { ...manualAvgs };
    if (avg === '') {
      delete newAvgs[code];
    } else {
      newAvgs[code] = avg;
    }
    setManualAvgs(newAvgs);
    localStorage.setItem('natum_hub_print_list_manual_avgs', JSON.stringify(newAvgs));
  };

  const resolveRootCategory = (catId: string | null) => {
    if (!catId) return null;
    let current = catId;
    let visited = new Set<string>();
    visited.add(current);
    while (true) {
      const cat = categories.find(c => c.id === current);
      if (cat && cat.parentId && !visited.has(cat.parentId)) {
        current = cat.parentId;
        visited.add(current);
      } else {
        break;
      }
    }
    return current;
  };
  
  // Manual adding search states
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addItemSearch, setAddItemSearch] = useState('');

  const syncPrintListFromStorage = () => {
    const stored = localStorage.getItem('natum_hub_print_list');
    if (stored) {
      try {
        setPrintList(JSON.parse(stored));
      } catch (e) {
        console.error("Error parsing print list:", e);
      }
    } else {
      setPrintList([]);
    }
  };

  // Load all demands respecting individual category/subcategory target days
  const loadDemands = async () => {
    setLoading(true);
    try {
      // Backend automatically resolves target_days and trigger_days per subcategory/item
      const results = await api.getDemands();
      setDemands(results);
    } catch (e) {
      console.error("Error loading demands for print list:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncPrintListFromStorage();
    api.getCategories().then(setCategories).catch(console.error);
    if (active) {
      loadDemands();
    }
  }, [active, mode]);

  // Sync with external events and storage updates
  useEffect(() => {
    const handleStorageChange = () => {
      syncPrintListFromStorage();
    };
    const handleConfigUpdate = () => {
      loadDemands();
      api.getCategories().then(setCategories).catch(console.error);
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('compras_config_updated', handleConfigUpdate);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('compras_config_updated', handleConfigUpdate);
    };
  }, []);

  // Save print list to localStorage on changes
  const savePrintList = (newList: string[]) => {
    setPrintList(newList);
    localStorage.setItem('natum_hub_print_list', JSON.stringify(newList));
    window.dispatchEvent(new Event('storage'));
  };

  // Filter print list items currently listed
  const selectedDemands = useMemo(() => {
    const lookup = new Set(printList.map(c => c.replace(/\./g, '')));
    let result = demands.filter(d => lookup.has((d.itemCode || '').replace(/\./g, '')));
    
    // Mode-specific category isolation
    if (mode === 'materia_prima') {
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_mp' || (d.itemCode && d.itemCode.startsWith('9.15.')));
    } else if (mode === 'embalagens') {
      result = result.filter(d => {
        const root = resolveRootCategory(d.categoryId);
        return root === 'cat_emb' || root === 'cat_mat' || (d.itemCode && (d.itemCode.startsWith('08.') || (!d.itemCode.startsWith('9.15.') && d.itemCode.startsWith('9.'))));
      });
    } else if (mode === 'coloracao') {
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_coloracao' || (d.itemCode && d.itemCode.replace(/\./g, '').startsWith('134')));
    } else if (mode === 'apoio') {
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_apoio' || (d.itemCode && d.itemCode.replace(/\./g, '').startsWith('130')));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(d => 
        (d.itemCode || '').toLowerCase().includes(q) || 
        (d.description || '').toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [demands, printList, search, mode, categories]);

  // Items available to add manually (not already in list)
  const availableItemsToAdd = useMemo(() => {
    const lookup = new Set(printList.map(c => c.replace(/\./g, '')));
    const q = addItemSearch.toLowerCase();
    
    let result = demands.filter(d => !lookup.has((d.itemCode || '').replace(/\./g, '')));

    // Mode-specific category isolation
    if (mode === 'materia_prima') {
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_mp' || (d.itemCode && d.itemCode.startsWith('9.15.')));
    } else if (mode === 'embalagens') {
      result = result.filter(d => {
        const root = resolveRootCategory(d.categoryId);
        return root === 'cat_emb' || root === 'cat_mat' || (d.itemCode && (d.itemCode.startsWith('08.') || (!d.itemCode.startsWith('9.15.') && d.itemCode.startsWith('9.'))));
      });
    } else if (mode === 'coloracao') {
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_coloracao' || (d.itemCode && d.itemCode.replace(/\./g, '').startsWith('134')));
    } else if (mode === 'apoio') {
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_apoio' || (d.itemCode && d.itemCode.replace(/\./g, '').startsWith('130')));
    }

    return result
      .filter(d => 
        (d.itemCode || '').toLowerCase().includes(q) || 
        (d.description || '').toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [demands, printList, addItemSearch, mode, categories]);

  const handleAddItem = (code: string) => {
    const cleanCode = code.replace(/\./g, '');
    if (printList.some(c => c.replace(/\./g, '') === cleanCode)) return;
    const newList = [...printList, code];
    savePrintList(newList);
    setAddItemSearch('');
    setShowAddMenu(false);
  };

  const handleRemoveItem = (code: string) => {
    const cleanCode = code.replace(/\./g, '');
    const newList = printList.filter(c => c.replace(/\./g, '') !== cleanCode);
    savePrintList(newList);
  };

  const handleClearList = () => {
    if (confirm("Tem certeza que deseja limpar toda a lista de impressão?")) {
      savePrintList([]);
    }
  };

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchTitle, setBatchTitle] = useState('');
  const [batchNotes, setBatchNotes] = useState('');
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [lastGeneratedLote, setLastGeneratedLote] = useState<string | null>(null);

  const handlePrint = (customLoteNumero?: string, customTitle?: string) => {
    if (selectedDemands.length === 0) {
      alert("A lista está vazia ou os itens filtrados não correspondem.");
      return;
    }

    let reportTitle = customTitle || (
      mode === 'materia_prima' ? 'Relatório de Compras — Matéria-Prima' :
      mode === 'embalagens' ? 'Relatório de Compras — Embalagens' :
      mode === 'coloracao' ? 'Relatório de Compras — Coloração' :
      mode === 'apoio' ? 'Relatório de Compras — Material de Apoio' :
      'Relatório de Compras'
    );

    // Create hidden iframe
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
      alert("Não foi possível iniciar a impressão.");
      document.body.removeChild(iframe);
      return;
    }
    
    const today = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const rowsHtml = selectedDemands.map(item => {
      const currentAvg = manualAvgs[item.itemCode] !== undefined ? manualAvgs[item.itemCode] : item.overallAvg;
      const daily = currentAvg / 30.0;
      const itemTargetDays = item.target_days || 90;
      const calcTargetStock = itemTargetDays * daily;
      const futureStock = item.futureStockForecast || 0;
      const autoRec = Math.max(0, Math.round(calcTargetStock - futureStock));
      const qty = manualQtys[item.itemCode] !== undefined ? manualQtys[item.itemCode] : (item.recommendedQty !== undefined ? Math.round(item.recommendedQty) : autoRec);
      const postStock = Math.max(0, futureStock + qty);
      const postDuration = daily > 0 ? Math.round(postStock / daily) : 9999;
      const currentDuration = daily > 0 ? Math.round(futureStock / daily) : 9999;

      const cellsHtml = columnOrder.map(colKey => {
        if (!columns[colKey]) return '';
        
        if (colKey === 'itemCode') {
          return `
            <td style="font-family: monospace; font-size: 10px;">${item.itemCode || '-'}</td>
            <td style="text-align: left; font-weight: 500; font-size: 10px;">
              ${item.description || '-'}
              ${item.category_name ? `<span style="font-size: 8px; color: #6b7280; display: block;">${item.category_name}</span>` : ''}
            </td>
          `;
        }
        if (colKey === 'lastSupplierInvoice') {
          return `<td style="text-align: left; font-size: 9px; max-width: 120px; white-space: normal;">${item.lastSupplierInvoice || '-'}</td>`;
        }
        if (colKey === 'lastSupplierOrder') {
          return `<td style="text-align: left; font-size: 9px; max-width: 120px; white-space: normal;">${item.lastSupplierOrder || '-'}</td>`;
        }
        if (colKey === 'currentStock') {
          return `<td style="text-align: right;">${item.currentStock.toLocaleString('pt-BR')} ${item.unit || ''}</td>`;
        }
        if (colKey === 'overallAvg') {
          return `<td style="text-align: right;">${currentAvg.toLocaleString('pt-BR')} ${item.unit || ''}</td>`;
        }
        if (colKey === 'simProducao') {
          const sim = item.simProducao ?? 0;
          return `<td style="text-align: right;">${sim > 0 ? sim.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '-'}</td>`;
        }
        if (colKey === 'futureStockForecast') {
          return `<td style="text-align: right;">${item.futureStockForecast.toLocaleString('pt-BR')} ${item.unit || ''}</td>`;
        }
        if (colKey === 'estimatedDurationDays') {
          return `
            <td style="text-align: center; font-weight: ${currentDuration < (item.trigger_days || 30) ? 'bold' : 'normal'}; color: ${currentDuration < (item.trigger_days || 30) ? '#b91c1c' : '#374151'};">
              ${currentDuration === 9999 ? '9999+' : `${currentDuration} dias`}
            </td>
          `;
        }
        if (colKey === 'triggerDays') {
          return `<td style="text-align: center; font-size: 9px;">${item.trigger_days !== undefined ? `${item.trigger_days}d` : '-'}</td>`;
        }
        if (colKey === 'targetDays') {
          return `<td style="text-align: center; font-size: 9px; font-weight: bold;">${item.target_days !== undefined ? `${item.target_days}d` : '90d'}</td>`;
        }
        if (colKey === 'recommendedQty') {
          return `
            <td style="text-align: right; font-weight: bold; background-color: #f4f4f5;">
              <div>${qty > 0 ? `${qty.toLocaleString('pt-BR')} ${item.unit || ''}` : '-'}</div>
              <div style="font-size: 8px; color: ${postDuration < (item.trigger_days || 30) ? '#b91c1c' : postDuration < itemTargetDays ? '#b45309' : '#047857'}; font-weight: normal; margin-top: 2px; text-align: right;">
                Pós: ${postDuration === 9999 ? '∞' : `${postDuration}d`}
              </div>
            </td>
          `;
        }
        return '';
      }).join('');
      
      return `<tr>${cellsHtml}</tr>`;
    }).join('');
    
    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle}${customLoteNumero ? ` — ${customLoteNumero}` : ''}</title>
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
            ${customLoteNumero ? `<div class="lote-badge">${customLoteNumero}</div>` : ''}
          </div>
          <div class="header-meta">
            <div class="meta-group">
              <div><strong>Gerado em:</strong> ${today}</div>
              <div><strong>Itens no Relatório:</strong> ${selectedDemands.length}</div>
              <div><strong>Objetivos de Estoque:</strong> Calculados por subcategoria</div>
            </div>
            <div><strong>Ambiente Industrial Nexus</strong></div>
          </div>
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
            <div class="sig-label">Solicitante</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Comprador / Lançamento ERP</div>
          </div>
        </div>

        <div class="footer-note">
          <div>* Metas e pontos de disparo são calculados conforme a subcategoria/insumo definido no sistema. ${customLoteNumero ? `Rastreado sob ${customLoteNumero}.` : ''}</div>
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

  const handleGenerateBatch = async () => {
    if (selectedDemands.length === 0) {
      alert("A lista está vazia ou os itens filtrados não correspondem.");
      return;
    }
    setBatchGenerating(true);
    try {
      const authUser = getAuthUser();
      const items = selectedDemands.map(item => {
        const currentAvg = manualAvgs[item.itemCode] !== undefined ? manualAvgs[item.itemCode] : item.overallAvg;
        const daily = currentAvg / 30.0;
        const itemTargetDays = item.target_days || 90;
        const itemTriggerDays = item.trigger_days || 30;
        const calcTargetStock = itemTargetDays * daily;
        const futureStock = item.futureStockForecast || 0;
        const autoRec = Math.max(0, Math.round(calcTargetStock - futureStock));
        const qty = manualQtys[item.itemCode] !== undefined ? manualQtys[item.itemCode] : (item.recommendedQty !== undefined ? Math.round(item.recommendedQty) : autoRec);
        
        return {
          itemCode: item.itemCode,
          itemDescription: item.description,
          unit: item.unit || 'UN',
          quantityRequested: qty,
          currentStockAtTime: item.currentStock,
          overallAvgAtTime: currentAvg,
          simProducaoAtTime: item.simProducao || 0,
          futureStockAtTime: item.futureStockForecast || 0,
          targetDaysAtTime: itemTargetDays,
          triggerDaysAtTime: itemTriggerDays,
          supplierName: item.lastSupplierInvoice || item.lastSupplierOrder || null,
          observacao: null,
        };
      });

      const res = await api.createPurchaseList({
        modulo: mode === 'all' ? 'geral' : mode,
        titulo: batchTitle.trim() || undefined,
        observacoes: batchNotes.trim() || undefined,
        createdBy: authUser?.displayName || 'Responsável Compras',
        items,
      });

      // Imprime a via oficial com o LOTE
      handlePrint(res.batch.loteNumero, res.batch.titulo || undefined);

      // Limpa lista de rascunho
      savePrintList([]);
      setShowBatchModal(false);
      setBatchTitle('');
      setBatchNotes('');
      setLastGeneratedLote(res.batch.loteNumero);

      window.dispatchEvent(new Event('compras_solicitacoes_updated'));
      window.dispatchEvent(new Event('storage'));
    } catch (e: any) {
      console.error('Erro ao gerar lote de solicitação:', e);
      alert(e?.message || 'Erro ao gerar lote de solicitação.');
    } finally {
      setBatchGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-12.25rem)] animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="text-left">
          <h3 className="font-extrabold text-zinc-900 text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-zinc-800" />
            Lista de Impressão — {mode === 'materia_prima' ? 'Matéria-Prima' : mode === 'embalagens' ? 'Embalagens' : mode === 'coloracao' ? 'Coloração' : mode === 'apoio' ? 'Material de Apoio' : 'Geral'}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Gere lotes identificados de compra (ex: LOTE #001) para acompanhamento automático com os pedidos lançados no ERP.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button 
            onClick={handleClearList} 
            disabled={printList.length === 0} 
            className="text-xs border border-zinc-200 text-zinc-600 px-3.5 py-2 rounded-lg font-bold hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Limpar Rascunho
          </button>
          <button 
            onClick={() => handlePrint()} 
            disabled={selectedDemands.length === 0} 
            className="text-xs border border-zinc-200 text-zinc-700 px-3.5 py-2 rounded-lg font-bold hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <Printer className="h-4 w-4" />
            Apenas Imprimir
          </button>
          <button 
            onClick={() => setShowBatchModal(true)} 
            disabled={selectedDemands.length === 0} 
            className="text-xs bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            Gerar Lote de Solicitação ({selectedDemands.length})
          </button>
        </div>
      </div>

      {lastGeneratedLote && (
        <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex justify-between items-center text-xs text-emerald-900 animate-in fade-in shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>
              Lote <strong>{lastGeneratedLote}</strong> gerado com sucesso! Acompanhe o lançamento dos pedidos pelo setor na aba <strong>Acompanhamento</strong>.
            </span>
          </div>
          <button onClick={() => setLastGeneratedLote(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Modal Gerar Lote */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 cursor-pointer" onClick={() => !batchGenerating && setShowBatchModal(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-zinc-200 z-10 text-left animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-zinc-900" />
                <h3 className="font-extrabold text-zinc-900 text-base">Gerar Lote de Solicitação</h3>
              </div>
              <button 
                onClick={() => !batchGenerating && setShowBatchModal(false)} 
                className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 mb-4">
              Esta ação criará um número de lote oficial (ex: LOTE #001) para os <strong>{selectedDemands.length} itens</strong> desta lista, congelando as quantidades e estoques para acompanhamento com o ERP.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Título / Identificador Opcional
                </label>
                <input
                  type="text"
                  placeholder="Ex: Solicitação Semanal, Urgência Fornecedor X..."
                  value={batchTitle}
                  onChange={e => setBatchTitle(e.target.value)}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs text-zinc-800 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Observações / Justificativas
                </label>
                <textarea
                  placeholder="Observações adicionais para o setor de compras ou diretoria..."
                  value={batchNotes}
                  onChange={e => setBatchNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs text-zinc-800 focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={batchGenerating}
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={batchGenerating}
                onClick={handleGenerateBatch}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {batchGenerating ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Gerando Lote...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" /> Confirmar e Imprimir Lote
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Column Customization & Reordering Panel */}
      <div className="bg-white px-4 py-3 rounded-xl border border-zinc-200 shadow-sm flex flex-col gap-3 shrink-0">
        <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
          <Settings className="h-4 w-4 text-zinc-400" /> Colunas do Relatório & Ordem de Exibição:
        </span>
        <div className="flex flex-wrap items-center gap-2.5">
          {columnOrder.map((colKey, idx) => {
            const meta = COLUMN_METADATA[colKey];
            return (
              <div key={colKey} className="bg-zinc-50 px-2.5 py-1.5 border border-zinc-200 rounded-lg flex items-center gap-2 shadow-2xs text-xs">
                <input 
                  type="checkbox" 
                  checked={columns[colKey]} 
                  onChange={e => saveColumnConfig({ ...columns, [colKey]: e.target.checked })} 
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-3.5 w-3.5 cursor-pointer"
                />
                <span className="font-semibold text-zinc-800">{meta.label}</span>
                <div className="flex items-center gap-0.5 border-l border-zinc-200 pl-1.5 ml-0.5">
                  <button
                    onClick={() => handleMoveColumn(idx, 'up')}
                    disabled={idx === 0}
                    className="p-0.5 hover:bg-zinc-200 rounded disabled:opacity-30 text-[10px] cursor-pointer"
                    title="Mover para esquerda"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => handleMoveColumn(idx, 'down')}
                    disabled={idx === columnOrder.length - 1}
                    className="p-0.5 hover:bg-zinc-200 rounded disabled:opacity-30 text-[10px] cursor-pointer"
                    title="Mover para direita"
                  >
                    ▶
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 overflow-hidden relative">
        <div className="flex-1 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col min-h-0">
          {/* Action Sub-header */}
          <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex justify-between items-center gap-4 shrink-0 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filtrar por código ou descrição..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                />
              </div>
              <span className="text-xs text-zinc-500 font-semibold">{selectedDemands.length} itens listados</span>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar Insumo à Lista
              </button>

              {showAddMenu && (
                <div className="absolute right-0 mt-2 w-96 bg-white border border-zinc-200 rounded-xl shadow-2xl z-50 p-3 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-zinc-100">
                    <span className="text-xs font-bold text-zinc-800">Pesquisar Insumo para Adicionar</span>
                    <button onClick={() => setShowAddMenu(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Digite código ou nome do insumo..."
                    value={addItemSearch}
                    onChange={e => setAddItemSearch(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none mb-2"
                  />
                  <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100">
                    {availableItemsToAdd.length === 0 ? (
                      <div className="py-6 text-center text-zinc-400 text-xs italic">
                        {addItemSearch ? 'Nenhum insumo encontrado.' : 'Digite para pesquisar insumos...'}
                      </div>
                    ) : (
                      availableItemsToAdd.map(d => (
                        <div
                          key={d.itemCode}
                          onClick={() => handleAddItem(d.itemCode)}
                          className="p-2 hover:bg-zinc-50 rounded-lg cursor-pointer flex justify-between items-center transition-colors text-left"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <span className="font-mono text-xs font-bold text-zinc-800 block">{d.itemCode}</span>
                            <span className="text-xs text-zinc-600 truncate block">{d.description}</span>
                            {d.category_name && (
                              <span className="text-[10px] text-zinc-400 block font-sans">
                                Subcategoria: {d.category_name} ({d.target_days || 90}d meta)
                              </span>
                            )}
                          </div>
                          <button className="text-xs bg-zinc-900 text-white px-2 py-1 rounded font-bold shrink-0">
                            +
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-full text-zinc-400 text-xs">Carregando itens...</div>
            ) : selectedDemands.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3 py-12">
                <Package className="h-10 w-10 text-zinc-300" />
                <p className="text-sm font-semibold">Nenhum insumo na Lista de Impressão</p>
                <p className="text-xs max-w-sm text-center text-zinc-400">
                  Adicione insumos a partir da tabela principal do módulo clicando em "Adicionar à Lista" ou use o botão "+ Adicionar Insumo" acima.
                </p>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10">
                  <tr>
                    {columnOrder.map(colKey => {
                      if (!columns[colKey]) return null;
                      const meta = COLUMN_METADATA[colKey];
                      return (
                        <th key={colKey} className={cn("py-2.5 px-3", meta.align === 'right' ? 'text-right' : meta.align === 'center' ? 'text-center' : 'text-left')}>
                          {meta.label}
                        </th>
                      );
                    })}
                    <th className="py-2.5 px-3 text-center w-12">Remover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150">
                  {selectedDemands.map(d => {
                    const currentAvg = manualAvgs[d.itemCode] !== undefined ? manualAvgs[d.itemCode] : d.overallAvg;
                    const daily = currentAvg / 30.0;
                    const itemTargetDays = d.target_days || 90;
                    const itemTriggerDays = d.trigger_days || 30;
                    const calcTargetStock = itemTargetDays * daily;
                    const futureStock = d.futureStockForecast || 0;
                    const autoRec = Math.max(0, Math.round(calcTargetStock - futureStock));
                    const qty = manualQtys[d.itemCode] !== undefined ? manualQtys[d.itemCode] : (d.recommendedQty !== undefined ? Math.round(d.recommendedQty) : autoRec);
                    const postStock = Math.max(0, futureStock + qty);
                    const postDuration = daily > 0 ? Math.round(postStock / daily) : 9999;
                    const currentDuration = daily > 0 ? Math.round(futureStock / daily) : 9999;

                    return (
                      <tr key={d.itemCode} className="hover:bg-zinc-50/70 transition-colors">
                        {columnOrder.map(colKey => {
                          if (!columns[colKey]) return null;

                          if (colKey === 'itemCode') {
                            return (
                              <td key={colKey} className="py-2.5 px-3">
                                <div className="font-mono text-xs font-bold text-zinc-900">{d.itemCode}</div>
                                <div className="text-xs text-zinc-700 font-medium truncate max-w-xs sm:max-w-md" title={d.description}>
                                  {d.description}
                                </div>
                                {d.category_name && (
                                  <span className="text-[10px] text-zinc-400 font-sans">
                                    {d.category_name}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (colKey === 'lastSupplierInvoice') {
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-xs text-zinc-600 max-w-[140px] truncate" title={d.lastSupplierInvoice || ''}>
                                {d.lastSupplierInvoice || '-'}
                              </td>
                            );
                          }
                          if (colKey === 'lastSupplierOrder') {
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-xs text-zinc-600 max-w-[140px] truncate" title={d.lastSupplierOrder || ''}>
                                {d.lastSupplierOrder || '-'}
                              </td>
                            );
                          }
                          if (colKey === 'currentStock') {
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-800">
                                {d.currentStock.toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-400 font-sans">{d.unit}</span>
                              </td>
                            );
                          }
                          if (colKey === 'overallAvg') {
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-right">
                                <input
                                  type="number"
                                  value={manualAvgs[d.itemCode] !== undefined ? manualAvgs[d.itemCode] : Math.round(d.overallAvg)}
                                  onChange={e => handleUpdateManualAvg(d.itemCode, e.target.value === '' ? '' : Number(e.target.value))}
                                  className={cn(
                                    "w-16 text-right text-xs font-mono font-semibold border rounded px-1.5 py-0.5 focus:ring-1 focus:ring-zinc-900 focus:outline-none",
                                    manualAvgs[d.itemCode] !== undefined ? "border-amber-400 bg-amber-50/50 text-amber-900" : "border-zinc-200 bg-white text-zinc-800"
                                  )}
                                  title={manualAvgs[d.itemCode] !== undefined ? "Média editada manualmente para esta lista" : "Média mensal projetada pelo sistema"}
                                />
                              </td>
                            );
                          }
                          if (colKey === 'simProducao') {
                            const sim = d.simProducao ?? 0;
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-right font-mono text-xs text-zinc-600">
                                {sim > 0 ? sim.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '-'}
                              </td>
                            );
                          }
                          if (colKey === 'futureStockForecast') {
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-right font-mono font-semibold text-zinc-800">
                                {d.futureStockForecast.toLocaleString('pt-BR')} <span className="text-[10px] text-zinc-400 font-sans">{d.unit}</span>
                              </td>
                            );
                          }
                          if (colKey === 'estimatedDurationDays') {
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-center">
                                <span className={cn(
                                  "font-mono font-bold text-xs px-2 py-0.5 rounded",
                                  currentDuration < itemTriggerDays ? "bg-red-50 text-red-700 border border-red-200" : currentDuration < itemTargetDays ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                )}>
                                  {currentDuration === 9999 ? '9999+' : `${currentDuration}d`}
                                </span>
                              </td>
                            );
                          }
                          if (colKey === 'triggerDays') {
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-center font-mono font-semibold text-zinc-600 text-xs">
                                {itemTriggerDays}d
                              </td>
                            );
                          }
                          if (colKey === 'targetDays') {
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-center font-mono font-bold text-blue-700 bg-blue-50/40 text-xs">
                                {itemTargetDays}d
                              </td>
                            );
                          }
                          if (colKey === 'recommendedQty') {
                            return (
                              <td key={colKey} className="py-2.5 px-3 text-right bg-zinc-50/60">
                                <div className="flex items-center justify-end gap-1">
                                  <input
                                    type="number"
                                    value={qty}
                                    onChange={e => handleUpdateManualQty(d.itemCode, e.target.value === '' ? '' : Number(e.target.value))}
                                    className={cn(
                                      "w-20 text-right font-mono font-bold text-xs border rounded px-2 py-1 focus:ring-1 focus:ring-zinc-900 focus:outline-none",
                                      manualQtys[d.itemCode] !== undefined ? "border-amber-400 bg-amber-50 text-amber-900" : "border-zinc-300 bg-white text-zinc-900"
                                    )}
                                    title={manualQtys[d.itemCode] !== undefined ? "Quantidade alterada manualmente" : `Calculada automaticamente para atingir a meta de ${itemTargetDays} dias`}
                                  />
                                  <span className="text-[10px] text-zinc-400 font-sans">{d.unit}</span>
                                </div>
                                <span className={cn(
                                  "text-[9px] block text-right mt-0.5 font-mono",
                                  postDuration < itemTriggerDays ? "text-red-600 font-bold" : postDuration < itemTargetDays ? "text-amber-600 font-bold" : "text-emerald-700 font-medium"
                                )}>
                                  Pós: {postDuration === 9999 ? '∞' : `${postDuration}d`}
                                </span>
                              </td>
                            );
                          }
                          return null;
                        })}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleRemoveItem(d.itemCode)}
                            className="text-zinc-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remover insumo da lista"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
