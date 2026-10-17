import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  Search, RefreshCw, Printer, AlertTriangle, CheckCircle2, BarChart3, 
  ArrowUp, ArrowDown, Package, Layers, TrendingUp, Activity, Filter, 
  EyeOff, Eye, RotateCcw, Palette, X, Check, SlidersHorizontal, 
  Clock, Truck, CheckCircle, ShieldAlert, Percent, Settings2, Undo2, Box
} from 'lucide-react';

interface StockHealthTabProps {
  allProducts: any[];
  coloracoes?: any[];
  kits: any[];
  configs: any[];
  loading: boolean;
  onRefresh: () => void;
  onShowDetails: (code: string) => void;
}

export function StockHealthTab({ 
  allProducts = [], 
  coloracoes = [],
  kits = [], 
  configs = [], 
  loading, 
  onRefresh, 
  onShowDetails 
}: StockHealthTabProps) {
  // Main view section: produtos | coloracoes | kits | ocultos
  const [activeSection, setActiveSection] = useState<'produtos' | 'coloracoes' | 'kits' | 'ocultos'>('produtos');
  
  // Filtering & search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHealthFilter, setSelectedHealthFilter] = useState('ALL');
  const [sortField, setSortField] = useState('saude_pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  
  // Advanced Subcategory & Line Scope Filters
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [includeBases, setIncludeBases] = useState<boolean>(true);
  const [includeLancamentos, setIncludeLancamentos] = useState<boolean>(true);
  const [includeKitOnly, setIncludeKitOnly] = useState<boolean>(true);
  const [showExcludedItems, setShowExcludedItems] = useState<boolean>(false);

  // Popover state
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  // Print Configuration Modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printFilterType, setPrintFilterType] = useState<'all' | 'below_threshold' | 'critical_only' | 'rupture_only'>('below_threshold');
  const [printThreshold, setPrintThreshold] = useState<number>(90);

  // Close filter popover on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setFilterPopoverOpen(false);
      }
    }
    if (filterPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterPopoverOpen]);

  // Excluded individual items from health calculation (persisted in localStorage)
  const [excludedCodes, setExcludedCodes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('natum_stock_health_excluded_codes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save exclusions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('natum_stock_health_excluded_codes', JSON.stringify(excludedCodes));
    } catch (e) {
      console.error(e);
    }
  }, [excludedCodes]);

  // Helper to identify if a product is a Coloration
  const isColoracao = (p: any) => {
    return (
      p.categoria_produto === 'cat_coloracao' ||
      p.categoria_produto === 'coloracao' ||
      (typeof p.codigo === 'string' && p.codigo.replace(/\./g, '').startsWith('134')) ||
      (typeof p.codigo === 'string' && p.codigo.startsWith('1.34.')) ||
      p.linha_prefix === '1.34'
    );
  };

  // Helper to check if a product is a Base
  const isBaseProduct = (p: any) => {
    return (
      p.status_produto === 'bases' ||
      p.status === 'bases' ||
      p.categoria_produto === 'cat_base' ||
      Boolean(p.base_codigo)
    );
  };

  // Map each component code to its parent Kits
  const componentToParentKits = useMemo(() => {
    const map = new Map<string, any[]>();
    (kits || []).forEach((kit: any) => {
      if (Array.isArray(kit.componentes)) {
        kit.componentes.forEach((comp: any) => {
          const cCode = comp.codigo;
          if (!map.has(cCode)) {
            map.set(cCode, []);
          }
          map.get(cCode)!.push(kit);
        });
      }
    });
    return map;
  }, [kits]);

  // Extract all available lines dynamically from configs + products
  const availableLines = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    
    // Seed from configs (config_linhas)
    if (Array.isArray(configs)) {
      configs.forEach((c: any) => {
        if (c.linha_prefix && c.visivel !== 0) {
          map.set(String(c.linha_prefix), {
            id: String(c.linha_prefix),
            name: c.nome_linha || `Linha ${c.linha_prefix}`,
            count: 0
          });
        }
      });
    }

    // Count and discover lines from products
    allProducts.forEach((p: any) => {
      if (p.visivel !== 0 && p.categoria_produto !== 'kit' && !isColoracao(p)) {
        const prefix = String(p.linha_prefix || 'DEFAULT');
        const existing = map.get(prefix);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(prefix, {
            id: prefix,
            name: p.nome_linha || `Linha ${prefix}`,
            count: 1
          });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [configs, allProducts]);

  // Helper to calculate health safely and logically:
  // - If ideal > 0: ratio = stockValue / ideal, bounded between 0% and 100%
  // - If ideal <= 0:
  //     - If stockValue >= 0: 100% (has positive physical stock and no required demand, fully stocked)
  //     - If stockValue < 0: 0% (negative balance with open orders)
  const computeSafeHealth = (stockValue: number, idealValue: number) => {
    if (idealValue === null || idealValue === undefined || idealValue <= 0) {
      return stockValue >= 0 ? 100 : 0;
    }
    const ratio = stockValue / idealValue;
    return Math.max(0, Math.min(1, ratio)) * 100;
  };

  // Process and categorize all datasets
  const { 
    productsData, 
    coloracoesData, 
    kitsData, 
    activeData, 
    globalKPIs 
  } = useMemo(() => {
    const isManuallyExcluded = (code: string) => excludedCodes.includes(code);

    // Rule to determine if an item is excluded from scope based on subcategory switches
    const isSubcategoryExcluded = (p: any) => {
      if (!includeBases && isBaseProduct(p)) return true;
      if (!includeLancamentos && (p.is_lancamento || p.status === 'lancamento')) return true;
      if (!includeKitOnly && p.produzir_apenas_kit === 1) return true;
      if (selectedLines.length > 0 && !selectedLines.includes(String(p.linha_prefix))) return true;
      return false;
    };

    // 1. Process regular finished products
    const rawProducts = allProducts.filter((p: any) => 
      p.visivel !== 0 && 
      p.categoria_produto !== 'kit' && 
      !isColoracao(p)
    );

    const processedProducts = rawProducts.map((p: any) => {
      const efp = p.estoque_futuro_com_producao ?? (p.estoque + (p.producao || 0) - (p.pedidos_aberto || 0));
      const ideal = p.estoque_ideal_qtd || 0;
      let saude_pct = computeSafeHealth(efp, ideal);
      let deficit = Math.max(0, ideal - efp);
      let status = p.status || 'saudavel';
      let status_label = p.status_label || (status === 'critico' ? 'Crítico' : status === 'ordem' ? 'Ordem' : 'OK');
      let producao_recomendada = p.producao_recomendada || 0;

      // Special Rule: If product is produced ONLY for Kit (produzir_apenas_kit === 1)
      const isOnlyKit = p.produzir_apenas_kit === 1;
      if (isOnlyKit) {
        const parentKits = componentToParentKits.get(p.codigo) || [];
        if (parentKits.length > 0) {
          // Check if any parent kit has critical shortage specifically on this component
          const isCriticalBottleneck = parentKits.some(k => 
            Array.isArray(k.componentes_criticos) && 
            k.componentes_criticos.some((c: any) => c.codigo === p.codigo)
          );

          if (!isCriticalBottleneck) {
            // Parent kits are satisfied with this component's stock
            saude_pct = 100;
            status = 'saudavel';
            status_label = 'OK (Via Kit)';
            producao_recomendada = 0;
            deficit = 0;
          } else {
            // Inherit average or lowest health from parent kits that require this component
            const parentKitHealths = parentKits.map(k => {
              const kStock = k.estoque || 0;
              const kIdeal = k.estoque_ideal_qtd || 0;
              return computeSafeHealth(kStock, kIdeal);
            });
            const minKitHealth = Math.min(...parentKitHealths);
            saude_pct = Math.max(saude_pct, minKitHealth);
            if (saude_pct >= 60) {
              status = 'saudavel';
              status_label = 'OK (Via Kit)';
            }
          }
        } else if ((p.estoque || 0) >= 0) {
          // If marked only for kit and stock is non-negative
          saude_pct = 100;
          status = 'saudavel';
          status_label = 'OK (Apenas Kit)';
          producao_recomendada = 0;
          deficit = 0;
        }
      }

      const manualEx = isManuallyExcluded(p.codigo);
      const subEx = isSubcategoryExcluded(p);
      const isExcluded = manualEx || subEx;

      return { 
        ...p, 
        efp,
        saude_pct, 
        deficit,
        status,
        status_label,
        producao_recomendada,
        isOnlyKit,
        isExcluded,
        manualEx,
        subEx
      };
    });

    // 2. Process Colorações (with purchasing periods, transit and temporal normalization forecast)
    const coloracoesMap = new Map<string, any>();
    
    (coloracoes || []).forEach((c: any) => {
      if (c.visivel !== 0) coloracoesMap.set(c.codigo, c);
    });

    allProducts.forEach((p: any) => {
      if (p.visivel !== 0 && isColoracao(p)) {
        if (!coloracoesMap.has(p.codigo)) {
          coloracoesMap.set(p.codigo, p);
        }
      }
    });

    const rawColoracoes = Array.from(coloracoesMap.values());

    const processedColoracoes = rawColoracoes.map((p: any) => {
      const stockFisico = p.estoque || 0;
      const transit = p.pedidos_compra_aberto || 0;
      const faltas = p.faltas_ativas || p.pedidos_aberto || 0;
      const saldoAtualSemTransito = stockFisico - faltas;
      const saldoPosTransito = stockFisico + transit - faltas;
      const targetDays = p.target_days_computed || p.target_days || 90;
      const mediaVendas = p.media_vendas || 0;
      const ideal = p.estoque_ideal_qtd || ((targetDays / 30) * mediaVendas);
      
      const saudeAtualPct = computeSafeHealth(saldoAtualSemTransito, ideal);
      const saudePosTransitoPct = computeSafeHealth(saldoPosTransito, ideal);
      const deficitAtual = Math.max(0, ideal - saldoAtualSemTransito);
      const deficitPos = Math.max(0, ideal - saldoPosTransito);

      const diasCoberturaAtual = mediaVendas > 0 ? Math.round((saldoAtualSemTransito / mediaVendas) * 30) : 999;
      const diasCoberturaPos = mediaVendas > 0 ? Math.round((saldoPosTransito / mediaVendas) * 30) : 999;

      // Temporal normalization diagnostic
      let statusPrevisao = 'ok';
      let previsaoTexto = '';
      if (saldoAtualSemTransito >= ideal) {
        statusPrevisao = 'normalizado';
        previsaoTexto = 'Estoque Normalizado';
      } else if (transit > 0) {
        if (saudePosTransitoPct >= 85) {
          statusPrevisao = 'normaliza_com_transito';
          previsaoTexto = `Normaliza (+${transit} un)`;
        } else {
          statusPrevisao = 'parcial_com_transito';
          previsaoTexto = `Parcial (+${transit} un)`;
        }
      } else {
        statusPrevisao = 'sem_transito';
        previsaoTexto = `Sem pedido (Falta ${Math.round(deficitAtual)})`;
      }

      const manualEx = isManuallyExcluded(p.codigo);
      const subEx = isSubcategoryExcluded(p);
      const isExcluded = manualEx || subEx;

      return { 
        ...p, 
        stockFisico,
        transit,
        faltas,
        saldoAtualSemTransito,
        saldoPosTransito,
        targetDays,
        mediaVendas,
        estoque_ideal_qtd: ideal,
        saude_pct: saudePosTransitoPct,
        saudeAtualPct,
        deficit: deficitPos,
        diasCoberturaAtual,
        diasCoberturaPos,
        statusPrevisao,
        previsaoTexto,
        isExcluded,
        manualEx,
        subEx
      };
    });

    // 3. Process Kits
    const rawKits = kits.filter((k: any) => k.visivel !== 0);
    const processedKits = rawKits.map((k: any) => {
      const stock = k.estoque || 0;
      const ideal = k.estoque_ideal_qtd || 0;
      const saude_pct = computeSafeHealth(stock, ideal);
      const deficit = Math.max(0, ideal - stock);
      const manualEx = isManuallyExcluded(k.codigo);
      return { 
        ...k, 
        saude_pct, 
        deficit,
        isExcluded: manualEx,
        manualEx
      };
    });

    // Active dataset
    let currentList = processedProducts;
    if (activeSection === 'coloracoes') currentList = processedColoracoes;
    if (activeSection === 'kits') currentList = processedKits;

    // Strict Rule: ONLY non-excluded items participate in the health KPIs
    const includedForHealth = currentList.filter(item => !item.isExcluded);

    const totalCritico = includedForHealth.filter(p => {
      if (p.estoque_ideal_qtd <= 0) return (p.efp ?? p.saldoPosTransito ?? p.estoque) < 0;
      return p.status === 'critico';
    }).length;

    const totalOrdem = includedForHealth.filter(p => {
      if (p.estoque_ideal_qtd <= 0) return false;
      return p.status === 'ordem';
    }).length;

    const totalOk = includedForHealth.filter(p => {
      if (p.estoque_ideal_qtd <= 0) return (p.efp ?? p.saldoPosTransito ?? p.estoque) >= 0;
      return p.status === 'saudavel' || p.status === 'abundante';
    }).length;

    const producaoPendente = includedForHealth.reduce((acc, p) => acc + (p.producao_recomendada > 0 ? p.producao_recomendada : (p.sugestao_compra > 0 ? p.sugestao_compra : 0)), 0);
    const avgSaude = includedForHealth.length > 0
      ? includedForHealth.reduce((acc, p) => acc + p.saude_pct, 0) / includedForHealth.length
      : 0;

    return {
      productsData: processedProducts,
      coloracoesData: processedColoracoes,
      kitsData: processedKits,
      activeData: currentList,
      globalKPIs: {
        saudeGlobal: avgSaude,
        totalItensCalculados: includedForHealth.length,
        totalCritico,
        totalOrdem,
        totalOk,
        producaoPendente,
      }
    };
  }, [allProducts, coloracoes, kits, excludedCodes, selectedLines, includeBases, includeLancamentos, includeKitOnly, activeSection, componentToParentKits]);

  // List of all items currently manually excluded across all types
  const hiddenItemsList = useMemo(() => {
    if (excludedCodes.length === 0) return [];
    
    const catalogMap = new Map<string, any>();

    (allProducts || []).forEach((p: any) => {
      if (p.codigo && !catalogMap.has(p.codigo)) {
        const isCol = isColoracao(p);
        const isKit = p.categoria_produto === 'kit';
        catalogMap.set(p.codigo, {
          ...p,
          itemType: isCol ? 'coloracao' : isKit ? 'kit' : 'produto',
          itemTypeLabel: isCol ? 'Coloração' : isKit ? 'Kit' : 'Produto Acabado',
          ideal: p.estoque_ideal_qtd || 0,
          saude: computeSafeHealth(p.estoque_futuro_com_producao ?? p.estoque, p.estoque_ideal_qtd || 0)
        });
      }
    });

    (coloracoes || []).forEach((c: any) => {
      if (c.codigo && !catalogMap.has(c.codigo)) {
        catalogMap.set(c.codigo, {
          ...c,
          itemType: 'coloracao',
          itemTypeLabel: 'Coloração',
          ideal: c.estoque_ideal_qtd || 0,
          saude: computeSafeHealth(c.saldoAtualSemTransito ?? c.estoque, c.estoque_ideal_qtd || 0)
        });
      }
    });

    (kits || []).forEach((k: any) => {
      if (k.codigo && !catalogMap.has(k.codigo)) {
        catalogMap.set(k.codigo, {
          ...k,
          itemType: 'kit',
          itemTypeLabel: 'Kit Comercial',
          ideal: k.estoque_ideal_qtd || 0,
          saude: computeSafeHealth(k.estoque || 0, k.estoque_ideal_qtd || 0)
        });
      }
    });

    return excludedCodes.map(code => {
      const found = catalogMap.get(code);
      if (found) return found;
      return {
        codigo: code,
        descricao: 'Item Ocultado',
        itemTypeLabel: 'Item',
        estoque: 0,
        ideal: 0,
        saude: 0
      };
    });
  }, [excludedCodes, allProducts, coloracoes, kits]);

  // Toggle individual item exclusion
  const handleToggleExclude = (code: string) => {
    setExcludedCodes(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  // Restore all excluded items
  const handleRestoreAllExcluded = () => {
    setExcludedCodes([]);
  };

  // Toggle line selection
  const handleToggleLine = (prefix: string) => {
    setSelectedLines(prev => 
      prev.includes(prefix) ? prev.filter(p => p !== prefix) : [...prev, prefix]
    );
  };

  const handleSelectAllLines = () => {
    setSelectedLines([]);
  };

  // Filter & Sort table items for screen display
  const filteredItems = useMemo(() => {
    let result = activeData;

    // By default, if showExcludedItems is false, hide any item that is excluded from health
    if (!showExcludedItems && selectedHealthFilter !== 'excluidos') {
      result = result.filter(p => !p.isExcluded);
    }

    // Search term
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(p => 
        (p.codigo && p.codigo.toLowerCase().includes(lower)) || 
        (p.descricao && p.descricao.toLowerCase().includes(lower))
      );
    }

    // Health status filter
    if (selectedHealthFilter !== 'ALL') {
      if (selectedHealthFilter === 'saudavel') {
        result = result.filter(p => p.status === 'saudavel' || p.status === 'abundante');
      } else if (selectedHealthFilter === 'excluidos') {
        result = result.filter(p => p.isExcluded);
      } else {
        result = result.filter(p => p.status === selectedHealthFilter && !p.isExcluded);
      }
    }

    // Sort
    return result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [activeData, searchTerm, selectedHealthFilter, sortField, sortDir, showExcludedItems]);

  // Compute items targeted for the printable report based on modal settings
  const printableItems = useMemo(() => {
    let list = activeData.filter(p => !p.isExcluded);

    if (printFilterType === 'below_threshold') {
      list = list.filter(p => {
        const health = activeSection === 'coloracoes' ? p.saudeAtualPct : p.saude_pct;
        return health < printThreshold;
      });
    } else if (printFilterType === 'critical_only') {
      list = list.filter(p => p.status === 'critico' || p.status === 'ordem' || p.saude_pct < 60);
    } else if (printFilterType === 'rupture_only') {
      list = list.filter(p => (p.estoque <= 0 || (p.saldoPosTransito ?? p.efp ?? p.estoque) <= 0));
    }

    // Default sorting for print: worst health first
    return list.sort((a, b) => {
      const healthA = activeSection === 'coloracoes' ? a.saudeAtualPct : a.saude_pct;
      const healthB = activeSection === 'coloracoes' ? b.saudeAtualPct : b.saude_pct;
      return healthA - healthB;
    });
  }, [activeData, printFilterType, printThreshold, activeSection]);

  const executePrint = () => {
    setPrintModalOpen(false);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ArrowUp size={13} className="inline ml-1" /> : <ArrowDown size={13} className="inline ml-1" />;
  };

  const getProgressBarColor = (pct: number) => {
    if (pct < 37.5) return 'hsl(var(--danger-hsl))';
    if (pct < 60) return 'hsl(var(--warning-hsl))';
    return 'hsl(var(--success-hsl))';
  };

  const totalHiddenCount = excludedCodes.length;
  const nowFormatted = new Date().toLocaleString('pt-BR');

  return (
    <div className="view-container stock-health-root animate-in fade-in duration-200" style={{ paddingBottom: 30 }}>
      
      {/* ========================================================================= */}
      {/* 1. SCREEN VIEW (Interactive, Hidden on Print)                              */}
      {/* ========================================================================= */}
      <div className="screen-content no-print">
        {/* Screen Header Actions */}
        <div className="screen-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'hsl(var(--text-primary-hsl))' }}>
              Saúde do Estoque
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 1 }}>
              Monitoramento de metas ideais, ponto de reposição e gargalos
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button 
              className="tab-btn" 
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: '0.75rem', backgroundColor: 'hsl(var(--primary-hsl))', color: '#ffffff', fontWeight: 700 }} 
              onClick={() => setPrintModalOpen(true)}
              title="Configurar e imprimir relatório personalizado"
            >
              <Printer size={15} /> Imprimir Relatório...
            </button>
            <button 
              className="tab-btn" 
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: '0.75rem' }} 
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
            </button>
          </div>
        </div>

        {/* COMPACT KPI CARDS */}
        <div className="summary-grid stock-health-kpi-grid" style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.5rem' }}>
          {/* Card 1: Saúde Geral */}
          <div className="summary-card" style={{ padding: '0.55rem 0.75rem', display: 'flex', alignItems: 'center', gap: 10, minHeight: 'unset' }}>
            <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: `conic-gradient(${getProgressBarColor(globalKPIs.saudeGlobal)} ${globalKPIs.saudeGlobal}%, #f4f4f5 0)` }}>
              <div style={{ position: 'absolute', width: 36, height: 36, backgroundColor: '#ffffff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '0.82rem', color: 'hsl(var(--text-primary-hsl))' }}>
                  {Math.round(globalKPIs.saudeGlobal)}%
                </span>
              </div>
            </div>
            <div>
              <div className="card-title" style={{ fontSize: '0.72rem', fontWeight: 700, margin: 0 }}>
                Saúde {activeSection === 'produtos' ? 'Produtos' : activeSection === 'coloracoes' ? 'Colorações' : activeSection === 'kits' ? 'Kits' : 'Geral'}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 1 }}>
                {globalKPIs.totalItensCalculados} itens no escopo
              </div>
            </div>
          </div>

          {/* Card 2: Crítico */}
          <div className="summary-card critico" style={{ padding: '0.55rem 0.75rem', minHeight: 'unset' }}>
            <div className="card-header" style={{ marginBottom: 1 }}>
              <div className="card-title" style={{ fontSize: '0.72rem' }}>Produzir Urgente</div>
              <div className="card-icon" style={{ padding: 2 }}><AlertTriangle size={14} /></div>
            </div>
            <div className="card-value" style={{ fontSize: '1.15rem', lineHeight: 1.15 }}>{globalKPIs.totalCritico}</div>
            <div className="card-subtitle" style={{ fontSize: '0.62rem', marginTop: 1 }}>Itens em estado crítico</div>
          </div>

          {/* Card 3: Ordem */}
          <div className="summary-card ordem" style={{ padding: '0.55rem 0.75rem', minHeight: 'unset' }}>
            <div className="card-header" style={{ marginBottom: 1 }}>
              <div className="card-title" style={{ fontSize: '0.72rem' }}>Abrir Ordem</div>
              <div className="card-icon" style={{ padding: 2 }}><Activity size={14} /></div>
            </div>
            <div className="card-value" style={{ fontSize: '1.15rem', lineHeight: 1.15 }}>{globalKPIs.totalOrdem}</div>
            <div className="card-subtitle" style={{ fontSize: '0.62rem', marginTop: 1 }}>Itens em ponto de ordem</div>
          </div>

          {/* Card 4: Saudável */}
          <div className="summary-card saudavel" style={{ padding: '0.55rem 0.75rem', minHeight: 'unset' }}>
            <div className="card-header" style={{ marginBottom: 1 }}>
              <div className="card-title" style={{ fontSize: '0.72rem' }}>Estoque OK</div>
              <div className="card-icon" style={{ padding: 2 }}><CheckCircle2 size={14} /></div>
            </div>
            <div className="card-value" style={{ fontSize: '1.15rem', lineHeight: 1.15 }}>{globalKPIs.totalOk}</div>
            <div className="card-subtitle" style={{ fontSize: '0.62rem', marginTop: 1 }}>Estoque saudável</div>
          </div>

          {/* Card 5: Produção Recomendada */}
          <div className="summary-card" style={{ padding: '0.55rem 0.75rem', minHeight: 'unset' }}>
            <div className="card-header" style={{ marginBottom: 1 }}>
              <div className="card-title" style={{ fontSize: '0.72rem' }}>
                {activeSection === 'coloracoes' ? 'Sug. Reposição' : 'Produção Pendente'}
              </div>
              <div className="card-icon" style={{ padding: 2 }}><TrendingUp size={14} /></div>
            </div>
            <div className="card-value" style={{ fontSize: '1.15rem', lineHeight: 1.15 }}>{globalKPIs.producaoPendente.toLocaleString('pt-BR')}</div>
            <div className="card-subtitle" style={{ fontSize: '0.62rem', marginTop: 1 }}>Unidades recomendadas</div>
          </div>
        </div>

        {/* Main Section Navigation Tabs */}
        <div className="tabs-container" style={{ marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button 
            className={`tab-btn ${activeSection === 'produtos' ? 'active' : ''}`}
            onClick={() => setActiveSection('produtos')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '5px 12px', fontSize: '0.78rem' }}
          >
            <Package size={14} /> Produtos Individuais ({productsData.filter(p => !p.isExcluded).length})
          </button>
          <button 
            className={`tab-btn ${activeSection === 'coloracoes' ? 'active' : ''}`}
            onClick={() => setActiveSection('coloracoes')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '5px 12px', fontSize: '0.78rem' }}
          >
            <Palette size={14} /> Colorações ({coloracoesData.filter(p => !p.isExcluded).length})
          </button>
          <button 
            className={`tab-btn ${activeSection === 'kits' ? 'active' : ''}`}
            onClick={() => setActiveSection('kits')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '5px 12px', fontSize: '0.78rem' }}
          >
            <Layers size={14} /> Kits Comerciais ({kitsData.filter(k => !k.isExcluded).length})
          </button>
          <button 
            className={`tab-btn ${activeSection === 'ocultos' ? 'active' : ''}`}
            onClick={() => setActiveSection('ocultos')}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 6, 
              fontWeight: 700, 
              padding: '5px 12px', 
              fontSize: '0.78rem',
              color: totalHiddenCount > 0 ? 'hsl(var(--warning-hsl))' : undefined,
              borderColor: totalHiddenCount > 0 && activeSection !== 'ocultos' ? 'hsl(var(--warning-hsl))' : undefined
            }}
          >
            <EyeOff size={14} /> Itens Ocultos ({totalHiddenCount})
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 4: ITENS OCULTOS DEDICATED VIEW                                       */}
        {/* ========================================================================= */}
        {activeSection === 'ocultos' ? (
          <div className="panel-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid hsl(var(--card-border-hsl))', paddingBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <EyeOff size={16} style={{ color: 'hsl(var(--warning-hsl))' }} />
                  Itens Ocultados Individualmente ({hiddenItemsList.length})
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary-hsl))', margin: '2px 0 0 0' }}>
                  Estes itens foram removidos do cálculo de saúde do estoque. Você pode escolher individualmente quais deseja restaurar.
                </p>
              </div>
              {hiddenItemsList.length > 0 && (
                <button
                  onClick={handleRestoreAllExcluded}
                  className="tab-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: 'hsl(var(--success-hsl))', color: '#ffffff', border: 'none' }}
                >
                  <RotateCcw size={14} /> Reativar Todos os Itens Ocultos
                </button>
              )}
            </div>

            {hiddenItemsList.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '10%' }}>Código</th>
                      <th style={{ width: '12%' }}>Tipo</th>
                      <th style={{ width: '38%' }}>Descrição do Item</th>
                      <th className="numeric-col" style={{ width: '10%' }}>Estoque</th>
                      <th className="numeric-col" style={{ width: '10%' }}>Meta Ideal</th>
                      <th style={{ width: '10%' }}>% Saúde</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hiddenItemsList.map((item: any) => (
                      <tr key={item.codigo}>
                        <td>
                          <button 
                            className="product-code hover:underline" 
                            onClick={() => onShowDetails(item.codigo)}
                            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                          >
                            {item.codigo}
                          </button>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 3, backgroundColor: '#f4f4f5', border: '1px solid hsl(var(--card-border-hsl))', fontWeight: 700 }}>
                            {item.itemTypeLabel}
                          </span>
                        </td>
                        <td>
                          <div className="product-desc" style={{ fontWeight: 600 }}>{item.descricao}</div>
                          <div className="product-subinfo" style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                            {item.nome_linha || 'Geral'}
                          </div>
                        </td>
                        <td className="numeric-col" style={{ fontWeight: 600 }}>
                          {(item.estoque || 0).toLocaleString('pt-BR')}
                        </td>
                        <td className="numeric-col" style={{ color: 'hsl(var(--text-secondary-hsl))' }}>
                          {(item.ideal || 0).toLocaleString('pt-BR')}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                            {Math.round(item.saude || 0)}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleToggleExclude(item.codigo)}
                            className="tab-btn"
                            style={{ 
                              padding: '4px 10px', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: 5, 
                              fontSize: '0.72rem', 
                              fontWeight: 700,
                              color: 'hsl(var(--success-hsl))',
                              borderColor: 'hsl(var(--success-hsl))',
                              backgroundColor: 'transparent'
                            }}
                            title="Reativar este item de volta no cálculo de saúde do estoque"
                          >
                            <Undo2 size={13} /> Voltar ao Estoque
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'hsl(var(--text-secondary-hsl))' }}>
                <CheckCircle2 size={36} style={{ margin: '0 auto 10px auto', color: 'hsl(var(--success-hsl))', opacity: 0.8 }} />
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'hsl(var(--text-primary-hsl))' }}>
                  Nenhum item ocultado no momento
                </div>
                <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
                  Todos os produtos acabados, colorações e kits estão ativos e participando do cálculo de saúde do estoque.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* REGULAR PRODUCTS / COLORACOES / KITS VIEW */
          <>
            {/* Filtering & Customization Toolbar */}
            <div className="panel-card" style={{ marginBottom: 10, padding: '8px 12px' }}>
              <div className="toolbar-section" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="search-input-wrapper" style={{ minWidth: 220, flex: '1 1 auto' }}>
                  <Search size={15} className="search-icon" />
                  <input 
                    type="text" 
                    className="search-input" 
                    style={{ fontSize: '0.78rem', padding: '5px 8px 5px 28px' }}
                    placeholder={`Buscar ${activeSection === 'produtos' ? 'produto' : activeSection === 'coloracoes' ? 'coloração' : 'kit'}...`}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="filters-wrapper" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {/* Status Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Filter size={13} style={{ color: 'hsl(var(--text-secondary-hsl))' }} />
                    <select 
                      className="select-filter" 
                      style={{ fontSize: '0.75rem', padding: '3px 6px' }}
                      value={selectedHealthFilter} 
                      onChange={e => setSelectedHealthFilter(e.target.value)}
                    >
                      <option value="ALL">Todos os Status</option>
                      <option value="critico">Crítico (Urgente)</option>
                      <option value="ordem">Ordem (Alerta)</option>
                      <option value="saudavel">Saudável / Abundante</option>
                      <option value="excluidos">Itens Fora do Cálculo</option>
                    </select>
                  </div>

                  {/* Scope / Subcategories / Lines Master Popover (SOLID THEMED POPUP) */}
                  {activeSection !== 'kits' && (
                    <div style={{ position: 'relative' }} ref={filterPopoverRef}>
                      <button
                        type="button"
                        onClick={() => setFilterPopoverOpen(!filterPopoverOpen)}
                        className="tab-btn cursor-pointer"
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 5, 
                          padding: '3px 8px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: selectedLines.length > 0 || !includeBases || !includeLancamentos ? '#f4f4f5' : undefined,
                          borderColor: selectedLines.length > 0 || !includeBases || !includeLancamentos ? 'hsl(var(--text-primary-hsl))' : undefined
                        }}
                      >
                        <SlidersHorizontal size={13} />
                        <span>Escopo de Linhas & Categorias</span>
                        {selectedLines.length > 0 && (
                          <span style={{ 
                            backgroundColor: 'hsl(var(--text-primary-hsl))', 
                            color: '#ffffff',
                            borderRadius: 10, 
                            padding: '1px 5px', 
                            fontSize: '0.62rem', 
                            fontWeight: 800 
                          }}>
                            {selectedLines.length}
                          </span>
                        )}
                      </button>

                      {filterPopoverOpen && (
                        <div 
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: '100%',
                            marginTop: 6,
                            width: 320,
                            maxHeight: 380,
                            overflowY: 'auto',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e4e4e7',
                            borderRadius: 10,
                            boxShadow: '0 15px 35px rgba(0,0,0,0.22)',
                            padding: 12,
                            zIndex: 300,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e4e4e7', paddingBottom: 6 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'hsl(var(--text-primary-hsl))' }}>
                              Configurar Escopo da Saúde
                            </span>
                            <button 
                              onClick={handleSelectAllLines}
                              style={{ fontSize: '0.7rem', color: 'hsl(var(--primary-hsl))', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}
                            >
                              Marcar Todas as Linhas
                            </button>
                          </div>

                          {/* Subcategories & Special Types Group */}
                          <div style={{ backgroundColor: '#f4f4f5', padding: '6px 8px', borderRadius: 6 }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-secondary-hsl))', display: 'block', marginBottom: 4 }}>
                              SUBCATEGORIAS & TIPOS ESPECIAIS
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', cursor: 'pointer' }}>
                                <input 
                                  type="checkbox" 
                                  checked={includeBases} 
                                  onChange={(e) => setIncludeBases(e.target.checked)} 
                                />
                                <span>Incluir Produtos que são <strong>Bases</strong></span>
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', cursor: 'pointer' }}>
                                <input 
                                  type="checkbox" 
                                  checked={includeLancamentos} 
                                  onChange={(e) => setIncludeLancamentos(e.target.checked)} 
                                />
                                <span>Incluir <strong>Novos Lançamentos</strong></span>
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', cursor: 'pointer' }}>
                                <input 
                                  type="checkbox" 
                                  checked={includeKitOnly} 
                                  onChange={(e) => setIncludeKitOnly(e.target.checked)} 
                                />
                                <span>Incluir <strong>Produzir Apenas p/ Kit</strong></span>
                              </label>
                            </div>
                          </div>

                          {/* Lines List Group */}
                          <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-secondary-hsl))', display: 'block', marginBottom: 4 }}>
                              LINHAS DE PRODUTO
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
                              {availableLines.map((l) => {
                                const isSelected = selectedLines.includes(l.id);
                                return (
                                  <label 
                                    key={l.id} 
                                    style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'space-between',
                                      gap: 6, 
                                      fontSize: '0.75rem', 
                                      cursor: 'pointer',
                                      padding: '4px 6px',
                                      borderRadius: 4,
                                      backgroundColor: isSelected ? '#f4f4f5' : 'transparent',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <input 
                                        type="checkbox" 
                                        checked={isSelected}
                                        onChange={() => handleToggleLine(l.id)}
                                      />
                                      <span style={{ fontWeight: isSelected ? 700 : 500 }}>{l.name}</span>
                                    </div>
                                    <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                                      {l.count} itens
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div style={{ borderTop: '1px solid #e4e4e7', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={showExcludedItems}
                                onChange={(e) => setShowExcludedItems(e.target.checked)}
                              />
                              <span>Listar itens fora da saúde</span>
                            </label>
                            <button
                              onClick={() => setFilterPopoverOpen(false)}
                              className="tab-btn"
                              style={{ padding: '3px 8px', fontSize: '0.75rem', fontWeight: 700 }}
                            >
                              Aplicar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Filter Pills */}
              {selectedLines.length > 0 && activeSection !== 'kits' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid hsl(var(--card-border-hsl))' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--text-secondary-hsl))' }}>
                    Linhas Ativas no Cálculo:
                  </span>
                  {selectedLines.map(lineId => {
                    const lineObj = availableLines.find(l => l.id === lineId);
                    const label = lineObj ? lineObj.name : `Linha ${lineId}`;
                    return (
                      <span 
                        key={lineId}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          backgroundColor: '#f4f4f5',
                          border: '1px solid hsl(var(--card-border-hsl))',
                          padding: '1px 6px',
                          borderRadius: 10
                        }}
                      >
                        {label}
                        <button
                          onClick={() => handleToggleLine(lineId)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'hsl(var(--text-secondary-hsl))' }}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                  <button
                    onClick={handleSelectAllLines}
                    style={{ fontSize: '0.65rem', color: 'hsl(var(--danger-hsl))', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, marginLeft: 4 }}
                  >
                    Limpar linhas
                  </button>
                </div>
              )}
            </div>

            {/* Main Table for Screen */}
            <div className="panel-card stock-health-table-panel" style={{ overflowX: 'auto', padding: 0 }}>
              <table className="data-table">
                <thead>
                  {activeSection === 'coloracoes' ? (
                    /* Dedicated Header for Colorações */
                    <tr>
                      <th onClick={() => toggleSort('codigo')} style={{ cursor: 'pointer', width: '8%', whiteSpace: 'nowrap' }}>
                        Código {renderSortIcon('codigo')}
                      </th>
                      <th onClick={() => toggleSort('descricao')} style={{ cursor: 'pointer', width: '27%' }}>
                        Coloração / Linha {renderSortIcon('descricao')}
                      </th>
                      <th onClick={() => toggleSort('stockFisico')} className="numeric-col" style={{ cursor: 'pointer', width: '8%', whiteSpace: 'nowrap' }} title="Estoque Físico Atual">
                        Físico {renderSortIcon('stockFisico')}
                      </th>
                      <th onClick={() => toggleSort('transit')} className="numeric-col" style={{ cursor: 'pointer', width: '8%', whiteSpace: 'nowrap' }} title="Pedidos de Compra em Trânsito">
                        Em Trânsito {renderSortIcon('transit')}
                      </th>
                      <th onClick={() => toggleSort('estoque_ideal_qtd')} className="numeric-col" style={{ cursor: 'pointer', width: '9%', whiteSpace: 'nowrap' }} title="Meta ideal com base no período de compras (target days)">
                        Meta (Dias) {renderSortIcon('estoque_ideal_qtd')}
                      </th>
                      <th onClick={() => toggleSort('saudeAtualPct')} style={{ cursor: 'pointer', width: '13%', whiteSpace: 'nowrap' }} title="Nível de saúde atual (Físico vs Meta)">
                        Saúde Atual {renderSortIcon('saudeAtualPct')}
                      </th>
                      <th onClick={() => toggleSort('saude_pct')} style={{ cursor: 'pointer', width: '18%' }} title="Previsão de normalização quando o pedido em trânsito chegar">
                        Previsão pós-Chegada {renderSortIcon('saude_pct')}
                      </th>
                      <th onClick={() => toggleSort('sugestao_compra')} className="numeric-col" style={{ cursor: 'pointer', width: '6%', whiteSpace: 'nowrap' }} title="Sugestão de compra para atingir o objetivo">
                        Sug. Compra {renderSortIcon('sugestao_compra')}
                      </th>
                      <th style={{ textAlign: 'center', width: '3%' }}>Ação</th>
                    </tr>
                  ) : (
                    /* Regular Header for Finished Products & Kits */
                    <tr>
                      <th onClick={() => toggleSort('codigo')} style={{ cursor: 'pointer', width: '9%', whiteSpace: 'nowrap' }}>
                        Código {renderSortIcon('codigo')}
                      </th>
                      <th onClick={() => toggleSort('descricao')} style={{ cursor: 'pointer', width: '33%' }}>
                        {activeSection === 'produtos' ? 'Descrição / Linha' : 'Kit Comercial'} {renderSortIcon('descricao')}
                      </th>
                      <th onClick={() => toggleSort('estoque')} className="numeric-col" style={{ cursor: 'pointer', width: '8%', whiteSpace: 'nowrap' }}>
                        Estoque {renderSortIcon('estoque')}
                      </th>
                      {activeSection !== 'kits' && (
                        <th onClick={() => toggleSort('efp')} className="numeric-col" style={{ cursor: 'pointer', width: '8%', whiteSpace: 'nowrap' }} title="Estoque Futuro com Produção (Estoque + Produção - Pedidos)">
                          EFP {renderSortIcon('efp')}
                        </th>
                      )}
                      <th onClick={() => toggleSort('estoque_ideal_qtd')} className="numeric-col" style={{ cursor: 'pointer', width: '8%', whiteSpace: 'nowrap' }}>
                        Ideal {renderSortIcon('estoque_ideal_qtd')}
                      </th>
                      <th onClick={() => toggleSort('saude_pct')} style={{ cursor: 'pointer', width: '15%', whiteSpace: 'nowrap' }}>
                        % Saúde {renderSortIcon('saude_pct')}
                      </th>
                      {activeSection !== 'kits' ? (
                        <th onClick={() => toggleSort('producao_recomendada')} className="numeric-col" style={{ cursor: 'pointer', width: '8%', whiteSpace: 'nowrap' }}>
                          Produzir {renderSortIcon('producao_recomendada')}
                        </th>
                      ) : (
                        <th onClick={() => toggleSort('max_montavel')} className="numeric-col" style={{ cursor: 'pointer', width: '9%', whiteSpace: 'nowrap' }}>
                          Montáveis {renderSortIcon('max_montavel')}
                        </th>
                      )}
                      {activeSection === 'kits' && (
                        <th style={{ width: '14%' }}>Gargalo</th>
                      )}
                      <th onClick={() => toggleSort('status')} style={{ cursor: 'pointer', textAlign: 'center', width: '7%', whiteSpace: 'nowrap' }}>
                        Status {renderSortIcon('status')}
                      </th>
                      <th style={{ textAlign: 'center', width: '4%' }}>Ação</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filteredItems.map((item: any) => {
                    const isExcluded = item.isExcluded;
                    
                    if (activeSection === 'coloracoes') {
                      return (
                        <tr 
                          key={item.codigo} 
                          style={{ 
                            opacity: isExcluded ? 0.45 : 1, 
                            backgroundColor: isExcluded ? '#f4f4f5' : undefined 
                          }}
                        >
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button 
                              className="product-code hover:underline" 
                              onClick={() => onShowDetails(item.codigo)}
                              title="Clique para ver ficha completa e histórico de pedidos"
                              style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                            >
                              {item.codigo}
                            </button>
                          </td>
                          <td>
                            <button
                              onClick={() => onShowDetails(item.codigo)}
                              className="hover:underline"
                              style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'block' }}
                              title="Ver detalhes da coloração"
                            >
                              <div className="product-desc" style={{ fontWeight: 600, lineHeight: 1.25 }}>{item.descricao}</div>
                            </button>
                            <div className="product-subinfo" style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 1 }}>
                              <span>{item.nome_linha || 'Coloração'}</span>
                              {item.faltas > 0 && (
                                <span style={{ fontSize: '0.6rem', color: 'hsl(var(--danger-hsl))', fontWeight: 700 }}>
                                  {item.faltas} em pedidos
                                </span>
                              )}
                              {isExcluded && (
                                <span style={{ fontSize: '0.6rem', backgroundColor: 'hsl(var(--warning-hsl))', color: '#ffffff', padding: '0 4px', borderRadius: 3, fontWeight: 700 }}>
                                  Fora do Cálculo
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="numeric-col" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {(item.stockFisico || 0).toLocaleString('pt-BR')}
                          </td>
                          <td className="numeric-col" style={{ fontWeight: 700, color: item.transit > 0 ? '#2563eb' : 'hsl(var(--text-secondary-hsl))', whiteSpace: 'nowrap' }}>
                            {item.transit > 0 ? `+${item.transit.toLocaleString('pt-BR')} un` : '-'}
                          </td>
                          <td className="numeric-col" style={{ color: 'hsl(var(--text-secondary-hsl))', whiteSpace: 'nowrap' }}>
                            {(item.estoque_ideal_qtd || 0).toLocaleString('pt-BR')}
                            <span style={{ fontSize: '0.62rem', display: 'block', color: 'hsl(var(--text-secondary-hsl))' }}>
                              {item.estoque_ideal_qtd > 0 ? `${item.targetDays} dias` : 'Sem demanda'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: '0.75rem', width: 26, textAlign: 'right', fontWeight: 700 }}>
                                {Math.round(item.saudeAtualPct)}%
                              </span>
                              <div style={{ flex: 1, height: 5, backgroundColor: '#f4f4f5', borderRadius: 3, overflow: 'hidden' }}>
                                <div 
                                  style={{ 
                                    width: `${item.saudeAtualPct}%`, 
                                    height: '100%', 
                                    backgroundColor: getProgressBarColor(item.saudeAtualPct) 
                                  }} 
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              <span style={{ 
                                fontSize: '0.62rem', 
                                fontWeight: 800,
                                padding: '1px 4px',
                                borderRadius: 3,
                                width: 'fit-content',
                                backgroundColor: item.statusPrevisao === 'normalizado' ? '#dcfce7' : item.statusPrevisao === 'normaliza_com_transito' ? '#dbeafe' : item.statusPrevisao === 'parcial_com_transito' ? '#fef9c3' : '#fee2e2',
                                color: item.statusPrevisao === 'normalizado' ? '#15803d' : item.statusPrevisao === 'normaliza_com_transito' ? '#1d4ed8' : item.statusPrevisao === 'parcial_com_transito' ? '#a16207' : '#b91c1c'
                              }}>
                                {item.previsaoTexto}
                              </span>
                              <span style={{ fontSize: '0.62rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                                Projetado: <strong>{item.saldoPosTransito} un</strong> ({item.diasCoberturaPos}d)
                              </span>
                            </div>
                          </td>
                          <td className="numeric-col" style={{ fontWeight: 700, color: (item.sugestao_compra || 0) > 0 ? 'hsl(var(--danger-hsl))' : 'inherit', whiteSpace: 'nowrap' }}>
                            {(item.sugestao_compra || 0) > 0 ? `${item.sugestao_compra.toLocaleString('pt-BR')} un` : '-'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => handleToggleExclude(item.codigo)}
                              className="tab-btn"
                              style={{ 
                                padding: '2px 4px', 
                                border: 'none', 
                                background: 'transparent',
                                color: isExcluded ? 'hsl(var(--success-hsl))' : 'hsl(var(--text-secondary-hsl))',
                                cursor: 'pointer'
                              }}
                              title={isExcluded ? "Incluir de volta no cálculo de saúde do estoque" : "Ocultar/remover este item do cálculo de saúde do estoque"}
                            >
                              {isExcluded ? <Eye size={13} /> : <EyeOff size={13} />}
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    // Finished Products and Kits row
                    const prodQty = item.producao_recomendada > 0 ? item.producao_recomendada : (item.sugestao_compra > 0 ? item.sugestao_compra : 0);
                    return (
                      <tr 
                        key={item.codigo} 
                        style={{ 
                          opacity: isExcluded ? 0.45 : 1, 
                          backgroundColor: isExcluded ? '#f4f4f5' : undefined 
                        }}
                      >
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button 
                            className="product-code hover:underline" 
                            onClick={() => onShowDetails(item.codigo)}
                            title="Clique para ver ficha completa e simulador de fórmula"
                            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}
                          >
                            {item.codigo}
                          </button>
                        </td>
                        <td>
                          <button
                            onClick={() => onShowDetails(item.codigo)}
                            className="hover:underline"
                            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'block' }}
                            title="Ver detalhes e necessidade de insumos"
                          >
                            <div className="product-desc" style={{ fontWeight: 600, lineHeight: 1.25 }}>{item.descricao}</div>
                          </button>
                          <div className="product-subinfo" style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 1, flexWrap: 'wrap' }}>
                            <span>{item.nome_linha || 'Geral'}</span>
                            {isBaseProduct(item) && (
                              <span style={{ fontSize: '0.6rem', backgroundColor: '#f4f4f5', border: '1px solid hsl(var(--card-border-hsl))', padding: '0 3px', borderRadius: 3, fontWeight: 700 }}>
                                Base
                              </span>
                            )}
                            {item.is_lancamento && (
                              <span style={{ fontSize: '0.6rem', backgroundColor: '#3b82f6', color: '#ffffff', padding: '0 3px', borderRadius: 3, fontWeight: 700 }}>
                                Lançamento
                              </span>
                            )}
                            {item.isOnlyKit && (
                              <span style={{ fontSize: '0.6rem', backgroundColor: '#8b5cf6', color: '#ffffff', padding: '0 4px', borderRadius: 3, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                <Box size={10} /> Apenas Kit
                              </span>
                            )}
                            {isExcluded && (
                              <span style={{ fontSize: '0.6rem', backgroundColor: 'hsl(var(--warning-hsl))', color: '#ffffff', padding: '0 3px', borderRadius: 3, fontWeight: 700 }}>
                                Fora do Cálculo
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="numeric-col" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {(item.estoque || 0).toLocaleString('pt-BR')}
                        </td>
                        {activeSection !== 'kits' && (
                          <td className="numeric-col" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {(item.efp ?? item.estoque_futuro_com_producao ?? item.estoque).toLocaleString('pt-BR')}
                          </td>
                        )}
                        <td className="numeric-col" style={{ color: 'hsl(var(--text-secondary-hsl))', whiteSpace: 'nowrap' }}>
                          {(item.estoque_ideal_qtd || 0).toLocaleString('pt-BR')}
                          {item.isOnlyKit && (
                            <span style={{ fontSize: '0.6rem', display: 'block', color: 'hsl(var(--text-secondary-hsl))' }}>
                              Via Kit
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: '0.78rem', width: 28, textAlign: 'right', fontWeight: 700 }}>
                              {Math.round(item.saude_pct)}%
                            </span>
                            <div style={{ flex: 1, height: 5, backgroundColor: '#f4f4f5', borderRadius: 3, overflow: 'hidden' }}>
                              <div 
                                style={{ 
                                  width: `${item.saude_pct}%`, 
                                  height: '100%', 
                                  backgroundColor: getProgressBarColor(item.saude_pct),
                                  transition: 'width 0.25s ease'
                                }} 
                              />
                            </div>
                          </div>
                        </td>
                        {activeSection !== 'kits' ? (
                          <td className="numeric-col" style={{ fontWeight: 700, color: prodQty > 0 ? 'hsl(var(--danger-hsl))' : 'inherit', whiteSpace: 'nowrap' }}>
                            {prodQty > 0 ? `${prodQty.toLocaleString('pt-BR')} un` : '-'}
                          </td>
                        ) : (
                          <td className="numeric-col" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {item.max_montavel?.toLocaleString('pt-BR') || 0} un
                          </td>
                        )}
                        {activeSection === 'kits' && (
                          <td>
                            {item.componentes_criticos?.length > 0 ? (
                              <span style={{ fontSize: '0.68rem', color: 'hsl(var(--danger-hsl))', fontWeight: 600 }}>
                                {item.componentes_criticos[0].codigo} (Faltam {item.componentes_criticos[0].producao_recomendada})
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.68rem', color: 'hsl(var(--success-hsl))', fontWeight: 600 }}>Montagem OK</span>
                            )}
                          </td>
                        )}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span className={`status-badge ${item.status || 'saudavel'}`} style={{ fontSize: '0.62rem', padding: '1px 4px' }}>
                            {item.status_label || (item.status === 'critico' ? 'Crítico' : item.status === 'ordem' ? 'Ordem' : 'OK')}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={() => handleToggleExclude(item.codigo)}
                            className="tab-btn"
                            style={{ 
                              padding: '2px 4px', 
                              border: 'none', 
                              background: 'transparent',
                              color: isExcluded ? 'hsl(var(--success-hsl))' : 'hsl(var(--text-secondary-hsl))',
                              cursor: 'pointer'
                            }}
                            title={isExcluded ? "Incluir de volta no cálculo de saúde do estoque" : "Ocultar/remover este item do cálculo de saúde do estoque"}
                          >
                            {isExcluded ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '24px 12px', color: 'hsl(var(--text-secondary-hsl))' }}>
                        Nenhum registro encontrado para o escopo e filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. PRINT CONFIGURATION MODAL (Solid Natum Themed Modal Card)              */}
      {/* ========================================================================= */}
      {printModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
        >
          <div 
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e4e4e7',
              borderRadius: 12,
              padding: 22,
              width: '100%',
              maxWidth: 480,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              color: '#18181b'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Printer size={20} style={{ color: 'hsl(var(--primary-hsl))' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#18181b' }}>
                  Imprimir Relatório de Saúde
                </h3>
              </div>
              <button 
                onClick={() => setPrintModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.78rem', color: '#71717a' }}>
              Selecione o filtro de corte de saúde para gerar o relatório impresso em papel A4:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Option 1: Below threshold % */}
              <label 
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: printFilterType === 'below_threshold' ? '1.5px solid #18181b' : '1px solid #e4e4e7',
                  backgroundColor: printFilterType === 'below_threshold' ? '#f4f4f5' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <input 
                  type="radio" 
                  name="printFilter" 
                  checked={printFilterType === 'below_threshold'} 
                  onChange={() => setPrintFilterType('below_threshold')}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#18181b' }}>
                    Itens com Saúde Abaixo de um Limite (%)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: 2 }}>
                    Foca nos produtos que necessitam de atenção ou compras
                  </div>
                  {printFilterType === 'below_threshold' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#18181b' }}>Saúde menor que:</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="100" 
                        value={printThreshold} 
                        onChange={(e) => setPrintThreshold(Math.max(1, Math.min(100, Number(e.target.value) || 90)))}
                        style={{
                          width: 60,
                          padding: '3px 6px',
                          borderRadius: 4,
                          border: '1px solid #e4e4e7',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          textAlign: 'center',
                          backgroundColor: '#ffffff',
                          color: '#18181b'
                        }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#18181b' }}>%</span>
                      <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
                        {[50, 75, 90, 100].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setPrintThreshold(v)}
                            style={{
                              fontSize: '0.68rem',
                              padding: '1px 6px',
                              borderRadius: 4,
                              border: '1px solid #e4e4e7',
                              backgroundColor: printThreshold === v ? '#18181b' : '#ffffff',
                              color: printThreshold === v ? '#ffffff' : '#18181b',
                              cursor: 'pointer',
                              fontWeight: 700
                            }}
                          >
                            {v}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </label>

              {/* Option 2: Critical & Order Only */}
              <label 
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: printFilterType === 'critical_only' ? '1.5px solid #18181b' : '1px solid #e4e4e7',
                  backgroundColor: printFilterType === 'critical_only' ? '#f4f4f5' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <input 
                  type="radio" 
                  name="printFilter" 
                  checked={printFilterType === 'critical_only'} 
                  onChange={() => setPrintFilterType('critical_only')}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#18181b' }}>
                    Apenas Itens Críticos e Ponto de Ordem (Urgentes)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: 2 }}>
                    Apenas itens com recomendação imediata de produção ou compra
                  </div>
                </div>
              </label>

              {/* Option 3: Rupture Only */}
              <label 
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: printFilterType === 'rupture_only' ? '1.5px solid #18181b' : '1px solid #e4e4e7',
                  backgroundColor: printFilterType === 'rupture_only' ? '#f4f4f5' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <input 
                  type="radio" 
                  name="printFilter" 
                  checked={printFilterType === 'rupture_only'} 
                  onChange={() => setPrintFilterType('rupture_only')}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#18181b' }}>
                    Apenas Itens em Ruptura / Estoque Zerado
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: 2 }}>
                    Itens com estoque físico &le; 0 ou saldo projetado negativo
                  </div>
                </div>
              </label>

              {/* Option 4: All Items */}
              <label 
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: printFilterType === 'all' ? '1.5px solid #18181b' : '1px solid #e4e4e7',
                  backgroundColor: printFilterType === 'all' ? '#f4f4f5' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <input 
                  type="radio" 
                  name="printFilter" 
                  checked={printFilterType === 'all'} 
                  onChange={() => setPrintFilterType('all')}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#18181b' }}>
                    Todos os Itens do Escopo Ativo ({activeData.filter(p => !p.isExcluded).length} itens)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: 2 }}>
                    Relatório completo com todos os produtos saudáveis e em déficit
                  </div>
                </div>
              </label>
            </div>

            {/* Summary Badge */}
            <div style={{ backgroundColor: '#f4f4f5', padding: '8px 12px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Itens a serem impressos:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#18181b' }}>
                {printableItems.length} de {activeData.filter(p => !p.isExcluded).length} itens
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #e4e4e7', paddingTop: 12 }}>
              <button 
                type="button"
                onClick={() => setPrintModalOpen(false)}
                className="tab-btn"
                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={executePrint}
                className="tab-btn"
                style={{ padding: '6px 16px', fontSize: '0.78rem', backgroundColor: '#18181b', color: '#ffffff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Printer size={15} /> Imprimir Agora ({printableItems.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DEDICATED PRINT-ONLY TEMPLATE (Unbreakable, Strict A4 Table)             */}
      {/* ========================================================================= */}
      <div className="print-report-container print-only">
        {/* Executive Print Header */}
        <div className="print-header-block">
          <div className="print-header-row">
            <div>
              <div className="print-company-title">Natum Cosméticos — Relatório de Saúde do Estoque</div>
              <div className="print-meta-sub">
                Seção: <strong>{activeSection === 'produtos' ? 'Produtos Acabados' : activeSection === 'coloracoes' ? 'Colorações' : 'Kits Comerciais'}</strong>
                {' | '}
                Filtro de Impressão: <strong>
                  {printFilterType === 'below_threshold' ? `Saúde Abaixo de ${printThreshold}%` : 
                   printFilterType === 'critical_only' ? 'Apenas Críticos & Ordem' : 
                   printFilterType === 'rupture_only' ? 'Apenas Ruptura' : 'Todos os Itens'}
                </strong>
                {selectedLines.length > 0 && ` | Linhas: ${selectedLines.length} ativas`}
              </div>
            </div>
            <div className="print-date-block">
              <div>Emissão: <strong>{nowFormatted}</strong></div>
              <div>Itens listados: <strong>{printableItems.length}</strong></div>
            </div>
          </div>
        </div>

        {/* Print KPIs Bar */}
        <div className="print-kpi-bar">
          <div className="print-kpi-cell">
            <span className="print-kpi-label">Saúde Geral</span>
            <span className="print-kpi-val">{Math.round(globalKPIs.saudeGlobal)}%</span>
          </div>
          <div className="print-kpi-cell">
            <span className="print-kpi-label">Crítico (Urgente)</span>
            <span className="print-kpi-val">{globalKPIs.totalCritico}</span>
          </div>
          <div className="print-kpi-cell">
            <span className="print-kpi-label">Abrir Ordem</span>
            <span className="print-kpi-val">{globalKPIs.totalOrdem}</span>
          </div>
          <div className="print-kpi-cell">
            <span className="print-kpi-label">Estoque OK</span>
            <span className="print-kpi-val">{globalKPIs.totalOk}</span>
          </div>
          <div className="print-kpi-cell">
            <span className="print-kpi-label">{activeSection === 'coloracoes' ? 'Sug. Reposição' : 'Produção Pendente'}</span>
            <span className="print-kpi-val">{globalKPIs.producaoPendente.toLocaleString('pt-BR')} un</span>
          </div>
        </div>

        {/* Dedicated Print Table */}
        <table className="print-data-table">
          <thead>
            {activeSection === 'coloracoes' ? (
              <tr>
                <th style={{ width: '10%' }}>Código</th>
                <th style={{ width: '31%' }}>Coloração</th>
                <th style={{ width: '9%', textAlign: 'right' }}>Físico</th>
                <th style={{ width: '9%', textAlign: 'right' }}>Trânsito</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Meta Ideal</th>
                <th style={{ width: '10%', textAlign: 'right' }}>% Saúde</th>
                <th style={{ width: '11%', textAlign: 'right' }}>Projetado</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Sug. Compra</th>
              </tr>
            ) : (
              <tr>
                <th style={{ width: '11%' }}>Código</th>
                <th style={{ width: '37%' }}>{activeSection === 'produtos' ? 'Descrição do Produto' : 'Kit Comercial'}</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Estoque</th>
                {activeSection !== 'kits' && (
                  <th style={{ width: '10%', textAlign: 'right' }}>EFP</th>
                )}
                <th style={{ width: '10%', textAlign: 'right' }}>Ideal</th>
                <th style={{ width: '10%', textAlign: 'right' }}>% Saúde</th>
                {activeSection !== 'kits' ? (
                  <th style={{ width: '12%', textAlign: 'right' }}>Produzir</th>
                ) : (
                  <th style={{ width: '12%', textAlign: 'right' }}>Montáveis</th>
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {printableItems.map((item: any) => {
              if (activeSection === 'coloracoes') {
                const isCrit = item.saudeAtualPct < 37.5;
                const isOrd = item.saudeAtualPct < 60 && !isCrit;
                return (
                  <tr key={item.codigo} className="print-tr">
                    <td className="print-td font-mono font-bold">{item.codigo}</td>
                    <td className="print-td">
                      <div className="print-item-title">{item.descricao}</div>
                      <div className="print-item-sub">
                        {item.nome_linha || 'Coloração'}
                        {item.faltas > 0 ? ` | Faltas: ${item.faltas} un` : ''}
                      </div>
                    </td>
                    <td className="print-td print-num">{(item.stockFisico || 0).toLocaleString('pt-BR')}</td>
                    <td className="print-td print-num font-bold">
                      {item.transit > 0 ? `+${item.transit.toLocaleString('pt-BR')}` : '-'}
                    </td>
                    <td className="print-td print-num">
                      {(item.estoque_ideal_qtd || 0).toLocaleString('pt-BR')}
                      <span className="print-sub-num">({item.targetDays}d)</span>
                    </td>
                    <td className="print-td print-num font-bold">
                      <span className={`print-badge ${isCrit ? 'badge-crit' : isOrd ? 'badge-ord' : 'badge-ok'}`}>
                        {Math.round(item.saudeAtualPct)}%
                      </span>
                    </td>
                    <td className="print-td print-num">
                      {item.saldoPosTransito} un
                      <span className="print-sub-num">({Math.round(item.saude_pct)}%)</span>
                    </td>
                    <td className="print-td print-num font-bold">
                      {(item.sugestao_compra || 0) > 0 ? `${item.sugestao_compra.toLocaleString('pt-BR')}` : '-'}
                    </td>
                  </tr>
                );
              }

              // Finished Products & Kits
              const prodQty = item.producao_recomendada > 0 ? item.producao_recomendada : (item.sugestao_compra > 0 ? item.sugestao_compra : 0);
              const isCrit = item.saude_pct < 37.5;
              const isOrd = item.saude_pct < 60 && !isCrit;
              return (
                <tr key={item.codigo} className="print-tr">
                  <td className="print-td font-mono font-bold">{item.codigo}</td>
                  <td className="print-td">
                    <div className="print-item-title">{item.descricao}</div>
                    <div className="print-item-sub">
                      {item.nome_linha || 'Geral'}
                      {isBaseProduct(item) ? ' | Base' : ''}
                      {item.is_lancamento ? ' | Lançamento' : ''}
                      {item.isOnlyKit ? ' | Apenas Kit' : ''}
                    </div>
                  </td>
                  <td className="print-td print-num">{(item.estoque || 0).toLocaleString('pt-BR')}</td>
                  {activeSection !== 'kits' && (
                    <td className="print-td print-num font-bold">
                      {(item.efp ?? item.estoque_futuro_com_producao ?? item.estoque).toLocaleString('pt-BR')}
                    </td>
                  )}
                  <td className="print-td print-num">{(item.estoque_ideal_qtd || 0).toLocaleString('pt-BR')}</td>
                  <td className="print-td print-num font-bold">
                    <span className={`print-badge ${isCrit ? 'badge-crit' : isOrd ? 'badge-ord' : 'badge-ok'}`}>
                      {Math.round(item.saude_pct)}%
                    </span>
                  </td>
                  {activeSection !== 'kits' ? (
                    <td className="print-td print-num font-bold">
                      {prodQty > 0 ? `${prodQty.toLocaleString('pt-BR')} un` : '-'}
                    </td>
                  ) : (
                    <td className="print-td print-num font-bold">
                      {item.max_montavel?.toLocaleString('pt-BR') || 0} un
                    </td>
                  )}
                </tr>
              );
            })}
            {printableItems.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: '#666666' }}>
                  Nenhum item localizado para os critérios de impressão selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ========================================================================= */}
      {/* 4. PURE CSS STYLES FOR ZERO-BREAK A4 PRINTING                             */}
      {/* ========================================================================= */}
      <style dangerouslySetInnerHTML={{__html: `
        /* Screen defaults */
        .print-only {
          display: none;
        }

        /* PRINT STYLES */
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 6mm 8mm 6mm;
          }

          /* Force complete document unroll without scrolling or clipping */
          html, body, #root, #root > div, .app-layout, .app-layout-main, .view-container, .stock-health-root {
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            position: static !important;
            display: block !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            filter: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Hide all interactive screen elements */
          .no-print, .screen-content, .screen-header-actions, .tabs-container, .toolbar-section, .tab-btn {
            display: none !important;
          }

          /* Show only dedicated print report */
          .print-only, .print-report-container {
            display: block !important;
            width: 100% !important;
          }

          /* Print Header */
          .print-header-block {
            border-bottom: 1.5pt solid #000000;
            padding-bottom: 4pt;
            margin-bottom: 6pt;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-header-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .print-company-title {
            font-size: 13pt;
            font-weight: 900;
            color: #000000;
          }
          .print-meta-sub {
            font-size: 7.5pt;
            color: #333333;
            margin-top: 1pt;
          }
          .print-date-block {
            text-align: right;
            font-size: 7pt;
            color: #444444;
          }

          /* Print KPI Bar */
          .print-kpi-bar {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 4pt;
            margin-bottom: 8pt;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-kpi-cell {
            border: 0.75pt solid #999999;
            padding: 2.5pt 4pt;
            background: #fbfbfb;
            border-radius: 2pt;
            display: flex;
            flex-direction: column;
          }
          .print-kpi-label {
            font-size: 6.5pt;
            font-weight: 700;
            color: #444444;
          }
          .print-kpi-val {
            font-size: 9.5pt;
            font-weight: 900;
            color: #000000;
            margin-top: 1pt;
          }

          /* Strict A4 Continuous Table with ZERO item breakage */
          .print-data-table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            font-size: 7.8pt !important;
            line-height: 1.15 !important;
            display: table !important;
          }
          .print-data-table thead {
            display: table-header-group !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-data-table thead th {
            background-color: #f0f0f0 !important;
            color: #000000 !important;
            font-weight: 900 !important;
            border-top: 1.2pt solid #000000 !important;
            border-bottom: 1.2pt solid #000000 !important;
            padding: 3pt 3.5pt !important;
            font-size: 7pt !important;
            text-transform: uppercase !important;
          }
          .print-data-table tbody {
            display: table-row-group !important;
          }
          .print-tr {
            display: table-row !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            break-inside: avoid-page !important;
            page-break-after: auto !important;
          }
          .print-td {
            display: table-cell !important;
            border-bottom: 0.5pt solid #dddddd !important;
            padding: 2.8pt 3.5pt !important;
            vertical-align: middle !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            break-inside: avoid-page !important;
          }
          .print-num {
            text-align: right !important;
            white-space: nowrap !important;
          }
          .print-sub-num {
            display: block !important;
            font-size: 6pt !important;
            color: #555555 !important;
          }
          .print-item-title {
            font-size: 7.5pt !important;
            font-weight: 700 !important;
            color: #000000 !important;
            line-height: 1.15 !important;
          }
          .print-item-sub {
            font-size: 6pt !important;
            color: #555555 !important;
            margin-top: 0.5pt !important;
          }
          .print-badge {
            display: inline-block !important;
            padding: 0.5pt 2.5pt !important;
            border-radius: 1.5pt !important;
            font-size: 6.5pt !important;
            font-weight: 800 !important;
          }
          .badge-crit {
            border: 0.75pt solid #dc2626 !important;
            color: #dc2626 !important;
          }
          .badge-ord {
            border: 0.75pt solid #d97706 !important;
            color: #d97706 !important;
          }
          .badge-ok {
            border: 0.75pt solid #16a34a !important;
            color: #16a34a !important;
          }
        }
      `}} />
    </div>
  );
}
