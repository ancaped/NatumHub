import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparLinhas, prefixosDaLinha, rotuloLinha, alternarLinhaNoFiltro, ordenarPorPrefixo,
} from '../../src/modules/geral/lib/linhas';

const L = (linha_prefix: string, nome_linha: string, linha_principal: string | null = null) => ({ linha_prefix, nome_linha, linha_principal });
const linhas = [
  L('DEFAULT', 'Geral'),
  L('10', 'Perfect Curls', '2'),
  L('2', 'Natum'),
  L('9.15', 'Natum Extra', '2'),
  L('3', 'Hair Extrattus'),
  L('7', 'Hair Extrattus Extra', '3'),
  L('4', 'Solo'),
];

test('agruparLinhas: principal seguida das sublinhas, ordem numérica por prefixo, DEFAULT por último', () => {
  const g = agruparLinhas(linhas).map(x => `${x.nivel}:${x.linha.linha_prefix}`);
  assert.deepEqual(g, ['0:2', '1:9.15', '1:10', '0:3', '1:7', '0:4', '0:DEFAULT']);
});

test('agruparLinhas marca quem tem sublinhas', () => {
  const g = agruparLinhas(linhas);
  assert.equal(g.find(x => x.linha.linha_prefix === '2')!.temSublinhas, true);
  assert.equal(g.find(x => x.linha.linha_prefix === '4')!.temSublinhas, false);
});

test('sem nenhuma sublinha a lista fica plana', () => {
  const g = agruparLinhas([L('2', 'A'), L('1', 'B')]);
  assert.deepEqual(g.map(x => x.linha.linha_prefix), ['1', '2']);
  assert.ok(g.every(x => x.nivel === 0));
});

test('principal que não existe na lista não esconde a linha', () => {
  const g = agruparLinhas([L('5', 'Órfã', 'XX'), L('1', 'B')]);
  assert.deepEqual(g.map(x => `${x.nivel}:${x.linha.linha_prefix}`), ['0:1', '0:5']);
});

test('prefixosDaLinha: a linha e, se principal, as sublinhas', () => {
  assert.deepEqual(prefixosDaLinha(linhas, '2'), ['2', '9.15', '10']);
  assert.deepEqual(prefixosDaLinha(linhas, '9.15'), ['9.15']);
  assert.deepEqual(prefixosDaLinha(linhas, '4'), ['4']);
  assert.deepEqual(prefixosDaLinha(linhas, 'NAO'), ['NAO']);
});

test('rotuloLinha: "Principal › Sublinha" ou só o nome', () => {
  assert.equal(rotuloLinha(linhas, '9.15'), 'Natum › Natum Extra');
  assert.equal(rotuloLinha(linhas, '2'), 'Natum');
  assert.equal(rotuloLinha(linhas, 'NAO'), 'NAO');
});

test('filtro: marcar a principal marca as sublinhas; desmarcar tira todas; sublinha mexe só nela', () => {
  let m = alternarLinhaNoFiltro(linhas, new Set(), '2');
  assert.deepEqual([...m].sort(), ['10', '2', '9.15']);
  m = alternarLinhaNoFiltro(linhas, m, '9.15');
  assert.deepEqual([...m].sort(), ['10', '2']);
  m = alternarLinhaNoFiltro(linhas, m, '2');
  assert.deepEqual([...m], []);
});

test('ordenarPorPrefixo não altera a lista original', () => {
  const copia = [...linhas];
  ordenarPorPrefixo(linhas);
  assert.deepEqual(linhas, copia);
});
