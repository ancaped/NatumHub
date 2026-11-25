import {
  calcularPaletizacao,
  verificarApoioCamada,
  type CaixaNoPalete,
} from './paletizacao';

function espelharEixo(
  caixas: CaixaNoPalete[],
  refW: number,
  refD: number,
  eixo: 'xy' | 'y' | 'x',
): CaixaNoPalete[] {
  return caixas.map((c) => ({
    x: eixo === 'y' ? c.x : Number(Math.max(0, refW - (c.x + c.w)).toFixed(3)),
    y: eixo === 'x' ? c.y : Number(Math.max(0, refD - (c.y + c.h)).toFixed(3)),
    w: c.w,
    h: c.h,
    rotacionada: c.rotacionada,
  }));
}

function layoutsIguais(a: CaixaNoPalete[], b: CaixaNoPalete[]): boolean {
  if (a.length !== b.length) return false;
  const sortFn = (u: CaixaNoPalete, v: CaixaNoPalete) =>
    u.x - v.x || u.y - v.y || u.w - v.w || u.h - v.h;
  const sa = [...a].sort(sortFn);
  const sb = [...b].sort(sortFn);
  return sa.every(
    (c, idx) =>
      Math.abs(c.x - sb[idx].x) < 0.2 &&
      Math.abs(c.y - sb[idx].y) < 0.2 &&
      Math.abs(c.w - sb[idx].w) < 0.2 &&
      Math.abs(c.h - sb[idx].h) < 0.2,
  );
}

function centralizarSobre(
  molde: CaixaNoPalete[],
  refMaxX: number,
  refMaxY: number,
  limW: number,
  limD: number,
): CaixaNoPalete[] | null {
  if (molde.length === 0) return null;
  const mMaxX = molde.reduce((m, c) => Math.max(m, c.x + c.w), 0);
  const mMaxY = molde.reduce((m, c) => Math.max(m, c.y + c.h), 0);
  const dx = Math.max(0, Math.min(limW - mMaxX, (refMaxX - mMaxX) / 2));
  const dy = Math.max(0, Math.min(limD - mMaxY, (refMaxY - mMaxY) / 2));
  const out = molde.map((c) => ({
    ...c,
    x: Number((c.x + dx).toFixed(3)),
    y: Number((c.y + dy).toFixed(3)),
  }));
  const cabe = out.every(
    (c) => c.x >= -1e-6 && c.x + c.w <= limW + 1e-6 && c.y >= -1e-6 && c.y + c.h <= limD + 1e-6,
  );
  return cabe ? out : null;
}

function parEstavel(impar: CaixaNoPalete[], par: CaixaNoPalete[], nz: number): boolean {
  if (!verificarApoioCamada(impar, par, 0.85, 1.5)) return false;
  if (nz >= 3 && !verificarApoioCamada(par, impar, 0.85, 1.5)) return false;
  return true;
}
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
  rotacionada: boolean;
  camada?: number;
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
  usarAmarracao?: boolean;
  podeGirar?: boolean;
  aplicarCulling?: boolean;
}

export interface GerarCaixasItem3dResultado {
  caixas: Caixa3dInstancia[];
  footprintW: number;
  footprintD: number;
  heightMax: number;
  nx: number;
  ny: number;
  nz: number;
  amarrado: boolean;
}

export interface Camera3d {
  yawDeg: number;
  pitchDeg: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
}

export function criarCamera3d(yawDeg: number, pitchDeg: number): Camera3d {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  return {
    yawDeg,
    pitchDeg,
    ux: cosY,
    uy: sinY,
    vx: -sinY * sinP,
    vy: cosY * sinP,
    vz: cosP,
    wx: sinY * cosP,
    wy: -cosY * cosP,
    wz: sinP,
  };
}

export function projetarPonto3d(
  cam: Camera3d,
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cz: number,
): { px: number; py: number; depth: number } {
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  return {
    px: dx * cam.ux + dy * cam.uy,
    py: -(dx * cam.vx + dy * cam.vy + dz * cam.vz),
    depth: dx * cam.wx + dy * cam.wy + dz * cam.wz,
  };
}

/**
 * Ordenação topológica painter's algorithm para caixas ortogonais em qualquer ângulo yaw 0..360°.
 */
export function ordenarCaixas3dPorCamera<
  T extends { x: number; y: number; z: number; dx: number; dy: number; dz: number },
>(caixas: T[], yawDeg: number): T[] {
  const n = caixas.length;
  if (n <= 1) return [...caixas];

  const yaw = (yawDeg * Math.PI) / 180;
  const wx = Math.sin(yaw);
  const wy = -Math.cos(yaw);
  const EPS = 0.05;

  const camSignX = Math.abs(wx) > 1e-4 ? (wx > 0 ? 1 : -1) : 0;
  const camSignY = Math.abs(wy) > 1e-4 ? (wy > 0 ? 1 : -1) : 0;

  const adj: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n);

  const depth = caixas.map(
    (c) => (c.x + c.dx * 0.5) * wx + (c.y + c.dy * 0.5) * wy + (c.z + c.dz * 0.5) * 0.45,
  );

  for (let i = 0; i < n; i++) {
    const a = caixas[i];
    for (let j = i + 1; j < n; j++) {
      const b = caixas[j];

      if (a.z + a.dz <= b.z + EPS) {
        adj[i].push(j);
        indeg[j]++;
        continue;
      }
      if (b.z + b.dz <= a.z + EPS) {
        adj[j].push(i);
        indeg[i]++;
        continue;
      }

      const xSepA =
        camSignX === 1
          ? a.x + a.dx <= b.x + EPS
          : camSignX === -1
            ? a.x >= b.x + b.dx - EPS
            : false;
      const xSepB =
        camSignX === 1
          ? b.x + b.dx <= a.x + EPS
          : camSignX === -1
            ? b.x >= a.x + a.dx - EPS
            : false;

      const ySepA =
        camSignY === 1
          ? a.y + a.dy <= b.y + EPS
          : camSignY === -1
            ? a.y >= b.y + b.dy - EPS
            : false;
      const ySepB =
        camSignY === 1
          ? b.y + b.dy <= a.y + EPS
          : camSignY === -1
            ? b.y >= a.y + a.dy - EPS
            : false;

      const aBeforeB = (xSepA && !ySepB) || (ySepA && !xSepB);
      const bBeforeA = (xSepB && !ySepA) || (ySepB && !xSepA);

      if (aBeforeB && !bBeforeA) {
        adj[i].push(j);
        indeg[j]++;
      } else if (bBeforeA && !aBeforeB) {
        adj[j].push(i);
        indeg[i]++;
      }
    }
  }

  const ready: number[] = [];
  for (let i = 0; i < n; i++) {
    if (indeg[i] === 0) ready.push(i);
  }
  ready.sort((a, b) => depth[a] - depth[b]);

  const ordered: T[] = [];
  const emitted = new Uint8Array(n);

  while (ready.length > 0) {
    const u = ready.shift()!;
    emitted[u] = 1;
    ordered.push(caixas[u]);
    for (const v of adj[u]) {
      indeg[v]--;
      if (indeg[v] === 0) {
        ready.push(v);
        ready.sort((a, b) => depth[a] - depth[b]);
      }
    }
  }

  if (ordered.length < n) {
    const rest: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!emitted[i]) rest.push(i);
    }
    rest.sort((a, b) => depth[a] - depth[b]);
    for (const idx of rest) ordered.push(caixas[idx]);
  }

  return ordered;
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
 * Gera instâncias individuais de caixas 3D com folga real, amarração calculada
 * por camada (ímpar × par), nível de detalhe automático (LOD) e ordenação por câmera.
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
    usarAmarracao = true,
    podeGirar = true,
    aplicarCulling = true,
  } = params;

  const rawNx = Math.max(1, Math.round(fileirasLargura || 1));
  const rawNy = Math.max(1, Math.round(caixasComprimento || 1));
  const rawNz = Math.max(1, Math.round(camadasAltura || 1));

  const capX = modoDetalhe === 'panorama' ? 5 : 8;
  const capY = modoDetalhe === 'panorama' ? 4 : 6;
  const capZ = modoDetalhe === 'panorama' ? 5 : 8;

  const nx = aplicarCulling ? Math.min(rawNx, capX) : rawNx;
  const ny = aplicarCulling ? Math.min(rawNy, capY) : rawNy;
  const nz = aplicarCulling ? Math.min(rawNz, capZ) : rawNz;

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
  const footprintDBase = Math.min(slotDepthCm, Math.max(14, rawD));
  const heightMax = Math.min(
    maxHeightCm,
    Math.max(8, alturaOcupadaCm > 0 ? alturaOcupadaCm : rawH),
  );

  const qtdAlvoLimpo = Math.max(0, Math.round(qtdCaixasAlvo));
  if (qtdAlvoLimpo === 0) {
    return {
      caixas: [],
      footprintW,
      footprintD: footprintDBase,
      heightMax,
      nx,
      ny,
      nz,
      amarrado: false,
    };
  }

  const gapZ = nz > 1 ? Math.min(1.4, (heightMax / nz) * 0.08) : 0;
  const boxH = Math.max(2.2, (heightMax - gapZ * (nz - 1)) / nz);

  // Tenta calcular amarração real quando a caixa tem dimensões válidas e pode girar
  let camadaImpar: CaixaNoPalete[] | null = null;
  let camadaPar: CaixaNoPalete[] | null = null;
  let amarrado = false;
  let footprintD = footprintDBase;

  if (
    usarAmarracao &&
    podeGirar &&
    caixaLarguraCm &&
    caixaLarguraCm > 0 &&
    caixaComprimentoCm &&
    caixaComprimentoCm > 0
  ) {
    const depthDisponivel = Math.max(footprintDBase, slotDepthCm);
    const resPal = calcularPaletizacao(
      {
        alturaCm: caixaAlturaCm && caixaAlturaCm > 0 ? caixaAlturaCm : boxH,
        comprimentoCm: caixaComprimentoCm,
        larguraCm: caixaLarguraCm,
        empilhamentoMax: rawNz,
        podeGirar: true,
      },
      footprintW,
      depthDisponivel,
      heightMax,
    );

    if (resPal.amarracao.temAmarracaoReal && resPal.amarracao.caixasPorLastro > 0) {
      const impar = resPal.amarracao.caixasImpar;
      const maxX = impar.reduce((m, c) => Math.max(m, c.x + c.w), 0);
      const maxY = impar.reduce((m, c) => Math.max(m, c.y + c.h), 0);
      const candidatosPar = (['xy', 'y', 'x'] as const).map((eixo) =>
        espelharEixo(impar, maxX, maxY, eixo),
      );
      const parEscolhido = candidatosPar.find(
        (cand) => !layoutsIguais(impar, cand) && parEstavel(impar, cand, nz),
      );

      camadaImpar = impar;
      if (parEscolhido) {
        camadaPar = parEscolhido;
        amarrado = true;
      } else {
        camadaPar = impar;
        amarrado = false;
      }
      footprintD = depthDisponivel;
    } else if (
      nz > 1 &&
      resPal.rotacionado &&
      resPal.rotacionado.caixasPorLastro > 0 &&
      resPal.normal.caixasPorLastro > 0 &&
      Math.abs(caixaLarguraCm - caixaComprimentoCm) > 0.5 &&
      resPal.rotacionado.caixasPorLastro >= Math.floor(resPal.normal.caixasPorLastro * 0.85)
    ) {
      const impar = resPal.normal.caixasImpar;
      const maxX = impar.reduce((m, c) => Math.max(m, c.x + c.w), 0);
      const maxY = impar.reduce((m, c) => Math.max(m, c.y + c.h), 0);
      const rotCentralizado = centralizarSobre(
        resPal.rotacionado.caixasImpar,
        maxX,
        maxY,
        footprintW,
        depthDisponivel,
      );
      if (rotCentralizado && parEstavel(impar, rotCentralizado, nz)) {
        camadaImpar = impar;
        camadaPar = rotCentralizado;
        amarrado = true;
        footprintD = depthDisponivel;
      }
    }
  }

  const usarLayoutAmarrado =
    camadaImpar !== null &&
    camadaPar !== null &&
    !(modoDetalhe === 'panorama' && aplicarCulling && camadaImpar.length > 20);

  if (usarLayoutAmarrado && camadaImpar && camadaPar) {
    const capPorLastro = Math.max(camadaImpar.length, camadaPar.length);
    const capAmarradoTotal = capPorLastro * nz;
    const capBruto = Math.max(capAmarradoTotal, rawNx * rawNy * rawNz);
    const qtdVisual =
      aplicarCulling && nz < rawNz
        ? Math.min(
            capAmarradoTotal,
            Math.max(1, Math.round((qtdAlvoLimpo / capBruto) * capAmarradoTotal)),
          )
        : Math.min(capAmarradoTotal, qtdAlvoLimpo);

    const brutas: Caixa3dInstancia[] = [];
    let restantes = qtdVisual;

    for (let iz = 0; iz < nz && restantes > 0; iz++) {
      const molde = [...(iz % 2 === 0 ? camadaImpar : camadaPar)].sort(
        (a, b) => a.y - b.y || a.x - b.x,
      );
      for (let idx = 0; idx < molde.length && restantes > 0; idx++) {
        const c = molde[idx];
        const insetX = Math.min(0.75, c.w * 0.045);
        const insetY = Math.min(0.75, c.h * 0.045);
        brutas.push({
          x: xStart + c.x + insetX,
          y: yStart + c.y + insetY,
          z: zBase + iz * (boxH + gapZ),
          dx: Math.max(2.2, c.w - 2 * insetX),
          dy: Math.max(2.6, c.h - 2 * insetY),
          dz: boxH,
          ix: idx,
          iy: 0,
          iz,
          rotacionada: c.rotacionada,
          camada: iz + 1,
        });
        restantes--;
      }
    }

    const caixas = ordenarCaixas3dPorCamera(brutas, dirSign === 1 ? 35 : -35);
    return {
      caixas,
      footprintW,
      footprintD,
      heightMax,
      nx,
      ny,
      nz,
      amarrado,
    };
  }

  // Fallback de grade uniforme (com LOD e culling opcional)
  const capRaw = rawNx * rawNy * rawNz;
  const capVisual = nx * ny * nz;
  const qtdVisual =
    capVisual < capRaw
      ? Math.min(
          capVisual,
          Math.max(1, Math.round((qtdAlvoLimpo / capRaw) * capVisual)),
        )
      : Math.min(capVisual, qtdAlvoLimpo);

  const gapX = nx > 1 ? Math.min(1.8, (footprintW / nx) * 0.1) : 0;
  const gapY = ny > 1 ? Math.min(2.0, (footprintD / ny) * 0.1) : 0;

  const boxW = Math.max(2.2, (footprintW - gapX * (nx - 1)) / nx);
  const boxD = Math.max(2.6, (footprintD - gapY * (ny - 1)) / ny);

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

        if (aplicarCulling) {
          const frontExposed = iy === 0 || !occ[iz][iy - 1][ix];
          const topExposed = iz === nz - 1 || !occ[iz + 1][iy][ix];
          const sideIx = ix + dirSign;
          const sideExposed =
            sideIx < 0 || sideIx >= nx || !occ[iz][iy][sideIx];
          if (!frontExposed && !topExposed && !sideExposed) continue;
        }

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
          rotacionada: false,
          camada: iz + 1,
        });
      }
    }
  }

  return {
    caixas,
    footprintW,
    footprintD,
    heightMax,
    nx,
    ny,
    nz,
    amarrado: false,
  };
}
