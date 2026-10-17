import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiJson } from '../../geral/lib/http';
import { cn } from '../../geral/lib/utils';
import { PRODUCT_ROUTING_CATEGORIES } from '../../geral/lib/types';

interface RelatorioItem {
  codigo: string;
  descricao: string;
  linhaPrefix: string;
  linhaNome: string;
  categoria: string | null;
  status: string;
  codigoBarras: string | null;
}

interface LineOption {
  linha_prefix: string;
  nome_linha: string;
  visivel?: number | null;
}

interface Props {
  onBackToHub: () => void;
}

const CATEGORIA_OPTIONS = [
  { value: 'ALL', label: 'Todas' },
  ...PRODUCT_ROUTING_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
  { value: 'kit', label: 'Kit' },
  { value: 'sem_categoria', label: 'Sem categoria' },
];

function categoriaLabel(id: string | null | undefined): string {
  if (!id) return '—';
  if (id === 'kit') return 'Kit';
  const found = PRODUCT_ROUTING_CATEGORIES.find((c) => c.id === id);
  return found?.label ?? id;
}

function statusLabel(status: string): string {
  if (status === 'terceirizado') return 'Terceirizado';
  return 'Ativo';
}

export default function ProdutosAtivosRelatoriosView({ onBackToHub }: Props) {
  const [items, setItems] = useState<RelatorioItem[]>([]);
  const [lines, setLines] = useState<LineOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [lineFilter, setLineFilter] = useState('ALL');
  const [categoriaFilter, setCategoriaFilter] = useState('ALL');
  const [includeTerceirizados, setIncludeTerceirizados] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadLines = useCallback(async () => {
    try {
      const configs = await apiJson<LineOption[]>('/api/configs');
      setLines(
        (configs ?? [])
          .filter((c) => c.visivel !== 0)
          .slice()
          .sort((a, b) => (a.nome_linha || a.linha_prefix).localeCompare(b.nome_linha || b.linha_prefix)),
      );
    } catch {
      /* linhas opcionais — relatório ainda funciona */
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (lineFilter !== 'ALL') params.set('linha', lineFilter);
      if (categoriaFilter !== 'ALL') params.set('categoria', categoriaFilter);
      if (includeTerceirizados) params.set('includeTerceirizados', 'true');
      if (searchDebounced) params.set('search', searchDebounced);
      const qs = params.toString();
      const data = await apiJson<{ items: RelatorioItem[] }>(
        `/api/admin/produtos-ativos/relatorio${qs ? `?${qs}` : ''}`,
      );
      setItems(data.items ?? []);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar relatório');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [lineFilter, categoriaFilter, includeTerceirizados, searchDebounced]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.codigo));
  const someSelected = items.some((i) => selected.has(i.codigo));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.codigo)));
    }
  };

  const toggleOne = (codigo: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const missingBarcodeCount = useMemo(
    () => items.filter((i) => !i.codigoBarras).length,
    [items],
  );

  const exportXlsx = () => {
    let rows = items.filter((i) => selected.has(i.codigo));
    if (rows.length === 0) {
      if (items.length === 0) return;
      const ok = window.confirm(
        'Nenhum produto marcado. Exportar todos os filtrados?',
      );
      if (!ok) return;
      rows = items;
    }

    const sheetData = rows.map((r) => ({
      codigo: r.codigo,
      descricao: r.descricao,
      linha: r.linhaNome || r.linhaPrefix,
      categoria: categoriaLabel(r.categoria),
      status: statusLabel(r.status),
      codigo_barras: r.codigoBarras ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos Ativos');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `produtos-ativos-${stamp}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-zinc-700" />
          <h1 className="text-lg font-bold text-zinc-900">Relatórios · Produtos Ativos</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={exportXlsx}
            disabled={loading || items.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Exportar planilha
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-4">
        <p className="text-sm text-zinc-500">
          Produtos com linha ativa e status <span className="font-medium text-zinc-700">ativo</span>
          {includeTerceirizados ? ' (inclui terceirizados)' : ''}. Marque os itens e exporte para XLSX.
        </p>

        <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 min-w-[200px] flex-1">
            Busca
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código ou descrição"
                className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Linha
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="py-2 px-3 text-sm border border-zinc-200 rounded-lg min-w-[160px]"
            >
              <option value="ALL">Todas ativas</option>
              {lines.map((l) => (
                <option key={l.linha_prefix} value={l.linha_prefix}>
                  {l.nome_linha || l.linha_prefix}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
            Categoria
            <select
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
              className="py-2 px-3 text-sm border border-zinc-200 rounded-lg min-w-[160px]"
            >
              {CATEGORIA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeTerceirizados}
              onChange={(e) => setIncludeTerceirizados(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Incluir terceirizados
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          <span>
            {loading ? '…' : items.length} produto(s)
            {selected.size > 0 ? ` · ${selected.size} selecionado(s)` : ''}
          </span>
          <button
            type="button"
            onClick={toggleAll}
            disabled={items.length === 0}
            className="text-zinc-900 font-medium hover:underline disabled:opacity-40"
          >
            {allSelected ? 'Limpar seleção' : 'Marcar todos filtrados'}
          </button>
          {!loading && missingBarcodeCount > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {missingBarcodeCount} sem código de barras no ERP
            </span>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 sticky top-0 z-10 border-b border-zinc-200">
                <tr className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={toggleAll}
                      disabled={items.length === 0}
                    />
                  </th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Código de barras</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-zinc-400">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                      Carregando…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-zinc-400">
                      Nenhum produto com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr
                      key={row.codigo}
                      className={cn(
                        'border-t border-zinc-100 hover:bg-zinc-50',
                        selected.has(row.codigo) && 'bg-zinc-50',
                      )}
                    >
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={selected.has(row.codigo)}
                          onChange={() => toggleOne(row.codigo)}
                        />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-zinc-800">{row.codigo}</td>
                      <td className="px-3 py-1.5 text-zinc-800 max-w-md truncate" title={row.descricao}>
                        {row.descricao}
                      </td>
                      <td className="px-3 py-1.5 text-zinc-600">
                        {row.linhaNome || row.linhaPrefix}
                      </td>
                      <td className="px-3 py-1.5 text-zinc-600">{categoriaLabel(row.categoria)}</td>
                      <td className="px-3 py-1.5 text-zinc-600">{statusLabel(row.status)}</td>
                      <td
                        className={cn(
                          'px-3 py-1.5 font-mono text-xs',
                          row.codigoBarras ? 'text-zinc-800' : 'text-amber-600',
                        )}
                      >
                        {row.codigoBarras || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
