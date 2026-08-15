import React from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Lock,
  Unlock,
  Type,
  QrCode,
  Barcode as BarcodeIcon,
  Square,
  Minus,
  Sparkles,
  Rows,
  Columns,
  Maximize2,
  Layers,
  ArrowDownUp,
  ArrowLeftRight,
} from 'lucide-react';
import type { LabelElement, LabelTemplate, BarcodeFormat, TextFontFamily, TextFontWeight } from '../lib/types';

interface ElementPropertiesPanelProps {
  template: LabelTemplate;
  selectedIds: string[];
  onSelectAll: () => void;
  onUpdateElement: (id: string, updates: Partial<LabelElement>) => void;
  onUpdateProps: (id: string, newProps: Record<string, any>) => void;
  onDeleteElement: (id: string) => void;
  onDeleteMultipleElements: (ids: string[]) => void;
  onDuplicateElement: (id: string) => void;
  onAlignElement: (
    id: string,
    alignment: 'left' | 'center_h' | 'right' | 'top' | 'center_v' | 'bottom'
  ) => void;
  onAlignGroup: (
    alignment:
      | 'left'
      | 'center_h'
      | 'right'
      | 'top'
      | 'center_v'
      | 'bottom'
      | 'distribute_v'
      | 'distribute_h'
      | 'same_width'
      | 'same_height'
      | 'stack_column'
  ) => void;
}

export default function ElementPropertiesPanel({
  template,
  selectedIds,
  onSelectAll,
  onUpdateElement,
  onUpdateProps,
  onDeleteElement,
  onDeleteMultipleElements,
  onDuplicateElement,
  onAlignElement,
  onAlignGroup,
}: ElementPropertiesPanelProps) {
  const isPortrait = template.orientation === 'portrait';
  const labelWidth = isPortrait ? template.height_mm : template.width_mm;
  const labelHeight = isPortrait ? template.width_mm : template.height_mm;

  // Case 1: Multiple elements selected
  if (selectedIds.length > 1) {
    return (
      <div className="w-80 border-l border-zinc-200 bg-white flex flex-col h-full overflow-y-auto select-none">
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-blue-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600 text-white rounded-md">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-900">{selectedIds.length} Elementos Selecionados</h3>
              <p className="text-[10px] text-zinc-500">Alinhamento e Distribuição em Massa</p>
            </div>
          </div>

          <button
            onClick={() => onDeleteMultipleElements(selectedIds)}
            title="Excluir Todos os Selecionados"
            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 text-xs text-zinc-700">
          {/* Group Alignment */}
          <div>
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
              Alinhar Elementos Entre Si
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-zinc-50 p-2 rounded-xl border border-zinc-200">
              <button
                type="button"
                onClick={() => onAlignGroup('left')}
                className="flex items-center justify-center gap-1.5 p-2 bg-white border border-zinc-200 hover:border-blue-400 rounded-lg text-zinc-700 font-semibold cursor-pointer shadow-2xs text-[11px]"
                title="Alinhar todas as margens esquerdas"
              >
                <AlignLeft className="h-3.5 w-3.5 text-blue-600" />
                <span>À Esquerda</span>
              </button>

              <button
                type="button"
                onClick={() => onAlignGroup('center_h')}
                className="flex items-center justify-center gap-1.5 p-2 bg-white border border-zinc-200 hover:border-blue-400 rounded-lg text-zinc-700 font-semibold cursor-pointer shadow-2xs text-[11px]"
                title="Centralizar horizontalmente todos os itens"
              >
                <AlignCenter className="h-3.5 w-3.5 text-blue-600" />
                <span>Centro</span>
              </button>

              <button
                type="button"
                onClick={() => onAlignGroup('right')}
                className="flex items-center justify-center gap-1.5 p-2 bg-white border border-zinc-200 hover:border-blue-400 rounded-lg text-zinc-700 font-semibold cursor-pointer shadow-2xs text-[11px]"
                title="Alinhar todas as margens direitas"
              >
                <AlignRight className="h-3.5 w-3.5 text-blue-600" />
                <span>À Direita</span>
              </button>

              <button
                type="button"
                onClick={() => onAlignGroup('top')}
                className="flex items-center justify-center gap-1.5 p-2 bg-white border border-zinc-200 hover:border-blue-400 rounded-lg text-zinc-700 font-semibold cursor-pointer shadow-2xs text-[11px]"
                title="Alinhar todos ao topo do primeiro"
              >
                <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                <span>Ao Topo</span>
              </button>

              <button
                type="button"
                onClick={() => onAlignGroup('center_v')}
                className="flex items-center justify-center gap-1.5 p-2 bg-white border border-zinc-200 hover:border-blue-400 rounded-lg text-zinc-700 font-semibold cursor-pointer shadow-2xs text-[11px]"
                title="Centralizar verticalmente todos os itens"
              >
                <ArrowDownUp className="h-3.5 w-3.5 text-blue-600" />
                <span>Ao Meio</span>
              </button>

              <button
                type="button"
                onClick={() => onAlignGroup('bottom')}
                className="flex items-center justify-center gap-1.5 p-2 bg-white border border-zinc-200 hover:border-blue-400 rounded-lg text-zinc-700 font-semibold cursor-pointer shadow-2xs text-[11px]"
                title="Alinhar todos pela base inferior"
              >
                <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                <span>À Base</span>
              </button>
            </div>
          </div>

          {/* Group Distribution */}
          <div>
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
              Distribuir e Espaçar
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onAlignGroup('distribute_v')}
                className="flex items-center justify-center gap-2 p-2.5 bg-zinc-50 border border-zinc-200 hover:border-blue-500 rounded-xl text-zinc-800 font-semibold cursor-pointer text-xs transition-colors"
              >
                <Rows className="h-4 w-4 text-blue-600" />
                <span>Espaço Vertical Igual</span>
              </button>

              <button
                type="button"
                onClick={() => onAlignGroup('distribute_h')}
                className="flex items-center justify-center gap-2 p-2.5 bg-zinc-50 border border-zinc-200 hover:border-blue-500 rounded-xl text-zinc-800 font-semibold cursor-pointer text-xs transition-colors"
              >
                <Columns className="h-4 w-4 text-blue-600" />
                <span>Espaço Horiz. Igual</span>
              </button>
            </div>
          </div>

          {/* Auto Layout Column Stack */}
          <div>
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
              Auto-Organização Inteligente
            </label>
            <button
              type="button"
              onClick={() => onAlignGroup('stack_column')}
              className="w-full flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 hover:bg-blue-100/80 text-blue-700 font-bold p-3 rounded-xl cursor-pointer shadow-2xs text-xs transition-all"
            >
              <Sparkles className="h-4 w-4" />
              <span>Empilhar em Coluna com 2mm de Respiro</span>
            </button>
            <p className="text-[10px] text-zinc-400 mt-1.5 text-center leading-relaxed">
              Alinha a margem esquerda de todos os itens e ajusta a posição vertical de cada um em cascata ordenada.
            </p>
          </div>

          {/* Equalize Dimensions */}
          <div>
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
              Equalizar Dimensões
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onAlignGroup('same_width')}
                className="flex items-center justify-center gap-1.5 p-2 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 rounded-lg text-zinc-700 font-medium cursor-pointer text-xs"
              >
                <ArrowLeftRight className="h-3.5 w-3.5 text-zinc-500" />
                <span>Mesma Largura</span>
              </button>

              <button
                type="button"
                onClick={() => onAlignGroup('same_height')}
                className="flex items-center justify-center gap-1.5 p-2 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 rounded-lg text-zinc-700 font-medium cursor-pointer text-xs"
              >
                <ArrowDownUp className="h-3.5 w-3.5 text-zinc-500" />
                <span>Mesma Altura</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: No element selected
  if (selectedIds.length === 0) {
    return (
      <div className="w-80 border-l border-zinc-200 bg-white p-6 flex flex-col items-center justify-center text-center text-zinc-400 space-y-4 select-none">
        <Sparkles className="h-10 w-10 text-zinc-300 stroke-1" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-zinc-700">Nenhum elemento selecionado</p>
          <p className="text-xs text-zinc-500">
            Clique em qualquer texto, código de barras ou forma para editar. Segure <strong>Shift</strong> para selecionar múltiplos itens.
          </p>
        </div>

        <div className="w-full pt-4 border-t border-zinc-100 space-y-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="w-full flex items-center justify-center gap-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 font-semibold p-2 rounded-xl text-xs cursor-pointer"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Selecionar Todos os Elementos ({template.elements_json.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onAlignGroup('stack_column')}
            className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold p-2 rounded-xl text-xs cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Auto-Organizar Textos da Etiqueta</span>
          </button>
        </div>
      </div>
    );
  }

  // Case 3: Exactly one element selected
  const singleId = selectedIds[0];
  const element = template.elements_json.find((item) => item.id === singleId);

  if (!element) return null;

  const p = element.props || {};

  const handlePropChange = (key: string, value: any) => {
    onUpdateProps(element.id, { ...p, [key]: value });
  };

  const getElementIcon = () => {
    switch (element.type) {
      case 'text':
        return <Type className="h-4 w-4 text-blue-600" />;
      case 'barcode':
        return <BarcodeIcon className="h-4 w-4 text-blue-600" />;
      case 'qrcode':
        return <QrCode className="h-4 w-4 text-blue-600" />;
      case 'box':
        return <Square className="h-4 w-4 text-blue-600" />;
      case 'line':
        return <Minus className="h-4 w-4 text-blue-600" />;
      default:
        return <Sparkles className="h-4 w-4 text-blue-600" />;
    }
  };

  const getElementTypeName = () => {
    switch (element.type) {
      case 'text':
        return 'Texto / Parágrafo';
      case 'barcode':
        return 'Código de Barras';
      case 'qrcode':
        return 'QR Code';
      case 'box':
        return 'Caixa / Retângulo';
      case 'line':
        return 'Linha Divisória';
      case 'badge':
        return 'Badge de Destaque';
      case 'image':
        return 'Imagem / Logo';
      default:
        return 'Elemento';
    }
  };

  return (
    <div className="w-80 border-l border-zinc-200 bg-white flex flex-col h-full overflow-y-auto select-none">
      {/* Header */}
      <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 rounded-md">{getElementIcon()}</div>
          <div>
            <h3 className="text-xs font-bold text-zinc-900">{getElementTypeName()}</h3>
            <p className="text-[10px] text-zinc-400 font-mono">ID: {element.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onDuplicateElement(element.id)}
            title="Duplicar Elemento"
            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded cursor-pointer transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDeleteElement(element.id)}
            title="Excluir Elemento (Delete)"
            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5 text-xs text-zinc-700">
        {/* Alignment in Label */}
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
            Alinhamento na Etiqueta
          </label>
          <div className="grid grid-cols-6 gap-1 bg-zinc-50 p-1.5 rounded-lg border border-zinc-200">
            <button
              onClick={() => onAlignElement(element.id, 'left')}
              title="Alinhar à Esquerda (1mm)"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors text-center flex items-center justify-center cursor-pointer shadow-2xs"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'center_h')}
              title="Centralizar Horizontalmente"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors text-center flex items-center justify-center cursor-pointer shadow-2xs"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'right')}
              title="Alinhar à Direita"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors text-center flex items-center justify-center cursor-pointer shadow-2xs"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'top')}
              title="Alinhar ao Topo (1mm)"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors text-center flex items-center justify-center cursor-pointer shadow-2xs text-[10px] font-bold"
            >
              Topo
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'center_v')}
              title="Centralizar Verticalmente"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors text-center flex items-center justify-center cursor-pointer shadow-2xs text-[10px] font-bold"
            >
              Meio
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'bottom')}
              title="Alinhar à Base"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors text-center flex items-center justify-center cursor-pointer shadow-2xs text-[10px] font-bold"
            >
              Base
            </button>
          </div>
        </div>

        {/* Position and Dimensions (mm) */}
        <div>
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
            Posição e Tamanho (mm)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-zinc-500 font-mono">X (horizontal):</span>
              <div className="relative flex items-center mt-1">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max={labelWidth}
                  value={element.x_mm}
                  onChange={(e) => onUpdateElement(element.id, { x_mm: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono pr-7 focus:outline-none focus:border-blue-500"
                />
                <span className="absolute right-2 text-[10px] text-zinc-400">mm</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-zinc-500 font-mono">Y (vertical):</span>
              <div className="relative flex items-center mt-1">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max={labelHeight}
                  value={element.y_mm}
                  onChange={(e) => onUpdateElement(element.id, { y_mm: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono pr-7 focus:outline-none focus:border-blue-500"
                />
                <span className="absolute right-2 text-[10px] text-zinc-400">mm</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-zinc-500 font-mono">Largura:</span>
              <div className="relative flex items-center mt-1">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max={labelWidth}
                  value={element.width_mm}
                  onChange={(e) =>
                    onUpdateElement(element.id, { width_mm: Math.max(1, parseFloat(e.target.value) || 1) })
                  }
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono pr-7 focus:outline-none focus:border-blue-500"
                />
                <span className="absolute right-2 text-[10px] text-zinc-400">mm</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-zinc-500 font-mono">Altura:</span>
              <div className="relative flex items-center mt-1">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max={labelHeight}
                  value={element.height_mm}
                  onChange={(e) =>
                    onUpdateElement(element.id, { height_mm: Math.max(1, parseFloat(e.target.value) || 1) })
                  }
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono pr-7 focus:outline-none focus:border-blue-500"
                />
                <span className="absolute right-2 text-[10px] text-zinc-400">mm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Text Element Properties */}
        {element.type === 'text' && (
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Conteúdo do Texto
              </label>
              <textarea
                rows={3}
                value={p.text || ''}
                onChange={(e) => handlePropChange('text', e.target.value)}
                placeholder="Digite o texto da etiqueta..."
                className="w-full border border-zinc-200 rounded-md p-2 text-xs focus:outline-none focus:border-blue-500 leading-normal"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                <button
                  type="button"
                  onClick={() => handlePropChange('text', (p.text || '') + ' {seq}')}
                  className="text-[9px] font-mono bg-zinc-100 hover:bg-zinc-200 px-1.5 py-0.5 rounded cursor-pointer text-zinc-600"
                  title="Número sequencial da cópia"
                >
                  +{'{seq}'}
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('text', (p.text || '') + ' {total}')}
                  className="text-[9px] font-mono bg-zinc-100 hover:bg-zinc-200 px-1.5 py-0.5 rounded cursor-pointer text-zinc-600"
                  title="Total de cópias"
                >
                  +{'{total}'}
                </button>
                <button
                  type="button"
                  onClick={() => handlePropChange('text', (p.text || '') + ' {date}')}
                  className="text-[9px] font-mono bg-zinc-100 hover:bg-zinc-200 px-1.5 py-0.5 rounded cursor-pointer text-zinc-600"
                  title="Data atual"
                >
                  +{'{date}'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-zinc-500">Tamanho da Fonte (pt):</span>
                <input
                  type="number"
                  min="4"
                  max="48"
                  value={p.fontSize || 10}
                  onChange={(e) => handlePropChange('fontSize', parseInt(e.target.value, 10) || 10)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono mt-1 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <span className="text-[10px] text-zinc-500">Peso da Fonte:</span>
                <select
                  value={p.fontWeight || 'normal'}
                  onChange={(e) => handlePropChange('fontWeight', e.target.value as TextFontWeight)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs mt-1 focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="normal">Normal</option>
                  <option value="500">Médio (500)</option>
                  <option value="600">Semi-Bold (600)</option>
                  <option value="bold">Negrito (Bold)</option>
                  <option value="800">Extra Bold (800)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-zinc-500">Família da Fonte:</span>
                <select
                  value={p.fontFamily || 'Inter'}
                  onChange={(e) => handlePropChange('fontFamily', e.target.value as TextFontFamily)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs mt-1 focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="Inter">Padrão (Inter)</option>
                  <option value="JetBrains Mono">Monoespaçada (Código)</option>
                  <option value="serif">Serifada</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] text-zinc-500">Alinhamento do Texto:</span>
                <div className="flex border border-zinc-200 rounded-md mt-1 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handlePropChange('textAlign', 'left')}
                    className={`flex-1 py-1.5 flex justify-center cursor-pointer ${
                      p.textAlign === 'left' || !p.textAlign ? 'bg-zinc-200 font-bold' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <AlignLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange('textAlign', 'center')}
                    className={`flex-1 py-1.5 flex justify-center cursor-pointer border-l border-zinc-200 ${
                      p.textAlign === 'center' ? 'bg-zinc-200 font-bold' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <AlignCenter className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange('textAlign', 'right')}
                    className={`flex-1 py-1.5 flex justify-center cursor-pointer border-l border-zinc-200 ${
                      p.textAlign === 'right' ? 'bg-zinc-200 font-bold' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <AlignRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(p.uppercase)}
                  onChange={(e) => handlePropChange('uppercase', e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span className="text-xs">MAIÚSCULAS</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(p.multiline)}
                  onChange={(e) => handlePropChange('multiline', e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span className="text-xs">Múltiplas Linhas</span>
              </label>
            </div>
          </div>
        )}

        {/* Barcode Properties */}
        {element.type === 'barcode' && (
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Valor do Código de Barras
              </label>
              <input
                type="text"
                value={p.value || ''}
                onChange={(e) => handlePropChange('value', e.target.value)}
                placeholder="Ex: 7898912345678 ou MP0012"
                className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-zinc-500">Padrão / Formato:</span>
                <select
                  value={p.format || 'code128'}
                  onChange={(e) => handlePropChange('format', e.target.value as BarcodeFormat)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs mt-1 focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="code128">Code 128 (Alfanumérico)</option>
                  <option value="ean13">EAN-13 (13 dígitos)</option>
                  <option value="code39">Code 39 (Industrial)</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] text-zinc-500">Tamanho do Texto (pt):</span>
                <input
                  type="number"
                  min="5"
                  max="14"
                  value={p.fontSize || 7.5}
                  onChange={(e) => handlePropChange('fontSize', parseFloat(e.target.value) || 7.5)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono mt-1 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={p.showText !== false}
                onChange={(e) => handlePropChange('showText', e.target.checked)}
                className="rounded text-blue-600"
              />
              <span className="text-xs">Exibir número legível abaixo das barras</span>
            </label>
          </div>
        )}

        {/* QR Code Properties */}
        {element.type === 'qrcode' && (
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Conteúdo / Payload do QR Code
              </label>
              <textarea
                rows={3}
                value={p.value || ''}
                onChange={(e) => handlePropChange('value', e.target.value)}
                placeholder="Texto, URL, Lote ou Dados estruturados..."
                className="w-full border border-zinc-200 rounded-md p-2 text-xs font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <span className="text-[10px] text-zinc-500">Correção de Erros:</span>
              <select
                value={p.errorCorrectionLevel || 'M'}
                onChange={(e) => handlePropChange('errorCorrectionLevel', e.target.value)}
                className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs mt-1 focus:outline-none focus:border-blue-500 bg-white"
              >
                <option value="L">Nível L (7% de recuperação)</option>
                <option value="M">Nível M (15% - Padrão Recomendado)</option>
                <option value="Q">Nível Q (25% de recuperação)</option>
                <option value="H">Nível H (30% - Máxima redundância)</option>
              </select>
            </div>
          </div>
        )}

        {/* Badge Properties */}
        {element.type === 'badge' && (
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Texto do Badge
              </label>
              <input
                type="text"
                value={p.text || ''}
                onChange={(e) => handlePropChange('text', e.target.value)}
                className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-bold uppercase focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-zinc-500">Estilo Visual:</span>
                <select
                  value={p.variant || 'black'}
                  onChange={(e) => handlePropChange('variant', e.target.value)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs mt-1 focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="black">Fundo Preto (Texto Branco)</option>
                  <option value="outline">Apenas Borda Preta</option>
                  <option value="gray">Fundo Cinza</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] text-zinc-500">Arredondamento (mm):</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={p.borderRadius || 2}
                  onChange={(e) => handlePropChange('borderRadius', parseFloat(e.target.value) || 0)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono mt-1 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Box Properties */}
        {element.type === 'box' && (
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-zinc-500">Espessura Borda (mm):</span>
                <input
                  type="number"
                  min="0.2"
                  max="5"
                  step="0.2"
                  value={p.borderWidth || 0.6}
                  onChange={(e) => handlePropChange('borderWidth', parseFloat(e.target.value) || 0.6)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono mt-1 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <span className="text-[10px] text-zinc-500">Arredondamento (mm):</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={p.borderRadius || 0}
                  onChange={(e) => handlePropChange('borderRadius', parseFloat(e.target.value) || 0)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono mt-1 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <span className="text-[10px] text-zinc-500">Estilo da Borda:</span>
              <select
                value={p.borderStyle || 'solid'}
                onChange={(e) => handlePropChange('borderStyle', e.target.value)}
                className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs mt-1 focus:outline-none focus:border-blue-500 bg-white"
              >
                <option value="solid">Linha Contínua (Sólida)</option>
                <option value="dashed">Tracejada</option>
                <option value="dotted">Pontilhada</option>
              </select>
            </div>
          </div>
        )}

        {/* Line Properties */}
        {element.type === 'line' && (
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-zinc-500">Orientação:</span>
                <select
                  value={p.orientation || 'horizontal'}
                  onChange={(e) => handlePropChange('orientation', e.target.value)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs mt-1 focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] text-zinc-500">Espessura (mm):</span>
                <input
                  type="number"
                  min="0.2"
                  max="5"
                  step="0.2"
                  value={p.strokeWidth || 0.5}
                  onChange={(e) => handlePropChange('strokeWidth', parseFloat(e.target.value) || 0.5)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono mt-1 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
