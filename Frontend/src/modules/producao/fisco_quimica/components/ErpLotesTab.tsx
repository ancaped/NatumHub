import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, FlaskConical, Calendar } from 'lucide-react';
import { api } from '../../../geral/lib/api';
import { FiscoErpLoteItem, FiscoErpLoteInsumo, FiscoQuimicaPattern, Product } from '../../../geral/lib/types';
import Drawer from '../../../geral/components/ui/Drawer';
import { BotaoAcao, FilterBar, ReportTabs, StatusBadge } from '../../../geral/components/ui/ReportKit';

interface ErpLotesTabProps {
  onStartAnalysisWithLote?: (productCode: string, batchNumber: string, batchSizeKg?: number) => void;
  patterns?: FiscoQuimicaPattern[];
  products?: Product[];
}

type FiltroLaudo = 'ALL' | 'com_laudo_erp' | 'sem_laudo_erp' | 'com_laudo_hub';

const formatDate = (dStr?: string | null) => {
  if (!dStr) return '—';
  const [yyyy, mm, dd] = dStr.split(' ')[0].split('T')[0].split('-');
  return yyyy && mm && dd ? `${dd}/${mm}/${yyyy}` : dStr;
};

const positivo = (v?: number | null) => v !== null && v !== undefined && v > 0;

/** Situação do laudo do lote no ERP: com medições, aprovado sem medições ou pendente. */
function laudoErp(item: FiscoErpLoteItem): 'completo' | 'sem_medicao' | 'pendente' {
  if (positivo(item.ph_erp) || positivo(item.viscosidade_erp) || positivo(item.densidade_erp)) return 'completo';
  return item.resultado_cq_erp === 'AP' || item.status_erp === 'AP' ? 'sem_medicao' : 'pendente';
}

/** Lotes que vieram do ERP e a situação do laudo de cada um (no ERP e no Nexus). Só leitura. */
export function ErpLotesTab({ onStartAnalysisWithLote }: ErpLotesTabProps) {
  const [items, setItems] = useState<FiscoErpLoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ com_laudo_erp: 0, sem_laudo_erp: 0, com_laudo_hub: 0, total_lotes: 0 });

  const [search, setSearch] = useState('');
  const [statusLaudo, setStatusLaudo] = useState<FiltroLaudo>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedLote, setSelectedLote] = useState<FiscoErpLoteItem | null>(null);
  const [loteInsumos, setLoteInsumos] = useState<FiscoErpLoteInsumo[]>([]);
  const [loadingInsumos, setLoadingInsumos] = useState(false);

  const fetchLotes = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await api.getFiscoErpLotes({
        search: search.trim() || undefined,
        status_laudo: statusLaudo !== 'ALL' ? statusLaudo : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        limit: 25,
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 1);
      if (res.stats) {
        setStats({
          total_lotes: res.stats.total_lotes || 0,
          com_laudo_erp: (res.stats as any).com_laudo_erp ?? res.stats.com_laudo ?? 0,
          sem_laudo_erp: (res.stats as any).sem_laudo_erp ?? res.stats.sem_laudo ?? 0,
          com_laudo_hub: (res.stats as any).com_laudo_hub ?? 0,
        });
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [search, statusLaudo, dateFrom, dateTo, page]);

  useEffect(() => {
    fetchLotes();
  }, [fetchLotes]);

  const abrir = async (item: FiscoErpLoteItem) => {
    setSelectedLote(item);
    setLoadingInsumos(true);
    try {
      setLoteInsumos((await api.getFiscoErpLoteInsumos(item.lote)) || []);
    } catch {
      setLoteInsumos([]);
    } finally {
      setLoadingInsumos(false);
    }
  };

  const mudar = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const selos = (item: FiscoErpLoteItem) => {
    const l = laudoErp(item);
    return (
      <span className="flex flex-wrap gap-1">
        {l === 'completo' && <StatusBadge variante="saudavel">Laudo no ERP</StatusBadge>}
        {l === 'sem_medicao' && <StatusBadge variante="abundante">Sem medições</StatusBadge>}
        {l === 'pendente' && <StatusBadge variante="ordem">Sem laudo no ERP</StatusBadge>}
        {item.has_laudo_hub ? <StatusBadge variante="apoio">Laudo no Nexus</StatusBadge> : <StatusBadge variante="aguardando">Sem laudo no Nexus</StatusBadge>}
      </span>
    );
  };

  const medidas = (item: FiscoErpLoteItem) =>
    [item.ph_erp ? `pH ${item.ph_erp}` : '', item.viscosidade_erp ? `visc. ${item.viscosidade_erp}` : '', item.densidade_erp ? `dens. ${item.densidade_erp}` : '']
      .filter(Boolean)
      .join(' · ') || '—';

  const abas = [
    { id: 'ALL', label: 'Todos', contagem: stats.total_lotes },
    { id: 'sem_laudo_erp', label: 'Sem laudo no ERP', contagem: stats.sem_laudo_erp },
    { id: 'com_laudo_erp', label: 'Com laudo no ERP', contagem: stats.com_laudo_erp },
    { id: 'com_laudo_hub', label: 'Com laudo no Nexus', contagem: stats.com_laudo_hub },
  ];

  const campo = (rotulo: string, valor: React.ReactNode) => (
    <div className="min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">{rotulo}</span>
      <div className="text-sm text-zinc-900 break-words">{valor}</div>
    </div>
  );

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <ReportTabs abas={abas} ativa={statusLaudo} onChange={(id) => mudar(() => setStatusLaudo(id as FiltroLaudo))} />

      <FilterBar busca={search} onBusca={(v) => mudar(() => setSearch(v))} placeholder="Buscar por lote, produto, fabricante ou responsável...">
        <div className="flex w-full md:w-auto flex-col md:flex-row gap-2 md:items-center">
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Calendar size={14} className="text-zinc-400" />
            <span className="w-8 md:w-auto">De</span>
            <input type="date" className="select-filter min-h-11 md:min-h-0 flex-1" value={dateFrom} onChange={(e) => mudar(() => setDateFrom(e.target.value))} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Calendar size={14} className="text-transparent md:hidden" />
            <span className="w-8 md:w-auto">Até</span>
            <input type="date" className="select-filter min-h-11 md:min-h-0 flex-1" value={dateTo} onChange={(e) => mudar(() => setDateTo(e.target.value))} />
          </label>
        </div>
        <BotaoAcao className="min-h-11 md:min-h-0" onClick={fetchLotes} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </BotaoAcao>
      </FilterBar>

      <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="px-4 py-2.5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
          <span className="font-bold text-zinc-700">{total.toLocaleString('pt-BR')} {total === 1 ? 'lote' : 'lotes'}</span>
          <span className="text-[11px] text-zinc-500">Os lotes e laudos vêm do ERP; para trazer dados novos use a Gestão de importações.</span>
        </div>

        {erro ? (
          <p className="p-10 text-center text-red-700 font-bold text-xs">Não foi possível carregar os lotes: {erro}</p>
        ) : loading && items.length === 0 ? (
          <p className="p-10 text-center text-zinc-500 font-bold text-xs">Carregando lotes...</p>
        ) : items.length === 0 ? (
          <p className="p-10 text-center text-zinc-500 font-bold text-xs">Nenhum lote encontrado para este filtro.</p>
        ) : (
          <>
            <div className="md:hidden divide-y divide-zinc-100">
              {items.map((item) => (
                <button
                  key={`${item.lote}-${item.product_code}`}
                  type="button"
                  onClick={() => abrir(item)}
                  className="w-full min-h-11 px-4 py-2.5 flex flex-col gap-1 text-left cursor-pointer active:bg-zinc-50"
                >
                  <span className="font-mono text-[11px] font-bold text-zinc-500">
                    {item.lote} · {formatDate(item.date_erp)}
                  </span>
                  <span className="text-xs font-bold text-zinc-900 break-words">{item.product_name || item.product_code}</span>
                  {selos(item)}
                </button>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="data-table compacta w-full text-left">
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Data</th>
                    <th>Produto</th>
                    <th className="text-right hidden xl:table-cell">Volume</th>
                    <th className="hidden xl:table-cell">Medições no ERP</th>
                    <th>Laudo</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={`${item.lote}-${item.product_code}`} onClick={() => abrir(item)} className="border-b border-zinc-150 hover:bg-zinc-50 cursor-pointer">
                      <td className="font-mono font-bold text-zinc-900">{item.lote}</td>
                      <td className="font-mono text-zinc-600 whitespace-nowrap">{formatDate(item.date_erp)}</td>
                      <td className="max-w-[300px]">
                        <span className="block font-bold text-zinc-900 truncate" title={item.product_name}>{item.product_name || 'Sem descrição'}</span>
                        <span className="block font-mono text-[10px] text-zinc-400">{item.product_code}</span>
                      </td>
                      <td className="text-right font-bold whitespace-nowrap hidden xl:table-cell">{item.qty_kg.toLocaleString('pt-BR')} kg</td>
                      <td className="hidden xl:table-cell font-mono text-zinc-700 whitespace-nowrap">{medidas(item)}</td>
                      <td>{selos(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-4 py-2.5 border-t border-zinc-200 flex items-center justify-between gap-3 text-xs text-zinc-600">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="tab-btn min-h-11 md:min-h-0 px-4 disabled:opacity-40">
                  Anterior
                </button>
                <span className="font-bold">Página {page} de {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="tab-btn min-h-11 md:min-h-0 px-4 disabled:opacity-40">
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedLote && (
        <Drawer
          onClose={() => setSelectedLote(null)}
          title={`Lote ${selectedLote.lote}`}
          subtitle={`${selectedLote.product_name || ''} · ${selectedLote.product_code}`}
          size="md"
          footer={
            onStartAnalysisWithLote && (
              <div className="flex justify-end">
                <BotaoAcao
                  primario
                  className="min-h-11 md:min-h-0"
                  onClick={() => {
                    const l = selectedLote;
                    setSelectedLote(null);
                    onStartAnalysisWithLote(l.product_code, l.lote, l.qty_kg);
                  }}
                >
                  <FlaskConical size={14} /> {selectedLote.has_laudo_hub ? 'Abrir laudo no Nexus' : 'Registrar laudo deste lote'}
                </BotaoAcao>
              </div>
            )
          }
        >
          <div className="space-y-5 p-4">
            <div className="grid grid-cols-2 gap-4">
              {campo('Volume', `${selectedLote.qty_kg.toLocaleString('pt-BR')} kg${selectedLote.unidades > 0 ? ` (${selectedLote.unidades.toLocaleString('pt-BR')} un)` : ''}`)}
              {campo('Data do lote', formatDate(selectedLote.date_erp))}
              {campo('Fabricado por', selectedLote.fabricated_by || '—')}
              {campo('Autorizado por', selectedLote.authorized_by || '—')}
              {selectedLote.d_pesado && campo('Pesagem', formatDate(selectedLote.d_pesado))}
              {selectedLote.d_envase && campo('Envase', formatDate(selectedLote.d_envase))}
            </div>

            <div className="border-t border-zinc-200 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-700">Laudo no ERP</span>
                {selos(selectedLote)}
              </div>
              {laudoErp(selectedLote) === 'pendente' ? (
                <p className="text-xs text-zinc-500">Nenhuma medição de qualidade registrada no ERP para este lote.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {laudoErp(selectedLote) === 'completo' && campo('pH', selectedLote.ph_erp ?? '—')}
                  {laudoErp(selectedLote) === 'completo' && campo('Viscosidade', selectedLote.viscosidade_erp ? `${selectedLote.viscosidade_erp} cps` : '—')}
                  {laudoErp(selectedLote) === 'completo' && campo('Densidade', selectedLote.densidade_erp ? `${selectedLote.densidade_erp} g/mL` : '—')}
                  {campo('Responsável', selectedLote.responsavel_cq_erp || '—')}
                  {selectedLote.data_inspecao_erp && campo('Inspeção', formatDate(selectedLote.data_inspecao_erp))}
                  {selectedLote.observacoes_erp && campo('Observações', selectedLote.observacoes_erp)}
                </div>
              )}
            </div>

            {selectedLote.has_laudo_hub && (
              <div className="border-t border-zinc-200 pt-4 space-y-3">
                <span className="text-xs font-bold text-zinc-700">Laudo no Nexus</span>
                <div className="grid grid-cols-2 gap-4">
                  {campo('pH', selectedLote.ph_measured ?? '—')}
                  {campo('Viscosidade', selectedLote.viscosity_measured ?? '—')}
                  {campo('Densidade', selectedLote.density_measured ?? '—')}
                  {campo('Analista', selectedLote.technician ?? '—')}
                </div>
              </div>
            )}

            <div className="border-t border-zinc-200 pt-4">
              <span className="block text-xs font-bold text-zinc-700 mb-2">Insumos baixados no lote ({loteInsumos.length})</span>
              {loadingInsumos ? (
                <p className="text-xs text-zinc-500">Buscando insumos...</p>
              ) : loteInsumos.length === 0 ? (
                <p className="text-xs text-zinc-500">Nenhum insumo baixado para este lote.</p>
              ) : (
                <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                  {loteInsumos.map((ins, idx) => (
                    <div key={`${ins.item_code}-${idx}`} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                      <span className="min-w-0">
                        <span className="block font-mono font-bold text-zinc-500">{ins.item_code}</span>
                        <span className="block text-zinc-800 break-words">{ins.item_description}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold text-zinc-900">{ins.quantity.toLocaleString('pt-BR')} {ins.unit || ''}</span>
                        <span className="block text-[10px] text-zinc-400">{formatDate(ins.date)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
