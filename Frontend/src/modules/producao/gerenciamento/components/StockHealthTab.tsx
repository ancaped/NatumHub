import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, Printer, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { BotaoAcao, FilterBar, ReportHeader, ReportTabs, StatusBadge } from '../../../geral/components/ui/ReportKit';
import type { VarianteBadge } from '../../../geral/components/ui/ReportKit';
import { agruparLinhas, prefixosDaLinha } from '../../../geral/lib/linhas';
import { ProductDetailsDrawer } from './ProductDetailsDrawer';

/**
 * Saúde do Estoque: quão longe o estoque está do objetivo (o estoque ideal) e onde há estoque parado.
 * Tudo vem calculado do servidor (`GET /api/producao/saude-estoque`, mesma base da Demanda de Produção);
 * a tela só agrupa por linha, lista, ordena e imprime. Não diz o que produzir: isso é a Demanda.
 */

type Tipo = 'produto' | 'kit' | 'coloracao' | 'apoio';
type Faixa = 'abaixo' | 'no_objetivo' | 'acima' | 'parado' | 'sem_objetivo';
type Aba = Tipo | 'retirados';

interface ItemSaude {
  codigo: string;
  descricao: string;
  linha_prefix: string;
  nome_linha: string;
  tipo: Tipo;
  selo: string | null;
  situacao_produto: string | null;
  estoque: number;
  em_producao: number;
  pedidos_aberto: number;
  estoque_demanda: number;
  ideal: number;
  media_mensal: number;
  cobertura_dias: number | null;
  dias_sem_venda: number | null;
  papel_kit: 'so_kit' | 'em_kit' | null;
  em_transito: number;
  base_movimento: 'venda' | 'consumo';
  pct_objetivo: number | null;
  distancia: number;
  faixa: Faixa;
  estoque_negativo: boolean;
}

interface Agregado {
  itens: number;
  objetivo_atingido_pct: number | null;
  abaixo: number;
  no_objetivo: number;
  acima: number;
  parado: number;
  sem_objetivo: number;
  faltam_un: number;
  a_mais_un: number;
  parado_un: number;
}

interface LinhaResumo {
  linha_prefix: string;
  nome_linha: string;
  linha_principal: string | null;
  proprio: Agregado;
  total: Agregado;
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
  por_tipo: Record<Tipo, { resumo: Agregado; linhas: LinhaResumo[] }>;
  itens: ItemSaude[];
}

const ABAS_TIPO: { id: Tipo; label: string }[] = [
  { id: 'produto', label: 'Produtos' },
  { id: 'kit', label: 'Kits' },
  { id: 'coloracao', label: 'Coloração' },
  { id: 'apoio', label: 'Apoio' },
];

const ROTULO_FAIXA: Record<Faixa, string> = { abaixo: 'Abaixo do objetivo', no_objetivo: 'No objetivo', acima: 'Acima de 2×', parado: 'Parado', sem_objetivo: 'Fora da conta' };
const VARIANTE_FAIXA: Record<Faixa, VarianteBadge> = { abaixo: 'critico', no_objetivo: 'saudavel', acima: 'abundante', parado: 'descontinuado', sem_objetivo: 'aguardando' };
const COR_FAIXA: Record<Faixa, string> = {
  abaixo: 'hsl(var(--danger-hsl))',
  no_objetivo: 'hsl(var(--success-hsl))',
  acima: 'hsl(var(--info-hsl))',
  parado: 'hsl(var(--text-secondary-hsl))',
  sem_objetivo: 'hsl(var(--text-secondary-hsl))',
};
const SEC = 'hsl(var(--text-secondary-hsl))';
const BORDA = '1px solid hsl(var(--card-border-hsl))';

const num = (n: number) => n.toLocaleString('pt-BR');
const pctTxt = (p: number | null) => (p == null ? '—' : `${Math.round(p).toLocaleString('pt-BR')}%`);
const distTxt = (d: number) => (d === 0 ? '0' : d > 0 ? `+${num(d)}` : `−${num(Math.abs(d))}`);
const nomeCurto = (n: string) => n.replace(/^[\s ]+/, '');

/** Cobertura por extenso: dias até 60, depois meses. */
function coberturaTxt(i: ItemSaude): string {
  if (i.cobertura_dias == null) return i.base_movimento === 'consumo' ? 'sem consumo' : 'sem venda';
  if (i.cobertura_dias <= 0) return 'sem estoque';
  if (i.cobertura_dias <= 60) return `${Math.round(i.cobertura_dias)} dias`;
  return `${(i.cobertura_dias / 30).toFixed(1).replace('.', ',')} meses`;
}

function paradoTxt(i: ItemSaude): string | null {
  if (i.faixa !== 'parado') return null;
  if (i.dias_sem_venda == null) return i.base_movimento === 'consumo' ? 'nunca saiu' : 'nunca vendeu';
  return `parado ${num(i.dias_sem_venda)} dias`;
}

/** Barra de progresso com a marca do objetivo (100%). `max` = fim da escala em % (200 nos itens, 100 nas linhas). */
function Barra({ pct, max, cor, titulo }: { pct: number | null; max: number; cor: string; titulo?: string }) {
  const valor = Math.min(Math.max(pct ?? 0, 0), max);
  const marca = (100 / max) * 100;
  return (
    <div title={titulo} style={{ position: 'relative', height: 8, borderRadius: 4, background: 'hsl(var(--background-hsl))', border: BORDA, width: '100%', minWidth: 60 }}>
      <div style={{ width: `${(valor / max) * 100}%`, height: '100%', background: cor, borderRadius: 4 }} />
      <div style={{ position: 'absolute', top: -2, bottom: -2, left: `calc(${Math.min(marca, 100)}% - 1px)`, width: 2, background: 'hsl(var(--text-primary-hsl))', opacity: 0.55, ...(marca >= 100 ? { left: 'auto', right: 0 } : {}) }} />
    </div>
  );
}

const corObjetivo = (p: number | null) => (p == null ? SEC : p >= 90 ? COR_FAIXA.no_objetivo : p >= 60 ? 'hsl(var(--warning-hsl))' : COR_FAIXA.abaixo);

interface Props {
  setView?: (view: string) => void;
}

export function StockHealthTab(_props: Props) {
  const [dados, setDados] = useState<RespostaSaude | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('produto');
  const [busca, setBusca] = useState('');
  const [linhaSel, setLinhaSel] = useState<string | null>(null);
  const [faixaSel, setFaixaSel] = useState<Faixa | null>(null);
  const [ordem, setOrdem] = useState<{ campo: string; dir: 'asc' | 'desc' }>({ campo: 'distancia', dir: 'asc' });
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

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

  const tipo: Tipo = aba === 'retirados' ? 'produto' : aba;
  const bloco = dados?.por_tipo?.[tipo];
  const linhas = bloco?.linhas ?? [];

  const trocarAba = (a: string) => {
    setAba(a as Aba);
    setLinhaSel(null);
    setFaixaSel(null);
  };

  const ordenarPor = (campo: string) =>
    setOrdem((o) => (o.campo === campo ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: campo === 'descricao' ? 'asc' : 'desc' }));

  // Cartões: o tipo todo, ou só a linha escolhida (com as sublinhas).
  const resumo: Agregado | undefined = linhaSel ? linhas.find((l) => l.linha_prefix === linhaSel)?.total : bloco?.resumo;

  const prefixos = useMemo(() => (linhaSel ? new Set(prefixosDaLinha(linhas, linhaSel)) : null), [linhaSel, linhas]);
  const mostrarItens = !!(linhaSel || busca.trim() || faixaSel);

  const itens = useMemo(() => {
    if (!dados || aba === 'retirados' || !mostrarItens) return [];
    const t = busca.trim().toLowerCase();
    const lista = dados.itens.filter(
      (i) => i.tipo === aba && (!prefixos || prefixos.has(i.linha_prefix)) && (!faixaSel || i.faixa === faixaSel) && (!t || i.codigo.toLowerCase().includes(t) || i.descricao.toLowerCase().includes(t)),
    );
    const f = ordem.dir === 'asc' ? 1 : -1;
    const valor = (i: ItemSaude): number | string => {
      switch (ordem.campo) {
        case 'descricao': return i.descricao.toLowerCase();
        case 'ideal': return i.ideal;
        case 'estoque': return Math.max(i.estoque_demanda, 0);
        case 'pct': return i.pct_objetivo ?? Number.POSITIVE_INFINITY;
        case 'cobertura': return i.cobertura_dias ?? Number.POSITIVE_INFINITY;
        default: return i.distancia;
      }
    };
    return [...lista].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      const r = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : (va as number) - (vb as number);
      return (r || a.codigo.localeCompare(b.codigo)) * (r ? f : 1);
    });
  }, [dados, aba, mostrarItens, prefixos, faixaSel, busca, ordem]);

  const negativos = useMemo(() => itens.filter((i) => i.estoque_negativo).length, [itens]);

  const alterarRetirado = async (codigo: string, retirar: boolean) => {
    setOcupado(codigo);
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
      setOcupado(null);
    }
  };

  /** Imprime a visão em uso (linhas ou itens) em A4 em pé, numa janela própria. */
  const imprimir = () => {
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rotuloTipo = ABAS_TIPO.find((a) => a.id === tipo)?.label ?? '';
    const rotuloLinha = linhaSel ? nomeCurto(linhas.find((l) => l.linha_prefix === linhaSel)?.nome_linha ?? linhaSel) : '';
    let cab: string[];
    let corpo: string[][];
    if (mostrarItens) {
      cab = ['Código', 'Produto', 'Objetivo', 'Estoque', '% do objetivo', 'Distância', 'Cobertura'];
      corpo = itens.map((i) => [i.codigo, i.descricao + (paradoTxt(i) ? ` (${paradoTxt(i)})` : ''), num(i.ideal), num(Math.max(i.estoque_demanda, 0)), pctTxt(i.pct_objetivo), distTxt(i.distancia), coberturaTxt(i)]);
    } else {
      cab = ['Linha', 'Objetivo atingido', 'Abaixo', 'No objetivo', 'Acima de 2×', 'Parado', 'Unid. a mais'];
      corpo = agruparLinhas(linhas).map(({ linha: l, nivel }) => [(nivel === 1 ? '   ' : '') + nomeCurto(l.nome_linha), pctTxt(l.total.objetivo_atingido_pct), num(l.total.abaixo), num(l.total.no_objetivo), num(l.total.acima), num(l.total.parado), num(l.total.a_mais_un)]);
    }
    const th = cab.map((c, k) => `<th class="${k > 1 || (!mostrarItens && k > 0) ? 'd' : ''}">${esc(c)}</th>`).join('');
    const tr = corpo.map((r) => `<tr>${r.map((c, k) => `<td class="${k > 1 || (!mostrarItens && k > 0) ? 'd' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Saúde do Estoque — ${esc(rotuloTipo)}</title>
<style>
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #18181b; font-size: 9pt; margin: 0; }
h1 { font-size: 12pt; margin: 0 0 2px; }
.sub { font-size: 8pt; color: #52525b; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 7.5pt; text-transform: uppercase; color: #52525b; border-bottom: 1.5px solid #18181b; padding: 3px 4px; }
td { padding: 3px 4px; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
.d { text-align: right; white-space: nowrap; }
</style></head><body>
<h1>Natum Cosméticos — Saúde do Estoque: ${esc(rotuloTipo)}${rotuloLinha ? ` · ${esc(rotuloLinha)}` : ''}</h1>
<div class="sub">Objetivo = estoque ideal; estoque = o futuro (com produção ou compra a caminho e pedidos em aberto) · Emissão: ${esc(new Date().toLocaleString('pt-BR'))}</div>
<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { setErro('O navegador bloqueou a janela de impressão. Libere pop-ups para o Nexus.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const abas = [
    ...ABAS_TIPO.map((a) => ({ id: a.id, label: a.label, contagem: dados?.por_tipo?.[a.id]?.resumo.itens ?? 0 })),
    { id: 'retirados', label: 'Retirados', contagem: dados?.retirados.length ?? 0 },
  ];

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
              <div key={r.codigo} style={{ padding: '10px 12px', borderBottom: BORDA, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem' }}>{r.descricao ?? r.codigo}</div>
                  <div style={{ fontSize: '0.68rem', color: SEC }}>
                    <span className="font-mono">{r.codigo}</span> · tirado por {r.retirado_por || '—'} em {r.retirado_em.slice(0, 10).split('-').reverse().join('/')}{r.motivo ? ` · ${r.motivo}` : ''}
                  </div>
                </div>
                <button type="button" className="tab-btn" disabled={ocupado === r.codigo} onClick={() => alterarRetirado(r.codigo, false)} style={{ padding: '4px 12px', fontSize: '0.72rem', minHeight: 44 }}>
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const Th = ({ campo, children, direita }: { campo: string; children: React.ReactNode; direita?: boolean }) => (
    <th style={{ textAlign: direita ? 'right' : 'left', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => ordenarPor(campo)}>
      {children}
      {ordem.campo === campo && (ordem.dir === 'asc' ? <ArrowUp size={11} style={{ marginLeft: 3, display: 'inline' }} /> : <ArrowDown size={11} style={{ marginLeft: 3, display: 'inline' }} />)}
    </th>
  );

  const Cartao = ({ faixa, titulo, valor, detalhe: det }: { faixa: Faixa | null; titulo: string; valor: string; detalhe?: string }) => {
    const ativo = faixa != null && faixaSel === faixa;
    return (
      <button
        type="button"
        className="panel-card"
        onClick={() => faixa && setFaixaSel(ativo ? null : faixa)}
        style={{ flex: '1 1 140px', minHeight: 44, padding: '8px 12px', textAlign: 'left', cursor: faixa ? 'pointer' : 'default', outline: ativo ? '2px solid hsl(var(--primary-hsl))' : 'none' }}
      >
        <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', color: SEC }}>{titulo}</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.25 }}>{valor}</div>
        {det && <div style={{ fontSize: '0.7rem', color: SEC }}>{det}</div>}
      </button>
    );
  };

  // Colunas da tabela por linha que vêm vazias não aparecem.
  const temParado = linhas.some((l) => l.total.parado > 0);
  const temAcima = linhas.some((l) => l.total.acima > 0);

  const unidades = (n: number, singular: string) => `${num(n)} ${singular}`;
  const linhaNome = linhaSel ? nomeCurto(linhas.find((l) => l.linha_prefix === linhaSel)?.nome_linha ?? linhaSel) : '';

  return (
    <div>
      <div className="no-print">
        <ReportHeader
          titulo="Saúde do Estoque"
          subtitulo="Quão longe o estoque está do objetivo e onde há estoque parado"
          acoes={
            <>
              <BotaoAcao onClick={carregar} disabled={carregando} title="Atualizar">
                <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} /> Atualizar
              </BotaoAcao>
              <BotaoAcao primario onClick={imprimir} disabled={!bloco || (mostrarItens ? itens.length === 0 : linhas.length === 0)}>
                <Printer size={13} /> Imprimir
              </BotaoAcao>
            </>
          }
        />

        <ReportTabs abas={abas} ativa={aba} onChange={trocarAba} />

        {/* Cartões do estado do estoque (exceção do Edson à regra "sem cards de KPI": só nesta tela; ver ai-memory) */}
        {resumo && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <Cartao faixa={null} titulo="Objetivo atingido" valor={pctTxt(resumo.objetivo_atingido_pct)} detalhe={`${num(resumo.itens)} itens${linhaSel ? ` · ${linhaNome}` : ''}`} />
            <Cartao faixa="abaixo" titulo="Abaixo do objetivo" valor={num(resumo.abaixo)} detalhe={resumo.abaixo ? `faltam ${unidades(resumo.faltam_un, 'un')}` : undefined} />
            <Cartao faixa="no_objetivo" titulo="No objetivo" valor={num(resumo.no_objetivo)} detalhe="de 100% a 200%" />
            <Cartao faixa="acima" titulo="Acima de 2×" valor={num(resumo.acima)} detalhe={resumo.acima ? `${unidades(resumo.a_mais_un, 'un')} a mais` : undefined} />
            <Cartao faixa="parado" titulo="Parado 180 dias" valor={num(resumo.parado)} detalhe={resumo.parado ? `${unidades(resumo.parado_un, 'un')} paradas` : undefined} />
          </div>
        )}

        <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar por código ou descrição...">
          {(linhaSel || faixaSel) && (
            <button type="button" className="tab-btn" onClick={() => { setLinhaSel(null); setFaixaSel(null); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: '0.75rem', minHeight: 36 }}>
              <ChevronLeft size={13} /> {linhaSel ? `Todas as linhas · ${linhaNome}` : ROTULO_FAIXA[faixaSel as Faixa]}
            </button>
          )}
        </FilterBar>

        {erro && <div className="panel-card" style={{ padding: 12, fontSize: '0.8rem', marginBottom: 8 }}>{erro}</div>}
        {!erro && carregando && !dados && <div className="panel-card" style={{ padding: 16, fontSize: '0.8rem' }}>Carregando…</div>}
        {!erro && dados && !mostrarItens && linhas.length === 0 && <div className="panel-card" style={{ padding: 16, fontSize: '0.8rem' }}>Nenhum item nesta aba.</div>}

        {/* Visão principal: por linha, sublinhas recuadas */}
        {!mostrarItens && linhas.length > 0 && (
          <>
            <div className="hidden md:block panel-card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="data-table compacta">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th style={{ minWidth: 190 }}>Objetivo atingido</th>
                    <th style={{ textAlign: 'right' }}>Abaixo</th>
                    <th style={{ textAlign: 'right' }}>No objetivo</th>
                    {temAcima && <th style={{ textAlign: 'right' }}>Acima de 2×</th>}
                    {temParado && <th style={{ textAlign: 'right' }}>Parado</th>}
                    {temAcima && <th style={{ textAlign: 'right' }}>Un. a mais</th>}
                  </tr>
                </thead>
                <tbody>
                  {agruparLinhas(linhas).map(({ linha: l, nivel }) => (
                    <tr key={l.linha_prefix} style={{ cursor: 'pointer' }} onClick={() => setLinhaSel(l.linha_prefix)}>
                      <td style={{ paddingLeft: nivel === 1 ? 28 : undefined, fontWeight: nivel === 0 ? 700 : 500, fontSize: '0.8rem' }}>{nomeCurto(l.nome_linha)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}><Barra pct={l.total.objetivo_atingido_pct} max={100} cor={corObjetivo(l.total.objetivo_atingido_pct)} /></div>
                          <strong style={{ fontSize: '0.8rem', minWidth: 38, textAlign: 'right' }}>{pctTxt(l.total.objetivo_atingido_pct)}</strong>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', color: l.total.abaixo ? COR_FAIXA.abaixo : SEC, fontWeight: l.total.abaixo ? 700 : 400 }} title={l.total.abaixo ? `faltam ${num(l.total.faltam_un)} un` : undefined}>{num(l.total.abaixo)}</td>
                      <td style={{ textAlign: 'right' }}>{num(l.total.no_objetivo)}</td>
                      {temAcima && <td style={{ textAlign: 'right' }}>{num(l.total.acima)}</td>}
                      {temParado && <td style={{ textAlign: 'right' }} title={l.total.parado ? `${num(l.total.parado_un)} un paradas` : undefined}>{num(l.total.parado)}</td>}
                      {temAcima && <td style={{ textAlign: 'right' }}>{l.total.a_mais_un ? num(l.total.a_mais_un) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden panel-card" style={{ padding: 0 }}>
              {agruparLinhas(linhas).map(({ linha: l, nivel }) => (
                <div key={l.linha_prefix} onClick={() => setLinhaSel(l.linha_prefix)} style={{ padding: '10px 12px', paddingLeft: nivel === 1 ? 28 : 12, borderBottom: BORDA, cursor: 'pointer', minHeight: 44 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: nivel === 0 ? 700 : 500, minWidth: 0 }}>{nomeCurto(l.nome_linha)}</span>
                    <strong>{pctTxt(l.total.objetivo_atingido_pct)}</strong>
                  </div>
                  <div style={{ margin: '5px 0' }}><Barra pct={l.total.objetivo_atingido_pct} max={100} cor={corObjetivo(l.total.objetivo_atingido_pct)} /></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: '0.7rem', color: SEC }}>
                    <span style={l.total.abaixo ? { color: COR_FAIXA.abaixo, fontWeight: 700 } : undefined}>{num(l.total.abaixo)} abaixo</span>
                    <span>{num(l.total.no_objetivo)} no objetivo</span>
                    {l.total.acima > 0 && <span>{num(l.total.acima)} acima de 2×</span>}
                    {l.total.parado > 0 && <span>{num(l.total.parado)} parados</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Itens da linha (ou da busca / do cartão escolhido) */}
        {mostrarItens && !erro && itens.length === 0 && dados && <div className="panel-card" style={{ padding: 16, fontSize: '0.8rem' }}>Nenhum item nesta lista.</div>}
        {mostrarItens && itens.length > 0 && (
          <>
            <div className="hidden md:block panel-card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="data-table compacta">
                <thead>
                  <tr>
                    <Th campo="descricao">Produto</Th>
                    <Th campo="ideal" direita>Objetivo</Th>
                    <Th campo="estoque" direita>Estoque</Th>
                    <Th campo="pct">% do objetivo</Th>
                    <Th campo="distancia" direita>Distância</Th>
                    <Th campo="cobertura" direita>Cobertura</Th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.codigo} style={{ cursor: 'pointer' }} onClick={() => setDetalhe(i.codigo)}>
                      <td><Produto i={i} /></td>
                      <td style={{ textAlign: 'right' }}>{num(i.ideal)}</td>
                      <td style={{ textAlign: 'right' }} title={dicaEstoque(i)}>{num(Math.max(i.estoque_demanda, 0))}{i.estoque_negativo ? '*' : ''}</td>
                      <td style={{ minWidth: 150 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}><Barra pct={i.pct_objetivo} max={200} cor={COR_FAIXA[i.faixa]} titulo="A marca é o objetivo (100%); a barra vai até 200%" /></div>
                          <span style={{ fontSize: '0.75rem', minWidth: 40, textAlign: 'right' }}>{pctTxt(i.pct_objetivo)}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: i.distancia < 0 ? COR_FAIXA.abaixo : i.faixa === 'acima' ? COR_FAIXA.acima : undefined }}>{distTxt(i.distancia)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{coberturaTxt(i)}</td>
                      <td style={{ textAlign: 'right' }}><AcaoTirar i={i} ocupado={ocupado} onTirar={() => alterarRetirado(i.codigo, true)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden panel-card" style={{ padding: 0 }}>
              {itens.map((i) => (
                <div key={i.codigo} onClick={() => setDetalhe(i.codigo)} style={{ padding: '10px 12px', borderBottom: BORDA, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}><Produto i={i} /></div>
                    <strong style={{ flexShrink: 0, fontSize: '0.85rem', color: i.distancia < 0 ? COR_FAIXA.abaixo : i.faixa === 'acima' ? COR_FAIXA.acima : undefined }}>{distTxt(i.distancia)}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 4px' }}>
                    <div style={{ flex: 1 }}><Barra pct={i.pct_objetivo} max={200} cor={COR_FAIXA[i.faixa]} /></div>
                    <span style={{ fontSize: '0.72rem', minWidth: 38, textAlign: 'right' }}>{pctTxt(i.pct_objetivo)}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: '0.7rem', color: SEC }}>
                    <span>objetivo {num(i.ideal)}</span>
                    <span title={dicaEstoque(i)}>estoque {num(Math.max(i.estoque_demanda, 0))}{i.estoque_negativo ? '*' : ''}</span>
                    <span>{coberturaTxt(i)}</span>
                    <span style={{ marginLeft: 'auto' }}><AcaoTirar i={i} ocupado={ocupado} onTirar={() => alterarRetirado(i.codigo, true)} /></span>
                  </div>
                </div>
              ))}
            </div>
            {negativos > 0 && <div style={{ fontSize: '0.7rem', color: SEC, marginTop: 6 }}>* Estoque negativo no ERP ({negativos} {negativos === 1 ? 'item' : 'itens'}): aparece como 0.</div>}
          </>
        )}

        <div style={{ fontSize: '0.7rem', color: SEC, marginTop: 12, lineHeight: 1.5 }}>
          <strong>Como ler.</strong> Objetivo = estoque ideal. Estoque = o futuro (com a produção ou a compra a caminho, menos os pedidos em aberto); o atual aparece ao passar o mouse.
          {' '}<strong>Objetivo atingido</strong> = média de min(estoque ÷ ideal, 100%) dos itens com ideal, sem os parados: o excesso de um item não esconde a falta de outro.
          {' '}No objetivo = de 100% a {dados?.regras.fator_excesso ?? 2}× o ideal. Parado = {dados?.regras.dias_sem_giro ?? 180} dias sem {tipo === 'apoio' ? 'consumo' : 'venda'} e com estoque (entra só na contagem de parados). Unidades a mais = estoque − ideal nos itens acima de 2×.
        </div>
      </div>

      <ProductDetailsDrawer
        productCode={detalhe}
        isOpen={!!detalhe}
        onSelectProduct={(code) => setDetalhe(code)}
        onClose={() => setDetalhe(null)}
      />
    </div>
  );
}

function dicaEstoque(i: ItemSaude): string {
  const partes = [`Atual: ${num(i.estoque)}`];
  const caminho = i.tipo === 'coloracao' || i.tipo === 'apoio' ? i.em_transito : i.em_producao;
  if (caminho > 0) partes.push(`${i.tipo === 'coloracao' || i.tipo === 'apoio' ? 'em trânsito' : 'em produção'}: +${num(caminho)}`);
  if (i.pedidos_aberto > 0) partes.push(`pedidos em aberto: −${num(i.pedidos_aberto)}`);
  return partes.join(' · ');
}

function Produto({ i }: { i: ItemSaude }) {
  const parado = paradoTxt(i);
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: '0.78rem' }}>{i.descricao}</div>
      <div style={{ fontSize: '0.68rem', color: SEC, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="font-mono">{i.codigo}</span>
        {i.papel_kit && <span style={{ fontWeight: 700 }}>{i.papel_kit === 'so_kit' ? 'Só kit' : 'Também em kit'}</span>}
        {i.selo && <span style={{ fontWeight: 700 }}>Lançamento</span>}
        {i.situacao_produto === 'saindo_de_linha' && <span style={{ fontWeight: 700 }}>Saindo de linha</span>}
        {parado && <StatusBadge variante={VARIANTE_FAIXA.parado}>{parado}</StatusBadge>}
      </div>
    </>
  );
}

function AcaoTirar({ i, ocupado, onTirar }: { i: ItemSaude; ocupado: string | null; onTirar: () => void }) {
  return (
    <button
      type="button"
      className="tab-btn"
      disabled={ocupado === i.codigo}
      title="Tirar do relatório (volta pela aba Retirados)"
      onClick={(e) => { e.stopPropagation(); onTirar(); }}
      style={{ padding: '4px 10px', fontSize: '0.72rem', minHeight: 44 }}
    >
      Tirar
    </button>
  );
}
