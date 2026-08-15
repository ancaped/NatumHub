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
 * Calcula as metas de envase (Balança vs Volume)
 */
export function calculateFillingTargets(
  pattern: FiscoQuimicaPattern | null,
  density: number
): {
  weight: { value: number; unit: 'g' | 'kg' };
  volume: { value: number; unit: 'mL' | 'L' };
} {
  if (!pattern || density <= 0) {
    return {
      weight: { value: 0, unit: 'g' },
      volume: { value: 0, unit: 'mL' }
    };
  }

  const pkgVol = Number(pattern.packageVolume) || 0;
  const unit = (pattern.packageUnit || 'mL').trim().toLowerCase();
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
    const volumeInMl = nominalWeightInG / density;

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
    const weightInG = nominalVolumeInMl * density;

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
 * Validação de conformidade físico-química em relação aos padrões e aspecto
 */
export function checkAnalysisCompliance(
  analysis: {
    phMeasured: number;
    viscosityMeasured: number;
    densityMeasured: number;
    hasAdjustment?: boolean;
    aspectOk?: boolean;
    colorOdorOk?: boolean;
  },
  pattern: FiscoQuimicaPattern | null
) {
  const aspectOk = analysis.aspectOk !== undefined ? analysis.aspectOk : true;
  const colorOdorOk = analysis.colorOdorOk !== undefined ? analysis.colorOdorOk : true;

  if (!pattern) {
    return {
      hasPattern: false,
      phOk: true,
      viscOk: true,
      densityOk: true,
      aspectOk,
      colorOdorOk,
      overallStatus: (!aspectOk || !colorOdorOk ? 'FORA_PADRAO' : 'SEM_PADRAO') as const,
      statusLabel: !aspectOk || !colorOdorOk ? 'Não Conforme (Aspecto/Odor)' : 'Padrão não definido'
    };
  }

  const phOk = analysis.phMeasured >= pattern.phMin && analysis.phMeasured <= pattern.phMax;
  const viscOk = analysis.viscosityMeasured >= pattern.viscosityMin && analysis.viscosityMeasured <= pattern.viscosityMax;

  const densMin = pattern.densityTarget - pattern.densityTolerance;
  const densMax = pattern.densityTarget + pattern.densityTolerance;
  const densityOk = analysis.densityMeasured >= densMin && analysis.densityMeasured <= densMax;

  const allOk = phOk && viscOk && densityOk && aspectOk && colorOdorOk;

  let overallStatus: 'CONFORME' | 'AJUSTADO' | 'FORA_PADRAO' = 'CONFORME';
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
    colorOdorOk,
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
  const organo = organoleptic || {
    aspectOk: true,
    aspectDesc: cfg.defaultAspect || 'Líquido / Emulsão Homogênea',
    colorOdorOk: true,
    colorOdorDesc: cfg.defaultColorOdor || 'Característico'
  };

  const compliance = checkAnalysisCompliance({
    phMeasured: analysis.phMeasured,
    viscosityMeasured: analysis.viscosityMeasured,
    densityMeasured: analysis.densityMeasured,
    hasAdjustment: analysis.hasAdjustment,
    aspectOk: organo.aspectOk,
    colorOdorOk: organo.colorOdorOk
  }, pattern);

  // Formatação de data
  const rawDate = analysis.analysisDate || '';
  const dateFormatted = rawDate.includes('-')
    ? rawDate.split('-').reverse().join('/')
    : rawDate;

  // Ensaios e especificações
  const phSpec = pattern ? `${pattern.phMin.toFixed(2)} – ${pattern.phMax.toFixed(2)}` : '5.50 – 7.00';
  const viscSpec = pattern ? `${pattern.viscosityMin.toLocaleString('pt-BR')} – ${pattern.viscosityMax.toLocaleString('pt-BR')} cps` : 'Conforme Padrão';
  const densSpec = pattern ? `${pattern.densityTarget.toFixed(3)} ± ${pattern.densityTolerance.toFixed(3)} g/mL` : '1.000 ± 0.020 g/mL';

  const packagingInfo = pattern ? `${pattern.packageVolume} ${pattern.packageUnit}` : (product?.packaging || 'POTE');

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
            <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml(cfg.defaultAspect || 'Líquido / Emulsão Homogênea')}</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold;">
              ${escapeHtml(organo.aspectDesc || 'CONFORME')}
            </td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">ORGANOLÉPTICO</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; color: ${organo.aspectOk ? '#047857' : '#b91c1c'};">
              ${organo.aspectOk ? 'APROVADO' : 'REPROVADO'}
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid #000000; padding: 4px 6px; font-weight: bold;">COR E ODOR</td>
            <td style="border: 1px solid #000000; padding: 4px 6px;">${escapeHtml(cfg.defaultColorOdor || 'Característico')}</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold;">
              ${escapeHtml(organo.colorOdorDesc || 'CONFORME')}
            </td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">ORGANOLÉPTICO</td>
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center; font-weight: bold; color: ${organo.colorOdorOk ? '#047857' : '#b91c1c'};">
              ${organo.colorOdorOk ? 'APROVADO' : 'REPROVADO'}
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
              ${analysis.viscosityMeasured.toLocaleString('pt-BR')} cps
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
            <td style="border: 1px solid #000000; padding: 4px 6px; text-align: center;">PICNOMETRIA</td>
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
          <div>Volume do Copo Padrão: <strong>${DENSITY_CUP_VOLUME} mL</strong> | Peso da Fração: <strong>${analysis.fractionWeight.toFixed(3)} g</strong></div>
          <div>Peso Alvo na Balança de Envase: <strong>${analysis.envaseTargetWeight} ${analysis.envaseTargetUnit}</strong></div>
        </div>
      </div>

      <!-- Registro de Ajuste (se houver) -->
      ${analysis.hasAdjustment ? `
        <div style="border: 1px solid #000000; padding: 5px 8px; margin-bottom: 6px; font-size: 7.5pt; background: #fffbeb;">
          <strong style="text-transform: uppercase; color: #92400e;">REGISTRO DE AJUSTE CORRETIVO NO LOTE:</strong>
          <div style="margin-top: 2px;">
            Agente Corretivo: <strong>${escapeHtml(agent?.name || analysis.correctiveAgentId || 'Corretivo')}</strong> |
            Visc. Inicial: <strong>${(analysis.initialViscosity || 0).toLocaleString('pt-BR')} cps</strong> |
            Dose Teste em 1L: <strong>${(analysis.trialAgentQty || 0).toFixed(2)} g</strong> |
            Visc. no Teste: <strong>${(analysis.trialViscosity || 0).toLocaleString('pt-BR')} cps</strong> |
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
  }).join('');

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Laudos Físico-Químicos - Impressão</title>
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
          }
          .report-page {
            width: 210mm;
            min-height: 297mm;
            max-height: 297mm;
            page-break-after: always;
            break-after: page;
          }
          @media screen {
            body {
              background: #f4f4f5;
              padding: 20px 0;
            }
            .report-page {
              background: #ffffff;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
              margin-bottom: 20px;
            }
          }
        </style>
      </head>
      <body>
        ${renderedHtmlPages}
      </body>
    </html>
  `);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 350);
}
