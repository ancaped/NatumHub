import React, { useCallback, useState } from 'react';
import { apiFetch } from '../../geral/lib/http';
import PreviaAcaoDrawer, { LinhaPrevia, PreviaAcao } from '../gerenciamento/components/PreviaAcaoDrawer';
import type { TipoAviso } from '../../geral/components/ui/Aviso';

/** Lê `{ error }` da resposta do servidor e cai no texto padrão se o corpo não vier. */
export async function mensagemErroServidor(res: Response, padrao: string): Promise<string> {
  try {
    const err = await res.json();
    if (err?.error) return String(err.error);
  } catch { /* corpo vazio */ }
  return padrao;
}

export interface PedidoPrevia {
  /** Caminho da API (sem `confirmar`). */
  url: string;
  init?: RequestInit;
  titulo: string;
  confirmarRotulo: string;
  /** Linhas da prévia, a partir do JSON que o servidor devolveu sem `confirmar`. */
  linhas: (dados: any) => LinhaPrevia[];
  avisos?: (dados: any) => string[];
  erroPadrao: string;
  /** Roda depois que o servidor gravou (recarregar a tela etc.). */
  aoConcluir?: (dados: any) => void | Promise<void>;
}

/**
 * Escrita em 2 passos: pede a prévia ao servidor (sem `confirmar`), mostra no `PreviaAcaoDrawer` e só grava
 * (`confirmar=true`) no OK. Renderize `elemento` uma vez no componente.
 */
export function usePreviaServidor(avisar: (mensagem: string, tipo?: TipoAviso) => void) {
  const [previa, setPrevia] = useState<PreviaAcao | null>(null);

  const pedir = useCallback(async (p: PedidoPrevia) => {
    try {
      const res = await apiFetch(p.url, p.init);
      if (!res.ok) {
        avisar(await mensagemErroServidor(res, p.erroPadrao), 'erro');
        return;
      }
      const dados = await res.json();
      setPrevia({
        titulo: p.titulo,
        linhas: p.linhas(dados),
        avisos: p.avisos?.(dados),
        confirmarRotulo: p.confirmarRotulo,
        executar: async () => {
          const sep = p.url.includes('?') ? '&' : '?';
          const r = await apiFetch(`${p.url}${sep}confirmar=true`, p.init);
          if (!r.ok) throw new Error(await mensagemErroServidor(r, p.erroPadrao));
          const feito = await r.json().catch(() => ({}));
          await p.aoConcluir?.(feito);
        },
      });
    } catch (e) {
      console.error(p.erroPadrao, e);
      avisar(p.erroPadrao, 'erro');
    }
  }, [avisar]);

  /** Prévia montada na própria tela (ação sem 2 passos no servidor): mostra o que vai acontecer e executa no OK. */
  const abrir = useCallback((p: PreviaAcao) => setPrevia(p), []);

  const elemento = previa ? <PreviaAcaoDrawer previa={previa} onClose={() => setPrevia(null)} /> : null;
  return { pedir, abrir, elemento };
}

const num = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Prévia de `PATCH /producao/fila-demandas/:id`: quantidade (e kg) de antes e depois. */
export function linhasAjusteFila(dados: any): LinhaPrevia[] {
  const a = dados?.item?.antes ?? {};
  const d = dados?.item?.depois ?? {};
  const kg = (x: any) => (x.quantidade_kg != null ? ` (${num(x.quantidade_kg)} kg)` : '');
  return [{
    titulo: d.descricao || a.descricao || d.codigo_produto || 'Item da fila',
    detalhe: `${num(a.quantidade)} ${a.unidade ?? ''}${kg(a)} → ${num(d.quantidade)} ${d.unidade ?? ''}${kg(d)}`,
  }];
}

/** Prévia de `DELETE /producao/fila-demandas/:id`: o item que sairia da fila. */
export function linhasExclusaoFila(dados: any): LinhaPrevia[] {
  const i = dados?.item ?? {};
  return [{
    titulo: i.descricao || i.codigo_produto || 'Item da fila',
    detalhe: `${num(i.quantidade)} ${i.unidade ?? ''}${i.quantidade_kg != null ? ` (${num(i.quantidade_kg)} kg)` : ''}`,
  }];
}
