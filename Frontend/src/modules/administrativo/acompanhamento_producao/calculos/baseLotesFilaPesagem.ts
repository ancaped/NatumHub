import React from 'react';
import { isLoteConcluido, isLoteOcultoNoQuadro, getLoteEtapaStatus, getLoteEsperaDetails, consolidateLotesForBatch, deduplicateLotesByNumber } from '../lib/lotes';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface calcularBaseLotesFilaPesagemCtx {
  isLoteTerceirizado: (l: AcompanhamentoLote) => boolean;
  lotes: AcompanhamentoLote[];
  manualFilasAdicionados: Record<'pesagem' | 'producao' | 'rotulagem', string[]>;
  pesagemConcluidosLotes: string[];
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  selectedInsumoFaltanteFilter: string;
  sortedLotesPesando: AcompanhamentoLote[];
}

export function calcularBaseLotesFilaPesagem({ isLoteTerceirizado, lotes, manualFilasAdicionados, pesagemConcluidosLotes, programacaoEnvase, programacaoRotulagem, selectedInsumoFaltanteFilter, sortedLotesPesando }: calcularBaseLotesFilaPesagemCtx) {
    const raw = lotes
      .filter(l => {
        // REGRA GERAL: Ordem concluída NUNCA aparece em filas ativas
        if (isLoteConcluido(l)) return false;

        if (isLoteTerceirizado(l)) return false;
        if (isLoteOcultoNoQuadro(l, 'pesagem')) return false;

        // REGRA DE PESAGEM: Se a pesagem já foi concluída, o lote NUNCA deve aparecer na Fila de Pesagem (exceto se adicionado manualmente)
        const etapaStatus = getLoteEtapaStatus(l, 'pesagem');
        const isConcluidoPesagem = etapaStatus.isConcluido || pesagemConcluidosLotes.includes(l.loteNumber);
        const isManual = (manualFilasAdicionados.pesagem || []).includes(l.loteNumber);
        if (isConcluidoPesagem && !isManual) return false;

        // REQUISITO: Se o lote for do Planejamento Semanal / PCP, ele vai DIRETO para o Quadro de Pesagem, NÃO aparece na fila!
        const isPlanned = Boolean(l.details?.includes('Planejamento Semanal'));
        const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
        // REGRA REQUISITADA: Lotes em espera não aparecem na execução da fábrica (vão para PCP / Fila de Demandas)
        if (esperaDetails.isEmEspera || etapaStatus.isEspera || l.customStatus === 'Em Espera' || Boolean(l.motivoEspera) || l.erpStatus === 'ES') {
          return false;
        }

        const isFilaExplicit = etapaStatus.status === 'fila' || l.customStatus === 'Fila Pesagem';
        const isOrdemParada = isFilaExplicit;

        // Se for planejado e NÃO for ordem parada/espera/fila e NÃO for manual, NÃO entra na fila!
        if (isPlanned && !isOrdemParada && !isManual) {
          return false;
        }

        // Se o lote já estiver no quadro de Pesagem Ativa (na balança), NÃO pode estar na fila
        const isNaBalanca = sortedLotesPesando.some(p => p.loteNumber === l.loteNumber);
        if (isNaBalanca) return false;

        // Fila de pesagem deve conter apenas ordens paradas (espera), em fila, ou adicionadas manualmente
        if (!isOrdemParada && !isManual) {
          return false;
        }

        if (selectedInsumoFaltanteFilter !== 'TODOS') {
          if ((l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) !== selectedInsumoFaltanteFilter) return false;
        }
        return true;
      });
    return consolidateLotesForBatch(deduplicateLotesByNumber(raw));
  }
