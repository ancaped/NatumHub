// Regras de produto num lugar só no front. Espelham `Backend/src/core/regras_produto.rs`
// e os padrões de settings (dias comerciais, itens por página, status ignorados).

/** Status que tiram o produto da lista de ativos quando a setting `ignored_product_statuses` não existe. */
export const STATUS_IGNORADOS_PADRAO: string[] = ['descontinuado', 'terceirizado'];

/** Padrões das settings globais da Linha de Produtos / Produção (um valor só, guardado no servidor). */
export const DIAS_COMERCIAIS_PADRAO = 30;
export const LIMITE_POR_PAGINA_PADRAO = 30;

/** Base de produção: categoria `cat_base`, status `bases` ou código com segmento ".36.". */
export function eBase(codigo?: string | null, categoriaProduto?: string | null, statusProduto?: string | null): boolean {
  return categoriaProduto === 'cat_base' || statusProduto === 'bases' || String(codigo ?? '').includes('.36.');
}

/** Produto ativo = status efetivo fora dos status ignorados e produto visível. */
export function produtoAtivo(statusEfetivo: string | null | undefined, visivel: number | boolean | null | undefined, ignorados: string[]): boolean {
  const status = statusEfetivo || 'ativo';
  return !ignorados.includes(status) && visivel !== 0 && visivel !== false;
}

/**
 * Setting numérica global: usa o valor do servidor; se não existir, usa o valor antigo do localStorage
 * (e pede para gravar no servidor, `migrar`); senão, o padrão.
 */
export function resolverSettingNumerica(
  valorServidor: string | null | undefined,
  valorLocal: string | null | undefined,
  padrao: number,
): { valor: number; migrar: boolean } {
  const servidor = parseInt(String(valorServidor ?? ''), 10);
  if (Number.isFinite(servidor) && servidor > 0) return { valor: servidor, migrar: false };
  const local = parseInt(String(valorLocal ?? ''), 10);
  if (Number.isFinite(local) && local > 0) return { valor: local, migrar: true };
  return { valor: padrao, migrar: false };
}
