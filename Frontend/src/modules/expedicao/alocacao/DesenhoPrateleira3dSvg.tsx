import React, { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import type { Estrutura, PosicaoComItens, ProdutoDimensao } from './types';

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
 * montantes azuis, contraventamento lateral, longarinas laranja, paletes de madeira
 * e pilhas proporcionais de caixas clicáveis por vão.
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

  const termo = termoBusca.trim().toLowerCase();
  const dirSign = angulo === 'dir' ? 1 : -1;
  const nivelUnico = andares.length <= 1;

  // Ordenar andares de baixo para cima (painter's algorithm)
  const andaresAsc = useMemo(() => {
    const asc = [...andares].sort((a, b) => a - b);
    return andarFoco === 'ALL' ? asc : asc.filter((a) => a === andarFoco);
  }, [andares, andarFoco]);

  // Calcular dimensões reais em cm da prateleira completa para manter proporção exata
  const layoutGeo = useMemo(() => {
    const allAsc = [...andares].sort((a, b) => a - b);
    const zBasePorAndar = new Map<number, number>();
    const altPorAndar = new Map<number, number>();
    let zAcum = 0;
    const vigaH = 8;

    for (const a of allAsc) {
      const ref = posicoes.find((p) => p.andar === a);
      const h = ref?.alturaCm ?? 74;
      zBasePorAndar.set(a, zAcum);
      altPorAndar.set(a, h);
      zAcum += h + vigaH;
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
    return { zBasePorAndar, altPorAndar, totalZ, xCols, totalX, maxDepth, vigaH };
  }, [andares, colunas, posicoes, estrutura]);

  // Projeção axonométrica nivelada para prateleiras largas
  const proj = (x: number, y: number, z: number) => {
    const px = x * 0.96 + dirSign * y * 0.62;
    const py = -z - y * 0.42;
    return { x: px, y: py };
  };

  // Ajustar bounding box ao viewBox fixo (980px largura, altura adaptativa)
  const fit = useMemo(() => {
    const { totalX, maxDepth, totalZ } = layoutGeo;
    const corners: Array<{ x: number; y: number }> = [];
    for (const x of [0, totalX]) {
      for (const y of [0, maxDepth]) {
        for (const z of [0, totalZ]) {
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
    const padT = 46;
    const padB = 26;
    const targetW = 980 - padL - padR;
    const scale = targetW / rawW;
    // Se altura ultrapassar 480, reescalar para caber confortável no desktop e mobile
    const scaleFinal = rawH * scale + padT + padB > 490 ? (490 - padT - padB) / rawH : scale;
    const drawW = rawW * scaleFinal;
    const offsetX = padL + (targetW - drawW) / 2 - minX * scaleFinal;
    const offsetY = padT - minY * scaleFinal;
    const vhFinal = Math.round(rawH * scaleFinal + padT + padB);
    const lblX = Math.max(70, offsetX + minX * scaleFinal - 10);

    return { scale: scaleFinal, offsetX, offsetY, vw: 980, vh: vhFinal, lblX };
  }, [layoutGeo, dirSign]);

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

  return (
    <div className="panel-card !p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-zinc-900">
            {estrutura?.nome ?? 'Prateleira 3D'} — Modelo Isométrico
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            {(layoutGeo.totalZ / 100).toFixed(2)} m · {colunas.length} col. ·{' '}
            {andares.length} {nivelUnico ? 'nível' : 'andares'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => setAngulo('dir')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                angulo === 'dir' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Vista Dir.
            </button>
            <button
              type="button"
              onClick={() => setAngulo('esq')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                angulo === 'esq' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Vista Esq.
            </button>
          </div>
        </div>
      </div>

      {andares.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => setAndarFoco('ALL')}
            className={`px-2.5 py-1 rounded-lg border font-semibold cursor-pointer ${
              andarFoco === 'ALL'
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            Todos os andares
          </button>
          {[...andares]
            .sort((a, b) => b - a)
            .map((a) => (
              <button
                key={`3d-foco-${a}`}
                type="button"
                onClick={() => setAndarFoco(a)}
                className={`px-2.5 py-1 rounded-lg border font-semibold cursor-pointer ${
                  andarFoco === a
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                Andar {a}
              </button>
            ))}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-1.5 overflow-hidden">
        <svg
          viewBox={`0 0 ${fit.vw} ${fit.vh}`}
          className="w-full h-auto"
          role="img"
          aria-label={`Modelo 3D isométrico da prateleira ${estrutura?.nome ?? ''}`}
        >
          {/* Piso sob a prateleira */}
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

          {/* Montantes traseiros azuis + diagonais laterais */}
          {postXs.map((px, i) => {
            const pBase = toPt(px, layoutGeo.maxDepth, 0);
            const pTop = toPt(px, layoutGeo.maxDepth, layoutGeo.totalZ);
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
                {/* Contraventamento lateral ligando frente e fundo nos andares */}
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

          {/* Andares (de baixo para cima) */}
          {andaresAsc.map((andar) => {
            const zFloor = layoutGeo.zBasePorAndar.get(andar) ?? 0;
            const zTrayTop = zFloor + beamThick;
            const altVao = layoutGeo.altPorAndar.get(andar) ?? 74;
            const posAndar = posicoes.filter((p) => p.andar === andar);
            const refPos = posAndar[0];
            const acessoTxt =
              (refPos?.cotaBaseCm ?? zFloor) < 120 ? 'Manual' : 'Empilhadeira';

            // Rótulo de Andar à esquerda
            const pLbl = toPt(-20, 0, zFloor + altVao * 0.45);

            return (
              <g key={`andar-3d-${andar}`}>
                {/* Longarina traseira (atrás das caixas) */}
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

                    let cursorX = sx + 2;
                    return (
                      <g
                        key={pos.id}
                        onClick={() => onSelectPosicao(pos)}
                        className="cursor-pointer"
                        opacity={opVao}
                      >
                        <title>
                          {`Vão ${pos.codigo} · ${nivelUnico ? 'Pátio' : `Andar ${pos.andar}`} (${acessoTxt}) · ${pos.larguraOcupadaCm.toFixed(0)}/${pos.larguraCm}cm · ${pos.totalCaixas} cx${pesoTxt}`}
                        </title>

                        {/* Contorno do vão (destacado quando busca bate) */}
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
                          <text
                            x={pCodigo.x}
                            y={pCodigo.y}
                            fontSize={7.5}
                            fontFamily="ui-monospace, monospace"
                            fill="#a1a1aa"
                          >
                            {pos.codigo}
                          </text>
                        ) : (
                          <>
                            {/* Palete 3D de madeira */}
                            <Box3D
                              x={sx + 3}
                              y={4}
                              z={zTrayTop}
                              dx={Math.max(20, slotW - 6)}
                              dy={Math.max(40, pos.comprimentoCm - 8)}
                              dz={paleteH}
                              colors={{
                                top: '#ebd5b0',
                                front: '#d9b782',
                                side: '#b88f54',
                                stroke: '#8c6d46',
                              }}
                              strokeWidth={0.7}
                            />

                            {/* Pilhas 3D de caixas */}
                            {pos.itens.map((item) => {
                              const wItem = Math.min(
                                Math.max(12, item.larguraOcupadaCm || 25),
                                sx + slotW - 3 - cursorX,
                              );
                              const dItem = Math.min(
                                Math.max(30, pos.comprimentoCm - 12),
                                Math.max(24, item.caixasComprimento * (item.caixaComprimentoCm ?? 20)),
                              );
                              const hDisp = Math.max(10, altVao - paleteH);
                              const hItem = Math.min(
                                hDisp + (item.estouroAltura ? 10 : 0),
                                Math.max(12, item.alturaOcupadaCm || hDisp * 0.7),
                              );
                              const prodMeta = prodPorCodigo.get(item.produtoCodigo);
                              const cor = coresCaixa(
                                item.estouroAltura || pos.temEstouro,
                                Boolean(prodMeta?.ehColoracao),
                                Boolean(prodMeta?.ehKit),
                              );
                              const xStart = cursorX;
                              cursorX += wItem + 2;
                              if (wItem <= 4) return null;

                              const layers = Math.min(4, Math.max(1, item.camadasAltura));
                              return (
                                <g key={`3d-item-${item.id}`}>
                                  <Box3D
                                    x={xStart}
                                    y={6}
                                    z={zTrayTop + paleteH}
                                    dx={wItem}
                                    dy={dItem}
                                    dz={hItem}
                                    colors={cor}
                                    strokeWidth={0.8}
                                  />
                                  {/* Divisões sutis das camadas na frente da pilha */}
                                  {Array.from({ length: layers - 1 }).map((_, lIdx) => {
                                    const zSep =
                                      zTrayTop + paleteH + ((lIdx + 1) * hItem) / layers;
                                    const a = toPt(xStart, 6, zSep);
                                    const b = toPt(xStart + wItem, 6, zSep);
                                    return (
                                      <line
                                        key={`layer-${lIdx}`}
                                        x1={a.x}
                                        y1={a.y}
                                        x2={b.x}
                                        y2={b.y}
                                        stroke={cor.stroke}
                                        strokeWidth={0.55}
                                        opacity={0.5}
                                      />
                                    );
                                  })}
                                </g>
                              );
                            })}
                          </>
                        )}
                      </g>
                    );
                  });
                })}

                {/* Longarina frontal laranja */}
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

                {/* Rótulo do Andar + acesso à esquerda fora da projeção */}
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
              z={0}
              dx={postThick}
              dy={7}
              dz={layoutGeo.totalZ}
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
            const pTop = toPt((c.x0 + c.x1) / 2, layoutGeo.maxDepth * 0.45, layoutGeo.totalZ + 28);
            return (
              <text
                key={`col-lbl-${c.col}`}
                x={pTop.x}
                y={pTop.y}
                textAnchor="middle"
                fontSize={10}
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

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-zinc-500">
        <div className="flex flex-wrap items-center gap-3.5">
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
        <span className="flex items-center gap-1 text-zinc-400">
          <Lock className="h-3 w-3" /> Clique num vão para inspecionar e ver o peso
        </span>
      </div>
    </div>
  );
}
