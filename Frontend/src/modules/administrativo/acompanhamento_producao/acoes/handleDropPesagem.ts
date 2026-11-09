import React from 'react';
import { formatDateOnly } from '../lib/datas';
import type { AcompanhamentoLote } from '../lib/tipos';
import type { AuthUser } from '../../../geral/lib/auth';

export interface handleDropPesagemAcaoCtx {
  currentUser: AuthUser;
  fetchLotes: () => Promise<void>;
  pesagemSelectedDate: string;
  saveEtapaStatus: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase', status: string, motivoEspera?: string | null, insumoFaltanteCodigo?: string | null, insumoFaltanteDescricao?: string | null, updatedBy?: string, dataAgendada?: string | null) => Promise<void>;
  setDragCardInfo: React.Dispatch<React.SetStateAction<{ board: 'envase' | 'rotulagem' | 'pesagem' | 'producao'; source: string; id?: number | string; loteNumber: string; productCode?: string; index?: number; linha?: 'Linha 1' | 'Linha 2' | 'Linha 3'; tipo?: 'MAQUINA' | 'MANUAL'; }>>;
  setDragOverTarget: React.Dispatch<React.SetStateAction<string>>;
  setPesagemConcluidosLotes: (u: string[] | ((prev: string[]) => string[])) => void;
  setPesagemOrderOverrides: (u: string[] | ((prev: string[]) => string[])) => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
  sortedLotesPesando: AcompanhamentoLote[];
}

export async function handleDropPesagemAcao({ currentUser, fetchLotes, pesagemSelectedDate, saveEtapaStatus, setDragCardInfo, setDragOverTarget, setPesagemConcluidosLotes, setPesagemOrderOverrides, showToast, sortedLotesPesando }: handleDropPesagemAcaoCtx, e: React.DragEvent, targetLocation: 'ativa' | 'fila', targetIndex?: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;
    try {
      const data = JSON.parse(rawData);
      if (data.board !== 'pesagem') return;
      const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
      if (data.source === 'fila' && targetLocation === 'ativa') {
        const targetDate = pesagemSelectedDate || new Date().toISOString().split('T')[0];
        setPesagemOrderOverrides(prev => {
          if (prev.includes(data.loteNumber)) return prev;
          const next = [...prev, data.loteNumber];
          return next;
        });
        setPesagemConcluidosLotes(prev => {
          const next = prev.filter(x => x !== data.loteNumber);
          return next;
        });
        await saveEtapaStatus(data.loteNumber, 'pesagem', 'ativo', null, null, null, responsibleName, targetDate);
        await fetchLotes();
        showToast(`Lote #${data.loteNumber} iniciado na Pesagem em ${formatDateOnly(targetDate)}!`);
      } else if (data.source === 'ativa' && targetLocation === 'fila') {
        setPesagemOrderOverrides(prev => {
          const next = prev.filter(x => x !== data.loteNumber);
          return next;
        });
        setPesagemConcluidosLotes(prev => {
          const next = prev.filter(x => x !== data.loteNumber);
          return next;
        });
        await saveEtapaStatus(data.loteNumber, 'pesagem', 'fila', null, null, null, responsibleName);
        showToast(`Lote #${data.loteNumber} retornado para a fila de Pesagem.`);
      } else if (data.source === 'ativa' && targetLocation === 'ativa' && data.index !== undefined && targetIndex !== undefined && data.index !== targetIndex) {
        const currentList = sortedLotesPesando.map(l => l.loteNumber);
        if (data.index >= 0 && data.index < currentList.length && targetIndex >= 0 && targetIndex < currentList.length) {
          const updated = [...currentList];
          const [moved] = updated.splice(data.index, 1);
          updated.splice(targetIndex, 0, moved);
          setPesagemOrderOverrides(updated);
        }
      }
    } catch (err) {
      console.error('Erro no drop de pesagem:', err);
    } finally {
      setDragCardInfo(null);
    }
  }
