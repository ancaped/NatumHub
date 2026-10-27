import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ehEmbalagem, necessidade, limitante, situacao, vendaAvulsaMensal, statusComponente,
  porKitRotulo, componentesAProduzir, duracaoValida, type KitResumo,
} from '../../src/modules/producao/lib/kitsSituacao';

const kit = (over: Partial<KitResumo> = {}): KitResumo => ({
  codigo: 'K1', descricao: 'KIT TESTE', nome_linha: 'Linha A', media_vendas: 10,
  producao_recomendada: 0, estoque_futuro_com_producao: 5, max_montavel_estoque: 0,
  componentes: [], ...over,
});

test('embalagem é código que começa com 9.', () => {
  assert.equal(ehEmbalagem('9.1.2'), true);
  assert.equal(ehEmbalagem('1.9.2'), false);
});

test('necessidade: maior entre sugestão e rombo do EFP', () => {
  assert.equal(necessidade(kit()), 0);
  assert.equal(necessidade(kit({ producao_recomendada: 30 })), 30);
  assert.equal(necessidade(kit({ producao_recomendada: 10, estoque_futuro_com_producao: -50 })), 50);
});

test('limitante: componente que cobre menos kits', () => {
  const k = kit({ componentes: [
    { codigo: 'A', descricao: 'a', kits_cobertos: 20 },
    { codigo: 'B', descricao: 'b', kits_cobertos: -3 },
    { codigo: 'C', descricao: 'c', kits_cobertos: 0 },
  ] });
  assert.equal(limitante(k)?.codigo, 'B');
  assert.equal(limitante(kit()), null);
});

test('situação: ok, montar, falta embalagem, produzir componente', () => {
  assert.equal(situacao(kit()), 'ok');
  assert.equal(situacao(kit({ producao_recomendada: 10, max_montavel_estoque: 4 })), 'montar');
  const emb = [{ codigo: '9.1.1', descricao: 'caixa', kits_cobertos: 0 }, { codigo: 'A', descricao: 'a', kits_cobertos: 5 }];
  assert.equal(situacao(kit({ producao_recomendada: 10, componentes: emb })), 'embalagem');
  const prod = [{ codigo: 'A', descricao: 'a', kits_cobertos: 0 }, { codigo: '9.1.1', descricao: 'caixa', kits_cobertos: 5 }];
  assert.equal(situacao(kit({ producao_recomendada: 10, componentes: prod })), 'produzir');
});

test('venda avulsa: só no kit ou sem média vira 0', () => {
  assert.equal(vendaAvulsaMensal(undefined), 0);
  assert.equal(vendaAvulsaMensal({ media_vendas: 40, produzir_apenas_kit: 1 }), 0);
  assert.equal(vendaAvulsaMensal({ media_vendas: null }), 0);
  assert.equal(vendaAvulsaMensal({ media_vendas: 40, produzir_apenas_kit: 0 }), 40);
});

test('status do componente', () => {
  assert.equal(statusComponente({ codigo: '9.1', descricao: '', kits_cobertos: 0 }, 10), 'Comprar');
  assert.equal(statusComponente({ codigo: 'A', descricao: '', kits_cobertos: -1 }, 10), 'Produzir');
  assert.equal(statusComponente({ codigo: 'A', descricao: '', kits_cobertos: 5 }, 10), 'Parcial');
  assert.equal(statusComponente({ codigo: 'A', descricao: '', kits_cobertos: 10 }, 10), 'Cobre');
});

test('por kit: proporção ou quantidade', () => {
  assert.equal(porKitRotulo({ codigo: 'A', descricao: '', quantidade: 2 }), '2');
  assert.equal(porKitRotulo({ codigo: 'A', descricao: '', quantidade: 1, fator_proporcao_kits: 4 }), '1 a cada 4');
});

test('componentes a produzir: agrega, ignora embalagem e não gera duração absurda', () => {
  const kits = [
    kit({ codigo: 'K1', descricao: 'KIT UM', media_vendas: 10, componentes: [
      { codigo: 'A', descricao: 'a', quantidade: 2, kits_cobertos: 0, producao_recomendada: 50 },
      { codigo: '9.1', descricao: 'caixa', quantidade: 1, kits_cobertos: 0 },
    ] }),
    kit({ codigo: 'K2', descricao: 'KIT DOIS', media_vendas: 5, componentes: [
      { codigo: 'A', descricao: 'a', quantidade: 1, kits_cobertos: 3, producao_recomendada: 20 },
      { codigo: 'B', descricao: 'b', quantidade: 1, kits_cobertos: 10, producao_recomendada: 0 },
    ] }),
  ];
  const produtos = new Map([
    ['A', { media_vendas: 30, produzir_apenas_kit: 0, estoque_futuro_com_producao: 100 }],
  ]);
  const r = componentesAProduzir(kits, produtos);
  assert.equal(r.length, 1);
  const a = r[0];
  assert.equal(a.codigo, 'A');
  assert.deepEqual(a.kits, ['UM', 'DOIS']);
  assert.equal(a.demandaKits, 25); // 10*2 + 5*1
  assert.equal(a.avulso, 30);
  assert.equal(a.recomendada, 50);
  assert.equal(a.cobertura, 0);
  assert.ok(Math.abs((a.meses as number) - 100 / 55) < 1e-9);
});

test('componente só de kit sem venda dos kits: duração nula', () => {
  const kits = [kit({ media_vendas: 0, componentes: [
    { codigo: 'A', descricao: 'a', quantidade: 1, kits_cobertos: 0, producao_recomendada: 10 },
  ] })];
  const r = componentesAProduzir(kits, new Map([['A', { media_vendas: 500, produzir_apenas_kit: 1, estoque_futuro_com_producao: 1000000 }]]));
  assert.equal(r[0].avulso, 0);
  assert.equal(r[0].meses, null);
});

test('duracaoValida corta valores fora de escala', () => {
  assert.equal(duracaoValida(null), null);
  assert.equal(duracaoValida(1234567), null);
  assert.equal(duracaoValida(Infinity), null);
  assert.equal(duracaoValida(2.5), 2.5);
});
