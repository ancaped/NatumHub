import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarRelatorioCompra } from '../../src/modules/compras/planejamento/relatorioCompra';
import type { DadosRelatorio, ItemRelatorio } from '../../src/modules/compras/planejamento/relatorioCompra';

const item = (o: Partial<ItemRelatorio> = {}): ItemRelatorio => ({
  codigo: '1.01.001', descricao: 'Álcool', unidade: 'KG', estoque: 10, media: 30, simProducao: 0,
  previsaoFutura: 10, duracaoDias: 10, gatilhoDias: 30, metaDias: 90, gatilhoRef: 30, metaRef: 90,
  quantidade: 50, duracaoPosDias: 60, ...o,
});

const base = (o: Partial<DadosRelatorio> = {}): DadosRelatorio => ({
  titulo: 'Relatório de Compras', geradoEm: '03/11/2026 10:00',
  colunas: [
    { key: 'itemCode', label: 'Ref / Item', align: 'left' },
    { key: 'recommendedQty', label: 'Qtd Recomendada', align: 'right' },
    { key: 'currentStock', label: 'Estoque', align: 'right' },
  ],
  itens: [item()], ...o,
});

test('relatório: colunas na ordem pedida e só as pedidas', () => {
  const html = montarRelatorioCompra(base());
  const pos = (t: string) => html.indexOf(t);
  assert.ok(pos('Descrição do insumo') > 0);
  assert.ok(pos('Descrição do insumo') < pos('Qtd Recomendada'));
  assert.ok(pos('Qtd Recomendada') < pos('>Estoque<'));
  assert.equal(html.includes('Média Mês'), false);
});

test('relatório: lote e logo aparecem quando informados e somem quando ausentes', () => {
  const com = montarRelatorioCompra(base({ lote: 'LC-0001', logo: 'data:image/png;base64,AAAA' }));
  assert.ok(com.includes('LC-0001'));
  assert.ok(com.includes('<img class="logo" src="data:image/png;base64,AAAA"'));
  const sem = montarRelatorioCompra(base());
  assert.equal(sem.includes('<img'), false);
  assert.equal(sem.includes('class="lote"'), false);
});

test('relatório: escapa HTML nos textos', () => {
  const html = montarRelatorioCompra(base({
    titulo: 'A & B <x>', observacoes: '<script>1</script>',
    itens: [item({ descricao: 'Tinta <azul> & cia', subtexto: '"cat"' })],
  }));
  assert.ok(html.includes('Tinta &lt;azul&gt; &amp; cia'));
  assert.ok(html.includes('A &amp; B &lt;x&gt;'));
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<azul>'), false);
});
