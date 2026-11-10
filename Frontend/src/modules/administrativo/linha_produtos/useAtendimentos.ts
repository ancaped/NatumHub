import { useEffect, useState } from 'react';
import { apiFetch } from '../../geral/lib/http';
import type { AtendimentosInfo } from './tipos';

const VAZIO: AtendimentosInfo = { linhas: {}, produtos: {} };

/** Atendimento e situação ativa das linhas e dos produtos com exceção; recarrega quando `gatilho` muda. */
export function useAtendimentos(gatilho: unknown): AtendimentosInfo {
  const [info, setInfo] = useState<AtendimentosInfo>(VAZIO);
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await apiFetch('/admin/produtos-ativos/linhas/atendimentos');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelado) setInfo({ linhas: data?.linhas ?? {}, produtos: data?.produtos ?? {} });
      } catch {
        /* sem os dados a tela mostra só a situação */
      }
    })();
    return () => { cancelado = true; };
  }, [gatilho]);
  return info;
}
