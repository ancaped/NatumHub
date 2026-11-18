import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShoppingBag } from 'lucide-react';
import { apiFetch, apiJson } from '../../../geral/lib/http';
import { agruparLinhas, prefixosDaLinha, rotuloLinha, type LinhaBase } from '../../../geral/lib/linhas';
import { FilterBar, FiltroSelect, StatusBadge, TabelaPainel } from '../../../geral/components/ui/ReportKit';
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
  const [configs, setConfigs] = useState<LinhaBase[]>([]);

  useEffect(() => {
    apiJson<LinhaBase[]>('/api/configs').then(setConfigs).catch(() => setConfigs([]));
  }, []);

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

  // Linhas presentes nos produtos; sublinhas ficam logo abaixo da principal (a principal entra se ela ou uma sublinha tem produto).
  const lines = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      if (p.linha_prefix) map.set(p.linha_prefix, p.nome_linha || p.linha_prefix);
    }
    const presentes = configs.filter(c => prefixosDaLinha(configs, c.linha_prefix).some(x => map.has(x)));
    const ordem = agruparLinhas(presentes).map(g => g.linha.linha_prefix);
    const fora = Array.from(map.keys()).filter(k => !ordem.includes(k)).sort((a, b) => (map.get(a) || '').localeCompare(map.get(b) || ''));
    return [...ordem, ...fora].map(k => [k, rotuloLinha(configs, k) === k ? map.get(k) || k : rotuloLinha(configs, k)] as [string, string]);
  }, [products, configs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (linhaFilter !== 'ALL' && !prefixosDaLinha(configs, linhaFilter).includes(p.linha_prefix)) return false;
      if (!q) return true;
      return (
        p.codigo.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q) ||
        (p.nome_linha || '').toLowerCase().includes(q)
      );
    });
  }, [products, search, linhaFilter, configs]);

  return (
    <div>
      <FilterBar busca={search} onBusca={setSearch} placeholder="Código ou descrição…">
        <FiltroSelect
          value={linhaFilter}
          onChange={setLinhaFilter}
          opcoes={[
            { valor: 'ALL', rotulo: 'Todas as linhas' },
            ...lines.map(([prefix, nome]) => ({ valor: prefix, rotulo: nome })),
          ]}
        />
      </FilterBar>

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
        <TabelaPainel>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Linha</th>
              <th style={{ textAlign: 'right' }}>Estoque</th>
              <th style={{ textAlign: 'right' }}>Média mensal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.codigo} onClick={() => onOpenProduct(p.codigo)} style={{ cursor: 'pointer' }}>
                <td>
                  <span className="font-bold text-zinc-900 block line-clamp-1">{p.descricao}</span>
                  <span className="font-mono text-[10px] text-zinc-400">{p.codigo}</span>
                  {p.is_lancamento && (
                    <>
                      {' '}
                      <StatusBadge variante="apoio">Lançamento</StatusBadge>
                    </>
                  )}
                </td>
                <td>{rotuloLinha(configs, p.linha_prefix) === p.linha_prefix ? p.nome_linha : rotuloLinha(configs, p.linha_prefix)}</td>
                <td style={{ textAlign: 'right' }}>{p.estoque.toLocaleString('pt-BR')}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {Math.round(p.media_vendas).toLocaleString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </TabelaPainel>
      )}
    </div>
  );
}
