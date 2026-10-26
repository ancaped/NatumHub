import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProductUnitWeightKg, unidadesParaKg, unidadesDeKg, formatUnitsToKg, ehBaseProduto } from '../../src/modules/producao/lib/unitConversion';

test('parseProductUnitWeightKg: ML, KG com vírgula, G com espaço, L', () => {
  assert.equal(parseProductUnitWeightKg('SHAMPOO X 500ML'), 0.5);
  assert.equal(parseProductUnitWeightKg('MASCARA 1,5KG'), 1.5);
  assert.equal(parseProductUnitWeightKg('POMADA 250 G'), 0.25);
  assert.equal(parseProductUnitWeightKg('BASE 1L'), 1);
});

test('parseProductUnitWeightKg: sem medida, vazio ou zero é desconhecido (null), nunca 1', () => {
  assert.equal(parseProductUnitWeightKg('PRODUTO SEM MEDIDA'), null);
  assert.equal(parseProductUnitWeightKg(undefined), null);
  assert.equal(parseProductUnitWeightKg('SHAMPOO 0ML'), null);
});

test('conversões com peso desconhecido não calculam', () => {
  assert.equal(unidadesParaKg(10, 'SHAMPOO 500ML'), 5);
  assert.equal(unidadesDeKg(5, 'SHAMPOO 500ML'), 10);
  assert.equal(unidadesParaKg(10, 'KIT PRESENTE'), null);
  assert.equal(unidadesDeKg(5, 'KIT PRESENTE'), null);
  assert.equal(formatUnitsToKg(10, 'KIT PRESENTE'), '— kg');
});

test('base vale 1 kg por unidade, mesmo sem medida na descrição', () => {
  assert.equal(parseProductUnitWeightKg('BASE SHAMPOO PEROLADO NH 11', true), 1);
  assert.equal(unidadesParaKg(40, 'BASE SHAMPOO PEROLADO NH 11', true), 40);
  assert.equal(unidadesDeKg(40, 'BASE SHAMPOO PEROLADO NH 11', true), 40);
  assert.equal(ehBaseProduto({ codigo: '1.36.001', descricao: 'X' }), true);
  assert.equal(ehBaseProduto({ codigo: '5.1', descricao: 'BASE SHAMPOO PEROLADO NH 11' }), true);
  assert.equal(ehBaseProduto({ codigo: '5.1', descricao: 'KIT', categoria_produto: 'cat_base' }), true);
  assert.equal(ehBaseProduto({ codigo: '5.1', descricao: 'SHAMPOO 500ML' }), false);
});
