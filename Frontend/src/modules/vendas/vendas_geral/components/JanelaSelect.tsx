import React from 'react';
import { FiltroSelect } from '../../../geral/components/ui/ReportKit';
import { JANELAS_DIAS } from '../lib/salesStatusUi';

/** Janela em dias dos pedidos considerados (compartilhada pelas abas; a troca passa pela prévia do servidor). */
export function JanelaSelect({ dias, onChange }: { dias: number; onChange: (dias: number) => void }) {
  return <FiltroSelect value={String(dias)} onChange={(v) => onChange(Number(v))} opcoes={JANELAS_DIAS} />;
}
