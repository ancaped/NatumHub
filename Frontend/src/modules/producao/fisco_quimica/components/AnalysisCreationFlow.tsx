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
  isAnalysisInCorrection,
  printFiscoReports,
  printCorrectiveOrder,
  ViscosityAdditionStep,
  OrganolepticEvaluation,
  parseInputNumber,
  formatViscosity,
  formatViscometerMethod
} from '../lib/fiscoUtils';

const ASPECT_OPTIONS = ['Creme denso', 'Creme', 'Gel', 'Líquido viscoso', 'Líquido', 'Fluido', 'Pasta'];
const COLOR_OPTIONS = ['Branco', 'Branco perolado', 'Amarelo', 'Bege', 'Rosa', 'Incolor', 'Característica'];
const ODOR_OPTIONS = ['Característico'];
const SPINDLES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
const RPM_OPTIONS = [0.3, 0.6, 1.5, 3, 6, 12, 30];
const TIME_OPTIONS = [30, 60, 120];
const VISCOSITY_PRESETS = [
  { id: 'mascara', label: 'Máscara', spindle: 'L4', rpm: 0.3, seconds: 60 },
  { id: 'creme', label: 'Creme', spindle: 'L4', rpm: 1.5, seconds: 60 },
  { id: 'shampoo', label: 'Shampoo', spindle: 'L3', rpm: 12, seconds: 30 },
  { id: 'gel', label: 'Gel', spindle: 'L4', rpm: 6, seconds: 60 },
  { id: 'fluido', label: 'Fluido', spindle: 'L2', rpm: 30, seconds: 30 },
];

function suggestViscosityPreset(name: string): string {
  const n = name.toLowerCase();
  if (/m[aá]scara|cronograma|reconstru/.test(n)) return 'mascara';
  if (/shampoo|condicionador/.test(n)) return 'shampoo';
  if (/\bgel\b/.test(n)) return 'gel';
  if (/fluido|lo[cç][aã]o|[oó]leo|s[eé]rum/.test(n)) return 'fluido';
  if (/creme/.test(n)) return 'creme';
  return '';
}

function formatHold(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes === 1 ? '1 min' : `${minutes} min`;
  }
  return `${seconds} s`;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatRpm(rpm: number): string {
  return rpm.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function matchingPreset(spindle: string, rpm: number, seconds: number): string {
  return VISCOSITY_PRESETS.find((item) => item.spindle === spindle && item.rpm === rpm && item.seconds === seconds)?.id || '';
}

const ASPECT_METHODS: Record<string, { spindle: string; rpm: number; seconds: number }> = {
  'creme denso': { spindle: 'L4', rpm: 0.3, seconds: 60 },
  'mascara': { spindle: 'L4', rpm: 0.3, seconds: 60 },
  'máscara': { spindle: 'L4', rpm: 0.3, seconds: 60 },
  'creme': { spindle: 'L4', rpm: 1.5, seconds: 60 },
  'gel': { spindle: 'L4', rpm: 6, seconds: 60 },
  'líquido viscoso': { spindle: 'L3', rpm: 12, seconds: 30 },
  'liquido viscoso': { spindle: 'L3', rpm: 12, seconds: 30 },
  'shampoo': { spindle: 'L3', rpm: 12, seconds: 30 },
  'líquido': { spindle: 'L2', rpm: 30, seconds: 30 },
  'liquido': { spindle: 'L2', rpm: 30, seconds: 30 },
  'fluido': { spindle: 'L2', rpm: 30, seconds: 30 },
  'pasta': { spindle: 'L4', rpm: 0.3, seconds: 60 },
};

const ASPECT_METHOD_KEY = 'fq_aspect_methods';

function methodForAspect(name: string): { spindle: string; rpm: number; seconds: number } | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(ASPECT_METHOD_KEY) || '{}') as Record<string, { spindle: string; rpm: number; seconds: number }>;
    if (stored[key]?.spindle) return stored[key];
  } catch { /* ignore */ }
  return ASPECT_METHODS[key] || null;
}

function rememberAspectMethod(name: string, spindle: string, rpm: number, seconds: number) {
  const key = name.trim().toLowerCase();
  if (!key || !spindle) return;
  try {
    const stored = JSON.parse(localStorage.getItem(ASPECT_METHOD_KEY) || '{}') as Record<string, { spindle: string; rpm: number; seconds: number }>;
    stored[key] = { spindle, rpm, seconds };
    localStorage.setItem(ASPECT_METHOD_KEY, JSON.stringify(stored));
  } catch { /* ignore */ }
}

function shortDate(raw?: string | null): string {
  const clean = String(raw || '').split('T')[0].split(' ')[0];
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}/${parts[1]}`;
  return clean;
}

type OptionCatalog = {
  models: string[];
  aspects: string[];
  colors: string[];
  odors: string[];
  spindles: string[];
  rpms: string[];
  times: string[];
};

const CATALOG_KEY = 'fq_option_catalog';

function mergeList(...groups: Array<Array<string | null | undefined> | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const item of group || []) {
      const clean = String(item || '').trim();
      if (!clean || clean.toUpperCase() === 'CONFORME') continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

function loadCatalog(): OptionCatalog {
  const remembered = (() => {
    try { return localStorage.getItem('fq_visc_model') || ''; } catch { return ''; }
  })();
  const base: OptionCatalog = {
    models: remembered ? [remembered] : [],
    aspects: [...ASPECT_OPTIONS],
    colors: [...COLOR_OPTIONS],
    odors: [...ODOR_OPTIONS],
    spindles: [...SPINDLES],
    rpms: RPM_OPTIONS.map((rpm) => String(rpm)),
    times: TIME_OPTIONS.map((seconds) => String(seconds)),
  };
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<OptionCatalog>;
    return {
      models: mergeList(base.models, parsed.models),
      aspects: mergeList(base.aspects, parsed.aspects),
      colors: mergeList(base.colors, parsed.colors),
      odors: mergeList(base.odors, parsed.odors),
      spindles: mergeList(base.spindles, parsed.spindles),
      rpms: mergeList(base.rpms, parsed.rpms),
      times: mergeList(base.times, parsed.times),
    };
  } catch {
    return base;
  }
}

function CatalogSelect({
  label,
  value,
  options,
  onChange,
  onCreate,
  placeholder,
  inputMode,
  hint,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  onCreate: (raw: string) => void;
  placeholder: string;
  inputMode: 'text' | 'decimal' | 'numeric';
  hint?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const raw = draft.trim();
    if (!raw) return;
    onCreate(raw);
    setDraft('');
    setOpen(false);
  };

  return (
    <div className="space-y-1">
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</span>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-base font-bold text-zinc-900"
        >
          <option value="">Selecionar</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="min-h-11 min-w-11 shrink-0 rounded-xl bg-zinc-900 text-white text-lg font-bold"
          aria-label={`Adicionar ${label}`}
        >
          +
        </button>
      </div>
      {open && (
        <div className="flex gap-2">
          <input
            autoFocus
            inputMode={inputMode}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 min-h-11 rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-900"
          />
          <button type="button" onClick={commit} className="min-h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-800">
            Ok
          </button>
        </div>
      )}
      {hint}
    </div>
  );
}

const VISC_DOSE_NOTE = /\[Correção de viscosidade: ([^\]]+)\]/;

function formatPlainNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace('.', ',');
}

function parseViscDoseNote(notes: string): { before: string; target: string; steps: ViscosityAdditionStep[] } | null {
  const match = notes.match(VISC_DOSE_NOTE);
  if (!match) return null;
  let before = '';
  let target = '';
  const steps: ViscosityAdditionStep[] = [];
  for (const part of match[1].split(';')) {
    const text = part.trim();
    const antes = text.match(/^antes\s+([\d.,]+)/i);
    const alvo = text.match(/^alvo\s+([\d.,]+)/i);
    const dose = text.match(/^dose\s+([\d.,]+)\s*g\/L(?:\s*→\s*([\d.,]+))?/i);
    if (antes) before = antes[1].replace(',', '.');
    else if (alvo) target = alvo[1].replace(',', '.');
    else if (dose) {
      const grams = parseFloat(dose[1].replace(',', '.'));
      const visc = dose[2] ? parseFloat(dose[2].replace(',', '.')) : 0;
      steps.push({
        id: String(steps.length + 1),
        stepNumber: steps.length + 1,
        addedGrams: Number.isFinite(grams) ? grams : 0,
        cumulativeGrams: 0,
        measuredViscosity: visc > 0 ? visc : null,
        notes: '',
      });
    }
  }
  let cumulative = 0;
  for (const step of steps) {
    cumulative += step.addedGrams;
    step.cumulativeGrams = Number(cumulative.toFixed(3));
  }
  if (!before && !target && steps.length === 0) return null;
  return { before, target, steps };
}

function buildViscDoseNote(before: string, target: string, steps: ViscosityAdditionStep[]): string {
  const parts: string[] = [];
  const beforeNum = parseFloat(before.replace(',', '.'));
  const targetNum = parseFloat(target.replace(',', '.'));
  if (beforeNum > 0) parts.push(`antes ${formatPlainNumber(beforeNum)} cps`);
  if (targetNum > 0) parts.push(`alvo ${formatPlainNumber(targetNum)} cps`);
  for (const step of steps) {
    if (!(step.addedGrams > 0)) continue;
    const visc = Number(step.measuredViscosity);
    parts.push(visc > 0
      ? `dose ${formatPlainNumber(step.addedGrams)} g/L → ${formatPlainNumber(visc)} cps`
      : `dose ${formatPlainNumber(step.addedGrams)} g/L`);
  }
  if (parts.length === 0) return '';
  return `[Correção de viscosidade: ${parts.join('; ')}]`;
}

interface AnalysisCreationFlowProps {
  products: Product[];
  patterns: FiscoQuimicaPattern[];
  agents: FiscoQuimicaAgent[];
  analyses?: FiscoQuimicaAnalysis[];
  technicianName: string;
  setTechnicianName: (val: string) => void;
  config?: FiscoTemplateConfig;
  onSaved: () => void;
  onAgentsChanged?: () => void;
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
  onAgentsChanged,
  onOpenAddPattern,
  initialBatch,
  initialProductCode,
  editingAnalysis,
  onCancelEdit,
}: AnalysisCreationFlowProps) {
  const isEditingInCorrecao = isAnalysisInCorrection(editingAnalysis);

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
          if (d.viscTarget) setViscTarget(d.viscTarget);
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
      
      if (!isEditingInCorrecao) {
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
      if (editingAnalysis.notes) {
        const rawNotes = editingAnalysis.notes;
        const parsedDoses = parseViscDoseNote(rawNotes);
        const cleanedNotes = rawNotes
          .replace(/\[STATUS:\s*EM CORREÇÃO\]/gi, '')
          .replace(/\[EM CORREÇÃO\]/gi, '')
          .replace(VISC_DOSE_NOTE, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        setFormNotes(cleanedNotes);
        if (parsedDoses) {
          if (parsedDoses.before) setAdjInitialVisc(parsedDoses.before);
          if (parsedDoses.target) setViscTarget(parsedDoses.target);
          if (parsedDoses.steps.length > 0) setAdditionSteps(parsedDoses.steps);
        }
      }

      if (editingAnalysis.aspectOk !== undefined && editingAnalysis.aspectOk !== null) setAspectOk(editingAnalysis.aspectOk);
      if (editingAnalysis.aspectResult) setAspectDesc(editingAnalysis.aspectResult);
      if (editingAnalysis.colorOk !== undefined && editingAnalysis.colorOk !== null) setColorOk(editingAnalysis.colorOk);
      if (editingAnalysis.colorResult) setColorDesc(editingAnalysis.colorResult);
      if (editingAnalysis.odorOk !== undefined && editingAnalysis.odorOk !== null) setOdorOk(editingAnalysis.odorOk);
      if (editingAnalysis.odorResult) setOdorDesc(editingAnalysis.odorResult);
      if (editingAnalysis.viscometerModel) setViscModel(editingAnalysis.viscometerModel);
      if (editingAnalysis.viscometerSpindle) setViscSpindle(editingAnalysis.viscometerSpindle);
      if (editingAnalysis.viscometerRpm) setViscRpm(editingAnalysis.viscometerRpm);
      if (editingAnalysis.viscometerSeconds) setViscSeconds(editingAnalysis.viscometerSeconds);
      if (editingAnalysis.viscometerSpindle) setViscPresetTouched(true);

      setHasAdjustment(Boolean(editingAnalysis.hasAdjustment));
      if (editingAnalysis.correctiveAgentId) setAdjAgentId(editingAnalysis.correctiveAgentId);
      if (editingAnalysis.initialViscosity) setAdjInitialVisc(editingAnalysis.initialViscosity.toString());
      if (editingAnalysis.trialAgentQty && !parseViscDoseNote(editingAnalysis.notes || '')?.steps.length) {
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
  const galleryInputRef = React.useRef<HTMLInputElement>(null);

  // Avaliações Organolépticas (Aspecto / Cor / Odor)
  const [aspectOk, setAspectOk] = useState(true);
  const [aspectDesc, setAspectDesc] = useState('');
  const [colorOk, setColorOk] = useState(true);
  const [colorDesc, setColorDesc] = useState('');
  const [odorOk, setOdorOk] = useState(true);
  const [odorDesc, setOdorDesc] = useState('Característico');
  const [viscPreset, setViscPreset] = useState('');
  const [viscPresetTouched, setViscPresetTouched] = useState(false);
  const [viscModel, setViscModel] = useState(() => {
    try { return localStorage.getItem('fq_visc_model') || ''; } catch { return ''; }
  });
  const [viscSpindle, setViscSpindle] = useState('L4');
  const [viscRpm, setViscRpm] = useState(0.3);
  const [viscSeconds, setViscSeconds] = useState(60);
  const [timerLeft, setTimerLeft] = useState<number | null>(null);

  useEffect(() => {
    if (timerLeft == null || timerLeft <= 0) return;
    const id = window.setTimeout(() => setTimerLeft((current) => (current == null ? current : current - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [timerLeft]);

  useEffect(() => {
    if (timerLeft !== 0) return;
    try { navigator.vibrate?.(120); } catch { /* ignore */ }
  }, [timerLeft]);
  const [catalog, setCatalog] = useState<OptionCatalog>(loadCatalog);

  const saveCatalog = (next: OptionCatalog) => {
    setCatalog(next);
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const addCatalogItem = (key: keyof OptionCatalog, value: string) => {
    const clean = value.trim();
    if (!clean) return;
    saveCatalog({ ...catalog, [key]: mergeList(catalog[key], [clean]) });
  };

  useEffect(() => {
    const model = viscModel.trim();
    if (!model) return;
    try { localStorage.setItem('fq_visc_model', model); } catch { /* ignore */ }
    if (!catalog.models.some((item) => item.toLowerCase() === model.toLowerCase())) {
      saveCatalog({ ...catalog, models: mergeList(catalog.models, [model]) });
    }
  }, [viscModel]);

  useEffect(() => {
    if (viscModel.trim() || catalog.models.length !== 1) return;
    setViscModel(catalog.models[0]);
  }, [catalog.models, viscModel]);

  // Ajuste de Viscosidade com Histórico de Adições
  const [hasAdjustment, setHasAdjustment] = useState(false);
  const [adjAgentId, setAdjAgentId] = useState('');
  const [adjInitialVisc, setAdjInitialVisc] = useState<string>('');
  
  // Etapas de ensaio de viscosidade em amostra de bancada de 1L
  const [additionSteps, setAdditionSteps] = useState<ViscosityAdditionStep[]>([
    { id: '1', stepNumber: 1, addedGrams: 0, cumulativeGrams: 0, measuredViscosity: null, notes: '' }
  ]);
  const [viscTarget, setViscTarget] = useState('');
  const [stepDraft, setStepDraft] = useState<Record<string, { dose?: string; visc?: string }>>({});
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
      viscTarget,
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
    viscTarget,
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
    setOdorDesc('Característico');
    setHasAdjustment(false);
    setHasPhAdjustment(false);
    setAdditionSteps([
      { id: '1', stepNumber: 1, addedGrams: 1, cumulativeGrams: 1, measuredViscosity: null, notes: '' }
    ]);
  };

  const normalizeCode = (code: string) => code.replace(/\./g, '').trim().toLowerCase();

  // Filtragem de agentes por categoria
  const [extraAgents, setExtraAgents] = useState<FiscoQuimicaAgent[]>([]);
  const allAgents = useMemo(() => {
    const map = new Map<string, FiscoQuimicaAgent>();
    for (const agent of [...agents, ...extraAgents]) map.set(agent.id, agent);
    return [...map.values()];
  }, [agents, extraAgents]);

  const viscosityAgents = useMemo(() => {
    return allAgents.filter((a) => (a.category || 'VISCOSIDADE').toUpperCase() !== 'PH');
  }, [allAgents]);

  const phAgents = useMemo(() => {
    return allAgents.filter((a) => (a.category || '').toUpperCase() === 'PH' || (a.category || '').toUpperCase() === 'OUTROS');
  }, [allAgents]);

  const addCorrectiveAgent = async (category: 'VISCOSIDADE' | 'PH', raw: string, select: (id: string) => void) => {
    const name = raw.trim();
    if (!name) return;
    lockAutofill();
    const pool = category === 'PH' ? phAgents : viscosityAgents;
    const existing = pool.find((agent) => agent.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      select(existing.id);
      return;
    }
    const created: FiscoQuimicaAgent = { id: randomId(), name, category };
    setExtraAgents((prev) => [...prev, created]);
    select(created.id);
    try {
      await api.saveFiscoQuimicaAgent(created);
      onAgentsChanged?.();
    } catch (err) {
      console.error(err);
      alert('Não foi possível cadastrar o agente.');
    }
  };

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

  const lastSameProduct = useMemo(() => {
    const code = normalizeCode(formProductCode);
    if (!code || code === '__all__') return null;
    const list = (analyses || []).filter((item) => {
      if (!item || item.id === editingAnalysis?.id) return false;
      if (normalizeCode(item.productCode) !== code) return false;
      if (formBatch.trim() && String(item.batch).trim() === formBatch.trim()) return false;
      return true;
    });
    list.sort((a, b) => String(b.analysisDate || '').localeCompare(String(a.analysisDate || '')));
    return list[0] || null;
  }, [analyses, formProductCode, formBatch, editingAnalysis?.id]);

  const autofillLock = React.useRef('');
  const lockAutofill = () => {
    autofillLock.current = normalizeCode(formProductCode);
  };

  useEffect(() => {
    if (editingAnalysis) return;
    const code = normalizeCode(formProductCode);
    if (!code || code === '__all__') return;
    if (autofillLock.current === code) return;

    const history = (analyses || []).filter((item) => {
      if (!item || item.id === editingAnalysis?.id) return false;
      if (normalizeCode(item.productCode) !== code) return false;
      if (formBatch.trim() && String(item.batch).trim() === formBatch.trim()) return false;
      return true;
    }).sort((a, b) => String(b.analysisDate || '').localeCompare(String(a.analysisDate || '')));

    const usable = (value?: string | null) => {
      const text = String(value || '').trim();
      if (!text || text.toUpperCase() === 'CONFORME') return '';
      return text;
    };
    const aspect = history.map((item) => usable(item.aspectResult)).find(Boolean);
    const color = history.map((item) => usable(item.colorResult)).find(Boolean);
    const odor = history.map((item) => usable(item.odorResult)).find(Boolean);
    const model = history.map((item) => String(item.viscometerModel || '').trim()).find(Boolean);
    const method = history.find((item) => item.viscometerSpindle || (item.viscometerRpm && item.viscometerRpm > 0));
    const newest = history[0];

    if (aspect) setAspectDesc(aspect);
    if (color) setColorDesc(color);
    if (odor) setOdorDesc(odor);
    if (model) setViscModel(model);
    const lastThickener = history.find((item) => {
      const id = item.correctiveAgentId || '';
      if (!id) return false;
      const agent = agents.find((entry) => entry.id === id);
      return !!agent && (agent.category || 'VISCOSIDADE').toUpperCase() !== 'PH';
    });
    if (lastThickener?.correctiveAgentId) setAdjAgentId(lastThickener.correctiveAgentId);
    const lastPh = history.find((item) => (item.notes || '').includes('[Ajuste de pH:'));
    const phName = lastPh?.notes?.match(/\[Ajuste de pH:\s*([^|\]]+)/)?.[1]?.trim().toLowerCase();
    if (phName) {
      const phAgent = agents.find((entry) => entry.name.trim().toLowerCase() === phName);
      if (phAgent) setAdjPhAgentId(phAgent.id);
    }
    if (newest && newest.viscosityMeasured > 0) setViscTarget(String(Math.round(newest.viscosityMeasured)));

    if (method) {
      const spindle = method.viscometerSpindle || viscSpindle;
      const rpm = method.viscometerRpm && method.viscometerRpm > 0 ? method.viscometerRpm : viscRpm;
      const seconds = method.viscometerSeconds && method.viscometerSeconds > 0 ? method.viscometerSeconds : viscSeconds;
      if (method.viscometerSpindle) setViscSpindle(method.viscometerSpindle);
      if (method.viscometerRpm && method.viscometerRpm > 0) setViscRpm(method.viscometerRpm);
      if (method.viscometerSeconds && method.viscometerSeconds > 0) setViscSeconds(method.viscometerSeconds);
      setViscPreset(matchingPreset(spindle, rpm, seconds));
      setViscPresetTouched(true);
      return;
    }

    const linked = methodForAspect(aspect || '');
    if (linked) {
      setViscSpindle(linked.spindle);
      setViscRpm(linked.rpm);
      setViscSeconds(linked.seconds);
      setViscPreset(matchingPreset(linked.spindle, linked.rpm, linked.seconds));
      setViscPresetTouched(true);
      return;
    }

    const preset = VISCOSITY_PRESETS.find((item) => item.id === suggestViscosityPreset(formProductName));
    if (!preset || viscPresetTouched) return;
    setViscPreset(preset.id);
    setViscSpindle(preset.spindle);
    setViscRpm(preset.rpm);
    setViscSeconds(preset.seconds);
  }, [formProductCode, formBatch, formProductName, analyses, agents, editingAnalysis, viscPresetTouched]);

  const usedAnalyses = analyses || [];
  const aspectChoices = mergeList(catalog.aspects, usedAnalyses.map((item) => item.aspectResult), [aspectDesc]);
  const colorChoices = mergeList(catalog.colors, usedAnalyses.map((item) => item.colorResult), [colorDesc]);
  const odorChoices = mergeList(catalog.odors, usedAnalyses.map((item) => item.odorResult), [odorDesc]);
  const modelChoices = mergeList(catalog.models, usedAnalyses.map((item) => item.viscometerModel), [viscModel]);
  const spindleChoices = mergeList(catalog.spindles, usedAnalyses.map((item) => item.viscometerSpindle), [viscSpindle])
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const rpmChoices = mergeList(
    catalog.rpms,
    usedAnalyses.map((item) => (item.viscometerRpm && item.viscometerRpm > 0 ? String(item.viscometerRpm) : '')),
    [viscRpm > 0 ? String(viscRpm) : '']
  ).sort((a, b) => parseFloat(a) - parseFloat(b));
  const timeChoices = mergeList(
    catalog.times,
    usedAnalyses.map((item) => (item.viscometerSeconds && item.viscometerSeconds > 0 ? String(item.viscometerSeconds) : '')),
    [viscSeconds > 0 ? String(viscSeconds) : '']
  ).sort((a, b) => parseFloat(a) - parseFloat(b));

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
        addedGrams: 0,
        cumulativeGrams: lastCum,
        measuredViscosity: null,
        notes: ''
      }
    ]);
  };

  const handleRemoveStep = (index: number) => {
    if (additionSteps.length <= 1) {
      setAdditionSteps([{ id: randomId(), stepNumber: 1, addedGrams: 0, cumulativeGrams: 0, measuredViscosity: null, notes: '' }]);
      return;
    }
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

    const lastDoseVisc = [...additionSteps].reverse().find((step) => Number(step.measuredViscosity) > 0);
    const doseSum = additionSteps.reduce((sum, step) => sum + (Number(step.addedGrams) || 0), 0);
    if (!isEmCorrecao && (phClean === '' || (viscClean === '' && !lastDoseVisc) || (fracClean === '' && densClean === ''))) {
      alert('Preencha os valores medidos de pH, Viscosidade e Densidade para finalizar o laudo.');
      return;
    }

    const pattern = patterns.find(p => (p.productCode || '').replace(/\./g, '').toLowerCase() === formProductCode.replace(/\./g, '').toLowerCase()) || null;

    const phNum = phClean !== '' ? parseInputNumber(phClean, false) : (pattern ? (pattern.phMin + pattern.phMax) / 2 : 6.0);
    const viscNum = lastDoseVisc && Number(lastDoseVisc.measuredViscosity) > 0
      ? Number(lastDoseVisc.measuredViscosity)
      : (viscClean !== '' ? parseInputNumber(viscClean, true) : (hasAdjustment && adjInitialVisc ? parseInputNumber(adjInitialVisc, true) : (pattern ? (pattern.viscosityMin + pattern.viscosityMax) / 2 : 10000)));
    const fracNum = fracClean !== '' 
      ? parseInputNumber(fracClean, false) 
      : (densClean !== '' ? Number((parseInputNumber(densClean, false) * DENSITY_CUP_VOLUME).toFixed(3)) : 51.645);

    if (isNaN(phNum) || isNaN(viscNum) || isNaN(fracNum)) {
      alert('Os valores inseridos devem ser numéricos.');
      return;
    }

    const adjInitialViscNum = hasAdjustment && adjInitialVisc ? parseInputNumber(adjInitialVisc, true) : null;
    const adjTrialQtyNum = hasAdjustment && doseSum > 0 ? Number(doseSum.toFixed(3)) : null;
    const adjTrialViscNum = hasAdjustment && lastDoseVisc ? Number(lastDoseVisc.measuredViscosity) : null;
    const adjFinalQtyNum = hasAdjustment && doseSum > 0
      ? Number(doseSum.toFixed(3))
      : (hasAdjustment && adjFinalQty ? parseInputNumber(adjFinalQty, false) : null);
    const adjBatchSizeNum = adjBatchSize ? parseInputNumber(adjBatchSize, false) : null;

    // Enriquecer notas com dados de correção de pH e aspectos se houver
    let fullNotes = formNotes
      .replace(/\[STATUS:\s*EM CORREÇÃO\]/gi, '')
      .replace(/\[EM CORREÇÃO\]/gi, '')
      .trim();
    if (isEmCorrecao) {
      const corrTag = '[STATUS: EM CORREÇÃO]';
      fullNotes = fullNotes ? `${corrTag} ${fullNotes}` : corrTag;
    }
    const phDoseNum = hasPhAdjustment && adjPhFinalQty ? parseInputNumber(adjPhFinalQty, false) : null;
    const phBatchNum = adjBatchSize
      ? parseInputNumber(adjBatchSize, false)
      : (adjPhBatchSize ? parseInputNumber(adjPhBatchSize, false) : null);
    const phOn = hasPhAdjustment && !!adjPhAgentId && phDoseNum != null && !isNaN(phDoseNum) && phDoseNum > 0;
    const doseNote = hasAdjustment ? buildViscDoseNote(adjInitialVisc, viscTarget, additionSteps) : '';
    if (doseNote) {
      fullNotes = fullNotes ? `${fullNotes} ${doseNote}` : doseNote;
    }
    if (phOn && phBatchNum && phBatchNum > 0) {
      const phTotal = Number(((phDoseNum * phBatchNum) / 1000).toFixed(3));
      const phAgName = agents.find((a) => a.id === adjPhAgentId)?.name || adjPhAgentId;
      const phNote = `[Ajuste de pH: ${phAgName} | Dose: ${adjPhFinalQty} g/L | Total: ${phTotal.toFixed(3)} kg]`;
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
        const batchSizeVal = analyzeAll && t.qty > 0 ? t.qty : adjBatchSizeNum || phBatchNum || null;
        let totalAgentReq: number | null = null;
        const viscOn = hasAdjustment && !!adjAgentId && adjFinalQtyNum != null && !isNaN(adjFinalQtyNum) && adjFinalQtyNum > 0;
        if (viscOn && adjFinalQtyNum && batchSizeVal && batchSizeVal > 0) {
          totalAgentReq = Number(((adjFinalQtyNum * batchSizeVal) / 1000).toFixed(3));
        } else if (phOn && phDoseNum && batchSizeVal && batchSizeVal > 0) {
          totalAgentReq = Number(((phDoseNum * batchSizeVal) / 1000).toFixed(3));
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
          hasAdjustment: viscOn || phOn,
          correctiveAgentId: viscOn ? (adjAgentId || null) : (phOn ? adjPhAgentId || null : null),
          initialViscosity: hasAdjustment ? adjInitialViscNum : null,
          trialAgentQty: hasAdjustment ? adjTrialQtyNum : null,
          trialViscosity: hasAdjustment ? adjTrialViscNum : null,
          agentQtyPerLiter: viscOn ? adjFinalQtyNum : (phOn ? phDoseNum : null),
          batchSize: batchSizeVal,
          totalAgentRequired: totalAgentReq,
          notes: fullNotes || null,
          fabricatedBy: formFabricatedBy.trim() || config?.defaultFabricatedBy || null,
          authorizedBy: formAuthorizedBy.trim() || config?.defaultAuthorizedBy || null,
          syncedToErp: false,
          status: isEmCorrecao ? 'EM_CORRECAO' : 'CONFORME',
          mediaUrl: formMediaUrl.trim() || undefined,
          aspectOk: true,
          aspectResult: aspectDesc.trim() || 'CONFORME',
          colorOk: true,
          colorResult: colorDesc.trim() || 'CONFORME',
          odorOk: true,
          odorResult: odorDesc.trim() || 'Característico',
          viscometerModel: viscModel.trim() || null,
          viscometerSpindle: viscSpindle || null,
          viscometerRpm: viscRpm > 0 ? viscRpm : null,
          viscometerSeconds: viscSeconds > 0 ? viscSeconds : null,
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
      setOdorDesc('Característico');
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
                {isEditingInCorrecao ? 'Concluindo Análise de Lote em Correção' : 'Editando Registro de Laudo'}
              </h4>
              <p className="text-[11px] text-amber-800">
                Lote <strong>{editingAnalysis.batch}</strong> · Produto <strong>{editingAnalysis.productCode}</strong>.
                {isEditingInCorrecao ? ' Insira as medições finais da nova amostra e clique em "Salvar" para aprovar o laudo.' : ''}
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
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-base font-bold text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
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
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-base font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
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
                className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-xl text-base text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
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
              className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-base font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
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
              className="w-full px-3 py-2 border border-zinc-300 rounded-xl text-base font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
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
                className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-xl text-base font-medium text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
              />
            </div>
          </div>
        </div>
      </div>

      {lastSameProduct && (
        <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm text-zinc-600">
          Último lote deste produto: <strong className="text-zinc-900 font-mono">#{lastSameProduct.batch}</strong>
          <span className="text-zinc-400"> · {shortDate(lastSameProduct.analysisDate)}</span>
          <span className="block mt-1 font-mono text-zinc-800">
            pH {lastSameProduct.phMeasured > 0 ? lastSameProduct.phMeasured.toFixed(2) : '—'}
            {' · '}
            Visc {lastSameProduct.viscosityMeasured > 0 ? formatViscosity(lastSameProduct.viscosityMeasured) : '—'}
            {' · '}
            Dens {lastSameProduct.densityMeasured > 0 ? lastSameProduct.densityMeasured.toFixed(3) : '—'}
          </span>
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

        <div className="space-y-3">
          <CatalogSelect
            label="Aspecto"
            value={aspectDesc.toUpperCase() === 'CONFORME' ? '' : aspectDesc}
            options={aspectChoices.map((option) => ({ value: option, label: option }))}
            onChange={(value) => {
              lockAutofill();
              setAspectDesc(value);
              const linked = methodForAspect(value);
              if (!linked) return;
              setViscSpindle(linked.spindle);
              setViscRpm(linked.rpm);
              setViscSeconds(linked.seconds);
              setViscPreset(matchingPreset(linked.spindle, linked.rpm, linked.seconds));
              setViscPresetTouched(true);
            }}
            onCreate={(raw) => {
              lockAutofill();
              const name = raw.trim();
              addCatalogItem('aspects', name);
              setAspectDesc(name);
              const linked = methodForAspect(name);
              if (!linked) return;
              setViscSpindle(linked.spindle);
              setViscRpm(linked.rpm);
              setViscSeconds(linked.seconds);
              setViscPreset(matchingPreset(linked.spindle, linked.rpm, linked.seconds));
              setViscPresetTouched(true);
            }}
            placeholder="Novo aspecto"
            inputMode="text"
            hint={lastSameProduct?.aspectResult ? (
              <p className="text-[11px] text-zinc-500">Último lote {lastSameProduct.batch}: {lastSameProduct.aspectResult}</p>
            ) : null}
          />
          <CatalogSelect
            label="Cor"
            value={colorDesc.toUpperCase() === 'CONFORME' ? '' : colorDesc}
            options={colorChoices.map((option) => ({ value: option, label: option }))}
            onChange={(value) => { lockAutofill(); setColorDesc(value); }}
            onCreate={(raw) => {
              lockAutofill();
              addCatalogItem('colors', raw);
              setColorDesc(raw.trim());
            }}
            placeholder="Nova cor"
            inputMode="text"
            hint={lastSameProduct?.colorResult ? (
              <p className="text-[11px] text-zinc-500">Último lote {lastSameProduct.batch}: {lastSameProduct.colorResult}</p>
            ) : null}
          />
          <CatalogSelect
            label="Odor"
            value={odorDesc.toUpperCase() === 'CONFORME' ? '' : odorDesc}
            options={odorChoices.map((option) => ({ value: option, label: option }))}
            onChange={(value) => { lockAutofill(); setOdorDesc(value); }}
            onCreate={(raw) => {
              lockAutofill();
              addCatalogItem('odors', raw);
              setOdorDesc(raw.trim());
            }}
            placeholder="Novo odor"
            inputMode="text"
            hint={lastSameProduct?.odorResult ? (
              <p className="text-[11px] text-zinc-500">Último lote {lastSameProduct.batch}: {lastSameProduct.odorResult}</p>
            ) : null}
          />
        </div>

        {/* Cards de pH, Viscosidade e Densidade */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card pH */}
          <div className="p-3.5 rounded-2xl border border-zinc-200 bg-zinc-50/50 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">pH (25°C)</span>
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

            <div className="text-[11px] text-zinc-500">
              {lastSameProduct && lastSameProduct.phMeasured > 0
                ? <>Último lote {lastSameProduct.batch}: <strong className="text-zinc-800">{lastSameProduct.phMeasured.toFixed(2)}</strong></>
                : <span className="text-zinc-400">Sem lote anterior</span>}
            </div>
          </div>

          {/* Card Viscosidade */}
          <div className="p-3.5 rounded-2xl border border-zinc-200 bg-zinc-50/50 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Viscosidade (cps)</span>
              <button
                type="button"
                onClick={() => {
                  if (timerLeft != null && timerLeft > 0) {
                    setTimerLeft(null);
                    return;
                  }
                  setTimerLeft(viscSeconds > 0 ? viscSeconds : 60);
                }}
                className={cn(
                  'shrink-0 min-h-8 px-2.5 rounded-lg text-xs font-bold border',
                  timerLeft === 0
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : timerLeft != null
                      ? 'bg-zinc-900 text-white border-zinc-900 font-mono'
                      : 'bg-white text-zinc-700 border-zinc-200'
                )}
              >
                {timerLeft == null ? `Iniciar ${formatHold(viscSeconds > 0 ? viscSeconds : 60)}` : timerLeft <= 0 ? 'Ler agora' : formatClock(timerLeft)}
              </button>
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

            <div className="text-[11px] text-zinc-500">
              {lastSameProduct && lastSameProduct.viscosityMeasured > 0
                ? <>Último lote {lastSameProduct.batch}: <strong className="text-zinc-800">{formatViscosity(lastSameProduct.viscosityMeasured)}</strong>{lastSameProduct.viscometerSpindle ? ` · ${formatViscometerMethod(lastSameProduct)}` : ''}</>
                : <span className="text-zinc-400">Sem lote anterior</span>}
            </div>
          </div>

          {/* Card Densidade */}
          <div className="p-3.5 rounded-2xl border border-zinc-200 bg-zinc-50/50 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Densidade (g/mL)</span>
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
                  className="w-full text-base font-black border border-zinc-300 rounded-xl px-2.5 py-1.5 text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
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
                  className="w-full text-base font-black border border-zinc-300 rounded-xl px-2.5 py-1.5 text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-11"
                />
              </div>
            </div>

            <div className="text-[10px] text-zinc-500 truncate flex items-center justify-between">
              <span>
                {lastSameProduct && lastSameProduct.densityMeasured > 0
                  ? <>Último lote {lastSameProduct.batch}: <strong className="text-zinc-800">{lastSameProduct.densityMeasured.toFixed(3)}</strong></>
                  : <span className="text-zinc-400">Sem lote anterior</span>}
              </span>
              {calculatedDensity > 0 && (
                <span className="text-[10px] font-mono font-bold text-zinc-700">
                  = {calculatedDensity.toFixed(3)} g/mL
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-zinc-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Como mediu a viscosidade</span>
            <span className="text-xs font-bold text-zinc-800">
              {aspectDesc ? `${aspectDesc} · ` : ''}{viscSpindle} · {formatRpm(viscRpm)} rpm · {formatHold(viscSeconds)}
            </span>
          </div>
          <CatalogSelect
            label="Modelo"
            value={viscModel}
            options={modelChoices.map((option) => ({ value: option, label: option }))}
            onChange={(value) => { lockAutofill(); setViscModel(value); }}
            onCreate={(raw) => {
              lockAutofill();
              addCatalogItem('models', raw.trim());
              setViscModel(raw.trim());
            }}
            placeholder="Novo modelo"
            inputMode="text"
          />
          <CatalogSelect
            label="Spindle"
            value={viscSpindle}
            options={spindleChoices.map((option) => ({ value: option, label: option }))}
            onChange={(value) => {
              lockAutofill();
              setViscSpindle(value);
              setViscPresetTouched(true);
              setViscPreset(matchingPreset(value, viscRpm, viscSeconds));
              if (aspectDesc.trim()) rememberAspectMethod(aspectDesc, value, viscRpm, viscSeconds);
            }}
            onCreate={(raw) => {
              lockAutofill();
              const spindle = raw.trim().toUpperCase();
              addCatalogItem('spindles', spindle);
              setViscSpindle(spindle);
              setViscPresetTouched(true);
              setViscPreset(matchingPreset(spindle, viscRpm, viscSeconds));
              if (aspectDesc.trim()) rememberAspectMethod(aspectDesc, spindle, viscRpm, viscSeconds);
            }}
            placeholder="Novo spindle"
            inputMode="text"
          />
          <CatalogSelect
            label="RPM"
            value={viscRpm > 0 ? String(viscRpm) : ''}
            options={rpmChoices.map((option) => ({ value: option, label: formatRpm(parseFloat(option)) }))}
            onChange={(value) => {
              const rpm = parseFloat(value);
              if (!rpm) return;
              lockAutofill();
              setViscRpm(rpm);
              setViscPresetTouched(true);
              setViscPreset(matchingPreset(viscSpindle, rpm, viscSeconds));
              if (aspectDesc.trim()) rememberAspectMethod(aspectDesc, viscSpindle, rpm, viscSeconds);
            }}
            onCreate={(raw) => {
              const rpm = parseFloat(raw.replace(',', '.'));
              if (!Number.isFinite(rpm) || rpm <= 0) return;
              lockAutofill();
              addCatalogItem('rpms', String(rpm));
              setViscRpm(rpm);
              setViscPresetTouched(true);
              setViscPreset(matchingPreset(viscSpindle, rpm, viscSeconds));
              if (aspectDesc.trim()) rememberAspectMethod(aspectDesc, viscSpindle, rpm, viscSeconds);
            }}
            placeholder="Novo RPM"
            inputMode="decimal"
          />
          <CatalogSelect
            label="Tempo"
            value={viscSeconds > 0 ? String(viscSeconds) : ''}
            options={timeChoices.map((option) => ({ value: option, label: formatHold(parseFloat(option)) }))}
            onChange={(value) => {
              const seconds = parseInt(value, 10);
              if (!seconds) return;
              lockAutofill();
              setViscSeconds(seconds);
              setViscPresetTouched(true);
              setViscPreset(matchingPreset(viscSpindle, viscRpm, seconds));
              if (aspectDesc.trim()) rememberAspectMethod(aspectDesc, viscSpindle, viscRpm, seconds);
            }}
            onCreate={(raw) => {
              const seconds = parseInt(raw.replace(',', '.'), 10);
              if (!Number.isFinite(seconds) || seconds <= 0) return;
              lockAutofill();
              addCatalogItem('times', String(seconds));
              setViscSeconds(seconds);
              setViscPresetTouched(true);
              setViscPreset(matchingPreset(viscSpindle, viscRpm, seconds));
              if (aspectDesc.trim()) rememberAspectMethod(aspectDesc, viscSpindle, viscRpm, seconds);
            }}
            placeholder="Segundos"
            inputMode="numeric"
          />
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

      {/* 3. Correção — dose e total do lote */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm space-y-4">
        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
          3. Correção
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !hasAdjustment;
              setHasAdjustment(next);
              if (next && !adjInitialVisc.trim() && formViscosity.trim()) setAdjInitialVisc(formViscosity.trim());
            }}
            className={cn('min-h-12 rounded-xl text-sm font-bold border', hasAdjustment ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-800 border-zinc-200')}
          >
            Viscosidade
          </button>
          <button
            type="button"
            onClick={() => setHasPhAdjustment(!hasPhAdjustment)}
            className={cn('min-h-12 rounded-xl text-sm font-bold border', hasPhAdjustment ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-800 border-zinc-200')}
          >
            pH
          </button>
        </div>

        {(hasAdjustment || hasPhAdjustment) && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase">Tamanho do lote (L ou kg)</label>
              <input
                type="text"
                inputMode="decimal"
                value={adjBatchSize}
                onChange={(e) => {
                  const value = e.target.value.replace(',', '.');
                  setAdjBatchSize(value);
                  setAdjPhBatchSize(value);
                }}
                placeholder="Ex: 80"
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-base font-bold text-zinc-900 bg-white min-h-12 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>

            {hasAdjustment && (
              <div className="space-y-3 rounded-2xl border border-zinc-200 p-3">
                <CatalogSelect
                  label="Espessante"
                  value={adjAgentId}
                  options={viscosityAgents.map((agent) => ({ value: agent.id, label: agent.name }))}
                  onChange={(value) => { lockAutofill(); setAdjAgentId(value); }}
                  onCreate={(raw) => { void addCorrectiveAgent('VISCOSIDADE', raw, setAdjAgentId); }}
                  placeholder="Novo espessante"
                  inputMode="text"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Antes (cps)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={adjInitialVisc}
                      onChange={(e) => setAdjInitialVisc(e.target.value.replace(',', '.'))}
                      placeholder="Inicial"
                      className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-base font-bold text-zinc-900 bg-white min-h-12 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Alvo (cps)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={viscTarget}
                      onChange={(e) => setViscTarget(e.target.value.replace(',', '.'))}
                      placeholder="Padrão"
                      className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-base font-bold text-zinc-900 bg-white min-h-12 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  {additionSteps.map((step, index) => (
                    <div key={step.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div className="space-y-1">
                        {index === 0 && <label className="text-[10px] font-bold text-zinc-500 uppercase">Dose g/L</label>}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={stepDraft[step.id]?.dose ?? (step.addedGrams ? String(step.addedGrams) : '')}
                          onChange={(e) => {
                            const raw = e.target.value.replace(',', '.');
                            setStepDraft((prev) => ({ ...prev, [step.id]: { ...prev[step.id], dose: raw } }));
                            const num = parseFloat(raw);
                            handleStepChange(index, 'addedGrams', Number.isFinite(num) ? num : 0);
                          }}
                          placeholder="g/L"
                          className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-base font-bold text-zinc-900 bg-white min-h-12 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                        />
                      </div>
                      <div className="space-y-1">
                        {index === 0 && <label className="text-[10px] font-bold text-zinc-500 uppercase">Viscosidade</label>}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={stepDraft[step.id]?.visc ?? (step.measuredViscosity ? String(step.measuredViscosity) : '')}
                          onChange={(e) => {
                            const raw = e.target.value.replace(',', '.');
                            setStepDraft((prev) => ({ ...prev, [step.id]: { ...prev[step.id], visc: raw } }));
                            const num = raw.trim() === '' ? null : parseFloat(raw);
                            handleStepChange(index, 'measuredViscosity', Number.isFinite(Number(num)) ? num : null);
                            const laterHas = additionSteps.slice(index + 1).some((item) => Number(item.measuredViscosity) > 0);
                            if (!laterHas && num && num > 0) setFormViscosity(String(num));
                          }}
                          placeholder="cps"
                          className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-base font-bold text-zinc-900 bg-white min-h-12 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(index)}
                        className="min-h-12 min-w-11 rounded-xl border border-zinc-200 text-zinc-500 text-lg font-bold"
                        aria-label="Remover dose"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="w-full min-h-12 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-900"
                  >
                    + Adicionar dose
                  </button>
                </div>
                <div className="text-sm text-zinc-700 space-y-1">
                  <div>
                    Soma das doses:{' '}
                    <strong className="text-zinc-950">
                      {(() => {
                        const dose = additionSteps.reduce((sum, step) => sum + (Number(step.addedGrams) || 0), 0);
                        const lote = parseFloat(adjBatchSize);
                        if (dose <= 0) return '—';
                        const kg = lote > 0 ? ` · ${((dose * lote) / 1000).toFixed(3)} kg` : '';
                        return `${formatPlainNumber(dose)} g/L${kg}`;
                      })()}
                    </strong>
                  </div>
                  {(() => {
                    const target = parseFloat(viscTarget);
                    const last = [...additionSteps].reverse().find((step) => Number(step.measuredViscosity) > 0);
                    const current = last ? Number(last.measuredViscosity) : 0;
                    if (!(target > 0) || !(current > 0)) return null;
                    const reached = current >= target;
                    return (
                      <div className={reached ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                        {reached ? 'Chegou no alvo' : 'Ainda abaixo do alvo'} · {formatPlainNumber(current)} cps
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {hasPhAdjustment && (
              <div className="space-y-3 rounded-2xl border border-zinc-200 p-3">
                <CatalogSelect
                  label="Corretor de pH"
                  value={adjPhAgentId}
                  options={phAgents.map((agent) => ({ value: agent.id, label: agent.name }))}
                  onChange={(value) => { lockAutofill(); setAdjPhAgentId(value); }}
                  onCreate={(raw) => { void addCorrectiveAgent('PH', raw, setAdjPhAgentId); }}
                  placeholder="Novo corretor"
                  inputMode="text"
                />
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase">Dose usada (g/L)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={adjPhFinalQty}
                    onChange={(e) => setAdjPhFinalQty(e.target.value.replace(',', '.'))}
                    placeholder="Ex: 1"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-base font-black text-zinc-900 bg-white min-h-12 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                </div>
                <div className="text-sm text-zinc-700">
                  Total no reator:{' '}
                  <strong className="text-lg text-zinc-950">
                    {(() => {
                      const dose = parseFloat(adjPhFinalQty);
                      const lote = parseFloat(adjBatchSize);
                      return dose > 0 && lote > 0 ? `${((dose * lote) / 1000).toFixed(3)} kg` : '—';
                    })()}
                  </strong>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* 4. Observações, Mídia e Ações */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-zinc-200 shadow-sm space-y-5">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
            Observações
          </label>
          <textarea
            placeholder="Anote detalhes de liberação, alterações ou observações de bancada..."
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            rows={2}
            className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-base text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-20"
          />
        </div>

        {/* Anexo de Foto/Vídeo/Mídia da Amostra */}
        <div className="border-t border-zinc-100 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-zinc-400" /> Foto da amostra
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
            accept="image/*"
            capture="environment"
            onChange={handleMediaUpload}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
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
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                className="min-h-16 rounded-2xl border border-zinc-200 bg-white text-sm font-bold text-zinc-900"
              >
                Tirar foto
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="min-h-16 rounded-2xl border border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-700"
              >
                Galeria
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-2 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSaveAnalysis(false, false)}
            className="w-full min-h-12 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-bold"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {isEditingInCorrecao ? 'Concluir e Salvar Laudo' : 'Salvar Registro'}
          </button>
          {(hasAdjustment || hasPhAdjustment) && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveAnalysis(false, true)}
              className="w-full min-h-12 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-xl text-sm font-bold"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvar Lote em Correção
            </button>
          )}
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
