import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../geral/lib/api';
import type { ListaCompraItem, ModuloListaCompra } from '../../geral/lib/types';

const MODULOS: string[] = ['materia_prima', 'embalagens', 'coloracao', 'apoio'];
export const EVENTO_LISTA_COMPRA = 'compras_lista_atualizada';

export const chaveItem = (code: string) => (code || '').replace(/\./g, '').trim();

/**
 * Lista de Compra do módulo, guardada no servidor. Módulo fora dos 4 (ex.: `simulation`, `all`) = lista vazia e inerte.
 * Toda instância recarrega ao montar e quando outra grava (evento `compras_lista_atualizada`).
 */
export function useListaCompra(modulo?: string) {
  const valido = !!modulo && MODULOS.includes(modulo);
  const moduloAtual = valido ? (modulo as ModuloListaCompra) : null;
  const [itens, setItens] = useState<ListaCompraItem[]>([]);
  const moduloRef = useRef<ModuloListaCompra | null>(moduloAtual);
  moduloRef.current = moduloAtual;

  const recarregar = useCallback(async () => {
    const m = moduloRef.current;
    if (!m) {
      setItens([]);
      return;
    }
    try {
      const r = await api.getListaCompra(m);
      if (moduloRef.current !== m) return; // resposta atrasada de um módulo anterior
      setItens(r.itens || []);
    } catch (e) {
      console.error('Erro ao carregar a Lista de Compra:', e);
    }
  }, []);

  useEffect(() => {
    setItens([]);
    recarregar();
    window.addEventListener(EVENTO_LISTA_COMPRA, recarregar);
    return () => window.removeEventListener(EVENTO_LISTA_COMPRA, recarregar);
  }, [moduloAtual, recarregar]);

  const chaves = useMemo(() => new Set(itens.map((i) => chaveItem(i.itemCode))), [itens]);
  const codigos = useMemo(() => itens.map((i) => i.itemCode), [itens]);
  const temItem = useCallback((code: string) => chaves.has(chaveItem(code)), [chaves]);

  const gravar = useCallback(async (fn: (m: ModuloListaCompra) => Promise<unknown>): Promise<boolean> => {
    const m = moduloRef.current;
    if (!m) return false;
    try {
      await fn(m);
      window.dispatchEvent(new Event(EVENTO_LISTA_COMPRA));
      return true;
    } catch (e: any) {
      alert(e?.message || 'Não foi possível gravar a Lista de Compra.');
      recarregar();
      return false;
    }
  }, [recarregar]);

  const adicionar = useCallback(
    (codes: string[]) => (codes.length ? gravar((m) => api.adicionarItensListaCompra(m, codes)) : Promise.resolve(true)),
    [gravar],
  );
  const remover = useCallback(
    (codes: string[]) => (codes.length ? gravar((m) => api.removerItensListaCompra(m, codes)) : Promise.resolve(true)),
    [gravar],
  );
  const ajustar = useCallback(
    (code: string, ajuste: { quantidadeManual: number | null; mediaManual: number | null }) =>
      gravar((m) => api.ajustarItemListaCompra(m, code, ajuste)),
    [gravar],
  );

  return { itens, codigos, temItem, adicionar, remover, ajustar, recarregar };
}
