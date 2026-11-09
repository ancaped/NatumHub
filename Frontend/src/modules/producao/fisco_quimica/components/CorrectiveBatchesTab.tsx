import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Printer, CheckCircle2, Clock } from 'lucide-react';
import { api, localAuth } from '../../../geral/lib/api';
import { CorrectiveWeekSummary, FiscoQuimicaAgent } from '../../../geral/lib/types';
import Drawer from '../../../geral/components/ui/Drawer';
import Modal from '../../../geral/components/ui/Modal';
import { BotaoAcao, FilterBar, ReportTabs, StatusBadge } from '../../../geral/components/ui/ReportKit';
import { imprimirBaixaSemanal } from '../lib/baixaSemanal';

interface CorrectiveBatchesTabProps {
  agents?: FiscoQuimicaAgent[];
  onRefreshHistory?: () => void;
}

type Filtro = 'ALL' | 'PENDENTE' | 'BAIXADO';

const kg = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

/** Baixa semanal dos agentes corretivos: o que foi gasto nos ajustes da bancada, para dar baixa única no ERP. */
export function CorrectiveBatchesTab({ onRefreshHistory }: CorrectiveBatchesTabProps) {
  const [weeks, setWeeks] = useState<CorrectiveWeekSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('ALL');
  const [aberta, setAberta] = useState<string | null>(null);
  const [confirma, setConfirma] = useState<CorrectiveWeekSummary | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erroGravar, setErroGravar] = useState<string | null>(null);
  const currentUser = localAuth.getUser();

  const fetchWeeks = async () => {
    setLoading(true);
    setError(null);
    try {
      setWeeks((await api.getFiscoCorrectiveBatches()) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar as baixas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeeks();
  }, []);

  const pendentes = weeks.filter((w) => !w.is_baixa_realizada).length;

  const filtradas = useMemo(() => {
    const q = search.toLowerCase().trim();
    return weeks.filter((w) => {
      if (filtro === 'PENDENTE' && w.is_baixa_realizada) return false;
      if (filtro === 'BAIXADO' && !w.is_baixa_realizada) return false;
      if (!q) return true;
      return (
        w.label.toLowerCase().includes(q) ||
        w.week_key.toLowerCase().includes(q) ||
        w.items.some((it) => [it.batch, it.product_code, it.product_name, it.agent_name].some((t) => t.toLowerCase().includes(q)))
      );
    });
  }, [weeks, filtro, search]);

  const semana = aberta ? weeks.find((w) => w.week_key === aberta) || null : null;

  const gravar = async () => {
    if (!confirma) return;
    setGravando(true);
    setErroGravar(null);
    const marcar = !confirma.is_baixa_realizada;
    try {
      await api.toggleFiscoCorrectiveBaixa({
        week_key: confirma.week_key,
        is_baixa: marcar,
        usuario: currentUser?.displayName || 'Operador CQ',
        observacoes: marcar ? 'Baixa manual consolidada no ERP' : undefined,
      });
      setConfirma(null);
      await fetchWeeks();
      onRefreshHistory?.();
    } catch (err) {
      setErroGravar(err instanceof Error ? err.message : String(err));
    } finally {
      setGravando(false);
    }
  };

  const selo = (w: CorrectiveWeekSummary) =>
    w.is_baixa_realizada ? <StatusBadge variante="saudavel">Baixada no ERP</StatusBadge> : <StatusBadge variante="ordem">Baixa pendente</StatusBadge>;

  const abas = [
    { id: 'ALL', label: 'Todas', contagem: weeks.length },
    { id: 'PENDENTE', label: 'Pendentes', contagem: pendentes },
    { id: 'BAIXADO', label: 'Baixadas', contagem: weeks.length - pendentes },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <ReportTabs abas={abas} ativa={filtro} onChange={(id) => setFiltro(id as Filtro)} />

      <FilterBar busca={search} onBusca={setSearch} placeholder="Buscar por semana, lote, produto ou corretivo...">
        <BotaoAcao className="min-h-11 md:min-h-0" onClick={fetchWeeks} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </BotaoAcao>
      </FilterBar>

      <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="px-4 py-2.5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
          <span className="font-bold text-zinc-700">{filtradas.length} {filtradas.length === 1 ? 'semana' : 'semanas'}</span>
          <span className="text-[11px] text-zinc-500">Corretivos gastos nos ajustes de viscosidade e pH, para uma baixa manual por semana no ERP. Toque numa semana para ver.</span>
        </div>

        {error ? (
          <p className="p-10 text-center text-red-700 font-bold text-xs">{error}</p>
        ) : loading && weeks.length === 0 ? (
          <p className="p-10 text-center text-zinc-500 font-bold text-xs">Carregando...</p>
        ) : filtradas.length === 0 ? (
          <p className="p-10 text-center text-zinc-500 font-bold text-xs">Nenhum ajuste de bancada encontrado.</p>
        ) : (
          <>
            <div className="md:hidden divide-y divide-zinc-100">
              {filtradas.map((w) => (
                <button key={w.week_key} type="button" onClick={() => setAberta(w.week_key)} className="w-full min-h-11 px-4 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer active:bg-zinc-50">
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-zinc-900 break-words">{w.label}</span>
                    <span className="block font-mono text-[11px] text-zinc-500">
                      {w.items.length} {w.items.length === 1 ? 'lote' : 'lotes'} · {kg(w.total_agents_kg)}
                    </span>
                  </span>
                  <span className="shrink-0">{selo(w)}</span>
                </button>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="data-table compacta w-full text-left">
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th className="text-right">Lotes</th>
                    <th className="text-right">Consumo total</th>
                    <th>Baixa</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((w) => (
                    <tr key={w.week_key} onClick={() => setAberta(w.week_key)} className="border-b border-zinc-150 hover:bg-zinc-50 cursor-pointer">
                      <td>
                        <span className="font-bold text-zinc-900">{w.label}</span>
                        <span className="ml-2 font-mono text-[10px] text-zinc-400">{w.week_key}</span>
                      </td>
                      <td className="text-right font-mono">{w.items.length}</td>
                      <td className="text-right font-mono font-bold">{kg(w.total_agents_kg)}</td>
                      <td>
                        {selo(w)}
                        {w.is_baixa_realizada && w.baixa_data && (
                          <span className="ml-2 text-[11px] text-zinc-500">
                            {w.baixa_usuario || 'Operador'} · {new Date(w.baixa_data).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {semana && (
        <Drawer
          onClose={() => setAberta(null)}
          title={semana.label}
          subtitle={`${semana.week_key} · ${semana.items.length} ${semana.items.length === 1 ? 'lote corrigido' : 'lotes corrigidos'}`}
          badge={selo(semana)}
          size="lg"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <BotaoAcao className="min-h-11 md:min-h-0" onClick={() => imprimirBaixaSemanal(semana)}>
                <Printer size={14} /> Imprimir folha
              </BotaoAcao>
              <BotaoAcao primario={!semana.is_baixa_realizada} className="min-h-11 md:min-h-0" onClick={() => { setErroGravar(null); setConfirma(semana); }}>
                {semana.is_baixa_realizada ? <><Clock size={14} /> Reabrir baixa</> : <><CheckCircle2 size={14} /> Marcar baixa feita</>}
              </BotaoAcao>
            </div>
          }
        >
          <div className="space-y-5 p-4">
            {semana.is_baixa_realizada && semana.baixa_data && (
              <p className="text-xs text-emerald-800">
                Baixada por <strong>{semana.baixa_usuario || 'Operador'}</strong> em {new Date(semana.baixa_data).toLocaleDateString('pt-BR')}.
              </p>
            )}

            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Total a dar baixa no ERP</span>
              <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                {Object.entries(semana.agent_totals).map(([nome, total]) => (
                  <div key={nome} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 break-words font-bold text-zinc-900">{nome}</span>
                    <span className="shrink-0 font-mono font-bold text-zinc-900">{kg(total)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Lotes corrigidos</span>
              <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                {semana.items.map((it) => (
                  <div key={it.analysis_id} className="px-3 py-2 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-mono font-bold text-zinc-500">{it.batch} · {it.analysis_date}</span>
                        <span className="block font-bold text-zinc-900 break-words">{it.product_name}</span>
                      </span>
                      <span className="shrink-0 font-mono font-bold text-zinc-900">{kg(it.total_agent_kg)}</span>
                    </div>
                    <div className="mt-0.5 text-zinc-500">
                      {it.agent_name}
                      {it.trial_qty_g_per_l ? ` · dose ${it.trial_qty_g_per_l} g/L` : ''}
                      {it.batch_size_kg ? ` · lote de ${it.batch_size_kg.toLocaleString('pt-BR')} kg` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Drawer>
      )}

      <Modal
        isOpen={!!confirma}
        onClose={() => !gravando && setConfirma(null)}
        title={confirma?.is_baixa_realizada ? 'Reabrir baixa da semana' : 'Confirmar baixa da semana'}
        subtitle={confirma?.label}
        size="sm"
      >
        {confirma && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-800">
              {confirma.is_baixa_realizada
                ? 'A semana volta a constar como pendente de baixa no ERP.'
                : 'Confirma que a baixa manual dos corretivos desta semana já foi feita no ERP?'}
            </p>
            {erroGravar && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{erroGravar}</p>}
            <div className="flex justify-end gap-2">
              <BotaoAcao className="min-h-11 md:min-h-0" disabled={gravando} onClick={() => setConfirma(null)}>Cancelar</BotaoAcao>
              <BotaoAcao primario className="min-h-11 md:min-h-0" disabled={gravando} onClick={gravar}>
                {gravando ? 'Gravando...' : confirma.is_baixa_realizada ? 'Reabrir' : 'Confirmar'}
              </BotaoAcao>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
