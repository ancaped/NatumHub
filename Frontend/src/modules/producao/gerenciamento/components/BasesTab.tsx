import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, RefreshCw, ChevronDown, ChevronRight, Edit3, HelpCircle,
  Check, Plus, Trash2, Layers, FlaskConical, Package, CheckCircle2, AlertTriangle, X
} from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import { useAviso } from '../../../geral/components/ui/Aviso';
import { usePreviaServidor, linhasAjusteFila, linhasExclusaoFila } from '../../lib/usePreviaServidor';

export function BasesTab({
  configs,
  tabOptions = [],
  onLaunchProduct,
  onEditOverrides,
  onRefresh,
  onShowDetails,
}: any) {
  const { avisar, aviso } = useAviso();
  const { pedir: pedirPrevia, elemento: previaElemento } = usePreviaServidor(avisar);
  const [bases, setBases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLine, setSelectedLine] = useState('ALL');
  const [filterMode, setFilterMode] = useState<'demanda' | 'all' | 'fila'>('demanda');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'demanda_total_kg' | 'dependent_products_count' | 'codigo' | 'descricao'>('demanda_total_kg');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedBases, setExpandedBases] = useState<string[]>([]);

  // Popover state for editing queue quantity (kg)
  const [editingQueueCode, setEditingQueueCode] = useState<string | null>(null);
  const [editingQueueKg, setEditingQueueKg] = useState<number>(200);
  const [savingQueue, setSavingQueue] = useState(false);

  const limitPerPage = 20;

  const loadBases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/producao/bases-resumo');
      if (res.ok) {
        const data = await res.json();
        setBases(Array.isArray(data.items) ? data.items : []);
      }
    } catch (e) {
      console.error('Erro ao buscar resumo de bases:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBases();
  }, [loadBases]);

  const handleRefresh = async () => {
    await loadBases();
    if (onRefresh) onRefresh();
  };

  const toggleBaseExpanded = (code: string) => {
    setExpandedBases((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'codigo' || field === 'descricao' ? 'asc' : 'desc');
    }
  };

  // Enqueue base in kg
  const handleEnqueueBase = async (b: any, customKg?: number) => {
    const qtyKg = customKg ?? (b.sugestao_base_kg > 0 ? Math.ceil(b.sugestao_base_kg) : (b.lote_padrao_kg || 200));
    setSavingQueue(true);
    try {
      const res = await apiFetch('/producao/fila-demandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoProduto: b.codigo,
          descricao: b.descricao,
          quantidade: qtyKg,
          unidade: 'kg',
          quantidadeKg: qtyKg,
          origemDemanda: 'base',
          baseCodigo: b.codigo,
          baseNome: b.descricao,
        }),
      });
      if (res.ok) {
        setEditingQueueCode(null);
        await loadBases();
      }
    } catch (err) {
      console.error('Erro ao enfileirar base:', err);
    } finally {
      setSavingQueue(false);
    }
  };

  // Update quantity in queue
  const handleUpdateQueueKg = async (b: any) => {
    if (editingQueueKg <= 0) return;
    setSavingQueue(true);
    try {
      const targetId = b.fila_id;
      if (!targetId) return;
      await pedirPrevia({
        url: `/producao/fila-demandas/${encodeURIComponent(targetId)}`,
        init: {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantidade: editingQueueKg,
            quantidadeKg: editingQueueKg,
            unidade: 'kg',
          }),
        },
        titulo: 'Ajustar kg da base na fila',
        confirmarRotulo: 'OK, ajustar',
        linhas: linhasAjusteFila,
        erroPadrao: 'Não foi possível ajustar o item da fila.',
        aoConcluir: async () => {
          setEditingQueueCode(null);
          await loadBases();
        },
      });
    } catch (err) {
      console.error('Erro ao atualizar kg da base na fila:', err);
    } finally {
      setSavingQueue(false);
    }
  };

  // Remove base from queue
  const handleRemoveFromQueue = async (b: any) => {
    setSavingQueue(true);
    try {
      const targetId = b.fila_id;
      if (!targetId) return;
      await pedirPrevia({
        url: `/producao/fila-demandas/${encodeURIComponent(targetId)}`,
        init: { method: 'DELETE' },
        titulo: 'Tirar base da fila',
        confirmarRotulo: 'OK, tirar da fila',
        linhas: linhasExclusaoFila,
        erroPadrao: 'Não foi possível tirar o item da fila.',
        aoConcluir: async () => {
          setEditingQueueCode(null);
          await loadBases();
        },
      });
    } catch (err) {
      console.error('Erro ao remover base da fila:', err);
    } finally {
      setSavingQueue(false);
    }
  };

  // Enqueue a finished product directly from the expanded base panel
  const handleEnqueueFinishedProduct = async (fp: any, b: any) => {
    const qty = fp.producao_recomendada > 0 ? fp.producao_recomendada : 100;
    const kg = Math.round(qty * (fp.unit_weight_kg || 1) * 10) / 10;
    try {
      const res = await apiFetch('/producao/fila-demandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoProduto: fp.codigo,
          descricao: fp.descricao,
          quantidade: qty,
          unidade: 'un',
          quantidadeKg: kg,
          origemDemanda: 'sugestao_estoque',
          baseCodigo: b.codigo,
          baseNome: b.descricao,
        }),
      });
      if (res.ok) {
        await loadBases();
      }
    } catch (err) {
      console.error('Erro ao enviar produto acabado para fila:', err);
    }
  };

  const counts = useMemo(() => {
    let demanda = 0;
    let fila = 0;
    for (const b of bases) {
      if ((b.demanda_total_kg || 0) > 0 || b.na_fila || b.planejado_semana) demanda++;
      if (b.na_fila || b.planejado_semana) fila++;
    }
    return {
      demanda,
      all: bases.length,
      fila,
    };
  }, [bases]);

  const processedBases = useMemo(() => {
    let result = [...bases];

    if (filterMode === 'demanda') {
      result = result.filter(
        (b) => (b.demanda_total_kg || 0) > 0 || b.na_fila || b.planejado_semana
      );
    } else if (filterMode === 'fila') {
      result = result.filter((b) => b.na_fila || b.planejado_semana);
    }

    if (selectedLine !== 'ALL') {
      result = result.filter((b) => b.linha_prefix === selectedLine);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (b) =>
          (b.codigo || '').toLowerCase().includes(term) ||
          (b.descricao || '').toLowerCase().includes(term) ||
          (Array.isArray(b.dependent_products) &&
            b.dependent_products.some(
              (dp: any) =>
                (dp.codigo || '').toLowerCase().includes(term) ||
                (dp.descricao || '').toLowerCase().includes(term)
            ))
      );
    }

    result.sort((a, b) => {
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';
      if (typeof valA === 'string') {
        return sortDir === 'asc'
          ? valA.localeCompare(valB)
          : String(valB).localeCompare(valA);
      }
      return sortDir === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });

    return result;
  }, [bases, filterMode, selectedLine, searchTerm, sortField, sortDir]);

  const totalItems = processedBases.length;
  const totalPages = Math.ceil(totalItems / limitPerPage) || 1;
  const paginatedBases = useMemo(() => {
    const startIdx = (currentPage - 1) * limitPerPage;
    return processedBases.slice(startIdx, startIdx + limitPerPage);
  }, [processedBases, currentPage]);

  return (
    <div className="view-container animate-in fade-in duration-200">
      {previaElemento}
      {aviso}
      {/* Top Segmented Control */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-zinc-100 p-1.5 rounded-xl border border-zinc-200">
        <div className="inline-flex rounded-lg p-0.5 bg-zinc-200/60 text-xs font-semibold flex-wrap gap-0.5">
          <button
            type="button"
            onClick={() => {
              setFilterMode('demanda');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              filterMode === 'demanda'
                ? 'bg-white text-zinc-900 shadow-xs font-bold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <FlaskConical size={14} className={filterMode === 'demanda' ? 'text-amber-600' : ''} />
            <span>Com Demanda Projetada</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">
              {counts.demanda}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterMode('all');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              filterMode === 'all'
                ? 'bg-white text-zinc-900 shadow-xs font-bold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Layers size={14} />
            <span>Catálogo Completo de Bases</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterMode('fila');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              filterMode === 'fila'
                ? 'bg-white text-zinc-900 shadow-xs font-bold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <CheckCircle2 size={14} className={filterMode === 'fila' ? 'text-emerald-600' : ''} />
            <span>Bases na Fila / Planejadas</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 text-zinc-700 font-mono">
              {counts.fila}
            </span>
          </button>
        </div>

        <div className="text-[11px] text-zinc-500 font-medium px-2">
          Cálculo baseado na demanda em <strong className="text-zinc-800">kg</strong> dos produtos acabados vinculados
        </div>
      </div>

      {/* Tabs Nav for Product Lines */}
      <div className="tabs-container">
        {tabOptions.map((opt: any) => (
          <button
            key={opt.id}
            type="button"
            className={`tab-btn ${selectedLine === opt.id ? 'active' : ''}`}
            onClick={() => {
              setSelectedLine(opt.id);
              setCurrentPage(1);
            }}
          >
            {opt.name}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar-section">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar base por código, descrição ou produto acabado vinculado..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="filters-wrapper">
          <button
            type="button"
            className="btn-secondary cursor-pointer"
            onClick={handleRefresh}
            title="Recarregar dados"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Bases Table Card */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden flex flex-col w-full text-xs">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <RefreshCw className="animate-spin" size={28} />
            <span>Calculando demanda de bases granel e vínculos...</span>
          </div>
        ) : paginatedBases.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <HelpCircle size={40} className="opacity-30" />
            <span>Nenhuma base encontrada para o filtro selecionado.</span>
            {filterMode !== 'all' && (
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-bold cursor-pointer"
              >
                Ver todas as {counts.all} bases do catálogo
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-zinc-50 sticky top-0 z-10 border-b border-zinc-200">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th
                    onClick={() => handleSort('codigo')}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] cursor-pointer hover:bg-zinc-100 select-none"
                  >
                    REF Base {sortField === 'codigo' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSort('descricao')}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] cursor-pointer hover:bg-zinc-100 select-none"
                  >
                    Descrição da Base / Vínculos {sortField === 'descricao' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSort('dependent_products_count')}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] text-center cursor-pointer hover:bg-zinc-100 select-none"
                  >
                    Produtos Acabados {sortField === 'dependent_products_count' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] text-right">
                    Último Lote Base
                  </th>
                  <th className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] text-right">
                    Demanda na Fila PCP
                  </th>
                  <th
                    onClick={() => handleSort('demanda_total_kg')}
                    className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] text-right cursor-pointer hover:bg-zinc-100 select-none"
                  >
                    Demanda Projetada (kg) {sortField === 'demanda_total_kg' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] text-center">
                    Fila PCP (Granel)
                  </th>
                  <th className="px-4 py-3 font-bold text-zinc-700 uppercase tracking-wider text-[10px] text-center">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {paginatedBases.map((b) => {
                  const isExpanded = expandedBases.includes(b.codigo);
                  const deps: any[] = Array.isArray(b.dependent_products) ? b.dependent_products : [];
                  const form: any[] = Array.isArray(b.formulation) ? b.formulation : [];
                  const hasDemand = (b.demanda_total_kg || 0) > 0;

                  return (
                    <React.Fragment key={b.codigo}>
                      <tr
                        className={`hover:bg-zinc-50/60 transition-colors ${
                          isExpanded ? 'bg-zinc-50/80' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-zinc-200/70 text-zinc-500 cursor-pointer"
                            onClick={() => toggleBaseExpanded(b.codigo)}
                            title={isExpanded ? 'Ocultar produtos e receita' : 'Ver produtos vinculados e receita da base'}
                          >
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-800">
                          <button
                            type="button"
                            onClick={() => toggleBaseExpanded(b.codigo)}
                            className="hover:underline cursor-pointer bg-transparent border-none p-0 font-bold text-zinc-900"
                          >
                            {b.codigo}
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-zinc-900 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleBaseExpanded(b.codigo)}
                              className="hover:underline cursor-pointer bg-transparent border-none p-0 font-bold text-zinc-900 text-left"
                            >
                              {b.descricao}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                            <span className="text-[10px] text-zinc-500 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded">
                              Linha: {b.nome_linha}
                            </span>
                            {form.length > 0 ? (
                              <span className="text-[10px] text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded font-mono">
                                {form.length} insumos na fórmula
                              </span>
                            ) : (
                              <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded font-semibold">
                                Sem fórmula cadastrada
                              </span>
                            )}
                            {b.observacao && (
                              <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                Obs: {b.observacao}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className="font-mono font-bold text-zinc-800">
                              {deps.length} {deps.length === 1 ? 'produto' : 'produtos'}
                            </span>
                            {b.produtos_com_demanda_count > 0 && (
                              <span className="mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                {b.produtos_com_demanda_count} pedindo produção
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {b.ultimo_lote_kg > 0 ? (
                            <div>
                              <span className="font-bold text-zinc-800">{b.ultimo_lote_kg} kg</span>
                              <div className="text-[10px] text-zinc-400">
                                {b.ultimo_lote_data
                                  ? new Date(b.ultimo_lote_data).toLocaleDateString('pt-BR')
                                  : ''}{' '}
                                {b.ultimo_lote_numero ? `(#${b.ultimo_lote_numero})` : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {b.demanda_fila_kg > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-bold">
                              {b.demanda_fila_kg.toFixed(1)} kg
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          {hasDemand ? (
                            <div>
                              <span className="font-bold text-zinc-900 text-sm">
                                {b.demanda_total_kg.toFixed(1)} kg
                              </span>
                              <div className="text-[10px] text-zinc-500">
                                Sugestão: ~{Math.ceil(b.sugestao_base_kg)} kg
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-400">0 kg</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center relative">
                          {b.planejado_semana ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Planejado ({b.planejado_kg} kg)
                            </span>
                          ) : b.na_fila ? (
                            <div className="inline-block relative">
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingQueueCode === b.codigo) {
                                    setEditingQueueCode(null);
                                  } else {
                                    setEditingQueueCode(b.codigo);
                                    setEditingQueueKg(b.fila_qtd_kg || 200);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="Clique para ajustar a quantidade (kg) ou remover da Fila PCP"
                              >
                                <Check size={12} />
                                <span>Na Fila ({b.fila_qtd_kg} kg)</span>
                              </button>

                              {editingQueueCode === b.codigo && (
                                <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-zinc-200 p-3 z-30 text-left">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold uppercase text-zinc-500">
                                      Ajustar Batelada na Fila
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setEditingQueueCode(null)}
                                      className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <input
                                      type="number"
                                      min={1}
                                      value={editingQueueKg}
                                      onChange={(e) => setEditingQueueKg(Math.max(1, Number(e.target.value) || 0))}
                                      className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg font-mono text-xs font-bold text-zinc-900"
                                    />
                                    <span className="text-xs font-bold text-zinc-500">kg</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mb-2.5">
                                    {[100, 200, 500, 1000].map((preset) => (
                                      <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setEditingQueueKg(preset)}
                                        className="px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-mono text-[10px] font-semibold cursor-pointer"
                                      >
                                        {preset}kg
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-zinc-100">
                                    <button
                                      type="button"
                                      disabled={savingQueue}
                                      onClick={() => handleRemoveFromQueue(b)}
                                      className="px-2 py-1 rounded text-[10px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1 cursor-pointer"
                                    >
                                      <Trash2 size={11} />
                                      Remover
                                    </button>
                                    <button
                                      type="button"
                                      disabled={savingQueue}
                                      onClick={() => handleUpdateQueueKg(b)}
                                      className="px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-bold cursor-pointer"
                                    >
                                      Salvar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleEnqueueBase(b)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shadow-xs cursor-pointer"
                              title="Enviar lote desta base em kg para a Fila de Demandas do PCP"
                            >
                              <Plus size={12} />
                              <span>+ Fila</span>
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            className="p-1.5 rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                            onClick={() => onEditOverrides(b)}
                            title="Configurar lote padrão e observações da base"
                          >
                            <Edit3 size={14} />
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Row: Dependent Finished Products & Base Formula */}
                      {isExpanded && (
                        <tr className="bg-zinc-50/70">
                          <td colSpan={9} className="p-0 border-b border-zinc-200">
                            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Left Column: Dependent Finished Products */}
                              <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
                                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-zinc-100">
                                  <div className="flex items-center gap-1.5">
                                    <Package size={14} className="text-zinc-700" />
                                    <span className="font-bold text-xs text-zinc-900">
                                      Produtos Acabados que Utilizam esta Base ({deps.length})
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-zinc-500">
                                    Demanda acumulada: <strong>{b.demanda_total_kg.toFixed(1)} kg</strong>
                                  </span>
                                </div>

                                {deps.length === 0 ? (
                                  <p className="text-xs text-zinc-400 py-4 text-center">
                                    Nenhum produto acabado ativo vinculado diretamente a esta base.
                                  </p>
                                ) : (
                                  <div className="max-h-72 overflow-y-auto">
                                    <table className="w-full text-left text-[11px] border-collapse">
                                      <thead className="bg-zinc-50 text-zinc-500 font-bold uppercase text-[9px] border-b border-zinc-200 sticky top-0">
                                        <tr>
                                          <th className="py-2 px-2">REF</th>
                                          <th className="py-2 px-2">Produto Acabado</th>
                                          <th className="py-2 px-2 text-right">EFP</th>
                                          <th className="py-2 px-2 text-right">Necessidade</th>
                                          <th className="py-2 px-2 text-center">Fila PCP</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-100">
                                        {deps.map((dp: any) => (
                                          <tr key={dp.codigo} className="hover:bg-zinc-50">
                                            <td className="py-2 px-2 font-mono font-bold text-zinc-800">
                                              <button
                                                type="button"
                                                onClick={() => onShowDetails?.(dp.codigo)}
                                                className="hover:underline cursor-pointer bg-transparent border-none p-0 font-bold"
                                              >
                                                {dp.codigo}
                                              </button>
                                            </td>
                                            <td className="py-2 px-2">
                                              <div className="font-semibold text-zinc-900 truncate max-w-[220px]" title={dp.descricao}>
                                                {dp.descricao}
                                              </div>
                                            </td>
                                            <td className="py-2 px-2 text-right font-mono text-zinc-700">
                                              {dp.efp} un
                                            </td>
                                            <td className="py-2 px-2 text-right font-mono">
                                              {dp.producao_recomendada > 0 ? (
                                                <div>
                                                  <span className="font-bold text-rose-700">
                                                    {dp.producao_recomendada} un
                                                  </span>
                                                  <span className="text-[10px] text-zinc-500 ml-1">
                                                    ({dp.demanda_sugerida_kg} kg)
                                                  </span>
                                                </div>
                                              ) : (
                                                <span className="text-emerald-700 font-semibold">OK</span>
                                              )}
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                              {dp.na_fila ? (
                                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-bold font-mono">
                                                  Na Fila ({dp.fila_kg} kg)
                                                </span>
                                              ) : dp.planejado_semana ? (
                                                <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 text-[9px] font-bold">
                                                  Planejado
                                                </span>
                                              ) : dp.producao_recomendada > 0 ? (
                                                <button
                                                  type="button"
                                                  onClick={() => handleEnqueueFinishedProduct(dp, b)}
                                                  className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-white text-[9px] font-bold cursor-pointer"
                                                >
                                                  + Fila
                                                </button>
                                              ) : (
                                                <span className="text-zinc-300">—</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Right Column: Base Formula & Raw Material Stock */}
                              <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
                                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-zinc-100">
                                  <div className="flex items-center gap-1.5">
                                    <FlaskConical size={14} className="text-zinc-700" />
                                    <span className="font-bold text-xs text-zinc-900">
                                      Fórmula da Base & Estoque de Matérias-Primas ({form.length})
                                    </span>
                                  </div>
                                </div>

                                {form.length === 0 ? (
                                  <p className="text-xs text-zinc-400 py-4 text-center">
                                    Nenhuma receita cadastrada no ERP para o código {b.codigo}.
                                  </p>
                                ) : (
                                  <div className="max-h-72 overflow-y-auto">
                                    <table className="w-full text-left text-[11px] border-collapse">
                                      <thead className="bg-zinc-50 text-zinc-500 font-bold uppercase text-[9px] border-b border-zinc-200 sticky top-0">
                                        <tr>
                                          <th className="py-2 px-2">REF</th>
                                          <th className="py-2 px-2">Matéria-Prima</th>
                                          <th className="py-2 px-2 text-right">Qtd Unit.</th>
                                          <th className="py-2 px-2 text-right">%</th>
                                          <th className="py-2 px-2 text-right">Estoque MP</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-100">
                                        {form.map((f: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-zinc-50">
                                            <td className="py-1.5 px-2 font-mono text-zinc-600 font-bold">
                                              {f.ingredient_code}
                                            </td>
                                            <td className="py-1.5 px-2 font-medium text-zinc-800 truncate max-w-[200px]">
                                              {f.description}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-mono text-zinc-700">
                                              {Number(f.quantity || 0).toFixed(4)}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-mono text-zinc-500">
                                              {(Number(f.percentage || 0) * 100).toFixed(2)}%
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-mono font-bold">
                                              <span
                                                className={
                                                  Number(f.current_stock || 0) > 0
                                                    ? 'text-emerald-700'
                                                    : 'text-rose-600'
                                                }
                                              >
                                                {Number(f.current_stock || 0).toFixed(1)}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="pagination-container">
          <span className="font-mono text-xs text-zinc-500">
            Exibindo de {totalItems === 0 ? 0 : (currentPage - 1) * limitPerPage + 1} a{' '}
            {Math.min(currentPage * limitPerPage, totalItems)} de {totalItems} bases
          </span>
          <div className="pagination-controls">
            <button
              type="button"
              className="pagination-btn cursor-pointer"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span className="font-mono text-xs font-bold px-2 flex items-center">
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              className="pagination-btn cursor-pointer"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
