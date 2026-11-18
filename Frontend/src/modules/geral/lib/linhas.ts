/**
 * Linhas de produto e sublinhas — helper compartilhado (sem dependência de tela).
 * Fonte dos dados: `GET /api/configs` (cada linha traz `linha_principal`; nulo = linha própria).
 * Um nível só: sublinha não tem sublinha. Quem pertence a quem é o Edson que aponta, no Administrativo.
 */

/** O mínimo que o helper precisa de uma linha; `LineConfig` de qualquer módulo serve. */
export interface LinhaBase {
  linha_prefix: string;
  nome_linha: string;
  /** Prefixo da linha principal; nulo/ausente = linha própria (ou principal de outras). */
  linha_principal?: string | null;
}

/** Uma linha do agrupamento: `nivel` 0 = principal ou própria, 1 = sublinha (logo abaixo da principal dela). */
export interface LinhaAgrupada<T extends LinhaBase = LinhaBase> {
  linha: T;
  nivel: 0 | 1;
  /** Só no nível 0: tem sublinhas. */
  temSublinhas: boolean;
}

/** Chave de ordenação do prefixo: numérica (9.15 depois de 9 e antes de 10); DEFAULT e não numéricos por último. */
function chavePrefixo(prefixo: string): number {
  if (prefixo === 'DEFAULT') return Infinity;
  const n = parseFloat(prefixo);
  return Number.isNaN(n) ? Infinity : n;
}

/** Ordena por prefixo (numérico, DEFAULT por último), sem alterar a lista recebida. */
export function ordenarPorPrefixo<T extends LinhaBase>(linhas: readonly T[]): T[] {
  return [...linhas].sort((a, b) => {
    const ka = chavePrefixo(a.linha_prefix);
    const kb = chavePrefixo(b.linha_prefix);
    return ka === kb ? a.linha_prefix.localeCompare(b.linha_prefix) : ka - kb;
  });
}

/** Prefixo da principal só se ela existe na lista (principal apagada ou ausente vira linha própria). */
function principalValida(linhas: readonly LinhaBase[], l: LinhaBase): string | null {
  const p = l.linha_principal;
  if (!p || p === l.linha_prefix) return null;
  return linhas.some(x => x.linha_prefix === p) ? p : null;
}

/** Sublinhas de cada principal (ordenadas por prefixo). */
export function sublinhasPorPrincipal<T extends LinhaBase>(linhas: readonly T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) {
    const pai = principalValida(linhas, l);
    if (pai) mapa.set(pai, [...(mapa.get(pai) || []), l]);
  }
  for (const [pai, filhas] of mapa) mapa.set(pai, ordenarPorPrefixo(filhas));
  return mapa;
}

/** Cada principal (ou linha própria) seguida das sublinhas dela, tudo na ordem por prefixo. */
export function agruparLinhas<T extends LinhaBase>(linhas: readonly T[]): LinhaAgrupada<T>[] {
  const filhas = sublinhasPorPrincipal(linhas);
  const saida: LinhaAgrupada<T>[] = [];
  for (const l of ordenarPorPrefixo(linhas.filter(x => !principalValida(linhas, x)))) {
    const subs = filhas.get(l.linha_prefix) || [];
    saida.push({ linha: l, nivel: 0, temSublinhas: subs.length > 0 });
    for (const s of subs) saida.push({ linha: s, nivel: 1, temSublinhas: false });
  }
  return saida;
}

/** A linha e, se for principal, as sublinhas dela (prefixo da própria linha primeiro). Prefixo desconhecido volta sozinho. */
export function prefixosDaLinha(linhas: readonly LinhaBase[], prefixo: string): string[] {
  const subs = linhas.filter(l => principalValida(linhas, l) === prefixo).map(l => l.linha_prefix);
  return [prefixo, ...ordenarPorPrefixo(linhas.filter(l => subs.includes(l.linha_prefix))).map(l => l.linha_prefix)];
}

/** "Natum › Natum Extra" para sublinha; só o nome para as outras; o próprio prefixo se a linha não existe. */
export function rotuloLinha(linhas: readonly LinhaBase[], prefixo: string): string {
  const l = linhas.find(x => x.linha_prefix === prefixo);
  if (!l) return prefixo;
  const nome = l.nome_linha || l.linha_prefix;
  const pai = principalValida(linhas, l);
  if (!pai) return nome;
  const p = linhas.find(x => x.linha_prefix === pai);
  return `${p?.nome_linha || pai} › ${nome}`;
}

/**
 * Marca/desmarca uma linha num filtro de seleção múltipla: marcar a principal marca as sublinhas;
 * desmarcar a principal desmarca as sublinhas; mexer numa sublinha só mexe nela.
 */
export function alternarLinhaNoFiltro(linhas: readonly LinhaBase[], marcados: ReadonlySet<string>, prefixo: string): Set<string> {
  const novo = new Set(marcados);
  const grupo = prefixosDaLinha(linhas, prefixo);
  if (marcados.has(prefixo)) grupo.forEach(p => novo.delete(p));
  else grupo.forEach(p => novo.add(p));
  return novo;
}
