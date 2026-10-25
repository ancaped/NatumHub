import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eBase, produtoAtivo, resolverSettingNumerica, STATUS_IGNORADOS_PADRAO } from '../../src/modules/geral/lib/regrasProduto';

test('base por categoria, status ou código com .36.', () => {
  assert.equal(eBase('5.1.1', 'cat_base', ''), true);
  assert.equal(eBase('5.1.1', '', 'bases'), true);
  assert.equal(eBase('1.36.001', null, null), true);
  assert.equal(eBase('1.3.6', '', 'ativo'), false);
  assert.equal(eBase('1.360.1', '', 'ativo'), false);
  assert.equal(eBase(undefined, undefined, undefined), false);
});

test('produto ativo: status fora dos ignorados e visível', () => {
  assert.equal(produtoAtivo('ativo', 1, STATUS_IGNORADOS_PADRAO), true);
  assert.equal(produtoAtivo(undefined, undefined, STATUS_IGNORADOS_PADRAO), true);
  assert.equal(produtoAtivo('lancamento', 1, STATUS_IGNORADOS_PADRAO), true);
  assert.equal(produtoAtivo('terceirizado', 1, STATUS_IGNORADOS_PADRAO), false);
  assert.equal(produtoAtivo('ativo', 0, STATUS_IGNORADOS_PADRAO), false);
  assert.equal(produtoAtivo('terceirizado', 1, []), true);
});

test('setting numérica: servidor > localStorage (migra) > padrão', () => {
  assert.deepEqual(resolverSettingNumerica('22', '10', 30), { valor: 22, migrar: false });
  assert.deepEqual(resolverSettingNumerica(null, '10', 30), { valor: 10, migrar: true });
  assert.deepEqual(resolverSettingNumerica(undefined, null, 30), { valor: 30, migrar: false });
  assert.deepEqual(resolverSettingNumerica('x', 'y', 30), { valor: 30, migrar: false });
});
