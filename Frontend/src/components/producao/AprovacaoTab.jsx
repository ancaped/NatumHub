import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, RefreshCw, Printer, Trash2, CheckCircle2, X, AlertTriangle, 
  HelpCircle, Calendar, Edit3, Database, Play, Check, ArrowRight
} from 'lucide-react';
import { API_BASE, apiFetch } from '../../lib/utils';


export function AprovacaoTab({
  active = true,
  productionApprovalList = [],
  onToggleApprovalList,
  diasComerciais = 30,
  configs = [],
  onLaunchSuccess
}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Form states per product code
  const [manualQtys, setManualQtys] = useState(() => {
    const stored = localStorage.getItem('natum_hub_production_approval_qtys');
    return stored ? JSON.parse(stored) : {};
  });

  const [consumeBaseState, setConsumeBaseState] = useState({});
  const [launchDates, setLaunchDates] = useState({});
  const [obsState, setObsState] = useState({});

  // Modal State for Lote ERP
  const [approvingProduct, setApprovingProduct] = useState(null);
  const [loteErp, setLoteErp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch all products to get calculated properties (EFP, suggested qty, base, etc.)
  const fetchAllProducts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/products?limit=9999&show_hidden=true`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
      }
    } catch (e) {
      console.error("Error loading products for approval list:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (active) {
      fetchAllProducts();
    }
  }, [active]);

  // Sync manual quantities to local storage
  const handleUpdateQty = (code, qty) => {
    const next = { ...manualQtys, [code]: qty };
    setManualQtys(next);
    localStorage.setItem('natum_hub_production_approval_qtys', JSON.stringify(next));
  };

  // Helper to find matching base product in full list
  const getBaseProduct = (product) => {
    if (!product.base) return null;
    const baseNameUpper = product.base.trim().toUpperCase();
    const baseExpanded = baseNameUpper
      .replace("SH ", "SHAMPOO ")
      .replace("COND ", "CONDICIONADOR ")
      .replace("MASC ", "MASCARA ");
    
    return products.find(p => {
      const descUpper = p.descricao.trim().toUpperCase();
      return descUpper === baseNameUpper ||
             descUpper === baseExpanded ||
             descUpper.startsWith(baseNameUpper) ||
             descUpper.startsWith(baseExpanded);
    }) || null;
  };

  // Filter products that are in the approval list
  const queuedProducts = useMemo(() => {
    const lookup = new Set(productionApprovalList);
    const filtered = products.filter(p => lookup.has(p.codigo));

    // Handle search query
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      return filtered.filter(p => 
        (p.codigo || '').toLowerCase().includes(q) ||
        (p.descricao || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [products, productionApprovalList, search]);

  // Get total volume to produce
  const totalVolumeToProduce = useMemo(() => {
    return queuedProducts.reduce((sum, p) => {
      const manualVal = manualQtys[p.codigo];
      const qty = (manualVal !== undefined && manualVal !== '') 
        ? parseInt(manualVal, 10) 
        : (p.producao_recomendada > 0 ? p.producao_recomendada : 100);
      return sum + (isNaN(qty) ? 0 : qty);
    }, 0);
  }, [queuedProducts, manualQtys]);

  const handleClearApprovalQueue = () => {
    if (window.confirm("Deseja realmente limpar toda a fila de aprovação de produção?")) {
      localStorage.setItem('natum_hub_production_approval_list', JSON.stringify([]));
      window.dispatchEvent(new Event('storage'));
    }
  };

  const handleOpenApproveModal = (product) => {
    const qtyVal = manualQtys[product.codigo];
    const qty = (qtyVal !== undefined && qtyVal !== '') 
      ? parseInt(qtyVal, 10) 
      : (product.producao_recomendada > 0 ? product.producao_recomendada : 100);

    const baseProd = getBaseProduct(product);
    const defaultConsume = consumeBaseState[product.codigo] !== undefined 
      ? consumeBaseState[product.codigo] 
      : (baseProd && baseProd.estoque > 0);

    const defaultDate = launchDates[product.codigo] || (() => {
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    })();

    const defaultObs = obsState[product.codigo] || '';

    setApprovingProduct({
      ...product,
      qty,
      consumeBase: defaultConsume,
      baseProduct: baseProd,
      date: defaultDate,
      obs: defaultObs
    });
    setLoteErp('');
  };

  const handleConfirmApproval = async () => {
    if (!approvingProduct) return;
    if (loteErp.trim() === '') {
      alert("Por favor, insira o número do Lote ERP.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/historico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_producao: approvingProduct.date,
          codigo: approvingProduct.codigo,
          quantidade: approvingProduct.qty,
          observacoes: approvingProduct.obs.trim() === '' ? null : approvingProduct.obs.trim(),
          snap_estoque: approvingProduct.estoque ?? null,
          snap_producao: approvingProduct.producao ?? null,
          snap_pedidos: approvingProduct.pedidos_aberto ?? null,
          snap_efp: approvingProduct.estoque_futuro_com_producao ?? null,
          snap_media_vendas: approvingProduct.media_vendas ?? null,
          snap_duracao_meses: approvingProduct.duracao_meses ?? null,
          snap_status: approvingProduct.status ?? null,
          snap_status_label: approvingProduct.status_label ?? null,
          snap_producao_recomendada: approvingProduct.producao_recomendada ?? null,
          snap_estoque_ideal_qtd: approvingProduct.estoque_ideal_qtd ?? null,
          snap_demanda_ajustada: approvingProduct.demanda_ajustada ?? null,
          consume_base: approvingProduct.consumeBase,
          base_code: approvingProduct.consumeBase && approvingProduct.baseProduct ? approvingProduct.baseProduct.codigo : null,
          lote_erp: loteErp.trim()
        })
      });

      if (res.ok) {
        // Remove from approval list
        onToggleApprovalList(approvingProduct.codigo);
        // Clean manual states
        const nextManual = { ...manualQtys };
        delete nextManual[approvingProduct.codigo];
        setManualQtys(nextManual);
        localStorage.setItem('natum_hub_production_approval_qtys', JSON.stringify(nextManual));
        
        setApprovingProduct(null);
        if (onLaunchSuccess) onLaunchSuccess();
      } else {
        const err = await res.json();
        alert(err.error || "Erro ao aprovar produção do lote");
      }
    } catch (e) {
      console.error(e);
      alert("Falha de conexão com o servidor");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintReport = () => {
    if (queuedProducts.length === 0) return;

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Relatório de Aprovação de Produção - NatumHub</title>
        <style>
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1c1917;
            margin: 20px;
            font-size: 11px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e7e5e4;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .title {
            font-size: 16px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: -0.025em;
            margin: 0;
          }
          .subtitle {
            color: #78716c;
            margin: 2px 0 0 0;
            font-size: 10px;
          }
          .meta-info {
            text-align: right;
            font-size: 10px;
            color: #44403c;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th {
            background-color: #f5f5f4;
            border-bottom: 2px solid #d6d3d1;
            padding: 8px;
            font-weight: 700;
            text-align: left;
            text-transform: uppercase;
            font-size: 9px;
            color: #44403c;
          }
          td {
            padding: 8px;
            border-bottom: 1px solid #e7e5e4;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background-color: #fafaf9;
          }
          .ref {
            font-family: monospace;
            font-weight: 700;
            color: #120f0e;
          }
          .desc {
            font-weight: 600;
          }
          .linha {
            font-size: 9px;
            color: #78716c;
            margin-top: 2px;
          }
          .numeric {
            text-align: right;
          }
          .center {
            text-align: center;
          }
          .footer {
            margin-top: 30px;
            border-top: 1px solid #e7e5e4;
            padding-top: 10px;
            text-align: center;
            font-size: 9px;
            color: #a8a29e;
          }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            @page { size: portrait; margin: 1.5cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">Lista de Aprovação de Produção</h1>
            <p class="subtitle">Planejamento e Lançamento Industrial</p>
          </div>
          <div class="meta-info">
            <strong>Data do Relatório:</strong> ${new Date().toLocaleDateString('pt-BR')}<br>
            <strong>Total de Itens:</strong> ${queuedProducts.length} | 
            <strong>Volume Total:</strong> ${totalVolumeToProduce.toLocaleString('pt-BR')} un
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 12%">REF</th>
              <th style="width: 32%">Descrição do Produto</th>
              <th class="numeric" style="width: 9%">Estoque</th>
              <th class="numeric" style="width: 9%">Média Venda</th>
              <th class="numeric" style="width: 9%">Prev. Futura (EFP)</th>
              <th class="center" style="width: 10%">Duração</th>
              <th class="numeric" style="width: 10%">Qtd a Produzir</th>
              <th class="center" style="width: 10%">Duração Pós-Prod</th>
            </tr>
          </thead>
          <tbody>
            ${queuedProducts.map(p => {
              const qtyVal = manualQtys[p.codigo];
              const qtyToProduce = (qtyVal !== undefined && qtyVal !== '') 
                ? parseInt(qtyVal, 10) 
                : (p.producao_recomendada > 0 ? p.producao_recomendada : 100);
              
              const isOnlyKit = p.produzir_apenas_kit === 1;
              const mediaStr = isOnlyKit ? '—' : p.demanda_ajustada.toFixed(1);
              const duracaoStr = `${p.duracao_meses.toFixed(1)} meses`;
              
              // Post production calculations
              let duracaoPosStr = '—';
              if (!isOnlyKit && p.demanda_ajustada > 0) {
                const efpPos = (p.estoque_futuro_com_producao || 0) + (isNaN(qtyToProduce) ? 0 : qtyToProduce);
                const duracaoPos = efpPos / p.demanda_ajustada;
                duracaoPosStr = `${duracaoPos.toFixed(1)} meses`;
              }

              return `
                <tr>
                  <td class="ref">${p.codigo}</td>
                  <td>
                    <div class="desc">${p.descricao}</div>
                    <div class="linha">Linha: ${p.nome_linha}</div>
                  </td>
                  <td class="numeric">${p.estoque.toLocaleString('pt-BR')}</td>
                  <td class="numeric">${mediaStr}</td>
                  <td class="numeric">${p.estoque_futuro_com_producao.toLocaleString('pt-BR')}</td>
                  <td class="center">${duracaoStr}</td>
                  <td class="numeric" style="font-weight: 700;">${qtyToProduce.toLocaleString('pt-BR')} un</td>
                  <td class="center" style="font-weight: 700; color: #1c1917;">${duracaoPosStr}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="footer">
          NatumHub — Sistema de Gestão Industrial Integrada
        </div>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(printHtml);
      doc.close();
      
      // Short delay to let Inter font load if external
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 300);
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      <div className="view-header text-left">
        <h2 className="view-title">Fila de Aprovação de Produção</h2>
        <p className="view-subtitle">
          Revise os produtos selecionados para produção, ajuste quantidades, verifique o consumo de bases e libere ordens vinculadas ao Lote ERP.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <section className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="summary-card abundant text-left">
          <div className="card-header">
            <span className="card-title">Itens Enfileirados</span>
            <div className="card-icon">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="card-value">{queuedProducts.length}</div>
          <div className="card-subtitle">Produtos na fila de liberação</div>
        </div>

        <div className="summary-card ordem text-left">
          <div className="card-header">
            <span className="card-title">Volume Total a Produzir</span>
            <div className="card-icon">
              <Play size={20} />
            </div>
          </div>
          <div className="card-value">{totalVolumeToProduce.toLocaleString()} un</div>
          <div className="card-subtitle">Soma das unidades de produção ajustadas</div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar na fila por REF ou descrição..." 
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filters-wrapper">
          <button 
            className="btn-secondary cursor-pointer flex items-center gap-1.5"
            onClick={handlePrintReport}
            disabled={queuedProducts.length === 0}
            title="Imprimir Relatório de Aprovação"
          >
            <Printer size={15} />
            <span>Imprimir Lista</span>
          </button>

          <button 
            className="btn-secondary cursor-pointer flex items-center gap-1.5 text-rose-650 hover:bg-rose-50"
            onClick={handleClearApprovalQueue}
            disabled={queuedProducts.length === 0}
            title="Limpar todos os itens da fila"
          >
            <Trash2 size={15} />
            <span>Limpar Fila</span>
          </button>
        </div>
      </div>

      {/* List Container */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs">
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#78716c', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw className="animate-spin" size={32} />
            <span>Carregando dados de estoque dos produtos...</span>
          </div>
        ) : queuedProducts.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#78716c', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <HelpCircle size={48} style={{ opacity: 0.3 }} />
            <span>Nenhum produto na fila de aprovação. Adicione itens clicando em "+" no Gerenciamento de Produção.</span>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-50">
                <tr className="border-b border-zinc-200">
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px]" style={{ width: '10%' }}>REF</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px]" style={{ width: '25%' }}>Descrição / Linha</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-right" style={{ width: '10%' }}>EFP</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-right" style={{ width: '9%' }}>Média Venda</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-center" style={{ width: '10%' }}>Duração</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-right" style={{ width: '12%' }}>Qtd a Produzir</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-center" style={{ width: '10%' }}>Duração Pós</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px]" style={{ width: '14%' }}>Base do Produto</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-center" style={{ width: '10%' }}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {queuedProducts.map((p) => {
                  const manualVal = manualQtys[p.codigo];
                  const qtyToProduce = (manualVal !== undefined && manualVal !== '') 
                    ? parseInt(manualVal, 10) 
                    : (p.producao_recomendada > 0 ? p.producao_recomendada : 100);

                  const isOnlyKit = p.produzir_apenas_kit === 1;
                  const mediaStr = isOnlyKit ? '—' : p.demanda_ajustada.toFixed(1);

                  // Base validation
                  const baseProd = getBaseProduct(p);
                  const hasBase = !!p.base;
                  const currentConsumeBase = consumeBaseState[p.codigo] !== undefined 
                    ? consumeBaseState[p.codigo] 
                    : (baseProd && baseProd.estoque > 0);

                  // Post production duration
                  let duracaoPosStr = '—';
                  if (!isOnlyKit && p.demanda_ajustada > 0) {
                    const efpPos = (p.estoque_futuro_com_producao || 0) + (isNaN(qtyToProduce) ? 0 : qtyToProduce);
                    const duracaoPos = efpPos / p.demanda_ajustada;
                    duracaoPosStr = `${duracaoPos.toFixed(1)} meses`;
                  }

                  return (
                    <tr key={p.codigo} className="hover:bg-zinc-50/30 transition-colors">
                      {/* REF */}
                      <td className="px-4 py-3 align-middle font-mono font-bold text-zinc-600">
                        {p.codigo}
                      </td>

                      {/* Descricao */}
                      <td className="px-4 py-3 align-middle">
                        <div className="font-bold text-zinc-900">{p.descricao}</div>
                        <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                          Linha: {p.nome_linha}
                          {isOnlyKit && <span className="ml-1.5 bg-indigo-50 text-indigo-700 px-1 py-0.2 rounded font-bold">Apenas Kit</span>}
                        </div>
                      </td>

                      {/* EFP */}
                      <td className="px-4 py-3 align-middle text-right font-bold text-zinc-900">
                        {p.estoque_futuro_com_producao}
                        <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                          Est: {p.estoque} | Prod: {p.producao}
                        </div>
                      </td>

                      {/* Media */}
                      <td className="px-4 py-3 align-middle text-right font-bold text-zinc-750">
                        {mediaStr}
                      </td>

                      {/* Duracao */}
                      <td className="px-4 py-3 align-middle text-center font-semibold text-zinc-600">
                        {p.duracao_meses.toFixed(1)} m
                        <div className="text-[10px] text-zinc-400">
                          {(p.duracao_meses * diasComerciais).toFixed(0)} dias
                        </div>
                      </td>

                      {/* Qtd a Produzir Input */}
                      <td className="px-4 py-3 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <input 
                            type="number"
                            className="text-right border border-zinc-200 rounded px-2 py-1 w-20 font-bold focus:outline-none focus:border-zinc-400"
                            value={manualVal !== undefined ? manualVal : qtyToProduce}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleUpdateQty(p.codigo, val === '' ? '' : parseInt(val, 10));
                            }}
                            min="1"
                          />
                          <span className="text-zinc-500 font-semibold text-[10px]">un</span>
                        </div>
                      </td>

                      {/* Duracao Pos */}
                      <td className="px-4 py-3 align-middle text-center font-bold text-zinc-800">
                        {duracaoPosStr}
                      </td>

                      {/* Base Control */}
                      <td className="px-4 py-3 align-middle">
                        {hasBase ? (
                          <div className="flex flex-col gap-1">
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input 
                                type="checkbox"
                                checked={currentConsumeBase}
                                onChange={(e) => {
                                  setConsumeBaseState(prev => ({
                                    ...prev,
                                    [p.codigo]: e.target.checked
                                  }));
                                }}
                                disabled={!baseProd || baseProd.estoque <= 0}
                              />
                              <span className="font-semibold text-zinc-700">Consumir Base</span>
                            </label>
                            {baseProd ? (
                              <div className="text-[10px] text-zinc-400">
                                {baseProd.descricao.substring(0, 16)}...
                                <span className={`ml-1 font-bold ${baseProd.estoque > 0 ? 'text-emerald-650' : 'text-rose-650'}`}>
                                  (Est: {baseProd.estoque})
                                </span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-rose-500 flex items-center gap-0.5">
                                <AlertTriangle size={10} /> Base não cadastrada
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">Sem base</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 align-middle text-center">
                        <div className="flex gap-1 justify-center">
                          <button 
                            className="p-1 rounded bg-zinc-900 text-white hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center"
                            onClick={() => handleOpenApproveModal(p)}
                            title="Aprovar e Enviar para Produção"
                            style={{ padding: '4px 8px', gap: '3px', fontWeight: 'bold' }}
                          >
                            <Check size={12} />
                            <span>Aprovar</span>
                          </button>
                          <button 
                            className="p-1 rounded border border-zinc-200 text-zinc-400 hover:text-zinc-650 hover:bg-zinc-50 transition-colors cursor-pointer"
                            onClick={() => onToggleApprovalList(p.codigo)}
                            title="Remover da Fila"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* APPROVE / LOTE ERP MODAL */}
      {approvingProduct && (
        <div className="modal-backdrop flex items-center justify-center animate-fade-in" style={{ zIndex: 300, position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(1px)' }}>
          <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 p-6 w-full max-w-md animate-in zoom-in-95 duration-150 text-left text-zinc-900">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Aprovação de Produção</span>
                <h3 className="text-base font-bold text-zinc-900 mt-0.5">Vincular Lote ERP</h3>
              </div>
              <button 
                onClick={() => setApprovingProduct(null)}
                className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Product Info Summary */}
              <div className="bg-zinc-50 border border-zinc-150 rounded-lg p-3 flex flex-col gap-1 text-[11px] text-zinc-700">
                <div>REF: <strong className="text-zinc-900 font-mono">{approvingProduct.codigo}</strong></div>
                <div>Produto: <strong className="text-zinc-900">{approvingProduct.descricao}</strong></div>
                <div>Linha: <strong className="text-zinc-900">{approvingProduct.nome_linha}</strong></div>
                <div>Quantidade: <strong className="text-zinc-900">{approvingProduct.qty.toLocaleString()} un</strong></div>
                {approvingProduct.consumeBase && approvingProduct.baseProduct && (
                  <div className="text-emerald-750 font-medium">Consumirá base: {approvingProduct.baseProduct.codigo}</div>
                )}
              </div>

              {/* LOTE ERP INPUT (CRITICAL FIELD) */}
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-zinc-700 text-xs flex items-center gap-1">
                  <span>Número do Lote Aberto no ERP</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text"
                  placeholder="Ex: 15348"
                  className="w-full border border-zinc-250 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 font-bold"
                  value={loteErp}
                  onChange={(e) => setLoteErp(e.target.value)}
                  autoFocus
                  required
                />
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Insira o número do lote gerado pelo seu ERP corporativo para associá-lo ao histórico do NatumHub.
                </p>
              </div>

              {/* DATE PICKER */}
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-zinc-700 text-xs">Data de Produção</label>
                <div className="relative">
                  <input 
                    type="date"
                    className="w-full border border-zinc-250 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 bg-white"
                    value={approvingProduct.date}
                    onChange={(e) => setApprovingProduct(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
              </div>

              {/* OBSERVATIONS */}
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-zinc-700 text-xs">Observações (Opcional)</label>
                <textarea 
                  className="w-full border border-zinc-250 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 min-h-16"
                  placeholder="Ex: Fabricar base criativa primeiro"
                  value={approvingProduct.obs}
                  onChange={(e) => setApprovingProduct(prev => ({ ...prev, obs: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button 
                className="btn-secondary cursor-pointer"
                onClick={() => setApprovingProduct(null)}
                disabled={isSubmitting}
                style={{ padding: '0.4rem 1rem' }}
              >
                Cancelar
              </button>
              <button 
                className="btn-primary cursor-pointer flex items-center gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
                onClick={handleConfirmApproval}
                disabled={isSubmitting || loteErp.trim() === ''}
                style={{ padding: '0.4rem 1.2rem', fontWeight: 'bold' }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    <span>Aprovando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Confirmar Aprovação</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
