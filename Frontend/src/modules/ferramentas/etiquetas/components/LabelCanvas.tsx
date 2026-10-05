import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { LabelElement, LabelTemplate } from '../lib/types';
import { generateBarcodeBars } from '../lib/barcodeGenerator';
import { generateQrMatrix } from '../lib/qrCodeGenerator';

interface LabelCanvasProps {
  template: LabelTemplate;
  selectedIds: string[];
  onSelectElement: (id: string | null, isMulti?: boolean) => void;
  onUpdateElement: (id: string, updates: Partial<LabelElement>, commitHistory?: boolean) => void;
  onUpdateMultipleElements?: (updates: { id: string; updates: Partial<LabelElement> }[], commitHistory?: boolean) => void;
  onDeleteElement: (id: string) => void;
  onDeleteMultipleElements?: (ids: string[]) => void;
  onCommitHistory?: () => void;
  zoomScale: number;
  showGrid?: boolean;
  snapToGrid?: boolean;
}

// 1mm equals ~3.7795px at 96 DPI screen
const MM_TO_PX_BASE = 3.779527559;
const SNAP_THRESHOLD_MM = 1.2; // Snap distance to guide lines

interface GuideLine {
  type: 'h' | 'v';
  pos_mm: number;
}

export default function LabelCanvas({
  template,
  selectedIds,
  onSelectElement,
  onUpdateElement,
  onUpdateMultipleElements,
  onDeleteElement,
  onDeleteMultipleElements,
  onCommitHistory,
  zoomScale,
  showGrid = true,
  snapToGrid = true,
}: LabelCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);

  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize';
    handle?: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w';
    elementId: string;
    startX: number;
    startY: number;
    initialElemX: number;
    initialElemY: number;
    initialElemW: number;
    initialElemH: number;
    hasMoved: boolean;
    // Initial positions for all selected elements if multi-dragging
    initialGroupPositions?: { id: string; x: number; y: number }[];
  } | null>(null);

  const isPortrait = template.orientation === 'portrait';
  const width_mm = isPortrait ? template.height_mm : template.width_mm;
  const height_mm = isPortrait ? template.width_mm : template.height_mm;

  const mmToPx = MM_TO_PX_BASE * zoomScale;
  const canvasWidthPx = width_mm * mmToPx;
  const canvasHeightPx = height_mm * mmToPx;

  // Keyboard events (Delete, Arrow navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIds.length === 0) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const step = e.shiftKey ? 2 : 0.5;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (onDeleteMultipleElements && selectedIds.length > 1) {
          onDeleteMultipleElements(selectedIds);
        } else if (selectedIds.length === 1) {
          onDeleteElement(selectedIds[0]);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

        selectedIds.forEach((id) => {
          const el = template.elements_json.find((item) => item.id === id);
          if (el) {
            onUpdateElement(
              id,
              {
                x_mm: Math.max(0, Math.min(width_mm - el.width_mm, el.x_mm + dx)),
                y_mm: Math.max(0, Math.min(height_mm - el.height_mm, el.y_mm + dy)),
              },
              true
            );
          }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedIds,
    template.elements_json,
    width_mm,
    height_mm,
    onDeleteElement,
    onDeleteMultipleElements,
    onUpdateElement,
  ]);

  // Global mouse move & up handlers with Smart Alignment Snapping
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dxPx = e.clientX - dragState.startX;
      const dyPx = e.clientY - dragState.startY;

      // Ignore micro jitters (< 2px)
      if (!dragState.hasMoved && Math.abs(dxPx) < 2 && Math.abs(dyPx) < 2) {
        return;
      }

      dragState.hasMoved = true;
      let rawDxMm = dxPx / mmToPx;
      let rawDyMm = dyPx / mmToPx;

      const otherElements = template.elements_json.filter(
        (el) => !selectedIds.includes(el.id)
      );

      const guides: GuideLine[] = [];

      if (dragState.type === 'move') {
        let targetX = dragState.initialElemX + rawDxMm;
        let targetY = dragState.initialElemY + rawDyMm;
        const targetW = dragState.initialElemW;
        const targetH = dragState.initialElemH;
        const targetCenterX = targetX + targetW / 2;
        const targetCenterY = targetY + targetH / 2;
        const targetRight = targetX + targetW;
        const targetBottom = targetY + targetH;

        // 1. Snap to Label Canvas Center
        const canvasCenterX = width_mm / 2;
        const canvasCenterY = height_mm / 2;

        if (Math.abs(targetCenterX - canvasCenterX) < SNAP_THRESHOLD_MM) {
          targetX = canvasCenterX - targetW / 2;
          guides.push({ type: 'v', pos_mm: canvasCenterX });
        }
        if (Math.abs(targetCenterY - canvasCenterY) < SNAP_THRESHOLD_MM) {
          targetY = canvasCenterY - targetH / 2;
          guides.push({ type: 'h', pos_mm: canvasCenterY });
        }

        // 2. Snap to Other Elements
        for (const other of otherElements) {
          const otherCenterX = other.x_mm + other.width_mm / 2;
          const otherCenterY = other.y_mm + other.height_mm / 2;
          const otherRight = other.x_mm + other.width_mm;
          const otherBottom = other.y_mm + other.height_mm;

          // Vertical alignments (X coordinates)
          // Left to Left
          if (Math.abs(targetX - other.x_mm) < SNAP_THRESHOLD_MM) {
            targetX = other.x_mm;
            guides.push({ type: 'v', pos_mm: other.x_mm });
          }
          // Center to Center
          else if (Math.abs(targetCenterX - otherCenterX) < SNAP_THRESHOLD_MM) {
            targetX = otherCenterX - targetW / 2;
            guides.push({ type: 'v', pos_mm: otherCenterX });
          }
          // Right to Right
          else if (Math.abs(targetRight - otherRight) < SNAP_THRESHOLD_MM) {
            targetX = otherRight - targetW;
            guides.push({ type: 'v', pos_mm: otherRight });
          }
          // Left to Right
          else if (Math.abs(targetX - otherRight) < SNAP_THRESHOLD_MM) {
            targetX = otherRight;
            guides.push({ type: 'v', pos_mm: otherRight });
          }
          // Right to Left
          else if (Math.abs(targetRight - other.x_mm) < SNAP_THRESHOLD_MM) {
            targetX = other.x_mm - targetW;
            guides.push({ type: 'v', pos_mm: other.x_mm });
          }

          // Horizontal alignments (Y coordinates)
          // Top to Top
          if (Math.abs(targetY - other.y_mm) < SNAP_THRESHOLD_MM) {
            targetY = other.y_mm;
            guides.push({ type: 'h', pos_mm: other.y_mm });
          }
          // Middle to Middle
          else if (Math.abs(targetCenterY - otherCenterY) < SNAP_THRESHOLD_MM) {
            targetY = otherCenterY - targetH / 2;
            guides.push({ type: 'h', pos_mm: otherCenterY });
          }
          // Bottom to Bottom
          else if (Math.abs(targetBottom - otherBottom) < SNAP_THRESHOLD_MM) {
            targetY = otherBottom - targetH;
            guides.push({ type: 'h', pos_mm: otherBottom });
          }
          // Top to Bottom
          else if (Math.abs(targetY - otherBottom) < SNAP_THRESHOLD_MM) {
            targetY = otherBottom;
            guides.push({ type: 'h', pos_mm: otherBottom });
          }
          // Bottom to Top
          else if (Math.abs(targetBottom - other.y_mm) < SNAP_THRESHOLD_MM) {
            targetY = other.y_mm - targetH;
            guides.push({ type: 'h', pos_mm: other.y_mm });
          }
        }

        // If no smart guide snapped and snapToGrid is enabled, snap to 1mm
        if (guides.length === 0 && snapToGrid) {
          targetX = Math.round(targetX);
          targetY = Math.round(targetY);
        }

        targetX = Math.max(0, Math.min(width_mm - targetW, targetX));
        targetY = Math.max(0, Math.min(height_mm - targetH, targetY));

        const effectiveDx = targetX - dragState.initialElemX;
        const effectiveDy = targetY - dragState.initialElemY;

        // If multi-selection, move all elements in the group
        if (dragState.initialGroupPositions && dragState.initialGroupPositions.length > 1) {
          dragState.initialGroupPositions.forEach((item) => {
            const el = template.elements_json.find((e) => e.id === item.id);
            if (el) {
              const nx = Math.max(0, Math.min(width_mm - el.width_mm, item.x + effectiveDx));
              const ny = Math.max(0, Math.min(height_mm - el.height_mm, item.y + effectiveDy));
              onUpdateElement(item.id, { x_mm: nx, y_mm: ny }, false);
            }
          });
        } else {
          onUpdateElement(dragState.elementId, { x_mm: targetX, y_mm: targetY }, false);
        }

        setActiveGuides(guides);
      } else if (dragState.type === 'resize' && dragState.handle) {
        let newX = dragState.initialElemX;
        let newY = dragState.initialElemY;
        let newW = dragState.initialElemW;
        let newH = dragState.initialElemH;

        if (dragState.handle.includes('e')) {
          newW = Math.max(3, snapToGrid ? Math.round(dragState.initialElemW + rawDxMm) : dragState.initialElemW + rawDxMm);
        }
        if (dragState.handle.includes('s')) {
          newH = Math.max(2, snapToGrid ? Math.round(dragState.initialElemH + rawDyMm) : dragState.initialElemH + rawDyMm);
        }
        if (dragState.handle.includes('w')) {
          const delta = snapToGrid ? Math.round(rawDxMm) : rawDxMm;
          newW = Math.max(3, dragState.initialElemW - delta);
          newX = dragState.initialElemX + (dragState.initialElemW - newW);
        }
        if (dragState.handle.includes('n')) {
          const delta = snapToGrid ? Math.round(rawDyMm) : rawDyMm;
          newH = Math.max(2, dragState.initialElemH - delta);
          newY = dragState.initialElemY + (dragState.initialElemH - newH);
        }

        onUpdateElement(
          dragState.elementId,
          {
            x_mm: Math.max(0, newX),
            y_mm: Math.max(0, newY),
            width_mm: newW,
            height_mm: newH,
          },
          false
        );
      }
    };

    const handleMouseUp = () => {
      setActiveGuides([]);
      if (dragState.hasMoved) {
        if (onCommitHistory) {
          onCommitHistory();
        }
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    dragState,
    mmToPx,
    width_mm,
    height_mm,
    onUpdateElement,
    onCommitHistory,
    selectedIds,
    template.elements_json,
    snapToGrid,
  ]);

  const handleStartMove = (e: React.MouseEvent, el: LabelElement) => {
    e.stopPropagation();

    const isMultiKey = e.shiftKey || e.ctrlKey || e.metaKey;
    const isAlreadySelected = selectedIds.includes(el.id);

    if (isMultiKey) {
      onSelectElement(el.id, true);
    } else if (!isAlreadySelected) {
      onSelectElement(el.id, false);
    }

    const currentSelectedIds = isMultiKey
      ? isAlreadySelected
        ? selectedIds.filter((id) => id !== el.id)
        : [...selectedIds, el.id]
      : isAlreadySelected
      ? selectedIds
      : [el.id];

    const groupPositions = currentSelectedIds.map((id) => {
      const item = template.elements_json.find((e) => e.id === id);
      return {
        id,
        x: item ? item.x_mm : el.x_mm,
        y: item ? item.y_mm : el.y_mm,
      };
    });

    setDragState({
      type: 'move',
      elementId: el.id,
      startX: e.clientX,
      startY: e.clientY,
      initialElemX: el.x_mm,
      initialElemY: el.y_mm,
      initialElemW: el.width_mm,
      initialElemH: el.height_mm,
      hasMoved: false,
      initialGroupPositions: groupPositions,
    });
  };

  const handleStartResize = (
    e: React.MouseEvent,
    el: LabelElement,
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w'
  ) => {
    e.stopPropagation();
    setDragState({
      type: 'resize',
      handle,
      elementId: el.id,
      startX: e.clientX,
      startY: e.clientY,
      initialElemX: el.x_mm,
      initialElemY: el.y_mm,
      initialElemW: el.width_mm,
      initialElemH: el.height_mm,
      hasMoved: false,
    });
  };

  // Render individual element
  const renderElement = (el: LabelElement) => {
    const isSelected = selectedIds.includes(el.id);
    const p = el.props;

    const left = el.x_mm * mmToPx;
    const top = el.y_mm * mmToPx;
    const width = el.width_mm * mmToPx;
    const height = el.height_mm * mmToPx;

    return (
      <div
        key={el.id}
        onMouseDown={(e) => handleStartMove(e, el)}
        onClick={(e) => {
          e.stopPropagation();
          onSelectElement(el.id, e.shiftKey || e.ctrlKey || e.metaKey);
        }}
        style={{
          position: 'absolute',
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
          zIndex: el.zIndex || 1,
          cursor: isSelected ? 'move' : 'pointer',
        }}
        className={`group select-none ${
          isSelected
            ? 'ring-2 ring-blue-600 shadow-xs'
            : 'hover:ring-1 hover:ring-blue-300'
        }`}
      >
        {/* Content according to type */}
        <div className="w-full h-full relative overflow-hidden pointer-events-none">
          {el.type === 'text' && (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  p.textAlign === 'center'
                    ? 'center'
                    : p.textAlign === 'right'
                    ? 'flex-end'
                    : 'flex-start',
                fontFamily: p.fontFamily || 'Inter',
                fontSize: `${(p.fontSize || 10) * zoomScale}pt`,
                fontWeight: p.fontWeight || 'normal',
                color: p.color || '#18181b',
                textTransform: p.uppercase ? 'uppercase' : 'none',
                whiteSpace: p.multiline ? 'normal' : 'nowrap',
                lineHeight: 1.15,
                wordBreak: 'break-word',
              }}
            >
              {p.text || 'Texto'}
            </div>
          )}

          {el.type === 'badge' && (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  p.variant === 'black'
                    ? '#18181b'
                    : p.variant === 'gray'
                    ? '#e4e4e7'
                    : 'transparent',
                color: p.variant === 'black' ? '#ffffff' : '#18181b',
                border:
                  p.variant === 'black'
                    ? 'none'
                    : p.variant === 'gray'
                    ? 'none'
                    : `${1.5 * zoomScale}px solid #18181b`,
                borderRadius: `${(p.borderRadius || 2) * mmToPx}px`,
                fontSize: `${(p.fontSize || 9) * zoomScale}pt`,
                fontWeight: p.fontWeight || 'bold',
                textTransform: p.uppercase ? 'uppercase' : 'none',
                letterSpacing: '0.5px',
              }}
            >
              {p.text || 'STATUS'}
            </div>
          )}

          {el.type === 'box' && (
            <div
              style={{
                width: '100%',
                height: '100%',
                border: `${Math.max(1, (p.borderWidth || 0.6) * mmToPx)}px ${
                  p.borderStyle || 'solid'
                } ${p.borderColor || '#18181b'}`,
                backgroundColor:
                  p.backgroundColor && p.backgroundColor !== 'transparent'
                    ? p.backgroundColor
                    : 'transparent',
                borderRadius: `${(p.borderRadius || 0) * mmToPx}px`,
                boxSizing: 'border-box',
              }}
            />
          )}

          {el.type === 'line' && (
            <div
              style={{
                width: '100%',
                height: '100%',
                borderLeft:
                  p.orientation === 'vertical'
                    ? `${Math.max(1, (p.strokeWidth || 0.6) * mmToPx)}px ${
                        p.strokeStyle || 'solid'
                      } ${p.strokeColor || '#18181b'}`
                    : 'none',
                borderTop:
                  p.orientation !== 'vertical'
                    ? `${Math.max(1, (p.strokeWidth || 0.6) * mmToPx)}px ${
                        p.strokeStyle || 'solid'
                      } ${p.strokeColor || '#18181b'}`
                    : 'none',
              }}
            />
          )}

          {el.type === 'barcode' && (
            <div className="w-full h-full flex flex-col justify-between overflow-hidden">
              {(() => {
                const res = generateBarcodeBars(p.value || '123456', p.format || 'code128');
                return (
                  <>
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={{ width: '100%', height: p.showText ? '76%' : '100%' }}
                    >
                      {res.bars.map((b, i) => (
                        <rect
                          key={i}
                          x={`${(b.x / res.totalModules) * 100}%`}
                          y="0"
                          width={`${(b.width / res.totalModules) * 100}%`}
                          height="100%"
                          fill="#18181b"
                        />
                      ))}
                    </svg>
                    {p.showText && (
                      <div
                        style={{
                          height: '24%',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: `${(p.fontSize || 7.5) * zoomScale}pt`,
                          fontWeight: 'bold',
                          textAlign: 'center',
                          color: '#18181b',
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          letterSpacing: '1px',
                        }}
                      >
                        {res.displayText}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {el.type === 'qrcode' && (
            <div className="w-full h-full flex items-center justify-center">
              {(() => {
                const matrix = generateQrMatrix(p.value || 'https://natumbiocosmeticos.com.br');
                const n = matrix.length;
                return (
                  <svg viewBox={`0 0 ${n} ${n}`} className="w-full h-full">
                    {matrix.map((row, r) =>
                      row.map((val, c) =>
                        val ? (
                          <rect key={`${r}-${c}`} x={c} y={r} width="1.02" height="1.02" fill="#18181b" />
                        ) : null
                      )
                    )}
                  </svg>
                );
              })()}
            </div>
          )}

          {el.type === 'image' && (
            <img
              src={p.src}
              alt="Logo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: p.fit || 'contain',
                opacity: p.opacity ?? 1,
              }}
            />
          )}
        </div>

        {/* Selection overlay handles (displayed on the active single element or primary selected) */}
        {isSelected && selectedIds.length === 1 && (
          <>
            {/* Dimensions badge */}
            <div className="absolute -top-6 left-0 bg-zinc-900 text-white text-[10px] font-mono px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap z-50 pointer-events-none">
              {el.x_mm.toFixed(1)} x {el.y_mm.toFixed(1)} mm ({el.width_mm.toFixed(1)} x {el.height_mm.toFixed(1)}mm)
            </div>

            {/* Corner Resize Handles */}
            <div
              onMouseDown={(e) => handleStartResize(e, el, 'nw')}
              onClick={(e) => e.stopPropagation()}
              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-nwse-resize z-30"
            />
            <div
              onMouseDown={(e) => handleStartResize(e, el, 'ne')}
              onClick={(e) => e.stopPropagation()}
              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-nesw-resize z-30"
            />
            <div
              onMouseDown={(e) => handleStartResize(e, el, 'se')}
              onClick={(e) => e.stopPropagation()}
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-nwse-resize z-30"
            />
            <div
              onMouseDown={(e) => handleStartResize(e, el, 'sw')}
              onClick={(e) => e.stopPropagation()}
              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-nesw-resize z-30"
            />

            {/* Side Resize Handles */}
            <div
              onMouseDown={(e) => handleStartResize(e, el, 'e')}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-2.5 h-4 bg-white border-2 border-blue-600 rounded-xs cursor-ew-resize z-30"
            />
            <div
              onMouseDown={(e) => handleStartResize(e, el, 's')}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-4 h-2.5 bg-white border-2 border-blue-600 rounded-xs cursor-ns-resize z-30"
            />
          </>
        )}
      </div>
    );
  };

  // Build mm rulers
  const rulerStepMm = 10;
  const hMarkersCount = Math.floor(width_mm / rulerStepMm);
  const vMarkersCount = Math.floor(height_mm / rulerStepMm);

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => {
        if (e.target === containerRef.current) {
          onSelectElement(null);
        }
      }}
      className="flex-1 flex items-center justify-center p-8 bg-zinc-200/70 overflow-auto relative select-none"
    >
      <div className="flex flex-col items-start shadow-xl rounded-lg bg-zinc-300 p-6 border border-zinc-400/40">
        {/* Horizontal Top Ruler */}
        <div
          style={{ width: `${canvasWidthPx}px`, height: '22px' }}
          className="ml-6 flex relative border-b border-zinc-400 bg-zinc-100 text-[9px] font-mono text-zinc-500 rounded-t"
        >
          {Array.from({ length: hMarkersCount + 1 }).map((_, i) => {
            const mm = i * rulerStepMm;
            const left = mm * mmToPx;
            if (left > canvasWidthPx) return null;
            return (
              <div
                key={i}
                style={{ left: `${left}px` }}
                className="absolute top-0 h-full flex flex-col justify-end items-start pl-0.5 border-l border-zinc-300"
              >
                <span className="leading-none pb-0.5">{mm}</span>
              </div>
            );
          })}
        </div>

        <div className="flex">
          {/* Vertical Left Ruler */}
          <div
            style={{ height: `${canvasHeightPx}px`, width: '24px' }}
            className="flex flex-col relative border-r border-zinc-400 bg-zinc-100 text-[9px] font-mono text-zinc-500 rounded-l"
          >
            {Array.from({ length: vMarkersCount + 1 }).map((_, i) => {
              const mm = i * rulerStepMm;
              const top = mm * mmToPx;
              if (top > canvasHeightPx) return null;
              return (
                <div
                  key={i}
                  style={{ top: `${top}px` }}
                  className="absolute left-0 w-full flex items-start pt-0.5 pl-1 border-t border-zinc-300"
                >
                  <span className="leading-none">{mm}</span>
                </div>
              );
            })}
          </div>

          {/* White Thermal Label Canvas */}
          <div
            ref={canvasRef}
            onClick={(e) => {
              if (e.target === canvasRef.current) {
                onSelectElement(null);
              }
            }}
            style={{
              width: `${canvasWidthPx}px`,
              height: `${canvasHeightPx}px`,
              backgroundColor: '#ffffff',
              backgroundImage: showGrid
                ? `linear-gradient(to right, #f4f4f5 1px, transparent 1px), linear-gradient(to bottom, #f4f4f5 1px, transparent 1px)`
                : 'none',
              backgroundSize: `${10 * mmToPx}px ${10 * mmToPx}px`,
            }}
            className="relative border border-zinc-400 shadow-inner overflow-hidden cursor-crosshair"
          >
            {/* Render all elements */}
            {template.elements_json.map(renderElement)}

            {/* Smart Alignment Snap Guides */}
            {activeGuides.map((guide, idx) => {
              if (guide.type === 'v') {
                return (
                  <div
                    key={`v_${idx}`}
                    style={{
                      position: 'absolute',
                      left: `${guide.pos_mm * mmToPx}px`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      borderLeft: '1px dashed #0284c7',
                      zIndex: 999,
                      pointerEvents: 'none',
                    }}
                  />
                );
              } else {
                return (
                  <div
                    key={`h_${idx}`}
                    style={{
                      position: 'absolute',
                      top: `${guide.pos_mm * mmToPx}px`,
                      left: 0,
                      right: 0,
                      height: '1px',
                      borderTop: '1px dashed #0284c7',
                      zIndex: 999,
                      pointerEvents: 'none',
                    }}
                  />
                );
              }
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
