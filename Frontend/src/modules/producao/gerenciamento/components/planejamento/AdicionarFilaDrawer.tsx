import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Drawer from '../../../../geral/components/ui/Drawer';
import { apiFetch } from '../../../../geral/lib/http';
import { eBase } from '../../../../geral/lib/regrasProduto';
import { getProductProcessType } from '../../../lib/processoProduto';
import { mensagemErroServidor } from '../../../lib/usePreviaServidor';

interface Props {
  /** Todos os produtos do cadastro (inclui bases, kits e programadas). */
  products: any[];
  /** Códigos que já estão na fila (aviso de que a quantidade será substituída). */
  codigosNaFila: Set<string>;
  /** Produto já escolhido (atalho da aba Bases). */
  inicial?: { codigo: string; qtdKg?: number } | null;
  onClose: () => void;
  onAdicionado: () => void | Promise<void>;
}

/** Quantidade sugerida do item: a mesma fonte do Gerenciamento (produção recomendada / estoque ideal / lote mínimo). */
export function sugestaoParaFila(p: any): { base: boolean; unidade: 'un' | 'kg'; quantidade: number; kg: number; pesoUn: number | null } {
  const base = eBase(p.codigo, p.categoria_produto, p.status_produto);
  const proc = getProductProcessType(p);
  if (base || proc.unitWeightKg == null) {
    return { base, unidade: 'kg', quantidade: proc.reqQtyKg, kg: proc.reqQtyKg, pesoUn: null };
  }
  return { base, unidade: 'un', quantidade: proc.reqUnits, kg: proc.reqQtyKg, pesoUn: proc.unitWeightKg };
}

export function AdicionarFilaDrawer({ products, codigosNaFila, inicial, onClose, onAdicionado }: Props) {
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<any | null>(() => products.find(p => p.codigo === inicial?.codigo) ?? null);
  const [quantidade, setQuantidade] = useState<number>(() => {
    const p = products.find(x => x.codigo === inicial?.codigo);
    if (!p) return 0;
    return inicial?.qtdKg && inicial.qtdKg > 0 ? inicial.qtdKg : sugestaoParaFila(p).quantidade;
  });
  const [prioridade, setPrioridade] = useState(1);
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p => (p.codigo || '').toLowerCase().includes(q) || (p.descricao || '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [busca, products]);

  const sug = escolhido ? sugestaoParaFila(escolhido) : null;
  const kgCalculado = sug ? (sug.unidade === 'kg' ? quantidade : Math.round(quantidade * (sug.pesoUn ?? 1) * 10) / 10) : 0;

  const escolher = (p: any) => {
    setEscolhido(p);
    setQuantidade(sugestaoParaFila(p).quantidade);
    setErro('');
  };

  const adicionar = async () => {
    if (!escolhido || !sug || !(quantidade > 0)) return;
    setSalvando(true);
    setErro('');
    try {
      const res = await apiFetch('/producao/fila-demandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoProduto: escolhido.codigo,
          descricao: escolhido.descricao || escolhido.codigo,
          quantidade,
          unidade: sug.unidade,
          quantidadeKg: kgCalculado,
          origemDemanda: 'manual',
          prioridade,
          observacoes: observacoes.trim() || undefined,
          ...(sug.base ? { baseCodigo: escolhido.codigo, baseNome: escolhido.descricao } : {}),
        }),
      });
      if (!res.ok) {
        setErro(await mensagemErroServidor(res, 'Não foi possível adicionar à fila.'));
        return;
      }
      await onAdicionado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível adicionar à fila.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      size="sm"
      title="Adicionar item à fila"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer">
            Cancelar
          </button>
          <button
            type="button"
            disabled={salvando || !escolhido || !(quantidade > 0)}
            onClick={adicionar}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
          >
            OK, adicionar
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 text-xs">
        {erro && <div className="px-2 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold">{erro}</div>}

        {!escolhido ? (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar REF ou descrição de qualquer produto..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            {busca.trim() && resultados.length === 0 && <div className="py-4 text-center text-zinc-400">Nenhum produto encontrado.</div>}
            <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg max-h-[60vh] overflow-y-auto empty:hidden">
              {resultados.map(p => (
                <li key={p.codigo}>
                  <button
                    type="button"
                    onClick={() => escolher(p)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-zinc-50 cursor-pointer"
                  >
                    <span className="font-semibold text-zinc-900 truncate">{p.descricao}</span>
                    <span className="font-mono text-[10px] text-zinc-600 shrink-0">{p.codigo}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-200 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-zinc-900 truncate" title={escolhido.descricao}>{escolhido.descricao}</div>
                <div className="font-mono text-[10px] text-zinc-500">{escolhido.codigo}{sug?.base ? ' • Base' : ''}</div>
              </div>
              {!inicial && (
                <button type="button" onClick={() => setEscolhido(null)} className="text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 cursor-pointer shrink-0">
                  Trocar
                </button>
              )}
            </div>

            {codigosNaFila.has(escolhido.codigo) && (
              <div className="px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 font-semibold">
                Este item já está na fila: a quantidade será substituída.
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="font-bold text-zinc-700">Quantidade ({sug?.unidade === 'kg' ? 'kg' : 'un'})</span>
              <input
                type="number"
                min={1}
                value={quantidade || ''}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                className="px-2 py-1.5 border border-zinc-200 rounded-lg font-bold"
              />
              {sug?.unidade === 'un' && <span className="text-[10px] text-zinc-500">~{kgCalculado.toLocaleString('pt-BR')} kg de granel</span>}
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-bold text-zinc-700">Prioridade (menor vem primeiro)</span>
              <input
                type="number"
                min={1}
                value={prioridade}
                onChange={(e) => setPrioridade(Math.max(1, Number(e.target.value) || 1))}
                className="px-2 py-1.5 border border-zinc-200 rounded-lg"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-bold text-zinc-700">Observação</span>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                className="px-2 py-1.5 border border-zinc-200 rounded-lg"
              />
            </label>
          </div>
        )}
      </div>
    </Drawer>
  );
}
