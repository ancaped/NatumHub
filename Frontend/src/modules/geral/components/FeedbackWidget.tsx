import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Bug, MessageSquare, X, Upload, Camera,
  Send, Sparkles, Check,
  ArrowLeft, Search, MessageCircle, ListFilter,
  Crosshair, Target, ChevronDown, Clock, RotateCcw
} from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { api } from '../lib/api';
import { apiJson } from '../lib/http';
import { getLogs } from '../lib/logInterceptor';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { buildFeedbackPagePath, splitFeedbackPagePath } from '../lib/viewLabels';
import { MODULE_CATALOG, resolveCatalogItem, type ModuleCatalogItem } from '../lib/moduloCatalog';
import type { AuthUser } from '../lib/auth';

interface FeedbackWidgetProps {
  currentView?: string;
  visible?: boolean;
  currentUser?: AuthUser | null;
  setView?: (view: string) => void;
}

interface FeedbackItem {
  id: string;
  feedbackType: string;
  description: string;
  page: string;
  status: string;
  createdAt?: string;
  resolvedAt?: string;
  requestedBy?: string;
  priority?: number;
  adminNotes?: string;
  hasLogs?: boolean;
  hasScreenshot?: boolean;
  notesCount?: number;
}

interface FeedbackNote {
  id: string;
  feedbackId: string;
  author: string;
  body: string;
  createdAt: string;
}

interface FeedbackDetailData extends FeedbackItem {
  logs?: string;
  screenshot?: string;
  notes: FeedbackNote[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  queued: 'Na Fila',
  in_progress: 'Em Andamento',
  awaiting_review: 'Aguardando Aprovação',
  resolved: 'Resolvido',
  wont_fix: 'Não será feito',
};

function getElementDescription(el: HTMLElement): { label: string; selector: string; textSnippet?: string } {
  const aria = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder');
  const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  
  const tag = el.tagName.toLowerCase();
  let typeDesc = tag;
  if (tag === 'button') typeDesc = 'Botão';
  else if (tag === 'input') typeDesc = `Campo (${el.getAttribute('type') || 'texto'})`;
  else if (tag === 'select') typeDesc = 'Seleção';
  else if (tag === 'img') typeDesc = 'Imagem / Logo';
  else if (tag === 'table' || el.closest('table')) typeDesc = 'Tabela';
  else if (tag === 'header' || el.closest('header')) typeDesc = 'Cabeçalho / TopBar';
  else if (tag === 'nav' || el.closest('nav')) typeDesc = 'Navegação / Menu';
  else if (tag === 'a') typeDesc = 'Link / Menu';
  else if (tag === 'h1' || tag === 'h2' || tag === 'h3') typeDesc = 'Título';
  else if (el.closest('[role="dialog"]')) typeDesc = 'Modal / Gaveta';

  let context = '';
  if (el.closest('.topbar') || el.closest('header')) context = 'Menu Superior';
  else if (el.closest('aside') || el.closest('.sidebar')) context = 'Barra Lateral';
  else if (el.closest('.table-container') || el.closest('table')) context = 'Tabela de Dados';
  else if (el.closest('.drawer-panel') || el.closest('[data-drawer]')) context = 'Gaveta Lateral (Drawer)';

  let label = aria || text;
  if (!label && tag === 'img') {
    label = el.getAttribute('alt') || 'Logo';
  }
  if (!label) {
    label = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : tag;
  }

  const finalLabel = context ? `${context} > ${typeDesc} "${label}"` : `${typeDesc} "${label}"`;

  let selector = tag;
  if (el.id) selector = `#${el.id}`;
  else if (el.className && typeof el.className === 'string') {
    const firstClass = el.className.split(' ').filter(c => c && !c.includes(':') && !c.includes('/') && !c.includes('[')).slice(0, 2).join('.');
    if (firstClass) selector = `${tag}.${firstClass}`;
  }

  return {
    label: finalLabel,
    selector,
    textSnippet: text || undefined,
  };
}

export function FeedbackWidget({ currentView, visible = false, currentUser }: FeedbackWidgetProps) {
  const isSupervisor = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';

  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  // Auto-ocultação do botão flutuante para a borda após inatividade (apenas quando fechado)
  useEffect(() => {
    if (isOpen) {
      setCollapsed(false);
      return;
    }
    let timeout: any;
    const handleActivity = () => {
      setCollapsed(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        setCollapsed(true);
      }, 5000);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    timeout = setTimeout(() => setCollapsed(true), 5000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      clearTimeout(timeout);
    };
  }, [isOpen]);

  // Estado Feedback/Bug
  const [feedbackMode, setFeedbackMode] = useState<'form' | 'list' | 'detail'>('form');
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feedback'>('bug');
  const [selectedModuleKey, setSelectedModuleKey] = useState<string>('');
  const [module, setModule] = useState('Geral');
  const [subPage, setSubPage] = useState('');
  const [detectedFromView, setDetectedFromView] = useState(false);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string>('');
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Dropdown customizado de módulos (com filtro e sem fechar inesperadamente)
  const [isModuleDropdownOpen, setIsModuleDropdownOpen] = useState(false);
  const [moduleSearchFilter, setModuleSearchFilter] = useState('');
  const moduleDropdownRef = useRef<HTMLDivElement>(null);

  // Modo Inspetor / Apontar Elemento na Tela
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectedElement, setInspectedElement] = useState<{
    label: string;
    selector: string;
    textSnippet?: string;
  } | null>(null);
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string>('');

  // Fechar dropdown de módulo ao clicar fora
  useEffect(() => {
    if (!isModuleDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moduleDropdownRef.current && !moduleDropdownRef.current.contains(e.target as Node)) {
        setIsModuleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModuleDropdownOpen]);

  // Lógica do Modo Inspetor de Elementos
  useEffect(() => {
    if (!isInspecting) {
      setHoveredRect(null);
      setHoveredLabel('');
      return;
    }

    const handlePointerMove = (e: MouseEvent) => {
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('.feedback-widget-container') ||
        target.closest('.feedback-widget-trigger') ||
        target.closest('#inspector-banner')
      ) {
        setHoveredRect(null);
        setHoveredLabel('');
        return;
      }
      const rect = target.getBoundingClientRect();
      setHoveredRect(rect);
      const info = getElementDescription(target);
      setHoveredLabel(info.label);
    };

    const handleClick = (e: MouseEvent) => {
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('.feedback-widget-container') ||
        target.closest('.feedback-widget-trigger') ||
        target.closest('#inspector-banner')
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const info = getElementDescription(target);
      setInspectedElement(info);

      setDescription((prev) => {
        const tag = `[Elemento apontado: ${info.label}]`;
        if (prev.includes(tag)) return prev;
        return prev ? `${prev}\n\n${tag}` : tag;
      });

      setIsInspecting(false);
      setHoveredRect(null);
      setHoveredLabel('');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsInspecting(false);
        setHoveredRect(null);
        setHoveredLabel('');
      }
    };

    window.addEventListener('mousemove', handlePointerMove, true);
    window.addEventListener('click', handleClick, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove, true);
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isInspecting]);

  const catalogGroups = useMemo(() => {
    const acc: Record<string, ModuleCatalogItem[]> = {};
    for (const item of MODULE_CATALOG) {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
    }
    return acc;
  }, []);

  const filteredCatalogGroups = useMemo(() => {
    const q = moduleSearchFilter.trim().toLowerCase();
    const acc: Record<string, ModuleCatalogItem[]> = {};
    for (const item of MODULE_CATALOG) {
      if (!q || item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q) || item.key.toLowerCase().includes(q)) {
        if (!acc[item.group]) acc[item.group] = [];
        acc[item.group].push(item);
      }
    }
    return Object.entries(acc);
  }, [moduleSearchFilter]);

  const currentCatalogItem = useMemo(() => {
    return MODULE_CATALOG.find((m) => m.key === selectedModuleKey);
  }, [selectedModuleKey]);

  // Lista e Detalhes de Feedbacks
  const [feedbacksList, setFeedbacksList] = useState<FeedbackItem[]>([]);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackDetailData | null>(null);
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackFilterStatus, setFeedbackFilterStatus] = useState<string>('ALL');
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const notesBottomRef = useRef<HTMLDivElement>(null);

  // Sincronizar contexto da página atual com módulo e submódulo canônicos
  useEffect(() => {
    if (currentView) {
      const catalogItem = resolveCatalogItem(currentView);
      if (catalogItem) {
        setSelectedModuleKey(catalogItem.key);
        setModule(catalogItem.label);
        setDetectedFromView(true);
        const full = buildFeedbackPagePath(currentView);
        const { subPage: s } = splitFeedbackPagePath(full);
        setSubPage(s || catalogItem.subPages[0] || '');
      } else {
        const full = buildFeedbackPagePath(currentView);
        const { module: m, subPage: s } = splitFeedbackPagePath(full);
        setSelectedModuleKey(currentView);
        setModule(m);
        setSubPage(s);
        setDetectedFromView(Boolean(currentView && currentView !== 'hub'));
      }
    }
  }, [currentView]);

  // Carregar lista de feedbacks
  const loadFeedbacksList = useCallback(async () => {
    try {
      const res = await apiJson<FeedbackItem[]>('/api/hub/feedbacks');
      if (Array.isArray(res)) {
        setFeedbacksList(res);
      }
    } catch (e) {
      console.error('Erro ao carregar feedbacks:', e);
    }
  }, []);

  // Carregar detalhes de um feedback
  const loadFeedbackDetail = async (id: string) => {
    try {
      const res = await apiJson<FeedbackDetailData>(`/api/hub/feedbacks/${id}`);
      if (res) {
        setSelectedFeedback(res);
        setFeedbackMode('detail');
      }
    } catch (e) {
      console.error('Erro ao carregar detalhes do feedback:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFeedbacksList();
    }
  }, [isOpen, loadFeedbacksList]);

  // Captura de tela para formulário de Bug
  const captureScreen = async () => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const dataUrl = await htmlToImage.toPng(document.body, {
        width: window.innerWidth,
        height: window.innerHeight,
        style: {
          width: window.innerWidth + 'px',
          height: window.innerHeight + 'px',
          transform: 'none',
          left: '0',
          top: '0',
        },
        filter: (node: HTMLElement) => {
          if (
            node.classList &&
            (node.classList.contains('feedback-widget-trigger') ||
              node.classList.contains('feedback-widget-container'))
          ) {
            return false;
          }
          return true;
        },
        pixelRatio: 1,
        cacheBust: false,
      });
      setScreenshot(dataUrl);
      setIncludeScreenshot(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Erro ao capturar a tela: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              if (ev.target?.result) {
                setScreenshot(ev.target.result as string);
                setIncludeScreenshot(true);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setScreenshot(ev.target.result as string);
          setIncludeScreenshot(true);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!description.trim()) return;
    setLoading(true);
    try {
      const finalPage = subPage.trim()
        ? `${module} > ${subPage.trim()}`
        : (module || buildFeedbackPagePath(currentView));

      await api.createFeedback({
        type: feedbackType,
        description: description.trim(),
        page: finalPage,
        moduleKey: selectedModuleKey || undefined,
        logs: getLogs(),
        screenshot: includeScreenshot ? screenshot : undefined,
      });
      setSent(true);
      loadFeedbacksList();
      setTimeout(() => {
        setSent(false);
        setDescription('');
        setScreenshot('');
        setIncludeScreenshot(false);
        setInspectedElement(null);
        setFeedbackMode('list');
      }, 1200);
    } catch (err: any) {
      console.error('Failed to send feedback:', err);
      const msg = err?.message || (typeof err === 'string' ? err : 'Tente novamente.');
      alert(`Erro ao enviar feedback: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // Adicionar comentário/nota a feedback existente
  const handleAddNote = async () => {
    if (!selectedFeedback || !newNoteText.trim()) return;
    setSavingNote(true);
    try {
      const note = await apiJson<FeedbackNote>(`/api/hub/feedbacks/${selectedFeedback.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: newNoteText.trim() }),
      });

      setSelectedFeedback((prev) => prev ? {
        ...prev,
        notes: [...prev.notes, note],
        notesCount: (prev.notesCount || 0) + 1,
      } : null);

      setNewNoteText('');
      setTimeout(() => notesBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      loadFeedbacksList();
    } catch (err) {
      alert('Erro ao adicionar comentário.');
    } finally {
      setSavingNote(false);
    }
  };

  // Supervisor altera status
  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedFeedback) return;
    setUpdatingStatus(true);
    try {
      await apiJson(`/api/hub/feedbacks/${selectedFeedback.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });

      setSelectedFeedback((prev) => prev ? { ...prev, status: newStatus } : null);
      loadFeedbacksList();
    } catch (err) {
      alert('Erro ao atualizar status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Filtros de feedbacks
  const openCount = useMemo(
    () => feedbacksList.filter((f) => ['pending', 'queued', 'in_progress'].includes(f.status)).length,
    [feedbacksList]
  );
  const awaitingCount = useMemo(
    () => feedbacksList.filter((f) => f.status === 'awaiting_review').length,
    [feedbacksList]
  );
  const resolvedCount = useMemo(
    () => feedbacksList.filter((f) => f.status === 'resolved' || f.status === 'wont_fix').length,
    [feedbacksList]
  );

  const filteredFeedbacks = feedbacksList.filter((fb) => {
    const matchesSearch =
      fb.description.toLowerCase().includes(feedbackSearch.toLowerCase()) ||
      fb.page.toLowerCase().includes(feedbackSearch.toLowerCase()) ||
      (fb.requestedBy && fb.requestedBy.toLowerCase().includes(feedbackSearch.toLowerCase()));

    if (!matchesSearch) return false;
    if (feedbackFilterStatus === 'ALL') return true;
    if (feedbackFilterStatus === 'OPEN') return ['pending', 'queued', 'in_progress'].includes(fb.status);
    if (feedbackFilterStatus === 'AWAITING_REVIEW') return fb.status === 'awaiting_review';
    if (feedbackFilterStatus === 'RESOLVED') return fb.status === 'resolved' || fb.status === 'wont_fix';
    return fb.status === feedbackFilterStatus;
  });

  return (
    <>
      {/* Botão Flutuante Minimalista Monocromático: SEMPRE 1 ÚNICO ÍCONE */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-50 feedback-widget-trigger transition-all duration-300',
          collapsed ? 'sm:translate-x-6 sm:opacity-60 hover:translate-x-0 hover:opacity-100' : 'translate-x-0 opacity-100',
          isOpen && 'max-sm:hidden'
        )}
        onMouseEnter={() => setCollapsed(false)}
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-3 max-sm:h-12 max-sm:w-12 bg-zinc-900 text-zinc-100 rounded-full shadow-xl border border-zinc-700 hover:bg-zinc-800 active:scale-95 transition-transform cursor-pointer flex items-center justify-center"
          title="Bugs e ideias"
        >
          <Bug className="h-4 w-4 text-zinc-300" />
        </button>
      </div>

      {/* Banner Superior do Modo Inspetor (DevTools style) */}
      {isInspecting && (
        <div
          id="inspector-banner"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-zinc-950/95 text-white px-5 py-2.5 rounded-2xl shadow-2xl border border-zinc-700 flex items-center gap-4 text-xs font-medium backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-bold text-zinc-100 flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
              Modo Inspetor Ativo
            </span>
          </div>
          <span className="text-zinc-400 hidden sm:inline">
            Clique em qualquer elemento na tela (botão, logo, tabela, menu...) para apontá-lo.
          </span>
          {hoveredLabel && (
            <span className="bg-zinc-800 text-zinc-200 px-2.5 py-1 rounded-lg border border-zinc-700 font-mono text-[11px] truncate max-w-xs">
              {hoveredLabel}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setIsInspecting(false);
              setHoveredRect(null);
            }}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-zinc-700"
          >
            Cancelar (Esc)
          </button>
        </div>
      )}

      {/* Caixa de Destaque Visual sobre o Elemento sob o Mouse */}
      {isInspecting && hoveredRect && (
        <div
          style={{
            position: 'fixed',
            top: hoveredRect.top,
            left: hoveredRect.left,
            width: hoveredRect.width,
            height: hoveredRect.height,
            pointerEvents: 'none',
            zIndex: 9998,
            border: '2px solid #18181b',
            boxShadow: '0 0 0 4px rgba(24, 24, 27, 0.2)',
            borderRadius: '4px',
            backgroundColor: 'rgba(24, 24, 27, 0.08)',
            transition: 'all 0.05s ease-out',
          }}
        >
          <div className="absolute -top-6 left-0 bg-zinc-900 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow whitespace-nowrap border border-zinc-700 pointer-events-none flex items-center gap-1">
            <Target className="w-2.5 h-2.5 text-zinc-300" />
            <span>{hoveredLabel}</span>
          </div>
        </div>
      )}

      {/* Janela Flutuante Monocromática e Coesa com NatumHub (bg-white, border-zinc-200) */}
      <AnimatePresence>
        {isOpen && !isInspecting && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 sm:inset-auto sm:bottom-20 sm:right-6 z-50 sm:w-[440px] sm:max-w-[calc(100vw-2rem)] sm:h-[600px] sm:max-h-[calc(100dvh-6rem)] bg-white text-zinc-900 sm:rounded-2xl shadow-2xl sm:border border-zinc-200 flex flex-col overflow-hidden feedback-widget-container font-sans"
          >
            {/* Header com Navegação de Abas Monocromático */}
            <div className="bg-white border-b border-zinc-200 p-3 flex items-center justify-between shrink-0 shadow-2xs">
              <div className="flex items-center gap-2 px-1 text-sm font-bold text-zinc-900">
                <Bug className="w-4 h-4 text-zinc-700" />
                <span>Bugs e ideias</span>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Fechar"
                className="p-1.5 max-sm:p-3 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ABA: BUGS & IDEIAS */}
            <div className="flex-1 flex flex-col min-h-0 bg-white">
                {/* Sub-header de navegação entre Formulário e Lista */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 bg-zinc-50 text-xs shrink-0">
                  {feedbackMode === 'detail' ? (
                    <button
                      type="button"
                      onClick={() => setFeedbackMode('list')}
                      className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-900 font-bold transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar para Lista</span>
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 w-full">
                      <button
                        type="button"
                        onClick={() => setFeedbackMode('form')}
                        className={cn(
                          'px-2.5 py-1 max-sm:py-2.5 rounded-md text-xs font-bold transition-all cursor-pointer',
                          feedbackMode === 'form' ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200' : 'text-zinc-500 hover:text-zinc-800'
                        )}
                      >
                        <span className="block text-center">+ Novo relato</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFeedbackMode('list');
                          loadFeedbacksList();
                        }}
                        className={cn(
                          'px-2.5 py-1 max-sm:py-2.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                          feedbackMode === 'list' ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200' : 'text-zinc-500 hover:text-zinc-800'
                        )}
                      >
                        <ListFilter className="w-3.5 h-3.5" />
                        <span>Fila ({feedbacksList.length})</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* MODO 1: FORMULÁRIO */}
                {feedbackMode === 'form' && (
                  <div className="flex-1 flex flex-col min-h-0" onPaste={handlePaste}>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {sent ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                        <div className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-800 flex items-center justify-center border border-zinc-200">
                          <Check className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900">Relato Enviado com Sucesso!</h4>
                        <p className="text-xs text-zinc-500">
                          Seu relato foi salvo no banco de dados e adicionado à fila para revisão.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setFeedbackType('bug')}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-2 p-2.5 max-sm:min-h-11 rounded-xl border text-xs font-bold transition-colors cursor-pointer',
                              feedbackType === 'bug'
                                ? 'bg-zinc-900 border-zinc-900 text-white shadow-xs'
                                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                            )}
                          >
                            <Bug className="h-4 w-4" /> Bug / Falha
                          </button>
                          <button
                            type="button"
                            onClick={() => setFeedbackType('feedback')}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-2 p-2.5 max-sm:min-h-11 rounded-xl border text-xs font-bold transition-colors cursor-pointer',
                              feedbackType === 'feedback'
                                ? 'bg-zinc-900 border-zinc-900 text-white shadow-xs'
                                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                            )}
                          >
                            <MessageSquare className="h-4 w-4" /> Sugestão / Ideia
                          </button>
                        </div>

                        <div>
                          <label htmlFor="feedback-descricao" className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                            {feedbackType === 'bug' ? 'O que aconteceu?' : 'Qual é a ideia?'}
                          </label>

                          {inspectedElement && (
                            <div className="flex items-center justify-between gap-2 p-2 mb-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700">
                              <div className="flex items-center gap-1.5 truncate">
                                <Target className="w-3.5 h-3.5 text-zinc-900 shrink-0" />
                                <span className="font-bold text-zinc-900 truncate">
                                  {inspectedElement.label}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setInspectedElement(null)}
                                className="p-1 hover:bg-zinc-200 rounded text-zinc-400 hover:text-zinc-600 cursor-pointer"
                                title="Remover elemento apontado"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          <textarea
                            id="feedback-descricao"
                            rows={5}
                            autoFocus
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault();
                                void handleSubmitFeedback();
                              }
                            }}
                            placeholder="Conte com detalhes: onde estava, o que fez, o que esperava. Dá para colar uma imagem (Ctrl+V)."
                            className="w-full px-3 py-2 text-base sm:text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none placeholder-zinc-400"
                          />

                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setIsInspecting(true)}
                              className={cn(
                                'flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-2 rounded-xl border text-xs font-bold cursor-pointer',
                                inspectedElement
                                  ? 'border-zinc-900 bg-zinc-900 text-white'
                                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                              )}
                              title="Clique para apontar qualquer botão, menu ou card na tela"
                            >
                              <Crosshair className="w-3.5 h-3.5" />
                              <span>Apontar</span>
                            </button>
                            <button
                              type="button"
                              onClick={captureScreen}
                              disabled={loading}
                              className="flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 font-bold text-xs cursor-pointer disabled:opacity-50"
                              title="Tira uma foto da tela atual"
                            >
                              <Camera className="w-3.5 h-3.5 text-zinc-500" />
                              <span>{loading ? '...' : 'Capturar'}</span>
                            </button>
                            <label
                              className="flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-2 rounded-xl border border-dashed border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 font-bold text-xs cursor-pointer"
                              title="Anexar uma imagem do aparelho"
                            >
                              <Upload className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Anexar</span>
                              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                            </label>
                          </div>

                          {screenshot && (
                            <div className="mt-2 relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 max-h-32">
                              <img src={screenshot} alt="Captura anexada" className="w-full object-contain max-h-32" />
                              <button
                                type="button"
                                aria-label="Remover imagem"
                                onClick={() => {
                                  setScreenshot('');
                                  setIncludeScreenshot(false);
                                }}
                                className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full p-1.5 hover:bg-black"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2.5">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                                Módulo
                              </label>
                              {detectedFromView && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                                  <Sparkles className="w-2.5 h-2.5 text-zinc-600" />
                                  Detectado da tela atual
                                </span>
                              )}
                            </div>

                            {/* Dropdown Customizado de Módulos (com pesquisa e sem fechar ao clicar) */}
                            <div className="relative" ref={moduleDropdownRef}>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsModuleDropdownOpen((prev) => !prev);
                                  setModuleSearchFilter('');
                                }}
                                className="w-full flex items-center justify-between px-3 py-2 max-sm:py-3 text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-800 cursor-pointer shadow-2xs hover:bg-zinc-50"
                              >
                                <span className={cn('truncate', !selectedModuleKey && 'text-zinc-400')}>
                                  {currentCatalogItem?.label || module || 'Selecione um módulo...'}
                                </span>
                                <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform shrink-0', isModuleDropdownOpen && 'rotate-180')} />
                              </button>

                              {isModuleDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-zinc-200 rounded-xl shadow-xl max-h-60 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                                  <div className="p-2 border-b border-zinc-100 bg-zinc-50">
                                    <div className="relative">
                                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                      <input
                                        type="text"
                                        autoFocus
                                        value={moduleSearchFilter}
                                        onChange={(e) => setModuleSearchFilter(e.target.value)}
                                        placeholder="Buscar módulo..."
                                        className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder-zinc-400"
                                      />
                                    </div>
                                  </div>
                                  <div className="overflow-y-auto flex-1 p-1 space-y-1">
                                    {filteredCatalogGroups.length === 0 ? (
                                      <div className="p-3 text-center text-zinc-400 text-xs">
                                        Nenhum módulo encontrado.
                                      </div>
                                    ) : (
                                      filteredCatalogGroups.map(([group, items]) => (
                                        <div key={group} className="space-y-0.5">
                                          <div className="px-2 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-50/50 rounded">
                                            {group}
                                          </div>
                                          {items.map((item) => (
                                            <button
                                              key={item.key}
                                              type="button"
                                              onClick={() => {
                                                setSelectedModuleKey(item.key);
                                                setModule(item.label);
                                                setDetectedFromView(false);
                                                if (item.subPages.length > 0 && (!subPage || !item.subPages.includes(subPage))) {
                                                  setSubPage(item.subPages[0]);
                                                }
                                                setIsModuleDropdownOpen(false);
                                              }}
                                              className={cn(
                                                'w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer',
                                                selectedModuleKey === item.key
                                                  ? 'bg-zinc-900 text-white font-bold'
                                                  : 'text-zinc-700 hover:bg-zinc-100'
                                              )}
                                            >
                                              <span className="truncate">{item.label}</span>
                                              {selectedModuleKey === item.key && (
                                                <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1" />
                                              )}
                                            </button>
                                          ))}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                                Tela / aba (opcional)
                              </label>
                              {subPage && (
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  {subPage}
                                </span>
                              )}
                            </div>
                            <input
                              type="text"
                              placeholder="Ex: Dashboard, Lançamentos, Estoque..."
                              value={subPage}
                              onChange={(e) => setSubPage(e.target.value)}
                              className="w-full px-3 py-2 max-sm:py-3 text-base sm:text-xs bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-800 placeholder-zinc-400"
                            />
                          </div>
                        </div>

                      </>
                    )}
                    </div>

                    {!sent && (
                      <div className="shrink-0 border-t border-zinc-200 bg-white p-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-1.5">
                        <button
                          type="button"
                          onClick={handleSubmitFeedback}
                          disabled={loading || !description.trim()}
                          className="w-full min-h-11 sm:min-h-10 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 disabled:opacity-50 shadow-md active:scale-[0.98] cursor-pointer"
                        >
                          {loading ? 'Enviando...' : 'Enviar relato'}
                        </button>
                        <p className="text-[10px] text-zinc-400 text-center">
                          Registramos seu nome, a hora e os logs da tela.
                          <span className="hidden sm:inline"> Ctrl+Enter envia.</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* MODO 2: LISTA DE FEEDBACKS */}
                {feedbackMode === 'list' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 border-b border-zinc-100 space-y-2 bg-zinc-50">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={feedbackSearch}
                          onChange={(e) => setFeedbackSearch(e.target.value)}
                          placeholder="Buscar relatos..."
                          className="w-full bg-white border border-zinc-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1">
                        <button
                          type="button"
                          onClick={() => setFeedbackFilterStatus('ALL')}
                          className={cn(
                            'px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5',
                            feedbackFilterStatus === 'ALL'
                              ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200'
                              : 'text-zinc-500 hover:text-zinc-800'
                          )}
                        >
                          <span>Todos</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-600 font-semibold">
                            {feedbacksList.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFeedbackFilterStatus('OPEN')}
                          className={cn(
                            'px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5',
                            feedbackFilterStatus === 'OPEN'
                              ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200'
                              : 'text-zinc-500 hover:text-zinc-800'
                          )}
                        >
                          <span>Abertos</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-600 font-semibold">
                            {openCount}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFeedbackFilterStatus('AWAITING_REVIEW')}
                          className={cn(
                            'px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5',
                            feedbackFilterStatus === 'AWAITING_REVIEW'
                              ? 'bg-amber-500 text-white shadow-xs border border-amber-600'
                              : awaitingCount > 0
                                ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 font-extrabold'
                                : 'text-zinc-500 hover:text-zinc-800'
                          )}
                        >
                          <Clock className="w-3 h-3" />
                          <span>Aguardando</span>
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                              feedbackFilterStatus === 'AWAITING_REVIEW'
                                ? 'bg-amber-600 text-white'
                                : awaitingCount > 0
                                  ? 'bg-amber-200 text-amber-900'
                                  : 'bg-zinc-100 text-zinc-600'
                            )}
                          >
                            {awaitingCount}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFeedbackFilterStatus('RESOLVED')}
                          className={cn(
                            'px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5',
                            feedbackFilterStatus === 'RESOLVED'
                              ? 'bg-white text-zinc-900 shadow-xs border border-zinc-200'
                              : 'text-zinc-500 hover:text-zinc-800'
                          )}
                        >
                          <span>Finalizados</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-600 font-semibold">
                            {resolvedCount}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                      {filteredFeedbacks.length === 0 ? (
                        <div className="text-center py-12 text-zinc-400 text-xs">
                          Nenhum relato encontrado nesta categoria.
                        </div>
                      ) : (
                        filteredFeedbacks.map((fb) => {
                          const label = STATUS_LABELS[fb.status] || 'Pendente';
                          return (
                            <div
                              key={fb.id}
                              onClick={() => loadFeedbackDetail(fb.id)}
                              className="p-3 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl transition-all cursor-pointer space-y-2 shadow-2xs hover:shadow-xs group"
                            >
                              <div className="flex items-center justify-between gap-2">
                                {fb.status === 'awaiting_review' ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-amber-50 text-amber-800 border-amber-200 flex items-center gap-1 shadow-2xs">
                                    <Clock className="w-2.5 h-2.5 text-amber-600" />
                                    Aguardando Aprovação
                                  </span>
                                ) : fb.status === 'resolved' ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-800 border-emerald-200 flex items-center gap-1">
                                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                                    Finalizado
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-zinc-100 text-zinc-800 border-zinc-200">
                                    {label}
                                  </span>
                                )}
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  {fb.requestedBy ? `@${fb.requestedBy}` : 'Operador'}
                                </span>
                              </div>

                              <p className="text-xs font-medium text-zinc-800 line-clamp-2 leading-relaxed">
                                {fb.description}
                              </p>

                              <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-100">
                                <span className="truncate max-w-[220px]">{fb.page}</span>
                                <div className="flex items-center gap-2">
                                  {fb.hasScreenshot && <Camera className="w-3 h-3 text-zinc-400" />}
                                  {fb.notesCount && fb.notesCount > 0 ? (
                                    <span className="flex items-center gap-1 text-zinc-700 font-bold">
                                      <MessageCircle className="w-3 h-3" />
                                      {fb.notesCount}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* MODO 3: DETALHES & CHAT DE NOTAS */}
                {feedbackMode === 'detail' && selectedFeedback && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 bg-zinc-50 border-b border-zinc-200 space-y-2 shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-500 truncate max-w-[240px]">
                          {selectedFeedback.page}
                        </span>

                        {isSupervisor ? (
                          <div className="relative">
                            <select
                              value={selectedFeedback.status}
                              disabled={updatingStatus}
                              onChange={(e) => handleUpdateStatus(e.target.value)}
                              className="bg-white border border-zinc-300 text-xs font-bold rounded-lg px-2 py-1 text-zinc-800 focus:outline-none shadow-2xs cursor-pointer"
                            >
                              <option value="pending">Pendente</option>
                              <option value="queued">Na Fila</option>
                              <option value="in_progress">Em Andamento</option>
                              <option value="awaiting_review">Aguardando Aprovação</option>
                              <option value="resolved">Resolvido</option>
                              <option value="wont_fix">Não será feito</option>
                            </select>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-zinc-100 text-zinc-800 border-zinc-200">
                            {STATUS_LABELS[selectedFeedback.status] || 'Pendente'}
                          </span>
                        )}
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-zinc-200 text-xs text-zinc-800 leading-relaxed shadow-2xs">
                        {selectedFeedback.description}
                      </div>

                      {selectedFeedback.screenshot && (
                        <div className="rounded-xl overflow-hidden border border-zinc-200 max-h-24 bg-zinc-100">
                          <img src={selectedFeedback.screenshot} alt="Anexo" className="w-full h-auto object-contain max-h-24" />
                        </div>
                      )}

                      {selectedFeedback.status === 'awaiting_review' && (
                        <div className="flex items-center justify-between gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl shadow-2xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                            <div className="text-[11px] text-amber-900 truncate">
                              <span className="font-bold block">{isSupervisor ? 'Aguardando sua Aprovação' : 'Aguardando conferência'}</span>
                              <span className="text-zinc-600 truncate block text-[10px]">{isSupervisor ? 'Ajuste realizado. Aprove ou reabra para ajustes.' : 'Ajuste realizado. O supervisor aprova ou reabre.'}</span>
                            </div>
                          </div>
                          {isSupervisor && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={updatingStatus}
                              onClick={() => handleUpdateStatus('resolved')}
                              className="px-2.5 py-1 max-sm:py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Aprovar</span>
                            </button>
                            <button
                              type="button"
                              disabled={updatingStatus}
                              onClick={() => handleUpdateStatus('in_progress')}
                              className="px-2 py-1 max-sm:py-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium text-xs transition-colors cursor-pointer flex items-center gap-1 border border-zinc-200"
                            >
                              <RotateCcw className="w-3 h-3 text-zinc-500" />
                              <span>Reabrir</span>
                            </button>
                          </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Timeline de Comentários / Chat */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-zinc-50/50">
                      <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider text-center my-1">
                        Histórico & Comentários
                      </div>

                      {selectedFeedback.notes && selectedFeedback.notes.length > 0 ? (
                        selectedFeedback.notes.map((note) => {
                          const isMe = note.author === (currentUser?.displayName);
                          return (
                            <div
                              key={note.id}
                              className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}
                            >
                              <span className="text-[10px] text-zinc-400 px-1 mb-0.5 font-bold">
                                {note.author}
                              </span>
                              <div
                                className={cn(
                                  'p-2.5 rounded-xl text-xs max-w-[85%] leading-relaxed shadow-2xs',
                                  isMe
                                    ? 'bg-zinc-900 text-white rounded-br-xs'
                                    : 'bg-white text-zinc-800 border border-zinc-200 rounded-bl-xs'
                                )}
                              >
                                {note.body}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-6 text-zinc-400 text-xs">
                          Nenhum comentário ainda. Adicione uma resposta abaixo!
                        </div>
                      )}
                      <div ref={notesBottomRef} />
                    </div>

                    {/* Input de Novo Comentário */}
                    <div className="p-2.5 bg-white border-t border-zinc-200 flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                        placeholder="Escrever resposta ou comentário..."
                        className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 max-sm:py-3 text-base sm:text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={savingNote || !newNoteText.trim()}
                        className="p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl transition-all cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
