import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Copy, Link2, Printer } from 'lucide-react';
import Drawer, { DrawerTab } from '../../../geral/components/ui/Drawer';
import { apiJson } from '../../../geral/lib/http';

import { fmt, fmtData, textoInsumo } from './cobertura';
import type { Aviso, Cobertura, ResumoInsumo, ResultadoOrdem, StatusCobertura } from './cobertura';

interface DesvioItem {
  lote: string;
  insumo: string;
  descricao: string;
  previsto: number;
  baixado: number;
  razao?: number | null;
}

interface Validacao {
  lotesAnalisados: number;
  itensComparados: number;
  dentroDe10pct: number;
  desvioMediano?: number | null;
  desvioP90?: number | null;
  baixadoSemPrevisao: number;
  previstoSemBaixa: number;
  lotesSemFormula: string[];
  piores: DesvioItem[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  semana: string;
  /** Texto legível de uma ordem do planejamento (produto, data, kg). */
  descreverOrdem: (id: string) => string;
  /** Abre o modal "Vincular lote ERP" já com o número sugerido. */
  onVincular: (ordemId: string, lote: string) => void;
  /** Abre o relatório imprimível de matérias-primas e embalagens da semana. */
  onImprimirRelatorio?: () => void;
}

const TITULO_AVISO: Record<string, string> = {
  lote_erp_sem_vinculo: 'Lote do ERP sem vínculo — vincular',
  lote_nao_encontrado: 'Lote digitado não encontrado no ERP — verificar',
  pedido_possivelmente_recebido: 'Pedido possivelmente já recebido — verificar',
  recebimento_parcial: 'Recebimento parcial por NF — verificar',
  pedido_atrasado: 'Pedido atrasado / previsão vencida — verificar',
  pedido_sem_previsao: 'Pedido sem previsão — ajustar no ERP',
  base_tambem_planejada: 'Base também planejada em outra ordem — verificar',
  manual_antigo: 'Ordem manual aberta há muito tempo — verificar',
};
const ORDEM_AVISOS = Object.keys(TITULO_AVISO);

const COR_STATUS: Record<StatusCobertura, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  atencao: 'bg-amber-50 text-amber-800 border-amber-200',
  falta: 'bg-rose-50 text-rose-700 border-rose-200',
  sem_formula: 'bg-zinc-100 text-zinc-600 border-zinc-200',
};
const ROTULO_STATUS: Record<StatusCobertura, string> = {
  ok: 'OK',
  atencao: 'Atenção',
  falta: 'Falta',
  sem_formula: 'Sem fórmula',
};

const fmtPct = (n?: number | null) => (n == null ? '—' : `${(Number(n) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

function textoSemConsumo(m?: string): string | null {
  if (!m) return null;
  if (m === 'lote_aberto_ou_fechado_no_erp') return 'Já reservada ou baixada no ERP: não conta de novo.';
  if (m.startsWith('provavel_lote_')) return `Provável lote #${m.replace('provavel_lote_', '')} do ERP: contada uma vez só, pela reserva.`;
  if (m === 'sem_formula') return 'Produto sem fórmula cadastrada.';
  return null;
}

/**
 * Cobertura de insumos da semana (somente leitura; só avisa, nunca bloqueia).
 * Regras e raciocínio no backend: Backend/src/modules/producao/cobertura/calc.rs.
 */
export default function CoberturaInsumosDrawer({ isOpen, onClose, semana, descreverOrdem, onVincular, onImprimirRelatorio }: Props) {
  const [dados, setDados] = useState<Cobertura | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<string>('decisoes');
  const [validacao, setValidacao] = useState<Validacao | null>(null);
  const [validando, setValidando] = useState(false);
  const [erroValidacao, setErroValidacao] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const d = await apiJson<Cobertura>(`/api/producao/cobertura?week=${encodeURIComponent(semana)}`);
      setDados(d ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a cobertura de insumos.');
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => {
    if (isOpen) carregar();
  }, [isOpen, carregar]);

  const rodarValidacao = useCallback(async () => {
    setValidando(true);
    setErroValidacao(null);
    try {
      const v = await apiJson<Validacao>('/api/producao/cobertura/validacao?limite=30');
      setValidacao(v ?? null);
    } catch (e) {
      setErroValidacao(e instanceof Error ? e.message : 'Não foi possível rodar a validação.');
    } finally {
      setValidando(false);
    }
  }, []);

  const ordens = dados?.ordens ?? [];
  const insumos = dados?.insumos ?? [];
  const avisos = dados?.avisos ?? [];

  const contagem = useMemo(() => {
    const c = { ok: 0, atencao: 0, falta: 0, sem_formula: 0 } as Record<StatusCobertura, number>;
    for (const o of ordens) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [ordens]);

  const precisamAtencao = useMemo(
    () => ordens.filter((o) => o.status !== 'ok' || (o.avisos ?? []).length > 0),
    [ordens]
  );
  const avisosGerais = useMemo(() => avisos.filter((a) => !a.ordemId), [avisos]);

  const insumosCriticos = useMemo(
    () =>
      [...insumos]
        .sort((a, b) => a.livre - a.consumoPrevisto - (b.livre - b.consumoPrevisto))
        .slice(0, 40),
    [insumos]
  );

  const avisosGeraisPorTipo = useMemo(() => {
    const m: Record<string, Aviso[]> = {};
    for (const a of avisosGerais) (m[a.tipo] ??= []).push(a);
    return m;
  }, [avisosGerais]);

  const abas: DrawerTab[] = [
    { id: 'decisoes', label: 'Decisões', badge: precisamAtencao.length + avisosGerais.length || undefined },
    { id: 'insumos', label: 'Insumos' },
    { id: 'validacao', label: 'Calibração' },
  ];

  if (!isOpen) return null;

  const copiarValidacao = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(validacao, null, 2));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      title="Insumos da semana"
      subtitle={`Semana ${semana.split('-W')[1] ?? semana} · só avisa, não bloqueia`}
      tabs={abas}
      activeTab={aba}
      onTabChange={setAba}
      size="2xl"
      loading={loading && !dados}
      loadingText="Calculando a cobertura..."
      headerActions={
        <div className="flex items-center gap-1.5">
        {onImprimirRelatorio && (
          <button
            type="button"
            onClick={onImprimirRelatorio}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            title="Relatório de matérias-primas e embalagens da semana, para imprimir"
          >
            <Printer className="h-3.5 w-3.5" />
            Relatório
          </button>
        )}
        <button
          type="button"
          onClick={carregar}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          Atualizar
        </button>
        </div>
      }
    >
      <div className="space-y-5 p-4">
        {erro && <p className="text-xs font-semibold text-rose-700">{erro}</p>}

        {aba === 'decisoes' && dados && (
          <>
            <div className="flex flex-wrap gap-2">
              {(['ok', 'atencao', 'falta'] as StatusCobertura[]).map((st) => (
                <span key={st} className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${COR_STATUS[st]}`}>
                  {contagem[st] ?? 0} {ROTULO_STATUS[st]}
                </span>
              ))}
              {(contagem.sem_formula ?? 0) > 0 && (
                <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${COR_STATUS.sem_formula}`}>
                  {contagem.sem_formula} {ROTULO_STATUS.sem_formula}
                </span>
              )}
            </div>

            {precisamAtencao.length === 0 && avisosGerais.length === 0 && (
              <p className="text-xs text-zinc-600">Nada para decidir. Todas as ordens da semana estão cobertas.</p>
            )}

            {precisamAtencao.length > 0 && (
              <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl bg-white">
                {precisamAtencao.map((o) => (
                  <li key={o.id} className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-bold text-zinc-900">{descreverOrdem(o.id)}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded border ${COR_STATUS[o.status]}`}>
                        {ROTULO_STATUS[o.status]}
                      </span>
                    </div>
                    {textoSemConsumo(o.motivoSemConsumo) && (
                      <p className="text-[11px] text-zinc-500">{textoSemConsumo(o.motivoSemConsumo)}</p>
                    )}
                    {(o.insumos ?? [])
                      .filter((i) => i.status !== 'ok')
                      .map((i) => (
                        <p key={i.codigo} className="text-[11px] text-zinc-700">
                          • {textoInsumo(i)}
                        </p>
                      ))}
                    {(o.avisos ?? []).map((a, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-amber-800">⚠ {a.mensagem}</p>
                        {a.tipo === 'lote_erp_sem_vinculo' && a.lote && (
                          <button
                            type="button"
                            onClick={() => onVincular(o.id, a.lote as string)}
                            className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            Vincular #{a.lote}
                          </button>
                        )}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}

            {ORDEM_AVISOS.filter((t) => (avisosGeraisPorTipo[t] ?? []).length > 0).map((tipo) => (
              <section key={tipo} className="space-y-1.5">
                <h3 className="text-xs font-bold text-zinc-900">
                  {TITULO_AVISO[tipo]} ({avisosGeraisPorTipo[tipo].length})
                </h3>
                <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl bg-white">
                  {avisosGeraisPorTipo[tipo].map((a, idx) => (
                    <li key={`${tipo}-${idx}`} className="px-3 py-2 text-[11px] text-zinc-700">
                      {a.mensagem}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        {aba === 'insumos' && dados && (
          <>
            <section className="space-y-2">
              <h3 className="text-xs font-bold text-zinc-900">Insumos mais apertados</h3>
              <p className="text-[11px] text-zinc-500">
                Livre = estoque − reserva do ERP. Consumo previsto = ordens ainda não abertas no ERP. Saldo não conta chegadas.
              </p>
              <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
                <table className="w-full text-[11px]">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="text-left px-2 py-1.5">Insumo</th>
                      <th className="text-right px-2 py-1.5">Estoque</th>
                      <th className="text-right px-2 py-1.5">Reserva</th>
                      <th className="text-right px-2 py-1.5">Livre</th>
                      <th className="text-right px-2 py-1.5">Consumo previsto</th>
                      <th className="text-right px-2 py-1.5">Saldo</th>
                      <th className="text-right px-2 py-1.5">Chegadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {insumosCriticos.map((i) => {
                      const saldo = i.livre - i.consumoPrevisto;
                      return (
                        <tr key={i.codigo}>
                          <td className="px-2 py-1.5 text-zinc-800">
                            {i.descricao || i.codigo}
                            <span className="text-zinc-400"> · {i.codigo}</span>
                            {i.calibrado && <span className="ml-1 text-[10px] text-sky-700">(estoque calibrado)</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right">{fmt(i.estoque)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(i.reserva)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(i.livre)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(i.consumoPrevisto)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold ${saldo < 0 ? 'text-rose-700' : 'text-zinc-800'}`}>{fmt(saldo)}</td>
                          <td className="px-2 py-1.5 text-right">
                            {(i.chegadas ?? []).length === 0
                              ? '—'
                              : (i.chegadas ?? [])
                                  .map((c) => `${fmt(c.quantidade)} em ${fmtData(c.data)}${c.atrasado ? ' (atrasado)' : ''}`)
                                  .join('; ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {aba === 'validacao' && (
          <section className="space-y-3">
            <p className="text-[11px] text-zinc-600">
              Compara o que a fórmula prevê (com a base explodida em matérias-primas) com o que o ERP realmente baixou nos
              últimos lotes fechados. Serve para confiar nos números antes de usar a cobertura no planejamento.
            </p>
            <button
              type="button"
              onClick={rodarValidacao}
              disabled={validando}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={validando ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              {validando ? 'Validando...' : 'Rodar validação (últimos 30 lotes)'}
            </button>
            {erroValidacao && <p className="text-xs font-semibold text-rose-700">{erroValidacao}</p>}

            {validacao && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-lg font-bold">{validacao.lotesAnalisados}</div>lotes analisados
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-lg font-bold">{validacao.itensComparados}</div>itens comparados
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-lg font-bold">
                      {validacao.itensComparados > 0 ? fmtPct(validacao.dentroDe10pct / validacao.itensComparados) : '—'}
                    </div>
                    dentro de ±10%
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-lg font-bold">
                      {fmtPct(validacao.desvioMediano)} / {fmtPct(validacao.desvioP90)}
                    </div>
                    desvio mediano / p90
                  </div>
                </div>
                <p className="text-[11px] text-zinc-600">
                  Baixado sem previsão na fórmula: {validacao.baixadoSemPrevisao} · Previsto sem baixa: {validacao.previstoSemBaixa}
                  {(validacao.lotesSemFormula ?? []).length > 0 && ` · Lotes sem fórmula: ${(validacao.lotesSemFormula ?? []).join(', ')}`}
                </p>
                <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white">
                  <table className="w-full text-[11px]">
                    <thead className="bg-zinc-50 text-zinc-500">
                      <tr>
                        <th className="text-left px-2 py-1.5">Lote</th>
                        <th className="text-left px-2 py-1.5">Insumo</th>
                        <th className="text-right px-2 py-1.5">Previsto</th>
                        <th className="text-right px-2 py-1.5">Baixado</th>
                        <th className="text-right px-2 py-1.5">Razão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(validacao.piores ?? []).map((p, idx) => (
                        <tr key={`${p.lote}-${p.insumo}-${idx}`}>
                          <td className="px-2 py-1.5">#{p.lote}</td>
                          <td className="px-2 py-1.5">
                            {p.descricao || p.insumo}
                            <span className="text-zinc-400"> · {p.insumo}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right">{fmt(p.previsto)}</td>
                          <td className="px-2 py-1.5 text-right">{fmt(p.baixado)}</td>
                          <td className="px-2 py-1.5 text-right font-bold">{p.razao == null ? '—' : p.razao.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={copiarValidacao}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiado ? 'Copiado' : 'Copiar resultado (JSON)'}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </Drawer>
  );
}
