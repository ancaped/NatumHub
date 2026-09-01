import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  Package,
  Layers,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  User,
  Calendar,
  Sparkles,
  Info,
  Scale,
  X,
  ShieldCheck,
  CheckCircle,
  XCircle,
  SlidersHorizontal,
  FileCheck
} from 'lucide-react';
import { api } from '../../../geral/lib/api';
import { apiJson } from '../../../geral/lib/http';
import { FiscoErpLoteItem, FiscoErpLoteInsumo, FiscoQuimicaPattern, Product } from '../../../geral/lib/types';
import Modal from '../../../geral/components/ui/Modal';

interface ErpLotesTabProps {
  onStartAnalysisWithLote?: (productCode: string, batchNumber: string, batchSizeKg?: number) => void;
  patterns: FiscoQuimicaPattern[];
  products: Product[];
}

export function ErpLotesTab({
  onStartAnalysisWithLote,
  patterns = [],
  products = []
}: ErpLotesTabProps) {
  const [items, setItems] = useState<FiscoErpLoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingErp, setSyncingErp] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    total_lotes: 0,
    com_laudo_erp: 0,
    sem_laudo_erp: 0,
    com_laudo_hub: 0,
    total_kg: 0
  });

  // Filtros
  const [search, setSearch] = useState('');
  const [statusLaudo, setStatusLaudo] = useState<'ALL' | 'com_laudo_erp' | 'sem_laudo_erp' | 'com_laudo_hub' | 'sem_laudo_hub'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Drawer / Modal de Detalhes do Lote
  const [selectedLote, setSelectedLote] = useState<FiscoErpLoteItem | null>(null);
  const [loteInsumos, setLoteInsumos] = useState<FiscoErpLoteInsumo[]>([]);
  const [loadingInsumos, setLoadingInsumos] = useState(false);

  const fetchLotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getFiscoErpLotes({
        search: search.trim() || undefined,
        status_laudo: statusLaudo !== 'ALL' ? statusLaudo : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        limit
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
          total_kg: res.stats.total_kg || 0
        });
      }
    } catch (err) {
      console.error('Erro ao carregar lotes do ERP:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusLaudo, dateFrom, dateTo, page, limit]);

  useEffect(() => {
    fetchLotes();
  }, [fetchLotes]);

  const handleSyncErpDatabase = async () => {
    setSyncingErp(true);
    try {
      try {
        await apiJson('/import/sync-lock/release', { method: 'POST' });
      } catch {
        // ignora se não for necessário liberar
      }

      const data = await apiJson<{ message?: string; error?: string }>('/import/sync?mode=incremental', {
        method: 'POST',
      });

      if (data?.error) {
        alert(`Aviso do Sync: ${data.error}`);
      } else {
        alert(data?.message || 'Sincronização com o ERP concluída com sucesso!');
      }
      await fetchLotes();
    } catch (err: any) {
      console.error('Erro ao sincronizar com ERP:', err);
      alert(`Falha ao sincronizar com ERP: ${err.message || err}`);
    } finally {
      setSyncingErp(false);
    }
  };

  // Carrega insumos ao abrir o modal de detalhes do lote
  const handleOpenLoteDetails = async (item: FiscoErpLoteItem) => {
    setSelectedLote(item);
    setLoadingInsumos(true);
    try {
      const ins = await api.getFiscoErpLoteInsumos(item.lote);
      setLoteInsumos(ins || []);
    } catch (e) {
      console.error('Erro ao carregar insumos do lote:', e);
      setLoteInsumos([]);
    } finally {
      setLoadingInsumos(false);
    }
  };

  const formatDate = (dStr?: string | null) => {
    if (!dStr) return '-';
    try {
      const clean = dStr.split(' ')[0].split('T')[0];
      const [yyyy, mm, dd] = clean.split('-');
      if (yyyy && mm && dd) return `${dd}/${mm}/${yyyy}`;
      return dStr;
    } catch {
      return dStr;
    }
  };

  return (
    <div className="view-container animate-in fade-in duration-200">
      {/* Banner Informativo */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-4 sm:p-5 mb-4 shadow-sm border border-blue-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-300 text-xs font-bold uppercase tracking-wider mb-1">
            <Database size={15} />
            <span>Integração de Qualidade & Produção ERP</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Histórico Completo de Lotes & Laudos do ERP
          </h2>
          <p className="text-xs text-blue-200/90 max-w-2xl mt-0.5">
            Visualize os parâmetros físico-químicos (pH, viscosidade, densidade), responsáveis e autorizadores registrados diretamente no seu sistema ERP, além de acompanhar o status de laudos no NatumHub.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleSyncErpDatabase()}
            disabled={syncingErp || loading}
            className="btn-secondary !bg-blue-500 hover:!bg-blue-400 !text-white !border-blue-400 text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Importar novos lotes e laudos diretamente do banco SQL Server do ERP"
          >
            <Database size={14} className={syncingErp ? 'animate-spin' : ''} />
            <span>{syncingErp ? 'Puxando do ERP...' : 'Sincronizar com ERP'}</span>
          </button>
          <button
            type="button"
            onClick={() => fetchLotes()}
            disabled={loading || syncingErp}
            className="btn-secondary !bg-white/10 hover:!bg-white/20 !text-white !border-white/20 text-xs flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
            title="Atualizar exibição dos dados"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Recarregar</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div
          className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-blue-300 hover:shadow-md ${
            statusLaudo === 'ALL' ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/20' : 'border-zinc-200'
          }`}
          onClick={() => {
            setStatusLaudo('ALL');
            setPage(1);
          }}
          title="Clique para ver todos os lotes"
        >
          <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
            <Database size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Total Lotes ERP</div>
            <div className="text-xl font-bold text-zinc-900">{stats.total_lotes.toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div
          className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-emerald-300 hover:shadow-md ${
            statusLaudo === 'com_laudo_erp' ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/20' : 'border-zinc-200'
          }`}
          onClick={() => {
            setStatusLaudo(statusLaudo === 'com_laudo_erp' ? 'ALL' : 'com_laudo_erp');
            setPage(1);
          }}
          title="Clique para filtrar por lotes com laudo/CQ no ERP"
        >
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Com Laudo CQ (ERP)</div>
            <div className="text-xl font-bold text-emerald-600">{stats.com_laudo_erp.toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div
          className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-amber-300 hover:shadow-md ${
            statusLaudo === 'sem_laudo_erp' ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/20' : 'border-zinc-200'
          }`}
          onClick={() => {
            setStatusLaudo(statusLaudo === 'sem_laudo_erp' ? 'ALL' : 'sem_laudo_erp');
            setPage(1);
          }}
          title="Clique para filtrar por lotes sem laudo no ERP"
        >
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Sem Laudo no ERP</div>
            <div className="text-xl font-bold text-amber-600">{stats.sem_laudo_erp.toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div
          className={`bg-white rounded-xl border p-3.5 shadow-sm flex items-center gap-3 cursor-pointer transition-all hover:border-indigo-300 hover:shadow-md ${
            statusLaudo === 'com_laudo_hub' ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/20' : 'border-zinc-200'
          }`}
          onClick={() => {
            setStatusLaudo(statusLaudo === 'com_laudo_hub' ? 'ALL' : 'com_laudo_hub');
            setPage(1);
          }}
          title="Clique para filtrar por lotes com laudo registrado no NatumHub"
        >
          <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
            <FlaskConical size={20} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Laudos NatumHub</div>
            <div className="text-xl font-bold text-indigo-600">{stats.com_laudo_hub.toLocaleString('pt-BR')}</div>
          </div>
        </div>
      </div>

      {/* Toolbar e Filtros */}
      <div className="toolbar-section flex-wrap gap-2.5">
        <div className="search-input-wrapper min-w-[280px] flex-1">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por lote, produto, fabricante, autorizador, responsável CQ..."
            className="search-input"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="filters-wrapper flex-wrap gap-2">
          <select
            className="select-filter"
            value={statusLaudo}
            onChange={(e) => {
              setStatusLaudo(e.target.value as any);
              setPage(1);
            }}
          >
            <option value="ALL">Filtro de Laudos: Todos</option>
            <option value="com_laudo_erp">Com Laudo CQ no ERP ({stats.com_laudo_erp})</option>
            <option value="sem_laudo_erp">Sem Laudo no ERP ({stats.sem_laudo_erp})</option>
            <option value="com_laudo_hub">Lançados no NatumHub ({stats.com_laudo_hub})</option>
          </select>

          <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg px-2 py-1 text-xs text-zinc-600">
            <Calendar size={14} className="text-zinc-400" />
            <input
              type="date"
              className="border-none text-xs bg-transparent focus:outline-none"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              title="Data inicial ERP"
            />
            <span className="text-zinc-400">até</span>
            <input
              type="date"
              className="border-none text-xs bg-transparent focus:outline-none"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              title="Data final ERP"
            />
          </div>

          <button
            className="btn-secondary cursor-pointer"
            onClick={() => fetchLotes()}
            title="Recarregar lista de lotes do ERP"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabela de Lotes e Laudos ERP */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col w-full text-xs">
        {loading ? (
          <div className="p-16 text-center text-zinc-500 flex flex-col items-center gap-3">
            <RefreshCw className="animate-spin text-blue-600" size={32} />
            <span className="font-medium">Carregando histórico de lotes e laudos do ERP...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center text-zinc-400 flex flex-col items-center gap-3">
            <AlertCircle size={48} className="opacity-40" />
            <span className="text-sm font-medium">Nenhum lote do ERP encontrado com os filtros selecionados.</span>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-zinc-50 sticky top-0 z-10 border-b border-zinc-200 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Lote / Data</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">Volume (kg)</th>
                  <th className="px-4 py-3">Fabricado / Autorizado</th>
                  <th className="px-4 py-3 text-center">Laudo ERP (CQ)</th>
                  <th className="px-4 py-3">Parâmetros Medidos (ERP)</th>
                  <th className="px-4 py-3 text-center">Status Hub</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-zinc-700">
                {items.map((item) => {
                  const hasCompleteFq = (item.ph_erp !== null && item.ph_erp !== undefined && item.ph_erp > 0) ||
                    (item.viscosidade_erp !== null && item.viscosidade_erp !== undefined && item.viscosidade_erp > 0) ||
                    (item.densidade_erp !== null && item.densidade_erp !== undefined && item.densidade_erp > 0);
                  const isApprovedAdminOnly = !hasCompleteFq && (item.resultado_cq_erp === 'AP' || item.status_erp === 'AP');
                  const hasErpQc = hasCompleteFq || isApprovedAdminOnly;

                  return (
                    <tr key={`${item.lote}-${item.product_code}`} className="hover:bg-zinc-50/80 transition-colors">
                      {/* Lote / Data */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md w-fit text-xs">
                            {item.lote}
                          </span>
                          <span className="text-[11px] text-zinc-500 mt-1 font-medium">
                            {formatDate(item.date_erp)}
                          </span>
                        </div>
                      </td>

                      {/* Produto */}
                      <td className="px-4 py-3 max-w-[300px] truncate" title={`${item.product_code} - ${item.product_name}`}>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-zinc-900">{item.product_code}</span>
                          <span className="text-zinc-600 text-xs truncate">{item.product_name || 'Sem descrição'}</span>
                        </div>
                      </td>

                      {/* Volume kg / Unidades */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-zinc-900">{item.qty_kg.toLocaleString('pt-BR')} kg</span>
                          {item.unidades > 0 && (
                            <span className="text-[10px] text-zinc-400">{item.unidades.toLocaleString('pt-BR')} un</span>
                          )}
                        </div>
                      </td>

                      {/* Fabricado / Autorizado */}
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="flex flex-col text-xs">
                          <div className="truncate text-zinc-800 font-medium" title={`Fabricado por: ${item.fabricated_by || 'Não informado'}`}>
                            <span className="text-[10px] text-zinc-400 font-semibold mr-1">FAB:</span>
                            {item.fabricated_by || '-'}
                          </div>
                          {item.authorized_by && (
                            <div className="truncate text-zinc-500 text-[11px]" title={`Autorizado por: ${item.authorized_by}`}>
                              <span className="text-[10px] text-zinc-400 font-semibold mr-1">AUT:</span>
                              {item.authorized_by}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Laudo ERP (CQ) */}
                      <td className="px-4 py-3 text-center">
                        {hasCompleteFq ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                              <ShieldCheck size={12} />
                              Laudo ERP Completo
                            </span>
                            {item.responsavel_cq_erp && (
                              <span className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[120px]" title={item.responsavel_cq_erp}>
                                {item.responsavel_cq_erp}
                              </span>
                            )}
                          </div>
                        ) : isApprovedAdminOnly ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                              <CheckCircle size={11} />
                              Aprovado sem FQ
                            </span>
                            <span className="text-[9px] text-zinc-400 mt-0.5">Sem medições FQ</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-medium">
                            <Clock size={11} />
                            Pendente ERP
                          </span>
                        )}
                      </td>

                      {/* Parâmetros Medidos (ERP) */}
                      <td className="px-4 py-3">
                        {hasErpQc ? (
                          <div className="flex items-center gap-2 text-xs">
                            {item.ph_erp ? (
                              <span className="bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded text-[11px] font-mono text-zinc-800 font-medium">
                                pH <b>{item.ph_erp}</b>
                              </span>
                            ) : null}
                            {item.viscosidade_erp ? (
                              <span className="bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded text-[11px] font-mono text-zinc-800 font-medium">
                                Visc <b>{item.viscosidade_erp}</b>
                              </span>
                            ) : null}
                            {item.densidade_erp ? (
                              <span className="bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded text-[11px] font-mono text-zinc-800 font-medium">
                                Dens <b>{item.densidade_erp}</b>
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-xs italic">-</span>
                        )}
                      </td>

                      {/* Status NatumHub */}
                      <td className="px-4 py-3 text-center">
                        {item.has_laudo_hub ? (
                          <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <CheckCircle2 size={12} />
                            Laudo no Hub
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-zinc-50 text-zinc-400 border border-zinc-200 px-2 py-0.5 rounded-full text-[10px]">
                            Pendente Hub
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1 cursor-pointer"
                            onClick={() => handleOpenLoteDetails(item)}
                            title="Ver detalhes completos do lote, laudo ERP e matérias-primas"
                          >
                            <Eye size={13} />
                            <span>Ver Laudo ERP</span>
                          </button>

                          {onStartAnalysisWithLote && (
                            <button
                              className="btn-primary !py-1 !px-2.5 text-xs flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer shadow-sm"
                              onClick={() => {
                                onStartAnalysisWithLote(item.product_code, item.lote, item.qty_kg);
                              }}
                              title="Lançar ou atualizar laudo no módulo Físico-Químico"
                            >
                              <FlaskConical size={13} />
                              <span>{item.has_laudo_hub ? 'Editar no Hub' : 'Lançar Laudo'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodapé de Paginação */}
        <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between flex-wrap gap-2 text-xs text-zinc-600">
          <div>
            Mostrando <span className="font-semibold">{items.length}</span> de{' '}
            <span className="font-semibold">{total.toLocaleString('pt-BR')}</span> lotes
          </div>

          <div className="flex items-center gap-2">
            <select
              className="select-filter !py-1 !px-2 text-xs"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={15}>15 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
            </select>

            <div className="flex items-center gap-1">
              <button
                className="btn-secondary !p-1.5 cursor-pointer"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-2 font-medium">
                {page} de {totalPages}
              </span>
              <button
                className="btn-secondary !p-1.5 cursor-pointer"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                title="Próxima página"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Completo de Detalhes do Lote e Laudo ERP */}
      {selectedLote && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLote(null)}
          title={`Ficha do Lote ERP: ${selectedLote.lote} — ${selectedLote.product_name}`}
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* Header info de Produção */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 text-xs">
              <div>
                <div className="text-zinc-400 text-[10px] font-bold uppercase">Código Produto</div>
                <div className="font-mono font-bold text-zinc-900">{selectedLote.product_code}</div>
              </div>
              <div>
                <div className="text-zinc-400 text-[10px] font-bold uppercase">Volume Total</div>
                <div className="font-bold text-zinc-900">{selectedLote.qty_kg} kg {selectedLote.unidades > 0 ? `(${selectedLote.unidades} un)` : ''}</div>
              </div>
              <div>
                <div className="text-zinc-400 text-[10px] font-bold uppercase">Data do Lote</div>
                <div className="font-medium text-zinc-900">{formatDate(selectedLote.date_erp)}</div>
              </div>
              <div>
                <div className="text-zinc-400 text-[10px] font-bold uppercase">Status Produção</div>
                <div className="font-bold text-zinc-900">{selectedLote.status_erp || 'OK'}</div>
              </div>
            </div>

            {/* Informações de Fabricação e Rastreabilidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-50/50 p-3 rounded-xl border border-zinc-200 text-xs">
              <div>
                <span className="text-zinc-400 text-[10px] font-bold uppercase block">Fabricado Por:</span>
                <span className="font-semibold text-zinc-900">{selectedLote.fabricated_by || 'Não informado'}</span>
              </div>
              <div>
                <span className="text-zinc-400 text-[10px] font-bold uppercase block">Autorizado Por:</span>
                <span className="font-semibold text-zinc-900">{selectedLote.authorized_by || 'Não informado'}</span>
              </div>
              {selectedLote.d_pesado && (
                <div>
                  <span className="text-zinc-400 text-[10px] font-bold uppercase block">Data Pesagem:</span>
                  <span className="text-zinc-800">{formatDate(selectedLote.d_pesado)}</span>
                </div>
              )}
              {selectedLote.d_envase && (
                <div>
                  <span className="text-zinc-400 text-[10px] font-bold uppercase block">Data Envase:</span>
                  <span className="text-zinc-800">{formatDate(selectedLote.d_envase)}</span>
                </div>
              )}
            </div>

            {/* Ficha de Controle de Qualidade / Laudo do ERP */}
            {(selectedLote.has_laudo_erp || selectedLote.ph_erp || selectedLote.viscosidade_erp) ? (
              <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-xl text-xs">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold">
                    <ShieldCheck size={16} className="text-emerald-700" />
                    <span>Laudo / Controle de Qualidade do ERP</span>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200">
                    {selectedLote.resultado_cq_erp === 'AP' ? 'Aprovado no ERP' : `Resultado: ${selectedLote.resultado_cq_erp || 'OK'}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-emerald-950 mb-2">
                  <div className="bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                    <span className="text-emerald-700 text-[10px] block font-semibold">pH Medido (ERP):</span>
                    <span className="font-mono font-bold text-sm">{selectedLote.ph_erp ?? '-'}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                    <span className="text-emerald-700 text-[10px] block font-semibold">Viscosidade (ERP):</span>
                    <span className="font-mono font-bold text-sm">{selectedLote.viscosidade_erp ? `${selectedLote.viscosidade_erp} cP` : '-'}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                    <span className="text-emerald-700 text-[10px] block font-semibold">Densidade (ERP):</span>
                    <span className="font-mono font-bold text-sm">{selectedLote.densidade_erp ? `${selectedLote.densidade_erp} g/cm³` : '-'}</span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                    <span className="text-emerald-700 text-[10px] block font-semibold">Responsável CQ:</span>
                    <span className="font-semibold text-xs truncate block" title={selectedLote.responsavel_cq_erp || ''}>
                      {selectedLote.responsavel_cq_erp || '-'}
                    </span>
                  </div>
                </div>

                {selectedLote.data_inspecao_erp && (
                  <div className="text-[11px] text-emerald-800">
                    Data da Inspeção / Laudo: <b>{formatDate(selectedLote.data_inspecao_erp)}</b>
                  </div>
                )}
                {selectedLote.observacoes_erp && (
                  <div className="mt-2 p-2 bg-white/60 rounded border border-emerald-200/50 text-[11px] text-emerald-900">
                    <b>Observações:</b> {selectedLote.observacoes_erp}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl flex items-center gap-2.5 text-amber-900 text-xs">
                <Clock size={16} className="text-amber-600 shrink-0" />
                <span>Nenhum laudo ou medição de controle de qualidade registrado no ERP para este lote.</span>
              </div>
            )}

            {/* Laudo no NatumHub se houver */}
            {selectedLote.has_laudo_hub && (
              <div className="bg-indigo-50/70 border border-indigo-200 p-3 rounded-xl text-xs text-indigo-950">
                <div className="flex items-center gap-2 text-indigo-900 font-bold mb-1.5">
                  <FlaskConical size={15} className="text-indigo-700" />
                  <span>Laudo Registrado no NatumHub</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-indigo-700 text-[10px] block">pH:</span>
                    <span className="font-bold">{selectedLote.ph_measured ?? '-'}</span>
                  </div>
                  <div>
                    <span className="text-indigo-700 text-[10px] block">Viscosidade:</span>
                    <span className="font-bold">{selectedLote.viscosity_measured ?? '-'}</span>
                  </div>
                  <div>
                    <span className="text-indigo-700 text-[10px] block">Densidade:</span>
                    <span className="font-bold">{selectedLote.density_measured ?? '-'}</span>
                  </div>
                  <div>
                    <span className="text-indigo-700 text-[10px] block">Técnico:</span>
                    <span className="font-medium">{selectedLote.technician ?? '-'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Insumos e matérias-primas baixadas no ERP */}
            <div>
              <h4 className="font-bold text-xs text-zinc-900 mb-2 flex items-center gap-1.5">
                <Layers size={14} className="text-zinc-500" />
                <span>Matérias-Primas e Insumos Baixados no Lote ({loteInsumos.length})</span>
              </h4>

              {loadingInsumos ? (
                <div className="p-8 text-center text-zinc-400 text-xs">
                  <RefreshCw className="animate-spin mx-auto mb-2" size={20} />
                  <span>Buscando insumos do lote...</span>
                </div>
              ) : loteInsumos.length === 0 ? (
                <div className="p-6 bg-zinc-50 rounded-xl border border-zinc-200 text-center text-zinc-500 text-xs">
                  Nenhum registro individual de insumo baixado encontrado para este lote.
                </div>
              ) : (
                <div className="border border-zinc-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-50 border-b border-zinc-200 font-semibold text-zinc-600 text-[10px] uppercase">
                      <tr>
                        <th className="px-3 py-2">Código</th>
                        <th className="px-3 py-2">Descrição do Insumo</th>
                        <th className="px-3 py-2 text-right">Quantidade</th>
                        <th className="px-3 py-2">Data Baixa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {loteInsumos.map((ins, idx) => (
                        <tr key={`${ins.item_code}-${idx}`} className="hover:bg-zinc-50">
                          <td className="px-3 py-2 font-mono font-semibold text-zinc-800">{ins.item_code}</td>
                          <td className="px-3 py-2 text-zinc-700">{ins.item_description}</td>
                          <td className="px-3 py-2 text-right font-bold text-zinc-900">
                            {ins.quantity.toLocaleString('pt-BR')} {ins.unit || ''}
                          </td>
                          <td className="px-3 py-2 text-zinc-500">{formatDate(ins.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
              <button className="btn-secondary text-xs cursor-pointer" onClick={() => setSelectedLote(null)}>
                Fechar
              </button>

              {onStartAnalysisWithLote && (
                <button
                  className="btn-primary text-xs flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer"
                  onClick={() => {
                    const lote = selectedLote;
                    setSelectedLote(null);
                    onStartAnalysisWithLote(lote.product_code, lote.lote, lote.qty_kg);
                  }}
                >
                  <FlaskConical size={14} />
                  <span>{selectedLote.has_laudo_hub ? 'Abrir no Físico-Químico' : 'Lançar Laudo no Hub com este Lote'}</span>
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
