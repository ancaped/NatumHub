import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer, RefreshCw } from 'lucide-react';
import { apiJson } from '../../geral/lib/http';

type StatusInsumo = 'ok' | 'depende_atrasado' | 'chega_depois' | 'chega_sem_data' | 'falta';

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
  hoje: string;
  geradoEm: string;
  ordens: FaltasLinha[];
  fila: FaltasLinha[];
  filaSemKg: string[];
}

const fmt = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const fmtData = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');

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

function textoChegada(i: FaltaInsumo): string {
  switch (i.status) {
    case 'chega_depois':
      return `chega em ${fmtData(i.chegaEm)}${i.pedido ? ` · pedido ${i.pedido}` : ''}${i.fornecedor ? ` (${i.fornecedor})` : ''}`;
    case 'chega_sem_data':
      return `pedido ${i.pedido ?? ''} sem previsão${i.fornecedor ? ` (${i.fornecedor})` : ''}`;
    case 'depende_atrasado':
      return `só cobre com pedido atrasado${i.pedido ? ` ${i.pedido}` : ''}`;
    default:
      return 'sem pedido que cubra';
  }
}

function LinhaInsumo({ i }: { i: FaltaInsumo }) {
  const un = i.unidade ? ` ${i.unidade}` : '';
  const critico = i.status === 'falta';
  return (
    <li className="flex items-start justify-between gap-3 py-1">
      <span className="text-[12px] text-zinc-800">
        {i.descricao || i.codigo} <span className="text-zinc-400">· {i.codigo}</span>
      </span>
      <span className="text-right text-[11px] shrink-0">
        {i.falta > 0 && (
          <span className="font-bold text-zinc-900">
            falta {fmt(i.falta)}
            {un}{' '}
          </span>
        )}
        <span className={critico ? 'font-semibold text-rose-700' : 'font-semibold text-amber-700'}>{textoChegada(i)}</span>
      </span>
    </li>
  );
}

function Secao({ titulo, linhas, vazio }: { titulo: string; linhas: FaltasLinha[]; vazio: string }) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <h2 className="text-sm font-extrabold text-zinc-900">{titulo}</h2>
      {linhas.length === 0 && <p className="text-xs text-zinc-500">{vazio}</p>}
      {linhas.map((l) => (
        <div key={l.linha} className="bg-white border border-zinc-200 rounded-xl shadow-2xs">
          <div className="px-4 py-2 border-b border-zinc-100 text-xs font-bold text-zinc-900">{l.linha}</div>
          <ul className="divide-y divide-zinc-100">
            {l.produtos.map((p, idx) => (
              <li key={`${p.produto}-${p.data ?? ''}-${idx}`} className="px-4 py-3 space-y-2 break-inside-avoid">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[12px] font-bold text-zinc-900">
                    {p.produto} — {p.descricao || 'sem descrição'}
                  </span>
                  <span className="text-[11px] text-zinc-500 shrink-0">
                    {fmt(p.kg)} kg{p.data ? ` · ${fmtData(p.data)}` : ''}
                  </span>
                </div>
                {p.semFormula && <p className="text-[11px] text-zinc-500">Produto sem fórmula cadastrada: não dá para avaliar os insumos.</p>}
                {p.embalagem.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Embalagem</div>
                    <ul>{p.embalagem.map((i) => <LinhaInsumo key={i.codigo} i={i} />)}</ul>
                  </div>
                )}
                {p.materiaPrima.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Matéria-prima</div>
                    <ul>{p.materiaPrima.map((i) => <LinhaInsumo key={i.codigo} i={i} />)}</ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * Faltas de insumos por linha. Usa a mesma cobertura do Planejamento (Backend: cobertura/faltas.rs);
 * as ordens da semana e a fila de demandas aparecem separadas.
 */
export default function FaltasInsumosLinhaTab() {
  const [semana, setSemana] = useState<string>(() => isoWeekKey(new Date()));
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await apiJson<Relatorio>(`/api/producao/cobertura/faltas-por-linha?week=${encodeURIComponent(semana)}`);
      setDados(r ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.');
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const seg = segundaDa(semana);
  const sex = new Date(seg);
  sex.setDate(seg.getDate() + 4);
  const periodo = `${seg.toLocaleDateString('pt-BR')} a ${sex.toLocaleDateString('pt-BR')}`;

  return (
    <div className="p-6 space-y-5 faltas-print">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .faltas-print, .faltas-print * { visibility: visible; }
          .faltas-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 12mm; }
          .faltas-no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-extrabold text-zinc-900">Faltas de Insumos por Linha</h1>
          <p className="text-[11px] text-zinc-500">
            Semana {semana.split('-W')[1]} ({periodo}){dados ? ` · emitido em ${new Date(dados.geradoEm).toLocaleString('pt-BR')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 faltas-no-print">
          <button
            type="button"
            onClick={() => setSemana((s) => deslocar(s, -1))}
            className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            title="Semana anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setSemana((s) => deslocar(s, 1))}
            className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            title="Próxima semana"
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={carregar}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </button>
        </div>
      </div>

      {erro && <p className="text-xs font-semibold text-rose-700">{erro}</p>}
      {loading && !dados && <p className="text-xs text-zinc-500">Calculando as faltas...</p>}

      {dados && (
        <>
          <Secao titulo="Ordens planejadas da semana" linhas={dados.ordens} vazio="Nenhuma ordem da semana com falta de insumo." />
          <Secao titulo="Fila de demandas (cada item avaliado sozinho)" linhas={dados.fila} vazio="Nenhum item da fila com falta de insumo." />
          {dados.filaSemKg.length > 0 && (
            <p className="text-[11px] text-zinc-500">
              Itens da fila sem massa em kg, não avaliados: {dados.filaSemKg.join('; ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
