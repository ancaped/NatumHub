export interface NotaRecebida {
  invoiceNumber: string;
  invoiceDate: string;
}

/** Nota mais recente da lista (por data); sem notas ou sem data válida devolve null. */
export function ultimoRecebimento(notas: NotaRecebida[] | null | undefined): NotaRecebida | null {
  let melhor: NotaRecebida | null = null;
  let melhorTempo = -Infinity;
  for (const nota of notas ?? []) {
    const tempo = new Date(nota.invoiceDate).getTime();
    if (Number.isNaN(tempo)) continue;
    if (tempo > melhorTempo) {
      melhor = nota;
      melhorTempo = tempo;
    }
  }
  return melhor;
}
