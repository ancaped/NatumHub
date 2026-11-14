import { useEffect, useState } from 'react';
import { apiFetch } from '../../geral/lib/http';

/** Chaves dos parâmetros que uma sublinha pode herdar da principal (as mesmas da API). */
export type ParametroLinha = 'estoque_ideal' | 'abrir_ordem' | 'abrir_prod' | 'fator_z' | 'atendimento';

export interface HerancaLinha {
  linhaPrincipal: string | null;
  herda: Record<ParametroLinha, boolean>;
  /** Escolha da própria linha (a linha só aparece ativa se a principal também estiver). */
  ativaPropria: boolean;
}

/** Linha principal, marcas de herança e escolha própria de ativa/inativa de cada linha; recarrega quando `gatilho` muda. */
export function useHeranca(gatilho: unknown, versao = 0): Record<string, HerancaLinha> {
  const [info, setInfo] = useState<Record<string, HerancaLinha>>({});
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await apiFetch('/admin/produtos-ativos/linhas/heranca');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelado) setInfo(data?.linhas ?? {});
      } catch {
        /* sem os dados a tela mostra as linhas sem agrupamento */
      }
    })();
    return () => { cancelado = true; };
  }, [gatilho, versao]);
  return info;
}
