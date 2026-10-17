import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, ShoppingBag } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';
import type { ProductSalesInfo } from '../lib/types';

interface ProdutosTabProps {
  onOpenProduct: (code: string) => void;
  refreshToken: number;
}

export function ProdutosTab({ onOpenProduct, refreshToken }: ProdutosTabProps) {
  const [products, setProducts] = useState<ProductSalesInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [linhaFilter, setLinhaFilter] = useState('ALL');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/products?limit=5000`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          const items = (data.items || []).map((item: any) => ({
            codigo: item.codigo,
            descricao: item.descricao,
            linha_prefix: item.linhaPrefix || item.linha_prefix,
            nome_linha: item.nomeLinha || item.nome_linha,
            base: item.base,
            estoque: item.estoque,
            media_vendas: item.mediaVendas || item.media_vendas || 0,
            status: item.status,
            is_lancamento: item.isLancamento || item.is_lancamento || false,
          }));
          setProducts(items);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const lines = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      if (p.linha_prefix) map.set(p.linha_prefix, p.nome_linha || p.linha_prefix);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (linhaFilter !== 'ALL' && p.linha_prefix !== linhaFilter) return false;
      if (!q) return true;
      return (
        p.codigo.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q) ||
        (p.nome_linha || '').toLowerCase().includes(q)
      );
    });
  }, [products, search, linhaFilter]);

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Código ou descrição…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg"
          />
        </div>
        <select
          value={linhaFilter}
          onChange={(e) => setLinhaFilter(e.target.value)}
          className="text-sm border border-zinc-200 rounded-lg px-2 py-2 md:w-56"
        >
          <option value="ALL">Todas as linhas</option>
          {lines.map(([prefix, nome]) => (
            <option key={prefix} value={prefix}>
              {nome}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-400">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-zinc-400">
          <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Nenhum produto encontrado.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[calc(100vh-220px)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500 font-bold sticky top-0 border-b">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Linha</th>
                <th className="px-4 py-3 text-right">Estoque</th>
                <th className="px-4 py-3 text-right">Média mensal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((p) => (
                <tr
                  key={p.codigo}
                  onClick={() => onOpenProduct(p.codigo)}
                  className="hover:bg-zinc-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <span className="font-bold text-zinc-900 block line-clamp-1">{p.descricao}</span>
                    <span className="font-mono text-[10px] text-zinc-400">{p.codigo}</span>
                    {p.is_lancamento && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                        Lançamento
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{p.nome_linha}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {p.estoque.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold">
                    {Math.round(p.media_vendas).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
