import { prefixosDaLinha, rotuloLinha, sublinhasPorPrincipal, type LinhaBase } from '../../geral/lib/linhas';

/**
 * Nome da linha para tabelas e cartões: "Natum › Natum Extra" só quando a linha é sublinha;
 * nas demais devolve o nome que a linha já tinha (sem nenhuma sublinha apontada nada muda).
 */
export function rotuloLinhaProducao(configs: readonly LinhaBase[] | undefined, prefixo: string | null | undefined, nomeOriginal: string | null | undefined): string {
  const nome = nomeOriginal ?? '';
  if (!configs || !prefixo) return nome;
  const r = rotuloLinha(configs, prefixo);
  return r.includes(' › ') ? r : nome;
}

/** A linha escolhida no filtro contém este prefixo? (principal inclui as sublinhas; vazio/'ALL' = tudo) */
export function linhaCasa(configs: readonly LinhaBase[] | undefined, escolhida: string, prefixo: string | null | undefined): boolean {
  if (!escolhida || escolhida === 'ALL' || escolhida === 'todas') return true;
  return prefixosDaLinha(configs ?? [], escolhida).includes(prefixo ?? '');
}

/** Mantém a ordem recebida; só as sublinhas saem do lugar e vão para logo abaixo da principal (se ela está na lista). */
export function sublinhasSobPrincipal<T extends LinhaBase>(lista: readonly T[]): T[] {
  const subs = sublinhasPorPrincipal(lista);
  const filhas = new Set([...subs.values()].flat().map(c => c.linha_prefix));
  return lista.filter(c => !filhas.has(c.linha_prefix)).flatMap(c => [c, ...(subs.get(c.linha_prefix) || [])]);
}

/** Recuo (espaços duros) das sublinhas em `<option>`. */
export const RECUO_SUBLINHA = '    ';
