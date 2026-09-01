import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  Plus,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  BookOpen,
} from 'lucide-react';
import type { ProcItem, ProcSummaryMetrics } from '../../geral/lib/types';
import { api } from '../../geral/lib/api';
import AppLayout from '../../geral/components/layout/AppLayout';
import { ProcModal } from './components/ProcModal';
import { ProcGeneratorModal } from './components/ProcGeneratorModal';

interface ProcViewProps {
  onBackToHub?: () => void;
  onNavigate?: (view: string) => void;
}

const FAMILIES = [
  { key: 'ALL', label: 'Todas as Famílias' },
  { key: 'SPRAY_FINALIZADOR', label: 'Spray e Finalizador' },
  { key: 'SHAMPOO', label: 'Shampoo Capilar' },
  { key: 'MASCARA_TRATAMENTO', label: 'Máscara e Creme' },
  { key: 'CONDICIONADOR', label: 'Condicionador e Bálsamo' },
  { key: 'OLEO_SERUM', label: 'Óleo e Sérum' },
  { key: 'TONICO_LOCAO', label: 'Tônico e Loção' },
  { key: 'OXIDANTE_AOX', label: 'Emulsão Oxidante (AOX)' },
  { key: 'TRANSFORMACAO_ALISAMENTO', label: 'Transformação / Alisamento' },
  { key: 'AMPOLA_DOSE', label: 'Ampola e Dose' },
  { key: 'GEL_POMADA', label: 'Pomada e Gel' },
  { key: 'PO_DESCOLORANTE', label: 'Pó Descolorante' },
  { key: 'ATIVADOR_FINALIZADOR', label: 'Ativador' },
  { key: 'NEUTRALIZANTE', label: 'Neutralizante' },
  { key: 'OUTROS', label: 'Outros Cosméticos' },
];

export function isProcNoRotulo(item?: ProcItem | null): boolean {
  if (!item || !item.proc || item.status === 'EM_BRANCO') return false;
  const obs = (item.observacoes || '').trim().toUpperCase();
  if (obs.includes('TEM NO') && !obs.includes('NÃO') && !obs.includes('NAO')) {
    return true;
  }
  return obs === 'SIM' || obs === 'NO ROTULO' || obs === 'NO RÓTULO';
}

export function isProcForaDoRotulo(item?: ProcItem | null): boolean {
  if (!item || !item.proc || item.status === 'EM_BRANCO') return false;
  // Se possui PROC válido e NÃO está marcado como 'TEM NO RÓTULO' (ou seja, estava em branco na planilha ou marcado como não tem),
  // então NÃO consta no rótulo gráfico e precisa ser anotado no lote!
  return !isProcNoRotulo(item);
}

export const ProcView: React.FC<ProcViewProps> = ({ onBackToHub, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'procs' | 'generator' | 'novo'>('procs');
  const [procs, setProcs] = useState<ProcItem[]>([]);
  const [metrics, setMetrics] = useState<ProcSummaryMetrics>({
    total: 0,
    ativos: 0,
    emBranco: 0,
    familias: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FORA_ROTULO' | 'NO_ROTULO' | 'EM_BRANCO'>('ALL');
  const [familyFilter, setFamilyFilter] = useState('ALL');

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [generatorModalOpen, setGeneratorModalOpen] = useState(false);
  const [procToEdit, setProcToEdit] = useState<ProcItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    (window as any).__current_page__ = 'Processos de Fabricação (PROC)';
  }, []);

  const fetchProcs = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.getProcs({
        limit: 500,
      });
      setProcs(resp.items || []);
      setMetrics(resp.metrics || { total: 0, ativos: 0, emBranco: 0, familias: 0 });
    } catch (err) {
      console.error('Erro ao buscar PROCs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProcs();
  }, [fetchProcs]);

  // Contagens dinâmicas
  const counts = useMemo(() => {
    let foraRotulo = 0;
    let noRotulo = 0;
    let emBranco = 0;
    let ativos = 0;

    for (const p of procs) {
      if (p.status === 'EM_BRANCO' || !p.proc) {
        emBranco++;
      } else {
        ativos++;
        if (isProcForaDoRotulo(p)) {
          foraRotulo++;
        } else if (isProcNoRotulo(p)) {
          noRotulo++;
        }
      }
    }

    return {
      total: procs.length,
      ativos,
      foraRotulo,
      noRotulo,
      emBranco,
    };
  }, [procs]);

  // Filtros locais em memória O(1) rápidos
  const filteredProcs = useMemo(() => {
    let list = procs;

    // Filtro por texto
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const desc = (p.descricao || '').toLowerCase();
        const code = (p.codigoProduto || '').toLowerCase();
        const procNum = (p.proc || '').toLowerCase();
        return desc.includes(q) || code.includes(q) || procNum.includes(q);
      });
    }

    // Filtro por Condição do Rótulo
    if (statusFilter === 'FORA_ROTULO') {
      list = list.filter((p) => isProcForaDoRotulo(p));
    } else if (statusFilter === 'NO_ROTULO') {
      list = list.filter((p) => isProcNoRotulo(p));
    } else if (statusFilter === 'EM_BRANCO') {
      list = list.filter((p) => p.status === 'EM_BRANCO' || !p.proc);
    }

    // Filtro por Família
    if (familyFilter !== 'ALL') {
      list = list.filter((p) => p.categoriaFamilia === familyFilter);
    }

    return list;
  }, [procs, search, statusFilter, familyFilter]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredProcs.length / pageSize));
  const paginatedProcs = useMemo(() => {
    if (pageSize >= 999) return filteredProcs;
    const start = (currentPage - 1) * pageSize;
    return filteredProcs.slice(start, start + pageSize);
  }, [filteredProcs, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, familyFilter, pageSize]);

  const handleCopyProc = (procVal: string, id: string) => {
    navigator.clipboard.writeText(procVal);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleEdit = (item: ProcItem) => {
    setProcToEdit(item);
    setModalOpen(true);
  };

  const handleCreate = () => {
    setProcToEdit(null);
    setModalOpen(true);
  };

  const handleDelete = async (item: ProcItem) => {
    if (!confirm(`Deseja realmente excluir o PROC de "${item.descricao}"?`)) return;
    try {
      await api.deleteProc(item.id);
      fetchProcs();
    } catch (err: any) {
      alert('Erro ao excluir PROC: ' + (err?.message || 'Falha na requisição.'));
    }
  };

  const sidebarItems = [
    { id: 'procs', label: 'Processos ANVISA', icon: FileText },
    { id: 'generator', label: 'Gerador Inteligente', icon: Sparkles },
    { id: 'novo', label: 'Novo Processo', icon: Plus },
  ];

  const headerActions = (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2.5 py-1 bg-zinc-100 text-zinc-700 rounded-lg font-bold">
          Total: <strong className="text-zinc-950">{counts.total}</strong>
        </span>
        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-bold">
          Ativos: <strong className="text-emerald-950">{counts.ativos}</strong>
        </span>
        <span className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg font-bold" title="Requer anotação no lote">
          Fora do Rótulo: <strong className="text-amber-950">{counts.foraRotulo}</strong>
        </span>
      </div>

      <button
        type="button"
        onClick={fetchProcs}
        className="p-1.5 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
        title="Atualizar lista"
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );

  const handleBack = () => {
    if (onBackToHub) {
      onBackToHub();
    } else if (onNavigate) {
      onNavigate('producao_hub');
    }
  };

  return (
    <AppLayout
      moduleTitle="Processos de Fabricação (PROC)"
      onBackToHub={handleBack}
      sidebarItems={sidebarItems}
      activeTab={activeTab}
      onTabChange={(id: any) => {
        if (id === 'novo') {
          handleCreate();
        } else if (id === 'generator') {
          setGeneratorModalOpen(true);
        } else {
          setActiveTab(id);
        }
      }}
      headerActions={headerActions}
    >
      <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
        
        {/* Barra de Filtros e Busca */}
        <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Busca */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por descrição, código ou processo ANVISA..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-zinc-300 rounded-xl text-xs font-medium text-zinc-900 bg-zinc-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          {/* Abas de Condição de Rótulo / Status */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'ALL' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Todos ({counts.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('FORA_ROTULO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'FORA_ROTULO' ? 'bg-amber-400 text-zinc-950 shadow-xs' : 'text-amber-800 hover:text-amber-950'
              }`}
              title="Produtos que têm PROC cadastrado mas NÃO consta no rótulo gráfico (precisam de anotação na etiqueta do lote)"
            >
              Fora do Rótulo ({counts.foraRotulo})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('NO_ROTULO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'NO_ROTULO' ? 'bg-white text-emerald-800 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              No Rótulo ({counts.noRotulo})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('EM_BRANCO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'EM_BRANCO' ? 'bg-white text-zinc-800 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Em Branco ({counts.emBranco})
            </button>
          </div>

          {/* Seletor de Família */}
          <div className="w-full md:w-52 shrink-0">
            <select
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
              className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              {FAMILIES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Container da Tabela com Rolagem Fluida */}
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-zinc-100 border-b border-zinc-200 text-zinc-600 font-bold uppercase tracking-wider text-[10px] shadow-2xs">
                <tr>
                  <th className="py-3 px-4 w-28 bg-zinc-100">Código</th>
                  <th className="py-3 px-4 min-w-[280px] bg-zinc-100">Descrição do Produto</th>
                  <th className="py-3 px-4 w-44 bg-zinc-100">Família</th>
                  <th className="py-3 px-4 min-w-[210px] bg-zinc-100">Processo ANVISA / PROC</th>
                  <th className="py-3 px-4 w-48 text-center bg-zinc-100">Presença no Rótulo</th>
                  <th className="py-3 px-4 w-28 text-center bg-zinc-100">Status</th>
                  <th className="py-3 px-4 text-right w-24 bg-zinc-100">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-zinc-400 font-medium">
                      Carregando processos de fabricação...
                    </td>
                  </tr>
                ) : paginatedProcs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-zinc-400 space-y-2">
                      <BookOpen size={32} className="mx-auto text-zinc-300" />
                      <p className="font-semibold text-zinc-700">Nenhum PROC encontrado com os filtros selecionados.</p>
                      <p className="text-[11px] text-zinc-400">Tente ajustar o termo de busca ou limpar os filtros.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedProcs.map((item) => {
                    const isForaRotulo = isProcForaDoRotulo(item);
                    const isNoRotulo = isProcNoRotulo(item);
                    const isEmBranco = item.status === 'EM_BRANCO' || !item.proc;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-zinc-50/80 transition-colors ${
                          isForaRotulo ? 'bg-amber-50/25' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-zinc-600 whitespace-nowrap">
                          {item.codigoProduto || '—'}
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-bold text-zinc-900 block leading-snug">
                            {item.descricao}
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md font-medium text-[10px]">
                            {item.categoriaFamilia ? item.categoriaFamilia.replace(/_/g, ' ') : 'OUTROS'}
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {item.proc ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded text-[11px] select-all">
                                {item.proc}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyProc(item.proc!, item.id)}
                                className="p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 rounded transition-colors cursor-pointer"
                                title="Copiar número do PROC"
                              >
                                {copiedId === item.id ? (
                                  <Check size={13} className="text-emerald-600" />
                                ) : (
                                  <Copy size={13} />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-400 italic text-[11px]">Não cadastrado</span>
                          )}
                        </td>

                        {/* Presença no Rótulo */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isEmBranco ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium text-zinc-400 bg-zinc-100">
                              Sem PROC (Em Branco)
                            </span>
                          ) : isForaRotulo ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                              title="Não consta no rótulo gráfico da embalagem — precisa anotar no lote!"
                            >
                              <AlertTriangle size={11} className="text-amber-700 shrink-0" />
                              Fora do Rótulo (Anotar)
                            </span>
                          ) : isNoRotulo ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
                              title="Já vem impresso de fábrica no rótulo gráfico"
                            >
                              <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                              No Rótulo (Impresso)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium text-zinc-400 bg-zinc-100">
                              —
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isEmBranco ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
                              Em Branco
                            </span>
                          ) : item.status === 'ATIVO' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-500">
                              {item.status}
                            </span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleEdit(item)}
                              className="p-1.5 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                              title="Editar processo"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Excluir processo"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {filteredProcs.length > 0 && (
            <div className="bg-zinc-50 px-4 py-3 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
              <div className="flex items-center gap-2">
                <span>Exibindo <strong>{paginatedProcs.length}</strong> de <strong>{filteredProcs.length}</strong> produtos</span>
                <span className="text-zinc-300">|</span>
                <div className="flex items-center gap-1.5">
                  <span>Por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="border border-zinc-300 rounded-lg px-2 py-1 bg-white text-xs font-bold text-zinc-800 focus:outline-none"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={9999}>Todos</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                  title="Primeira Página"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                  title="Página Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 bg-white border border-zinc-200 rounded-lg font-bold text-zinc-900">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                  title="Próxima Página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-700 transition-colors cursor-pointer"
                  title="Última Página"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Modal de Criação / Edição */}
      <ProcModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setProcToEdit(null);
        }}
        procToEdit={procToEdit}
        onSaved={fetchProcs}
      />

      {/* Modal do Gerador Inteligente */}
      <ProcGeneratorModal
        isOpen={generatorModalOpen}
        onClose={() => setGeneratorModalOpen(false)}
        onProcSaved={fetchProcs}
      />

    </AppLayout>
  );
};
