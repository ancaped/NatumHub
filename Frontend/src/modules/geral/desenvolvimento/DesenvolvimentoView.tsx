import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Network, ListTodo, History, Plus, RefreshCw, Loader2, X, Check, ArrowLeft
} from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import { apiJson } from '../lib/http';
import { api } from '../lib/api';
import type { AuthUser } from '../lib/auth';
import type {
  MapaSnapshot, MapaModule, Feedback, FeedbackDetail,
  DesenvolvimentoTab, MapaDetail
} from './types';
import OrganogramaMapCanvas from './components/OrganogramaMapCanvas';
import ModuleDetailDrawer from './components/ModuleDetailDrawer';
import DemandasQueueTab from './components/DemandasQueueTab';
import DemandaDetailDrawer from './components/DemandaDetailDrawer';
import TimelineAuditTab from './components/TimelineAuditTab';
import ModuleCreationWizard from './components/ModuleCreationWizard';

interface DesenvolvimentoViewProps {
  currentUser?: AuthUser | null;
  onBackToHub: () => void;
  onNavigateToView?: (view: string) => void;
}

export default function DesenvolvimentoView({
  currentUser,
  onBackToHub,
  onNavigateToView,
}: DesenvolvimentoViewProps) {
  const [activeTab, setActiveTab] = useState<DesenvolvimentoTab>('mapa');
  const [snap, setSnap] = useState<MapaSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Módulo selecionado no Mapa
  const [selectedModuleKey, setSelectedModuleKey] = useState<string | null>(null);
  const [savingModuleNotes, setSavingModuleNotes] = useState(false);

  // Feedbacks / Demandas
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [feedbackDetail, setFeedbackDetail] = useState<FeedbackDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Estado do Canvas (Pan & Zoom)
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const dragRef = useRef<{
    key: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Carrega Snapshot e Feedbacks
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, fbList] = await Promise.all([
        apiJson<MapaSnapshot>('/mapa/snapshot'),
        api.getFeedbacksManage().catch(() => []),
      ]);

      setSnap(s);
      setFeedbacks(fbList || []);

      const pos: Record<string, { x: number; y: number }> = {};
      for (const m of s.modules) {
        pos[m.moduleKey] = { x: m.posX, y: m.posY };
      }
      setPositions(pos);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar dados de desenvolvimento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Carrega Detalhe de Feedback quando selecionado
  const loadFeedbackDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const detail = await api.getFeedbackDetail(id);
      setFeedbackDetail(detail);
    } catch (err: unknown) {
      console.warn('Erro ao carregar detalhe do feedback:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleSelectFeedback = (f: Feedback) => {
    setSelectedFeedbackId(f.id);
    void loadFeedbackDetail(f.id);
  };

  // Módulo ativo
  const selectedModule = useMemo(() => {
    if (!selectedModuleKey || !snap) return null;
    return snap.modules.find((m) => m.moduleKey === selectedModuleKey) || null;
  }, [selectedModuleKey, snap]);

  const selectedModuleGroup = useMemo(() => {
    if (!selectedModule || !snap) return undefined;
    return snap.groups.find((g) => g.key === selectedModule.groupKey)?.label;
  }, [selectedModule, snap]);

  // Drag & Drop no canvas
  const onPointerDownNode = (e: React.PointerEvent, key: string) => {
    e.stopPropagation();
    const p = positions[key] || { x: 0, y: 0 };
    dragRef.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      origX: p.x,
      origY: p.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMoveNode = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    setPositions((prev) => ({
      ...prev,
      [d.key]: { x: d.origX + dx, y: d.origY + dy },
    }));
  };

  const onPointerUpNode = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    try {
      const items = [{
        moduleKey: d.key,
        posX: positions[d.key]?.x ?? 0,
        posY: positions[d.key]?.y ?? 0,
      }];
      await apiJson('/mapa/layout', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      });
    } catch (err: unknown) {
      console.warn('Falha ao salvar posição do módulo:', err);
    }
  };

  // Salvar Notas do Módulo
  const handleSaveModuleNotes = async (newNotes: string) => {
    if (!selectedModule) return;
    setSavingModuleNotes(true);
    try {
      const detail: MapaDetail = {
        ...((selectedModule.detail || {}) as MapaDetail),
        notes: newNotes,
      };
      await apiJson(`/mapa/modules/${selectedModule.moduleKey}`, {
        method: 'PUT',
        body: JSON.stringify({
          label: selectedModule.label,
          groupKey: selectedModule.groupKey,
          purpose: selectedModule.purpose,
          status: selectedModule.status,
          sortOrder: selectedModule.sortOrder,
          frontendPath: selectedModule.frontendPath,
          backendPath: selectedModule.backendPath,
          routerPrefix: selectedModule.routerPrefix,
          detail,
        }),
      });
      await loadData();
    } finally {
      setSavingModuleNotes(false);
    }
  };

  // Ações de Feedback / Demanda
  const handleUpdateStatus = async (id: string, status: string) => {
    await api.updateFeedback(id, { status });
    await loadData();
    if (selectedFeedbackId === id) {
      await loadFeedbackDetail(id);
    }
  };

  const handleUpdatePriority = async (id: string, priority: number) => {
    await api.updateFeedback(id, { priority });
    await loadData();
    if (selectedFeedbackId === id) {
      await loadFeedbackDetail(id);
    }
  };

  const handleAddNote = async (id: string, body: string, author: string) => {
    await api.addFeedbackNote(id, { body, author });
    if (selectedFeedbackId === id) {
      await loadFeedbackDetail(id);
    }
  };

  // Criar Novo Módulo via Wizard
  const [savingNewModule, setSavingNewModule] = useState(false);
  const handleCreateModule = async (data: {
    moduleKey: string;
    label: string;
    groupKey: string;
    purpose: string;
    routerPrefix: string;
    frontendPath: string;
  }) => {
    setSavingNewModule(true);
    try {
      await apiJson('/mapa/modules', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          status: 'planned',
          sortOrder: 100,
        }),
      });
      await loadData();
      setActiveTab('mapa');
      setSelectedModuleKey(data.moduleKey);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao criar módulo');
    } finally {
      setSavingNewModule(false);
    }
  };

  // Contagem para badges na sidebar
  const pendingCount = feedbacks.filter((f) => f.status === 'pending' || f.status === 'awaiting_review').length;

  const sidebarItems = [
    { id: 'mapa', label: 'Mapa Arquitetural', icon: Network },
    {
      id: 'fila',
      label: 'Fila de Demandas',
      icon: ListTodo,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { id: 'timeline', label: 'Atividades & Trilha', icon: History },
    { id: 'novo_modulo', label: 'Novo Módulo', icon: Plus },
  ];

  return (
    <AppLayout
      moduleTitle="Desenvolvimento"
      moduleSubtitle="Arquitetura do sistema, fila de demandas e homologação de IA"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as DesenvolvimentoTab);
        setSelectedModuleKey(null);
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col h-full min-h-0 relative">
        {/* Mensagem de Erro Toast */}
        {error && (
          <div className="mx-4 mt-3 p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-bold flex items-center justify-between shadow-2xs shrink-0">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Conteúdo Principal conforme a aba ativa */}
        {loading && !snap ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
            <Loader2 className="h-5 w-5 animate-spin mr-2 text-zinc-400" /> Carregando arquitetura e demandas...
          </div>
        ) : (
          <>
            {activeTab === 'mapa' && (
              <OrganogramaMapCanvas
                snap={snap}
                positions={positions}
                selectedKey={selectedModuleKey}
                scale={scale}
                pan={pan}
                setScale={setScale}
                setPan={setPan}
                onSelectModule={(key) => setSelectedModuleKey(key)}
                onPointerDownNode={onPointerDownNode}
                onPointerMoveNode={onPointerMoveNode}
                onPointerUpNode={onPointerUpNode}
                feedbacks={feedbacks}
              />
            )}

            {activeTab === 'fila' && (
              <DemandasQueueTab
                feedbacks={feedbacks}
                loading={loading}
                selectedId={selectedFeedbackId}
                onSelectFeedback={handleSelectFeedback}
                onRefresh={loadData}
              />
            )}

            {activeTab === 'timeline' && (
              <TimelineAuditTab
                activities={snap?.activity || []}
                loading={loading}
                onRefresh={loadData}
              />
            )}

            {activeTab === 'novo_modulo' && (
              <ModuleCreationWizard
                groups={snap?.groups || []}
                onCreateModule={handleCreateModule}
                saving={savingNewModule}
              />
            )}
          </>
        )}

        {/* Drawer do Módulo Técnico (aberto ao clicar no Mapa) */}
        {selectedModule && (
          <ModuleDetailDrawer
            module={selectedModule}
            onClose={() => setSelectedModuleKey(null)}
            routes={snap?.routes || []}
            edges={snap?.edges || []}
            groupName={selectedModuleGroup}
            feedbacks={feedbacks}
            tasks={snap?.tasksOpen || []}
            onSaveNotes={handleSaveModuleNotes}
            savingNotes={savingModuleNotes}
            onOpenView={onNavigateToView}
            onSelectFeedback={(f) => {
              setSelectedFeedbackId(f.id);
              void loadFeedbackDetail(f.id);
            }}
            onCreateDemanda={(moduleKey) => {
              setActiveTab('novo_modulo');
            }}
          />
        )}

        {/* Drawer de Detalhes da Demanda (aberto ao clicar em um Feedback/Task) */}
        {selectedFeedbackId && (
          <DemandaDetailDrawer
            feedback={feedbackDetail}
            loading={loadingDetail}
            onClose={() => {
              setSelectedFeedbackId(null);
              setFeedbackDetail(null);
            }}
            onUpdateStatus={handleUpdateStatus}
            onUpdatePriority={handleUpdatePriority}
            onAddNote={handleAddNote}
            currentUser={currentUser}
          />
        )}
      </div>
    </AppLayout>
  );
}
