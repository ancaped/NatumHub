import React from 'react';
import type { BlocoVaoPlanta, LayoutPalete, PlantaVaoResultado } from './paletizacao';

function fmtCm(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}

interface DesenhoCaixaIsometricoProps {
  alturaCm: number;
  comprimentoCm: number;
  larguraCm: number;
  codigo?: string;
  pesoBrutoKg?: number | null;
  podeGirar?: boolean;
}

/**
 * Desenho isométrico proporcional da caixa de embarque com cotas A × C × L
 * e acabamento técnico em papelão kraft.
 */
export function DesenhoCaixaIsometrico({
  alturaCm,
  comprimentoCm,
  larguraCm,
  codigo,
  pesoBrutoKg,
  podeGirar = true,
}: DesenhoCaixaIsometricoProps) {
  const a = alturaCm > 0 ? alturaCm : 1;
  const c = comprimentoCm > 0 ? comprimentoCm : 1;
  const l = larguraCm > 0 ? larguraCm : 1;

  // Projeção isométrica real:
  // eixo largura (+x): (cos30, -sin30), eixo comprimento (+z): (-cos30, -sin30), eixo altura (+y): (0, -1)
  const cos30 = 0.866;
  const sin30 = 0.5;
  const rawW = (l + c) * cos30;
  const rawH = a + (l + c) * sin30;
  const scale = Math.min(180 / Math.max(rawW, 1), 115 / Math.max(rawH, 1));

  const lw = l * scale;
  const cw = c * scale;
  const ah = a * scale;

  const lx = lw * cos30;
  const ly = lw * sin30;
  const cx = cw * cos30;
  const cy = cw * sin30;

  // Ponto inferior frontal (base central)
  const totalW = lx + cx;
  const bx = (280 - totalW) / 2 + cx;
  const by = 185 - (170 - (ah + ly + cy)) / 2;

  const p0 = { x: bx, y: by }; // frente-baixo
  const pR = { x: bx + lx, y: by - ly }; // direita-baixo
  const pL = { x: bx - cx, y: by - cy }; // esquerda-baixo
  const pT = { x: bx, y: by - ah }; // frente-topo
  const pTR = { x: pR.x, y: pR.y - ah }; // direita-topo
  const pTL = { x: pL.x, y: pL.y - ah }; // esquerda-topo
  const pBack = { x: bx - cx + lx, y: by - ah - cy - ly }; // fundo-topo

  const pts = (arr: Array<{ x: number; y: number }>) =>
    arr.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Fita central no topo ao longo do comprimento
  const tapeMidL = { x: (pT.x + pTR.x) / 2, y: (pT.y + pTR.y) / 2 };
  const tapeMidBack = { x: (pTL.x + pBack.x) / 2, y: (pTL.y + pBack.y) / 2 };

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 text-[11px]">
        <span className="font-bold text-zinc-800">
          {codigo ? `CX ${codigo} · Proporção 3D` : 'Caixa · Proporção 3D'}
        </span>
        <span className="font-mono text-zinc-500">
          A {fmtCm(a)} × C {fmtCm(c)} × L {fmtCm(l)} cm
          {pesoBrutoKg ? ` · ${pesoBrutoKg} kg` : ''}
          {!podeGirar ? ' · Sem giro 90°' : ''}
        </span>
      </div>
      <svg
        viewBox="0 0 280 198"
        className="w-full h-auto max-h-[156px]"
        role="img"
        aria-label={`Desenho proporcional da caixa ${fmtCm(a)} por ${fmtCm(c)} por ${fmtCm(l)} cm`}
      >
        {/* Sombra sutil */}
        <polygon
          points={pts([
            { x: p0.x, y: p0.y + 4 },
            { x: pR.x + 4, y: pR.y + 4 },
            { x: pBack.x + 2, y: by - cy - ly + 4 },
            { x: pL.x - 2, y: pL.y + 4 },
          ])}
          fill="#e4e4e7"
          opacity={0.7}
        />
        {/* Face esquerda (Comprimento) */}
        <polygon
          points={pts([pL, p0, pT, pTL])}
          fill="#d7bc91"
          stroke="#785d3b"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
        {/* Face direita (Largura) */}
        <polygon
          points={pts([p0, pR, pTR, pT])}
          fill="#e6cfa9"
          stroke="#785d3b"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
        {/* Tampa (Topo) */}
        <polygon
          points={pts([pTL, pT, pTR, pBack])}
          fill="#f2e4cc"
          stroke="#785d3b"
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
        {/* Fita adesiva central */}
        <line
          x1={tapeMidL.x}
          y1={tapeMidL.y}
          x2={tapeMidBack.x}
          y2={tapeMidBack.y}
          stroke="#b8935c"
          strokeWidth={4}
          strokeLinecap="butt"
          opacity={0.55}
        />

        {/* Cota Comprimento (esquerda-baixo) */}
        <line
          x1={pL.x - 4}
          y1={pL.y + 7}
          x2={p0.x - 2}
          y2={p0.y + 8}
          stroke="#52525b"
          strokeWidth={0.9}
        />
        <text
          x={(pL.x + p0.x) / 2 - 8}
          y={(pL.y + p0.y) / 2 + 17}
          textAnchor="middle"
          fontSize={9.5}
          fontFamily="ui-monospace, monospace"
          fontWeight={700}
          fill="#27272a"
        >
          C {fmtCm(c)}
        </text>

        {/* Cota Largura (direita-baixo) */}
        <line
          x1={p0.x + 2}
          y1={p0.y + 8}
          x2={pR.x + 4}
          y2={pR.y + 7}
          stroke="#52525b"
          strokeWidth={0.9}
        />
        <text
          x={(p0.x + pR.x) / 2 + 10}
          y={(p0.y + pR.y) / 2 + 17}
          textAnchor="middle"
          fontSize={9.5}
          fontFamily="ui-monospace, monospace"
          fontWeight={700}
          fill="#27272a"
        >
          L {fmtCm(l)}
        </text>

        {/* Cota Altura (direita vertical) */}
        <line
          x1={pR.x + 9}
          y1={pR.y}
          x2={pTR.x + 9}
          y2={pTR.y}
          stroke="#52525b"
          strokeWidth={0.9}
        />
        <line x1={pR.x + 6} y1={pR.y} x2={pR.x + 12} y2={pR.y} stroke="#52525b" strokeWidth={0.9} />
        <line x1={pTR.x + 6} y1={pTR.y} x2={pTR.x + 12} y2={pTR.y} stroke="#52525b" strokeWidth={0.9} />
        <text
          x={pR.x + 14}
          y={(pR.y + pTR.y) / 2 + 3}
          textAnchor="start"
          fontSize={9.5}
          fontFamily="ui-monospace, monospace"
          fontWeight={700}
          fill="#27272a"
        >
          A {fmtCm(a)}
        </text>
      </svg>
    </div>
  );
}

interface DesenhoPlantaPaleteProps {
  layout: LayoutPalete;
  paleteLarguraCm: number;
  paleteComprimentoCm: number;
  camada: 'impar' | 'par';
  mostrarSobreposicao?: boolean;
}

/**
 * Vista superior proporcional (planta baixa) do palete PBR/estrado mostrando
 * disposição exata das caixas e o travamento da camada par (amarração).
 */
export function DesenhoPlantaPalete({
  layout,
  paleteLarguraCm,
  paleteComprimentoCm,
  camada,
  mostrarSobreposicao = true,
}: DesenhoPlantaPaleteProps) {
  const padL = 24;
  const padT = 18;
  const padR = 34;
  const padB = 26;
  const maxW = 240;
  const maxH = 220;
  const escala = Math.min(maxW / paleteLarguraCm, maxH / paleteComprimentoCm);
  const drawW = paleteLarguraCm * escala;
  const drawH = paleteComprimentoCm * escala;
  const vw = padL + drawW + padR;
  const vh = padT + drawH + padB;

  const caixasAtivas = camada === 'par' ? layout.caixasPar : layout.caixasImpar;
  const caixasBase = camada === 'par' && mostrarSobreposicao ? layout.caixasImpar : [];

  return (
    <svg
      viewBox={`0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}`}
      className="w-full h-auto max-h-[215px]"
      role="img"
      aria-label={`Planta do palete ${paleteLarguraCm} por ${paleteComprimentoCm} cm com ${layout.caixasPorLastro} caixas`}
    >
      <defs>
        <pattern id="hachura-90" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#8c6d46" strokeWidth="1" opacity="0.22" />
        </pattern>
      </defs>

      {/* Estrado de madeira realista sutil */}
      <rect
        x={padL}
        y={padT}
        width={drawW}
        height={drawH}
        rx={2}
        fill="#efe0c6"
        stroke="#8c6d46"
        strokeWidth={1.4}
      />
      {[0.2, 0.4, 0.6, 0.8].map((f) => (
        <line
          key={f}
          x1={padL}
          y1={padT + drawH * f}
          x2={padL + drawW}
          y2={padT + drawH * f}
          stroke="#c8ad82"
          strokeWidth={0.8}
          strokeDasharray="3 2"
        />
      ))}

      {/* Caixas ativas do lastro */}
      {caixasAtivas.map((c, idx) => {
        const rx = padL + c.x * escala;
        const ry = padT + c.y * escala;
        const rw = c.w * escala;
        const rh = c.h * escala;
        return (
          <g key={`cx-${idx}`}>
            <rect
              x={rx + 0.6}
              y={ry + 0.6}
              width={Math.max(1, rw - 1.2)}
              height={Math.max(1, rh - 1.2)}
              rx={1.5}
              fill={c.rotacionada ? '#e3cca8' : '#f5ebd9'}
              stroke={c.rotacionada ? '#785d3b' : '#9a7b4f'}
              strokeWidth={1}
            />
            {c.rotacionada && (
              <rect
                x={rx + 0.6}
                y={ry + 0.6}
                width={Math.max(1, rw - 1.2)}
                height={Math.max(1, rh - 1.2)}
                rx={1.5}
                fill="url(#hachura-90)"
              />
            )}
            {/* Marcação discreta da orientação / fita */}
            {rw > 10 && rh > 10 && (
              <line
                x1={c.rotacionada ? rx + 3 : rx + rw / 2}
                y1={c.rotacionada ? ry + rh / 2 : ry + 3}
                x2={c.rotacionada ? rx + rw - 3 : rx + rw / 2}
                y2={c.rotacionada ? ry + rh / 2 : ry + rh - 3}
                stroke="#9a7b4f"
                strokeWidth={0.9}
                opacity={0.45}
              />
            )}
          </g>
        );
      })}

      {/* Fantasma tracejado da camada anterior quando visualizando Camada Par */}
      {caixasBase.map((c, idx) => (
        <rect
          key={`base-${idx}`}
          x={padL + c.x * escala + 1}
          y={padT + c.y * escala + 1}
          width={Math.max(1, c.w * escala - 2)}
          height={Math.max(1, c.h * escala - 2)}
          fill="none"
          stroke="#18181b"
          strokeWidth={0.75}
          strokeDasharray="2 2"
          opacity={0.35}
        />
      ))}

      {/* Cota Comprimento (direita) */}
      <line
        x1={padL + drawW + 7}
        y1={padT}
        x2={padL + drawW + 7}
        y2={padT + drawH}
        stroke="#52525b"
        strokeWidth={0.9}
      />
      <text
        x={padL + drawW + 12}
        y={padT + drawH / 2 + 3}
        fontSize={9}
        fontFamily="ui-monospace, monospace"
        fontWeight={700}
        fill="#27272a"
      >
        {fmtCm(paleteComprimentoCm)}cm
      </text>

      {/* Cota Largura (inferior = frente/corredor) */}
      <line
        x1={padL}
        y1={padT + drawH + 7}
        x2={padL + drawW}
        y2={padT + drawH + 7}
        stroke="#52525b"
        strokeWidth={0.9}
      />
      <text
        x={padL + drawW / 2}
        y={padT + drawH + 19}
        textAnchor="middle"
        fontSize={9}
        fontFamily="ui-monospace, monospace"
        fontWeight={700}
        fill="#27272a"
      >
        {fmtCm(paleteLarguraCm)} cm · FRENTE / CORREDOR
      </text>
    </svg>
  );
}

function coresBlocoVao(b: BlocoVaoPlanta): { fill: string; stroke: string; text: string } {
  if (b.estouroAltura || b.estouroLargura) {
    return { fill: '#fee2e2', stroke: '#dc2626', text: '#7f1d1d' };
  }
  if (b.ehColoracao) {
    return { fill: '#fef3c7', stroke: '#d97706', text: '#78350f' };
  }
  if (b.ehKit) {
    return { fill: '#e4e4e7', stroke: '#3f3f46', text: '#18181b' };
  }
  return { fill: '#f2e4cc', stroke: '#8c6d46', text: '#27272a' };
}

/**
 * Planta superior proporcional do vão de porta-paletes dentro do PosicaoDrawer,
 * exibindo todos os itens alocados lado a lado e a largura livre restante.
 */
export function DesenhoPlantaVao({ planta }: { planta: PlantaVaoResultado }) {
  const padL = 14;
  const padT = 12;
  const padR = 38;
  const padB = 22;
  const maxW = 240;
  const maxH = 165;
  const escala = Math.min(maxW / planta.larguraVaoCm, maxH / planta.comprimentoVaoCm);
  const drawW = planta.larguraVaoCm * escala;
  const drawH = planta.comprimentoVaoCm * escala;
  const vw = padL + drawW + padR;
  const vh = padT + drawH + padB;

  const usadoDrawW = Math.min(drawW, planta.larguraOcupadaCm * escala);

  return (
    <svg
      viewBox={`0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}`}
      className="w-full h-auto max-h-[200px]"
      role="img"
      aria-label={`Planta do vão ${planta.larguraVaoCm} por ${planta.comprimentoVaoCm} cm`}
    >
      {/* Estrado do vão */}
      <rect
        x={padL}
        y={padT}
        width={drawW}
        height={drawH}
        rx={2}
        fill="#efe0c6"
        stroke="#8c6d46"
        strokeWidth={1.3}
      />

      {/* Área livre restante */}
      {planta.larguraLivreCm > 0.5 && (
        <g>
          <rect
            x={padL + usadoDrawW + 1}
            y={padT + 2}
            width={Math.max(0, drawW - usadoDrawW - 3)}
            height={drawH - 4}
            fill="#fafafa"
            stroke="#a1a1aa"
            strokeWidth={0.9}
            strokeDasharray="3 2"
            opacity={0.9}
          />
          {drawW - usadoDrawW > 30 && (
            <text
              x={padL + usadoDrawW + (drawW - usadoDrawW) / 2}
              y={padT + drawH / 2 + 3}
              textAnchor="middle"
              fontSize={8.5}
              fontFamily="ui-monospace, monospace"
              fill="#52525b"
            >
              Livre {fmtCm(planta.larguraLivreCm)}
            </text>
          )}
        </g>
      )}

      {/* Blocos alocados */}
      {planta.blocos.map((b) => {
        const bx = padL + b.x * escala;
        const by = padT + b.y * escala;
        const bw = Math.min(drawW - (bx - padL) + 12, b.w * escala);
        const bh = Math.min(drawH, b.h * escala);
        const cor = coresBlocoVao(b);
        return (
          <g key={b.alocacaoId}>
            <rect
              x={bx + 0.5}
              y={by + 0.5}
              width={Math.max(4, bw - 1)}
              height={Math.max(8, bh - 1)}
              rx={1.5}
              fill={cor.fill}
              stroke={cor.stroke}
              strokeWidth={1.1}
            />
            {/* Grade sutil das fileiras × profundidade */}
            {Array.from({ length: Math.max(0, b.fileiras - 1) }).map((_, i) => (
              <line
                key={`fx-${i}`}
                x1={bx + ((i + 1) * bw) / b.fileiras}
                y1={by + 1}
                x2={bx + ((i + 1) * bw) / b.fileiras}
                y2={by + bh - 1}
                stroke={cor.stroke}
                strokeWidth={0.5}
                opacity={0.35}
              />
            ))}
            {Array.from({ length: Math.max(0, b.profundidade - 1) }).map((_, j) => (
              <line
                key={`py-${j}`}
                x1={bx + 1}
                y1={by + ((j + 1) * bh) / b.profundidade}
                x2={bx + bw - 1}
                y2={by + ((j + 1) * bh) / b.profundidade}
                stroke={cor.stroke}
                strokeWidth={0.5}
                opacity={0.35}
              />
            ))}
            {bw >= 22 && (
              <>
                <text
                  x={bx + bw / 2}
                  y={by + bh / 2 - 2}
                  textAnchor="middle"
                  fontSize={bw < 38 ? 7 : 8.5}
                  fontFamily="ui-monospace, monospace"
                  fontWeight={700}
                  fill={cor.text}
                >
                  {b.produtoCodigo}
                </text>
                <text
                  x={bx + bw / 2}
                  y={by + bh / 2 + 9}
                  textAnchor="middle"
                  fontSize={7.2}
                  fontFamily="ui-monospace, monospace"
                  fill={cor.text}
                >
                  {b.fileiras}×{b.profundidade}×{b.camadas}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Cotas */}
      <text
        x={padL + drawW + 6}
        y={padT + drawH / 2 + 3}
        fontSize={8.5}
        fontFamily="ui-monospace, monospace"
        fontWeight={700}
        fill="#27272a"
      >
        {fmtCm(planta.comprimentoVaoCm)}cm
      </text>
      <text
        x={padL + drawW / 2}
        y={padT + drawH + 14}
        textAnchor="middle"
        fontSize={8.5}
        fontFamily="ui-monospace, monospace"
        fontWeight={700}
        fill="#27272a"
      >
        Largura {fmtCm(planta.larguraVaoCm)} cm · Frente / Corredor
      </text>
    </svg>
  );
}
