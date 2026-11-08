import React, { useRef, useState } from 'react';
import {
  Type,
  Heading,
  Barcode,
  QrCode,
  Square,
  Minus,
  Upload,
  Search,
  BookOpen,
  Database,
  Package,
  ChevronDown,
  ChevronRight,
  Rows,
  LayoutGrid,
  AlignLeft,
  Tag,
  Calendar,
  Hash,
  Box,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LabelElement } from '../lib/types';

interface ToolbarElementsProps {
  onAddElement: (newElement: LabelElement) => void;
  onAddMultipleElements?: (newElements: LabelElement[]) => void;
  onOpenProductSearch: () => void;
  onOpenTemplatesModal: () => void;
  onOpenSystemVariablesModal?: () => void;
}

interface Item {
  label: string;
  icon: LucideIcon;
  hint?: string;
  onClick: () => void;
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

  // --- Dados dinâmicos do sistema ---
  const addCodigoNome = () => {
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
  };

  const addLoteFabValidade = () => {
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
  };

  const addCaixaSeqTotal = () => {
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
  };

  const addEan13Item = () => {
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
  };

  const addDun14Caixa = () => {
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
  };

  // --- Estado local da paleta ---
  const [busca, setBusca] = useState('');
  const [abertas, setAbertas] = useState<Record<string, boolean>>({
    elementos: true,
    dados: true,
    blocos: false,
    rapidos: false,
    selos: false,
  });

  const elementos: Item[] = [
    { label: 'Texto', icon: Type, onClick: () => addText('simple') },
    { label: 'Título', icon: Heading, onClick: () => addText('heading') },
    { label: 'Cód. barras', icon: Barcode, onClick: () => addBarcode('code128') },
    { label: 'QR Code', icon: QrCode, onClick: () => addQrCode() },
    { label: 'Borda', icon: Square, onClick: () => addBox() },
    { label: 'Linha', icon: Minus, onClick: () => addLine('horizontal') },
    { label: 'Imagem', icon: Upload, onClick: () => fileInputRef.current?.click() },
  ];

  const dados: Item[] = [
    { label: 'Cód + Nome do produto', icon: Tag, hint: '2 lin.', onClick: addCodigoNome },
    { label: 'Lote + Fab + Validade', icon: Calendar, hint: '3 lin.', onClick: addLoteFabValidade },
    { label: 'Caixa {seq} de {total}', icon: Box, hint: '1 lin.', onClick: addCaixaSeqTotal },
    { label: 'Código EAN-13 do item', icon: Barcode, hint: 'EAN', onClick: addEan13Item },
    { label: 'Código DUN-14 da caixa', icon: Barcode, hint: 'DUN', onClick: addDun14Caixa },
  ];

  const blocos: Item[] = [
    { label: 'Lote + Validade', icon: Rows, hint: '2 lin.', onClick: () => addAlignedBlock('lote_val') },
    { label: 'Grade técnica', icon: AlignLeft, hint: '4 lin.', onClick: () => addAlignedBlock('tech_stack') },
    { label: 'Texto + QR Code', icon: QrCode, onClick: () => addAlignedBlock('qr_stack') },
    { label: 'Borda + topo com selo', icon: LayoutGrid, onClick: () => addAlignedBlock('box_header') },
  ];

  const rapidos: Item[] = [
    { label: 'Lote', icon: Hash, hint: 'LOTE:', onClick: () => addText('lote') },
    { label: 'Validade', icon: Calendar, hint: 'VAL:', onClick: () => addText('val') },
    { label: 'SKU', icon: Tag, hint: 'CÓD:', onClick: () => addText('sku') },
  ];

  const selos: Item[] = [
    { label: 'MATÉRIA-PRIMA', icon: Tag, onClick: () => addBadge('MATÉRIA-PRIMA', 'black') },
    { label: 'EMBALAGEM', icon: Tag, onClick: () => addBadge('EMBALAGEM', 'black') },
    { label: 'APROVADO CQ', icon: Tag, onClick: () => addBadge('APROVADO CQ', 'black') },
    { label: 'QUARENTENA', icon: Tag, onClick: () => addBadge('QUARENTENA', 'outline') },
  ];

  const termo = busca.trim().toLowerCase();
  const filtrar = (itens: Item[]) =>
    termo ? itens.filter((i) => i.label.toLowerCase().includes(termo)) : itens;

  const secoes: { key: string; titulo: string; itens: Item[]; grade?: boolean }[] = [
    { key: 'elementos', titulo: 'Elementos', itens: filtrar(elementos), grade: true },
    { key: 'dados', titulo: 'Dados do sistema', itens: filtrar(dados) },
    { key: 'blocos', titulo: 'Blocos prontos', itens: filtrar(blocos) },
    { key: 'rapidos', titulo: 'Campos rápidos', itens: filtrar(rapidos) },
    { key: 'selos', titulo: 'Selos', itens: filtrar(selos) },
  ];

  const botaoTopo =
    'flex-1 h-11 lg:h-8 flex items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default';

  return (
    <div className="w-full lg:w-60 lg:border-r border-zinc-200 bg-white flex flex-col h-full overflow-y-auto select-none">
      <div className="p-3 space-y-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onOpenSystemVariablesModal}
            disabled={!onOpenSystemVariablesModal}
            className={botaoTopo}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Dados</span>
          </button>
          <button type="button" onClick={onOpenProductSearch} className={botaoTopo}>
            <Package className="h-3.5 w-3.5" />
            <span>Catálogo</span>
          </button>
          <button type="button" onClick={onOpenTemplatesModal} className={botaoTopo}>
            <BookOpen className="h-3.5 w-3.5" />
            <span>Modelos</span>
          </button>
        </div>

        <div className="relative">
          <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar elemento…"
            className="w-full h-11 lg:h-8 pl-8 pr-2 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
          />
        </div>
      </div>

      <div className="px-3 pb-4 space-y-3">
        {secoes.map((s) => {
          if (termo && s.itens.length === 0) return null;
          const aberta = termo ? true : abertas[s.key];
          return (
            <div key={s.key}>
              <button
                type="button"
                onClick={() => setAbertas((a) => ({ ...a, [s.key]: !a[s.key] }))}
                className="w-full flex items-center justify-between px-1 py-1 text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-800 cursor-pointer"
              >
                <span>{s.titulo}</span>
                {aberta ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {aberta &&
                (s.grade ? (
                  <div className="grid grid-cols-3 gap-1.5 mt-1">
                    {s.itens.map((i) => (
                      <button
                        key={i.label}
                        type="button"
                        onClick={i.onClick}
                        className="h-20 lg:h-16 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors cursor-pointer"
                      >
                        <i.icon className="h-4 w-4 text-zinc-500" />
                        <span>{i.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1">
                    {s.itens.map((i) => (
                      <button
                        key={i.label}
                        type="button"
                        onClick={i.onClick}
                        className="w-full h-11 lg:h-8 flex items-center justify-between gap-2 px-2 rounded-md text-xs text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
                      >
                        <span className="truncate text-left">{i.label}</span>
                        {i.hint && <span className="text-[10px] text-zinc-400 shrink-0">{i.hint}</span>}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );
}
