import React, { useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Bug, Layers } from 'lucide-react';
import type { MapaSnapshot, MapaGroup, MapaModule, Feedback } from '../types';
import { contarAbertosPorModulo } from '../vinculo';
import { cn } from '../../lib/utils';

interface OrganogramaMapCanvasProps {
  snap: MapaSnapshot | null;
  positions: Record<string, { x: number; y: number }>;
  selectedKey: string | null;
  scale: number;
  pan: { x: number; y: number };
  setScale: React.Dispatch<React.SetStateAction<number>>;
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  onSelectModule: (moduleKey: string) => void;
  onPointerDownNode: (e: React.PointerEvent, key: string) => void;
  onPointerMoveNode: (e: React.PointerEvent) => void;
  onPointerUpNode: () => void;
  feedbacks: Feedback[];
}

const STATUS_STYLE: Record<string, string> = {
  live: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold',
  stub: 'bg-zinc-100 text-zinc-600 border border-zinc-200 font-medium',
  planned: 'bg-amber-50 text-amber-700 border border-amber-200 font-bold',
};

export default function OrganogramaMapCanvas({
  snap,
  positions,
  selectedKey,
  scale,
  pan,
  setScale,
  setPan,
  onSelectModule,
  onPointerDownNode,
  onPointerMoveNode,
  onPointerUpNode,
  feedbacks,
}: OrganogramaMapCanvasProps) {
  const panDrag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const groups = [...(snap?.groups || [])].sort((a, b) => a.sortOrder - b.sortOrder);

  // Calcula contagem de bugs abertos por módulo
  const bugCountByModule = React.useMemo(
    () => contarAbertosPorModulo(feedbacks, snap?.modules || []),
    [feedbacks, snap?.modules],
  );

  // Arestas SVG (conexões entre módulos)
  const edgesSvg = (snap?.edges || []).map((e) => {
    const f = positions[e.fromKey];
    const t = positions[e.toKey];
    if (!f || !t) return null;
    const x1 = f.x + 95;
    const y1 = f.y + 26;
    const x2 = t.x + 95;
    const y2 = t.y + 26;
    return (
      <g key={e.id}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#cbd5e1"
          strokeWidth="1.5"
          markerEnd="url(#arrow)"
          strokeDasharray={e.kind === 'optional' ? '4 4' : undefined}
        />
      </g>
    );
  });

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div
        className="relative w-full h-full overflow-hidden bg-[linear-gradient(to_right,rgba(228,228,231,.55)_1px,transparent_1px),linear-gradient(to_bottom,rgba(228,228,231,.55)_1px,transparent_1px)] bg-[size:24px_24px]"
        onPointerDown={(e) => {
          panDrag.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
        }}
        onPointerMove={(e) => {
          if (panDrag.current) {
            const p = panDrag.current;
            setPan({ x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) });
            return;
          }
          onPointerMoveNode(e);
        }}
        onPointerUp={() => {
          panDrag.current = null;
          onPointerUpNode();
        }}
      >
        <div
          className="absolute origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          {/* Conexões SVG */}
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={4000} height={2000}>
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {edgesSvg}
          </svg>

          {/* Caixas delimitadoras de Grupos */}
          {groups.map((g: MapaGroup) => {
            const kids = (snap?.modules || []).filter((m) => m.groupKey === g.key);
            const xs = kids.map((m) => positions[m.moduleKey]?.x ?? m.posX);
            const ys = kids.map((m) => positions[m.moduleKey]?.y ?? m.posY);
            if (!xs.length) return null;
            const minX = Math.min(...xs) - 16;
            const minY = Math.min(...ys) - 36;
            const maxX = Math.max(...xs) + 200;
            const maxY = Math.max(...ys) + 70;
            return (
              <div
                key={g.key}
                className="pointer-events-none absolute rounded-3xl border border-zinc-200/90 bg-white/45 backdrop-blur-2xs"
                style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY }}
              >
                <div className="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-zinc-500">
                  {g.label}
                </div>
              </div>
            );
          })}

          {/* Cards de Módulos (Arrastáveis) */}
          {(snap?.modules || []).map((m: MapaModule) => {
            const p = positions[m.moduleKey] || { x: m.posX, y: m.posY };
            const isSelected = selectedKey === m.moduleKey;
            const bugCount = bugCountByModule[m.moduleKey] || 0;

            return (
              <button
                key={m.moduleKey}
                type="button"
                onPointerDown={(e) => onPointerDownNode(e, m.moduleKey)}
                onClick={() => onSelectModule(m.moduleKey)}
                className={cn(
                  'absolute w-[190px] cursor-grab rounded-2xl border bg-white p-3 text-left shadow-xs transition-all active:cursor-grabbing hover:shadow-md',
                  isSelected
                    ? 'border-zinc-950 ring-2 ring-zinc-950/20 shadow-md z-20'
                    : 'border-zinc-200 hover:border-zinc-300'
                )}
                style={{ left: p.x, top: p.y }}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider', STATUS_STYLE[m.status] || STATUS_STYLE.stub)}>
                    {m.status}
                  </span>

                  <div className="flex items-center gap-1">
                    {bugCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded-full" title={`${bugCount} chamado(s) aberto(s)`}>
                        <Bug className="h-2.5 w-2.5" /> {bugCount}
                      </span>
                    )}
                    <span className="truncate text-[10px] font-mono text-zinc-400">{m.moduleKey}</span>
                  </div>
                </div>

                <div className="truncate text-xs font-bold text-zinc-900 leading-tight">{m.label}</div>
              </button>
            );
          })}
        </div>

        {/* Controles de Zoom Flutuantes no Canto Inferior Esquerdo */}
        <div className="absolute bottom-5 left-5 flex items-center gap-1 rounded-2xl border border-zinc-200 bg-white/95 backdrop-blur-md p-1 shadow-md z-30">
          <button
            type="button"
            title="Aproximar zoom"
            className="h-8 w-8 rounded-xl hover:bg-zinc-100 flex items-center justify-center text-zinc-700 transition-colors cursor-pointer"
            onClick={() => setScale((s) => Math.min(1.6, s + 0.1))}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Afastar zoom"
            className="h-8 w-8 rounded-xl hover:bg-zinc-100 flex items-center justify-center text-zinc-700 transition-colors cursor-pointer"
            onClick={() => setScale((s) => Math.max(0.4, s - 0.1))}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="h-4 w-[1px] bg-zinc-200 mx-0.5" />
          <button
            type="button"
            title="Enquadrar visualização"
            className="h-8 px-2.5 rounded-xl hover:bg-zinc-100 flex items-center gap-1.5 text-xs font-bold text-zinc-700 transition-colors cursor-pointer"
            onClick={() => {
              setScale(0.85);
              setPan({ x: 40, y: 20 });
            }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Enquadrar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
