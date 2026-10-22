import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, EyeOff, ChevronLeft, ChevronRight, Filter, Layers, Printer, RefreshCw, ShoppingBag } from 'lucide-react';
import Drawer from '../../geral/components/ui/Drawer';
import { SemControleConfirmar, TabelaSemControle } from '../../producao/gerenciamento/components/semControle';
import { apiJson } from '../../geral/lib/http';
import {
  AbaRelatorio,
  BotaoAcao,
  FilterBar,
  FiltroSelect,
  ReportHeader,
  ReportTabs,
  StatusBadge,
  TabelaPainel,
  VarianteBadge,
} from '../../geral/components/ui/ReportKit';

type StatusInsumo = 'ok' | 'depende_atrasado' | 'chega_depois' | 'chega_sem_data' | 'falta';

interface Equivalente {
  codigo: string;
  descricao: string;
  livre: number;
  cobreTudo: boolean;
}

interface FaltaInsumo {
  codigo: string;
  descricao: string;
  unidade?: string | null;
  necessario: number;
  livreNaData: number;
  falta: number;
  status: StatusInsumo;
  chegaEm?: string;
  pedido?: number;
  fornecedor?: string;
  equivalentes?: Equivalente[];
}

interface FaltasProduto {
  produto: string;
  descricao: string;
  kg: number;
  data?: string;
  semFormula: boolean;
  embalagem: FaltaInsumo[];
  materiaPrima: FaltaInsumo[];
}

interface FaltasLinha {
  linha: string;
  produtos: FaltasProduto[];
}

interface Relatorio {
  semana: string;
  geradoEm: string;
  ordens: FaltasLinha[];
  fila: FaltasLinha[];
  filaSemKg: string[];
}

type Tipo = 'embalagem' | 'materia';

interface Linha {
  chave: string;
  linha: string;
  produto: string;
  descricao: string;
  kg: number;
  data?: string;
  tipo: Tipo;
  insumo: FaltaInsumo;
  semFormula?: boolean;
}

const fmt = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtData = (d?: string | null) => (d ? d.slice(0, 10).split('-').slice(1).reverse().join('/') : '');

function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const ano = t.getUTCFullYear();
  const sem = Math.ceil(((t.getTime() - Date.UTC(ano, 0, 1)) / 86400000 + 1) / 7);
  return `${ano}-W${String(sem).padStart(2, '0')}`;
}

function segundaDa(semana: string): Date {
  const [ano, sem] = semana.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const dia = jan4.getUTCDay() || 7;
  const seg = new Date(jan4);
  seg.setUTCDate(jan4.getUTCDate() - dia + 1 + (sem - 1) * 7);
  return new Date(seg.getUTCFullYear(), seg.getUTCMonth(), seg.getUTCDate());
}

function deslocar(semana: string, semanas: number): string {
  const seg = segundaDa(semana);
  seg.setDate(seg.getDate() + semanas * 7);
  return isoWeekKey(seg);
}

function achatar(linhas: FaltasLinha[]): Linha[] {
  const out: Linha[] = [];
  for (const l of linhas) {
    for (const p of l.produtos) {
      const chave = `${l.linha}|${p.produto}|${p.data ?? ''}`;
      const base = { chave, linha: l.linha, produto: p.produto, descricao: p.descricao, kg: p.kg, data: p.data };
      if (p.semFormula) {
        out.push({ ...base, tipo: 'materia', semFormula: true, insumo: { codigo: '', descricao: 'Produto sem fórmula cadastrada', necessario: 0, livreNaData: 0, falta: 0, status: 'falta' } });
      }
      for (const i of p.embalagem) out.push({ ...base, tipo: 'embalagem', insumo: i });
      for (const i of p.materiaPrima) out.push({ ...base, tipo: 'materia', insumo: i });
    }
  }
  return out;
}

function situacao(i: FaltaInsumo): { variante: VarianteBadge; rotulo: string; detalhe?: string } {
  const ped = i.pedido ? `Pedido ${i.pedido}${i.fornecedor ? ` · ${i.fornecedor}` : ''}` : undefined;
  switch (i.status) {
    case 'chega_depois':
      return { variante: 'ordem', rotulo: `Chega ${fmtData(i.chegaEm)}`, detalhe: ped };
    case 'chega_sem_data':
      return { variante: 'aguardando', rotulo: 'Sem previsão', detalhe: ped };
    case 'depende_atrasado':
      return { variante: 'ordem', rotulo: 'Pedido atrasado', detalhe: ped };
    default:
      return { variante: 'critico', rotulo: 'Sem cobertura' };
  }
}

/** Confirmação de uma troca de insumo: prévia do impacto + OK (2 passos; não altera o ERP nem a fórmula). */
function TrocaConfirmar({
  linha,
  para,
  onClose,
  onDone,
}: {
  linha: Linha;
  para: Equivalente;
  onClose: () => void;
  onDone: () => void;
}) {
  const [impacto, setImpacto] = useState<{ composicoesAfetadas: number; ordensPlanejadasAfetadas: number } | null>(null);
  const [soEste, setSoEste] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const de = linha.insumo;

  useEffect(() => {
    apiJson<{ composicoesAfetadas: number; ordensPlanejadasAfetadas: number }>('/api/producao/trocas', {
      method: 'POST',
      body: JSON.stringify({ insumoDe: de.codigo, insumoPara: para.codigo, produto: null }),
    })
      .then(setImpacto)
      .catch(() => undefined);
  }, [de.codigo, para.codigo]);

  const confirmar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await apiJson('/api/producao/trocas', {
        method: 'POST',
        body: JSON.stringify({ insumoDe: de.codigo, insumoPara: para.codigo, produto: soEste ? linha.produto : null, confirmar: true }),
      });
      onDone();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar a troca.');
      setSalvando(false);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      title="Trocar insumo"
      subtitle={`${de.descricao} → ${para.descricao || para.codigo}`}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: 12 }}>
          <BotaoAcao onClick={onClose}>Cancelar</BotaoAcao>
          <BotaoAcao primario onClick={confirmar} disabled={salvando}>
            OK, trocar
          </BotaoAcao>
        </div>
      }
    >
      <div style={{ padding: 16 }}>
        {!para.cobreTudo && (
          <p style={{ fontSize: '0.72rem', color: 'hsl(var(--warning-hsl))', marginBottom: 8 }}>
            O substituto tem só {fmt(para.livre)} livre: ainda vai faltar.
          </p>
        )}
        {impacto && (
          <p style={{ fontSize: '0.72rem', color: 'hsl(var(--text-secondary-hsl))', marginBottom: 8 }}>
            {impacto.composicoesAfetadas} composição(ões) e {impacto.ordensPlanejadasAfetadas} ordem(ns) planejada(s) usam este insumo.
          </p>
        )}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', marginBottom: 4 }}>
          <input type="radio" checked={!soEste} onChange={() => setSoEste(false)} /> Todos os produtos
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', marginBottom: 10 }}>
          <input type="radio" checked={soEste} onChange={() => setSoEste(true)} /> Só {linha.produto}
        </label>
        <p style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>
          Não altera o ERP nem a fórmula; muda a previsão de consumo (cobertura e Compras).
        </p>
        {erro && <p style={{ fontSize: '0.72rem', color: 'hsl(var(--danger-hsl))', marginTop: 8 }}>{erro}</p>}
      </div>
    </Drawer>
  );
}

/**
 * Faltas de insumos por linha, no padrão da Saúde do Estoque (KPIs, abas, filtros, tabela com badges).
 * Usa a mesma cobertura do Planejamento (Backend: cobertura/faltas.rs).
 */
export default function FaltasInsumosLinhaTab() {
  const [semana, setSemana] = useState<string>(() => isoWeekKey(new Date()));
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<'ordens' | 'fila' | 'sem_controle'>('ordens');
  const [semControle, setSemControle] = useState<{ codigo: string; descricao: string } | null>(null);
  const [versaoSc, setVersaoSc] = useState(0);
  const [busca, setBusca] = useState('');
  const [linhaSel, setLinhaSel] = useState('todas');
  const [tipo, setTipo] = useState<'todos' | Tipo>('todos');
  const [sit, setSit] = useState<'todas' | 'falta' | 'chega'>('todas');
  const [troca, setTroca] = useState<{ linha: Linha; para: Equivalente } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setDados(await apiJson<Relatorio>(`/api/producao/cobertura/faltas-por-linha?week=${encodeURIComponent(semana)}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.');
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const todas = useMemo(() => achatar(aba === 'fila' ? dados?.fila ?? [] : dados?.ordens ?? []), [dados, aba]);
  const nOrdens = useMemo(() => new Set(achatar(dados?.ordens ?? []).map((l) => l.chave)).size, [dados]);
  const nFila = useMemo(() => new Set(achatar(dados?.fila ?? []).map((l) => l.chave)).size, [dados]);

  const linhasDisponiveis = useMemo(() => Array.from(new Set(todas.map((l) => l.linha))).sort(), [todas]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todas.filter((l) => {
      if (linhaSel !== 'todas' && l.linha !== linhaSel) return false;
      if (tipo !== 'todos' && l.tipo !== tipo) return false;
      if (sit === 'falta' && l.insumo.status !== 'falta') return false;
      if (sit === 'chega' && l.insumo.status === 'falta') return false;
      if (q && !`${l.produto} ${l.descricao} ${l.insumo.descricao} ${l.insumo.codigo} ${l.linha}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [todas, busca, linhaSel, tipo, sit]);

  const seg = segundaDa(semana);
  const sex = new Date(seg);
  sex.setDate(seg.getDate() + 4);
  const periodo = `${seg.toLocaleDateString('pt-BR')} a ${sex.toLocaleDateString('pt-BR')}`;

  const abas: AbaRelatorio[] = [
    { id: 'ordens', label: 'Ordens da semana', icone: <Layers size={14} />, contagem: nOrdens },
    { id: 'fila', label: 'Fila de demandas', icone: <ShoppingBag size={14} />, contagem: nFila },
    { id: 'sem_controle', label: 'Sem controle de estoque', icone: <EyeOff size={14} /> },
  ];

  const limpar = () => {
    setTipo('todos');
    setSit('todas');
    setLinhaSel('todas');
    setBusca('');
  };

  return (
    <div className="view-container faltas-print" style={{ padding: '1.5rem', paddingBottom: 30 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .faltas-print, .faltas-print * { visibility: visible; }
          .faltas-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 12mm !important; }
          .faltas-no-print { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
          tr { break-inside: avoid; }
        }
      `}</style>

      <ReportHeader
        titulo="Faltas de Insumos por Linha"
        subtitulo={
          <>
            Semana {semana.split('-W')[1]} ({periodo}){dados ? ` · emitido em ${new Date(dados.geradoEm).toLocaleString('pt-BR')}` : ''}
          </>
        }
        acoes={
          <div className="faltas-no-print" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <BotaoAcao onClick={() => setSemana((s) => deslocar(s, -1))} title="Semana anterior">
              <ChevronLeft size={15} />
            </BotaoAcao>
            <BotaoAcao onClick={() => setSemana((s) => deslocar(s, 1))} title="Próxima semana">
              <ChevronRight size={15} />
            </BotaoAcao>
            <BotaoAcao primario onClick={() => window.print()}>
              <Printer size={15} /> Imprimir
            </BotaoAcao>
            <BotaoAcao onClick={carregar} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Atualizar
            </BotaoAcao>
          </div>
        }
      />

      {erro && <p style={{ fontSize: '0.78rem', color: 'hsl(var(--danger-hsl))', marginBottom: 8 }}>{erro}</p>}

      <div className="faltas-no-print">
        <ReportTabs abas={abas} ativa={aba} onChange={(id) => setAba(id as 'ordens' | 'fila' | 'sem_controle')} />
        {aba !== 'sem_controle' && (
        <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar produto, insumo ou linha...">
          <FiltroSelect
            icone={<Filter size={13} style={{ color: 'hsl(var(--text-secondary-hsl))' }} />}
            value={linhaSel}
            onChange={setLinhaSel}
            opcoes={[{ valor: 'todas', rotulo: 'Todas as linhas' }, ...linhasDisponiveis.map((l) => ({ valor: l, rotulo: l }))]}
          />
          <FiltroSelect
            value={tipo}
            onChange={(v) => setTipo(v as 'todos' | Tipo)}
            opcoes={[
              { valor: 'todos', rotulo: 'Embalagem e matéria-prima' },
              { valor: 'embalagem', rotulo: 'Só embalagem' },
              { valor: 'materia', rotulo: 'Só matéria-prima' },
            ]}
          />
          <FiltroSelect
            value={sit}
            onChange={(v) => setSit(v as 'todas' | 'falta' | 'chega')}
            opcoes={[
              { valor: 'todas', rotulo: 'Todas as situações' },
              { valor: 'falta', rotulo: 'Sem cobertura' },
              { valor: 'chega', rotulo: 'Chega depois' },
            ]}
          />
        </FilterBar>
        )}
      </div>

      {aba === 'sem_controle' && <TabelaSemControle versao={versaoSc} onMudou={carregar} />}

      {aba !== 'sem_controle' && (
      <TabelaPainel>
        <thead>
          <tr>
            <th style={{ width: '26%' }}>Produto / Linha</th>
            <th>Tipo</th>
            <th>Insumo</th>
            <th className="numeric-col">Necessário</th>
            <th className="numeric-col">Livre</th>
            <th className="numeric-col">Falta</th>
            <th>Situação</th>
            <th className="faltas-no-print" style={{ textAlign: 'center' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {loading && !dados && (
            <tr>
              <td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>Calculando as faltas...</td>
            </tr>
          )}
          {dados && visiveis.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'hsl(var(--text-secondary-hsl))' }}>
                Nenhuma falta de insumo com estes filtros.
              </td>
            </tr>
          )}
          {visiveis.map((l, idx) => {
            const primeira = idx === 0 || visiveis[idx - 1].chave !== l.chave;
            const s = situacao(l.insumo);
            const un = l.insumo.unidade ? ` ${l.insumo.unidade}` : '';
            const eq = l.insumo.equivalentes?.[0];
            return (
              <tr key={`${l.chave}-${l.insumo.codigo}-${idx}`} style={primeira && idx > 0 ? { borderTop: '2px solid hsl(var(--card-border-hsl))' } : undefined}>
                <td>
                  {primeira && (
                    <>
                      <span className="product-code">{l.produto}</span>
                      <div className="product-desc" style={{ fontWeight: 600 }}>{l.descricao || 'sem descrição'}</div>
                      <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-secondary-hsl))' }}>
                        {l.linha} · {fmt(l.kg)} kg{l.data ? ` · ${fmtData(l.data)}` : ''}
                      </div>
                    </>
                  )}
                </td>
                <td>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'hsl(var(--text-secondary-hsl))' }}>{l.tipo === 'embalagem' ? 'Embalagem' : 'Matéria-prima'}</span>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{l.insumo.descricao}</div>
                  {l.insumo.codigo && <span className="product-code" style={{ fontSize: '0.65rem' }}>{l.insumo.codigo}</span>}
                </td>
                <td className="numeric-col">{l.semFormula ? '' : `${fmt(l.insumo.necessario)}${un}`}</td>
                <td className="numeric-col" style={{ color: 'hsl(var(--text-secondary-hsl))' }}>{l.semFormula ? '' : fmt(l.insumo.livreNaData)}</td>
                <td className="numeric-col" style={{ fontWeight: 700, color: l.insumo.falta > 0 ? 'hsl(var(--danger-hsl))' : undefined }}>
                  {l.insumo.falta > 0 ? `${fmt(l.insumo.falta)}${un}` : '-'}
                </td>
                <td>
                  {l.semFormula ? <StatusBadge variante="descontinuado">Sem fórmula</StatusBadge> : <StatusBadge variante={s.variante}>{s.rotulo}</StatusBadge>}
                  {s.detalhe && <div style={{ fontSize: '0.62rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 2 }}>{s.detalhe}</div>}
                </td>
                <td className="faltas-no-print" style={{ textAlign: 'center' }}>
                  {!l.semFormula && l.insumo.codigo && (
                    <button
                      type="button"
                      className="tab-btn"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '0.7rem', marginRight: 4 }}
                      title="O ERP não controla o estoque deste insumo: parar de acusar falta"
                      onClick={() => setSemControle({ codigo: l.insumo.codigo, descricao: l.insumo.descricao })}
                    >
                      <EyeOff size={12} /> Sem controle
                    </button>
                  )}
                  {eq && !l.semFormula && (
                    <button
                      type="button"
                      className="tab-btn"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '0.7rem' }}
                      title={`Trocar por ${eq.descricao || eq.codigo} (livre ${fmt(eq.livre)})`}
                      onClick={() => setTroca({ linha: l, para: eq })}
                    >
                      <ArrowLeftRight size={12} /> {eq.descricao || eq.codigo}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TabelaPainel>
      )}

      {dados && dados.filaSemKg.length > 0 && aba === 'fila' && (
        <p style={{ fontSize: '0.7rem', color: 'hsl(var(--text-secondary-hsl))', marginTop: 8 }}>
          Itens da fila sem massa em kg, não avaliados: {dados.filaSemKg.join('; ')}
        </p>
      )}

      {semControle && (
        <SemControleConfirmar
          codigo={semControle.codigo}
          descricao={semControle.descricao}
          marcar
          onClose={() => setSemControle(null)}
          onDone={() => {
            setSemControle(null);
            setVersaoSc((v) => v + 1);
            carregar();
          }}
        />
      )}

      {troca && (
        <TrocaConfirmar
          linha={troca.linha}
          para={troca.para}
          onClose={() => setTroca(null)}
          onDone={() => {
            setTroca(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}
