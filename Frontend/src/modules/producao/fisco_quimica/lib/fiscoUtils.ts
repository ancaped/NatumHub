import { FiscoQuimicaAnalysis, FiscoQuimicaPattern, FiscoQuimicaAgent, Product, FiscoTemplateConfig } from '../../../geral/lib/types';
import { LAB_NAME, DEPT_NAME, COMPANY_INFO } from '../../../geral/lib/microbioUtils';

export const DENSITY_CUP_VOLUME = 51.645; // Volume do picnômetro / copo padrão em mL

export interface ViscosityAdditionStep {
  id: string;
  stepNumber: number;
  addedGrams: number;
  cumulativeGrams: number;
  measuredViscosity?: number | null;
  notes?: string;
}

export interface PhAdjustmentInfo {
  hasAdjustment: boolean;
  agentId?: string | null;
  agentName?: string | null;
  initialPh?: number | null;
  finalPh?: number | null;
  quantityUsed?: number | null;
  unit?: string;
  notes?: string;
}

export interface OrganolepticEvaluation {
  aspectOk: boolean;
  aspectDesc: string;
  colorOdorOk: boolean;
  colorOdorDesc: string;
}

export const DEFAULT_FISCO_TEMPLATE: FiscoTemplateConfig = {
  labName: LAB_NAME,
  deptName: "CONTROLE DE QUALIDADE FÍSICO-QUÍMICO",
  companyName: COMPANY_INFO.name,
  companyAddress: COMPANY_INFO.address,
  companyEmail: COMPANY_INFO.email,
  companyContact: COMPANY_INFO.contact,
  sampleType: "COSMÉTICOS / PRODUTO ACABADO",
  technicianSignName: "Rafael Marinho de Melo",
  technicianSignTitle: "Responsável Técnico",
  defaultTechnician: "EDSON FERRARI",
  defaultFabricatedBy: "RODRIGO DE SOUSA PADILHA",
  defaultAuthorizedBy: "RAFAEL MARINHO DE MELO",
  defaultAspect: "CONFORME PADRÃO",
  defaultColorOdor: "CARACTERÍSTICO"
};

export function escapeHtml(s: string | undefined | null): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Calcula a densidade a partir do peso da fração no copo de calibração de 51,645 mL
 */
export function calculateDensity(fractionWeight: number): number {
  if (isNaN(fractionWeight) || fractionWeight <= 0) return 0;
  return Number((fractionWeight / DENSITY_CUP_VOLUME).toFixed(3));
}

/**
 * Extrai volume ou peso e unidade da descrição do produto (ex: "1 L", "250 ML", "500 GR", "300 ML")
 */
export function parsePackageFromProductName(name?: string | null): { volume: number; unit: 'mL' | 'L' | 'g' | 'kg' } | null {
  if (!name) return null;
  const upper = name.toUpperCase();

  // 1. Litros (ex: 1 L, 1L, 5 L, 5L, 1.5 L)
  const lMatch = upper.match(/(\d+(?:[.,]\d+)?)\s*(?:L|LT|LITROS?)\b/);
  if (lMatch) {
    const v = parseFloat(lMatch[1].replace(',', '.'));
    if (!isNaN(v) && v > 0) return { volume: v, unit: 'L' };
  }

  // 2. Mililitros (ex: 250 ML, 300ML, 500 ML, 1000 ML, 900 ML)
  const mlMatch = upper.match(/(\d+(?:[.,]\d+)?)\s*ML\b/);
  if (mlMatch) {
    const v = parseFloat(mlMatch[1].replace(',', '.'));
    if (!isNaN(v) && v > 0) return { volume: v, unit: 'mL' };
  }

  // 3. Quilos (ex: 1 KG, 1.5 KG, 5 KG)
  const kgMatch = upper.match(/(\d+(?:[.,]\d+)?)\s*KG\b/);
  if (kgMatch) {
    const v = parseFloat(kgMatch[1].replace(',', '.'));
    if (!isNaN(v) && v > 0) return { volume: v, unit: 'kg' };
  }

  // 4. Gramas (ex: 250 G, 250 GR, 500 G, 500 GR, 150 GR)
  const gMatch = upper.match(/(\d+(?:[.,]\d+)?)\s*(?:G|GR|GRAMAS?)\b/);
  if (gMatch) {
    const v = parseFloat(gMatch[1].replace(',', '.'));
    if (!isNaN(v) && v > 0) return { volume: v, unit: 'g' };
  }

  return null;
}

/**
 * Calcula as metas de envase (Balança vs Volume) com resolução automática de embalagem
 */
export function calculateFillingTargets(
  pattern: FiscoQuimicaPattern | null,
  density: number,
  productName?: string | null
): {
  weight: { value: number; unit: 'g' | 'kg' };
  volume: { value: number; unit: 'mL' | 'L' };
} {
  const d = density > 0 ? density : (pattern?.densityTarget || 1.0);
  let pkgVol = Number(pattern?.packageVolume) || 0;
  let unit = (pattern?.packageUnit || '').trim().toLowerCase();

  if (pkgVol <= 0 && productName) {
    const parsed = parsePackageFromProductName(productName);
    if (parsed) {
      pkgVol = parsed.volume;
      unit = parsed.unit.toLowerCase();
    }
  }

  if (pkgVol <= 0 || d <= 0) {
    return {
      weight: { value: 0, unit: 'g' },
      volume: { value: 0, unit: 'mL' }
    };
  }

  const isKg = unit === 'kg';
  const isL = unit === 'l';
  const isG = unit === 'g';

  let targetWeightVal = 0;
  let targetWeightUnit: 'g' | 'kg' = isKg || isL ? 'kg' : 'g';

  let targetVolumeVal = 0;
  let targetVolumeUnit: 'mL' | 'L' = isKg || isL ? 'L' : 'mL';

  if (isKg || isG) {
    // Embalagem vendida por massa nominal
    targetWeightVal = pkgVol;
    const nominalWeightInG = isKg ? pkgVol * 1000 : pkgVol;
    const volumeInMl = nominalWeightInG / d;

    if (isKg) {
      targetVolumeVal = Number((volumeInMl / 1000).toFixed(3));
      targetVolumeUnit = 'L';
    } else {
      targetVolumeVal = Number(volumeInMl.toFixed(1));
      targetVolumeUnit = 'mL';
    }
  } else {
    // Embalagem vendida por volume nominal (mL ou L)
    const nominalVolumeInMl = isL ? pkgVol * 1000 : pkgVol;
    const weightInG = nominalVolumeInMl * d;

    if (isL) {
      targetWeightVal = Number((weightInG / 1000).toFixed(3));
      targetWeightUnit = 'kg';
      targetVolumeVal = pkgVol;
      targetVolumeUnit = 'L';
    } else {
      targetWeightVal = Number(weightInG.toFixed(1));
      targetWeightUnit = 'g';
      targetVolumeVal = pkgVol;
      targetVolumeUnit = 'mL';
    }
  }

  return {
    weight: { value: targetWeightVal, unit: targetWeightUnit },
    volume: { value: targetVolumeVal, unit: targetVolumeUnit }
  };
}

/**
 * Calcula a recomendação prática de ajuste de viscosidade para ensaio de bancada em 1L
 * com suporte a histórico de adições
 */
export function calculateViscosityAdjustment(
  initialViscosity: number,
  trialQty: number,
  trialViscosity: number,
  targetViscosity: number,
  batchSize: number
) {
  if (
    initialViscosity <= 0 ||
    targetViscosity <= 0 ||
    trialQty <= 0 ||
    trialViscosity <= initialViscosity
  ) {
    return {
      efficiency: 0,
      recommendedQtyPerLiter: 0,
      estimatedTotalKg: 0,
      isValid: false
    };
  }

  // Eficiência = ganho de cps por grama em 1L
  const efficiency = (trialViscosity - initialViscosity) / trialQty;
  const neededGain = targetViscosity - initialViscosity;
  const recommendedQtyPerLiter = Number((neededGain / efficiency).toFixed(3));

  // Para o reator descontando 1L da amostra de bancada
  const remainingBatch = Math.max(0, batchSize - 1);
  const estimatedTotalKg = Number(((recommendedQtyPerLiter * remainingBatch) / 1000).toFixed(3));

  return {
    efficiency: Number(efficiency.toFixed(1)),
    recommendedQtyPerLiter,
    estimatedTotalKg,
    isValid: true
  };
}

/**
 * Calcula a recomendação prática de ajuste de pH para ensaio de bancada em 1L
 */
export function calculatePhAdjustment(
  initialPh: number,
  trialQty: number,
  trialPh: number,
  targetPh: number,
  batchSize: number
) {
  const deltaTrial = Math.abs(trialPh - initialPh);
  const neededGain = Math.abs(targetPh - initialPh);

  if (
    initialPh <= 0 ||
    targetPh <= 0 ||
    trialQty <= 0 ||
    deltaTrial === 0 ||
    neededGain === 0
  ) {
    return {
      efficiency: 0,
      recommendedQtyPerLiter: 0,
      estimatedTotalKg: 0,
      isValid: false
    };
  }

  // Eficiência = variação de pH por grama em 1L
  const efficiency = deltaTrial / trialQty;
  const recommendedQtyPerLiter = Number((neededGain / efficiency).toFixed(3));

  // Para o reator descontando 1L da amostra de bancada
  const remainingBatch = Math.max(0, batchSize - 1);
  const estimatedTotalKg = Number(((recommendedQtyPerLiter * remainingBatch) / 1000).toFixed(3));

  return {
    efficiency: Number(efficiency.toFixed(3)),
    recommendedQtyPerLiter,
    estimatedTotalKg,
    isValid: true
  };
}

/**
 * Faz o parsing de números inseridos pelo usuário no padrão brasileiro ou ERP (americano)
 * Aceita "12,000", "12.000" ou "12000" para viscosidade sem truncar para 12.
 */
export function parseInputNumber(raw: string | number | null | undefined, isViscosityOrInteger: boolean = false): number {
  if (raw == null) return 0;
  const str = raw.toString().trim().replace(/\s/g, '');
  if (!str) return 0;

  if (isViscosityOrInteger) {
    // Para viscosidade e números inteiros em cps:
    // Se digitou com separador de milhar ex: "12,000" (ERP) ou "12.000" (BR):
    if (/^\d{1,4}[.,]\d{3}$/.test(str)) {
      const clean = str.replace(/[.,]/g, '');
      const n = parseFloat(clean);
      return isNaN(n) ? 0 : n;
    }
    // Caso com vírgula ou ponto genérico
    const clean = str.replace(/[.,]/g, '');
    const n = parseInt(clean, 10);
    return isNaN(n) ? 0 : n;
  }

  // Para campos decimais (pH, Densidade, Picnômetro):
  if (str.includes(',') && str.includes('.')) {
    const clean = str.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  }
  const clean = str.replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

/**
 * Formata o valor medido de viscosidade para centipoise (cps).
 * Utiliza o mesmo padrão do ERP com vírgula para separação de milhar (ex: 12,000 / 65,000 / 9,146 / 400).
 */
export function formatViscosity(val: number | null | undefined, pattern?: FiscoQuimicaPattern | null): string {
  if (val == null || isNaN(val) || val <= 0) return '-';

  let num = val;
  // 1. Se veio do ERP como float com decimais (ex: 9.146, 14.341, 10.434):
  if (!Number.isInteger(num)) {
    if (num < 300 && Math.abs(Math.round(num * 1000) - num * 1000) < 0.05) {
      num = Math.round(num * 1000);
    } else {
      num = Math.round(num);
    }
  }

  // 2. Se for menor que 300 e não for produto de baixa viscosidade como Fluido de Brilho (1.31.003):
  const isFluidoBrilho = pattern?.productCode === '1.31.003' || (pattern && pattern.viscosityMin < 800 && pattern.viscosityMax <= 800);
  if (!isFluidoBrilho && num < 300) {
    num = num * 1000;
  }

  return Math.round(num).toLocaleString('en-US');
}

/**
 * Validação de conformidade físico-química em relação aos padrões e aspecto
 */
export function checkAnalysisCompliance(
  analysis: {
    phMeasured: number;
    viscosityMeasured: number;
    densityMeasured: number;
    hasAdjustment?: boolean;
    aspectOk?: boolean | null;
    colorOk?: boolean | null;
    odorOk?: boolean | null;
    colorOdorOk?: boolean | null;
    status?: string | null;
    notes?: string | null;
  },
  pattern: FiscoQuimicaPattern | null
) {
  const isEmCorrecao = analysis.status === 'EM_CORRECAO' || 
    (analysis.notes || '').includes('[STATUS: EM CORREÇÃO]') ||
    (analysis.notes || '').includes('[EM CORREÇÃO]');

  const aspectOk = analysis.aspectOk !== undefined && analysis.aspectOk !== null ? analysis.aspectOk : !(analysis.notes || '').includes('[Aspecto Não Conforme');
  const colorOk = analysis.colorOk !== undefined && analysis.colorOk !== null ? analysis.colorOk : !(analysis.notes || '').includes('[Cor Não Conforme');
  const odorOk = analysis.odorOk !== undefined && analysis.odorOk !== null ? analysis.odorOk : !(analysis.notes || '').includes('[Odor Não Conforme');
  const legacyColorOdorOk = analysis.colorOdorOk !== undefined && analysis.colorOdorOk !== null ? analysis.colorOdorOk : !(analysis.notes || '').includes('[Cor/Odor Não Conforme');

  const organoOk = aspectOk && colorOk && odorOk && legacyColorOdorOk;

  if (isEmCorrecao) {
    return {
      hasPattern: !!pattern,
      phOk: true,
      viscOk: false,
      densityOk: true,
      aspectOk,
      colorOk,
      odorOk,
      isCompliant: false,
      densMin: pattern ? pattern.densityTarget - pattern.densityTolerance : 0.98,
      densMax: pattern ? pattern.densityTarget + pattern.densityTolerance : 1.02,
      overallStatus: 'EM_CORRECAO' as const,
      statusLabel: 'Em Correção'
    };
  }

  if (!pattern) {
    return {
      hasPattern: false,
      phOk: true,
      viscOk: true,
      densityOk: true,
      aspectOk,
      colorOk,
      odorOk,
      isCompliant: organoOk,
      densMin: 0.98,
      densMax: 1.02,
      overallStatus: (!organoOk ? 'FORA_PADRAO' : 'SEM_PADRAO') as const,
      statusLabel: !organoOk ? 'Não Conforme (Aspecto/Cor/Odor)' : 'Padrão não definido'
    };
  }

  const phOk = analysis.phMeasured >= pattern.phMin && analysis.phMeasured <= pattern.phMax;
  
  // Viscosidade: validação direta contra o padrão
  const v = analysis.viscosityMeasured;
  const viscOk = (v >= pattern.viscosityMin && v <= pattern.viscosityMax) ||
                 (pattern.viscosityMin >= 1000 && v < 500 && (v * 1000 >= pattern.viscosityMin && v * 1000 <= pattern.viscosityMax));

  const densMin = pattern.densityTarget - pattern.densityTolerance;
  const densMax = pattern.densityTarget + pattern.densityTolerance;
  const densityOk = analysis.densityMeasured <= 0 || (analysis.densityMeasured >= densMin && analysis.densityMeasured <= densMax);

  const allOk = phOk && viscOk && densityOk && organoOk;

  let overallStatus: 'CONFORME' | 'AJUSTADO' | 'FORA_PADRAO' | 'EM_CORRECAO' = 'CONFORME';
  let statusLabel = 'Conforme';

  if (!allOk) {
    overallStatus = 'FORA_PADRAO';
    statusLabel = 'Fora de Especificação';
  } else if (analysis.hasAdjustment) {
    overallStatus = 'AJUSTADO';
    statusLabel = 'Conforme (Ajustado)';
  }

  return {
    hasPattern: true,
    phOk,
    viscOk,
    densityOk,
    aspectOk,
    colorOk,
    odorOk,
    isCompliant: allOk,
    densMin,
    densMax,
    overallStatus,
    statusLabel
  };
}

/**
 * Gera o HTML oficial de uma página A4 do Laudo de Análise Físico-Química
 */
export function renderFiscoReportHtml(
  analysis: FiscoQuimicaAnalysis,
  pattern: FiscoQuimicaPattern | null,
  product?: Product,
  agent?: FiscoQuimicaAgent | null,
  config?: FiscoTemplateConfig,
  organoleptic?: OrganolepticEvaluation
): string {
  const cfg = { ...DEFAULT_FISCO_TEMPLATE, ...(config || {}) };
  
  const isAspectFail = analysis.aspectOk === false || (analysis.notes || '').includes('[Aspecto Não Conforme');
  const isColorFail = analysis.colorOk === false || (analysis.notes || '').includes('[Cor Não Conforme');
  const isOdorFail = analysis.odorOk === false || (analysis.notes || '').includes('[Odor Não Conforme');
  const isLegacyColorOdorFail = (analysis.notes || '').includes('[Cor/Odor Não Conforme');

  const aspectMatch = (analysis.notes || '').match(/\[Aspecto Não Conforme: ([^\]]+)\]/);
  const colorMatch = (analysis.notes || '').match(/\[Cor Não Conforme: ([^\]]+)\]/);
  const odorMatch = (analysis.notes || '').match(/\[Odor Não Conforme: ([^\]]+)\]/);
  const legacyColorOdorMatch = (analysis.notes || '').match(/\[Cor\/Odor Não Conforme: ([^\]]+)\]/);

  const aspectSpec = pattern?.aspect || cfg.defaultAspect || 'Líquido / Emulsão Homogênea';
  const colorSpec = pattern?.color || 'Conforme Padrão';
  const odorSpec = pattern?.odor || cfg.defaultColorOdor || 'Característico';

  const displayedAspect = aspectMatch ? aspectMatch[1] : (analysis.aspectResult || 'CONFORME');
  const displayedColor = colorMatch ? colorMatch[1] : (analysis.colorResult || 'CONFORME');
  const displayedOdor = odorMatch ? odorMatch[1] : (legacyColorOdorMatch ? legacyColorOdorMatch[1] : (analysis.odorResult || 'CARACTERÍSTICO'));

  const aspectOk = !isAspectFail;
  const colorOk = !isColorFail;
  const odorOk = !isOdorFail && !isLegacyColorOdorFail;

  const compliance = checkAnalysisCompliance({
    phMeasured: analysis.phMeasured,
    viscosityMeasured: analysis.viscosityMeasured,
    densityMeasured: analysis.densityMeasured,
    hasAdjustment: analysis.hasAdjustment,
    aspectOk,
    colorOk,
    odorOk
  }, pattern);

  // Formatação de data
  const rawDate = analysis.analysisDate || '';
  const dateFormatted = rawDate.includes('-')
    ? rawDate.split('-').reverse().join('/')
    : rawDate;

  // Ensaios e especificações
  const phSpec = pattern ? `${pattern.phMin.toFixed(2)} – ${pattern.phMax.toFixed(2)}` : '5.50 – 7.00';
  const viscSpec = pattern ? `${formatViscosity(pattern.viscosityMin, pattern)} – ${formatViscosity(pattern.viscosityMax, pattern)} cps` : 'Conforme Padrão';
  const densSpec = pattern ? `${pattern.densityTarget.toFixed(3)} ± ${pattern.densityTolerance.toFixed(3)} g/mL` : '1.000 ± 0.020 g/mL';

  const fillingTargets = calculateFillingTargets(pattern, analysis.densityMeasured, analysis.productName);
  const packagingInfo = pattern && pattern.packageVolume > 0
    ? `${pattern.packageVolume} ${pattern.packageUnit}`
    : (fillingTargets.volume.value > 0
        ? `${fillingTargets.volume.value} ${fillingTargets.volume.unit}`
        : (product?.packaging || 'FRASCO/POTE'));
  const envaseWeightDisplay = analysis.envaseTargetWeight > 0
    ? `${analysis.envaseTargetWeight} ${analysis.envaseTargetUnit || 'g'}`
    : (fillingTargets.weight.value > 0 ? `${fillingTargets.weight.value} ${fillingTargets.weight.unit}` : '—');
  const fractionWeightVal = analysis.fractionWeight > 0
    ? analysis.fractionWeight
    : (analysis.densityMeasured > 0 ? analysis.densityMeasured * DENSITY_CUP_VOLUME : 0);
  const fractionWeightDisplay = fractionWeightVal > 0 ? `${fractionWeightVal.toFixed(3)} g` : '—';

  return `
    <div class="report-page" style="width: 210mm; min-height: 297mm; max-height: 297mm; padding: 14mm 16mm 12mm 16mm; margin: 0 auto; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; line-height: 1.3; display: flex; flex-direction: column; justify-content: flex-start; background: #ffffff; color: #000000; page-break-after: always; break-after: page;">
      
      <!-- Cabeçalho Oficial -->
      <div style="text-align: center; margin-bottom: 12px;">
        <div style="display: inline-block; border-bottom: 1.5px solid #000000; padding-bottom: 2px; padding-left: 14px; padding-right: 14px;">
          <h1 style="font-family: 'Times New Roman', Times, serif; font-size: 19pt; font-weight: bold; text-transform: uppercase; margin: 0; letter-spacing: 0.02em;">
            ${escapeHtml(cfg.labName)}
          </h1>
        </div>
        <div style="font-family: 'Times New Roman', Times, serif; font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.38em; margin-top: 4px;">
          ${escapeHtml(cfg.deptName)}
        </div>
      </div>

      <!-- Título do Relatório -->
      <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <div style="font-size: 10pt; font-weight: bold; text-transform: uppercase; font-family: 'Times New Roman', Times, serif;">
            LAUDO DE ANÁLISE FÍSICO-QUÍMICA
          </div>
          <div style="font-family: 'Times New Roman', Times, serif; font-size: 14pt; font-weight: bold; font-style: italic; margin-top: 1px;">
            LOTE Nº ${escapeHtml(analysis.batch)}
          </div>
        </div>
        <div style="text-align: right; font-size: 8.5pt;">
          <span style="font-weight: bold;">DATA DE EMISSÃO:</span> ${escapeHtml(dateFormatted)}
        </div>
      </div>

      <div style="border-top: 1px solid #000000; margin: 3px 0 7px 0;"></div>

      <!-- Dados da Empresa -->
      <div style="display: flex; border-bottom: 1px solid #000000; padding-bottom: 5px; margin-bottom: 8px; font-size: 8.5pt;">
        <div style="width: 60%; padding-right: 10px; display: flex; flex-direction: column; gap: 2px;">
          <div><strong style="width: 85px; display: inline-block;">EMPRESA:</strong> ${escapeHtml(cfg.companyName)}</div>
          <div><strong style="width: 85px; display: inline-block;">ENDEREÇO:</strong> ${escapeHtml(cfg.companyAddress)}</div>
          <div><strong style="width: 85px; display: inline-block;">E-MAIL:</strong> ${escapeHtml(cfg.companyEmail)}</div>
        </div>
        <div style="width: 40%; border-left: 1px solid #000000; padding-left: 12px; display: flex; flex-direction: column; gap: 2px;">
          <div><strong style="width: 80px; display: inline-block;">CONTATO:</strong> ${escapeHtml(cfg.companyContact)}</div>
          <div><strong style="width: 80px; display: inline-block;">AMOSTRA:</strong> ${escapeHtml(cfg.sampleType)}</div>
          <div><strong style="width: 80px; display: inline-block;">ANALISTA:</strong> <span style="text-transform: uppercase;">${escapeHtml(analysis.technician)}</span></div>
        </div>
      </div>

      <!-- Identificação do Produto e Lote -->
      <div style="border: 1px solid #000000; padding: 6px 10px; margin-bottom: 8px; font-size: 8.5pt; display: flex; flex-direction: column; gap: 3px;">
        <div style="display: flex; justify-content: space-between;">
          <div style="width: 65%;"><strong>PRODUTO:</strong> <span style="font-weight: bold; text-transform: uppercase;">${escapeHtml(analysis.productName)}</span></div>
          <div style="width: 35%; text-align: right;"><strong>CÓDIGO:</strong> ${escapeHtml(analysis.productCode)}</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <div style="width: 65%;"><strong>EMBALAGEM:</strong> <span style="text-transform: uppercase;">${escapeHtml(packagingInfo)}</span></div>
          <div style="width: 35%; text-align: right;"><strong>VALIDADE:</strong> ${escapeHtml(product?.validity || '3 anos')}</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <div style="width: 65%;"><strong>FABRICANTE:</strong> NATUM BIO COSMÉTICOS LTDA</div>
          <div style="width: 35%; text-align: right;"><strong>DATA ANÁLISE:</strong> ${escapeHtml(dateFormatted)}</div>
        </div>
      </div>

      <!-- Tabela de Ensaios Físico-Químicos -->
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #000000; font-size: 8pt; margin-bottom: 8px;">
        <thead>
          <tr style="background: #f4f4f5;">
            <th style="border: 1px solid #000000; padding: 4px 5px; font-weight: bold; text-align: left; text-transform: uppercase; width: 26%;">
              ENSAIO
            </th>
            <th style="border: 1px solid #000000; padding: 4px 5px; font-weight: bold; text-align: left; text-transform: uppercase; width: 28%;">
              ESPECIFICAÇÃO
            </th>
            <th style="border: 1px solid #000000; padding: 4px 5px; font-weight: bold; text-align: center; text-transform: uppercase; width: 18%;">
              RESULTADO OBTIDO
            </th>
            <th style="border: 1px solid #000000; padding: 4px 5px; font-weight: bold; text-align: center; text-transform: uppercase; width: 16%;">
              MÉTODO
            </th>
            <th style="border: 1px solid #000000; padding: 4px 5px; font-weight: bold; text-align: center; text-transform: uppercase; width: 12%;">
              AVALIAÇÃO
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #000000; padding: 4px 6px; font-weight: bold;">ASPECTO</td>
            <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml(aspectSpec)}</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold;">
              ${escapeHtml(displayedAspect)}
            </td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">ORGANOLÉPTICO</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; color: ${aspectOk ? '#047857' : '#b91c1c'};">
              ${aspectOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid #000000; padding: 4px 6px; font-weight: bold;">COR</td>
            <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml(colorSpec)}</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold;">
              ${escapeHtml(displayedColor)}
            </td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">ORGANOLÉPTICO</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; color: ${colorOk ? '#047857' : '#b91c1c'};">
              ${colorOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid #000000; padding: 4px 6px; font-weight: bold;">ODOR</td>
            <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml(odorSpec)}</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold;">
              ${escapeHtml(displayedOdor)}
            </td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">ORGANOLÉPTICO</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; color: ${odorOk ? '#047857' : '#b91c1c'};">
              ${odorOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid #000000; padding: 4px 6px; font-weight: bold;">POTENCIAL HIDROGENIÔNICO (pH a 25°C)</td>
            <td style="border: 1px solid #000000; padding: 4px 6px;">${phSpec}</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; font-size: 8.5pt;">
              ${analysis.phMeasured.toFixed(2)}
            </td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">POTENCIOMETRIA</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; color: ${compliance.phOk ? '#047857' : '#b91c1c'};">
              ${compliance.phOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid #000000; padding: 4px 6px; font-weight: bold;">VISCOSIDADE DINÂMICA (25°C)</td>
            <td style="border: 1px solid #000000; padding: 4px 6px;">${viscSpec}</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; font-size: 8.5pt;">
              ${formatViscosity(analysis.viscosityMeasured, pattern)} cps
            </td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">VISCOSIMETRIA</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; color: ${compliance.viscOk ? '#047857' : '#b91c1c'};">
              ${compliance.viscOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid #000000; padding: 4px 6px; font-weight: bold;">DENSIDADE RELATIVA (20°C)</td>
            <td style="border: 1px solid #000000; padding: 4px 6px;">${densSpec}</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; font-size: 8.5pt;">
              ${analysis.densityMeasured.toFixed(3)} g/mL
            </td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">GRAVIMETRIA (BALANÇA DE PRECISÃO)</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; color: ${compliance.densityOk ? '#047857' : '#b91c1c'};">
              ${compliance.densityOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Bloco de Calibração / Meta de Envase -->
      <div style="border: 1px solid #000000; padding: 5px 8px; margin-bottom: 6px; font-size: 8pt; background: #fafafa;">
        <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 3px;">PARÂMETROS DE ENVASE E CALIBRAÇÃO DE BALANÇA:</div>
        <div style="display: flex; justify-content: space-between; font-size: 7.5pt;">
          <div>Volume do Copo Padrão: <strong>${DENSITY_CUP_VOLUME} mL</strong> | Peso da Fração: <strong>${fractionWeightDisplay}</strong></div>
          <div>Peso Alvo na Balança de Envase: <strong>${envaseWeightDisplay}</strong></div>
        </div>
      </div>

      <!-- Registro de Ajuste (se houver) -->
      ${analysis.hasAdjustment ? `
        <div style="border: 1px solid #000000; padding: 5px 8px; margin-bottom: 6px; font-size: 7.5pt; background: #fffbeb;">
          <strong style="text-transform: uppercase; color: #92400e;">REGISTRO DE AJUSTE CORRETIVO NO LOTE:</strong>
          <div style="margin-top: 2px;">
            Agente Corretivo: <strong>${escapeHtml(agent?.name || analysis.correctiveAgentId || 'Corretivo')}</strong> |
            Visc. Inicial: <strong>${formatViscosity(analysis.initialViscosity, pattern)} cps</strong> |
            Dose Teste em 1L: <strong>${(analysis.trialAgentQty || 0).toFixed(2)} g</strong> |
            Visc. no Teste: <strong>${formatViscosity(analysis.trialViscosity, pattern)} cps</strong> |
            Dose Total Adicionada ao Lote: <strong>${analysis.totalAgentRequired ? `${(analysis.totalAgentRequired / 1000).toFixed(3)} kg` : 'Conforme Ensaio'}</strong>
          </div>
        </div>
      ` : ''}

      <!-- Parecer Técnico / Conclusão -->
      <div style="border: 1.5px solid #000000; padding: 6px 8px; margin-bottom: 6px; background: #ffffff;">
        <div style="font-weight: bold; text-transform: uppercase; font-size: 8.5pt; margin-bottom: 2px;">
          CONCLUSÃO DOS ENSAIOS (PARECER TÉCNICO):
        </div>
        <p style="font-weight: bold; text-transform: uppercase; font-size: 8pt; margin: 0; line-height: 1.3;">
          ${compliance.overallStatus === 'FORA_PADRAO'
            ? 'AMOSTRA NÃO CONFORME COM OS PARÂMETROS ANALISADOS. LOTE RETIDO PARA REAVALIAÇÃO.'
            : (analysis.hasAdjustment
                ? 'AMOSTRA CONFORME COM AS ESPECIFICAÇÕES TÉCNICAS DO CONTROLE DE QUALIDADE APÓS AJUSTE CORRETIVO REALIZADO E APROVADO.'
                : 'AMOSTRA CONFORME COM AS ESPECIFICAÇÕES TÉCNICAS ESTABELECIDAS PELO CONTROLE DE QUALIDADE PARA OS ENSAIOS DESCRITOS.')}
        </p>
      </div>

      <!-- Observações adicionais -->
      ${analysis.notes ? `
        <div style="font-size: 7.5pt; font-style: italic; margin-bottom: 8px;">
          <strong>OBSERVAÇÕES:</strong> ${escapeHtml(analysis.notes)}
        </div>
      ` : ''}

      <!-- Assinatura e Encerramento -->
      <div style="margin-top: auto; padding-top: 14px; text-align: center;">
        <div style="font-weight: bold; font-size: 9.5pt; margin-bottom: 24px;">
          Carangola-MG, ${escapeHtml(dateFormatted)}
        </div>

        <div style="display: inline-block; border-top: 1px solid #000000; padding-top: 3px; padding-left: 30px; padding-right: 30px; text-align: center;">
          <div style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; font-weight: bold; font-style: italic;">
            ${escapeHtml(cfg.technicianSignName)}
          </div>
          <div style="font-family: 'Times New Roman', Times, serif; font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.35em; margin-top: 2px;">
            ${escapeHtml(cfg.technicianSignTitle)}
          </div>
        </div>
      </div>

    </div>
  `;
}

/**
 * Função de impressão com suporte a impressão individual ou em lote
 */
export function printFiscoReports(
  reportOrReports: FiscoQuimicaAnalysis | FiscoQuimicaAnalysis[],
  patterns: FiscoQuimicaPattern[],
  products: Product[],
  agents: FiscoQuimicaAgent[],
  config?: FiscoTemplateConfig
) {
  const reportsList = Array.isArray(reportOrReports) ? reportOrReports : [reportOrReports];
  if (reportsList.length === 0) return;

  const renderedHtmlPages = reportsList.map((rep) => {
    const pat = patterns.find(p => p.productCode.toLowerCase().replace(/\./g, '') === rep.productCode.toLowerCase().replace(/\./g, '')) || null;
    const prod = products.find(p => p.code.toLowerCase().replace(/\./g, '') === rep.productCode.toLowerCase().replace(/\./g, ''));
    const ag = agents.find(a => a.id === rep.correctiveAgentId) || null;
    return renderFiscoReportHtml(rep, pat, prod, ag, config);
  }).join('\n');

  try {
    if (document.activeElement instanceof HTMLIFrameElement) {
      document.activeElement.blur();
    }
    window.focus();
    document.querySelectorAll('iframe[data-natum-print="1"]').forEach((el) => {
      try {
        (el as HTMLIFrameElement).src = 'about:blank';
        el.remove();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-natum-print', '1');
  iframe.src = 'about:blank';
  document.body.appendChild(iframe);

  let cleaned = false;
  let started = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (document.activeElement === iframe) iframe.blur();
      window.focus();
      iframe.src = 'about:blank';
      iframe.remove();
    } catch {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }
  };

  const runPrint = () => {
    if (started || cleaned) return;
    started = true;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!doc || !win) {
      cleanup();
      return;
    }

    try {
      doc.open();
      doc.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laudo Físico-Químico - ${escapeHtml(reportsList[0]?.batch || '')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
    }
    .report-page {
      width: 210mm;
      min-height: 297mm;
      max-height: 297mm;
      page-break-after: always;
      break-after: page;
    }
  </style>
</head>
<body>
  ${renderedHtmlPages}
</body>
</html>`);
      doc.close();
    } catch {
      cleanup();
      return;
    }

    setTimeout(() => {
      try {
        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
        setTimeout(cleanup, 60_000);
      } catch {
        cleanup();
      }
    }, 250);
  };

  iframe.onload = () => runPrint();
  if (iframe.contentDocument?.readyState === 'complete') {
    runPrint();
  }
}

/**
 * Impressão de Relatório Resumido de Lotes em Folha A4 Paisagem
 */
export function printFiscoSummaryReport(
  analyses: FiscoQuimicaAnalysis[],
  patterns: FiscoQuimicaPattern[],
  config?: FiscoTemplateConfig
) {
  if (!analyses || analyses.length === 0) return;

  const cfg = config || DEFAULT_FISCO_TEMPLATE;
  const today = new Date();
  const dateFormatted = today.toLocaleDateString('pt-BR');

  const rowsHtml = analyses.map((a, index) => {
    const pat = patterns.find(p => p.productCode.toLowerCase().replace(/\./g, '') === a.productCode.toLowerCase().replace(/\./g, '')) || null;
    const comp = checkAnalysisCompliance(a, pat);
    const dateStr = a.analysisDate.includes('-')
      ? a.analysisDate.split('-').reverse().join('/')
      : a.analysisDate;

    let statusBadge = '<span style="color:#065f46; font-weight:bold; font-size:7pt; background:#d1fae5; padding:1px 4px; border-radius:3px;">CONFORME</span>';
    if (a.hasAdjustment) {
      statusBadge = '<span style="color:#92400e; font-weight:bold; font-size:7pt; background:#fef3c7; padding:1px 4px; border-radius:3px;">AJUSTADO</span>';
    } else if (comp.overallStatus === 'FORA_PADRAO') {
      statusBadge = '<span style="color:#991b1b; font-weight:bold; font-size:7pt; background:#fee2e2; padding:1px 4px; border-radius:3px;">FORA PADRÃO</span>';
    }

    return `
      <tr style="border-bottom: 1px solid #e4e4e7; font-size: 7.5pt; ${index % 2 === 1 ? 'background:#fafafa;' : ''}">
        <td style="padding: 4px 6px; text-align: center; font-family: monospace;">${index + 1}</td>
        <td style="padding: 4px 6px; text-align: center; white-space: nowrap;">${escapeHtml(dateStr)}</td>
        <td style="padding: 4px 6px; font-weight: bold; font-family: monospace; text-align: center;">${escapeHtml(a.batch)}</td>
        <td style="padding: 4px 6px; font-family: monospace; text-align: center;">${escapeHtml(a.productCode)}</td>
        <td style="padding: 4px 6px; font-weight: 600; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(a.productName)}</td>
        <td style="padding: 4px 6px; text-align: center; ${!comp.phOk ? 'color:#b91c1c; font-weight:bold;' : ''}">
          ${a.phMeasured > 0 ? a.phMeasured.toFixed(2) : '—'}
        </td>
        <td style="padding: 4px 6px; text-align: center; ${!comp.viscOk ? 'color:#b91c1c; font-weight:bold;' : ''}">
          ${formatViscosity(a.viscosityMeasured, pat)}
        </td>
        <td style="padding: 4px 6px; text-align: center; ${!comp.densityOk ? 'color:#b91c1c; font-weight:bold;' : ''}">
          ${a.densityMeasured > 0 ? a.densityMeasured.toFixed(3) : '—'}
        </td>
        <td style="padding: 4px 6px; text-align: center;">${escapeHtml(a.aspect || 'Conforme')}</td>
        <td style="padding: 4px 6px; text-align: center;">${statusBadge}</td>
        <td style="padding: 4px 6px; font-size: 7pt; color: #52525b; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(a.technician || '—')}</td>
      </tr>
    `;
  }).join('');

  try {
    if (document.activeElement instanceof HTMLIFrameElement) {
      document.activeElement.blur();
    }
    window.focus();
    document.querySelectorAll('iframe[data-natum-print="1"]').forEach((el) => {
      try {
        (el as HTMLIFrameElement).src = 'about:blank';
        el.remove();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-natum-print', '1');
  iframe.src = 'about:blank';
  document.body.appendChild(iframe);

  let cleaned = false;
  let started = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (document.activeElement === iframe) iframe.blur();
      window.focus();
      iframe.src = 'about:blank';
      iframe.remove();
    } catch {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }
  };

  const runPrint = () => {
    if (started || cleaned) return;
    started = true;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!doc || !win) {
      cleanup();
      return;
    }

    try {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Relatório Resumido de Análises Físico-Químicas</title>
            <style>
              @page {
                size: A4 landscape;
                margin: 8mm 10mm;
              }
              * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              html, body {
                margin: 0;
                padding: 0;
                background: #ffffff;
                font-family: Arial, Helvetica, sans-serif;
                color: #18181b;
              }
              .summary-container {
                width: 100%;
              }
              .header-table {
                width: 100%;
                border-bottom: 2px solid #18181b;
                padding-bottom: 6px;
                margin-bottom: 8px;
              }
              table.data-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 8pt;
              }
              table.data-table th {
                background-color: #f4f4f5;
                border-bottom: 1.5px solid #a1a1aa;
                border-top: 1px solid #e4e4e7;
                padding: 5px 6px;
                font-size: 7.5pt;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                color: #3f3f46;
              }
              .footer-section {
                margin-top: 12px;
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                font-size: 7.5pt;
                color: #71717a;
                border-top: 1px solid #e4e4e7;
                padding-top: 6px;
              }
            </style>
          </head>
          <body>
            <div class="summary-container">
              <table class="header-table">
                <tr>
                  <td style="vertical-align: top;">
                    <div style="font-size: 13pt; font-weight: 900; letter-spacing: 0.05em; color: #09090b;">${escapeHtml(cfg.companyName)}</div>
                    <div style="font-size: 8pt; font-weight: bold; color: #52525b; text-transform: uppercase;">${escapeHtml(cfg.deptName)}</div>
                  </td>
                  <td style="text-align: right; vertical-align: top;">
                    <div style="font-size: 11pt; font-weight: 800; color: #09090b;">RELATÓRIO RESUMIDO DE ANÁLISES FÍSICO-QUÍMICAS</div>
                    <div style="font-size: 7.5pt; color: #71717a; margin-top: 2px;">
                      Total de Lotes: <strong>${analyses.length}</strong> | Emissão: <strong>${escapeHtml(dateFormatted)}</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width: 30px; text-align: center;">Item</th>
                    <th style="width: 75px; text-align: center;">Data</th>
                    <th style="width: 70px; text-align: center;">Lote</th>
                    <th style="width: 75px; text-align: center;">Código</th>
                    <th>Produto</th>
                    <th style="width: 55px; text-align: center;">pH</th>
                    <th style="width: 95px; text-align: center;">Viscosidade (cps)</th>
                    <th style="width: 85px; text-align: center;">Densidade (g/mL)</th>
                    <th style="width: 80px; text-align: center;">Aspecto</th>
                    <th style="width: 85px; text-align: center;">Status</th>
                    <th style="width: 105px;">Analista</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>

              <div class="footer-section">
                <div>
                  NatumHub · Sistema de Gestão Industrial & Laboratorial
                </div>
                <div style="text-align: right;">
                  <div style="border-top: 1px solid #71717a; width: 220px; margin-bottom: 2px; padding-top: 2px;"></div>
                  <strong style="font-size: 8pt; color: #09090b;">${escapeHtml(cfg.technicianSignName)}</strong>
                  <div style="font-size: 6.5pt; text-transform: uppercase;">${escapeHtml(cfg.technicianSignTitle)}</div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `);
      doc.close();
    } catch {
      cleanup();
      return;
    }

    setTimeout(() => {
      try {
        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
        setTimeout(cleanup, 60_000);
      } catch {
        cleanup();
      }
    }, 250);
  };

  iframe.onload = () => runPrint();
  if (iframe.contentDocument?.readyState === 'complete') {
    runPrint();
  }
}

/**
 * Imprime uma Ordem de Ajuste Corretivo para execução na produção / reator
 */
export function printCorrectiveOrder(
  analysis: FiscoQuimicaAnalysis,
  pattern?: FiscoQuimicaPattern | null,
  agent?: FiscoQuimicaAgent | null,
  config?: FiscoAppConfig | null
) {
  const cfg = config?.template || DEFAULT_FISCO_TEMPLATE;

  try {
    if (document.activeElement instanceof HTMLIFrameElement) {
      document.activeElement.blur();
    }
    window.focus();
    document.querySelectorAll('iframe[data-natum-print="1"]').forEach((el) => {
      try {
        (el as HTMLIFrameElement).src = 'about:blank';
        el.remove();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-natum-print', '1');
  iframe.src = 'about:blank';
  document.body.appendChild(iframe);

  let cleaned = false;
  let started = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (document.activeElement === iframe) iframe.blur();
      window.focus();
      iframe.src = 'about:blank';
      iframe.remove();
    } catch {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }
  };

  const agentName = agent?.name || analysis.correctiveAgentId || 'Agente Corretivo';
  const dose = analysis.agentQtyPerLiter != null ? `${analysis.agentQtyPerLiter} g/L` : '-';
  const batchSize = analysis.batchSize != null ? `${analysis.batchSize.toLocaleString('pt-BR')} kg/L` : '-';
  const totalKg = analysis.totalAgentRequired != null ? `${analysis.totalAgentRequired.toFixed(3)} kg` : (
    analysis.agentQtyPerLiter && analysis.batchSize ? `${((analysis.agentQtyPerLiter * Math.max(0, analysis.batchSize - 1)) / 1000).toFixed(3)} kg` : '-'
  );

  const runPrint = () => {
    if (started || cleaned) return;
    started = true;
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!doc || !win) {
      cleanup();
      return;
    }

    try {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Ordem de Correção - Lote ${escapeHtml(analysis.batch)}</title>
            <style>
              @page { size: A4 portrait; margin: 15mm; }
              body {
                font-family: Arial, Helvetica, sans-serif;
                color: #000000;
                margin: 0;
                padding: 0;
                background: #ffffff;
                font-size: 10pt;
              }
              .container {
                border: 2px solid #000000;
                padding: 20px;
                max-width: 100%;
              }
              .header-box {
                text-align: center;
                border-bottom: 2px solid #000000;
                padding-bottom: 12px;
                margin-bottom: 16px;
              }
              .title {
                font-size: 16pt;
                font-weight: 900;
                letter-spacing: 0.05em;
                margin-top: 4px;
                text-transform: uppercase;
              }
              .sub {
                font-size: 9pt;
                color: #333333;
                text-transform: uppercase;
              }
              .badge-banner {
                background-color: #fef3c7;
                border: 1.5px solid #d97706;
                color: #92400e;
                padding: 8px 12px;
                text-align: center;
                font-weight: bold;
                font-size: 11pt;
                margin-bottom: 16px;
                border-radius: 4px;
              }
              .info-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 16px;
              }
              .info-table td {
                border: 1px solid #000000;
                padding: 8px 10px;
                font-size: 9.5pt;
              }
              .highlight-box {
                border: 2px solid #000000;
                background-color: #f8fafc;
                padding: 16px;
                margin-bottom: 16px;
                text-align: center;
              }
              .big-number {
                font-size: 26pt;
                font-weight: 900;
                color: #09090b;
                margin: 6px 0;
              }
              .inst-list {
                margin: 12px 0 0 0;
                padding-left: 20px;
                font-size: 9pt;
                line-height: 1.4;
                text-align: left;
              }
              .signatures {
                margin-top: 30px;
                display: flex;
                justify-content: space-between;
                gap: 20px;
              }
              .sig-box {
                width: 45%;
                text-align: center;
                font-size: 8.5pt;
              }
              .sig-line {
                border-top: 1px solid #000000;
                margin-top: 40px;
                padding-top: 4px;
                font-weight: bold;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header-box">
                <div style="font-size: 13pt; font-weight: bold;">${escapeHtml(cfg.companyName)}</div>
                <div class="sub">${escapeHtml(cfg.deptName)} · CONTROLE DE QUALIDADE</div>
                <div class="title">ORDEM DE AJUSTE CORRETIVO EM REATOR</div>
              </div>

              <div class="badge-banner">
                STATUS: LOTE EM CORREÇÃO (AGUARDANDO RETORNO DE NOVA AMOSTRA)
              </div>

              <table class="info-table">
                <tr>
                  <td style="width: 25%; font-weight: bold; background: #f4f4f5;">LOTE:</td>
                  <td style="width: 25%; font-weight: 900; font-size: 12pt;">${escapeHtml(analysis.batch)}</td>
                  <td style="width: 25%; font-weight: bold; background: #f4f4f5;">DATA DA ORDEM:</td>
                  <td style="width: 25%;">${escapeHtml(analysis.analysisDate)}</td>
                </tr>
                <tr>
                  <td style="font-weight: bold; background: #f4f4f5;">PRODUTO:</td>
                  <td colspan="3"><strong>${escapeHtml(analysis.productCode)}</strong> - ${escapeHtml(analysis.productName)}</td>
                </tr>
                <tr>
                  <td style="font-weight: bold; background: #f4f4f5;">TAMANHO DO LOTE (REATOR):</td>
                  <td style="font-weight: bold;">${escapeHtml(batchSize)}</td>
                  <td style="font-weight: bold; background: #f4f4f5;">ANALISTA EMISSOR:</td>
                  <td>${escapeHtml(analysis.technician)}</td>
                </tr>
              </table>

              <div class="highlight-box">
                <div style="font-size: 10pt; font-weight: bold; color: #52525b; text-transform: uppercase;">
                  AÇÃO RECOMENDADA PELO LABORATÓRIO (ENSAIO DE BANCADA)
                </div>
                <div style="font-size: 12pt; font-weight: bold; margin-top: 6px;">
                  Adicionar o produto: <span style="text-decoration: underline;">${escapeHtml(agentName)}</span>
                </div>
                <div style="font-size: 9pt; color: #71717a; margin-top: 2px;">
                  Dosagem apurada: <strong>${escapeHtml(dose)}</strong> (por litro de produto no reator)
                </div>

                <div style="margin-top: 12px; font-size: 10pt; font-weight: bold; text-transform: uppercase;">
                  QUANTIDADE TOTAL A PESAR E ADICIONAR NO REATOR:
                </div>
                <div class="big-number">
                  ${escapeHtml(totalKg)}
                </div>

                <ol class="inst-list">
                  <li>Pesar exatamente a quantidade acima na balança de insumos.</li>
                  <li>Ligar a agitação do reator e adicionar o corretivo lentamente sob agitação constante.</li>
                  <li>Manter homogeneizando por no mínimo <strong>20 a 30 minutos</strong>.</li>
                  <li>Após o tempo de mistura, retirar nova amostra e encaminhar ao laboratório para verificação final.</li>
                </ol>
              </div>

              ${analysis.notes ? `
                <div style="border: 1px dashed #71717a; padding: 8px 12px; margin-bottom: 16px; font-size: 8.5pt; background: #fafafa;">
                  <strong>Observações do Laboratório:</strong> ${escapeHtml(analysis.notes)}
                </div>
              ` : ''}

              <div class="signatures">
                <div class="sig-box">
                  <div class="sig-line">${escapeHtml(analysis.technician)}</div>
                  <div>Analista do Controle de Qualidade</div>
                </div>
                <div class="sig-box">
                  <div class="sig-line">Operador Responsável pela Adição</div>
                  <div>Data: ____/____/________  Hora: ____:____</div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `);
      doc.close();
    } catch {
      cleanup();
      return;
    }

    setTimeout(() => {
      try {
        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
        setTimeout(cleanup, 60_000);
      } catch {
        cleanup();
      }
    }, 250);
  };

  iframe.onload = () => runPrint();
  if (iframe.contentDocument?.readyState === 'complete') {
    runPrint();
  }
}
