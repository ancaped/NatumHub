import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  GitBranch,
  History,
  LayoutGrid,
  ListTodo,
  Loader2,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  Save,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Check,
} from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import { apiJson } from '../lib/http';
import { api } from '../lib/api';
import type { Feedback } from '../lib/types';
import { cn } from '../lib/utils';
import type {
  MapaActivity,
  MapaDetail,
  MapaGroup,
  MapaSnapshot,
  MapaTask,
} from './types';

interface Props {
  onBackToHub: () => void;
}

type TabId = 'org' | 'tasks' | 'registro' | 'feedbacks' | 'propor';

const STATUS_STYLE: Record<string, string> = {
  live: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold',
  stub: 'bg-zinc-100 text-zinc-600 border border-zinc-200 font-medium',
  planned: 'bg-amber-50 text-amber-700 border border-amber-200 font-bold',
};

function fmt(raw?: string | null) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function MapaArquiteturaView({ onBackToHub }: Props) {
  const [tab, setTab] = useState<TabId>('org');
  const [snap, setSnap] = useState<MapaSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editPurpose, setEditPurpose] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ moduleKey: '', label: '', groupKey: 'administrativo', purpose: '' });
  const [tasks, setTasks] = useState<MapaTask[]>([]);
  const [activity, setActivity] = useState<MapaActivity[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [fbFilter, setFbFilter] = useState('all');
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 40, y: 20 });
  const dragRef = useRef<{
    key: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const panDrag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await apiJson<MapaSnapshot>('/mapa/snapshot');
      setSnap(s);
      const pos: Record<string, { x: number; y: number }> = {};
      for (const m of s.modules) pos[m.moduleKey] = { x: m.posX, y: m.posY };
      setPositions(pos);
      setTasks(s.tasksOpen || []);
      setActivity(s.activity || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar mapa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== 'tasks') return;
    void apiJson<MapaTask[]>('/mapa/tasks?limit=200')
      .then(setTasks)
      .catch(() => undefined);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'registro') return;
    void apiJson<MapaActivity[]>('/mapa/activity?limit=200')
      .then(setActivity)
      .catch(() => undefined);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'feedbacks') return;
    void api
      .getFeedbacksManage()
      .then(setFeedbacks)
      .catch(() => setFeedbacks([]));
  }, [tab]);

  const groups = useMemo(
    () => [...(snap?.groups || [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [snap]
  );

  const selected = useMemo(
    () => snap?.modules.find((m) => m.moduleKey === selectedKey) || null,
    [snap, selectedKey]
  );

  useEffect(() => {
    if (!selected) return;
    setEditPurpose(selected.purpose);
    const d = (selected.detail || {}) as MapaDetail;
    setEditNotes(d.notes || '');
  }, [selected?.moduleKey]);

  const selectModule = (key: string) => {
    setSelectedKey(key);
  };

  const persistLayout = async (keys: string[]) => {
    const items = keys.map((k) => ({
      moduleKey: k,
      posX: positions[k]?.x ?? 0,
      posY: positions[k]?.y ?? 0,
    }));
    await apiJson('/mapa/layout', {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
    await load();
  };

  const onNodePointerDown = (e: React.PointerEvent, key: string) => {
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

  const onNodePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    setPositions((prev) => ({
      ...prev,
      [d.key]: { x: d.origX + dx, y: d.origY + dy },
    }));
  };

  const onNodePointerUp = async () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    try {
      await persistLayout([d.key]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar layout');
    }
  };

  const saveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const detail: MapaDetail = {
        ...((selected.detail || {}) as MapaDetail),
        notes: editNotes,
      };
      await apiJson(`/mapa/modules/${encodeURIComponent(selected.moduleKey)}`, {
        method: 'PUT',
        body: JSON.stringify({ purpose: editPurpose, detail }),
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const createModule = async () => {
    setSaving(true);
    try {
      await apiJson('/mapa/modules', {
        method: 'POST',
        body: JSON.stringify({
          moduleKey: addForm.moduleKey.trim(),
          groupKey: addForm.groupKey,
          label: addForm.label.trim(),
          purpose: addForm.purpose || undefined,
          posX: 80,
          posY: 120,
        }),
      });
      setAddOpen(false);
      setAddForm({ moduleKey: '', label: '', groupKey: 'administrativo', purpose: '' });
      await load();
      setTab('tasks');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao criar módulo');
    } finally {
      setSaving(false);
    }
  };

  const markTaskDone = async (id: string) => {
    await apiJson(`/mapa/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    });
    const rows = await apiJson<MapaTask[]>('/mapa/tasks?limit=200');
    setTasks(rows);
    await load();
  };

  const resync = async () => {
    setSaving(true);
    try {
      await apiJson('/mapa/resync-scan', { method: 'POST', body: '{}' });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha no resync');
    } finally {
      setSaving(false);
    }
  };

  const edgesSvg = useMemo(() => {
    if (!snap) return null;
    return snap.edges.map((e) => {
      const a = positions[e.fromKey];
      const b = positions[e.toKey];
      if (!a || !b) return null;
      const x1 = a.x + 90;
      const y1 = a.y + 28;
      const x2 = b.x + 90;
      const y2 = b.y + 28;
      return (
        <line
          key={e.id}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#a1a1aa"
          strokeWidth={1.5}
          markerEnd="url(#arrow)"
        />
      );
    });
  }, [snap, positions]);

  const filteredFb = useMemo(() => {
    if (fbFilter === 'all') return feedbacks;
    return feedbacks.filter((f) => f.status === fbFilter);
  }, [feedbacks, fbFilter]);

  const sidebarItems = [
    { id: 'org', label: 'Organograma', icon: Network },
    { id: 'tasks', label: 'Tasks', icon: ListTodo, badge: tasks.filter((t) => t.status === 'open').length || undefined },
    { id: 'registro', label: 'Registro', icon: History },
    { id: 'feedbacks', label: 'Feedbacks', icon: MessageSquare },
    { id: 'propor', label: 'Propor', icon: Plus },
  ];

  return (
    <AppLayout
      moduleTitle="Mapa operacional"
      moduleSubtitle="Organograma · Postgres"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={tab}
      onTabChange={(id) => setTab(id as TabId)}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void resync()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', saving && 'animate-spin')} />
            Resync rotas
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Módulo
          </button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {error && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loading && !snap ? (
          <div className="flex flex-1 items-center justify-center text-zinc-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando snapshot…
          </div>
        ) : tab === 'org' ? (
          <div className="relative flex min-h-0 flex-1">
            <div
              className="relative flex-1 overflow-hidden bg-[linear-gradient(to_right,rgba(228,228,231,.55)_1px,transparent_1px),linear-gradient(to_bottom,rgba(228,228,231,.55)_1px,transparent_1px)] bg-[size:24px_24px]"
              onPointerDown={(e) => {
                if (dragRef.current) return;
                panDrag.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
              }}
              onPointerMove={(e) => {
                if (dragRef.current) {
                  onNodePointerMove(e);
                  return;
                }
                const p = panDrag.current;
                if (!p) return;
                setPan({ x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) });
              }}
              onPointerUp={() => {
                panDrag.current = null;
                void onNodePointerUp();
              }}
            >
              <div
                className="absolute origin-top-left"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
              >
                <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={4000} height={2000}>
                  <defs>
                    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="#a1a1aa" />
                    </marker>
                  </defs>
                  {edgesSvg}
                </svg>
                {groups.map((g: MapaGroup) => {
                  const kids = (snap?.modules || []).filter((m) => m.groupKey === g.key);
                  const xs = kids.map((m) => positions[m.moduleKey]?.x ?? m.posX);
                  const ys = kids.map((m) => positions[m.moduleKey]?.y ?? m.posY);
                  if (!xs.length) return null;
                  const minX = Math.min(...xs) - 16;
                  const minY = Math.min(...ys) - 36;
                  const maxX = Math.max(...xs) + 200;
                  const maxY = Math.max(...ys) + 70;
                  return (
                    <div
                      key={g.key}
                      className="pointer-events-none absolute rounded-2xl border border-zinc-200/80 bg-white/40"
                      style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY }}
                    >
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                        {g.label}
                      </div>
                    </div>
                  );
                })}
                {(snap?.modules || []).map((m) => {
                  const p = positions[m.moduleKey] || { x: m.posX, y: m.posY };
                  const active = selectedKey === m.moduleKey;
                  return (
                    <button
                      key={m.moduleKey}
                      type="button"
                      onPointerDown={(e) => onNodePointerDown(e, m.moduleKey)}
                      onClick={() => selectModule(m.moduleKey)}
                      className={cn(
                        'absolute w-[190px] cursor-grab rounded-2xl border bg-white p-3 text-left shadow-xs transition-all active:cursor-grabbing hover:shadow-md',
                        active
                          ? 'border-zinc-950 ring-2 ring-zinc-950/20 shadow-md z-20'
                          : 'border-zinc-200 hover:border-zinc-300'
                      )}
                      style={{ left: p.x, top: p.y }}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className={cn('rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider', STATUS_STYLE[m.status] || STATUS_STYLE.stub)}>
                          {m.status}
                        </span>
                        <span className="truncate text-[10px] font-mono text-zinc-400">{m.moduleKey}</span>
                      </div>
                      <div className="truncate text-xs font-bold text-zinc-900 leading-tight">{m.label}</div>
                    </button>
                  );
                })}
              </div>
              <div className="absolute bottom-5 left-5 flex items-center gap-1 rounded-2xl border border-zinc-200 bg-white/95 backdrop-blur-md p-1 shadow-md z-30">
                <button
                  type="button"
                  title="Aproximar zoom"
                  className="h-8 w-8 rounded-xl hover:bg-zinc-100 flex items-center justify-center text-zinc-700 transition-colors cursor-pointer"
                  onClick={() => setScale((s) => Math.min(1.6, s + 0.1))}
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Afastar zoom"
                  className="h-8 w-8 rounded-xl hover:bg-zinc-100 flex items-center justify-center text-zinc-700 transition-colors cursor-pointer"
                  onClick={() => setScale((s) => Math.max(0.4, s - 0.1))}
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <div className="h-4 w-[1px] bg-zinc-200 mx-0.5" />
                <button
                  type="button"
                  title="Enquadrar visualização"
                  className="h-8 px-2.5 rounded-xl hover:bg-zinc-100 flex items-center gap-1.5 text-xs font-bold text-zinc-700 transition-colors cursor-pointer"
                  onClick={() => {
                    setScale(0.85);
                    setPan({ x: 40, y: 20 });
                  }}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Ajustar</span>
                </button>
              </div>
            </div>

            <aside className="flex w-[390px] max-w-[42vw] flex-col border-l border-zinc-200 bg-white shadow-xs">
              {selected ? (
                <>
                  <header className="border-b border-zinc-150 px-5 py-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-0.5">
                        {selected.groupKey}
                      </span>
                      <h2 className="text-base font-black tracking-tight text-zinc-900 truncate">
                        {selected.label}
                      </h2>
                      <p className="font-mono text-[11px] font-bold text-zinc-500 mt-0.5">{selected.moduleKey}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedKey(null)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer shrink-0"
                      title="Fechar detalhes"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </header>
                  <div className="flex-1 space-y-4 overflow-auto p-5 text-sm">
                    <section>
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Visão geral / Propósito</div>
                      <textarea
                        className="min-h-[80px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs leading-relaxed focus:ring-1 focus:ring-zinc-950 focus:outline-none bg-zinc-50/50"
                        value={editPurpose}
                        onChange={(e) => setEditPurpose(e.target.value)}
                        placeholder="Descreva a finalidade e responsabilidade deste módulo..."
                      />
                    </section>
                    <section>
                      <div className="mb-1 text-[10px] font-bold uppercase text-zinc-400">Abas / UI</div>
                      {((selected.detail as MapaDetail)?.tabs || []).length ? (
                        <ul className="space-y-1">
                          {((selected.detail as MapaDetail).tabs || []).map((t) => (
                            <li key={t.id} className="rounded-lg border border-zinc-100 px-2 py-1.5">
                              <div className="font-semibold">{t.label}</div>
                              <div className="text-xs text-zinc-500">{t.desc}</div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-zinc-400">Sem abas curadas.</p>
                      )}
                    </section>
                    <section>
                      <div className="mb-1 text-[10px] font-bold uppercase text-zinc-400">Funções</div>
                      {((selected.detail as MapaDetail)?.functions || []).length ? (
                        <ul className="space-y-1">
                          {((selected.detail as MapaDetail).functions || []).map((f) => (
                            <li key={f.name} className="text-xs">
                              <code className="rounded bg-zinc-100 px-1 font-mono">{f.name}</code> — {f.desc}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-zinc-400">—</p>
                      )}
                    </section>
                    <section>
                      <div className="mb-1 text-[10px] font-bold uppercase text-zinc-400">Rotas</div>
                      <ul className="max-h-36 space-y-1 overflow-auto text-xs">
                        {(snap?.routes || [])
                          .filter((r) => r.moduleKey === selected.moduleKey || (selected.routerPrefix && r.path.startsWith(selected.routerPrefix)))
                          .slice(0, 40)
                          .map((r) => (
                            <li key={r.id} className="font-mono text-[11px]">
                              <span className="text-zinc-400">{(r.methods || []).join(',')}</span> {r.path}
                            </li>
                          ))}
                      </ul>
                    </section>
                    <section>
                      <div className="mb-1 text-[10px] font-bold uppercase text-zinc-400">Código</div>
                      <p className="text-xs text-zinc-600">{selected.frontendPath || '—'}</p>
                      <p className="text-xs text-zinc-600">{selected.backendPath || '—'}</p>
                      {((selected.detail as MapaDetail)?.codeRefs || []).map((c) => (
                        <p key={c} className="font-mono text-[11px] text-zinc-500">
                          {c}
                        </p>
                      ))}
                    </section>
                    <section>
                      <div className="mb-1 text-[10px] font-bold uppercase text-zinc-400">Conexões</div>
                      <ul className="space-y-1 text-xs">
                        {(snap?.edges || [])
                          .filter((e) => e.fromKey === selected.moduleKey || e.toKey === selected.moduleKey)
                          .map((e) => (
                            <li key={e.id}>
                              <span className="font-semibold">{e.fromKey}</span> → {e.toKey}{' '}
                              <span className="text-zinc-400">({e.kind})</span>
                              {e.note ? <span className="text-zinc-500"> — {e.note}</span> : null}
                            </li>
                          ))}
                      </ul>
                    </section>
                    <section>
                      <div className="mb-1 text-[10px] font-bold uppercase text-zinc-400">Notas</div>
                      <textarea
                        className="min-h-[80px] w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                      />
                    </section>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveDetail()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      Salvar detalhe
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-zinc-500">
                  <LayoutGrid className="h-8 w-8 text-zinc-300" />
                  <p className="text-sm">Selecione um módulo no organograma.</p>
                  <p className="text-xs">Administrativo / Linha de Produtos vem primeiro (sort_order).</p>
                </div>
              )}
            </aside>
          </div>
        ) : tab === 'tasks' ? (
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs">
              <div className="flex items-center gap-2.5 text-xs text-zinc-700">
                <GitBranch className="h-4 w-4 text-indigo-600" />
                <span className="font-bold">Fila de Tarefas Arquiteturais (<code className="font-mono text-zinc-900 bg-zinc-100 px-1 py-0.5 rounded">mapa_tasks</code>)</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500">Persistência contínua no PostgreSQL</span>
              </div>
              <span className="text-[11px] font-bold text-zinc-500 tabular-nums bg-zinc-100 px-2.5 py-1 rounded-lg">
                {tasks.filter((t) => t.status === 'open').length} pendente(s)
              </span>
            </div>
            <div className="space-y-2.5">
              {tasks.map((t) => (
                <div key={t.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs hover:border-zinc-300 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">
                          {t.id.slice(0, 8)}
                        </span>
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-700 uppercase tracking-wider">
                          {t.type}
                        </span>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          t.status === 'open'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        )}>
                          {t.status === 'open' ? 'Pendente' : 'Concluído'}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-zinc-900 leading-snug">{t.title}</div>
                      <div className="text-xs text-zinc-500 flex items-center gap-2">
                        <span>{fmt(t.createdAt)}</span>
                        {t.createdBy && (
                          <>
                            <span>·</span>
                            <span>Criado por <strong>{t.createdBy}</strong></span>
                          </>
                        )}
                      </div>
                    </div>
                    {t.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => void markTaskDone(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-2xs cursor-pointer transition-all shrink-0"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Concluir</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!tasks.length && (
                <div className="py-12 text-center text-zinc-400 text-xs">
                  Nenhuma tarefa arquitetural na fila.
                </div>
              )}
            </div>
          </div>
        ) : tab === 'registro' ? (
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs">
              <div className="flex items-center gap-2.5 text-xs text-zinc-700">
                <History className="h-4 w-4 text-zinc-500" />
                <span className="font-bold">Registro de Atividades Arquiteturais</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500">Histórico cronológico de alterações nos módulos e conexões</span>
              </div>
              <span className="text-[11px] font-bold text-zinc-500 tabular-nums bg-zinc-100 px-2.5 py-1 rounded-lg">
                {activity.length} evento(s)
              </span>
            </div>
            <ul className="space-y-2.5">
              {activity.map((a) => (
                <li key={a.id} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-2xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-zinc-900">{a.actor || 'system'}</span>
                      <span className="rounded-md bg-zinc-100 border border-zinc-200 px-2 py-0.5 font-mono text-[11px] font-bold text-zinc-700">
                        {a.action}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-400 font-bold">{fmt(a.at)}</span>
                  </div>
                  {a.meta && Object.keys(a.meta).length > 0 && (
                    <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-150 font-mono text-[11px] text-zinc-700 overflow-x-auto">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(a.meta, null, 2)}</pre>
                    </div>
                  )}
                </li>
              ))}
              {!activity.length && (
                <div className="py-12 text-center text-zinc-400 text-xs">
                  Nenhum registro de atividade recente.
                </div>
              )}
            </ul>
          </div>
        ) : tab === 'feedbacks' ? (
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-200 bg-white shadow-2xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'pending', label: 'Triagem' },
                  { id: 'queued', label: 'Na fila' },
                  { id: 'awaiting_review', label: 'Em aberto' },
                  { id: 'resolved', label: 'Finalizados' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFbFilter(id)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer',
                      fbFilter === id
                        ? 'bg-zinc-900 text-white shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs font-bold text-zinc-400">
                {filteredFb.length} feedback(s)
              </span>
            </div>
            <div className="space-y-2.5">
              {filteredFb.slice(0, 80).map((f) => (
                <div key={f.id} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-2xs hover:border-zinc-300 transition-all space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">
                        {f.id.slice(0, 8)}
                      </span>
                      <span className="rounded-full bg-zinc-100 border border-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 capitalize">
                        {f.feedbackType}
                      </span>
                    </div>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-700 border border-zinc-200">
                      {f.status}
                    </span>
                  </div>
                  <p className="font-semibold text-zinc-900 leading-snug">{f.description}</p>
                </div>
              ))}
              {!filteredFb.length && (
                <div className="py-12 text-center text-zinc-400 text-xs">
                  Nenhum feedback encontrado neste filtro.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="mx-auto max-w-lg space-y-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="border-b border-zinc-150 pb-3">
                <h3 className="text-base font-black tracking-tight text-zinc-900">Propor / Adicionar Novo Módulo</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Registra uma nova proposta de módulo com status <code className="font-mono text-zinc-700 bg-zinc-100 px-1 py-0.5 rounded">planned</code> e gera a tarefa arquitetural correspondente no PostgreSQL.
                </p>
              </div>

              <div className="space-y-3 text-left">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Chave do Módulo (module_key)
                  </label>
                  <input
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-zinc-50"
                    value={addForm.moduleKey}
                    onChange={(e) => setAddForm((f) => ({ ...f, moduleKey: e.target.value }))}
                    placeholder="ex: qualidade_auditoria"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Nome de Exibição (label)
                  </label>
                  <input
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-zinc-50"
                    value={addForm.label}
                    onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="ex: Auditoria de Qualidade"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Grupo de Setor
                  </label>
                  <select
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-white"
                    value={addForm.groupKey}
                    onChange={(e) => setAddForm((f) => ({ ...f, groupKey: e.target.value }))}
                  >
                    {groups.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label} ({g.key})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                    Finalidade / Propósito Inicial
                  </label>
                  <textarea
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs leading-relaxed focus:ring-1 focus:ring-zinc-900 focus:outline-none bg-zinc-50 min-h-[90px]"
                    value={addForm.purpose}
                    onChange={(e) => setAddForm((f) => ({ ...f, purpose: e.target.value }))}
                    placeholder="Qual problema operacional este módulo resolve?"
                  />
                </div>

                <button
                  type="button"
                  disabled={saving || !addForm.moduleKey.trim() || !addForm.label.trim()}
                  onClick={() => void createModule()}
                  className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white py-2.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Cadastrar Módulo e Gerar Task
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">+ Módulo</h3>
              <button type="button" onClick={() => setAddOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-sm"
                placeholder="module_key"
                value={addForm.moduleKey}
                onChange={(e) => setAddForm((f) => ({ ...f, moduleKey: e.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                placeholder="Label"
                value={addForm.label}
                onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
              />
              <select
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                value={addForm.groupKey}
                onChange={(e) => setAddForm((f) => ({ ...f, groupKey: e.target.value }))}
              >
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
              <textarea
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                placeholder="Purpose"
                value={addForm.purpose}
                onChange={(e) => setAddForm((f) => ({ ...f, purpose: e.target.value }))}
              />
              <button
                type="button"
                disabled={saving || !addForm.moduleKey || !addForm.label}
                onClick={() => void createModule()}
                className="w-full rounded-xl bg-zinc-900 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
