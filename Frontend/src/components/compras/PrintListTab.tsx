import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { DemandResult } from '../../types';
import { Trash2, Printer, Search, Plus, FileText, RefreshCw, X, Package, Settings, ShoppingCart } from 'lucide-react';
import { cn } from '../../lib/utils';
import { showToast, confirmDialog } from '../shared/feedback';

const COLUMN_METADATA: Record<string, { label: string; align: 'left' | 'center' | 'right' }> = {
  itemCode: { label: 'Ref / Item', align: 'left' },
  lastSupplierInvoice: { label: 'Últ. Fornecedor (NF)', align: 'left' },
  lastSupplierOrder: { label: 'Últ. Fornecedor (Pedido)', align: 'left' },
  currentStock: { label: 'Estoque', align: 'right' },
  overallAvg: { label: 'Média Mês', align: 'right' },
  futureStockForecast: { label: 'Prev. Futura', align: 'right' },
  estimatedDurationDays: { label: 'Duração Est.', align: 'center' },
  recommendedQty: { label: 'Qtd Recomendada', align: 'right' }
};

export function PrintListTab({ active = true, mode = 'all' }: { active?: boolean; mode?: string }) {
  const [printList, setPrintList] = useState<string[]>([]);
  const [demands, setDemands] = useState<DemandResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetDays, setTargetDays] = useState(90);
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

  const [columns, setColumns] = useState<Record<string, boolean>>({
    itemCode: true,
    lastSupplierInvoice: false,
    lastSupplierOrder: false,
    currentStock: true,
    overallAvg: true,
    futureStockForecast: true,
    estimatedDurationDays: true,
    recommendedQty: true
  });
  
  const [columnOrder, setColumnOrder] = useState<string[]>([
    'itemCode',
    'lastSupplierInvoice',
    'lastSupplierOrder',
    'currentStock',
    'overallAvg',
    'futureStockForecast',
    'estimatedDurationDays',
    'recommendedQty'
  ]);

  // Load columnConfig & order from localStorage on mount
  useEffect(() => {
    const storedOrder = localStorage.getItem('natum_hub_print_list_column_order');
    if (storedOrder) {
      try { setColumnOrder(JSON.parse(storedOrder)); } catch (e) { console.error(e); }
    }
    const storedConfig = localStorage.getItem('natum_hub_print_list_column_config');
    if (storedConfig) {
      try { setColumns(JSON.parse(storedConfig)); } catch (e) { console.error(e); }
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

  // Load categories on mount
  useEffect(() => {
    api.getCategories().then(setCategories).catch(console.error);
  }, []);

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

  // Load print list from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('natum_hub_print_list');
    if (stored) {
      try {
        setPrintList(JSON.parse(stored));
      } catch (e) {
        console.error("Error parsing print list:", e);
      }
    }
  }, []);

  // Save print list to localStorage on changes
  const savePrintList = (newList: string[]) => {
    setPrintList(newList);
    localStorage.setItem('natum_hub_print_list', JSON.stringify(newList));
    // Dispatch a storage event so other tabs/components sync instantly
    window.dispatchEvent(new Event('storage'));
  };

  // Load all demands so we have calculations and description matching
  const loadDemands = async () => {
    setLoading(true);
    try {
      // Fetching all demands with the active meta days
      const results = await api.getDemands(undefined, targetDays);
      setDemands(results);
    } catch (e) {
      console.error("Error loading demands for print list:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    loadDemands();
  }, [targetDays, active]);

  // Sync with external localStorage updates (e.g. from DemandTable)
  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('natum_hub_print_list');
      if (stored) {
        try {
          setPrintList(JSON.parse(stored));
        } catch (e) {
          console.error(e);
        }
      } else {
        setPrintList([]);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Filter print list items currently listed
  const selectedDemands = useMemo(() => {
    const lookup = new Set(printList.map(c => c.replace(/\./g, '')));
    let result = demands.filter(d => lookup.has((d.itemCode || '').replace(/\./g, '')));
    
    // Mode-specific category isolation
    if (mode === 'materia_prima') {
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_mp');
    } else if (mode === 'embalagens') {
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_emb');
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
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_mp');
    } else if (mode === 'embalagens') {
      result = result.filter(d => resolveRootCategory(d.categoryId) === 'cat_emb');
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
      .slice(0, 15); // limit preview
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

  const handleClearList = async () => {
    if (await confirmDialog("Tem certeza que deseja limpar toda a lista de impressão?", { variant: 'danger' })) {
      savePrintList([]);
    }
  };

  const handleCreateQuotationFromList = async () => {
    if (selectedDemands.length === 0) {
      showToast("A lista está vazia.", 'info');
      return;
    }
    const title = prompt('Título para a nova cotação:');
    if (!title) return;
    try {
      const itemCodes = selectedDemands.map(d => d.itemCode);
      const recommendedQtys = selectedDemands.map(d => {
        const manual = manualQtys[d.itemCode];
        const val = manual !== undefined ? parseFloat(manual) : Math.max(0, Math.round(d.recommendedQty));
        return isNaN(val) ? 0 : val;
      });
      await api.createQuotation(title, itemCodes, recommendedQtys);
      showToast('Cotação criada a partir da lista com sucesso!', 'success');
      if (await confirmDialog('Deseja limpar os itens adicionados da lista?', { variant: 'danger' })) {
        savePrintList(printList.filter(code => !itemCodes.includes(code)));
      }
    } catch (e) {
      console.error(e);
      showToast('Erro ao criar cotação a partir da lista: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
  };

  const handlePrint = () => {
    if (selectedDemands.length === 0) {
      showToast("A lista está vazia ou os itens filtrados não correspondem.", 'error');
      return;
    }

    let reportTitle = 'Relatório de Compras';
    if (mode === 'materia_prima') {
      reportTitle = 'Relatório de Compras de Matéria-Prima';
    } else if (mode === 'embalagens') {
      reportTitle = 'Relatório de Compras de Embalagens';
    } else if (mode === 'coloracao') {
      reportTitle = 'Relatório de Compras de Coloração';
    } else if (mode === 'apoio') {
      reportTitle = 'Relatório de Compras de Material de Apoio';
    }

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
      showToast("Não foi possível iniciar a impressão.", 'error');
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
      const cellsHtml = columnOrder.map(colKey => {
        if (!columns[colKey]) return '';
        const qty = manualQtys[item.itemCode] !== undefined ? manualQtys[item.itemCode] : Math.max(0, Math.round(item.recommendedQty));
        const daily = item.overallAvg / 30.0;
        const futureStock = item.futureStockForecast || 0;
        const postStock = Math.max(0, futureStock + qty);
        const postDuration = daily > 0 ? Math.round(postStock / daily) : 9999;
        
        if (colKey === 'itemCode') {
          return `
            <td style="font-family: monospace; font-size: 10px;">${item.itemCode || '-'}</td>
            <td style="text-align: left; font-weight: 500; font-size: 10px;">${item.description || '-'}</td>
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
          return `<td style="text-align: right;">${item.overallAvg.toLocaleString('pt-BR')} ${item.unit || ''}</td>`;
        }
        if (colKey === 'futureStockForecast') {
          return `<td style="text-align: right;">${item.futureStockForecast.toLocaleString('pt-BR')} ${item.unit || ''}</td>`;
        }
        if (colKey === 'estimatedDurationDays') {
          return `
            <td style="text-align: center; font-weight: ${item.estimatedDurationDays < 60 ? 'bold' : 'normal'};">
              ${item.estimatedDurationDays === 9999 ? '9999+' : `${item.estimatedDurationDays} dias`}
            </td>
          `;
        }
        if (colKey === 'recommendedQty') {
          return `
            <td style="text-align: right; font-weight: bold; background-color: #f4f4f5;">
              <div>${qty > 0 ? `${qty.toLocaleString('pt-BR')} ${item.unit || ''}` : '-'}</div>
              <div style="font-size: 8px; color: ${postDuration < 60 ? '#b91c1c' : postDuration < 90 ? '#b45309' : '#047857'}; font-weight: normal; margin-top: 2px; text-align: right;">
                Pós: ${postDuration === 9999 ? '∞' : `${postDuration}d (${Math.round(postDuration / 30)}m)`}
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
        <title>${reportTitle} — NatumHub</title>
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
            margin-bottom: 20px;
            border-bottom: 2px solid #111827;
            padding-bottom: 10px;
          }
          .header-title {
            font-size: 18px;
            font-weight: 800;
            color: #111827;
            margin: 0 0 5px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .header-meta {
            display: flex;
            justify-content: space-between;
            color: #4b5563;
            font-size: 9px;
          }
          .meta-group {
            display: flex;
            gap: 15px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
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
            background-color: #f9fafb;
            border-bottom: 2px solid #d1d5db;
            color: #374151;
            font-weight: 700;
            padding: 6px 4px;
            text-align: center;
            font-size: 9px;
            text-transform: uppercase;
          }
          td {
            border-bottom: 1px solid #e5e7eb;
            padding: 6px 4px;
            text-align: center;
            vertical-align: middle;
          }
          .signatures {
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .signature-box {
            width: 45%;
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #9ca3af;
            margin-top: 35px;
            margin-bottom: 5px;
          }
          .signature-title {
            font-size: 9px;
            color: #6b7280;
            font-weight: 600;
            text-transform: uppercase;
          }
          footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #9ca3af;
            border-top: 1px solid #f3f4f6;
            padding-top: 5px;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <header>
          <h1 class="header-title">${reportTitle}</h1>
          <div class="header-meta">
            <div>Gerado em: <strong>${today}</strong></div>
            <div class="meta-group">
              <div>Meta de Estoque: <strong>${targetDays} dias</strong></div>
              <div>Itens Selecionados: <strong>${selectedDemands.length}</strong></div>
            </div>
          </div>
        </header>

        <table>
          <thead>
            <tr>
              ${columnOrder.map(colKey => {
                if (!columns[colKey]) return '';
                if (colKey === 'itemCode') {
                  return '<th style="width: 80px; text-align: left;">Código</th><th style="text-align: left;">Descrição</th>';
                }
                const meta = COLUMN_METADATA[colKey];
                return `<th style="text-align: ${meta.align === 'right' ? 'right' : meta.align === 'center' ? 'center' : 'left'};">${meta.label}</th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="margin-top: 25px; padding: 10px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 8px; color: #4b5563; page-break-inside: avoid;">
          <strong style="color: #111827; display: block; margin-bottom: 4px; font-size: 9px; text-transform: uppercase;">Nota Explicativa (Metodologia de Cálculo):</strong>
          <ul style="margin: 0; padding-left: 12px; line-height: 1.4;">
            <li style="margin-bottom: 3px;"><strong>Consumo Mês (Média):</strong> Calculado prioritariamente a partir da média de saídas reais de estoque (baixas por ordens de produção ou avarias) ocorridas nos últimos 12 meses. Na ausência de saídas, utiliza-se a mediana das médias de consumo anuais (2024, 2025 e 2026), ajustando-se proporcionalmente o ano corrente aos meses decorridos.</li>
            <li style="margin-bottom: 3px;"><strong>Duração de Estoque:</strong> Calculada como <code style="font-family: monospace;">Estoque Projetado Futuro / Consumo Diário</code>. O Estoque Futuro projeta a quantidade somando estoque físico atual, ordens em produção e ordens de compra em trânsito, e subtraindo a quantidade reservada para produção imediata.</li>
            <li><strong>Recomendado:</strong> Sugestão para suprir a meta de dias desejada, expressa por: <code style="font-family: monospace;">(Meta de Dias / 30 * Consumo Mês) - Estoque Futuro</code>.</li>
          </ul>
        </div>

        <div class="signatures">
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title">Responsável pelo Planejamento (PCP)</div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title">Autorização para Realização de Cotação</div>
          </div>
        </div>

        <footer>
          <div>NatumHub — Sistema de Gestão Unificado</div>
          <div>Impressão Personalizada</div>
        </footer>
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

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-12.25rem)]">
      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="text-left">
          <h3 className="font-extrabold text-zinc-900 text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-zinc-700" />
            Lista de Impressão — {mode === 'materia_prima' ? 'Matéria-Prima' : mode === 'embalagens' ? 'Embalagens' : mode === 'coloracao' ? 'Coloração' : mode === 'apoio' ? 'Material de Apoio' : 'Geral'}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Adicione insumos à lista a partir da aba principal ou pesquise abaixo para montar seu rascunho de compras.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 border-r border-zinc-200 pr-4 mr-1">
            <span className="text-xs font-bold text-zinc-600">Cálculo Meta:</span>
            <input 
              type="number" 
              value={targetDays} 
              onChange={e => setTargetDays(Number(e.target.value))} 
              className="w-16 text-xs border border-zinc-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-zinc-950 focus:outline-none" 
            />
            <span className="text-[10px] text-zinc-500">dias</span>
          </div>
          <button 
            onClick={handleClearList} 
            disabled={printList.length === 0} 
            className="text-xs border border-zinc-200 text-zinc-600 px-3.5 py-2 rounded-lg font-bold hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Limpar Lista
          </button>
          <button 
            onClick={handleCreateQuotationFromList} 
            disabled={selectedDemands.length === 0} 
            className="text-xs bg-blue-600 text-white px-3.5 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Enviar p/ Cotação ({selectedDemands.length})
          </button>
          <button 
            onClick={handlePrint} 
            disabled={selectedDemands.length === 0} 
            className="text-xs bg-zinc-900 text-white px-3.5 py-2 rounded-lg font-bold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir Relatório ({selectedDemands.length})
          </button>
        </div>
      </div>

      {/* Column Customization & Reordering Panel */}
      <div className="bg-white px-4 py-3 rounded-xl border border-zinc-200 shadow-sm flex flex-col gap-3 shrink-0">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
          <Settings className="h-4 w-4 text-zinc-400" /> Ordenar & Habilitar Colunas do Relatório:
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {columnOrder.map((colKey, idx) => {
            const meta = COLUMN_METADATA[colKey];
            return (
              <div key={colKey} className="bg-zinc-50 px-2.5 py-1.5 border border-zinc-200 rounded flex items-center gap-2 shadow-sm text-xs">
                <input 
                  type="checkbox" 
                  checked={columns[colKey]} 
                  onChange={e => saveColumnConfig({ ...columns, [colKey]: e.target.checked })} 
                  className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 h-3.5 w-3.5 cursor-pointer"
                />
                <span className="font-semibold text-zinc-700">{meta.label}</span>
                <div className="flex items-center gap-1 border-l border-zinc-200 pl-2 ml-1">
                  <button
                    onClick={() => handleMoveColumn(idx, 'up')}
                    disabled={idx === 0}
                    className="p-0.5 hover:bg-zinc-200 rounded disabled:opacity-30 text-[10px]"
                    title="Mover para esquerda"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => handleMoveColumn(idx, 'down')}
                    disabled={idx === columnOrder.length - 1}
                    className="p-0.5 hover:bg-zinc-200 rounded disabled:opacity-30 text-[10px]"
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
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col w-full">
          {/* Actions & Add bar */}
          <div className="px-4 py-2 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0 gap-4 flex-wrap relative">
            <div className="flex items-center gap-4 flex-wrap flex-1">
              <div className="flex items-center gap-2 bg-white border border-zinc-300 rounded-md px-3 py-1.5">
                <Search className="h-4 w-4 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Buscar na lista..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  className="text-xs bg-transparent border-none focus:outline-none w-48" 
                />
              </div>

              {/* Add item search combobox */}
              <div className="relative">
                <button 
                  onClick={() => setShowAddMenu(!showAddMenu)} 
                  className="text-xs bg-white border border-zinc-300 text-zinc-700 px-3 py-1.5 rounded-md font-semibold hover:bg-zinc-50 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-zinc-500" />
                  Adicionar Insumo...
                </button>
                {showAddMenu && (
                  <div className="absolute left-0 mt-1 w-80 bg-white border border-zinc-200 rounded-lg shadow-xl z-30 p-2 flex flex-col gap-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Adicionar Insumo</span>
                      <button onClick={() => setShowAddMenu(false)} className="text-zinc-400 hover:text-zinc-600 p-0.5 rounded hover:bg-zinc-100 cursor-pointer">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input 
                      type="text" 
                      placeholder="Pesquisar código ou descrição..." 
                      value={addItemSearch} 
                      onChange={e => setAddItemSearch(e.target.value)} 
                      className="text-xs border border-zinc-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-950 w-full" 
                      autoFocus
                    />
                    <div className="max-h-60 overflow-y-auto border border-zinc-100 rounded divide-y divide-zinc-100 bg-white">
                      {availableItemsToAdd.map(item => (
                        <div 
                          key={item.itemCode} 
                          onClick={() => handleAddItem(item.itemCode)}
                          className="p-2 flex flex-col text-left hover:bg-zinc-50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-zinc-500 text-[10px] bg-zinc-100 px-1.5 py-0.2 rounded">
                              {item.itemCode}
                            </span>
                            <span className="text-xs font-bold text-zinc-800 truncate" title={item.description}>
                              {item.description}
                            </span>
                          </div>
                          <span className="text-[9px] text-zinc-400 mt-0.5">Estoque: {item.currentStock} {item.unit} | Recomendado: {item.recommendedQty} {item.unit}</span>
                        </div>
                      ))}
                      {availableItemsToAdd.length === 0 && (
                        <p className="text-[11px] text-zinc-400 p-3 text-center">Nenhum insumo disponível para adicionar.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-xs text-zinc-500 font-semibold">
              {selectedDemands.length} de {printList.length} selecionados
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-zinc-500 flex-col gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-zinc-400" />
                <span className="text-xs">Carregando dados da lista...</span>
              </div>
            ) : selectedDemands.length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-400 flex-col gap-2.5">
                <Package className="h-10 w-10 text-zinc-300 animate-pulse" />
                <p className="text-xs font-semibold text-zinc-500">Nenhum item na sua lista de impressão.</p>
                <p className="text-[11px] text-zinc-400 max-w-xs leading-normal text-center">
                  Adicione itens à lista clicando no ícone "+" ao lado de qualquer item nas abas de demanda.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-zinc-100 sticky top-0 z-10 shadow-sm">
                  <tr>
                    {columnOrder.map(colKey => {
                      if (!columns[colKey]) return null;
                      const meta = COLUMN_METADATA[colKey];
                      return (
                        <th 
                          key={colKey} 
                          className={cn(
                            "px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200",
                            meta.align === 'right' && "text-right",
                            meta.align === 'center' && "text-center"
                          )}
                        >
                          {meta.label}
                        </th>
                      );
                    })}
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-center w-12">Remover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {selectedDemands.map(demand => (
                    <tr key={demand.itemCode} className="hover:bg-zinc-50/50 transition-colors">
                      {columnOrder.map(colKey => {
                        if (!columns[colKey]) return null;
                        
                        if (colKey === 'itemCode') {
                          return (
                            <td key={colKey} className="px-4 py-2.5">
                              <div className="font-mono text-[10px] text-zinc-400">{demand.itemCode}</div>
                              <div className="font-bold text-zinc-800 truncate max-w-sm" title={demand.description}>
                                {demand.description}
                              </div>
                            </td>
                          );
                        }
                        if (colKey === 'lastSupplierInvoice') {
                          return (
                            <td key={colKey} className="px-4 py-2.5 text-left text-xs text-zinc-700 max-w-xs truncate" title={demand.lastSupplierInvoice}>
                              {demand.lastSupplierInvoice || '-'}
                            </td>
                          );
                        }
                        if (colKey === 'lastSupplierOrder') {
                          return (
                            <td key={colKey} className="px-4 py-2.5 text-left text-xs text-zinc-700 max-w-xs truncate" title={demand.lastSupplierOrder}>
                              {demand.lastSupplierOrder || '-'}
                            </td>
                          );
                        }
                        if (colKey === 'currentStock') {
                          return (
                            <td key={colKey} className="px-4 py-2.5 text-right font-semibold text-zinc-800">
                              {demand.currentStock.toLocaleString('pt-BR')} {demand.unit}
                            </td>
                          );
                        }
                        if (colKey === 'overallAvg') {
                          return (
                            <td key={colKey} className="px-4 py-2.5 text-right font-semibold text-zinc-700">
                              {demand.overallAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {demand.unit}
                            </td>
                          );
                        }
                        if (colKey === 'futureStockForecast') {
                          return (
                            <td key={colKey} className="px-4 py-2.5 text-right font-semibold text-zinc-700">
                              {demand.futureStockForecast.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {demand.unit}
                            </td>
                          );
                        }
                        if (colKey === 'estimatedDurationDays') {
                          return (
                            <td key={colKey} className="px-4 py-2.5 text-center">
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold", 
                                demand.urgency === 'critical' && "bg-red-50 text-red-700", 
                                demand.urgency === 'warning' && "bg-amber-50 text-amber-700", 
                                demand.urgency === 'ok' && "bg-emerald-50 text-emerald-700"
                              )}>
                                {demand.estimatedDurationDays === 9999 ? '∞' : `${demand.estimatedDurationDays} dias`}
                              </span>
                            </td>
                          );
                        }
                        if (colKey === 'recommendedQty') {
                          const qty = manualQtys[demand.itemCode] !== undefined ? manualQtys[demand.itemCode] : Math.max(0, Math.round(demand.recommendedQty));
                          const daily = demand.overallAvg / 30.0;
                          const futureStock = demand.futureStockForecast || 0;
                          const postStock = Math.max(0, futureStock + qty);
                          const postDuration = daily > 0 ? Math.round(postStock / daily) : 9999;
                          
                          return (
                            <td key={colKey} className="px-4 py-2.5 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <input
                                  type="number"
                                  value={qty}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? '' : Number(e.target.value);
                                    handleUpdateManualQty(demand.itemCode, val);
                                  }}
                                  className="w-24 text-right text-xs border border-zinc-200 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 rounded px-2 py-1 font-bold text-zinc-800 bg-white"
                                />
                                <span className="text-[10px] text-zinc-500">{demand.unit}</span>
                                <span className={cn(
                                  "text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5 whitespace-nowrap",
                                  postDuration < 60 ? "bg-red-50 text-red-700" :
                                  postDuration < 90 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                                )}>
                                  Pós-compra: {postDuration === 9999 ? '∞' : `${postDuration}d (${Math.round(postDuration / 30)}m)`}
                                </span>
                              </div>
                            </td>
                          );
                        }
                        return null;
                      })}
                      <td className="px-4 py-2.5 text-center">
                        <button 
                          onClick={() => handleRemoveItem(demand.itemCode)}
                          className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Remover da lista"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
