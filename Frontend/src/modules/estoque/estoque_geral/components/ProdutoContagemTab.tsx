import React, { useCallback, useEffect, useState } from 'react';
import { Search, Loader2, X, AlertCircle, CheckCircle2, History, PlusCircle } from 'lucide-react';
import { apiFetch } from '../../../geral/lib/http';

interface ProductItem {
  codigo: string;
  descricao: string;
  nomeLinha: string;
  linhaPrefix: string;
  estoque: number;
  producao: number;
  pedidosAberto: number;
  estoqueFuturo: number;
  status: string;
}

interface CountHistory {
  id: string;
  productCode: string;
  recordedQty: number;
  countedQty: number;
  delta: number;
  countedBy: string | null;
  countedAt: string;
  observations: string | null;
}

export function ProdutoContagemTab({ active = false }: { active?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  // Drawer Form State
  const [countedQty, setCountedQty] = useState('');
  const [observations, setObservations] = useState('');
  const [history, setHistory] = useState<CountHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadProducts = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const res = await apiFetch('/products?limit=5000');
      if (res.ok) {
        const data = await res.json();
        // Map backend snake_case keys to camelCase
        const items = (data.items || []).map((i: any) => ({
          codigo: i.codigo,
          descricao: i.descricao,
          nomeLinha: i.nome_linha || 'Outros',
          linhaPrefix: i.linha_prefix,
          estoque: i.estoque ?? 0,
          producao: i.producao ?? 0,
          pedidosAberto: i.pedidos_aberto ?? 0,
          estoqueFuturo: i.estoque_futuro ?? 0,
          status: i.status || 'ativo',
        }));
        setProducts(items);
      }
    } catch (e) {
      console.error('Erro ao carregar produtos acabados:', e);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const loadHistory = useCallback(async (code: string) => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/estoque/produtos/${encodeURIComponent(code)}/contagem/historico`);
      if (res.ok) {
        setHistory(await res.json());
      } else {
        setHistory([]);
      }
    } catch (e) {
      console.error(e);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      loadHistory(selectedProduct.codigo);
      setCountedQty('');
      setObservations('');
      setSuccessMsg('');
      setErrorMsg('');
    }
  }, [selectedProduct, loadHistory]);

  const handleSaveCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const num = Number(countedQty);
    if (isNaN(num) || countedQty.trim() === '') {
      setErrorMsg('Por favor, informe uma quantidade válida.');
      return;
    }

    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await apiFetch(`/estoque/produtos/${encodeURIComponent(selectedProduct.codigo)}/contagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counted_qty: num,
          counted_by: 'Operador',
          observations: observations.trim() || null,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Contagem física registrada e salva no banco!');
        // Update local list
        setProducts(prev =>
          prev.map(p =>
            p.codigo === selectedProduct.codigo
              ? { ...p, estoque: num, estoqueFuturo: num + p.producao - p.pedidosAberto }
              : p
          )
        );
        loadHistory(selectedProduct.codigo);
        setCountedQty('');
        setObservations('');
      } else {
        const text = await res.text();
        setErrorMsg(text || 'Erro ao registrar contagem.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de rede.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = products.filter(p => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.codigo.toLowerCase().includes(q) ||
      p.descricao.toLowerCase().includes(q) ||
      p.nomeLinha.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 relative space-y-4">
      {/* Search Header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produtos por código, descrição ou linha..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-zinc-400 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando estoque de produtos acabado...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-zinc-400 text-sm">
              Nenhum produto acabado encontrado.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-150 text-[10px] font-bold uppercase text-zinc-400 tracking-wider">
                  <th className="px-6 py-3.5">Código</th>
                  <th className="px-6 py-3.5">Descrição</th>
                  <th className="px-6 py-3.5">Linha</th>
                  <th className="px-6 py-3.5 text-right">Estoque Físico</th>
                  <th className="px-6 py-3.5 text-right">Em Produção</th>
                  <th className="px-6 py-3.5 text-right">Pedidos em Aberto</th>
                  <th className="px-6 py-3.5 text-right">Projeção Futuro</th>
                  <th className="px-6 py-3.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(p => (
                  <tr key={p.codigo} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-3 font-mono font-bold text-zinc-400">{p.codigo}</td>
                    <td className="px-6 py-3 font-semibold text-zinc-900">{p.descricao}</td>
                    <td className="px-6 py-3 text-zinc-500">{p.nomeLinha}</td>
                    <td className="px-6 py-3 text-right font-bold tabular-nums text-zinc-900">
                      {p.estoque.toLocaleString('pt-BR')} un
                    </td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums text-zinc-500">
                      {p.producao > 0 ? `${p.producao.toLocaleString('pt-BR')} un` : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums text-zinc-500">
                      {p.pedidosAberto > 0 ? `${p.pedidosAberto.toLocaleString('pt-BR')} un` : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-bold tabular-nums text-zinc-900">
                      {p.estoqueFuturo.toLocaleString('pt-BR')} un
                    </td>
                    <td className="px-6 py-3 text-center">
                      <button
                        onClick={() => setSelectedProduct(p)}
                        className="text-xs font-bold text-zinc-600 hover:text-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors cursor-pointer"
                      >
                        Contar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Drawer */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-sm font-extrabold text-zinc-900">{selectedProduct.descricao}</h3>
                <p className="text-xs font-mono text-zinc-400 mt-0.5">Código: {selectedProduct.codigo}</p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Estoque Sistema</div>
                  <div className="text-lg font-extrabold tabular-nums text-zinc-900 mt-0.5">{selectedProduct.estoque.toLocaleString('pt-BR')}</div>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Em Produção (OPs)</div>
                  <div className="text-lg font-extrabold tabular-nums text-zinc-900 mt-0.5">{selectedProduct.producao.toLocaleString('pt-BR')}</div>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pedidos ERP (Abertos)</div>
                  <div className="text-lg font-extrabold tabular-nums text-zinc-900 mt-0.5">{selectedProduct.pedidosAberto.toLocaleString('pt-BR')}</div>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Estoque Futuro</div>
                  <div className="text-lg font-extrabold tabular-nums text-zinc-900 mt-0.5">{selectedProduct.estoqueFuturo.toLocaleString('pt-BR')}</div>
                </div>
              </div>

              {/* Lançamento Form */}
              <form onSubmit={handleSaveCount} className="border border-zinc-200 rounded-2xl p-5 space-y-4 bg-zinc-50/20">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
                  <PlusCircle className="h-4 w-4 text-zinc-500" /> Lançar Nova Contagem Física
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Quantidade Contada</label>
                    <input
                      type="number"
                      required
                      value={countedQty}
                      onChange={e => setCountedQty(e.target.value)}
                      placeholder="Qtd un..."
                      className="w-full text-sm border border-zinc-300 rounded-lg px-3 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Desvio Calculado</label>
                    <div className="py-2 px-3 bg-white border border-zinc-200 rounded-lg font-bold text-sm tabular-nums">
                      {countedQty.trim() === '' ? (
                        <span className="text-zinc-400">—</span>
                      ) : (
                        (() => {
                          const delta = Number(countedQty) - selectedProduct.estoque;
                          if (delta > 0) return <span className="text-emerald-600">+{delta.toLocaleString('pt-BR')}</span>;
                          if (delta < 0) return <span className="text-rose-600">{delta.toLocaleString('pt-BR')}</span>;
                          return <span className="text-zinc-600">0</span>;
                        })()
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">Observações / Justificativa</label>
                  <textarea
                    value={observations}
                    onChange={e => setObservations(e.target.value)}
                    placeholder="Ex: Divergência de inventário rotativo mensal..."
                    className="w-full text-sm border border-zinc-300 rounded-lg px-3 py-2 bg-white min-h-[64px]"
                  />
                </div>

                {successMsg && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> {successMsg}
                  </div>
                )}
                {errorMsg && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-xs flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" /> {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2 bg-zinc-900 text-white rounded-lg text-xs font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  Salvar Lançamento
                </button>
              </form>

              {/* History Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
                  <History className="h-4 w-4 text-zinc-500" /> Histórico de Contagens
                </h4>

                {historyLoading ? (
                  <div className="text-xs text-zinc-400 py-4 flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando histórico...
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-xs text-zinc-450 italic py-4 bg-zinc-50 border border-zinc-150 rounded-xl px-4 text-center">
                    Nenhuma contagem rotativa registrada anteriormente para este produto.
                  </div>
                ) : (
                  <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-100 bg-white">
                    {history.map(h => (
                      <div key={h.id} className="p-3.5 space-y-1.5 hover:bg-zinc-50/50 transition-colors text-[11px]">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-extrabold text-zinc-900">
                            Física: {h.countedQty.toLocaleString('pt-BR')} un
                          </span>
                          <span className="text-[10px] text-zinc-400 font-medium">
                            {new Date(h.countedAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-zinc-500">
                          <span>Sistema: {h.recordedQty.toLocaleString('pt-BR')} un</span>
                          <span className={h.delta > 0 ? 'text-emerald-600 font-bold' : h.delta < 0 ? 'text-rose-600 font-bold' : 'text-zinc-650 font-bold'}>
                            Desvio: {h.delta > 0 ? '+' : ''}{h.delta.toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {h.observations && (
                          <p className="bg-zinc-50 border border-zinc-100 rounded-lg p-2 italic text-zinc-500 mt-1">
                            {h.observations}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
