import type { PosicaoComItens } from './types';

export type PadraoPaletizacao = 'normal' | 'rotacionado' | 'amarracao';

export interface DimensoesCaixaPalete {
  alturaCm: number;
  comprimentoCm: number;
  larguraCm: number;
  empilhamentoMax?: number | null;
  podeGirar?: boolean | null;
  pesoBrutoKg?: number | null;
}

export interface CaixaNoPalete {
  x: number;
  y: number;
  w: number;
  h: number;
  rotacionada: boolean;
}

export interface LayoutPalete {
  padrao: PadraoPaletizacao;
  rotulo: string;
  caixasImpar: CaixaNoPalete[];
  caixasPar: CaixaNoPalete[];
  caixasPorLastro: number;
  aproveitamentoAreaPct: number;
  sobraLarguraCm: number;
  sobraComprimentoCm: number;
  maxCamadas: number;
  alturaPilhaCm: number;
  totalCaixasPalete: number;
  pesoTotalKg: number | null;
  temAmarracaoReal: boolean;
  qtdNormais: number;
  qtdRotacionadas: number;
}

export interface ResultadoPaletizacao {
  paleteLarguraCm: number;
  paleteComprimentoCm: number;
  alturaVaoCm: number;
  normal: LayoutPalete;
  rotacionado: LayoutPalete | null;
  amarracao: LayoutPalete;
  melhorPadrao: PadraoPaletizacao;
}

export interface BlocoVaoPlanta {
  alocacaoId: string;
  produtoCodigo: string;
  produtoDescricao: string;
  caixaCodigo: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  fileiras: number;
  profundidade: number;
  camadas: number;
  totalCaixas: number;
  estouroAltura: boolean;
  estouroLargura: boolean;
  ehKit: boolean;
  ehColoracao: boolean;
}

export interface PlantaVaoResultado {
  larguraVaoCm: number;
  comprimentoVaoCm: number;
  alturaVaoCm: number;
  larguraOcupadaCm: number;
  larguraLivreCm: number;
  blocos: BlocoVaoPlanta[];
}

const EPS = 1e-6;

function arred(n: number): number {
  return Number(n.toFixed(3));
}

function espelharCamada(
  caixas: CaixaNoPalete[],
  refW: number,
  refD: number,
): CaixaNoPalete[] {
  return caixas.map((c) => ({
    x: arred(Math.max(0, refW - (c.x + c.w))),
    y: arred(Math.max(0, refD - (c.y + c.h))),
    w: c.w,
    h: c.h,
    rotacionada: c.rotacionada,
  }));
}

/**
 * Verifica fisicamente se todas as caixas da camada superior têm apoio real
 * sobre a camada inferior (sem pontas flutuando além do balanço tolerado).
 */
export function verificarApoioCamada(
  base: CaixaNoPalete[],
  topo: CaixaNoPalete[],
  minApoioPct = 0.85,
  maxBalancoCm = 1.5,
): boolean {
  if (base.length === 0 || topo.length === 0) return false;
  const baseMinX = base.reduce((m, c) => Math.min(m, c.x), Infinity);
  const baseMaxX = base.reduce((m, c) => Math.max(m, c.x + c.w), -Infinity);
  const baseMinY = base.reduce((m, c) => Math.min(m, c.y), Infinity);
  const baseMaxY = base.reduce((m, c) => Math.max(m, c.y + c.h), -Infinity);

  for (const t of topo) {
    if (
      t.x < baseMinX - maxBalancoCm ||
      t.x + t.w > baseMaxX + maxBalancoCm ||
      t.y < baseMinY - maxBalancoCm ||
      t.y + t.h > baseMaxY + maxBalancoCm
    ) {
      return false;
    }
    const areaT = t.w * t.h;
    if (areaT <= 0) return false;
    let overlap = 0;
    for (const b of base) {
      const ix = Math.max(0, Math.min(t.x + t.w, b.x + b.w) - Math.max(t.x, b.x));
      if (ix <= 0) continue;
      const iy = Math.max(0, Math.min(t.y + t.h, b.y + b.h) - Math.max(t.y, b.y));
      if (iy <= 0) continue;
      overlap += ix * iy;
    }
    if (overlap / areaT < minApoioPct) {
      return false;
    }
  }
  return true;
}

function gradeUniforme(
  largBox: number,
  compBox: number,
  wPalete: number,
  dPalete: number,
  rotacionada: boolean,
): CaixaNoPalete[] {
  const nx = Math.floor((wPalete + EPS) / largBox);
  const ny = Math.floor((dPalete + EPS) / compBox);
  const out: CaixaNoPalete[] = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      out.push({
        x: arred(ix * largBox),
        y: arred(iy * compBox),
        w: arred(largBox),
        h: arred(compBox),
        rotacionada,
      });
    }
  }
  return out;
}

function montarLayout(
  padrao: PadraoPaletizacao,
  rotulo: string,
  caixasImpar: CaixaNoPalete[],
  caixaAreaCm2: number,
  wPalete: number,
  dPalete: number,
  alturaBox: number,
  empilhamentoMax: number,
  alturaVaoCm: number,
  pesoBrutoKg: number | null,
): LayoutPalete {
  const count = caixasImpar.length;
  const maxX = caixasImpar.reduce((m, c) => Math.max(m, c.x + c.w), 0);
  const maxY = caixasImpar.reduce((m, c) => Math.max(m, c.y + c.h), 0);
  const areaPalete = wPalete * dPalete;
  const aproveitamentoAreaPct =
    areaPalete > 0 ? Math.min(100, Number((((count * caixaAreaCm2) / areaPalete) * 100).toFixed(1))) : 0;

  const cabemAltura = alturaBox > 0 ? Math.floor((alturaVaoCm + EPS) / alturaBox) : 1;
  const maxCamadas = Math.max(1, Math.min(Math.max(1, empilhamentoMax), Math.max(1, cabemAltura)));
  const alturaPilhaCm = Number((maxCamadas * alturaBox).toFixed(1));
  const totalCaixasPalete = count * maxCamadas;
  const pesoTotalKg =
    pesoBrutoKg != null && pesoBrutoKg > 0
      ? Number((totalCaixasPalete * pesoBrutoKg).toFixed(1))
      : null;

  const qtdNormais = caixasImpar.filter((c) => !c.rotacionada).length;
  const qtdRotacionadas = count - qtdNormais;
  const temAmarracaoReal = qtdNormais > 0 && qtdRotacionadas > 0;

  return {
    padrao,
    rotulo,
    caixasImpar,
    caixasPar: espelharCamada(caixasImpar, maxX > 0 ? maxX : wPalete, maxY > 0 ? maxY : dPalete),
    caixasPorLastro: count,
    aproveitamentoAreaPct,
    sobraLarguraCm: Number(Math.max(0, wPalete - maxX).toFixed(1)),
    sobraComprimentoCm: Number(Math.max(0, dPalete - maxY).toFixed(1)),
    maxCamadas,
    alturaPilhaCm,
    totalCaixasPalete,
    pesoTotalKg,
    temAmarracaoReal,
    qtdNormais,
    qtdRotacionadas,
  };
}

function melhorParticaoAmarracao(
  largBox: number,
  compBox: number,
  wPalete: number,
  dPalete: number,
): CaixaNoPalete[] {
  let melhor: CaixaNoPalete[] = [];
  let melhorQtd = -1;
  let melhorMista = false;

  const avaliar = (cand: CaixaNoPalete[]) => {
    const qtd = cand.length;
    const norm = cand.filter((c) => !c.rotacionada).length;
    const rot = qtd - norm;
    const mista = norm > 0 && rot > 0;
    if (qtd > melhorQtd || (qtd === melhorQtd && mista && !melhorMista)) {
      melhor = cand;
      melhorQtd = qtd;
      melhorMista = mista;
    }
  };

  // 1) Faixas horizontais ao longo do comprimento (Y): k fileiras normais + resto girado 90°
  const maxNy = Math.floor((dPalete + EPS) / compBox);
  const nxNormal = Math.floor((wPalete + EPS) / largBox);
  const nxRot = Math.floor((wPalete + EPS) / compBox);
  for (let k = 0; k <= maxNy; k++) {
    const list: CaixaNoPalete[] = [];
    for (let iy = 0; iy < k; iy++) {
      for (let ix = 0; ix < nxNormal; ix++) {
        list.push({
          x: arred(ix * largBox),
          y: arred(iy * compBox),
          w: arred(largBox),
          h: arred(compBox),
          rotacionada: false,
        });
      }
    }
    const yBase = k * compBox;
    const nyRot = Math.floor((dPalete - yBase + EPS) / largBox);
    for (let ry = 0; ry < nyRot; ry++) {
      for (let rx = 0; rx < nxRot; rx++) {
        list.push({
          x: arred(rx * compBox),
          y: arred(yBase + ry * largBox),
          w: arred(compBox),
          h: arred(largBox),
          rotacionada: true,
        });
      }
    }
    avaliar(list);
  }

  // 2) Faixas verticais ao longo da largura (X): k colunas normais + resto girado 90°
  const maxNx = Math.floor((wPalete + EPS) / largBox);
  const nyNormal = Math.floor((dPalete + EPS) / compBox);
  const nyRot = Math.floor((dPalete + EPS) / largBox);
  for (let k = 0; k <= maxNx; k++) {
    const list: CaixaNoPalete[] = [];
    for (let ix = 0; ix < k; ix++) {
      for (let iy = 0; iy < nyNormal; iy++) {
        list.push({
          x: arred(ix * largBox),
          y: arred(iy * compBox),
          w: arred(largBox),
          h: arred(compBox),
          rotacionada: false,
        });
      }
    }
    const xBase = k * largBox;
    const nxRotRem = Math.floor((wPalete - xBase + EPS) / compBox);
    for (let rx = 0; rx < nxRotRem; rx++) {
      for (let ry = 0; ry < nyRot; ry++) {
        list.push({
          x: arred(xBase + rx * compBox),
          y: arred(ry * largBox),
          w: arred(compBox),
          h: arred(largBox),
          rotacionada: true,
        });
      }
    }
    avaliar(list);
  }

  return melhor;
}

/**
 * Calcula arranjos proporcionais (normal 0°, girado 90° e amarração mista)
 * de uma caixa sobre o palete/estrado para base geométrica da expedição e FEFO.
 */
export function calcularPaletizacao(
  caixa: DimensoesCaixaPalete,
  paleteLarguraCm = 100,
  paleteComprimentoCm = 120,
  alturaVaoCm = 74.1,
): ResultadoPaletizacao {
  const wPal = paleteLarguraCm > 0 ? paleteLarguraCm : 100;
  const dPal = paleteComprimentoCm > 0 ? paleteComprimentoCm : 120;
  const hVao = alturaVaoCm > 0 ? alturaVaoCm : 74.1;

  const alt = caixa.alturaCm > 0 ? caixa.alturaCm : 1;
  const comp = caixa.comprimentoCm > 0 ? caixa.comprimentoCm : 1;
  const larg = caixa.larguraCm > 0 ? caixa.larguraCm : 1;
  const emp = Math.max(1, Math.round(caixa.empilhamentoMax ?? 4));
  const podeGirar = caixa.podeGirar !== false;
  const peso = caixa.pesoBrutoKg ?? null;
  const areaCaixa = larg * comp;

  const caixasNormais = gradeUniforme(larg, comp, wPal, dPal, false);
  const normal = montarLayout(
    'normal',
    'Normal (0°)',
    caixasNormais,
    areaCaixa,
    wPal,
    dPal,
    alt,
    emp,
    hVao,
    peso,
  );

  const rotacionado = podeGirar
    ? montarLayout(
        'rotacionado',
        'Girado (90°)',
        gradeUniforme(comp, larg, wPal, dPal, true),
        areaCaixa,
        wPal,
        dPal,
        alt,
        emp,
        hVao,
        peso,
      )
    : null;

  const caixasAmarracao = podeGirar
    ? melhorParticaoAmarracao(larg, comp, wPal, dPal)
    : caixasNormais;
  const amarracao = montarLayout(
    'amarracao',
    podeGirar ? 'Amarração' : 'Normal (sem giro)',
    caixasAmarracao,
    areaCaixa,
    wPal,
    dPal,
    alt,
    emp,
    hVao,
    peso,
  );

  let melhorPadrao: PadraoPaletizacao = 'normal';
  let melhorQtd = normal.caixasPorLastro;
  if (rotacionado && rotacionado.caixasPorLastro > melhorQtd) {
    melhorQtd = rotacionado.caixasPorLastro;
    melhorPadrao = 'rotacionado';
  }
  if (
    amarracao.caixasPorLastro > melhorQtd ||
    (amarracao.caixasPorLastro === melhorQtd && amarracao.temAmarracaoReal)
  ) {
    melhorPadrao = 'amarracao';
  }

  return {
    paleteLarguraCm: wPal,
    paleteComprimentoCm: dPal,
    alturaVaoCm: hVao,
    normal,
    rotacionado,
    amarracao,
    melhorPadrao,
  };
}

/**
 * Calcula a planta baixa proporcional dos produtos alocados dentro do vão,
 * identificando folga de largura e eventuais estouros físicos.
 */
export function calcularPlantaVao(
  posicao: PosicaoComItens,
  gruposPorCodigo?: Map<string, { ehKit?: boolean; ehColoracao?: boolean }>,
): PlantaVaoResultado {
  const wVao = posicao.larguraCm > 0 ? posicao.larguraCm : 100;
  const dVao = posicao.comprimentoCm > 0 ? posicao.comprimentoCm : 120;
  const hVao = posicao.alturaCm > 0 ? posicao.alturaCm : 74.1;

  let cursorX = 0;
  const blocos: BlocoVaoPlanta[] = posicao.itens.map((item) => {
    const largCx =
      item.caixaLarguraCm && item.caixaLarguraCm > 0
        ? item.caixaLarguraCm
        : item.fileirasLargura > 0 && item.larguraOcupadaCm > 0
          ? item.larguraOcupadaCm / item.fileirasLargura
          : 15;
    const compCx =
      item.caixaComprimentoCm && item.caixaComprimentoCm > 0
        ? item.caixaComprimentoCm
        : 20;
    const w = arred(Math.max(1, item.fileirasLargura) * largCx);
    const prof = Math.max(1, item.caixasComprimento || 1);
    const h = arred(Math.min(dVao, prof * compCx));
    const x = arred(cursorX);
    cursorX = arred(cursorX + w);
    const meta = gruposPorCodigo?.get(item.produtoCodigo);

    return {
      alocacaoId: item.id,
      produtoCodigo: item.produtoCodigo,
      produtoDescricao: item.produtoDescricao,
      caixaCodigo: item.caixaCodigo,
      x,
      y: 0,
      w,
      h,
      fileiras: Math.max(1, item.fileirasLargura),
      profundidade: prof,
      camadas: Math.max(1, item.camadasAltura),
      totalCaixas: item.totalCaixas,
      estouroAltura: item.estouroAltura || item.alturaOcupadaCm > hVao + 0.1,
      estouroLargura: cursorX > wVao + 0.1,
      ehKit: Boolean(meta?.ehKit),
      ehColoracao: Boolean(meta?.ehColoracao),
    };
  });

  const ocupada = cursorX > 0 ? cursorX : posicao.larguraOcupadaCm;
  return {
    larguraVaoCm: wVao,
    comprimentoVaoCm: dVao,
    alturaVaoCm: hVao,
    larguraOcupadaCm: Number(ocupada.toFixed(1)),
    larguraLivreCm: Number(Math.max(0, wVao - ocupada).toFixed(1)),
    blocos,
  };
}
