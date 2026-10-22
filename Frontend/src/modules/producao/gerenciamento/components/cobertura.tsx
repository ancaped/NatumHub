import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson } from '../../../geral/lib/http';

export type StatusCobertura = 'ok' | 'atencao' | 'falta' | 'sem_formula';
export type StatusInsumo = 'ok' | 'depende_atrasado' | 'chega_depois' | 'chega_sem_data' | 'falta';

export interface Aviso {
  tipo: string;
  mensagem: string;
  ordemId?: string;
  lote?: string;
  candidatos?: string[];
  insumo?: string;
  pedido?: number;
  fornecedor?: string;
  dias?: number;
}

export interface Equivalente {
  codigo: string;
  descricao: string;
  unidade?: string | null;
  livre: number;
  cobreTudo: boolean;
}

export interface TrocaInfo {
  id: number;
  insumoDe: string;
  descricaoDe: string;
  insumoPara: string;
  descricaoPara: string;
  produto?: string | null;
  descricaoProduto?: string | null;
  composicoesAfetadas: number;
  formulaCorrigida: boolean;
  criadoPor?: string | null;
  criadoEm: string;
}

export interface InsumoOrdem {
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

export type BaseFonte = 'explodir' | 'estoque' | 'ordem_base';

export const BASE_FONTE_ROTULO: Record<BaseFonte, string> = {
  explodir: 'Explodir em insumos',
  estoque: 'Base pronta (estoque)',
  ordem_base: 'Ordem da base',
};

export interface BaseRef {
  codigo: string;
  descricao: string;
}

export interface ResultadoOrdem {
  id: string;
  produto?: string;
  status: StatusCobertura;
  consome: boolean;
  baseFonte?: BaseFonte;
  bases?: BaseRef[];
  motivoSemConsumo?: string;
  avisos: Aviso[];
  insumos: InsumoOrdem[];
}

export interface ChegadaInfo {
  pedido: number;
  fornecedor: string;
  data?: string | null;
  quantidade: number;
  quantidadePedido: number;
  atrasado: boolean;
}

export interface ResumoInsumo {
  codigo: string;
  descricao: string;
  unidade?: string | null;
  estoque: number;
  reserva: number;
  livre: number;
  calibrado: boolean;
  consumoPrevisto: number;
  chegadas: ChegadaInfo[];
}

export interface Cobertura {
  semana: string;
  hoje: string;
  geradoEm: string;
  ordens: ResultadoOrdem[];
  insumos: ResumoInsumo[];
  avisos: Aviso[];
}

export const fmt = (n?: number | null) =>
  n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export const fmtData = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

/** Frase curta de uma linha de insumo: o que falta e quando chega. */
export function textoInsumo(i: InsumoOrdem): string {
  const un = i.unidade ? ` ${i.unidade}` : '';
  const nome = i.descricao || i.codigo;
  switch (i.status) {
    case 'falta':
      return `${nome}: faltam ${fmt(i.falta)}${un}, sem chegada prevista`;
    case 'chega_depois':
      return `${nome}: faltam ${fmt(i.falta)}${un}; chega em ${fmtData(i.chegaEm)}${i.pedido ? ` (pedido ${i.pedido})` : ''}`;
    case 'chega_sem_data':
      return `${nome}: faltam ${fmt(i.falta)}${un}; pedido sem previsão${i.pedido ? ` (${i.pedido})` : ''}`;
    case 'depende_atrasado':
      return `${nome}: só cobre contando pedido atrasado${i.pedido ? ` (${i.pedido})` : ''}`;
    default:
      return nome;
  }
}

const PESO: Record<StatusCobertura, number> = { ok: 0, sem_formula: 1, atencao: 2, falta: 3 };

/** Pior resultado entre as ordens de uma batelada (que pode ter até 4 produtos). */
export function piorResultado(rs: Array<ResultadoOrdem | undefined>): ResultadoOrdem | undefined {
  let pior: ResultadoOrdem | undefined;
  for (const r of rs) {
    if (!r) continue;
    if (!pior || PESO[r.status] > PESO[pior.status]) pior = r;
  }
  return pior;
}

const ESTILO: Record<StatusCobertura, { cls: string; rotulo: string }> = {
  ok: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', rotulo: 'Insumos OK' },
  atencao: { cls: 'bg-amber-50 text-amber-800 border-amber-200', rotulo: 'Atenção' },
  falta: { cls: 'bg-rose-50 text-rose-700 border-rose-200', rotulo: 'Falta insumo' },
  sem_formula: { cls: 'bg-zinc-100 text-zinc-600 border-zinc-200', rotulo: 'Sem fórmula' },
};

/** Selo pequeno de cobertura de insumos; o tooltip lista até 4 problemas. */
export function SeloCobertura({ resultado, onClick, compacto }: { resultado?: ResultadoOrdem; onClick?: () => void; compacto?: boolean }) {
  if (!resultado || !resultado.consome) return null;
  const { cls, rotulo } = ESTILO[resultado.status];
  const linhas = [
    ...(resultado.insumos ?? []).filter((i) => i.status !== 'ok').map(textoInsumo),
    ...(resultado.avisos ?? []).map((a) => a.mensagem),
  ].slice(0, 4);
  const titulo = linhas.length > 0 ? linhas.join('\n') : 'Insumos cobrem esta produção no dia planejado';
  if (compacto) {
    // só um ponto colorido (cabe no cartão do quadro); o texto fica no tooltip e o clique abre os detalhes
    const cor = resultado.status === 'falta' ? 'hsl(var(--danger-hsl))' : resultado.status === 'atencao' ? 'hsl(var(--warning-hsl))' : resultado.status === 'ok' ? 'hsl(var(--success-hsl))' : 'hsl(var(--text-secondary-hsl))';
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        title={`${rotulo}${linhas.length > 0 ? '\n' + linhas.join('\n') : ''}`}
        style={{ width: 10, height: 10, borderRadius: '50%', background: cor, border: 'none', padding: 0, flexShrink: 0, cursor: 'pointer' }}
        aria-label={rotulo}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={linhas.length > 0 ? linhas.join('\n') : 'Insumos cobrem esta produção no dia planejado'}
      className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded border cursor-pointer ${cls}`}
    >
      {rotulo}
    </button>
  );
}

/**
 * Cobertura das ordens da semana. Recarrega (com pequena espera) quando `versao` muda,
 * ou seja, depois de salvar/mover/aprovar ordens.
 */
export function useCoberturaSemana(semana: string, ativo: boolean, versao: string) {
  const [porOrdem, setPorOrdem] = useState<Record<string, ResultadoOrdem>>({});
  const seq = useRef(0);

  const carregar = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const d = await apiJson<Cobertura>(`/api/producao/cobertura?week=${encodeURIComponent(semana)}`);
      if (mine !== seq.current) return;
      const m: Record<string, ResultadoOrdem> = {};
      for (const o of d?.ordens ?? []) m[o.id] = o;
      setPorOrdem(m);
    } catch {
      if (mine === seq.current) setPorOrdem({});
    }
  }, [semana]);

  useEffect(() => {
    if (!ativo) return;
    const t = setTimeout(carregar, 800);
    return () => clearTimeout(t);
  }, [ativo, carregar, versao]);

  return { porOrdem, recarregar: carregar };
}

export interface CandidatoFila {
  codigo: string;
  kg: number;
}

export const chaveCandidato = (c: CandidatoFila) => `${c.codigo}|${c.kg}`;

/** Cobertura de cada candidato do Banco de Demandas (cada um avaliado sozinho, sem somar com os outros). */
export function useCoberturaFila(semana: string, ativo: boolean, candidatos: CandidatoFila[]) {
  const [porCandidato, setPorCandidato] = useState<Record<string, ResultadoOrdem>>({});
  const chave = candidatos.map(chaveCandidato).join(',');

  useEffect(() => {
    if (!ativo || candidatos.length === 0) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiJson<{ candidatos: Array<{ codigo: string; kg: number; resultado: ResultadoOrdem }> }>(
          '/api/producao/cobertura/simular',
          { method: 'POST', body: JSON.stringify({ week: semana, candidatos: candidatos.slice(0, 60) }) }
        );
        if (cancelado) return;
        const m: Record<string, ResultadoOrdem> = {};
        for (const c of r?.candidatos ?? []) m[chaveCandidato(c)] = c.resultado;
        setPorCandidato(m);
      } catch {
        if (!cancelado) setPorCandidato({});
      }
    }, 600);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, semana, chave]);

  return porCandidato;
}
