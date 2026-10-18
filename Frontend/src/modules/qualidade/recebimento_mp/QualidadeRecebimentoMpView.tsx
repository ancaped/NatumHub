import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  ClipboardCheck,
  Beaker,
  Search,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  Eye,
  Trash2,
  Tag,
  FileText,
} from 'lucide-react';
import AppLayout from '../../geral/components/layout/AppLayout';
import StatCard from '../../geral/components/ui/StatCard';
import { apiFetch, apiJson } from '../../geral/lib/http';
import type { RecebimentoErpItem, LaudoItem, AmostraItem } from './types';
import GerarLaudoModal from './components/GerarLaudoModal';
import ImprimirEtiquetasBombonaModal from './components/ImprimirEtiquetasBombonaModal';
import VisualizarLaudoModal from './components/VisualizarLaudoModal';
import NovaAmostraModal from './components/NovaAmostraModal';
import ImprimirLaudoModal from './components/ImprimirLaudoModal';
import { printLaudoA4, printMultipleLaudosA4 } from './lib/printLaudoA4';

interface Props {
  onBackToHub: () => void;
  currentUserName?: string;
}

type TabType = 'entradas' | 'laudos' | 'amostras';

export default function QualidadeRecebimentoMpView({ onBackToHub, currentUserName }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('entradas');

  // Dados
  const [erpItems, setErpItems] = useState<RecebimentoErpItem[]>([]);
  const [laudos, setLaudos] = useState<LaudoItem[]>([]);
  const [amostras, setAmostras] = useState<AmostraItem[]>([]);

  // Carregamento e filtros
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [classificacaoFilter, setClassificacaoFilter] = useState<'MATERIA_PRIMA' | 'EMBALAGENS' | 'ROTULOS' | 'TODOS'>('MATERIA_PRIMA');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(250);
  const [parecerFilter, setParecerFilter] = useState<string>('TODOS');
  const [statusAmostraFilter, setStatusAmostraFilter] = useState<string>('TODAS');
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modais
  const [modalGerarLaudoItem, setModalGerarLaudoItem] = useState<RecebimentoErpItem | null>(null);
  const [modalEtiquetaItem, setModalEtiquetaItem] = useState<RecebimentoErpItem | null>(null);
  const [modalVisualizarLaudo, setModalVisualizarLaudo] = useState<LaudoItem | null>(null);
  const [modalImprimirLaudo, setModalImprimirLaudo] = useState<LaudoItem | null>(null);
  const [modalNovaAmostraOpen, setModalNovaAmostraOpen] = useState(false);
  const [modalNovaAmostraInitial, setModalNovaAmostraInitial] = useState<any>(null);

  // Carrega logo para os laudos impressos
  useEffect(() => {
    let active = true;
    const fetchLogo = async () => {
      try {
        const res = await apiFetch('/settings/report-logo');
        if (res.ok) {
          const blob = await res.blob();
          if (active) {
            setLogoSrc(URL.createObjectURL(blob));
          }
        }
      } catch {
        // Sem logo personalizada cadastrada
      }
    };
    fetchLogo();
    return () => {
      active = false;
    };
  }, []);

  // Busca dados do ERP (PostgreSQL) com suporte a classificação e paginação
  const loadErpItems = useCallback(
    async (
      search = searchTerm,
      classFilter = classificacaoFilter,
      currentPage = page,
      limit = pageSize
    ) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (classFilter !== 'TODOS') params.set('classificacao', classFilter);
        params.set('limit', String(limit));
        params.set('offset', String((currentPage - 1) * limit));

        const data = await apiJson<RecebimentoErpItem[]>(
          `/api/qualidade/recebimento-mp/erp?${params.toString()}`
        );
        setErpItems(data);
      } catch (e: any) {
        console.error('Erro buscando recebimentos ERP:', e);
        setError(e.message || 'Falha ao buscar recebimentos do ERP');
      } finally {
        setLoading(false);
      }
    },
    [searchTerm, classificacaoFilter, page, pageSize]
  );

  const handleClassificacaoChange = (newVal: 'MATERIA_PRIMA' | 'EMBALAGENS' | 'ROTULOS' | 'TODOS') => {
    setClassificacaoFilter(newVal);
    setPage(1);
    loadErpItems(searchTerm, newVal, 1, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    loadErpItems(searchTerm, classificacaoFilter, 1, newSize);
  };

  const handlePrevPage = () => {
    if (page > 1) {
      const p = page - 1;
      setPage(p);
      loadErpItems(searchTerm, classificacaoFilter, p, pageSize);
    }
  };

  const handleNextPage = () => {
    const p = page + 1;
    setPage(p);
    loadErpItems(searchTerm, classificacaoFilter, p, pageSize);
  };

  // Busca laudos emitidos
  const loadLaudos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<LaudoItem[]>('/api/qualidade/recebimento-mp/laudos');
      setLaudos(data);
    } catch (e: any) {
      console.error('Erro buscando laudos:', e);
      setError(e.message || 'Falha ao buscar laudos emitidos');
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca contraprovas retidas
  const loadAmostras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<AmostraItem[]>('/api/qualidade/recebimento-mp/amostras');
      setAmostras(data);
    } catch (e: any) {
      console.error('Erro buscando amostras:', e);
      setError(e.message || 'Falha ao buscar contraprovas');
    } finally {
      setLoading(false);
    }
  }, []);

  // Sincroniza dados com SQL Server (Passo Q)
  const handleSyncErp = async () => {
    setSyncing(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiJson<{ success?: boolean; synced?: number; message?: string }>(
        '/api/qualidade/recebimento-mp/sync',
        { method: 'POST' }
      );
      setAviso(res.message || `${res.synced ?? 0} registros sincronizados do ERP.`);
      await loadErpItems(searchTerm, classificacaoFilter, page, pageSize);
      await loadLaudos();
    } catch (e: any) {
      setError('Erro na sincronização com ERP: ' + (e.message || 'Falha na conexão'));
    } finally {
      setSyncing(false);
    }
  };

  // Recarrega conforme aba ativa
  useEffect(() => {
    if (activeTab === 'entradas') {
      loadErpItems(searchTerm, classificacaoFilter, page, pageSize);
    } else if (activeTab === 'laudos') {
      loadLaudos();
    } else if (activeTab === 'amostras') {
      loadAmostras();
    }
  }, [activeTab]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'entradas') {
      setPage(1);
      loadErpItems(searchTerm, classificacaoFilter, 1, pageSize);
    }
  };

  // Callback ao salvar novo laudo
  const handleLaudoSaved = (savedLaudo: LaudoItem, andPrint: boolean) => {
    setErpItems((prev) =>
      prev.map((it) =>
        it.registro === savedLaudo.registro_erp
          ? {
              ...it,
              laudo_id: savedLaudo.id,
              codigo_laudo: savedLaudo.codigo_laudo,
              laudo_parecer: savedLaudo.parecer,
            }
          : it
      )
    );
    setLaudos((prev) => [savedLaudo, ...prev]);
    setAviso(`Laudo ${savedLaudo.codigo_laudo} emitido com sucesso.`);

    if (andPrint) {
      setModalImprimirLaudo(savedLaudo);
    }
  };

  // Callback ao atualizar laudo existente
  const handleLaudoUpdated = (updated: LaudoItem) => {
    setLaudos((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setErpItems((prev) =>
      prev.map((it) =>
        it.registro === updated.registro_erp
          ? { ...it, laudo_parecer: updated.parecer }
          : it
      )
    );
    setAviso(`Laudo ${updated.codigo_laudo} atualizado com sucesso.`);
  };

  // Callback ao excluir laudo
  const handleLaudoDeleted = (id: number | string) => {
    setLaudos((prev) => prev.filter((l) => l.id !== id));
    setErpItems((prev) =>
      prev.map((it) =>
        it.laudo_id === id
          ? { ...it, laudo_id: null, codigo_laudo: null, laudo_parecer: null }
          : it
      )
    );
    setAviso('Laudo excluído com sucesso.');
  };

  // Callback ao excluir amostra
  const handleDeleteAmostra = async (id: number | string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta amostra de retenção?')) return;
    try {
      await apiJson(`/api/qualidade/recebimento-mp/amostras/${id}`, { method: 'DELETE' });
      setAmostras((prev) => prev.filter((a) => a.id !== id));
      setAviso('Amostra de retenção removida.');
    } catch (e: any) {
      alert('Erro ao excluir amostra: ' + (e.message || 'Falha'));
    }
  };

  // Filtros locais para Laudos e Amostras
  const filteredLaudos = useMemo(() => {
    return laudos.filter((l) => {
      const matchParecer = parecerFilter === 'TODOS' || l.parecer === parecerFilter;
      const matchTerm =
        !searchTerm.trim() ||
        l.codigo_laudo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.insumo_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.lote_fornecedor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.fornecedor_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.codigo_receb.toLowerCase().includes(searchTerm.toLowerCase());
      return matchParecer && matchTerm;
    });
  }, [laudos, parecerFilter, searchTerm]);

  const filteredAmostras = useMemo(() => {
    return amostras.filter((a) => {
      const matchStatus = statusAmostraFilter === 'TODAS' || a.status === statusAmostraFilter;
      const matchTerm =
        !searchTerm.trim() ||
        a.codigo_amostra.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.insumo_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.lote.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.fornecedor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.localizacao.toLowerCase().includes(searchTerm.toLowerCase());
      return matchStatus && matchTerm;
    });
  }, [amostras, statusAmostraFilter, searchTerm]);

  // Contagens para os KPIs
  const comLaudoCount = useMemo(() => {
    return erpItems.filter((i) => i.laudo_id != null).length;
  }, [erpItems]);

  const pendentesCount = useMemo(() => {
    return erpItems.filter((i) => i.laudo_id == null).length;
  }, [erpItems]);

  const parecerBadge = (p: string | null | undefined) => {
    if (!p) return null;
    if (p === 'APROVADO') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          {p}
        </span>
      );
    }
    if (p === 'QUARENTENA') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" />
          {p}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
        <AlertTriangle className="w-3 h-3" />
        {p}
      </span>
    );
  };


  return (
    <AppLayout
      moduleTitle="Recebimento de MP"
      onBackToHub={onBackToHub}
      sidebarItems={[
        {
          id: 'entradas',
          label: 'Entradas ERP',
          icon: Layers,
          badge: erpItems.length || undefined,
        },
        {
          id: 'laudos',
          label: 'Laudos CQ',
          icon: ClipboardCheck,
          badge: laudos.length || undefined,
        },
        {
          id: 'amostras',
          label: 'Contraprovas',
          icon: Beaker,
          badge: amostras.length || undefined,
        },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as TabType);
        setAviso(null);
      }}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'amostras' && (
            <button
              type="button"
              onClick={() => {
                setModalNovaAmostraInitial(null);
                setModalNovaAmostraOpen(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shadow-xs transition"
            >
              <Plus className="h-4 w-4" />
              <span>Nova Contraprova</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSyncErp}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 cursor-pointer shadow-xs transition disabled:opacity-50"
            title="Importar novos recebimentos do SQL Server"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-zinc-600 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Sincronizando...' : 'Sincronizar ERP'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeTab === 'entradas') loadErpItems(searchTerm);
              else if (activeTab === 'laudos') loadLaudos();
              else loadAmostras();
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 cursor-pointer shadow-xs transition disabled:opacity-50"
            title="Recarregar dados da tela"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Notificações e Alertas */}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold p-3.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {aviso && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold p-3.5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{aviso}</span>
          </div>
        )}

        {/* Top KPI Cards Estilo Natum */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="Entradas ERP"
            value={erpItems.length}
            description="Recebimentos importados"
            icon={Layers}
            onClick={() => setActiveTab('entradas')}
          />
          <StatCard
            title="Laudos CQ"
            value={comLaudoCount || laudos.length}
            description="Inspecionados e aprovados"
            icon={CheckCircle2}
            onClick={() => setActiveTab('laudos')}
          />
          <StatCard
            title="Pendentes CQ"
            value={pendentesCount}
            description="Aguardando inspeção"
            icon={Clock}
            onClick={() => setActiveTab('entradas')}
          />
          <StatCard
            title="Contraprovas"
            value={amostras.length}
            description="Amostras guardadas"
            icon={Beaker}
            onClick={() => setActiveTab('amostras')}
          />
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="flex-1 w-full md:w-auto relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === 'entradas'
                  ? 'Buscar por insumo, lote, fornecedor, NF, cód. MP... (Pressione Enter)'
                  : activeTab === 'laudos'
                  ? 'Filtrar laudos por código, insumo, lote ou NF...'
                  : 'Filtrar amostras por código, insumo, lote ou armário...'
              }
              className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {activeTab === 'entradas' && (
              <>
                <div className="inline-flex rounded-xl bg-zinc-100 p-0.5 border border-zinc-200 text-xs">
                  <button
                    type="button"
                    onClick={() => handleClassificacaoChange('MATERIA_PRIMA')}
                    className={`px-3 py-1 font-bold rounded-lg transition-all cursor-pointer ${
                      classificacaoFilter === 'MATERIA_PRIMA'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Matérias-Primas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClassificacaoChange('EMBALAGENS')}
                    className={`px-3 py-1 font-bold rounded-lg transition-all cursor-pointer ${
                      classificacaoFilter === 'EMBALAGENS'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Embalagens
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClassificacaoChange('ROTULOS')}
                    className={`px-3 py-1 font-bold rounded-lg transition-all cursor-pointer ${
                      classificacaoFilter === 'ROTULOS'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Rótulos
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClassificacaoChange('TODOS')}
                    className={`px-3 py-1 font-bold rounded-lg transition-all cursor-pointer ${
                      classificacaoFilter === 'TODOS'
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Todos
                  </button>
                </div>

                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900 font-semibold text-zinc-700 cursor-pointer"
                  title="Itens por página"
                >
                  <option value={100}>100 / pág</option>
                  <option value={250}>250 / pág</option>
                  <option value={500}>500 / pág</option>
                </select>
              </>
            )}

            {activeTab === 'laudos' && (
              <>
                <select
                  value={parecerFilter}
                  onChange={(e) => setParecerFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                >
                  <option value="TODOS">Todos os Pareceres</option>
                  <option value="APROVADO">Aprovados</option>
                  <option value="QUARENTENA">Em Quarentena</option>
                  <option value="REPROVADO">Reprovados</option>
                </select>

                {filteredLaudos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => printMultipleLaudosA4(filteredLaudos, logoSrc)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl shadow-xs transition cursor-pointer"
                    title="Imprimir todos os laudos filtrados (2 por folha A4)"
                  >
                    <Printer className="w-3.5 h-3.5 text-zinc-600" />
                    <span>Imprimir Lote ({filteredLaudos.length})</span>
                  </button>
                )}
              </>
            )}

            {activeTab === 'amostras' && (
              <select
                value={statusAmostraFilter}
                onChange={(e) => setStatusAmostraFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
              >
                <option value="TODAS">Todos os Status</option>
                <option value="RETIDA">Retidas (Guardadas)</option>
                <option value="EM_ANALISE">Em Análise</option>
                <option value="DESCARTADA">Descartadas</option>
              </select>
            )}
          </div>
        </div>

        {/* CONTEÚDO DAS ABAS */}

        {/* ABA 1: ENTRADAS ERP */}
        {activeTab === 'entradas' && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-12 text-center">Status</th>
                    <th className="px-4 py-3">Registro / Entrada</th>
                    <th className="px-4 py-3">Insumo / Matéria-Prima</th>
                    <th className="px-4 py-3">Fornecedor / NF</th>
                    <th className="px-4 py-3">Lote</th>
                    <th className="px-4 py-3">Validade</th>
                    <th className="px-4 py-3 text-right">Quantidade</th>
                    <th className="px-4 py-3 text-center">Cód. Receb.</th>
                    <th className="px-4 py-3 text-center">Laudo CQ</th>
                    <th className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {loading && erpItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-600" />
                        Consultando recebimentos de insumos no banco de dados...
                      </td>
                    </tr>
                  ) : erpItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                        Nenhum recebimento encontrado. Clique em "Sincronizar ERP" para buscar do SQL Server.
                      </td>
                    </tr>
                  ) : (
                    erpItems.map((item) => (
                      <tr key={item.registro} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200">
                            {item.status_erp || 'AP'}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-zinc-900 block">
                            #{item.registro}
                          </span>
                          <span className="text-[11px] text-zinc-500 font-mono">{item.data_entrada}</span>
                        </td>

                        <td className="px-4 py-3 max-w-[280px]">
                          <span className="font-bold text-zinc-900 block truncate" title={item.insumo_desc}>
                            {item.insumo_desc}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Ref: {item.codigo_ref}
                            </span>
                            {item.classificacao === 'MATERIA_PRIMA' && (
                              <span className="px-1.5 py-0.2 text-[8px] font-black uppercase rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                MP
                              </span>
                            )}
                            {item.classificacao === 'EMBALAGENS' && (
                              <span className="px-1.5 py-0.2 text-[8px] font-black uppercase rounded bg-blue-50 text-blue-700 border border-blue-200">
                                EMB
                              </span>
                            )}
                            {item.classificacao === 'ROTULOS' && (
                              <span className="px-1.5 py-0.2 text-[8px] font-black uppercase rounded bg-purple-50 text-purple-700 border border-purple-200">
                                RÓT
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 max-w-[200px]">
                          <span className="text-zinc-800 block truncate" title={item.fornecedor}>
                            {item.fornecedor}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            NF: <strong className="font-mono text-zinc-700">{item.nota}</strong>
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-zinc-900">
                            {item.lote_fornec}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-zinc-700 font-mono">
                          {item.data_validade || '—'}
                        </td>

                        <td className="px-4 py-3 text-right whitespace-nowrap font-mono font-bold text-zinc-900">
                          {item.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{' '}
                          <span className="text-[10px] text-zinc-500 font-sans">{item.unidade}</span>
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-800">
                            {item.codigo_receb}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {item.laudo_id ? (
                            <button
                              type="button"
                              onClick={() => {
                                const found = laudos.find((l) => String(l.id) === String(item.laudo_id));
                                if (found) {
                                  setModalVisualizarLaudo(found);
                                } else {
                                  apiJson<LaudoItem>(`/api/qualidade/recebimento-mp/laudos/${item.laudo_id}`).then(
                                    (res) => setModalVisualizarLaudo(res)
                                  );
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition shadow-xs"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span className="font-mono">{item.codigo_laudo || 'Ver Laudo'}</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-zinc-400 font-semibold italic">
                              Pendente
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setModalGerarLaudoItem(item)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-xs transition"
                              title="Gerar Laudo FOR-CQL-036"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Laudo CQ
                            </button>

                            <button
                              type="button"
                              onClick={() => setModalEtiquetaItem(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg shadow-xs transition"
                              title="Imprimir Etiquetas de Bombona"
                            >
                              <Tag className="w-3.5 h-3.5 text-zinc-600" />
                              Etiquetas
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé de Paginação */}
            <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
              <div className="flex items-center gap-2">
                <span>
                  Mostrando <strong>{erpItems.length}</strong> registro(s) na página <strong>{page}</strong>
                </span>
                <span className="text-zinc-400">•</span>
                <span className="text-zinc-500">
                  Classificação:{' '}
                  <strong className="text-zinc-800">
                    {classificacaoFilter === 'MATERIA_PRIMA'
                      ? 'Matérias-Primas'
                      : classificacaoFilter === 'EMBALAGENS'
                      ? 'Embalagens'
                      : classificacaoFilter === 'ROTULOS'
                      ? 'Rótulos'
                      : 'Todos os Insumos'}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={handlePrevPage}
                  className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl font-bold text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
                >
                  Página Anterior
                </button>
                <span className="font-mono font-bold px-2 text-zinc-800">
                  {page}
                </span>
                <button
                  type="button"
                  disabled={erpItems.length < pageSize || loading}
                  onClick={handleNextPage}
                  className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl font-bold text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
                >
                  Próxima Página
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: LAUDOS EMITIDOS */}
        {activeTab === 'laudos' && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Código Laudo</th>
                    <th className="px-4 py-3">Data Análise</th>
                    <th className="px-4 py-3">Insumo / Matéria-Prima</th>
                    <th className="px-4 py-3">Fornecedor / NF</th>
                    <th className="px-4 py-3">Lote</th>
                    <th className="px-4 py-3">Cód. Receb.</th>
                    <th className="px-4 py-3 text-center">Parecer</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {loading && laudos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-600" />
                        Carregando laudos emitidos...
                      </td>
                    </tr>
                  ) : filteredLaudos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                        Nenhum laudo encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredLaudos.map((laudo) => (
                      <tr key={laudo.id} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-zinc-900 block">
                            {laudo.codigo_laudo}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">Entrada #{laudo.registro_erp}</span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-zinc-700 font-mono">
                          {laudo.data_analise ? laudo.data_analise.split('-').reverse().join('/') : '—'}
                        </td>

                        <td className="px-4 py-3 max-w-[260px]">
                          <span className="font-bold text-zinc-900 block truncate">
                            {laudo.insumo_nome}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            Ref: {laudo.codigo_ref}
                          </span>
                        </td>

                        <td className="px-4 py-3 max-w-[200px]">
                          <span className="text-zinc-800 block truncate">
                            {laudo.fornecedor_nome}
                          </span>
                          <span className="text-[10px] text-zinc-500">NF: <strong className="font-mono">{laudo.nota_fiscal}</strong></span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-zinc-900">
                          {laudo.lote_fornecedor}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-zinc-600">
                          {laudo.codigo_receb}
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {parecerBadge(laudo.parecer)}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-zinc-700">
                          {laudo.responsavel_cq || '—'}
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setModalImprimirLaudo(laudo)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl shadow-xs transition cursor-pointer"
                              title="Imprimir 2 laudos por folha A4"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Imprimir A4
                            </button>

                            <button
                              type="button"
                              onClick={() => setModalVisualizarLaudo(laudo)}
                              className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition cursor-pointer"
                              title="Visualizar ou editar laudo"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ABA 3: AMOSTRAS / CONTRAPROVAS */}
        {activeTab === 'amostras' && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Código Amostra</th>
                    <th className="px-4 py-3">Insumo / Matéria-Prima</th>
                    <th className="px-4 py-3">Lote</th>
                    <th className="px-4 py-3">Fornecedor</th>
                    <th className="px-4 py-3">Data Coleta</th>
                    <th className="px-4 py-3">Validade Retenção</th>
                    <th className="px-4 py-3">Localização</th>
                    <th className="px-4 py-3">Quantidade</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {loading && amostras.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-zinc-600" />
                        Carregando contraprovas de matérias-primas...
                      </td>
                    </tr>
                  ) : filteredAmostras.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                        Nenhuma amostra de retenção cadastrada com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    filteredAmostras.map((amostra) => (
                      <tr key={amostra.id} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-zinc-900 block">
                            {amostra.codigo_amostra}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">{amostra.codigo_receb}</span>
                        </td>

                        <td className="px-4 py-3 max-w-[260px]">
                          <span className="font-bold text-zinc-900 block truncate">
                            {amostra.insumo_nome}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-zinc-900">
                          {amostra.lote}
                        </td>

                        <td className="px-4 py-3 max-w-[180px] text-zinc-700 truncate">
                          {amostra.fornecedor}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-zinc-700 font-mono">
                          {amostra.data_coleta ? amostra.data_coleta.split('-').reverse().join('/') : '—'}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-zinc-700 font-mono">
                          {amostra.data_validade_retencao
                            ? amostra.data_validade_retencao.split('-').reverse().join('/')
                            : '—'}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-zinc-800">
                          {amostra.localizacao || 'Armário CQ'}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap font-mono font-medium text-zinc-700">
                          {amostra.quantidade_amostra || '100 g / mL'}
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-lg border ${
                              amostra.status === 'RETIDA'
                                ? 'bg-zinc-100 text-zinc-800 border-zinc-200'
                                : amostra.status === 'EM_ANALISE'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {amostra.status}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteAmostra(amostra.id)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Excluir amostra"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAIS */}
      <GerarLaudoModal
        isOpen={Boolean(modalGerarLaudoItem)}
        onClose={() => setModalGerarLaudoItem(null)}
        erpItem={modalGerarLaudoItem}
        onSaved={handleLaudoSaved}
        currentUserName={currentUserName}
      />

      <ImprimirEtiquetasBombonaModal
        isOpen={Boolean(modalEtiquetaItem)}
        onClose={() => setModalEtiquetaItem(null)}
        erpItem={modalEtiquetaItem}
      />

      <VisualizarLaudoModal
        isOpen={Boolean(modalVisualizarLaudo)}
        onClose={() => setModalVisualizarLaudo(null)}
        laudo={modalVisualizarLaudo}
        onUpdated={handleLaudoUpdated}
        onPrint={(l) => setModalImprimirLaudo(l)}
        onDelete={handleLaudoDeleted}
      />

      <ImprimirLaudoModal
        isOpen={Boolean(modalImprimirLaudo)}
        onClose={() => setModalImprimirLaudo(null)}
        primaryLaudo={modalImprimirLaudo}
        allLaudos={laudos}
        logoSrc={logoSrc}
      />

      <NovaAmostraModal
        isOpen={modalNovaAmostraOpen}
        onClose={() => setModalNovaAmostraOpen(false)}
        initialData={modalNovaAmostraInitial}
        currentUserName={currentUserName}
        onSaved={(newSample) => {
          setAmostras((prev) => [newSample, ...prev]);
          setAviso(`Contraprova ${newSample.codigo_amostra} cadastrada com sucesso.`);
        }}
      />
    </AppLayout>
  );
}
