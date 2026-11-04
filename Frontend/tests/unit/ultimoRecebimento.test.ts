import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ultimoRecebimento } from '../../src/modules/compras/planejamento/ultimoRecebimento';

test('devolve a nota de data mais recente, qualquer que seja a ordem da lista', () => {
  const r = ultimoRecebimento([
    { invoiceNumber: '10', invoiceDate: '2026-03-01' },
    { invoiceNumber: '12', invoiceDate: '2026-05-20' },
    { invoiceNumber: '11', invoiceDate: '2026-04-10' },
  ]);
  assert.equal(r?.invoiceNumber, '12');
});

test('sem notas ou com datas inválidas devolve null', () => {
  assert.equal(ultimoRecebimento([]), null);
  assert.equal(ultimoRecebimento(undefined), null);
  assert.equal(ultimoRecebimento([{ invoiceNumber: '1', invoiceDate: 'lixo' }]), null);
});

test('ignora nota sem data válida e usa a que tem', () => {
  const r = ultimoRecebimento([
    { invoiceNumber: '1', invoiceDate: '' },
    { invoiceNumber: '2', invoiceDate: '2026-01-02T00:00:00' },
  ]);
  assert.equal(r?.invoiceNumber, '2');
});
