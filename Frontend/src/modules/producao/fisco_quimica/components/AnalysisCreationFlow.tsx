import React, { useState, useMemo, useEffect } from 'react';
import { api } from '../../../geral/lib/api';
import {
  FiscoQuimicaPattern,
  FiscoQuimicaAgent,
  FiscoQuimicaAnalysis,
  Product,
  LoteProductLine,
  FiscoTemplateConfig
} from '../../../geral/lib/types';
import {
  FlaskConical,
  CheckCircle,
  Calendar,
  User,
  Info,
  Loader2,
  AlertTriangle,
  Calculator,
  Activity,
  PlusCircle,
  Sparkles,
  Printer,
  Plus,
  Trash2,
  Check,
  X,
  Gauge,
  Sliders
} from 'lucide-react';
import { cn, randomId } from '../../../geral/lib/utils';
import { loteLookupErrorMessage, loteProductLabel } from '../../lib/loteLookup';
import {
  DENSITY_CUP_VOLUME,
  calculateDensity,
  calculateFillingTargets,
  calculateViscosityAdjustment,
  calculatePhAdjustment,
  checkAnalysisCompliance,
  printFiscoReports,
  ViscosityAdditionStep,
  OrganolepticEvaluation
} from '../lib/fiscoUtils';

interface AnalysisCreationFlowProps {
  products: Product[];
  patterns: FiscoQuimicaPattern[];
  agents: FiscoQuimicaAgent[];
  technicianName: string;
  setTechnicianName: (val: string) => void;
  config?: FiscoTemplateConfig;
  onSaved: () => void;
  onOpenAddPattern: (productCode: string, productName: string) => void;
}

export function AnalysisCreationFlow({
  products,
  patterns,
  agents,
  technicianName,
  setTechnicianName,
  config,
  onSaved,
  onOpenAddPattern,
}: AnalysisCreationFlowProps) {
  // Lote / Identificação
  const [formBatch, setFormBatch] = useState('');
  const [formBatchLoading, setFormBatchLoading] = useState(false);
  const [formProductCode, setFormProductCode] = useState('');
  const [formProductName, setFormProductName] = useState('');
  const [formLoteProducts, setFormLoteProducts] = useState<LoteProductLine[]>([]);
  const [formLoteHint, setFormLoteHint] = useState<string | null>(null);
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Medições Físico-Químicas
  const [formPh, setFormPh] = useState<string>('');
  const [formViscosity, setFormViscosity] = useState<string>('');
  const [formFractionWeight, setFormFractionWeight] = useState<string>('');
  const [formNotes, setFormNotes] = useState('');

  // Avaliações Organolépticas (Aspecto / Odor)
  const [aspectOk, setAspectOk] = useState(true);
  const [aspectDesc, setAspectDesc] = useState(config?.defaultAspect || 'Líquido / Emulsão Homogênea');
  const [colorOdorOk, setColorOdorOk] = useState(true);
  const [colorOdorDesc, setColorOdorDesc] = useState(config?.defaultColorOdor || 'Característico');

  // Ajuste de Viscosidade com Histórico de Adições
  const [hasAdjustment, setHasAdjustment] = useState(false);
  const [adjAgentId, setAdjAgentId] = useState('');
  const [adjInitialVisc, setAdjInitialVisc] = useState<string>('');
  
  // Etapas de ensaio de viscosidade em amostra de bancada de 1L
  const [additionSteps, setAdditionSteps] = useState<ViscosityAdditionStep[]>([
    { id: '1', stepNumber: 1, addedGrams: 1, cumulativeGrams: 1, measuredViscosity: null, notes: '' }
  ]);
  const [adjFinalQty, setAdjFinalQty] = useState<string>('');
  const [adjBatchSize, setAdjBatchSize] = useState<string>('');

  // Ajuste de pH com Cálculo Automático
  const [hasPhAdjustment, setHasPhAdjustment] = useState(false);
  const [adjPhAgentId, setAdjPhAgentId] = useState('');
  const [adjPhInitial, setAdjPhInitial] = useState('');
  const [adjPhTrialQty, setAdjPhTrialQty] = useState('0.5');
  const [adjPhTrialResult, setAdjPhTrialResult] = useState('');
  const [adjPhFinalQty, setAdjPhFinalQty] = useState('');
  const [adjPhBatchSize, setAdjPhBatchSize] = useState('');

  const [saving, setSaving] = useState(false);

  const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

  // Filtragem de agentes por categoria
  const viscosityAgents = useMemo(() => {
    return agents.filter((a) => (a.category || 'VISCOSIDADE').toUpperCase() !== 'PH');
  }, [agents]);

  const phAgents = useMemo(() => {
    return agents.filter((a) => (a.category || '').toUpperCase() === 'PH' || (a.category || '').toUpperCase() === 'OUTROS');
  }, [agents]);

  // Busca do lote do ERP
  const handleBatchChange = async (val: string) => {
    setFormBatch(val);
    setFormLoteProducts([]);
    setFormLoteHint(null);
    if (val.trim().length < 3) {
      setFormProductCode('');
      setFormProductName('');
      return;
    }
    setFormBatchLoading(true);
    try {
      const lote = await api.getLoteByNumber(val);
      if (lote?.products?.length) {
        setFormLoteProducts(lote.products);
        if (lote.products.length === 1) {
          applyLoteProduct(lote.products[0]);
        } else {
          setFormProductCode('__ALL__');
          setFormProductName(
            lote.products.map((p) => loteProductLabel(p)).join(' · ')
          );
          setFormLoteHint(
            `Lote com ${lote.products.length} apresentações registradas.`
          );
        }
        const totalQty = lote.products.reduce((s, p) => s + p.quantity, 0);
        if (totalQty > 0) {
          setAdjBatchSize(totalQty.toString());
          setAdjPhBatchSize(totalQty.toString());
        }
        if (lote.status && lote.status !== 'EA') {
          setFormLoteHint(
            (prev) =>
              `${prev ? prev + ' ' : ''}(Status: ${lote.statusLabel || lote.status})`
          );
        }
      } else {
        setFormProductCode('');
        setFormProductName('');
        setFormLoteHint(`Lote "${val.trim()}" não encontrado. Confira o número ou execute o Sync ERP.`);
      }
    } catch (err) {
      console.error('Erro na busca do lote:', err);
      setFormProductCode('');
      setFormProductName('');
      setFormLoteHint(loteLookupErrorMessage(err, val.trim()));
    } finally {
      setFormBatchLoading(false);
    }
  };

  const applyLoteProduct = (p: LoteProductLine) => {
    setFormProductCode(p.productCode);
    setFormProductName(p.productDescription);
    if (p.quantity > 0) {
      setAdjBatchSize(p.quantity.toString());
      setAdjPhBatchSize(p.quantity.toString());
    }
  };

  const handleLoteProductSelect = (code: string) => {
    if (code === '__ALL__') {
      setFormProductCode('__ALL__');
      setFormProductName(
        formLoteProducts.map((p) => loteProductLabel(p)).join(' · ')
      );
      const totalQty = formLoteProducts.reduce((s, p) => s + p.quantity, 0);
      if (totalQty > 0) {
        setAdjBatchSize(totalQty.toString());
        setAdjPhBatchSize(totalQty.toString());
      }
      return;
    }
    const p = formLoteProducts.find((x) => x.productCode === code);
    if (p) applyLoteProduct(p);
  };

  // Padrão de especificação do produto ativo
  const activePattern = useMemo(() => {
    if (!formProductCode || formProductCode === '__ALL__') {
      if (formLoteProducts.length > 0) {
        const first = formLoteProducts[0];
        return patterns.find((p) => normalizeCode(p.productCode) === normalizeCode(first.productCode)) || null;
      }
      return null;
    }
    const norm = normalizeCode(formProductCode);
    return patterns.find((p) => normalizeCode(p.productCode) === norm) || null;
  }, [formProductCode, patterns, formLoteProducts]);

  // Cálculos em tempo real
  const calculatedDensity = useMemo(() => {
    const val = parseFloat(formFractionWeight.toString().replace(',', '.'));
    return calculateDensity(val);
  }, [formFractionWeight]);

  const fillingTargets = useMemo(() => {
    return calculateFillingTargets(activePattern, calculatedDensity);
  }, [activePattern, calculatedDensity]);

  const compliance = useMemo(() => {
    const phNum = parseFloat(formPh.toString().replace(',', '.'));
    const viscNum = parseFloat(formViscosity.toString().replace(',', '.'));
    return checkAnalysisCompliance(
      {
        phMeasured: isNaN(phNum) ? 0 : phNum,
        viscosityMeasured: isNaN(viscNum) ? 0 : viscNum,
        densityMeasured: calculatedDensity,
        hasAdjustment: hasAdjustment || hasPhAdjustment,
        aspectOk,
        colorOdorOk,
      },
      activePattern
    );
  }, [formPh, formViscosity, calculatedDensity, hasAdjustment, hasPhAdjustment, aspectOk, colorOdorOk, activePattern]);

  // Etapas de adição de viscosidade
  const handleAddStep = () => {
    const nextNum = additionSteps.length + 1;
    const lastCum = additionSteps.length > 0 ? additionSteps[additionSteps.length - 1].cumulativeGrams : 0;
    setAdditionSteps([
      ...additionSteps,
      {
        id: randomId(),
        stepNumber: nextNum,
        addedGrams: 0.5,
        cumulativeGrams: lastCum + 0.5,
        measuredViscosity: null,
        notes: ''
      }
    ]);
  };

  const handleRemoveStep = (index: number) => {
    if (additionSteps.length <= 1) return;
    const next = additionSteps.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepNumber: i + 1 }));
    setAdditionSteps(next);
  };

  const handleStepChange = (index: number, field: keyof ViscosityAdditionStep, value: any) => {
    const next = [...additionSteps];
    next[index] = { ...next[index], [field]: value };

    if (field === 'addedGrams') {
      let cum = 0;
      for (let i = 0; i < next.length; i++) {
        cum += Number(next[i].addedGrams) || 0;
        next[i].cumulativeGrams = Number(cum.toFixed(3));
      }
    }
    setAdditionSteps(next);
  };

  // Cálculo de ajuste de Viscosidade
  const viscosityAdjustmentCalc = useMemo(() => {
    if (!hasAdjustment || !activePattern) return null;
    const initV = parseFloat(adjInitialVisc.toString().replace(',', '.')) || (parseFloat(formViscosity.toString().replace(',', '.')) || 0);
    const targetV = (activePattern.viscosityMin + activePattern.viscosityMax) / 2;
    const batchS = parseFloat(adjBatchSize.toString().replace(',', '.')) || 0;

    const stepsWithVisc = additionSteps.filter((s) => s.measuredViscosity !== null && s.measuredViscosity !== undefined && Number(s.measuredViscosity) > 0);
    const lastStep = stepsWithVisc[stepsWithVisc.length - 1];

    if (!lastStep || !lastStep.measuredViscosity || lastStep.cumulativeGrams <= 0) {
      return null;
    }

    const trialQ = lastStep.cumulativeGrams;
    const trialV = Number(lastStep.measuredViscosity);

    return calculateViscosityAdjustment(initV, trialQ, trialV, targetV, batchS);
  }, [hasAdjustment, activePattern, adjInitialVisc, formViscosity, additionSteps, adjBatchSize]);

  // Cálculo de ajuste de pH
  const phAdjustmentCalc = useMemo(() => {
    if (!hasPhAdjustment || !activePattern) return null;
    const initPh = parseFloat(adjPhInitial.toString().replace(',', '.')) || (parseFloat(formPh.toString().replace(',', '.')) || 0);
    const targetPh = (activePattern.phMin + activePattern.phMax) / 2;
    const trialQ = parseFloat(adjPhTrialQty.toString().replace(',', '.')) || 0;
    const trialPh = parseFloat(adjPhTrialResult.toString().replace(',', '.')) || 0;
    const batchS = parseFloat(adjPhBatchSize.toString().replace(',', '.')) || (parseFloat(adjBatchSize.toString().replace(',', '.')) || 0);

    if (trialPh <= 0 || trialQ <= 0 || initPh <= 0) return null;

    return calculatePhAdjustment(initPh, trialQ, trialPh, targetPh, batchS);
  }, [hasPhAdjustment, activePattern, adjPhInitial, formPh, adjPhTrialQty, adjPhTrialResult, adjPhBatchSize, adjBatchSize]);

  // Auto preencher valores iniciais quando o operador ativa os ajustes
  useEffect(() => {
    if (formViscosity && hasAdjustment && !adjInitialVisc) {
      setAdjInitialVisc(formViscosity);
    }
  }, [formViscosity, hasAdjustment, adjInitialVisc]);

  useEffect(() => {
    if (formPh && hasPhAdjustment && !adjPhInitial) {
      setAdjPhInitial(formPh);
    }
  }, [formPh, hasPhAdjustment, adjPhInitial]);

  useEffect(() => {
    if (viscosityAdjustmentCalc?.isValid && viscosityAdjustmentCalc.recommendedQtyPerLiter > 0 && !adjFinalQty) {
      setAdjFinalQty(viscosityAdjustmentCalc.recommendedQtyPerLiter.toString());
    }
  }, [viscosityAdjustmentCalc, adjFinalQty]);

  useEffect(() => {
    if (phAdjustmentCalc?.isValid && phAdjustmentCalc.recommendedQtyPerLiter > 0 && !adjPhFinalQty) {
      setAdjPhFinalQty(phAdjustmentCalc.recommendedQtyPerLiter.toString());
    }
  }, [phAdjustmentCalc, adjPhFinalQty]);

  // Formatações ao perder foco
  const handlePhBlur = () => {
    if (!formPh) return;
    let valStr = formPh.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 14) {
        if (valStr.length === 2) valStr = (valNum / 10).toFixed(1);
        else if (valStr.length >= 3) valStr = (valNum / 100).toFixed(2);
      }
    }
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed)) setFormPh(parsed.toString());
  };

  const handleFractionWeightBlur = () => {
    if (!formFractionWeight) return;
    let valStr = formFractionWeight.toString().replace(',', '.').trim();
    if (/^\d+$/.test(valStr)) {
      const valNum = parseInt(valStr, 10);
      if (valNum > 100) {
        if (valStr.length === 3) valStr = (valNum / 10).toFixed(1);
        else if (valStr.length === 4) valStr = (valNum / 100).toFixed(2);
        else if (valStr.length >= 5) valStr = (valNum / 1000).toFixed(3);
      }
    }
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed)) setFormFractionWeight(parsed.toString());
  };

  const handleSaveAnalysis = async (andPrint: boolean = false) => {
    if (!formBatch.trim()) {
      alert('Informe o número do lote.');
      return;
    }
    if (!formProductCode) {
      alert('Selecione ou identifique um produto válido para este lote.');
      return;
    }

    const phClean = formPh.toString().trim().replace(',', '.');
    const viscClean = formViscosity.toString().trim().replace(',', '.');
    const fracClean = formFractionWeight.toString().trim().replace(',', '.');

    if (phClean === '' || viscClean === '' || fracClean === '') {
      alert('Preencha os valores medidos de pH, Viscosidade e Peso da fração do picnômetro.');
      return;
    }

    const phNum = parseFloat(phClean);
    const viscNum = parseFloat(viscClean);
    const fracNum = parseFloat(fracClean);

    if (isNaN(phNum) || isNaN(viscNum) || isNaN(fracNum)) {
      alert('Os valores inseridos devem ser numéricos.');
      return;
    }

    const adjInitialViscNum = hasAdjustment ? parseFloat(adjInitialVisc.toString().replace(',', '.')) : null;
    const lastStep = additionSteps[additionSteps.length - 1];
    const adjTrialQtyNum = hasAdjustment && lastStep ? lastStep.cumulativeGrams : null;
    const adjTrialViscNum = hasAdjustment && lastStep && lastStep.measuredViscosity ? lastStep.measuredViscosity : null;
    const adjFinalQtyNum = hasAdjustment ? parseFloat(adjFinalQty.toString().replace(',', '.')) : null;
    const adjBatchSizeNum = hasAdjustment ? parseFloat(adjBatchSize.toString().replace(',', '.')) : null;

    // Enriquecer notas com dados de correção de pH e aspectos se houver
    let fullNotes = formNotes.trim();
    if (hasPhAdjustment) {
      const phAgName = agents.find((a) => a.id === adjPhAgentId)?.name || adjPhAgentId || 'Corretivo pH';
      const phNote = `[Ajuste de pH: ${phAgName} | Dose: ${adjPhFinalQty || adjPhTrialQty} g/L | pH Final: ${adjPhTrialResult || formPh}]`;
      fullNotes = fullNotes ? `${fullNotes} ${phNote}` : phNote;
    }
    if (!aspectOk) {
      const aspNote = `[Aspecto Não Conforme: ${aspectDesc}]`;
      fullNotes = fullNotes ? `${fullNotes} ${aspNote}` : aspNote;
    }
    if (!colorOdorOk) {
      const odNote = `[Cor/Odor Não Conforme: ${colorOdorDesc}]`;
      fullNotes = fullNotes ? `${fullNotes} ${odNote}` : odNote;
    }

    const analyzeAll = formProductCode === '__ALL__' && formLoteProducts.length > 1;
    const targets = analyzeAll
      ? formLoteProducts.map((p) => ({ code: p.productCode, name: p.productDescription, qty: p.quantity }))
      : [
          {
            code: formProductCode,
            name: formProductName || products.find((p) => p.code === formProductCode)?.name || formProductCode,
            qty: adjBatchSizeNum || 0,
          },
        ];

    setSaving(true);
    const createdAnalyses: FiscoQuimicaAnalysis[] = [];

    try {
      for (const t of targets) {
        const payload: FiscoQuimicaAnalysis = {
          id: randomId(),
          productCode: t.code,
          productName: t.name,
          batch: formBatch.trim(),
          analysisDate: formDate,
          technician: technicianName.trim() || 'Técnico Responsável',
          phMeasured: phNum,
          viscosityMeasured: viscNum,
          densityMeasured: calculatedDensity,
          fractionWeight: fracNum,
          envaseTargetWeight: fillingTargets.weight.value,
          envaseTargetUnit: fillingTargets.weight.unit,
          hasAdjustment: hasAdjustment || hasPhAdjustment,
          correctiveAgentId: hasAdjustment ? (adjAgentId || null) : (hasPhAdjustment ? adjPhAgentId || null : null),
          initialViscosity: hasAdjustment ? adjInitialViscNum : null,
          trialAgentQty: hasAdjustment ? adjTrialQtyNum : null,
          trialViscosity: hasAdjustment ? adjTrialViscNum : null,
          agentQtyPerLiter: hasAdjustment ? adjFinalQtyNum : (hasPhAdjustment && adjPhFinalQty ? parseFloat(adjPhFinalQty.replace(',', '.')) : null),
          batchSize: hasAdjustment ? (analyzeAll && t.qty > 0 ? t.qty : adjBatchSizeNum || null) : null,
          totalAgentRequired:
            hasAdjustment && adjFinalQtyNum && (analyzeAll ? t.qty : adjBatchSizeNum)
              ? Number((adjFinalQtyNum * ((analyzeAll ? t.qty : adjBatchSizeNum!) - 1)).toFixed(2))
              : null,
          notes: fullNotes || null,
        };

        await api.saveFiscoQuimicaAnalysis(payload);
        createdAnalyses.push(payload);
      }

      if (andPrint && createdAnalyses.length > 0) {
        printFiscoReports(createdAnalyses, patterns, products, agents, config);
      }

      // Reset form
      setFormBatch('');
      setFormProductCode('');
      setFormProductName('');
      setFormLoteProducts([]);
      setFormLoteHint(null);
      setFormPh('');
      setFormViscosity('');
      setFormFractionWeight('');
      setFormNotes('');
      setAspectOk(true);
      setColorOdorOk(true);
      setHasAdjustment(false);
      setHasPhAdjustment(false);
      setAdjAgentId('');
      setAdjInitialVisc('');
      setAdditionSteps([
        { id: '1', stepNumber: 1, addedGrams: 1, cumulativeGrams: 1, measuredViscosity: null, notes: '' }
      ]);
      setAdjFinalQty('');
      setAdjBatchSize('');
      setAdjPhAgentId('');
      setAdjPhInitial('');
      setAdjPhTrialResult('');
      setAdjPhFinalQty('');

      onSaved();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar registro de análise físico-química.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-10 animate-in fade-in duration-150">
      
      {/* 1. Identificação da Produção (Mobile Friendly) */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-zinc-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <Info className="w-4 h-4 text-zinc-400" /> 1. Identificação da Produção
          </span>

          {activePattern ? (
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Padrão Ativo
            </span>
          ) : formProductCode && formProductCode !== '__ALL__' ? (
            <button
              type="button"
              onClick={() => onOpenAddPattern(formProductCode, formProductName)}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-amber-700" /> Definir Padrão
            </button>
          ) : null}
        </div>

        {formLoteHint && (
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-zinc-500 shrink-0" />
            <span>{formLoteHint}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Lote de Produção *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="Ex: 10452"
                value={formBatch}
                onChange={(e) => handleBatchChange(e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm font-bold text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {formBatchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Código do Produto
            </label>
            <div className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm font-mono font-bold text-zinc-700 bg-zinc-50 min-h-[38px] flex items-center">
              {formProductCode === '__ALL__' ? 'LOTE COMPLETO' : formProductCode || '—'}
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              {formLoteProducts.length > 1 ? 'Escopo / Apresentação' : 'Produto Acabado'}
            </label>
            {formLoteProducts.length > 1 ? (
              <select
                value={formProductCode}
                onChange={(e) => handleLoteProductSelect(e.target.value)}
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="__ALL__">Lote completo ({formLoteProducts.length} apresentações)</option>
                {formLoteProducts.map((p) => (
                  <option key={p.productCode} value={p.productCode}>
                    Apenas: {loteProductLabel(p)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm text-zinc-800 bg-zinc-50 min-h-[38px] flex items-center truncate">
                {formProductName || (formBatch.trim().length >= 3 && !formProductCode ? 'Produto não localizado' : 'Aguardando Lote...')}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Data da Análise *
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-xl text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>

          <div className="space-y-1 sm:col-span-2 md:col-span-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Técnico Analista *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                required
                placeholder="Nome do analista"
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Parâmetros Físico-Químicos e Organolépticos */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-zinc-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <FlaskConical className="w-4 h-4 text-zinc-400" /> 2. Parâmetros Físico-Químicos
          </span>
          {activePattern && (
            <span className="text-[10px] font-mono text-zinc-400">
              Picnômetro: {DENSITY_CUP_VOLUME} mL
            </span>
          )}
        </div>

        {/* Avaliação Organoléptica (Aspecto / Odor) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-zinc-50/70 border border-zinc-200 rounded-2xl">
          {/* Aspecto */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Aspecto Visual</span>
              <button
                type="button"
                onClick={() => setAspectOk(!aspectOk)}
                className={cn(
                  "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border",
                  aspectOk
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                )}
              >
                {aspectOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {aspectOk ? 'Conforme' : 'Não Conforme'}
              </button>
            </div>
            <input
              type="text"
              value={aspectDesc}
              onChange={(e) => setAspectDesc(e.target.value)}
              placeholder="Ex: Líquido homogêneo, Emulsão..."
              className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          {/* Cor e Odor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cor e Odor</span>
              <button
                type="button"
                onClick={() => setColorOdorOk(!colorOdorOk)}
                className={cn(
                  "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border",
                  colorOdorOk
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                )}
              >
                {colorOdorOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {colorOdorOk ? 'Conforme' : 'Não Conforme'}
              </button>
            </div>
            <input
              type="text"
              value={colorOdorDesc}
              onChange={(e) => setColorOdorDesc(e.target.value)}
              placeholder="Ex: Característico, Branco perolado..."
              className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </div>

        {/* Cards de pH, Viscosidade e Densidade */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card pH */}
          <div className={cn(
            "p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-2.5",
            formPh !== '' && activePattern
              ? (compliance.phOk ? "bg-emerald-50/40 border-emerald-200" : "bg-rose-50/40 border-rose-200")
              : "bg-zinc-50/50 border-zinc-200"
          )}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">pH (25°C)</span>
              {activePattern && formPh !== '' && (
                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full font-black tracking-wide border",
                  compliance.phOk
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                )}>
                  {compliance.phOk ? 'DENTRO' : 'FORA'}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 6.20"
                value={formPh}
                onChange={(e) => setFormPh(e.target.value.replace(',', '.'))}
                onBlur={handlePhBlur}
                className="w-full text-xl sm:text-2xl font-black border border-zinc-300 rounded-xl px-3 py-1.5 text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="text-[10px] text-zinc-500">
              {activePattern ? (
                <>Alvo: <strong className="text-zinc-800">{activePattern.phMin.toFixed(2)} – {activePattern.phMax.toFixed(2)}</strong></>
              ) : (
                <span className="text-zinc-400 italic">Padrão não definido</span>
              )}
            </div>
          </div>

          {/* Card Viscosidade */}
          <div className={cn(
            "p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-2.5",
            formViscosity !== '' && activePattern
              ? (compliance.viscOk ? "bg-emerald-50/40 border-emerald-200" : "bg-rose-50/40 border-rose-200")
              : "bg-zinc-50/50 border-zinc-200"
          )}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Viscosidade (cps)</span>
              {activePattern && formViscosity !== '' && (
                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full font-black tracking-wide border",
                  compliance.viscOk
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                )}>
                  {compliance.viscOk ? 'DENTRO' : 'FORA'}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ex: 9500"
                value={formViscosity}
                onChange={(e) => setFormViscosity(e.target.value.replace(',', '.'))}
                className="w-full text-xl sm:text-2xl font-black border border-zinc-300 rounded-xl px-3 py-1.5 text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            <div className="text-[10px] text-zinc-500 truncate">
              {activePattern ? (
                <>Alvo: <strong className="text-zinc-800">{activePattern.viscosityMin.toLocaleString('pt-BR')} – {activePattern.viscosityMax.toLocaleString('pt-BR')}</strong></>
              ) : (
                <span className="text-zinc-400 italic">Padrão não definido</span>
              )}
            </div>
          </div>

          {/* Card Densidade */}
          <div className={cn(
            "p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-2.5",
            calculatedDensity > 0 && activePattern
              ? (compliance.densityOk ? "bg-emerald-50/40 border-emerald-200" : "bg-rose-50/40 border-rose-200")
              : "bg-zinc-50/50 border-zinc-200"
          )}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Densidade (g/mL)</span>
              {activePattern && calculatedDensity > 0 && (
                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full font-black tracking-wide border",
                  compliance.densityOk
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                )}>
                  {compliance.densityOk ? 'DENTRO' : 'FORA'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Fração (g)"
                value={formFractionWeight}
                onChange={(e) => setFormFractionWeight(e.target.value.replace(',', '.'))}
                onBlur={handleFractionWeightBlur}
                className="w-1/2 text-sm font-bold border border-zinc-300 rounded-xl px-2.5 py-1.5 text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              <div className="w-1/2 text-right">
                <span className="text-lg sm:text-xl font-black text-zinc-900 block">
                  {calculatedDensity > 0 ? calculatedDensity.toFixed(3) : '—'}
                </span>
              </div>
            </div>

            <div className="text-[10px] text-zinc-500 truncate">
              {activePattern ? (
                <>Alvo: <strong className="text-zinc-800">{activePattern.densityTarget.toFixed(3)} ± {activePattern.densityTolerance.toFixed(3)}</strong></>
              ) : (
                <span className="text-zinc-400 italic">Padrão não definido</span>
              )}
            </div>
          </div>
        </div>

        {/* Banner de Metas de Envase por Densidade */}
        {activePattern && calculatedDensity > 0 && (
          <div className="p-4 rounded-2xl bg-zinc-900 text-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <Calculator className="w-6 h-6 text-zinc-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Calibração de Envase para Produção</p>
                <p className="text-xs text-zinc-300 font-medium">
                  Embalagem: <strong>{activePattern.packageVolume} {activePattern.packageUnit}</strong> · Densidade: <strong>{calculatedDensity.toFixed(3)} g/mL</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-around sm:justify-end gap-6 border-t sm:border-t-0 border-zinc-800 pt-3 sm:pt-0">
              <div>
                <span className="text-[9px] text-zinc-400 font-bold uppercase block">Peso na Balança</span>
                <strong className="text-xl sm:text-2xl font-black text-emerald-400">
                  {fillingTargets.weight.value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} {fillingTargets.weight.unit}
                </strong>
              </div>
              <div className="w-[1px] h-7 bg-zinc-800" />
              <div>
                <span className="text-[9px] text-zinc-400 font-bold uppercase block">Volume Real</span>
                <strong className="text-xl sm:text-2xl font-black text-blue-400">
                  {fillingTargets.volume.value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} {fillingTargets.volume.unit}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Ajustes e Correções de Bancada (Viscosidade e pH) */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-zinc-200 shadow-sm space-y-4">
        
        {/* Toggle Correção de Viscosidade */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasAdjustment}
              onChange={(e) => setHasAdjustment(e.target.checked)}
              className="w-4 h-4 text-zinc-950 focus:ring-zinc-950 accent-zinc-950 rounded cursor-pointer"
            />
            <div>
              <strong className="text-sm font-bold text-zinc-900 block">Correção de Viscosidade (Ensaio em Amostra de 1L)</strong>
              <span className="text-xs text-zinc-500 font-medium">
                Adicione doses graduais na alíquota e calcule o total de espessante/sal necessário para o lote.
              </span>
            </div>
          </label>

          {hasAdjustment && (
            <div className="p-4 sm:p-5 rounded-2xl border border-amber-200 bg-amber-50/40 text-left space-y-4 animate-in fade-in duration-200">
              
              {/* Linha superior */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Agente Corretivo *
                  </label>
                  <select
                    value={adjAgentId}
                    onChange={(e) => setAdjAgentId(e.target.value)}
                    required={hasAdjustment}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 font-bold focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="">Selecione o agente...</option>
                    {viscosityAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Viscosidade Inicial (cps) *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required={hasAdjustment}
                    placeholder="Ex: 6000"
                    value={adjInitialVisc}
                    onChange={(e) => setAdjInitialVisc(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 font-bold focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Tamanho do Lote (L ou kg) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required={hasAdjustment}
                    placeholder="Ex: 1000"
                    value={adjBatchSize}
                    onChange={(e) => setAdjBatchSize(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 font-bold focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>

              {/* Etapas de ensaio em 1L */}
              <div className="space-y-2 border-t border-amber-200/70 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-amber-950 uppercase tracking-wider block">
                    Etapas de Adição na Amostra de 1L:
                  </label>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="flex items-center gap-1 px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Etapa
                  </button>
                </div>

                <div className="space-y-2">
                  {additionSteps.map((step, idx) => (
                    <div
                      key={step.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-amber-200"
                    >
                      <div className="sm:col-span-1 text-center font-bold text-xs text-amber-900">
                        #{step.stepNumber}
                      </div>

                      <div className="sm:col-span-3">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Dose Nesta Etapa (g)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ex: 0.5"
                          value={step.addedGrams}
                          onChange={(e) => handleStepChange(idx, 'addedGrams', e.target.value.replace(',', '.'))}
                          className="w-full border border-zinc-300 rounded-lg px-2 py-1 text-xs font-bold text-zinc-900 bg-white"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Total na Amostra</span>
                        <div className="text-xs font-bold text-zinc-700 bg-zinc-50 border border-zinc-200 px-2 py-1 rounded-lg">
                          {step.cumulativeGrams} g / L
                        </div>
                      </div>

                      <div className="sm:col-span-4">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Viscosidade Medida (cps)</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Medição final"
                          value={step.measuredViscosity || ''}
                          onChange={(e) => handleStepChange(idx, 'measuredViscosity', e.target.value.replace(',', '.'))}
                          className="w-full border border-zinc-300 rounded-lg px-2 py-1 text-xs font-bold text-zinc-900 bg-white"
                        />
                      </div>

                      <div className="sm:col-span-1 text-center">
                        {additionSteps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Remover etapa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Banner de Eficiência */}
              {viscosityAdjustmentCalc?.isValid && activePattern && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 text-blue-950 rounded-xl text-xs space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-700 shrink-0" />
                    Ganho de {viscosityAdjustmentCalc.efficiency} cps/g na alíquota.
                  </p>
                  <p className="text-blue-900">
                    Para atingir o centro do padrão ({((activePattern.viscosityMin + activePattern.viscosityMax) / 2).toLocaleString('pt-BR')} cps), a dose calculada é:
                  </p>
                  <div className="text-xs font-black text-blue-900 bg-blue-100 px-3 py-1 rounded-lg w-fit">
                    Recomendação: {viscosityAdjustmentCalc.recommendedQtyPerLiter} g/L
                  </div>
                </div>
              )}

              {/* Linha Final de Aplicação */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-amber-200/70 pt-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Dose Prática Adotada (g/L ou g/kg) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required={hasAdjustment}
                    placeholder="Ex: 5.5"
                    value={adjFinalQty}
                    onChange={(e) => setAdjFinalQty(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-black bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Total a Pesar para o Reator
                  </label>
                  <div className="text-base font-black text-amber-950 bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-300">
                    {adjFinalQty.trim() !== '' && adjBatchSize.trim() !== ''
                      ? `${((parseFloat(adjFinalQty.replace(',', '.')) * Math.max(0, parseFloat(adjBatchSize.replace(',', '.')) - 1)) / 1000).toFixed(3)} kg`
                      : '—'}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Toggle Correção de pH (Cálculo Automático) */}
        <div className="border-t border-zinc-100 pt-3 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasPhAdjustment}
              onChange={(e) => setHasPhAdjustment(e.target.checked)}
              className="w-4 h-4 text-zinc-950 focus:ring-zinc-950 accent-zinc-950 rounded cursor-pointer"
            />
            <div>
              <strong className="text-sm font-bold text-zinc-900 block">Correção de pH (Ensaio em Amostra de 1L)</strong>
              <span className="text-xs text-zinc-500 font-medium">
                Calcule a dosagem de ácido ou base necessária para alcançar o pH ideal no lote.
              </span>
            </div>
          </label>

          {hasPhAdjustment && (
            <div className="p-4 sm:p-5 rounded-2xl border border-purple-200 bg-purple-50/40 text-left space-y-4 animate-in fade-in duration-200">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Agente de pH *</label>
                  <select
                    value={adjPhAgentId}
                    onChange={(e) => setAdjPhAgentId(e.target.value)}
                    required={hasPhAdjustment}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 font-bold focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="">Selecione o agente...</option>
                    {phAgents.length > 0 ? (
                      phAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.id})
                        </option>
                      ))
                    ) : (
                      agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.id})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">pH Inicial *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 7.80"
                    value={adjPhInitial}
                    onChange={(e) => setAdjPhInitial(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 font-bold focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">Tamanho Lote (L ou kg) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 1000"
                    value={adjPhBatchSize}
                    onChange={(e) => setAdjPhBatchSize(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 font-bold focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
              </div>

              {/* Ensaio de Bancada em 1L */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-purple-200/70 pt-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Dose Teste Adicionada em 1L (g) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 0.5"
                    value={adjPhTrialQty}
                    onChange={(e) => setAdjPhTrialQty(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    pH Medido Após a Dose Teste *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 6.90"
                    value={adjPhTrialResult}
                    onChange={(e) => setAdjPhTrialResult(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs bg-white text-zinc-900 font-bold"
                  />
                </div>
              </div>

              {/* Banner de Resultado de pH */}
              {phAdjustmentCalc?.isValid && activePattern && (
                <div className="p-3.5 bg-purple-100/70 border border-purple-200 text-purple-950 rounded-xl text-xs space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-purple-700 shrink-0" />
                    Variação de {phAdjustmentCalc.efficiency} unidades de pH por grama em 1L.
                  </p>
                  <p className="text-purple-900">
                    Para atingir o pH alvo ({((activePattern.phMin + activePattern.phMax) / 2).toFixed(2)}), a dose calculada é:
                  </p>
                  <div className="text-xs font-black text-purple-950 bg-white px-3 py-1 rounded-lg w-fit border border-purple-300">
                    Recomendação: {phAdjustmentCalc.recommendedQtyPerLiter} g/L
                  </div>
                </div>
              )}

              {/* Linha Final de Aplicação de pH */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-purple-200/70 pt-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Dose Prática Adotada (g/L ou g/kg) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 1.0"
                    value={adjPhFinalQty}
                    onChange={(e) => setAdjPhFinalQty(e.target.value.replace(',', '.'))}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-black bg-white text-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider block">
                    Total a Pesar de Agente de pH
                  </label>
                  <div className="text-base font-black text-purple-950 bg-purple-100 px-3 py-1.5 rounded-xl border border-purple-300">
                    {adjPhFinalQty.trim() !== '' && (adjPhBatchSize.trim() !== '' || adjBatchSize.trim() !== '')
                      ? `${((parseFloat(adjPhFinalQty.replace(',', '.')) * Math.max(0, parseFloat((adjPhBatchSize || adjBatchSize).replace(',', '.')) - 1)) / 1000).toFixed(3)} kg`
                      : '—'}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>

      {/* 4. Observações e Ações */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-zinc-200 shadow-sm space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            3. Observações Técnicas / Parecer do Laboratório
          </label>
          <textarea
            placeholder="Anote detalhes de liberação, alterações ou observações de bancada..."
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            rows={2}
            className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSaveAnalysis(false)}
            className="w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Salvar Registro
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSaveAnalysis(true)}
            className="w-full flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white py-3 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Salvar e Imprimir Laudo
          </button>
        </div>
      </div>

    </div>
  );
}
