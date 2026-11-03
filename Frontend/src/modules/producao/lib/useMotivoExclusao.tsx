import React, { useCallback, useState } from 'react';
import PreviaAcaoDrawer, { PreviaAcao } from '../gerenciamento/components/PreviaAcaoDrawer';

export interface PedidoExclusao {
  titulo: string;
  /** O que vai ser apagado (uma linha). */
  alvo: string;
  detalhe?: string;
  avisos?: string[];
  confirmarRotulo?: string;
  /** Chamado com o motivo (já aparado). Se lançar erro, a mensagem aparece no drawer. */
  executar: (motivo: string) => Promise<void>;
}

/**
 * Exclusão que não passa pela prévia do servidor (ou já tem confirmação própria): mostra o que será apagado e exige
 * o motivo antes do OK. Renderize `elemento` uma vez no componente.
 */
export function useMotivoExclusao() {
  const [previa, setPrevia] = useState<PreviaAcao | null>(null);

  const pedirMotivo = useCallback((p: PedidoExclusao) => {
    setPrevia({
      titulo: p.titulo,
      linhas: [{ titulo: p.alvo, detalhe: p.detalhe }],
      avisos: p.avisos,
      confirmarRotulo: p.confirmarRotulo ?? 'OK, excluir',
      pedirMotivo: true,
      executar: (motivo) => p.executar(motivo ?? ''),
    });
  }, []);

  const elemento = previa ? <PreviaAcaoDrawer previa={previa} onClose={() => setPrevia(null)} /> : null;
  return { pedirMotivo, elemento };
}
