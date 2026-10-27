import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Drawer from '../../../geral/components/ui/Drawer';
import { BotaoAcao, FilterBar, FiltroSelect, StatusBadge } from '../../../geral/components/ui/ReportKit';
import type { VarianteBadge } from '../../../geral/components/ui/ReportKit';
import { apiJson } from '../../../geral/lib/http';

/**
 * Classificação de insumos: só o Edson classifica (nunca automático). OK (padrão), Sem controle, Não usado mais
 * ou Trocado (exige o substituto e o escopo). Tudo em 2 passos (prévia + OK) e auditado no servidor.
 */

export type TipoClasse = 'ok' | 'sem_controle' | 'nao_usado' | 'trocado';

export const ENDPOINT_CLASSIFICACAO = '/api/producao/insumos-classificacao';

export const ROTULO_CLASSE: Record<TipoClasse, string> = {
  ok: 'OK',
  sem_controle: 'Sem controle',
  nao_usado: 'Não usado mais',
  trocado: 'Trocado',
};

const EXPLICACAO: Record<TipoClasse, string> = {
  ok: 'Volta a ser controlado normalmente (remove a classificação e as trocas deste insumo).',
  sem_controle: 'O ERP não controla o estoque dele (ex.: o que a fábrica produz). Não acusa falta nem entra na compra.',
  nao_usado: 'Saiu de uso. Não acusa falta nem entra na compra.',
  trocado: 'Outro insumo ocupa o lugar dele na previsão. Não altera o ERP nem a fórmula.',
};

export interface ItemClassificado {
  codigo: string;
  descricao: string;
  unidade?: string | null;
  tipo: Exclude<TipoClasse, 'ok'>;
  marcadoPor?: string | null;
  marcadoEm: string;
  trocaId?: number;
  para?: string;
  descricaoPara?: string;
  produto?: string | null;
  descricaoProduto?: string | null;
  composicoesAfetadas?: number;
  formulaCorrigida?: boolean;
}

interface Candidato {
  codigo: string;
  descricao: string;
  unidade?: string | null;
}

interface Sugestao {
  codigo: string;
  descricao: string;
  livre?: number;
}

interface Previa {
  tipoAtual: string;
  tipoNovo: string;
  ordensPlanejadasQueUsam: number;
  trocasRemovidas: number;
  composicoesAfetadas?: number;
}

export function ClassificarInsumo({
  codigo,
  descricao,
  produto,
  sugestoes,
  inicial,
  onClose,
  onDone,
}: {
  codigo: string;
  descricao: string;
  /** Produto da linha em que o Edson está (habilita "só este produto" na troca). */
  produto?: string;
  sugestoes?: Sugestao[];
  inicial?: TipoClasse;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tipo, setTipo] = useState<TipoClasse>(inicial ?? 'sem_controle');
  const [para, setPara] = useState<Candidato | null>(null);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Candidato[]>([]);
  const [soProduto, setSoProduto] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (tipo !== 'trocado' || busca.trim().length < 2) {
      setAchados([]);
      return;
    }
    const t = setTimeout(() => {
      apiJson<Candidato[]>(`${ENDPOINT_CLASSIFICACAO}/buscar?q=${encodeURIComponent(busca.trim())}`)
        .then((l) => setAchados((Array.isArray(l) ? l : []).filter((c) => c.codigo !== codigo)))
        .catch(() => setAchados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busca, tipo, codigo]);

  const corpo = useCallback(
    (confirmar: boolean) =>
      JSON.stringify({
        codigo,
        tipo,
        para: tipo === 'trocado' ? para?.codigo : undefined,
        produto: tipo === 'trocado' && soProduto ? produto : undefined,
        confirmar,
      }),
    [codigo, tipo, para, soProduto, produto]
  );

  const pronto = tipo !== 'trocado' || Boolean(para);

  // 1º passo: prévia (nada é gravado)
  useEffect(() => {
    setPrevia(null);
    setErro(null);
    if (!pronto) return;
    apiJson<Previa>(ENDPOINT_CLASSIFICACAO, { method: 'PUT', body: corpo(false) })
      .then(setPrevia)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível calcular a prévia.'));
  }, [corpo, pronto]);

  const confirmar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await apiJson(ENDPOINT_CLASSIFICACAO, { method: 'PUT', body: corpo(true) });
      onDone();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar.');
      setSalvando(false);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      title="Classificar insumo"
      subtitle={`${descricao} · ${codigo}`}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: 12 }}>
          <BotaoAcao onClick={onClose}>Cancelar</BotaoAcao>
          <BotaoAcao primario onClick={confirmar} disabled={salvando || !pronto || !previa}>
            OK, gravar
          </BotaoAcao>
        </div>
      }
    >
      <div style={{ padding: 16, fontSize: '0.8rem' }}>
        {(['ok', 'sem_controle', 'nao_usado', 'trocado'] as TipoClasse[]).map((t) => (
          <label key={t} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
            <input type="radio" checked={tipo === t} onChange={() => setTipo(t)} style={{ marginTop: 3 }} />
            <span>
              <strong>{ROTULO_CLASSE[t]}</strong>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))' }}>{EXPLICACAO[t]}</span>
            </span>
          </label>
        ))}

        {tipo === 'trocado' && (
          <div style={{ borderTop: '1px solid hsl(var(--card-border-hsl))', paddingTop: 10, marginTop: 4 }}>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>
              Substituído por <span style={{ color: 'hsl(var(--danger-hsl))' }}>(obrigatório)</span>
            </p>
            {para ? (
              <p style={{ marginBottom: 6 }}>
                <StatusBadge variante="ordem">{para.descricao || para.codigo}</StatusBadge>{' '}
                <button type="button" className="tab-btn" style={{ padding: '1px 8px', fontSize: '0.7rem' }} onClick={() => setPara(null)}>
                  trocar a escolha
                </button>
              </p>
            ) : (
              <>
                {(sugestoes ?? []).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {(sugestoes ?? []).map((s) => (
                      <button
                        key={s.codigo}
                        type="button"
                        className="tab-btn"
                        style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                        title="Equivalente cadastrado em Itens Semelhantes"
                        onClick={() => setPara({ codigo: s.codigo, descricao: s.descricao })}
                      >
                        {s.descricao || s.codigo}
                        {s.livre !== undefined ? ` (livre ${Number(s.livre).toLocaleString('pt-BR', { maximumFractionDigits: 2 })})` : ''}
                      </button>
                    ))}
                  </div>
                )}
                <div className="search-input-wrapper" style={{ marginBottom: 4 }}>
                  <Search size={14} className="search-icon" />
                  <input
                    className="search-input"
                    style={{ fontSize: '0.78rem', padding: '5px 8px 5px 28px' }}
                    placeholder="Buscar o insumo substituto (nome ou código)..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                {achados.length > 0 && (
                  <ul style={{ border: '1px solid hsl(var(--card-border-hsl))', borderRadius: 8, maxHeight: 160, overflowY: 'auto' }}>
                    {achados.map((c) => (
                      <li key={c.codigo}>
                        <button
                          type="button"
                          onClick={() => setPara(c)}
                          style={{ width: '100%', textAlign: 'left', padding: '5px 8px', fontSize: '0.75rem', cursor: 'pointer', background: 'transparent', border: 'none' }}
                        >
                          {c.descricao} <span className="product-code" style={{ fontSize: '0.65rem' }}>{c.codigo}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>Vale para</p>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
              <input type="radio" checked={!soProduto} onChange={() => setSoProduto(false)} /> Todos os produtos
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: produto ? 1 : 0.5 }}>
              <input type="radio" disabled={!produto} checked={soProduto} onChange={() => setSoProduto(true)} />
              Só um produto{produto ? `: ${produto}` : ' (abra pela linha do produto para escolher)'}
            </label>
          </div>
        )}

        {previa && (
          <div style={{ marginTop: 12, fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))' }}>
            <p>
              {previa.ordensPlanejadasQueUsam} ordem(ns) planejada(s) usam este insumo na fórmula.
              {previa.composicoesAfetadas !== undefined ? ` ${previa.composicoesAfetadas} composição(ões) alcançada(s) pela troca.` : ''}
            </p>
            {previa.trocasRemovidas > 0 && <p style={{ color: 'hsl(var(--warning-hsl))' }}>Remove {previa.trocasRemovidas} troca(s) deste insumo.</p>}
          </div>
        )}
        <p style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 10 }}>
          Só você classifica; nada é feito sozinho. A ação fica registrada com o seu nome.
        </p>
        {erro && <p style={{ fontSize: '0.72rem', color: 'hsl(var(--danger-hsl))', marginTop: 6 }}>{erro}</p>}
      </div>
    </Drawer>
  );
}

const BADGE_CLASSE: Record<Exclude<TipoClasse, 'ok'>, VarianteBadge> = {
  sem_controle: 'descontinuado',
  nao_usado: 'descontinuado',
  trocado: 'ordem',
};

/** Produtos onde a troca vale (os que ainda têm o insumo original na fórmula). Carrega ao abrir. */
function ProdutosDaTroca({ trocaId }: { trocaId: number }) {
  const [produtos, setProdutos] = useState<Array<{ codigo: string; descricao: string }> | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    apiJson<Array<{ codigo: string; descricao: string }>>(`/api/producao/trocas/${trocaId}/produtos`)
      .then((l) => vivo && setProdutos(Array.isArray(l) ? l : []))
      .catch((e) => vivo && setErro(e?.message || 'Não foi possível carregar os produtos.'));
    return () => {
      vivo = false;
    };
  }, [trocaId]);

  if (erro) return <span style={{ color: 'hsl(var(--danger-hsl))' }}>{erro}</span>;
  if (!produtos) return <span style={{ color: 'hsl(var(--text-secondary-hsl))' }}>Carregando...</span>;
  if (produtos.length === 0) return <span style={{ color: 'hsl(var(--text-secondary-hsl))' }}>Nenhum produto usa mais o insumo original.</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {produtos.map((p) => (
        <span key={p.codigo} className="status-badge descontinuado" title={p.codigo}>
          {p.descricao || p.codigo} <span className="product-code" style={{ fontSize: '0.62rem' }}>{p.codigo}</span>
        </span>
      ))}
    </div>
  );
}

/** Tudo o que o Edson classificou, com "Alterar" (abre a mesma confirmação em 2 passos). */
export function TabelaClassificacao({ versao, onMudou }: { versao?: number; onMudou?: () => void }) {
  const [lista, setLista] = useState<ItemClassificado[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [alvo, setAlvo] = useState<ItemClassificado | null>(null);
  const [abertas, setAbertas] = useState<Set<number>>(new Set());
  const alternar = (id: number) =>
    setAbertas((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const carregar = useCallback(async () => {
    try {
      const l = await apiJson<ItemClassificado[]>(ENDPOINT_CLASSIFICACAO);
      setLista(Array.isArray(l) ? l : []);
    } catch {
      setLista([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  const q = busca.trim().toLowerCase();
  const visiveis = lista.filter((i) => (filtro === 'todos' || i.tipo === filtro) && (!q || `${i.descricao} ${i.codigo} ${i.descricaoPara ?? ''}`.toLowerCase().includes(q)));

  return (
    <>
      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar insumo...">
        <FiltroSelect
          value={filtro}
          onChange={setFiltro}
          opcoes={[
            { valor: 'todos', rotulo: 'Todas as classes' },
            { valor: 'sem_controle', rotulo: 'Sem controle' },
            { valor: 'nao_usado', rotulo: 'Não usado mais' },
            { valor: 'trocado', rotulo: 'Trocado' },
          ]}
        />
      </FilterBar>
      <div className="panel-card" style={{ overflowX: 'auto', padding: 0 }}>
        <table className="data-table compacta">
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Classe</th>
              <th>Detalhe</th>
              <th>Quem / quando</th>
              <th style={{ textAlign: 'center' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>
                  Nenhum insumo classificado. Use o botão "Classificar" na linha do insumo.
                </td>
              </tr>
            )}
            {visiveis.map((i) => (
              <React.Fragment key={`${i.codigo}-${i.tipo}-${i.trocaId ?? ''}`}>
              <tr>
                <td>
                  <div style={{ fontWeight: 600 }}>{i.descricao || i.codigo}</div>
                  <span className="product-code" style={{ fontSize: '0.65rem' }}>{i.codigo}</span>
                </td>
                <td><StatusBadge variante={BADGE_CLASSE[i.tipo]}>{ROTULO_CLASSE[i.tipo]}</StatusBadge></td>
                <td style={{ fontSize: '0.72rem' }}>
                  {i.tipo === 'trocado' ? (
                    <>
                      <div>→ <strong>{i.descricaoPara || i.para}</strong> · {i.produto ? `só ${i.descricaoProduto || i.produto}` : 'todos os produtos'}</div>
                      <div style={{ color: i.formulaCorrigida ? 'hsl(var(--success-hsl))' : 'hsl(var(--warning-hsl))' }}>
                        {i.formulaCorrigida ? 'Fórmula já corrigida' : `Corrigir a fórmula: ${i.composicoesAfetadas ?? 0} composição(ões) ainda usam o insumo antigo`}
                      </div>
                      {i.trocaId !== undefined && (
                        <button
                          type="button"
                          className="tab-btn"
                          style={{ padding: '2px 8px', fontSize: '0.68rem', marginTop: 3 }}
                          onClick={() => alternar(i.trocaId as number)}
                        >
                          {abertas.has(i.trocaId) ? 'Ocultar produtos' : 'Ver produtos'}
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ color: 'hsl(var(--text-secondary-hsl))' }}>—</span>
                  )}
                </td>
                <td style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))' }}>{i.marcadoPor ?? '—'} · {i.marcadoEm}</td>
                <td style={{ textAlign: 'center' }}>
                  <button type="button" className="tab-btn" style={{ padding: '3px 8px', fontSize: '0.7rem' }} onClick={() => setAlvo(i)}>
                    Alterar
                  </button>
                </td>
              </tr>
              {i.tipo === 'trocado' && i.trocaId !== undefined && abertas.has(i.trocaId) && (
                <tr>
                  <td colSpan={5} style={{ fontSize: '0.72rem', background: 'hsl(var(--background-hsl))' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {i.produto ? 'Vale só neste produto:' : 'Vale para todos os produtos cuja fórmula usa este insumo:'}
                    </div>
                    <ProdutosDaTroca trocaId={i.trocaId} />
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {alvo && (
        <ClassificarInsumo
          codigo={alvo.codigo}
          descricao={alvo.descricao || alvo.codigo}
          inicial="ok"
          onClose={() => setAlvo(null)}
          onDone={() => {
            setAlvo(null);
            carregar();
            onMudou?.();
          }}
        />
      )}
    </>
  );
}
