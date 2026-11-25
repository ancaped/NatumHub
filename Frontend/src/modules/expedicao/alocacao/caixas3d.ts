import type { PosicaoComItens, ProdutoDimensao } from './types';

export interface SaldoAlocacao {
  caixasEstoque: number;
  caixasCapacidade: number;
  estoqueTotalProdutoCx: number | null;
  semSaldoInfo: boolean;
}

export interface Caixa3dInstancia {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  ix: number;
  iy: number;
  iz: number;
}

export interface GerarCaixasItem3dParams {
  xStart: number;
  yStart: number;
  zBase: number;
  maxWidthCm: number;
  slotDepthCm: number;
  maxHeightCm: number;
  fileirasLargura: number;
  caixasComprimento: number;
  camadasAltura: number;
  larguraOcupadaCm: number;
  alturaOcupadaCm: number;
  caixaLarguraCm: number | null;
  caixaComprimentoCm: number | null;
  caixaAlturaCm: number | null;
  qtdCaixasAlvo: number;
  dirSign: 1 | -1;
  modoDetalhe: 'panorama' | 'foco';
}

export interface GerarCaixasItem3dResultado {
  caixas: Caixa3dInstancia[];
  footprintW: number;
  footprintD: number;
  heightMax: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Distribui o estoque real do ERP (em caixas) pelas alocações de cada produto,
 * priorizando vãos de picking antes de pulmão e menor andar primeiro.
 */
export function distribuirEstoquePorAlocacao(
  posicoes: PosicaoComItens[],
  prodPorCodigo: Map<string, ProdutoDimensao>,
): Map<string, SaldoAlocacao> {
  const resultado = new Map<string, SaldoAlocacao>();
  const porProduto = new Map<
    string,
    Array<{ pos: PosicaoComItens; item: PosicaoComItens['itens'][number] }>
  >();

  for (const pos of posicoes) {
    for (const item of pos.itens) {
      const lista = porProduto.get(item.produtoCodigo);
      if (lista) {
        lista.push({ pos, item });
      } else {
        porProduto.set(item.produtoCodigo, [{ pos, item }]);
      }
    }
  }

  for (const [codigo, entradas] of porProduto.entries()) {
    entradas.sort((a, b) => {
      const pA = a.pos.papel === 'picking' ? 0 : 1;
      const pB = b.pos.papel === 'picking' ? 0 : 1;
      if (pA !== pB) return pA - pB;
      if (a.pos.andar !== b.pos.andar) return a.pos.andar - b.pos.andar;
      return a.pos.codigo.localeCompare(b.pos.codigo);
    });

    const prod = prodPorCodigo.get(codigo);
    const qtdePorCx = prod?.qtdeCxEfetiva ?? entradas[0]?.item.qtdeCx ?? null;

    let estoqueTotalProdutoCx: number | null = null;
    if (prod?.estoqueCaixas != null) {
      estoqueTotalProdutoCx = Math.max(0, Math.ceil(prod.estoqueCaixas));
    } else if (prod && prod.estoqueAtual <= 0) {
      estoqueTotalProdutoCx = 0;
    } else if (prod && prod.estoqueAtual > 0 && qtdePorCx != null && qtdePorCx > 0) {
      estoqueTotalProdutoCx = Math.ceil(prod.estoqueAtual / qtdePorCx);
    }

    const semSaldoInfo = estoqueTotalProdutoCx === null;
    let restante = estoqueTotalProdutoCx ?? 0;

    for (const { item } of entradas) {
      const cap = Math.max(1, item.totalCaixas || 1);
      if (semSaldoInfo) {
        resultado.set(item.id, {
          caixasEstoque: cap,
          caixasCapacidade: cap,
          estoqueTotalProdutoCx: null,
          semSaldoInfo: true,
        });
      } else {
        const usado = Math.min(cap, Math.max(0, restante));
        restante = Math.max(0, restante - usado);
        resultado.set(item.id, {
          caixasEstoque: usado,
          caixasCapacidade: cap,
          estoqueTotalProdutoCx,
          semSaldoInfo: false,
        });
      }
    }
  }

  return resultado;
}

/**
 * Gera instâncias individuais de caixas 3D com folga real entre unidades,
 * nível de detalhe automático (LOD), hidden-box culling e ordem painter's algorithm.
 */
export function gerarCaixasItem3d(
  params: GerarCaixasItem3dParams,
): GerarCaixasItem3dResultado {
  const {
    xStart,
    yStart,
    zBase,
    maxWidthCm,
    slotDepthCm,
    maxHeightCm,
    fileirasLargura,
    caixasComprimento,
    camadasAltura,
    larguraOcupadaCm,
    alturaOcupadaCm,
    caixaLarguraCm,
    caixaComprimentoCm,
    caixaAlturaCm,
    qtdCaixasAlvo,
    dirSign,
    modoDetalhe,
  } = params;

  const rawNx = Math.max(1, Math.round(fileirasLargura || 1));
  const rawNy = Math.max(1, Math.round(caixasComprimento || 1));
  const rawNz = Math.max(1, Math.round(camadasAltura || 1));

  const capX = modoDetalhe === 'panorama' ? 5 : 8;
  const capY = modoDetalhe === 'panorama' ? 4 : 6;
  const capZ = modoDetalhe === 'panorama' ? 5 : 8;

  const nx = Math.min(rawNx, capX);
  const ny = Math.min(rawNy, capY);
  const nz = Math.min(rawNz, capZ);

  const rawW =
    caixaLarguraCm && caixaLarguraCm > 0
      ? rawNx * caixaLarguraCm
      : larguraOcupadaCm || 25;
  const rawD =
    caixaComprimentoCm && caixaComprimentoCm > 0
      ? rawNy * caixaComprimentoCm
      : Math.min(slotDepthCm, rawNy * 28);
  const rawH =
    caixaAlturaCm && caixaAlturaCm > 0
      ? rawNz * caixaAlturaCm
      : alturaOcupadaCm || maxHeightCm * 0.7;

  const footprintW = Math.min(
    maxWidthCm,
    Math.max(8, larguraOcupadaCm > 0 ? larguraOcupadaCm : rawW),
  );
  const footprintD = Math.min(slotDepthCm, Math.max(14, rawD));
  const heightMax = Math.min(
    maxHeightCm,
    Math.max(8, alturaOcupadaCm > 0 ? alturaOcupadaCm : rawH),
  );

  const capRaw = rawNx * rawNy * rawNz;
  const capVisual = nx * ny * nz;

  const qtdAlvoLimpo = Math.max(0, Math.round(qtdCaixasAlvo));
  const qtdVisual =
    qtdAlvoLimpo <= 0
      ? 0
      : capVisual < capRaw
        ? Math.min(
            capVisual,
            Math.max(1, Math.round((qtdAlvoLimpo / capRaw) * capVisual)),
          )
        : Math.min(capVisual, qtdAlvoLimpo);

  if (qtdVisual === 0) {
    return { caixas: [], footprintW, footprintD, heightMax, nx, ny, nz };
  }

  const gapX = nx > 1 ? Math.min(1.8, (footprintW / nx) * 0.1) : 0;
  const gapY = ny > 1 ? Math.min(2.0, (footprintD / ny) * 0.1) : 0;
  const gapZ = nz > 1 ? Math.min(1.4, (heightMax / nz) * 0.08) : 0;

  const boxW = Math.max(2.2, (footprintW - gapX * (nx - 1)) / nx);
  const boxD = Math.max(2.6, (footprintD - gapY * (ny - 1)) / ny);
  const boxH = Math.max(2.2, (heightMax - gapZ * (nz - 1)) / nz);

  // Matriz 3D [iz][iy][ix] preenchida de baixo para cima e frente para trás
  const occ: boolean[][][] = Array.from({ length: nz }, () =>
    Array.from({ length: ny }, () => Array<boolean>(nx).fill(false)),
  );

  let restantes = qtdVisual;
  for (let iz = 0; iz < nz && restantes > 0; iz++) {
    for (let iy = 0; iy < ny && restantes > 0; iy++) {
      for (let ix = 0; ix < nx && restantes > 0; ix++) {
        occ[iz][iy][ix] = true;
        restantes--;
      }
    }
  }

  const caixas: Caixa3dInstancia[] = [];
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = ny - 1; iy >= 0; iy--) {
      for (let step = 0; step < nx; step++) {
        const ix = dirSign === 1 ? step : nx - 1 - step;
        if (!occ[iz][iy][ix]) continue;

        const frontExposed = iy === 0 || !occ[iz][iy - 1][ix];
        const topExposed = iz === nz - 1 || !occ[iz + 1][iy][ix];
        const sideIx = ix + dirSign;
        const sideExposed = sideIx < 0 || sideIx >= nx || !occ[iz][iy][sideIx];

        if (!frontExposed && !topExposed && !sideExposed) continue;

        caixas.push({
          x: xStart + ix * (boxW + gapX),
          y: yStart + iy * (boxD + gapY),
          z: zBase + iz * (boxH + gapZ),
          dx: boxW,
          dy: boxD,
          dz: boxH,
          ix,
          iy,
          iz,
        });
      }
    }
  }

  return { caixas, footprintW, footprintD, heightMax, nx, ny, nz };
}
