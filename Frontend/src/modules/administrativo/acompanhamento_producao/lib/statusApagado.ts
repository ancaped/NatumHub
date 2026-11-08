import type { StatusApagadoPrevia } from './tipos';

export const statusApagadoParaLinha = (a: StatusApagadoPrevia) => ({
  titulo: `Lote ${a.loteNumber}`,
  detalhe: [a.statusAnterior, a.category, a.motivoEspera].filter(Boolean).join(' · '),
});
