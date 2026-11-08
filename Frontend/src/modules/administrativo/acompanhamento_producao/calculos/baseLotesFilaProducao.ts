import React from 'react';
import { isLoteConcluido, isLoteOcultoNoQuadro, getLoteEsperaDetails, getLoteEtapaStatus, isLoteParcial, getEffectiveStatus, consolidateLotesForBatch, deduplicateLotesByNumber } from '../lib/lotes';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';

export interface calcularBaseLotesFilaProducaoCtx {
  isLoteTerceirizado: (l: AcompanhamentoLote) => boolean;
  lotes: AcompanhamentoLote[];
  lotesProducao: AcompanhamentoLote[];
  manualFilasAdicionados: Record<'pesagem' | 'producao' | 'rotulagem', string[]>;
  programacaoEnvase: ProgramacaoEnvaseItem[];
  programacaoRotulagem: ProgramacaoRotulagemItem[];
  selectedInsumoFaltanteFilter: string;
}

export function calcularBaseLotesFilaProducao({ isLoteTerceirizado, lotes, lotesProducao, manualFilasAdicionados, programacaoEnvase, programacaoRotulagem, selectedInsumoFaltanteFilter }: calcularBaseLotesFilaProducaoCtx) {
    const raw = lotes
      .filter(l => {
        // REGRA GERAL: Se a ordem estiver concluída, NUNCA aparece em filas ativas
        if (isLoteConcluido(l)) return false;

        if (isLoteTerceirizado(l)) return false;
        if (isLoteOcultoNoQuadro(l, 'producao')) return false;

        // REQUISITO: Se o lote for do Planejamento Semanal / PCP, ele vai DIRETO para o Quadro de Produção (reatores/caldeira), NÃO aparece na fila!
        const isPlanned = Boolean(l.details?.includes('Planejamento Semanal'));
        const esperaDetails = getLoteEsperaDetails(l, programacaoEnvase, programacaoRotulagem);
        const etapaStatus = getLoteEtapaStatus(l, 'producao');
        // REGRA REQUISITADA: Lotes em espera não aparecem na execução da fábrica (vão para PCP / Fila de Demandas)
        if (esperaDetails.isEmEspera || etapaStatus.isEspera || l.customStatus === 'Em Espera' || Boolean(l.motivoEspera) || l.erpStatus === 'ES') {
          return false;
        }

        const isFilaExplicit = etapaStatus.status === 'fila' || l.customStatus === 'Fila Produção';
        const isOrdemParada = isFilaExplicit;
        const isManual = (manualFilasAdicionados.producao || []).includes(l.loteNumber);
        const isParcial = isLoteParcial(l);

        // Se for planejado e não for parada/espera/fila, parcial ou manual, NÃO entra na fila!
        if (isPlanned && !isOrdemParada && !isManual && !isParcial) {
          return false;
        }

        // Se o lote já estiver no quadro de Produção (reatores ou caldeira), NÃO pode estar na fila
        const isNaProducaoAtiva = lotesProducao.some(p => p.loteNumber === l.loteNumber);
        if (isNaProducaoAtiva) return false;

        // Fila de produção deve conter apenas ordens paradas (espera), ordens parciais, ou adicionadas manualmente
        if (!isOrdemParada && !isParcial && !isManual) {
          return false;
        }

        const eff = getEffectiveStatus(l);
        const isFila = (
          !isNaProducaoAtiva || isOrdemParada
        ) &&
          eff !== 'Liberado para Envase' &&
          eff !== 'Envase' &&
          eff !== 'Ordem Finalizada' &&
          eff !== 'Finalizada' &&
          l.customStatus !== 'Liberado para Envase' &&
          l.customStatus !== 'Envase';

        if (!isFila) return false;
        if (selectedInsumoFaltanteFilter !== 'TODOS') {
          if ((l.insumoFaltanteCodigo || (l as any).insumo_faltante_codigo) !== selectedInsumoFaltanteFilter) return false;
        }
        return true;
      });
    return consolidateLotesForBatch(deduplicateLotesByNumber(raw));
  }
