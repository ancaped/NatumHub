import React, { useState, useEffect } from 'react';
import { ExternalLink, Route, Bug, FileText, Plus, Copy, Check } from 'lucide-react';
import type { MapaModule, MapaEdge, Feedback, MapaDetail, CatalogoAcao } from '../types';
import { chamadoAberto, chamadoDoModulo } from '../vinculo';
import Drawer from '../../components/ui/Drawer';
import { StatusBadge } from '../../components/ui/ReportKit';
import { statusChamado, statusModulo, tipoChamado } from '../rotulos';

interface ModuleDetailDrawerProps {
  module: MapaModule | null;
  onClose: () => void;
  acoes?: CatalogoAcao[];
  edges: MapaEdge[];
  groupName?: string;
  feedbacks: Feedback[];
  onOpenView?: (view: string) => void;
  onSelectFeedback?: (feedback: Feedback) => void;
  onCreateDemanda?: (moduleKey: string, description: string, feedbackType: string) => Promise<void>;
  onSelectModule?: (moduleKey: string) => void;
  nomeModulo: (key?: string | null) => string;
}

type DrawerTab = 'tecnica' | 'demandas' | 'documentacao';

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

/** Bloco da ficha: título e partes separadas por linha. */
function Grupo({ titulo, total, acao, children }: { titulo: string; total?: number; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-zinc-100">
        <h4 className="text-sm font-bold text-zinc-900">
          {titulo}
          {total !== undefined && <span className="ml-1 font-normal text-zinc-400">({total})</span>}
        </h4>
        {acao}
      </header>
      <div className="divide-y divide-zinc-100">{children}</div>
    </section>
  );
}

function Parte({ titulo, total, vazio, children }: { titulo?: string; total?: number; vazio?: string; children: React.ReactNode }) {
  const semNada = total !== undefined && total === 0;
  return (
    <div className="px-3.5 py-2.5">
      {titulo && (
        <span className="block text-[11px] font-semibold text-zinc-500 mb-1">
          {titulo}
          {total !== undefined && ` (${total})`}
        </span>
      )}
      {semNada ? <p className="text-xs text-zinc-400">{vazio}</p> : <div className="max-h-64 overflow-y-auto">{children}</div>}
    </div>
  );
}

function Metodo({ m }: { m: string }) {
  return (
    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border bg-zinc-100 text-zinc-700 border-zinc-200 shrink-0">{m}</span>
  );
}

function ListaTabelas({ rotulo, itens }: { rotulo: string; itens: string[] }) {
  return (
    <div className="flex items-start gap-2 py-1 text-xs">
      <span className="w-12 shrink-0 text-zinc-500">{rotulo}</span>
      <div className="flex flex-wrap gap-1">
        {itens.map((t) => (
          <code key={t} className="font-mono text-[11px] text-zinc-800 bg-zinc-50 border border-zinc-200 px-1.5 rounded">{t}</code>
        ))}
      </div>
    </div>
  );
}

/** Ligações com outros módulos num lugar só: o que este usa, quem usa este e as ligações anotadas à mão. */
function juntarLigacoes(
  usa: { modulo: string; itens: string[] }[],
  usado: { modulo: string; itens: string[] }[],
  anotadas: { modulo: string; nota: string }[],
): { modulo: string; usa: boolean; usado: boolean; detalhes: string[] }[] {
  const m = new Map<string, { modulo: string; usa: boolean; usado: boolean; detalhes: string[] }>();
  const pegar = (k: string) => {
    if (!m.has(k)) m.set(k, { modulo: k, usa: false, usado: false, detalhes: [] });
    return m.get(k)!;
  };
  for (const g of usa) { const l = pegar(g.modulo); l.usa = true; l.detalhes.push(...g.itens); }
  for (const g of usado) { const l = pegar(g.modulo); l.usado = true; l.detalhes.push(...g.itens); }
  for (const a of anotadas) { const l = pegar(a.modulo); if (a.nota) l.detalhes.push(a.nota); }
  return [...m.values()].sort((a, b) => a.modulo.localeCompare(b.modulo));
}

export default function ModuleDetailDrawer({
  module,
  onClose,
  acoes = [],
  edges,
  groupName,
  feedbacks,
  onOpenView,
  onSelectFeedback,
  onCreateDemanda,
  onSelectModule,
  nomeModulo,
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

  /** A parte escrita da ficha muda só por migração SQL aditiva: a tela monta o texto, não grava. */
  const migracaoNotas = (key: string, texto: string) => [
    `-- Backend/supabase/NNN_ficha_${key}_notas.sql (número decidido ao juntar na main)`,
    `UPDATE mapa_modules`,
    `SET detail = detail || jsonb_build_object('notes', $nota$${texto.trim()}$nota$::text), updated_at = NOW()`,
    `WHERE module_key = '${key}';`,
  ].join('\n');

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

  const anotadas = edges
    .filter((e) => !e.auto && (e.toKey === module.moduleKey || e.fromKey === module.moduleKey))
    .map((e) => ({ modulo: e.toKey === module.moduleKey ? e.fromKey : e.toKey, nota: e.note }));
  const ligacoes = juntarLigacoes(usaOutros, usadoPorOutros, anotadas);

  const moduleFeedbacks = feedbacks.filter((f) => chamadoDoModulo(f, module));

  return (
    <Drawer
      isOpen={Boolean(module)}
      onClose={onClose}
      size="2xl"
      title={module.label}
      subtitle={module.purpose ? <span className="font-sans whitespace-normal">{module.purpose}</span> : undefined}
      badge={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-white border border-zinc-200 px-2 py-0.5 rounded-md">
            {groupName || 'Módulo'}
          </span>
          <StatusBadge variante={statusModulo(module.status).variante}>{statusModulo(module.status).rotulo}</StatusBadge>
          <code className="text-[11px] font-mono text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded">
            {module.moduleKey}
          </code>
        </div>
      }
      tabs={[
        { id: 'tecnica', label: 'Ficha', icon: Route },
        { id: 'demandas', label: 'Chamados', icon: Bug, badge: moduleFeedbacks.length || undefined },
        { id: 'documentacao', label: 'Notas', icon: FileText },
      ]}
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as any)}
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          {onOpenView && (
            <button
              type="button"
              onClick={() => onOpenView(module.moduleKey)}
              className="min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-800 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
              <span>Abrir tela do módulo</span>
            </button>
          )}

          {activeTab === 'documentacao' && (
            <button
              type="button"
              onClick={() => handleCopy(migracaoNotas(module.moduleKey, notes), 'migracao')}
              disabled={notes.trim() === (((module.detail || {}) as MapaDetail).notes || '').trim()}
              title="Copia a migração SQL que grava estas notas; cole na conversa do Desenvolvimento"
              className="ml-auto min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copiedKey === 'migracao' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey === 'migracao' ? 'Migração copiada' : 'Copiar migração'}</span>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* ABA: Ficha (gerada do código) */}
        {activeTab === 'tecnica' && (
          <div className="space-y-3">
            <Grupo
              titulo="Código"
              acao={
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
                      ...abertos.map((f) => `- [${statusChamado(f.status)}] ${f.description}`),
                    ].filter(Boolean).join('\n');
                    handleCopy(texto, 'contexto');
                  }}
                  className="min-h-[36px] text-xs font-semibold text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 px-2.5 rounded-lg cursor-pointer"
                >
                  {copiedKey === 'contexto' ? 'Copiado' : 'Copiar contexto'}
                </button>
              }
            >
              <Parte>
                {[
                  { id: 'fe', rotulo: 'Tela', valor: module.frontendPath },
                  { id: 'be', rotulo: 'Servidor', valor: module.backendPath },
                  { id: 'prefix', rotulo: 'Rotas', valor: module.routerPrefix },
                ].map((c) => (
                  <div key={c.id} className="flex items-center gap-2 py-1 text-xs">
                    <span className="w-16 shrink-0 text-zinc-500">{c.rotulo}</span>
                    <code className="flex-1 min-w-0 font-mono text-[11px] text-zinc-800 break-all">{c.valor || '—'}</code>
                    {c.valor && (
                      <button
                        type="button"
                        onClick={() => handleCopy(c.valor!, c.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 cursor-pointer shrink-0"
                        title="Copiar"
                      >
                        {copiedKey === c.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
              </Parte>
              <Parte titulo="Ações para agentes" total={moduleAcoes.length} vazio="Este módulo ainda não está no catálogo de ações.">
                {moduleAcoes.map((a) => {
                  const aberta = acaoAberta === a.nome;
                  return (
                    <div key={a.nome} className="py-1.5 border-t border-zinc-100 first:border-t-0 text-xs">
                      <button
                        type="button"
                        onClick={() => setAcaoAberta(aberta ? null : a.nome)}
                        className="w-full text-left space-y-0.5 cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <Metodo m={a.metodo} />
                          <code className="font-mono text-[11px] text-zinc-800 break-all">{a.caminho}</code>
                          {a.escrita && <StatusBadge variante="aguardando">{a.doisPassos ? 'grava em 2 passos' : 'grava'}</StatusBadge>}
                        </span>
                        <span className="block text-[11px] text-zinc-600">{a.descricao}</span>
                      </button>
                      {aberta && (
                        <div className="mt-1.5 pl-2 border-l-2 border-zinc-200 space-y-0.5">
                          <code className="font-mono text-[10px] text-zinc-500 block">{a.nome}</code>
                          {a.parametros.length > 0 ? (
                            a.parametros.map((p) => (
                              <p key={p.nome + p.onde} className="text-[11px] text-zinc-600">
                                <code className="font-mono text-zinc-800">{p.nome}</code>
                                {p.obrigatorio ? '' : ' (opcional)'} — {p.descricao}
                              </p>
                            ))
                          ) : (
                            <p className="text-[11px] text-zinc-400">Sem parâmetros.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Parte>
            </Grupo>

            <Grupo titulo="Telas e rotas">
              <Parte titulo="Telas" total={gerado?.telas.length ?? 0} vazio="Nenhuma tela no diretório do front deste módulo.">
                {(gerado?.telas ?? []).map((t) => (
                  <div key={t.arquivo} className="flex items-baseline justify-between gap-2 py-1 border-t border-zinc-100 first:border-t-0 text-xs">
                    <span className="font-semibold text-zinc-800">{t.nome}</span>
                    <code className="font-mono text-[10px] text-zinc-400 truncate" title={t.arquivo}>{t.arquivo.replace(/^Frontend\/src\/modules\//, '')}</code>
                  </div>
                ))}
              </Parte>
              <Parte titulo="Rotas do servidor" total={geradoRotas.length} vazio="Nenhuma rota ligada a este módulo (confira os caminhos acima).">
                {geradoRotas.map((r) => (
                  <div key={r.caminho + r.arquivo} className="flex items-center gap-1.5 py-1 border-t border-zinc-100 first:border-t-0 text-xs">
                    {r.metodos.map((m) => <Metodo key={m} m={m} />)}
                    <code className="font-mono text-[11px] text-zinc-800 break-all" title={r.arquivo}>{r.caminho}</code>
                  </div>
                ))}
              </Parte>
              <Parte
                titulo="Tabelas"
                total={(gerado?.tabelas.le.length ?? 0) + (gerado?.tabelas.grava.length ?? 0)}
                vazio="Nenhuma tabela do banco no código do servidor deste módulo."
              >
                {(gerado?.tabelas.grava.length ?? 0) > 0 && <ListaTabelas rotulo="grava" itens={gerado!.tabelas.grava} />}
                {(gerado?.tabelas.le.length ?? 0) > 0 && <ListaTabelas rotulo="lê" itens={gerado!.tabelas.le} />}
              </Parte>
            </Grupo>

            <Grupo titulo="Ligações com outros módulos" total={ligacoes.length}>
              <Parte vazio="Nenhuma ligação com outro módulo." total={ligacoes.length}>
                {ligacoes.map((l) => (
                  <div key={l.modulo} className="py-1.5 border-t border-zinc-100 first:border-t-0 text-xs space-y-0.5">
                    <span className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onSelectModule?.(l.modulo)}
                        title={l.modulo}
                        className="font-semibold text-zinc-900 hover:underline cursor-pointer"
                      >
                        {nomeModulo(l.modulo)}
                      </button>
                      <span className="text-zinc-500">
                        {l.usa && l.usado ? 'usa e é usado por este' : l.usa ? 'este usa' : l.usado ? 'usa este' : 'ligação anotada'}
                      </span>
                    </span>
                    {l.detalhes.length > 0 && (
                      <p className="font-mono text-[10px] text-zinc-500 break-all">{l.detalhes.join(' · ')}</p>
                    )}
                  </div>
                ))}
              </Parte>
            </Grupo>
          </div>
        )}

        {/* ABA: Demandas & Bugs */}
        {activeTab === 'demandas' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700">
                Chamados deste módulo ({moduleFeedbacks.length})
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
              <ul className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
                {moduleFeedbacks.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onSelectFeedback?.(f)}
                      className="w-full min-h-[44px] text-left px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-50 cursor-pointer"
                    >
                      <StatusBadge variante={tipoChamado(f.feedbackType).variante}>{tipoChamado(f.feedbackType).rotulo}</StatusBadge>
                      <span className="flex-1 min-w-0 text-xs text-zinc-900 line-clamp-2">{f.description}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{statusChamado(f.status)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-12 text-center text-zinc-400 text-xs">
                Nenhum chamado ligado a este módulo.
              </div>
            )}
          </div>
        )}

        {/* ABA: Documentação & Notas */}
        {activeTab === 'documentacao' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                Notas técnicas
              </label>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Rascunho: a tela não grava. Edite e use Copiar migração; a nota entra no ar com o próximo deploy.
              </p>
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
