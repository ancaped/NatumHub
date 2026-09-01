import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiFetch } from '../../../geral/lib/http';
import { api } from '../../../geral/lib/api';
import { DemandResult, FormulationLine } from '../../../geral/lib/types';
import { 
  Search, Calculator, Trash2, Plus, Minus, Printer, 
  AlertTriangle, Check, Layers, Boxes, ShieldAlert,
  Info, Loader2, Sparkles, ClipboardList, TrendingUp,
  Filter, ChevronDown, ChevronRight, Percent, RotateCcw,
  Sliders, ArrowUpRight
} from 'lucide-react';
import { cn } from '../../../geral/lib/utils';

interface SimulatedProduct {
  codigo: string;
  descricao: string;
  nome_linha: string;
  quantity: number;
  status_label?: string;
  produzir_apenas_kit?: boolean;
  media_vendas?: number;
  estoque_ideal_qtd?: number;
  estoque?: number;
  estoque_futuro?: number;
}

export interface InsumoContribution {
  productCode: string;
  productDesc: string;
  productLine: string;
  qtyProduct: number;
  unitMultiplier: number;
  totalInsumo: number;
  viaKit?: string;
}

export interface CalculatedInsumoRequirement {
  code: string;
  description: string;
  qtyNeeded: number;
  unit: string;
  category: string;
  contributions: InsumoContribution[];
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
  const [insumoLineFilter, setInsumoLineFilter] = useState('ALL');

  // Expanded insumo drill-down (traceability)
  const [expandedInsumo, setExpandedInsumo] = useState<string | null>(null);

  // Line quick actions state
  const [lineMonthsInput, setLineMonthsInput] = useState<string>('2');
  const [showLineActions, setShowLineActions] = useState(false);

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

  const fetchFormulationIfNeeded = useCallback(async (productCode: string) => {
    const clean = trimCode(productCode);
    if (!clean) return;
    const norm = clean.replace(/\./g, '');

    setFormulations((currentForms) => {
      if (currentForms[clean] || currentForms[norm]) return currentForms;

      setFetchingFormulations((prevFetching) => {
        if (prevFetching[clean] || prevFetching[norm]) return prevFetching;

        (async () => {
          try {
            const res = await apiFetch(`/produtos/formulacao/${encodeURIComponent(clean)}`);
            if (res.ok) {
              const data = await res.json();
              setFormulations((prev) => ({
                ...prev,
                [clean]: data,
                [norm]: data,
              }));
            }
          } catch (e) {
            console.error(`Failed to fetch formulation for product ${clean}:`, e);
          } finally {
            setFetchingFormulations((prev) => {
              const next = { ...prev };
              delete next[clean];
              delete next[norm];
              return next;
            });
          }
        })();

        return { ...prevFetching, [clean]: true, [norm]: true };
      });

      return currentForms;
    });
  }, []);

  const rebuildAutoProducts = useCallback((products: any[], kits: any[] = allKits, bom: KitBomMap = kitBom) => {
    const fromProducts: SimulatedProduct[] = products
      .filter(isAutoProductionProduct)
      .map((p: any) => ({
        codigo: trimCode(p.codigo),
        descricao: p.descricao,
        nome_linha: p.nome_linha || 'Outros',
        quantity: p.producao_recomendada > 0 ? p.producao_recomendada : 100,
        status_label: p.status_label || p.status,
        produzir_apenas_kit: Number(p.produzir_apenas_kit) === 1,
        media_vendas: Number(p.media_vendas) || 0,
        estoque_ideal_qtd: Number(p.estoque_ideal_qtd) || 0,
        estoque: Number(p.estoque) || 0,
        estoque_futuro: Number(p.estoque_futuro) || 0,
      }));

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
        media_vendas: Number(p.media_vendas) || 0,
        estoque_ideal_qtd: Number(p.estoque_ideal_qtd) || 0,
        estoque: Number(p.estoque) || 0,
        estoque_futuro: Number(p.estoque_futuro) || 0,
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
  }, [allKits, kitBom, fetchFormulationIfNeeded]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [prodRes, kitsRes, bomRes, demandList] = await Promise.all([
        apiFetch('/products?limit=5000&show_hidden=true&include_kits=true'),
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

  useEffect(() => {
    if (active) {
      loadInitialData();
    }
  }, [active]);

  useEffect(() => {
    const stored = localStorage.getItem('natum_hub_simulated_products');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSimulatedProducts(parsed);
        parsed.forEach((p: SimulatedProduct) => {
          fetchFormulationIfNeeded(p.codigo);
        });
      } catch (e) {
        console.error('Failed to load simulated products from localStorage:', e);
      }
    }
  }, [fetchFormulationIfNeeded]);

  const saveToLocalStorage = (list: SimulatedProduct[]) => {
    localStorage.setItem('natum_hub_simulated_products', JSON.stringify(list));
  };

  const productLines = useMemo(() => {
    const lines = new Set<string>();
    allProducts.forEach(p => {
      if (p.nome_linha) lines.add(p.nome_linha);
    });
    return Array.from(lines).sort();
  }, [allProducts]);

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

    const selectedCodes = new Set(simulatedProducts.map(p => p.codigo));
    return list.filter(p => !selectedCodes.has(trimCode(p.codigo))).slice(0, 15);
  }, [allProducts, selectedLine, searchProduct, simulatedProducts]);

  const handleAddProduct = (product: any) => {
    const nextList = [
      ...simulatedProducts,
      {
        codigo: trimCode(product.codigo),
        descricao: product.descricao,
        nome_linha: product.nome_linha || 'Outros',
        quantity: product.producao_recomendada > 0 ? product.producao_recomendada : (Math.round(product.estoque_ideal_qtd) || 100),
        status_label: product.status_label || product.status,
        produzir_apenas_kit: Number(product.produzir_apenas_kit) === 1,
        media_vendas: Number(product.media_vendas) || 0,
        estoque_ideal_qtd: Number(product.estoque_ideal_qtd) || 0,
        estoque: Number(product.estoque) || 0,
        estoque_futuro: Number(product.estoque_futuro) || 0,
      }
    ];
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
    fetchFormulationIfNeeded(product.codigo);
    
    const comps = kitBom[product.codigo] || kitBom[trimCode(product.codigo)];
    if (comps) {
      comps.forEach(c => fetchFormulationIfNeeded(c.codigo));
    }

    setSearchProduct('');
  };

  const handleAddEntireLine = (lineName: string = selectedLine) => {
    if (lineName === 'ALL') return;

    const productsInLine = allProducts.filter(p => p.nome_linha === lineName);
    if (productsInLine.length === 0) return;

    const currentSelectedCodes = new Set(simulatedProducts.map(p => p.codigo));
    const itemsToAdd: SimulatedProduct[] = [];

    productsInLine.forEach(product => {
      const code = trimCode(product.codigo);
      if (!currentSelectedCodes.has(code)) {
        const qty = product.producao_recomendada > 0 
          ? product.producao_recomendada 
          : (Math.round(product.estoque_ideal_qtd) > 0 ? Math.round(product.estoque_ideal_qtd) : 100);

        itemsToAdd.push({
          codigo: code,
          descricao: product.descricao,
          nome_linha: product.nome_linha || 'Outros',
          quantity: qty,
          status_label: product.status_label || product.status,
          produzir_apenas_kit: Number(product.produzir_apenas_kit) === 1,
          media_vendas: Number(product.media_vendas) || 0,
          estoque_ideal_qtd: Number(product.estoque_ideal_qtd) || 0,
          estoque: Number(product.estoque) || 0,
          estoque_futuro: Number(product.estoque_futuro) || 0,
        });

        fetchFormulationIfNeeded(code);
        const comps = kitBom[code] || kitBom[product.codigo];
        if (comps) {
          comps.forEach(c => fetchFormulationIfNeeded(c.codigo));
        }
      }
    });

    if (itemsToAdd.length === 0) {
      alert(`Todos os produtos da linha "${lineName}" já estão na simulação.`);
      return;
    }

    const nextList = [...simulatedProducts, ...itemsToAdd];
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  const handleAdjustLinePercentage = (lineName: string, pct: number) => {
    if (lineName === 'ALL') return;
    const factor = 1 + (pct / 100);
    const nextList = simulatedProducts.map(p => {
      if (p.nome_linha === lineName) {
        return {
          ...p,
          quantity: Math.max(0, Math.round(p.quantity * factor))
        };
      }
      return p;
    });
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  const handleSetLineCoverage = (lineName: string, months: number) => {
    if (lineName === 'ALL' || months <= 0) return;
    const nextList = simulatedProducts.map(p => {
      if (p.nome_linha === lineName) {
        const avg = p.media_vendas || 0;
        const target = Math.max(0, Math.round(avg * months));
        return {
          ...p,
          quantity: target > 0 ? target : p.quantity
        };
      }
      return p;
    });
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  const handleFillLineIdealDemand = (lineName: string) => {
    if (lineName === 'ALL') return;
    const nextList = simulatedProducts.map(p => {
      if (p.nome_linha === lineName) {
        const ideal = Math.round(p.estoque_ideal_qtd || 0);
        return {
          ...p,
          quantity: ideal > 0 ? ideal : 100
        };
      }
      return p;
    });
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  const handleClearLine = (lineName: string) => {
    if (lineName === 'ALL') {
      handleClearAll();
      return;
    }
    const nextList = simulatedProducts.filter(p => p.nome_linha !== lineName);
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  const handleUpdateQty = (codigo: string, quantity: number) => {
    const nextList = simulatedProducts.map(p => 
      p.codigo === codigo ? { ...p, quantity: Math.max(0, quantity) } : p
    );
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  const handleRemoveProduct = (codigo: string) => {
    const nextList = simulatedProducts.filter(p => p.codigo !== codigo);
    setSimulatedProducts(nextList);
    saveToLocalStorage(nextList);
  };

  const handleClearAll = () => {
    if (confirm('Limpar todos os produtos da simulação atual?')) {
      setSimulatedProducts([]);
      saveToLocalStorage([]);
    }
  };

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
        const prodRes = await apiFetch('/products?limit=5000&show_hidden=true&include_kits=true');
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

    const byCode = new Map(products.map((p: any) => [trimCode(p.codigo), p]));
    const existingByCode = new Map(simulatedProducts.map(p => [p.codigo, p]));
    let imported = 0;
    let updated = 0;
    const missing: string[] = [];

    for (const rawCode of approvalCodes) {
      const code = trimCode(rawCode);
      const product = byCode.get(code);
      if (!product) {
        missing.push(code);
        continue;
      }

      const qtyFromApproval = Number(approvalQtys[rawCode] || approvalQtys[code]);
      const quantity =
        qtyFromApproval > 0
          ? qtyFromApproval
          : product.producao_recomendada > 0
            ? product.producao_recomendada
            : (Math.round(product.estoque_ideal_qtd) > 0 ? Math.round(product.estoque_ideal_qtd) : 100);

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
          status_label: product.status_label || product.status,
          produzir_apenas_kit: Number(product.produzir_apenas_kit) === 1,
          media_vendas: Number(product.media_vendas) || 0,
          estoque_ideal_qtd: Number(product.estoque_ideal_qtd) || 0,
          estoque: Number(product.estoque) || 0,
          estoque_futuro: Number(product.estoque_futuro) || 0,
        });
        imported += 1;
      }
      fetchFormulationIfNeeded(code);
      const comps = kitBom[code] || kitBom[product.codigo];
      if (comps) {
        comps.forEach(c => fetchFormulationIfNeeded(c.codigo));
      }
    }

    const nextList: SimulatedProduct[] = [];
    const seen = new Set<string>();
    for (const p of simulatedProducts) {
      const merged = existingByCode.get(p.codigo);
      if (merged) {
        nextList.push(merged);
        seen.add(p.codigo);
      }
    }
    for (const rawCode of approvalCodes) {
      const code = trimCode(rawCode);
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

  const demandsByCode = useMemo(() => {
    const map: Record<string, DemandResult> = {};
    demands.forEach(d => {
      const code = trimCode(d.itemCode);
      map[code] = d;
      const normalized = code.replace(/\./g, '');
      map[normalized] = d;
    });
    return map;
  }, [demands]);

  const productsForRequirements = useMemo(() => {
    if (requirementsSource === 'manual') return simulatedProducts;
    if (requirementsSource === 'auto') return autoProducts;
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

  // Garante carregamento de formulações para todos os produtos e componentes de kit da simulação
  useEffect(() => {
    productsForRequirements.forEach((p) => {
      const c = trimCode(p.codigo);
      if (c) {
        fetchFormulationIfNeeded(c);
        const norm = c.replace(/\./g, '');
        const comps = kitBom[c] || kitBom[norm] || [];
        comps.forEach((comp) => {
          if (comp.codigo) fetchFormulationIfNeeded(comp.codigo);
        });
      }
    });
  }, [productsForRequirements, kitBom, fetchFormulationIfNeeded]);

  const calculatedRequirements = useMemo(() => {
    const reqs: Record<string, CalculatedInsumoRequirement> = {};

    const addRequirement = (
      ingredientCode: string,
      description: string | undefined,
      neededQty: number,
      contrib: InsumoContribution
    ) => {
      const key = trimCode(ingredientCode);
      if (!key || neededQty <= 0) return;
      const normKey = key.replace(/\./g, '');
      const demandItem = demandsByCode[key] || demandsByCode[normKey];
      const unit = demandItem?.unit || 'un';
      
      let category = 'Outros';
      const catId = (demandItem?.categoryId || '').toLowerCase();
      const catName = (demandItem?.categoryName || '').toLowerCase();
      const k = key.toLowerCase();

      if (
        k.startsWith('9.15.') || 
        k.startsWith('1.') || 
        catId.includes('mp') || 
        catId.includes('materia') || 
        catName.includes('mat') || 
        catName.includes('prima') || 
        catName.includes('mp')
      ) {
        category = 'Matéria-Prima';
      } else if (
        k.startsWith('9.07.') || 
        k.startsWith('9.11.') || 
        k.startsWith('9.04.') || 
        k.startsWith('9.01.') || 
        k.startsWith('9.02.') || 
        k.startsWith('9.03.') || 
        k.startsWith('9.08.') || 
        k.startsWith('9.09.') || 
        k.startsWith('9.10.') || 
        k.startsWith('9.12.') || 
        k.startsWith('9.13.') || 
        k.startsWith('4.') || 
        catId.includes('emb') || 
        catId.includes('embalagem') || 
        catName.includes('emb') || 
        catName.includes('embalag')
      ) {
        category = 'Embalagem';
      } else if (demandItem?.categoryName) {
        category = demandItem.categoryName;
      }

      if (!reqs[key]) {
        reqs[key] = {
          code: key,
          description: description || demandItem?.description || 'Item não cadastrado',
          qtyNeeded: 0,
          unit,
          category,
          contributions: [],
        };
      }

      reqs[key].qtyNeeded += neededQty;
      reqs[key].contributions.push(contrib);
    };

    const simProductCodes = new Set(
      productsForRequirements.map((p) => trimCode(p.codigo))
    );
    const simProductNormCodes = new Set(
      productsForRequirements.map((p) => trimCode(p.codigo).replace(/\./g, ''))
    );

    productsForRequirements.forEach((simProd) => {
      const code = trimCode(simProd.codigo);
      const normCode = code.replace(/\./g, '');
      const comps = kitBom[code] || kitBom[normCode];

      if (comps && comps.length > 0) {
        // Item é um Kit Comercial
        comps.forEach((comp) => {
          const compCode = trimCode(comp.codigo);
          const normComp = compCode.replace(/\./g, '');
          const lines = formulations[compCode] || formulations[normComp] || [];
          const hasOwnFormulation = lines.length > 0;
          const isCompInSimulation = simProductCodes.has(compCode) || simProductNormCodes.has(normComp);

          // Se o componente é um produto fabricado e já está na fila de simulação,
          // não duplicar seus insumos através do kit (a demanda vem diretamente do produto fabricado).
          if (hasOwnFormulation && isCompInSimulation) {
            return;
          }

          const compProdQty = simProd.quantity * comp.quantidade;
          if (lines.length > 0) {
            lines.forEach((line) => {
              const ingCode = trimCode(line.ingredientCode);
              const totalNeeded = compProdQty * line.quantity;
              addRequirement(ingCode, line.description, totalNeeded, {
                productCode: compCode,
                productDesc: comp.descricao || compCode,
                productLine: simProd.nome_linha,
                qtyProduct: compProdQty,
                unitMultiplier: line.quantity,
                totalInsumo: totalNeeded,
                viaKit: `${simProd.codigo} (${simProd.descricao})`,
              });
            });
          } else {
            // Item direto do kit (ex: caixa do kit, sleeve, berço sem fórmula)
            addRequirement(compCode, comp.descricao, compProdQty, {
              productCode: compCode,
              productDesc: comp.descricao || compCode,
              productLine: simProd.nome_linha,
              qtyProduct: compProdQty,
              unitMultiplier: comp.quantidade,
              totalInsumo: compProdQty,
              viaKit: `${simProd.codigo} (${simProd.descricao})`,
            });
          }
        });
        return;
      }

      // Produto acabado regular
      const lines = formulations[code] || formulations[normCode] || [];
      lines.forEach((line) => {
        const ingCode = trimCode(line.ingredientCode);
        const totalNeeded = simProd.quantity * line.quantity;
        addRequirement(ingCode, line.description, totalNeeded, {
          productCode: simProd.codigo,
          productDesc: simProd.descricao,
          productLine: simProd.nome_linha,
          qtyProduct: simProd.quantity,
          unitMultiplier: line.quantity,
          totalInsumo: totalNeeded,
        });
      });
    });

    let list = Object.values(reqs);

    if (insumoTypeFilter === 'MP') {
      list = list.filter(item => item.category === 'Matéria-Prima' || item.category.toLowerCase().includes('mat') || item.code.startsWith('9.15.'));
    } else if (insumoTypeFilter === 'EMB') {
      list = list.filter(item => item.category === 'Embalagem' || item.category.toLowerCase().includes('emb') || item.code.startsWith('9.07.') || item.code.startsWith('9.11.') || item.code.startsWith('9.04.'));
    }

    if (insumoLineFilter !== 'ALL') {
      list = list.filter(item => 
        item.contributions.some(c => c.productLine === insumoLineFilter)
      );
    }

    if (searchInsumo.trim() !== '') {
      const q = searchInsumo.toLowerCase().trim();
      list = list.filter(item => 
        item.code.toLowerCase().includes(q) || 
        item.description.toLowerCase().includes(q)
      );
    }

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

    return list.sort((a, b) => a.code.localeCompare(b.code));
  }, [productsForRequirements, formulations, demandsByCode, insumoTypeFilter, insumoLineFilter, searchInsumo, onlyDeficit, kitBom, autoProducts, allProducts]);

  const handleUpdateAutoQty = (codigo: string, quantity: number) => {
    setAutoProducts((prev) =>
      prev.map((p) => (p.codigo === codigo ? { ...p, quantity: Math.max(0, quantity) } : p))
    );
  };

  const handleRefreshAuto = () => {
    rebuildAutoProducts(allProducts, allKits, kitBom);
  };

  const summary = useMemo(() => {
    let totalUnits = 0;
    let mpCount = 0;
    let embCount = 0;
    let deficitCount = 0;

    productsForRequirements.forEach(p => {
      totalUnits += p.quantity;
    });

    calculatedRequirements.forEach(req => {
      if (req.category === 'Matéria-Prima') mpCount++;
      else if (req.category === 'Embalagem') embCount++;

      const normCode = req.code.replace(/\./g, '');
      const d = demandsByCode[req.code] || demandsByCode[normCode];
      const currentStock = d?.currentStock || 0;
      const inOrders = d?.inOrders || 0;
      const net = (currentStock + inOrders) - req.qtyNeeded;
      if (net < 0) deficitCount++;
    });

    return {
      productsCount: productsForRequirements.length,
      totalUnits,
      mpCount,
      embCount,
      deficitCount
    };
  }, [productsForRequirements, calculatedRequirements, demandsByCode]);

  const handlePrint = () => {
    if (calculatedRequirements.length === 0) {
      alert("A lista de insumos calculados está vazia.");
      return;
    }

    const reportTitle = insumoTypeFilter === 'MP'
      ? 'Previsão de Matéria-Prima (Simulação)'
      : insumoTypeFilter === 'EMB'
      ? 'Previsão de Embalagens (Simulação)'
      : 'Previsão Consolidada de Insumos & Embalagens';

    const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      alert("Não foi possível iniciar a impressão.");
      return;
    }

    const productsRows = productsForRequirements.map(p => `
      <tr>
        <td style="font-family: monospace; font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px; text-align: left;">${p.codigo}</td>
        <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px; text-align: left; font-weight: 600;">${p.descricao}</td>
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
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: left; font-weight: 600;">${req.description}</td>
          <td style="font-size: 9px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: left; color: #6b7280;">${req.category}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right; font-weight: bold; background-color: #f9fafb;">${req.qtyNeeded.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${req.unit}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right;">${currentStock.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${req.unit}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right; color: ${inOrders > 0 ? '#1d4ed8' : '#6b7280'};">${inOrders > 0 ? `+${inOrders.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '-'}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right; font-weight: bold; color: ${net < 0 ? '#b91c1c' : '#047857'}">${net.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${req.unit}</td>
          <td style="font-size: 10px; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: right; font-weight: bold; background-color: ${buy > 0 ? '#fef2f2' : '#ffffff'}; color: ${buy > 0 ? '#b91c1c' : '#9ca3af'};">
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
          @page { size: A4 portrait; margin: 12mm 10mm 12mm 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #18181b; background: #fff; margin: 0; font-size: 10px; line-height: 1.4; }
          header { margin-bottom: 16px; border-bottom: 2px solid #18181b; padding-bottom: 8px; }
          .header-title { font-size: 15px; font-weight: 800; color: #18181b; margin: 0 0 4px 0; text-transform: uppercase; }
          .header-meta { display: flex; justify-content: space-between; color: #71717a; font-size: 9px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f4f4f5; font-weight: 700; font-size: 9px; text-transform: uppercase; color: #71717a; padding: 6px 4px; border-bottom: 1px solid #e4e4e7; }
          .section-title { font-size: 11px; font-weight: 700; color: #18181b; margin: 16px 0 8px 0; text-transform: uppercase; border-left: 3px solid #18181b; padding-left: 6px; }
        </style>
      </head>
      <body>
        <header>
          <div class="header-title">${reportTitle}</div>
          <div class="header-meta">
            <span>NatumHub · Planejamento de Insumos & Produção</span>
            <span>Gerado em: ${today}</span>
          </div>
        </header>

        <div class="section-title">1. Produtos e Quantidades no Cenário (${productsForRequirements.length} itens)</div>
        <table>
          <thead>
            <tr>
              <th style="width: 15%; text-align: left;">Código</th>
              <th style="width: 50%; text-align: left;">Descrição do Produto</th>
              <th style="width: 20%; text-align: left;">Linha</th>
              <th style="width: 15%; text-align: right;">Qtd Planejada</th>
            </tr>
          </thead>
          <tbody>${productsRows}</tbody>
        </table>

        <div class="section-title">2. Necessidade Consolidada de Insumos (${calculatedRequirements.length} insumos)</div>
        <table>
          <thead>
            <tr>
              <th style="width: 12%; text-align: left;">Código</th>
              <th style="width: 32%; text-align: left;">Insumo / Embalagem</th>
              <th style="width: 12%; text-align: left;">Tipo</th>
              <th style="width: 11%; text-align: right;">Requerido</th>
              <th style="width: 11%; text-align: right;">Estoque</th>
              <th style="width: 11%; text-align: right;">Trânsito</th>
              <th style="width: 11%; text-align: right;">Saldo Proj.</th>
              <th style="width: 12%; text-align: right;">Comprar</th>
            </tr>
          </thead>
          <tbody>${insumosRows}</tbody>
        </table>
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
    }, 400);
  };

  const displayedSimulatedProducts = useMemo(() => {
    if (selectedLine === 'ALL') return simulatedProducts;
    return simulatedProducts.filter(p => p.nome_linha === selectedLine);
  }, [simulatedProducts, selectedLine]);

  return (
    <div className="space-y-4 text-zinc-900">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Produtos no Cenário</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-bold text-zinc-900">{summary.productsCount}</span>
              <span className="text-[11px] text-zinc-400 font-semibold">({summary.totalUnits.toLocaleString('pt-BR')} un)</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-zinc-100 text-zinc-700">
            <Calculator className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Matérias-Primas</span>
            <span className="text-xl font-bold text-zinc-900 mt-0.5 block">{summary.mpCount}</span>
          </div>
          <div className="p-2 rounded-lg bg-zinc-100 text-zinc-700">
            <Boxes className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Embalagens</span>
            <span className="text-xl font-bold text-zinc-900 mt-0.5 block">{summary.embCount}</span>
          </div>
          <div className="p-2 rounded-lg bg-zinc-100 text-zinc-700">
            <Layers className="h-4 w-4" />
          </div>
        </div>

        <div className={cn(
          "border rounded-xl p-3.5 shadow-xs flex items-center justify-between transition-all",
          summary.deficitCount > 0 
            ? "border-rose-200 bg-rose-50/30" 
            : "bg-white border-zinc-200"
        )}>
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Insumos com Déficit</span>
            <span className={cn(
              "text-xl font-bold mt-0.5 block",
              summary.deficitCount > 0 ? "text-rose-600" : "text-zinc-900"
            )}>
              {summary.deficitCount} {summary.deficitCount === 1 ? 'item' : 'itens'}
            </span>
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            summary.deficitCount > 0 ? "bg-rose-100 text-rose-700" : "bg-zinc-100 text-zinc-700"
          )}>
            <ShieldAlert className="h-4 w-4" />
          </div>
        </div>
      </div>

      {activeTab === 'sim_auto' ? (
        <div className="bg-white border border-zinc-200 rounded-xl shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-150 pb-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Demanda da Produção Ativa (Urgentes & Ordens)</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Produtos e kits que atingiram ponto de reposição na fábrica. Componentes de kits são explodidos proporcionalmente.
              </p>
            </div>
            <button
              onClick={handleRefreshAuto}
              disabled={loading}
              className="text-xs text-zinc-700 hover:text-zinc-950 font-bold flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Recarregar da Produção
            </button>
          </div>

          <div className="border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4 w-28">Código</th>
                  <th className="py-2.5 px-4">Produto / Kit</th>
                  <th className="py-2.5 px-4 w-40">Linha</th>
                  <th className="py-2.5 px-4 w-32">Status</th>
                  <th className="py-2.5 px-4 text-right w-44">Qtd Produção</th>
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
                      Nenhum produto em ponto crítico de produção no momento.
                    </td>
                  </tr>
                ) : (
                  autoProducts.map((product) => {
                    const comps = kitBom[product.codigo] || [];
                    const isKit = comps.length > 0;
                    return (
                      <React.Fragment key={product.codigo}>
                        <tr className="hover:bg-zinc-50/70 transition-colors">
                          <td className="py-2.5 px-4 font-mono font-bold text-zinc-700">
                            {product.codigo}
                            {isKit && (
                              <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-200 rounded">
                                Kit
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-zinc-900">{product.descricao}</td>
                          <td className="py-2.5 px-4 text-zinc-500">{product.nome_linha}</td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              {product.status_label || 'Crítico'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="inline-flex items-center border border-zinc-200 bg-white rounded-lg shadow-2xs">
                              <button
                                onClick={() => handleUpdateAutoQty(product.codigo, product.quantity - 50)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-500 transition-colors cursor-pointer"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                value={product.quantity}
                                onChange={(e) => handleUpdateAutoQty(product.codigo, Number(e.target.value) || 0)}
                                className="w-16 text-center text-xs font-bold border-x border-zinc-200 py-1 focus:outline-none"
                              />
                              <button
                                onClick={() => handleUpdateAutoQty(product.codigo, product.quantity + 50)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-500 transition-colors cursor-pointer"
                              >
                                <Plus className="h-3 w-3" />
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
                              className="bg-zinc-50/60 border-t border-zinc-100"
                            >
                              <td className="py-2 px-4 pl-7 font-mono text-[11px] font-bold text-zinc-500">
                                ↳ {comp.codigo}
                              </td>
                              <td className="py-2 px-4 text-[11px] text-zinc-700">
                                <span className="font-semibold">{comp.descricao || comp.codigo}</span>
                                <span className="block text-[10px] text-zinc-400">
                                  {hasForm
                                    ? `${(formulations[comp.codigo] || []).length} insumos mapeados · ${comp.quantidade}/kit`
                                    : `Item direto do kit · ${comp.quantidade}/kit`}
                                </span>
                              </td>
                              <td className="py-2 px-4 text-[10px] text-zinc-400">via kit {product.codigo}</td>
                              <td className="py-2 px-4">
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                                  Componente
                                </span>
                              </td>
                              <td className="py-2 px-4 text-right font-mono text-xs font-bold text-zinc-800">
                                {compQty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un
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
        <div className="bg-white border border-zinc-200 rounded-xl shadow-xs p-5 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 justify-between items-start lg:items-center border-b border-zinc-150 pb-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 w-full max-w-2xl">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  placeholder="Pesquisar e adicionar produto ou kit..."
                  className="w-full bg-zinc-50 hover:bg-zinc-100/60 focus:bg-white text-zinc-900 border border-zinc-200 rounded-xl pl-8 pr-3 py-1.5 text-xs transition-all focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>
              
              <div className="relative shrink-0">
                <select
                  value={selectedLine}
                  onChange={(e) => setSelectedLine(e.target.value)}
                  className="bg-zinc-50 hover:bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                >
                  <option value="ALL">Todas as Linhas</option>
                  {productLines.map(line => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
              </div>

              {selectedLine !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setShowLineActions(!showLineActions)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border",
                    showLineActions 
                      ? "bg-zinc-900 text-white border-zinc-900" 
                      : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                  )}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Ações da Linha
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
              <button
                onClick={handleImportFromApproval}
                className="text-xs text-zinc-700 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200/60 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Importar produtos salvos na Fila de Aprovação da Produção"
              >
                <ClipboardList className="h-3.5 w-3.5 text-zinc-600" />
                Importar da Aprovação
              </button>

              {simulatedProducts.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-zinc-400 hover:text-rose-600 px-2.5 py-1.5 font-bold transition-colors cursor-pointer"
                  title="Remover todos os itens do cenário atual"
                >
                  Limpar Cenário
                </button>
              )}
            </div>
          </div>

          {selectedLine !== 'ALL' && showLineActions && (
            <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-zinc-600" />
                  Simulação da Linha: <strong className="text-zinc-950 underline">{selectedLine}</strong>
                  <span className="text-[10px] text-zinc-400 font-normal ml-1">
                    ({allProducts.filter(p => p.nome_linha === selectedLine).length} produtos no catálogo)
                  </span>
                </span>
                <button
                  onClick={() => handleClearLine(selectedLine)}
                  className="text-[11px] font-bold text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  Limpar itens desta linha
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-200/60">
                <button
                  onClick={() => handleAddEntireLine(selectedLine)}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Todos da Linha
                </button>

                <button
                  onClick={() => handleFillLineIdealDemand(selectedLine)}
                  className="px-3 py-1.5 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  title="Preencher com o estoque ideal da linha (Média × Multiplicador)"
                >
                  Preencher com Meta da Linha
                </button>

                <div className="h-4 w-px bg-zinc-300 mx-1 hidden sm:block" />

                <span className="text-[11px] font-semibold text-zinc-500">Ajuste:</span>
                {[
                  { label: '+10%', val: 10 },
                  { label: '+25%', val: 25 },
                  { label: '+50%', val: 50 },
                  { label: '-20%', val: -20 },
                ].map(b => (
                  <button
                    key={b.label}
                    onClick={() => handleAdjustLinePercentage(selectedLine, b.val)}
                    className="px-2 py-1 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-md text-[11px] font-bold text-zinc-700 cursor-pointer transition-colors"
                  >
                    {b.label}
                  </button>
                ))}

                <div className="h-4 w-px bg-zinc-300 mx-1 hidden sm:block" />

                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                  <span>Cobertura:</span>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={lineMonthsInput}
                    onChange={(e) => setLineMonthsInput(e.target.value)}
                    className="w-12 px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-center text-xs font-bold"
                  />
                  <span className="text-[11px] text-zinc-500">meses</span>
                  <button
                    onClick={() => handleSetLineCoverage(selectedLine, parseFloat(lineMonthsInput) || 2)}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-900 text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          )}

          {searchProduct.trim() !== '' && (
            <div className="bg-white border border-zinc-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-zinc-100 z-20">
              {filteredProductsToSelect.length === 0 ? (
                <div className="p-3 text-xs text-zinc-400 text-center">Nenhum produto correspondente encontrado</div>
              ) : (
                filteredProductsToSelect.map(product => (
                  <button
                    key={product.codigo}
                    onClick={() => handleAddProduct(product)}
                    className="w-full text-left p-2.5 hover:bg-zinc-50 flex items-center justify-between text-xs transition-colors cursor-pointer"
                  >
                    <div>
                      <span className="font-mono font-bold text-zinc-900 block">{product.codigo}</span>
                      <span className="text-zinc-800 font-semibold">{product.descricao}</span>
                      <span className="text-[10px] text-zinc-400 block">{product.nome_linha}</span>
                    </div>
                    <Plus className="h-4 w-4 text-zinc-400" />
                  </button>
                ))
              )}
            </div>
          )}

          <div className="border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4 w-28">Código</th>
                  <th className="py-2.5 px-4">Descrição do Produto</th>
                  <th className="py-2.5 px-4 w-36">Linha</th>
                  <th className="py-2.5 px-4 w-36">Ficha Técnica</th>
                  <th className="py-2.5 px-4 text-right w-44">Quantidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {displayedSimulatedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-zinc-400 font-medium">
                      {selectedLine === 'ALL' 
                        ? 'Nenhum produto adicionado ao cenário. Use a barra de pesquisa acima ou selecione uma linha para começar.'
                        : `Nenhum produto da linha "${selectedLine}" está no cenário atual. Clique em "Adicionar Todos da Linha" acima.`}
                    </td>
                  </tr>
                ) : (
                  displayedSimulatedProducts.map((product) => {
                    const comps = kitBom[product.codigo] || [];
                    const isKit = comps.length > 0;
                    const hasFormulation = !!formulations[product.codigo];
                    const isFetching = !!fetchingFormulations[product.codigo];

                    return (
                      <tr key={product.codigo} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-bold text-zinc-800">
                          {product.codigo}
                          {isKit && (
                            <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-200 rounded">
                              Kit
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-zinc-900">{product.descricao}</td>
                        <td className="py-2.5 px-4 text-zinc-500 font-medium">{product.nome_linha}</td>
                        <td className="py-2.5 px-4">
                          {isFetching ? (
                            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Lendo receita...
                            </span>
                          ) : isKit ? (
                            <span className="text-[10px] text-purple-700 font-bold flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {comps.length} {comps.length === 1 ? 'componente' : 'componentes'}
                            </span>
                          ) : hasFormulation ? (
                            <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              {formulations[product.codigo].length} insumos
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Sem receita
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="inline-flex items-center border border-zinc-200 bg-white rounded-lg shadow-2xs">
                              <button
                                onClick={() => handleUpdateQty(product.codigo, product.quantity - 50)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-500 transition-colors cursor-pointer"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={product.quantity}
                                onChange={(e) => handleUpdateQty(product.codigo, parseInt(e.target.value) || 0)}
                                className="w-16 text-center text-xs font-bold border-x border-zinc-200 py-1 focus:outline-none"
                              />
                              <button
                                onClick={() => handleUpdateQty(product.codigo, product.quantity + 50)}
                                className="p-1.5 hover:bg-zinc-100 text-zinc-500 transition-colors cursor-pointer"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>

                            <button
                              onClick={() => handleRemoveProduct(product.codigo)}
                              className="p-1.5 text-zinc-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
        <div className="bg-white border border-zinc-200 rounded-xl shadow-xs p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-150 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/60">
                {(['ALL', 'MP', 'EMB'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setInsumoTypeFilter(type)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                      insumoTypeFilter === type 
                        ? "bg-white text-zinc-900 shadow-2xs" 
                        : "text-zinc-500 hover:text-zinc-800"
                    )}
                  >
                    {type === 'ALL' ? 'Todos Insumos' : type === 'MP' ? 'Matéria-Prima' : 'Embalagem'}
                  </button>
                ))}
              </div>

              <div className="flex bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/60">
                {([
                  { id: 'manual' as const, label: 'Cenário Manual' },
                  { id: 'auto' as const, label: 'Produção Urgente' },
                  { id: 'both' as const, label: 'Consolidado' },
                ]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setRequirementsSource(opt.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                      requirementsSource === opt.id
                        ? "bg-white text-zinc-900 shadow-2xs" 
                        : "text-zinc-500 hover:text-zinc-800"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <select
                value={insumoLineFilter}
                onChange={(e) => setInsumoLineFilter(e.target.value)}
                className="bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">Todas as Linhas de Origem</option>
                {productLines.map(l => (
                  <option key={l} value={l}>Origem: {l}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-end md:self-auto">
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchInsumo}
                  onChange={(e) => setSearchInsumo(e.target.value)}
                  placeholder="Filtrar insumo..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-7 pr-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-lg select-none transition-colors">
                <input
                  type="checkbox"
                  checked={onlyDeficit}
                  onChange={(e) => setOnlyDeficit(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-3.5 w-3.5"
                />
                Apenas a Comprar
              </label>

              {calculatedRequirements.length > 0 && (
                <button
                  onClick={handlePrint}
                  className="bg-zinc-900 hover:bg-zinc-850 text-white font-bold text-xs px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir
                </button>
              )}
            </div>
          </div>

          <div className="border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4 w-28">Código</th>
                  <th className="py-2.5 px-4">Insumo / Embalagem</th>
                  <th className="py-2.5 px-4 w-28">Tipo</th>
                  <th className="py-2.5 px-4 text-right w-32">Qtd Requerida</th>
                  <th className="py-2.5 px-4 text-right w-28">Estoque Físico</th>
                  <th className="py-2.5 px-4 text-right w-28">Em Trânsito</th>
                  <th className="py-2.5 px-4 text-right w-32">Saldo Projetado</th>
                  <th className="py-2.5 px-4 text-right w-36">Sugestão Compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {calculatedRequirements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-zinc-400 font-medium">
                      Nenhum insumo mapeado para os filtros selecionados.
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
                    const isExpanded = expandedInsumo === req.code;

                    return (
                      <React.Fragment key={req.code}>
                        <tr 
                          onClick={() => setExpandedInsumo(isExpanded ? null : req.code)}
                          className={cn(
                            "hover:bg-zinc-50/70 transition-colors cursor-pointer group",
                            isExpanded && "bg-zinc-50/60"
                          )}
                        >
                          <td className="py-2.5 px-4 font-mono font-bold text-zinc-600">
                            <span className="inline-flex items-center gap-1">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
                              {req.code}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="font-bold text-zinc-900 block leading-tight">{req.description}</span>
                            <span className="text-[10px] text-zinc-400 font-medium mt-0.5 block">
                              Consumido por {req.contributions.length} {req.contributions.length === 1 ? 'produto' : 'produtos/kits'} · clique para detalhar
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded border",
                              req.category === 'Matéria-Prima' 
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                                : req.category === 'Embalagem' 
                                  ? "bg-purple-50 text-purple-800 border-purple-200" 
                                  : "bg-zinc-100 text-zinc-700 border-zinc-200"
                            )}>
                              {req.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-zinc-900">
                            {req.qtyNeeded.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                            <span className="text-zinc-400 font-normal text-[10px] ml-1">{req.unit}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-zinc-700 font-medium">
                            {currentStock.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            <span className="text-zinc-400 text-[10px] ml-1">{req.unit}</span>
                          </td>
                          <td className={cn(
                            "py-2.5 px-4 text-right font-mono font-medium",
                            inOrders > 0 ? "text-blue-600 font-bold" : "text-zinc-400"
                          )}>
                            {inOrders > 0 ? `+${inOrders.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '-'}
                            {inOrders > 0 && <span className="text-[10px] ml-1">{req.unit}</span>}
                          </td>
                          <td className={cn(
                            "py-2.5 px-4 text-right font-mono font-bold",
                            netBalance < 0 ? "text-rose-600" : "text-emerald-700"
                          )}>
                            {netBalance > 0 ? '+' : ''}
                            {netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            <span className="text-[10px] ml-1">{req.unit}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold">
                            {toBuy > 0 ? (
                              <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-block font-extrabold">
                                {toBuy.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                <span className="text-[10px] ml-1">{req.unit}</span>
                              </span>
                            ) : (
                              <span className="text-zinc-400 font-medium block pr-2">-</span>
                            )}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-zinc-50 border-t border-b border-zinc-200">
                            <td colSpan={8} className="p-3 pl-8">
                              <div className="space-y-2">
                                <div className="text-[11px] font-bold text-zinc-700 flex items-center gap-1.5">
                                  <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
                                  Origens da Demanda para: <strong className="text-zinc-900">{req.code} — {req.description}</strong>
                                </div>
                                <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white">
                                  <table className="w-full text-left text-[11px] border-collapse">
                                    <thead>
                                      <tr className="bg-zinc-100/70 border-b border-zinc-200 text-[10px] text-zinc-500 font-bold uppercase">
                                        <th className="py-1.5 px-3">Código Produto</th>
                                        <th className="py-1.5 px-3">Descrição</th>
                                        <th className="py-1.5 px-3">Linha</th>
                                        <th className="py-1.5 px-3 text-right">Qtd Produto</th>
                                        <th className="py-1.5 px-3 text-right">Qtd por Unidade</th>
                                        <th className="py-1.5 px-3 text-right">Consumo Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100">
                                      {req.contributions.map((c, i) => (
                                        <tr key={`${c.productCode}-${i}`} className="hover:bg-zinc-50">
                                          <td className="py-1.5 px-3 font-mono font-bold text-zinc-700">{c.productCode}</td>
                                          <td className="py-1.5 px-3 text-zinc-800">
                                            {c.productDesc}
                                            {c.viaKit && (
                                              <span className="block text-[9px] text-purple-600 font-medium mt-0.5">
                                                ↳ via kit {c.viaKit}
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-3 text-zinc-500">{c.productLine}</td>
                                          <td className="py-1.5 px-3 text-right font-mono font-medium">{c.qtyProduct.toLocaleString('pt-BR')} un</td>
                                          <td className="py-1.5 px-3 text-right font-mono text-zinc-500">
                                            {c.unitMultiplier.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-mono font-bold text-zinc-900">
                                            {c.totalInsumo.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} {req.unit}
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
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex items-start gap-2.5 text-[11px] text-zinc-500">
            <Info className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Rastreabilidade de Insumos:</strong> A necessidade de cada matéria-prima e embalagem é calculada proporcionalmente pela receita de produtos acabados e pela explosão multinível de kits comerciais. Clique em qualquer linha de insumo para auditar exatamente os produtos que compõem sua demanda.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
