import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Loader2, Plus, Printer, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { BotaoAcao, FilterBar, FiltroSelect, ReportHeader, ReportTabs, StatusBadge, TabelaPainel } from '../../../geral/components/ui/ReportKit';
import type { VarianteBadge } from '../../../geral/components/ui/ReportKit';
import { unidadesParaKg, ehBaseProduto } from '../../lib/unitConversion';
import { ProductDetailsDrawer } from './ProductDetailsDrawer';

/**
 * Saúde do Estoque: a classificação vem pronta do servidor (`GET /api/producao/saude-estoque`),
 * na mesma base da Demanda de Produção. A tela só lista, filtra, ordena e imprime.
 */

type Situacao = 'ruptura' | 'baixo' | 'adequado' | 'excesso' | 'sem_giro' | 'especial';

interface ItemSaude {
  codigo: string;
  descricao: string;
  linha_prefix: string;
  nome_linha: string;
  tipo: 'produto' | 'kit' | 'coloracao' | 'apoio';
  situacao: Situacao;
  selo: string | null;
  situacao_produto: string | null;
  estoque: number;
  em_producao: number;
  pedidos_aberto: number;
  estoque_demanda: number;
  ideal: number;
  gatilho: number;
  media_mensal: number;
  cobertura_dias: number | null;
  excedente: number;
  vendas_3m: number;
  vendas_12m: number;
  tendencia_pct: number | null;
  ultima_venda: string | null;
  dias_sem_venda: number | null;
  ultima_producao: string | null;
  planejado: boolean;
  na_fila: boolean;
  faltas_venda: number;
  status_demanda: string;
  producao_recomendada: number;
  papel_kit: 'so_kit' | 'em_kit' | null;
  kits_pais: string[];
  vendas_diretas_12m: number;
  vendas_por_kits_12m: number;
  em_transito: number;
  previsao_chegada: string | null;
  sugestao_compra: number;
  falta_agora_coberta: boolean;
}

interface Retirado {
  codigo: string;
  descricao: string | null;
  motivo: string | null;
  retirado_por: string;
  retirado_em: string;
}

interface RespostaSaude {
  retirados: Retirado[];
  gerado_em: string;
  regras: { fator_excesso: number; dias_sem_giro: number };
  contagens: Record<string, number>;
  itens: ItemSaude[];
}

type Aba = 'disponibilidade' | 'excesso' | 'sem_giro' | 'todos' | 'retirados';

const ROTULO: Record<Situacao, string> = {
  ruptura: 'Ruptura',
  baixo: 'Baixo',
  adequado: 'Adequado',
  excesso: 'Excesso',
  sem_giro: 'Sem giro',
  especial: 'Especial',
};
const VARIANTE: Record<Situacao, VarianteBadge> = {
  ruptura: 'critico',
  baixo: 'ordem',
  adequado: 'saudavel',
  excesso: 'abundante',
  sem_giro: 'descontinuado',
  especial: 'apoio',
};
const ROTULO_SELO: Record<string, string> = { lancamento: 'Lançamento', encomenda: 'Encomenda', terceirizado: 'Terceirizado' };

const ABAS_SITUACOES: Record<Exclude<Aba, 'retirados'>, Situacao[] | null> = {
  disponibilidade: ['ruptura', 'baixo'],
  excesso: ['excesso'],
  sem_giro: ['sem_giro'],
  todos: null,
};

const ORDEM_PADRAO: Record<Exclude<Aba, 'retirados'>, { campo: string; dir: 'asc' | 'desc' }> = {
  disponibilidade: { campo: 'cobertura_dias', dir: 'asc' },
  excesso: { campo: 'excedente', dir: 'desc' },
  sem_giro: { campo: 'dias_sem_venda', dir: 'desc' },
  todos: { campo: 'codigo', dir: 'asc' },
};

const num = (n: number) => n.toLocaleString('pt-BR');
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const diasTxt = (d: number | null) => (d == null ? '—' : d >= 365 ? `${num(Math.round(d))} d (${(d / 365).toFixed(1).replace('.', ',')} a)` : `${num(Math.round(d))} d`);
const mesesTxt = (d: number | null) => (d == null ? '—' : `${(d / 30).toFixed(1).replace('.', ',')} m`);
/** A caminho = fabricados: em produção. Comprados prontos: pedido de compra em trânsito e a previsão de chegada. */
const entrada = (i: ItemSaude) =>
  i.tipo === 'coloracao' || i.tipo === 'apoio'
    ? i.em_transito > 0 ? `+${num(i.em_transito)} un${i.previsao_chegada ? ` · chega ${dataBr(i.previsao_chegada)}` : ''}` : '—'
    : i.em_producao > 0 ? num(i.em_producao) : '—';
const tendenciaTxt = (t: number | null) => (t == null ? '—' : `${t > 0 ? '+' : ''}${t.toLocaleString('pt-BR')}%`);

/** Valor de ordenação; sem valor vai para o fim (sem giro: quem nunca vendeu vem primeiro). */
function valorOrdem(i: ItemSaude, campo: string): number | string {
  switch (campo) {
    case 'codigo': return i.codigo;
    case 'descricao': return i.descricao.toLowerCase();
    case 'situacao': return ['ruptura', 'baixo', 'sem_giro', 'excesso', 'adequado', 'especial'].indexOf(i.situacao);
    case 'cobertura_dias': return i.cobertura_dias ?? Number.POSITIVE_INFINITY;
    case 'dias_sem_venda': return i.dias_sem_venda ?? Number.POSITIVE_INFINITY;
    case 'tendencia_pct': return i.tendencia_pct ?? Number.NEGATIVE_INFINITY;
    case 'ultima_producao': return i.ultima_producao ?? '';
    case 'ultima_venda': return i.ultima_venda ?? '';
    default: return (i as any)[campo] ?? 0;
  }
}

interface Props {
  setView?: (view: string) => void;
}

export function StockHealthTab({ setView }: Props) {
  const [dados, setDados] = useState<RespostaSaude | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('disponibilidade');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('todos');
  const [linha, setLinha] = useState('todas');
  const [ordem, setOrdem] = useState(ORDEM_PADRAO.disponibilidade);
  const [filtroSituacao, setFiltroSituacao] = useState<Situacao | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [enfileirando, setEnfileirando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await apiFetch('/producao/saude-estoque');
      if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`);
      setDados(await res.json());
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar a Saúde do Estoque');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const trocarAba = (a: string) => {
    setAba(a as Aba);
    setFiltroSituacao(null);
    if (a !== 'retirados') setOrdem(ORDEM_PADRAO[a as Exclude<Aba, 'retirados'>]);
  };

  const ordenarPor = (campo: string) =>
    setOrdem((o) => (o.campo === campo ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: campo === 'codigo' || campo === 'descricao' ? 'asc' : 'desc' }));

  const linhas = useMemo(() => {
    const m = new Map<string, string>();
    (dados?.itens ?? []).forEach((i) => m.set(i.linha_prefix, i.nome_linha || i.linha_prefix));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [dados]);

  // Busca, tipo e linha valem para as contagens e para a lista; a aba escolhe as situações.
  const base = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (dados?.itens ?? []).filter(
      (i) =>
        (!t || i.codigo.toLowerCase().includes(t) || i.descricao.toLowerCase().includes(t)) &&
        (tipo === 'todos' || i.tipo === tipo) &&
        (linha === 'todas' || i.linha_prefix === linha),
    );
  }, [dados, busca, tipo, linha]);

  const contar = (a: Exclude<Aba, 'retirados'>) => {
    const s = ABAS_SITUACOES[a];
    return s ? base.filter((i) => s.includes(i.situacao)).length : base.length;
  };

  const lista = useMemo(() => {
    if (aba === 'retirados') return [];
    const s = ABAS_SITUACOES[aba];
    const sel = (s ? base.filter((i) => s.includes(i.situacao)) : [...base]).filter((i) => !filtroSituacao || i.situacao === filtroSituacao);
    const f = ordem.dir === 'asc' ? 1 : -1;
    sel.sort((a, b) => {
      const va = valorOrdem(a, ordem.campo);
      const vb = valorOrdem(b, ordem.campo);
      const r = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : (va as number) - (vb as number);
      return (Number.isNaN(r) ? 0 : r) * f || a.codigo.localeCompare(b.codigo);
    });
    return sel;
  }, [base, aba, ordem, filtroSituacao]);

  const alterarRetirado = async (codigo: string, retirar: boolean) => {
    setEnfileirando(codigo);
    try {
      const res = await apiFetch(`/producao/saude-estoque/${retirar ? 'retirar' : 'restaurar'}?confirmar=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      });
      if (res.ok) await carregar();
      else setErro((await res.json().catch(() => null))?.error ?? `Servidor respondeu ${res.status}`);
    } catch (e: any) {
      setErro(e?.message || 'Falha ao alterar a lista de retirados');
    } finally {
      setEnfileirando(null);
    }
  };

  const enfileirar = async (i: ItemSaude) => {
    const sugerido = i.producao_recomendada > 0 ? i.producao_recomendada : Math.max(Math.round(i.ideal - i.estoque_demanda), 1);
    const kgBruto = unidadesParaKg(sugerido, i.descricao, ehBaseProduto({ codigo: i.codigo, descricao: i.descricao }));
    setEnfileirando(i.codigo);
    try {
      const res = await apiFetch('/producao/fila-demandas?confirmar=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoProduto: i.codigo,
          descricao: i.descricao,
          quantidade: sugerido,
          unidade: 'un',
          quantidadeKg: kgBruto == null ? null : Math.round(kgBruto * 10) / 10,
          origemDemanda: 'sugestao_estoque',
        }),
      });
      if (res.ok) await carregar();
    } catch (e) {
      console.error('Erro ao adicionar à fila de demandas:', e);
    } finally {
      setEnfileirando(null);
    }
  };

  const Th = ({ campo, children, dir }: { campo: string; children: React.ReactNode; dir?: 'right' }) => (
    <th style={{ textAlign: dir ?? 'left', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => ordenarPor(campo)}>
      {children}
      {ordem.campo === campo && (ordem.dir === 'asc' ? <ArrowUp size={11} style={{ marginLeft: 3, display: 'inline' }} /> : <ArrowDown size={11} style={{ marginLeft: 3, display: 'inline' }} />)}
    </th>
  );

  const Produto = ({ i }: { i: ItemSaude }) => (
    <>
      <div style={{ fontWeight: 700, fontSize: '0.78rem' }}>{i.descricao}</div>
      <div style={{ fontSize: '0.68rem', color: 'hsl(var(--text-secondary-hsl))', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="font-mono">{i.codigo}</span>
        {i.tipo === 'kit' && <span>Kit</span>}
        {i.tipo === 'coloracao' && <span>Coloração</span>}
        {i.tipo === 'apoio' && <span>Apoio</span>}
        {i.papel_kit && <span style={{ fontWeight: 700 }} title={`Kits: ${i.kits_pais.join(', ')}`}>{i.papel_kit === 'so_kit' ? 'Só kit' : 'Também em kit'}</span>}
        {i.selo && <span style={{ fontWeight: 700 }}>{ROTULO_SELO[i.selo] ?? i.selo}</span>}
        {i.situacao_produto === 'saindo_de_linha' && <span style={{ fontWeight: 700 }}>Saindo de linha</span>}
      </div>
      {i.falta_agora_coberta && (
        <div style={{ fontSize: '0.66rem', color: 'hsl(var(--text-secondary-hsl))', fontStyle: 'italic' }}>
          {i.estoque <= 0 ? 'Zerado agora' : 'Abaixo do gatilho agora'}, coberto {i.tipo === 'coloracao' || i.tipo === 'apoio' ? 'pelo pedido de compra' : 'pela produção'}
        </div>
      )}
      {i.papel_kit && (
        <div style={{ fontSize: '0.66rem', color: 'hsl(var(--text-secondary-hsl))' }}>
          Vendas 12 m: {num(i.vendas_diretas_12m)} direto + {num(i.vendas_por_kits_12m)} por kits
        </div>
      )}
    </>
  );

  const AcaoFila = ({ i }: { i: ItemSaude }) =>
    i.tipo === 'coloracao' || i.tipo === 'apoio' ? (
      i.sugestao_compra > 0 ? <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>Comprar {num(i.sugestao_compra)}</span> : null
    ) : i.na_fila || i.planejado ? (
      <StatusBadge variante="aguardando">{i.planejado ? 'Planejado' : 'Na fila'}</StatusBadge>
    ) : (
      <button
        type="button"
        className="tab-btn"
        disabled={enfileirando === i.codigo}
        onClick={(e) => { e.stopPropagation(); enfileirar(i); }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: '0.72rem', minHeight: 44 }}
      >
        {enfileirando === i.codigo ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Fila
      </button>
    );

  const AcaoLinha = () => (
    <button
      type="button"
      className="tab-btn"
      onClick={(e) => { e.stopPropagation(); setView?.('admin_linha_produtos'); }}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: '0.72rem', minHeight: 44 }}
      title="A situação do produto (inativar) é mudada em Administrativo > Linha de Produtos"
    >
      Linha de Produtos <ChevronRight size={12} />
    </button>
  );

  const AcaoTirar = ({ i }: { i: ItemSaude }) => (
    <button
      type="button"
      className="tab-btn"
      disabled={enfileirando === i.codigo}
      title="Tirar do relatório (volta pela aba Retirados)"
      onClick={(e) => { e.stopPropagation(); alterarRetirado(i.codigo, true); }}
      style={{ padding: '4px 10px', fontSize: '0.72rem', minHeight: 44 }}
    >
      Tirar
    </button>
  );

  const colunas = aba === 'retirados' ? [] : colunasDaAba(aba);

  /** Texto de cada célula da aba (usado nas linhas do celular e na impressão). */
  function colunasDaAba(a: Exclude<Aba, 'retirados'>): { campo: string; rotulo: string; direita?: boolean; valor: (i: ItemSaude) => React.ReactNode; texto: (i: ItemSaude) => string }[] {
    const sit = { campo: 'situacao', rotulo: 'Situação', valor: (i: ItemSaude) => <StatusBadge variante={VARIANTE[i.situacao]}>{ROTULO[i.situacao]}</StatusBadge>, texto: (i: ItemSaude) => ROTULO[i.situacao] };
    const est = { campo: 'estoque', rotulo: 'Estoque atual', direita: true, valor: (i: ItemSaude) => num(i.estoque), texto: (i: ItemSaude) => num(i.estoque) };
    const fut = { campo: 'estoque_demanda', rotulo: 'Atual → futuro', direita: true, valor: (i: ItemSaude) => `${num(i.estoque)} → ${num(i.estoque_demanda)}`, texto: (i: ItemSaude) => `${num(i.estoque)} → ${num(i.estoque_demanda)}` };
    const ideal = { campo: 'ideal', rotulo: 'Ideal', direita: true, valor: (i: ItemSaude) => num(i.ideal), texto: (i: ItemSaude) => num(i.ideal) };
    const cobDias = { campo: 'cobertura_dias', rotulo: 'Cobertura', direita: true, valor: (i: ItemSaude) => diasTxt(i.cobertura_dias), texto: (i: ItemSaude) => diasTxt(i.cobertura_dias) };
    const ultProd = { campo: 'ultima_producao', rotulo: 'Últ. produção', valor: (i: ItemSaude) => dataBr(i.ultima_producao), texto: (i: ItemSaude) => dataBr(i.ultima_producao) };
    const ultVenda = { campo: 'ultima_venda', rotulo: 'Últ. venda', valor: (i: ItemSaude) => dataBr(i.ultima_venda), texto: (i: ItemSaude) => dataBr(i.ultima_venda) };
    if (a === 'disponibilidade') {
      return [
        sit, fut, ideal, cobDias,
        { campo: 'faltas_venda', rotulo: 'Faltas', direita: true, valor: (i) => (i.faltas_venda > 0 ? num(i.faltas_venda) : '—'), texto: (i) => (i.faltas_venda > 0 ? num(i.faltas_venda) : '—') },
        { campo: 'em_producao', rotulo: 'A caminho', direita: true, valor: (i) => entrada(i), texto: (i) => entrada(i) },
      ];
    }
    if (a === 'excesso') {
      return [
        fut, ideal,
        { campo: 'excedente', rotulo: 'Excedente', direita: true, valor: (i) => num(i.excedente), texto: (i) => num(i.excedente) },
        { campo: 'cobertura_dias', rotulo: 'Cobertura', direita: true, valor: (i) => mesesTxt(i.cobertura_dias), texto: (i) => mesesTxt(i.cobertura_dias) },
        { campo: 'tendencia_pct', rotulo: 'Tendência', direita: true, valor: (i) => tendenciaTxt(i.tendencia_pct), texto: (i) => tendenciaTxt(i.tendencia_pct) },
        ultProd,
      ];
    }
    if (a === 'sem_giro') {
      return [
        { ...est, rotulo: 'Estoque parado' }, ultVenda,
        { campo: 'dias_sem_venda', rotulo: 'Dias sem venda', direita: true, valor: (i) => (i.dias_sem_venda == null ? 'Nunca vendeu' : diasTxt(i.dias_sem_venda)), texto: (i) => (i.dias_sem_venda == null ? 'Nunca vendeu' : diasTxt(i.dias_sem_venda)) },
        ultProd,
      ];
    }
    return [sit, fut, ideal, cobDias, ultVenda];
  }

  // Cartões: contagens do que o endpoint devolveu, respeitando busca, tipo e linha (e sem os retirados, que o servidor já tirou).
  const porSituacao = (s: Situacao) => base.filter((i) => i.situacao === s).length;
  const escolherSituacao = (s: Situacao | null) => {
    if (s === null) { setAba('todos'); setFiltroSituacao(null); setOrdem(ORDEM_PADRAO.todos); return; }
    if (aba !== 'todos' && !(aba === 'disponibilidade' && (s === 'ruptura' || s === 'baixo'))) {
      setAba(s === 'ruptura' || s === 'baixo' ? 'disponibilidade' : s === 'excesso' ? 'excesso' : s === 'sem_giro' ? 'sem_giro' : 'todos');
    }
    setFiltroSituacao((atual) => (atual === s ? null : s));
    setOrdem(ORDEM_PADRAO[s === 'ruptura' || s === 'baixo' ? 'disponibilidade' : s === 'excesso' ? 'excesso' : s === 'sem_giro' ? 'sem_giro' : 'todos']);
  };
  const totalCartoes = base.length;
  const adequados = porSituacao('adequado');
  const pctAdequado = totalCartoes ? Math.round((adequados / totalCartoes) * 100) : 0;

  const abas = [
    { id: 'disponibilidade', label: 'Disponibilidade', contagem: contar('disponibilidade') },
    { id: 'excesso', label: 'Excesso', contagem: contar('excesso') },
    { id: 'sem_giro', label: 'Sem giro', contagem: contar('sem_giro') },
    { id: 'todos', label: 'Todos', contagem: contar('todos') },
    { id: 'retirados', label: 'Retirados', contagem: dados?.retirados.length ?? 0 },
  ];
  const tituloAba = abas.find((a) => a.id === aba)?.label ?? '';
  const regras = dados?.regras;

  if (aba === 'retirados') {
    const rs = dados?.retirados ?? [];
    return (
      <div>
        <ReportTabs abas={abas} ativa={aba} onChange={trocarAba} />
        {erro && <div className="panel-card" style={{ padding: 12, fontSize: '0.8rem', marginBottom: 8 }}>{erro}</div>}
        {rs.length === 0 ? (
          <div className="panel-card" style={{ padding: 16, fontSize: '0.8rem' }}>Nenhum produto foi tirado do relatório.</div>
        ) : (
          <div className="panel-card" style={{ padding: 0 }}>
            {rs.map((r) => (
              <div key={r.codigo} style={{ padding: '10px 12px', borderBottom: '1px solid hsl(var(--border-hsl, 240 6% 90%))', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem' }}>{r.descricao ?? r.codigo}</div>
                  <div style={{ fontSize: '0.68rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                    <span className="font-mono">{r.codigo}</span> · tirado por {r.retirado_por || '—'} em {dataBr(r.retirado_em)}{r.motivo ? ` · ${r.motivo}` : ''}
                  </div>
                </div>
                <button type="button" className="tab-btn" disabled={enfileirando === r.codigo} onClick={() => alterarRetirado(r.codigo, false)} style={{ padding: '4px 12px', fontSize: '0.72rem', minHeight: 44 }}>
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="no-print">
        <ReportHeader
          titulo="Saúde do Estoque"
          subtitulo={regras ? `Produtos, kits, coloração e apoio · excesso: acima de ${regras.fator_excesso}× o ideal · sem giro: ${regras.dias_sem_giro} dias sem venda` : 'Produtos, kits, coloração e apoio'}
          acoes={
            <>
              <BotaoAcao onClick={carregar} disabled={carregando} title="Atualizar">
                <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} /> Atualizar
              </BotaoAcao>
              <BotaoAcao primario onClick={() => setTimeout(() => window.print(), 100)} disabled={!lista.length}>
                <Printer size={13} /> Imprimir
              </BotaoAcao>
            </>
          }
        />
        {/* Cartões do estado do estoque (exceção do Edson à regra "sem cards de KPI": só nesta tela; ver ai-memory) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            className="panel-card"
            onClick={() => escolherSituacao(null)}
            title="Parcela dos produtos em situação adequada; clique para ver todos"
            style={{ flex: '1 1 150px', minHeight: 44, padding: '8px 12px', textAlign: 'left', cursor: 'pointer', outline: aba === 'todos' && !filtroSituacao ? '2px solid hsl(var(--primary-hsl))' : 'none' }}
          >
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'hsl(var(--text-secondary-hsl))' }}>Visão geral</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{pctAdequado}% <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--text-secondary-hsl))' }}>adequados · {num(totalCartoes)} itens</span></div>
          </button>
          {(['ruptura', 'baixo', 'adequado', 'excesso', 'sem_giro'] as Situacao[]).map((s) => (
            <button
              key={s}
              type="button"
              className="panel-card"
              onClick={() => escolherSituacao(s)}
              style={{ flex: '1 1 96px', minHeight: 44, padding: '8px 12px', textAlign: 'left', cursor: 'pointer', outline: filtroSituacao === s ? '2px solid hsl(var(--primary-hsl))' : 'none' }}
            >
              <div style={{ marginBottom: 2 }}><StatusBadge variante={VARIANTE[s]}>{ROTULO[s]}</StatusBadge></div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{num(porSituacao(s))}</div>
            </button>
          ))}
        </div>
        <ReportTabs abas={abas} ativa={aba} onChange={trocarAba} />
        <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar por código ou descrição...">
          <FiltroSelect value={tipo} onChange={setTipo} opcoes={[{ valor: 'todos', rotulo: 'Todos os tipos' }, { valor: 'produto', rotulo: 'Só produtos' }, { valor: 'kit', rotulo: 'Só kits' }, { valor: 'coloracao', rotulo: 'Coloração' }, { valor: 'apoio', rotulo: 'Apoio' }]} />
          <FiltroSelect value={linha} onChange={setLinha} opcoes={[{ valor: 'todas', rotulo: 'Todas as linhas' }, ...linhas.map(([k, n]) => ({ valor: k, rotulo: n }))]} />
        </FilterBar>

        {erro && <div className="panel-card" style={{ padding: 12, fontSize: '0.8rem' }}>{erro}</div>}
        {!erro && carregando && !dados && <div className="panel-card" style={{ padding: 16, fontSize: '0.8rem' }}>Carregando…</div>}
        {!erro && dados && lista.length === 0 && <div className="panel-card" style={{ padding: 16, fontSize: '0.8rem' }}>Nenhum produto nesta lista.</div>}

        {lista.length > 0 && (
          <>
            {/* Tela larga: tabela */}
            <div className="hidden md:block">
              <TabelaPainel>
                <thead>
                  <tr>
                    <Th campo="descricao">Produto</Th>
                    {colunas.map((c) => <Th key={c.campo + c.rotulo} campo={c.campo} dir={c.direita ? 'right' : undefined}>{c.rotulo}</Th>)}
                    <th style={{ textAlign: 'right' }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((i) => (
                    <tr key={i.codigo} style={{ cursor: 'pointer' }} onClick={() => setDetalhe(i.codigo)}>
                      <td><Produto i={i} /></td>
                      {colunas.map((c) => <td key={c.campo + c.rotulo} style={{ textAlign: c.direita ? 'right' : 'left', whiteSpace: c.campo === 'em_producao' ? 'normal' : 'nowrap', maxWidth: c.campo === 'em_producao' ? 130 : undefined }}>{c.valor(i)}</td>)}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {aba === 'disponibilidade' && <AcaoFila i={i} />}
                          {aba === 'sem_giro' && <AcaoLinha />}
                          <AcaoTirar i={i} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TabelaPainel>
            </div>

            {/* Celular: linhas compactas */}
            <div className="md:hidden panel-card" style={{ padding: 0 }}>
              {lista.map((i) => (
                <div key={i.codigo} onClick={() => setDetalhe(i.codigo)} style={{ padding: '10px 12px', borderBottom: '1px solid hsl(var(--border-hsl, 240 6% 90%))', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}><Produto i={i} /></div>
                    <div style={{ flexShrink: 0 }}><StatusBadge variante={VARIANTE[i.situacao]}>{ROTULO[i.situacao]}</StatusBadge></div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginTop: 6, fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                    {colunas.filter((c) => c.campo !== 'situacao').map((c) => (
                      <span key={c.campo + c.rotulo}>{c.rotulo}: <strong style={{ color: 'hsl(var(--text-primary-hsl))' }}>{c.texto(i)}</strong></span>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {aba === 'disponibilidade' && <AcaoFila i={i} />}
                    {aba === 'sem_giro' && <AcaoLinha />}
                    <AcaoTirar i={i} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Impressão da lista em uso */}
      <div className="print-report-container print-only">
        <div className="print-header-block">
          <div className="print-header-row">
            <div>
              <div className="print-company-title">Natum Cosméticos — Saúde do Estoque: {tituloAba}</div>
              <div className="print-meta-sub">
                {regras && <>Excesso: acima de {regras.fator_excesso}× o ideal · Sem giro: {regras.dias_sem_giro} dias sem venda · </>}
                Itens listados: <strong>{lista.length}</strong>
              </div>
            </div>
            <div className="print-date-block"><div>Emissão: <strong>{new Date().toLocaleString('pt-BR')}</strong></div></div>
          </div>
        </div>
        <table className="print-data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Produto</th>
              {colunas.map((c) => <th key={c.campo + c.rotulo} style={{ textAlign: c.direita ? 'right' : 'left' }}>{c.rotulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {lista.map((i) => (
              <tr key={i.codigo} className="print-tr">
                <td className="print-td font-mono font-bold">{i.codigo}</td>
                <td className="print-td">{i.descricao}{i.selo ? ` (${ROTULO_SELO[i.selo] ?? i.selo})` : ''}</td>
                {colunas.map((c) => <td key={c.campo + c.rotulo} className="print-td" style={{ textAlign: c.direita ? 'right' : 'left' }}>{c.texto(i)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ProductDetailsDrawer productCode={detalhe} isOpen={!!detalhe} onClose={() => setDetalhe(null)} />
    </div>
  );
}
