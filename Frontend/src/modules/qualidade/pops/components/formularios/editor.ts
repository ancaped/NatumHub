import type { FormCampo, Formulario } from './tipos';

/** Campos do editor do rascunho, como texto de formulário (áreas uma por linha, linhas por folha em texto). */
export interface EstadoEditor {
  title: string;
  popCode: string;
  periodicity: string;
  orientation: string;
  areasTexto: string;
  limits: string;
  specifications: string;
  columns: FormCampo[];
  rowsPerSheet: string;
  showArea: boolean;
  showEquip: boolean;
}

export function estadoDoFormulario(f: Formulario): EstadoEditor {
  return {
    title: f.title,
    popCode: f.popCode,
    periodicity: f.periodicity,
    orientation: f.orientation === 'landscape' ? 'landscape' : 'portrait',
    areasTexto: f.areas.join('\n'),
    limits: f.limits ?? '',
    specifications: f.specifications ?? '',
    columns: f.fields.map((c) => ({ label: c.label, kind: c.kind, limit: c.limit ?? '', width: c.width ?? null })),
    rowsPerSheet: f.rowsPerSheet ? String(f.rowsPerSheet) : '',
    showArea: f.layout?.showArea !== false,
    showEquip: f.layout?.showEquip !== false,
  };
}

export function areasDoTexto(texto: string): string[] {
  return texto.split('\n').map((a) => a.trim()).filter((a) => a !== '');
}

/** Corpo do `PUT /qualidade/pops/formularios/:code`. */
export function payloadDoEditor(e: EstadoEditor) {
  const linhas = Number.parseInt(e.rowsPerSheet, 10);
  return {
    title: e.title.trim(),
    popCode: e.popCode.trim().toUpperCase(),
    periodicity: e.periodicity.trim(),
    orientation: e.orientation,
    areas: areasDoTexto(e.areasTexto),
    limits: e.limits.trim(),
    specifications: e.specifications.trim(),
    columns: e.columns.map((c) => ({ label: c.label.trim(), kind: c.kind, limit: (c.limit ?? '').trim() || null, width: c.width ?? null })),
    rowsPerSheet: Number.isFinite(linhas) && linhas > 0 ? linhas : 0,
    layout: { showArea: e.showArea, showEquip: e.showEquip },
  };
}

/** O formulário como ficaria com o editor aplicado (prévia da folha enquanto edita). */
export function aplicarEditor(f: Formulario, e: EstadoEditor): Formulario {
  const p = payloadDoEditor(e);
  return {
    ...f,
    title: p.title || f.title,
    popCode: p.popCode || f.popCode,
    periodicity: p.periodicity || f.periodicity,
    orientation: p.orientation,
    areas: p.areas,
    limits: p.limits || null,
    specifications: p.specifications || null,
    fields: p.columns.filter((c) => c.label !== ''),
    rowsPerSheet: p.rowsPerSheet || null,
    layout: p.layout,
  };
}

export function editorMudou(f: Formulario, e: EstadoEditor): boolean {
  return JSON.stringify(payloadDoEditor(estadoDoFormulario(f))) !== JSON.stringify(payloadDoEditor(e));
}
