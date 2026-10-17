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
  live: 'bg-emerald-100 text-emerald-800',
  stub: 'bg-zinc-100 text-zinc-600',
  planned: 'bg-amber-100 text-amber-800',
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
                        'absolute w-[180px] cursor-grab rounded-xl border bg-white px-3 py-2 text-left shadow-sm active:cursor-grabbing',
                        active ? 'border-zinc-900 ring-2 ring-zinc-900/15' : 'border-zinc-200 hover:border-zinc-400'
                      )}
                      style={{ left: p.x, top: p.y }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold', STATUS_STYLE[m.status] || STATUS_STYLE.stub)}>
                          {m.status}
                        </span>
                        <span className="truncate text-[10px] font-mono text-zinc-400">{m.moduleKey}</span>
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900">{m.label}</div>
                    </button>
                  );
                })}
              </div>
              <div className="absolute bottom-4 left-4 flex gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
                <button type="button" className="h-8 w-8 rounded-lg bg-zinc-100 font-bold" onClick={() => setScale((s) => Math.min(1.6, s + 0.1))}>
                  +
                </button>
                <button type="button" className="h-8 w-8 rounded-lg bg-zinc-100 font-bold" onClick={() => setScale((s) => Math.max(0.4, s - 0.1))}>
                  −
                </button>
                <button
                  type="button"
                  className="h-8 rounded-lg bg-zinc-100 px-2 text-xs font-semibold"
                  onClick={() => {
                    setScale(0.85);
                    setPan({ x: 40, y: 20 });
                  }}
                >
                  Fit
                </button>
              </div>
            </div>

            <aside className="flex w-[380px] max-w-[42vw] flex-col border-l border-zinc-200 bg-white">
              {selected ? (
                <>
                  <header className="border-b border-zinc-100 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{selected.groupKey}</div>
                    <h2 className="text-lg font-bold tracking-tight text-zinc-900">{selected.label}</h2>
                    <p className="font-mono text-[11px] text-zinc-500">{selected.moduleKey}</p>
                  </header>
                  <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
                    <section>
                      <div className="mb-1 text-[10px] font-bold uppercase text-zinc-400">Visão geral</div>
                      <textarea
                        className="min-h-[72px] w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                        value={editPurpose}
                        onChange={(e) => setEditPurpose(e.target.value)}
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
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="mb-3 flex items-center gap-2 text-sm text-zinc-600">
              <GitBranch className="h-4 w-4" />
              Fila Postgres (`mapa_tasks`) — export: <code className="rounded bg-zinc-100 px-1">GET /api/mapa/tasks/export.md</code>
            </div>
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-zinc-400">{t.id}</span>
                        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold">{t.type}</span>
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', t.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>
                          {t.status}
                        </span>
                      </div>
                      <div className="mt-1 font-semibold text-zinc-900">{t.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">{fmt(t.createdAt)} · {t.createdBy || '—'}</div>
                    </div>
                    {t.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => void markTaskDone(t.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold hover:bg-zinc-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Done
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!tasks.length && <p className="text-sm text-zinc-500">Nenhuma task.</p>}
            </div>
          </div>
        ) : tab === 'registro' ? (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <ul className="space-y-2">
              {activity.map((a) => (
                <li key={a.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                  <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span>{fmt(a.at)}</span>
                    <span className="font-semibold text-zinc-800">{a.actor || 'system'}</span>
                    <span className="rounded bg-zinc-100 px-1.5 font-mono text-[11px]">{a.action}</span>
                  </div>
                  <pre className="mt-1 overflow-auto text-[11px] text-zinc-600">{JSON.stringify(a.meta, null, 0)}</pre>
                </li>
              ))}
              {!activity.length && <p className="text-sm text-zinc-500">Registro vazio.</p>}
            </ul>
          </div>
        ) : tab === 'feedbacks' ? (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="mb-3 flex flex-wrap gap-2">
              {['all', 'pending', 'queued', 'awaiting_review', 'resolved'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFbFilter(s)}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs font-semibold',
                    fbFilter === s ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-700'
                  )}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                className="ml-auto text-xs font-semibold text-zinc-600 underline"
                onClick={() => onBackToHub()}
              >
                Abrir gestão completa no menu do usuário
              </button>
            </div>
            <div className="space-y-2">
              {filteredFb.slice(0, 80).map((f) => (
                <div key={f.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-zinc-400">{f.id.slice(0, 8)}</span>
                    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 font-bold">{f.status}</span>
                    <span className="text-zinc-400">{f.feedbackType}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 font-medium text-zinc-900">{f.description}</p>
                </div>
              ))}
              {!filteredFb.length && <p className="text-sm text-zinc-500">Sem feedbacks.</p>}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
              <h3 className="text-base font-bold">Propor / adicionar módulo</h3>
              <p className="text-sm text-zinc-500">Cria módulo planned + task module_spec no Postgres.</p>
              <label className="block text-xs font-semibold">
                module_key
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-sm"
                  value={addForm.moduleKey}
                  onChange={(e) => setAddForm((f) => ({ ...f, moduleKey: e.target.value }))}
                  placeholder="ex: qualidade_auditoria"
                />
              </label>
              <label className="block text-xs font-semibold">
                Label
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  value={addForm.label}
                  onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-semibold">
                Grupo
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  value={addForm.groupKey}
                  onChange={(e) => setAddForm((f) => ({ ...f, groupKey: e.target.value }))}
                >
                  {groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Purpose
                <textarea
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  value={addForm.purpose}
                  onChange={(e) => setAddForm((f) => ({ ...f, purpose: e.target.value }))}
                />
              </label>
              <button
                type="button"
                disabled={saving || !addForm.moduleKey || !addForm.label}
                onClick={() => void createModule()}
                className="w-full rounded-xl bg-zinc-900 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Criar módulo + task
              </button>
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
