import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarReatoresPorCaber, diasPermitidos } from '../../src/modules/producao/lib/heuristicaPlanejamento';

const r = (id: string, capacidade_kg: number) => ({ id, capacidade_kg });
const ids = (l: { id: string }[]) => l.map(x => x.id);

test('ordenarReatoresPorCaber: cabem do menor ao maior, depois os que não cabem do maior ao menor', () => {
  const lista = [r('a', 1000), r('b', 40), r('c', 200), r('d', 500), r('e', 100)];
  assert.deepEqual(ids(ordenarReatoresPorCaber(lista, 150)), ['c', 'd', 'a', 'e', 'b']);
});

test('ordenarReatoresPorCaber: capacidade igual à massa conta como cabe', () => {
  const lista = [r('a', 500), r('b', 200)];
  assert.deepEqual(ids(ordenarReatoresPorCaber(lista, 200)), ['b', 'a']);
});

test('ordenarReatoresPorCaber: empate mantém a ordem original', () => {
  const lista = [r('x', 200), r('y', 200), r('z', 200)];
  assert.deepEqual(ids(ordenarReatoresPorCaber(lista, 100)), ['x', 'y', 'z']);
});

test('ordenarReatoresPorCaber: nenhum cabe, do maior ao menor', () => {
  const lista = [r('a', 40), r('b', 200), r('c', 100)];
  assert.deepEqual(ids(ordenarReatoresPorCaber(lista, 5000)), ['b', 'c', 'a']);
});

test('ordenarReatoresPorCaber: lista vazia', () => {
  assert.deepEqual(ordenarReatoresPorCaber([], 100), []);
});

const dias = [{ dateStr: '2026-10-26' }, { dateStr: '2026-10-27' }, { dateStr: '2026-10-28' }];

test('diasPermitidos: produto comum só evita dia exclusivo', () => {
  const out = diasPermitidos(dias, false, new Set(['2026-10-26']), new Set(['2026-10-27']));
  assert.deepEqual(out.map(d => d.dateStr), ['2026-10-26', '2026-10-28']);
});

test('diasPermitidos: produto exclusivo só entra em dia livre', () => {
  const out = diasPermitidos(dias, true, new Set(['2026-10-26']), new Set(['2026-10-27']));
  assert.deepEqual(out.map(d => d.dateStr), ['2026-10-28']);
});

test('diasPermitidos: ninguém entra em dia exclusivo', () => {
  const todos = new Set(dias.map(d => d.dateStr));
  assert.deepEqual(diasPermitidos(dias, false, new Set(), todos), []);
  assert.deepEqual(diasPermitidos(dias, true, new Set(), todos), []);
});
