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
import type {
  AlocacaoItemView,
  Caixa,
  PosicaoComItens,
  ProdutoDimensao,
} from './types';

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

export interface CoresItem3d {
  top: string;
  front: string;
  side: string;
  stroke: string;
  swatch: string;
}

const PALETA_MULTI_ITEM: Array<{
  normal: CoresItem3d;
  rot: CoresItem3d;
}> = [
  {
    normal: { top: '#f5ead6', front: '#e6cfa9', side: '#cfa974', stroke: '#7c5d36', swatch: '#e6cfa9' },
    rot: { top: '#eee0c5', front: '#ddc398', side: '#c49c66', stroke: '#7c5d36', swatch: '#e6cfa9' },
  },
  {
    normal: { top: '#e7eedd', front: '#d2dfc2', side: '#b2c69c', stroke: '#4d6439', swatch: '#c5d6b0' },
    rot: { top: '#dde7d0', front: '#c5d6b0', side: '#a3b88c', stroke: '#4d6439', swatch: '#c5d6b0' },
  },
  {
    normal: { top: '#e4ecf2', front: '#cad9e4', side: '#a3bccd', stroke: '#3e5c73', swatch: '#bfd1df' },
    rot: { top: '#dae4ec', front: '#bdcfdd', side: '#94afc2', stroke: '#3e5c73', swatch: '#bfd1df' },
  },
  {
    normal: { top: '#f5e2d4', front: '#e8c4ab', side: '#d39f7e', stroke: '#8a5233', swatch: '#e3b89b' },
    rot: { top: '#eed6c5', front: '#dfb599', side: '#c7906e', stroke: '#8a5233', swatch: '#e3b89b' },
  },
  {
    normal: { top: '#eae8e4', front: '#d6d3cd', side: '#b5b0a6', stroke: '#57534e', swatch: '#cbc7bf' },
    rot: { top: '#e0ddd8', front: '#cac6be', side: '#a8a298', stroke: '#57534e', swatch: '#cbc7bf' },
  },
  {
    normal: { top: '#f7efd2', front: '#ead9a4', side: '#d4bb70', stroke: '#7c6525', swatch: '#e3cf91' },
    rot: { top: '#efe4bf', front: '#e1cd91', side: '#c8ae62', stroke: '#7c6525', swatch: '#e3cf91' },
  },
];

/**
 * Paleta 3D compartilhada entre a Prateleira 3D e o Palete 3D no vão.
 * Vãos com 1 produto preservam o estilo clássico; vãos multi-produto recebem tons sóbrios distintos.
 */
export function coresItemVao3d(
  itemIndex: number,
  totalItensNoVao: number,
  estouro: boolean,
  ehColoracao: boolean,
  ehKit: boolean,
  rotacionada = false,
): CoresItem3d {
  if (estouro) {
    return rotacionada
      ? { top: '#fecaca', front: '#fca5a5', side: '#f87171', stroke: '#dc2626', swatch: '#fca5a5' }
      : { top: '#fee2e2', front: '#fecaca', side: '#fca5a5', stroke: '#dc2626', swatch: '#fca5a5' };
  }
  if (totalItensNoVao >= 2) {
    const entry = PALETA_MULTI_ITEM[Math.abs(itemIndex) % PALETA_MULTI_ITEM.length];
    return rotacionada ? entry.rot : entry.normal;
  }
  if (ehColoracao) {
    return rotacionada
      ? { top: '#fde9b4', front: '#fcd878', side: '#f6c33b', stroke: '#d97706', swatch: '#fde68a' }
      : { top: '#fef3c7', front: '#fde68a', side: '#fcd34d', stroke: '#d97706', swatch: '#fde68a' };
  }
  if (ehKit) {
    return rotacionada
      ? { top: '#dcdce0', front: '#c8c8ce', side: '#9595a0', stroke: '#3f3f46', swatch: '#d4d4d8' }
      : { top: '#e4e4e7', front: '#d4d4d8', side: '#a1a1aa', stroke: '#3f3f46', swatch: '#d4d4d8' };
  }
  return rotacionada ? PALETA_MULTI_ITEM[0].rot : PALETA_MULTI_ITEM[0].normal;
}

function coberturaIntervalo(
  minA: number,
  maxA: number,
  segs: Array<[number, number]>,
): number {
  const lenA = maxA - minA;
  if (lenA <= 0 || segs.length === 0) return 0;
  const clipped = segs
    .map(([s, e]) => [Math.max(minA, s), Math.min(maxA, e)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  if (clipped.length === 0) return 0;
  let coberto = 0;
  let [curS, curE] = clipped[0];
  for (let i = 1; i < clipped.length; i++) {
    const [ns, ne] = clipped[i];
    if (ns <= curE) {
      curE = Math.max(curE, ne);
    } else {
      coberto += curE - curS;
      curS = ns;
      curE = ne;
    }
  }
  coberto += curE - curS;
  return coberto / lenA;
}

function cullarCaixasInternas(
  caixas: Caixa3dInstancia[],
  dirSign: 1 | -1,
): Caixa3dInstancia[] {
  if (caixas.length <= 4) return caixas;
  const porCamada = new Map<number, Caixa3dInstancia[]>();
  for (const b of caixas) {
    const arr = porCamada.get(b.iz);
    if (arr) arr.push(b);
    else porCamada.set(b.iz, [b]);
  }

  const tolGap = 1.2;
  return caixas.filter((a) => {
    const acima = porCamada.get(a.iz + 1);
    if (!acima || acima.length === 0) return true;
    const mesmaCamada = porCamada.get(a.iz) ?? [];

    // 1) Cobertura superior com expansão sutil para absorver folga entre caixas
    const areaA = a.dx * a.dy;
    let overlapTopo = 0;
    for (const u of acima) {
      const ix = Math.max(
        0,
        Math.min(a.x + a.dx, u.x + u.dx + tolGap) - Math.max(a.x, u.x - tolGap),
      );
      if (ix <= 0) continue;
      const iy = Math.max(
        0,
        Math.min(a.y + a.dy, u.y + u.dy + tolGap) - Math.max(a.y, u.y - tolGap),
      );
      if (iy <= 0) continue;
      overlapTopo += ix * iy;
    }
    if (areaA <= 0 || overlapTopo / areaA < 0.96) return true;

    // 2) Cobertura frontal (caixas na mesma camada imediatamente em Y < a.y)
    const segsFrente: Array<[number, number]> = [];
    for (const b of mesmaCamada) {
      if (b === a) continue;
      if (b.y + b.dy <= a.y + 0.5 && b.y + b.dy >= a.y - 3.5) {
        segsFrente.push([b.x - tolGap, b.x + b.dx + tolGap]);
      }
    }
    if (coberturaIntervalo(a.x, a.x + a.dx, segsFrente) < 0.96) return true;

    // 3) Cobertura lateral voltada para a câmera (dirSign = 1 -> +X, -1 -> -X)
    const segsLado: Array<[number, number]> = [];
    for (const b of mesmaCamada) {
      if (b === a) continue;
      const encostaLado =
        dirSign === 1
          ? b.x >= a.x + a.dx - 0.5 && b.x <= a.x + a.dx + 3.5
          : b.x + b.dx <= a.x + 0.5 && b.x + b.dx >= a.x - 3.5;
      if (encostaLado) {
        segsLado.push([b.y - tolGap, b.y + b.dy + tolGap]);
      }
    }
    if (coberturaIntervalo(a.y, a.y + a.dy, segsLado) < 0.96) return true;

    return false;
  });
}

export interface ItemVao3dLayout {
  item: AlocacaoItemView;
  itemIndex: number;
  estCx: number;
  capCx: number;
  amarrado: boolean;
  caixas: Caixa3dInstancia[];
}

export interface LayoutVao3d {
  wVao: number;
  dVao: number;
  hVao: number;
  larguraLivreCm: number;
  itens: ItemVao3dLayout[];
  totalEstoqueVao: number;
}

/**
 * Fonte única do arranjo 3D de um vão, garantindo paridade física exata entre
 * a Prateleira 3D completa e o Palete 3D girável do drawer.
 */
export function gerarLayoutVao3d(params: {
  posicao: PosicaoComItens;
  saldos: Map<string, SaldoAlocacao>;
  caixaPorId: Map<string, Caixa>;
  modoQtd: 'estoque' | 'capacidade';
  usarAmarracao: boolean;
  zBase?: number;
  alturaMaxCaixasCm?: number;
  aplicarCulling?: boolean;
  dirSign?: 1 | -1;
}): LayoutVao3d {
  const {
    posicao,
    saldos,
    caixaPorId,
    modoQtd,
    usarAmarracao,
    zBase = 0,
    alturaMaxCaixasCm,
    aplicarCulling = false,
    dirSign = 1,
  } = params;

  const wVao = posicao.larguraCm > 0 ? posicao.larguraCm : 100;
  const dVao = posicao.comprimentoCm > 0 ? posicao.comprimentoCm : 120;
  const hVao = posicao.alturaCm > 0 ? posicao.alturaCm : 74;
  const hBase = alturaMaxCaixasCm ?? hVao;
  const gap = posicao.itens.length > 1 ? 1.2 : 0;

  let cursorX = 0;
  let totalEstoqueVao = 0;
  const itens: ItemVao3dLayout[] = [];
  const basesLayout = new Map<
    string,
    { x0: number; y0: number; footprintW: number; footprintD: number; zTop: number }
  >();

  const ordenados = posicao.itens
    .map((item, itemIndex) => ({ item, itemIndex }))
    .sort((a, b) => Number(Boolean(a.item.empilhadoSobre)) - Number(Boolean(b.item.empilhadoSobre)));

  for (const { item, itemIndex } of ordenados) {
    const ehSobreposto = Boolean(item.empilhadoSobre);
    const baseAlvo = item.empilhadoSobre ? basesLayout.get(item.empilhadoSobre) : undefined;

    const disp = baseAlvo ? baseAlvo.footprintW : Math.max(0, wVao - cursorX);
    if (!baseAlvo && disp < 4) break;

    const modoItem = item.orientacaoModo ?? 'auto';
    const oriEfetiva = item.orientacaoEfetiva ?? 'normal';
    const isRot = !item.amarrado && oriEfetiva === 'rotacionado';
    const cxLarg = isRot ? item.caixaComprimentoCm : item.caixaLarguraCm;
    const cxComp = isRot ? item.caixaLarguraCm : item.caixaComprimentoCm;

    const wEstimado =
      item.larguraOcupadaCm > 0
        ? item.larguraOcupadaCm
        : Math.max(1, item.fileirasLargura) * (cxLarg ?? 20);
    const wItem = Math.min(disp, Math.max(8, wEstimado));

    const saldo = saldos.get(item.id);
    const estCx = saldo?.caixasEstoque ?? item.totalCaixas;
    const capCx = saldo?.caixasCapacidade ?? item.totalCaixas;
    totalEstoqueVao += estCx;

    const qtdAlvo = modoQtd === 'estoque' ? estCx : capCx;
    const cxPodeGirar = caixaPorId.get(item.caixaId ?? '')?.podeGirar !== false;
    const usarAmarracaoItem =
      modoItem === 'normal' || modoItem === 'rotacionado'
        ? false
        : modoItem === 'amarracao'
          ? usarAmarracao && cxPodeGirar
          : usarAmarracao && (Boolean(item.amarrado) || oriEfetiva === 'amarracao' || posicao.itens.length === 1);
    const podeGirarItem =
      modoItem === 'normal' || modoItem === 'rotacionado' ? false : cxPodeGirar;

    const zBaseItem = baseAlvo ? baseAlvo.zTop + 0.6 : zBase;
    const hDispTotal = hBase + (item.estouroAltura || posicao.temEstouro ? 10 : 0);
    const hDispItem = baseAlvo
      ? Math.max(8, hDispTotal - (baseAlvo.zTop - zBase))
      : hDispTotal;
    const hTarget = Math.min(
      hDispItem,
      Math.max(8, item.alturaOcupadaCm || hDispItem * 0.75),
    );
    const depthSlot = baseAlvo ? baseAlvo.footprintD : dVao;
    const xPos = baseAlvo
      ? baseAlvo.x0 + Math.max(0, (baseAlvo.footprintW - wItem) / 2)
      : cursorX;
    const yPos = baseAlvo
      ? baseAlvo.y0 +
        Math.max(
          0,
          (baseAlvo.footprintD -
            Math.min(baseAlvo.footprintD, Math.max(1, item.caixasComprimento) * (cxComp ?? 22))) /
            2,
        )
      : 0;

    const res = gerarCaixasItem3d({
      xStart: xPos,
      yStart: yPos,
      zBase: zBaseItem,
      maxWidthCm: disp,
      slotDepthCm: depthSlot,
      maxHeightCm: hDispItem,
      fileirasLargura: item.fileirasLargura,
      caixasComprimento: item.caixasComprimento,
      camadasAltura: item.camadasAltura,
      larguraOcupadaCm: wItem,
      alturaOcupadaCm: hTarget,
      caixaLarguraCm: cxLarg,
      caixaComprimentoCm: cxComp,
      caixaAlturaCm: item.caixaAlturaCm,
      qtdCaixasAlvo: qtdAlvo,
      dirSign,
      modoDetalhe: 'foco',
      usarAmarracao: usarAmarracaoItem,
      podeGirar: podeGirarItem,
      aplicarCulling: false,
    });

    const caixasFinais = aplicarCulling
      ? cullarCaixasInternas(res.caixas, dirSign)
      : res.caixas;

    itens.push({
      item,
      itemIndex,
      estCx,
      capCx,
      amarrado: res.amarrado,
      caixas: caixasFinais,
    });

    if (!ehSobreposto) {
      basesLayout.set(item.produtoCodigo, {
        x0: xPos,
        y0: yPos,
        footprintW: res.footprintW,
        footprintD: res.footprintD,
        zTop: zBaseItem + res.heightMax,
      });
      cursorX += wItem + gap;
    }
  }

  itens.sort((a, b) => a.itemIndex - b.itemIndex);

  return {
    wVao,
    dVao,
    hVao,
    larguraLivreCm: Math.max(0, wVao - cursorX),
    itens,
    totalEstoqueVao,
  };
}

export interface ResumoTipoVao {
  tipoVao: 'padrao' | 'misto' | 'reservado';
  ehMistoVazio: boolean;
  ehReservadoVazio: boolean;
  pctMisto: number;
  alturaMistoCm: number;
}

/** Normaliza o uso especial de um vão (Padrão, Palete Misto ou Reservado) e altura visual do bloco misto. */
export function resumoTipoOcupacaoVao(
  posicao: Pick<PosicaoComItens, 'tipoOcupacao' | 'ocupacaoManualPct' | 'alturaCm' | 'itens'>,
  paleteH = 11,
): ResumoTipoVao {
  const tipoVao =
    posicao.tipoOcupacao === 'misto' || posicao.tipoOcupacao === 'reservado'
      ? posicao.tipoOcupacao
      : 'padrao';
  const semItens = posicao.itens.length === 0;
  const pctMisto = Math.max(20, Math.min(100, posicao.ocupacaoManualPct ?? 50));
  const hUtil = Math.max(18, (posicao.alturaCm || 74) - paleteH - 4);
  const alturaMistoCm = Math.max(12, Math.min(hUtil, hUtil * (pctMisto / 100) * 0.85));
  return {
    tipoVao,
    ehMistoVazio: semItens && tipoVao === 'misto',
    ehReservadoVazio: semItens && tipoVao === 'reservado',
    pctMisto,
    alturaMistoCm,
  };
}
