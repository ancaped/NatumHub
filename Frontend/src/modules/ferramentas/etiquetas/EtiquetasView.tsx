import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  SlidersHorizontal,
  FileSpreadsheet,
  Layers,
  Sparkles,
  FilePlus2,
} from 'lucide-react';
import type {
  LabelElement,
  LabelTemplate,
  LabelOrientation,
  CatalogSearchItem,
} from './lib/types';
import { LABEL_SIZE_PRESETS } from './lib/types';
import { DEFAULT_LABEL_TEMPLATES } from './lib/defaultTemplates';
import LabelCanvas from './components/LabelCanvas';
import ElementPropertiesPanel from './components/ElementPropertiesPanel';
import ToolbarElements from './components/ToolbarElements';
import PrintModal from './components/PrintModal';
import ProductSearchModal from './components/ProductSearchModal';
import TemplatesManagerModal from './components/TemplatesManagerModal';
import { apiJson } from '../../geral/lib/http';

interface EtiquetasViewProps {
  onBackToHub?: () => void;
}

const LOCAL_STORAGE_TEMPLATES_KEY = 'natumhub_saved_label_templates';

export default function EtiquetasView({ onBackToHub }: EtiquetasViewProps) {
  // Active template state
  const [template, setTemplate] = useState<LabelTemplate>(() => DEFAULT_LABEL_TEMPLATES[0]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // History stack for Undo / Redo
  const [history, setHistory] = useState<LabelElement[][]>([DEFAULT_LABEL_TEMPLATES[0].elements_json]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // UI state
  const [zoomScale, setZoomScale] = useState<number>(1.25); // 125% default
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isSaveAsModalOpen, setIsSaveAsModalOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');

  // Fetch saved templates from backend + localStorage fallback
  const loadSavedTemplates = useCallback(async () => {
    let apiList: LabelTemplate[] = [];
    try {
      const data = await apiJson<any[]>('/ferramentas/etiquetas/templates');
      if (Array.isArray(data)) {
        apiList = data.map((t) => ({
          id: String(t.id),
          name: t.name,
          description: t.description || undefined,
          category: t.category || 'custom',
          width_mm: Number(t.width_mm || t.widthMm || 100),
          height_mm: Number(t.height_mm || t.heightMm || 50),
          orientation: (t.orientation as LabelOrientation) || 'landscape',
          elements_json: Array.isArray(t.elements_json)
            ? t.elements_json
            : Array.isArray(t.elementsJson)
            ? t.elementsJson
            : [],
          is_default: Boolean(t.is_default || t.isDefault),
          created_at: t.created_at || t.createdAt,
          updated_at: t.updated_at || t.updatedAt,
        }));
      }
    } catch (e) {
      console.warn('Não foi possível carregar modelos salvos da API:', e);
    }

    // Check local storage backups
    try {
      const rawLocal = localStorage.getItem(LOCAL_STORAGE_TEMPLATES_KEY);
      if (rawLocal) {
        const localList: LabelTemplate[] = JSON.parse(rawLocal);
        if (Array.isArray(localList)) {
          const merged = [...apiList];
          for (const item of localList) {
            if (!merged.some((m) => m.id === item.id || m.name === item.name)) {
              merged.push(item);
            }
          }
          setSavedTemplates(merged);
          return;
        }
      }
    } catch (err) {
      console.warn('Erro ao ler localStorage:', err);
    }

    setSavedTemplates(apiList);
  }, []);

  useEffect(() => {
    loadSavedTemplates();
  }, [loadSavedTemplates]);

  // Save local backup
  const saveLocalBackup = (tpl: LabelTemplate) => {
    try {
      const rawLocal = localStorage.getItem(LOCAL_STORAGE_TEMPLATES_KEY);
      const list: LabelTemplate[] = rawLocal ? JSON.parse(rawLocal) : [];
      const filtered = list.filter((i) => i.id !== tpl.id);
      filtered.unshift(tpl);
      localStorage.setItem(LOCAL_STORAGE_TEMPLATES_KEY, JSON.stringify(filtered.slice(0, 50)));
    } catch (e) {
      console.warn('Erro ao salvar no localStorage:', e);
    }
  };

  // Push elements state to history
  const pushHistory = useCallback((newElements: LabelElement[]) => {
    setHistory((prev) => {
      const updated = prev.slice(0, historyIndex + 1);
      return [...updated, newElements];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevElements = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setTemplate((prev) => ({ ...prev, elements_json: prevElements }));
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextElements = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setTemplate((prev) => ({ ...prev, elements_json: nextElements }));
    }
  };

  // Selection handler (Single and Multi)
  const handleSelectElement = (id: string | null, isMulti = false) => {
    if (id === null) {
      setSelectedIds([]);
      return;
    }

    if (isMulti) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  };

  const handleSelectAll = () => {
    setSelectedIds(template.elements_json.map((el) => el.id));
  };

  // Create new blank model
  const handleNewBlankTemplate = () => {
    const blank: LabelTemplate = {
      id: `tpl_${Date.now()}`,
      name: 'Novo Modelo de Etiqueta',
      description: 'Modelo personalizado 100x50mm',
      category: 'custom',
      width_mm: 100,
      height_mm: 50,
      orientation: 'landscape',
      elements_json: [],
      is_default: false,
    };
    setTemplate(blank);
    setHistory([[]]);
    setHistoryIndex(0);
    setSelectedIds([]);
    setStatusMessage({ text: 'Novo modelo em branco criado!', type: 'success' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Element actions
  const handleUpdateElement = (id: string, updates: Partial<LabelElement>, commitHistory: boolean = true) => {
    setTemplate((prev) => {
      const updated = prev.elements_json.map((el) => {
        if (el.id === id) {
          return { ...el, ...updates };
        }
        return el;
      });
      if (commitHistory) {
        pushHistory(updated);
      }
      return { ...prev, elements_json: updated };
    });
  };

  const handleCommitHistory = () => {
    pushHistory(template.elements_json);
  };

  const handleUpdateProps = (id: string, newProps: Record<string, any>) => {
    const updated = template.elements_json.map((el) => {
      if (el.id === id) {
        return { ...el, props: newProps };
      }
      return el;
    });
    setTemplate((prev) => ({ ...prev, elements_json: updated }));
    pushHistory(updated);
  };

  const handleAddElement = (newEl: LabelElement) => {
    const updated = [...template.elements_json, newEl];
    setTemplate((prev) => ({ ...prev, elements_json: updated }));
    setSelectedIds([newEl.id]);
    pushHistory(updated);
  };

  const handleAddMultipleElements = (newElements: LabelElement[]) => {
    const updated = [...template.elements_json, ...newElements];
    setTemplate((prev) => ({ ...prev, elements_json: updated }));
    setSelectedIds(newElements.map((e) => e.id));
    pushHistory(updated);
  };

  const handleDeleteElement = (id: string) => {
    const updated = template.elements_json.filter((el) => el.id !== id);
    setTemplate((prev) => ({ ...prev, elements_json: updated }));
    setSelectedIds((prev) => prev.filter((item) => item !== id));
    pushHistory(updated);
  };

  const handleDeleteMultipleElements = (ids: string[]) => {
    const updated = template.elements_json.filter((el) => !ids.includes(el.id));
    setTemplate((prev) => ({ ...prev, elements_json: updated }));
    setSelectedIds([]);
    pushHistory(updated);
  };

  const handleDuplicateElement = (id: string) => {
    const source = template.elements_json.find((el) => el.id === id);
    if (!source) return;

    const copy: LabelElement = {
      ...source,
      id: `${source.type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      x_mm: Math.min(source.x_mm + 3, template.width_mm - source.width_mm),
      y_mm: Math.min(source.y_mm + 3, template.height_mm - source.height_mm),
      props: JSON.parse(JSON.stringify(source.props)),
    };

    const updated = [...template.elements_json, copy];
    setTemplate((prev) => ({ ...prev, elements_json: updated }));
    setSelectedIds([copy.id]);
    pushHistory(updated);
  };

  // Alignment of single element to label canvas
  const handleAlignElement = (
    id: string,
    alignment: 'left' | 'center_h' | 'right' | 'top' | 'center_v' | 'bottom'
  ) => {
    const el = template.elements_json.find((item) => item.id === id);
    if (!el) return;

    const isPortrait = template.orientation === 'portrait';
    const labelW = isPortrait ? template.height_mm : template.width_mm;
    const labelH = isPortrait ? template.width_mm : template.height_mm;

    let newX = el.x_mm;
    let newY = el.y_mm;

    if (alignment === 'left') newX = 1;
    else if (alignment === 'center_h') newX = Math.round(((labelW - el.width_mm) / 2) * 10) / 10;
    else if (alignment === 'right') newX = labelW - el.width_mm - 1;
    else if (alignment === 'top') newY = 1;
    else if (alignment === 'center_v') newY = Math.round(((labelH - el.height_mm) / 2) * 10) / 10;
    else if (alignment === 'bottom') newY = labelH - el.height_mm - 1;

    handleUpdateElement(id, { x_mm: Math.max(0, newX), y_mm: Math.max(0, newY) });
  };

  // Multi-element group alignment & smart distribution
  const handleAlignGroup = (
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
    const targets = template.elements_json.filter((el) =>
      selectedIds.length > 0 ? selectedIds.includes(el.id) : el.type === 'text'
    );

    if (targets.length < 2 && alignment !== 'stack_column') return;

    const isPortrait = template.orientation === 'portrait';
    const labelW = isPortrait ? template.height_mm : template.width_mm;
    const labelH = isPortrait ? template.width_mm : template.height_mm;

    const updatedElements = template.elements_json.map((el) => ({ ...el }));

    if (alignment === 'left') {
      const minX = Math.min(...targets.map((e) => e.x_mm));
      updatedElements.forEach((el) => {
        if (targets.some((t) => t.id === el.id)) {
          el.x_mm = minX;
        }
      });
    } else if (alignment === 'center_h') {
      const minX = Math.min(...targets.map((e) => e.x_mm));
      const maxRight = Math.max(...targets.map((e) => e.x_mm + e.width_mm));
      const groupCenterX = (minX + maxRight) / 2;
      updatedElements.forEach((el) => {
        if (targets.some((t) => t.id === el.id)) {
          el.x_mm = Math.max(0, Math.round((groupCenterX - el.width_mm / 2) * 10) / 10);
        }
      });
    } else if (alignment === 'right') {
      const maxRight = Math.max(...targets.map((e) => e.x_mm + e.width_mm));
      updatedElements.forEach((el) => {
        if (targets.some((t) => t.id === el.id)) {
          el.x_mm = Math.max(0, maxRight - el.width_mm);
        }
      });
    } else if (alignment === 'top') {
      const minY = Math.min(...targets.map((e) => e.y_mm));
      updatedElements.forEach((el) => {
        if (targets.some((t) => t.id === el.id)) {
          el.y_mm = minY;
        }
      });
    } else if (alignment === 'center_v') {
      const minY = Math.min(...targets.map((e) => e.y_mm));
      const maxBottom = Math.max(...targets.map((e) => e.y_mm + e.height_mm));
      const groupCenterY = (minY + maxBottom) / 2;
      updatedElements.forEach((el) => {
        if (targets.some((t) => t.id === el.id)) {
          el.y_mm = Math.max(0, Math.round((groupCenterY - el.height_mm / 2) * 10) / 10);
        }
      });
    } else if (alignment === 'bottom') {
      const maxBottom = Math.max(...targets.map((e) => e.y_mm + e.height_mm));
      updatedElements.forEach((el) => {
        if (targets.some((t) => t.id === el.id)) {
          el.y_mm = Math.max(0, maxBottom - el.height_mm);
        }
      });
    } else if (alignment === 'distribute_v') {
      const sorted = [...targets].sort((a, b) => a.y_mm - b.y_mm);
      const topY = sorted[0].y_mm;
      const bottomY = sorted[sorted.length - 1].y_mm + sorted[sorted.length - 1].height_mm;
      const totalElementsHeight = sorted.reduce((sum, e) => sum + e.height_mm, 0);
      const availableSpace = bottomY - topY - totalElementsHeight;
      const gap = Math.max(0.5, availableSpace / (sorted.length - 1));

      let currentY = topY;
      sorted.forEach((item) => {
        const found = updatedElements.find((e) => e.id === item.id);
        if (found) {
          found.y_mm = Math.round(currentY * 10) / 10;
          currentY += found.height_mm + gap;
        }
      });
    } else if (alignment === 'distribute_h') {
      const sorted = [...targets].sort((a, b) => a.x_mm - b.x_mm);
      const leftX = sorted[0].x_mm;
      const rightX = sorted[sorted.length - 1].x_mm + sorted[sorted.length - 1].width_mm;
      const totalElementsWidth = sorted.reduce((sum, e) => sum + e.width_mm, 0);
      const availableSpace = rightX - leftX - totalElementsWidth;
      const gap = Math.max(0.5, availableSpace / (sorted.length - 1));

      let currentX = leftX;
      sorted.forEach((item) => {
        const found = updatedElements.find((e) => e.id === item.id);
        if (found) {
          found.x_mm = Math.round(currentX * 10) / 10;
          currentX += found.width_mm + gap;
        }
      });
    } else if (alignment === 'same_width') {
      const maxW = Math.max(...targets.map((e) => e.width_mm));
      updatedElements.forEach((el) => {
        if (targets.some((t) => t.id === el.id)) {
          el.width_mm = maxW;
        }
      });
    } else if (alignment === 'same_height') {
      const maxH = Math.max(...targets.map((e) => e.height_mm));
      updatedElements.forEach((el) => {
        if (targets.some((t) => t.id === el.id)) {
          el.height_mm = maxH;
        }
      });
    } else if (alignment === 'stack_column') {
      const sorted = [...targets].sort((a, b) => a.y_mm - b.y_mm);
      const minX = Math.min(...sorted.map((e) => e.x_mm));
      let currentY = sorted[0]?.y_mm || 5;

      sorted.forEach((item) => {
        const found = updatedElements.find((e) => e.id === item.id);
        if (found) {
          found.x_mm = minX;
          found.y_mm = Math.round(currentY * 10) / 10;
          currentY += found.height_mm + 2; // 2mm gap between lines
        }
      });
    }

    setTemplate((prev) => ({ ...prev, elements_json: updatedElements }));
    pushHistory(updatedElements);
  };

  // Dimension presets handler
  const handleSelectSizePreset = (presetId: string) => {
    const preset = LABEL_SIZE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setTemplate((prev) => ({
      ...prev,
      width_mm: preset.width_mm,
      height_mm: preset.height_mm,
    }));
  };

  // Product Autofill handler
  const handleSelectProduct = (item: CatalogSearchItem) => {
    let replacedName = false;
    let replacedBarcode = false;
    let replacedCode = false;

    const updated = template.elements_json.map((el) => {
      // If text contains "NOME" or is heading, replace with product name
      if (el.type === 'text' && !replacedName && (el.props.fontSize >= 10 || el.props.fontWeight === '800')) {
        replacedName = true;
        return {
          ...el,
          props: { ...el.props, text: item.name },
        };
      }

      // If text contains "CÓDIGO" or "MP-" or "EMB-", replace code
      if (el.type === 'text' && !replacedCode && (el.props.text.includes('CÓDIGO') || el.props.text.includes('CÓD'))) {
        replacedCode = true;
        return {
          ...el,
          props: { ...el.props, text: `CÓDIGO: ${item.code}` },
        };
      }

      // If barcode, update value
      if (el.type === 'barcode' && !replacedBarcode) {
        replacedBarcode = true;
        const format = item.barcode && /^\d{12,13}$/.test(item.barcode) ? 'ean13' : 'code128';
        return {
          ...el,
          props: {
            ...el.props,
            value: item.barcode || item.code,
            format,
          },
        };
      }

      return el;
    });

    // If no text or barcode was found, add them
    if (!replacedName) {
      updated.push({
        id: `txt_${Date.now()}`,
        type: 'text',
        x_mm: 5,
        y_mm: 10,
        width_mm: 60,
        height_mm: 8,
        zIndex: 10,
        props: {
          text: item.name,
          fontSize: 10,
          fontWeight: 'bold',
          fontFamily: 'Inter',
          textAlign: 'left',
          color: '#18181b',
          uppercase: true,
        },
      });
    }

    setTemplate((prev) => ({
      ...prev,
      name: `Etiqueta - ${item.name}`,
      elements_json: updated,
    }));
    pushHistory(updated);

    setStatusMessage({
      text: `Dados do item "${item.name}" aplicados com sucesso!`,
      type: 'success',
    });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Save template to backend (supports creating or updating)
  const handleSaveTemplate = async () => {
    setSaving(true);
    try {
      const isCustomSaved = savedTemplates.some((t) => t.id === template.id);

      if (isCustomSaved) {
        await apiJson(`/ferramentas/etiquetas/templates/${template.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: template.name,
            description: template.description || null,
            category: template.category || 'custom',
            width_mm: template.width_mm,
            height_mm: template.height_mm,
            orientation: template.orientation,
            elements_json: template.elements_json,
          }),
        });
        saveLocalBackup(template);
        setStatusMessage({ text: 'Modelo atualizado com sucesso!', type: 'success' });
      } else {
        const created = await apiJson<any>('/ferramentas/etiquetas/templates', {
          method: 'POST',
          body: JSON.stringify({
            name: template.name,
            description: template.description || null,
            category: template.category || 'custom',
            width_mm: template.width_mm,
            height_mm: template.height_mm,
            orientation: template.orientation,
            elements_json: template.elements_json,
          }),
        });
        const savedObj = {
          ...template,
          id: created?.id ? String(created.id) : template.id,
        };
        if (created?.id) {
          setTemplate(savedObj);
        }
        saveLocalBackup(savedObj);
        setStatusMessage({ text: 'Novo modelo salvo com sucesso!', type: 'success' });
      }
      loadSavedTemplates();
    } catch (e: any) {
      console.error('Erro ao salvar template:', e);
      saveLocalBackup(template);
      setStatusMessage({
        text: `Salvo localmente. (${e?.message || 'Servidor indisponível'})`,
        type: 'success',
      });
      loadSavedTemplates();
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleSaveAsNew = async () => {
    if (!saveAsName.trim()) return;
    setSaving(true);
    try {
      const created = await apiJson<any>('/ferramentas/etiquetas/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: saveAsName.trim(),
          description: `Criado a partir de ${template.name}`,
          category: template.category || 'custom',
          width_mm: template.width_mm,
          height_mm: template.height_mm,
          orientation: template.orientation,
          elements_json: template.elements_json,
        }),
      });
      const newId = created?.id ? String(created.id) : `local_${Date.now()}`;
      const newTemplate: LabelTemplate = {
        ...template,
        id: newId,
        name: saveAsName.trim(),
      };
      setTemplate(newTemplate);
      saveLocalBackup(newTemplate);
      setIsSaveAsModalOpen(false);
      setSaveAsName('');
      setStatusMessage({ text: `Modelo "${saveAsName.trim()}" criado com sucesso!`, type: 'success' });
      loadSavedTemplates();
    } catch (e: any) {
      console.error('Erro ao salvar novo modelo:', e);
      const newId = `local_${Date.now()}`;
      const newTemplate: LabelTemplate = {
        ...template,
        id: newId,
        name: saveAsName.trim(),
      };
      setTemplate(newTemplate);
      saveLocalBackup(newTemplate);
      setIsSaveAsModalOpen(false);
      setSaveAsName('');
      setStatusMessage({ text: `Modelo criado e salvo localmente!`, type: 'success' });
      loadSavedTemplates();
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleDeleteSavedTemplate = async (id: string) => {
    try {
      await apiJson(`/ferramentas/etiquetas/templates/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Erro ao excluir do servidor:', e);
    }
    // Also remove from localStorage
    try {
      const rawLocal = localStorage.getItem(LOCAL_STORAGE_TEMPLATES_KEY);
      if (rawLocal) {
        const list: LabelTemplate[] = JSON.parse(rawLocal);
        localStorage.setItem(LOCAL_STORAGE_TEMPLATES_KEY, JSON.stringify(list.filter((i) => i.id !== id)));
      }
    } catch (e) {}

    loadSavedTemplates();
    setStatusMessage({ text: 'Modelo excluído com sucesso.', type: 'success' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-zinc-100 font-sans text-zinc-900">
      {/* Top Navbar */}
      <header className="h-14 border-b border-zinc-200 bg-white px-4 flex items-center justify-between shrink-0 shadow-xs z-30">
        {/* Left: Back & Template Title */}
        <div className="flex items-center gap-3">
          {onBackToHub && (
            <button
              onClick={onBackToHub}
              className="p-2 border border-zinc-200 hover:bg-zinc-100 rounded-xl text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer"
              title="Voltar ao Início"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={template.name}
              onChange={(e) => setTemplate((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Nome do Modelo de Etiqueta"
              className="font-bold text-sm text-zinc-900 border border-transparent hover:border-zinc-200 focus:border-zinc-400 focus:bg-white rounded-lg px-2.5 py-1 focus:outline-none transition-all w-64 truncate"
            />
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-md border border-zinc-200">
              {template.orientation === 'portrait' ? template.height_mm : template.width_mm} x{' '}
              {template.orientation === 'portrait' ? template.width_mm : template.height_mm} mm
            </span>

            <button
              onClick={handleNewBlankTemplate}
              title="Criar Novo Modelo em Branco"
              className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100/80 border border-blue-200 font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              <span>Novo</span>
            </button>
          </div>
        </div>

        {/* Center: Dimensions, Orientation & Zoom */}
        <div className="flex items-center gap-2">
          {/* Dimension Presets */}
          <select
            onChange={(e) => handleSelectSizePreset(e.target.value)}
            value={
              LABEL_SIZE_PRESETS.find(
                (p) => p.width_mm === template.width_mm && p.height_mm === template.height_mm
              )?.id || 'custom'
            }
            className="text-xs font-semibold border border-zinc-200 rounded-xl px-3 py-1.5 bg-white text-zinc-700 focus:outline-none focus:border-zinc-900 cursor-pointer shadow-2xs"
          >
            {LABEL_SIZE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          {/* Orientation */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTemplate((prev) => ({ ...prev, orientation: 'landscape' }))}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                template.orientation === 'landscape'
                  ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Horizontal
            </button>
            <button
              type="button"
              onClick={() => setTemplate((prev) => ({ ...prev, orientation: 'portrait' }))}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                template.orientation === 'portrait'
                  ? 'bg-white text-zinc-900 shadow-2xs font-bold'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Vertical
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-200 mx-1" />

          {/* Undo / Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={historyIndex === 0}
              title="Desfazer (Ctrl+Z)"
              className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              title="Refazer (Ctrl+Y)"
              className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-200 mx-1" />

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-xl px-1.5 py-0.5">
            <button
              onClick={() => setZoomScale((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
              title="Diminuir Zoom"
              className="p-1 text-zinc-500 hover:text-zinc-900 rounded cursor-pointer"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-mono font-bold text-zinc-700 min-w-11 text-center">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
              title="Aumentar Zoom"
              className="p-1 text-zinc-500 hover:text-zinc-900 rounded cursor-pointer"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Grid & Magnet */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowGrid(!showGrid)}
              title={showGrid ? 'Ocultar Grade' : 'Exibir Grade'}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                showGrid ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-zinc-200 text-zinc-400 hover:bg-zinc-50'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSnapToGrid(!snapToGrid)}
              title={snapToGrid ? 'Guias Magnéticas & Grade 1mm Ativas' : 'Ajuste Livre'}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                snapToGrid ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-zinc-200 text-zinc-400 hover:bg-zinc-50'
              }`}
            >
              <Magnet className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Save & Print Buttons */}
        <div className="flex items-center gap-2">
          {statusMessage && (
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-lg animate-in fade-in duration-200 ${
                statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {statusMessage.text}
            </span>
          )}

          <button
            onClick={() => {
              setSaveAsName(template.name);
              setIsSaveAsModalOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs text-zinc-700 font-semibold border border-zinc-200 hover:bg-zinc-50 px-3 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <span>Salvar como...</span>
          </button>

          <button
            onClick={handleSaveTemplate}
            disabled={saving}
            className="flex items-center gap-1.5 bg-white border border-zinc-300 hover:border-zinc-400 text-zinc-900 font-bold px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-2xs"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Salvar</span>
          </button>

          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm active:scale-98"
          >
            <Printer className="h-4 w-4" />
            <span>Imprimir Etiquetas</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Toolbar with Elements & Presets */}
        <ToolbarElements
          onAddElement={handleAddElement}
          onAddMultipleElements={handleAddMultipleElements}
          onOpenProductSearch={() => setIsProductSearchOpen(true)}
          onOpenTemplatesModal={() => setIsTemplatesModalOpen(true)}
        />

        {/* Center: Interactive Label Canvas */}
        <LabelCanvas
          template={template}
          selectedIds={selectedIds}
          onSelectElement={handleSelectElement}
          onUpdateElement={handleUpdateElement}
          onDeleteElement={handleDeleteElement}
          onDeleteMultipleElements={handleDeleteMultipleElements}
          onCommitHistory={handleCommitHistory}
          zoomScale={zoomScale}
          showGrid={showGrid}
          snapToGrid={snapToGrid}
        />

        {/* Right: Properties Inspector Panel */}
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
        />
      </div>

      {/* Print Modal */}
      <PrintModal
        template={template}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
      />

      {/* Catalog Search Modal */}
      <ProductSearchModal
        isOpen={isProductSearchOpen}
        onClose={() => setIsProductSearchOpen(false)}
        onSelectProduct={handleSelectProduct}
      />

      {/* Templates Gallery Modal */}
      <TemplatesManagerModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        savedTemplates={savedTemplates}
        activeTemplateId={template.id}
        onSelectTemplate={(t) => {
          setTemplate(t);
          setHistory([t.elements_json]);
          setHistoryIndex(0);
          setSelectedIds([]);
        }}
        onNewBlankTemplate={handleNewBlankTemplate}
        onDeleteTemplate={handleDeleteSavedTemplate}
        onDuplicateTemplate={(t) => {
          const dup: LabelTemplate = {
            ...t,
            id: `tpl_${Date.now()}`,
            name: `${t.name} (Cópia)`,
            is_default: false,
          };
          setTemplate(dup);
          setHistory([dup.elements_json]);
          setHistoryIndex(0);
        }}
        onImportTemplate={(t) => {
          setTemplate(t);
          setHistory([t.elements_json]);
          setHistoryIndex(0);
        }}
      />

      {/* Save As Modal */}
      {isSaveAsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md p-6 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900">Salvar Modelo com Novo Nome</h3>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Nome do Modelo:</label>
              <input
                type="text"
                autoFocus
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                placeholder="Ex: Etiqueta Lote Produção 100x50"
                className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs focus:outline-none focus:border-zinc-900"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSaveAsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAsNew}
                disabled={saving || !saveAsName.trim()}
                className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Salvar Modelo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
