import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clock, FileText, Layers, List, Plus, RefreshCw, Scale, Search, Settings, Sparkles } from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import { apiJson } from '../../geral/lib/http';
import { loadNatumLogoDataUrl } from '../../geral/lib/logoUtils';
import PopDrawer from './components/PopDrawer';
import { useEmitirLote } from './components/EmitirLote';
import { useAviso } from '../../geral/components/ui/Aviso';
import FormulariosTab from './components/FormulariosTab';
import ListaMestraTab from './components/ListaMestraTab';
import NormasTab from './components/NormasTab';
import { reviewBadge, type PopDocument, type PopSector, type PopSettings } from './types';

interface Props {
  onBackToHub: () => void;
}

type TabId = 'pops' | 'formularios' | 'lista' | 'normas' | 'setores' | 'config';

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
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const { avisar, aviso } = useAviso();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sectorFilter) params.set('sectorId', sectorFilter);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
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
      // Alertas em background — evita corrida de DDL no primeiro load
      void apiJson('/qualidade/pops/check-alerts', { method: 'POST' }).catch(() => undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar POPs');
    } finally {
      setLoading(false);
    }
  }, [sectorFilter, statusFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const { abrir: abrirLote, elemento: loteElemento } = useEmitirLote(avisar, () => {
    setMarcados(new Set());
    void load();
  });

  useEffect(() => {
    (window as unknown as { __current_page__?: string }).__current_page__ =
      activeTab === 'pops' ? 'POPs' : activeTab === 'formularios' ? 'Formulários' : activeTab === 'lista' ? 'Lista mestra' : activeTab === 'normas' ? 'Normas e regras' : activeTab === 'setores' ? 'Setores' : 'Configuração';
  }, [activeTab]);

  // Logo único: o geral (Configurações → Identidade & Logo)
  useEffect(() => {
    let vivo = true;
    void loadNatumLogoDataUrl().then((url) => {
      if (vivo) setLogoSrc(url || null);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const overdueCount = useMemo(
    () => documents.filter((d) => d.status === 'published' && (d.daysToReview ?? 999) < 0).length,
    [documents],
  );

  const publishedCount = useMemo(
    () => documents.filter((d) => d.status === 'published').length,
    [documents],
  );

  const draftCount = useMemo(
    () => documents.filter((d) => d.status === 'draft').length,
    [documents],
  );

  const sidebarItems = [
    { id: 'pops', label: 'POPs', icon: BookOpen, badge: overdueCount || undefined },
    { id: 'formularios', label: 'Formulários', icon: FileText },
    { id: 'lista', label: 'Lista mestra', icon: List },
    { id: 'normas', label: 'Normas e regras', icon: Scale },
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
        `Inventário atualizado: ${res.created} criados, ${res.skipped} verificados, ${res.bodiesFilled} corpos sanitizados (${res.sectors} setores).`,
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha no seed');
    } finally {
      setBusy(false);
    }
  };

  const visiveis = useMemo(
    () => (statusFilter === '' ? documents.filter((d) => d.status !== 'obsolete') : documents),
    [documents, statusFilter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, PopDocument[]>();
    for (const d of visiveis) {
      const key = d.sectorName || d.sectorId || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries());
  }, [visiveis]);

  const emitivel = (d: PopDocument) => d.status === 'draft' || d.status === 'in_review';

  const alternarMarca = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });

  const alternarSetor = (docs: PopDocument[]) =>
    setMarcados((atual) => {
      const ids = docs.filter(emitivel).map((d) => d.id);
      const novo = new Set(atual);
      if (ids.every((id) => novo.has(id))) ids.forEach((id) => novo.delete(id));
      else ids.forEach((id) => novo.add(id));
      return novo;
    });

  const emitir = (ids: string[], descricao: string) =>
    abrirLote({ url: '/qualidade/pops/documents/emitir-lote', selecao: { ids }, descricao, tipo: 'POPs' });

  return (
    <AppLayout
      moduleTitle="POPs"
      onBackToHub={onBackToHub}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as TabId)}
    >
      <div className="flex flex-col h-full p-4 md:p-6 gap-4 overflow-y-auto">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {activeTab === 'pops' && (
          <>
            {/* Toolbar de Pesquisa e Filtros */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-zinc-200/80 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    className="w-full rounded-xl border border-zinc-200 pl-9 pr-3 py-2 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-all"
                    placeholder="Buscar código ou título…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:border-zinc-400 transition-all"
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
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:border-zinc-400 transition-all"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Em uso</option>
                  <option value="all">Todos os status</option>
                  <option value="published">Publicado</option>
                  <option value="draft">Rascunho</option>
                  <option value="in_review">Em aprovação</option>
                  <option value="obsolete">Obsoleto</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 hover:border-zinc-300 text-sm font-medium text-zinc-700 bg-white hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  <RefreshCw className="w-4 h-4 text-zinc-500" />
                  Atualizar
                </button>
                {marcados.size > 0 && (
                  <button
                    type="button"
                    onClick={() => emitir(Array.from(marcados), `${marcados.size} ${marcados.size === 1 ? 'POP selecionado' : 'POPs selecionados'}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-sm font-semibold text-emerald-800 transition-colors shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Emitir selecionados ({marcados.size})
                  </button>
                )}
                <button
                  type="button"
                  onClick={openNew}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Novo POP
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-zinc-500">Carregando procedimentos…</div>
            ) : documents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center space-y-4 bg-white shadow-sm">
                <BookOpen className="w-10 h-10 text-zinc-400 mx-auto" />
                <div className="max-w-md mx-auto">
                  <h3 className="text-base font-semibold text-zinc-900">Nenhum POP encontrado</h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    Não existem procedimentos operacionais cadastrados para os filtros selecionados.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void seedInventory(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Importar Inventário Oficial (52 novos)
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.map(([sector, docs]) => (
                  <section key={sector} className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-zinc-50/70 border-b border-zinc-200/70 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar os POPs emitíveis de ${sector}`}
                          title="Selecionar rascunhos e em aprovação do setor"
                          disabled={!docs.some(emitivel)}
                          checked={docs.some(emitivel) && docs.filter(emitivel).every((d) => marcados.has(d.id))}
                          onChange={() => alternarSetor(docs)}
                          className="w-4 h-4 accent-zinc-900 cursor-pointer disabled:cursor-default"
                        />
                        <Layers className="w-4 h-4 text-zinc-500" />
                        <h2 className="text-sm font-bold text-zinc-800 tracking-wide uppercase">
                          {sector}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2">
                        {docs.some(emitivel) && (
                          <button
                            type="button"
                            onClick={() => emitir(docs.filter(emitivel).map((d) => d.id), `${docs.filter(emitivel).length} POPs do setor ${sector}`)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700"
                          >
                            Emitir setor
                          </button>
                        )}
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-200/60 text-zinc-700">
                          {docs.length} {docs.length === 1 ? 'procedimento' : 'procedimentos'}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left table-fixed">
                        <thead className="bg-zinc-50/70 text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-200/80">
                          <tr>
                            <th className="w-10 px-4 py-3" />
                            <th className="w-36 px-4 py-3 font-semibold text-left">Código</th>
                            <th className="px-4 py-3 font-semibold text-left">Título do POP</th>
                            <th className="w-28 px-4 py-3 font-semibold text-center">Revisão</th>
                            <th className="w-44 px-4 py-3 font-semibold text-center">Status</th>
                            <th className="w-40 px-4 py-3 font-semibold text-right">Próxima Revisão</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {docs.map((d) => {
                            const badge = d.status === 'published' ? reviewBadge(d.daysToReview) : null;
                            const isPublished = d.status === 'published';
                            const isDraft = d.status === 'draft';

                            return (
                              <tr
                                key={d.id}
                                className="hover:bg-zinc-50/80 cursor-pointer transition-colors group"
                                onClick={() => void openDoc(d)}
                              >
                                <td className="w-10 px-4 py-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                  {emitivel(d) && (
                                    <input
                                      type="checkbox"
                                      aria-label={`Selecionar ${d.code}`}
                                      checked={marcados.has(d.id)}
                                      onChange={() => alternarMarca(d.id)}
                                      className="w-4 h-4 accent-zinc-900 cursor-pointer"
                                    />
                                  )}
                                </td>
                                <td className="w-36 px-4 py-3.5 font-mono text-xs font-bold text-zinc-900 group-hover:text-black align-middle text-left truncate">
                                  {d.code}
                                </td>
                                <td className="px-4 py-3.5 font-medium text-zinc-900 align-middle text-left truncate">
                                  {d.title}
                                </td>
                                <td className="w-28 px-4 py-3.5 text-center align-middle">
                                  <span className="inline-flex items-center justify-center min-w-[3.5rem] px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-800 text-xs font-semibold border border-zinc-200">
                                    Rev {String(d.currentRevision).padStart(2, '0')}
                                  </span>
                                </td>
                                <td className="w-44 px-4 py-3.5 text-center align-middle">
                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    {isPublished && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        Vigente
                                      </span>
                                    )}
                                    {isDraft && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        Rascunho
                                      </span>
                                    )}
                                    {d.status === 'in_review' && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                                        Em aprovação
                                      </span>
                                    )}
                                    {d.status === 'obsolete' && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                                        Obsoleto
                                      </span>
                                    )}
                                    {badge && (
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${badge.className}`}>
                                        {badge.label}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="w-40 px-4 py-3.5 text-right align-middle text-zinc-600 text-xs font-medium">
                                  {d.nextReviewDate?.slice(0, 10) ? (
                                    <span className="inline-flex items-center justify-end gap-1 w-full">
                                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                                      {d.nextReviewDate.slice(0, 10)}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
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
          <div className="max-w-xl space-y-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-sm">
            <h2 className="text-base font-bold text-zinc-900">Setores Cadastrados</h2>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-zinc-200 px-3.5 py-2 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-all"
                placeholder="Nome do novo setor"
                value={newSectorName}
                onChange={(e) => setNewSectorName(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !newSectorName.trim()}
                onClick={() => void createSector()}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
              >
                Adicionar
              </button>
            </div>
            <ul className="rounded-xl border border-zinc-200/80 divide-y divide-zinc-100 overflow-hidden">
              {sectors.map((s) => (
                <li key={s.id} className="px-4 py-3 flex items-center justify-between text-sm hover:bg-zinc-50/50">
                  <span className="font-medium text-zinc-800">{s.name}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-500'}`}>
                    {s.active ? 'Ativo' : 'Inativo'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'formularios' && <FormulariosTab logoSrc={logoSrc} />}

        {activeTab === 'lista' && <ListaMestraTab />}

        {activeTab === 'normas' && <NormasTab />}

        {activeTab === 'config' && (
          <div className="max-w-xl space-y-6 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-sm">
            <section className="space-y-3">
              <h2 className="text-base font-bold text-zinc-900">Sincronização do Inventário de POPs</h2>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Carrega o acervo original dos POPs cadastrados com limpeza automática de cabeçalhos e separação de revisões.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void seedInventory(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
                >
                  Importar Inventário (52 novos)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void seedInventory(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  Reimportar e Sanitizar Corpos (Force)
                </button>
              </div>
              {seedMsg && <p className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{seedMsg}</p>}
            </section>
          </div>
        )}
      </div>

      {loteElemento}
      {aviso}

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
