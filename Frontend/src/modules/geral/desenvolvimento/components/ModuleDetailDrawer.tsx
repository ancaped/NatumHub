import React, { useState, useEffect } from 'react';
import {
  X, ExternalLink, Route, Bug, ListTodo, FileText, CheckCircle2,
  Clock, Shield, ArrowRight, Save, Loader2, Plus, Code, Network,
  Copy, Check
} from 'lucide-react';
import type { MapaModule, MapaEdge, Feedback, MapaTask, MapaDetail, CatalogoAcao } from '../types';
import { chamadoAberto, chamadoDoModulo } from '../vinculo';
import { cn } from '../../lib/utils';
import Drawer from '../../components/ui/Drawer';

interface ModuleDetailDrawerProps {
  module: MapaModule | null;
  onClose: () => void;
  acoes?: CatalogoAcao[];
  edges: MapaEdge[];
  groupName?: string;
  feedbacks: Feedback[];
  tasks: MapaTask[];
  onSaveNotes: (notes: string) => Promise<void>;
  savingNotes: boolean;
  onOpenView?: (view: string) => void;
  onSelectFeedback?: (feedback: Feedback) => void;
  onCreateDemanda?: (moduleKey: string, description: string, feedbackType: string) => Promise<void>;
  onSelectModule?: (moduleKey: string) => void;
}

type DrawerTab = 'tecnica' | 'demandas' | 'tasks' | 'documentacao';

const STATUS_STYLE: Record<string, string> = {
  live: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  stub: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  planned: 'bg-amber-50 text-amber-800 border-amber-200',
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  POST: 'bg-sky-50 text-sky-700 border-sky-200',
  PUT: 'bg-amber-50 text-amber-700 border-amber-200',
  PATCH: 'bg-violet-50 text-violet-700 border-violet-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
};

/** Agrupa itens por módulo, sem repetir o texto. */
function agrupar<T>(itens: T[], chave: (i: T) => string, texto: (i: T) => string): { modulo: string; itens: string[] }[] {
  const m = new Map<string, Set<string>>();
  for (const i of itens) {
    const k = chave(i);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(texto(i));
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([modulo, set]) => ({ modulo, itens: [...set] }));
}

function SecaoGerada({ titulo, total, vazio, children }: { titulo: string; total: number; vazio: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2 shadow-2xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
        {titulo} (gerado do código) ({total})
      </span>
      {total > 0 ? <div className="max-h-64 overflow-y-auto pr-1">{children}</div> : <p className="text-xs text-zinc-400 italic py-1">{vazio}</p>}
    </div>
  );
}

function ListaTabelas({ rotulo, classe, itens }: { rotulo: string; classe: string; itens: string[] }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0', classe)}>{rotulo}</span>
      <div className="flex flex-wrap gap-1">
        {itens.map((t) => (
          <code key={t} className="font-mono text-[11px] text-zinc-800 bg-zinc-50 border border-zinc-200 px-1.5 rounded">{t}</code>
        ))}
      </div>
    </div>
  );
}

function LinhaModulo({ modulo, itens, onSelect }: { modulo: string; itens: string[]; onSelect?: (key: string) => void }) {
  return (
    <div className="py-1.5 border-t border-zinc-100 first:border-t-0 text-xs space-y-0.5">
      <button
        type="button"
        onClick={() => onSelect?.(modulo)}
        className="font-mono text-[11px] font-semibold text-zinc-800 bg-white border border-zinc-200 hover:border-zinc-400 px-2 py-0.5 rounded-md cursor-pointer"
      >
        {modulo}
      </button>
      <p className="font-mono text-[10px] text-zinc-500 break-all">{itens.join(' · ')}</p>
    </div>
  );
}

export default function ModuleDetailDrawer({
  module,
  onClose,
  acoes = [],
  edges,
  groupName,
  feedbacks,
  tasks,
  onSaveNotes,
  savingNotes,
  onOpenView,
  onSelectFeedback,
  onCreateDemanda,
  onSelectModule,
}: ModuleDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('tecnica');
  const [notes, setNotes] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [acaoAberta, setAcaoAberta] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportType, setReportType] = useState('feedback');
  const [reportSaving, setReportSaving] = useState(false);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  useEffect(() => {
    if (module) {
      const d = (module.detail || {}) as MapaDetail;
      setNotes(d.notes || '');
      setActiveTab('tecnica');
    }
  }, [module?.moduleKey]);

  if (!module) return null;

  // Filtra rotas, conexões e demandas vinculadas ao módulo
  const moduleAcoes = module ? acoes.filter((a) => a.modulo === module.moduleKey) : [];
  const gerado = module.gerado;
  const geradoRotas = gerado?.rotas ?? [];
  const usaOutros = agrupar((gerado?.chamadas ?? []).filter((c) => c.moduloDono && c.moduloDono !== module.moduleKey), (c) => c.moduloDono!, (c) => c.rota);
  const usadoPorOutros = agrupar(gerado?.usadoPor ?? [], (u) => u.modulo, (u) => `${u.rota} ← ${u.tela}`);

  const inEdges = edges.filter((e) => e.toKey === module.moduleKey);
  const outEdges = edges.filter((e) => e.fromKey === module.moduleKey);

  const moduleFeedbacks = feedbacks.filter((f) => chamadoDoModulo(f, module));

  const moduleTasks = tasks.filter((t) => {
    const title = (t.title || '').toLowerCase();
    const k = module.moduleKey.toLowerCase();
    return title.includes(k) || (typeof t.targets === 'string' && t.targets.toLowerCase().includes(k));
  });

  return (
    <Drawer
      isOpen={Boolean(module)}
      onClose={onClose}
      size="2xl"
      title={module.label}
      subtitle={module.purpose || undefined}
      badge={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-white border border-zinc-200 px-2 py-0.5 rounded-md">
            {groupName || 'Módulo'}
          </span>
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider', STATUS_STYLE[module.status] || STATUS_STYLE.stub)}>
            {module.status}
          </span>
          <code className="text-[11px] font-mono text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded">
            {module.moduleKey}
          </code>
        </div>
      }
      tabs={[
        { id: 'tecnica', label: 'Ficha Técnica', icon: Route, badge: moduleAcoes.length || geradoRotas.length || undefined },
        { id: 'demandas', label: 'Demandas & Bugs', icon: Bug, badge: moduleFeedbacks.length || undefined },
        { id: 'tasks', label: 'Tasks', icon: ListTodo, badge: moduleTasks.length || undefined },
        { id: 'documentacao', label: 'Documentação', icon: FileText },
      ]}
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as any)}
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          {onOpenView && (
            <button
              type="button"
              onClick={() => onOpenView(module.moduleKey)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-800 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
              <span>Abrir Tela do Módulo</span>
            </button>
          )}

          {activeTab === 'documentacao' ? (
            <button
              type="button"
              onClick={() => void onSaveNotes(notes)}
              disabled={savingNotes}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Salvar Notas</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* ABA: Ficha Técnica */}
        {activeTab === 'tecnica' && (
          <div className="space-y-4">
            {/* Arquivos de Código com Botões de Cópia */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Localização no Código-Fonte
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const abertos = moduleFeedbacks.filter(chamadoAberto);
                    const texto = [
                      `${module.label} (${module.moduleKey})`,
                      module.purpose || '',
                      module.frontendPath ? `Frontend: ${module.frontendPath}` : '',
                      module.backendPath ? `Backend: ${module.backendPath}` : '',
                      'Rotas:',
                      ...geradoRotas.map((r) => `- ${(r.metodos || ['GET']).join(',')} ${r.caminho}`),
                      'Chamados abertos:',
                      ...abertos.map((f) => `- [${f.status}] ${f.description}`),
                    ].filter(Boolean).join('\n');
                    handleCopy(texto, 'contexto');
                  }}
                  className="text-[10px] font-bold text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 px-2 py-1 rounded-lg cursor-pointer"
                >
                  {copiedKey === 'contexto' ? 'Copiado' : 'Copiar contexto'}
                </button>
              </div>
              <div className="space-y-2 text-xs">
                {/* Frontend Path */}
                <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-200/70 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-zinc-400 block">Frontend</span>
                    <code className="text-zinc-800 text-[11px] font-mono break-all font-semibold select-all">
                      {module.frontendPath || '—'}
                    </code>
                  </div>
                  {module.frontendPath && (
                    <button
                      type="button"
                      onClick={() => handleCopy(module.frontendPath!, 'fe')}
                      className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-600 transition-colors cursor-pointer shrink-0"
                      title="Copiar caminho frontend"
                    >
                      {copiedKey === 'fe' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>

                {/* Backend Path */}
                <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-200/70 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-zinc-400 block">Backend</span>
                    <code className="text-zinc-800 text-[11px] font-mono break-all font-semibold select-all">
                      {module.backendPath || '—'}
                    </code>
                  </div>
                  {module.backendPath && (
                    <button
                      type="button"
                      onClick={() => handleCopy(module.backendPath!, 'be')}
                      className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-600 transition-colors cursor-pointer shrink-0"
                      title="Copiar caminho backend"
                    >
                      {copiedKey === 'be' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>

                {/* Prefixo de Rota */}
                {module.routerPrefix && (
                  <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-200/70 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase text-zinc-400 block">Prefixo REST API</span>
                      <code className="text-zinc-900 text-[11px] font-mono font-bold select-all bg-zinc-200/60 px-1 rounded">
                        {module.routerPrefix}
                      </code>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(module.routerPrefix!, 'prefix')}
                      className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-600 transition-colors cursor-pointer shrink-0"
                      title="Copiar prefixo"
                    >
                      {copiedKey === 'prefix' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Ações geradas do código */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                Ações (geradas do código) ({moduleAcoes.length})
              </span>
              {moduleAcoes.length > 0 ? (
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {moduleAcoes.map((a) => {
                    const aberta = acaoAberta === a.nome;
                    return (
                      <div key={a.nome} className="rounded-lg border border-zinc-100 bg-zinc-50/60 text-xs">
                        <button
                          type="button"
                          onClick={() => setAcaoAberta(aberta ? null : a.nome)}
                          className="w-full text-left p-2 space-y-1 cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn('text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border', METHOD_COLORS[a.metodo] || 'bg-zinc-100 text-zinc-700 border-zinc-200')}>
                              {a.metodo}
                            </span>
                            <code className="font-mono text-[11px] text-zinc-800 break-all">{a.caminho}</code>
                            {a.escrita && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">grava</span>
                            )}
                            {a.doisPassos && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-sky-50 text-sky-700 border-sky-200">prévia → confirmar</span>
                            )}
                          </div>
                          <code className="font-mono text-[10px] text-zinc-500 block">{a.nome}</code>
                          <p className="text-[11px] text-zinc-600">{a.descricao}</p>
                        </button>
                        {aberta && (
                          <div className="px-2 pb-2">
                            {a.parametros.length > 0 ? (
                              <table className="w-full text-[10px] border-t border-zinc-200">
                                <thead>
                                  <tr className="text-left text-zinc-500">
                                    <th className="py-1 pr-2 font-semibold">Nome</th>
                                    <th className="py-1 pr-2 font-semibold">Onde</th>
                                    <th className="py-1 pr-2 font-semibold">Tipo</th>
                                    <th className="py-1 pr-2 font-semibold">Obrig.</th>
                                    <th className="py-1 font-semibold">Descrição</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {a.parametros.map((p) => (
                                    <tr key={p.nome + p.onde} className="border-t border-zinc-100 align-top">
                                      <td className="py-1 pr-2 font-mono text-zinc-800">{p.nome}</td>
                                      <td className="py-1 pr-2 text-zinc-600">{p.onde}</td>
                                      <td className="py-1 pr-2 font-mono text-zinc-600">{p.tipo}</td>
                                      <td className="py-1 pr-2 text-zinc-600">{p.obrigatorio ? 'sim' : 'não'}</td>
                                      <td className="py-1 text-zinc-600">{p.descricao}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-[10px] text-zinc-400 italic border-t border-zinc-200 pt-1">Sem parâmetros.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 italic py-2">Este módulo ainda não está no catálogo de ações.</p>
              )}
            </div>

            {/* Gerado do código deste build: telas, rotas, tabelas, usa / é usado por */}
            <SecaoGerada titulo="Telas" total={gerado?.telas.length ?? 0} vazio="Nenhuma tela (*View/*Tab/*Drawer/*Painel) no diretório do front deste módulo.">
              {(gerado?.telas ?? []).map((t) => (
                <div key={t.arquivo} className="flex items-baseline justify-between gap-2 py-1 border-t border-zinc-100 first:border-t-0 text-xs">
                  <span className="font-semibold text-zinc-800">{t.nome}</span>
                  <code className="font-mono text-[10px] text-zinc-400 truncate" title={t.arquivo}>{t.arquivo.replace(/^Frontend\/src\/modules\//, '')}</code>
                </div>
              ))}
            </SecaoGerada>

            <SecaoGerada titulo="Rotas do servidor" total={geradoRotas.length} vazio="Nenhuma rota do servidor ligada a este módulo (confira o prefixo e o caminho do back acima).">
              {geradoRotas.map((r) => (
                <div key={r.caminho + r.arquivo} className="flex items-center gap-1.5 py-1 border-t border-zinc-100 first:border-t-0 text-xs">
                  {r.metodos.map((m) => (
                    <span key={m} className={cn('text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border', METHOD_COLORS[m] || 'bg-zinc-100 text-zinc-700 border-zinc-200')}>
                      {m}
                    </span>
                  ))}
                  <code className="font-mono text-[11px] text-zinc-800 break-all" title={r.arquivo}>{r.caminho}</code>
                </div>
              ))}
            </SecaoGerada>

            <SecaoGerada
              titulo="Tabelas"
              total={(gerado?.tabelas.le.length ?? 0) + (gerado?.tabelas.grava.length ?? 0)}
              vazio="Nenhuma tabela do banco encontrada no código do servidor deste módulo."
            >
              {(gerado?.tabelas.grava.length ?? 0) > 0 && (
                <ListaTabelas rotulo="grava" classe="bg-amber-50 text-amber-700 border-amber-200" itens={gerado!.tabelas.grava} />
              )}
              {(gerado?.tabelas.le.length ?? 0) > 0 && (
                <ListaTabelas rotulo="lê" classe="bg-zinc-100 text-zinc-700 border-zinc-200" itens={gerado!.tabelas.le} />
              )}
            </SecaoGerada>

            <SecaoGerada titulo="Usa (rotas de outros módulos)" total={usaOutros.length} vazio="As telas deste módulo só chamam rotas dele mesmo.">
              {usaOutros.map((g) => (
                <LinhaModulo key={g.modulo} modulo={g.modulo} itens={g.itens} onSelect={onSelectModule} />
              ))}
            </SecaoGerada>

            <SecaoGerada titulo="É usado por" total={usadoPorOutros.length} vazio="Nenhuma tela de outro módulo chama as rotas deste.">
              {usadoPorOutros.map((g) => (
                <LinhaModulo key={g.modulo} modulo={g.modulo} itens={g.itens} onSelect={onSelectModule} />
              ))}
            </SecaoGerada>

            {/* Conexões (Edges) Navegáveis */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2.5 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                Conexões Arquiteturais <span className="normal-case font-normal text-zinc-400">(tracejadas = geradas do código)</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Entradas */}
                <div className="p-2.5 rounded-lg border border-zinc-100 bg-zinc-50/60 space-y-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 rotate-180 text-zinc-400" /> Recebe de:
                  </span>
                  {inEdges.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {inEdges.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => onSelectModule?.(e.fromKey)}
                          className={cn('font-mono text-[11px] text-zinc-800 bg-white border hover:border-zinc-400 px-2 py-0.5 rounded-md transition-colors cursor-pointer font-semibold shadow-2xs', e.auto ? 'border-dashed border-zinc-300' : 'border-zinc-200')}
                          title={e.auto ? `Gerado do código: ${e.note}` : `Ver módulo ${e.fromKey}`}
                        >
                          {e.fromKey}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-zinc-400 italic text-[11px] block pt-1">Nenhum</span>
                  )}
                </div>

                {/* Saídas */}
                <div className="p-2.5 rounded-lg border border-zinc-100 bg-zinc-50/60 space-y-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-zinc-400" /> Envia para:
                  </span>
                  {outEdges.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {outEdges.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => onSelectModule?.(e.toKey)}
                          className={cn('font-mono text-[11px] text-zinc-800 bg-white border hover:border-zinc-400 px-2 py-0.5 rounded-md transition-colors cursor-pointer font-semibold shadow-2xs', e.auto ? 'border-dashed border-zinc-300' : 'border-zinc-200')}
                          title={e.auto ? `Gerado do código: ${e.note}` : `Ver módulo ${e.toKey}`}
                        >
                          {e.toKey}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-zinc-400 italic text-[11px] block pt-1">Nenhum</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: Demandas & Bugs */}
        {activeTab === 'demandas' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700">
                Histórico de Feedbacks & Demandas ({moduleFeedbacks.length})
              </span>
              {onCreateDemanda && (
                <button
                  type="button"
                  onClick={() => setReportOpen((v) => !v)}
                  className="flex items-center gap-1 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Reportar</span>
                </button>
              )}
            </div>

            {reportOpen && onCreateDemanda && (
              <form
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const texto = reportText.trim();
                  if (!texto || reportSaving) return;
                  setReportSaving(true);
                  void onCreateDemanda(module.moduleKey, texto, reportType)
                    .then(() => {
                      setReportText('');
                      setReportOpen(false);
                    })
                    .finally(() => setReportSaving(false));
                }}
              >
                <p className="text-[11px] text-zinc-500">O chamado entra na triagem já ligado a {module.label}.</p>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="border border-zinc-200 rounded-lg px-2 py-1 text-xs bg-white"
                >
                  <option value="feedback">Sugestão</option>
                  <option value="bug">Bug</option>
                </select>
                <textarea
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  rows={3}
                  placeholder="O que precisa mudar neste módulo"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  disabled={reportSaving || !reportText.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {reportSaving ? 'Enviando...' : 'Enviar para triagem'}
                </button>
              </form>
            )}

            {moduleFeedbacks.length > 0 ? (
              <div className="space-y-2">
                {moduleFeedbacks.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => onSelectFeedback?.(f)}
                    className="p-3 rounded-xl border border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-xs transition-all cursor-pointer space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                          {f.id.slice(0, 8)}
                        </span>
                        <span className={cn(
                          'text-[10px] font-bold uppercase px-1.5 py-0.2 rounded border',
                          f.feedbackType === 'bug' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-sky-50 text-sky-700 border-sky-200'
                        )}>
                          {f.feedbackType}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          P{f.priority || 100}
                        </span>
                      </div>
                      <span className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                        f.status === 'resolved' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                        f.status === 'awaiting_review' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                        f.status === 'in_progress' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                        'bg-zinc-100 text-zinc-700 border-zinc-200'
                      )}>
                        {f.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-zinc-900 line-clamp-2">
                      {f.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-100">
                      <span>Por: {f.requestedBy || 'Operador'}</span>
                      <div className="flex items-center gap-2">
                        {f.hasScreenshot && <span>📷 Print</span>}
                        {f.hasLogs && <span>💻 Logs</span>}
                        {Boolean(f.notesCount) && <span>💬 {f.notesCount} notas</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-400 text-xs">
                Nenhum bug ou demanda vinculada a este módulo.
              </div>
            )}
          </div>
        )}

        {/* ABA: Tasks */}
        {activeTab === 'tasks' && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-zinc-700 block">
              Tarefas de Engenharia do Módulo
            </span>

            {moduleTasks.length > 0 ? (
              <div className="space-y-2">
                {moduleTasks.map((t) => (
                  <div key={t.id} className="p-3 rounded-xl border border-zinc-200 bg-white space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[10px] font-bold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                        {t.id.slice(0, 8)}
                      </span>
                      <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border', t.status === 'open' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200')}>
                        {t.status === 'open' ? 'Pendente' : 'Concluído'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-zinc-900">{t.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-400 text-xs">
                Nenhuma tarefa técnica aberta para este módulo.
              </div>
            )}
          </div>
        )}

        {/* ABA: Documentação & Notas */}
        {activeTab === 'documentacao' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                Propósito Funcional
              </label>
              <p className="text-xs text-zinc-700 bg-zinc-50 p-3 rounded-xl border border-zinc-200 leading-relaxed">
                {module.purpose || 'Sem descrição funcional cadastrada.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                Notas Técnicas & Arquiteturais (PostgreSQL)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Insira detalhes de implementação, regras de negócio ou observações para os agentes de IA..."
                className="w-full min-h-[140px] p-3 rounded-xl border border-zinc-300 text-xs text-zinc-800 leading-relaxed focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
