import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coresItemVao3d,
  distribuirEstoquePorAlocacao,
  gerarCaixasItem3d,
  gerarLayoutVao3d,
  ordenarCaixas3dPorCamera,
} from '../../src/modules/expedicao/alocacao/caixas3d';
import { verificarApoioCamada } from '../../src/modules/expedicao/alocacao/paletizacao';
import type {
  AlocacaoItemView,
  Caixa,
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
    usarAmarracao: false,
  });

  assert.equal(res.caixas.length, 19);

  const filaFrente = res.caixas
    .filter((c) => c.iy === 0 && c.iz === 0)
    .sort((a, b) => a.ix - b.ix);
  assert.equal(filaFrente.length, 3);
  assert.ok(filaFrente[1].x > filaFrente[0].x + filaFrente[0].dx);

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
    usarAmarracao: false,
  };

  const dirPos = gerarCaixasItem3d({ ...baseParams, dirSign: 1 });
  assert.equal(dirPos.caixas.length, 5);
  assert.ok(dirPos.caixas.every((c) => c.iz === 0));
  const firstFrenteIdx = dirPos.caixas.findIndex((c) => c.iy === 0);
  const lastFundoIdx = dirPos.caixas.reduce((acc, c, idx) => (c.iy === 1 ? idx : acc), -1);
  assert.ok(lastFundoIdx < firstFrenteIdx);
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
    usarAmarracao: false,
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

test('gerarCaixasItem3d calcula amarração real com espelhamento de camada e respeita limites', () => {
  const res = gerarCaixasItem3d({
    xStart: 5,
    yStart: 6,
    zBase: 11,
    maxWidthCm: 100,
    slotDepthCm: 120,
    maxHeightCm: 63,
    fileirasLargura: 4,
    caixasComprimento: 3,
    camadasAltura: 2,
    larguraOcupadaCm: 100,
    alturaOcupadaCm: 40,
    caixaLarguraCm: 22,
    caixaComprimentoCm: 35,
    caixaAlturaCm: 20,
    qtdCaixasAlvo: 26,
    dirSign: 1,
    modoDetalhe: 'foco',
    usarAmarracao: true,
    podeGirar: true,
    aplicarCulling: false,
  });

  assert.equal(res.amarrado, true);
  assert.equal(res.caixas.length, 26);

  const c1 = res.caixas.filter((c) => c.camada === 1);
  const c2 = res.caixas.filter((c) => c.camada === 2);
  assert.equal(c1.length, 13);
  assert.equal(c2.length, 13);
  assert.ok(c1.some((c) => c.rotacionada) && c1.some((c) => !c.rotacionada));

  // Camada 2 é espelhada em X/Y no palete em relação à camada 1
  const minXRotC1 = Math.min(...c1.filter((c) => c.rotacionada).map((c) => c.x));
  const minXRotC2 = Math.min(...c2.filter((c) => c.rotacionada).map((c) => c.x));
  assert.notEqual(Math.round(minXRotC1), Math.round(minXRotC2));

  // Nenhuma caixa ultrapassa o footprint do item
  for (const b of res.caixas) {
    assert.ok(b.x >= 5 && b.x + b.dx <= 5 + res.footprintW + 0.01);
    assert.ok(b.y >= 6 && b.y + b.dy <= 6 + res.footprintD + 0.01);
  }

  // Camada 2 deve estar fisicamente apoiada sobre a camada 1 sem ponta flutuando
  const toRects = (arr: typeof c1) =>
    arr.map((b) => ({ x: b.x, y: b.y, w: b.dx + 1.5, h: b.dy + 1.5, rotacionada: b.rotacionada }));
  assert.equal(verificarApoioCamada(toRects(c1), toRects(c2), 0.85, 1.5), true);
});

test('gerarCaixasItem3d não deixa pontas flutuando em caso de caixa quase quadrada (ex.: CX 132 em Vão A11)', () => {
  const res = gerarCaixasItem3d({
    xStart: 0,
    yStart: 0,
    zBase: 11,
    maxWidthCm: 100,
    slotDepthCm: 120,
    maxHeightCm: 74,
    fileirasLargura: 3,
    caixasComprimento: 4,
    camadasAltura: 4,
    larguraOcupadaCm: 79.2,
    alturaOcupadaCm: 72,
    caixaLarguraCm: 26.4,
    caixaComprimentoCm: 24.4,
    caixaAlturaCm: 18,
    qtdCaixasAlvo: 48,
    dirSign: 1,
    modoDetalhe: 'foco',
    usarAmarracao: true,
    podeGirar: true,
    aplicarCulling: false,
  });

  const porCamada = [1, 2, 3, 4].map((cam) =>
    res.caixas
      .filter((c) => c.camada === cam)
      .map((c) => ({ x: c.x, y: c.y, w: c.dx, h: c.dy, rotacionada: c.rotacionada })),
  );

  for (let i = 0; i < porCamada.length - 1; i++) {
    assert.equal(
      verificarApoioCamada(porCamada[i], porCamada[i + 1], 0.85, 1.5),
      true,
      `Camada ${i + 2} não pode ter ponta flutuando sobre camada ${i + 1}`,
    );
  }
});

test('gerarLayoutVao3d mantém paridade física entre Prateleira 3D (com culling) e Palete 3D (sem culling)', () => {
  const itemA = makeItem({
    id: 'al-a',
    produtoCodigo: '2.11.054',
    fileirasLargura: 3,
    caixasComprimento: 4,
    camadasAltura: 4,
    caixaId: 'cx-9',
    caixaLarguraCm: 19,
    caixaComprimentoCm: 29,
    caixaAlturaCm: 18,
    larguraOcupadaCm: 57,
    alturaOcupadaCm: 72,
    totalCaixas: 48,
  });
  const itemB = makeItem({
    id: 'al-b',
    produtoCodigo: '2.13.039',
    fileirasLargura: 2,
    caixasComprimento: 3,
    camadasAltura: 3,
    caixaId: 'cx-fix',
    caixaLarguraCm: 20,
    caixaComprimentoCm: 35,
    caixaAlturaCm: 20,
    larguraOcupadaCm: 40,
    alturaOcupadaCm: 60,
    totalCaixas: 18,
  });
  const pos = makePos('p-b2', 'B2', 'picking', 1, [itemA, itemB]);
  const prods = new Map<string, ProdutoDimensao>([
    ['2.11.054', makeProd({ codigo: '2.11.054', estoqueCaixas: 60 })],
    ['2.13.039', makeProd({ codigo: '2.13.039', estoqueCaixas: 20 })],
  ]);
  const saldos = distribuirEstoquePorAlocacao([pos], prods);
  const caixasMap = new Map<string, Caixa>([
    [
      'cx-fix',
      {
        id: 'cx-fix',
        codigo: 'FIX',
        nome: 'Sem giro',
        alturaCm: 20,
        comprimentoCm: 35,
        larguraCm: 20,
        empilhamentoMax: 4,
        insumoErpCodigo: null,
        podeGirar: false,
        ativo: true,
        observacoes: null,
      },
    ],
  ]);

  const palete = gerarLayoutVao3d({
    posicao: pos,
    saldos,
    caixaPorId: caixasMap,
    modoQtd: 'capacidade',
    usarAmarracao: true,
    aplicarCulling: false,
    dirSign: 1,
  });
  const prateleira = gerarLayoutVao3d({
    posicao: pos,
    saldos,
    caixaPorId: caixasMap,
    modoQtd: 'capacidade',
    usarAmarracao: true,
    aplicarCulling: true,
    dirSign: 1,
  });

  assert.equal(prateleira.itens.length, palete.itens.length);
  for (let i = 0; i < palete.itens.length; i++) {
    assert.equal(prateleira.itens[i].amarrado, palete.itens[i].amarrado);
    // podeGirar = false no itemB impede rotação nos dois modos
    if (palete.itens[i].item.id === 'al-b') {
      assert.equal(palete.itens[i].amarrado, false);
      assert.ok(palete.itens[i].caixas.every((c) => !c.rotacionada));
      assert.ok(prateleira.itens[i].caixas.every((c) => !c.rotacionada));
    }

    // Fila frontal (menor Y) idêntica nos dois modos
    const minYP = Math.min(...palete.itens[i].caixas.map((c) => c.y));
    const frontPal = palete.itens[i].caixas.filter((c) => Math.abs(c.y - minYP) < 1);
    const frontPrat = prateleira.itens[i].caixas.filter((c) => Math.abs(c.y - minYP) < 1);
    assert.equal(frontPrat.length, frontPal.length);

    // Camada superior (maior Z) idêntica nos dois modos
    const maxZP = Math.max(...palete.itens[i].caixas.map((c) => c.z));
    const topPal = palete.itens[i].caixas.filter((c) => Math.abs(c.z - maxZP) < 1);
    const topPrat = prateleira.itens[i].caixas.filter((c) => Math.abs(c.z - maxZP) < 1);
    assert.equal(topPrat.length, topPal.length);

    // Culling reduz caixas internas sem alterar faces visíveis em pilhas densas
    assert.ok(prateleira.itens[i].caixas.length < palete.itens[i].caixas.length);
  }
});

test('coresItemVao3d atribui cores distintas para múltiplos produtos no mesmo vão', () => {
  const swatches = [0, 1, 2, 3, 4].map(
    (idx) => coresItemVao3d(idx, 5, false, false, false, false).swatch,
  );
  assert.equal(new Set(swatches).size, 5);
  assert.equal(
    coresItemVao3d(0, 1, false, false, false, false).swatch,
    coresItemVao3d(1, 1, false, false, false, false).swatch,
  );
});

test('gerarCaixasItem3d com podeGirar=false não rotaciona nenhuma caixa', () => {
  const res = gerarCaixasItem3d({
    xStart: 0,
    yStart: 0,
    zBase: 11,
    maxWidthCm: 100,
    slotDepthCm: 120,
    maxHeightCm: 63,
    fileirasLargura: 4,
    caixasComprimento: 3,
    camadasAltura: 2,
    larguraOcupadaCm: 100,
    alturaOcupadaCm: 40,
    caixaLarguraCm: 22,
    caixaComprimentoCm: 35,
    caixaAlturaCm: 20,
    qtdCaixasAlvo: 16,
    dirSign: 1,
    modoDetalhe: 'foco',
    usarAmarracao: true,
    podeGirar: false,
    aplicarCulling: false,
  });

  assert.equal(res.amarrado, false);
  assert.ok(res.caixas.every((c) => c.rotacionada === false));
});

test('ordenarCaixas3dPorCamera ordena profundidade e camadas corretamente em todos os quadrantes', () => {
  const frente = { id: 'frente', x: 0, y: 0, z: 0, dx: 20, dy: 20, dz: 18 };
  const fundo = { id: 'fundo', x: 0, y: 60, z: 0, dx: 20, dy: 20, dz: 18 };
  const dir = { id: 'dir', x: 50, y: 0, z: 0, dx: 20, dy: 20, dz: 18 };
  const topo = { id: 'topo', x: 0, y: 0, z: 20, dx: 20, dy: 20, dz: 18 };

  const ord0 = ordenarCaixas3dPorCamera([frente, fundo], 0).map((c) => c.id);
  assert.deepEqual(ord0, ['fundo', 'frente']);

  const ord180 = ordenarCaixas3dPorCamera([frente, fundo], 180).map((c) => c.id);
  assert.deepEqual(ord180, ['frente', 'fundo']);

  const ord90 = ordenarCaixas3dPorCamera([frente, dir], 90).map((c) => c.id);
  assert.deepEqual(ord90, ['frente', 'dir']);

  for (const yaw of [0, 90, 180, 270]) {
    const ordZ = ordenarCaixas3dPorCamera([topo, frente], yaw).map((c) => c.id);
    assert.deepEqual(ordZ, ['frente', 'topo']);
  }
});

test('gerarLayoutVao3d ativa amarração real em vãos multi-produto em modo auto (ex.: Vão F6)', () => {
  const itemF6A = makeItem({
    id: 'al-f6a',
    produtoCodigo: '2.11.010',
    fileirasLargura: 2,
    caixasComprimento: 4,
    camadasAltura: 3,
    caixaId: 'cx-24',
    caixaLarguraCm: 15.8,
    caixaComprimentoCm: 26.8,
    caixaAlturaCm: 24.7,
    larguraOcupadaCm: 31.6,
    alturaOcupadaCm: 74.1,
    totalCaixas: 24,
    orientacaoModo: 'auto',
    orientacaoEfetiva: 'normal',
    amarrado: false,
  });
  const itemF6B = makeItem({
    id: 'al-f6b',
    produtoCodigo: '2.11.011',
    fileirasLargura: 2,
    caixasComprimento: 4,
    camadasAltura: 3,
    caixaId: 'cx-24',
    caixaLarguraCm: 15.8,
    caixaComprimentoCm: 26.8,
    caixaAlturaCm: 24.7,
    larguraOcupadaCm: 31.6,
    alturaOcupadaCm: 74.1,
    totalCaixas: 24,
    orientacaoModo: 'auto',
    orientacaoEfetiva: 'normal',
    amarrado: false,
  });
  const posF6 = makePos('p-f6', 'F6', 'picking', 3, [itemF6A, itemF6B]);
  const prods = new Map<string, ProdutoDimensao>([
    ['2.11.010', makeProd({ codigo: '2.11.010', estoqueCaixas: 30 })],
    ['2.11.011', makeProd({ codigo: '2.11.011', estoqueCaixas: 30 })],
  ]);
  const saldos = distribuirEstoquePorAlocacao([posF6], prods);
  const res = gerarLayoutVao3d({
    posicao: posF6,
    saldos,
    caixaPorId: new Map(),
    modoQtd: 'capacidade',
    usarAmarracao: true,
    aplicarCulling: false,
    dirSign: 1,
  });

  assert.equal(res.itens[0].amarrado, true);
  assert.equal(res.itens[1].amarrado, true);
  assert.ok(res.itens[0].caixas.some((c) => c.rotacionada));
  assert.ok(res.itens[0].caixas.some((c) => !c.rotacionada));
});
