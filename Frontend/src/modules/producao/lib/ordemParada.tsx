/** Ordem de montagem aberta há mais de 15 dias: provavelmente já montada e não fechada (decisão 32). */
export const DIAS_ORDEM_PARADA = 15;

export function diasOrdemParada(ordem: { status?: string; createdAt?: string; created_at?: string }): number | null {
  const status = String(ordem?.status || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'CANCELADO') return null;
  const criada = new Date(ordem?.createdAt || ordem?.created_at || '');
  if (Number.isNaN(criada.getTime())) return null;
  const dias = Math.floor((Date.now() - criada.getTime()) / 86_400_000);
  return dias > DIAS_ORDEM_PARADA ? dias : null;
}

export function SeloOrdemParada({ ordem }: { ordem: any }) {
  const dias = diasOrdemParada(ordem);
  if (dias == null) return null;
  return (
    <span
      className="ml-1 inline-block px-1.5 py-0.5 rounded border border-zinc-300 bg-zinc-100 text-zinc-600 text-[9px] font-bold whitespace-nowrap"
      title="Ordem aberta há muito tempo. Se já foi montada, conclua; senão, exclua. Enquanto aberta, ela reserva os componentes."
    >
      parada há {dias} dias
    </span>
  );
}
