import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProductUnitWeightKg } from '../../src/modules/producao/lib/unitConversion';

test('parseProductUnitWeightKg: ML, KG com vírgula, G com espaço, L', () => {
  assert.equal(parseProductUnitWeightKg('SHAMPOO X 500ML'), 0.5);
  assert.equal(parseProductUnitWeightKg('MASCARA 1,5KG'), 1.5);
  assert.equal(parseProductUnitWeightKg('POMADA 250 G'), 0.25);
  assert.equal(parseProductUnitWeightKg('BASE 1L'), 1);
});

test('parseProductUnitWeightKg: sem medida, vazio ou zero vale 1', () => {
  assert.equal(parseProductUnitWeightKg('PRODUTO SEM MEDIDA'), 1);
  assert.equal(parseProductUnitWeightKg(undefined), 1);
  assert.equal(parseProductUnitWeightKg('SHAMPOO 0ML'), 1);
});
