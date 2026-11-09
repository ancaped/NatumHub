import React from 'react';
import type { AcompanhamentoLote } from '../lib/tipos';
import { apiJson } from '../../../geral/lib/http';
import type { AuthUser } from '../../../geral/lib/auth';

export interface handleConfirmAddLoteAcaoCtx {
  addLoteModalTarget: 'pesagem' | 'producao' | 'rotulagem' | 'envase';
  currentUser: AuthUser;
  envaseSelectedDate: string;
  executeStatusUpdate: (loteNumber: string, newStatus: string, motivoEspera: string | null, resetConfirmado?: boolean, motivoReset?: string) => Promise<void>;
  fetchLotes: () => Promise<void>;
  pesagemSelectedDate: string;
  producaoSelectedDate: string;
  rotulagemSelectedDate: string;
  saveEtapaStatus: (loteNumber: string, etapa: 'pesagem' | 'producao' | 'rotulagem' | 'envase', status: string, motivoEspera?: string | null, insumoFaltanteCodigo?: string | null, insumoFaltanteDescricao?: string | null, updatedBy?: string, dataAgendada?: string | null) => Promise<void>;
  setAddLoteModalTarget: React.Dispatch<React.SetStateAction<'pesagem' | 'producao' | 'rotulagem' | 'envase'>>;
  setManualFilasAdicionados: (u: Record<'pesagem' | 'producao' | 'rotulagem', string[]> | ((prev: Record<'pesagem' | 'producao' | 'rotulagem', string[]>) => Record<'pesagem' | 'producao' | 'rotulagem', string[]>)) => void;
  setManualLiberadosEnvase: (u: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setPesagemConcluidosLotes: (u: string[] | ((prev: string[]) => string[])) => void;
  setProducaoConcluidosLotes: (u: string[] | ((prev: string[]) => string[])) => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

export async function handleConfirmAddLoteAcao({ addLoteModalTarget, currentUser, envaseSelectedDate, executeStatusUpdate, fetchLotes, pesagemSelectedDate, producaoSelectedDate, rotulagemSelectedDate, saveEtapaStatus, setAddLoteModalTarget, setManualFilasAdicionados, setManualLiberadosEnvase, setPesagemConcluidosLotes, setProducaoConcluidosLotes, showToast }: handleConfirmAddLoteAcaoCtx, lote: AcompanhamentoLote) {
    if (!addLoteModalTarget) return;
    const target = addLoteModalTarget;
    const cleanNum = (lote.loteNumber || '').trim().toLowerCase();
    const responsibleName = (currentUser?.displayName || (currentUser as any)?.display_name) || 'Operador';
    const targetDate = target === 'pesagem'
      ? (pesagemSelectedDate || new Date().toISOString().split('T')[0])
      : target === 'producao'
        ? (producaoSelectedDate || new Date().toISOString().split('T')[0])
        : target === 'rotulagem'
          ? (rotulagemSelectedDate || new Date().toISOString().split('T')[0])
          : (envaseSelectedDate || new Date().toISOString().split('T')[0]);

    try {
      if (target === 'envase') {
        setManualLiberadosEnvase(prev => {
          const next = new Set(prev);
          next.add(cleanNum);
          next.add(lote.loteNumber);
          return next;
        });

        // Se estava oculto no envase, restaura
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/restaurar-quadro`, {
          method: 'POST',
          body: JSON.stringify({ quadro: 'envase' })
        }).catch(() => {});

        // Atualiza customStatus para Liberado para Envase
        await executeStatusUpdate(lote.loteNumber, 'Liberado para Envase', null).catch(() => {});

        showToast(`✅ Lote #${lote.loteNumber} liberado para envase com sucesso!`, 'success');
      } else {
        setManualFilasAdicionados(prev => {
          const currentList = prev[target] || [];
          if (!currentList.includes(lote.loteNumber)) {
            const nextList = [...currentList, lote.loteNumber];
            const next = { ...prev, [target]: nextList };
            return next;
          }
          return prev;
        });

        if (target === 'pesagem') {
          setPesagemConcluidosLotes(prev => {
            const next = prev.filter(x => x !== lote.loteNumber);
            return next;
          });
          await saveEtapaStatus(lote.loteNumber, 'pesagem', 'fila', null, null, null, responsibleName, targetDate);
        } else if (target === 'producao') {
          setProducaoConcluidosLotes(prev => {
            const next = prev.filter(x => x !== lote.loteNumber);
            return next;
          });
          await saveEtapaStatus(lote.loteNumber, 'producao', 'fila', null, null, null, responsibleName, targetDate);
        } else if (target === 'rotulagem') {
          await saveEtapaStatus(lote.loteNumber, 'rotulagem', 'fila', null, null, null, responsibleName, targetDate);
        }

        // Se estava oculto nesse quadro, restaura
        await apiJson(`/api/administrativo/lote-status/${encodeURIComponent(lote.loteNumber)}/restaurar-quadro`, {
          method: 'POST',
          body: JSON.stringify({ quadro: target })
        }).catch(() => {});

        const targetLabel = target === 'pesagem' ? 'Pesagem' : target === 'producao' ? 'Produção' : 'Rotulagem';
        showToast(`✅ Lote #${lote.loteNumber} adicionado à Fila de ${targetLabel}!`, 'success');
      }

      await fetchLotes();
      setAddLoteModalTarget(null);
    } catch (e: any) {
      console.error("Erro ao adicionar lote à fila:", e);
      showToast(`Erro ao adicionar lote: ${e?.message || e}`, 'error');
    }
  }
