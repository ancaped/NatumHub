import React, { useRef } from 'react';
import {
  Type,
  Heading,
  Barcode,
  QrCode,
  Square,
  Minus,
  Tag,
  Upload,
  Layers,
  Sparkles,
  Search,
  BookOpen,
  Rows,
  LayoutGrid,
  AlignLeft,
} from 'lucide-react';
import type { ElementType, LabelElement } from '../lib/types';

interface ToolbarElementsProps {
  onAddElement: (newElement: LabelElement) => void;
  onAddMultipleElements?: (newElements: LabelElement[]) => void;
  onOpenProductSearch: () => void;
  onOpenTemplatesModal: () => void;
  onOpenSystemVariablesModal?: () => void;
}

export default function ToolbarElements({
  onAddElement,
  onAddMultipleElements,
  onOpenProductSearch,
  onOpenTemplatesModal,
  onOpenSystemVariablesModal,
}: ToolbarElementsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createId = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const addText = (presetType: 'simple' | 'heading' | 'lote' | 'val' | 'sku') => {
    let text = 'Novo Texto';
    let fontSize = 9;
    let fontWeight: any = 'normal';
    let width_mm = 40;
    let height_mm = 5;

    if (presetType === 'heading') {
      text = 'NOME DO PRODUTO';
      fontSize = 11;
      fontWeight = '800';
      width_mm = 60;
      height_mm = 8;
    } else if (presetType === 'lote') {
      text = 'LOTE: 2026-0801';
      fontSize = 8;
      fontWeight = 'bold';
      width_mm = 35;
      height_mm = 5;
    } else if (presetType === 'val') {
      text = 'VAL: 10/08/2028';
      fontSize = 8;
      fontWeight = 'bold';
      width_mm = 30;
      height_mm = 5;
    } else if (presetType === 'sku') {
      text = 'CÓDIGO: MP-00123';
      fontSize = 8;
      fontWeight = '600';
      width_mm = 35;
      height_mm = 5;
    }

    const newEl: LabelElement = {
      id: createId('txt'),
      type: 'text',
      x_mm: 5,
      y_mm: 10,
      width_mm,
      height_mm,
      zIndex: 10,
      props: {
        text,
        fontSize,
        fontWeight,
        fontFamily: 'Inter',
        textAlign: 'left',
        color: '#18181b',
        uppercase: presetType !== 'simple',
      },
    };
    onAddElement(newEl);
  };

  const addBarcode = (format: 'code128' | 'ean13') => {
    const newEl: LabelElement = {
      id: createId('bar'),
      type: 'barcode',
      x_mm: 10,
      y_mm: 20,
      width_mm: 50,
      height_mm: 15,
      zIndex: 10,
      props: {
        value: format === 'ean13' ? '7898912345678' : 'MP00128',
        format,
        showText: true,
        fontSize: 7.5,
      },
    };
    onAddElement(newEl);
  };

  const addQrCode = () => {
    const newEl: LabelElement = {
      id: createId('qr'),
      type: 'qrcode',
      x_mm: 70,
      y_mm: 10,
      width_mm: 22,
      height_mm: 22,
      zIndex: 10,
      props: {
        value: 'https://natumbiocosmeticos.com.br',
        errorCorrectionLevel: 'M',
      },
    };
    onAddElement(newEl);
  };

  const addBadge = (text: string, variant: 'black' | 'outline' | 'gray') => {
    const newEl: LabelElement = {
      id: createId('bdg'),
      type: 'badge',
      x_mm: 10,
      y_mm: 5,
      width_mm: 35,
      height_mm: 6,
      zIndex: 10,
      props: {
        text,
        variant,
        fontSize: 8.5,
        fontWeight: 'bold',
        uppercase: true,
        borderRadius: 1.5,
      },
    };
    onAddElement(newEl);
  };

  const addBox = () => {
    const newEl: LabelElement = {
      id: createId('box'),
      type: 'box',
      x_mm: 2,
      y_mm: 2,
      width_mm: 96,
      height_mm: 46,
      zIndex: 1,
      props: {
        borderWidth: 0.6,
        borderColor: '#18181b',
        backgroundColor: 'transparent',
        borderRadius: 2,
        borderStyle: 'solid',
      },
    };
    onAddElement(newEl);
  };

  const addLine = (orientation: 'horizontal' | 'vertical') => {
    const newEl: LabelElement = {
      id: createId('line'),
      type: 'line',
      x_mm: 5,
      y_mm: 15,
      width_mm: orientation === 'horizontal' ? 90 : 0.5,
      height_mm: orientation === 'horizontal' ? 0.5 : 30,
      zIndex: 2,
      props: {
        orientation,
        strokeWidth: 0.4,
        strokeColor: '#18181b',
        strokeStyle: 'solid',
      },
    };
    onAddElement(newEl);
  };

  // --- Auto-Aligned Composite Blocks ---
  const addAlignedBlock = (type: 'lote_val' | 'tech_stack' | 'qr_stack' | 'box_header') => {
    const addBatch = onAddMultipleElements || ((items: LabelElement[]) => items.forEach(onAddElement));

    if (type === 'lote_val') {
      const el1: LabelElement = {
        id: createId('txt'),
        type: 'text',
        x_mm: 5,
        y_mm: 20,
        width_mm: 42,
        height_mm: 5,
        zIndex: 10,
        props: { text: 'LOTE: 2026-0801', fontSize: 8, fontWeight: 'bold', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
      };
      const el2: LabelElement = {
        id: createId('txt'),
        type: 'text',
        x_mm: 5,
        y_mm: 26,
        width_mm: 42,
        height_mm: 5,
        zIndex: 10,
        props: { text: 'VAL: 10/08/2028', fontSize: 8, fontWeight: 'bold', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
      };
      addBatch([el1, el2]);
    } else if (type === 'tech_stack') {
      const items: LabelElement[] = [
        {
          id: createId('txt'),
          type: 'text',
          x_mm: 5,
          y_mm: 16,
          width_mm: 45,
          height_mm: 4.5,
          zIndex: 10,
          props: { text: 'LOTE: 2026-0801', fontSize: 7.5, fontWeight: 'bold', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
        },
        {
          id: createId('txt'),
          type: 'text',
          x_mm: 5,
          y_mm: 21,
          width_mm: 45,
          height_mm: 4.5,
          zIndex: 10,
          props: { text: 'FAB: 10/08/2026', fontSize: 7.5, fontWeight: 'bold', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
        },
        {
          id: createId('txt'),
          type: 'text',
          x_mm: 5,
          y_mm: 26,
          width_mm: 45,
          height_mm: 4.5,
          zIndex: 10,
          props: { text: 'VAL: 10/08/2028', fontSize: 7.5, fontWeight: 'bold', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
        },
        {
          id: createId('txt'),
          type: 'text',
          x_mm: 5,
          y_mm: 31,
          width_mm: 45,
          height_mm: 4.5,
          zIndex: 10,
          props: { text: 'CÓD: MP-00128', fontSize: 7.5, fontWeight: '600', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
        },
      ];
      addBatch(items);
    } else if (type === 'qr_stack') {
      const items: LabelElement[] = [
        {
          id: createId('txt'),
          type: 'text',
          x_mm: 5,
          y_mm: 8,
          width_mm: 58,
          height_mm: 7,
          zIndex: 10,
          props: { text: 'NOME DO PRODUTO', fontSize: 10, fontWeight: '800', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
        },
        {
          id: createId('txt'),
          type: 'text',
          x_mm: 5,
          y_mm: 17,
          width_mm: 40,
          height_mm: 5,
          zIndex: 10,
          props: { text: 'LOTE: 2026-0801', fontSize: 8, fontWeight: 'bold', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
        },
        {
          id: createId('txt'),
          type: 'text',
          x_mm: 5,
          y_mm: 23,
          width_mm: 40,
          height_mm: 5,
          zIndex: 10,
          props: { text: 'VAL: 10/08/2028', fontSize: 8, fontWeight: 'bold', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
        },
        {
          id: createId('qr'),
          type: 'qrcode',
          x_mm: 68,
          y_mm: 6,
          width_mm: 26,
          height_mm: 26,
          zIndex: 10,
          props: { value: 'https://natumbiocosmeticos.com.br', errorCorrectionLevel: 'M' },
        },
      ];
      addBatch(items);
    } else if (type === 'box_header') {
      const items: LabelElement[] = [
        {
          id: createId('box'),
          type: 'box',
          x_mm: 2,
          y_mm: 2,
          width_mm: 96,
          height_mm: 46,
          zIndex: 1,
          props: { borderWidth: 0.6, borderColor: '#18181b', backgroundColor: 'transparent', borderRadius: 2, borderStyle: 'solid' },
        },
        {
          id: createId('line'),
          type: 'line',
          x_mm: 2,
          y_mm: 12,
          width_mm: 96,
          height_mm: 0.5,
          zIndex: 2,
          props: { orientation: 'horizontal', strokeWidth: 0.5, strokeColor: '#18181b', strokeStyle: 'solid' },
        },
        {
          id: createId('txt'),
          type: 'text',
          x_mm: 5,
          y_mm: 4,
          width_mm: 55,
          height_mm: 6,
          zIndex: 10,
          props: { text: 'NÁTUM BIO COSMÉTICOS', fontSize: 9, fontWeight: '800', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
        },
        {
          id: createId('bdg'),
          type: 'badge',
          x_mm: 65,
          y_mm: 4,
          width_mm: 30,
          height_mm: 5.5,
          zIndex: 10,
          props: { text: 'MATÉRIA-PRIMA', variant: 'black', fontSize: 8, fontWeight: 'bold', uppercase: true, borderRadius: 1 },
        },
      ];
      addBatch(items);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (!src) return;

      const newEl: LabelElement = {
        id: createId('img'),
        type: 'image',
        x_mm: 5,
        y_mm: 5,
        width_mm: 20,
        height_mm: 12,
        zIndex: 5,
        props: {
          src,
          fit: 'contain',
        },
      };
      onAddElement(newEl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="w-64 border-r border-zinc-200 bg-white flex flex-col h-full overflow-y-auto select-none">
      {/* Search & System Variables Top Actions */}
      <div className="p-3 border-b border-zinc-100 bg-zinc-50/50 space-y-2">
        {onOpenSystemVariablesModal && (
          <button
            type="button"
            onClick={onOpenSystemVariablesModal}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-xs active:scale-98"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Biblioteca de Dados</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenProductSearch}
          className="w-full flex items-center justify-center gap-2 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-800 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer shadow-2xs"
        >
          <Search className="h-3.5 w-3.5 text-blue-600" />
          <span>Buscar do Catálogo</span>
        </button>

        <button
          type="button"
          onClick={onOpenTemplatesModal}
          className="w-full flex items-center justify-center gap-2 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Modelos Prontos</span>
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* System Dynamic Data Blocks */}
        <div>
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block mb-2 px-1 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Dados Dinâmicos do Sistema
          </span>
          <div className="space-y-1.5">
            <button
              onClick={() => {
                const addBatch = onAddMultipleElements || ((items: LabelElement[]) => items.forEach(onAddElement));
                addBatch([
                  {
                    id: createId('txt_code'),
                    type: 'text',
                    x_mm: 5,
                    y_mm: 5,
                    width_mm: 40,
                    height_mm: 5,
                    zIndex: 10,
                    props: { text: 'CÓD: {product_code}', fontSize: 8.5, fontWeight: 'bold', fontFamily: 'JetBrains Mono', textAlign: 'left', color: '#18181b', uppercase: true },
                  },
                  {
                    id: createId('txt_name'),
                    type: 'text',
                    x_mm: 5,
                    y_mm: 11,
                    width_mm: 90,
                    height_mm: 8,
                    zIndex: 10,
                    props: { text: '{product_name}', fontSize: 11, fontWeight: '800', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
                  },
                ]);
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-100/60 text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <span className="font-semibold text-[11px]">🏷️ Cód + Nome do Produto</span>
              <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1 py-0.5 rounded font-mono">2 lin.</span>
            </button>

            <button
              onClick={() => {
                const addBatch = onAddMultipleElements || ((items: LabelElement[]) => items.forEach(onAddElement));
                addBatch([
                  {
                    id: createId('txt_lot'),
                    type: 'text',
                    x_mm: 5,
                    y_mm: 20,
                    width_mm: 40,
                    height_mm: 4.5,
                    zIndex: 10,
                    props: { text: 'LOTE: {lot}', fontSize: 8, fontWeight: 'bold', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
                  },
                  {
                    id: createId('txt_fab'),
                    type: 'text',
                    x_mm: 5,
                    y_mm: 25,
                    width_mm: 40,
                    height_mm: 4.5,
                    zIndex: 10,
                    props: { text: 'FAB: {manufacturing_date}', fontSize: 7.5, fontWeight: 'normal', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
                  },
                  {
                    id: createId('txt_val'),
                    type: 'text',
                    x_mm: 5,
                    y_mm: 30,
                    width_mm: 40,
                    height_mm: 4.5,
                    zIndex: 10,
                    props: { text: 'VAL: {expiry_date}', fontSize: 8, fontWeight: 'bold', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
                  },
                ]);
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-100/60 text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <span className="font-semibold text-[11px]">📅 Lote + Fab + Validade</span>
              <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1 py-0.5 rounded font-mono">3 lin.</span>
            </button>

            <button
              onClick={() => {
                onAddElement({
                  id: createId('txt_seq'),
                  type: 'text',
                  x_mm: 5,
                  y_mm: 40,
                  width_mm: 50,
                  height_mm: 6,
                  zIndex: 10,
                  props: { text: '{box_sequence} ({box_qty})', fontSize: 9, fontWeight: '800', fontFamily: 'Inter', textAlign: 'left', color: '#18181b', uppercase: true },
                });
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <span className="font-semibold text-[11px]">📦 Caixa {`{seq}`} de {`{total}`}</span>
              <span className="text-[9px] bg-zinc-100 text-zinc-600 px-1 py-0.5 rounded font-mono">1 lin.</span>
            </button>

            <button
              onClick={() => {
                onAddElement({
                  id: createId('bar_ean'),
                  type: 'barcode',
                  x_mm: 10,
                  y_mm: 20,
                  width_mm: 50,
                  height_mm: 15,
                  zIndex: 10,
                  props: { value: '{barcode}', format: 'ean13', showText: true, fontSize: 7.5 },
                });
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <span className="font-semibold text-[11px]">||| Código EAN-13 do Item</span>
              <span className="text-[9px] bg-zinc-100 text-zinc-600 px-1 py-0.5 rounded font-mono">EAN</span>
            </button>

            <button
              onClick={() => {
                onAddElement({
                  id: createId('bar_dun'),
                  type: 'barcode',
                  x_mm: 10,
                  y_mm: 20,
                  width_mm: 60,
                  height_mm: 15,
                  zIndex: 10,
                  props: { value: '{box_barcode}', format: 'code128', showText: true, fontSize: 7.5 },
                });
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <span className="font-semibold text-[11px]">||| Código DUN-14 da Caixa</span>
              <span className="text-[9px] bg-zinc-100 text-zinc-600 px-1 py-0.5 rounded font-mono">DUN</span>
            </button>
          </div>
        </div>
        {/* Auto-Aligned Composite Blocks */}
        <div>
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-2 px-1 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Blocos Auto-Alinhados
          </span>
          <div className="space-y-1.5">
            <button
              onClick={() => addAlignedBlock('lote_val')}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-blue-100 bg-blue-50/40 hover:bg-blue-100/60 text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Rows className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="font-semibold text-[11px]">Lote + Validade (Empilhados)</span>
              </div>
              <span className="text-[9px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded font-mono">2 lin.</span>
            </button>

            <button
              onClick={() => addAlignedBlock('tech_stack')}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <AlignLeft className="h-4 w-4 text-zinc-600 shrink-0" />
                <span className="font-semibold text-[11px]">Grade Técnica (4 Linhas)</span>
              </div>
              <span className="text-[9px] bg-zinc-100 text-zinc-600 px-1 py-0.5 rounded font-mono">4 lin.</span>
            </button>

            <button
              onClick={() => addAlignedBlock('qr_stack')}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-zinc-600 shrink-0" />
                <span className="font-semibold text-[11px]">Texto + QR Code Alinhados</span>
              </div>
            </button>

            <button
              onClick={() => addAlignedBlock('box_header')}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-zinc-600 shrink-0" />
                <span className="font-semibold text-[11px]">Borda + Topo com Badge</span>
              </div>
            </button>
          </div>
        </div>

        {/* Basic Elements */}
        <div>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2 px-1">
            Elementos Individuais
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => addText('simple')}
              className="flex items-center gap-2 p-2 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-left text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <Type className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="truncate">Texto</span>
            </button>

            <button
              onClick={() => addText('heading')}
              className="flex items-center gap-2 p-2 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-left text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <Heading className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="truncate">Título</span>
            </button>

            <button
              onClick={() => addBarcode('code128')}
              className="flex items-center gap-2 p-2 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-left text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <Barcode className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="truncate">Cód. Barras</span>
            </button>

            <button
              onClick={() => addQrCode()}
              className="flex items-center gap-2 p-2 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-left text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <QrCode className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="truncate">QR Code</span>
            </button>

            <button
              onClick={() => addBox()}
              className="flex items-center gap-2 p-2 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-left text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <Square className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="truncate">Borda / Caixa</span>
            </button>

            <button
              onClick={() => addLine('horizontal')}
              className="flex items-center gap-2 p-2 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-left text-xs text-zinc-800 transition-colors cursor-pointer"
            >
              <Minus className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="truncate">Linha Divisória</span>
            </button>
          </div>
        </div>

        {/* Quick Industry Tags */}
        <div>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2 px-1">
            Campos Rápidos
          </span>
          <div className="space-y-1.5">
            <button
              onClick={() => addText('lote')}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-xs text-zinc-700 transition-colors cursor-pointer"
            >
              <span className="font-semibold">Lote de Fabricação</span>
              <span className="text-[10px] font-mono bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">
                LOTE:
              </span>
            </button>

            <button
              onClick={() => addText('val')}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-xs text-zinc-700 transition-colors cursor-pointer"
            >
              <span className="font-semibold">Data de Validade</span>
              <span className="text-[10px] font-mono bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">
                VAL:
              </span>
            </button>

            <button
              onClick={() => addText('sku')}
              className="w-full flex items-center justify-between p-2 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-xs text-zinc-700 transition-colors cursor-pointer"
            >
              <span className="font-semibold">Código SKU / Item</span>
              <span className="text-[10px] font-mono bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">
                CÓD:
              </span>
            </button>
          </div>
        </div>

        {/* Badges and Status */}
        <div>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2 px-1">
            Badges de Status
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => addBadge('MATÉRIA-PRIMA', 'black')}
              className="p-1.5 bg-zinc-900 text-white font-bold text-[10px] rounded-md hover:bg-zinc-800 text-center cursor-pointer truncate"
            >
              MATÉRIA-PRIMA
            </button>

            <button
              onClick={() => addBadge('EMBALAGEM', 'black')}
              className="p-1.5 bg-zinc-900 text-white font-bold text-[10px] rounded-md hover:bg-zinc-800 text-center cursor-pointer truncate"
            >
              EMBALAGEM
            </button>

            <button
              onClick={() => addBadge('APROVADO CQ', 'black')}
              className="p-1.5 bg-zinc-900 text-white font-bold text-[10px] rounded-md hover:bg-zinc-800 text-center cursor-pointer truncate"
            >
              APROVADO CQ
            </button>

            <button
              onClick={() => addBadge('QUARENTENA', 'outline')}
              className="p-1.5 bg-white border border-zinc-900 text-zinc-900 font-bold text-[10px] rounded-md hover:bg-zinc-100 text-center cursor-pointer truncate"
            >
              QUARENTENA
            </button>
          </div>
        </div>

        {/* Image / Logo Upload */}
        <div>
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2 px-1">
            Logotipo / Imagem
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed border-zinc-300 hover:border-zinc-500 hover:bg-zinc-50 text-xs text-zinc-700 transition-colors cursor-pointer"
          >
            <Upload className="h-4 w-4 text-zinc-500" />
            <span>Inserir Logo / Imagem</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}
