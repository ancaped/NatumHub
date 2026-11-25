import React, { useMemo, useRef, useState } from 'react';
import { distribuirEstoquePorAlocacao, gerarCaixasItem3d } from './caixas3d';
import type {
  AlocacaoItemView,
  Estrutura,
  PosicaoComItens,
  ProdutoDimensao,
} from './types';

interface DesenhoPrateleira3dSvgProps {
  estrutura: Estrutura | null;
  posicoes: PosicaoComItens[];
  colunas: string[];
  andares: number[];
  prodPorCodigo: Map<string, ProdutoDimensao>;
  termoBusca: string;
  onSelectPosicao: (pos: PosicaoComItens) => void;
}

interface CoresCaixa3d {
  top: string;
  front: string;
  side: string;
  stroke: string;
}

function coresCaixa(
  estouro: boolean,
  ehColoracao: boolean,
  ehKit: boolean,
): CoresCaixa3d {
  if (estouro) {
    return {
      top: '#fee2e2',
      front: '#fecaca',
      side: '#fca5a5',
      stroke: '#dc2626',
    };
  }
  if (ehColoracao) {
    return {
      top: '#fef3c7',
      front: '#fde68a',
      side: '#fcd34d',
      stroke: '#d97706',
    };
  }
  if (ehKit) {
    return {
      top: '#e4e4e7',
      front: '#d4d4d8',
      side: '#a1a1aa',
      stroke: '#3f3f46',
    };
  }
  return {
    top: '#f5ead6',
    front: '#e6cfa9',
    side: '#cfa974',
    stroke: '#8c6d46',
  };
}

/**
 * Modelo 3D isométrico/axonométrico em SVG leve da prateleira completa:
 * montantes azuis, contraventamento lateral, longarinas laranja, paletes de madeira,
 * caixas individuais dinâmicas com folga real e alternador Estoque | Capacidade.
 */
export function DesenhoPrateleira3dSvg({
  estrutura,
  posicoes,
  colunas,
  andares,
  prodPorCodigo,
  termoBusca,
  onSelectPosicao,
}: DesenhoPrateleira3dSvgProps) {
  const [angulo, setAngulo] = useState<'dir' | 'esq'>('dir');
  const [andarFoco, setAndarFoco] = useState<number | 'ALL'>('ALL');
  const [modoQtd, setModoQtd] = useState<'estoque' | 'capacidade'>('estoque');
  const [zoomMobile, setZoomMobile] = useState<'inteira' | 'ampliar'>('inteira');
  const [hoveredSlot, setHoveredSlot] = useState<{
    pos: PosicaoComItens;
    leftPx: number;
    topPx: number;
    flipLeft: boolean;
    flipUp: boolean;
    acessoTxt: string;
  } | null>(null);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  const termo = termoBusca.trim().toLowerCase();
  const dirSign: 1 | -1 = angulo === 'dir' ? 1 : -1;
  const nivelUnico = andares.length <= 1;
  const andarEfetivo =
    andarFoco !== 'ALL' && andares.includes(andarFoco) ? andarFoco : 'ALL';
  const emFoco = andarEfetivo !== 'ALL';

  const saldos = useMemo(
    () => distribuirEstoquePorAlocacao(posicoes, prodPorCodigo),
    [posicoes, prodPorCodigo],
  );

  // Ordenar andares de baixo para cima (painter's algorithm)
  const andaresAsc = useMemo(() => {
    const asc = [...andares].sort((a, b) => a - b);
    return andarEfetivo === 'ALL' ? asc : asc.filter((a) => a === andarEfetivo);
  }, [andares, andarEfetivo]);

  // Dimensões reais em cm; Andar 1 fica direto no chão (z=0, sem longarina embaixo)
  const layoutGeo = useMemo(() => {
    const allAsc = [...andares].sort((a, b) => a - b);
    const minAndar = allAsc[0] ?? 1;
    const zBasePorAndar = new Map<number, number>();
    const zTrayTopPorAndar = new Map<number, number>();
    const altPorAndar = new Map<number, number>();
    let zAcum = 0;
    const vigaH = 8;

    for (const a of allAsc) {
      const ref = posicoes.find((p) => p.andar === a);
      const h = ref?.alturaCm ?? 74;
      const ehChao = a === minAndar;
      zBasePorAndar.set(a, zAcum);
      const trayTop = ehChao ? zAcum : zAcum + vigaH;
      zTrayTopPorAndar.set(a, trayTop);
      altPorAndar.set(a, h);
      zAcum = trayTop + h;
    }

    const totalZ = Math.max(80, zAcum);
    const gapCol = 10;
    const xCols: Array<{ col: string; x0: number; x1: number; depthCm: number }> = [];
    let xAcum = 0;
    let maxDepth = estrutura?.estradoComprimentoCm ?? 120;

    for (const col of colunas) {
      const colSlots = posicoes.filter((p) => p.coluna === col);
      const firstAndar = colSlots[0]?.andar;
      const slotsUmAndar = colSlots.filter((p) => p.andar === firstAndar);
      const colWidth =
        slotsUmAndar.reduce((acc, p) => acc + (p.larguraCm || 100), 0) || 200;
      for (const s of colSlots) {
        if (s.comprimentoCm > maxDepth) maxDepth = s.comprimentoCm;
      }
      xCols.push({
        col,
        x0: xAcum,
        x1: xAcum + colWidth,
        depthCm: maxDepth,
      });
      xAcum += colWidth + gapCol;
    }

    const totalX = Math.max(120, xAcum - gapCol);
    return {
      minAndar,
      zBasePorAndar,
      zTrayTopPorAndar,
      altPorAndar,
      totalZ,
      xCols,
      totalX,
      maxDepth,
      vigaH,
    };
  }, [andares, colunas, posicoes, estrutura]);

  // Janela vertical para aplicar zoom automático ao focar 1 andar
  const { zViewMin, zViewMax } = useMemo(() => {
    if (andarEfetivo === 'ALL') {
      return { zViewMin: 0, zViewMax: layoutGeo.totalZ };
    }
    const zFloor = layoutGeo.zBasePorAndar.get(andarEfetivo) ?? 0;
    const zTray = layoutGeo.zTrayTopPorAndar.get(andarEfetivo) ?? zFloor;
    const alt = layoutGeo.altPorAndar.get(andarEfetivo) ?? 74;
    return {
      zViewMin: Math.max(0, zFloor - 6),
      zViewMax: zTray + alt + 22,
    };
  }, [andarEfetivo, layoutGeo]);

  // Projeção axonométrica nivelada para prateleiras largas
  const proj = (x: number, y: number, z: number) => {
    const px = x * 0.96 + dirSign * y * 0.62;
    const py = -z - y * 0.42;
    return { x: px, y: py };
  };

  // Ajustar bounding box ao viewBox fixo (980px largura, altura adaptativa)
  const fit = useMemo(() => {
    const { totalX, maxDepth } = layoutGeo;
    const corners: Array<{ x: number; y: number }> = [];
    for (const x of [0, totalX]) {
      for (const y of [0, maxDepth]) {
        for (const z of [zViewMin, zViewMax]) {
          corners.push(proj(x, y, z));
        }
      }
    }
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const rawW = Math.max(1, maxX - minX);
    const rawH = Math.max(1, maxY - minY);

    const padL = 84;
    const padR = 28;
    const padT = 54;
    const padB = 26;
    const targetW = 980 - padL - padR;
    const scale = targetW / rawW;
    const scaleFinal =
      rawH * scale + padT + padB > 490 ? (490 - padT - padB) / rawH : scale;
    const drawW = rawW * scaleFinal;
    const offsetX = padL + (targetW - drawW) / 2 - minX * scaleFinal;
    const offsetY = padT - minY * scaleFinal;
    const vhFinal = Math.round(rawH * scaleFinal + padT + padB);
    const lblX = Math.max(70, offsetX + minX * scaleFinal - 10);

    return { scale: scaleFinal, offsetX, offsetY, vw: 980, vh: vhFinal, lblX };
  }, [layoutGeo, dirSign, zViewMin, zViewMax]);

  const toPt = (x: number, y: number, z: number) => {
    const p = proj(x, y, z);
    return {
      x: fit.offsetX + p.x * fit.scale,
      y: fit.offsetY + p.y * fit.scale,
    };
  };

  const poly = (pts: Array<{ x: number; y: number }>) =>
    pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const Box3D = ({
    x,
    y,
    z,
    dx,
    dy,
    dz,
    colors,
    strokeWidth = 0.85,
    opacity = 1,
    drawTopFlap = false,
  }: {
    x: number;
    y: number;
    z: number;
    dx: number;
    dy: number;
    dz: number;
    colors: CoresCaixa3d;
    strokeWidth?: number;
    opacity?: number;
    drawTopFlap?: boolean;
  }) => {
    const fbl = toPt(x, y, z);
    const fbr = toPt(x + dx, y, z);
    const ftl = toPt(x, y, z + dz);
    const ftr = toPt(x + dx, y, z + dz);
    const btl = toPt(x, y + dy, z + dz);
    const btr = toPt(x + dx, y + dy, z + dz);

    const sidePts =
      dirSign === 1
        ? [fbr, toPt(x + dx, y + dy, z), btr, ftr]
        : [toPt(x, y + dy, z), fbl, ftl, btl];

    const flapA =
      dy >= dx
        ? toPt(x + dx * 0.5, y + 1.2, z + dz)
        : toPt(x + 1.2, y + dy * 0.5, z + dz);
    const flapB =
      dy >= dx
        ? toPt(x + dx * 0.5, y + dy - 1.2, z + dz)
        : toPt(x + dx - 1.2, y + dy * 0.5, z + dz);

    return (
      <g opacity={opacity}>
        {/* Face lateral visível */}
        <polygon
          points={poly(sidePts)}
          fill={colors.side}
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        {/* Tampa / topo */}
        <polygon
          points={poly([ftl, ftr, btr, btl])}
          fill={colors.top}
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        {drawTopFlap && (
          <line
            x1={flapA.x}
            y1={flapA.y}
            x2={flapB.x}
            y2={flapB.y}
            stroke={colors.stroke}
            strokeWidth={0.45}
            opacity={0.35}
          />
        )}
        {/* Face frontal */}
        <polygon
          points={poly([fbl, fbr, ftr, ftl])}
          fill={colors.front}
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </g>
    );
  };

  /**
   * Palete PBR 3D realista com tábuas de base, 3 tacos com vãos de garfo vazados e tampo ripado.
   */
  const Palete3D = ({
    x,
    y,
    z,
    dx,
    dy,
    dz,
  }: {
    x: number;
    y: number;
    z: number;
    dx: number;
    dy: number;
    dz: number;
  }) => {
    const hBot = 2;
    const hDeck = 3;
    const hTaco = Math.max(3, dz - hBot - hDeck);
    const wTaco = Math.max(7, Math.round(dx * 0.14));
    const dTaco = Math.max(8, Math.round(dy * 0.13));

    const blocoCor: CoresCaixa3d = {
      top: '#cfa974',
      front: '#b88f54',
      side: '#9a733e',
      stroke: '#6e502f',
    };
    const sombraVao: CoresCaixa3d = {
      top: '#6e502f',
      front: '#4a341b',
      side: '#3b2814',
      stroke: '#3b2814',
    };

    const frontBlocksX = [x, x + (dx - wTaco) / 2, x + dx - wTaco];
    const orderedFrontX = dirSign === 1 ? frontBlocksX : [...frontBlocksX].reverse();
    const xSideFace = dirSign === 1 ? x + dx - wTaco : x;

    return (
      <g>
        <Box3D
          x={x}
          y={y}
          z={z}
          dx={dx}
          dy={dy}
          dz={hBot}
          colors={{
            top: '#c9a36a',
            front: '#a98047',
            side: '#8c6735',
            stroke: '#6e502f',
          }}
          strokeWidth={0.55}
        />

        <Box3D
          x={x + 2}
          y={y + 6}
          z={z + hBot}
          dx={Math.max(8, dx - 4)}
          dy={Math.max(10, dy - 12)}
          dz={hTaco}
          colors={sombraVao}
          strokeWidth={0.45}
        />

        <Box3D
          x={xSideFace}
          y={y + dy - dTaco}
          z={z + hBot}
          dx={wTaco}
          dy={dTaco}
          dz={hTaco}
          colors={blocoCor}
          strokeWidth={0.5}
        />
        <Box3D
          x={xSideFace}
          y={y + (dy - dTaco) / 2}
          z={z + hBot}
          dx={wTaco}
          dy={dTaco}
          dz={hTaco}
          colors={blocoCor}
          strokeWidth={0.5}
        />

        {orderedFrontX.map((bx, bIdx) => (
          <Box3D
            key={`taco-f-${bIdx}`}
            x={bx}
            y={y}
            z={z + hBot}
            dx={wTaco}
            dy={dTaco}
            dz={hTaco}
            colors={blocoCor}
            strokeWidth={0.5}
          />
        ))}

        <Box3D
          x={x}
          y={y}
          z={z + hBot + hTaco}
          dx={dx}
          dy={dy}
          dz={hDeck}
          colors={{
            top: '#ebd5b0',
            front: '#d9b782',
            side: '#be9558',
            stroke: '#785d3b',
          }}
          strokeWidth={0.65}
        />

        {[0.25, 0.5, 0.75].map((frac) => {
          const a = toPt(x + 2, y + dy * frac, z + dz);
          const b = toPt(x + dx - 2, y + dy * frac, z + dz);
          return (
            <line
              key={`ripa-${frac}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#9a7b4f"
              strokeWidth={0.5}
              opacity={0.55}
            />
          );
        })}
      </g>
    );
  };

  // Ordem de desenho das colunas respeitando oclusão do ângulo escolhido
  const colsOrdered = useMemo(
    () => (dirSign === 1 ? layoutGeo.xCols : [...layoutGeo.xCols].reverse()),
    [layoutGeo.xCols, dirSign],
  );

  const postThick = 7;
  const beamThick = layoutGeo.vigaH;

  // X das divisórias (montantes entre colunas)
  const postXs = useMemo(() => {
    const xs: number[] = [0];
    for (const c of layoutGeo.xCols) {
      xs.push(c.x1);
    }
    return dirSign === 1 ? xs : [...xs].reverse();
  }, [layoutGeo.xCols, dirSign]);

  const tooltipWrapperRef = useRef<HTMLDivElement | null>(null);

  const handleSlotHover = (
    e: React.MouseEvent<SVGGElement>,
    pos: PosicaoComItens,
    acessoTxt: string,
  ) => {
    const box = tooltipWrapperRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;
    const relX = e.clientX - box.left;
    const relY = e.clientY - box.top;
    setHoveredSlot({
      pos,
      leftPx: Math.max(12, Math.min(box.width - 12, relX)),
      topPx: Math.max(12, Math.min(box.height - 12, relY)),
      flipLeft: relX > box.width * 0.6,
      flipUp: relY > box.height * 0.45,
      acessoTxt,
    });
  };

  const renderSlotBoxes = (
    pos: PosicaoComItens,
    sx: number,
    slotW: number,
    zTrayTop: number,
    paleteH: number,
    altVao: number,
  ) => {
    let cursorX = sx + 2;
    const hDisp = Math.max(10, altVao - paleteH);
    const itemsLayout: Array<{
      item: AlocacaoItemView;
      xStart: number;
      wItem: number;
      hItem: number;
      dItem: number;
    }> = [];

    for (const item of pos.itens) {
      const wItem = Math.min(
        Math.max(12, item.larguraOcupadaCm || 25),
        sx + slotW - 3 - cursorX,
      );
      const dItem = Math.min(
        Math.max(30, pos.comprimentoCm - 12),
        Math.max(24, item.caixasComprimento * (item.caixaComprimentoCm ?? 20)),
      );
      const hItem = Math.min(
        hDisp + (item.estouroAltura ? 10 : 0),
        Math.max(12, item.alturaOcupadaCm || hDisp * 0.7),
      );
      if (wItem > 4) {
        itemsLayout.push({ item, xStart: cursorX, wItem, hItem, dItem });
      }
      cursorX += wItem + 2;
    }

    const totalEstoqueVao = pos.itens.reduce(
      (s, it) => s + (saldos.get(it.id)?.caixasEstoque ?? it.totalCaixas),
      0,
    );

    if (modoQtd === 'estoque' && totalEstoqueVao === 0) {
      const pText = toPt(sx + slotW * 0.46, pos.comprimentoCm * 0.42, zTrayTop + paleteH + 2);
      return (
        <g>
          <polygon
            points={poly([
              toPt(sx + 6, 8, zTrayTop + paleteH),
              toPt(sx + slotW - 6, 8, zTrayTop + paleteH),
              toPt(sx + slotW - 6, Math.max(22, pos.comprimentoCm - 10), zTrayTop + paleteH),
              toPt(sx + 6, Math.max(22, pos.comprimentoCm - 10), zTrayTop + paleteH),
            ])}
            fill="none"
            stroke="#a1a1aa"
            strokeWidth={0.8}
            strokeDasharray="3 2"
          />
          <text
            x={pText.x}
            y={pText.y}
            textAnchor="middle"
            fontSize={6.6}
            fontFamily="ui-monospace, monospace"
            fontWeight={600}
            fill="#71717a"
          >
            0 cx
          </text>
        </g>
      );
    }

    const itemsOrdered = dirSign === 1 ? itemsLayout : [...itemsLayout].reverse();
    const slotDepth = Math.max(24, pos.comprimentoCm - 12);

    return itemsOrdered.map(({ item, xStart, wItem, hItem, dItem }) => {
      const saldo = saldos.get(item.id);
      const qtdAlvo =
        modoQtd === 'estoque'
          ? (saldo?.caixasEstoque ?? item.totalCaixas)
          : (saldo?.caixasCapacidade ?? item.totalCaixas);
      const prodMeta = prodPorCodigo.get(item.produtoCodigo);
      const cor = coresCaixa(
        item.estouroAltura || pos.temEstouro,
        Boolean(prodMeta?.ehColoracao),
        Boolean(prodMeta?.ehKit),
      );

      const { caixas } = gerarCaixasItem3d({
        xStart,
        yStart: 6,
        zBase: zTrayTop + paleteH,
        maxWidthCm: wItem,
        slotDepthCm: Math.min(slotDepth, dItem),
        maxHeightCm: hItem,
        fileirasLargura: item.fileirasLargura,
        caixasComprimento: item.caixasComprimento,
        camadasAltura: item.camadasAltura,
        larguraOcupadaCm: wItem,
        alturaOcupadaCm: hItem,
        caixaLarguraCm: item.caixaLarguraCm,
        caixaComprimentoCm: item.caixaComprimentoCm,
        caixaAlturaCm: item.caixaAlturaCm,
        qtdCaixasAlvo: qtdAlvo,
        dirSign,
        modoDetalhe: emFoco ? 'foco' : 'panorama',
      });

      return (
        <g key={`3d-item-${item.id}`}>
          {caixas.map((box, bIdx) => (
            <Box3D
              key={`cx-${item.id}-${bIdx}`}
              x={box.x}
              y={box.y}
              z={box.z}
              dx={box.dx}
              dy={box.dy}
              dz={box.dz}
              colors={cor}
              strokeWidth={emFoco ? 0.68 : 0.52}
              drawTopFlap={emFoco && box.dx >= 10 && box.dy >= 12}
            />
          ))}
        </g>
      );
    });
  };

  return (
    <div className="panel-card !p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-zinc-900">
            {estrutura?.nome ?? 'Prateleira'}
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            {(layoutGeo.totalZ / 100).toFixed(2)} m · {colunas.length} col.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setModoQtd('estoque')}
              className={`px-2 py-0.5 max-sm:py-1 rounded-md font-semibold cursor-pointer ${
                modoQtd === 'estoque' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
              title="Exibir quantidade real em estoque no ERP"
            >
              Estoque
            </button>
            <button
              type="button"
              onClick={() => setModoQtd('capacidade')}
              className={`px-2 py-0.5 max-sm:py-1 rounded-md font-semibold cursor-pointer ${
                modoQtd === 'capacidade' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
              title="Exibir capacidade cheia planejada do vão"
            >
              Capacidade
            </button>
          </div>

          {andares.length > 1 && (
            <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setAndarFoco('ALL')}
                className={`px-2 py-0.5 max-sm:py-1 rounded-md font-semibold cursor-pointer ${
                  andarEfetivo === 'ALL' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
                }`}
              >
                Todos
              </button>
              {[...andares]
                .sort((a, b) => b - a)
                .map((a) => (
                  <button
                    key={`3d-foco-${a}`}
                    type="button"
                    onClick={() => setAndarFoco(a)}
                    className={`px-2 py-0.5 max-sm:py-1 rounded-md font-semibold cursor-pointer ${
                      andarEfetivo === a ? 'bg-zinc-900 text-white' : 'text-zinc-600'
                    }`}
                  >
                    {a}º
                  </button>
                ))}
            </div>
          )}

          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setAngulo('dir')}
              className={`px-2 py-0.5 max-sm:py-1 rounded-md font-semibold cursor-pointer ${
                angulo === 'dir' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Dir.
            </button>
            <button
              type="button"
              onClick={() => setAngulo('esq')}
              className={`px-2 py-0.5 max-sm:py-1 rounded-md font-semibold cursor-pointer ${
                angulo === 'esq' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Esq.
            </button>
          </div>

          <div className="md:hidden inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setZoomMobile('inteira')}
              className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                zoomMobile === 'inteira' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Inteira
            </button>
            <button
              type="button"
              onClick={() => setZoomMobile('ampliar')}
              className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                zoomMobile === 'ampliar' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Ampliar
            </button>
          </div>
        </div>
      </div>

      <div
        ref={tooltipWrapperRef}
        className="relative"
        onMouseLeave={() => setHoveredSlot(null)}
      >
        <div
          ref={svgContainerRef}
          className={`rounded-xl border border-zinc-200 bg-zinc-50/40 p-1.5 ${
            zoomMobile === 'ampliar' ? 'overflow-x-auto md:overflow-hidden' : 'overflow-hidden'
          }`}
        >
        <svg
          viewBox={`0 0 ${fit.vw} ${fit.vh}`}
          className={
            zoomMobile === 'ampliar'
              ? 'min-w-[820px] w-[820px] md:min-w-0 md:w-full h-auto'
              : 'w-full h-auto'
          }
          role="img"
          aria-label={`Modelo 3D isométrico da prateleira ${estrutura?.nome ?? ''}`}
        >
          {/* Piso sob a prateleira (visível no panorama ou ao focar Andar 1) */}
          {(andarEfetivo === 'ALL' || andarEfetivo === layoutGeo.minAndar) && (
            <polygon
              points={poly([
                toPt(-18, -12, 0),
                toPt(layoutGeo.totalX + 18, -12, 0),
                toPt(layoutGeo.totalX + 18, layoutGeo.maxDepth + 16, 0),
                toPt(-18, layoutGeo.maxDepth + 16, 0),
              ])}
              fill="#f4f4f5"
              stroke="#d4d4d8"
              strokeWidth={1}
            />
          )}

          {/* Montantes traseiros azuis + diagonais laterais */}
          {postXs.map((px, i) => {
            const pBase = toPt(px, layoutGeo.maxDepth, zViewMin);
            const pTop = toPt(px, layoutGeo.maxDepth, zViewMax);
            return (
              <g key={`post-back-${i}`}>
                <line
                  x1={pBase.x}
                  y1={pBase.y}
                  x2={pTop.x}
                  y2={pTop.y}
                  stroke="#1e40af"
                  strokeWidth={2.6}
                />
                {(i === 0 || i === postXs.length - 1) &&
                  andaresAsc.map((a) => {
                    const zb = layoutGeo.zBasePorAndar.get(a) ?? 0;
                    const h = layoutGeo.altPorAndar.get(a) ?? 74;
                    const f1 = toPt(px, 0, zb);
                    const b2 = toPt(px, layoutGeo.maxDepth, zb + h);
                    const b1 = toPt(px, layoutGeo.maxDepth, zb);
                    const f2 = toPt(px, 0, zb + h);
                    return (
                      <g key={`brace-${i}-${a}`} opacity={0.48}>
                        <line
                          x1={f1.x}
                          y1={f1.y}
                          x2={b2.x}
                          y2={b2.y}
                          stroke="#1d4ed8"
                          strokeWidth={1}
                        />
                        <line
                          x1={b1.x}
                          y1={b1.y}
                          x2={f2.x}
                          y2={f2.y}
                          stroke="#1d4ed8"
                          strokeWidth={1}
                        />
                      </g>
                    );
                  })}
              </g>
            );
          })}

          {/* Andares (de baixo para cima; Andar 1 direto no chão sem longarina) */}
          {andaresAsc.map((andar) => {
            const zFloor = layoutGeo.zBasePorAndar.get(andar) ?? 0;
            const zTrayTop = layoutGeo.zTrayTopPorAndar.get(andar) ?? zFloor;
            const ehChao = andar === layoutGeo.minAndar;
            const altVao = layoutGeo.altPorAndar.get(andar) ?? 74;
            const posAndar = posicoes.filter((p) => p.andar === andar);
            const refPos = posAndar[0];
            const acessoTxt =
              (refPos?.cotaBaseCm ?? zFloor) < 120 ? 'Manual' : 'Empilhadeira';

            const pLbl = toPt(-20, 0, zFloor + altVao * 0.45);

            return (
              <g key={`andar-3d-${andar}`}>
                {/* Longarina traseira somente a partir do Andar 2 */}
                {!ehChao && (
                  <Box3D
                    x={0}
                    y={layoutGeo.maxDepth - 6}
                    z={zFloor}
                    dx={layoutGeo.totalX}
                    dy={6}
                    dz={beamThick}
                    colors={{
                      top: '#d97706',
                      front: '#b45309',
                      side: '#92400e',
                      stroke: '#78350f',
                    }}
                    strokeWidth={0.5}
                  />
                )}

                {/* Vãos por coluna na ordem de oclusão */}
                {colsOrdered.map((colMeta) => {
                  const slots = posAndar
                    .filter((p) => p.coluna === colMeta.col)
                    .sort((a, b) => (dirSign === 1 ? b.nivel - a.nivel : a.nivel - b.nivel));

                  const totalColWidth = colMeta.x1 - colMeta.x0;
                  const slotCount = Math.max(1, slots.length);
                  const slotW = totalColWidth / slotCount;

                  return slots.map((pos, sIdx) => {
                    const orderIdx = dirSign === 1 ? sIdx : slotCount - 1 - sIdx;
                    const sx = colMeta.x0 + orderIdx * slotW;
                    const casaBusca =
                      termo !== '' &&
                      (pos.codigo.toLowerCase().includes(termo) ||
                        pos.itens.some(
                          (it) =>
                            it.produtoCodigo.toLowerCase().includes(termo) ||
                            it.produtoDescricao.toLowerCase().includes(termo),
                        ));
                    const apagado = termo !== '' && !casaBusca;
                    const opVao = apagado ? 0.25 : 1;

                    const paleteH = 11;
                    const pesoTxt =
                      (pos.pesoTotalComPaleteKg ?? 0) > 0
                        ? ` · ~${Math.round(pos.pesoTotalComPaleteKg ?? 0)} kg`
                        : '';
                    const pCodigo = toPt(sx + slotW * 0.24, 4, zTrayTop + 3);

                    return (
                      <g
                        key={pos.id}
                        onClick={() => onSelectPosicao(pos)}
                        onMouseEnter={(e) => handleSlotHover(e, pos, acessoTxt)}
                        onMouseMove={(e) => handleSlotHover(e, pos, acessoTxt)}
                        className="cursor-pointer"
                        opacity={opVao}
                      >
                        <title>
                          {`Vão ${pos.codigo} · ${nivelUnico ? 'Pátio' : `Andar ${pos.andar}`} (${acessoTxt}) · ${pos.larguraOcupadaCm.toFixed(0)}/${pos.larguraCm}cm · ${pos.totalCaixas} cx${pesoTxt}`}
                        </title>

                        {/* Contorno do vão */}
                        <polygon
                          points={poly([
                            toPt(sx + 1, 2, zTrayTop),
                            toPt(sx + slotW - 1, 2, zTrayTop),
                            toPt(sx + slotW - 1, pos.comprimentoCm, zTrayTop),
                            toPt(sx + 1, pos.comprimentoCm, zTrayTop),
                          ])}
                          fill={
                            pos.temEstouro
                              ? '#fef2f2'
                              : casaBusca
                                ? '#fef3c7'
                                : '#ffffff'
                          }
                          fillOpacity={pos.itens.length > 0 ? 0.45 : 0.28}
                          stroke={casaBusca ? '#18181b' : '#d4d4d8'}
                          strokeWidth={casaBusca ? 1.8 : 0.6}
                        />

                        {pos.itens.length === 0 ? (
                          !emFoco && (
                            <text
                              x={pCodigo.x}
                              y={pCodigo.y}
                              fontSize={7.5}
                              fontFamily="ui-monospace, monospace"
                              fill="#a1a1aa"
                            >
                              {pos.codigo}
                            </text>
                          )
                        ) : (
                          <>
                            <Palete3D
                              x={sx + 3}
                              y={4}
                              z={zTrayTop}
                              dx={Math.max(20, slotW - 6)}
                              dy={Math.max(40, pos.comprimentoCm - 8)}
                              dz={paleteH}
                            />
                            {renderSlotBoxes(pos, sx, slotW, zTrayTop, paleteH, altVao)}
                          </>
                        )}
                      </g>
                    );
                  });
                })}

                {/* Longarina frontal laranja somente a partir do Andar 2 */}
                {!ehChao && (
                  <Box3D
                    x={0}
                    y={0}
                    z={zFloor}
                    dx={layoutGeo.totalX}
                    dy={6}
                    dz={beamThick}
                    colors={{
                      top: '#fbbf24',
                      front: '#f59e0b',
                      side: '#d97706',
                      stroke: '#b45309',
                    }}
                    strokeWidth={0.65}
                  />
                )}

                {/* Em modo foco (1 andar), exibir código de todos os vãos na borda frontal */}
                {emFoco &&
                  colsOrdered.map((colMeta) => {
                    const slots = posAndar
                      .filter((p) => p.coluna === colMeta.col)
                      .sort((a, b) => (dirSign === 1 ? b.nivel - a.nivel : a.nivel - b.nivel));
                    const totalColWidth = colMeta.x1 - colMeta.x0;
                    const slotCount = Math.max(1, slots.length);
                    const slotW = totalColWidth / slotCount;
                    return slots.map((pos, sIdx) => {
                      const orderIdx = dirSign === 1 ? sIdx : slotCount - 1 - sIdx;
                      const sx = colMeta.x0 + orderIdx * slotW;
                      const ptSlot = ehChao
                        ? toPt(sx + slotW * 0.5, -5, 0)
                        : toPt(sx + slotW * 0.5, -0.4, zFloor + 2.2);
                      return (
                        <text
                          key={`foco-lbl-${pos.id}`}
                          x={ptSlot.x}
                          y={ptSlot.y}
                          textAnchor="middle"
                          fontSize={8.2}
                          fontFamily="ui-monospace, monospace"
                          fontWeight={700}
                          fill={ehChao ? '#3f3f46' : '#78350f'}
                          className="pointer-events-none"
                        >
                          {pos.codigo}
                        </text>
                      );
                    });
                  })}

                {/* Rótulo do Andar + acesso à esquerda */}
                <text
                  x={fit.lblX}
                  y={pLbl.y}
                  textAnchor="end"
                  fontSize={8.8}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  fontWeight={700}
                  fill="#27272a"
                >
                  {nivelUnico ? 'Pátio' : `Andar ${andar}`}
                </text>
                <text
                  x={fit.lblX}
                  y={pLbl.y + 10}
                  textAnchor="end"
                  fontSize={7.4}
                  fontFamily="ui-monospace, monospace"
                  fill={acessoTxt === 'Manual' ? '#15803d' : '#52525b'}
                >
                  {acessoTxt}
                </text>
              </g>
            );
          })}

          {/* Montantes frontais azuis */}
          {postXs.map((px, i) => (
            <Box3D
              key={`post-front-${i}`}
              x={px - postThick / 2}
              y={-1}
              z={zViewMin}
              dx={postThick}
              dy={7}
              dz={Math.max(10, zViewMax - zViewMin)}
              colors={{
                top: '#3b82f6',
                front: '#1d4ed8',
                side: '#1e3a8a',
                stroke: '#1e3a8a',
              }}
              strokeWidth={0.6}
            />
          ))}

          {/* Rótulos das colunas acima da prateleira */}
          {layoutGeo.xCols.map((c) => {
            const pTop = toPt(
              (c.x0 + c.x1) / 2,
              layoutGeo.maxDepth * 0.65,
              zViewMax + 34,
            );
            return (
              <text
                key={`col-lbl-${c.col}`}
                x={pTop.x}
                y={pTop.y}
                textAnchor="middle"
                fontSize={11.5}
                fontFamily="ui-monospace, monospace"
                fontWeight={700}
                fill="#18181b"
              >
                {c.col}
              </text>
            );
          })}
        </svg>
        </div>

        {/* Tooltip flutuante no hover (Desktop) */}
        {hoveredSlot && (
          <div
            style={{
              left: hoveredSlot.leftPx,
              top: hoveredSlot.topPx,
              transform: `translate(${hoveredSlot.flipLeft ? 'calc(-100% - 10px)' : '12px'}, ${hoveredSlot.flipUp ? 'calc(-100% - 10px)' : '12px'})`,
            }}
            className="hidden md:block pointer-events-none absolute z-20 max-w-[270px] rounded-xl bg-zinc-900/95 px-3 py-2 text-xs text-white shadow-lg border border-zinc-700"
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-700/80 pb-1">
              <span className="font-mono font-bold">
                Vão {hoveredSlot.pos.codigo}
              </span>
              <span className="text-[11px] text-zinc-300">
                {nivelUnico ? 'Pátio' : `Andar ${hoveredSlot.pos.andar}`} · {hoveredSlot.acessoTxt}
              </span>
            </div>

            {hoveredSlot.pos.itens.length === 0 ? (
              <p className="pt-1 text-[11px] text-zinc-300">
                Vão livre · clique para alocar
              </p>
            ) : (
              <div className="mt-1.5 space-y-1">
                {hoveredSlot.pos.itens.slice(0, 4).map((it) => {
                  const saldo = saldos.get(it.id);
                  const estCx = saldo?.caixasEstoque ?? it.totalCaixas;
                  const capCx = saldo?.caixasCapacidade ?? it.totalCaixas;
                  return (
                    <div key={`tip-${it.id}`} className="text-[11px] leading-snug">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-zinc-100">
                          {it.produtoCodigo}
                        </span>
                        <span className="font-mono text-zinc-300 shrink-0">
                          {estCx}/{capCx} cx
                        </span>
                      </div>
                      <div className="truncate text-zinc-300">{it.produtoDescricao}</div>
                    </div>
                  );
                })}
                {hoveredSlot.pos.itens.length > 4 && (
                  <div className="text-[10px] text-zinc-400">
                    +{hoveredSlot.pos.itens.length - 4} itens neste vão
                  </div>
                )}
                <div className="border-t border-zinc-700/80 pt-1 text-[10px] font-mono text-zinc-300 flex items-center justify-between gap-2">
                  <span>
                    {hoveredSlot.pos.larguraOcupadaCm.toFixed(0)}/{hoveredSlot.pos.larguraCm}cm
                  </span>
                  {(hoveredSlot.pos.pesoTotalComPaleteKg ?? 0) > 0 && (
                    <span>~{Math.round(hoveredSlot.pos.pesoTotalComPaleteKg ?? 0)} kg</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3.5 pt-0.5 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 bg-blue-700 rounded-xs" /> Montante
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-1.5 bg-amber-500 rounded-xs" /> Longarina
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 bg-[#d9b782] border border-[#8c6d46] rounded-xs" /> Palete
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 bg-[#f2e4cc] border border-[#8c6d46] rounded-xs" /> Caixas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 bg-zinc-200 border border-zinc-700 rounded-xs" /> Kits
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 bg-amber-100 border border-amber-500 rounded-xs" /> Coloração
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 bg-red-50 border border-red-500 rounded-xs" /> Estouro
        </span>
      </div>
    </div>
  );
}
