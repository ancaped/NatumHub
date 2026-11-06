import React, { useState } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  ArrowDownUp,
  Rows,
  Columns,
  Sparkles,
  Layers,
  ChevronDown,
} from 'lucide-react';
import type { LabelElement, LabelTemplate, BarcodeFormat, TextFontFamily, TextFontWeight } from '../lib/types';
import { getAllSystemVariables } from '../lib/systemVariables';
import CampoPreencherEditor from './CampoPreencherEditor';

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

// ---------- Peças visuais compartilhadas ----------

const inputCls =
  'w-full h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900';
const areaCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900';
const chipCls =
  'rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 cursor-pointer transition-colors';
const iconBtnCls =
  'p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer transition-colors';

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block mb-1 text-[11px] text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-zinc-400">{children}</p>;
}

function Segmented({ children, cols }: { children: React.ReactNode; cols: number }) {
  return (
    <div
      className="grid gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

function SegBtn({
  title,
  onClick,
  active = false,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-7 flex items-center justify-center rounded-md text-[11px] cursor-pointer transition-colors ${
        active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-white hover:text-zinc-900'
      }`}
    >
      {children}
    </button>
  );
}

function ActionBtn({
  title,
  onClick,
  children,
}: {
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-700 hover:border-zinc-900 hover:text-zinc-900 cursor-pointer transition-colors"
    >
      {children}
    </button>
  );
}

function MmInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.5,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <div className="relative flex items-center">
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} pr-8 font-mono`}
        />
        <span className="absolute right-2.5 text-[10px] text-zinc-400">mm</span>
      </div>
    </Field>
  );
}

const panelCls = 'w-72 border-l border-zinc-200 bg-white flex flex-col h-full overflow-y-auto select-none';

function Header({
  title,
  subtitle,
  titleHint,
  children,
}: {
  title: string;
  subtitle: string;
  titleHint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3.5 border-b border-zinc-100 flex items-center justify-between shrink-0">
      <div className="min-w-0" title={titleHint}>
        <h3 className="text-xs font-semibold text-zinc-900 truncate">{title}</h3>
        <p className="text-[11px] text-zinc-500 truncate">{subtitle}</p>
      </div>
      {children && <div className="flex items-center gap-0.5 shrink-0">{children}</div>}
    </div>
  );
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
  onOpenSystemVariablesModal,
}: ElementPropertiesPanelProps) {
  const isPortrait = template.orientation === 'portrait';
  const labelWidth = isPortrait ? template.height_mm : template.width_mm;
  const labelHeight = isPortrait ? template.width_mm : template.height_mm;

  // Caso 1: vários elementos selecionados
  if (selectedIds.length > 1) {
    return (
      <div className={panelCls}>
        <Header title={`${selectedIds.length} elementos`} subtitle="Seleção múltipla">
          <button
            type="button"
            onClick={() => onDeleteMultipleElements(selectedIds)}
            title="Excluir todos os selecionados"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-zinc-100 cursor-pointer transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </Header>

        <Section title="Alinhar entre si" defaultOpen>
          <Segmented cols={6}>
            <SegBtn title="Alinhar todas as margens esquerdas" onClick={() => onAlignGroup('left')}>
              <AlignLeft className="h-3.5 w-3.5" />
            </SegBtn>
            <SegBtn title="Centralizar horizontalmente todos os itens" onClick={() => onAlignGroup('center_h')}>
              <AlignCenter className="h-3.5 w-3.5" />
            </SegBtn>
            <SegBtn title="Alinhar todas as margens direitas" onClick={() => onAlignGroup('right')}>
              <AlignRight className="h-3.5 w-3.5" />
            </SegBtn>
            <SegBtn title="Alinhar todos ao topo do primeiro" onClick={() => onAlignGroup('top')}>
              <ArrowUp className="h-3.5 w-3.5" />
            </SegBtn>
            <SegBtn title="Centralizar verticalmente todos os itens" onClick={() => onAlignGroup('center_v')}>
              <ArrowDownUp className="h-3.5 w-3.5" />
            </SegBtn>
            <SegBtn title="Alinhar todos pela base inferior" onClick={() => onAlignGroup('bottom')}>
              <ArrowDown className="h-3.5 w-3.5" />
            </SegBtn>
          </Segmented>
        </Section>

        <Section title="Distribuir">
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn title="Distribuir espaço vertical" onClick={() => onAlignGroup('distribute_v')}>
              <Rows className="h-3.5 w-3.5" />
              <span>Vertical</span>
            </ActionBtn>
            <ActionBtn title="Distribuir espaço horizontal" onClick={() => onAlignGroup('distribute_h')}>
              <Columns className="h-3.5 w-3.5" />
              <span>Horizontal</span>
            </ActionBtn>
          </div>
        </Section>

        <Section title="Organização automática">
          <ActionBtn title="Empilhar em coluna (cascata)" onClick={() => onAlignGroup('stack_column')}>
            <Sparkles className="h-3.5 w-3.5" />
            <span>Empilhar em coluna</span>
          </ActionBtn>
        </Section>
      </div>
    );
  }

  // Caso 2: nenhum elemento selecionado -> configurações da etiqueta
  if (selectedIds.length === 0) {
    return (
      <div className={panelCls}>
        <Header title="Etiqueta" subtitle="Tamanho e orientação" />

        <Section title="Modelo" defaultOpen>
          <Field label="Nome do modelo">
            <input
              type="text"
              value={template.name}
              onChange={(e) => onTemplateChange?.({ name: e.target.value })}
              placeholder="Ex: Identificação de Caixa Nátum"
              className={inputCls}
            />
          </Field>

          <Field label="Família no catálogo">
            <select
              value={template.category || 'custom'}
              onChange={(e) => onTemplateChange?.({ category: e.target.value })}
              className={inputCls}
            >
              <option value="expedicao">Caixas / Volumes (DUN-14)</option>
              <option value="producao">Produtos Acabados (EAN-13)</option>
              <option value="estoque">Matérias-Primas</option>
              <option value="embalagens">Embalagens & Apoio</option>
              <option value="qualidade">Controle de Qualidade</option>
              <option value="custom">Personalizada</option>
            </select>
          </Field>

          <Field label="Descrição">
            <textarea
              rows={2}
              value={template.description || ''}
              onChange={(e) => onTemplateChange?.({ description: e.target.value })}
              placeholder="Finalidade desta etiqueta"
              className={areaCls}
            />
          </Field>
        </Section>

        <Section title="Tamanho e orientação">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Largura">
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={template.width_mm}
                  onChange={(e) =>
                    onTemplateChange?.({ width_mm: Math.max(10, parseInt(e.target.value, 10) || 100) })
                  }
                  className={`${inputCls} pr-8 font-mono`}
                />
                <span className="absolute right-2.5 text-[10px] text-zinc-400">mm</span>
              </div>
            </Field>
            <Field label="Altura">
              <div className="relative flex items-center">
                <input
                  type="number"
                  value={template.height_mm}
                  onChange={(e) =>
                    onTemplateChange?.({ height_mm: Math.max(10, parseInt(e.target.value, 10) || 50) })
                  }
                  className={`${inputCls} pr-8 font-mono`}
                />
                <span className="absolute right-2.5 text-[10px] text-zinc-400">mm</span>
              </div>
            </Field>
          </div>

          <Field label="Orientação">
            <Segmented cols={2}>
              <SegBtn
                title="Paisagem (horizontal)"
                active={template.orientation === 'landscape'}
                onClick={() => onTemplateChange?.({ orientation: 'landscape' })}
              >
                Paisagem
              </SegBtn>
              <SegBtn
                title="Retrato (vertical)"
                active={template.orientation === 'portrait'}
                onClick={() => onTemplateChange?.({ orientation: 'portrait' })}
              >
                Retrato
              </SegBtn>
            </Segmented>
          </Field>
        </Section>

        <Section title="Ações">
          <ActionBtn onClick={onSelectAll}>
            <Layers className="h-3.5 w-3.5" />
            <span>Selecionar todos ({template.elements_json.length})</span>
          </ActionBtn>
          <ActionBtn onClick={() => onAlignGroup('stack_column')}>
            <Sparkles className="h-3.5 w-3.5" />
            <span>Auto-organizar textos</span>
          </ActionBtn>
          <Help>
            Em textos e códigos de barras, use variáveis como {'{product_code}'}, {'{lot}'} e {'{barcode}'}: o sistema
            preenche ao gerar.
          </Help>
        </Section>
      </div>
    );
  }

  // Caso 3: exatamente um elemento selecionado
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

  const getElementTypeName = () => {
    switch (element.type) {
      case 'text':
        return 'Texto';
      case 'barcode':
        return 'Código de barras';
      case 'qrcode':
        return 'QR Code';
      case 'box':
        return 'Retângulo';
      case 'line':
        return 'Linha';
      case 'badge':
        return 'Selo';
      default:
        return 'Elemento';
    }
  };

  const hasContent =
    element.type === 'text' ||
    element.type === 'barcode' ||
    element.type === 'qrcode' ||
    element.type === 'badge';
  const hasAppearance = element.type === 'text' || element.type === 'barcode';

  const moreDataBtn = onOpenSystemVariablesModal && (
    <button
      type="button"
      onClick={onOpenSystemVariablesModal}
      className="text-[11px] text-zinc-500 hover:text-zinc-900 underline-offset-2 hover:underline cursor-pointer"
    >
      Mais dados
    </button>
  );

  return (
    <div className={panelCls}>
      <Header title={getElementTypeName()} subtitle="Elemento selecionado" titleHint={`ID: ${element.id}`}>
        <button
          type="button"
          onClick={() => onDuplicateElement(element.id)}
          title="Duplicar elemento"
          className={iconBtnCls}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDeleteElement(element.id)}
          title="Excluir elemento (Delete)"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-zinc-100 cursor-pointer transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </Header>

      {/* Conteúdo */}
      {element.type === 'text' && (
        <Section title="Conteúdo" defaultOpen>
          <Field label="Texto">
            <textarea
              rows={3}
              value={p.text || ''}
              onChange={(e) => handlePropChange('text', e.target.value)}
              placeholder="Digite o texto ou insira variáveis"
              className={areaCls}
            />
          </Field>
          <CampoPreencherEditor
            texto={(p.text || '') as string}
            rotulos={(p.rotulos || {}) as Record<string, string>}
            onChange={(texto, rotulos) => onUpdateProps(element.id, { ...p, text: texto, rotulos })}
          />
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-zinc-500">Inserir dado do sistema</span>
              {moreDataBtn}
            </div>
            <div className="flex flex-wrap gap-1">
              {getAllSystemVariables().slice(0, 10).map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token, 'text')}
                  className={chipCls}
                  title={`${v.label} (Ex: ${v.sample})`}
                >
                  +{v.token}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {element.type === 'barcode' && (
        <Section title="Conteúdo" defaultOpen>
          <Field label="Valor do código">
            <input
              type="text"
              value={p.value || ''}
              onChange={(e) => handlePropChange('value', e.target.value)}
              placeholder="Ex: {barcode}, {box_barcode}, 789..."
              className={`${inputCls} font-mono`}
            />
          </Field>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-zinc-500">Vincular código do sistema</span>
              {moreDataBtn}
            </div>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => handlePropChange('value', '{barcode}')} className={chipCls}>
                +{'{barcode}'} (EAN-13)
              </button>
              <button type="button" onClick={() => handlePropChange('value', '{box_barcode}')} className={chipCls}>
                +{'{box_barcode}'} (DUN-14)
              </button>
              <button type="button" onClick={() => handlePropChange('value', '{product_code}')} className={chipCls}>
                +{'{product_code}'}
              </button>
              <button type="button" onClick={() => handlePropChange('value', '{lot}')} className={chipCls}>
                +{'{lot}'}
              </button>
            </div>
          </div>
        </Section>
      )}

      {element.type === 'qrcode' && (
        <Section title="Conteúdo" defaultOpen>
          <Field label="Conteúdo do QR Code">
            <textarea
              rows={3}
              value={p.value || ''}
              onChange={(e) => handlePropChange('value', e.target.value)}
              placeholder="Texto, URL, lote ou dados estruturados"
              className={`${areaCls} font-mono`}
            />
          </Field>
        </Section>
      )}

      {element.type === 'badge' && (
        <Section title="Conteúdo" defaultOpen>
          <Field label="Texto do selo">
            <input
              type="text"
              value={p.text || ''}
              onChange={(e) => handlePropChange('text', e.target.value)}
              className={`${inputCls} uppercase`}
            />
          </Field>
        </Section>
      )}

      {/* Posição e tamanho */}
      <Section title="Posição e tamanho" defaultOpen={!hasContent}>
        <div className="grid grid-cols-2 gap-2">
          <MmInput
            label="X"
            min={0}
            max={labelWidth}
            value={element.x_mm}
            onChange={(v) => onUpdateElement(element.id, { x_mm: parseFloat(v) || 0 })}
          />
          <MmInput
            label="Y"
            min={0}
            max={labelHeight}
            value={element.y_mm}
            onChange={(v) => onUpdateElement(element.id, { y_mm: parseFloat(v) || 0 })}
          />
          <MmInput
            label="Largura"
            min={1}
            max={labelWidth}
            value={element.width_mm}
            onChange={(v) => onUpdateElement(element.id, { width_mm: Math.max(1, parseFloat(v) || 1) })}
          />
          <MmInput
            label="Altura"
            min={1}
            max={labelHeight}
            value={element.height_mm}
            onChange={(v) => onUpdateElement(element.id, { height_mm: Math.max(1, parseFloat(v) || 1) })}
          />
        </div>
      </Section>

      {/* Aparência */}
      {element.type === 'text' && (
        <Section title="Aparência">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tamanho (pt)">
              <input
                type="number"
                min="4"
                max="48"
                value={p.fontSize || 10}
                onChange={(e) => handlePropChange('fontSize', parseInt(e.target.value, 10) || 10)}
                className={`${inputCls} font-mono`}
              />
            </Field>
            <Field label="Peso">
              <select
                value={p.fontWeight || 'normal'}
                onChange={(e) => handlePropChange('fontWeight', e.target.value as TextFontWeight)}
                className={inputCls}
              >
                <option value="normal">Normal</option>
                <option value="500">Médio (500)</option>
                <option value="600">Semi-Bold (600)</option>
                <option value="bold">Negrito (Bold)</option>
                <option value="800">Extra Bold (800)</option>
              </select>
            </Field>
          </div>
          <Field label="Família">
            <select
              value={p.fontFamily || 'Inter'}
              onChange={(e) => handlePropChange('fontFamily', e.target.value as TextFontFamily)}
              className={inputCls}
            >
              <option value="Inter">Padrão (Inter)</option>
              <option value="JetBrains Mono">Mono (Código)</option>
              <option value="serif">Serifada</option>
            </select>
          </Field>
          <Field label="Alinhamento do texto">
            <Segmented cols={3}>
              <SegBtn
                title="Esquerda"
                active={(p.textAlign || 'left') === 'left'}
                onClick={() => handlePropChange('textAlign', 'left')}
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </SegBtn>
              <SegBtn
                title="Centralizado"
                active={p.textAlign === 'center'}
                onClick={() => handlePropChange('textAlign', 'center')}
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </SegBtn>
              <SegBtn
                title="Direita"
                active={p.textAlign === 'right'}
                onClick={() => handlePropChange('textAlign', 'right')}
              >
                <AlignRight className="h-3.5 w-3.5" />
              </SegBtn>
            </Segmented>
          </Field>
        </Section>
      )}

      {element.type === 'barcode' && (
        <Section title="Aparência">
          <Field label="Padrão / formato">
            <select
              value={p.format || 'code128'}
              onChange={(e) => handlePropChange('format', e.target.value as BarcodeFormat)}
              className={inputCls}
            >
              <option value="code128">Code 128 (Alfanumérico)</option>
              <option value="ean13">EAN-13 (13 dígitos)</option>
              <option value="code39">Code 39 (Industrial)</option>
            </select>
          </Field>
          <Field label="Tamanho do texto (pt)">
            <input
              type="number"
              min="5"
              max="14"
              value={p.fontSize || 7.5}
              onChange={(e) => handlePropChange('fontSize', parseFloat(e.target.value) || 7.5)}
              className={`${inputCls} font-mono`}
            />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={p.showText !== false}
              onChange={(e) => handlePropChange('showText', e.target.checked)}
              className="rounded border-zinc-300 accent-zinc-900"
            />
            <span className="text-xs text-zinc-700">Exibir número abaixo das barras</span>
          </label>
        </Section>
      )}

      {/* Alinhar na etiqueta */}
      <Section title="Alinhar na etiqueta">
        <Segmented cols={6}>
          <SegBtn title="Alinhar à esquerda" onClick={() => onAlignElement(element.id, 'left')}>
            <AlignLeft className="h-3.5 w-3.5" />
          </SegBtn>
          <SegBtn title="Centralizar horizontalmente" onClick={() => onAlignElement(element.id, 'center_h')}>
            <AlignCenter className="h-3.5 w-3.5" />
          </SegBtn>
          <SegBtn title="Alinhar à direita" onClick={() => onAlignElement(element.id, 'right')}>
            <AlignRight className="h-3.5 w-3.5" />
          </SegBtn>
          <SegBtn title="Alinhar ao topo" onClick={() => onAlignElement(element.id, 'top')}>
            <ArrowUp className="h-3.5 w-3.5" />
          </SegBtn>
          <SegBtn title="Centralizar verticalmente" onClick={() => onAlignElement(element.id, 'center_v')}>
            <ArrowDownUp className="h-3.5 w-3.5" />
          </SegBtn>
          <SegBtn title="Alinhar à base" onClick={() => onAlignElement(element.id, 'bottom')}>
            <ArrowDown className="h-3.5 w-3.5" />
          </SegBtn>
        </Segmented>
      </Section>
    </div>
  );
}
