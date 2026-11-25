import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distribuirEstoquePorAlocacao,
  gerarCaixasItem3d,
} from '../../src/modules/expedicao/alocacao/caixas3d';
import type {
  AlocacaoItemView,
  PosicaoComItens,
  ProdutoDimensao,
} from '../../src/modules/expedicao/alocacao/types';

function makeItem(overrides: Partial<AlocacaoItemView>): AlocacaoItemView {
  return {
    id: 'al-1',
    posicaoId: 'p-1',
    posicaoCodigo: 'A1',
    estruturaId: 'est-1',
    papel: 'picking',
    andar: 1,
    nivel: 1,
    produtoCodigo: '2.13.036',
    produtoDescricao: 'BOTTOX 100G',
    linhaPrefix: '2',
    nomeLinha: 'Hair Extrattus',
    fileirasLargura: 2,
    camadasAltura: 3,
    fixado: false,
    observacoes: null,
    caixaId: 'cx-1',
    caixaCodigo: '24',
    caixaAlturaCm: 20,
    caixaComprimentoCm: 35,
    caixaLarguraCm: 22,
    caixasComprimento: 3,
    maxCamadas: 3,
    totalCaixas: 18,
    qtdeCx: 24,
    totalUnidades: 432,
    larguraOcupadaCm: 44,
    alturaOcupadaCm: 60,
    alturaVaoCm: 74,
    estouroAltura: false,
    coberturaMeses: 1,
    pesoEstimadoKg: 40,
    ...overrides,
  };
}

function makePos(
  id: string,
  codigo: string,
  papel: 'picking' | 'pulmao',
  andar: number,
  itens: AlocacaoItemView[],
): PosicaoComItens {
  return {
    id,
    estruturaId: 'est-1',
    codigo,
    coluna: codigo[0] ?? 'A',
    colunaOrdem: 1,
    nivel: 1,
    andar,
    lado: 1,
    papel,
    larguraCm: 100,
    comprimentoCm: 120,
    alturaCm: 74,
    ativo: true,
    observacoes: null,
    itens,
    larguraOcupadaCm: 44,
    larguraLivreCm: 56,
    ocupacaoPct: 44,
    temEstouro: false,
    totalCaixas: itens.reduce((s, i) => s + i.totalCaixas, 0),
    totalUnidades: itens.reduce((s, i) => s + i.totalUnidades, 0),
  };
}

function makeProd(overrides: Partial<ProdutoDimensao>): ProdutoDimensao {
  return {
    codigo: '2.13.036',
    descricao: 'BOTTOX 100G',
    codigoBarras: null,
    linhaPrefix: '2',
    nomeLinha: 'Hair Extrattus',
    linhaPrincipal: null,
    situacao: 'A',
    incluirAbcOverride: null,
    incluirAbcEfetivo: true,
    motivoForaAbc: null,
    atendimento: 'normal',
    ehKit: false,
    ehColoracao: false,
    grupoAlocacao: '2',
    grupoAlocacaoNome: 'Hair Extrattus',
    estoqueAtual: 600,
    estoqueCaixas: 25,
    qtdeCxErp: 24,
    qtdeCxEfetiva: 24,
    qtdeCxOrigem: 'erp',
    caixaId: 'cx-1',
    caixaCodigo: '24',
    caixaNome: 'CX 24',
    caixaOrigem: 'manual',
    caixaAlturaCm: 20,
    caixaComprimentoCm: 35,
    caixaLarguraCm: 22,
    empilhamentoMax: 4,
    insumoCaixaErp: null,
    insumoCaixaErpDesc: null,
    camadasOverride: null,
    vendasVarejo: 10,
    mediaVarejo: 10,
    vendasAtacado: 5,
    mediaAtacado: 5,
    vendasTotal: 15,
    mediaTotal: 15,
    percentualAbc: 10,
    acumuladoAbc: 10,
    curvaAbc: 'A',
    metaMesesEfetiva: 2,
    caixasNecessariasPicking: 18,
    caixasNecessariasPulmao: 0,
    caixasNecessariasTotal: 18,
    alocacoes: [],
    enderecosPicking: ['A1'],
    enderecosPulmao: ['A5'],
    totalCaixasAlocadas: 36,
    totalUnidadesAlocadas: 864,
    coberturaMesesAlocada: 2,
    situacaoAlocacao: 'ok',
    ...overrides,
  };
}

test('distribuirEstoquePorAlocacao prioriza picking antes de pulmão e limita pela capacidade', () => {
  const pulmaoItem = makeItem({
    id: 'al-pulmao',
    posicaoId: 'pos-a5',
    posicaoCodigo: 'A5',
    papel: 'pulmao',
    andar: 3,
    totalCaixas: 18,
  });
  const pickingItem = makeItem({
    id: 'al-picking',
    posicaoId: 'pos-a1',
    posicaoCodigo: 'A1',
    papel: 'picking',
    andar: 1,
    totalCaixas: 18,
  });

  // Pulmão vem antes na lista para garantir que a ordenação picking -> pulmão funciona
  const posicoes = [
    makePos('pos-a5', 'A5', 'pulmao', 3, [pulmaoItem]),
    makePos('pos-a1', 'A1', 'picking', 1, [pickingItem]),
  ];
  const prods = new Map([['2.13.036', makeProd({ estoqueCaixas: 25 })]]);

  const saldos = distribuirEstoquePorAlocacao(posicoes, prods);
  assert.equal(saldos.get('al-picking')?.caixasEstoque, 18);
  assert.equal(saldos.get('al-picking')?.caixasCapacidade, 18);
  assert.equal(saldos.get('al-pulmao')?.caixasEstoque, 7);
  assert.equal(saldos.get('al-pulmao')?.caixasCapacidade, 18);
  assert.equal(saldos.get('al-pulmao')?.semSaldoInfo, false);
});

test('distribuirEstoquePorAlocacao trata estoque zero, excesso e saldo desconhecido', () => {
  const itemZero = makeItem({ id: 'al-zero', produtoCodigo: 'P_ZERO', totalCaixas: 12 });
  const itemCheio = makeItem({ id: 'al-cheio', produtoCodigo: 'P_EXCESSO', totalCaixas: 10 });
  const itemSemInfo = makeItem({
    id: 'al-sem',
    produtoCodigo: 'P_SEM_INFO',
    qtdeCx: null,
    totalCaixas: 9,
  });

  const posicoes = [makePos('pos-1', 'B1', 'picking', 1, [itemZero, itemCheio, itemSemInfo])];
  const prods = new Map([
    ['P_ZERO', makeProd({ codigo: 'P_ZERO', estoqueAtual: 0, estoqueCaixas: 0 })],
    ['P_EXCESSO', makeProd({ codigo: 'P_EXCESSO', estoqueAtual: 500, estoqueCaixas: 40 })],
    [
      'P_SEM_INFO',
      makeProd({
        codigo: 'P_SEM_INFO',
        estoqueAtual: 120,
        estoqueCaixas: null,
        qtdeCxEfetiva: null,
      }),
    ],
  ]);

  const saldos = distribuirEstoquePorAlocacao(posicoes, prods);
  assert.equal(saldos.get('al-zero')?.caixasEstoque, 0);
  assert.equal(saldos.get('al-cheio')?.caixasEstoque, 10);
  assert.equal(saldos.get('al-sem')?.semSaldoInfo, true);
  assert.equal(saldos.get('al-sem')?.caixasEstoque, 9);
});

test('gerarCaixasItem3d retorna lista vazia quando quantidade alvo é 0', () => {
  const res = gerarCaixasItem3d({
    xStart: 10,
    yStart: 6,
    zBase: 11,
    maxWidthCm: 80,
    slotDepthCm: 110,
    maxHeightCm: 63,
    fileirasLargura: 3,
    caixasComprimento: 3,
    camadasAltura: 3,
    larguraOcupadaCm: 66,
    alturaOcupadaCm: 60,
    caixaLarguraCm: 22,
    caixaComprimentoCm: 35,
    caixaAlturaCm: 20,
    qtdCaixasAlvo: 0,
    dirSign: 1,
    modoDetalhe: 'foco',
  });
  assert.equal(res.caixas.length, 0);
});

test('gerarCaixasItem3d aplica hidden-box culling em bloco 3x3x3 e preserva folgas', () => {
  const res = gerarCaixasItem3d({
    xStart: 10,
    yStart: 6,
    zBase: 11,
    maxWidthCm: 80,
    slotDepthCm: 110,
    maxHeightCm: 63,
    fileirasLargura: 3,
    caixasComprimento: 3,
    camadasAltura: 3,
    larguraOcupadaCm: 66,
    alturaOcupadaCm: 60,
    caixaLarguraCm: 22,
    caixaComprimentoCm: 35,
    caixaAlturaCm: 20,
    qtdCaixasAlvo: 27,
    dirSign: 1,
    modoDetalhe: 'foco',
  });

  // Em 3x3x3 sólido visto de frente-topo-direita, 2*2*2 = 8 caixas traseiras/inferiores ficam 100% ocultas -> 19 visíveis
  assert.equal(res.caixas.length, 19);

  // Verifica folga positiva entre caixas adjacentes em X na mesma fila (iy=0, iz=0)
  const filaFrente = res.caixas
    .filter((c) => c.iy === 0 && c.iz === 0)
    .sort((a, b) => a.ix - b.ix);
  assert.equal(filaFrente.length, 3);
  assert.ok(filaFrente[1].x > filaFrente[0].x + filaFrente[0].dx);

  // Verifica folga positiva em Z
  const colFrente = res.caixas
    .filter((c) => c.ix === 0 && c.iy === 0)
    .sort((a, b) => a.iz - b.iz);
  assert.equal(colFrente.length, 3);
  assert.ok(colFrente[1].z > colFrente[0].z + colFrente[0].dz);
});

test('gerarCaixasItem3d preenche pilha parcial pela frente e respeita ordem painter', () => {
  const baseParams = {
    xStart: 0,
    yStart: 6,
    zBase: 11,
    maxWidthCm: 90,
    slotDepthCm: 110,
    maxHeightCm: 63,
    fileirasLargura: 3,
    caixasComprimento: 2,
    camadasAltura: 2,
    larguraOcupadaCm: 66,
    alturaOcupadaCm: 40,
    caixaLarguraCm: 22,
    caixaComprimentoCm: 35,
    caixaAlturaCm: 20,
    qtdCaixasAlvo: 5,
    modoDetalhe: 'foco' as const,
  };

  const dirPos = gerarCaixasItem3d({ ...baseParams, dirSign: 1 });
  assert.equal(dirPos.caixas.length, 5);
  // Nenhuma caixa na camada iz=1 quando só há 5 caixas numa base 3x2=6
  assert.ok(dirPos.caixas.every((c) => c.iz === 0));
  // iy=1 (fundo) vem antes de iy=0 (frente)
  const firstFrenteIdx = dirPos.caixas.findIndex((c) => c.iy === 0);
  const lastFundoIdx = dirPos.caixas.reduce((acc, c, idx) => (c.iy === 1 ? idx : acc), -1);
  assert.ok(lastFundoIdx < firstFrenteIdx);
  // Com dirSign=1, na mesma linha (iy=0), ix cresce
  const rowDirPos = dirPos.caixas.filter((c) => c.iy === 0).map((c) => c.ix);
  assert.deepEqual(rowDirPos, [0, 1, 2]);

  const dirNeg = gerarCaixasItem3d({ ...baseParams, dirSign: -1 });
  const rowDirNeg = dirNeg.caixas.filter((c) => c.iy === 0).map((c) => c.ix);
  assert.deepEqual(rowDirNeg, [2, 1, 0]);
});

test('gerarCaixasItem3d limita subdivisões conforme LOD panorama x foco', () => {
  const comum = {
    xStart: 0,
    yStart: 6,
    zBase: 11,
    maxWidthCm: 90,
    slotDepthCm: 110,
    maxHeightCm: 63,
    fileirasLargura: 10,
    caixasComprimento: 10,
    camadasAltura: 8,
    larguraOcupadaCm: 90,
    alturaOcupadaCm: 60,
    caixaLarguraCm: 9,
    caixaComprimentoCm: 11,
    caixaAlturaCm: 7.5,
    qtdCaixasAlvo: 800,
    dirSign: 1 as const,
  };

  const pan = gerarCaixasItem3d({ ...comum, modoDetalhe: 'panorama' });
  assert.equal(pan.nx, 5);
  assert.equal(pan.ny, 4);
  assert.equal(pan.nz, 5);

  const foco = gerarCaixasItem3d({ ...comum, modoDetalhe: 'foco' });
  assert.equal(foco.nx, 8);
  assert.equal(foco.ny, 6);
  assert.equal(foco.nz, 8);
});
