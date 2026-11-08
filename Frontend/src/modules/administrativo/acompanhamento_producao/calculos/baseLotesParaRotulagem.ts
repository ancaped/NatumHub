import React from 'react';
import { isLoteConcluido, isLoteOcultoNoQuadro, getLoteEsperaDetails, isLoteDaSemana } from '../lib/lotes';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface calcularBaseLotesParaRotulagemCtx {
  lotes: AcompanhamentoLote[];
  manualFilasAdicionados: Record<'pesagem' | 'producao' | 'rotulagem', string[]>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  rotulagemFilaSearch: string;
  rotulagemScopeFilter: 'LIBERADOS' | 'TODOS';
  rotulagemSelectedDate: string;
}

export function calcularBaseLotesParaRotulagem({ lotes, manualFilasAdicionados, programacaoEnvase, programacaoRotulagem, rotulagemFilaSearch, rotulagemScopeFilter, rotulagemSelectedDate }: calcularBaseLotesParaRotulagemCtx) {
    const isSearching = Boolean(rotulagemFilaSearch.trim());
    return lotes.filter(l => {
      // REGRA GERAL: Ordem concluída NUNCA aparece em filas ativas
      if (isLoteConcluido(l)) return false;

      if (isLoteOcultoNoQuadro(l, 'rotulagem')) return false;

      // Se há pesquisa ativa na fila de rotulagem, exibir diretamente qualquer lote aberto não oculto
      if (isSearching) return true;

      // REGRA REQUISITADA: Se este item específico do lote já estiver no quadro de rotulagem (Máquina ou Manual), NÃO pode estar na fila
      const isAlreadyInRotulagemBoard = programacaoRotulagem.some(it => 
        (it.loteNumber || '').trim().toUpperCase() === (l.loteNumber || '').trim().toUpperCase() &&
        (!it.productCode || !l.productCode || (it.productCode || '').trim().toUpperCase() === (l.productCode || '').trim().toUpperCase())
      );
      if (isAlreadyInRotulagemBoard) return false;

      const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
      // REGRA REQUISITADA: Lotes em espera não aparecem na execução da fábrica (vão para PCP / Fila de Demandas)
      if (esperaDetails.isEmEspera || l.customStatus === 'Em Espera' || Boolean(l.motivoEspera) || l.erpStatus === 'ES') {
        return false;
      }

      // Se foi adicionado manualmente à fila de rotulagem
      const isManual = (manualFilasAdicionados.rotulagem || []).includes(l.loteNumber);
      if (isManual) return true;

      // Se escopo foi selecionado manualmente como 'TODOS'
      if (rotulagemScopeFilter === 'TODOS') return true;

      // REGRA REQUISITADA: Pegar lotes abertos da semana ou planejados para os próximos dias
      const isPlanned = Boolean(l.details?.includes('Planejamento Semanal'));
      if (!isPlanned && !isLoteDaSemana(l, 'rotulagem', rotulagemSelectedDate)) {
        return false;
      }

      return true;
    });
  }
