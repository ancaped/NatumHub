import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, LayoutGrid, Loader2, RefreshCw } from 'lucide-react';
import type { AuthUser } from '../lib/auth';
import { apiJson } from '../lib/http';
import { canAccessView } from '../lib/modules/permissions';
import {
  fetchNotifications,
  formatNotificationTime,
  moduleLabelForNotification,
  type HubNotification,
} from '../lib/notifications';
import {
  getAccessibleSubmodules,
  getNavModuleGroups,
  sortSubmodulesByUsage,
} from '../lib/nav/navRegistry';
import { ReportHeader, ReportTabs, StatusBadge, type VarianteBadge } from '../components/ui/ReportKit';

interface HomeDashboardProps {
  currentUser: AuthUser | null;
  usage: Record<string, number>;
  setView: (view: string) => void;
}

type Severidade = 'ok' | 'aviso' | 'critico';

interface ChecagemSaude {
  chave: string;
  titulo: string;
  severidade: Severidade;
  quantidade: number;
}

interface RespostaSaude {
  ultima: { executadoEm: string; resultado?: { checagens?: ChecagemSaude[] } } | null;
}

interface InsumoFalta {
  status: 'ok' | 'depende_atrasado' | 'chega_depois' | 'chega_sem_data' | 'falta';
}

interface ProdutoFalta {
  semFormula: boolean;
  embalagem: InsumoFalta[];
  materiaPrima: InsumoFalta[];
}

interface RelatorioFaltas {
  semana: string;
  ordens: { linha: string; produtos: ProdutoFalta[] }[];
}

interface ItemAtencao {
  id: string;
  origem: string;
  assunto: string;
  detalhe?: string;
  quando?: string;
  variante: VarianteBadge;
  rotulo: string;
  peso: number;
  destino?: string;
}

const SEVERIDADE_ROTULO: Record<Severidade, string> = { ok: 'ok', aviso: 'aviso', critico: 'crítico' };

function itemDeNotificacao(n: HubNotification): ItemAtencao {
  const erro = n.kind === 'error';
  const aviso = n.kind === 'warning';
  return {
    id: `n-${n.id}`,
    origem: moduleLabelForNotification(n.moduleKey),
    assunto: n.title,
    detalhe: n.message,
    quando: formatNotificationTime(n.createdAt),
    variante: erro ? 'critico' : aviso ? 'ordem' : n.kind === 'success' ? 'saudavel' : 'descontinuado',
    rotulo: erro ? 'erro' : aviso ? 'aviso' : 'info',
    peso: erro ? 0 : aviso ? 1 : 2,
  };
}

function itemDeChecagem(c: ChecagemSaude): ItemAtencao {
  return {
    id: `s-${c.chave}`,
    origem: 'Dados do ERP',
    assunto: c.titulo,
    detalhe: `${c.quantidade} ${c.quantidade === 1 ? 'ocorrência' : 'ocorrências'}`,
    variante: c.severidade === 'critico' ? 'critico' : 'ordem',
    rotulo: SEVERIDADE_ROTULO[c.severidade],
    peso: c.severidade === 'critico' ? 0 : 1,
    destino: 'hub_settings',
  };
}

/** Uma linha por linha de produto com falta de insumo nas ordens da semana (a fila de demandas fica de fora). */
function itensDeFaltas(rel: RelatorioFaltas): ItemAtencao[] {
  const semanaNum = rel.semana.split('-W')[1] ?? rel.semana;
  return rel.ordens
    .map((l) => {
      let semCobertura = 0;
      let outros = 0;
      for (const p of l.produtos) {
        if (p.semFormula) semCobertura += 1;
        for (const i of [...p.embalagem, ...p.materiaPrima]) {
          if (i.status === 'falta') semCobertura += 1;
          else outros += 1;
        }
      }
      const critico = semCobertura > 0;
      const partes = [
        semCobertura > 0 ? `${semCobertura} sem cobertura` : null,
        outros > 0 ? `${outros} chegam depois, sem previsão ou atrasados` : null,
      ].filter(Boolean);
      return {
        id: `f-${l.linha}`,
        origem: `Produção · semana ${semanaNum}`,
        assunto: `${l.linha}: ${l.produtos.length} ${l.produtos.length === 1 ? 'produto' : 'produtos'} com falta de insumo`,
        detalhe: partes.join(' · '),
        variante: critico ? 'critico' : 'ordem',
        rotulo: critico ? 'falta' : 'aviso',
        peso: critico ? 0 : 1,
        destino: 'admin_faltas_linha',
      } as ItemAtencao;
    })
    .sort((a, b) => a.peso - b.peso || a.assunto.localeCompare(b.assunto, 'pt-BR'));
}

/** Tela inicial: o que pede atenção agora e atalhos para os módulos que a pessoa usa. */
export default function HomeDashboard({ currentUser, usage, setView }: HomeDashboardProps) {
  const [aba, setAba] = useState<'atencao' | 'atalhos'>('atencao');
  const [avisosItens, setAvisosItens] = useState<ItemAtencao[]>([]);
  const [faltasItens, setFaltasItens] = useState<ItemAtencao[]>([]);
  const ultimaBuscaFaltas = useRef(0);
  const podeVerFaltas = canAccessView(currentUser, 'admin_produtos_ativos_relatorios');
  const [ultimaChecagem, setUltimaChecagem] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true);
    // A simulação das faltas pesa no servidor: só refaz a cada 5 min (ou ao clicar em Atualizar).
    const buscarFaltas = podeVerFaltas && (forcar || Date.now() - ultimaBuscaFaltas.current > 5 * 60 * 1000);
    const [avisos, saude, faltas] = await Promise.allSettled([
      fetchNotifications(),
      apiJson<RespostaSaude>('/import/saude'),
      buscarFaltas ? apiJson<RelatorioFaltas>('/producao/cobertura/faltas-por-linha') : Promise.resolve(null),
    ]);
    const lista: ItemAtencao[] = [];
    if (avisos.status === 'fulfilled') {
      lista.push(...avisos.value.filter((n) => !n.read).slice(0, 30).map(itemDeNotificacao));
    }
    if (saude.status === 'fulfilled') {
      const checagens = saude.value.ultima?.resultado?.checagens ?? [];
      lista.push(...checagens.filter((c) => c.severidade !== 'ok' && c.quantidade > 0).map(itemDeChecagem));
      setUltimaChecagem(saude.value.ultima?.executadoEm ?? null);
    }
    if (faltas.status === 'fulfilled' && faltas.value) {
      ultimaBuscaFaltas.current = Date.now();
      setFaltasItens(itensDeFaltas(faltas.value));
    }
    // Só considera falha quando nada respondeu (sem permissão na saúde do ERP é normal para operador comum).
    setFalhou(avisos.status === 'rejected' && saude.status === 'rejected' && faltas.status === 'rejected');
    lista.sort((a, b) => a.peso - b.peso);
    setAvisosItens(lista);
    setCarregando(false);
  }, [podeVerFaltas]);

  useEffect(() => {
    carregar();
    const id = setInterval(() => carregar(), 60000);
    return () => clearInterval(id);
  }, [carregar]);

  const itens = useMemo(
    () => [...avisosItens, ...(podeVerFaltas ? faltasItens : [])].sort((a, b) => a.peso - b.peso),
    [avisosItens, faltasItens, podeVerFaltas]
  );

  const grupos = useMemo(() => {
    return getNavModuleGroups(currentUser).map((g) => ({
      key: String(g.key),
      label: g.label,
      itens: g.directView
        ? [{ view: g.directView, label: g.label, icon: LayoutGrid, defaultOrder: 0 }]
        : sortSubmodulesByUsage(getAccessibleSubmodules(g, currentUser), usage),
    }));
  }, [currentUser, usage]);

  const maisUsados = useMemo(() => {
    const todos = grupos.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.label })));
    return todos
      .filter((i) => (usage[i.view] ?? 0) > 0)
      .sort((a, b) => (usage[b.view] ?? 0) - (usage[a.view] ?? 0))
      .slice(0, 6);
  }, [grupos, usage]);

  const abrir = (view: string) => {
    if (canAccessView(currentUser, view)) setView(view);
  };

  const nome = currentUser?.displayName?.split(' ')[0];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-zinc-50">
      <div className="w-full max-w-5xl mx-auto p-3 sm:p-6">
        <ReportHeader
          titulo={nome ? `Olá, ${nome}` : 'Início'}
          subtitulo={
            ultimaChecagem
              ? `Última checagem dos dados do ERP: ${formatNotificationTime(ultimaChecagem)}`
              : 'O que precisa de atenção e seus atalhos'
          }
          acoes={
            <button
              type="button"
              onClick={() => carregar(true)}
              disabled={carregando}
              className="tab-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: '0.75rem', minHeight: 36 }}
              title="Atualizar"
            >
              {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Atualizar
            </button>
          }
        />

        <ReportTabs
          abas={[
            { id: 'atencao', label: 'Atenção', contagem: itens.length },
            { id: 'atalhos', label: 'Atalhos' },
          ]}
          ativa={aba}
          onChange={(id) => setAba(id as 'atencao' | 'atalhos')}
        />

        {aba === 'atencao' && (
          <div className="panel-card" style={{ padding: 0 }}>
            {carregando && itens.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : falhou ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-zinc-600">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                Não foi possível carregar os avisos agora. Tente atualizar.
              </div>
            ) : itens.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-zinc-600">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                Nada precisa de atenção agora.
              </div>
            ) : (
              <ul>
                {itens.map((it) => {
                  const clicavel = Boolean(it.destino) && canAccessView(currentUser, it.destino!);
                  const Linha = clicavel ? 'button' : 'div';
                  return (
                    <li key={it.id} className="border-b border-zinc-100 last:border-b-0">
                      <Linha
                        {...(clicavel ? { type: 'button' as const, onClick: () => abrir(it.destino!) } : {})}
                        className={`w-full text-left flex items-start gap-3 px-3 sm:px-4 py-3 min-h-[44px] ${
                          clicavel ? 'cursor-pointer hover:bg-zinc-50' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-zinc-900 break-words">{it.assunto}</div>
                          {it.detalhe && (
                            <div className="text-xs text-zinc-500 mt-0.5 break-words line-clamp-2">{it.detalhe}</div>
                          )}
                          <div className="text-[11px] text-zinc-400 mt-1">
                            {it.origem}
                            {it.quando ? ` · ${it.quando}` : ''}
                          </div>
                        </div>
                        <StatusBadge variante={it.variante}>{it.rotulo}</StatusBadge>
                      </Linha>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {aba === 'atalhos' && (
          <div className="space-y-5">
            {maisUsados.length > 0 && (
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Mais usados</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {maisUsados.map((i) => (
                    <Atalho key={`u-${i.view}`} icone={i.icon} titulo={i.label} subtitulo={i.grupo} onClick={() => abrir(i.view)} />
                  ))}
                </div>
              </section>
            )}
            {grupos.map((g) => (
              <section key={g.key}>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">{g.label}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {g.itens.map((i) => (
                    <Atalho key={`${g.key}-${i.view}`} icone={i.icon} titulo={i.label} onClick={() => abrir(i.view)} />
                  ))}
                </div>
              </section>
            ))}
            {grupos.length === 0 && (
              <div className="panel-card px-4 py-8 text-sm text-zinc-600">Nenhum módulo liberado para este usuário.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Atalho({
  icone: Icone,
  titulo,
  subtitulo,
  onClick,
}: {
  icone: React.ComponentType<{ className?: string }>;
  titulo: string;
  subtitulo?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 bg-white border border-zinc-200 hover:border-zinc-400 rounded-xl px-3 py-2.5 min-h-[48px] text-left cursor-pointer transition-colors"
    >
      <span className="bg-zinc-100 text-zinc-900 p-2 rounded-lg shrink-0 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
        <Icone className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-zinc-900 truncate">{titulo}</span>
        {subtitulo && <span className="block text-[11px] text-zinc-400 truncate">{subtitulo}</span>}
      </span>
    </button>
  );
}
