import React from 'react';
import type { AcompanhamentoLote } from '../lib/tipos';
import type { AuthUser } from '/home/edson/Documentos/api/.claude/worktrees/producao-refator-acompanhamento-04ae88/Frontend/src/modules/geral/lib/auth';

export interface handleDropProducaoAcaoCtx {
  currentUser: AuthUser;
  filteredLotesReatoresNormais: AcompanhamentoLote[];
  handleToggleCaldeiraLote: (loteNumber: string) => Promise<void>;
  lotesComCaldeira: Set<string>;
  saveEtapaStatus: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase', status: string, motivoEspera?: string | null, insumoFaltanteCodigo?: string | null, insumoFaltanteDescricao?: string | null, updatedBy?: string, dataAgendada?: string | null) => Promise<void>;
  setDragCardInfo: React.Dispatch<React.SetStateAction<{ board: 'envase' | 'rotulagem' | 'pesagem' | 'producao'; source: string; id?: number | string; loteNumber: string; productCode?: string; index?: number; linha?: 'Linha 1' | 'Linha 2' | 'Linha 3'; tipo?: 'MAQUINA' | 'MANUAL'; }>>;
  setDragOverTarget: React.Dispatch<React.SetStateAction<string>>;
  setProducaoOrderOverrides: (u: string[] | ((prev: string[]) => string[])) => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleDropProducaoAcao({ currentUser, filteredLotesReatoresNormais, handleToggleCaldeiraLote, lotesComCaldeira, saveEtapaStatus, setDragCardInfo, setDragOverTarget, setProducaoOrderOverrides, showToast }: handleDropProducaoAcaoCtx, e: React.DragEvent, targetLocation: 'ativa' | 'fila' | 'caldeira', targetIndex?: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;
    try {
      const data = JSON.parse(rawData);
      if (data.board !== 'producao') return;
      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';

      if (targetLocation === 'caldeira') {
        if (data.source === 'fila') {
          await saveEtapaStatus(data.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
        }
        if (!lotesComCaldeira.has(data.loteNumber)) {
          await handleToggleCaldeiraLote(data.loteNumber);
        }
        showToast(`Lote #${data.loteNumber} alocado na Caldeira!`);
        return;
      }

      if (data.source === 'caldeira' && targetLocation === 'ativa') {
        if (lotesComCaldeira.has(data.loteNumber)) {
          await handleToggleCaldeiraLote(data.loteNumber);
        }
        await saveEtapaStatus(data.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
        showToast(`Lote #${data.loteNumber} retornado para os Reatores.`);
        return;
      }

      if (data.source === 'caldeira' && targetLocation === 'fila') {
        if (lotesComCaldeira.has(data.loteNumber)) {
          await handleToggleCaldeiraLote(data.loteNumber);
        }
        await saveEtapaStatus(data.loteNumber, 'producao', 'fila', null, null, null, responsibleName);
        showToast(`Lote #${data.loteNumber} retornado para a fila de Produção.`);
        return;
      }

      if (data.source === 'fila' && targetLocation === 'ativa') {
        await saveEtapaStatus(data.loteNumber, 'producao', 'ativo', null, null, null, responsibleName);
        showToast(`Lote #${data.loteNumber} iniciado na Fabricação!`);
      } else if (data.source === 'ativa' && targetLocation === 'fila') {
        await saveEtapaStatus(data.loteNumber, 'producao', 'fila', null, null, null, responsibleName);
        showToast(`Lote #${data.loteNumber} retornado para a fila de Produção.`);
      } else if (data.source === 'ativa' && targetLocation === 'ativa' && data.index !== undefined && targetIndex !== undefined && data.index !== targetIndex) {
        const currentList = filteredLotesReatoresNormais.map(l => l.loteNumber);
        if (data.index >= 0 && data.index < currentList.length && targetIndex >= 0 && targetIndex < currentList.length) {
          const updated = [...currentList];
          const [moved] = updated.splice(data.index, 1);
          updated.splice(targetIndex, 0, moved);
          setProducaoOrderOverrides(updated);
        }
      }
    } catch (err) {
      console.error('Erro no drop de producao:', err);
    } finally {
      setDragCardInfo(null);
    }
  }
