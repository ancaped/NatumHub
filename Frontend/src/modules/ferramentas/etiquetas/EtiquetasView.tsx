import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FilePlus,
  Calendar as CalendarIcon,
  History,
  Tag,
  Loader2,
  Box,
  CheckCircle2,
  FlaskConical,
  Layers,
  ShieldAlert,
  Star,
  Printer,
  ExternalLink,
} from 'lucide-react';
import AppLayout, { type SidebarItem } from '../../geral/components/layout/AppLayout';
import { GerarEtiquetasFlow } from './components/GerarEtiquetasFlow';
import LabelsCalendarTab from './components/LabelsCalendarTab';
import LabelsCatalogTab from './components/LabelsCatalogTab';
import PrintWithSystemDataModal from './components/PrintWithSystemDataModal';
import PrintModal from './components/PrintModal';
import { labelsApi, type LabelPrintHistoryItem } from './lib/labelsApi';
import type { LabelTemplate } from './lib/types';
import { DEFAULT_LABEL_TEMPLATES } from './lib/defaultTemplates';
import { getAuthUser } from '../../geral/lib/auth';

interface EtiquetasViewProps {
  onBackToHub: () => void;
  onNavigateToEditor?: (template?: LabelTemplate) => void;
}

export default function EtiquetasView({ onBackToHub, onNavigateToEditor }: EtiquetasViewProps) {
  const currentUser = useMemo(() => getAuthUser(), []);
  const [activeTab, setActiveTab] = useState<string>('new');

  // Templates state
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // History state
  const [printHistory, setPrintHistory] = useState<LabelPrintHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modals state
  const [isSystemPrintModalOpen, setIsSystemPrintModalOpen] = useState(false);
  const [selectedTemplateForPrint, setSelectedTemplateForPrint] = useState<LabelTemplate>(DEFAULT_LABEL_TEMPLATES[0]);
  const [isQuickPrintModalOpen, setIsQuickPrintModalOpen] = useState(false);

  // Fetch templates from API
  const loadSavedTemplates = useCallback(async () => {
    try {
      setLoadingTemplates(true);
      const apiList = await labelsApi.listTemplates();
      if (apiList.length > 0) {
        const merged = [...DEFAULT_LABEL_TEMPLATES];
        for (const t of apiList) {
          const idx = merged.findIndex((m) => m.id === t.id);
          if (idx >= 0) {
            merged[idx] = t;
          } else {
            merged.push(t);
          }
        }
        setSavedTemplates(merged);
        return;
      }
    } catch (e) {
      console.warn('Erro ao carregar modelos da API:', e);
    } finally {
      setLoadingTemplates(false);
    }
    setSavedTemplates(DEFAULT_LABEL_TEMPLATES);
  }, []);

  // Fetch print history
  const loadPrintHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const data = await labelsApi.listHistory(200);
      setPrintHistory(data);
    } catch (e) {
      console.warn('Erro ao carregar histórico de impressão:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadSavedTemplates();
    loadPrintHistory();
  }, [loadSavedTemplates, loadPrintHistory]);

  // Combined templates
  const allTemplates = useMemo(() => {
    if (Array.isArray(savedTemplates) && savedTemplates.length > 0) return savedTemplates;
    return DEFAULT_LABEL_TEMPLATES;
  }, [savedTemplates]);

  // Category Counts
  const counts = useMemo(() => {
    const list = Array.isArray(allTemplates) ? allTemplates : [];
    const total = list.length;
    const expedicao = list.filter((t) => t?.category === 'expedicao' || (t?.name || '').toLowerCase().includes('caixa')).length;
    const producao = list.filter((t) => t?.category === 'producao' || (t?.name || '').toLowerCase().includes('produto')).length;
    const estoque = list.filter((t) => t?.category === 'estoque' || (t?.name || '').toLowerCase().includes('químico') || (t?.name || '').toLowerCase().includes('massa')).length;
    const embalagens = list.filter((t) => t?.category === 'embalagens' || (t?.name || '').toLowerCase().includes('frasco')).length;
    const qualidade = list.filter((t) => t?.category === 'qualidade' || (t?.name || '').toLowerCase().includes('aprovado') || (t?.name || '').toLowerCase().includes('quarentena')).length;
    const custom = list.filter((t) => t?.category === 'custom' || (!t?.id?.startsWith('template_') && !t?.is_default)).length;
    return { total, expedicao, producao, estoque, embalagens, qualidade, custom };
  }, [allTemplates]);

  // Sidebar items with operations + categories directly on the sidebar
  const sidebarItems: SidebarItem[] = [
    { id: 'new', label: 'Gerar Etiquetas', icon: FilePlus },
    { id: 'calendar', label: 'Calendário', icon: CalendarIcon },
    { id: 'cat_all', label: 'Todas as Etiquetas', icon: Tag, badge: counts.total },
    { id: 'cat_expedicao', label: 'Caixas / Volumes', icon: Box, badge: counts.expedicao },
    { id: 'cat_producao', label: 'Produtos Acabados', icon: CheckCircle2, badge: counts.producao },
    { id: 'cat_estoque', label: 'Matérias-Primas', icon: FlaskConical, badge: counts.estoque },
    { id: 'cat_embalagens', label: 'Embalagens & Apoio', icon: Layers, badge: counts.embalagens },
    { id: 'cat_qualidade', label: 'Controle Qualidade', icon: ShieldAlert, badge: counts.qualidade },
    { id: 'cat_custom', label: 'Minhas Criações', icon: Star, badge: counts.custom },
    { id: 'history', label: 'Histórico', icon: History },
  ];

  // Handle open system print
  const handleOpenSystemPrint = (tpl: LabelTemplate) => {
    setSelectedTemplateForPrint(tpl);
    setIsSystemPrintModalOpen(true);
  };

  // Handle open quick print
  const handleOpenQuickPrint = (tpl: LabelTemplate) => {
    setSelectedTemplateForPrint(tpl);
    setIsQuickPrintModalOpen(true);
  };

  // Handle delete template
  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o modelo "${name}"?`)) return;
    try {
      await labelsApi.deleteTemplate(id);
      await loadSavedTemplates();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir modelo.');
    }
  };

  // Handle reprint from calendar
  const handleReprint = (item: LabelPrintHistoryItem) => {
    const match =
      allTemplates.find((t) => t.id === item.template_id || t.name === item.template_name) ||
      DEFAULT_LABEL_TEMPLATES[4];
    setSelectedTemplateForPrint(match);
    setIsSystemPrintModalOpen(true);
  };

  return (
    <AppLayout
      moduleTitle="Etiquetas"
      moduleSubtitle="Impressão Térmica e Lotes"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id: string) => setActiveTab(id)}
    >
      <div className="flex-1 p-6 overflow-y-auto font-sans">
        {/* TAB: GERAR ETIQUETAS (FLOW) */}
        {activeTab === 'new' && (
          <GerarEtiquetasFlow
            templates={allTemplates}
            onPrintSuccess={loadPrintHistory}
          />
        )}

        {/* TAB: CALENDAR */}
        {activeTab === 'calendar' && (
          <LabelsCalendarTab
            history={printHistory}
            templates={allTemplates}
            onReprint={handleReprint}
          />
        )}

        {/* TABS: CATEGORIES & TEMPLATES LIST */}
        {activeTab.startsWith('cat_') && (
          <LabelsCatalogTab
            templates={allTemplates}
            currentUser={currentUser}
            activeCategory={activeTab}
            onOpenSystemPrint={handleOpenSystemPrint}
            onOpenQuickPrint={handleOpenQuickPrint}
            onOpenEditor={(tpl) => {
              if (onNavigateToEditor) {
                onNavigateToEditor(tpl);
              }
            }}
            onCreateNew={() => {
              if (onNavigateToEditor) {
                onNavigateToEditor();
              }
            }}
            onDeleteTemplate={handleDeleteTemplate}
          />
        )}

        {/* TAB: HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Histórico de Impressões</h3>
                <p className="text-xs text-zinc-500">Registro auditável de todas as impressões de etiquetas térmicas</p>
              </div>
              <button
                type="button"
                onClick={loadPrintHistory}
                className="px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Atualizar Histórico
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-600 font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-3.5">Data / Hora</th>
                    <th className="p-3.5">Modelo de Etiqueta</th>
                    <th className="p-3.5">Cód. Produto</th>
                    <th className="p-3.5">Descrição</th>
                    <th className="p-3.5">Lote</th>
                    <th className="p-3.5 text-center">Cópias</th>
                    <th className="p-3.5">Impressora</th>
                    <th className="p-3.5">Operador</th>
                    <th className="p-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-zinc-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-900" />
                        <span className="text-xs block mt-2">Carregando histórico...</span>
                      </td>
                    </tr>
                  ) : printHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-zinc-400 text-xs">
                        Nenhum registro de impressão encontrado no histórico.
                      </td>
                    </tr>
                  ) : (
                    printHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="p-3.5 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                          {new Date(item.printed_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3.5 font-bold text-zinc-900">{item.template_name}</td>
                        <td className="p-3.5 font-mono text-blue-600 font-bold">
                          {item.product_code || '-'}
                        </td>
                        <td className="p-3.5 font-medium text-zinc-800 max-w-xs truncate">
                          {item.product_name || '-'}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-zinc-900">{item.lot_number || '-'}</td>
                        <td className="p-3.5 text-center font-bold text-zinc-900">{item.copies} un.</td>
                        <td className="p-3.5 font-mono text-zinc-600 text-[11px]">
                          {item.printer_name || 'Térmica'}
                        </td>
                        <td className="p-3.5 text-zinc-600">{item.operator_name || 'Operador'}</td>
                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleReprint(item)}
                            className="px-2.5 py-1 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-200 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                          >
                            Reimprimir
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Print with System Data */}
      <PrintWithSystemDataModal
        template={selectedTemplateForPrint}
        isOpen={isSystemPrintModalOpen}
        onClose={() => setIsSystemPrintModalOpen(false)}
        onPrintSuccess={loadPrintHistory}
      />

      {/* MODAL: Quick Simple Print */}
      <PrintModal
        template={selectedTemplateForPrint}
        isOpen={isQuickPrintModalOpen}
        onClose={() => setIsQuickPrintModalOpen(false)}
      />
    </AppLayout>
  );
}
