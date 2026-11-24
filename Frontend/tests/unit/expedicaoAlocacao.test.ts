import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { montarWorkbookAlocacao } from '../../src/modules/expedicao/alocacao/exportarPlanilha';
import { parsearPlanilhaMapa } from '../../src/modules/expedicao/alocacao/importarPlanilha';
import {
  calcularPaletizacao,
  calcularPlantaVao,
} from '../../src/modules/expedicao/alocacao/paletizacao';
import type { PainelAlocacaoResponse, PosicaoComItens } from '../../src/modules/expedicao/alocacao/types';

test('montarWorkbookAlocacao gera as 4 abas esperadas com dados reais do painel', () => {
  const painel: PainelAlocacaoResponse = {
    janelaMeses: 12,
    metaMeses: 2,
    usarMetaLinha: false,
    estruturaAtivaId: 'estante_principal',
    estruturas: [
      {
        id: 'estante_principal',
        nome: 'Prateleira 1 — Hair Extrattus',
        descricao: null,
        galpao: 'Galpão 1 (Área Nobre)',
        zona: 'nobre',
        linhasPermitidas: ['2'],
        estradoLarguraCm: 100,
        estradoComprimentoCm: 120,
        ordem: 1,
        ativo: true,
        totalPosicoes: 1,
        posicoesOcupadas: 1,
        ocupacaoMediaPct: 47.4,
      },
    ],
    posicoes: [
      {
        id: 'estante_principal:A1',
        estruturaId: 'estante_principal',
        codigo: 'A1',
        coluna: 'A',
        colunaOrdem: 1,
        nivel: 1,
        andar: 1,
        lado: 1,
        papel: 'picking',
        larguraCm: 100,
        comprimentoCm: 120,
        alturaCm: 74.1,
        ativo: true,
        observacoes: null,
        larguraOcupadaCm: 47.4,
        larguraLivreCm: 52.6,
        ocupacaoPct: 47.4,
        temEstouro: false,
        totalCaixas: 36,
        totalUnidades: 432,
        itens: [
          {
            id: 'al1',
            posicaoId: 'estante_principal:A1',
            posicaoCodigo: 'A1',
            estruturaId: 'estante_principal',
            papel: 'picking',
            andar: 1,
            nivel: 1,
            produtoCodigo: '2.13.023',
            produtoDescricao: 'MASC MATIZER BLOND 250 GR HAIR EXTRATTUS',
            linhaPrefix: '2.13',
            nomeLinha: 'Hair Extrattus',
            fileirasLargura: 3,
            camadasAltura: 3,
            fixado: true,
            observacoes: null,
            caixaId: 'cx_24',
            caixaCodigo: '24',
            caixaAlturaCm: 24.7,
            caixaComprimentoCm: 26.8,
            caixaLarguraCm: 15.8,
            caixasComprimento: 4,
            maxCamadas: 3,
            totalCaixas: 36,
            qtdeCx: 12,
            totalUnidades: 432,
            larguraOcupadaCm: 47.4,
            alturaOcupadaCm: 74.1,
            alturaVaoCm: 74.1,
            estouroAltura: false,
            coberturaMeses: 2.1,
          },
        ],
      },
    ],
    caixas: [
      {
        id: 'cx_24',
        codigo: '24',
        nome: 'Caixa 24',
        alturaCm: 24.7,
        comprimentoCm: 26.8,
        larguraCm: 15.8,
        empilhamentoMax: 4,
        insumoErpCodigo: null,
        ativo: true,
        observacoes: null,
      },
    ],
    atacadistas: [],
    produtos: [
      {
        codigo: '2.13.023',
        descricao: 'MASC MATIZER BLOND 250 GR HAIR EXTRATTUS',
        codigoBarras: null,
        linhaPrefix: '2.13',
        nomeLinha: 'Hair Extrattus',
        linhaPrincipal: null,
        situacao: 'ativo',
        incluirAbcOverride: null,
        incluirAbcEfetivo: true,
        motivoForaAbc: null,
        atendimento: 'estoque',
        ehKit: false,
        ehColoracao: false,
        grupoAlocacao: '2',
        grupoAlocacaoNome: 'Hair Extrattus',
        estoqueAtual: 240,
        estoqueCaixas: 20,
        qtdeCxErp: 12,
        qtdeCxEfetiva: 12,
        qtdeCxOrigem: 'erp',
        caixaId: 'cx_24',
        caixaCodigo: '24',
        caixaNome: 'Caixa 24',
        caixaOrigem: 'manual',
        caixaAlturaCm: 24.7,
        caixaComprimentoCm: 26.8,
        caixaLarguraCm: 15.8,
        empilhamentoMax: 4,
        insumoCaixaErp: null,
        insumoCaixaErpDesc: null,
        camadasOverride: null,
        vendasVarejo: 1200,
        mediaVarejo: 100,
        vendasAtacado: 1200,
        mediaAtacado: 100,
        vendasTotal: 2400,
        mediaTotal: 200,
        percentualAbc: 100,
        acumuladoAbc: 100,
        curvaAbc: 'A',
        metaMesesEfetiva: 2,
        caixasNecessariasPicking: 17,
        caixasNecessariasPulmao: 17,
        caixasNecessariasTotal: 34,
        alocacoes: [],
        enderecosPicking: ['A1'],
        enderecosPulmao: [],
        totalCaixasAlocadas: 36,
        totalUnidadesAlocadas: 432,
        coberturaMesesAlocada: 2.16,
        situacaoAlocacao: 'ok',
      },
    ],
    insumosCaixaErp: [],
    resumo: {
      totalProdutos: 1,
      alocados: 1,
      semEndereco: 0,
      semCaixa: 0,
      semQtdeCx: 0,
      estoqueAcimaCapacidade: 0,
      totalPosicoes: 1,
      posicoesOcupadas: 1,
      ocupacaoMediaPct: 47.4,
    },
  };

  const wb = montarWorkbookAlocacao(painel);
  assert.deepEqual(wb.SheetNames, [
    'Dimensionamento ABC',
    'Mapa Estantes',
    'Caixas',
    'Conferencia ERP',
  ]);
  const dim = XLSX.utils.sheet_to_json(wb.Sheets['Dimensionamento ABC'], { header: 1 }) as unknown[][];
  assert.ok(dim.length >= 4);
  assert.equal((dim[3] as unknown[])[2], '2.13.023');

  const mapaRows = XLSX.utils.sheet_to_json(wb.Sheets['Mapa Estantes'], { header: 1 }) as unknown[][];
  const mapaText = mapaRows.flat().map(String).join(' | ');
  assert.ok(mapaText.includes('MAPA DA ESTRUTURA: Prateleira 1 — Hair Extrattus'));
  assert.ok(mapaText.includes('Pátio / Chão · Nível 1'));
  assert.ok(!mapaText.includes('Prateleira 1 (PICKING'));
});

test('calcularPaletizacao calcula normal, rotacionado e amarração espelhada sem ultrapassar o palete', () => {
  // Caixa 24 (A=22.5, C=19.5, L=14.7) no palete 100x120 e vão 74.1 cm
  const res = calcularPaletizacao(
    { alturaCm: 22.5, comprimentoCm: 19.5, larguraCm: 14.7, empilhamentoMax: 4, podeGirar: true, pesoBrutoKg: 4.5 },
    100,
    120,
    74.1,
  );
  assert.equal(res.normal.caixasPorLastro, 36);
  assert.equal(res.rotacionado?.caixasPorLastro, 40);
  assert.equal(res.amarracao.caixasPorLastro, 40);
  assert.equal(res.amarracao.temAmarracaoReal, true);
  assert.equal(res.melhorPadrao, 'amarracao');
  assert.equal(res.amarracao.maxCamadas, 3);
  assert.equal(res.amarracao.totalCaixasPalete, 120);
  assert.equal(res.amarracao.pesoTotalKg, 540);

  for (const c of [...res.amarracao.caixasImpar, ...res.amarracao.caixasPar]) {
    assert.ok(c.x >= -1e-6 && c.x + c.w <= 100 + 1e-6);
    assert.ok(c.y >= -1e-6 && c.y + c.h <= 120 + 1e-6);
  }
});

test('calcularPaletizacao respeita podeGirar = false e desabilita rotação/amarração mista', () => {
  const res = calcularPaletizacao(
    { alturaCm: 20, comprimentoCm: 30, larguraCm: 20, empilhamentoMax: 5, podeGirar: false },
    100,
    120,
    100,
  );
  assert.equal(res.rotacionado, null);
  assert.equal(res.normal.caixasPorLastro, 20);
  assert.equal(res.amarracao.caixasPorLastro, 20);
  assert.equal(res.amarracao.temAmarracaoReal, false);
  assert.ok(res.amarracao.caixasImpar.every((c) => !c.rotacionada));
  assert.equal(res.melhorPadrao, 'normal');
});

test('calcularPlantaVao posiciona blocos lado a lado e sinaliza estouro de largura', () => {
  const pos: PosicaoComItens = {
    id: 'est:A1',
    estruturaId: 'est',
    codigo: 'A1',
    coluna: 'A',
    colunaOrdem: 1,
    nivel: 1,
    andar: 1,
    lado: 1,
    papel: 'picking',
    larguraCm: 100,
    comprimentoCm: 120,
    alturaCm: 74.1,
    ativo: true,
    observacoes: null,
    larguraOcupadaCm: 110,
    larguraLivreCm: 0,
    ocupacaoPct: 110,
    temEstouro: true,
    totalCaixas: 40,
    totalUnidades: 480,
    itens: [
      {
        id: 'i1',
        posicaoId: 'est:A1',
        posicaoCodigo: 'A1',
        estruturaId: 'est',
        papel: 'picking',
        andar: 1,
        nivel: 1,
        produtoCodigo: '2.13.023',
        produtoDescricao: 'ITEM A',
        linhaPrefix: '2.13',
        nomeLinha: 'Hair',
        fileirasLargura: 3,
        camadasAltura: 3,
        fixado: false,
        observacoes: null,
        caixaId: 'cx',
        caixaCodigo: '24',
        caixaAlturaCm: 22.5,
        caixaComprimentoCm: 20,
        caixaLarguraCm: 20,
        caixasComprimento: 6,
        maxCamadas: 3,
        totalCaixas: 54,
        qtdeCx: 12,
        totalUnidades: 648,
        larguraOcupadaCm: 60,
        alturaOcupadaCm: 67.5,
        alturaVaoCm: 74.1,
        estouroAltura: false,
        coberturaMeses: 2,
      },
      {
        id: 'i2',
        posicaoId: 'est:A1',
        posicaoCodigo: 'A1',
        estruturaId: 'est',
        papel: 'picking',
        andar: 1,
        nivel: 1,
        produtoCodigo: '4.10.001',
        produtoDescricao: 'KIT B',
        linhaPrefix: '4.10',
        nomeLinha: 'Natum',
        fileirasLargura: 2,
        camadasAltura: 3,
        fixado: false,
        observacoes: null,
        caixaId: 'cx2',
        caixaCodigo: '29',
        caixaAlturaCm: 22.5,
        caixaComprimentoCm: 20,
        caixaLarguraCm: 25,
        caixasComprimento: 4,
        maxCamadas: 3,
        totalCaixas: 24,
        qtdeCx: 6,
        totalUnidades: 144,
        larguraOcupadaCm: 50,
        alturaOcupadaCm: 67.5,
        alturaVaoCm: 74.1,
        estouroAltura: false,
        coberturaMeses: 1,
      },
    ],
  };

  const planta = calcularPlantaVao(pos);
  assert.equal(planta.blocos.length, 2);
  assert.equal(planta.blocos[0].x, 0);
  assert.equal(planta.blocos[0].w, 60);
  assert.equal(planta.blocos[0].estouroLargura, false);
  assert.equal(planta.blocos[1].x, 60);
  assert.equal(planta.blocos[1].w, 50);
  assert.equal(planta.blocos[1].estouroLargura, true);
});

test('parsearPlanilhaMapa lê formato exportado do Nexus e formato Mapas_0309 (com deslocamentos)', () => {
  // 1) Formato exportado pelo Nexus (Dimensionamento ABC)
  const wbNexus = XLSX.utils.book_new();
  const wsDim = XLSX.utils.aoa_to_sheet([
    ['Local Picking', 'Local Pulmão', 'Código', 'Descrição'],
    ['A1, B2', 'A7', '2.13.036', 'BOTTOX VINTAGE 100 GR'],
    ['—', '—', '2.11.001', 'SEM ENDEREÇO'],
  ]);
  XLSX.utils.book_append_sheet(wbNexus, wsDim, 'Dimensionamento ABC');
  const resNexus = parsearPlanilhaMapa(wbNexus);
  assert.equal(resNexus.formato, 'nexus_dim');
  assert.equal(resNexus.produtosUnicos, 1);
  assert.deepEqual(
    resNexus.itens.map((i) => `${i.posicaoCodigo}:${i.produtoCodigo}`),
    ['A1:2.13.036', 'B2:2.13.036', 'A7:2.13.036'],
  );

  // 2) Formato grade Mapas_0309 (inclusive deslocamento 1 coluna à esquerda e 2 colunas E)
  const grid: unknown[][] = Array.from({ length: 15 }, () => Array(12).fill(''));
  grid[0][2] = 'E4';
  grid[1][2] = '2.11.019';
  grid[1][3] = '2.14.032'; // 2a coluna dentro do mesmo bloco E4
  grid[5][6] = 'D2'; // cabecalho na col 6, codigos deslocados na col 5 (estilo R61 Mapas_0309)
  grid[6][5] = '2.13.021';
  grid[7][5] = '2.13.021';

  const wb0309 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb0309, XLSX.utils.aoa_to_sheet(grid), 'Mapas_0309');
  const res0309 = parsearPlanilhaMapa(wb0309);
  assert.equal(res0309.formato, 'mapas_0309');
  assert.equal(res0309.abaUsada, 'Mapas_0309');
  assert.equal(res0309.produtosUnicos, 3);
  const byKey = new Map(res0309.itens.map((i) => [`${i.posicaoCodigo}:${i.produtoCodigo}`, i.fileirasLargura]));
  assert.equal(byKey.get('E4:2.11.019'), 1);
  assert.equal(byKey.get('E4:2.14.032'), 1);
  assert.equal(byKey.get('D2:2.13.021'), 2);
});
