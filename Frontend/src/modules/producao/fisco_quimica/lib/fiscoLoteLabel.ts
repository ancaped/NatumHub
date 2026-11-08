import type { LabelTemplate } from '../../../ferramentas/etiquetas/lib/types';
import { preencherModelo } from '../../../ferramentas/etiquetas/lib/modelos';
import type { FiscoQuimicaAnalysis, FiscoQuimicaPattern, ProcItem } from '../../../geral/lib/types';
import { calculateFillingTargets, parsePackageFromProductName, isAnalysisInCorrection } from './fiscoUtils';

export interface FiscoLoteBulk {
  qtyKg: number;
  unidades: number;
  /** Unidades por caixa no cadastro do produto (ERP nQtdeCx). */
  qtdeCx?: number;
  date?: string;
}

function formatDateBr(raw?: string | null): string {
  const clean = String(raw || '').trim().split(' ')[0].split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length !== 3) return clean;
  if (parts[0].length === 4) {
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  if (parts[2].length === 4) {
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
  }
  return clean;
}

function formatQty(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const digits = Math.abs(rounded - Math.round(rounded)) < 0.05 ? 0 : 1;
  return rounded.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function bulkUnit(productName: string, pattern: FiscoQuimicaPattern | null): 'L' | 'kg' {
  const unit = (pattern?.packageUnit || '').trim().toLowerCase();
  if (unit === 'g' || unit === 'kg') return 'kg';
  if (unit === 'ml' || unit === 'l') return 'L';
  const parsed = parsePackageFromProductName(productName);
  if (parsed?.unit === 'g' || parsed?.unit === 'kg') return 'kg';
  return 'L';
}

/** Unidades do lote pela embalagem (kg do lote ÷ conteúdo da unidade); 0 se não der para saber. */
function unidadesPelaEmbalagem(productName: string, pattern: FiscoQuimicaPattern | null, qtyKg: number): number {
  if (qtyKg <= 0) return 0;
  const patVol = Number(pattern?.packageVolume) || 0;
  const pkg = patVol > 0 && pattern?.packageUnit
    ? { volume: patVol, unit: String(pattern.packageUnit) }
    : parsePackageFromProductName(productName);
  if (!pkg) return 0;
  const u = pkg.unit.toLowerCase();
  const kgPorUnidade = u === 'ml' || u === 'g' ? pkg.volume / 1000 : u === 'l' || u === 'kg' ? pkg.volume : 0;
  return kgPorUnidade > 0 ? Math.round(qtyKg / kgPorUnidade) : 0;
}

/** Volume do lote no formato do ERP: "200,00 L (Aproximadamente 200 unidades ou 33 caixas)". */
export function buildFiscoVolumeLine(
  productName: string,
  pattern: FiscoQuimicaPattern | null,
  bulk?: FiscoLoteBulk | null,
): string {
  const qty = Number(bulk?.qtyKg) || 0;
  let unidades = Math.round(Number(bulk?.unidades) || 0);
  // o ERP deixa 1 (ou 0) em "unidades" até lançar as reais: nesse caso estima pela embalagem
  if (unidades <= 1) unidades = Math.max(unidades, unidadesPelaEmbalagem(productName, pattern, qty));
  const perBox = Math.round(Number(bulk?.qtdeCx) || 0);
  if (qty <= 0 && unidades <= 0) return '';

  const unit = bulkUnit(productName, pattern);
  const amount = qty > 0
    ? qty.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
  const boxes = perBox > 0 && unidades > 0 ? Math.round(unidades / perBox) : 0;
  const unitsTxt = unidades > 0 ? unidades.toLocaleString('pt-BR') : '';
  const boxesTxt = boxes > 0
    ? `${boxes.toLocaleString('pt-BR')} ${boxes === 1 ? 'caixa' : 'caixas'}`
    : '';
  const approx = unitsTxt && boxesTxt
    ? `Aproximadamente ${unitsTxt} unidades ou ${boxesTxt}`
    : unitsTxt
      ? `Aproximadamente ${unitsTxt} unidades`
      : '';

  if (amount && approx) return `${amount} ${unit} (${approx})`;
  if (amount) return `${amount} ${unit}`;
  return approx;
}

function envaseLine(analysis: FiscoQuimicaAnalysis, pattern: FiscoQuimicaPattern | null): string {
  if (analysis.envaseTargetWeight > 0) {
    return `Envase: ${formatQty(analysis.envaseTargetWeight)} ${analysis.envaseTargetUnit || 'g'}`;
  }
  const filling = calculateFillingTargets(pattern, analysis.densityMeasured, analysis.productName);
  if (filling.weight.value > 0) {
    return `Envase: ${formatQty(filling.weight.value)} ${filling.weight.unit}`;
  }
  return '';
}

function procLine(item: ProcItem | null): string {
  const proc = (item?.proc || '').trim();
  if (!proc || item?.status === 'EM_BRANCO') return '';
  return `PROC: ${proc}`;
}

export interface FiscoLoteLabelFields {
  name: string;
  code: string;
  batch: string;
  volume: string;
  envase: string;
  proc: string;
  status: string;
  date: string;
  approved: boolean;
}

export function describeFiscoLoteLabel(input: {
  analysis: FiscoQuimicaAnalysis;
  pattern: FiscoQuimicaPattern | null;
  procItem: ProcItem | null;
  approved: boolean;
  bulk?: FiscoLoteBulk | null;
}): FiscoLoteLabelFields {
  const { analysis, pattern, procItem, approved } = input;
  const name = (analysis.productName || '').trim();
  return {
    name,
    code: (analysis.productCode || '').trim(),
    batch: (analysis.batch || '').trim(),
    volume: buildFiscoVolumeLine(name, pattern, input.bulk),
    envase: envaseLine(analysis, pattern),
    proc: procLine(procItem),
    status: isAnalysisInCorrection(analysis) ? 'EM CORREÇÃO' : (approved ? 'APROVADO' : 'FORA PADRÃO'),
    date: formatDateBr(input.bulk?.date || analysis.analysisDate),
    approved,
  };
}

/** Etiqueta de lote: o modelo registrado `fisco_lote` (Etiquetas) preenchido com os dados do laudo. */
export function preencherEtiquetaFisco(
  modelo: LabelTemplate,
  input: {
    analysis: FiscoQuimicaAnalysis;
    pattern: FiscoQuimicaPattern | null;
    procItem: ProcItem | null;
    approved: boolean;
    bulk?: FiscoLoteBulk | null;
  },
): LabelTemplate {
  const f = describeFiscoLoteLabel(input);
  const preenchido = preencherModelo(modelo, {
    product_name: f.name,
    volume_line: f.volume,
    date: f.date,
    product_code: f.code,
    status: f.status,
    proc: f.proc,
    envase: f.envase,
    lot: f.batch,
  });
  // aprovado = selo preto; fora do padrão / em correção = selo vazado
  return {
    ...preenchido,
    id: `fisco_lote_${input.analysis.id || f.batch}`,
    name: modelo.name,
    elements_json: preenchido.elements_json.map((el) =>
      el.type === 'badge' && el.id === 'status' ? { ...el, props: { ...el.props, variant: f.approved ? 'black' : 'outline' } } : el,
    ),
  };
}
