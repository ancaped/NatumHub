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
  Sliders,
  Image as ImageIcon,
  Upload,
  Eye,
  Video,
  Film
} from 'lucide-react';
import Modal from '../../../geral/components/ui/Modal';
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
  printCorrectiveOrder,
  ViscosityAdditionStep,
  OrganolepticEvaluation,
  parseInputNumber,
  formatViscosity
} from '../lib/fiscoUtils';

interface AnalysisCreationFlowProps {
  products: Product[];
  patterns: FiscoQuimicaPattern[];
  agents: FiscoQuimicaAgent[];
  analyses?: FiscoQuimicaAnalysis[];
  technicianName: string;
  setTechnicianName: (val: string) => void;
  config?: FiscoTemplateConfig;
  onSaved: () => void;
  onOpenAddPattern: (productCode: string, productName: string) => void;
  initialBatch?: string;
  initialProductCode?: string;
  editingAnalysis?: FiscoQuimicaAnalysis | null;
  onCancelEdit?: () => void;
}

export function AnalysisCreationFlow({
  products,
  patterns,
  agents,
  analyses,
  technicianName,
  setTechnicianName,
  config,
  onSaved,
  onOpenAddPattern,
  initialBatch,
  initialProductCode,
  editingAnalysis,
  onCancelEdit,
}: AnalysisCreationFlowProps) {
  // Lote / Identificação
  const [formBatch, setFormBatch] = useState(initialBatch || '');
  const [formBatchLoading, setFormBatchLoading] = useState(false);
  const [formProductCode, setFormProductCode] = useState(initialProductCode || '');
  const [formProductName, setFormProductName] = useState('');
  const [formLoteProducts, setFormLoteProducts] = useState<LoteProductLine[]>([]);
  const [formLoteDate, setFormLoteDate] = useState<string>('');
  const [formLoteHint, setFormLoteHint] = useState<string | null>(null);
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formFabricatedBy, setFormFabricatedBy] = useState(() => config?.defaultFabricatedBy || '');
  const [formAuthorizedBy, setFormAuthorizedBy] = useState(() => config?.defaultAuthorizedBy || '');

  // Recuperar rascunho salvo do localStorage na inicialização se não veio lote por prop
  useEffect(() => {
    if (!initialBatch && !initialProductCode) {
      try {
        const raw = localStorage.getItem('natum_hub_fq_draft');
        if (raw) {
          const d = JSON.parse(raw);
          if (d.formBatch) setFormBatch(d.formBatch);
          if (d.formProductCode) setFormProductCode(d.formProductCode);
          if (d.formProductName) setFormProductName(d.formProductName);
          if (d.formLoteProducts) setFormLoteProducts(d.formLoteProducts);
          if (d.formLoteDate) setFormLoteDate(d.formLoteDate);
          if (d.formDate) setFormDate(d.formDate);
          if (d.formFabricatedBy) setFormFabricatedBy(d.formFabricatedBy);
          if (d.formAuthorizedBy) setFormAuthorizedBy(d.formAuthorizedBy);
          if (d.formPh) setFormPh(d.formPh);
          if (d.formViscosity) setFormViscosity(d.formViscosity);
          if (d.formFractionWeight) setFormFractionWeight(d.formFractionWeight);
          if (d.formDensityDirect) {
            setFormDensityDirect(d.formDensityDirect);
          } else if (d.formFractionWeight) {
            const num = parseFloat(d.formFractionWeight);
            if (!isNaN(num) && num > 0) setFormDensityDirect((num / DENSITY_CUP_VOLUME).toFixed(3));
          }
          if (d.formNotes) setFormNotes(d.formNotes);
          if (d.aspectOk !== undefined) setAspectOk(d.aspectOk);
          if (d.aspectDesc !== undefined) setAspectDesc(d.aspectDesc);
          if (d.colorOk !== undefined) setColorOk(d.colorOk);
          if (d.colorDesc !== undefined) setColorDesc(d.colorDesc);
          if (d.odorOk !== undefined) setOdorOk(d.odorOk);
          if (d.odorDesc !== undefined) setOdorDesc(d.odorDesc);
          if (d.hasAdjustment !== undefined) setHasAdjustment(d.hasAdjustment);
          if (d.adjAgentId) setAdjAgentId(d.adjAgentId);
          if (d.adjInitialVisc) setAdjInitialVisc(d.adjInitialVisc);
          if (d.additionSteps && d.additionSteps.length > 0) setAdditionSteps(d.additionSteps);
          if (d.adjFinalQty) setAdjFinalQty(d.adjFinalQty);
          if (d.adjBatchSize) setAdjBatchSize(d.adjBatchSize);
          if (d.hasPhAdjustment !== undefined) setHasPhAdjustment(d.hasPhAdjustment);
          if (d.adjPhAgentId) setAdjPhAgentId(d.adjPhAgentId);
          if (d.adjPhInitial) setAdjPhInitial(d.adjPhInitial);
          if (d.adjPhTrialQty) setAdjPhTrialQty(d.adjPhTrialQty);
          if (d.adjPhTrialResult) setAdjPhTrialResult(d.adjPhTrialResult);
          if (d.adjPhFinalQty) setAdjPhFinalQty(d.adjPhFinalQty);
          if (d.adjPhBatchSize) setAdjPhBatchSize(d.adjPhBatchSize);
        }
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (initialBatch && initialBatch.trim().length >= 1) {
      handleBatchChange(initialBatch.trim());
    }
  }, [initialBatch]);

  useEffect(() => {
    if (editingAnalysis) {
      setFormBatch(editingAnalysis.batch);
      setFormProductCode(editingAnalysis.productCode);
      setFormProductName(editingAnalysis.productName);
      setFormDate(editingAnalysis.analysisDate || new Date().toISOString().split('T')[0]);
      if (editingAnalysis.fabricatedBy) setFormFabricatedBy(editingAnalysis.fabricatedBy);
      if (editingAnalysis.authorizedBy) setFormAuthorizedBy(editingAnalysis.authorizedBy);
      
      if (editingAnalysis.status !== 'EM_CORRECAO') {
        if (editingAnalysis.phMeasured > 0) setFormPh(editingAnalysis.phMeasured.toString());
        if (editingAnalysis.viscosityMeasured > 0) setFormViscosity(editingAnalysis.viscosityMeasured.toString());
        if (editingAnalysis.fractionWeight > 0) {
          setFormFractionWeight(editingAnalysis.fractionWeight.toString());
          setFormDensityDirect((editingAnalysis.fractionWeight / DENSITY_CUP_VOLUME).toFixed(3));
        } else if (editingAnalysis.densityMeasured > 0) {
          setFormDensityDirect(editingAnalysis.densityMeasured.toFixed(3));
          setFormFractionWeight((editingAnalysis.densityMeasured * DENSITY_CUP_VOLUME).toFixed(3));
        }
      } else {
        setFormPh('');
        setFormViscosity('');
        setFormFractionWeight('');
        setFormDensityDirect('');
      }

      if (editingAnalysis.mediaUrl) setFormMediaUrl(editingAnalysis.mediaUrl);
      else setFormMediaUrl('');
      if (editingAnalysis.notes) setFormNotes(editingAnalysis.notes);

      if (editingAnalysis.aspectOk !== undefined && editingAnalysis.aspectOk !== null) setAspectOk(editingAnalysis.aspectOk);
      if (editingAnalysis.aspectResult) setAspectDesc(editingAnalysis.aspectResult);
      if (editingAnalysis.colorOk !== undefined && editingAnalysis.colorOk !== null) setColorOk(editingAnalysis.colorOk);
      if (editingAnalysis.colorResult) setColorDesc(editingAnalysis.colorResult);
      if (editingAnalysis.odorOk !== undefined && editingAnalysis.odorOk !== null) setOdorOk(editingAnalysis.odorOk);
      if (editingAnalysis.odorResult) setOdorDesc(editingAnalysis.odorResult);

      setHasAdjustment(Boolean(editingAnalysis.hasAdjustment));
      if (editingAnalysis.correctiveAgentId) setAdjAgentId(editingAnalysis.correctiveAgentId);
      if (editingAnalysis.initialViscosity) setAdjInitialVisc(editingAnalysis.initialViscosity.toString());
      if (editingAnalysis.trialAgentQty) {
        setAdditionSteps([
          {
            id: '1',
            stepNumber: 1,
            addedGrams: editingAnalysis.trialAgentQty,
            cumulativeGrams: editingAnalysis.trialAgentQty,
            measuredViscosity: editingAnalysis.trialViscosity || null,
            notes: ''
          }
        ]);
      }
      if (editingAnalysis.agentQtyPerLiter) setAdjFinalQty(editingAnalysis.agentQtyPerLiter.toString());
      if (editingAnalysis.batchSize) setAdjBatchSize(editingAnalysis.batchSize.toString());
    }
  }, [editingAnalysis]);

  // Medições Físico-Químicas
  const [formPh, setFormPh] = useState<string>('');
  const [formViscosity, setFormViscosity] = useState<string>('');
  const [formFractionWeight, setFormFractionWeight] = useState<string>('');
  const [formDensityDirect, setFormDensityDirect] = useState<string>('');
  const [formNotes, setFormNotes] = useState('');

  // Mídia Anexada à Análise (Foto ou Vídeo da amostra do lote)
  const [formMediaUrl, setFormMediaUrl] = useState<string>('');
  const [zoomMedia, setZoomMedia] = useState<{ url: string; title: string; isVideo?: boolean } | null>(null);
  const [zoomPatternImage, setZoomPatternImage] = useState<{ url: string; title: string } | null>(null);
  const mediaInputRef = React.useRef<HTMLInputElement>(null);

  // Avaliações Organolépticas (Aspecto / Cor / Odor)
  const [aspectOk, setAspectOk] = useState(true);
  const [aspectDesc, setAspectDesc] = useState('');
  const [colorOk, setColorOk] = useState(true);
  const [colorDesc, setColorDesc] = useState('');
  const [odorOk, setOdorOk] = useState(true);
  const [odorDesc, setOdorDesc] = useState('');

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

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setFormMediaUrl(dataUrl);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormMediaUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Sincronizar rascunho no localStorage automaticamente
  useEffect(() => {
    const draftData = {
      formBatch,
      formProductCode,
      formProductName,
      formLoteProducts,
      formLoteDate,
      formDate,
      formFabricatedBy,
      formAuthorizedBy,
      formPh,
      formViscosity,
      formFractionWeight,
      formDensityDirect,
      formNotes,
      formMediaUrl,
      aspectOk,
      aspectDesc,
      colorOk,
      colorDesc,
      odorOk,
      odorDesc,
      hasAdjustment,
      adjAgentId,
      adjInitialVisc,
      additionSteps,
      adjFinalQty,
      adjBatchSize,
      hasPhAdjustment,
      adjPhAgentId,
      adjPhInitial,
      adjPhTrialQty,
      adjPhTrialResult,
      adjPhFinalQty,
      adjPhBatchSize
    };
    try {
      localStorage.setItem('natum_hub_fq_draft', JSON.stringify(draftData));
    } catch (_) {}
  }, [
    formBatch,
    formProductCode,
    formProductName,
    formLoteProducts,
    formLoteDate,
    formDate,
    formFabricatedBy,
    formAuthorizedBy,
    formPh,
    formViscosity,
    formFractionWeight,
    formDensityDirect,
    formNotes,
    formMediaUrl,
    aspectOk,
    aspectDesc,
    colorOk,
    colorDesc,
    odorOk,
    odorDesc,
    hasAdjustment,
    adjAgentId,
    adjInitialVisc,
    additionSteps,
    adjFinalQty,
    adjBatchSize,
    hasPhAdjustment,
    adjPhAgentId,
    adjPhInitial,
    adjPhTrialQty,
    adjPhTrialResult,
    adjPhFinalQty,
    adjPhBatchSize
  ]);

  const handleClearDraft = () => {
    if (!confirm('Deseja limpar todos os campos preenchidos e iniciar um novo laudo?')) return;
    try {
      localStorage.removeItem('natum_hub_fq_draft');
    } catch (_) {}
    setFormBatch('');
    setFormProductCode('');
    setFormProductName('');
    setFormLoteProducts([]);
    setFormLoteDate('');
    setFormLoteHint(null);
    setFormPh('');
    setFormViscosity('');
    setFormFractionWeight('');
    setFormDensityDirect('');
    setFormNotes('');
    setFormMediaUrl('');
    setFormFabricatedBy(config?.defaultFabricatedBy || '');
    setFormAuthorizedBy(config?.defaultAuthorizedBy || '');
    setAspectOk(true);
    setAspectDesc('');
    setColorOk(true);
    setColorDesc('');
    setOdorOk(true);
    setOdorDesc('');
    setHasAdjustment(false);
    setHasPhAdjustment(false);
    setAdditionSteps([
      { id: '1', stepNumber: 1, addedGrams: 1, cumulativeGrams: 1, measuredViscosity: null, notes: '' }
    ]);
  };

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
    setFormLoteDate('');
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
        setFormLoteDate(lote.date || lote.dLote || lote.dPesado || lote.dEnvase || '');
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
        if (lote.fabricatedBy && !formFabricatedBy) {
          setFormFabricatedBy(lote.fabricatedBy);
        }
        if (lote.authorizedBy && !formAuthorizedBy) {
          setFormAuthorizedBy(lote.authorizedBy);
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
        setFormLoteDate('');
        setFormLoteHint(`Lote "${val.trim()}" não encontrado. Confira o número ou execute o Sync ERP.`);
      }
    } catch (err) {
      console.error('Erro na busca do lote:', err);
      setFormProductCode('');
      setFormProductName('');
      setFormLoteDate('');
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

  // Verificação de lote duplicado (apenas 1 laudo por lote permitido)
  const existingAnalysisForBatch = useMemo(() => {
    if (!formBatch.trim() || !analyses || analyses.length === 0) return null;
    const target = formBatch.trim().toLowerCase();
    return (
      analyses.find(
        (a) => a.batch.trim().toLowerCase() === target && (!editingAnalysis || editingAnalysis.id !== a.id)
      ) || null
    );
  }, [formBatch, analyses, editingAnalysis]);

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

  // Sincronizar descrição padrão organoléptica com o padrão ativo
  useEffect(() => {
    if (activePattern) {
      if (activePattern.aspect && !aspectDesc) setAspectDesc(activePattern.aspect);
      if (activePattern.color && !colorDesc) setColorDesc(activePattern.color);
      if (activePattern.odor && !odorDesc) setOdorDesc(activePattern.odor);
    }
  }, [activePattern]);

  // Cálculos em tempo real
  const calculatedDensity = useMemo(() => {
    if (formDensityDirect) {
      const d = parseFloat(formDensityDirect.replace(',', '.').trim());
      if (!isNaN(d) && d > 0) return d;
    }
    const val = parseInputNumber(formFractionWeight, false);
    return calculateDensity(val);
  }, [formDensityDirect, formFractionWeight]);

  const fillingTargets = useMemo(() => {
    return calculateFillingTargets(activePattern, calculatedDensity);
  }, [activePattern, calculatedDensity]);

  const compliance = useMemo(() => {
    const phNum = parseInputNumber(formPh, false);
    const viscNum = parseInputNumber(formViscosity, true);
    return checkAnalysisCompliance(
      {
        phMeasured: isNaN(phNum) ? 0 : phNum,
        viscosityMeasured: isNaN(viscNum) ? 0 : viscNum,
        densityMeasured: calculatedDensity,
        hasAdjustment: hasAdjustment || hasPhAdjustment,
        aspectOk,
        colorOk,
        odorOk,
      },
      activePattern
    );
  }, [formPh, formViscosity, calculatedDensity, hasAdjustment, hasPhAdjustment, aspectOk, colorOk, odorOk, activePattern]);

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
    const initV = parseInputNumber(adjInitialVisc, true) || (parseInputNumber(formViscosity, true) || 0);
    const targetV = (activePattern.viscosityMin + activePattern.viscosityMax) / 2;
    const batchS = parseInputNumber(adjBatchSize, false) || 0;

    const stepsWithVisc = additionSteps.filter((s) => s.measuredViscosity !== null && s.measuredViscosity !== undefined && Number(s.measuredViscosity) > 0);
    const lastStep = stepsWithVisc[stepsWithVisc.length - 1];

    if (!lastStep || !lastStep.measuredViscosity || lastStep.cumulativeGrams <= 0) {
      return null;
    }

    const trialQ = lastStep.cumulativeGrams;
    const trialV = parseInputNumber(lastStep.measuredViscosity, true);

    return calculateViscosityAdjustment(initV, trialQ, trialV, targetV, batchS);
  }, [hasAdjustment, activePattern, adjInitialVisc, formViscosity, additionSteps, adjBatchSize]);

  // Cálculo de ajuste de pH
  const phAdjustmentCalc = useMemo(() => {
    if (!hasPhAdjustment || !activePattern) return null;
    const initPh = parseInputNumber(adjPhInitial, false) || (parseInputNumber(formPh, false) || 0);
    const targetPh = (activePattern.phMin + activePattern.phMax) / 2;
    const trialQ = parseInputNumber(adjPhTrialQty, false) || 0;
    const trialPh = parseInputNumber(adjPhTrialResult, false) || 0;
    const batchS = parseInputNumber(adjPhBatchSize, false) || (parseInputNumber(adjBatchSize, false) || 0);

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

  // Manipuladores de Densidade (Fração na Balança e Valor Direto)
  const handleFractionWeightChange = (val: string) => {
    const clean = val.replace(',', '.');
    setFormFractionWeight(clean);
    const num = parseFloat(clean);
    if (!isNaN(num) && num > 0) {
      setFormDensityDirect((num / DENSITY_CUP_VOLUME).toFixed(3));
    } else if (clean === '') {
      setFormDensityDirect('');
    }
  };

  const handleDensityDirectChange = (val: string) => {
    const clean = val.replace(',', '.');
    setFormDensityDirect(clean);
    const num = parseFloat(clean);
    if (!isNaN(num) && num > 0) {
      setFormFractionWeight((num * DENSITY_CUP_VOLUME).toFixed(3));
    } else if (clean === '') {
      setFormFractionWeight('');
    }
  };

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
    if (!isNaN(parsed) && parsed > 0) {
      setFormFractionWeight(parsed.toString());
      setFormDensityDirect((parsed / DENSITY_CUP_VOLUME).toFixed(3));
    }
  };

  const handleDensityDirectBlur = () => {
    if (!formDensityDirect) return;
    let valStr = formDensityDirect.toString().replace(',', '.').trim();
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed) && parsed > 0) {
      setFormDensityDirect(parsed.toFixed(3));
      setFormFractionWeight((parsed * DENSITY_CUP_VOLUME).toFixed(3));
    }
  };

  const handleSaveAnalysis = async (andPrint: boolean = false, isEmCorrecao: boolean = false) => {
    if (!formBatch.trim()) {
      alert('Informe o número do lote.');
      return;
    }
    if (existingAnalysisForBatch) {
      alert(`Não é permitido cadastrar mais de um laudo para o mesmo lote (Lote ${formBatch.trim()}).\n\nEste lote já possui uma análise registrada para "${existingAnalysisForBatch.productName}".\nPara fazer alterações ou correções, localize o lote na aba "Histórico de Laudos" e clique em "Editar".`);
      return;
    }
    if (!formProductCode) {
      alert('Selecione ou identifique um produto válido para este lote.');
      return;
    }

    const phClean = formPh.toString().trim();
    const viscClean = formViscosity.toString().trim();
    const fracClean = formFractionWeight.toString().trim();
    const densClean = formDensityDirect.toString().trim();

    if (!isEmCorrecao && (phClean === '' || viscClean === '' || (fracClean === '' && densClean === ''))) {
      alert('Preencha os valores medidos de pH, Viscosidade e Densidade para finalizar o laudo.');
      return;
    }

    const pattern = patterns.find(p => (p.productCode || '').replace(/\./g, '').toLowerCase() === formProductCode.replace(/\./g, '').toLowerCase()) || null;

    const phNum = phClean !== '' ? parseInputNumber(phClean, false) : (pattern ? (pattern.phMin + pattern.phMax) / 2 : 6.0);
    const viscNum = viscClean !== '' ? parseInputNumber(viscClean, true) : (hasAdjustment && adjInitialVisc ? parseInputNumber(adjInitialVisc, true) : (pattern ? (pattern.viscosityMin + pattern.viscosityMax) / 2 : 10000));
    const fracNum = fracClean !== '' 
      ? parseInputNumber(fracClean, false) 
      : (densClean !== '' ? Number((parseInputNumber(densClean, false) * DENSITY_CUP_VOLUME).toFixed(3)) : 51.645);

    if (isNaN(phNum) || isNaN(viscNum) || isNaN(fracNum)) {
      alert('Os valores inseridos devem ser numéricos.');
      return;
    }

    const adjInitialViscNum = hasAdjustment && adjInitialVisc ? parseInputNumber(adjInitialVisc, true) : null;
    const lastStep = additionSteps[additionSteps.length - 1];
    const adjTrialQtyNum = hasAdjustment && lastStep ? lastStep.cumulativeGrams : null;
    const adjTrialViscNum = hasAdjustment && lastStep && lastStep.measuredViscosity ? parseInputNumber(lastStep.measuredViscosity, true) : null;
    const adjFinalQtyNum = hasAdjustment && adjFinalQty ? parseInputNumber(adjFinalQty, false) : null;
    const adjBatchSizeNum = hasAdjustment && adjBatchSize ? parseInputNumber(adjBatchSize, false) : null;

    // Enriquecer notas com dados de correção de pH e aspectos se houver
    let fullNotes = formNotes.trim();
    if (isEmCorrecao) {
      const corrTag = '[STATUS: EM CORREÇÃO]';
      if (!fullNotes.includes(corrTag)) {
        fullNotes = fullNotes ? `${corrTag} ${fullNotes}` : corrTag;
      }
    }
    if (hasPhAdjustment) {
      const phAgName = agents.find((a) => a.id === adjPhAgentId)?.name || adjPhAgentId || 'Corretivo pH';
      const phNote = `[Ajuste de pH: ${phAgName} | Dose: ${adjPhFinalQty || adjPhTrialQty} g/L | pH Final: ${adjPhTrialResult || formPh}]`;
      fullNotes = fullNotes ? `${fullNotes} ${phNote}` : phNote;
    }
    if (!aspectOk && aspectDesc.trim()) {
      const aspNote = `[Aspecto Não Conforme: ${aspectDesc.trim()}]`;
      fullNotes = fullNotes ? `${fullNotes} ${aspNote}` : aspNote;
    }
    if (!colorOk && colorDesc.trim()) {
      const colNote = `[Cor Não Conforme: ${colorDesc.trim()}]`;
      fullNotes = fullNotes ? `${fullNotes} ${colNote}` : colNote;
    }
    if (!odorOk && odorDesc.trim()) {
      const odNote = `[Odor Não Conforme: ${odorDesc.trim()}]`;
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
        const batchSizeVal = analyzeAll && t.qty > 0 ? t.qty : adjBatchSizeNum || null;
        let totalAgentReq: number | null = null;
        if (hasAdjustment && adjFinalQtyNum && batchSizeVal && batchSizeVal > 0) {
          totalAgentReq = Number(((adjFinalQtyNum * Math.max(0, batchSizeVal - 1)) / 1000).toFixed(3));
        }

        const payload: FiscoQuimicaAnalysis = {
          id: editingAnalysis?.id || randomId(),
          productCode: t.code,
          productName: t.name,
          batch: formBatch.trim(),
          analysisDate: formDate,
          technician: technicianName.trim() || 'Técnico Responsável',
          phMeasured: phNum,
          viscosityMeasured: viscNum,
          densityMeasured: calculatedDensity > 0 ? calculatedDensity : (pattern ? pattern.densityTarget : 1.0),
          fractionWeight: fracNum,
          envaseTargetWeight: fillingTargets.weight.value,
          envaseTargetUnit: fillingTargets.weight.unit,
          hasAdjustment: hasAdjustment || hasPhAdjustment,
          correctiveAgentId: hasAdjustment ? (adjAgentId || null) : (hasPhAdjustment ? adjPhAgentId || null : null),
          initialViscosity: hasAdjustment ? adjInitialViscNum : null,
          trialAgentQty: hasAdjustment ? adjTrialQtyNum : null,
          trialViscosity: hasAdjustment ? adjTrialViscNum : null,
          agentQtyPerLiter: hasAdjustment ? adjFinalQtyNum : (hasPhAdjustment && adjPhFinalQty ? parseFloat(adjPhFinalQty.replace(',', '.')) : null),
          batchSize: batchSizeVal,
          totalAgentRequired: totalAgentReq,
          notes: fullNotes || null,
          fabricatedBy: formFabricatedBy.trim() || config?.defaultFabricatedBy || null,
          authorizedBy: formAuthorizedBy.trim() || config?.defaultAuthorizedBy || null,
          syncedToErp: false,
          status: isEmCorrecao ? 'EM_CORRECAO' : 'CONFORME',
          mediaUrl: formMediaUrl.trim() || undefined,
          aspectOk,
          aspectResult: aspectDesc.trim() || (pattern?.aspect || 'CONFORME'),
          colorOk,
          colorResult: colorDesc.trim() || (pattern?.color || 'CONFORME'),
          odorOk,
          odorResult: odorDesc.trim() || (pattern?.odor || 'CARACTERÍSTICO'),
        };

        await api.saveFiscoQuimicaAnalysis(payload);
        createdAnalyses.push(payload);
      }

      // Enviar medições e dados necessários para o ERP automaticamente
      if (!isEmCorrecao && createdAnalyses.length > 0) {
        try {
          await api.pushFiscoLaudosToErp(createdAnalyses.map(a => a.id));
        } catch (erpErr) {
          console.warn('Sincronização automática com ERP falhou:', erpErr);
        }
      }

      if (isEmCorrecao && createdAnalyses.length > 0) {
        const targetAgent = agents.find(a => a.id === adjAgentId || a.id === adjPhAgentId) || null;
        printCorrectiveOrder(createdAnalyses[0], pattern, targetAgent, config ? { template: config } as any : null);
      } else if (andPrint && createdAnalyses.length > 0) {
        printFiscoReports(createdAnalyses, patterns, products, agents, config);
      }

      // Limpar rascunho após salvar
      try {
        localStorage.removeItem('natum_hub_fq_draft');
      } catch (_) {}

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
      setFormMediaUrl('');
      setAspectOk(true);
      setAspectDesc('');
      setColorOk(true);
      setColorDesc('');
      setOdorOk(true);
      setOdorDesc('');
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
      setAdjPhBatchSize('');

      onSaved();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar registro de análise físico-química.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-150">
      
      {/* Banner de Edição / Conclusão de Lote em Correção */}
      {editingAnalysis && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 font-black shrink-0">
              !
            </div>
            <div>
              <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">
                {editingAnalysis.status === 'EM_CORRECAO' ? 'Concluindo Análise de Lote em Correção' : 'Editando Registro de Laudo'}
              </h4>
              <p className="text-[11px] text-amber-800">
                Lote <strong>{editingAnalysis.batch}</strong> · Produto <strong>{editingAnalysis.productCode}</strong>.
                {editingAnalysis.status === 'EM_CORRECAO' ? ' Insira as medições finais da nova amostra e clique em "Salvar" para aprovar o laudo.' : ''}
              </p>
            </div>
          </div>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-xl text-xs font-bold hover:bg-amber-100 cursor-pointer shadow-sm"
            >
              Cancelar Edição
            </button>
          )}
        </div>
      )}

      {/* 1. Identificação da Produção (Mobile Friendly) */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-zinc-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 flex-wrap gap-2">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <Info className="w-4 h-4 text-zinc-400" /> 1. Identificação da Produção
          </span>

          <div className="flex items-center gap-2">
            {(formBatch || formPh || formViscosity || hasAdjustment || hasPhAdjustment) && (
              <button
                type="button"
                onClick={handleClearDraft}
                className="text-[11px] font-medium text-zinc-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-100 transition-colors cursor-pointer"
                title="Limpar campos preenchidos e reiniciar rascunho"
              >
                <Trash2 size={13} />
                <span>Limpar Rascunho</span>
              </button>
            )}

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
        </div>

        {existingAnalysisForBatch && (
          <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs text-amber-950 flex items-start gap-3 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-amber-900 block font-bold text-[13px]">
                ⚠️ Atenção: Lote {formBatch.trim()} já possui laudo registrado!
              </strong>
              <p className="text-amber-800 leading-relaxed text-xs">
                Não é permitido cadastrar laudos duplicados para o mesmo lote. Já existe uma análise registrada em <strong>{existingAnalysisForBatch.analysisDate}</strong> para o produto <strong>{existingAnalysisForBatch.productName}</strong>. Para alterar medições deste lote, localize-o na aba <strong>"Histórico de Laudos"</strong> e clique em <strong>"Editar"</strong>.
              </p>
            </div>
          </div>
        )}

        {formLoteHint && !existingAnalysisForBatch && (
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
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block flex items-center gap-1">
              <Calendar className="w-3 h-3 text-zinc-400" /> Data do Lote (ERP)
            </label>
            <div className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm font-bold text-zinc-700 bg-zinc-50 min-h-[38px] flex items-center">
              {formLoteDate ? (
                formLoteDate.includes('T') ? formLoteDate.split('T')[0] : formLoteDate
              ) : (
                <span className="text-zinc-400 font-normal italic">Automático via Lote</span>
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

          <div className="space-y-1">
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

          {/* Quem Produziu / Fabricador */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Fabricado Por (Operador)
            </label>
            <input
              type="text"
              placeholder="Ex: RODRIGO DE SOUSA PADILHA"
              value={formFabricatedBy}
              onChange={(e) => setFormFabricatedBy(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          {/* Autorizado Por / Responsável Produção */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Autorizado Por (Responsável)
            </label>
            <input
              type="text"
              placeholder="Ex: RAFAEL MARINHO DE MELO"
              value={formAuthorizedBy}
              onChange={(e) => setFormAuthorizedBy(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-sm font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          {/* Técnico Analista */}
          <div className="space-y-1">
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

      {/* Guia Visual e Padrão de Referência do Produto */}
      {activePattern && (
        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {activePattern.imageUrl ? (
                <button
                  type="button"
                  onClick={() => setZoomPatternImage({ url: activePattern.imageUrl!, title: formProductName || activePattern.productCode })}
                  className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-300 shadow-sm shrink-0 hover:opacity-85 transition-opacity cursor-pointer group relative"
                  title="Clique para ampliar foto de referência"
                >
                  <img src={activePattern.imageUrl} alt="Padrão" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Eye className="w-4 h-4 text-white" />
                  </div>
                </button>
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-white border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-600 shadow-xs">
                  <Sparkles className="w-6 h-6" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider bg-emerald-100 px-2 py-0.5 rounded-md">
                    Especificação Padrão do Produto
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-900">{activePattern.productCode}</span>
                </div>
                <h4 className="text-sm font-bold text-emerald-950 mt-0.5">
                  {formProductName || products.find(p => p.code === activePattern.productCode)?.name || 'Padrão Cadastrado'}
                </h4>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full md:w-auto">
              <div className="bg-white/80 border border-emerald-200/70 rounded-xl px-3 py-1.5 text-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase block">pH Padrão</span>
                <strong className="text-xs font-mono text-zinc-900">{activePattern.phMin.toFixed(2)} – {activePattern.phMax.toFixed(2)}</strong>
              </div>
              <div className="bg-white/80 border border-emerald-200/70 rounded-xl px-3 py-1.5 text-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase block">Viscosidade</span>
                <strong className="text-xs font-mono text-zinc-900">{formatViscosity(activePattern.viscosityMin, activePattern)} – {formatViscosity(activePattern.viscosityMax, activePattern)} cps</strong>
              </div>
              <div className="bg-white/80 border border-emerald-200/70 rounded-xl px-3 py-1.5 text-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase block">Densidade Alvo</span>
                <strong className="text-xs font-mono text-zinc-900">{activePattern.densityTarget.toFixed(3)} ± {activePattern.densityTolerance.toFixed(3)}</strong>
              </div>
              <div className="bg-white/80 border border-emerald-200/70 rounded-xl px-3 py-1.5 text-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase block">Aspecto / Odor</span>
                <strong className="text-[11px] text-zinc-900 truncate block max-w-[120px]" title={`${activePattern.aspect || 'Líquido'} · ${activePattern.color || 'Padrão'}`}>
                  {activePattern.aspect || 'Conforme'}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

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

        {/* Avaliação Organoléptica (Aspecto, Cor e Odor) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-zinc-50/70 border border-zinc-200 rounded-2xl">
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
              placeholder={activePattern?.aspect || "Ex: Creme Homogêneo, Líquido Viscoso..."}
              className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
            {activePattern?.aspect && (
              <span className="text-[9px] text-zinc-400 block truncate">
                Padrão: <strong>{activePattern.aspect}</strong>
              </span>
            )}
          </div>

          {/* Cor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cor</span>
              <button
                type="button"
                onClick={() => setColorOk(!colorOk)}
                className={cn(
                  "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border",
                  colorOk
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                )}
              >
                {colorOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {colorOk ? 'Conforme' : 'Não Conforme'}
              </button>
            </div>
            <input
              type="text"
              value={colorDesc}
              onChange={(e) => setColorDesc(e.target.value)}
              placeholder={activePattern?.color || "Ex: Branco perolado, Amarelo claro..."}
              className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
            {activePattern?.color && (
              <span className="text-[9px] text-zinc-400 block truncate">
                Padrão: <strong>{activePattern.color}</strong>
              </span>
            )}
          </div>

          {/* Odor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Odor</span>
              <button
                type="button"
                onClick={() => setOdorOk(!odorOk)}
                className={cn(
                  "px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border",
                  odorOk
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                )}
              >
                {odorOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {odorOk ? 'Característico' : 'Não Conforme'}
              </button>
            </div>
            <input
              type="text"
              value={odorDesc}
              onChange={(e) => setOdorDesc(e.target.value)}
              placeholder={activePattern?.odor || "Ex: Característico, Suave floral..."}
              className="w-full border border-zinc-300 rounded-xl px-3 py-1.5 text-xs text-zinc-900 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
            {activePattern?.odor && (
              <span className="text-[9px] text-zinc-400 block truncate">
                Padrão: <strong>{activePattern.odor}</strong>
              </span>
            )}
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
                className="w-full text-xl font-black border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 h-11"
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
                className="w-full text-xl font-black border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 h-11"
              />
            </div>

            <div className="text-[10px] text-zinc-500 truncate">
              {activePattern ? (
                <>Alvo: <strong className="text-zinc-800">{formatViscosity(activePattern.viscosityMin, activePattern)} – {formatViscosity(activePattern.viscosityMax, activePattern)}</strong></>
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

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[9px] text-zinc-400 font-bold uppercase block truncate" title="Fração no picnômetro / balança">
                  Fração Balança (g)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 48.50"
                  value={formFractionWeight}
                  onChange={(e) => handleFractionWeightChange(e.target.value)}
                  onBlur={handleFractionWeightBlur}
                  className="w-full text-sm sm:text-base font-black border border-zinc-300 rounded-xl px-2.5 py-1.5 text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 h-10"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[9px] text-zinc-400 font-bold uppercase block truncate" title="Valor final direto da densidade">
                  Valor Final (g/mL)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 0.939"
                  value={formDensityDirect}
                  onChange={(e) => handleDensityDirectChange(e.target.value)}
                  onBlur={handleDensityDirectBlur}
                  className="w-full text-sm sm:text-base font-black border border-zinc-300 rounded-xl px-2.5 py-1.5 text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 h-10"
                />
              </div>
            </div>

            <div className="text-[10px] text-zinc-500 truncate flex items-center justify-between">
              <span>{activePattern ? (
                <>Alvo: <strong className="text-zinc-800">{activePattern.densityTarget.toFixed(3)} ± {activePattern.densityTolerance.toFixed(3)}</strong></>
              ) : (
                <span className="text-zinc-400 italic">Padrão não definido</span>
              )}</span>
              {calculatedDensity > 0 && (
                <span className="text-[10px] font-mono font-bold text-zinc-700">
                  = {calculatedDensity.toFixed(3)} g/mL
                </span>
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
                    Para atingir o centro do padrão ({formatViscosity((activePattern.viscosityMin + activePattern.viscosityMax) / 2, activePattern)} cps), a dose calculada é:
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

      {/* 4. Observações, Mídia e Ações */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-zinc-200 shadow-sm space-y-5">
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

        {/* Anexo de Foto/Vídeo/Mídia da Amostra */}
        <div className="border-t border-zinc-100 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-zinc-400" /> 4. Registro Fotográfico / Mídia da Amostra (Opcional)
            </span>
            {formMediaUrl && (
              <button
                type="button"
                onClick={() => setFormMediaUrl('')}
                className="text-[10px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
              >
                Remover Mídia
              </button>
            )}
          </div>

          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleMediaUpload}
            className="hidden"
          />

          {formMediaUrl ? (
            <div className="flex items-center gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-2xl">
              {formMediaUrl.startsWith('data:video') ? (
                <div className="relative group w-20 h-20 rounded-xl overflow-hidden bg-black flex items-center justify-center shrink-0">
                  <video src={formMediaUrl} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setZoomMedia({ url: formMediaUrl, title: `Amostra Lote ${formBatch}`, isVideo: true })}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center text-white cursor-pointer"
                  >
                    <Video className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="relative group w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 shrink-0">
                  <img src={formMediaUrl} alt="Amostra" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setZoomMedia({ url: formMediaUrl, title: `Amostra Lote ${formBatch}`, isVideo: false })}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <span className="text-xs font-bold text-zinc-900 block">Mídia Anexada ao Laudo</span>
                <p className="text-[11px] text-zinc-500">
                  Foto/vídeo da amostra pronta para ser arquivada no laudo do lote {formBatch || 'atual'}.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    className="px-2.5 py-1 bg-white border border-zinc-300 text-zinc-700 rounded-lg text-[11px] font-bold hover:bg-zinc-50 cursor-pointer shadow-xs"
                  >
                    Trocar Mídia
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="w-full py-4 border-2 border-dashed border-zinc-300 hover:border-zinc-400 bg-zinc-50/50 hover:bg-zinc-50 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-zinc-500 cursor-pointer transition-colors"
            >
              <Upload className="w-5 h-5 text-zinc-400" />
              <span className="text-xs font-bold text-zinc-700">Anexar Foto ou Vídeo da Bancada</span>
              <span className="text-[10px] text-zinc-400">Clique para enviar imagem ou gravação da amostra do lote</span>
            </button>
          )}
        </div>

        <div className={cn(
          "grid gap-3 pt-2",
          (hasAdjustment || hasPhAdjustment) ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
        )}>
          {(hasAdjustment || hasPhAdjustment) && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveAnalysis(false, true)}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 py-3 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
              title="Salva o lote com status 'Em Correção' e emite a Ordem de Ajuste para a Produção"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Salvar Lote em Correção
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSaveAnalysis(false, false)}
            className="w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {editingAnalysis?.status === 'EM_CORRECAO' ? 'Concluir e Salvar Laudo' : 'Salvar Registro'}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSaveAnalysis(true, false)}
            className="w-full flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white py-3 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Salvar e Imprimir Laudo
          </button>
        </div>
      </div>

      {/* Modal de Zoom da Mídia da Amostra */}
      <Modal
        isOpen={!!zoomMedia}
        onClose={() => setZoomMedia(null)}
        title={zoomMedia?.title || 'Mídia da Amostra'}
        subtitle="Registro fotográfico ou audiovisual da bancada"
        size="lg"
      >
        {zoomMedia && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden border border-zinc-200 bg-black flex items-center justify-center max-h-[70vh]">
              {zoomMedia.isVideo ? (
                <video src={zoomMedia.url} controls autoPlay className="max-w-full max-h-[70vh]" />
              ) : (
                <img src={zoomMedia.url} alt={zoomMedia.title} className="max-w-full max-h-[70vh] object-contain" />
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setZoomMedia(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Zoom da Foto de Referência do Padrão */}
      <Modal
        isOpen={!!zoomPatternImage}
        onClose={() => setZoomPatternImage(null)}
        title={zoomPatternImage?.title || 'Foto Padrão'}
        subtitle="Referência física padrão do produto"
        size="md"
      >
        {zoomPatternImage && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden border border-zinc-200 bg-black flex items-center justify-center max-h-[70vh]">
              <img src={zoomPatternImage.url} alt={zoomPatternImage.title} className="max-w-full max-h-[70vh] object-contain" />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setZoomPatternImage(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
