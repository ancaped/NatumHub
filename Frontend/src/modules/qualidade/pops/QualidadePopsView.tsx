import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Layers, Plus, RefreshCw, Search, Settings, Upload } from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import { apiFetch, apiJson } from '../../geral/lib/http';
import PopDrawer from './components/PopDrawer';
import { reviewBadge, type PopDocument, type PopSector, type PopSettings } from './types';

interface Props {
  onBackToHub: () => void;
}

type TabId = 'pops' | 'setores' | 'config';

export default function QualidadePopsView({ onBackToHub }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('pops');
  const [sectors, setSectors] = useState<PopSector[]>([]);
  const [documents, setDocuments] = useState<PopDocument[]>([]);
  const [settings, setSettings] = useState<PopSettings | null>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<PopDocument | null>(null);
  const [newSectorName, setNewSectorName] = useState('');
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLogoBlob = useCallback(async (hasLogo: boolean) => {
    if (!hasLogo) {
      setLogoSrc(null);
      return;
    }
    try {
      const res = await apiFetch('/qualidade/pops/settings/logo');
      if (!res.ok) {
        setLogoSrc(null);
        return;
      }
      const blob = await res.blob();
      setLogoSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch {
      setLogoSrc(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sectorFilter) params.set('sectorId', sectorFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      const qs = params.toString();
      const [secs, docs, sett] = await Promise.all([
        apiJson<PopSector[]>('/qualidade/pops/sectors'),
        apiJson<PopDocument[]>(`/qualidade/pops/documents${qs ? `?${qs}` : ''}`),
        apiJson<PopSettings>('/qualidade/pops/settings'),
      ]);
      setSectors(Array.isArray(secs) ? secs : []);
      setDocuments(Array.isArray(docs) ? docs : []);
      setSettings(sett ?? null);
      await loadLogoBlob(Boolean(sett?.logoRelPath));
      // Alertas em background — evita corrida de DDL no primeiro load
      void apiJson('/qualidade/pops/check-alerts', { method: 'POST' }).catch(() => undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar POPs');
    } finally {
      setLoading(false);
    }
  }, [sectorFilter, statusFilter, search, loadLogoBlob]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    (window as unknown as { __current_page__?: string }).__current_page__ =
      activeTab === 'pops' ? 'POPs' : activeTab === 'setores' ? 'Setores' : 'Configuração';
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (logoSrc) URL.revokeObjectURL(logoSrc);
    };
  }, [logoSrc]);

  const overdueCount = useMemo(
    () => documents.filter((d) => d.status === 'published' && (d.daysToReview ?? 999) < 0).length,
    [documents],
  );

  const sidebarItems = [
    { id: 'pops', label: 'POPs', icon: BookOpen, badge: overdueCount || undefined },
    { id: 'setores', label: 'Setores', icon: Layers },
    { id: 'config', label: 'Configuração', icon: Settings },
  ];

  const openNew = () => {
    setSelected(null);
    setDrawerOpen(true);
  };

  const openDoc = async (doc: PopDocument) => {
    try {
      const full = await apiJson<PopDocument>(`/qualidade/pops/documents/${doc.id}`);
      setSelected(full);
    } catch {
      setSelected(doc);
    }
    setDrawerOpen(true);
  };

  const createSector = async () => {
    if (!newSectorName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson('/qualidade/pops/sectors', {
        method: 'POST',
        body: JSON.stringify({ name: newSectorName.trim() }),
      });
      setNewSectorName('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao criar setor');
    } finally {
      setBusy(false);
    }
  };

  const seedInventory = async (force = false) => {
    setBusy(true);
    setSeedMsg(null);
    setError(null);
    try {
      const res = await apiJson<{
        sectors: number;
        created: number;
        skipped: number;
        bodiesFilled: number;
      }>('/qualidade/pops/seed-inventory', {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      setSeedMsg(
        `Inventário: ${res.created} criados, ${res.skipped} existentes, ${res.bodiesFilled} corpos preenchidos (${res.sectors} setores).`,
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha no seed');
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/qualidade/pops/settings', { method: 'PUT', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'Falha no upload');
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha no upload do logo');
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, PopDocument[]>();
    for (const d of documents) {
      const key = d.sectorName || d.sectorId || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries());
  }, [documents]);

  return (
    <AppLayout
      moduleTitle="POPs"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabId)}
    >
      <div className="flex flex-col h-full p-4 md:p-6 gap-3">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === 'pops' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  className="w-full rounded-lg border border-zinc-300 pl-9 pr-3 py-2 text-sm"
                  placeholder="Buscar código ou título…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
              >
                <option value="">Todos os setores</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos os status</option>
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
                <option value="obsolete">Obsoleto</option>
              </select>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </button>
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm"
              >
                <Plus className="w-4 h-4" />
                Novo POP
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-zinc-500">Carregando…</p>
            ) : documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center space-y-3">
                <p className="text-sm text-zinc-600">Nenhum POP cadastrado.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void seedInventory(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm disabled:opacity-50"
                >
                  Importar inventário (31 POPs)
                </button>
              </div>
            ) : (
              <div className="space-y-5 overflow-y-auto">
                {grouped.map(([sector, docs]) => (
                  <section key={sector}>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                      {sector}
                    </h2>
                    <div className="rounded-xl border border-zinc-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-50 text-zinc-600 text-left">
                          <tr>
                            <th className="px-3 py-2 font-medium">Código</th>
                            <th className="px-3 py-2 font-medium">Título</th>
                            <th className="px-3 py-2 font-medium">Rev.</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Próx. revisão</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.map((d) => {
                            const badge = d.status === 'published' ? reviewBadge(d.daysToReview) : null;
                            return (
                              <tr
                                key={d.id}
                                className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer"
                                onClick={() => void openDoc(d)}
                              >
                                <td className="px-3 py-2 font-mono text-xs">{d.code}</td>
                                <td className="px-3 py-2">{d.title}</td>
                                <td className="px-3 py-2">{d.currentRevision}</td>
                                <td className="px-3 py-2">
                                  <span className="inline-flex items-center gap-1">
                                    {d.status}
                                    {badge && (
                                      <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.className}`}
                                      >
                                        {badge.label}
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-zinc-600">
                                  {d.nextReviewDate?.slice(0, 10) ?? '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'setores' && (
          <div className="max-w-xl space-y-4">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="Nome do setor"
                value={newSectorName}
                onChange={(e) => setNewSectorName(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !newSectorName.trim()}
                onClick={() => void createSector()}
                className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
            <ul className="rounded-xl border border-zinc-200 divide-y divide-zinc-100">
              {sectors.map((s) => (
                <li key={s.id} className="px-3 py-2 flex justify-between text-sm">
                  <span>{s.name}</span>
                  <span className="text-zinc-400 text-xs">{s.active ? 'ativo' : 'inativo'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="max-w-lg space-y-5">
            <section className="space-y-2">
              <p className="text-sm font-medium text-zinc-900">Logo impresso</p>
              <p className="text-xs text-zinc-500">
                Usado no cabeçalho de todos os POPs na impressão / PDF do navegador.
              </p>
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt="Logo POPs"
                  className="h-16 object-contain border border-zinc-200 rounded-lg p-2 bg-white"
                />
              ) : (
                <p className="text-sm text-zinc-500">Nenhum logo configurado.</p>
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 text-sm cursor-pointer">
                <Upload className="w-4 h-4" />
                Enviar logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadLogo(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {settings?.logoRelPath && (
                <p className="text-xs text-zinc-400">{settings.logoRelPath}</p>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium text-zinc-900">Inventário inicial</p>
              <p className="text-xs text-zinc-500">
                Cadastra os 31 POPs do estudo como rascunho (não sobrescreve códigos existentes).
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void seedInventory(false)}
                className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-sm disabled:opacity-50"
              >
                Importar inventário
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void seedInventory(true)}
                className="px-3 py-2 rounded-lg border border-zinc-300 text-sm disabled:opacity-50"
              >
                Reimportar corpos (force)
              </button>
              {seedMsg && <p className="text-sm text-emerald-700">{seedMsg}</p>}
            </section>
          </div>
        )}
      </div>

      <PopDrawer
        open={drawerOpen}
        document={selected}
        sectors={sectors}
        logoSrc={logoSrc}
        onClose={() => setDrawerOpen(false)}
        onSaved={async () => {
          await load();
          if (selected?.id) {
            try {
              const full = await apiJson<PopDocument>(`/qualidade/pops/documents/${selected.id}`);
              setSelected(full);
            } catch {
              /* ignore */
            }
          }
        }}
      />
    </AppLayout>
  );
}
