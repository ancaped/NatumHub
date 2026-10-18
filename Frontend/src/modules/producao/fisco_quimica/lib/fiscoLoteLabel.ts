import type { LabelElement, LabelTemplate } from '../../../ferramentas/etiquetas/lib/types';
import type { FiscoQuimicaAnalysis, FiscoQuimicaPattern, ProcItem } from '../../../geral/lib/types';
import { calculateFillingTargets, parsePackageFromProductName, isAnalysisInCorrection } from './fiscoUtils';

export interface FiscoLoteBulk {
  qtyKg: number;
  unidades: number;
  /** Unidades por caixa no cadastro do produto (ERP nQtdeCx). */
  qtdeCx?: number;
  date?: string;
}

function textEl(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  fontSize: number,
  align: 'left' | 'center' | 'right',
  weight: '500' | '600' | 'bold' | '800' = 'bold',
  uppercase = false,
): LabelElement {
  return {
    id,
    type: 'text',
    x_mm: x,
    y_mm: y,
    width_mm: w,
    height_mm: h,
    zIndex: 2,
    props: {
      text,
      fontSize,
      fontWeight: weight,
      fontFamily: 'Inter',
      textAlign: align,
      color: '#000000',
      uppercase,
      multiline: true,
    },
  };
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

/** Volume do lote no formato do ERP: "200,00 L (Aproximadamente 200 unidades ou 33 caixas)". */
export function buildFiscoVolumeLine(
  productName: string,
  pattern: FiscoQuimicaPattern | null,
  bulk?: FiscoLoteBulk | null,
): string {
  const qty = Number(bulk?.qtyKg) || 0;
  const unidades = Math.round(Number(bulk?.unidades) || 0);
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

const MM_PER_PT = 0.3528;

function estimateLines(text: string, fontPt: number, widthMm: number): number {
  const charMm = fontPt * MM_PER_PT * 0.66;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const wordMm = Math.max(charMm, word.length * charMm);
    const gap = used > 0 ? charMm * 0.34 : 0;
    if (used > 0 && used + gap + wordMm > widthMm) {
      lines += 1;
      used = wordMm;
    } else {
      used += gap + wordMm;
    }
  }
  return lines;
}

function fitName(text: string, widthMm: number, maxHeightMm: number): { font: number; height: number } {
  let font = 12;
  while (font >= 7.5) {
    const lines = estimateLines(text, font, widthMm);
    const height = lines * font * 1.2 * MM_PER_PT + 0.5;
    if (height <= maxHeightMm) return { font, height: Math.max(5, height) };
    font -= 0.5;
  }
  return { font: 7.5, height: maxHeightMm };
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

export function buildFiscoLoteLabel(input: {
  analysis: FiscoQuimicaAnalysis;
  pattern: FiscoQuimicaPattern | null;
  procItem: ProcItem | null;
  approved: boolean;
  bulk?: FiscoLoteBulk | null;
}): LabelTemplate {
  const fields = describeFiscoLoteLabel(input);
  const { name, code, batch, volume, envase, proc, status, date, approved } = fields;
  const side = 3.4;
  const inner = 100 - side * 2;
  const nameY = 1.2;
  const volumeFont = 8;
  const volumeH = volume
    ? Math.max(4.2, estimateLines(volume, volumeFont, inner) * volumeFont * 1.15 * MM_PER_PT + 0.5)
    : 0;
  const fitted = fitName(name || '—', inner, volume ? 13.6 : 18);
  const volumeY = nameY + fitted.height + 0.2;
  const bodyY = volume ? volumeY + volumeH + 0.4 : nameY + fitted.height + 0.6;
  const loteY = 42.4;
  const bodyH = Math.max(14, Math.min(18.2, loteY - 0.6 - bodyY));

  const elements: LabelElement[] = [
    textEl('name', side, nameY, inner, fitted.height, name || '—', fitted.font, 'center', '800', true),
  ];

  if (volume) {
    elements.push(textEl('volume', side, volumeY, inner, volumeH, volume, volumeFont, 'center', 'bold'));
  }

  const boxX = side + 31;
  const boxW = inner - 31;
  const colW = 29;
  const colStack = 15.2;
  const colY = bodyY + Math.max(0, (bodyH - colStack) / 2);
  elements.push(
    textEl('date_lbl', side, colY, colW, 3.2, 'DATA LOTE', 8, 'center', '800'),
    textEl('date', side, colY + 3, colW, 4.2, date || '—', 11, 'center', '800'),
    textEl('code_lbl', side, colY + 7.4, colW, 3.2, 'CÓD.PROD.', 8, 'center', '800'),
    textEl('code', side, colY + 10.4, colW, 4.8, code || '—', 12, 'center', '800'),
    {
      id: 'cq_box',
      type: 'box',
      x_mm: boxX,
      y_mm: bodyY,
      width_mm: boxW,
      height_mm: bodyH,
      zIndex: 2,
      props: { borderWidth: 0.45, borderColor: '#000000', backgroundColor: 'transparent', borderRadius: 0.6 },
    },
  );

  const badgeH = 5.4;
  const procH = proc ? 3.8 : 0;
  const envaseH = envase ? 4.2 : 0;
  const stackH = badgeH + procH + envaseH;
  const badgeW = Math.min(boxW - 4, status.length > 10 ? 40 : 34);
  let cursor = bodyY + Math.max(0.6, (bodyH - stackH) / 2);
  elements.push({
    id: 'status',
    type: 'badge',
    x_mm: boxX + (boxW - badgeW) / 2,
    y_mm: cursor,
    width_mm: badgeW,
    height_mm: 5.4,
    zIndex: 3,
    props: {
      text: status,
      variant: approved ? 'black' : 'outline',
      fontSize: 10,
      fontWeight: '800',
      uppercase: true,
      borderRadius: 0.6,
    },
  });
  cursor += 5.8;
  if (proc) {
    elements.push(textEl('proc', boxX + 1.2, cursor, boxW - 2.4, 3.6, proc, 8, 'center', '800'));
    cursor += 3.6;
  }
  if (envase && cursor + 4.2 <= bodyY + bodyH - 0.3) {
    elements.push(textEl('envase', boxX + 1.2, cursor, boxW - 2.4, 4.2, envase, 10.5, 'center', '800'));
  }

  elements.push(
    textEl('lote', side, loteY, inner, 6.6, `Nº Lote: ${batch || '—'}`, 15, 'center', '800'),
  );

  return {
    id: `fisco_lote_${input.analysis.id || batch}`,
    name: `Lote ${batch}`,
    category: 'custom',
    width_mm: 100,
    height_mm: 50,
    orientation: 'landscape',
    elements_json: elements,
  };
}
