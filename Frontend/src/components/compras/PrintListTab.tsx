import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { DemandResult } from '../../types';
import { Trash2, Printer, Search, Plus, FileText, RefreshCw, X, Package } from 'lucide-react';
import { cn } from '../../lib/utils';

export function PrintListTab() {
  const [printList, setPrintList] = useState<string[]>([]);
  const [demands, setDemands] = useState<DemandResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetDays, setTargetDays] = useState(90);
  const [search, setSearch] = useState('');
  
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
    loadDemands();
  }, [targetDays]);

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
    const lookup = new Set(printList);
    let result = demands.filter(d => lookup.has(d.itemCode));
    
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(d => 
        (d.itemCode || '').toLowerCase().includes(q) || 
        (d.description || '').toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [demands, printList, search]);

  // Items available to add manually (not already in list)
  const availableItemsToAdd = useMemo(() => {
    const lookup = new Set(printList);
    const q = addItemSearch.toLowerCase();
    
    return demands
      .filter(d => !lookup.has(d.itemCode))
      .filter(d => 
        (d.itemCode || '').toLowerCase().includes(q) || 
        (d.description || '').toLowerCase().includes(q)
      )
      .slice(0, 15); // limit preview
  }, [demands, printList, addItemSearch]);

  const handleAddItem = (code: string) => {
    if (printList.includes(code)) return;
    const newList = [...printList, code];
    savePrintList(newList);
    setAddItemSearch('');
    setShowAddMenu(false);
  };

  const handleRemoveItem = (code: string) => {
    const newList = printList.filter(c => c !== code);
    savePrintList(newList);
  };

  const handleClearList = () => {
    if (confirm("Tem certeza que deseja limpar toda a lista de impressão?")) {
      savePrintList([]);
    }
  };

  const handlePrint = () => {
    if (selectedDemands.length === 0) {
      alert("A lista está vazia ou os itens filtrados não correspondem.");
      return;
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
      return `
        <tr>
          <td style="font-family: monospace; font-size: 10px;">${item.itemCode || '-'}</td>
          <td style="text-align: left; font-weight: 500; font-size: 10px;">${item.description || '-'}</td>
          <td>${item.categoryName || 'Sem Categoria'}</td>
          <td style="text-align: right;">${item.currentStock.toLocaleString('pt-BR')} ${item.unit || ''}</td>
          <td style="text-align: right;">${item.overallAvg.toLocaleString('pt-BR')} ${item.unit || ''}</td>
          <td style="text-align: right;">${item.futureStockForecast.toLocaleString('pt-BR')} ${item.unit || ''}</td>
          <td style="text-align: right; font-weight: ${item.estimatedDurationDays < 60 ? 'bold' : 'normal'};">
            ${item.estimatedDurationDays === 9999 ? '9999+' : `${item.estimatedDurationDays} dias`}
          </td>
          <td style="text-align: right; font-weight: bold; background-color: ${item.recommendedQty > 0 ? '#f4f4f5' : 'transparent'};">
            ${item.recommendedQty > 0 ? `${item.recommendedQty.toLocaleString('pt-BR')} ${item.unit || ''}` : '-'}
          </td>
        </tr>
      `;
    }).join('');
    
    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório Personalizado de Compras — NatumHub</title>
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
          <h1 class="header-title">Relatório Personalizado de Compras</h1>
          <div class="header-meta">
            <div>Gerado em: <strong>${today}</strong></div>
            <div class="meta-group">
              <div>Meta de Estoque: <strong>${targetDays} dias</strong></div>
              <div>Itens Selecionados: <strong>${selectedDemands.length}</strong></div>
              <div>Tipo: <strong>Lista Personalizada</strong></div>
            </div>
          </div>
        </header>

        <table>
          <thead>
            <tr>
              <th style="width: 80px;">Código</th>
              <th>Descrição</th>
              <th style="width: 100px;">Subcategoria</th>
              <th style="width: 70px; text-align: right;">Estoque</th>
              <th style="width: 70px; text-align: right;">Consumo Mês</th>
              <th style="width: 70px; text-align: right;">Prev. Futura</th>
              <th style="width: 70px; text-align: right;">Duração Est.</th>
              <th style="width: 85px; text-align: right; background-color: #f4f4f5; border-bottom: 2px solid #27272a;">Recomendado</th>
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
            <div class="signature-title">Autorização de Compras / Direção</div>
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
    <div className="flex flex-col gap-4 h-[calc(100vh-11rem)]">
      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div className="text-left">
          <h3 className="font-extrabold text-zinc-900 text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-zinc-700" />
            Lista de Impressão de Matéria-Prima
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Adicione insumos à lista a partir da aba principal ou pesquise abaixo para montar seu rascunho de compras.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 border-r border-zinc-200 pr-4 mr-1">
            <span className="text-xs font-bold text-zinc-650">Cálculo Meta:</span>
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
            onClick={handlePrint} 
            disabled={selectedDemands.length === 0} 
            className="text-xs bg-zinc-900 text-white px-3.5 py-2 rounded-lg font-bold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir Relatório ({selectedDemands.length})
          </button>
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
                      <button onClick={() => setShowAddMenu(false)} className="text-zinc-400 hover:text-zinc-650 p-0.5 rounded hover:bg-zinc-100 cursor-pointer">
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
                <p className="text-[11px] text-zinc-400 max-w-xs leading-normal">
                  Adicione insumos à lista clicando no ícone "+" ao lado de qualquer item na aba Matéria-Prima, ou use o botão "Adicionar Insumo..." acima.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-zinc-100 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200">Ref / Item</th>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-right">Estoque</th>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-right">Média Mês</th>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-right">Prev. Futura</th>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-center">Duração Est.</th>
                    <th className="px-4 py-3 font-semibold text-zinc-900 border-b border-zinc-200 text-right">Qtd Recom.</th>
                    <th className="px-4 py-3 font-semibold text-zinc-700 border-b border-zinc-200 text-center w-12">Remover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {selectedDemands.map(demand => (
                    <tr key={demand.itemCode} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-[10px] text-zinc-400">{demand.itemCode}</div>
                        <div className="font-bold text-zinc-800 truncate max-w-sm" title={demand.description}>
                          {demand.description}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="font-semibold text-zinc-800">{demand.currentStock.toLocaleString('pt-BR')} {demand.unit}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-zinc-700">
                        {demand.overallAvg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {demand.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-zinc-850">
                        {demand.futureStockForecast.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {demand.unit}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold", 
                          demand.urgency === 'critical' && "bg-red-50 text-red-700", 
                          demand.urgency === 'warning' && "bg-amber-50 text-amber-700", 
                          demand.urgency === 'ok' && "bg-emerald-50 text-emerald-700"
                        )}>
                          {demand.estimatedDurationDays === 9999 ? '∞' : `${demand.estimatedDurationDays} dias`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-extrabold text-zinc-900 text-sm">{demand.recommendedQty.toLocaleString('pt-BR')}</span>
                        <span className="text-[10px] text-zinc-500 ml-1">{demand.unit}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button 
                          onClick={() => handleRemoveItem(demand.itemCode)}
                          className="p-1 rounded text-zinc-400 hover:text-red-650 hover:bg-red-50 transition-colors cursor-pointer"
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
