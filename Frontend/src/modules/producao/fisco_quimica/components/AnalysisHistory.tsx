import React, { useState, useMemo, useEffect } from 'react';
import {
  FiscoQuimicaAnalysis,
  FiscoQuimicaPattern,
  FiscoQuimicaAgent,
  Product,
  FiscoTemplateConfig,
} from '../../../geral/lib/types';
import { api } from '../../../geral/lib/api';
import { Printer, Pencil, FileText, Calendar, Trash2, Send, Image as ImageIcon } from 'lucide-react';
import { cn } from '../../../geral/lib/utils';
import {
  printFiscoReports,
  printFiscoSummaryReport,
  printCorrectiveOrder,
  formatViscosity,
  calculateFillingTargets,
  situacaoDoLaudo,
  checkAnalysisCompliance,
  type SituacaoLaudo,
} from '../lib/fiscoUtils';
import Drawer from '../../../geral/components/ui/Drawer';
import Modal from '../../../geral/components/ui/Modal';
import {
  BotaoAcao,
  FilterBar,
  FiltroSelect,
  ReportTabs,
  StatusBadge,
  type VarianteBadge,
} from '../../../geral/components/ui/ReportKit';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const POR_PAGINA = 50;

const normalizeCode = (code?: string | null) => (code ? String(code).replace(/\./g, '').trim().toLowerCase() : '');

/** Mês do laudo como AAAA-MM ('' quando a data não é entendida). */
function mesDoLaudo(dateStr: string): string {
  const clean = (dateStr || '').trim().split(' ')[0].split('T')[0];
  const p = clean.split(/[-/]/);
  if (p.length !== 3) return '';
  if (p[0].length === 4) return `${p[0]}-${p[1].padStart(2, '0')}`;
  if (p[2].length === 4) return `${p[2]}-${p[1].padStart(2, '0')}`;
  return '';
}

function dataBr(dateStr: string): string {
  const clean = (dateStr || '').trim().split(' ')[0].split('T')[0];
  return clean.includes('-') ? clean.split('-').reverse().join('/') : clean;
}

function lancadoNoErp(a: FiscoQuimicaAnalysis): boolean {
  return a.syncedToErp === true;
}

const SELO: Record<SituacaoLaudo, { variante: VarianteBadge; rotulo: string }> = {
  conforme: { variante: 'saudavel', rotulo: 'Conforme' },
  ajustado: { variante: 'abundante', rotulo: 'Conforme (ajustado)' },
  em_correcao: { variante: 'ordem', rotulo: 'Em correção' },
  fora: { variante: 'critico', rotulo: 'Não conforme' },
  sem_padrao: { variante: 'aguardando', rotulo: 'Sem padrão' },
};

type Filtro = 'todos' | SituacaoLaudo | 'pendente_erp';

interface AnalysisHistoryProps {
  analyses: FiscoQuimicaAnalysis[];
  patterns: FiscoQuimicaPattern[];
  products: Product[];
  agents: FiscoQuimicaAgent[];
  config?: FiscoTemplateConfig;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onDeleteAnalysis: (id: string, batch: string) => void;
  onRefresh: () => void;
  onEditAnalysis?: (analysis: FiscoQuimicaAnalysis) => void;
  /** Laudos de antes dessa data (AAAA-MM-DD) ainda não foram carregados. */
  desdeCarregado?: string;
  onCarregarMaisAntigos?: () => Promise<void>;
  /** Busca no servidor (lote, código ou nome) e junta o resultado à lista. */
  onBuscarServidor?: (busca: string) => Promise<number>;
}

export function AnalysisHistory({
  analyses,
  patterns,
  products,
  agents,
  config,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onDeleteAnalysis,
  onRefresh,
  onEditAnalysis,
  desdeCarregado,
  onCarregarMaisAntigos,
  onBuscarServidor,
}: AnalysisHistoryProps) {
  const [mes, setMes] = useState('ALL');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [pagina, setPagina] = useState(1);
  const [carregandoAntigos, setCarregandoAntigos] = useState(false);
  const [buscandoServidor, setBuscandoServidor] = useState(false);
  const [aberto, setAberto] = useState<FiscoQuimicaAnalysis | null>(null);
  const [zoomMidia, setZoomMidia] = useState<FiscoQuimicaAnalysis | null>(null);
  // Lançamento no ERP: pede confirmação antes de gravar (ids vazio = todos os pendentes).
  const [confirmaErp, setConfirmaErp] = useState<{ ids: string[]; qtd: number } | null>(null);
  const [lancando, setLancando] = useState(false);
  const [erroErp, setErroErp] = useState<string | null>(null);

  const patternMap = useMemo(() => {
    const map = new Map<string, FiscoQuimicaPattern>();
    for (const p of patterns) map.set(normalizeCode(p.productCode), p);
    return map;
  }, [patterns]);

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a] as const)), [agents]);

  // Situação de cada laudo calculada uma vez (uma regra só: situacaoDoLaudo).
  const linhas = useMemo(
    () =>
      analyses.map((a) => {
        const pat = patternMap.get(normalizeCode(a.productCode)) || null;
        return { a, pat, sit: situacaoDoLaudo(a, pat) };
      }),
    [analyses, patternMap],
  );

  const meses = useMemo(() => {
    const cont = new Map<string, number>();
    for (const { a } of linhas) {
      const k = mesDoLaudo(a.analysisDate);
      if (k) cont.set(k, (cont.get(k) || 0) + 1);
    }
    return Array.from(cont.entries())
      .sort((x, y) => y[0].localeCompare(x[0]))
      .map(([k, n]) => ({ valor: k, rotulo: `${MESES[Number(k.slice(5)) - 1] || k.slice(5)} / ${k.slice(0, 4)} (${n})` }));
  }, [linhas]);

  // A lista só tem os laudos recentes: a busca também procura no servidor.
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 3 || !onBuscarServidor) return;
    const t = setTimeout(() => {
      setBuscandoServidor(true);
      onBuscarServidor(q).catch(() => {}).finally(() => setBuscandoServidor(false));
    }, 500);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => setPagina(1), [mes, busca, filtro]);

  const doMes = useMemo(() => (mes === 'ALL' ? linhas : linhas.filter(({ a }) => mesDoLaudo(a.analysisDate) === mes)), [linhas, mes]);

  const contagem = useMemo(() => {
    const c = { todos: doMes.length, conforme: 0, ajustado: 0, em_correcao: 0, fora: 0, sem_padrao: 0, pendente_erp: 0 };
    for (const { a, sit } of doMes) {
      c[sit] += 1;
      if (!lancadoNoErp(a)) c.pendente_erp += 1;
    }
    return c;
  }, [doMes]);

  const filtradas = useMemo(() => {
    let lista = doMes;
    const q = busca.toLowerCase().trim();
    if (q) {
      const qNorm = q.replace(/\./g, '');
      lista = lista.filter(({ a }) =>
        (a.productCode || '').toLowerCase().replace(/\./g, '').includes(qNorm) ||
        (a.productName || '').toLowerCase().includes(q) ||
        (a.batch || '').toLowerCase().includes(q) ||
        (a.technician || '').toLowerCase().includes(q) ||
        (a.fabricatedBy || '').toLowerCase().includes(q) ||
        (a.authorizedBy || '').toLowerCase().includes(q) ||
        (a.notes || '').toLowerCase().includes(q),
      );
    }
    if (filtro === 'pendente_erp') lista = lista.filter(({ a }) => !lancadoNoErp(a));
    else if (filtro !== 'todos') lista = lista.filter(({ sit }) => sit === filtro);
    return lista;
  }, [doMes, busca, filtro]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const visiveis = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const todosMarcados = visiveis.length > 0 && visiveis.every(({ a }) => selectedIds.has(a.id));

  const carregarAntigos = async () => {
    if (!onCarregarMaisAntigos) return;
    setCarregandoAntigos(true);
    try {
      await onCarregarMaisAntigos();
    } catch (err) {
      alert(`Não foi possível carregar os laudos anteriores: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCarregandoAntigos(false);
    }
  };

  const lancarNoErp = async () => {
    if (!confirmaErp) return;
    setLancando(true);
    setErroErp(null);
    try {
      const res = await api.pushFiscoLaudosToErp(confirmaErp.ids.length ? confirmaErp.ids : undefined, confirmaErp.ids.length ? undefined : true);
      if (!res.success) throw new Error('O ERP não aceitou o lançamento.');
      if (res.errors?.length) throw new Error(`${res.updated_count} lançado(s). Com erro: ${res.errors.join('; ')}`);
      setConfirmaErp(null);
      setAberto(null);
      onRefresh();
    } catch (err) {
      setErroErp(err instanceof Error ? err.message : String(err));
    } finally {
      setLancando(false);
    }
  };

  const pedirLancamento = (ids: string[]) => {
    setErroErp(null);
    setConfirmaErp({ ids, qtd: ids.length || contagem.pendente_erp });
  };

  const imprimirSelecionados = () => {
    const lista = analyses.filter((a) => selectedIds.has(a.id));
    if (lista.length) printFiscoReports(lista, patterns, products, agents, config);
  };

  const imprimirResumo = () => {
    const lista = selectedIds.size > 0 ? analyses.filter((a) => selectedIds.has(a.id)) : filtradas.map(({ a }) => a);
    if (lista.length) printFiscoSummaryReport(lista, patterns, config);
  };

  const abas = [
    { id: 'todos', label: 'Todos', contagem: contagem.todos },
    { id: 'conforme', label: 'Conformes', contagem: contagem.conforme },
    { id: 'em_correcao', label: 'Em correção', contagem: contagem.em_correcao },
    { id: 'ajustado', label: 'Ajustados', contagem: contagem.ajustado },
    { id: 'fora', label: 'Não conformes', contagem: contagem.fora },
    { id: 'pendente_erp', label: 'Sem lançar no ERP', contagem: contagem.pendente_erp },
  ];

  const medida = (ok: boolean, texto: string) => (
    <span className={cn('font-mono font-bold', !ok && 'rounded bg-red-100 px-1.5 py-0.5 text-red-800')}>{texto}</span>
  );

  const selo = (sit: SituacaoLaudo) => <StatusBadge variante={SELO[sit].variante}>{SELO[sit].rotulo}</StatusBadge>;

  const envaseDe = (a: FiscoQuimicaAnalysis, pat: FiscoQuimicaPattern | null): string => {
    if (a.envaseTargetWeight > 0) return `${a.envaseTargetWeight} ${a.envaseTargetUnit || 'g'}`;
    const f = calculateFillingTargets(pat, a.densityMeasured, a.productName);
    return f.weight.value > 0 ? `${f.weight.value} ${f.weight.unit}` : '—';
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <ReportTabs abas={abas} ativa={filtro} onChange={(id) => setFiltro(id as Filtro)} />

      <FilterBar busca={busca} onBusca={setBusca} placeholder="Buscar por lote, produto, código, operador ou observação...">
        <FiltroSelect value={mes} onChange={setMes} opcoes={[{ valor: 'ALL', rotulo: 'Todos os meses' }, ...meses]} icone={<Calendar size={14} />} />
        {buscandoServidor && <span className="text-[11px] font-bold text-zinc-400">Buscando...</span>}
        {(contagem.pendente_erp > 0 || selectedIds.size > 0) && (
          <BotaoAcao className="min-h-11 md:min-h-0" disabled={lancando} onClick={() => pedirLancamento(Array.from(selectedIds))}>
            <Send size={14} />
            {selectedIds.size > 0 ? `Lançar ${selectedIds.size} no ERP` : `Lançar pendentes no ERP (${contagem.pendente_erp})`}
          </BotaoAcao>
        )}
        <BotaoAcao className="min-h-11 md:min-h-0" onClick={imprimirResumo} title="Resumo dos laudos em uma folha A4 (os selecionados, ou os que estão na lista)">
          <FileText size={14} /> Resumo A4
        </BotaoAcao>
        {selectedIds.size > 0 && (
          <>
            <BotaoAcao primario className="min-h-11 md:min-h-0" onClick={imprimirSelecionados}>
              <Printer size={14} /> Imprimir laudos ({selectedIds.size})
            </BotaoAcao>
            <BotaoAcao className="min-h-11 md:min-h-0" onClick={onClearSelection}>
              Limpar
            </BotaoAcao>
          </>
        )}
      </FilterBar>

      <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="px-4 py-2.5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <span className="font-bold text-zinc-700">
            {filtradas.length} {filtradas.length === 1 ? 'laudo' : 'laudos'}
          </span>
          {onCarregarMaisAntigos && desdeCarregado && (
            <button
              type="button"
              onClick={carregarAntigos}
              disabled={carregandoAntigos}
              className="min-h-11 md:min-h-0 text-[11px] font-bold text-zinc-600 underline underline-offset-2 disabled:opacity-60 cursor-pointer"
            >
              {carregandoAntigos ? 'Carregando...' : `Mostrando desde ${dataBr(desdeCarregado)} — carregar mais antigos`}
            </button>
          )}
        </div>

        {filtradas.length === 0 ? (
          <p className="p-10 text-center text-zinc-500 font-bold text-xs">Nenhum laudo encontrado para este filtro.</p>
        ) : (
          <>
            {/* Celular: linhas de 44 px; o quadrado seleciona, o resto abre o laudo */}
            <div className="md:hidden divide-y divide-zinc-100">
              {visiveis.map(({ a, sit }) => (
                <div key={a.id} className="flex items-stretch">
                  <label className="flex w-11 shrink-0 items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => onToggleSelection(a.id)}
                      aria-label={`Selecionar lote ${a.batch}`}
                      className="h-5 w-5 accent-zinc-950"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setAberto(a)}
                    className="min-h-11 min-w-0 flex-1 py-2.5 pr-4 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-zinc-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px] font-bold text-zinc-500">
                        {a.batch} · {dataBr(a.analysisDate)}
                      </span>
                      <span className="block text-xs font-bold text-zinc-900 break-words">{a.productName}</span>
                    </span>
                    <span className="shrink-0">{selo(sit)}</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="data-table compacta w-full text-left">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={todosMarcados}
                        onChange={() => (todosMarcados ? onClearSelection() : onSelectAll(visiveis.map(({ a }) => a.id)))}
                        aria-label="Selecionar todos desta página"
                        className="h-4 w-4 accent-zinc-950 cursor-pointer"
                      />
                    </th>
                    <th>Lote</th>
                    <th>Data</th>
                    <th>Produto</th>
                    <th className="text-center">pH</th>
                    <th className="text-center">Viscosidade (cps)</th>
                    <th className="text-center">Densidade (g/mL)</th>
                    <th className="text-center">Envase</th>
                    <th>ERP</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(({ a, pat, sit }) => {
                    const ok = checkAnalysisCompliance(a, pat);
                    return (
                      <tr
                        key={a.id}
                        onClick={() => setAberto(a)}
                        className={cn('border-b border-zinc-150 hover:bg-zinc-50 cursor-pointer', selectedIds.has(a.id) && 'bg-zinc-100/60')}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(a.id)}
                            onChange={() => onToggleSelection(a.id)}
                            aria-label={`Selecionar lote ${a.batch}`}
                            className="h-4 w-4 accent-zinc-950 cursor-pointer"
                          />
                        </td>
                        <td className="font-mono font-bold text-zinc-900">{a.batch}</td>
                        <td className="font-mono text-zinc-600 whitespace-nowrap">{dataBr(a.analysisDate)}</td>
                        <td className="max-w-[300px]">
                          <span className="block font-bold text-zinc-900 truncate" title={a.productName}>{a.productName}</span>
                          <span className="block font-mono text-[10px] text-zinc-400">{a.productCode}</span>
                        </td>
                        <td className="text-center">{medida(ok.phOk, a.phMeasured > 0 ? a.phMeasured.toFixed(2) : '—')}</td>
                        <td className="text-center">{medida(ok.viscOk, formatViscosity(a.viscosityMeasured, pat))}</td>
                        <td className="text-center">{medida(ok.densityOk, a.densityMeasured > 0 ? a.densityMeasured.toFixed(3) : '—')}</td>
                        <td className="text-center font-mono text-zinc-700 whitespace-nowrap">{envaseDe(a, pat)}</td>
                        <td>
                          {lancadoNoErp(a) ? (
                            <StatusBadge variante="abundante" title={`Lançado no ERP em ${a.erpSyncedAt || ''}`}>Lançado</StatusBadge>
                          ) : (
                            <StatusBadge variante="aguardando">Pendente</StatusBadge>
                          )}
                        </td>
                        <td>{selo(sit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="px-4 py-2.5 border-t border-zinc-200 flex items-center justify-between gap-3 text-xs text-zinc-600">
                <button
                  type="button"
                  disabled={pagina === 1}
                  onClick={() => setPagina((p) => p - 1)}
                  className="tab-btn min-h-11 md:min-h-0 px-4 disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="font-bold">
                  Página {pagina} de {totalPaginas}
                </span>
                <button
                  type="button"
                  disabled={pagina === totalPaginas}
                  onClick={() => setPagina((p) => p + 1)}
                  className="tab-btn min-h-11 md:min-h-0 px-4 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {aberto && (() => {
        const a = analyses.find((x) => x.id === aberto.id) || aberto;
        const pat = patternMap.get(normalizeCode(a.productCode)) || null;
        const sit = situacaoDoLaudo(a, pat);
        const ok = checkAnalysisCompliance(a, pat);
        const agente = a.correctiveAgentId ? agentMap.get(a.correctiveAgentId) : null;
        const faixa = (txt: string) => <span className="block text-[10px] font-normal text-zinc-400">{txt}</span>;
        const campo = (rotulo: string, valor: React.ReactNode, extra?: React.ReactNode) => (
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">{rotulo}</span>
            <div className="text-sm text-zinc-900 break-words">{valor}</div>
            {extra}
          </div>
        );
        return (
          <Drawer
            onClose={() => setAberto(null)}
            title={`Lote ${a.batch}`}
            subtitle={`${a.productName} · ${a.productCode}`}
            badge={selo(sit)}
            size="md"
            footer={
              <div className="flex flex-wrap justify-end gap-2">
                <BotaoAcao className="min-h-11 md:min-h-0" onClick={() => { onDeleteAnalysis(a.id, a.batch); setAberto(null); }}>
                  <Trash2 size={14} /> Excluir
                </BotaoAcao>
                {sit === 'em_correcao' && (
                  <BotaoAcao className="min-h-11 md:min-h-0" onClick={() => printCorrectiveOrder(a, pat, agente, config ? ({ template: config } as any) : null)}>
                    <Printer size={14} /> Ordem de ajuste
                  </BotaoAcao>
                )}
                {!lancadoNoErp(a) && (
                  <BotaoAcao className="min-h-11 md:min-h-0" onClick={() => pedirLancamento([a.id])}>
                    <Send size={14} /> Lançar no ERP
                  </BotaoAcao>
                )}
                <BotaoAcao className="min-h-11 md:min-h-0" onClick={() => printFiscoReports(a, patterns, products, agents, config)}>
                  <Printer size={14} /> Imprimir laudo
                </BotaoAcao>
                {onEditAnalysis && (
                  <BotaoAcao primario className="min-h-11 md:min-h-0" onClick={() => onEditAnalysis(a)}>
                    <Pencil size={14} /> {sit === 'em_correcao' ? 'Concluir análise' : 'Editar'}
                  </BotaoAcao>
                )}
              </div>
            }
          >
            <div className="space-y-5 p-4">
              <div className="grid grid-cols-2 gap-4">
                {campo('pH (25 °C)', medida(ok.phOk, a.phMeasured > 0 ? a.phMeasured.toFixed(2) : '—'), pat && faixa(`padrão ${pat.phMin} a ${pat.phMax}`))}
                {campo(
                  'Viscosidade',
                  <>{medida(ok.viscOk, formatViscosity(a.viscosityMeasured, pat))} <span className="text-[10px] text-zinc-400">cps</span></>,
                  pat && faixa(`padrão ${formatViscosity(pat.viscosityMin, pat)} a ${formatViscosity(pat.viscosityMax, pat)}`),
                )}
                {campo(
                  'Densidade',
                  <>{medida(ok.densityOk, a.densityMeasured > 0 ? a.densityMeasured.toFixed(3) : '—')} <span className="text-[10px] text-zinc-400">g/mL</span></>,
                  pat && faixa(`padrão ${pat.densityTarget.toFixed(3)} ± ${pat.densityTolerance.toFixed(3)}`),
                )}
                {campo('Envase', <span className="font-mono font-bold">{envaseDe(a, pat)}</span>)}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-zinc-200 pt-4">
                {campo('Data da análise', dataBr(a.analysisDate))}
                {campo('Analista', a.technician || '—')}
                {campo('Fabricado por', a.fabricatedBy || '—')}
                {campo('Autorizado por', a.authorizedBy || '—')}
                {campo(
                  'ERP',
                  lancadoNoErp(a) ? <StatusBadge variante="abundante">Lançado</StatusBadge> : <StatusBadge variante="aguardando">Pendente</StatusBadge>,
                  lancadoNoErp(a) && a.erpSyncedAt ? faixa(String(a.erpSyncedAt).slice(0, 16).replace('T', ' ')) : undefined,
                )}
                {a.aspectResult && campo('Aspecto', a.aspectResult)}
                {a.colorResult && campo('Cor', a.colorResult)}
                {a.odorResult && campo('Odor', a.odorResult)}
              </div>

              {a.notes && (
                <div className="border-t border-zinc-200 pt-4">
                  {campo('Observações', <span className="whitespace-pre-wrap">{a.notes}</span>)}
                </div>
              )}

              {a.mediaUrl && (
                <div className="border-t border-zinc-200 pt-4">
                  <BotaoAcao className="min-h-11 md:min-h-0" onClick={() => setZoomMidia(a)}>
                    <ImageIcon size={14} /> Ver {a.mediaUrl.startsWith('data:video') ? 'vídeo' : 'foto'} da amostra
                  </BotaoAcao>
                </div>
              )}
            </div>
          </Drawer>
        );
      })()}

      <Modal isOpen={!!zoomMidia} onClose={() => setZoomMidia(null)} title={zoomMidia ? `Amostra do lote ${zoomMidia.batch}` : ''} subtitle="Registro de bancada" size="lg">
        {zoomMidia?.mediaUrl && (
          <div className="rounded-2xl overflow-hidden border border-zinc-200 bg-black flex items-center justify-center max-h-[70dvh]">
            {zoomMidia.mediaUrl.startsWith('data:video') ? (
              <video src={zoomMidia.mediaUrl} controls autoPlay className="max-w-full max-h-[70dvh]" />
            ) : (
              <img src={zoomMidia.mediaUrl} alt={`Amostra do lote ${zoomMidia.batch}`} className="max-w-full max-h-[70dvh] object-contain" />
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={!!confirmaErp} onClose={() => !lancando && setConfirmaErp(null)} title="Lançar laudos no ERP" subtitle="Grava pH, viscosidade, densidade e responsáveis no cadastro do lote do ERP" size="sm">
        {confirmaErp && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-800">
              Lançar <strong>{confirmaErp.qtd}</strong> {confirmaErp.qtd === 1 ? 'laudo' : 'laudos'} no ERP? O lote passa a constar como aprovado na inspeção.
            </p>
            {erroErp && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{erroErp}</p>}
            <div className="flex justify-end gap-2">
              <BotaoAcao className="min-h-11 md:min-h-0" disabled={lancando} onClick={() => setConfirmaErp(null)}>
                Cancelar
              </BotaoAcao>
              <BotaoAcao primario className="min-h-11 md:min-h-0" disabled={lancando} onClick={lancarNoErp}>
                {lancando ? 'Lançando...' : 'Lançar no ERP'}
              </BotaoAcao>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
