import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProductProcessType, previsaoEnvase, getProductColorInfo } from '../../src/modules/producao/lib/processoProduto';

test('shampoo é processo a frio', () => {
  const r = getProductProcessType({ descricao: 'SHAMPOO LISO 500ML', producao_recomendada: 100 });
  assert.equal(r.isQuente, false);
  assert.equal(r.isShampoo, true);
  assert.equal(r.label, 'A Frio (Shampoo)');
  assert.equal(r.reqQtyKg, 50);
});

test('máscara é quente; bombona só abaixo de 200 kg', () => {
  const pequena = getProductProcessType({ descricao: 'MASCARA HIDRATANTE 1KG', producao_recomendada: 150 });
  assert.equal(pequena.isQuente, true);
  assert.equal(pequena.canBombona, true);
  assert.equal(pequena.recipienteSugerido, 'BOMBONAS');
  const grande = getProductProcessType({ descricao: 'MASCARA HIDRATANTE 1KG', producao_recomendada: 200 });
  assert.equal(grande.isQuente, true);
  assert.equal(grande.canBombona, false);
  assert.equal(grande.label, 'Caldeira');
});

test('base de shampoo é a frio', () => {
  const r = getProductProcessType({ descricao: 'BASE SHAMPOO NEUTRO', categoria_produto: 'cat_base' });
  assert.equal(r.isQuente, false);
  assert.equal(r.isShampoo, true);
  assert.equal(r.label, 'Base Frio');
  assert.equal(r.recipienteSugerido, 'R_1000_SHAMPOO');
});

test('processo_termico do produto sobrepõe o automático e marca o rótulo', () => {
  const p = { descricao: 'SHAMPOO LISO 500ML', producao_recomendada: 100 };
  const quente = getProductProcessType({ ...p, processo_termico: 'quente' });
  assert.equal(quente.isQuente, true);
  assert.equal(quente.label, 'A Frio (Shampoo) (definido no produto)');
  assert.match(quente.motivo, /a quente \(definido no produto\)/);
  const m = { descricao: 'MASCARA HIDRATANTE 1KG', producao_recomendada: 150 };
  const frio = getProductProcessType({ ...m, processo_termico: 'frio' });
  assert.equal(frio.isQuente, false);
  assert.ok(frio.label.includes('(definido no produto)'));
});

test('permite_bombona false força canBombona=false', () => {
  const r = getProductProcessType({ descricao: 'MASCARA HIDRATANTE 1KG', producao_recomendada: 150, permite_bombona: false });
  assert.equal(r.canBombona, false);
  assert.equal(r.isQuente, true);
  assert.equal(r.label, 'Bombona (Água Caldeira)');
});

test('sem override o resultado é o automático', () => {
  const p = { descricao: 'MASCARA HIDRATANTE 1KG', producao_recomendada: 150 };
  assert.deepEqual(
    getProductProcessType({ ...p, processo_termico: null, permite_bombona: null }),
    getProductProcessType(p),
  );
  assert.equal(getProductProcessType(p).canBombona, true);
});

test('previsaoEnvase soma dias corridos e vira o mês', () => {
  assert.equal(previsaoEnvase('2026-10-24', 3), '27/10');
  assert.equal(previsaoEnvase('2026-10-30', 3), '02/11');
  assert.equal(previsaoEnvase('2026-10-24T10:00:00', 0), '24/10');
  assert.equal(previsaoEnvase('', 3), '');
});

test('getProductColorInfo: neutro por padrão e vermelho por último', () => {
  assert.equal(getProductColorInfo({ descricao: 'SHAMPOO LISO' }).tag, 'neutro');
  const red = getProductColorInfo({ descricao: 'MASCARA MARSALA' });
  assert.equal(red.tag, 'red');
  assert.equal(red.orderPriority, 4);
});
