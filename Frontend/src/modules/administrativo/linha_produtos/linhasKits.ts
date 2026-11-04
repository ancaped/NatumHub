import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../geral/lib/http';

export interface LinhaKit {
  id: string;
  nome: string;
  prefixos: string[];
  ordem: number;
  kits: number;
}

export interface KitComLinha {
  codigo: string;
  descricao: string;
  composicao: number;
  linhaSugerida: string | null;
  linhaManual: string | null;
  linha: string | null;
}

const BASE = '/admin/produtos-ativos/linhas-kits';

/** Chamada às rotas de linhas de kits. Sem `confirmar` o servidor só devolve a prévia. */
export async function chamarLinhasKits(
  caminho: string,
  metodo: 'GET' | 'POST' | 'DELETE',
  corpo: unknown,
  opts: { confirmar?: boolean; motivo?: string } = {},
) {
  const qs = new URLSearchParams();
  if (opts.confirmar) qs.set('confirmar', 'true');
  if (opts.motivo) qs.set('motivo', opts.motivo);
  const query = qs.toString();
  const res = await apiFetch(`${BASE}${caminho}${query ? `?${query}` : ''}`, {
    method: metodo,
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível concluir.');
  return data;
}

/** Linhas de kits e kits ativos com a linha de cada um; carrega quando `ativo` (aba aberta). */
export function useLinhasKits(ativo: boolean) {
  const [linhas, setLinhas] = useState<LinhaKit[]>([]);
  const [kits, setKits] = useState<KitComLinha[]>([]);

  const recarregar = useCallback(async () => {
    try {
      const data = await chamarLinhasKits('', 'GET', undefined);
      setLinhas(Array.isArray(data?.linhas) ? data.linhas : []);
      setKits(Array.isArray(data?.kits) ? data.kits : []);
    } catch {
      setLinhas([]);
      setKits([]);
    }
  }, []);

  useEffect(() => {
    if (ativo) void recarregar();
  }, [ativo, recarregar]);

  return { linhas, kits, recarregar };
}
