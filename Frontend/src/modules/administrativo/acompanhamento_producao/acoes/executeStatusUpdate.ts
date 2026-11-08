import React from 'react';
import { apiJson } from '../../../geral/lib/http';
import type { StatusApagadoPrevia, AcompanhamentoLote, ProgramacaoEnvaseItem, ProgramacaoRotulagemItem } from '../lib/tipos';
import { statusApagadoParaLinha } from '../lib/statusApagado';
import { STATUS_OPTIONS } from '../lib/constantes';
import { PreviaAcao } from '../../../producao/gerenciamento/components/PreviaAcaoDrawer';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface executeStatusUpdateAcaoCtx {
  currentUser: AuthUser;
  executeStatusUpdate: (loteNumber: string, newStatus: string, motivoEspera: string | null, resetConfirmado?: boolean, motivoReset?: string) => Promise<void>;
  lotes: AcompanhamentoLote[];
  pesagemSelectedDate: string;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setPauseModalLote: React.Dispatch<React.SetStateAction<AcompanhamentoLote>>;
  setPesagemConcluidosLotes: (u: string[] | ((prev: string[]) => string[])) => void;
  setPreviaAcao: React.Dispatch<React.SetStateAction<PreviaAcao>>;
  setProgramacaoEnvase: React.Dispatch<React.SetStateAction<ProgramacaoEnvaseItem[]>>;
  setProgramacaoRotulagem: React.Dispatch<React.SetStateAction<ProgramacaoRotulagemItem[]>>;
  setRecentlyUpdatedLotes: React.Dispatch<React.SetStateAction<Record<string, { status: string; timestamp: number; }>>>;
  setSavingLote: React.Dispatch<React.SetStateAction<string>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function executeStatusUpdateAcao({ currentUser, executeStatusUpdate, lotes, pesagemSelectedDate, setLotes, setPauseModalLote, setPesagemConcluidosLotes, setPreviaAcao, setProgramacaoEnvase, setProgramacaoRotulagem, setRecentlyUpdatedLotes, setSavingLote, showToast }: executeStatusUpdateAcaoCtx, loteNumber: string, newStatus: string, motivoEspera: string | null, resetConfirmado = false, motivoReset = '') {
    // Redefinir o status apaga a linha do lote: mostra a prévia do servidor e só apaga ao confirmar
    if (!newStatus && !resetConfirmado) {
      try {
        const r = await apiJson<{ resultado: StatusApagadoPrevia[] }>(
          `/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}?confirmar=false`,
          { method: 'DELETE' }
        );
        if (!r.resultado?.length) {
          showToast(`Lote ${loteNumber} já está no status padrão.`);
          return;
        }
        setPreviaAcao({
          titulo: 'Redefinir status do lote',
          linhas: r.resultado.map(statusApagadoParaLinha),
          avisos: ['O status, a categoria e o motivo de espera gravados serão apagados (fica registrado no histórico do lote).'],
          confirmarRotulo: 'Redefinir',
          pedirMotivo: true,
          executar: async (motivo) => { await executeStatusUpdate(loteNumber, newStatus, motivoEspera, true, motivo ?? ''); },
        });
      } catch (err: any) {
        showToast(`Não foi possível consultar o lote: ${err?.message || err}`, 'error');
      }
      return;
    }
    setSavingLote(loteNumber);
    const previousLotes = [...lotes];
    const option = STATUS_OPTIONS.find(o => o.value === newStatus);
    const category = option ? option.category : (
      newStatus === 'Produção' || newStatus === 'Produzido' || newStatus === 'Fila Pesagem' || newStatus === 'Liberado Pesagem' || newStatus === 'Pesagem'
        ? 'Pesagem e Produção'
        : (newStatus === 'Finalizada' || newStatus === 'Ordem Finalizada' || newStatus === 'Rotulagem' || newStatus === 'Envase' ? 'Embalagem' : null)
    );
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
    const nowIso = new Date().toISOString();

    // Atualização otimista na UI
    setLotes(prev => prev.map(item => {
      if (item.loteNumber === loteNumber) {
        const updated: AcompanhamentoLote = {
          ...item,
          customStatus: newStatus || null,
          category: category,
          updatedBy: responsibleName,
          updatedAt: nowIso,
          motivoEspera: newStatus === 'Em Espera' ? motivoEspera : null
        };
        if (newStatus === 'Pesagem' || newStatus === 'Fila Pesagem') updated.dataPesagem = item.dataPesagem || nowIso;
        if (newStatus === 'Produzido' || newStatus === 'Produção') {
          updated.dataProducao = item.dataProducao || nowIso;
          if (!updated.dataPesagem) {
            updated.dataPesagem = item.dataPesagem || item.dataPrevisao || pesagemSelectedDate || nowIso;
          }
        }
        if (newStatus === 'Liberado Pesagem') {
          if (!updated.dataPesagem) {
            updated.dataPesagem = item.dataPesagem || item.dataPrevisao || pesagemSelectedDate || nowIso;
          }
        }
        if (newStatus === 'Liberado para Envase') updated.dataLiberadoEnvase = item.dataLiberadoEnvase || nowIso;
        if (newStatus === 'Envase') updated.dataEnvase = item.dataEnvase || nowIso;
        if (newStatus === 'Rotulagem') updated.dataRotulagem = item.dataRotulagem || nowIso;
        if (newStatus === 'Finalizada' || newStatus === 'Ordem Finalizada') updated.dataFinalizada = item.dataFinalizada || nowIso;
        if (newStatus === 'Em Espera') updated.dataEmEspera = item.dataEmEspera || nowIso;
        return updated;
      }
      return item;
    }));

    // Mantém o lote como concluído no Quadro de Pesagem se entrou em produção ou liberado
    if (newStatus === 'Produção' || newStatus === 'Produzido' || newStatus === 'Liberado Pesagem') {
      setPesagemConcluidosLotes(prev => {
        if (prev.includes(loteNumber)) return prev;
        const next = [...prev, loteNumber];
        return next;
      });
    } else if (newStatus === 'Fila Pesagem') {
      setPesagemConcluidosLotes(prev => {
        const next = prev.filter(x => x !== loteNumber);
        return next;
      });
    }

    // Se o status for de finalização, tira imediatamente da tela as filas operacionais de Envase e Rotulagem
    if (newStatus === 'Finalizada' || newStatus === 'Ordem Finalizada') {
      const cleanTarget = (loteNumber || '').trim().toLowerCase();
      setProgramacaoEnvase(prev => prev.filter(it => (it.loteNumber || '').trim().toLowerCase() !== cleanTarget));
      setProgramacaoRotulagem(prev => prev.filter(it => (it.loteNumber || '').trim().toLowerCase() !== cleanTarget));
      // O servidor tira o lote das duas programações na mesma transação do status.
    }

    try {
      if (!newStatus) {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(loteNumber)}?confirmar=true&motivo=${encodeURIComponent(motivoReset)}`, {
          method: 'DELETE',
        });
        showToast(`Lote ${loteNumber} redefinido para status padrão.`);
      } else {
        await apiJson('/api/administrativo/lote-status', {
          method: 'POST',
          body: JSON.stringify({
            loteNumber,
            customStatus: newStatus,
            category,
            updatedBy: responsibleName,
            motivoEspera: newStatus === 'Em Espera' ? motivoEspera : null,
          })
        });
        showToast(
          newStatus === 'Em Espera'
            ? `Lote ${loteNumber} em espera: ${motivoEspera || 'Sem motivo'}`
            : `Lote ${loteNumber} atualizado para ${newStatus}.`
        );
        setRecentlyUpdatedLotes(prev => ({
          ...prev,
          [loteNumber]: { status: newStatus || 'Padrão', timestamp: Date.now() }
        }));
        setTimeout(() => {
          setRecentlyUpdatedLotes(prev => {
            const next = { ...prev };
            delete next[loteNumber];
            return next;
          });
        }, 2500);
      }
    } catch (err) {
      console.error("Erro ao salvar status do lote:", err);
      setLotes(previousLotes);
      showToast("Falha ao salvar alteração no servidor.", "error");
      throw err;
    } finally {
      setSavingLote(null);
      setPauseModalLote(null);
    }
  }
