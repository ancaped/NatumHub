import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, RotateCcw, RotateCw } from 'lucide-react';
import {
  coresItemVao3d,
  criarCamera3d,
  distribuirEstoquePorAlocacao,
  gerarLayoutVao3d,
  ordenarCaixas3dPorCamera,
  projetarPonto3d,
  type Caixa3dInstancia,
} from './caixas3d';
import type {
  AlocacaoItemView,
  Caixa,
  PosicaoComItens,
  ProdutoDimensao,
} from './types';

interface DesenhoPalete3dGiravelProps {
  posicao: PosicaoComItens;
  posicoes: PosicaoComItens[];
  produtos: ProdutoDimensao[];
  caixas: Caixa[];
}

interface CorFace {
  top: string;
  frontX: string;
  frontY: string;
  stroke: string;
}

interface BoxRender extends Caixa3dInstancia {
  cor: CorFace;
  itemId?: string;
  isPalete?: boolean;
  drawFlap?: boolean;
}

export function DesenhoPalete3dGiravel({
  posicao,
  posicoes,
  produtos,
  caixas,
}: DesenhoPalete3dGiravelProps) {
  const [yawDeg, setYawDeg] = useState(32);
  const [vistaTopo, setVistaTopo] = useState(false);
  const [usarAmarracao, setUsarAmarracao] = useState(true);
  const [modoQtd, setModoQtd] = useState<'estoque' | 'capacidade'>('estoque');
  const [camadaMaxVisivel, setCamadaMaxVisivel] = useState<number | 'ALL'>('ALL');
  const [itemFocadoId, setItemFocadoId] = useState<string | null>(null);
  const [hoverItemId, setHoverItemId] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const dragRef = useRef<{ startX: number; startYaw: number } | null>(null);

  useEffect(() => {
    setItemFocadoId(null);
    setHoverItemId(null);
  }, [posicao.id]);

  const wVao = posicao.larguraCm > 0 ? posicao.larguraCm : 100;
  const dVao = posicao.comprimentoCm > 0 ? posicao.comprimentoCm : 120;
  const hVao = posicao.alturaCm > 0 ? posicao.alturaCm : 74;
  const paleteH = 11;

  const prodPorCodigo = useMemo(() => {
    const m = new Map<string, ProdutoDimensao>();
    for (const p of produtos) m.set(p.codigo, p);
    return m;
  }, [produtos]);

  const caixaPorId = useMemo(() => {
    const m = new Map<string, Caixa>();
    for (const c of caixas) m.set(c.id, c);
    return m;
  }, [caixas]);

  const saldos = useMemo(
    () => distribuirEstoquePorAlocacao(posicoes, prodPorCodigo),
    [posicoes, prodPorCodigo],
  );

  const maxCamadasVao = useMemo(
    () => Math.max(1, ...posicao.itens.map((i) => i.camadasAltura || 1)),
    [posicao.itens],
  );

  const camadaEfetiva =
    camadaMaxVisivel !== 'ALL' && camadaMaxVisivel <= maxCamadasVao
      ? camadaMaxVisivel
      : 'ALL';

  const { itensInfo, caixasVisiveis, larguraLivreCm } = useMemo(() => {
    const layout = gerarLayoutVao3d({
      posicao,
      saldos,
      caixaPorId,
      modoQtd,
      usarAmarracao,
      zBase: paleteH,
      alturaMaxCaixasCm: hVao,
      aplicarCulling: false,
      dirSign: 1,
    });

    const totalItens = layout.itens.length;
    const boxes: BoxRender[] = [];
    const infos: Array<{
      item: AlocacaoItemView;
      itemIndex: number;
      estCx: number;
      capCx: number;
      amarrado: boolean;
      swatch: string;
      stroke: string;
    }> = [];

    for (const entry of layout.itens) {
      const prod = prodPorCodigo.get(entry.item.produtoCodigo);
      const estouro = entry.item.estouroAltura || posicao.temEstouro;
      const ehColoracao = Boolean(prod?.ehColoracao);
      const ehKit = Boolean(prod?.ehKit);
      const baseCor = coresItemVao3d(
        entry.itemIndex,
        totalItens,
        estouro,
        ehColoracao,
        ehKit,
        false,
      );

      infos.push({
        item: entry.item,
        itemIndex: entry.itemIndex,
        estCx: entry.estCx,
        capCx: entry.capCx,
        amarrado: entry.amarrado,
        swatch: baseCor.swatch,
        stroke: baseCor.stroke,
      });

      for (const b of entry.caixas) {
        if (camadaEfetiva !== 'ALL' && (b.camada ?? b.iz + 1) > camadaEfetiva) {
          continue;
        }
        const c = coresItemVao3d(
          entry.itemIndex,
          totalItens,
          estouro,
          ehColoracao,
          ehKit,
          b.rotacionada,
        );
        boxes.push({
          ...b,
          itemId: entry.item.id,
          cor: {
            top: c.top,
            frontX: c.side,
            frontY: c.front,
            stroke: c.stroke,
          },
          drawFlap: b.dx >= 8 && b.dy >= 8,
        });
      }
    }

    return {
      itensInfo: infos,
      caixasVisiveis: ordenarCaixas3dPorCamera(boxes, yawDeg),
      larguraLivreCm: layout.larguraLivreCm,
    };
  }, [
    posicao,
    hVao,
    saldos,
    modoQtd,
    prodPorCodigo,
    caixaPorId,
    usarAmarracao,
    camadaEfetiva,
    yawDeg,
  ]);

  const activeFocusId = itemFocadoId ?? hoverItemId;
  const itemFocadoObj = useMemo(
    () => (itemFocadoId ? itensInfo.find((i) => i.item.id === itemFocadoId) ?? null : null),
    [itensInfo, itemFocadoId],
  );

  const cam = useMemo(
    () => criarCamera3d(yawDeg, vistaTopo ? 76 : 28),
    [yawDeg, vistaTopo],
  );

  const projHelper = useMemo(() => {
    const cx = wVao / 2;
    const cy = dVao / 2;
    const maxZ = paleteH + hVao + 8;
    const cz = maxZ * 0.44;
    const corners: Array<{ px: number; py: number }> = [];
    for (const x of [-4, wVao + 4]) {
      for (const y of [-28, dVao + 4]) {
        for (const z of [0, maxZ]) {
          corners.push(projetarPonto3d(cam, x, y, z, cx, cy, cz));
        }
      }
    }
    const minX = Math.min(...corners.map((c) => c.px));
    const maxX = Math.max(...corners.map((c) => c.px));
    const minY = Math.min(...corners.map((c) => c.py));
    const maxY = Math.max(...corners.map((c) => c.py));
    const vw = 420;
    const vh = 276;
    const padX = 24;
    const padY = 20;
    const scale = Math.min(
      (vw - padX * 2) / Math.max(1, maxX - minX),
      (vh - padY * 2) / Math.max(1, maxY - minY),
    );
    const ox = vw / 2 - ((minX + maxX) / 2) * scale;
    const oy = vh / 2 - ((minY + maxY) / 2) * scale;

    const toPt = (x: number, y: number, z: number) => {
      const p = projetarPonto3d(cam, x, y, z, cx, cy, cz);
      return { x: ox + p.px * scale, y: oy + p.py * scale };
    };
    return { vw, vh, toPt };
  }, [cam, wVao, dVao, hVao]);

  const poly = (pts: Array<{ x: number; y: number }>) =>
    pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const tacosPaleteOrdenados = useMemo(() => {
    const wTaco = Math.max(8, Math.round(wVao * 0.13));
    const dTaco = Math.max(9, Math.round(dVao * 0.12));
    const xs = [0, (wVao - wTaco) / 2, wVao - wTaco];
    const ys = [0, (dVao - dTaco) / 2, dVao - dTaco];
    const corTaco: CorFace = {
      top: '#cfa974',
      frontX: '#9a733e',
      frontY: '#b88f54',
      stroke: '#6e502f',
    };
    const out: BoxRender[] = [];
    ys.forEach((ty, iy) => {
      xs.forEach((tx, ix) => {
        out.push({
          x: tx,
          y: ty,
          z: 2,
          dx: wTaco,
          dy: dTaco,
          dz: 6,
          ix,
          iy,
          iz: 0,
          rotacionada: false,
          cor: corTaco,
          isPalete: true,
        });
      });
    });
    return ordenarCaixas3dPorCamera(out, yawDeg);
  }, [wVao, dVao, yawDeg]);

  const renderBox = (b: BoxRender, key: string, strokeW = 0.72) => {
    const { toPt } = projHelper;
    const x0 = b.x;
    const x1 = b.x + b.dx;
    const y0 = b.y;
    const y1 = b.y + b.dy;
    const z0 = b.z;
    const z1 = b.z + b.dz;

    const faces: React.ReactElement[] = [];

    if (cam.wx > 1e-4) {
      faces.push(
        <polygon
          key="px"
          points={poly([
            toPt(x1, y0, z0),
            toPt(x1, y1, z0),
            toPt(x1, y1, z1),
            toPt(x1, y0, z1),
          ])}
          fill={b.cor.frontX}
          stroke={b.cor.stroke}
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />,
      );
    } else if (cam.wx < -1e-4) {
      faces.push(
        <polygon
          key="nx"
          points={poly([
            toPt(x0, y0, z0),
            toPt(x0, y1, z0),
            toPt(x0, y1, z1),
            toPt(x0, y0, z1),
          ])}
          fill={b.cor.frontX}
          stroke={b.cor.stroke}
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />,
      );
    }

    if (cam.wy < -1e-4) {
      faces.push(
        <polygon
          key="ny"
          points={poly([
            toPt(x0, y0, z0),
            toPt(x1, y0, z0),
            toPt(x1, y0, z1),
            toPt(x0, y0, z1),
          ])}
          fill={b.cor.frontY}
          stroke={b.cor.stroke}
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />,
      );
    } else if (cam.wy > 1e-4) {
      faces.push(
        <polygon
          key="py"
          points={poly([
            toPt(x0, y1, z0),
            toPt(x1, y1, z0),
            toPt(x1, y1, z1),
            toPt(x0, y1, z1),
          ])}
          fill={b.cor.frontY}
          stroke={b.cor.stroke}
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />,
      );
    }

    if (cam.wz > 1e-4) {
      const fA =
        b.dy >= b.dx
          ? toPt(x0 + b.dx * 0.5, y0 + 1, z1)
          : toPt(x0 + 1, y0 + b.dy * 0.5, z1);
      const fB =
        b.dy >= b.dx
          ? toPt(x0 + b.dx * 0.5, y1 - 1, z1)
          : toPt(x1 - 1, y0 + b.dy * 0.5, z1);
      faces.push(
        <polygon
          key="pz"
          points={poly([
            toPt(x0, y0, z1),
            toPt(x1, y0, z1),
            toPt(x1, y1, z1),
            toPt(x0, y1, z1),
          ])}
          fill={b.cor.top}
          stroke={b.cor.stroke}
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />,
      );
      if (b.drawFlap) {
        faces.push(
          <line
            key="flap"
            x1={fA.x}
            y1={fA.y}
            x2={fB.x}
            y2={fB.y}
            stroke={b.cor.stroke}
            strokeWidth={0.5}
            opacity={0.4}
          />,
        );
      }
    }

    const op =
      !b.isPalete && activeFocusId && b.itemId && activeFocusId !== b.itemId
        ? 0.2
        : 1;

    return (
      <g
        key={key}
        opacity={op}
        onClick={
          b.itemId
            ? (e) => {
                e.stopPropagation();
                setItemFocadoId((cur) => (cur === b.itemId ? null : b.itemId!));
              }
            : undefined
        }
        className={b.itemId ? 'cursor-pointer' : undefined}
      >
        {faces}
      </g>
    );
  };

  // Posição das etiquetas sobre o topo de cada pilha de produto
  const pilhaLabels = useMemo(() => {
    const { toPt } = projHelper;
    const labels: Array<{
      itemId: string;
      text: string;
      x: number;
      y: number;
      stroke: string;
      focado: boolean;
      apagado: boolean;
    }> = [];

    for (const info of itensInfo) {
      const boxesItem = caixasVisiveis.filter((b) => b.itemId === info.item.id);
      if (boxesItem.length === 0) continue;
      const maxZ = boxesItem.reduce((m, b) => Math.max(m, b.z), 0);
      const topBoxes = boxesItem.filter((b) => b.z >= maxZ - 1);
      const avgX =
        topBoxes.reduce((s, b) => s + b.x + b.dx * 0.5, 0) / topBoxes.length;
      const avgY =
        topBoxes.reduce((s, b) => s + b.y + b.dy * 0.5, 0) / topBoxes.length;
      const topZ = maxZ + (topBoxes[0]?.dz ?? 14) + 2.5;
      const pt = toPt(avgX, avgY, topZ);
      const focado = activeFocusId === info.item.id;
      const showCodigo = itensInfo.length === 1 || focado;
      labels.push({
        itemId: info.item.id,
        text: showCodigo ? info.item.produtoCodigo : `#${info.itemIndex + 1}`,
        x: pt.x,
        y: pt.y,
        stroke: info.stroke,
        focado,
        apagado: Boolean(activeFocusId && !focado),
      });
    }
    return labels;
  }, [itensInfo, caixasVisiveis, projHelper, activeFocusId]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startYaw: yawDeg };
    setArrastando(true);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const next = (((dragRef.current.startYaw + dx * 0.65) % 360) + 360) % 360;
    setYawDeg(next);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    setArrastando(false);
  };

  const { toPt } = projHelper;
  const deckCor: CorFace = {
    top: '#ebd5b0',
    frontX: '#be9558',
    frontY: '#d9b782',
    stroke: '#785d3b',
  };
  const baseCor: CorFace = {
    top: '#c9a36a',
    frontX: '#8c6735',
    frontY: '#a98047',
    stroke: '#6e502f',
  };

  const pFrenteL = toPt(4, -13, 0);
  const pFrenteR = toPt(wVao - 4, -13, 0);
  const pFrenteLbl = toPt(wVao / 2, -23, 0);

  return (
    <div className="space-y-2">
      {/* Controles 3D girável */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-1">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => setModoQtd('estoque')}
              className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                modoQtd === 'estoque' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Estoque
            </button>
            <button
              type="button"
              onClick={() => setModoQtd('capacidade')}
              className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                modoQtd === 'capacidade' ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Capacidade
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => setUsarAmarracao(true)}
              className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                usarAmarracao ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Amarração
            </button>
            <button
              type="button"
              onClick={() => setUsarAmarracao(false)}
              className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                !usarAmarracao ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              Alinhado
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => setYawDeg((d) => (((d - 45) % 360) + 360) % 360)}
              className="px-1.5 py-1 rounded-md text-zinc-700 hover:bg-zinc-200/70 cursor-pointer flex items-center gap-0.5 font-semibold"
              title="Girar 45° para a esquerda"
              aria-label="Girar -45°"
            >
              <RotateCcw className="h-3 w-3" />
              -45°
            </button>
            <button
              type="button"
              onClick={() => {
                setYawDeg(32);
                setVistaTopo(false);
              }}
              className="px-2 py-1 rounded-md font-mono font-semibold text-zinc-700 hover:bg-zinc-200/70 cursor-pointer"
              title="Resetar ângulo 3D"
            >
              {Math.round(yawDeg)}°
            </button>
            <button
              type="button"
              onClick={() => setYawDeg((d) => (d + 45) % 360)}
              className="px-1.5 py-1 rounded-md text-zinc-700 hover:bg-zinc-200/70 cursor-pointer flex items-center gap-0.5 font-semibold"
              title="Girar 45° para a direita"
              aria-label="Girar +45°"
            >
              +45°
              <RotateCw className="h-3 w-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setVistaTopo((v) => !v)}
            className={`px-2 py-1 rounded-lg border font-semibold cursor-pointer flex items-center gap-1 ${
              vistaTopo
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            <Eye className="h-3 w-3" />
            Topo
          </button>
        </div>
      </div>

      {maxCamadasVao > 1 && posicao.itens.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-zinc-500 font-semibold mr-1">Camadas:</span>
          <button
            type="button"
            onClick={() => setCamadaMaxVisivel('ALL')}
            className={`px-2 py-0.5 rounded-md border font-semibold cursor-pointer ${
              camadaEfetiva === 'ALL'
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-600 border-zinc-200'
            }`}
          >
            Todas ({maxCamadasVao})
          </button>
          {Array.from({ length: Math.min(8, maxCamadasVao) }).map((_, i) => {
            const c = i + 1;
            return (
              <button
                key={`cam-${c}`}
                type="button"
                onClick={() => setCamadaMaxVisivel(c)}
                className={`px-2 py-0.5 rounded-md border font-mono font-semibold cursor-pointer ${
                  camadaEfetiva === c
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200'
                }`}
              >
                C{c}
              </button>
            );
          })}
        </div>
      )}

      {/* Viewport SVG 360° */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-1.5 overflow-hidden">
        <svg
          viewBox={`0 0 ${projHelper.vw} ${projHelper.vh}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none' }}
          className={`w-full h-auto max-h-[250px] select-none ${
            arrastando ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          role="img"
          aria-label={`Palete 3D girável do vão ${posicao.codigo}`}
        >
          {/* Base do vão */}
          <polygon
            points={poly([
              toPt(-2, -2, 0),
              toPt(wVao + 2, -2, 0),
              toPt(wVao + 2, dVao + 2, 0),
              toPt(-2, dVao + 2, 0),
            ])}
            fill="#f4f4f5"
            stroke="#d4d4d8"
            strokeWidth={1}
          />

          {/* Indicador de frente / corredor */}
          <line
            x1={pFrenteL.x}
            y1={pFrenteL.y}
            x2={pFrenteR.x}
            y2={pFrenteR.y}
            stroke="#71717a"
            strokeWidth={1.1}
            strokeDasharray="3 2"
          />
          <text
            x={pFrenteLbl.x}
            y={pFrenteLbl.y}
            textAnchor="middle"
            fontSize={8}
            fontFamily="ui-monospace, monospace"
            fontWeight={700}
            fill="#52525b"
          >
            FRENTE
          </text>

          {/* Palete PBR 3D real girável */}
          {renderBox(
            {
              x: 0,
              y: 0,
              z: 0,
              dx: wVao,
              dy: dVao,
              dz: 2,
              ix: 0,
              iy: 0,
              iz: 0,
              rotacionada: false,
              cor: baseCor,
              isPalete: true,
            },
            'pal-base',
            0.6,
          )}

          {tacosPaleteOrdenados.map((t, idx) => renderBox(t, `pal-taco-${idx}`, 0.5))}

          {renderBox(
            {
              x: 0,
              y: 0,
              z: 8,
              dx: wVao,
              dy: dVao,
              dz: 3,
              ix: 0,
              iy: 0,
              iz: 1,
              rotacionada: false,
              cor: deckCor,
              isPalete: true,
            },
            'pal-deck',
            0.7,
          )}

          {/* Ripas do tampo */}
          {[0.2, 0.4, 0.6, 0.8].map((frac) => {
            const a = toPt(2, dVao * frac, paleteH);
            const b = toPt(wVao - 2, dVao * frac, paleteH);
            return (
              <line
                key={`deck-ripa-${frac}`}
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

          {/* Faixa livre restante */}
          {larguraLivreCm > 1 && (
            <polygon
              points={poly([
                toPt(wVao - larguraLivreCm + 1, 2, paleteH + 0.1),
                toPt(wVao - 1, 2, paleteH + 0.1),
                toPt(wVao - 1, dVao - 2, paleteH + 0.1),
                toPt(wVao - larguraLivreCm + 1, dVao - 2, paleteH + 0.1),
              ])}
              fill="#ffffff"
              fillOpacity={0.35}
              stroke="#71717a"
              strokeWidth={0.8}
              strokeDasharray="3 2"
            />
          )}

          {/* Caixas individuais com cores distintas por produto e clique para focar */}
          {caixasVisiveis.map((b, idx) => renderBox(b, `cx-g-${idx}`, 0.65))}

          {/* Envelope tracejado da altura livre do vão */}
          {(() => {
            const zTop = paleteH + hVao;
            const corEnv = posicao.temEstouro ? '#ef4444' : '#a1a1aa';
            const segs: Array<
              [{ x: number; y: number; z: number }, { x: number; y: number; z: number }]
            > = [
              [{ x: 0, y: 0, z: paleteH }, { x: 0, y: 0, z: zTop }],
              [{ x: wVao, y: 0, z: paleteH }, { x: wVao, y: 0, z: zTop }],
              [{ x: 0, y: dVao, z: paleteH }, { x: 0, y: dVao, z: zTop }],
              [{ x: wVao, y: dVao, z: paleteH }, { x: wVao, y: dVao, z: zTop }],
              [{ x: 0, y: 0, z: zTop }, { x: wVao, y: 0, z: zTop }],
              [{ x: wVao, y: 0, z: zTop }, { x: wVao, y: dVao, z: zTop }],
              [{ x: wVao, y: dVao, z: zTop }, { x: 0, y: dVao, z: zTop }],
              [{ x: 0, y: dVao, z: zTop }, { x: 0, y: 0, z: zTop }],
            ];
            return segs.map(([pA, pB], idx) => {
              const sA = toPt(pA.x, pA.y, pA.z);
              const sB = toPt(pB.x, pB.y, pB.z);
              return (
                <line
                  key={`env-${idx}`}
                  x1={sA.x}
                  y1={sA.y}
                  x2={sB.x}
                  y2={sB.y}
                  stroke={corEnv}
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                  opacity={0.55}
                />
              );
            });
          })()}

          {/* Etiquetas de identificação (#1, #2... ou código) sobre cada pilha */}
          {pilhaLabels.map((lbl) => {
            const wPill = Math.max(20, lbl.text.length * 5.2 + 8);
            const hPill = 13;
            return (
              <g
                key={`pilha-lbl-${lbl.itemId}`}
                transform={`translate(${lbl.x.toFixed(1)}, ${(lbl.y - 4).toFixed(1)})`}
                opacity={lbl.apagado ? 0.25 : 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setItemFocadoId((cur) => (cur === lbl.itemId ? null : lbl.itemId));
                }}
                className="cursor-pointer"
              >
                <rect
                  x={-wPill / 2}
                  y={-hPill / 2}
                  width={wPill}
                  height={hPill}
                  rx={4}
                  fill={lbl.focado ? '#18181b' : '#ffffff'}
                  fillOpacity={0.94}
                  stroke={lbl.focado ? '#18181b' : lbl.stroke}
                  strokeWidth={lbl.focado ? 1.1 : 0.85}
                />
                <text
                  x={0}
                  y={3.2}
                  textAnchor="middle"
                  fontSize={7.8}
                  fontFamily="ui-monospace, monospace"
                  fontWeight={700}
                  fill={lbl.focado ? '#ffffff' : '#18181b'}
                >
                  {lbl.text}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legenda clicável por produto + foco individual */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
          <div className="flex flex-wrap items-center gap-1.5">
            {itensInfo.length === 0 ? (
              <span className="text-zinc-400">
                Palete livre ({posicao.larguraCm}×{posicao.comprimentoCm} cm)
              </span>
            ) : (
              itensInfo.map((info) => {
                const selecionado = itemFocadoId === info.item.id;
                const multi = itensInfo.length >= 2;
                return (
                  <button
                    key={`leg-${info.item.id}`}
                    type="button"
                    onClick={() =>
                      setItemFocadoId((cur) => (cur === info.item.id ? null : info.item.id))
                    }
                    onMouseEnter={() => setHoverItemId(info.item.id)}
                    onMouseLeave={() => setHoverItemId(null)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-left cursor-pointer transition-colors ${
                      selecionado
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                    title={`${info.item.produtoCodigo} — ${info.item.produtoDescricao}`}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-xs shrink-0 border border-black/20"
                      style={{ backgroundColor: info.swatch }}
                    />
                    {multi && (
                      <span
                        className={`font-mono text-[10px] font-bold ${
                          selecionado ? 'text-zinc-300' : 'text-zinc-500'
                        }`}
                      >
                        #{info.itemIndex + 1}
                      </span>
                    )}
                    <span className="font-mono font-bold">
                      {info.item.produtoCodigo}
                    </span>
                    <span
                      className={`font-mono text-[10px] ${
                        selecionado ? 'text-zinc-300' : 'text-zinc-500'
                      }`}
                    >
                      {info.estCx}/{info.capCx}cx
                    </span>
                    {usarAmarracao && info.amarrado && (
                      <span
                        className={`px-1 py-0.2 rounded text-[9px] font-semibold ${
                          selecionado
                            ? 'bg-zinc-700 text-zinc-100'
                            : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        Amarração
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <span className="text-[10px] text-zinc-400">
            {itensInfo.length >= 2 ? 'Clique no item para isolar · ' : ''}
            Arraste para girar 360°
          </span>
        </div>

        {itemFocadoObj && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-100/80 px-2.5 py-1.5 text-[11px]">
            <div className="min-w-0 flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-xs shrink-0 border border-black/20"
                style={{ backgroundColor: itemFocadoObj.swatch }}
              />
              <span className="font-mono font-bold text-zinc-900">
                {itensInfo.length >= 2 ? `#${itemFocadoObj.itemIndex + 1} · ` : ''}
                {itemFocadoObj.item.produtoCodigo}
              </span>
              <span className="truncate text-zinc-700">
                — {itemFocadoObj.item.produtoDescricao}
              </span>
              {itemFocadoObj.item.caixaCodigo && (
                <span className="font-mono text-zinc-500 shrink-0">
                  · CX {itemFocadoObj.item.caixaCodigo}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setItemFocadoId(null)}
              className="font-semibold text-zinc-700 hover:text-zinc-900 underline cursor-pointer shrink-0"
            >
              Ver todos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
