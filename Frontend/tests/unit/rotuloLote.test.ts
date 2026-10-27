import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarLotesUnicos, ehLotePlanejado, rotuloLote, textoUnidadesLote } from '../../src/modules/administrativo/acompanhamento_producao/lib/rotuloLote';

test('rotuloLote: lote do ERP vira #número e id de plano vira "Planejado"', () => {
  assert.equal(rotuloLote('15869'), '#15869');
  assert.equal(rotuloLote(' 15869 '), '#15869');
  assert.equal(rotuloLote('PLAN_2026-W43_BOMBONAS_2026-10-23_1.11.066_1792176297192_0'), 'Planejado');
  assert.equal(rotuloLote('pl-12'), 'Planejado');
  assert.equal(rotuloLote(''), '—');
  assert.equal(ehLotePlanejado('PLAN_x'), true);
  assert.equal(ehLotePlanejado('PLANTA1'), false);
});

test('textoUnidadesLote: aproximado quando há quantidade, nulo quando o peso é desconhecido', () => {
  assert.deepEqual(textoUnidadesLote({ quantity: 34 }), { n: '34', aprox: true });
  assert.equal(textoUnidadesLote({ quantity: 0, pesoDesconhecido: true }), null);
  assert.deepEqual(textoUnidadesLote({ quantity: 0 }), { n: '0', aprox: false });
});

test('contarLotesUnicos: OP com vários produtos conta uma vez e ordem só planejada não conta', () => {
  const lista = [{ loteNumber: '100' }, { loteNumber: '100' }, { loteNumber: '101' }, { loteNumber: 'PLAN_2026-W43_X_0' }, { loteNumber: '' }];
  assert.equal(contarLotesUnicos(lista), 2);
});
