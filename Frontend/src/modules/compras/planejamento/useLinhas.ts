import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../../geral/lib/http';
import { prefixosDaLinha, rotuloLinha, sublinhasPorPrincipal, type LinhaBase } from '../../geral/lib/linhas';

/**
 * Linhas e sublinhas para as telas do Compras (usa o helper compartilhado `geral/lib/linhas`).
 * Sem nenhuma sublinha apontada, tudo aqui devolve exatamente o que a tela já mostrava.
 */
export function useLinhas(): LinhaBase[] {
  const [linhas, setLinhas] = useState<LinhaBase[]>([]);
  useEffect(() => {
    let vivo = true;
    apiJson<LinhaBase[]>('/api/configs')
      .then(r => { if (vivo && Array.isArray(r)) setLinhas(r); })
      .catch(() => { /* sem as linhas, a tela segue como antes (sem sublinhas) */ });
    return () => { vivo = false; };
  }, []);
  return linhas;
}

/** Prefixos de todas as sublinhas válidas. */
function prefixosDeSublinhas(linhas: readonly LinhaBase[]): Set<string> {
  const s = new Set<string>();
  for (const subs of sublinhasPorPrincipal(linhas).values()) subs.forEach(l => s.add(l.linha_prefix));
  return s;
}

/** "Natum › Natum Extra" se for sublinha; senão devolve o nome que a tela já usava. */
export function rotuloSeSublinha(linhas: readonly LinhaBase[], prefixo: string | undefined, nomeOriginal: string): string {
  if (!prefixo || !prefixosDeSublinhas(linhas).has(prefixo)) return nomeOriginal;
  return rotuloLinha(linhas, prefixo);
}

/** Prefixos que o filtro aceita ao escolher `prefixo`: a linha e, se for principal, as sublinhas. */
export function prefixosDoFiltro(linhas: readonly LinhaBase[], prefixo: string): string[] {
  return prefixosDaLinha(linhas, prefixo);
}

export interface OpcaoLinha<T> { item: T; nivel: 0 | 1 }

/**
 * Mantém a ordem recebida; cada sublinha vai logo abaixo da principal (só se a principal estiver na lista).
 * Sem sublinhas, devolve a lista como veio (nível 0).
 */
export function opcoesComSublinhas<T>(linhas: readonly LinhaBase[], itens: readonly T[], prefixoDe: (i: T) => string | undefined): OpcaoLinha<T>[] {
  const planas = itens.map(item => ({ item, nivel: 0 as const }));
  const mapa = sublinhasPorPrincipal(linhas);
  if (mapa.size === 0) return planas;
  const presentes = new Set(itens.map(prefixoDe).filter((p): p is string => !!p));
  const aninhada = new Set<string>();
  for (const [pai, subs] of mapa) if (presentes.has(pai)) subs.forEach(s => { if (presentes.has(s.linha_prefix)) aninhada.add(s.linha_prefix); });
  if (aninhada.size === 0) return planas;
  const saida: OpcaoLinha<T>[] = [];
  for (const item of itens) {
    const p = prefixoDe(item);
    if (p && aninhada.has(p)) continue;
    saida.push({ item, nivel: 0 });
    const filhas = p ? mapa.get(p) : undefined;
    if (filhas) for (const f of filhas) {
      const sub = itens.find(i => prefixoDe(i) === f.linha_prefix);
      if (sub !== undefined && aninhada.has(f.linha_prefix)) saida.push({ item: sub, nivel: 1 });
    }
  }
  return saida;
}

/** Atalho memoizado para telas que identificam a linha pelo nome (SimulationTab). */
export function useLinhasPorNome(linhas: readonly LinhaBase[]) {
  return useMemo(() => {
    const prefixoPorNome = (nome: string) => linhas.find(l => l.nome_linha === nome)?.linha_prefix;
    return {
      prefixoPorNome,
      /** Nomes que o filtro aceita ao escolher `nome`: a linha e as sublinhas dela. */
      nomesDoFiltro: (nome: string): string[] => {
        const p = prefixoPorNome(nome);
        if (!p) return [nome];
        return prefixosDaLinha(linhas, p).map(x => linhas.find(l => l.linha_prefix === x)?.nome_linha || x);
      },
      rotuloPorNome: (nome: string): string => rotuloSeSublinha(linhas, prefixoPorNome(nome), nome),
    };
  }, [linhas]);
}
