import React from 'react';
import type { EventoPop } from './tipos';
import { fmtDataHora, ROTULO_ACAO, rotuloStatus } from './montagem';

/** Trilha de eventos (POP ou formulário): data/hora, quem, ação e motivo. Só leitura. */
export default function TrilhaEventos({ eventos }: { eventos: EventoPop[] }) {
  if (eventos.length === 0) {
    return <p className="text-sm text-zinc-500">Nenhum evento registrado ainda.</p>;
  }
  return (
    <ul className="space-y-2">
      {eventos.map((e) => (
        <li key={e.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-zinc-900">{ROTULO_ACAO[e.acao] ?? e.acao}</span>
            <span className="text-zinc-500">{fmtDataHora(e.criadoEm)}</span>
          </div>
          <div className="text-zinc-600 mt-0.5">
            {e.usuario || '—'}
            {e.deStatus && e.paraStatus && e.deStatus !== e.paraStatus
              ? ` · ${rotuloStatus(e.deStatus).texto} → ${rotuloStatus(e.paraStatus).texto}`
              : ''}
          </div>
          {e.motivo && <div className="text-zinc-800 mt-1">{e.motivo}</div>}
        </li>
      ))}
    </ul>
  );
}
