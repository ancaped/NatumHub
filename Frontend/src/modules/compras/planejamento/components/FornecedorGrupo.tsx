import React from 'react';
import { Users } from 'lucide-react';

/** Fornecedor do último pedido do item; sem pedido nunca feito, cai aqui. */
export const SEM_FORNECEDOR = 'Sem pedido';
export const FILTRO_SEM_FORNECEDOR = '__sem';

export function nomeFornecedor(f?: string | null): string {
  return (f || '').trim() || SEM_FORNECEDOR;
}

export function opcoesFornecedor(nomes: Array<string | null | undefined>): { nome: string; qtd: number }[] {
  const cont = new Map<string, number>();
  for (const n of nomes) cont.set(nomeFornecedor(n), (cont.get(nomeFornecedor(n)) ?? 0) + 1);
  return [...cont.entries()]
    .map(([nome, qtd]) => ({ nome, qtd }))
    .sort((a, b) => (a.nome === SEM_FORNECEDOR ? 1 : b.nome === SEM_FORNECEDOR ? -1 : a.nome.localeCompare(b.nome, 'pt-BR')));
}

export function passaFornecedor(filtro: string, f?: string | null): boolean {
  if (!filtro) return true;
  const n = nomeFornecedor(f);
  return filtro === FILTRO_SEM_FORNECEDOR ? n === SEM_FORNECEDOR : n === filtro;
}

/** Ordem para agrupar: por nome do fornecedor, "Sem pedido" por último. */
export function compararFornecedor(a?: string | null, b?: string | null): number {
  const na = nomeFornecedor(a);
  const nb = nomeFornecedor(b);
  if (na === nb) return 0;
  if (na === SEM_FORNECEDOR) return 1;
  if (nb === SEM_FORNECEDOR) return -1;
  return na.localeCompare(nb, 'pt-BR');
}

/** Filtro por fornecedor + "agrupar", igual nos quatro módulos de Compras. */
export function FiltroFornecedor({
  valor, onValor, opcoes, agrupar, onAgrupar,
}: {
  valor: string;
  onValor: (v: string) => void;
  opcoes: { nome: string; qtd: number }[];
  agrupar: boolean;
  onAgrupar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-zinc-500" />
      <select
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 bg-white focus:ring-1 focus:ring-zinc-900 focus:outline-none max-w-[220px]"
        title="Fornecedor do último pedido de cada item"
      >
        <option value="">Todos os fornecedores</option>
        {opcoes.map((o) => (
          <option key={o.nome} value={o.nome === SEM_FORNECEDOR ? FILTRO_SEM_FORNECEDOR : o.nome}>
            {o.nome} ({o.qtd})
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer select-none whitespace-nowrap">
        <input type="checkbox" checked={agrupar} onChange={(e) => onAgrupar(e.target.checked)} className="rounded border-zinc-300" />
        Agrupar por fornecedor
      </label>
    </div>
  );
}

/** Linha de título de grupo dentro da tabela. */
export function LinhaGrupoFornecedor({ nome, colSpan }: { nome: string; colSpan: number }) {
  return (
    <tr className="bg-zinc-50">
      <td colSpan={colSpan} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">{nome}</td>
    </tr>
  );
}
