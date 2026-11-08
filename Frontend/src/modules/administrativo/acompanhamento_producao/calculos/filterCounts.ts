import React from 'react';
import { isLoteConcluido, getEffectiveStatus } from '../lib/lotes';
import type { AcompanhamentoLote, TabType } from '../lib/tipos';

export interface calcularFilterCountsCtx {
  currentTab: TabType;
  isLoteTerceirizado: (l: AcompanhamentoLote) => boolean;
  lotes: AcompanhamentoLote[];
}

export function calcularFilterCounts({ currentTab, isLoteTerceirizado, lotes }: calcularFilterCountsCtx) {
    const list = currentTab === 'terceirizados'
      ? lotes.filter(l => isLoteTerceirizado(l))
      : lotes.filter(l => !isLoteTerceirizado(l));

    let aberto = 0;
    let concluidoEa = 0;
    let pesagem = 0;
    let produzido = 0;
    let liberadoEnvase = 0;
    let envase = 0;
    let rotulagem = 0;
    let espera = 0;
    let finalizada = 0;
    let pendente = 0;

    list.forEach(l => {
      const isConcluido = isLoteConcluido(l);
      if (!isConcluido) aberto++;
      if (isConcluido) concluidoEa++;

      const eff = getEffectiveStatus(l);
      if (eff === 'Pesagem') pesagem++;
      else if (eff === 'Produzido' || eff === 'Produção') produzido++;
      else if (eff === 'Liberado para Envase') liberadoEnvase++;
      else if (eff === 'Envase') envase++;
      else if (eff === 'Rotulagem') rotulagem++;
      else if (eff === 'Em Espera' || l.motivoEspera) espera++;
      else if (isConcluido) finalizada++;
      else pendente++;
    });

    return {
      todos: list.length,
      aberto,
      concluidoEa,
      pesagem,
      produzido,
      liberadoEnvase,
      envase,
      rotulagem,
      espera,
      finalizada,
      pendente
    };
  }
