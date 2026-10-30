import { useCallback, useState } from 'react';
import Drawer from '../../../geral/components/ui/Drawer';
import { usePreviaServidor } from '../../../producao/lib/usePreviaServidor';
import type { TipoAviso } from '../../../geral/components/ui/Aviso';
import { fmtData, rev2 } from './formularios/montagem';

const MOTIVO_PADRAO = 'Emissão inicial na codificação nova';

export interface PedidoLote {
  /** Rota de emissão em lote (sem `confirmar`). */
  url: string;
  /** Seleção enviada ao servidor: `{ ids }`, `{ codes }` ou `{ setor }`. */
  selecao: Record<string, unknown>;
  /** Ex.: «3 POPs» ou «POPs do setor Controle de Qualidade». */
  descricao: string;
  /** `POPs` ou `formulários`, para os textos. */
  tipo: string;
}

interface Emitido {
  code: string;
  title: string;
  revisao: number;
  vigencia?: string | null;
  proximaRevisao?: string | null;
  vencida?: boolean;
}

interface Ignorado {
  code: string;
  motivo: string;
}

/**
 * Emitir em lote (POPs e formulários): pede o motivo, mostra a prévia do servidor (o que entra, com revisão,
 * vigência e próxima revisão, e o que foi ignorado) e só grava no OK. Renderize `elemento` uma vez na tela.
 */
export function useEmitirLote(avisar: (mensagem: string, tipo?: TipoAviso) => void, aoEmitir: () => void) {
  const { pedir, elemento: previaElemento } = usePreviaServidor(avisar);
  const [pedido, setPedido] = useState<PedidoLote | null>(null);
  const [motivo, setMotivo] = useState(MOTIVO_PADRAO);

  const abrir = useCallback((p: PedidoLote) => {
    setMotivo(MOTIVO_PADRAO);
    setPedido(p);
  }, []);

  const verPrevia = () => {
    if (!pedido || !motivo.trim()) return;
    const p = pedido;
    setPedido(null);
    void pedir({
      url: p.url,
      init: { method: 'POST', body: JSON.stringify({ ...p.selecao, motivo: motivo.trim() }) },
      titulo: `Emitir ${p.tipo}`,
      confirmarRotulo: 'Emitir',
      linhas: (d) =>
        ((d?.emitidos ?? []) as Emitido[]).map((e) => ({
          titulo: `${e.code} · ${e.title}`,
          detalhe: `Rev. ${rev2(e.revisao)} · vigência ${fmtData(e.vigencia) || 'hoje'} · próxima ${fmtData(e.proximaRevisao) || '—'}${e.vencida ? ' (vencida)' : ''}`,
        })),
      avisos: (d) => {
        const lista: string[] = [];
        if (Number(d?.vencidos) > 0) lista.push(`${d.vencidos} ficam com a próxima revisão já vencida (aparecem no alerta de revisão).`);
        const ign = (d?.ignorados ?? []) as Ignorado[];
        if (ign.length > 0) {
          const exemplos = ign.slice(0, 8).map((i) => `${i.code} (${i.motivo})`).join(', ');
          lista.push(`${ign.length} ignorados: ${exemplos}${ign.length > 8 ? '…' : ''}`);
        }
        if ((d?.emitidos ?? []).length === 0) lista.push('Nada para emitir nesta seleção.');
        return lista;
      },
      erroPadrao: `Não foi possível emitir os ${p.tipo}.`,
      aoConcluir: async (feito) => {
        avisar(`${feito?.total ?? 0} ${p.tipo} emitidos.`, 'sucesso');
        aoEmitir();
      },
    });
  };

  const elemento = (
    <>
      {pedido && (
        <Drawer
          onClose={() => setPedido(null)}
          size="sm"
          title={`Emitir ${pedido.tipo}`}
          subtitle={pedido.descricao}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPedido(null)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!motivo.trim()}
                onClick={verPrevia}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
              >
                Ver prévia
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-2 p-4 text-xs">
            <p className="text-zinc-600">
              Leva o que está em rascunho ou em aprovação direto a vigente, com você como aprovador. O que já está vigente ou obsoleto é ignorado.
            </p>
            <label className="font-semibold text-zinc-700" htmlFor="motivo-lote">Motivo (vai para a trilha de cada documento)</label>
            <textarea
              id="motivo-lote"
              rows={3}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </Drawer>
      )}
      {previaElemento}
    </>
  );

  return { abrir, elemento };
}
