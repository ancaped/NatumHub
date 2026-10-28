import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribuirEmPaginas, quebrarTextoPorPalavras } from '../../src/modules/qualidade/pops/paginacaoPop';

test('distribuirEmPaginas: corpo vazio ou curto ocupa uma folha', () => {
  assert.deepEqual(distribuirEmPaginas([], 100), [[]]);
  assert.deepEqual(distribuirEmPaginas([30, 30, 30], 100), [[0, 1, 2]]);
});

test('distribuirEmPaginas: o que não cabe vai para a próxima folha', () => {
  assert.deepEqual(distribuirEmPaginas([40, 40, 40, 40, 40], 100), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(distribuirEmPaginas([50, 50, 50], 100), [[0, 1], [2]]);
});

test('distribuirEmPaginas: bloco maior que a folha fica sozinho', () => {
  assert.deepEqual(distribuirEmPaginas([10, 250, 10], 100), [[0], [1], [2]]);
});

test('quebrarTextoPorPalavras: cada pedaço respeita o limite e a junção devolve o texto', () => {
  const texto = 'um dois tres quatro cinco seis sete oito';
  const pedacos = quebrarTextoPorPalavras(texto, (t) => t.length <= 14);
  assert.equal(pedacos.join(''), texto);
  assert.ok(pedacos.every((p) => p.length <= 14));
  assert.ok(pedacos.length > 1);
});
