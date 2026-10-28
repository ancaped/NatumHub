/**
 * Paginação do corpo de um POP: cada folha A4 é um modelo fixo e só o corpo central muda.
 * Função pura: recebe a altura de cada bloco (linha/parágrafo) e a altura útil do corpo de uma folha
 * e devolve, por folha, os índices dos blocos. Um bloco maior que a folha fica sozinho numa folha
 * (quem chama deve quebrá-lo antes). Sempre devolve ao menos uma folha.
 */
export function distribuirEmPaginas(alturas: number[], alturaPagina: number): number[][] {
  const paginas: number[][] = [[]];
  let usado = 0;
  alturas.forEach((h, i) => {
    const atual = paginas[paginas.length - 1];
    if (atual.length > 0 && usado + h > alturaPagina + 0.01) {
      paginas.push([i]);
      usado = h;
    } else {
      atual.push(i);
      usado += h;
    }
  });
  return paginas;
}

/** Quebra um texto em pedaços por palavras, cada um com `cabe(texto)` verdadeiro (ao menos uma palavra por pedaço). */
export function quebrarTextoPorPalavras(texto: string, cabe: (parcial: string) => boolean): string[] {
  const palavras = texto.split(/(?<=\s)/);
  const pedacos: string[] = [];
  let i = 0;
  while (i < palavras.length) {
    let lo = 1;
    let hi = palavras.length - i;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (cabe(palavras.slice(i, i + mid).join(''))) lo = mid;
      else hi = mid - 1;
    }
    pedacos.push(palavras.slice(i, i + lo).join(''));
    i += lo;
  }
  return pedacos;
}
