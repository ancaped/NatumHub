import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Printer,
  Save,
  RotateCcw,
  RotateCw,
  Plus,
  Trash2,
  BookOpen,
  Search,
  ZoomIn,
  ZoomOut,
  Grid,
  Magnet,
  ArrowLeft,
  Check,
  Loader2,
  FilePlus2,
  Palette,
  Sparkles,
  Layers,
  Database,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { LabelElement, LabelTemplate } from '../etiquetas/lib/types';
import { DEFAULT_LABEL_TEMPLATES } from '../etiquetas/lib/defaultTemplates';
import LabelCanvas from '../etiquetas/components/LabelCanvas';
import ElementPropertiesPanel from '../etiquetas/components/ElementPropertiesPanel';
import ToolbarElements from '../etiquetas/components/ToolbarElements';
import PrintModal from '../etiquetas/components/PrintModal';
import PrintWithSystemDataModal from '../etiquetas/components/PrintWithSystemDataModal';
import SystemVariablesModal from '../etiquetas/components/SystemVariablesModal';
import ProductSearchModal from '../etiquetas/components/ProductSearchModal';
import TemplatesManagerModal from '../etiquetas/components/TemplatesManagerModal';
import { labelsApi, type CatalogProduct, type ProductionLot } from '../etiquetas/lib/labelsApi';
import type { SystemVariable } from '../etiquetas/lib/systemVariables';

interface EditorEtiquetasViewProps {
  onBackToHub?: () => void;
  initialTemplate?: LabelTemplate;
}

export default function EditorEtiquetasView({
  onBackToHub,
  initialTemplate,
}: EditorEtiquetasViewProps) {
  // Active template state
  const [template, setTemplate] = useState<LabelTemplate>(() => initialTemplate || DEFAULT_LABEL_TEMPLATES[0]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // History stack for Undo / Redo
  const [history, setHistory] = useState<LabelElement[][]>([template.elements_json]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // UI state
  const [zoomScale, setZoomScale] = useState<number>(1.25); // 125% default
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Real Data Preview Mode
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [productionLots, setProductionLots] = useState<ProductionLot[]>([]);
  const [selectedPreviewLot, setSelectedPreviewLot] = useState<ProductionLot | null>(null);
  const [selectedPreviewProduct, setSelectedPreviewProduct] = useState<CatalogProduct | null>(null);

  // Modals
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isSystemPrintModalOpen, setIsSystemPrintModalOpen] = useState(false);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState(false);
  const [isSystemVariablesModalOpen, setIsSystemVariablesModalOpen] = useState(false);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);

  const [saveAsName, setSaveAsName] = useState('');
  const [saveAsCategory, setSaveAsCategory] = useState('custom');

  // Load preview data from database
  useEffect(() => {
    labelsApi.listCatalogProducts().then((data) => {
      const items = Array.isArray(data) ? data : [];
      setCatalogProducts(items);
      if (items.length > 0) setSelectedPreviewProduct(items[0]);
    }).catch(console.warn);

    labelsApi.listProductionLots().then((data) => {
      const items = Array.isArray(data) ? data : [];
      setProductionLots(items);
      if (items.length > 0) setSelectedPreviewLot(items[0]);
    }).catch(console.warn);
  }, []);

  // Push new state to undo/redo history
  const pushHistoryState = useCallback(
    (newElements: LabelElement[]) => {
      setHistory((prev) => {
        const next = prev.slice(0, historyIndex + 1);
        return [...next, JSON.parse(JSON.stringify(newElements))];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  // Update elements
  const handleElementsChange = useCallback(
    (newElements: LabelElement[], recordHistory = true) => {
      setTemplate((prev) => ({
        ...prev,
        elements_json: newElements,
      }));

      if (recordHistory) {
        pushHistoryState(newElements);
      }
    },
    [pushHistoryState]
  );

  // Element Selection Handler
  const handleSelectElement = useCallback((id: string | null, isMulti = false) => {
    if (!id) {
      setSelectedIds([]);
      return;
    }
    if (isMulti) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelectedIds([id]);
    }
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(template.elements_json.map((el) => el.id));
  }, [template.elements_json]);

  // Update single element
  const handleUpdateElement = useCallback(
    (id: string, updates: Partial<LabelElement>, commitHistory = true) => {
      const nextElements = template.elements_json.map((el) => {
        if (el.id === id) {
          return {
            ...el,
            ...updates,
            props: {
              ...el.props,
              ...(updates.props || {}),
            },
          };
        }
        return el;
      });
      handleElementsChange(nextElements, commitHistory);
    },
    [template.elements_json, handleElementsChange]
  );

  // Update single element props
  const handleUpdateProps = useCallback(
    (id: string, newProps: Record<string, any>) => {
      const nextElements = template.elements_json.map((el) => {
        if (el.id === id) {
          return {
            ...el,
            props: {
              ...newProps,
            },
          };
        }
        return el;
      });
      handleElementsChange(nextElements, true);
    },
    [template.elements_json, handleElementsChange]
  );

  // Update multiple elements batch
  const handleUpdateMultipleElements = useCallback(
    (batch: { id: string; updates: Partial<LabelElement> }[], commitHistory = true) => {
      const map = new Map(batch.map((b) => [b.id, b.updates]));
      const nextElements = template.elements_json.map((el) => {
        if (map.has(el.id)) {
          const upd = map.get(el.id)!;
          return {
            ...el,
            ...upd,
            props: {
              ...el.props,
              ...(upd.props || {}),
            },
          };
        }
        return el;
      });
      handleElementsChange(nextElements, commitHistory);
    },
    [template.elements_json, handleElementsChange]
  );

  // Delete element
  const handleDeleteElement = useCallback(
    (id: string) => {
      const nextElements = template.elements_json.filter((el) => el.id !== id);
      handleElementsChange(nextElements, true);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    },
    [template.elements_json, handleElementsChange]
  );

  // Delete multiple elements
  const handleDeleteMultipleElements = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      const nextElements = template.elements_json.filter((el) => !set.has(el.id));
      handleElementsChange(nextElements, true);
      setSelectedIds((prev) => prev.filter((x) => !set.has(x)));
    },
    [template.elements_json, handleElementsChange]
  );

  // Duplicate element
  const handleDuplicateElement = useCallback(
    (id: string) => {
      const el = template.elements_json.find((item) => item.id === id);
      if (!el) return;
      const copy: LabelElement = {
        ...JSON.parse(JSON.stringify(el)),
        id: `elem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        x_mm: el.x_mm + 2,
        y_mm: el.y_mm + 2,
        zIndex: template.elements_json.length + 1,
      };
      const nextElements = [...template.elements_json, copy];
      handleElementsChange(nextElements, true);
      setSelectedIds([copy.id]);
    },
    [template.elements_json, handleElementsChange]
  );

  // Align single element
  const handleAlignElement = useCallback(
    (id: string, alignment: 'left' | 'center_h' | 'right' | 'top' | 'center_v' | 'bottom') => {
      const el = template.elements_json.find((item) => item.id === id);
      if (!el) return;

      const isPortrait = template.orientation === 'portrait';
      const labelW = isPortrait ? template.height_mm : template.width_mm;
      const labelH = isPortrait ? template.width_mm : template.height_mm;

      let newX = el.x_mm;
      let newY = el.y_mm;

      if (alignment === 'left') newX = 1;
      else if (alignment === 'center_h') newX = Math.max(0, (labelW - el.width_mm) / 2);
      else if (alignment === 'right') newX = Math.max(0, labelW - el.width_mm - 1);
      else if (alignment === 'top') newY = 1;
      else if (alignment === 'center_v') newY = Math.max(0, (labelH - el.height_mm) / 2);
      else if (alignment === 'bottom') newY = Math.max(0, labelH - el.height_mm - 1);

      handleUpdateElement(id, { x_mm: newX, y_mm: newY }, true);
    },
    [template, handleUpdateElement]
  );

  // Align Group
  const handleAlignGroup = useCallback(
    (
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
    ) => {
      const targets =
        selectedIds.length > 0
          ? template.elements_json.filter((el) => selectedIds.includes(el.id))
          : template.elements_json;

      if (targets.length === 0) return;

      if (alignment === 'stack_column') {
        const sorted = [...targets].sort((a, b) => a.y_mm - b.y_mm);
        let currY = 2;
        const updates = sorted.map((el) => {
          const u = { id: el.id, updates: { x_mm: 3, y_mm: currY } };
          currY += el.height_mm + 1.5;
          return u;
        });
        handleUpdateMultipleElements(updates, true);
        return;
      }

      if (alignment === 'left') {
        const minX = Math.min(...targets.map((el) => el.x_mm));
        handleUpdateMultipleElements(targets.map((el) => ({ id: el.id, updates: { x_mm: minX } })), true);
      } else if (alignment === 'top') {
        const minY = Math.min(...targets.map((el) => el.y_mm));
        handleUpdateMultipleElements(targets.map((el) => ({ id: el.id, updates: { y_mm: minY } })), true);
      } else if (alignment === 'center_h') {
        const minX = Math.min(...targets.map((el) => el.x_mm));
        const maxX = Math.max(...targets.map((el) => el.x_mm + el.width_mm));
        const mid = (minX + maxX) / 2;
        handleUpdateMultipleElements(
          targets.map((el) => ({ id: el.id, updates: { x_mm: Math.max(0, mid - el.width_mm / 2) } })),
          true
        );
      } else if (alignment === 'right') {
        const maxX = Math.max(...targets.map((el) => el.x_mm + el.width_mm));
        handleUpdateMultipleElements(
          targets.map((el) => ({ id: el.id, updates: { x_mm: maxX - el.width_mm } })),
          true
        );
      } else if (alignment === 'bottom') {
        const maxY = Math.max(...targets.map((el) => el.y_mm + el.height_mm));
        handleUpdateMultipleElements(
          targets.map((el) => ({ id: el.id, updates: { y_mm: maxY - el.height_mm } })),
          true
        );
      }
    },
    [selectedIds, template.elements_json, handleUpdateMultipleElements]
  );

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      const targetState = history[nextIdx];
      setHistoryIndex(nextIdx);
      setTemplate((prev) => ({
        ...prev,
        elements_json: JSON.parse(JSON.stringify(targetState)),
      }));
    }
  }, [history, historyIndex]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const targetState = history[nextIdx];
      setHistoryIndex(nextIdx);
      setTemplate((prev) => ({
        ...prev,
        elements_json: JSON.parse(JSON.stringify(targetState)),
      }));
    }
  }, [history, historyIndex]);

  // Add new element
  const handleAddElement = (newElement: LabelElement) => {
    const nextElements = [...template.elements_json, newElement];
    handleElementsChange(nextElements, true);
    setSelectedIds([newElement.id]);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          handleDeleteMultipleElements(selectedIds);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (selectedIds.length === 1) {
          handleDuplicateElement(selectedIds[0]);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsPrintModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedIds, handleDeleteMultipleElements, handleDuplicateElement]);

  // Insert Variable handlers
  const handleInsertVariableAsText = (v: SystemVariable) => {
    const newEl: LabelElement = {
      id: `txt_${Date.now()}`,
      type: 'text',
      x_mm: 5,
      y_mm: 10,
      width_mm: v.token.includes('name') ? 85 : 45,
      height_mm: v.token.includes('name') ? 7 : 5,
      zIndex: 10,
      props: {
        text: v.token,
        fontSize: v.token.includes('name') ? 10 : 8,
        fontWeight: v.token.includes('name') || v.token.includes('code') ? 'bold' : 'normal',
        fontFamily: v.token.includes('code') || v.token.includes('lot') ? 'JetBrains Mono' : 'Inter',
        textAlign: 'left',
        color: '#18181b',
        uppercase: true,
      },
    };
    handleAddElement(newEl);
  };

  const handleInsertVariableAsBarcode = (v: SystemVariable) => {
    const newEl: LabelElement = {
      id: `bar_${Date.now()}`,
      type: 'barcode',
      x_mm: 10,
      y_mm: 20,
      width_mm: 55,
      height_mm: 15,
      zIndex: 10,
      props: {
        value: v.token,
        format: v.token === '{barcode}' ? 'ean13' : 'code128',
        showText: true,
        fontSize: 7.5,
      },
    };
    handleAddElement(newEl);
  };

  const handleInsertVariableIntoActive = (token: string) => {
    if (selectedIds.length !== 1) return;
    const el = template.elements_json.find((item) => item.id === selectedIds[0]);
    if (!el) return;

    if (el.type === 'text' || el.type === 'badge') {
      const current = el.props?.text || '';
      handleUpdateProps(el.id, { text: current ? `${current} ${token}` : token });
    } else if (el.type === 'barcode' || el.type === 'qrcode') {
      handleUpdateProps(el.id, { value: token });
    }
  };

  // Build hydrated template for preview
  const displayTemplate = useMemo(() => {
    if (!previewMode) return template;

    const pCode = selectedPreviewLot?.codigo || selectedPreviewProduct?.codigo || '1.13.035';
    const pName = selectedPreviewLot?.descricao || selectedPreviewProduct?.descricao || 'MÁSCARA THERMO RESTORE 250G';
    const pLot = selectedPreviewLot?.lote || '15527';
    const pEan = selectedPreviewProduct?.codigo_barras || '7898553231964';
    const pDun = selectedPreviewProduct?.codigo_barras_caixa || `1${pEan.slice(0, 12)}`;
    const pBoxQty = `${selectedPreviewProduct?.quantidade_caixa || 12} un.`;
    const pFab = selectedPreviewLot?.data_producao || new Date().toLocaleDateString('pt-BR');
    const dVal = new Date();
    dVal.setFullYear(dVal.getFullYear() + 2);
    const pVal = dVal.toLocaleDateString('pt-BR');

    const hydratedElements = template.elements_json.map((el) => {
      const cloned = JSON.parse(JSON.stringify(el)) as LabelElement;

      if (cloned.type === 'text' || cloned.type === 'badge') {
        let text = (cloned.props.text || '') as string;
        text = text
          .replace(/{product_code}/g, pCode)
          .replace(/{product_name}/g, pName)
          .replace(/{lot}/g, pLot)
          .replace(/{manufacturing_date}/g, pFab)
          .replace(/{expiry_date}/g, pVal)
          .replace(/{barcode}/g, pEan)
          .replace(/{box_barcode}/g, pDun)
          .replace(/{box_qty}/g, pBoxQty)
          .replace(/{seq}/g, '01')
          .replace(/{total}/g, '60')
          .replace(/{box_sequence}/g, 'Caixa 01 de 60')
          .replace(/{company_name}/g, 'Nátum Cosméticos Ind. e Com. Ltda')
          .replace(/{brand_name}/g, 'NÁTUM COSMÉTICOS')
          .replace(/{company_cnpj}/g, '00.000.000/0001-00')
          .replace(/{company_city}/g, 'Franca - SP / Ind. Brasileira')
          .replace(/{company_sac}/g, 'sac@natumcosmeticos.com.br')
          .replace(/{date}/g, new Date().toLocaleDateString('pt-BR'));

        cloned.props.text = text;
      }

      if (cloned.type === 'barcode') {
        let val = (cloned.props.value || '') as string;
        if (val.includes('{barcode}')) val = pEan;
        else if (val.includes('{box_barcode}')) val = pDun;
        else if (val.includes('{product_code}')) val = pCode;
        else if (val.includes('{lot}')) val = pLot;
        cloned.props.value = val;
      }

      return cloned;
    });

    return {
      ...template,
      elements_json: hydratedElements,
    };
  }, [template, previewMode, selectedPreviewLot, selectedPreviewProduct]);

  // Save current template
  const handleSaveCurrent = async () => {
    try {
      setSaving(true);
      setStatusMessage(null);
      const saved = await labelsApi.saveTemplate(template);
      setTemplate(saved);
      setStatusMessage({ text: 'Modelo salvo com sucesso no catálogo!', type: 'success' });
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Erro ao salvar modelo.', type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Save as new template
  const handleSaveAsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveAsName.trim()) return;

    try {
      setSaving(true);
      const newTpl: Partial<LabelTemplate> = {
        name: saveAsName.trim(),
        description: template.description || 'Modelo personalizado criado pelo usuário.',
        category: saveAsCategory || 'custom',
        width_mm: template.width_mm,
        height_mm: template.height_mm,
        orientation: template.orientation,
        elements_json: template.elements_json,
        is_default: false,
      };

      const saved = await labelsApi.saveTemplate(newTpl);
      setTemplate(saved);
      setIsSaveAsModalOpen(false);
      setSaveAsName('');
      setStatusMessage({ text: `Modelo "${saved.name}" salvo com sucesso!`, type: 'success' });
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar novo modelo.');
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-100 overflow-hidden font-sans select-none">
      {/* Top Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-900 text-white rounded-2xl shadow-xs">
            <Palette className="h-5 w-5" />
          </div>

          <div>
            <h1 className="text-lg font-black text-zinc-900 tracking-tight flex items-center gap-2">
              <span>Editor de Etiquetas</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 font-bold border border-purple-200">
                Estúdio Visual
              </span>
            </h1>
            <p className="text-xs text-zinc-500">
              Criação, desenho e integração com dados reais em 100x50mm
            </p>
          </div>
        </div>

        {/* Live Preview Toggle & Actions */}
        <div className="flex items-center gap-2.5">
          {/* Preview with Real Data Toggle */}
          <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            <button
              type="button"
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                previewMode
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-700 hover:text-zinc-900 hover:bg-white'
              }`}
              title="Alternar entre visualização de tags {var} e dados reais da fábrica"
            >
              {previewMode ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span>{previewMode ? 'Prévia Real Ativa' : 'Ver com Dados Reais'}</span>
            </button>

            {previewMode && (
              <select
                value={selectedPreviewLot?.id || ''}
                onChange={(e) => {
                  const match = productionLots.find((l) => l.id === e.target.value);
                  if (match) setSelectedPreviewLot(match);
                }}
                className="text-[11px] font-bold font-mono bg-white border border-zinc-300 rounded-md px-2 py-1 focus:outline-none"
              >
                {productionLots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    Lote {lot.lote} — {lot.codigo}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsSystemVariablesModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
            title="Abrir Biblioteca de Dados do Sistema e Criar Variáveis"
          >
            <Database className="h-3.5 w-3.5" />
            <span>Biblioteca de Dados</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSaveAsName(`${template.name} (Cópia)`);
              setSaveAsCategory(template.category || 'custom');
              setIsSaveAsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span>Salvar Como</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSystemPrintModalOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-xs active:scale-98"
          >
            <Sparkles className="h-4 w-4" />
            <span>Imprimir com Auto-Fill</span>
          </button>

          <button
            type="button"
            onClick={handleSaveCurrent}
            disabled={saving}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-xs active:scale-98 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Salvar</span>
          </button>
        </div>
      </header>

      {/* Status Bar */}
      {statusMessage && (
        <div
          className={`mx-6 mt-3 p-3 rounded-xl border text-xs font-bold flex items-center justify-between animate-in fade-in duration-150 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="font-bold underline text-[11px] cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Main Studio Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <ToolbarElements
          onAddElement={handleAddElement}
          onOpenProductSearch={() => setIsProductSearchOpen(true)}
          onOpenTemplatesModal={() => setIsTemplatesModalOpen(true)}
          onOpenSystemVariablesModal={() => setIsSystemVariablesModalOpen(true)}
        />

        {/* Central Canvas Studio */}
        <div className="flex-1 flex flex-col bg-zinc-200/70 overflow-hidden relative">
          {/* Studio Top Control Bar */}
          <div className="bg-white border-b border-zinc-200 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex === 0}
                  className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-lg disabled:opacity-30 cursor-pointer transition-colors"
                  title="Desfazer (Ctrl+Z)"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-white rounded-lg disabled:opacity-30 cursor-pointer transition-colors"
                  title="Refazer (Ctrl+Y)"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>

              <div className="h-4 w-[1px] bg-zinc-200" />

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl text-xs font-bold text-zinc-700">
                <button
                  type="button"
                  onClick={() => setZoomScale((z) => Math.max(0.6, z - 0.15))}
                  className="p-1 hover:bg-white rounded-md cursor-pointer"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="px-1.5 font-mono">{Math.round(zoomScale * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoomScale((z) => Math.min(2.5, z + 0.15))}
                  className="p-1 hover:bg-white rounded-md cursor-pointer"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Grid & Snap */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowGrid(!showGrid)}
                  className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                    showGrid
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                  }`}
                  title="Alternar Grade Milimétrica"
                >
                  <Grid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-[11px]">Grade</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSnapToGrid(!snapToGrid)}
                  className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                    snapToGrid
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                  }`}
                  title="Alinhar Automaticamente à Grade"
                >
                  <Magnet className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-[11px]">Encaixe</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-700">{template.name}</span>
              <span className="text-[10px] font-mono bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md font-semibold">
                {template.width_mm}x{template.height_mm}mm ({template.orientation})
              </span>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 overflow-auto p-8 flex items-center justify-center">
            <LabelCanvas
              template={displayTemplate}
              selectedIds={selectedIds}
              onSelectElement={handleSelectElement}
              onUpdateElement={handleUpdateElement}
              onUpdateMultipleElements={handleUpdateMultipleElements}
              onDeleteElement={handleDeleteElement}
              onDeleteMultipleElements={handleDeleteMultipleElements}
              zoomScale={zoomScale}
              showGrid={showGrid}
              snapToGrid={snapToGrid}
            />
          </div>
        </div>

        {/* Right Properties Panel */}
        <ElementPropertiesPanel
          template={template}
          selectedIds={selectedIds}
          onSelectAll={handleSelectAll}
          onUpdateElement={handleUpdateElement}
          onUpdateProps={handleUpdateProps}
          onDeleteElement={handleDeleteElement}
          onDeleteMultipleElements={handleDeleteMultipleElements}
          onDuplicateElement={handleDuplicateElement}
          onAlignElement={handleAlignElement}
          onAlignGroup={handleAlignGroup}
          onTemplateChange={(updates) => setTemplate((prev) => ({ ...prev, ...updates }))}
          onOpenSystemVariablesModal={() => setIsSystemVariablesModalOpen(true)}
        />
      </div>

      {/* MODAL: System Variables Library */}
      <SystemVariablesModal
        isOpen={isSystemVariablesModalOpen}
        onClose={() => setIsSystemVariablesModalOpen(false)}
        onInsertAsText={handleInsertVariableAsText}
        onInsertAsBarcode={handleInsertVariableAsBarcode}
        onInsertIntoActiveElement={handleInsertVariableIntoActive}
        hasActiveElement={selectedIds.length === 1}
      />

      {/* MODAL: Product Search */}
      <ProductSearchModal
        isOpen={isProductSearchOpen}
        onClose={() => setIsProductSearchOpen(false)}
        onSelectProduct={(prod) => {
          setSelectedPreviewProduct(prod);
          setIsProductSearchOpen(false);
        }}
      />

      {/* MODAL: Templates Manager */}
      <TemplatesManagerModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        onSelectTemplate={(tpl) => {
          setTemplate(tpl);
          setIsTemplatesModalOpen(false);
        }}
      />

      {/* MODAL: Print with System Data */}
      <PrintWithSystemDataModal
        template={template}
        isOpen={isSystemPrintModalOpen}
        onClose={() => setIsSystemPrintModalOpen(false)}
      />

      {/* MODAL: Simple Quick Print */}
      <PrintModal
        template={template}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
      />

      {/* MODAL: Save As New Template */}
      {isSaveAsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-900">Salvar Como Novo Modelo</h3>
            <p className="text-xs text-zinc-500">
              Defina o nome e a categoria para classificar esta etiqueta na sidebar do Nexus.
            </p>

            <form onSubmit={handleSaveAsSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">Nome do Modelo:</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  className="w-full p-2.5 border border-zinc-300 rounded-xl focus:outline-none focus:border-zinc-900 font-bold text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">Categoria na Sidebar:</label>
                <select
                  value={saveAsCategory}
                  onChange={(e) => setSaveAsCategory(e.target.value)}
                  className="w-full p-2.5 border border-zinc-300 rounded-xl bg-zinc-50 font-bold text-zinc-900 text-xs focus:outline-none focus:border-zinc-900"
                >
                  <option value="expedicao">📦 Caixas / Volumes (DUN-14)</option>
                  <option value="producao">🧴 Produtos Acabados (EAN-13)</option>
                  <option value="estoque">🧪 Matérias-Primas</option>
                  <option value="embalagens">📦 Embalagens & Apoio</option>
                  <option value="qualidade">🛡️ Controle de Qualidade</option>
                  <option value="custom">⭐ Personalizada</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSaveAsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-5 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-xs active:scale-98 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Modelo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
