import React, { useState, useEffect, useMemo } from 'react';
import { api, localAuth } from '../lib/api';
import { 
  FiscoQuimicaPattern, FiscoQuimicaAgent, FiscoQuimicaAnalysis, Product, Item
} from '../types';
import { 
  ArrowLeft, FlaskConical, Plus, Search, Calendar, User, Info, 
  Trash2, Edit3, CheckCircle, AlertTriangle, Eye, ShieldAlert, 
  HelpCircle, Settings, Calculator, Activity, Trash, X
} from 'lucide-react';
import { cn } from '../lib/utils';

interface FiscoQuimicaViewProps {
  onBackToHub: () => void;
}

export default function FiscoQuimicaView({ onBackToHub }: FiscoQuimicaViewProps) {
  const [activeTab, setActiveTab] = useState<'new_analysis' | 'history' | 'patterns' | 'agents'>('new_analysis');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Core Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [patterns, setPatterns] = useState<FiscoQuimicaPattern[]>([]);
  const [agents, setAgents] = useState<FiscoQuimicaAgent[]>([]);
  const [analyses, setAnalyses] = useState<FiscoQuimicaAnalysis[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [patternSearchQuery, setPatternSearchQuery] = useState('');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<FiscoQuimicaAnalysis | null>(null);

  // New Analysis Form States
  const [formProductCode, setFormProductCode] = useState('');
  const [formBatch, setFormBatch] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formTechnician, setFormTechnician] = useState('');
  const [formPh, setFormPh] = useState<string>('');
  const [formFractionWeight, setFormFractionWeight] = useState<string>('');
  const [formViscosity, setFormViscosity] = useState<string>('');
  const [formNotes, setFormNotes] = useState('');
  
  // Viscosity Correction Panel States
  const [hasAdjustment, setHasAdjustment] = useState(false);
  const [adjAgentId, setAdjAgentId] = useState('');
  const [adjInitialVisc, setAdjInitialVisc] = useState<string>('');
  const [adjTrialQty, setAdjTrialQty] = useState<string>('');
  const [adjTrialVisc, setAdjTrialVisc] = useState<string>('');
  const [adjFinalQty, setAdjFinalQty] = useState<string>('');
  const [adjBatchSize, setAdjBatchSize] = useState<string>('');

  // Pattern Form States
  const [showPatternModal, setShowPatternModal] = useState(false);
  const [editingPattern, setEditingPattern] = useState<FiscoQuimicaPattern | null>(null);
  const [patCode, setPatCode] = useState('');
  const [patPhMin, setPatPhMin] = useState<string>('0');
  const [patPhMax, setPatPhMax] = useState<string>('14');
  const [patViscMin, setPatViscMin] = useState<string>('0');
  const [patViscMax, setPatViscMax] = useState<string>('50000');
  const [patDensityTarget, setPatDensityTarget] = useState<string>('1.000');
  const [patDensityTolerance, setPatDensityTolerance] = useState<string>('0.020');
  const [patVol, setPatVol] = useState<string>('1000');
  const [patUnit, setPatUnit] = useState<'mL' | 'L'>('mL');
  const [patAllowedAgents, setPatAllowedAgents] = useState<string[]>([]);

  // Agent Form States (linking raw materials)
  const [itemCodeInput, setItemCodeInput] = useState('');

  // Density Cup Constant (Calibration cup volume in mL)
  const DENSITY_CUP_VOLUME = 51.645;

  useEffect(() => {
    const u = localAuth.getUser();
    setUser(u);
    if (u) setFormTechnician(u.displayName || '');
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [prods, pats, ags, anals, allItems] = await Promise.all([
        api.getProducts(),
        api.getFiscoQuimicaPatterns(),
        api.getFiscoQuimicaAgents(),
        api.getFiscoQuimicaAnalyses(),
        api.getItems()
      ]);
      setProducts(prods);
      setPatterns(pats);
      setAgents(ags);
      setAnalyses(anals);
      setItems(allItems);
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar os dados físico-químicos.');
    } finally {
      setLoading(false);
    }
  };

  // Sync title with active page
  useEffect(() => {
    const tabLabels = {
      new_analysis: 'Registrar Físico-Química',
      history: 'Histórico Físico-Químico',
      patterns: 'Padrões de Produtos',
      agents: 'Agentes Corretivos'
    };
    (window as any).__current_page__ = tabLabels[activeTab] || activeTab;
  }, [activeTab]);

  const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

  const handleProductCodeChange = (val: string) => {
    const normalizedInput = normalizeCode(val);
    if (normalizedInput.length >= 4) {
      const foundProduct = products.find((p) => normalizeCode(p.code) === normalizedInput);
      if (foundProduct) {
        setFormProductCode(foundProduct.code);
        return;
      }
    }
    setFormProductCode(val);
  };

  const handlePhBlur = () => {
    if (!formPh) return;
    let valStr = formPh.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 14) {
        if (valStr.length === 2) {
          valStr = (valNum / 10).toFixed(1);
        } else if (valStr.length >= 3) {
          valStr = (valNum / 100).toFixed(2);
        }
      }
    }
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed)) {
      setFormPh(parsed.toString());
    }
  };

  const handleFractionWeightBlur = () => {
    if (!formFractionWeight) return;
    let valStr = formFractionWeight.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 100) {
        if (valStr.length === 3) {
          valStr = (valNum / 10).toFixed(1);
        } else if (valStr.length === 4) {
          valStr = (valNum / 100).toFixed(2);
        } else if (valStr.length >= 5) {
          valStr = (valNum / 1000).toFixed(3);
        }
      }
    }
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed)) {
      setFormFractionWeight(parsed.toString());
    }
  };

  const handlePatPhMinBlur = () => {
    if (!patPhMin) return;
    let valStr = patPhMin.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 14) {
        if (valStr.length === 2) {
          valStr = (valNum / 10).toFixed(1);
        } else if (valStr.length >= 3) {
          valStr = (valNum / 100).toFixed(2);
        }
      }
    }
    setPatPhMin(valStr);
  };

  const handlePatPhMaxBlur = () => {
    if (!patPhMax) return;
    let valStr = patPhMax.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 14) {
        if (valStr.length === 2) {
          valStr = (valNum / 10).toFixed(1);
        } else if (valStr.length >= 3) {
          valStr = (valNum / 100).toFixed(2);
        }
      }
    }
    setPatPhMax(valStr);
  };

  const handlePatDensityTargetBlur = () => {
    if (!patDensityTarget) return;
    let valStr = patDensityTarget.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 2) {
        if (valStr.length === 2) {
          valStr = (valNum / 10).toFixed(1);
        } else if (valStr.length === 3) {
          valStr = (valNum / 100).toFixed(2);
        } else if (valStr.length >= 4) {
          valStr = (valNum / 1000).toFixed(3);
        }
      }
    }
    setPatDensityTarget(valStr);
  };

  const handlePatDensityToleranceBlur = () => {
    if (!patDensityTolerance) return;
    let valStr = patDensityTolerance.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 0) {
        if (valStr.length === 1) {
          valStr = (valNum / 1000).toFixed(3);
        } else if (valStr.length === 2) {
          valStr = (valNum / 1000).toFixed(3);
        } else if (valStr.length >= 3) {
          valStr = (valNum / 1000).toFixed(3);
        }
      }
    }
    setPatDensityTolerance(valStr);
  };

  const handleAdjTrialQtyBlur = () => {
    if (!adjTrialQty) return;
    let valStr = adjTrialQty.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 5) {
        if (valStr.length === 2) {
          valStr = (valNum / 10).toFixed(1);
        } else if (valStr.length >= 3) {
          valStr = (valNum / 100).toFixed(2);
        }
      }
    }
    setAdjTrialQty(valStr);
  };

  const handleAdjFinalQtyBlur = () => {
    if (!adjFinalQty) return;
    let valStr = adjFinalQty.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 20) {
        if (valStr.length === 2) {
          valStr = (valNum / 10).toFixed(1);
        } else if (valStr.length >= 3) {
          valStr = (valNum / 100).toFixed(2);
        }
      }
    }
    setAdjFinalQty(valStr);
  };

  const handlePatCodeChange = (val: string) => {
    const normalizedInput = normalizeCode(val);
    if (normalizedInput.length >= 4) {
      const foundProduct = products.find((p) => normalizeCode(p.code) === normalizedInput);
      if (foundProduct) {
        setPatCode(foundProduct.code);
        return;
      }
    }
    setPatCode(val);
  };

  // Selected Product's Pattern info
  const activePattern = useMemo(() => {
    if (!formProductCode) return null;
    return patterns.find(p => p.productCode === formProductCode) || null;
  }, [formProductCode, patterns]);

  // Selected Product detail
  const activeProduct = useMemo(() => {
    if (!formProductCode) return null;
    return products.find(p => p.code === formProductCode) || null;
  }, [formProductCode, products]);

  // Filtered products for patterns list
  const filteredPatternProducts = useMemo(() => {
    const q = patternSearchQuery.toLowerCase().trim();
    if (!q) return products;
    const qNormalized = q.replace(/\./g, '');
    return products.filter(p => {
      const pCodeNormalized = p.code.toLowerCase().replace(/\./g, '');
      return pCodeNormalized.includes(qNormalized) || p.name.toLowerCase().includes(q);
    });
  }, [products, patternSearchQuery]);

  // Autocomplete/linked raw material item
  const activeItem = useMemo(() => {
    if (!itemCodeInput) return null;
    const normalized = normalizeCode(itemCodeInput);
    return items.find(i => normalizeCode(i.code) === normalized) || null;
  }, [itemCodeInput, items]);

  const handleItemCodeChange = (val: string) => {
    const normalizedInput = normalizeCode(val);
    if (normalizedInput.length >= 4) {
      const foundItem = items.find((i) => normalizeCode(i.code) === normalizedInput);
      if (foundItem) {
        setItemCodeInput(foundItem.code);
        return;
      }
    }
    setItemCodeInput(val);
  };

  // Auto-calculated Density
  const calculatedDensity = useMemo(() => {
    const val = parseFloat(formFractionWeight.toString().replace(',', '.'));
    if (isNaN(val) || val <= 0) return 0;
    // Density = weight / cup volume (51.645 mL)
    return Number((val / DENSITY_CUP_VOLUME).toFixed(3));
  }, [formFractionWeight]);

  // Auto-calculated Packaging Targets (both Weight and Volume)
  const fillingTargets = useMemo(() => {
    if (!activePattern || calculatedDensity <= 0) {
      return {
        weight: { value: 0, unit: 'g' as const },
        volume: { value: 0, unit: 'mL' as const }
      };
    }

    const packageVolume = parseFloat(activePattern.packageVolume.toString()) || 0;
    const packageUnit = (activePattern.packageUnit || '').trim();
    const packageUnitLower = packageUnit.toLowerCase();

    // 1g is equivalent to 1mL (and 1kg to 1L).
    // Target Weight (Balança) matches nominal capacity.
    // Volume Equivalent is nominal weight * density.
    let targetWeightVal = packageVolume;
    let targetWeightUnit: 'g' | 'kg' = 'g';

    if (packageUnitLower === 'l' || packageUnitLower === 'kg') {
      targetWeightUnit = 'kg';
    } else {
      targetWeightUnit = 'g';
    }

    const nominalWeightInG = targetWeightUnit === 'kg' ? targetWeightVal * 1000 : targetWeightVal;
    const targetVolumeInMl = nominalWeightInG * calculatedDensity;

    let targetVolumeVal = 0;
    let targetVolumeUnit: 'mL' | 'L' = 'mL';

    if (packageUnitLower === 'l' || packageUnitLower === 'kg') {
      targetVolumeVal = Number((targetVolumeInMl / 1000).toFixed(3));
      targetVolumeUnit = 'L';
    } else {
      targetVolumeVal = Number(targetVolumeInMl.toFixed(1));
      targetVolumeUnit = 'mL';
    }

    return {
      weight: { value: targetWeightVal, unit: targetWeightUnit },
      volume: { value: targetVolumeVal, unit: targetVolumeUnit }
    };
  }, [activePattern, calculatedDensity]);

  const calculatedPackagingWeight = useMemo(() => {
    return fillingTargets.weight;
  }, [fillingTargets]);

  // Live validation checks
  const validation = useMemo(() => {
    if (!activePattern) return null;
    const phVal = formPh.toString().replace(',', '.').trim();
    const ph = phVal !== '' ? parseFloat(phVal) : null;
    const viscVal = formViscosity.toString().replace(',', '.').trim();
    const visc = viscVal !== '' ? parseFloat(viscVal) : null;
    const dens = calculatedDensity;

    const isPhOk = ph !== null && !isNaN(ph) ? (ph >= activePattern.phMin && ph <= activePattern.phMax) : true;
    const isViscOk = visc !== null && !isNaN(visc) ? (visc >= activePattern.viscosityMin && visc <= activePattern.viscosityMax) : true;
    
    const densMin = activePattern.densityTarget - activePattern.densityTolerance;
    const densMax = activePattern.densityTarget + activePattern.densityTolerance;
    const isDensOk = dens > 0 ? (dens >= densMin && dens <= densMax) : true;

    return {
      ph: { ok: isPhOk, msg: isPhOk ? 'pH Dentro do Padrão' : `Fora (Ref: ${activePattern.phMin} - ${activePattern.phMax})` },
      visc: { ok: isViscOk, msg: isViscOk ? 'Viscosidade Dentro' : `Fora (Ref: ${activePattern.viscosityMin.toLocaleString()} - ${activePattern.viscosityMax.toLocaleString()})` },
      dens: { ok: isDensOk, msg: isDensOk ? 'Densidade Dentro' : `Fora (Ref: ${densMin.toFixed(3)} - ${densMax.toFixed(3)})` },
      allOk: isPhOk && isViscOk && isDensOk
    };
  }, [activePattern, formPh, formViscosity, calculatedDensity]);

  // Automatic viscosity correction estimator
  const viscosityCorrection = useMemo(() => {
    if (!hasAdjustment || !activePattern) return null;
    const viscInitVal = adjInitialVisc.toString().replace(',', '.').trim();
    const viscInit = viscInitVal !== '' ? parseFloat(viscInitVal) : (formViscosity.toString().trim() !== '' ? parseFloat(formViscosity.toString().trim().replace(',', '.')) : 0);
    const targetVisc = (activePattern.viscosityMin + activePattern.viscosityMax) / 2; // Midpoint is target
    const addedTrialVal = adjTrialQty.toString().replace(',', '.').trim();
    const addedTrial = addedTrialVal !== '' ? parseFloat(addedTrialVal) : 0;
    const trialViscVal = adjTrialVisc.toString().replace(',', '.').trim();
    const trialVisc = trialViscVal !== '' ? parseFloat(trialViscVal) : 0;

    if (viscInit <= 0 || targetVisc <= 0 || addedTrial <= 0 || trialVisc <= viscInit) {
      return { recommendedQtyPerLiter: 0, estimatedTotalQty: 0 };
    }

    // cps change per gram in 1L
    const efficiency = (trialVisc - viscInit) / addedTrial;
    // grams of agent per liter to go from initial to target
    const recommendedQtyPerLiter = Number(((targetVisc - viscInit) / efficiency).toFixed(3));
    
    // Scale up for batch (BatchSize - 1 Liter)
    const batchVal = adjBatchSize.toString().replace(',', '.').trim();
    const batch = batchVal !== '' ? parseFloat(batchVal) : 0;
    const estimatedTotalQty = batch > 1 ? Number((recommendedQtyPerLiter * (batch - 1)).toFixed(2)) : 0;

    return {
      recommendedQtyPerLiter,
      estimatedTotalQty
    };
  }, [hasAdjustment, activePattern, adjInitialVisc, formViscosity, adjTrialQty, adjTrialVisc, adjBatchSize]);

  // Auto-fill target viscosity in calculator when initial viscosity is typed
  useEffect(() => {
    if (formViscosity && hasAdjustment && !adjInitialVisc) {
      setAdjInitialVisc(formViscosity);
    }
  }, [formViscosity, hasAdjustment]);

  // Save Analysis Record
  const handleSaveAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProductCode) {
      alert('Selecione um produto.');
      return;
    }
    if (!formBatch.trim()) {
      alert('Digite o Lote.');
      return;
    }

    const phClean = formPh.toString().trim().replace(',', '.');
    const viscClean = formViscosity.toString().trim().replace(',', '.');
    const fracClean = formFractionWeight.toString().trim().replace(',', '.');

    if (phClean === '' || fracClean === '' || viscClean === '') {
      alert('Preencha os campos medidos de pH, peso da fração e viscosidade.');
      return;
    }

    const phNum = parseFloat(phClean);
    const viscNum = parseFloat(viscClean);
    const fracNum = parseFloat(fracClean);

    if (isNaN(phNum) || isNaN(viscNum) || isNaN(fracNum)) {
      alert('Os valores inseridos nos campos medidos devem ser números válidos.');
      return;
    }

    const linkedProduct = products.find(p => p.code === formProductCode);
    const productName = linkedProduct ? linkedProduct.name : 'Produto Desconhecido';

    const adjInitialViscNum = hasAdjustment ? parseFloat(adjInitialVisc.toString().replace(',', '.')) : null;
    const adjTrialQtyNum = hasAdjustment ? parseFloat(adjTrialQty.toString().replace(',', '.')) : null;
    const adjTrialViscNum = hasAdjustment ? parseFloat(adjTrialVisc.toString().replace(',', '.')) : null;
    const adjFinalQtyNum = hasAdjustment ? parseFloat(adjFinalQty.toString().replace(',', '.')) : null;
    const adjBatchSizeNum = hasAdjustment ? parseFloat(adjBatchSize.toString().replace(',', '.')) : null;

    const payload: FiscoQuimicaAnalysis = {
      id: crypto.randomUUID(),
      productCode: formProductCode,
      productName,
      batch: formBatch.trim(),
      analysisDate: formDate,
      technician: formTechnician.trim() || 'Técnico de Laboratório',
      phMeasured: phNum,
      viscosityMeasured: viscNum,
      densityMeasured: calculatedDensity,
      fractionWeight: fracNum,
      envaseTargetWeight: calculatedPackagingWeight.value,
      envaseTargetUnit: calculatedPackagingWeight.unit,
      hasAdjustment,
      correctiveAgentId: hasAdjustment ? (adjAgentId || null) : null,
      initialViscosity: hasAdjustment ? (adjInitialViscNum || null) : null,
      trialAgentQty: hasAdjustment ? (adjTrialQtyNum || null) : null,
      trialViscosity: hasAdjustment ? (adjTrialViscNum || null) : null,
      agentQtyPerLiter: hasAdjustment ? (adjFinalQtyNum || null) : null,
      batchSize: hasAdjustment ? (adjBatchSizeNum || null) : null,
      totalAgentRequired: (hasAdjustment && adjFinalQtyNum && adjBatchSizeNum) 
        ? Number((adjFinalQtyNum * (adjBatchSizeNum - 1)).toFixed(2)) 
        : null,
      notes: formNotes.trim() || null
    };

    try {
      await api.saveFiscoQuimicaAnalysis(payload);
      alert('Análise físico-química salva com sucesso!');
      
      // Reset form
      setFormProductCode('');
      setFormBatch('');
      setFormPh('');
      setFormFractionWeight('');
      setFormViscosity('');
      setFormNotes('');
      setHasAdjustment(false);
      setAdjAgentId('');
      setAdjInitialVisc('');
      setAdjTrialQty('');
      setAdjTrialVisc('');
      setAdjFinalQty('');
      setAdjBatchSize('');

      loadAllData();
      setActiveTab('history');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar registro de análise.');
    }
  };

  // Delete Analysis
  const handleDeleteAnalysis = async (id: string, batch: string) => {
    if (!confirm(`Excluir permanentemente o registro de análise físico-química do lote ${batch}?`)) return;
    try {
      await api.deleteFiscoQuimicaAnalysis(id);
      loadAllData();
    } catch (e) {
      console.error(e);
      alert('Erro ao excluir registro.');
    }
  };

  // Manage patterns modal
  const handleOpenAddPatternForProduct = (prod: Product) => {
    setEditingPattern(null);
    setPatCode(prod.code);
    setPatPhMin('5.5');
    setPatPhMax('7.0');
    setPatViscMin('8000');
    setPatViscMax('12000');
    setPatDensityTarget('1.000');
    setPatDensityTolerance('0.020');
    
    // Auto-extract capacity and unit from product description (prod.name)
    const match = prod.name.match(/(\d+(?:[.,]\d+)?)\s*(ML|L|G|KG)\b/i);
    if (match) {
      setPatVol(match[1].replace(',', '.'));
      const unitUpper = match[2].toUpperCase();
      if (unitUpper === 'ML') setPatUnit('mL');
      else if (unitUpper === 'L') setPatUnit('L');
      else if (unitUpper === 'G') setPatUnit('g');
      else if (unitUpper === 'KG') setPatUnit('kg');
    } else {
      setPatVol('1000');
      setPatUnit('mL');
    }
    
    setPatAllowedAgents([]);
    setShowPatternModal(true);
  };

  const handleOpenEditPatternForProduct = (prod: Product, pat: FiscoQuimicaPattern) => {
    setEditingPattern(pat);
    setPatCode(prod.code);
    setPatPhMin(pat.phMin.toString());
    setPatPhMax(pat.phMax.toString());
    setPatViscMin(pat.viscosityMin.toString());
    setPatViscMax(pat.viscosityMax.toString());
    setPatDensityTarget(pat.densityTarget.toString());
    setPatDensityTolerance(pat.densityTolerance.toString());
    setPatVol(pat.packageVolume.toString());
    setPatUnit(pat.packageUnit);
    setPatAllowedAgents(pat.allowedAgents || []);
    setShowPatternModal(true);
  };

  const handleSavePattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patCode) {
      alert('Código de produto não definido.');
      return;
    }

    const phMinClean = patPhMin.toString().trim().replace(',', '.');
    const phMaxClean = patPhMax.toString().trim().replace(',', '.');
    const viscMinClean = patViscMin.toString().trim().replace(',', '.');
    const viscMaxClean = patViscMax.toString().trim().replace(',', '.');
    const densTargetClean = patDensityTarget.toString().trim().replace(',', '.');
    const densTolClean = patDensityTolerance.toString().trim().replace(',', '.');
    const volClean = patVol.toString().trim().replace(',', '.');

    const phMinNum = parseFloat(phMinClean);
    const phMaxNum = parseFloat(phMaxClean);
    const viscMinNum = parseFloat(viscMinClean);
    const viscMaxNum = parseFloat(viscMaxClean);
    const densTargetNum = parseFloat(densTargetClean);
    const densTolNum = parseFloat(densTolClean);
    const volNum = parseFloat(volClean);

    if (
      isNaN(phMinNum) || isNaN(phMaxNum) ||
      isNaN(viscMinNum) || isNaN(viscMaxNum) ||
      isNaN(densTargetNum) || isNaN(densTolNum) ||
      isNaN(volNum)
    ) {
      alert('Preencha todos os campos obrigatórios com valores numéricos válidos.');
      return;
    }

    const payload: FiscoQuimicaPattern = {
      productCode: patCode,
      phMin: phMinNum,
      phMax: phMaxNum,
      viscosityMin: viscMinNum,
      viscosityMax: viscMaxNum,
      densityTarget: densTargetNum,
      densityTolerance: densTolNum,
      packageVolume: volNum,
      packageUnit: patUnit,
      allowedAgents: patAllowedAgents
    };

    try {
      await api.saveFiscoQuimicaPattern(payload);
      setShowPatternModal(false);
      loadAllData();
      alert('Padrão de especificação gravado com sucesso.');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar padrão de especificação.');
    }
  };

  const handleDeletePattern = async (code: string) => {
    if (!confirm(`Remover as especificações físico-químicas do produto ${code}?`)) return;
    try {
      await api.deleteFiscoQuimicaPattern(code);
      loadAllData();
    } catch (e) {
      console.error(e);
    }
  };

  // Manage corrective agents - Link existing raw material items
  const handleLinkAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) {
      alert('Selecione uma matéria-prima válida.');
      return;
    }

    if (agents.some(a => a.id === activeItem.code)) {
      alert('Esta matéria-prima já está vinculada como agente corretivo.');
      return;
    }

    try {
      await api.saveFiscoQuimicaAgent({
        id: activeItem.code,
        name: activeItem.description
      });
      setItemCodeInput('');
      loadAllData();
      alert('Matéria-prima vinculada como agente corretivo com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao vincular matéria-prima.');
    }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`Remover agente corretivo "${name}"?`)) return;
    try {
      await api.deleteFiscoQuimicaAgent(id);
      loadAllData();
    } catch (e) {
      console.error(e);
    }
  };

  // Filter history records
  const filteredAnalyses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return analyses;
    const qNormalized = q.replace(/\./g, '');
    return analyses.filter(a => {
      const aCodeNormalized = a.productCode.toLowerCase().replace(/\./g, '');
      return (
        aCodeNormalized.includes(qNormalized) ||
        a.productName.toLowerCase().includes(q) ||
        a.batch.toLowerCase().includes(q) ||
        a.technician.toLowerCase().includes(q) ||
        (a.notes || '').toLowerCase().includes(q)
      );
    });
  }, [analyses, searchQuery]);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans text-zinc-900 overflow-hidden text-left">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-zinc-200 shrink-0">
          <h1 className="font-bold text-base tracking-tight text-zinc-800 uppercase flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-zinc-900 animate-pulse" />
            Físico-Química
          </h1>
        </div>

        {/* Back button */}
        <div className="p-2 border-b border-zinc-100">
          <button
            onClick={onBackToHub}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5 text-zinc-400" />
            Voltar à Produção
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <button
            onClick={() => setActiveTab('new_analysis')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === 'new_analysis' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <Calculator className="h-5 w-5 shrink-0 text-zinc-500" />
            Registrar Análise
          </button>
          
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === 'history' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <Activity className="h-5 w-5 shrink-0 text-zinc-500" />
            Histórico de Análises
          </button>
          
          <button
            onClick={() => setActiveTab('patterns')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === 'patterns' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <Settings className="h-5 w-5 shrink-0 text-zinc-500" />
            Padrões por Produto
          </button>
          
          <button
            onClick={() => setActiveTab('agents')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
              activeTab === 'agents' ? "bg-zinc-100 text-zinc-900 font-bold" : "text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <Plus className="h-5 w-5 shrink-0 text-zinc-500" />
            Agente Corretivo
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-8 shrink-0">
          <h2 className="text-xl font-semibold">
            {activeTab === 'new_analysis' && 'Registrar Medições de Lote'}
            {activeTab === 'history' && 'Histórico de Laudos Físico-Químicos'}
            {activeTab === 'patterns' && 'Padrões de Especificação por Produto'}
            {activeTab === 'agents' && 'Vincular Agentes Corretivos (Matérias-Primas)'}
          </h2>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-zinc-50/50">
          {/* TAB: NEW ANALYSIS FORM */}
          {activeTab === 'new_analysis' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <form onSubmit={handleSaveAnalysis} className="space-y-6">
                
                {/* 1. Lot and Product selection */}
                <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Produto Acabado *</label>
                    <input 
                      type="text"
                      list="fisco-quimica-product-codes"
                      value={formProductCode}
                      onChange={e => handleProductCodeChange(e.target.value)}
                      required
                      placeholder="Código do item"
                      className={cn(
                        "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 bg-white font-mono font-bold transition-colors",
                        formProductCode && !activeProduct ? "border-red-300 text-red-600 focus:ring-red-500 focus:border-red-500" : "border-zinc-300 text-zinc-900"
                      )}
                    />
                    <datalist id="fisco-quimica-product-codes">
                      {products.map(p => (
                        <option key={p.code} value={p.code}>
                          {p.code.replace(/\./g, '')} - {p.name}
                        </option>
                      ))}
                    </datalist>
                    <span className="text-[10px] font-medium text-zinc-550 block truncate mt-1">
                      {activeProduct ? activeProduct.name : formProductCode ? 'Produto não localizado' : 'Aguardando código...'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Lote de Produção *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Ex: L2026-A"
                      value={formBatch}
                      onChange={e => setFormBatch(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Data da Medição *</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input 
                        type="date" 
                        required
                        value={formDate}
                        onChange={e => setFormDate(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Técnico Analista *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input 
                        type="text" 
                        required
                        placeholder="Nome do analista"
                        value={formTechnician}
                        onChange={e => setFormTechnician(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Measured parameters */}
                <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm space-y-6">
                  <h3 className="font-bold text-sm text-zinc-800 border-b border-zinc-150 pb-2">Especificações e Medições</h3>
                  
                  {!activeProduct ? (
                    <div className="p-6 text-center bg-zinc-50 rounded-xl border border-zinc-200 text-zinc-500 text-xs font-semibold flex items-center justify-center gap-2">
                      <Info className="w-5 h-5" />
                      Por favor, digite um código de produto válido para liberar o preenchimento das medições.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      
                      {/* pH card */}
                      <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 flex flex-col justify-between space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-500 uppercase">Potencial Hidrogeniônico (pH)</span>
                          {activePattern && formPh !== '' && (
                            validation?.ph.ok ? (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-200">OK</span>
                            ) : (
                              <span className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold border border-rose-200">FORA</span>
                            )
                          )}
                        </div>
                        
                        <div className="flex items-baseline gap-2">
                          <input 
                            type="text" 
                            inputMode="decimal"
                            placeholder="Ex: 6.25"
                            value={formPh}
                            onChange={e => setFormPh(e.target.value.replace(',', '.'))}
                            onBlur={handlePhBlur}
                            className="w-28 text-xl font-black border border-zinc-300 rounded-lg px-2.5 py-1 focus:outline-none text-zinc-900 bg-white"
                          />
                          <span className="text-zinc-400 text-xs font-semibold">Valor Medido</span>
                        </div>

                        <div className="text-[11px] text-zinc-500 font-medium">
                          {activePattern ? (
                            <>Padrão de Ref: <strong className="text-zinc-700">{activePattern.phMin} - {activePattern.phMax}</strong></>
                          ) : (
                            <span className="text-zinc-400 italic">Padrão de especificação não definido</span>
                          )}
                        </div>
                      </div>

                      {/* Viscosity card */}
                      <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 flex flex-col justify-between space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-500 uppercase">Viscosidade Dinâmica</span>
                          {activePattern && formViscosity !== '' && (
                            validation?.visc.ok ? (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-200">OK</span>
                            ) : (
                              <span className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold border border-rose-200">FORA</span>
                            )
                          )}
                        </div>
                        
                        <div className="flex items-baseline gap-2">
                          <input 
                            type="text" 
                            inputMode="numeric"
                            placeholder="Ex: 9500"
                            value={formViscosity}
                            onChange={e => setFormViscosity(e.target.value.replace(',', '.'))}
                            className="w-28 text-xl font-black border border-zinc-300 rounded-lg px-2.5 py-1 focus:outline-none text-zinc-900 bg-white"
                          />
                          <span className="text-zinc-400 text-xs font-semibold">cps</span>
                        </div>

                        <div className="text-[11px] text-zinc-500 font-medium">
                          {activePattern ? (
                            <>Padrão de Ref: <strong className="text-zinc-700">{activePattern.viscosityMin.toLocaleString()} - {activePattern.viscosityMax.toLocaleString()} cps</strong></>
                          ) : (
                            <span className="text-zinc-400 italic">Padrão de especificação não definido</span>
                          )}
                        </div>
                      </div>

                      {/* Density card */}
                      <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 flex flex-col justify-between space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-500 uppercase">Densidade Copo Padrão</span>
                          {activePattern && calculatedDensity > 0 && (
                            validation?.dens.ok ? (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-200">OK</span>
                            ) : (
                              <span className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold border border-rose-200">FORA</span>
                            )
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Peso Fração (g)</span>
                            <input 
                              type="text" 
                              inputMode="decimal"
                              placeholder="Ex: 46.48"
                              value={formFractionWeight}
                              onChange={e => setFormFractionWeight(e.target.value.replace(',', '.'))}
                              onBlur={handleFractionWeightBlur}
                              className="w-24 text-sm font-bold border border-zinc-300 rounded px-2 py-0.5 focus:outline-none text-zinc-900 bg-white"
                            />
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Densidade</span>
                            <div className="text-lg font-black text-zinc-800">
                              {calculatedDensity > 0 ? `${calculatedDensity.toFixed(3)}` : '-'} <span className="text-xs font-medium text-zinc-400">g/mL</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-[11px] text-zinc-500 font-medium">
                          {activePattern ? (
                            <>Ref: <strong className="text-zinc-700">{activePattern.densityTarget.toFixed(3)} g/mL</strong> (Tol: ±{activePattern.densityTolerance.toFixed(3)})</>
                          ) : (
                            <span className="text-zinc-400 italic">Padrão de especificação não definido</span>
                          )}
                        </div>
                      </div>
                      
                    </div>
                  )}

                  {/* Packaging Weight and Volume calculations */}
                  {activePattern && calculatedDensity > 0 && (
                    <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-900 text-white flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex items-center gap-3">
                        <Calculator className="w-8 h-8 text-zinc-400" />
                        <div className="text-left">
                          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Metas de Envase por Densidade</p>
                          <p className="text-xs text-zinc-300 font-medium mt-0.5">
                            Nominal: <strong>{activePattern.packageVolume} {activePattern.packageUnit}</strong> | Densidade: <strong>{calculatedDensity.toFixed(3)} g/mL</strong>
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-6">
                        <div className="text-left md:text-right">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block">Peso Alvo (Balança)</span>
                          <strong className="text-2xl font-black text-emerald-400">
                            {fillingTargets.weight.value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} {fillingTargets.weight.unit}
                          </strong>
                        </div>
                        <div className="w-[1px] h-8 bg-zinc-700 hidden md:block"></div>
                        <div className="text-left md:text-right">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase block">Volume Equivalente</span>
                          <strong className="text-2xl font-black text-blue-400">
                            {fillingTargets.volume.value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} {fillingTargets.volume.unit}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Viscosity Correction Calculator (Ajuste de Viscosidade) */}
                {activePattern && (
                  <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={hasAdjustment}
                        onChange={e => setHasAdjustment(e.target.checked)}
                        className="w-4 h-4 text-zinc-950 focus:ring-zinc-950 accent-zinc-950 rounded cursor-pointer"
                      />
                      <div>
                        <strong className="text-sm font-black text-zinc-800 block">Necessita de Correção de Viscosidade?</strong>
                        <span className="text-xs text-zinc-400 font-medium">Calcule a dose corretiva (Cloreto, Lauril, etc.) para o lote com base na amostra de 1L</span>
                      </div>
                    </label>

                    {hasAdjustment && (
                      <div className="mt-4 p-5 rounded-xl border border-zinc-200 bg-zinc-50 text-left space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          
                          {/* 1. Corrective Agent */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Agente Corretivo</label>
                            <select
                              value={adjAgentId}
                              onChange={e => setAdjAgentId(e.target.value)}
                              required={hasAdjustment}
                              className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none bg-white text-zinc-850"
                            >
                              <option value="">Selecione...</option>
                              {agents.filter(a => activePattern?.allowedAgents?.includes(a.id)).length === 0 ? (
                                <option disabled value="">Nenhum corretivo cadastrado para este produto</option>
                              ) : (
                                agents
                                  .filter(a => activePattern?.allowedAgents?.includes(a.id))
                                  .map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                  ))
                              )}
                            </select>
                          </div>

                          {/* 2. Initial Viscosity */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Viscosidade Inicial (cps)</label>
                            <input 
                              type="text"
                              inputMode="numeric"
                              required={hasAdjustment}
                              placeholder="Ex: 4000"
                              value={adjInitialVisc}
                              onChange={e => setAdjInitialVisc(e.target.value.replace(',', '.'))}
                              className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none bg-white text-zinc-850"
                            />
                          </div>

                          {/* 3. Trial Dose */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Dose Teste em 1L (g)</label>
                            <input 
                              type="text"
                              inputMode="decimal"
                              required={hasAdjustment}
                              placeholder="Ex: 1"
                              value={adjTrialQty}
                              onChange={e => setAdjTrialQty(e.target.value.replace(',', '.'))}
                              onBlur={handleAdjTrialQtyBlur}
                              className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none bg-white text-zinc-850"
                            />
                          </div>

                          {/* 4. Viscosity After Trial */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Visc. após Dose (cps)</label>
                            <input 
                              type="text"
                              inputMode="numeric"
                              required={hasAdjustment}
                              placeholder="Ex: 5000"
                              value={adjTrialVisc}
                              onChange={e => setAdjTrialVisc(e.target.value.replace(',', '.'))}
                              className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none bg-white text-zinc-850"
                            />
                          </div>
                        </div>

                        {/* Calculations summary banner */}
                        {viscosityCorrection && viscosityCorrection.recommendedQtyPerLiter > 0 && (
                          <div className="p-3.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-xs leading-relaxed space-y-2">
                            <p className="font-bold flex items-center gap-1.5">
                              <Info className="w-4 h-4" /> Estudo Corretivo Estimado:
                            </p>
                            <p>
                              A viscosidade subiu <strong>{(parseFloat(adjTrialVisc.toString().replace(',', '.')) || 0) - (parseFloat(adjInitialVisc.toString().replace(',', '.')) || 0)} cps</strong> com a adição de {adjTrialQty}g de corretivo.
                              A concentração recomendada para atingir o valor médio ideal do padrão (<strong>{((activePattern.viscosityMin + activePattern.viscosityMax) / 2).toLocaleString()} cps</strong>) é de aproximadamente:
                            </p>
                            <div className="text-sm font-black text-blue-900 bg-blue-100 p-2 rounded w-fit">
                              Concentração: {viscosityCorrection.recommendedQtyPerLiter} g/L (ou g/kg)
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-zinc-200 pt-4">
                          
                          {/* 5. Final Qty Per Liter */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Concentração Prática Final Usada (g/L)</label>
                            <input 
                              type="text"
                              inputMode="decimal"
                              required={hasAdjustment}
                              placeholder="Ex: 6.000"
                              value={adjFinalQty}
                              onChange={e => setAdjFinalQty(e.target.value.replace(',', '.'))}
                              onBlur={handleAdjFinalQtyBlur}
                              className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none bg-white text-zinc-850 font-bold"
                            />
                          </div>

                          {/* 6. Batch Size */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Tamanho total do lote (L ou kg)</label>
                            <input 
                              type="text"
                              inputMode="decimal"
                              required={hasAdjustment}
                              placeholder="Ex: 1000"
                              value={adjBatchSize}
                              onChange={e => setAdjBatchSize(e.target.value.replace(',', '.'))}
                              className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none bg-white text-zinc-850 font-bold"
                            />
                          </div>

                          {/* 7. Total Agent needed */}
                          <div className="space-y-1 flex flex-col justify-end">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Total Necessário para o Lote</span>
                            <div className="text-lg font-black text-zinc-800 bg-zinc-100 px-3 py-1 rounded-lg border border-zinc-200 w-fit mt-1 min-h-[30px] flex items-center">
                              { (adjFinalQty.trim() !== '' && adjBatchSize.trim() !== '') ? (
                                `${((parseFloat(adjFinalQty.replace(',', '.')) * (parseFloat(adjBatchSize.replace(',', '.')) - 1)) / 1000).toFixed(3)} kg`
                              ) : '-'}
                            </div>
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                )}

                {/* 4. Notes & Save button */}
                <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Observações Gerais</label>
                    <textarea
                      placeholder="Anote detalhes de liberação, alterações ou desvios..."
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 text-zinc-850 bg-white"
                      rows={3}
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 bg-zinc-950 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-zinc-800 cursor-pointer shadow-sm transition-all"
                    >
                      <CheckCircle className="w-4 h-4" /> Salvar Laudo Físico-Químico
                    </button>
                  </div>
                </div>

              </form>
            </div>
          )}

          {/* TAB: ANALYSIS HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between gap-4">
                <div className="relative w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input 
                    type="text"
                    placeholder="Buscar por lote, produto, analista..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-300 rounded-xl focus:outline-none text-xs shadow-sm transition-all"
                  />
                </div>
              </div>

              <div className="overflow-x-auto min-h-[300px]">
                {loading ? (
                  <div className="py-20 text-center text-zinc-400">Carregando histórico...</div>
                ) : filteredAnalyses.length === 0 ? (
                  <div className="py-20 text-center text-zinc-400">Nenhum laudo localizado.</div>
                ) : (
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Lote / Data</th>
                        <th className="px-6 py-4">Produto</th>
                        <th className="px-6 py-4">pH</th>
                        <th className="px-6 py-4">Viscosidade</th>
                        <th className="px-6 py-4">Densidade</th>
                        <th className="px-6 py-4">Envase Alvo</th>
                        <th className="px-6 py-4">Ajuste / Corretivo</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {filteredAnalyses.map(a => {
                        const hasAdj = a.hasAdjustment;
                        const agent = agents.find(ag => ag.id === a.correctiveAgentId);
                        
                        return (
                          <tr key={a.id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-bold text-zinc-800">{a.batch}</span>
                                <span className="text-[10px] font-bold text-zinc-400">{new Date(a.analysisDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div>
                                <span className="font-bold text-zinc-800">{a.productName}</span>
                                <span className="block text-[10px] font-mono text-zinc-400">{a.productCode}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono font-bold text-zinc-800">{a.phMeasured.toFixed(2)}</td>
                            <td className="px-6 py-4 font-mono font-bold text-zinc-800">{a.viscosityMeasured.toLocaleString()} <span className="text-[10px] font-normal text-zinc-400">cps</span></td>
                            <td className="px-6 py-4 font-mono font-bold text-zinc-800">{a.densityMeasured.toFixed(3)} <span className="text-[10px] font-normal text-zinc-400">g/mL</span></td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 py-0.5 bg-zinc-900 text-white rounded font-mono font-bold text-xs">
                                {a.envaseTargetWeight} {a.envaseTargetUnit}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {hasAdj ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-xs font-bold">
                                  <Info className="w-3.5 h-3.5" />
                                  {agent?.name || 'Corretivo'} ({a.totalAgentRequired ? `${(a.totalAgentRequired / 1000).toFixed(3)} kg` : '-'})
                                </span>
                              ) : (
                                <span className="text-zinc-400 text-xs italic">Não Houve</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => { setSelectedAnalysis(a); setShowDetailModal(true); }}
                                  className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors cursor-pointer"
                                  title="Ver Detalhes"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteAnalysis(a.id, a.batch)}
                                  className="p-1 text-zinc-400 hover:text-red-650 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB: PRODUCT PATTERNS */}
          {activeTab === 'patterns' && (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input 
                    type="text"
                    placeholder="Buscar produto por nome ou código..."
                    value={patternSearchQuery}
                    onChange={e => setPatternSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-300 rounded-xl focus:outline-none text-xs shadow-sm transition-all"
                  />
                </div>
                <div className="text-xs font-bold text-zinc-500">
                  Total de Produtos: {products.length} ({patterns.length} com especificações)
                </div>
              </div>

              <div className="overflow-x-auto min-h-[300px]">
                {loading ? (
                  <div className="py-20 text-center text-zinc-400">Carregando produtos e especificações...</div>
                ) : filteredPatternProducts.length === 0 ? (
                  <div className="py-20 text-center text-zinc-400">Nenhum produto localizado.</div>
                ) : (
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Código / Produto</th>
                        <th className="px-6 py-4">pH Faixa</th>
                        <th className="px-6 py-4">Viscosidade Faixa</th>
                        <th className="px-6 py-4">Densidade Alvo</th>
                        <th className="px-6 py-4">Frasco Padrão</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {filteredPatternProducts.map(prod => {
                        const pat = patterns.find(p => p.productCode === prod.code);
                        return (
                          <tr key={prod.code} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div>
                                <span className="font-bold text-zinc-850 block">{prod.name}</span>
                                <span className="block text-[10px] font-mono text-zinc-400 font-bold">{prod.code}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono text-zinc-850">
                              {pat ? (
                                <span className="font-semibold">{pat.phMin.toFixed(2)} - {pat.phMax.toFixed(2)}</span>
                              ) : (
                                <span className="text-zinc-400 italic text-xs">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-mono text-zinc-850">
                              {pat ? (
                                <span className="font-semibold">{pat.viscosityMin.toLocaleString()} - {pat.viscosityMax.toLocaleString()} cps</span>
                              ) : (
                                <span className="text-zinc-400 italic text-xs">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-mono text-zinc-850">
                              {pat ? (
                                <span className="font-semibold">{pat.densityTarget.toFixed(3)} ± {pat.densityTolerance.toFixed(3)} g/mL</span>
                              ) : (
                                <span className="text-zinc-400 italic text-xs">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-zinc-850">
                              {pat ? (
                                <span className="font-bold">{pat.packageVolume} {pat.packageUnit}</span>
                              ) : (
                                <span className="text-zinc-400 italic text-xs">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {pat ? (
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-bold">
                                  Configurado
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 border border-zinc-200 rounded text-[10px] font-medium">
                                  Padrão Ausente
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                              <div className="flex items-center justify-end gap-2">
                                {pat ? (
                                  <>
                                    <button 
                                      onClick={() => handleOpenEditPatternForProduct(prod, pat)}
                                      className="flex items-center gap-1 px-2.5 py-1 text-zinc-650 hover:text-zinc-900 border border-zinc-200 hover:bg-zinc-50 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                                      title="Editar Padrão"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" /> Editar
                                    </button>
                                    <button 
                                      onClick={() => handleDeletePattern(pat.productCode)}
                                      className="p-1 text-zinc-400 hover:text-red-650 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                      title="Remover Padrão"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <button 
                                    onClick={() => handleOpenAddPatternForProduct(prod)}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-zinc-950 hover:bg-zinc-850 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
                                    title="Definir Especificações"
                                  >
                                    <Plus className="w-3.5 h-3.5" /> Definir Padrão
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB: CORRECTIVE AGENTS */}
          {activeTab === 'agents' && (
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Form card */}
              <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm text-left space-y-4">
                <div>
                  <h3 className="font-bold text-sm text-zinc-800">Vincular Matéria-Prima Corretiva</h3>
                  <p className="text-xs text-zinc-400 mt-1">Busque uma matéria-prima cadastrada no ERP para atuar como corretivo de viscosidade.</p>
                </div>
                <form onSubmit={handleLinkAgent} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Matéria-Prima (Código ou Descrição) *</label>
                    <input 
                      type="text"
                      list="raw-material-items"
                      value={itemCodeInput}
                      onChange={e => handleItemCodeChange(e.target.value)}
                      required
                      placeholder="Busque pelo código da MP..."
                      className={cn(
                        "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 bg-white font-mono font-bold transition-colors",
                        itemCodeInput && !activeItem ? "border-red-300 text-red-600 focus:ring-red-500 focus:border-red-500" : "border-zinc-300 text-zinc-900"
                      )}
                    />
                    <datalist id="raw-material-items">
                      {items.map(i => (
                        <option key={i.code} value={i.code}>
                          {i.code.replace(/\./g, '')} - {i.description}
                        </option>
                      ))}
                    </datalist>
                    <span className="text-[10px] font-medium text-zinc-550 block truncate mt-1">
                      {activeItem ? (
                        <span className="text-emerald-700 font-bold">
                          ✓ {activeItem.description} ({activeItem.unit})
                        </span>
                      ) : itemCodeInput ? 'Matéria-prima não localizada' : 'Aguardando código...'}
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-zinc-950 text-white py-2 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors shadow-sm cursor-pointer"
                  >
                    Vincular Matéria-Prima
                  </button>
                </form>
              </div>

              {/* List card */}
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden text-left flex flex-col">
                <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-200">
                  <h3 className="font-bold text-sm text-zinc-800">Agentes Corretivos Vinculados</h3>
                </div>
                
                <div className="divide-y divide-zinc-200 max-h-[400px] overflow-y-auto">
                  {loading ? (
                    <div className="p-6 text-center text-zinc-400">Carregando agentes...</div>
                  ) : agents.length === 0 ? (
                    <div className="p-6 text-center text-zinc-400">Nenhum agente corretivo vinculado.</div>
                  ) : (
                    agents.map(a => (
                      <div key={a.id} className="px-6 py-3 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-sm text-zinc-800">{a.name}</span>
                          <span className="text-[10px] font-mono text-zinc-400 font-bold">Código MP: {a.id}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteAgent(a.id, a.name)}
                          className="p-1 text-zinc-400 hover:text-red-650 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title="Remover Vínculo"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* DETAIL MODAL OVERLAY */}
      {showDetailModal && selectedAnalysis && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] text-left animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-zinc-850 text-base">Laudo Físico-Químico: Lote {selectedAnalysis.batch}</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                  Medido em {new Date(selectedAnalysis.analysisDate + 'T00:00:00').toLocaleDateString('pt-BR')} por {selectedAnalysis.technician}
                </p>
              </div>
              <button 
                onClick={() => setShowDetailModal(false)}
                className="text-zinc-400 hover:text-zinc-650 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              <div className="bg-zinc-900 text-white p-4 rounded-xl space-y-1">
                <span className="text-[9px] text-zinc-400 font-bold uppercase block">Produto</span>
                <span className="font-bold text-sm">{selectedAnalysis.productName}</span>
                <span className="block font-mono text-[10px] text-zinc-400">Código de Referência: {selectedAnalysis.productCode}</span>
              </div>

              {/* Physical measurements */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3.5 rounded-lg border border-zinc-200 bg-zinc-50 text-center">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">pH</span>
                  <span className="text-lg font-black text-zinc-800">{selectedAnalysis.phMeasured.toFixed(2)}</span>
                </div>
                <div className="p-3.5 rounded-lg border border-zinc-200 bg-zinc-50 text-center">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Viscosidade</span>
                  <span className="text-lg font-black text-zinc-800">{selectedAnalysis.viscosityMeasured.toLocaleString()} <span className="text-xs font-normal">cps</span></span>
                </div>
                <div className="p-3.5 rounded-lg border border-zinc-200 bg-zinc-50 text-center">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Densidade</span>
                  <span className="text-lg font-black text-zinc-800">{selectedAnalysis.densityMeasured.toFixed(3)} <span className="text-xs font-normal">g/mL</span></span>
                </div>
              </div>

              {/* Density details */}
              <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-xs space-y-1.5">
                <p className="font-bold text-zinc-700 flex items-center gap-1"><Calculator className="w-4 h-4 text-zinc-400" /> Detalhes de Calibração / Envase</p>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>Copo Padrão (Volume): <strong>{DENSITY_CUP_VOLUME} mL</strong></div>
                  <div>Peso Medido da Fração: <strong>{selectedAnalysis.fractionWeight.toFixed(3)} g</strong></div>
                  
                  <div className="col-span-2 mt-1 pt-1.5 border-t border-zinc-200 font-bold text-zinc-850 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span>Peso Alvo do Envase:</span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono font-bold">
                        {selectedAnalysis.envaseTargetWeight} {selectedAnalysis.envaseTargetUnit}
                      </span>
                    </div>
                    {selectedAnalysis.densityMeasured > 0 && (
                      <div className="flex items-center justify-between text-zinc-550 text-[11px] mt-0.5">
                        <span>Volume Equivalente:</span>
                        <span className="font-mono font-bold text-blue-700">
                          {(() => {
                            const wG = selectedAnalysis.envaseTargetUnit === 'kg' ? selectedAnalysis.envaseTargetWeight * 1000 : selectedAnalysis.envaseTargetWeight;
                            const vMl = wG * selectedAnalysis.densityMeasured;
                            return vMl >= 1000 ? `${(vMl / 1000).toFixed(3)} L` : `${vMl.toFixed(1)} mL`;
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Viscosity adjustment scaling details */}
              {selectedAnalysis.hasAdjustment && (
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-2">
                  <p className="font-black text-amber-900 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-amber-600" /> Correção de Viscosidade Realizada
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2 mt-1 text-amber-800">
                    <div>Agente Corretivo: <strong>{agents.find(ag => ag.id === selectedAnalysis.correctiveAgentId)?.name || 'Corretivo'}</strong></div>
                    <div>Viscosidade Inicial: <strong>{selectedAnalysis.initialViscosity?.toLocaleString()} cps</strong></div>
                    <div>Dose Teste (1L): <strong>{selectedAnalysis.trialAgentQty} g</strong></div>
                    <div>Visc. após Teste: <strong>{selectedAnalysis.trialViscosity?.toLocaleString()} cps</strong></div>
                    
                    <div className="col-span-2 mt-2 pt-2 border-t border-amber-200 flex flex-col gap-1.5">
                      <div className="flex justify-between">
                        <span>Concentração por Litro:</span>
                        <strong>{selectedAnalysis.agentQtyPerLiter} g/L</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Volume do Lote:</span>
                        <strong>{selectedAnalysis.batchSize} L</strong>
                      </div>
                      <div className="flex justify-between text-sm font-black text-amber-950 pt-1 border-t border-amber-200/50">
                        <span>Total Adicionado no Lote:</span>
                        <span>{selectedAnalysis.totalAgentRequired ? `${(selectedAnalysis.totalAgentRequired / 1000).toFixed(3)} kg` : '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedAnalysis.notes && (
                <div className="space-y-1 text-xs">
                  <span className="text-zinc-400 font-bold block">Observações do Laudo</span>
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-700 italic">
                    "{selectedAnalysis.notes}"
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-end shrink-0">
              <button 
                onClick={() => setShowDetailModal(false)}
                className="bg-zinc-900 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-zinc-800 transition-colors shadow cursor-pointer"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PATTERN MODAL (ADD/EDIT) */}
      {showPatternModal && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form 
            onSubmit={handleSavePattern}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-left animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-zinc-900 text-sm">
                  {editingPattern ? 'Editar Padrão de Produto' : 'Cadastrar Padrão de Produto'}
                </h3>
                <p className="text-[10px] text-zinc-400 font-medium">Estipule limites aceitáveis para análises físico-químicas</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowPatternModal(false)}
                className="text-zinc-400 hover:text-zinc-650 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Product Info (Read-only Preview Card) */}
              <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-1">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Produto Selecionado</span>
                <span className="font-bold text-sm text-zinc-800 block">
                  {products.find(p => p.code === patCode)?.name || 'Produto Acabado'}
                </span>
                <span className="block font-mono text-xs text-zinc-500 font-bold">Código do Item: {patCode}</span>
              </div>

              {/* pH Min/Max */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">pH Mínimo *</label>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    required 
                    value={patPhMin} 
                    onChange={e => setPatPhMin(e.target.value.replace(',', '.'))}
                    onBlur={handlePatPhMinBlur}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none text-zinc-900 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">pH Máximo *</label>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    required 
                    value={patPhMax} 
                    onChange={e => setPatPhMax(e.target.value.replace(',', '.'))}
                    onBlur={handlePatPhMaxBlur}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none text-zinc-900 bg-white"
                  />
                </div>
              </div>

              {/* Viscosity Min/Max */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Viscosidade Mínima (cps) *</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    required 
                    value={patViscMin} 
                    onChange={e => setPatViscMin(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none text-zinc-900 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Viscosidade Máxima (cps) *</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    required 
                    value={patViscMax} 
                    onChange={e => setPatViscMax(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none text-zinc-900 bg-white"
                  />
                </div>
              </div>

              {/* Density target & tolerance */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Densidade Alvo (g/mL) *</label>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    required 
                    value={patDensityTarget} 
                    onChange={e => setPatDensityTarget(e.target.value.replace(',', '.'))}
                    onBlur={handlePatDensityTargetBlur}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none text-zinc-900 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Tolerância da Densidade *</label>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    required 
                    value={patDensityTolerance} 
                    onChange={e => setPatDensityTolerance(e.target.value.replace(',', '.'))}
                    onBlur={handlePatDensityToleranceBlur}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none text-zinc-900 bg-white"
                  />
                </div>
              </div>

              {/* Package size & unit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Capacidade Embalagem *</label>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    required 
                    value={patVol} 
                    onChange={e => setPatVol(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none text-zinc-900 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Unidade da Embalagem *</label>
                  <select
                    value={patUnit}
                    onChange={e => setPatUnit(e.target.value as any)}
                    className="w-full border border-zinc-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none bg-white text-zinc-850"
                  >
                    <option value="mL">mL</option>
                    <option value="L">L</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              {/* Allowed Corrective Agents Selection */}
              <div className="space-y-1.5 border-t border-zinc-200 pt-3 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Agente Corretivo Permitido para este Produto</label>
                <p className="text-[10px] text-zinc-400">Marque quais matérias-primas corretivas podem ser usadas para corrigir a viscosidade deste produto.</p>
                <div className="grid grid-cols-2 gap-2 mt-1 max-h-[120px] overflow-y-auto p-2 border border-zinc-200 rounded-lg bg-zinc-50">
                  {agents.length === 0 ? (
                    <span className="text-[10px] text-zinc-400 italic col-span-2">Nenhum agente corretivo vinculado em "Agente Corretivo".</span>
                  ) : (
                    agents.map(ag => {
                      const isChecked = patAllowedAgents.includes(ag.id);
                      return (
                        <label key={ag.id} className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer select-none hover:text-zinc-950">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              if (e.target.checked) {
                                setPatAllowedAgents([...patAllowedAgents, ag.id]);
                              } else {
                                setPatAllowedAgents(patAllowedAgents.filter(id => id !== ag.id));
                              }
                            }}
                            className="w-3.5 h-3.5 text-zinc-950 focus:ring-zinc-950 accent-zinc-950 rounded cursor-pointer"
                          />
                          <span className="truncate" title={`${ag.name} (${ag.id})`}>{ag.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-end gap-2 shrink-0">
              <button 
                type="button" 
                onClick={() => setShowPatternModal(false)}
                className="bg-white border border-zinc-300 text-zinc-650 text-xs font-bold px-4 py-2 rounded-xl hover:bg-zinc-50 cursor-pointer shadow-sm"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="bg-zinc-950 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-zinc-800 cursor-pointer shadow"
              >
                Gravar Padrão
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
