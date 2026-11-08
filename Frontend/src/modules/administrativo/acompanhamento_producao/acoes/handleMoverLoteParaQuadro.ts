import React from 'react';
import { STATUS_OPTIONS } from '../lib/constantes';
import type { AcompanhamentoLote, TabType } from '../lib/tipos';
import { apiJson } from '../../../geral/lib/http';
import { formatDateOnly } from '../lib/datas';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface handleMoverLoteParaQuadroAcaoCtx {
  currentTab: TabType;
  currentUser: AuthUser;
  envaseSelectedDate: string;
  executeStatusUpdate: (loteNumber: string, newStatus: string, motivoEspera: string | null, resetConfirmado?: boolean, motivoReset?: string) => Promise<void>;
  fetchLotes: () => Promise<void>;
  fetchProgramacaoEnvase: (dateStr: string) => Promise<void>;
  ordensSelectedDate: string;
  pesagemSelectedDate: string;
  producaoSelectedDate: string;
  rotulagemSelectedDate: string;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleMoverLoteParaQuadroAcao({ currentTab, currentUser, envaseSelectedDate, executeStatusUpdate, fetchLotes, fetchProgramacaoEnvase, ordensSelectedDate, pesagemSelectedDate, producaoSelectedDate, rotulagemSelectedDate, setLotes, showToast }: handleMoverLoteParaQuadroAcaoCtx, loteNumber: string, targetStatus: string, targetQuadroNome: string, targetDateOverride?: string) {
    try {
      let normalizedStatus = targetStatus;
      let category: string | null = null;
      if (targetStatus === 'Produção' || targetStatus === 'Produzido') {
        normalizedStatus = 'Produzido';
        category = 'Pesagem e Produção';
      } else if (targetStatus === 'Finalizada' || targetStatus === 'Ordem Finalizada') {
        normalizedStatus = 'Ordem Finalizada';
        category = 'Embalagem';
      } else if (targetStatus === 'Pesagem' || targetStatus === 'Fila Pesagem' || targetStatus === 'Liberado Pesagem') {
        normalizedStatus = targetStatus;
        category = 'Pesagem e Produção';
      } else if (targetStatus === 'Liberado para Envase') {
        normalizedStatus = 'Liberado para Envase';
        category = 'Pesagem e Produção';
      } else if (targetStatus === 'Rotulagem' || targetStatus === 'Envase' || targetStatus === 'Ordem Parcial') {
        normalizedStatus = targetStatus;
        category = 'Embalagem';
      } else {
        const opt = STATUS_OPTIONS.find(o => o.value === targetStatus);
        category = opt ? opt.category : null;
      }

      // Determinar a data destino selecionada no quadro alvo
      const targetDate = targetDateOverride || (() => {
        const norm = targetQuadroNome.toLowerCase();
        if (norm.includes('produção') || norm.includes('producao')) return producaoSelectedDate;
        if (norm.includes('pesagem')) return pesagemSelectedDate;
        if (norm.includes('envase')) return envaseSelectedDate;
        if (norm.includes('rotulagem')) return rotulagemSelectedDate;
        if (norm.includes('ordens')) return ordensSelectedDate;
        if (currentTab === 'quadro_producao') return producaoSelectedDate;
        if (currentTab === 'quadro_pesagem') return pesagemSelectedDate;
        if (currentTab === 'quadro_envase') return envaseSelectedDate;
        if (currentTab === 'quadro_rotulagem') return rotulagemSelectedDate;
        if (currentTab === 'quadro_ordens') return ordensSelectedDate;
        return new Date().toISOString().split('T')[0];
      })();

      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
      const nowIso = new Date().toISOString();

      // Atualização imediata otimista no estado local para feedback instantâneo
      setLotes(prev => prev.map(item => {
        if (item.loteNumber === loteNumber) {
          const updated: AcompanhamentoLote = {
            ...item,
            customStatus: normalizedStatus,
            dataPrevisao: targetDate || item.dataPrevisao,
            category: category || item.category,
            updatedBy: responsibleName,
            updatedAt: nowIso
          };
          if (normalizedStatus === 'Pesagem' || normalizedStatus === 'Fila Pesagem') updated.dataPesagem = item.dataPesagem || nowIso;
          if (normalizedStatus === 'Produzido' || normalizedStatus === 'Produção') updated.dataProducao = item.dataProducao || nowIso;
          if (normalizedStatus === 'Liberado para Envase') updated.dataLiberadoEnvase = item.dataLiberadoEnvase || nowIso;
          if (normalizedStatus === 'Envase') updated.dataEnvase = item.dataEnvase || nowIso;
          if (normalizedStatus === 'Rotulagem') updated.dataRotulagem = item.dataRotulagem || nowIso;
          if (normalizedStatus === 'Finalizada' || normalizedStatus === 'Ordem Finalizada') updated.dataFinalizada = item.dataFinalizada || nowIso;
          return updated;
        }
        return item;
      }));

      await executeStatusUpdate(loteNumber, normalizedStatus, null);

      // Salvar a nova data de previsão no backend com a data do quadro destino
      if (targetDate) {
        try {
          await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/previsao`, {
            method: 'POST',
            body: JSON.stringify({
              dataPrevisao: targetDate,
              updatedBy: responsibleName
            })
          });
          setLotes(prev => prev.map(item => item.loteNumber === loteNumber ? { ...item, dataPrevisao: targetDate } : item));
        } catch (prevErr) {
          console.warn('[handleMoverLoteParaQuadro] Aviso ao sincronizar dataPrevisao:', prevErr);
        }
      }

      // Se estava oculto no quadro de destino, restaura automaticamente para voltar a aparecer
      let targetQuadroKey = '';
      const normDest = targetQuadroNome.toLowerCase();
      if (normDest.includes('pesagem')) targetQuadroKey = 'pesagem';
      else if (normDest.includes('produção') || normDest.includes('producao')) targetQuadroKey = 'producao';
      else if (normDest.includes('envase')) targetQuadroKey = 'envase';
      else if (normDest.includes('rotulagem')) targetQuadroKey = 'rotulagem';

      if (targetQuadroKey) {
        try {
          await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}/restaurar-quadro`, {
            method: 'POST',
            body: JSON.stringify({ quadro: targetQuadroKey })
          });
        } catch (_) {}
      }

      await fetchLotes();
      if (currentTab === 'quadro_envase' || targetQuadroNome.toLowerCase().includes('envase')) {
        await fetchProgramacaoEnvase('TODOS');
      }

      const dateFmt = formatDateOnly(targetDate);
      showToast(`✅ Lote #${loteNumber} adicionado/movido para ${targetQuadroNome} (${dateFmt})!`, 'success');
    } catch (err: any) {
      console.error("Erro ao mover lote entre quadros:", err);
      showToast(`Erro ao mover lote #${loteNumber}: ${err?.message || err}`, 'error');
    }
  }
