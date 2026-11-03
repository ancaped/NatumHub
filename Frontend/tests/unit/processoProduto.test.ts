import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProductProcessType, previsaoEnvase, getProductColorInfo, LIMITE_BOMBONA_QUENTE_KG, ehBombona, menorBombonaQueCabe, resolverRecipienteSugerido, getShortReatorName } from '../../src/modules/producao/lib/processoProduto';

test('shampoo é processo a frio', () => {
  const r = getProductProcessType({ descricao: 'SHAMPOO LISO 500ML', producao_recomendada: 100 });
  assert.equal(r.isQuente, false);
  assert.equal(r.isShampoo, true);
  assert.equal(r.label, 'A Frio (Shampoo)');
  assert.equal(r.reqQtyKg, 50);
});

test('máscara é quente; bombona só até 150 kg', () => {
  const pequena = getProductProcessType({ descricao: 'MASCARA HIDRATANTE 1KG', producao_recomendada: 150 });
  assert.equal(pequena.isQuente, true);
  assert.equal(pequena.canBombona, true);
  assert.equal(pequena.recipienteSugerido, 'BOMBONAS');
  const grande = getProductProcessType({ descricao: 'MASCARA HIDRATANTE 1KG', producao_recomendada: 160 });
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

test('limite da bombona quente é 150 kg (a frio segue 200)', () => {
  assert.equal(LIMITE_BOMBONA_QUENTE_KG, 150);
  const limite = getProductProcessType({ descricao: 'MASCARA HIDRATANTE 1KG', producao_recomendada: 150 });
  assert.equal(limite.canBombona, true);
  const acima = getProductProcessType({ descricao: 'MASCARA HIDRATANTE 1KG', producao_recomendada: 151 });
  assert.equal(acima.canBombona, false);
  const frio = getProductProcessType({ descricao: 'SHAMPOO LISO 1KG', producao_recomendada: 200 });
  assert.equal(frio.canBombona, true);
});

const reat = (id: string, nome: string, cap: number, tipo: string, ativo = true) => ({ id, nome, capacidade_kg: cap, tipo, ordem: 1, ativo });
const BOMBONAS = [
  reat('BOMBONA_200', 'Bombona 200kg', 200, 'bombona'),
  reat('BOMBONAS', 'Bombona 50kg', 50, 'bombona'),
  reat('BOMBONA_100', 'Bombona 100kg', 100, 'bombona'),
  reat('R_500', 'Reator 500kg', 500, 'caldeira'),
];

test('bombona: cada tamanho é um reator; a sugestão é a menor que comporta a massa', () => {
  assert.equal(ehBombona(BOMBONAS[2]), true);
  assert.equal(ehBombona(BOMBONAS[3]), false);
  assert.equal(menorBombonaQueCabe(BOMBONAS, 40)?.id, 'BOMBONAS');
  assert.equal(menorBombonaQueCabe(BOMBONAS, 80)?.id, 'BOMBONA_100');
  assert.equal(menorBombonaQueCabe(BOMBONAS, 150)?.id, 'BOMBONA_200');
  assert.equal(menorBombonaQueCabe(BOMBONAS, 250), null);
  assert.equal(menorBombonaQueCabe([{ ...BOMBONAS[1], ativo: false }], 10), null);
  assert.equal(resolverRecipienteSugerido('BOMBONAS', BOMBONAS, 80), 'BOMBONA_100');
  assert.equal(resolverRecipienteSugerido('R_500', BOMBONAS, 80), 'R_500');
});

test('nome curto da bombona é o nome do reator', () => {
  assert.equal(getShortReatorName('BOMBONA_100', 'Reator', BOMBONAS), 'Bombona 100kg');
});
