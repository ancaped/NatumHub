import type { FormCampo, Formulario } from './tipos';

/** Campos do editor do rascunho, como texto de formulário (áreas uma por linha, linhas por folha em texto). */
export interface EstadoEditor {
  title: string;
  popCode: string;
  periodicity: string;
  orientation: string;
  areasTexto: string;
  limits: string;
  columns: FormCampo[];
  rowsPerSheet: string;
}

export function estadoDoFormulario(f: Formulario): EstadoEditor {
  return {
    title: f.title,
    popCode: f.popCode,
    periodicity: f.periodicity,
    orientation: f.orientation === 'landscape' ? 'landscape' : 'portrait',
    areasTexto: f.areas.join('\n'),
    limits: f.limits ?? '',
    columns: f.fields.map((c) => ({ label: c.label, kind: c.kind, limit: c.limit ?? '' })),
    rowsPerSheet: f.rowsPerSheet ? String(f.rowsPerSheet) : '',
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
    columns: e.columns.map((c) => ({ label: c.label.trim(), kind: c.kind, limit: (c.limit ?? '').trim() || null })),
    rowsPerSheet: Number.isFinite(linhas) && linhas > 0 ? linhas : 0,
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
    fields: p.columns.filter((c) => c.label !== ''),
    rowsPerSheet: p.rowsPerSheet || null,
  };
}

export function editorMudou(f: Formulario, e: EstadoEditor): boolean {
  return JSON.stringify(payloadDoEditor(estadoDoFormulario(f))) !== JSON.stringify(payloadDoEditor(e));
}
