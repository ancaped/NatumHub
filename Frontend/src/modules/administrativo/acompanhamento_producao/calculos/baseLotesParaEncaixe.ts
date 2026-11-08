import React from 'react';
import { isLoteConcluido, isLoteOcultoNoQuadro, getLoteEsperaDetails, getEffectiveStatus } from '../lib/lotes';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface calcularBaseLotesParaEncaixeCtx {
  encaixeSearch: string;
  encaixeStatusFilter: string;
  envaseScopeFilter: 'LIBERADOS' | 'TODOS';
  lotes: AcompanhamentoLote[];
  manualLiberadosEnvase: Set<string>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
}

export function calcularBaseLotesParaEncaixe({ encaixeSearch, encaixeStatusFilter, envaseScopeFilter, lotes, manualLiberadosEnvase, programacaoEnvase, programacaoRotulagem }: calcularBaseLotesParaEncaixeCtx) {
    const isSearching = Boolean(encaixeSearch.trim());
    return lotes
      .filter(l => {
        // REGRA GERAL: Ordem concluída NUNCA aparece em filas ativas
        if (isLoteConcluido(l)) return false;

        // Se o lote foi explicitamente ocultado/removido deste quadro operacional, NUNCA exibir
        if (isLoteOcultoNoQuadro(l, 'envase')) return false;

        // Se há pesquisa ativa no quadro de envase, exibir diretamente qualquer lote aberto não oculto
        if (isSearching) return true;

        // REGRA REQUISITADA: Se o lote JÁ ESTÁ programado no quadro de envase (Linha 1, 2 ou 3), NÃO exibir na coluna de Liberados para Envase
        const isAlreadyScheduled = programacaoEnvase.some(it => 
          (it.loteNumber || '').trim().toUpperCase() === (l.loteNumber || '').trim().toUpperCase() && 
          (!it.productCode || !l.productCode || (it.productCode || '').trim().toUpperCase() === (l.productCode || '').trim().toUpperCase())
        );
        if (isAlreadyScheduled) return false;

        const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
        // REGRA REQUISITADA: Lotes em espera não aparecem nos quadros diários de execução (remanejados para PCP / Fila de Demandas)
        if (esperaDetails.isEmEspera || l.customStatus === 'Em Espera' || Boolean(l.motivoEspera) || l.erpStatus === 'ES') {
          return false;
        }

        // Se o usuário selecionou visualização explícita de "Todas as Ordens Abertas"
        if (envaseScopeFilter === 'TODOS') {
          if (encaixeStatusFilter === 'TODOS') return true;
          return getEffectiveStatus(l) === encaixeStatusFilter;
        }

        // REGRA REQUISITADA:
        // Liberado automaticamente só com laudo aprovado (AP) no ERP (decisão 23); o servidor devolve `liberadoEnvaseLaudo`.
        // Também é possível adicionar/remover o lote manualmente da lista de liberados.
        const cleanNum = (l.loteNumber || '').trim().toLowerCase();
        const hasLaudoAprovado = Boolean(l.liberadoEnvaseLaudo) || Boolean(l.dataLiberadoEnvase);
        const isManual = manualLiberadosEnvase.has(cleanNum) || manualLiberadosEnvase.has(l.loteNumber) || l.customStatus === 'Liberado para Envase';
        const isPlanned = Boolean(l.details?.includes('Planejamento Semanal'));

        if (hasLaudoAprovado || isManual || isPlanned) {
          if (encaixeStatusFilter === 'TODOS') return true;
          return getEffectiveStatus(l) === encaixeStatusFilter || isPlanned;
        }

        return false;
      })
      .map(l => ({
        ...l,
        isAlreadyScheduled: false,
        scheduledItem: undefined
      }));
  }
