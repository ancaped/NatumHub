import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtData,
  largurasColunas,
  linhasPorFolha,
  linhasQueCabem,
  MEDIDAS_FOLHA,
  marcaDaFolha,
  moverItem,
  montarFolhas,
  paraImpressao,
  paraImpressaoRascunho,
  paraImpressaoRevisao,
  rev2,
} from '../../src/modules/qualidade/pops/components/formularios/montagem';
import { areasDoTexto, estadoDoFormulario, payloadDoEditor } from '../../src/modules/qualidade/pops/components/formularios/editor';
import type { Formulario, FormularioDetalhe, RevisaoFormulario } from '../../src/modules/qualidade/pops/components/formularios/tipos';

const form = (o: Partial<Formulario>): Formulario => ({
  code: 'FOR-CQL-012-01', popCode: 'POP-CQL-012', title: 'Calibração', previousCode: '', periodicity: 'Por uso',
  areas: [], fields: [{ label: 'Data', kind: 'data' }], status: 'draft', revision: 0, ...o,
});

const det = (o: Partial<FormularioDetalhe>): FormularioDetalhe => ({ ...form({}), revisoes: [], eventos: [], ...o });

const copia = (revision: number, o: Partial<Formulario> = {}): RevisaoFormulario => ({
  id: `r${revision}`, revision, popCode: 'POP-CQL-012', title: `Rev ${revision}`, orientation: 'portrait', motivo: 'm',
  createdAt: '', temCopia: true, snapshot: form({ title: `Rev ${revision}`, revision, status: 'published', ...o }),
});

test('marca da folha por status', () => {
  assert.equal(marcaDaFolha('draft'), 'rascunho');
  assert.equal(marcaDaFolha('in_review'), 'rascunho');
  assert.equal(marcaDaFolha('obsolete'), 'obsoleto');
  assert.equal(marcaDaFolha('published'), null);
});

test('montarFolhas: uma por área, ou uma em branco', () => {
  assert.deepEqual(montarFolhas([]), [null]);
  assert.deepEqual(montarFolhas(undefined), [null]);
  assert.deepEqual(montarFolhas(['A', ' ', 'B ']), ['A', 'B']);
});

test('impressão oficial: nunca publicado leva marca; nova revisão imprime a vigente; obsoleto marca obsoleto', () => {
  assert.equal(paraImpressao(det({ status: 'draft' })).marca, 'rascunho');
  assert.equal(paraImpressao(det({ status: 'in_review' })).marca, 'rascunho');
  assert.equal(paraImpressao(det({ status: 'published' })).marca, null);

  const emRev = det({ status: 'draft', title: 'Rascunho novo', jaPublicado: true, emRevisao: true, revisoes: [copia(1), copia(0)] });
  const r = paraImpressao(emRev);
  assert.equal(r.marca, null);
  assert.equal(r.form.title, 'Rev 1');
  // a impressão do rascunho da nova revisão leva a marca
  assert.equal(paraImpressaoRascunho(emRev).marca, 'rascunho');
  assert.equal(paraImpressaoRascunho(emRev).form.title, 'Rascunho novo');

  const obs = paraImpressao(det({ status: 'obsolete', revisoes: [copia(0)] }));
  assert.equal(obs.marca, 'obsoleto');
  assert.equal(obs.form.title, 'Rev 0');
});

test('revisão antiga sai como substituída; a vigente sai limpa; sem cópia não imprime', () => {
  const d = det({ status: 'published', revisoes: [copia(1), copia(0), { ...copia(9), temCopia: false, snapshot: null }] });
  assert.equal(paraImpressaoRevisao(d, d.revisoes[0])?.marca, null);
  assert.equal(paraImpressaoRevisao(d, d.revisoes[1])?.marca, 'substituida');
  assert.equal(paraImpressaoRevisao(d, d.revisoes[2]), null);
  const obs = { ...d, status: 'obsolete' };
  assert.equal(paraImpressaoRevisao(obs, obs.revisoes[0])?.marca, 'obsoleto');
});

test('linhas por folha: valor do formulário ou padrão da orientação', () => {
  assert.equal(linhasPorFolha({ orientation: 'portrait', rowsPerSheet: null }), linhasQueCabem(false, false));
  assert.equal(linhasPorFolha({ orientation: 'landscape', limits: 'x' }), linhasQueCabem(true, true));
  assert.equal(linhasPorFolha({ orientation: 'landscape', rowsPerSheet: 20 }), 20);
});

test('linhasQueCabem: conta da altura útil, retrato e paisagem, com e sem faixa de limites', () => {
  const m = MEDIDAS_FOLHA;
  const fixo = 2 * m.margem + m.borda + m.cabecalho + m.mesArea + m.cabecalhoTabela + m.rodape;
  const esperado = (h: number, lim: boolean) => Math.floor((h - fixo - (lim ? m.limites : 0)) / m.linha);
  assert.equal(linhasQueCabem(false, false), esperado(m.alturaRetrato, false));
  assert.equal(linhasQueCabem(false, true), esperado(m.alturaRetrato, true));
  assert.equal(linhasQueCabem(true, false), esperado(m.alturaPaisagem, false));
  assert.equal(linhasQueCabem(true, true), esperado(m.alturaPaisagem, true));
  assert.ok(linhasQueCabem(false, false) > linhasQueCabem(true, false));
  assert.ok(linhasQueCabem(false, false) >= linhasQueCabem(false, true));
});

test('largurasColunas somam 100 e texto é mais largo que sim_nao', () => {
  const l = largurasColunas(['data', 'texto', 'sim_nao']);
  assert.ok(Math.abs(l.reduce((a, b) => a + b, 0) - 100) < 1e-9);
  assert.ok(l[1] > l[2]);
});

test('editor: áreas uma por linha, colunas aparadas, 0 volta ao padrão', () => {
  assert.deepEqual(areasDoTexto(' A \n\nB\n'), ['A', 'B']);
  const e = estadoDoFormulario(form({ areas: ['X'], limits: 'pH 5', rowsPerSheet: 27 }));
  assert.equal(e.rowsPerSheet, '27');
  const p = payloadDoEditor({ ...e, popCode: ' pop-cql-012 ', rowsPerSheet: '', columns: [{ label: ' Data ', kind: 'data', limit: ' ' }] });
  assert.equal(p.popCode, 'POP-CQL-012');
  assert.equal(p.rowsPerSheet, 0);
  assert.deepEqual(p.columns, [{ label: 'Data', kind: 'data', limit: null }]);
});

test('moverItem e formatadores', () => {
  assert.deepEqual(moverItem([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moverItem([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.equal(fmtData('2026-10-30'), '30/10/2026');
  assert.equal(rev2(3), '03');
});
