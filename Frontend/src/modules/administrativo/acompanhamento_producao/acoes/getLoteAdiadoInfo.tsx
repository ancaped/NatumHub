import React from 'react';
import { getLoteScheduleDateIso } from '../lib/lotes';
import type { AcompanhamentoLote, LoteAdiadoRegistro } from '../lib/tipos';

export interface getLoteAdiadoInfoAcaoCtx {
  lotesAdiadosHistorico: LoteAdiadoRegistro[];
  lotesByNumber: Map<string, AcompanhamentoLote>;
}

export function getLoteAdiadoInfoAcao({ lotesAdiadosHistorico, lotesByNumber }: getLoteAdiadoInfoAcaoCtx, loteNumber: string, targetDate: string, etapa?: string) {
    if (!targetDate || !loteNumber) return null;
    const cleanTarget = targetDate.split('T')[0].split(' ')[0];

    const isStrictlyAfter = (dateA: string, dateB: string) => {
      if (!dateA || !dateB) return false;
      return dateA.localeCompare(dateB) > 0;
    };

    const l = lotesByNumber.get(loteNumber);
    if (l) {
      const scheduleIso = getLoteScheduleDateIso(l, etapa as any);
      const schedClean = scheduleIso ? scheduleIso.split('T')[0].split(' ')[0] : '';
      if (schedClean && schedClean.localeCompare(cleanTarget) <= 0) return null;
    }

    // 1. Do historico_reagendamentos vindo do banco de dados (lote_custom_status - FONTE DA VERDADE)
    if (l) {
      const hist = l.historicoReagendamentos || (l as any).historico_reagendamentos;
      if (Array.isArray(hist) && hist.length > 0) {
        for (let i = hist.length - 1; i >= 0; i--) {
          const h = hist[i];
          const orig = (h.dataAnterior || h.dataOriginal || '').split('T')[0].split(' ')[0];
          const para = (h.novaData || h.dataAdiadoPara || '').split('T')[0].split(' ')[0];
          const hEtapa = (h.etapa || h.origem || '').toLowerCase();

          // Histórico geral de lote_custom_status (data_previsao de PCP) não deve interferir
          // em linhas operacionais com grade própria (envase ou rotulagem), a menos que explicitamente gravado para essa etapa.
          if ((etapa === 'envase' || etapa === 'rotulagem') && !hEtapa.includes(etapa)) {
            continue;
          }

          const matchEtapa = !etapa || !hEtapa || hEtapa.includes(etapa.toLowerCase()) || etapa.toLowerCase().includes(hEtapa);
          if ((para === cleanTarget || orig === cleanTarget) && para && orig && isStrictlyAfter(para, orig) && matchEtapa) {
            const motivo = (h.motivo || '').toLowerCase();
            const tipo = (h.tipo || '').toLowerCase();
            if (tipo === 'antecipacao' || tipo === 'retorno' || motivo.startsWith('antecipado') || motivo.startsWith('retorno')) {
              continue;
            }
            const isDestino = para === cleanTarget;
            return { dataAdiadoPara: para, dataOriginal: orig, isDestino };
          }
        }
      }
    }

    // 2. Do histórico gravado localmente (gerado por ações diretas nos quadros)
    const local = lotesAdiadosHistorico.find(reg => {
      const orig = (reg.dataOriginal || '').split('T')[0].split(' ')[0];
      const para = (reg.dataAdiadoPara || '').split('T')[0].split(' ')[0];
      const regEtapa = (reg.etapa || reg.origem || '').toLowerCase();
      const matchEtapa = !etapa || !regEtapa || regEtapa.includes(etapa.toLowerCase()) || etapa.toLowerCase().includes(regEtapa);
      return reg.loteNumber === loteNumber && (para === cleanTarget || orig === cleanTarget) && isStrictlyAfter(para, orig) && matchEtapa;
    });
    if (local) {
      // Validação: se o lote existe e o registro local discorda da data atual da etapa, descartar registro local obsoleto
      if (l) {
        const scheduleIso = getLoteScheduleDateIso(l, etapa as any);
        const schedClean = scheduleIso ? scheduleIso.split('T')[0] : null;
        const paraClean = (local.dataAdiadoPara || '').split('T')[0];
        const origClean = (local.dataOriginal || '').split('T')[0];
        if (schedClean && schedClean !== paraClean && schedClean !== origClean) {
          // Stale local record, ignora
        } else {
          const isDestino = (local.dataAdiadoPara || '').split('T')[0].split(' ')[0] === cleanTarget;
          return { dataAdiadoPara: local.dataAdiadoPara, dataOriginal: local.dataOriginal, isDestino };
        }
      } else {
        const isDestino = (local.dataAdiadoPara || '').split('T')[0].split(' ')[0] === cleanTarget;
        return { dataAdiadoPara: local.dataAdiadoPara, dataOriginal: local.dataOriginal, isDestino };
      }
    }

    // 3. Fallback inteligente para etapa de produção: se a pesagem já foi concluída em data anterior à produção
    if (l && etapa === 'producao') {
      const pesagemConcluida = (l as any).etapasStatus?.pesagem?.status === 'concluido' || (l as any).etapas_status?.pesagem?.status === 'concluido';
      const dtPesagem = (l.dataPesagem || (l as any).data_pesagem || '').split('T')[0].split(' ')[0];
      const dtProducao = (l.dataProducao || (l as any).data_producao || '').split('T')[0].split(' ')[0];
      if (pesagemConcluida && dtPesagem && dtProducao && isStrictlyAfter(dtProducao, dtPesagem)) {
        if (cleanTarget === dtProducao) {
          return { dataAdiadoPara: dtProducao, dataOriginal: dtPesagem, isDestino: true };
        } else if (cleanTarget === dtPesagem) {
          return { dataAdiadoPara: dtProducao, dataOriginal: dtPesagem, isDestino: false };
        }
      }
    }
    return null;
  }
