import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhaCasa, rotuloLinhaProducao, sublinhasSobPrincipal } from '../../src/modules/producao/lib/linhasProducao';

const sem = [
  { linha_prefix: '1', nome_linha: 'Natum' },
  { linha_prefix: '14', nome_linha: 'Perfect Curls' },
  { linha_prefix: '2', nome_linha: 'Hair Extrattus' },
];
const com = [
  { linha_prefix: '1', nome_linha: 'Natum' },
  { linha_prefix: '14', nome_linha: 'Perfect Curls', linha_principal: '1' },
  { linha_prefix: '2', nome_linha: 'Hair Extrattus' },
];

test('sem sublinha nada muda: mesma ordem, mesmo nome, filtro só da própria linha', () => {
  assert.deepEqual(sublinhasSobPrincipal(sem).map(l => l.linha_prefix), ['1', '14', '2']);
  assert.equal(rotuloLinhaProducao(sem, '14', 'Perfect Curls'), 'Perfect Curls');
  assert.equal(linhaCasa(sem, '1', '14'), false);
  assert.equal(linhaCasa(sem, '14', '14'), true);
});

test('com sublinha: vai para baixo da principal, ganha "Natum › ..." e a principal inclui a sublinha', () => {
  assert.deepEqual(sublinhasSobPrincipal(com).map(l => l.linha_prefix), ['1', '14', '2']);
  assert.deepEqual(sublinhasSobPrincipal([com[2], com[1], com[0]]).map(l => l.linha_prefix), ['2', '1', '14']);
  assert.equal(rotuloLinhaProducao(com, '14', 'Perfect Curls'), 'Natum › Perfect Curls');
  assert.equal(linhaCasa(com, '1', '14'), true);
  assert.equal(linhaCasa(com, '14', '1'), false);
  assert.equal(linhaCasa(com, 'ALL', '2'), true);
});
