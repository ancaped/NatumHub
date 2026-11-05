import React, { useEffect, useMemo, useState } from 'react';
import { Check, Link as LinkIcon, X } from 'lucide-react';
import Drawer from '../../../geral/components/ui/Drawer';
import { api } from '../../../geral/lib/api';
import type { GrupoSugestaoFornecedor } from '../../../geral/lib/types';
import { cn } from '../../../geral/lib/utils';

const CHAVE_IGNORADOS = 'natum_fornecedores_sugestoes_ignoradas';

function lerIgnorados(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_IGNORADOS) || '[]'));
  } catch {
    return new Set();
  }
}

const chaveGrupo = (g: GrupoSugestaoFornecedor) => g.membros.map((m) => m.id).sort().join('|');

/** Sugestões de cadastros que parecem a mesma empresa; unificar liga ao principal, sem apagar o código do ERP. */
export function SugestoesFornecedores({ onClose, onUnificado }: { onClose: () => void; onUnificado: () => void }) {
  const [grupos, setGrupos] = useState<GrupoSugestaoFornecedor[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ignorados, setIgnorados] = useState<Set<string>>(lerIgnorados);
  const [principal, setPrincipal] = useState<Record<string, string>>({});
  const [fora, setFora] = useState<Record<string, Set<string>>>({});
  const [gravando, setGravando] = useState<string | null>(null);

  const carregar = async () => {
    try {
      const g = await api.getSugestoesUnificacaoFornecedores();
      setGrupos(g);
      setPrincipal(Object.fromEntries(g.map((x) => [chaveGrupo(x), x.principalId])));
    } catch (e) {
      console.error(e);
      setErro('Não foi possível carregar as sugestões.');
    }
  };
  useEffect(() => {
    carregar();
  }, []);

  const visiveis = useMemo(() => (grupos ?? []).filter((g) => !ignorados.has(chaveGrupo(g))), [grupos, ignorados]);

  const ignorar = (g: GrupoSugestaoFornecedor) => {
    const n = new Set(ignorados);
    n.add(chaveGrupo(g));
    setIgnorados(n);
    try {
      localStorage.setItem(CHAVE_IGNORADOS, JSON.stringify([...n]));
    } catch {
      /* sem armazenamento: vale só nesta abertura */
    }
  };

  const alternar = (k: string, id: string) => {
    const n = new Set(fora[k] ?? []);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setFora({ ...fora, [k]: n });
  };

  const unificar = async (g: GrupoSugestaoFornecedor) => {
    const k = chaveGrupo(g);
    const pai = principal[k];
    const filhos = g.membros.map((m) => m.id).filter((id) => id !== pai && !(fora[k] ?? new Set()).has(id));
    if (!pai || filhos.length === 0) return;
    setGravando(k);
    try {
      await api.unifySuppliers(pai, filhos);
      setGrupos((atual) => (atual ?? []).filter((x) => chaveGrupo(x) !== k));
      onUnificado();
    } catch (e) {
      console.error(e);
      setErro('Erro ao unificar. Tente de novo.');
    } finally {
      setGravando(null);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      title="Sugestões de unificação"
      subtitle="Cadastros que parecem a mesma empresa"
      size="xl"
    >
      <div className="p-4 space-y-4">
        <p className="text-xs text-zinc-500">
          Unificar liga os cadastros ao fornecedor principal. Nada é apagado: o código do ERP de cada um continua valendo em pedidos e notas, e dá para desvincular depois.
          "CNPJ" = mesma raiz de CNPJ (matriz e filiais). "Nome" = nome equivalente, sem CNPJ que confirme: confira antes.
        </p>
        {erro && <p className="text-xs text-red-600">{erro}</p>}
        {grupos === null && !erro && <p className="text-sm text-zinc-400">Carregando sugestões...</p>}
        {grupos !== null && visiveis.length === 0 && <p className="text-sm text-zinc-400">Nenhuma sugestão pendente.</p>}
        {visiveis.map((g) => {
          const k = chaveGrupo(g);
          const pai = principal[k];
          const marcados = g.membros.filter((m) => m.id !== pai && !(fora[k] ?? new Set()).has(m.id)).length;
          return (
            <div key={k} className="border border-zinc-200 rounded-xl bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-200">
                <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', g.criterio === 'CNPJ' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>
                  {g.criterio}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => ignorar(g)} className="text-xs text-zinc-500 hover:text-zinc-800 px-2 py-1 flex items-center gap-1 cursor-pointer" title="Não é a mesma empresa: não sugerir de novo">
                    <X className="h-3.5 w-3.5" /> Não é o mesmo
                  </button>
                  <button
                    type="button"
                    disabled={marcados === 0 || gravando === k}
                    onClick={() => unificar(g)}
                    className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-md font-medium hover:bg-zinc-800 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                  >
                    <LinkIcon className="h-3.5 w-3.5" /> {gravando === k ? 'Unificando...' : `Unificar ${marcados + 1} cadastros`}
                  </button>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead className="text-zinc-400">
                  <tr>
                    <th className="px-3 py-1.5 text-left w-20">Principal</th>
                    <th className="px-3 py-1.5 text-left w-8"></th>
                    <th className="px-3 py-1.5 text-left">Cadastro</th>
                    <th className="px-3 py-1.5 text-left">CNPJ</th>
                    <th className="px-3 py-1.5 text-right">Pedidos</th>
                    <th className="px-3 py-1.5 text-right">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {g.membros.map((m) => {
                    const ehPrincipal = m.id === pai;
                    const incluido = ehPrincipal || !(fora[k] ?? new Set()).has(m.id);
                    return (
                      <tr key={m.id} className={cn(!incluido && 'opacity-50')}>
                        <td className="px-3 py-2">
                          <input type="radio" name={`p_${k}`} checked={ehPrincipal} onChange={() => setPrincipal({ ...principal, [k]: m.id })} />
                        </td>
                        <td className="px-3 py-2">
                          {!ehPrincipal && <input type="checkbox" checked={incluido} onChange={() => alternar(k, m.id)} />}
                          {ehPrincipal && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-zinc-900">{m.name}</div>
                          <div className="font-mono text-[10px] text-zinc-400">
                            cód. {m.id}
                            {m.parentId && m.parentId !== pai ? ` · já ligado ao ${m.parentId}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-zinc-600 whitespace-nowrap">{m.cnpj || '—'}</td>
                        <td className="px-3 py-2 text-right">{m.pedidos}</td>
                        <td className="px-3 py-2 text-right">{m.notas}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
