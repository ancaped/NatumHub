import React, { useState } from 'react';
import Drawer from '../../../geral/components/ui/Drawer';

export interface LinhaPrevia {
  titulo: string;
  detalhe?: string;
}

export interface PreviaAcao {
  titulo: string;
  linhas: LinhaPrevia[];
  avisos?: string[];
  confirmarRotulo: string;
  /** Exclusões: pede o motivo (obrigatório) antes do OK e o entrega a `executar`. */
  pedirMotivo?: boolean;
  executar: (motivo?: string) => Promise<void>;
}

/** Mostra o que a ação vai mudar (prévia do servidor) e só executa no OK. */
export default function PreviaAcaoDrawer({ previa, onClose }: { previa: PreviaAcao; onClose: () => void }) {
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState('');
  const [motivo, setMotivo] = useState('');
  const semMotivo = !!previa.pedirMotivo && motivo.trim() === '';

  const ok = async () => {
    setExecutando(true);
    setErro('');
    try {
      await previa.executar(previa.pedirMotivo ? motivo.trim() : undefined);
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setExecutando(false);
    }
  };

  return (
    <Drawer
      onClose={onClose}
      size="sm"
      title={previa.titulo}
      subtitle={`${previa.linhas.length} ${previa.linhas.length === 1 ? 'item' : 'itens'}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-200 bg-white text-zinc-700 cursor-pointer">
            Cancelar
          </button>
          <button
            type="button"
            disabled={executando || previa.linhas.length === 0 || semMotivo}
            onClick={ok}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-zinc-900 text-white disabled:opacity-50 cursor-pointer"
          >
            {previa.confirmarRotulo}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-4 text-xs">
        {erro && <div className="px-2 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold">{erro}</div>}
        {(previa.avisos ?? []).map((a) => (
          <div key={a} className="px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 font-semibold">{a}</div>
        ))}
        {previa.pedirMotivo && (
          <label className="flex flex-col gap-1">
            <span className="font-bold text-zinc-700">Motivo da exclusão (obrigatório)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Por que está apagando? Fica na auditoria com a cópia do registro."
              className="w-full px-2 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-900 outline-none focus:border-zinc-400"
            />
          </label>
        )}
        {previa.linhas.length === 0 ? (
          <div className="text-zinc-500">Nada para mudar.</div>
        ) : (
          <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg">
            {previa.linhas.map((l, i) => (
              <li key={`${l.titulo}-${i}`} className="flex items-center justify-between gap-2 px-2.5 py-2">
                <span className="font-semibold text-zinc-900 truncate">{l.titulo}</span>
                {l.detalhe && <span className="font-mono text-[10px] text-zinc-600 shrink-0">{l.detalhe}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
