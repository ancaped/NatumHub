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
  Tag,
  Settings,
  Database,
  Info,
} from 'lucide-react';
import type { LabelElement, LabelTemplate, BarcodeFormat, TextFontFamily, TextFontWeight } from '../lib/types';
import { getAllSystemVariables, type SystemVariable } from '../lib/systemVariables';

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
  onTemplateChange?: (updates: Partial<LabelTemplate>) => void;
  onOpenSystemVariablesModal?: () => void;
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
  onTemplateChange,
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
                <span>Espaço Vertical</span>
              </button>

              <button
                type="button"
                onClick={() => onAlignGroup('distribute_h')}
                className="flex items-center justify-center gap-2 p-2.5 bg-zinc-50 border border-zinc-200 hover:border-blue-500 rounded-xl text-zinc-800 font-semibold cursor-pointer text-xs transition-colors"
              >
                <Columns className="h-4 w-4 text-blue-600" />
                <span>Espaço Horiz.</span>
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
              <span>Empilhar em Coluna (Cascata)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: No element selected -> Render Label Template Settings & Category
  if (selectedIds.length === 0) {
    return (
      <div className="w-80 border-l border-zinc-200 bg-white flex flex-col h-full overflow-y-auto select-none">
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/80">
          <div className="p-1.5 bg-zinc-900 text-white rounded-md">
            <Settings className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-zinc-900">Configurações da Etiqueta</h3>
            <p className="text-[10px] text-zinc-500">Definições gerais do modelo e categoria</p>
          </div>
        </div>

        <div className="p-4 space-y-4 text-xs text-zinc-700">
          {/* Template Name */}
          <div>
            <label className="text-xs font-bold text-zinc-900 block mb-1">Nome do Modelo:</label>
            <input
              type="text"
              value={template.name}
              onChange={(e) => onTemplateChange?.({ name: e.target.value })}
              placeholder="Ex: Identificação de Caixa Nátum"
              className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50 font-bold focus:bg-white text-xs"
            />
          </div>

          {/* Template Category (Directly sets category for sidebar classification) */}
          <div>
            <label className="text-xs font-bold text-zinc-900 block mb-1">
              Classificação / Categoria da Sidebar:
            </label>
            <select
              value={template.category || 'custom'}
              onChange={(e) => onTemplateChange?.({ category: e.target.value })}
              className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50 font-bold text-zinc-900 focus:bg-white text-xs"
            >
              <option value="expedicao">📦 Caixas / Volumes (DUN-14)</option>
              <option value="producao">🧴 Produtos Acabados (EAN-13)</option>
              <option value="estoque">🧪 Matérias-Primas</option>
              <option value="embalagens">📦 Embalagens & Apoio</option>
              <option value="qualidade">🛡️ Controle de Qualidade</option>
              <option value="custom">⭐ Personalizada</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-zinc-900 block mb-1">Descrição / Notas:</label>
            <textarea
              rows={2}
              value={template.description || ''}
              onChange={(e) => onTemplateChange?.({ description: e.target.value })}
              placeholder="Finalidade desta etiqueta..."
              className="w-full p-2 border border-zinc-300 rounded-xl bg-zinc-50 focus:bg-white text-xs"
            />
          </div>

          {/* Dimensions & Orientation */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <span className="text-[11px] font-bold text-zinc-600 block mb-1">Largura (mm):</span>
              <input
                type="number"
                value={template.width_mm}
                onChange={(e) =>
                  onTemplateChange?.({ width_mm: Math.max(10, parseInt(e.target.value, 10) || 100) })
                }
                className="w-full p-2 border border-zinc-300 rounded-xl font-mono text-center font-bold bg-zinc-50"
              />
            </div>
            <div>
              <span className="text-[11px] font-bold text-zinc-600 block mb-1">Altura (mm):</span>
              <input
                type="number"
                value={template.height_mm}
                onChange={(e) =>
                  onTemplateChange?.({ height_mm: Math.max(10, parseInt(e.target.value, 10) || 50) })
                }
                className="w-full p-2 border border-zinc-300 rounded-xl font-mono text-center font-bold bg-zinc-50"
              />
            </div>
          </div>

          <div>
            <span className="text-[11px] font-bold text-zinc-600 block mb-1">Orientação:</span>
            <div className="grid grid-cols-2 gap-1 bg-zinc-100 p-1 rounded-xl font-bold text-xs">
              <button
                type="button"
                onClick={() => onTemplateChange?.({ orientation: 'landscape' })}
                className={`py-1.5 rounded-lg cursor-pointer transition-all ${
                  template.orientation === 'landscape' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                }`}
              >
                Paisagem (Horizontal)
              </button>
              <button
                type="button"
                onClick={() => onTemplateChange?.({ orientation: 'portrait' })}
                className={`py-1.5 rounded-lg cursor-pointer transition-all ${
                  template.orientation === 'portrait' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                }`}
              >
                Retrato (Vertical)
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="pt-3 border-t border-zinc-100 space-y-2">
            <button
              type="button"
              onClick={onSelectAll}
              className="w-full flex items-center justify-center gap-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-800 font-bold p-2.5 rounded-xl text-xs cursor-pointer shadow-2xs"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Selecionar Todos ({template.elements_json.length} itens)</span>
            </button>

            <button
              type="button"
              onClick={() => onAlignGroup('stack_column')}
              className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold p-2.5 rounded-xl text-xs cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Auto-Organizar Textos</span>
            </button>
          </div>

          {/* Integration Guide Box */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1.5 text-[11px] text-zinc-600">
            <p className="font-bold text-zinc-900 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-blue-600" />
              <span>Como Funciona a Integração:</span>
            </p>
            <p className="leading-relaxed">
              Clique em qualquer texto ou código de barras para inserir tags como <strong>{'{product_code}'}</strong>,{' '}
              <strong>{'{lot}'}</strong> ou <strong>{'{barcode}'}</strong>. Ao gerar etiquetas, o sistema preencherá
              tudo automaticamente!
            </p>
          </div>
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

  const insertVariable = (token: string, targetKey: 'text' | 'value' = 'text') => {
    const current = (p[targetKey] || '') as string;
    handlePropChange(targetKey, current ? `${current} ${token}` : token);
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
      case 'badge':
        return <Tag className="h-4 w-4 text-blue-600" />;
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
      default:
        return 'Elemento';
    }
  };

  return (
    <div className="w-80 border-l border-zinc-200 bg-white flex flex-col h-full overflow-y-auto select-none">
      {/* Header */}
      <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 rounded-lg">{getElementIcon()}</div>
          <div>
            <h3 className="text-xs font-bold text-zinc-900">{getElementTypeName()}</h3>
            <p className="text-[10px] text-zinc-400 font-mono">ID: {element.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onDuplicateElement(element.id)}
            title="Duplicar Elemento"
            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDeleteElement(element.id)}
            title="Excluir Elemento (Delete)"
            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
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
              title="Alinhar à Esquerda"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'center_h')}
              title="Centralizar Horizontalmente"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'right')}
              title="Alinhar à Direita"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'top')}
              title="Alinhar ao Topo"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors flex items-center justify-center cursor-pointer shadow-2xs text-[10px] font-bold"
            >
              Topo
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'center_v')}
              title="Centralizar Verticalmente"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors flex items-center justify-center cursor-pointer shadow-2xs text-[10px] font-bold"
            >
              Meio
            </button>
            <button
              onClick={() => onAlignElement(element.id, 'bottom')}
              title="Alinhar à Base"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded transition-colors flex items-center justify-center cursor-pointer shadow-2xs text-[10px] font-bold"
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
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono pr-7 focus:outline-none focus:border-blue-500 bg-zinc-50 focus:bg-white"
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
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono pr-7 focus:outline-none focus:border-blue-500 bg-zinc-50 focus:bg-white"
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
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono pr-7 focus:outline-none focus:border-blue-500 bg-zinc-50 focus:bg-white"
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
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono pr-7 focus:outline-none focus:border-blue-500 bg-zinc-50 focus:bg-white"
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
                placeholder="Digite o texto ou insira variáveis abaixo..."
                className="w-full border border-zinc-200 rounded-md p-2 text-xs focus:outline-none focus:border-blue-500 leading-normal bg-zinc-50 focus:bg-white font-medium"
              />

              {/* System Variables Injection Grid */}
              <div className="mt-2 space-y-1.5 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-900 flex items-center gap-1">
                    <Database className="h-3 w-3 text-blue-600" />
                    <span>Inserir Dados do Sistema:</span>
                  </span>
                  {onOpenSystemVariablesModal && (
                    <button
                      type="button"
                      onClick={onOpenSystemVariablesModal}
                      className="text-[10px] text-blue-700 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <span>Mais Dados / Criar (+)</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {getAllSystemVariables().slice(0, 10).map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertVariable(v.token, 'text')}
                      className="text-[9px] font-mono bg-white hover:bg-blue-600 hover:text-white border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer text-blue-800 transition-colors shadow-2xs font-bold"
                      title={`${v.label} (Ex: ${v.sample})`}
                    >
                      +{v.token}
                    </button>
                  ))}
                </div>
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
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono mt-1 focus:outline-none focus:border-blue-500 bg-white"
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
                  <option value="JetBrains Mono">Mono (Código)</option>
                  <option value="serif">Serifada</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] text-zinc-500">Alinhamento:</span>
                <select
                  value={p.textAlign || 'left'}
                  onChange={(e) => handlePropChange('textAlign', e.target.value)}
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs mt-1 focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="left">Esquerda</option>
                  <option value="center">Centralizado</option>
                  <option value="right">Direita</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Barcode Element Properties */}
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
                placeholder="Ex: {barcode}, {box_barcode}, 789..."
                className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-blue-500 bg-zinc-50 focus:bg-white"
              />

              <div className="mt-2 space-y-1.5 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-900 block">Vincular Código do Sistema:</span>
                  {onOpenSystemVariablesModal && (
                    <button
                      type="button"
                      onClick={onOpenSystemVariablesModal}
                      className="text-[10px] text-blue-700 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <span>Mais Dados (+)</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => handlePropChange('value', '{barcode}')}
                    className="text-[9px] font-mono bg-white hover:bg-blue-600 hover:text-white border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer text-blue-800 font-bold"
                  >
                    +{'{barcode}'} (EAN-13)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange('value', '{box_barcode}')}
                    className="text-[9px] font-mono bg-white hover:bg-blue-600 hover:text-white border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer text-blue-800 font-bold"
                  >
                    +{'{box_barcode}'} (DUN-14 Caixa)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange('value', '{product_code}')}
                    className="text-[9px] font-mono bg-white hover:bg-blue-600 hover:text-white border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer text-blue-800 font-bold"
                  >
                    +{'{product_code}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePropChange('value', '{lot}')}
                    className="text-[9px] font-mono bg-white hover:bg-blue-600 hover:text-white border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer text-blue-800 font-bold"
                  >
                    +{'{lot}'}
                  </button>
                </div>
              </div>
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
                  className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-mono mt-1 focus:outline-none focus:border-blue-500 bg-white"
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
                className="w-full border border-zinc-200 rounded-md p-2 text-xs font-mono focus:outline-none focus:border-blue-500 bg-zinc-50 focus:bg-white"
              />
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
                className="w-full border border-zinc-200 rounded-md px-2 py-1.5 text-xs font-bold uppercase focus:outline-none focus:border-blue-500 bg-zinc-50 focus:bg-white"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
