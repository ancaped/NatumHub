import React from 'react';
import { apiJson } from '../../../geral/lib/http';
import { getTodayIso } from '../lib/datas';
import type { AcompanhamentoLote, ProgramacaoEnvaseItem } from '../lib/tipos';
import type { AuthUser } from '../../../geral/lib/auth';

export interface handleConfirmEncaixeModalAcaoCtx {
  currentUser: AuthUser;
  encaixarModalLote: AcompanhamentoLote;
  envaseSelectedDate: string;
  fetchProgramacaoEnvase: (dateStr: string) => Promise<void>;
  modalEncaixeCategoria: string;
  modalEncaixeCor: string;
  modalEncaixeCustomCor: string;
  modalEncaixeIsColorido: boolean;
  modalEncaixeLinha: 'Linha 1' | 'Linha 2';
  modalEncaixeOrdem: number | '';
  programacaoEnvase: ProgramacaoEnvaseItem[];
  saveEtapaStatus: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase', status: string, motivoEspera?: string | null, insumoFaltanteCodigo?: string | null, insumoFaltanteDescricao?: string | null, updatedBy?: string, dataAgendada?: string | null) => Promise<void>;
  setEncaixarModalLote: React.Dispatch<React.SetStateAction<AcompanhamentoLote>>;
  setLotes: React.Dispatch<React.SetStateAction<AcompanhamentoLote[]>>;
  setSavingEncaixeModal: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleConfirmEncaixeModalAcao({ currentUser, encaixarModalLote, envaseSelectedDate, fetchProgramacaoEnvase, modalEncaixeCategoria, modalEncaixeCor, modalEncaixeCustomCor, modalEncaixeIsColorido, modalEncaixeLinha, modalEncaixeOrdem, programacaoEnvase, saveEtapaStatus, setEncaixarModalLote, setLotes, setSavingEncaixeModal, showToast }: handleConfirmEncaixeModalAcaoCtx) {
    if (!encaixarModalLote) return;
    setSavingEncaixeModal(true);
    const corFinal = modalEncaixeIsColorido
      ? (modalEncaixeCor === 'Outro' && modalEncaixeCustomCor.trim() ? modalEncaixeCustomCor.trim() : modalEncaixeCor)
      : 'Branco';

    const existing = programacaoEnvase.find(it => 
      (it.loteNumber || '').trim().toUpperCase() === (encaixarModalLote.loteNumber || '').trim().toUpperCase() &&
      (!it.productCode || !encaixarModalLote.productCode || (it.productCode || '').trim() === (encaixarModalLote.productCode || '').trim())
    );

    try {
      await apiJson('/api/administrativo/envase/programacao', {
        method: 'POST',
        body: JSON.stringify({
          id: existing && existing.id > 0 ? existing.id : undefined,
          dataProgramada: envaseSelectedDate,
          linha: modalEncaixeLinha,
          ordem: typeof modalEncaixeOrdem === 'number' && modalEncaixeOrdem > 0 ? modalEncaixeOrdem : undefined,
          loteNumber: encaixarModalLote.loteNumber,
          productCode: encaixarModalLote.productCode,
          productDescription: encaixarModalLote.productDescription,
          quantity: encaixarModalLote.quantity || 0,
          quantityKg: encaixarModalLote.quantityKg || 0,
          categoriaEnvase: modalEncaixeCategoria,
          isColorido: modalEncaixeIsColorido,
          cor: corFinal,
          statusEnvase: 'PROGRAMADO',
          createdBy: (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador',
        })
      });
      const targetDate = envaseSelectedDate || getTodayIso();
      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
      setLotes(prev => prev.map(l => l.loteNumber === encaixarModalLote.loteNumber ? { ...l, dataPrevisao: targetDate } : l));
      try {
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(encaixarModalLote.loteNumber)}/previsao`, {
          method: 'POST',
          body: JSON.stringify({
            dataPrevisao: targetDate,
            updatedBy: responsibleName,
            fornecedorTerceirizado: encaixarModalLote.fornecedorTerceirizado || null
          })
        });
      } catch (err) {
        console.warn('Erro ao sincronizar dataPrevisao no encaixe:', err);
      }
      saveEtapaStatus(encaixarModalLote.loteNumber, 'envase', 'ativo', null, null, null, responsibleName);
      showToast(`Lote #${encaixarModalLote.loteNumber} encaixado na ${modalEncaixeLinha} (${modalEncaixeCategoria} • ${corFinal})!`);
      setEncaixarModalLote(null);
      await fetchProgramacaoEnvase('TODOS');
    } catch (e: any) {
      console.error("Erro ao encaixar lote no quadro:", e);
      showToast("Falha ao encaixar lote: " + (e?.message || e), "error");
    } finally {
      setSavingEncaixeModal(false);
    }
  }
