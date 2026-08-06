import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../../geral/lib/http';
import { api } from '../../../geral/lib/api';
import { DemandResult, FormulationLine } from '../../../geral/lib/types';
import { 
  Search, Calculator, Trash2, Plus, Minus, Printer, 
  AlertTriangle, Check, Layers, Boxes, ShieldAlert,
  Info, Loader2, Sparkles, ClipboardList, TrendingUp
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';

interface SimulatedProduct {
  codigo: string;
  descricao: string;
  nome_linha: string;
  quantity: number;
  status_label?: string;
  produzir_apenas_kit?: boolean;
}

/** kit_codigo → lista de componentes (quantidade por kit) */
type KitBomMap = Record<string, { codigo: string; quantidade: number; descricao?: string }[]>;

type RequirementsSource = 'manual' | 'auto' | 'both';

interface SimulationTabProps {
  active?: boolean;
  activeTab: string;
}

function isAutoProductionProduct(p: any): boolean {
  const qty = Number(p?.producao_recomendada) || 0;
  if (qty <= 0) return false;
  const st = String(p?.status || '');
  return st === 'critico' || st === 'ordem' || st === 'saindo_de_linha';
}

function trimCode(code: string): string {
  return String(code || '').trim();
}

export function SimulationTab({ active = false, activeTab }: SimulationTabProps) {
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [demands, setDemands] = useState<DemandResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedLine, setSelectedLine] = useState('ALL');
  const [onlyDeficit, setOnlyDeficit] = useState(false);
  
  // Search filter for insumos table
  const [searchInsumo, setSearchInsumo] = useState('');

  // Simulation state
  const [simulatedProducts, setSimulatedProducts] = useState<SimulatedProduct[]>([]);
  const [autoProducts, setAutoProducts] = useState<SimulatedProduct[]>([]);
  const [formulations, setFormulations] = useState<Record<string, FormulationLine[]>>({});
  const [fetchingFormulations, setFetchingFormulations] = useState<Record<string, boolean>>({});
  const [kitBom, setKitBom] = useState<KitBomMap>({});
  const [allKits, setAllKits] = useState<any[]>([]);

  // Filter category of required items (ALL / MP / EMB)
  const [insumoTypeFilter, setInsumoTypeFilter] = useState<'ALL' | 'MP' | 'EMB'>('ALL');
  const [requirementsSource, setRequirementsSource] = useState<RequirementsSource>('both');

  // Load products and demands on mount
  useEffect(() => {
    if (active) {
      loadInitialData();
    }
  }, [active]);

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('natum_hub_simulated_products');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSimulatedProducts(parsed);
        // Fetch formulations for the restored products
        parsed.forEach((p: SimulatedProduct) => {
          fetchFormulationIfNeeded(p.codigo);
        });
      } catch (e) {
        console.error('Failed to load simulated products from localStorage:', e);
      }
    }
  }, []);

  // Save to localStorage
  const saveToLocalStorage = (list: SimulatedProduct[]) => {
    localStorage.setItem('natum_hub_simulated_products', JSON.stringify(list));
  };

  const rebuildAutoProducts = (products: any[], kits: any[] = allKits, bom: KitBomMap = kitBom) => {
    const fromProducts: SimulatedProduct[] = products
      .filter(isAutoProductionProduct)
      .map((p: any) => ({
        codigo: trimCode(p.codigo),
        descricao: p.descricao,
        nome_linha: p.nome_linha || 'Outros',
        quantity: p.producao_recomendada > 0 ? p.producao_recomendada : 100,
        status_label: p.status_label || p.status,
        produzir_apenas_kit: Number(p.produzir_apenas_kit) === 1,
      }));

    // Kits não vêm em /products — incluir urgentes de /kits.
    const fromKits: SimulatedProduct[] = (kits || [])
      .map((k: any) => k.kit_detalhes || k.kitDetalhes || k)
      .filter(isAutoProductionProduct)
      .map((p: any) => ({
        codigo: trimCode(p.codigo),
        descricao: p.descricao,
        nome_linha: p.nome_linha || 'Kits Comerciais',
        quantity: p.producao_recomendada > 0 ? p.producao_recomendada : 100,
        status_label: p.status_label || p.status,
        produzir_apenas_kit: false,
      }));

    const byCode = new Map<string, SimulatedProduct>();
    for (const p of [...fromProducts, ...fromKits]) {
      if (!byCode.has(p.codigo)) byCode.set(p.codigo, p);
    }
    const next = Array.from(byCode.values()).sort((a, b) =>
      a.descricao.localeCompare(b.descricao, 'pt-BR')
    );

    setAutoProducts(next);
    next.forEach((p) => {
      fetchFormulationIfNeeded(p.codigo);
      const comps = bom[p.codigo] || bom[trimCode(p.codigo)];
      if (comps) {
        comps.forEach((c) => fetchFormulationIfNeeded(c.codigo));
      }
    });
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [prodRes, kitsRes, bomRes, demandList] = await Promise.all([
        apiFetch('/products?limit=5000&show_hidden=true'),
        apiFetch('/kits?limit=5000&show_hidden=true'),
        apiFetch('/kits/composicao'),
        api.getDemands().catch(() => [] as DemandResult[]),
      ]);

      let products: any[] = [];
      if (prodRes.ok) {
        const data = await prodRes.json();
        products = data.items || [];
        setAllProducts(products);
      }

      let kits: any[] = [];
      if (kitsRes.ok) {
        const data = await kitsRes.json();
        kits = data.items || [];
        setAllKits(kits);
      }

      let bom: KitBomMap = {};
      if (bomRes.ok) {
        const rows = await bomRes.json();
        const list = Array.isArray(rows) ? rows : [];
        for (const row of list) {
          const kit = trimCode(row.kit_codigo || row.kitCodigo);
          const comp = trimCode(row.componente_codigo || row.componenteCodigo);
          const qty = Number(row.quantidade) || 1;
          if (!kit || !comp) continue;
          if (!bom[kit]) bom[kit] = [];
          bom[kit].push({
            codigo: comp,
            quantidade: qty,
            descricao: row.componente_descricao || row.componenteDescricao,
          });
        }
        setKitBom(bom);
      }

      rebuildAutoProducts(products, kits, bom);
      setDemands(demandList || []);
    } catch (e) {
      console.error('Failed to load simulation initial data:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchFormulationIfNeeded = async (productCode: string) => {
    if (formulations[productCode] || fetchingFormulations[productCode]) return;

    setFetchingFormulations(prev => ({ ...prev, [productCode]: true }));
    try {
      const res = await apiFetch(`/produtos/formulacao/${encodeURIComponent(productCode)}`);
      if (res.ok) {
        const data = await res.json();
        setFormulations(prev => ({ ...prev, [productCode]: data }));
      }
    } catch (e) {
      console.error(`Failed to fetch formulation for product ${productCode}:`, e);
    } finally {
      setFetchingFormulations(prev => ({ ...prev, [productCode]: false }));
    }
  };

  // Get unique lines for the filter dropdown
  const productLines = useMemo(() => {
    const lines = new Set<string>();
    allProducts.forEach(p => {
      if (p.nome_linha) lines.add(p.nome_linha);
    });
    return Array.from(lines).sort();
  }, [allProducts]);

  // Filter products list for selection
  const filteredProductsToSelect = useMemo(() => {
    let list = allProducts;
    
    if (selectedLine !== 'ALL') {
      list = list.filter(p => p.nome_linha === selectedLine);
    }

    if (searchProduct.trim() !== '') {
      const q = searchProduct.toLowerCase().trim();
      list = list.filter(p => 
        (p.codigo || '').toLowerCase().includes(q) || 
        (p.descricao || '').toLowerCase().includes(q)
      );
    }

    // Don't show already selected products in the selection dropdown/list
    const selectedCodes = new Set(simulatedProducts.map(p => p.codigo));
    return list.filter(p => !selectedCodes.has(p.codigo)).slice(0, 15);
  }, [allProducts, selectedLine, searchProduct, simulatedProducts]);

  // Handle adding a product
  const handleAddProduct = (product: any) => {
    const nextList = [
      ...simulatedProducts,
      {
        codigo: product.codigo,
        descricao: product.descricao,
        nome_linha: product.nome_linha || 'Outros',
        quantity: product.producao_recomendada > 0 ? product.producao_recomendada : 100,
      }
    ];
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
    fetchFormulationIfNeeded(product.codigo);
    setSearchProduct('');
  };

  // Add the entire selected line to the simulation
  const handleAddEntireLine = () => {
    if (selectedLine === 'ALL') return;

    const productsInLine = allProducts.filter(p => p.nome_linha === selectedLine);
    if (productsInLine.length === 0) return;

    const currentSelectedCodes = new Set(simulatedProducts.map(p => p.codigo));
    const itemsToAdd: SimulatedProduct[] = [];

    productsInLine.forEach(product => {
      if (!currentSelectedCodes.has(product.codigo)) {
        itemsToAdd.push({
          codigo: product.codigo,
          descricao: product.descricao,
          nome_linha: product.nome_linha || 'Outros',
          quantity: product.producao_recomendada > 0 ? product.producao_recomendada : 100,
        });
        fetchFormulationIfNeeded(product.codigo);
      }
    });

    if (itemsToAdd.length === 0) {
      alert(`Todos os itens da linha "${selectedLine}" já estão na simulação.`);
      return;
    }

    const nextList = [...simulatedProducts, ...itemsToAdd];
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  // Handle changing quantity
  const handleUpdateQty = (codigo: string, quantity: number) => {
    const nextList = simulatedProducts.map(p => 
      p.codigo === codigo ? { ...p, quantity: Math.max(0, quantity) } : p
    );
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  // Handle removing a product
  const handleRemoveProduct = (codigo: string) => {
    const nextList = simulatedProducts.filter(p => p.codigo !== codigo);
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  // Handle resetting the simulation
  const handleClearAll = () => {
    if (confirm('Limpar toda a simulação atual?')) {
      setSimulatedProducts([]);
      saveToLocalStorage([]);
    }
  };

  // Import products from Produção → Aprovação (same-browser localStorage)
  const handleImportFromApproval = async () => {
    let approvalCodes: string[] = [];
    let approvalQtys: Record<string, number> = {};
    try {
      const listRaw = localStorage.getItem('natum_hub_production_approval_list');
      const qtysRaw = localStorage.getItem('natum_hub_production_approval_qtys');
      if (listRaw) approvalCodes = JSON.parse(listRaw);
      if (qtysRaw) approvalQtys = JSON.parse(qtysRaw);
    } catch (e) {
      console.error('Failed to read production approval queue:', e);
      alert('Não foi possível ler a fila de aprovação de produção.');
      return;
    }

    if (!Array.isArray(approvalCodes) || approvalCodes.length === 0) {
      alert('Nenhum item na fila de Aprovação de Produção.');
      return;
    }

    let products = allProducts;
    if (products.length === 0) {
      setLoading(true);
      try {
        const prodRes = await apiFetch('/products?limit=5000&show_hidden=true');
        if (prodRes.ok) {
          const data = await prodRes.json();
          products = data.items || [];
          setAllProducts(products);
        }
      } catch (e) {
        console.error('Failed to load products for approval import:', e);
      } finally {
        setLoading(false);
      }
    }

    const byCode = new Map(products.map((p: any) => [p.codigo, p]));
    const existingByCode = new Map(simulatedProducts.map(p => [p.codigo, p]));
    let imported = 0;
    let updated = 0;
    const missing: string[] = [];

    for (const code of approvalCodes) {
      const product = byCode.get(code);
      if (!product) {
        missing.push(code);
        continue;
      }

      const qtyFromApproval = Number(approvalQtys[code]);
      const quantity =
        qtyFromApproval > 0
          ? qtyFromApproval
          : product.producao_recomendada > 0
            ? product.producao_recomendada
            : 100;

      const existing = existingByCode.get(code);
      if (existing) {
        existingByCode.set(code, { ...existing, quantity });
        updated += 1;
      } else {
        existingByCode.set(code, {
          codigo: product.codigo,
          descricao: product.descricao,
          nome_linha: product.nome_linha || 'Outros',
          quantity,
        });
        imported += 1;
      }
      fetchFormulationIfNeeded(code);
    }

    // Preserve order: current sim items (updated in place), then newly imported in approval order
    const nextList: SimulatedProduct[] = [];
    const seen = new Set<string>();
    for (const p of simulatedProducts) {
      const merged = existingByCode.get(p.codigo);
      if (merged) {
        nextList.push(merged);
        seen.add(p.codigo);
      }
    }
    for (const code of approvalCodes) {
      if (seen.has(code)) continue;
      const item = existingByCode.get(code);
      if (item) {
        nextList.push(item);
        seen.add(code);
      }
    }

    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);

    const parts = [`${imported + updated} item(ns) da aprovação`];
    if (imported > 0) parts.push(`${imported} novo(s)`);
    if (updated > 0) parts.push(`${updated} atualizado(s)`);
    if (missing.length > 0) parts.push(`${missing.length} não encontrado(s) no catálogo`);
    alert(`Importação concluída: ${parts.join(', ')}.`);
  };

  // Create lookup map for item stocks and details from demands list
  const demandsByCode = useMemo(() => {
    const map: Record<string, DemandResult> = {};
    demands.forEach(d => {
      map[d.itemCode] = d;
      const normalized = d.itemCode.replace(/\./g, '');
      map[normalized] = d;
    });
    return map;
  }, [demands]);

  const productsForRequirements = useMemo(() => {
    if (requirementsSource === 'manual') return simulatedProducts;
    if (requirementsSource === 'auto') return autoProducts;
    // both: merge by code (sum quantities)
    const byCode = new Map<string, SimulatedProduct>();
    for (const p of [...simulatedProducts, ...autoProducts]) {
      const existing = byCode.get(p.codigo);
      if (existing) {
        byCode.set(p.codigo, { ...existing, quantity: existing.quantity + p.quantity });
      } else {
        byCode.set(p.codigo, { ...p });
      }
    }
    return Array.from(byCode.values());
  }, [requirementsSource, simulatedProducts, autoProducts]);

  const addRequirementLine = (
    reqs: Record<string, { code: string; description: string; qtyNeeded: number; unit: string; category: string }>,
    ingredientCode: string,
    description: string | undefined,
    totalNeeded: number,
  ) => {
    const key = trimCode(ingredientCode);
    if (!key || totalNeeded === 0) return;
    const normKey = key.replace(/\./g, '');
    const demandItem = demandsByCode[key] || demandsByCode[normKey];
    const unit = demandItem?.unit || 'un';
    let category = 'Outros';
    const catId = demandItem?.categoryId || '';
    if (catId.includes('mp') || catId.includes('materia')) {
      category = 'Matéria-Prima';
    } else if (catId.includes('emb') || catId.includes('embalagem')) {
      category = 'Embalagem';
    } else if (demandItem?.categoryName) {
      category = demandItem.categoryName;
    }
    if (reqs[key]) {
      reqs[key].qtyNeeded += totalNeeded;
    } else {
      reqs[key] = {
        code: key,
        description: description || demandItem?.description || 'Item não cadastrado',
        qtyNeeded: totalNeeded,
        unit,
        category,
      };
    }
  };

  // Aggregate required ingredients (insumos) — kits explodem kit_composicao.
  const calculatedRequirements = useMemo(() => {
    const reqs: Record<string, { 
      code: string; 
      description: string; 
      qtyNeeded: number; 
      unit: string;
      category: string;
    }> = {};

    const urgentKitCodes = new Set(
      productsForRequirements
        .filter((p) => (kitBom[p.codigo] || []).length > 0)
        .map((p) => p.codigo)
    );
    const skipDirect = new Set<string>();
    for (const kitCode of urgentKitCodes) {
      for (const comp of kitBom[kitCode] || []) {
        const meta = productsForRequirements.find((p) => p.codigo === comp.codigo)
          || autoProducts.find((p) => p.codigo === comp.codigo)
          || allProducts.find((p: any) => trimCode(p.codigo) === comp.codigo);
        const apenasKit = meta
          ? Boolean((meta as any).produzir_apenas_kit ?? Number((meta as any).produzir_apenas_kit) === 1)
          : false;
        // Meta from allProducts uses numeric flag
        const fromCatalog = allProducts.find((p: any) => trimCode(p.codigo) === comp.codigo);
        if (apenasKit || Number(fromCatalog?.produzir_apenas_kit) === 1) {
          skipDirect.add(comp.codigo);
        }
      }
    }

    productsForRequirements.forEach(simProd => {
      const code = trimCode(simProd.codigo);
      if (skipDirect.has(code)) return;

      const comps = kitBom[code];
      if (comps && comps.length > 0) {
        comps.forEach((comp) => {
          const lines = formulations[comp.codigo] || [];
          if (lines.length > 0) {
            lines.forEach((line) => {
              addRequirementLine(
                reqs,
                line.ingredientCode,
                line.description,
                simProd.quantity * comp.quantidade * line.quantity,
              );
            });
          } else {
            // Item direto (caixa) sem formulação
            addRequirementLine(
              reqs,
              comp.codigo,
              comp.descricao,
              simProd.quantity * comp.quantidade,
            );
          }
        });
        return;
      }

      const lines = formulations[code] || formulations[simProd.codigo] || [];
      lines.forEach((line) => {
        addRequirementLine(
          reqs,
          line.ingredientCode,
          line.description,
          simProd.quantity * line.quantity,
        );
      });
    });

    // Convert to list
    let list = Object.values(reqs);

    // Apply category filter
    if (insumoTypeFilter === 'MP') {
      list = list.filter(item => item.category === 'Matéria-Prima');
    } else if (insumoTypeFilter === 'EMB') {
      list = list.filter(item => item.category === 'Embalagem');
    }

    // Apply search filter
    if (searchInsumo.trim() !== '') {
      const q = searchInsumo.toLowerCase().trim();
      list = list.filter(item => 
        item.code.toLowerCase().includes(q) || 
        item.description.toLowerCase().includes(q)
      );
    }

    // Apply deficit filter if selected
    if (onlyDeficit) {
      list = list.filter(item => {
        const normCode = item.code.replace(/\./g, '');
        const d = demandsByCode[item.code] || demandsByCode[normCode];
        const currentStock = d?.currentStock || 0;
        const inOrders = d?.inOrders || 0;
        const net = (currentStock + inOrders) - item.qtyNeeded;
        return net < 0;
      });
    }

    // Sort by code
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }, [productsForRequirements, formulations, demandsByCode, insumoTypeFilter, searchInsumo, onlyDeficit, kitBom, autoProducts, allProducts]);

  const handleUpdateAutoQty = (codigo: string, quantity: number) => {
    setAutoProducts((prev) =>
      prev.map((p) => (p.codigo === codigo ? { ...p, quantity: Math.max(0, quantity) } : p))
    );
  };

  const handleRefreshAuto = () => {
    rebuildAutoProducts(allProducts, allKits, kitBom);
  };

  // Summary Metrics
  const summary = useMemo(() => {
    let mpCount = 0;
    let embCount = 0;
    let deficitCount = 0;

    const globalReqs: Record<string, number> = {};
    const urgentKitCodes = new Set(
      productsForRequirements
        .filter((p) => (kitBom[p.codigo] || []).length > 0)
        .map((p) => p.codigo)
    );
    const skipDirect = new Set<string>();
    for (const kitCode of urgentKitCodes) {
      for (const comp of kitBom[kitCode] || []) {
        const fromCatalog = allProducts.find((p: any) => trimCode(p.codigo) === comp.codigo);
        if (Number(fromCatalog?.produzir_apenas_kit) === 1) {
          skipDirect.add(comp.codigo);
        }
      }
    }

    productsForRequirements.forEach((simProd) => {
      const code = trimCode(simProd.codigo);
      if (skipDirect.has(code)) return;
      const comps = kitBom[code];
      if (comps && comps.length > 0) {
        comps.forEach((comp) => {
          const lines = formulations[comp.codigo] || [];
          if (lines.length > 0) {
            lines.forEach((line) => {
              const key = trimCode(line.ingredientCode);
              globalReqs[key] =
                (globalReqs[key] || 0) + simProd.quantity * comp.quantidade * line.quantity;
            });
          } else {
            globalReqs[comp.codigo] =
              (globalReqs[comp.codigo] || 0) + simProd.quantity * comp.quantidade;
          }
        });
        return;
      }
      const lines = formulations[code] || formulations[simProd.codigo] || [];
      lines.forEach((line) => {
        const key = trimCode(line.ingredientCode);
        globalReqs[key] = (globalReqs[key] || 0) + simProd.quantity * line.quantity;
      });
    });

    Object.entries(globalReqs).forEach(([code, qtyNeeded]) => {
      const normCode = code.replace(/\./g, '');
      const d = demandsByCode[code] || demandsByCode[normCode];
      
      let category = 'Outros';
      const catId = d?.categoryId || '';
      if (catId.includes('mp') || catId.includes('materia')) {
        category = 'Matéria-Prima';
      } else if (catId.includes('emb') || catId.includes('embalagem')) {
        category = 'Embalagem';
      }

      if (category === 'Matéria-Prima') mpCount++;
      if (category === 'Embalagem') embCount++;

      const currentStock = d?.currentStock || 0;
      const inOrders = d?.inOrders || 0;
      const net = (currentStock + inOrders) - qtyNeeded;
      if (net < 0) deficitCount++;
    });

    return {
      productsCount: productsForRequirements.length,
      mpCount,
      embCount,
      deficitCount
    };
  }, [productsForRequirements, formulations, demandsByCode, kitBom, allProducts]);

  // Print Report matches layout of PrintListTab.tsx
  const handlePrint = () => {
    if (calculatedRequirements.length === 0) {
      alert("A simulação de insumos está vazia.");
      return;
    }

    let reportTitle = 'Relatório de Previsão de Insumos (Simulação)';
    let sectionTitle = '2. Necessidade Consolidada de Insumos Requeridos';
    let descHeader = 'Descrição do Insumo';

    if (insumoTypeFilter === 'MP') {
      reportTitle = 'Relatório de Previsão de Matéria-Prima (Simulação)';
      sectionTitle = '2. Necessidade Consolidada de Matérias-Primas Requeridas';
      descHeader = 'Descrição da Matéria-Prima';
    } else if (insumoTypeFilter === 'EMB') {
      reportTitle = 'Relatório de Previsão de Embalagens (Simulação)';
      sectionTitle = '2. Necessidade Consolidada de Embalagens Requeridas';
      descHeader = 'Descrição da Embalagem';
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

    const productsRows = productsForRequirements.map(p => `
      <tr>
        <td style="font-family: monospace; font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px; text-align: left;">${p.codigo}</td>
        <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px; text-align: left; font-weight: 500;">${p.descricao}</td>
        <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px; text-align: left; color: #4b5563;">${p.nome_linha}</td>
        <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px; text-align: right; font-weight: bold;">${p.quantity.toLocaleString('pt-BR')} un</td>
      </tr>
    `).join('');

    const insumosRows = calculatedRequirements.map(req => {
      const normCode = req.code.replace(/\./g, '');
      const d = demandsByCode[req.code] || demandsByCode[normCode];
      const currentStock = d?.currentStock || 0;
      const inOrders = d?.inOrders || 0;
      const net = (currentStock + inOrders) - req.qtyNeeded;
      const buy = net < 0 ? Math.abs(net) : 0;

      return `
        <tr>
          <td style="font-family: monospace; font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: left;">${req.code}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: left; font-weight: 500;">${req.description}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right; font-weight: bold; background-color: #fafafa;">${req.qtyNeeded.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${req.unit}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right;">${currentStock.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${req.unit}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right; color: ${inOrders > 0 ? '#2563eb' : '#4b5563'}; font-weight: ${inOrders > 0 ? 'bold' : 'normal'};">${inOrders > 0 ? `${inOrders.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${req.unit}` : '-'}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right; font-weight: bold; color: ${net < 0 ? '#b91c1c' : '#047857'}">${net.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${req.unit}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right; font-weight: bold; background-color: #fef2f2; color: #b91c1c;">
            ${buy > 0 ? `${buy.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${req.unit}` : '-'}
          </td>
        </tr>
      `;
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
            font-size: 16px;
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
            background-color: #f9fafb;
            border-bottom: 2px solid #d1d5db;
            color: #374151;
            font-weight: 700;
            padding: 6px 4px;
            text-align: center;
            font-size: 8px;
            text-transform: uppercase;
          }
          h2 {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 4px;
            margin-top: 20px;
            margin-bottom: 10px;
            color: #111827;
          }
          .signatures {
            margin-top: 40px;
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
            margin-top: 30px;
            margin-bottom: 5px;
          }
          .signature-title {
            font-size: 8px;
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
              <div>Produtos simulados: <strong>${productsForRequirements.length}</strong></div>
              <div>Itens com deficit: <strong>${summary.deficitCount}</strong></div>
              ${onlyDeficit ? '<div>Filtro: <strong>Apenas Itens a Comprar</strong></div>' : ''}
            </div>
          </div>
        </header>

        <h2>1. Produtos Incluídos na Simulação</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 80px; text-align: left;">Referência</th>
              <th style="text-align: left;">Descrição do Produto</th>
              <th style="width: 120px; text-align: left;">Linha</th>
              <th style="width: 100px; text-align: right;">Quantidade Simulada</th>
            </tr>
          </thead>
          <tbody>
            ${productsRows || '<tr><td colspan="4" style="text-align: center; padding: 10px;">Nenhum produto selecionado</td></tr>'}
          </tbody>
        </table>

        <h2>${sectionTitle}</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 80px; text-align: left;">Código</th>
              <th style="text-align: left;">${descHeader}</th>
              <th style="width: 95px; text-align: right;">Qtd Necessária</th>
              <th style="width: 95px; text-align: right;">Estoque Físico</th>
              <th style="width: 95px; text-align: right;">Em Trânsito</th>
              <th style="width: 95px; text-align: right;">Saldo Projetado</th>
              <th style="width: 95px; text-align: right; background-color: #f3f4f6;">A Comprar</th>
            </tr>
          </thead>
          <tbody>
            ${insumosRows || '<tr><td colspan="7" style="text-align: center; padding: 10px;">Nenhum insumo calculado</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top: 20px; padding: 8px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 8px; color: #4b5563; page-break-inside: avoid;">
          <strong style="color: #111827; display: block; margin-bottom: 4px; font-size: 9px; text-transform: uppercase;">Nota Metodológica da Simulação:</strong>
          <ul style="margin: 0; padding-left: 12px; line-height: 1.4;">
            <li>As quantidades de insumos (matéria-prima e embalagens) são apuradas multiplicando a quantidade simulada de cada produto pelo consumo unitário das formulações. Kits usam a composição: fórmulas dos componentes e itens diretos (ex. caixa).</li>
            <li>O Estoque Físico corresponde ao saldo operacional em tempo real integrado com o sistema principal.</li>
            <li>A coluna "Em Trânsito" exibe as compras já efetuadas com fornecedores em pedidos de compra pendentes no sistema.</li>
            <li>O Saldo Projetado leva em conta a soma do Estoque Físico + Em Trânsito subtraindo a Qtd Necessária.</li>
            <li>A coluna "A Comprar" é ativada exclusivamente para insumos cujo Saldo Projetado resulte em saldo deficitário.</li>
          </ul>
        </div>

        <div class="signatures">
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title">PCP / Responsável pelo Planejamento</div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title">Diretoria / Autorização de Compra</div>
          </div>
        </div>

        <footer>
          <div>NatumHub — Sistema de Gestão Unificado</div>
          <div>Impressão de Simulação</div>
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
    <div className="space-y-6">
      {/* Simulation Dashboard Header Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Produtos Simulados</span>
            <span className="text-2xl font-black text-zinc-900 mt-1 block">{summary.productsCount}</span>
          </div>
          <div className="bg-indigo-50 text-indigo-700 rounded-lg p-2.5">
            <Calculator className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Matérias-Primas Requeridas</span>
            <span className="text-2xl font-black text-zinc-900 mt-1 block">{summary.mpCount}</span>
          </div>
          <div className="bg-emerald-50 text-emerald-700 rounded-lg p-2.5">
            <Boxes className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-zinc-200 shadow-sm rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Embalagens Requeridas</span>
            <span className="text-2xl font-black text-zinc-900 mt-1 block">{summary.embCount}</span>
          </div>
          <div className="bg-purple-50 text-purple-700 rounded-lg p-2.5">
            <Layers className="h-5 w-5" />
          </div>
        </div>

        <div className={cn(
          "border rounded-xl p-4 flex items-center justify-between shadow-sm transition-all bg-white",
          summary.deficitCount > 0 
            ? "border-red-200 bg-red-50/20 text-red-900" 
            : "border-zinc-200"
        )}>
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Itens com Estoque Insuficiente</span>
            <span className={cn(
              "text-2xl font-black mt-1 block",
              summary.deficitCount > 0 ? "text-red-600" : "text-zinc-900"
            )}>{summary.deficitCount}</span>
          </div>
          <div className={cn(
            "rounded-lg p-2.5",
            summary.deficitCount > 0 ? "bg-red-100 text-red-700" : "bg-zinc-50 text-zinc-500"
          )}>
            <ShieldAlert className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Content Areas based on activeTab prop */}
      {activeTab === 'sim_auto' ? (
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Simulação Automática</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Produtos e kits urgentes. Em cada kit aparecem os componentes e a quantidade derivada (kits × qty na composição) para conferir as formulações.
              </p>
            </div>
            <button
              onClick={handleRefreshAuto}
              disabled={loading}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1.5 shrink-0"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Atualizar da Produção
            </button>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Linha</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right" style={{ width: '160px' }}>Qtd Simulada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading && autoProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-zinc-400">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Carregando produtos...
                    </td>
                  </tr>
                ) : autoProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-zinc-400">
                      Nenhum produto em Produzir Urgente / Abrir Ordem no momento.
                    </td>
                  </tr>
                ) : (
                  autoProducts.map((product) => {
                    const comps = kitBom[product.codigo] || [];
                    const isKit = comps.length > 0;
                    return (
                      <React.Fragment key={product.codigo}>
                        <tr className="hover:bg-zinc-50/80">
                          <td className="py-2.5 px-4 font-mono text-xs font-bold text-indigo-600">
                            {product.codigo}
                            {isKit && (
                              <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">
                                Kit
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-xs font-semibold text-zinc-800">{product.descricao}</td>
                          <td className="py-2.5 px-4 text-[10px] text-zinc-500">{product.nome_linha}</td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-100">
                              {product.status_label || '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="inline-flex items-center border border-zinc-200 bg-white rounded-lg shadow-sm">
                              <button
                                onClick={() => handleUpdateAutoQty(product.codigo, product.quantity - 50)}
                                className="p-1.5 hover:bg-zinc-50 text-zinc-500"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <input
                                type="number"
                                value={product.quantity}
                                onChange={(e) => handleUpdateAutoQty(product.codigo, Number(e.target.value) || 0)}
                                className="w-16 text-center text-xs font-bold border-x border-zinc-200 py-1.5 focus:outline-none"
                              />
                              <button
                                onClick={() => handleUpdateAutoQty(product.codigo, product.quantity + 50)}
                                className="p-1.5 hover:bg-zinc-50 text-zinc-500"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {comps.map((comp) => {
                          const compQty = product.quantity * (comp.quantidade || 1);
                          const hasForm = (formulations[comp.codigo] || []).length > 0;
                          return (
                            <tr
                              key={`${product.codigo}::${comp.codigo}`}
                              className="bg-zinc-50/70 border-t border-zinc-100"
                            >
                              <td className="py-2 px-4 pl-8 font-mono text-[11px] font-bold text-zinc-600">
                                ↳ {comp.codigo}
                              </td>
                              <td className="py-2 px-4 text-[11px] text-zinc-700">
                                <span className="font-semibold">{comp.descricao || comp.codigo}</span>
                                <span className="block text-[9px] text-zinc-400 mt-0.5">
                                  {hasForm
                                    ? `${(formulations[comp.codigo] || []).length} insumos na fórmula · ${comp.quantidade} / kit`
                                    : `Item direto do kit · ${comp.quantidade} / kit`}
                                </span>
                              </td>
                              <td className="py-2 px-4 text-[10px] text-zinc-400">via {product.codigo}</td>
                              <td className="py-2 px-4">
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
                                  Componente
                                </span>
                              </td>
                              <td className="py-2 px-4 text-right font-mono text-xs font-bold text-zinc-800">
                                {compQty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'sim_products' ? (
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center">
            <div className="flex gap-2 flex-1 w-full max-w-[500px]">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  placeholder="Adicionar produto por código ou nome..."
                  className="w-full bg-zinc-50 hover:bg-zinc-100/70 focus:bg-white text-zinc-900 border border-zinc-200 rounded-xl pl-9 pr-4 py-2 text-xs transition-all focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              
              <select
                value={selectedLine}
                onChange={(e) => setSelectedLine(e.target.value)}
                className="bg-zinc-50 text-zinc-800 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-400 max-w-[150px]"
              >
                <option value="ALL">Todas Linhas</option>
                {productLines.map(line => (
                  <option key={line} value={line}>{line}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              {selectedLine !== 'ALL' && (
                <button
                  onClick={handleAddEntireLine}
                  className="bg-zinc-900 hover:bg-zinc-850 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm shrink-0"
                >
                  <Sparkles className="h-4 w-4" />
                  Adicionar Linha Inteira ({allProducts.filter(p => p.nome_linha === selectedLine).length})
                </button>
              )}

              <button
                onClick={handleImportFromApproval}
                className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 font-bold shrink-0"
                title="Importar produtos da fila de Aprovação de Produção"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Importar da Aprovação
              </button>

              {simulatedProducts.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-zinc-400 hover:text-red-650 transition-colors flex items-center gap-1 font-bold shrink-0 ml-auto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Limpar Simulação
                </button>
              )}
            </div>
          </div>

          {/* Dropdown popup for selection */}
          {searchProduct.trim() !== '' && (
            <div className="bg-white border border-zinc-200 rounded-xl shadow-lg max-h-[220px] overflow-y-auto divide-y divide-zinc-100 absolute z-10 w-[calc(100%-40px)] max-w-[500px]">
              {filteredProductsToSelect.length === 0 ? (
                <div className="p-3 text-xs text-zinc-400 text-center">Nenhum produto correspondente encontrado</div>
              ) : (
                filteredProductsToSelect.map(product => (
                  <button
                    key={product.codigo}
                    onClick={() => handleAddProduct(product)}
                    className="w-full text-left p-3 hover:bg-zinc-50 flex items-center justify-between text-xs transition-colors"
                  >
                    <div className="pr-4">
                      <span className="font-mono font-bold text-indigo-600 block">{product.codigo}</span>
                      <span className="text-zinc-800 font-semibold">{product.descricao}</span>
                      <span className="text-[10px] text-zinc-400 block mt-0.5">{product.nome_linha}</span>
                    </div>
                    <Plus className="h-4 w-4 text-zinc-400" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* List of simulated products - Structured like pre-established modules */}
          <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Descrição do Produto</th>
                  <th className="py-3 px-4">Linha</th>
                  <th className="py-3 px-4">Ficha Técnica / Receita</th>
                  <th className="py-3 px-4 text-right" style={{ width: '180px' }}>Quantidade a Produzir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs text-zinc-900">
                {simulatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-zinc-400 font-semibold">
                      Nenhum produto adicionado. Use a barra de pesquisa acima ou selecione uma linha para começar.
                    </td>
                  </tr>
                ) : (
                  simulatedProducts.map((product) => {
                    const hasFormulation = !!formulations[product.codigo];
                    const isFetching = !!fetchingFormulations[product.codigo];

                    return (
                      <tr key={product.codigo} className="hover:bg-zinc-50/50">
                        <td className="py-3 px-4 font-mono font-bold text-zinc-950">{product.codigo}</td>
                        <td className="py-3 px-4 font-bold">{product.descricao}</td>
                        <td className="py-3 px-4 font-semibold text-zinc-500">{product.nome_linha}</td>
                        <td className="py-3 px-4">
                          {isFetching && (
                            <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-semibold">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Carregando receita...
                            </span>
                          )}
                          {!isFetching && !hasFormulation && (
                            <span className="text-[10px] text-red-500 font-semibold flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Sem receita cadastrada
                            </span>
                          )}
                          {hasFormulation && (
                            <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                              <Check className="h-3.5 w-3.5" />
                              {formulations[product.codigo].length} insumos mapeados
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="flex items-center border border-zinc-200 bg-white rounded-lg shadow-sm">
                              <button
                                onClick={() => handleUpdateQty(product.codigo, product.quantity - 50)}
                                className="p-1.5 hover:bg-zinc-50 text-zinc-500 transition-colors"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              
                              <input
                                type="number"
                                value={product.quantity}
                                onChange={(e) => handleUpdateQty(product.codigo, parseInt(e.target.value) || 0)}
                                className="w-16 text-center text-xs font-bold bg-transparent text-zinc-900 border-none focus:outline-none focus:ring-0 p-1"
                              />

                              <button
                                onClick={() => handleUpdateQty(product.codigo, product.quantity + 50)}
                                className="p-1.5 hover:bg-zinc-50 text-zinc-500 transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <button
                              onClick={() => handleRemoveProduct(product.codigo)}
                              className="p-2 text-zinc-300 hover:text-red-550 hover:bg-red-50 rounded-lg transition-all"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Requirements Table - Matches pre-established modules styling */
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-150 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/50 w-fit">
                {(['ALL', 'MP', 'EMB'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setInsumoTypeFilter(type)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all",
                      insumoTypeFilter === type 
                        ? "bg-white text-zinc-900 shadow-sm" 
                        : "text-zinc-400 hover:text-zinc-650"
                    )}
                  >
                    {type === 'ALL' ? 'Todos Insumos' : type === 'MP' ? 'Matéria-Prima' : 'Embalagem'}
                  </button>
                ))}
              </div>
              <div className="flex bg-violet-50 p-0.5 rounded-lg border border-violet-100 w-fit">
                {([
                  { id: 'manual' as const, label: 'Manual' },
                  { id: 'auto' as const, label: 'Automática' },
                  { id: 'both' as const, label: 'Ambas' },
                ]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setRequirementsSource(opt.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all",
                      requirementsSource === opt.id
                        ? "bg-white text-violet-800 shadow-sm"
                        : "text-violet-400 hover:text-violet-700"
                    )}
                    title="Fonte dos produtos para mapear insumos"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 self-end">
              {/* Search filter for Insumos */}
              <div className="relative w-48 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchInsumo}
                  onChange={(e) => setSearchInsumo(e.target.value)}
                  placeholder="Filtrar insumo..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>

              {/* Only Deficit Filter */}
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-700 bg-zinc-50 hover:bg-zinc-100/80 border border-zinc-200 px-3 py-1.5 rounded-lg select-none transition-all shadow-sm">
                <input
                  type="checkbox"
                  checked={onlyDeficit}
                  onChange={(e) => setOnlyDeficit(e.target.checked)}
                  className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                Apenas Itens a Comprar
              </label>

              {calculatedRequirements.length > 0 && (
                <button
                  onClick={handlePrint}
                  className="bg-zinc-950 text-white hover:bg-zinc-800 font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir Relatório
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Insumo / Descrição</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4 text-right">Qtd Requerida</th>
                  <th className="py-3 px-4 text-right">Estoque Físico</th>
                  <th className="py-3 px-4 text-right">Em Trânsito</th>
                  <th className="py-3 px-4 text-right">Saldo Projetado</th>
                  <th className="py-3 px-4 text-right" style={{ width: '150px' }}>Recomendação de Compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs text-zinc-900">
                {calculatedRequirements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-zinc-400 font-semibold">
                      Nenhum insumo mapeado ou correspondente aos filtros.
                    </td>
                  </tr>
                ) : (
                  calculatedRequirements.map((req) => {
                    const normCode = req.code.replace(/\./g, '');
                    const d = demandsByCode[req.code] || demandsByCode[normCode];
                    const currentStock = d?.currentStock || 0;
                    const inOrders = d?.inOrders || 0;
                    const netBalance = (currentStock + inOrders) - req.qtyNeeded;
                    const toBuy = netBalance < 0 ? Math.abs(netBalance) : 0;

                    return (
                      <tr key={req.code} className="hover:bg-zinc-50/50">
                        <td className="py-3.5 px-4 font-mono font-bold text-zinc-400">{req.code}</td>
                        <td className="py-3.5 px-4 pr-4">
                          <span className="font-bold text-zinc-950 block leading-tight">{req.description}</span>
                          {toBuy > 0 && (
                            <span className="text-[10px] text-red-500 font-semibold flex items-center gap-0.5 mt-0.5">
                              <AlertTriangle className="h-3 w-3" />
                              Déficit de {toBuy.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} {req.unit}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                            req.category === 'Matéria-Prima' 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                              : req.category === 'Embalagem' 
                                ? "bg-purple-50 text-purple-700 border-purple-100" 
                                : "bg-zinc-50 text-zinc-600 border-zinc-100"
                          )}>
                            {req.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-zinc-950">
                          {req.qtyNeeded.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          <span className="text-zinc-400 font-semibold text-[10px] ml-1">{req.unit}</span>
                        </td>
                        <td className="py-3.5 px-4 text-right text-zinc-650 font-medium">
                          {currentStock.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          <span className="text-zinc-400 font-semibold text-[10px] ml-1">{req.unit}</span>
                        </td>
                        <td className={cn(
                          "py-3.5 px-4 text-right font-semibold",
                          inOrders > 0 ? "text-blue-600" : "text-zinc-400"
                        )}>
                          {inOrders > 0 ? `+${inOrders.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '-'}
                          {inOrders > 0 && <span className="text-[10px] ml-1">{req.unit}</span>}
                        </td>
                        <td className={cn(
                          "py-3.5 px-4 text-right font-bold",
                          netBalance < 0 ? "text-red-650" : "text-emerald-700"
                        )}>
                          {netBalance > 0 ? '+' : ''}
                          {netBalance.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          <span className="text-[10px] ml-1">{req.unit}</span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-black">
                          {toBuy > 0 ? (
                            <span className="text-red-700 bg-red-50 px-2 py-1 rounded-lg border border-red-100 inline-block font-extrabold shadow-sm">
                              {toBuy.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                              <span className="text-[10px] ml-1">{req.unit}</span>
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-bold block pr-2">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 flex items-start gap-2.5 text-[11px] text-zinc-500">
            <Info className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Nota sobre o Cálculo de Saldo Projetado:</strong> A fórmula aplicada leva em conta compras em andamento: <code className="bg-zinc-200/50 px-1 py-0.5 rounded font-mono text-[10px] font-bold text-zinc-700">Saldo Projetado = (Estoque Físico + Em Trânsito) - Qtd Requerida</code>. Isso impede a recomendação duplicada de compras para itens que já foram adquiridos e aguardam entrega de fornecedores.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
