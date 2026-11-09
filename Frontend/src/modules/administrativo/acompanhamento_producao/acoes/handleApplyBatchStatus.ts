import React from 'react';
import { STATUS_OPTIONS } from '../lib/constantes';
import { apiJson } from '../../../geral/lib/http';
import type { StatusApagadoPrevia } from '../lib/tipos';
import { statusApagadoParaLinha } from '../lib/statusApagado';
import { PreviaAcao } from '../../../producao/gerenciamento/components/PreviaAcaoDrawer';
import type { AuthUser } from '../../../geral/lib/auth';

export interface handleApplyBatchStatusAcaoCtx {
  batchCustomMotivo: string;
  batchEsperaMotivo: string;
  currentUser: AuthUser;
  fetchLotes: () => Promise<void>;
  handleApplyBatchStatus: (statusValue: string, motivoOverride?: string | null, resetConfirmado?: boolean, motivoReset?: string) => Promise<void>;
  selectedLotes: Set<string>;
  setBatchStatusValue: React.Dispatch<React.SetStateAction<string>>;
  setIsBatchUpdating: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviaAcao: React.Dispatch<React.SetStateAction<PreviaAcao>>;
  setSelectedLotes: React.Dispatch<React.SetStateAction<Set<string>>>;
  setShowBatchEsperaModal: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleApplyBatchStatusAcao({ batchCustomMotivo, batchEsperaMotivo, currentUser, fetchLotes, handleApplyBatchStatus, selectedLotes, setBatchStatusValue, setIsBatchUpdating, setPreviaAcao, setSelectedLotes, setShowBatchEsperaModal, showToast }: handleApplyBatchStatusAcaoCtx, statusValue: string, motivoOverride?: string | null, resetConfirmado = false, motivoReset = '') {
    if (!statusValue) return;
    if (statusValue === 'Em Espera' && motivoOverride === undefined) {
      setShowBatchEsperaModal(true);
      return;
    }

    const loteNumbers = Array.from(selectedLotes);
    if (loteNumbers.length === 0) return;

    setIsBatchUpdating(true);
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
    const finalStatus = statusValue === '__RESET__' ? null : statusValue;
    const option = STATUS_OPTIONS.find(o => o.value === finalStatus);
    const category = option ? option.category : null;
    const finalMotivo = statusValue === 'Em Espera'
      ? (motivoOverride || (batchEsperaMotivo === 'Outro' ? batchCustomMotivo : batchEsperaMotivo))
      : null;

    try {
      // Reset em lote apaga a linha de cada lote: prévia do servidor primeiro, depois confirma
      const url = finalStatus ? '/api/administrativo/lote-status/batch' : `/api/administrativo/lote-status/batch?confirmar=${resetConfirmado}${resetConfirmado ? `&motivo=${encodeURIComponent(motivoReset)}` : ''}`;
      const resp = await apiJson<{ resultado?: StatusApagadoPrevia[] }>(url, {
        method: 'POST',
        body: JSON.stringify({
          loteNumbers,
          customStatus: finalStatus,
          category,
          motivoEspera: finalMotivo,
        })
      });
      if (!finalStatus && !resetConfirmado) {
        const apagados = resp.resultado ?? [];
        if (apagados.length === 0) {
          showToast('Nenhum dos lotes selecionados tem status gravado para redefinir.');
        } else {
          setPreviaAcao({
            titulo: 'Redefinir status dos lotes',
            linhas: apagados.map(statusApagadoParaLinha),
            avisos: ['O status, a categoria e o motivo de espera gravados serão apagados (fica registrado no histórico de cada lote).'],
            confirmarRotulo: `Redefinir ${apagados.length} lote(s)`,
            pedirMotivo: true,
            executar: async (motivo) => { await handleApplyBatchStatus(statusValue, motivoOverride, true, motivo ?? ''); },
          });
        }
        return;
      }

      showToast(`${loteNumbers.length} lote(s) atualizado(s) para "${finalStatus || 'Padrão'}".`);
      setSelectedLotes(new Set());
      setBatchStatusValue('');
      fetchLotes();
    } catch (e: any) {
      console.error("Erro ao aplicar status em lote:", e);
      showToast("Falha ao atualizar status dos lotes: " + (e?.message || e), "error");
    } finally {
      setIsBatchUpdating(false);
      setShowBatchEsperaModal(false);
    }
  }
