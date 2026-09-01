import { apiFetch } from '../../../geral/lib/http';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, RefreshCw, Printer, Trash2, CheckCircle2, X, AlertTriangle, 
  HelpCircle, Calendar, Edit3, Database, Play, Check, ArrowRight,
  Clock, ChevronDown, ChevronUp, Package, Truck, Boxes
} from 'lucide-react';

interface PurchaseOrderInfo {
  n_pedido: number;
  c_nome_f?: string;
  d_previsao?: string;
  n_qtde: number;
  n_chegou: number;
  n_pendente: number;
}

interface InsumoDetail {
  ingredient_code: string;
  description: string;
  qty_per_unit: number;
  total_required: number;
  current_stock: number;
  missing_qty: number;
  is_missing: boolean;
  purchase_orders: PurchaseOrderInfo[];
  next_delivery_date?: string;
}

interface InsumosStatusData {
  product_code: string;
  batch_qty: number;
  has_formulation: boolean;
  all_in_stock: boolean;
  missing_count: number;
  previsao_normalizacao?: string;
  status_insumos: 'disponivel' | 'aguardando_compras' | 'sem_pedidos_compra' | 'sem_formula' | string;
  ingredients: InsumoDetail[];
}

export function AprovacaoTab({
  active = true,
  productionApprovalList = [],
  onToggleApprovalList,
  diasComerciais = 30,
  configs = [],
  onLaunchSuccess
}: {
  active?: boolean;
  productionApprovalList?: string[];
  onToggleApprovalList: (code: string) => void;
  diasComerciais?: number;
  configs?: any[];
  onLaunchSuccess?: () => void;
}) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Form states per product code
  const [manualQtys, setManualQtys] = useState<Record<string, number | string>>(() => {
    const stored = localStorage.getItem('natum_hub_production_approval_qtys');
    return stored ? JSON.parse(stored) : {};
  });

  const [consumeBaseState, setConsumeBaseState] = useState<Record<string, boolean>>({});
  const [launchDates, setLaunchDates] = useState<Record<string, string>>({});
  const [obsState, setObsState] = useState<Record<string, string>>({});

  // Insumos & Pedidos de Compra status state
  const [insumosStatusMap, setInsumosStatusMap] = useState<Record<string, InsumosStatusData>>({});
  const [loadingInsumos, setLoadingInsumos] = useState<Record<string, boolean>>({});
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  // Modal State for Lote ERP
  const [approvingProduct, setApprovingProduct] = useState<any | null>(null);
  const [loteErp, setLoteErp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch all products to get calculated properties (EFP, suggested qty, base, etc.)
  const fetchAllProducts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/products?limit=9999&show_hidden=true`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
      }
    } catch (e) {
      console.error("Erro ao carregar produtos para a fila de produção:", e);
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
  const handleUpdateQty = (code: string, qty: number | string) => {
    const next = { ...manualQtys, [code]: qty };
    setManualQtys(next);
    localStorage.setItem('natum_hub_production_approval_qtys', JSON.stringify(next));
  };

  // Helper to find matching base product in full list
  const getBaseProduct = (product: any) => {
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

  // Fetch insumos & purchase orders status for a product
  const fetchInsumosStatus = useCallback(async (productCode: string, qty: number) => {
    setLoadingInsumos(prev => ({ ...prev, [productCode]: true }));
    try {
      const res = await apiFetch(`/producao/insumos-status/${productCode}?qty=${qty}`);
      if (res.ok) {
        const data: InsumosStatusData = await res.json();
        setInsumosStatusMap(prev => ({ ...prev, [productCode]: data }));
      }
    } catch (err) {
      console.error(`Erro ao carregar status de insumos para ${productCode}:`, err);
    } finally {
      setLoadingInsumos(prev => ({ ...prev, [productCode]: false }));
    }
  }, []);

  // Fetch insumos for all queued products
  useEffect(() => {
    if (!active || queuedProducts.length === 0) return;
    queuedProducts.forEach(p => {
      const manualVal = manualQtys[p.codigo];
      const qty = (manualVal !== undefined && manualVal !== '') 
        ? Number(manualVal) 
        : (p.producao_recomendada > 0 ? p.producao_recomendada : 100);
      
      const currentLoaded = insumosStatusMap[p.codigo];
      if (!currentLoaded || currentLoaded.batch_qty !== qty) {
        fetchInsumosStatus(p.codigo, qty);
      }
    });
  }, [active, queuedProducts, manualQtys, fetchInsumosStatus, insumosStatusMap]);

  // Get total volume to produce
  const totalVolumeToProduce = useMemo(() => {
    return queuedProducts.reduce((sum, p) => {
      const manualVal = manualQtys[p.codigo];
      const qty = (manualVal !== undefined && manualVal !== '') 
        ? Number(manualVal) 
        : (p.producao_recomendada > 0 ? p.producao_recomendada : 100);
      return sum + (isNaN(qty) ? 0 : qty);
    }, 0);
  }, [queuedProducts, manualQtys]);

  // Summary counts of insumos
  const insumoStats = useMemo(() => {
    let prontos = 0;
    let aguardando = 0;
    let semPedido = 0;
    let semFormula = 0;

    queuedProducts.forEach(p => {
      const st = insumosStatusMap[p.codigo]?.status_insumos;
      if (st === 'disponivel') prontos++;
      else if (st === 'aguardando_compras') aguardando++;
      else if (st === 'sem_pedidos_compra') semPedido++;
      else if (st === 'sem_formula') semFormula++;
    });

    return { prontos, aguardando, semPedido, semFormula };
  }, [queuedProducts, insumosStatusMap]);

  const handleClearApprovalQueue = () => {
    if (window.confirm("Deseja realmente limpar toda a Fila de Produção?")) {
      localStorage.setItem('natum_hub_production_approval_list', JSON.stringify([]));
      window.dispatchEvent(new Event('storage'));
    }
  };

  const toggleExpand = (code: string) => {
    setExpandedProducts(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const handleOpenApproveModal = (product: any) => {
    const qtyVal = manualQtys[product.codigo];
    const qty = (qtyVal !== undefined && qtyVal !== '') 
      ? Number(qtyVal) 
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
      const res = await apiFetch(`/historico`, {
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
      alert("Falha de conexão com a API");
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
        <title>Fila de Produção e Previsão de Insumos - NatumHub</title>
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
            <h1 class="title">Fila de Produção e Previsão de Insumos</h1>
            <p class="subtitle">Planejamento Industrial e Cruzamento com Compras</p>
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
              <th style="width: 10%">REF</th>
              <th style="width: 28%">Descrição do Produto</th>
              <th class="numeric" style="width: 8%">Estoque</th>
              <th class="numeric" style="width: 8%">Média</th>
              <th class="numeric" style="width: 8%">EFP</th>
              <th class="numeric" style="width: 10%">Qtd Lote</th>
              <th style="width: 18%">Status Insumos</th>
              <th style="width: 10%">Prev. Normalização</th>
            </tr>
          </thead>
          <tbody>
            ${queuedProducts.map(p => {
              const qtyVal = manualQtys[p.codigo];
              const qtyToProduce = (qtyVal !== undefined && qtyVal !== '') 
                ? Number(qtyVal) 
                : (p.producao_recomendada > 0 ? p.producao_recomendada : 100);
              
              const isOnlyKit = p.produzir_apenas_kit === 1;
              const mediaStr = isOnlyKit ? '—' : p.demanda_ajustada.toFixed(1);
              const insumoInfo = insumosStatusMap[p.codigo];
              const stLabel = insumoInfo?.status_insumos === 'disponivel' 
                ? 'Insumos Prontos' 
                : insumoInfo?.status_insumos === 'aguardando_compras'
                ? 'Aguardando Pedidos'
                : insumoInfo?.status_insumos === 'sem_pedidos_compra'
                ? 'Falta Insumos (Sem Pedido)'
                : 'Sem Fórmula';

              const prevDate = insumoInfo?.previsao_normalizacao 
                ? new Date(insumoInfo.previsao_normalizacao).toLocaleDateString('pt-BR')
                : '—';

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
                  <td class="numeric" style="font-weight: 700;">${qtyToProduce.toLocaleString('pt-BR')} un</td>
                  <td><strong>${stLabel}</strong></td>
                  <td>${prevDate}</td>
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
      {/* Summary KPI Cards */}
      <section className="summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="summary-card abundant text-left">
          <div className="card-header">
            <span className="card-title">Itens na Fila</span>
            <div className="card-icon">
              <Boxes size={18} />
            </div>
          </div>
          <div className="card-value">{queuedProducts.length}</div>
          <div className="card-subtitle">Produtos na fila de produção</div>
        </div>

        <div className="summary-card ordem text-left">
          <div className="card-header">
            <span className="card-title">Volume a Fabricar</span>
            <div className="card-icon">
              <Play size={18} />
            </div>
          </div>
          <div className="card-value">{totalVolumeToProduce.toLocaleString()} un</div>
          <div className="card-subtitle">Soma das unidades planejadas</div>
        </div>

        <div className="summary-card saudavel text-left">
          <div className="card-header">
            <span className="card-title">Insumos Prontos</span>
            <div className="card-icon">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="card-value text-emerald-600">{insumoStats.prontos}</div>
          <div className="card-subtitle">Produtos com matérias-primas OK</div>
        </div>

        <div className="summary-card critico text-left">
          <div className="card-header">
            <span className="card-title">Aguardando Compras</span>
            <div className="card-icon">
              <Truck size={18} />
            </div>
          </div>
          <div className="card-value text-amber-600">{insumoStats.aguardando}</div>
          <div className="card-subtitle">{insumoStats.semPedido > 0 ? `${insumoStats.semPedido} sem pedido de compra` : 'Previsão calculada'}</div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar na Fila de Produção por REF ou descrição..." 
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
            title="Imprimir Fila de Produção e Previsão de Insumos"
          >
            <Printer size={15} />
            <span>Imprimir Fila</span>
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
            <span>Nenhum produto na Fila de Produção. Adicione itens clicando em "+" no Gerenciamento de Produção.</span>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-50">
                <tr className="border-b border-zinc-200">
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px]" style={{ width: '9%' }}>REF</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px]" style={{ width: '23%' }}>Descrição / Linha</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-right" style={{ width: '9%' }}>EFP</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-right" style={{ width: '8%' }}>Média</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-right" style={{ width: '11%' }}>Qtd a Produzir</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px]" style={{ width: '23%' }}>Insumos & Previsão Normalização</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px]" style={{ width: '9%' }}>Base</th>
                  <th className="px-4 py-3 font-bold text-zinc-650 uppercase tracking-wider text-[10px] text-center" style={{ width: '8%' }}>Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {queuedProducts.map((p) => {
                  const manualVal = manualQtys[p.codigo];
                  const qtyToProduce = (manualVal !== undefined && manualVal !== '') 
                    ? Number(manualVal) 
                    : (p.producao_recomendada > 0 ? p.producao_recomendada : 100);

                  const isOnlyKit = p.produzir_apenas_kit === 1;
                  const mediaStr = isOnlyKit ? '—' : p.demanda_ajustada.toFixed(1);

                  // Base validation
                  const baseProd = getBaseProduct(p);
                  const hasBase = !!p.base;
                  const currentConsumeBase = consumeBaseState[p.codigo] !== undefined 
                    ? consumeBaseState[p.codigo] 
                    : (baseProd && baseProd.estoque > 0);

                  const insumoData = insumosStatusMap[p.codigo];
                  const isLoadingInsumo = loadingInsumos[p.codigo];
                  const isExpanded = !!expandedProducts[p.codigo];

                  return (
                    <React.Fragment key={p.codigo}>
                      <tr className={`hover:bg-zinc-50/40 transition-colors ${isExpanded ? 'bg-zinc-50/60' : ''}`}>
                        {/* REF */}
                        <td className="px-4 py-3 align-middle font-mono font-bold text-zinc-650">
                          {p.codigo}
                        </td>

                        {/* Descricao */}
                        <td className="px-4 py-3 align-middle">
                          <div className="font-bold text-zinc-900">{p.descricao}</div>
                          <div className="text-[10px] text-zinc-400 font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>Linha: {p.nome_linha}</span>
                            {isOnlyKit && <span className="bg-indigo-50 text-indigo-700 px-1 py-0.2 rounded font-bold">Apenas Kit</span>}
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

                        {/* Qtd a Produzir Input */}
                        <td className="px-4 py-3 align-middle text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <input 
                              type="number"
                              className="text-right border border-zinc-250 rounded px-2 py-1 w-20 font-bold focus:outline-none focus:border-zinc-400 bg-white"
                              value={manualVal !== undefined ? manualVal : qtyToProduce}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleUpdateQty(p.codigo, val === '' ? '' : Number(val));
                              }}
                              min="1"
                            />
                            <span className="text-zinc-500 font-semibold text-[10px]">un</span>
                          </div>
                        </td>

                        {/* INSUMOS & PREVISÃO DE NORMALIZAÇÃO */}
                        <td className="px-4 py-3 align-middle">
                          {isLoadingInsumo ? (
                            <div className="flex items-center gap-1 text-zinc-400 text-[11px]">
                              <RefreshCw size={12} className="animate-spin" /> Verificando insumos...
                            </div>
                          ) : !insumoData ? (
                            <button
                              onClick={() => fetchInsumosStatus(p.codigo, qtyToProduce)}
                              className="text-[11px] text-zinc-500 hover:text-zinc-900 underline cursor-pointer"
                            >
                              Consultar insumos
                            </button>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {insumoData.status_insumos === 'disponivel' && (
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-750 border border-emerald-200 rounded-md font-bold text-[10px] flex items-center gap-1">
                                    <CheckCircle2 size={11} /> Insumos Disponíveis
                                  </span>
                                )}
                                {insumoData.status_insumos === 'aguardando_compras' && (
                                  <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md font-bold text-[10px] flex items-center gap-1">
                                    <Truck size={11} />
                                    <span>
                                      {insumoData.missing_count} em falta • Prev:{' '}
                                      {insumoData.previsao_normalizacao
                                        ? new Date(insumoData.previsao_normalizacao).toLocaleDateString('pt-BR')
                                        : 'A definir'}
                                    </span>
                                  </span>
                                )}
                                {insumoData.status_insumos === 'sem_pedidos_compra' && (
                                  <span className="px-2 py-0.5 bg-rose-50 text-rose-750 border border-rose-200 rounded-md font-bold text-[10px] flex items-center gap-1">
                                    <AlertTriangle size={11} />
                                    <span>Faltam {insumoData.missing_count} insumos (Sem Pedido)</span>
                                  </span>
                                )}
                                {insumoData.status_insumos === 'sem_formula' && (
                                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 border border-zinc-200 rounded-md font-medium text-[10px]">
                                    Sem Fórmula
                                  </span>
                                )}

                                {insumoData.has_formulation && (
                                  <button
                                    onClick={() => toggleExpand(p.codigo)}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60 border border-zinc-200 transition-colors flex items-center gap-0.5 cursor-pointer"
                                    title="Ver detalhamento de insumos e pedidos de compra"
                                  >
                                    {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                    <span>{isExpanded ? 'Ocultar' : 'Insumos'}</span>
                                  </button>
                                )}
                              </div>
                              {insumoData.previsao_normalizacao && (
                                <div className="text-[10px] text-zinc-500 font-medium">
                                  Previsão normalização: <strong className="text-zinc-800">{new Date(insumoData.previsao_normalizacao).toLocaleDateString('pt-BR')}</strong>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Base Control */}
                        <td className="px-4 py-3 align-middle">
                          {hasBase ? (
                            <div className="flex flex-col gap-0.5">
                              <label className="flex items-center gap-1 cursor-pointer select-none text-[11px]">
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
                                <span className="font-semibold text-zinc-700">Base</span>
                              </label>
                              {baseProd ? (
                                <div className="text-[9px] text-zinc-400">
                                  Est: <strong className={baseProd.estoque > 0 ? 'text-emerald-700' : 'text-rose-600'}>{baseProd.estoque}</strong>
                                </div>
                              ) : (
                                <div className="text-[9px] text-rose-500">Sem base</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-400 italic text-[10px]">Sem base</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 align-middle text-center">
                          <div className="flex gap-1 justify-center items-center">
                            <button 
                              className="px-2 py-1 rounded bg-zinc-900 text-white hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center gap-1 font-bold text-[10px]"
                              onClick={() => handleOpenApproveModal(p)}
                              title="Lançar Ordem de Produção"
                            >
                              <Check size={11} />
                              <span>Lançar</span>
                            </button>
                            <button 
                              className="p-1 rounded border border-zinc-200 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              onClick={() => onToggleApprovalList(p.codigo)}
                              title="Remover da Fila"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* EXPANDABLE INSUMOS & PEDIDOS DE COMPRA ACCORDION */}
                      {isExpanded && insumoData && insumoData.ingredients.length > 0 && (
                        <tr className="bg-zinc-50/80 border-b border-zinc-200">
                          <td colSpan={8} className="p-4">
                            <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-xs">
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-bold text-zinc-800 text-[11px] flex items-center gap-1.5">
                                  <Boxes size={14} className="text-zinc-600" />
                                  <span>Composição da Fórmula & Pedidos de Compra Pendentes (Lote: {qtyToProduce} un)</span>
                                </div>
                                <span className="text-[10px] text-zinc-400">
                                  {insumoData.ingredients.length} insumos mapeados
                                </span>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-[11px] border-collapse">
                                  <thead>
                                    <tr className="border-b border-zinc-200 text-zinc-500 bg-zinc-50 text-[10px] uppercase">
                                      <th className="py-1.5 px-2 text-left">Insumo / Embalagem</th>
                                      <th className="py-1.5 px-2 text-right">Por Unidade</th>
                                      <th className="py-1.5 px-2 text-right">Nec. Lote</th>
                                      <th className="py-1.5 px-2 text-right">Estoque Atual</th>
                                      <th className="py-1.5 px-2 text-center">Situação</th>
                                      <th className="py-1.5 px-2 text-left">Pedidos de Compra Pendentes</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-zinc-100">
                                    {insumoData.ingredients.map((ing) => (
                                      <tr key={ing.ingredient_code} className="hover:bg-zinc-50/60">
                                        <td className="py-1.5 px-2">
                                          <span className="font-mono font-bold text-zinc-700">{ing.ingredient_code}</span>
                                          <span className="ml-1.5 text-zinc-900 font-medium">{ing.description}</span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-mono text-zinc-600">
                                          {ing.qty_per_unit.toFixed(4)}
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-bold text-zinc-900">
                                          {ing.total_required.toFixed(2)}
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-bold text-zinc-800">
                                          {ing.current_stock.toFixed(2)}
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                          {ing.is_missing ? (
                                            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[9px] border border-rose-200">
                                              Falta {ing.missing_qty.toFixed(2)}
                                            </span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[9px] border border-emerald-200">
                                              OK
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-1.5 px-2">
                                          {ing.purchase_orders.length > 0 ? (
                                            <div className="flex flex-col gap-1">
                                              {ing.purchase_orders.map((po) => (
                                                <div 
                                                  key={po.n_pedido}
                                                  className="text-[10px] bg-blue-50 text-blue-900 px-2 py-0.5 rounded border border-blue-150 flex items-center justify-between gap-2"
                                                >
                                                  <span>
                                                    <strong>Ped #{po.n_pedido}</strong> • {po.c_nome_f || 'Fornecedor'} • Qtd: {po.n_pendente.toLocaleString()}
                                                  </span>
                                                  <span className="font-bold text-blue-800">
                                                    Prev: {po.d_previsao ? new Date(po.d_previsao).toLocaleDateString('pt-BR') : 'A definir'}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : ing.is_missing ? (
                                            <span className="text-[10px] text-rose-600 font-semibold italic">
                                              Sem pedido de compra em aberto
                                            </span>
                                          ) : (
                                            <span className="text-[10px] text-zinc-400">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Lançamento de Fila</span>
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
                    onChange={(e) => setApprovingProduct((prev: any) => ({ ...prev, date: e.target.value }))}
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
                  onChange={(e) => setApprovingProduct((prev: any) => ({ ...prev, obs: e.target.value }))}
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
                    <span>Lançando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Confirmar Produção</span>
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
