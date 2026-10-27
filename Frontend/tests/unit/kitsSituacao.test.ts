import { test } from 'node:test';
import assert from 'node:assert/strict';
import { situacaoKit, situacaoComponente, componenteLimitante } from '../../src/modules/producao/lib/kitsSituacao';

test('situacaoKit: sem falta é ok, mesmo sem poder montar', () => {
  assert.equal(situacaoKit(0, 0), 'ok');
  assert.equal(situacaoKit(0, 40), 'ok');
  assert.equal(situacaoKit(-3, 0), 'ok');
});

test('situacaoKit: com falta e dá para montar, é montar agora', () => {
  assert.equal(situacaoKit(10, 1), 'montar_agora');
  assert.equal(situacaoKit(10, 500), 'montar_agora');
});

test('situacaoKit: com falta e nada para montar, falta componente', () => {
  assert.equal(situacaoKit(10, 0), 'falta_componente');
  assert.equal(situacaoKit(10, -2), 'falta_componente');
});

test('situacaoComponente: zerado, parcial e cobre', () => {
  assert.equal(situacaoComponente(0, 10), 'zerado');
  assert.equal(situacaoComponente(4, 10), 'parcial');
  assert.equal(situacaoComponente(10, 10), 'cobre');
  assert.equal(situacaoComponente(5, 0), 'cobre');
});

test('componenteLimitante: o de menor kits_cobertos; vazio devolve null', () => {
  const l = componenteLimitante([{ kits_cobertos: 30 }, { kits_cobertos: 2 }, { kits_cobertos: 2 }, { kits_cobertos: 9 }]);
  assert.equal(l?.kits_cobertos, 2);
  assert.equal(componenteLimitante([]), null);
});
