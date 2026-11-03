import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Plus, Loader2, X, ChevronDown, ChevronUp, Save, KeyRound, Ban, Copy, Check } from 'lucide-react';
import { apiJson } from '../lib/http';
import { updateOperator } from '../lib/auth';
import Drawer from '../components/ui/Drawer';
import GradePermissoes, { type ValorGrade } from './GradePermissoes';
import PreviaAcaoDrawer, { type PreviaAcao } from '../../producao/gerenciamento/components/PreviaAcaoDrawer';

interface TokenResumo {
  id: string;
  prefixo: string;
  criadoEm: string;
  criadoPor: string | null;
  ultimoUso: string | null;
  revogadoEm: string | null;
}

interface Agente {
  id: string;
  nome: string;
  ativo: boolean;
  /** módulo → ver | editar */
  modulos: Record<string, 'ver' | 'editar'>;
  tokens: TokenResumo[];
}

interface RespostaAcao<T> {
  previa: boolean;
  resultado: T;
}

interface Props {
  setMessage: (msg: { text: string; type: 'success' | 'error' } | null) => void;
}

const AVISO_TOKEN = 'Guarde agora: o Nexus não mostra este token de novo. Quem tiver o token age como este agente.';

function paraGrade(modulos: Record<string, 'ver' | 'editar'>): ValorGrade {
  const permissions: Record<string, 'view' | 'edit'> = {};
  for (const [m, n] of Object.entries(modulos)) permissions[m] = n === 'ver' ? 'view' : 'edit';
  return { modules: Object.keys(modulos), permissions };
}

function paraModulosApi(g: ValorGrade): Record<string, 'ver' | 'editar'> {
  const out: Record<string, 'ver' | 'editar'> = {};
  for (const m of g.modules) out[m] = g.permissions[m] === 'view' ? 'ver' : 'editar';
  return out;
}

function resumoModulos(modulos: Record<string, 'ver' | 'editar'>): string {
  const total = Object.keys(modulos).length;
  const ver = Object.values(modulos).filter((n) => n === 'ver').length;
  return `${total} módulo(s) (${total - ver} alterar · ${ver} ver)`;
}

function tokenAtivo(a: Agente): TokenResumo | undefined {
  return a.tokens.find((t) => !t.revogadoEm);
}

/** Agentes de IA: operadores sem senha, que entram por token e só enxergam os módulos marcados. */
export default function AgentesPanel({ setMessage }: Props) {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [grades, setGrades] = useState<Record<string, ValorGrade>>({});
  const [ativos, setAtivos] = useState<Record<string, boolean>>({});
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaGrade, setNovaGrade] = useState<ValorGrade>({ modules: [], permissions: {} });
  const [previa, setPrevia] = useState<PreviaAcao | null>(null);
  // O token só vive nesta variável de estado: não vai para storage nem para o console.
  const [tokenMostrado, setTokenMostrado] = useState<{ agente: string; token: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [comoConectar, setComoConectar] = useState(false);
  // Erro do formulário de novo agente, mostrado ao lado do botão (o aviso do topo fica fora da vista).
  const [erroNovo, setErroNovo] = useState('');

  const erro = useCallback(
    (e: unknown, padrao: string) => {
      setMessage({ text: e instanceof Error && e.message ? e.message : padrao, type: 'error' });
      setTimeout(() => setMessage(null), 4000);
    },
    [setMessage]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const lista = await apiJson<Agente[]>('/admin/agentes');
      setAgentes(lista);
      const g: Record<string, ValorGrade> = {};
      const a: Record<string, boolean> = {};
      for (const ag of lista) {
        g[ag.id] = paraGrade(ag.modulos);
        a[ag.id] = ag.ativo;
      }
      setGrades(g);
      setAtivos(a);
    } catch (e) {
      erro(e, 'Erro ao carregar agentes');
    } finally {
      setLoading(false);
    }
  }, [erro]);

  useEffect(() => {
    load();
  }, [load]);

  const post = <T,>(url: string, body?: unknown) =>
    apiJson<RespostaAcao<T>>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const criar = async () => {
    const nome = novoNome.trim();
    if (!nome) {
      setMessage({ text: 'Informe o nome do agente.', type: 'error' });
      return;
    }
    if (novaGrade.modules.length === 0) {
      setMessage({ text: 'Marque ao menos um módulo para o agente.', type: 'error' });
      return;
    }
    const modulos = paraModulosApi(novaGrade);
    type R = { id: string; nome: string; token?: string };
    setSaving(true);
    setErroNovo('');
    try {
      await post<R>('/admin/agentes', { nome, modulos, confirmar: false });
      setPrevia({
        titulo: 'Criar agente de IA',
        confirmarRotulo: 'Criar e gerar token',
        avisos: ['O agente nunca é supervisor e só acessa os módulos abaixo. O token aparece uma única vez.'],
        linhas: Object.entries(modulos).map(([m, n]) => ({ titulo: m, detalhe: n })),
        executar: async () => {
          const r = await post<R>('/admin/agentes', { nome, modulos, confirmar: true });
          if (r.resultado.token) setTokenMostrado({ agente: nome, token: r.resultado.token });
          setMostrarNovo(false);
          setNovoNome('');
          setNovaGrade({ modules: [], permissions: {} });
          await load();
        },
      });
    } catch (e) {
      setErroNovo(e instanceof Error && e.message ? e.message : 'Erro ao criar agente.');
    } finally {
      setSaving(false);
    }
  };

  const gerarToken = async (ag: Agente) => {
    type R = { agente: string; tokensRevogados: number; token?: string };
    try {
      const { resultado } = await post<R>(`/admin/agentes/${encodeURIComponent(ag.id)}/token`);
      setPrevia({
        titulo: `Gerar token: ${ag.nome}`,
        confirmarRotulo: 'Gerar token',
        avisos: [
          resultado.tokensRevogados > 0
            ? `${resultado.tokensRevogados} token(s) ativo(s) serão revogados; quem usa o antigo perde o acesso.`
            : 'Nenhum token ativo. Será gerado o primeiro.',
          'O token novo aparece uma única vez.',
        ],
        linhas: [{ titulo: ag.nome, detalhe: 'novo token' }],
        executar: async () => {
          const r = await post<R>(`/admin/agentes/${encodeURIComponent(ag.id)}/token?confirmar=true`);
          if (r.resultado.token) setTokenMostrado({ agente: ag.nome, token: r.resultado.token });
          await load();
        },
      });
    } catch (e) {
      erro(e, 'Erro ao preparar o token');
    }
  };

  const revogar = async (ag: Agente) => {
    type R = { agente: string; tokensRevogados: number };
    try {
      const { resultado } = await post<R>(`/admin/agentes/${encodeURIComponent(ag.id)}/revogar`);
      setPrevia({
        titulo: `Revogar token: ${ag.nome}`,
        confirmarRotulo: 'Revogar',
        avisos: ['O agente para de entrar até ganhar um token novo.'],
        linhas: [{ titulo: ag.nome, detalhe: `${resultado.tokensRevogados} token(s) ativo(s)` }],
        executar: async () => {
          await post<R>(`/admin/agentes/${encodeURIComponent(ag.id)}/revogar?confirmar=true`);
          setMessage({ text: 'Token revogado.', type: 'success' });
          setTimeout(() => setMessage(null), 4000);
          await load();
        },
      });
    } catch (e) {
      erro(e, 'Erro ao preparar a revogação');
    }
  };

  // Salvar permissões usa a rota de operadores (PUT /auth/operators/manage/:id): as permissões são as mesmas
  // (hub_operator_modules) e o servidor não troca o tipo 'agente'. Sem módulo o servidor aplicaria o padrão do papel,
  // por isso a tela exige ao menos um.
  const salvar = (ag: Agente) => {
    const grade = grades[ag.id];
    if (!grade || grade.modules.length === 0) {
      setMessage({ text: 'Marque ao menos um módulo para o agente.', type: 'error' });
      return;
    }
    const antes = ag.modulos;
    const depois = paraModulosApi(grade);
    const linhas = [...new Set([...Object.keys(antes), ...Object.keys(depois)])]
      .filter((m) => antes[m] !== depois[m] || ativos[ag.id] !== ag.ativo)
      .map((m) => ({ titulo: m, detalhe: `${antes[m] ?? 'sem acesso'} → ${depois[m] ?? 'sem acesso'}` }));
    if (ativos[ag.id] !== ag.ativo && linhas.length === 0) {
      linhas.push({ titulo: ag.nome, detalhe: ativos[ag.id] ? 'ativar' : 'desativar' });
    }
    setPrevia({
      titulo: `Salvar permissões: ${ag.nome}`,
      confirmarRotulo: 'Salvar',
      linhas,
      executar: async () => {
        await updateOperator(ag.id, {
          displayName: ag.nome,
          role: 'operador',
          active: ativos[ag.id] ?? ag.ativo,
          modules: grade.modules,
          permissions: grade.permissions,
          updateChannel: 'stable',
        });
        setMessage({ text: 'Agente atualizado.', type: 'success' });
        setTimeout(() => setMessage(null), 4000);
        await load();
      },
    });
  };

  const fecharToken = () => {
    setTokenMostrado(null);
    setCopiado(false);
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setMessage({ text: 'Não foi possível copiar. Selecione o texto e copie à mão.', type: 'error' });
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const endereco = typeof window !== 'undefined' ? window.location.origin : '';
  const textoConexao = [
    `Endereço do Nexus: ${endereco}`,
    'Cabeçalho em toda chamada: Authorization: Bearer <token>',
    '',
    'Primeiras leituras:',
    `1. GET ${endereco}/api/agentes/eu (quem é o agente e o que pode)`,
    `2. GET ${endereco}/api/agentes/acoes (catálogo do que o agente pode fazer)`,
    `3. GET ${endereco}/api/producao/planejamento/roteiro (planejamento)`,
    '',
    'Toda escrita é em 2 passos: sem confirmar=true só devolve a prévia; com confirmar=true grava.',
  ].join('\n');

  return (
    <div className="border-t border-zinc-100 pt-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-100 text-zinc-900 rounded-xl border border-zinc-200">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-sm tracking-tight text-zinc-900">Agentes de IA</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Entram só com token · nunca são supervisor · só veem os módulos marcados
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setComoConectar(!comoConectar)}
            className="text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-4 py-2.5 rounded-xl cursor-pointer transition-colors"
          >
            Como conectar
          </button>
          <button
            type="button"
            onClick={() => setMostrarNovo(!mostrarNovo)}
            className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-98"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo Agente
          </button>
        </div>
      </div>

      {comoConectar && (
        <div className="border border-zinc-200 bg-zinc-50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black text-zinc-800 uppercase tracking-wider">Como conectar</p>
            <button
              type="button"
              onClick={() => copiar(textoConexao)}
              className="flex items-center gap-1 text-[11px] font-bold text-zinc-700 hover:bg-zinc-200 px-2 py-1 rounded-lg cursor-pointer"
            >
              {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              Copiar
            </button>
          </div>
          <pre className="text-[11px] text-zinc-700 whitespace-pre-wrap font-mono leading-relaxed">{textoConexao}</pre>
        </div>
      )}

      {mostrarNovo && (
        <div className="border border-zinc-300 bg-zinc-50/70 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
            <p className="text-xs font-black text-zinc-900 flex items-center gap-1.5 uppercase tracking-wider">
              <Bot className="h-4 w-4 text-zinc-700" /> Cadastrar Novo Agente
            </p>
            <button
              type="button"
              onClick={() => setMostrarNovo(false)}
              className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nome do agente</label>
            <input
              type="text"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex: Agente PCP"
              className="mt-1 w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all font-medium"
            />
          </div>
          <GradePermissoes
            value={novaGrade}
            onChange={setNovaGrade}
            descricao="Defina se o agente não acessa, apenas lê ou pode alterar dados."
          />
          {erroNovo && (
            <div className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold">
              {erroNovo}
            </div>
          )}
          <div className="flex gap-2 justify-end pt-2 border-t border-zinc-200">
            <button
              type="button"
              onClick={() => setMostrarNovo(false)}
              className="text-xs font-bold text-zinc-600 px-4 py-2 rounded-xl hover:bg-zinc-100 cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={criar}
              disabled={saving}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl disabled:opacity-50 cursor-pointer shadow-2xs transition-all active:scale-98"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Revisar e criar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-zinc-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          <span className="text-sm font-medium">Carregando agentes...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {agentes.map((ag) => {
            const aberto = expandedId === ag.id;
            const grade = grades[ag.id];
            const ativo = tokenAtivo(ag);
            return (
              <div
                key={ag.id}
                className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
                  ag.ativo ? 'border-zinc-200/90 bg-white hover:border-zinc-300 shadow-xs' : 'border-zinc-200 bg-zinc-50/80 opacity-75'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(aberto ? null : ag.id)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-zinc-50/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${ag.ativo ? 'bg-zinc-900 text-white' : 'bg-zinc-300 text-zinc-600'}`}>
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-zinc-900 truncate">{ag.nome}</p>
                      <div className="flex items-center flex-wrap gap-x-2 mt-0.5 text-[11px] text-zinc-500">
                        <span className="font-medium">{resumoModulos(ag.modulos)}</span>
                        <span>·</span>
                        {ativo ? (
                          <span className="font-mono">{ativo.prefixo}…</span>
                        ) : (
                          <span className="text-amber-700 font-bold">SEM TOKEN ATIVO</span>
                        )}
                        {!ag.ativo && <span className="text-amber-700 font-bold">· INATIVO</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-zinc-400">{aberto ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</div>
                </button>

                {aberto && grade && (
                  <div className="px-5 pb-5 border-t border-zinc-200 pt-4 space-y-4 bg-zinc-50/30">
                    <div>
                      <p className="text-[11px] font-black text-zinc-800 uppercase tracking-wider pb-1">Tokens</p>
                      {ag.tokens.length === 0 ? (
                        <p className="text-xs text-zinc-500">Nenhum token gerado.</p>
                      ) : (
                        <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg bg-white">
                          {ag.tokens.map((t) => (
                            <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 py-2 text-[11px]">
                              <span className="font-mono font-bold text-zinc-900">{t.prefixo}…</span>
                              <span className="text-zinc-500">
                                criado {t.criadoEm}{t.criadoPor ? ` por ${t.criadoPor}` : ''} · último uso {t.ultimoUso ?? 'nunca'}
                              </span>
                              {t.revogadoEm ? (
                                <span className="text-rose-700 font-bold">revogado {t.revogadoEm}</span>
                              ) : (
                                <span className="text-emerald-700 font-bold">ativo</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <label className="flex items-center gap-2 text-sm font-bold text-zinc-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ativos[ag.id] ?? ag.ativo}
                        onChange={(e) => setAtivos((p) => ({ ...p, [ag.id]: e.target.checked }))}
                        className="rounded border-zinc-300 accent-zinc-900 h-4 w-4"
                      />
                      <span>Agente ativo (pode usar o token)</span>
                    </label>

                    <GradePermissoes
                      value={grade}
                      onChange={(v) => setGrades((p) => ({ ...p, [ag.id]: v }))}
                      descricao="Defina se o agente não acessa, apenas lê ou pode alterar dados."
                    />

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200 flex-wrap">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => gerarToken(ag)}
                          className="flex items-center gap-1.5 border border-zinc-300 text-zinc-800 hover:bg-zinc-100 text-xs font-bold px-4 py-2 rounded-xl cursor-pointer transition-colors"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Gerar token
                        </button>
                        <button
                          type="button"
                          onClick={() => revogar(ag)}
                          disabled={!ativo}
                          className="flex items-center gap-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-40 cursor-pointer transition-colors"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Revogar token
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => salvar(ag)}
                        className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer shadow-xs transition-all active:scale-98"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Salvar permissões
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {agentes.length === 0 && <p className="text-sm text-zinc-500 text-center py-4">Nenhum agente cadastrado.</p>}
        </div>
      )}

      {previa && <PreviaAcaoDrawer previa={previa} onClose={() => setPrevia(null)} />}

      {tokenMostrado && (
        <Drawer
          onClose={fecharToken}
          size="sm"
          title={`Token de ${tokenMostrado.agente}`}
          subtitle="Aparece só desta vez"
          footer={
            <div className="flex justify-end">
              <button type="button" onClick={fecharToken} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-900 text-white cursor-pointer">
                Já guardei
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-3 p-4 text-xs">
            <div className="px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 font-semibold">{AVISO_TOKEN}</div>
            <code className="block break-all select-all font-mono text-[11px] bg-zinc-900 text-zinc-50 rounded-lg p-3">{tokenMostrado.token}</code>
            <button
              type="button"
              onClick={() => copiar(tokenMostrado.token)}
              className="flex items-center justify-center gap-1.5 border border-zinc-300 text-zinc-800 hover:bg-zinc-100 text-xs font-bold px-4 py-2 rounded-xl cursor-pointer"
            >
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? 'Copiado' : 'Copiar token'}
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
